# desktop-shell context

## 信任边界

- Main 拥有文件系统、SQLite、托管文件、窗口和应用生命周期。
- Preload 只暴露 `request` / `subscribe`，不得把 Electron 或通用 IPC 暴露给 Renderer。
- Renderer 是 Web 环境，只消费公开的 `web-core` / `web-viewer` API，不得导入 `node:*`、Main 模块或获得绝对路径。
- 所有 IPC request、response 和 event 都经过版本化 Zod schema 精确校验。

## Bridge 变更清单

- request schema、response schema、类型映射、capability。
- Preload 暴露面、Main handler、Renderer adapter。
- schema 单测、dispatcher 单测和必要的 E2E 用户旅程。

参考：`src/preload.ts`、`src/main/bridge.ts`、`src/renderer.ts`、`e2e/desktop.spec.ts`。
最小验证：`pnpm desktop:build`；端到端：`pnpm desktop:test:e2e`。
