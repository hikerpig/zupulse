# Shared detector execution checklist

## Checkpoint 0 — scope lock

- [ ] 记录 Rokot runtime policy 为 `previous-prediction-headers-v1`，添加/确认 non-regression assertion。
- [ ] 固定 OLiMPiC 6 works / 29 pages / 121 systems development protocol；确认 holdout 未读。
- [ ] 冻结 detector、recognition、end-to-end 三层报告字段。

## Checkpoint 1 — truth probe

- [x] 选取 15 个 OpenScore Lieder works，覆盖实际出现的 2/3/4-staff topology。
- [x] 固定 MuseScore 4.7.4 build 7688c00、bundled fonts 与导出设置，生成 SVG + width-1400 raster。
- [x] 实现最小 SVG `StaffLines` truth extraction，并校验 bounds/order/topology。
- [x] 人工审计每类至少 3 页。
- [x] 两次导出的 raster 与 canonical geometry hashes 一致；raw SVG 差异另行记录。
- [x] Go/no-go：truth 正确且确定性通过。

## Checkpoint 2 — dataset

- [ ] 构建 1,144 train / 133 validation canonical manifest。
- [ ] fail closed 排除 missing source 与 75 个 evaluation IDs。
- [ ] 仅对 train 添加 seeded scan-like augmentations，并同步变换 truth。
- [ ] 两次 build hashes 一致；抽样渲染与 annotations 通过人工复核。
- [ ] Go/no-go：dataset 可复现且无 leakage。

## Checkpoint 3 — minimal candidate

- [ ] 训练一个 compact staff-line segmentation candidate，不做 architecture sweep。
- [ ] 固定 environment、seed、config、checkpoint 与 artifact hashes。
- [ ] 实现 mask -> polylines -> staffs -> systems 的确定性后处理。
- [ ] 复用 `materializeLearnedLayoutPage`，为 malformed/ambiguous outputs 添加 fail-closed tests。
- [ ] 在 OLiMPiC 29 页上运行两遍并生成逐页 evidence。
- [ ] Go/no-go：至少 2 works 有完全匹配页，且输出确定。

## Checkpoint 4 — runtime gate

- [ ] 只对通过准入的模型比较最小 CPU runtime 方案。
- [ ] 核查 license、macOS/Windows distribution、model size、latency、RSS 与 determinism。
- [ ] Go/no-go：全部产品约束通过；否则保持 research-only。

## Checkpoint 5 — shared integration

- [ ] 接入一个 shared detector entry point，不改 Rokot/LEGATO recognition logic。
- [ ] 证明两个 engine adapter 收到相同 crop hashes。
- [ ] Rokot `L/M/K` regression 通过。
- [ ] 分别报告 detector、recognition、end-to-end 结果。
- [ ] 运行 CLI tests、typecheck、`pnpm verify:fast`、`pnpm format:check`、`git diff --check`。

## Checkpoint 6 — closeout

- [ ] 更新对应 Current Feature Contract/spec 与 reproducible development report。
- [ ] 记录未解决失败簇与发布阈值结论。
- [ ] 删除完成后的 `tasks/pdf-omr-shared-detector/` bundle。
