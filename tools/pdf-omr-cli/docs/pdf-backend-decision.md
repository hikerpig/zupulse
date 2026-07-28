# PDF Backend Decision

## Status

- Status: accepted
- Date: 2026-07-28
- Scope: `tools/pdf-omr-cli` inspect/render and benchmark preprocessing

## Decision

Use `pdfjs-dist` as the CLI-owned PDF parser and renderer. Keep Poppler `pdfinfo` / `pdftoppm` as a development
comparison only; do not make an undeclared system executable part of the canonical CLI contract. Do not adopt
PyMuPDF.

## Reasons

1. PDF.js runs in the existing Node 22 toolchain, accepts `Uint8Array`, exposes page/operator information, and
   renders through its Node canvas factory.
2. The engine can inspect vector and raster operators without a Python or Java environment.
3. PDF.js is Apache-2.0. PyMuPDF/MuPDF requires AGPL compliance or a commercial license, which is unnecessary risk
   for this spike.
4. Poppler is useful as an independent rendering reference and is present in the current Codex runtime, but it is
   not guaranteed on contributor or CI machines. Treating it as the primary backend would make environment setup
   part of every CLI run.
5. The installed `pdfjs-dist@6.1.200` package is approximately 35.8 MB unpacked and requires Node
   `>=22.13.0 || >=24`; the repository currently runs Node 22.22.3 in the evaluated environment. Package size and
   Node support must be reconsidered before any future App integration.

## Spike protocol

The spike uses four upstream PDF.js fixtures pinned to revision
`1609bd87c5c2116e40664c49373fb3e65bbbc760` plus one intentionally malformed local fixture. The manifest records
SHA-256 values; upstream fixture bytes are not copied into this repository.

```bash
pnpm vite-node tools/pdf-omr-cli/spikes/pdf-backend.mts \
  /path/to/tracemonkey.pdf \
  /path/to/images.pdf \
  /path/to/empty_protected.pdf \
  /path/to/scan-bad.pdf \
  tools/pdf-omr-cli/spikes/fixtures/malformed.pdf
```

The comparison records:

- document and page loading;
- password/malformed failure classification;
- first-page vector and raster operator counts;
- first-page PNG rendering and hash;
- page dimensions and count.

Poppler comparison:

```bash
pdfinfo <input.pdf>
pdftoppm -f 1 -singlefile -png -r 72 <input.pdf> <output-prefix>
```

## Observed environment

| Candidate | Version / availability                                    | License                                                     | Result          |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------- | --------------- |
| PDF.js    | `pdfjs-dist@6.1.200`, Node 22.22.3                        | Apache-2.0                                                  | Selected        |
| Poppler   | `pdfinfo` / `pdftoppm` 26.05.0 in current runtime         | GPL-family executable distribution requires separate review | Comparison only |
| PyMuPDF   | npm `mupdf@1.28.0`; Python package not required for spike | AGPL-3.0-or-later or commercial                             | Rejected        |

## Observed results

`pdfjs-dist@6.1.200` loaded and rendered the four recoverable fixtures:

| Fixture               | Pages | First-page raster ops | First-page vector ops | PNG bytes |
| --------------------- | ----: | --------------------: | --------------------: | --------: |
| `tracemonkey.pdf`     |    14 |                     0 |                   151 |    24,287 |
| `images.pdf`          |     1 |                     5 |                    15 |    11,216 |
| `empty_protected.pdf` |     1 |                     0 |                     0 |       612 |
| `scan-bad.pdf`        |     1 |                     1 |                     1 |     1,141 |

The intentionally malformed fixture returned `InvalidPDFException: Invalid PDF structure`. The degraded scan
rendered with decoder warnings, which proves that warning capture must remain separate from success/failure.
`empty_protected.pdf` uses an empty password and therefore loads without a password callback; a non-empty password
exception is covered by Task 06's stable error-mapping test without committing protected document bytes.

The text-heavy fixture emitted a missing standard-font-data warning. The production inspect implementation must
provide the package `standard_fonts` path instead of accepting warning-dependent output.

## Boundaries

- This decision is for the CLI benchmark only.
- Vector/raster classification remains a benchmark feature, not a claim that PDF source structure is reliable OMR
  ground truth.
- `pdfjs-dist` MUST be loaded only by commands that inspect or render PDF; `--help`, Draft validation, Harmony
  analysis, and report inspection must not load it.
- Malformed or encrypted input must produce stable CLI error codes; raw PDF.js exceptions must not become
  canonical output.
- Future App work must make a new dependency, packaging, security, performance, and license decision.

## Sources

- PDF.js project and Node usage: <https://github.com/mozilla/pdf.js>
- PDF.js license: <https://github.com/mozilla/pdf.js/blob/master/LICENSE>
- PyMuPDF licensing: <https://pymupdf.readthedocs.io/en/latest/faq/index.html>
