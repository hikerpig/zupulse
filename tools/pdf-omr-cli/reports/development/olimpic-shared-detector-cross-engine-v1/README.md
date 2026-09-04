# OLiMPiC shared detector cross-engine v1

状态：`completed-research-only-not-release-eligible`。本轮只使用 learned detector 已完全匹配 truth 的 9/29
development pages，没有读取 frozen holdout，也没有把 ONNX Runtime 或模型权重接入产品。

## Shared input proof

`buildSharedDetectorSystemInputs` 是 Rokot 与 LEGATO 共用的唯一 crop 物化入口。它重新校验 crop hash，按页与 system
顺序 fail closed，并把 1/2/3 staff 映射为 `single-staff`、`grand-staff`、`three-staff`。每个 RGBA crop 只编码一次
deterministic single-page PDF；两个 adapter 消费同一 path 和同一 input SHA，而不是各自重新裁切。

- 9 个 admitted pages 共生成 36 个 inputs：1 个 2-staff，35 个 3-staff。
- 两次完整物化 directory byte-identical；input manifest SHA-256 为
  `43f1370328c49ff0bc6870ecf1bd29f60bf0f5d14c73a28bc822f12b79ff4d8b`。
- Rokot 与 LEGATO 两份真实运行各包含同样 36 个 item IDs；ordered input SHA projection 都是
  `0d2d975042503d2c2ca0f0e84bbb8bfda5b8da999e3287bde48ce9c570cb10fc`。
- Rokot default context 仍为 `previous-prediction-headers-v1`，即固定传播安全的 `L/M/K`；本轮没有修改 prompt、
  decoder 或 recognition model。

## Layered result

### Detector

- exact admission：9/29 pages、4/6 works；classic full-page baseline 是 0/29。
- 20 个未准入页中，12 页 system count 不同，另有 8 页 count 相同但 ordered centers 不匹配。
- 27/29 页产生合法 learned output；2 页零 systems 并 fail closed。

### Recognition on the same 36 crops

- Rokot：33/36 完成 raw recognition + normalization；失败为 2 个 `unknown-rokot-voice`、1 个
  `abc-conversion-failed`。33 个成功结果全部带 blocking diagnostics；3-staff 第三谱表被保留为明确的 unsupported
  topology，不复制第二谱表伪造内容。
- LEGATO：35/36 完成 raw recognition + normalization；唯一失败为 `empty-page-part`。32 个成功结果已有 blocking
  diagnostics；对剩余 3 个逐一重跑最终 `validateDraft`，2 个因 `UNRESOLVED_TIE` 阻塞，1 个为
  `ready-with-warnings`。
- 这些 detector-derived crops 没有逐-system 对齐 MusicXML truth，因此不计算 Pitch/Onset/Duration/Joint F1；用
  process success 替代符号准确率会造成错误结论。既有 independent 46-system GT evaluation 仍是两引擎符号质量比较
  的事实源。

### End to end

- Rokot：0/36 可进入当前 export gate。
- LEGATO：1/36 可进入当前 export gate，明显优于 Rokot，但绝对完成率仍不足发布。
- 结论：共享 detector 已把真实扫描 full-page segmentation 从 0 页提升到 9 页，并证明两引擎输入一致；当前发布瓶颈
  同时包含 detector 20/29 页未准入、Rokot 3-staff 能力缺口、LEGATO timing/tie 结构错误。不能再用增加同类 synthetic
  页面或放宽 validator 掩盖这些失败。

真实 cross-engine run 因跨暂停/恢复执行，wall-time 包含非推理等待，不作为 latency evidence。detector CPU latency 与
RSS 使用独立 runtime gate 报告。

## Release decision

`STOP`：不启用产品 runtime。原因是 exact detector coverage 只有 31.0%、end-to-end readiness 只有 LEGATO 1/36，
并且 `onnxruntime-node` 仍有未接受的 66–88 MB target-native 分发增量。下一轮若继续，应优先针对真实扫描的 missing
staff evidence 与 connector under/over-grouping 做小规模 hard-case 训练；识别侧优先 LEGATO 的 time signature/tie
结构，而不是继续优化 Rokot 的 L/M/K。

## Reproduce

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/materialize_shared_detector_inputs.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/manifest.json \
  tools/pdf-omr-cli/reports/development/olimpic-learned-layout-v1/candidate.json \
  /tmp/zupulse-shared-detector-inputs-v1

pnpm exec vite-node tools/pdf-omr-cli/scripts/run_shared_detector_inputs.ts \
  /tmp/zupulse-shared-detector-inputs-v1/manifest.json \
  rokot \
  /tmp/zupulse-shared-detector-rokot-v1.json

pnpm exec vite-node tools/pdf-omr-cli/scripts/run_shared_detector_inputs.ts \
  /tmp/zupulse-shared-detector-inputs-v1/manifest.json \
  legato \
  /tmp/zupulse-shared-detector-legato-v1.json
```

结构化结论、artifact hashes、失败分类和 readiness 复核样本见 `summary.json`。大体积 crop PDFs 与逐项模型输出只保留在
外部 cache，不提交仓库。
