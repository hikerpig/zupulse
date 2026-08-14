#!/usr/bin/env python3
"""Materialize only selected OLiMPiC systems into runnable PDF/MusicXML assets."""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any


def materialize(
    source_root: Path,
    inventory: dict[str, Any],
    selection: dict[str, Any],
    output_root: Path,
) -> dict[str, Any]:
    selected_strata = _selected_strata(selection)
    selected_ids = set(selected_strata)
    by_id = {entry["item"]["id"]: entry for entry in inventory["oracleSystems"]}
    missing = sorted(selected_ids - by_id.keys())
    if missing:
        raise ValueError(f"selected OLiMPiC item is missing from inventory: {missing[0]}")
    pdf_module = _load_pdf_module()
    materialized = []
    for item_id in sorted(selected_ids):
        source_entry = by_id[item_id]
        entry = copy.deepcopy(source_entry)
        entry["selectionStratum"] = selected_strata[item_id]
        image_path = source_root / source_entry["source"]["imagePath"]
        ground_truth_path = source_root / source_entry["source"]["groundTruthPath"]
        image_bytes = image_path.read_bytes()
        if sha256(image_bytes) != source_entry["source"]["imageSha256"]:
            raise ValueError(f"source image hash mismatch: {item_id}")
        ground_truth_bytes = ground_truth_path.read_bytes()
        if sha256(ground_truth_bytes) != source_entry["item"]["groundTruth"]["sha256"]:
            raise ValueError(f"source ground-truth hash mismatch: {item_id}")
        pdf_bytes = pdf_module.build_pdf([pdf_module.decode_png(image_path)])
        entry["item"]["input"]["sha256"] = sha256(pdf_bytes)
        input_output = output_root / entry["item"]["input"]["path"]
        ground_truth_output = output_root / entry["item"]["groundTruth"]["path"]
        for path in (input_output, ground_truth_output):
            if path.exists():
                raise ValueError(f"materialized asset already exists: {path}")
            path.parent.mkdir(parents=True, exist_ok=True)
        input_output.write_bytes(pdf_bytes)
        ground_truth_output.write_bytes(ground_truth_bytes)
        materialized.append(entry)
    return {
        "schemaVersion": "1.0.0",
        "release": inventory["release"],
        "oracleSystems": materialized,
    }


def _selected_strata(selection: dict[str, Any]) -> dict[str, str]:
    profiles = selection.get("profiles", {})
    selected = {
        item["itemId"]: item["stratum"]
        for profile_name in ("standard-development", "standard-holdout")
        for item in profiles.get(profile_name, {}).get("items", [])
    }
    if not selected:
        raise ValueError("OLiMPiC selection contains no standard items")
    return selected


def _load_pdf_module() -> Any:
    path = Path(__file__).with_name("build-olimpic-scanned-corpus.py")
    spec = importlib.util.spec_from_file_location("build_olimpic_scanned_corpus", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load deterministic PDF builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-inventory", type=Path, required=True)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    result = materialize(args.source_root, inventory, selection, args.output_root)
    args.output_inventory.parent.mkdir(parents=True, exist_ok=True)
    args.output_inventory.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
