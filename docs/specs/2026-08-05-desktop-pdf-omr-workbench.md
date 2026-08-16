---
status: approved
last-reviewed: 2026-08-05
approved: 2026-08-05
feature: desktop-pdf-omr-workbench
---

# Desktop PDF 识谱实验工作台产品 Spec

## 定位与现状证据

本 Spec 定义一个仅在 Electron Desktop 中可见的本地实验页面，用于选择 PDF、观察现有
`pdf-omr-cli` 的分阶段处理、检查诊断并导出经过回读验证的 MXL。它描述目标行为，不代表 PDF 已成为
产品导入格式，也不证明识谱质量已达到产品门槛。

当前没有 PDF OMR Feature Contract。最接近的当前契约是
[`Sheet Library Feature Contract`](../features/contracts/sheet-library.md)：Library 只接受 GP、MusicXML 与
MXL，PDF 不得进入现有 import pipeline。当前架构与
[`PDF OMR 冻结评测结论`](../evaluation/pdf-omr.md) 仍是事实源；后者的 `STOP` 结论没有因本 Spec 改变。

- **实际体验**：2026-08-05 在 Browser Demo `http://127.0.0.1:5173/#/library` 走查了空曲库，视口为
  `1280 × 900` 与 `390 × 844`。主导航只有“首页 / 曲谱库”；空态与顶部共用“导入曲谱”意图；导入
  Dialog 只声明 Guitar Pro、MusicXML、MXL 和 bundled sample，没有 PDF 入口。宽、窄视口共用同一
  页面层级，窄视口隐藏次要文字但保留主要操作。
- **仓库事实**：共享 React Shell 由 capability 控制 Studio 等宿主差异；Desktop Renderer 只能经
  版本化 Bridge 请求 Main 的文件与进程能力，且不得获得绝对路径。CLI 已有 `inspect`、`recognize`、
  `validate`、`export-musicxml`、取消信号、canonical artifacts 和 semantic error codes，但
  `recognize` 目前在 engine 完成后才集中写入 artifacts，没有可供 UI 订阅的结构化阶段进度。
- **证据限制**：in-app Browser 只能验证共享 Browser UI，不能直接运行 Electron Main 或外部 OMR
  engine；Desktop Bridge、进程取消、打包后 runtime 与 MXL 临时预览需由 Feasibility Gate 证明。

## 用户问题与范围

- **目标用户与场景**：Zupulse 的 OMR 研究者或开发者在本机调整 engine、检查识谱失败与提取结果时，
  不希望在 Terminal、多个 JSON 文件和外部乐谱查看器之间来回切换。
- **目标结果**：用户能在一个 Desktop 页面中明确看到“PDF 检查 → engine 识谱 → Draft 校验 → MXL
  生成与回读”的真实状态，定位阻塞诊断，预览可用结果，并把验证通过的 MXL 导出到自己选择的位置。
- **Non-goals**：Browser backend、iPad、云端上传、批量任务、benchmark、任务历史、模型下载或环境
  配置 UI、人工改谱、自动修复、自动加入 Library、把 PDF 注册为 `ScoreFormat`、修改 Managed Score
  Copy、分发或授权任何第三方 engine / model。
- **Assumptions**：首版是本地实验工具；用户已在 Desktop 启动环境中配置至少一个 CLI engine。页面
  可以列出全部已知 engine，但只允许选择通过 host preflight 的 engine；选择只在当前 App Session
  保留。

## 方案

### 信息架构与用户流程

1. Desktop 主导航在“曲谱库”之后显示“PDF 识谱”，进入 `#/pdf-omr`。Browser Demo 不渲染该入口，
   直接访问该 route 也不得加载 OMR UI。
2. 空态的唯一主操作是“选择 PDF”。原生 picker 只接受单份 PDF；Main 完成读取、hash、页数和基础
   可读性检查后，Renderer 只收到文件名、大小、页数和安全摘要，不收到绝对路径。
3. 页面选择第一个可用 engine；用户可以在“开始提取”前切换。不可用 engine 显示简短原因并禁用，
   不提供路径输入、环境变量编辑或自动下载。
4. 用户点击“开始提取”，Main 创建一个 job，依次执行 `inspect`、`recognize`、`validate` 和
   `export-musicxml` round-trip。页面用离散阶段和真实 artifact 表达进度，不编造百分比或 ETA。
5. 处理中可以查看原 PDF，以及 engine 已经提交的中间证据。只有 engine 发出结构化
   `completed / total` 时才显示“第 n / m 页”或“第 n / m 个谱表系统”；不解析 stdout / stderr 猜进度。
6. 校验成功后自动切换到“提取乐谱”，使用临时 MXL bytes 做只读谱面预览，并显示 engine/version、
   readiness 与 blocking / warning / info 数量。唯一主操作变为“导出 MXL”。
7. 用户取消原生保存 Dialog 时保持结果不变；成功保存后显示稳定的已导出状态。用户可通过次要操作
   “显示运行证据”让 Main 在 Finder 中定位 session run directory，Renderer 仍不接收路径。
8. 失败、阻塞或取消后保留已提交的阶段与诊断。用户可以对同一 PDF / engine 重试，或选择新 PDF。
   若当前成功结果尚未导出，替换输入前必须确认放弃；离开 route 不丢失当前 job。

### UI / UX

Desktop 宽屏采用三仓连续工作区，而非卡片仪表盘：左侧是输入与阶段，中央是唯一主要滚动宿主，右侧
是结果摘要与操作。乐谱或 PDF 证据面始终占最大面积。

```text
┌ PDF 识谱 ───────────────────────────────────────────────────────────────┐
│ 输入: sonata.pdf      Engine: Rokot                         [开始提取] │
├──────────────┬───────────────────────────────────────┬─────────────────┤
│ 处理阶段     │ [原 PDF] [中间证据] [提取乐谱]       │ 结果            │
│ 1 PDF 检查 ✓ │                                       │ MusicXML ready  │
│ 2 识谱     ● │        当前证据 / 乐谱阅读面          │ 2 warnings      │
│ 3 结构校验   │        唯一主要滚动宿主               │                 │
│ 4 生成 MXL   │                                       │ [导出 MXL]      │
│              │                                       │ 显示运行证据    │
└──────────────┴───────────────────────────────────────┴─────────────────┘
```

- 三个证据 tab 只在有对应事实时可用：“原 PDF”在 inspect 后可用；“中间证据”只列出已提交的 engine
  artifacts；“提取乐谱”只在 round-trip 通过后可用。未知二进制 artifact 只显示名称、类型、大小与
  hash，不在 DOM 中原样展开。
- 诊断默认按 `blocking → warning → info` 汇总；展开项显示 semantic code、用户可读说明与可选的
  page / system anchor。原始 exception、stack、绝对路径和未经处理的 stderr 不进入 Renderer。
- 任一状态同时只有一个珊瑚色实心主操作：空态“选择 PDF”、ready“开始提取”、成功“导出 MXL”。
  “取消处理”、切换 engine、重试、显示证据使用次级或语义化危险样式。
- 处理中不使用装饰性循环动画。当前 stage 使用文字、图标和结构共同表达；
  `prefers-reduced-motion` 下取消 progress transition，不影响状态更新。
- 键盘顺序遵循输入 → engine → primary action → stages → evidence tabs → diagnostics → result actions。
  Tab 使用标准 tabs keyboard behavior；取消后焦点回到“重试”，导出 Dialog 关闭后焦点回到“导出
  MXL”。
- `Light` / `Dark` 共享相同层级。PDF 与谱面使用安静的阅读 surface；coral 不用于阶段完成状态，
  blocking / warning 不能只靠颜色区分。
- `>= 900px` 使用三仓布局；`620–899px` 折叠右侧摘要到中央顶部；`< 620px` 改为单列 document
  scroll，顺序为输入、阶段、证据、结果。窄视口不产生横向滚动，不保留可拖拽分栏，也不创建嵌套
  scroll host。

### 状态

| State                | Visible behavior                                       | Available actions             | Recovery / exit                     |
| -------------------- | ------------------------------------------------------ | ----------------------------- | ----------------------------------- |
| `empty`              | 页面说明这是本地实验工具，不宣称 PDF 已受支持          | 选择 PDF                      | 返回首页或曲库                      |
| `inspecting`         | 文件名、PDF 检查阶段、无虚假百分比                     | 取消检查                      | 回到 `empty`                        |
| `ready`              | 页数、大小、可用 engine 与限制                         | 切换 engine、开始提取、换 PDF | 重新选择不会写 Library              |
| `checking-engine`    | engine preflight 正在进行                              | 取消                          | 不可用时进入 `engine-unavailable`   |
| `engine-unavailable` | 没有通过 preflight 的 engine，不暴露本机路径           | 换 engine、重新检查、换 PDF   | 保留已检查的 PDF                    |
| `running`            | 当前 stage、已提交 artifacts、可选真实 n / m           | 查看证据、取消                | route reopen 重新订阅同一 job       |
| `cancelling`         | 保留当前证据，取消按钮 disabled                        | 无新的 start                  | process tree 退出后进入 `cancelled` |
| `cancelled`          | 标明没有成功结果，不伪造完整 manifest                  | 重试、换 engine、换 PDF       | 已提交证据仍可查看                  |
| `blocked`            | 显示 readiness 与 blocking diagnostics，不启用谱面导出 | 查看证据、重试、换 engine     | 可显示 session run directory        |
| `failed`             | 显示 semantic error 与失败 stage                       | 重试、换 engine / PDF         | 可恢复错误不清空已有证据            |
| `succeeded`          | 默认显示提取谱面与结果摘要                             | 导出 MXL、显示证据、重新开始  | 未导出时替换输入需确认              |
| `exporting`          | 原生保存 Dialog 打开，结果保持只读                     | 取消保存                      | 取消回到 `succeeded`                |
| `exported`           | 显示目标文件名与成功状态，不显示路径                   | 再次导出、重新开始            | route reopen 保留到 App 退出        |

## 产品与工程约束

- `tools/pdf-omr-cli` owns recognition, normalization, validation, canonical artifacts and semantic error
  codes. The Desktop feature MUST NOT reimplement music inference in React or Main.
- Electron Main owns PDF selection, absolute paths, engine processes, cancellation, session run directories and
  export dialogs. Renderer receives only Zod-validated snapshots and bounded artifact/preview bytes.
- `web-viewer` owns the capability-gated route, presentation state and transient score preview. The feature MUST
  access host behavior through a narrow `PdfOmrWorkbenchPort`; Browser injects no port and no capability.
- The Bridge MUST add request, response, event and capability schemas together. `OmrScoreDraft` remains an
  experimental CLI type and MUST NOT become a public Library or Viewer domain model merely to render this page.
- A job snapshot MUST expose a discrete stage, terminal status, engine identity, safe input metadata, readiness,
  diagnostic counts and only structured progress supplied by the engine. UI MUST NOT parse logs to infer state.
- Main owns at most one active job in v1. Leaving or refreshing the route MUST NOT cancel it; reopening the route
  MUST reattach to the current snapshot. App shutdown MUST abort the process tree before lifecycle acknowledgement.
- Run artifacts are session-scoped local evidence, not Library facts or durable job history. A new job or clean App
  shutdown MAY delete the prior temporary run after applying the unsaved-result confirmation rule.
- The extraction pipeline MUST NOT invoke workspace `pnpm` as a packaged-product contract. It must call a bundled
  programmatic CLI surface or a separately verified executable while preserving the same schemas and artifacts.
- Only a generated MXL that passes parse, view, playback and structural round-trip gates may enter transient score
  preview or the native export flow. `ready-with-warnings` remains visibly distinct from `ready`.
- System copy belongs to `@zupulse/app-i18n`; CLI and `web-core` expose semantic codes plus safe context only.
- No engine executable, model, repository, access token or license is bundled or downloaded by this feature. Engine
  distribution requires a separate legal and product decision.

## Feasibility Gate

### Gate A — Desktop runtime boundary

- **Question**: Can Electron Main run the existing pipeline in dev and packaged Desktop without workspace `pnpm`,
  while preserving cancellation and canonical artifacts?
- **Fixtures / platforms**: macOS arm64 dev build and unsigned packaged app; one tiny valid PDF, one malformed PDF,
  one long-running fake engine and one configured real engine.
- **Pass evidence**: structured job snapshots; process-tree termination; no absolute path in Renderer payloads;
  succeeded artifact hashes match the CLI; packaged run completes without repository source files.
- **Fallback**: if only the checkout CLI works, keep `pdfOmrWorkbench=false` in packaged builds and expose the page
  only in Desktop development builds. Do not shell out to `pnpm` silently.

### Gate B — Observable progress contract

- **Question**: Can CLI stages and supported engine page/system progress be emitted as typed events without parsing
  stdout / stderr and without changing canonical outputs?
- **Fixtures / platforms**: fake engine covering every stage and cancellation; Rokot multi-system fixture;
  Audiveris or another engine without granular progress.
- **Pass evidence**: ordered stage events, monotonic optional `completed / total`, cancellation terminal event and
  byte-identical canonical artifacts with progress enabled/disabled.
- **Fallback**: ship only coarse stage observation. Hide granular counters and current-system evidence for engines
  that cannot emit structured progress; never synthesize percentage or ETA.

### Gate C — Transient score preview

- **Question**: Can validated generated MXL be rendered and torn down through the existing score runtime without
  creating a Library Score, Practice Sidecar, resume state or Harmony Analysis Document?
- **Fixtures / platforms**: ready MXL, `ready-with-warnings` MXL, blocked Draft and corrupted MXL.
- **Pass evidence**: ready outputs render read-only; blocked/corrupt outputs never mount; route changes release the
  runtime; Library counts and managed bytes remain unchanged.
- **Fallback**: omit in-app extracted-score preview and retain validated MXL export plus diagnostics. Do not insert a
  temporary or hidden Library Score.

## Acceptance Criteria

- Desktop with `pdfOmrWorkbench=true` MUST expose `#/pdf-omr` from primary navigation.
- Browser Demo and iPad MUST NOT render a PDF OMR entry, load the OMR route UI, or receive engine code or model
  assets.
- The page MUST identify itself as an experimental local tool and MUST NOT claim that PDF is a supported Library
  import format.
- Selecting a PDF MUST NOT expose its absolute path to Renderer or modify Library, Managed Score Copies, practice,
  resume, or Harmony Analysis data.
- Starting extraction MUST execute inspect, recognition, validation and MXL round-trip as distinguishable stages.
- Progress UI MUST show only typed stage facts and engine-supplied structured counters; it MUST NOT infer progress
  from logs or invent percentage and ETA.
- Cancel MUST terminate the owned process tree, produce a `cancelled` terminal UI state and MUST NOT publish a
  succeeded manifest or exportable score.
- Refreshing or leaving the route MUST allow the UI to reattach to the current in-session job; App shutdown MUST
  cancel an active job before acknowledging lifecycle completion.
- Blocking validation or round-trip failure MUST keep diagnostics and evidence inspectable while disabling score
  preview and MXL export.
- Only MXL that passes parse, view, playback and structural round-trip MUST be previewable and exportable.
- Export cancellation MUST preserve the completed result; export success MUST not reveal the destination path in
  Renderer state.
- Replacing an unexported successful result MUST require explicit confirmation; replacing failed or cancelled work
  MUST NOT require destructive confirmation.
- User-visible errors MUST use `@zupulse/app-i18n` copy backed by semantic codes and MUST NOT expose raw exceptions,
  absolute paths, stack traces or unfiltered stderr.
- Wide, `620px` and `390px` layouts MUST keep one primary scroll host, preserve the primary action and introduce no
  horizontal overflow.
- Keyboard-only operation MUST cover file selection, engine choice, start, cancel, evidence tabs, diagnostic
  expansion, retry and export with visible focus and correct focus restoration.
- Light, Dark and `prefers-reduced-motion` MUST preserve identical information hierarchy and non-color status
  communication.

## 待确认决策

当前冻结评测结论仍要求停止把现有 Audiveris 结果描述为产品能力；Transcoda 已从当前实现移除。本 Spec 默认把页面定位为
开发者实验工具，并允许 packaged build 在 Gate A 失败时隐藏 capability。若目标改为面向普通用户、默认
随 Desktop 分发 engine/model，必须先单独批准质量 protocol、许可证、安装体积、硬件要求和支持范围；
这不是本 Spec 的隐含授权。
