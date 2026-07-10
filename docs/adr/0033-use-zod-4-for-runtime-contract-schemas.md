# 使用 Zod 4 定义运行时合约

`packages/web-core` 使用精确锁定版本的 Zod 4 定义 Bridge 与持久 payload 的运行时 schema，并从 schema 推导 TypeScript 类型；Main、Preload、Renderer 与 Browser Demo 复用同一实现。项目只使用 Zod 的基础 schema 能力，不再封装自有 schema DSL。该依赖以零外部依赖且同时支持 Node 与现代浏览器的单一实现，替代容易漂移的手写类型与 validator。
