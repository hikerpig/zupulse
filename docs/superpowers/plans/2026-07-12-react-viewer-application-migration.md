# React Viewer Application Migration Implementation Plan

> 本计划完整替换共享 Viewer UI，但不重写 `web-core`、Bridge schema、`PlaybackController` 或 alphaTab runtime。实施期间 Browser Demo 与 Electron 必须持续可运行；每个 feature 在任一时刻只能有一个行为所有者。

**Goal:** 将 `packages/web-viewer` 从手工 DOM mount 迁移为 Browser Demo 与 Electron 共用的 React SPA，落地 Base UI、Zustand、React Router、统一 Session snapshot/command 边界，并保持现有 Viewer 功能、视觉和宿主生命周期语义。

**Architecture:** 采用 MVVM/Presentation Model 风格的单向数据流。`ViewerApplication` 拥有打开串行化、Session registry 和宿主生命周期；`ViewerSession` 将现有 controller/runtime 投影为不可变 snapshot 并接收 command；React 只渲染 snapshot。Router 使用 hash Data Mode，但领域副作用留在 application service。`ViewerHost` 继续作为 Browser/Electron 平台端口。

**Tech Stack:** React、React DOM、React Router Data Mode、Zustand vanilla store、Base UI Slider、普通 CSS/CSS variables、TypeScript、Rspack、Vitest、Testing Library、Playwright。

## Global Constraints

- 遵循 `docs/adr/0039-use-react-for-shared-viewer-application-shell.md` 和 `docs/architecture/react-application-system.md`。
- 最终完整删除 `renderViewerShell()` 和已被 React 替代的 DOM mount/presenter；本计划不是示范页面。
- 允许 React Shell 短期渲染旧逻辑依赖的兼容 DOM，但 feature 迁移后立即删除对应旧事件绑定和 selector。
- 保持现有 studio-style 信息结构、产品文案、布局密度、亮暗主题和普通 CSS；不夹带视觉重设计，不引入 Tailwind。
- Base UI 首批只使用 Slider；checkbox、select 和 button 保留原生语义元素，不预建 Dialog、Menu、Tooltip 或 Tabs。
- Zustand 首批只保存 `theme`。URL、Session、controller、文件、播放、循环和轨道状态不得复制进 Zustand；组件私有状态继续使用 `useState`。
- `sessionId` 只在当前 Renderer 生命周期内有效；刷新、重载或复制 URL 后显示可恢复空态，不自动恢复原文件。
- 文件路径、file token、内容 hash、文件字节和平台授权不得进入 URL、Zustand 或 sessionStorage。
- 打开选择器时保留旧 Session；取消选择不改变状态；选定文件后先 pause/flush/destroy 旧 Session，再创建新 Session，不同时持有两个 alphaTab/audio runtime。
- Session 初始化失败保留结构化错误 Session；不存在的 `sessionId` 才是 route 失效。
- 开发与测试启用 StrictMode，所有 effect、订阅和 runtime 必须支持 `setup → cleanup → setup`。
- 每个任务先补失败测试，再做最小实现。里程碑结束运行相关测试、`pnpm check` 和受影响应用 build。
- 保留原工作区和其他 worktree 的未提交修改，不跨 worktree复制或覆盖用户变更。

## Task 1：建立 React、Base UI、Router、Zustand 与测试运行时

**Files:**

- Modify: `packages/web-viewer/package.json`
- Modify: `packages/web-viewer/tsconfig.json`
- Modify: `apps/web-demo/rspack.config.mjs`
- Modify: `apps/desktop-shell/rspack.config.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/web-viewer/src/test/setup.ts`（仅在 Testing Library matcher 需要时）

**Steps:**

- [ ] 给 `@tab-viewer/web-viewer` 增加 React、React DOM、React Router、Zustand 与 `@base-ui/react` runtime dependencies。
- [ ] 增加 `@types/react`、`@types/react-dom`、`@testing-library/react`、`@testing-library/user-event`；继续使用 Vitest/jsdom，不引入 Jest 或 snapshot 框架。
- [ ] 将 `packages/web-viewer/tsconfig.json` 配置为 `jsx: react-jsx`，include 覆盖 `.ts` 与 `.tsx`。
- [ ] Web Demo 和 Desktop Renderer 的 Rspack SWC rule 支持 TSX 与 automatic runtime，resolve extensions 增加 `.tsx`；Main/Preload 继续按现有 TypeScript 规则构建。
- [ ] 添加一个最小 React render 测试，证明 TSX、jsdom 和 Testing Library 工作；测试完成后不保留无产品意义的 Demo component。
- [ ] 确认普通 CSS、alphaTab asset copy、CSP 和现有 external 配置不变。

**Verify:** `pnpm install && pnpm typecheck && pnpm exec vitest run packages/web-viewer/src`

## Task 2：从 DOM mount 提取 ViewerApplication

**Files:**

- Create: `packages/web-viewer/src/app/ViewerApplication.ts`
- Create: `packages/web-viewer/src/app/ViewerApplication.test.ts`
- Modify: `packages/web-viewer/src/host.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/viewerApp.test.ts`
- Modify: `packages/web-viewer/src/index.ts`

**Steps:**

- [ ] 先把 `mountViewerApp()` 中与 DOM 无关的测试平移到 `ViewerApplication.test.ts`：并发 open 串行、取消不替换、旧 Session 清理、destroy 后拒绝、已接受操作清理、失败后队列继续、双错误聚合。
- [ ] 建立不依赖 React/DOM 的 `ViewerApplication`，注入 `ViewerHost` 与 `openSession(file, sessionId)`。
- [ ] 用不透明 `sessionId` 建立当前 Renderer 内 registry，并暴露 application snapshot、subscribe 和 command API。
- [ ] 保持 host command 转发：toggle playback、suspend、prepare-close；确保 unsubscribe 和 destroy 幂等。
- [ ] 保持文件选择期间旧 Session 存活；选定文件后先 pause/flush/destroy 旧 Session，再登记新 loading Session。
- [ ] 暂时让旧 `mountViewerApp()` 委托给 `ViewerApplication` 并继续挂载现有 DOM，使两个宿主在本任务结束时仍可运行。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/app/ViewerApplication.test.ts packages/web-viewer/src/viewerApp.test.ts && pnpm check`

## Task 3：建立 ViewerSession snapshot/command adapter

**Files:**

- Create: `packages/web-viewer/src/viewer/types.ts`
- Create: `packages/web-viewer/src/viewer/viewerSessionAdapter.ts`
- Create: `packages/web-viewer/src/viewer/viewerSessionAdapter.test.ts`
- Create: `packages/web-viewer/src/viewer/useViewerSession.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/playbackPresenter.ts`
- Modify: `packages/web-viewer/src/importPresenter.ts`
- Modify: `packages/web-viewer/src/host.ts`

**Steps:**

- [ ] 定义 `ViewerSession`：`id`、`getSnapshot()`、`subscribe()`、`dispatch()`、`destroy()`。
- [ ] 定义只读 `ViewerSessionSnapshot`，覆盖 loading、ready、结构化 error、谱面摘要、播放、循环、轨道、持久化与音频状态。
- [ ] 定义窄 `ViewerSessionCommand` union，复用现有 `PlaybackController` command，不让 React 直接持有 controller。
- [ ] 将现有 presenter/controller event 投影为 snapshot；确保 snapshot 引用只在可观察值改变时更新。
- [ ] 用 `useSyncExternalStore` 建立 React hook；selector 必须避免无关状态导致重渲染。
- [ ] alphaTab 逐帧光标和滚动跟随留在 runtime/DOM，不进入 snapshot。
- [ ] 映射当前能可靠识别的错误 kind：unsupported、corrupt、renderer、audio、unknown；UI 不解析 message 判断错误类型。
- [ ] 文件/renderer 错误支持重新打开；只有 audio 错误支持原地 retry。
- [ ] 测试 subscribe/unsubscribe、snapshot 稳定性、command forwarding、重复 destroy 和错误分类 fallback。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/viewer packages/web-viewer/src/playbackPresenter.test.ts packages/web-viewer/src/importPresenter.test.ts && pnpm check`

## Task 4：React 接管 AppShell、Zustand Theme 与 SPA Router

**Files:**

- Create: `packages/web-viewer/src/app/App.tsx`
- Create: `packages/web-viewer/src/app/AppShell.tsx`
- Create: `packages/web-viewer/src/app/router.tsx`
- Create: `packages/web-viewer/src/app/providers.tsx`
- Create: `packages/web-viewer/src/app/appStore.ts`
- Create: `packages/web-viewer/src/app/appStore.test.ts`
- Create: `packages/web-viewer/src/routes/IdleViewerRoute.tsx`
- Create: `packages/web-viewer/src/routes/ViewerRoute.tsx`
- Create: `packages/web-viewer/src/routes/NotFoundRoute.tsx`
- Create: `packages/web-viewer/src/app/App.test.tsx`
- Modify: `packages/web-viewer/src/viewerShell.ts`
- Modify: `packages/web-viewer/src/styles.css`

**Steps:**

- [ ] 建立每应用实例一个 Zustand vanilla store，通过 Context 注入；首批只有 `theme` 与 `setTheme`，不用 persist middleware。
- [ ] 用 React 重现现有 context bar、transport、score stage、practice panel 和空态，优先复用现有 CSS token/class。
- [ ] 使用 `createHashRouter` 实现 `/#/`、`/#/viewer/:sessionId` 与 Not Found；不创建 settings、曲库或最近文件页面。
- [ ] Router 工厂注入 `ViewerApplication`，不在 loader/action 中执行文件选择、Bridge 或播放命令。
- [ ] `ViewerRoute` 从 registry 解析 Session；失效 ID 显示“会话已结束，请重新打开乐谱”，结构化 Session error 则显示对应错误状态。
- [ ] 打开成功后导航到新的 `sessionId`；取消不导航；刷新后不从 URL/sessionStorage 恢复文件。
- [ ] 开发与测试以 `StrictMode` 包裹 providers；验证 store、router 和 application 都按实例隔离。
- [ ] 兼容阶段保留旧 feature 所需的 DOM ID，但 React 是 shell 唯一所有者；不再调用 `renderViewerShell()` 生成 body HTML。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/app packages/web-viewer/src/routes && pnpm check && pnpm demo:build && pnpm desktop:build`

## Task 5：隔离 AlphaTabSurface 与 Session 生命周期

**Files:**

- Create: `packages/web-viewer/src/viewer/AlphaTabSurface.tsx`
- Create: `packages/web-viewer/src/viewer/AlphaTabSurface.test.tsx`
- Create: `packages/web-viewer/src/features/open-score/OpenScoreButton.tsx`
- Create: `packages/web-viewer/src/features/open-score/OpenScoreButton.test.tsx`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/gpDemoPresenter.ts`
- Modify: `packages/web-viewer/src/importPresenter.ts`
- Modify: `packages/web-viewer/src/styles.css`

**Steps:**

- [ ] `AlphaTabSurface` 只提供稳定 DOM host/ref，Session adapter 负责 create/destroy alphaTab API 与 controller。
- [ ] 在 StrictMode 测试中验证 setup → cleanup → setup 不重复保留 alphaTab、事件监听或 audio adapter。
- [ ] 将打开文件 loading/ready/error 状态迁入 React；保留当前文案和状态层级。
- [ ] 打开第二份文件时验证旧 Session 的 pause/flush/destroy 完成后才初始化新 runtime。
- [ ] 取消选择保留旧谱；初始化失败保留错误 Session route；音频失败显示原地 retry。
- [ ] 删除 presenter 中已迁移的状态 DOM 写入，但暂时保留尚未迁移的 playback/loop/track mount。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/viewer packages/web-viewer/src/features/open-score packages/web-viewer/src/viewerApp.test.ts && pnpm check && pnpm demo:build && pnpm desktop:build`

## Task 6：迁移播放、Loop 与轨道 feature

**Files:**

- Create: `packages/web-viewer/src/components/ui/Button.tsx`
- Create: `packages/web-viewer/src/components/ui/Slider.tsx`
- Create: `packages/web-viewer/src/components/ui/Slider.test.tsx`
- Create: `packages/web-viewer/src/features/playback/PlaybackControls.tsx`
- Create: `packages/web-viewer/src/features/playback/PlaybackControls.test.tsx`
- Create: `packages/web-viewer/src/features/practice-loop/PracticeLoop.tsx`
- Create: `packages/web-viewer/src/features/practice-loop/PracticeLoop.test.tsx`
- Create: `packages/web-viewer/src/features/track-mixer/TrackMixer.tsx`
- Create: `packages/web-viewer/src/features/track-mixer/TrackMixer.test.tsx`
- Modify: `packages/web-viewer/src/playbackControls.ts`
- Modify: `packages/web-viewer/src/playbackPresenter.ts`
- Modify: `packages/web-viewer/src/styles.css`

**Steps:**

- [ ] 建立原生 `<button>` 薄封装，只统一现有视觉、disabled、focus 和 loading；不建立未使用 variant 系统。
- [ ] 仅为播放进度、速度和 Loop A/B 封装 Base UI Slider；保留 Loop checkbox 和 snap `<select>` 的原生语义。
- [ ] Testing Library 覆盖 Slider 方向键、Home/End、disabled、label 与 command dispatch；指针几何交给浏览器/E2E。
- [ ] PlaybackControls 通过 selector 读取 snapshot，发送播放、停止、seek、speed 和 audio retry command。
- [ ] PracticeLoop 迁移 enable、A/B、snap、保存区间和已有列表；TrackMixer 迁移 mute/solo/volume 等现有能力。
- [ ] 每迁移一个 feature，立即删除 `playbackControls.ts` 中对应 selector、事件监听和 DOM 写入。
- [ ] 最终删除旧 `playbackControls.ts` 与不再使用的 presenter export；不得保留 React/旧 DOM 双订阅。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/components packages/web-viewer/src/features packages/web-viewer/src/viewer && pnpm check && pnpm demo:build && pnpm desktop:build`

## Task 7：切换 Browser/Electron 挂载 API 并清理旧 Viewer UI

**Files:**

- Modify: `packages/web-viewer/src/index.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Delete: `packages/web-viewer/src/viewerShell.ts`
- Delete: migrated legacy presenter/mount files that have no remaining owner
- Modify: `apps/web-demo/index.html`
- Modify: `apps/web-demo/src/main.ts`
- Modify: `apps/web-demo/src/main.test.ts`
- Modify: `apps/desktop-shell/index.html`
- Modify: `apps/desktop-shell/src/renderer.ts`
- Modify: `apps/desktop-shell/e2e/desktop.spec.ts`

**Steps:**

- [ ] 两个 HTML 模板提供明确 `<div id="root"></div>`。
- [ ] 将公共入口改为 `mountViewerApp(rootElement, dependencies)`；内部创建 store、`ViewerApplication`、router 与 React root，不保留 Document 旧签名。
- [ ] 返回 handle 继续提供 `openScore`、`togglePlayback`、`pauseAndFlush`、`destroy`；destroy 先销毁 application/session，再 unmount React root。
- [ ] Browser Demo 删除 `renderViewerShell(document)`，创建 BrowserHost 后直接挂载。
- [ ] Electron 保持 Bridge 检查、handshake 和版本/hash 校验在 React 外；成功后挂载，启动前 fatal error 继续由 bootstrap 最小 DOM 展示。
- [ ] 挂载后的文件、Session、音频和持久化错误全部进入 React UI。
- [ ] 删除 `renderViewerShell()`、兼容 ID、旧 DOM mount/presenter、无引用 export 和失效测试；保留确有语义/无障碍用途的 ID。
- [ ] 更新 E2E selector 优先使用 role/name，不依赖 React 内部结构或 Base UI implementation detail。

**Verify:** `pnpm check && pnpm demo:build && pnpm desktop:build && pnpm desktop:test:e2e`

## Task 8：完整回归、人工验收与文档收尾

**Files:**

- Modify: `docs/architecture/react-application-system.md`（仅记录实施后偏差）
- Modify: `docs/adr/0039-use-react-for-shared-viewer-application-shell.md`（将状态从提议改为接受，前提是全部门槛通过）
- Modify: `CONTEXT.md`（仅在实施产生新的领域术语时；禁止写实现术语）
- Modify: affected tests and CSS discovered during verification

**Steps:**

- [ ] 运行全部类型检查、单元测试、Browser build、Desktop build 和 Desktop E2E。
- [ ] Browser Demo 人工打开代表性 GP 与 MusicXML 文件。
- [ ] Electron 人工覆盖打开、取消、第二次打开、播放/暂停、停止、seek、速度、Loop 和轨道控制。
- [ ] 用键盘完成打开、Base UI Slider、checkbox、select 和主要焦点顺序；检查 Base UI/ARIA 警告。
- [ ] 验证亮暗主题跨 route 保持，刷新活动 URL 后显示失效 Session 恢复空态。
- [ ] 验证 StrictMode 下无重复 Session、host subscription、alphaTab 或 audio runtime。
- [ ] 验证 suspend/prepare-close 会 pause、flush、destroy 并完成 lifecycle ack。
- [ ] 检查控制台无 React、Base UI、ARIA、未处理 Promise 或资源清理错误。
- [ ] 在 320、768、1024、1440 px 检查控制可达性；不借机重设计界面。
- [ ] 使用 `rg` 确认无 `renderViewerShell`、旧 mount selector、双状态 owner、未使用 Zustand slice 或未使用 Base UI wrapper。
- [ ] 只记录实施中真实发生的架构偏差；不为未来功能扩写文档。

**Verify:**

```sh
pnpm check
pnpm demo:build
pnpm desktop:build
pnpm desktop:test:e2e
```

## Completion Definition

- Browser Demo 与 Electron 使用同一 React root、Router、ViewerApplication 和 Session adapter。
- 原有 Viewer 功能、视觉、文件打开与宿主生命周期语义保持；自动化和人工验收通过。
- React View 只消费 snapshot/发送 command；controller、Bridge、alphaTab 和 URL 的状态所有权没有复制进 Zustand。
- Base UI 只承担已使用 Slider 的复杂交互；普通 CSS 和原生控件保持简单。
- 所有旧共享 Viewer DOM mount 代码被删除，没有长期兼容层。
- 不要求本轮完成 Windows 人工验收；该项仍属于 Desktop Shell MVP 发布流程。

