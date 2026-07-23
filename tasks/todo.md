# iPad Practice Player Task List

> Progress: Tasks 1–7 and 9 completed and verified through 2026-07-24. Task 8 was not required
> because the Task 7 custom-scheme gate passed.

## Task 1: 建立 iPad Web workspace

**Status:** Completed (2026-07-22)

**Description:** 新增 `apps/ipad-shell` 的 pnpm workspace 与最小 iPad Web entry，使其能独立复用
`@zupulse/web-viewer`、输出静态 HTML/JS，并保持 Browser/Desktop 入口不变。本任务不创建 Xcode
工程，也不接 Bridge。

**Acceptance criteria:**

- [x] `@zupulse/ipad-shell` 可以构建最小静态入口，且不从 `apps/web-demo/src` 深导入。
- [x] alphaTab 继续作为外部 ESM 资产复制，不被错误打进主 bundle。
- [x] 生成目录被忽略且不提交，开发/生产构建配置可区分。

**Verification:**

- [x] `pnpm --filter @zupulse/ipad-shell web:build`
- [x] `pnpm typecheck`

**Dependencies:** None

**Files likely touched:**

- `apps/ipad-shell/package.json`
- `apps/ipad-shell/tsconfig.json`
- `apps/ipad-shell/rspack.config.mjs`
- `apps/ipad-shell/web/index.html`
- `apps/ipad-shell/web/src/main.ts`

**Estimated scope:** M (5 files)

## Task 2: 生成并验证 iPad Web 资源 manifest

**Status:** Completed (2026-07-22)

**Description:** 为 iPad Web 产物生成 build hash、Bridge version 和静态资源 hash manifest，增加
规格要求的根命令。Xcode 与 CI 后续只能复用这个入口，不能另写复制逻辑。

**Acceptance criteria:**

- [x] `pnpm ipad:web:build` 生成 HTML、JS、alphaTab、Worker、AudioWorklet、字体、SoundFont、许可证
      与 manifest。
- [x] 缺失文件、hash 不一致或 manifest 中 Bridge version 漂移时验证失败。
- [x] 根命令存在且不会修改 Git 跟踪目录。

**Verification:**

- [x] `pnpm vitest run tools/builder/__tests__/rspack.test.ts`
- [x] `pnpm ipad:web:build`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/ipad-shell/scripts/build-web-assets.mjs`
- `apps/ipad-shell/scripts/verify-web-assets.mjs`
- `apps/ipad-shell/scripts/__tests__/verify-web-assets.test.ts`
- `package.json`

**Estimated scope:** M (4 files)

## Task 3: 建立最小 SwiftUI/Xcode App Shell

**Status:** Completed (2026-07-23)

**Description:** 创建 iPadOS 17 App target、Unit Test target 和单个持久 WKWebView 容器。Build Phase
调用 Task 2 的统一脚本；首版只显示 bundle 页面或明确启动错误，不实现业务 UI。

**Acceptance criteria:**

- [x] Generic iOS Simulator 构建成功，App 生命周期只持有一个 WKWebView 实例。
- [x] Build Phase 在 Web 资源缺失时失败，不使用陈旧 dist。
- [x] Bundle ID、deployment target、Release/Debug 配置明确；Release 不含本地 dev-server 开关。
- [x] 根 `ipad:build` 与 `ipad:test` 命令封装确定性的 `xcodebuild` destination 和 DerivedData 位置。

**Verification:**

- [x] `pnpm ipad:build`
- [x] `xcodebuild -project apps/ipad-shell/Zupulse.xcodeproj -scheme Zupulse -showBuildSettings`
- [x] `pnpm ipad:test`（iPad Pro 11-inch (M5), iOS 26.2）

**Dependencies:** Task 2

**Files likely touched:**

- `apps/ipad-shell/Zupulse.xcodeproj/project.pbxproj`
- `apps/ipad-shell/app/ipad-app.swift`
- `apps/ipad-shell/app/app-shell-view.swift`
- `apps/ipad-shell/webview/web-view-container.swift`
- `package.json`

**Estimated scope:** M (5 files)

## Task 4: 从 Zod 生成 transport-neutral Bridge contract

**Status:** Completed (2026-07-23)

**Description:** 将现有 Bridge schema 中 iPad 控制面可传输的 JSON 子集导出为确定性 manifest，并
建立 valid/invalid fixtures。二进制 `Uint8Array` 继续留在宿主内类型，不能出现在 iPad JSON
contract。

**Acceptance criteria:**

- [x] manifest 包含 version、method/event discriminators、严格字段、限制和 capability。
- [x] fixtures 覆盖未知字段/版本/方法、缺失字段、越界字符串与 iPad 支持的 handshake。
- [x] 生成两次字节一致，schema 改动未重生成时测试失败。

**Verification:**

- [x] `pnpm vitest run packages/web-core/src/bridge`
- [x] `pnpm check:arch`

**Dependencies:** Task 1

**Files likely touched:**

- `packages/web-core/src/bridge/schemas.ts`
- `packages/web-core/src/bridge/__tests__/contract-manifest.test.ts`
- `packages/web-core/src/bridge/__tests__/fixtures/ipad-bridge.json`
- `scripts/generate-bridge-contract.mjs`
- `apps/ipad-shell/bridge/bridge-contract.json`

**Estimated scope:** M (5 files)

## Task 5: 建立 Swift 严格 Bridge 解码与双端 fixtures

**Status:** Completed (2026-07-23)

**Description:** 用 Swift 手写 envelope/handshake DTO 与严格字段校验，并让 Swift Test target 消费
Task 4 的同一 fixture 集。此任务只解析和拒绝，不路由真实能力。

**Acceptance criteria:**

- [x] Swift 与 Zod 对 fixtures 的 accept/reject 结果完全一致。
- [x] Swift 拒绝未知 key、未知版本、未知 type、重复/空 correlation ID 和越界 payload。
- [x] 解码错误转换为不含原始 payload 的结构化 Bridge error。

**Verification:**

- [x] `pnpm ipad:test -- --only-testing ZupulseTests/BridgeContractTests`

**Dependencies:** Task 3, Task 4

**Files likely touched:**

- `apps/ipad-shell/bridge/bridge-envelope.swift`
- `apps/ipad-shell/bridge/bridge-contract-validator.swift`
- `apps/ipad-shell/bridge/bridge-error.swift`
- `apps/ipad-shell/tests/bridge-contract-tests.swift`
- `apps/ipad-shell/Zupulse.xcodeproj/project.pbxproj`

**Estimated scope:** M (5 files)

## Task 6: 打通 Web/Swift handshake 与启动错误

**Status:** Completed (2026-07-24)

**Description:** 实现单一 WKWebView RPC transport 的最小请求/响应链，让 Web entry 在挂载 React 前
验证 App version、Web build hash 与 Bridge version；不兼容时显示可测试的启动错误。

**Acceptance criteria:**

- [x] handshake 成功后才挂载应用；unknown/mismatch/timeout 都不进入业务 UI。
- [x] correlation ID 精确配对，迟到响应在 transport 销毁后被忽略。
- [x] transport 只有一个注册 handler，不为 handshake 单独创建全局通道。

**Verification:**

- [x] `pnpm vitest run apps/ipad-shell/web/src/__tests__/ipad-bridge-transport.test.ts`
- [x] `pnpm ipad:test -- --only-testing ZupulseTests/BridgeRouterTests`
- [x] `pnpm ipad:build`

**Dependencies:** Task 5

**Files likely touched:**

- `apps/ipad-shell/web/src/ipad-bridge-transport.ts`
- `apps/ipad-shell/web/src/__tests__/ipad-bridge-transport.test.ts`
- `apps/ipad-shell/web/src/main.ts`
- `apps/ipad-shell/bridge/bridge-router.swift`
- `apps/ipad-shell/tests/bridge-router-tests.swift`

**Estimated scope:** M (5 files)

## Task 7: 探测只读自定义 scheme 资源 origin

**Status:** Completed (2026-07-24)

**Description:** 在 Simulator 建立自定义 scheme 资源加载器和能力探针，验证 Web Crypto、Worker、
AudioWorklet 可发现性、IndexedDB 重启持久性、动态 import、字体、SoundFont 和路径隔离。此任务只
产生候选证据，不提前接受 ADR。

**Acceptance criteria:**

- [x] loader 校验 host、解码、`..`、query/fragment、MIME 和 bundle root，不允许路径逃逸。
- [x] 探针结果结构化记录 success/failure/unsupported，不以空白页面或控制台观察代替。
- [x] IndexedDB 在两次 Simulator 启动间保持同一 origin；Worker/AudioWorklet 加载请求可追踪。

**Verification:**

- [x] `pnpm ipad:test -- --only-testing ZupulseTests/ResourceSchemeTests`
- [x] Manual: 审阅 `docs/validation/ipad-resource-origin.md` 的 Simulator 证据

**Dependencies:** Task 6

**Files likely touched:**

- `apps/ipad-shell/webview/app-resource-scheme-handler.swift`
- `apps/ipad-shell/tests/app-resource-scheme-handler-tests.swift`
- `apps/ipad-shell/web/src/resource-origin-probe.ts`
- `apps/ipad-shell/web/src/__tests__/resource-origin-probe.test.ts`
- `docs/validation/ipad-resource-origin.md`

**Estimated scope:** M (5 files)

## Task 8: 条件探测 loadFileURL 资源 origin

**Status:** Not required (2026-07-24) — Task 7 的所有硬门槛均通过，条件未触发。

**Description:** 仅当 Task 7 任一硬门槛失败时，使用 `loadFileURL` 与最小 bundle 目录读取范围重复同一
能力矩阵。若两种候选都失败，不实现 loopback server，停止并请求架构/依赖选择。

**Acceptance criteria:**

- [ ] 使用 Task 7 的同一探针与结果格式，不降低 Worker/AudioWorklet/Web Crypto/IndexedDB 门槛。
- [ ] 读取权限只覆盖生成资源目录，不授予 App 容器或用户文件目录。
- [ ] 结果文档明确选择 provisional candidate 或明确停止条件。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/FileURLResourceTests`
- [ ] Manual: 使用与 Task 7 相同的 probe 页面完成两次 Simulator 启动

**Dependencies:** Task 7 failed gate only

**Files likely touched:**

- `apps/ipad-shell/webview/file-url-resource-loader.swift`
- `apps/ipad-shell/tests/file-url-resource-loader-tests.swift`
- `apps/ipad-shell/web/src/resource-origin-probe.ts`
- `docs/validation/ipad-resource-origin.md`

**Estimated scope:** M (4 files, conditional)

## Task 9: 提取共享 IndexedDB Library Repository package

**Status:** Completed (2026-07-24)

**Description:** 将 Browser 的 IndexedDB Repository 提取到新的公开 workspace package，使
Browser Demo 与 iPad entry 可以复用而不违反 app 深导入或
`web-viewer` 平台边界。

**Acceptance criteria:**

- [x] 新 package 只依赖 `web-core` 和 Web 平台类型，不依赖 React、Electron 或 app 源码。
- [x] Repository 保留 schema v2、原子去重、Managed Copy、sidecar/resume/harmony 联动删除语义。
- [x] 现有 Repository 测试在新 package 下通过，公共入口只导出宿主需要的 adapter。

**Verification:**

- [x] `pnpm vitest run packages/web-storage`
- [x] `pnpm exec tsc -p packages/web-storage/tsconfig.json --noEmit`

**Dependencies:** Checkpoint A

**Files likely touched:**

- `packages/web-storage/package.json`
- `packages/web-storage/tsconfig.json`
- `packages/web-storage/src/index.ts`
- `packages/web-storage/src/indexed-db-sheet-library-repository.ts`
- `packages/web-storage/src/__tests__/indexed-db-sheet-library-repository.test.ts`

**Estimated scope:** M (5 files)

## Task 10: 让 Browser Demo 消费共享 IndexedDB Repository

**Description:** 将 Browser Demo 切换到 Task 9 的公开 package，并把原 app 内实现改为短期兼容
re-export 或删除；用户行为和 E2E 不变。

**Acceptance criteria:**

- [ ] `apps/web-demo` 不再拥有第二份 Repository 实现。
- [ ] Browser Library 数据库名/version/数据语义不变，现有测试与 E2E 无回归。
- [ ] workspace/tsconfig 只通过 package 公开入口连接。

**Verification:**

- [ ] `pnpm vitest run apps/web-demo`
- [ ] `pnpm demo:build`
- [ ] `pnpm demo:test:e2e`

**Dependencies:** Task 9

**Files likely touched:**

- `apps/web-demo/src/main.ts`
- `apps/web-demo/src/library/BrowserSheetLibraryRepository.ts`
- `apps/web-demo/src/library/BrowserLibraryPlaybackPersistence.ts`
- `apps/web-demo/src/library/__tests__/BrowserSheetLibraryRepository.test.ts`
- `tsconfig.json`

**Estimated scope:** M (5 files)

## Task 11: 实现 Swift 一次性文件 token 与二进制 scheme

**Description:** 实现与 RPC 控制面分离的 token store 和受限数据 handler。token 只映射原生选择的
单个普通文件，成功读取即消费；不把路径写入 Web、URL、日志或错误。

**Acceptance criteria:**

- [ ] 64 MiB 上限、TTL、单次消费、clear-on-shell-destroy 和并发竞态均有测试。
- [ ] handler 只接受正确 host/path/token，拒绝枚举、路径片段、query 注入和重复读取。
- [ ] response 使用正确 MIME/length，取消读取会释放 security-scoped access。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/FileTokenTests`
- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/BinarySchemeTests`

**Dependencies:** Task 5, provisional origin from Task 7/8

**Files likely touched:**

- `apps/ipad-shell/files/file-token-store.swift`
- `apps/ipad-shell/files/binary-data-scheme-handler.swift`
- `apps/ipad-shell/tests/file-token-store-tests.swift`
- `apps/ipad-shell/tests/binary-data-scheme-handler-tests.swift`

**Estimated scope:** M (4 files)

## Task 12: 打通 Document Picker 与 iPad ScoreFileGateway

**Description:** 在 Swift 路由 `file.select`，返回 metadata/token；Web 侧实现 iPad
`ScoreFileGateway`，通过受限数据 URL 读取 `Uint8Array`。首轮只要求单文件，API 保留 multiple。

**Acceptance criteria:**

- [ ] cancel 返回空选择且不改变 route；非法类型/非普通文件/超限返回结构化可恢复错误。
- [ ] Web Gateway 只接收 fileName/size/token，不获得原生 URL。
- [ ] readBytes 成功消费 token；网络/读取失败不会创建 Library Score。

**Verification:**

- [ ] `pnpm vitest run apps/ipad-shell/web/src/__tests__/ipad-score-file-gateway.test.ts`
- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/DocumentPickerRouteTests`

**Dependencies:** Task 6, Task 11

**Files likely touched:**

- `apps/ipad-shell/files/document-picker-coordinator.swift`
- `apps/ipad-shell/bridge/bridge-router.swift`
- `apps/ipad-shell/tests/document-picker-route-tests.swift`
- `apps/ipad-shell/web/src/ipad-score-file-gateway.ts`
- `apps/ipad-shell/web/src/__tests__/ipad-score-file-gateway.test.ts`

**Estimated scope:** M (5 files)

## Task 13: 组合 iPad IndexedDB Library、Gateway 与 Viewer session

**Description:** iPad entry 在 handshake 后创建共享 IndexedDB Repository、playback persistence、
iPad Gateway 和 GP/MusicXML adapters，并挂载同一个 `mountViewerApp`。

**Acceptance criteria:**

- [ ] iPad Library 使用独立且稳定的 IndexedDB origin，不与 Browser Demo 共享数据。
- [ ] GP/MusicXML/MXL 导入继续走 `importLibraryScores` 和 Score Identity 去重。
- [ ] iPad playback persistence 只适配共享 Repository 的 sidecar/resume 方法，不复制 IndexedDB 实现。
- [ ] 启动/Repository 错误显示阻塞状态，不降级为内存库或自动清库。

**Verification:**

- [ ] `pnpm vitest run apps/ipad-shell/web/src/__tests__/main.test.ts`
- [ ] `pnpm ipad:web:build`

**Dependencies:** Task 9, Task 12

**Files likely touched:**

- `apps/ipad-shell/web/src/main.ts`
- `apps/ipad-shell/web/src/ipad-viewer-host.ts`
- `apps/ipad-shell/web/src/ipad-library-playback-persistence.ts`
- `apps/ipad-shell/web/src/__tests__/main.test.ts`
- `apps/ipad-shell/package.json`

**Estimated scope:** M (5 files)

## Task 14: 建立 Simulator 单文件导入到 Viewer smoke test

**Description:** 用 XCUITest 或可重复的测试注入路径验证一份 GP 与一份 MusicXML 从系统选择语义
进入 IndexedDB、导航到持久 Library Score URL 并创建 Viewer。不得用绕过 Gateway 的测试钩子
证明生产路径。

**Acceptance criteria:**

- [ ] GP 与 MusicXML fixtures 都显示谱面；刷新/重建 WebView 后可从 IndexedDB 再打开。
- [ ] 重复导入同一内容打开已有 Library Score，不新增记录。
- [ ] 测试失败保留结构化阶段信息，不记录路径或曲谱内容。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseUITests/ImportViewerTests`
- [ ] `pnpm ipad:verify`

**Dependencies:** Task 10, Task 13

**Files likely touched:**

- `apps/ipad-shell/ui-tests/import-viewer-tests.swift`
- `apps/ipad-shell/ui-tests/fixtures/acceptance.gp`
- `apps/ipad-shell/ui-tests/fixtures/acceptance.musicxml`
- `apps/ipad-shell/Zupulse.xcodeproj/project.pbxproj`

**Estimated scope:** M (4 files)

## Task 15: 配置前台可混音的 Audio Session

**Description:** 原生壳配置 playback + mix-with-others 语义，监听 interruption 与 route change，向 Web
发出最小宿主事件；本任务不实现后台播放或自动续播。

**Acceptance criteria:**

- [ ] audio session 只在需要播放时激活，允许其他音频继续且不 duck。
- [ ] interruption begin、耳机断开和不可用 route 都产生 pause intent。
- [ ] interruption end/foreground 不产生 play intent；未添加 background audio entitlement。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/AudioSessionTests`

**Dependencies:** Checkpoint B

**Files likely touched:**

- `apps/ipad-shell/audio/audio-session-controller.swift`
- `apps/ipad-shell/tests/audio-session-controller-tests.swift`
- `apps/ipad-shell/app/ipad-app.swift`

**Estimated scope:** M (3 files)

## Task 16: 将 iPad 生命周期映射为 pause-and-flush

**Description:** 将 SwiftUI inactive/background、Audio Session pause intent 与 Shell teardown 统一映射为
Bridge lifecycle event；Web 调用 `ViewerAppHandle.pauseAndFlush()` 并确认，不复制播放状态到 Swift。

**Acceptance criteria:**

- [ ] 同一 lifecycle state 只有一个 pending ack；超时产生稳定诊断码但不自动播放。
- [ ] Web 收到 suspend 先 pause/flush，再回复 ack；重复/迟到事件幂等。
- [ ] foreground 只恢复 UI，不发送 play 命令。

**Verification:**

- [ ] `pnpm vitest run apps/ipad-shell/web/src/__tests__/ipad-lifecycle.test.ts`
- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/LifecycleCoordinatorTests`

**Dependencies:** Task 6, Task 15

**Files likely touched:**

- `apps/ipad-shell/app/lifecycle-coordinator.swift`
- `apps/ipad-shell/tests/lifecycle-coordinator-tests.swift`
- `apps/ipad-shell/web/src/ipad-viewer-host.ts`
- `apps/ipad-shell/web/src/__tests__/ipad-lifecycle.test.ts`

**Estimated scope:** M (4 files)

## Task 17: 恢复上次 Viewer 并处理 WebContent 进程终止

**Description:** 保存最后一个有效 Library route/UI preference，WKWebView 被回收或冷启动后重新完成
handshake、Repository initialize 和 Session 重建；播放状态始终 paused。

**Acceptance criteria:**

- [ ] 恢复使用 `libraryScoreId`，不保存 Session ID、token、popover 或 seek 手势。
- [ ] score 缺失/损坏时回到 Library 并显示可恢复错误，不循环 reload。
- [ ] WebContent termination 只创建一个替代 WebView/Session，恢复后不自动发声。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/WebContentRecoveryTests`
- [ ] `pnpm ipad:test -- --only-testing ZupulseUITests/ViewerRecoveryTests`

**Dependencies:** Task 16

**Files likely touched:**

- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- `apps/ipad-shell/webview/web-content-recovery-coordinator.swift`
- `apps/ipad-shell/tests/web-content-recovery-tests.swift`
- `apps/ipad-shell/ui-tests/viewer-recovery-tests.swift`

**Estimated scope:** M (5 files)

## Task 18: 添加 iPad capability 路由与 Studio 占位页

**Description:** 让 App route 组合接受显式 product capabilities。iPad 保留 Studio URL，但渲染不支持
状态页；Browser/Desktop 保持完整 Studio。

**Acceptance criteria:**

- [ ] iPad `harmonyAnalysis: false` 时 Library 无 Studio 入口，Studio URL 不创建 runtime/repository read。
- [ ] 占位页显示曲谱名称、返回 Viewer 和返回 Library；无空白或误导性 loading。
- [ ] Browser/Desktop route 与现有 Studio 测试无回归。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/App.test.tsx`
- [ ] `pnpm vitest run packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx`

**Dependencies:** Checkpoint B

**Files likely touched:**

- `packages/web-viewer/src/app/App.tsx`
- `packages/web-viewer/src/app/__tests__/App.test.tsx`
- `packages/web-viewer/src/app/pages/StudioUnavailablePage.tsx`
- `packages/web-viewer/src/app/pages/PageShell.module.css`
- `packages/web-viewer/src/mountViewerApp.tsx`

**Estimated scope:** M (5 files)

## Task 19: 实现横屏、竖屏和 Split View 布局

**Description:** 按容器宽度为 Library/Viewer 建立 iPad wide/portrait/narrow 布局，处理 safe-area、
单一滚动宿主和底部 Transport；不按 user agent 或设备方向分叉业务组件。

**Acceptance criteria:**

- [ ] 三档容器宽度都保留主 Transport、循环状态和返回 Library。
- [ ] resize 只 re-layout，不销毁 Viewer Session、不改变播放/循环事实。
- [ ] Light/Dark、loading/error/disabled/selected 状态不因 iPad CSS 丢失。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/features`
- [ ] `pnpm check:design`
- [ ] Manual: Simulator 横屏、竖屏、1/2 与窄 Split View 截图对照

**Dependencies:** Task 14

**Files likely touched:**

- `packages/web-viewer/src/app/App.module.css`
- `packages/web-viewer/src/features/PlaybackWorkspace.module.css`
- `packages/web-viewer/src/features/SheetLibrary.module.css`
- `packages/web-viewer/src/components/ScoreViewer.module.css`
- `packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx`

**Estimated scope:** M (5 files)

## Task 20: 实现谱面专属缩放

**Description:** 增加 score-only zoom preference、按钮和双指手势；手势过程中只预览，结束后提交
alphaTab scale/re-layout，并保持当前书面位置与 Session。

**Acceptance criteria:**

- [ ] 缩放不改变 Transport/App UI 比例；按钮与 pinch 共用一个有界值和默认值。
- [ ] alphaTab 只在 commit 时重排，高频手势不通过 React state 每帧重渲染应用树。
- [ ] re-layout 后保持播放、循环、written position，且保留按钮替代与系统缩放。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`
- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/appStore.test.ts`
- [ ] Manual: Simulator pinch preview/commit 与位置保持

**Dependencies:** Task 19

**Files likely touched:**

- `packages/web-viewer/src/components/ScoreViewer.tsx`
- `packages/web-viewer/src/components/ScoreViewer.module.css`
- `packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`
- `packages/web-viewer/src/app/appStore.tsx`
- `packages/web-viewer/src/app/__tests__/appStore.test.ts`

**Estimated scope:** M (5 files)

## Task 21: 实现点拍定位与触控手势仲裁

**Description:** 将 alphaTab beat/note 点击映射到现有 written/playback position seek；在手势边界区分
轻点、滚动与 pinch，不增加谱面拖拽 Loop。

**Acceptance criteria:**

- [ ] 暂停轻点只定位；播放轻点定位后继续；滚动/pinch 不误 seek。
- [ ] repeat/jump 使用现有 Written Position / Playback Occurrence，不持久化 alphaTab ID。
- [ ] A/B 继续取当前播放位置并沿用 off/beat/measure 吸附。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/gp/__tests__/alphaTabBrowser.test.ts`
- [ ] `pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`
- [ ] Manual: Simulator 轻点、滚动、pinch 冲突场景

**Dependencies:** Task 20

**Files likely touched:**

- `packages/web-core/src/gp/alphaTabBrowser.ts`
- `packages/web-core/src/gp/__tests__/alphaTabBrowser.test.ts`
- `packages/web-viewer/src/components/ScoreViewer.tsx`
- `packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`
- `packages/web-viewer/src/viewerApp.tsx`

**Estimated scope:** M (5 files)

## Task 22: 接入系统“用 Zupulse 打开”待处理队列

**Description:** SwiftUI 接收 Files/AirDrop/邮件外部文件，在 Web/Repository/Router 就绪前排队，随后
按顺序通过 token 事件投递；不绕过 Library Import 临时打开。

**Acceptance criteria:**

- [ ] cold/warm start、重复系统事件和多个 URL 的顺序/去重都有测试。
- [ ] 队列在 handshake + Repository initialize 后只投递一次，Shell 销毁会清理未消费 token。
- [ ] 单文件 created/existing 都进入持久 Viewer URL；失败不留下半记录。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/ExternalOpenQueueTests`
- [ ] `pnpm vitest run apps/ipad-shell/web/src/__tests__/external-open.test.ts`

**Dependencies:** Task 17, Task 18

**Files likely touched:**

- `apps/ipad-shell/files/external-open-queue.swift`
- `apps/ipad-shell/tests/external-open-queue-tests.swift`
- `apps/ipad-shell/app/ipad-app.swift`
- `apps/ipad-shell/web/src/external-open.ts`
- `apps/ipad-shell/web/src/__tests__/external-open.test.ts`

**Estimated scope:** M (5 files)

## Task 23: 完成多选与部分成功导入汇总

**Description:** 启用 Document Picker multiple，按低并发/顺序逐份执行现有原子导入，展示新增、已存在
与失败汇总；批量完成留在 Library，单文件继续自动进入 Viewer。

**Acceptance criteria:**

- [ ] 一份损坏不回滚其他成功项；未开始项可取消，已成功项保留。
- [ ] 汇总精确区分 created/existing/failed，并给出结构化、可展开原因。
- [ ] 批量不同时保留多个 alphaTab Score/大字节副本，不产生明显并发内存峰值。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/library/__tests__/importLibraryScores.test.ts`
- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- [ ] `pnpm ipad:test -- --only-testing ZupulseUITests/BatchImportTests`

**Dependencies:** Task 22

**Files likely touched:**

- `apps/ipad-shell/files/document-picker-coordinator.swift`
- `packages/web-viewer/src/app/ViewerApplication.ts`
- `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.module.css`

**Estimated scope:** M (5 files)

## Task 24: 落实网络 allowlist、顶层导航与 Release 代码边界

**Description:** 实现 WKNavigationDelegate/CSP/config policy：应用可请求构建时 HTTPS allowlist，顶层
保持应用 origin，用户外链交给 Safari，Release 不允许 dev server 或远程 executable code。

**Acceptance criteria:**

- [ ] allowlist HTTPS data 请求可用；非 allowlist、unknown scheme、file、popup、redirect 被拒绝。
- [ ] user-initiated 普通 HTTPS 外链由系统打开，脚本触发外链不静默放行。
- [ ] Archive/Release 自动检查 dev-server host、remote script、unsafe CSP 和调试开关不存在。

**Verification:**

- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/NavigationPolicyTests`
- [ ] `pnpm ipad:web:build`
- [ ] `node apps/ipad-shell/scripts/verify-release.mjs`

**Dependencies:** Task 7/8 selected origin, Task 18

**Files likely touched:**

- `apps/ipad-shell/webview/navigation-policy.swift`
- `apps/ipad-shell/tests/navigation-policy-tests.swift`
- `apps/ipad-shell/app/Info.plist`
- `apps/ipad-shell/web/index.html`
- `apps/ipad-shell/scripts/verify-release.mjs`

**Estimated scope:** M (5 files)

## Task 25: 实现本地最小诊断与主动导出

**Description:** Swift 记录 allowlisted 诊断字段并轮转本地文件，提供用户主动导出；Web 只发送稳定
code/duration/hash prefix，不上传自定义遥测。

**Acceptance criteria:**

- [ ] schema/Swift 双端拒绝 path、token、fileName、metadata、完整 hash、payload 和任意文本字段。
- [ ] 日志有大小/数量上限，导出由用户手势触发，取消无副作用。
- [ ] 首版无远程 endpoint、后台上传任务或遥测 entitlement。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/bridge/__tests__/schemas.test.ts`
- [ ] `pnpm ipad:test -- --only-testing ZupulseTests/DiagnosticsTests`

**Dependencies:** Task 24

**Files likely touched:**

- `apps/ipad-shell/diagnostics/diagnostic-logger.swift`
- `apps/ipad-shell/diagnostics/diagnostic-exporter.swift`
- `apps/ipad-shell/tests/diagnostic-logger-tests.swift`
- `packages/web-core/src/bridge/schemas.ts`
- `packages/web-core/src/bridge/__tests__/schemas.test.ts`

**Estimated scope:** M (5 files)

## Task 26: 完成统一 iPad 验证命令与 Simulator 验收记录

**Description:** 收口规格中承诺的 `ipad:build/test/verify` 命令，串联 contract drift、资源、Release、
Swift unit、Simulator UI 和 iPad Web build，并生成不伪装真机结果的验证摘要。

**Acceptance criteria:**

- [ ] 五个规格命令均存在、可重复、失败码正确，Xcode Build Phase 复用相同底层脚本。
- [ ] `ipad:verify` 覆盖 Bridge manifest、资源 hash、Release 泄漏、Swift tests 与 Simulator smoke。
- [ ] 验收记录明确区分 passed/failed/not-run-on-device。

**Verification:**

- [ ] `pnpm ipad:web:dev --help`
- [ ] `pnpm ipad:web:build`
- [ ] `pnpm ipad:build`
- [ ] `pnpm ipad:test`
- [ ] `pnpm ipad:verify`

**Dependencies:** Tasks 14–25

**Files likely touched:**

- `package.json`
- `apps/ipad-shell/package.json`
- `apps/ipad-shell/scripts/run-xcode-tests.mjs`
- `apps/ipad-shell/scripts/verify-ipad.mjs`
- `docs/validation/ipad-simulator-acceptance.md`

**Estimated scope:** M (5 files)

## Task 27: 在 M5 真机完成风险门禁

**Description:** Personal Team 可用后，在 11 英寸 iPad Pro M5/iPadOS 26.5.2 验证资源 origin、音频、
触控、生命周期、内存和性能。此任务只归档证据；失败时回到对应实现任务，不改 ADR 状态。

**Acceptance criteria:**

- [ ] secure context、Web Crypto、Worker、AudioWorklet、IndexedDB 重启/升级稳定性全部有真机证据。
- [ ] 20 分钟播放、20 份曲谱循环、横竖/Split View、触控和音频中断满足门槛。
- [ ] 首屏 P95 ≤ 3s、audio ≤ 5s、交互 ≤ 100ms；失败指标不被平均值或 M5 性能掩盖。

**Verification:**

- [ ] `pnpm ipad:verify`
- [ ] Manual: 执行 `docs/validation/ipad-device-acceptance.md` 全部步骤
- [ ] `pnpm verify && pnpm verify:e2e`

**Dependencies:** Task 26, Personal Team available

**Files likely touched:**

- `docs/validation/ipad-device-acceptance.md`
- `docs/validation/ipad-resource-origin.md`

**Estimated scope:** S (2 files plus manual device evidence)

## Task 28: 接受 Shell、Bridge 与数据面 ADR

**Description:** 依据 Task 27 的真机证据复核薄壳、单通道 RPC 与 token 数据面是否与实现一致；
只在证据满足规格时将 ADR 0054–0056 转为 accepted/Current。

**Acceptance criteria:**

- [ ] ADR 0054–0056 描述与实际 App Shell、Bridge 和二进制数据面一致。
- [ ] 任何偏差先修订 ADR 并明确取舍，不把 proposed 直接改名掩盖差异。
- [ ] ADR 索引把已接受决策从 Proposed 移入 Current。

**Verification:**

- [ ] `pnpm check:arch`
- [ ] `pnpm format:check`

**Dependencies:** Task 27 passed

**Files likely touched:**

- `docs/adr/0054-use-thin-swiftui-wkwebview-shell-for-ipad.md`
- `docs/adr/0055-use-one-versioned-rpc-channel-for-ipad-bridge.md`
- `docs/adr/0056-separate-ipad-bridge-control-and-binary-data-planes.md`
- `docs/adr/README.md`

**Estimated scope:** S (4 documentation files)

## Task 29: 接受网络、契约与构建 ADR

**Description:** 依据完成的 Release、contract drift、资源构建和真机 origin 证据复核 ADR 0057–0059；
只在全部门槛成立时转为 accepted/Current，并关闭设计规格中的 proposed 状态。

**Acceptance criteria:**

- [ ] ADR 0057–0059 与网络 policy、Zod/Swift contract 和构建产物实际行为一致。
- [ ] 资源 origin 的最终选择有单独可重复证据，且失败候选仍保留记录。
- [ ] ADR 索引和 iPad 规格不再把已接受项标为 proposed。

**Verification:**

- [ ] `pnpm check:arch`
- [ ] `pnpm check:context`
- [ ] `pnpm format:check`

**Dependencies:** Task 28

**Files likely touched:**

- `docs/adr/0057-allow-controlled-network-access-from-ipad-webview.md`
- `docs/adr/0058-keep-zod-as-source-for-ipad-bridge-contract.md`
- `docs/adr/0059-generate-ipad-web-assets-during-app-build.md`
- `docs/adr/README.md`
- `docs/superpowers/specs/2026-07-22-ipad-practice-player-design.md`

**Estimated scope:** M (5 documentation files)
