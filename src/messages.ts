import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore, FileAttachmentRef, ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import type Anthropic from '@anthropic-ai/sdk'
import type { ClaudeInputType } from './config.js'

type Block = Anthropic.Beta.BetaContentBlockParam
type NativeBlock = Anthropic.Beta.BetaContentBlock
type ToolResultContent = Exclude<Anthropic.Beta.BetaToolResultBlockParam['content'], string | undefined>[number]
export type MessageParam = Anthropic.Beta.BetaMessageParam

export const REPLAY_FORMAT = 'claude-native-v1'
export interface ReplayEntry { native: NativeBlock[]; block: ContentBlock }
export interface ClaudeReplay {
  response: { format: typeof REPLAY_FORMAT; provider: string; model: string; id?: string; stopReason?: string | null; usage?: unknown }
  blocks: ReplayEntry[]
}

/** Server-tool block types this request can legally echo back, keyed by the tool that produces them. */
export interface ReplayPolicy { serverTools: ReadonlySet<string>; fallbacks: boolean }

export interface TranslateOptions {
  attachments?: AttachmentStore
  inputTypes?: readonly ClaudeInputType[]
  policy: ReplayPolicy
  imageTarget?: (image: ImageAttachmentRef) => ImageRequestTarget
}

export interface TranslatedConversation { system: Anthropic.Beta.BetaTextBlockParam[]; messages: MessageParam[] }

/** Anthropic image limits: 5 MB per image, 8000 px per edge. Leave room for base64-safe re-encoding. */
export const MAX_IMAGE_BYTES = 3_750_000
export const MAX_IMAGE_EDGE = 8000

export function claudeImageTarget(image: ImageAttachmentRef): ImageRequestTarget {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  return { width: Math.max(1, Math.floor(image.width * scale)), height: Math.max(1, Math.floor(image.height * scale)),
    maxBytes: Math.min(image.bytes, MAX_IMAGE_BYTES) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, i) => jsonEqual(value, right[i]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left).filter(key => left[key] !== undefined)
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length
    && keys.every(key => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]))
}

/** Which server tool a native block depends on; undefined means it needs none. */
export function serverToolOf(block: { type: string; name?: unknown }): string | undefined {
  if (block.type === 'server_tool_use') return typeof block.name === 'string' ? block.name : 'unknown'
  if (block.type === 'web_search_tool_result') return 'web_search'
  if (block.type === 'web_fetch_tool_result') return 'web_fetch'
  if (block.type.endsWith('_tool_result') || block.type === 'mcp_tool_use' || block.type === 'container_upload') return block.type
  return undefined
}

/**
 * Exact native content is replayed only when it belongs to this provider and
 * every visible block is unchanged; an edited turn degrades to plain content,
 * which is what the API expects of a history its signatures no longer cover.
 */
function replayedBlocks(message: RequestMessage, options: GenerateOptions, policy: ReplayPolicy): Block[] | undefined {
  if (message.role !== 'assistant' || message.source.provider !== options.provider) return undefined
  const replay = message.source.replayState
  if (!isRecord(replay) || !isRecord(replay.response) || replay.response.format !== REPLAY_FORMAT) return undefined
  if (!Array.isArray(replay.blocks) || replay.blocks.length !== message.content.length) return undefined
  const result: Block[] = []
  for (let index = 0; index < message.content.length; index++) {
    const entry = replay.blocks[index]
    if (!isRecord(entry) || !Array.isArray(entry.native) || !entry.native.every(isRecord) || !jsonEqual(entry.block, message.content[index])) return undefined
    for (const native of entry.native as unknown as NativeBlock[]) {
      if (native.type === 'fallback' && !policy.fallbacks) continue
      const tool = serverToolOf(native)
      if (tool !== undefined && !policy.serverTools.has(tool)) return undefined
      result.push(structuredClone(native) as Block)
    }
  }
  return result
}

class ToolIds {
  private readonly ids = new Map<string, string>()
  private readonly used = new Set<string>()
  /** Foreign providers may use ids outside ^[a-zA-Z0-9_-]{1,64}$; keep them stable and unique. */
  map(id: string): string {
    const existing = this.ids.get(id)
    if (existing) return existing
    let candidate = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'tool'
    for (let suffix = 1; this.used.has(candidate); suffix++) candidate = `${candidate.slice(0, 58)}_${suffix}`
    this.ids.set(id, candidate)
    this.used.add(candidate)
    return candidate
  }
}

function parseArguments(value: string): Record<string, unknown> {
  let parsed: unknown
  try { parsed = value.trim() ? JSON.parse(value) : {} } catch { throw new LlmError('工具调用参数不是有效 JSON。', 'INVALID_TOOL_CALL') }
  if (!isRecord(parsed)) throw new LlmError('Claude 工具调用参数必须是 JSON 对象。', 'INVALID_TOOL_CALL')
  return parsed
}

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export function isPdf(ref: FileAttachmentRef): boolean { return /\.pdf$/i.test(ref.name) }

export async function translateMessages(options: GenerateOptions, translate: TranslateOptions): Promise<TranslatedConversation> {
  const { attachments, policy } = translate
  const accepts = (type: ClaudeInputType) => translate.inputTypes === undefined || translate.inputTypes.includes(type)
  const system: Anthropic.Beta.BetaTextBlockParam[] = options.system?.trim() ? [{ type: 'text', text: options.system }] : []
  const messages: MessageParam[] = []
  const ids = new ToolIds()
  const signal = options.signal

  const image = async (ref: ImageAttachmentRef): Promise<Anthropic.Beta.BetaImageBlockParam> => {
    if (!attachments) throw new LlmError('Claude 图片输入需要 dsh 附件服务。', 'UNSUPPORTED_CONTENT')
    const target = (translate.imageTarget ?? claudeImageTarget)(ref)
    const variant = await attachments.readImageRequest(ref, target, signal)
    return { type: 'image', source: { type: 'base64', media_type: variant.mediaType, data: Buffer.from(variant.data).toString('base64') } }
  }
  const document = async (ref: FileAttachmentRef): Promise<Anthropic.Beta.BetaRequestDocumentBlock> => {
    if (!attachments) throw new LlmError('Claude 文件输入需要 dsh 附件服务。', 'UNSUPPORTED_CONTENT')
    const data = await readAll(attachments.readFileStream(ref, signal))
    if (data.subarray(0, 5).toString('latin1') !== '%PDF-') throw new LlmError(`附件 ${ref.name} 不是有效的 PDF 文件。`, 'UNSUPPORTED_CONTENT')
    return { type: 'document', title: ref.name.slice(0, 500), source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } }
  }
  const placeholder = (block: ContentBlock): Anthropic.Beta.BetaTextBlockParam => ({ type: 'text', text:
    block.type === 'image' ? `[图片 ${block.attachment.name ?? block.attachment.attachmentId}${block.offloaded ? ' 已移出上下文' : ' 未发送：模型未声明图片输入'}]`
      : block.type === 'file' ? `[文件 ${block.attachment.name} 未以原生格式发送]` : '' })
  /** User-side media: native when the model accepts it, otherwise a visible placeholder. */
  const media = async (block: ContentBlock): Promise<ToolResultContent | undefined> => {
    if (block.type === 'image') return block.offloaded || !accepts('image') ? placeholder(block) : image(block.attachment)
    if (block.type === 'file') return isPdf(block.attachment) && accepts('pdf') ? document(block.attachment) : placeholder(block)
    return undefined
  }
  const push = (role: 'user' | 'assistant', content: Block[]): void => {
    if (content.length === 0) return
    const previous = messages.at(-1)
    if (previous?.role === role && Array.isArray(previous.content)) previous.content.push(...content)
    else messages.push({ role, content })
  }

  for (const message of options.messages) {
    signal?.throwIfAborted()
    if (message.role === 'system') {
      // Without in-history updates core sends system text up front; a later one still belongs to the operator channel.
      for (const block of message.content) if (block.type === 'text' && block.text.trim()) system.push({ type: 'text', text: block.text })
      continue
    }
    if (message.role === 'developer') {
      // Core consumes tool-addition/removal for adapters that receive complete tool lists.
      const text = message.content.flatMap(block => block.type === 'text' && block.text.trim() ? [{ type: 'text' as const, text: block.text }] : [])
      push('user', text)
      continue
    }
    if (message.role === 'tool') {
      const content: ToolResultContent[] = []
      for (const block of message.content) {
        if (block.type === 'text' || block.type === 'reasoning') { if (block.text) content.push({ type: 'text', text: block.text }) }
        else {
          const part = await media(block)
          if (part) content.push(part)
          else throw new LlmError(`工具结果包含不支持的内容类型：${block.type}`, 'UNSUPPORTED_CONTENT')
        }
      }
      push('user', [{ type: 'tool_result', tool_use_id: ids.map(message.toolCallId), ...(content.length ? { content } : {}), ...(message.isError ? { is_error: true } : {}) }])
      continue
    }
    if (message.role === 'assistant') {
      const native = replayedBlocks(message, options, policy)
      if (native) {
        for (const block of native) if (block.type === 'tool_use') ids.map(block.id)
        push('assistant', native)
        continue
      }
      const content: Block[] = []
      for (const block of message.content) {
        if (block.type === 'text') { if (block.text) content.push({ type: 'text', text: block.text }) }
        // Unsigned or foreign reasoning cannot be verified; the API itself drops thinking it cannot read.
        else if (block.type === 'reasoning') continue
        else if (block.type === 'tool-call') content.push({ type: 'tool_use', id: ids.map(block.id), name: block.name, input: parseArguments(block.arguments) })
        else if (block.type === 'image' || block.type === 'file') content.push(placeholder(block))
      }
      push('assistant', content)
      continue
    }
    const content: Block[] = []
    for (const block of message.content) {
      if (block.type === 'text' || block.type === 'reasoning') { if (block.text) content.push({ type: 'text', text: block.text }) }
      else if (block.type === 'image' || block.type === 'file') content.push((await media(block)) as Block)
    }
    push('user', content)
  }
  return { system, messages }
}

/** Thinking blocks cannot carry cache_control; mark the last block that can. */
export function markCacheBreakpoint(content: MessageParam['content'], cacheControl: Anthropic.Beta.BetaCacheControlEphemeral): boolean {
  if (!Array.isArray(content)) return false
  for (let index = content.length - 1; index >= 0; index--) {
    const block = content[index] as Block & { cache_control?: unknown }
    if (['thinking', 'redacted_thinking', 'fallback'].includes(block.type)) continue
    if (block.type === 'text' && !block.text) continue
    block.cache_control = cacheControl
    return true
  }
  return false
}
