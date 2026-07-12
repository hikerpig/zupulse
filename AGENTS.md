# Tab Viewer agent context

## 项目结构

- `packages/web-core`：领域类型、Zod 边界、导入用例、Bridge 契约与播放逻辑；不得依赖 React、Browser 或 Electron。
- `packages/web-viewer`：共享 React 路由与 UI；只通过端口访问持久化和文件选择能力。
- `apps/web-demo`：Browser 适配器，使用 IndexedDB；不得泄漏文件路径。
- `apps/desktop-shell`：Electron 主进程、SQLite 和托管文件；Renderer 只能通过受 Zod 校验的 Bridge 访问本地能力。

## 领域边界

- Library Score ID 是 UUID；馆藏去重键是小写 SHA-256 内容哈希。
- `SheetLibraryRepository` 管理馆藏事实；`ScoreFileGateway` 只管理选择/导出文件。
- Studio URL 使用 `#/viewer/:libraryScoreId`，不得再把临时 Viewer Session ID 放进 URL。
- 删除必须同时清理托管字节、馆藏记录与练习数据；不得在删除后重建孤儿 sidecar/resume。
- Browser 与 Desktop 曲谱库相互独立；本轮不实现云同步、OPFS、分页或额外状态库。
- Desktop Renderer 不得获得绝对路径；外部文件应使用一次性 token，并由 Main Process 再次校验输入。

## 代码约定

- TypeScript 开启 `exactOptionalPropertyTypes`：可选字段不存在时省略属性，禁止显式赋值 `undefined`。
- 所有跨进程与持久化输入使用现有 Zod schema；新增 Bridge API 必须同时添加 request、response、capability 和测试。
- 遵循现有 named export、同目录 `*.test.ts(x)` 测试和 Prettier 双引号风格。
- 不添加依赖前先检查现有标准库、平台能力和已安装包；优先最小实现。
- 修改前先读目标文件、关联测试和同类实现；错误/测试失败时先定位根因再修复。

## 常用验证

- 全量类型与单测：`rtk pnpm check`
- Browser 构建：`rtk pnpm demo:build`
- Desktop 构建：`rtk pnpm desktop:build`
- Desktop E2E：`rtk pnpm desktop:test:e2e`
- 格式：`rtk pnpm format:check`（仓库存在历史格式债务时，报告未触及文件，不要批量重写）
