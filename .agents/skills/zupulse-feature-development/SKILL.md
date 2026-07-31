---
name: zupulse-feature-development
description: Manually invoked workflow for refining, implementing, testing, reviewing, and closing out a Zupulse feature change, with optional bounded read-only subagents coordinated by the main Agent. Use only when the user explicitly invokes `$zupulse-feature-development`; never invoke this skill implicitly from an ordinary feature, bug-fix, planning, coding, or testing request.
---

# Zupulse Feature Development

Run a feature change as a traceable sequence of requirement refinement, small implementation slices, risk-based verification, and durable documentation updates.

## Invocation Boundary

- Proceed only after the user explicitly invokes `$zupulse-feature-development`.
- Do not reinterpret a normal development request as an invocation.
- Keep the requested scope authoritative. Invocation does not authorize publishing, committing, pushing, or unrelated cleanup.
- Treat explicit invocation as authorization to launch bounded read-only subagents when they materially reduce uncertainty or provide independent verification. It does not authorize subagents to edit files or mutate external state.

## 1. Orient From Current Facts

1. Read the repository `AGENTS.md`, `docs/architecture/README.md`, `CONTEXT.md`, and the relevant terminology in `docs/architecture/glossary.md`.
2. Read `docs/features/README.md` and the Current Feature Contract before changing an existing or in-progress Feature.
3. Read the closest nested `AGENTS.md` for every package or app likely to change. Read `DESIGN.md` for UI or interaction work.
4. Inspect runtime code, Zod schemas, database constraints, tests, and the worktree. Treat them as stronger evidence than Specs or historical documents.
5. Report conflicts between sources before relying on the lower-ranked source.

State the intended outcome, affected boundaries, relevant invariants, and smallest initial verification before editing.

## 2. Refine the Change Intent

Classify the request:

- Use an existing approved Spec when it already describes the requested change.
- Create or materially revise `docs/specs/YYYY-MM-DD-<slug>.md` for a new Feature, significant behavior change, or ambiguous cross-boundary change.
- Skip a new Spec for a small, already precise fix whose intent and acceptance criteria are fully established by the request and current contracts.

A new Spec must use the repository lifecycle and contain the goal, non-goals, constraints, acceptance criteria, and only decisions that materially affect implementation. Write product design content in Chinese and exact engineering contracts in English.

Ask for human direction only when an unresolved choice would materially change product behavior, architecture, security, data compatibility, or scope. Otherwise make and disclose the smallest reversible assumption.

Do not use a Spec as evidence that behavior already exists or as a progress tracker.

## 3. Establish Active Execution State

Use `tasks/TEMPLATE.md` to record only active execution state.

- Continue an existing task bundle when it clearly owns the same initiative.
- Do not overwrite an unrelated `tasks/plan.md` or `tasks/todo.md`.
- When another initiative is active, create `tasks/<initiative>/` so progress remains isolated.
- When persistent Agent evidence is required, use `tasks/<initiative>/` even if no other initiative is active.
- Define ordered vertical slices, acceptance criteria, the smallest test for each slice, escalation checks, and explicit human checkpoints.
- Keep at most one implementation slice in progress unless the user explicitly asks for parallel agent work.

Do not duplicate durable requirements from the Spec, Feature Contract, ADR, architecture documents, or `DESIGN.md` into the task bundle.

## 4. Delegate Bounded Read-Only Work

Keep the main Agent responsible for requirements, decisions, the task plan, all file edits, final verification, and the user-facing result. Use subagents selectively; do not create them merely because capacity exists.

Delegate only independently useful, non-writing work:

- **Researcher:** trace the bounded behavior through runtime code, schemas, tests, and Current documents; identify risks, missing coverage, and the smallest relevant verification commands.
- **Reviewer:** inspect the completed diff for correctness, regressions, boundary violations, and unverified claims.

Start with one Researcher. Split research into separate implementation-tracing and test-analysis tasks only when at least one condition applies:

- the change crosses multiple hosts or trust boundaries;
- implementation discovery and the test matrix are both large and independently useful;
- a high-risk change needs an independent test challenger;
- one Researcher would carry excessive context.

When splitting research, give each subagent a distinct question and preserve independent judgment. Do not run parallel agents against the same open question.

Do not delegate implementation, test-file edits, task-state edits, documentation edits, commits, publishing, or external mutations. Skip delegation for a small localized change or when coordination costs more than the independent result.

For every delegated task:

1. Give one concrete question, explicit scope, exclusions, source-of-truth order, and expected output.
2. Require no file edits and no external-state changes.
3. Require evidence as paths and line numbers, commands with actual results, assumptions, and remaining uncertainty.
4. Keep the context minimal. Do not leak the main Agent's preferred conclusion into an independent review.
5. Route communication through the main Agent. Send follow-up context or corrections to the affected subagent; do not rely on subagents to coordinate among themselves.
6. Integrate findings only after checking them against repository facts. A subagent report is evidence to evaluate, not verification by itself.
7. Interrupt or redirect outstanding work when the user changes scope. Do not wait for irrelevant work before proceeding.

Before implementation, use Researcher findings to refine acceptance criteria and verification. After implementation and local checks, ask a fresh Reviewer to inspect the actual final diff. The main Agent resolves disagreements, applies any fixes, and reruns affected validation.

### Persist Material Agent Evidence

Create `tasks/<initiative>/agent-evidence.md` when any of these conditions applies:

- more than one subagent contributes to the initiative;
- work may continue across sessions or context compaction;
- reproducing a finding or command result would be expensive;
- a finding affects architecture, security, data compatibility, domain invariants, or acceptance.

The main Agent must write the evidence file; subagents remain read-only. Record a material report before relying on it for implementation or acceptance. Use this compact structure:

```md
## <role>: <bounded task>

- Recorded at:
- Scope:
- Worktree/commit basis:
- Evidence:
- Commands and actual results:
- Findings:
- Uncertainty:
- Main-Agent disposition:
```

Summarize only decision-relevant evidence. Do not persist raw chat, hidden reasoning, large command logs, duplicated requirements, or facts that are cheap to recover. Treat the file as temporary execution state, not a source of current runtime truth.

## 5. Implement in Verified Slices

For each slice:

1. Read the adjacent implementation, schema, tests, and one comparable implementation.
2. For logic, bug fixes, or behavior changes, add or adjust a failing test before changing production behavior.
3. Implement the smallest sufficient change while preserving package, host, security, persistence, and i18n boundaries.
4. Run the smallest relevant test immediately.
5. If it fails unexpectedly, diagnose the root cause before changing strategy or weakening assertions.
6. Review the slice diff for unintended scope, raw exceptions in UI, deep imports, optional `undefined`, unvalidated persisted or cross-process data, and missing cleanup.
7. Update the active task checkpoint only after the current file state passes its stated verification.

After any later edit, rerun the smallest validation that covers the final changed state.

## 6. Route Verification by Risk

Start narrowly, then escalate according to actual impact:

| Change area             | Smallest relevant verification                        | Escalate when                                                          |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/web-core`     | `pnpm vitest run packages/web-core/src/<area>`        | Shared contracts, domain invariants, or consumers change               |
| `packages/web-viewer`   | `pnpm vitest run packages/web-viewer/src/<area>`      | User journeys, layout, accessibility, or host behavior change          |
| Browser/IndexedDB       | Relevant unit or repository contract test             | Persistence, refresh, import, or deletion journeys change              |
| Desktop/Bridge          | Relevant schema/handler test and `pnpm desktop:build` | Cross-process or user-visible Desktop behavior changes                 |
| iPad/Swift              | Targeted `pnpm ipad:test -- --only-testing ...`       | Bridge, resources, navigation, lifecycle, or release boundaries change |
| i18n                    | Relevant tests and `pnpm check:i18n`                  | Any user-visible system copy or locale flow changes                    |
| Documentation contracts | `pnpm check:docs`                                     | Observable behavior or invariants also change                          |

Use these aggregate gates proportionally:

1. `pnpm verify:fast` for integrated TypeScript, repository-contract, document, design, formatting, and i18n confidence.
2. `pnpm verify` when production Browser/Desktop builds or cross-package integration are relevant.
3. `pnpm verify:e2e` for affected Browser/Desktop journeys.
4. `pnpm ipad:verify` for the iPad risk categories defined by its nested instructions.

Before a commit requested by the user, run `pnpm format:check` and `git diff --check`. Never claim a skipped, stale, or failing command passed.

## 7. Close the Initiative

After the final behavior is verified:

1. Compare the outcome with every acceptance criterion and non-goal.
2. Review the complete diff and remaining worktree state.
3. Promote durable outcomes to the appropriate Current Feature Contract, architecture document, ADR, `DESIGN.md`, or deterministic repository check.
4. Update a Feature Contract only for verified observable behavior, domain invariants, platform capabilities, or known gaps. Update `last_verified` only after checking its evidence and running proportional verification.
5. Promote durable Agent findings to the proper Current document or deterministic check, then remove `agent-evidence.md` with the completed one-time task bundle. Preserve unrelated active task records.
6. Report the delivered behavior, final changed files, exact commands and actual results, unresolved risks, and any intentionally deferred work.

If a relevant final check is failing or cannot run, stop and report the blocker instead of presenting the feature as verified.
