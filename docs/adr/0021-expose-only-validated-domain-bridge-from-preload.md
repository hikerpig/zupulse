# Preload 只暴露经过验证的领域 Bridge

Electron Preload 仅向 Renderer 暴露 `tabViewerBridge.request(message)` 与 `tabViewerBridge.subscribe(listener)` 形式的领域 Bridge，不暴露 `ipcRenderer`、Electron channel 名称或通用 `send`、`invoke`、`on`。允许的消息类型来自共享 Bridge schema，并在 Preload 与 Main Process 两层运行时校验；Main 产生的文件 token 保持 opaque，返回值剥离 Electron event、文件路径、异常对象和 Node 类型。该方案保留统一 RPC/event 合约，同时防止通用 IPC 成为绕过权限边界的后门。
