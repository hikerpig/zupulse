# Harmony tuning rejected candidates

## Hybrid candidate pool inside primary decoder

- Target: resolved-wrong oracle-hit weight (326800 ticks on Mozart tune).
- Change: supply the learned hybrid Top-8 pool to every dynamic-programming range while keeping rule sequence scores.
- Result: rejected before accuracy comparison. The tune evaluation exceeded four minutes without completing, versus roughly 90–120 seconds for the frozen candidate.
- Cause: nearest-prototype ranking moved from final decoded segments into every legal range and multiplied runtime by the range/candidate search space.
- Decision: fully reverted. Do not retry without a range-level ranker cache or a fixed-boundary second pass; runtime may not be traded for held-out accuracy.

K331 was not run.
