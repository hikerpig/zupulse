# Documentation Gardening Tasks

Canonical spec:
[`docs/superpowers/specs/2026-07-25-documentation-gardening-design.md`](../docs/superpowers/specs/2026-07-25-documentation-gardening-design.md)

Detailed plan: [`tasks/plan.md`](plan.md)

## Phase 1: Deterministic Contract Gate

### Task 1: Contract discovery and frontmatter parser

- [x] Parse the template scalar/list subset into normalized Contract records.
- [x] Reject malformed, duplicate, nested or unknown structures deterministically.
- [x] Exclude templates and treat a missing archive directory as empty.
- [x] Verify: `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- Dependencies: none.

### Task 2: Contract-local validation

- [x] Validate metadata enums, lifecycle/directory combinations and required headings.
- [x] Emit an injected-date warning, not an error, after 30 days.
- [x] Verify: `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- Dependencies: Task 1.

### Task 3: Cross-document validation

- [x] Require exact Current Contract/index coverage without duplicates or dangling entries.
- [x] Validate `implementation_paths` and local Markdown targets.
- [x] Verify a current-repository-equivalent fixture passes.
- [x] Verify: `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- Dependencies: Task 2.

### Checkpoint: Contract validation core

- [x] Tasks 1–3 pass.
- [x] Review parser strictness, normalized shape and error messages.

### Task 4: `check:docs` command and blocking gate

- [ ] Add CLI output/exit behavior and `pnpm check:docs`.
- [ ] Insert `check:docs` into `verify:fast`.
- [ ] Document only the deterministic behavior now implemented.
- [ ] Verify: `pnpm check:docs`
- [ ] Verify: `pnpm verify:fast`
- Dependencies: Task 3 and checkpoint approval.

## Phase 2: Non-blocking Impact Analysis

### Task 5: Pure impact matching

- [ ] Match file/directory implementation paths without similar-prefix false positives.
- [ ] Render deterministic multi-Contract, updated-Contract and no-match results.
- [ ] Verify: `pnpm vitest run scripts/__tests__/documentation-impact.test.ts`
- Dependencies: Task 1 normalized Contract shape.

### Task 6: Git/CI impact integration

- [ ] Add `pnpm docs:impact --base <commit>`.
- [ ] Append a PR-only, non-blocking report to `$GITHUB_STEP_SUMMARY`.
- [ ] Ensure CI fetches/resolves the PR base commit.
- [ ] Verify: `pnpm docs:impact --base HEAD~1`
- [ ] Verify: `pnpm verify:fast`
- Dependencies: Tasks 4 and 5.

### Checkpoint: Deterministic gardening

- [ ] Structural drift blocks; semantic impact remains advisory.
- [ ] CI history/base handling is reviewed.
- [ ] Human approval before external semantic automation.

## Phase 3: Semantic Audit and Recurring Operation

### Task 7: Semantic audit runbook

- [ ] Document selection, finding classes, evidence thresholds and output rules.
- [ ] Prohibit direct main writes, code fixes and unverifiable `last_verified` updates.
- [ ] Verify: `pnpm check:docs`
- Dependencies: deterministic gardening checkpoint.

### Task 8: Sheet Library dry-run evaluations

- [ ] `confirmed_drift`: import limit plus matching test change is detected.
- [ ] `completed_gap`: Desktop practice summary plus test is detected.
- [ ] No drift: behavior-preserving Repository refactor requires no Contract change.
- [ ] Remove disposable worktrees and retain no intentional drift.
- Dependencies: Task 7.

### Task 9: Weekly Codex automation

- [ ] Confirm the weekly time/timezone and GitHub authorization.
- [ ] Save an automation bounded to the verified runbook.
- [ ] Run one bounded audit and inspect its summary.
- [ ] Confirm `no_drift` creates no PR, issue or repository file.
- Dependencies: Task 8 and operational confirmation.

### Checkpoint: Semantic gardening

- [ ] Three Sheet Library scenarios classify correctly.
- [ ] Automation schedule and next run are visible.
- [ ] Human approval before marking the design implemented.

### Task 10: Finalize current docs and clean up

- [ ] Link current navigation to the implemented convention.
- [ ] Mark the design spec historical/implemented with a replacement link.
- [ ] Remove `tasks/plan.md` and `tasks/todo.md` only after all prior work passes.
- [ ] Verify: `pnpm check:docs`
- [ ] Verify: `pnpm verify:fast`
- [ ] Verify: `pnpm format:check`
- [ ] Verify: `git diff --check`
- Dependencies: semantic gardening checkpoint.
