# 损坏练习数据隔离保存并降级运行

Practice Sidecar 与 Local Playback Resume 按 `ScoreIdentity.contentHash` 分目录保存，写入使用同目录临时文件和原子替换，并在读取时验证 schema 版本与 payload。损坏文件移动为带时间戳的 `.corrupt` 副本，不被静默覆盖；Viewer 使用默认练习状态继续打开谱面并显示一次可恢复警告，恢复位置损坏不得阻止看谱。诊断日志只记录内容 hash、文件类别和稳定错误码，不记录原始谱内容。
