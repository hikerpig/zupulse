# Tailwind migration baseline

Captured on 2026-07-26 before adding Tailwind.

## Source CSS

- CSS files under `packages/web-viewer/src`: 17
- CSS lines: 2,990
- Local class rules: 425
- Largest modules:
  - `features/SheetLibrary.module.css`: 550 lines
  - `app/pages/StudioPage.module.css`: 527 lines
  - `features/PlaybackWorkspace.module.css`: 509 lines

## Production CSS assets

| Host             | Asset bytes |
| ---------------- | ----------: |
| Browser Demo     |      44,045 |
| Desktop Renderer |      44,036 |
| iPad Web Assets  |      44,017 |

## Warm build baseline

All three builds ran concurrently on the same machine, so the values are comparison baselines rather than isolated
benchmarks.

| Host             | Rspack reported | Wall time |
| ---------------- | --------------- | --------- |
| Browser Demo     | 590 ms          | 1.20 s    |
| Desktop Renderer | 581 ms          | 1.19 s    |
| iPad Web Assets  | 574 ms          | 1.21 s    |

Desktop Main and Preload reported 566 ms and 162 ms respectively; they do not consume the shared viewer stylesheet.

## CSS variable audit

Real runtime-token drift to fix before component migration:

- `--bg-primary`
- `--shadow-elevated`
- `--status-danger-text`
- `--status-danger-bg`
- `--accent-secondary`

Allowed non-global variables:

- `--studio-left`: component-local variable with a fallback.
- `--nav-height`: component-local customization point with a fallback.
- `--transform-origin`: injected by Base UI Positioner.

## Baseline verification

- `pnpm check:design`: passed.
- `pnpm vitest run packages/web-viewer/src/__tests__/styles.test.ts`: 14 tests passed.
- `pnpm demo:build`: passed.
- `pnpm desktop:build`: passed.
- `pnpm ipad:web:build`: passed.

## Pilot 1: App Header / Toolbar

- `AppHeader.module.css` declarations: `86 → 64`，减少 `25.6%`。
- Button visual ownership 已迁入 `Button` primitive；header grid、navigation underline、responsive layout 和
  Desktop drag region 继续由 CSS Module 所有。
- Browser visual checks: `1440×900` light/dark、`390×844` narrow、keyboard focus ring、locale popup 与
  Escape close 均通过。
- 窄屏检查发现并修复 navigation 的纵向 scrollbar；保留 `overflow-x: auto`，显式设置
  `overflow-y: hidden`。
