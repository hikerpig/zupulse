# PDF OMR CLI evaluation

## 当前状态

- Development protocol: completed
- Holdout protocol: frozen
- Real scanned protocol: `corpus/olimpic-scanned-v1/protocol.json` frozen at system-crop scope
- Full-page development protocol: `corpus/olimpic-scanned-full-page-dev-v1/protocol.json` frozen at full-page scope;
  development decision `STOP`
- App decision: not evaluated

本评测只覆盖 CLI 技术链路，不设计或批准任何 `apps/*` 集成。

## 评测可信度边界

Benchmark 在每个 item 运行 engine 前，先对 ground-truth Draft 执行同一套 `validateDraft`。如果 Harmony 或
MusicXML readiness 为 `blocked`，该 item 只写出 `ground-truth-validation.json`、`evaluation-limitation.json`
和 `error.json`，不生成 symbolic / Harmony pseudo-metrics；报告会将其计为
`BENCHMARK_EVALUATION_LIMITATION`，holdout gate 也会因为 `allItemsEvaluable` 失败。

没有可量化 `<duration>` 的 grace note 会保留 `MISSING_EVENT_TIMING`，但该 diagnostic 是显式的
`warning`：该事件不会被当成 timing 对齐输入，也不会因为这个已声明例外单独阻断 readiness。

预测 Draft 与 ground truth 不使用 engine-specific `partId` 对齐。评测器依据 staff structural role，并将
映射写入 `part-identity.json`；没有唯一映射或发生 role collision 时 fail closed，不能把 identity mismatch
解释成音符质量分数。

每个成功 item 的 runtime observation 必须包含 `inspect`、`recognize`、`normalize`、`validate`、`export` 五个
阶段的 wall time。Unix/macOS engine process runner 每 250ms 采样独立进程组；`processResources` 记录
`scope`、sample count、sample interval、平均/峰值 CPU，`peakRssBytes` 取完整 engine process tree 的
采样峰值，不再采样 benchmark Node 父进程。多 process 与重复运行以 sample count 加权 CPU average，并取 RSS/
CPU peak；aggregate report 保留对应分布。Windows 当前不提供该 `ps` 探针；GPU memory 和 cancel latency 仅在
独立 probe 可用时记录。资源探针缺失不会写零值；对应 `metricsAvailability` 和 holdout gate check 会明确失败，
避免缺失指标被误读为通过。

LEGATO 的成功 item 额外保存逐页 decoder telemetry：output token count、`maxLength`、termination、device 和
dtype；aggregate report 给出 token P50/P95/max 与 limit-hit count。development ablation 使用单进程串行 worker，
报告将 model load、cold request 与 warm request 分开，suite wall time 仍包含完整成本。缺少 telemetry 时字段保持
缺失且 `metricsAvailability.decoderTelemetry = false`。development beam 筛选只记录事实，不读取 holdout 或自动
作 promotion 决策。真实 corpus 筛选完成后，普通 `recognize` 使用 `beam=1 / maxLength=2048 / FP16` baseline。

### LEGATO real-corpus beam screening（2026-08-14）

后续筛选只读取 OLiMPiC development split，从 1,438 个可用条目中冻结 6 个不同 work、覆盖 easy/medium/hard
和首/中/末位置的真实扫描 system；每个 beam 对每项运行两次，共 12 次 recognition。外部 manifest SHA-256 为
`076b38ccffe94aeaa01a32a0d3cfb78071f93ebc29f98ec2f700e880270df005`，结果位于本机 cache
`public-pianoform-legato/legato-beam-1-2-4-v2/`，comparison SHA-256 为
`d129abab7944cf0c1b4d7a20fd358e9ca3ee85f84aaa66fbf6ac7cfecf6fae48`。没有读取 test/holdout。

beam 1/2 各有 4/6 项可评，beam 4 为 3/6；三者共同可评的 3 项用于以下同集合质量比较，避免把失败项变化
误算成准确率变化。

| beam | 可评项 | recognize P50 | joint F1 | pitch F1 | onset F1 |
| ---: | -----: | ------------: | -------: | -------: | -------: |
|    1 |    4/6 |        12.81s |   0.2737 |   0.8931 |   0.7550 |
|    2 |    4/6 |        20.76s |   0.2649 |   0.8789 |   0.7461 |
|    4 |    3/6 |        85.04s |   0.2725 |   0.8889 |   0.7516 |

在共同可评集合上，beam 4 相对 beam 1 的三个 core F1 都没有提升，反而分别低约
`0.0012 / 0.0042 / 0.0033`；beam 1 的 recognition P50 比 beam 4 低约 `84.94%`（约 `6.64x`）。因此按本轮
停止规则不测试 beam 10。结合共同可评集合的质量结果和显著运行时收益，正式 baseline 已改为 `beam=1`。
由于各 beam 的完整成功/失败集合不同，canonical gate 仍保持 fail-closed，不能把完整 aggregate 当成可直接
比较的质量证据。

每个成功 item 还保留 `engine/normalization-output.bin`。对 Rokot，它是严格按 `pageIndex/systemIndex`
排序的 system bundle；同一 item 的 `joining.json` 汇总 system span、local measure numbers、global measure
boundaries 和 normalized measure count。结合 `segmentation.json`、`systems/*` 与 `predicted-draft.json`，
可以在不重新运行 engine 的情况下复查 system 顺序、跨 system measure identity 和 Draft source boundary。

## Development corpus

`corpus/evaluation/manifest.json` 包含两个自建 CC0 work。`melody-eight` 的 clean、low-contrast 和
blur 三个 variant 全部属于 development；`piano-eight` 的两个 variant 全部属于 holdout。按
`workId` 隔离，任何同源 variant 都不会跨 split。

该 corpus 只验证冻结流程和基础印刷谱识别，不能代表真实扫描、手写谱、复杂复调或大编制。
因此即使 holdout 通过，也只能支持扩大 corpus 的 `INVESTIGATE`，不能凭五个 synthetic items
直接批准产品化。

### OLiMPiC scanned system intake v1

`corpus/olimpic-scanned-v1/manifest.json` 引入两个来自 OLiMPiC 1.0 scanned release 的真实扫描 system
sample：`6586696/p1-s1` 进入 development，`6245974/p1-s1` 进入 holdout。每个 item 记录 source split、
release、sample ID、archive SHA-256、PDF/MusicXML SHA-256 与 CC BY-SA 4.0 许可来源；`verifyCorpusManifest`
继续拒绝同一 `workId` 跨 split。

这是 system-level intake，不是 full-page corpus。协议因此显式冻结
`segmentation.scope = "system-crop"`，不能用它证明整页 segmentation 或跨 system joining；full-page
重新评估仍需独立 corpus/protocol。

### OLiMPiC full-page development intake v1（selection/C06）

`corpus/olimpic-scanned-full-page-dev-v1/` 已冻结 C01–C04 的 provenance、selection、full-page artifacts 和
benchmark protocol。选样只来自 `samples.dev.txt`，按 2–3、4–6、≥7 页分为 small/medium/large，各选两个
work，共 6 个 work、29 pages、121 systems：`4945954`、`4976604`、`4985990`、`6007571`、`5862368`、
`6011095`。`6586696` 已确认属于 `samples.test.txt`，保留为外部 regression reference，不进入 dev split。

source archive（`1589585159` bytes，SHA-256
`8b77529d06cbf3d0f392af7ea5457906a510cf6ca7dad8eb751f6839bfde39f8`）和 scanned archive（`225607163`
bytes，SHA-256 `a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993`）只保留在外部 cache。
source archive 没有逐份 IMSLP PDF 的独立 rights 清单；`source-provenance.json` 明确记录每个 source PDF
的 `rightsStatus = "pending-item-review"`。这些派生文件仅用于本地研究评测；在逐项 rights review 完成前
不得打包、分发或用于产品数据。

`scripts/build_olimpic_full_page_corpus.py` 已完成 C03：根据 `corpus_to_imslp`、`imslp_systems`
和 system MusicXML annotations，将原始 source PDF 的连续 page 用 `pdfseparate/pdfunite` 保留到外部
`input.pdf`，并写出 `truth.musicxml`、`source-mapping.json`。6 个选中 work 的 page count 和 system count
均与 selection 一致，缺失 mapping、bbox 或非连续 source page 会 fail closed。该 builder 不做 raster crop，
system-crop PDF 不可替代 full-page input。

选中 source PDF 使用 JBIG2 图像。为让现有 PDF.js CLI/桌面运行时能够读取这些真实扫描，PDF.js 的 `wasmUrl`
现在显式指向 `pdfjs-dist/wasm`，Desktop package 同步携带 `jbig2.wasm` 与 fallback 文件；未提供 wasm 目录
时仍使用 workspace 默认路径。C03 的 full-page inspect 已在该路径下成功读取 6 个 PDF；C04 protocol 锁定
manifest、builder hash、render、`rokot-grand-staff-v2` full-page segmentation、Rokot model/projector、
decoder、runtime resource gates 和 `none` preprocessing。

#### Full-page readiness and development stop

`reports/development/olimpic-scanned-full-page-v1-segmentation-pilot/segmentation.json` 是 C05 的逐页
segmentation artifact。29/29 pages 都以 `ambiguous-system-segmentation` fail closed，具体 stage 和
group/gap context 均保留；没有人工 crop 或 writeback。Benchmark 的两次 development run 也可重算，
report SHA-256 均为 `bd77eced58d6bb39b6d15cd4b510d0ece62ef61c589fe0e3193cab8dafa9330c`，6/6 items failed，
没有生成 symbolic/Harmony quality metrics。5 个 item 因 ground-truth readiness 的
`VOICE_DURATION_MISMATCH`、`MISSING_EVENT_TIMING`、`INVALID_TIE` 或 `UNRESOLVED_TIE` 进入
`BENCHMARK_EVALUATION_LIMITATION`；唯一 timing-ready 的 `6007571` 仍在 full-page segmentation 阶段失败。

因此 full-page development 的唯一决策为 `STOP`，不进行 T05 单变量实验，不读取新的 holdout。下一轮必须
先修复 detector 或提供 rights-reviewed、timing-ready 的 ground truth，并使用新的 protocol；现有 v1
system-crop protocol 和历史 report 不被重写。

`scripts/build-olimpic-scanned-corpus.py` 提供了 full-work probe：合并系统时只补回 MusicXML 标准允许跨
system 继承的 `divisions`、`key`、`time`、`staves` 与 `clef` attributes，不改写音符事实。对
`6586696` 的 probe 已消除跨 system 的缺失 meter，但仍稳定留下 `VOICE_DURATION_MISMATCH`；因此不能把
该输出提升为 evaluation-ready full-page ground truth，也不能用补 rest 的方式掩盖 source timing gap。

2026-08-06 的 development probe 使用已锁定的 Rokot revision `7add305aade6fb3a64ad4dde77d410fa68381089`
（model SHA-256 `df53948ada1a4a584b4c7c81cc7e3293d3457f2e5ec9688271693459eb950f25`，llama.cpp
`b10200-5f55650a7`）。Rokot 的 system-crop 路径显式允许 landscape page，并启用
`rokot-grand-staff-v2` 的 fragmented-row detector（`fragmentedRowCoverage = 0.2`，
`fragmentedSpacingToleranceRatio = 0.2`）；默认 PDF renderer
仍拒绝 landscape，避免改变其他调用方的安全边界。对真实扫描 development item
`openscore-6586696-p1-s1` 的 benchmark report SHA-256 为
`d8c42edea9b1b3f2219287b25f2709d6e81b7c5933850be3e4cafd957c6513e4`：1/1 item 成功，reproducibility
agreement `1.0`，joint F1 `0.7659574468`，valid measure rate `0.5`，pitch/onset F1 分别为
`0.9892473118` / `0.9787234043`，recognition wall time 约 `17.9s`，peak RSS `265633792` bytes。
该结果只证明真实 single-system 输入可以通过 segmentation、Rokot inference、normalization 与 artifact
写出；它不覆盖 full-page segmentation、跨 system joining、holdout 或 App discovery。

同日使用 OLiMPiC `6586696/p1-p4` 构建了 development-only multi-system probe。新的 fragmented-row detector
增加一致 staff-spacing guard 后，15 个顺序 system pages 全部完成 segmentation，Rokot direct recognition
也完成并保留 10 个 `ROKOT_MEASURE_DURATION_MISMATCH` diagnostics；输入 SHA-256 为
`866104732238882b766ea41228ee51845c4b0b71289ae268e661493ff7a35a3b`，segmentation artifact SHA-256 为
`30b5ec32637dfc66c6ef9144fc0cdac508c4fc8ffe7ea829a6c29a5c79cc8a4f`。将这些 system fragments 合并得到的
ground truth 自身含有 37 个 blocking `VOICE_DURATION_MISMATCH`，benchmark 因此按 contract 生成
evaluation limitation；report SHA-256 为 `68291c23634cf93f11ef066cbdf54686f52672010761c7f06b1b0813f5fb73ab`，
没有生成质量指标。该 probe 证明了跨 system 的顺序与诊断可追踪性，但仍不是 full-page segmentation、
timing-ready ground truth、holdout 或 App gate。

## Development decisions

固定比较：

- Audiveris 5.10.2，DMG SHA-256
  `727c46b4ca4766349be1f582b67cc5aa0d7306113dcf4a18be169d75959f4288`
- Transcoda code
  `d4e2e687d5679ae96ca4aa6f01e06a5b338cd488`
- Transcoda checkpoint SHA-256
  `3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc`
- preprocessing: `none`
- Transcoda: grammar constrained、layout normalization、greedy、`maxLength=512`、
  `repetitionPenalty=1.1`
- 每个成功 item 重复两次计算 Draft hash agreement

被拒绝的变体：

- 不使用 `repetitionPenalty`：极简 smoke 出现重复 clef token。
- legacy `hum2xml`：当前 macOS toolchain 无法可复现构建，改用隔离的
  `converter21==3.5.0` / `music21==9.9.1` process。
- 一小节短谱表 smoke：Audiveris 无法构成 system，仅保留为管线 smoke，不进入 evaluation
  corpus。

## Development results

Canonical aggregate reports：

- `reports/development/audiveris.json`
- `reports/development/transcoda.json`

Audiveris：

- 3/3 item 完成 process、MXL export 和 normalization；
- Draft reproducibility agreement `1.0`；
- joint F1 `0`，valid measure rate `0`；
- MusicXML generation/parse/structural capability rate 均为 `0`，因为 Draft 被 blocking
  diagnostics 阻断；
- wall-time P50 约 `14.2s`，P95 约 `14.3s`。

Transcoda：

- 0/3 item 形成 Draft；
- 三项均稳定失败为 `ENGINE_OUTPUT_INVALID / inconsistent-spine-count`；
- 失败发生在 `**kern` validation，未进入 converter、Harmony 或 MusicXML generation；
- 无可报告的 symbolic、runtime aggregate 或 reproducibility metric。

Development 结论是不调低 validator 或 gate。两个引擎目前都没有证明能生成可用 Draft；
Transcoda 的 native invalid output 也不能用语法猜测修复。Holdout 仍应按原 gate 运行，用于验证
冻结机制和确认失败结论，而不是继续针对 holdout 调参。

## Frozen holdout protocol

`corpus/evaluation/protocol.json` 在 benchmark commit
`98410a85953e2682e0444dd354334130bb7f28ce` 上冻结。它锁定 manifest SHA、两个 engine version、
Transcoda model SHA/decoder parameters、`none` preprocessing 和八项 gate。Holdout runner 会读取
同目录 protocol，拒绝 hash、manifest、engine 或 preprocessing 不匹配的请求。

## Holdout result

两个冻结组合都完成运行、写出完整 report，并返回 exit code 9：

- Audiveris report SHA-256:
  `81f0f7902abb0587987ea8c70f0cd85626d1f84f9933a833899deca8fb61e45a`
- Transcoda report SHA-256:
  `ffa4b4b91ac90fa8251f13fd8325e37d835bd0e9e7fb2bba9d62a3e19f196c17`

两份 aggregate 均已从 item artifacts 重算并得到相同 hash。冻结 gate 的唯一结论为 `STOP`；
完整解释见 `docs/evaluation/pdf-omr.md`。该结论停止当前 engine 进入 App discovery，不禁止未来以
新 engine、更大真实 corpus 和新 protocol 重新立项。

## Exploratory follow-up

非冻结、未进入 development / holdout protocol 的后续证据放在 `reports/exploratory/`，不得与
canonical aggregate reports 合并或用于改写冻结 gate。

`reports/exploratory/k331-rokot-vs-audiveris/` 保存 2026-07-31 的 K331 同输入对照：
`rokot-omr-2b` Q8_0 对三个手工裁切 system 的 transcription，以及 Audiveris 5.11.0 对完整 6 页
PDF 的输出。该对照只支持把 Rokot 视为新 protocol 的候选 engine；方法、custom NED、artifacts
和局限见其 `README.md`，draft engine design 见
`docs/specs/2026-07-31-rokot-pdf-omr-engine-design.md`，当前决策解释仍以
`docs/evaluation/pdf-omr.md` 为准。

## Rokot K331 controlled development run

Rokot engine 实现后的 K331 全谱结果放在
`reports/development/k331-rokot/`，而不是 `tools/harmony-cli/` 或通用 `output/`。recognition、segmentation、
joining 和 Draft readiness 属于 PDF OMR evaluation；只有 Draft 已经 Harmony-ready 后，和弦算法本身的
评测才进入 Harmony CLI 目录。

本次使用独立的 `K331-3_rokot-development-manifest.json`，只含一个
`derived-controlled-grand-staff` development item；没有读取 frozen holdout。六页 27 systems 均完成两轮
推理，第三次独立 recognition 的 PNG、ABC、MusicXML 和 Draft hash 与 benchmark 第一轮一致。

canonical item 最终为 `PROJECTION_OR_EXPORT_FAILED / harmony-readiness-blocked`：Rokot Draft 有 blocking
joining/timing diagnostics，同时当前 K331 ground-truth Draft 本身也不是 Harmony-ready。因此报告保留
失败状态，不伪造 Harmony delta。小型结构化聚合见
`reports/development/k331-rokot/summary.json`，解释见同目录 `README.md`；完整 run、模型和 cache 不进入 Git。

## Rokot public pianoform quick development run

2026-08-13 的 10-item quick development 结果以
`reports/development/rokot-public-pianoform-v1/README.md` 与 `summary.json` 作为 durable evidence。完整
`rokot-evaluation-*` / `rokot-quick-*` runs 是本地调试产物，不进入 Git；它们不能替代 summary，也不能用于
改写 frozen gate。最终结果为 recognition admission 10/10、Harmony/MusicXML ready 4/10，决策仍为
`INVESTIGATE`。
