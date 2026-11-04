import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import Anthropic from '@anthropic-ai/sdk'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, createUserMessage, projectFilesToText } from '@deepseek-ai/dsh-llm'
import { bundlePatchPaths, loadOverlayPatches, composeEntries, evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'
import { ClaudeNativeAdapter } from '../lib/adapter.js'
import { defaultProfile, validateProfile } from '../lib/config.js'
import { registerNativeFileBridge, restoreNativeFiles, withOriginalRequest } from '../lib/file-scope.js'
import { describeModel } from '../lib/discovery.js'
import * as ClaudePlugin from '../lib/index.js'
import { collect, fakeServer, response } from './helpers.mjs'
import { realSettingsProfile } from './helpers/real-settings-profile.mjs'

function runtimeFixture(server, bytes) {
  const ctx = new Context()
  new LlmRuntime(ctx)
  ctx.provide('attachments', { fileHostPath: () => undefined, async *readFileStream() { yield bytes } })
  let profile = defaultProfile()
  const adapter = new ClaudeNativeAdapter(ctx, { profile: () => profile, resolveApiKey: async () => 'sk-test-only',
    createClient: options => new Anthropic({ ...options, fetch: server.fetch }) })
  ctx.llm.registerAdapter(['claude-native'], adapter)
  registerNativeFileBridge(ctx)
  return { ctx, setProfile: value => { profile = value }, profile: () => profile }
}

test('actual rc.5 LlmRuntime sends user PDFs as native document blocks beside core path hints', async () => {
  const bytes = Buffer.from('%PDF-1.7\nnative attachment')
  const server = fakeServer(response([{ type: 'text', text: 'read' }]))
  const { ctx } = runtimeFixture(server, bytes)
  const message = createUserMessage({ source: { kind: 'user' }, content: [
    { type: 'text', text: 'Summarize' }, { type: 'file', attachment: { attachmentId: 'a'.repeat(64), name: 'report.pdf', bytes: bytes.length } },
  ] })
  const chunks = await collect(ctx.llm.stream({ provider: 'claude-native', model: 'claude-opus-5-5', messages: [message] }))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  const content = server.requests[0].body.messages[0].content
  assert.equal(content[0].text, 'Summarize')
  assert.match(content[1].text, /attached natively below/)
  assert.deepEqual(content[2], { type: 'document', title: 'report.pdf', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
    cache_control: { type: 'ephemeral' } })
})

test('bridge leaves non-PDF files as core text and skips models without PDF input', async () => {
  const original = { provider: 'claude-native', model: 'm', messages: [{ id: 'u1', role: 'user', content: [
    { type: 'file', attachment: { attachmentId: 'b', name: 'notes.txt', bytes: 3 } },
    { type: 'file', attachment: { attachmentId: 'c', name: 'doc.pdf', bytes: 3 } }] }] }
  const projected = { ...original, messages: projectFilesToText(original.messages, () => '/read-only/x') }
  let restored
  for await (const _ of withOriginalRequest(original, async function* () {
    restored = restoreNativeFiles(projected, block => block.type === 'file' && block.attachment.name.endsWith('.pdf'))
    yield { type: 'finish', reason: { kind: 'stop' } }
  })) { /* drain */ }
  assert.deepEqual(restored.messages[0].content.map(block => block.type), ['text', 'text', 'file'])
  assert.equal(restoreNativeFiles(projected, () => true), projected, 'outside the scope nothing is restored')
})

test('actual rc.5 prepared call keeps its captured Claude generation across edits', async () => {
  const server = fakeServer(response([{ type: 'text', text: 'ok' }]))
  const fixture = runtimeFixture(server, Buffer.alloc(0))
  fixture.profile().models[0].maxTokens = 4096
  const prepared = await fixture.ctx.llm.prepareCall({ provider: 'claude-native', model: 'claude-opus-5-5' })
  const replacement = structuredClone(fixture.profile())
  replacement.models[0].maxTokens = 999
  replacement.baseURL = 'https://elsewhere.example'
  fixture.setProfile(replacement)
  const chunks = await collect(prepared.stream({ ...prepared.config, messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'x' }] })] }))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.equal(server.requests[0].body.max_tokens, 4096)
  assert.match(server.requests[0].url, /^https:\/\/api\.anthropic\.com\//)
})

test('plugin registers route, directory entry, catalog and reasoning metadata', async () => {
  const ctx = new Context()
  new LlmRuntime(ctx)
  ctx.provide('attachments', { fileHostPath: () => undefined })
  await ctx.plugin(ClaudePlugin, {})
  assert.deepEqual(ctx.llm.listProviders().map(value => value.id), ['claude-native'])
  assert.equal(ctx.llm.listConfigurableProviders()[0].settingsNs, 'dsh-claude-native')
  const models = await ctx.llm.listModels('claude-native')
  assert.deepEqual(models.map(model => model.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'])
  const resolved = await ctx.llm.resolveModelInfo('claude-native', 'claude-sonnet-5-5')
  assert.equal(resolved.context.contextWindow, 1_000_000)
  assert.equal(resolved.defaultMaxTokens, 128_000)
  assert.deepEqual(resolved.reasoning.efforts.map(effort => effort.id), ['off', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(resolved.reasoning.defaultEffort, 'high')
  assert.equal(typeof ctx.nativeClaude.client, 'function')
})

test('package bundle composes one entry and declares rc.5 compatibility', async () => {
  const directory = fileURLToPath(new URL('../', import.meta.url))
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const patches = bundlePatchPaths(directory, manifest.dsh.bundle).map(path => loadOverlayPatches('dsh-claude-native packaging test', path))
  const entries = composeEntries(patches)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 'dsh-claude-native')
  assert.equal(evaluatePluginCompatibility(manifest, {}, '0.2.1-rc.5'), undefined)
  assert.ok(manifest.files.includes('cordis.patch.yml'))
})

test('validation rejects unserviceable profiles before they are saved', () => {
  const bad = mutate => { const profile = defaultProfile(); mutate(profile); assert.throws(() => validateProfile(profile), error => error.code === 'INVALID_CONFIG') }
  bad(profile => { profile.baseURL = 'https://user:pw@relay.example' })
  bad(profile => { profile.headers = { 'x-api-key': 'leak' } })
  bad(profile => { profile.models[0].defaultEffort = 'nope' })
  bad(profile => { profile.models[0].efforts = [{ id: 'b', name: 'b', thinking: 'enabled', budgetTokens: 512 }] })
  bad(profile => { profile.models[0].maxTokens = 2_000_000 })
  bad(profile => { profile.extraBody = { messages: [] } })
  bad(profile => { profile.anthropicVersion = 'latest' })
  bad(profile => { profile.models.push(structuredClone(profile.models[0])) })
  assert.equal(validateProfile(defaultProfile()).provider, 'claude-native')
  const bare = validateProfile({ ...defaultProfile(), models: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-opus-5-5', efforts: [], fallback: false }, { id: 'custom' }] })
  assert.equal(bare.models[0].efforts[0].thinking, 'between_tools')
  assert.deepEqual(bare.models[1].efforts, [])
  assert.equal(bare.models[1].fallback, false)
  assert.deepEqual(bare.models[2], { id: 'custom' })
})

test('discovery keeps verified presets and derives levels for unknown models', () => {
  const known = describeModel({ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', max_input_tokens: 1_000_000, max_tokens: 128_000 })
  assert.equal(known.efforts[0].thinking, 'between_tools')
  const unknown = describeModel({ id: 'claude-next', display_name: 'Next', max_input_tokens: 500_000, max_tokens: 64_000, capabilities: {
    image_input: { supported: true }, pdf_input: { supported: false },
    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } },
    effort: { supported: true, low: { supported: true }, medium: { supported: true }, high: { supported: true }, xhigh: { supported: false }, max: { supported: true } },
  } })
  assert.deepEqual(unknown.inputTypes, ['text', 'image'])
  assert.deepEqual(unknown.efforts.map(item => item.id), ['low', 'medium', 'high', 'max'])
  assert.equal(unknown.defaultEffort, 'high')
  assert.equal(describeModel({ id: '../evil' }), undefined)
})

test('real rc.5 settings forms persist UI saves field by field and keep host-only options', async t => {
  const config = { claude: { extraBody: { inference_geo: 'us' }, headers: { 'x-relay': 'kept' },
    models: [{ id: 'claude-opus-5-5', name: 'Opus', extraBody: { speed: 'fast' }, betas: ['fast-mode-2026-02-01'] }] } }
  const { ctx, dir, values, credentialWrites } = await realSettingsProfile(t, { config })
  const before = await ctx.nativeClaudeSettings.get({}, new AbortController().signal)
  assert.equal(before.models.length, 1)
  assert.equal(before.models[0].name, 'Opus', 'explicit fields win over the preset')
  assert.equal(before.models[0].defaultEffort, 'high', 'absent fields inherit the verified preset')
  assert.doesNotMatch(JSON.stringify(before), /inference_geo|x-relay|fast-mode/)
  const sonnet = before.presets.find(preset => preset.id === 'claude-sonnet-5-5')
  const saved = await ctx.nativeClaudeSettings.save({
    connection: { ...before.connection, baseURL: 'https://relay.example.com', authMode: 'bearer', webSearch: { enabled: true, maxUses: 2 } },
    models: [{ ...before.models[0], contextWindow: 500_000 }, sonnet], apiKey: 'sk-ant-test-value', expectedRevision: before.revision,
  }, new AbortController().signal)
  assert.equal(saved.connection.authMode, 'bearer')
  assert.equal(saved.models[1].efforts[0].thinking, 'between_tools')
  assert.deepEqual(credentialWrites, [{ ref: 'ANTHROPIC_API_KEY', value: 'sk-ant-test-value' }])
  const persisted = parseYaml(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'))
  // The original insert stays; settings writes land in a later id-targeted patch entry.
  const claude = persisted.filter(item => item.id === 'dsh-claude-native').at(-1).config.claude
  assert.equal(claude.baseURL, 'https://relay.example.com')
  assert.deepEqual(claude.extraBody, { inference_geo: 'us' })
  assert.deepEqual(claude.headers, { 'x-relay': 'kept' })
  assert.deepEqual(claude.models[0].extraBody, { speed: 'fast' })
  assert.deepEqual(claude.models[0].betas, ['fast-mode-2026-02-01'])
  assert.equal(claude.models[0].contextWindow, 500_000)
  assert.doesNotMatch(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), /sk-ant-test-value/)
  assert.equal(values.get('ANTHROPIC_API_KEY'), 'sk-ant-test-value')
  await assert.rejects(ctx.nativeClaudeSettings.save({ connection: saved.connection, models: saved.models, expectedRevision: before.revision }, new AbortController().signal),
    error => error.code === 'native-claude/settings-conflict')
  await assert.rejects(ctx.nativeClaudeSettings.save({ connection: saved.connection, models: [{ id: 'claude-x', maxTokens: 10, contextWindow: 5 }], expectedRevision: saved.revision }, new AbortController().signal),
    error => error.code === 'native-claude/invalid-settings' && /最大输出/.test(error.message))
})
