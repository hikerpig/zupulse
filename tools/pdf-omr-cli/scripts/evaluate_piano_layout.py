#!/usr/bin/env python3
"""Evaluate compact layout UNet on a piano full-page mapping with a fixed staff count."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from evaluate_layout_segmenter import (
    GAUSSIAN_SIGMA,
    MINIMUM_CENTER_DISTANCE,
    MINIMUM_CENTER_SCORE,
    MODEL_SIZE,
    detect_system_centers,
    gaussian_smooth_1d,
    raw_system_candidate,
    systems_match_topology,
)
from train_layout_segmenter import ARCHITECTURE, build_model


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def classify_failure(
    predicted: list[dict[str, object]],
    truth: list[dict[str, object]],
    truth_page_height: int,
    expected_staff_counts: list[int],
) -> str | None:
    if systems_match_topology(predicted, truth, truth_page_height, expected_staff_counts):
        return None
    if len(predicted) != len(truth):
        return "count-mismatch"
    centers_ok = True
    staff_ok = True
    for candidate, expected, expected_staff_count in zip(predicted, truth, expected_staff_counts, strict=True):
        bbox = candidate["normalizedBBox"]
        center = bbox["y"] + bbox["height"] / 2
        truth_bbox = expected["boundingBox"]
        truth_top = truth_bbox["top"] / truth_page_height
        truth_bottom = (truth_bbox["top"] + truth_bbox["height"]) / truth_page_height
        if not truth_top <= center <= truth_bottom:
            centers_ok = False
        if candidate["staffCount"] != expected_staff_count:
            staff_ok = False
    if not centers_ok:
        return "center-out-of-band"
    if not staff_ok:
        return "class-mismatch"
    return "count-mismatch"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-root", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--staff-count", type=int, default=2)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    if args.staff_count not in (1, 2, 3):
        raise ValueError("staff-count must be 1, 2, or 3")
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")

    mapping_bytes = args.mapping.read_bytes()
    mapping = json.loads(mapping_bytes)
    render_manifest_bytes = (args.render_root / "classic-probe.json").read_bytes() if (args.render_root / "classic-probe.json").is_file() else (args.render_root / "manifest.json").read_bytes()
    render_manifest = json.loads(render_manifest_bytes)
    render_pages = render_manifest["pages"] if "pages" in render_manifest else render_manifest["items"][0]["pages"]

    import torch

    from train_staff_line_segmenter import choose_device

    device = choose_device(args.device)
    model = build_model(ARCHITECTURE).to(device)
    model.load_state_dict(torch.load(args.checkpoint, map_location=device, weights_only=True))
    model.eval()

    exact_page_count = 0
    pages = []
    with torch.no_grad():
        for page, truth_page in zip(render_pages, mapping["pages"], strict=True):
            with Image.open(args.render_root / page["path"]) as source:
                image = source.convert("L").resize(MODEL_SIZE, Image.Resampling.BILINEAR)
            image_array = np.asarray(image, dtype=np.uint8)
            tensor = (1 - image_array.astype(np.float32) / 255)[None, None]
            _, system_logits = model(torch.from_numpy(tensor).to(device))
            system_probability = system_logits.sigmoid().cpu().numpy()[0, 0]
            row_score = system_probability.mean(axis=1)
            centers = detect_system_centers(
                row_score,
                gaussian_sigma=GAUSSIAN_SIGMA,
                minimum_distance=MINIMUM_CENTER_DISTANCE,
                minimum_score=MINIMUM_CENTER_SCORE,
            )
            smoothed = gaussian_smooth_1d(row_score, GAUSSIAN_SIGMA)
            expected_staff_counts = [system["visibleStaffCount"] for system in truth_page["systems"]]
            raw_systems = [
                raw_system_candidate(
                    center,
                    confidence=float(smoothed[center]),
                    page_index=page["pageIndex"],
                    staff_count=args.staff_count,
                )
                for center in centers
            ]
            matches = systems_match_topology(
                raw_systems, truth_page["systems"], truth_page["height"], expected_staff_counts
            )
            exact_page_count += int(matches)
            pages.append(
                {
                    "pageIndex": page["pageIndex"],
                    "renderSha256": page["renderSha256"],
                    "status": "admitted" if matches else "not-admitted",
                    "primaryFailureClass": classify_failure(
                        raw_systems, truth_page["systems"], truth_page["height"], expected_staff_counts
                    ),
                    "expectedSystemCount": len(truth_page["systems"]),
                    "detectedSystemCount": len(raw_systems),
                    "expectedStaffCounts": expected_staff_counts,
                    "predictedStaffCounts": [system["staffCount"] for system in raw_systems],
                }
            )

    report = {
        "schemaVersion": "1.0.0",
        "model": {
            "architecture": ARCHITECTURE,
            "checkpointSha256": sha256(args.checkpoint.read_bytes()),
            "staffCount": args.staff_count,
        },
        "mappingSha256": sha256(mapping_bytes),
        "summary": {
            "pageCount": len(pages),
            "admittedPageCount": exact_page_count,
        },
        "pages": pages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json(report))
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
