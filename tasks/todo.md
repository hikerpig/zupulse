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

- [x] Task 7：验证 deterministic primary local-margin confidence。
- [x] Task 8：拟合并验证 train-only weighted PAVA；因跨语料 ECE 回退未发布资产。
- [x] Task 9：tune-only threshold `0.23` 通过局部门禁；随失败资产整体回滚。
- [x] Checkpoint C：冻结候选并执行无调参 eval；失败后未移动 baseline。

## Phase 4: Frozen eval

- [x] Task 10：运行 K331、跨 DCML、POP909 与 ASAP frozen eval；Schumann ECE 门禁失败。
- [x] 已回滚 calibration/threshold 候选，保留 Phase 2 与通用校准工具，未移动 baseline。

## Phase 5: 跨语料 Primary Reranker

- [x] Task 11：预登记未污染的 v3 作品级 holdout；旧 eval 降级为 regression。
- [x] Task 12：导出 train-only、固定生产 range 的 Top-8 ranking records。
- [ ] Task 13：先训练并验证无新运行依赖的线性 reranker。
- [ ] Checkpoint D：依据线性基线和错误切片决定是否需要 PyTorch。
- [ ] Task 14（条件触发）：离线训练小型 MLP，导出 JSON，不引入 Torch runtime。
- [ ] Task 15：在冻结 boundary 上接入 primary reranker，并保持分数语义分离。
- [ ] Task 16：多语料 calibration、tune threshold 与一次 v3 frozen eval。
