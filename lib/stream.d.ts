import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type Anthropic from '@anthropic-ai/sdk';
import { type ReplayEntry } from './messages.js';
type NativeBlock = Anthropic.Beta.BetaContentBlock;
type Event = Anthropic.Beta.BetaRawMessageStreamEvent;
export interface ResponseOutcome {
    stopReason: string | null;
    stopDetails?: unknown;
    /** Every native block of this response, in API order, for pause_turn continuation. */
    natives: NativeBlock[];
}
/** Accumulates one assistant turn, which may span several pause_turn responses. */
export declare class TurnAccumulator {
    private readonly options;
    private next;
    readonly entries: ReplayEntry[];
    private pending;
    private readonly sources;
    private usage;
    private id?;
    private model?;
    toolCalls: boolean;
    private stopReason;
    constructor(options: GenerateOptions);
    private visible;
    private textBlock;
    private source;
    /** Summaries keep server-tool activity visible in dsh; the native blocks stay attached for replay. */
    private serverToolText;
    consume(stream: AsyncIterable<Event>, signal?: AbortSignal): AsyncGenerator<StreamChunk, ResponseOutcome>;
    private close;
    /** message_delta usage is cumulative within a response; pause_turn responses add up. */
    private addUsage;
    /** Closes the turn: sources, usage and the finish chunk carrying exact native replay. */
    finish(stopDetails?: unknown): Generator<StreamChunk>;
}
export {};
