import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm';
import { REPLAY_FORMAT } from './messages.js';
const SERVER_TOOL_LABEL = { web_search: '网页搜索', web_fetch: '网页读取', code_execution: '代码执行' };
function quote(text) {
    return text.replace(/[\r\n]+/g, ' ').slice(0, 300);
}
/** Accumulates one assistant turn, which may span several pause_turn responses. */
export class TurnAccumulator {
    options;
    next = 0;
    entries = [];
    pending = [];
    sources = new Map();
    usage = {};
    id;
    model;
    toolCalls = false;
    stopReason = null;
    constructor(options) {
        this.options = options;
    }
    visible(native, block) {
        this.entries.push({ native: [...this.pending, native], block: structuredClone(block) });
        this.pending = [];
    }
    *textBlock(text, native) {
        const index = this.next++;
        const block = { type: 'text', text };
        yield { type: 'block-start', index, blockType: 'text' };
        yield { type: 'text-delta', index, text };
        yield { type: 'block-end', index, block };
        this.entries.push({ native: [...this.pending, ...native], block });
        this.pending = [];
    }
    source(url, title) {
        if (typeof url === 'string' && /^https?:\/\//i.test(url) && !this.sources.has(url))
            this.sources.set(url, typeof title === 'string' && title.trim() ? title : url);
    }
    /** Summaries keep server-tool activity visible in dsh; the native blocks stay attached for replay. */
    serverToolText(native) {
        const type = native.type;
        if (type === 'server_tool_use') {
            const input = (native.input ?? {});
            const name = String(native.name ?? '');
            const detail = typeof input.query === 'string' ? `：${quote(input.query)}` : typeof input.url === 'string' ? `：${quote(input.url)}` : '';
            return `\n> 正在使用${SERVER_TOOL_LABEL[name] ?? `服务端工具 ${name}`}${detail}\n\n`;
        }
        const content = native.content;
        if (Array.isArray(content)) {
            for (const item of content)
                if (item && typeof item === 'object')
                    this.source(item.url, item.title);
            return `> ${type === 'web_search_tool_result' ? `找到 ${content.length} 条搜索结果` : '服务端工具已完成'}\n\n`;
        }
        if (content && typeof content === 'object') {
            const record = content;
            if (typeof record.error_code === 'string')
                return `> ${SERVER_TOOL_LABEL[type.replace(/_tool_result$/, '')] ?? '服务端工具'}失败：${record.error_code}\n\n`;
            if (type === 'web_fetch_tool_result') {
                this.source(record.url, record.content?.title);
                return `> 已读取 ${typeof record.url === 'string' ? quote(record.url) : '网页'}\n\n`;
            }
        }
        return '> 服务端工具已完成\n\n';
    }
    async *consume(stream, signal) {
        const natives = [];
        let active;
        let stopReason = null;
        let stopDetails;
        let started = false;
        let stopped = false;
        const usage = {};
        const take = (source) => {
            for (const [key, value] of Object.entries(source ?? {}))
                if (typeof value === 'number')
                    Object.assign(usage, { [key]: value });
        };
        for await (const event of stream) {
            signal?.throwIfAborted();
            switch (event.type) {
                case 'message_start':
                    started = true;
                    this.id ??= event.message.id;
                    this.model ??= event.message.model;
                    take(event.message.usage);
                    break;
                case 'content_block_start': {
                    const native = structuredClone(event.content_block);
                    natives[event.index] = native;
                    const type = native.type;
                    const kind = type === 'text' ? 'text' : type === 'thinking' ? 'reasoning' : type === 'tool_use' ? 'tool-call'
                        : type === 'server_tool_use' || type.endsWith('_tool_result') ? 'server-tool' : 'hidden';
                    active = { native, kind, text: '', json: '' };
                    if (kind === 'tool-call') {
                        active.index = this.next++;
                        yield { type: 'block-start', index: active.index, blockType: 'tool-call' };
                    }
                    break;
                }
                case 'content_block_delta': {
                    if (!active)
                        throw new LlmError('Claude 流在内容块开始前发送了增量。', 'INVALID_RESPONSE');
                    const delta = event.delta;
                    const native = active.native;
                    if (delta.type === 'text_delta') {
                        native.text = String(native.text ?? '') + delta.text;
                        if (!delta.text)
                            break;
                        if (active.index === undefined) {
                            active.index = this.next++;
                            yield { type: 'block-start', index: active.index, blockType: 'text' };
                        }
                        active.text += delta.text;
                        yield { type: 'text-delta', index: active.index, text: delta.text };
                    }
                    else if (delta.type === 'thinking_delta') {
                        native.thinking = String(native.thinking ?? '') + delta.thinking;
                        if (!delta.thinking)
                            break;
                        if (active.index === undefined) {
                            active.index = this.next++;
                            yield { type: 'block-start', index: active.index, blockType: 'reasoning' };
                        }
                        active.text += delta.thinking;
                        yield { type: 'reasoning-delta', index: active.index, text: delta.thinking };
                    }
                    else if (delta.type === 'signature_delta') {
                        native.signature = String(native.signature ?? '') + delta.signature;
                    }
                    else if (delta.type === 'citations_delta') {
                        const citations = Array.isArray(native.citations) ? native.citations : (native.citations = []);
                        citations.push(delta.citation);
                        const citation = delta.citation;
                        this.source(citation.url, citation.title);
                    }
                    else if (delta.type === 'input_json_delta') {
                        active.json += delta.partial_json;
                        if (active.kind === 'tool-call' && delta.partial_json) {
                            const tool = native;
                            yield { type: 'tool-call-delta', index: active.index, id: ToolCallId(tool.id), name: tool.name, argumentsDelta: delta.partial_json };
                        }
                    }
                    else if (delta.type === 'compaction_delta') {
                        native.content = delta.content;
                    }
                    break;
                }
                case 'content_block_stop': {
                    if (!active)
                        break;
                    yield* this.close(active);
                    active = undefined;
                    break;
                }
                case 'message_delta':
                    stopReason = event.delta.stop_reason ?? stopReason;
                    stopDetails = event.delta.stop_details ?? stopDetails;
                    take(event.usage);
                    break;
                case 'message_stop':
                    stopped = true;
                    break;
            }
        }
        signal?.throwIfAborted();
        if (!started || !stopped || active)
            throw new LlmError('Claude 流在结束标记之前中断。', 'TRANSPORT');
        this.stopReason = stopReason;
        this.addUsage(usage);
        return { stopReason, stopDetails, natives: natives.filter(Boolean) };
    }
    *close(active) {
        const native = active.native;
        if (active.kind === 'tool-call' || active.kind === 'server-tool') {
            let input = native.input ?? {};
            if (active.json.trim()) {
                try {
                    input = JSON.parse(active.json);
                }
                catch {
                    throw new LlmError('Claude 返回了无法解析的工具参数（可能已被 max_tokens 截断）。', 'INVALID_TOOL_CALL');
                }
            }
            if (native.type === 'tool_use' || native.type === 'server_tool_use') {
                if (typeof input !== 'object' || input === null || Array.isArray(input))
                    throw new LlmError('Claude 工具参数必须是 JSON 对象。', 'INVALID_TOOL_CALL');
                native.input = input;
            }
        }
        if (active.kind === 'tool-call') {
            const tool = native;
            const args = active.json.trim() ? active.json : '{}';
            if (!active.json.trim())
                yield { type: 'tool-call-delta', index: active.index, id: ToolCallId(tool.id), name: tool.name, argumentsDelta: args };
            const block = { type: 'tool-call', id: ToolCallId(tool.id), name: tool.name, arguments: args };
            yield { type: 'block-end', index: active.index, block };
            this.visible(active.native, block);
            this.toolCalls = true;
        }
        else if ((active.kind === 'text' || active.kind === 'reasoning') && active.index !== undefined) {
            const block = { type: active.kind, text: active.text };
            yield { type: 'block-end', index: active.index, block };
            this.visible(active.native, block);
        }
        else if (active.kind === 'server-tool') {
            yield* this.textBlock(this.serverToolText(native), [active.native]);
        }
        else {
            // Redacted or display-omitted thinking, fallback markers and unknown blocks replay with their neighbours.
            this.pending.push(active.native);
        }
    }
    /** message_delta usage is cumulative within a response; pause_turn responses add up. */
    addUsage(usage) {
        for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
            const value = usage[key];
            if (typeof value === 'number')
                this.usage[key] = (this.usage[key] ?? 0) + value;
        }
    }
    /** Closes the turn: sources, usage and the finish chunk carrying exact native replay. */
    *finish(stopDetails) {
        const reason = this.stopReason;
        if (reason === 'refusal') {
            const details = (stopDetails ?? {});
            const category = typeof details.category === 'string' ? `（${details.category}）` : '';
            throw new LlmError(`Claude 安全分类器拒绝了此请求${category}${typeof details.explanation === 'string' ? `：${quote(details.explanation)}` : ''}`, 'CONTENT_FILTER');
        }
        if (this.sources.size) {
            const safe = (title) => title.replace(/[[\]<>\r\n]/g, ' ');
            yield* this.textBlock('\n\n来源：\n' + [...this.sources].map(([url, title]) => `- [${safe(title)}](${url.replace(/\)/g, '%29')})`).join('\n'), []);
        }
        if (this.pending.length) {
            if (!this.entries.length)
                throw new LlmError('Claude 返回的回复没有可见内容。', 'EMPTY_RESPONSE');
            this.entries.at(-1).native.push(...this.pending);
            this.pending = [];
        }
        if (!this.entries.length)
            throw new LlmError('Claude 返回了空回复。', 'EMPTY_RESPONSE');
        const usage = this.usage;
        const input = usage.input_tokens ?? 0, cacheRead = usage.cache_read_input_tokens ?? 0, cacheWrite = usage.cache_creation_input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const tokenUsage = { inputTokens: input, outputTokens: output, totalTokens: input + cacheRead + cacheWrite + output,
            ...(cacheRead ? { cacheReadTokens: cacheRead } : {}), ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}) };
        yield { type: 'usage', usage: tokenUsage };
        const kind = reason === 'max_tokens' || reason === 'model_context_window_exceeded' ? 'max-tokens' : this.toolCalls ? 'tool-calls' : 'stop';
        const replay = {
            response: { format: REPLAY_FORMAT, provider: this.options.provider, model: this.options.model,
                ...(this.id ? { id: this.id } : {}), stopReason: reason, usage: structuredClone(usage) },
            blocks: this.entries,
        };
        yield { type: 'finish', reason: { kind }, replayState: replay };
    }
}
