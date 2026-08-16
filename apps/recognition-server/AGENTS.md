# Recognition Server context

## Scope

- Own HTTP/SSE, SQLite Job/Attempt history, the single FIFO worker, S3-compatible object lifecycle, and reconciliation.
- Call `@zupulse/pdf-omr-cli` through its programmatic API; do not duplicate recognition, validation, or export logic.
- Keep this service independent from Sheet Library, React, Electron, accounts, CORS, and engine configuration UI.

## Invariants

- Run exactly one worker. Preserve queued work across restart and mark abandoned running/cancelling Attempts `interrupted`.
- Keep `uploading` and `deleting` as explicit cross-store transitions. Publish `succeeded` only after MXL and manifest storage plus SHA-256 read-back verification.
- Treat HTTP, persisted JSON, object bytes, filenames, IDs, and environment configuration as untrusted. Validate at their boundary.
- Never expose credentials, absolute paths, object keys, raw exceptions, stdout, or stderr through HTTP/SSE.
- Keep input objects immutable after queueing. Retry creates a new Attempt under the same Job and reuses the verified input.
- Retention and manual deletion must converge through reconciliation; never delete active queued/running work.
- Do not add an ORM, broker, distributed lock, second worker, or provider abstraction without a current requirement.

## Read before editing

- Protocol or lifecycle: `src/http-server.ts`, `src/recognition-service.ts`, `src/job-store.ts`, and adjacent tests.
- Worker or result publication: `src/recognition-worker.ts`, `src/s3-object-store.ts`, and `@zupulse/pdf-omr-cli/pipeline`.
- Shared payloads: `../../packages/web-core/src/recognition/schemas.ts`.
- Current behavior: `../../docs/features/contracts/remote-pdf-omr-service.md`.

## Configuration and verification

- Local configuration lives in `.env`; commit only `.env.example` and never credentials.
- Smallest check: `pnpm --filter @zupulse/recognition-server test`.
- Type check: `pnpm --filter @zupulse/recognition-server typecheck`.
- Before handoff, also run `pnpm format:check` and `git diff --check`.
