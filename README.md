# dsh-claude-native

DeepSeek Harness（dsh）`0.2.1-rc.5` 的 Anthropic Claude 原生供应商插件。直接用官方 `@anthropic-ai/sdk`（固定 `0.137.0`）调用 Messages API 流式接口，在 **设置 → 模型** 的 **Claude（原生）** 卡片中配置连接、模型容量与思考档位。适用于官方 API，也适用于提供 Anthropic 原生协议的中转站。

## 为什么不用内置的自定义供应商

2026-11-04 针对实际安装的 `0.2.1-rc.5` 核对（`@deepseek-ai/dsh-llm-pi-ai` + `@earendil-works/pi-ai 1.4.0`）：

| 问题 | 内置自定义供应商（pi-ai `anthropic-messages`） | 本插件 |
| --- | --- | --- |
| 协议实现 | 官方 SDK 之上的通用抽象层；官方 `anthropic` 目录路由较完整 | 直接构造原生请求，原样回放原生内容块 |
| 中转站 / “自定义模型 API” 路由上的思考 | 手工声明的模型没有目录元数据，`forceAdaptiveThinking` 只能写 YAML；任何思考档位都会发送 `thinking: {type: "enabled", budget_tokens}`，Opus 4.7+ / Sonnet 5.x / Fable 等模型返回 400；为 Opus 5.5 声明 off 档位会发送它拒绝的 `disabled` | 每个模型有经核对的 adaptive / effort / 关闭方式（`disabled`、`between_tools` 或不可关闭） |
| 界面设置 | 能改上下文长度、最大输出、输入类型；推理档位仅能填“档位→参数字符串”，但在 budget 模式下这个字符串不会被使用 | 上下文、最大输出、输入类型、思考档位（thinking 模式 / effort / 预算）、默认档位、思考显示方式、网页工具、采样、拒答回退、缓存 TTL、beta、认证方式、anthropic-version 均可在卡片中编辑 |
| 思考显示 | 固定 `summarized` | 可选 summarized / omitted / updates（自动加 beta 头） |
| PDF | 不支持，只走本地路径文本 | 用户上传或工具返回的 PDF 以 `document` 块原生发送 |
| 图片 | 默认压到 4 MP / 1 MiB（仅 YAML 可调） | 保留 dsh 归一化后的图片，仅在超过 Anthropic 5 MB / 8000 px 限制时缩放 |
| 服务端工具 | 无 | web_search / web_fetch（动态过滤版或基础版），自动续接 `pause_turn`，汇总来源链接 |
| 拒答 | 只有 Fable 5 目录内置旧式数组回退 | `fallbacks: "default"`（自动仅对官方端点及支持的模型启用），`refusal` 映射为 `CONTENT_FILTER` 并附类别 |
| 提示缓存 TTL | 1 小时需要 YAML `cacheRetention: long`，界面无入口 | 卡片中选择 5 分钟 / 1 小时 |

结论：内置支持在官方 `anthropic` 路由上大体可用，但对中转站不算原生支持，界面也缺少思考等关键设置，所以开发本插件。

## 功能

- **思考与 effort**：每个档位映射为 `thinking.type`（`adaptive` / `enabled`+预算 / `disabled` / `between_tools` / 不发送）与 `output_config.effort`。预设：

  | 模型 | 档位 | 默认 | 关闭思考 |
  | --- | --- | --- | --- |
  | Claude Opus 5.5、Fable 5.1 / 5 | low · medium · high · xhigh · max | high | 不可关闭 |
  | Claude Sonnet 5.5 | off · low … max | high | `between_tools` |
  | Claude Haiku 5.5 | off · low … max | medium | `disabled` |
  | Claude Opus 5、Sonnet 5、Opus 4.8 / 4.7 | off · low … max | high | `disabled` |
  | Claude Opus 4.6、Sonnet 4.6 | off · low · medium · high · max | high | `disabled` |
  | Claude Haiku 4.5 | off · 4k · 16k · 32k 预算 | off | `disabled` |

  已知 ID（含 `-20251001` 之类的日期后缀）缺省字段自动继承预设；显式写入的值（包括空档位列表、`false`）优先。
- **原样回放**：thinking 签名、redacted thinking、服务端工具块、引用（citations）、fallback 块都保存在 replayState 中，下一轮逐字节回放。历史被编辑或来自其他供应商时退化为普通文本与 tool_use，不伪造签名。外部工具 ID 会规范化为 Anthropic 允许的字符。
- **提示缓存**：在工具定义、系统提示、最后一条消息和上一个用户回合放置断点（共 4 个），用量回报 `cacheReadTokens` / `cacheWriteTokens`。
- **错误**：`prompt is too long` → `CONTEXT_WINDOW_EXCEEDED`（触发 dsh 压缩）；429 → `RATE_LIMIT`（带 retry-after）；5xx / 529 / 流内 overloaded → `SERVER`；连接失败 → `TRANSPORT`；这些可由 dsh-llm-retry 重试。错误信息附带上游的错误类型与说明（不含密钥），便于排查中转站问题。
- **模型发现**：“从上游获取模型”调用 `GET /v1/models`，读取 `max_input_tokens`、`max_tokens` 与 thinking / effort / 图片 / PDF 能力树。
- **采样参数**：当前模型拒绝 `temperature`；只对声明了 `sampling` 的旧模型且思考关闭时转发。
- **宿主插件 API**：`await ctx.nativeClaude.client()` 返回按当前配置构造的官方 SDK 客户端（batches、count_tokens、files 等）。

## 安装与测试

按部署约定，不自动安装。构建好的版本包位于宿主机 `plugins/releases/dsh-claude-native-<版本>.tgz`。在 dsh 的 **插件 → 添加插件** 中输入容器路径（例如 `/plugins/releases/dsh-claude-native-0.1.0.tgz`）并确认安装。之后每个版本使用新的版本号和文件名。

安装后在 **设置 → 模型** 找到 **Claude（原生）**，点击 **配置 Claude 提供商**：

1. 官方 API：保持 Base URL 为空、认证方式 `x-api-key`，输入 API Key。
2. 中转站：填写其 Anthropic 原生根地址（可带 `/v1`）；若中转要求 `Authorization: Bearer`，切换认证方式。中转可能不支持 `fallbacks`、服务端工具或较新的 beta，请按需关闭。
3. 添加模型 ID 或“从上游获取模型”，展开“详细设置”调整上下文、最大输出、思考档位等，保存后新请求立即生效。

API Key 只写入 dsh 凭据存储（默认引用名 `ANTHROPIC_API_KEY`），不进入 `cordis.patch.yml`。插件显式传入凭据，不会读取容器里的 `ANTHROPIC_*` 环境变量或 `ant auth` 配置。

YAML 示例：[中转站](examples/relay.yaml)、[进阶字段](examples/advanced.yaml)。`headers`、逐模型 `betas` 与 `extraBody`（如 `speed`、`task_budget`、`inference_geo`、`context_management`）只在 YAML 中编辑，界面保存时保留不变。合并到既有插件条目即可，不要覆盖整个文件。

## 已知限制

- 未接入：代码执行服务端工具、Files API 上传、mid-conversation system messages（dsh 未声明 in-history 更新时会把系统提示整体放在顶层）、服务端 compaction、按会话切换网页工具的聊天栏开关。
- 非 PDF 文件仍按 dsh 默认方式提供本地路径，由模型用文件工具读取。
- rc.5 模型页没有供应商编辑器覆盖插槽：插件用 CSS 隐藏 Claude 卡片上宿主无法使用的“编辑”按钮。宿主类名属于 rc.5，升级 dsh 后需重新核对。
- 使用 `anthropic-version: 2023-06-01`（SDK 0.x 默认）。可在设置中改为 `2026-10-21`；该版本拒绝所有 `temperature`，插件默认也不发送。
- 未做真实 API 调用验证；协议测试使用离线 SSE 夹具和真实 SDK、真实 rc.5 `LlmRuntime` / 设置持久化。

## 开发

```sh
npm install
npm run build   # tsc + 浏览器端 lib/client.js
npm test        # 协议、rc.5 运行时、设置持久化与 jsdom 界面测试
```

源码：`src/config.ts`（配置与预设）、`src/request.ts`（请求构造）、`src/messages.ts`（历史转换与回放）、`src/stream.ts`（流转换）、`src/adapter.ts`、`src/provider-settings.ts`（模型页 Remote）、`src/client/`（界面）。
