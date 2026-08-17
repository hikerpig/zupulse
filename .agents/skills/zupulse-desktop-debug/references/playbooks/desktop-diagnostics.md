# Desktop diagnostics export

When: confirm the native Help export writes a gzip JSONL snapshot without leaking the user-data path.
Do not use if: only the automated contract matters — `exports validated diagnostics from the native Help menu` in `apps/desktop-shell/e2e/desktop.spec.ts`.
Product behavior: `docs/features/contracts/desktop-diagnostics.md`.

## Preconditions

- Isolated userdata, `localePreference: "en-US"` (menu label path is Help → Export Diagnostic Information…).
- Driver running long enough that `APP_STARTED` has been recorded (true after a normal launch).

## Host notes

- This is a **native** menu. There is no Renderer button. Use `menuClick` with id `export-diagnostics` (see `src/main/shell/menu.ts`).
- `mockSave` is one-shot and must run **before** `menuClick`.
- Development-only “Open Diagnostics Folder” has no menu id; do not invent a click for it.

## Steps

```json
{"action":"mockSave","path":"<workdir>/userdata/diagnostics.jsonl.gz"}
{"action":"menuClick","id":"export-diagnostics"}
{"action":"wait","ms":1000}
```

Then read `<workdir>/userdata/diagnostics.jsonl.gz` from the shell (`gunzip -c` / Node). Do not parse it in the Renderer.

Cancel path: `{"action":"mockSave","canceled":true}` then the same `menuClick` — no file should appear.

## Expected

- File is non-empty gzip JSONL.
- At least one event has `code: "APP_STARTED"` and `source: "main"`.
- File contents must not contain the userdata absolute path.

## On failure

- If `menuClick` returns `menu item export-diagnostics not found`, the application menu did not install (locale/menu rebuild). Check `localePreference` and restart the driver.
- If no file: mock consumed by an earlier save dialog, or the user-facing export failed. `unmock` and retry once. Raw exceptions must not appear in the Renderer.
