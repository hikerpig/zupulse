# MusicXML 导入设计

## 状态

当前有效，打开与持久化工作流部分已被取代。

本文的格式识别、兼容性契约、诊断边界、Part/Staff/Voice 映射、不可信输入预算与显示播放权威等解析
与安全约束仍是当前实现的依据。最初“打开乐谱”式的外部文件工作流已由 Sheet Library 管线取代：所有
外部打开统一进入 Library Import（ADR 0047），曲谱以 Managed Score Copy 持久保存（ADR 0040），
Viewer 使用 `libraryScoreId` 路由（ADR 0046），Browser 与 Desktop 各自维护本地 Library
（ADR 0048、ADR 0049）。工作流现状以
[`../features/contracts/sheet-library.md`](../features/contracts/sheet-library.md) 为准；交付顺序背景见
ADR 0036。

## 已确认决策

### 运行时模型所有权

- alphaTab `Score` 是当前 Viewer Session 中 MusicXML 渲染与播放的权威运行时对象。
- 自有 `ScoreDocument` 是跨格式业务投影，不复制完整 MusicXML 或 alphaTab 制谱对象图。
- Viewer、练习、sidecar 和 bridge 通过稳定投影与音乐位置映射工作。
- 具体约束见 ADR 0037。

### 文件入口

首版正式支持：

- `.musicxml`：未压缩的 MusicXML 文档。
- `.mxl`：压缩的 MusicXML 容器。

`.xml` 是通用扩展名，不进入 Library Import：picker 与拖放候选只按 Library 扩展名规则接受 GP、
`.musicxml` 与 `.mxl`，不提供裸 `.xml` 的内容识别入口。

首版不支持包含多部作品的 MusicXML opus 容器。

### 格式识别原则

- 文件选择器过滤器用于引导用户，不作为最终信任边界。
- 导入流程需要区分扩展名提示、容器识别和解析结果。
- `.mxl` 必须作为容器验证，不能仅凭扩展名按普通 XML 读取。
- 内容不是有效 MusicXML 时，返回可恢复的“不受支持或文件损坏”错误，不创建 Library Score。

### 兼容性契约

产品不宣称完整实现 MusicXML 3.1 或 4.0 的全部规范。首版兼容性由核心功能矩阵与真实文件验收语料共同定义。

输入范围：

- 接受当前锁定 alphaTab 版本能够解析的 MusicXML 3.1 与 4.0 文档。
- 覆盖 `score-partwise` 与 `score-timewise`。
- 覆盖标准 `.mxl` 单谱容器。

核心保证范围：

- 音符与休止。
- 小节以及 part、staff、voice 结构。
- 拍号、调号和速度。
- 连音与反复结构。
- 歌词。
- 与上述结构一致的基础播放。

布局坐标、字体、分页等不影响练习的制谱细节可以降级或忽略。影响音高、节奏、结构或播放的语义丢失不能静默视为完全成功，必须进入失败或严重警告路径。

验收语料应包含多个主流制谱工具导出的真实文件，并固定导出工具与版本信息。兼容性结论以锁定的 alphaTab 版本和验收结果为准，而不是仅以 MusicXML `version` 属性为准。

### 导入结果

Library Import 逐项返回显式结果：

- `created`：通过格式探测与最小运行时验证，写入新的 Library Score 与 Managed Score Copy。
- `existing`：相同 Score Identity 已在馆藏中，复用现有 Library Score，不重复占用空间。
- `failed`：附稳定语义错误代码（如 `UNSUPPORTED_FORMAT`、`INVALID_SCORE`、`FILE_TOO_LARGE`），不创建
  Library Score。

失败不改变用户当前打开的乐谱和练习上下文。诊断与导入汇总属于当前导入的展示数据，不写入 Practice
Sidecar；批量导入聚合逐项结果一次展示，不逐条弹窗。

### 诊断边界

首版导入报告只包含能够可靠检测和解释的诊断：

- `.mxl` 容器或 XML 文档结构异常。
- alphaTab importer 抛出的解析异常。
- 空谱、零轨道、零小节或无可播放音符。
- 能够在运行时模型中验证的异常拍号、时值或 tempo。
- 通过解析前后统计能够可靠证明的核心结构明显丢失。
- 已列入风险规则并且能够稳定识别的高风险元素或属性。

首版不实现完整 MusicXML 规范扫描器，也不承诺列出 alphaTab 忽略的每一个布局或制谱细节。无法可靠判断的情况不能生成猜测性警告。

每条诊断至少包含稳定代码、严重级别、面向用户的摘要，以及可选的技术上下文。UI 文案与内部异常文本解耦。

### Part、Staff 与 Voice 映射

- 一个 MusicXML `part` 映射为一个 Viewer track。
- 同一 part 内的多个 staff 保留在该 track 内，例如钢琴的大谱表。
- voice 是 staff 内部的节奏声部，不映射成可独立静音、独奏或选择的 Viewer track。
- `part-group` 首版只投影为可选的分组元数据；alphaTab importer 的 `mergePartGroupsInMusicXml` 保持关闭。
- MusicXML 原始 part ID 可参与来源映射，但 sidecar 不得只依赖来源 ID。领域 track ID 必须在相同文件重新打开后稳定重建。

这套映射优先忠实保留制谱软件中的乐器层级，不把钢琴的左右手 staff 错误拆成两个独立播放轨道。

### 首次显示策略

- 文件包含 1–4 个 part 时，谱面默认显示全部 part。
- 文件包含超过 4 个 part 时，所有 part 仍进入运行时模型和播放；谱面默认只显示第一个非打击乐 part。
- 大型总谱需要显示明确的 part 总数和轨道面板入口，避免用户误以为其他 part 未导入。
- 用户可以选择主显示轨道与附加显示轨道；选择写入 Practice Sidecar 并在下次打开时恢复。
- 首版不通过 part 名称猜测主旋律或主要乐器。

### 书面位置与播放实例

带 repeat 或 jump 的 MusicXML 使用 ADR 0038 定义的双位置模型。批注和 section 绑定 Written Position；播放头、seek、AB 循环和 Local Playback Resume 使用 Playback Occurrence。alphaTab 展开播放顺序，适配层维护二者映射。

### 不可信输入与资源预算

所有 MusicXML 和 MXL 文件均视为不可信输入：

- 读取前限制源文件体积。
- `.mxl` 限制容器入口数量、单入口解压大小和累计解压大小，防止 zip bomb 与资源耗尽。
- XML 解析、文本解码和 alphaTab importer 使用一致且明确的最大解码预算。
- 对 part、measure 和 note 等结构数量设置复杂度上限。
- 超限返回稳定的 `resource-limit-exceeded` 诊断，不归类为普通文件损坏。

具体默认阈值由代表性大型总谱 fixtures、目标设备性能测试和内存观测确定。阈值是应用配置与测试契约，不进入 Practice Sidecar。

### 屏幕重排而非打印保真

MusicXML 在产品中是用于查看与练习的语义乐谱，不是原制谱软件的打印预览：

- 保留音高、节奏、声部、歌词、反复等音乐语义。
- 可以利用有业务意义的 system/page break 提示，但不保证分页与原稿一致。
- 不承诺保留绝对坐标、字体、纸张大小和精确间距。
- 首版不提供与来源制谱软件逐页一致的 PDF 或打印输出。
- 单纯的视觉重排差异不产生导入警告；只有造成音乐语义不可读时才进入诊断。

### 只读与非目标

- 原始 `.musicxml`、`.xml` 或 `.mxl` 文件与 Managed Score Copy 始终只读。
- 循环、速度、批注和轨道显示等练习数据写入 Practice Sidecar，不写回来源文件。
- 首版不编辑音符、节奏、歌词或排版。
- 导入流程本身不提供通用“另存为 MusicXML”或从当前业务投影反向序列化的能力。
- Harmony Analysis Studio 可以按独立规格从原始托管字节生成写有 `<harmony>` 的新副本；它不修改当前馆藏，并负责语义保留未知 MusicXML 元素。
- 除该和弦标注导出外，导入流程不承诺未知或不支持的 MusicXML 元素能够 round-trip 保留。

其他导出能力仍需单独设计完整来源保留、未知元素处理和双向映射，不能直接建立在当前有损的跨格式
业务投影上。和弦标注导出见 [`harmony-analysis-system.md`](harmony-analysis-system.md)。

### Score Identity 与版本关系

- MusicXML Score Identity 继续以来源文件完整字节的 SHA-256 为权威。
- 完全相同的内容在改名或移动后仍恢复同一份 Practice Sidecar。
- 制谱软件重新导出造成字节变化时，即使标题和音乐内容相似，也建立新的 Score Identity。
- 标题、作者和 part 名称等元数据最多用于提示潜在相关版本，不得触发自动 sidecar 合并。
- 未来跨版本练习数据迁移必须由用户确认，并显式报告无法可靠映射的位置数据。

首版不引入 MusicXML 语义指纹或相似度匹配。

### 交付表面

- Desktop Shell 与 Browser Web Demo 都提供持久 Sheet Library 作为正式用户入口（ADR 0048），共享同一
  React Library 与导入管线。
- Web Core 与 Web Viewer 承载共享的格式识别、导入、映射、诊断和展示逻辑。
- Browser 每次导入通过 File API 或拖放获得字节并写入 IndexedDB Library，不引入浏览器持久文件权限。
- 本阶段不扩展移动端入口。

### 统一打开入口

- 所有外部乐谱打开统一进入 Library Import（ADR 0047）：用户从 Library 导入 GP、`.musicxml` 或
  `.mxl`，导入完成后按 `libraryScoreId` 打开 Viewer（ADR 0046）。
- 不存在绕过 Library 的临时预览打开，也没有“最近打开”、文件重新定位或外部文件权限恢复流程；打开
  始终读取 Managed Score Copy。
- 格式检测与专属 adapter 是内部职责，不分裂 Viewer 用户工作流。

## 验收门槛

MusicXML 竖切至少覆盖：

- 简单单声部 `.musicxml`。
- 钢琴双 staff 与多 voice。
- 1–4 个 part 的乐谱，以及超过 4 个 part 的大型总谱。
- `score-timewise` 与 `.mxl`。
- 中途变化的拍号、调号与 tempo。
- repeat、ending、D.C.、D.S. 与 Coda。
- 连音、和弦、歌词与弱起。
- 中文标题、歌词与 part 名称。
- 损坏 XML、损坏 MXL 与伪装扩展名。
- 空谱、超限文件与已知高风险不支持特性。

自动化断言以导入结果、结构摘要、默认显示轨道、可播放性、关键音乐位置映射和诊断代码为主，不使用全量像素截图作为权威金标。少量代表性乐谱保留视觉截图，用于端到端或人工回归。

## Import 执行与取消

- 每次导入动作处理一批候选文件，逐项完成探测、解析与 Repository 提交，并流式更新导入汇总。
- 用户可取消进行中的导入；已完成的候选保留，进行中的候选在写入 Library 前再次检查取消信号，未开始
  的候选不再处理，已取消的结果不写入 Library。
- 用户取消文件选择不改变 Library，也不视为错误。
- 单个文件导入成功后直接打开对应 Library Score；批量导入停留在 Library 并展示汇总。
- 应用退出时取消未完成导入，不写入 Practice Sidecar。

### 加载反馈

导入进行中，Library 禁用新的导入入口并显示逐项更新的导入汇总，区分 `created`、`existing`、`failed`
与被取消的候选。不伪造解析百分比。

## 通用 Open Score 管线

MusicXML 与 GP 共用同一条 Library Import 管线：

`Import Source → File Access → Format Probe → Format Adapter → Repository 提交（pending → ready）`

共享管线拥有文件选择、读取、内容哈希、取消、错误展示和 Library 提交。格式不能只按扩展名分派；
Format Probe 综合扩展名提示、文件 magic、MXL 容器和解析结果。

GP Adapter 与 MusicXML Adapter 只拥有格式专属检查、alphaTab importer 设置、解析、领域投影和诊断。首版定义满足 GP 与 MusicXML 的窄 `ScoreFormatAdapter` 契约，不建设通用第三方插件系统。接口需要为后续 MIDI adapter 允许不同的运行时产物，但不提前抽象 MIDI Analyzer 的全部阶段。

## 显示与播放权威

MusicXML 采用“所见即所练”原则：

- 核心音高、起始位置、时值和 voice 来自可见的 note/measure 结构。
- `<sound>` 等播放提示可以影响 tempo、力度、乐器和导航。
- 播放提示不得造成播放音符与书面谱核心音高或节奏明显不一致。
- 检测到核心显示/播放不一致时，进入严重警告或失败路径，不静默标记为完全成功。
- 首版不提供 notation/performance 两种播放语义切换。

### 可查看但不可播放

如果能够建立可靠的书面谱结构，但无法建立可播放时间轴（adapter 报告 `capabilities.view` 可用而
`capabilities.playback` 不可用），导入仍可创建 Library Score：

- 保留谱面、滚动、缩放和轨道显示。
- 播放、循环、节拍器等依赖可播放时间轴的领域动作禁用并显示就地原因。
- 明确提示当前乐谱可以查看但无法播放。
- “无可播放音符”属于能力降级，不自动等同于导入失败。

只有书面谱结构本身也无法可靠建立（`capabilities.view` 不可用或无有效轨道）时，导入才返回 `failed`。

## 性能验收目标

首版以项目当前主要开发 Mac 为基准设备。常规乐谱定义为不超过 5 MB、20 个 part 和 5 万个 note：

- 从文件字节就绪到首屏可见，P95 不超过 3 秒。
- 播放能力允许在首屏之后继续准备，但总耗时不超过 5 秒。
- 加载期间，取消和再次打开等 UI 操作应在 100 ms 内得到响应。
- 超出常规范围的大型总谱允许更慢，但必须持续展示真实阶段、允许取消，并且不能造成窗口假死。
- Windows x64 内部验收机复用同一 fixtures；具体阈值可以在首轮基准后针对设备性能校准。

先通过代表性 fixtures 建立基准。只有锁定的 alphaTab 版本无法达到目标时，才引入额外 worker 隔离、分阶段解析或渲染优化。
