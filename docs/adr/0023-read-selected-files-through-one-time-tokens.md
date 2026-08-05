# 选中文件通过一次性 token 读取

Desktop Shell 使用 `file.select → fileToken → file.readBytes` 两步流程：Main Process 通过系统选择器取得文件，校验扩展名与元数据后只向 Renderer 返回文件名、大小和一次性 opaque token，不暴露真实路径。首版单文件上限为 64 MiB，Renderer 以 token 一次读取完整 `Uint8Array`；成功、取消、窗口关闭或超时都会使 token 失效。只有真实样本证明大小限制或 IPC 内存复制成为问题时，才引入分块或流式协议。（`file.open` 单文件直开 RPC 已随 ADR 0067 删除；Library 导入一律走 `file.select`。）
