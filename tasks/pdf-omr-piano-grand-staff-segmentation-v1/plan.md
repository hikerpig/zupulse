# Task: 冻结 piano-grand-staff-v1 segmentation，在 K331 上交出可双跑的 27 个 2-staff crops

## Goal

CLI 上提供显式 identity `piano-grand-staff-v1`（`grand-staff` + `allowFragmentedRuns=false`），K331 六页
topology-exact 6/6、27 个 crop hash 双跑一致。Default Rokot full-page 行为不变。过门后同一套 crops 跑
Rokot/LEGATO 只报 F1，不发布。

## Non-goals

- 不改 Desktop default，不训练模型，不读 holdout，不用 OLiMPiC 22/29 当门。
- 不打开 `pairAdjacentUnpairedGroups`，不改 auto+fragmented 的现有测试期望。
- 本轮不修 LEGATO tie/time-signature，不降 Library F1 线。

## Canonical context

- `docs/specs/2026-09-05-pdf-omr-piano-grand-staff-segmentation.md`
- `docs/specs/2026-09-05-pdf-omr-piano-grand-staff-slice.md`（测量结论）
- `tools/pdf-omr-cli/corpus/k331-piano-grand-staff-dev-v1/source-mapping.json`
- `tools/pdf-omr-cli/reports/exploratory/k331-piano-grand-staff-layout-v1/`
- `tools/pdf-omr-cli/src/staff-system-segmentation.ts`
- `tools/pdf-omr-cli/src/engines/rokot.ts`（当前写死 `allowFragmentedRuns: true`）
- `tools/pdf-omr-cli/src/shared-layout-detector.ts`（一处裁切、两引擎消费）

## Frozen identities

```ts
id: "piano-grand-staff-v1";
detectorVersion: "rokot-staff-system-v2";
staffLayout: "grand-staff";
allowFragmentedRuns: false;
pairAdjacentUnpairedGroups: false;
```

- PDF：`test-fixtures/musicxml/K331-3_reviewed.pdf`
- mapping SHA-256：`0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8`
- expected systems：`6/6/1/6/6/2`，全部 `staffCount=2`
- Rokot context：`previous-prediction-headers-v1`（L/M/K）
- 识别对照：Joint F1 `0.1567` / `0.3768`，valid `19/274` / `57/274`

## Scope

可能修改：

- `tools/pdf-omr-cli/src/staff-system-segmentation.ts`
- `tools/pdf-omr-cli/src/engines/types.ts`、`rokot.ts`
- `tools/pdf-omr-cli/src/command.ts`、`commands/recognize.ts`
- 相关 Zod schema 与 `__tests__/*.test.ts`
- 新 development 脚本（K331 materialize / topology / dual-run）
- `tools/pdf-omr-cli/reports/exploratory/k331-piano-grand-staff-segmentation-v1/`

应复用：`segmentStaffSystems`、`probe_k331_classic_layout.ts` 的对照逻辑、`buildSharedDetectorSystemInputs`
的 crop→PDF 模式。

## Execution plan

1. [ ] 导出 `PIANO_GRAND_STAFF_SEGMENTATION_V1` 常量。单元测试：该 identity 的字段不可变；把它传给
       `segmentStaffSystems` 等价于 `{ staffLayout: "grand-staff", allowFragmentedRuns: false }`。
       验证：`pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/staff-system-segmentation.test.ts`
2. [ ] Recognize request 增加可选 `segmentationId: "piano-grand-staff-v1"`（Zod）。缺省路径仍
       `allowFragmentedRuns: true` 且 `staffLayout` 来自现有 `--staff-layout`。指定 id 时忽略并禁止冲突的
       fragmented/layout 组合，否则 `INVALID_CLI_ARGUMENT`。CLI：`--segmentation piano-grand-staff-v1`。
       验证：command/recognize 的 schema 与 flag 测试。
3. [ ] Rokot adapter 在 full-page 下读取该 id 再调用 `segmentStaffSystems`。现有 fragmented auto 测试不得
       改变期望。新测试：K331 或最小 grand-staff fixture 在该 id 下产出 2-staff systems 且 fail closed
       于非法 layout。
4. [ ] Development 脚本：渲染 K331 → `piano-grand-staff-v1` → 对照 mapping 的 topology-exact，写出 ordered
       `cropSha256`。跑两次，要求 report SHA 与 crop 序列相同。不得搜 threshold。
5. [ ] Layout 门：6/6 topology-exact、27 systems、全部 staffCount=2、双跑一致。失败则 `STOP`，不改
       default、不训练。通过则写入
       `tools/pdf-omr-cli/reports/exploratory/k331-piano-grand-staff-segmentation-v1/`。
6. [ ] Human checkpoint：确认 default 测试未回归后再考虑识别。未过 layout 门不准跑引擎。
7. [ ] 过门后：同一套 system PDFs 喂 Rokot 与 LEGATO，报告 Pitch/Onset/Duration/Joint 与 valid measures，
       对照既有 K331 baselines。process success 单独记账。产品 runtime 仍 `STOP`。
8. [ ] 若 F1 仍远低于发布线，在报告里把下一投资写成 2-staff 识别（LEGATO topology/tie），并明确 **不要**
       再开 layout 训练。Desktop 接入必须另立 Spec。

## Acceptance criteria

- [ ] CLI 可用 `--segmentation piano-grand-staff-v1`；不传时行为与今天相同。
- [ ] K331 6/6 topology-exact，27 个 2-staff crops，双跑 hash 一致。
- [ ] 现有 `allowFragmentedRuns: true` 测试不回归。
- [ ] 未读 holdout；未改 App/Desktop default。
- [ ] 识别若执行：两引擎 ordered input hashes 相同；报告 F1 而非只报 success。

## Verification

- 最小测试：segmentation identity + recognize flag 的 Vitest；K331 dual-run 脚本。
- Layout 门：对照 `source-mapping.json` 的 6 页 topology + crop SHA 双跑。
- 完成门禁：`pnpm --filter @zupulse/pdf-omr-cli test`、`pnpm format:check`、`git diff --check`。
- 不改 Desktop 则不必 `pnpm desktop:build`。若误改 Bridge/UI，停下来并拆出。

## Stop conditions

- 用 OLiMPiC 22/29 或 UNet 3/6 当本 slice 的门：禁止。
- 为凑 6/6 打开 fragmented 或 pair-adjacent：禁止。
- layout 未双跑一致就开始识别：禁止。
- 把 Desktop default 改成该 identity：禁止（需新 Spec）。
- 把 process success 写成识别质量：禁止。

## Open decisions

- Desktop 工作台是否增加显式「钢琴大谱表」选项：本 slice 不做。
- MuseScore OMR Benchmark ID 4/9 clean PDF 是否作为第二份 development 分母：K331 双跑通过后再决定。
- LEGATO 是否已有 system-crop 入口可直接吃共享 PDF：实现时以 runtime 代码为准，缺则只报 Rokot 并记录缺口。
