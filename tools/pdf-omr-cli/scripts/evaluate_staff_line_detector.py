#!/usr/bin/env python3
"""Evaluate the compact detector against frozen OLiMPiC development mappings."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from staff_line_reconstruction import SystemEvidence, extract_row_peaks, group_staffs_by_connectors, select_complete_staffs


MODEL_SIZE = (512, 768)
ARCHITECTURE = "compact-dilated-staff-line-cnn-v2"


def systems_match_truth(
    predicted: list[dict[str, object]], truth: list[dict[str, object]], *, truth_page_height: int
) -> bool:
    if len(predicted) != len(truth):
        return False
    for candidate, expected in zip(predicted, truth, strict=True):
        bbox = candidate["normalizedBBox"]
        truth_bbox = expected["boundingBox"]
        center = bbox["y"] + bbox["height"] / 2
        truth_top = truth_bbox["top"] / truth_page_height
        truth_bottom = (truth_bbox["top"] + truth_bbox["height"]) / truth_page_height
        if not truth_top <= center <= truth_bottom:
            return False
    return True


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def raw_system_candidate(system: SystemEvidence, *, page_index: int) -> dict[str, object]:
    top = max(0, system.top - 1) / MODEL_SIZE[1]
    bottom = min(MODEL_SIZE[1], system.bottom + 1) / MODEL_SIZE[1]
    line_ys = [line / MODEL_SIZE[1] for staff in system.staffs for line in staff.lines]
    return {
        "pageIndex": page_index,
        "confidence": round(min(staff.confidence for staff in system.staffs), 10),
        "normalizedBBox": {"x": 0, "y": round(top, 10), "width": 1, "height": round(bottom - top, 10)},
        "staffCount": len(system.staffs),
        "staffLinePolylines": [
            [{"x": 0, "y": round(y, 10)}, {"x": 1, "y": round(y, 10)}] for y in line_ys
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-root", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime", choices=("pytorch", "onnxruntime"), default="pytorch")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    render_manifest_bytes = (args.render_root / "manifest.json").read_bytes()
    render_manifest = json.loads(render_manifest_bytes)
    if args.runtime == "pytorch":
        import torch

        from train_staff_line_segmenter import build_model, choose_device

        device = choose_device(args.device)
        model = build_model(ARCHITECTURE).to(device)
        model.load_state_dict(torch.load(args.checkpoint, map_location=device, weights_only=True))
        model.eval()

        def predict(tensor: np.ndarray) -> np.ndarray:
            with torch.no_grad():
                return model(torch.from_numpy(tensor).to(device)).sigmoid().cpu().numpy()[0, 0]

    else:
        if args.device not in ("auto", "cpu"):
            raise ValueError("ONNX Runtime evaluation is CPU-only")
        import onnxruntime

        session = onnxruntime.InferenceSession(args.checkpoint.read_bytes(), providers=["CPUExecutionProvider"])

        def predict(tensor: np.ndarray) -> np.ndarray:
            logits = session.run(["staff_line_logits"], {"page": tensor})[0][0, 0]
            return 1 / (1 + np.exp(-logits))
    report_items = []
    admitted_page_count = 0
    works_with_admitted_page = 0
    for item in render_manifest["items"]:
        work_id = item["itemId"].removeprefix("olimpic-").removesuffix("-full-page")
        mapping_path = args.corpus_root / "dev" / work_id / "source-mapping.json"
        mapping_bytes = mapping_path.read_bytes()
        mapping = json.loads(mapping_bytes)
        pages = []
        work_admitted_pages = 0
        for page, truth_page in zip(item["pages"], mapping["pages"], strict=True):
            with Image.open(args.render_root / page["path"]) as source:
                image = source.convert("L").resize(MODEL_SIZE, Image.Resampling.BILINEAR)
            image_array = np.asarray(image, dtype=np.uint8)
            tensor = (1 - image_array.astype(np.float32) / 255)[None, None]
            probability = predict(tensor)
            staffs = select_complete_staffs(extract_row_peaks(probability))
            systems = group_staffs_by_connectors(image_array, staffs)
            raw_systems = [raw_system_candidate(system, page_index=page["pageIndex"]) for system in systems]
            matches = systems_match_truth(raw_systems, truth_page["systems"], truth_page_height=truth_page["height"])
            admitted_page_count += int(matches)
            work_admitted_pages += int(matches)
            pages.append(
                {
                    "pageIndex": page["pageIndex"],
                    "renderSha256": page["renderSha256"],
                    "status": "admitted" if matches else "not-admitted",
                    "expectedSystemCount": len(truth_page["systems"]),
                    "detectedSystemCount": len(raw_systems),
                    "rawOutput": {
                        "schemaVersion": "1.0.0",
                        "pageIndex": page["pageIndex"],
                        "systems": raw_systems,
                    },
                }
            )
        works_with_admitted_page += int(work_admitted_pages > 0)
        report_items.append(
            {"itemId": item["itemId"], "sourceMappingSha256": sha256(mapping_bytes), "admittedPageCount": work_admitted_pages, "pages": pages}
        )

    report = {
        "schemaVersion": "1.0.0",
        "status": "viability-passed" if works_with_admitted_page >= 2 else "viability-failed",
        "model": {
            "architecture": ARCHITECTURE,
            "checkpointSha256": sha256(args.checkpoint.read_bytes()),
            "inputSize": list(MODEL_SIZE),
            "runtime": args.runtime,
        },
        "parameters": {
            "probabilityThreshold": 0.9,
            "horizontalCoverageThreshold": 0.3,
            "minimumConnectorCoverage": 0.85,
            "maximumStaffCount": 3,
        },
        "renderManifestSha256": sha256(render_manifest_bytes),
        "summary": {
            "pageCount": sum(len(item["pages"]) for item in report_items),
            "admittedPageCount": admitted_page_count,
            "workCount": len(report_items),
            "worksWithAdmittedPage": works_with_admitted_page,
        },
        "items": report_items,
    }
    args.output.write_bytes(canonical_json(report))
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
