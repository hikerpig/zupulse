# Electron Renderer 与 Node.js 严格隔离

Desktop Shell 的 Renderer 禁用 Node 集成，启用 context isolation 与 sandbox，并且不能直接导入 Electron、文件系统或数据库能力。Preload 仅通过 `contextBridge` 暴露单一 typed Bridge，Main Process 独占文件选择、文件读取、持久化和系统集成；所有 IPC 必须校验消息类型、payload 与发送来源。该隔离让 Browser Demo 与桌面 Renderer 复用平台无关的 Viewer，同时限制不可信谱内容或渲染缺陷触达操作系统能力。
