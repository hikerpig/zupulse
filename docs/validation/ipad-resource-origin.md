# iPad Resource Origin Validation

## Decision

`zupulse://app` is the provisional iPad Web resource origin. The custom scheme passed the
Simulator capability matrix required before the import-to-Viewer vertical slice. Task 8's
`loadFileURL` fallback gate is therefore not triggered.

This is Simulator evidence only. The candidate remains provisional until the M5 device gate in
Task 27.

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

## Limits and follow-up

- Simulator results do not prove device audio stability, memory behavior or OS-version stability.
- Task 27 must rerun the capability matrix on the 11-inch M5 device before the resource-origin ADR
  can become accepted.
- A future WebKit regression that makes any hard capability fail reopens Task 8; it does not
  silently introduce a loopback server.
