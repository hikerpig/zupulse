---
status: historical
feature: harmony-analysis-studio
updated: 2026-07-15
---

# Harmony Analysis Studio release evidence

本表将设计规格的 15 条验收标准映射到可重复运行的当前证据。`tasks/*` 是执行记录；产品语义仍以设计规格和运行时代码为准。

| #   | 验收标准                                             | 当前证据                                                                                                                                                                                                                              | 状态                   |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | MusicXML 可从 Library Score 打开 Studio，Viewer 不变 | `apps/web-demo/e2e/library.spec.ts`、`StudioPage.test.tsx`                                                                                                                                                                            | 通过                   |
| 2   | 首次分析可取消，已有结果不静默重跑                   | `harmonyStudioSession.test.ts`、`StudioPage.test.tsx`                                                                                                                                                                                 | 通过                   |
| 3   | 9/11/13 和 alteration 有结构化表示                   | `extendedChords.test.ts`、`HarmonyStudioEditor.test.tsx`                                                                                                                                                                              | 通过                   |
| 4   | unresolved、微分音、来源冲突不伪装成 N.C.            | `confidence.test.ts`、`effectiveProjection.test.ts`、`writtenTime.test.ts`                                                                                                                                                            | 通过                   |
| 5   | 候选、结构编辑、N.C.、边界、Reset 和 autosave        | `HarmonyStudioEditor.test.tsx`、`correctionCommands.test.ts`、`harmonyStudioSession.test.ts`                                                                                                                                          | 通过                   |
| 6   | Correction 跨 reanalysis/Scope 叠加                  | `harmonyStudioSession.test.ts`、Browser multi-part E2E                                                                                                                                                                                | 通过                   |
| 7   | source harmony 优先，Correction 显式覆盖             | `sourceHarmony.test.ts`、`effectiveProjection.test.ts`                                                                                                                                                                                | 通过                   |
| 8   | 双端 contract 与 score 删除联动 Document             | Browser/SQLite repository tests、`repositoryContract.test.ts`                                                                                                                                                                         | 通过                   |
| 9   | Preview 不读写练习/恢复状态                          | `StudioPage.test.tsx`、`previewTransport.test.ts`                                                                                                                                                                                     | 通过                   |
| 10  | 导出保持扩展名、容器和原始哈希                       | `exportMusicXmlHarmony.test.ts`、MusicXML fixtures、双端 E2E                                                                                                                                                                          | 通过                   |
| 11  | 仅导出有效来源、Correction 和 resolved harmony       | `effectiveProjection.test.ts`、`harmonyStudioExport.test.ts`                                                                                                                                                                          | 通过                   |
| 12  | 导出可重导入，非 harmony 音乐语义保持                | `musicXmlAcceptance.test.ts`、`exportMxlHarmony`/fixtures                                                                                                                                                                             | 通过                   |
| 13  | latest-intent-wins、CAS、离开 flush 防止静默丢失     | `harmonyStudioSession.test.ts`、`StudioPage.test.tsx`、Browser 双窗口 CAS E2E                                                                                                                                                         | 通过                   |
| 14  | 固定语料准确率、覆盖率、校准、性能达到门槛           | UCI Bach eval：Top-8 63.38%、precision 45.54%、coverage 100%、boundary F1 82.22%、ECE 2.73%；CMU CMA pop/keyboard eval：Top-8 11.98%、precision 3.63%、coverage 100%、boundary F1 91.68%、ECE 0.59%；`harmony:benchmark` 通过性能预算 | **未通过：准确率门槛** |
| 15  | verify 与 Browser/Desktop E2E 通过                   | `pnpm verify`（78 files / 285 tests，Browser/Desktop build 通过）、`pnpm verify:e2e`（Browser 4/4、Desktop 4/4）                                                                                                                      | 通过                   |

## 仍需人工或产品决策的项目

- P4 人工复核已检查 Browser 空库状态、Tab 顺序和排序控件焦点环；曾发现排序 `<select>` 的焦点环被局部 CSS 隐藏并已修复，组件样式回归测试锁定该行为。loading/empty/error/save-conflict 的状态逻辑仍主要由组件测试覆盖，保存失败离开保护尚未完成独立人工演练。
- 当前独立授权语料包括 UCI Bach Choral Harmony，以及 CMU CMA 的 CC BY 4.0 流行/键盘测试子集；仍未满足规格要求的爵士、多声部 MusicXML、source/no-source 分层覆盖。CMU 评估通过 manifest SHA-256 校验，20 个文件共 1,911 个可解析和弦事件，另计 33 个 N 事件与 131 个无重叠 MIDI 音符事件。
- 要达到第 14 条的 95% Top-8 与 resolved precision，现有规则引擎需要超出当前“首版不提前铺设 ML”范围的产品/架构决策。
