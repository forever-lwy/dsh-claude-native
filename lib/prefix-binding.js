import { createHash } from 'node:crypto';
/** Bind signed thinking to the logical request, before cache markers are added. */
export function requestPrefixDigest(options, end = options.messages.length) {
    const messages = options.messages.slice(0, end).map(message => ({
        role: message.role, content: message.content,
        ...(message.role === 'tool' ? { toolCallId: message.toolCallId, isError: message.isError ?? false } : {}),
    }));
    return createHash('sha256').update('dsh-claude-native/prefix/v1\0')
        .update(JSON.stringify({ model: options.model, system: options.system ?? null, tools: options.tools ?? null, messages })).digest('hex');
}
/** Budget-based thinking must retain the assistant's thinking during its open tool round. */
export function keepManualToolThinking(options, manualThinking) {
    if (!manualThinking)
        return -1;
    let results = 0;
    for (let index = options.messages.length - 1; index >= 0; index--) {
        const message = options.messages[index];
        if (message.role === 'assistant')
            return results ? index : -1;
        if (message.role !== 'tool')
            return -1;
        results++;
    }
    return -1;
}
