# Anonymous Product Telemetry and Error Tracking Tasks

Canonical plan: `tasks/anonymous-telemetry/plan.md`

## Phase 0: Decision

- [x] T01 Record the distribution telemetry ADR and preserve ADR 0029 for Internal Acceptance.

## Phase 1: Contract and Browser vertical slice

- [x] T02 Add strict telemetry schemas, `TelemetryPort`, No-op behavior, sanitizer, dedupe, and budgets.
- [ ] T03 Add Browser identity/preference persistence and a fake-tested PostHog adapter.
- [ ] T04 Compose the Browser distribution build, exact CSP, and launch event.

### Checkpoint A

- [ ] Core and Browser focused tests pass.
- [ ] Browser production build passes.
- [ ] Fake-ingestion payload contains only allowlisted data.
- [ ] Development/E2E/missing-config builds initialize no remote SDK.

## Phase 2: Shared semantic events

- [ ] T05 Emit ready, import-completed, and workspace-started events from semantic completion points.
- [ ] T06 Emit first real Viewer playback and actually presented Application Issue events once per scope.

### Checkpoint B

- [ ] Shared event cardinality tests pass under React StrictMode.
- [ ] Shared code imports no PostHog package or global.
- [ ] Viewer and application focused tests and typecheck pass.

## Phase 3: Desktop identity and Bridge

- [ ] T07 Add strict Desktop telemetry handshake/capability/preference Bridge contracts and tests.
- [ ] T08 Add Main-owned telemetry state, atomic persistence, identity, and handler.
- [ ] T09 Compose bundled Renderer and Main PostHog adapters with one shared identity/session.
- [ ] T10a Update the finalized Zod Bridge version, generated manifest, JSON fixtures, and TypeScript tests.
- [ ] T10b Update iPad Swift runtime version owners and focused runtime tests.
- [ ] T10c Update remaining iPad fixture literals and run complete Bridge/iPad verification.

### Checkpoint C

- [ ] Desktop Main and Renderer count as one Installation/Application Session.
- [ ] Desktop Bridge and build pass.
- [ ] iPad remains telemetry-free and `pnpm ipad:verify` passes.
- [ ] Packaged Renderer loads only local code and allows only the exact ingestion origin.

## Phase 4: User control and error capture

- [ ] T11 Deliver the accessible bilingual first-run notice.
- [ ] T12 Deliver the global privacy/diagnostics setting and identity reset lifecycle.
- [ ] T13 Capture and deduplicate sanitized Browser/Renderer JavaScript errors.
- [ ] T14 Capture sanitized Main errors and allowlisted Renderer runtime failures.

### Checkpoint D

- [ ] First-run and settings flows pass in `zh-CN` and `en-US`.
- [ ] Opt-out produces zero subsequent fake-ingestion requests.
- [ ] Sensitive synthetic exceptions are sanitized or dropped in all runtimes.
- [ ] `pnpm check:i18n` and `pnpm verify:fast` pass.

## Phase 5: Release and durable truth

- [ ] T15 Add release/build identity, CI source-map upload, artifact removal, and package guards.
- [ ] T16 Complete Browser/Desktop fake-ingestion E2E, PostHog US smoke, dashboard, privacy URL, and access/retention gates.
- [ ] T17 Promote verified behavior to a Current Feature Contract and architecture/ADR docs, then delete this task bundle.

## Definition of Done

- [ ] All task acceptance criteria are met with final-scope evidence.
- [ ] `pnpm verify:fast`
- [ ] `pnpm verify`
- [ ] `pnpm verify:e2e`
- [ ] `pnpm ipad:verify`
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `git status --short` confirms only intended changes.
- [ ] Manual packaged Desktop and deployed Browser PostHog US smoke pass.
- [ ] Public privacy URL and PostHog retention/access owner are recorded.
- [ ] Durable outcomes are promoted before `tasks/anonymous-telemetry/` is deleted.
