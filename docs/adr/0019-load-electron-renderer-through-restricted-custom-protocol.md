# Electron Renderer 通过受限自定义协议加载

Desktop Shell 使用 `tab-viewer://app/` 只读自定义协议加载打包后的 Viewer，不使用权限更宽的 `file://`。协议由当前 `protocol.handle` API 实现，只映射 Renderer 产物目录，拒绝路径穿越，并按 alphaTab 与 SoundFont 的需要显式启用标准、安全、Fetch 和流式资源能力，但不绕过 CSP。Renderer 默认无网络权限，禁止任意导航、弹窗和权限请求；经校验且由用户明确触发的 HTTPS 外链只能交给系统浏览器。
