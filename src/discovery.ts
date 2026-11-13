import type Anthropic from '@anthropic-ai/sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { EFFORT_NAMES, EFFORTS, presetFor, type ClaudeEffort, type ClaudeEffortOption, type ClaudeInputType, type ClaudeModelConfig } from './config.js'
import { claudeError } from './errors.js'

const MAX_MODELS = 1000
const TIMEOUT_MS = 30_000

export interface DiscoveredClaudeModel extends ClaudeModelConfig { name: string }

function supported(node: unknown): boolean {
  return typeof node === 'object' && node !== null && (node as { supported?: unknown }).supported === true
}
function child(node: unknown, key: string): unknown {
  return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[key] : undefined
}
function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * Derive selectable thinking levels from the live capability tree. A known
 * model id keeps its verified preset (which also knows how "off" is spelled);
 * only capacities the API reports override it.
 */
export function describeModel(raw: Record<string, unknown>): DiscoveredClaudeModel | undefined {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id || /[\s/\\?#]/.test(id)) return undefined
  const preset = presetFor(id)
  const contextWindow = positive(raw.max_input_tokens)
  const maxTokens = positive(raw.max_tokens)
  const result: DiscoveredClaudeModel = {
    ...structuredClone(preset ?? {}), id,
    name: typeof raw.display_name === 'string' && raw.display_name.trim() ? raw.display_name.trim() : preset?.name ?? id,
    ...(contextWindow ? { contextWindow } : {}), ...(maxTokens ? { maxTokens } : {}),
  }
  const capabilities = raw.capabilities
  if (preset || capabilities === undefined) return result
  const inputs: ClaudeInputType[] = ['text']
  if (supported(child(capabilities, 'image_input'))) inputs.push('image')
  if (supported(child(capabilities, 'pdf_input'))) inputs.push('pdf')
  result.inputTypes = inputs
  const thinking = child(capabilities, 'thinking')
  const types = child(thinking, 'types')
  const effort = child(capabilities, 'effort')
  if (supported(thinking) && supported(child(types, 'adaptive'))) {
    const levels = supported(effort) ? EFFORTS.filter(level => supported(child(effort, level))) : []
    const efforts: ClaudeEffortOption[] = levels.length
      ? levels.map((level: ClaudeEffort) => ({ id: level, name: EFFORT_NAMES[level], thinking: 'adaptive', effort: level }))
      : [{ id: 'adaptive', name: '自适应', thinking: 'adaptive' }]
    result.efforts = efforts
    result.defaultEffort = efforts.some(item => item.id === 'high') ? 'high' : efforts[0].id
    result.thinkingDisplay = 'summarized'
  } else if (supported(thinking) && supported(child(types, 'enabled'))) {
    result.efforts = [{ id: 'off', name: '关闭思考', thinking: 'disabled' },
      { id: 'medium', name: '中 (16k tokens)', thinking: 'enabled', budgetTokens: 16_384 }]
    if (maxTokens !== undefined && maxTokens <= 16_384) result.efforts.pop()
    result.defaultEffort = 'off'
    result.thinkingDisplay = 'summarized'
  }
  return result
}

export async function discoverClaudeModels(client: Anthropic, signal: AbortSignal): Promise<DiscoveredClaudeModel[]> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = AbortSignal.any([signal, timeout])
  const models: DiscoveredClaudeModel[] = []
  const seen = new Set<string>()
  try {
    for await (const model of client.models.list({ limit: 1000 }, { signal: combined })) {
      const described = describeModel(model as unknown as Record<string, unknown>)
      if (!described || seen.has(described.id)) continue
      seen.add(described.id)
      models.push(described)
      if (models.length >= MAX_MODELS) break
    }
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw LlmError.fromFailure({ message: '获取 Claude 模型列表超时（30 秒）。', code: 'MODEL_DISCOVERY_TIMEOUT' })
    throw claudeError(error, signal)
  }
  return models
}
