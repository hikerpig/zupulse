# web-viewer context

## 职责与禁止项

- 负责共享 React 路由、页面、展示状态和用户交互编排。
- 只通过 `SheetLibraryRepository`、`ScoreFileGateway` 和 Viewer host 端口访问宿主能力。
- 不得直接使用 IndexedDB、Node、Electron、绝对路径或平台文件 API。
- 领域判断、格式解析、播放算法和跨边界校验留在 `web-core`。

## 实现约定

- 路由使用持久 `libraryScoreId`，刷新时从 Repository 重建临时 Viewer Session。
- 优先使用语义 HTML；交互变化覆盖键盘、焦点、loading、empty 和 error 状态。
- 命令式 alphaTab 生命周期集中在 Viewer adapter/工作区边界，不散入普通组件。
- UI 测试优先按 role/name 观察用户结果，不断言实现细节。

参考：`src/app/App.tsx` 展示路由组合；`src/app/ViewerApplication.ts` 展示端口编排；
`src/app/__tests__/App.test.tsx` 展示用户视角测试。最小验证：
`pnpm vitest run packages/web-viewer/src/<area>`。
