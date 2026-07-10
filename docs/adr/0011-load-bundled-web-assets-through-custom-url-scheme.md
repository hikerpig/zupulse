---
status: superseded by ADR-0017
---

# 使用自定义 URL Scheme 加载内置 Web 资源

Apple Shell 通过只读自定义 URL Scheme 从 App Bundle 向 WKWebView 提供 Web Core、alphaTab、字体和 SoundFont，不直接使用 `file://`。该方案让 macOS 与后续 iOS 使用一致的资源地址，并集中控制路径校验、MIME 类型、缺失资源错误和缓存；代价是 Shell 必须维护并测试一个最小 `WKURLSchemeHandler`，且该 handler 不能读取 App Bundle 之外的路径。
