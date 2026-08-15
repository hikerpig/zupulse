# LEGATO CLI Engine 设计

## Objective

为 `tools/pdf-omr-cli` 增加本地 `legato` engine，使用户可以通过现有 `recognize` 命令将最多三页的
排版乐谱 PDF 转换为 engine-neutral `OmrScoreDraft`，并保留 LEGATO 原生 ABC 与转换后的
MusicXML。该能力仅属于隔离的实验 CLI 和 benchmark，不接入 `apps/*`。

## Commands

```bash
PDF_OMR_LEGATO_PYTHON=/absolute/path/to/python \
PDF_OMR_LEGATO_REPOSITORY=/absolute/path/to/legato-demo \
PDF_OMR_LEGATO_MODEL=/absolute/path/to/model \
  pnpm pdf-omr -- recognize input.pdf --engine legato --output result

pnpm benchmark:pdf-omr -- \
  --manifest tools/pdf-omr-cli/corpus/evaluation/manifest.json \
  --engine legato \
  --output result
```

安装与验证必须锁定 model revision、repository revision 和 artifact hashes。模型权重及外部
repository 不提交到本仓库。

## Runtime Contract

- Engine ID: `legato`.
- Input: readable PDF with `1..3` pages.
- Preprocessing: render and pad every page independently to portrait-letter aspect using the same semantics as the
  official Hugging Face Demo. Do not concatenate pages before inference because the fixed decoder budget can end
  after the first declared voice.
- Inference: `max_length=2048`, `num_beams=1`, `repetition_penalty=1.1`.
- Inference precision: CUDA and MPS use float16; CPU uses checkpoint-configured dtype.
- Default inference timeout: `3600000 ms`.
- Native output: one UTF-8 ABC tune per page plus a combined multi-tune ABC evidence file.
- Conversion: run the pinned official `abc2xml.py` once per page in an isolated process, then append matching
  MusicXML parts and renumber their measures.
- Normalization input: converted MusicXML.
- Output validity: every declared part on every page MUST contain at least one note; empty parts fail closed with
  the page number and part ID.
- Required native artifacts:
  - `raw-output.abc`
  - `converted.musicxml`
  - `pages/page-NNN.abc`
  - `pages/page-NNN.musicxml`
- Canonical artifacts MUST NOT contain Hugging Face tokens, absolute source paths, raw stderr, or exception stacks.

## Project Structure

- `tools/pdf-omr-cli/src/engines/legato.ts`: adapter and environment inspection.
- `tools/pdf-omr-cli/src/engines/legato-page-merge.ts`: deterministic page artifact validation and merge.
- `tools/pdf-omr-cli/src/normalizers/legato.ts`: MusicXML-to-Draft normalization boundary.
- `tools/pdf-omr-cli/src/__tests__/legato-adapter.test.ts`: adapter process and artifact contract.
- `tools/pdf-omr-cli/src/normalizers/__tests__/legato.test.ts`: deterministic normalization tests.
- `tools/pdf-omr-cli/engines/legato-environment.json`: locked upstream revisions, hashes, runtime, and parameters.
- `tools/pdf-omr-cli/README.md`: setup and usage.

## Code Style

Follow repository conventions: named exports, double quotes, exact optional fields omitted when absent, Zod at
process and persisted-data boundaries, and stable `PdfOmrError` codes.

```ts
export function createLegatoAdapter(options: LegatoAdapterOptions): OmrEngineAdapter {
  return {
    async inspectEnvironment(signal) {
      // Validate every locked external input before inference.
    },
  };
}
```

## Testing Strategy

- Small tests fake only external processes and assert observable adapter artifacts and error classification.
- Normalizer tests use minimal ABC-derived MusicXML fixtures.
- Registry and CLI tests prove `--engine legato` is accepted only when required configuration exists.
- Existing Audiveris and Transcoda tests remain green.
- Manual large test runs `flower_day.pdf` locally and verifies that both declared piano parts contain notes on
  every page and in the combined MusicXML.

## Boundaries

- Always:
  - verify gated model access before download;
  - pin upstream revisions and hashes;
  - keep inference local after installation;
  - preserve raw ABC and converted MusicXML;
  - reject more than three pages deterministically.
- Ask first:
  - accepting Hugging Face or Meta gated-model terms;
  - adding App integration;
  - changing the engine-neutral Draft schema.
- Never:
  - commit model weights or access tokens;
  - bypass gated model access;
  - silently repair ambiguous ABC, rhythm, voice, or MusicXML failures;
  - send input files to a remote service from the local engine.

## Success Criteria

1. `recognize --engine legato` works with a fully local runtime after installation.
2. Environment inspection rejects missing, unapproved, mismatched, or unreadable model artifacts with stable
   errors.
3. A successful run produces canonical run metadata, `raw-output.abc`, `converted.musicxml`, `draft.json`, and
   diagnostics.
4. One-to-three-page PDFs use independent page inference; four or more pages fail before inference.
5. Unit tests, package typecheck, `pnpm verify:fast`, `pnpm format:check`, and `git diff --check` pass.
6. `flower_day.pdf` is run end-to-end locally and its per-page and combined artifacts are structurally inspected.

## Open Questions

- The Hugging Face account must first be approved for `guangyangmusic/legato`.
- Confirm whether the six assumptions stated in the task discussion are accepted as the implementation scope.
