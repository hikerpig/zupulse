# Browser 与 Apple 使用独立 Web 入口

Browser Demo 与 Apple Shell 生成独立的 Web 构建入口，同时共享 Viewer 页面、播放控件、presenter、样式和资源配置。Browser 入口保留浏览器文件选择与 mock Bridge；Apple 入口只连接 Native Bridge，连接失败时报告启动错误，不得降级到 mock。该边界避免测试能力进入发布产物，同时防止两套 Viewer UI 随功能演进而分叉。
