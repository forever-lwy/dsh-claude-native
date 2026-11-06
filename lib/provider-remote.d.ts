import { z } from 'zod';
import type { RemoteResult, TypertClientRemote, TypertRemoteInfo, TypertRemoteMethod } from '@deepseek-ai/dsh-typert-protocol';
export declare const MAX_TIMEOUT_MS = 2147483647;
export declare const effortOptionSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    thinking: z.ZodEnum<{
        adaptive: "adaptive";
        enabled: "enabled";
        disabled: "disabled";
        between_tools: "between_tools";
        omit: "omit";
    }>;
    effort: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        max: "max";
    }>>;
    budgetTokens: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type EffortOptionView = z.infer<typeof effortOptionSchema>;
/** Only UI-owned fields cross the browser boundary; model betas and raw extraBody stay host-side. */
export declare const modelViewSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    contextWindow: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    inputTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        text: "text";
        image: "image";
        pdf: "pdf";
    }>>>;
    efforts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        thinking: z.ZodEnum<{
            adaptive: "adaptive";
            enabled: "enabled";
            disabled: "disabled";
            between_tools: "between_tools";
            omit: "omit";
        }>;
        effort: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            xhigh: "xhigh";
            max: "max";
        }>>;
        budgetTokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>>;
    defaultEffort: z.ZodOptional<z.ZodString>;
    thinkingDisplay: z.ZodOptional<z.ZodEnum<{
        summarized: "summarized";
        omitted: "omitted";
        updates: "updates";
    }>>;
    sampling: z.ZodOptional<z.ZodBoolean>;
    webTools: z.ZodOptional<z.ZodEnum<{
        dynamic: "dynamic";
        basic: "basic";
        none: "none";
    }>>;
    fallback: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type ModelView = z.infer<typeof modelViewSchema>;
export declare const connectionSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    apiKeyEnv: z.ZodString;
    authMode: z.ZodEnum<{
        "x-api-key": "x-api-key";
        bearer: "bearer";
    }>;
    baseURL: z.ZodOptional<z.ZodString>;
    anthropicVersion: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodNumber;
    betas: z.ZodArray<z.ZodString>;
    cache: z.ZodObject<{
        enabled: z.ZodBoolean;
        ttl: z.ZodEnum<{
            "5m": "5m";
            "1h": "1h";
        }>;
    }, z.core.$strict>;
    refusalFallback: z.ZodEnum<{
        auto: "auto";
        on: "on";
        off: "off";
    }>;
    webSearch: z.ZodObject<{
        enabled: z.ZodBoolean;
        maxUses: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    webFetch: z.ZodObject<{
        enabled: z.ZodBoolean;
        maxUses: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ConnectionView = z.infer<typeof connectionSchema>;
export declare const settingsSchema: z.ZodObject<{
    settingsNs: z.ZodString;
    revision: z.ZodNumber;
    writable: z.ZodBoolean;
    connection: z.ZodObject<{
        enabled: z.ZodBoolean;
        apiKeyEnv: z.ZodString;
        authMode: z.ZodEnum<{
            "x-api-key": "x-api-key";
            bearer: "bearer";
        }>;
        baseURL: z.ZodOptional<z.ZodString>;
        anthropicVersion: z.ZodOptional<z.ZodString>;
        timeoutMs: z.ZodNumber;
        betas: z.ZodArray<z.ZodString>;
        cache: z.ZodObject<{
            enabled: z.ZodBoolean;
            ttl: z.ZodEnum<{
                "5m": "5m";
                "1h": "1h";
            }>;
        }, z.core.$strict>;
        refusalFallback: z.ZodEnum<{
            auto: "auto";
            on: "on";
            off: "off";
        }>;
        webSearch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        webFetch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    credential: z.ZodObject<{
        configured: z.ZodBoolean;
        writable: z.ZodBoolean;
    }, z.core.$strict>;
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        inputTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            text: "text";
            image: "image";
            pdf: "pdf";
        }>>>;
        efforts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            thinking: z.ZodEnum<{
                adaptive: "adaptive";
                enabled: "enabled";
                disabled: "disabled";
                between_tools: "between_tools";
                omit: "omit";
            }>;
            effort: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                xhigh: "xhigh";
                max: "max";
            }>>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
        defaultEffort: z.ZodOptional<z.ZodString>;
        thinkingDisplay: z.ZodOptional<z.ZodEnum<{
            summarized: "summarized";
            omitted: "omitted";
            updates: "updates";
        }>>;
        sampling: z.ZodOptional<z.ZodBoolean>;
        webTools: z.ZodOptional<z.ZodEnum<{
            dynamic: "dynamic";
            basic: "basic";
            none: "none";
        }>>;
        fallback: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
    presets: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        inputTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            text: "text";
            image: "image";
            pdf: "pdf";
        }>>>;
        efforts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            thinking: z.ZodEnum<{
                adaptive: "adaptive";
                enabled: "enabled";
                disabled: "disabled";
                between_tools: "between_tools";
                omit: "omit";
            }>;
            effort: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                xhigh: "xhigh";
                max: "max";
            }>>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
        defaultEffort: z.ZodOptional<z.ZodString>;
        thinkingDisplay: z.ZodOptional<z.ZodEnum<{
            summarized: "summarized";
            omitted: "omitted";
            updates: "updates";
        }>>;
        sampling: z.ZodOptional<z.ZodBoolean>;
        webTools: z.ZodOptional<z.ZodEnum<{
            dynamic: "dynamic";
            basic: "basic";
            none: "none";
        }>>;
        fallback: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ClaudeSettingsView = z.infer<typeof settingsSchema>;
export declare const readRequestSchema: z.ZodObject<{}, z.core.$strict>;
export declare const discoverRequestSchema: z.ZodObject<{
    connection: z.ZodObject<{
        enabled: z.ZodBoolean;
        apiKeyEnv: z.ZodString;
        authMode: z.ZodEnum<{
            "x-api-key": "x-api-key";
            bearer: "bearer";
        }>;
        baseURL: z.ZodOptional<z.ZodString>;
        anthropicVersion: z.ZodOptional<z.ZodString>;
        timeoutMs: z.ZodNumber;
        betas: z.ZodArray<z.ZodString>;
        cache: z.ZodObject<{
            enabled: z.ZodBoolean;
            ttl: z.ZodEnum<{
                "5m": "5m";
                "1h": "1h";
            }>;
        }, z.core.$strict>;
        refusalFallback: z.ZodEnum<{
            auto: "auto";
            on: "on";
            off: "off";
        }>;
        webSearch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        webFetch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;
export declare const discoverySchema: z.ZodObject<{
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        inputTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            text: "text";
            image: "image";
            pdf: "pdf";
        }>>>;
        efforts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            thinking: z.ZodEnum<{
                adaptive: "adaptive";
                enabled: "enabled";
                disabled: "disabled";
                between_tools: "between_tools";
                omit: "omit";
            }>;
            effort: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                xhigh: "xhigh";
                max: "max";
            }>>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
        defaultEffort: z.ZodOptional<z.ZodString>;
        thinkingDisplay: z.ZodOptional<z.ZodEnum<{
            summarized: "summarized";
            omitted: "omitted";
            updates: "updates";
        }>>;
        sampling: z.ZodOptional<z.ZodBoolean>;
        webTools: z.ZodOptional<z.ZodEnum<{
            dynamic: "dynamic";
            basic: "basic";
            none: "none";
        }>>;
        fallback: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Discovery = z.infer<typeof discoverySchema>;
export declare const saveRequestSchema: z.ZodObject<{
    connection: z.ZodObject<{
        enabled: z.ZodBoolean;
        apiKeyEnv: z.ZodString;
        authMode: z.ZodEnum<{
            "x-api-key": "x-api-key";
            bearer: "bearer";
        }>;
        baseURL: z.ZodOptional<z.ZodString>;
        anthropicVersion: z.ZodOptional<z.ZodString>;
        timeoutMs: z.ZodNumber;
        betas: z.ZodArray<z.ZodString>;
        cache: z.ZodObject<{
            enabled: z.ZodBoolean;
            ttl: z.ZodEnum<{
                "5m": "5m";
                "1h": "1h";
            }>;
        }, z.core.$strict>;
        refusalFallback: z.ZodEnum<{
            auto: "auto";
            on: "on";
            off: "off";
        }>;
        webSearch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        webFetch: z.ZodObject<{
            enabled: z.ZodBoolean;
            maxUses: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    apiKey: z.ZodOptional<z.ZodString>;
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxTokens: z.ZodOptional<z.ZodNumber>;
        inputTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            text: "text";
            image: "image";
            pdf: "pdf";
        }>>>;
        efforts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            thinking: z.ZodEnum<{
                adaptive: "adaptive";
                enabled: "enabled";
                disabled: "disabled";
                between_tools: "between_tools";
                omit: "omit";
            }>;
            effort: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                xhigh: "xhigh";
                max: "max";
            }>>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
        defaultEffort: z.ZodOptional<z.ZodString>;
        thinkingDisplay: z.ZodOptional<z.ZodEnum<{
            summarized: "summarized";
            omitted: "omitted";
            updates: "updates";
        }>>;
        sampling: z.ZodOptional<z.ZodBoolean>;
        webTools: z.ZodOptional<z.ZodEnum<{
            dynamic: "dynamic";
            basic: "basic";
            none: "none";
        }>>;
        fallback: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
    expectedRevision: z.ZodNumber;
}, z.core.$strict>;
export type SaveRequest = z.infer<typeof saveRequestSchema>;
export type ReadRequest = z.infer<typeof readRequestSchema>;
type GetMethod = TypertRemoteMethod<{
    request: ReadRequest;
}, ClaudeSettingsView>;
type DiscoverMethod = TypertRemoteMethod<{
    request: DiscoverRequest;
}, Discovery>;
type SaveMethod = TypertRemoteMethod<{
    request: SaveRequest;
}, ClaudeSettingsView>;
/** Settings calls touch the global deployment, never a user-supplied Session resource. */
export declare const providerRemoteInfo: TypertRemoteInfo<{
    "nativeClaudeSettings/get": GetMethod;
    "nativeClaudeSettings/discover": DiscoverMethod;
    "nativeClaudeSettings/save": SaveMethod;
}>;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'nativeClaudeSettings/get': (request: ReadRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeSettingsView>>;
        'nativeClaudeSettings/discover': (request: DiscoverRequest, signal?: AbortSignal) => Promise<RemoteResult<Discovery>>;
        'nativeClaudeSettings/save': (request: SaveRequest, signal?: AbortSignal) => Promise<RemoteResult<ClaudeSettingsView>>;
    }
    interface TypertRemoteNamespaceMap {
        nativeClaudeSettings: {
            get(request: ReadRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeSettingsView>>;
            discover(request: DiscoverRequest, signal?: AbortSignal): Promise<RemoteResult<Discovery>>;
            save(request: SaveRequest, signal?: AbortSignal): Promise<RemoteResult<ClaudeSettingsView>>;
        };
    }
    interface RemoteErrorDetailsMap {
        'native-claude/settings-conflict': {
            revision: number;
        };
        'native-claude/discovery-failed': {
            status?: number;
        };
        'native-claude/credential-save-failed': {
            revision: number;
        };
        'native-claude/invalid-settings': Record<string, never>;
    }
}
/** Only safe action metadata crosses into UI recovery logic; credential payloads never do. */
export declare class SettingsRemoteError extends Error {
    readonly code: string;
    constructor(error: {
        code: string;
        message: string;
    });
}
export declare function getSettings(remote: TypertClientRemote, signal?: AbortSignal): Promise<ClaudeSettingsView>;
export declare function discoverModels(remote: TypertClientRemote, request: DiscoverRequest, signal?: AbortSignal): Promise<Discovery>;
export declare function saveSettings(remote: TypertClientRemote, request: SaveRequest, signal?: AbortSignal): Promise<ClaudeSettingsView>;
export {};
