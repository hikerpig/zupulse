# PDF OMR CLI 冻结评测结论

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

## 若未来重启

新的 discovery 至少需要：

1. 获取许可明确、包含真实印刷扫描与目标钢琴谱型的更大 corpus，并按 work 冻结 split。
2. 先解决 render/preprocessing domain gap，再比较 engine；不能用放宽 validator 掩盖错误。
3. 将 cancel、峰值 GPU/RSS 和逐阶段 wall time 纳入实际 item metrics。
4. 对 neural decoder 做可复现性诊断，并单独校准 confidence，禁止跨 engine 直接比较 raw score。
5. 使用新的 protocol/version；本次 frozen report 保持不可变。
6. 若纳入 Rokot，先实现确定性的 system segmentation 与 joining，并在 development corpus 上冻结
   crop、decoder、metric implementation 和 model revision，再读取新 holdout。

本阶段没有修改 `apps/*`，也没有定义 UI、Bridge、Repository 或持久化模型。
