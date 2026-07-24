---
status: accepted
---

# Keep Zod as the source for the iPad Bridge contract

`packages/web-core` 的 Zod schema 继续作为跨宿主 Bridge 请求、响应、事件与 capability 的唯一
事实源。构建从 Zod 生成传输中立的 contract manifest；首版 Swift `Codable` DTO 与严格校验逻辑
手写，并由同一批 valid/invalid JSON fixtures 在 TypeScript 和 Swift 两端验证。CI 同时检查 manifest
没有漂移、Swift 覆盖所有声明支持的 iPad 方法，并拒绝未知字段、未知方法、越界值和协议版本。

首版不引入或自研 Swift 代码生成器，因为现有 schema 含有 `Uint8Array` 等宿主内表达，必须先把
小型 JSON 控制面与二进制数据面分离。相比完全手写两份无关联契约，该方案保留可检查的共同事实源；
相比立即全自动生成，它避免生成“结构可编译但运行时约束不等价”的 Swift 类型。只有 Bridge 规模
或变更频率以实际数据证明手写 DTO 成为负担后，才为受支持的 schema 子集引入代码生成。

## Acceptance scope

2026-07-24 以 contract manifest 漂移检测、双端 valid/invalid fixtures 和 Swift 严格校验的自动化
门禁为依据接受。后续扩展 Bridge 仍必须同时更新 Zod schema、manifest、Swift DTO 与测试。
