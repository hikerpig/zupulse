# OLiMPiC learned layout development pilot v1

状态：`viability-passed-research-only`。固定 `compact-dilated-staff-line-cnn-v2` 对全部 6 works / 29 pages 运行，
没有按页选择 detector，也未读取 frozen holdout。

## Admission result

- 9/29 pages 的 ordered system count 与冻结 `source-mapping.json` 一致，且每个预测 system center 落在对应 truth
  bbox 内；覆盖 4/6 works，超过 proposal 的“非零且至少两个 work”继续投资门槛。
- Per-work admitted pages：`4945954` 2/3、`4976604` 0/2、`4985990` 1/5、`6007571` 0/4、
  `5862368` 4/7、`6011095` 2/8。
- 27/29 pages 产生的 raw outputs 通过 `learned-staff-system-v1` schema、≤3 staff、line topology、bounds 与
  ordering validation；另外 2 页因零 systems fail closed。
- 两次完整 MPS inference report byte-identical；两次 TypeScript materialization report 也 byte-identical，121 个
  materialized crops 的 hashes 全部一致且互不重复。

该结果只通过最低 viability gate，不是发布门槛。20 个未准入页的主要失败为 missing staff evidence 或 connector
under/over-grouping；不应以全 corpus 恰好同为 121 个 materialized/expected systems 掩盖逐页错误。

## Immutable evidence

- Model checkpoint SHA-256：`e7f71ae048b91beddcc0ce383bcd51173b891e8e24199950fc1cd4e3c40de02b`。
- Render manifest SHA-256：`fbc55413a9a5503bcb46a6cbbc57dbfc8662123c431dba6eba62df122adc81bc`。
- Canonical inference report SHA-256：`17724e64c3dec0283452a650824b94a37f248a5bfeed49bc32de9e5ac0d59d82`。
- Canonical crop/materialization report SHA-256：`b8242463a7ae183b6f0ed75cadb3a662d5e04aac7a8c546102f39bc5ada70c83`。

`candidate.json` 保存逐页 raw learned output 与 truth admission；`materialization.json` 保存 boundary validation、staff
topology、pixel bboxes 与 crop hashes。PDF bytes、rendered PNG 和 model checkpoint 不提交仓库。

## Reproduce

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/export_layout_detector_pages.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/manifest.json \
  /tmp/zupulse-olimpic-layout-pages-v1

python3 tools/pdf-omr-cli/scripts/evaluate_staff_line_detector.py \
  --render-root /tmp/zupulse-olimpic-layout-pages-v1 \
  --corpus-root tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1 \
  --checkpoint /path/to/model.pt \
  --output candidate.json \
  --device mps

pnpm exec vite-node tools/pdf-omr-cli/scripts/materialize_learned_layout_pilot.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/manifest.json \
  candidate.json \
  materialization.json
```

下一 gate 是 CPU-only runtime、peak RSS、model/runtime license 与 Desktop macOS/Windows distribution。通过前不得接入
产品 shared detector，也不得把 Python/PyTorch 变成 runtime dependency。
