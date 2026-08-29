# Task: 提升 Rokot 与 LEGATO 共用的全页谱表系统检测

## Goal

在不修改 Rokot `L/M/K` 上下文策略和两套识别引擎内部逻辑的前提下，让同一个 full-page detector 能从真实扫描 PDF 中稳定产出有序、拓扑正确、可复现的 system crops，并同时供 Rokot 与 LEGATO 使用。

## Non-goals

- 不再评估或修改 Rokot header context；固定使用 `previous-prediction-headers-v1`（即 `L/M/K`）。
- 不优化 Rokot 或 LEGATO 的音符、节拍、声部与 MusicXML 后处理。
- 不读取 frozen holdout，不用 evaluation score IDs 训练，也不以 synthetic validation 替代真实扫描准入。
- 在模型通过真实扫描准入前，不向产品 runtime 添加推理依赖或模型文件。
- 不同时维护多套实验模型；先验证一个最小候选，失败后再基于证据改变方向。

## Canonical context

- Proposal：`docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`
- 训练源计划：`tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/README.md`
- 真实扫描 development corpus：`tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/`
- 当前经典 detector：`tools/pdf-omr-cli/src/staff-system-segmentation.ts`
- 已有 learned output boundary：`tools/pdf-omr-cli/src/learned-layout-detector.ts`
- Boundary tests：`tools/pdf-omr-cli/src/__tests__/learned-layout-detector.test.ts`
- OLA 探索证据：`tools/pdf-omr-cli/reports/exploratory/ola-v2-development-probe-v1/`
- Rokot runtime truth：`tools/pdf-omr-cli/src/engines/rokot.ts`

## Design decision

首个候选采用 compact staff-line segmentation，而不是直接预测 system bounding boxes：

```text
PDF page @ width 1400
  -> grayscale-u8
  -> learned staff-line probability mask
  -> deterministic line extraction and system grouping
  -> learned-staff-system-v1 validation
  -> deterministic system crops
  -> Rokot / LEGATO adapters
```

理由：当前失败点是扫描噪声下 staff groups 为零；学习模型只负责恢复 staff-line evidence。排序、五线一组、system grouping、边界和裁切仍由确定性代码负责，可直接复用现有 fail-closed boundary。OLA 的 box-only probe 已显示“数量偶尔一致”并不等于 topology 正确，且没有 staff-line polylines，不能满足当前契约。

模型训练可以放在隔离的 research Python 环境中；产品推理格式、runtime 与依赖只有在真实扫描准入通过后才决定。

## Evaluation protocol

### Primary admission set

- 固定使用 `olimpic-scanned-full-page-dev-v1`：6 works、29 pages、121 systems。
- 每次候选运行两遍，比较 system 数量、顺序、topology、bbox、staff-line geometry 与 crop hashes。
- frozen holdout 保持未读。
- 遵循 proposal 的最低 viability gate：至少 2 个 works 出现完全匹配页面，且不能仍为 0 个完全匹配页面。
- viability gate 只允许进入 runtime 评估，不代表产品完成；集成前另报告 exact-page、exact-work、system recall、topology accuracy、耗时与内存，不用单一平均分掩盖失败页面。

### Auxiliary checks

- clean MuseScore/K331 只用于 detector non-regression 与裁切确定性，不参与真实扫描准入结论。
- 已知会令当前 detector 得到 `staff-groups=0` 的 MuseScore benchmark augmented PDF 4/9 可作为 robustness smoke；在 truth mapping 未固定前，只判断“能否产出合法布局”，不计入准确率。
- DCML 现有数据主要适合下游 recognition/header-context 评测，不直接作为 detector 训练或主准入集。只有存在合法 full-page source 与可审计 system truth 时，才新增 detector case。
- 第一轮不新造零散人工 case；先复用上述集合。仅当失败聚类显示 OLiMPiC 缺少某种明确版式时，再添加最小代表 case。

## Execution stages

### Stage 1 — renderer and annotation probe

从已固定的 OpenScore Lieder eligible 集合中，按 1/2/3-staff topology 选 12–20 个 works。固定 MuseScore 4.7.4、字体、页面设置与导出参数，同时导出 SVG 和 width-1400 raster。解析 SVG 中的 `StaffLines`，生成 system、staff count、line polyline 与 bbox truth。

人工审计每类 topology 至少 3 页，并连续导出两次比较 manifest 与 geometry hashes。重点检查 hidden empty staves、跨页 system、重复 SVG element、缩放坐标和声乐谱的多 staff grouping。

Checkpoint：只有 annotation 与人工审计一致且两次导出确定性一致，才渲染完整训练集；否则先修正 truth builder，不开始训练。

### Stage 2 — deterministic dataset builder

基于已固定的 1,144 train / 133 validation composer-disjoint split 生成 raster、annotation 与 canonical manifest。所有 evaluation score IDs 继续 fail closed 排除。

仅对 train split 做 seeded augmentation：轻微 rotation/perspective、contrast/background、blur/noise、局部 ink loss/occlusion；annotation 使用同一几何变换同步生成。validation 保持 clean synthetic，用来识别训练回归，而不是替代 OLiMPiC。

Checkpoint：相同输入与 seed 的两次 build 具有相同 manifest、annotation 和抽样图像 hashes；自动校验所有 line/bbox 在页内、顺序合法且 `lineCount = staffCount * 5`。

### Stage 3 — one minimal learned candidate

训练一个 compact binary staff-line segmentation model；先不做架构 sweep。训练输出必须固定 source revision、split manifest、seed、环境 lock、配置、checkpoint hash 与指标。

实现确定性后处理：从 mask 提取 line polylines，按 spacing/group proximity 聚成 staff 与 system，随后交给 `materializeLearnedLayoutPage` 校验和裁切。后处理遇到重叠、越界、line 数量不符或 topology 不明确时 fail closed。

Checkpoint：synthetic validation 的 topology reconstruction 通过预先记录的阈值，并在 OLiMPiC 29 页上达到 proposal viability gate。若 synthetic 表现高但 OLiMPiC 仍只覆盖 0–1 个 work，停止 runtime 集成，先按真实失败聚类调整 augmentation 或 representation。

### Stage 4 — runtime and dependency gate

仅对通过 Stage 3 的模型评估 CPU inference runtime。记录 macOS/Windows 可分发性、license、模型大小、冷/热启动、单页耗时、峰值 RSS、两次输出一致性和离线安装影响。

Checkpoint：license 或分发边界不清晰即保持 research-only；不把 OLA/Ultralytics AGPL 路径带入产品。选择满足需求的最小 runtime，不为未来模型预建抽象层。

### Stage 5 — shared integration and cross-engine proof

把 learned candidate 接到一个共用 detector 入口；两个 engine adapter 消费完全相同的 crop bytes/hashes。保持各引擎现有 topology capability checks，detector 不因某个引擎能力较弱而丢弃合法 systems。

对通过 detector admission 的页面分别运行 Rokot 与 LEGATO，并拆开报告：

1. detector 是否给出正确 crops；
2. 给定同一正确 crop 后，各 engine 的 recognition 指标；
3. end-to-end 完成率与失败 stage。

这一步用于回答“共同 detector 改善了多少”，不把 recognition 差异归因给 detector。Rokot 始终固定 `L/M/K`。

### Stage 6 — promote durable evidence

更新 proposal/Feature Contract 中已验证的 runtime 行为、依赖决定、准入结果和已知缺口；生成可复现 development report。任务完成后删除本 task bundle，保留规范、测试、报告与 runtime code 作为事实源。

## Acceptance criteria

- [ ] Rokot 默认及实验运行均保持 `previous-prediction-headers-v1`，相关 regression test 通过。
- [ ] training source 不含 frozen holdout 或已记录的 75 个 evaluation score IDs。
- [ ] annotation builder 经人工抽审，并能在相同环境下确定性重建。
- [ ] learned output 满足既有 `learned-staff-system-v1` schema、ordering、bounds、topology 和 crop determinism invariants。
- [ ] OLiMPiC development 全部 29 页运行两遍，产生逐页证据并达到最低 viability gate。
- [ ] Rokot 与 LEGATO 接收相同 crop hashes；报告分别呈现 detector、recognition、end-to-end 指标。
- [ ] 产品依赖与模型只有在 license、分发、CPU 性能和确定性 gate 通过后才进入 runtime。
- [ ] 最终行为与已知缺口已提升到对应 Current Feature Contract/spec/report，task bundle 已删除。

## Verification

每个 stage 先运行其最小测试，最终再升级门禁：

- Boundary 与后处理：`pnpm --filter @zupulse/pdf-omr-cli test -- learned-layout-detector`
- PDF OMR CLI tests：`pnpm --filter @zupulse/pdf-omr-cli test`
- PDF OMR CLI typecheck：`pnpm --filter @zupulse/pdf-omr-cli typecheck`
- Repository fast gate：`pnpm verify:fast`
- Formatting：`pnpm format:check`
- Patch sanity：`git diff --check`
- 数据与模型命令必须在对应 report 中记录完整 argv、版本、seed、输入 revision 和 artifact hashes。

最后一次代码或数据修改后，必须重跑覆盖最终 scope 的最小验证；更早结果不作为最终验证。

## Stop conditions

- SVG truth 无法可靠表达 visible staff/system topology：停止 full dataset build，先解决 annotation truth。
- 训练源或权重 license 不清晰：不得进入产品 runtime。
- synthetic validation 通过但 OLiMPiC 仍不超过 1 个 work：停止集成，不用调阈值包装失败。
- 推理输出跨两次运行不一致，或无法通过现有 boundary：不得交给 engine adapter。

## Open decisions

- Stage 3 通过 viability gate 后，结合首轮精度/耗时证据确定产品集成阈值；proposal 的“至少 2 works”只是继续投资下限，不自动等于发布阈值。
- 产品 CPU runtime 由 Stage 4 实测决定；当前不预选 ONNX Runtime、Core ML 或其他依赖。
