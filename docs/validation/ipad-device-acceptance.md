# iPad Device Acceptance

## Gate status

- Status: not-run-on-device
- Target device: 11-inch iPad Pro (M5)
- Target OS: iPadOS 26.5.2
- Signing prerequisite: Personal Team
- Simulator evidence: [ipad-simulator-acceptance.md](./ipad-simulator-acceptance.md)
- Do not change ADR 0054–0059 to Accepted until every required item below passes.

Record the Xcode version, app commit, build configuration and physical device OS before starting:

| Field               | Evidence |
| ------------------- | -------- |
| Date                | pending  |
| Git commit          | pending  |
| Xcode               | pending  |
| Device model        | pending  |
| iPadOS              | pending  |
| Build configuration | pending  |

## 1. Installation and resource origin

- [ ] Install a Development build signed by the Personal Team without changing the bundle ID or
      enabling a dev-server URL.
- [ ] Cold launch succeeds offline and the visible Library loads from `zupulse://app`.
- [ ] `isSecureContext` is `true`.
- [ ] Web Crypto SHA-256 completes.
- [ ] Dynamic module import completes.
- [ ] Module Worker loads and replies.
- [ ] AudioWorklet registers.
- [ ] Bravura font and bundled SoundFont load from the app package.
- [ ] IndexedDB data survives process termination and device restart.
- [ ] Reinstall behavior is recorded separately; it must not be described as an in-place upgrade.

Attach the structured capability result and Xcode device log. Update
[ipad-resource-origin.md](./ipad-resource-origin.md) only after these checks pass.

## 2. Import, persistence and external open

- [ ] Import one GP file and one MusicXML/MXL file from Files.
- [ ] Reimport reports `existing` without creating a duplicate.
- [ ] Batch import reports one created, one existing and one failed item while remaining in Library.
- [ ] Cancel a batch with unstarted items; completed imports remain present.
- [ ] Use “Open in Zupulse” while cold and warm; each item is delivered exactly once.
- [ ] Terminate and relaunch; Library, playback resume and score zoom restore.

Record fixture names without copying their paths into diagnostics.

## 3. Touch, layout and lifecycle

- [ ] Portrait and landscape layouts remain usable.
- [ ] Split View at approximately 1/3, 1/2 and 2/3 widths remains usable.
- [ ] Score pinch zoom does not zoom the shell or seek playback.
- [ ] Vertical scroll and score tap seeking arbitrate correctly while paused and playing.
- [ ] Backgrounding pauses audio and persists state.
- [ ] Control Center, headphones and route-change interruptions pause consistently.
- [ ] A WebContent process replacement restores the active Viewer in a paused state.

Capture one screenshot for each orientation/Split View width and one screen recording of the
gesture arbitration sequence.

## 4. Stability and memory

- [ ] Play a representative score continuously for 20 minutes.
- [ ] During playback, background/foreground the app five times.
- [ ] Open and close 20 representative scores, including GP, MusicXML and MXL.
- [ ] Repeat the 20-score cycle a second time.
- [ ] Memory after the second cycle does not show monotonic unbounded growth.
- [ ] No audio engine, WebContent or app crash occurs.

Record the following values from Xcode Instruments or the Debug navigator:

| Sample                              | Resident memory |
| ----------------------------------- | --------------- |
| Cold Library                        | pending         |
| First score ready                   | pending         |
| After 20-score cycle                | pending         |
| After second 20-score cycle         | pending         |
| After returning to Library and idle | pending         |

If memory rises, retain the allocation/leak trace and return to the owning implementation task;
do not average the samples into a pass.

## 5. Performance thresholds

Use at least 20 cold samples for launch and audio readiness and at least 50 samples for interaction
feedback. Report P50 and P95; the gate is decided by P95.

| Metric                                  | Threshold | P50     | P95     | Result  |
| --------------------------------------- | --------- | ------- | ------- | ------- |
| Cold launch to usable first screen      | ≤ 3 s     | pending | pending | pending |
| Score open to audio ready               | ≤ 5 s     | pending | pending | pending |
| Core tap/transport interaction feedback | ≤ 100 ms  | pending | pending | pending |

- [ ] All three P95 values meet their thresholds.
- [ ] No failed or timed-out sample was removed from the calculation.
- [ ] Raw samples are attached alongside the summary.

## 6. Diagnostics and network boundary

- [ ] Trigger at least one lifecycle diagnostic and export it through “导出诊断”.
- [ ] Cancel one export and confirm the log set is unchanged.
- [ ] Exported JSONL contains only timestamp, stable code, duration and/or hash prefix.
- [ ] Export contains no path, token, fileName, metadata, score bytes, full hash or Bridge payload.
- [ ] Allowed HTTPS resources load.
- [ ] Non-allowlisted requests and unknown/file schemes fail.
- [ ] A user-clicked HTTPS link opens in Safari.
- [ ] Scripted top-level navigation and popup attempts remain blocked.

## 7. Final commands and decision

Run from the exact commit installed on the device:

```sh
pnpm ipad:verify
pnpm verify
pnpm verify:e2e
```

- [ ] All commands pass.
- [ ] Every device-only checkbox above is complete with evidence.
- [ ] Failures link back to the relevant implementation task.
- [ ] Only after the gate passes, review ADR 0054–0059 against the observed implementation.

Final decision: **pending — not-run-on-device**
