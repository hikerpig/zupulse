# Task Bundle: Device Theme 可切换主题落地

Spec: `docs/specs/2026-08-02-device-theme-switching-design.md`
设计契约: `.design_library/tab-viewer-te-braun-theme/`（README + colors_and_type.css + component-semantics.md）
视觉基准: device-light `a-ep133-device-v5.html`，device-dark `a-ep133-device-dark.html`

## 关键事实（拆解时已核实）

- 运行时明暗轴已占用 `data-theme="light|dark"`（`packages/web-viewer/src/app/appStore.tsx`，
  localStorage key `zupulse-theme`）。外壳轴因此使用 `data-shell="classic|device"`，
  Spec 已同步修正。
- 主题持久化走 `appStore.tsx` 的 `storage()` 抽象；shell 沿用同一路径，新增 key `zupulse-shell`。
- 切换入口挂在 `packages/web-viewer/src/app/AppHeader.tsx`（现有明暗切换与 locale 弹出层旁）。
- 文案进 `packages/app-i18n`，语义"外观：经典 / 设备"。

## 任务序列

| #   | 文件                             | 内容                                               | 依赖 |
| --- | -------------------------------- | -------------------------------------------------- | ---- |
| P1  | `p1-shell-switch-infra.md`       | token 消费审计 + `data-shell` 切换 + 持久化 + 入口 | 无   |
| P2  | `p2-viewer-device-skin.md`       | Viewer 换肤（App Shell / Transport / 控制仓）      | P1   |
| P3  | `p3-surfaces-device-material.md` | Library / Studio 控件材质继承                      | P2   |

每个任务完成后：勾选验收项、运行该任务的 Verification、把持久结果回填到契约或
`runtime-token-map.json`（采用后才建立）。全部完成后删除本任务包。
