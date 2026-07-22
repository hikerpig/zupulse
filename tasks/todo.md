# Harmony Analysis 迭代清单

## Phase 1: 评测可信度

- [x] Task 1：合并后 alternatives 去重并硬限制 Top-8。
- [x] Task 2：增加全量错误簇、置信度分箱和 precision/coverage curve。
- [x] Task 3：增加 interval-overlap 与容差 boundary 诊断。
- [x] Checkpoint A：冻结 corrected baseline，只选择一个最大错误簇（root exact-spelling）。

## Phase 2: 候选与主序列

- [ ] Task 4：修正 feature correctness（source pitch spelling 已通过 tune 门禁；继续逐项验证）。
- [ ] Task 5：仅在 oracle miss 最大时优化候选多样性。
- [ ] Task 6：仅在 oracle hit 但 primary 错时优化序列选择。
- [ ] Checkpoint B：在 Mozart tune 上冻结候选/序列算法。

## Phase 3: Confidence 与拒识

- [ ] Task 7：定义 primary-path confidence features。
- [ ] Task 8：用 train-only 数据拟合单调 calibration。
- [ ] Task 9：只在 tune 上按 precision floor 选择 threshold。
- [ ] Checkpoint C：冻结代码、资产、阈值和 algorithmVersion。

## Phase 4: Frozen eval

- [ ] Task 10：一次性运行 K331、全量 Mozart、跨 DCML、POP909、ASAP 与性能门禁。
- [ ] 通过则提交 report diff 和说明；失败则回滚候选，不移动 baseline。
