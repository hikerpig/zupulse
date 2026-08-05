---
status: accepted
---

# Require a host Sheet Library and remove the no-library openScore seam

Browser、Desktop 与 iPad 三宿主都配置了 `library`（Repository + Gateway + adapters）。
`ViewerApplication.openScore()` 在有 `library` 时无条件走 `library.gateway.selectForImport`；
`ViewerHost.openScore()` 只在无 `library` 的 `openOnce` 分支被调用，而该分支在生产不可达，仅由 jsdom
测试覆盖。ADR 0047 已把外部打开一律路由到 Library Import，无 library 的「直接打开不进库」模式与当前
Library 事实源不一致。

## 决策

- 从 `ViewerHost` 移除 `openScore`；`subscribe` 是宿主契约上唯一的命令/生命周期入口。
- `mountViewerApp` 的 `library` 变为必选依赖，三宿主同步删除各自 `openScore` 实现与 no-library UI 分支。
- 应用命令 `ViewerAppHandle.openScore()` 保留，语义为「导入并打开」（经 Library Import）。
- 删除 `ViewerApplication` 中只为 no-library 直开存在的 `openOnce` / `scheduleOpen` / `enqueueOpen` 路径。

## 后果

- 未来新增宿主必须提供 Sheet Library；「打开任意文件不进库」不再作为受支持模式。
- Desktop bridge 的 `file.open` / `file.readBytes` 只被删除的 seam 方法触达，可在后续随
  ADR 0022 / 0030 一并清理（另见 `tasks/architecture-refactor-plans.md` 计划 C2）。
- 扩展 ADR 0047：外部打开不再有绕过 Library Import 的旁路。
