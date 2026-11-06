import type { Context } from '@deepseek-ai/cordis';
import type { FileAttachmentRef, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { Session } from '@deepseek-ai/dsh-session';
import { type GenerateOptions } from '@deepseek-ai/dsh-llm';
import { type ClaudeProfile } from './config.js';
import type { ClaudeChatChoices } from './chat-remote.js';
export declare const CLAUDE_NATIVE_FILE_TOOL = "claude_native_attach_file";
/** Anthropic caps a whole request at 32 MB; leave room for history and base64 growth. */
export declare const MAX_NATIVE_PDF_BYTES: number;
export declare const MAX_NATIVE_IMAGE_BYTES: number;
export interface NativeFileReceipt {
    version: 1;
    kind: 'pdf' | 'image';
    name: string;
    attachment: FileAttachmentRef | ImageAttachmentRef;
}
/** Magic bytes decide the type; a file name never grants a native channel. */
export declare function sniffNativeType(prefix: Uint8Array): {
    kind: 'pdf';
} | {
    kind: 'image';
    mediaType: ImageMediaType;
} | undefined;
/** Tool results of this tool are host-produced; their files are always sent natively. */
export declare function attachToolResults(options: GenerateOptions): Set<string>;
export interface NativeFileToolOptions {
    profile: () => ClaudeProfile;
    /** The conversation's current choices; absent when chat controls are not mounted. */
    choices: (session: Session, model: string) => ClaudeChatChoices | undefined;
}
/**
 * Attach the exact bytes of one workspace PDF or image to this conversation.
 * Nothing parses, OCRs, summarizes or calls another model; the next request
 * carries the file as a native document/image block.
 */
export declare function registerNativeFileTool(ctx: Context, options: NativeFileToolOptions): void;
