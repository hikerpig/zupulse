# Task: 拆分 web-viewer 三项架构深化（Studio seam / Session 深模块 / Host seam）

来自 2026-08-05 的 architecture-review 报告（临时 HTML 见当时的 `$TMPDIR/architecture-review-*.html`）。
执行前先读 `docs/architecture/react-application-system.md` 与相关 ADR。词汇：module / interface / depth /
seam / adapter / leverage / locality。

## Goal

- A：给 Studio 一个自己的 seam —— 提取 `StudioApplication` 深模块。
- B：把会话 grab-bag 深化为 `ViewerSession` 类（先提类，后收窄接口）。
- C：重塑宿主 seam —— 移除 `ViewerHost.openScore`，`library` 必选。

已记录决策：ADR 0067（C1：移除 openScore、library 必选）。`react-application-system.md` 已同步目标形态。

## Non-goals

- 候选 3（PlaybackController 深克隆导致的 selector identity 失效）不在本轮；只在 B2 埋点。
- 候选 4 完整版（统一 AlphaTabSurface DOM seam）不在本轮；只做 A4 的最小切片。
- C3（三宿主命令词汇统一 + bootstrap 去重）与 B3（收窄接口）为后续阶段，不在首轮。

## Scope

- 主目录：`packages/web-viewer/src`（`app/`、`features/harmony-studio/`、`features/playback-workspace/`、
  `viewerApp.tsx`、`host.ts`、`studio-score-runtime.ts`、`viewer-session/`）。
- 宿主：`apps/web-demo/src`、`apps/desktop-shell/src/renderer.ts`、`apps/ipad-shell/web/src`。
- 复用的既有契约：`docs/architecture/react-application-system.md` 已预写 `ViewerSession`
  `{ getSnapshot, subscribe, dispatch, destroy }`（B3 的目标）；ADR 0047（外部打开一律经 Library Import）。

---

## 计划 A — 给 Studio 一个自己的 seam

### A1 ✅ 投影唯一化（已完成 2026-08-05）

- 新建 `features/harmony-studio/model/studio-ranges.ts` → `projectStudioRanges(source, document)`（纯函数，
  组合 `effectiveHarmonyProjection` + `createHarmonyRangeViewItems`，`trackIndexFromId` 一并移入）；
  `ViewerApplication.getStudioRanges` 变为一行委托，`studioSources` 字段用 `StudioHarmonySource` 类型。
- 删除 `studio-page-model.ts` 的 `createStudioRanges` 第二套投影（忽略 corrections/source 的旧 fallback）；
  `StudioPage` 改为 `studio?.ranges ?? []`。
- 测试：新增 `studio-ranges.test.ts`（2 用例）断言 correction 覆盖 revision 时 `origin: "correction"`
  且 chord 用修正值（旧 fallback 的错误 case）；无 correction/source 时回归 `origin: "analysis"`。
- 出口达成：`pnpm check` 721 tests。

### A2 ✅ selection 单点持有（已完成 2026-08-05）

- `StudioPage.tsx` 删除 `fallbackSelectedKey` / `setFallbackSelectedKey`；`findSelectedStudioRange` 去掉 fallback
  分支，selection 只来自 snapshot。
- 修 `selectStudioMoment`（ViewerApplication）：score-click 落空时同步清掉 `selection`（原只设
  `selectionNotice: "no-effective-range"`，与残留高亮矛盾）。
- 测试：`StudioPage.test.tsx` 三处 snapshot 补 `ranges`（新契约「document 存在时 ranges 恒有值」）；
  test 221 的 fake application 改有状态（`selectStudioRange` 更新 snapshot + notify 驱动重渲染，替代本地 fallback）；
  test 296 改写为「落空后清高亮」（assert 无 `aria-pressed`）；test 348 补 ranges 让 loop 控件可用。
- 出口达成：StudioPage 无平行 selection 状态；`StudioPage.test.tsx` 19 用例全绿。

### A3 ✅ 提取 `StudioApplication`（已完成 2026-08-05）

- 新建 `features/harmony-studio/StudioApplication.ts`。构造入参：`library`
  （repository + adapters + gateway，供分析/导出）、`openStudioRuntime(file)`、`harmonyAnalysisRunner`、
  `host.reportDiagnostic`。自有 `getSnapshot/subscribe` + 命令面。
- 把 A1-A2 列出的全部 studio 成员从 `ViewerApplication` copy → adapt → delete：
  `openStudio/openStudioOnce`（:210-222, :430-502，去掉 viewer teardown）、corrections 编排（:224-401）、
  `setStudioScope/reanalyze/cancel/flush`（:403-428）、`exportStudio`（:514-541）、
  `selectStudioRange/Moment`（:247-320）、preview 全家（:254-305, :968-1010）、
  `getStudioRanges`（:1012-1028）、`setStudioState/setStudio`（:922-966）、`createStudioDocument`（:551-604）、
  studio* 字段（:106-122）。
- `ViewerApplication` 保留最小协调：`getStudioApplication()` + `switchToStudio(id)` / `switchToViewer(id)`（见 A5）。
- `features/harmony-studio/components/*`、`adapters/use-studio-*`、`StudioPage` 从 `ViewerApplication` 改面向
  StudioApplication 窄命令面；删 `studio-analysis-panel.tsx:78` 的 `as unknown as { retryStudioPreview?: ... }` 强转。
- 测试搬家：`ViewerApplication.test.ts` 的 studio `it` 块（:411, :589, :681, :780）+ `App.test.tsx` studio 覆盖
  迁到新的 `StudioApplication.test.ts`，用 fake repository/runtime/runner 直接驱动；`ViewerApplication.test.ts`
  只留委托 + viewer/library + 互斥行为。
- 出口：`StudioApplication.test.ts` 在无 viewer session 下跑通 open/analyze/correction/preview/export；
  `pnpm check` + `pnpm desktop:test:e2e`。

### A4 使能项：alphaTab settings 去重（#4 的最小切片）

- 把 `viewerApp.tsx` 的 `createViewerAlphaTabSettings`（和 `attachScoreZoomCommit`）提到
  `alpha-tab/alpha-tab-settings.ts`；`studio-score-runtime.ts:23` 改从共享模块导入，不再 `from "./viewerApp"`。
- 出口：studio runtime 不 deep-import viewer monolith。完整 #4 DOM seam 不在本轮。

### A5 ✅ WorkspaceCoordinator（已完成 2026-08-05）

- 把 `openStudioOnce` 的 viewer teardown（:450-471）与 `openLibraryScoreOnce` 的 studio runtime teardown
  （:800-807）收进壳层 coordinator，保留原顺序。
- 保持文档语义：两类 Session 可重建、URL 无 session id、不同时持两个 alphaTab/audio runtime。
- 出口：切换行为与现状逐条一致，用现存 "waits for an in-flight Viewer open before replacing it with Studio"
  测试锁住 teardown 顺序。

## 计划 B — 会话深化（先提深模块，后收窄接口）

### B1 ✅ 提类，表面不动（已完成 2026-08-05）

- 新建 `viewer-session/viewer-session.ts`：`class ViewerSession` 接管 `createDefaultOpenSession` 的全部 wiring；
  `viewerApp.tsx` 变为 re-export shim（消费方零改动：shells 经 index、`studio-score-runtime`、`viewerApp.test.ts`
  全部照旧）。`createDefaultOpenSession` 变薄工厂：`new ViewerSession(...).open(...)`。
- 为避免 `viewerApp ↔ viewer-session` 循环，把 `createViewerAlphaTabSettings` / `attachScoreZoomCommit` /
  `captureScoreAnchor` 提为 `viewer-session/alpha-tab-runtime.ts`（A4 目标的预提取；studio 仍从 `viewerApp`
  import，re-export 保持）。
- 未测策略移为具名方法：`applyNavigationPolicy(state)`（loop-key diff + transportEnteredStopped）、
  `routePlaybackCommand(cmd)`（seek→formalSeek / stop→transportChanged）、`routePreviewSeek(position)`
  （previewSeek→beginScrubPreview）。
- `DefaultOpenSessionDependencies` 增可选 `createNavigation?`（默认真 `ScoreNavigationCoordinator`），让 B2 可注入 fake。
- 出口达成：`pnpm check` 719 tests；既有 `createDefaultOpenSession` 用例不改而通过。

### B2 ✅ 补测「闭包里的真策略」（已完成 2026-08-05）

- 新增 `viewer-session.test.ts`（5 用例）：fake api/controller/navigation 驱动类；断言 loop-key diff 只在边界
  变化时触发 `setLoopMeasureRange`（非每个 tick）、transport 进入 stopped 才 `transportChanged`、seek/stop/
  previewSeek 路由、playback.subscribe 立即回放当前快照、destroy 顺序（beat detach 先于 controller destroy，
  adapter.destroy 不被调用）。
- 出口达成：导航策略由单测覆盖。候选 3 的 identity 问题在此只埋点，不修。

### B3 收窄接口（后续阶段，显式）

- 到点后：`ViewerSession` 只暴露 `getSnapshot/subscribe/dispatch/destroy`；`PlaybackWorkspace`/`ScoreNavigationControls`/
  overlays 改 slice 消费；删除 grab-bag 槽位；`host.ts` 删除 `ViewerSessionHandle`。
- 与候选 3 的 identity-stable snapshot 联动（不在本轮）。
- 出口：host.ts 只剩窄会话面；`react-application-system.md` 预写的 `ViewerSession` 形状成为事实。

## 计划 C — 重塑宿主 seam

### C1 从 seam 移除 openScore（行为变更，三宿主同 commit）

- `host.ts` 删 `ViewerHost.openScore`（:20-24）。
- `ViewerApplication`：`library` 改为必选参数；删 `openOnce`/`scheduleOpen`/`enqueueOpen` 及 `queuedError` 管道
  （:876-904；保留 `chain`，`openLibraryScore`/`openStudio` 仍用）；`openScore()` 无条件走 `importScores`
  （:180-187）。
- 注意：`ViewerAppHandle.openScore`（应用命令 = 导入并打开）保留；被删的是 seam 上的 `ViewerHost.openScore`。
- 删 no-library UI：`app/pages/ViewerPage.tsx:78-87` 的 `#open-score` 按钮与 `hasLibrary()` 分支。
- 三宿主删各自 `openScore`：`apps/web-demo/src/browserHost.ts:40-49`、
  `apps/desktop-shell/src/renderer.ts:150-165`、`apps/ipad-shell/web/src/ipad-viewer-host.ts:79-81`。
- `mountViewerApp` 的 `ViewerAppDependencies.library` 必选（`packages/web-viewer/src/mountViewerApp.tsx:24-39`）。
- 测试：`viewerApp.test.ts` "mountViewerApp" describe（:43-363）约 12 个 no-library 用例——仍有效的 open 串行/
  destroy 语义搬到 library 导入路径或收敛为对 `chain` 语义的聚焦测试；只测死路径的删除；fakes 补 fake library。
- 出口：`pnpm check`；全仓无 `host.openScore` 引用；`pnpm desktop:test:e2e`。

### C2 ✅ 清掉随之死亡的 `file.open` bridge RPC（desktop + web-core，已完成 2026-08-05）

> **执行时发现计划前提错误**：`file.readBytes` 并没有死——它是 library 导入路径的字节读取口
> （`DesktopScoreFileGateway.readTokensAsImportSources` 发 `file.readBytes`，`main.ts` 仍注册 handler）。
> 真正死掉的是 `file.open` 一个 RPC + 它的三个孤发送方（web-core 的 bridge open 流程）。
> 已按正确范围执行，`file.readBytes`/`file.select`/`file.save` 全部保留。

- 删除 `file.open`：bridge schema（envelope / request union / response union）、`OpenFileResponse` 类型、
  `IPAD_BRIDGE_REQUEST_TYPES` 允许表、desktop `file.open` handler、`files.ts` 的 `openScoreFile` + 三个
  deprecated 别名（`openGpFile`/`readGpFileBytes`/`assertReadableGp`）。
- 删除三个孤儿流程（零调用方，已核实 desktop/ipad/web-demo/e2e）：`bridge/openFileFlow.ts`
  （`openFileThroughBridge` + `BridgeHandshakeInput`）、`gp/gpOpenFlow.ts`（`openGpThroughBridge`）、
  `import/openScore.ts` 的 `openScoreThroughBridge`（纯 `openScore` 保留——无调用方但为干净可复用 helper，
  且 web-viewer 的 `importPresenter.ts` 与它重复，待 B/A 阶段收口）。
- Mock 与契约：`MockNativeBridge` 去掉 `file.open` case / `registerFile` / `pendingFiles`（保留 `file.readBytes`
  模拟）；`contract-manifest` 断言去掉 `file.open`；`ipad-bridge.json` fixture 把「valid file open」改为
  `accepted:false` 钉死删除；重新生成 `apps/ipad-shell/bridge/bridge-contract.json`（ADR 0022 运行时 schema 推导、
  ADR 0030 两侧同一次提交）。
- 出口：`pnpm check`（714 tests）、`pnpm verify:fast`、`pnpm desktop:build`、`pnpm demo:build`、
  `pnpm ipad:web:build` 全绿；全仓无 `file.open`（除 rejected fixture）`OpenFileResponse`/流程名残留。
- 遗留：iOS native 侧可能仍有 `file.open` handler（不在本仓库），随契约删除后为不可达，需 native 侧清理。

### C3 统一命令/生命周期词汇 + 吸收重复 bootstrap（跨壳，另立项）

- 清点三条通道：Browser pagehide→suspend（`host.subscribe`）、Electron `app.command/lifecycle/storage.warning`
  （`host.subscribe`）、iPad `zupulse:bridge-event`+`zupulse:external-open`（CustomEvent 绕过 seam）。
- 把 iPad 真正需要的命令收敛进 `ViewerHostEvent` 词汇表、让 iPad 也走 `host.subscribe`；或显式把 iPad
  CustomEvent 通道记为独立 adapter（grilling 决定）。
- 吸收重复：desktop 与 iPad 的 bridge 存在性→handshake→版本校验→fatal startup error 提为共享宿主 helper；
  两份逐字节相同的 IndexedDB `PlaybackPersistence` wrapper（`BrowserLibraryPlaybackPersistence` /
  `IpadLibraryPlaybackPersistence`）收敛进 `web-storage`。
- 出口：host.ts 一个词汇表；bootstrap helper 共享；persistence 单份。

---

## 建议执行顺序与交错点

顺序：**C1 → B1/B2 → A1/A2 → A3 → A4 → A5**；C2/C3、B3 各自为后续阶段。

- `host.ts`：B1 与 C1 都改它——先 C1 再 B1。
- `viewerApp.tsx`：B1 提类、A4 提 alphaTab settings——先 B1 后 A4。
- `mountViewerApp`：C1 让 `library` 必选，是 A3/B1 的隐含前提——前置。
- `ViewerApplication.ts`：C1 删 no-library openOnce（viewer/library）、A3 删 studio 成员（studio）——低冲突。

## Acceptance criteria

- [x] A：Studio 有独立 seam；`StudioApplication.test.ts` 无 viewer session 跑通全流程；ranges/selection 单一 owner。
- [ ] B：`ViewerSession` 类接管 wiring；未测策略有单测；消费方零改动（B1/B2）。
- [ ] C1：`ViewerHost` 无 `openScore`；`library` 必选；三宿主同步；无 dead path。

## Verification

- 最小测试：`pnpm check`。
- 完成门禁：`pnpm verify:fast`。
- 需要时：`pnpm desktop:build`、`pnpm demo:build`、`pnpm desktop:test:e2e`、`pnpm demo:test:e2e`。

## Open decisions

- A5：互斥由壳层 coordinator 持有（已定：`app/workspace-coordinator.ts`，StudioApplication 保持独立可重建，经 `acquireWorkspace` 钩子保留「验证后 teardown」顺序）。
- C3：iPad 收敛进 `host.subscribe` vs 显式记为独立 adapter 通道。
