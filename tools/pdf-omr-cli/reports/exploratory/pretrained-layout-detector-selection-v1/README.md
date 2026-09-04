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

## Stop conditions

- Stop if the exact model artifact lacks an acceptable, recorded distribution license.
- Stop if the environment cannot reproduce the same raw predictions under the fixed seed and model identity.
- Stop after the registered balanced-validation run if any class misses its exact threshold; do not search
  page-specific thresholds or query filters.
- Passing this probe does not authorize a product dependency or runtime integration.
