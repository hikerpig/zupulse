---
status: implemented
---

# Desktop Diagnostics 设计

## 目标

在 Electron Desktop Shell 中保存少量、隐私安全的结构化诊断，使用户遇到问题后可以主动导出并自行交给开发者排查。诊断失败不得阻断启动、导入、播放、保存或退出。

该系统不是产品行为遥测，不自动上传，不提供应用内日志查看器或 Renderer 日志读取能力。

## 当前基础

Desktop Main 已有 `DiagnosticLogger`、严格 Zod 输入、1 MiB 双文件轮转和“打开诊断目录”菜单。当前只有 `LIFECYCLE_ACK_TIMEOUT` 实际写入；`ViewerHost.reportDiagnostic` 尚未接入 Electron Host，Logger 也在 Library 初始化之后才创建。

本 Spec 只扩展现有实现，不引入通用 logging framework、数据库、第三方日志依赖或远程服务。

## 用户流程

用户从原生 Help 菜单选择“导出诊断信息…”，选择保存位置，得到一个 `zupulse-diagnostics-<UTC>.jsonl.gz` 文件，再自行发送给开发者。

- 取消保存不创建文件，也不改变现有日志。
- 导出失败显示稳定、本地化的可恢复错误，不展示原始异常或路径。
- “打开诊断目录”只在非 packaged 开发菜单中保留。
- 导出由 Main 直接调用，不新增 Renderer read/list Bridge API。

## 最小分层

```text
apps/desktop-shell/src/main/diagnostics.ts
  DesktopDiagnostics 门面；补全宿主字段、校验并路由 record/export

apps/desktop-shell/src/main/diagnostic-store.ts
  JSONL append、轮转、保留和一致 snapshot

apps/desktop-shell/src/main/diagnostic-instrumentation.ts
  Electron / Node listeners 与安全错误码映射

apps/desktop-shell/src/main/diagnostic-exporter.ts
  snapshot 校验、node:zlib gzip 和原生保存 Dialog
```

四个模块使用具体类或函数直接依赖，不增加单实现 interface、provider、factory、transport、event bus 或配置框架。

`main.ts` 只负责组装：

```ts
const diagnostics = new DesktopDiagnostics(options);
installAppDiagnosticInstrumentation(app, diagnostics);
installWindowDiagnosticInstrumentation(mainWindow, diagnostics);
```

Bridge handler 只调用 `diagnostics.recordRenderer(request.payload)`；菜单只调用 `diagnostics.export(mainWindow)`。

## 数据契约

Renderer 继续通过共享、严格的 Zod schema 提交安全输入。Main 重新验证输入并添加可信宿主字段。无需为每个 code 建立独立 discriminated union；一个 `.strict()` object 加有限 enum 已足够阻止任意字段。

```ts
type HostDiagnosticInput = {
  code: HostDiagnosticCode;
  operation?: HostDiagnosticOperation;
  errorCode?: HostDiagnosticErrorCode;
  durationMs?: number;
  contentHashPrefix?: string;
};

type PersistedHostDiagnosticEvent = HostDiagnosticInput & {
  schemaVersion: 1;
  at: string;
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  source: "main" | "renderer" | "electron";
  reason?: HostDiagnosticReason;
  exitCode?: number;
};
```

`at`、版本、平台和 `source` 只能由 Main 添加。`contentHashPrefix` 仍限制为 8–16 位小写十六进制。所有 optional 字段有长度或数值上限。

任何层都不得记录原始 `Error.message`、stack、路径、文件名、file token、Bridge payload、曲谱字节、标题、艺术家、用户文本、Library Score ID、完整 hash、sidecar/resume payload、用户名、主机名或设备标识。

## 首版事件

首版只记录失败、进程异常和启动边界：

- `APP_STARTED`
- `APP_START_FAILED`
- `HOST_OPERATION_FAILED`
- `BRIDGE_MESSAGE_REJECTED`
- `PERSISTED_DATA_CORRUPT`
- `LIFECYCLE_ACK_TIMEOUT`
- `RENDERER_UNRESPONSIVE`
- `RENDERER_PROCESS_GONE`
- `CHILD_PROCESS_GONE`
- `DIAGNOSTIC_EXPORT_FAILED`

`operation` 使用有限 enum，覆盖被实际 instrument 的 Library、文件、sidecar/resume、Viewer、Studio 和 Diagnostic Export 失败。普通成功、慢操作、点击、浏览、播放位置、暂停次数和使用频率不记录。

`ViewerHost.reportDiagnostic(error, operation)` 接入 `recordRenderer`，只把 allowlisted operation 和稳定 error code 送入 Bridge；原始 error 在 Renderer 内丢弃。

## Instrumentation

`diagnostic-instrumentation.ts` 是 Electron/Node 边界适配层，不是可插拔日志框架。

App 级监听至少覆盖：

- `app.child-process-gone`；
- `process.uncaughtExceptionMonitor`；
- `process.unhandledRejection`。

Window 级监听至少覆盖：

- `did-fail-load`；
- `preload-error`；
- `unresponsive`；
- `render-process-gone`。

监听器只把已知事实映射为稳定 code、operation 和 Electron reason/exit code 的白名单表达，不保存原始异常。首版不负责 Renderer 自动恢复或应用重启。

## 存储与保留

Diagnostic Store 在 locale、SQLite、Library 和窗口初始化之前创建。日志目录通过 `app.setAppLogsPath()` 与 `app.getPath("logs")` 解析，不向 Renderer 暴露。

- 当前文件为 `desktop.log`，上一段为 `desktop.log.1`。
- 每个文件最多 1 MiB，总空间约 2 MiB。
- 写入前使用 `currentBytes + incomingBytes > maxBytes` 判断轮转。
- 保持现有 Promise chain 串行 `appendFile`，不增加 batching、优先级队列或 backpressure framework。
- 文件权限尽可能设置为 `0600`。
- 启动时删除修改时间超过 7 天的日志文件。
- 文件系统写入失败不得使应用主流程失败。

不压缩正在保存的日志，不维护 gzip segment、逻辑字节预算、重复事件聚合、内存 fallback 或 emergency writer。低事件量使这些机制没有当前收益。

## Diagnostic Export

`DiagnosticStore.snapshot()` 在现有 Promise chain 中排队，按 `desktop.log.1`、`desktop.log` 的顺序读取一致快照；后续写入等待 snapshot 完成，不需要额外 lock 或临时 segment。

Exporter 逐行解析并用持久化 Zod schema 重新验证，只保留有效事件；截断或无效行直接跳过，不修改来源日志。有效 JSONL 使用 Node 内置 `zlib` gzip，完成后通过原生 save Dialog 写到用户选择的位置。

导出文件不增加 manifest、summary、ZIP 容器或专用 schema；每行事件已经携带版本与运行环境。最大输入约 2 MiB，可以直接在内存中完成验证和 gzip。

开发者使用标准 gzip 与 JSONL 工具检查文件。首版不实现 `diagnostics:inspect` CLI、source map 流水线、stack fingerprint 或中心化日志服务。

## Crash 边界

首版只记录 Electron 提供的进程终止 reason 与 exit code，不启动 `crashReporter`，不收集 Crashpad minidump。只有真实故障证明稳定 code 和结构化事件不足时，才单独设计 minidump、source map 或额外堆栈信息。

## Testing strategy

每个非平凡模块保留一个相邻测试文件，重点覆盖：

- schema 拒绝未知字段和敏感字段；
- 并发写入顺序与 `current + incoming` 轮转；
- 7 天清理与文件系统失败不阻断应用；
- instrumentation 把 Electron/Node 事件映射为安全 code；
- snapshot 顺序、无效行跳过、gzip 导出与取消保存；
- Renderer `reportDiagnostic` 不发送原始 error。

实现后运行：

```bash
pnpm test -- packages/web-core/src/bridge/__tests__/schemas.test.ts
pnpm test -- apps/desktop-shell/src/main/__tests__/diagnostics.test.ts
pnpm test -- apps/desktop-shell/src/main/__tests__/diagnostic-store.test.ts
pnpm test -- apps/desktop-shell/src/main/__tests__/diagnostic-instrumentation.test.ts
pnpm test -- apps/desktop-shell/src/main/__tests__/diagnostic-exporter.test.ts
pnpm check:i18n
pnpm desktop:build
pnpm verify:fast
pnpm format:check
git diff --check
```

只有原生菜单导出无法由单元测试充分覆盖时才增加一条 Desktop E2E；不提前建设完整日志 E2E suite。

## Acceptance criteria

1. 用户可以主动导出一个离线 `.jsonl.gz` 文件，取消不改变状态。
2. Logger 在 SQLite 与窗口初始化前可用，能记录 Renderer、Bridge、持久化和 Electron 进程失败。
3. Renderer 只能提交严格安全输入；宿主时间、版本、平台和来源由 Main 添加。
4. 日志和导出不包含原始异常、路径、payload、用户内容或设备标识。
5. 两个日志文件各不超过约 1 MiB，并在启动时删除 7 天前内容。
6. 导出按旧到新顺序只包含重新验证通过的事件，截断尾部不会阻止导出。
7. 诊断写入、轮转、清理或导出失败不阻断应用主流程。
8. 首版不自动上传、不记录用户行为、不收集 minidump，也不实现 source map 或专用检查 CLI。

## 相关资料

- ADR 0022：Bridge 类型由运行时 schema 推导。
- ADR 0029：Internal Acceptance Build 不收集或上传遥测。
- ADR 0056：生产 UI 和持久化诊断不暴露原始错误。
- ADR 0062：Zod 是 iPad Bridge contract 的事实源。
- Historical Spec：`docs/specs/2026-07-10-electron-desktop-gp-slice-design.md`。
