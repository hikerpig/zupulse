---
status: implemented
date: 2026-08-08
owner: Engineering
scope: Desktop PDF OMR Workbench image input and reviewed MIDI correction
parent: docs/specs/2026-08-05-desktop-pdf-omr-workbench.md
---

# Desktop 识谱工作台图片导入与 MIDI 修正

## Objective

继续扩展 Desktop-only 识谱实验工作台：输入除 PDF 外支持单页 PNG/JPEG；初步识别成功后，用户可导入同曲、
同编曲的 score-export MIDI，查看可安全回写的音高冲突，并为每个要应用的冲突明确选择书面音高。系统生成新的
corrected MXL，重新用于临时预览与导出，原始输入、初步识别结果和 MIDI 均不覆盖。

本切片复用已经实现的 `fuse` 与 `apply-fusion`，不引入第二套 alignment 或 MusicXML mutation。

## Assumptions

1. “图片”首轮指单页 `.png`、`.jpg`、`.jpeg`；不包含多页 TIFF、HEIC 或把多张图片自动合并为一份谱。
2. 图片识别首轮只由 Audiveris 承担；其他 engine 继续只接受 PDF。
3. MIDI 只接受制谱软件导出的 `score-export` MIDI；真人演奏 MIDI 不作为回写依据。
4. “修正回写”指已有 `apply-fusion` 的 reviewed pitch patch：用户必须明确选择 enharmonic spelling；
   missing-note、extra-note、tie、非零 transposition 和 ambiguous proposal 不自动回写。
5. corrected MXL 是 session-scoped 临时结果，不进入 Library，不覆盖初步识别 MXL。

## User Flow

1. 用户通过同一个原生 picker 选择 PDF、PNG 或 JPEG；页面显示安全文件摘要和输入类型。
2. 图片输入时工作台只允许选择支持图片的 Audiveris；PDF 继续使用已有 engine 列表。
3. 初步识别成功后，用户选择一份 `.mid` / `.midi` 并运行 deterministic fusion。
4. 页面显示 compatibility、coverage、pitch agreement、writeback-ready 数量和 review-only 数量。
5. 对每个 writeback-ready pitch proposal，用户从所有与目标 MIDI 音高一致的合法书面拼写中明确选择一项。
6. 用户应用至少一项选择后，Main 执行 `apply-fusion`；成功后预览与导出切换到 corrected MXL。

## Bridge Contract

- `pdfOmr.select` returns `inputKind: "pdf" | "image"`.
- Engine capabilities expose `inputKinds` so Renderer can disable incompatible engines without guessing by ID.
- `pdfOmr.selectMidi` returns only one-time token, file name, and byte size.
- `pdfOmr.analyzeMidi` consumes the MIDI token and returns bounded, path-free compatibility metrics and proposals.
- `pdfOmr.applyMidiCorrections` accepts only proposal IDs and explicit `writtenPitch`; Main reconstructs the hash-bound
  decision set and returns the corrected transient result.
- Every cross-process request and response is validated by strict Zod schemas.

## Project Structure

- `tools/pdf-omr-cli/src/`: generalized input inspection and a narrow public MIDI-correction API.
- `apps/desktop-shell/src/main/`: file token selection, session-owned fusion/writeback state, Bridge handlers.
- `packages/web-core/src/bridge/`: strict contracts.
- `packages/web-viewer/src/features/pdf-omr/`: host port types.
- `packages/web-viewer/src/app/pages/`: workbench interaction and presentation.
- `packages/app-i18n/`: all new user-visible copy.

## Code Style

```ts
const request = createBridgeRequest("pdfOmr.applyMidiCorrections", crypto.randomUUID(), {
  jobId,
  decisions: selections.map(({ proposalId, writtenPitch }) => ({ proposalId, writtenPitch })),
});
```

Use named exports, strict Zod, double quotes, conditional spreads for absent optional fields, and no absolute paths in
Renderer-visible values.

## Testing Strategy

- CLI unit/integration: PNG/JPEG inspection and direct Audiveris image recognition path.
- Main unit: picker extension filtering, MIDI token isolation, correction session orchestration and immutable result selection.
- Bridge schema: valid and invalid image/MIDI/correction messages.
- UI: image engine gating, MIDI compatibility summary, explicit spelling selection, corrected preview/export.
- Desktop E2E: extend only if the fake engine path can exercise the new journey deterministically.

## Commands

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/pipeline.test.ts
pnpm vitest run packages/web-core/src/bridge packages/web-viewer/src/app/pages/__tests__/PdfOmrPage.test.tsx
pnpm vitest run apps/desktop-shell/src/main/__tests__
pnpm check:i18n
pnpm desktop:build
pnpm verify:fast
pnpm format:check
git diff --check
```

## Boundaries

- Always: preserve all source bytes; consume file tokens in Main; apply only hash-bound writeback-ready pitch proposals;
  validate corrected score before publication.
- Ask first: human-performance MIDI, automatic enharmonic choice, missing-note insertion, note deletion, multi-image books,
  Library persistence, or a new dependency.
- Never: expose paths or raw exceptions; overwrite PDF/image/MIDI/initial MXL; silently replace OMR structure with MIDI;
  describe fusion consistency as recognition accuracy.

## Acceptance Criteria

1. Desktop picker accepts PDF, PNG and JPEG while rejecting unrelated files; Renderer never receives a path.
2. PNG/JPEG can complete the existing inspect-recognize-validate-export pipeline through an image-capable engine.
3. Incompatible engines are disabled for image input before starting a job.
4. After a successful initial extraction, a score-export MIDI can produce path-free compatibility metrics and proposals.
5. Only writeback-ready pitch proposals with an explicit user-selected written pitch can be applied.
6. Successful application publishes a newly validated corrected MXL for preview/export and leaves the initial MXL immutable.
7. Ambiguous/incompatible MIDI and review-only proposals remain inspectable but cannot mutate the score.
8. Browser/iPad capabilities, Library facts and managed score bytes remain unchanged.
