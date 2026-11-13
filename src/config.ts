import type { Volatile, VolatileSnapshot } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmError, RetryPolicySchema, resolveRetryPolicy, type RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

export const CLAUDE_PROVIDER = 'claude-native'
export const DEFAULT_BASE_URL = 'https://api.anthropic.com'
export const MAX_TIMEOUT_MS = 2_147_483_647

export type ClaudeInputType = 'text' | 'image' | 'pdf'
export type ClaudeThinkingMode = 'adaptive' | 'enabled' | 'disabled' | 'between_tools' | 'omit'
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ClaudeThinkingDisplay = 'summarized' | 'omitted' | 'updates'
export type ClaudeWebTools = 'dynamic' | 'basic' | 'none'
export const EFFORTS: readonly ClaudeEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const THINKING_MODES: readonly ClaudeThinkingMode[] = ['adaptive', 'enabled', 'disabled', 'between_tools', 'omit']

/** One selectable reasoning level, mapped to the exact Messages API thinking/effort fields. */
export interface ClaudeEffortOption {
  id: string
  name: string
  /** `adaptive` sends `{type: "adaptive"}`, `enabled` a fixed budget, `omit` leaves the model default. */
  thinking: ClaudeThinkingMode
  /** `output_config.effort`; omitted means the model's own default. */
  effort?: ClaudeEffort
  /** Only for `thinking: enabled` (pre-4.6 models). */
  budgetTokens?: number
}

export interface ClaudeModelConfig {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  inputTypes?: ClaudeInputType[]
  /** Absent inherits the preset; empty means no reasoning selector and the model's default thinking. */
  efforts?: ClaudeEffortOption[]
  defaultEffort?: string
  /** Visibility of thinking text; thinking runs and is billed the same either way. */
  thinkingDisplay?: ClaudeThinkingDisplay
  /** Pass dsh temperature through; only honoured while thinking is off. */
  sampling?: boolean
  /** Server web search/fetch tool generation this model accepts. */
  webTools?: ClaudeWebTools
  /** Model supports server-side refusal fallbacks (`fallbacks: "default"`). */
  fallback?: boolean
  betas?: string[]
  /** Raw Messages API fields merged into every request for this model. */
  extraBody?: Record<string, unknown>
}

export interface ClaudeCacheOptions { enabled: boolean; ttl: '5m' | '1h' }
export interface ClaudeServerTool { enabled: boolean; maxUses?: number }

export interface ClaudeProfileOptions {
  enabled: boolean
  retryPolicy?: RetryPolicyConfig
  /** Credential reference, never the API key itself. */
  apiKeyEnv: string
  authMode: 'x-api-key' | 'bearer'
  baseURL?: string
  anthropicVersion?: string
  timeoutMs: number
  headers: Record<string, string>
  betas: string[]
  cache: ClaudeCacheOptions
  refusalFallback: 'auto' | 'on' | 'off'
  webSearch: ClaudeServerTool
  webFetch: ClaudeServerTool
  models: ClaudeModelConfig[]
  extraBody: Record<string, unknown>
}

export interface ClaudeProfile extends ClaudeProfileOptions { provider: typeof CLAUDE_PROVIDER }
export interface Config { claude: Volatile<ClaudeProfileOptions> }

const level = (effort: ClaudeEffort): ClaudeEffortOption => ({ id: effort, name: EFFORT_NAMES[effort], thinking: 'adaptive', effort })
export const EFFORT_NAMES: Record<ClaudeEffort, string> = { low: '低', medium: '中', high: '高', xhigh: '超高', max: '最大' }
const off = (thinking: 'disabled' | 'between_tools'): ClaudeEffortOption => ({ id: 'off', name: '关闭思考', thinking })
const adaptive = (levels: readonly ClaudeEffort[] = EFFORTS) => levels.map(level)

interface Preset extends Omit<ClaudeModelConfig, 'id'> { name: string }
const current = { contextWindow: 1_000_000, maxTokens: 128_000, inputTypes: ['text', 'image', 'pdf'] as ClaudeInputType[], thinkingDisplay: 'summarized' as const }

/**
 * Verified per-model API behaviour (2026-11). Effort is the only depth control
 * on adaptive models; `budget_tokens` is rejected from 4.7 onward, and turning
 * thinking off is spelled differently (or impossible) per model.
 */
export const MODEL_PRESETS: Record<string, Preset> = {
  'claude-fable-5-1': { ...current, name: 'Claude Fable 5.1', efforts: adaptive(), defaultEffort: 'high', webTools: 'basic', fallback: true },
  'claude-fable-5': { ...current, name: 'Claude Fable 5', efforts: adaptive(), defaultEffort: 'high', webTools: 'basic', fallback: true },
  'claude-opus-5-5': { ...current, name: 'Claude Opus 5.5', efforts: adaptive(), defaultEffort: 'high', webTools: 'dynamic', fallback: true },
  'claude-sonnet-5-5': { ...current, name: 'Claude Sonnet 5.5', efforts: [off('between_tools'), ...adaptive()], defaultEffort: 'high', webTools: 'dynamic', fallback: true },
  'claude-haiku-5-5': { ...current, name: 'Claude Haiku 5.5', efforts: [off('disabled'), ...adaptive()], defaultEffort: 'medium', webTools: 'basic' },
  'claude-opus-5': { ...current, name: 'Claude Opus 5', efforts: [off('disabled'), ...adaptive()], defaultEffort: 'high', webTools: 'dynamic', fallback: true },
  'claude-sonnet-5': { ...current, name: 'Claude Sonnet 5', efforts: [off('disabled'), ...adaptive()], defaultEffort: 'high', webTools: 'dynamic' },
  'claude-opus-4-8': { ...current, name: 'Claude Opus 4.8', efforts: [off('disabled'), ...adaptive()], defaultEffort: 'high', webTools: 'dynamic' },
  'claude-opus-4-7': { ...current, name: 'Claude Opus 4.7', efforts: [off('disabled'), ...adaptive()], defaultEffort: 'high', webTools: 'dynamic' },
  'claude-opus-4-6': { ...current, name: 'Claude Opus 4.6', efforts: [off('disabled'), ...adaptive(['low', 'medium', 'high', 'max'])], defaultEffort: 'high', webTools: 'dynamic', sampling: true },
  'claude-sonnet-4-6': { ...current, name: 'Claude Sonnet 4.6', efforts: [off('disabled'), ...adaptive(['low', 'medium', 'high', 'max'])], defaultEffort: 'high', webTools: 'dynamic', sampling: true },
  'claude-haiku-4-5': { contextWindow: 200_000, maxTokens: 64_000, inputTypes: ['text', 'image', 'pdf'], thinkingDisplay: 'summarized', name: 'Claude Haiku 4.5',
    efforts: [off('disabled'),
      { id: 'low', name: '低 (4k tokens)', thinking: 'enabled', budgetTokens: 4096 },
      { id: 'medium', name: '中 (16k tokens)', thinking: 'enabled', budgetTokens: 16_384 },
      { id: 'high', name: '高 (32k tokens)', thinking: 'enabled', budgetTokens: 32_000 }],
    defaultEffort: 'off', webTools: 'basic', sampling: true },
}

/** Strip a dated snapshot suffix (claude-haiku-4-5-20251001) when matching presets. */
export function presetFor(id: string): Preset | undefined {
  const bare = id.replace(/^anthropic[./]/, '').replace(/[-@]\d{8}$/, '')
  return Object.hasOwn(MODEL_PRESETS, bare) ? MODEL_PRESETS[bare] : undefined
}

/** Absent fields inherit the verified preset of a known id; explicit values (including [] or false) win. */
export function withPreset(model: ClaudeModelConfig): ClaudeModelConfig {
  const preset = presetFor(model.id)
  if (!preset) return model
  const result = { ...model }
  for (const [key, value] of Object.entries(preset)) {
    // A default only makes sense against the preset's own level list.
    if (key === 'defaultEffort' && model.efforts !== undefined) continue
    if (result[key as keyof ClaudeModelConfig] === undefined) Object.assign(result, { [key]: structuredClone(value) })
  }
  return result
}

export function presetModel(id: string): ClaudeModelConfig {
  const preset = presetFor(id)
  return preset ? { id, ...structuredClone(preset) } : { id }
}

export const DEFAULT_MODELS: ClaudeModelConfig[] = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'].map(presetModel)

export function defaultProfile(): ClaudeProfile {
  return {
    provider: CLAUDE_PROVIDER, enabled: true, apiKeyEnv: 'ANTHROPIC_API_KEY', authMode: 'x-api-key',
    timeoutMs: 600_000, headers: {}, betas: [], cache: { enabled: true, ttl: '5m' }, refusalFallback: 'auto',
    webSearch: { enabled: false }, webFetch: { enabled: false },
    models: structuredClone(DEFAULT_MODELS), extraBody: {},
  }
}

const effortSchema = z.object({
  id: z.string().required(), name: z.string().required(),
  thinking: z.union([...THINKING_MODES]).required(),
  effort: z.union([...EFFORTS]), budgetTokens: z.natural(),
})
const modelSchema = z.object({
  id: z.string().required(), name: z.string(),
  contextWindow: z.natural().min(1), maxTokens: z.natural().min(1),
  // Schemastery would otherwise materialize absent arrays as [], turning
  // "inherit" into an explicit (and invalid) declaration.
  inputTypes: z.array(z.union(['text', 'image', 'pdf'])).extra('default', undefined).description('原生输入类型，必须包含 text'),
  efforts: z.array(effortSchema).extra('default', undefined).description('可选思考档位及其 thinking/effort 映射'),
  defaultEffort: z.string(),
  thinkingDisplay: z.union(['summarized', 'omitted', 'updates']),
  sampling: z.boolean(), webTools: z.union(['dynamic', 'basic', 'none']), fallback: z.boolean(),
  betas: z.array(z.string()).extra('default', undefined),
  extraBody: z.dict(z.any()).description('合并到请求体的原生 Messages API 字段'),
})

function profileSchema() {
  const { provider: _provider, ...defaults } = defaultProfile()
  return z.object({
    enabled: z.boolean().default(true).description('启用供应商'),
    retryPolicy: RetryPolicySchema,
    apiKeyEnv: z.string().role('credential-ref').default(defaults.apiKeyEnv).description('API Key 凭据引用'),
    authMode: z.union(['x-api-key', 'bearer']).default('x-api-key').description('认证头：官方 x-api-key，或中转常用的 Authorization: Bearer'),
    baseURL: z.string().description('API 根地址，留空为 https://api.anthropic.com；SDK 会追加 /v1/messages'),
    anthropicVersion: z.string().description('覆盖 anthropic-version 请求头；留空使用 SDK 默认 2023-06-01'),
    timeoutMs: z.natural().max(MAX_TIMEOUT_MS).default(defaults.timeoutMs).description('等待响应开始的超时（毫秒），0 表示不限'),
    headers: z.dict(z.string()).default({}).description('附加请求头'),
    betas: z.array(z.string()).default([]).description('附加 anthropic-beta 功能标识'),
    cache: z.object({
      enabled: z.boolean().default(true), ttl: z.union(['5m', '1h']).default('5m'),
    }).default(defaults.cache).description('提示缓存断点（工具、系统提示、对话末尾）'),
    refusalFallback: z.union(['auto', 'on', 'off']).default('auto').description('服务端拒答回退：auto 仅对官方端点和支持的模型启用'),
    webSearch: z.object({ enabled: z.boolean().default(false), maxUses: z.natural().min(1) }).default({ enabled: false }).description('Anthropic 服务端网页搜索'),
    webFetch: z.object({ enabled: z.boolean().default(false), maxUses: z.natural().min(1) }).default({ enabled: false }).description('Anthropic 服务端网页抓取'),
    models: z.array(modelSchema).default(structuredClone(DEFAULT_MODELS)).description('模型目录（可添加任意 Claude 模型 ID）'),
    extraBody: z.dict(z.any()).default({}).description('合并到每个请求体的原生字段'),
  }).default(defaults).volatile()
}

export const Config = z.object({
  claude: profileSchema().description('Anthropic Claude Messages API'),
})

/** Capture an independent, validated generation so edits cannot affect an in-flight request. */
export function profileOf(config: Config): ClaudeProfile {
  return validateProfile(config.claude.get())
}

const RESERVED_BODY_KEYS = ['model', 'messages', 'stream', 'system', 'tools', 'max_tokens', 'thinking']
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

function invalid(message: string): never { throw new LlmError(message, 'INVALID_CONFIG') }

export function normalizeBaseURL(value: string | undefined): string {
  if (!value?.trim()) return DEFAULT_BASE_URL
  let parsed: URL
  try { parsed = new URL(value.trim()) } catch { invalid('Base URL 必须是有效的 HTTP(S) 地址。') }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    invalid('Base URL 必须是无凭据、无查询参数的 HTTP(S) 地址。')
  }
  // The SDK appends /v1/messages; accept documented roots with a trailing /v1.
  parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '')
  return parsed.toString().replace(/\/+$/, '')
}

export function isOfficialEndpoint(profile: Pick<ClaudeProfileOptions, 'baseURL'>): boolean {
  return normalizeBaseURL(profile.baseURL) === DEFAULT_BASE_URL
}

export function validateModel(entry: ClaudeModelConfig): void {
  if (!entry.id.trim() || /[\s\u0000-\u001f\u007f]/.test(entry.id)) invalid('Claude 模型 ID 不得为空或包含空白字符')
  for (const capacity of [entry.contextWindow, entry.maxTokens]) {
    if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity <= 0)) invalid('上下文长度与最大输出 tokens 必须是正整数')
  }
  if (entry.contextWindow !== undefined && entry.maxTokens !== undefined && entry.maxTokens >= entry.contextWindow) {
    invalid(`模型 ${entry.id} 的最大输出 tokens 必须小于上下文长度`)
  }
  if (entry.inputTypes !== undefined && (!entry.inputTypes.includes('text') || new Set(entry.inputTypes).size !== entry.inputTypes.length
    || entry.inputTypes.some(type => !['text', 'image', 'pdf'].includes(type)))) invalid('模型输入类型必须包含 text，且不得重复')
  const ids = new Set<string>()
  for (const option of entry.efforts ?? []) {
    if (!option.id.trim() || !option.name.trim() || ids.has(option.id)) invalid(`模型 ${entry.id} 的思考档位 ID、名称不得为空，ID 不得重复`)
    ids.add(option.id)
    if (!THINKING_MODES.includes(option.thinking)) invalid(`思考档位 ${option.id} 的 thinking 模式无效`)
    if (option.effort !== undefined && !EFFORTS.includes(option.effort)) invalid(`思考档位 ${option.id} 的 effort 无效`)
    if (option.thinking === 'enabled') {
      if (option.budgetTokens === undefined || !Number.isSafeInteger(option.budgetTokens) || option.budgetTokens < 1024) invalid(`思考档位 ${option.id} 使用固定预算时 budgetTokens 至少为 1024`)
      if (entry.maxTokens !== undefined && option.budgetTokens >= entry.maxTokens) invalid(`思考档位 ${option.id} 的 budgetTokens 必须小于最大输出 tokens`)
    } else if (option.budgetTokens !== undefined) invalid(`只有 thinking=enabled 的档位可以设置 budgetTokens`)
  }
  if (entry.defaultEffort !== undefined && !ids.has(entry.defaultEffort)) invalid(`模型 ${entry.id} 的默认思考档位必须属于其档位列表`)
  validateBody(entry.extraBody)
}

function validateBody(body: Record<string, unknown> | undefined): void {
  for (const key of Object.keys(body ?? {})) {
    if (RESERVED_BODY_KEYS.includes(key)) invalid(`extraBody 不能覆盖由 dsh 管理的字段 ${key}`)
  }
}

export function validateProfile(input: VolatileSnapshot<ClaudeProfileOptions> | ClaudeProfileOptions): ClaudeProfile {
  const profile = structuredClone({ ...input, provider: CLAUDE_PROVIDER }) as ClaudeProfile
  resolveRetryPolicy(profile.retryPolicy, 'claude-native: retryPolicy')
  profile.models = profile.models.map(withPreset)
  credentialRef(profile.apiKeyEnv)
  normalizeBaseURL(profile.baseURL)
  if (profile.anthropicVersion !== undefined && profile.anthropicVersion !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(profile.anthropicVersion)) {
    invalid('anthropic-version 必须是 YYYY-MM-DD 形式的日期')
  }
  if (!Number.isSafeInteger(profile.timeoutMs) || profile.timeoutMs < 0 || profile.timeoutMs > MAX_TIMEOUT_MS) invalid('请求超时必须是 0 到 2147483647 之间的整数毫秒')
  for (const [name, value] of Object.entries(profile.headers ?? {})) {
    if (!HEADER_NAME.test(name) || /[\r\n]/.test(value)) invalid(`请求头 ${name} 无效`)
    if (['x-api-key', 'authorization'].includes(name.toLowerCase())) invalid('认证头由 API Key 设置管理，请勿写入附加请求头')
  }
  for (const beta of [...profile.betas ?? [], ...profile.models.flatMap(model => model.betas ?? [])]) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(beta)) invalid(`anthropic-beta 标识 ${beta} 无效`)
  }
  const ids = new Set<string>()
  for (const entry of profile.models) {
    if (ids.has(entry.id)) invalid(`模型 ID ${entry.id} 重复`)
    ids.add(entry.id)
    validateModel(entry)
  }
  validateBody(profile.extraBody)
  return profile
}
