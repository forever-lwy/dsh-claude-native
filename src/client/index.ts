import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { providerRemoteInfo, getSettings, discoverModels, saveSettings } from '../provider-remote.js'
import { ProviderSettings, type ProviderSettingsFace } from './ProviderSettings.js'
import { en, zh } from './locales.js'
import { styles } from './styles.js'

export const name = 'dsh-claude-native-client'
export const inject = ['slots', 'locale', 'remote']

export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(providerRemoteInfo)
  ctx.effect(() => unmount, 'claude-native: settings remote schema')
  ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'en', { ...en }), 'claude-native: English')
  ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'zh', { ...zh }), 'claude-native: Chinese')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-claude-native'
    style.textContent = styles
    document.head.appendChild(style)
    return () => style.remove()
  }, 'claude-native: styles')
  // $mount publishes a separate Cordis namespace service; bind callbacks in its injected scope.
  ctx.inject(['remote.nativeClaudeSettings'], remoteCtx => {
    const face: ProviderSettingsFace = {
      read: signal => getSettings(remoteCtx.remote, signal),
      discover: (request, signal) => discoverModels(remoteCtx.remote, request, signal),
      save: (request, signal) => saveSettings(remoteCtx.remote, request, signal),
    }
    remoteCtx.slots.inject('settings.models.provider-card', () => remoteCtx.slots.register({
      name: 'settings.models.provider-card', key: 'dsh-claude-native', locale: 'claudeProviderSettings', inject: () => face,
    }, ProviderSettings))
  })
}

export { ProviderSettings, ProviderSettingsPage } from './ProviderSettings.js'
export type { ProviderSettingsFace } from './ProviderSettings.js'
