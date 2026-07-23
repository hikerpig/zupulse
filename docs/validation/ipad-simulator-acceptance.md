# iPad Simulator Acceptance

## Status

- Date: 2026-07-24
- Simulator: iPad Pro 11-inch (M5), iOS 26.2
- Simulator result: passed
- Physical device: not-run-on-device
- Physical-device target: 11-inch iPad Pro (M5), iPadOS 26.5.2
- Blocker: Personal Team is not configured yet

The Simulator result is not presented as physical-device evidence. Task 27 remains open until the
Personal Team is available and the device checklist is executed.

## Reproducible commands

```sh
pnpm ipad:web:dev --help
pnpm ipad:web:build
pnpm ipad:build
pnpm ipad:test
pnpm ipad:verify
```

`ipad:verify` checks the generated Bridge contract for drift, builds and hashes the bundled Web
assets, enforces Release CSP/code boundaries, then runs serialized Swift and UI tests on the named
Simulator. A successful run writes `apps/ipad-shell/dist/ipad-validation-summary.json`; this
generated file separately reports Simulator passes and `not-run-on-device`.

## Latest evidence

The latest completed run covered:

- Bridge contract generation and checked-in manifest drift
- bundled resource presence, MIME handling and SHA-256 manifest integrity
- Release rejection of dev-server endpoints, remote executable code, unsafe CSP and debug flags
- Swift unit tests
- import, persistence, recovery, zoom, gesture arbitration and batch-import Simulator UI tests

Device-only audio stability, memory pressure, performance percentiles and iPadOS 26.5.2 behavior
remain explicitly unverified here.
