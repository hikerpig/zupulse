# Task: Library / Studio device 控件材质继承

## Goal

device 外壳下，Library 与 Studio 的按钮、滑杆、读数类控件继承 device 材质
（键程按键、薄推子、读数窗），不引入 LCD 显示条等设备隐喻；密度与布局不变。

## Non-goals

- 不为 Library / Studio 发明设备装饰（磁带仓、格栅、额外显示面板）。
- 不重排两个表面的信息架构；Home 表面不在本轮范围。
- 不改变 classic 主题表现。

## Canonical context

- 契约推广边界: `.design_library/tab-viewer-te-braun-theme/README.md` 决定 8、
  `specs/component-semantics.md`（Key / Fader / Readout 语义）
- Library 表面契约: `DESIGN.md` Library 节；Studio 表面契约: `DESIGN.md` Studio 节
- P2 已落地的 `[data-shell="device"]` 结构覆写（按钮/滑杆基元）应尽量直接复用。

## Scope

- Library：筛选行控件（搜索框、收藏、排序 select，40px 高度档）、导入主操作键
  （orange）、批量导入次级键（light/dark）、行操作图标按钮。
- Studio：命令栏图标按钮、主操作文字按钮（保存 / 重新分析=orange）、
  片段列表控件、和弦编辑入口；进度统计等读数用读数窗风格（mono + 琥珀仅在
  确属"设备读数"语义的数值上，否则保持普通前景）。
- 原则上只消费 P2 的基元覆写；确需新结构样式的，回到契约补齐语义后再加。
- P1 审计清单中这两个表面的硬编码色值顺手 token 化。

## Acceptance criteria

- [ ] 两个表面在 device 外壳下控件材质一致，无 LCD、格栅等设备隐喻出现。
- [ ] 布局与密度不变（40px 筛选行、36px 工具控件高度档保持）。
- [ ] 状态完整：rest / hover / active / focus / disabled / selected / error。
- [ ] classic 回归零变化；`runtime-token-map.json` 更新且无漂移。

## Verification

- 最小测试：Library / Studio 相关组件测试
- 门禁：`pnpm verify:fast`；导入与 Studio 分析 journey 走 `pnpm verify:e2e`
- 人工证据：device-light/dark 下 Library 与 Studio 截图，附在本文件。

## Open decisions

- Studio 片段列表的来源色条 / 置信度圆点在 device 材质下是否保留现有彩色编码？
  默认：保留（语义色职责不变），仅容器材质换肤；若观感冲突再回契约评审。
