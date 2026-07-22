# Zupulse 术语表

## Viewer

通过 `#/viewer/:libraryScoreId` 打开的查看与练习工作区。当前不生成、编辑或读取 Studio 的 Harmony Analysis Document；未来若要用于练习，必须先定义独立的发布语义。

## Studio

通过 `#/studio/:libraryScoreId` 打开的分析与编辑工作区。它负责生成、修正、预览、保存和导出 Harmony Analysis Document，并与 Viewer 使用独立 Session。

## Studio Session

Studio 打开某份 Library Score 后创建的临时谱面、分析编辑与预览运行时。它不与 Viewer Session 共享可变运行时对象，也不把 Session ID 写入 URL。

## Preview Transport

Studio 中用于播放、定位、临时速度和区间试听的临时播放状态。它不读取或写入 Practice Sidecar、Local Playback Resume 或练习进度，关闭 Studio 后丢弃。

## App Shell

平台原生应用壳层。macOS 与 iOS 第一版负责文件访问、窗口导航、系统权限、本地存储、同步入口和原生能力桥接。

## iPad Practice Player

规划中的原生 iPad 交付面，以本地 Sheet Library 和 Viewer 前台练习为首版核心。它不是 Desktop
Shell 的全量移植；Studio、后台播放和跨设备同步只有经过独立产品决策后才进入范围。

## Basic Piano Score

从 MIDI 事件量化得到的基础钢琴谱。第一版目标是可练习、可定位、可修正，不追求出版级排版。

## Bridge API

共享 React 应用与受信任平台宿主之间的版本化通信协议。Electron 与 iPad 可以使用不同传输适配器，
但文件访问、生命周期、持久化和其他平台能力不得因此产生不同的领域语义。

## Content Fingerprint

基于文件内容生成的稳定指纹。用于判断不同路径、不同设备上的文件是否是同一份谱。

## GP

Guitar Pro 文件族的统称。第一版支持 `.gp3`、`.gp4`、`.gp5`、`.gpx`、`.gp`。

## GP Adapter

连接 alphaTab 与本项目领域模型的适配层。负责 GP 文件加载、渲染、播放控制和特有技法信息透传。

## Lightweight Sync

轻量同步。只同步 sidecar、收藏、最近打开、练习进度、批注和 MIDI 修正参数，不同步原始谱文件。

## MIDI Analyzer

MIDI 分析模块。负责解析 MIDI 事件、tempo map、轨道、channel、note events，并生成 piano-roll 与基础钢琴谱候选。

## MusicXML Import

把 MusicXML 结构化乐谱接入 Viewer 的导入流程，覆盖格式识别、文件读取、alphaTab 解析、显示、播放和错误处理。它先于 MIDI Analyzer 交付，并用于验证统一 Score Model 对多声部、连音、拍号变化和 repeat 的表达能力。

## MXL

MusicXML 的压缩容器格式，常用扩展名为 `.mxl`。导入时需要验证容器结构并定位其中的乐谱文档，不能把它当作普通 XML 文本读取。

## Raw MIDI

从 MIDI 文件解析出的不可变源事件集合，是 MIDI 内容的事实源。量化、分手、异常检测和制谱推断不得原地修改 Raw MIDI。

## Analysis Revision

由来源谱、分析参数和算法版本派生的一次不可变分析结果。置信度决策阈值属于 Revision 参数且不由 Studio 用户直接调节；重新分析会创建新 Revision，而不是原地改写，并只在完整保存成功后替换 active Revision。MIDI 量化与和弦推断都可以产生 Analysis Revision。

## Harmony Analysis Job

一次可取消的和弦分析计算。重新分析期间继续显示并允许修正当前 active Revision；只有最新且完整成功的 Job 可以结合当时最新的 User Corrections 原子替换 active Revision，失败、取消或被替代的 Job 不得提交。

## Learned Harmony Ranker

随应用发布、离线且确定性运行的和弦候选排序与拒识能力。它接收结构化和声特征与规则候选，
输出候选分数和置信度，不直接生成任意文本标签。模型版本属于 Analysis Revision 的算法版本，
训练/调参与最终评估分组严格隔离。

## User Corrections

用户针对 Analysis Revision 保存的独立修正或覆盖层。它不改写来源谱或原 Revision，并按稳定的 Score Written Range 锚定；只要来源内容不变，重新分析、更换算法参数或调整 Harmony Analysis Scope 都会保留它。

## Harmony Analysis Document

绑定到 Library Score 的可持久化和弦分析聚合。它保存当前 active Analysis Revision 与 User Corrections，但不包含或改写 Managed Score Copy；首版不持久化旧 Revision 历史，重新分析失败或取消时继续保留原 active Revision。

## Harmony Analysis Repository

独立于 Practice Sidecar、按 Library Score 管理 Harmony Analysis Document 的领域端口。分析数据与馆藏生命周期一致，删除 Library Score 时必须一同删除。

## Harmony Analysis Scope

一次和弦分析纳入的 tracks 集合。默认包含全部有音高的非打击乐 tracks，用户可以在 Studio 中调整；Scope 属于 Analysis Revision，改变它会创建新的 Revision。

## Effective Harmony Projection

把来源中已有的和弦、Analysis Revision 与 User Corrections 合成后的当前有效只读结果。同一区间按 User Corrections、来源和弦、算法结果的顺序取值；它可以保留 Unresolved Harmony 区间，Studio 用它预览，导出器只导出其中已确定的结果。

## Effective Harmony Range

Effective Harmony Projection 中一个连续的 Score Written Range，是 Studio 列表、谱面预览和 Harmony Selection 直接操作的对象。它可追溯到用户修正、来源和弦、算法结果或未解决状态；原始 Analysis Revision segment 不是修正后的界面事实。

## Harmony Annotation Target

Studio 预览与导出新增和弦标记时使用的目标 part/staff。它默认指向首个有音高的非打击乐 track 的最上方 staff，属于展示与导出设置，改变它不创建新的 Analysis Revision。

## Chord Symbol

由 root、kind、最高至 13 的 extension、结构化 Chord Degrees 与可选 bass 构成的和弦标签。Studio 通过候选或结构化字段编辑它；首版不把任意文本当作可比较、可重算和可导出的和弦事实。

## Chord Degree

对 Chord Symbol 中某个和弦音级的结构化增加、改变或省略。它用于表达 `b9`、`#9`、`#11`、`b13` 及其组合，而不是为每一种 altered chord 建立独立枚举。

## Spelled Pitch

由字母音名与整数升降记号组成的十二平均律书面音高拼写。等音但拼写不同的 root 或 bass 具有相同声音音高，但属于不同的 Chord Symbol 表达，并会产生不同的 MusicXML。

## No Chord

明确表示某个 Score Written Range 没有和弦的音乐判断，显示为 `N.C.`。它只来自来源标记或用户选择，不能用来表示算法不知道答案。

## Unresolved Harmony

算法因证据不足、候选冲突或置信度低于决策阈值而无法可靠确定 Chord Symbol 的分析状态。它不是 No Chord；Studio 显示候选与原因，用户确认候选使其成为 Harmony Correction 前不把它导出到 MusicXML。

## Harmony Analysis Compatibility

首版 Harmony Analysis 只分析十二平均律音高。含微分音的区间降级为不支持或低置信度，不把微分音量化到最近半音；这不限制来源 MusicXML 的导入和查看。

## Annotated Score Export

把 Effective Harmony Projection 增量写入来源格式与结构后生成的新文件副本。它保持 `.musicxml`、`.xml` 或 `.mxl` 容器、MusicXML 版本以及 partwise/timewise 结构，不修改 Managed Score Copy 或当前 Library Score。

## Functional Harmony Analysis

基于局部调性解释 Roman numeral、重属关系或 T/S/D 功能的独立分析能力。它可以引用已确认的 Chord Symbol，但不属于首版和弦推断、编辑或导出范围。

## Harmony Correction

用户对 Chord Symbol 或 Score Written Range 施加的结构化 User Correction。首版包括替换和弦、重拼写、标记 N.C.、分割、合并和移动边界；它锚定书面区间而非算法 segment ID，重置为来源或算法结果会删除对应 Correction。

## Harmony Selection

Studio 中当前用于导航、高亮和指定编辑目标的临时 Score Written Range。它本身不属于 User Corrections，也不随 Harmony Analysis Document 持久化；谱面定位不会隐式修改分析边界。

## Native Audio Bridge

Web Viewer Core 到平台原生音频引擎的桥。后续可接 AVAudioEngine、AudioKit 或 TinySoundFont。

## Piano Roll

以时间轴和音高网格展示 MIDI 音符的视图。它比五线谱更接近 MIDI 原始事件，适合作为复杂 MIDI 的可靠降级表达。

## Playback Engine

播放引擎抽象。负责 play、pause、seek、tempo、loop、metronome、count-in 等行为。

## Playback Controller

Web Core 中播放练习状态的单一入口。它接收 UI 领域命令，维护 transport、位置、速度、循环和轨道状态，并通过 Playback Engine 驱动具体播放器。

## Loop Region

用户保存的命名 AB 循环区间。音乐位置是权威边界，毫秒位置只作为快速定位缓存；区间可以覆盖全谱默认速度。

## Musical Position

音乐位置的统称。存在书面位置与播放实例两种语义；调用方必须根据批注/谱面交互或播放/恢复用途选择正确类型，不能只传递含义不明的小节与 tick。

## Written Position

附着在书面谱面上的位置，由 track 或 part、小节、拍和 tick 表达。用于批注、section 和谱面选择；反复播放不会复制 Written Position。

## Score Written Moment

全谱级、未展开反复的书面时间点，由小节索引与小节内 tick 偏移表示，不绑定 track。它用于定位和弦分析等跨 track 的结果。

## Score Written Range

由 start 与 end 两个 Score Written Moment 界定的半开书面区间。Harmony Analysis 使用它表达和弦区间，反复播放不会复制该区间。

## Playback Occurrence

某个 Written Position 在展开播放时间轴中的一次具体出现。用于播放头、seek、AB 循环和 Local Playback Resume，以区分反复或跳转造成的多次经过。

## Track Playback State

轨道的显示与播放设置。主显示轨道和附加显示轨道控制谱面渲染，静音、独奏和音量独立控制音频。

## Practice Playback Sidecar

Sidecar 中保存播放练习设置的版本化子结构。第一版保存全谱速度、命名循环、显示轨道、静音和音量，不保存播放位置、transport 或独奏。

## Local Playback Resume

按 Score Identity 保存在本机的上次播放位置。它用于重新打开谱面时恢复阅读进度，不写入 sidecar，也不参与跨设备同步。

## SoundFont

供合成器把乐谱事件转换成音频的采样音色库。第一版从锁定版本的 alphaTab 依赖复制 `sonivox.sf3` 与许可证，并随 Web/App 资源离线分发。

## Playback Timeline

统一播放时间轴。负责映射乐谱时间、真实时间、tempo map、循环区间和当前播放位置。

## Practice Layer

练习层。负责 section、AB 循环、变速、移调、批注、练习进度、轨道设置和 MIDI 修正等用户练习状态。

## Renderer

渲染器。负责把 Score Model 或 source-specific data 展示成 GP 谱面、piano-roll 或基础钢琴谱。

## Score Identity

一份谱的内容身份。当前使用来源完整字节的小写 SHA-256；同一宿主内用于 Library 去重，标题、作者和其他格式内元信息不参与计算。

## Score Import

文件导入入口。负责格式识别、读取文件、生成 Score Identity，并分发到 GP Adapter 或 MIDI Analyzer。

## Score Model

统一乐谱模型。表达 score、track、staff、measure、beat、note、tempo map、time signature、section、播放位置映射和来源扩展信息。

## Sidecar

伴随原始谱文件保存的练习元数据和轻编辑结果。sidecar 不改写原始 GP/MIDI 文件。

## Source-Specific Extension

来源特有扩展信息。用于保留 GP 技法、MIDI 分析状态等无法干净折叠进统一模型的信息。

## Synth Adapter

合成器适配层。把 Playback Engine 的事件输出转给 Web Audio、SoundFont、AVAudioEngine、AudioKit 或其他后端。

## Web Viewer Core

共享 Web 渲染核心。承载 GP 渲染、MIDI 视图、播放跟随、练习交互、sidecar 应用和跨端复用逻辑。

## ViewerSession

Web Core 打开某份谱后的会话对象。它聚合 `ScoreIdentity`、文件来源摘要、平台 capabilities 和 sidecar payload。

## Capability Discovery

Web Core 启动或打开文件前询问 Native Shell 支持哪些能力的过程。第一版能力包括文件访问、SQLite/sidecar 存储、同步 provider 和音频后端。

## MockNativeBridge

Web Core 测试用 Native Bridge。它模拟 capability discovery、文件打开、文件字节读取和事件记录，不代表真实平台实现。
