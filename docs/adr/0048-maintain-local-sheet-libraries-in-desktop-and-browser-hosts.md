---
status: accepted
---

# Maintain local Sheet Libraries in Desktop and Browser hosts

Desktop Shell 与 Browser 都提供持久、离线可用的 Sheet Library，并共享同一套馆藏领域契约和 React 界面；Desktop Shell 使用应用数据目录中的托管文件与 SQLite，Browser 则使用 IndexedDB 保存馆藏索引、谱文件字节和练习数据。Browser 应尝试请求持久存储授权，但产品必须明确浏览器数据仍可能被用户或存储策略清理。MVP 不同时引入 OPFS；只在 IndexedDB 的实际容量或性能不足时再迁移大文件字节存储。
