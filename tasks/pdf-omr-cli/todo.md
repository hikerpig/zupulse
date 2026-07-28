# PDF OMR CLI 与 Benchmark Tasks

Canonical plan: `tasks/pdf-omr-cli/plan.md`

## Phase 0：CLI foundation

- [x] T01 建立 `@zupulse/pdf-omr-cli` workspace package
- [x] T02 冻结 CLI result、error 与 artifact schemas
- [x] T03 实现 canonical artifact writer

### Checkpoint A

- [x] CLI help、typecheck、tests 通过
- [x] canonical hashes 稳定
- [x] 人工批准进入 PDF/engine spike

## Phase 1：PDF inspect 与 Audiveris

- [x] T04 选择 PDF inspect/render backend
- [x] T05 实现 cancellable external process runner
- [x] T06 交付 `inspect` vertical slice
- [x] T07 实现 Audiveris process adapter
- [ ] T08 实现 Audiveris MusicXML normalizer
- [ ] T09 交付 `recognize --engine audiveris`

### Checkpoint B

- [ ] PDF → Draft 单命令可运行
- [ ] cancel/crash/invalid output tests 通过
- [ ] 三份 smoke Draft 完成人工抽查

## Phase 2：Validation、Harmony 与 MusicXML

- [ ] T10 实现 exact rational time 与 Draft validator
- [ ] T11 实现 Draft → `HarmonyAnalysisInput`
- [ ] T12 交付 `analyze` command
- [ ] T13 实现首轮 MusicXML generator
- [ ] T14 实现 Draft/MusicXML structural comparator
- [ ] T15 交付 `validate` 与 `export-musicxml`

### Checkpoint C

- [ ] PDF → Draft → Harmony 可运行
- [ ] Draft → MXL → current adapter round-trip 可运行
- [ ] `pnpm verify:fast` 通过
- [ ] 人工批准进入 benchmark 建设

## Phase 3：Corpus 与 metrics

- [ ] T16 定义 corpus protocol 与 manifest verifier
- [ ] T17 实现 symbolic alignment 与 metrics
- [ ] T18 实现 Harmony impact metrics
- [ ] T19 实现 MusicXML、runtime 与 reproducibility metrics
- [ ] T20 交付 benchmark orchestrator 与 report

### Checkpoint D

- [ ] smoke benchmark 产生 item/category/overall metrics
- [ ] aggregates 可从 artifacts 重算
- [ ] development/holdout policy 自动执行

## Phase 4：第二引擎与冻结评测

- [ ] T21 选择 neural engine 和锁定环境
- [ ] T22a 实现 neural process adapter
- [ ] T22b 实现 neural output normalizer
- [ ] T23 运行 development benchmark
- [ ] T24 冻结 holdout protocol
- [ ] T25 运行 holdout 并形成唯一决策

### Checkpoint E

- [ ] 两个 engine 完成冻结 holdout
- [ ] 结果可复现并可追溯
- [ ] 结论为 `CONTINUE_TO_APP_DISCOVERY`、`INVESTIGATE` 或 `STOP`
- [ ] 没有修改 `apps/*`

## 每个任务的完成门槛

- [ ] 最小相关测试通过
- [ ] 目标 package typecheck 通过
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `git status --short` 已确认任务范围
- [ ] checkpoint 或计划记录已更新
