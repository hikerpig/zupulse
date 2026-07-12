# MusicXML 导入设计

## 状态

设计中。

本文记录 Desktop GP Slice 之后的 MusicXML 导入竖切。交付顺序由 ADR 0036 确定。

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

`.xml` 是通用扩展名，不直接出现在默认文件类型过滤器中。用户通过“所有文件”等入口选择 `.xml` 后，系统可以根据内容识别 MusicXML；扩展名本身不足以判定支持。

首版不支持包含多部作品的 MusicXML opus 容器。

### 格式识别原则

- 文件选择器过滤器用于引导用户，不作为最终信任边界。
- 导入流程需要区分扩展名提示、容器识别和解析结果。
- `.mxl` 必须作为容器验证，不能仅凭扩展名按普通 XML 读取。
- 内容不是有效 MusicXML 时，返回可恢复的“不受支持或文件损坏”错误，不创建 Viewer Session。

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

MusicXML 导入返回显式三态结果：

- `success`：核心语义正常，未发现值得提示的问题。
- `success-with-warnings`：允许创建 Viewer Session，同时提供非阻塞提示和可展开的导入报告。
- `failure`：无法可靠建立音高、节奏、小节结构或播放模型，不创建新的 Viewer Session。

导入采用事务式 Session 切换。只有成功或带警告成功并完成最小运行时验证后，新的 Viewer Session 才替换当前 Session；失败时保留用户当前打开的乐谱和练习上下文。

导入报告属于当前导入和 Viewer Session 的诊断数据，不写入 Practice Sidecar。多个警告聚合展示，不逐条弹窗。

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

- 原始 `.musicxml`、`.xml` 或 `.mxl` 文件始终只读。
- 循环、速度、批注和轨道显示等练习数据写入 Practice Sidecar，不写回来源文件。
- 首版不编辑音符、节奏、歌词或排版。
- 首版不提供“另存为 MusicXML”或修改后导出。
- 导入流程不承诺未知或不支持的 MusicXML 元素能够 round-trip 保留。

未来导出能力需要单独设计完整来源保留、未知元素处理和双向映射，不能直接建立在当前有损的跨格式业务投影上。

### Score Identity 与版本关系

- MusicXML Score Identity 继续以来源文件完整字节的 SHA-256 为权威。
- 完全相同的内容在改名或移动后仍恢复同一份 Practice Sidecar。
- 制谱软件重新导出造成字节变化时，即使标题和音乐内容相似，也建立新的 Score Identity。
- 标题、作者和 part 名称等元数据最多用于提示潜在相关版本，不得触发自动 sidecar 合并。
- 未来跨版本练习数据迁移必须由用户确认，并显式报告无法可靠映射的位置数据。

首版不引入 MusicXML 语义指纹或相似度匹配。

### 交付表面

- Desktop Shell 提供正式用户入口，并与现有文件打开流程集成。
- Web Core 与 Web Viewer 承载共享的格式识别、导入、映射、诊断和展示逻辑。
- Web Demo 只提供开发与验收用 fixture 选择器，不定义为公开 Web 文件导入产品。
- 本阶段不扩展移动端入口，也不引入浏览器持久文件权限设计。

### 统一打开入口

- 用户统一通过“打开乐谱”选择 GP、`.musicxml` 或 `.mxl`。
- MusicXML 不使用暗示复制、转换或写入曲库的独立“导入”入口。
- 最近打开、文件重新定位和权限恢复沿用 Score File Reference 流程。
- 格式检测与专属 adapter 是内部职责，不分裂 Viewer 用户工作流。
- 未来出现本地曲库复制、批量处理或格式转换时，再单独定义“导入”行为。

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

## Import Job 与原子提交

打开流程采用 `latest-intent-wins`：

- 每次 Open Score Intent 创建独立 Import Job。
- 新 Job 到来后，旧 Job 标记为 `superseded`，并尽可能取消未完成的读取、解析和渲染准备。
- 候选乐谱在 Candidate Session 中完成资源检查、解析和最低运行时验证。
- 只有仍为最新的 Job 可以原子替换当前 Viewer Session。
- 已被替代的 Job 即使稍后完成，也不得提交 Session、覆盖最近打开记录或显示错误。
- 用户取消文件选择不改变当前 Session，也不视为错误。
- 应用退出时终止未完成 Job，不写入 Practice Sidecar 或最近打开。

### 加载反馈

加载 UI 展示可验证的阶段，而不伪造解析百分比：

1. 正在读取文件。
2. 正在检查乐谱。
3. 正在解析 MusicXML。
4. 正在准备谱面。
5. 正在准备播放。

只有底层提供真实字节进度时才展示百分比。解析等不可测阶段使用不确定进度；加载层经过短暂延迟后再显示，避免小文件产生闪烁。加载期间保留当前谱面，用户可以取消当前 Import Job。无法中断的底层操作至少必须阻止已取消或 superseded 的结果提交。

## 通用 Open Score 管线

MusicXML 接入时将现有 GP 专属打开流程收敛为：

`Open Score Intent → File Access → Format Probe → Format Adapter → Candidate Session → Atomic Commit`

共享管线拥有文件选择、读取、内容哈希、取消、错误展示、最近打开和 Session 提交。格式不能只按扩展名分派；Format Probe 综合扩展名提示、文件 magic、MXL 容器和解析结果。

GP Adapter 与 MusicXML Adapter 只拥有格式专属检查、alphaTab importer 设置、解析、领域投影和诊断。首版定义满足 GP 与 MusicXML 的窄 `ScoreFormatAdapter` 契约，不建设通用第三方插件系统。接口需要为后续 MIDI adapter 允许不同的运行时产物，但不提前抽象 MIDI Analyzer 的全部阶段。

## 显示与播放权威

MusicXML 采用“所见即所练”原则：

- 核心音高、起始位置、时值和 voice 来自可见的 note/measure 结构。
- `<sound>` 等播放提示可以影响 tempo、力度、乐器和导航。
- 播放提示不得造成播放音符与书面谱核心音高或节奏明显不一致。
- 检测到核心显示/播放不一致时，进入严重警告或失败路径，不静默标记为完全成功。
- 首版不提供 notation/performance 两种播放语义切换。

### 可查看但不可播放

如果能够建立可靠的书面谱结构，但无法建立可播放时间轴，导入以 `success-with-warnings` 创建只读查看 Session：

- 保留谱面、滚动、缩放、批注和轨道显示。
- 禁用播放、循环、节拍器等依赖可播放时间轴的能力。
- 明确提示当前乐谱可以查看但无法播放。
- “无可播放音符”属于能力降级诊断，不自动等同于导入失败。

只有书面谱结构本身也无法可靠建立时，导入才返回 `failure`。

## 性能验收目标

首版以项目当前主要开发 Mac 为基准设备。常规乐谱定义为不超过 5 MB、20 个 part 和 5 万个 note：

- 从文件字节就绪到首屏可见，P95 不超过 3 秒。
- 播放能力允许在首屏之后继续准备，但总耗时不超过 5 秒。
- 加载期间，取消和再次打开等 UI 操作应在 100 ms 内得到响应。
- 超出常规范围的大型总谱允许更慢，但必须持续展示真实阶段、允许取消，并且不能造成窗口假死。
- Windows x64 内部验收机复用同一 fixtures；具体阈值可以在首轮基准后针对设备性能校准。

先通过代表性 fixtures 建立基准。只有锁定的 alphaTab 版本无法达到目标时，才引入额外 worker 隔离、分阶段解析或渲染优化。

## 待确认

- 错误分类、诊断信息和验收 fixtures。
