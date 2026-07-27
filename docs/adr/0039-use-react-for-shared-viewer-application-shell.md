# 共享 Viewer 应用壳采用 React 生态

## 状态

接受

## 背景

`packages/web-viewer` 当前直接创建 DOM、注册事件并手工维护会话清理。该实现已经验证 Browser Demo 与 Electron Renderer 可以共享同一套 UI，但随着文件库、设置、多个 Viewer 页面和弹层交互增加，手工编排会让状态归属、页面生命周期和可访问性组件重复实现。

领域模型、播放控制器、导入流程与 Bridge schema 已经位于 `packages/web-core`，不应为了采用 React 而迁移或改写。

## 决策

共享 Viewer 应用壳采用 React，并保持 `web-core` 为 UI 无关的 TypeScript 包。

- 使用 React Router 的 Data Mode 与 hash history。hash 路由同时适配浏览器静态部署和 Electron 自定义协议，不要求宿主增加服务端 fallback。
- 使用 Base UI 作为无样式、可访问的复杂交互基础；简单按钮、输入框和布局仍使用原生 HTML 封装。Base UI 保留项目对 DOM 和视觉的控制，同时提供键盘导航、ARIA、焦点管理、浮层定位、状态 data attribute、动画阶段和 CSS variable。
- 使用现有 CSS token 与普通 CSS 组织视觉样式，暂不引入 Tailwind、CSS-in-JS 或另一套主题运行时。当前 UI 规模不足以抵消新增构建配置、class 扫描和第三方 alphaTab 样式回归的成本。
- React 本地状态处理组件私有交互；URL 保存可分享的导航状态；使用按应用实例创建的 Zustand vanilla store 保存跨 route 主题状态。首批只迁移 `theme`，后续状态按所有权逐项判断，不以把所有 `useState` 迁入 store 为目标。
- `PlaybackController`、Bridge 与 alphaTab 继续拥有领域和运行时状态。React 通过 adapter hook 订阅，不把高频播放事件复制进全局 store。
- 将现有 `mountViewerApp()` 中的打开串行化、活动 Session 替换、宿主命令转发、挂起保存和销毁语义提取为不依赖 React 或 DOM 的 `ViewerApplication` service。Router 和 React 通过注入使用该 service，不把生命周期分散到 effect、loader 或 Zustand action。
- TanStack Query 暂不作为基线依赖；当文件库、sidecar 索引或同步形成需要缓存、失效和重试的异步资源读模型时再引入。
- 不使用 MobX 接管当前应用状态。它擅长深层 observable 对象图和 computed，但会与现有 `PlaybackController`、Bridge 和 alphaTab 的状态所有权重叠；只有产品演进为复杂制谱编辑器、领域对象图成为主要状态模型时才重新评估。
- Jotai 作为备选而非并存依赖。只有客户端 UI 演进为大量独立、细粒度且派生关系复杂的状态时，才用它替换 Zustand。
- XState 只在文件打开、导入、取消和错误恢复形成复杂有限状态工作流时局部引入；它不承担普通 UI 数据存储。RxJS 同理只用于未来 MIDI 或播放事件流。

## 结果

Browser Demo 与 Electron Renderer 继续挂载同一个 `packages/web-viewer` 应用，只注入不同 `ViewerHost`。迁移可以按页面和组件渐进进行，不要求一次重写 `web-core` 或 alphaTab adapter。

应用新增依赖保持在 `packages/web-viewer`，宿主只保留入口、HTML 模板和平台 adapter。路由不能携带本地文件路径、访问 token 或文件内容，只使用进程内 `sessionId`。

Base UI 只拥有通用交互行为，不拥有产品视觉或领域语义。应用使用自己的 `components/ui` 薄封装和 CSS token，避免业务 feature 直接依赖第三方 component anatomy。

Tailwind 可以在组件数量、响应式变体和重复 utility 样式显著增长后重新评估。即使届时引入，alphaTab 生成的 DOM、piano-roll/Canvas、数据驱动坐标和高频播放光标仍保留普通 CSS、CSS variable 或命令式渲染边界。

上述 Tailwind 暂缓决定已由 ADR 0065 局部取代。React、Base UI、应用生命周期和状态所有权的其余
决定继续有效。

## 参考

- [React Router 模式选择](https://reactrouter.com/start/modes)
- [Base UI 简介](https://base-ui.com/react/overview/about)
- [Base UI 样式接口](https://base-ui.com/react/handbook/styling)
- [Base UI 可访问性](https://base-ui.com/react/overview/accessibility)
- [Zustand 简介](https://zustand.docs.pmnd.rs/)
- [Jotai 简介](https://jotai.org/)
- [MobX React 集成](https://mobx.js.org/react-integration.html)
- [XState 文档](https://stately.ai/docs/xstate)
