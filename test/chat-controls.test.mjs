import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { registerClaudeChatControls } from '../lib/chat-controls.js'
import { readChatChoices } from '../lib/chat-remote.js'
import { defaultProfile, presetModel } from '../lib/config.js'
import { CLAUDE_NATIVE_FILE_TOOL, registerNativeFileTool } from '../lib/native-file-tool.js'
import { withOriginalRequest } from '../lib/file-scope.js'
import { ReactLoopInbox, inboxProjectionDefinition } from './helpers/real-inbox.mjs'
import { collect, fakeServer, makeAdapter, response } from './helpers.mjs'

const provider = 'claude-native'
const model = 'claude-opus-5-5'
const signal = () => new AbortController().signal

function fixture() {
  const ctx = new Context()
  new SessionStore(ctx)
  new SessionProjectionRegistry(ctx)
  ctx.sessionProjections.register(inboxProjectionDefinition)
  const session = ctx.sessions.create(SessionId(`claude-chat-${Math.random()}`), { seed: [] })
  const profile = defaultProfile()
  profile.models.push({ ...presetModel('claude-haiku-4-5'), webTools: 'none' })
  let flushes = 0
  ctx.on('session/flush', () => { flushes++ })
  ctx.provide('typert', { remotes: { register() { return async () => {} } } })
  const agent = { id: session.id, session, status: 'idle' }
  agent.inbox = new ReactLoopInbox(ctx.sessionProjections, session, { emit() {} })
  ctx.provide('sessionController', {
    async resolveAgent(id) { return id === session.id ? { agent } : { error: new Error('wrong session') } },
    async inspect() { throw new Error('not used') },
  })
  const controls = registerClaudeChatControls(ctx, () => profile)
  return { ctx, session, agent, profile, controls, request: { sessionId: session.id, provider, model }, flushes: () => flushes }
}

test('per-session options start from provider defaults, persist durably and respect model capabilities', async () => {
  const f = fixture()
  f.profile.webFetch.enabled = true
  const before = await f.controls.get(f.request, signal())
  assert.deepEqual(before.capabilities, { nativeFiles: true, webSearch: true, webFetch: true })
  assert.deepEqual(before.choices, { nativeFiles: true, webSearch: false, webFetch: true })
  const after = await f.controls.set({ ...f.request, choices: { nativeFiles: false, webSearch: true, webFetch: false }, expectedRevision: 0 }, signal())
  assert.equal(after.revision, 1)
  assert.deepEqual(after.choices, { nativeFiles: false, webSearch: true, webFetch: false })
  assert.equal(f.flushes(), 1)
  assert.equal(f.session.snapshotEvents().at(-1).type, 'plugin:dsh-claude-native/chat-controls')
  await assert.rejects(f.controls.set({ ...f.request, choices: after.choices, expectedRevision: 0 }, signal()), error => error.code === 'native-claude/conflict')
  const haiku = { ...f.request, model: 'claude-haiku-4-5' }
  assert.deepEqual((await f.controls.get(haiku, signal())).capabilities, { nativeFiles: true, webSearch: false, webFetch: false })
  await assert.rejects(f.controls.set({ ...haiku, choices: { nativeFiles: true, webSearch: true, webFetch: false }, expectedRevision: 1 }, signal()))
  f.agent.status = 'running'
  await assert.rejects(f.controls.set({ ...f.request, choices: after.choices, expectedRevision: 1 }, signal()), error => error.code === 'session/agent-busy')
})

test('accepted prompts are stamped with immutable choices without cancelling the pending submission', async () => {
  const f = fixture()
  await f.controls.set({ ...f.request, choices: { nativeFiles: false, webSearch: true, webFetch: false }, expectedRevision: 0 }, signal())
  const prompt = createUserMessage({ source: { kind: 'user', rpcId: 'rpc-1' }, content: [{ type: 'text', text: 'hi' }] })
  f.agent.inbox.append('next-turn', prompt)
  f.controls.stamp(f.agent, prompt)
  const stamped = f.agent.inbox.nextTurn[0]
  f.controls.stamp(f.agent, stamped)
  assert.equal(stamped.id, prompt.id)
  assert.equal(stamped.source.rpcId, 'rpc-1')
  assert.deepEqual(readChatChoices(stamped.source, provider, model), { nativeFiles: false, webSearch: true, webFetch: false })
  assert.equal(f.session.snapshotEvents().filter(event => event.type === 'agent/inbox/spliced' && event.data.removedCount === 1).length, 1)
  await f.controls.set({ ...f.request, choices: { nativeFiles: true, webSearch: false, webFetch: false }, expectedRevision: 1 }, signal())
  assert.equal(readChatChoices(stamped.source, provider, model).webSearch, true, 'later toggles never rewrite an accepted prompt')
})

const stampedUser = (choices, content, id = 'u1') => ({ id, role: 'user', content,
  source: { kind: 'user', claudeNative: { version: 1, selections: [{ provider, model, choices }] } } })

test('the newest prompt decides web tools, overriding provider defaults in both directions', async () => {
  const profile = defaultProfile()
  profile.webSearch.enabled = true
  const server = fakeServer(response([{ type: 'text', text: 'a' }]), response([{ type: 'text', text: 'b' }]), response([{ type: 'text', text: 'c' }]))
  const { adapter } = makeAdapter(server, { profile })
  const text = [{ type: 'text', text: 'q' }]
  await collect(adapter.stream({ provider, model, messages: [stampedUser({ nativeFiles: true, webSearch: false, webFetch: true }, text)] }))
  assert.deepEqual(server.requests[0].body.tools.map(tool => tool.name), ['web_fetch'])
  await collect(adapter.stream({ provider, model, messages: [{ role: 'user', content: text }] }))
  assert.deepEqual(server.requests[1].body.tools.map(tool => tool.name), ['web_search'], 'unstamped requests keep the provider default')
  const search = { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'x' } }
  const earlier = { role: 'assistant', content: [{ type: 'text', text: 'found' }], source: { kind: 'model', provider, model,
    replayState: { response: { format: 'claude-native-v1' }, blocks: [{ native: [search, { type: 'text', text: 'found' }], block: { type: 'text', text: 'found' } }] } } }
  await collect(adapter.stream({ provider, model, messages: [stampedUser({ nativeFiles: true, webSearch: true, webFetch: false }, text, 'u0'), earlier,
    stampedUser({ nativeFiles: true, webSearch: false, webFetch: false }, text)] }))
  const body = server.requests[2].body
  assert.equal(body.tools, undefined)
  assert.deepEqual(body.messages[1], { role: 'assistant', content: [{ type: 'text', text: 'found' }] }, 'server-tool history degrades once the tool is off')
})

test('PDF mode follows each originating prompt, and attach-tool results are always native', async () => {
  const pdf = Buffer.from('%PDF-1.7\nbytes')
  const attachments = { fileHostPath: () => undefined, async *readFileStream() { yield pdf } }
  const server = fakeServer(response([{ type: 'text', text: 'ok' }]))
  const { adapter } = makeAdapter(server, { attachments })
  const file = (name, id) => ({ type: 'file', attachment: { attachmentId: id, name, bytes: pdf.length } })
  const call = ToolCallId('toolu_attach')
  const original = { provider, model, messages: [
    stampedUser({ nativeFiles: false, webSearch: false, webFetch: false }, [file('local.pdf', 'a')], 'u1'),
    { id: 'a1', role: 'assistant', content: [{ type: 'tool-call', id: call, name: CLAUDE_NATIVE_FILE_TOOL, arguments: '{"path":"x.pdf"}' }], source: { kind: 'model', provider: 'other', model: 'm' } },
    { id: 't1', role: 'tool', toolCallId: call, content: [file('x.pdf', 'b')], source: { kind: 'tool', callId: call } },
    stampedUser({ nativeFiles: true, webSearch: false, webFetch: false }, [file('native.pdf', 'c')], 'u2'),
  ] }
  const projected = { ...original, messages: original.messages.map(message => ({ ...message,
    content: message.content.map(block => block.type === 'file' ? { type: 'text', text: `[path of ${block.attachment.name}]` } : block) })) }
  for await (const _ of withOriginalRequest(original, () => adapter.stream(projected))) { /* drain */ }
  const messages = server.requests[0].body.messages
  const types = messages.map(message => message.content.map(block => block.type === 'tool_result' ? `tool_result(${block.content.map(part => part.type)})` : block.type))
  assert.deepEqual(types, [['text'], ['tool_use'], ['tool_result(text,document)', 'text', 'document']])
})

function toolFixture(t, { choices = { nativeFiles: true, webSearch: false, webFetch: false }, data = Buffer.from('%PDF-1.7\nraw\u0000'), path = '/workspace/report.pdf' } = {}) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new SystemPrompt(ctx, {})
  new ToolRuntime(ctx)
  const entries = new Map([[path, { bytes: data, version: 'v1', type: 'file' }]])
  const reads = [], saved = []
  ctx.provide('fs', {
    async resolve(target, options = {}) { const key = posix.resolve(options.cwd ?? '/workspace', target); return { targetKey: key, displayPath: key } },
    contains(parent, child) { return child.targetKey === parent.targetKey || child.targetKey.startsWith(parent.targetKey + '/') },
    async stat(target) { const value = entries.get(target.targetKey); return value && { type: value.type, size: value.bytes.length, version: value.version } },
    async readByteRange(target, range) { reads.push(range); return entries.get(target.targetKey).bytes.subarray(range.offset, range.offset + range.length) },
  })
  ctx.provide('workingDirectory', { get: () => '/workspace' })
  const ref = bytes => ({ attachmentId: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
  ctx.provide('attachments', {
    async saveFile({ data, name }) { saved.push({ kind: 'file', data: Buffer.from(data) }); return { ...ref(data), name } },
    async saveImage({ data, mediaType, name }) { saved.push({ kind: 'image', data: Buffer.from(data), mediaType }); return { ...ref(data), mediaType, width: 1, height: 1, name } },
  })
  const profile = defaultProfile()
  const agent = { options: { provider, model }, session: { id: 's', header: { cwd: '/workspace' }, requestHeader: () => ({ config: agent.options }) } }
  registerNativeFileTool(ctx, { profile: () => profile, choices: () => choices })
  const call = (args = { path }) => ctx.tools.execute({ callId: 'c1', name: CLAUDE_NATIVE_FILE_TOOL, arguments: args, agent, signal: new AbortController().signal })
  return { ctx, call, saved, reads, entries, agent, setChoices: value => { choices = value } }
}

test('attach tool stores exact PDF or image bytes and refuses other types, outside paths and disabled conversations', async t => {
  const f = toolFixture(t)
  const result = await f.call()
  assert.equal(result.isError, false, JSON.stringify(result.content))
  assert.equal(result.content[0].type, 'file')
  assert.deepEqual(f.saved[0].data, Buffer.from('%PDF-1.7\nraw\u0000'))
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex')
  f.entries.set('/workspace/shot.png', { bytes: png, version: 'v1', type: 'file' })
  const image = await f.call({ path: 'shot.png' })
  assert.equal(image.content[0].type, 'image')
  assert.equal(f.saved[1].mediaType, 'image/png')
  f.entries.set('/workspace/notes.txt', { bytes: Buffer.from('hello'), version: 'v1', type: 'file' })
  assert.equal((await f.call({ path: 'notes.txt' })).isError, true)
  f.entries.set('/outside/secret.pdf', { bytes: Buffer.from('%PDF-'), version: 'v1', type: 'file' })
  const reads = f.reads.length
  assert.equal((await f.call({ path: '/outside/secret.pdf' })).isError, true)
  assert.equal(f.reads.length, reads, 'outside targets are refused before reading')
  f.setChoices({ nativeFiles: false, webSearch: false, webFetch: false })
  assert.equal((await f.call()).isError, true)
  assert.equal(f.saved.length, 2)
})

test('real rc.5 assembly shows the attach tool only while native files are on for a Claude route', async t => {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const f = toolFixture(t)
  f.ctx.tools.register(defineTool({ name: 'unrelated', description: 'Unrelated', parameters: {}, output: { schema: { type: 'boolean' }, render: () => [] }, async execute() { return true } }))
  const names = async () => (await f.ctx.systemPrompt.assemble({ agent: f.agent, scope: f.agent })).tools.map(tool => tool.name)
  assert.ok((await names()).includes(CLAUDE_NATIVE_FILE_TOOL))
  f.setChoices({ nativeFiles: false, webSearch: false, webFetch: false })
  assert.ok(!(await names()).includes(CLAUDE_NATIVE_FILE_TOOL))
  f.setChoices({ nativeFiles: true, webSearch: false, webFetch: false })
  f.agent.options = { provider: 'google-ai-studio', model: 'gemini' }
  const other = await names()
  assert.ok(!other.includes(CLAUDE_NATIVE_FILE_TOOL))
  assert.ok(other.includes('unrelated'))
})
