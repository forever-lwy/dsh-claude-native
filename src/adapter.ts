import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type Anthropic from '@anthropic-ai/sdk'
import {
  LlmAdapter, LlmError, ReasoningEffortId,
  type GenerateOptions, type LlmModelInfo, type LlmResolvedModelInfo, type PreparedAdapterCall, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import { CLAUDE_PROVIDER, type ClaudeModelConfig, type ClaudeProfile } from './config.js'
import { createClaudeClient, type ClientConstructor } from './client-factory.js'
import { claudeError } from './errors.js'
import { claudeImageTarget, isPdf, translateMessages } from './messages.js'
import { buildRequest, findModel, replayPolicy } from './request.js'
import { TurnAccumulator } from './stream.js'
import { restoreNativeFiles } from './file-scope.js'
import { latestChatChoices, usesNativeFiles } from './capabilities.js'
import { attachToolResults } from './native-file-tool.js'

export interface ClaudeAdapterOptions {
  profile: () => ClaudeProfile
  resolveApiKey: (profile: ClaudeProfile) => Promise<string | undefined>
  /** Dependency injection for offline protocol tests. */
  createClient?: ClientConstructor
}

/** A server-tool loop that hits its iteration limit pauses; resume it within the same dsh step. */
const MAX_PAUSE_CONTINUATIONS = 8

export class ClaudeNativeAdapter extends LlmAdapter {
  private readonly clients = new Map<string, Anthropic>()
  constructor(private readonly ctx: Context, private readonly options: ClaudeAdapterOptions) { super() }

  providerInfo(provider: string) { return { id: provider, name: 'Claude (Native)' } }

  private profile(provider: string): ClaudeProfile {
    if (provider !== CLAUDE_PROVIDER) throw new LlmError('未知的 Claude 供应商路由。', 'NO_ADAPTER')
    const profile = this.options.profile()
    if (!profile.enabled) throw new LlmError('Claude（原生）供应商已停用。', 'NO_ADAPTER')
    return profile
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider !== CLAUDE_PROVIDER) return []
    const profile = this.options.profile()
    return profile.enabled ? profile.models.map(model => modelInfo(model.id, model)) : []
  }

  async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    signal?.throwIfAborted()
    const profile = this.profile(provider)
    return modelInfo(model, findModel(profile, model))
  }

  imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget {
    return claudeImageTarget(image)
  }

  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    signal?.throwIfAborted()
    const profile = this.profile(provider)
    // Capture endpoint and key together; a later settings change must not mix generations.
    const client = await this.client(profile)
    signal?.throwIfAborted()
    return { model: modelInfo(model, findModel(profile, model)), stream: options => this.streamWith(profile, options, client) }
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWith(this.profile(options.provider), options)
  }

  /** The official SDK client for trusted host plugins (batches, token counting, files…). */
  async sdk(): Promise<Anthropic> { return this.client(this.profile(CLAUDE_PROVIDER)) }

  private async client(profile: ClaudeProfile): Promise<Anthropic> {
    const key = await this.options.resolveApiKey(profile)
    const identity = createHash('sha256').update(JSON.stringify([profile.baseURL, profile.authMode, profile.anthropicVersion, profile.timeoutMs, profile.headers, key ?? ''])).digest('hex')
    const existing = this.clients.get(identity)
    if (existing) return existing
    const client = createClaudeClient(profile, key, this.options.createClient)
    if (this.clients.size >= 8) this.clients.delete(this.clients.keys().next().value!)
    this.clients.set(identity, client)
    return client
  }

  private async *streamWith(profile: ClaudeProfile, projected: GenerateOptions, bound?: Anthropic): AsyncGenerator<StreamChunk> {
    const signal = projected.signal
    try {
      signal?.throwIfAborted()
      const model = findModel(profile, projected.model)
      const inputTypes = model?.inputTypes
      const pdf = inputTypes === undefined || inputTypes.includes('pdf')
      // The newest human prompt's stamp decides this turn's switches; each file keeps its own prompt's mode.
      const choices = latestChatChoices(projected)
      const attached = attachToolResults(projected)
      const options = pdf ? restoreNativeFiles(projected, (block, source) => block.type === 'file' && isPdf(block.attachment)
        && (source.role === 'tool' && attached.has(source.toolCallId) || usesNativeFiles(source, projected))) : projected
      const client = bound ?? await this.client(profile)
      const conversation = await translateMessages(options, {
        attachments: this.ctx.get('attachments'), inputTypes, policy: replayPolicy(profile, model, choices),
      })
      const { params } = buildRequest(profile, options, conversation, choices)
      const turn = new TurnAccumulator(options)
      const continued: Anthropic.Beta.BetaContentBlock[] = []
      let outcome
      for (let attempt = 0; ; attempt++) {
        const request = continued.length
          ? { ...params, messages: [...params.messages, { role: 'assistant' as const, content: structuredClone(continued) as Anthropic.Beta.BetaContentBlockParam[] }] }
          : params
        const stream = await client.beta.messages.create(request, { signal })
        outcome = yield* turn.consume(stream, signal)
        if (outcome.stopReason !== 'pause_turn') break
        if (attempt >= MAX_PAUSE_CONTINUATIONS) throw new LlmError('Claude 服务端工具连续暂停次数过多。', 'INCOMPLETE_RESPONSE')
        continued.push(...outcome.natives)
      }
      yield* turn.finish(outcome.stopDetails)
    } catch (error) { throw claudeError(error, signal) }
  }
}

export function modelInfo(id: string, model: ClaudeModelConfig | undefined): LlmResolvedModelInfo {
  const inputs = model?.inputTypes ?? ['text', 'image', 'pdf']
  return {
    provider: CLAUDE_PROVIDER, id, name: model?.name ?? id,
    inputModalities: inputs.includes('image') ? ['text', 'image'] : ['text'],
    ...(model?.contextWindow ? { context: { contextWindow: model.contextWindow } } : {}),
    ...(model?.maxTokens ? { defaultMaxTokens: model.maxTokens } : {}),
    ...(model?.efforts?.length ? { reasoning: {
      efforts: model.efforts.map(effort => ({ id: ReasoningEffortId(effort.id), name: effort.name })),
      ...(model.defaultEffort ? { defaultEffort: ReasoningEffortId(model.defaultEffort) } : {}),
    } } : {}),
  }
}
