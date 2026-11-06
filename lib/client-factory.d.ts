import type { Context } from '@deepseek-ai/cordis';
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';
import { type ClaudeProfile } from './config.js';
export type ClientConstructor = (options: ClientOptions) => Anthropic;
/** Re-resolve the stored reference on every operation, including unsaved discovery drafts. */
export declare function resolveClaudeApiKey(ctx: Context, profile: Pick<ClaudeProfile, 'apiKeyEnv'>): Promise<string | undefined>;
/**
 * Every credential is passed explicitly so the SDK never falls back to
 * ANTHROPIC_* environment variables or `ant auth` profiles inside the
 * container. Retries are owned by dsh-llm-retry, so the SDK makes one attempt.
 */
export declare function createClaudeClient(profile: ClaudeProfile, rawKey: string | undefined, construct?: ClientConstructor): Anthropic;
