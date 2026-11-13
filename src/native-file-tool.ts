import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FileAttachmentRef, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Session } from '@deepseek-ai/dsh-session'
import { LlmError, type ContentBlock, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { CLAUDE_PROVIDER, type ClaudeProfile } from './config.js'
import { resolveCapabilities } from './capabilities.js'
import type { ClaudeChatChoices } from './chat-remote.js'

export const CLAUDE_NATIVE_FILE_TOOL = 'claude_native_attach_file'
const MiB = 1024 * 1024
/** Anthropic caps a whole request at 32 MB; leave room for history and base64 growth. */
export const MAX_NATIVE_PDF_BYTES = 20 * MiB
export const MAX_NATIVE_IMAGE_BYTES = 10 * MiB
const CHUNK_BYTES = MiB

export interface NativeFileReceipt { version: 1; kind: 'pdf' | 'image'; name: string; attachment: FileAttachmentRef | ImageAttachmentRef }

/** Magic bytes decide the type; a file name never grants a native channel. */
export function sniffNativeType(prefix: Uint8Array): { kind: 'pdf' } | { kind: 'image'; mediaType: ImageMediaType } | undefined {
  const bytes = Buffer.from(prefix)
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf' }
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { kind: 'image', mediaType: 'image/png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: 'image', mediaType: 'image/jpeg' }
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return { kind: 'image', mediaType: 'image/gif' }
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mediaType: 'image/webp' }
  return undefined
}

/** Tool results of this tool are host-produced; their files are always sent natively. */
export function attachToolResults(options: GenerateOptions): Set<string> {
  const calls = new Set<string>()
  for (const message of options.messages) {
    if (message.role === 'assistant') for (const block of message.content) {
      if (block.type === 'tool-call' && block.name === CLAUDE_NATIVE_FILE_TOOL) calls.add(block.id)
    }
  }
  return calls
}

export interface NativeFileToolOptions {
  profile: () => ClaudeProfile
  /** The conversation's current choices; absent when chat controls are not mounted. */
  choices: (session: Session, model: string) => ClaudeChatChoices | undefined
}

/**
 * Attach the exact bytes of one workspace PDF or image to this conversation.
 * Nothing parses, OCRs, summarizes or calls another model; the next request
 * carries the file as a native document/image block.
 */
export function registerNativeFileTool(ctx: Context, options: NativeFileToolOptions): void {
  const routeOf = (agent: Agent) => agent.session.requestHeader()?.config ?? agent.options
  const eligible = (agent: Agent | undefined, provider: string | undefined, modelId: string | undefined) => {
    if (!agent || provider !== CLAUDE_PROVIDER || !modelId) return undefined
    const profile = options.profile()
    const model = profile.enabled ? profile.models.find(item => item.id === modelId) : undefined
    if (!model || !resolveCapabilities(model).nativeFiles) return undefined
    const choices = options.choices(agent.session, modelId)
    if (choices !== undefined && !choices.nativeFiles) return undefined
    return model
  }
  const definition = defineTool({
    name: CLAUDE_NATIVE_FILE_TOOL,
    description: 'Attach one existing workspace PDF or image (PNG, JPEG, GIF, WebP) to this SAME conversation so the current Claude model can read its ORIGINAL content natively (PDF pages, charts, scans, screenshots). The file is not parsed, OCRed or summarized. After success, inspect the attached file in your next response. For plain text or source code, read the file with normal file tools instead.',
    parameters: { path: { type: 'string', required: true, description: 'Existing file path, absolute or relative to the current working directory, inside the session workspace.' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        version: { type: 'integer', const: 1, required: true }, kind: { type: 'string', enum: ['pdf', 'image'], required: true },
        name: { type: 'string', required: true }, attachment: { type: 'json', required: true },
      } },
      render: (_args, value) => [value.kind === 'image'
        ? { type: 'image', attachment: value.attachment as unknown as ImageAttachmentRef }
        : { type: 'file', attachment: value.attachment as unknown as FileAttachmentRef }] as ContentBlock[],
    },
    async execute({ path }, exec) {
      const agent = exec.agent
      if (!agent) throw LlmError.fromFailure({ message: '原生文件附加需要当前会话中的模型调用。', code: 'NATIVE_FILE_AGENT_REQUIRED' })
      // Nested (run_code) results cannot carry native files to the Claude request.
      if (exec.callId !== exec.rootCallId) throw LlmError.fromFailure({ message: '原生文件附加只能由模型直接调用，不能在 run_code 程序中使用。', code: 'NATIVE_FILE_DIRECT_ONLY' })
      exec.signal.throwIfAborted()
      const route = routeOf(agent)
      const model = eligible(agent, route.provider, route.model)
      if (!model) throw LlmError.fromFailure({ message: '当前对话未启用 Claude 原生文件输入。', code: 'UNSUPPORTED_NATIVE_CAPABILITY' })
      if (!path.trim() || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path) || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
        throw LlmError.fromFailure({ message: '请提供工作区内的有效文件路径。', code: 'INVALID_FILE_PATH' })
      }
      const cwd = ctx.workingDirectory.get(agent.session)
      const root = await ctx.fs.resolve(agent.session.header.cwd ?? cwd, { signal: exec.signal })
      const target = await ctx.fs.resolve(path, { cwd, signal: exec.signal })
      if (!ctx.fs.contains(root, target)) throw LlmError.fromFailure({ message: '只能附加当前会话工作区内的文件。', code: 'NATIVE_FILE_OUTSIDE_WORKSPACE' })
      const before = await ctx.fs.stat(target, exec.signal)
      if (!before || before.type !== 'file') throw LlmError.fromFailure({ message: '附加目标必须是现有的普通文件。', code: 'NATIVE_FILE_NOT_REGULAR' })
      const prefix = await ctx.fs.readByteRange(target, { offset: 0, length: 16 }, exec.signal)
      const type = sniffNativeType(prefix)
      if (!type) throw LlmError.fromFailure({ message: '只能原生附加 PDF 或 PNG/JPEG/GIF/WebP 图片；文本文件请直接用文件工具读取。', code: 'UNSUPPORTED_NATIVE_FILE' })
      const inputs = model.inputTypes ?? ['text', 'image', 'pdf']
      if (!inputs.includes(type.kind)) throw LlmError.fromFailure({ message: `当前模型未声明 ${type.kind === 'pdf' ? 'PDF' : '图片'} 输入。`, code: 'UNSUPPORTED_NATIVE_CAPABILITY' })
      const maxBytes = type.kind === 'pdf' ? MAX_NATIVE_PDF_BYTES : MAX_NATIVE_IMAGE_BYTES
      if (before.size !== undefined && before.size > maxBytes) throw LlmError.fromFailure({ message: `文件超过原生附加上限 ${maxBytes / MiB} MiB。`, code: 'FILE_TOO_LARGE' })
      const chunks: Uint8Array[] = []
      let offset = 0
      while (true) {
        exec.signal.throwIfAborted()
        const length = Math.min(CHUNK_BYTES, maxBytes - offset + 1)
        const bytes = await ctx.fs.readByteRange(target, { offset, length }, exec.signal)
        if (!bytes.length) break
        offset += bytes.length
        if (offset > maxBytes) throw LlmError.fromFailure({ message: `文件超过原生附加上限 ${maxBytes / MiB} MiB。`, code: 'FILE_TOO_LARGE' })
        chunks.push(bytes)
      }
      const after = await ctx.fs.stat(target, exec.signal)
      if (!after || after.version !== before.version || (after.size !== undefined && after.size !== offset)) {
        throw LlmError.fromFailure({ message: '文件在读取过程中发生变化，请重试。', code: 'NATIVE_FILE_CHANGED' })
      }
      const name = target.displayPath.replaceAll('\\', '/').split('/').at(-1) || (type.kind === 'pdf' ? 'document.pdf' : 'image')
      const data = Buffer.concat(chunks)
      const attachment = type.kind === 'pdf'
        ? await ctx.attachments.saveFile({ data, name: /\.pdf$/i.test(name) ? name : `${name}.pdf` })
        : await ctx.attachments.saveImage({ data, mediaType: type.mediaType, name })
      exec.signal.throwIfAborted()
      return { version: 1 as const, kind: type.kind, name, attachment: attachment as unknown as JsonValue }
    },
  })
  // 0.2.2 step admission replaces prompt filtering: a disabled conversation
  // never sees the tool in its declarations or dispatch.
  ctx.tools.register(definition, {
    when: ({ agent, modelSelection }) => eligible(agent, modelSelection.provider, modelSelection.model) !== undefined,
  })
}
