---
status: implemented
---

# pnpm Workspace 迁移设计

## 目标

将仓库从 npm workspaces 完整迁移到 pnpm workspace，统一依赖安装、包间链接、脚本调用、锁文件和文档命令，避免两套包管理方式并存。

## Workspace 与依赖

- 在仓库根目录新增 `pnpm-workspace.yaml`，仅包含当前两个工作区：`web-core` 与 `web-demo`。
- 根 `package.json` 保留 `workspaces` 字段以兼容现有工具读取，同时增加 `"packageManager": "pnpm@9.3.0"`，与当前可用版本一致。
- `@tab-viewer/web-demo` 对 `@tab-viewer/web-core` 的依赖改为 `workspace:*`，确保始终链接当前仓库内的包，而不是解析注册表版本。
- `pnpm-lock.yaml` 是唯一提交的依赖锁文件；`package-lock.json` 从仓库删除。

## 命令与脚本

- 根脚本内部不再调用 npm。组合脚本使用 `pnpm`，工作区脚本使用 `pnpm --filter <package> <script>`。
- 对外保留现有脚本名称：`test`、`typecheck`、`check`、`demo:dev` 和 `demo:build`，降低迁移对开发流程的影响。
- 标准命令统一为 `pnpm install`、`pnpm test`、`pnpm typecheck`、`pnpm check`、`pnpm demo:dev` 和 `pnpm demo:build`。

## 文档迁移

- 更新架构文档、ADR、spec 和 plan 中的 npm workspace、`package-lock.json`、npm 命令与“不引入 pnpm”等表述，使仓库内说明与当前工具链一致。
- 只替换包管理器相关内容，不改变文档描述的产品范围、架构边界或验收语义。
- 依赖安装示例按 pnpm 语法改写，包括 workspace 定向安装和精确版本参数。

## 验证与错误处理

- 使用 pnpm 重新安装依赖并生成一致的锁文件。
- 检查仓库中不再存在有效的 npm 命令、npm workspace 约束或 `package-lock.json` 引用；第三方依赖元数据中的 `npm` 字样不作为迁移对象。
- 运行 `pnpm check` 与 `pnpm demo:build`，验证测试、类型检查、工作区链接、Rspack 构建和离线资源校验。
- 若 pnpm 安装或验证失败，保留失败输出并先修复迁移问题，不回退到 npm。

## 非目标

- 不调整目录结构，不执行 Electron 计划中的包搬迁。
- 不引入 Turborepo、Nx 或新的构建系统。
- 不修改业务代码和播放功能行为。
