# Zupulse（逐拍）产品上下文

Zupulse 是本地优先的乐谱查看与练习应用。当前交付面是共享 React Viewer、Browser Demo
和 Electron Desktop Shell；Browser 与 Desktop 分别维护独立的本地 Sheet Library。

## 当前范围

- 导入 Guitar Pro、MusicXML 与 MXL，保存应用托管副本，并从 Library Score 打开 Viewer 或 Studio。
- 提供乐谱呈现、播放、变速、循环和本机练习状态恢复。
- 在独立 Studio 中推断、修正和预览 MusicXML 和弦符号，并按来源容器导出带和弦的新副本。
- Browser 使用 IndexedDB；Desktop 使用 SQLite 与应用数据目录中的托管文件。
- 当前不实现云同步、OPFS、打印分页、额外状态库、移动端产品或 MIDI 分析。
- Viewer 已按 ADR 0064 提供 Continuous Follow、Page Turn 和临时 Screen Score Page；适用的钢琴谱
  可在当前 Viewer Session 中打开琴键引导。

## 核心语言

- **Sheet Library**：当前设备持久保存和管理已导入曲谱的主页。
- **Library Score**：内容身份、馆藏元数据、托管文件和练习归属组成的馆藏实体。
- **Library Score ID**：标识馆藏生命周期的 UUID；删除后重新导入会产生新 ID。
- **Score Identity**：小写 SHA-256 内容哈希；同一设备内用于原子去重。
- **Managed Score Copy**：导入时写入应用本地存储、之后不依赖外部原文件的字节副本。
- **Sheet Library Repository**：管理馆藏查询、导入、读取、更新和彻底删除的领域端口。
- **Score File Gateway**：请求用户选择导入文件或选择导出位置的宿主端口，不管理馆藏。
- **Viewer**：通过 `#/viewer/:libraryScoreId` 打开的查看与练习工作区；当前不读取 Studio 的 Harmony Analysis Document。
- **Studio**：通过 `#/studio/:libraryScoreId` 打开的分析、编辑、预览、保存与导出工作区；Harmony Analysis Document 只在这里生效。
- **iPad Practice Player**：规划中的原生 iPad 交付面，以本地 Sheet Library 和 Viewer 前台练习为
  首版核心；它不是 Desktop Shell 的全量移植，Studio、后台播放和跨设备同步需独立进入产品范围。
- **Viewer Session**：Viewer 中临时的谱面、播放和练习运行时；URL 不保存 Session ID。
- **Host Diagnostic Event**：App Shell 记录的一条隐私安全、结构化运行事实，用于离线排查宿主、Bridge、持久化或生命周期故障；它不是 `ImportDiagnostic`、Harmony diagnostic 或产品行为遥测。
- **Diagnostic Export**：用户明确发起生成的本地诊断资料副本，包含经过验证的 Host Diagnostic Event 与安全环境摘要，由用户自行交给开发者离线排查；它不触发自动上传，也不是应用内日志查看器。

### Current Viewer navigation language

- **Score Navigation Mode**：当前设备的 Viewer 阅读偏好，选择 Continuous Follow Mode 或 Page Turn Mode；它不属于某份曲谱的 Practice Sidecar。首次使用时 iPad 默认翻页，Desktop 与 Browser 默认连续跟随，之后不因视口变化自动切换。
- **Continuous Follow Mode**：Viewer 的逐行谱面跟随模式；当前行保持稳定，播放头跨行时用短动画把新行定位到视口上部并保留预读内容，减少动态效果时直接定位。
- **Screen Score Page**：翻页练习模式中由当前 Viewer 可视区域容纳的若干完整谱表行组成的布局投影；它不是持久页码、打印纸张分页或单行横向长卷。重分页保留播放头或浏览锚点，单条超高谱表行可在页内有限滚动。
- **Page Turn Mode**：Viewer 的离散谱面跟随模式；页内保持静止，播放或用户导航跨越 Screen Score Page 边界时整页切换。
- **Score Follow State**：Viewer 谱面导航相对播放头的会话态；Following 时随播放位置自动滚动或翻页，手动浏览进入 Detached。明确 seek、停止或“回到播放位置”恢复 Following，单独播放或暂停不改变它。
- **Scrub Preview**：用户拖动播放进度时对最新目标位置的临时视觉预览；它按动画帧合并更新 alphaTab 游标与目标行或页，不写入正式播放状态，松手后才提交 seek。

### Current session and practice language

- **Piano Key Visualization**：适用钢琴谱的会话级练习投影，在乐谱下方显示当前发声琴键与未来四个
  四分音符内的目标音和时值；默认关闭，不写入 Practice Sidecar。
- **Studio Session**：Studio 中临时的谱面、分析编辑与预览运行时；与同一 Library Score 的 Viewer Session 不共享可变运行时对象。
- **Preview Transport**：Studio 中用于播放、定位和区间试听的临时播放状态；关闭 Studio 后丢弃，不读写练习数据或续播位置。
- **Practice Sidecar**：Library Score 的练习设置；删除馆藏时必须一同删除。
- **Local Playback Resume**：当前设备的续播位置；不属于跨设备同步能力。
- **Harmony Analysis Document**：绑定到 Library Score 的可持久化和弦分析聚合，由当前 active Analysis Revision 与独立的 User Corrections 组成，不改写托管谱文件；首版不持久化 Revision 历史。
- **Harmony Analysis Repository**：独立于 Practice Sidecar、按 Library Score 管理 Harmony Analysis Document 的领域端口；删除馆藏时必须一同删除分析数据。
- **Harmony Analysis Scope**：一次和弦分析纳入的 tracks 集合；默认包含全部有音高的非打击乐 tracks，用户可以调整，且结果必须记录在 Analysis Revision 中。
- **Analysis Revision**：由来源谱、算法版本和分析参数派生的一次不可变分析结果；置信度决策阈值属于 Revision 参数，重新分析会创建新 Revision，并只在完整保存成功后替换 active Revision。
- **Harmony Analysis Job**：一次可取消的和弦分析计算；重新分析期间保留当前 active Revision 与 Corrections，只有最新且完整成功的 Job 可以原子替换 active Revision。
- **User Corrections**：用户按 Score Written Range 对 Analysis Revision 保存的独立修正层；它不修改来源谱或原 Revision，并在来源内容不变时跨 Revision 保留。
- **Effective Harmony Projection**：把来源和弦、Analysis Revision 与 User Corrections 合成后的当前有效只读结果；同一区间按 User Corrections、来源和弦、算法结果的顺序取值，供预览和导出使用，并可保留 Unresolved Harmony 区间。
- **Effective Harmony Range**：Effective Harmony Projection 中一个连续的 Score Written Range，是 Studio 列表、谱面预览和 Harmony Selection 直接操作的对象；它可追溯到用户修正、来源和弦、算法结果或未解决状态。
- **Score Written Moment**：全谱级、未展开反复的书面时间点，由小节索引与小节内 tick 偏移表示，不绑定 track。
- **Score Written Range**：由两个 Score Written Moment 界定的半开书面区间，用于定位全谱级和弦结果。
- **Harmony Annotation Target**：Studio 预览与导出新增和弦标记时使用的目标 part/staff；默认是首个有音高的非打击乐 track 的最上方 staff，改变它不触发重新分析。
- **Chord Symbol**：由 root、kind、最高至 13 的 extension、结构化 Chord Degrees 与可选 bass 构成的和弦标签；首版不把任意文本当作可导出的和弦事实。
- **Chord Degree**：对和弦音级的结构化增加、改变或省略，可表达 `b9`、`#9`、`#11`、`b13` 及其组合。
- **Spelled Pitch**：由字母音名与整数升降记号组成的十二平均律书面音高拼写；等音但拼写不同的 root 或 bass 属于不同的 Chord Symbol 表达。
- **No Chord**：明确表示某个 Score Written Range 没有和弦的音乐判断，显示为 `N.C.`；它只来自来源标记或用户选择。
- **Unresolved Harmony**：算法因证据不足、候选冲突或置信度低于决策阈值而无法可靠确定和弦的分析状态；它不是 No Chord，用户确认候选前不导出到 MusicXML。
- **Functional Harmony Analysis**：基于局部调性解释 Roman numeral 或 T/S/D 功能的独立分析能力；它不属于首版 Chord Symbol 推断范围。
- **Harmony Correction**：用户对和弦标签或 Score Written Range 施加的结构化修改，包括替换、重拼写、N.C.、分割、合并和移动边界；它锚定书面区间而非算法 segment ID，重置会删除对应 Correction。
- **Harmony Selection**：Studio 中当前用于导航、高亮和指定编辑目标的临时 Score Written Range；它本身不属于 User Corrections，也不随 Harmony Analysis Document 持久化。
- **Harmony Analysis Compatibility**：首版只分析十二平均律音高；含微分音的区间降级为不支持或低置信度，不把微分音量化到最近半音。
- **Learned Harmony Ranker**：随应用发布、离线且确定性运行的和弦候选排序能力；frequency ranker 构造 Top-8，Primary Harmony Reranker 在冻结的 Score Written Range 上从 Top-8 选择 Chord Symbol。它们只处理结构化特征和候选，不直接生成任意和弦文本，训练集与最终评估集严格隔离。
- **Primary Harmony Reranker**：在规则 boundary、短片段抑制和合并完成后，从最终 Top-8 中选择 primary Chord Symbol 的量化小型 MLP；它不改变 range，不把 model logit 当作 confidence，产品只运行 TypeScript 推理。
- **Annotated Score Export**：把 Effective Harmony Projection 增量写入来源格式与结构后生成的新文件副本；它保持来源容器，不修改 Managed Score Copy 或当前 Library Score。
- **Bridge API**：共享 React 应用与受信任平台宿主之间经版本化 schema 校验的 RPC/事件边界；
  Electron 与 iPad 使用不同传输适配器，但不得创造不同的领域语义。

完整术语见 `docs/architecture/glossary.md`。当前架构和决策入口见
`docs/architecture/README.md`；若历史文档与本页冲突，以根 `AGENTS.md` 的事实源顺序处理。
