# Implementation Plan: Sheet Library 离线曲谱库

## Overview

把当前以临时 Viewer 为首页的应用演进为 `Sheet Library → Studio` 产品结构。Browser 和 Desktop 共享 `web-core` 领域契约、导入用例与 `web-viewer` React UI，分别使用 IndexedDB 和 SQLite + Managed Score Copy 持久化独立曲谱库。实施以 Browser 首个端到端竖切验证契约，再接入 Desktop Bridge 与崩溃恢复。

设计来源：[`docs/superpowers/specs/2026-07-12-sheet-library-design.md`](../docs/superpowers/specs/2026-07-12-sheet-library-design.md)。

## Architecture Decisions

- `SheetLibraryRepository` 只暴露馆藏领域操作，`ScoreFileGateway` 单独负责文件选择与保存对话框。
- 领域类型、Zod schema、导入验证与用例位于 `packages/web-core`；React 路由与 UI 位于 `packages/web-viewer`；适配器位于各 App。
- Library Score ID 使用 UUID，Score Identity 使用 SHA-256；Repository 以 Score Identity 唯一约束原子去重。
- Browser 使用 IndexedDB transaction；Desktop 使用 SQLite 状态 + staging/rename/reconciliation 协调文件系统。
- `/` 是 Library，`/viewer/:libraryScoreId` 指向持久馆藏并在需要时重建临时 Viewer Session。
- 删除 Library Score 必须同时删除托管字节、馆藏元数据、Practice Sidecar 和 Local Playback Resume。
- Browser/Desktop 曲谱库互相独立，本轮不引入同步、OPFS、分页或额外状态库。

## Dependency Graph

```text
T1 领域契约
 ├─ T2 共享导入用例
 ├─ T3 Browser IndexedDB Repository/Gateway
 │    └─ T4 Browser Library 首个竖切
 │         ├─ T5 稳定 Viewer 路由
 │         ├─ T6 列表搜索/筛选/排序
 │         ├─ T7 馆藏元数据/收藏
 │         └─ T8 导出/彻底删除
 └─ T9 练习持久化归属 Library Score

T1 ─ T10 Desktop SQLite 可用性与 schema
T10 ─ T11 Desktop 托管文件与 reconciliation
T1,T2,T11 ─ T12 Desktop Bridge 与 adapter
T5,T9,T12 ─ T13 Desktop 导入/Studio 竖切

T3,T4,T8,T9 ─ T14 Browser 韧性
T10,T11,T12,T13 ─ T15 Desktop 韧性与最终验收
```

## Task List

### Phase 1: Shared foundation

- [x] Task 1: 定义 Library 领域契约与 Repository contract harness
- [x] Task 2: 实现共享 Library Import 用例
- [x] Task 3: 实现 Browser IndexedDB Repository 与 File Gateway

### Checkpoint A: Shared foundation

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] Browser Repository 通过共享 contract suite
- [ ] 导入用例覆盖成功、重复、损坏和批量部分成功

### Phase 2: Browser user slices

- [x] Task 4: 交付 Browser Library 首页与单/批量导入
- [x] Task 5: 以 Library Score 重建 Studio 路由
- [x] Task 6: 交付 Library 搜索、筛选与排序
- [x] Task 7: 交付收藏与 Library Metadata 编辑
- [x] Task 8: 交付原始文件导出与彻底删除
- [x] Task 9: 把练习数据归属和摘要接入 Library Score

### Checkpoint B: Browser complete

- [ ] `pnpm check` 和 `pnpm demo:build` 通过
- [ ] Browser 离线导入、重启恢复、Studio 刷新、导出和删除完整可用
- [ ] 320 / 768 / 1024 / 1440 px 视觉与键盘验收通过
- [ ] 人工复核 Browser 竖切后再接 Desktop

### Phase 3: Desktop persistence and bridge

- [x] Task 10: 验证 Electron SQLite 并建立版本化 schema
- [x] Task 11: 实现 Desktop Managed Score Copy 与崩溃恢复
- [x] Task 12: 扩展 Library Bridge 并实现 Desktop adapters
- [x] Task 13: 交付 Desktop Library Import 到 Studio 竖切

### Checkpoint C: Desktop vertical slice

- [ ] `pnpm check` 和 `pnpm desktop:build` 通过
- [ ] Desktop Repository 通过与 Browser 相同的 contract suite
- [ ] 导入后删除外部原文件，馆藏仍可离线打开
- [ ] 菜单 `CmdOrCtrl+O` 统一触发 Library Import

### Phase 4: Resilience and release acceptance

- [x] Task 14: 完成 Browser quota、迁移与多标签页韧性
- [x] Task 15: 完成 Desktop 故障注入与双端 E2E 验收

### Checkpoint D: Complete

- [ ] `pnpm check`、`pnpm demo:build`、`pnpm desktop:build` 通过
- [ ] `pnpm desktop:test:e2e` 通过
- [ ] 设计规格 12 条验收标准全部有自动化或明确人工证据
- [ ] 无自动重建曲谱库、无孤儿练习数据、无 Renderer 绝对路径泄漏
- [ ] 人工复核后可进入发布候选

## Parallelization Opportunities

- T1 完成后，T2 与 T3 可并行，但不得各自改动端口而不同步 contract tests。
- T4 完成后，T6 与 T7 可并行；T8 建议等 T7 稳定行菜单/对话框模式后进行。
- T10/T11 的 Desktop Main Process 工作可与 T5–T9 Browser/UI 工作并行，前提是 T1 契约已冻结。
- T14 与 T15 可并行，因为分别位于 Browser 与 Desktop 适配器。

## Risks and Mitigations

| Risk                                                                                   | Impact | Mitigation                                                                                |
| -------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Electron 43 打包运行时的 `node:sqlite` 能力或 ASAR 行为不符预期                        | High   | T10 先做运行时和打包 smoke test；失败时再决定是否引入 SQLite 依赖，不在后续任务中暗自换库 |
| 现有 `openScore()` 同时执行解析与创建 Session，直接复用会在导入阶段创建音频/渲染运行时 | High   | T2 提取无 UI 副作用的最小验证/元数据投影，保持 Viewer Session 只在 Studio 创建            |
| Practice Sidecar 当前按 Score Identity 存储，彻底删除和 Browser 多标签页可产生孤儿数据 | High   | T9 建立 Library Score 存在性约束和删除联动 contract tests，先解决归属再做韧性             |
| Desktop SQLite 与文件系统无法共享事务                                                  | High   | T11 使用 pending/ready/deleting + staging rename，T15 在每个持久化边界注入失败            |
| IndexedDB quota 和用户清理站点数据破坏“持久”预期                                       | Medium | T14 请求 persistent storage、分类 quota 错误并显示诚实文案；保留单份导出                  |
| Library 和 Studio 同时重构导致旧 `/viewer/:sessionId` 与新路由双重状态                 | Medium | T5 一次性切换路由所有者并删除旧 session URL 导航，不长期兼容两套路由                      |

## Open Questions

- Electron 43 主进程与打包产物是否可直接使用 `node:sqlite`，由 T10 用可运行 smoke test 回答。
- 现有开发/验收数据中是否存在需要迁移的旧 `scores` / `score_index` 记录，T10 实施前必须检查；不得假设可清空。

## Definition of Done

每个任务必须同时满足：

- 验收标准有自动化或明确人工验证证据。
- 相关最小测试、包级 typecheck/build 通过。
- 新增 Bridge/持久化输入有 Zod 边界校验和结构化错误。
- 不留旧实现的双重状态所有者、死代码或无实际消费者的抽象。
- 经过 Prettier 检查，可访问性与错误/空状态不回退。

> `planning-and-task-breakdown` 技能引用的 `references/definition-of-done.md` 在当前安装中缺失；上述 Definition of Done 依据技能正文和项目现有检查命令制定。
