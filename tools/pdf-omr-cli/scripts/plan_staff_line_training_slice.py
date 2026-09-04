#!/usr/bin/env python3
"""Plan a small deterministic topology-balanced staff-line training slice."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def _page_key(dataset_id: str, score_id: str, page_index: int) -> str:
    return hashlib.sha256(f"{dataset_id}\0{score_id}\0{page_index}".encode()).hexdigest()


def plan_split(manifest: dict[str, object], split: str, limit: int) -> list[dict[str, object]]:
    dataset_id = manifest["datasetId"]
    pages = []
    for item in manifest["items"]:
        if item["split"] != split:
            continue
        for page in item["pages"]:
            if not page.get("eligibleForTraining"):
                continue
            staff_counts = sorted(set(page["staffCounts"]))
            variant = page["augmented"] if split == "train" else page["canonical"]
            pages.append(
                {
                    "scoreId": item["scoreId"],
                    "pageIndex": page["pageIndex"],
                    "staffCounts": staff_counts,
                    "imagePath": variant["imagePath"],
                    "maskPath": variant["maskPath"],
                    "selectionKey": _page_key(dataset_id, item["scoreId"], page["pageIndex"]),
                }
            )
    rare = sorted((page for page in pages if page["staffCounts"] != [3]), key=lambda page: page["selectionKey"])
    common = sorted((page for page in pages if page["staffCounts"] == [3]), key=lambda page: page["selectionKey"])
    if len(rare) > limit:
        raise ValueError(f"{split} limit {limit} cannot retain all {len(rare)} rare-topology pages")
    return rare + common[: limit - len(rare)]


def build_slice(manifest: dict[str, object], *, train_limit: int, validation_limit: int) -> dict[str, object]:
    if train_limit < 1 or validation_limit < 1:
        raise ValueError("slice limits must be positive")
    train = plan_split(manifest, "train", train_limit)
    validation = plan_split(manifest, "validation", validation_limit)
    return {
        "schemaVersion": "1.0.0",
        "datasetId": manifest["datasetId"],
        "strategy": "retain-all-non-pure-three-staff-then-hash-fill-v1",
        "train": train,
        "validation": validation,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--train-limit", type=int, default=512)
    parser.add_argument("--validation-limit", type=int, default=128)
    args = parser.parse_args()
    manifest = json.loads(args.dataset_manifest.read_bytes())
    result = build_slice(manifest, train_limit=args.train_limit, validation_limit=args.validation_limit)
    args.output.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
