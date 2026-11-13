import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock, GenerateOptions, RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CLAUDE_PROVIDER } from './config.js'

const originals = new AsyncLocalStorage<GenerateOptions>()

/**
 * rc.5 projects FileBlocks to local-path text inside its adapter boundary.
 * Keep the pre-projection request in scope so the serializer can restore the
 * immutable attachment references it sends natively; dispatch still goes
 * through next(), so core validation and replay isolation apply unchanged.
 */
export function registerNativeFileBridge(ctx: Context): void {
  ctx.on('llm/stream', (options, next) => {
    // Restoration also checks provider/model/session, so other routes need no scope of their own.
    if (options.provider !== CLAUDE_PROVIDER) return next()
    return withOriginalRequest(options, next)
  })
}

export async function* withOriginalRequest(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  const iterator = originals.run(options, () => next()[Symbol.asyncIterator]())
  let done = false
  try {
    while (true) {
      const item = await originals.run(options, () => iterator.next())
      if (item.done) { done = true; return }
      yield item.value
    }
  } finally {
    if (!done && iterator.return !== undefined) await originals.run(options, () => iterator.return!())
  }
}

/**
 * Re-attach original file blocks the model reads natively, after core's
 * local-path note (kept so file tools still know where the file lives).
 * Messages are matched by stable id, or by order for anonymous inputs.
 */
export function restoreNativeFiles(options: GenerateOptions, native: (block: ContentBlock, source: RequestMessage) => boolean): GenerateOptions {
  const original = originals.getStore()
  if (original === undefined || original.provider !== options.provider || original.model !== options.model || original.sessionId !== options.sessionId) return options
  const byId = new Map(original.messages.filter(message => message.id !== undefined).map(message => [message.id, message]))
  const anonymous = original.messages.filter(message => message.id === undefined)
  let anonymousIndex = 0
  let changed = false
  const messages = options.messages.map((projected): RequestMessage => {
    const source = projected.id === undefined ? anonymous[anonymousIndex++] : byId.get(projected.id)
    if (source === undefined || source.role === 'assistant' || source.role !== projected.role
      || source.content.length !== projected.content.length || !source.content.some(block => native(block, source))) return projected
    const content = projected.content.flatMap((block, index) => {
      const originalBlock = source.content[index]
      if (block.type === 'file' || !native(originalBlock, source)) return [block]
      const hint = block.type === 'text'
        ? { ...block, text: `${block.text}\nAvailable file contents are attached natively below; the local path above is for file tools only.` } : block
      return [hint, originalBlock]
    })
    changed = true
    return { ...projected, content } as RequestMessage
  })
  return changed ? { ...options, messages } : options
}
