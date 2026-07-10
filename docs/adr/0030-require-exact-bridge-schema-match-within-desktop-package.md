# 同包组件要求 Bridge schema 精确匹配

Desktop Shell 启动握手包含应用版本、Bridge schema 版本、Renderer 构建 hash 与 capabilities；同一安装包中的 Main、Preload 和 Renderer 必须使用完全相同的 Bridge schema 版本，否则以启动级致命错误拒绝运行。Capability 仅表达平台已实现的可选功能，不用于掩盖协议不兼容；开发模式也执行相同校验。只有未来出现独立更新 Renderer 的真实需求时，才设计协议兼容窗口。
