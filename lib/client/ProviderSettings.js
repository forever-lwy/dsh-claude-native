import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const THINKING = [
    { value: 'adaptive', label: 'thinkingAdaptive' }, { value: 'enabled', label: 'thinkingEnabled' },
    { value: 'disabled', label: 'thinkingDisabled' }, { value: 'between_tools', label: 'thinkingBetween' }, { value: 'omit', label: 'thinkingOmit' },
];
/** Numbers stay text while edited, so partial input is never coerced. Invalid text reports NaN. */
function NumberInput({ value, onChange, disabled, min = 0, scale = 1, placeholder, label }) {
    const shown = value === undefined ? '' : String(value / scale);
    const [text, setText] = useState(shown);
    const last = useRef(value);
    if (last.current !== value && !(Number.isNaN(value) && Number.isNaN(last.current))) {
        last.current = value;
        if (!Number.isNaN(value))
            setText(shown);
    }
    const invalid = Number.isNaN(value);
    return _jsx("input", { type: "text", inputMode: "decimal", value: text, disabled: disabled, placeholder: placeholder, "aria-label": label, "aria-invalid": invalid, onChange: event => {
            const raw = event.currentTarget.value;
            setText(raw);
            const parsed = raw.trim() === '' ? undefined : Number(raw) * scale;
            const next = parsed === undefined || (Number.isSafeInteger(parsed) && parsed >= min) ? parsed : NaN;
            last.current = next;
            onChange(next);
        } });
}
function Field({ label, hint, wide, children }) {
    return _jsxs("label", { className: `dsh-claude-field${wide ? ' wide' : ''}`, children: [_jsx("span", { children: label }), children, hint && _jsx("span", { className: "dsh-claude-hint", children: hint })] });
}
function hasInvalidNumber(value) {
    if (typeof value === 'number')
        return Number.isNaN(value);
    if (Array.isArray(value))
        return value.some(hasInvalidNumber);
    if (value && typeof value === 'object')
        return Object.values(value).some(hasInvalidNumber);
    return false;
}
/** Set on the host's `<li>` provider row that holds this plugin's card. */
export const NATIVE_ROW_ATTRIBUTE = 'data-dsh-claude-native-row';
/** Each Models-page provider card owns its route's configuration form. */
export function ProviderSettings(props) {
    const [open, setOpen] = useState(false);
    const [visited, setVisited] = useState(false);
    const panelId = useId();
    const native = props.provider.provider === 'claude-native';
    const cardRef = useRef(null);
    // Mark the host's provider row so the stylesheet can address it without
    // `:has()`, which made every DOM insertion on the page restyle widely.
    useLayoutEffect(() => {
        const row = cardRef.current?.closest('li');
        if (!row)
            return;
        row.setAttribute(NATIVE_ROW_ATTRIBUTE, '');
        return () => row.removeAttribute(NATIVE_ROW_ATTRIBUTE);
    }, [native]);
    if (!native)
        return null;
    return _jsxs("div", { ref: cardRef, className: "dsh-claude-card", "data-claude-provider-card": "claude-native", children: [_jsx("button", { type: "button", className: "dsh-claude-button", "aria-expanded": open, "aria-controls": panelId, onClick: () => { setOpen(value => !value); setVisited(true); }, children: props.t(open ? 'closeConfiguration' : 'configure') }), _jsx("div", { id: panelId, hidden: !open, className: "dsh-claude-panel", children: visited && _jsx(ProviderSettingsPage, { ...props }) })] });
}
export function ProviderSettingsPage({ read, discover, save, useRemoteAccess, t }) {
    const canRead = useRemoteAccess('nativeClaudeSettings/get');
    const canDiscover = useRemoteAccess('nativeClaudeSettings/discover');
    const canSave = useRemoteAccess('nativeClaudeSettings/save');
    const [snapshot, setSnapshot] = useState();
    const [connection, setConnection] = useState();
    const [models, setModels] = useState([]);
    const [apiKey, setApiKey] = useState('');
    const [manual, setManual] = useState('');
    const [betasText, setBetasText] = useState('');
    const [expanded, setExpanded] = useState([]);
    const [candidates, setCandidates] = useState();
    const [picked, setPicked] = useState([]);
    const [status, setStatus] = useState({ kind: 'idle' });
    const [loadError, setLoadError] = useState(false);
    const [reload, setReload] = useState(0);
    const operation = useRef();
    const adopt = (value) => {
        setSnapshot(value);
        setConnection(structuredClone(value.connection));
        setModels(structuredClone(value.models));
        setBetasText(value.connection.betas.join(', '));
        setApiKey('');
    };
    useEffect(() => {
        const controller = new AbortController();
        setSnapshot(undefined);
        setLoadError(false);
        setStatus({ kind: 'idle' });
        if (canRead)
            void read(controller.signal).then(value => { if (!controller.signal.aborted)
                adopt(value); })
                .catch(() => { if (!controller.signal.aborted)
                setLoadError(true); });
        return () => { controller.abort(); operation.current?.abort(); };
    }, [canRead, read, reload]);
    if (!canRead)
        return _jsx("p", { children: t('noRead') });
    if (loadError)
        return _jsxs("div", { children: [_jsx("p", { role: "alert", children: t('loadError') }), _jsx("button", { type: "button", className: "dsh-claude-button", onClick: () => setReload(value => value + 1), children: t('retry') })] });
    if (!snapshot || !connection)
        return _jsx("p", { role: "status", children: t('loading') });
    const editable = canSave && snapshot.writable && status.kind !== 'saving';
    const busy = status.kind === 'saving' || status.kind === 'discovering';
    const betas = betasText.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
    const draftConnection = { ...connection, betas };
    const dirty = apiKey.trim() !== '' || JSON.stringify(draftConnection) !== JSON.stringify(snapshot.connection) || JSON.stringify(models) !== JSON.stringify(snapshot.models);
    const invalid = hasInvalidNumber(draftConnection) || hasInvalidNumber(models);
    const presets = new Map(snapshot.presets.map(preset => [preset.id, preset]));
    const presetOf = (id) => presets.get(id.replace(/^anthropic[./]/, '').replace(/[-@]\d{8}$/, ''));
    const patch = (update) => setConnection(old => old && { ...old, ...update });
    const patchModel = (id, update) => setModels(old => old.map(model => model.id === id ? update(structuredClone(model)) : model));
    const addModels = (views) => setModels(old => [...old, ...views.filter(view => !old.some(model => model.id === view.id))]);
    async function runDiscover() {
        operation.current?.abort();
        const controller = operation.current = new AbortController();
        setStatus({ kind: 'discovering' });
        try {
            const result = await discover({ connection: draftConnection, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, controller.signal);
            if (controller.signal.aborted)
                return;
            const fresh = result.models.filter(model => !models.some(existing => existing.id === model.id));
            setCandidates(fresh);
            setPicked(fresh.filter(model => presetOf(model.id)).map(model => model.id));
            setStatus({ kind: 'idle' });
        }
        catch (error) {
            if (!controller.signal.aborted)
                setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    }
    async function runSave() {
        if (invalid) {
            setStatus({ kind: 'error', message: t('invalidNumber') });
            return;
        }
        operation.current?.abort();
        const controller = operation.current = new AbortController();
        setStatus({ kind: 'saving' });
        try {
            const value = await save({ connection: draftConnection, models, expectedRevision: snapshot.revision,
                ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, controller.signal);
            adopt(value);
            setStatus({ kind: 'saved' });
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            const code = error.code;
            setStatus({ kind: 'error', message: code === 'native-claude/settings-conflict' ? t('conflictError') : `${t('saveError')}${error instanceof Error ? error.message : ''}` });
        }
    }
    const serverTool = (key) => _jsxs("div", { className: "dsh-claude-inline", children: [_jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: connection[key].enabled, disabled: !editable, onChange: event => patch({ [key]: { ...connection[key], enabled: event.currentTarget.checked } }) }), _jsx("span", { children: t(key) })] }), _jsx(NumberInput, { label: t('maxUses'), placeholder: t('maxUsesHint'), value: connection[key].maxUses, min: 1, disabled: !editable || !connection[key].enabled, onChange: maxUses => patch({ [key]: { enabled: connection[key].enabled, ...(maxUses === undefined ? {} : { maxUses }) } }) })] });
    return _jsxs("div", { className: "dsh-claude-settings", "data-claude-settings": true, children: [(!canSave || !snapshot.writable) && _jsx("p", { className: "dsh-claude-hint", children: t('readOnly') }), _jsxs("section", { "aria-label": t('connection'), children: [_jsx("h3", { children: t('connection') }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: connection.enabled, disabled: !editable, onChange: event => patch({ enabled: event.currentTarget.checked }) }), _jsx("span", { children: t('enabled') })] }), _jsxs("div", { className: "dsh-claude-grid", children: [_jsx(Field, { label: t('baseURL'), hint: t('baseURLHint'), wide: true, children: _jsx("input", { type: "url", value: connection.baseURL ?? '', placeholder: "https://api.anthropic.com", disabled: !editable, spellCheck: false, "data-claude-setting": "baseURL", onChange: event => patch({ baseURL: event.currentTarget.value || undefined }) }) }), _jsx(Field, { label: t('authMode'), children: _jsxs("select", { value: connection.authMode, disabled: !editable, "data-claude-setting": "authMode", onChange: event => patch({ authMode: event.currentTarget.value }), children: [_jsx("option", { value: "x-api-key", children: t('authApiKey') }), _jsx("option", { value: "bearer", children: t('authBearer') })] }) }), _jsx(Field, { label: t('apiKey'), hint: snapshot.credential.writable ? (snapshot.credential.configured && connection.apiKeyEnv === snapshot.connection.apiKeyEnv ? t('keyConfigured') : t('keyNotConfigured')) : t('credentialReadOnly'), children: _jsx("input", { type: "password", value: apiKey, autoComplete: "new-password", placeholder: t('apiKeyPlaceholder'), disabled: !editable || !snapshot.credential.writable, "data-claude-setting": "apiKey", onChange: event => setApiKey(event.currentTarget.value) }) }), _jsx(Field, { label: t('keyRef'), hint: t('keyRefHint'), children: _jsx("input", { type: "text", value: connection.apiKeyEnv, disabled: !editable, spellCheck: false, onChange: event => patch({ apiKeyEnv: event.currentTarget.value }) }) }), _jsx(Field, { label: t('version'), hint: t('versionHint'), children: _jsx("input", { type: "text", value: connection.anthropicVersion ?? '', placeholder: "2023-06-01", disabled: !editable, spellCheck: false, onChange: event => patch({ anthropicVersion: event.currentTarget.value || undefined }) }) }), _jsx(Field, { label: t('timeout'), hint: t('timeoutHint'), children: _jsx(NumberInput, { label: t('timeout'), value: connection.timeoutMs, scale: 1000, disabled: !editable, onChange: timeoutMs => patch({ timeoutMs: timeoutMs ?? 0 }) }) }), _jsx(Field, { label: t('betas'), hint: t('betasHint'), wide: true, children: _jsx("input", { type: "text", value: betasText, disabled: !editable, spellCheck: false, onChange: event => setBetasText(event.currentTarget.value) }) })] })] }), _jsxs("section", { "aria-label": t('features'), children: [_jsx("h3", { children: t('features') }), _jsxs("div", { className: "dsh-claude-inline", children: [_jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: connection.cache.enabled, disabled: !editable, onChange: event => patch({ cache: { ...connection.cache, enabled: event.currentTarget.checked } }) }), _jsx("span", { children: t('cache') })] }), _jsxs("select", { "aria-label": t('cacheTtl'), value: connection.cache.ttl, disabled: !editable || !connection.cache.enabled, onChange: event => patch({ cache: { ...connection.cache, ttl: event.currentTarget.value } }), children: [_jsx("option", { value: "5m", children: t('ttl5m') }), _jsx("option", { value: "1h", children: t('ttl1h') })] })] }), _jsx("p", { className: "dsh-claude-hint", children: t('cacheHint') }), _jsx(Field, { label: t('fallback'), hint: t('fallbackHint'), children: _jsxs("select", { value: connection.refusalFallback, disabled: !editable, onChange: event => patch({ refusalFallback: event.currentTarget.value }), children: [_jsx("option", { value: "auto", children: t('fallbackAuto') }), _jsx("option", { value: "on", children: t('fallbackOn') }), _jsx("option", { value: "off", children: t('fallbackOff') })] }) }), serverTool('webSearch'), serverTool('webFetch'), _jsx("p", { className: "dsh-claude-hint", children: t('webHint') })] }), _jsxs("section", { "aria-label": t('models'), children: [_jsx("h3", { children: t('models') }), _jsx("p", { className: "dsh-claude-hint", children: t('modelsHint') }), _jsx("div", { className: "dsh-claude-models", children: models.map(model => _jsxs("div", { className: "dsh-claude-model", "data-claude-model": model.id, children: [_jsxs("div", { className: "dsh-claude-model-head", children: [_jsxs("span", { className: "dsh-claude-model-name", children: [model.name || model.id, model.name && model.name !== model.id && _jsx("small", { children: model.id })] }), _jsx("button", { type: "button", className: "dsh-claude-button small", "aria-expanded": expanded.includes(model.id), onClick: () => setExpanded(old => old.includes(model.id) ? old.filter(id => id !== model.id) : [...old, model.id]), children: t('details') }), _jsx("button", { type: "button", className: "dsh-claude-button small", disabled: !editable, onClick: () => setModels(old => old.filter(item => item.id !== model.id)), children: t('remove') })] }), expanded.includes(model.id) && _jsx(ModelEditor, { model: model, preset: presetOf(model.id), disabled: !editable, t: t, onChange: update => patchModel(model.id, update) })] }, model.id)) }), _jsxs("div", { className: "dsh-claude-inline", children: [_jsx("input", { type: "text", value: manual, disabled: !editable, spellCheck: false, placeholder: t('manualPlaceholder'), "aria-label": t('manualPlaceholder'), onChange: event => setManual(event.currentTarget.value) }), _jsx("button", { type: "button", className: "dsh-claude-button", disabled: !editable || !manual.trim() || /\s/.test(manual.trim()), onClick: () => {
                                    const id = manual.trim();
                                    const preset = presetOf(id);
                                    addModels([preset ? { ...structuredClone(preset), id } : { id }]);
                                    setManual('');
                                }, children: t('add') }), _jsx("button", { type: "button", className: "dsh-claude-button", disabled: busy || !canDiscover, onClick: () => { void runDiscover(); }, children: status.kind === 'discovering' ? t('discovering') : t('discover') })] }), _jsx("p", { className: "dsh-claude-hint", children: t('discoverHint') }), candidates && _jsxs("div", { className: "dsh-claude-candidates", children: [candidates.length === 0 && _jsx("p", { className: "dsh-claude-hint", children: t('noCandidates') }), candidates.map(model => _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: picked.includes(model.id), onChange: event => { const checked = event.currentTarget.checked; setPicked(old => checked ? [...old, model.id] : old.filter(id => id !== model.id)); } }), _jsxs("span", { children: [model.name ?? model.id, " ", _jsxs("small", { children: [model.id, model.contextWindow ? ` · ${model.contextWindow.toLocaleString()}` : ''] })] })] }, model.id)), _jsxs("div", { className: "dsh-claude-inline", children: [_jsx("button", { type: "button", className: "dsh-claude-button", disabled: !editable || !picked.length, onClick: () => {
                                            addModels(candidates.filter(model => picked.includes(model.id)));
                                            setCandidates(undefined);
                                        }, children: t('addSelected') }), _jsx("button", { type: "button", className: "dsh-claude-button", onClick: () => setCandidates(undefined), children: t('cancel') })] })] })] }), _jsxs("div", { className: "dsh-claude-footer", children: [_jsx("button", { type: "button", className: "dsh-claude-button primary", disabled: !editable || !dirty, onClick: () => { void runSave(); }, children: status.kind === 'saving' ? t('saving') : t('save') }), dirty && _jsx("span", { className: "dsh-claude-hint", children: t('unsaved') })] }), _jsxs("div", { "aria-live": "polite", children: [status.kind === 'saved' && _jsx("p", { role: "status", className: "dsh-claude-status", children: t('saved') }), status.kind === 'error' && _jsx("p", { role: "alert", className: "dsh-claude-status error", children: status.message })] })] });
}
function ModelEditor({ model, preset, disabled, t, onChange }) {
    const set = (key, value) => onChange(old => {
        if (value === undefined || value === '')
            delete old[key];
        else
            old[key] = value;
        return old;
    });
    const inputs = model.inputTypes ?? ['text', 'image', 'pdf'];
    const toggleInput = (type, checked) => set('inputTypes', ['text', ...['image', 'pdf'].filter(item => item === type ? checked : inputs.includes(item))]);
    const efforts = model.efforts ?? [];
    const setEffort = (index, update) => onChange(old => {
        const list = [...old.efforts ?? []];
        const next = { ...list[index], ...update };
        for (const [key, value] of Object.entries(update))
            if (value === undefined)
                delete next[key];
        if (next.thinking !== 'enabled')
            delete next.budgetTokens;
        list[index] = next;
        old.efforts = list;
        return old;
    });
    return _jsxs("div", { className: "dsh-claude-model-editor", children: [preset && _jsxs("div", { className: "dsh-claude-inline", children: [_jsx("button", { type: "button", className: "dsh-claude-button small", disabled: disabled, onClick: () => onChange(() => ({ ...structuredClone(preset), id: model.id })), children: t('applyPreset') }), _jsx("span", { className: "dsh-claude-hint", children: t('presetHint') })] }), _jsxs("div", { className: "dsh-claude-grid", children: [_jsx(Field, { label: t('name'), wide: true, children: _jsx("input", { type: "text", value: model.name ?? '', disabled: disabled, onChange: event => set('name', event.currentTarget.value || undefined) }) }), _jsx(Field, { label: t('contextWindow'), children: _jsx(NumberInput, { label: t('contextWindow'), placeholder: t('inherit'), value: model.contextWindow, min: 1, disabled: disabled, onChange: value => set('contextWindow', value) }) }), _jsx(Field, { label: t('maxTokens'), children: _jsx(NumberInput, { label: t('maxTokens'), placeholder: t('inherit'), value: model.maxTokens, min: 1, disabled: disabled, onChange: value => set('maxTokens', value) }) }), _jsx(Field, { label: t('display'), children: _jsxs("select", { value: model.thinkingDisplay ?? '', disabled: disabled, onChange: event => set('thinkingDisplay', (event.currentTarget.value || undefined)), children: [_jsx("option", { value: "", children: t('effortDefault') }), _jsx("option", { value: "summarized", children: t('displaySummarized') }), _jsx("option", { value: "omitted", children: t('displayOmitted') }), _jsx("option", { value: "updates", children: t('displayUpdates') })] }) }), _jsx(Field, { label: t('webTools'), children: _jsxs("select", { value: model.webTools ?? 'none', disabled: disabled, onChange: event => set('webTools', event.currentTarget.value), children: [_jsx("option", { value: "dynamic", children: t('webDynamic') }), _jsx("option", { value: "basic", children: t('webBasic') }), _jsx("option", { value: "none", children: t('webNone') })] }) })] }), _jsxs("fieldset", { className: "dsh-claude-inline", children: [_jsx("legend", { children: t('inputs') }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: inputs.includes('image'), disabled: disabled, onChange: event => toggleInput('image', event.currentTarget.checked) }), _jsx("span", { children: t('inputImage') })] }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: inputs.includes('pdf'), disabled: disabled, onChange: event => toggleInput('pdf', event.currentTarget.checked) }), _jsx("span", { children: t('inputPdf') })] })] }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: model.sampling === true, disabled: disabled, onChange: event => set('sampling', event.currentTarget.checked) }), _jsx("span", { children: t('sampling') })] }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("input", { type: "checkbox", checked: model.fallback === true, disabled: disabled, onChange: event => set('fallback', event.currentTarget.checked) }), _jsx("span", { children: t('modelFallback') })] }), _jsxs("fieldset", { className: "dsh-claude-efforts", children: [_jsx("legend", { children: t('efforts') }), _jsx("p", { className: "dsh-claude-hint", children: t('effortsHint') }), efforts.map((option, index) => _jsxs("div", { className: "dsh-claude-effort", "data-claude-effort": option.id, children: [_jsx("input", { type: "text", "aria-label": t('effortId'), placeholder: t('effortId'), value: option.id, disabled: disabled, onChange: event => {
                                    const id = event.currentTarget.value;
                                    onChange(old => {
                                        if (old.defaultEffort === option.id)
                                            old.defaultEffort = id;
                                        old.efforts = (old.efforts ?? []).map((item, i) => i === index ? { ...item, id } : item);
                                        return old;
                                    });
                                } }), _jsx("input", { type: "text", "aria-label": t('effortName'), placeholder: t('effortName'), value: option.name, disabled: disabled, onChange: event => setEffort(index, { name: event.currentTarget.value }) }), _jsx("select", { "aria-label": t('thinking'), value: option.thinking, disabled: disabled, onChange: event => setEffort(index, { thinking: event.currentTarget.value }), children: THINKING.map(item => _jsx("option", { value: item.value, children: t(item.label) }, item.value)) }), _jsxs("select", { "aria-label": t('effort'), value: option.effort ?? '', disabled: disabled, onChange: event => setEffort(index, { effort: (event.currentTarget.value || undefined) }), children: [_jsx("option", { value: "", children: t('effortDefault') }), EFFORT_LEVELS.map(level => _jsx("option", { value: level, children: level }, level))] }), _jsx(NumberInput, { label: t('budget'), placeholder: t('budget'), value: option.budgetTokens, min: 1024, disabled: disabled || option.thinking !== 'enabled', onChange: budgetTokens => setEffort(index, { budgetTokens }) }), _jsx("button", { type: "button", className: "dsh-claude-button small", disabled: disabled, onClick: () => onChange(old => {
                                    old.efforts = (old.efforts ?? []).filter((_, i) => i !== index);
                                    if (old.defaultEffort === option.id)
                                        delete old.defaultEffort;
                                    return old;
                                }), children: t('remove') })] }, index)), _jsxs("div", { className: "dsh-claude-inline", children: [_jsx("button", { type: "button", className: "dsh-claude-button small", disabled: disabled, onClick: () => onChange(old => {
                                    const used = new Set((old.efforts ?? []).map(item => item.id));
                                    const level = EFFORT_LEVELS.find(item => !used.has(item)) ?? 'high';
                                    const id = used.has(level) ? `level-${used.size + 1}` : level;
                                    old.efforts = [...old.efforts ?? [], { id, name: id, thinking: 'adaptive', effort: level }];
                                    return old;
                                }), children: t('addEffort') }), _jsxs("label", { className: "dsh-claude-check", children: [_jsx("span", { children: t('defaultEffort') }), _jsxs("select", { value: model.defaultEffort ?? '', disabled: disabled, onChange: event => set('defaultEffort', event.currentTarget.value || undefined), children: [_jsx("option", { value: "", children: t('none') }), efforts.map(item => _jsx("option", { value: item.id, children: item.name }, item.id))] })] })] })] })] });
}
