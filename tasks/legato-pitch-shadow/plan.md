# LEGATO 源谱音高纠错生产接入

目标与验收以 [Spec](../../docs/specs/2026-09-15-legato-pitch-shadow.md) 为准。

## 切片

1. 先写源几何提取与只读建议的失败测试，再实现无历史依赖的提取器和保守对应。
2. 接入 `recognize --pitch-shadow-python <python>`，验证默认不变、失败隔离、取消及 artifact hashes。
3. 检查真实 PDF 的提取覆盖，更新 CLI 文档和 Feature Contract，运行最小测试与 `pnpm verify:fast`。

## 当前目标（2026-09-16）

完成生产识别流程接入，不以“默认关闭的报告”“测试通过”或“真实谱全部拒绝”作为完成条件。
上一轮已验证旁路接线。本轮起继续沿同一条线推进，不训练模型，不增加节奏修正或补漏。

用户再次批准“先接入生产”，按现有保守规则受控启用，不继续扩展解析器。两批独立准入失败保持原结论，
不作为本轮代码接入的阻断条件，也不计作独立收益或零回归。

1. 测试先行：Desktop 与 Remote 使用共享生产 registry，默认启用，环境变量 `0` 关闭；CLI 与 benchmark 不变。
2. 验证默认修正、关闭、不支持输入、提取失败、回退、取消及证据保留；通过 Desktop runtime 回放真实开发谱。
3. 运行相关测试、完整构建与打包 smoke；更新 Feature Contracts、PR 和执行证据，区分代码交付与发布。

## Completion evidence

- Source extraction and correction MUST run from the current input, without historical reports, ground truth, or manual endpoints.
- Qualified inputs MUST exercise actual corrections through the production path; a report-only sidecar is insufficient.
- Raw artifacts MUST remain immutable. Every applied change MUST be source-bound and pass structural/export validation.
- Frozen independent evaluation failures MUST remain unchanged and MUST NOT be presented as positive or zero-regression evidence.
- Desktop and Remote entry points, packaged resources, fallback and cancellation MUST have direct verification.
- Default activation MUST be limited to the verified input scope; unsupported inputs MUST retain normal recognition.
- Completion MUST distinguish repository integration, PR delivery, and actual release/deployment state.
