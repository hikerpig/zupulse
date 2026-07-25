# Phase 8 structured supervision decision

## 证据

Task 27 的 `8 QN` oracle：

- Mozart train candidate recall：`0.8104`
- Mozart tune candidate recall：`0.8329`
- train/tune complete piece paths：均为 `0`

因此，原计划“只有完整整首 gold path 才参与 structured gradient”会产生零个训练作品。扩大模型或引入 PyTorch 不能修复候选集中不存在正确标签的问题；把 gold chord 注入训练候选又会让训练与产品搜索空间不一致。

## 决定

训练监督按 candidate miss、unsupported label 或不可表达跨度切成最大连续 gold 子路径：

- 子路径内保留 dense lattice 的全部边界和全部合法负 ranges。
- Candidate generator 与产品一致，不读取 gold；gold 只标记已有 Top-8 candidate index。
- 不跨缺失区间学习 transition。
- 同一作品的全部子路径共享总样本权重，保持 corpus/group/piece balance。
- Tune/final 仍在完整作品上运行产品 exact decoder，不按 gold 切窗。

这是 partial structured supervision，不是独立 segment classification：每次更新仍比较一个连续窗口上的完整 predicted path 与完整 gold subpath。
