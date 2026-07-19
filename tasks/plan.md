# Implementation Plan: Studio 工作区调优

## 状态与依据

- 阶段：执行审计中。2026-07-19 已完成基础、runtime、预览、偏好与门禁；其余交互验收见下方未勾选项。
- 规格：`docs/superpowers/specs/2026-07-19-studio-workspace-tuning-design.md`。
- Phase 3 任务清单见 `tasks/todo.md`；任务清单获确认前不进入实现。
- `planning-and-task-breakdown` 引用的 `references/definition-of-done.md` 在本地技能包中缺失；本计划以技能正文、根 `AGENTS.md` 验证阶梯和规格中的工程执行契约作为 Definition of Done。

## Overview

把现有上下堆叠、Revision-index 驱动的 Studio 改成全视口可调双栏工作台。先建立与 Viewer 播放隔离的 Studio alphaTab runtime 和 Effective Harmony Range 视图模型，再按垂直切片接通谱面选择、有效和弦预览与真实试听，最后完成高密度布局、筛选、键盘和跨宿主验证。

## Architecture Decisions

- 新增独立 `StudioScoreRuntime`，由共享 web-viewer factory 创建；它拥有 alphaTab API 生命周期，但不创建 `PlaybackController`，不接触 Practice Sidecar 或 Local Playback Resume。
- `ViewerSessionHandle` 保持 Viewer 语义；Studio runtime 使用单独契约，避免用一组大量 optional 方法混合两类会话。
- alphaTab 原始对象只留在 adapter 内。应用层只接收 `ScoreWrittenMoment`、`ScoreWrittenRange`、transport snapshot 和结构化错误。
- ViewerApplication 缓存可重建的 Studio source context，并把 source harmony、active Revision 和 Corrections 合成为 Effective Harmony Range view model；不扩展持久化 Document。
- Harmony Selection 保存焦点书面时刻与当前范围，不保存数组索引；投影更新时用纯函数恢复。
- alphaTab 和弦预览通过临时运行时模型投影实现，清除目标 staff 的旧预览绑定后应用完整 Effective Harmony Projection，再局部重渲染；Managed Score Copy 保持不可变。
- 分栏与预览开关使用带版本/范围校验的本地 UI preference helper；存储不可用时使用规格默认值。
- UI 继续使用现有语义 token 和 CSS Modules，不新增状态库或组件依赖。

## Dependency Graph

```text
Effective range view model (T1) ───────────────┐
                                               ├─ Selection vertical slice (T4)
Studio alphaTab capability/runtime (T2) ──────┤
                │                              ├─ Harmony preview slice (T5)
                └─ Host/session wiring (T3) ───┤
                                               └─ Preview transport slice (T6)

UI preferences + split shell (T7) ────────────┐
T1 + T4 ─ Effective range list/editor (T8) ───┼─ Responsive polish (T9)
T5 + T6 + T8 + T9 ────────────────────────────┴─ Cross-host verification (T10)
```

T1 与 T2 可独立开展。T7 可在 T3 完成后与 T5/T6 并行，但 T4–T6 都依赖 T2/T3 的 runtime 契约；T8 依赖 T1/T4；T9/T10 必须在核心切片稳定后进行。

## Work Packages

### Phase 1: Fail-fast foundations

- [x] **T1 — Effective Harmony Range 视图模型**
  - 建立 projection item、来源/置信度展示、音乐位置格式、筛选和基于焦点时刻的选择恢复纯函数。
  - 用 correction 覆盖、拆分/合并、unresolved、空白与重新分析边界测试证明列表事实不依赖 Revision index。
  - 预计 3–4 个文件；不修改持久化 schema。

- [x] **T2 — 验证并封装 Studio alphaTab 公共能力**
  - 以测试先行封装 Beat→Score Written Moment、range→Beat、高亮/滚动、临时 chord 绑定替换和局部线性 playback range。
  - 用真实 MusicXML fixture 验证来源和弦替换、同小节多和弦、N.C./unresolved 清理，以及公开 API 1.8.4 能力。
  - 这是最高风险任务；若拍内边界或无重复替换无法满足规格，在继续 UI 前回到人工计划评审。
  - 预计 4–5 个文件。

### Checkpoint A: Runtime feasibility

- [x] T1/T2 最小测试通过。
- [x] 真实 fixture 可以双向定位并无重复地显示有效和弦。
- [x] 未引入 alphaTab DOM 查询、私有 API 或 Managed Score Copy 改写。
- [x] 运行 `pnpm verify:fast`。

### Phase 2: Isolated vertical slices

- [x] **T3 — 独立 StudioScoreRuntime 会话路径**
  - 创建与 Viewer session 分离的 factory/contract，接入 ViewerApplication，并分别由 Browser 与 Desktop 提供同一个共享实现。
  - 打开/关闭 Studio 只创建和销毁 Studio runtime；测试证明不会调用 playback persistence 或 Viewer Playback Controller。
  - 分两次小提交接入共享层与宿主层，每个实现任务不超过 5 个文件。

- [ ] **T4 — 谱面与 Effective Harmony Range 双向选择切片**
  - 把 application source context、effective projection、Harmony Selection 与 Studio 页面接通。
  - 完成点击 Beat 选列表、点击列表高亮/按需滚动谱面、空白点击和投影更新后的焦点恢复。
  - 覆盖半开边界、筛选隐藏项、用户滚动期间不抢滚动和 reduced-motion。

- [x] **T5 — 完整有效和弦预览切片**
  - 默认应用完整 Effective Harmony Projection；提交 Correction 或 reanalysis 成功后刷新并保持选择/视口。
  - 增加设备级预览开关、来源和弦保留语义、就地错误/重试和不阻塞编辑的降级。
  - 测试 Correction 覆盖来源时只呈现一个有效结果，unresolved 不生成虚假和弦。

### Checkpoint B: Core Studio loop

- [ ] 在 Browser 中手工完成“点击谱面→选中区间→应用候选→谱面预览更新”。
- [x] Studio 关闭重开后 Document 保留、Harmony Selection 不持久化、预览偏好恢复。
- [x] 运行 Studio/web-core 相关测试与 `pnpm verify:fast`。

- [x] **T6 — 真实 Preview Transport 切片**
  - 用 Studio runtime 驱动播放/暂停、seek、speed 和当前有效区间循环。
  - 区间循环采用局部书面时间，不执行 repeat jump；播放头不改变 Harmony Selection。
  - 覆盖 soundfont loading/error、audio unavailable、销毁清理，并证明 Viewer practice/resume 不受影响。

### Phase 3: Workspace UI

- [x] **T7 — 全视口可访问分栏与设备偏好**
  - 实现默认 60/40、边界约束、指针拖动、键盘调整、双击复位、localStorage 恢复和窄屏堆叠。
  - 建立左右独立滚动容器，移除 Studio 的 `1440px` 限制；不改变 Viewer 的 ScoreViewer 布局。
  - 覆盖 storage failure、ARIA separator 与 reduced-motion。

- [ ] **T8 — 有效区间 master-detail 列表**
  - 以 Effective Harmony Range 取代“分析片段”列表，展示音乐位置、来源、置信度等级和底层分析详情。
  - 完成“全部/待确认/已修正”筛选、临时显示隐藏选择，以及 Arrow/Home/End/Page/Enter/Escape 键盘与焦点返回。
  - 编辑命令始终使用选中 range，不重新引入 index 身份。

- [ ] **T9 — 右栏空间重组与响应式状态补全**
  - 收紧命令栏，设置默认折叠，Preview Transport 单行化，导出栏固定到底部。
  - 覆盖 loading、empty、analyzing、unsaved、saving、conflict、preview error、audio unavailable、无选择，以及 Light/Dark/桌面/窄屏。
  - 对照 `DESIGN.md` 的 Studio 9/10 密度、Anti-Slop 与双主题同构自审。

### Checkpoint C: Complete workspace

- [ ] 桌面长列表可以访问到底；两栏与列表/编辑器滚动互不锁死。
- [ ] 全键盘路径、焦点恢复、错误降级和窄屏堆叠通过用户视角测试。
- [x] 运行 `pnpm verify`。

### Phase 4: Cross-host acceptance

- [ ] **T10 — Browser/Desktop E2E、回归与活规格收尾**
  - 为两个宿主覆盖 Studio 打开、分栏、双向选择、Correction 预览、真实试听与预览错误恢复的关键路径。
  - 运行完整门禁，修正实现中发现的规格偏差，并把最终文件/命令同步到活规格和架构文档。
  - 不用扩大 timeout、删除断言或跳过测试掩盖失败。

### Checkpoint D: Definition of Done

- [ ] 所有规格验收标准具有自动化测试或明确的双宿主手工证据。
- [x] `pnpm verify:fast`、`pnpm verify`、`pnpm verify:e2e` 全部通过。
- [x] 无新增依赖、schema、Bridge API、深导入或 alphaTab 私有 API。
- [x] Managed Score Copy、Viewer practice/resume 与 Harmony Analysis Document 边界保持不变。
- [ ] 活规格、`CONTEXT.md`、glossary、`DESIGN.md` 与当前架构说明一致。

## Verification Checkpoints

| 检查点 | 最小命令                                                                                | 目的                            |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------- |
| A      | `pnpm vitest run packages/web-core/src/gp packages/web-viewer/src` + `pnpm verify:fast` | alphaTab 能力与纯模型先失败快返 |
| B      | Studio/web-core 定向 Vitest + `pnpm verify:fast`                                        | 双向选择和预览主循环            |
| C      | `pnpm verify`                                                                           | UI、类型、单测与两个构建        |
| D      | `pnpm verify:e2e`                                                                       | Browser/Desktop 用户路径        |

## Risks and Mitigations

| Risk                                                               | Impact | Mitigation                                                                       |
| ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| alphaTab chord runtime 投影不能可靠替换来源和弦或表达拍内变化      | High   | T2 使用真实 fixture 提前验证；失败即回到计划评审，不先改大 UI                    |
| 当前 openStudio 复用 Viewer session，可能触碰 practice persistence | High   | T3 建立独立 runtime/factory，并用 persistence spy 证明隔离                       |
| alphaTab 重渲染丢失滚动、缩放、选择或播放状态                      | High   | adapter 在提交边界捕获/恢复稳定状态；预览刷新不跟随表单每次输入                  |
| source harmony 与 annotation target 改变导致投影陈旧               | Medium | ViewerApplication 缓存可重建 source context，以 target/document version 为失效键 |
| 右栏 40% 宽度下列表和编辑器仍拥挤                                  | Medium | 分栏可调、列表窄轨、编辑字段响应式；在 960px 前验证最小可用宽度                  |
| 双独立滚动产生焦点或滚动争夺                                       | Medium | 仅不可见时滚动，检测用户主动滚动窗口，Testing Library + E2E 覆盖                 |
| localStorage 不可用或值损坏                                        | Low    | 容错读取、范围校验、默认 60/40 与预览开启，不影响领域状态                        |
| 现有 StudioPage 单文件过大，任务互相冲突                           | Medium | 先抽纯 view model/runtime contract，再逐个垂直切片；每任务限制 3–5 文件          |

## Parallelization and Sequencing

- 可并行：T1 与 T2；Checkpoint A 后，T7 可与 T5/T6 独立进行。
- 必须顺序：T2 → T3 → T4/T5/T6；T1 → T4 → T8；T5/T6/T8 → T9 → T10。
- 需要协调：T4、T5、T6 共用 `StudioScoreRuntime` 契约，必须由 T2/T3 先冻结公共方法和事件。
- 本任务未请求多 agent，实现阶段默认串行；若未来显式要求并行，只在上述安全边界分派。

## Open Questions

- 当前没有产品开放问题。
- 唯一技术门禁是 T2 对 alphaTab 1.8.4 公共 API 的真实 fixture 可行性；若失败，不自动采用 DOM overlay、私有 API 或降低验收标准。
