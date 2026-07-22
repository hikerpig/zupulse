# Harmony tuning round 3: observed bass slot

## Frozen baseline

Selection corpus: Mozart DCML `tune` split after observed-bass candidate generation, report schema 2.4.

- Top-1 accuracy: 0.3371340341
- Top-8 oracle recall: 0.6913118356
- Resolved precision: 0.5074637814
- Resolved coverage: 0.8095789536
- Interval accuracy: 0.3681334996
- Tolerant boundary F1: 0.5835705571
- Inversion candidate-miss weight: 189880 ticks

K331 remains excluded from selection.

## Falsifiable hypothesis

Round 2 generates an observed-bass variant, but hybrid selection still ranks variants solely by learned local score and often removes that variant at Top-8. When a base chord first receives a hybrid slot, swapping its observed-bass variant into that position should improve inversion candidate recall while preserving the same base-chord diversity and Top-K size.

## Acceptance gate

- Inversion candidate-miss duration weight decreases.
- Top-8 oracle recall increases or remains unchanged.
- Top-1 does not decrease by more than 0.005.
- Resolved precision, coverage, interval accuracy, and tolerant boundary F1 do not decrease by more than 0.005.
- No candidate generation, ranker weight, threshold, sequence score, or boundary setting changes.

If the gate fails, revert the slot policy and retain round 2 only.

## Tune result

Candidate report: `/private/tmp/mozart-tune-observed-bass-slot-2.4.json` (local, not committed).

- Inversion candidate-miss weight: 189880 → 108240 ticks (-43.0%).
- Top-8 oracle recall: 0.6913118356 → 0.7672367718.
- Top-1 accuracy: 0.3371340341 → 0.3511194251.
- Resolved precision and coverage: unchanged.
- Interval accuracy and tolerant boundary F1: unchanged.

The candidate passes every gate. It improves diversity within the existing Top-8 rather than expanding the candidate budget.
