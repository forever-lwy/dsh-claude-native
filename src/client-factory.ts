import type { Context } from '@deepseek-ai/cordis'
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { assertUsableApiKey, attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { MAX_TIMEOUT_MS, normalizeBaseURL, type ClaudeProfile } from './config.js'

export type ClientConstructor = (options: ClientOptions) => Anthropic

/** Re-resolve the stored reference on every operation, including unsaved discovery drafts. */
export async function resolveClaudeApiKey(ctx: Context, profile: Pick<ClaudeProfile, 'apiKeyEnv'>): Promise<string | undefined> {
  const ref = credentialRef(profile.apiKeyEnv)
  const provider = ctx.get('credentials')
  const resolved = provider === undefined ? launchEnvironmentOf(ctx).get(ref) : await provider.resolve(ref)
  return resolved?.value ? assertUsableApiKey(resolved.value, 'dsh-claude-native', ref) : undefined
}

/**
 * Every credential is passed explicitly so the SDK never falls back to
 * ANTHROPIC_* environment variables or `ant auth` profiles inside the
 * container. Retries are owned by dsh-llm-retry, so the SDK makes one attempt.
 */
export function createClaudeClient(profile: ClaudeProfile, rawKey: string | undefined, construct: ClientConstructor = options => new Anthropic(options)): Anthropic {
  if (!rawKey) throw new LlmError(`请在模型页为 Claude（原生）输入 API Key，或配置凭据引用 ${profile.apiKeyEnv}。`, 'MISSING_CREDENTIAL')
  const key = assertUsableApiKey(rawKey, 'dsh-claude-native', profile.apiKeyEnv)
  const headers: Record<string, string> = { ...profile.headers, ...attributionHeaders() }
  if (profile.anthropicVersion) headers['anthropic-version'] = profile.anthropicVersion
  return construct({
    ...(profile.authMode === 'bearer' ? { apiKey: null, authToken: key } : { apiKey: key, authToken: null }),
    baseURL: normalizeBaseURL(profile.baseURL),
    timeout: profile.timeoutMs === 0 ? MAX_TIMEOUT_MS : profile.timeoutMs,
    maxRetries: 0,
    defaultHeaders: headers,
  })
}
