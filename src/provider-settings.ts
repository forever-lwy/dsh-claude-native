import type { Context } from '@deepseek-ai/cordis'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'
import { MODEL_PRESETS, presetModel, validateProfile, type ClaudeModelConfig, type ClaudeProfile } from './config.js'
import type { DiscoveredClaudeModel } from './discovery.js'
import {
  discoverRequestSchema, discoverySchema, providerRemoteInfo, readRequestSchema, saveRequestSchema,
  type ClaudeSettingsView, type ConnectionView, type DiscoverRequest, type Discovery, type ModelView, type ReadRequest, type SaveRequest,
} from './provider-remote.js'

declare module '@deepseek-ai/cordis' { interface Context { nativeClaudeSettings: ClaudeSettingsService } }

export interface ClaudeSettingsOptions {
  settingsNs: string
  profile: () => ClaudeProfile
  discover: (profile: ClaudeProfile, apiKey: string | undefined, signal: AbortSignal) => Promise<DiscoveredClaudeModel[]>
}

const CONNECTION_KEYS = ['enabled', 'apiKeyEnv', 'authMode', 'baseURL', 'anthropicVersion', 'timeoutMs', 'betas', 'cache', 'refusalFallback', 'webSearch', 'webFetch'] as const
const MODEL_KEYS = ['name', 'contextWindow', 'maxTokens', 'inputTypes', 'efforts', 'defaultEffort', 'thinkingDisplay', 'sampling', 'webTools', 'fallback'] as const

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new RemoteError('gateway/bad-request', 'Claude 配置输入无效。', {})
  return parsed.data
}

export function viewConnection(profile: ClaudeProfile): ConnectionView {
  return {
    enabled: profile.enabled, apiKeyEnv: profile.apiKeyEnv, authMode: profile.authMode,
    ...(profile.baseURL ? { baseURL: profile.baseURL } : {}),
    ...(profile.anthropicVersion ? { anthropicVersion: profile.anthropicVersion } : {}),
    timeoutMs: profile.timeoutMs, betas: [...profile.betas],
    cache: { ...profile.cache }, refusalFallback: profile.refusalFallback,
    webSearch: { ...profile.webSearch }, webFetch: { ...profile.webFetch },
  }
}

export function viewModel(model: ClaudeModelConfig): ModelView {
  const view: ModelView = { id: model.id }
  for (const key of MODEL_KEYS) if (model[key] !== undefined) Object.assign(view, { [key]: structuredClone(model[key]) })
  return view
}

/** UI-owned fields replace; host-only fields (betas, extraBody) survive for an existing id. */
function mergeModels(current: ClaudeModelConfig[], input: ModelView[]): ClaudeModelConfig[] {
  return input.map(view => {
    const existing = current.find(model => model.id === view.id)
    const result: ClaudeModelConfig = { id: view.id }
    if (existing?.betas) result.betas = structuredClone(existing.betas)
    if (existing?.extraBody) result.extraBody = structuredClone(existing.extraBody)
    for (const key of MODEL_KEYS) if (view[key] !== undefined && view[key] !== '') Object.assign(result, { [key]: structuredClone(view[key]) })
    return result
  })
}

export class ClaudeSettingsService extends TypertRemoteService {
  private saves: Promise<unknown> = Promise.resolve()
  constructor(ctx: Context, private readonly options: ClaudeSettingsOptions) { super(ctx, 'nativeClaudeSettings') }

  private descriptor(): SettingsDescriptor {
    try {
      const descriptor = this.ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === this.options.settingsNs)
      if (!descriptor) throw new Error('missing settings entry')
      return descriptor
    } catch { throw new RemoteError('gateway/internal', 'Claude 插件配置当前不可用。', {}) }
  }

  private async credentialInfo(profile: ClaudeProfile) {
    const credentials = this.ctx.get('credentials')
    if (credentials) {
      const info = await credentials.describe(credentialRef(profile.apiKeyEnv))
      return { configured: info.configured, writable: info.writable }
    }
    return { configured: Boolean(launchEnvironmentOf(this.ctx).get(profile.apiKeyEnv)?.value), writable: false }
  }

  @Remote
  async get(request: ReadRequest, signal: AbortSignal): Promise<ClaudeSettingsView> {
    parse(readRequestSchema, request)
    try { return await this.read(signal) }
    catch (error) {
      if (signal.aborted) throw new RemoteError('gateway/cancelled', 'Claude 配置读取已取消。', {})
      if (error instanceof RemoteError) throw error
      throw new RemoteError('gateway/internal', 'Claude 插件配置读取失败。', {})
    }
  }

  private async read(signal: AbortSignal): Promise<ClaudeSettingsView> {
    signal.throwIfAborted()
    const descriptor = this.descriptor()
    const profile = this.options.profile()
    const credential = await this.credentialInfo(profile)
    signal.throwIfAborted()
    return {
      settingsNs: this.options.settingsNs, revision: descriptor.revision, writable: this.ctx.settings.writable,
      connection: viewConnection(profile), credential,
      models: profile.models.map(viewModel),
      presets: Object.keys(MODEL_PRESETS).map(id => viewModel(presetModel(id))),
    }
  }

  private draft(connection: ConnectionView, models?: ModelView[]): ClaudeProfile {
    const current = this.options.profile()
    try {
      const draft: ClaudeProfile = { ...structuredClone(current), ...structuredClone(connection) }
      if (!connection.baseURL) delete draft.baseURL
      if (!connection.anthropicVersion) delete draft.anthropicVersion
      if (models) draft.models = mergeModels(current.models, models)
      return validateProfile(draft)
    } catch (error) {
      throw new RemoteError('native-claude/invalid-settings', error instanceof LlmError ? error.message : 'Claude 连接或模型参数无效。', {})
    }
  }

  private async apiKey(profile: ClaudeProfile, supplied?: string): Promise<string> {
    if (supplied) return assertUsableApiKey(supplied, 'dsh-claude-native', profile.apiKeyEnv)
    const credentials = this.ctx.get('credentials')
    const ref = credentialRef(profile.apiKeyEnv)
    const resolved = credentials ? await credentials.resolve(ref) : launchEnvironmentOf(this.ctx).get(ref)
    if (resolved?.value) return assertUsableApiKey(resolved.value, 'dsh-claude-native', ref)
    throw new RemoteError('gateway/bad-request', '请先输入 API Key，或配置对应的凭据引用。', {})
  }

  @Remote
  async discover(request: DiscoverRequest, signal: AbortSignal): Promise<Discovery> {
    request = parse(discoverRequestSchema, request)
    signal.throwIfAborted()
    const profile = this.draft(request.connection)
    try {
      const key = await this.apiKey(profile, request.apiKey)
      const models = await this.options.discover(profile, key, signal)
      signal.throwIfAborted()
      return discoverySchema.parse({ models: models.map(viewModel) })
    } catch (error) {
      if (signal.aborted) throw new RemoteError('gateway/cancelled', '模型获取已取消。', {})
      if (error instanceof RemoteError) throw error
      const status = error instanceof LlmError ? error.failure.status : undefined
      throw new RemoteError('native-claude/discovery-failed', error instanceof LlmError ? `无法获取模型列表：${error.message}` : '无法获取模型列表，请检查 Base URL 与认证。',
        status === undefined ? {} : { status })
    }
  }

  @Remote
  async save(request: SaveRequest, signal: AbortSignal): Promise<ClaudeSettingsView> {
    request = parse(saveRequestSchema, request)
    const operation = this.saves.then(() => this.saveExclusive(request, signal)).catch(error => {
      if (error instanceof RemoteError) throw error
      if (signal.aborted) throw new RemoteError('gateway/cancelled', 'Claude 配置保存已取消。', {})
      throw new RemoteError('gateway/internal', 'Claude 配置保存失败。', {})
    })
    this.saves = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async saveExclusive(request: SaveRequest, signal: AbortSignal): Promise<ClaudeSettingsView> {
    signal.throwIfAborted()
    const descriptor = this.descriptor()
    if (!this.ctx.settings.writable) throw new RemoteError('gateway/bad-request', '当前配置只读，无法保存 Claude 设置。', {})
    if (request.expectedRevision !== descriptor.revision) throw new RemoteError('native-claude/settings-conflict', 'Claude 配置已在其他窗口变化，请重新加载后保存。', { revision: descriptor.revision })
    const draft = this.draft(request.connection, request.models)
    let apiKey: string | undefined
    if (request.apiKey !== undefined) {
      try { apiKey = assertUsableApiKey(request.apiKey, 'dsh-claude-native', draft.apiKeyEnv) }
      catch { throw new RemoteError('gateway/bad-request', 'API Key 格式无效。', {}) }
      const credentials = this.ctx.get('credentials')
      if (!credentials || !(await credentials.describe(credentialRef(draft.apiKeyEnv))).writable) {
        throw new RemoteError('gateway/bad-request', '当前凭据存储不可写，无法保存 API Key。', {})
      }
    }
    // Field-level writes keep private headers and raw extraBody intact.
    const ops: SettingsPathOp[] = CONNECTION_KEYS.map(key => ({ op: 'set', path: ['claude', key], value: draft[key] ?? '' }))
    ops.push({ op: 'set', path: ['claude', 'models'], value: draft.models })
    signal.throwIfAborted()
    try { await this.ctx.settings.mutate(this.options.settingsNs, ops, request.expectedRevision) }
    catch (error) {
      if (error instanceof SettingsConflictError) throw new RemoteError('native-claude/settings-conflict', 'Claude 配置已在其他窗口变化，请重新加载后保存。', { revision: error.actual })
      throw new RemoteError('gateway/internal', 'Claude 设置保存失败。', {})
    }
    if (apiKey !== undefined) {
      try { await this.ctx.credentials.set(credentialRef(draft.apiKeyEnv), apiKey) }
      catch { throw new RemoteError('native-claude/credential-save-failed', '设置已保存，但 API Key 保存失败；请重新输入密钥并保存。', { revision: this.descriptor().revision }) }
    }
    // Once the commit starts, finish it even if the view has gone away.
    return this.read(new AbortController().signal)
  }
}

export function registerClaudeSettings(ctx: Context, options: ClaudeSettingsOptions): ClaudeSettingsService {
  const service = new ClaudeSettingsService(ctx, options)
  ctx.typert.remotes.register(providerRemoteInfo)
  return service
}
