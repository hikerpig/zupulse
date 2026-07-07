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

## Native Audio Bridge

Web Viewer Core 到平台原生音频引擎的桥。后续可接 AVAudioEngine、AudioKit 或 TinySoundFont。

## Piano Roll

以时间轴和音高网格展示 MIDI 音符的视图。它比五线谱更接近 MIDI 原始事件，适合作为复杂 MIDI 的可靠降级表达。

## Playback Engine

播放引擎抽象。负责 play、pause、seek、tempo、loop、metronome、count-in 等行为。

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
