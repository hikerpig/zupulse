# PDF OMR happy path (Desktop)

When: drive a real local engine through stages → preview → native MXL export.
Do not use if: only the packaged UI contract matters — that is `runs the packaged PDF OMR path…` in `apps/desktop-shell/e2e/desktop.spec.ts` (fake Audiveris).
Product behavior: `docs/features/contracts/desktop-pdf-omr-workbench.md`.
Host facts and known-good fixture: `apps/desktop-shell/AGENTS.md`.

## Preconditions

- `pnpm desktop:build` done; driver not started yet.
- Seed `userdata/preferences.json` with `localePreference: "en-US"`.
- Seed `userdata/recognition-providers/<provider>.json` from `src/main/recognition/provider-configuration-store.ts`. Point fields at provisioned files under `~/.cache/zupulse-rokot` or `~/.cache/zupulse-legato`. Missing engines show as unavailable — that is expected; stop rather than guessing paths.
- Fixture: `tools/pdf-omr-cli/corpus/evaluation/melody-clean.pdf` (~1 min when the engine is healthy).

## Host notes

- `mockOpen` / `mockSave` are one-shot. Re-mock before every dialog.
- If a replace-confirm appears, `eval` `window.confirm = () => true` first.
- Job may exceed one shell timeout; use `waitText` with `__timeout` ≥ 180000.

## Steps

```json
{"action":"nav","hash":"/pdf-omr"}
{"action":"waitText","text":"PDF recognition"}
{"action":"mockOpen","path":"<repo>/tools/pdf-omr-cli/corpus/evaluation/melody-clean.pdf"}
{"action":"clickRole","role":"button","name":"Choose PDF or image","exact":true}
{"action":"waitText","text":"melody-clean.pdf"}
{"action":"clickRole","role":"button","name":"Start extraction","exact":true}
{"action":"waitText","text":"MXL ready","timeoutMs":180000,"__timeout":240000}
{"action":"clickRole","role":"tab","name":"Extracted score","exact":true}
{"action":"waitText","text":"Extracted score preview is ready"}
{"action":"mockSave","path":"<workdir>/userdata/extracted-score.mxl"}
{"action":"clickRole","role":"button","name":"Export MXL","exact":true}
{"action":"waitText","text":"MXL exported"}
{"action":"shot","name":"pdf-omr-exported"}
```

## Expected

- `bodyText` contains `MXL ready` then `MXL exported`.
- `<workdir>/userdata/extracted-score.mxl` is non-empty.
- Library is unchanged (empty library still shows the empty-state copy). Result is not a Library Score.

## On failure

- `shots/fail-*.png` and `bodyText`.
- `<workdir>/userdata/pdf-omr/<jobId>/output/` (see AGENTS.md).
- Main log / `desktop.log` under userdata. Do not use `tools/pdf-omr-cli` to re-run scanned or JBig2 PDFs.
