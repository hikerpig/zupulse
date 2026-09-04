#!/usr/bin/env python3
"""Evaluate the compact detector against frozen OLiMPiC development mappings."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from staff_line_reconstruction import SystemEvidence, extract_row_peaks, group_staffs_by_connectors, select_complete_staffs
from validate_layout_diagnostic_truth import validate_diagnostic_truth


MODEL_SIZE = (512, 768)
ARCHITECTURE = "compact-dilated-staff-line-cnn-v2"


def classify_failure(
    oracle_staff_counts: list[int],
    reconstructed_staff_counts: list[int],
    grouped_staff_counts: list[int],
    *,
    grouped_matches: bool,
) -> str | None:
    expected = [3] * len(oracle_staff_counts)
    if grouped_matches:
        return None
    if any(actual < required for actual, required in zip(oracle_staff_counts, expected, strict=True)):
        return "mask-insufficient"
    if any(actual < required for actual, required in zip(reconstructed_staff_counts, expected, strict=True)):
        return "line-reconstruction-loss"
    if grouped_staff_counts != expected:
        return "grouping-loss"
    return "boundary-order-loss"


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


def staff_counts_by_truth_band(
    staffs: list[object], truth: list[dict[str, object]], *, truth_page_height: int
) -> list[int]:
    result = []
    for expected in truth:
        bbox = expected["boundingBox"]
        top = bbox["top"] / truth_page_height * MODEL_SIZE[1]
        bottom = (bbox["top"] + bbox["height"]) / truth_page_height * MODEL_SIZE[1]
        result.append(sum(top <= (staff.lines[0] + staff.lines[-1]) / 2 <= bottom for staff in staffs))
    return result


def systems_match_diagnostic_topology(
    systems: list[SystemEvidence], truth: list[dict[str, object]], *, truth_page_height: int
) -> bool:
    if len(systems) != len(truth):
        return False
    for system, expected in zip(systems, truth, strict=True):
        bbox = expected["boundingBox"]
        top = bbox["top"] / truth_page_height * MODEL_SIZE[1]
        bottom = (bbox["top"] + bbox["height"]) / truth_page_height * MODEL_SIZE[1]
        if len(system.staffs) != 3:
            return False
        if any(not top <= (staff.lines[0] + staff.lines[-1]) / 2 <= bottom for staff in system.staffs):
            return False
    return True


def save_oracle_overlay(
    image: Image.Image,
    truth_page: dict[str, object],
    oracle_staffs: list[object],
    systems: list[SystemEvidence],
    output_path: Path,
) -> str:
    overlay = image.convert("RGB")
    draw = ImageDraw.Draw(overlay)
    for expected in truth_page["systems"]:
        bbox = expected["boundingBox"]
        top = round(bbox["top"] / truth_page["height"] * MODEL_SIZE[1])
        bottom = round((bbox["top"] + bbox["height"]) / truth_page["height"] * MODEL_SIZE[1])
        draw.rectangle((0, top, MODEL_SIZE[0] - 1, bottom), outline=(0, 180, 0), width=2)
    for staff in oracle_staffs:
        center = round((staff.lines[0] + staff.lines[-1]) / 2)
        draw.line((0, center, MODEL_SIZE[0] - 1, center), fill=(0, 80, 220), width=1)
    for system in systems:
        center = round((system.top + system.bottom) / 2)
        draw.line((0, center, MODEL_SIZE[0] - 1, center), fill=(220, 0, 0), width=2)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(output_path, format="PNG", optimize=False, compress_level=9)
    return sha256(output_path.read_bytes())


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
    parser.add_argument("--diagnostic-truth", type=Path)
    parser.add_argument("--debug-overlay-root", type=Path)
    parser.add_argument("--runtime", choices=("pytorch", "onnxruntime"), default="pytorch")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    diagnostic_truth_bytes = args.diagnostic_truth.read_bytes() if args.diagnostic_truth is not None else None
    diagnostic_truth = json.loads(diagnostic_truth_bytes) if diagnostic_truth_bytes is not None else None
    if diagnostic_truth is not None:
        validate_diagnostic_truth(diagnostic_truth, args.corpus_root)
    diagnostic_by_work = (
        {item["workId"]: item for item in diagnostic_truth["items"]} if diagnostic_truth is not None else {}
    )

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
    topology_exact_page_count = 0
    failure_class_counts: dict[str, int] = {}
    for item in render_manifest["items"]:
        work_id = item["itemId"].removeprefix("olimpic-").removesuffix("-full-page")
        mapping_path = args.corpus_root / "dev" / work_id / "source-mapping.json"
        mapping_bytes = mapping_path.read_bytes()
        mapping = json.loads(mapping_bytes)
        pages = []
        work_admitted_pages = 0
        diagnostic_pages = (
            {page["samplePage"]: page for page in diagnostic_by_work[work_id]["pages"]}
            if work_id in diagnostic_by_work
            else {}
        )
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
            page_record: dict[str, object] = {
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
            if diagnostic_truth is not None:
                diagnostic_page = diagnostic_pages[truth_page["samplePage"]]
                expected_staff_counts = [system["visibleStaffCount"] for system in diagnostic_page["systems"]]
                if expected_staff_counts != [3] * len(truth_page["systems"]):
                    raise ValueError("this oracle evaluator currently requires three-staff diagnostic truth")
                oracle_staffs = select_complete_staffs(
                    extract_row_peaks(probability, probability_threshold=0.5, coverage_threshold=0.1)
                )
                oracle_counts = staff_counts_by_truth_band(
                    oracle_staffs, truth_page["systems"], truth_page_height=truth_page["height"]
                )
                reconstructed_counts = staff_counts_by_truth_band(
                    staffs, truth_page["systems"], truth_page_height=truth_page["height"]
                )
                topology_matches = systems_match_diagnostic_topology(
                    systems, truth_page["systems"], truth_page_height=truth_page["height"]
                )
                failure_class = classify_failure(
                    oracle_counts,
                    reconstructed_counts,
                    [len(system.staffs) for system in systems],
                    grouped_matches=topology_matches,
                )
                topology_exact_page_count += int(topology_matches)
                if failure_class is not None:
                    failure_class_counts[failure_class] = failure_class_counts.get(failure_class, 0) + 1
                page_record["diagnostic"] = {
                    "topologyExact": topology_matches,
                    "primaryFailureClass": failure_class,
                    "expectedStaffCounts": expected_staff_counts,
                    "oracleStaffCounts": oracle_counts,
                    "reconstructedStaffCounts": reconstructed_counts,
                    "groupedStaffCounts": [len(system.staffs) for system in systems],
                }
                if args.debug_overlay_root is not None:
                    overlay_path = args.debug_overlay_root / work_id / f"page-{page['pageIndex'] + 1}.png"
                    page_record["debugOverlaySha256"] = save_oracle_overlay(
                        image, truth_page, oracle_staffs, systems, overlay_path
                    )
            pages.append(page_record)
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
        **(
            {"diagnosticTruthSha256": sha256(diagnostic_truth_bytes)}
            if diagnostic_truth_bytes is not None
            else {}
        ),
        "summary": {
            "pageCount": sum(len(item["pages"]) for item in report_items),
            "admittedPageCount": admitted_page_count,
            "workCount": len(report_items),
            "worksWithAdmittedPage": works_with_admitted_page,
            **(
                {
                    "topologyExactPageCount": topology_exact_page_count,
                    "failureClassCounts": failure_class_counts,
                }
                if diagnostic_truth is not None
                else {}
            ),
        },
        "items": report_items,
    }
    args.output.write_bytes(canonical_json(report))
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
