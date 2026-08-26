---
status: proposed
date: 2026-08-26
owner: Engineering
scope: PDF OMR CLI development experiment only
depends_on: 2026-08-26-pdf-omr-quality-optimization.md
---

# PDF OMR learned layout detector proposal

## Problem

当前 `rokot-staff-system-v2` 及 `none`、deskew、local contrast、adaptive threshold 在 6 works / 29 个
real-scanned full pages 上均为 0 segmentation success，全部止于 `grand-staff-pairing`。这说明瓶颈不是简单灰度或
小角度修正，而是密集音乐符号下的 staff-line、connector 与 grand-staff topology 联合判断。

本提案只定义下一项可审批 development experiment。它不批准下载模型、训练、加入 dependency、修改 App、读取
holdout 或改变 runtime default。

## Smallest sufficient experiment

第一阶段只比较一个 learned variant 与固定 baseline，不建立模型集成或逐页路由：

```ts
type LearnedLayoutDetectorIdentity = {
  id: "learned-staff-system-v1";
  modelRevision: string;
  weightsSha256: string;
  weightsLicense: string;
  trainingDataDeclarationSha256: string;
  runtime: { id: string; version: string; backend: "cpu" };
  input: { format: "grayscale-u8"; targetWidth: 1400 };
  outputSchemaVersion: "1.0.0";
  parametersSha256: string;
};
```

模型输出必须是 ordered system candidates；每项包含 `pageIndex`、normalized bbox、`staffCount`、ordered staff-line
polylines 与可选 connector evidence。CLI 必须重新校验 bbox、顺序、line topology、staff count 和 output bounds，
再由现有 deterministic crop code 生成 crop bytes/hash。模型不得直接返回文件路径或任意 crop bytes。

## Dependency and distribution gate

选择 inference runtime 和 weights 前必须提交可复算 probe，至少包含：

- dependency name、exact version、transitive licenses、supported macOS/Windows architectures 与 unpacked size；
- model source、immutable revision、weights SHA-256、weights license、training-data declaration 与 commercial
  distribution permission；
- CPU-only cold/warm runtime、peak RSS、determinism、offline execution和失败时的 stable error；
- model/runtime artifact 是否允许随 Desktop 分发。许可不明确或要求联网下载时必须 `STOP`。

本阶段不预选具体 runtime 或 model。只有上述材料经审批后，才允许新增一个最小 dependency；不得同时接入多个
framework，也不得把 Python environment 变成产品 runtime requirement。

## Experiment protocol

- 只读取 `olimpic-scanned-full-page-dev-v1` development split；不得读取 frozen holdout。
- baseline 与 candidate 使用相同 immutable render bytes、target width、page order 和 metric implementation。
- 一个固定 model identity 必须处理全部 29 pages，不允许按页面选择 detector 或人工修 bbox。
- canonical report 记录 manifest、render、model/runtime、逐页 raw validated output、crop hashes、failure stage 和 report
  SHA；运行时间单独作为 environment evidence。
- `system-crop` benchmark 继续 bypass segmentation，不纳入 full-page improvement 分母。

## Admission gate

只有同时满足以下条件，才能另立 runtime integration Spec：

1. segmentation success 从 0/29 提升，且至少覆盖两个 work；
2. admitted pages 的 system count 与人工冻结的 development annotation 一致；
3. 无 work bucket regression，重复运行 crop hashes 完全一致；
4. 所有输出通过 topology/bounds validation，非法输出 fail closed；
5. CPU runtime、peak RSS、artifact size 与 Desktop distribution license 均被明确接受；
6. 新 multi-system artifacts 能进入 joining/readiness evaluation，但不得仅以 process success 作为识别质量。

未满足任一条件时保持 research-only `STOP`。达到 gate 也只允许创建新的 integration Spec，不自动修改 App 或启用
cross-engine selector。

## Required approval input

开始模型选择或训练前，需要明确批准：允许评估的模型来源、可接受 license、最大 weights/package size、目标 CPU
latency/peak RSS，以及是否允许新增 native ONNX 类 runtime。缺少这些输入时，本提案停留在 `status: proposed`。

## 2026-08-26 candidate screening

首个公开候选 `v-dvorak/omr-layout-analysis` 的 OLA v2 与目标版式相符，release asset 为 40,530,853 bytes，
repository source license 为 MIT；但其固定训练/推理依赖是 `ultralytics==8.3.4`，候选仓库没有单独声明 weights
license。Ultralytics 官方许可说明将其模型及由其训练得到的模型默认置于 AGPL-3.0，proprietary/private use 需要
商业许可。因此该候选在下载权重和安装依赖前 `STOP`，没有生成 model identity，也没有执行 29-page experiment。

本轮只实现 framework-independent output boundary：`learned-staff-system-v1` identity schema、ordered normalized
system bbox、多 staff 五线 topology、page/bounds validation，以及由 CLI 从 immutable RGBA page bytes 生成的
deterministic non-overlapping crops。它允许真实 system 包含两个以上 staff，但任何页码错配、重叠、越界、line
乱序或 `staffCount` 不一致都以 `ENGINE_OUTPUT_INVALID` fail closed。该 boundary 不改变 Rokot runtime default。

完整 screening evidence 位于
`tools/pdf-omr-cli/reports/exploratory/ola-v2-dependency-gate/`。下一候选必须先证明 source、weights、training data
与 runtime 的 Desktop distribution permission，再允许下载或执行。
