---
status: historical
planning_status: proposed
feature: harmony-analysis-studio
---

# Harmony Analysis Studio Tasks

> `status: historical` 是仓库上下文检查对 `tasks/*` 执行文档的固定分类，表示它不覆盖 Current ADR/spec；实际执行生命周期由 `planning_status` 表示。

执行规则与阶段退出门槛见 [`tasks/plan.md`](plan.md)。任务按依赖顺序编号；未通过当前 phase checkpoint 时，不开始下一阶段。

## Phase 0: Feasibility gates

### Task 1: 证明书面时间位置可逆

**Description:** 用变化 divisions、tuplets、多 voice/backup/forward fixture 建立 legal Score Written Moment，并证明它能精确映射回来源 MusicXML 位置。

**Acceptance criteria:**

- [x] legal moment 往返 source divisions 后完全相等。
- [x] 不可精确表示的位置返回结构化错误，不取整或吸附。
- [x] 书面时间不展开 repeat，也不绑定 track。

**Verification:** `pnpm vitest run packages/web-core/src/musicxml packages/web-core/src/harmony`

**Dependencies:** None

**Files likely touched:** `packages/web-core/src/harmony/writtenTime.ts`、`packages/web-core/src/harmony/__tests__/writtenTime.test.ts`、`packages/web-core/src/musicxml/alphaTabProjection.ts`、MusicXML fixtures。

**Estimated scope:** Medium: 4 files

**Evidence:** `pnpm vitest run packages/web-core/src/harmony packages/web-core/src/musicxml`（16 tests）、`pnpm typecheck` 与 `pnpm fixtures:musicxml` 于 2026-07-15 通过。`pnpm verify:fast` 的其余检查通过，但既有 `packages/web-viewer/src/app/__tests__/App.test.tsx` 单测因 jsdom `AbortSignal` 与 undici 不匹配失败；该文件在本任务前后无变更，已隔离记录，未将无关 UI 修复纳入 T1。

### Task 2: 证明 XML/MXL 增量写入可行

**Description:** 对 partwise、timewise 和 MXL 做最小 `<harmony>` 插入实验，验证未知节点与非 harmony 音乐语义保留，并冻结 XML/ZIP 公开依赖选择。

**Acceptance criteria:**

- [x] 三种来源容器插入 harmony 后均可被当前 adapter 重开。
- [x] semantic diff 只出现预期 harmony 变化。
- [x] external entity、path traversal、zip bomb 和超限输入被拒绝。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/musicXmlRoundTrip.test.ts && pnpm fixtures:musicxml`

**Dependencies:** None

**Files likely touched:** `packages/web-core/package.json`、`pnpm-lock.yaml`、`packages/web-core/src/harmony/musicXmlRoundTrip.ts`、对应测试与 fixtures。

**Estimated scope:** Medium: 5 files

### Checkpoint P0

- [x] `tasks/plan.md` 的 Exit gate P0 全部通过并记录结论。

**Evidence:** `rtk pnpm vitest run packages/web-core/src/harmony packages/web-core/src/musicxml`（23 tests）于 2026-07-15 通过；T1/T2 的 typecheck、fixture 与安全边界证据已记录在上方任务项。

## Phase 1: Domain core

### Task 3: 定义 Harmony 领域 schema 与 formatter

**Description:** 建立 SpelledPitch、ChordSymbol、ChordDegree、Range、Revision、Correction、Document 和 AnnotationTarget 的严格 Zod schema，并生成稳定显示文本。

**Acceptance criteria:**

- [x] 9/11/13、altered degree、slash bass 和等音拼写可稳定 round-trip。
- [x] 非法 kind/extension/degree 组合被 schema 拒绝。
- [x] 可选字段缺失时省略，不产生显式 `undefined`。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/schemas.test.ts packages/web-core/src/harmony/__tests__/formatter.test.ts`

**Dependencies:** Tasks 1, 2

**Files likely touched:** `packages/web-core/src/harmony/schemas.ts`、`model.ts`、两个测试、`packages/web-core/src/index.ts`。

**Estimated scope:** Medium: 5 files

**Evidence:** `rtk pnpm vitest run packages/web-core/src/harmony/__tests__/schemas.test.ts packages/web-core/src/harmony/__tests__/formatter.test.ts`（8 tests）与 `rtk pnpm typecheck` 于 2026-07-15 通过。

### Task 4: 实现 Correction range 代数与 Effective Projection

**Description:** 实现半开区间切分、覆盖、合并、Reset，以及 User Correction > source harmony > revision 的只读组合。

**Acceptance criteria:**

- [x] Corrections 规范化为不重叠 ranges，后写编辑只切分相交部分。
- [x] source conflict/unsupported source、N.C. 和 unresolved 不混淆。
- [x] 新 Revision 以相同 written ranges 重新叠加旧 Corrections。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/corrections.test.ts packages/web-core/src/harmony/__tests__/effectiveProjection.test.ts`

**Dependencies:** Task 3

**Files likely touched:** `packages/web-core/src/harmony/corrections.ts`、`effectiveProjection.ts`、两个测试。

**Estimated scope:** Medium: 4 files

**Evidence:** T4 的两个测试文件共 4 tests，另加 T3 的 8 tests；相关测试与 `rtk pnpm typecheck` 于 2026-07-15 通过。XML/MXL 证据沿用 T2 记录。

### Task 5: 投影 AnalysisInput 与来源 harmony

**Description:** 从 alphaTab/MusicXML 建立可序列化 AnalysisInput，并解析来源 `<harmony>`、N.C.、重复和冲突地址。

**Acceptance criteria:**

- [x] 输入保留 track/staff/voice、note time、tie、key/meter、spelling 和 source mapping。
- [x] 默认 Scope 只含有音高非打击乐 tracks。
- [x] 来源 harmony 作为固定 state；unsupported kind 保留原节点且不被算法填补。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/analysisInput.test.ts packages/web-core/src/harmony/__tests__/sourceHarmony.test.ts`

**Dependencies:** Tasks 1, 3

**Files likely touched:** `packages/web-core/src/harmony/analysisInput.ts`、`sourceHarmony.ts`、两个测试、`packages/web-core/src/index.ts`。

**Estimated scope:** Medium: 5 files

**Evidence:** `rtk pnpm vitest run packages/web-core/src/harmony/__tests__/analysisInput.test.ts packages/web-core/src/harmony/__tests__/sourceHarmony.test.ts`（3 tests）、完整 harmony 测试（28 tests）与 `rtk pnpm typecheck` 于 2026-07-15 通过。

### Checkpoint P1

- [x] `pnpm vitest run packages/web-core/src/harmony`
- [x] `pnpm verify:fast`

**Evidence:** `rtk pnpm vitest run packages/web-core/src/harmony`（28 tests）与 `rtk pnpm verify:fast`（61 test files / 229 tests）于 2026-07-15 通过；`rtk pnpm typecheck` 通过。

## Phase 2: Analysis engine

### Task 6: 建立边界格与区间特征缓存

**Description:** 从合法 note/beat/bar/source events 生成有上限的 boundary lattice，并用前缀缓存计算 pitch-class、metric、bass 和 voice coverage 特征。

**Acceptance criteria:**

- [x] mandatory boundaries 不被剪枝，optional boundaries 有稳定排序和硬上限。
- [x] doubling 封顶，tie/grace/percussion 权重符合规格。
- [x] 区间特征与直接扫描的 oracle 在 fixtures 上一致。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/boundaries.test.ts packages/web-core/src/harmony/__tests__/features.test.ts`

**Dependencies:** Task 5

**Files likely touched:** `packages/web-core/src/harmony/boundaries.ts`、`features.ts`、两个测试。

**Estimated scope:** Medium: 4 files

### Task 7: 交付基础候选与 LocalScore

**Description:** 生成 triad、sus、power、6/7、inversion 候选并按 required/optional/conflict tones、bass、metric 和复杂度评分。

**Acceptance criteria:**

- [x] major/minor/diminished/half-diminished/augmented/sus/power golden cases 命中 Top-K。
- [x] inversion 与 root-position 可按 bass 证据区分。
- [x] 每区间候选数有固定上限且排序确定。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/candidates.test.ts`

**Dependencies:** Tasks 3, 6

**Files likely touched:** `packages/web-core/src/harmony/candidates.ts`、`chordTemplates.ts`、`scoring.ts`、对应测试。

**Estimated scope:** Medium: 4 files

### Task 8: 交付全局 sequence decoder

**Description:** 实现 segmental Viterbi 与固定宽度 beam，加入 same-chord、fifth motion 和常见进行的弱 Transition prior。

**Acceptance criteria:**

- [x] decoder 在小型 oracle 图上返回全局最优路径。
- [x] beam/segment length/state 数量均有硬上限。
- [x] key prior 只消歧，不禁止 chromatic chord 或输出功能和声。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/decode.test.ts`

**Dependencies:** Task 7

**Files likely touched:** `packages/web-core/src/harmony/decode.ts`、`transitions.ts`、对应测试、`analyzeHarmony.ts`。

**Estimated scope:** Medium: 4 files

### Task 9: 加入完整高叠与 altered candidates

**Description:** 在 evidence-driven candidate expansion 中加入完整 9/11/13、add chords 和 `b9/#9/#11/b13` 组合，不做笛卡尔积。

**Acceptance criteria:**

- [x] major/minor/dominant 9/11/13 与 add9/add11/add13 可区分。
- [x] 单项及多项 alteration 在有证据时进入 Top-8。
- [x] 无 tension 证据时复杂候选受先验抑制。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/extendedChords.test.ts`

**Dependencies:** Task 7

**Files likely touched:** `packages/web-core/src/harmony/chordTemplates.ts`、`candidates.ts`、`scoring.ts`、对应测试。

**Estimated scope:** Medium: 4 files

### Task 10: 加入非和弦音修正与置信度拒识

**Description:** 对 passing/neighbor/suspension/anticipation 做一次上下文修正，合并短伪 segment，并以固定 threshold 输出 resolved/unresolved。

**Acceptance criteria:**

- [x] `C | Cadd9 | C` 弱短 D 合并为 C，强长 D 仍支持 tension。
- [x] 算法从不自动产生 N.C.；微分音范围不取整。
- [x] confidence 来源可解释且低于 threshold 必为 unresolved。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/nonChordTones.test.ts packages/web-core/src/harmony/__tests__/confidence.test.ts`

**Dependencies:** Tasks 8, 9

**Files likely touched:** `packages/web-core/src/harmony/nonChordTones.ts`、`confidence.ts`、`analyzeHarmony.ts`、两个测试。

**Estimated scope:** Medium: 5 files

### Checkpoint P2

- [x] Harmony golden corpus 与 benchmark 报告生成成功。
- [x] `pnpm verify:fast`

**Evidence:** P2 相关 harmony 测试、全仓库 `rtk pnpm verify:fast` 与 `rtk pnpm harmony:eval` 于 2026-07-15 通过；固定 synthetic baseline 为 Top-8/precision/coverage/boundary F1 全 1.0。`rtk pnpm harmony:benchmark` 同日通过（5,000 notes analysis P95 205.84 ms、UI/cancel P95 0.0217 ms、heap delta 38.18 MB）。这些是规则基线证据，独立授权 corpus、校准和发布阈值仍属 P6。

## Phase 3: Persisted analysis data

### Task 11: 定义 Repository、CAS 与 contract harness

**Description:** 新增独立 HarmonyAnalysisRepository、读写用例和共享 contract，明确 expectedDocumentVersion 与 source hash 约束。

**Acceptance criteria:**

- [x] create/read/update/conflict 有结构化结果。
- [x] score 不存在或 hash 不匹配时拒绝写入。
- [x] contract 覆盖删除后禁止重建孤儿 Document。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/repositoryContract.test.ts`

**Dependencies:** Tasks 3, 4

**Files likely touched:** `packages/web-core/src/harmony/ports.ts`、`saveHarmonyAnalysis.ts`、`repositoryContract.ts`、测试、`packages/web-core/src/index.ts`。

**Estimated scope:** Medium: 5 files

### Task 12: 交付 Browser IndexedDB version 2

**Description:** 添加 `harmony_analyses` store、CAS transaction 和删除联动，并保持 version 1 数据的 additive migration。

**Acceptance criteria:**

- [x] Browser adapter 通过共享 contract。
- [x] migration failure 不清库且阻止写入。
- [x] 多标签页冲突不静默覆盖，删除后 autosave 被拒绝。

**Verification:** `pnpm vitest run apps/web-demo/src/library/__tests__/BrowserHarmonyAnalysisRepository.test.ts && pnpm demo:build`

**Dependencies:** Task 11

**Files likely touched:** `apps/web-demo/src/library/BrowserSheetLibraryRepository.ts`、`BrowserHarmonyAnalysisRepository.ts`、对应测试、`apps/web-demo/src/main.ts`。

**Estimated scope:** Medium: 4 files

### Task 13: 交付 Desktop SQLite schema version 2

**Description:** 添加 `library_harmony_analyses` 表、CAS store 和 Library 删除事务联动，不依赖隐式 foreign-key cascade。

**Acceptance criteria:**

- [x] version 1 到 2 顺序迁移保留现有 Library 数据。
- [x] Main store 通过共享 contract 和 migration failure 测试。
- [x] 删除 score 与 analysis row 在同一 SQLite transaction 中完成。

**Verification:** `pnpm vitest run apps/desktop-shell/src/main/library && pnpm desktop:build`

**Dependencies:** Task 11

**Files likely touched:** `apps/desktop-shell/src/main/library/migrations.ts`、`DesktopHarmonyAnalysisStore.ts`、`DesktopLibraryStore.ts`、两个测试。

**Estimated scope:** Medium: 5 files

### Task 14: 升级 Bridge 3.0 并接入 Main/Preload

**Description:** 增加 harmonyAnalysis read/save request/response、capability、mock 和 Main dispatcher，并把 Bridge schema 精确升级到 3.0.0。

**Acceptance criteria:**

- [x] request/response/capability 类型全部从 strict Zod schema 推导。
- [x] Main 重验 score ID、hash、version 和 payload，不返回绝对路径。
- [x] 旧版本 handshake 明确失败，不宽松兼容。

**Verification:** `pnpm vitest run packages/web-core/src/bridge apps/desktop-shell/src/main/__tests__/bridge.test.ts`

**Dependencies:** Tasks 11, 13

**Files likely touched:** `packages/web-core/src/bridge/schemas.ts`、`mockNativeBridge.ts`、`apps/desktop-shell/src/main/bridge.ts`、`preload.ts`、相关测试。

**Estimated scope:** Medium: 5 files

### Task 15: 接入 Desktop Renderer adapter

**Description:** 在 Renderer 通过 Bridge 实现 HarmonyAnalysisRepository，并把 Browser/Desktop adapter 注入共享应用入口。

**Acceptance criteria:**

- [x] Renderer adapter 通过共享 contract 的 Bridge-backed 变体。
- [x] capability 关闭时 Studio 显示存储不可用，不回退内存静默保存。
- [x] Viewer 现有 Repository/Gateway 注入行为不回归。

**Verification:** `pnpm vitest run apps/desktop-shell/src packages/web-viewer/src/app && pnpm desktop:build`

**Dependencies:** Tasks 12, 14

**Files likely touched:** `apps/desktop-shell/src/renderer.ts`、`packages/web-viewer/src/mountViewerApp.tsx`、`packages/web-viewer/src/app/ViewerApplication.ts`、对应测试。

**Estimated scope:** Medium: 4 files

### Checkpoint P3

- [x] Browser/Desktop Repository contract 全部通过。
- [x] `pnpm verify:fast && pnpm demo:build && pnpm desktop:build`

**Evidence:** Repository contract 2 tests、Bridge/Desktop 相关 26 tests、`rtk pnpm typecheck`、`rtk pnpm demo:build` 和 `rtk pnpm desktop:build` 于 2026-07-15 通过；capability 关闭时 Studio UI 行为待 P4。

## Phase 4: Studio editing vertical slice

### Task 16: 交付 Studio route 与首次自动分析

**Description:** 添加 `#/studio/:libraryScoreId`、独立 Studio Session 和首次自动分析；已有 Document 直接加载。

**Acceptance criteria:**

- [x] 刷新 route 从 Library Score 重建，不在 URL 放 Session ID。
- [x] 无 Document 自动启动可取消分析，成功后立即保存。
- [x] 已有 Document 或算法升级不静默重跑；GP 显示不支持。

**Verification:** `pnpm vitest run packages/web-viewer/src/app packages/web-viewer/src/features/harmony-studio`

**Dependencies:** Tasks 10, 12, 15

**Files likely touched:** `packages/web-viewer/src/app/App.tsx`、`ViewerApplication.ts`、`pages/StudioPage.tsx`、`features/harmony-studio/HarmonyStudio.tsx`、相关测试。

**Estimated scope:** Medium: 5 files

**Evidence:** Studio route 与首次加载 session 测试共 2 tests 于 2026-07-15 通过；已有 Document 不触发 analyzer，新增 Document 通过 Repository CAS 保存。

### Task 17: 交付 overlay、候选检查器与结构化编辑器

**Description:** 在 Studio score model 上叠加 Effective Projection，并提供候选选择和 root/kind/extension/degrees/bass 编辑。

**Acceptance criteria:**

- [x] overlay 不修改 Managed Score Copy 或 Viewer runtime。
- [x] unresolved 显示原因与 Top-K；不能输入任意 chord string。
- [x] 选择候选或字段编辑创建结构化 Correction。

**Verification:** `pnpm vitest run packages/web-viewer/src/features/harmony-studio/__tests__/HarmonyStudio.test.tsx`

**Dependencies:** Tasks 4, 16

**Files likely touched:** `HarmonyStudio.tsx`、`HarmonyOverlay.tsx`、`HarmonyInspector.tsx`、对应测试、Studio styles。

**Estimated scope:** Medium: 5 files

### Task 18: 交付范围编辑与 session undo/redo

**Description:** 接入 split/merge/move/reset、N.C. 和命令式 undo/redo；边界只允许 legal moments。

**Acceptance criteria:**

- [x] 每个命令产生确定、可逆的 Correction 变化。
- [x] Reset 删除 Correction 并露出来源/算法层。
- [x] undo/redo 离开 Studio 后丢弃，不持久化历史 Revision。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/correctionCommands.test.ts packages/web-viewer/src/features/harmony-studio`

**Dependencies:** Task 17

**Files likely touched:** `packages/web-core/src/harmony/correctionCommands.ts`、对应测试、`harmonyStudioSession.ts`、`HarmonyInspector.tsx`、UI 测试。

**Estimated scope:** Medium: 5 files

### Task 19: 交付 autosave 与后台 reanalysis

**Description:** 实现 500 ms autosave、Save/flush、离开保护、CAS conflict、串行写队列和 latest-intent-wins Worker job。

**Acceptance criteria:**

- [x] UI 准确显示 unsaved/saving/saved/failure/conflict。
- [x] reanalysis 期间旧 Revision 可编辑，失败/取消/旧 intent 不提交。
- [x] 新 Revision 原子结合提交瞬间最新 Corrections。

**Verification:** `pnpm vitest run packages/web-viewer/src/features/harmony-studio/__tests__/harmonyStudioSession.test.ts packages/web-viewer/src/app`

**Dependencies:** Tasks 11, 16, 18

**Files likely touched:** `harmonyStudioSession.ts`、`harmonyAnalysis.worker.ts`、`ViewerApplication.ts`、两个测试。

**Estimated scope:** Medium: 5 files

### Task 20: 交付 Scope、Annotation Target 与 Preview Transport

**Description:** 增加 track Scope、显示/导出目标 staff 和 Studio-only transport，并验证它们各自的状态所有权。

**Acceptance criteria:**

- [x] Scope 变化触发新 Job；Annotation Target 变化不重新分析。
- [x] Preview Transport 支持 play/pause/seek/speed/selected-range loop。
- [x] sidecar、resume、practice summary 前后快照完全不变。

**Verification:** `pnpm vitest run packages/web-viewer/src/features/harmony-studio packages/web-core/src/playback`

**Dependencies:** Task 19

**Files likely touched:** `HarmonyStudio.tsx`、`HarmonyInspector.tsx`、`StudioTransport.tsx`、`harmonyStudioSession.ts`、相关测试。

**Estimated scope:** Medium: 5 files

### Checkpoint P4

- [x] `pnpm verify`
- [x] `pnpm demo:test:e2e` Studio 主旅程通过。
- [ ] 键盘、焦点与保存失败离开保护人工检查完成。

**Evidence:** Browser 人工检查确认空库可访问、Tab 顺序覆盖导入/批量导入/搜索/收藏/排序，排序 `<select>` 获得可见 3px 焦点环；此前隐藏焦点环的局部 CSS 已移除并由 `styles.test.ts` 回归测试锁定。保存失败离开保护仍需独立人工演练。

## Phase 5: Annotated score export

### Task 21: 交付 partwise MusicXML 导出

**Description:** 从原始 `.musicxml/.xml` 字节按 Annotation Target 写入 Effective Projection，支持 source override、N.C. 与 unresolved skip。

**Acceptance criteria:**

- [x] root/kind/bass/degree 结构化节点与 projection 等价。
- [x] source harmony 未覆盖部分保持；Correction 范围可切分并恢复来源语义。
- [x] unrepresentable moment 明确失败，不生成节奏漂移。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/exportMusicXmlHarmony.test.ts && pnpm fixtures:musicxml`

**Dependencies:** Tasks 2, 4, 20

**Files likely touched:** `packages/web-core/src/harmony/exportMusicXmlHarmony.ts`、`musicXmlHarmonyWriter.ts`、对应测试与 fixtures。

**Estimated scope:** Medium: 4 files

### Task 22: 交付 timewise 与 MXL round-trip

**Description:** 复用同一 export planner 支持 score-timewise 和 MXL rootfile 替换，保留其他 archive entries。

**Acceptance criteria:**

- [x] timewise/partwise 使用同一领域 projection，不出现第二套和弦逻辑。
- [x] MXL 读取 container rootfile，保持附加 entries 和来源扩展名。
- [x] 恶意 archive 与超限压缩被拒绝。

**Verification:** `pnpm vitest run packages/web-core/src/harmony/__tests__/exportMxlHarmony.test.ts && pnpm fixtures:musicxml`

**Dependencies:** Task 21

**Files likely touched:** `exportMusicXmlHarmony.ts`、`mxlContainer.ts`、对应测试与 fixtures。

**Estimated scope:** Medium: 4 files

**Evidence:** 结构化导出 planner 测试 4 tests 覆盖 partwise/timewise/MXL；`rtk pnpm fixtures:musicxml` 验证 12 个确定性 fixture，于 2026-07-15 通过。

### Task 23: 接入 Studio 导出用户流

**Description:** 在 Studio flush 保存后固化 projection 快照，通过现有 ScoreFileGateway 导出 `-chords` 文件并显示取消/失败状态。

**Acceptance criteria:**

- [x] 未保存或 CAS conflict 时不开始导出。
- [x] 扩展名/容器保持，取消无副作用。
- [x] 导出不替换、重新导入或修改当前 Library Score。

**Verification:** `pnpm vitest run packages/web-viewer/src/features/harmony-studio apps/web-demo/src/library apps/desktop-shell/src && pnpm demo:build && pnpm desktop:build`

**Dependencies:** Tasks 15, 19, 22

**Files likely touched:** `HarmonyStudio.tsx`、`harmonyStudioSession.ts`、Browser/Desktop ScoreFileGateway、相关测试。

**Estimated scope:** Medium: 5 files

**Evidence:** Studio export command 测试覆盖已保存副本导出、原始字节不变与 CAS conflict 拒绝，于 2026-07-15 通过。

### Checkpoint P5

- [x] `pnpm fixtures:musicxml`
- [x] Browser/Desktop 导出 E2E 通过。
- [x] Managed Score Copy 导出前后 SHA-256 相同。

**Evidence:** `rtk pnpm fixtures:musicxml`（12 fixtures）与最新 `rtk pnpm verify:e2e`（Browser 4/4、Desktop 4/4）通过；`ViewerApplication` 导出回归以 SHA-256 断言原始 Managed Score Copy 未变。

## Phase 6: Release quality

### Task 24: 建立 corpus、校准与性能门禁

**Description:** 固化授权 corpus manifest、结构化指标、confidence calibration 和分析 benchmark，并接入稳定根脚本。

**Acceptance criteria:**

- [x] 自动报告 Top-8 recall、precision、coverage、boundary F1、ECE 和分项准确率。
- [ ] 独立评估集达到规格阈值，不能用全部 unresolved 规避 coverage。
- [x] 5,000-note P95、UI/cancel latency 和资源硬上限达到预算。

**Verification:** harmony eval/benchmark 根脚本 + `pnpm verify`

**Evidence:** `pnpm harmony:eval:uci /tmp/bach-choral-harmony.zip` 可复现 UCI Bach Choral Harmony（总计 5,665 事件、CC BY 4.0）评估；按 chorale 分组、保留 sounding MIDI/bass、使用有界序列解码，并以 train/tune/eval 分组（3,331/1,157/1,177 事件）后，独立 eval 为 Top-8 oracle recall 76.98%、resolved precision 56.16%、coverage 100%、boundary F1 73.94%、校准后 ECE 1.17%。Top-8 candidate oracle 在 gold window 上独立生成候选，不再与可能跨标注窗口的解码 segment 混算；resolved、boundary 与 confidence 指标仍来自完整序列解码。UCI chord label 比较不再把独立的观测 bass 特征误作 slash-bass 标签，`M7` 按数据中的 major-triad/minor-seventh 音集合映射为 dominant 7；bass 分项单独对照观测 bass。分析器使用去重后的 legal boundary lattice，非末小节 end 归一到下一小节 start，metric boundary 不再越过小节时值；6/7 与复杂 extension 要求对应色彩音硬证据，基础 kind 的三音/挂留音作为 important 证据进行强惩罚但允许真实省略。候选现覆盖 major/minor/dominant 9/11/13、add9/add11/add13，以及证据驱动的 b5/#5/b9/#9/#11/b13 聚合 alteration；degree 与 upper-extension 复杂度先验防止复杂解释主导。生产解码使用非正值的同和弦/五度/其他变化成本，避免正奖励诱发伪边界，并以 0.1 TPQ 弱缩放只参与近似平局消歧。Candidate confidence 使用按最大 pitch-class duration 归一化的 Top-1 margin，时值同比缩放时保持不变，非 Top-1 confidence 相对第一名单调下降。`pnpm harmony:eval:cmu /tmp/cma-dataset.zip` 可复现 CMU CMA CC BY 4.0 流行/键盘测试子集，20 个文件、1,911 个可解析和弦事件，按文件分组后 train/tune/eval 为 1,011/157/743；按产品 Scope 规则排除 General MIDI channel 10 percussion，并将 `m7b5` 规范化为不重复附加 b5 degree 的 half-diminished。每个 MIDI 音按标注窗口保留真实 onset 与 overlap duration，评估解码将 optional boundary budget 设为 0，仅使用标注窗口边界，避免把 note-off 当作额外 gold 边界或扩大 beam；独立 eval 为 Top-8 55.18%、resolved duration precision 22.26%、duration coverage 100%、boundary F1 98.06%、duration-weighted ECE 7.84%。CMU 的 precision、coverage、facets、calibration 按真实标签窗口毫秒时长加权，不再将短事件与长片段等权。两套独立语料均未达到规格阈值，因此不能勾选该验收项；报告同时输出 root/bass/kind/extension/alterations 分项准确率。

**Dependencies:** Tasks 10, 23

**Files likely touched:** `scripts/harmony-eval.mjs`、`scripts/harmony-benchmark.mjs`、corpus manifest、`package.json`、算法参数测试。

**Estimated scope:** Medium: 5 files

### Task 25: 完成双端发布验收

**Description:** 覆盖 Browser/Desktop 完整旅程、迁移/CAS/删除故障、可访问性和规格逐条证据，关闭 release gate。

**Acceptance criteria:**

- [x] E2E 覆盖首次分析、编辑、重分析、保存冲突、刷新、Preview、导出和删除。
- [x] Desktop/Browser 故障不会丢失旧 Revision、重建孤儿分析或泄漏路径。
- [x] 规格 15 条验收标准均有自动化或明确人工证据。

**Verification:** `pnpm verify && pnpm verify:e2e`

**Evidence:** 最新 `rtk pnpm verify:fast`（82 test files / 319 tests）通过；此前完整 `rtk pnpm verify` 与 `rtk pnpm verify:e2e`（Browser 4/4、Desktop 4/4）通过。Browser E2E 覆盖双页面 stale revision 的 CAS conflict，Studio session 测试断言 conflict 时本地旧 Revision 不被替换，Browser IndexedDB 与 Desktop SQLite store 测试均断言删除 score 后旧 session 无法重建 orphan document，Desktop preload/Main 测试断言 Renderer 不暴露路径。`tasks/release-evidence.md` 已逐项映射规格 1–15；第 14 条保留可复现的未通过指标，不把“证据齐全”误记为“验收通过”。Studio 页面故障注入组件测试另证明 unsaved、saving、CAS conflict 与持有本地 Document 的保存失败均触发离开保护。仍缺独立 corpus 发布阈值和保存失败离开保护的独立人工演练。

**Dependencies:** Task 24

**Files likely touched:** Browser E2E、Desktop E2E、Repository fault tests、Studio accessibility tests、规格验收记录。

**Estimated scope:** Medium: 5 files

### Checkpoint P6

- [ ] `tasks/plan.md` 的 Exit gate P6 全部通过。
- [ ] 人工评审后才能把计划状态改为 completed。

### Task 26: 固化本地学习型 ranker 协议

**Description:** 按 ADR 0053 定义固定维度候选特征、train/tune/eval 隔离训练协议和版本化只读模型资产。

**Acceptance criteria:**

- [ ] 训练脚本只读取 train/tune，模型清单记录 corpus、特征与算法版本摘要。
- [ ] 推断为离线、确定性纯领域逻辑，不引入 Browser/Electron 或在线服务。
- [ ] 测试证明 eval group 不能进入训练输入，模型资产损坏会安全失败。

**Verification:** 训练脚本测试 + `pnpm vitest run packages/web-core/src/harmony scripts/__tests__`

### Task 27: 接入学习型候选排序与拒识

**Description:** 在规则候选与现有有界序列解码之间应用 ranker，并用 tune 分组选择固定拒识阈值。

**Acceptance criteria:**

- [ ] Top-8 上限、结构化 schema、取消与 Revision 语义保持不变。
- [ ] ranker 分数参与候选顺序与 confidence，缺失模型时明确失败而非静默换算法。
- [ ] synthetic golden cases 与现有算法测试不回退。

**Verification:** harmony 单测 + `pnpm verify:fast`

### Task 28: 关闭学习模型发布门禁

**Description:** 用严格隔离 eval 重跑 UCI/CMU 指标、性能预算、双端构建与 E2E，并更新发布证据。

**Acceptance criteria:**

- [ ] Top-8 >= 95%，resolved precision >= 95% 且 coverage >= 70%。
- [ ] boundary F1 >= 85%，ECE <= 0.10，5,000-note P95 <= 5 秒。
- [ ] `pnpm verify` 与 `pnpm verify:e2e` 通过。

**Verification:** harmony eval/benchmark + `pnpm verify && pnpm verify:e2e`
