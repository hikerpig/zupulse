# @zupulse/harmony-cli

Node.js 下的 Harmony 检查与结构回归工具。它直接调用 `@zupulse/web-core` 的 MusicXML 投影和生产分析逻辑，不启动浏览器，也不维护第二套算法。

## Inspect

从仓库根运行。给人阅读时可省略 `-s`；给 agent 或 JSON 管道使用时必须加 `-s`，避免 pnpm banner 混入 stdout。

```bash
# model + result
pnpm -s harmony:cli inspect path/to/score.mxl

# 只看 MXL 投影后的 HarmonyAnalysisInput
pnpm -s harmony:cli inspect path/to/score.mxl --view model

# 只看最终 HarmonySegment[]
pnpm -s harmony:cli inspect path/to/score.mxl --view result
```

兼容旧形式：

```bash
pnpm -s harmony:cli path/to/score.mxl --view result
```

stdout 是版本化 JSON envelope：

```json
{
  "schemaVersion": "1.0.0",
  "command": "inspect",
  "source": { "name": "score.mxl", "sha256": "..." },
  "model": {},
  "result": []
}
```

`--view model|result` 会省略另一个 payload，但始终保留版本和 source SHA-256。alphaTab parser warning 写到 stderr。

## Eval

```bash
# 默认 manifest
pnpm -s harmony:cli eval

# 指定 manifest
pnpm -s harmony:cli eval path/to/manifest.json
```

默认读取 `test-fixtures/harmony/regressions/manifest.json`。manifest 中的 score 路径相对 manifest 自身解析，并由 SHA-256 防止 fixture 被静默替换。

- 全部通过：exit code 0，JSON `summary.failed` 为0。
- 任一结构回归失败：exit code 1，stdout 仍是 JSON，每个失败字段包含 expected/actual。
- manifest、文件或 schema 无效：exit code 1，错误写 stderr。

当前 Turkish March case 是 `structural-regression`：它只锁定解析模型和算法结果摘要，不代表和弦正确。只有人工审核的时间区间与和弦标签才能成为 accuracy gold。

### Paper-compatible Semi-CRF

论文复现与训练流程继续使用独立的 versioned records；默认 product evaluation 已由 ADR 0066
切换到 bundled paper-compatible Semi-CRF。训练 records 只接受 `role: "train"`；评测只接受
`tune`，读取 `final` 必须显式传入 `--allow-final`。

```bash
pnpm -s harmony:cli paper-semi-crf-records /path/to/folds/train1.txt \
  --labels /path/to/bach_dataset_chords.txt \
  --role train --output /tmp/paper-train1-records.json \
  --max-segment-length 20

pnpm -s harmony:cli paper-semi-crf-train /path/to/train-records.json \
  --output /tmp/paper-model.json \
  --checkpoint /tmp/paper-checkpoint.json \
  --report /tmp/paper-train-report.json \
  --max-iterations 100 --min-feature-count 4 --l2 1

pnpm -s harmony:cli paper-semi-crf-eval /path/to/tune-records.json \
  --model /tmp/paper-model.json \
  --output /tmp/paper-tune-report.json
```

恢复训练时增加 `--resume /tmp/paper-checkpoint.json`；CLI 会校验 records SHA-256、label inventory、
`maxSegmentLength`、L2 和 feature count threshold，防止 checkpoint 被用于另一份语料或配置。训练与评测
报告都标记 `provenance: "fresh"`，不会与作者归档结果混写。外部 BaCh records、模型和 checkpoint 不进入
Git。

### Dataset eval

Phase 8 的 v2 manifest 把带专家 gold 的 accuracy、只有谱面结构的 ingestion robustness、只有标签的 prior corpus 分开。外部数据不进 git；下载并解压到本地目录后运行：

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json --data-root /path/to/harmony-data

# 只生成 tune split 的诊断；不能用于 frozen baseline compare
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 --split tune
```

边界策略实验使用显式参数，当前生产默认仍是 `dense-note-events`：

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 --split tune \
  --boundary-policy metric-beats
```

`metric-beats` 只保留小节线、音乐拍点和 mandatory boundary；若它漏掉拍内真实变化，唯一预登记的折中方案是 `metric-half-beats`。实际 policy 会写入 accuracy case。

`data-root` 下必须同时存在 manifest 声明的 archive 和解压目录。CLI 先校验 archive SHA-256，再运行 adapter。DCML 报告包含作品级 split、mapping/unsupported、Top-1/Top-8、resolved precision/coverage、boundary F1、ECE、facets、chord-family slices 和最多 50 条错误定位。当前固定 Mozart 数据为 v2.3；K331 整首奏鸣曲强制属于 eval。可用 `--case <id>` 只运行一个 corpus。

dataset manifest 当前为 `2.0.0`，生成的 eval report 为 `2.7.0`。accuracy case 的 `reportSplit` 明确本次指标来自 train、tune 还是 eval；省略 `--split` 时固定为 eval，baseline compare 会拒绝非 eval report。`--decision-threshold 0..1` 可生成校准所需的未拒识报告，默认仍为 `0.6`，实际值记录在 accuracy case。report 的 `diagnostics` 提供全量错误簇、family outcome、confidence bins、post-decision precision/coverage curve，以及按联合区间计算的 duration overlap 与容差 boundary 指标；`top1Accuracy` 表示 alternatives 第一名，`predictedPrimaryAccuracy` 表示 threshold 前的最终 primary，`segmentDensity` 表示输出切分密度。`errors` 只保存每类有限的定位样本，不用于统计簇大小。

Primary reranker 的训练 records 使用预登记 v3 协议导出：

```bash
pnpm -s harmony:cli ranking-records test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /path/to/harmony-data \
  --case dcml-mozart-v2.3 \
  --output /tmp/mozart-ranking-records.json \
  --max-train-groups 3
```

导出器先校验 archive、corpus revision 和完整 group-set hash，默认只处理 v3 `train` group；`tune` 必须显式请求，regression 和 final holdout 永远不会生成 records。`--max-train-groups` 按排序后的 group ID 做确定性上限采样，不改变完整语料校验。每条记录来自生产 analyzer 的实际 range 和 Top-8，标记 `oracle-hit`/`oracle-miss`，特征及 score 最多两位小数。

为线性 reranker 生成选择报告时显式使用 `--split tune`；该报告不能进入训练，final holdout 也不能由此命令导出：

```bash
pnpm -s harmony:cli ranking-records test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 \
  --split tune --output /tmp/mozart-ranking-tune.json
```

训练器只接受 train reports，并对 corpus 和完整作品做等权处理；评测器只接受 tune reports：

```bash
pnpm -s harmony:reranker train /tmp/harmony-linear.json \
  /tmp/mozart-ranking-train.json /tmp/beethoven-ranking-train.json

pnpm -s harmony:reranker evaluate /tmp/harmony-linear.json \
  /tmp/mozart-ranking-tune.json /tmp/beethoven-ranking-tune.json
```

模型是带来源 hash 的两位小数 JSON 权重；PyTorch 不参与这一基线，也不进入产品运行时。

ranking report `1.1.0` 显式记录 `split` 和 `groupsSha256`。训练器可只读迁移早期 train-only `1.0.0` report 的 `trainingGroupsSha256`，但所有新导出都写 `1.1.0`。

Boundary evidence 使用独立 records 和线性训练器。特征只读取 meter 与 notes；gold 只生成 train/tune 标签。`learned-evidence` 是显式 opt-in，必须同时提供模型文件：

```bash
pnpm -s harmony:cli boundary-records test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 \
  --split train --output /tmp/mozart-boundary-train.json

pnpm -s harmony:boundary train /tmp/boundary-raw.json /tmp/mozart-boundary-train.json
pnpm -s harmony:boundary tune /tmp/boundary.json /tmp/boundary-raw.json /tmp/mozart-boundary-tune.json

pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 --split tune \
  --boundary-policy learned-evidence --boundary-model /tmp/boundary.json
```

线性资产只有 5 个两位小数权重与一个阈值，产品推理是确定性 TypeScript，不依赖 Python 或 PyTorch。小节线与 musical beats 固定保留，模型只筛选其余 note-event 边界。

仅当线性模型在 train/tune 稳定欠拟合、且 residual 证明存在非线性交互时，才可用本地
PyTorch 离线训练最多两层的 MLP；`--tune-report` 会用量化后的权重重新评测：

```bash
python3 scripts/train-harmony-mlp.py /tmp/harmony-mlp.json \
  /tmp/mozart-ranking-train.json /tmp/beethoven-ranking-train.json \
  --tune-report /tmp/mozart-ranking-tune.json \
  --tune-report /tmp/beethoven-ranking-tune.json

pnpm -s harmony:reranker evaluate-mlp /tmp/harmony-mlp.json \
  /tmp/mozart-ranking-tune.json /tmp/beethoven-ranking-tune.json
```

训练脚本不属于 workspace 依赖，Browser、Electron 和 harmony CLI 均不加载 PyTorch。

冻结基线比较会锁定 split/gold 数量；mapping、Top-1/Top-8、precision、coverage、boundary F1 只允许在容差内下降，ECE 只允许在容差内上升：

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data > /tmp/current.json
pnpm -s harmony:cli compare \
  test-fixtures/harmony/baselines/dcml-cross-corpus.json /tmp/current.json
```

`compare` 始终输出逐字段 JSON diff；有回退时 `summary.failed > 0` 且 exit code 为 1。基线当前容差为 0.005。跨作曲家切片把 common triad/seventh、inversion、applied/chromatic、augmented-sixth、Neapolitan、extended/altered 和 unsupported 分开，避免总分掩盖特定和弦族退化。

当前 v2 manifest 还包含两个独立角色：

- `pop909-piano-v1`：从 MIDI 与 beat 网格构造 model，再映射 chord intervals；4 首 pilot 按完整歌曲 split，流行域指标单独冻结在 `pop909-piano-v1.json`。
- `asap-musicxml-v1.1`：5 首 MusicXML 的 ingestion 样本，只输出 parsed/failed、notes、measures、segments 和 runtime，不输出 chord accuracy。

ChoCo 与 WJazzD 保持 `label-prior-corpus` 角色，不在 active 端到端报告中。任何 label-only prior 必须由 `buildTrainLabelPrior` 从 train-only records 生成；传入 tune/eval 会失败。数据角色、adapter、指标和当前基线见 [`docs/evaluation.md`](docs/evaluation.md)，完整调优顺序和产物规范见 [`docs/tuning-loop.md`](docs/tuning-loop.md)。

## Manifest

```json
{
  "schemaVersion": "1.0.0",
  "id": "harmony-regressions-v1",
  "cases": [
    {
      "id": "turkish-march-structure",
      "kind": "structural-regression",
      "score": "../../musicxml/K331-3_reviewed.mxl",
      "sha256": "...",
      "expected": {
        "model": { "measures": 147, "tracks": 1, "staves": 2, "notes": 1736 },
        "result": { "segments": 365, "resolved": 305, "unresolved": 60 }
      }
    }
  ]
}
```

不要提交完整 result snapshot 或把当前算法输出复制成 gold。算法行为有意变化时，先查看字段 diff，再人工更新小型摘要。

## Development

```bash
pnpm --filter @zupulse/harmony-cli test
pnpm --filter @zupulse/harmony-cli typecheck
```

测试包含参数/Schema、真实 MXL 投影、Turkish March manifest，以及实际进程的 stdout 和 exit code。
