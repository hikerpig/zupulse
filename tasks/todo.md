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
- [x] Task 13：线性 v2 跨语料一致改善，但 tune `+0.0228` 未达到 `+0.05` 发布门槛。
- [x] Checkpoint D：train/tune 均稳定欠拟合，已触发离线小型 MLP；final holdout 未运行。
- [x] Task 14：16-unit 离线 MLP 相对线性 tune `+0.0961`，量化 JSON/TypeScript 等价且无 Torch runtime。
- [x] Task 15：MLP 在冻结 postprocess range 上默认启用，P95 `0.9966x`，logit/rule/confidence 语义分离。
- [x] Task 16：多语料 calibration、tune threshold 与一次 v3 frozen eval；POP909 ECE 与历史 DCML coverage 门禁失败，已拒绝并回滚生产默认。

## Phase 6: Harmonic Rhythm 与边界稀疏化

- [x] Task 17：补齐 threshold 前 predicted-primary accuracy 与 segment density。
- [x] Task 18：增加 opt-in `metric-beats` boundary policy，默认暂不改变。
- [x] Task 19：Mozart tune 否定 metric/half-beat，未继续污染其他 corpus。
- [x] Task 20：生产默认未切换、baseline 未移动；K331 历史诊断与拒绝结论已记录。
- [x] Task 21：实现 metric + strong simultaneous-onset boundary gate。
- [x] Task 22：Mozart tune interval 门禁失败，未发布、未移动 baseline，并记录后续 boundary-evidence 方向。

## Phase 7: Train-only Boundary Evidence

- [x] Task 23：导出严格 split 隔离的 boundary evidence records。
- [x] Task 24：训练并 tune 轻量线性 boundary classifier。
- [x] Task 25：以 opt-in learned boundary policy 接入 TypeScript analyzer。
- [x] Task 26：执行序贯 tune 门禁并决定是否发布；首个 corpus 失败，未发布。

## Phase 8: 可学习的 Semi-CRF 联合解码

- [x] Task 27：建立 lattice、maxSpan 与 Top-8 的完整 gold-path oracle。
- [x] Task 28：实现 `maxQuarterNotes=8` 的 exact search 与窗口化惰性 range cache。
- [x] Checkpoint E：基于 train 冻结时值合同；train/tune span 与 candidate oracle 门禁通过。
- [x] Task 29：冻结 `semi-crf-linear-v1` segment/transition feature contract。
- [x] Task 30：导出严格 split 隔离、piece-sharded 的 structured path records。
- [x] Checkpoint F：records 可重复、可流式验证且没有 gold 泄漏。
- [x] Task 31：训练 piece-balanced 线性 structured scorer。
- [x] Task 32：以 opt-in Semi-CRF scorer 接入 analyzer。
- [x] Checkpoint G：score contract 等价，production 默认未改变。
- [x] Task 33：Mozart 首轮序贯 linear tune 门禁失败，停止跨语料。
- [x] Task 34：触发条件不成立，未比较 MLP、未新增 PyTorch。
- [x] Task 35：候选在 final 前拒绝；未读取 final/K331，默认保持不变。
- [ ] Checkpoint H：文档、验证、提交和工作区状态全部完成。
