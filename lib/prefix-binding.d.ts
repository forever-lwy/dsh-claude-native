import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
/** Bind signed thinking to the logical request, before cache markers are added. */
export declare function requestPrefixDigest(options: GenerateOptions, end?: number): string;
/** Budget-based thinking must retain the assistant's thinking during its open tool round. */
export declare function keepManualToolThinking(options: GenerateOptions, manualThinking: boolean): number;
