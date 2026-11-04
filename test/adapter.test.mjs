import test from 'node:test'
import assert from 'node:assert/strict'
import { ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defaultProfile, presetModel } from '../lib/config.js'
import { collect, fakeServer, makeAdapter, response, user } from './helpers.mjs'

const opus = 'claude-opus-5-5'
const tools = [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }]

test('wire request uses native adaptive thinking, effort, caching, fallbacks and explicit auth', async () => {
  const server = fakeServer(response([{ type: 'text', text: 'hi' }]))
  const { adapter } = makeAdapter(server)
  const chunks = await collect(adapter.stream({ provider: 'claude-native', model: opus, system: 'You are helpful.',
    messages: [user('hello')], tools, reasoningEffort: ReasoningEffortId('xhigh'), temperature: 0.3 }))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  const [request] = server.requests
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages?beta=true')
  assert.equal(request.headers.get('x-api-key'), 'sk-test-only')
  assert.equal(request.headers.get('authorization'), null)
  assert.equal(request.headers.get('anthropic-version'), '2023-06-01')
  assert.match(request.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/)
  assert.match(request.headers.get('user-agent') ?? '', /deepseek-harness/i)
  const body = request.body
  assert.equal(body.model, opus)
  assert.equal(body.stream, true)
  assert.equal(body.max_tokens, 128000)
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' })
  assert.deepEqual(body.output_config, { effort: 'xhigh' })
  assert.equal(body.temperature, undefined, 'sampling is rejected on current models')
  assert.equal(body.fallbacks, 'default')
  assert.deepEqual(body.system, [{ type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } }])
  assert.deepEqual(body.tools[0].cache_control, { type: 'ephemeral' })
  assert.equal(body.tools[0].input_schema.type, 'object')
  assert.deepEqual(body.messages, [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }])
})

test('default effort, off spellings and legacy budgets follow each model', async () => {
  const profile = defaultProfile()
  profile.models.push(presetModel('claude-haiku-4-5'), presetModel('claude-opus-5'))
  const server = fakeServer(...Array.from({ length: 5 }, () => response([{ type: 'text', text: 'ok' }])))
  const { adapter } = makeAdapter(server, { profile })
  const run = (model, effort) => collect(adapter.stream({ provider: 'claude-native', model, messages: [user('x')], ...(effort ? { reasoningEffort: ReasoningEffortId(effort) } : {}) }))
  await run(opus)
  await run('claude-sonnet-5-5', 'off')
  await run('claude-haiku-4-5', 'high')
  await run('claude-haiku-4-5')
  await run('claude-opus-5', 'off')
  const bodies = server.requests.map(item => item.body)
  assert.deepEqual(bodies[0].output_config, { effort: 'high' })
  assert.deepEqual(bodies[1].thinking, { type: 'between_tools' })
  assert.equal(bodies[1].output_config, undefined)
  assert.deepEqual(bodies[2].thinking, { type: 'enabled', budget_tokens: 32000, display: 'summarized' })
  assert.equal(bodies[2].max_tokens, 64000)
  assert.equal(bodies[2].fallbacks, undefined, 'Haiku has no server-side fallback')
  assert.deepEqual(bodies[3].thinking, { type: 'disabled' })
  assert.deepEqual(bodies[4].thinking, { type: 'disabled' })
  await assert.rejects(run(opus, 'off'), error => error.code === 'UNSUPPORTED_REASONING_EFFORT')
})

test('stream maps thinking, text and tool calls, and the replay restores exact signed blocks', async () => {
  const first = [
    { type: 'thinking', thinking: 'Let me look.', signature: 'SIG_1' },
    { type: 'text', text: 'Reading it.' },
    { type: 'tool_use', id: 'toolu_01', name: 'read_file', input: { path: 'a.txt' } },
  ]
  const server = fakeServer(response(first, { stop: 'tool_use', usage: { input_tokens: 7, output_tokens: 30, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } }),
    response([{ type: 'text', text: 'Done.' }]))
  const { adapter } = makeAdapter(server)
  const options = { provider: 'claude-native', model: opus, messages: [user('read a.txt')], tools }
  const chunks = await collect(adapter.stream(options))
  const ends = chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.block)
  assert.deepEqual(ends, [
    { type: 'reasoning', text: 'Let me look.' },
    { type: 'text', text: 'Reading it.' },
    { type: 'tool-call', id: 'toolu_01', name: 'read_file', arguments: '{"path":"a.txt"}' },
  ])
  assert.deepEqual(chunks.find(chunk => chunk.type === 'usage').usage,
    { inputTokens: 7, outputTokens: 30, totalTokens: 157, cacheReadTokens: 100, cacheWriteTokens: 20 })
  const finish = chunks.at(-1)
  assert.equal(finish.reason.kind, 'tool-calls')
  assert.equal(finish.replayState.blocks[0].native[0].signature, 'SIG_1')

  const assistant = { role: 'assistant', id: 'a1', content: ends, source: { kind: 'model', provider: 'claude-native', model: opus, replayState: finish.replayState } }
  const result = { role: 'tool', id: 't1', toolCallId: ToolCallId('toolu_01'), content: [{ type: 'text', text: 'file body' }], source: { kind: 'tool', callId: ToolCallId('toolu_01') } }
  await collect(adapter.stream({ ...options, messages: [user('read a.txt'), assistant, result] }))
  const replayed = server.requests[1].body.messages
  assert.deepEqual(replayed[1], { role: 'assistant', content: [
    { type: 'thinking', thinking: 'Let me look.', signature: 'SIG_1' },
    { type: 'text', text: 'Reading it.' },
    { type: 'tool_use', id: 'toolu_01', name: 'read_file', input: { path: 'a.txt' } },
  ] })
  assert.deepEqual(replayed[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: [{ type: 'text', text: 'file body' }],
    cache_control: { type: 'ephemeral' } }] })
  assert.deepEqual(replayed[0].content[0].cache_control, { type: 'ephemeral' }, 'previous user turn keeps a breakpoint')
})

test('edited or foreign history degrades to plain content without forging signatures', async () => {
  const server = fakeServer(response([{ type: 'text', text: 'ok' }]), response([{ type: 'text', text: 'ok' }]))
  const { adapter } = makeAdapter(server)
  const replayState = { response: { format: 'claude-native-v1' }, blocks: [
    { native: [{ type: 'thinking', thinking: 'secret', signature: 'SIG' }, { type: 'text', text: 'original' }], block: { type: 'text', text: 'original' } },
  ] }
  const edited = { role: 'assistant', content: [{ type: 'reasoning', text: 'r' }, { type: 'text', text: 'changed' }],
    source: { kind: 'model', provider: 'claude-native', model: opus, replayState } }
  await collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [user('q'), edited, user('next')] }))
  assert.deepEqual(server.requests[0].body.messages[1], { role: 'assistant', content: [{ type: 'text', text: 'changed' }] })
  const foreign = { role: 'assistant', content: [{ type: 'tool-call', id: ToolCallId('call:1/x'), name: 'read_file', arguments: '{}' }],
    source: { kind: 'model', provider: 'openai', model: 'gpt' } }
  const result = { role: 'tool', toolCallId: ToolCallId('call:1/x'), content: [{ type: 'text', text: 'r' }], source: { kind: 'tool', callId: ToolCallId('call:1/x') } }
  await collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [user('q'), foreign, result] }))
  const messages = server.requests[1].body.messages
  assert.equal(messages[1].content[0].id, 'call_1_x')
  assert.equal(messages[2].content[0].tool_use_id, 'call_1_x')
})

test('gateway settings: bearer auth, /v1 root, version override, headers and extra body', async () => {
  const profile = defaultProfile()
  Object.assign(profile, { authMode: 'bearer', baseURL: 'https://relay.example.com/v1/', anthropicVersion: '2026-10-21',
    headers: { 'x-relay': 'yes' }, betas: ['context-management-2025-06-27'], extraBody: { inference_geo: 'us' }, cache: { enabled: true, ttl: '1h' } })
  const server = fakeServer(response([{ type: 'text', text: 'ok' }]))
  const { adapter } = makeAdapter(server, { profile })
  await collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [user('x')] }))
  const [request] = server.requests
  assert.equal(request.url, 'https://relay.example.com/v1/messages?beta=true')
  assert.equal(request.headers.get('authorization'), 'Bearer sk-test-only')
  assert.equal(request.headers.get('x-api-key'), null)
  assert.equal(request.headers.get('anthropic-version'), '2026-10-21')
  assert.equal(request.headers.get('x-relay'), 'yes')
  assert.equal(request.headers.get('anthropic-beta'), 'context-management-2025-06-27', 'auto fallback stays off on gateways')
  assert.equal(request.body.inference_geo, 'us')
  assert.deepEqual(request.body.messages[0].content[0].cache_control, { type: 'ephemeral', ttl: '1h' })
})

test('server web search pauses, resumes and surfaces sources with exact replay', async () => {
  const profile = defaultProfile()
  profile.webSearch = { enabled: true, maxUses: 3 }
  const search = { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'dsh harness' } }
  const results = { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [
    { type: 'web_search_result', url: 'https://example.com/a', title: 'Example A', encrypted_content: 'ENC', page_age: null }] }
  const citation = { type: 'web_search_result_location', url: 'https://example.com/a', title: 'Example A', cited_text: 'x', encrypted_index: 'IDX' }
  const server = fakeServer(response([search, results], { stop: 'pause_turn' }), response([{ type: 'text', text: 'Answer.', citations: [citation] }]))
  const { adapter } = makeAdapter(server, { profile })
  const chunks = await collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [user('search')] }))
  assert.deepEqual(server.requests[0].body.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, cache_control: { type: 'ephemeral' } }])
  assert.equal(server.requests.length, 2)
  assert.deepEqual(server.requests[1].body.messages.at(-1), { role: 'assistant', content: [search, results] })
  const texts = chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.block.text)
  assert.match(texts[0], /网页搜索：dsh harness/)
  assert.match(texts[1], /1 条搜索结果/)
  assert.equal(texts[2], 'Answer.')
  assert.match(texts[3], /\[Example A\]\(https:\/\/example.com\/a\)/)
  const replay = chunks.at(-1).replayState
  assert.deepEqual(replay.blocks.map(entry => entry.native.map(block => block.type)), [['server_tool_use'], ['web_search_tool_result'], ['text'], []])
  assert.deepEqual(replay.blocks[2].native[0].citations, [citation])
})

test('refusals, overflow, overload and rate limits map to stable dsh codes', async () => {
  const json = (status, type, message, headers = {}) => new Response(JSON.stringify({ type: 'error', error: { type, message } }),
    { status, headers: { 'content-type': 'application/json', 'request-id': 'req_err', ...headers } })
  const server = fakeServer(
    response([], { stop: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: 'declined' } }),
    json(400, 'invalid_request_error', 'prompt is too long: 1200000 tokens > 1000000 maximum'),
    json(529, 'overloaded_error', 'Overloaded'),
    json(429, 'rate_limit_error', 'slow down', { 'retry-after': '3' }),
    json(401, 'authentication_error', 'invalid x-api-key'),
  )
  const { adapter } = makeAdapter(server)
  const run = () => collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [user('x')] }))
  await assert.rejects(run(), error => error.code === 'CONTENT_FILTER' && /cyber/.test(error.message))
  await assert.rejects(run(), error => error.code === 'CONTEXT_WINDOW_EXCEEDED' && error.failure.status === 400 && error.failure.requestId === 'req_err')
  await assert.rejects(run(), error => error.code === 'SERVER')
  await assert.rejects(run(), error => error.code === 'RATE_LIMIT' && error.failure.providerRetryAfterMs === 3000)
  await assert.rejects(run(), error => error.code === 'AUTH' && !/sk-test-only/.test(error.message))
})

test('images in user turns and tool results are sent as native base64 blocks', async () => {
  const server = fakeServer(response([{ type: 'text', text: 'ok' }]))
  const png = Buffer.from('89504e470d0a1a0a', 'hex')
  const targets = []
  const attachments = { readImageRequest: async (ref, target) => { targets.push(target); return { data: png, mediaType: ref.mediaType } } }
  const { adapter } = makeAdapter(server, { attachments })
  const image = { type: 'image', attachment: { attachmentId: 'img', mediaType: 'image/png', bytes: 9_000_000, width: 10000, height: 5000 } }
  const call = { role: 'assistant', content: [{ type: 'tool-call', id: ToolCallId('toolu_9'), name: 'shot', arguments: '{}' }], source: { kind: 'model', provider: 'x', model: 'y' } }
  const result = { role: 'tool', toolCallId: ToolCallId('toolu_9'), content: [{ type: 'text', text: 'screenshot' }, image], source: { kind: 'tool', callId: ToolCallId('toolu_9') } }
  await collect(adapter.stream({ provider: 'claude-native', model: opus, messages: [{ role: 'user', content: [image, { type: 'text', text: 'see' }] }, call, result] }))
  const messages = server.requests[0].body.messages
  assert.deepEqual(messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } })
  assert.equal(messages[2].content[0].content[1].type, 'image')
  assert.deepEqual(targets[0], { width: 8000, height: 4000, maxBytes: 3_750_000 })
})
