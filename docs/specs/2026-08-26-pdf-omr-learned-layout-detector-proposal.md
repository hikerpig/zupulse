---
status: implemented
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

用户随后明确授权继续进行 research-only OLA probe。固定 raw inference 两次产生相同 prediction projection SHA，
warm CPU 处理 29 pages 合计约 11.3–11.4 秒；但默认 `systems` / `grand_staff` 输出没有完整匹配页。全局
confidence/NMS ablation 的最佳 `grand_staff` variant 也只有 1 page / 1 work 完整匹配。进一步使用 OLA `staves`
做固定相邻配对，虽然 13/29 pages 在 system count 上相同，只有 1 page / 1 work 的所有 pair boxes 达到 IoU 0.5，
且仍没有模型产生的 staff-line polylines、crop hashes 或 joining evidence。

因此 admission gate 仍为 `NOT_ELIGIBLE`，不得把 count coincidence 当成 segmentation success。完整 identity、runtime、
dependency 与 ablation evidence 位于
`tools/pdf-omr-cli/reports/exploratory/ola-v2-development-probe-v1/`。继续 OLA 的有效方向是取得适用许可后进行
target-domain training/fine-tuning 与 topology output 设计，不再继续 threshold-only tuning。

## 2026-08-27 OpenScore Lieder source decision

训练数据方向收敛为 OpenScore Lieder 的 CC0 source，而不是复用 OLA 聚合数据。固定 upstream revision
`6b2dc542ce2e8aa4b78c8ee62103b210efc07015` 后，source metadata 有 1,356 个 records；4 个缺少对应 `.mscx`，另有
75 个 score IDs 已被仓库现有 OLiMPiC evaluation evidence 引用。两类均 fail closed 排除，得到 1,277 个 eligible
scores；按 composer 分组的确定性 split 为 1,144 train、133 validation。

该决策只批准 source eligibility 与 selection plan。尚未批准或执行 MuseScore rendering、annotation generation、
augmentation、training 或 model/runtime integration。后续 renderer probe 必须固定 MuseScore、fonts、page settings
与 hashes，并由本仓库独立实现 SVG/layout extraction；不得复制 OLA 中 license 未声明的 annotation extraction code。
synthetic validation 不能替代现有 real-scanned OLiMPiC admission，frozen holdout 不变。

可复算 plan 位于 `tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/`。

## 2026-09-04 implementation outcome

本 development experiment 已按不超过 3 staff 的边界完成。最终训练集合在渲染前排除 source 声明超过 3 staff 的
108 份 score，保留 1,038 train / 131 validation scores；固定的 512/128 page slice 训练出 1,841-parameter
`compact-dilated-staff-line-cnn-v2`。synthetic validation 的完整五线重建为 124/128 exact pages。

真实扫描 OLiMPiC development 上，learned detector 从 classic baseline 的 0/29 提升到 9/29 exact pages，覆盖
4/6 works；27/29 pages 产生合法 boundary output，双跑 raw output 与 crop hashes 一致。20 个未准入页中 12 页
system count 不符，8 页 count 相同但 ordered centers 不符，因此该结果只通过 viability gate，不达到发布阈值。

模型已确定性导出为 9,355-byte ONNX。CPU-only ONNX Runtime 对 29 页的 predictions 和 TypeScript crop evidence 与
PyTorch/MPS canonical result 完全一致；独立进程级 probe 为 1.15–1.18 秒、峰值 RSS 242–250 MB。候选
`onnxruntime-node@1.29.0` 是 MIT 且支持当前 macOS arm64 / Windows x64 目标，但 target native files 仍增加约
88/66 MB，未获得明确 package-size 接受，因此产品 runtime 保持 `STOP`。

shared input probe 把 9 个 admitted pages 物化为同一批 36 个 deterministic single-system PDFs；Rokot 与 LEGATO
实际运行的 ordered input SHA projection 完全相同。Rokot 33/36 normalize、但 0/36 readiness-ready；LEGATO
35/36 normalize、1/36 `ready-with-warnings`。其中 35/36 inputs 是 3-staff，暴露了 Rokot 只能可靠表达前两谱表的
明确 capability gap。Rokot context policy 始终保持 `previous-prediction-headers-v1`（L/M/K）。

因此本 proposal 的研究实现已完成，但产品启用条件未满足。durable evidence 位于
`tools/pdf-omr-cli/reports/development/olimpic-learned-layout-v1/`、
`tools/pdf-omr-cli/reports/exploratory/staff-line-runtime-gate-v1/` 与
`tools/pdf-omr-cli/reports/development/olimpic-shared-detector-cross-engine-v1/`。
