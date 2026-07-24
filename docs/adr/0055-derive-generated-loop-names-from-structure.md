---
status: accepted
---

# Derive generated Loop names from structure

Zupulse 不把 generated Loop name 视为持久化文案事实。Practice Sidecar 保存 Loop 的结构化起止位置和 `labelSource`；当 `labelSource` 是 `generated` 时，Viewer 按当前 Effective Locale 从小节范围生成显示名，切换语言会重新显示，但不会改写 sidecar。用户主动命名的 Loop 使用 `labelSource: "user"`，其名称作为用户内容原样持久化且永不翻译。

旧 `0.2.0` sidecar 中已有的 generated label 继续通过 schema 兼容读取，但 UI 忽略它。更早的 `0.1.0` Loop 只有 tick，解码迁移时不再制造中文名称；PlaybackController 获得当前 timeline 后先按 tick 恢复有效的小节位置，再交给 UI 生成名称。该方案避免同一列表混合多种创建时语言，代价是任何展示 generated name 的消费者都必须持有 timeline 或已经恢复的结构化位置。
