# Sheet Library Implementation Tasks

## Task 1: 定义 Library 领域契约与 contract harness

**Description:** 在 `web-core` 定义 Library Score、Library Metadata、Practice Summary、导入结果、`SheetLibraryRepository` 和 `ScoreFileGateway` 的类型与 Zod schema，并建立所有 Repository 实现必须通过的共享 contract test harness。

**Acceptance criteria:**

- [ ] Library Score ID、Score Identity、时间戳、文件名和元数据长度都有运行时校验。
- [ ] Repository 只暴露领域操作，不暴露路径、表或通用 get/put。
- [ ] Contract harness 覆盖去重、元数据更新、收藏、读取文件和彻底删除语义。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-core/src/library`
- [ ] Typecheck succeeds: `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `packages/web-core/src/library/types.ts`
- `packages/web-core/src/library/schemas.ts`
- `packages/web-core/src/library/ports.ts`
- `packages/web-core/src/library/repositoryContract.ts`
- `packages/web-core/src/index.ts`

**Estimated scope:** Medium: 5 files

## Task 2: 实现共享 Library Import 用例

**Description:** 提取不创建 Viewer Session 的最小谱面验证与元数据投影，实现单/批量 Library Import，统一处理文件限制、格式、SHA-256、去重、失败分类和部分成功。

**Acceptance criteria:**

- [ ] 成功文件产生已验证 draft，重复内容返回 existing，损坏/不支持文件不调用 Repository `add`。
- [ ] 批量导入按文件返回 created/existing/failed，任意单项失败不中止其他项。
- [ ] 导入验证不创建 alphaTab/audio/Viewer Session，现有 `openScore()` 行为不回归。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-core/src/library/importLibraryScores.test.ts packages/web-core/src/import/openScore.test.ts`
- [ ] Typecheck succeeds: `pnpm typecheck`

**Dependencies:** Task 1

**Files likely touched:**

- `packages/web-core/src/library/importLibraryScores.ts`
- `packages/web-core/src/library/importLibraryScores.test.ts`
- `packages/web-core/src/import/openScore.ts`
- `packages/web-core/src/import/types.ts`
- `packages/web-core/src/index.ts`

**Estimated scope:** Medium: 5 files

## Task 3: 实现 Browser IndexedDB Repository 与 File Gateway

**Description:** 用原生 IndexedDB 实现 Browser Repository，在单个 transaction 中保存/删除馆藏、谱文件字节和练习数据；扩展现有 browser host 实现多选文件与导出。

**Acceptance criteria:**

- [ ] IndexedDB schema 以 Score Identity 唯一索引防止并发重复导入。
- [ ] Repository 通过 Task 1 共享 contract harness，且删除不留文件或练习孤儿记录。
- [ ] Browser Gateway 支持单选/多选、取消与原始文件名导出。

**Verification:**

- [ ] Tests pass: `pnpm vitest run apps/web-demo/src/library`
- [ ] Build succeeds: `pnpm demo:build`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/web-demo/src/library/BrowserSheetLibraryRepository.ts`
- `apps/web-demo/src/library/BrowserSheetLibraryRepository.test.ts`
- `apps/web-demo/src/library/BrowserScoreFileGateway.ts`
- `apps/web-demo/src/browserHost.ts`
- `apps/web-demo/src/main.ts`

**Estimated scope:** Medium: 5 files

## Task 4: 交付 Browser Library 首页与单/批量导入

**Description:** 把 `/` 替换为 Sheet Library 空状态和基础列表，注入 Repository/Gateway，打通 Browser 单文件导入直达 Studio 与批量导入留在 Library 的首个 UI 竖切。

**Acceptance criteria:**

- [ ] 冷启动显示可访问的 Library 空状态/列表，不再显示空闲 Studio。
- [ ] 单导入成功或命中重复时导航 Studio；批量导入留在 Library 并汇总成功/重复/失败。
- [ ] Loading、取消、空库、无结果和 Repository 错误不产生空白页。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-viewer/src/app/App.test.tsx`
- [ ] Build succeeds: `pnpm demo:build`
- [ ] Manual check: Browser 单导入与批量汇总流程

**Dependencies:** Tasks 2, 3

**Files likely touched:**

- `packages/web-viewer/src/app/App.tsx`
- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/app/App.test.tsx`
- `packages/web-viewer/src/styles.css`

**Estimated scope:** Medium: 5 files

## Task 5: 以 Library Score 重建 Viewer 路由

**Description:** 保留 `/viewer/` 路由前缀，将 `/viewer/:sessionId` 的参数语义迁移为 `/viewer/:libraryScoreId`，从 Repository 读取 Managed Score Copy 创建 Viewer Session，并为刷新、缺失馆藏和损坏文件提供可恢复状态。

**Acceptance criteria:**

- [ ] 直接打开/刷新 `/viewer/:libraryScoreId` 可从持久馆藏重建新 Viewer Session。
- [ ] 不存在 ID 显示返回 Library 的缺失状态，托管文件损坏不静默删除馆藏。
- [ ] 旧 `/viewer/:sessionId` 状态所有者和自动导航逻辑被删除，Studio 提供返回 Library。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-viewer/src/app/ViewerApplication.test.ts packages/web-viewer/src/app/App.test.tsx`
- [ ] Build succeeds: `pnpm demo:build`
- [ ] Manual check: Studio URL 刷新后谱面恢复

**Dependencies:** Task 4

**Files likely touched:**

- `packages/web-viewer/src/app/App.tsx`
- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/ViewerApplication.test.ts`
- `packages/web-viewer/src/app/App.test.tsx`
- `packages/web-viewer/src/features/PlaybackWorkspace.tsx`

**Estimated scope:** Medium: 5 files

## Task 6: 交付 Library 搜索、筛选与排序

**Description:** 在共享 UI 对 Repository 返回的轻量摘要执行标题/艺术家搜索、全部/收藏筛选和四种排序，不向 Repository 下推 query。

**Acceptance criteria:**

- [ ] 默认最近活动使用 `max(importedAt,lastOpenedAt)`，编辑和收藏不改变顺序。
- [ ] 搜索覆盖显示标题与艺术家，无结果状态可一次清除条件。
- [ ] 筛选/排序键盘可操作，选择只在当前设备记忆且不进入 Repository。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-viewer/src/features/SheetLibrary.test.tsx`
- [ ] Manual check: 中英文标题搜索与所有排序选项

**Dependencies:** Task 4

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.test.tsx`
- `packages/web-viewer/src/app/appStore.tsx`
- `packages/web-viewer/src/styles.css`

**Estimated scope:** Medium: 4 files

## Task 7: 交付收藏与 Library Metadata 编辑

**Description:** 增加行收藏操作和可访问的馆藏信息编辑对话框，并以用户覆盖值 > 谱内值 > 文件名的优先级渲染列表。

**Acceptance criteria:**

- [ ] 收藏更新立即反映于“收藏”筛选，失败时回滚 UI 并报错。
- [ ] 编辑标题/艺术家不修改托管字节、Score Identity 或 activityAt。
- [ ] 对话框的标签、初始焦点、Tab 圈定和关闭后焦点恢复可验证。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-viewer/src/features/SheetLibrary.test.tsx`
- [ ] Manual check: 仅键盘完成收藏和编辑

**Dependencies:** Tasks 4, 6

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/EditLibraryMetadataDialog.tsx`
- `packages/web-viewer/src/features/SheetLibrary.test.tsx`
- `packages/web-viewer/src/styles.css`

**Estimated scope:** Medium: 4 files

## Task 8: 交付原始文件导出与彻底删除

**Description:** 从 Library 行菜单提供导出和删除，Studio 只提供导出；删除确认明确包含练习数据并经 Repository 执行原子彻底删除。

**Acceptance criteria:**

- [ ] 导出保留原始文件名和原始字节，不嵌入 Library Metadata/练习数据，取消无副作用。
- [ ] 删除确认显示曲名与不可恢复文案，删除成功后列表更新，Studio 无删除入口。
- [ ] 删除后重新导入相同字节产生新 Library Score ID 且无旧练习数据。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-viewer/src/features/SheetLibrary.test.tsx apps/web-demo/src/library`
- [ ] Manual check: Browser 导出字节与导入 fixture 一致

**Dependencies:** Tasks 5, 7

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/DeleteLibraryScoreDialog.tsx`
- `packages/web-viewer/src/features/SheetLibrary.test.tsx`
- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/styles.css`

**Estimated scope:** Medium: 5 files

## Task 9: 把练习数据归属和摘要接入 Library Score

**Description:** 让 Studio 的 Practice Sidecar、Local Playback Resume 和 Library Practice Summary 都受 Library Score 生命周期约束，保持 Score Identity 作内容身份但防止删除后旧 Session 重建孤儿数据。

**Acceptance criteria:**

- [ ] Studio 打开和持久化练习状态时同时具有 Library Score ID 与 Score Identity。
- [ ] 已删除 Library Score 的旧 Session 后续写入失败且不重建 sidecar/resume。
- [ ] Library Practice Summary 展示上次练习时间、上次位置和 Loop 存在性，不创建进度百分比。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-core/src/playback packages/web-core/src/library packages/web-viewer/src/features/SheetLibrary.test.tsx`
- [ ] Manual check: 练习后返回 Library 能看到客观摘要

**Dependencies:** Tasks 1, 5, 8

**Files likely touched:**

- `packages/web-core/src/library/ports.ts`
- `packages/web-core/src/playback/playbackPersistence.ts`
- `packages/web-core/src/playback/playbackSidecar.ts`
- `packages/web-viewer/src/playbackPresenter.ts`
- `packages/web-viewer/src/features/SheetLibrary.tsx`

**Estimated scope:** Medium: 5 files

## Task 10: 验证 Electron SQLite 并建立版本化 schema

**Description:** 在 Electron 43 主进程和打包产物中 fail-fast 验证 `node:sqlite`，然后在不清空旧数据的前提下建立版本表、Library 表、唯一索引和顺序迁移。

**Acceptance criteria:**

- [ ] 开发和 packaged Electron 都有可运行 SQLite smoke test；若 `node:sqlite` 不可用，任务停在依赖选型决策而不继续实现。
- [ ] schema 包含 Library Score ID 主键、Score Identity 唯一索引、storage state 和 schema version。
- [ ] 迁移失败保留原数据并使 Repository 不可写，不删除/重建数据库。

**Verification:**

- [ ] Tests pass: `pnpm vitest run apps/desktop-shell/src/main/library`
- [ ] Build succeeds: `pnpm desktop:build`
- [ ] Package smoke succeeds: `pnpm desktop:package`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/desktop-shell/src/main/library/sqlite.ts`
- `apps/desktop-shell/src/main/library/migrations.ts`
- `apps/desktop-shell/src/main/library/sqlite.test.ts`
- `apps/desktop-shell/scripts/verify-package.mjs`
- `packages/web-core/src/storage/sqliteSchema.ts`

**Estimated scope:** Medium: 5 files

## Task 11: 实现 Desktop Managed Score Copy 与崩溃恢复

**Description:** 实现 Desktop Repository 的文件管理、pending/ready/deleting 状态、staging rename 和 initialize reconciliation，并通过共享 contract harness。

**Acceptance criteria:**

- [ ] add/read/delete 只使用 Library Score ID 相对路径，不信任用户文件名生成路径。
- [ ] initialize 可完成/回滚 pending、继续 deleting、清理无主 staging；ready + missing file 保留记录并报错。
- [ ] Desktop Repository 通过与 Browser 相同的 contract harness。

**Verification:**

- [ ] Tests pass: `pnpm vitest run apps/desktop-shell/src/main/library`
- [ ] Typecheck succeeds: `pnpm typecheck`

**Dependencies:** Task 10

**Files likely touched:**

- `apps/desktop-shell/src/main/library/DesktopLibraryStore.ts`
- `apps/desktop-shell/src/main/library/files.ts`
- `apps/desktop-shell/src/main/library/reconcile.ts`
- `apps/desktop-shell/src/main/library/DesktopLibraryStore.test.ts`
- `apps/desktop-shell/src/main/library/reconcile.test.ts`

**Estimated scope:** Medium: 5 files

## Task 12: 扩展 Library Bridge 并实现 Desktop adapters

**Description:** 扩展共享 Bridge schema/response/capabilities，在 Main Process 注册 Library/File handlers，并在 Renderer 提供完成 `SheetLibraryRepository` 和 `ScoreFileGateway` 的窄 adapter。

**Acceptance criteria:**

- [ ] 所有 Library/File 请求与响应从 Zod schema 派生类型，Bridge version 升级且 capability 如实开启。
- [ ] Renderer 不获得绝对路径，外部文件仍通过一次性 token 受限读取。
- [ ] Main Process 重新验证 ID、哈希、字节大小和元数据，且 sender origin 保护不回归。

**Verification:**

- [ ] Tests pass: `pnpm vitest run packages/web-core/src/bridge apps/desktop-shell/src/main/bridge.test.ts apps/desktop-shell/src/main/library`
- [ ] Build succeeds: `pnpm desktop:build`

**Dependencies:** Tasks 1, 2, 11

**Files likely touched:**

- `packages/web-core/src/bridge/schemas.ts`
- `packages/web-core/src/bridge/types.ts`
- `apps/desktop-shell/src/main/bridge.ts`
- `apps/desktop-shell/src/main/main.ts`
- `apps/desktop-shell/src/renderer.ts`

**Estimated scope:** Medium: 5 files

## Task 13: 交付 Desktop Library Import 到 Studio 竖切

**Description:** 把 Desktop 启动与菜单接入共享 Library UI，使 `CmdOrCtrl+O`、菜单和页面按钮都触发 Library Import，并在导入后从托管副本进入 Studio。

**Acceptance criteria:**

- [ ] Desktop 冷启动进入 Library，菜单文案为“导入曲谱…”并走同一导入用例。
- [ ] 单导入直达 Studio，批量导入留在 Library，重复导入打开已有馆藏。
- [ ] 导入后移动/删除外部原文件，Desktop 重启后仍可从 Library 离线打开。

**Verification:**

- [ ] Tests pass: `pnpm vitest run apps/desktop-shell/src/main packages/web-viewer/src/app`
- [ ] Build succeeds: `pnpm desktop:build`
- [ ] Manual check: 外部原文件删除后重启续练

**Dependencies:** Tasks 5, 9, 12

**Files likely touched:**

- `apps/desktop-shell/src/main/main.ts`
- `apps/desktop-shell/src/renderer.ts`
- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/App.tsx`
- `apps/desktop-shell/e2e/desktop.spec.ts`

**Estimated scope:** Medium: 5 files

## Task 14: 完成 Browser quota、迁移与多标签页韧性

**Description:** 为 Browser Repository 增加 schema migration failure 保护、persistent storage 请求、quota 错误分类和页面 focus 刷新，并验证多标签页删除后旧 Studio 不能重建练习数据。

**Acceptance criteria:**

- [ ] 启动尝试 `navigator.storage.persist()`，失败不阻塞使用，UI 明示 Browser 数据可能被清理。
- [ ] quota 不足只使当前导入失败，已有 Library 不被驱逐；schema 迁移失败不清库且阻止写入。
- [ ] 页面恢复 focus 后刷新 Library，不引入 BroadcastChannel；删除后旧 Session 写入被拒绝。

**Verification:**

- [ ] Tests pass: `pnpm vitest run apps/web-demo/src/library packages/web-viewer/src/features/SheetLibrary.test.tsx`
- [ ] Build succeeds: `pnpm demo:build`
- [ ] Manual check: 两标签页 focus 刷新和删除冲突

**Dependencies:** Tasks 3, 4, 8, 9

**Files likely touched:**

- `apps/web-demo/src/library/BrowserSheetLibraryRepository.ts`
- `apps/web-demo/src/library/BrowserSheetLibraryRepository.test.ts`
- `apps/web-demo/src/main.ts`
- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.test.tsx`

**Estimated scope:** Medium: 5 files

## Task 15: 完成 Desktop 故障注入与双端 E2E 验收

**Description:** 在 Desktop 导入/删除每个持久化边界注入故障并验证下次 initialize 收敛，扩展 Browser/Desktop E2E 覆盖规格的核心用户流和可访问性。

**Acceptance criteria:**

- [ ] pending/deleting 每个崩溃点重启后收敛，无重复馆藏、无不可清理 staging，ready + missing file 保留记录报错。
- [ ] Browser/Desktop E2E 覆盖空库、单/批量导入、Studio 恢复、编辑、收藏、导出、删除和冷启动。
- [ ] 主流程仅用键盘可完成，320/768/1024/1440 px 无遮挡或不可达操作。

**Verification:**

- [ ] Full checks pass: `pnpm check && pnpm demo:build && pnpm desktop:build`
- [ ] Desktop E2E passes: `pnpm desktop:test:e2e`
- [ ] Format passes: `pnpm format:check`
- [ ] Manual check: 规格 12 条验收标准逐项留证

**Dependencies:** Tasks 10, 11, 12, 13, 14

**Files likely touched:**

- `apps/desktop-shell/src/main/library/reconcile.test.ts`
- `apps/desktop-shell/e2e/desktop.spec.ts`
- `apps/web-demo/src/main.test.ts`
- `packages/web-viewer/src/app/App.test.tsx`
- `docs/superpowers/specs/2026-07-12-sheet-library-design.md`

**Estimated scope:** Medium: 5 files
