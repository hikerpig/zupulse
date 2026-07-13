# Zupulse（逐拍）产品上下文

Zupulse 是本地优先的乐谱查看与练习应用。当前交付面是共享 React Viewer、Browser Demo
和 Electron Desktop Shell；Browser 与 Desktop 分别维护独立的本地 Sheet Library。

## 当前范围

- 导入 Guitar Pro、MusicXML 与 MXL，保存应用托管副本，并从 Library Score 打开 Studio。
- 提供乐谱呈现、播放、变速、循环和本机练习状态恢复。
- Browser 使用 IndexedDB；Desktop 使用 SQLite 与应用数据目录中的托管文件。
- 当前不实现云同步、OPFS、分页、额外状态库、移动端产品或 MIDI 分析。

## 核心语言

- **Sheet Library**：当前设备持久保存和管理已导入曲谱的主页。
- **Library Score**：内容身份、馆藏元数据、托管文件和练习归属组成的馆藏实体。
- **Library Score ID**：标识馆藏生命周期的 UUID；删除后重新导入会产生新 ID。
- **Score Identity**：小写 SHA-256 内容哈希；同一设备内用于原子去重。
- **Managed Score Copy**：导入时写入应用本地存储、之后不依赖外部原文件的字节副本。
- **Sheet Library Repository**：管理馆藏查询、导入、读取、更新和彻底删除的领域端口。
- **Score File Gateway**：请求用户选择导入文件或选择导出位置的宿主端口，不管理馆藏。
- **Viewer Session**：Studio 中临时的谱面、播放和练习运行时；URL 不保存 Session ID。
- **Practice Sidecar**：Library Score 的练习设置；删除馆藏时必须一同删除。
- **Local Playback Resume**：当前设备的续播位置；不属于跨设备同步能力。
- **Bridge API**：Renderer 与 Electron Main 之间经版本化 Zod schema 校验的 RPC/事件边界。

完整术语见 `docs/architecture/glossary.md`。当前架构和决策入口见
`docs/architecture/README.md`；若历史文档与本页冲突，以根 `AGENTS.md` 的事实源顺序处理。
