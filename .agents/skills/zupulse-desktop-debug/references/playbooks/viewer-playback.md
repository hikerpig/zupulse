# Viewer playback (Desktop)

When: exercise Desktop Viewer transport, tempo, or loop after a Library import.
Do not use if: persistence/restore is the only question — that is `opens a GP file and restores persisted practice state` in `apps/desktop-shell/e2e/desktop.spec.ts`.
Product behavior: `docs/features/contracts/viewer-playback-navigation.md`.

## Preconditions

- Isolated userdata, `localePreference: "en-US"`.
- Import `test-fixtures/gp/generated/desktop-acceptance.gp` first (`library-import-export.md`). Heading: 桌面验收谱.

## Host notes

- Shared React Viewer; Desktop-specific part is import/seed, not the transport chrome.
- `Play` can take tens of seconds to enable after alphaTab load — `waitText` / click only after it is enabled.
- Speed trigger name is `Speed <n> BPM, <p>%`. Use `clickRole` `button` `Speed` with `exact` omitted (false).

## Steps

```json
{"action":"waitText","text":"桌面验收谱"}
{"action":"clickRole","role":"button","name":"Play","exact":true}
{"action":"shot","name":"viewer-playing"}
{"action":"clickRole","role":"button","name":"Speed"}
{"action":"fill","role":"spinbutton","name":"Speed BPM","value":"80","exact":true}
{"action":"press","key":"Tab"}
{"action":"clickRole","role":"button","name":"Practice settings","exact":true}
{"action":"clickRole","role":"button","name":"Set loop range"}
{"action":"waitText","text":"Set loop range"}
{"action":"selectOption","combobox":"Boundary snap","value":"off"}
{"action":"press","role":"slider","name":"Loop point B","key":"ArrowLeft"}
{"action":"clickRole","role":"button","name":"Save range","exact":true}
{"action":"shot","name":"viewer-loop-saved"}
```

`Set loop range` is a prefix match (`exact` omitted) because the e2e locator is `/Set loop range/`.

## Expected

- `Play` becomes enabled; `bodyText` still contains 桌面验收谱.
- After save, a `Loop name` textbox is present.
- Changing tempo/loop here is session + sidecar behavior; restart the driver on the same userdata to check restore (covered by e2e).

## On failure

- If `Play` never enables, dump `bodyText` and wait longer; do not treat a slow first render as a transport bug.
- Multiple `Speed` matches: `clickRole` will fail with a count — take `bodyText` and narrow `name`.
