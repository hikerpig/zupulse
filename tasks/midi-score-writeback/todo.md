# MIDI Fusion 人工审核回写 Tasks

Canonical plan: `tasks/midi-score-writeback/plan.md`

## Phase 1: Provenance and proposal contracts

- [ ] T01 建立 source note index
- [ ] T02 生成 writeback-ready proposal v2

### Checkpoint A

- [ ] locator 与 proposal contracts 验证通过
- [ ] report-only fusion 无回归
- [ ] 人工批准窄 `web-core` root-entry rewrite API

## Phase 2: Byte-preserving mutation

- [ ] T03 提取 MusicXML root-entry rewrite primitive
- [ ] T04 应用 reviewed pitch patch

### Checkpoint B

- [ ] plain XML/MXL 只修改批准 pitch
- [ ] hash/precondition/conflict 全部 fail closed

## Phase 3: Validation and CLI

- [ ] T05 建立 writeback no-regression validator
- [ ] T06 交付 `apply-fusion` vertical slice

### Checkpoint C

- [ ] synthetic fuse → apply → re-fuse 通过
- [ ] package tests/typecheck/format 通过

## Phase 4: Corpus and docs

- [ ] T07 验证 K331 与 Flower Day 并更新 evaluation

### Checkpoint D

- [ ] spec acceptance criteria 全部验证
- [ ] `pnpm verify:fast` 与 `pnpm format:check` 通过
- [ ] durable outcomes 已提升，task bundle 已删除

## 每个任务的完成门槛

- [ ] 先写或调整失败测试，再实现行为
- [ ] 最小相关测试通过
- [ ] 目标 package typecheck 通过
- [ ] 最终相关验证在最后一次修改后重跑
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `git status --short` 已确认只包含当前任务范围
