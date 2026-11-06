import { Service } from '@deepseek-ai/cordis';
/** Trusted host-plugin API: the configured official SDK client (batches, count_tokens, files, models…). */
export class ClaudeNativeService extends Service {
    adapter;
    constructor(ctx, adapter) {
        super(ctx, 'nativeClaude');
        this.adapter = adapter;
    }
    client() { return this.adapter.sdk(); }
}
