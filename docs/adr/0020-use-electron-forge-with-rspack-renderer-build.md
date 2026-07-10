# Electron Forge 管理桌面打包，Rspack 构建 Renderer

Desktop Shell 使用 Electron Forge 负责 package、平台安装包、图标以及后续 macOS/Windows 签名，继续使用仓库现有 Rspack 构建 Browser Demo 与 Electron Renderer；Main Process 和 Preload 由 TypeScript 构建。Forge hook 调用统一生产构建脚本，不引入第二套 Renderer bundler。首条竖切允许生成未签名开发包，签名与公证配置预留但不阻塞功能验收，所有 `out/` 等生成产物均不提交 Git。
