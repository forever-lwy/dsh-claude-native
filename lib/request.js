import { LlmError } from '@deepseek-ai/dsh-llm';
import { isOfficialEndpoint } from './config.js';
import { markCacheBreakpoint } from './messages.js';
export const THINKING_UPDATES_BETA = 'thinking-display-updates-2026-08-18';
export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const DEFAULT_MAX_TOKENS = 32_000;
const WEB_TOOL_TYPES = {
    dynamic: { web_search: 'web_search_20260209', web_fetch: 'web_fetch_20260209' },
    basic: { web_search: 'web_search_20250305', web_fetch: 'web_fetch_20250910' },
};
export function findModel(profile, id) {
    return profile.models.find(model => model.id === id);
}
export function selectedEffort(model, requested) {
    const id = requested ?? model?.defaultEffort;
    if (id === undefined)
        return undefined;
    const option = model?.efforts?.find(item => item.id === id);
    if (!option)
        throw new LlmError(`模型 ${model?.id ?? ''} 未声明思考档位“${id}”。`, 'UNSUPPORTED_REASONING_EFFORT');
    return option;
}
/** Conversation switches override the provider defaults; a model without web tools never gets them. */
function webEnabled(profile, model, choices) {
    const available = (model?.webTools ?? 'none') !== 'none';
    return {
        web_search: available && (choices ? choices.webSearch : profile.webSearch.enabled),
        web_fetch: available && (choices ? choices.webFetch : profile.webFetch.enabled),
    };
}
/** Which server tools this request declares; replayed history may only echo their blocks. */
export function replayPolicy(profile, model, choices) {
    const enabled = webEnabled(profile, model, choices);
    return { serverTools: new Set(Object.keys(enabled).filter(key => enabled[key])), fallbacks: fallbacksEnabled(profile, model) };
}
export function fallbacksEnabled(profile, model) {
    if (profile.refusalFallback === 'off')
        return false;
    if (profile.refusalFallback === 'on')
        return true;
    return model?.fallback === true && isOfficialEndpoint(profile);
}
function serverTools(profile, model, choices) {
    const generation = model?.webTools ?? 'none';
    if (generation === 'none')
        return [];
    const types = WEB_TOOL_TYPES[generation];
    const enabled = webEnabled(profile, model, choices);
    const tools = [];
    if (enabled.web_search)
        tools.push({ type: types.web_search, name: 'web_search',
            ...(profile.webSearch.maxUses ? { max_uses: profile.webSearch.maxUses } : {}) });
    if (enabled.web_fetch)
        tools.push({ type: types.web_fetch, name: 'web_fetch',
            ...(profile.webFetch.maxUses ? { max_uses: profile.webFetch.maxUses } : {}) });
    return tools;
}
export function buildRequest(profile, options, conversation, choices) {
    const model = findModel(profile, options.model);
    const option = selectedEffort(model, options.reasoningEffort);
    if (options.stop?.some(stop => !stop.trim()))
        throw new LlmError('停止序列不得为空白。', 'UNSUPPORTED_OPTION');
    const betas = new Set([...profile.betas, ...model?.betas ?? []]);
    const cacheControl = profile.cache.enabled
        ? { type: 'ephemeral', ...(profile.cache.ttl === '1h' ? { ttl: '1h' } : {}) } : undefined;
    let maxTokens = options.maxTokens ?? model?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const params = {
        ...structuredClone(profile.extraBody),
        ...structuredClone(model?.extraBody ?? {}),
        model: options.model,
        max_tokens: maxTokens,
        messages: conversation.messages,
        stream: true,
    };
    const display = model?.thinkingDisplay;
    const thinkingOn = option !== undefined && ['adaptive', 'enabled', 'omit'].includes(option.thinking);
    if (option) {
        if (option.thinking === 'adaptive')
            params.thinking = { type: 'adaptive', ...(display ? { display } : {}) };
        else if (option.thinking === 'enabled') {
            const budget = option.budgetTokens;
            // budget_tokens must stay below max_tokens; grow the cap rather than silently shrink the budget.
            if (maxTokens <= budget)
                maxTokens = params.max_tokens = budget + Math.min(8192, Math.max(1024, budget));
            // Progress updates exist only for adaptive thinking.
            params.thinking = { type: 'enabled', budget_tokens: budget, ...(display && display !== 'updates' ? { display } : {}) };
        }
        else if (option.thinking === 'disabled')
            params.thinking = { type: 'disabled' };
        else if (option.thinking === 'between_tools')
            params.thinking = { type: 'between_tools' };
        if (option.effort)
            params.output_config = { ...params.output_config, effort: option.effort };
        if (option.thinking === 'adaptive' && display === 'updates')
            betas.add(THINKING_UPDATES_BETA);
    }
    // Sampling is rejected with thinking on, and on every current model; forward it only where declared.
    if (options.temperature !== undefined && model?.sampling && !thinkingOn)
        params.temperature = options.temperature;
    if (options.stop?.length)
        params.stop_sequences = [...options.stop];
    const system = conversation.system.map(block => ({ ...block }));
    if (system.length) {
        if (cacheControl)
            system.at(-1).cache_control = cacheControl;
        params.system = system;
    }
    const tools = (options.tools ?? []).map(tool => ({
        name: tool.name, description: tool.description,
        // Core sends the complete tool list (no in-history tool updates), so nothing is deferred.
        input_schema: { type: 'object', ...structuredClone(tool.parameters) },
    }));
    tools.push(...serverTools(profile, model, choices));
    if (tools.length) {
        if (cacheControl) {
            tools.at(-1).cache_control = cacheControl;
        }
        params.tools = tools;
    }
    if (cacheControl) {
        // Tail breakpoint caches this request; the previous user turn keeps a hit
        // within the 20-block lookback when a step appends many tool results.
        const messages = conversation.messages;
        if (messages.length)
            markCacheBreakpoint(messages.at(-1).content, cacheControl);
        for (let index = messages.length - 2; index >= 0; index--) {
            if (messages[index].role === 'user') {
                markCacheBreakpoint(messages[index].content, cacheControl);
                break;
            }
        }
    }
    if (fallbacksEnabled(profile, model) && params.fallbacks === undefined) {
        params.fallbacks = 'default';
        betas.add(SERVER_FALLBACK_BETA);
    }
    if (betas.size)
        params.betas = [...betas];
    return { params, thinkingOn };
}
