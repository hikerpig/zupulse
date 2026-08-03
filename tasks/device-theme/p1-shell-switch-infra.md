# Task: `data-shell` 主题切换基础设施（token 审计 + 切换 + 持久化 + 入口）

## Goal

用户可以在 AppHeader 一键切换 classic / device 外壳，切换即时生效、跨会话保持，
四种外壳×明暗组合都能渲染；classic 视觉零变化。

## Non-goals

- 不做任何 device 视觉换肤（那是 P2/P3）；本任务只保证切换机制和 token 结构就位。
- 不改 `data-theme` 明暗轴的现有行为与存储 key。
- 不建立 `runtime-token-map.json`（P2 采用 token 后再建）。

## Canonical context

- Spec: `docs/specs/2026-08-02-device-theme-switching-design.md`（技术方案、验收标准）
- 契约 token: `.design_library/tab-viewer-te-braun-theme/colors_and_type.css`
- 运行时 token: `packages/web-viewer/src/styles/tokens.css`
  （`:root[data-theme="light"]` / `:root[data-theme="dark"]` 现有结构）
- 主题状态与持久化: `packages/web-viewer/src/app/appStore.tsx`（`dataset.theme`、`storage()`）
- 切换入口位置: `packages/web-viewer/src/app/AppHeader.tsx`
- 测试样板: `packages/web-viewer/src/app/__tests__/App.test.tsx`、
  `packages/web-viewer/src/__tests__/viewerApp.test.ts`

## Scope

- `packages/web-viewer/src/styles/tokens.css`：新增 `[data-shell="device"]` 语义 token
  覆写段（含 `[data-shell="device"][data-theme="dark"]` 的 dark 差值），值取自契约
  `colors_and_type.css`；本阶段只投表面/前景/边框/accent 类色值 token。
- `packages/web-viewer/src/app/appStore.tsx`：新增 shell 状态（`classic | device`）、
  `dataset.shell` 写入、`zupulse-shell` 持久化与启动读取；缺省 classic。
- `packages/web-viewer/src/app/AppHeader.tsx`：外壳切换入口（与明暗切换并列的独立维度）。
- `packages/app-i18n`：切换文案（经典 / 设备）。
- token 消费审计：grep 组件中的硬编码色值（hex、`rgba()` 字面量），产出清单，
  判断哪些会在 device 换肤时漏色；审计结果写入本文件"审计结果"一节，决定 P2/P3 改动面。
- 测试：参照 `App.test.tsx` 的 theme 断言模式补 shell 断言。

## Acceptance criteria

- [ ] 切换外壳无需刷新，`document.documentElement.dataset.shell` 与存储值一致。
- [ ] 重启（或重新加载）后 shell 选择保持；Browser 与 Desktop 行为一致。
- [ ] `data-shell` 缺省 classic；现有用户无感知，classic 下视觉回归零变化。
- [ ] 四种组合（classic/device × light/dark）token 解析正确。
- [ ] token 消费审计清单完成，硬编码色值按"会漏色 / 不影响"分类。
- [ ] `pnpm check:i18n` 通过；切换文案无英文装饰标题。

## Verification

- 最小测试：`pnpm --filter @zupulse/web-viewer test -- app`（shell 相关断言）
- 门禁：`pnpm verify:fast`、`pnpm check:i18n`、`pnpm check:design`
- 人工证据：Browser 与 Desktop 各切一次四种组合，截图附在本文件。

## Open decisions

- 审计若发现大面积硬编码色值：是先做 token 化清理再进 P2，还是 P2 顺手改？
  默认策略：只清理 P2/P3 涉及的组件，不做全库样式迁移（遵 DESIGN.md 维护边界）。
