#!/usr/bin/env python3
"""Build deterministic FP-GrandStaff candidates from pinned Hugging Face parquet files."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any


DATASET = "PRAIG/fp-grandstaff"
DATASET_URL = "https://huggingface.co/datasets/PRAIG/fp-grandstaff"
REVISION = "334351427faf94cdb17fecbbab8d83fcf225fa46"


def build_entries(rows: list[dict[str, Any]], source_split: str, artifact_sha256: str) -> list[dict[str, Any]]:
    split = {"val": "development", "test": "holdout"}.get(source_split)
    if split is None:
        raise ValueError(f"unsupported FP-GrandStaff split: {source_split}")
    entries = []
    seen_rows = set()
    for row in rows:
        row_index = row["rowIndex"]
        if row_index in seen_rows:
            raise ValueError(f"duplicate FP-GrandStaff row: {source_split}/{row_index}")
        seen_rows.add(row_index)
        image_bytes = row["imageBytes"]
        transcription = row["transcription"]
        measure_count = count_measures(transcription)
        if measure_count < 1:
            raise ValueError(f"FP-GrandStaff row contains no measures: {source_split}/{row_index}")
        item_id = f"fp-grandstaff-{source_split}-{row_index:03d}"
        asset_root = f"assets/fp-grandstaff/{split}/{row_index:03d}"
        entries.append(
            {
                "item": {
                    "id": item_id,
                    "workId": item_id,
                    "variantId": "official-row",
                    "split": split,
                    "category": "fp-grandstaff-synthetic-full-page",
                    "inputScope": "full-page",
                    "staffLayout": "grand-staff",
                    "input": {"path": f"{asset_root}/input.pdf"},
                    "groundTruth": {"path": f"{asset_root}/truth.musicxml", "format": "musicxml"},
                    "license": {"id": "MIT", "source": DATASET_URL},
                    "provenance": {
                        "dataset": DATASET,
                        "release": REVISION,
                        "sampleId": f"{source_split}/{row_index}",
                        "sourceSplit": source_split,
                        "archiveSha256": artifact_sha256,
                    },
                },
                "source": {
                    "rowIndex": row_index,
                    "imagePath": row["imagePath"],
                    "imageSha256": sha256(image_bytes),
                    "transcription": transcription,
                    "transcriptionSha256": sha256(transcription.encode("utf-8")),
                },
                "measureCount": measure_count,
            }
        )
    return entries


def count_measures(transcription: str) -> int:
    return sum(line.split("\t", 1)[0].startswith("=") for line in transcription.splitlines())


def filter_ready_entries(entries: list[dict[str, Any]], audit: dict[str, Any]) -> list[dict[str, Any]]:
    readiness = {item["itemId"]: item["ready"] for item in audit.get("items", [])}
    entry_ids = {entry["item"]["id"] for entry in entries}
    if set(readiness) != entry_ids:
        raise ValueError("FP-GrandStaff readiness audit does not match inventory")
    return [entry for entry in entries if readiness[entry["item"]["id"]] is True]


def build_selection_document(
    development: list[dict[str, Any]],
    holdout: list[dict[str, Any]],
    val_sha256: str,
    test_sha256: str,
) -> dict[str, Any]:
    selector = _load_public_selector()
    selected_development = selector.select_full_pages(development, "development")
    selected_holdout = selector.select_full_pages(holdout, "holdout")
    quick = [selected_development[0], selected_development[-1]]
    return {
        "schemaVersion": "1.0.0",
        "corpusId": "public-pianoform-v1",
        "suite": "full-page",
        "release": {
            "dataset": DATASET,
            "revision": REVISION,
            "url": DATASET_URL,
            "license": "MIT",
            "splitArtifactSha256": {"val": val_sha256, "test": test_sha256},
        },
        "selectionAlgorithm": {
            "version": "1.0.0",
            "density": "ground-truth measureCount",
            "ordering": "ascending measureCount then itemId; four evenly spaced ranks",
            "splitMapping": {"val": "development", "test": "holdout"},
        },
        "profiles": {
            "quick-development": _selection_profile(quick),
            "standard-development": _selection_profile(selected_development),
            "standard-holdout": _selection_profile(selected_holdout),
        },
    }


def _selection_profile(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": [
            {
                "itemId": entry["item"]["id"],
                "workId": entry["item"]["workId"],
                "sourceSampleId": entry["item"]["provenance"]["sampleId"],
                "measureCount": entry["measureCount"],
                "sourceImageSha256": entry["source"]["imageSha256"],
                "transcriptionSha256": entry["source"]["transcriptionSha256"],
            }
            for entry in entries
        ],
        "measureCounts": [entry["measureCount"] for entry in entries],
        "counts": {
            "items": len(entries),
            "works": len({entry["item"]["workId"] for entry in entries}),
        },
    }


def read_parquet_rows(path: Path) -> list[dict[str, Any]]:
    try:
        import pyarrow.parquet as parquet
    except ImportError as error:
        raise SystemExit("pyarrow is required; run with `uv run --with pyarrow`") from error
    table = parquet.read_table(path, columns=["image", "transcription"])
    return [
        {
            "rowIndex": index,
            "imageBytes": table["image"][index].as_py()["bytes"],
            "imagePath": table["image"][index].as_py()["path"],
            "transcription": table["transcription"][index].as_py(),
        }
        for index in range(table.num_rows)
    ]


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _load_public_selector() -> Any:
    path = Path(__file__).with_name("build_public_pianoform_benchmark.py")
    spec = importlib.util.spec_from_file_location("build_public_pianoform_benchmark", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load public benchmark selector: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--val-parquet", type=Path, required=True)
    parser.add_argument("--val-sha256", required=True)
    parser.add_argument("--test-parquet", type=Path, required=True)
    parser.add_argument("--test-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--selection-output", type=Path)
    parser.add_argument("--readiness", type=Path)
    args = parser.parse_args()
    for path, expected in ((args.val_parquet, args.val_sha256), (args.test_parquet, args.test_sha256)):
        if sha256(path.read_bytes()) != expected:
            raise SystemExit(f"FP-GrandStaff parquet hash mismatch: {path}")
    development = build_entries(read_parquet_rows(args.val_parquet), "val", args.val_sha256)
    holdout = build_entries(read_parquet_rows(args.test_parquet), "test", args.test_sha256)
    inventory = {
        "schemaVersion": "1.0.0",
        "release": {"dataset": DATASET, "revision": REVISION},
        "fullPages": development + holdout,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.selection_output is not None or args.readiness is not None:
        if args.selection_output is None or args.readiness is None:
            raise SystemExit("--selection-output and --readiness must be provided together")
        readiness_bytes = args.readiness.read_bytes()
        readiness = json.loads(readiness_bytes)
        development_ids = {entry["item"]["id"] for entry in development}
        holdout_ids = {entry["item"]["id"] for entry in holdout}
        ready_development = filter_ready_entries(
            development,
            {"items": [item for item in readiness["items"] if item["itemId"] in development_ids]},
        )
        ready_holdout = filter_ready_entries(
            holdout,
            {"items": [item for item in readiness["items"] if item["itemId"] in holdout_ids]},
        )
        selection = build_selection_document(
            ready_development,
            ready_holdout,
            args.val_sha256,
            args.test_sha256,
        )
        selection["groundTruthReadiness"] = {
            "auditSha256": sha256(readiness_bytes),
            "development": {"readyItems": len(ready_development)},
            "holdout": {"readyItems": len(ready_holdout)},
        }
        args.selection_output.parent.mkdir(parents=True, exist_ok=True)
        args.selection_output.write_text(
            json.dumps(selection, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
