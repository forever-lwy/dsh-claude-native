import { createHash } from 'node:crypto';
import { LlmAdapter, LlmError, ReasoningEffortId, resolveRetryPolicy, } from '@deepseek-ai/dsh-llm';
import { CLAUDE_PROVIDER } from './config.js';
import { createClaudeClient } from './client-factory.js';
import { claudeError } from './errors.js';
import { claudeImageTarget, isPdf, translateMessages } from './messages.js';
import { buildRequest, findModel, replayPolicy, selectedEffort } from './request.js';
import { TurnAccumulator } from './stream.js';
import { restoreNativeFiles } from './file-scope.js';
import { latestChatChoices, usesNativeFiles } from './capabilities.js';
import { attachToolResults } from './native-file-tool.js';
/** A server-tool loop that hits its iteration limit pauses; resume it within the same dsh step. */
const MAX_PAUSE_CONTINUATIONS = 8;
export class ClaudeNativeAdapter extends LlmAdapter {
    ctx;
    options;
    clients = new Map();
    constructor(ctx, options) {
        super();
        this.ctx = ctx;
        this.options = options;
    }
    providerInfo(provider) { return { id: provider, name: 'Claude (Native)' }; }
    providerRetryPolicy(provider) {
        return resolveRetryPolicy(provider === CLAUDE_PROVIDER ? this.options.profile().retryPolicy : undefined, 'claude-native: retryPolicy');
    }
    profile(provider) {
        if (provider !== CLAUDE_PROVIDER)
            throw new LlmError('未知的 Claude 供应商路由。', 'NO_ADAPTER');
        const profile = this.options.profile();
        if (!profile.enabled)
            throw new LlmError('Claude（原生）供应商已停用。', 'NO_ADAPTER');
        return profile;
    }
    async listModels(provider) {
        if (provider !== CLAUDE_PROVIDER)
            return [];
        const profile = this.options.profile();
        return profile.enabled ? profile.models.map(model => modelInfo(model.id, model)) : [];
    }
    async resolveModel(provider, model, signal) {
        signal?.throwIfAborted();
        const profile = this.profile(provider);
        return modelInfo(model, findModel(profile, model));
    }
    imageRequestTarget(_provider, _model, image) {
        return claudeImageTarget(image);
    }
    async prepareCall(provider, model, signal) {
        signal?.throwIfAborted();
        const profile = this.profile(provider);
        // Capture endpoint and key together; a later settings change must not mix generations.
        const client = await this.client(profile);
        signal?.throwIfAborted();
        return { model: modelInfo(model, findModel(profile, model)), stream: options => this.streamWith(profile, options, client) };
    }
    stream(options) {
        return this.streamWith(this.profile(options.provider), options);
    }
    /** The official SDK client for trusted host plugins (batches, token counting, files…). */
    async sdk() { return this.client(this.profile(CLAUDE_PROVIDER)); }
    async client(profile) {
        const key = await this.options.resolveApiKey(profile);
        const identity = createHash('sha256').update(JSON.stringify([profile.baseURL, profile.authMode, profile.anthropicVersion, profile.timeoutMs, profile.headers, key ?? ''])).digest('hex');
        const existing = this.clients.get(identity);
        if (existing)
            return existing;
        const client = createClaudeClient(profile, key, this.options.createClient);
        if (this.clients.size >= 8)
            this.clients.delete(this.clients.keys().next().value);
        this.clients.set(identity, client);
        return client;
    }
    async *streamWith(profile, projected, bound) {
        const signal = projected.signal;
        try {
            signal?.throwIfAborted();
            const model = findModel(profile, projected.model);
            const inputTypes = model?.inputTypes;
            const pdf = inputTypes === undefined || inputTypes.includes('pdf');
            // The newest human prompt's stamp decides this turn's switches; each file keeps its own prompt's mode.
            const choices = latestChatChoices(projected);
            const attached = attachToolResults(projected);
            const options = pdf ? restoreNativeFiles(projected, (block, source) => block.type === 'file' && isPdf(block.attachment)
                && (source.role === 'tool' && attached.has(source.toolCallId) || usesNativeFiles(source, projected))) : projected;
            const client = bound ?? await this.client(profile);
            const effort = selectedEffort(model, options.reasoningEffort);
            const rawThinking = (model?.extraBody?.thinking ?? profile.extraBody.thinking);
            const manualThinking = effort?.thinking === 'enabled' || ((!effort || effort.thinking === 'omit') && rawThinking?.type === 'enabled');
            const conversation = await translateMessages(options, {
                attachments: this.ctx.get('attachments'), inputTypes, policy: replayPolicy(profile, model, choices), manualThinking,
            });
            const { params } = buildRequest(profile, options, conversation, choices);
            const turn = new TurnAccumulator(options);
            const continued = [];
            let outcome;
            for (let attempt = 0;; attempt++) {
                const request = continued.length
                    ? { ...params, messages: [...params.messages, { role: 'assistant', content: structuredClone(continued) }] }
                    : params;
                const stream = await client.beta.messages.create(request, { signal });
                outcome = yield* turn.consume(stream, signal);
                if (outcome.stopReason !== 'pause_turn')
                    break;
                if (attempt >= MAX_PAUSE_CONTINUATIONS)
                    throw LlmError.fromFailure({ message: 'Claude 服务端工具连续暂停次数过多。', code: 'INCOMPLETE_RESPONSE' });
                continued.push(...outcome.natives);
            }
            yield* turn.finish(outcome.stopDetails);
        }
        catch (error) {
            throw claudeError(error, signal);
        }
    }
}
export function modelInfo(id, model) {
    const inputs = model?.inputTypes ?? ['text', 'image', 'pdf'];
    return {
        provider: CLAUDE_PROVIDER, id, name: model?.name ?? id,
        inputModalities: inputs.includes('image') ? ['text', 'image'] : ['text'],
        ...(model?.contextWindow ? { context: { contextWindow: model.contextWindow } } : {}),
        ...(model?.maxTokens ? { defaultMaxTokens: model.maxTokens } : {}),
        ...(model?.efforts?.length ? { reasoning: {
                efforts: model.efforts.map(effort => ({ id: ReasoningEffortId(effort.id), name: effort.name })),
                ...(model.defaultEffort ? { defaultEffort: ReasoningEffortId(model.defaultEffort) } : {}),
            } } : {}),
    };
}
