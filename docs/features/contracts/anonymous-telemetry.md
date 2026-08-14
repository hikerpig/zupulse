---
feature: anonymous-telemetry
title: Anonymous Product Telemetry and Error Tracking
status: current
delivery: partial
last_verified: 2026-08-14
hosts:
  - browser
  - desktop
implementation_paths:
  - packages/web-core/src/telemetry
  - packages/web-viewer/src/app/ViewerApplication.ts
  - apps/web-demo/src/telemetry/browser-telemetry.ts
  - apps/desktop-shell/src/telemetry/desktop-telemetry.ts
  - apps/desktop-shell/src/main/telemetry-preference-store.ts
supersedes: []
---

# Anonymous Product Telemetry and Error Tracking Feature Contract

## 一句话契约

Browser 与 Desktop 分发构建可以发送可退出的匿名产品事件和经过清洗的 JavaScript 异常；Internal
Acceptance、开发测试构建与 iPad 保持 No-op。遥测不是业务事实源，也不接收曲谱内容、文件身份或应用状态。

## 用户入口

首次进入共享 App Shell 时显示双语、非阻塞的遥测告知。用户可继续分享或关闭分享；Header 中的隐私设置可在
各路由调整开关。设置先持久化，失败时保留原状态并显示稳定的本地化错误。

## 当前已实现行为

### 成功路径

- Shared application 通过 `TelemetryPort` 发送严格 schema 的 lifecycle、import、workspace、playback、
  issue 和 runtime failure 事件。
- Browser 使用 localStorage 保存匿名 installation state；Desktop Main 使用私有原子 JSON 文件保存 state，
  Renderer 只能消费 Main 通过 Bridge 提供的 identity/session context。
- Provider adapter 只向 PostHog Cloud US 的精确 ingestion origin 发送 allowlisted properties，禁用
  person profile 与 GeoIP enrichment；无效配置和 provider failure 降级为 No-op。
- 异常在发送前移除路径、URL 参数、UUID、hash、token、cause/custom fields，并受每 session 20 条及
  fingerprint 时间窗限制。

### 取消、失败与重试

取消文件选择不产生 import 事件。关闭分享会删除 installation identity、停止后续 capture；重新启用会创建
新的 identity/session。持久化失败返回稳定的 recoverable Bridge/application error，原状态不变。

### 恢复与并发

Browser 刷新保留 installation identity 并创建新的 application session。Desktop relaunch 保留 installation
identity，并由 Main 为本次运行创建新的 application session。损坏的 Desktop state 会被隔离并 fail closed。

## 平台能力矩阵

| 能力                          | Browser              | Desktop                    | 当前差异                                                   |
| ----------------------------- | -------------------- | -------------------------- | ---------------------------------------------------------- |
| 匿名 semantic events          | 支持（有效分发配置） | 支持（Main-owned context） | Provider adapter 位于各 host                               |
| JavaScript exception tracking | 支持                 | 支持 Renderer/Main         | native crash dump 不在范围内                               |
| 用户退出与 identity reset     | 支持                 | 支持                       | Desktop preference 由 Bridge 持久化                        |
| iPad telemetry                | 不适用               | 不适用                     | iPad 保持 No-op 且 Bridge allowlist 不含 telemetry request |

## 领域不变量

1. `TelemetryPort` 只接受 schema-approved semantic event；provider adapter 不得成为契约事实源。
2. Desktop Main owns `installationId` and `applicationSessionId`; Renderer cannot submit or overwrite either.
3. Disabled state never retains an installation identity; preference writes complete before UI state changes.
4. Telemetry failure cannot reject import, open, playback, save, close, or local diagnostics operations.

运行时约束见 [`packages/web-core/src/telemetry/schemas.ts`](../../../packages/web-core/src/telemetry/schemas.ts)
和 [`packages/web-core/src/telemetry/sanitizer.ts`](../../../packages/web-core/src/telemetry/sanitizer.ts)。

## 进行中的目标差异

以下内容尚未作为发布治理事实落地：

- source-map upload/release smoke 尚未接入 CI provider workflow；当前只提供 opt-in source-map build 和产物检查。
- 本地 fake-ingestion E2E、PostHog dashboard、公开隐私 URL、retention policy 与 named access owner 尚未记录。
- native crash dump、durable offline queue 和 iPad telemetry 明确不在当前承诺范围。

## 明确非目标

- 账号身份、跨设备合并、广告标识、设备指纹、autocapture、Session Replay、performance tracing、survey。
- 曲谱标题、作者、文件名、路径、content hash、score bytes、DOM text、URL route、network payload 或本地诊断文件。

## 验收契约

- 给定无效 release channel、缺 token 或非 US ingestion host，当 host 初始化时，必须得到 No-op 且不发起网络请求。
- 给定用户关闭分享，当设置持久化成功后，后续 semantic event 与 exception 不得产生 provider request。
- 给定敏感 synthetic exception，当 sanitizer 无法证明安全时，必须丢弃 provider event，而不影响宿主操作。
- 给定首次 library refresh 成功或 degraded，当应用 shell 已挂载后，必须最多发送一次 `application_ready`。

## 证据地图

| 契约                                    | 运行时代码 / Schema                                                                                    | 自动化证据                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| strict events and sanitizer             | `packages/web-core/src/telemetry/{schemas,sanitizer,types}.ts`                                         | `packages/web-core/src/telemetry/__tests__/telemetry.test.ts`                            |
| Browser identity and provider allowlist | `apps/web-demo/src/telemetry/browser-telemetry.ts`                                                     | `apps/web-demo/src/telemetry/__tests__/browser-telemetry.test.ts`                        |
| Desktop identity and Bridge             | `apps/desktop-shell/src/main/telemetry-preference-store.ts`, `packages/web-core/src/bridge/schemas.ts` | Desktop bridge/store tests and contract manifest test                                    |
| semantic events and issue presentation  | `packages/web-viewer/src/app/ViewerApplication.ts`, App/route pages                                    | `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`, full Viewer/App suite |
| Browser/Desktop journeys                | Browser and Desktop host composition                                                                   | `pnpm verify:e2e`                                                                        |

## 相关资料

- 当前规格：[`docs/specs/2026-08-08-anonymous-product-telemetry-and-error-tracking.md`](../../specs/2026-08-08-anonymous-product-telemetry-and-error-tracking.md)
- Current ADR：[`docs/adr/0068-allow-opt-out-telemetry-on-distributed-builds.md`](../../adr/0068-allow-opt-out-telemetry-on-distributed-builds.md)
- Internal Acceptance ADR：[`docs/adr/0029-keep-internal-build-telemetry-free.md`](../../adr/0029-keep-internal-build-telemetry-free.md)

## 维护触发器

- telemetry event schema、Bridge handshake/preference、identity persistence 或 host allowlist 变化。
- 告知、Header setting、错误呈现和 release-channel boundary 变化。
- source-map、privacy notice、retention/access governance gate 落地或变更。
