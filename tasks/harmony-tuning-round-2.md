# Harmony tuning round 2: observed bass candidate

## Frozen baseline

Selection corpus: Mozart DCML `tune` split after source-spelling round, report schema 2.4.

- Top-1 accuracy: 0.3332145614
- Top-8 oracle recall: 0.6810677594
- Resolved precision: 0.5074637814
- Resolved coverage: 0.8095789536
- Interval accuracy: 0.3681334996
- Tolerant boundary F1: 0.5835705571
- All-family candidate-miss weight: 407560 ticks
- Inversion candidate-miss weight: 195040 ticks

The K331 eval report remains excluded from candidate selection.

## Falsifiable hypothesis

When a learned bass catalog exists, candidate generation currently replaces the chord variant derived from the segment's observed sounding bass. In inversion misses, 123160 of 209440 ticks already contain the correct base chord but omit the correct bass. Always retaining the observed-bass variant before adding learned catalog variants should reduce inversion candidate-miss weight without increasing Top-K.

## Acceptance gate

- Inversion candidate-miss duration weight decreases.
- Top-8 oracle recall does not decrease.
- Resolved precision, Top-1, interval accuracy, and tolerant boundary F1 do not decrease by more than 0.005.
- Alternatives remain deduplicated and capped at eight.
- No ranker weight, threshold, sequence score, or boundary setting changes.

If the gate fails, revert this candidate rather than changing selection policy in the same round.

## Tune result

Candidate report: `/private/tmp/mozart-tune-observed-bass-2.4.json` (local, not committed).

- Inversion candidate-miss weight: 195040 → 189880 ticks (-2.6%).
- Top-8 oracle recall: 0.6810677594 → 0.6913118356.
- Top-1 accuracy: 0.3332145614 → 0.3371340341.
- Resolved precision and coverage: unchanged.
- Interval accuracy and tolerant boundary F1: unchanged.

The candidate passes every gate. The modest inversion reduction relative to the 123160-tick base-present opportunity indicates that Top-8 slot selection still discards many observed-bass variants; that policy remains a separate future round.
