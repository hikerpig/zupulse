# Task: 验证可泛化的 PDF OMR layout topology candidate

## Goal

训练并评测一个 research-only layout candidate，直接预测 `system center` 与 `staff center/count`，在不读取
frozen holdout、不按页面路由的前提下超过当前 22/29 real-scanned topology-exact baseline，并移除固定
`staffCount=3`。

## Non-goals

- 不修改 App、Bridge、Desktop runtime 或 detector default。
- 不新增 `onnxruntime-node` 或其他产品 dependency。
- 不优化 Rokot / LEGATO recognition、joining 或 header context。
- 不继续搜索 Gaussian sigma、NMS distance、valley ratio 等 page-specific 后处理组合。
- 不用 OLiMPiC development annotation 训练模型，也不读取 frozen holdout。

## Canonical context

- `docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`
- `tools/pdf-omr-cli/scripts/train_layout_segmenter.py`
- `tools/pdf-omr-cli/scripts/evaluate_layout_segmenter.py`
- `tools/pdf-omr-cli/reports/development/olimpic-layout-multihead-v1/`
- `tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/diagnostic-topology.json`

## Research basis

本计划不是复刻单一论文，而是把公开研究中的三类结论映射到当前失败证据。论文能直接支持的部分与本项目仍需验证的
假设必须分开：

| Source                                                                                                                                                     | Direct evidence used here                                                                                                                                                | Project adaptation                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Region-based Layout Analysis of Music Score Images](https://arxiv.org/abs/2201.04214)                                                                     | Layout model 的跨 domain 泛化及其对下游 transcription 的影响必须单独评测；普通 layout metrics 不一定与最终 OMR 表现一致；有限标注下可使用 semi-synthetic data generation | synthetic 只做训练与分类 gate；real-scanned OLiMPiC 继续用 topology exact、materialization 和 downstream crop evidence 验收；split 必须按 work/composer 隔离                            |
| [Staff Layout Analysis Using the YOLO Platform](https://arxiv.org/abs/2411.15741) 与 [OLA implementation](https://github.com/v-dvorak/omr-layout-analysis) | 把 `staff`、`system`、`grand staff`、`measure` 建模为独立 layout objects，而不是只依赖 staff-line/connector 后处理                                                       | 保留 system 与 staff 分层预测和确定性 topology assembly；不直接采用 OLA weights/Ultralytics runtime，因为本项目 probe 已证明 target-domain accuracy 和 distribution license 均未过 gate |
| [Deep Watershed Detector for Music Object Recognition](https://arxiv.org/abs/1805.10548)                                                                   | 对密集、易粘连对象学习 synthetic energy map，再以确定性实例分离代替单一 filled-mask connected components                                                                 | 将 center/energy target 作为解决 system-band saturation 的候选表示；DWD 原任务是 music symbols，因此迁移到 system/staff 仍是待证伪假设                                                  |
| [Staff-line detection and removal using a convolutional neural network](https://doi.org/10.1007/s00138-017-0844-4)                                         | staff-line pixel classification 是成立的 OMR 子任务                                                                                                                      | 只解释上一候选为何尝试 staff-line head；当前 oracle-band 计数证据已表明该 head 不能直接承担本项目 topology contract，因此不继续调其 threshold                                           |

`system center + staff center/count` 是上述研究与本项目水平版式约束的最小组合，并非已有论文直接证明的最终结构。
尤其是把二维 layout 压缩为一维 row centers、增加 staff-count head，必须先通过 target-level prototype 与 balanced
validation，不能以论文引用代替实证。

## Current checkpoint

- [x] 冻结 6 works / 29 pages / 121 systems 的 topology truth；全部真实页 system 均为 3-staff。
- [x] 单一 `compact-layout-unet-v1` candidate 达到 22/29 topology-exact pages、6/6 works covered、
      29/29 boundary materialization。
- [x] 复核 7 个失败页：4 页 system count 过多，3 页 count 相同但 ordered center 越出 truth band。
- [x] 否定单一 coarse smoothing：不同 work 需要互相冲突的 sigma，truth-aware routing 才能修完 7 页。
- [x] 否定 valley / connected-component merge：真实相邻 systems 与同 system 双峰的特征分布重叠；任一全局
      threshold 都会回归已通过页面。
- [x] 确认 real-domain system mask saturation：多个真实页面在相邻 system 之间仍保持高概率和二维连通，当前
      filled-band supervision 没有学到可靠分界。
- [x] 否定复用现有 staff head 计数：在 128-page synthetic validation 的 oracle system bands 内，最佳仅
      49/439 systems exact、1/128 pages exact；2-staff 为 8/52，3-staff 为 40/386。
- [x] 否定直接用原图长水平投影计数：同一 oracle-band protocol 最佳仅 73/439 systems exact、6/128 pages exact。
- [x] 审计既有 validation pool：528 eligible pages 的 visible staff systems 为 `1:1 / 2:52 / 3:1772`，
      131 个 validation works 全部 declared 3-staff，无法仅靠抽样构造 balanced slice。既有 train pool 为
      `1:127 / 2:816 / 3:17067`，下一步必须在 eligible source 层重新分组，而不能把训练页直接当 validation。

## Execution plan

1. [x] 从既有 OpenScore Lieder eligible source pool 生成 topology 专用、按 work/composer 隔离的 train/validation
       split。优先把包含 1/2-staff systems 的完整 source groups 留给 validation，再对 3-staff 下采样；禁止纳入已登记
       evaluation score IDs，并记录每类 system/page 数量、group overlap check 与 selection hash。
2. [x] 在不训练模型的 target-level prototype 中比较两个表示：贴近 OLA 的 `system/staff box objects`，以及贴近 DWD
       的 `system/staff center energy maps`。检查相邻真实 instances 是否保持可分、增强后顺序/bounds 是否合法、target
       是否 byte-identical；只保留更直接满足当前 row-center/count contract 的一种。
3. [ ] 只训练一个 compact multi-head candidate。训练目标直接对应选定的 instance representation 与 per-system staff
       count，不再以 filled system rectangle Dice 作为主要优化目标。
4. [ ] 先在 balanced synthetic validation 报告 system-center exact、staff-count macro exact 和 topology-exact；若
       1/2/3 任一类别明显失效，停止，不运行 OLiMPiC 调参。
5. [ ] 使用一套冻结的全局后处理重跑全部 29 个 OLiMPiC development pages；不允许 per-work/per-page 参数或人工修正。
6. [ ] 若通过 investment gate，再验证 PyTorch/ONNX canonical output、overlay、materialization 与 ordered crop hashes
       的重复运行一致性；产品 runtime 仍保持 `STOP`。

## Acceptance criteria

- [ ] Balanced synthetic validation 覆盖 1/2/3-staff，staff-count macro exact >= 0.90，且每类 exact >= 0.85。
- [ ] OLiMPiC topology-exact pages > 22/29，仍覆盖 6/6 works；每个 work 的 admitted page count 不低于当前 baseline。
- [ ] `staffCount` 来自 candidate evidence，不包含固定常量或 corpus truth lookup。
- [ ] 所有发布到 materializer 的 systems 都有合法 ordered bbox、staff count 和五线 topology；非法输出 fail closed。
- [ ] 同一 model identity 与固定参数双跑 raw output、report、overlay 和 crop hashes 完全一致。
- [ ] 未读取 frozen holdout，未修改产品 dependency、runtime default 或 App surface。

## Verification

- 最小测试：相关 Python `unittest` 与 `tools/pdf-omr-cli/src` Vitest。
- Candidate gate：balanced synthetic validation + 全部 29-page OLiMPiC development 双跑。
- 完成门禁：`pnpm verify:fast`、`pnpm format:check`、`git diff --check`。

当前 split checkpoint：

- planner：`tools/pdf-omr-cli/scripts/plan_layout_topology_training_slice.py`
- slice SHA-256：`452d828843d6b432cca80732bb5f668c2b3624b0677c987ccd193072d7bbc774`
- train：512 pages；visible systems `1:88 / 2:799 / 3:1211`
- validation：128 pages；visible systems `1:40 / 2:69 / 3:373`
- additional validation composers：Duchambge、Farrenc、Puget、Thys
- composer overlap：0；protected evaluation work overlap：0；双跑 byte-identical

当前 target checkpoint：

- selected representation：`row-center-energy-v1`
- raw canonical audit SHA-256：`db65c7a5426e8812cb2854cb4ed81426a875ddf6ad29c3aad5c69cd51c9c4dae`
- validation：128/128 center-compatible，system/staff components 均为 128/128 exact
- train：510/512 center-compatible；2 个并排或非严格 row-order pages 明确排除，不删除 source artifacts
- active system target rows：train `188066 -> 31155`；validation `45771 -> 7230`
- durable evidence：`tools/pdf-omr-cli/reports/exploratory/layout-topology-target-v2/`

## Open decisions

- `staff center` 是否需要独立 spacing head，还是只在 materialization 前从局部图像估计五线 spacing；先由 balanced
  validation 的最小 prototype 决定，不提前扩展模型。
- 超过 22/29 只表示继续投资；正式 release threshold、native runtime package budget 与 Desktop integration 仍需
  单独审批。
