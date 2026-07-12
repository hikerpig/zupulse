# Viewer 术语表

## App Shell

平台原生应用壳层。macOS 与 iOS 第一版负责文件访问、窗口导航、系统权限、本地存储、同步入口和原生能力桥接。

## Basic Piano Score

从 MIDI 事件量化得到的基础钢琴谱。第一版目标是可练习、可定位、可修正，不追求出版级排版。

## Bridge API

Web Viewer Core 与 Native Shell 之间的通信协议。用于文件访问、sidecar 读写、同步状态、播放状态和平台能力调用。

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

由某份 Raw MIDI、分析参数和算法版本派生的可重算分析结果。它包含量化、拍号推断、左右手分配、异常检测和基础钢琴谱所需信息。

## User Corrections

用户针对 MIDI 分析结果保存的修正或覆盖层。它不改写 Raw MIDI，并且必须能够追溯到目标 Analysis Revision 或稳定的原始音乐位置。

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

一份谱的稳定身份。第一版由内容指纹和格式内元信息共同生成，用于匹配 sidecar。

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
