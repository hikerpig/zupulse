# Harmony tuning rejected candidates

## Hybrid candidate pool inside primary decoder

- Target: resolved-wrong oracle-hit weight (326800 ticks on Mozart tune).
- Change: supply the learned hybrid Top-8 pool to every dynamic-programming range while keeping rule sequence scores.
- Result: rejected before accuracy comparison. The tune evaluation exceeded four minutes without completing, versus roughly 90–120 seconds for the frozen candidate.
- Cause: nearest-prototype ranking moved from final decoded segments into every legal range and multiplied runtime by the range/candidate search space.
- Decision: fully reverted. Do not retry without a range-level ranker cache or a fixed-boundary second pass; runtime may not be traded for held-out accuracy.

K331 was not run.

## Fixed-boundary hybrid primary rerank

- Target: resolved-wrong oracle-hit weight (343120 ticks after onset correction).
- Change: keep rule-decoded ranges, then run a `maxSpan=1` hybrid second pass with unchanged sequence and transition scores.
- Result: rejected. Mozart tune coverage fell from 0.8096 to 0.5317, interval accuracy from 0.3681 to 0.2287, and precision from 0.5075 to 0.5039; Top-1 was effectively unchanged.
- Cause: learned-local candidate confidence does not describe a sequence-selected primary, so the existing threshold rejects many second-pass choices. The alternate pool also failed to improve the primary duration accuracy before calibration.
- Decision: fully reverted. Keep the rule-only primary path for this algorithm version and rebuild confidence independently.

K331 was not run.
