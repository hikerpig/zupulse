# 内部验收包不收集或上传遥测

Internal Acceptance Build 默认完全离线，不集成遥测、崩溃上报或设备标识，也不自动上传任何诊断数据。Main Process 只写限制大小与保留期的本地结构化日志；Renderer 通过受限 Bridge 提交预定义 Host Diagnostic Event。日志不得包含真实路径、谱内容、文件名或 sidecar payload，仅可记录版本、平台、稳定错误码、耗时和必要的内容 hash 前缀，并提供 Diagnostic Export 让用户自行决定是否分享；开发环境可以保留“打开诊断目录”。公开发布前如需遥测，必须重新作出带告知与退出机制的决策。

生产诊断记录跨信任或持久化边界的失败、进程异常和 `APP_STARTED`。普通成功操作、高频 Bridge 请求、点击、页面浏览、播放位置、暂停次数、曲谱使用频率和其他用户行为不属于 Host Diagnostic Event。
