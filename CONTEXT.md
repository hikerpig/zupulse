# Tab Viewer

Tab Viewer 是面向乐谱查看与练习的产品上下文，覆盖谱文件导入、乐谱呈现、播放练习以及练习数据恢复。

## Language

**Desktop Shell**:
使用 Electron 承载 Tab Viewer 核心体验的桌面应用外壳，面向 macOS 与 Windows。
_Avoid_: Apple Shell、Native App、Electron Viewer

**Desktop Shell MVP**:
在 macOS 完成 Viewer 交互闭环，并在 Windows 通过构建、自动化 smoke test 和人工核心流程验收的首个桌面版本；只完成 macOS 不构成 Desktop Shell MVP。
_Avoid_: macOS MVP、Electron 原型

**Internal Acceptance Build**:
供团队安装和跨平台验收的 Desktop Shell 构建，首版产出 macOS arm64 与 Windows x64，不具备公开发行所需的正式签名、公证、自动更新或发布支持承诺。
_Avoid_: 正式版、公开 Beta、开发服务器

**Desktop GP Slice**:
首个只开放 Guitar Pro 文件选择、查看与播放练习的 Desktop Shell 竖切；MIDI 文件入口不属于该里程碑。
_Avoid_: Desktop Shell MVP、MIDI Viewer、完整格式兼容矩阵

**Mobile App**:
未来面向 iOS 等移动平台独立设计的产品形态，不承诺复用 Desktop Shell 的运行时或交互结构。
_Avoid_: iOS Shell、Desktop Shell 移植版

**Web Core**:
跨平台共享的乐谱查看与练习核心，不拥有具体平台的文件、存储或同步能力。
_Avoid_: Web App、Viewer 页面

**GP 准入验收**:
开始 Desktop Shell 集成前必须通过的最小真实文件验证，覆盖代表性旧版与现代 GP 文件、中文内容、损坏文件以及核心练习操作；完整格式兼容矩阵不属于该门槛。
_Avoid_: 完整 GP 验收、自动化基线

**Viewer**:
用户打开一份谱文件后进行查看和播放练习的单一工作区；它不包含曲库管理或平台应用生命周期。
_Avoid_: Apple Shell、Web App、曲库

**Viewer Session**:
一个 Viewer 窗口中当前谱、练习状态与播放状态的生命周期边界；首版只有一个窗口和一个活动 Session，但 Session 不属于应用级全局单例。
_Avoid_: Desktop Shell、Score Identity、全局当前谱

**Practice Sidecar**:
与谱文件内容身份关联、但不修改原始谱文件的练习数据集合，可随同一份谱在不同设备间恢复。
_Avoid_: 乐谱文件、播放缓存、数据库记录

**Local Playback Resume**:
与谱文件内容身份关联、仅用于当前设备继续上次播放位置的数据，不参与跨设备同步。
_Avoid_: Practice Sidecar、播放历史

**Score Identity**:
由谱文件内容确定的稳定身份，用于把同一份谱与练习数据和本机恢复位置重新关联，不依赖文件名或文件路径。
_Avoid_: 文件路径、文件名、谱文件引用

**Score File Reference**:
某台设备上用于再次访问原始谱文件的位置与权限，不代表谱内容本身的身份。
_Avoid_: Score Identity、安全书签

**Persistent File Reference**:
Desktop Shell 可在当前文件选择授权结束后保存并恢复的 Score File Reference；它表达产品能力，不限定平台采用何种机制。
_Avoid_: 安全书签、Score Identity

**Open Score Intent**:
用户希望选择并打开一份谱文件的意图；Desktop Shell 负责完成平台文件选择，Viewer 不拥有文件系统权限。
_Avoid_: Score File Reference、打开文件请求
