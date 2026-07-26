# Implementation Plan: Library 与 Viewer P0 UX 修复

## Overview

P0 在不修改领域、存储和宿主契约的前提下，修复 Library / Viewer 的窄屏裁切、Library Score
交互语义和搜索无结果恢复路径。实施以共享 `web-viewer` 垂直切片为单位，每个切片先增加用户视角
测试，再修改组件和 CSS，最后通过 Browser 真实旅程与 Desktop smoke 收口。

产品规格：
`docs/superpowers/specs/2026-07-26-library-viewer-ux-optimization-design.md`。

## Architecture Decisions

- 保持 `SheetLibraryRepository`、`ScoreFileGateway`、`LibraryScoreSummary` 与 playback commands 不变。
- 响应式布局继续由 `@container route` 驱动；390px 是最窄目标，620px 是现有窄屏切换点。
- Library `<li>` 只表达列表项；主打开按钮、收藏按钮和管理 Menu 互为同级。
- Library Score 管理使用现有 `@base-ui/react` Menu primitive，不扩展 modal `ContextPopup`。
- Empty 与 No-results 使用 `scores.length` 和 active filters 显式区分。
- Library-backed Viewer 移除页内导入；standalone Viewer 保留打开文件。
- 窄屏速度进入练习面板；Transport 只保留播放、停止、Loop、时间、必要状态和设置。
- Zoom 窄屏使用 Base UI Popover，继续提交现有 zoom commit 事件。
- enabled / disabled Transport 复用 presentation helper，避免响应式结构分叉。
- Feature Contract 只在实现和验证完成后更新为当前行为。

## Dependency Graph

```text
P0 spec
├── Library semantic action model
│   └── Library narrow layout
├── Library no-results state
│   └── Library Browser journey
├── Viewer header hierarchy
│   └── Narrow Transport + practice focus
│       └── Viewer Browser journey
└── Narrow Zoom Popover
    └── Viewer Browser journey

All component slices
└── Cross-host verification
    └── Feature Contract update
```

## Task List

### Phase 1: Library Core

- [x] Task 1: Separate Library Score primary and management actions
- [x] Task 2: Add recoverable No-results states
- [x] Task 3: Make Library header and filters fit narrow containers

### Checkpoint: Library

- [x] Library component tests pass
- [x] 390px Library has no horizontal overflow
- [x] Accessibility tree exposes one open action and one delete action per score

### Phase 2: Viewer Core

- [x] Task 4: Remove Library-backed Viewer import competition
- [x] Task 5: Implement narrow Transport hierarchy and practice-panel focus
- [x] Task 6: Collapse narrow score zoom into a Popover

### Checkpoint: Viewer

- [x] Viewer / Playback / ScoreViewer component tests pass
- [x] 390px Viewer core controls are visible in disabled, ready and error states
- [x] Practice panel and Zoom Popover support Escape and focus restoration

### Phase 3: Journey and Documentation

- [x] Task 7: Add Browser responsive journey coverage
- [x] Task 8: Run shared-host verification and update current documentation

### Checkpoint: Complete

- [x] `pnpm check:i18n` passes
- [x] `pnpm verify:fast` passes
- [x] `pnpm demo:build` and targeted Browser E2E pass
- [x] `pnpm desktop:build` and Desktop smoke pass
- [x] `git diff --check` passes
- [x] P0 success criteria in the spec are met

## Vertical Slices

### Slice A: Find and open a Library Score

Delivers correct Score action semantics, recoverable filters and a usable 390px Library. It does not wait for
Viewer changes to be testable.

### Slice B: Practice from a narrow Viewer

Delivers correct header priority, playable Transport, speed access and Zoom access at 390px. It reuses all
existing playback and zoom commands.

### Slice C: Cross-host confidence

Connects the slices through a real Browser import journey and confirms shared UI changes do not regress Desktop.
Only after this checkpoint does the Feature Contract describe the new current behavior.

## Parallelization

- Tasks 1 and 2 can be implemented independently after agreeing on `SheetLibrary` local state names.
- Task 3 should follow Task 1 because the final card action DOM determines narrow CSS.
- Tasks 4 and 6 can proceed independently.
- Task 5 should land before Task 7 because it defines the Viewer responsive contract.
- Task 8 is sequential and runs after all observable behavior is verified.

## Verification Checkpoints

### After Tasks 1–3

```bash
pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
pnpm check:i18n
pnpm demo:build
```

Manual/Browser check: 390×844 Library can search, recover from no results, open a score, favorite it and open the
management Menu without horizontal overflow.

### After Tasks 4–6

```bash
pnpm vitest run packages/web-viewer/src/app/__tests__/App.test.tsx
pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx
pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx
pnpm demo:build
```

Manual/Browser check: 390×844 Viewer can play/pause, open practice settings, adjust speed and open Zoom without
cropping.

### After Tasks 7–8

```bash
pnpm verify:fast
pnpm demo:test:e2e
pnpm desktop:build
pnpm desktop:test:e2e
pnpm format:check
git diff --check
```

## Risks and Mitigations

| Risk                                                     | Impact | Mitigation                                                            |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| Shared PageShell CSS regresses Studio                    | High   | Keep Library rules local; add route smoke checks                      |
| Base UI Menu behavior differs from current dialog popup  | High   | Use primitive semantics and browser keyboard verification             |
| Transport duplicates enabled/disabled markup             | High   | Extract the smallest shared presentation helper before responsive CSS |
| SoundFont error state overflows narrow Transport         | High   | Use compact status and place retry in practice panel                  |
| Hiding speed makes it undiscoverable                     | Medium | Keep speed summary and editable control at top of practice panel      |
| P0 CSS is discarded by P1 list redesign                  | Medium | Make action semantics structural and layout styles local              |
| Shared UI passes Browser but breaks Desktop shell chrome | Medium | Run Desktop build and targeted E2E smoke before handoff               |

## Confirmed Decisions

- 390px is the formal minimum core-journey width.
- Library-backed Viewer removes page-level import at every width.
- P0 ships independently before P1 directory-row work.
