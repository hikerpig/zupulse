# MusicXML 导入验收

## 当前兼容矩阵

- 支持 `.musicxml`、通用 `.xml` 内容探测、标准单谱 `.mxl`。
- 覆盖 `score-partwise`、`score-timewise`、多 part、part 内多 staff、歌词、repeat 与中文元数据的确定性 fixture。
- Score Identity 使用原始完整字节 SHA-256；失败不会产生 Candidate Session。
- 1–4 part 默认全部显示，超过 4 part 默认首个非打击乐 part。
- alphaTab master bar 通过 `duration` 或 `calculateDuration()` 投影非零播放时间轴；当前 accepted fixtures
  必须同时具备 view 与 playback capability。
- 无可靠播放时间轴时降级为 view-only，并返回稳定 warning。

## 安全边界

Desktop Main 保持普通文件检查、一次性 token 与 64 MiB 源文件上限。Web Core 对 XML 的 part/measure/note 数量和解码量设限；MXL 预算为 256 entries、单 entry 32 MiB、累计 64 MiB。诊断仅允许稳定 code、耗时和最多 16 字符的 hash 前缀。

## alphaTab 1.8.4 已知边界

本产品不保证打印排版保真、opus、多作品容器、编辑、回写或未知 MusicXML 元素 round-trip。alphaTab importer 不能建立播放时间轴时只提供查看能力。

## 性能与跨平台

`pnpm benchmark:musicxml` 记录读取及预检 P95；首屏与播放就绪由 Desktop E2E/人工验收记录。macOS 是当前自动化基线。Windows x64 的首屏 ≤3 秒、播放就绪 ≤5 秒仍需在内部验收机校准，不能用本机结果代替。
