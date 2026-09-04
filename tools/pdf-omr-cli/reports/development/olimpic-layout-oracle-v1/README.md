# OLiMPiC layout topology oracle v1

本报告重新审计 2026-09-04 的 `compact-dilated-staff-line-cnn-v2` baseline。旧 admission 只比较 system
数量与 ordered center，未比较每个 system 的 `staffCount` 或 constituent staff 位置，因此 `9/29` 不是
topology-exact 结果。

`diagnostic-topology.json` 经 29 张 development render 人工复核，覆盖 6 works、29 pages、121 systems；
每个 system 都是 voice + piano grand staff，共 3 个可见 staff。sidecar 与每份 `source-mapping.json` 的
SHA-256 绑定，只供 evaluation 使用，不进入 inference。

在增强 metric 下，旧候选为 `0/29` topology-exact。即使把概率阈值降到 `0.5`、page-wide coverage 降到
`0.1`，29 页仍都无法在每个 truth band 内恢复 3 个 staff，因此首要失败类全部是 `mask-insufficient`；
connector 与 boundary 调参不具备达到 checkpoint 的前提。

- canonical report SHA-256: `7519c32bddbb83de51c0ef55c382f93e56e11c5330685eb5247096837bf07695`
- diagnostic truth SHA-256: `977ae09486dd420bfaa7089fd7e071c03d65cbecf01a8af72f58c6a8e8b3526f`
- repeated runs: byte-identical report and overlay hashes

`report.json` 是 development oracle，不是 holdout，也不批准产品 runtime。
