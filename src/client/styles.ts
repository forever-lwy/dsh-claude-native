// rc.5 has no provider-editor override slot: its built-in editor only handles
// llm-deepseek and llm-pi-ai. Keep this card's own form and hide the host's
// unusable Edit action / YAML fallback on the Claude card only. These CSS-module
// classes belong to the pinned host version; recheck them on upgrade.
const card = ':is(li.zGbnIq_rowCard,li.zGbnIq_setupCard):has(>[data-slot="settings.models.provider-card"]>.dsh-claude-card[data-claude-provider-card="claude-native"])'

export const styles = `
${card}>.zGbnIq_rowHead>.zGbnIq_rowActions>button:first-child,
${card}>.zGbnIq_editor{display:none}
.dsh-claude-card{margin-top:12px;font-size:14px;color:var(--dsw-alias-label-primary,#202126)}
.dsh-claude-panel{padding-top:18px}
.dsh-claude-settings{font-size:14px;line-height:1.5}
.dsh-claude-settings section{border-top:1px solid var(--dsw-alias-border-l1,#ddd);margin-top:20px;padding-top:16px}
.dsh-claude-settings section:first-of-type{border-top:0;margin-top:0;padding-top:0}
.dsh-claude-settings h3{font-size:16px;margin:0 0 12px;font-weight:600}
.dsh-claude-button{font:inherit;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:7px 12px;background:transparent;color:inherit;cursor:pointer}
.dsh-claude-button.small{padding:4px 9px;font-size:12px;white-space:nowrap}
.dsh-claude-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsh-claude-button.primary{background:var(--dsw-alias-state-business-primary,#536dfe);border-color:transparent;color:#fff}
.dsh-claude-settings button:disabled{opacity:.5;cursor:default}
.dsh-claude-settings :is(button,input,select):focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4e73df);outline-offset:2px}
.dsh-claude-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px}
.dsh-claude-field{display:flex;min-width:0;flex-direction:column;gap:5px}
.dsh-claude-field.wide{grid-column:1/-1}
.dsh-claude-settings input[type=text],.dsh-claude-settings input[type=url],.dsh-claude-settings input[type=password],.dsh-claude-settings select{box-sizing:border-box;min-width:0;width:100%;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;padding:7px 10px;font:inherit;color:inherit;background:var(--dsw-alias-bg-module-platform,#fff)}
.dsh-claude-settings input[aria-invalid=true]{border-color:var(--dsw-alias-state-danger-primary,#c22)}
.dsh-claude-hint{margin:2px 0 6px;color:var(--dsw-alias-label-caption,#72757c);font-size:12px;font-weight:400}
.dsh-claude-check{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}
.dsh-claude-check input{accent-color:var(--dsw-alias-state-business-primary,#536dfe)}
.dsh-claude-check select{width:auto}
.dsh-claude-inline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0}
.dsh-claude-inline>input[type=text]{flex:1;min-width:180px;width:auto}
.dsh-claude-inline>select{width:auto}
.dsh-claude-settings fieldset{border:0;padding:0;margin:10px 0;min-width:0}
.dsh-claude-settings legend{font-weight:500;padding:0;margin-right:8px}
.dsh-claude-models{border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;margin:8px 0}
.dsh-claude-model{border-bottom:1px solid var(--dsw-alias-border-l1,#ddd)}
.dsh-claude-model:last-child{border-bottom:0}
.dsh-claude-model-head{display:flex;align-items:center;gap:8px;padding:9px 12px}
.dsh-claude-model-name{flex:1;min-width:0;overflow-wrap:anywhere}
.dsh-claude-model-name small,.dsh-claude-candidates small{display:block;color:var(--dsw-alias-label-caption,#72757c);font-size:12px}
.dsh-claude-model-editor{padding:4px 14px 16px;border-top:1px solid var(--dsw-alias-border-l1,#ddd)}
.dsh-claude-effort{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr) auto;gap:6px;align-items:center;margin:6px 0}
.dsh-claude-effort input,.dsh-claude-effort select{padding:5px 7px!important;font-size:13px!important}
.dsh-claude-candidates{border:1px dashed var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:8px 12px;margin:8px 0;max-height:320px;overflow:auto}
.dsh-claude-footer{display:flex;align-items:center;gap:12px;margin-top:20px;flex-wrap:wrap}
.dsh-claude-status{margin:10px 0 0;font-size:13px;color:var(--dsw-alias-label-secondary,#686b72)}
.dsh-claude-status.error{color:var(--dsw-alias-state-danger-primary,#c22)}
@media (max-width:640px){.dsh-claude-grid{grid-template-columns:1fr}.dsh-claude-effort{grid-template-columns:1fr 1fr}}
.dsh-claude-native-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 7px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,#686b72);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
.dsh-claude-native-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsh-claude-native-trigger:focus-visible,.dsh-claude-native-panel :is(button,input):focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4e73df);outline-offset:2px}
.dsh-claude-native-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#536dfe)}
.dsh-claude-native-panel{position:fixed;z-index:1100;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));border-radius:var(--dsw-radius-md,12px);padding:14px;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary,#202126);box-shadow:var(--dsw-elevation-prominent,0 8px 32px rgba(0,0,0,.15));font-size:13px;line-height:1.5}
.dsh-claude-native-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:3px;font-weight:600}
.dsh-claude-native-close{display:grid;place-items:center;width:24px;height:24px;border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer;font-size:20px;line-height:1}
.dsh-claude-native-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dsh-claude-native-caption{margin:0 0 11px;color:var(--dsw-alias-label-caption,#72757c);font-size:12px}
.dsh-claude-native-option{display:flex;gap:9px;align-items:flex-start;padding:7px 3px;cursor:pointer}
.dsh-claude-native-option input{flex:none;margin:4px 0 0;accent-color:var(--dsw-alias-state-business-primary,#536dfe)}
.dsh-claude-native-option:has(input:disabled){opacity:.55;cursor:default}
.dsh-claude-native-help{display:block;margin-top:3px;color:var(--dsw-alias-label-caption,#72757c);font-size:12px;line-height:1.5}
.dsh-claude-native-divider{height:1px;margin:10px 0;background:var(--dsw-alias-border-l1,rgba(128,128,128,.2))}
.dsh-claude-native-section{margin:0 3px 2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#686b72)}
.dsh-claude-native-note{margin:8px 3px 0;color:var(--dsw-alias-label-caption,#72757c);font-size:12px}
.dsh-claude-native-status{margin:10px 3px 0;font-size:12px;color:var(--dsw-alias-label-secondary,#686b72)}
.dsh-claude-native-error{color:var(--dsw-alias-state-danger-primary,#c22)}
.dsh-claude-native-retry{margin-left:8px;border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;font:inherit}
`
