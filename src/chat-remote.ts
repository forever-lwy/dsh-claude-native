import { z } from 'zod'
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'
import type { RemoteResult, TypertClientRemote, TypertRemoteInfo, TypertRemoteMethod } from '@deepseek-ai/dsh-typert-protocol'

export const CHAT_KEYS = ['nativeFiles', 'webSearch', 'webFetch'] as const
export type ChatKey = typeof CHAT_KEYS[number]
export const chatChoicesSchema = z.object({ nativeFiles: z.boolean(), webSearch: z.boolean(), webFetch: z.boolean() }).strict()
export type ClaudeChatChoices = z.infer<typeof chatChoicesSchema>
export const NO_CHOICES: ClaudeChatChoices = Object.freeze({ nativeFiles: false, webSearch: false, webFetch: false })

export const chatRouteSchema = z.object({ provider: z.string().min(1), model: z.string().min(1) }).strict()
export const chatRequestSchema = chatRouteSchema.extend({ sessionId: z.string().min(1) }).strict()
export type ClaudeChatRequest = z.infer<typeof chatRequestSchema>
export const chatSetRequestSchema = chatRequestSchema.extend({
  choices: chatChoicesSchema, expectedRevision: z.number().int().nonnegative(),
}).strict()
export type ClaudeChatSetRequest = z.infer<typeof chatSetRequestSchema>

export const chatSelectionSchema = chatRouteSchema.extend({ choices: chatChoicesSchema }).strict()
/** Immutable copy carried on each accepted user prompt; it decides that turn's native features. */
export const chatSourceSchema = z.object({ version: z.literal(1), selections: z.array(chatSelectionSchema) }).strict()
export type ClaudeChatSourceSnapshot = z.infer<typeof chatSourceSchema>

export const chatSnapshotSchema = chatRouteSchema.extend({
  capabilities: chatChoicesSchema, choices: chatChoicesSchema, revision: z.number().int().nonnegative(),
}).strict()
export type ClaudeChatSnapshot = z.infer<typeof chatSnapshotSchema>

type GetMethod = TypertRemoteMethod<{ request: ClaudeChatRequest }, ClaudeChatSnapshot>
type SetMethod = TypertRemoteMethod<{ request: ClaudeChatSetRequest }, ClaudeChatSnapshot>
const codec = <Schema extends z.ZodType>(schema: Schema, typeSymbol: string) => ({ mode: 'strict' as const, typeSymbol, create: () => schema })
const parameter = (schema: z.ZodType, symbol: string) => ({
  name: 'request', source: 'json' as const, codec: codec(schema, symbol), strictCodec: codec(schema, symbol),
})

export const chatRemoteInfo = createTypertRemoteInfo({
  package: 'dsh-claude-native',
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
}, z) as TypertRemoteInfo<{ 'nativeClaudeChat/get': GetMethod; 'nativeClaudeChat/set': SetMethod }>

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'nativeClaudeChat/get': (request: ClaudeChatRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeChatSnapshot>>
    'nativeClaudeChat/set': (request: ClaudeChatSetRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeChatSnapshot>>
  }
  interface TypertRemoteNamespaceMap {
    nativeClaudeChat: {
      get(request: ClaudeChatRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeChatSnapshot>>
      set(request: ClaudeChatSetRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeChatSnapshot>>
    }
  }
  interface RemoteErrorDetailsMap {
    'native-claude/conflict': { revision: number }
  }
}

export async function getChatOptions(remote: TypertClientRemote, request: ClaudeChatRequest, signal?: AbortSignal): Promise<ClaudeChatSnapshot> {
  const result = await chatRemoteInfo.methods['nativeClaudeChat/get'].invoke(remote, { request }, signal)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

export async function setChatOptions(remote: TypertClientRemote, request: ClaudeChatSetRequest, signal?: AbortSignal): Promise<ClaudeChatSnapshot> {
  const result = await chatRemoteInfo.methods['nativeClaudeChat/set'].invoke(remote, { request }, signal)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Invalid, legacy or route-mismatched metadata never grants native features. */
export function readChatChoices(source: unknown, provider: string, model: string): ClaudeChatChoices | undefined {
  if (typeof source !== 'object' || source === null || !('claudeNative' in source)) return undefined
  const parsed = chatSourceSchema.safeParse(source.claudeNative)
  if (!parsed.success) return undefined
  return parsed.data.selections.find(selection => selection.provider === provider && selection.model === model)?.choices
}
