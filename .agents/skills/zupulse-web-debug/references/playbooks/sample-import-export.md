# Bundled sample import / export / delete (Browser)

When: walk Browser Library import of Cannon in D, export download, and delete.
Do not use if: the outcome is already asserted — `imports, reuses, exports, deletes, and re-adds the bundled sample…` in `apps/web-demo/e2e/library.spec.ts`.
Product behavior: `docs/features/contracts/sheet-library.md`.
Host facts: `apps/web-demo/AGENTS.md`.

## Preconditions

- Demo up; workdir under `tmp-run/<slug>/`.
- Prefer `clearSiteData` so the empty-library CTA is `导入自己的曲谱`.
- zh-CN locale (driver default).

## Host notes

- Bundled sample needs no `chooseFiles` — use `使用样例 Cannon in D`.
- For a real fixture instead, `chooseFiles` on `选择文件或拖放文件` with a repo path (see e2e `importFixture`).
- Export uses a browser download, not `mockSave`. Use `downloadClick`.

## Steps

```json
{"action":"clearSiteData"}
{"action":"seedLocale","locale":"zh-CN"}
{"action":"nav","hash":"/library"}
{"action":"waitText","text":"曲谱库"}
{"action":"clickRole","role":"button","name":"导入自己的曲谱","exact":true}
{"action":"clickRole","role":"button","name":"使用样例 Cannon in D","exact":true}
{"action":"clickRole","role":"button","name":"导入 1 份","exact":true}
{"action":"waitText","text":"Cannon in D"}
{"action":"hash"}
{"action":"shot","name":"sample-viewer"}
{"action":"clickRole","role":"link","name":"曲谱库","exact":true}
{"action":"clickRole","role":"button","name":"Cannon in D 的更多操作","exact":true}
{"action":"downloadClick","role":"menuitem","name":"导出 Cannon in D","exact":true,"saveAs":"cannon-in-d.mxl"}
{"action":"clickRole","role":"button","name":"Cannon in D 的更多操作","exact":true}
{"action":"clickRole","role":"menuitem","name":"删除 Cannon in D","exact":true}
{"action":"clickRole","role":"button","name":"永久删除","exact":true}
{"action":"waitText","text":"导入自己的曲谱"}
{"action":"shot","name":"sample-deleted"}
```

After a non-empty Library, the import CTA becomes `导入曲谱` (exact).

## Expected

- Single import navigates to `#/viewer/<libraryScoreId>` (UUID).
- `$W/downloads/cannon-in-d.mxl` is non-empty.
- After delete, empty-library CTA returns.

## On failure

- `bodyText` + `hash` + `shots/fail-*.png`.
- If export yields no file, the menu click missed or the download listener timed out — re-open the more-actions menu and retry `downloadClick` once.
