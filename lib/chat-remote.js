import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
export const CHAT_KEYS = ['nativeFiles', 'webSearch', 'webFetch'];
export const chatChoicesSchema = z.object({ nativeFiles: z.boolean(), webSearch: z.boolean(), webFetch: z.boolean() }).strict();
export const NO_CHOICES = Object.freeze({ nativeFiles: false, webSearch: false, webFetch: false });
export const chatRouteSchema = z.object({ provider: z.string().min(1), model: z.string().min(1) }).strict();
export const chatRequestSchema = chatRouteSchema.extend({ sessionId: z.string().min(1) }).strict();
export const chatSetRequestSchema = chatRequestSchema.extend({
    choices: chatChoicesSchema, expectedRevision: z.number().int().nonnegative(),
}).strict();
export const chatSelectionSchema = chatRouteSchema.extend({ choices: chatChoicesSchema }).strict();
/** Immutable copy carried on each accepted user prompt; it decides that turn's native features. */
export const chatSourceSchema = z.object({ version: z.literal(1), selections: z.array(chatSelectionSchema) }).strict();
export const chatSnapshotSchema = chatRouteSchema.extend({
    capabilities: chatChoicesSchema, choices: chatChoicesSchema, revision: z.number().int().nonnegative(),
}).strict();
const codec = (schema, typeSymbol) => ({ mode: 'strict', typeSymbol, create: () => schema });
const parameter = (schema, symbol) => ({
    name: 'request', source: 'json', codec: codec(schema, symbol), strictCodec: codec(schema, symbol),
});
export const chatRemoteInfo = createTypertRemoteInfo({
    package: '@forever-lwy/dsh-claude-native',
    methods: {
        'nativeClaudeChat/get': {
            service: 'nativeClaudeChat', invocation: { kind: 'direct' },
            parameters: [parameter(chatRequestSchema, 'ClaudeChatRequest')], result: codec(chatSnapshotSchema, 'ClaudeChatSnapshot'),
            cancellation: { parameter: 'signal' },
        },
        'nativeClaudeChat/set': {
            service: 'nativeClaudeChat', invocation: { kind: 'direct' },
            parameters: [parameter(chatSetRequestSchema, 'ClaudeChatSetRequest')], result: codec(chatSnapshotSchema, 'ClaudeChatSnapshot'),
            cancellation: { parameter: 'signal' },
        },
    },
}, z);
export async function getChatOptions(remote, request, signal) {
    const result = await chatRemoteInfo.methods['nativeClaudeChat/get'].invoke(remote, { request }, signal);
    if (!result.ok)
        throw new Error(result.error.message);
    return result.value;
}
export async function setChatOptions(remote, request, signal) {
    const result = await chatRemoteInfo.methods['nativeClaudeChat/set'].invoke(remote, { request }, signal);
    if (!result.ok)
        throw new Error(result.error.message);
    return result.value;
}
/** Invalid, legacy or route-mismatched metadata never grants native features. */
export function readChatChoices(source, provider, model) {
    if (typeof source !== 'object' || source === null || !('claudeNative' in source))
        return undefined;
    const parsed = chatSourceSchema.safeParse(source.claudeNative);
    if (!parsed.success)
        return undefined;
    return parsed.data.selections.find(selection => selection.provider === provider && selection.model === model)?.choices;
}
