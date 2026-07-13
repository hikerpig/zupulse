# web-core context

## 职责与禁止项

- 负责领域类型、Zod schema、导入/播放用例、Bridge 契约和宿主端口。
- 运行时代码不得依赖 React、React DOM、Electron、IndexedDB 或具体宿主实现。
- 跨边界数据先由 schema 校验，再进入领域逻辑；类型优先从 schema 推导。
- 公共消费者需要的符号从 `src/index.ts` 导出，禁止要求消费者深导入 `src`。

## 修改路径

1. 先读目标模块的 schema/types、现有测试和一个同类实现。
2. 行为变化先在相邻 `__tests__` 中写失败测试。
3. Bridge 变化同步检查 `bridge/schemas.ts`、类型映射、capability、mock、Desktop handler 和测试。
4. Library 语义变化必须让 Browser 与 Desktop 的共享 repository contract 同时通过。

参考：`src/bridge/schemas.ts` 展示严格 Bridge 边界；`src/library/importLibraryScores.ts`
展示用例只依赖端口。最小验证：`pnpm vitest run packages/web-core/src/<area>`。
