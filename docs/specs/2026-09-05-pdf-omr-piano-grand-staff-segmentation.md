---
status: proposed
date: 2026-09-05
owner: Engineering
scope: PDF OMR CLI development experiment only
depends_on: 2026-09-05-pdf-omr-piano-grand-staff-slice.md
---

# PDF OMR 钢琴大谱表 non-fragmented segmentation

## Problem

K331 六页测量已经证明：不为钢琴再训练 layout。`rokot-staff-system-v2` 在
`staffLayout=grand-staff` 且 `allowFragmentedRuns=false` 时复现 `6/6/1/6/6/2` 共 27 个 2-staff
system。当前 Rokot full-page runtime 把 `allowFragmentedRuns` 写死为 `true`，auto 模式最多 2/6 页，
grand-staff 模式最多 1/6 页。UNet 不重训改 `staffCount=2` 只有 3/6。

缺口是 **已有 detector 的调用方式**，不是新模型。本提案把这条能切的模式收成一个冻结 identity，在 CLI
development 路径上交出可双跑的 2-staff crops。它不改 Desktop default，不降低 Library 质量线。

依据：`tools/pdf-omr-cli/reports/exploratory/k331-piano-grand-staff-layout-v1/`，mapping SHA-256
`0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8`。

## Goal

在 CLI 中提供显式、不可混用的 segmentation identity `piano-grand-staff-v1`，对 K331 六页产出与冻结
topology truth 一致的 27 个 2-staff system crops，两次运行 crop hash 与 report hash 完全一致。通过
layout 门后再用 **同一套 ordered crop PDFs** 跑 Rokot 与 LEGATO，只报告符号质量，不发布。

## Non-goals

- 不修改 Desktop / App / Bridge 的默认 detector，不把该 identity 做成产品 default。
- 不训练 UNet/DETR/OLA，不读 holdout，不用 OLiMPiC 29 页当门。
- 不把 `allowFragmentedRuns=true` 的现有 auto 行为改掉（混合谱、扫描页仍走当前 default）。
- 不启用 `pairAdjacentUnpairedGroups`（K331 上它不能修 p1/p2）。
- 不新增 `onnxruntime-node`，不把 Library Joint F1 门槛降到当前识别数字。
- 不在本轮修 Rokot header-context 或 LEGATO tie/time-signature；那些是 layout 稳定之后的独立 Spec。

## Frozen identity

```ts
const PIANO_GRAND_STAFF_SEGMENTATION_V1 = {
  id: "piano-grand-staff-v1",
  detectorVersion: "rokot-staff-system-v2",
  staffLayout: "grand-staff",
  allowFragmentedRuns: false,
  pairAdjacentUnpairedGroups: false,
} as const;
```

调用方只能选这个 id，不能再拼一组互相冲突的 flags。Zod 校验 request；缺省仍是今天的
`{ staffLayout: request.staffLayout ?? "auto", allowFragmentedRuns: true }`。

CLI 增加：

```bash
pnpm pdf-omr -- recognize <input.pdf> --engine rokot --output <dir> \
  --segmentation piano-grand-staff-v1
```

`--segmentation` 与随意改 `allowFragmentedRuns` 互斥。`--staff-layout` 在指定该 id 时必须省略或等于
`grand-staff`，否则 fail closed。

## Layout protocol（K331）

输入：`test-fixtures/musicxml/K331-3_reviewed.pdf`（SHA 已在 fixture provenance 中）。
Truth：`tools/pdf-omr-cli/corpus/k331-piano-grand-staff-dev-v1/source-mapping.json`。

每个 page 必须记录：

- `pageIndex`、render SHA-256、`status`
- 成功时 ordered systems：`staffCount=2`、`staffLayout=grand-staff`、pixel bbox、`cropSha256`
- 失败时稳定 `stage`（如 `grand-staff-pairing`），不得丢弃同 PDF 其他页的证据

topology-exact：system 数量等于 truth、reading order、每个中心落在 truth 纵带、`staffCount=2`。

双跑：同一 identity、同一 render bytes，两次 `cropSha256` 序列与 canonical report SHA 必须逐字节相同。
时间戳、绝对路径、RSS 不得进入 canonical report。

## Recognition protocol（仅 layout 门过后）

用该 identity 物化 27 个单 system PDF，经与 `buildSharedDetectorSystemInputs` 相同的「一处裁切、两引擎
消费」入口。Rokot 保持 `previous-prediction-headers-v1`（L/M/K）。LEGATO 吃同一 ordered input hashes。

对照（不得改写）：

| Baseline                            | Joint F1 | Valid measures |
| ----------------------------------- | -------: | -------------: |
| verified-systems，无 header context |   0.1567 |         19/274 |
| header-context `L/M/K`              |   0.3768 |         57/274 |

不得用 process success / normalize success 代替 Pitch/Onset/Duration/Joint F1。识别数字只报告。产品
runtime 保持 `STOP`。

## Admission

layout 门（必须全中）：

1. K331 6/6 topology-exact，27 systems，全部 `staffCount=2`。
2. 双跑 crop hash 序列与 report SHA 一致。
3. default Rokot full-page（fragmented auto）行为的现有测试不回归。
4. 未读 holdout；未改 Desktop default。

识别门：layout 门通过后才跑；无论 F1 高低都不构成发布。若 Joint F1 仍远低于 Library 线，下一投资写
「2-staff 识别」，不是再改 detector。

## Likely files

- `tools/pdf-omr-cli/src/staff-system-segmentation.ts` — 导出冻结 identity
- `tools/pdf-omr-cli/src/engines/types.ts`、`rokot.ts`、`commands/recognize.ts`、`command.ts` — 显式
  segmentation，default 不变
- Zod request/report schema 与 `__tests__`
- development 脚本：K331 双跑 materialize + topology 对照 mapping
- `tools/pdf-omr-cli/reports/exploratory/k331-piano-grand-staff-segmentation-v1/`

不改 `apps/*`。Feature Contract 只在将来真的改变可观察 Desktop 行为时更新。
