import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
export const MAX_TIMEOUT_MS = 2_147_483_647;
const capacity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const effortLevel = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export const effortOptionSchema = z.object({
    id: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(128),
    thinking: z.enum(['adaptive', 'enabled', 'disabled', 'between_tools', 'omit']),
    effort: effortLevel.optional(), budgetTokens: capacity.optional(),
}).strict();
/** Only UI-owned fields cross the browser boundary; model betas and raw extraBody stay host-side. */
export const modelViewSchema = z.object({
    id: z.string().trim().min(1).max(256).refine(value => !/[\s\\?#\u0000-\u001f\u007f]/.test(value)),
    name: z.string().trim().max(256).optional(),
    contextWindow: capacity.optional(), maxTokens: capacity.optional(),
    inputTypes: z.array(z.enum(['text', 'image', 'pdf'])).min(1).max(3).optional(),
    efforts: z.array(effortOptionSchema).max(16).optional(),
    defaultEffort: z.string().trim().min(1).max(64).optional(),
    thinkingDisplay: z.enum(['summarized', 'omitted', 'updates']).optional(),
    sampling: z.boolean().optional(),
    webTools: z.enum(['dynamic', 'basic', 'none']).optional(),
    fallback: z.boolean().optional(),
}).strict();
const serverToolSchema = z.object({ enabled: z.boolean(), maxUses: z.number().int().positive().max(1000).optional() }).strict();
export const connectionSchema = z.object({
    enabled: z.boolean(),
    apiKeyEnv: z.string().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    authMode: z.enum(['x-api-key', 'bearer']),
    baseURL: z.string().trim().max(2048).optional(),
    anthropicVersion: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
    timeoutMs: z.number().int().nonnegative().max(MAX_TIMEOUT_MS),
    betas: z.array(z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/i)).max(32),
    cache: z.object({ enabled: z.boolean(), ttl: z.enum(['5m', '1h']) }).strict(),
    refusalFallback: z.enum(['auto', 'on', 'off']),
    webSearch: serverToolSchema, webFetch: serverToolSchema,
}).strict();
export const settingsSchema = z.object({
    settingsNs: z.string().min(1), revision: z.number().int().nonnegative(), writable: z.boolean(),
    connection: connectionSchema,
    credential: z.object({ configured: z.boolean(), writable: z.boolean() }).strict(),
    models: z.array(modelViewSchema).max(1000),
    presets: z.array(modelViewSchema).max(100),
}).strict();
export const readRequestSchema = z.object({}).strict();
export const discoverRequestSchema = z.object({
    connection: connectionSchema,
    /** Transient for discovery; save is the only operation that writes this secret. */
    apiKey: z.string().trim().min(1).max(16_384).optional(),
}).strict();
export const discoverySchema = z.object({ models: z.array(modelViewSchema).max(1000) }).strict();
export const saveRequestSchema = discoverRequestSchema.extend({
    models: z.array(modelViewSchema).max(1000), expectedRevision: z.number().int().nonnegative(),
}).strict();
const codec = (schema, typeSymbol) => ({ mode: 'strict', typeSymbol, create: () => schema });
const parameter = (schema, symbol) => ({
    name: 'request', source: 'json', codec: codec(schema, symbol), strictCodec: codec(schema, symbol),
});
/** Settings calls touch the global deployment, never a user-supplied Session resource. */
export const providerRemoteInfo = createTypertRemoteInfo({
    package: 'dsh-claude-native-provider-settings',
    methods: {
        'nativeClaudeSettings/get': {
            service: 'nativeClaudeSettings', invocation: { kind: 'direct' },
            parameters: [parameter(readRequestSchema, 'ClaudeSettingsReadRequest')],
            result: codec(settingsSchema, 'ClaudeSettingsView'), cancellation: { parameter: 'signal' },
        },
        'nativeClaudeSettings/discover': {
            service: 'nativeClaudeSettings', invocation: { kind: 'direct' },
            parameters: [parameter(discoverRequestSchema, 'ClaudeDiscoverRequest')],
            result: codec(discoverySchema, 'ClaudeDiscovery'), cancellation: { parameter: 'signal' },
        },
        'nativeClaudeSettings/save': {
            service: 'nativeClaudeSettings', invocation: { kind: 'direct' },
            parameters: [parameter(saveRequestSchema, 'ClaudeSaveRequest')],
            result: codec(settingsSchema, 'ClaudeSettingsView'), cancellation: { parameter: 'signal' },
        },
    },
}, z);
/** Only safe action metadata crosses into UI recovery logic; credential payloads never do. */
export class SettingsRemoteError extends Error {
    code;
    constructor(error) {
        super(error.message);
        this.name = 'SettingsRemoteError';
        this.code = error.code;
    }
}
export async function getSettings(remote, signal) {
    const result = await providerRemoteInfo.methods['nativeClaudeSettings/get'].invoke(remote, { request: {} }, signal);
    if (!result.ok)
        throw new SettingsRemoteError(result.error);
    return result.value;
}
export async function discoverModels(remote, request, signal) {
    const result = await providerRemoteInfo.methods['nativeClaudeSettings/discover'].invoke(remote, { request }, signal);
    if (!result.ok)
        throw new SettingsRemoteError(result.error);
    return result.value;
}
export async function saveSettings(remote, request, signal) {
    const result = await providerRemoteInfo.methods['nativeClaudeSettings/save'].invoke(remote, { request }, signal);
    if (!result.ok)
        throw new SettingsRemoteError(result.error);
    return result.value;
}
