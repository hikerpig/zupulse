# PDF OMR 识别能力优化 Tasks

Canonical plan: `tasks/pdf-omr-recognition-optimization/plan.md`

## Phase 1：可信评测基线

- [ ] T01 定义真实 corpus 与新版 protocol
- [ ] T02a 实现 engine-neutral part identity
- [ ] T02b 校验 ground-truth readiness 与 evaluation limitation
- [ ] T02c 纳入 cancel、RSS/GPU 与逐阶段 wall time

### Checkpoint A

- [ ] 新 development protocol 已冻结
- [ ] 旧 frozen reports bytes/hash 未改变
- [ ] 人工批准进入识别实现优化

## Phase 2：结构与全谱 readiness

- [ ] T03a 修复 system/measure identity
- [ ] T03b 修复跨 system joining
- [ ] T03c 修复 timing readiness，不放宽 validator
- [ ] T04 运行可复现的完整 work development benchmark

### Checkpoint B

- [ ] Joining/timing 不再是主要阻断项，或形成停止证据
- [ ] 人工决定是否进入模型/decoder 优化

## Phase 3：定向实验与新决策

- [ ] T05 按错误类别逐个运行单变量实验
- [ ] T06 冻结并运行新 holdout
- [ ] 输出唯一 `CONTINUE_TO_APP_DISCOVERY`、`INVESTIGATE` 或 `STOP`

## Definition of Done

- [ ] 每个任务有 focused tests、typecheck 和可重算 artifacts
- [ ] `pnpm verify:fast`
- [ ] `pnpm demo:build`
- [ ] `pnpm desktop:build`
- [ ] `git diff --check`
- [ ] `git status --short` 已确认范围
- [ ] durable outcome 已提升到 README/evaluation/architecture，完成后删除本任务目录
