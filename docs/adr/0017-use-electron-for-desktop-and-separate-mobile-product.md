# 桌面端采用 Electron，移动端独立设计

Tab Viewer 的当前平台范围调整为 Browser Demo 以及面向 macOS、Windows 的 Electron Desktop Shell，不再以 SwiftUI/WKWebView 同时覆盖 macOS 与 iOS。该选择优先复用现有 TypeScript Viewer 与桌面平台能力，减少近期原生壳层开发；代价是 Electron 不提供 iOS 路径。未来支持 iOS 时，将根据移动端文件、音频、生命周期和交互需求独立设计 Mobile App，不承诺照搬 Desktop Shell。

该决策替代 ADR-0010、ADR-0011、ADR-0012、ADR-0014 和 ADR-0015 中 WKWebView、Apple App Bundle 与 macOS 原生部署相关的决策。ADR-0013 的 Browser/桌面生产入口隔离原则继续有效，ADR-0016 的跨平台文件能力语义继续有效。
