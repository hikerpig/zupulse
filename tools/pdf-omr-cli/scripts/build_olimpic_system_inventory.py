#!/usr/bin/env python3
"""Build deterministic OLiMPiC system candidates from the official scanned release."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


RELEASE = "1.0-scanned (2024-02-12)"
RELEASE_URL = "https://github.com/ufal/olimpic-icdar24/releases/tag/datasets"


def build_split_inventory(source_root: Path, source_split: str, archive_sha256: str) -> list[dict[str, Any]]:
    split = {"dev": "development", "test": "holdout"}.get(source_split)
    if split is None:
        raise ValueError(f"unsupported OLiMPiC split: {source_split}")
    sample_paths = _read_sample_list(source_root / f"samples.{source_split}.txt")
    systems_by_page: dict[tuple[str, int], list[int]] = defaultdict(list)
    parsed_samples = []
    for relative in sample_paths:
        work_id, page, system = _parse_sample_path(relative)
        systems_by_page[(work_id, page)].append(system)
        parsed_samples.append((relative, work_id, page, system))

    entries = []
    for relative, work_id, page, system in parsed_samples:
        source_stem = source_root / relative
        image_path = source_stem.with_suffix(".png")
        ground_truth_path = source_stem.with_suffix(".musicxml")
        for path in (image_path, ground_truth_path):
            if not path.is_file():
                raise ValueError(f"missing OLiMPiC asset: {path}")
        ordered_systems = sorted(systems_by_page[(work_id, page)])
        position = _position(system, ordered_systems)
        sample_id = f"{work_id}/p{page}-s{system}"
        item_id = f"olimpic-{source_split}-{work_id}-p{page}-s{system}"
        asset_root = f"assets/olimpic/{split}/{work_id}/p{page}-s{system}"
        image_bytes = image_path.read_bytes()
        ground_truth_bytes = ground_truth_path.read_bytes()
        entries.append(
            {
                "item": {
                    "id": item_id,
                    "workId": f"olimpic-{work_id}",
                    "variantId": f"p{page}-s{system}",
                    "split": split,
                    "category": "olimpic-scanned-system",
                    "inputScope": "system-crop",
                    "staffLayout": "grand-staff",
                    "input": {"path": f"{asset_root}/input.pdf"},
                    "groundTruth": {
                        "path": f"{asset_root}/truth.musicxml",
                        "sha256": _sha256(ground_truth_bytes),
                        "format": "musicxml",
                    },
                    "license": {"id": "CC-BY-SA-4.0", "source": RELEASE_URL},
                    "provenance": {
                        "dataset": "OLiMPiC scanned",
                        "release": RELEASE,
                        "sampleId": sample_id,
                        "sourceSplit": source_split,
                        "archiveSha256": archive_sha256,
                    },
                },
                "source": {
                    "imagePath": f"{relative}.png",
                    "imageSha256": _sha256(image_bytes),
                    "groundTruthPath": f"{relative}.musicxml",
                },
                "systemPosition": position,
                "complexity": _complexity(ground_truth_bytes),
            }
        )
    return entries


def build_selection_document(
    development: list[dict[str, Any]],
    holdout: list[dict[str, Any]],
    archive_sha256: str,
) -> dict[str, Any]:
    selector = _load_public_selector()
    profiles = {}
    for split, entries in (("development", development), ("holdout", holdout)):
        _selected, strata = selector.select_oracle(entries, split)
        representative = selector.select_quick_oracle(strata)
        standard_name = f"standard-{split}"
        profiles[standard_name] = _selection_profile(
            strata,
            repeat_item_ids=[entry["item"]["id"] for entry in representative],
        )
        if split == "development":
            profiles["quick-development"] = _selection_profile(
                selector.group_oracle_by_stratum(representative, strata),
                repeat_item_ids=[],
            )
    return {
        "schemaVersion": "1.0.0",
        "corpusId": "public-pianoform-v1",
        "suite": "oracle-system",
        "release": {
            "dataset": "OLiMPiC scanned",
            "version": RELEASE,
            "url": RELEASE_URL,
            "archiveSha256": archive_sha256,
        },
        "selectionAlgorithm": {
            "version": "1.0.0",
            "workComplexity": "lower median system by six-dimensional complexity tuple",
            "complexityTuple": list(selector.COMPLEXITY_FIELDS),
            "standardStrata": {"easy": 12, "medium": 12, "hard": 12},
            "systemPositionPolicy": "within each stratum select up to four last, then up to four middle, then fill by stable work/sample ID",
        },
        "profiles": {name: profiles[name] for name in sorted(profiles)},
    }


def filter_ready_entries(entries: list[dict[str, Any]], audit: dict[str, Any]) -> list[dict[str, Any]]:
    readiness = {item["itemId"]: item["ready"] for item in audit.get("items", [])}
    entry_ids = {entry["item"]["id"] for entry in entries}
    if set(readiness) != entry_ids:
        missing = sorted(entry_ids - readiness.keys())
        extra = sorted(readiness.keys() - entry_ids)
        raise ValueError(
            f"OLiMPiC readiness audit does not match inventory: missing={missing[:1]}, extra={extra[:1]}"
        )
    return [entry for entry in entries if readiness[entry["item"]["id"]] is True]


def _selection_profile(
    strata: dict[str, list[dict[str, Any]]],
    repeat_item_ids: list[str],
) -> dict[str, Any]:
    selected = [entry for stratum in ("easy", "medium", "hard") for entry in strata[stratum]]
    return {
        "items": [
            {
                "itemId": entry["item"]["id"],
                "workId": entry["item"]["workId"],
                "sourceSampleId": entry["item"]["provenance"]["sampleId"],
                "stratum": stratum,
                "systemPosition": entry["systemPosition"],
                "complexity": entry["complexity"],
                "sourceImageSha256": entry["source"]["imageSha256"],
                "groundTruthSha256": entry["item"]["groundTruth"]["sha256"],
            }
            for stratum in ("easy", "medium", "hard")
            for entry in strata[stratum]
        ],
        "repeatItemIds": repeat_item_ids,
        "counts": {
            "items": len(selected),
            "works": len({entry["item"]["workId"] for entry in selected}),
            "strata": {stratum: len(strata[stratum]) for stratum in ("easy", "medium", "hard")},
            "systemPositions": {
                position: sum(entry["systemPosition"] == position for entry in selected)
                for position in ("first", "middle", "last")
            },
        },
    }


def _read_sample_list(path: Path) -> list[str]:
    if not path.is_file():
        raise ValueError(f"missing OLiMPiC sample list: {path}")
    samples = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not samples:
        raise ValueError(f"empty OLiMPiC sample list: {path}")
    if len(samples) != len(set(samples)):
        raise ValueError(f"duplicate OLiMPiC sample path in {path}")
    return samples


def _parse_sample_path(relative: str) -> tuple[str, int, int]:
    parts = relative.split("/")
    if len(parts) != 3 or parts[0] != "samples" or not parts[1].isdigit():
        raise ValueError(f"invalid OLiMPiC sample path: {relative}")
    page_and_system = parts[2].split("-s")
    if len(page_and_system) != 2 or not page_and_system[0].startswith("p"):
        raise ValueError(f"invalid OLiMPiC sample path: {relative}")
    page = page_and_system[0][1:]
    system = page_and_system[1]
    if not page.isdigit() or not system.isdigit() or int(page) < 1 or int(system) < 1:
        raise ValueError(f"invalid OLiMPiC sample path: {relative}")
    return parts[1], int(page), int(system)


def _position(system: int, ordered_systems: list[int]) -> str:
    if system == ordered_systems[0]:
        return "first"
    if system == ordered_systems[-1]:
        return "last"
    return "middle"


def _complexity(musicxml: bytes) -> dict[str, int]:
    try:
        root = ElementTree.fromstring(musicxml)
    except ElementTree.ParseError as error:
        raise ValueError("invalid OLiMPiC MusicXML") from error
    elements = list(root.iter())
    notes = [element for element in elements if _local_name(element.tag) == "note"]
    pitched_notes = [note for note in notes if not any(_local_name(child.tag) == "rest" for child in note)]
    voices = {
        child.text.strip()
        for note in notes
        for child in note
        if _local_name(child.tag) == "voice" and child.text is not None and child.text.strip()
    }
    return {
        "noteCount": len(pitched_notes),
        "voiceCount": len(voices),
        "chordCount": sum(any(_local_name(child.tag) == "chord" for child in note) for note in notes),
        "tieCount": sum(
            _local_name(element.tag) == "tie" and element.attrib.get("type") == "start" for element in elements
        ),
        "tupletCount": sum(_local_name(element.tag) == "time-modification" for element in elements),
        "repeatCount": sum(_local_name(element.tag) == "repeat" for element in elements),
    }


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _sha256(value: bytes) -> str:
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
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--archive-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--selection-output", type=Path)
    parser.add_argument("--readiness", type=Path)
    args = parser.parse_args()
    if len(args.archive_sha256) != 64:
        raise SystemExit("archive SHA-256 must contain 64 hexadecimal characters")
    development = build_split_inventory(args.source_root, "dev", args.archive_sha256)
    holdout = build_split_inventory(args.source_root, "test", args.archive_sha256)
    development_works = {entry["item"]["workId"] for entry in development}
    holdout_works = {entry["item"]["workId"] for entry in holdout}
    leakage = sorted(development_works & holdout_works)
    if leakage:
        raise SystemExit(f"OLiMPiC work crosses release splits: {leakage[0]}")
    document = {
        "schemaVersion": "1.0.0",
        "release": {
            "dataset": "OLiMPiC scanned",
            "version": RELEASE,
            "url": RELEASE_URL,
            "archiveSha256": args.archive_sha256,
        },
        "oracleSystems": development + holdout,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.selection_output is not None:
        if args.readiness is None:
            raise SystemExit("--readiness is required when --selection-output is used")
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
        selection = build_selection_document(ready_development, ready_holdout, args.archive_sha256)
        selection["groundTruthReadiness"] = {
            "auditSha256": _sha256(readiness_bytes),
            "development": {
                "readyItems": len(ready_development),
                "readyWorks": len({entry["item"]["workId"] for entry in ready_development}),
            },
            "holdout": {
                "readyItems": len(ready_holdout),
                "readyWorks": len({entry["item"]["workId"] for entry in ready_holdout}),
            },
        }
        args.selection_output.parent.mkdir(parents=True, exist_ok=True)
        args.selection_output.write_text(json.dumps(selection, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
