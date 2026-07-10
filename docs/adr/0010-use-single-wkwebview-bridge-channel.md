---
status: superseded by ADR-0017
---

# WKWebView Bridge 使用单一双向消息通道

macOS Apple Shell 使用单一 `WKScriptMessageHandler` 接收 Web Core 请求，并通过固定的 JavaScript 接收入口向 Web Core 返回 RPC 响应和原生事件；所有消息沿用版本、类型、`correlationId` 和 payload 组成的统一 envelope。相比为每项原生能力注册独立 handler，这一方式保持现有 typed Bridge 的平台无关边界，避免 Swift 接口随文件、存储、同步和音频能力扩张而碎片化，但要求两端集中处理消息校验、路由和错误。
