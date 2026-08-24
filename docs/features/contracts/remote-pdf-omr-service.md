---
feature: remote-pdf-omr-service
title: Browser Remote PDF 识谱
status: current
delivery: partial
last_verified: 2026-08-24
hosts:
  - browser
implementation_paths:
  - apps/recognition-server/src
  - apps/web-demo/src/recognition
  - packages/web-core/src/recognition
  - packages/web-viewer/src/features/pdf-omr
  - packages/web-viewer/src/app/pages/PdfOmrHistoryPage.tsx
  - packages/web-viewer/src/app/pages/PdfOmrPage.tsx
supersedes: []
---

# Browser Remote PDF 识谱 Feature Contract

## 一句话契约

当同源 `/api/recognition/v1/capabilities` 返回通过共享 schema 校验的能力时，Browser 提供实例级共享识谱历史，
允许上传单个 PDF、PNG 或 JPEG，由 Server 的单 worker 排队调用既有 `pdf-omr-cli` pipeline，并在 30 天内恢复、
下载 validated MXL。它不进入 Sheet Library，也不提供账号隔离、远程 MIDI correction 或 engine 配置 UI。

## 用户入口

- Browser 仅在同源 capability 握手成功后显示 `PDF 识谱` 导航。
- `#/pdf-omr` 是共享历史，`#/pdf-omr/new` 是新建页，`#/pdf-omr/:jobId` 是可刷新的任务详情。

## 当前已实现行为

- Browser 最多等待 800 ms 探测同源能力。握手失败时不声明 `pdfOmrWorkbench` / `pdfOmrHistory`，导航不显示入口，
  直接访问 route 仍进入 not-found；Desktop 继续使用本地 transient workbench。
- `#/pdf-omr` 显示实例共享历史；`#/pdf-omr/new` 新建任务；`#/pdf-omr/:jobId` 从 Server 恢复详情。历史首次读取
  20 项并通过基于 immutable `createdAt + jobId` 的 opaque cursor 继续加载，按 `jobId` 去重；每项显示文件名、输入
  类型、最新状态、engine、Attempt 数、最近更新时间与到期日，并对删除做确认。
- Browser adapter 通过 native file picker 保存页面内 `File` reference，以单个 multipart request 上传；Server
  流式解析且在 boundary 验证 64 MiB 上限、扩展名与 PDF/PNG/JPEG magic bytes、engine capability 和 mutation
  `Origin`。Browser 不接触 bucket key、Server path 或 credentials。
- SQLite 持久化 Job、Attempt、snapshot、bounded result metadata、hash 和 object key；private S3-compatible store
  持有 immutable input、MXL 与 manifest。Server 使用 `node:sqlite`，不依赖 ORM、Redis 或消息队列。
- 全实例只有一个 worker。queued Attempt 按创建时间和 ID 稳定 FIFO；running task 使用 `AbortSignal` 取消。
  retry 在同一 Job 下创建新 Attempt并复用 input object；启动时 running/cancelling 变为 `interrupted`，queued 保留。
- Server 只有在 MXL 与 manifest 写入并回读 hash 成功后才发布 `succeeded`。上传中断、部分 result publish、
  `deleting` 和过期 Job 通过启动或每小时 reconciliation 收敛；任务 temp root 在启动时清理。
- SSE 每次连接先发送当前完整 snapshot，后续只发送受约束 snapshot facts；native `EventSource` 负责断线重连。
  Browser adapter 暴露 `connecting / connected / reconnecting`；重连时页面保留最后一份 snapshot，显示持久提示和
  手动刷新。合法 snapshot 恢复 connected。页面不显示 queue position、上传百分比、stdout、stderr、绝对路径或
  raw exception。
- multipart 上传显示不确定进度并允许通过 `AbortController` 中止 request；因为 Server 可能已完成持久化，UI 提醒
  用户在历史中确认任务是否创建，而不作“未创建”保证。Remote detail 展示所有 persisted Attempts 的序号、engine、
  状态、时间与 semantic error code，并在 attempt/status/stage 变化时重新同步。
- succeeded result 使用受约束 metadata 和 Server 回读校验后的 bytes；Browser 尝试用现有 transient score runtime
  预览，并通过 native download 保存 MXL。预览解析失败时不影响下载。

## 状态与边界

`queued`、`running`、`cancelling`、`cancelled`、`failed`、`interrupted`、`succeeded` 与 `deleting` 是持久状态；
`uploading` 仅是不可见的 Server transition。Job status 等于最新 Attempt status，只有 Job-level `deleting` 覆盖它。
`failed`、`cancelled` 与 `interrupted` 可 retry；queued/running 可取消；terminal Job 可从历史删除。

反向代理负责 TLS 与访问控制。当前服务是受信任自托管实例的单租户能力：所有获准访问者共享历史，Server 不提供
Zupulse account、用户级授权、CORS、公开 object URL、横向扩容或多 worker。

## 领域不变量

1. `web-core` recognition schema 是 Desktop Bridge 与 HTTP/SSE payload 的共享事实；transport envelope 保持独立。
2. React job UI 只依赖 `RecognitionJobPort`；Browser history 单独依赖 `RecognitionHistoryPort`；Desktop MIDI 能力
   只存在于 optional `PdfOmrMidiCorrectionPort`。
3. PDF/image/result MUST NOT create or mutate Library、managed score bytes、practice、resume 或 Harmony documents。
4. Input object queued 后不可变；retry 必须复用并重新校验它的 SHA-256。
5. Object persistence、result integrity 与 SQLite publish 完成前不得显示 `succeeded`。

## 进行中的目标差异

- 自动化已覆盖 SQLite restart/FIFO/retry/delete、running cancellation、S3 command/hash boundary、HTTP/SSE、Browser
  adapter 与 fake-Service Browser journey；尚未在 CI 中运行真实 MinIO/R2/AWS S3 conformance 或真实外部 OMR engine。
- reconciliation 清理有 SQLite 引用的 transition/expired objects；尚不扫描 bucket 中完全无引用的历史 object。

## 明确非目标

- Zupulse account、用户级历史隔离、CORS、公开 object URL、批量上传、多 worker、横向扩容与分布式队列。
- Browser engine 配置、远程 MIDI correction、自动加入 Library、永久归档或对象存储直传。

## 验收契约

- 给定 capability response 缺失或 schema 无效，Browser 不得显示或加载 Remote PDF OMR route。
- 给定合法 PDF/PNG/JPEG，Server 只有在 input object 持久化后才返回 queued Job；单 worker 必须按稳定 FIFO 执行。
- 给定 running cancellation 或 Server restart，Attempt 必须分别收敛为 `cancelled` 或 `interrupted`。
- 给定 result object/manifest publish 或 hash 回读失败，Job 不得进入 `succeeded`。
- 给定刷新 detail route，Browser 必须从 Server snapshot 恢复；任何 Remote flow 都不得写入 Sheet Library。
- 给定 SSE error，Browser 必须显示重连状态并允许手动刷新；给定合法 snapshot，重连提示必须消失。
- 给定历史 `nextCursor`，Browser 必须可继续加载且不得重复 `jobId`；给定 Remote detail，必须显示返回的 Attempts。
- 给定进行中上传，用户必须可中止 request，且不得显示伪造的上传百分比或承诺 Server 未创建 Job。

## 证据地图

| 契约                                       | 运行时代码 / Schema                                                                                 | 自动化证据                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Strict shared payload                      | `packages/web-core/src/recognition/schemas.ts`、`packages/web-core/src/bridge/schemas.ts`           | `recognition/__tests__/schemas.test.ts`、Bridge schema tests |
| SQLite lifecycle / FIFO / cursor / restart | `apps/recognition-server/src/job-store.ts`                                                          | `job-store.test.ts`、`maintenance.test.ts`                   |
| Object integrity and single worker         | `recognition-worker.ts`、`s3-object-store.ts`                                                       | `recognition-worker.test.ts`、`s3-object-store.test.ts`      |
| HTTP/SSE boundary                          | `http-server.ts`、`recognition-service.ts`                                                          | `http-server.test.ts`                                        |
| Browser capability / adapter / routes      | `apps/web-demo/src/main.ts`、`RemoteRecognitionClient.ts`、`packages/web-viewer/src/app/router.tsx` | adapter tests、App/Page tests、`recognition.spec.ts`         |
| Browser recovery / pagination / Attempts   | `RemoteRecognitionClient.ts`、`PdfOmrHistoryPage.tsx`、`PdfOmrPage.tsx`                             | Remote client、history page、job page tests                  |

## 维护触发器

- recognition schema、HTTP/SSE path、retention、queue semantics、object lifecycle 或 Browser capability gating 变化。
- Remote result 开始 preview、进入 Library、增加用户隔离、认证、多 worker 或不同 object provider contract。

## 相关资料

- 设计规格：[`2026-08-16-web-remote-pdf-omr.md`](../../specs/2026-08-16-web-remote-pdf-omr.md)
- P1 体验规格：[`2026-08-24-web-remote-pdf-omr-p1.md`](../../specs/2026-08-24-web-remote-pdf-omr-p1.md)
- Desktop 本地能力：[`desktop-pdf-omr-workbench.md`](desktop-pdf-omr-workbench.md)
- 当前架构入口：[`docs/architecture/README.md`](../../architecture/README.md)
