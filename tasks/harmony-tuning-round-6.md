# Harmony tuning round 6: primary confidence calibration

## Frozen choice

- Feature: deterministic `primary-local-margin-v1`. A sequence-selected candidate below the local first place receives a lower raw margin confidence; diagnostics are evaluator-only and are not persisted.
- Calibration: 100-bin weighted PAVA trained only on `dcml-mozart-v2.3` train groups, rounded to two decimals and bundled as seven monotonic steps.
- Threshold rule, declared before tune inspection: meet corrected tune precision `0.5074637814`, then maximize coverage; break ties toward the lower threshold.
- Selected threshold: `0.23`.

## Provenance and isolation

- Corpus revision: `v2.3@5337257a5318711e6302cfe85c3f1a6ade3c6271`.
- Training groups SHA-256: `5e5e684b46c076c1065f3501fa3acacc1bb262ab85669a6c367773930177fab4`.
- Training report SHA-256: `0c729e2cf74595f9e5722a312f95e14094c2be56584acb3683a0a30965261647`.
- Two generated assets were byte-identical: `82ed647cd70de4e5028d7038032d47e21c1c05c8bb66b76ab9c971ec741a3d87`.
- Source license and attribution are embedded in the bundled asset: CC-BY-NC-SA-4.0, DCMLab Mozart Piano Sonatas.
- K331 and all eval groups were not run while fitting or selecting.

## Mozart tune gate

| Metric             | Frozen pre-calibration | Calibrated / threshold 0.23 |
| ------------------ | ---------------------: | --------------------------: |
| Top-1              |                 0.3727 |                      0.3727 |
| Top-8              |                 0.7975 |                      0.7975 |
| Resolved precision |                 0.5075 |                      0.5135 |
| Resolved coverage  |                 0.8096 |                      0.8385 |
| ECE                |                 0.2365 |                      0.0587 |

The tune gate passed: precision improved, coverage increased by 0.0289, ECE dropped by 0.1778, and ranking metrics were unchanged.

## Commands

```sh
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json --data-root /private/tmp/harmony-data --case dcml-mozart-v2.3 --split train --decision-threshold 0 --raw-confidence
pnpm -s harmony:cli calibrate /private/tmp/mozart-train-raw-confidence-2.5.json --case dcml-mozart-v2.3
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json --data-root /private/tmp/harmony-data --case dcml-mozart-v2.3 --split tune --decision-threshold 0
pnpm -s harmony:cli select-threshold /private/tmp/mozart-tune-calibrated-2.5.json --case dcml-mozart-v2.3 --precision-floor 0.5074637814047314
```
