# Zupulse（逐拍）agent context

## 事实源

按以下顺序取信：运行时代码、Zod schema 与数据库约束 > 可重复的测试/构建/E2E >
Current ADR 与架构文档 > 当前规格。冲突必须指出；历史文档和过程计划仅作证据。

导航从 `docs/architecture/README.md` 开始；术语见 `CONTEXT.md` 和
`docs/architecture/glossary.md`；UI 契约见 `DESIGN.md`。

## 修改前按范围继续读取

- 领域、schema、导入、播放：`packages/web-core/AGENTS.md`
- React 路由、状态、UI：`packages/web-viewer/AGENTS.md`
- Browser/IndexedDB：`apps/web-demo/AGENTS.md`
- Electron/Bridge/SQLite：`apps/desktop-shell/AGENTS.md`
- Electron Main/托管文件：`apps/desktop-shell/src/main/AGENTS.md`
- 架构或 UI 决策：相关 Current ADR、架构文档或 `DESIGN.md`

## 不可破坏的边界

- `web-core` 不依赖 React、Browser 或 Electron；`web-viewer` 只通过端口访问宿主能力。
- Browser 与 Desktop 馆藏独立。Renderer 不得获得绝对路径；外部文件使用一次性 token，并由 Main 复验。
- Library Score ID 是 UUID，去重键是小写 SHA-256；Viewer/Studio URL 只使用 `libraryScoreId`。
- `SheetLibraryRepository` 管馆藏事实，`ScoreFileGateway` 管文件选择/导出。
- 删除须同时清理托管字节、馆藏、练习数据和 Harmony Analysis Document，不得重建孤儿数据。

## 实现规则

- 遵循 `docs/conventions/file-naming.md`；使用 named export、Prettier 双引号和
  `__tests__/*.test.ts(x)`；禁止 workspace 深导入。
- `exactOptionalPropertyTypes` 下省略不存在的可选字段，不显式传 `undefined`。
- 跨进程和持久化输入必须经 Zod 校验；新增 Bridge API 同步添加 request、response、
  capability 和测试。
- 用户可见系统文案统一进入 `@zupulse/app-i18n`；`web-core` 只返回语义 code/context，
  不返回译文或翻译 key，原始异常不得进入 DOM。
- Locale 由宿主持久化：Browser 使用本地存储，Desktop 由 Main + Bridge 管理；切换时先持久化，
  再同步 Renderer、菜单和原生对话框。用户内容、曲谱元数据与和弦符号不翻译。
- 添加依赖前先检查平台和现有依赖；优先最小实现。失败时定位根因，只改相关文件。
- 一次性计划和任务记录完成后删除；稳定约束沉淀到 Current 架构、ADR 或本文件。

## 验证

先运行最小相关测试，再按风险升级：`pnpm verify:fast`、`pnpm verify`、涉及 Browser/Desktop
流程时运行 `pnpm verify:e2e`。i18n 改动必须通过 `pnpm check:i18n`。提交前运行
`pnpm format:check` 和 `git diff --check`，并报告实际结果。
