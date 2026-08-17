# LEGATO system-page development ablation

> Status: development evidence，完成于 2026-08-16。只覆盖三个 synthetic melody variants，不读取 holdout，
> 不改变既有 frozen decision 或 App gate。

full-page LEGATO 稳定把 8 个 measure 识别成 7 个。Rokot 在相同 manifest 上达到 8/8 measure；report-only
跨引擎 alignment 对三个 variant 都定位到 secondary measure index `4`，没有 alignment ambiguity。

2026-08-17 的 report-only candidate follow-up 将这三个唯一 alignment 分别物化为 Rokot-to-LEGATO
`insert` candidate，target/source measure index 都是 `4`。三个 variant 的规范化候选小节事实相同，candidate
SHA-256 均为 `a8b901074f9c4d983085d6dd14444556e0382c7a38bc2373f228c1962dd2befe`；comparison SHA-256
为 `4c35b76737e585023201b33dd4dad02e9133b23ad5d43e93e8422a36953de15c`。candidate 只用于人工复核，固定
`reviewRequired: true`、`autoApplicable: false`，没有修改任一 engine Draft。

development-only 模拟评分在内存中应用这三个候选，整体 Pitch/Onset/Duration/Joint F1 从
`0.8333 / 0.9333 / 0.9333 / 0.5333` 提升到 `1.0 / 1.0 / 1.0 / 1.0`，valid measure rate 从
`0.5` 提升到 `1.0`。evaluation SHA-256 为
`aeac78e68032abcfd84a723a331af348946834f39fbc019bdda70d1c175d39bb`。评分没有写出 simulated Draft；该
结果仍只是三个 synthetic variants 的 development upper bound。

将同一 PDF 用锁定的 `rokot-staff-system-v2` detector 物化为两个 system pages 后，LEGATO 恢复全部 8 个
measure，Joint F1 从 `0.5333` 提升到 `0.8333`，Pitch F1 从 `0.8333` 提升到 `0.9841`。但第二个 system
首 measure 的 duration 仍不稳定，两个 item 被 readiness 阻断，一个 ready-with-warnings。因此结论是
layout preprocessing 值得继续研究，但不能自动 promotion 或 writeback。

在相同 system pages 上启用 `legato-system-pages-context-v1` 后，runner 使用 LEGATO 自带的
`LegatoSegmentProcessor`，把上一页唯一且合法的 ABC `L/M/K` header 作为下一页 generation context。
每页 telemetry 记录 context prefix SHA-256，adapter 会根据上一页原始 ABC 重新计算并校验；`M:none`、缺失、
重复或 malformed fields 均不传播。该变体将 Pitch/Onset/Duration/Joint F1 提升到
`0.9895 / 0.9271 / 0.8542 / 0.8542`，valid measure rate 提升到 `0.8333`。两个 item 仍被 duration
readiness 阻断，因此只保留为 development optimization，不做 note token 后处理或自动修复。

结构化指标见 [`summary.json`](summary.json)。完整 benchmark runs、派生 PDF 和模型不进入 Git。
