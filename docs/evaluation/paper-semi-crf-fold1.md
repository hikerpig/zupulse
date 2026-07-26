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

结果满足规格中 ±2pp 的 same-weight parity 门槛。预测路径差异只出现在 `003109b`：events 58–60
由作者的 `C:maj` 变为 TS 的 `A:min`，events 63–67 由 `C:maj` 变为 `G:maj`。这 8 个 event-level
path differences 恰好带来 +3 correct events；TS 将作者的一个长 segment 拆成五个局部 segments，
解释了 predicted segment +4 和 correct segment +3。

用归档权重重评分这两个完整路径时，TS scorer 认为 TS path 高 `84.18991557221852`，远大于浮点
tie 范围。差异主要来自拆段后重复激活的 coverage、segment-duration 与 chord-bigram features。因此
该偏差已定位为 candidate-path feature firing semantics，而不是 label order、weight order、Viterbi
tie-break 或数值精度。gold-path activated feature-name 集合完全一致并不足以证明所有 candidate
vectors 的 multiplicity 一致；这是 same-weight parity 仍非逐路径完全一致的明确边界。

本次 6 首解码的 records SHA-256 为
`31e5827f3070de15a011be745aff09452d65fc67f07d186a1f02715fbd9eb175`；总 runtime 为
49.45 秒。进程内 RSS 采样从 235,798,528 bytes 到 349,814,784 bytes。

## Fresh TypeScript fold 1

作者模型声明 `L2 param: 0.125`。最终 fresh TS run 使用相同的 54-song train split、423 retained
features、max span 20、`l2=0.125`，从零权重运行确定性 L-BFGS 165 iterations。不能将此前
`l2=1` 的性能实验当作复现模型。

| 指标              | Author archived | Fresh TypeScript | 差值    |
| ----------------- | --------------- | ---------------- | ------- |
| Event correct     | 454 / 563       | 455 / 563        | +1      |
| Event accuracy    | 80.64%          | 80.82%           | +0.18pp |
| Segment correct   | 208             | 209              | +1      |
| Segment predicted | 280             | 280              | 0       |
| Segment precision | 74.29%          | 74.64%           | +0.35pp |
| Segment recall    | 71.48%          | 71.82%           | +0.34pp |
| Segment F1        | 72.85%          | 73.20%           | +0.35pp |

模型 SHA-256 为 `41948b59199e0037a7366f6436b2db39b88c39bac3c4d34df58d77ac80d39ac8`。
objective 从 `23036.362808627335` 降至 `1667.7855816624083`；165 iterations 共执行 196 次
objective evaluation。最终 gradient L2 norm 为 `41.964534524223474`，因此这是和作者停止轮数对齐、
指标已过门槛的 preregistered checkpoint，不宣称满足本实现的 gradient convergence。

训练 OS maximum RSS 为 `1,759,363,072` bytes。冻结模型的 6-song evaluation wall runtime 为
51.51 秒，OS maximum RSS 为 `375,767,040` bytes；逐曲 decode P95（nearest-rank）为
15,886.44 ms。逐曲 runtime 为：

| Record                         | Events | Runtime ms |
| ------------------------------ | -----: | ---------: |
| `003306b`                      |    148 |   15886.44 |
| `013705channotated_events.xml` |     64 |    4936.96 |
| `002806b`                      |     81 |    6588.96 |
| `005708b`                      |     70 |    5440.06 |
| `003109b`                      |    114 |   10887.81 |
| `001606b`                      |     86 |    7018.41 |

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

pnpm -s harmony:cli paper-semi-crf-train /tmp/zupulse-paper-semi-crf-train1.json \
  --feature-counts <author-repo>/feature_count1.txt \
  --max-iterations 165 --min-feature-count 4 --l2 0.125 \
  --output /tmp/zupulse-paper-semi-crf-fresh-fold1-model-l2-0125-iter165.json \
  --checkpoint /tmp/zupulse-paper-semi-crf-fresh-fold1-checkpoint-l2-0125-iter165.json \
  --report /tmp/zupulse-paper-semi-crf-fresh-fold1-train-report-l2-0125-iter165.json
```

## Remaining

- 进入批准的 current-corpus comparison。
- candidate-path feature multiplicity 的逐模板 Java parity 可作为后续研究改进，但不影响已通过的
  same-weight/fresh ±2pp reproduction gates。

### Current-corpus scope audit

未读取任何 final holdout。按 `protocol-v3.json` 允许的 Mozart train/tune groups 做只读审计后，
现有 paper label contract 的无损 gold mapping coverage 分别只有：

| Split | Gold | Paper-supported | Coverage | Inversions | Unsupported dominant / half-dim |
| ----- | ---: | --------------: | -------: | ---------: | ------------------------------: |
| train | 8720 |            3433 |   39.37% |       3467 |                        751 / 40 |
| tune  | 2157 |             849 |   39.36% |        840 |                         190 / 7 |

此外，train/tune 分别有 28/8 个 supported gold boundary 不能和 basic-event boundary 对齐，
21/3 个 supported gold span 超过 BaCh 冻结的 20 events（最大 36/24）。因此下一比较不能在不声明
口径的情况下生成完整 target paths：

1. faithful 方案：只保留连续、对齐、span≤20 的可表达窗口，并明确约 39% mapping coverage；
2. product-adapted 方案：新增 inversion/dominant simplification 或 label support。

方案 2 会改变已冻结的 label simplification，按规格必须先批准；方案 1 不改变论文合同，但结论只覆盖
可表达 slice。

faithful-window 导出基础设施已验证，但尚未把该口径当作获批的 Task 9 最终选择。它使用
`protocol-v3.json` 的 train/tune roles，并在 unsupported、unaligned 或 span>20 处切断窗口：

| Split | Pieces | Labels | Included gold | Windows | Events | Records SHA-256                                                    |
| ----- | -----: | -----: | ------------: | ------: | -----: | ------------------------------------------------------------------ |
| train |     30 |     62 |          3384 |    2248 |  14985 | `44683706b5120e6465cc840bd006d74a0372030f58fa476207e2e2a90adf67fd` |
| tune  |      9 |     62 |           838 |     586 |   3770 | `e60ad957a9ce17ee05e1585679c1ad1f490847e32eb41aac7fb098080c274b8e` |

生成文件分别为 13.1 MB 与 3.3 MB；没有读取 regression/eval/final-holdout groups。tune records
强制复用 train label order，不能从 tune gold 扩充候选 inventory。

### Faithful-window current-corpus comparison

在不改变 frozen label simplification、且不读取 final holdout 的前提下，已用上述 Mozart train
windows 从零训练 165 iterations，并在 tune windows 上与当前 `analyzeHarmonyRules`
（`decisionThreshold=0`）做相同窗口投影比较。

训练模型 SHA-256 为
`6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515`。objective 从
`62048.9051` 降至 `1742.6117`，最终 gradient L2 norm 为 `6.895`；训练总 wall clock
`2900.53 s`，OS maximum RSS `2,066,317,312` bytes。该成本适合作为离线研究基线，不满足任何已批准
的产品预算，因为当前没有批准过这样的预算。

同一批 586 tune windows / 3770 events 的结果如下：

| Metric                   | Paper Semi-CRF | Production baseline |     Delta |
| ------------------------ | -------------: | ------------------: | --------: |
| Event accuracy           |         88.20% |              59.89% | +28.30 pp |
| Duration accuracy        |         87.01% |              58.11% | +28.90 pp |
| Segment F1               |         80.19% |              25.16% | +55.03 pp |
| Boundary F1              |         79.77% |              28.42% | +51.35 pp |
| Predicted / gold density |          1.012 |               1.751 |    -0.739 |

报告 records SHA-256 为
`e60ad957a9ce17ee05e1585679c1ad1f490847e32eb41aac7fb098080c274b8e`。Semi-CRF 的
`windowRuntimeMs` 为 `35170.36`，P95/window 为 `218.69 ms`；生产基线的
`fullPieceRuntimeMs` 为 `87824.04`。前者只推理导出的窗口，后者分析 9 首完整乐曲，因此不能据此
声称运行时提升或退化。

这项比较明确支持最初诊断：此前效果不佳来自当前变体偏离论文 observation、label inventory、
feature 与 objective，并非 Semi-CRF 方法本身无效。但它仍只覆盖约 39% 可无损映射的 gold labels，
主动排除了大量 inversion、dominant、unaligned 和 span>20 区域，不能外推到完整当前语料。

因此当前 adoption decision 为 **research-only**：保留 paper-compatible analyzer、训练器与评估
命令，不替换 production `analyzeHarmonyRules`，不修改现有持久化或 UI contract。进入产品候选前
至少还需要批准并版本化 product label adaptation、在完整 train/tune contract 上重跑、设定并通过
整曲 runtime budget，最后才可申请读取 final holdout。这个结论不修改 Current ADR，因为没有发生
生产架构变更。

### Full-fold resource boundary

规格要求完整跑原始 10 folds，或明确报告资源限制。本轮仅 fresh 训练 fold 1：正确参数下单折约
48.6 分钟，峰值 RSS 约 1.76 GB；在同一实现与机器上，十折仅训练时间线性外推已超过 8 小时，且还
不含每折 records/feature preparation 与 evaluation。该执行成本超出本次持续验证窗口，因此没有把
作者 archived 10-fold outputs 冒充 fresh run，也没有启动剩余九折。BaCh fold 1 的 fresh gate 与
TypeScript parity gate 均已通过；完整十折留作独立、明确配额的 reproducibility batch。

第一次训练诊断还暴露了 raw DCML spelling 与冻结 paper normalization 的边界：例如 `C#:maj`
必须先归一化为 `Db:maj`，否则 raw labels 虽通过 records schema，训练 inventory 去重后仍会出现
label ID 越界。修复后新增 enharmonic regression test，零迭代 exact objective 成功完成：
1242 retained features、initial objective `62048.90510763007`、OS maximum RSS
`2,047,590,400` bytes；compile `115180.44` ms，两次 objective 共 `25070.36` ms。

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
