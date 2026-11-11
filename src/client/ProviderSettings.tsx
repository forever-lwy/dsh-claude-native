import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from './locales.js'
import type { LocaleKey } from './locales.js'
import type { ClaudeSettingsView, ConnectionView, DiscoverRequest, Discovery, EffortOptionView, ModelView, SaveRequest } from '../provider-remote.js'

export interface ProviderSettingsFace {
  read: (signal: AbortSignal) => Promise<ClaudeSettingsView>
  discover: (request: DiscoverRequest, signal: AbortSignal) => Promise<Discovery>
  save: (request: SaveRequest, signal: AbortSignal) => Promise<ClaudeSettingsView>
}
type Props = PropsRuntime<'settings.models.provider-card'> & PropsLocale<'claudeProviderSettings'> & ProviderSettingsFace
type T = (key: LocaleKey) => string
type Status = { kind: 'idle' | 'discovering' | 'saving' | 'saved' } | { kind: 'error'; message: string }

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const THINKING: { value: EffortOptionView['thinking']; label: LocaleKey }[] = [
  { value: 'adaptive', label: 'thinkingAdaptive' }, { value: 'enabled', label: 'thinkingEnabled' },
  { value: 'disabled', label: 'thinkingDisabled' }, { value: 'between_tools', label: 'thinkingBetween' }, { value: 'omit', label: 'thinkingOmit' },
]

/** Numbers stay text while edited, so partial input is never coerced. Invalid text reports NaN. */
function NumberInput({ value, onChange, disabled, min = 0, scale = 1, placeholder, label }: {
  value: number | undefined; onChange: (value: number | undefined) => void; disabled: boolean; min?: number; scale?: number; placeholder?: string; label: string
}) {
  const shown = value === undefined ? '' : String(value / scale)
  const [text, setText] = useState(shown)
  const last = useRef(value)
  if (last.current !== value && !(Number.isNaN(value) && Number.isNaN(last.current))) { last.current = value; if (!Number.isNaN(value)) setText(shown) }
  const invalid = Number.isNaN(value)
  return <input type="text" inputMode="decimal" value={text} disabled={disabled} placeholder={placeholder} aria-label={label} aria-invalid={invalid}
    onChange={event => {
      const raw = event.currentTarget.value
      setText(raw)
      const parsed = raw.trim() === '' ? undefined : Number(raw) * scale
      const next = parsed === undefined || (Number.isSafeInteger(parsed) && parsed >= min) ? parsed : NaN
      last.current = next
      onChange(next)
    }}/>
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return <label className={`dsh-claude-field${wide ? ' wide' : ''}`}><span>{label}</span>{children}{hint && <span className="dsh-claude-hint">{hint}</span>}</label>
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isNaN(value)
  if (Array.isArray(value)) return value.some(hasInvalidNumber)
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber)
  return false
}

/** Set on the host's `<li>` provider row that holds this plugin's card. */
export const NATIVE_ROW_ATTRIBUTE = 'data-dsh-claude-native-row'

/** Each Models-page provider card owns its route's configuration form. */
export function ProviderSettings(props: Props) {
  const [open, setOpen] = useState(false)
  const [visited, setVisited] = useState(false)
  const panelId = useId()
  const native = props.provider.provider === 'claude-native'
  const cardRef = useRef<HTMLDivElement>(null)
  // Mark the host's provider row so the stylesheet can address it without
  // `:has()`, which made every DOM insertion on the page restyle widely.
  useLayoutEffect(() => {
    const row = cardRef.current?.closest('li')
    if (!row) return
    row.setAttribute(NATIVE_ROW_ATTRIBUTE, '')
    return () => row.removeAttribute(NATIVE_ROW_ATTRIBUTE)
  }, [native])
  if (!native) return null
  return <div ref={cardRef} className="dsh-claude-card" data-claude-provider-card="claude-native">
    <button type="button" className="dsh-claude-button" aria-expanded={open} aria-controls={panelId}
      onClick={() => { setOpen(value => !value); setVisited(true) }}>{props.t(open ? 'closeConfiguration' : 'configure')}</button>
    <div id={panelId} hidden={!open} className="dsh-claude-panel">{visited && <ProviderSettingsPage {...props}/>}</div>
  </div>
}

export function ProviderSettingsPage({ read, discover, save, useRemoteAccess, t }: Pick<Props, 'read' | 'discover' | 'save' | 'useRemoteAccess' | 't'>) {
  const canRead = useRemoteAccess('nativeClaudeSettings/get')
  const canDiscover = useRemoteAccess('nativeClaudeSettings/discover')
  const canSave = useRemoteAccess('nativeClaudeSettings/save')
  const [snapshot, setSnapshot] = useState<ClaudeSettingsView>()
  const [connection, setConnection] = useState<ConnectionView>()
  const [models, setModels] = useState<ModelView[]>([])
  const [apiKey, setApiKey] = useState('')
  const [manual, setManual] = useState('')
  const [betasText, setBetasText] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  const [candidates, setCandidates] = useState<ModelView[]>()
  const [picked, setPicked] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const operation = useRef<AbortController>()

  const adopt = (value: ClaudeSettingsView) => {
    setSnapshot(value)
    setConnection(structuredClone(value.connection))
    setModels(structuredClone(value.models))
    setBetasText(value.connection.betas.join(', '))
    setApiKey('')
  }
  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(undefined); setLoadError(false); setStatus({ kind: 'idle' })
    if (canRead) void read(controller.signal).then(value => { if (!controller.signal.aborted) adopt(value) })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => { controller.abort(); operation.current?.abort() }
  }, [canRead, read, reload])

  if (!canRead) return <p>{t('noRead')}</p>
  if (loadError) return <div><p role="alert">{t('loadError')}</p><button type="button" className="dsh-claude-button" onClick={() => setReload(value => value + 1)}>{t('retry')}</button></div>
  if (!snapshot || !connection) return <p role="status">{t('loading')}</p>

  const editable = canSave && snapshot.writable && status.kind !== 'saving'
  const busy = status.kind === 'saving' || status.kind === 'discovering'
  const betas = betasText.split(/[,\s]+/).map(item => item.trim()).filter(Boolean)
  const draftConnection: ConnectionView = { ...connection, betas }
  const dirty = apiKey.trim() !== '' || JSON.stringify(draftConnection) !== JSON.stringify(snapshot.connection) || JSON.stringify(models) !== JSON.stringify(snapshot.models)
  const invalid = hasInvalidNumber(draftConnection) || hasInvalidNumber(models)
  const presets = new Map(snapshot.presets.map(preset => [preset.id, preset]))
  const presetOf = (id: string) => presets.get(id.replace(/^anthropic[./]/, '').replace(/[-@]\d{8}$/, ''))
  const patch = (update: Partial<ConnectionView>) => setConnection(old => old && { ...old, ...update })
  const patchModel = (id: string, update: (model: ModelView) => ModelView) => setModels(old => old.map(model => model.id === id ? update(structuredClone(model)) : model))
  const addModels = (views: ModelView[]) => setModels(old => [...old, ...views.filter(view => !old.some(model => model.id === view.id))])

  async function runDiscover() {
    operation.current?.abort()
    const controller = operation.current = new AbortController()
    setStatus({ kind: 'discovering' })
    try {
      const result = await discover({ connection: draftConnection, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, controller.signal)
      if (controller.signal.aborted) return
      const fresh = result.models.filter(model => !models.some(existing => existing.id === model.id))
      setCandidates(fresh)
      setPicked(fresh.filter(model => presetOf(model.id)).map(model => model.id))
      setStatus({ kind: 'idle' })
    } catch (error) {
      if (!controller.signal.aborted) setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function runSave() {
    if (invalid) { setStatus({ kind: 'error', message: t('invalidNumber') }); return }
    operation.current?.abort()
    const controller = operation.current = new AbortController()
    setStatus({ kind: 'saving' })
    try {
      const value = await save({ connection: draftConnection, models, expectedRevision: snapshot!.revision,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, controller.signal)
      adopt(value)
      setStatus({ kind: 'saved' })
    } catch (error) {
      if (controller.signal.aborted) return
      const code = (error as { code?: string }).code
      setStatus({ kind: 'error', message: code === 'native-claude/settings-conflict' ? t('conflictError') : `${t('saveError')}${error instanceof Error ? error.message : ''}` })
    }
  }

  const serverTool = (key: 'webSearch' | 'webFetch') => <div className="dsh-claude-inline">
    <label className="dsh-claude-check"><input type="checkbox" checked={connection[key].enabled} disabled={!editable}
      onChange={event => patch({ [key]: { ...connection[key], enabled: event.currentTarget.checked } })}/><span>{t(key)}</span></label>
    <NumberInput label={t('maxUses')} placeholder={t('maxUsesHint')} value={connection[key].maxUses} min={1} disabled={!editable || !connection[key].enabled}
      onChange={maxUses => patch({ [key]: { enabled: connection[key].enabled, ...(maxUses === undefined ? {} : { maxUses }) } })}/>
  </div>

  return <div className="dsh-claude-settings" data-claude-settings>
    {(!canSave || !snapshot.writable) && <p className="dsh-claude-hint">{t('readOnly')}</p>}
    <section aria-label={t('connection')}>
      <h3>{t('connection')}</h3>
      <label className="dsh-claude-check"><input type="checkbox" checked={connection.enabled} disabled={!editable}
        onChange={event => patch({ enabled: event.currentTarget.checked })}/><span>{t('enabled')}</span></label>
      <div className="dsh-claude-grid">
        <Field label={t('baseURL')} hint={t('baseURLHint')} wide>
          <input type="url" value={connection.baseURL ?? ''} placeholder="https://api.anthropic.com" disabled={!editable} spellCheck={false} data-claude-setting="baseURL"
            onChange={event => patch({ baseURL: event.currentTarget.value || undefined })}/>
        </Field>
        <Field label={t('authMode')}>
          <select value={connection.authMode} disabled={!editable} data-claude-setting="authMode" onChange={event => patch({ authMode: event.currentTarget.value as ConnectionView['authMode'] })}>
            <option value="x-api-key">{t('authApiKey')}</option><option value="bearer">{t('authBearer')}</option>
          </select>
        </Field>
        <Field label={t('apiKey')} hint={snapshot.credential.writable ? (snapshot.credential.configured && connection.apiKeyEnv === snapshot.connection.apiKeyEnv ? t('keyConfigured') : t('keyNotConfigured')) : t('credentialReadOnly')}>
          <input type="password" value={apiKey} autoComplete="new-password" placeholder={t('apiKeyPlaceholder')} disabled={!editable || !snapshot.credential.writable}
            data-claude-setting="apiKey" onChange={event => setApiKey(event.currentTarget.value)}/>
        </Field>
        <Field label={t('keyRef')} hint={t('keyRefHint')}>
          <input type="text" value={connection.apiKeyEnv} disabled={!editable} spellCheck={false} onChange={event => patch({ apiKeyEnv: event.currentTarget.value })}/>
        </Field>
        <Field label={t('version')} hint={t('versionHint')}>
          <input type="text" value={connection.anthropicVersion ?? ''} placeholder="2023-06-01" disabled={!editable} spellCheck={false}
            onChange={event => patch({ anthropicVersion: event.currentTarget.value || undefined })}/>
        </Field>
        <Field label={t('timeout')} hint={t('timeoutHint')}>
          <NumberInput label={t('timeout')} value={connection.timeoutMs} scale={1000} disabled={!editable} onChange={timeoutMs => patch({ timeoutMs: timeoutMs ?? 0 })}/>
        </Field>
        <Field label={t('betas')} hint={t('betasHint')} wide>
          <input type="text" value={betasText} disabled={!editable} spellCheck={false} onChange={event => setBetasText(event.currentTarget.value)}/>
        </Field>
      </div>
    </section>
    <section aria-label={t('features')}>
      <h3>{t('features')}</h3>
      <div className="dsh-claude-inline">
        <label className="dsh-claude-check"><input type="checkbox" checked={connection.cache.enabled} disabled={!editable}
          onChange={event => patch({ cache: { ...connection.cache, enabled: event.currentTarget.checked } })}/><span>{t('cache')}</span></label>
        <select aria-label={t('cacheTtl')} value={connection.cache.ttl} disabled={!editable || !connection.cache.enabled}
          onChange={event => patch({ cache: { ...connection.cache, ttl: event.currentTarget.value as '5m' | '1h' } })}>
          <option value="5m">{t('ttl5m')}</option><option value="1h">{t('ttl1h')}</option>
        </select>
      </div>
      <p className="dsh-claude-hint">{t('cacheHint')}</p>
      <Field label={t('fallback')} hint={t('fallbackHint')}>
        <select value={connection.refusalFallback} disabled={!editable} onChange={event => patch({ refusalFallback: event.currentTarget.value as ConnectionView['refusalFallback'] })}>
          <option value="auto">{t('fallbackAuto')}</option><option value="on">{t('fallbackOn')}</option><option value="off">{t('fallbackOff')}</option>
        </select>
      </Field>
      {serverTool('webSearch')}{serverTool('webFetch')}
      <p className="dsh-claude-hint">{t('webHint')}</p>
    </section>
    <section aria-label={t('models')}>
      <h3>{t('models')}</h3>
      <p className="dsh-claude-hint">{t('modelsHint')}</p>
      <div className="dsh-claude-models">
        {models.map(model => <div key={model.id} className="dsh-claude-model" data-claude-model={model.id}>
          <div className="dsh-claude-model-head">
            <span className="dsh-claude-model-name">{model.name || model.id}{model.name && model.name !== model.id && <small>{model.id}</small>}</span>
            <button type="button" className="dsh-claude-button small" aria-expanded={expanded.includes(model.id)}
              onClick={() => setExpanded(old => old.includes(model.id) ? old.filter(id => id !== model.id) : [...old, model.id])}>{t('details')}</button>
            <button type="button" className="dsh-claude-button small" disabled={!editable} onClick={() => setModels(old => old.filter(item => item.id !== model.id))}>{t('remove')}</button>
          </div>
          {expanded.includes(model.id) && <ModelEditor model={model} preset={presetOf(model.id)} disabled={!editable} t={t}
            onChange={update => patchModel(model.id, update)}/>}
        </div>)}
      </div>
      <div className="dsh-claude-inline">
        <input type="text" value={manual} disabled={!editable} spellCheck={false} placeholder={t('manualPlaceholder')} aria-label={t('manualPlaceholder')}
          onChange={event => setManual(event.currentTarget.value)}/>
        <button type="button" className="dsh-claude-button" disabled={!editable || !manual.trim() || /\s/.test(manual.trim())} onClick={() => {
          const id = manual.trim()
          const preset = presetOf(id)
          addModels([preset ? { ...structuredClone(preset), id } : { id }])
          setManual('')
        }}>{t('add')}</button>
        <button type="button" className="dsh-claude-button" disabled={busy || !canDiscover} onClick={() => { void runDiscover() }}>
          {status.kind === 'discovering' ? t('discovering') : t('discover')}</button>
      </div>
      <p className="dsh-claude-hint">{t('discoverHint')}</p>
      {candidates && <div className="dsh-claude-candidates">
        {candidates.length === 0 && <p className="dsh-claude-hint">{t('noCandidates')}</p>}
        {candidates.map(model => <label key={model.id} className="dsh-claude-check">
          <input type="checkbox" checked={picked.includes(model.id)}
            onChange={event => { const checked = event.currentTarget.checked; setPicked(old => checked ? [...old, model.id] : old.filter(id => id !== model.id)) }}/>
          <span>{model.name ?? model.id} <small>{model.id}{model.contextWindow ? ` · ${model.contextWindow.toLocaleString()}` : ''}</small></span>
        </label>)}
        <div className="dsh-claude-inline">
          <button type="button" className="dsh-claude-button" disabled={!editable || !picked.length} onClick={() => {
            addModels(candidates.filter(model => picked.includes(model.id))); setCandidates(undefined)
          }}>{t('addSelected')}</button>
          <button type="button" className="dsh-claude-button" onClick={() => setCandidates(undefined)}>{t('cancel')}</button>
        </div>
      </div>}
    </section>
    <div className="dsh-claude-footer">
      <button type="button" className="dsh-claude-button primary" disabled={!editable || !dirty} onClick={() => { void runSave() }}>{status.kind === 'saving' ? t('saving') : t('save')}</button>
      {dirty && <span className="dsh-claude-hint">{t('unsaved')}</span>}
    </div>
    <div aria-live="polite">
      {status.kind === 'saved' && <p role="status" className="dsh-claude-status">{t('saved')}</p>}
      {status.kind === 'error' && <p role="alert" className="dsh-claude-status error">{status.message}</p>}
    </div>
  </div>
}

function ModelEditor({ model, preset, disabled, t, onChange }: {
  model: ModelView; preset: ModelView | undefined; disabled: boolean; t: T; onChange: (update: (model: ModelView) => ModelView) => void
}) {
  const set = <K extends keyof ModelView>(key: K, value: ModelView[K] | undefined) => onChange(old => {
    if (value === undefined || value === '') delete old[key]
    else old[key] = value
    return old
  })
  const inputs = model.inputTypes ?? ['text', 'image', 'pdf']
  const toggleInput = (type: 'image' | 'pdf', checked: boolean) => set('inputTypes', ['text', ...(['image', 'pdf'] as const).filter(item => item === type ? checked : inputs.includes(item))])
  const efforts = model.efforts ?? []
  const setEffort = (index: number, update: Partial<EffortOptionView>) => onChange(old => {
    const list = [...old.efforts ?? []]
    const next: EffortOptionView = { ...list[index], ...update }
    for (const [key, value] of Object.entries(update)) if (value === undefined) delete next[key as keyof EffortOptionView]
    if (next.thinking !== 'enabled') delete next.budgetTokens
    list[index] = next
    old.efforts = list
    return old
  })
  return <div className="dsh-claude-model-editor">
    {preset && <div className="dsh-claude-inline">
      <button type="button" className="dsh-claude-button small" disabled={disabled} onClick={() => onChange(() => ({ ...structuredClone(preset), id: model.id }))}>{t('applyPreset')}</button>
      <span className="dsh-claude-hint">{t('presetHint')}</span>
    </div>}
    <div className="dsh-claude-grid">
      <Field label={t('name')} wide><input type="text" value={model.name ?? ''} disabled={disabled} onChange={event => set('name', event.currentTarget.value || undefined)}/></Field>
      <Field label={t('contextWindow')}><NumberInput label={t('contextWindow')} placeholder={t('inherit')} value={model.contextWindow} min={1} disabled={disabled} onChange={value => set('contextWindow', value)}/></Field>
      <Field label={t('maxTokens')}><NumberInput label={t('maxTokens')} placeholder={t('inherit')} value={model.maxTokens} min={1} disabled={disabled} onChange={value => set('maxTokens', value)}/></Field>
      <Field label={t('display')}>
        <select value={model.thinkingDisplay ?? ''} disabled={disabled} onChange={event => set('thinkingDisplay', (event.currentTarget.value || undefined) as ModelView['thinkingDisplay'])}>
          <option value="">{t('effortDefault')}</option><option value="summarized">{t('displaySummarized')}</option>
          <option value="omitted">{t('displayOmitted')}</option><option value="updates">{t('displayUpdates')}</option>
        </select>
      </Field>
      <Field label={t('webTools')}>
        <select value={model.webTools ?? 'none'} disabled={disabled} onChange={event => set('webTools', event.currentTarget.value as ModelView['webTools'])}>
          <option value="dynamic">{t('webDynamic')}</option><option value="basic">{t('webBasic')}</option><option value="none">{t('webNone')}</option>
        </select>
      </Field>
    </div>
    <fieldset className="dsh-claude-inline"><legend>{t('inputs')}</legend>
      <label className="dsh-claude-check"><input type="checkbox" checked={inputs.includes('image')} disabled={disabled} onChange={event => toggleInput('image', event.currentTarget.checked)}/><span>{t('inputImage')}</span></label>
      <label className="dsh-claude-check"><input type="checkbox" checked={inputs.includes('pdf')} disabled={disabled} onChange={event => toggleInput('pdf', event.currentTarget.checked)}/><span>{t('inputPdf')}</span></label>
    </fieldset>
    <label className="dsh-claude-check"><input type="checkbox" checked={model.sampling === true} disabled={disabled} onChange={event => set('sampling', event.currentTarget.checked)}/><span>{t('sampling')}</span></label>
    <label className="dsh-claude-check"><input type="checkbox" checked={model.fallback === true} disabled={disabled} onChange={event => set('fallback', event.currentTarget.checked)}/><span>{t('modelFallback')}</span></label>
    <fieldset className="dsh-claude-efforts"><legend>{t('efforts')}</legend>
      <p className="dsh-claude-hint">{t('effortsHint')}</p>
      {efforts.map((option, index) => <div key={index} className="dsh-claude-effort" data-claude-effort={option.id}>
        <input type="text" aria-label={t('effortId')} placeholder={t('effortId')} value={option.id} disabled={disabled}
          onChange={event => { const id = event.currentTarget.value; onChange(old => {
            if (old.defaultEffort === option.id) old.defaultEffort = id
            old.efforts = (old.efforts ?? []).map((item, i) => i === index ? { ...item, id } : item)
            return old
          }) }}/>
        <input type="text" aria-label={t('effortName')} placeholder={t('effortName')} value={option.name} disabled={disabled} onChange={event => setEffort(index, { name: event.currentTarget.value })}/>
        <select aria-label={t('thinking')} value={option.thinking} disabled={disabled} onChange={event => setEffort(index, { thinking: event.currentTarget.value as EffortOptionView['thinking'] })}>
          {THINKING.map(item => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
        </select>
        <select aria-label={t('effort')} value={option.effort ?? ''} disabled={disabled} onChange={event => setEffort(index, { effort: (event.currentTarget.value || undefined) as EffortOptionView['effort'] })}>
          <option value="">{t('effortDefault')}</option>{EFFORT_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
        </select>
        <NumberInput label={t('budget')} placeholder={t('budget')} value={option.budgetTokens} min={1024} disabled={disabled || option.thinking !== 'enabled'}
          onChange={budgetTokens => setEffort(index, { budgetTokens })}/>
        <button type="button" className="dsh-claude-button small" disabled={disabled} onClick={() => onChange(old => {
          old.efforts = (old.efforts ?? []).filter((_, i) => i !== index)
          if (old.defaultEffort === option.id) delete old.defaultEffort
          return old
        })}>{t('remove')}</button>
      </div>)}
      <div className="dsh-claude-inline">
        <button type="button" className="dsh-claude-button small" disabled={disabled} onClick={() => onChange(old => {
          const used = new Set((old.efforts ?? []).map(item => item.id))
          const level = EFFORT_LEVELS.find(item => !used.has(item)) ?? 'high'
          const id = used.has(level) ? `level-${used.size + 1}` : level
          old.efforts = [...old.efforts ?? [], { id, name: id, thinking: 'adaptive', effort: level }]
          return old
        })}>{t('addEffort')}</button>
        <label className="dsh-claude-check"><span>{t('defaultEffort')}</span>
          <select value={model.defaultEffort ?? ''} disabled={disabled} onChange={event => set('defaultEffort', event.currentTarget.value || undefined)}>
            <option value="">{t('none')}</option>{efforts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  </div>
}
