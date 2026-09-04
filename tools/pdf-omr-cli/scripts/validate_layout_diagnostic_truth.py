#!/usr/bin/env python3
"""Validate development-only human-reviewed layout topology truth."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _require_unique(values: list[object], *, label: str) -> None:
    encoded = [json.dumps(value, ensure_ascii=False, sort_keys=True) for value in values]
    if len(encoded) != len(set(encoded)):
        raise ValueError(f"duplicate {label}")


def validate_diagnostic_truth(document: dict[str, object], corpus_root: Path) -> dict[str, int]:
    if document.get("schemaVersion") != "1.0.0":
        raise ValueError("unsupported diagnostic truth schemaVersion")
    if document.get("reviewBasis") != "human-visible-five-line-staff-count":
        raise ValueError("unsupported reviewBasis")
    items = document.get("items")
    if not isinstance(items, list):
        raise ValueError("items must be a list")

    mapping_paths = sorted((corpus_root / "dev").glob("*/source-mapping.json"))
    expected_work_ids = [path.parent.name for path in mapping_paths]
    work_ids = [item.get("workId") for item in items if isinstance(item, dict)]
    _require_unique(work_ids, label="workId")
    if sorted(work_ids) != expected_work_ids:
        raise ValueError("diagnostic truth must cover every development work exactly once")

    page_count = 0
    system_count = 0
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("workId"), str):
            raise ValueError("each item must have a string workId")
        work_id = item["workId"]
        mapping_path = corpus_root / "dev" / work_id / "source-mapping.json"
        mapping_bytes = mapping_path.read_bytes()
        if item.get("sourceMappingSha256") != hashlib.sha256(mapping_bytes).hexdigest():
            raise ValueError(f"source mapping hash drift for work {work_id}")
        mapping = json.loads(mapping_bytes)
        truth_pages = item.get("pages")
        if not isinstance(truth_pages, list):
            raise ValueError(f"pages must be a list for work {work_id}")
        _require_unique(
            [page.get("samplePage") for page in truth_pages if isinstance(page, dict)], label=f"samplePage in {work_id}"
        )
        expected_pages = {page["samplePage"]: page for page in mapping["pages"]}
        actual_page_ids = {page.get("samplePage") for page in truth_pages if isinstance(page, dict)}
        if actual_page_ids != set(expected_pages):
            raise ValueError(f"diagnostic truth page coverage mismatch for work {work_id}")

        for truth_page in truth_pages:
            if not isinstance(truth_page, dict):
                raise ValueError("each page must be an object")
            sample_page = truth_page["samplePage"]
            truth_systems = truth_page.get("systems")
            if not isinstance(truth_systems, list):
                raise ValueError(f"systems must be a list for work {work_id} page {sample_page}")
            variants = [system.get("sampleVariant") for system in truth_systems if isinstance(system, dict)]
            _require_unique(variants, label=f"sampleVariant in {work_id} page {sample_page}")
            expected_variants = {system["sampleVariant"] for system in expected_pages[sample_page]["systems"]}
            if set(variants) != expected_variants:
                raise ValueError(f"diagnostic truth system coverage mismatch for work {work_id} page {sample_page}")
            for system in truth_systems:
                if not isinstance(system, dict):
                    raise ValueError("each system must be an object")
                count = system.get("visibleStaffCount")
                if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 3:
                    raise ValueError(f"visibleStaffCount must be an integer in [1, 3] for {system.get('sampleVariant')}")
                note = system.get("reviewNote")
                if note is not None and (not isinstance(note, str) or len(note) > 160):
                    raise ValueError(f"reviewNote must be at most 160 characters for {system.get('sampleVariant')}")
            page_count += 1
            system_count += len(truth_systems)

    return {"itemCount": len(items), "pageCount": page_count, "systemCount": system_count}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--truth", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    args = parser.parse_args()
    summary = validate_diagnostic_truth(json.loads(args.truth.read_bytes()), args.corpus_root)
    print(canonical_json(summary).decode(), end="")


if __name__ == "__main__":
    main()
