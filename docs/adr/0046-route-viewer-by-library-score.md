---
status: accepted
---

# Route Viewer by Library Score

Viewer 保留现有 `/viewer/` 路由前缀，但将参数语义从临时 Viewer Session ID 改为持久化的 Library Score ID，即 `/viewer/:libraryScoreId`。刷新 Studio 页面或恢复该 URL 时，应用会从 Managed Score Copy 重新创建 Viewer Session 并恢复练习状态；已删除的馆藏项显示可返回 Sheet Library 的缺失状态。这取代 ADR 0039 中 URL 只在当前 Renderer 生命周期内有效的路由假设，但 Viewer Session 本身仍是不持久化的运行时对象。
