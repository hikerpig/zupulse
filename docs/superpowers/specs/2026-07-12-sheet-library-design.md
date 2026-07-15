# Sheet Library 离线曲谱库设计

## 目标

Tab Viewer 以 Sheet Library 作为首页，用户导入的 Guitar Pro、MusicXML 与 MXL 文件会成为当前设备上可离线访问的 Library Score。用户从 Library 选择曲谱后进入 Viewer 查看和练习。

Desktop Shell 与 Browser 共享产品语义、领域契约和 React UI，但各自独立维护本地曲谱库：

- Desktop Shell 使用 SQLite 与应用数据目录中的托管文件。
- Browser 使用 IndexedDB 同时保存索引、谱文件字节与练习数据。

本设计不实现云同步，也不定义 Browser 与 Desktop 之间的本地迁移包。

## 产品原则

1. **导入就是收藏**：所有外部打开入口都进入 Library Import，不存在关闭后消失的临时预览。
2. **导入后不依赖原文件**：宿主保存 Managed Score Copy，外部原文件被移动或删除不影响馆藏。
3. **相同内容只收藏一次**：当前设备上一个 Score Identity 只对应一个 Library Score。
4. **馆藏身份与内容身份分离**：Library Score ID 是 UUID，Score Identity 是内容哈希。
5. **删除意味着彻底清除**：删除 Library Score 同时删除托管文件、馆藏信息、全部练习数据和派生分析数据。
6. **存储错误不得导致静默数据丢失**：schema 迁移失败、托管文件缺失或数据损坏时保留已有数据并报错，不自动重建曲谱库。

## 范围

### MVP

- 单文件与批量导入。
- 按内容哈希去重。
- 标题与艺术家搜索。
- 全部/收藏筛选。
- 最近活动、最近导入、最近练习和标题排序。
- 收藏。
- 编辑馆藏标题和艺术家，不改写谱文件。
- 单项导出原始谱文件。
- 单项彻底删除。
- 从 Library 打开 Viewer，并恢复上次练习状态。
- Desktop 与 Browser 独立离线持久化。

### 非目标

- 云同步、账号、跨设备冲突或删除传播。
- Browser/Desktop 曲谱库迁移包。
- 标签、文件夹、歌单或集合。
- 列表/卡片视图切换。
- 多选、批量删除或批量导出。
- 回收站。
- 曲谱版本关系、替换曲谱或跨版本练习数据迁移。
- 练习进度百分比。
- Browser OPFS 存储。

## 用户流程

### 冷启动

应用冷启动始终进入 `/` Sheet Library，不自动恢复上次 Viewer。默认按“最近活动”排序：

```text
activityAt = max(importedAt, lastOpenedAt)
```

编辑元数据和切换收藏不改变 `activityAt`。

### 单文件导入

1. 用户点击“导入曲谱”或触发系统 Open Score Intent。
2. Score File Gateway 获得一份外部文件。
3. 共享导入用例校验大小、探测格式、计算 Score Identity、执行最小解析并提取默认元数据。
4. Repository 原子创建 Library Score；如内容已存在，返回已有 Library Score。
5. 导入成功或命中重复时直接进入 `/viewer/:libraryScoreId`。
6. 用户取消选择时不改变当前路由和馆藏。

### 批量导入

每份文件独立处理，不因一份文件失败回滚其他成功项。完成后留在 Library，新导入项按最近活动排在前面，并显示一次汇总：

```text
已导入 17 份曲谱
2 份无法读取
1 份已存在
```

失败详情可展开查看文件名和结构化原因，不逐个弹窗。

### 打开 Viewer

点击列表行导航到 `/viewer/:libraryScoreId`。Viewer 页面使用 Library Score ID 重新读取 Managed Score Copy 并创建临时 Viewer Session。刷新页面或恢复 URL 时可重建 Session；Session ID 不进入 URL。

Viewer 顶部提供：

- 返回曲谱库。
- 馆藏标题与艺术家。
- “已保存到本机”状态。
- 导出原始文件。

Viewer 不提供删除入口；独立 Studio 同样不提供删除入口。

### 编辑馆藏信息

列表行菜单提供“编辑信息”。用户编辑的是 Library Metadata，不改写谱文件，不改变 Score Identity。

显示值优先级：

```text
用户自定义标题 > 谱内标题 > 去扩展名文件名
用户自定义艺术家 > 谱内艺术家 > 未知艺术家
```

### 导出

Library 行菜单与 Viewer 菜单提供“导出原始文件…”。Repository 读取 Managed Score Copy，Score File Gateway 请求保存位置。导出使用原始文件名，不嵌入 Library Metadata、练习数据或分析数据。Studio 的“导出带和弦的副本”由独立 Harmony Analysis Studio 规格定义。

### 删除

删除只从 Library 行菜单发起。确认框必须显示曲名，并明确“曲谱文件、练习数据和分析数据将被永久删除”。确认后原子删除：

- Managed Score Copy。
- Library Score 和 Library Metadata。
- Practice Sidecar。
- Local Playback Resume。
- Library Practice Summary。
- Harmony Analysis Document。

日后重新导入字节内容相同的文件会创建新 Library Score ID，且不恢复旧练习数据。

## Library 界面

### 布局

Library 采用紧凑的桌面列表，不使用虚构专辑封面的卡片网格。视觉延续现有暖灰和珊瑚色工作台系统，让 Library 像排练目录而不是后台仪表盘。

```text
┌─────────────────────────────────────────────────────────┐
│ Tab Viewer                 [搜索曲名或艺术家] [导入曲谱] │
│                                                         │
│ 曲谱库   全部  收藏                 排序：最近活动  │
├─────────────────────────────────────────────────────────┤
│ [谱]  Treasure                 GP5      昨天·第 24 小节 ☆ ⋯ │
│      Bruno Mars · 04:12                               │
├─────────────────────────────────────────────────────────┤
│ [谱]  Canon in D                MXL      尚未练习      ★ ⋯ │
│      Johann Pachelbel                                   │
└─────────────────────────────────────────────────────────┘
```

每行展示：

- 简洁谱页/格式标记。
- 标题、艺术家、时长和格式。
- 上次练习时间、上次播放小节和 Loop 存在状态。
- 收藏按钮和行菜单。

不显示练习进度百分比。小窗口下优先保留标题、艺术家与上次练习状态，隐藏格式和时长。

### 空状态

```text
你的曲谱会保存在这台设备上
支持 Guitar Pro、MusicXML 和 MXL，导入后可离线使用。

[导入第一份曲谱]
```

Browser 版在辅助文案中说明站点数据被清理时曲谱库也会被删除，不宣称永不丢失。

### 列表状态

- **Loading**：显示与列表密度相同的骨架行。
- **No results**：保留搜索和筛选，提供清除条件，不显示导入空状态。
- **Importing**：导入按钮显示进行中状态；已有列表仍可阅读。
- **Repository unavailable**：显示不会清除数据的阻塞错误页。
- **Managed copy missing/corrupt**：保留列表项，进入 Viewer 或 Studio 时显示恢复错误，提供导出（若仍可读）和返回 Library。

### 可访问性

- 列表使用语义列表/表格结构，不用只有 `onClick` 的 `div`。
- 行主链接、收藏和菜单是独立的键盘可访问控件。
- 删除确认框管理初始焦点、焦点圈定和关闭后焦点恢复。
- 批量导入汇总使用 `role="status"`，详情可键盘展开。
- 状态不只依靠颜色。

## 领域模型

```ts
type LibraryScoreId = string; // UUID
type ScoreIdentity = string; // lowercase SHA-256 hex

type LibraryMetadata = {
  titleOverride?: string;
  artistOverride?: string;
};

type LibraryPracticeSummary = {
  lastPracticedAt?: string;
  lastPosition?: MusicalPosition;
  hasLoop: boolean;
};

type LibraryScoreSummary = {
  id: LibraryScoreId;
  scoreIdentity: ScoreIdentity;
  fileName: string;
  format: ScoreFormat;
  title: string;
  artist?: string;
  durationMs?: number;
  importedAt: string;
  lastOpenedAt?: string;
  isFavorite: boolean;
  practice: LibraryPracticeSummary;
};

type LibraryScore = LibraryScoreSummary & {
  parsedTitle?: string;
  parsedArtist?: string;
  metadata: LibraryMetadata;
};

type StoredScoreFile = {
  fileName: string;
  bytes: Uint8Array;
};

type ValidatedLibraryScoreDraft = {
  id: LibraryScoreId;
  scoreIdentity: ScoreIdentity;
  file: StoredScoreFile;
  format: ScoreFormat;
  parsedTitle?: string;
  parsedArtist?: string;
  durationMs?: number;
  importedAt: string;
};
```

`Library Practice Summary` 是 Practice Sidecar 与 Local Playback Resume 的查询投影，不是另一份可独立修改的练习事实。

## 应用端口

### SheetLibraryRepository

```ts
interface SheetLibraryRepository {
  initialize(): Promise<void>;
  list(): Promise<readonly LibraryScoreSummary[]>;
  get(id: LibraryScoreId): Promise<LibraryScore | undefined>;
  findByIdentity(identity: ScoreIdentity): Promise<LibraryScore | undefined>;

  add(
    draft: ValidatedLibraryScoreDraft,
  ): Promise<{ status: "created"; score: LibraryScore } | { status: "existing"; score: LibraryScore }>;

  readScore(id: LibraryScoreId): Promise<StoredScoreFile>;
  updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore>;
  setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void>;
  markOpened(id: LibraryScoreId, openedAt: string): Promise<void>;
  delete(id: LibraryScoreId): Promise<void>;
}
```

端口不暴露：

- 表名、object store 名、通用 key-value 操作。
- 绝对路径、Electron file token 或 IndexedDB key。
- 具体迁移、事务或 staging 状态。
- 搜索和排序查询。

`add` 必须以 Score Identity 唯一约束处理并发导入，不能依赖先 `findByIdentity` 再写入的非原子检查。`delete` 必须同时清除馆藏、文件与练习数据。

### ScoreFileGateway

```ts
type ScoreImportSource = {
  fileName: string;
  readBytes(): Promise<Uint8Array>;
};

interface ScoreFileGateway {
  selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]>;
  saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled">;
}
```

`ScoreImportSource` 在应用层不暴露路径。Browser adapter 可在闭包中持有 `File`；Desktop adapter 可在闭包中持有一次性 file token，`readBytes()` 经 Bridge 消费 token。

### 导入用例

```ts
type ImportItemResult =
  | { status: "created"; score: LibraryScore }
  | { status: "existing"; score: LibraryScore }
  | { status: "failed"; fileName: string; error: LibraryImportError };

type LibraryImportError =
  | { code: "FILE_TOO_LARGE" }
  | { code: "UNSUPPORTED_FORMAT" }
  | { code: "INVALID_SCORE" }
  | { code: "READ_FAILED" }
  | { code: "STORAGE_QUOTA_EXCEEDED" }
  | { code: "LIBRARY_UNAVAILABLE" }
  | { code: "UNKNOWN" };
```

`web-core` 共享用例对每份 source 依次执行：

1. 受限读取字节，保持现有 64 MiB 上限。
2. 基于内容与扩展名探测格式。
3. 计算 SHA-256 Score Identity。
4. 检查已有 Score Identity，命中时直接返回 existing。
5. 执行最小谱面解析并提取元数据。
6. 生成 UUID 和已验证草稿。
7. 调用 Repository `add`，并接受并发时可能返回 existing。

单项失败不抛出中止整批的异常；转换为结构化 `failed` 结果后继续。

## 应用与路由

```text
/#/                          Sheet Library
/#/viewer/:libraryScoreId    Viewer
/#/studio/:libraryScoreId    Harmony Analysis Studio
/#/*                         Not Found
```

`ViewerApplication` 演进为组合端口的应用服务，但不持有持久化事实副本：

- Repository 拥有 Library Score 事实。
- Router 拥有当前 Library/Viewer/Studio 位置。
- Viewer Session 或 Studio Session 拥有各自当前谱面运行时。
- React 局部状态拥有搜索词、筛选、排序和对话框草稿。

Library 列表首次进入、导入/更新/删除成功后以及 Browser 页面重新获得焦点时调用 `repository.list()`。MVP 不使用 `BroadcastChannel`，也不引入 TanStack Query。

搜索和排序在共享 React 应用层对轻量摘要数组执行；Repository 不接受 query 或 pagination。达到可测量性能瓶颈后再扩展契约。

## Browser 存储适配器

BrowserSheetLibraryRepository 使用一个版本化 IndexedDB database。建议 object stores：

```text
library_scores   key: id, unique index: scoreIdentity
score_files      key: libraryScoreId
practice_sidecars key: libraryScoreId
playback_resume  key: libraryScoreId
harmony_analyses key: libraryScoreId
```

元数据、文件字节、练习数据和分析数据的新建/删除使用单个 readwrite transaction。`score_files` 保存 `Uint8Array`/`ArrayBuffer`，MVP 不引入 OPFS。

启动时尝试 `navigator.storage.persist()`；拒绝或不支持不阻塞使用，但 UI 必须如实告知浏览器本地数据可能被清理。导入前可通过 `navigator.storage.estimate()` 提供辅助诊断，但不以预估结果代替事务错误处理。

多标签页策略：

- IndexedDB 唯一索引防止并发重复导入。
- 页面重新获得焦点时刷新 Library。
- 不实时广播 UI 变更。
- 如另一标签页已删除 Viewer 或 Studio 中的曲谱，后续练习或分析写入必须因 Library Score 不存在而失败，不能重建孤儿数据。

## Desktop 存储适配器

### 目录

```text
userData/
  library/
    files/
      {libraryScoreId}.{extension}
    staging/
    deleting/
  library.sqlite
  sidecars/
  resume/
```

正式托管文件名使用 Library Score ID，不使用用户文件名或内容哈希作路径。数据库保留原始文件名和扩展名供导出与 UI 显示。

### SQLite 概念 schema

```sql
CREATE TABLE library_scores (
  id TEXT PRIMARY KEY,
  score_identity TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  parsed_title TEXT,
  parsed_artist TEXT,
  title_override TEXT,
  artist_override TEXT,
  duration_ms INTEGER,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  last_opened_at TEXT,
  storage_state TEXT NOT NULL CHECK (storage_state IN ('pending', 'ready', 'deleting')),
  managed_relative_path TEXT NOT NULL
);

CREATE TABLE library_practice_summary (
  library_score_id TEXT PRIMARY KEY,
  last_practiced_at TEXT,
  last_position_json TEXT,
  has_loop INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (library_score_id) REFERENCES library_scores(id) ON DELETE CASCADE
);
```

实施时应演进现有 `scores` / `score_index` / `file_refs` 表，不盲目并存两套重复表。最终迁移语句以现有 schema 和已存数据调查为准。

### 崩溃恢复

导入：

```text
写 library/staging/{operationId}
→ SQLite 事务写 pending 记录
→ rename 到 library/files/{libraryScoreId}.{ext}
→ SQLite 事务标记 ready
```

删除：

```text
SQLite 标记 deleting
→ rename 到 library/deleting/{operationId}
→ SQLite 事务删除馆藏和练习数据
→ 删除 deleting 文件
```

Repository `initialize()` 在对外提供 Library 前执行 reconciliation：

- 完成或回滚 `pending`。
- 继续完成 `deleting`。
- 清理无主 staging/deleting 文件。
- `ready` 记录对应正式文件缺失时保留记录并报错，不删除数据库项。

## Bridge 契约

Desktop Renderer 不直接访问 SQLite 或路径。Bridge 提供完成 Desktop repository/gateway adapter 所需的窄请求：

```text
library.initialize
library.list
library.get
library.findByIdentity
library.add
library.readScore
library.updateMetadata
library.setFavorite
library.markOpened
library.delete
file.selectScores
file.readToken
file.saveExport
```

所有请求和响应由 `web-core` Zod schema 派生 TypeScript 类型。Renderer 不获得绝对路径；选择结果使用一次性 token。Main Process 必须重新校验字节长度、ID、哈希格式与元数据长度，不信任 Renderer 输入。

Bridge capabilities 更新为：

```ts
fileAccess: {
  openExternalFile: true,
  persistentFileReferences: false,
  localLibraryImport: true,
}
storage: {
  sqliteIndex: true,
  sidecarPayload: true,
}
sync: {
  available: false,
  provider: 'none',
}
```

## 错误与数据安全

### 导入错误

可预期的文件失败转换为 `ImportItemResult.failed`，不让 React 解析 error message。Repository 不可用先写正式文件后验证的方式导入；失败不留 Library Score 或正式 Managed Score Copy。

### 存储与迁移错误

两个后端都维护明确 schema version 和顺序迁移。迁移失败时：

- 不删除或重建库。
- 不继续写入。
- 显示阻塞错误状态。
- 保留 Desktop 数据库/文件或 Browser 旧 IndexedDB 供后续恢复。

### 缺失馆藏

`/viewer/:id` 查不到 Library Score 时显示“这份曲谱已不在曲谱库中”，只提供返回 Library。不根据 URL 伪造 Session。

### Browser 容量

IndexedDB quota 不足时当前文件导入失败，已有 Library 不受影响。UI 提示释放浏览器空间或导出并删除不再需要的曲谱，不自动驱逐馆藏项。

## 测试策略

### 共享契约测试

用同一组 `SheetLibraryRepository` contract tests 验证 Browser 与 Desktop adapter：

- 创建和读取 Library Score。
- Score Identity 唯一且并发 add 只产生一项。
- 元数据编辑不改变托管字节或 Score Identity。
- 收藏和 markOpened 更新正确字段。
- delete 同时删除馆藏、文件和练习数据。
- 已删除 Library Score 不能再写入练习数据。
- 迁移失败不清空数据。

### 导入用例

- 单文件成功后返回 created。
- 重复文件返回 existing。
- 同名不同内容创建两份 Library Score。
- 损坏或不支持文件不调用 add。
- 批量导入允许部分成功并稳定汇总。
- Repository 并发唯一冲突转换为 existing。

### Desktop 恢复测试

在导入和删除的每个持久化边界注入失败，重新 initialize 后验证：

- 不出现两份相同馆藏。
- 不留无法清理的 staging 文件。
- 完成的删除不会恢复。
- `ready` + missing file 保留记录并报错。

### UI 与 E2E

- 空 Library 导入第一份曲谱。
- 单文件导入直接进入 Viewer。
- 批量导入留在 Library 并显示汇总。
- 搜索、收藏和排序的键盘交互。
- Viewer 刷新后从 Library Score 重建 Session。
- 删除确认文案和焦点恢复。
- Browser 页面重启后馆藏仍在；Desktop 应用重启进入 Library。

## 实施分阶段

### 1. 领域契约

- 在 `web-core` 建立 Library 类型、Zod schema、Repository/Gateway 端口与导入用例。
- 建立可被两端实现复用的 Repository contract test suite。

### 2. Browser 竖切

- 实现 IndexedDB Repository 和 Browser Score File Gateway。
- 建立 Library 首页、导入、列表、搜索、收藏、编辑、导出和删除。
- 保留 `/viewer/` 路由前缀，将其参数语义从临时 Session ID 迁移为 Library Score ID。

### 3. Desktop 竖切

- 迁移 SQLite schema，实现托管文件目录、staging 与 reconciliation。
- 扩展 Bridge schema/handlers/capabilities。
- 实现 Desktop Repository/Gateway adapter 并运行共享契约测试。
- 统一菜单和系统 Open Score Intent 为 Library Import。

### 4. 数据安全与发布验收

- 完成 schema migration failure 与 Desktop 崩溃注入测试。
- 验证 Browser quota/persistence 提示。
- 运行 Browser 与 Desktop E2E，核对两端交互与错误分类一致。

## 验收标准

1. Browser 和 Desktop 冷启动都以 Sheet Library 为首页。
2. 导入后即使外部原文件被删除，Library Score 仍可离线打开。
3. 相同字节文件不能在同一曲谱库中产生两份 Library Score。
4. 不同内容的同名文件作为独立曲谱。
5. 单导入直接进入 Viewer，批量导入留在 Library 并允许部分成功。
6. `/viewer/:libraryScoreId` 刷新后可重建 Viewer Session。
7. 编辑馆藏标题不修改谱文件或 Score Identity。
8. 删除会清除馆藏、托管文件、练习数据和 Harmony Analysis Document，无法从 Viewer 或 Studio 发起。
9. 单份原始谱文件可导出，馆藏元数据和练习数据不被嵌入。
10. 两个宿主通过同一套 Repository contract tests。
11. schema 迁移失败不自动清空曲谱库。
12. Desktop 在导入/删除任意持久化边界崩溃后可在下次启动收敛到一致状态。

## 相关决策

- ADR 0040：导入为应用托管的本地副本。
- ADR 0041：一个 Score Identity 只对应一个 Library Score。
- ADR 0042：内容变化视为独立曲谱。
- ADR 0043：删除曲谱同时删除练习数据。
- ADR 0044：Library Metadata 不改写谱文件。
- ADR 0045：Library Score ID 与 Score Identity 分离。
- ADR 0046：Viewer 按 Library Score 路由。
- ADR 0047：所有外部打开统一经 Library Import。
- ADR 0048：Desktop 与 Browser 各自维护本地 Sheet Library。
- ADR 0049：应用通过领域 Repository/Gateway 访问宿主能力。
- ADR 0050：schema 迁移失败不重建曲谱库。
- ADR 0051：Desktop 文件与数据库操作使用 staging/reconciliation 恢复。
- ADR 0052：Studio 和弦分析与 Viewer 练习分离，并随 Library Score 生命周期清理分析文档。
