# Viewer 基础练习能力任务

## Feasibility

- [ ] Task 1: 验证 alphaTab Count-in 生命周期与 staff-audio 能力
- [ ] Gate: 解决 Spec Open Questions 1–3

## Rhythm Practice

- [ ] Task 2: 新增领域设置、Zod schema 与 Sidecar migration
- [ ] Task 3: 接通 Metronome / Count-in Engine 与 Controller
- [ ] Task 4: 交付“节拍与预备拍”任务 UI

### Checkpoint A

- [ ] Metronome 与 Count-in 验收通过
- [ ] Browser / Desktop 可以读取迁移后的 Sidecar
- [ ] Loop、tempo、Track Mixer 与 navigation 无回归
- [ ] 人工批准继续 Piano Hand Practice

## Piano Hand Practice

- [ ] Task 5: 建立显式 `PianoHandMapping` eligibility
- [ ] Task 6: 实现经批准的 staff-audio runtime
- [ ] Task 7: 接通 hand mode Controller 与持久化
- [ ] Task 8: 交付“练习手”任务 UI

### Checkpoint B

- [ ] eligible / ambiguous / unsupported 状态符合 Spec
- [ ] Track Mixer facts 在 hand mode 与 preview 前后保持不变
- [ ] Loop + tempo + Count-in + hand mode 组合通过
- [ ] 人工批准任务语言与谱面强调

## Integration and Documentation

- [ ] Task 9: 补充 Browser E2E 与 Desktop/shared 验证
- [ ] 更新 Current Feature Contract 和相关 architecture docs
- [ ] `pnpm check:i18n`
- [ ] `pnpm check:docs`
- [ ] `pnpm verify:fast`
- [ ] `pnpm verify`
- [ ] `pnpm verify:e2e`
- [ ] `pnpm format:check`
- [ ] `git diff --check`

## Completion

- [ ] 所有 Spec acceptance criteria 有可重复证据
- [ ] 把长期约束移入 Current docs
- [ ] 删除本目录中的一次性 plan / todo
