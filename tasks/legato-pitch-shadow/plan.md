# LEGATO 源谱音高纠错生产接入

目标与验收以 [Spec](../../docs/specs/2026-09-15-legato-pitch-shadow.md) 为准。

## 切片

1. 先写源几何提取与只读建议的失败测试，再实现无历史依赖的提取器和保守对应。
2. 接入 `recognize --pitch-shadow-python <python>`，验证默认不变、失败隔离、取消及 artifact hashes。
3. 检查真实 PDF 的提取覆盖，更新 CLI 文档和 Feature Contract，运行最小测试与 `pnpm verify:fast`。

## 当前目标（2026-09-16）

完成生产识别流程接入，不以“默认关闭的报告”“测试通过”或“真实谱全部拒绝”作为完成条件。
上一轮已验证旁路接线。本轮起继续沿同一条线推进，不训练模型，不增加节奏修正或补漏。

1. 用源位置和字符语义修复真实 PDF 的错误拒绝，保留未知谱号、八度与对应歧义的保护。
2. 从原始 PDF 自动获得完整 written pitch 所需证据，只在唯一对应时生成修改；原始 Draft 和修改清单必须保留。
3. 冻结独立作品、配置和验收协议；比较原始输出与候选，记录错误修改和整曲指标，再决定默认准入范围。
4. 接入共享 LEGATO 运行时及 Desktop/Remote 配置和打包路径，复用已配置 Python，失败回退原识别结果。
5. 验证真实输入到应用结果的端到端路径、默认/禁用/不支持输入、取消及导出，更新契约和 PR。

## Completion evidence

- Source extraction and correction MUST run from the current input, without historical reports, ground truth, or manual endpoints.
- Qualified inputs MUST exercise actual corrections through the production path; a report-only sidecar is insufficient.
- Raw artifacts MUST remain immutable. Every applied change MUST be source-bound and pass structural/export validation.
- Independent evaluation MUST show no loss of previously correct notes in its frozen scope, with positive correction evidence.
- Desktop and Remote entry points, packaged resources, fallback and cancellation MUST have direct verification.
- Default activation MUST be limited to the verified input scope; unsupported inputs MUST retain normal recognition.
- Completion MUST distinguish repository integration, PR delivery, and actual release/deployment state.
