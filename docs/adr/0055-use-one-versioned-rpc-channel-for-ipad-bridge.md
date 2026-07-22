---
status: proposed
---

# Use one versioned RPC channel for the iPad Bridge

iPad App Shell 与共享 React 应用通过一个白名单化的双向 Bridge 通道通信，而不为文件、生命周期、
音频和未来持久化能力分别注册 WebKit handler。请求、响应和宿主事件使用统一的版本化 envelope；
请求与响应用 `correlationId` 配对，payload 和结构化错误必须在各自边界校验，未知方法、事件与协议
版本一律拒绝。

单一通道保持现有 Bridge API 的平台无关语义，集中处理超时、取消、迟到响应、错误映射和诊断，
也避免 Swift API 随能力增长而散落到 JavaScript 全局对象。代价是需要维护集中式路由器以及 Swift
与 TypeScript 之间的契约一致性；schema 事实源与跨语言验证方式由后续决策确定。

本决策为 iPad 重新确认通信模型，不恢复已被 ADR 0017 取代的 ADR 0010 Apple Shell 交付方案。
