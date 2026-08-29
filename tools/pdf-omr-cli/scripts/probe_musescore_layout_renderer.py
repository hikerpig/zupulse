#!/usr/bin/env python3
"""Probe deterministic MuseScore rendering and layout truth extraction."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path

from extract_musescore_layout_truth import extract_layout_page, extract_score_staff_count


NUMBERED_PAGE_PATTERN = re.compile(r"^page-([1-9][0-9]*)\.([a-z]+)$")
PINNED_MUSESCORE_VERSION = "4.7.4"
RASTER_EXPORT_DPI = 169
TARGET_RASTER_WIDTH = 1400


def require_musescore_version(output: str) -> str:
    version = output.strip()
    if not re.search(rf"\b{re.escape(PINNED_MUSESCORE_VERSION)}$", version):
        raise ValueError(f"layout renderer probe requires MuseScore {PINNED_MUSESCORE_VERSION}, got: {version}")
    return version


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
        first_raster = first_rasters[page_index].read_bytes()
        second_raster = second_rasters[page_index].read_bytes()
        if first_raster != second_raster:
            raise ValueError("raster output is not deterministic")
        pixel_width, pixel_height = _png_dimensions(first_raster)
        if pixel_width != 1400:
            raise ValueError(f"raster width must be 1400, got {pixel_width}")
        first_staff_line_count = first_svg.count(b'class="StaffLines"')
        second_staff_line_count = second_svg.count(b'class="StaffLines"')
        if first_staff_line_count != second_staff_line_count:
            raise ValueError("staff geometry output is not deterministic")
        page_evidence = {
            "pageIndex": page_index,
            "pixelWidth": pixel_width,
            "pixelHeight": pixel_height,
            "rawSvgDeterministic": first_svg == second_svg,
            "rawSvgSha256Runs": [_sha256(first_svg), _sha256(second_svg)],
            "rasterSha256": _sha256(first_raster),
        }
        if first_staff_line_count == 0:
            pages.append(
                {
                    **page_evidence,
                    "eligibleForTraining": False,
                    "exclusionReason": "no-staff-lines",
                    "systemCount": 0,
                    "staffCounts": [],
                }
            )
            continue
        annotation = extract_layout_page(first_svg.decode("utf-8"), page_index=page_index, staff_count=staff_count)
        second_annotation = extract_layout_page(
            second_svg.decode("utf-8"), page_index=page_index, staff_count=staff_count
        )
        annotation_bytes = _canonical_json(annotation)
        if annotation_bytes != _canonical_json(second_annotation):
            raise ValueError("staff geometry output is not deterministic")
        systems = annotation["systems"]
        assert isinstance(systems, list)
        pages.append(
            {
                **page_evidence,
                "eligibleForTraining": True,
                "systemCount": len(systems),
                "staffCounts": [system["staffCount"] for system in systems],
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


def run_probe(
    *,
    source_plan_path: Path,
    source_root: Path,
    musescore_executable: Path,
    sips_executable: Path,
    output_root: Path,
    per_staff_count: int,
    max_items: int,
) -> dict[str, object]:
    if output_root.exists():
        raise ValueError(f"probe output already exists: {output_root}")
    source_plan_bytes = source_plan_path.read_bytes()
    source_plan = json.loads(source_plan_bytes)
    if not isinstance(source_plan, dict) or source_plan.get("corpusId") != "openscore-lieder-layout-train-v1":
        raise ValueError("unexpected source plan")
    source = source_plan.get("source")
    if not isinstance(source, dict) or not isinstance(source.get("revision"), str):
        raise ValueError("source plan revision is missing")
    source_revision = source["revision"]
    actual_revision = _run_command(["git", "-C", str(source_root), "rev-parse", "HEAD"]).strip()
    if actual_revision != source_revision:
        raise ValueError(f"source revision mismatch: expected {source_revision}, got {actual_revision}")
    muse_score_version = require_musescore_version(_run_command([str(musescore_executable), "--version"]))
    selected = select_probe_items(
        source_plan,
        source_root,
        per_staff_count=per_staff_count,
        max_items=max_items,
    )
    if not selected:
        raise ValueError("source plan produced no probe items")

    output_root.mkdir(parents=True)
    rendered_items = []
    for item in selected:
        score_id = item["scoreId"]
        source_path = item["sourcePath"]
        staff_count = item["staffCount"]
        assert isinstance(score_id, str) and isinstance(source_path, str) and isinstance(staff_count, int)
        score_root = output_root / score_id
        for run_name in ["first", "second"]:
            _render_score(
                source_root / source_path,
                score_root / run_name,
                musescore_executable=musescore_executable,
                sips_executable=sips_executable,
            )
        pages = compare_render_runs(score_root / "first", score_root / "second", staff_count=staff_count)
        manifest_pages = []
        annotation_root = score_root / "annotations"
        annotation_root.mkdir()
        first_svg_pages = exported_pages(score_root / "first", "svg")
        first_raster_pages = exported_pages(score_root / "first", "png")
        for page in pages:
            page_index = page["pageIndex"]
            assert isinstance(page_index, int)
            annotation = page.pop("annotation", None)
            paths = {
                "svgPath": first_svg_pages[page_index].relative_to(output_root).as_posix(),
                "rasterPath": first_raster_pages[page_index].relative_to(output_root).as_posix(),
            }
            if annotation is not None:
                annotation_path = annotation_root / f"page-{page_index + 1}.json"
                annotation_path.write_bytes(_canonical_json(annotation))
                paths["annotationPath"] = annotation_path.relative_to(output_root).as_posix()
            manifest_pages.append({**page, **paths})
        rendered_items.append({**item, "pageCount": len(pages), "pages": manifest_pages})

    manifest = {
        "schemaVersion": "1.0.0",
        "probeId": "openscore-lieder-layout-renderer-probe-v1",
        "status": "renderer-annotation-probe-complete-manual-audit-pending",
        "source": {
            "corpusId": source_plan["corpusId"],
            "revision": source_revision,
            "sourcePlanSha256": _sha256(source_plan_bytes),
        },
        "renderer": {
            "id": "musescore-svg-png",
            "version": muse_score_version,
            "imageResolutionDpi": RASTER_EXPORT_DPI,
            "targetRasterWidth": TARGET_RASTER_WIDTH,
            "doubleRun": True,
        },
        "selection": {
            "perStaffCount": per_staff_count,
            "maxItems": max_items,
            "itemCount": len(rendered_items),
            "pageCount": sum(item["pageCount"] for item in rendered_items),
            "observedStaffCounts": sorted({item["staffCount"] for item in rendered_items}),
        },
        "boundaries": {
            "holdoutRead": False,
            "evaluationIdsUsed": False,
            "modelTrainingRun": False,
            "manualAuditComplete": False,
        },
        "items": rendered_items,
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def _render_score(
    source_path: Path,
    run_root: Path,
    *,
    musescore_executable: Path,
    sips_executable: Path,
) -> None:
    run_root.mkdir(parents=True)
    job_path = run_root / "render-job.json"
    job_path.write_text(json.dumps(build_render_job(source_path, run_root), indent=2) + "\n", encoding="utf-8")
    _run_command(
        [
            str(musescore_executable),
            "-f",
            "-r",
            str(RASTER_EXPORT_DPI),
            "-j",
            str(job_path),
        ]
    )
    for raster_path in exported_pages(run_root, "png"):
        resized_path = raster_path.with_name(f"{raster_path.stem}.resized.png")
        _run_command(
            [str(sips_executable), "--resampleWidth", str(TARGET_RASTER_WIDTH), str(raster_path), "--out", str(resized_path)]
        )
        resized_path.replace(raster_path)


def build_render_job(source_path: Path, run_root: Path) -> list[dict[str, object]]:
    return [
        {
            "in": str(source_path.absolute()),
            "out": [str((run_root / "page.svg").absolute()), str((run_root / "page.png").absolute())],
        }
    ]


def _run_command(argv: list[str]) -> str:
    result = subprocess.run(argv, check=False, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(argv)}\n{result.stderr.strip()}")
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-plan", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--musescore-executable", type=Path, required=True)
    parser.add_argument("--sips-executable", type=Path, default=Path("/usr/bin/sips"))
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--per-staff-count", type=int, default=5)
    parser.add_argument("--max-items", type=int, default=15)
    args = parser.parse_args()
    manifest = run_probe(
        source_plan_path=args.source_plan,
        source_root=args.source_root,
        musescore_executable=args.musescore_executable,
        sips_executable=args.sips_executable,
        output_root=args.output_root,
        per_staff_count=args.per_staff_count,
        max_items=args.max_items,
    )
    print(json.dumps(manifest["selection"], sort_keys=True))


if __name__ == "__main__":
    main()
