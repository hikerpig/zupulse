---
status: proposed
---

# Use a thin SwiftUI and WKWebView shell for iPad

Zupulse 的 iPad 产品采用薄 SwiftUI App Shell，在单个 WKWebView 中运行共享 React Library 与
Viewer。SwiftUI 只拥有应用生命周期、WebView 容器、系统文件交互、音频会话和后续确有需要的
平台能力；Library、Viewer、路由、Transport 与练习控制继续由 `packages/web-viewer` 负责，
不得在 SwiftUI 中复制一套业务界面。App Shell 直接使用原生 WebKit API，不引入 Capacitor；只有
原生能力数量与插件生态需求实际增长后，才重新评估桥接框架。

首个个人使用版本以 iPadOS 17 为最低版本，复用 Browser IndexedDB Repository，并继续通过
`SheetLibraryRepository` 与 `ScoreFileGateway` 隔离宿主能力。该阶段不承诺未来切换原生存储时
无损迁移已有数据，也不承诺后台或锁屏播放；但固定 WKWebView 的持久数据存储与应用资源 origin，
避免普通升级意外创建新的空馆藏。

相比 PWA，该方案提前验证可上架原生产品所需的生命周期、文件与音频集成边界；相比 SwiftUI
重写 Library 或混合两套业务 UI，它最大化复用现有 React 应用并避免跨 Bridge 同步导航和馆藏
展示状态。代价是首版界面不会天然获得全部原生控件行为，且 IndexedDB 仅适合作为个人原型阶段的
持久化选择，正式产品化前必须重新评审数据可靠性、备份与迁移策略。

本决策落实 ADR 0017 所保留的“未来独立设计 Mobile App”方向，但不恢复 ADR 0010–0015 已被取代
的具体 Apple Shell 交付结构；Bridge、资源加载和构建方式仍需在本次 iPad 设计中分别重新确认。
