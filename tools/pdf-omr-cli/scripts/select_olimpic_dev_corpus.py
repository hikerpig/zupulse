#!/usr/bin/env python3
"""Select a deterministic, stratified OLiMPiC development corpus."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


RELEASE_URL = "https://github.com/ufal/olimpic-icdar24/releases/tag/datasets"
RELEASE = "1.0 (2024-02-12)"
CORPUS_ID = "olimpic-scanned-full-page-dev-v1"


@dataclass(frozen=True)
class Sample:
    work_id: str
    page: int
    system: int


@dataclass(frozen=True)
class WorkSummary:
    work_id: str
    stratum: str
    page_count: int
    system_count: int


def parse_samples(text: str) -> list[Sample]:
    samples: list[Sample] = []
    seen: set[tuple[str, int, int]] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("/")
        if len(parts) != 3 or parts[0] != "samples":
            raise ValueError(f"invalid sample path: {line}")
        work_id = parts[1]
        page_token, system_token = parts[2].split("-s", 1)
        if not page_token.startswith("p") or not system_token.isdigit():
            raise ValueError(f"invalid sample path: {line}")
        page = int(page_token[1:])
        system = int(system_token)
        if not work_id.isdigit() or page < 1 or system < 1:
            raise ValueError(f"invalid sample path: {line}")
        key = (work_id, page, system)
        if key in seen:
            raise ValueError(f"duplicate sample: {line}")
        seen.add(key)
        samples.append(Sample(work_id=work_id, page=page, system=system))
    if not samples:
        raise ValueError("samples.dev.txt is empty")
    return samples


def classify(page_count: int) -> str | None:
    if 2 <= page_count <= 3:
        return "small"
    if 4 <= page_count <= 6:
        return "medium"
    if page_count >= 7:
        return "large"
    return None


def summarize(samples: list[Sample]) -> list[tuple[str, int, int]]:
    by_work: dict[str, set[tuple[int, int]]] = {}
    for sample in samples:
        by_work.setdefault(sample.work_id, set()).add((sample.page, sample.system))
    summaries = []
    for work_id, entries in by_work.items():
        pages = {page for page, _ in entries}
        summaries.append((work_id, len(pages), len(entries)))
    return sorted(summaries)


def select_works(samples: list[Sample], force_include: str) -> list[WorkSummary]:
    candidates: dict[str, list[tuple[str, int, int]]] = {"small": [], "medium": [], "large": []}
    forced: WorkSummary | None = None
    for work_id, page_count, system_count in summarize(samples):
        stratum = classify(page_count)
        if stratum is None:
            continue
        candidates[stratum].append((work_id, page_count, system_count))
        if work_id == force_include:
            forced = WorkSummary(work_id, stratum, page_count, system_count)
    if forced is None:
        raise ValueError(f"forced work is missing or not eligible: {force_include}")
    if forced.stratum != "medium":
        raise ValueError(f"forced work must be medium: {force_include}")

    selected: list[WorkSummary] = []
    for stratum in ("small", "medium", "large"):
        entries = candidates[stratum]
        if stratum == "medium":
            non_forced = [entry for entry in entries if entry[0] != force_include]
            if not non_forced:
                raise ValueError("not enough eligible medium works besides forced work")
            chosen = [
                (force_include, forced.page_count, forced.system_count),
                sorted(non_forced)[0],
            ]
            selected.extend(
                WorkSummary(work_id, stratum, page_count, system_count)
                for work_id, page_count, system_count in sorted(chosen)
            )
            continue
        if len(entries) < 2:
            raise ValueError(f"not enough eligible {stratum} works")
        for work_id, page_count, system_count in sorted(entries)[:2]:
            selected.append(WorkSummary(work_id, stratum, page_count, system_count))
    return selected


def build_document(
    samples: list[Sample],
    selected: list[WorkSummary],
    *,
    source_archive_sha256: str,
    source_archive_bytes: int,
    scanned_archive_sha256: str,
    scanned_archive_bytes: int,
) -> dict[str, object]:
    return {
        "schemaVersion": "1.0.0",
        "corpusId": CORPUS_ID,
        "selectionRule": {
            "sourceSplit": "dev",
            "sampleList": "samples.dev.txt",
            "strata": [
                {"id": "small", "minPages": 2, "maxPages": 3, "count": 2},
                {"id": "medium", "minPages": 4, "maxPages": 6, "count": 2},
                {"id": "large", "minPages": 7, "count": 2},
            ],
            "ordering": "ascending numeric workId within each stratum",
            "forceInclude": {
                "workId": "6007571",
                "reason": "dev 4-page/15-system page-shape representative; not a quality claim",
            },
        },
        "provenance": {
            "dataset": "OLiMPiC scanned",
            "release": RELEASE,
            "releaseUrl": RELEASE_URL,
            "sourceSplit": "dev",
            "license": "CC-BY-SA-4.0 (dataset release; source PDF rights require per-item review)",
            "sourceArchive": {
                "asset": "olimpic-1.0-sources-for-scanned.2024-02-12.tar.gz.tgz",
                "bytes": source_archive_bytes,
                "sha256": source_archive_sha256,
            },
            "scannedArchive": {
                "asset": "olimpic-1.0-scanned.2024-02-12.tar.gz",
                "bytes": scanned_archive_bytes,
                "sha256": scanned_archive_sha256,
            },
        },
        "works": [
            {
                "workId": work.work_id,
                "stratum": work.stratum,
                "pageCount": work.page_count,
                "systemCount": work.system_count,
            }
            for work in selected
        ],
        "totals": {
            "sourceSampleCount": len(samples),
            "workCount": len(selected),
            "pageCount": sum(work.page_count for work in selected),
            "systemCount": sum(work.system_count for work in selected),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples-dev", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-archive-sha256", required=True)
    parser.add_argument("--source-archive-bytes", type=int, required=True)
    parser.add_argument("--scanned-archive-sha256", required=True)
    parser.add_argument("--scanned-archive-bytes", type=int, required=True)
    parser.add_argument("--force-include", default="6007571")
    args = parser.parse_args()

    samples = parse_samples(args.samples_dev.read_text(encoding="utf-8"))
    selected = select_works(samples, force_include=args.force_include)
    document = build_document(
        samples,
        selected,
        source_archive_sha256=args.source_archive_sha256,
        source_archive_bytes=args.source_archive_bytes,
        scanned_archive_sha256=args.scanned_archive_sha256,
        scanned_archive_bytes=args.scanned_archive_bytes,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
