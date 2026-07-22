# Harmony boundary policy Task 19 checkpoint

## 冻结变量

- 生产对照：`dense-note-events`、MLP primary、rule confidence、threshold `0.60`。
- 本轮只改变 legal boundary lattice，不改变候选、primary、confidence、threshold 或后处理。
- 选择数据：Mozart tune。K331 只在结论冻结后作为历史 regression 查看。
- 预登记门禁：segment density 明显下降；predicted-primary/interval 不回退超过 `0.005`；boundary recall 不回退超过 `0.01`。

## Mozart tune

| policy            | segments/measure | predicted primary | precision | coverage | interval accuracy | boundary F1 |
| ----------------- | ---------------: | ----------------: | --------: | -------: | ----------------: | ----------: |
| dense-note-events |           3.7290 |            0.5842 |    0.6057 |   0.8096 |            0.4275 |      0.5836 |
| metric-beats      |           2.1294 |            0.6116 |    0.6475 |   0.6442 |            0.3922 |      0.6890 |
| metric-half-beats |           3.1237 |            0.6031 |    0.6150 |   0.7625 |            0.4174 |      0.6256 |

两种稀疏 policy 都减少片段并改善 predicted primary；但 `metric-beats` interval 回退 `0.0353`，`metric-half-beats` 回退 `0.0101`，均超过 `0.005` 门禁。结论：**不切换生产默认**。统一时间网格会同时删除旋律伪边界和真实拍内和声变化，需要下一轮引入不依赖 gold 输入的强证据 note-boundary gate。

## K331 历史诊断（不用于选择）

| policy            | segments/measure | predicted primary | precision | coverage | interval accuracy | boundary F1 |
| ----------------- | ---------------: | ----------------: | --------: | -------: | ----------------: | ----------: |
| dense-note-events |           2.4526 |            0.6086 |    0.5894 |   0.7336 |            0.4549 |      0.4145 |
| metric-beats      |           1.4015 |            0.7602 |    0.7466 |   0.6066 |            0.4898 |      0.6786 |
| metric-half-beats |           2.1679 |            0.6742 |    0.6512 |   0.6639 |            0.4057 |      0.4274 |

K331 单独看会偏向选择 `metric-beats`，但 Mozart tune 已否定其泛化门禁，因此不得依据这组已污染 regression 指标发布。

## Strong-onset follow-up

在上述静态网格失败后，按新计划冻结 `metric-strong-onsets`：metric beats 之外，只恢复同一时刻至少两个不同 pitch class 同步起音的边界；单音、重复八度和 note end 均不恢复。

Mozart tune 结果：segments/measure `2.8272`（相对 dense `-24.2%`）、predicted primary `0.6273`（`+0.0430`）、precision `0.6431`、coverage `0.7211`、boundary F1 `0.6727`；但 interval accuracy 为 `0.4189`，相对 dense 回退 `0.0086`，仍超过 `0.005` 门禁。结论：**strong-onset 也不切换为默认**，且不继续运行其他 tune corpus 或调整阈值。

对产品 `K331-3_reviewed.mxl` 的前 8 小节，dense 输出 24 个起始片段，strong-onset 仍为 22 个，并继续出现 `C`、`A`、`Am/C`、重复 `Em/B` 与大量 unresolved；这不足以解决用户看到的碎片化。DCML 临时 archive 在该诊断前被系统清理，因此没有绕过 checksum 重跑 strong-onset K331 指标；上表已完成的 dense/metric/half-beat K331 reports 保留在 `/private/tmp`，不把缺失运行伪装成通过。

下一步不应继续手调统一网格或同步起音阈值，而应在 train split 建立 boundary evidence records，特征至少分开 metric strength、bass change、held-note continuity、onset pitch-class mass 与窗口前后 pitch-set change；gold 只作为训练标签，绝不作为产品输入边界。
