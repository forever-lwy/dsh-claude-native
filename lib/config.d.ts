import type { Volatile, VolatileSnapshot } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
export declare const CLAUDE_PROVIDER = "claude-native";
export declare const DEFAULT_BASE_URL = "https://api.anthropic.com";
export declare const MAX_TIMEOUT_MS = 2147483647;
export type ClaudeInputType = 'text' | 'image' | 'pdf';
export type ClaudeThinkingMode = 'adaptive' | 'enabled' | 'disabled' | 'between_tools' | 'omit';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ClaudeThinkingDisplay = 'summarized' | 'omitted' | 'updates';
export type ClaudeWebTools = 'dynamic' | 'basic' | 'none';
export declare const EFFORTS: readonly ClaudeEffort[];
export declare const THINKING_MODES: readonly ClaudeThinkingMode[];
/** One selectable reasoning level, mapped to the exact Messages API thinking/effort fields. */
export interface ClaudeEffortOption {
    id: string;
    name: string;
    /** `adaptive` sends `{type: "adaptive"}`, `enabled` a fixed budget, `omit` leaves the model default. */
    thinking: ClaudeThinkingMode;
    /** `output_config.effort`; omitted means the model's own default. */
    effort?: ClaudeEffort;
    /** Only for `thinking: enabled` (pre-4.6 models). */
    budgetTokens?: number;
}
export interface ClaudeModelConfig {
    id: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    inputTypes?: ClaudeInputType[];
    /** Absent inherits the preset; empty means no reasoning selector and the model's default thinking. */
    efforts?: ClaudeEffortOption[];
    defaultEffort?: string;
    /** Visibility of thinking text; thinking runs and is billed the same either way. */
    thinkingDisplay?: ClaudeThinkingDisplay;
    /** Pass dsh temperature through; only honoured while thinking is off. */
    sampling?: boolean;
    /** Server web search/fetch tool generation this model accepts. */
    webTools?: ClaudeWebTools;
    /** Model supports server-side refusal fallbacks (`fallbacks: "default"`). */
    fallback?: boolean;
    betas?: string[];
    /** Raw Messages API fields merged into every request for this model. */
    extraBody?: Record<string, unknown>;
}
export interface ClaudeCacheOptions {
    enabled: boolean;
    ttl: '5m' | '1h';
}
export interface ClaudeServerTool {
    enabled: boolean;
    maxUses?: number;
}
export interface ClaudeProfileOptions {
    enabled: boolean;
    retryPolicy?: RetryPolicyConfig;
    /** Credential reference, never the API key itself. */
    apiKeyEnv: string;
    authMode: 'x-api-key' | 'bearer';
    baseURL?: string;
    anthropicVersion?: string;
    timeoutMs: number;
    headers: Record<string, string>;
    betas: string[];
    cache: ClaudeCacheOptions;
    refusalFallback: 'auto' | 'on' | 'off';
    webSearch: ClaudeServerTool;
    webFetch: ClaudeServerTool;
    models: ClaudeModelConfig[];
    extraBody: Record<string, unknown>;
}
export interface ClaudeProfile extends ClaudeProfileOptions {
    provider: typeof CLAUDE_PROVIDER;
}
export interface Config {
    claude: Volatile<ClaudeProfileOptions>;
}
export declare const EFFORT_NAMES: Record<ClaudeEffort, string>;
interface Preset extends Omit<ClaudeModelConfig, 'id'> {
    name: string;
}
/**
 * Verified per-model API behaviour (2026-11). Effort is the only depth control
 * on adaptive models; `budget_tokens` is rejected from 4.7 onward, and turning
 * thinking off is spelled differently (or impossible) per model.
 */
export declare const MODEL_PRESETS: Record<string, Preset>;
/** Strip a dated snapshot suffix (claude-haiku-4-5-20251001) when matching presets. */
export declare function presetFor(id: string): Preset | undefined;
/** Absent fields inherit the verified preset of a known id; explicit values (including [] or false) win. */
export declare function withPreset(model: ClaudeModelConfig): ClaudeModelConfig;
export declare function presetModel(id: string): ClaudeModelConfig;
export declare const DEFAULT_MODELS: ClaudeModelConfig[];
export declare function defaultProfile(): ClaudeProfile;
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    claude: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        retryPolicy: z<RetryPolicyConfig>;
        apiKeyEnv: z<string, string, "defined">;
        authMode: z<"x-api-key" | "bearer", "x-api-key" | "bearer", "defined">;
        baseURL: z<string, string, "plain">;
        anthropicVersion: z<string, string, "plain">;
        timeoutMs: z<number, number, "defined">;
        headers: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        betas: z<string[], string[], "defined">;
        cache: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, "defined">;
        refusalFallback: z<"auto" | "on" | "off", "auto" | "on" | "off", "defined">;
        webSearch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        webFetch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            inputTypes?: ("text" | "image" | "pdf")[] | null | undefined;
            efforts?: ({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
            defaultEffort?: string | null | undefined;
            thinkingDisplay?: "summarized" | "omitted" | "updates" | null | undefined;
            sampling?: boolean | null | undefined;
            webTools?: "dynamic" | "basic" | "none" | null | undefined;
            fallback?: boolean | null | undefined;
            betas?: string[] | null | undefined;
            extraBody?: import("@deepseek-ai/cosmokit").Dict<any, string> | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            inputTypes: z<("text" | "image" | "pdf")[], ("text" | "image" | "pdf")[], "plain">;
            efforts: z<({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
                id: z<string, string, "defined">;
                name: z<string, string, "defined">;
                thinking: z<"adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "defined">;
                effort: z<"low" | "medium" | "high" | "xhigh" | "max", "low" | "medium" | "high" | "xhigh" | "max", "plain">;
                budgetTokens: z<number, number, "plain">;
            }>>[], "plain">;
            defaultEffort: z<string, string, "plain">;
            thinkingDisplay: z<"summarized" | "omitted" | "updates", "summarized" | "omitted" | "updates", "plain">;
            sampling: z<boolean, boolean, "plain">;
            webTools: z<"dynamic" | "basic" | "none", "dynamic" | "basic" | "none", "plain">;
            fallback: z<boolean, boolean, "plain">;
            betas: z<string[], string[], "plain">;
            extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "plain">;
        }>>[], "defined">;
        extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        retryPolicy: z<RetryPolicyConfig>;
        apiKeyEnv: z<string, string, "defined">;
        authMode: z<"x-api-key" | "bearer", "x-api-key" | "bearer", "defined">;
        baseURL: z<string, string, "plain">;
        anthropicVersion: z<string, string, "plain">;
        timeoutMs: z<number, number, "defined">;
        headers: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        betas: z<string[], string[], "defined">;
        cache: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, "defined">;
        refusalFallback: z<"auto" | "on" | "off", "auto" | "on" | "off", "defined">;
        webSearch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        webFetch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            inputTypes?: ("text" | "image" | "pdf")[] | null | undefined;
            efforts?: ({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
            defaultEffort?: string | null | undefined;
            thinkingDisplay?: "summarized" | "omitted" | "updates" | null | undefined;
            sampling?: boolean | null | undefined;
            webTools?: "dynamic" | "basic" | "none" | null | undefined;
            fallback?: boolean | null | undefined;
            betas?: string[] | null | undefined;
            extraBody?: import("@deepseek-ai/cosmokit").Dict<any, string> | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            inputTypes: z<("text" | "image" | "pdf")[], ("text" | "image" | "pdf")[], "plain">;
            efforts: z<({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
                id: z<string, string, "defined">;
                name: z<string, string, "defined">;
                thinking: z<"adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "defined">;
                effort: z<"low" | "medium" | "high" | "xhigh" | "max", "low" | "medium" | "high" | "xhigh" | "max", "plain">;
                budgetTokens: z<number, number, "plain">;
            }>>[], "plain">;
            defaultEffort: z<string, string, "plain">;
            thinkingDisplay: z<"summarized" | "omitted" | "updates", "summarized" | "omitted" | "updates", "plain">;
            sampling: z<boolean, boolean, "plain">;
            webTools: z<"dynamic" | "basic" | "none", "dynamic" | "basic" | "none", "plain">;
            fallback: z<boolean, boolean, "plain">;
            betas: z<string[], string[], "plain">;
            extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "plain">;
        }>>[], "defined">;
        extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "defined">;
    }>>>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    claude: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        retryPolicy: z<RetryPolicyConfig>;
        apiKeyEnv: z<string, string, "defined">;
        authMode: z<"x-api-key" | "bearer", "x-api-key" | "bearer", "defined">;
        baseURL: z<string, string, "plain">;
        anthropicVersion: z<string, string, "plain">;
        timeoutMs: z<number, number, "defined">;
        headers: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        betas: z<string[], string[], "defined">;
        cache: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, "defined">;
        refusalFallback: z<"auto" | "on" | "off", "auto" | "on" | "off", "defined">;
        webSearch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        webFetch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            inputTypes?: ("text" | "image" | "pdf")[] | null | undefined;
            efforts?: ({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
            defaultEffort?: string | null | undefined;
            thinkingDisplay?: "summarized" | "omitted" | "updates" | null | undefined;
            sampling?: boolean | null | undefined;
            webTools?: "dynamic" | "basic" | "none" | null | undefined;
            fallback?: boolean | null | undefined;
            betas?: string[] | null | undefined;
            extraBody?: import("@deepseek-ai/cosmokit").Dict<any, string> | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            inputTypes: z<("text" | "image" | "pdf")[], ("text" | "image" | "pdf")[], "plain">;
            efforts: z<({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
                id: z<string, string, "defined">;
                name: z<string, string, "defined">;
                thinking: z<"adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "defined">;
                effort: z<"low" | "medium" | "high" | "xhigh" | "max", "low" | "medium" | "high" | "xhigh" | "max", "plain">;
                budgetTokens: z<number, number, "plain">;
            }>>[], "plain">;
            defaultEffort: z<string, string, "plain">;
            thinkingDisplay: z<"summarized" | "omitted" | "updates", "summarized" | "omitted" | "updates", "plain">;
            sampling: z<boolean, boolean, "plain">;
            webTools: z<"dynamic" | "basic" | "none", "dynamic" | "basic" | "none", "plain">;
            fallback: z<boolean, boolean, "plain">;
            betas: z<string[], string[], "plain">;
            extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "plain">;
        }>>[], "defined">;
        extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        retryPolicy: z<RetryPolicyConfig>;
        apiKeyEnv: z<string, string, "defined">;
        authMode: z<"x-api-key" | "bearer", "x-api-key" | "bearer", "defined">;
        baseURL: z<string, string, "plain">;
        anthropicVersion: z<string, string, "plain">;
        timeoutMs: z<number, number, "defined">;
        headers: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        betas: z<string[], string[], "defined">;
        cache: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            ttl: z<"5m" | "1h", "5m" | "1h", "defined">;
        }>>, "defined">;
        refusalFallback: z<"auto" | "on" | "off", "auto" | "on" | "off", "defined">;
        webSearch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        webFetch: z<Schemastery.ObjectS<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            enabled: z<boolean, boolean, "defined">;
            maxUses: z<number, number, "plain">;
        }>>, "defined">;
        models: z<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            contextWindow?: number | null | undefined;
            maxTokens?: number | null | undefined;
            inputTypes?: ("text" | "image" | "pdf")[] | null | undefined;
            efforts?: ({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
            defaultEffort?: string | null | undefined;
            thinkingDisplay?: "summarized" | "omitted" | "updates" | null | undefined;
            sampling?: boolean | null | undefined;
            webTools?: "dynamic" | "basic" | "none" | null | undefined;
            fallback?: boolean | null | undefined;
            betas?: string[] | null | undefined;
            extraBody?: import("@deepseek-ai/cosmokit").Dict<any, string> | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: z<string, string, "defined">;
            name: z<string, string, "plain">;
            contextWindow: z<number, number, "plain">;
            maxTokens: z<number, number, "plain">;
            inputTypes: z<("text" | "image" | "pdf")[], ("text" | "image" | "pdf")[], "plain">;
            efforts: z<({
                id?: string | null | undefined;
                name?: string | null | undefined;
                thinking?: "adaptive" | "enabled" | "disabled" | "between_tools" | "omit" | null | undefined;
                effort?: "low" | "medium" | "high" | "xhigh" | "max" | null | undefined;
                budgetTokens?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
                id: z<string, string, "defined">;
                name: z<string, string, "defined">;
                thinking: z<"adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "adaptive" | "enabled" | "disabled" | "between_tools" | "omit", "defined">;
                effort: z<"low" | "medium" | "high" | "xhigh" | "max", "low" | "medium" | "high" | "xhigh" | "max", "plain">;
                budgetTokens: z<number, number, "plain">;
            }>>[], "plain">;
            defaultEffort: z<string, string, "plain">;
            thinkingDisplay: z<"summarized" | "omitted" | "updates", "summarized" | "omitted" | "updates", "plain">;
            sampling: z<boolean, boolean, "plain">;
            webTools: z<"dynamic" | "basic" | "none", "dynamic" | "basic" | "none", "plain">;
            fallback: z<boolean, boolean, "plain">;
            betas: z<string[], string[], "plain">;
            extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "plain">;
        }>>[], "defined">;
        extraBody: z<import("@deepseek-ai/cosmokit").Dict<any, string>, import("@deepseek-ai/cosmokit").Dict<any, string>, "defined">;
    }>>>, "volatile-defined">;
}>>, "plain">;
/** Capture an independent, validated generation so edits cannot affect an in-flight request. */
export declare function profileOf(config: Config): ClaudeProfile;
export declare function normalizeBaseURL(value: string | undefined): string;
export declare function isOfficialEndpoint(profile: Pick<ClaudeProfileOptions, 'baseURL'>): boolean;
export declare function validateModel(entry: ClaudeModelConfig): void;
export declare function validateProfile(input: VolatileSnapshot<ClaudeProfileOptions> | ClaudeProfileOptions): ClaudeProfile;
export {};
