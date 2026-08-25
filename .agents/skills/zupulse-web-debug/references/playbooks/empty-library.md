# Empty Library (Browser)

When: confirm a clean Browser session shows the empty Library and no Desktop-only PDF OMR entry.
Do not use if: only the automated assertion matters — `does not expose the Desktop-only PDF OMR route…` and empty-state coverage in `apps/web-demo/e2e/library.spec.ts`.
Product behavior: `docs/features/contracts/sheet-library.md`.
Host facts: `apps/web-demo/AGENTS.md`.

## Preconditions

- `pnpm demo:dev` reachable at `http://127.0.0.1:5173`.
- Driver workdir under `tmp-run/<slug>/`.
- Start from a clean profile or run `clearSiteData` first.

## Host notes

- Locale default is zh-CN. Heading is `曲谱库`, empty CTA is `导入自己的曲谱`.
- Clearing only localStorage leaves Library scores in IndexedDB `zupulse-library`.

## Steps

```json
{"action":"clearSiteData"}
{"action":"seedLocale","locale":"zh-CN"}
{"action":"viewport","width":1280,"height":720}
{"action":"nav","hash":"/library"}
{"action":"waitText","text":"曲谱库"}
{"action":"bodyText"}
{"action":"shot","name":"empty-library-desktop"}
{"action":"viewport","width":390,"height":844}
{"action":"shot","name":"empty-library-narrow"}
{"action":"nav","hash":"/pdf-omr"}
{"action":"bodyText"}
```

## Expected

- Library empty copy mentions scores stay on this device; primary action `导入自己的曲谱` is visible.
- `bodyText` after `#/pdf-omr` does **not** contain `PDF 识谱` as a workbench heading/nav entry.
- Narrow viewport shot has no horizontal page overflow (spot-check with `eval` on `document.documentElement.scrollWidth <= innerWidth` if needed).

## On failure

- `shots/fail-*.png` and `bodyText`.
- If Library still lists scores, `clearSiteData` did not complete — restart the driver on a fresh `tmp-run/<slug>/`.
