import { LlmError, type GenerateOptions, type RequestMessage } from '@deepseek-ai/dsh-llm'
import type { ClaudeModelConfig, ClaudeProfile } from './config.js'
import { CHAT_KEYS, NO_CHOICES, chatSourceSchema, type ClaudeChatChoices } from './chat-remote.js'

/** What the composer may offer for one model; nothing is guessed beyond its declared inputs and web tools. */
export function resolveCapabilities(model: ClaudeModelConfig | undefined): ClaudeChatChoices {
  if (!model) return { ...NO_CHOICES }
  const inputs = model.inputTypes ?? ['text', 'image', 'pdf']
  const web = model.webTools !== undefined && model.webTools !== 'none'
  return { nativeFiles: inputs.includes('pdf') || inputs.includes('image'), webSearch: web, webFetch: web }
}

/** Provider settings are the defaults a conversation starts from. */
export function defaultChoices(profile: ClaudeProfile, model: ClaudeModelConfig | undefined): ClaudeChatChoices {
  const capabilities = resolveCapabilities(model)
  return {
    nativeFiles: capabilities.nativeFiles,
    webSearch: capabilities.webSearch && profile.webSearch.enabled,
    webFetch: capabilities.webFetch && profile.webFetch.enabled,
  }
}

export function unsupportedChoices(capabilities: ClaudeChatChoices, choices: ClaudeChatChoices): string[] {
  return CHAT_KEYS.filter(key => choices[key] && !capabilities[key])
}

function recordedChoices(source: unknown, provider: string, model: string): ClaudeChatChoices | undefined {
  if (typeof source !== 'object' || source === null || !('claudeNative' in source)) return undefined
  const parsed = chatSourceSchema.safeParse(source.claudeNative)
  if (!parsed.success) throw LlmError.fromFailure({ message: '已记录的 Claude 原生选项无效，无法安全构建请求。', code: 'INVALID_NATIVE_OPTIONS' })
  // A prompt stamped while this model was not configured grants nothing.
  return parsed.data.selections.find(item => item.provider === provider && item.model === model)?.choices ?? { ...NO_CHOICES }
}

/** The newest human prompt owns this turn; an older prompt's switches are never carried forward. */
export function latestChatChoices(options: GenerateOptions): ClaudeChatChoices | undefined {
  if (options.purpose !== undefined) return undefined
  for (let index = options.messages.length - 1; index >= 0; index--) {
    const message = options.messages[index]
    if (message.role !== 'user') continue
    if (message.source !== undefined && message.source.kind !== 'user') continue
    return recordedChoices(message.source, options.provider, options.model)
  }
  return undefined
}

/** Upload mode belongs to the originating prompt, including after resume or a later toggle. Unstamped history stays native. */
export function usesNativeFiles(message: RequestMessage, options: GenerateOptions): boolean {
  return recordedChoices(message.source, options.provider, options.model)?.nativeFiles
    ?? latestChatChoices(options)?.nativeFiles ?? true
}
