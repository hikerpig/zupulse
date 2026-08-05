---
status: implemented
date: 2026-08-01
owner: Engineering
scope: tools/pdf-omr-cli reviewed MusicXML writeback from score-export MIDI fusion
parent: docs/specs/2026-07-31-midi-score-report-only-fusion-design.md
---

# MIDI Fusion 人工审核回写设计

## Objective

在现有 `fuse --repair-mode report-only` 之上增加一个独立、可审计的回写阶段。工程师先生成不可变的
fusion run，审核 repair proposals，再把明确批准的修正以最小补丁写入一份新的 MusicXML/MXL：

```text
MusicXML/MXL + score-export MIDI
                |
                v
        immutable fuse run
                |
       decisions.json (reviewed)
                |
                v
        apply-fusion writeback
                |
                +-> corrected score
                +-> patch manifest
                +-> before/after validation
```

本切片的目标是让“报告”变成“可以安全落盘的修正”，同时保持以下性质：原文件不覆盖、每个改动可追溯、
源文件或 proposal 漂移时拒绝执行、回写后必须通过结构与 fusion 无回归验证。

## Assumptions

1. `score-export` MIDI 仍是唯一支持的 MIDI 类型；真人演奏 MIDI 不进入本切片。
2. 回写总是生成新文件，不原地覆盖输入，也不修改已有 fuse run。
3. v1 只应用人工审核的 `pitch-disagreement`；`midi-supported-missing-note` 与
   `unsupported-score-note` 继续作为 review-only proposal。
4. reviewer 必须给出明确 `writtenPitch`。MIDI 只约束 sounding pitch，系统不得自行决定有歧义的
   enharmonic spelling。
5. v1 不提供无人审核的 `high-confidence` 自动应用。它可以复用同一 patch contract 在后续切片中增加，
   但需要先用 K331 development corpus 与独立样本校准阈值。

## Why a Separate Command

不把 mutation 塞进 `fuse --repair-mode high-confidence`。`fuse` 继续只做 evidence、alignment 和 proposal；
新的 `apply-fusion` 只消费一个已完成 run 与审核决策。这样分析结果可重复审核，回写失败不会污染报告，
同一 proposal 集也可以比较不同 reviewer decisions。

## CLI Contract

分析命令保持不变：

```bash
pnpm pdf-omr -- fuse \
  --musicxml <score.musicxml|score.mxl> \
  --midi <score-export.mid> \
  --output <fusion-run-dir> \
  [--midi-kind score-export] \
  [--repair-mode report-only]
```

新增回写命令：

```bash
pnpm pdf-omr -- apply-fusion \
  --run <fusion-run-dir> \
  --decisions <decisions.json> \
  --output <writeback-run-dir>
```

`--run` 必须指向成功且 `compatibilityStatus: "compatible"` 的 fuse run。`--output` 必须不存在。
`apply-fusion` 不接受外部 MusicXML 路径；它只读取 fuse run 中已经 hash 固定的 `input/score.*`，避免 reviewer
看到的 proposals 与实际修改文件不一致。

## Decision Contract

```ts
type FusionDecisionSet = {
  schemaVersion: "1.0.0";
  fusionRun: {
    runId: string;
    runManifestSha256: string;
    repairProposalsSha256: string;
  };
  decisions: Array<{
    proposalId: string;
    action: "apply" | "reject";
    // Required only when applying a pitch-disagreement proposal.
    writtenPitch?: {
      step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
      alter: -2 | -1 | 0 | 1 | 2;
      octave: number;
    };
    comment?: string;
  }>;
};
```

规则：

- 每个 `proposalId` 最多出现一次；
- `action: "apply"` 的 pitch proposal 必须提供 `writtenPitch`；
- reviewer pitch 投影到 sounding MIDI 后，必须等于 proposal 的 `suggestedSoundingMidi`；
- 计算 sounding pitch 时使用 score 自身 MusicXML transpose facts，不能直接假定 written pitch 等于 concert pitch；
- 不在 decision set 中的 proposal 视为 `unreviewed`，不应用；
- v1 对 missing/extra proposal 的 `apply` 决策稳定失败，不静默降级为 reject；
- `comment` 是审计信息，不参与补丁语义。

## Source Locator Contract

当前 `sourceNoteId` 是 `OmrScoreDraft` 的逻辑 ID，不是原始 XML 地址。writeback-ready proposal 必须新增
不可变 locator：

```ts
type MusicXmlNoteLocator = {
  rootFilePath: string | null; // null for plain XML, MXL root entry path otherwise
  partId: string;
  measureIndex: number; // zero-based direct-child measure ordinal
  noteIndex: number; // zero-based direct-child note ordinal in that measure
  preconditionSha256: string; // canonical writable note facts before mutation
};

type WritableNoteFacts = {
  writtenPitch: { step: string; alter: number; octave: number };
  voice: number;
  staff: number;
  durationUnits: number;
  chord: boolean;
  tieTypes: string[];
};
```

`normalizeAudiverisMusicXmlWithSourceIndex(bytes)` 在同一次 XML traversal 中返回：

```ts
{
  draft: OmrScoreDraft;
  sourceNotesByEventId: ReadonlyMap<string, MusicXmlSourceNote>;
}
```

不得用第二套近似 traversal 从逻辑 ID 反推 XML note。repeat 只会复制 ScoreEvidence attack；同一个
`sourceNoteId` 的多次 playback evidence 必须聚合回同一个 locator。若不同 playback occurrence 给出冲突建议，
该 source note 只能是 review-only，不能形成可应用 patch。

## Writeback-ready Proposal

现有 `repair-proposals.json` 升级为 schema `2.0.0`，保留 report-only 语义并增加可审核补丁信息：

```ts
type RepairProposalV2 = {
  id: string;
  type: "pitch-disagreement" | "midi-supported-missing-note" | "unsupported-score-note";
  scoreNoteIds?: string[];
  midiNoteIds?: string[];
  confidence: number;
  autoApplicable: false;
  reviewability: {
    status: "writeback-ready" | "review-only";
    reasons: string[];
  };
  target?: MusicXmlNoteLocator;
  before?: WritableNoteFacts;
  suggestedSoundingMidi?: number;
};
```

只有满足全部条件的 pitch proposal 可以是 `writeback-ready`：

1. compatibility 为 `compatible`，不是 `ambiguous`；
2. 所有指向同一 source note 的 playback occurrence 对 suggested pitch 达成一致；
3. target note 有完整 pitch、voice、staff、duration 与 source locator；
4. target 不是 tie `continue` / `end`；tie `start` 可以改，但 writeback validation 必须确认同一 tie chain
   的后续 pitch 一致，否则拒绝；
5. target 只对应一个 proposal，不存在 conflicting patch；
6. 原始 MusicXML 的 transpose facts 可确定地投影 written/sounding pitch。

missing/extra proposal 在 v1 一律为 `review-only`，reason 分别包含
`missing-note-notation-underdetermined` 或 `note-removal-structure-risk`。

## Mutation Semantics

回写层对原始 MusicXML 做最小文本补丁，只替换目标 `<note>/<pitch>` 内的 `<step>`、`<alter>`、`<octave>`：

- 保留原始 part、measure、note 顺序；
- 保留未知 XML、namespace、layout、lyrics、notations、dynamics、slur、articulation 和 metadata；
- `alter: 0` 时允许删除 `<alter>`，非零时插入或替换 `<alter>`；
- plain MusicXML 输出同类型文件；MXL 只替换 container 指定的 root entry，其他 zip entries byte-for-byte 保留
  在解压内容层面；
- 输出采用 deterministic serialization / zip ordering；
- 同一 target 只能修改一次，patches 按 locator 排序后应用。

回写实现不能使用 `generateMusicXml(draft)` 重建整谱。该生成器只覆盖受支持子集，会丢弃原输入中尚未进入
`OmrScoreDraft` 的记谱和排版事实。

## Output Contract

成功的 writeback run：

```text
input/
  fusion-run.json
  decisions.json
patch-plan.json
corrected/score.musicxml|score.mxl
validation/
  source.json
  corrected.json
  structural-diff.json
  fusion-before.json
  fusion-after.json
diagnostics.json
run.json
```

`patch-plan.json` 对每个 proposal 记录：

```ts
type PatchPlanEntry = {
  proposalId: string;
  decision: "applied" | "rejected" | "unreviewed";
  target?: MusicXmlNoteLocator;
  before?: WritableNoteFacts;
  after?: WritableNoteFacts;
  reasons: string[];
};
```

`run.json` 固定 source fuse run manifest hash、decision hash、corrected score hash、所有 validation artifact hash，
并记录 `status: "succeeded"`。除时间戳外，相同 run + decisions 的 artifacts 必须 byte-for-byte deterministic。

## Validation Gates

### Before mutation

1. 验证 fuse run `run.json`、`input.json` 和全部 `artifactSha256`；
2. 验证 decision 中的 run/proposal hashes；
3. 重新读取 source note locator，并校验 `preconditionSha256`；
4. 验证 reviewer `writtenPitch` 与 suggested sounding MIDI、transpose facts 一致；
5. 拒绝重复 target、冲突 suggestion、不支持 proposal type 与 out-of-range pitch。

### After mutation

1. corrected score 必须通过 MusicXML/MXL preflight；
2. `createMusicXmlAdapter()` 必须得到 `view: true` 与 `playback: true`；
3. 重新 normalize 后，part/staff/measure/voice/event count、onset、duration、repeat、tie、tuplet 不得变化；
4. structural diff 只能包含 patch plan 声明的 pitch paths，且 before/after 必须完全匹配；
5. blocking diagnostics 相对 source 不得新增；已有 diagnostics 不因本次 pitch patch 被误报为“已修复”；
6. 用相同 MIDI 重新运行 deterministic fusion：
   - compatibility 仍为 `compatible`；
   - `scoreCoverage` 与 `midiCoverage` 不下降；
   - `pitchAgreement` 不下降；
   - 每个 applied proposal 对应的 pitch disagreement 必须消失；
7. tie start 被修改时，同一 tie chain 的 continuation/end written pitch 必须同步形成一个原子 patch group，
   或整个 group 拒绝。

任何 gate 失败时命令以 machine-readable error 退出，不产生 `corrected/score.*`。失败诊断先写入临时 run
目录，验证全部成功后再原子 rename 为用户指定的 `--output`。

## Error Contract

新增稳定 reason / diagnostic codes：

- `fusion-run-integrity-failed`
- `fusion-run-not-compatible`
- `decision-run-mismatch`
- `decision-proposal-mismatch`
- `proposal-not-writeback-ready`
- `source-note-precondition-failed`
- `reviewed-pitch-mismatch`
- `conflicting-source-note-patches`
- `unsupported-writeback-operation`
- `corrected-score-preflight-failed`
- `corrected-score-structural-regression`
- `corrected-score-fusion-regression`

错误上下文不得包含绝对路径以外的敏感文件内容，也不得输出原始 XML 片段。

## Project Structure

```text
tools/pdf-omr-cli/src/
  commands/
    apply-fusion.ts
  fusion/
    schemas.ts
    build-score-evidence.ts
    build-writeback-proposals.ts
    apply-reviewed-patches.ts
    validate-writeback.ts
  normalizers/
    audiveris.ts
    musicxml-source.ts
  __tests__/
    source-note-index.test.ts
    writeback-proposals.test.ts
    apply-reviewed-patches.test.ts
    apply-fusion-command.test.ts
```

复用 `@xmldom/xmldom`、`fflate`、MusicXML preflight、canonical JSON、artifact hash、adapter 与现有 fusion
算法；不新增 runtime dependency。若最小文本 patch 需要共享 XML tag scanner，应先把 `web-core` 现有私有
scanner 提取为窄接口，而不是复制一个行为不同的 parser。

## Code Style

使用 named exports、Zod strict schemas、double quotes、`exactOptionalPropertyTypes` 兼容的条件 spread：

```ts
export function buildPatchPlan(proposals: RepairProposalsV2, decisions: FusionDecisionSet): PatchPlan {
  return patchPlanSchema.parse({
    schemaVersion: "1.0.0",
    entries: proposals.proposals.map((proposal) => decidePatch(proposal, decisions)),
  });
}
```

不把 raw exception message 直接写入 CLI report；转换为 `PdfOmrError` 的稳定 reason 和有限 context。

## Testing Strategy

- Unit：plain XML/MXL locator、chord note ordinal、缺失 timing 前后的 locator 稳定性、repeat occurrence 聚合、
  transpose 投影、enharmonic reviewer input、precondition hash、tie chain 原子 patch。
- Mutation：仅目标 pitch 改变，未知 XML 与非 root MXL entries 保留，输出 deterministic，源 bytes 不变。
- Negative：run hash 漂移、proposal hash 漂移、source note 漂移、重复 decision、conflicting repeat evidence、
  missing/extra apply、ambiguous compatibility、结构回归与 fusion 回归。
- Command integration：fixture 生成 report、审核一个 pitch proposal、apply、重新 fuse，验证 disagreement 消失。
- Controlled corpus：继续使用仓库 `test-fixtures` 的 texture K331 development corpus；记录 writeback precision、
  rejected proposal reasons 与 before/after metrics，不把它当 holdout 泛化证据。
- Flower Day：Audiveris compatible run 只做人工抽样回写验证；由于没有 reviewed ground truth，不报告 accuracy，
  只报告结构安全性与 fusion consistency。

## Commands

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/source-note-index.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/writeback-proposals.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/apply-reviewed-patches.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/apply-fusion-command.test.ts
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm verify:fast
pnpm format:check
git diff --check
```

## Boundaries

- Always:
  - preserve source bytes and immutable fuse artifacts；
  - require explicit reviewer decisions and exact written pitch；
  - verify source/proposal preconditions before mutation；
  - validate structural and fusion no-regression after mutation；
  - emit a new corrected file and auditable patch plan。
- Ask first:
  - enable unattended `high-confidence` application；
  - apply missing-note insertion or unsupported-note deletion；
  - support human-performance MIDI；
  - expose writeback to App、Library、Bridge or managed files；
  - add a dependency or widen a `web-core` public API。
- Never:
  - overwrite source MusicXML/MXL or mutate a fuse run；
  - infer enharmonic spelling, staff, voice, duration, tie, slur or articulation from MIDI alone；
  - write a patch when source/proposal hashes or note preconditions do not match；
  - claim accuracy improvement from fusion consistency alone；
  - send score or MIDI bytes to a remote service。

## Acceptance Criteria

1. `apply-fusion` 可从 compatible fuse run 和 reviewed decisions 生成新的 corrected MusicXML/MXL。
2. 每个 applied pitch patch 有 proposal、source locator、before/after facts 和 precondition hash。
3. plain MusicXML 与 MXL 都只改变批准的 pitch；MXL 非 root entries 保持内容不变。
4. source bytes、fuse run 与用户 decisions 不被修改；已有 output directory 稳定失败。
5. hash/source drift、ambiguous compatibility、unsupported operation 与 validation regression 均稳定失败。
6. corrected score 可 view、可 playback，结构差异仅包含批准的 pitch paths。
7. corrected score 重新 fusion 后 coverage 不下降、pitch agreement 不下降，applied disagreement 消失。
8. K331 development corpus 覆盖成功与拒绝案例；Flower Day 只验证结构和 consistency，不宣称 accuracy。
9. 不新增 runtime dependency，不修改 App、Library、Bridge 或 managed-file contract。

## Open Questions for Approval

1. 是否批准将 mutation 设计为独立 `apply-fusion` 命令，而不是扩展 `fuse --repair-mode`？
2. 是否批准 v1 只回写人工审核的 pitch correction，missing/extra 继续 report-only？
3. 是否批准 reviewer 必须明确填写 `writtenPitch`，系统 v1 不自动选择 enharmonic spelling？
4. 是否批准 `high-confidence` 自动应用作为后续独立切片，待 K331 与独立 corpus 校准后再开启？
5. 是否批准“回写”只生成新的 corrected score，永不提供原文件 in-place overwrite？
