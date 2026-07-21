# Harmony 评测协议与当前基线

本文记录 `@zupulse/harmony-cli` 的长期评测语义。命令参数与 JSON 示例见上级 [`README.md`](../README.md)，manifest 的 Zod 事实源是 [`src/schemas.ts`](../src/schemas.ts)。

## 评测角色

v2 dataset manifest 用 `kind` 强制区分三种数据，禁止把不同含义的数字合成一个“总准确率”：

| kind                 | 当前 adapter      | 输入与输出                                          |
| -------------------- | ----------------- | --------------------------------------------------- |
| `accuracy-corpus`    | `dcml`、`pop909`  | score/model + 专家 chord ranges；输出绝对和弦准确率 |
| `ingestion-corpus`   | `asap`            | MusicXML；只输出解析、结构、segment 和 runtime      |
| `label-prior-corpus` | `choco`、`wjazzd` | label-only；只允许研究映射或 train-only prior       |

`source.url`、revision、license、archive SHA-256、adapterVersion、datasetPath 和 archivePath 都由 manifest 固定。CLI 不自动下载或解压外部 corpus；原始数据位于 git 外 `data-root`，运行前先校验 archive SHA-256，并拒绝逃出 data-root 的路径。

## 结构回归与准确率

v1 regression manifest 用于 MusicXML/MXL 结构稳定性：它锁定来源 SHA、投影 model 摘要和 analyzer result 摘要。Turkish March fixture 属于这一类，不能因为当前输出稳定就被称为 accuracy gold。

v2 accuracy corpus 必须有独立专家标注。adapter 从 score 数据构造 `HarmonyAnalysisInput`，从标注数据构造 canonical absolute `ChordSymbol`；不能把当前 analyzer 输出复制成 gold，也不能用 gold chord 边界反向构造 model。

## 作品级 split 与隔离

split 的最小单位是完整作品 group：奏鸣曲的不同 movement 不跨 split，POP909 以歌曲为 group。`forcedEvalGroups` 优先把指定作品冻结到 eval，其余 group 由稳定 hash 分配：bucket 0 为 eval、bucket 1 为 tune、其他为 train。

- train：拟合频率、权重或其他资产；
- tune：选择阈值、假设和候选实现；
- eval：只在候选冻结后运行，不能用于选择参数或模型资产。

`buildTrainLabelPrior` 会拒绝 tune/eval records。任何未来 ChoCo/WJazzD prior 都必须带 schemaVersion、来源 case、train group 数和 label 频次；它们不进入 end-to-end accuracy。

## Adapter 语义

### DCML

DCML adapter 从 `measures.tsv` 和 `notes.tsv` 构造 model，从 `harmonies.tsv` 构造 gold。它使用 `quarterbeats_all_endings` 表达书面时间，处理 alternate ending 的空 onset/duration 和可缺失的全空 `gracenote` 列。

Roman numeral gold 通过 global/local key、相对五度 root/bass 和 chord type 映射为绝对拼写的 `ChordSymbol`。无法无损表达的 Ger/Fr/It、changes 或未知 label 明确计入 unsupported，不猜测近似和弦。family slices 区分 triad、seventh、inversion、applied/chromatic、augmented-sixth、Neapolitan、extended/altered 和 unsupported。

K331 全奏鸣曲固定为 eval。仓库中的 Turkish March MXL 与 DCML K331-3 来自不同版本，书面小节数不同，禁止按 measure number 强行拼接。

K331-3 pilot 不直接读取 MSCX、MusicXML 或仓库中的 Turkish March MXL。它从同一 DCML 版本的 `measures/K331-3.measures.tsv` 与 `notes/K331-3.notes.tsv` 构造无答案泄漏的 `HarmonyAnalysisInput`，再把 analyzer 输出与 `harmonies/K331-3.harmonies.tsv` 规范化得到的专家 gold 比较。三份 TSV 共享 `quarterbeats_all_endings` 时间轴；`MS3/K331-3.mscx` 只是它们的制谱来源，不参与 CLI 执行。

当前比较是 gold-onset anchored：每条 gold 使用覆盖其起点的预测 segment，并按完整 gold duration 加权；它不是预测/gold 区间切分后的 duration-overlap confusion matrix。因此预测在 gold 区间中间改变和弦不会被拆分计分，两个 gold onset 之间的额外预测边界也不会被完整计为 false positive。现有指标适合确定性回归；若用于更严格的边界调优，应先升级为区间重叠评测。

### POP909

POP909 adapter 解析标准 MIDI 音符和 tempo，用 `beat_midi.txt` 建立 independent written grid，再映射 `chord_midi.txt` intervals。这样 gold 只用于评测，不向 boundary lattice 泄漏正确答案。General MIDI channel 10 percussion 不作为和声证据。

POP909 作为独立流行钢琴域报告，不与 DCML 古典域求平均。当前固定 4-song pilot 用于回归 adapter、标签映射和域外退化，不声称代表整个 909-song 分布。

### ASAP

ASAP adapter 通过 production MusicXML 投影和 analyzer 打开固定的跨作曲家样本，只报告 files/parsed/failed、notes、measures、segments 和 runtime。ASAP 没有本协议所需的专家 chord ranges，因此任何 Top-1、Top-8、precision 或 boundary accuracy 声明都是无效的。

## 指标定义

| 指标                   | 含义                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| mapping coverage       | 能无损映射为内部 ChordSymbol 的 gold 比例                                    |
| unsupported-label rate | 无法无损映射的 gold 比例                                                     |
| Top-1 accuracy         | alternatives 第一名与 mapped gold 完全相等的时长加权比例                     |
| Top-8 oracle recall    | mapped gold 是否出现在最多 8 个 alternatives 中                              |
| resolved precision     | analyzer 已 resolved 的区间中，完整 chord 正确的时长加权比例                 |
| resolved coverage      | mapped gold 时长中被 analyzer resolved 的比例                                |
| boundary F1            | 预测和弦变化边界与 gold 变化边界的 F1                                        |
| ECE                    | confidence 与完整 chord 正确率的 10-bin expected calibration error，越低越好 |

完整 chord 相等要求 root、bass、kind、extension 和 degrees 都一致。报告另外输出这些 facets，以及 corpus/chord-family slices；最多保留 50 条定位到 piece、group、measure、offset、label、family 和错误类别的样本。

Top-1/Top-8 使用 analyzer 独立生成的 `alternatives`，不是 primary path。相邻同和弦 segment 合并后的 alternatives 仍必须稳定去重且最多为 8；primary chord 不承诺位于 alternatives 第一项或一定包含在列表中。

dataset eval report 从 `2.1.0` 起增加 `diagnostics`：全量 observation 按数量和时长统计 outcome，并按 chord family 展开；unresolved 明确拆成 alternatives 第一名正确、Top-8 内命中和 Top-8 缺失。报告同时给出 10 个 confidence bins，以及固定阈值上的 post-decision precision/coverage curve。当前 unresolved 已丢弃 primary chord 和原始 confidence，因此这条 curve 只比较现有 resolved 结果在更高阈值下的拒识行为，不能用来模拟降低当前决策阈值；raw primary calibration 属于后续算法迭代。

错误定位样本按 category 各保留最多 5 条、总数最多 50 条，顺序由 corpus/piece 的稳定遍历决定。`diagnostics.errors` 才是全量错误簇计数，不能再用样本数组长度判断最大错误簇。既有 accuracy baseline 仍使用 `1.0.0`，compare 会忽略新增 diagnostics，因此无需迁移 baseline 数值。

## 当前冻结基线

以下是版本化 baseline JSON 的便读摘要；比较时以 JSON 文件为准：

| case                  | eval gold | mapped |  Top-1 |  Top-8 | precision | coverage | boundary F1 |    ECE |
| --------------------- | --------: | -----: | -----: | -----: | --------: | -------: | ----------: | -----: |
| Mozart v2.3           |     4,395 |  3,720 | 24.32% | 50.71% |    40.32% |   83.62% |      84.70% | 32.10% |
| Schumann Kinderszenen |       948 |    753 | 38.21% | 76.60% |    71.45% |   82.44% |      88.92% |  9.10% |
| Chopin Mazurkas       |     1,197 |    967 | 36.35% | 65.51% |    56.00% |   83.43% |      89.88% | 22.03% |
| Beethoven Sonatas     |     2,060 |  1,794 | 14.90% | 38.76% |    30.20% |   81.61% |      87.28% | 39.34% |
| POP909 pilot          |       282 |    277 | 38.81% | 54.88% |    35.12% |   62.54% |       4.96% | 26.69% |

这些数字是回归起点，不是发布达标声明。尤其 POP909 boundary F1 很低，说明当前 beat-grid 上的序列边界仍是主要错误簇；不能通过改用 gold intervals 建 model 来“修复”该指标。

baseline 文件：

- [`dcml-mozart-v2.3.json`](../../../test-fixtures/harmony/baselines/dcml-mozart-v2.3.json)
- [`dcml-cross-corpus.json`](../../../test-fixtures/harmony/baselines/dcml-cross-corpus.json)
- [`pop909-piano-v1.json`](../../../test-fixtures/harmony/baselines/pop909-piano-v1.json)

## No-regression 比较

`compare` 严格锁定 split 和 gold/mapped/unsupported 数量。mapping coverage、Top-1、Top-8、precision、coverage 和 boundary F1 的方向是越高越好；ECE 越低越好。当前 baseline 容差为绝对值 0.005。

目标 slice 的改善只有在 Mozart、此前冻结的 DCML corpus 和 POP909 都通过相应 baseline 时才能接受。完整迭代顺序和产物要求见 [`tuning-loop.md`](tuning-loop.md)。

## 数据许可与发布边界

外部 corpus 只用于本地开发和研究评测，不进入产品 bundle。DCML 与 ASAP 当前 manifest 标记为 CC BY-NC-SA 4.0；POP909 仓库标记为 MIT，但重新分发歌曲 MIDI 前仍需单独审查底层作品权利。来源、revision、许可和 archive SHA 以 [`manifest.json`](../../../test-fixtures/harmony/datasets/manifest.json) 为准。
