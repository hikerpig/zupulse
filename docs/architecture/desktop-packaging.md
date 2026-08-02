# Desktop 打包

Zupulse Desktop 使用 Rspack 构建 Main、Preload 和 Renderer，再由 Electron Forge 生成内部验收产物。
当前只支持 macOS Apple Silicon `arm64` 和 Windows `x64`，所有产物均未签名。

## 本地环境

- Node.js 22。
- pnpm 9.3.0。
- macOS 产物必须在 Apple Silicon Mac 上构建。
- Windows 产物必须在 Windows x64 上构建。
- 首次构建前在仓库根目录运行 `pnpm install --frozen-lockfile`。

本地流程不支持 cross-build。macOS 不生成 Intel 或 Universal 产物，Windows 不生成 ARM 或 32-bit
产物。

## macOS arm64

在 Apple Silicon Mac 的仓库根目录运行：

```sh
pnpm desktop:make:mac
```

命令依次执行 production build、`electron-forge make --platform=darwin --arch=arm64`、package
content verification，并使用 macOS 自带的 `hdiutil` 从已校验的 `.app` 生成 DMG。结果位于：

```text
apps/desktop-shell/out/make/dmg/arm64/
apps/desktop-shell/out/make/zip/darwin/arm64/
```

## Windows x64

在 Windows x64 PowerShell 的仓库根目录运行：

```powershell
pnpm desktop:make:win
```

命令依次执行 production build、`electron-forge make --platform=win32 --arch=x64` 和 package content
verification。Squirrel 结果位于：

```text
apps/desktop-shell/out/make/squirrel.windows/x64/
```

目录中包含 Setup executable、NuGet package 和 `RELEASES` metadata。

## 手动 GitHub Actions

打开仓库的 Actions 页面，选择 `Package Desktop`，点击 `Run workflow`。该 workflow 只配置
`workflow_dispatch`，push、pull request 和 tag 都不会自动触发。

也可以在该 workflow 已进入默认分支后使用 GitHub CLI 触发：

```sh
gh workflow run package-desktop.yml
```

完成后分别下载：

- `zupulse-macos-arm64-unsigned`
- `zupulse-windows-x64-unsigned`

## 未签名限制

macOS 产物没有 code signing 或 notarization，Windows 产物没有 Authenticode signature。Gatekeeper
或 SmartScreen 可能阻止普通方式启动，因此这些文件仅用于内部验收，不是公开发布包。当前 workflow
不读取任何签名 credential 或 secret。
