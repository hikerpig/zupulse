# web-viewer context

## 职责与禁止项

- 负责共享 React 路由、页面、展示状态和用户交互编排。
- 只通过 `SheetLibraryRepository`、`ScoreFileGateway` 和 Viewer host 端口访问宿主能力。
- 不得直接使用 IndexedDB、Node、Electron、绝对路径或平台文件 API。
- 领域判断、格式解析、播放算法和跨边界校验留在 `web-core`。

## 实现约定

- 修改 UI、CSS、主题、布局或交互状态前先读根 `DESIGN.md`；只有修改主题、token 或基础组件时，
  才继续读取 `.design_library/zupulse-te-braun-theme` 的相关文件。
- 路由使用持久 `libraryScoreId`，刷新时从 Repository 重建临时 Viewer Session。
- 优先使用语义 HTML；交互变化覆盖键盘、焦点、loading、empty 和 error 状态。
- 命令式 alphaTab 生命周期集中在 Viewer adapter/工作区边界，不散入普通组件。
- UI 测试优先按 role/name 观察用户结果，不断言实现细节。
- 组件只消费 `src/styles/tokens.css` 中的运行时语义 token，不直接消费 theme library 的原始色阶；
  长期设计决策同步回根 `DESIGN.md`，不得只留在局部 CSS 或任务讨论中。
- 滚动容器使用 `src/styles/common.css` 中的 `.scrollable` 工具类：默认隐藏滚动条，hover 时淡入；
  自身可滚动的组件（如 `ScoreViewer`）直接加类，外层布局容器不重复加滚动行为。
- 嵌套高度布局（flex/grid 内需要占满高度）每层都要显式声明：外层 `height: 100%` + `min-height: 0`，
- 图标统一用 `lucide-react`，不用 emoji 或 Unicode 符号；尺寸 16px 起。
- 低频设置/试听操作用 `ContextPopup` 组件，命令栏只留图标入口，完整面板在浮层展开。
- 片段/列表项使用视觉编码（色条、圆点、底色）替代文字元信息，颜色取自现有语义 token。

参考：`src/app/App.tsx` 展示路由组合；`src/app/ViewerApplication.ts` 展示端口编排；
`src/app/__tests__/App.test.tsx` 展示用户视角测试。最小验证：
`pnpm vitest run packages/web-viewer/src/<area>`。
