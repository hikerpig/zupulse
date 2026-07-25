# iPad Resource Origin Validation

## Decision

`zupulse://app` is the provisional iPad Web resource origin. The custom scheme passed the
Simulator capability matrix required before the import-to-Viewer vertical slice. Task 8's
`loadFileURL` fallback gate is therefore not triggered.

Simulator evidence established the candidate before the first vertical slice. On 2026-07-24, the
same structured capability matrix also passed on the M5 physical device. The candidate remains
provisional for ADR purposes until every Task 27 gate—notably device reboot persistence, lifecycle,
touch, stability and performance—is complete.

## Environment

- Date: 2026-07-24
- Device: iPad Pro 11-inch (M5) Simulator
- Runtime: iOS 26.2
- Xcode: 26.3 (17C529)
- Entry origin: `zupulse://app`
- `isSecureContext`: `true`

## Automated evidence

Command:

```sh
pnpm ipad:test -- --only-testing ZupulseTests/ResourceSchemeTests
```

The structured Web probe and native request trace established:

| Capability         | Result  | Evidence                                                                                                                         |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Web Crypto         | success | SHA-256 digest completed                                                                                                         |
| dynamic `import()` | success | emitted module returned its marker                                                                                               |
| module Worker      | success | `/probes/resource-origin-worker.mjs` loaded and replied                                                                          |
| AudioWorklet       | success | `/probes/resource-origin-worklet.mjs` registered                                                                                 |
| IndexedDB          | success | the second WebView load read the existing marker as `persisted`; repeated Simulator test launches retained the same origin store |
| font               | success | `/alphatab/font/Bravura.woff2` returned non-empty bytes                                                                          |
| SoundFont          | success | `/alphatab/soundfont/sonivox.sf3` returned non-empty bytes                                                                       |

The resolver tests also reject an unexpected host, credentials, port, query, fragment, empty path,
decoded traversal, percent-encoded slash, backslash and symlink escape. Known HTML, JavaScript,
JSON, font, SVG and SoundFont types have explicit MIME mappings; unknown types fall back to
`application/octet-stream`.

## Physical-device evidence

- Date: 2026-07-24
- Device: 11-inch iPad Pro (M5), iPadOS 26.5.2
- Xcode: 26.3 (17C529)
- App commit: `1d0f06c`
- Build: Debug Development, Personal Team `PS5VXB9FWN`
- Entry origin: `zupulse://app`

The following command passed against the attached physical device:

```sh
xcodebuild -project apps/ipad-shell/Zupulse.xcodeproj -scheme Zupulse -configuration Debug \
  -destination 'id=00008142-001E15441E6B401C' \
  -derivedDataPath apps/ipad-shell/dist/DerivedData-DeviceTests \
  -allowProvisioningUpdates -parallel-testing-enabled NO test \
  -only-testing:ZupulseTests/ResourceSchemeTests
```

It executes the same structured probe and asserts `zupulse://app`, `isSecureContext`, Web Crypto,
dynamic import, Worker reply, AudioWorklet registration, bundled Bravura/SoundFont availability and
an IndexedDB marker read as `persisted` by a second WebView. This is repeated-WebView persistence;
device reboot persistence remains pending in the device acceptance record.

## Limits and follow-up

- The capability matrix now has M5 device evidence, but it does not prove device audio stability,
  memory behavior, lifecycle recovery or performance thresholds.
- Task 27 must complete its remaining device-only checks before the resource-origin ADR can become
  accepted.
- A future WebKit regression that makes any hard capability fail reopens Task 8; it does not
  silently introduce a loopback server.
