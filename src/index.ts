import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-attachment'
import { CLAUDE_PROVIDER, Config, DEFAULT_BASE_URL, profileOf } from './config.js'
import { ClaudeNativeAdapter } from './adapter.js'
import { createClaudeClient, resolveClaudeApiKey } from './client-factory.js'
import { discoverClaudeModels } from './discovery.js'
import { registerNativeFileBridge } from './file-scope.js'
import { registerClaudeSettings } from './provider-settings.js'
import { ClaudeNativeService } from './service.js'
import { registerClaudeChatControls, type ClaudeChatControls } from './chat-controls.js'
import { registerNativeFileTool } from './native-file-tool.js'

export { Config, CLAUDE_PROVIDER, DEFAULT_MODELS, MODEL_PRESETS, defaultProfile, presetModel, profileOf, validateProfile } from './config.js'
export type { ClaudeEffortOption, ClaudeModelConfig, ClaudeProfile, ClaudeProfileOptions } from './config.js'
export { ClaudeNativeAdapter } from './adapter.js'
export { ClaudeNativeService } from './service.js'
export { CLAUDE_NATIVE_FILE_TOOL } from './native-file-tool.js'
export type { ClaudeChatChoices } from './chat-remote.js'

export const name = 'dsh-claude-native'
export const inject = ['llm', 'attachments']

export function apply(ctx: Context, config: Config): void {
  const profile = () => profileOf(config)
  profile()
  const adapter = new ClaudeNativeAdapter(ctx, { profile, resolveApiKey: current => resolveClaudeApiKey(ctx, current) })
  // The route stays owned while disabled; the adapter then lists no models and refuses dispatch.
  const registration = ctx.llm.registerAdapter([CLAUDE_PROVIDER], adapter)
  const settingsNs = ctx.fiber.entry?.options.id ?? name
  ctx.llm.registerConfigurableProviders([{
    provider: CLAUDE_PROVIDER, displayName: 'Claude（原生）', settingsNs, settingsPath: ['claude'],
    defaultBaseURL: DEFAULT_BASE_URL, nativeAuth: { env: ['ANTHROPIC_API_KEY'], oauth: false },
  }])
  registerNativeFileBridge(ctx)
  new ClaudeNativeService(ctx, adapter)
  let controls: ClaudeChatControls | undefined
  ctx.inject(['sessionProjections', 'sessionController', 'sessions', 'typert'], chatCtx => {
    controls = registerClaudeChatControls(chatCtx, profile)
    chatCtx.effect(() => () => { controls = undefined })
  })
  ctx.inject(['tools', 'fs', 'workingDirectory', 'systemPrompt'], toolCtx => {
    registerNativeFileTool(toolCtx, { profile, choices: (session, model) => controls?.choicesFor(session, model) })
  })
  ctx.inject(['settings', 'typert', 'credentials'], settingsCtx => {
    registerClaudeSettings(settingsCtx, {
      settingsNs, profile,
      discover: (draft, key, signal) => discoverClaudeModels(createClaudeClient(draft, key), signal),
    })
  })
  ctx.on('loader/volatile-update', () => {
    // rc.5 has no llm/models-updated event; replacing the routes emits adapters-updated.
    registration.replace([CLAUDE_PROVIDER])
  })
}
