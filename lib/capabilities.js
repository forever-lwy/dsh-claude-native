import { LlmError } from '@deepseek-ai/dsh-llm';
import { CHAT_KEYS, NO_CHOICES, chatSourceSchema } from './chat-remote.js';
/** What the composer may offer for one model; nothing is guessed beyond its declared inputs and web tools. */
export function resolveCapabilities(model) {
    if (!model)
        return { ...NO_CHOICES };
    const inputs = model.inputTypes ?? ['text', 'image', 'pdf'];
    const web = model.webTools !== undefined && model.webTools !== 'none';
    return { nativeFiles: inputs.includes('pdf') || inputs.includes('image'), webSearch: web, webFetch: web };
}
/** Provider settings are the defaults a conversation starts from. */
export function defaultChoices(profile, model) {
    const capabilities = resolveCapabilities(model);
    return {
        nativeFiles: capabilities.nativeFiles,
        webSearch: capabilities.webSearch && profile.webSearch.enabled,
        webFetch: capabilities.webFetch && profile.webFetch.enabled,
    };
}
export function unsupportedChoices(capabilities, choices) {
    return CHAT_KEYS.filter(key => choices[key] && !capabilities[key]);
}
function recordedChoices(source, provider, model) {
    if (typeof source !== 'object' || source === null || !('claudeNative' in source))
        return undefined;
    const parsed = chatSourceSchema.safeParse(source.claudeNative);
    if (!parsed.success)
        throw new LlmError('已记录的 Claude 原生选项无效，无法安全构建请求。', 'INVALID_NATIVE_OPTIONS');
    // A prompt stamped while this model was not configured grants nothing.
    return parsed.data.selections.find(item => item.provider === provider && item.model === model)?.choices ?? { ...NO_CHOICES };
}
/** The newest human prompt owns this turn; an older prompt's switches are never carried forward. */
export function latestChatChoices(options) {
    if (options.purpose !== undefined)
        return undefined;
    for (let index = options.messages.length - 1; index >= 0; index--) {
        const message = options.messages[index];
        if (message.role !== 'user')
            continue;
        if (message.source !== undefined && message.source.kind !== 'user')
            continue;
        return recordedChoices(message.source, options.provider, options.model);
    }
    return undefined;
}
/** Upload mode belongs to the originating prompt, including after resume or a later toggle. Unstamped history stays native. */
export function usesNativeFiles(message, options) {
    return recordedChoices(message.source, options.provider, options.model)?.nativeFiles
        ?? latestChatChoices(options)?.nativeFiles ?? true;
}
