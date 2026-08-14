---
status: accepted
---

# Compose Application Settings by host capability

Zupulse 使用共享的 Application Settings UI 组合各宿主真正拥有的设置能力，但不建立通用 key-value settings
registry。语言、主题与 Recognition Provider Configuration 继续由各自的宿主和类型化 schema 持有；Desktop Main
持有 Local Recognition Engine 的真实路径、持久化和 preflight，Renderer 只接收 capability、opaque selection token
与安全状态。独立 `pdf-omr-cli` 保留环境变量接口，Desktop 产品不读取或导入这些变量。未来 Web Remote
Recognition Service 必须作为新的显式 provider capability 接入，并单独定义认证、上传与隐私边界，而不是把远程
字段预埋进当前本地配置。

该选择让 Browser 与 Desktop 共享稳定的信息架构，同时避免一个可装入任意路径、secret 或插件字段的配置容器
穿透宿主边界。代价是每个新增 category/provider 都必须增加 schema、host port、capability、持久化适配和测试，
不能仅靠运行时 metadata 自动生成。
