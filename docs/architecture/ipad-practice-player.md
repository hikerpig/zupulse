# iPad Practice Player

## Scope

`apps/ipad-shell` 是已交付的个人原型 iPad App：薄 SwiftUI/WKWebView 宿主运行共享 React Library
与 Viewer。它支持本地馆藏、Files 导入、前台播放与恢复；Studio 在 iPad 上保留不可用占位页。

该架构由 ADR 0058–0063 定义。个人原型复用 IndexedDB，不承诺未来切换原生存储时无损迁移；云同步、
后台/锁屏播放与 Studio 分析不在当前范围。

## Ownership and boundaries

- `packages/web-core`：领域、Zod Bridge schema、导入和播放逻辑；不依赖 iPad、React 或 IndexedDB。
- `packages/web-viewer`：共享 React Library/Viewer 与 iPad capability route；只使用 Repository、Gateway
  和 Viewer host ports。
- `packages/web-storage`：IndexedDB `SheetLibraryRepository` 实现；Browser 与 iPad 复用。
- `apps/ipad-shell/web`：iPad Web entry、Bridge transport、Files Gateway 和恢复状态。
- `apps/ipad-shell/app`、`audio`、`bridge`、`files`、`webview`：SwiftUI 壳、Audio Session、单一 RPC、
  一次性文件 token 与受限 WebKit scheme。

## Invariants

- 主页面固定在 `zupulse://app`；资源、Worker、AudioWorklet、字体和 SoundFont 从 App Bundle 提供。
- Swift 与 Web 只通过单一版本化 JSON RPC 通道通信。Zod manifest 是契约事实源；未知版本、方法、字段
  或越界 payload 必须拒绝。
- 曲谱字节不进入 JSON Bridge。Files 只提供 metadata 与一次性 token，Web 经受限二进制 scheme 消费一次；
  不得泄漏绝对路径或 security-scoped URL。
- 顶层导航只允许应用 origin；用户点击的 HTTPS 外链交给 Safari。发布资产和可执行 Web 代码必须随 Bundle
  固定发布，网络请求受 allowlist/CSP 约束。
- 生命周期、后台、音频中断和路由变化只会 pause-and-flush，恢复绝不自动播放。WebContent 重建从持久的
  `libraryScoreId` 与播放状态重建临时 Session。

## Build and verification

- `pnpm ipad:web:build` 生成 Web 资产及 hash manifest；产物不提交。
- Xcode Build Phase 与 `pnpm ipad:verify` 共用资源和 Release 边界校验。
- 完整 Simulator 门禁：`pnpm ipad:verify`。
- M5 真机已验证资源 origin 与初步导入/播放；性能、长稳、完整触控/中断、设备重启和诊断/网络人工验收
  延期至正式产品化前，详见 [iPad Device Acceptance](../validation/ipad-device-acceptance.md)。

## Related documents

- [ADR index](../adr/README.md)（0054–0059）
- [Resource origin evidence](../validation/ipad-resource-origin.md)
- [Simulator acceptance](../validation/ipad-simulator-acceptance.md)
