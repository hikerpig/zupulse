# Zupulse（逐拍）agent context

## 事实源与冲突处理

实现决策按以下顺序取信，后者与前者冲突时必须显式指出，不得静默猜测：

1. 运行时代码、Zod schema 与数据库约束。
2. 自动化测试和可重复的构建/E2E 结果。
3. `docs/adr/README.md` 标记为 Current 的 ADR 与 `docs/architecture/README.md`。
4. 当前任务规格与验收标准。
5. Historical / Superseded 文档、已完成计划和讨论稿，仅作历史证据。

项目导航从 `docs/architecture/README.md` 开始；产品术语以 `CONTEXT.md` 和
`docs/architecture/glossary.md` 为准。

## 项目结构

- `packages/web-core`：领域类型、Zod 边界、导入用例、Bridge 契约与播放逻辑；不得依赖 React、Browser 或 Electron。
- `packages/web-viewer`：共享 React 路由与 UI；只通过端口访问持久化和文件选择能力。
- `apps/web-demo`：Browser 适配器，使用 IndexedDB；不得泄漏文件路径。
- `apps/desktop-shell`：Electron Main、Preload、Renderer、SQLite 和托管文件；Renderer 只能通过受 Zod 校验的 Bridge 访问本地能力。

## 全局领域边界

- Library Score ID 是 UUID；馆藏去重键是小写 SHA-256 内容哈希。
- `SheetLibraryRepository` 管理馆藏事实；`ScoreFileGateway` 只管理选择/导出文件。
- Viewer URL 使用 `#/viewer/:libraryScoreId`，Studio URL 使用 `#/studio/:libraryScoreId`；两者都不得把临时 Session ID 放进 URL。
- 删除必须同时清理托管字节、馆藏记录、练习数据与 Harmony Analysis Document；不得在删除后重建孤儿 sidecar/resume/analysis。
- Browser 与 Desktop 曲谱库相互独立；当前范围不包含云同步、OPFS、分页或额外状态库。
- Desktop Renderer 不得获得绝对路径；外部文件使用一次性 token，并由 Main 再次校验输入。

## 代码约定

- TypeScript 开启 `exactOptionalPropertyTypes`：可选字段不存在时省略属性，禁止显式赋值 `undefined`。
- 所有跨进程与持久化输入使用现有 Zod schema；新增 Bridge API 同时添加 request、response、capability 和测试。
- 使用 named export、Prettier 双引号和 `__tests__/*.test.ts(x)`；仅 `__tests__` 与 `e2e` 可引用测试框架。
- 跨 workspace 包只能使用包公开入口，不得通过 `@zupulse/*/src/...` 深导入。
- 不添加依赖前先检查标准库、平台能力和已安装包；优先最小实现。
- 错误或测试失败时先定位根因，只加载相关失败输出，不批量改写无关文件。

## 上下文路由

| 修改范围                 | 继续读取                                         |
| ------------------------ | ------------------------------------------------ |
| 领域、schema、导入、播放 | `packages/web-core/AGENTS.md`                    |
| React 路由、状态和 UI    | `packages/web-viewer/AGENTS.md`                  |
| IndexedDB、Browser host  | `apps/web-demo/AGENTS.md`                        |
| Electron、Bridge、SQLite | `apps/desktop-shell/AGENTS.md`                   |
| Electron Main 或托管文件 | `apps/desktop-shell/src/main/AGENTS.md`          |
| 架构决策                 | `docs/architecture/README.md` 与相关 Current ADR |

## 验证阶梯

- 快速门禁：`pnpm verify:fast`
- 全量类型、单测与构建：`pnpm verify`
- Browser 与 Desktop E2E：`pnpm verify:e2e`
- 单独排错：`pnpm check:context`、`pnpm check:arch`、`pnpm check`
- 格式：`pnpm format:check`；历史格式债务只报告未触及文件，不批量重写。

每次实现以最小相关测试开始，完成前执行与风险相称的上层门禁，并在交付时报告实际运行结果。
