# OLiMPiC scanned full-page development corpus v1

状态：development-only。仓库已冻结 manifest、source mapping、派生 `input.pdf` 与 MusicXML truth；它们不得被解释为
holdout 或产品分发许可已经确认。

本目录记录 C01/C02 的可复查 provenance 和确定性选样。数据来自 OLiMPiC `datasets` release 的 `dev`
split；原始 source archive 保留在外部 cache，不提交 Git。`6586696` 已确认属于 `samples.test.txt`，
不进入本 corpus；`6007571` 是 dev 中 4 页/15 systems 的 page-shape representative，不代表质量回归结论。

## Selected works

| Stratum |      Work | Pages | Systems |
| ------- | --------: | ----: | ------: |
| small   | `4945954` |     3 |      12 |
| small   | `4976604` |     2 |       9 |
| medium  | `4985990` |     5 |      24 |
| medium  | `6007571` |     4 |      15 |
| large   | `5862368` |     7 |      27 |
| large   | `6011095` |     8 |      34 |

合计 6 works、29 pages、121 systems。精确规则和 archive hashes 见 `selection.json`。

`real-multisystem-manifest.json` 将 `6007571` 单独固定为真实 full-page multi-system development case；
`real-multisystem-case.json` 绑定输入、truth、source mapping hashes，以及 4 页/15 systems 的 evaluation-only
预期。source mapping 不进入 runtime segmentation。

## Reproduce selection

```bash
python3 tools/pdf-omr-cli/scripts/select_olimpic_dev_corpus.py \
  --samples-dev /path/to/olimpic-1.0-scanned/samples.dev.txt \
  --output tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/selection.json \
  --source-archive-sha256 8b77529d06cbf3d0f392af7ea5457906a510cf6ca7dad8eb751f6839bfde39f8 \
  --source-archive-bytes 1589585159 \
  --scanned-archive-sha256 a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993 \
  --scanned-archive-bytes 225607163
```

## License boundary

OLiMPiC dataset release 声明为 CC BY-SA 4.0；source archive 未提供每份 IMSLP PDF 的独立 rights 清单。
在 C03 生成派生 PDF 前，必须逐项记录 source PDF 的 provenance/license；未确认的 item 不得进入冻结
corpus，也不得提交到仓库或用于产品分发。
