# Viewer UI 全部由共享 Renderer 绘制

Desktop Shell 的 Main Process 只拥有原生应用菜单、系统文件选择器和窗口生命周期；标题区、打开入口、播放控制、轨道面板、循环与可恢复错误等产品界面全部由 `packages/web-viewer` Renderer 绘制。原生菜单命令通过 Bridge 转换为 Viewer command，不创建独立原生 toolbar。该边界让 Browser Demo 与 Desktop Shell 复用同一产品 UI，只在快捷键和菜单惯例上保留平台差异。
