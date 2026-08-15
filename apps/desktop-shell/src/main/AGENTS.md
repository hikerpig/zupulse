# Electron Main context

- 任何来自 Renderer、文件选择结果、磁盘或数据库的输入都视为不可信并重新校验。
- 外部文件通过一次性 token 读取；token 过期、一次消费和文件大小竞态必须保留测试。
- 托管文件与 SQLite 无法共享事务：保持 staging / ready / deleting 状态和启动 reconciliation。
- 删除顺序和故障恢复不得留下托管字节、馆藏记录、sidecar 或 resume 孤儿。
- Renderer 可见的错误和诊断不得包含绝对路径、原始异常对象或敏感环境数据。

修改持久化前阅读 `library/desktop-library-store.ts`、`library/reconcile.ts`、迁移和相邻故障测试；
修改 IPC 前阅读 `bridge/dispatcher.ts`、`bridge/server.ts` 与 `packages/web-core/src/bridge/schemas.ts`。
