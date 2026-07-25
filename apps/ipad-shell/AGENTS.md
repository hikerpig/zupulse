# iPad Shell context

## Scope

- SwiftUI/WKWebView 壳承载共享 React Library 与 Viewer；不得在 SwiftUI 重写 Library、Viewer、路由或
  练习业务 UI。
- `web/` 只作为 iPad host entry；共享 UI 修改遵循 `packages/web-viewer/AGENTS.md`，领域与 Bridge schema
  修改遵循 `packages/web-core/AGENTS.md`。
- 当前个人原型复用 IndexedDB；不要在此范围引入原生 Repository、云同步、OPFS、后台/锁屏播放或 Studio。

## Security and data boundaries

- 主页面只能是 `zupulse://app`；WebKit 资源 handler 必须拒绝 host/path traversal/未知 scheme。
- JSON Bridge 只走现有版本化单一 RPC；新增能力必须同步更新 Zod schema、manifest、Swift validator/router、
  Web transport、fixtures 与测试。
- 曲谱字节使用一次性 token 二进制通道，绝不放进 JSON/Base64；不得把路径或 security-scoped URL 传给 Web、
  日志或诊断。
- 顶层导航锁定应用 origin；HTTPS 外链由 Safari 打开，网络请求与 CSP/allowlist/Release 边界测试同步修改。

## Lifecycle and build

- 生命周期、音频中断、后台和 WebContent 重建必须恢复持久 `libraryScoreId`/位置但绝不自动播放。
- Web 资产由 `pnpm ipad:web:build` 生成，`dist/` 不提交；不要在 Xcode 中复制另一套构建逻辑。
- 修改 Swift 或 Xcode：至少运行相关 `pnpm ipad:test -- --only-testing ...`；资源、Bridge、Release 或导航修改：
  运行 `pnpm ipad:verify`。真机结果必须与 Simulator 结果分开记录。

详细架构见 [iPad Practice Player](../../docs/architecture/ipad-practice-player.md) 与 ADR 0054–0059。
