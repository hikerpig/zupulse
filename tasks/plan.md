# Implementation Plan: Documentation Gardening

## Overview

按已确认的
[`2026-07-25-documentation-gardening-design.md`](../docs/superpowers/specs/2026-07-25-documentation-gardening-design.md)
分三层交付文档维护机制：

1. 为 Feature Contract 建立确定性的结构、索引、路径、链接和新鲜度检查，并接入
   `verify:fast`。
2. 根据 Git diff 和 `implementation_paths` 生成非阻塞 Contract 影响提示。
3. 在前两层稳定后，建立每周 Codex 语义审计，按证据门槛创建 Draft PR、报告冲突或无操作结束。

计划不修改产品运行时。阶段一、二只使用 Node 标准库和现有依赖；阶段三才涉及 Codex 自动任务与
GitHub 外部写入。

## Canonical Context

- 设计规格：
  `docs/superpowers/specs/2026-07-25-documentation-gardening-design.md`
- Feature Contract 规则：`docs/features/README.md`
- Contract 模板：`docs/features/templates/feature-contract.md`
- 当前样例：`docs/features/contracts/sheet-library.md`
- 仓库检查器：`scripts/repository-checks.mjs`
- 检查器测试：`scripts/__tests__/repositoryChecks.test.ts`
- CI：`.github/workflows/verify.yml`
- 根命令：`package.json`
- 命名规范：`docs/conventions/file-naming.md`

## Architecture Decisions

- 扩展现有 `repository-checks.mjs`，不建立第二套结构检查框架。
- frontmatter 解析只支持模板使用的 scalar/list 子集；未知或嵌套结构明确失败，不增加 YAML
  依赖。
- `check:docs` 只阻断机械可证明的错误；`docs:impact` 初期始终非阻塞。
- Contract discovery/frontmatter parser 作为共享基础，影响分析复用同一规范化 Contract 数据。
- Git 命令只出现在 `documentation-impact.mjs` CLI 边界；路径匹配和报告渲染保持纯函数。
- `last_verified` 超过 30 天只 warning，不作为正确性的替代信号。
- 稳定、已实现的操作规则写入 `docs/conventions/documentation-gardening.md`；设计规格在全部落地后
  标记为 historical。
- 周期审计不向仓库保存报告；确定漂移创建 Draft PR，冲突创建/更新 issue，无漂移不产生外部写入。

## Dependency Graph

```text
Task 1 Contract discovery + frontmatter parser
  │
  ├── Task 2 Contract-local validation
  │     │
  │     └── Task 3 Cross-document validation
  │             │
  │             └── Task 4 check:docs command + verify:fast
  │
  └── Task 5 Impact matching core
          │
          └── Task 6 Git/CI impact integration

Tasks 4 + 6 stable
  │
  └── Task 7 Semantic audit runbook
          │
          └── Task 8 Sheet Library semantic evaluations
                  │
                  └── Task 9 Weekly Codex automation
                          │
                          └── Task 10 Finalize current docs and cleanup
```

Task 5 may begin after Task 1 while Tasks 2–3 continue, but both streams touch parser exports and should only be
parallelized after agreeing on the normalized Contract shape.

## Phase 1: Deterministic Contract Gate

### Task 1: Build Contract discovery and frontmatter parsing

**Description:** Add a dependency-free reader for real Feature Contracts under `contracts/` and optional
`archive/`, excluding templates. Parse the exact scalar/list frontmatter subset used by the template into a
normalized object and return stable, path-qualified parse errors.

**Acceptance criteria:**

- [ ] Valid scalar/list frontmatter produces a normalized Contract with repository-relative path.
- [ ] Missing delimiters, malformed lists, nested/unknown structures and duplicate keys produce deterministic
      errors instead of partial values.
- [ ] `templates/` is never discovered as a real Contract; a missing `archive/` is treated as empty.

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- [ ] Fixture tests cover valid, malformed, template-excluded and missing-archive cases.

**Dependencies:** None.

**Files likely touched:**

- `scripts/repository-checks.mjs`
- `scripts/__tests__/repositoryChecks.test.ts`

**Estimated scope:** S — 2 files.

### Task 2: Validate Contract metadata, lifecycle and required sections

**Description:** Implement Contract-local rules for field values, feature slug uniqueness inputs, directory
lifecycle combinations and required Markdown headings. Inject the current date into the check so stale-date tests
remain deterministic.

**Acceptance criteria:**

- [ ] All frontmatter fields and enum combinations from the design spec are validated with stable errors.
- [ ] Current/partial, draft/planned and historical/retired fixtures enforce the correct directory and heading
      rules.
- [ ] A Current Contract older than 30 days emits a warning without adding an error.

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- [ ] Tests prove warnings do not change the successful result into a failure.

**Dependencies:** Task 1.

**Files likely touched:**

- `scripts/repository-checks.mjs`
- `scripts/__tests__/repositoryChecks.test.ts`

**Estimated scope:** S — 2 files.

### Task 3: Validate the Feature index, implementation paths and local links

**Description:** Complete `checkDocumentation()` with cross-document rules: Current Contract index coverage,
duplicate/dangling index entries, existing `implementation_paths`, unique feature slugs and local Markdown links.

**Acceptance criteria:**

- [ ] Current Contracts and the `docs/features/README.md` table form an exact, non-duplicated index.
- [ ] Missing implementation paths and missing local Markdown link targets fail with repository-relative errors.
- [ ] Fragment links validate the target file only, and external/protocol links are ignored.

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- [ ] A fixture equivalent to the current Sheet Library index passes with no error.

**Dependencies:** Task 2.

**Files likely touched:**

- `scripts/repository-checks.mjs`
- `scripts/__tests__/repositoryChecks.test.ts`

**Estimated scope:** S — 2 files.

### Checkpoint: Contract validation core

- [ ] Tasks 1–3 acceptance criteria all pass.
- [ ] `checkDocumentation()` returns separately sorted `errors` and `warnings`.
- [ ] The current repository passes the function-level check.
- [ ] Review parser strictness and error messages before exposing the command in `verify:fast`.

### Task 4: Expose `check:docs` and integrate the blocking gate

**Description:** Add the `docs` CLI branch, print warnings/errors with correct exit codes, expose
`pnpm check:docs`, insert it into `verify:fast`, and document only the now-working deterministic mechanism.

**Acceptance criteria:**

- [ ] `pnpm check:docs` exits `0` on the current repository and `repository-checks.mjs` documents `docs` in its
      usage error.
- [ ] Structural errors exit `1`, warnings alone exit `0`, and invalid CLI usage exits `2`.
- [ ] `verify:fast` runs `check:docs`; the convention doc does not claim impact analysis or automation already
      exists.

**Verification:**

- [ ] `pnpm check:docs`
- [ ] `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- [ ] `pnpm verify:fast`
- [ ] `pnpm format:check`
- [ ] `git diff --check`

**Dependencies:** Task 3 and Contract validation checkpoint approval.

**Files likely touched:**

- `scripts/repository-checks.mjs`
- `package.json`
- `scripts/README.md`
- `docs/conventions/documentation-gardening.md`

**Estimated scope:** M — 4 files.

## Phase 2: Non-blocking Impact Analysis

### Task 5: Implement pure Contract impact matching

**Description:** Create pure functions that match an explicit changed-file list against normalized Current
Contract `implementation_paths` and render stable findings, without invoking Git or mutating process state.

**Acceptance criteria:**

- [ ] Directory paths match descendants, file paths match exactly, and similar prefixes do not false-match.
- [ ] Multiple impacted Contracts and simultaneous Contract updates are represented and sorted deterministically.
- [ ] No match produces the stable `no feature contracts affected` result.

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/documentation-impact.test.ts`
- [ ] Tests cover directory, file, similar-prefix, multi-Contract, updated-Contract and no-match cases.

**Dependencies:** Task 1 normalized Contract shape.

**Files likely touched:**

- `scripts/documentation-impact.mjs`
- `scripts/__tests__/documentation-impact.test.ts`

**Estimated scope:** S — 2 files.

### Task 6: Connect Git diff impact reporting to local commands and PR CI

**Description:** Add the CLI boundary that resolves `--base`, reads `git diff --name-only`, runs the pure matcher,
and prints a Markdown-compatible report. Expose `pnpm docs:impact` and append its output to the PR Step Summary
without making it a required failure.

**Acceptance criteria:**

- [ ] `pnpm docs:impact --base <commit>` reports changed implementation paths and whether each Contract changed.
- [ ] Pull-request CI has enough Git history, writes the report to `$GITHUB_STEP_SUMMARY`, and does not run the
      step for non-PR events.
- [ ] A successful impact run remains non-blocking even when a Contract is flagged for review.

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/documentation-impact.test.ts`
- [ ] `pnpm docs:impact --base HEAD~1`
- [ ] Review `.github/workflows/verify.yml` condition and base SHA expression against a pull-request event.
- [ ] `pnpm verify:fast`
- [ ] `git diff --check`

**Dependencies:** Tasks 4 and 5.

**Files likely touched:**

- `scripts/documentation-impact.mjs`
- `scripts/__tests__/documentation-impact.test.ts`
- `package.json`
- `.github/workflows/verify.yml`
- `docs/conventions/documentation-gardening.md`

**Estimated scope:** M — 5 files.

### Checkpoint: Deterministic gardening

- [ ] `check:docs` blocks structural drift.
- [ ] `docs:impact` identifies Sheet Library implementation changes and remains non-blocking.
- [ ] `pnpm verify:fast` passes.
- [ ] CI fetch-depth/base selection has been reviewed.
- [ ] Stable convention documentation matches only implemented behavior.
- [ ] Human approval before enabling semantic automation or external writes.

## Phase 3: Semantic Audit and Recurring Operation

### Task 7: Write the executable semantic audit runbook

**Description:** Extend the now-current convention doc with exact Contract selection, evidence ordering, finding
classification, `last_verified` rules, Draft PR/issue bodies and the no-drift behavior that the Codex automation
must follow.

**Acceptance criteria:**

- [ ] Every finding class has an evidence threshold and permitted action.
- [ ] The runbook forbids direct main writes, code fixes, silent ADR conflict resolution and unverifiable date
      updates.
- [ ] The runbook includes the exact minimal commands and repository-relative output format for one Contract audit.

**Verification:**

- [ ] `pnpm check:docs`
- [ ] `pnpm exec prettier --check docs/conventions/documentation-gardening.md`
- [ ] Manual comparison against the semantic-audit and boundaries sections of the approved design spec.

**Dependencies:** Deterministic gardening checkpoint approval.

**Files likely touched:**

- `docs/conventions/documentation-gardening.md`

**Estimated scope:** XS — 1 file.

### Task 8: Evaluate the runbook with three Sheet Library scenarios

**Description:** In disposable worktrees, evaluate `confirmed_drift`, `completed_gap` and behavior-preserving
refactor scenarios from the design spec. Run the auditor in dry-run mode so it produces findings but creates no
PR, issue or persistent report.

**Acceptance criteria:**

- [ ] Import-limit code plus test change is classified `confirmed_drift` with direct evidence.
- [ ] Desktop practice-summary implementation plus test is classified `completed_gap`.
- [ ] Behavior-preserving Repository refactor does not require a Contract change.

**Verification:**

- [ ] Each scenario records the inspected runtime/test paths and actual commands in the task result.
- [ ] Disposable worktrees are removed after the run; no intentional drift remains in the main worktree.
- [ ] Any classifier/runbook adjustment is reflected in the convention doc and rechecked with `pnpm check:docs`.

**Dependencies:** Task 7.

**Files likely touched:**

- `docs/conventions/documentation-gardening.md` only if evaluation reveals ambiguity.
- Disposable worktree fixtures only; they must not be committed.

**Estimated scope:** M — no persistent product files.

### Task 9: Configure the weekly Codex gardening automation

**Description:** After the three dry runs pass, create a weekly Codex automation that reads the repository runbook,
audits Current Contracts, creates a small Draft PR only for high-confidence drift, and creates/updates an issue
only for source conflicts. Confirm schedule and GitHub authorization at task start.

**Acceptance criteria:**

- [ ] The automation has an explicit weekly schedule, repository working directory and runbook entrypoint.
- [ ] It never pushes main directly, modifies code, or writes a PR/issue for `no_drift`.
- [ ] A bounded manual run demonstrates the expected no-drift or finding output without leaking local absolute
      paths.

**Verification:**

- [ ] Inspect the saved automation configuration and next-run time.
- [ ] Run or trigger one bounded audit and inspect its final summary.
- [ ] If GitHub write capability is unavailable, verify the automation reports the blocker without claiming a
      PR/issue was created.

**Dependencies:** Task 8 and explicit operational confirmation of schedule/GitHub authorization.

**Files likely touched:**

- `docs/conventions/documentation-gardening.md` only if operational behavior differs from the verified runbook.
- Codex automation configuration outside repository source.

**Estimated scope:** S — one external configuration plus at most 1 repository file.

### Checkpoint: Semantic gardening

- [ ] All three Sheet Library dry-run scenarios classify correctly.
- [ ] The recurring automation is saved and its next run is visible.
- [ ] GitHub mutations are bounded to Draft PR/issue rules.
- [ ] A no-drift run creates no repository or GitHub artifact.
- [ ] Review with the human before marking the design implemented.

### Task 10: Finalize current documentation and remove one-time plan files

**Description:** After all implementation and operational checks pass, make the stable convention discoverable,
mark the design spec historical/implemented with a replacement link, and remove the one-time plan/task files as
required by repository policy.

**Acceptance criteria:**

- [ ] Current navigation points to the implemented gardening convention and does not present the design spec as
      current behavior.
- [ ] The design spec is clearly historical and links to the stable convention.
- [ ] `tasks/plan.md` and `tasks/todo.md` are removed only after every prior task and checkpoint is complete.

**Verification:**

- [ ] `pnpm check:docs`
- [ ] `pnpm verify:fast`
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `git status --short` contains only the intended finalization changes.

**Dependencies:** Semantic gardening checkpoint approval.

**Files likely touched:**

- `docs/features/README.md`
- `docs/architecture/README.md`
- `docs/superpowers/specs/2026-07-25-documentation-gardening-design.md`
- `tasks/plan.md` (removed)
- `tasks/todo.md` (removed)

**Estimated scope:** M — 5 files.

## Verification Checkpoints

### After Tasks 1–3

- Focused repository-check tests pass.
- Current Sheet Library Contract and index pass function-level validation.
- Parser/output interface is reviewed before CLI integration.

### After Task 4

- `pnpm check:docs` and `pnpm verify:fast` pass.
- Only implemented deterministic behavior is documented as current.

### After Tasks 5–6

- Focused impact tests pass.
- Local Git diff integration works.
- PR CI report is non-blocking and has adequate history.

### After Tasks 7–9

- Three semantic scenarios pass.
- Weekly automation is configured and bounded.
- No-drift produces no write.

### Before Task 10 completion

- Run `pnpm verify:fast`.
- Run `pnpm format:check`.
- Run `git diff --check`.
- Review all implementation against the design spec acceptance criteria.

## Risks and Mitigations

| Risk                                                    | Impact | Mitigation                                                                                     |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Partial YAML parser accepts ambiguous content           | High   | Support only template scalar/list syntax; reject duplicates, nesting and unknown structure     |
| README table parsing becomes fragile                    | Medium | Treat the current index table as a documented contract and test realistic formatting fixtures  |
| Markdown links in code fences are mistaken for evidence | Medium | Match actual Markdown link syntax in Contract/index scope and add fenced-code regression tests |
| Newness date depends on wall clock                      | Medium | Inject the current date into core checks; keep the real clock at CLI boundary                  |
| GitHub checkout lacks base history                      | Medium | Use PR base SHA and fetch sufficient history; keep the step PR-only                            |
| Broad implementation paths produce false positives      | Medium | Keep impact results non-blocking and observe four weeks before tightening                      |
| AI rewrites docs to legitimize a regression             | High   | Require runtime/schema plus test agreement and no Current ADR conflict                         |
| Automation lacks GitHub authorization                   | Low    | Report the blocker in the task result; do not claim external writes                            |
| Process reports accumulate as documentation             | Medium | Store findings in Draft PR/issue/task output, never `docs/gardening/reports/`                  |

## Parallelization Opportunities

- Task 5 can run alongside Tasks 2–3 only after Task 1 fixes the normalized Contract interface and file ownership is
  separated.
- Task 7 documentation drafting can begin near the end of Task 6, but it must not claim automation exists until
  Tasks 8–9 pass.
- Tasks 4, 6, 9 and 10 are sequential integration points and should not be parallelized.
- The three Task 8 scenarios may be evaluated independently in disposable worktrees, then reviewed together.

## Open Decisions

- Task 9 must confirm the exact weekly time and timezone before creating the automation.
- Task 9 must verify that the GitHub connector is authorized for Draft PR and issue writes.
- After four weeks of impact reports, a separate decision will determine whether `docs:impact` remains advisory or
  gains an acknowledgment/gate. This is not part of the initial implementation.
