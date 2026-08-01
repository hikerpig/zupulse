# MIDI Score Reviewed Writeback Development Report

本目录记录 `apply-fusion` 首次 development verification 的小型聚合证据。完整 fusion/writeback run 位于
本地临时目录，不提交 source score、MIDI 或大 artifacts。

K331 使用仓库 reviewed MXL 与由同谱导出的 MIDI，是 `derived-controlled` clean upper-bound。24 条 proposal
全部是 missing/extra，v1 均为 review-only；人工 reject 后 corrected score 与 source SHA 相同，runtime 和
before/after fusion gates 全部通过。

Flower Day 使用本地 Audiveris MXL 与 score-export MIDI，没有 reviewed MusicXML ground truth。83 条 proposal
中 76 条通过机械 writeback-ready gates，但这只证明 locator、repeat evidence、tie 和 transpose 条件满足，
不证明 alignment pairing 或 enharmonic spelling 在音乐上正确。视觉抽查不足以批准具体 pitch，因此全部保持
unreviewed；输出与 source SHA 相同，只报告结构安全与 fusion consistency。

真正的 pitch mutation 由 `apply-fusion-command.test.ts` 覆盖：一个 reviewed pitch correction 被应用，
corrected score 可 parse/view/playback，结构差异为零，pitch agreement 从 `0.75` 提升到 `1.0`。聚合数值见
`summary.json`。
