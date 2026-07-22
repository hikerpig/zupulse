# Harmony tuning round 5: cross-measure onset correctness

## Frozen baseline

Selection corpus: Mozart DCML `tune` after observed-bass slot selection, report schema 2.4.

- Top-1 accuracy: 0.3511194251
- Top-8 oracle recall: 0.7672367718
- Resolved precision: 0.5074637814
- Resolved coverage: 0.8095789536
- Interval accuracy: 0.3681334996
- Tolerant boundary F1: 0.5835705571

K331 remains excluded from selection.

## Falsifiable hypothesis

Onset features compare only offsets and therefore omit notes at the start of later measures inside a multi-measure range. Comparing complete written moments should make learned candidate evidence correct and may improve Top-8 without changing the rule-only primary path.

## Acceptance gate

- Top-8 does not decrease.
- Top-1 does not decrease by more than 0.005.
- Resolved precision, coverage, interval accuracy, and tolerant boundary F1 do not decrease by more than 0.005.
- No candidate templates, scores, threshold, sequence, or boundary settings change.

If the gate fails, retain the regression test but do not change production feature semantics until the ranker asset is retrained.

## Tune result

Candidate report: `/private/tmp/mozart-tune-cross-measure-onsets-2.4.json` (local, not committed).

- Top-1 accuracy: 0.3511194251 → 0.3726765247.
- Top-8 oracle recall: 0.7672367718 → 0.7975236059.
- Resolved precision, coverage, and ECE: unchanged.
- Interval accuracy and tolerant boundary F1: unchanged because the primary path is rule-only.

The candidate passes every gate and closes the known cross-measure onset correctness defect.
