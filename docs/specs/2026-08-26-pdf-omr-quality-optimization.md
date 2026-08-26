---
status: approved
date: 2026-08-26
approved: 2026-08-26
owner: Engineering
scope: PDF OMR CLI development evaluation only
---

# PDF OMR 质量优化

## Objective

在隔离的 `pdf-omr-cli` 中建立新的 development evidence，依次提高真实印刷钢琴谱的 full-page segmentation、
engine topology admission、跨 system joining 与 cross-engine candidate quality。研究结果只回答某个锁定组合是否
值得继续，不批准 App integration、自动 engine selection 或 Draft writeback。

本 initiative 从当前 `rokot-staff-system-v2` 开始重建 real-scanned full-page baseline。历史 v1 segmentation
failure、synthetic full-page success 和 system-crop quality MUST remain separate evidence，任何一类结果都不能替代
另一类分母。

## Evidence layers

质量报告 MUST 按以下层次独立统计：

```text
PDF input identity
→ deterministic render
→ explicit preprocessing variant
→ page/system segmentation
→ staff/part topology admission
→ engine transcription
→ cross-system joining
→ symbolic metrics
→ MusicXML/Harmony readiness
```

- `system-crop` MUST bypass full-page segmentation，并要求显式 `staffLayout`。
- synthetic `full-page` 只提供 pipeline evidence，MUST NOT improve real-scanned quality claims。
- real-scanned `full-page` 必须报告 attempted works、pages、segmentation status、system counts 和 failure stages。
- Ground truth readiness 为 `blocked` 时，报告 MUST retain pipeline evidence，MUST NOT emit symbolic or Harmony
  pseudo-metrics。

## Experiment identity

每个新实验 MUST 锁定并写入 canonical artifact：

```ts
type PdfOmrQualityExperimentIdentity = {
  corpusId: string;
  manifestSha256: string;
  split: "development";
  inputScope: "system-crop" | "full-page";
  preprocess: { id: string; version: string; parametersSha256: string };
  detector: { id: string; parametersSha256: string };
  engine?: { id: "audiveris" | "legato" | "rokot"; environmentSha256: string };
};
```

相同 identity 与相同 inputs MUST produce byte-identical canonical evidence。运行时间戳、绝对路径、raw exception、
access token 和本机 cache layout MUST NOT enter canonical artifacts。

历史 protocol/report/hash MUST NOT be overwritten。任何 preprocess、detector、normalizer、metric 或 model identity
变化都必须生成新的 output directory 与 protocol/version。

## Full-page segmentation baseline

第一阶段使用 `olimpic-scanned-full-page-dev-v1` 的六个 development works、29 pages 和当前
`rokot-staff-system-v2`。pilot 只读取 `split = development` 的 item，并在 render 前校验 input SHA-256。

每个 page 必须保留：

- `pageIndex` 与 `renderSha256`；
- `status: succeeded | failed`；
- 成功时的 ordered systems、pixel/PDF bboxes 与 crop hashes；
- 失败时的稳定 error code、message 和 bounded context；
- detector/preprocess identity。

一个 page segmentation failure 不得丢弃同 item 其他 page 的证据。缺失 input、input hash mismatch、非法 manifest
或未知 preprocess/detector variant 必须让整个 pilot fail closed，且不得发布 partial canonical report。

## Topology admission

Topology optimization MUST preserve all musical facts。任何 normalization 都不得删除或修改 pitched/rest events、
pitch、onset、duration、tie 或 tuplet。

在修改 `alignDraftParts` 前，development audit 必须区分：

- empty part；
- header-only/duplicate part；
- contentful extra part；
- uniquely ordered single-staff parts；
- unresolved part/staff role。

只有结构事实能够形成唯一、无损映射时才允许 admission。多余 contentful part、role collision 或 staff ordering
ambiguity 必须继续返回 `BENCHMARK_EVALUATION_LIMITATION`。不得使用 ground-truth note facts 选择要保留的 part。

## Preprocessing ablation

Preprocessing 只能作为显式、版本化的 development variant。原始 render bytes 必须保持 immutable；每个 variant
记录 input/output hash 和参数。初始实验只允许单变量比较 `none`、small-angle deskew、local contrast 和 adaptive
threshold。不得根据单个页面结果动态选择 variant。

某个 variant 只有同时满足以下条件才可进入新的 development protocol：

1. real-scanned full-page segmentation admission 提升；
2. system-count agreement 提升或保持；
3. 已评估 bucket 没有已知 regression；
4. output deterministic；
5. runtime/resource cost 被记录。

若 deterministic variants 无实质改善，learned detector 必须另立设计，明确 dependency、model revision、weights
license、hash、runtime、artifact 和 distribution boundaries；不得在本 initiative 中隐式下载或提交权重。

## Joining constraints

Joining 只允许继承 MusicXML 可跨 system 延续、且来源唯一合法的结构字段，例如 `divisions`、`key`、`time`、
`staves` 与 `clef`。missing、duplicate、malformed 或 conflicting context MUST NOT propagate。

本 initiative MUST NOT：

- scale note durations to fill a measure；
- synthesize rests to satisfy validation；
- delete measures or contentful parts；
- infer ambiguous repeats/ties；
- weaken readiness diagnostics。

## Cross-engine decision

Cross-engine comparison 保持 immutable inputs、engine/report hash provenance、explicit topology 与
successful-item intersection。所有 repair candidates 固定：

```ts
type RepairPolicy = {
  reviewRequired: true;
  autoApplicable: false;
};
```

GT-derived `oracleRecommended` 只用于 development upper-bound。候选必须同时满足 individual improvement、
individual non-regression 与 combined-set non-regression 才能计入 oracle set。

当前 locked selector gate 保持不变：minimum 35 selected candidates、maximum 0 regressions、95% two-sided Wilson
lower bound at least `0.90`。未达标时 decision MUST remain `NOT_ELIGIBLE`，不得实现 runtime auto-selection。

## Verification

每个行为任务先运行 focused tests，再运行 package typecheck。阶段结束后运行：

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm verify:fast
pnpm format:check
git diff --check
```

任何后续编辑都会使此前覆盖该文件的验证失效；最终变更后必须重跑最小覆盖测试。

## Outcome

2026-08-26 development execution 已完成，未产生可接入 runtime 的质量改进：

- `none`、`deskew-v1`、`local-contrast-v1`、`adaptive-threshold-v1` 在 29 个真实整页上均为 0 segmentation
  success，全部在 `grand-staff-pairing` fail closed；默认保持 `none`。
- 45 个 Rokot joining artifacts 全部是单 system，multi-system denominator 为 0；当前 evidence 不支持修改跨
  system context propagation，normalizer 保持不变。
- LEGATO topology、full-page preprocessing 与 joining 均没有形成合法的新 Draft/comparison，因此 selector gate
  不重算伪造的新分母，仍为 26 comparable、28 oracle candidates、`NOT_ELIGIBLE`。

下一阶段若继续，必须另立 learned layout detector Spec，并在模型接入前确认 weights license/hash、runtime、artifact
contract 与 distribution。durable evidence 位于
`tools/pdf-omr-cli/reports/exploratory/olimpic-quality-optimization-v1/`；proposed experiment contract 位于
`docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`。

## Non-goals

- 不读取或修改 frozen holdout。
- 不修改 `apps/*`、Bridge、Library、Repository 或 managed files。
- 不自动选择 engine、不拼接或写回 candidate Draft。
- 不提交 generated runs、public archives、models、cache 或 machine-specific paths。
- 不把 readiness、parseability、determinism 或 process success 单独表述为 recognition quality。
