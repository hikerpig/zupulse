# OLiMPiC source-independent cross-engine repair evaluation

> Status: completed development evidence，完成于 2026-08-17。只使用 OLiMPiC official scanned release 的
> development system crops，未读取 frozen holdout；所有候选仍为 report-only、review-required。

本轮从锁定 archive 恢复 `standard-development` 的 36 个 distinct works，并加入同 work 的 10 个 middle
systems。最终位置分布从 first/middle/last `31/1/4` 扩为 `31/11/4`。锁定 release 中只有 4 个 GT-ready
development last systems，且已全部在标准集，因此无法继续补 last。

46 个输入全部串行运行。Rokot 完成 45/46；LEGATO 完成 26/46，其中 15 个为 `part-count-mismatch`、1 个
`empty-page-part`、4 个 `ENGINE_EXECUTION_FAILED`。新版 comparison 不再要求人工复制成功子集，而是保留
attempted 与两侧 success 分母，并对 26 个双侧成功 item 自动求交集。26 个 comparable items 中 23 个产生
81 个候选，全部为 `replace`。

直接应用全部 81 个候选虽然让 Joint F1 从 `0.2690` 升到 `0.2902`，但 Onset 和 Duration 分别下降
`0.1449`、`0.1383`，assessment 为 `mixed`。读取 GT 的逐候选 oracle 标出 28 个
`oracleRecommended`；联合后 Joint F1 到 `0.3369`，其余四项也全部提升。这个结果说明候选池含有有效修复，
但不构成可部署 selector。

锁定的 `repair-selector-protocol.json` 按 work 划分 18/18 calibration/validation，并要求 GT-free selector
至少选择 35 个候选、零回归、95% two-sided Wilson lower bound 不低于 0.90。当前甚至 oracle upper bound
也只有 28/28，lower bound 为 `0.8794`；validation oracle 只有 11/11，lower bound 为 `0.7412`。因此 gate
状态为 `NOT_ELIGIBLE`，自动应用继续禁止。下一步优先降低 LEGATO 的 part/topology 失败，扩大 comparable 与
候选分母；在此之前继续加 selector 规则会过拟合。

完整 runs、模型和 assets 位于外部 cache，不进入 Git。结构化指标与全部锁定 hash 见 `summary.json`。
