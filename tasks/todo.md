# Viewer Playback Navigation Sync

Canonical plan: [`tasks/plan.md`](plan.md)

## Preconditions

- [x] Land the Current Contract / initial Spec document split separately.
- [x] Human approves `tasks/plan.md`.

## Phase 1: Risk-first foundations

- [x] T1 Public alphaTab navigation seam
  - [x] Public staff-system bounds normalize successfully.
  - [x] Cursor callbacks stay outside React state.
  - [x] Focused tests and typecheck pass.
- [x] T2 Exact playback occurrence index
  - [x] Repeat fixture exposes distinct path-aware occurrences.
  - [x] Current-path → next → first fallback is deterministic.
  - [x] Focused core tests pass.

## Checkpoint A

- [x] No private alphaTab API or fork is required.
- [x] ADR 0064 remains implementable.
- [x] Human approves continuation.

## Phase 2: Authoritative seek and Continuous Follow

- [x] T3 Single-authority score pointing seek
- [x] T4 Navigation coordinator state model
- [x] T5 Continuous Follow runtime integration

## Checkpoint B

- [x] Repeat click selects the intended occurrence.
- [x] Cross-system playback moves only the score container.
- [x] Manual navigation detaches without programmatic-scroll false positives.
- [x] `pnpm verify:fast` passes.
- [x] Browser fixture smoke check passes.

## Phase 3: Recovery UI and Page Turn foundation

- [x] T6 Detached recovery UI and localized copy
- [x] T7 Pure Screen Score Page projection
- [x] T8 Device-local navigation mode preference and controls

## Checkpoint C

- [x] Mode switch preserves transport and position.
- [x] Page Turn shows stable complete-system pages and `n / m`.
- [x] Return-to-playback restores Following.
- [x] Focused UI tests, i18n check, and Web build pass.

## Phase 4: Playback-aware Page Turn

- [ ] T9 Playback and Scrub page following
- [ ] T10 Manual page inputs
- [ ] T11 Re-layout anchors and generation fallback
- [ ] T12 Loop-aware page projection

## Checkpoint D

- [ ] Auto/manual page turn, Scrub, resize, and zoom use the latest generation.
- [ ] Short cross-page Loops remain stable when their systems fit.
- [ ] `pnpm verify:fast` and focused Browser E2E pass.

## Phase 5: Performance and acceptance

- [ ] T13 Position publication budget
- [ ] T14 Web E2E and performance evidence
- [ ] T15 Current Feature Contract / architecture / ADR promotion
- [ ] T16 Product language, UI contract, and Spec finalization
- [ ] T17 One-time task cleanup after human acceptance

## Final acceptance

- [ ] `pnpm verify:fast`
- [ ] `pnpm demo:build`
- [ ] `pnpm demo:test:e2e`
- [ ] Chromium 1440×900
- [ ] Chromium 768×1024
- [ ] Chromium 1024×768
- [ ] 30-minute long-score playback observation
- [ ] Scrub feedback below 50ms
- [ ] No sustained jank or monotonic memory growth
- [ ] `pnpm check:docs`
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] Human accepts the delivered Feature
