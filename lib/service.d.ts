import { Context, Service } from '@deepseek-ai/cordis';
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeNativeAdapter } from './adapter.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        nativeClaude: ClaudeNativeService;
    }
}
/** Trusted host-plugin API: the configured official SDK client (batches, count_tokens, files, models…). */
export declare class ClaudeNativeService extends Service {
    private readonly adapter;
    constructor(ctx: Context, adapter: ClaudeNativeAdapter);
    client(): Promise<Anthropic>;
}
