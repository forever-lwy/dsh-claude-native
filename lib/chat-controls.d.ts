import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type UserMessage } from '@deepseek-ai/dsh-llm';
import { type Session } from '@deepseek-ai/dsh-session';
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { type ClaudeProfile } from './config.js';
import { type ClaudeChatChoices, type ClaudeChatRequest, type ClaudeChatSetRequest, type ClaudeChatSnapshot, type ClaudeChatSourceSnapshot } from './chat-remote.js';
declare const preferenceSchema: z.ZodObject<{
    revision: z.ZodNumber;
    selections: z.ZodArray<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        choices: z.ZodObject<{
            nativeFiles: z.ZodBoolean;
            webSearch: z.ZodBoolean;
            webFetch: z.ZodBoolean;
        }, z.core.$strict>;
    }, z.core.$strict>>;
}, z.core.$strict>;
type Preferences = z.infer<typeof preferenceSchema>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        nativeClaudeChat: ClaudeChatControls;
    }
}
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:dsh-claude-native/chat-controls': Preferences;
    }
}
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'claude-native-user': {
            kind: 'user';
            claudeNative: ClaudeChatSourceSnapshot;
        };
    }
}
/** Per-session, per-model native feature switches shown beside the composer. */
export declare class ClaudeChatControls extends TypertRemoteService {
    private readonly profile;
    private readonly preferences;
    constructor(ctx: Context, profile: () => ClaudeProfile, preferences: ProjectionHandle<Preferences>);
    private state;
    private snapshotState;
    snapshot(session: Session, request: Pick<ClaudeChatRequest, 'provider' | 'model'>): ClaudeChatSnapshot;
    /** Read a persisted log through a read-only handle: no Agent, no ownership. */
    private persistedEvents;
    private agent;
    get(request: ClaudeChatRequest, signal: AbortSignal): Promise<ClaudeChatSnapshot>;
    set(request: ClaudeChatSetRequest, signal: AbortSignal): Promise<ClaudeChatSnapshot>;
    /** Current choices for this session's models, used when the active route is known. */
    choicesFor(session: Session, model: string): ClaudeChatChoices;
    capture(session: Session): ClaudeChatSourceSnapshot;
    stamp(agent: Agent, message: UserMessage): void;
}
/** Mount only when the normal chat/session assembly is present. */
export declare function registerClaudeChatControls(ctx: Context, profile: () => ClaudeProfile): Promise<ClaudeChatControls>;
export {};
