# Zupulse Agent Context

## Language Policy

- Write Agent instructions, behavioral rules, and machine-readable or engineering contracts in English
  (schemas, API fields, invariants, acceptance criteria, error codes, normative keywords).
- Write product design documents in Chinese. Technical design documents may mix languages: Chinese for context
  and trade-offs, English for code identifiers, protocols, schemas, and other exact technical terms.
- Choose one primary language per paragraph. Do not translate code identifiers or invent parallel Chinese names
  for them. Existing documents do not need mechanical translation.

## Principles and Sources of Truth

- Do not preserve backward compatibility.
- Choose the simplest implementation that fully meets the current requirements.
- When sources conflict, trust runtime code, schemas, and database constraints first; then reproducible
  verification; then current ADRs, architecture documents, and Feature Contracts; then specifications. Report
  conflicts explicitly. Historical and in-progress documents are evidence only.

## Document Lifecycle

- Follow `docs/README.md` for document placement and lifecycle. Keep change intent in `docs/specs/`, active
  execution state in `tasks/`, and durable current behavior in Feature Contracts, architecture documents, ADRs,
  `DESIGN.md`, or repository checks.
- Before deleting a completed task bundle, promote durable outcomes. Archive only material with lasting
  traceability value; archived documents never define current behavior.

## Read Before Editing

- Domain, schemas, import, or playback: `packages/web-core/AGENTS.md`
- React routes, state, or UI: `packages/web-viewer/AGENTS.md`
- Browser or IndexedDB: `apps/web-demo/AGENTS.md`
- Electron, Bridge, or SQLite: `apps/desktop-shell/AGENTS.md`
- Electron Main or managed files: `apps/desktop-shell/src/main/AGENTS.md`
- Architecture, UI, navigation, or terminology: the relevant Current ADR, architecture document, `DESIGN.md`,
  `CONTEXT.md`, or glossary. Before changing an existing or in-progress Feature, read `docs/features/README.md`
  and its Contract.

## Invariants

- `web-core` must not depend on React, Browser, or Electron; `web-viewer` accesses host capabilities only through
  ports. Browser and Desktop libraries are independent. Renderer never receives absolute paths, and Main
  revalidates every one-time token for external files.
- Library Score IDs are UUIDs; deduplication uses lowercase SHA-256; Viewer and Studio URLs use only
  `libraryScoreId`.
- `SheetLibraryRepository` owns library facts. `ScoreFileGateway` owns file selection and export.
- Deletion removes managed bytes, library records, practice data, and Harmony Analysis Documents without
  recreating orphaned data.

## Implementation and Verification

- Comments: omit comments that merely restate what the code does. Complex or non-obvious code must include a
  concise comment explaining why the constraint, trade-off, workaround, or surprising choice exists.
- Code style: follow `docs/conventions/file-naming.md`; named exports, Oxfmt double quotes,
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
- After the final edit, run the smallest relevant check, then escalate by risk to `pnpm verify:fast`,
  `pnpm verify`, and Browser/Desktop `pnpm verify:e2e` journeys. Run `pnpm check:i18n` for i18n changes. Before
  committing, run `pnpm format:check` and `git diff --check`.
- Report each verification command, its actual result, and its covered scope. If a relevant check fails or cannot
  run, report the blocker and do not present the change as verified.
