# Task List: Studio 工作区调优

## 状态

- 阶段：执行审计中。2026-07-19 `pnpm verify` 通过（103 个测试文件、383 项测试及双构建）；Browser 与 Desktop Playwright 分别 4/4 通过。但完整规格尚未全部实现，不能标记为最终验收完成。
- 规格：`docs/superpowers/specs/2026-07-19-studio-workspace-tuning-design.md`。
- 计划：`tasks/plan.md`。
- 执行规则：严格按依赖顺序；每项测试先行；任务完成后立即勾选验收与验证项。
- 逐项审计（2026-07-19）：
  - [x] Task 1–8：范围模型、公开 alphaTab 能力、独立 runtime、宿主接入及可重建投影已有实现和测试证据。
  - [x] Task 9：双向选择、空白反馈、半开边界、按需滚动与选择恢复均有单测/组件/E2E 证据。
  - [x] Task 10：完整有效和弦预览、开关、恢复和非阻塞错误降级已实现。
  - [x] Task 11：runtime snapshot/命令、soundfont loading/error、audio-unavailable、stopped 与销毁清理均有测试证据。
  - [x] Task 12：版本化、容错的 split/preview 偏好及测试已完成。
  - [x] Task 13：独立分栏组件、键盘/指针约束、窄屏堆叠与独立滚动均有测试和真实视口证据。
  - [x] Task 14：有效范围 master-detail 已抽为独立组件，筛选、隐藏项说明与完整键盘焦点行为均有组件测试。
  - [x] Task 15：默认折叠设置、单行 Transport、固定导出与完整状态/桌面/窄屏/深浅主题均已验证。
  - [x] Task 16–17：Browser/Desktop 均完成 reviewed 曲谱双向选择与 5/5 E2E，销毁、lifecycle 与路径隔离另有单测证据。
  - [ ] Task 18：命令门禁和文档已更新；由于 Task 9、11、13–17 尚有缺口，最终 Definition of Done 未达成。

## Phase 1：Fail-fast foundations

### Task 1：建立 Effective Harmony Range 视图模型

**Description:** 用纯函数把 Effective Harmony Projection 转为 Studio 可展示的 range item，统一来源、当前和弦/N.C./unresolved、底层 Revision、置信度等级和稳定 range key。

**Acceptance criteria:**

- [x] Correction、source harmony、resolved analysis 与 unresolved 都产生结构明确的 view item。
- [x] Correction/source 覆盖时仍可查到重叠的底层 Analysis Revision 详情，但不会把底层结果当成当前有效结果。
- [x] view item 的身份来自 Score Written Range，不依赖 Revision segment 数组索引。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-view-model.test.ts`
- [x] `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/features/harmony-studio/harmony-range-view-model.ts`
- `packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-view-model.test.ts`
- `packages/web-viewer/src/features/harmony-studio/index.ts`

**Estimated scope:** Medium, 3 files

### Task 2：实现书面位置格式、筛选与选择恢复纯函数

**Description:** 在同一 view-model 边界补齐小节/拍格式、全部/待确认/已修正筛选、半开区间命中，以及基于焦点书面时刻的选择恢复规则。

**Acceptance criteria:**

- [x] 同小节、跨小节、整数拍与细分拍位置生成音乐可读文本，普通列表不暴露 tick。
- [x] 筛选结果正确，且可以标记一个不符合筛选但因谱面点击而临时显示的选中项。
- [x] 拆分、合并、重新分析与空白位置分别遵循已确认的选择恢复/不吸附规则。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-view-model.test.ts`
- [x] `pnpm vitest run packages/web-core/src/harmony/__tests__/effectiveProjection.test.ts`

**Dependencies:** Task 1

**Files likely touched:**

- `packages/web-viewer/src/features/harmony-studio/harmony-range-view-model.ts`
- `packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-view-model.test.ts`

**Estimated scope:** Small, 2 files

### Task 3：冻结 Studio alphaTab adapter 公共契约

**Description:** 测试先行地扩展 alphaTab 公共类型封装，新增只暴露应用类型的 Studio adapter 契约，支持 Beat 点击、range→Beat、高亮与滚动命令，不向 web-viewer 泄漏 alphaTab 对象。

**Acceptance criteria:**

- [x] Beat/Note 事件映射为精确 Score Written Moment，并可安全解除订阅。
- [x] Score Written Range 可映射到起止 Beat；不可表示位置返回结构化错误，不吸附或取整。
- [x] 高亮与滚动只调用 alphaTab 1.8.4 公共 API，不查询 alphaTab DOM 或访问私有字段。

**Verification:**

- [x] `pnpm vitest run packages/web-core/src/gp/__tests__/alpha-tab-studio.test.ts`
- [x] `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `packages/web-core/src/gp/alphaTabBrowser.ts`
- `packages/web-core/src/gp/alpha-tab-studio.ts`
- `packages/web-core/src/gp/__tests__/alpha-tab-studio.test.ts`
- `packages/web-core/src/index.ts`

**Estimated scope:** Medium, 4 files

### Task 4：验证 alphaTab 临时和弦替换与局部试听

**Description:** 在 Studio adapter 中实现临时 chord binding 替换、预览清理、范围播放和 transport snapshot，并用真实 MusicXML fixture 验证拍内变化与来源和弦覆盖。

**Acceptance criteria:**

- [x] Correction 覆盖来源和弦时目标 Beat 只绑定一个有效和弦；关闭派生预览可恢复来源内容。
- [x] 同小节多个合法边界可显示不同和弦，unresolved 不生成虚假 chord binding，N.C. 语义明确。
- [x] 局部播放范围、速度、seek、播放/暂停和错误事件只通过公共 API 工作，循环不执行结构跳转。

**Verification:**

- [x] `pnpm vitest run packages/web-core/src/gp/__tests__/alpha-tab-studio.test.ts`
- [x] `pnpm vitest run packages/web-core/src/musicxml/__tests__/musicXmlAcceptance.test.ts`
- [x] 使用 `test-fixtures/musicxml` 中真实 fixture 完成无重复和弦断言。

**Dependencies:** Task 3

**Files likely touched:**

- `packages/web-core/src/gp/alpha-tab-studio.ts`
- `packages/web-core/src/gp/__tests__/alpha-tab-studio.test.ts`
- `packages/web-core/src/gp/alphaTabBrowser.ts`
- `test-fixtures/musicxml/generated/harmony-written-time.musicxml`

**Estimated scope:** Medium, 3–4 files

## Checkpoint A：Runtime feasibility

- [x] Tasks 1–4 全部完成。
- [x] `pnpm verify:fast`（K331 fixture 已修复，当前完整门禁通过。）
- [x] 确认真实 fixture 可以无重复地替换来源和弦，并支持拍内边界、选择高亮和局部试听。
- [x] 未触发回退：未采用 DOM overlay 或私有 API。

## Phase 2：Independent Studio runtime

### Task 5：创建独立 StudioScoreRuntime factory

**Description:** 新增与 ViewerSessionHandle 分离的 Studio runtime contract/factory，集中拥有 alphaTab API 和 Studio adapter 生命周期，不创建 PlaybackController 或练习 persistence。

**Acceptance criteria:**

- [ ] Studio runtime 暴露 selection、preview、transport、snapshot 与 destroy 能力，公开类型不包含 alphaTab Beat/Score/DOM。
- [ ] 创建 Studio runtime 不调用 `PlaybackPersistence`、`createController` 或 Viewer sidecar 初始化。
- [ ] 初始化失败与销毁失败按现有 AggregateError/cleanup 约定处理，事件订阅全部释放。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`
- [ ] `pnpm vitest run packages/web-viewer/src/__tests__/viewerApp.test.ts`

**Dependencies:** Tasks 3–4

**Files likely touched:**

- `packages/web-viewer/src/studio-score-runtime.ts`
- `packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`
- `packages/web-viewer/src/host.ts`
- `packages/web-viewer/src/viewerApp.tsx`
- `packages/web-viewer/src/index.ts`

**Estimated scope:** Medium, 5 files

### Task 6：让 ViewerApplication 使用独立 Studio runtime

**Description:** 把 Studio 打开/关闭路径从通用 `openSession` 中拆出，ViewerApplication 只在 Studio 路由使用新的 runtime，并保持 Viewer session 生命周期不变。

**Acceptance criteria:**

- [ ] `openStudio` 创建 StudioScoreRuntime；离开、切谱或销毁应用时只销毁正确的 runtime。
- [ ] Viewer 的播放、sidecar 和 resume 行为不变；Studio runtime 不出现在 Viewer playback snapshot 中。
- [ ] 重复打开同一 Studio、打开失败和应用销毁都不会泄漏 runtime。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- [ ] `pnpm vitest run packages/web-viewer/src/__tests__/viewerApp.test.ts`

**Dependencies:** Task 5

**Files likely touched:**

- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- `packages/web-viewer/src/mountViewerApp.tsx`
- `packages/web-viewer/src/__tests__/viewerApp.test.ts`

**Estimated scope:** Medium, 4 files

### Task 7：接入 Browser 与 Desktop 的 Studio runtime factory

**Description:** 两个宿主向 mountViewerApp 提供相同的共享 Studio factory，不新增 Bridge、数据库或平台分支。

**Acceptance criteria:**

- [ ] Browser 与 Desktop 都能创建 Studio runtime，Viewer 的 `openSession` 注入保持原行为。
- [ ] 宿主代码不直接操作 alphaTab API，不新增绝对路径或 Renderer 本地能力。
- [ ] 构建时 contract 缺失会产生类型错误，而不是运行时静默回退到 Viewer session。

**Verification:**

- [ ] `pnpm --filter @zupulse/web-demo build`
- [ ] `pnpm --filter @zupulse/desktop-shell build`
- [ ] `pnpm typecheck`

**Dependencies:** Task 6

**Files likely touched:**

- `apps/web-demo/src/main.ts`
- `apps/desktop-shell/src/renderer.ts`
- `packages/web-viewer/src/mountViewerApp.tsx`
- `packages/web-viewer/src/index.ts`

**Estimated scope:** Medium, 4 files

### Task 8：在应用层建立可重建的 Studio source context

**Description:** ViewerApplication 缓存当前 Managed Score Copy 的只读 source context，按 annotation target 合成 Effective Harmony Projection，并向页面 snapshot 暴露 view items 与必要元数据。

**Acceptance criteria:**

- [ ] source harmony、active Revision 和 Corrections 按既定优先级生成 Effective Harmony Range items。
- [ ] annotation target、document version、reanalysis 或 Correction 改变会使 projection 正确失效重建。
- [ ] source bytes/runtime context 不进入 Harmony Analysis Document、Bridge payload 或可序列化 UI preference。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- [ ] `pnpm vitest run packages/web-core/src/harmony/__tests__/effectiveProjection.test.ts`

**Dependencies:** Tasks 1–2, 6

**Files likely touched:**

- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- `packages/web-viewer/src/features/harmony-studio/harmony-range-view-model.ts`

**Estimated scope:** Medium, 3 files

## Phase 3：Core vertical slices

### Task 9：接通谱面与列表的双向 Harmony Selection

**Description:** 以焦点书面时刻和 range 驱动 Studio selection，把 alphaTab Beat 点击、列表点击、高亮、按需滚动与 projection 重建恢复连成一个可用闭环。

**Acceptance criteria:**

- [x] 点击谱面 Beat/Note 选择覆盖它的 Effective Harmony Range；空白点击不吸附、不创建 Correction。
- [x] 点击列表高亮完整 range，只在目标不可见时滚动谱面；谱面点击同理只按需滚动列表。
- [x] 拆分、合并、重新分析后按焦点时刻恢复选择，不跳回第一项；播放头不改变选择。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- [x] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- [x] 键盘/鼠标用户视角测试覆盖半开边界与空白位置。

**Dependencies:** Tasks 2, 7–8

**Files likely touched:**

- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- `packages/web-viewer/src/studio-score-runtime.ts`

**Estimated scope:** Medium, 4 files

### Task 10：接通完整有效和弦预览与错误降级

**Description:** 在领域操作提交后把完整 Effective Harmony Projection 应用到 Studio runtime，加入设备级开关、就地错误/重试，并保持选择、缩放和滚动。

**Acceptance criteria:**

- [ ] 默认显示所有确定的有效和弦；unresolved 不显示虚假和弦；来源/算法/修正不用谱面颜色区分。
- [ ] 选择候选、手动应用、N.C.、重置、拆分、合并、移动边界和成功 reanalysis 后刷新，表单草稿变化不刷新。
- [ ] 渲染失败保留原始乐谱、选择和右侧编辑能力，显示可重试就地错误，不阻断保存或无条件阻断导出。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- [ ] `pnpm vitest run packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`
- [ ] 测试 Correction 覆盖 source 时 runtime 只收到一个有效 chord binding。

**Dependencies:** Tasks 8–9

**Files likely touched:**

- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- `packages/web-viewer/src/studio-score-runtime.ts`
- `packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`
- `packages/web-viewer/src/app/studio-preferences.ts`

**Estimated scope:** Medium, 5 files

### Task 11：把 Preview Transport 连接到 Studio runtime

**Description:** 用真实 runtime snapshot/commands 替换页面内孤立 reducer，完成播放/暂停、seek、速度、局部 range loop 与音频错误状态。

**Acceptance criteria:**

- [x] Preview Transport 实际驱动 Studio alphaTab，UI 状态来自 runtime 事件，不再只是 React 自报状态。
- [x] 循环使用当前 Effective Harmony Range 的局部书面范围，不执行 repeat jump；取消循环恢复正常完整播放。
- [x] soundfont loading/error、audio unavailable、playing/paused/stopped 和销毁清理完整；Viewer playback/persistence spy 未被调用。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- [x] `pnpm vitest run packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`
- [x] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`

**Dependencies:** Tasks 7, 9–10

**Files likely touched:**

- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- `packages/web-viewer/src/studio-score-runtime.ts`
- `packages/web-viewer/src/__tests__/studio-score-runtime.test.ts`

**Estimated scope:** Medium, 4 files

## Checkpoint B：Core Studio loop

- [ ] Tasks 5–11 全部完成。
- [ ] `pnpm verify:fast`
- [ ] Browser 手工验证“点击谱面→选择区间→应用候选→谱面更新→循环试听”。
- [ ] Studio 关闭重开后 Document/设备偏好恢复，Harmony Selection/Transport 不持久化。

## Phase 4：Workspace UI

### Task 12：实现容错的 Studio UI preferences

**Description:** 建立单一设备偏好 helper，版本化并校验分栏比例与预览开关，storage 不可用或值损坏时安全回退。

**Acceptance criteria:**

- [x] 默认分栏 60/40、预览开启；比例被限制在规格安全边界。
- [x] Browser 与 Desktop Renderer 共用相同 key/解析逻辑；损坏 JSON、SecurityError 与 quota failure 不影响 Studio。
- [x] 偏好不包含 libraryScoreId、Harmony Selection、Transport 或 Document 数据。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/app/__tests__/studio-preferences.test.ts`
- [x] `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/app/studio-preferences.ts`
- `packages/web-viewer/src/app/__tests__/studio-preferences.test.ts`

**Estimated scope:** Small, 2 files

### Task 13：实现全视口可访问 SplitWorkspace

**Description:** 抽出 Studio 专用分栏组件，支持指针拖动、键盘、双击复位、边界、窄屏堆叠和两个独立滚动区域。

**Acceptance criteria:**

- [x] separator 具有正确 role、方向、当前值和可访问名称，Arrow/Home/End 可调整，双击恢复 60/40。
- [x] 指针拖动遵守左右最小宽度；拖动时不选择文本、不触发联动滚动，结束后保存比例。
- [x] 窄视口移除 separator 并按乐谱→分析顺序堆叠；Viewer 页面布局不受影响。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/components/__tests__/studio-split-workspace.test.tsx`
- [x] `pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`

**Dependencies:** Task 12

**Files likely touched:**

- `packages/web-viewer/src/components/studio-split-workspace.tsx`
- `packages/web-viewer/src/components/studio-split-workspace.module.css`
- `packages/web-viewer/src/components/__tests__/studio-split-workspace.test.tsx`
- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/app/pages/StudioPage.module.css`

**Estimated scope:** Medium, 5 files

### Task 14：实现 Effective Harmony Range master-detail 列表

**Description:** 用有效区间列表替换原 Revision segment rail，加入来源、置信度、音乐位置、筛选、底层分析详情与完整键盘/焦点行为。

**Acceptance criteria:**

- [x] 列表与谱面当前有效结果一一对应，Correction 后不出现旧 segment index 错位。
- [x] “全部/待确认/已修正”筛选正确；谱面选择隐藏项时临时显示并说明原因。
- [x] Arrow/Home/End/PageUp/PageDown、Enter、Escape 和焦点恢复按规格工作，表单输入不被劫持。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-workspace.test.tsx`
- [x] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`

**Dependencies:** Tasks 2, 9, 13

**Files likely touched:**

- `packages/web-viewer/src/features/harmony-studio/harmony-range-workspace.tsx`
- `packages/web-viewer/src/features/harmony-studio/harmony-range-workspace.module.css`
- `packages/web-viewer/src/features/harmony-studio/__tests__/harmony-range-workspace.test.tsx`
- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/features/harmony-studio/HarmonyStudioEditor.tsx`

**Estimated scope:** Medium, 5 files

### Task 15：重组右栏命令、设置、Transport 与导出区域

**Description:** 按规格把右栏压缩成稳定工作台：紧凑命令栏、默认折叠设置、单行 Transport、主区独立滚动、底部固定导出。

**Acceptance criteria:**

- [x] 常规桌面视口无需滚到页面底部即可访问保存、设置、试听、列表、编辑与导出。
- [x] loading、empty、analyzing、unsaved、saving、conflict、preview error、audio unavailable 与无选择都有稳定就地状态。
- [x] Light/Dark、960px 临界宽度与窄屏同构；符合 Studio 9/10 密度、Anti-Slop 和最小点击目标。

**Verification:**

- [x] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- [x] `pnpm vitest run packages/web-viewer/src/__tests__/styles.test.ts`
- [x] `pnpm check:design`

**Dependencies:** Tasks 10–11, 13–14

**Files likely touched:**

- `packages/web-viewer/src/app/pages/StudioPage.tsx`
- `packages/web-viewer/src/app/pages/StudioPage.module.css`
- `packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`
- `packages/web-viewer/src/components/ScoreViewer.module.css`
- `packages/web-viewer/src/__tests__/styles.test.ts`

**Estimated scope:** Medium, 5 files

## Checkpoint C：Complete workspace

- [x] Tasks 12–15 全部完成。
- [ ] `pnpm verify`
- [ ] 桌面长列表可访问到底，乐谱、列表和编辑器滚动互不锁死。
- [ ] Light/Dark、桌面/窄屏、键盘、焦点恢复、错误降级与 reduced-motion 均有验证证据。

## Phase 5：Cross-host acceptance

### Task 16：补齐 Browser Studio E2E

**Description:** 在 Browser Demo 覆盖导入 MusicXML、打开 Studio、分栏、双向选择、应用修正、谱面预览更新和真实局部试听主路径。

**Acceptance criteria:**

- [x] 可拖动分栏并在重开 Studio 后恢复比例。
- [x] 谱面与列表双向选择可见，Correction 后 alphaTab 和弦更新且 unresolved 不显示虚假和弦。
- [x] Preview Transport 产生真实播放状态，Studio 操作不污染 Viewer resume/practice 数据。

**Verification:**

- [x] `pnpm --filter @zupulse/web-demo test:e2e`
- [x] `pnpm --filter @zupulse/web-demo build`

**Dependencies:** Task 15

**Files likely touched:**

- `apps/web-demo/e2e/library.spec.ts`
- `apps/web-demo/playwright.config.ts`
- `test-fixtures/musicxml/generated/harmony-written-time.musicxml`

**Estimated scope:** Medium, 2–3 files

### Task 17：补齐 Desktop Studio E2E

**Description:** 在 Electron 覆盖与 Browser 同构的核心流程，并验证 Renderer 仍不获得绝对路径、Bridge/schema 未扩展。

**Acceptance criteria:**

- [x] Desktop 能完成分栏、双向选择、修正预览和局部试听。
- [x] Studio runtime 销毁后音频与事件订阅停止，不影响应用 lifecycle ack。
- [x] E2E 与测试代码不依赖绝对用户路径，不新增 Bridge request/response/capability。

**Verification:**

- [x] `pnpm --filter @zupulse/desktop-shell test:e2e`
- [x] `pnpm --filter @zupulse/desktop-shell build`
- [x] `pnpm check:arch`

**Dependencies:** Tasks 15–16

**Files likely touched:**

- `apps/desktop-shell/e2e/desktop.spec.ts`
- `apps/desktop-shell/playwright.config.ts`

**Estimated scope:** Small, 2 files

### Task 18：完整门禁与活规格收尾

**Description:** 运行项目完整验证阶梯，记录真实结果，把实现中确认的文件入口、限制和状态同步到活规格与当前架构文档。

**Acceptance criteria:**

- [ ] 规格 10 条验收标准均有自动化测试或明确双宿主验证证据。
- [ ] 当前架构说明准确描述独立 Studio runtime、Effective Harmony Range、选择与预览边界。
- [ ] 无新增依赖、schema/Bridge、深导入、alphaTab 私有 API、未说明格式债务或被跳过测试。

**Verification:**

- [ ] `pnpm verify:fast`
- [ ] `pnpm verify`
- [ ] `pnpm verify:e2e`
- [ ] `pnpm format:check`
- [ ] `git diff --check`

**Dependencies:** Tasks 1–17

**Files likely touched:**

- `docs/superpowers/specs/2026-07-19-studio-workspace-tuning-design.md`
- `docs/architecture/harmony-analysis-system.md`
- `tasks/todo.md`
- 仅在实现形成长期设计变化时更新 `DESIGN.md` 或 glossary

**Estimated scope:** Small, 2–4 documentation files

## Checkpoint D：Definition of Done

- [ ] Tasks 1–18 全部完成并勾选。
- [ ] `pnpm verify:fast`、`pnpm verify`、`pnpm verify:e2e` 全部通过并记录结果。
- [ ] Managed Score Copy、Viewer practice/resume、Harmony Analysis Document 与 Bridge 边界保持不变。
- [ ] 交付说明列出实际验证结果、任何剩余限制和后续建议。
