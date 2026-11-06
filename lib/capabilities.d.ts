import { type GenerateOptions, type RequestMessage } from '@deepseek-ai/dsh-llm';
import type { ClaudeModelConfig, ClaudeProfile } from './config.js';
import { type ClaudeChatChoices } from './chat-remote.js';
/** What the composer may offer for one model; nothing is guessed beyond its declared inputs and web tools. */
export declare function resolveCapabilities(model: ClaudeModelConfig | undefined): ClaudeChatChoices;
/** Provider settings are the defaults a conversation starts from. */
export declare function defaultChoices(profile: ClaudeProfile, model: ClaudeModelConfig | undefined): ClaudeChatChoices;
export declare function unsupportedChoices(capabilities: ClaudeChatChoices, choices: ClaudeChatChoices): string[];
/** The newest human prompt owns this turn; an older prompt's switches are never carried forward. */
export declare function latestChatChoices(options: GenerateOptions): ClaudeChatChoices | undefined;
/** Upload mode belongs to the originating prompt, including after resume or a later toggle. Unstamped history stays native. */
export declare function usesNativeFiles(message: RequestMessage, options: GenerateOptions): boolean;
