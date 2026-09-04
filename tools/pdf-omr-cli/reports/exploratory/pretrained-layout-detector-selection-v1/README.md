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

## Stop conditions

- Stop if the exact model artifact lacks an acceptable, recorded distribution license.
- Stop if the environment cannot reproduce the same raw predictions under the fixed seed and model identity.
- Stop after the registered balanced-validation run if any class misses its exact threshold; do not search
  page-specific thresholds or query filters.
- Passing this probe does not authorize a product dependency or runtime integration.
