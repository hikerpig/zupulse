# LEGATO 多声部补漏：恢复 4 个匹配，增加 2 个完全正确小节

## 结果与采用决定

在[多声部形状证据](../development/legato-polyphonic-shape-v1-20260914/)基础上补齐时值判定，整曲扫描只修改 score-4 下谱表零基索引 24、32。
每处缩短一个误识别的附点时值，并补回一个漏音。两曲完整验收均通过，保留为新的开发候选，不修改生产默认流程。

| 指标                           | score-4 基线 → 候选   | score-9         |
| ------------------------------ | --------------------- | --------------- |
| 主音符 TP/FP/FN                | 745/35/38 → 749/33/34 | 180/2/6，不变   |
| 主音符 F1                      | 95.33% → 95.72%       | 97.83%，不变    |
| 新增 / 损失正确匹配            | 4/0                   | 0/0             |
| 主休止符 TP/FP/FN              | 104/5/10，不变        | 14/2/2，不变    |
| Adjusted strict joint TP/FP/FN | 839/50/58 → 843/48/54 | 164/34/38，不变 |
| Adjusted strict joint F1       | 93.95% → 94.30%       | 82.00%，不变    |
| 严格完全匹配谱表小节           | 165/184 → 167/184     | 28/40，不变     |
| 声部映射                       | unique，不变          | unique，不变    |
| Readiness                      | ready-with-warnings   | ready           |
| 导出及四项 round-trip          | 全部通过              | 全部通过        |

这里的 4 个匹配是两次时值修正加两次补音，不是增加了 4 个音符。
相对共同 staff-slots 基线，score-4 累计恢复 21 个正确主音符匹配、score-9 累计恢复 1 个；不能重复叠加历史局部替换收益。

## 实际变化与证据边界

两处移动声部原本只有 onset 0、duration 3/4 的 E-flat4。候选把它改为 duration 1/2，
再加入 onset 1/2、duration 1/4 的 D4。并行的 B-flat3 持续声部及全部其他字段保持不变。
独立整曲深比较确认只有这两处变化，其余小节和 score-9 完全不变。

音符形状、符干方向、附点归属来自源谱。补音的 alter 使用冻结候选的 keySignature，
并要求源谱完整字形清单中没有本小节临时变音，且新自然音高不同于两个已有音高。
因此本轮仍依赖候选调号正确，不能声称完整拼写全部由独立源谱识别获得。

Controlled-vector timing contract:

- Source shape MUST contain two simultaneous hollow heads with opposite unique stems, one later black head sharing the moving stem direction, and one dot uniquely owned by the sustained head.
- The complete glyph inventory MUST exclude flags, tuplets, local accidentals and unknown glyphs; source curves and page images MUST be absent.
- Intersecting paths MUST be either the first-painted near-page-sized white background or single thin axis-aligned stroke lines. Unknown filled, curved, diagonal or thick paths MUST reject timing inference.
- Durations follow the admitted notation: undotted hollow head 1/2, dotted hollow head 3/4, unflagged and unbeamed black head 1/4. Measure closure alone MUST NOT establish durations.
- The candidate MUST contain exactly two single-note voices at onset zero with duration 3/4, unique natural-pitch mapping and no ties or tuplets.
- The sustained voice and the original moving note's non-duration fields MUST remain unchanged. Generation MUST NOT read reference answers or hard-code error locations.

这些条件仅覆盖受支持的向量 PDF。两处是同一作品的重复乐句；score-9 没有触发，不能作为跨作品正向验证。
基线仍继承此前人工复核的跨页 tie 修正，本轮没有改变这些连接。

## 保留的否定证据

首版时值判定要求白色背景矩形与 PDF 页面尺寸精确一致，因此两处都被拒绝。
实际页面为 `595 × 842`，首个绘制的白色背景约为 `595.275 × 841.889`。差异来自这份文件的页面边界与背景几何，不是连桁。
修订版只允许首个绘制、四条直线构成、与页面边界相差不超过 1 point 的白色背景；局部白块和后绘制白块仍拒绝。
新版使用独立协议与目录，没有覆盖失败证据或更改源谱。整理后保留首版输出，首版脚本与测试可从 `43d980f9` 恢复；当前仅保留 v2 时值实现。

## 产物与复现

[成功协议、源证据、逐小节变化、评价和导出](../development/legato-polyphonic-recovery-v2-20260914/)。
[score-4 MXL](../development/legato-polyphonic-recovery-v2-20260914/score-4/score.mxl) 与
[score-9 MXL](../development/legato-polyphonic-recovery-v2-20260914/score-9/score.mxl) 可直接核查。
[首版拒绝协议](../development/legato-polyphonic-recovery-v1-20260914/)保持原样。实验于 9 月 14 日启动，跨日验收保留原产物标识。

- 当时在 LEGATO Python 环境分别运行首版和 `polyphonic_timing_source_v2.py`：均正常完成；首版两处拒绝，修订版两处通过，输入哈希不变。
- 当时执行 `-m unittest discover -s tasks/legato-candidate-ceiling -p 'test_polyphonic*.py'`：9 项通过；新模块均经历缺少实现的失败，再实现通过。清理首版后当前测试为 7 项，历史数量不代表当前数量。
- `pnpm exec vite-node tasks/legato-candidate-ceiling/polyphonic-recovery.test.ts`：先因实现缺失失败，实现后通过；覆盖补音、持续声部和输入不变，以及时值、连接、调号、声部数量等拒绝条件。
- 对四个新增 TypeScript 文件运行独立严格 `tsc --noEmit`（ES2022、Bundler、strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、skipLibCheck、allowJs）：通过。首次暴露可选 measure.duration，补上缺失拒绝并增加测试。
- `pnpm exec vite-node tasks/legato-candidate-ceiling/polyphonic-recovery-generate.ts`：通过；仅修改两个小节，schema、事件 ID 唯一性、持续声部不变及输入哈希断言通过。
- `pnpm exec vite-node tasks/legato-candidate-ceiling/polyphonic-recovery-evaluate.ts`：通过；两曲 gate 和 overallGate 为 true，export、parse、view、playback、structural 均通过，differences 为空。这不是手工 UI 或音频测试。
- 对四个新增 TypeScript 文件执行 `pnpm exec oxlint`：通过，0 warnings、0 errors。
- 独立整曲深比较：通过；除两处首音 duration 和新增后续音符外，所有字段不变。

组合验证命令曾超时；确认进程结束且没有候选产物后，拆分为类型检查、生成和评价完成，未重复写入冻结目录。
测试驱动、系统化调试和增量实现用于固定拒绝边界、定位背景几何差异并验证整曲效果。
未修改产品代码、Feature Contract、参考答案、待审空白声部契约或其他未跟踪目录。

## 下一步

候选保持冻结，不扩展为通用补漏。后续 K280 源谱覆盖检查没有触发规则；阶段成果、否定结论和暂停边界统一见[优化阶段总结](legato-optimization-summary-20260915.md)。
