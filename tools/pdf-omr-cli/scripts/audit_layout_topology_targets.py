#!/usr/bin/env python3
"""Compare filled-band and row-center targets on a frozen topology slice."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from layout_topology_targets import build_center_energy_targets


def _component_count(active: np.ndarray) -> int:
    return int(active[0]) + int(np.sum(active[1:] & ~active[:-1]))


def audit_annotations(
    annotations: list[tuple[str, int, dict[str, object]]],
    *,
    height: int,
    system_sigma: int,
    staff_sigma: int,
) -> dict[str, object]:
    result: dict[str, object] = {
        "pageCount": len(annotations),
        "systemCount": 0,
        "staffCount": 0,
        "filledBandComponentExactPageCount": 0,
        "filledBandActiveRowCount": 0,
        "centerEnergyCompatiblePageCount": 0,
        "centerEnergySystemComponentExactPageCount": 0,
        "centerEnergyStaffComponentExactPageCount": 0,
        "centerEnergySystemActiveRowCount": 0,
        "centerEnergyStaffActiveRowCount": 0,
        "incompatiblePages": [],
    }
    for score_id, page_index, annotation in annotations:
        systems = annotation["systems"]
        system_count = len(systems)
        staff_count = sum(system["staffCount"] for system in systems)
        result["systemCount"] += system_count
        result["staffCount"] += staff_count
        filled = np.zeros(height, dtype=bool)
        for system in systems:
            bbox = system["normalizedBBox"]
            top = round(bbox["y"] * (height - 1))
            bottom = round((bbox["y"] + bbox["height"]) * (height - 1))
            filled[top : bottom + 1] = True
        result["filledBandActiveRowCount"] += int(filled.sum())
        result["filledBandComponentExactPageCount"] += int(_component_count(filled) == system_count)
        try:
            targets = build_center_energy_targets(
                annotation,
                height=height,
                system_sigma=system_sigma,
                staff_sigma=staff_sigma,
            )
        except ValueError as error:
            result["incompatiblePages"].append(
                {"scoreId": score_id, "pageIndex": page_index, "reason": str(error)}
            )
            continue
        result["centerEnergyCompatiblePageCount"] += 1
        system_active = targets["systemEnergy"] >= 0.5
        staff_active = targets["staffEnergy"] >= 0.5
        result["centerEnergySystemActiveRowCount"] += int(system_active.sum())
        result["centerEnergyStaffActiveRowCount"] += int(staff_active.sum())
        result["centerEnergySystemComponentExactPageCount"] += int(
            _component_count(system_active) == system_count
        )
        result["centerEnergyStaffComponentExactPageCount"] += int(
            _component_count(staff_active) == staff_count
        )
    return result


def _load_annotations(
    dataset_root: Path, pages: list[dict[str, object]]
) -> list[tuple[str, int, dict[str, object]]]:
    resolved_root = dataset_root.resolve()
    result = []
    for page in pages:
        path = (dataset_root / Path(page["imagePath"]).with_suffix(".json")).resolve()
        if not path.is_relative_to(resolved_root) or not path.is_file():
            raise ValueError(f"annotation is missing or escapes dataset root: {path}")
        result.append((page["scoreId"], page["pageIndex"], json.loads(path.read_bytes())))
    return result


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--system-sigma", type=int, default=6)
    parser.add_argument("--staff-sigma", type=int, default=2)
    args = parser.parse_args()
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    splits = {
        split: audit_annotations(
            _load_annotations(args.dataset_root, plan[split]),
            height=args.height,
            system_sigma=args.system_sigma,
            staff_sigma=args.staff_sigma,
        )
        for split in ("train", "validation")
    }
    validation = splits["validation"]
    selected = (
        "row-center-energy-v1"
        if validation["centerEnergyCompatiblePageCount"] == validation["pageCount"]
        and validation["centerEnergySystemComponentExactPageCount"] == validation["pageCount"]
        and validation["centerEnergyStaffComponentExactPageCount"] == validation["pageCount"]
        and validation["centerEnergySystemActiveRowCount"] < validation["filledBandActiveRowCount"]
        else "not-selected"
    )
    report = {
        "schemaVersion": "1.0.0",
        "status": "target-selected" if selected != "not-selected" else "target-not-selected",
        "selectedRepresentation": selected,
        "parameters": {
            "height": args.height,
            "systemSigma": args.system_sigma,
            "staffSigma": args.staff_sigma,
            "activeThreshold": 0.5,
        },
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "splits": splits,
    }
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json(report))


if __name__ == "__main__":
    main()
