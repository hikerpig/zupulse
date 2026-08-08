---
feature: desktop-diagnostics
title: Desktop Diagnostics
status: current
delivery: available
last_verified: 2026-08-08
hosts:
  - desktop
implementation_paths:
  - apps/desktop-shell/src/main/diagnostics.ts
  - apps/desktop-shell/src/main/diagnostic-store.ts
  - apps/desktop-shell/src/main/diagnostic-instrumentation.ts
  - apps/desktop-shell/src/main/diagnostic-exporter.ts
  - apps/desktop-shell/src/desktop-diagnostic-reporter.ts
  - packages/web-core/src/bridge/schemas.ts
supersedes: []
---

# Desktop Diagnostics Feature Contract

## 一句话契约

Desktop 在本机保存少量、隐私安全的 Host Diagnostic Event，用户可从原生 Help 菜单主动导出
`.jsonl.gz` 副本并自行分享。该能力不自动上传、不记录产品使用行为，也不向 Renderer 开放日志读取。

## 用户入口

- Desktop 原生 Help 菜单提供“导出诊断信息…”；用户选择保存位置后得到
  `zupulse-diagnostics-<UTC>.jsonl.gz`。
- 非 packaged 开发构建在 Development 菜单额外提供“打开诊断目录”；packaged 构建不提供该入口。
- zh-CN 与 en-US 使用同构菜单、保存 Dialog 和稳定失败文案；切换 locale 后重建原生菜单。

## 当前已实现行为

### 采集与持久化

- Renderer 只能通过严格 `diagnostics.write` Bridge payload 提交稳定 `code`、allowlisted `operation`、
  有界 `errorCode`、非负 `durationMs` 和 8–16 位小写 hash 前缀。Main 添加 UTC 时间、schema version、
  app/Electron version、platform、arch 和 `source`。
- Desktop 记录启动边界、Bridge 拒绝、持久化数据损坏、生命周期超时、Renderer/child process 终止、
  Renderer load/preload/unresponsive，以及 Viewer/Studio 已有 failure reporting seam。
- instrumentation 只映射稳定 code、allowlisted operation、Electron reason 和整数 exit code；原始 Error、
  message、stack、URL、路径和任意 payload 不进入持久化事件。
- 写入在单一 Promise chain 中串行执行。`desktop.log` 与 `desktop.log.1` 按 `current + incoming` bytes
  轮转，每段上限约 1 MiB；启动时删除修改时间超过 7 天的段。

### 导出

- 保存 Dialog 确认后，snapshot 在同一写入 chain 中排队并按 `.1`、current 的顺序读取，不修改源日志。
- Exporter 逐行 JSON 解析并用 persisted Zod schema 重验，只保留有效事件；损坏或截断行被跳过。
- 有效 JSONL 在内存中使用 Node gzip 压缩，再以尽可能严格的本地文件权限写入用户选择的位置。

### 取消与失败

- 用户取消保存时不读取 snapshot、不创建文件，也不改变日志。
- mkdir、stat、rotation、append、snapshot、gzip 或保存失败不阻断启动、Bridge handler、Library、播放或退出。
- 导出失败只显示稳定的本地化消息；原始异常和保存路径不进入 Renderer DOM 或 Dialog 文案。

## 领域不变量

1. Renderer diagnostic input 与 persisted event 都必须经过严格 schema；宿主字段只能由 Main 添加。
2. 诊断与导出不得包含原始异常、路径、文件名、file token、Bridge payload、用户内容、Library Score ID、
   完整 hash、用户名、主机名或设备标识。
3. Diagnostic Export 只能由用户主动发起；不存在自动上传、网络传输或 Renderer read/list API。
4. snapshot 与 append 共享串行 chain；导出不得轮转、截断或改写源日志。
5. diagnostics failure 是 best-effort，不得改变应用业务流程或 Electron 默认故障生命周期。

完整字段约束见 `packages/web-core/src/bridge/schemas.ts` 与
`apps/desktop-shell/src/main/diagnostics.ts`，本文不复制 schema。

## 明确非目标

- 产品行为遥测、自动上传、设备标识或远程日志服务。
- 应用内日志查看器、Renderer 日志 read/list Bridge、batching、优先级队列或内存 fallback。
- Crashpad/minidump、source map、stack fingerprint、专用 inspector CLI 或通用 logging framework。
- 普通成功操作、点击、页面浏览、播放位置、暂停次数或曲谱使用频率。

## 验收契约

- 给定合法 Renderer failure，当 Bridge 请求被处理时，持久化事件必须只包含安全输入和 Main 补全的宿主字段。
- 给定并发事件和即将越界的 current segment，当事件写入时，顺序必须稳定且按 incoming bytes 先轮转。
- 给定超过 7 天的日志段，当 Desktop diagnostics 初始化时，旧段必须删除且初始化失败不得阻断应用。
- 给定包含有效、损坏和截断行的两段日志，当用户导出时，gzip 解压后必须只含旧到新的有效事件。
- 给定用户取消或导出失败，源日志不得改变；失败 UI 不得包含原始异常或路径。
- 给定 packaged Desktop，菜单不得提供打开日志目录；给定开发构建，该入口只属于 Development 菜单。

## 证据地图

| 契约                                          | 运行时代码 / Schema                                                                                 | 自动化证据                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Bridge 安全输入与 iPad 同步                   | `packages/web-core/src/bridge/schemas.ts`、`apps/ipad-shell/bridge/bridge-contract-validator.swift` | `schemas.test.ts`、`contract-manifest.test.ts`、`diagnostic-logger-tests.swift` |
| Main 宿主字段与 best-effort 门面              | `apps/desktop-shell/src/main/diagnostics.ts`                                                        | `apps/desktop-shell/src/main/__tests__/diagnostics.test.ts`                     |
| 串行写入、轮转、保留与 snapshot               | `apps/desktop-shell/src/main/diagnostic-store.ts`                                                   | `apps/desktop-shell/src/main/__tests__/diagnostic-store.test.ts`                |
| Electron、Node、Bridge 与 persistence mapping | `apps/desktop-shell/src/main/diagnostic-instrumentation.ts`                                         | `apps/desktop-shell/src/main/__tests__/diagnostic-instrumentation.test.ts`      |
| Renderer failure adapter                      | `apps/desktop-shell/src/desktop-diagnostic-reporter.ts`                                             | `apps/desktop-shell/src/__tests__/desktop-diagnostic-reporter.test.ts`          |
| 重验、gzip、取消与失败                        | `apps/desktop-shell/src/main/diagnostic-exporter.ts`                                                | `apps/desktop-shell/src/main/__tests__/diagnostic-exporter.test.ts`             |
| 原生菜单、locale 与真实导出                   | `apps/desktop-shell/src/main/main.ts`、`packages/app-i18n/src/locales`                              | `apps/desktop-shell/e2e/desktop.spec.ts`                                        |

## 相关资料

- 产品术语：[`CONTEXT.md`](../../../CONTEXT.md)
- 当前架构入口：[`docs/architecture/README.md`](../../architecture/README.md)
- Spec：[`2026-08-08-desktop-diagnostics-design.md`](../../specs/2026-08-08-desktop-diagnostics-design.md)
- ADR：[`0029`](../../adr/0029-keep-internal-build-telemetry-free.md)、
  [`0056`](../../adr/0056-keep-raw-errors-out-of-production-ui.md)、
  [`0062`](../../adr/0062-keep-zod-as-source-for-ipad-bridge-contract.md)

## 维护触发器

- Host Diagnostic input、persisted schema、Bridge request union 或 iPad contract 变化。
- Electron/Node listener、Viewer/Studio failure operation 或稳定错误码变化。
- 日志路径、轮转大小、保留期、snapshot 排序或文件权限变化。
- 导出格式、保存 Dialog、原生菜单、locale 或 packaged/development 可见性变化。
- 引入任何网络诊断、崩溃产物、Renderer 日志读取或新的敏感字段。
