#!/usr/bin/env python3
"""Audit gapped system-band targets on a frozen layout slice without training."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from build_openscore_layout_dataset import (
    MINIMUM_INTER_SYSTEM_GAP_PX,
    SystemBandGapError,
    draw_system_band_mask,
    inter_system_background_rows,
    system_band_rectangles,
)
from train_layout_segmenter import MODEL_SIZE


PINNED_SLICE_SHA256 = "dc64fe27d26a109ee20736d6e8fe028da44f7e399f0fcc9fd7ef339df26172e3"


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def annotation_path(root: Path, page: dict[str, object]) -> Path:
    image_path = (root / page["imagePath"]).resolve()
    if not image_path.is_relative_to(root.resolve()):
        raise ValueError(f"page artifact escapes dataset root: {image_path}")
    return image_path.with_suffix(".json")


def audit_page(root: Path, page: dict[str, object]) -> dict[str, object]:
    path = annotation_path(root, page)
    annotation = json.loads(path.read_bytes())
    record = {
        "imagePath": page["imagePath"],
        "pageIndex": page["pageIndex"],
        "scoreId": page["scoreId"],
        "systemCount": len(annotation["systems"]),
    }
    try:
        filled = draw_system_band_mask(annotation, MODEL_SIZE)
        gapped = draw_system_band_mask(
            annotation, MODEL_SIZE, minimum_inter_system_gap_px=MINIMUM_INTER_SYSTEM_GAP_PX
        )
        rectangles = system_band_rectangles(
            annotation, MODEL_SIZE, minimum_inter_system_gap_px=MINIMUM_INTER_SYSTEM_GAP_PX
        )
        bands = [(top, bottom) for _left, top, _right, bottom in rectangles]
        gaps = inter_system_background_rows(bands)
        record.update(
            {
                "status": "ok",
                "filledMaskSha256": sha256(filled.tobytes()),
                "gappedMaskSha256": sha256(gapped.tobytes()),
                "unchanged": filled.tobytes() == gapped.tobytes(),
                "minimumBackgroundRows": min(gaps) if gaps else None,
                "horizontalBBoxes": [[left, right] for left, _top, right, _bottom in rectangles],
            }
        )
        if gaps and min(gaps) < MINIMUM_INTER_SYSTEM_GAP_PX:
            raise ValueError("gapped mask violated the registered inter-system gap")
    except SystemBandGapError as error:
        record.update({"status": "excluded", "reason": str(error)})
    return record


def audit_split(root: Path, pages: list[dict[str, object]]) -> dict[str, object]:
    records = [audit_page(root, page) for page in pages]
    excluded = [record for record in records if record["status"] == "excluded"]
    ok = [record for record in records if record["status"] == "ok"]
    return {
        "pageCount": len(records),
        "okPageCount": len(ok),
        "excludedPageCount": len(excluded),
        "unchangedPageCount": sum(bool(record.get("unchanged")) for record in ok),
        "gappedPageCount": sum(not record.get("unchanged") for record in ok),
        "pages": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    slice_bytes = args.slice.read_bytes()
    if sha256(slice_bytes) != PINNED_SLICE_SHA256:
        raise ValueError("slice hash drift")
    plan = json.loads(slice_bytes)
    root = args.dataset_root.resolve()
    report = {
        "schemaVersion": "1.0.0",
        "minimumInterSystemGapPx": MINIMUM_INTER_SYSTEM_GAP_PX,
        "modelSize": list(MODEL_SIZE),
        "sliceSha256": PINNED_SLICE_SHA256,
        "train": audit_split(root, plan["train"]),
        "validation": audit_split(root, plan["validation"]),
    }
    payload = canonical_json(report)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    print(
        json.dumps(
            {
                "reportSha256": sha256(payload),
                "train": {
                    "okPageCount": report["train"]["okPageCount"],
                    "excludedPageCount": report["train"]["excludedPageCount"],
                    "unchangedPageCount": report["train"]["unchangedPageCount"],
                    "gappedPageCount": report["train"]["gappedPageCount"],
                },
                "validation": {
                    "okPageCount": report["validation"]["okPageCount"],
                    "excludedPageCount": report["validation"]["excludedPageCount"],
                    "unchangedPageCount": report["validation"]["unchangedPageCount"],
                    "gappedPageCount": report["validation"]["gappedPageCount"],
                },
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
