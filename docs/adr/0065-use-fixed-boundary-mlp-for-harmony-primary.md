---
status: accepted
---

# Use a fixed-boundary quantized MLP for harmony primary selection

Zupulse keeps rule decoding and postprocessing authoritative for Score Written Ranges, then uses a bundled `59 → 16 ReLU → 1` MLP to choose the primary Chord Symbol from each final Top-8. The MLP was accepted because its two-decimal JSON asset improved every v3 tune corpus and aggregate oracle-hit Top-1 by `0.0961` over the linear baseline, while measured P95 remained `0.9966x` of rule-only analysis; PyTorch remains an offline training tool and production inference is deterministic TypeScript.

Model logits, rule scores and confidence are separate quantities. The MLP cannot add candidates, change boundaries, enter beam-search sequence scores or become persisted confidence; primary confidence must be recalibrated only after the selector is frozen. A malformed asset fails schema validation, and `primaryRerankerModel: false` remains the explicit rule-only evaluation path.

This decision extends ADR 0053: its frequency ranker still builds Top-8 alternatives, while the quantized MLP selects primary only after rule boundary/postprocess. The model version is part of each new Analysis Revision's `algorithmVersion`.
