# Paper-compatible Semi-CRF：BaCh Fold 1 复现记录

状态：进行中。本文只记录论文复现证据，不代表 production analyzer 的采用决定。

## 数据与契约校验

外部数据来自作者仓库 `kristenmasada/chord_recognition_semi_crf` 的 processed BaCh XML、fold files 与
归档输出；这些文件不进入 Zupulse Git。

| 项目                | Author fold 1 | TypeScript records | 结果         |
| ------------------- | ------------- | ------------------ | ------------ |
| train songs         | 54            | 54                 | 一致         |
| train basic events  | 5107          | 5107               | 一致         |
| train gold segments | 2801          | 2801               | 一致         |
| test songs          | 6             | 6                  | 一致         |
| test basic events   | 563           | 563                | 一致         |
| test gold segments  | 291           | 291                | 一致         |
| feature names       | 598           | 598                | 集合完全一致 |

作者 fresh feature-count 输出与其归档 `feature_count1.txt` 逐字节相同。归档文件 SHA-256 为
`60e0f5dc7ffc5c05ea379ae9b716160a11f9df415a294db3ac93ada92dbc9179`。TypeScript 在相同 54 首
gold paths 上激活的 598 个 feature names 与该集合交集为 598，双方差集均为 0。

label ID 不能直接取 `bach_dataset_chords.txt` 的文件顺序。作者 Java 先按 train gold 首次出现顺序创建
`SpanLabel.id`，随后补全未见标签；model text 的展示顺序又来自 `HashMap`。adapter 因此按打印出的
`(id: n)` 恢复模型顺序，并让 tune records 复用 train records 的 label inventory。

## Same-author-weight TypeScript parity

作者归档 fold 1 model text SHA-256 为
`60984a40558aa0c31d0ea3b61305bbe87b6690bb7774e19267ae549b5583d511`。转换后的严格 TypeScript
model 有 90 labels、423 retained features，SHA-256 为
`d780dbd3a975053cb89b95032c03c3cfd132fc33c0347dcf937f61e37dd4099a`。

| 指标              | Author archived | TypeScript same weights | 差值    |
| ----------------- | --------------- | ----------------------- | ------- |
| Event correct     | 454 / 563       | 457 / 563               | +3      |
| Event accuracy    | 80.64%          | 81.17%                  | +0.53pp |
| Segment correct   | 208             | 211                     | +3      |
| Segment predicted | 280             | 284                     | +4      |
| Segment precision | 74.29%          | 74.30%                  | +0.01pp |
| Segment recall    | 71.48%          | 72.51%                  | +1.03pp |
| Segment F1        | 72.85%          | 73.39%                  | +0.54pp |

结果满足规格中 ±2pp 的 same-weight parity 门槛。当前仍有 3 个 exact-segment 差异需要在 fresh
TypeScript training 前定位，但不会用 postprocess 或 rule prior 改写 CRF 路径。

本次 6 首解码的 records SHA-256 为
`31e5827f3070de15a011be745aff09452d65fc67f07d186a1f02715fbd9eb175`；总 runtime 为
49.45 秒。进程内 RSS 采样从 235,798,528 bytes 到 349,814,784 bytes。该数值不是操作系统级 peak
RSS；最终报告仍需用外部进程测量补充 peak 与逐曲 P95。

## Commands

```bash
pnpm -s harmony:cli paper-semi-crf-records <author-repo>/folds/train1.txt \
  --labels <author-repo>/bach_dataset_chords.txt \
  --role train --output /tmp/zupulse-paper-semi-crf-train1.json \
  --max-segment-length 20

pnpm -s harmony:cli paper-semi-crf-records <author-repo>/folds/test1.txt \
  --labels <author-repo>/bach_dataset_chords.txt \
  --role tune --output /tmp/zupulse-paper-semi-crf-test1.json \
  --label-order-records /tmp/zupulse-paper-semi-crf-train1.json \
  --max-segment-length 20

pnpm -s harmony:cli paper-semi-crf-import-author-model <author-fold1-model.txt> \
  --output /tmp/zupulse-paper-semi-crf-author-fold1-model.json

pnpm -s harmony:cli paper-semi-crf-eval /tmp/zupulse-paper-semi-crf-test1.json \
  --model /tmp/zupulse-paper-semi-crf-author-fold1-model.json \
  --output /tmp/zupulse-paper-semi-crf-author-model-ts-eval1.json
```

## Remaining

- 完成 fresh TypeScript fold 1 training，不能以作者归档权重替代。
- 解释 same-weight 的 3 个 segment / 3 个 event 差异。
- 使用同一冻结模型记录逐曲 runtime、P95 与 OS peak RSS。
- 完成后再进入批准的 current-corpus comparison。

### Fresh TypeScript training performance checkpoint

第一版 objective 为每条 `(segment, current, previous)` edge 构造并缓存完整 feature vector；full fold
feature touch 超过 4 分钟且无法形成可接受的内存上界，已停止。

第二版把 local potential 严格分解为 segment 与 chord-bigram 两部分。tiny lattice 的 NLL、
log-partition、target score 与 gradient 和 generic 实现逐项一致到 `1e-12`。随后进一步复用
`incoming[start,current]` 与 `futureMass[start,current]`，把 transition DP 从
`events × span × labels²` 降为 `events × (span × labels + labels²)`。

使用 fresh author `feature_count1.txt` 跳过重复 feature touch 后，full fold 的零迭代 objective 仍在
6 分钟内未完成，RSS 稳定在约 541 MB；采样显示主成本已经转移到每次 objective 重建约 900 万个
segment-label sparse vectors。该 benchmark 已停止。下一实现切片会在 optimizer 前编译这些与权重无关的
vectors，并让 line search 复用；不能用 beam、Top-K 或 postprocess 绕过 exact objective。

稠密编号但保留 JavaScript feature-object arrays 的原型在默认 V8 heap 下运行 139.87 秒后 OOM，
OS maximum RSS 为 4,534,534,144 bytes；使用 16 GB heap 的诊断运行超过 4 分 30 秒仍未完成，已停止。
因此该原型不作为实现提交。下一版必须使用 packed offsets + integer feature indices，避免为约 900
万个 segment-label vector 及其 feature 创建独立 JavaScript 对象。

另已修复 `encodePaperSemiCrfNamedFeatures` 为每个 vector 重建完整 feature-name index 的问题，
改为按 dictionary identity 复用索引。无缓存 full-fold 零迭代 objective 在 6 分 30 秒后仍未完成，
已停止；这说明 packed 编译仍是必需项，而不是可选的微优化。

packed 实现使用每条 record 的 `Uint32Array offsets` 与分块 `Uint16Array feature indices/values`，
并通过 allocation-free visitor 供 exact objective 读取。full fold 零迭代已完成：

- initial objective: `23036.362808627335`
- model SHA-256: `231896ff08afa8de410ceb5563eb15cd5989e1311a7e02b4a089e73d4ec1c77e`
- OS maximum RSS: `1,678,409,728` bytes
- `/usr/bin/time` user CPU: `383.72` seconds

从零迭代 checkpoint resume 一轮后，objective 降到 `15200.869299984884`，gradient L2 norm 为
`7673.513786403404`；OS maximum RSS 为 `1,761,574,912` bytes，user CPU 为 `463.07` 秒。
两次 `time` 的 wall clock 分别异常记录为 3688.99 与 1946.61 秒，和交互侧观测不一致，因此不作为
runtime gate；后续在训练器内用 monotonic clock 分别记录 compile 与 objective runtime。
