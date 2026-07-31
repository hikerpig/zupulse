# Rokot K331 development evaluation

> Status: controlled development evidence，完成于 2026-07-31。输入 PDF 由同一份 reviewed MXL 导出，
> category 固定为 `derived-controlled-grand-staff`；它不是独立扫描 corpus，不进入 frozen holdout，
> 也不能证明真实扫描泛化。

## 结论

Rokot Q8_0 engine 已完成 K331 六页 PDF 的确定性分段和两轮逐 system recognition，但产出的 Draft
尚不能进入 Harmony 或 MusicXML export。当前决策是 `INVESTIGATE`，不是 App discovery，也不改写
既有 Audiveris/Transcoda frozen `STOP`。

- 六页共检测到 27 个 grand-staff systems，分页计数为 `6 / 6 / 1 / 6 / 6 / 2`。
- benchmark 两轮共启动 54 次 `llama-cli`，总墙钟约 460 秒；concurrency 固定为 `1`。
- 第三次独立 recognition 与 benchmark 第一轮的 27 份 PNG、ABC、MusicXML 均逐文件一致，重建后的
  Draft SHA-256 也同为
  `b21a4fe84e5d014904392e378f9ada41b6685c77b19399622487a6b7e9c0ab6b`。
- Rokot Draft 含 95 条 raw diagnostics：43 条 timing、49 条双谱表 duration mismatch、2 条 staff
  measure-count mismatch 和 1 条 system-boundary ambiguity。现有 validator 扩展后为 193 条 blocking
  diagnostics，因此 Harmony 与 MusicXML readiness 均为 `blocked`。

完整小型聚合数据见 [`summary.json`](summary.json)。模型、HF cache、Python environment 和完整
benchmark run 均未提交；本地完整 run 位于一次性 `/tmp` 目录，不是 durable source of truth。

## Benchmark 边界

canonical benchmark command 成功退出，并产生 report SHA-256
`a214795403753cddf86d8c86fe6f2140cf6431bae021107328addeeec88d658b`，但 item 最终状态为
`PROJECTION_OR_EXPORT_FAILED / harmony-readiness-blocked`。这是因为 reviewed K331 MXL 经当前 Audiveris
normalizer 后，ground-truth Draft 本身已有 78 条 `MISSING_EVENT_TIMING`，经 validator 又产生 47 条
`VOICE_DURATION_MISMATCH`；ground truth 的 Harmony readiness 也是 `blocked`。因此本次不能诚实计算
Harmony precision delta。

canonical symbolic metric 还按 `part.id` 精确匹配。Rokot joining 按已批准设计输出 `piano`，当前
ground truth 输出 `P1`，所以 canonical pitch/joint F1 都是 `0`；该值主要暴露 metric identity contract
不兼容，不能解释为零音符识别。作为非 canonical 的诊断，我们只把 predicted part ID 对齐为 `P1`，
不改变任何音符、measure、staff 或 voice，得到：

| Diagnostic metric       |       Value |
| ----------------------- | ----------: |
| Pitch F1                |      0.4917 |
| Onset F1                |      0.7645 |
| Duration F1             |      0.7195 |
| Joint F1                |      0.1570 |
| Staff F1                |      0.3440 |
| Valid measure rate      |      0.0693 |
| Predicted / truth notes | 1436 / 1391 |

这组诊断说明：整页分段与稳定推理已经可用，单项 onset/duration 有明显信号，但跨 system joining、voice/staff
归属与 measure 边界仍不足以生成 ready Draft。后续评测应先让 ground-truth adapter 产生 Harmony-ready
Draft，并把 engine-neutral part identity 纳入 metric contract；不能通过删除 diagnostics 或放宽 validator
把本次结果改写成成功。

## 与 Audiveris 探索性结果的关系

此前三个手工裁切 system 的同输入 custom NED 中，Rokot Q8_0 的 pitch NED 为 `0.092`，Audiveris
5.11.0 为 `0.456`；pitch+duration NED 分别为 `0.171` 与 `0.493`。那个结果仍支持 Rokot 在局部符号
transcription 上优于 Audiveris，但不覆盖自动分段和 joining。本次完整 K331 run 补上了这些环节，并
证明当前瓶颈正位于 joining/readiness，而不是 runtime 可用性。两组指标定义不同，不得直接换算。

相关材料：

- 探索性对照：`reports/exploratory/k331-rokot-vs-audiveris/README.md`
- 当前解释：`docs/evaluation/pdf-omr.md`
- 评测目录规则：`tools/pdf-omr-cli/docs/evaluation.md`
- engine spec：`docs/specs/2026-07-31-rokot-pdf-omr-engine-design.md`
