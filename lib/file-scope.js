import { AsyncLocalStorage } from 'node:async_hooks';
import { CLAUDE_PROVIDER } from './config.js';
const originals = new AsyncLocalStorage();
/**
 * rc.5 projects FileBlocks to local-path text inside its adapter boundary.
 * Keep the pre-projection request in scope so the serializer can restore the
 * immutable attachment references it sends natively; dispatch still goes
 * through next(), so core validation and replay isolation apply unchanged.
 */
export function registerNativeFileBridge(ctx) {
    ctx.on('llm/stream', (options, next) => {
        // Restoration also checks provider/model/session, so other routes need no scope of their own.
        if (options.provider !== CLAUDE_PROVIDER)
            return next();
        return withOriginalRequest(options, next);
    });
}
export async function* withOriginalRequest(options, next) {
    const iterator = originals.run(options, () => next()[Symbol.asyncIterator]());
    let done = false;
    try {
        while (true) {
            const item = await originals.run(options, () => iterator.next());
            if (item.done) {
                done = true;
                return;
            }
            yield item.value;
        }
    }
    finally {
        if (!done && iterator.return !== undefined)
            await originals.run(options, () => iterator.return());
    }
}
/**
 * Re-attach original file blocks the model reads natively, after core's
 * local-path note (kept so file tools still know where the file lives).
 * Messages are matched by stable id, or by order for anonymous inputs.
 */
export async function restoreNativeFiles(options, resolve) {
    const original = originals.getStore();
    if (original === undefined || original.provider !== options.provider || original.model !== options.model || original.sessionId !== options.sessionId)
        return options;
    const byId = new Map(original.messages.filter(message => message.id !== undefined).map(message => [message.id, message]));
    const anonymous = original.messages.filter(message => message.id === undefined);
    let anonymousIndex = 0;
    let changed = false;
    const messages = [];
    for (const projected of options.messages) {
        messages.push(projected);
        const source = projected.id === undefined ? anonymous[anonymousIndex++] : byId.get(projected.id);
        if (source === undefined || source.role === 'assistant' || source.role !== projected.role
            || source.content.length !== projected.content.length || !source.content.some(block => block.type === 'file'))
            continue;
        const content = [];
        for (const [index, block] of projected.content.entries()) {
            content.push(block);
            const originalBlock = source.content[index];
            if (originalBlock.type !== 'file' || block.type !== 'text')
                continue;
            const mode = await resolve(originalBlock, source);
            if (!mode)
                continue;
            if (mode === 'native')
                content[content.length - 1] = {
                    ...block, text: `${block.text}\nAvailable file contents are attached natively below; the local path above is for file tools only.`,
                };
            content.push(originalBlock);
        }
        if (content.length === projected.content.length)
            continue;
        changed = true;
        messages[messages.length - 1] = { ...projected, content };
    }
    return changed ? { ...options, messages } : options;
}
