# Zupulse Agent Context

## Language Policy

- Write Agent instructions and behavioral rules in English.
- Write machine-readable and engineering contracts in English, including schemas, API fields, invariants,
  acceptance criteria, error codes, and normative keywords.
- Write product design documents in Chinese.
- Technical design documents may mix languages: use Chinese for context and trade-offs, and English for code
  identifiers, protocols, schemas, and other exact technical terms.
- Choose one primary language per paragraph. Do not translate code identifiers or invent parallel Chinese names
  for them.
- Existing documents do not need mechanical translation. Apply this policy when creating or materially revising
  them.

## Sources of Truth

Trust sources in this order:

1. Runtime code, Zod schemas, and database constraints.
2. Reproducible tests, builds, and E2E results.
3. Current ADRs, current architecture documents, and `status: current` Feature Contracts.
4. Current specifications.

Report conflicts explicitly. Historical documents and one-time plans are evidence only.

Start navigation at `docs/architecture/README.md`. Use `CONTEXT.md` and
`docs/architecture/glossary.md` for terminology, and `DESIGN.md` for the UI contract. Before changing an existing
or in-progress Feature, read `docs/features/README.md` and its Contract. Never treat an in-progress target gap as
current behavior.

## Working Document Lifecycle

- Put change intent, requirements, and acceptance criteria in `docs/specs/`. A Spec must not be used as a live
  progress tracker or as evidence of current runtime behavior.
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

- Follow `docs/conventions/file-naming.md`. Use named exports, Prettier double quotes, and
  `__tests__/*.test.ts(x)`. Do not use workspace deep imports.
- With `exactOptionalPropertyTypes`, omit absent optional fields instead of passing `undefined`.
- Validate cross-process and persisted inputs with Zod. A new Bridge API requires request, response, capability,
  and tests.
- Put user-visible system copy in `@zupulse/app-i18n`. `web-core` returns semantic codes and context, never
  translations or translation keys. Never expose raw exceptions in the DOM.
- The host persists locale: Browser uses local storage; Desktop uses Main and Bridge. Persist before synchronizing
  Renderer, menus, and native dialogs. Do not translate user content, score metadata, or chord symbols.
- After verified changes to observable behavior, domain invariants, platform capabilities, or known gaps, update
  the corresponding Feature Contract.
- Check platform APIs and existing dependencies before adding a dependency. Prefer the smallest sufficient
  implementation, diagnose root causes, and keep changes scoped.
- Delete completed one-time plans and task records according to the Working Document Lifecycle.

## Verification

Run the smallest relevant tests first, then escalate by risk to `pnpm verify:fast`, `pnpm verify`, and
`pnpm verify:e2e` for Browser/Desktop journeys. Run `pnpm check:i18n` for i18n changes. Before committing, run
`pnpm format:check` and `git diff --check`, and report the actual results.

After the final change, rerun the smallest validation that covers the final changed scope. Any later edit makes
the earlier result stale and requires another relevant validation. In the handoff, name the command, its actual
result, and the final files or behavior it covers. If a relevant check is still failing or cannot run, stop and
report the blocker instead of presenting the change as verified.
