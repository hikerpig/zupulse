# Harmony Analysis 当前实现

Harmony Analysis Studio 为 MusicXML/MXL Library Score 提供本地分析、修正、预览、保存与标注副本
导出。本文只描述当前 Semi-CRF 实现。

## 系统边界

```text
Managed Score Copy
  → MusicXML/alphaTab projection
  → paper-compatible Semi-CRF
  → Harmony Analysis Document
  → Effective Projection
  → Studio / annotated export
```

- `packages/web-core`：书面时间、Semi-CRF、领域 schema、Correction、Repository 与导出。
- `packages/web-viewer`：Studio route、Session、编辑、autosave、重分析与 Preview Transport。
- Browser：IndexedDB 保存 Library 与 Harmony Analysis Document。
- Desktop：Main/SQLite 保存相同领域数据，Renderer 只经验证 Bridge 访问。
- `tools/harmony-cli`：复用生产分析入口执行检查、评测和离线训练。

Studio 与 Viewer 练习状态相互独立。Studio 不创建 Viewer PlaybackController，也不读写 Practice
Sidecar、Local Playback Resume 或练习摘要。

## 分析输入

`ScoreWrittenMoment` 使用 `measureIndex + offsetTicks` 表达不展开 repeat 的书面位置。MusicXML
divisions 通过安全 LCM 精确投影；不可整除或超过安全整数的位置明确失败。Range 左闭右开，不绑定
playback occurrence。

默认 scope 包含有音高的非打击乐轨道。投影保留 sounding pitch、spelling、voice、tie/grace 与来源
位置。

## Semi-CRF

生产入口是
[`analyzeHarmony.ts`](../../packages/web-core/src/harmony/analyzeHarmony.ts)：

1. 相邻 note onset/offset 形成 basic events。
2. 对最长 20 events 的 segment 与冻结 62-label inventory 提取论文特征。
3. bundled Mozart train-only 线性模型与 chord bigram 执行 exact semi-Markov Viterbi。
4. Path 决定 primary chord 与 boundary。
5. 在冻结 range 上生成 Top-8 alternatives，并独立应用 confidence threshold。

不存在另一套 analyzer、boundary policy 或运行时 fallback。模型损坏必须明确失败。CRF path score
不是 confidence；threshold 只能决定 resolved/unresolved。

## Document 与有效结果

完整成功分析形成不可变 `AnalysisRevision`。`HarmonyAnalysisDocument` 保存 active Revision、
User Corrections 与 annotation target，不包含来源 XML、DOM、alphaTab runtime、绝对路径或临时
token。

有效结果优先级：

```text
User Correction > supported source <harmony> > active Analysis Revision
```

Correction 锚定 Score Written Range，因此可以重新叠加到新 Revision。来源冲突、微分音、不支持的
kind 与低 confidence 保持 unresolved。N.C. 只能来自 source 或 User Correction。

## 保存、重分析与并发

Repository 使用 `expectedDocumentVersion` 做 CAS，并校验 `libraryScoreId` 与
`sourceContentHash`。编辑后 500 ms autosave；离开和导出前 `flush()`。

重分析使用递增 intent。只有最新 job 的完整成功结果可以替换 active Revision；失败、取消或过期
job 保留旧 Revision 与最新 Corrections。保存冲突保留本地 Document，不覆盖外部版本。

删除 Library Score 会同时删除托管字节、练习数据和 Harmony Analysis Document；旧 Session 不得
重建 orphan document。

## 导出

导出从不可变 Managed Score Copy 和固化 Effective Projection 生成新副本，不从渲染模型反序列化，
也不修改或重新导入当前 Library Score。MXL 只替换 container 声明的 score entry，并保留其余
archive entries。

导出拒绝 external entity、path traversal、重复 ZIP entry、异常压缩比、超限解压大小与无法精确写回
的书面位置。

## 当前质量边界

K331-3 raw primary accuracy 为 `79.30%`，raw interval accuracy 为 `71.93%`；默认阈值下 resolved
precision 为 `90.79%`。整曲推理约 28 秒，仍超过 5 秒目标。完整证据见
[`docs/evaluation/semi-crf.md`](../evaluation/semi-crf.md)。

## 验证

```bash
pnpm vitest run packages/web-core/src/harmony
pnpm --filter @zupulse/harmony-cli test
pnpm verify:fast
```
