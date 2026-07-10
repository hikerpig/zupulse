# Monorepo 按 packages 与 apps 分层

仓库将可复用能力放在 `packages/`，可运行宿主放在 `apps/`：`packages/web-core` 保存领域模型、GP、播放和 Bridge schema，`packages/web-viewer` 保存共享 Viewer UI；`apps/web-demo` 提供浏览器文件选择与 mock Bridge，`apps/desktop-shell` 提供 Electron Main、Preload、生产 Renderer 入口和 Forge 配置。现有 pnpm 包名保持稳定。该结构避免 Electron 生产应用依赖名为 Demo 的宿主，也防止共享 UI 被塞入领域核心。

跨宿主测试素材统一放在根目录 `test-fixtures/`，原始授权样本与确定性派生样本分开管理，Browser Demo 和 Desktop Shell 共用；生产构建必须排除整个目录，应用不内置示例曲目。

仓库继续使用 pnpm workspace、现有 `pnpm-lock.yaml` 与 TypeScript project references，根脚本和 Electron Forge hook 足以编排当前任务；在真实构建性能问题出现前不引入 Turborepo、Nx 或其他 monorepo 管理层。
