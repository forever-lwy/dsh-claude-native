import test from 'node:test'
import assert from 'node:assert/strict'
import { translateMessages } from '../lib/messages.js'
import { requestPrefixDigest } from '../lib/prefix-binding.js'
import { collect, fakeServer, makeAdapter, response, user } from './helpers.mjs'
import { realSettingsProfile } from './helpers/real-settings-profile.mjs'

const policy = { serverTools: new Set(), fallbacks: false }
const base = () => ({ provider: 'claude-native', model: 'claude-opus-5-5', system: 'original system', messages: [user('original question')] })
const absent = code => Object.assign(new Error('missing bytes'), { code })

for (const code of ['ATTACHMENT_NOT_FOUND', 'INVALID_ATTACHMENT_REF']) {
  test(`imported PDF ${code} does not prevent a native request`, async () => {
    const server = fakeServer(response([{ type: 'text', text: 'Upload the original file again.' }]))
    const { adapter } = makeAdapter(server, { attachments: { async *readFileStream() { throw absent(code) } } })
    const options = base()
    options.messages[0].content.push({ type: 'file', attachment: { attachmentId: `sha256:${'a'.repeat(64)}`, name: 'import.pdf', bytes: 12 } })
    await collect(adapter.stream(options))
    const content = server.requests[0].body.messages[0].content
    assert.ok(content.some(part => part.text?.includes('original contents are not stored')))
    assert.ok(content.every(part => part.type !== 'document'))
  })
}

test('PDF read errors and cancellation do not silently become missing-file notices', async () => {
  const options = base()
  options.messages[0].content.push({ type: 'file', attachment: { attachmentId: 'a', name: 'file.pdf', bytes: 12 } })
  const failure = new Error('I/O failed')
  await assert.rejects(translateMessages(options, { policy, attachments: { async *readFileStream() { throw failure } } }), error => error === failure)
  const controller = new AbortController()
  await assert.rejects(translateMessages({ ...options, signal: controller.signal }, { policy, attachments: { async *readFileStream() {
    controller.abort(); throw absent('ATTACHMENT_NOT_FOUND')
  } } }), error => error.name === 'AbortError')
})

test('signed thinking survives an unchanged prefix and is omitted after compaction, tool or system changes', async () => {
  const original = base()
  const block = { type: 'text', text: 'answer' }
  const assistant = { role: 'assistant', content: [block], source: { kind: 'model', provider: original.provider,
    replayState: { response: { format: 'claude-native-v1', prefixDigest: requestPrefixDigest(original) }, blocks: [{ block,
      native: [{ type: 'thinking', thinking: 'reasoning', signature: 'signed' }, { type: 'redacted_thinking', data: 'redacted' }, block] }] } } }
  const replay = async options => (await translateMessages(options, { policy })).messages.find(message => message.role === 'assistant').content
  const unchanged = { ...original, messages: [...original.messages, assistant, user('next')] }
  assert.equal((await replay(unchanged)).filter(block => /thinking/.test(block.type)).length, 2)
  for (const modified of [
    { ...unchanged, system: 'new system' },
    { ...unchanged, tools: [{ name: 'new_tool', description: 'new', parameters: { type: 'object' } }] },
    { ...unchanged, messages: [user('compacted'), assistant, user('next')] },
  ]) assert.deepEqual((await replay(modified)).map(block => block.type), ['text'])
  const legacy = structuredClone(unchanged)
  delete legacy.messages[1].source.replayState.response.prefixDigest
  assert.deepEqual((await replay(legacy)).map(block => block.type), ['text'])
  const toolRound = { ...legacy, messages: [...legacy.messages.slice(0, 2), { role: 'tool', toolCallId: 'call', content: [block] }] }
  const manual = await translateMessages(toolRound, { policy, manualThinking: true })
  assert.equal(manual.messages[1].content[0].type, 'thinking')
})

test('the registered native route publishes its configured framework retry policy', async t => {
  const { ctx } = await realSettingsProfile(t, { config: { claude: { retryPolicy: { mode: 'normal', maxRetries: 2, retryableCodes: ['SERVER'] } } } })
  assert.equal(ctx.llm.providerRetryPolicy('claude-native').maxRetries, 2)
  assert.deepEqual(ctx.llm.providerRetryPolicy('claude-native').retryableCodes, ['SERVER'])
})
