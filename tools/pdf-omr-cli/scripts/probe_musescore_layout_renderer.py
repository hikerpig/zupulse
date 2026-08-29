#!/usr/bin/env python3
"""Probe deterministic MuseScore rendering and layout truth extraction."""

from __future__ import annotations

import hashlib
import json
import re
import struct
from pathlib import Path

from extract_musescore_layout_truth import extract_layout_page, extract_score_staff_count


NUMBERED_PAGE_PATTERN = re.compile(r"^page-([1-9][0-9]*)\.([a-z]+)$")


def select_probe_items(
    plan: dict[str, object],
    source_root: Path,
    *,
    per_staff_count: int,
    max_items: int,
) -> list[dict[str, object]]:
    if per_staff_count < 1 or max_items < 1:
        raise ValueError("probe limits must be positive")
    raw_items = plan.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("source plan items must be an array")
    resolved_root = source_root.resolve()
    grouped: dict[int, list[dict[str, object]]] = {}
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            raise ValueError("source plan item must be an object")
        score_id = raw_item.get("scoreId")
        source_path = raw_item.get("sourcePath")
        split = raw_item.get("split")
        if not isinstance(score_id, str) or not isinstance(source_path, str) or split not in {"train", "validation"}:
            raise ValueError("source plan item is invalid")
        path = (source_root / source_path).resolve()
        if not path.is_relative_to(resolved_root):
            raise ValueError("source path escapes root")
        if not path.is_file():
            raise ValueError(f"source score is missing: {source_path}")
        staff_count = extract_score_staff_count(path.read_text(encoding="utf-8"))
        grouped.setdefault(staff_count, []).append(
            {"scoreId": score_id, "sourcePath": source_path, "split": split, "staffCount": staff_count}
        )

    selected = []
    for staff_count in sorted(grouped):
        selected.extend(grouped[staff_count][:per_staff_count])
        if len(selected) >= max_items:
            return selected[:max_items]
    return selected


def exported_pages(export_root: Path, extension: str) -> list[Path]:
    single_page = export_root / f"page.{extension}"
    numbered = []
    for path in export_root.glob(f"page-*.{extension}"):
        match = NUMBERED_PAGE_PATTERN.fullmatch(path.name)
        if match is None or match.group(2) != extension:
            raise ValueError(f"invalid exported page filename: {path.name}")
        numbered.append((int(match.group(1)), path))
    if single_page.is_file() and numbered:
        raise ValueError(f"mixed single and numbered {extension} exports")
    if single_page.is_file():
        return [single_page]
    if not numbered:
        raise ValueError(f"MuseScore produced no {extension} pages")
    page_numbers = [page_number for page_number, _ in numbered]
    if sorted(page_numbers) != list(range(1, len(numbered) + 1)):
        raise ValueError(f"MuseScore produced non-contiguous {extension} pages")
    return [path for _, path in sorted(numbered)]


def compare_render_runs(first_root: Path, second_root: Path, *, staff_count: int) -> list[dict[str, object]]:
    first_svgs = exported_pages(first_root, "svg")
    second_svgs = exported_pages(second_root, "svg")
    first_rasters = exported_pages(first_root, "png")
    second_rasters = exported_pages(second_root, "png")
    page_count = len(first_svgs)
    if not all(len(paths) == page_count for paths in [second_svgs, first_rasters, second_rasters]):
        raise ValueError("render runs produced different page counts")

    pages = []
    for page_index in range(page_count):
        first_svg = first_svgs[page_index].read_bytes()
        second_svg = second_svgs[page_index].read_bytes()
        if first_svg != second_svg:
            raise ValueError("SVG output is not deterministic")
        first_raster = first_rasters[page_index].read_bytes()
        second_raster = second_rasters[page_index].read_bytes()
        if first_raster != second_raster:
            raise ValueError("raster output is not deterministic")
        pixel_width, pixel_height = _png_dimensions(first_raster)
        if pixel_width != 1400:
            raise ValueError(f"raster width must be 1400, got {pixel_width}")
        annotation = extract_layout_page(first_svg.decode("utf-8"), page_index=page_index, staff_count=staff_count)
        annotation_bytes = _canonical_json(annotation)
        systems = annotation["systems"]
        assert isinstance(systems, list)
        pages.append(
            {
                "pageIndex": page_index,
                "pixelWidth": pixel_width,
                "pixelHeight": pixel_height,
                "systemCount": len(systems),
                "staffCounts": [system["staffCount"] for system in systems],
                "svgSha256": _sha256(first_svg),
                "rasterSha256": _sha256(first_raster),
                "annotationSha256": _sha256(annotation_bytes),
                "annotation": annotation,
            }
        )
    return pages


def _png_dimensions(content: bytes) -> tuple[int, int]:
    if len(content) < 24 or content[:8] != b"\x89PNG\r\n\x1a\n" or content[12:16] != b"IHDR":
        raise ValueError("raster output is not a PNG with IHDR")
    width, height = struct.unpack(">II", content[16:24])
    if width < 1 or height < 1:
        raise ValueError("raster dimensions must be positive")
    return width, height


def _canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
