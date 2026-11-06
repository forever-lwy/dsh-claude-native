var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { SettingsConflictError } from '@deepseek-ai/dsh-settings';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { MODEL_PRESETS, presetModel, validateProfile } from './config.js';
import { discoverRequestSchema, discoverySchema, providerRemoteInfo, readRequestSchema, saveRequestSchema, } from './provider-remote.js';
const CONNECTION_KEYS = ['enabled', 'apiKeyEnv', 'authMode', 'baseURL', 'anthropicVersion', 'timeoutMs', 'betas', 'cache', 'refusalFallback', 'webSearch', 'webFetch'];
const MODEL_KEYS = ['name', 'contextWindow', 'maxTokens', 'inputTypes', 'efforts', 'defaultEffort', 'thinkingDisplay', 'sampling', 'webTools', 'fallback'];
function parse(schema, value) {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw new RemoteError('gateway/bad-request', 'Claude 配置输入无效。', {});
    return parsed.data;
}
export function viewConnection(profile) {
    return {
        enabled: profile.enabled, apiKeyEnv: profile.apiKeyEnv, authMode: profile.authMode,
        ...(profile.baseURL ? { baseURL: profile.baseURL } : {}),
        ...(profile.anthropicVersion ? { anthropicVersion: profile.anthropicVersion } : {}),
        timeoutMs: profile.timeoutMs, betas: [...profile.betas],
        cache: { ...profile.cache }, refusalFallback: profile.refusalFallback,
        webSearch: { ...profile.webSearch }, webFetch: { ...profile.webFetch },
    };
}
export function viewModel(model) {
    const view = { id: model.id };
    for (const key of MODEL_KEYS)
        if (model[key] !== undefined)
            Object.assign(view, { [key]: structuredClone(model[key]) });
    return view;
}
/** UI-owned fields replace; host-only fields (betas, extraBody) survive for an existing id. */
function mergeModels(current, input) {
    return input.map(view => {
        const existing = current.find(model => model.id === view.id);
        const result = { id: view.id };
        if (existing?.betas)
            result.betas = structuredClone(existing.betas);
        if (existing?.extraBody)
            result.extraBody = structuredClone(existing.extraBody);
        for (const key of MODEL_KEYS)
            if (view[key] !== undefined && view[key] !== '')
                Object.assign(result, { [key]: structuredClone(view[key]) });
        return result;
    });
}
let ClaudeSettingsService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _get_decorators;
    let _discover_decorators;
    let _save_decorators;
    return class ClaudeSettingsService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _get_decorators = [Remote];
            _discover_decorators = [Remote];
            _save_decorators = [Remote];
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _discover_decorators, { kind: "method", name: "discover", static: false, private: false, access: { has: obj => "discover" in obj, get: obj => obj.discover }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _save_decorators, { kind: "method", name: "save", static: false, private: false, access: { has: obj => "save" in obj, get: obj => obj.save }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        options = __runInitializers(this, _instanceExtraInitializers);
        saves = Promise.resolve();
        constructor(ctx, options) {
            super(ctx, 'nativeClaudeSettings');
            this.options = options;
        }
        descriptor() {
            try {
                const descriptor = this.ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === this.options.settingsNs);
                if (!descriptor)
                    throw new Error('missing settings entry');
                return descriptor;
            }
            catch {
                throw new RemoteError('gateway/internal', 'Claude 插件配置当前不可用。', {});
            }
        }
        async credentialInfo(profile) {
            const credentials = this.ctx.get('credentials');
            if (credentials) {
                const info = await credentials.describe(credentialRef(profile.apiKeyEnv));
                return { configured: info.configured, writable: info.writable };
            }
            return { configured: Boolean(launchEnvironmentOf(this.ctx).get(profile.apiKeyEnv)?.value), writable: false };
        }
        async get(request, signal) {
            parse(readRequestSchema, request);
            try {
                return await this.read(signal);
            }
            catch (error) {
                if (signal.aborted)
                    throw new RemoteError('gateway/cancelled', 'Claude 配置读取已取消。', {});
                if (error instanceof RemoteError)
                    throw error;
                throw new RemoteError('gateway/internal', 'Claude 插件配置读取失败。', {});
            }
        }
        async read(signal) {
            signal.throwIfAborted();
            const descriptor = this.descriptor();
            const profile = this.options.profile();
            const credential = await this.credentialInfo(profile);
            signal.throwIfAborted();
            return {
                settingsNs: this.options.settingsNs, revision: descriptor.revision, writable: this.ctx.settings.writable,
                connection: viewConnection(profile), credential,
                models: profile.models.map(viewModel),
                presets: Object.keys(MODEL_PRESETS).map(id => viewModel(presetModel(id))),
            };
        }
        draft(connection, models) {
            const current = this.options.profile();
            try {
                const draft = { ...structuredClone(current), ...structuredClone(connection) };
                if (!connection.baseURL)
                    delete draft.baseURL;
                if (!connection.anthropicVersion)
                    delete draft.anthropicVersion;
                if (models)
                    draft.models = mergeModels(current.models, models);
                return validateProfile(draft);
            }
            catch (error) {
                throw new RemoteError('native-claude/invalid-settings', error instanceof LlmError ? error.message : 'Claude 连接或模型参数无效。', {});
            }
        }
        async apiKey(profile, supplied) {
            if (supplied)
                return assertUsableApiKey(supplied, 'dsh-claude-native', profile.apiKeyEnv);
            const credentials = this.ctx.get('credentials');
            const ref = credentialRef(profile.apiKeyEnv);
            const resolved = credentials ? await credentials.resolve(ref) : launchEnvironmentOf(this.ctx).get(ref);
            if (resolved?.value)
                return assertUsableApiKey(resolved.value, 'dsh-claude-native', ref);
            throw new RemoteError('gateway/bad-request', '请先输入 API Key，或配置对应的凭据引用。', {});
        }
        async discover(request, signal) {
            request = parse(discoverRequestSchema, request);
            signal.throwIfAborted();
            const profile = this.draft(request.connection);
            try {
                const key = await this.apiKey(profile, request.apiKey);
                const models = await this.options.discover(profile, key, signal);
                signal.throwIfAborted();
                return discoverySchema.parse({ models: models.map(viewModel) });
            }
            catch (error) {
                if (signal.aborted)
                    throw new RemoteError('gateway/cancelled', '模型获取已取消。', {});
                if (error instanceof RemoteError)
                    throw error;
                const status = error instanceof LlmError ? error.failure.status : undefined;
                throw new RemoteError('native-claude/discovery-failed', error instanceof LlmError ? `无法获取模型列表：${error.message}` : '无法获取模型列表，请检查 Base URL 与认证。', status === undefined ? {} : { status });
            }
        }
        async save(request, signal) {
            request = parse(saveRequestSchema, request);
            const operation = this.saves.then(() => this.saveExclusive(request, signal)).catch(error => {
                if (error instanceof RemoteError)
                    throw error;
                if (signal.aborted)
                    throw new RemoteError('gateway/cancelled', 'Claude 配置保存已取消。', {});
                throw new RemoteError('gateway/internal', 'Claude 配置保存失败。', {});
            });
            this.saves = operation.then(() => undefined, () => undefined);
            return operation;
        }
        async saveExclusive(request, signal) {
            signal.throwIfAborted();
            const descriptor = this.descriptor();
            if (!this.ctx.settings.writable)
                throw new RemoteError('gateway/bad-request', '当前配置只读，无法保存 Claude 设置。', {});
            if (request.expectedRevision !== descriptor.revision)
                throw new RemoteError('native-claude/settings-conflict', 'Claude 配置已在其他窗口变化，请重新加载后保存。', { revision: descriptor.revision });
            const draft = this.draft(request.connection, request.models);
            let apiKey;
            if (request.apiKey !== undefined) {
                try {
                    apiKey = assertUsableApiKey(request.apiKey, 'dsh-claude-native', draft.apiKeyEnv);
                }
                catch {
                    throw new RemoteError('gateway/bad-request', 'API Key 格式无效。', {});
                }
                const credentials = this.ctx.get('credentials');
                if (!credentials || !(await credentials.describe(credentialRef(draft.apiKeyEnv))).writable) {
                    throw new RemoteError('gateway/bad-request', '当前凭据存储不可写，无法保存 API Key。', {});
                }
            }
            // Field-level writes keep private headers and raw extraBody intact.
            const ops = CONNECTION_KEYS.map(key => ({ op: 'set', path: ['claude', key], value: draft[key] ?? '' }));
            ops.push({ op: 'set', path: ['claude', 'models'], value: draft.models });
            signal.throwIfAborted();
            try {
                await this.ctx.settings.mutate(this.options.settingsNs, ops, request.expectedRevision);
            }
            catch (error) {
                if (error instanceof SettingsConflictError)
                    throw new RemoteError('native-claude/settings-conflict', 'Claude 配置已在其他窗口变化，请重新加载后保存。', { revision: error.actual });
                throw new RemoteError('gateway/internal', 'Claude 设置保存失败。', {});
            }
            if (apiKey !== undefined) {
                try {
                    await this.ctx.credentials.set(credentialRef(draft.apiKeyEnv), apiKey);
                }
                catch {
                    throw new RemoteError('native-claude/credential-save-failed', '设置已保存，但 API Key 保存失败；请重新输入密钥并保存。', { revision: this.descriptor().revision });
                }
            }
            // Once the commit starts, finish it even if the view has gone away.
            return this.read(new AbortController().signal);
        }
    };
})();
export { ClaudeSettingsService };
export function registerClaudeSettings(ctx, options) {
    const service = new ClaudeSettingsService(ctx, options);
    ctx.typert.remotes.register(providerRemoteInfo);
    return service;
}
