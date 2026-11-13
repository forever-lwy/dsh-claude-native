import Anthropic from '@anthropic-ai/sdk'
import { CONTEXT_WINDOW_EXCEEDED_CODE, LlmError, ProviderRequestId, isContextWindowExceededError, isQuotaExceededError } from '@deepseek-ai/dsh-llm'

function isTimeout(error: unknown): boolean {
  const visited = new Set<object>()
  let current = error
  for (let depth = 0; depth < 6 && typeof current === 'object' && current !== null; depth++) {
    if (visited.has(current)) break
    visited.add(current)
    if (current instanceof Anthropic.APIConnectionTimeoutError) return true
    const candidate = current as { name?: unknown; code?: unknown; cause?: unknown }
    if (candidate.name === 'TimeoutError' || candidate.code === 'UND_ERR_HEADERS_TIMEOUT'
      || candidate.code === 'UND_ERR_BODY_TIMEOUT' || candidate.code === 'UND_ERR_CONNECT_TIMEOUT') return true
    current = candidate.cause
  }
  return false
}

/** Provider error text names the rejected field, which is what makes relay issues diagnosable. Keys never appear in it. */
function providerDetail(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { type?: unknown; message?: unknown } } | undefined
  const type = typeof body?.error?.type === 'string' ? body.error.type : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : error.message
  const text = [type, message].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim()
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
}

const STREAM_ERROR_STATUS: Record<string, number> = {
  overloaded_error: 529, api_error: 500, rate_limit_error: 429, timeout_error: 504,
  invalid_request_error: 400, authentication_error: 401, permission_error: 403, not_found_error: 404, request_too_large: 413,
}

function errorType(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = error.error as { error?: { type?: unknown }; type?: unknown } | undefined
  const type = body?.error?.type ?? body?.type
  return typeof type === 'string' ? type : undefined
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const ms = Number(headers?.get('retry-after-ms'))
  if (Number.isFinite(ms) && ms > 0) return ms
  const raw = headers?.get('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const date = Date.parse(raw)
  return Number.isFinite(date) && date > Date.now() ? date - Date.now() : undefined
}

export function claudeError(error: unknown, signal?: AbortSignal): LlmError {
  if (signal?.aborted) return new LlmError('Claude 请求已取消。', 'ABORTED')
  if (error instanceof LlmError) return error
  if (error instanceof Anthropic.APIUserAbortError) return new LlmError('Claude 请求已取消。', 'ABORTED')
  if (isTimeout(error)) return new LlmError('Claude 请求在响应开始前超时，可在模型页调整请求超时，并检查上游服务与网络。', 'TIMEOUT')
  if (error instanceof Anthropic.APIError) {
    const detail = providerDetail(error)
    // In-stream `error` events carry no HTTP status; map their type to one.
    const status = typeof error.status === 'number' ? error.status : STREAM_ERROR_STATUS[errorType(error) ?? ''] ?? 500
    const facts = {
      ...(status >= 100 && status <= 599 ? { status } : {}),
      ...(error.requestID ? { requestId: ProviderRequestId(error.requestID) } : {}),
    }
    const suffix = `（${typeof error.status === 'number' ? `HTTP ${status}` : '流内错误'}${detail ? `：${detail}` : ''}）`
    if (status === 413) return LlmError.fromFailure({ message: `Claude 请求体过大${suffix}`, code: 'REQUEST_TOO_LARGE', ...(facts) })
    if (isContextWindowExceededError(detail) || /prompt is too long/i.test(detail)) {
      return new LlmError(`Claude 上下文超出模型窗口（context window exceeded）${suffix}`, CONTEXT_WINDOW_EXCEEDED_CODE, facts)
    }
    if (isQuotaExceededError(detail) || /credit balance is too low/i.test(detail)) return new LlmError(`Claude 账户额度不足${suffix}`, 'QUOTA', facts)
    const retry = retryAfterMs(error.headers as Headers | undefined)
    const withRetry = retry === undefined ? facts : { ...facts, providerRetryAfterMs: retry }
    if (status === 401 || status === 403) return new LlmError(`Claude 认证失败，请检查 API Key 与认证方式${suffix}`, 'AUTH', facts)
    if (status === 404) return new LlmError(`Claude 模型或端点不存在${suffix}`, 'UNKNOWN_MODEL', facts)
    if (status === 429) return new LlmError(`Claude 请求过于频繁${suffix}`, 'RATE_LIMIT', withRetry)
    if (status === 408 || status === 504) return new LlmError(`Claude 网关超时${suffix}`, 'TIMEOUT', withRetry)
    if (status === 529) return new LlmError(`Claude 服务过载${suffix}`, 'SERVER', withRetry)
    if (status >= 500) return new LlmError(`Claude 服务端错误${suffix}`, 'SERVER', withRetry)
    return new LlmError(`Claude 拒绝了请求，请检查模型、思考档位与原生参数${suffix}`, 'INVALID_REQUEST', facts)
  }
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('无法连接 Claude API，请检查 Base URL 与网络。', 'TRANSPORT')
  return new LlmError('Claude 请求失败，请检查模型、网络及凭据配置。', 'TRANSPORT', { cause: error })
}
