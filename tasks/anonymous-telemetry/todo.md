# Anonymous Product Telemetry and Error Tracking Tasks

Canonical plan: `tasks/anonymous-telemetry/plan.md`

## Phase 0: Decision

- [x] T01 Record the distribution telemetry ADR and preserve ADR 0029 for Internal Acceptance.

## Phase 1: Contract and Browser vertical slice

- [x] T02 Add strict telemetry schemas, `TelemetryPort`, No-op behavior, sanitizer, dedupe, and budgets.
- [x] T03 Add Browser identity/preference persistence and a fake-tested PostHog adapter.
- [x] T04 Compose the Browser distribution build, exact CSP, and launch event.

### Checkpoint A

- [x] Core and Browser focused tests pass.
- [x] Browser production build passes.
- [x] Fake-ingestion payload contains only allowlisted data.
- [x] Development/E2E/missing-config builds initialize no remote SDK.

## Phase 2: Shared semantic events

- [x] T05 Emit ready, import-completed, and workspace-started events from semantic completion points.
- [x] T06 Emit first real Viewer playback and actually presented Application Issue events once per scope.

### Checkpoint B

- [x] Shared event cardinality tests pass under React StrictMode.
- [x] Shared code imports no PostHog package or global.
- [x] Viewer and application focused tests and typecheck pass.

## Phase 3: Desktop identity and Bridge

- [x] T07 Add strict Desktop telemetry handshake/capability/preference Bridge contracts and tests.
- [x] T08 Add Main-owned telemetry state, atomic persistence, identity, and handler.
- [x] T09 Compose bundled Renderer and Main PostHog adapters with one shared identity/session.
- [x] T10a Update the finalized Zod Bridge version, generated manifest, JSON fixtures, and TypeScript tests.
- [x] T10b Keep iPad Swift runtime version owners telemetry-free and covered by focused runtime tests.
- [x] T10c Update remaining iPad fixture literals and run Bridge/iPad verification attempts.

### Checkpoint C

- [x] Desktop Main and Renderer count as one Installation/Application Session.
- [x] Desktop Bridge and build pass.
- [ ] iPad remains telemetry-free and `pnpm ipad:verify` passes.
- [ ] Packaged Renderer loads only local code and allows only the exact ingestion origin.

## Phase 4: User control and error capture

- [x] T11 Deliver the accessible bilingual first-run notice.
- [x] T12 Deliver the global privacy/diagnostics setting and identity reset lifecycle.
- [x] T13 Capture and deduplicate sanitized Browser/Renderer JavaScript errors.
- [x] T14 Capture sanitized Main errors and allowlisted Renderer runtime failures.

### Checkpoint D

- [x] First-run and settings flows pass in `zh-CN` and `en-US`.
- [x] Opt-out produces zero subsequent fake-ingestion requests.
- [x] Sensitive synthetic exceptions are sanitized or dropped in all runtimes.
- [x] `pnpm check:i18n` and `pnpm verify:fast` pass.

## Phase 5: Release and durable truth

- [ ] T15 Add release/build identity, CI source-map upload, artifact removal, and package guards.
  - [x] Build identity, opt-in source-map emission, Browser asset guard, and Desktop package `.map`/credential guards.
  - [ ] Connect the approved PostHog source-map uploader and make publishing conditional on upload success.
- [ ] T16 Complete Browser/Desktop fake-ingestion E2E, PostHog US smoke, dashboard, privacy URL, and access/retention gates.
  - [x] Browser and Desktop fake-ingestion E2E assert allowlisted payloads and stop after opt-out.
  - [ ] Run external PostHog US smoke and record dashboard, privacy URL, retention policy, and named access owner.
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
