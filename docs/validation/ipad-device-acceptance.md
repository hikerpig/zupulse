# iPad Device Acceptance

## Gate status

- Status: in-progress — partial device evidence recorded
- Target device: 11-inch iPad Pro (M5)
- Target OS: iPadOS 26.5.2
- Signing prerequisite: Personal Team
- Simulator evidence: [ipad-simulator-acceptance.md](./ipad-simulator-acceptance.md)
- ADR 0058–0063 已于 2026-07-24 按个人原型架构范围接受；每项未完成设备质量门禁仍保持有效，且在
  正式产品化前必须完成，不得将 ADR 状态视为性能或长稳通过。

Record the Xcode version, app commit, build configuration and physical device OS before starting:

| Field               | Evidence                                      |
| ------------------- | --------------------------------------------- |
| Date                | 2026-07-24                                    |
| Git commit          | `1d0f06c`                                     |
| Xcode               | 26.3 (17C529)                                 |
| Device model        | 11-inch iPad Pro (M5)                         |
| iPadOS              | 26.5.2                                        |
| Build configuration | Debug Development，Personal Team `PS5VXB9FWN` |

## 1. Installation and resource origin

- [x] Install a Development build signed by the Personal Team without changing the bundle ID or
      enabling a dev-server URL.
- [ ] Cold launch succeeds offline and the visible Library loads from `zupulse://app`.
- [x] `isSecureContext` is `true`.
- [x] Web Crypto SHA-256 completes.
- [x] Dynamic module import completes.
- [x] Module Worker loads and replies.
- [x] AudioWorklet registers.
- [x] Bravura font and bundled SoundFont load from the app package.
- [ ] IndexedDB data survives process termination and device restart.
- [ ] Reinstall behavior is recorded separately; it must not be described as an in-place upgrade.

Attach the structured capability result and Xcode device log. Update
[ipad-resource-origin.md](./ipad-resource-origin.md) only after these checks pass.

Device command (passed):

```sh
xcodebuild -project apps/ipad-shell/Zupulse.xcodeproj -scheme Zupulse -configuration Debug \
  -destination 'id=00008142-001E15441E6B401C' \
  -derivedDataPath apps/ipad-shell/dist/DerivedData-DeviceTests \
  -allowProvisioningUpdates -parallel-testing-enabled NO test \
  -only-testing:ZupulseTests/ResourceSchemeTests
```

Manual confirmation on the same device: the Library appeared on launch; one selected score
imported and played; after app-process relaunch the score remained available and played; returning
to Library via the logo and reopening that same score also displayed and played correctly. The
selected score's format and offline condition were not recorded, and this is app-process relaunch
evidence only—not a device reboot result.

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
- [x] ADR 0058–0063 已与当前实现及已获得的自动化/真机证据复核，并按个人原型范围接受。

Final decision: **个人原型架构已接受；完整真机质量验收延期。**
