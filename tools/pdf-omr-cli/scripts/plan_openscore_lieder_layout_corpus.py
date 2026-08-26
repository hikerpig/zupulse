#!/usr/bin/env python3
"""Build a deterministic, source-only OpenScore Lieder layout-training plan."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path


CORPUS_ID = "openscore-lieder-layout-train-v1"
REPOSITORY = "https://github.com/OpenScore/Lieder"
LICENSE_ID = "CC0-1.0"
SCORE_FILE_PATTERN = re.compile(r"^scores/(.+)/([^/]+)/([^/]+)/lc([0-9]+)\.mscx$")


@dataclass(frozen=True)
class Score:
    score_id: str
    composer: str
    set_group: str
    song: str
    metadata_path: str


def parse_scores_tsv(text: str) -> list[Score]:
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    required = {"id", "path"}
    if reader.fieldnames is None or not required.issubset(reader.fieldnames):
        raise ValueError("scores.tsv must contain id and path columns")

    scores: list[Score] = []
    seen: set[str] = set()
    for row in reader:
        score_id = row["id"].strip()
        metadata_path = row["path"].strip()
        if not score_id.isdigit():
            raise ValueError(f"invalid score id: {score_id}")
        if score_id in seen:
            raise ValueError(f"duplicate score id: {score_id}")
        parts = metadata_path.split("/")
        if len(parts) != 3 or any(not part for part in parts):
            raise ValueError(f"invalid score path: {metadata_path}")
        seen.add(score_id)
        scores.append(Score(score_id, parts[0], parts[1], parts[2], metadata_path))
    if not scores:
        raise ValueError("scores.tsv is empty")
    return scores


def parse_source_paths(text: str) -> set[str]:
    paths = {line.strip() for line in text.splitlines() if line.strip()}
    by_score_id: dict[str, str] = {}
    for path in paths:
        match = SCORE_FILE_PATTERN.fullmatch(path)
        if match is None:
            raise ValueError(f"invalid OpenScore Lieder source path: {path}")
        score_id = match.group(4)
        if score_id in by_score_id:
            raise ValueError(f"duplicate source score id: {score_id}")
        by_score_id[score_id] = path
    return paths


def _source_paths_by_score_id(paths: set[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in paths:
        match = SCORE_FILE_PATTERN.fullmatch(path)
        if match is None:
            raise ValueError(f"invalid OpenScore Lieder source path: {path}")
        score_id = match.group(4)
        if score_id in result:
            raise ValueError(f"duplicate source score id: {score_id}")
        result[score_id] = path
    return result


def _split_for_composer(composer: str) -> str:
    digest = hashlib.sha256(f"{CORPUS_ID}\0{composer}".encode()).digest()
    return "validation" if int.from_bytes(digest[:8], "big") % 10 == 0 else "train"


def _require_hash(value: str, length: int, label: str) -> None:
    if len(value) != length or any(character not in "0123456789abcdef" for character in value):
        raise ValueError(f"invalid {label}")


def build_plan(
    scores: list[Score],
    *,
    protected_work_ids: set[str],
    source_revision: str,
    scores_tsv_sha256: str,
    license_sha256: str,
    available_source_paths: set[str] | None = None,
) -> dict[str, object]:
    _require_hash(source_revision, 40, "source revision")
    _require_hash(scores_tsv_sha256, 64, "scores.tsv sha256")
    _require_hash(license_sha256, 64, "license sha256")
    if any(not work_id.isdigit() for work_id in protected_work_ids):
        raise ValueError("protected work ids must be numeric OpenScore score ids")

    if available_source_paths is None:
        source_paths_by_id = {
            score.score_id: f"scores/{score.metadata_path}/lc{score.score_id}.mscx" for score in scores
        }
    else:
        source_paths_by_id = _source_paths_by_score_id(available_source_paths)

    metadata_score_ids = {score.score_id for score in scores}
    missing_source_score_ids = sorted(metadata_score_ids - source_paths_by_id.keys(), key=int)
    source_without_metadata_ids = sorted(source_paths_by_id.keys() - metadata_score_ids, key=int)
    if source_without_metadata_ids:
        raise ValueError(
            "source score ids missing from scores.tsv: " + ", ".join(source_without_metadata_ids)
        )

    items = []
    for score in sorted(scores, key=lambda value: int(value.score_id)):
        source_path = source_paths_by_id.get(score.score_id)
        if source_path is None or score.score_id in protected_work_ids:
            continue
        items.append(
            {
                "scoreId": score.score_id,
                "composerGroup": score.composer,
                "setGroup": score.set_group,
                "sourcePath": source_path,
                "split": _split_for_composer(score.composer),
            }
        )

    train_count = sum(item["split"] == "train" for item in items)
    validation_count = len(items) - train_count
    return {
        "schemaVersion": "1.0.0",
        "corpusId": CORPUS_ID,
        "status": "source-eligible-rendering-not-run",
        "purpose": "learned-layout-pretraining",
        "source": {
            "repository": REPOSITORY,
            "revision": source_revision,
            "scoreCount": len(scores),
            "scoresTsvPath": "data/scores.tsv",
            "scoresTsvSha256": scores_tsv_sha256,
            "license": {
                "id": LICENSE_ID,
                "evidence": f"{REPOSITORY}/blob/{source_revision}/LICENSE.txt",
                "sha256": license_sha256,
                "commercialTrainingAllowed": True,
                "redistributionAllowed": True,
            },
        },
        "selection": {
            "grouping": "composer",
            "splitRule": f"sha256('{CORPUS_ID}\\0' + composer)[0:8] uint64 mod 10; 0=validation, else=train",
            "excludedEvaluationWorkIds": sorted(protected_work_ids, key=int),
            "missingSourceScoreIds": missing_source_score_ids,
            "eligibleScoreCount": len(items),
            "trainScoreCount": train_count,
            "validationScoreCount": validation_count,
        },
        "boundaries": {
            "inputDomain": "synthetic-typeset",
            "realScanEvaluationReplacement": False,
            "renderedArtifactsProduced": False,
            "annotationsProduced": False,
            "modelTrainingRun": False,
            "holdoutRead": False,
            "olaImplementationReused": False,
        },
        "items": items,
    }


def _read_id_lines(path: Path) -> set[str]:
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores-tsv", type=Path, required=True)
    parser.add_argument("--source-paths", type=Path, required=True)
    parser.add_argument("--protected-work-ids", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--scores-tsv-sha256", required=True)
    parser.add_argument("--license-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    plan = build_plan(
        parse_scores_tsv(args.scores_tsv.read_text(encoding="utf-8")),
        protected_work_ids=_read_id_lines(args.protected_work_ids),
        source_revision=args.source_revision,
        scores_tsv_sha256=args.scores_tsv_sha256,
        license_sha256=args.license_sha256,
        available_source_paths=parse_source_paths(args.source_paths.read_text(encoding="utf-8")),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
