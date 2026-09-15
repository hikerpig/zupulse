# LEGATO 音高旁路实施

目标与验收以 [Spec](../../docs/specs/2026-09-15-legato-pitch-shadow.md) 为准。

## 切片

1. 先写源几何提取与只读建议的失败测试，再实现无历史依赖的提取器和保守对应。
2. 接入 `recognize --pitch-shadow-python <python>`，验证默认不变、失败隔离、取消及 artifact hashes。
3. 检查真实 PDF 的提取覆盖，更新 CLI 文档和 Feature Contract，运行最小测试与 `pnpm verify:fast`。

## 下一阶段

独立曲目名单和 ground truth 尚未冻结；本轮不报告泛化收益，不自动改写或启用默认。
后续先检查原始 LEGATO 结果的几何对应拒绝原因，再决定是否扩展识别范围，不能以提高覆盖为由放宽安全条件。
