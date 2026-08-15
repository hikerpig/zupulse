---
status: accepted
---

# 公开分发构建允许可退出匿名遥测

## Context

Zupulse 需要知道匿名安装量、核心功能使用情况和 JavaScript/runtime failures，才能判断发布质量与
优先级。当前 [ADR 0029](./0029-keep-internal-build-telemetry-free.md) 规定 Internal Acceptance
与 Development 构建完全不上传遥测；该边界不应因公开发布需求而被绕过。

项目没有账户系统，因此“用户数”只能以 `Anonymous Installation`（每次安装生成的随机 UUID）和
`Application Session` 估算，不能声称是真实人数。数据处理必须默认关闭任何高风险采集能力：不启用
autocapture、session replay、DOM/文本采集，也不发送谱内容、文件名、路径、URL query/fragment 或
原始异常对象。

## Decision

1. 仅 `alpha`、`beta`、`production` release channel 启用遥测；`development` 与
   `internal-acceptance` 返回 No-op provider。内部 dogfood 使用 `alpha` channel。
2. 首次启动显示中英双语的匿名遥测告知。默认启用，用户可在 Settings > Privacy & Diagnostics
   关闭；关闭后立即停止发送并清除本地 provider queue。产品不得阻塞核心功能。
3. Provider 固定为 PostHog Cloud US。产品代码只依赖 provider-neutral `TelemetryPort`；Browser
   与 Desktop Renderer 只提交白名单 semantic events，Desktop Main 负责一次性安装身份、偏好读取和
   provider queue 生命周期。
4. 只记录聚合所需的稳定字段：版本、平台、locale、release channel、surface、score format、
   outcome、稳定 issue code、duration bucket 和受限 error fingerprint。任何事件 schema 之外的
   字段必须被拒绝。
5. 异常只允许经过 sanitizer 的 `name/message/stack/fingerprint`；stack 限制 50 帧、单帧 256 字符，
   message 限制 512 字符。URL query/fragment、路径、UUID、hash、token/credential 和未知对象字段必须
   脱敏或丢弃。每类异常每安装每小时最多 20 条，provider 失败不得影响产品功能。
6. `runtime_failure_observed` 用于记录可观察的 Renderer/Main runtime failure reason；不上传
   崩溃转储或用户文件。source maps 只在 release artifact 与受控错误平台上传。
7. iPad 保持现有 Bridge contract 与本地诊断行为，不接入本期遥测 provider；若将来接入，必须另行
   更新 iPad contract、隐私评审与本 ADR。

## Consequences

- 能以匿名安装和 session 估算 adoption，并按 core semantic events 建立最小漏斗。
- 默认遥测仍有隐私和合规责任；发布前必须确认公开 privacy notice URL、PostHog retention 和访问责任人。
- Provider-neutral port 使测试、No-op 构建和未来替换 provider 不需要改动领域代码。
- Desktop 需要维护 Main-owned preference/identity 与新的 telemetry Bridge capability；Bridge schema
  必须严格同步 Desktop 三端，iPad 不得被静默升级。

## Links

- [Anonymous Product Telemetry and Error Tracking Spec](../specs/2026-08-08-anonymous-product-telemetry-and-error-tracking.md)
- [Internal Acceptance Build remains telemetry-free](./0029-keep-internal-build-telemetry-free.md)
