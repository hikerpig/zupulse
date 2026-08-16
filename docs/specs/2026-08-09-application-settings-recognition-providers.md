---
status: draft
last-reviewed: 2026-08-09
feature: application-settings-recognition-providers
---

# 应用设置与识谱 Provider 产品 Spec

## 定位与现状证据

本 Spec 定义 Browser 与 Desktop 共用的 Application Settings 表面，以及 Desktop Local Recognition
Engine 的设备级配置体验。它扩展
[`Desktop PDF OMR Workbench Feature Contract`](../features/contracts/desktop-pdf-omr-workbench.md) 的目标行为，
不代表功能已经实现，也不改变当前 PDF OMR 的实验能力与 Library 隔离边界。

- **仓库事实**：共享 React Router 当前没有 Settings route。Desktop Main 在应用启动时从环境变量构造
  Audiveris、LEGATO 与 Rokot registry，并执行一次 preflight；Browser 当前没有 PDF OMR
  route、runtime 或远程识别能力。
- **实际体验限制**：2026-08-09 无可用的 in-app Browser 实例，因此本轮尚未重新走查 Browser 页面；
  当前信息架构事实来自 runtime、Current Feature Contract 与 UI 测试，最终设计验证仍需补充真实 Browser journey。

## 用户问题与范围

- **目标用户与场景**：使用 Desktop PDF 识谱工作台的研究者或开发者需要配置本地 engine，但不希望在
  Terminal、启动脚本与环境变量之间切换；Browser 用户也需要稳定的设备设置入口。
- **目标结果**：用户在统一的 Settings 表面管理当前宿主真正支持的设备级设置；Desktop 用户可用类型化
  表单配置并重新预检 Local Recognition Engine，未来 Web Remote Recognition Service 可沿同一 provider
  契约接入，而不重做 Settings 信息架构。
- **Non-goals**：本次不实现 Browser PDF 识别、远程 endpoint、API Key、模型上传、多个同类 provider
  profile、动态插件系统、云同步、跨设备设置同步、engine 安装或模型下载。Settings 不执行安装脚本或
  package manager；缺失资源只提供安全说明与官方文档入口。安装管理、许可确认、下载校验、进度与磁盘空间
  管理需要独立设计。

## 已确认方案

1. Browser 与 Desktop 共享 Application Settings route 与导航入口，页面按宿主 capability 只呈现可操作分区。
2. 当前只有 Desktop 显示识谱 provider 配置；Browser 不显示不可操作的 engine 表单或未来能力占位。
3. 每种 provider 在当前设备只有一份类型化 Recognition Provider Configuration。产品 UI 与持久化 schema
   使用领域字段，不暴露 `PDF_OMR_*` 环境变量名称，也不预先支持 profile 列表。
4. 独立 `pdf-omr-cli` 继续支持环境变量；Desktop 产品以持久化设置为唯一显式配置来源，不自动导入环境变量。
5. 未保存配置时，Desktop 可继续自动发现 Audiveris；其他 Local Recognition Engine 保持未配置。
6. 保存配置后立即重新 preflight，不要求重启 App。active job 使用启动时的配置快照，新配置只影响后续 job。
7. provider 编辑使用原子化的“验证并保存”：Main 仅在整份配置通过 preflight 后替换已保存配置。失败时
   Renderer 保留当前编辑草稿与安全诊断，原有有效配置继续供后续任务使用；“清除配置”作为独立操作停用
   provider。
8. Settings 使用 Header 右侧的独立齿轮入口进入 `#/settings`，不占用中央工作表面导航。现有语言与主题
   快捷控件继续保留在 Header；只有未来空间约束实际出现时，才另行决定是否迁入 Settings。
9. Desktop 首版列出 Audiveris、Rokot 与 LEGATO 三种 Local Recognition Engine。列表首层
   只显示名称、输入类型、安全状态摘要和“配置”操作；provider-specific fields 按需展开，不提供通用环境变量
   或任意键值编辑器。配置通过只证明 runtime readiness，不表示识别质量达到产品门槛。
10. executable、repository、model、checkpoint 与 converter 等本地资源统一通过 Main 原生文件或目录选择器
    选择；Renderer 只接收资源类型、文件名或目录名等安全标签，不显示或接受绝对路径。已保存资源可重新选择，
    或请求 Main 在 Finder 中显示。Audiveris 支持自动发现与手动覆盖；Python 优先自动发现，失败后再引导手动
    选择。Main 在验证和每次使用前重新校验资源权限及 provider-specific hash/revision。
11. Browser 与 Desktop 的 Settings 都包含“通用”分区，并提供语言和主题设置；Header 中的高频快捷控件继续
    保留。两处读写同一份设备状态并即时同步，Header 是快捷方式，Settings 是完整设置表面。Desktop 额外显示
    “识谱引擎”分区。
12. 宽屏 Settings 使用左侧 category navigation 与右侧连续内容区；只有一个可见 category 时隐藏左侧导航。
    窄屏把 category navigation 放到内容上方，并保持单一 document scroll。category 由 host capability 决定是否
    出现，不显示未来能力占位；“识谱引擎”一次只展开一个 provider 的配置表单。
13. provider 状态只使用 `unconfigured`、`checking`、`ready` 与 `needs-attention`。Desktop 在 App 启动、进入
    “识谱引擎”、验证并保存、清除配置以及每次 start/retry 前执行 preflight；运行前失败会立即把 provider
    标记为 `needs-attention` 并在 workbench 禁用。产品不后台轮询或持续扫描本地资源。
14. active job 运行期间允许进入 Settings、保存或清除任意 provider；页面提示新配置只影响下一次识别，任何
    设置操作都不取消或改变当前任务。workbench 继续从 Main snapshot 恢复任务；下一次 start/retry 使用最新
    保存配置重新 preflight。
15. Settings 不提供全局 default provider。workbench 按输入类型在当前设备记住最近一次实际选择；下次优先恢复
    仍为 `ready` 且兼容当前输入的 provider。不可用时回退到第一个 ready compatible provider，并明确显示回退；
    该偏好不跨设备同步。
16. provider 表单使用显式 draft：只有“验证并保存”可提交，“取消”恢复已保存值并收起。dirty draft 在切换
    provider、category、route 或关闭窗口前请求确认放弃；preflight 失败后的值仍保留为 dirty draft。成功保存后
    清除 dirty 状态并显示最新 `ready` 摘要。
17. 只有存在显式保存配置时才显示“清除配置”，并在执行前就地确认；操作不影响 active job 且不提供 Undo。
    Rokot 与 LEGATO 清除后进入 `unconfigured`。Audiveris 清除手动覆盖后立即恢复自动发现，并根据
    结果进入 `ready` 或 `needs-attention`。

## 方案

### 用户流程

1. 用户从任意 route 的 Header 齿轮入口进入 `#/settings`。Settings 记录来源 route；页面“返回”与浏览器
   Back 都回到该 route，直接打开 deep link 时回到首页。
2. “通用”分区复用现有语言与主题控件。修改立即走现有持久化语义；Header 快捷入口同步更新。
3. Desktop 且 `pdfOmrWorkbench=true` 时显示“识谱引擎”。进入该分类触发一次全量 preflight；provider row
   在结果返回前分别显示 `checking`，互不阻塞。
4. 用户展开一个 provider，通过原生 picker 选择缺失或需要替换的资源。Main 返回 session-scoped opaque
   selection token 与安全 label；Renderer 不持有路径。
5. 用户点击“验证并保存”。Main 合成完整 candidate、执行 provider-specific schema validation 与 canonical
   preflight，并只在成功后以原子文件替换保存配置。成功后收起表单并更新 workbench capability state。
6. 验证失败时，表单就地显示 semantic reason 和资源级修复提示；candidate tokens 与 dirty draft 保留，已保存
   配置及其运行能力不变。用户可继续替换字段、取消，或离开时确认放弃。
7. 用户清除显式配置时先就地确认。Main 删除该 provider 的保存值并重新 preflight；Audiveris 回到自动发现，
   其他 provider 回到 `unconfigured`。

### UI / UX

Settings 使用安静的设备控制刻度，不采用 SaaS 卡片仪表盘。宽屏内容最大宽度与 960px 阅读框对齐；category
navigation 与内容区之间使用边界和留白，provider rows 组成连续列表。只有当前 primary action“验证并保存”使用
coral；配置、重新选择、取消、清除和打开文档使用次级或语义危险样式。

```text
┌ 设置 ────────────────────────────────────────────────────────────────┐
│ [返回]                                               Header 快捷控件 │
├───────────────┬─────────────────────────────────────────────────────┤
│ 通用          │ 识谱引擎                                            │
│ 识谱引擎      │ Audiveris   PDF / 图片    可用 5.x        [配置]   │
│               │ Rokot       PDF           需要处理       [修复]   │
│               │ LEGATO      PDF           未配置         [配置]   │
│               │                                                     │
│               │ ─ Rokot 配置 ───────────────────────────────────── │
│               │ llama CLI          llama-cli             [重新选择]│
│               │ model              rokot-model.gguf      [重新选择]│
│               │ vision projector   mmproj-model-f16.gguf [重新选择]│
│               │ ABC converter      Python 3.11           [重新选择]│
│               │ [取消]                              [验证并保存]  │
└───────────────┴─────────────────────────────────────────────────────┘
```

- provider row 用文字、图标与结构共同表达状态。`ready` 显示 inspected version；`needs-attention` 首层只显示
  本地化安全摘要，展开后按资源字段给出修复动作。raw path、hash、revision、stderr 与 exception 不进入 DOM；
  expected/actual version 或 build 只有已加入 safe context allowlist 时才显示。
- `checking` 不显示百分比或 ETA；验证超过普通交互时长后保持同一状态，并提供“取消检查”。取消只中止 candidate
  preflight，不改变已保存配置。
- 原生 picker 取消后保持原 draft。Finder 打开失败以就地 error 呈现，不清除配置。
- dirty form 切换 provider/category/route 时使用受控 confirm dialog；焦点默认落在“继续编辑”，确认放弃后恢复到
  原触发控件。保存失败后焦点移到 error summary；成功后回到对应 provider row。
- `>= 760px` 显示 category rail；`< 760px` 把 category navigation 置于标题下方并使用单列 document scroll。
  Browser 只有“通用”时不渲染 category navigation。页面不得产生横向滚动或嵌套主滚动区。
- Light/Dark 使用现有 semantic tokens；状态不得只靠颜色。除短促展开与状态过渡外不增加动画，
  `prefers-reduced-motion` 下直接呈现最终布局。

### Provider 字段

| Provider    | Required user selections                                                       | Automatic / locked facts                                                 |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `audiveris` | manual mode only: executable                                                   | default mode auto-discovers the executable; supports PDF and image       |
| `rokot`     | llama CLI, model file, vision projector file, Python executable                | converter runner, model/hash/build constraints remain application-locked |
| `legato`    | Python 3.11 executable, repository directory, model file, base model directory | runner, repository revision and model hash remain application-locked     |

自动发现失败时，Python、Git 或 `pdftoppm` 的对应 safe diagnostic 可以提供手动 override picker；成功自动发现时
不显示这些低频字段。timeout、prompt、beam count、hash、revision、environment map 与任意 runner path 不属于产品
设置，继续由受版本控制的 adapter contract 持有。

### 状态

| State             | Visible behavior                          | Available actions                      | Recovery / exit                                      |
| ----------------- | ----------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `unconfigured`    | Rokot 或 LEGATO 没有显式配置              | 配置、查看官方文档                     | 验证并保存                                           |
| `checking`        | 显示正在检查，无百分比与 ETA              | 取消 candidate 检查                    | 保留已保存配置与原状态                               |
| `ready`           | 显示版本、输入类型和可运行说明            | 配置、在 Finder 中显示、清除显式配置   | 每次 start/retry 再次检查                            |
| `needs-attention` | 显示安全原因；workbench 禁用该 provider   | 修复配置、重新检查、查看文档、清除配置 | 成功 preflight 后进入 `ready`                        |
| dirty draft       | 展开表单标明尚未保存                      | 验证并保存、取消                       | 离开前确认放弃                                       |
| failed draft      | 保留字段并显示资源级 semantic diagnostics | 修改字段、再次验证、取消               | 已保存配置继续生效                                   |
| active job        | 显示“新配置将在下一次识别时生效”          | 正常编辑、保存或清除                   | 当前 job 始终使用其 immutable configuration snapshot |

## Target Contract

Application Settings 是共享 UI composition，不是通用持久化数据库。语言继续由各 host 的 `LocaleHost` 持有，
主题继续是 Browser/Renderer device preference；Local Recognition Engine configuration 由 Desktop Main 的独立、
版本化 document 持有。未来 Remote Recognition Service 必须增加显式 capability、provider schema、host port 与
安全评审，不能把 endpoint 或 secret 塞入任意 key-value map。

```ts
type RecognitionProviderId = "audiveris" | "rokot" | "legato";

type RecognitionProviderStatus =
  | { state: "unconfigured" }
  | { state: "checking"; previousState: "unconfigured" | "ready" | "needs-attention" }
  | { state: "ready"; version: string; inputKinds: readonly ("pdf" | "image")[] }
  | { state: "needs-attention"; reason: RecognitionProviderIssueCode };

type LocalResourceSelection = {
  selectionToken: string;
  label: string;
  kind: "executable" | "file" | "directory";
};
```

Bridge requests MUST use a closed union for `providerId` and provider-specific field names. A candidate value is either an
existing saved field reference or a session-scoped `selectionToken`; it is never a Renderer-provided path. Main MUST
revalidate selection tokens, persisted documents and filesystem facts before preflight and before every job. Candidate tokens
remain reusable after failed validation but expire when the draft is discarded or the App exits; successful persistence consumes
them.

`RecognitionProviderIssueCode` is a closed semantic union covering at least missing configuration, unreadable resource,
executable/version mismatch, repository revision mismatch, model/checkpoint hash mismatch, converter unavailable, inspection
failure and persistence failure. Each code defines bounded safe context and a localized recovery action; generic strings are not
accepted across Bridge.

## 产品与工程约束

- `web-viewer` owns the shared Settings route and capability-gated presentation.
- Desktop Main owns Local Recognition Engine configuration, persistence, preflight and runtime snapshots.
- The provider configuration document MUST be versioned, Zod-validated, written by atomic replacement and readable only by the
  current user. Corrupt data MUST be quarantined per provider and reported as `needs-attention`; App startup MUST continue.
- Desktop product configuration MUST NOT read or import `PDF_OMR_*` variables. The standalone CLI MAY retain them as its own
  explicit automation interface.
- Settings capability composition MUST be explicit and typed; it MUST NOT introduce a generic settings registry, arbitrary
  key-value persistence or runtime-loaded provider plugins.
- Renderer MUST NOT receive absolute paths, raw environment variables, secrets, exceptions or stderr.
- Persisted and cross-process configuration inputs MUST be validated with provider-specific Zod schemas.
- A Settings change MUST NOT mutate Library, Managed Score Copies, Practice Sidecars, resume data or Harmony
  Analysis Documents.
- System copy belongs to `@zupulse/app-i18n`; engine and host layers return semantic status codes and safe context.
- Future Remote Recognition Service credentials MUST NOT reuse the local path document; secret storage, PDF upload consent,
  retention, deletion, transport and server-side processing require a separate approved Spec and security contract.

## Feasibility Gate

### Gate A — 无重启 registry replacement

- **Question**: Main 能否在保留 active job immutable snapshot 的同时，用成功保存的配置原子替换后续 job registry？
- **Fixtures / platforms**: macOS arm64；四种 fake adapter；running、success、failure、cancel 与 save/clear 并发。
- **Pass evidence**: active job 的 adapter identity 与输出不变；下一 job 使用新配置；不存在混合字段或半提交状态。
- **Fallback**: 若 registry 无法安全替换，则保存成功后明确要求重启 Desktop；不得静默使用旧配置。

### Gate B — Path-free resource configuration

- **Question**: Main-owned picker、opaque candidate token、失败重试与持久化恢复能否完全避免 Renderer path exposure？
- **Fixtures / platforms**: executable、file、directory，picker cancel，token expiry，资源移动与 corrupt persisted document。
- **Pass evidence**: Bridge/DOM/log snapshot 不含绝对路径；失败 draft 可修正；成功保存后重启能显示安全 label 并通过 preflight。
- **Fallback**: 若无法满足 path-free contract，则保持现有环境配置，停止 Settings engine configuration；不得增加路径文本框。

## Acceptance Criteria

- Browser and Desktop MUST expose `#/settings` from a Header settings action without removing the existing locale and theme shortcuts.
- Browser Settings MUST render General settings and MUST NOT render Local Recognition Engine rows or future remote placeholders.
- Desktop MUST render Recognition settings only when `pdfOmrWorkbench=true`, and MUST list Audiveris, Rokot and LEGATO.
- Header shortcuts and General settings MUST read and update the same locale and theme state.
- Each provider MUST expose exactly one typed configuration; the product MUST NOT expose environment-variable names, arbitrary
  key-value fields, multiple profiles or runtime provider plugins.
- Renderer MUST NOT receive or render absolute paths, raw environment values, secrets, exceptions, stderr, full hashes or raw revisions.
- A provider candidate MUST replace persisted configuration only after provider-specific schema validation and canonical preflight succeed.
- Failed or cancelled candidate validation MUST retain the editable draft and MUST NOT replace or disable a previously ready configuration.
- Clearing configuration MUST require confirmation, MUST NOT affect an active job and MUST apply provider-specific fallback semantics.
- Active jobs MUST use immutable configuration snapshots; saved changes MUST apply only to later start/retry operations.
- Provider status MUST be refreshed at the agreed explicit lifecycle points and MUST NOT depend on background filesystem polling.
- Workbench MUST disable `needs-attention` providers, revalidate before start/retry and use the latest saved compatible provider.
- Workbench MUST remember the last selected provider per input kind locally and MUST visibly report fallback when it cannot restore it.
- Settings MUST preserve keyboard order, focus recovery, Light/Dark parity, reduced-motion behavior and one primary scroll host at narrow widths.
- Recognition configuration MUST NOT install software, download models, mutate Library facts or imply recognition quality readiness.
- `pnpm check:i18n`, targeted schema/Main/React tests, Desktop E2E, Browser E2E and relevant build gates MUST cover the final implementation.
