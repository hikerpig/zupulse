# Pretrained layout detector selection v1

Status: research boundary review; no package or model weight was downloaded.

## Decision

Use `facebook/detr-resnet-50` as the first pretrained detector probe after explicit approval. Keep
TorchVision Faster R-CNN as the fallback only after its selected weight artifact receives a separate license review.

This decision is narrower than selecting a production runtime. The probe remains isolated from App, Bridge,
Desktop runtime, and product dependencies.

## Why DETR first

The preceding `layout-object-center-v1` experiment proved that the two-dimensional system/staff object targets can
represent all 640 pages, but its dense heatmap head produced repeated local maxima and reached only 3/128 exact
validation pages. DETR supplies two missing mechanisms rather than merely adding capacity:

- global two-dimensional context through its encoder/decoder;
- one-to-one bipartite assignment between object queries and target boxes.

The probe will replace DETR's classification head with three foreground classes:

- `system-1-staff`
- `system-2-staff`
- `system-3-staff`

Staff centers remain separate `staff` objects only if the minimal system-only probe cannot recover ordered staff
centers from local image evidence. This is a deliberate Occam gate: do not train a fourth class before it is shown
to be necessary.

## License and dependency evidence

| Candidate                 | Framework / model-card evidence                                                                                                          | Selection consequence                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `facebook/detr-resnet-50` | Hugging Face model card marks the artifact as Apache-2.0; the checkpoint is about 167 MB                                                 | Preferred research probe, subject to recording the exact revision and downloaded SHA-256                         |
| TorchVision Faster R-CNN  | TorchVision source is BSD-3-Clause, but its own README warns that pretrained weights may have separate terms derived from their datasets | Framework license alone is insufficient; do not download a weight until its artifact-specific terms are accepted |
| OLA / Ultralytics         | Prior target-domain and distribution-license gates failed                                                                                | Remains rejected; do not reopen without new evidence                                                             |

Primary sources:

- <https://huggingface.co/facebook/detr-resnet-50>
- <https://github.com/pytorch/vision/blob/main/LICENSE>
- <https://github.com/pytorch/vision#pre-trained-model-license>
- <https://docs.pytorch.org/tutorials/intermediate/torchvision_tutorial.html>

## Pre-registered experiment

1. Use the frozen topology slice SHA-256
   `452d828843d6b432cca80732bb5f668c2b3624b0677c987ccd193072d7bbc774`.
2. Record package versions, model revision, source URL, declared license, weight SHA-256, parameters, seed, device,
   image size, optimizer, and epoch count before reading validation results.
3. Train one system-only DETR candidate. Decode directly from class logits and predicted boxes; no per-page or
   per-work parameters.
4. Run the balanced 128-page validation once. Continue only if staff-count macro exact is at least 0.90 and every
   1/2/3-staff class is at least 0.85 exact.
5. If the count gate passes but ordered staff centers cannot be recovered from local image evidence, add one
   `staff` object class in a single registered follow-up. Otherwise stop.
6. Run the 29-page OLiMPiC development set only after the synthetic gate passes. The frozen holdout remains unread.

Frozen metric protocol: retain queries whose best foreground softmax score is at least `0.5`; a prediction matches
a truth system only when its center lies inside the truth box and its 1/2/3-staff class agrees. `classExact` is
`matched / max(truth, predicted)` so false positives and false negatives both reduce the score. `macroClassExact`
is the unweighted mean of the three classes. A page is topology-exact only when its complete reading-ordered
prediction sequence has the same length, matching class, and an in-box center for every truth system.

Frozen training protocol: 10 epochs, batch size 4, 512-pixel shortest edge, 768-pixel longest edge, AdamW with
`1e-4` detector/transformer learning rate, `1e-5` backbone learning rate and `1e-4` weight decay. Pages containing
the rare 1-staff class receive 4x sampling weight. Validation is not evaluated between epochs and therefore cannot
select an epoch. The isolated environment pins Python 3.13.3, Pillow 11.1.0, SciPy 1.16.1, timm 1.0.19, PyTorch
2.8.0, TorchVision 0.23.0, and Transformers 4.54.0.

Pinned source revision: `557a3b6fcdb1be415f074c22da2e16ab4f7e8265`.

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `README.md`                | `bc7d74d96a9101113c06be3a90975510dd19671382eb6fdfc5d1edbb042a723b` |
| `config.json`              | `e7bcf3992363f27717a863f14b193140ad2e41d4338ee012730e58a92cae17e6` |
| `preprocessor_config.json` | `84084dff7cb5f0ab9394adc87f34d813a4e0c3d7ad56aa7d73d775174ffaca3f` |
| `pytorch_model.bin`        | `9400d5a6a433c73bb3440f42daab69a7b728b4bce0922904ac4779cb04e08989` |

## Target adapter checkpoint

The dependency-free `layout_detr_targets.py` adapter converts the existing normalized topology annotations to the
COCO detection input accepted by `DetrImageProcessor`. It validates bounds, positive box dimensions, supported
staff counts, and agreement between `staffCount` and the number of staff-line polylines before emitting a target.
Objects are sorted by `(y, x)` and use count-conditioned class IDs `0..2`.

The frozen 640-page slice converted without exclusions:

| Split      | Pages | 1-staff objects | 2-staff objects | 3-staff objects | Canonical target SHA-256                                           |
| ---------- | ----: | --------------: | --------------: | --------------: | ------------------------------------------------------------------ |
| train      |   512 |              88 |             799 |           1,211 | `a62d86ec7f983b51c33b20dadb05ba18e7cbfe71bb9ecebd30895cf2577bb93d` |
| validation |   128 |              40 |              69 |             373 | `85f37998cb021c6eee3d7e2aa32a9ebefa1ec58bf3c3b806a4843cae4ec696ce` |

This proves only that the input contract is lossless for the selected system objects. It does not count as model
or metric evidence.

## DETR v1 result

The approved pinned run completed all 10 pre-registered epochs and evaluated the balanced validation exactly once.
It did not pass the synthetic gate and therefore did not run OLiMPiC.

| Metric               |                      Result |            Gate |
| -------------------- | --------------------------: | --------------: |
| topology-exact pages |                   109 / 128 | diagnostic only |
| 1-staff class exact  |              0 / 40 = 0.000 |         >= 0.85 |
| 2-staff class exact  |    63 / max(69, 70) = 0.900 |         >= 0.85 |
| 3-staff class exact  | 366 / max(373, 376) = 0.973 |         >= 0.85 |
| macro class exact    |                       0.624 |         >= 0.90 |

Fixed-threshold localization confusion, with rows `truth 1/2/3-staff` and columns `predicted 1/2/3-staff/miss`, was
`[[0,0,1,39],[0,63,0,6],[0,1,366,6]]`. The failure is concentrated rather than a general system-localization
collapse.

System-box normalized-height five-number summaries (`min / q1 / median / q3 / max`) provide a concrete scale
explanation:

| Split / class      | Normalized height                            |
| ------------------ | -------------------------------------------- |
| train 1-staff      | `0.0132 / 0.0216 / 0.0241 / 0.0259 / 0.0313` |
| validation 1-staff | `0.0135 / 0.0148 / 0.0209 / 0.0238 / 0.0238` |
| validation 2-staff | `0.0488 / 0.0689 / 0.0778 / 0.0901 / 0.1225` |
| validation 3-staff | `0.0842 / 0.1290 / 0.1403 / 0.1535 / 0.2144` |

- raw summary SHA-256: `83a75ea10bad301d458841628a253436638249c026830e29a3934dd898ce49a5`
- validation predictions SHA-256: `e1ba788af2b3671260a5c940cb0d23b77c18f47f54bee76f6cb8422093935b8c`
- trained safetensors SHA-256: `3b33d1160ac00a508725d1fab0843bc2541809ff26453ea12df71db67d030061`
- parameters: 41,502,152
- decision: `STOP_DETR_V1`

A later, separately approved OLiMPiC probe skipped the 1-staff synthetic gate and evaluated this same
checkpoint on the frozen 29-page development set. It reached 16/29 topology-exact pages and 5/6 works,
below the `compact-layout-unet-v1` 22/29 baseline, and is recorded as `STOP_DETR_V1_OLIMPIC` in
`reports/exploratory/detr-v1-olimpic-topology-v1/`.

The next hypothesis is materially different and is not authorized by the original DETR probe. The
[Deformable DETR paper](https://arxiv.org/abs/2010.04159) identifies DETR's limited feature spatial resolution and
reports its largest benefit on small objects by using multi-scale deformable attention. That mechanism matches the
observed scale-conditioned miss pattern better than threshold search or more epochs. The alternative is to first
obtain substantially more rights-cleared 1-staff pages; the current train evidence comes from only 13 pages despite
containing 88 systems. Stop here for a route decision.

## Proposed next boundary

If the multi-scale route is approved, prefer
[`Aryn/deformable-detr-DocLayNet`](https://huggingface.co/Aryn/deformable-detr-DocLayNet) revision
`c5946fb892bd99f527c0dd69577b9e9e55364f8f` over a second COCO-only initialization. Its model card marks the
checkpoint Apache-2.0, provides a safe 165 MB `model.safetensors`, and identifies DocLayNet as its training domain.
DocLayNet itself uses the Community Data License Agreement – Permissive 1.0. The document-layout prior is a
plausible transfer advantage, not established evidence for music scores.

Keep [`SenseTime/deformable-detr`](https://huggingface.co/SenseTime/deformable-detr) as the control/fallback. Its
model card also marks the checkpoint Apache-2.0 and documents COCO 2017 training, but it would repeat the same
natural-image source domain as DETR v1. Both candidates are natively supported by the already isolated Transformers
environment; neither has been downloaded.

The proposed run must retain the frozen split, metric definition, score threshold, input resolution, sampling,
optimizer, and one-time validation protocol from DETR v1. Only architecture and initialization may change. This
isolates whether multi-scale spatial resolution fixes the 1-staff miss pattern.

## Deformable DETR result

The approved DocLayNet-initialized run completed the same 10-epoch protocol on CPU. MPS was rejected during smoke
because PyTorch 2.8 does not implement `grid_sampler_2d_backward`; its documented CPU fallback was slower than a
fully CPU run. The final validation failed the synthetic gate and did not run OLiMPiC.

| Metric               | Single-scale DETR | DocLayNet Deformable DETR |            Gate |
| -------------------- | ----------------: | ------------------------: | --------------: |
| topology-exact pages |         109 / 128 |                  46 / 128 | diagnostic only |
| 1-staff class exact  |             0.000 |                     0.000 |         >= 0.85 |
| 2-staff class exact  |             0.900 |                     0.739 |         >= 0.85 |
| 3-staff class exact  |             0.973 |                     0.673 |         >= 0.85 |
| macro class exact    |             0.624 |                     0.471 |         >= 0.90 |

Fixed-threshold localization confusion for the multi-scale run was
`[[0,0,0,40],[0,51,3,15],[0,1,251,121]]`. Multi-scale features did not recover any 1-staff systems and also
regressed the common classes. Therefore the scale-only hypothesis is rejected rather than repaired with threshold,
epoch, or model-source search.

- source revision: `c5946fb892bd99f527c0dd69577b9e9e55364f8f`
- source `README.md` SHA-256: `1eccacf4a44a5e977ee5db38b777ac186375c7ac02f594ece5e7efdf4cb8363c`
- source `config.json` SHA-256: `01d2bd3356abd64b84b837294782b28a4052f1a36b19e3a9c7d84f75ee15d5e6`
- source `preprocessor_config.json` SHA-256:
  `48aaaeafe0e746877c41969391577458d8164ef1b22050fd3c330f713f81c556`
- source `model.safetensors` SHA-256: `e3861d34685d3b36e5f38370597daf98fb2f98a852cfa5c125035057ded06809`
- raw summary SHA-256: `653db33f6be0a4dfeff7b3a88376526431941c45f0db164ae120828858d614c8`
- validation predictions SHA-256: `6ec6bd2cf9e15c5808742b8e4353986fde8402005fb204ed474ed188fcad33f6`
- trained safetensors SHA-256: `82724e15447210adbcd5de47a8b04b3ffe15b39d3e783ec83c5c02013d8b532a`
- parameters: 41,023,217
- decision: `STOP_DEFORMABLE_DETR_COUNT_CLASS_V1`

The new hypothesis changes the target ontology rather than the detector family: predict class-agnostic `system`
and `staff` boxes, then count matched staff centers inside each system. This is the direct OLA-style decomposition
that the original research basis described. It removes the confound where the rare semantic class is also the
smallest box class: the same frozen train split contains only 88 1-staff system labels from 13 pages, but contains
2,098 systems and 5,319 staffs as class-agnostic objects. Validation contains 482 systems and 1,297 staffs. This
boundary was approved as the next probe.

## Pre-registered OLA-style probe

Train the original pinned DocLayNet Deformable DETR checkpoint with exactly two foreground classes, `system` and
`staff`. Derive each predicted system's staff count by assigning retained staff centers to containing predicted
system boxes. This follows OLA's hierarchical object decomposition while retaining the already licensed and pinned
DocLayNet initialization; it does not reuse either failed count-conditioned checkpoint.

The fixed training protocol is CPU, 6 epochs, batch size 4, 512-pixel shortest edge, 768-pixel longest edge, AdamW
with `1e-4` detector/transformer learning rate, `1e-5` backbone learning rate, and `1e-4` weight decay. Sampling is
uniform (`rareMultiplier=1`): after removing count-conditioned labels there is no rare training class, so repeating
the 13 pages that happen to contain 1-staff systems would distort the object distribution rather than balance it.
The score threshold remains `0.5`, and validation is read exactly once after epoch 6.

The balanced-validation gate remains staff-count macro exact >= 0.90 and every derived 1/2/3-staff class exact >=
0.85. System/staff object localization and topology-exact pages are reported as diagnostics. If the gate fails,
stop without OLiMPiC evaluation or threshold/epoch search. If it passes, freeze the containment assembly and run all
29 OLiMPiC development pages; the frozen holdout remains unread.

The dependency-free target adapter converted all pages without exclusions. Train emits 2,098 `system` and 5,319
`staff` objects (canonical target SHA-256
`574294e42ec2b70badbd636c8a1b6dadbb4d917bf1918b734f99f6dbe881dcc0`); validation emits 482 `system` and 1,297
`staff` objects (SHA-256 `f27b8f6833002565fa438770e202db297a0871cb9821446c23b795c1bed189e8`). Every one of the
6,616 staff-box centers lies inside its owning truth system box. A two-page, one-epoch CPU smoke completed training,
one-time validation, safe serialization, and canonical summary output; its accuracy is not model-quality evidence.

## OLA-style probe result

The approved run completed all 6 epochs. Training loss decreased from `11.1181` to `2.0119`, but the fixed `0.5`
threshold retained no object on the 128-page validation: `0 / 482` systems and `0 / 1,297` staffs. Consequently all
three derived staff-count class exact scores, macro exact, object exact scores, and topology-exact pages were zero.
The gate failed, so OLiMPiC was not evaluated.

This result establishes failure of the registered end-to-end protocol; it does not distinguish confidence
calibration, 6-epoch under-training, and target-ontology failure. Distinguishing those hypotheses would require a
new pre-registered experiment. Do not search validation thresholds or append epochs to this run.

- summary SHA-256: `14cd712b22781434653751f9d30efacbf2eb1a3ff304c3935256f8f30db11c1e`
- validation predictions SHA-256: `cd31a641f2550d1d2b5863a077911938a94061a716d86790d988a24033c2d464`
- trained safetensors SHA-256: `ea485227d3508decd8e10cd76c66355a6dce6621985303ffb7c33f681e7c13a2`
- decision: `STOP_DEFORMABLE_DETR_OLA_V1`

## Training-only failure diagnostic

The approved diagnostic did not reread validation or change the frozen gate. It selected 64 training pages by the
existing `selectionKey`: all 13 pages containing 1-staff systems, 25 non-overlapping pages containing 2-staff
systems, and 26 remaining pages. The ordered selection-key SHA-256 is
`904af6cf0cd62922ac7a7a15b401de53a0a871076863d9a0b1cb7ba6593f4e03`.

Even when each class retained exactly as many highest-scoring queries as there were truth objects, the trained
model localized only `84/303 = 0.277` systems and `154/688 = 0.224` staffs. No staff page and only two system pages
were top-N exact. The untrained, identically seeded two-class initialization localized `76/303 = 0.251` systems and
`73/688 = 0.106` staffs. Training therefore added limited staff signal but almost no system-localization signal; a
low fixed threshold is not the sole failure.

Confidence also moved in the wrong operational direction. Median per-page maximum sigmoid confidence changed from
`0.582` to `0.278` for systems and from `0.551` to `0.375` for staffs. All 64 trained-model page maxima were below
`0.5`. On a fixed four-page 1-staff training batch, classification loss improved from `3.274` to `0.441`, while box
loss regressed from `0.630` to `0.900` and GIoU loss remained `1.121`. The classifier primarily learned to suppress
queries while deterministic box regression did not converge.

The train/eval loss discrepancy identifies the mechanism. This model has no BatchNorm or module-form `Dropout`, but
the pinned Transformers implementation applies `p=0.1` functional dropout at 14 encoder/decoder sites based on
`self.training`. For the same saved checkpoint and fixed batch, stochastic `train()` loss ranged from `2.74` to
`4.37`, whereas deterministic `eval()` loss was `7.18`. Keeping `train()` mode but setting only those functional
dropout probabilities to zero reproduced `7.18` exactly. The failure is therefore a dropout-dependent stochastic
matching collapse, not checkpoint serialization, threshold-only calibration, or a rare-class-only failure.

- trained-model diagnostic SHA-256: `18e39a0c247ad18951f201f236c1a5602d10f9196bef96576b8490c66ef1ea98`
- untrained-control diagnostic SHA-256: `554353e740544c1e75b9eabf81d78c0e511897bf7d54053a8526ebf0311cdc6e`

A further experiment should first use a small training-only split to compare zero-dropout training against the
registered configuration, with deterministic eval box loss and top-N localization as its gate. It must not reuse
the 128-page validation until that miniature control shows a material deterministic-localization gain.

## DETR v1 OLiMPiC result

The approved follow-up loaded the pinned DETR v1 checkpoint and evaluated the 29 OLiMPiC development pages once
under the frozen `0.5` threshold, without 1-staff gating, threshold search, or holdout access. Staff count came
from the predicted class. The same Y-band topology contract as `compact-layout-unet-v1` scored 16/29 pages and
5/6 works; localization-only (ignore class) was 17/29. Predicted objects were `1-staff 0 / 2-staff 10 / 3-staff
112` against 121 three-staff truth systems. Failure classes were `center-out-of-band 9`, `count-mismatch 3`, and
`class-mismatch 1`. Two CPU runs produced identical prediction SHA-256
`dd62611ed161a238ed1c05d23f85af73974f80daef3e33fbe92545413c020096`.

Page overlap with the UNet baseline is `both 13 / unet-only 9 / detr-only 3 / neither 4`. DETR recovered three
dense `5862368` pages that UNet missed, and lost all five `4985990` pages that UNet admitted. The synthetic
3-staff class exact of 0.973 did not transfer to the scan domain at the 22/29 investment bar.

- decision: `STOP_DETR_V1_OLIMPIC`
- durable evidence: `tools/pdf-omr-cli/reports/exploratory/detr-v1-olimpic-topology-v1/`

Do not send Deformable DETR or OLA-style checkpoints to this 29-page set. The remaining layout investment, if
any, is scan-domain data for the compact UNet's seven failures rather than another detector family.

## Stop conditions

- Stop if the exact model artifact lacks an acceptable, recorded distribution license.
- Stop if the environment cannot reproduce the same raw predictions under the fixed seed and model identity.
- Stop after the registered balanced-validation run if any class misses its exact threshold; do not search
  page-specific thresholds or query filters.
- Passing this probe does not authorize a product dependency or runtime integration.
