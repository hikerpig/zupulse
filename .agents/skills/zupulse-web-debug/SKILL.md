---
name: zupulse-web-debug
description: Start or reuse the Zupulse Browser demo (apps/web-demo on http://127.0.0.1:5173) and drive it for manual UI verification, bug reproduction, and UX audits. Use when a task requires opening the local web demo, exercising Library/Viewer/Studio in Chromium, checking IndexedDB persistence or refresh recovery, taking screenshots at desktop or narrow viewports, or Browser-only import/drag-drop behavior. Do not use for Desktop Electron, PDF OMR, unit tests, or journeys already covered by pnpm demo:test:e2e unless investigating a failure those tests do not cover.
---

# Zupulse Web Debug

All paths below are relative to the repository root unless absolute.

Host facts (demo:dev, locale, IndexedDB, file import, viewports): `apps/web-demo/AGENTS.md`.
Locators and deterministic journeys: `apps/web-demo/e2e/library.spec.ts`.
Product behavior: `docs/features/contracts/` (not this skill).
Desktop Electron: `zupulse-desktop-debug` — do not merge the two skills.

## When not to use

- Desktop shell, native dialogs, SQLite, recognition engines, or PDF OMR (Browser has no `#/pdf-omr`).
- Unit tests or `pnpm demo:test:e2e` journeys that already assert the same outcome.
- Reading code or Feature Contracts without driving the running app.

If a playbook's steps become stable assertions, add them to `e2e/library.spec.ts` and leave a one-line pointer here.

## Driving modes

1. **Playwright driver (default for repro / screenshots / IndexedDB).** Same JSON `cmd.mjs` pattern as desktop-debug; Chromium profile under the workdir.
2. **In-app browser tools (light walkthrough).** When the environment already exposes a browser against `http://127.0.0.1:5173`, reuse `pnpm demo:dev` and exercise the journey there. Still follow `apps/web-demo/AGENTS.md` for locale, clean session, and viewports. Prefer the driver when you need `clearSiteData`, `chooseFiles`, `dropFiles`, `downloadClick`, or durable `shots/` under `tmp-run/`.

## Launch (driver)

1. Ensure the demo is up: prefer an existing `pnpm demo:dev`. If nothing answers on 5173, start it in the background and leave it running for reuse (do not kill a shared demo on cleanup).
2. Choose a workdir under `tmp-run/<slug>/` (e.g. `tmp-run/web-sample-import/`). Put `browser-profile/`, `shots/`, `downloads/`, and cmd/res there. Do **not** use `tasks/`. `tmp-run/` is gitignored.
3. Start the driver (requires the demo already reachable):

```bash
W="$(pwd)/tmp-run/<slug>"
mkdir -p "$W"
# optional: WEB_DEBUG_LOCALE=zh-CN DEMO_URL=http://127.0.0.1:5173
nohup node .agents/skills/zupulse-web-debug/scripts/driver.mjs "$W" > "$W/driver.log" 2>&1 &
for i in $(seq 1 40); do [ -f "$W/driver.ready" ] && break; sleep 1; done
[ -f "$W/driver.ready" ] || { echo "driver failed to start"; cat "$W/driver.log"; exit 1; }
```

4. Send commands:

```bash
node .agents/skills/zupulse-web-debug/scripts/cmd.mjs "$W" '{"action":"nav","hash":"/library"}'
```

5. Cleanup (always): `kill "$(cat "$W/driver.pid")"`. Do **not** stop `demo:dev` unless this session started a dedicated server and the user wants it stopped.

`driver.mjs <workdir> [baseURL]` — baseURL defaults to `DEMO_URL` or `http://127.0.0.1:5173`. Chromium locale defaults to `WEB_DEBUG_LOCALE` or `zh-CN` (matches e2e copy). Ready signal is `$W/driver.ready`. Profile persists under `$W/browser-profile/` across driver restarts.

## Commands

JSON actions via `cmd.mjs`. Optional `__timeout` ms on any command (default 240s). Click/fill/select/`chooseFiles`/`dropFiles`/`downloadClick` fail when the locator matches 0 or 2+ nodes. Failed commands write `shots/fail-<id>.png` when the page is still open.

| Action                  | Fields                                                       | Notes                                      |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `shot` / `shotFull`     | `name`                                                       | PNG under `$W/shots/`                      |
| `nav`                   | `hash` (`/library` or `#/library`)                           | Waits until `location.hash` matches        |
| `goto`                  | `path` or `url`                                              | Full navigation                            |
| `reload`                |                                                              |                                            |
| `viewport`              | `width`, `height`                                            | e.g. 390×844 or 1280×720                   |
| `clickRole`             | `role`, `name`, `exact?`                                     | Unique match required                      |
| `clickTestId`           | `testId`                                                     | Unique match required                      |
| `clickText`             | `text`, `exact?`                                             | Unique match required                      |
| `selectOption`          | `combobox`, `value`                                          | Unique combobox                            |
| `fill`                  | `value`, plus `testId` **or** `role`+`name`, `exact?`        | Unique match required                      |
| `press`                 | `key`, optional `role`+`name`, `exact?`                      | Page-level if no role                      |
| `chooseFiles`           | `path` or `paths`, plus `testId` **or** `role`+`name`        | Clicks control, sets filechooser files     |
| `dropFiles`             | `files: [{path, name?}]`, plus `testId` **or** `role`+`name` | DataTransfer drop (Browser-only)           |
| `downloadClick`         | `saveAs?`, plus `testId` **or** `role`+`name`, `timeoutMs?`  | Click + save under `$W/downloads/`         |
| `seedLocale`            | `locale` (`zh-CN` \| `en-US` \| `system`)                    | Writes `zupulse-locale`, then reloads      |
| `seedTheme`             | `theme` (`light` \| `dark`)                                  | Writes `zupulse-theme`                     |
| `clearSiteData`         |                                                              | Clears storage + deletes `zupulse-library` |
| `bodyText`              |                                                              | First 6000 chars                           |
| `waitText` / `waitGone` | `text`, `exact?`, `timeoutMs?`                               | At least one match                         |
| `wait`                  | `ms`                                                         | Last resort                                |
| `eval`                  | `js`                                                         | Page JS                                    |
| `hash`                  |                                                              | Full `page.url()`                          |

Playbook JSON is literal except `<repo>` (repository root) and `<workdir>` (the driver workdir). Default UI copy is **zh-CN**.

## Playbooks

| When                                    | File                                           |
| --------------------------------------- | ---------------------------------------------- |
| Clean empty Library; no PDF OMR entry   | `references/playbooks/empty-library.md`        |
| Bundled sample import / export / delete | `references/playbooks/sample-import-export.md` |
