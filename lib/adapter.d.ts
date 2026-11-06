import type { Context } from '@deepseek-ai/cordis';
import type Anthropic from '@anthropic-ai/sdk';
import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmResolvedModelInfo, type PreparedAdapterCall, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment';
import { type ClaudeModelConfig, type ClaudeProfile } from './config.js';
import { type ClientConstructor } from './client-factory.js';
export interface ClaudeAdapterOptions {
    profile: () => ClaudeProfile;
    resolveApiKey: (profile: ClaudeProfile) => Promise<string | undefined>;
    /** Dependency injection for offline protocol tests. */
    createClient?: ClientConstructor;
}
export declare class ClaudeNativeAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly options;
    private readonly clients;
    constructor(ctx: Context, options: ClaudeAdapterOptions);
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    private profile;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** The official SDK client for trusted host plugins (batches, token counting, files…). */
    sdk(): Promise<Anthropic>;
    private client;
    private streamWith;
}
export declare function modelInfo(id: string, model: ClaudeModelConfig | undefined): LlmResolvedModelInfo;
