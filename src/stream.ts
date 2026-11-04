import { LlmError, ToolCallId, type ContentBlock, type GenerateOptions, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type Anthropic from '@anthropic-ai/sdk'
import { REPLAY_FORMAT, type ClaudeReplay, type ReplayEntry } from './messages.js'

type NativeBlock = Anthropic.Beta.BetaContentBlock
type Event = Anthropic.Beta.BetaRawMessageStreamEvent
type Usage = Anthropic.Beta.BetaUsage

interface Active {
  native: NativeBlock & Record<string, unknown>
  kind: 'text' | 'reasoning' | 'tool-call' | 'server-tool' | 'hidden'
  index?: number
  text: string
  json: string
}

export interface ResponseOutcome {
  stopReason: string | null
  stopDetails?: unknown
  /** Every native block of this response, in API order, for pause_turn continuation. */
  natives: NativeBlock[]
}

const SERVER_TOOL_LABEL: Record<string, string> = { web_search: '网页搜索', web_fetch: '网页读取', code_execution: '代码执行' }

function quote(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').slice(0, 300)
}

/** Accumulates one assistant turn, which may span several pause_turn responses. */
export class TurnAccumulator {
  private next = 0
  readonly entries: ReplayEntry[] = []
  private pending: NativeBlock[] = []
  private readonly sources = new Map<string, string>()
  private usage: Partial<Usage> = {}
  private id?: string
  private model?: string
  toolCalls = false
  private stopReason: string | null = null

  constructor(private readonly options: GenerateOptions) {}

  private visible(native: NativeBlock, block: ContentBlock): void {
    this.entries.push({ native: [...this.pending, native], block: structuredClone(block) })
    this.pending = []
  }

  private *textBlock(text: string, native: NativeBlock[]): Generator<StreamChunk> {
    const index = this.next++
    const block: ContentBlock = { type: 'text', text }
    yield { type: 'block-start', index, blockType: 'text' }
    yield { type: 'text-delta', index, text }
    yield { type: 'block-end', index, block }
    this.entries.push({ native: [...this.pending, ...native], block })
    this.pending = []
  }

  private source(url: unknown, title: unknown): void {
    if (typeof url === 'string' && /^https?:\/\//i.test(url) && !this.sources.has(url)) this.sources.set(url, typeof title === 'string' && title.trim() ? title : url)
  }

  /** Summaries keep server-tool activity visible in dsh; the native blocks stay attached for replay. */
  private serverToolText(native: Record<string, unknown>): string {
    const type = native.type as string
    if (type === 'server_tool_use') {
      const input = (native.input ?? {}) as Record<string, unknown>
      const name = String(native.name ?? '')
      const detail = typeof input.query === 'string' ? `：${quote(input.query)}` : typeof input.url === 'string' ? `：${quote(input.url)}` : ''
      return `\n> 正在使用${SERVER_TOOL_LABEL[name] ?? `服务端工具 ${name}`}${detail}\n\n`
    }
    const content = native.content as unknown
    if (Array.isArray(content)) {
      for (const item of content) if (item && typeof item === 'object') this.source((item as Record<string, unknown>).url, (item as Record<string, unknown>).title)
      return `> ${type === 'web_search_tool_result' ? `找到 ${content.length} 条搜索结果` : '服务端工具已完成'}\n\n`
    }
    if (content && typeof content === 'object') {
      const record = content as Record<string, unknown>
      if (typeof record.error_code === 'string') return `> ${SERVER_TOOL_LABEL[type.replace(/_tool_result$/, '')] ?? '服务端工具'}失败：${record.error_code}\n\n`
      if (type === 'web_fetch_tool_result') {
        this.source(record.url, (record.content as { title?: unknown } | undefined)?.title)
        return `> 已读取 ${typeof record.url === 'string' ? quote(record.url) : '网页'}\n\n`
      }
    }
    return '> 服务端工具已完成\n\n'
  }

  async *consume(stream: AsyncIterable<Event>, signal?: AbortSignal): AsyncGenerator<StreamChunk, ResponseOutcome> {
    const natives: NativeBlock[] = []
    let active: Active | undefined
    let stopReason: string | null = null
    let stopDetails: unknown
    let started = false
    let stopped = false
    const usage: Partial<Usage> = {}
    const take = (source: Partial<Usage> | null | undefined) => {
      for (const [key, value] of Object.entries(source ?? {})) if (typeof value === 'number') Object.assign(usage, { [key]: value })
    }
    for await (const event of stream) {
      signal?.throwIfAborted()
      switch (event.type) {
        case 'message_start':
          started = true
          this.id ??= event.message.id
          this.model ??= event.message.model
          take(event.message.usage)
          break
        case 'content_block_start': {
          const native = structuredClone(event.content_block) as Active['native']
          natives[event.index] = native
          const type = native.type
          const kind: Active['kind'] = type === 'text' ? 'text' : type === 'thinking' ? 'reasoning' : type === 'tool_use' ? 'tool-call'
            : type === 'server_tool_use' || type.endsWith('_tool_result') ? 'server-tool' : 'hidden'
          active = { native, kind, text: '', json: '' }
          if (kind === 'tool-call') {
            active.index = this.next++
            yield { type: 'block-start', index: active.index, blockType: 'tool-call' }
          }
          break
        }
        case 'content_block_delta': {
          if (!active) throw new LlmError('Claude 流在内容块开始前发送了增量。', 'INVALID_RESPONSE')
          const delta = event.delta
          const native = active.native as Record<string, unknown>
          if (delta.type === 'text_delta') {
            native.text = String(native.text ?? '') + delta.text
            if (!delta.text) break
            if (active.index === undefined) {
              active.index = this.next++
              yield { type: 'block-start', index: active.index, blockType: 'text' }
            }
            active.text += delta.text
            yield { type: 'text-delta', index: active.index, text: delta.text }
          } else if (delta.type === 'thinking_delta') {
            native.thinking = String(native.thinking ?? '') + delta.thinking
            if (!delta.thinking) break
            if (active.index === undefined) {
              active.index = this.next++
              yield { type: 'block-start', index: active.index, blockType: 'reasoning' }
            }
            active.text += delta.thinking
            yield { type: 'reasoning-delta', index: active.index, text: delta.thinking }
          } else if (delta.type === 'signature_delta') {
            native.signature = String(native.signature ?? '') + delta.signature
          } else if (delta.type === 'citations_delta') {
            const citations = Array.isArray(native.citations) ? native.citations : (native.citations = [])
            ;(citations as unknown[]).push(delta.citation)
            const citation = delta.citation as unknown as Record<string, unknown>
            this.source(citation.url, citation.title)
          } else if (delta.type === 'input_json_delta') {
            active.json += delta.partial_json
            if (active.kind === 'tool-call' && delta.partial_json) {
              const tool = native as unknown as Anthropic.Beta.BetaToolUseBlock
              yield { type: 'tool-call-delta', index: active.index!, id: ToolCallId(tool.id), name: tool.name, argumentsDelta: delta.partial_json }
            }
          } else if (delta.type === 'compaction_delta') {
            native.content = delta.content
          }
          break
        }
        case 'content_block_stop': {
          if (!active) break
          yield* this.close(active)
          active = undefined
          break
        }
        case 'message_delta':
          stopReason = event.delta.stop_reason ?? stopReason
          stopDetails = (event.delta as { stop_details?: unknown }).stop_details ?? stopDetails
          take(event.usage as Partial<Usage>)
          break
        case 'message_stop':
          stopped = true
          break
      }
    }
    signal?.throwIfAborted()
    if (!started || !stopped || active) throw new LlmError('Claude 流在结束标记之前中断。', 'TRANSPORT')
    this.stopReason = stopReason
    this.addUsage(usage)
    return { stopReason, stopDetails, natives: natives.filter(Boolean) }
  }

  private *close(active: Active): Generator<StreamChunk> {
    const native = active.native as Record<string, unknown>
    if (active.kind === 'tool-call' || active.kind === 'server-tool') {
      let input: unknown = native.input ?? {}
      if (active.json.trim()) {
        try { input = JSON.parse(active.json) } catch { throw new LlmError('Claude 返回了无法解析的工具参数（可能已被 max_tokens 截断）。', 'INVALID_TOOL_CALL') }
      }
      if (native.type === 'tool_use' || native.type === 'server_tool_use') {
        if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new LlmError('Claude 工具参数必须是 JSON 对象。', 'INVALID_TOOL_CALL')
        native.input = input
      }
    }
    if (active.kind === 'tool-call') {
      const tool = native as unknown as Anthropic.Beta.BetaToolUseBlock
      const args = active.json.trim() ? active.json : '{}'
      if (!active.json.trim()) yield { type: 'tool-call-delta', index: active.index!, id: ToolCallId(tool.id), name: tool.name, argumentsDelta: args }
      const block: ContentBlock = { type: 'tool-call', id: ToolCallId(tool.id), name: tool.name, arguments: args }
      yield { type: 'block-end', index: active.index!, block }
      this.visible(active.native, block)
      this.toolCalls = true
    } else if ((active.kind === 'text' || active.kind === 'reasoning') && active.index !== undefined) {
      const block: ContentBlock = { type: active.kind, text: active.text }
      yield { type: 'block-end', index: active.index, block }
      this.visible(active.native, block)
    } else if (active.kind === 'server-tool') {
      yield* this.textBlock(this.serverToolText(native), [active.native])
    } else {
      // Redacted or display-omitted thinking, fallback markers and unknown blocks replay with their neighbours.
      this.pending.push(active.native)
    }
  }

  /** message_delta usage is cumulative within a response; pause_turn responses add up. */
  private addUsage(usage: Partial<Usage>): void {
    for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const) {
      const value = usage[key]
      if (typeof value === 'number') this.usage[key] = (this.usage[key] ?? 0) + value
    }
  }

  /** Closes the turn: sources, usage and the finish chunk carrying exact native replay. */
  *finish(stopDetails?: unknown): Generator<StreamChunk> {
    const reason = this.stopReason
    if (reason === 'refusal') {
      const details = (stopDetails ?? {}) as { category?: unknown; explanation?: unknown }
      const category = typeof details.category === 'string' ? `（${details.category}）` : ''
      throw new LlmError(`Claude 安全分类器拒绝了此请求${category}${typeof details.explanation === 'string' ? `：${quote(details.explanation)}` : ''}`, 'CONTENT_FILTER')
    }
    if (this.sources.size) {
      const safe = (title: string) => title.replace(/[[\]<>\r\n]/g, ' ')
      yield* this.textBlock('\n\n来源：\n' + [...this.sources].map(([url, title]) => `- [${safe(title)}](${url.replace(/\)/g, '%29')})`).join('\n'), [])
    }
    if (this.pending.length) {
      if (!this.entries.length) throw new LlmError('Claude 返回的回复没有可见内容。', 'EMPTY_RESPONSE')
      this.entries.at(-1)!.native.push(...this.pending)
      this.pending = []
    }
    if (!this.entries.length) throw new LlmError('Claude 返回了空回复。', 'EMPTY_RESPONSE')
    const usage = this.usage
    const input = usage.input_tokens ?? 0, cacheRead = usage.cache_read_input_tokens ?? 0, cacheWrite = usage.cache_creation_input_tokens ?? 0
    const output = usage.output_tokens ?? 0
    const tokenUsage: TokenUsage = { inputTokens: input, outputTokens: output, totalTokens: input + cacheRead + cacheWrite + output,
      ...(cacheRead ? { cacheReadTokens: cacheRead } : {}), ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}) }
    yield { type: 'usage', usage: tokenUsage }
    const kind = reason === 'max_tokens' || reason === 'model_context_window_exceeded' ? 'max-tokens' : this.toolCalls ? 'tool-calls' : 'stop'
    const replay: ClaudeReplay = {
      response: { format: REPLAY_FORMAT, provider: this.options.provider, model: this.options.model,
        ...(this.id ? { id: this.id } : {}), stopReason: reason, usage: structuredClone(usage) },
      blocks: this.entries,
    }
    yield { type: 'finish', reason: { kind }, replayState: replay as unknown as { response: unknown; blocks: unknown[] } }
  }
}
