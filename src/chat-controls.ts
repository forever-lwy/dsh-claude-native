import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { freezeMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, pluginRecordOf, type Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { CLAUDE_PROVIDER, type ClaudeProfile } from './config.js'
import { defaultChoices, resolveCapabilities, unsupportedChoices } from './capabilities.js'
import {
  CHAT_KEYS, NO_CHOICES, chatRemoteInfo, chatRequestSchema, chatSelectionSchema, chatSetRequestSchema,
  type ClaudeChatChoices, type ClaudeChatRequest, type ClaudeChatSetRequest, type ClaudeChatSnapshot, type ClaudeChatSourceSnapshot,
} from './chat-remote.js'

const RECORD = 'plugin:dsh-claude-native/chat-controls' as const
const PROJECTION = 'claudeNativeChat' as const
const preferenceSchema = z.object({ revision: z.number().int().nonnegative(), selections: z.array(chatSelectionSchema) }).strict()
type Preferences = z.infer<typeof preferenceSchema>

declare module '@deepseek-ai/cordis' { interface Context { nativeClaudeChat: ClaudeChatControls } }
declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap { 'plugin:dsh-claude-native/chat-controls': Preferences }
}
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'claude-native-user': { kind: 'user'; claudeNative: ClaudeChatSourceSnapshot }
  }
}

function foldPreferences(state: Preferences, event: Parameters<typeof pluginRecordOf>[0]): Preferences {
  const record = pluginRecordOf(event)
  if (record?.type !== RECORD) return state
  const parsed = preferenceSchema.safeParse(record.data)
  // Replaceable UI preferences; stamped prompts carry the authoritative immutable choices.
  return parsed.success ? parsed.data : state
}

/** Per-session, per-model native feature switches shown beside the composer. */
export class ClaudeChatControls extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly profile: () => ClaudeProfile,
    private readonly preferences: ProjectionHandle<Preferences>,
  ) { super(ctx, 'nativeClaudeChat') }

  private state(session: Session): Preferences {
    const state = this.preferences.stateOf(session)
    if (!state) throw new RemoteError('gateway/internal', 'Claude 聊天选项投影不可用。', {})
    return state
  }

  private snapshotState(state: Preferences, request: Pick<ClaudeChatRequest, 'provider' | 'model'>): ClaudeChatSnapshot {
    const profile = request.provider === CLAUDE_PROVIDER ? this.profile() : undefined
    const model = profile?.enabled ? profile.models.find(item => item.id === request.model) : undefined
    const capabilities = resolveCapabilities(model)
    const defaults = profile && model ? defaultChoices(profile, model) : { ...NO_CHOICES }
    const remembered = state.selections.find(item => item.provider === request.provider && item.model === request.model)?.choices
    const choices = { ...defaults, ...remembered }
    for (const key of CHAT_KEYS) choices[key] = choices[key] && capabilities[key]
    return { provider: request.provider, model: request.model, capabilities, choices, revision: state.revision }
  }

  snapshot(session: Session, request: Pick<ClaudeChatRequest, 'provider' | 'model'>): ClaudeChatSnapshot {
    return this.snapshotState(this.state(session), request)
  }

  /** Read a persisted log through a read-only handle: no Agent, no ownership. */
  private async persistedEvents(id: SessionId, signal: AbortSignal): Promise<readonly SessionEvent[]> {
    const handle = await this.ctx.sessionPersistence.open(id, 'read', { signal })
    try { return (await handle.read(0, undefined, { signal })).events }
    finally { await handle.close() }
  }

  private async agent(sessionId: string, signal: AbortSignal): Promise<Agent> {
    signal.throwIfAborted()
    const result = await this.ctx.sessionController.resolveAgent(SessionId(sessionId))
    signal.throwIfAborted()
    if ('error' in result) throw result.error
    return result.agent
  }

  @Remote({ resources: { session: (request: ClaudeChatRequest) => SessionId(request.sessionId) } })
  async get(request: ClaudeChatRequest, signal: AbortSignal): Promise<ClaudeChatSnapshot> {
    request = chatRequestSchema.parse(request)
    signal.throwIfAborted()
    const id = SessionId(request.sessionId)
    const live = this.ctx.sessions.get(id)
    if (live) return this.snapshot(live, request)
    // Opening the options UI must never resume an Agent; a persistence read handle is cold-safe.
    const persisted = await this.persistedEvents(id, signal)
    signal.throwIfAborted()
    const raced = this.ctx.sessions.get(id)
    if (raced) return this.snapshot(raced, request)
    let state: Preferences = { revision: 0, selections: [] }
    for (const event of persisted) {
      signal.throwIfAborted()
      state = foldPreferences(state, event)
    }
    return this.snapshotState(state, request)
  }

  @Remote({ resources: { session: (request: ClaudeChatSetRequest) => SessionId(request.sessionId) } })
  async set(request: ClaudeChatSetRequest, signal: AbortSignal): Promise<ClaudeChatSnapshot> {
    request = chatSetRequestSchema.parse(request)
    const agent = await this.agent(request.sessionId, signal)
    if (agent.status === 'running') throw new RemoteError('session/agent-busy', '请等待当前回复完成后修改原生功能。', { reason: 'CLAUDE_CHAT_OPTIONS_BUSY' })
    const before = this.snapshot(agent.session, request)
    if (before.revision !== request.expectedRevision) throw new RemoteError('native-claude/conflict', '聊天选项已在其他窗口变化，请重试。', { revision: before.revision })
    if (unsupportedChoices(before.capabilities, request.choices).length) throw new RemoteError('gateway/bad-request', '当前模型不支持选中的原生功能。', {})
    const profile = this.profile()
    if (request.provider !== CLAUDE_PROVIDER || !profile.enabled || !profile.models.some(model => model.id === request.model)) {
      throw new RemoteError('gateway/bad-request', '当前 Claude 模型不可用。', {})
    }
    const state = this.state(agent.session)
    const selections = state.selections.filter(item => item.provider !== request.provider || item.model !== request.model)
    selections.push({ provider: request.provider, model: request.model, choices: request.choices })
    signal.throwIfAborted()
    appendPluginRecord(agent.session, RECORD, { revision: state.revision + 1, selections })
    // Acknowledgement means preferences reached the normal durability checkpoint.
    await this.ctx.sessions.flush(agent.session)
    signal.throwIfAborted()
    return this.snapshot(agent.session, request)
  }

  /** Current choices for this session's models, used when the active route is known. */
  choicesFor(session: Session, model: string): ClaudeChatChoices {
    return this.snapshot(session, { provider: CLAUDE_PROVIDER, model }).choices
  }

  capture(session: Session): ClaudeChatSourceSnapshot {
    const selections: ClaudeChatSourceSnapshot['selections'] = []
    const profile = this.profile()
    if (profile.enabled) for (const model of profile.models) {
      let choices: ClaudeChatChoices
      try { choices = this.choicesFor(session, model.id) } catch { choices = { ...NO_CHOICES } }
      selections.push({ provider: CLAUDE_PROVIDER, model: model.id, choices })
    }
    return { version: 1, selections }
  }

  stamp(agent: Agent, message: UserMessage): void {
    if (message.source.kind !== 'user' || 'claudeNative' in message.source) return
    for (const [target, pending] of [['next-turn', agent.inbox.nextTurn], ['next-step', agent.inbox.nextStep]] as const) {
      const index = pending.findIndex(candidate => candidate.id === message.id)
      if (index < 0) continue
      const current = pending[index]
      if (current.source.kind !== 'user' || 'claudeNative' in current.source) return
      const stamped = freezeMessage({ ...current, source: { ...current.source, claudeNative: this.capture(agent.session) } })
      // rc.5 Inbox.replace()/splice() report deletion as cancellation, which would
      // restore the composer draft. Annotate the same pending identity with a bare
      // atomic splice instead; rpcId, order and attachment references stay intact.
      agent.session.append('agent/inbox/spliced', { target, start: index, removedCount: 1, inserted: [stamped] })
      return
    }
  }
}

/** Mount only when the normal chat/session assembly is present. */
export async function registerClaudeChatControls(ctx: Context, profile: () => ClaudeProfile): Promise<ClaudeChatControls> {
  const preferences = await ctx.sessionProjections.register({
    key: PROJECTION, stateVersion: 1, stateSchema: preferenceSchema,
    init: () => ({ revision: 0, selections: [] }), apply: foldPreferences,
  })
  const service = new ClaudeChatControls(ctx, profile, preferences)
  ctx.typert.remotes.register(chatRemoteInfo)
  ctx.on('agent/inbox/inserted', ({ agent, message }) => service.stamp(agent, message))
  return service
}
