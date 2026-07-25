# Phase 8 final decision

结论：**拒绝发布，保留 opt-in 实验。**

Phase 8 完成了 lattice oracle、时值型 span contract、exact Semi-CRF、structured features、分片 records、线性路径训练和一次严格的 Mozart tune gate。候选在准确率、segment density 和 runtime 三个主要门禁上均失败，因此没有执行 final holdout，也没有改变 production 默认、algorithmVersion、confidence 或 baseline。

## 否定的方法

- 用 dense boundary 数量作 span：对装饰密集织体不稳定。
- 全语料单 JSON 对象：4 GB heap OOM。
- 整乐章 transition feature cache：组合爆炸到 3.8 GB RSS。
- 只接受整首完整 gold path：Top-8 candidate miss 使所有作品都不可训练。
- 当前 linear Semi-CRF：相对 dense interval `-0.0912`、primary `-0.1460`、density `+20.6%`，runtime 约十几倍。
- 在当前结果上追加小型 MLP/PyTorch：不满足预登记触发条件；无法修复 lattice runtime 与 candidate miss。

## 保留的有效基础

- `8 QN` span representability train/tune 均超过 `0.99`。
- Exact decoder 在同合同 benchmark 上优于 beam，canonical state/backpointer/window cache 有效。
- Records 可重复、split 隔离、piece-sharded、streaming 验证。
- Structured scorer 的 rule/model/confidence 尺度分离；zero model、全局 segment/transition 翻转、MLP 不二次改写均有测试。
- Product runtime 不依赖 PyTorch；模型是两位小数 JSON + TypeScript dot product。

## 下一次值得尝试的方向

1. 先把 structured range evidence 改为 prefix/incremental cache，使 learned exact runtime 接近 rule exact；不改变模型。
2. 改进 Top-8 candidate proposal，尤其 inversion/root ambiguity；先提高 oracle，再训练。
3. 对 density 加显式 segment-count / boundary loss，而不是只靠 path feature。
4. 在线性候选在 train 与至少一个 tune corpus 稳定改善后，才考虑离线 PyTorch 小 MLP；PyTorch 仍不进入产品 runtime。

## 最终验证

- `pnpm --filter @zupulse/harmony-cli test`：通过。
- `pnpm verify:fast`：124 test files / 490 tests 通过。
- `pnpm harmony:benchmark`：analysis P95 `488.15 ms`，reranker ratio `0.9904x`，heap delta `74.86 MB`，全部在预算内。
- Worktree 在实现提交 `07893d1` 后 clean。

Phase 8 的阶段提交：

- `aa7b1e2`：duration-based span contract
- `4bc24d4`：exact search、structured features、初版 records
- `70f057c`：piece-sharded records 与 Checkpoint F
- `07893d1`：linear trainer、opt-in runtime、Mozart tune 拒绝决定
