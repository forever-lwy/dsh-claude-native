import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })
const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { NativeOptions } = await import('../../lib/client/NativeOptions.js')
const { chatZh } = await import('../../lib/client/locales.js')

function store(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) { value = next; listeners.forEach(listener => listener()) } }
}
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

test('composer control appears for Claude routes and saves a toggled choice while blocking send', async () => {
  const directory = store({ status: 'ready', current: { provider: 'claude-native', model: 'claude-opus-5-5' } })
  const saves = [], blocks = []
  let state = { provider: 'claude-native', model: 'claude-opus-5-5', revision: 2,
    capabilities: { nativeFiles: true, webSearch: true, webFetch: true }, choices: { nativeFiles: true, webSearch: false, webFetch: false } }
  const props = {
    available: true, directory, loadDirectory() {}, t: key => chatZh[key],
    useSession: select => select({ running: false, awaitingFirstTurn: false, pendingSubmissions: [] }), useAccess: () => true,
    read: async () => state,
    save: async (route, choices, revision) => { saves.push({ route, choices, revision }); state = { ...state, choices, revision: revision + 1 }; return state },
    beginSave: reason => { blocks.push(reason); return () => blocks.push('released') },
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(React.createElement(NativeOptions, props)))
  await flush()
  const trigger = container.querySelector('[data-claude-native-control]')
  assert.ok(trigger)
  await act(async () => trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  const panel = document.querySelector('[data-claude-native-panel]')
  assert.match(panel.textContent, new RegExp(chatZh.nativeFiles))
  await act(async () => panel.querySelector('[data-claude-choice=webSearch]').click())
  await flush()
  assert.deepEqual(saves, [{ route: { provider: 'claude-native', model: 'claude-opus-5-5' }, choices: { nativeFiles: true, webSearch: true, webFetch: false }, revision: 2 }])
  assert.deepEqual(blocks, [chatZh.saving, 'released'])
  assert.ok(container.querySelector('.dsh-claude-native-dot'), 'an enabled server tool is indicated on the trigger')
  await act(async () => directory.set({ status: 'ready', current: { provider: 'google-ai-studio', model: 'gemini' } }))
  await flush()
  assert.equal(container.querySelector('[data-claude-native-control]'), null, 'other providers show no Claude control')
  act(() => root.unmount())
})
