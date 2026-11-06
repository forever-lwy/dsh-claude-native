import { providerRemoteInfo, getSettings, discoverModels, saveSettings } from '../provider-remote.js';
import { chatRemoteInfo, getChatOptions, setChatOptions } from '../chat-remote.js';
import { ProviderSettings } from './ProviderSettings.js';
import { NativeOptions } from './NativeOptions.js';
import { blockWhileSaving } from './save-block.js';
import { chatEn, chatZh, en, zh } from './locales.js';
import { styles } from './styles.js';
export const name = 'dsh-claude-native-client';
export const inject = ['slots', 'locale', 'remote', 'conversation', 'modelDirectories', 'sessions'];
export async function apply(ctx) {
    const unmountChat = await ctx.remote.$mount(chatRemoteInfo);
    let unmountSettings;
    try {
        unmountSettings = await ctx.remote.$mount(providerRemoteInfo);
        ctx.effect(() => unmountChat, 'claude-native: chat remote schema');
        ctx.effect(() => unmountSettings, 'claude-native: settings remote schema');
        ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'en', { ...en }), 'claude-native: English');
        ctx.effect(() => ctx.locale.register('claudeProviderSettings', 'zh', { ...zh }), 'claude-native: Chinese');
        ctx.effect(() => ctx.locale.register('claudeNative', 'en', { ...chatEn }), 'claude-native: chat English');
        ctx.effect(() => ctx.locale.register('claudeNative', 'zh', { ...chatZh }), 'claude-native: chat Chinese');
        ctx.effect(() => {
            const style = document.createElement('style');
            style.dataset.plugin = 'dsh-claude-native';
            style.textContent = styles;
            document.head.appendChild(style);
            return () => style.remove();
        }, 'claude-native: styles');
        // $mount publishes separate Cordis namespace services; bind callbacks in their injected scope.
        ctx.inject(['remote.nativeClaudeChat', 'remote.nativeClaudeSettings'], remoteCtx => {
            remoteCtx.slots.inject('conversation.input.left', () => remoteCtx.slots.register({
                name: 'conversation.input.left', id: 'claude-native-options', order: 16, locale: 'claudeNative',
                inject: (sessionId) => {
                    const directory = remoteCtx.modelDirectories.directoryFor(sessionId);
                    // Host and browser Context declarations share this build; bind the browser face explicitly.
                    const sessions = remoteCtx.get('sessions');
                    const available = sessions.subagentAddress(sessionId) === undefined;
                    return {
                        available, directory: directory.store,
                        loadDirectory: () => { if (available)
                            void directory.load().catch(() => { }); },
                        read: (route, signal) => getChatOptions(remoteCtx.remote, { sessionId, ...route }, signal),
                        save: (route, choices, expectedRevision, signal) => setChatOptions(remoteCtx.remote, { sessionId, ...route, choices, expectedRevision }, signal),
                        beginSave: reason => blockWhileSaving(remoteCtx.conversation.blocks, sessionId, reason),
                    };
                },
            }, NativeOptions));
            const face = {
                read: signal => getSettings(remoteCtx.remote, signal),
                discover: (request, signal) => discoverModels(remoteCtx.remote, request, signal),
                save: (request, signal) => saveSettings(remoteCtx.remote, request, signal),
            };
            remoteCtx.slots.inject('settings.models.provider-card', () => remoteCtx.slots.register({
                name: 'settings.models.provider-card', key: 'dsh-claude-native', locale: 'claudeProviderSettings', inject: () => face,
            }, ProviderSettings));
        });
    }
    catch (error) {
        await unmountSettings?.();
        await unmountChat();
        throw error;
    }
}
export { ProviderSettings, ProviderSettingsPage } from './ProviderSettings.js';
export { NativeOptions, nativeOptionsVisible } from './NativeOptions.js';
