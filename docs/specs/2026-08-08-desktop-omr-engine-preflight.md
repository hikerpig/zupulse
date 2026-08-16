---
status: implemented
date: 2026-08-08
owner: Engineering
scope: Desktop PDF OMR engine preflight and availability UX
parent: docs/features/contracts/desktop-pdf-omr-workbench.md
---

# Desktop 识谱 Engine 预检与可用性体验

## Objective

让识谱工作台在用户选择输入之前就呈现真实的本地 engine 可用状态。Desktop Main 对已知 engine 执行与识别管线
一致的 environment inspection，将真实版本或安全的语义失败原因写入 handshake；Renderer 禁用不可用 engine，解释
缺失条件，并只允许启动或重试已经通过预检且兼容当前输入的 engine。

macOS Desktop 在没有显式 `PDF_OMR_AUDIVERIS_EXECUTABLE` 时，依次检查用户级与系统级 Audiveris app bundle，最后
才回退到 `PATH`。Rokot 与 LEGATO 继续使用显式环境配置，不自动下载模型或修改用户环境。

## Commands

```bash
pnpm vitest run --root . apps/desktop-shell/src/main/__tests__/pdf-omr-engine-preflight.test.ts
pnpm vitest run --root . apps/desktop-shell/src/main/__tests__/bridge.test.ts packages/web-viewer/src/app/pages/__tests__/PdfOmrPage.test.tsx
pnpm desktop:build
pnpm verify:fast
pnpm format:check
git diff --check
```

## Project Structure

- `apps/desktop-shell/src/main/`: Audiveris discovery, engine preflight, shared runtime registry and handshake capabilities.
- `tools/pdf-omr-cli/src/`: public registry contract reused by Desktop; canonical environment inspection remains in adapters.
- `packages/web-core/src/bridge/`: strict, path-free engine availability payload.
- `packages/web-viewer/src/`: typed engine reasons and accessible status presentation.
- `packages/app-i18n/`: Chinese and English setup guidance.

## Code Style

```ts
const engine = await adapter.inspectEnvironment();
return { id, available: true, version: engine.version, inputKinds };
```

Use named exports, strict Zod, semantic reason codes, conditional spreads for optional fields and no Renderer-visible
absolute paths or raw exceptions.

## Testing Strategy

- Main unit tests prove explicit Audiveris configuration precedence, macOS app discovery and semantic preflight mapping.
- Runtime tests prove the inspected registry is the same registry used by recognition.
- Bridge tests prove handshake returns the supplied validated capability set.
- React tests prove unavailable engines are disabled, reasons are readable and an available compatible engine is selected.
- Desktop build and the existing fake-engine E2E guard the packaged path.

## Boundaries

- Always: run adapter inspection in Main; keep reasons bounded and path-free; revalidate again inside recognition.
- Ask first: settings UI, environment persistence, model/runtime download or third-party installation.
- Never: source `.zshrc`; expose absolute paths or stderr; mark an engine available without its inspection succeeding.

## Success Criteria

1. Handshake no longer advertises every known OMR engine as statically available.
2. Installed user-level or system-level macOS Audiveris is found without a shell environment variable.
3. Missing Rokot configuration is disabled before a job starts and displays actionable guidance.
4. Available engines expose their inspected version; unavailable engines expose only a bounded semantic reason.
5. Recognition uses the same registry configuration that passed preflight and still performs canonical inspection again.
6. When no compatible engine is available, the workbench clearly explains why and keeps Start/Retry disabled.

## Open Questions

None for this slice. Runtime installation and configuration management remain explicit non-goals.
