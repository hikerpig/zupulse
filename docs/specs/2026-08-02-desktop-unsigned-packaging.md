---
status: implemented
---

# Desktop 未签名打包设计

## 目标

为 Zupulse Desktop 提供可重复执行的内部验收打包流程：macOS 仅生成 Apple Silicon `arm64`
产物，Windows 仅生成 `x64` 产物。GitHub Actions 只允许人工触发，本地开发者也可通过稳定的
`pnpm` 命令生成同类产物。

## 范围

- macOS `arm64`：生成未签名 DMG 和 ZIP。
- Windows `x64`：生成未签名 Squirrel Setup、NuGet package 和 `RELEASES` metadata。
- GitHub Actions 仅通过 `workflow_dispatch` 启动，并按平台上传独立 Artifact。
- 复用现有 Rspack production build、Electron Forge 和 package content verification。
- 提供本地打包命令、产物位置和平台限制说明。

## 非目标

- Intel Mac、Windows ARM 或 32-bit Windows。
- macOS code signing、notarization、Windows Authenticode signing。
- 自动更新、GitHub Release 发布、tag/version orchestration。
- 从 macOS cross-build Windows，或从 Windows cross-build macOS。

## 构建契约

| Target         | Host                | Command                 | Expected makers |
| -------------- | ------------------- | ----------------------- | --------------- |
| `darwin-arm64` | Apple Silicon macOS | `pnpm desktop:make:mac` | DMG, ZIP        |
| `win32-x64`    | Windows x64         | `pnpm desktop:make:win` | Squirrel        |

两个命令必须先执行 `pnpm desktop:build`，再调用 Forge `make`，最后运行现有 package content
verification。所有生成文件保留在 `apps/desktop-shell/out/`，不得提交 Git。

## 安全与分发边界

产物必须以 `unsigned` 标识上传。macOS Gatekeeper 和 Windows SmartScreen 可能阻止普通用户直接
启动；这些产物仅用于内部验收，不得描述为已签名或可公开发布的正式安装包。Actions 不读取或
预留任何签名 secret。

## 验收标准

- macOS job 只在人工触发后运行，并只请求 `darwin-arm64`。
- Windows job 只在人工触发后运行，并只请求 `win32-x64`。
- 两个平台使用 Node.js 22、pnpm 9.3.0 和 `pnpm install --frozen-lockfile`。
- 每个平台在上传 Artifact 前完成 Rspack build、Forge make 和 package content verification。
- macOS Artifact 包含 DMG 和 ZIP；Windows Artifact 包含 Setup、NuGet package 和 `RELEASES`。
- 仓库文档提供本地命令、host requirement、输出目录和 unsigned warning。
