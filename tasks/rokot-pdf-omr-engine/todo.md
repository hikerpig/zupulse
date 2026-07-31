# Rokot PDF OMR Engine Tasks

Canonical plan: `tasks/rokot-pdf-omr-engine/plan.md`

## Phase 0: High-risk boundaries

- [x] T01 锁定 runtime environment 与 streaming provenance（`2b2c62d`）
- [x] T02 固定 `abc-xml-converter==1.0.1` external-process contract（`2b2c62d`）
- [x] T03 抽取 deterministic PDF rasterizer（`0317d3c`）
- [x] T04 实现 deterministic piano grand-staff segmentation（`0317d3c`）

### Checkpoint A

- [x] 所有 runtime mismatch 在 render/inference 前失败
- [x] converter failure/cancel 有 fake-process coverage
- [x] render、crop 与 segmentation hashes 可重复
- [x] 未新增 native dependency、Draft schema 或 error code

## Phase 1: Engine core

- [x] T05 定义 `RokotSystemBundle` 与严格 ABC envelope validation（`77a1382`）
- [x] T06 实现逐 system Rokot inference adapter（`57bf5b5`）
- [x] T07 实现 MusicXML normalization 与跨 system Draft joining（`015d42c`）

### Checkpoint B

- [x] synthetic two-system PDF 完成 fake end-to-end recognition
- [x] 完整 native artifacts 与 source anchors 可追溯
- [x] validator 正确区分 ready 与 blocking output
- [x] identical input 的非时间戳 artifact hashes 相同

## Phase 2: CLI integration and regression

- [x] T08 注册 `rokot` engine 并更新 CLI/README（`7934523`、`45dc5f3`）
- [x] T09 固定 recognize determinism、failure 与 cancellation transaction（`8d0c68b`）

### Checkpoint C

- [x] `pnpm --filter @zupulse/pdf-omr-cli test`（204 passed）
- [x] `pnpm --filter @zupulse/pdf-omr-cli typecheck`
- [x] `pnpm --filter @zupulse/harmony-cli test`（60 passed）
- [x] Audiveris、Transcoda 与 LEGATO behavior 无回退

## Phase 3: K331 development verification

- [x] T10 在 K331 fixture 同目录建立 development-only manifest（`d935159`）
- [x] T11 用保留的 Q8_0 模型运行真实 K331 benchmark 并记录结果（`23dee16`）
- [x] T12 更新 durable docs、完成回归并按 lifecycle closeout

### Final gate

- [x] K331 始终标记为 `derived-controlled`，不进入 holdout
- [x] `recognize -> validate -> analyze -> export-musicxml` 对 ready output 可运行
- [ ] `pnpm verify:fast`（context/arch/design/docs/i18n 通过；被两份既有 `tmp/` JSON 格式基线阻断）
- [x] changed-file Prettier check
- [ ] `pnpm format:check`（仅两份无关 `tmp/` JSON 基线问题，按任务范围未改写）
- [x] `git diff --check`
- [x] `git status --short` 已确认范围
- [x] durable outcomes 已写入 current docs；下一 commit 删除本 task bundle

## Execution discipline

- [x] 每项先写失败测试，再做最小实现
- [x] 每项最多触及 5 个目标文件；超出时先拆任务
- [x] 每项结束后重跑覆盖最终 diff 的最小测试
- [x] 不提交模型、cache、Python environment 或完整 run directory
- [x] 不修改 App、Bridge、Library、Draft schema、error codes 或 frozen holdout
