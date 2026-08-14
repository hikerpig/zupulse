#!/usr/bin/env python3
"""Build deterministic quick and standard public pianoform manifests from inventories."""

from __future__ import annotations

import argparse
import copy
import json
from itertools import combinations, product
from pathlib import Path
from typing import Any


COMPLEXITY_FIELDS = (
    "noteCount",
    "voiceCount",
    "chordCount",
    "tieCount",
    "tupletCount",
    "repeatCount",
)
STRATA = ("easy", "medium", "hard")
POSITIONS = ("first", "middle", "last")


def build_profiles(inventory: dict[str, Any], output_directory: Path) -> None:
    _validate_inventory(inventory)
    output_directory.mkdir(parents=True, exist_ok=True)

    profiles: dict[str, dict[str, Any]] = {}
    selection_profiles: dict[str, dict[str, Any]] = {}
    for split in ("development", "holdout"):
        contracts = _select_contracts(inventory["contractItems"], split)
        oracle, oracle_strata = select_oracle(inventory["oracleSystems"], split)
        full_pages = select_full_pages(inventory["fullPages"], split)
        representative_oracle = select_quick_oracle(oracle_strata)
        repeat_ids = [entry["item"]["id"] for entry in representative_oracle]

        standard_name = f"standard-{split}"
        profiles[standard_name] = _manifest(
            standard_name,
            "standard",
            contracts,
            oracle,
            full_pages,
            repeat_ids,
            3_600_000,
        )
        selection_profiles[standard_name] = _selection_summary(contracts, oracle_strata, full_pages)

        if split == "development":
            quick_full_pages = [full_pages[0], full_pages[-1]]
            quick_contracts = _quick_contracts(contracts)
            profiles["quick-development"] = _manifest(
                "quick-development",
                "quick",
                quick_contracts,
                representative_oracle,
                quick_full_pages,
                [],
                600_000,
            )
            selection_profiles["quick-development"] = _selection_summary(
                quick_contracts,
                group_oracle_by_stratum(representative_oracle, oracle_strata),
                quick_full_pages,
            )

    selection = {
        "schemaVersion": "1.0.0",
        "corpusId": "public-pianoform-v1",
        "selectionAlgorithm": {
            "version": "1.0.0",
            "complexityTuple": list(COMPLEXITY_FIELDS),
            "oracleStrata": {"easy": 12, "medium": 12, "hard": 12},
            "systemPositionTargetPerStratum": {"first": 4, "middle": 4, "last": 4},
            "fullPageOrdering": "ascending ground-truth measureCount with evenly spaced rank selection",
        },
        "release": inventory["release"],
        "profiles": {name: selection_profiles[name] for name in sorted(selection_profiles)},
    }
    _write_json(output_directory / "selection.json", selection)
    for name in sorted(profiles):
        _write_json(output_directory / f"{name}.manifest.json", profiles[name])


def merge_inventories(
    contract: dict[str, Any],
    olimpic: dict[str, Any],
    fp_grandstaff: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schemaVersion": "1.0.0",
        "release": {
            "contract": {"sourceCorpusId": contract["sourceCorpusId"]},
            "olimpic": olimpic["release"],
            "fpGrandStaff": fp_grandstaff["release"],
        },
        "contractItems": contract["contractItems"],
        "oracleSystems": olimpic["oracleSystems"],
        "fullPages": fp_grandstaff["fullPages"],
    }


def _validate_inventory(inventory: dict[str, Any]) -> None:
    if inventory.get("schemaVersion") != "1.0.0":
        raise ValueError("inventory schemaVersion must be 1.0.0")
    for field in ("release", "contractItems", "oracleSystems", "fullPages"):
        if field not in inventory:
            raise ValueError(f"inventory is missing {field}")

    work_splits: dict[str, set[str]] = {}
    entries = list(inventory["contractItems"])
    entries.extend(entry["item"] for entry in inventory["oracleSystems"])
    entries.extend(entry["item"] for entry in inventory["fullPages"])
    for item in entries:
        split = item.get("split")
        if split not in ("development", "holdout"):
            raise ValueError(f"invalid split for {item.get('id')}")
        work_splits.setdefault(item["workId"], set()).add(split)
        input_sha256 = item.get("input", {}).get("sha256")
        ground_truth_sha256 = item.get("groundTruth", {}).get("sha256")
        if not isinstance(input_sha256, str) or len(input_sha256) != 64:
            raise ValueError(f"item is not materialized: {item.get('id')}")
        if not isinstance(ground_truth_sha256, str) or len(ground_truth_sha256) != 64:
            raise ValueError(f"ground truth is not materialized: {item.get('id')}")
    leaked = sorted(work_id for work_id, splits in work_splits.items() if len(splits) > 1)
    if leaked:
        raise ValueError(f"work crosses development and holdout: {leaked[0]}")


def _select_contracts(items: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    selected = sorted((item for item in items if item["split"] == split), key=lambda item: item["id"])
    if len(selected) < 5:
        raise ValueError(f"not enough {split} contract items")
    return selected[:5]


def _quick_contracts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        next(item for item in items if item.get("staffLayout") == "single-staff"),
        next(item for item in items if item.get("staffLayout") == "grand-staff"),
    ]


def select_oracle(
    entries: list[dict[str, Any]], split: str
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    candidates = [entry for entry in entries if entry["item"]["split"] == split]
    by_work: dict[str, list[dict[str, Any]]] = {}
    for entry in candidates:
        _validate_oracle_entry(entry)
        by_work.setdefault(entry["item"]["workId"], []).append(entry)
    if candidates and all(entry.get("selectionStratum") in STRATA for entry in candidates):
        selected_by_stratum = {
            stratum: sorted(
                (entry for entry in candidates if entry["selectionStratum"] == stratum),
                key=lambda entry: (entry["item"]["workId"], entry["item"]["id"]),
            )
            for stratum in STRATA
        }
        if any(len(selected_by_stratum[stratum]) != 12 for stratum in STRATA):
            raise ValueError(f"materialized {split} OLiMPiC strata must contain 12 items each")
        selected = [entry for stratum in STRATA for entry in selected_by_stratum[stratum]]
        if len({entry["item"]["workId"] for entry in selected}) != 36:
            raise ValueError(f"materialized {split} OLiMPiC selection must contain 36 works")
        return selected, selected_by_stratum
    ranked_works = sorted(
        by_work,
        key=lambda work_id: (_work_complexity_key(by_work[work_id]), work_id),
    )
    if len(ranked_works) < 36:
        raise ValueError(f"not enough distinct {split} OLiMPiC works")

    quantiles = {
        stratum: ranked_works[(index * len(ranked_works)) // 3 : ((index + 1) * len(ranked_works)) // 3]
        for index, stratum in enumerate(STRATA)
    }
    selected_by_stratum = {
        stratum: _balanced_work_positions(quantiles[stratum], by_work, 12) for stratum in STRATA
    }
    selected = [entry for stratum in STRATA for entry in selected_by_stratum[stratum]]
    return selected, selected_by_stratum


def select_quick_oracle(strata: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    pair_options = [list(combinations(strata[stratum], 2)) for stratum in STRATA]
    if any(not options for options in pair_options):
        raise ValueError("OLiMPiC strata cannot provide two quick items each")
    ranked = []
    for pairs in product(*pair_options):
        selected = [entry for pair in pairs for entry in pair]
        counts = {position: sum(entry["systemPosition"] == position for entry in selected) for position in POSITIONS}
        score = (
            min(counts.values()),
            -sum(abs(counts[position] - 2) for position in POSITIONS),
            counts["last"],
            counts["middle"],
        )
        stable_ids = tuple(entry["item"]["id"] for entry in selected)
        ranked.append((score, stable_ids, selected))
    best_score = max(candidate[0] for candidate in ranked)
    return min((candidate for candidate in ranked if candidate[0] == best_score), key=lambda candidate: candidate[1])[2]


def group_oracle_by_stratum(
    selected: list[dict[str, Any]],
    source_strata: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    selected_ids = {entry["item"]["id"] for entry in selected}
    return {
        stratum: [entry for entry in source_strata[stratum] if entry["item"]["id"] in selected_ids]
        for stratum in STRATA
    }


def _validate_oracle_entry(entry: dict[str, Any]) -> None:
    if entry.get("systemPosition") not in POSITIONS:
        raise ValueError(f"invalid systemPosition for {entry.get('item', {}).get('id')}")
    complexity = entry.get("complexity", {})
    if any(not isinstance(complexity.get(field), int) or complexity[field] < 0 for field in COMPLEXITY_FIELDS):
        raise ValueError(f"invalid complexity tuple for {entry['item']['id']}")


def _complexity_key(entry: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(entry["complexity"][field] for field in COMPLEXITY_FIELDS) + (
        entry["item"]["workId"],
        entry["item"]["id"],
    )


def _work_complexity_key(entries: list[dict[str, Any]]) -> tuple[Any, ...]:
    ranked = sorted(entries, key=_complexity_key)
    return _complexity_key(ranked[(len(ranked) - 1) // 2])


def _balanced_work_positions(
    work_ids: list[str],
    by_work: dict[str, list[dict[str, Any]]],
    count: int,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    selected_works: set[str] = set()
    for position in ("last", "middle"):
        eligible = sorted(
            (
                work_id
                for work_id in work_ids
                if work_id not in selected_works
                and any(entry["systemPosition"] == position for entry in by_work[work_id])
            ),
            key=lambda work_id: (
                len({entry["systemPosition"] for entry in by_work[work_id]}),
                work_id,
            ),
        )
        for work_id in eligible[: min(4, len(eligible))]:
            selected_works.add(work_id)
            selected.append(
                sorted(
                    (entry for entry in by_work[work_id] if entry["systemPosition"] == position),
                    key=lambda entry: entry["item"]["id"],
                )[0]
            )
    remaining = sorted(
        (work_id for work_id in work_ids if work_id not in selected_works),
        key=lambda work_id: (
            len({entry["systemPosition"] for entry in by_work[work_id]}),
            work_id,
        ),
    )
    for work_id in remaining[: count - len(selected)]:
        candidates = sorted(
            by_work[work_id],
            key=lambda entry: (
                {"last": 0, "middle": 1, "first": 2}[entry["systemPosition"]],
                entry["item"]["id"],
            ),
        )
        selected.append(candidates[0])
    if len(selected) != count:
        raise ValueError("not enough distinct OLiMPiC works in a complexity stratum")
    return sorted(selected, key=lambda entry: (entry["item"]["workId"], entry["item"]["id"]))


def select_full_pages(entries: list[dict[str, Any]], split: str) -> list[dict[str, Any]]:
    by_work: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if entry["item"]["split"] != split:
            continue
        if not isinstance(entry.get("measureCount"), int) or entry["measureCount"] < 1:
            raise ValueError(f"invalid measureCount for {entry['item']['id']}")
        by_work.setdefault(entry["item"]["workId"], entry)
    ranked = sorted(by_work.values(), key=lambda entry: (entry["measureCount"], entry["item"]["id"]))
    if len(ranked) < 4:
        raise ValueError(f"not enough distinct {split} FP-GrandStaff works")
    indexes = [round(index * (len(ranked) - 1) / 3) for index in range(4)]
    return [ranked[index] for index in indexes]


def _manifest(
    name: str,
    profile: str,
    contracts: list[dict[str, Any]],
    oracle: list[dict[str, Any]],
    full_pages: list[dict[str, Any]],
    repeat_ids: list[str],
    budget_ms: int,
) -> dict[str, Any]:
    items = []
    for suite, entries in (
        ("contract", contracts),
        ("oracle-system", [entry["item"] for entry in oracle]),
        ("full-page", [entry["item"] for entry in full_pages]),
    ):
        for item in entries:
            profiled_item = copy.deepcopy(item)
            profiled_item["benchmarkSuite"] = suite
            items.append(profiled_item)
    return {
        "schemaVersion": "1.0.0",
        "corpusId": f"public-pianoform-v1-{name}",
        "protocolVersion": "1.0.0",
        "execution": {"profile": profile, "maxTotalWallTimeMs": budget_ms, "repeatItemIds": repeat_ids},
        "items": items,
    }


def _selection_summary(
    contracts: list[dict[str, Any]],
    oracle_strata: dict[str, list[dict[str, Any]]],
    full_pages: list[dict[str, Any]],
) -> dict[str, Any]:
    oracle_entries = [entry for stratum in STRATA for entry in oracle_strata[stratum]]
    return {
        "contractItemIds": [item["id"] for item in contracts],
        "oracleItemIds": [entry["item"]["id"] for entry in oracle_entries],
        "oracleStrata": {stratum: len(oracle_strata[stratum]) for stratum in STRATA},
        "oracleSystemPositions": {
            position: sum(entry["systemPosition"] == position for entry in oracle_entries) for position in POSITIONS
        },
        "fullPageItemIds": [entry["item"]["id"] for entry in full_pages],
    }


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--contract-inventory", type=Path)
    parser.add_argument("--olimpic-inventory", type=Path)
    parser.add_argument("--fp-grandstaff-inventory", type=Path)
    parser.add_argument("--output-directory", type=Path, required=True)
    args = parser.parse_args()
    if args.inventory is not None:
        if any(
            path is not None
            for path in (args.contract_inventory, args.olimpic_inventory, args.fp_grandstaff_inventory)
        ):
            raise SystemExit("use either --inventory or the three suite inventory options")
        inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    else:
        if any(
            path is None
            for path in (args.contract_inventory, args.olimpic_inventory, args.fp_grandstaff_inventory)
        ):
            raise SystemExit("the three suite inventory options are required when --inventory is omitted")
        inventory = merge_inventories(
            json.loads(args.contract_inventory.read_text(encoding="utf-8")),
            json.loads(args.olimpic_inventory.read_text(encoding="utf-8")),
            json.loads(args.fp_grandstaff_inventory.read_text(encoding="utf-8")),
        )
    build_profiles(inventory, args.output_directory)


if __name__ == "__main__":
    main()
