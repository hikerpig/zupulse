# Desktop Shell 使用分层自动化测试

Web Core、Renderer presenter、Bridge schema、Main handler 与持久化逻辑继续由 Vitest 覆盖；Playwright Electron 只验证启动握手、替换系统文件选择器后的打开流程、重启恢复、安全隔离和非法 IPC 等少量跨进程链路。macOS 与 Windows CI 都执行构建、打包和 Electron smoke test，真实音频、系统休眠与原生文件选择器保留人工验收。该分层避免把质量门槛完全建立在仍属实验性的 Electron 自动化接口上。
