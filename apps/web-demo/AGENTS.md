# web-demo context

## 职责与禁止项

- 负责 Browser host、IndexedDB Repository、浏览器文件选择/导出和应用挂载。
- 不得把文件路径或 Browser 存储细节暴露给 `web-core` / `web-viewer`。
- Library Score、Managed Score Copy、sidecar 和 resume 的写删必须处于正确的 IndexedDB transaction。
- 以 `scoreIdentity` 唯一索引处理并发去重；版本升级被阻塞或失败时不得清空数据库。

## 验证

- Repository 行为必须通过与 Desktop 相同的 contract。
- Browser 关键旅程在真实 Chromium 中验证 IndexedDB、刷新恢复和删除语义。
- 参考：`../../packages/web-storage/src/indexed-db-sheet-library-repository.ts`、`src/main.ts`。
- 最小验证：`pnpm demo:build`；端到端：`pnpm demo:test:e2e`。

## 本地启动与 UI 复现

启动、Browser 存储和文件入口以本节为准。确定性回归跑 `pnpm demo:test:e2e`，locators 以
`e2e/library.spec.ts` 为准。探索性 UI 驱动、截图和 playbook 用
`.agents/skills/zupulse-web-debug/`。Desktop Electron 见 `../desktop-shell/AGENTS.md` 与
`zupulse-desktop-debug`。

- `pnpm demo:dev` 打开 `http://127.0.0.1:5173`（rspack 绑定 `127.0.0.1:5173`）。优先复用已在跑的
  进程，不要重复启动。
- Locale：`localStorage["zupulse-locale"]`（`zh-CN` | `en-US` | `system`）。自动化默认 `zh-CN`，与
  `playwright.config.ts` / `e2e/library.spec.ts` 的文案一致；验收英文 UI 时再切 `en-US`。
- Theme：`localStorage["zupulse-theme"]`（`light` | `dark`）。
- Library 持久化在 IndexedDB `zupulse-library`。清会话必须删除该库并刷新；只清 localStorage 不够。
- 文件导入走浏览器 filechooser / `<input type="file">` 或拖放 DataTransfer；也可使用内置样例
  Cannon in D。没有 Electron 原生对话框，不要 mock `dialog.showOpenDialog`。
- Browser **没有** PDF OMR：主导航不出现该入口，`#/pdf-omr` 不可用。
- 视口：窄屏验收用 `390×844`，桌面用 `1280×720`（与 e2e 一致）。
