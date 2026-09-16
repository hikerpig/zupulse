---
status: approved
---

# LEGATO 音高旁路

## 目标与边界

把源谱支持的音高检查从历史探索链迁入独立 CLI 的真实识别路径。首个切片只输出自然音级差异建议，
不生成 corrected Draft，不改变默认识别、校验、导出或 Desktop 配置。它不承诺复现开发曲目的全部收益。

第一版使用显式指定的 Python 环境和既有 PyMuPDF 依赖，从本次输入副本提取向量几何及符头。
只支持可完整定位的双谱表、MScore/Leland 字符、明确的 G/F 谱号；不读取历史报告、参考答案或人工端点。
源小节与预测小节按完整顺序对应，数量不一致时整份报告不提建议，不按预测音高寻找对齐。

## First-slice acceptance criteria (historical scope)

- Shadow MUST be opt-in and LEGATO-only. Omission MUST preserve existing artifacts and parameters.
- Shadow MUST NOT mutate Draft, MXL, diagnostics, voices, durations, ties, or note counts.
- Every report MUST bind the input SHA-256, canonical Draft SHA-256, extractor SHA-256, and policy version.
  An unavailable extractor resource MUST use a null extractor hash and MUST NOT emit suggestions.
- Unsupported layout, ambiguous geometry, unknown notation, source curves, ties, tuplets, and ambiguous note
  correspondence MUST abstain. A missing or failed extractor MUST NOT fail otherwise successful recognition.
- Cancellation MUST remain cancellation, not an abstention or successful run.
- Suggestions MUST identify source page, system, staff, measure, coordinates, and the original event address.
- Suggested step/octave MUST NOT imply resolved accidentals, sounding MIDI, source timing, or writeback readiness.

## 后续准入

先验证原始 PDF 到旁路报告的自动闭环，再冻结未参与调参的独立曲目、原始识别配置、预算和验收协议。
评价必须同时报告建议覆盖、错误建议、原本正确音符受损及整曲严格匹配；测试通过不等于识别收益。
独立证据不足时保持默认关闭。节奏、补漏和模型训练不在范围内。

## 生产接入目标（2026-09-16 批准）

只读旁路是中间阶段，不是生产接入完成条件。后续需将具备完整源谱音高证据、唯一事件对应的修改接入
LEGATO 共享识别流程，并在验证通过的输入范围内默认启用。Desktop 和 Remote 复用各自已配置的 engine
Python 环境，不要求用户额外执行 CLI 或准备中间报告。不支持的输入保留正常识别结果。

- Production correction MUST retain original recognition artifacts and an input/Draft-bound change report.
- A correction MUST NOT infer alter or sounding MIDI from a diatonic-only suggestion. Ties, ambiguous notation,
  correspondence failures, and unsupported transposition MUST abstain.
- Source analysis failures MUST fall back to normal recognition; cancellation MUST remain terminal.
- Applied candidates MUST preserve timing, voice identity and note counts, and pass validation and export gates.
- Default activation MUST follow frozen independent evaluation and an actual production-path positive correction test.
- Report-only behavior MUST remain distinguishable from correction and MUST NOT be counted as production completion.
