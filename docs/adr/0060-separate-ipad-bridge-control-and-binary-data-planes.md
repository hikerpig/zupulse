---
status: accepted
---

# Separate iPad Bridge control and binary data planes

iPad Bridge RPC 只传输有大小上限、经 schema 校验的 JSON 控制消息，不把曲谱字节编码成 JSON 数组
或 Base64。系统文件选择器只向共享 React 应用返回文件名、大小和一次性 opaque token；Web 侧再通过
受限二进制数据通道读取内容，成功、取消、过期、App Shell 销毁或使用次数耗尽都会使 token 失效，
且任何响应都不得暴露绝对路径或 security-scoped URL。

该方案延续 ADR 0023 的一次性外部文件能力语义，同时承认 Electron structured clone 与 WebKit
消息传输的二进制边界不同。相比直接通过 Bridge 传 `Uint8Array`，控制面与数据面分离避免 Base64
膨胀和多份大对象复制，并为后续分块或流式读取保留演进路径；代价是必须单独设计 token URL、
生命周期、并发读取、失败与取消协议。受限自定义 URL scheme 与其他具体传输方式由后续决策确定。

## Acceptance scope

2026-07-24 以一次性 token、security-scoped Files 读取和二进制 scheme 的自动化覆盖，以及 M5 真机
导入并播放验证为依据接受。尚未完成的性能与长期设备验收不允许退回为经 JSON 传输曲谱字节。
