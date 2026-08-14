#!/usr/bin/env python3
"""Materialize the five existing synthetic fixtures as non-quality contract checks."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def build_contracts(
    source_items: list[dict[str, Any]],
    source_root: Path,
    output_root: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if len(source_items) != 5:
        raise ValueError(f"public contract suite requires exactly five source fixtures, received {len(source_items)}")
    ordered = sorted(source_items, key=lambda item: item["id"])
    contracts = []
    profiles = {}
    for split in ("development", "holdout"):
        split_items = []
        for source_item in ordered:
            input_bytes = _read_verified(source_root / source_item["input"]["path"], source_item["input"]["sha256"])
            ground_truth_bytes = _read_verified(
                source_root / source_item["groundTruth"]["path"],
                source_item["groundTruth"]["sha256"],
            )
            item_id = f"contract-{split}-{source_item['id']}"
            asset_root = f"assets/contract/{split}/{source_item['id']}"
            item = {
                "id": item_id,
                "workId": f"contract-{split}-{source_item['workId']}",
                "variantId": source_item["variantId"],
                "split": split,
                "category": f"contract-{source_item['category']}",
                "inputScope": "full-page",
                "staffLayout": _staff_layout(source_item),
                "input": {"path": f"{asset_root}/input.pdf", "sha256": sha256(input_bytes)},
                "groundTruth": {
                    "path": f"{asset_root}/truth.{source_item['groundTruth']['format']}",
                    "sha256": sha256(ground_truth_bytes),
                    "format": source_item["groundTruth"]["format"],
                },
                "license": source_item["license"],
            }
            input_output = output_root / item["input"]["path"]
            truth_output = output_root / item["groundTruth"]["path"]
            for path, value in ((input_output, input_bytes), (truth_output, ground_truth_bytes)):
                if path.exists():
                    raise ValueError(f"contract asset already exists: {path}")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(value)
            contracts.append(item)
            split_items.append(item)
        profiles[f"standard-{split}"] = _selection_profile(split_items)
        if split == "development":
            profiles["quick-development"] = _selection_profile(_quick_layout_pair(split_items))
    return (
        {"schemaVersion": "1.0.0", "sourceCorpusId": "zupulse-pdf-omr-evaluation-v1", "contractItems": contracts},
        {
            "schemaVersion": "1.0.0",
            "corpusId": "public-pianoform-v1",
            "suite": "contract",
            "selectionRule": "all five existing synthetic fixtures; quick uses one single-staff and one grand-staff item",
            "qualityClaim": "excluded",
            "profiles": {name: profiles[name] for name in sorted(profiles)},
        },
    )


def _staff_layout(source_item: dict[str, Any]) -> str:
    item_id = source_item["id"]
    if item_id.startswith("melody-"):
        return "single-staff"
    if item_id.startswith("piano-"):
        return "grand-staff"
    raise ValueError(f"contract fixture has no declared staff layout: {item_id}")


def _quick_layout_pair(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        next(item for item in items if item["staffLayout"] == "single-staff"),
        next(item for item in items if item["staffLayout"] == "grand-staff"),
    ]


def _selection_profile(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "itemIds": [item["id"] for item in items],
        "sourceFixtureIds": [item["id"].split("-", 2)[2] for item in items],
        "counts": {"items": len(items)},
    }


def _read_verified(path: Path, expected_sha256: str) -> bytes:
    value = path.read_bytes()
    if sha256(value) != expected_sha256:
        raise ValueError(f"contract source hash mismatch: {path}")
    return value


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-inventory", type=Path, required=True)
    parser.add_argument("--selection-output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    inventory, selection = build_contracts(manifest["items"], args.source_root, args.output_root)
    args.output_inventory.parent.mkdir(parents=True, exist_ok=True)
    args.output_inventory.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.selection_output.parent.mkdir(parents=True, exist_ok=True)
    args.selection_output.write_text(json.dumps(selection, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
