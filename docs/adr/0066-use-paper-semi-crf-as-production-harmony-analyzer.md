---
status: accepted
---

# Use the paper-compatible Semi-CRF as the production harmony analyzer

Zupulse 使用 paper-compatible Semi-CRF 作为 Harmony Studio 与默认 CLI evaluation 的生产分析入口。
模型以 basic events 为 observation，使用冻结的完整 label inventory、论文特征族、chord bigram 和
exact semi-Markov Viterbi；随应用发布的 Mozart train-only 模型 SHA-256 为
`6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515`。

Semi-CRF path 决定 primary chord 与 boundary。现有规则候选仅在已冻结的 Semi-CRF range 上提供
Top-8 alternatives 和拒识 confidence；CRF path score 不作为 confidence。旧
`analyzeHarmonyRules` 保留为显式 legacy baseline 和实验参数路径，但不再是 Studio 或默认评估入口。

该替换保持 `HarmonyAnalysisInput`、`HarmonySegment`、Revision、Correction、Repository、来源和弦
优先级和 MusicXML export contract 不变。Revision 的 `algorithmVersion` 包含模型 SHA，模型解析失败
必须明确失败，不能静默回退规则分析。

K331-3 隔离 eval 证明替换提升未拒识 primary accuracy 和时长准确率，但当前整曲
`K331-3_reviewed.mxl` 在开发机上仍需约 28 秒，超过原 5 秒目标。该性能差距作为明确的当前风险接受，
后续优化必须保持 exact decoder 与论文特征语义；不得通过 Top-K label pruning、beam search 或
静默回退恢复预算。

本决策取代 ADR 0065 中“规则边界 + MLP primary 是生产默认”的部分。ADR 0053 的规则 ranker 继续只
用于 alternatives/confidence adapter，不再决定生产 primary 或 boundary。
