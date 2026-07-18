# File Naming

Use these conventions for new files and directories. Existing files do not need to be
renamed immediately; rename them separately from functional changes so that reviews and
Git history remain clear.

## Conventions

| Kind                          | Convention                           | Examples                                     |
| ----------------------------- | ------------------------------------ | -------------------------------------------- |
| Source modules                | `kebab-case.ts` or `kebab-case.tsx`  | `browser-host.ts`, `viewer-app.tsx`          |
| Unit and component tests      | `__tests__/<source-name>.test.ts(x)` | `__tests__/viewer-app.test.tsx`              |
| End-to-end tests              | `e2e/<scenario-name>.spec.ts`        | `e2e/sheet-library.spec.ts`                  |
| Directories                   | `kebab-case`                         | `desktop-shell`, `web-core`                  |
| Documentation                 | `kebab-case.md`                      | `musicxml-import-design.md`                  |
| Architecture Decision Records | `NNNN-kebab-case.md`                 | `0053-use-bundled-learned-harmony-ranker.md` |
| Scripts                       | `kebab-case.mjs`                     | `verify-assets.mjs`                          |
| Type declarations             | `kebab-case.d.ts`                    | `playback-assets.d.ts`                       |

Test names must use the same stem as the source module they cover. Use names that describe
the module's responsibility rather than its implementation details.

## Exceptions

- Keep filenames required or conventionally discovered by tools and platforms, such as
  `package.json`, `tsconfig.json`, `playwright.config.ts`, `index.html`, and `global.d.ts`.
- Keep established entry-point names such as `index.ts`, `main.ts`, `preload.ts`, and
  `renderer.ts` when they identify a platform or package entry point.
- Generated files, build artifacts, caches, fixtures that must preserve an external name,
  and third-party files are not governed by this convention.
- Tool-specific suffixes such as `.config.ts`, `.test.ts`, and `.spec.ts` take precedence
  over the general source-module pattern.

When an exception is not covered here, follow the naming convention of the owning tool or
the nearest existing files in the same subsystem.
