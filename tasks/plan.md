# Implementation Plan: 应用级 i18n

## Overview

为 Browser Demo、Desktop Renderer 与 Electron Main 建立共享、离线、类型安全的 `zh-CN` / `en-US`
国际化能力。实现以 `@zupulse/app-i18n` 为唯一 catalog 与 locale resolution 来源；`web-core` 只暴露
结构化领域事实，两个宿主分别拥有 locale 偏好持久化。

## Architecture Decisions

- 以 Current ADR `0054`–`0057` 和
  `docs/superpowers/specs/2026-07-24-application-i18n-design.md` 为实现事实源。
- Catalog 全量随 bundle 发布；不使用 HTTP backend、动态 locale chunk 或 module singleton。
- Locale 切换先由宿主持久化，再更新 i18next、document metadata、Renderer 与 Main 菜单；写入失败保持旧状态。
- UI 文案按 Library、Viewer、Studio 的垂直切片迁移；领域层不产生翻译句子。

## Dependency Graph

```text
1 shared package ──┬─ 2 Browser locale host ─ 3 viewer i18n mount ─ 4 header
                   ├─ 5 import diagnostics ─┬─ 8 Library
                   ├─ 6 Loop persistence ───┼─ 9 Viewer/Playback
                   └─ 7 ApplicationIssue ───┴─ 10–11 Studio

1 + 3 ─ 12 Bridge contract ─ 13 preference store ─ 14 Main/Renderer/menu/dialog
3 ─ 15 Browser metadata
8–15 ─ 16 hardcode gate ─ 17 E2E/docs/final verification
```

## Task List

### Phase 1: Shared foundation

#### Task 1: 创建 `@zupulse/app-i18n` workspace package

**Description:** 建立 package manifest、TypeScript project references、精确依赖和公开入口；不迁移 UI。

**Acceptance criteria:**

- [ ] 根 TypeScript project 可引用新 package，`web-viewer` 可声明 React adapter 依赖。
- [ ] `i18next` 与 `react-i18next` 使用 lockfile 固定的精确版本。
- [ ] 无 React、DOM、Electron 或宿主存储依赖进入共享包。

**Verification:** `pnpm typecheck`。

**Dependencies:** None. **Scope:** S. **Files:** root `package.json` / `tsconfig.json` / lockfile、`packages/app-i18n/*`、`packages/web-viewer/package.json`。

#### Task 2: 实现 locale resolver、catalog contract 与 instance factory

**Description:** 用失败测试建立 `SupportedLocale`、`LocalePreference`、system resolution、同步 instance、资源同构、插值与 plural 检查。

**Acceptance criteria:**

- [ ] `zh-*` 解析为 `zh-CN`，所有无匹配的系统语言解析为 `en-US`，显式偏好优先。
- [ ] 两 locale 的 namespace/key、叶子、placeholder 和 `_one` / `_other` plural contract 一致。
- [ ] 生产 fallback 是 `en-US`；开发/测试 missing key 抛出可诊断错误；每个 factory 调用隔离实例。

**Verification:** `pnpm exec vitest run packages/app-i18n/src && pnpm typecheck`。

**Dependencies:** 1. **Scope:** M. **Files:** `packages/app-i18n/src/{catalog,index}.ts`、`locales/*`、`__tests__/*`。

#### Task 3: 建立 Browser locale host 与 document controller

**Description:** 通过 `LocaleHost` 端口把 Browser preference 限定在 `apps/web-demo`，并实现 html lang/dir 与 metadata 的可测试更新控制器。

**Acceptance criteria:**

- [ ] 缺失/非法 storage 回退 `system`；非法值 best-effort 清理，storage 故障不阻断启动。
- [ ] 只有保存成功才发布新 `LocaleState`；失败不改变当前 locale。
- [ ] controller 在 locale 切换后更新 `lang`、`dir` 和受管 metadata。

**Verification:** `pnpm exec vitest run apps/web-demo/src packages/web-viewer/src/i18n`。

**Dependencies:** 2. **Scope:** M. **Files:** `apps/web-demo/src/browserHost.ts`、其测试、`packages/web-viewer/src/i18n/*`、`host.ts`。

#### Task 4: 注入 per-app i18n 与 AppHeader 语言入口

**Description:** 让 mount、store 与 AppHeader 接收实例级 locale state，使用现有 `ContextPopup` 提供三项 radio 选择。

**Acceptance criteria:**

- [ ] 两个并存 app 实例可使用不同语言，且切换不销毁 ViewerApplication/Session。
- [ ] 保存期间禁用选择；拒绝后保持旧语言并在 popup 显示本地化 `role=alert`。
- [ ] Header、导航、ARIA 与 document 语言属性同步切换。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/i18n packages/web-viewer/src/app && pnpm typecheck`。

**Dependencies:** 2, 3. **Scope:** M. **Files:** `mountViewerApp.tsx`、`appStore.tsx`、`App.tsx`、`AppHeader.*`、相关测试。

### Checkpoint A: 可切换基础

- [ ] Tasks 1–4 tests 与 `pnpm typecheck` 通过。
- [ ] Browser host 可持久化偏好；切换不会重建当前 Session。
- [ ] Commit: `feat(i18n): add shared catalog and locale switching`。

### Phase 2: Locale-neutral domain boundary

#### Task 5: 导入诊断改为 code/context

**Description:** 删除 `ImportDiagnostic.summary`，让 UI 持有 code 并映射 catalog，未知 code 使用本地化 generic error。

**Acceptance criteria:**

- [ ] `web-core` ImportDiagnostic 只包含 code、severity 与允许的 context。
- [ ] 所有已知 code 在两种 locale 中有穷举映射；未知值不显示裸 code。
- [ ] 导入行为和现有 Bridge/日志结构保持可用。

**Verification:** `pnpm exec vitest run packages/web-core/src/import packages/web-viewer/src/__tests__/importPresenter.test.ts`。

**Dependencies:** 2. **Scope:** M. **Files:** `web-core/src/import/*`、`web-viewer/src/importPresenter.ts` 与测试。

#### Task 6: Loop sidecar 与 Playback state 去本地化

**Description:** generated Loop 不再持久化翻译 label；兼容旧 label 与 0.1.0 tick-only sidecar，并在 timeline 可用时重建 position。

**Acceptance criteria:**

- [ ] 新 generated Loop 无 label，user Loop 必须保留非空 label。
- [ ] 旧 generated 中文 label 可读但不决定展示；rehydration 不导致 sidecar 脏写。
- [ ] UI 可基于结构化范围在当前语言生成名称。

**Verification:** `pnpm exec vitest run packages/web-core/src/playback packages/web-core/src/storage`。

**Dependencies:** 2. **Scope:** M. **Files:** `web-core/src/playback/{schemas,types,loopRegions,playbackController}.ts`、`storage/sidecar.ts` 与相邻测试。

#### Task 7: ViewerApplication 与 presenter 改为 semantic issue/view model

**Description:** 用稳定 issue code 与安全 context 取代任意 `Error.message`、展示文字和状态串拼接。

**Acceptance criteria:**

- [ ] production snapshot/DOM 不包含原始错误、stack、路径、Bridge detail 或通用 detail string。
- [ ] playback/import presenter 返回语义状态和数值，不返回中文/英文 UI 句子。
- [ ] 已知失败有 issue code，未知失败映射 generic error 且原始异常进入宿主诊断。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/app packages/web-viewer/src/__tests__`。

**Dependencies:** 5, 6. **Scope:** M. **Files:** `ViewerApplication.ts`、presenter、相邻测试。

### Checkpoint B: 领域边界

- [ ] Tasks 5–7 tests 和 `pnpm typecheck` 通过。
- [ ] `rg` 审查确认 production `web-core` 不再产出用户可见句子。
- [ ] Commit: `refactor(i18n): expose locale-neutral domain states`。

### Phase 3: Shared UI vertical slices

#### Task 8: 迁移 Sheet Library

**Acceptance criteria:**

- [ ] Library 文案、ARIA、placeholder、Dialog、错误和状态全部来自 catalog。
- [ ] count/relative date/title collation 遵循 Effective Locale；切换保留 query、filter、selection 与 Dialog。
- [ ] 中英文角色查询覆盖导入、搜索、排序、编辑与删除确认。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/features packages/web-viewer/src/app/__tests__/App.test.tsx && pnpm demo:build`。

**Dependencies:** 4, 5, 7. **Scope:** M. **Files:** locales、`SheetLibrary.tsx`、App/E2E tests。

#### Task 9: 迁移 Viewer 与 Playback controls

**Acceptance criteria:**

- [ ] transport、practice、track、Loop、status、error 与动态 ARIA 使用 `viewer`/`errors` catalog。
- [ ] generated Loop 随语言变，user label 不变；切换不 dispatch、不重建 playback session。
- [ ] 中英文覆盖 idle/ready/playing/error 关键旅程。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/components packages/web-viewer/src/features packages/web-viewer/src/app/pages && pnpm demo:build && pnpm desktop:build`。

**Dependencies:** 4, 6, 7. **Scope:** M. **Files:** locales、ViewerPage、ScoreViewer、PlaybackWorkspace 与测试。

#### Task 10: 迁移 Studio 页面与状态文案

**Acceptance criteria:**

- [ ] Studio page、command bar、Dialog、状态和 plural 文案来自 `studio`/`errors` catalog。
- [ ] 切换保留 unsaved correction、selection 和 open popup，不触发 save/reanalysis。
- [ ] English 覆盖 loading/ready/saving/conflict/error/export 状态。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/app/pages packages/web-viewer/src/features/harmony-studio`。

**Dependencies:** 4, 7. **Scope:** M. **Files:** locales、`StudioPage.tsx`、相关测试。

#### Task 11: 迁移 Harmony editor 与 range workspace

**Acceptance criteria:**

- [ ] editor/range 标签、ARIA、filter、candidate 操作和未解决原因来自 catalog。
- [ ] chord symbols、pitch spelling、source IDs 与用户内容保持原样。
- [ ] Light/Dark 和 768/1024/1440 px 下英文不导致命令不可达。

**Verification:** `pnpm exec vitest run packages/web-viewer/src/features/harmony-studio && pnpm demo:build && pnpm desktop:build`。

**Dependencies:** 10. **Scope:** M. **Files:** harmony-studio components/view model/tests、E2E。

### Checkpoint C: Shared UI

- [ ] Tasks 8–11 focused tests 与 Browser/Desktop builds 通过。
- [ ] Commit 1: `feat(i18n): localize sheet library`。
- [ ] Commit 2: `feat(i18n): localize viewer and studio`。

### Phase 4: Desktop and Browser hosts

#### Task 12: 扩展 Bridge locale contract

**Acceptance criteria:**

- [ ] handshake 包含 `LocaleState`，request/response/capability 都有严格 Zod schema 与版本升级。
- [ ] mock、preload、dispatcher 和所有 fixture 同步更新，不弱化 `.strict()`。

**Verification:** `pnpm exec vitest run packages/web-core/src/bridge`。

**Dependencies:** 2. **Scope:** M. **Files:** `web-core/src/bridge/{schemas,types,mockNativeBridge}.ts` 和测试。

#### Task 13: 实现 Desktop preference store

**Acceptance criteria:**

- [ ] Main 在 `${userData}/preferences.json` 用 Zod、`0o600` temp file 与 atomic rename 存取 preference。
- [ ] 缺失/损坏/I-O 读取失败回退 system；损坏文件隔离；写失败不改变内存 state。
- [ ] 不访问或迁移 `library.sqlite`。

**Verification:** `pnpm exec vitest run apps/desktop-shell/src/main/__tests__/locale-preference-store.test.ts`。

**Dependencies:** 2. **Scope:** M. **Files:** new store、Main unit tests。

#### Task 14: 同步 Main、Renderer、菜单和文件 Dialog

**Acceptance criteria:**

- [ ] Main 在创建窗口/菜单前恢复 locale，Renderer 仅从 handshake 初始化。
- [ ] `app.locale.setPreference` 先持久化，再更新 current locale/menu，并只影响后续 Dialog。
- [ ] 菜单与 app-defined dialog labels 来自 `desktop` catalog；原始 startup/Bridge error 不进入 DOM。

**Verification:** `pnpm exec vitest run apps/desktop-shell/src/main packages/web-core/src/bridge && pnpm desktop:build`。

**Dependencies:** 3, 4, 12, 13. **Scope:** L; split implementation/tests by Main vs Renderer if超出一次会话。

#### Task 15: 完成 Browser 静态 fallback 与 runtime metadata

**Acceptance criteria:**

- [ ] `index.html` no-JS fallback 为英文，包含受管 title/description/keywords/OG/Twitter metadata。
- [ ] Browser mount 和切换更新全部受管 metadata，不添加 SSR/双路由/SEO 机制。

**Verification:** `pnpm exec vitest run apps/web-demo/src && pnpm demo:build`。

**Dependencies:** 3, 4. **Scope:** S. **Files:** `apps/web-demo/index.html`、main/controller tests。

### Checkpoint D: Hosts

- [ ] Tasks 12–15 tests 和 Browser/Desktop builds 通过。
- [ ] Desktop E2E 验证重启前后 Renderer/menu/后续 dialog 语言一致。
- [ ] Commit: `feat(i18n): synchronize desktop and browser host surfaces`。

### Phase 5: Enforcement and completion

#### Task 16: 添加 hardcoded UI copy gate

**Acceptance criteria:**

- [ ] AST gate 拒绝 JSX text 与用户可见 static attribute literal。
- [ ] catalog、测试、fixture、用户内容、标准缩写和带理由 `i18n-ignore` 正确排除。
- [ ] gate 输出 file/line/text/remediation，加入 `verify:fast`。

**Verification:** `pnpm exec vitest run scripts/__tests__/check-i18n.test.ts && pnpm check:i18n`。

**Dependencies:** 8–11, 14, 15. **Scope:** M. **Files:** `scripts/check-i18n.mjs`、fixtures/tests、root package manifest。

#### Task 17: 文档、E2E 与最终验收

**Acceptance criteria:**

- [ ] 架构索引链接已实现 i18n 文档；文档说明 locale ownership、catalog、Bridge、测试和新增 locale/key 流程。
- [ ] Browser/Desktop 各有 English persistence 与代表性 Library/Viewer/Studio 流程；system mode 仅重启生效。
- [ ] Light/Dark、768/1024/1440 px、键盘、播放中切换和未保存 Studio 切换完成手工验收。

**Verification:** `pnpm verify:fast && pnpm verify && pnpm verify:e2e && git diff --check`。

**Dependencies:** 16. **Scope:** M. **Files:** architecture docs、E2E、`tasks/todo.md`。

### Checkpoint E: Complete

- [ ] Tasks 16–17 and all command gates pass.
- [ ] Commit: `chore(i18n): enforce catalog coverage`。
- [ ] Final task audit records command outputs and manual acceptance evidence.

## Risks and Mitigations

| Risk                           | Impact | Mitigation                                                                     |
| ------------------------------ | ------ | ------------------------------------------------------------------------------ |
| 全局 UI 迁移造成大量难定位回归 | High   | 每个垂直表面完成即运行 focused tests/build 并提交                              |
| Bridge contract 漏同步         | High   | Task 12 先完成 schema/mock/preload/fixture，再接 Main                          |
| 原始异常泄漏路径               | High   | Task 7 先建立 issue/context 边界与 DOM assertion                               |
| 英文导致高密度布局溢出         | High   | Studio 拆为两个任务，并把三档宽度人工检查作为验收                              |
| catalog 类型性能退化           | Medium | 首批 namespace 小；若 typecheck 退化，评估 selector optimize 而不放弃 key 检查 |
| locale preference 损坏阻断启动 | Medium | 独立 JSON、quarantine 与 system fallback                                       |

## Open Questions

无。实现中若发现运行时代码、Zod schema 或可重复测试与此计划冲突，应按项目事实源顺序先更新计划并记录原因。
