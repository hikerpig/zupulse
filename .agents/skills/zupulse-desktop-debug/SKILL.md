---
name: zupulse-desktop-debug
description: Build, launch, and drive the Zupulse desktop-shell Electron app (apps/desktop-shell) for manual UI verification, bug reproduction, and UX audits — including PDF OMR (PDF 识谱) flows with real local engines. Use when a task requires opening the desktop app, selecting files through native dialogs, running PDF recognition, taking UI screenshots, or reproducing Desktop-only behavior. Do not use for Browser/iPad, unit tests, or journeys already covered by pnpm desktop:test:e2e unless investigating a failure those tests do not cover.
---

# Zupulse Desktop Debug

All paths below are relative to the repository root unless absolute.

Host facts (launch flags, userdata, native dialogs, engines, OMR fixtures): `apps/desktop-shell/AGENTS.md`.
Locators and deterministic journeys: `apps/desktop-shell/e2e/desktop.spec.ts`.
Product behavior: `docs/features/contracts/` (not this skill).

## When not to use

- Browser or iPad. This skill launches Electron only. For the Browser demo, use `zupulse-web-debug`.
- Unit tests, schema tests, or `pnpm desktop:test:e2e` journeys that already assert the same outcome.
- Reading code or Feature Contracts without driving the running app.

If a playbook's steps become stable assertions, add them to `e2e/desktop.spec.ts` and leave a one-line pointer here.

## Launch

1. `pnpm desktop:build`
2. Choose a workdir under `tmp-run/<slug>/` (e.g. `tmp-run/pdf-omr-happy-path/`). Put driver logs, `userdata/`, `shots/`, exports, and cmd/res files there. Do **not** use `tasks/` — that directory is for initiative execution state, not debug runs. `tmp-run/` is gitignored.
3. Seed `userdata/` **before** first launch (`apps/desktop-shell/AGENTS.md`). Default locale is `en-US` so e2e role names match.
4. Start the driver (OMR jobs run longer than a single shell call):

```bash
W="$(pwd)/tmp-run/<slug>"
mkdir -p "$W"
cd apps/desktop-shell
nohup node ../../.agents/skills/zupulse-desktop-debug/scripts/driver.mjs "$W" > "$W/driver.log" 2>&1 &
for i in $(seq 1 40); do [ -f "$W/driver.ready" ] && break; sleep 1; done
[ -f "$W/driver.ready" ] || { echo "driver failed to start"; cat "$W/driver.log"; exit 1; }
```

5. Send commands from `apps/desktop-shell`:

```bash
node ../../.agents/skills/zupulse-desktop-debug/scripts/cmd.mjs "$W" '{"action":"shot","name":"01-home"}'
```

6. Cleanup (always): `kill "$(cat "$W/driver.pid")"` then `pkill -f "user-data-dir=$W/userdata"`. Never leave Electron running.

`driver.mjs <workdir> [repoRoot]` — repoRoot defaults to the repository containing the skill. Ready signal is `$W/driver.ready` (not `driver.log`; file-redirected stdout may buffer). If `$W/driver.window-closed` appears, restart the driver; userdata persists.

## Commands

JSON actions via `cmd.mjs`. Optional `__timeout` ms on any command (default 240s wait for the result file). Click/fill/select fail when the locator matches 0 or 2+ nodes. Failed commands write `shots/fail-<id>.png` when the window is still open.

| Action                  | Fields                                                | Notes                                                                                               |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `shot` / `shotFull`     | `name`                                                | PNG under `$W/shots/`                                                                               |
| `nav`                   | `hash` (`/pdf-omr` or `#/pdf-omr`)                    | Waits until `location.hash` matches                                                                 |
| `clickRole`             | `role`, `name`, `exact?`                              | Unique match required                                                                               |
| `clickTestId`           | `testId`                                              | Unique match required                                                                               |
| `clickText`             | `text`, `exact?`                                      | Unique match required                                                                               |
| `selectOption`          | `combobox`, `value`                                   | Unique combobox                                                                                     |
| `fill`                  | `value`, plus `testId` **or** `role`+`name`, `exact?` | Unique match required                                                                               |
| `press`                 | `key`, optional `role`+`name`, `exact?`               | Page-level if no role                                                                               |
| `mockOpen`              | `path` or `paths`, or `canceled: true`                | **One-shot**; next dialog restores the original                                                     |
| `mockSave`              | `path`, or `canceled: true`                           | One-shot                                                                                            |
| `unmock`                |                                                       | Restore both dialogs now                                                                            |
| `menuClick`             | `id`                                                  | Native app menu (`export-diagnostics`)                                                              |
| `bodyText`              |                                                       | First 6000 chars; fastest UI assert                                                                 |
| `waitText` / `waitGone` | `text`, `exact?`, `timeoutMs?`                        | At least one match                                                                                  |
| `wait`                  | `ms`                                                  | Last resort                                                                                         |
| `eval`                  | `js`                                                  | Renderer only. `window.confirm` is auto-dismissed — override first: `"window.confirm = () => true"` |
| `hash`                  |                                                       | Full `page.url()`                                                                                   |

`mockOpen` **before** the select click; `mockSave` **before** export. Re-mock before every later dialog.

Playbook JSON is literal except `<repo>` (repository root) and `<workdir>` (the driver workdir).

## Playbooks

| When                                                           | File                                             |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Real-engine PDF OMR happy path (stages → preview → export MXL) | `references/playbooks/pdf-omr-happy-path.md`     |
| Known-bad PDF / artifact diagnosis                             | `references/playbooks/pdf-omr-engine-failure.md` |
| Library import, export, delete                                 | `references/playbooks/library-import-export.md`  |
| Viewer playback, tempo, loop                                   | `references/playbooks/viewer-playback.md`        |
| Native Help diagnostic export                                  | `references/playbooks/desktop-diagnostics.md`    |
