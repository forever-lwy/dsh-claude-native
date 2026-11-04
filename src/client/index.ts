import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { providerRemoteInfo, getSettings, discoverModels, saveSettings } from '../provider-remote.js'
import { chatRemoteInfo, getChatOptions, setChatOptions } from '../chat-remote.js'
import { ProviderSettings, type ProviderSettingsFace } from './ProviderSettings.js'
import { NativeOptions, type NativeOptionsFace } from './NativeOptions.js'
import { blockWhileSaving } from './save-block.js'
import { chatEn, chatZh, en, zh } from './locales.js'
import { styles } from './styles.js'

export const name = 'dsh-claude-native-client'
export const inject = ['slots', 'locale', 'remote', 'conversation', 'modelDirectories', 'sessions']

export async function apply(ctx: Context): Promise<void> {
  const unmountChat = await ctx.remote.$mount(chatRemoteInfo)
  let unmountSettings: (() => void | Promise<void>) | undefined
  try {
    unmountSettings = await ctx.remote.$mount(providerRemoteInfo)
    ctx.effect(() => unmountChat, 'claude-native: chat remote schema')
    ctx.effect(() => unmountSettings!, 'claude-native: settings remote schema')
    ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'en', { ...en }), 'claude-native: English')
    ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'zh', { ...zh }), 'claude-native: Chinese')
    ctx.effect(() => ctx.locale.register('claudeNative', 'en', { ...chatEn }), 'claude-native: chat English')
    ctx.effect(() => ctx.locale.register('claudeNative', 'zh', { ...chatZh }), 'claude-native: chat Chinese')
    ctx.effect(() => {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-claude-native'
      style.textContent = styles
      document.head.appendChild(style)
      return () => style.remove()
    }, 'claude-native: styles')
    // $mount publishes separate Cordis namespace services; bind callbacks in their injected scope.
    ctx.inject(['remote.nativeClaudeChat', 'remote.nativeClaudeSettings'], remoteCtx => {
      remoteCtx.slots.inject('conversation.input.left', () => remoteCtx.slots.register({
        name: 'conversation.input.left', id: 'claude-native-options', order: 16, locale: 'claudeNative',
        inject: (sessionId): NativeOptionsFace => {
          const directory = remoteCtx.modelDirectories.directoryFor(sessionId)
          // Host and browser Context declarations share this build; bind the browser face explicitly.
          const sessions = remoteCtx.get('sessions') as unknown as ISessions
          const available = sessions.subagentAddress(sessionId) === undefined
          return {
            available, directory: directory.store,
            loadDirectory: () => { if (available) void directory.load().catch(() => { /* directory owns errors */ }) },
            read: (route, signal) => getChatOptions(remoteCtx.remote, { sessionId, ...route }, signal),
            save: (route, choices, expectedRevision, signal) => setChatOptions(remoteCtx.remote, { sessionId, ...route, choices, expectedRevision }, signal),
            beginSave: reason => blockWhileSaving(remoteCtx.conversation.blocks, sessionId, reason),
          }
        },
      }, NativeOptions))
      const face: ProviderSettingsFace = {
        read: signal => getSettings(remoteCtx.remote, signal),
        discover: (request, signal) => discoverModels(remoteCtx.remote, request, signal),
        save: (request, signal) => saveSettings(remoteCtx.remote, request, signal),
      }
      remoteCtx.slots.inject('settings.models.provider-card', () => remoteCtx.slots.register({
        name: 'settings.models.provider-card', key: 'dsh-claude-native', locale: 'claudeProviderSettings', inject: () => face,
      }, ProviderSettings))
    })
  } catch (error) {
    await unmountSettings?.()
    await unmountChat()
    throw error
  }
}

export { ProviderSettings, ProviderSettingsPage } from './ProviderSettings.js'
export type { ProviderSettingsFace } from './ProviderSettings.js'
export { NativeOptions, nativeOptionsVisible } from './NativeOptions.js'
export type { NativeOptionsFace, NativeOptionsState } from './NativeOptions.js'
