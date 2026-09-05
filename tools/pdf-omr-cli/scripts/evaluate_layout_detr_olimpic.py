#!/usr/bin/env python3
"""Evaluate the pinned DETR v1 checkpoint on frozen OLiMPiC development pages."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

from evaluate_layout_segmenter import systems_match_topology
from layout_detr_metrics import decode_predictions, evaluate_page, summarize_pages
from layout_detr_targets import LABELS
from validate_layout_diagnostic_truth import validate_diagnostic_truth

SCORE_THRESHOLD = 0.5


ARCHITECTURE = "facebook-detr-resnet-50-layout-v1"
SHORTEST_EDGE = 512
LONGEST_EDGE = 768
PINNED_CHECKPOINT_SHA256 = "3b33d1160ac00a508725d1fab0843bc2541809ff26453ea12df71db67d030061"
PINNED_RENDER_MANIFEST_SHA256 = "fbc55413a9a5503bcb46a6cbbc57dbfc8662123c431dba6eba62df122adc81bc"
PINNED_DIAGNOSTIC_TRUTH_SHA256 = "977ae09486dd420bfaa7089fd7e071c03d65cbecf01a8af72f58c6a8e8b3526f"
UNET_BASELINE = {
    "admittedPageCount": 22,
    "pageCount": 29,
    "workCount": 6,
    "worksWithAdmittedPage": 6,
}


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def olimpic_detr_annotation(
    truth_page: dict[str, object], expected_staff_counts: list[int]
) -> dict[str, object]:
    if len(expected_staff_counts) != len(truth_page["systems"]):
        raise ValueError("expected staff counts must match truth systems")
    page_width = truth_page["width"]
    page_height = truth_page["height"]
    if not isinstance(page_width, int) or not isinstance(page_height, int) or page_width < 1 or page_height < 1:
        raise ValueError("truth page dimensions must be positive integers")
    systems = []
    for system, staff_count in zip(truth_page["systems"], expected_staff_counts, strict=True):
        if staff_count not in (1, 2, 3):
            raise ValueError("staffCount must be between one and three")
        bbox = system["boundingBox"]
        x = bbox["left"] / page_width
        y = bbox["top"] / page_height
        width = bbox["width"] / page_width
        height = bbox["height"] / page_height
        if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > 1 + 1e-9 or y + height > 1 + 1e-9:
            raise ValueError("truth bounding box must lie inside the page")
        systems.append(
            {
                "staffCount": staff_count,
                "normalizedBBox": {
                    "x": x,
                    "y": y,
                    "width": min(width, 1 - x),
                    "height": min(height, 1 - y),
                },
            }
        )
    return {"systems": systems}


def detr_predictions_to_system_candidates(
    predictions: list[dict[str, float | int]], *, page_index: int
) -> list[dict[str, object]]:
    candidates = []
    for prediction in predictions:
        label = prediction["label"]
        if not isinstance(label, int) or label not in range(len(LABELS)):
            raise ValueError("prediction label is outside the supported classes")
        width = float(prediction["width"])
        height = float(prediction["height"])
        center_x = float(prediction["centerX"])
        center_y = float(prediction["centerY"])
        candidates.append(
            {
                "pageIndex": page_index,
                "confidence": round(float(prediction["score"]), 10),
                "normalizedBBox": {
                    "x": center_x - width / 2,
                    "y": center_y - height / 2,
                    "width": width,
                    "height": height,
                },
                "staffCount": label + 1,
            }
        )
    return candidates


def systems_match_centers(
    predicted: list[dict[str, object]], truth: list[dict[str, object]], truth_page_height: int
) -> bool:
    if len(predicted) != len(truth):
        return False
    for candidate, expected in zip(predicted, truth, strict=True):
        bbox = candidate["normalizedBBox"]
        center = bbox["y"] + bbox["height"] / 2
        truth_bbox = expected["boundingBox"]
        truth_top = truth_bbox["top"] / truth_page_height
        truth_bottom = (truth_bbox["top"] + truth_bbox["height"]) / truth_page_height
        if not truth_top <= center <= truth_bottom:
            return False
    return True


def classify_olimpic_failure(
    predicted: list[dict[str, object]],
    truth: list[dict[str, object]],
    truth_page_height: int,
    expected_staff_counts: list[int],
) -> str | None:
    if systems_match_topology(predicted, truth, truth_page_height, expected_staff_counts):
        return None
    if len(predicted) != len(truth):
        return "count-mismatch"
    if systems_match_centers(predicted, truth, truth_page_height):
        return "class-mismatch"
    return "center-out-of-band"


def _save_overlay(
    image: Image.Image,
    truth_page: dict[str, object],
    predicted: list[dict[str, object]],
    output_path: Path,
) -> str:
    overlay = image.convert("RGB")
    draw = ImageDraw.Draw(overlay)
    width, height = overlay.size
    for system in truth_page["systems"]:
        bbox = system["boundingBox"]
        top = round(bbox["top"] / truth_page["height"] * height)
        bottom = round((bbox["top"] + bbox["height"]) / truth_page["height"] * height)
        left = round(bbox["left"] / truth_page["width"] * width)
        right = round((bbox["left"] + bbox["width"]) / truth_page["width"] * width)
        draw.rectangle((left, top, right, bottom), outline=(0, 180, 0), width=2)
    for candidate in predicted:
        bbox = candidate["normalizedBBox"]
        left = round(bbox["x"] * width)
        top = round(bbox["y"] * height)
        right = round((bbox["x"] + bbox["width"]) * width)
        bottom = round((bbox["y"] + bbox["height"]) * height)
        center = round((bbox["y"] + bbox["height"] / 2) * height)
        draw.rectangle((left, top, right, bottom), outline=(220, 120, 0), width=2)
        draw.line((0, center, width - 1, center), fill=(220, 0, 0), width=2)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(output_path, format="PNG", optimize=False, compress_level=9)
    return sha256(output_path.read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-root", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--diagnostic-truth", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--debug-overlay-root", type=Path)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")

    truth_bytes = args.diagnostic_truth.read_bytes()
    if sha256(truth_bytes) != PINNED_DIAGNOSTIC_TRUTH_SHA256:
        raise ValueError("diagnostic truth hash drift")
    diagnostic_truth = json.loads(truth_bytes)
    validate_diagnostic_truth(diagnostic_truth, args.corpus_root)
    diagnostic_by_work = {item["workId"]: item for item in diagnostic_truth["items"]}

    render_manifest_bytes = (args.render_root / "manifest.json").read_bytes()
    if sha256(render_manifest_bytes) != PINNED_RENDER_MANIFEST_SHA256:
        raise ValueError("render manifest hash drift")
    render_manifest = json.loads(render_manifest_bytes)

    checkpoint_model = args.checkpoint / "model.safetensors"
    if sha256(checkpoint_model.read_bytes()) != PINNED_CHECKPOINT_SHA256:
        raise ValueError("checkpoint hash drift")

    import torch
    from transformers import DetrForObjectDetection, DetrImageProcessor

    from train_staff_line_segmenter import choose_device

    torch.manual_seed(20260904)
    torch.use_deterministic_algorithms(True)
    device = choose_device(args.device)
    processor = DetrImageProcessor.from_pretrained(args.checkpoint, local_files_only=True)
    processor.size = {"shortest_edge": SHORTEST_EDGE, "longest_edge": LONGEST_EDGE}
    model = DetrForObjectDetection.from_pretrained(args.checkpoint, local_files_only=True)
    if model.config.num_labels != len(LABELS):
        raise ValueError("checkpoint label count does not match DETR v1")
    model = model.to(device)
    model.eval()

    report_items = []
    page_metrics = []
    exact_page_count = 0
    localization_exact_page_count = 0
    works_with_exact_page = 0
    failure_class_counts: dict[str, int] = {}
    predicted_by_class = [0, 0, 0]
    raw_predictions = []
    with torch.no_grad():
        for item in render_manifest["items"]:
            work_id = item["itemId"].removeprefix("olimpic-").removesuffix("-full-page")
            mapping_path = args.corpus_root / "dev" / work_id / "source-mapping.json"
            mapping_bytes = mapping_path.read_bytes()
            mapping = json.loads(mapping_bytes)
            diagnostic_pages = {page["samplePage"]: page for page in diagnostic_by_work[work_id]["pages"]}
            pages = []
            work_exact_pages = 0
            for page, truth_page in zip(item["pages"], mapping["pages"], strict=True):
                with Image.open(args.render_root / page["path"]) as source:
                    image = source.convert("RGB")
                encoded = processor(images=image, return_tensors="pt")
                if float(encoded["pixel_mask"].float().mean()) != 1.0:
                    raise ValueError("DETR v1 OLiMPiC probe requires unpadded single-page inputs")
                output = model(
                    pixel_values=encoded["pixel_values"].to(device),
                    pixel_mask=encoded["pixel_mask"].to(device),
                )
                predictions = decode_predictions(
                    output.logits[0].cpu().numpy(),
                    output.pred_boxes[0].cpu().numpy(),
                    threshold=SCORE_THRESHOLD,
                    activation="softmax",
                    class_count=len(LABELS),
                )
                diagnostic_page = diagnostic_pages[truth_page["samplePage"]]
                expected_staff_counts = [system["visibleStaffCount"] for system in diagnostic_page["systems"]]
                annotation = olimpic_detr_annotation(truth_page, expected_staff_counts)
                raw_systems = detr_predictions_to_system_candidates(
                    predictions, page_index=page["pageIndex"]
                )
                matches = systems_match_topology(
                    raw_systems, truth_page["systems"], truth_page["height"], expected_staff_counts
                )
                localization_matches = systems_match_centers(
                    raw_systems, truth_page["systems"], truth_page["height"]
                )
                failure_class = classify_olimpic_failure(
                    raw_systems,
                    truth_page["systems"],
                    truth_page["height"],
                    expected_staff_counts,
                )
                exact_page_count += int(matches)
                localization_exact_page_count += int(localization_matches)
                work_exact_pages += int(matches)
                if failure_class is not None:
                    failure_class_counts[failure_class] = failure_class_counts.get(failure_class, 0) + 1
                for candidate in raw_systems:
                    predicted_by_class[candidate["staffCount"] - 1] += 1
                page_metrics.append(evaluate_page(predictions, annotation))
                page_record: dict[str, object] = {
                    "pageIndex": page["pageIndex"],
                    "renderSha256": page["renderSha256"],
                    "status": "admitted" if matches else "not-admitted",
                    "topologyExact": matches,
                    "localizationExact": localization_matches,
                    "primaryFailureClass": failure_class,
                    "expectedSystemCount": len(truth_page["systems"]),
                    "detectedSystemCount": len(raw_systems),
                    "expectedStaffCounts": expected_staff_counts,
                    "predictedStaffCounts": [candidate["staffCount"] for candidate in raw_systems],
                    "rawOutput": {
                        "schemaVersion": "1.0.0",
                        "pageIndex": page["pageIndex"],
                        "systems": raw_systems,
                    },
                }
                if args.debug_overlay_root is not None:
                    overlay_path = args.debug_overlay_root / work_id / f"page-{page['pageIndex'] + 1}.png"
                    _save_overlay(image, truth_page, raw_systems, overlay_path)
                pages.append(page_record)
                raw_predictions.append(
                    {
                        "itemId": item["itemId"],
                        "pageIndex": page["pageIndex"],
                        "predictions": predictions,
                    }
                )
            works_with_exact_page += int(work_exact_pages > 0)
            report_items.append(
                {
                    "itemId": item["itemId"],
                    "sourceMappingSha256": sha256(mapping_bytes),
                    "admittedPageCount": work_exact_pages,
                    "pages": pages,
                }
            )

    detr_metrics = summarize_pages(page_metrics)
    page_count = sum(len(item["pages"]) for item in report_items)
    beats_baseline = exact_page_count > UNET_BASELINE["admittedPageCount"] and works_with_exact_page == 6
    raw_bytes = canonical_json(raw_predictions)
    report = {
        "schemaVersion": "1.0.0",
        "status": "research-checkpoint-passed" if beats_baseline else "research-checkpoint-failed",
        "runtimeDecision": "stop-before-product-integration",
        "model": {
            "architecture": ARCHITECTURE,
            "checkpointSha256": PINNED_CHECKPOINT_SHA256,
            "imageSize": {"longestEdge": LONGEST_EDGE, "shortestEdge": SHORTEST_EDGE},
            "runtime": "pytorch",
            "device": str(device),
            "scoreThreshold": SCORE_THRESHOLD,
            "labels": list(LABELS),
        },
        "baseline": {
            "id": "compact-layout-unet-v1",
            **UNET_BASELINE,
        },
        "diagnosticTruthSha256": PINNED_DIAGNOSTIC_TRUTH_SHA256,
        "renderManifestSha256": PINNED_RENDER_MANIFEST_SHA256,
        "predictionsSha256": hashlib.sha256(raw_bytes).hexdigest(),
        "summary": {
            "pageCount": page_count,
            "admittedPageCount": exact_page_count,
            "localizationExactPageCount": localization_exact_page_count,
            "workCount": len(report_items),
            "worksWithAdmittedPage": works_with_exact_page,
            "predictedByClass": predicted_by_class,
            "failureClassCounts": failure_class_counts,
            "detrBoxExactPages": detr_metrics["topologyExactPages"],
            "detrClassExact": detr_metrics["classExact"],
            "beatsUNetBaseline": beats_baseline,
        },
        "items": report_items,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json(report))
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
