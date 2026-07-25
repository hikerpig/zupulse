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
