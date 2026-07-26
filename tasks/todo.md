# HIK-5 P1 Checklist

## Stage 1 — 数据真实性

- [x] P1-01 为 `DesktopLibraryStore` 注入当前 sidecar / resume JsonStore 的只读能力。
- [x] P1-01 汇总 `hasLoop`、`lastPracticedAt`、`lastPosition`，缺失可选字段时省略。
- [x] P1-01 覆盖无数据、sidecar-only、resume-only、完整摘要和读取失败。
- [x] P1-01 确认 Renderer 不获得路径、Bridge schema 不变化。

## Stage 2 — Library 目录

- [x] P1-02 先写目录行语义、继续/打开条件和一基小节号的组件测试。
- [x] P1-02 把卡片网格改成单列紧凑目录，保留 sibling controls。
- [x] P1-02 覆盖无作者、长标题、无摘要、有 Resume、有 Loop、收藏和菜单。
- [ ] P1-02 验证 390 / 620 / 1280 容器布局与键盘顺序。

## Stage 3A — 导入反馈

- [ ] P1-03 先写单文件纯新增与完整汇总分类测试。
- [ ] P1-03 实现 compact success 和 4 秒自动 dismiss / cleanup。
- [ ] P1-03 保证 running、batch、existing、failed、cancelled 不自动消失。
- [ ] P1-03 覆盖 live region、手动关闭与失败详情默认展开。

## Stage 3B — 练习任务

- [ ] P1-04 先写 overview / loop / tracks 导航与焦点测试。
- [ ] P1-04 复用现有命令实现“设置循环区间”“选择主轨道”“调整速度”。
- [ ] P1-04 让 Loop 快捷入口直接进入 loop task。
- [ ] P1-04 统一正常与 disabled/loading 抽屉结构。
- [ ] P1-04 验证返回、Escape、触发器焦点恢复和音频错误重试。
- [ ] P1-04 清理 Library / Practice 目标区域的中文英文装饰标题。

## Stage 4 — 验收与文档

- [ ] P1-05 运行相关组件测试与 `pnpm check:i18n`。
- [ ] P1-05 运行 Browser E2E、Desktop build / E2E。
- [ ] P1-05 人工检查 Light / Dark、390 / 620 / 1280 和键盘。
- [ ] P1-05 完成发布前 VoiceOver / NVDA 门禁或记录明确负责人。
- [ ] P1-05 更新 Sheet Library Feature Contract 的当前行为、平台矩阵、差距和证据地图。
- [ ] P1-05 运行 `pnpm verify:fast`、`pnpm format:check`、`git diff --check`。
