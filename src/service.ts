import { Context, Service } from '@deepseek-ai/cordis'
import type Anthropic from '@anthropic-ai/sdk'
import type { ClaudeNativeAdapter } from './adapter.js'

declare module '@deepseek-ai/cordis' {
  interface Context { nativeClaude: ClaudeNativeService }
}

/** Trusted host-plugin API: the configured official SDK client (batches, count_tokens, files, models…). */
export class ClaudeNativeService extends Service {
  constructor(ctx: Context, private readonly adapter: ClaudeNativeAdapter) {
    super(ctx, 'nativeClaude')
  }

  client(): Promise<Anthropic> { return this.adapter.sdk() }
}
