# OpenScore Lieder layout training source v1

状态：`staff3-dataset-built`。本目录固定可用于 learned layout pretraining 的 CC0 source plan；≤3-staff 数据集已完成
构建与验证，但不改变任何 runtime、development protocol 或 frozen holdout。

## Source boundary

- 上游：`OpenScore/Lieder` revision `6b2dc542ce2e8aa4b78c8ee62103b210efc07015`。
- 许可：`CC0-1.0`；`source-plan.json` 固定 `LICENSE.txt` 与 `data/scores.tsv` 的 SHA-256。
- 上游 metadata 有 1,356 个 score records；固定 tree 中有 4 个 record 缺少对应 `.mscx`，因此 fail closed 排除。
- 仓库现有 OLiMPiC evaluation evidence 引用的 75 个 OpenScore score IDs 全部排除，避免训练内容进入当前
  development/holdout evidence。
- 最终 1,277 个 eligible scores：1,144 train、133 validation。split 以 composer 为组进行确定性 hash，两个 split
  不共享 composer。

`source-plan.json` 是 source eligibility 和 selection evidence，不是已生成数据集。它枚举每个 eligible `.mscx`
source path，便于后续在独立 cache 中逐项校验和渲染；数据 bytes 不提交仓库。

## Reproduce

先从固定 revision 取得 `data/scores.tsv`、`LICENSE.txt` 和全部 `scores/**/*.mscx` path，再执行：

```bash
python3 tools/pdf-omr-cli/scripts/plan_openscore_lieder_layout_corpus.py \
  --scores-tsv /path/to/scores.tsv \
  --source-paths /path/to/source-paths.txt \
  --protected-work-ids tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/protected-evaluation-work-ids.txt \
  --source-revision 6b2dc542ce2e8aa4b78c8ee62103b210efc07015 \
  --scores-tsv-sha256 a45bd0b2772a43dd830054f605dc3da564d57aace02992ee2bd93ee5c8e893a9 \
  --license-sha256 a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499 \
  --output tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/source-plan.json

pnpm exec oxfmt tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/source-plan.json
```

## Renderer probe and next gate

独立 renderer/annotation probe 已固定 MuseScore 4.7.4 build 7688c00、bundled fonts、export settings 与 output
hashes，并由本仓库自行实现 SVG/layout extraction。15-score probe 的 raster 与 canonical annotations 通过双跑确定性
检查和 9-page 人工审计；证据见 `reports/exploratory/openscore-lieder-layout-renderer-probe-v1/`。

staff-bounded synthetic training artifacts 已只选择 declared staff count 不超过 3 的 1,038 train / 131 validation
scores；其余 108 scores 在渲染前排除。完整统计、确定性证据与复现命令见
`reports/exploratory/openscore-lieder-staff3-dataset-v1/`。不得复制 OLA 中标记为 `license unspecified` 的 annotation
extraction 实现。

OpenScore Lieder 是 synthetic typeset source。它适合 pretraining 和 topology supervision，但不能替代真实扫描的
OLiMPiC development admission；任何模型仍须在未参与训练的 real-scanned pages 上通过现有 gate。
