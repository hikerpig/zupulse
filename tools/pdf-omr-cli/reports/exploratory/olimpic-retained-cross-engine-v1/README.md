# OLiMPiC retained-system candidate precision evaluation

> Status: development evidence，完成于 2026-08-17。输入来自既有 Rokot development run 保留的 OLiMPiC
> system PNG；因此本报告只能验证候选筛选，不可用于 source-independent engine 排名，也未读取 holdout。

从 6 个真实 OLiMPiC system 构造 deterministic derived-controlled corpus 后，Rokot 6/6 完成；LEGATO 初次为
3/6，另有 1 项被误记为 engine failure、2 项真实 `part-count-mismatch`。前者实际已生成合法 Draft，只是附加
Harmony analysis 遇到 `invalid-written-moment`。修复为保留 symbolic metrics 并记录 `omrBlocked` 后，同源 4-item
子集双引擎均完成；剩余两项因 3 predicted parts 无法映射到 2 expected staves，继续 fail closed。strict topology
因跨引擎 part identity 不可用而拒绝，显式 `ordered-staves` 后生成 13 个不可自动应用的 `replace` candidate。

整包应用 13 个候选虽让 Joint F1 从 `0.1873` 提升到 `0.2046`，但 Pitch F1 从 `0.8842` 降到 `0.8758`，仍不满足
non-regression。逐候选独立评分后，3 个候选满足全部指标不下降；除 `olimpic-dev-5026077-p1-s1` 的 measure
index `0`、`1` 外，还包括 `olimpic-dev-5023603-p4-s2` 的 measure index `0`。联合应用这 3 个推荐候选后：

- Pitch F1：`0.8842 -> 0.9130`
- Onset F1：`0.6217 -> 0.6511`
- Duration F1：`0.5169 -> 0.5302`
- Joint F1：`0.1873 -> 0.2105`
- Valid measure rate：`0.0385 -> 0.0769`

Oracle 集合 assessment 为 `improved`、`nonRegressive: true`。这证明多 engine 结果可以辅助小节级修复，但必须先做
candidate-level precision filtering；这里的筛选读取了 GT，只是 `oracleRecommended` 标签，不是可部署 selector。
结果仍是 report-only development evidence，不自动 promotion 或写回。

结构化指标与所有输入/report hash 见 [`summary.json`](summary.json)。完整 runs、派生 PDF、ABC、MXL、模型与
cache 不进入 Git。
