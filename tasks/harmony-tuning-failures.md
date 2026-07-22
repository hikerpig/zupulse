# Harmony tuning rejected candidates

## Hybrid candidate pool inside primary decoder

- Target: resolved-wrong oracle-hit weight (326800 ticks on Mozart tune).
- Change: supply the learned hybrid Top-8 pool to every dynamic-programming range while keeping rule sequence scores.
- Result: rejected before accuracy comparison. The tune evaluation exceeded four minutes without completing, versus roughly 90–120 seconds for the frozen candidate.
- Cause: nearest-prototype ranking moved from final decoded segments into every legal range and multiplied runtime by the range/candidate search space.
- Decision: fully reverted. Do not retry without a range-level ranker cache or a fixed-boundary second pass; runtime may not be traded for held-out accuracy.

K331 was not run.

## Train-only PAVA primary confidence

- Target: reduce ECE, then increase coverage at or above the corrected Mozart tune precision floor.
- Train/tune result: accepted provisionally. A 100-bin weighted PAVA asset selected threshold `0.23`; Mozart tune precision rose from `0.5075` to `0.5135`, coverage from `0.8096` to `0.8385`, and ECE fell from `0.2365` to `0.0587`.
- Frozen K331 result: all local gates passed (Top-1 `0.6373`, Top-8 `0.9549`, precision `0.4766`, coverage `0.7869`, boundary F1 `0.7905`, ECE `0.2362`).
- Cross-corpus result: rejected. Schumann ECE regressed from `0.0910` to `0.1560`, exceeding the frozen `0.005` tolerance. Mozart, Chopin, Beethoven, and POP909 baseline comparisons passed; ASAP ingestion passed.
- Decision: reverted the bundled calibration and threshold commit in full. Kept only the generic train-only evaluator, provenance, PAVA, and threshold-selection infrastructure for a future independently calibrated cross-corpus round. Baselines were not moved.

## Fixed-boundary hybrid primary rerank

- Target: resolved-wrong oracle-hit weight (343120 ticks after onset correction).
- Change: keep rule-decoded ranges, then run a `maxSpan=1` hybrid second pass with unchanged sequence and transition scores.
- Result: rejected. Mozart tune coverage fell from 0.8096 to 0.5317, interval accuracy from 0.3681 to 0.2287, and precision from 0.5075 to 0.5039; Top-1 was effectively unchanged.
- Cause: learned-local candidate confidence does not describe a sequence-selected primary, so the existing threshold rejects many second-pass choices. The alternate pool also failed to improve the primary duration accuracy before calibration.
- Decision: fully reverted. Keep the rule-only primary path for this algorithm version and rebuild confidence independently.

K331 was not run.

## Linear primary reranker without rule-primary feature

- Target: fixed-boundary Top-8 primary selection on v3 train/tune records.
- Change: 58 candidate features with listwise SGD, but no indicator for the existing rule primary.
- Result: rejected as an invalid baseline. Train-fit Top-1 fell from `0.6254` to `0.5485`; tune fell from `0.5982` to `0.5794`.
- Cause: alternatives rank is not the rule primary. Without an explicit primary feature, the model cannot represent the safe identity policy of preserving the existing selection.
- Decision: upgraded the feature contract to v2 with a rule-primary indicator before making the linear-versus-MLP decision.

No final holdout was run.

## Linear primary reranker v2

- Target: aggregate tune Top-1 improvement of at least `0.05`, with no corpus regression beyond `0.005`.
- Change: 59 features, including rule-primary, trained with corpus/group-balanced listwise SGD.
- Result: improved train-fit by `0.0251` and tune by `0.0228`. Every tune corpus improved, but the aggregate promotion threshold was not met.
- Decision: do not publish or integrate the linear asset. The similar train/tune gains and consistent per-corpus direction satisfy Checkpoint D's condition to compare one offline small MLP on the same records.

Full hashes and per-corpus metrics are recorded in [`harmony-linear-reranker-checkpoint.md`](harmony-linear-reranker-checkpoint.md). No final holdout was run.
