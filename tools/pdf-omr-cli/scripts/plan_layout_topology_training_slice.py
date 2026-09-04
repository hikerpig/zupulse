#!/usr/bin/env python3
"""Plan a deterministic composer-isolated slice for layout topology training."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path


STAFF_COUNTS = (1, 2, 3)


def _selection_key(dataset_id: str, score_id: str, page_index: int) -> str:
    return hashlib.sha256(f"{dataset_id}\0topology-v2\0{score_id}\0{page_index}".encode()).hexdigest()


def _composer_key(dataset_id: str, composer: str) -> str:
    return hashlib.sha256(f"{dataset_id}\0topology-validation\0{composer}".encode()).hexdigest()


def _system_counts(items: list[dict[str, object]]) -> Counter[int]:
    counts: Counter[int] = Counter()
    for item in items:
        for page in item["pages"]:
            if page.get("eligibleForTraining"):
                counts.update(page["staffCounts"])
    return counts


def _plan_pages(
    dataset_id: str,
    items: list[dict[str, object]],
    *,
    split: str,
    limit: int,
) -> list[dict[str, object]]:
    pages = []
    for item in items:
        for page in item["pages"]:
            if not page.get("eligibleForTraining"):
                continue
            variant = page["augmented"] if split == "train" else page["canonical"]
            pages.append(
                {
                    "scoreId": item["scoreId"],
                    "pageIndex": page["pageIndex"],
                    "staffCounts": sorted(set(page["staffCounts"])),
                    "imagePath": variant["imagePath"],
                    "maskPath": variant["maskPath"],
                    "selectionKey": _selection_key(dataset_id, item["scoreId"], page["pageIndex"]),
                }
            )
    rare = sorted((page for page in pages if page["staffCounts"] != [3]), key=lambda page: page["selectionKey"])
    common = sorted((page for page in pages if page["staffCounts"] == [3]), key=lambda page: page["selectionKey"])
    if len(rare) > limit:
        raise ValueError(f"{split} limit {limit} cannot retain all {len(rare)} rare-topology pages")
    return rare + common[: limit - len(rare)]


def _selected_system_counts(pages: list[dict[str, object]], items_by_score: dict[str, dict[str, object]]) -> Counter[int]:
    selected = {(page["scoreId"], page["pageIndex"]) for page in pages}
    counts: Counter[int] = Counter()
    for score_id, item in items_by_score.items():
        for page in item["pages"]:
            if (score_id, page["pageIndex"]) in selected:
                counts.update(page["staffCounts"])
    return counts


def build_slice(
    manifest: dict[str, object],
    source_plan: dict[str, object],
    *,
    train_limit: int,
    validation_limit: int,
    minimum_train_systems_per_staff_count: int,
    minimum_validation_systems_per_staff_count: int,
) -> dict[str, object]:
    if min(
        train_limit,
        validation_limit,
        minimum_train_systems_per_staff_count,
        minimum_validation_systems_per_staff_count,
    ) < 1:
        raise ValueError("slice limits and topology minimums must be positive")

    dataset_id = manifest["datasetId"]
    composer_by_score: dict[str, str] = {}
    for item in source_plan["items"]:
        score_id = item["scoreId"]
        if score_id in composer_by_score:
            raise ValueError(f"duplicate source-plan score ID: {score_id}")
        composer_by_score[score_id] = item["composerGroup"]

    protected_ids = set(source_plan["selection"]["excludedEvaluationWorkIds"])
    items = manifest["items"]
    items_by_score = {item["scoreId"]: item for item in items}
    protected_overlap = sorted(protected_ids & items_by_score.keys(), key=int)
    if protected_overlap:
        raise ValueError(f"protected evaluation work IDs are present: {protected_overlap}")

    by_composer: dict[str, list[dict[str, object]]] = defaultdict(list)
    original_splits: dict[str, set[str]] = defaultdict(set)
    for item in items:
        score_id = item["scoreId"]
        composer = composer_by_score.get(score_id)
        if composer is None:
            raise ValueError(f"dataset score is missing from source plan: {score_id}")
        by_composer[composer].append(item)
        original_splits[composer].add(item["split"])
    mixed = sorted(composer for composer, splits in original_splits.items() if len(splits) != 1)
    if mixed:
        raise ValueError(f"composer groups cross original splits: {mixed}")

    validation_composers = {
        composer for composer, splits in original_splits.items() if splits == {"validation"}
    }
    train_composers = set(by_composer) - validation_composers
    validation_counts = _system_counts(
        [item for composer in validation_composers for item in by_composer[composer]]
    )
    train_counts = _system_counts([item for composer in train_composers for item in by_composer[composer]])
    group_counts = {composer: _system_counts(group_items) for composer, group_items in by_composer.items()}
    group_pages = {
        composer: sum(
            page.get("eligibleForTraining", False) for item in group_items for page in item["pages"]
        )
        for composer, group_items in by_composer.items()
    }

    added_validation_composers: list[str] = []
    while any(validation_counts[count] < minimum_validation_systems_per_staff_count for count in STAFF_COUNTS):
        deficits = {
            count: max(0, minimum_validation_systems_per_staff_count - validation_counts[count])
            for count in STAFF_COUNTS
        }
        candidates = []
        for composer in train_composers:
            counts = group_counts[composer]
            if any(
                train_counts[count] - counts[count] < minimum_train_systems_per_staff_count
                for count in STAFF_COUNTS
            ):
                continue
            gain = sum(min(deficits[count], counts[count]) for count in STAFF_COUNTS)
            if gain:
                candidates.append(
                    (
                        -Fraction(gain, max(1, group_pages[composer])),
                        -gain,
                        _composer_key(dataset_id, composer),
                        composer,
                    )
                )
        if not candidates:
            raise ValueError("cannot satisfy validation topology minimums while preserving training evidence")
        composer = min(candidates)[-1]
        added_validation_composers.append(composer)
        train_composers.remove(composer)
        validation_composers.add(composer)
        train_counts.subtract(group_counts[composer])
        validation_counts.update(group_counts[composer])

    train_items = [item for composer in sorted(train_composers) for item in by_composer[composer]]
    validation_items = [item for composer in sorted(validation_composers) for item in by_composer[composer]]
    train = _plan_pages(dataset_id, train_items, split="train", limit=train_limit)
    validation = _plan_pages(dataset_id, validation_items, split="validation", limit=validation_limit)
    selected_train_counts = _selected_system_counts(train, items_by_score)
    selected_validation_counts = _selected_system_counts(validation, items_by_score)
    if any(selected_train_counts[count] < minimum_train_systems_per_staff_count for count in STAFF_COUNTS):
        raise ValueError("train page limit cannot satisfy topology minimums")
    if any(
        selected_validation_counts[count] < minimum_validation_systems_per_staff_count for count in STAFF_COUNTS
    ):
        raise ValueError("validation page limit cannot satisfy topology minimums")

    overlap = sorted(train_composers & validation_composers)
    return {
        "schemaVersion": "1.0.0",
        "datasetId": dataset_id,
        "strategy": "composer-isolated-rare-topology-validation-v1",
        "selection": {
            "trainLimit": train_limit,
            "validationLimit": validation_limit,
            "minimumTrainSystemsPerStaffCount": minimum_train_systems_per_staff_count,
            "minimumValidationSystemsPerStaffCount": minimum_validation_systems_per_staff_count,
            "additionalValidationComposerGroups": sorted(added_validation_composers),
            "trainComposerGroupCount": len(train_composers),
            "validationComposerGroupCount": len(validation_composers),
            "composerGroupOverlap": overlap,
            "protectedEvaluationWorkIdOverlap": protected_overlap,
            "trainSystemsByStaffCount": {str(count): selected_train_counts[count] for count in STAFF_COUNTS},
            "validationSystemsByStaffCount": {
                str(count): selected_validation_counts[count] for count in STAFF_COUNTS
            },
        },
        "train": train,
        "validation": validation,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-manifest", type=Path, required=True)
    parser.add_argument("--source-plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--train-limit", type=int, default=512)
    parser.add_argument("--validation-limit", type=int, default=128)
    parser.add_argument("--minimum-train-systems-per-staff-count", type=int, default=64)
    parser.add_argument("--minimum-validation-systems-per-staff-count", type=int, default=32)
    args = parser.parse_args()
    manifest = json.loads(args.dataset_manifest.read_bytes())
    source_plan = json.loads(args.source_plan.read_bytes())
    result = build_slice(
        manifest,
        source_plan,
        train_limit=args.train_limit,
        validation_limit=args.validation_limit,
        minimum_train_systems_per_staff_count=args.minimum_train_systems_per_staff_count,
        minimum_validation_systems_per_staff_count=args.minimum_validation_systems_per_staff_count,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
