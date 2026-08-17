# Library import / export / delete (Desktop)

When: visually walk Desktop Library import, native export, or deletion with a real fixture.
Do not use if: the outcome is already asserted — `opens MusicXML and MXL…`, `uses the bundled sample…` in `apps/desktop-shell/e2e/desktop.spec.ts`.
Product behavior: `docs/features/contracts/sheet-library.md`.

## Preconditions

- Isolated userdata, `localePreference: "en-US"`.
- Fixture (pick one):
  - GP: `test-fixtures/gp/generated/desktop-acceptance.gp` (title 桌面验收谱)
  - MusicXML: `test-fixtures/musicxml/generated/single-voice.musicxml`
  - Bundled sample: no mock; use `Use sample Cannon in D`

## Host notes

- Native picker: `mockOpen` then `import-score-picker`. One-shot — re-mock before a second import.
- Native export: `mockSave` then the Export menuitem.
- Renderer never sees absolute paths; do not `eval` for paths.

## Steps — import a GP file

```json
{"action":"clickRole","role":"link","name":"Library","exact":true}
{"action":"waitText","text":"Score Library"}
{"action":"clickRole","role":"button","name":"Import score","exact":true}
{"action":"mockOpen","path":"<repo>/test-fixtures/gp/generated/desktop-acceptance.gp"}
{"action":"clickTestId","testId":"import-score-picker"}
{"action":"clickTestId","testId":"import-score-submit"}
{"action":"waitText","text":"桌面验收谱"}
{"action":"hash"}
{"action":"shot","name":"library-imported-viewer"}
```

Empty-library primary action is `Import your own scores` instead of `Import score`.

## Steps — export and delete the bundled sample

```json
{"action":"clickRole","role":"link","name":"Library","exact":true}
{"action":"clickRole","role":"button","name":"Import your own scores","exact":true}
{"action":"clickRole","role":"button","name":"Use sample Cannon in D","exact":true}
{"action":"clickRole","role":"button","name":"Import 1","exact":true}
{"action":"waitText","text":"Cannon in D"}
{"action":"clickRole","role":"link","name":"Library","exact":true}
{"action":"clickRole","role":"button","name":"More actions for Cannon in D","exact":true}
{"action":"mockSave","path":"<workdir>/userdata/cannon-in-d.mxl"}
{"action":"clickRole","role":"menuitem","name":"Export Cannon in D","exact":true}
{"action":"clickRole","role":"button","name":"More actions for Cannon in D","exact":true}
{"action":"clickRole","role":"menuitem","name":"Delete Cannon in D","exact":true}
{"action":"clickRole","role":"button","name":"Delete permanently","exact":true}
```

## Expected

- Single successful import navigates to `#/viewer/<libraryScoreId>` (UUID).
- Export writes a non-empty file at the mocked save path.
- After delete, the score is gone; re-importing the sample yields a new `libraryScoreId`.

## On failure

- `bodyText` + `hash` + `shots/fail-*.png`.
- If the picker click no-ops, the mock was missing or already consumed.
