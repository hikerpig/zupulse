# OLiMPiC real multi-system evaluation v1

本报告记录 `olimpic-6007571-full-page` 的首次真实 multi-system Rokot evaluation。输入为 OLiMPiC dev 中
4 页、15 systems 的真实扫描派生 PDF；ground truth 仅用于 benchmark 结束后的 quality evaluation，不进入
engine segmentation、recognition 或 joining。

## Result

2026-08-26 使用 `real-multisystem-manifest.json` 单独运行该 item。Rokot environment inspection 成功，但第 0 页
在 `staff-system-topology` fail closed：检测到 10 个 staff groups，其中 6 个无法唯一配对。item 返回
`ENGINE_OUTPUT_INVALID / ambiguous-system-segmentation`，没有调用 system recognition，没有生成
`joining.json`、merged MusicXML 或 symbolic quality metrics。

case evaluator 将该结果判为 `NOT_EVALUATED / engine-item-failed`。这证明评测用例已经可执行，并如实暴露
当前 blocker；它不构成 Rokot note-level quality 结论，也不能用 source mapping、其他 engine artifact 或人工 crop
替代失败结果。当前 decision 为 `STOP`，下一步仍是 learned layout detector experiment。

## Reproduce

先按本机环境设置四个 `PDF_OMR_ROKOT_*` 路径，然后从仓库根目录运行：

```bash
pnpm exec vite-node tools/pdf-omr-cli/src/cli.ts benchmark \
  --manifest tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/real-multisystem-manifest.json \
  --engine rokot \
  --output /new/benchmark-run

pnpm exec vite-node tools/pdf-omr-cli/scripts/evaluate_real_multisystem_case.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/real-multisystem-case.json \
  /new/benchmark-run \
  /new/evaluation.json
```

必须从仓库根目录运行，以便 PDF.js 从根 `node_modules/pdfjs-dist/wasm` 加载 JBIG2 decoder。输出路径必须不存在。
generated benchmark run 不提交；仓库只保留本 README 与 `summary.json`。
