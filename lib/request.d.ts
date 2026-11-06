import { type GenerateOptions } from '@deepseek-ai/dsh-llm';
import type Anthropic from '@anthropic-ai/sdk';
import { type ClaudeEffortOption, type ClaudeModelConfig, type ClaudeProfile } from './config.js';
import { type ReplayPolicy, type TranslatedConversation } from './messages.js';
import type { ClaudeChatChoices } from './chat-remote.js';
export type StreamParams = Anthropic.Beta.MessageCreateParamsStreaming;
export declare const THINKING_UPDATES_BETA = "thinking-display-updates-2026-08-18";
export declare const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";
export declare function findModel(profile: ClaudeProfile, id: string): ClaudeModelConfig | undefined;
export declare function selectedEffort(model: ClaudeModelConfig | undefined, requested: string | undefined): ClaudeEffortOption | undefined;
/** Which server tools this request declares; replayed history may only echo their blocks. */
export declare function replayPolicy(profile: ClaudeProfile, model: ClaudeModelConfig | undefined, choices?: ClaudeChatChoices): ReplayPolicy;
export declare function fallbacksEnabled(profile: ClaudeProfile, model: ClaudeModelConfig | undefined): boolean;
export interface BuiltRequest {
    params: StreamParams;
    thinkingOn: boolean;
}
export declare function buildRequest(profile: ClaudeProfile, options: GenerateOptions, conversation: TranslatedConversation, choices?: ClaudeChatChoices): BuiltRequest;
