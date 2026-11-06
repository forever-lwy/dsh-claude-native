import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type ClaudeModelConfig, type ClaudeProfile } from './config.js';
import type { DiscoveredClaudeModel } from './discovery.js';
import { type ClaudeSettingsView, type ConnectionView, type DiscoverRequest, type Discovery, type ModelView, type ReadRequest, type SaveRequest } from './provider-remote.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        nativeClaudeSettings: ClaudeSettingsService;
    }
}
export interface ClaudeSettingsOptions {
    settingsNs: string;
    profile: () => ClaudeProfile;
    discover: (profile: ClaudeProfile, apiKey: string | undefined, signal: AbortSignal) => Promise<DiscoveredClaudeModel[]>;
}
export declare function viewConnection(profile: ClaudeProfile): ConnectionView;
export declare function viewModel(model: ClaudeModelConfig): ModelView;
export declare class ClaudeSettingsService extends TypertRemoteService {
    private readonly options;
    private saves;
    constructor(ctx: Context, options: ClaudeSettingsOptions);
    private descriptor;
    private credentialInfo;
    get(request: ReadRequest, signal: AbortSignal): Promise<ClaudeSettingsView>;
    private read;
    private draft;
    private apiKey;
    discover(request: DiscoverRequest, signal: AbortSignal): Promise<Discovery>;
    save(request: SaveRequest, signal: AbortSignal): Promise<ClaudeSettingsView>;
    private saveExclusive;
}
export declare function registerClaudeSettings(ctx: Context, options: ClaudeSettingsOptions): ClaudeSettingsService;
