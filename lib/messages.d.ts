import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore, FileAttachmentRef, ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment';
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeInputType } from './config.js';
type NativeBlock = Anthropic.Beta.BetaContentBlock;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
export declare const REPLAY_FORMAT = "claude-native-v1";
export interface ReplayEntry {
    native: NativeBlock[];
    block: ContentBlock;
}
export interface ClaudeReplay {
    response: {
        format: typeof REPLAY_FORMAT;
        provider: string;
        model: string;
        prefixDigest?: string;
        id?: string;
        stopReason?: string | null;
        usage?: unknown;
    };
    blocks: ReplayEntry[];
}
/** Server-tool block types this request can legally echo back, keyed by the tool that produces them. */
export interface ReplayPolicy {
    serverTools: ReadonlySet<string>;
    fallbacks: boolean;
}
export interface TranslateOptions {
    attachments?: AttachmentStore;
    inputTypes?: readonly ClaudeInputType[];
    policy: ReplayPolicy;
    manualThinking?: boolean;
    imageTarget?: (image: ImageAttachmentRef) => ImageRequestTarget;
}
export interface TranslatedConversation {
    system: Anthropic.Beta.BetaTextBlockParam[];
    messages: MessageParam[];
}
/** Anthropic image limits: 5 MB per image, 8000 px per edge. Leave room for base64-safe re-encoding. */
export declare const MAX_IMAGE_BYTES = 3750000;
export declare const MAX_IMAGE_EDGE = 8000;
export declare function claudeImageTarget(image: ImageAttachmentRef): ImageRequestTarget;
export declare function jsonEqual(left: unknown, right: unknown): boolean;
/** Which server tool a native block depends on; undefined means it needs none. */
export declare function serverToolOf(block: {
    type: string;
    name?: unknown;
}): string | undefined;
export declare function isPdf(ref: FileAttachmentRef): boolean;
export declare function translateMessages(options: GenerateOptions, translate: TranslateOptions): Promise<TranslatedConversation>;
/** Thinking blocks cannot carry cache_control; mark the last block that can. */
export declare function markCacheBreakpoint(content: MessageParam['content'], cacheControl: Anthropic.Beta.BetaCacheControlEphemeral): boolean;
export {};
