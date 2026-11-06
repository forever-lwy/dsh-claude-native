import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock, GenerateOptions, RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm';
/**
 * rc.5 projects FileBlocks to local-path text inside its adapter boundary.
 * Keep the pre-projection request in scope so the serializer can restore the
 * immutable attachment references it sends natively; dispatch still goes
 * through next(), so core validation and replay isolation apply unchanged.
 */
export declare function registerNativeFileBridge(ctx: Context): void;
export declare function withOriginalRequest(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
/**
 * Re-attach original file blocks the model reads natively, after core's
 * local-path note (kept so file tools still know where the file lives).
 * Messages are matched by stable id, or by order for anonymous inputs.
 */
export declare function restoreNativeFiles(options: GenerateOptions, native: (block: ContentBlock, source: RequestMessage) => boolean): GenerateOptions;
