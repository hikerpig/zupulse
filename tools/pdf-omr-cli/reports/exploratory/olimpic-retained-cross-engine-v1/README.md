# OLiMPiC retained-system candidate precision evaluation

> Status: development evidence，完成于 2026-08-17。输入来自既有 Rokot development run 保留的 OLiMPiC
> system PNG；因此本报告只能验证候选筛选，不可用于 source-independent engine 排名，也未读取 holdout。

从 6 个真实 OLiMPiC system 构造 deterministic derived-controlled corpus 后，Rokot 6/6 完成；LEGATO 3/6
完成，另有 1 项 engine execution failure、2 项 `part-count-mismatch`。comparison 按协议拒绝不完整 run，随后只对
3 个双引擎均成功的 item 重跑同源子集。strict topology 因跨引擎 part identity 不可用而 fail closed；显式
`ordered-staves` 后生成 8 个不可自动应用的 `replace` candidate。

整包应用 8 个候选会让 Joint F1 从 `0.2210` 降到 `0.1671`，不满足 non-regression。逐候选独立评分后，只有
`olimpic-dev-5026077-p1-s1` 的 measure index `0`、`1` 两个候选同时提升全部五项指标。联合应用这两个推荐候选后：

- Pitch F1：`0.9565 -> 0.9825`
- Onset F1：`0.6146 -> 0.6196`
- Duration F1：`0.4313 -> 0.4457`
- Joint F1：`0.2210 -> 0.2283`
- Valid measure rate：`0.0625 -> 0.1250`

推荐集合 assessment 为 `improved`、`nonRegressive: true`。这证明多 engine 结果可以辅助小节级修复，但必须先做
candidate-level precision filtering；结果仍是 report-only development evidence，不自动 promotion 或写回。

结构化指标与所有输入/report hash 见 [`summary.json`](summary.json)。完整 runs、派生 PDF、ABC、MXL、模型与
cache 不进入 Git。
