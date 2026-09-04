#!/usr/bin/env python3
"""Evaluate the single compact multi-head layout candidate on OLiMPiC development pages."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from train_layout_segmenter import ARCHITECTURE, MODEL_SIZE, build_model
from validate_layout_diagnostic_truth import validate_diagnostic_truth


GAUSSIAN_SIGMA = 6
MINIMUM_CENTER_DISTANCE = 100
MINIMUM_CENTER_SCORE = 0.5
FIXED_RESEARCH_STAFF_COUNT = 3
SYSTEM_BOX_HEIGHT = 0.11


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def gaussian_smooth_1d(score: np.ndarray, sigma: int) -> np.ndarray:
    if score.ndim != 1 or sigma < 1:
        raise ValueError("system score must be one-dimensional and sigma must be positive")
    radius = sigma * 4
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-(offsets**2) / (2 * sigma**2))
    kernel /= kernel.sum()
    return np.convolve(score, kernel, mode="same")


def detect_system_centers(
    score: np.ndarray, *, gaussian_sigma: int, minimum_distance: int, minimum_score: float
) -> list[int]:
    smoothed = gaussian_smooth_1d(score, gaussian_sigma)
    candidates = [
        index
        for index in range(1, len(smoothed) - 1)
        if smoothed[index] >= minimum_score
        and smoothed[index] > smoothed[index - 1]
        and smoothed[index] >= smoothed[index + 1]
    ]
    selected: list[int] = []
    for index in sorted(candidates, key=lambda candidate: (-smoothed[candidate], candidate)):
        if all(abs(index - accepted) >= minimum_distance for accepted in selected):
            selected.append(index)
    return sorted(selected)


def raw_system_candidate(center_y: int, *, confidence: float, page_index: int) -> dict[str, object]:
    normalized_center = center_y / MODEL_SIZE[1]
    top = max(0.0, normalized_center - SYSTEM_BOX_HEIGHT / 2)
    bottom = min(1.0, normalized_center + SYSTEM_BOX_HEIGHT / 2)
    if bottom - top < SYSTEM_BOX_HEIGHT:
        top = max(0.0, bottom - SYSTEM_BOX_HEIGHT)
        bottom = min(1.0, top + SYSTEM_BOX_HEIGHT)
    relative_line_ys = [
        0.1,
        0.13,
        0.16,
        0.19,
        0.22,
        0.44,
        0.47,
        0.5,
        0.53,
        0.56,
        0.78,
        0.81,
        0.84,
        0.87,
        0.9,
    ]
    line_ys = [top + relative * (bottom - top) for relative in relative_line_ys]
    return {
        "pageIndex": page_index,
        "confidence": round(confidence, 10),
        "normalizedBBox": {
            "x": 0.05,
            "y": round(top, 10),
            "width": 0.9,
            "height": round(bottom - top, 10),
        },
        "staffCount": FIXED_RESEARCH_STAFF_COUNT,
        "staffLinePolylines": [
            [{"x": 0.05, "y": round(y, 10)}, {"x": 0.95, "y": round(y, 10)}] for y in line_ys
        ],
    }


def systems_match_topology(
    predicted: list[dict[str, object]],
    truth: list[dict[str, object]],
    truth_page_height: int,
    expected_staff_counts: list[int] | None = None,
) -> bool:
    expected_staff_counts = expected_staff_counts or [FIXED_RESEARCH_STAFF_COUNT] * len(truth)
    if len(predicted) != len(truth) or len(expected_staff_counts) != len(truth):
        return False
    for candidate, expected, expected_staff_count in zip(
        predicted, truth, expected_staff_counts, strict=True
    ):
        bbox = candidate["normalizedBBox"]
        center = bbox["y"] + bbox["height"] / 2
        truth_bbox = expected["boundingBox"]
        truth_top = truth_bbox["top"] / truth_page_height
        truth_bottom = (truth_bbox["top"] + truth_bbox["height"]) / truth_page_height
        if candidate["staffCount"] != expected_staff_count or not truth_top <= center <= truth_bottom:
            return False
    return True


def _save_overlay(
    image: Image.Image,
    truth_page: dict[str, object],
    centers: list[int],
    output_path: Path,
) -> str:
    overlay = image.convert("RGB")
    draw = ImageDraw.Draw(overlay)
    for system in truth_page["systems"]:
        bbox = system["boundingBox"]
        top = round(bbox["top"] / truth_page["height"] * MODEL_SIZE[1])
        bottom = round((bbox["top"] + bbox["height"]) / truth_page["height"] * MODEL_SIZE[1])
        draw.rectangle((0, top, MODEL_SIZE[0] - 1, bottom), outline=(0, 180, 0), width=2)
    for center in centers:
        draw.line((0, center, MODEL_SIZE[0] - 1, center), fill=(220, 0, 0), width=2)
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
    parser.add_argument("--runtime", choices=("pytorch", "onnxruntime"), default="pytorch")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    truth_bytes = args.diagnostic_truth.read_bytes()
    diagnostic_truth = json.loads(truth_bytes)
    validate_diagnostic_truth(diagnostic_truth, args.corpus_root)
    diagnostic_by_work = {item["workId"]: item for item in diagnostic_truth["items"]}
    render_manifest_bytes = (args.render_root / "manifest.json").read_bytes()
    render_manifest = json.loads(render_manifest_bytes)
    if args.runtime == "pytorch":
        import torch

        from train_staff_line_segmenter import choose_device

        device = choose_device(args.device)
        model = build_model(ARCHITECTURE).to(device)
        model.load_state_dict(torch.load(args.checkpoint, map_location=device, weights_only=True))
        model.eval()

        def predict_system_probability(tensor: np.ndarray) -> np.ndarray:
            with torch.no_grad():
                _, system_logits = model(torch.from_numpy(tensor).to(device))
                return system_logits.sigmoid().cpu().numpy()[0, 0]

    else:
        if args.device not in ("auto", "cpu"):
            raise ValueError("ONNX Runtime evaluation is CPU-only")
        import onnxruntime

        session = onnxruntime.InferenceSession(args.checkpoint.read_bytes(), providers=["CPUExecutionProvider"])

        def predict_system_probability(tensor: np.ndarray) -> np.ndarray:
            logits = session.run(["system_band_logits"], {"page": tensor})[0][0, 0]
            return 1 / (1 + np.exp(-logits))

    report_items = []
    exact_page_count = 0
    works_with_exact_page = 0
    for item in render_manifest["items"]:
        work_id = item["itemId"].removeprefix("olimpic-").removesuffix("-full-page")
        mapping_path = args.corpus_root / "dev" / work_id / "source-mapping.json"
        mapping_bytes = mapping_path.read_bytes()
        mapping = json.loads(mapping_bytes)
        diagnostic_pages = {
            page["samplePage"]: page for page in diagnostic_by_work[work_id]["pages"]
        }
        pages = []
        work_exact_pages = 0
        for page, truth_page in zip(item["pages"], mapping["pages"], strict=True):
            with Image.open(args.render_root / page["path"]) as source:
                image = source.convert("L").resize(MODEL_SIZE, Image.Resampling.BILINEAR)
            image_array = np.asarray(image, dtype=np.uint8)
            tensor = (1 - image_array.astype(np.float32) / 255)[None, None]
            system_probability = predict_system_probability(tensor)
            row_score = system_probability.mean(axis=1)
            centers = detect_system_centers(
                row_score,
                gaussian_sigma=GAUSSIAN_SIGMA,
                minimum_distance=MINIMUM_CENTER_DISTANCE,
                minimum_score=MINIMUM_CENTER_SCORE,
            )
            smoothed = gaussian_smooth_1d(row_score, GAUSSIAN_SIGMA)
            raw_systems = [
                raw_system_candidate(center, confidence=float(smoothed[center]), page_index=page["pageIndex"])
                for center in centers
            ]
            diagnostic_page = diagnostic_pages[truth_page["samplePage"]]
            expected_staff_counts = [system["visibleStaffCount"] for system in diagnostic_page["systems"]]
            matches = systems_match_topology(
                raw_systems, truth_page["systems"], truth_page["height"], expected_staff_counts
            )
            exact_page_count += int(matches)
            work_exact_pages += int(matches)
            page_record: dict[str, object] = {
                "pageIndex": page["pageIndex"],
                "renderSha256": page["renderSha256"],
                "status": "admitted" if matches else "not-admitted",
                "expectedSystemCount": len(truth_page["systems"]),
                "detectedSystemCount": len(raw_systems),
                "expectedStaffCounts": expected_staff_counts,
                "rawOutput": {"schemaVersion": "1.0.0", "pageIndex": page["pageIndex"], "systems": raw_systems},
            }
            if args.debug_overlay_root is not None:
                overlay_path = args.debug_overlay_root / work_id / f"page-{page['pageIndex'] + 1}.png"
                page_record["debugOverlaySha256"] = _save_overlay(image, truth_page, centers, overlay_path)
            pages.append(page_record)
        works_with_exact_page += int(work_exact_pages > 0)
        report_items.append(
            {
                "itemId": item["itemId"],
                "sourceMappingSha256": sha256(mapping_bytes),
                "admittedPageCount": work_exact_pages,
                "pages": pages,
            }
        )

    report = {
        "schemaVersion": "1.0.0",
        "status": "research-checkpoint-passed" if exact_page_count >= 20 and works_with_exact_page == 6 else "research-checkpoint-failed",
        "runtimeDecision": "stop-before-product-integration",
        "model": {
            "architecture": ARCHITECTURE,
            "checkpointSha256": sha256(args.checkpoint.read_bytes()),
            "inputSize": list(MODEL_SIZE),
            "runtime": args.runtime,
        },
        "parameters": {
            "gaussianSigma": GAUSSIAN_SIGMA,
            "minimumCenterDistance": MINIMUM_CENTER_DISTANCE,
            "minimumCenterScore": MINIMUM_CENTER_SCORE,
            "fixedResearchStaffCount": FIXED_RESEARCH_STAFF_COUNT,
            "systemBoxHeight": SYSTEM_BOX_HEIGHT,
        },
        "diagnosticTruthSha256": sha256(truth_bytes),
        "renderManifestSha256": sha256(render_manifest_bytes),
        "summary": {
            "pageCount": sum(len(item["pages"]) for item in report_items),
            "admittedPageCount": exact_page_count,
            "workCount": len(report_items),
            "worksWithAdmittedPage": works_with_exact_page,
        },
        "items": report_items,
    }
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json(report))
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
