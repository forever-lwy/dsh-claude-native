import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })
const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { ProviderSettingsPage, ProviderSettings } = await import('../../lib/client/ProviderSettings.js')
const { zh } = await import('../../lib/client/locales.js')
const { presetModel } = await import('../../lib/config.js')
const { viewModel, viewConnection } = await import('../../lib/provider-settings.js')
const { defaultProfile } = await import('../../lib/config.js')

const t = key => zh[key]
const snapshot = () => ({ settingsNs: 'dsh-claude-native', revision: 3, writable: true,
  connection: viewConnection(defaultProfile()), credential: { configured: true, writable: true },
  models: [viewModel(presetModel('claude-opus-5-5'))], presets: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].map(id => viewModel(presetModel(id))) })

function setValue(element, value) {
  act(() => setRaw(element, value))
}
function setRaw(element, value) {
  const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}
const click = element => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const button = (root, text) => [...root.querySelectorAll('button')].find(item => item.textContent === text)
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

test('card renders only for the Claude route', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(React.createElement(ProviderSettings, { provider: { provider: 'google-ai-studio' }, t, useRemoteAccess: () => true })))
  assert.equal(container.innerHTML, '')
  await act(async () => root.render(React.createElement(ProviderSettings, { provider: { provider: 'claude-native' }, t, useRemoteAccess: () => true, read: async () => snapshot() })))
  assert.equal(container.querySelector('button').textContent, zh.configure)
  act(() => root.unmount())
})

test('settings page edits connection, adds a preset model, edits efforts and saves the exact payload', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const saves = []
  const root = createRoot(container)
  await act(async () => root.render(React.createElement(ProviderSettingsPage, { t, useRemoteAccess: () => true,
    read: async () => snapshot(), discover: async () => ({ models: [] }),
    save: async request => { saves.push(request); return { ...snapshot(), revision: 4, connection: request.connection, models: request.models } } })))
  await flush()
  setValue(container.querySelector('[data-claude-setting=baseURL]'), 'https://relay.example.com')
  setValue(container.querySelector('[data-claude-setting=authMode]'), 'bearer')
  setValue(container.querySelector('[data-claude-setting=apiKey]'), 'sk-ant-ui-test')
  const manual = container.querySelector(`input[placeholder="${zh.manualPlaceholder}"]`)
  setValue(manual, 'claude-haiku-4-5-20251001')
  await act(async () => click(button(container, zh.add)))
  const haiku = container.querySelector('[data-claude-model="claude-haiku-4-5-20251001"]')
  assert.ok(haiku, 'dated snapshot id resolves to the preset')
  await act(async () => click(haiku.querySelector('button')))
  const budget = haiku.querySelector('[data-claude-effort=high] input[aria-label="预算 tokens"]')
  setValue(budget, '20000')
  const context = haiku.querySelector(`input[aria-label="${zh.contextWindow}"]`)
  setValue(context, '12x')
  await act(async () => click(button(container, zh.save)))
  assert.equal(saves.length, 0, 'invalid numbers block saving')
  assert.match(container.textContent, new RegExp(zh.invalidNumber))
  setValue(context, '150000')
  await act(async () => click(button(container, zh.save)))
  await flush()
  assert.equal(saves.length, 1)
  const [request] = saves
  assert.equal(request.expectedRevision, 3)
  assert.equal(request.apiKey, 'sk-ant-ui-test')
  assert.equal(request.connection.baseURL, 'https://relay.example.com')
  assert.equal(request.connection.authMode, 'bearer')
  const saved = request.models.find(model => model.id === 'claude-haiku-4-5-20251001')
  assert.equal(saved.contextWindow, 150000)
  assert.deepEqual(saved.efforts.find(item => item.id === 'high'), { id: 'high', name: '高 (32k tokens)', thinking: 'enabled', budgetTokens: 20000 })
  assert.match(container.textContent, new RegExp(zh.saved))
  act(() => root.unmount())
})
