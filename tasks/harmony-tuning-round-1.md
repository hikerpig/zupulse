# Harmony tuning round 1: source pitch spelling

## Frozen baseline

Selection corpus: Mozart DCML `tune` split, report schema 2.3.

- Top-1 accuracy: 0.2142941980
- Top-8 oracle recall: 0.4443850585
- Resolved precision: 0.3193104713
- Resolved coverage: 0.8095789536
- Interval accuracy: 0.2247758209
- Tolerant boundary F1: 0.5835705571
- Root-error duration weight: 516760 ticks

The K331 eval report is descriptive evidence only and is not used to accept or tune this change.

## Falsifiable hypothesis

The candidate generator always converts pitch classes to sharp spellings. DCML note input already carries the source spelling, so flat-key passages can select the correct pitch class while being reported as exact-root errors. Keeping the duration-dominant source spelling per pitch class and using it for candidate roots and bass notes should reduce root-error duration weight on Mozart tune.

## Acceptance gate

- Root-error duration weight decreases.
- Resolved precision does not decrease by more than 0.005.
- Top-1, Top-8, interval accuracy, and tolerant boundary F1 do not decrease by more than 0.005.
- No ranker weight, decision threshold, candidate limit, or boundary setting changes in this round.

If the gate fails, revert the candidate and feature change rather than compensating with another parameter.

## Tune result

Candidate report: `/private/tmp/mozart-tune-source-spelling-2.3.json` (local, not committed).

- Root-error duration weight: 516760 → 225160 ticks (-56.4%).
- Top-1 accuracy: 0.2142941980 → 0.3332145614.
- Top-8 oracle recall: 0.4443850585 → 0.6810677594.
- Resolved precision: 0.3193104713 → 0.5074637814.
- Resolved coverage: unchanged at 0.8095789536.
- Interval accuracy: 0.2247758209 → 0.3681334996.
- Tolerant boundary F1: unchanged at 0.5835705571.
- ECE: 0.3888537769 → 0.2365288170.

The candidate passes every declared gate. MusicXML projection now supplies key-aware spellings too, so the change is not limited to the DCML adapter.
