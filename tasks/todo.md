# Harmony Analysis 迭代清单

## Phase 1: 评测可信度

- [x] Task 1：合并后 alternatives 去重并硬限制 Top-8。
- [x] Task 2：增加全量错误簇、置信度分箱和 precision/coverage curve。
- [x] Task 3：增加 interval-overlap 与容差 boundary 诊断。
- [x] Checkpoint A：冻结 corrected baseline，只选择一个最大错误簇（root exact-spelling）。

## Phase 2: 候选与主序列

- [x] Task 4：修正 feature correctness（source spelling 与跨小节 onset 均已通过 tune 门禁）。
- [x] Task 5：优化候选多样性（observed-bass 生成、槽位策略与 onset correction 已通过）。
- [x] Task 6：验证 primary 序列候选（两种 hybrid primary 方案均未过门禁，维持 rule-only）。
- [x] Checkpoint B：已在 Mozart tune 上冻结候选/序列算法。

## Phase 3: Confidence 与拒识

- [ ] Task 7：定义 primary-path confidence features。
- [ ] Task 8：用 train-only 数据拟合单调 calibration。
- [ ] Task 9：只在 tune 上按 precision floor 选择 threshold。
- [ ] Checkpoint C：冻结代码、资产、阈值和 algorithmVersion。

## Phase 4: Frozen eval

- [ ] Task 10：一次性运行 K331、全量 Mozart、跨 DCML、POP909、ASAP 与性能门禁。
- [ ] 通过则提交 report diff 和说明；失败则回滚候选，不移动 baseline。
