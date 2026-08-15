# LEGATO Runtime Optimization

## Objective

降低 LEGATO benchmark 的 decoder 与重复模型加载成本，同时保留可复核的资源和质量证据。正式 baseline 为
`numBeams=1`、`maxLength=2048`、`repetitionPenalty=1.1`；CUDA/MPS 使用 FP16。

## Runtime Contract

- Normal `recognize` and unqualified benchmark commands MUST use the baseline.
- Explicit development experiments MAY use `numBeams=1..10`; decoder values MUST validate before process launch.
- Each page MUST report output tokens, configured limit, termination, device, and dtype without paths.
- A benchmark adapter MUST be reused sequentially and closed after the suite. Model load, cold request, and warm request
  timings MUST remain distinguishable.
- Timeout, abort, malformed protocol, and worker EOF MUST terminate the process tree.
- One-shot and worker modes MUST produce identical canonical recognition artifacts for equal inputs and parameters.
- Unix/macOS engine runs MUST sample process-group CPU and RSS. Missing probes MUST remain absent, never become zero.

## Beam Screening

The development-only helper runs `beam=1/2/4` with the same corpus, model, preprocessing, dtype, and max length. Its
comparison records measurements and whether every variant evaluated the same item set; it does not promote a baseline.

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/run_legato_ablation.ts \
  --manifest tools/pdf-omr-cli/corpus/evaluation/manifest.json \
  --output tools/pdf-omr-cli/reports/development/legato-ablation
```

The real development screening found no core-F1 benefit from beam 4 over beam 1 on the common evaluable set, while
beam 1 reduced recognition P50 by 84.94%. Holdout remains unread and `maxLength` remains 2048.

## Boundaries

- Preserve model/repository hashes, preprocessing, FP16, native artifacts, and fail-closed validation.
- Do not read holdout, add App integration, change dependencies, or change the Draft schema without a separate decision.
- Do not expose paths, stderr, or exception stacks in canonical artifacts.
