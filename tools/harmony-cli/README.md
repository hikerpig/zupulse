# @zupulse/harmony-cli

Node.js 下的 Harmony 检查、评测与 Semi-CRF 离线训练工具。它直接复用
`@zupulse/web-core` 的 MusicXML 投影和生产分析逻辑，不维护第二套 analyzer。

## Inspect

```bash
pnpm -s harmony:cli inspect path/to/score.mxl
pnpm -s harmony:cli inspect path/to/score.mxl --view model
pnpm -s harmony:cli inspect path/to/score.mxl --view result
```

stdout 是版本化 JSON；alphaTab warning 写到 stderr。`model` 是 `HarmonyAnalysisInput`，`result` 是
生产 `HarmonySegment[]`。

## Benchmark

```bash
pnpm benchmark:harmony
pnpm -s harmony:cli benchmark path/to/score.mxl \
  --runs 5 \
  --warmup-runs 1 \
  --expected-result-sha256 <sha256>
```

Benchmark 只调用生产 `analyzeHarmony`，不维护第二套 analyzer。它把文件读取、MusicXML
parse/projection 和 analysis-only 时间分开记录，并报告每次 analysis 样本、median、RSS、输入规模、
运行环境和 canonical result checksum。根命令默认使用 K331 fixture 与受版本控制的 golden checksum；
显式 benchmark 不进入快速验证。

## Structural regression

```bash
pnpm -s harmony:cli eval
pnpm -s harmony:cli eval path/to/manifest.json
```

默认读取 `test-fixtures/harmony/regressions/manifest.json`。结构回归锁定输入投影和结果摘要，不代表
准确率；任一 case 失败时仍输出 JSON，并以 exit code 1 结束。

## Dataset evaluation

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data \
  --case dcml-mozart-v2.3 \
  --split tune \
  --decision-threshold 0.6
```

DCML 与 POP909 accuracy adapter 只调用生产 `analyzeHarmony`。报告中的
`boundaryPolicy` 固定为 `paper-basic-events`；CLI 不提供其他 analyzer 切换参数。

## Semi-CRF records、训练与评测

```bash
pnpm -s harmony:cli paper-semi-crf-records /path/to/folds/train1.txt \
  --labels /path/to/bach_dataset_chords.txt \
  --role train \
  --output /tmp/paper-train.json \
  --max-segment-length 20

pnpm -s harmony:cli paper-semi-crf-train /tmp/paper-train.json \
  --output /tmp/paper-model.json \
  --checkpoint /tmp/paper-checkpoint.json \
  --report /tmp/paper-train-report.json \
  --max-iterations 165 \
  --min-feature-count 4 \
  --l2 0.125

pnpm -s harmony:cli paper-semi-crf-eval /tmp/paper-tune.json \
  --model /tmp/paper-model.json \
  --output /tmp/paper-eval.json
```

训练 records 只接受 `role: train`，普通评测只接受 `tune`。读取 `final` 必须显式增加
`--allow-final`。恢复训练使用 `--resume`，并校验 records、label inventory、span、L2 和 feature
threshold。

DCML faithful-window records：

```bash
pnpm -s harmony:cli paper-semi-crf-dcml-records \
  test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /path/to/harmony-data \
  --case dcml-mozart-v2.3 \
  --split train \
  --output /tmp/mozart-train.json \
  --report /tmp/mozart-train-report.json
```

该命令只导出 train/tune role，在 unsupported、unaligned 或 span>20 的位置切断窗口。外部语料、
records、checkpoint 与训练模型不进入 Git。

指标语义与当前证据见 [`docs/evaluation.md`](docs/evaluation.md) 和
[`docs/evaluation/semi-crf.md`](../../docs/evaluation/semi-crf.md)。
