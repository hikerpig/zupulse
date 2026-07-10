---
status: superseded by ADR-0017
---

# 首条 Apple Shell 最低支持 macOS 14

首条 Apple Shell 以 macOS 14 Sonoma 为最低系统版本，以便使用稳定的现代 SwiftUI 生命周期和 Swift 并发模型，并避免在首次 WKWebView 集成中引入旧系统兼容分支。后续 iOS 单独确定最低版本；如果产品覆盖要求变化，再通过实际用户与维护成本数据评估是否下调 macOS 部署目标。
