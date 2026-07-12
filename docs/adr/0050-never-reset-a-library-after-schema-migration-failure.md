---
status: accepted
---

# Never reset a Sheet Library after schema migration failure

Desktop SQLite 与 Browser IndexedDB 都必须在馆藏操作前按明确版本顺序执行 schema 迁移；任何迁移失败都不得自动删除、重建或覆盖已有 Sheet Library。应用应阻止后续写入并显示本地曲谱库无法升级的错误，同时保留原数据供重试、诊断或后续恢复。Managed Score Copy 可能是用户仅存的原始谱文件，因此以数据丢失换取应用继续启动不可接受。
