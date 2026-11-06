import Anthropic from '@anthropic-ai/sdk';
import { assertUsableApiKey, attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { MAX_TIMEOUT_MS, normalizeBaseURL } from './config.js';
/** Re-resolve the stored reference on every operation, including unsaved discovery drafts. */
export async function resolveClaudeApiKey(ctx, profile) {
    const ref = credentialRef(profile.apiKeyEnv);
    const provider = ctx.get('credentials');
    const resolved = provider === undefined ? launchEnvironmentOf(ctx).get(ref) : await provider.resolve(ref);
    return resolved?.value ? assertUsableApiKey(resolved.value, 'dsh-claude-native', ref) : undefined;
}
/**
 * Every credential is passed explicitly so the SDK never falls back to
 * ANTHROPIC_* environment variables or `ant auth` profiles inside the
 * container. Retries are owned by dsh-llm-retry, so the SDK makes one attempt.
 */
export function createClaudeClient(profile, rawKey, construct = options => new Anthropic(options)) {
    if (!rawKey)
        throw new LlmError(`请在模型页为 Claude（原生）输入 API Key，或配置凭据引用 ${profile.apiKeyEnv}。`, 'MISSING_CREDENTIAL');
    const key = assertUsableApiKey(rawKey, 'dsh-claude-native', profile.apiKeyEnv);
    const headers = { ...profile.headers, ...attributionHeaders() };
    if (profile.anthropicVersion)
        headers['anthropic-version'] = profile.anthropicVersion;
    return construct({
        ...(profile.authMode === 'bearer' ? { apiKey: null, authToken: key } : { apiKey: key, authToken: null }),
        baseURL: normalizeBaseURL(profile.baseURL),
        timeout: profile.timeoutMs === 0 ? MAX_TIMEOUT_MS : profile.timeoutMs,
        maxRetries: 0,
        defaultHeaders: headers,
    });
}
