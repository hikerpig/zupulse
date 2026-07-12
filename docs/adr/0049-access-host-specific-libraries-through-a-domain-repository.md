---
status: accepted
---

# Access host-specific libraries through a domain repository

共享应用层只依赖 Sheet Library Repository 领域端口，Browser 和 Desktop Shell 分别提供 IndexedDB 与 Electron Bridge 后的具体实现。该端口使用查询 Library Score、导入、读取谱文件、修改 Library Metadata、收藏和彻底删除等领域语言，不提供通用 `get`/`put`、表查询或文件路径接口。外部文件选择与 Library Export 保存位置由独立的 Score File Gateway 宿主端口负责，不属于 Repository。这使应用不感知两个独立曲谱库的存储机制，并把“删除曲谱必须连同练习数据”之类原子领域语义保留在端口之后。

端口、运行时 schema 和不依赖 UI 的馆藏用例位于 `packages/web-core`，React 路由与功能组合位于 `packages/web-viewer`，IndexedDB 和 Electron Bridge/SQLite 适配器分别位于 `apps/web-demo` 与 `apps/desktop-shell`。不为曲谱库新增 workspace 包。

`web-core` 导入用例统一执行文件大小检查、格式探测、Score Identity 哈希、最小谱面解析和默认元数据提取；Repository 只原子保存已验证的馆藏草稿，并以 Score Identity 唯一约束处理并发去重。Desktop Bridge 仍必须验证请求 schema 与字节大小，但不重复实现谱面解析。
