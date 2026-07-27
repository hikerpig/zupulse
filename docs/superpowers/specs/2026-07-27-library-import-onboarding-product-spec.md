# Library 导入与首次体验产品规格

## 文档状态

- Status: approved
- Owner: Product
- Date: 2026-07-27
- Related Feature: Sheet Library
- Approved: 2026-07-27
- Decision gate: 产品方向与目标契约已批准；本文不代表功能已经实现，进入实现前仍需完成技术设计与任务拆分。

## 结论摘要

推荐把 Library 顶部的“导入曲谱 / 批量导入”合并为一个“导入曲谱”入口。入口打开轻量 modal，
同时支持多选文件、拖放文件与系统文件选择。导入一个成功项时打开 Viewer；导入多个候选时留在
Library 并显示逐项汇总。

空 Library 不应要求用户必须自备文件才能理解产品价值。推荐提供两份随应用分发、许可明确的
原创样例，一份覆盖 Guitar Pro 练习体验，一份覆盖 MusicXML/MXL 与 Harmony Studio 入口。样例
由用户主动加入 Library，不在首次启动时自动污染馆藏。

界面统一使用“导入”，不使用“上传”。当前文件只进入本机 Managed Score Copy；“上传”会错误
暗示文件被发送到网络。

## 事实、假设与待验证信号

### 已确认事实

1. 当前 Library 顶部同时显示“导入曲谱”和“批量导入”。
2. 当前单份导入成功或命中重复后进入 Viewer；批量导入完成后留在 Library。
3. 当前空 Library 只有导入本地文件这一条进入核心体验的路径。
4. 当前导入支持 Guitar Pro、MusicXML 与 MXL，单文件上限为 64 MiB；批量失败逐项隔离。
5. Browser 与 Desktop 都创建本地 Managed Score Copy，不把文件上传到云端。
6. 仓库中的 GP 测试素材不属于发布资源；任何样例进入应用构建前都必须记录来源与分发许可。
7. 项目没有产品行为遥测基础设施；诊断日志不能替代用户行为数据。

### 尚未证实的痛点假设

1. 新用户无法理解“导入曲谱”和“批量导入”的差别，或需要先决定导入数量才能开始。
2. 新用户手边没有受支持的谱面文件，因而无法在首次会话到达 Viewer、播放与练习能力。
3. 当前空态的格式说明不足以帮助用户判断文件是否留在本机、哪些文件可用、失败后如何恢复。
4. 拖放会显著提高桌面用户的导入效率；它对触屏与键盘用户的价值有限，不能成为唯一入口。

在得到任务测试或行为数据前，不得把以上假设写成“用户普遍需要”。

## 目标用户与待完成任务

### Primary user

首次使用 Zupulse、希望快速判断它是否适合查看和练习自己曲谱的 Desktop 或 Browser 用户。

### Jobs to be done

- 当我已经有谱面文件时，我想一次选择任意合理数量的文件，不必先判断该点击“单份”还是“批量”。
- 当我没有可用谱面文件时，我想先用一份可信样例听到播放并试用练习操作，再决定是否寻找自己的
  文件。
- 当我把本地文件交给应用时，我想明确知道支持范围、存储位置和失败原因，避免担心文件被上传或
  原文件被修改。

## Idea A：统一导入入口

### 1. 用户痛点

当前入口按实现分成单份与批量两种动作，用户必须在选择文件之前先决定模式。两个入口的差异不只
是选择数量，还隐含不同的完成后导航：单份进入 Viewer，批量留在 Library。这个差异没有在按钮
文案中表达。

### 2. 挑战假设

- 两个按钮“看起来重复”不等于两条流程完全重复；完成后的导航语义必须保留或明确改写。
- modal 不是天然更好。若点击后立刻打开支持多选的系统文件选择器，合并入口的目标已经能以更小
  成本达成。
- modal 只有在它同时承担拖放、支持格式说明、候选列表与移除候选等有价值任务时才成立；否则是
  多加一步。
- 拖放是 pointer enhancement，不是基本能力。键盘、触屏和辅助技术用户仍需要原生 file input。
- `accept` 只能帮助筛选，真正格式、字节大小和内容有效性仍必须走现有 probe/parse 流程。

### 3. 替代方案

| 方案                                   | 价值                             | 风险                                           | 结论           |
| -------------------------------------- | -------------------------------- | ---------------------------------------------- | -------------- |
| 保留两个按钮，只改文案                 | 变化最小，继续明确单份/多份      | 仍要求用户预先选择模式，未解决入口竞争         | 不推荐         |
| 单按钮直接打开多选 file picker         | 最小实现，原生且可访问           | 无拖放、无候选预览，格式与本地存储说明弱       | 可作为实验对照 |
| 单按钮打开轻量 import modal            | 容纳拖放、browse、说明和候选列表 | modal 可能变成复杂任务流；需完整焦点与错误设计 | 推荐           |
| 整个 Library 成为 page-level drop zone | 高频桌面导入最快                 | 拖放反馈易干扰列表，触屏无价值，误投风险高     | 暂不采用       |
| 独立导入页面 / wizard                  | 可承载元数据与复杂映射           | 当前导入不需要这些步骤，明显过度设计           | 非目标         |

外部参考支持“一个入口可导入一个或多个文件”的模式：Flat 的 Library 使用单一 Import file
入口接收 file(s)；Carbon 的 import pattern 支持 modal 中的 drag/drop + browse，并建议当后续
元数据步骤变多时改用 side panel 或 full page。USWDS 与 Carbon 都要求以原生文件输入或键盘可
激活按钮作为 drag/drop 的可访问基础。

### 4. 成功指标

在没有遥测基础设施的当前阶段，先进行 5–8 位目标用户的主持式任务测试。

Primary:

- 至少 6/8 位参与者在无提示下，于 60 秒内找到入口并成功提交一份或多份有效文件。
- 至少 7/8 位参与者能在任务后正确回答“单份成功后去哪里、多份完成后去哪里”。

Secondary:

- 导入入口首次点击时间相对当前双按钮基线中位数降低至少 30%。
- 使用 file picker、拖放、键盘三条路径时，候选文件与最终导入结果一致。
- 批量中单项失败不降低其他有效项的成功率。

Guardrails:

- 用户取消 modal 或系统选择器时，Library、route 与已有 import summary 不改变。
- VoiceOver 或 NVDA 用户能识别入口、限制、候选、单项错误与完成汇总。
- 不增加原始异常文本暴露、Desktop 绝对路径暴露或绕开 Score Identity 去重的路径。

### 5. 最小有价值范围

In scope:

1. Library 顶部与空态都使用同一个“导入曲谱”动作。
2. modal 提供一个多文件 drop zone；点击或键盘激活后打开原生多选文件选择器。
3. 始终显示支持格式、64 MiB 单文件上限和“文件只保存在这台设备上”的说明。
4. 选择后显示候选文件名；用户可移除单项或继续添加文件。
5. 用户明确点击“导入 N 份”后才开始现有 import pipeline。
6. 一个候选成功或命中重复时进入该 Library Score 的 Viewer。
7. 多个候选时留在 Library，关闭 modal 后使用现有可追溯 import summary。
8. 无效、重复、失败、取消和并发去重继续使用现有领域结果与错误 code。

Out of scope:

- 文件夹导入、递归扫描、URL 导入、云盘连接器和剪贴板导入。
- 在导入前编辑标题、艺术家或其他 metadata。
- 改变支持格式、64 MiB 上限、去重、Managed Score Copy 或路由身份。
- 让拖放成为唯一入口。
- 为本改动单独引入通用上传组件库或遥测 SDK。

## Idea B：可选择的体验样例

### 1. 用户痛点

空 Library 当前把“拥有受支持文件”当作体验 Viewer 的前置条件。没有文件的用户无法验证谱面呈现、
播放、变速、Loop、Track 或 Harmony Studio 是否有价值。

### 2. 挑战假设

- “没有谱子”可能只是不会从现有工具导出 MusicXML/GP，而不是真的没有任何曲谱；格式迁移说明
  可能比样例更能帮助回访。
- 自动预置样例会污染一个被承诺为“你的本地排练目录”的 Library，也可能让用户误以为样例是自己
  的内容。
- 太多样例会把 Library 变成内容商店，违反当前 UI contract。
- 一份样例无法同时代表 guitar tab 练习与 MusicXML/Harmony Studio 的价值；但超过两份对首次
  激活没有明显必要。
- 公版作品不自动等于可安全分发：编曲、录入版本和文件本身仍可能有独立权利。原创且带 manifest
  的素材风险最低。

### 3. 替代方案

| 方案                                 | 价值                                     | 风险                                         | 结论                 |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------- | -------------------- |
| 首次启动自动写入样例                 | 零操作即可看到 populated Library         | 污染馆藏、掩盖真实 empty state、删除语义模糊 | 不推荐               |
| 空态提供一个“快速体验”样例           | 最小激活路径                             | 无法覆盖两类核心格式价值                     | 可用于更小实验       |
| 空态 / import modal 提供两份可选样例 | 覆盖 Guitar Pro 与 MusicXML 两条价值路径 | 需要两份许可明确的发布资产                   | 推荐                 |
| 远程样例目录                         | 内容可更新、无需增大安装包               | 破坏离线首次体验，引入网络、可用性与内容治理 | 非目标               |
| 纯交互 tour / 视频                   | 不需真实曲谱                             | 不能证明渲染、播放和练习实际可用             | 仅可辅助，不替代样例 |

MuseScore 的 Getting Started tutorial score 说明“可操作的教学谱”是有效的 onboarding 替代；
它的价值来自让用户在真实谱面上行动，而不是展示营销内容。Zupulse 的样例也应进入真实 Library /
Viewer 领域流程，不创建绕开 Repository 的演示 Session。

### 4. 成功指标

Primary:

- 没有自备文件的参与者中，至少 6/8 位在 90 秒内通过样例进入 Viewer 并开始播放。
- 至少 5/8 位在首次样例会话内完成一个练习意图：改变速度、启用 Loop 或切换主轨道。

Secondary:

- 样例入口到首次声音的中位时间不超过 45 秒，不含首次音频资源下载的异常等待。
- 体验样例后，至少 6/8 位能指出如何回到 Library 导入自己的文件。
- 样例被删除后不会自动重建；用户仍可从空态或 import modal 再次主动添加。

Guardrails:

- 100% 发布样例具有来源、作者、许可、允许随二进制再分发的证据与内容哈希 manifest。
- 样例与用户导入内容使用相同 Library Score、Managed Score Copy、去重和删除语义。
- Browser 清站点数据、Desktop 删除 Library Score 后，不留下样例专属孤儿状态。

### 5. 最小有价值范围

In scope:

1. 两份短小、原创、许可随仓库分发的 bundled sample：
   - Guitar Pro sample：突出 tablature、至少两个可切换 tracks、可听见的 Loop 片段。
   - MXL sample：突出多 staff 播放，并可进入 Harmony Studio。
2. 空 Library 显示“导入自己的曲谱”为主动作，“体验样例”为次动作。
3. import modal 内提供紧凑的“没有文件？体验样例”区域；不展示封面网格或远程目录。
4. 选择样例后，将其原始字节送入与外部文件相同的 import pipeline；成功后进入 Viewer。
5. 样例选择区明确标记“体验样例”；入库后不增加特殊 metadata、Library 类型、生命周期或删除规则。
6. 样例清单至少包含稳定 sample ID、bundled file、format、locale-independent title、
   attribution、license、source repository path 和 lowercase SHA-256。

Out of scope:

- 在线曲谱市场、搜索、推荐、下载、收藏同步或内容更新服务。
- 自动把样例写入首次启动的 Library。
- 为样例创建不可删除、自动恢复或绕过去重的特殊实体。
- 使用当前授权范围只覆盖测试而非产品分发的 `Treasure.gp5`。
- 超过两份样例、按难度/风格筛选或个性化推荐。

## 推荐验证顺序

1. 用当前界面建立基线：4 位自备文件用户、4 位无文件用户。
2. 用可点击原型对比“单按钮直开 file picker”与“轻量 modal”。
3. 只验证入口发现、单/多文件心智模型、取消、错误理解与样例到首次播放，不测试视觉偏好。
4. 若 modal 相对直接 picker 没有改善完成率或错误理解，选择更小的直接 picker 方案。
5. 若两份样例没有比一份样例增加可理解的产品价值，首版收缩为一份 MXL 样例。

## Target Feature Contract

本节描述目标行为，不是当前运行时事实。获批后应作为 Sheet Library Feature Contract 的
`进行中的目标差异`；只有实现通过验证后，才可移动到“当前已实现行为”并更新 `last_verified`。

### 一句话契约

用户可从一个明确的 Library 入口导入一份或多份本地曲谱，或主动选择许可明确的 bundled sample
进入真实 Viewer 体验；所有内容都形成相同的本机 Library Score，不存在临时演示馆藏或隐式云端
上传。

### 用户入口

- Browser 与 Desktop 的 Library context bar 提供一个“导入曲谱”入口。
- 空 Library 同时提供“导入自己的曲谱”和次级“体验样例”入口。
- import modal 支持原生多选与 drag/drop；drag/drop 不是唯一输入方式。
- 一个候选成功时进入 `#/viewer/:libraryScoreId`；多个候选完成时留在 Library。

### 行为契约

1. modal 打开、关闭或文件选择取消不得改变 Library、route 或已有 import summary。
2. 候选可由 file picker、drag/drop 或 bundled sample 产生，提交后必须进入相同
   `importLibraryScores` 领域流程。
3. UI 的扩展名与大小提示只用于前置说明；字节 probe、parse、64 MiB 上限和结构化错误 code
   仍是最终准入事实。
4. 用户可在提交前移除候选；提交后以当前取消语义停止未开始项，不回滚已经成功的项。
5. 一个候选成功或命中 existing 时进入对应 Viewer；失败时留在 modal 或 Library 呈现可恢复错误，
   不进入通用 repository unavailable 状态。
6. 多个候选逐项隔离结果，完成后留在 Library 并提供 created、existing、failed、cancelled 汇总。
7. bundled sample 不自动入库；用户选择后生成普通 Library Score 和 Managed Score Copy。
8. 相同样例或外部文件按 Score Identity 去重；删除后再次选择样例创建新的 Library Score ID。
9. 样例可编辑 metadata、收藏、导出和删除，生命周期与用户导入内容一致。
10. 所有可见说明必须准确表达本机存储，不使用“上传成功”等网络语义。

### 领域不变量

1. `SheetLibraryRepository` 继续拥有全部 Library facts；`ScoreFileGateway` 继续只拥有外部文件选择。
2. sample catalog 只描述 bundled import source，不创建第二种 Repository 或 Library Score 类型。
3. `LibraryScoreId`、`ScoreIdentity`、Managed Score Copy、去重、删除联动与路由规则保持不变。
4. Renderer 不获得 Desktop 绝对路径；sample bytes 与外部 bytes 都必须经过既有可信边界。
5. 导入失败不得清空 Library，原始异常不得进入 DOM。
6. 无障碍基本路径不得依赖 pointer drag/drop。

### 验收契约

- 给定用户从 Library 打开 import modal，当未选择文件并关闭时，Library 与 route 必须不变。
- 给定用户通过 picker 或 drop 选择一个有效文件，当导入成功时，必须创建或命中唯一 Library
  Score 并进入其 Viewer。
- 给定用户选择多个候选且其中一项无效，当导入完成时，有效项必须进入 Library，无效项必须显示
  稳定失败原因，route 必须仍为 Library。
- 给定用户提交一个重复文件，当导入完成时，必须打开已有 Library Score，不得创建第二份托管副本。
- 给定键盘用户聚焦 drop zone，当激活时，必须能打开原生文件选择器；Escape 关闭 modal 后焦点
  必须回到原触发器。
- 给定用户选择 bundled sample，当导入成功时，它必须遵循普通 Library Score 的打开、导出、
  metadata、收藏与删除行为。
- 给定样例已存在，当用户再次选择同一样例时，必须命中 existing；给定样例被删除后再次选择，
  必须创建新的 Library Score ID。
- 给定样例缺少许可 manifest、内容哈希不匹配或发布资产缺失，当构建验证时，必须失败而不是省略
  检查继续发布。

### 平台能力

| Capability       | Browser                  | Desktop                         | Target difference            |
| ---------------- | ------------------------ | ------------------------------- | ---------------------------- |
| 多选 file picker | 原生 file input          | 原生文件 dialog 经 token/Bridge | UI 与领域结果一致            |
| drag/drop        | Browser File API         | Renderer drop 后经受信边界读取  | 必须验证 Desktop token 边界  |
| bundled sample   | 随 Browser assets 发布   | 随 app resources 发布           | manifest 与 bytes 必须一致   |
| 本地存储说明     | IndexedDB / 站点数据语义 | 应用托管本地副本语义            | 文案不得伪装完全相同的持久性 |

## 风险与开放问题

1. Desktop drag/drop 如何在不向 Renderer 暴露绝对路径的前提下转成一次性 token，需要技术评审；
   若不能安全复用既有 Bridge，首版 Desktop 可暂缓 drag/drop，但不能伪装为已支持。
2. 两份样例的具体音乐内容、作者与分发许可尚未确定，是发布阻塞项。
3. MXL sample 是否必须预置可展示的 Harmony Analysis Document 尚未证明；默认不预置，避免创建
   sample-only 领域规则。
4. Browser 的“保存在这台设备上”需补充站点数据被清理会丢失的准确说明，Desktop 不应复用这条
   风险文案。
5. “一个候选自动进入 Viewer”是否会干扰希望连续整理 Library 的用户，需要用任务测试验证；若
   干扰明显，可在不改变 import pipeline 的前提下统一为“全部留在 Library”。

## 参考

- 当前 Sheet Library Contract：`docs/features/contracts/sheet-library.md`
- 当前 UI contract：`DESIGN.md`
- Flat import flow:
  <https://help.flat.io/en/education/music-notation-software/import/>
- MuseScore Getting Started / tutorial precedent:
  <https://musescore.org/en/print/book/export/html/278625?toc=1>
- Carbon import pattern:
  <https://carbondesignsystem.com/community/patterns/import-pattern/>
- Carbon file uploader accessibility:
  <https://carbondesignsystem.com/components/file-uploader/accessibility/>
- USWDS file input:
  <https://designsystem.digital.gov/components/file-input/>
- MDN File API:
  <https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications>
