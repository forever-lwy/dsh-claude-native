import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-claude-native-client";
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<void>;
export { ProviderSettings, ProviderSettingsPage } from './ProviderSettings.js';
export type { ProviderSettingsFace } from './ProviderSettings.js';
export { NativeOptions, nativeOptionsVisible } from './NativeOptions.js';
export type { NativeOptionsFace, NativeOptionsState } from './NativeOptions.js';
