# Zupulse Agent Context

## Language Policy

- Write Agent instructions, behavioral rules, and machine-readable or engineering contracts in English
  (schemas, API fields, invariants, acceptance criteria, error codes, normative keywords).
- Write product design documents in Chinese. Technical design documents may mix languages: Chinese for context
  and trade-offs, English for code identifiers, protocols, schemas, and other exact technical terms.
- Choose one primary language per paragraph. Do not translate code identifiers or invent parallel Chinese names
  for them. Existing documents do not need mechanical translation.

## Principles

- Do not preserve backward compatibility.
- Choose the simplest implementation that fully meets the current requirements.

## Sources of Truth

Trust sources in this order:

1. Runtime code, Zod schemas, and database constraints.
2. Reproducible tests, builds, and E2E results.
3. Current ADRs, current architecture documents, and `status: current` Feature Contracts.
4. Current specifications.

Report conflicts explicitly. Historical documents, one-time plans, and in-progress target gaps are evidence
only, never current behavior.

## Working Document Lifecycle

- Put change intent, requirements, and acceptance criteria in `docs/specs/`. A Spec is neither a live progress
  tracker nor evidence of current runtime behavior.
- Put only active execution state in `tasks/`: implementation steps, checkboxes, checkpoints, and temporary
  verification notes. Use one task bundle per active initiative and delete it after completion.
- Before deleting a completed task bundle, promote durable outcomes to the appropriate Current Feature Contract,
  architecture document, ADR, `DESIGN.md`, or repository check.
- Put historical material in `docs/archive/<category>/<year>/` only when it remains useful for traceability.
  Archived documents must identify their historical status and current replacement, and must never guide current
  implementation.
- Keep Feature Contract history in `docs/features/archive/`; do not duplicate it under the general archive.
- See `docs/README.md` for the document map and naming guidance.

## Read Before Editing

- Domain, schemas, import, or playback: `packages/web-core/AGENTS.md`
- React routes, state, or UI: `packages/web-viewer/AGENTS.md`
- Browser or IndexedDB: `apps/web-demo/AGENTS.md`
- Electron, Bridge, or SQLite: `apps/desktop-shell/AGENTS.md`
- Electron Main or managed files: `apps/desktop-shell/src/main/AGENTS.md`
- Architecture or UI decisions: the relevant Current ADR, architecture document, or `DESIGN.md`
- Navigation and terminology: `docs/architecture/README.md`, `CONTEXT.md`, `docs/architecture/glossary.md`;
  before changing an existing or in-progress Feature, read `docs/features/README.md` and its Contract.

## Invariants

- `web-core` must not depend on React, Browser, or Electron. `web-viewer` accesses host capabilities only through
  ports.
- Browser and Desktop libraries are independent. Renderer never receives absolute paths. Main revalidates every
  one-time token for external files.
- Library Score IDs are UUIDs; deduplication uses lowercase SHA-256; Viewer and Studio URLs use only
  `libraryScoreId`.
- `SheetLibraryRepository` owns library facts. `ScoreFileGateway` owns file selection and export.
- Deletion removes managed bytes, library records, practice data, and Harmony Analysis Documents without
  recreating orphaned data.

## Implementation Rules

- Code style: follow `docs/conventions/file-naming.md`; named exports, Prettier double quotes,
  `__tests__/*.test.ts(x)`, no workspace deep imports. With `exactOptionalPropertyTypes`, omit absent optional
  fields instead of passing `undefined`.
- Validate cross-process and persisted inputs with Zod. A new Bridge API requires request, response, capability,
  and tests.
- i18n: user-visible system copy lives in `@zupulse/app-i18n`; `web-core` returns semantic codes and context,
  never translations or keys. The host persists locale (Browser: local storage; Desktop: Main and Bridge) before
  synchronizing Renderer, menus, and native dialogs. Never translate user content, score metadata, or chord
  symbols. Never expose raw exceptions in the DOM.
- After verified changes to observable behavior, domain invariants, platform capabilities, or known gaps, update
  the corresponding Feature Contract.
- Before adding a dependency, check platform APIs and existing dependencies; prefer established, well-maintained
  libraries and the smallest sufficient implementation.

## Verification

Run the smallest relevant tests first, then escalate by risk to `pnpm verify:fast`, `pnpm verify`, and
`pnpm verify:e2e` for Browser/Desktop journeys. Run `pnpm check:i18n` for i18n changes. Before committing, run
`pnpm format:check` and `git diff --check`, and report the actual results.

After the final change, rerun the smallest validation that covers the final changed scope; any later edit
invalidates earlier results. In the handoff, report the command, its actual result, and the covered scope. If a
relevant check fails or cannot run, stop and report the blocker; do not present the change as verified.
