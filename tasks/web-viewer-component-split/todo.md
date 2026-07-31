# web-viewer 大型 TSX 组件拆分任务

## Phase 0: Baseline

- [x] Task 0：冻结 `features/<feature>/` 的 entry/components/adapters/model/runtime 目录规则
- [x] Task 0：确认新 source module 使用 `kebab-case`，兼容入口改名使用独立 mechanical commit
- [x] Task 0：确认 feature data hooks 只适配 application/session port，不建立第二数据层
- [x] Task 1：记录 Playback、Library、Studio focused tests 当前结果
- [x] Task 1：记录 Browser/Desktop production route chunk 与 initial JS 基线
- [x] Task 1：增加或记录三类 render probe 基线
- [x] Checkpoint A：确认暂停重叠的 Tailwind Task 9c / 11b / 11c / 11d / 11e

## Phase 1: Playback structural split

- [ ] Task 2：提取 `runtime/seek-preview-scheduler.ts` 与 `model/playback-presenter.ts`
- [ ] Task 2：提取 `components/bpm-control.tsx` 与 `score-navigation-controls.tsx`
- [ ] Task 3：提取 `playback-transport.tsx` 和 disabled transport presentation
- [ ] Task 3：保留 Space shortcut、seek preview、loop toggle 和 audio retry 行为
- [ ] Task 4：提取 `practice-drawer.tsx` 与 `panels/practice-overview.tsx`
- [ ] Task 4：保留 open/back/close/Escape/focus restoration
- [ ] Task 5：提取 Rhythm、Piano Hands、Loop、Tracks panels
- [ ] Task 5：保留所有 domain command payload
- [ ] Task 6：旧 `PlaybackWorkspace.tsx` 收敛为 compatibility re-export
- [ ] Task 6：按 transport/drawer/loop/tracks 拆分测试
- [ ] Checkpoint B：Playback focused tests、App Viewer integration、style tests 通过

## Phase 2: Playback rendering boundary

- [ ] Task 7：实现 feature-local `adapters/use-playback-selector.ts`
- [ ] Task 7：覆盖 equality、stable reference、unsubscribe 测试
- [ ] Task 8：从 workspace shell 移除完整 playback subscription
- [ ] Task 8：Transport 订阅高频 slice，打开的 drawer/panel 订阅低频 slice
- [ ] Task 8：position-only update 不重渲染非当前 panel
- [ ] Checkpoint C：render probe 优于基线，用户行为测试无变化

## Phase 3: Sheet Library

- [ ] Task 9：提取 `model/library-view-model.ts`、`adapters/use-debounced-query.ts`、`components/library-toolbar.tsx`
- [ ] Task 9：为 filter/sort/stats/format 增加 pure tests
- [ ] Task 10：提取 `library-score-list.tsx`、`library-score-row.tsx`、`highlight-text.tsx`
- [ ] Task 10：建立 stable callbacks 与 memoized list/row boundary
- [ ] Task 11：提取 Edit/Delete dialogs、ImportSummary、Skeleton、EmptyState
- [ ] Task 11：保留 menu-to-dialog final focus
- [ ] Task 12：旧 `SheetLibrary.tsx` 收敛为 compatibility re-export
- [ ] Task 12：按 import/actions/dialog/filter 拆分测试
- [ ] Task 12：更新 style test 的 Library source owner
- [ ] Checkpoint D：Library focused tests、App Library journey、render probe 通过

## Phase 4: Studio

- [ ] Task 13：提取 `model/studio-page-model.ts` 与 `model/studio-page-presenter.ts`
- [ ] Task 13：实现 `adapters/use-studio-snapshot.ts` 与 `adapters/use-studio-lifecycle.ts`
- [ ] Task 13：覆盖 Studio slice stability、save shortcut、beforeunload
- [ ] Task 14：提取 `StudioCommandBar`、`StudioSettingsPopup`、`StudioPreviewPopup`
- [ ] Task 14：保留 history/save/export/settings/preview 行为与状态
- [ ] Task 15：提取 `StudioAnalysisPanel`、`StudioSegmentInspector`、`StudioWorkspace`
- [ ] Task 15：保留 selection、correction、split/merge/move/reset commands
- [ ] Task 16：`StudioPage.tsx` 收敛为 route/lifecycle/composition
- [ ] Task 16：按 lifecycle/workspace/command/preview/inspector 拆分测试
- [ ] Checkpoint E：Studio focused tests、App Studio journey、render probe 通过

## Phase 5: Route code splitting

- [ ] Task 17：提取 `app/router.tsx`
- [ ] Task 17：Library、Viewer、Studio 和 wildcard Viewer 使用 lazy route
- [ ] Task 17：移除 `LibraryPage -> ViewerPage` 静态 import
- [ ] Task 18：验证 Harmony capability unavailable 时不加载 Studio feature
- [ ] Task 18：验证 direct URL、route navigation、not-found 和返回 Library
- [ ] Task 18：比较 production initial asset 与 async chunks
- [ ] Checkpoint F：Browser/Desktop/iPad production build 均存在预期 route chunks

## Phase 6: Final verification and handoff

- [ ] `pnpm vitest run packages/web-viewer/src/features/playback-workspace`
- [ ] `pnpm vitest run packages/web-viewer/src/features/sheet-library`
- [ ] `pnpm vitest run packages/web-viewer/src/features/harmony-studio`
- [ ] `pnpm vitest run packages/web-viewer/src/app`
- [ ] `pnpm check:arch`
- [ ] `pnpm check:design`
- [ ] `pnpm check:i18n`
- [ ] `pnpm check`
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `pnpm demo:build`
- [ ] `pnpm desktop:build`
- [ ] `pnpm ipad:web:build`
- [ ] 运行相关 Browser/Desktop E2E
- [ ] 确认没有无解释的 initial JS 增长
- [ ] 确认没有 Feature Contract 行为漂移
- [ ] 更新 active Tailwind plan 中受影响的目标路径
- [ ] 将耐久结构更新到 architecture 后删除本任务包
