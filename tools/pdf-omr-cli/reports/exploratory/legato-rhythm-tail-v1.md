# LEGATO 末尾连桁组修复：恢复 5 个音符，增加 1 个完全正确小节

日期：2026-09-14。零模型调用；两首开发作品上的隔离候选，未修改默认识别流程。

## 结果与决策

将 `beam_audit.py` 的源谱连桁证据接入候选生成后，整曲遍历只修改 score-4 上谱表零基索引 11。
五个音符的节奏得到修复，删除一个额外尾部休止符。完整验收 `overallGate: true`，可以保留本轮开发候选。

| 指标                           | score-4 基线 → 候选   | score-9 基线 → 候选 |
| ------------------------------ | --------------------- | ------------------- |
| 主音符 TP/FP/FN                | 740/40/43 → 745/35/38 | 180/2/6，不变       |
| 主音符 F1                      | 94.69% → 95.33%       | 97.83%，不变        |
| 新增 / 损失正确主音符          | 5/0                   | 0/0                 |
| 主休止符 TP/FP/FN              | 104/6/10 → 104/5/10   | 14/2/2，不变        |
| Adjusted strict joint TP/FP/FN | 834/56/63 → 839/50/58 | 164/34/38，不变     |
| Adjusted strict joint F1       | 93.34% → 93.95%       | 82.00%，不变        |
| 严格有效谱表小节               | 164/184 → 165/184     | 28/40，不变         |
| 全局声部映射                   | unique，不变          | unique，不变        |
| Harmony / MusicXML readiness   | ready-with-warnings   | ready               |
| 导出及四项 round-trip          | 全部通过              | 全部通过            |

相对共同 staff-slots 基线，score-4 累计恢复 17 个主音符，score-9 累计恢复 1 个；包含此前音高链路的收益，不能重复叠加旧局部替换结果。
本轮不仅改善音符指标，还让一个谱表小节达到严格完全匹配。但结果仍来自反复使用的开发作品，不是独立测试集或默认推广证据。

score-9 全部源谱小节被本轮条件拒绝，候选与基线完全相同。它证明没有误改该控制作品，不能证明节奏规则在第二首作品上有效。

## 实际改动

索引 11 的前两个事件——四分 A4 和四分休止符——保持不变。根据源谱五音连桁层数 `2、3、3、2、2`，从原组起点 1/2 重建组内时间：

| 音符 | 修改前 onset、duration | 修改后 onset、duration |
| ---- | ---------------------- | ---------------------- |
| B♭4  | 1/2、1/32              | 1/2、1/16              |
| A4   | 17/32、1/32            | 9/16、1/32             |
| G4   | 9/16、1/32             | 19/32、1/32            |
| A4   | 19/32、1/32            | 5/8、1/16              |
| C5   | 5/8、1/16              | 11/16、1/16            |

删除候选 onset 为 11/16、duration 为 1/16 的尾部休止符。源谱完整字形序列只有连桁组之前的四分休止符，组后没有休止符；
不是仅因为休止符妨碍填满小节就删除它。重建后的组结束于 3/4，整个单声部保持连续。

所有音符 ID、音高、声部和非时间字段保持不变。另行深比较确认：目标小节以外的全部内容不变，目标小节前两个事件不变，两曲所有带 tie 的完整事件不变。

## 源谱与对应条件

生成阶段只读取受控向量 PDF、冻结源几何和当前基线。按照实际小节线及相邻谱表中心的中点划定谱表小节区域，读取区域内全部字形原点。
仅允许当前 MScore、Leland 字体的有限字形集合：实心和空心符头、四分休止符、三类变音记号、两类断奏记号、常用高低谱号。
出现附点、数字、符尾、其他休止符、未知字体或其他字形时，整段拒绝。任何源曲线包围框与区域相交也拒绝。

该有限集合用于排除本轮不解释的符号，不是全面的向量谱语义解析。无受支持连桁的音符时值保持基线，不推断它是四分音符。
全部源符头必须有唯一匹配，并与候选音符按完整事件顺序对应；相邻字形太近、和弦或同时事件不纳入此轮。

Frozen candidate invariants:

- Candidate measures MUST contain one contiguous voice, without predicted ties or tuplets.
- Source and candidate event types and natural pitches MUST match in order, except at most one candidate-only trailing rest.
- Source quarter rests MUST match candidate quarter-rest duration.
- Only the final source beam group MAY receive new onset/duration values. Prefix events and all non-timing note fields MUST remain unchanged.
- The new group MUST end at the existing measure duration. Source correspondence MUST be established before any rest deletion.
- Generation MUST NOT read ground truth or hard-code error locations. Unsupported measures MUST retain the baseline.

源谱条件接受 score-4 的 85/184 个谱表小节，score-9 为 0/40。候选生成最终判定如下：

| 判定           | score-4 | score-9 |
| -------------- | ------- | ------- |
| 源谱条件拒绝   | 99      | 40      |
| 不是末尾连桁组 | 29      | 0       |
| 接受但无需修改 | 54      | 0       |
| 事件对应不一致 | 1       | 0       |
| 实际修改       | 1       | 0       |

## 局限与下一步

这是“有限字形源谱核验 + 基线组起点 + 连桁组节奏重建”，不是从图像独立推导完整时序。组起点沿用基线，区域准入基于字形原点而非任意 PDF 对象的完备语义。
扫描谱、其他字体、连音、附点、多声部、漏音及带连接区域均不覆盖。候选仍继承此前人工核对的跨页 tie 端点，不能描述成完全无人干预识别。

本轮已达到既定开发候选门槛，不再为了这一个小节扩大规则。下一阶段优先冻结并整理当前音高与节奏链路，解决独立作品验收前置条件，或者按预先固定准入规则选择其他完整作品。
K280、K331 的参考空白时间问题仍未解决；解除参考阻断应与识别收益分开记录。没有独立作品证据前，不修改默认流程。
若继续探索剩余识别错误，转向有明确锚点的漏音对应，而不是把多声部或附点放进本轮规则中顺手兼容。

## 产物与验证

[协议、源字形清单、逐小节判定、评价与导出产物](../development/legato-rhythm-tail-v1-20260914/)。可核查 [score-4 MXL](../development/legato-rhythm-tail-v1-20260914/score-4/score.mxl) 和 [score-9 MXL](../development/legato-rhythm-tail-v1-20260914/score-9/score.mxl)。

- `pnpm exec vite-node tasks/legato-candidate-ceiling/rhythm-tail.test.ts`：先因缺少实现失败，实现后通过；覆盖整组节奏、尾部删除、输入不变和关键拒绝边界。
- 使用 LEGATO Python 环境运行 `-m unittest discover -s tasks/legato-candidate-ceiling -p test_rhythm_source_evidence.py`：先因缺少实现失败，实现后 3 项通过；覆盖有限字形、附点、数字、符尾、未知字体、源曲线、缺失符头和和弦拒绝。
- 同环境运行 `tasks/legato-candidate-ceiling/rhythm_source.py`：退出码 0，生成全部 224 个谱表小节的源序列，输入哈希复核通过。
- `pnpm exec vite-node tasks/legato-candidate-ceiling/rhythm-tail-generate.ts`：退出码 0，两曲 schema、非时间音符字段不变及输入哈希断言通过；参考读取为 0。
- `pnpm exec vite-node tasks/legato-candidate-ceiling/rhythm-tail-evaluate.ts`：退出码 0，两曲 gate 及 overallGate 均为 true；导出、parse、view、playback、structural 检查全部通过，differences 均为空。
- 对 4 个新增 TypeScript 文件执行独立严格 `tsc --noEmit`（ES2022、Bundler、strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、skipLibCheck、allowJs）：首次暴露诊断辅助类型与 Zod 可选字段的兼容问题，修正类型后通过，未修改 runtime schema。
- 对上述 4 个文件执行 `pnpm exec oxlint`：通过。
- 同 Python 环境运行 `-m unittest discover -s tasks/legato-candidate-ceiling -p 'test_*_evidence.py'`：25 项通过，覆盖本轮及既有源谱几何。
- 独立深比较两曲前后产物：只有 score-4 上谱表索引 11 改变；其前两个事件、其他全部字段和完整带 tie 事件保持不变。
- `pnpm format:check`、`pnpm check:docs`、`git diff --check`：通过；保留 4 份无关 Feature Contract 核验日期过期提醒。

测试驱动和增量实现技能用于先固定拒绝边界，再连接生成与完整验收；系统化调试用于区分源字形证据和时长闭合，中文技术写作规范用于保留受控假设与无改动控制的限制。
未修改产品代码、Feature Contract、参考答案或既有冻结实验；没有重跑未受影响的 CLI 全套或 UI 测试。总体优化目标继续 active。
