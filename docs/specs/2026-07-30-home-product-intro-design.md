---
status: current
---

# 首页产品介绍面设计规格

## 文档状态

- Owner: Product + Design
- Date: 2026-07-30
- Related Feature: Sheet Library（路由变更）、新增 Home 表面
- Decision gate: 已批准并落地实现；路由、AppHeader、i18n 与测试变更以运行时代码为准。

## 结论摘要

把 `/` 从 Library 改为独立的 Home 产品介绍面，Library 迁移到自己的路由 `/library`。
Home 是唯一承担"展示与介绍"职责的产品表面：用功能导向的文案介绍三个工作区
（曲库、读谱练习、和声分析）与文件支持范围，并提供进入各工作区的明确入口。

视觉方向采用 Teenage Engineering 色彩节奏：大 display 排版、编号索引、mono 参数读数、
小面积 signal 色编码，在 Braun 秩序网格内制造节奏。首页不是营销落地页，不设 Hero 口号、
不使用营销插画，全部内容必须与真实产品能力一一对应。

Home 不读取 Library 数据，首次用户与回访用户看到相同内容，无 loading / empty 分叉。

## 背景与问题

1. 当前 `/` 直接渲染 `LibraryPage`（`packages/web-viewer/src/app/App.tsx:59`），产品没有
   介绍面。首次启动时用户直接面对一个空曲库，需要自行推断产品能做什么。
2. `DESIGN.md` 的 Anti-Slop 禁止"营销 Hero、口号或与练习流程无关的说明文案"。该规则针对
   工作区表面，但产品确实缺少一个合规的介绍出口；本规格为 Home 定义介绍内容的合法边界。
3. AppHeader 的品牌链接与主导航都指向 `/`，Library 迁移后导航结构需要同步调整。

## 目标用户与待完成任务

### Primary user

首次打开 Zupulse（Browser 或 Desktop）、尚未导入任何曲谱的用户；以及从外部链接进入、
需要快速判断产品能力的回访用户。

### Jobs to be done

- 当我第一次打开应用时，我想在导入文件之前知道这个产品能读什么格式、能做什么练习。
- 当我想开始使用时，我想从首页一步进入曲库导入自己的乐谱，而不是先理解界面结构。
- 当我已经熟悉产品时，首页不得妨碍我——导航到曲库的成本与现在相同（一次点击）。

## 信息架构

Home 是单栏阅读面，最大宽度与 Viewer Comfortable 阅读框对齐（960px），内容分四区，
区与区之间用细分隔线，不使用卡片堆叠：

```
┌────────────────────────────────────────────┐
│ Hero 产品定位（无编号，整体居中）            │
│   display 标题 + 一段功能描述 + 主操作       │
│   [打开曲库]（珊瑚色实心，唯一主操作）        │
├────────────────────────────────────────────┤
│ 01 读谱练习 (Viewer)          signal: blue │
│   能力描述 + mono 参数读数                  │
├────────────────────────────────────────────┤
│ 02 和声分析 (Studio)          signal: purple│
│   能力描述 + mono 参数读数                  │
├────────────────────────────────────────────┤
│ 03 曲库与文件 (Library)       signal: pink │
│   支持格式清单（mono）+ 本地存储事实        │
└────────────────────────────────────────────┘
```

### Hero 产品定位

- 一句 display 级产品定义，只说明"识谱与弹奏练习"这一核心定位（当前文案"识谱与弹奏练习
  工作台"）。是功能定义，不是口号；不写"释放你的音乐潜能"一类营销文案。
- 一段 body 补充：打开 Guitar Pro / MusicXML 曲谱，播放、循环、变速练习，分析和声。
- 唯一主操作"打开曲库"（珊瑚色实心按钮）跳转 `/library`。空库用户随后在 Library 空态
  完成导入（沿用现有导入与样例契约，首页不重复承担导入职责）。
- Hero 不使用编号索引，标题、描述与主操作整体居中对齐。

### 01–03 工作区介绍

- 每个工作区一节：编号（从 01 开始）+ 中文名称 + 2–3 句能力描述 + 一组 IBM Plex Mono 参数读数
  （只写真实能力，如 `GP / MusicXML / MXL`、`50%–200%`、`A/B Loop`），参数读数承担
  TE 式的"前面板丝印"气质，不编造精确数字或版本号。
- 分区为纯介绍内容，不设入口链接：三个分区的去向都相同（先到 `/library` 选谱），重复入口
  只是噪音；全页唯一动作是 Hero 的"打开曲库"。
- capabilities.harmonyAnalysis 为 false 的宿主不渲染和声分析一节，不出现"不可用"占位，
  后续分区重新连续编号。

### 文案约束

- 中文优先、短句、功能导向；无 emoji、无营销修饰、无口号（沿用 DESIGN.md Typography 锁）。
- 所有能力描述必须与当前运行时一致，不预告未实现能力。

## 视觉设计（TE 色彩节奏 × 设计契约）

### 允许的 TE 表达

- 编号索引 `01–03` 使用 IBM Plex Mono，作为各区锚点；eyebrow 仅限此处的真实索引价值。
- display（56px）只用于 Hero 标题；区标题使用 h2 层级，不跳级。
- signal 色编码：Viewer = blue（播放与技术读数）、Studio = purple（分析与分层）、
  Library = pink（曲库与文件）。Home 同屏使用三种 signal 色，是"同一界面 signal 色通常
  不超过两种"一致性锁的显式例外。
- signal 色只出现在小节左侧 2px 指示条、编号或参数读数等小面积位置，视觉权重低于珊瑚色；
  不铺色块、不做渐变、不做玻璃。
- 圆与几何只用于真实语义（如编号点、状态点），不做装饰性图形编排。

### 不可越界的部分

- 暖中性灰表面体系不变；珊瑚色仍是唯一主强调色，且首页只有"打开曲库"一个实心主操作。
- 乐谱优先原则不适用（首页无乐谱），但"结构先于装饰"适用：分仓、细分隔线、对齐优先于
  卡片、阴影与大圆角。
- 无装饰性循环动画、无视差、无滚动劫持；入场不做编排式动效，允许 hover/focus 的短
  transform/opacity 过渡，尊重 `prefers-reduced-motion`。
- Light / Dark 双主题同构，signal 色在深色下使用对应的 400 级亮度。

### 响应式

- 桌面：单栏 960px 居中；窄屏（<768px）全宽，编号与标题堆叠，参数读数允许换行，
  不出现横向溢出。测试断点 320 / 768 / 1024 / 1440。

## 路由与导航变更

| 变更         | 从          | 到                              |
| ------------ | ----------- | ------------------------------- |
| Library 路由 | `/`         | `/library`                      |
| Home 路由    | （不存在）  | `/`                             |
| 品牌链接     | `/`         | `/`（不变，现在指向 Home）      |
| 主导航       | 曲库（`/`） | 首页（`/`）+ 曲库（`/library`） |

- `createHashRouter` 中 `/` 改挂 `HomePage`，新增 `/library` 挂 `LibraryPage`
  （`packages/web-viewer/src/app/App.tsx`）。
- AppHeader 主导航顺序：首页、曲库、（上下文中）Viewer / Studio。`NavLink to="/"` 保持
  `end` 匹配，避免 `/library` 高亮首页。
- Viewer / Studio 内的返回链接、import 完成后导航等所有指向 `/` 表示"曲库"的现有代码
  统一改为 `/library`（实现时全仓搜索 `to="/"`、`navigate("/")`、`#/` 确认）。
- 旧书签 `#/` 现在打开 Home 而非曲库，属可接受行为变更；不做 `#/` → `#/library` 重定向，
  避免 Home 永远无法通过根路径访问。
- Browser 与 Desktop 宿主共用 web-viewer 的 App，无需各自改动；iPad shell 如复用同一路由
  表需同步确认。

## i18n 与测试

- 新增 `home` 命名空间文案到 `@zupulse/app-i18n`（zh-CN / en-US），web-core 不涉及。
- 更新 `packages/web-viewer/src/app/__tests__/App.test.tsx`：根路由渲染 Home、`/library`
  渲染 Library、导航高亮、capabilities.harmonyAnalysis=false 时 03 节不渲染。
- Home 文案中的能力描述变更时同步更新对应测试断言，避免文案与实现漂移。
- 运行 `pnpm check:i18n` 与 `pnpm verify:fast`。

## 完整状态覆盖

- 空库 / 满库：Home 不读数据，两种状态渲染一致；导入引导仍由 Library 空态承担。
- loading / error：无数据依赖，不涉及。
- 交互态：主操作与主导航链接可 Tab 到达，有可见 focus 样式。
- `prefers-reduced-motion`：无入场动效，过渡全部可约减。
- 双主题、窄屏、桌面宽屏均按上文响应式规则验证。

## 对 DESIGN.md 的协调

批准后需同步更新 `DESIGN.md`：

1. "产品表面"新增 `### Home` 小节，记录本规格确立的规则：Home 是唯一允许介绍性内容的
   表面；signal 色编码 Viewer=blue / Studio=purple；编号索引与 mono 参数读数的使用边界。
2. Anti-Slop 中"不增加营销 Hero、口号或与练习流程无关的说明文案"补充限定：该禁令针对
   Library / Viewer / Studio 工作区；Home 的介绍内容必须真实对应已实现能力，同样禁止
   口号与营销修饰。

## 验收标准

1. 访问 `/` 看到 Home 产品介绍面；访问 `/library` 看到 Library；旧有 Viewer / Studio
   路由行为不变。
2. AppHeader 主导航包含首页与曲库，当前路由高亮正确。
3. Home 的每一处能力描述与参数读数都能对应到当前运行时真实能力。
4. capabilities.harmonyAnalysis=false 时 Home 不出现和声分析一节。
5. 320–1440px 无横向溢出；键盘可完整遍历所有入口；Light / Dark 对比度满足 WCAG AA。
6. `pnpm check:i18n`、`pnpm verify:fast` 通过；`DESIGN.md` 已按上文更新。

## 待确认问题

1. 01 区产品定义的最终文案（实现前在评审中确定中英文措辞）。
2. 02–04 各节的 mono 参数读数清单，需逐项对照运行时能力核实后定稿。
3. 未来若需要"最近练习"等真实数据入口，应作为 Home 的增量区块另行设计，不在本次范围。
