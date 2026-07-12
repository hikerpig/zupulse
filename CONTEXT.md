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

**Sheet Library**:
用户在当前设备上持久收藏和管理已导入曲谱的主页，Desktop Shell 与 Browser 各自独立维护本地曲谱库，其内容不依赖外部原文件继续存在。
_Avoid_: 最近文件、Viewer、云曲库

**Sheet Library Repository**:
应用层访问 Sheet Library 的领域持久化端口，用馆藏查询、导入、读取谱文件、更新馆藏信息和彻底删除等领域操作表达能力，不暴露表、键、文件路径或其他存储细节。
_Avoid_: Storage、Key-Value Store、数据库客户端

**Score File Gateway**:
应用层请求用户选择待导入外部谱文件或选择 Library Export 保存位置的宿主端口，不负责馆藏持久化。
_Avoid_: Sheet Library Repository、文件系统路径、存储引擎

**Library Score**:
已导入 Sheet Library 的曲谱，由谱面内容身份、用户可管理的馆藏信息与应用托管的本地文件共同构成；同一 Score Identity 在当前设备的 Sheet Library 中只能对应一个 Library Score，删除它会一并删除对应练习数据。
_Avoid_: Viewer Session、原始文件路径、最近打开项

**Library Score ID**:
标识一个 Library Score 馆藏生命周期的不透明 UUID，独立于谱文件内容；删除后重新导入相同内容会产生新的 Library Score ID。
_Avoid_: Score Identity、内容哈希、Viewer Session ID

**Managed Score Copy**:
宿主在导入时复制到应用本地存储、并作为 Library Score 可持续访问内容的谱文件副本；Desktop Shell 与 Browser 可以使用不同的本地存储机制。
_Avoid_: Score File Reference、外部原文件、缓存

**Browser Library Storage**:
Browser 使用 IndexedDB 保存 Sheet Library 索引、Managed Score Copy 与练习数据的本地存储，可离线使用但可能因用户清理站点数据、隐私模式或浏览器存储策略而丢失。
_Avoid_: 云存储、桌面文件系统、永不丢失的存储

**Library Metadata**:
用户可编辑的 Library Score 馆藏信息，包括显示标题和艺术家；它可以覆盖谱文件的解析值，但不修改 Managed Score Copy 或 Score Identity。
_Avoid_: 谱文件元数据、Practice Sidecar、文件名

**Library Practice Summary**:
Sheet Library 为 Library Score 展示的本机练习摘要，只包含上次练习时间、上次播放位置与是否存在 Loop 等客观状态，不定义练习进度或完成百分比。
_Avoid_: 练习进度、Practice Sidecar、成绩

**Library Import**:
把一份或多份外部谱文件收录为 Library Score 的用户操作；每份文件只有在通过格式检测与最小谱面解析验证后才入库。单文件导入成功后直接进入 Viewer；批量导入中的每份文件独立处理，完成后留在 Sheet Library 并汇总成功、重复与失败结果。
_Avoid_: Open Score Intent、复制文件、同步

**Library Export**:
把 Library Score 的 Managed Score Copy 以原始文件名复制到用户选择位置的操作；它不改写谱内容，也不携带 Library Metadata 或练习数据。
_Avoid_: 曲谱库备份、同步、共享

**Viewer Session**:
一个 Viewer 窗口中当前谱、练习状态与播放状态的临时运行时生命周期边界；首版只有一个窗口和一个活动 Session，但 Session 不属于应用级全局单例，Studio 刷新或恢复时会由 Library Score 重新创建它。
_Avoid_: Desktop Shell、Score Identity、全局当前谱

**Practice Sidecar**:
与谱文件内容身份关联、但不修改原始谱文件的练习数据集合，可随同一份谱在不同设备间恢复。
_Avoid_: 乐谱文件、播放缓存、数据库记录

**Local Playback Resume**:
与谱文件内容身份关联、仅用于当前设备继续上次播放位置的数据，不参与跨设备同步。
_Avoid_: Practice Sidecar、播放历史

**Score Identity**:
由谱文件内容确定的稳定身份，用于把同一份谱与练习数据和本机恢复位置重新关联，不依赖文件名或文件路径；任何内容变化都会产生不同的 Score Identity。
_Avoid_: 文件路径、文件名、谱文件引用

**Score File Reference**:
某台设备上用于再次访问原始谱文件的位置与权限，不代表谱内容本身的身份。
_Avoid_: Score Identity、安全书签

**Persistent File Reference**:
Desktop Shell 可在当前文件选择授权结束后保存并恢复的 Score File Reference；它表达产品能力，不限定平台采用何种机制。
_Avoid_: 安全书签、Score Identity

**Open Score Intent**:
用户通过 Desktop Shell 菜单、系统文件打开事件或双击文件表达的打开谱文件意图；Desktop Shell 将它统一转换为 Library Import，成功后进入对应 Viewer，不建立临时预览曲谱。
_Avoid_: Score File Reference、临时预览、打开文件请求
