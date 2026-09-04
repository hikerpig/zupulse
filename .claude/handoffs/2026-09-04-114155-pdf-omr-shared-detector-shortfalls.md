# Handoff: PDF OMR shared detector 当前短板与后续优化入口

## Session Metadata

- Created: 2026-09-04 11:41:55 Asia/Shanghai
- Project: `/Users/hikerpig/mydemos/zu__feat`
- Branch: `feat-omr-compare`
- Session duration: 约 10 小时 35 分钟
- Final commit: `68d78cac feat(pdf-omr): validate shared learned layout detector`

### Recent Commits (for context)

- `68d78cac feat(pdf-omr): validate shared learned layout detector`
- `d9c3f089 fix(pdf-omr): cover full layout truth topology`
- `0b8c7188 feat(pdf-omr): add deterministic layout dataset builder`
- `4837a184 feat(pdf-omr): complete layout renderer probe`
- `576413a9 feat(pdf-omr): validate deterministic layout renders`

## Handoff Chain

- **Continues from**: None. This handoff is independent from the existing harmony-analysis handoff.
- **Supersedes**: None.

## Current State Summary

本轮完成了一个 research-only 的 shared learned layout detector：训练源在渲染前整份排除 declared staff count
超过 3 的 score，compact staff-line model 经确定性后处理、既有 fail-closed boundary 和统一 crop 物化入口同时供 Rokot
与 LEGATO 使用。OLiMPiC real-scanned development 的 exact-page admission 从 classic detector 的 `0/29` 提升到
`9/29`，但 detector coverage 和两套引擎的 end-to-end readiness 都不足发布，因此产品 runtime 保持 `STOP`。
后续应只围绕现有失败页做小规模 hard-case 优化，并优先修 LEGATO recognition；Rokot 固定 `L/M/K`，不再做
header-context ablation。

## Codebase Understanding

## Architecture Overview

当前 research data flow：

```text
OpenScore Lieder scores (declared staff count <= 3)
  -> deterministic SVG/raster truth + seeded train-only augmentation
  -> compact-dilated-staff-line-cnn-v2
  -> probability mask
  -> deterministic line/staff/system reconstruction
  -> materializeLearnedLayoutPage (schema/order/bounds/topology/crop validation)
  -> buildSharedDetectorSystemInputs (one deterministic PDF per crop)
  -> identical bytes/hashes consumed by Rokot and LEGATO
  -> normalize -> validateDraft -> export gate
```

Learned model 只恢复 staff-line evidence；system sorting、grouping、bounds 和 crop 仍由确定性代码控制。产品 Desktop
pipeline 尚未加载模型或 ONNX Runtime，本轮新增入口只用于 research/development evidence。

## Critical Files

| File                                                                             | Purpose                                                              | Relevance                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| `tools/pdf-omr-cli/src/learned-layout-detector.ts`                               | learned output 的 Zod/boundary 与 deterministic crop materialization | 最多 3 staff、fail-closed 的事实源                     |
| `tools/pdf-omr-cli/src/shared-layout-detector.ts`                                | 将 validated crops 一次性编码成两个 engine 共用的 PDF inputs         | 证明 cross-engine 输入一致                             |
| `tools/pdf-omr-cli/scripts/staff_line_reconstruction.py`                         | mask -> lines -> staffs -> systems                                   | 当前 20 个失败页最可能需要优化的位置                   |
| `tools/pdf-omr-cli/scripts/train_staff_line_segmenter.py`                        | compact model training                                               | 只允许做单候选、小规模 targeted retraining             |
| `tools/pdf-omr-cli/scripts/build_openscore_layout_dataset.py`                    | deterministic dataset build                                          | `MAX_STAFF_COUNT = 3`，不得重新纳入更大 topology       |
| `tools/pdf-omr-cli/src/engines/rokot.ts`                                         | Rokot adapter/runtime default                                        | default policy 固定为 `previous-prediction-headers-v1` |
| `tools/pdf-omr-cli/reports/development/olimpic-shared-detector-cross-engine-v1/` | shared-input、recognition、end-to-end 证据                           | 当前结论的主事实源                                     |
| `tools/pdf-omr-cli/reports/exploratory/staff-line-runtime-gate-v1/`              | ONNX CPU、RSS、license、distribution 证据                            | 产品依赖仍为 STOP 的依据                               |
| `docs/evaluation/pdf-omr.md`                                                     | 历次 Rokot/LEGATO/DCML/OLiMPiC 评测结论                              | 不要只看最新 36 crops 的 process success               |
| `docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`              | 当前 implemented proposal 和 gate                                    | 后续改变评测协议前先更新此文档                         |

### Key Patterns Discovered

- Learned inference output is untrusted input. Validate schema, ordering, bounds, `staffCount <= 3`, line topology,
  crop bytes, and crop hashes before either adapter sees it.
- Detector、recognition、end-to-end 必须分层报告；合法 output 或 engine process success 不能替代符号准确率和
  export readiness。
- 两个 adapter 必须消费同一份 materialized crop bytes/hash，不能各自重新裁切。
- 真实扫描 OLiMPiC development 是 detector admission set；clean synthetic validation 只用于训练回归。
- Frozen holdout 不得读取，已登记的 75 个 evaluation score IDs 不得进入训练。
- User scope is explicit: scores with more than 3 declared staves are excluded before rendering.

## Work Completed

### Tasks Finished

- [x] 构建最多 3 staff 的 deterministic dataset：`1,038 train / 131 validation`，排除 108 个 >3-staff scores。
- [x] 训练 `compact-dilated-staff-line-cnn-v2`：1,841 parameters；validation filtered line F1 `0.9984`，
      `124/128` exact topology reconstruction。
- [x] 实现 deterministic mask reconstruction、learned boundary 和 shared crop materialization。
- [x] 在 OLiMPiC 6 works / 29 pages / 121 systems 上双跑，确认 learned output 与 crop hashes 可复现。
- [x] 对 9 个 admitted pages 的 36 个相同 crops 分别真实运行 Rokot 与 LEGATO。
- [x] 验证 ONNX CPU correctness/determinism/runtime/license/distribution；没有添加产品依赖。
- [x] 将结论提升到 proposal、evaluation doc 和 reproducible reports；删除临时 task bundle。
- [x] 将本轮 11 个提交 squash 为 `68d78cac`，文件树与 squash 前一致。

## Files Modified

| Area                                   | Changes                                                            | Rationale                                  |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Dataset scripts/tests/reports          | 增加 pre-render staff cap、leakage checks、deterministic manifests | 缩小训练规模并遵守 <=3 staff 边界          |
| Training/evaluation scripts            | 增加 compact CNN、line metrics、reconstruction 与 ONNX export      | 用最小模型验证 learned staff-line evidence |
| `learned-layout-detector.ts` and tests | 接受并校验最多 3 staff                                             | 为 vocal + piano topology 保留真实边界     |
| `shared-layout-detector.ts` and tests  | 单次 crop PDF 编码、hash 校验、ordered inputs                      | 隔离 detector 与 engine 差异               |
| Rokot corpus/adapter/normalizer tests  | 保留第三谱表并报告 unsupported topology                            | 不复制第二谱表或伪造内容                   |
| Evaluation/spec/reports                | 记录精确数字、失败簇、runtime gate 和 STOP 决策                    | 为下一轮提供可审计基线                     |

## Decisions Made

| Decision                                        | Options Considered                                    | Rationale                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 训练和 detector evaluation 排除 >3-staff scores | 处理全部 topology；只处理 <=3 staff                   | 用户要求缩小数据集；当前产品目标无需更大 topology                                              |
| 使用 compact staff-line segmentation            | direct system boxes；Ultralytics/OLA；staff-line mask | 只学习噪声下缺失的 line evidence，保留确定性 grouping/boundary；避免 AGPL 路径                 |
| Rokot 固定 `L/M/K`                              | L/M-only、first-key、key-consensus                    | DCML/K331 结果不一致，替代策略不能稳定复现收益                                                 |
| Recognition 优先 LEGATO                         | 优化 Rokot；优化 LEGATO                               | LEGATO Joint F1 较高且能表达 3-staff，但 topology/timing/tie 仍差；Rokot 有结构性 3-staff 缺口 |
| 产品 runtime 保持 STOP                          | 立即加入 `onnxruntime-node`；research-only            | exact-page 31.0%、E2E 最高 1/36，且 native package 增量未接受                                  |

## Pending Work

## Immediate Next Steps

1. 读取 `tools/pdf-omr-cli/reports/development/olimpic-learned-layout-v1/materialization.json`，逐页可视化并把
   20 个 non-exact pages 分类为
   missing-line、connector under-grouping、connector over-grouping；注意 2 个 zero-system pages 是 12 个
   system-count mismatch 的子集。
2. 只从这 20 个真实扫描失败页派生一个小型 hard-case development slice，设计最小 targeted augmentation 或
   reconstruction change；不要扩大普通 synthetic dataset，不要读取 holdout，也不要加入 >3-staff scores。
3. 一次只训练一个新 candidate，双跑全部 29 development pages。除保持 determinism 外，建议下个投资 checkpoint
   设为至少 `20/29 exact pages`；这是建议值，不是当前正式 release threshold。
4. 在现有 admitted pages 上补 system-level MusicXML truth mapping，使同 crop 的 Pitch/Onset/Duration/Joint F1 可计算；
   不要为了这一步新增大量 scores。
5. Recognition 侧优先做 LEGATO output-topology、time-signature/measure-duration、`UNRESOLVED_TIE` 实验；继续拆开
   process success、normalization diagnostics、symbolic F1 和 export readiness。

### Blockers/Open Questions

- [ ] Detector release threshold 尚未正式确定。当前 proposal 的“至少覆盖 2 works”只是继续投资下限，不是发布线。
- [ ] 36 个 shared detector crops 没有逐-system 对齐 MusicXML truth，当前不能计算新的 symbolic F1。
- [ ] `onnxruntime-node@1.29.0` target-native 增量约 macOS arm64 88 MB / Windows x64 66 MB，需产品接受或找到更小的
      runtime 后才能集成。
- [ ] Rokot 是否未来扩展 3-staff/mixed topology 是产品方向决策；在明确决策前不要偷偷丢弃第三谱表。

### Deferred Items

- Rokot header-context experiments：用户已明确固定 L/M/K；除非有新的跨 work 证据，不再开启 ablation。
- DCML 作为 detector dataset：现有 DCML 更适合 recognition/header evaluation，且渲染可能包含 harmony labels 或
  审校标记，不应直接作为普通 clean detector truth。
- Product ONNX integration：准确率和 package-size gate 均未达到，当前 dependency manifests 中没有
  `onnxruntime-node`。
- Frozen holdout：保持未读，直到正式 protocol 明确允许使用。

## Context for Resuming Agent

## Important Context

当前主要短板数字如下：

- Detector exact admission：`9/29 pages = 31.0%`，覆盖 `4/6 works`；classic baseline 为 `0/29`。
- 合法 learned output：`27/29`；这不等于 exact。20 个失败页中 12 个 system count mismatch，另 8 个 count 相同但
  ordered centers 错误；2 个 zero-system pages 包含在前 12 个内。
- Shared inputs：9 admitted pages -> 36 systems，其中 1 个 2-staff、35 个 3-staff；两个 engine 的 ordered input
  projection SHA 都是 `0d2d975042503d2c2ca0f0e84bbb8bfda5b8da999e3287bde48ce9c570cb10fc`。
- Rokot：`33/36` recognized+normalized，3 failures（2 `unknown-rokot-voice`、1 `abc-conversion-failed`）；33 个
  normalized outputs 全有 blocking diagnostics，最终 `0/36` ready。默认 context 固定
  `previous-prediction-headers-v1`，即安全的 `L/M/K`。
- LEGATO：`35/36` recognized+normalized，1 `empty-page-part`；32 个直接有 blocking diagnostics，剩余 3 个中
  2 个被 `UNRESOLVED_TIE` 阻塞，最终只有 `1/36` ready-with-warnings。
- 既有独立 46-system GT：LEGATO Joint F1 `0.2690` > Rokot `0.2285`；但 process success 是 LEGATO `26/46` <
  Rokot `45/46`。这说明 LEGATO 质量上限更高、结构稳定性更差。
- ONNX model 只有 9,355 bytes；CPU 约 `39.7–40.7 ms/page`，RSS 约 `242–250 MB`。真正的 distribution blocker 是
  Node runtime native bytes，不是模型大小。

结论：下一轮优化顺序应是 shared detector 的 20 个真实失败页，然后是 LEGATO topology/timing/tie。Rokot L/M/K
保持不动。不要把 `27/29 valid output`、`35/36 normalize success` 或 synthetic validation F1 当作可发布结论。

## Assumptions Made

- 目标仍是支持真实扫描、每个 system 最多 3 staff 的 shared detector，而不是扩展到 orchestral scores。
- 后续工作继续使用 OLiMPiC development 做迭代，frozen holdout 保持未读。
- 产品不会在未接受 66–88 MB native 增量前引入 `onnxruntime-node`。
- 只有 exact topology/crop admission 页面才进入 cross-engine recognition comparison。

## Potential Gotchas

- OLiMPiC shared crop 集高度偏向 3-staff（35/36），不能外推为一般单谱表或纯钢琴总体表现。
- 当前 36 crops 没有 system-aligned GT；不能用 readiness 或 process success 冒充 Joint F1。
- Rokot 的 3-staff unsupported diagnostic 是预期的诚实失败，不要通过复制第二谱表、删除第三谱表或放宽 validator
  提高表面成功率。
- LEGATO 既有 46-item audit 中，15 个 part-count mismatch 多为 contentful extra parts，不能按 ground truth、part
  order 或 pitch range 无损删除。
- Cross-engine run 跨暂停/恢复，报告中的 wall time 包含非推理等待，不能作为 latency evidence；使用独立 runtime gate。
- Research model/checkpoints 与大体积 crop artifacts 位于外部 cache，可能不持久；仓库报告中的 SHA 和 reproduce argv
  才是可审计入口。
- 原 `tasks/pdf-omr-shared-detector/` 已按生命周期删除；开始新一轮实现时应创建新的 task bundle。
- 所有 shell 命令遵循项目规则，以 `rtk` 为前缀；编辑文件使用 `apply_patch`。

## Environment State

### Tools/Services Used

- MuseScore `4.7.4` build `7688c00`：deterministic SVG/PDF render truth。
- PyTorch/MPS：research training；model `compact-dilated-staff-line-cnn-v2`，1,841 parameters。
- `onnxruntime-python 1.25.1` CPU：correctness/runtime probe。
- Rokot model revision `7add305aade6fb3a64ad4dde77d410fa68381089`。
- LEGATO model revision `8c1de27e414f487fe59086547aaae23b868ed6ca`。

### Active Processes

- No project dev server or evaluation job is intentionally left running by this task.
- Before reusing `/tmp` artifacts, inspect their existence and hashes; do not assume they survived the session.

### Environment Variables

- `PDF_OMR_ROKOT_ABC2XML_PYTHON`
- Rokot/LEGATO executable and model path variables used by the existing CLI environment discovery; inspect adapter code and
  local environment rather than recording secret or machine-specific values here.

## Verification State

- `rtk pnpm exec vitest run --root . tools/pdf-omr-cli/src --reporter=dot`: 76 files / 427 tests passed.
- `rtk pnpm verify:fast`: context, architecture, design, docs, i18n, format, lint, typecheck passed; 279 files / 1,357 tests passed.
- `rtk pnpm check:docs`: passed after task bundle deletion.
- `rtk pnpm format:check`: passed on 1,076 files after final deletion.
- `rtk git diff --check`: passed.
- Git worktree was clean before creating this handoff.

## Related Resources

- `tools/pdf-omr-cli/reports/development/olimpic-shared-detector-cross-engine-v1/README.md`
- `tools/pdf-omr-cli/reports/development/olimpic-shared-detector-cross-engine-v1/summary.json`
- `tools/pdf-omr-cli/reports/development/olimpic-learned-layout-v1/README.md`
- `tools/pdf-omr-cli/reports/development/olimpic-learned-layout-v1/materialization.json`
- `tools/pdf-omr-cli/reports/exploratory/staff-line-runtime-gate-v1/README.md`
- `tools/pdf-omr-cli/reports/exploratory/openscore-lieder-staff3-dataset-v1/README.md`
- `docs/evaluation/pdf-omr.md`
- `docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`

---

**Security Reminder**: This handoff contains no credentials or machine-specific secret values. Re-run the validator after any edit.
