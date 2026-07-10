---
status: superseded by ADR-0017
---

# Viewer WebView 保持离线并限制导航

Apple Shell 只允许 WKWebView 的顶层页面在内置 `tab-viewer://app/` 资源范围内导航，并拒绝 WebView 内的网络、文件和未知 scheme 导航。只有用户明确点击的 HTTPS 链接可以交给系统默认浏览器；脚本、重定向或弹窗触发的外部导航一律拒绝。该边界保证 Viewer 的离线行为可验证，并避免内置渲染环境演变为具有隐式网络权限的通用浏览器。
