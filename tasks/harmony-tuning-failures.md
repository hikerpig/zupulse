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
