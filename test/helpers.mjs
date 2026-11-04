import Anthropic from '@anthropic-ai/sdk'
import { ClaudeNativeAdapter } from '../lib/adapter.js'
import { defaultProfile } from '../lib/config.js'

export const collect = async iterable => { const chunks = []; for await (const chunk of iterable) chunks.push(chunk); return chunks }

export function sse(events) {
  return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

/** A minimal, well-formed native response stream built from content blocks. */
export function response(blocks, { stop = 'end_turn', usage = { input_tokens: 10, output_tokens: 5 }, stopDetails, id = 'msg_test' } = {}) {
  const events = [{ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null,
    usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_read_input_tokens: usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0 } } }]
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      if (block.text) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
      for (const citation of block.citations ?? []) events.push({ type: 'content_block_delta', index, delta: { type: 'citations_delta', citation } })
    } else if (block.type === 'thinking') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
      if (block.thinking) events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } })
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: block.type, id: block.id, name: block.name, input: {} } })
      const json = JSON.stringify(block.input)
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(0, 5) } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(5) } })
    } else {
      events.push({ type: 'content_block_start', index, content_block: block })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null, ...(stopDetails ? { stop_details: stopDetails } : {}) }, usage: { output_tokens: usage.output_tokens } })
  events.push({ type: 'message_stop' })
  return sse(events)
}

/** Fake transport: records each request and answers with queued SSE bodies or error responses. */
export function fakeServer(...bodies) {
  const requests = []
  const fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) })
    const next = bodies.shift()
    if (next instanceof Response) return next
    return new Response(next, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } })
  }
  return { requests, fetch }
}

export function makeAdapter(server, { profile = defaultProfile(), attachments, key = 'sk-test-only' } = {}) {
  const ctx = { get: name => name === 'attachments' ? attachments : undefined }
  const adapter = new ClaudeNativeAdapter(ctx, {
    profile: () => profile, resolveApiKey: async () => key,
    createClient: options => new Anthropic({ ...options, fetch: server.fetch }),
  })
  return { adapter, profile }
}

export const user = text => ({ role: 'user', content: [{ type: 'text', text }] })
