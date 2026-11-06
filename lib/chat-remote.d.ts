import { z } from 'zod';
import type { RemoteResult, TypertClientRemote, TypertRemoteInfo, TypertRemoteMethod } from '@deepseek-ai/dsh-typert-protocol';
export declare const CHAT_KEYS: readonly ["nativeFiles", "webSearch", "webFetch"];
export type ChatKey = typeof CHAT_KEYS[number];
export declare const chatChoicesSchema: z.ZodObject<{
    nativeFiles: z.ZodBoolean;
    webSearch: z.ZodBoolean;
    webFetch: z.ZodBoolean;
}, z.core.$strict>;
export type ClaudeChatChoices = z.infer<typeof chatChoicesSchema>;
export declare const NO_CHOICES: ClaudeChatChoices;
export declare const chatRouteSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
}, z.core.$strict>;
export declare const chatRequestSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    sessionId: z.ZodString;
}, z.core.$strict>;
export type ClaudeChatRequest = z.infer<typeof chatRequestSchema>;
export declare const chatSetRequestSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    sessionId: z.ZodString;
    choices: z.ZodObject<{
        nativeFiles: z.ZodBoolean;
        webSearch: z.ZodBoolean;
        webFetch: z.ZodBoolean;
    }, z.core.$strict>;
    expectedRevision: z.ZodNumber;
}, z.core.$strict>;
export type ClaudeChatSetRequest = z.infer<typeof chatSetRequestSchema>;
export declare const chatSelectionSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    choices: z.ZodObject<{
        nativeFiles: z.ZodBoolean;
        webSearch: z.ZodBoolean;
        webFetch: z.ZodBoolean;
    }, z.core.$strict>;
}, z.core.$strict>;
/** Immutable copy carried on each accepted user prompt; it decides that turn's native features. */
export declare const chatSourceSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    selections: z.ZodArray<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        choices: z.ZodObject<{
            nativeFiles: z.ZodBoolean;
            webSearch: z.ZodBoolean;
            webFetch: z.ZodBoolean;
        }, z.core.$strict>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ClaudeChatSourceSnapshot = z.infer<typeof chatSourceSchema>;
export declare const chatSnapshotSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    capabilities: z.ZodObject<{
        nativeFiles: z.ZodBoolean;
        webSearch: z.ZodBoolean;
        webFetch: z.ZodBoolean;
    }, z.core.$strict>;
    choices: z.ZodObject<{
        nativeFiles: z.ZodBoolean;
        webSearch: z.ZodBoolean;
        webFetch: z.ZodBoolean;
    }, z.core.$strict>;
    revision: z.ZodNumber;
}, z.core.$strict>;
export type ClaudeChatSnapshot = z.infer<typeof chatSnapshotSchema>;
type GetMethod = TypertRemoteMethod<{
    request: ClaudeChatRequest;
}, ClaudeChatSnapshot>;
type SetMethod = TypertRemoteMethod<{
    request: ClaudeChatSetRequest;
}, ClaudeChatSnapshot>;
export declare const chatRemoteInfo: TypertRemoteInfo<{
    "nativeClaudeChat/get": GetMethod;
    "nativeClaudeChat/set": SetMethod;
}>;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'nativeClaudeChat/get': (request: ClaudeChatRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeChatSnapshot>>;
        'nativeClaudeChat/set': (request: ClaudeChatSetRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeChatSnapshot>>;
    }
    interface TypertRemoteNamespaceMap {
        nativeClaudeChat: {
            get(request: ClaudeChatRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeChatSnapshot>>;
            set(request: ClaudeChatSetRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeChatSnapshot>>;
        };
    }
    interface RemoteErrorDetailsMap {
        'native-claude/conflict': {
            revision: number;
        };
    }
}
export declare function getChatOptions(remote: TypertClientRemote, request: ClaudeChatRequest, signal?: AbortSignal): Promise<ClaudeChatSnapshot>;
export declare function setChatOptions(remote: TypertClientRemote, request: ClaudeChatSetRequest, signal?: AbortSignal): Promise<ClaudeChatSnapshot>;
/** Invalid, legacy or route-mismatched metadata never grants native features. */
export declare function readChatChoices(source: unknown, provider: string, model: string): ClaudeChatChoices | undefined;
export {};
