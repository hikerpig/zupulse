# Staff-line detector runtime gate v1

状态：`runtime-validated-integration-not-approved`。`compact-dilated-staff-line-cnn-v2` 已从 PyTorch checkpoint
确定性导出为 ONNX，并在 CPU-only ONNX Runtime 上复现全部 OLiMPiC development 输出；但产品集成暂不批准，因为
`onnxruntime-node` 的分发增量较大，proposal 要求的 package-size 上限尚未明确接受。

## Runtime result

- ONNX artifact：9,355 bytes，SHA-256
  `7a10294f324367d9a3a0237aec48941d3ac5f4517b7023a6698d260ed48e1951`；两次独立 export byte-identical，
  `onnx.checker` 通过。
- ONNX Runtime Python CPU probe：29 页完整 evaluator 分别耗时 1.15 s、1.18 s，约 39.7–40.7 ms/page；
  max RSS 分别 241,762,304、250,232,832 bytes。数字包含 session 创建、PNG 读取、resize、推理和确定性后处理，
  因此是保守的进程级 cold-to-complete 指标，不把它伪装为纯模型 latency。
- 两次 CPU report byte-identical，SHA-256
  `de5bed069fa4be1111825b6bf64eec0437fd3e5339523bdf58ec0bcaf71c6467`。逐页 predictions、parameters、
  admission summary 与既有 PyTorch/MPS canonical report 完全一致：9/29 pages、4/6 works。
- TypeScript boundary 再次 materialize 27 个合法页面；systems、crop hashes 与 summary 和既有 canonical crop report
  完全一致。CPU materialization report SHA-256：
  `3a99a82d737306e36a39e2f5da5e36e555d6f476620e0af9cbc62402c93b596f`。

## Product dependency audit

候选产品 runtime 是 `onnxruntime-node@1.29.0`，不是 Python/PyTorch：

- 官方 Node binding CPU prebuilt 覆盖 Windows x64/arm64、Linux x64/arm64、macOS x64/arm64；Zupulse 当前发布目标是
  macOS arm64 与 Windows x64。
- package 与 ONNX Runtime source license 均为 MIT。实际安装得到 17 个 packages；声明 license 只包含 MIT、
  BSD-3-Clause、ISC 与 `(MIT OR CC0-1.0)`，没有 copyleft transitive dependency。
- npm `dist.unpackedSize` 为 296,334,136 bytes；本机 `--ignore-scripts` 安装后的完整 dependency tree 为
  299,077,632 bytes。package 同时携带多个 OS/architecture binaries，不会在 postinstall 自动删除非目标文件。
- 当前目标所需 native files 约为 macOS arm64 88,043,128 bytes、Windows x64 66,310,760 bytes；若产品接入，
  packaging 必须明确裁掉其他平台文件，并验证 native addon 从 packaged Electron 启动。
- 默认 CPU binaries 已随 npm package 提供，不需要运行时联网。postinstall 只为 metadata 指定且缺失的 execution
  provider artifacts 下载文件；产品必须固定 CPU-only install/package 行为并在离线 build 中验证。

训练 source 是固定 revision 的 CC0 OpenScore Lieder，模型从零训练，不含第三方 pretrained weights。权重的产品分发
权利归 Zupulse 项目；正式随 App 发布时仍需在产品 license inventory 中登记这一 project-produced artifact。

## Decision

CPU correctness、determinism、latency、RSS、runtime license 与目标平台可用性均通过。当前唯一 `STOP` 是尚未接受
66–88 MB 的 target-specific native 增量（或 296 MB 未裁剪增量）。因此本轮可以继续做不新增 runtime dependency 的
shared detector contract/crop identity proof，但不得把 `onnxruntime-node`、ONNX weights 或推理开关接入 Desktop。

## Reproduce

```bash
/tmp/zupulse-onnx-export-venv/bin/python \
  tools/pdf-omr-cli/scripts/export_staff_line_onnx.py \
  --checkpoint /tmp/zupulse-staff-line-candidate-v2/model.pt \
  --output /tmp/zupulse-staff-line-candidate-v2/model-a.onnx

/usr/bin/time -l python3 tools/pdf-omr-cli/scripts/evaluate_staff_line_detector.py \
  --runtime onnxruntime \
  --device cpu \
  --render-root /tmp/zupulse-olimpic-layout-pages-v1 \
  --corpus-root tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1 \
  --checkpoint /tmp/zupulse-staff-line-candidate-v2/model-a.onnx \
  --output /tmp/zupulse-olimpic-learned-layout-ort-c.json

pnpm exec vite-node tools/pdf-omr-cli/scripts/materialize_learned_layout_pilot.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/manifest.json \
  /tmp/zupulse-olimpic-learned-layout-ort-c.json \
  /tmp/zupulse-olimpic-learned-layout-ort-materialization.json

pnpm view onnxruntime-node@1.29.0 version dist.unpackedSize license os cpu --json
npm pack onnxruntime-node@1.29.0 --pack-destination /tmp
```
