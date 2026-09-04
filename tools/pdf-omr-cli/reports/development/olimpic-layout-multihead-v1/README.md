# OLiMPiC compact multi-head layout candidate v1

本候选是 oracle 判定旧 staff-line mask 不足后的唯一 learned fallback。`compact-layout-unet-v1` 有 30,090
parameters，在同一个模型中输出 `staff_line_logits` 与 `system_band_logits`；训练仍使用既有 OpenScore Lieder
development slice，不读取 frozen holdout。system-band mask 由已有 `normalizedBBox` 生成，并与 staff-line mask
共享同一 annotation 和透视变换。

固定 post-processing 对 system-band row score 使用 `gaussianSigma=6`、`minimumCenterDistance=100`、
`minimumCenterScore=0.5`。因为本 development corpus 的 121 个 systems 经复核全部为 3-staff，研究候选固定
输出 3-staff topology；这不是通用 staff-count detector，禁止据此进入产品 runtime。

结果：

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Topology-exact pages | 0 / 29 | 22 / 29 |
| Works with exact page | 0 / 6 | 6 / 6 |
| Boundary materialization | 29 / 29 | 29 / 29 |

- checkpoint SHA-256: `03fe737f663a3381c4a26e21b083c00176e0b64fb746b3215ab0d905798aac15`
- deterministic ONNX SHA-256: `e3d9ee80beeaf91a5a08a5e8747df888dd88479112b973b24e119656f530b209`
- ONNX candidate report SHA-256: `f63c3eae2bede7c2d6fc5f08534938740553022a06a637ff9a9713e19d51ed35`
- materialization SHA-256: `ef1624021539cc1a06f2d59fdf914f9678b61037347cd09f2c935d2550c257a3`
- repeated runs: byte-identical report, overlay hashes, materialization and ordered crop hashes

Synthetic validation 的 system-band Dice 为 `0.9297`，staff-line Dice 仅 `0.4577`。因此本结果只证明
system-band 定位在这个 development corpus 上跨过 `20/29` investment checkpoint；它没有解决通用
staff-count/line reconstruction，也没有 system-aligned MusicXML quality evidence。产品决策保持 `STOP`，
不新增 `onnxruntime-node`，不修改 App、Bridge 或 detector default。

## 失败页诊断与下一候选边界

22/29 之后的 7 个失败页不是单一 NMS 参数问题：4 页产生额外 system peaks，另 3 页数量正确但 ordered center
落在 truth band 外。增大 Gaussian sigma 能修复部分稀疏 work，却会合并其他 dense work 的真实相邻 systems；使用
peak valley depth 或二维 mask connected component 做全局 merge 也无法分离两类边界，并会回归已通过页面。因此不把
这些 truth-aware ablation 写入 evaluator。

二维概率审计显示，当前 system head 在多个真实页面的相邻 systems 之间仍输出大面积高概率连通区域。filled system
rectangle 在 synthetic validation 上的高 Dice 没有转化为 real-domain system separation。与此同时，现有 staff
head 即使使用 oracle system bands，在原 128-page synthetic validation 上最佳也只有 `49/439` systems、`1/128`
pages 的 staff count 完全正确；直接对原图做长水平线投影的最佳结果也只有 `73/439` systems、`6/128` pages。
两条路径都不足以替换固定 `staffCount=3`。

因此下一候选不再调当前 row-score 后处理，而是先建立覆盖 1/2/3-staff 的 balanced validation slice，再直接监督
互不粘连的 `system center` 与 `staff center/count`。只有 staff-count macro exact 与各类别下限先通过 synthetic
gate，才允许用一套冻结的全局参数重跑 29 个 OLiMPiC development pages。执行状态见
`tasks/pdf-omr-layout-topology-v2/plan.md`。

既有 composer-grouped validation 本身不能承担这个 gate：528 个 eligible pages 只包含 `1:1 / 2:52 / 3:1772`
visible-staff systems，且 131 个 validation works 全部 declared 3-staff。新 candidate 必须从完整 eligible source
pool 重新建立按 work/composer 隔离的 topology split，并优先把稀缺 1/2-staff source groups 留作 validation；不得把
原 training pages 直接抽出后继续复用旧模型结果。
