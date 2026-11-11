import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ClaudeSettingsView, DiscoverRequest, Discovery, SaveRequest } from '../provider-remote.js';
export interface ProviderSettingsFace {
    read: (signal: AbortSignal) => Promise<ClaudeSettingsView>;
    discover: (request: DiscoverRequest, signal: AbortSignal) => Promise<Discovery>;
    save: (request: SaveRequest, signal: AbortSignal) => Promise<ClaudeSettingsView>;
}
type Props = PropsRuntime<'settings.models.provider-card'> & PropsLocale<'claudeProviderSettings'> & ProviderSettingsFace;
/** Set on the host's `<li>` provider row that holds this plugin's card. */
export declare const NATIVE_ROW_ATTRIBUTE = "data-dsh-claude-native-row";
/** Each Models-page provider card owns its route's configuration form. */
export declare function ProviderSettings(props: Props): import("react").JSX.Element | null;
export declare function ProviderSettingsPage({ read, discover, save, useRemoteAccess, t }: Pick<Props, 'read' | 'discover' | 'save' | 'useRemoteAccess' | 't'>): import("react").JSX.Element;
export {};
