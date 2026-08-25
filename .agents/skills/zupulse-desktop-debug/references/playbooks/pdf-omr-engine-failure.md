# PDF OMR engine failure (Desktop)

When: reproduce a known recognize-stage failure and read artifacts the UI does not show.
Do not use if: you only need to confirm the workbench stays Desktop-only and does not mutate Library — that is `keeps PDF OMR Desktop-only…` in `apps/desktop-shell/e2e/desktop.spec.ts`.
Product behavior: `docs/features/contracts/desktop-pdf-omr-workbench.md`.
Known-bad inputs: `apps/desktop-shell/AGENTS.md`.

## Preconditions

Same seed as `pdf-omr-happy-path.md` (en-US + a **working** engine). Without an engine the page fails earlier as unavailable — that is not this playbook.

Pick one known-bad PDF from AGENTS.md:

- `test-fixtures/musicxml/K331-3_reviewed.pdf` (clean vector; still fails)
- `tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/**/input.pdf` (scanned)

Expected terminal: `ENGINE_OUTPUT_INVALID` (full-page staff-system segmentation). Evidence: `tools/pdf-omr-cli/src/__tests__/olimpic-full-page-corpus.test.ts`.

## Host notes

- One-shot `mockOpen` before Choose.
- Do not diagnose scanned PDFs through `tools/pdf-omr-cli` (JBig2 wasm in the dev layout). Use the desktop dist.

## Steps

```json
{"action":"nav","hash":"/pdf-omr"}
{"action":"waitText","text":"PDF recognition"}
{"action":"mockOpen","path":"<repo>/test-fixtures/musicxml/K331-3_reviewed.pdf"}
{"action":"clickRole","role":"button","name":"Choose PDF or image","exact":true}
{"action":"waitText","text":"K331-3_reviewed.pdf"}
{"action":"clickRole","role":"button","name":"Start extraction","exact":true}
{"action":"waitText","text":"ENGINE_OUTPUT_INVALID","timeoutMs":180000,"__timeout":240000}
{"action":"shot","name":"pdf-omr-engine-invalid"}
{"action":"bodyText"}
```

## Expected

- UI shows `ENGINE_OUTPUT_INVALID` (or the bounded reason the page surfaces). Extraction does not become `MXL ready`.
- Library still empty / unchanged.
- `userdata/pdf-omr/<jobId>/output/inspect/input.json` exists and has `pageCount` / dimensions.

## On failure

- If the job succeeds, the fixture or engine snapshot drifted — report that; do not treat it as a UI bug until artifacts agree.
- If the UI only says a generic failure, read `userdata/pdf-omr/<jobId>/output/` and Main / `desktop.log` before changing product code.
- Window closed: restart driver; job files under userdata remain.
