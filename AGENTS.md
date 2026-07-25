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
- Delete completed one-time plans and task records. Move durable constraints into Current architecture, an ADR,
  or this file.

## Verification

Run the smallest relevant tests first, then escalate by risk to `pnpm verify:fast`, `pnpm verify`, and
`pnpm verify:e2e` for Browser/Desktop journeys. Run `pnpm check:i18n` for i18n changes. Before committing, run
`pnpm format:check` and `git diff --check`, and report the actual results.
