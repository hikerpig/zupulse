# PDF OMR CLI 冻结评测结论

本文是 2026-07-28 的 frozen historical evidence。Transcoda 已从当前 CLI、Desktop 和 Web provider
功能中移除；本报告、对应 protocol 与 report 不改写，以保留当时评测的可追溯性。

## 决策

`STOP`

停止把当前 Audiveris 5.10.2 或 Transcoda 59M 路线推进到 App discovery。这里的 `STOP` 不是永久放弃
PDF OMR，而是表示当前 engine、输入预处理和 corpus 证据不足以支持产品化；后续若更换 engine、
训练数据、render pipeline 或显著扩大 corpus，必须建立新的 protocol，不能覆盖本次结果。

## 评测范围

- benchmark commit:
  `98410a85953e2682e0444dd354334130bb7f28ce`
- corpus manifest SHA-256:
  `598406d48e2bbb25a935003b2ad3450399f0831471df86111cb070c0dcc645bb`
- frozen protocol SHA-256:
  `4febcd2566f8602326480f74a414d48fc1c5a7dabd6459e5844a2391d20585c7`
- holdout: `piano-eight` clean 与 low-contrast 两个 variant
- preprocessing: `none`

当前 corpus 只有两个自建 synthetic work；它足以验证 CLI、artifact、hash、split 与 gate，但不足以
估计真实世界总体质量。本报告的结论是“当前证据不能进入 App”，不是对所有未来 OMR 技术的上限判断。

## 冻结结果

| Metric                          |     Gate |   Audiveris 5.10.2 |      Transcoda 59M |
| ------------------------------- | -------: | -----------------: | -----------------: |
| Item process success            | evidence |              2 / 2 |              2 / 2 |
| Note joint F1                   |  >= 0.90 |               0.00 |               0.00 |
| Valid measure rate              |  >= 0.95 |               0.00 |               0.00 |
| Generated MXL parse rate        |  >= 0.95 |               0.00 |               1.00 |
| Round-trip structural agreement |  >= 0.90 |               0.00 |               1.00 |
| Harmony precision delta         | >= -0.05 |              -1.00 |              -1.00 |
| False confident chord rate      |  <= 0.03 |               0.00 |               1.00 |
| Repeated Draft hash agreement   |   = 1.00 |               1.00 |               0.00 |
| Cancel latency P95              |    <= 2s | unavailable / fail | unavailable / fail |
| Wall time P50                   | evidence |              14.2s |              35.2s |
| Wall time P95                   | evidence |              14.8s |              42.1s |

两个 engine 的 gate decision 都是 `STOP`，并且均先写出完整 canonical report，再以 exit code 9
结束。报告可以从 item artifacts 重算为相同 SHA：

- Audiveris:
  `81f0f7902abb0587987ea8c70f0cd85626d1f84f9933a833899deca8fb61e45a`
- Transcoda:
  `ffa4b4b91ac90fa8251f13fd8325e37d835bd0e9e7fb2bba9d62a3e19f196c17`

## 解释

Audiveris 能稳定执行和导出，但当前 PDF render 上没有形成可通过 validator 的音符/节奏结构。
它的 Draft hash 可复现，但“稳定地产生错误或空结构”不能视为可用。

Transcoda 在 holdout 上能形成可转换、可 round-trip 的 Draft，但符号内容与 ground truth 不一致，
并且两次运行 Draft hash 不一致。结构可解析只证明 serialization pipeline 工作，不证明乐谱语义正确。
其 `false confident chord rate = 1.0` 对下游和弦分析尤其不可接受。

Cancel latency 没有进入 item aggregate，因此按冻结 gate 失败。即使移除这一项，joint F1、valid
measure 和 Harmony 指标仍足以得出 `STOP`；不得事后修改 gate 改写结论。

## 2026-07-31 K331 同输入探索性对照

本节是冻结 benchmark 之后新增的 discovery evidence，不属于上述 frozen protocol，不修改 `STOP`
结论，也不能与冻结报告中的 Note joint F1 直接换算。它只回答一个更窄的问题：在同一份受控钢琴谱
上，`rokot-omr-2b` 的 per-system transcription 与 Audiveris 5.11.0 的符号识别相差多少。

### 输入与方法

- 输入：`test-fixtures/musicxml/K331-3_reviewed.pdf`，SHA-256
  `22cec1f974dc4bbef64c3e8968e98dcae68d229769d70fa66a21b8c8d56ae8a7`。
- Ground truth：`test-fixtures/musicxml/K331-3_reviewed.mxl`。PDF 由该 MusicXML 经 MuseScore 4.7.4
  导出，因此本例是 `derived-controlled` clean upper-bound，不是独立扫描语料。
- Rokot：`rokotmidi/rokot-omr-2b` revision
  `7add305aade6fb3a64ad4dde77d410fa68381089`，Q8_0 text model + F16 vision projector，
  `llama.cpp 10200`，temperature `0`，每次输入一个约 1405 px 宽的 system crop。
- Audiveris：5.11.0，`preprocessing: none`，一次处理完整 6 页 PDF 并导出 MXL。
- 抽样：page 1 system 1（measure 0–5）、page 1 system 5（measure 20–26，含 implicit
  measure `X2`）、page 5 system 3（measure 105–109），共 217 个 ground-truth note token。
- 指标：分别对 pitch token 与 `(pitch, duration)` token 序列计算 Levenshtein edit distance，再除以
  ground-truth token 数。该 custom NED 越低越好；它不是 full-MusicXML OMR-NED，也不评价 layout、
  lyrics、dynamics 或完整 score joining。

### 结果

| Engine            | Pitch NED ↓ | Pitch + duration NED ↓ | Processing scope               |
| ----------------- | ----------: | ---------------------: | ------------------------------ |
| rokot-omr-2b Q8_0 |       0.092 |                  0.171 | 3 manually cropped systems     |
| Audiveris 5.11.0  |       0.456 |                  0.493 | full 6-page PDF, same 3 scored |

在此抽样上，Rokot 的 pitch NED 比 Audiveris 低 `79.8%`，pitch + duration NED 低 `65.3%`。
普通旋律、双谱表分配、调号、拍号和多数和弦音高表现较好；主要错误集中在短倚音、装饰音和低音快速
分解和弦。Audiveris 在 measure 105–109 的 treble / bass 分别只输出 4 / 8 个 token，而 ground truth
各为 36 个。

Audiveris 的完整 6 页 run 用时约 `159.5s`，能够自动完成 page/system segmentation、score joining
并导出一份 MXL。Rokot 的单 system run（含重复加载模型）约 `15–23s`，但当前 evidence 没有覆盖自动
segmentation、measure alignment、跨 system joining 或完整 6 页运行。因此，当前证据只支持把 Rokot
作为新 protocol 的 engine candidate 继续 `INVESTIGATE`，不支持 App discovery 或替换冻结决策。

可复查 artifacts：

- `tools/pdf-omr-cli/reports/exploratory/k331-rokot-vs-audiveris/README.md`
- `tools/pdf-omr-cli/reports/exploratory/k331-rokot-vs-audiveris/abc/`
- `tools/pdf-omr-cli/reports/exploratory/k331-rokot-vs-audiveris/musicxml/`
- `tools/pdf-omr-cli/reports/exploratory/k331-rokot-vs-audiveris/audiveris/raw-output.mxl`，
  SHA-256
  `4e1d1fd07f7765edd888001115ed4e2f62ca06740daba029ef0953d57d2ae78c`
- Draft engine design: `docs/specs/2026-07-31-rokot-pdf-omr-engine-design.md`

## 2026-07-31 Rokot K331 controlled development run

Rokot engine pipeline 已完成实现后的 K331 六页全谱运行：deterministic PDF render 检出 27 个
grand-staff systems，两轮 benchmark 共执行 54 次 Q8_0 inference，总墙钟约 `460s`。第三次独立
recognition 与 benchmark 第一轮的 27 份 PNG、ABC、MusicXML 和最终 Draft hash 全部一致。

这次结果把瓶颈从“缺少整页 pipeline”推进到了 joining/readiness：Rokot Draft 有 95 条 raw
diagnostics，validated Harmony/MusicXML readiness 均为 `blocked`。canonical benchmark item 也因
`harmony-readiness-blocked` 失败；这里还有一个独立的 evaluation limitation——reviewed K331 MXL 经
当前 ground-truth normalizer 后自身已经 Harmony-blocked，所以不能计算可信的 Harmony delta。

canonical symbolic metric 又按 part ID 精确匹配，而 Rokot 的 `piano` 与 ground truth 的 `P1` 不同，
导致 canonical F1 为零。仅做 part-ID 对齐、完全不改符号内容的诊断结果为 pitch F1 `0.4917`、onset F1
`0.7645`、duration F1 `0.7195`、joint F1 `0.1570`、valid measure rate `0.0693`。这支持继续调查
engine-neutral identity 与 joining，但不支持放宽 validator 或进入 App discovery。

durable report 位于 `tools/pdf-omr-cli/reports/development/k331-rokot/`。它属于 PDF OMR evaluation，
不放进 Harmony CLI 目录；只提交说明和小型 summary，不提交完整 run 或模型。K331 仍是
`derived-controlled` development evidence，不进入 frozen holdout，也不改写既有 `STOP`。

## 2026-08-05 评测器边界修复

后续 benchmark run 已增加三项 fail-closed 边界：prediction 与 ground truth 的 part identity 先按
structural role 对齐并写入 `part-identity.json`；ground truth 自身 readiness 阻断时只生成
`evaluation-limitation.json`，不生成 symbolic/Harmony pseudo-metrics；holdout 还必须提供逐阶段
wall time、peak RSS、GPU memory 与 cancel latency。没有可量化 duration 的 grace note 会保留
`MISSING_EVENT_TIMING` warning，但不会被当作 timing 对齐输入。以上只约束新的 benchmark artifacts，
不重写本节之前的 frozen 或 K331 report，因此既有 `STOP` 结论保持不变。

## 2026-08-14 Engine 资源采集口径修复

新的 benchmark run 不再把父 Node 进程的 `process.memoryUsage().rss` 当作 engine peak RSS。共享 engine
runner 在 Unix/macOS 上按 250ms 间隔采样独立 process group，将完整 process tree 的 peak RSS、平均/峰值
CPU、sample count 与采样间隔写入 item runtime，并在 aggregate report 中输出分布；无有效样本时字段
保持缺失并由 `metricsAvailability` 标记。GPU memory 与 cancel latency 仍只在独立 probe 可用时记录。该修复
只改变新报告的资源证据口径，不重写历史报告，也不改变既有冻结 `STOP`。

## 2026-08-01 MIDI Fusion 人工审核回写

`pdf-omr-cli` 在 report-only fusion 之后增加了独立 `apply-fusion` 阶段。它只消费 hash 固定的 fusion run
和 reviewer decisions，使用 `partId + measureIndex + noteIndex + preconditionSha256` 定位原始 MusicXML
note，并生成新 corrected score；原文件、fusion run 和 decisions 均不修改。

v1 只回写 reviewer 明确给出 `writtenPitch` 的 `pitch-disagreement`。missing-note、unsupported-score-note、
tie chain、非零 detected transposition、repeat suggestion 冲突和 source drift 均 fail closed。回写后必须满足：

- MusicXML/MXL 可 parse、view、playback；
- 结构差异仅为 patch plan 声明的 pitch；
- 不新增 blocking diagnostics；
- compatibility 保持 compatible，coverage 与 pitch agreement 不下降；
- applied source note 不再产生 pitch disagreement。

development verification 结果：

| Item                             | Proposals | Writeback-ready | Applied | Outcome                                                                       |
| -------------------------------- | --------: | --------------: | ------: | ----------------------------------------------------------------------------- |
| K331 derived-controlled          |        24 |               0 |       0 | 24 条 missing/extra 全部 reject；corrected SHA 等于 source                    |
| Flower Day Audiveris exploratory |        83 |              76 |       0 | 无 reviewed ground truth，全部保持 unreviewed；结构/runtime/fusion gates 通过 |
| Automated reviewed pitch fixture |         1 |               1 |       1 | pitch agreement `0.75 -> 1.0`，无结构 drift                                   |

Flower Day 的 `writeback-ready: 76` 不是 accuracy 指标：这些 proposal 的 alignment confidence 仍为 `0.5`，
且 MIDI 不能唯一决定 enharmonic spelling。视觉抽查没有形成足够证据批准具体音高，因此本次没有把 proposal
批量当成 reviewer decision。其原始 Audiveris MXL 已有 1 条 `MISSING_EVENT_TIMING`；no-regression gate
允许该基线诊断保留，但不允许新增。

Flower Day LEGATO pagewise run 的 P1/P2 为 72/65 小节，证明仅修改 pitch 不能修复已损坏的
timing skeleton。使用同份 score-export MIDI 的验证结果：

| Mode                | Result                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| Reviewed writeback  | 289 pitches applied; pitch agreement `0.7114 -> 0.9990`; no structural/runtime drift  |
| MIDI reconstruction | 67 measures, 1143 matched attacks, zero alignment residue, all coverage/agreement `1` |

`rebuild-from-midi` 可修复小节和时值结构，但会以 MIDI 取代 OMR notation skeleton，不保留 OMR 排版或
文本。两组结果都没有逐音符 ground truth，不得解释为独立识别准确率。

durable aggregate 位于 `tools/pdf-omr-cli/reports/development/midi-score-writeback/`。该能力仍是隔离 CLI
研究链路，不修改 App、Library、Bridge、managed files 或产品格式边界。

## 许可证与运行约束

- Audiveris code: `AGPL-3.0-only`
- Transcoda code: `AGPL-3.0-only`
- Transcoda weights: `CC-BY-4.0`
- Rokot weights: `CC-BY-NC-4.0`；当前公开权重不允许未经单独授权的商业使用
- Transcoda 是单页、固定输入几何模型；当前 adapter 对 multi-page 明确稳定失败
- Rokot Q8_0 + F16 vision projector 下载量约 2.7 GB，模型只处理单个 system，完整 PDF 需要外层流水线

这些许可证只在隔离 CLI benchmark 中被评估，没有批准 Desktop、Browser、服务端或模型分发。

## 2026-08-06 OLiMPiC full-page development corpus

为验证整页输入，新增并冻结 `olimpic-scanned-full-page-dev-v1`，manifest SHA-256 为
`4cbd78411f15f73bf548a50f2af125e29c6cc42297b43a8616934a08a2cb0a1f`，protocol SHA-256 为
`d1b6beeb912350eb134524cf3100c8d49ee908578825c95fc1171bfacbce4782`。该 corpus 只使用 OLiMPiC `dev`
work，共 6 works、29 pages、121 systems；source PDF 的逐项 rights 仍为 `pending-item-review`，只允许
本地研究评测，不允许产品分发。

全页 segmentation pilot 对 29/29 pages 都以 `ambiguous-system-segmentation` fail closed；逐页 stage、
group/gap context 见 `tools/pdf-omr-cli/reports/development/olimpic-scanned-full-page-v1-segmentation-pilot/`。
五个 work 的 ground truth readiness 被 `VOICE_DURATION_MISMATCH`、`MISSING_EVENT_TIMING`、`INVALID_TIE`
或 `UNRESOLVED_TIE` 阻断；唯一 timing-ready 的 `6007571` 也在 segmentation 阶段失败。两次独立 development
run 的 canonical report SHA-256 均为
`bd77eced58d6bb39b6d15cd4b510d0ece62ef61c589fe0e3193cab8dafa9330c`，均为 0/6 succeeded、`NOT_EVALUATED`，
没有生成 symbolic 或 Harmony quality metrics。

因此 full-page development 的唯一决策仍为 `STOP`：本轮不运行单变量模型实验，也不读取新 holdout。
下一轮必须先修复 detector 或取得 rights-reviewed、timing-ready 的 ground truth，并使用新的 protocol；
既有 system-crop protocol、frozen reports 和 App 边界不变。

## 2026-08-11 Public pianoform benchmark capability

CLI 已支持新的 `quick` 与 `standard` manifest execution profile。`quick` 固定为
`2 contract + 6 oracle-system + 2 full-page`；`standard` 固定为
`5 contract + 36 oracle-system + 4 full-page`，仅六个声明的 OLiMPiC systems 重复运行，并对每个 engine
设置一小时总墙钟预算。profiled holdout 的质量门禁只使用 `oracle-system` 聚合；contract 与 synthetic
full-page 仍保留为运行和流水线证据，但不能改善识别质量结论。

确定性 builder 只消费显式本地 inventory，按 ground-truth complexity tuple、work identity、system
position 与 page density 生成 selection 和三个 manifests。它不会下载或提交公开 archive。这里记录的是
评测能力，不是新的 engine result；既有冻结 `STOP`、历史 manifests/reports 与 App 隔离边界均未改变。

## 2026-08-13 Rokot quick development result

在 10-item `public-pianoform-v1-quick-development` 上，Rokot admission 从 5/10 提升到 10/10：OLiMPiC
oracle systems 声明为 `system-crop` 后不再重复 segmentation；full-page detector v2 解决了密集谱面的重复
staff candidates；严格 header-valid 的 single-staff unvoiced ABC 可以确定性补入 `V:1`。最终 report
SHA-256 为 `ff4a45aadf5388353a77053766267cf58a06633aeebbb1952d8292abcf5a25f9`。

这次提升仅证明 pipeline admission 改善。预测 Draft 中 4/10 同时达到 Harmony/MusicXML ready，6/10 仍被
duration、staff measure count、system boundary 或缺失结构 header 阻断；oracle-system quality joint F1
为 `0.1774`，valid measure rate 为 `0.0750`。当前决策仍为 `INVESTIGATE`，不进入 App discovery，
也不改写 frozen `STOP`。durable 摘要位于
`tools/pdf-omr-cli/reports/development/rokot-public-pianoform-v1/`；完整生成式 runs 不进入 Git。

## 2026-08-15 Rokot context memory result

Rokot adapter 原先没有传递 `--ctx-size`，llama.cpp 因而使用模型 metadata 的默认 context。锁定
`ctxSize=4096` 后，同一个 OLiMPiC scanned system item 的 process-group peak RSS 从 `33.12 GB` 降为
`3.51 GB`，item wall time 从 `17.81s` 降为 `8.66s`；预测 ABC SHA-256 与 pitch、onset、duration、joint
及 valid-measure 指标均保持不变。

在三个 synthetic development items 上，peak RSS 从 `33.06 GB` 降为 `3.44 GB`，三项 runtime max
合计从 `92.06s` 降为 `36.32s`；96 个 joint events、24 个 valid measures 与 3/3 reproducibility
comparisons 均保持不变。该结果证明当前 `1600` output-token 合同不需要模型默认的超长 context；它不证明
更长 prompt 或未来更大 output-token 合同也适合 `4096`，修改这些合同时必须重新做 context capacity 与质量评测。

## 2026-08-15 LEGATO multi-page result

LEGATO adapter 的 PDF 安全上限从 3 页提高到 32 页，bundled runner 改为逐页流式 render，既有逐页
ABC、MusicXML、decoder telemetry 与跨页 measure merge 合同保持不变。由 `melody-clean.pdf` 重复组成的
8 页 PDF 在 MPS/float16、beam 1 下完成真实端到端 recognize：8/8 pages 以 EOS 结束，生成 16 个逐页
artifacts，合并 Draft 含 56 measures 且无 diagnostics，总墙钟约 48 秒。

8 页 OLiMPiC dense full-score 输入也已越过原有 page-count guard 并完成第一页，但单页生成耗时达到数分钟，
因此中止了该次 development probe。该结果证明 8 页输入合同与流式执行可用，不证明复杂 8 页整谱能在当前
一小时 timeout 内完成；复杂度和 max-length 仍需由真实 corpus 单独评估。

## 2026-08-26 Detector v2 real full-page baseline

新的 versioned segmentation pilot 使用当前 `rokot-staff-system-v2` 重跑既有
`olimpic-scanned-full-page-dev-v1` development inputs。两次独立运行生成 byte-identical canonical report，
SHA-256 为 `41565eb8288278913169109556ec56f29728b1fb3391ddab3d3ded4345772390`。

6/6 works、29/29 pages 均在 `grand-staff-pairing` fail closed，0 systems 发布；每页检测到 9–58 个 staff-group
candidates，仍有 1–32 个 unpaired groups。结果证明 quick profile 的 synthetic full-page 改善不能外推到真实
整页扫描。该 pilot 未调用 recognition engine，也未生成 symbolic/Harmony metrics，因此只维持
real-scanned full-page layout `STOP`，不能解释为 Rokot 或 LEGATO note-level quality。

下一步使用同一 development inputs 做 `none`、deskew、local contrast 与 adaptive threshold 的单变量 ablation。
不得降低 pairing gate、忽略 unpaired groups、人工 crop 或修改历史 protocol。durable summary 位于
`tools/pdf-omr-cli/reports/development/olimpic-full-page-detector-v2/`。

### Deterministic preprocessing ablation

上述 ablation 已于 2026-08-26 完成。四个 variant 两次运行均各自生成相同 canonical SHA；但 `none`、deskew、
local contrast、adaptive threshold 的 segmentation success 都是 0/29，全部仍在 `grand-staff-pairing` fail closed，
system count 均为 0。deskew 改变 13 pages，local contrast 与 adaptive threshold 各改变 29 pages。由于没有任何
admission 提升，T08 决策为 `STOP`，runtime default 保持 `none`，不修改 detector 或 Rokot adapter。

同一轮 joining census 读取既有 45 个 Rokot success artifacts：45/45 都是单个 `system-crop`，multi-system
denominator 为 0；153 个 raw/normalized boundaries 数量一致且 provenance 无缺失。该证据不能评价跨 system
header continuity，故 T09 同样 `STOP`，`normalizeRokotOutput` 不修改。完整结果位于
`tools/pdf-omr-cli/reports/exploratory/olimpic-quality-optimization-v1/`。

随后新增 `olimpic-6007571-real-multisystem-v1` development case，单独绑定真实扫描派生输入、MusicXML truth、
source mapping hashes 与 4 页/15 systems 预期。case evaluator 只接受 exact Rokot benchmark item 的
`joining.json` 和 quality artifacts；ground truth/source mapping 不进入 runtime segmentation，也不能替代失败结果。
2026-08-26 的真实单-item run 在第 0 页 `staff-system-topology` 以
`ENGINE_OUTPUT_INVALID / ambiguous-system-segmentation` fail closed，因此结果为
`NOT_EVALUATED / engine-item-failed`，没有 multi-system artifact 或 quality metrics。当前 T09 仍为 `STOP`；该用例
已经固化了后续 learned layout detector 必须通过的真实 joining admission boundary。

首个 learned candidate screening 随后检查 OLA v2。其公开 source repository 为 MIT，release asset 大小为
40,530,853 bytes，但固定依赖 `ultralytics==8.3.4`，且候选仓库没有单独声明 weights license；Ultralytics 官方
许可边界不能直接满足 proprietary Desktop distribution。因此该候选在下载和执行前 `STOP`，没有读取 holdout，
也没有产生可宣称的 segmentation improvement。与此同时新增 framework-independent validated-output boundary，
允许真实 mixed-staff system，同时对页码、bbox、顺序、五线 topology 与 deterministic crop fail closed；该代码尚未
连接任何模型或 Rokot runtime。screening evidence 位于
`tools/pdf-omr-cli/reports/exploratory/ola-v2-dependency-gate/`。

用户明确授权后，OLA v2 又在隔离 research environment 中执行了完整 29-page development probe。raw predictions
两次 byte-stable projection hash 一致，warm CPU 总 inference 约 11.3–11.4 秒；但默认输出及 112 个全局
confidence/NMS variants 最多只有 1 page / 1 work 完整匹配。540 个 `staves` pairing variants 的最佳结果虽然有
13 exact-count pages / 5 works，却仍只有 1 page / 1 work 的全部 boxes 达到 IoU 0.5，并缺少合法 staff-line
polylines、crop hashes 和 joining evidence。因此结果保持 `NOT_ELIGIBLE`，未接入 Rokot。完整报告位于
`tools/pdf-omr-cli/reports/exploratory/ola-v2-development-probe-v1/`。

后续训练源已收敛为 OpenScore Lieder CC0，而不是 OLA 聚合数据。固定 upstream revision 后，1,356 个 metadata
records 中排除 4 个缺失 `.mscx` 的 records，以及 75 个已进入仓库 OLiMPiC evaluation evidence 的 score IDs；
余下 1,277 个 source records 按 composer 隔离为 1,144 train / 133 validation。当前只生成 source plan，尚未渲染、
标注或训练。该 synthetic typeset corpus 不替代 real-scanned development admission，也不改变 frozen holdout。
可复算 evidence 位于 `tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/`。

## 2026-08-27 Rokot page-scope ablation

在 timing-ready 的 OLiMPiC development work `6007571` 上，使用相同 4 页真实扫描输入与 MusicXML truth 比较了
整页直接 Rokot 和 15 个 oracle system crops 后逐 system Rokot。整页通过 development-only `system-crop`
bypass 直接进入模型；oracle crops 使用冻结 `source-mapping.json` bbox 物化，再由现有 normalizer joining。

oracle variant 的每 staff measure count 为 55，接近 truth 的 57；direct-page 为 93。oracle 的 Pitch/Duration/Joint
F1 为 `0.3622 / 0.2744 / 0.0147`，direct-page 为 `0.1645 / 0.2408 / 0.0043`；diagnostics 从 407 降到 304，
wall time 从约 107.5 秒降到 76.6 秒，但 Onset F1 从 `0.2870` 降到 `0.1837`。两侧 valid measure rate 均为 0。

后续页面复核确认该 work 的每个 source system 都是 vocal staff + piano grand staff 的 3-staff mixed topology，超出
当前 Rokot 1–2 staff 合同；本实验两侧却都声明为 `grand-staff`。因此结果降级为 `NOT_ELIGIBLE`，不能隔离证明输入
粒度优劣，也不提升任一路线为 runtime candidate。后续必须改用合同内纯 single-staff 或 piano grand-staff 页面重跑。
完整摘要位于 `tools/pdf-omr-cli/reports/exploratory/rokot-page-scope-ablation-v1/`。

同日使用合同内的 K331 纯钢琴 grand-staff fixture 重做配对实验。整页 direct-page 与历史已复核 27 system crops 使用
相同 Rokot model、prompt 与 decoder。verified-system variant 的 measure count 为 138/138，更接近 truth 的
137/137；Pitch/Onset/Duration/Joint F1 为 `0.4919 / 0.7632 / 0.7182 / 0.1567`，均高于 direct-page 的
`0.3407 / 0.5820 / 0.5486 / 0.0750`。valid measures 从 `0/274` 提升到 `19/274`，diagnostics 从 362 降到
193，但 wall time 从约 129.4 秒增至 200.2 秒。

该结果支持继续 per-system transcription，并把下一优化边界收敛到 system context、measure/staff alignment 与 joining。
随后在相同 27 crops 上增加无 truth 的 previous-system header context probe：首个 system 保持原 prompt，后续只携带上一
prediction 中唯一合法的 `L/M/K`。measure count 达到 137/137，diagnostics 降至 148，Pitch/Onset/Duration/Joint F1
达到 `0.7525 / 0.9162 / 0.9484 / 0.3768`，valid measures 提升至 `57/274`（`20.80%`）。

该 context 已集成到 Rokot runtime：只传播格式安全的 `L/M/K`，任一 header 不安全时回退到基础 prompt。它仍会传播
音乐上错误但格式合法的 header；本轮中途产生
`K:G` 后持续传播，因此下一步必须在第二个合同内 work 上以相同协议复现。当前
`rokot-staff-system-v2 + allowFragmentedRuns=true` 在 K331 第 1 页仍以 `grand-staff-pairing` fail closed；本轮为隔离
transcription 使用历史 `rokot-grand-staff-v1` 已复核 crops，不宣称当前 full-page detector 已恢复。完整摘要位于
`tools/pdf-omr-cli/reports/exploratory/k331-page-scope-ablation-v1/`。

## 2026-08-27 Rokot header-context ablation

同一份 K331 27-system crop PDF 上比较了当前 `L/M/K` runtime、只传 `L/M`、冻结首个 `K`、以及 key 跳变后暂停传
`K` 的 consensus。物化使用 `rokot-staff-system-v2` 且 `allowFragmentedRuns=false`，系统数为 `6/6/1/6/6/2`；
baseline Joint F1 `0.3768`、valid measures `57/274` 复现了上一轮 `L/M/K` 结果。

`previous-lm-headers-v1` 最优：Pitch/Joint F1 为 `0.9296 / 0.4922`，valid measures `117/274`（`42.70%`），staff /
voice / tie / tuplet F1 为 `0.8482 / 0.4935 / 0.8460 / 0.8474`。predicted key 从卡住的 `C→G` 变为 `C/A` 交替，
与 K.331-3 的书面 A 调一致。冻结首个 `K:C` 没有帮助；consensus 介于 baseline 与 L/M-only 之间。onset/duration
几乎不变。Joint 与 voice F1 始终接近，因此下一优化边界是 voice 归属和双谱表 duration mismatch，而不是继续增加
header 文本。

合同内第二份 work 只能使用 development `melody-eight`：四个 policy 的 Draft hash 与全部 symbolic F1 均为满分且
彼此相同。仓库没有第二份 development piano grand-staff truth；`piano-clean` 是 holdout，OLiMPiC full-page
development 为 mixed topology。因此 L/M-only 还不能替换 runtime default。完整摘要位于
`tools/pdf-omr-cli/reports/exploratory/rokot-header-context-ablation-v1/`。

## 2026-08-28 DCML Mozart piano header-context

用 DCML Mozart v2.3 `reviewed` MSCX、MuseScore 4.7.4 导出的 derived-controlled PDF/MXL 复现 L/M/K vs 只传
`L/M`。谱面不进入 Git。

`K310-1`（A 小调）物化 44 个 oracle crops 后，在第 7 个 crop 因 `V:1=1/2` 触发 `unknown-rokot-voice`，整谱
fail closed，不能进入质量比较。

`K280-1`（F 大调）完成 48 个 crops。`L/M/K` 的 Pitch/Joint/valid 为 `0.7500 / 0.4131 / 48/288`，key 从 `C` 卡住到
`G`；只传 `L/M` 虽写出 `F`，但三项都下降到 `0.4730 / 0.1929 / 39/288`，小节数还变成 148。因此 K331 的 L/M-only
收益没有在第二份合同内钢琴谱上复现，runtime default 保持 `L/M/K`。摘要位于
`tools/pdf-omr-cli/reports/exploratory/rokot-header-context-dcml-piano-v1/`。

## 2026-08-29 Piano corpus suitability 与 MuseScore clean probe

DCML Mozart v2.3 的 `MS3` 渲染带 harmony labels，`reviewed` 还包含红色审校音符，因此不能未经确定性清洗就作为
普通 clean OMR 页面。仓库已登记的 5 份 ASAP v1.1 piano MusicXML 在当前 ground-truth audit 中为 0/5 ready；
经 MuseScore 4.7.4 重导 MXL 后仍为 0/5，暂不能直接进入现有 gate。

MuseScore 官方 OMR Benchmark 提供 1,077 对 CC0 augmented PDF + MSCZ。对前 12 个 IDs 的最小 pilot 检出 5 个
`piano / 1 part × 2 staves`，其中 IDs 4、9 的 MSCZ 经 MuseScore 重导后为 2/5 readiness-ready。两份官方 augmented
PDF 均在当前 detector 的 `staff-groups=0` fail closed；同源 MSCZ 重渲染 clean PDF 后则分别物化 15 与 4 个 systems，
并完成 header-context 对照。

ID 4 上只传 `L/M` 把 Pitch/Joint/valid 从 `0.8686 / 0.4238 / 46/184` 提升到
`0.9266 / 0.4623 / 69/184`；ID 9 的 Pitch 与 valid 不变，Joint 从 `0.3683` 小幅下降到 `0.3538`。结合 K331
提升与 K280 回归，当前 runtime default 继续保持 `L/M/K`。两个 clean case 作为 development evidence 保留，
augmented PDF 只记录 layout admission failure，不混入 transcription quality。完整结果位于
`tools/pdf-omr-cli/reports/exploratory/piano-corpus-suitability-v1/`。

## 2026-08-26 LEGATO topology failure audit

既有 46-item OLiMPiC development run 的 20 个 LEGATO failures 已通过 immutable artifacts 审计。分类为
13 个 `contentful-extra-part`、2 个 `duplicate-extra-part`、1 个 `empty-part` 和 4 个 engine failures。
15 个 `part-count-mismatch` 都以 `1 part × 2 staves` 为 expected topology；LEGATO 产生 14 个
`3 parts × 1 staff` 和一个 `4 parts × 1 staff`。

13 个 contentful extra-part cases 显然不能通过 adapter 丢弃。两个 duplicate cases 也没有形成唯一无损映射：
一个剩余 upper part 使用 percussion clef，另一个删除重复 bass 后仍有三个 contentful parts。因此 T05
adapter-normalization decision 为 `STOP`，`alignDraftParts` 不修改，comparable 仍为 26/46。后续若继续该方向，
必须作为 LEGATO model/processor output-topology experiment，而不能根据 ground truth、part order 或 pitch range
选择要删除的 part。durable evidence 位于
`tools/pdf-omr-cli/reports/exploratory/olimpic-legato-topology-audit-v1/`。

## 2026-09-04 compact shared detector 结论

按用户指定边界，训练与 detector evaluation 均整份排除 declared staff count 超过 3 的 score。最终
`compact-dilated-staff-line-cnn-v2` 只有 1,841 parameters，在 OLiMPiC real-scanned development 上从 classic
detector 的 0/29 提升到 9/29 exact pages、覆盖 4/6 works；两次 inference、boundary materialization 与 crop hashes
均一致。它证明 learned staff-line evidence 方向有效，但 31.0% exact-page coverage 仍不足发布。

通过同一个 `buildSharedDetectorSystemInputs` 入口，9 个 admitted pages 只物化一次并生成 36 个 system PDFs；Rokot 与
LEGATO 的真实运行拥有完全相同的 36 个 ordered input hashes。Rokot 固定 `previous-prediction-headers-v1`（L/M/K），
33/36 完成 normalize，但全部含 blocking diagnostics；LEGATO 35/36 完成 normalize，最终只有 1/36 达到
`ready-with-warnings`。这批输入有 35 个 3-staff system，因此结果同时确认：detector 不应丢弃第三谱表，但 Rokot
当前 recognition contract 无法可靠表达第三谱表。

本批 detector-derived crops 没有逐-system 对齐 MusicXML truth，不能计算新的 symbolic F1。已有 46-item
source-independent GT 结果仍用于比较 recognition quality：LEGATO Joint F1 `0.2690` 高于 Rokot `0.2285`，但
LEGATO process success `26/46` 低于 Rokot `45/46`。结合新 shared-input readiness，若优化 recognition，应优先
LEGATO 的 time-signature、tie 与 output topology；Rokot 继续固定 L/M/K，不再投入 header-context ablation。

ONNX CPU correctness、determinism、latency、RSS、license 与目标平台支持已经验证；但
`onnxruntime-node@1.29.0` 的 target-native 增量约 macOS arm64 88 MB / Windows x64 66 MB，尚未接受。因此产品
runtime 仍为 `STOP`。完整 evidence 位于
`tools/pdf-omr-cli/reports/development/olimpic-shared-detector-cross-engine-v1/` 和
`tools/pdf-omr-cli/reports/exploratory/staff-line-runtime-gate-v1/`。

## 2026-09-04 layout topology oracle 与 multi-head checkpoint

后续人工复核发现，上述 `9/29` admission 只比较 system 数量与 ordered center，没有比较每个 system 的
`staffCount` 或 constituent staff 位置。新增的 development-only sidecar 覆盖 6 works、29 pages、121 systems；
这些 system 均为 voice + piano grand staff，共 3 个可见 staff。按增强 topology metric 重算后，旧候选实际为
`0/29` exact；29 页的首要失败类全部为 `mask-insufficient`，因此停止继续调 global row collapse 与 connector。

按预先约定的 conditional fallback，只训练了一个 `compact-layout-unet-v1` multi-head 候选。它有 30,090
parameters，同时输出 staff-line 与 system-band logits。固定 system-band post-processing 在相同 29 页达到
`22/29` topology-exact，并覆盖 `6/6 works`；29/29 页均通过现有 TypeScript schema、ordering、bounds、
staff topology 与 crop materialization。两次 ONNX CPU evaluation 和 materialization 逐字节一致，candidate report
SHA-256 为 `f63c3eae2bede7c2d6fc5f08534938740553022a06a637ff9a9713e19d51ed35`，materialization
SHA-256 为 `ef1624021539cc1a06f2d59fdf914f9678b61037347cd09f2c935d2550c257a3`。

这个 checkpoint 仍有明确限制：staff-line validation Dice 只有 `0.4577`；候选利用本 development corpus
全部为 3-staff 的事实固定输出 `staffCount=3`，尚不是通用 staff-count detector；7 个失败页仍未恢复；也没有
system-aligned MusicXML truth 可用于下游 recognition 指标。因此它只满足继续研究的 `20/29` investment
checkpoint，不批准 Desktop/runtime 集成，不新增 `onnxruntime-node`，产品决策保持 `STOP`。完整 evidence 位于
`tools/pdf-omr-cli/reports/development/olimpic-layout-oracle-v1/` 与
`tools/pdf-omr-cli/reports/development/olimpic-layout-multihead-v1/`。

## 若未来重启

2026-08-17 的 source-independent system-crop 扩样已经执行：46 attempted 中 Rokot 45 success、LEGATO 26
success，双侧 comparable 为 26；81 个候选的 GT oracle upper bound 仅 28 个，仍达不到预先锁定的 35-candidate
GT-free selector gate。该结果把下一优先级收敛为 LEGATO part/topology admission，而不是继续增加 beam、堆叠
engine 投票或编写更多 selector 规则。证据位于
`tools/pdf-omr-cli/reports/exploratory/olimpic-source-independent-cross-engine-v1/`，不改写 frozen holdout `STOP`。

新的 discovery 至少需要：

1. 在已完成的 6-work OLiMPiC real-corpus quick screening 基础上，扩充许可明确、包含更多真实印刷扫描与目标
   钢琴谱型的 corpus，并继续按 work 冻结 split。
2. 先解决 render/preprocessing domain gap，再比较 engine；不能用放宽 validator 掩盖错误。
3. 将 cancel、峰值 GPU/RSS 和逐阶段 wall time 纳入实际 item metrics。
4. 对 neural decoder 做可复现性诊断，并单独校准 confidence，禁止跨 engine 直接比较 raw score。
5. 使用新的 protocol/version；本次 frozen report 保持不可变。
6. 若纳入 Rokot，先实现确定性的 system segmentation 与 joining，并在 development corpus 上冻结
   crop、decoder、metric implementation 和 model revision，再读取新 holdout。

本阶段没有修改 `apps/*`，也没有定义 UI、Bridge、Repository 或持久化模型。
