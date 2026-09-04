#!/usr/bin/env python3
"""Build the deterministic OpenScore Lieder staff-line segmentation dataset."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, __version__ as pillow_version

from extract_musescore_layout_truth import extract_layout_page, extract_score_staff_count
from probe_musescore_layout_renderer import (
    PINNED_MUSESCORE_VERSION,
    TARGET_RASTER_WIDTH,
    exported_pages,
    require_musescore_version,
)


DATASET_ID = "openscore-lieder-staff-line-segmentation-v1"
DEFAULT_SEED = 20260829
MAX_STAFF_COUNT = 3
PINNED_RESVG_VERSION = "0.48.1"


@dataclass(frozen=True)
class AugmentedPage:
    image: Image.Image
    mask: Image.Image
    annotation: dict[str, object]
    spec: dict[str, object]


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def augmentation_seed(base_seed: int, score_id: str, page_index: int) -> int:
    content = f"{DATASET_ID}\0{base_seed}\0{score_id}\0{page_index}".encode()
    return int.from_bytes(hashlib.sha256(content).digest()[:8], "big")


def validate_source_plan(
    plan: object,
    *,
    expected_train: int = 1144,
    expected_validation: int = 133,
) -> list[dict[str, str]]:
    if not isinstance(plan, dict) or plan.get("corpusId") != "openscore-lieder-layout-train-v1":
        raise ValueError("unexpected source plan")
    selection = plan.get("selection")
    items = plan.get("items")
    if not isinstance(selection, dict) or not isinstance(items, list):
        raise ValueError("source plan selection or items are missing")
    protected = selection.get("excludedEvaluationWorkIds")
    if not isinstance(protected, list) or not all(isinstance(score_id, str) for score_id in protected):
        raise ValueError("source plan protected evaluation IDs are invalid")
    protected_ids = set(protected)
    validated = []
    seen_ids = set()
    split_counts = {"train": 0, "validation": 0}
    for raw_item in items:
        if not isinstance(raw_item, dict):
            raise ValueError("source plan item must be an object")
        score_id = raw_item.get("scoreId")
        source_path = raw_item.get("sourcePath")
        split = raw_item.get("split")
        if not isinstance(score_id, str) or not isinstance(source_path, str) or split not in split_counts:
            raise ValueError("source plan item is invalid")
        if score_id in protected_ids:
            raise ValueError(f"protected evaluation score ID is present: {score_id}")
        if score_id in seen_ids:
            raise ValueError(f"duplicate score ID: {score_id}")
        seen_ids.add(score_id)
        split_counts[split] += 1
        validated.append({"scoreId": score_id, "sourcePath": source_path, "split": split})
    if split_counts != {"train": expected_train, "validation": expected_validation}:
        raise ValueError(f"source plan split counts are invalid: {split_counts}")
    return validated


def build_render_jobs(
    items: list[dict[str, str]], source_root: Path, output_root: Path
) -> list[dict[str, object]]:
    jobs = []
    for item in items:
        render_root = output_root / "canonical" / item["split"] / item["scoreId"] / "render"
        jobs.append(
            {
                "in": str((source_root / item["sourcePath"]).absolute()),
                "out": [str((render_root / "page.svg").absolute())],
            }
        )
    return jobs


def build_resvg_command(
    resvg_executable: Path, font_directory: Path, svg_path: Path
) -> list[str]:
    return [
        str(resvg_executable),
        "-w",
        str(TARGET_RASTER_WIDTH),
        "--background",
        "#fff",
        "--skip-system-fonts",
        "--use-fonts-dir",
        str(font_directory),
        "--resources-dir",
        str(svg_path.parent),
        "-",
        "-c",
    ]


def canonicalize_svg_paint_order(content: bytes) -> bytes:
    """Stabilize MuseScore's nondeterministic order within each SVG paint class."""
    lines = content.splitlines(keepends=True)
    class_slots: dict[bytes, list[int]] = defaultdict(list)
    for index, line in enumerate(lines):
        match = re.search(rb'class="([^"]+)"', line)
        if match:
            class_slots[match.group(1)].append(index)
    for indexes in class_slots.values():
        ordered = sorted(lines[index] for index in indexes)
        for index, line in zip(indexes, ordered, strict=True):
            lines[index] = line
    return b"".join(lines)


def select_staff_bounded_items(
    items: list[dict[str, str]], source_root: Path, *, max_staff_count: int
) -> tuple[list[dict[str, object]], dict[str, int]]:
    if max_staff_count < 1:
        raise ValueError("maximum staff count must be positive")
    selected = []
    excluded: dict[str, int] = {}
    for item in items:
        source_path = source_root / item["sourcePath"]
        staff_count = extract_score_staff_count(source_path.read_text(encoding="utf-8"))
        if staff_count > max_staff_count:
            key = str(staff_count)
            excluded[key] = excluded.get(key, 0) + 1
            continue
        selected.append({**item, "declaredStaffCount": staff_count})
    return selected, excluded


def draw_staff_line_mask(annotation: dict[str, object], size: tuple[int, int]) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    line_width = max(1, round(height * 0.0015))
    for system in annotation["systems"]:
        for polyline in system["staffLinePolylines"]:
            points = [(round(point["x"] * (width - 1)), round(point["y"] * (height - 1))) for point in polyline]
            draw.line(points, fill=255, width=line_width)
    return mask


def augment_training_page(image: Image.Image, annotation: dict[str, object], *, seed: int) -> AugmentedPage:
    grayscale = image.convert("L")
    width, height = grayscale.size
    rng = np.random.default_rng(seed)
    angle = math.radians(float(rng.uniform(-1.2, 1.2)))
    scale = float(rng.uniform(0.992, 1.008))
    cosine = math.cos(angle) * scale
    sine = math.sin(angle) * scale
    center = np.array([(width - 1) / 2, (height - 1) / 2])
    source_corners = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=float)
    rotation = np.array([[cosine, -sine], [sine, cosine]])
    destination_corners = (source_corners - center) @ rotation.T + center
    jitter = rng.uniform(-0.006, 0.006, size=(4, 2)) * np.array([width, height])
    destination_corners = np.clip(destination_corners + jitter, [0, 0], [width - 1, height - 1])
    forward = _homography(source_corners, destination_corners)
    inverse = np.linalg.inv(forward)
    inverse /= inverse[2, 2]
    coefficients = tuple(float(value) for value in inverse.flatten()[:8])

    transformed_image = grayscale.transform(
        grayscale.size,
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.BICUBIC,
        fillcolor=255,
    )
    clean_mask = draw_staff_line_mask(annotation, grayscale.size)
    transformed_mask = clean_mask.transform(
        clean_mask.size,
        Image.Transform.PERSPECTIVE,
        coefficients,
        resample=Image.Resampling.NEAREST,
        fillcolor=0,
    )
    contrast = float(rng.uniform(0.72, 1.18))
    brightness = float(rng.uniform(0.94, 1.04))
    blur_radius = float(rng.uniform(0.0, 0.65))
    transformed_image = ImageEnhance.Contrast(transformed_image).enhance(contrast)
    transformed_image = ImageEnhance.Brightness(transformed_image).enhance(brightness)
    if blur_radius > 0.05:
        transformed_image = transformed_image.filter(ImageFilter.GaussianBlur(blur_radius))
    pixels = np.asarray(transformed_image, dtype=np.float32)
    noise_sigma = float(rng.uniform(0.8, 4.0))
    pixels += rng.normal(0.0, noise_sigma, size=pixels.shape)
    background_shift = rng.normal(float(rng.uniform(-3.0, 3.0)), 1.5, size=(height, 1))
    pixels += background_shift
    pixels = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
    transformed_image = Image.fromarray(pixels, mode="L")
    occlusion_count = int(rng.integers(0, 3))
    if occlusion_count:
        draw = ImageDraw.Draw(transformed_image)
        for _ in range(occlusion_count):
            left = int(rng.integers(0, max(1, width - 10)))
            top = int(rng.integers(0, max(1, height - 10)))
            right = min(width - 1, left + int(rng.integers(max(2, width // 100), max(3, width // 25))))
            bottom = min(height - 1, top + int(rng.integers(max(2, height // 300), max(3, height // 100))))
            draw.rectangle((left, top, right, bottom), fill=int(rng.integers(235, 256)))

    transformed_annotation = _transform_annotation(annotation, forward, width, height)
    spec = {
        "seed": seed,
        "angleDegrees": round(math.degrees(angle), 8),
        "scale": round(scale, 8),
        "destinationCorners": [[round(float(x), 6), round(float(y), 6)] for x, y in destination_corners],
        "contrast": round(contrast, 8),
        "brightness": round(brightness, 8),
        "blurRadius": round(blur_radius, 8),
        "noiseSigma": round(noise_sigma, 8),
        "occlusionCount": occlusion_count,
    }
    return AugmentedPage(transformed_image, transformed_mask, transformed_annotation, spec)


def _homography(source: np.ndarray, destination: np.ndarray) -> np.ndarray:
    rows = []
    values = []
    for (x, y), (target_x, target_y) in zip(source, destination, strict=True):
        rows.extend([[x, y, 1, 0, 0, 0, -target_x * x, -target_x * y], [0, 0, 0, x, y, 1, -target_y * x, -target_y * y]])
        values.extend([target_x, target_y])
    solution = np.linalg.solve(np.asarray(rows, dtype=float), np.asarray(values, dtype=float))
    return np.append(solution, 1.0).reshape(3, 3)


def _transform_annotation(
    annotation: dict[str, object], matrix: np.ndarray, width: int, height: int
) -> dict[str, object]:
    transformed_systems = []
    for system in annotation["systems"]:
        transformed_lines = []
        all_points = []
        for polyline in system["staffLinePolylines"]:
            transformed_polyline = []
            for point in polyline:
                vector = matrix @ np.array([point["x"] * (width - 1), point["y"] * (height - 1), 1.0])
                x = float(vector[0] / vector[2] / (width - 1))
                y = float(vector[1] / vector[2] / (height - 1))
                if not 0 <= x <= 1 or not 0 <= y <= 1:
                    raise ValueError("augmented staff-line point is outside the page")
                normalized = {"x": round(x, 10), "y": round(y, 10)}
                transformed_polyline.append(normalized)
                all_points.append(normalized)
            transformed_lines.append(transformed_polyline)
        left = min(point["x"] for point in all_points)
        top = min(point["y"] for point in all_points)
        right = max(point["x"] for point in all_points)
        bottom = max(point["y"] for point in all_points)
        transformed_systems.append(
            {
                **system,
                "normalizedBBox": {
                    "x": left,
                    "y": top,
                    "width": round(right - left, 10),
                    "height": round(bottom - top, 10),
                },
                "staffLinePolylines": transformed_lines,
            }
        )
    return {**annotation, "systems": transformed_systems}


def _save_png(image: Image.Image, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)
    return sha256(path.read_bytes())


def _run(argv: list[str]) -> str:
    result = subprocess.run(argv, check=False, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(argv)}\n{result.stderr.strip()}")
    return result.stdout


def _run_bytes(argv: list[str], *, input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(argv, check=False, capture_output=True, input=input_bytes)
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(argv)}\n{result.stderr.decode(errors='replace').strip()}"
        )
    return result.stdout


def _rasterize_svg(svg_path: Path, *, resvg_executable: Path, font_directory: Path) -> Image.Image:
    stable_svg = canonicalize_svg_paint_order(svg_path.read_bytes())
    png_bytes = _run_bytes(
        build_resvg_command(resvg_executable, font_directory, svg_path), input_bytes=stable_svg
    )
    with Image.open(BytesIO(png_bytes)) as rendered:
        rendered.load()
        if rendered.width != TARGET_RASTER_WIDTH:
            raise ValueError(f"resvg raster width must be {TARGET_RASTER_WIDTH}, got {rendered.width}")
        return rendered.convert("L")


def _font_declaration(font_directory: Path) -> tuple[int, str]:
    files = sorted(path for path in font_directory.rglob("*") if path.is_file())
    if not files:
        raise ValueError(f"font directory is empty: {font_directory}")
    declaration = [
        {"path": path.relative_to(font_directory).as_posix(), "sha256": sha256(path.read_bytes())}
        for path in files
    ]
    return len(files), sha256(canonical_json(declaration))


def preflight_rendered_layouts(
    items: list[dict[str, str]],
    source_root: Path,
    output_root: Path,
    *,
    max_staff_count: int | None = None,
) -> dict[str, object]:
    page_count = 0
    eligible_page_count = 0
    system_count = 0
    systems_by_staff_count: dict[str, int] = {}
    for item in items:
        score_id = item["scoreId"]
        render_root = output_root / "canonical" / item["split"] / score_id / "render"
        source_text = (source_root / item["sourcePath"]).read_text(encoding="utf-8")
        declared_staff_count = extract_score_staff_count(source_text)
        for page_index, svg_path in enumerate(exported_pages(render_root, "svg")):
            page_count += 1
            svg_bytes = svg_path.read_bytes()
            if b'class="StaffLines"' not in svg_bytes:
                continue
            try:
                annotation = extract_layout_page(
                    svg_bytes.decode("utf-8"), page_index=page_index, staff_count=declared_staff_count
                )
            except ValueError as error:
                raise ValueError(f"layout truth failed for score {score_id} page {page_index + 1}: {error}") from error
            eligible_page_count += 1
            for system in annotation["systems"]:
                if max_staff_count is not None and system["staffCount"] > max_staff_count:
                    raise ValueError(
                        f"layout truth exceeded {max_staff_count} staves for score {score_id} page {page_index + 1}"
                    )
                system_count += 1
                staff_count = str(system["staffCount"])
                systems_by_staff_count[staff_count] = systems_by_staff_count.get(staff_count, 0) + 1
    return {
        "pageCount": page_count,
        "eligiblePageCount": eligible_page_count,
        "excludedPageCount": page_count - eligible_page_count,
        "systemCount": system_count,
        "systemsByStaffCount": systems_by_staff_count,
    }


def verify_manifest_artifacts(manifest: dict[str, object], output_root: Path) -> dict[str, int]:
    resolved_root = output_root.resolve()
    verified_file_count = 0
    eligible_page_count = 0
    augmented_page_count = 0
    for item in manifest["items"]:
        split = item["split"]
        for page in item["pages"]:
            if not page["eligibleForTraining"]:
                if "canonical" in page or "augmented" in page:
                    raise ValueError("excluded page must not contain training artifacts")
                continue
            eligible_page_count += 1
            variants = [("canonical", page.get("canonical"))]
            if split == "train":
                variants.append(("augmented", page.get("augmented")))
                augmented_page_count += 1
            elif "augmented" in page:
                raise ValueError("validation page must not contain augmentation")
            for variant_name, variant in variants:
                if not isinstance(variant, dict):
                    raise ValueError(f"eligible page is missing {variant_name} artifacts")
                for artifact_name in ["image", "mask", "annotation"]:
                    relative_path = variant.get(f"{artifact_name}Path")
                    expected_sha = variant.get(f"{artifact_name}Sha256")
                    if not isinstance(relative_path, str) or not isinstance(expected_sha, str):
                        raise ValueError(f"{variant_name} {artifact_name} evidence is invalid")
                    artifact_path = (output_root / relative_path).resolve()
                    if not artifact_path.is_relative_to(resolved_root) or not artifact_path.is_file():
                        raise ValueError(f"artifact is missing or escapes dataset root: {relative_path}")
                    if sha256(artifact_path.read_bytes()) != expected_sha:
                        raise ValueError(f"artifact hash mismatch: {relative_path}")
                    verified_file_count += 1
    return {
        "eligiblePageCount": eligible_page_count,
        "augmentedPageCount": augmented_page_count,
        "verifiedFileCount": verified_file_count,
    }


def build_dataset(
    *,
    source_plan_path: Path,
    source_root: Path,
    musescore_executable: Path,
    resvg_executable: Path,
    font_directory: Path,
    output_root: Path,
    seed: int,
    batch_size: int,
    max_items: int | None,
    resume_from_rendered: bool = False,
    filter_existing_artifacts: bool = False,
) -> dict[str, object]:
    if resume_from_rendered and filter_existing_artifacts:
        raise ValueError("resume and filter-existing modes are mutually exclusive")
    reuses_output = resume_from_rendered or filter_existing_artifacts
    if output_root.exists() and not reuses_output:
        raise ValueError(f"dataset output already exists: {output_root}")
    if not output_root.exists() and reuses_output:
        raise ValueError(f"rendered dataset output does not exist: {output_root}")
    if batch_size < 1 or max_items is not None and max_items < 1:
        raise ValueError("build limits must be positive")
    plan_bytes = source_plan_path.read_bytes()
    plan = json.loads(plan_bytes)
    source_plan_items = validate_source_plan(plan)
    source = plan.get("source")
    if not isinstance(source, dict) or not isinstance(source.get("revision"), str):
        raise ValueError("source revision is missing")
    source_revision = source["revision"]
    actual_revision = _run(["git", "-C", str(source_root), "rev-parse", "HEAD"]).strip()
    if actual_revision != source_revision:
        raise ValueError(f"source revision mismatch: expected {source_revision}, got {actual_revision}")
    version = require_musescore_version(_run([str(musescore_executable), "--version"]))
    resvg_version = _run([str(resvg_executable), "--version"]).strip()
    if resvg_version != PINNED_RESVG_VERSION:
        raise ValueError(f"dataset builder requires resvg {PINNED_RESVG_VERSION}, got: {resvg_version}")
    font_file_count, font_declaration_sha = _font_declaration(font_directory)
    staff_bounded_items, excluded_scores_by_staff_count = select_staff_bounded_items(
        source_plan_items, source_root, max_staff_count=MAX_STAFF_COUNT
    )
    items = staff_bounded_items[:max_items] if max_items is not None else staff_bounded_items
    resolved_source_root = source_root.resolve()
    for item in items:
        source_path = (source_root / item["sourcePath"]).resolve()
        if not source_path.is_relative_to(resolved_source_root) or not source_path.is_file():
            raise ValueError(f"source score is missing or escapes root: {item['sourcePath']}")

    output_root.mkdir(parents=True, exist_ok=reuses_output)
    jobs = build_render_jobs(items, source_root, output_root)
    jobs_root = output_root / "jobs"
    if not reuses_output:
        jobs_root.mkdir()
        for batch_index in range(0, len(jobs), batch_size):
            batch = jobs[batch_index : batch_index + batch_size]
            for job in batch:
                for output_path in job["out"]:
                    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            job_path = jobs_root / f"batch-{batch_index // batch_size + 1:04d}.json"
            job_path.write_bytes(canonical_json(batch))
            _run([str(musescore_executable), "-f", "-j", str(job_path)])

    preflight = preflight_rendered_layouts(
        items, source_root, output_root, max_staff_count=MAX_STAFF_COUNT
    )
    print(json.dumps({"preflight": preflight}, sort_keys=True), flush=True)

    selection = {
        "fullBuild": max_items is None,
        "sourcePlanScoreCount": len(source_plan_items),
        "scoreCount": len(items),
        "trainScoreCount": sum(item["split"] == "train" for item in items),
        "validationScoreCount": sum(item["split"] == "validation" for item in items),
        "maxStaffCount": MAX_STAFF_COUNT,
        "excludedScoreCount": len(source_plan_items) - len(staff_bounded_items),
        "excludedScoresByDeclaredStaffCount": excluded_scores_by_staff_count,
        "pageCount": preflight["pageCount"],
        "eligiblePageCount": preflight["eligiblePageCount"],
        "preflight": preflight,
    }
    if filter_existing_artifacts:
        existing_manifest = json.loads((output_root / "manifest.json").read_bytes())
        if (
            existing_manifest.get("source", {}).get("sourcePlanSha256") != sha256(plan_bytes)
            or existing_manifest.get("augmentation", {}).get("baseSeed") != seed
        ):
            raise ValueError("existing manifest source or augmentation seed differs")
        existing_items = {
            item["scoreId"]: item for item in existing_manifest.get("items", []) if isinstance(item, dict)
        }
        selected_manifest_items = []
        for item in items:
            existing_item = existing_items.get(item["scoreId"])
            if existing_item is None or existing_item.get("declaredStaffCount") != item["declaredStaffCount"]:
                raise ValueError(f"existing manifest is missing selected score {item['scoreId']}")
            selected_manifest_items.append(existing_item)
        manifest = {**existing_manifest, "selection": selection, "items": selected_manifest_items}
        (output_root / "manifest.json").write_bytes(canonical_json(manifest))
        verification = verify_manifest_artifacts(manifest, output_root)
        print(json.dumps({"artifactVerification": verification}, sort_keys=True), flush=True)
        print(json.dumps(selection, sort_keys=True), flush=True)
        return manifest

    manifest_items = []
    for item in items:
        score_id = item["scoreId"]
        split = item["split"]
        score_root = output_root / "canonical" / split / score_id
        render_root = score_root / "render"
        source_text = (source_root / item["sourcePath"]).read_text(encoding="utf-8")
        staff_count = extract_score_staff_count(source_text)
        if staff_count != item["declaredStaffCount"]:
            raise ValueError(f"declared staff count changed for score {score_id}")
        svg_pages = exported_pages(render_root, "svg")
        manifest_pages = []
        for page_index, svg_path in enumerate(svg_pages):
            svg_bytes = svg_path.read_bytes()
            if b'class="StaffLines"' not in svg_bytes:
                manifest_pages.append(
                    {"pageIndex": page_index, "eligibleForTraining": False, "exclusionReason": "no-staff-lines"}
                )
                continue
            annotation = extract_layout_page(svg_bytes.decode("utf-8"), page_index=page_index, staff_count=staff_count)
            canonical_image = _rasterize_svg(
                svg_path, resvg_executable=resvg_executable, font_directory=font_directory
            )
            clean_root = score_root / "pages" / f"page-{page_index + 1}"
            clean_image_path = clean_root.with_suffix(".png")
            clean_mask_path = clean_root.with_suffix(".mask.png")
            clean_annotation_path = clean_root.with_suffix(".json")
            clean_image_sha = _save_png(canonical_image, clean_image_path)
            clean_mask_sha = _save_png(draw_staff_line_mask(annotation, canonical_image.size), clean_mask_path)
            annotation_bytes = canonical_json(annotation)
            clean_annotation_path.write_bytes(annotation_bytes)
            page_record: dict[str, object] = {
                "pageIndex": page_index,
                "eligibleForTraining": True,
                "pixelWidth": canonical_image.width,
                "pixelHeight": canonical_image.height,
                "systemCount": len(annotation["systems"]),
                "staffCounts": [system["staffCount"] for system in annotation["systems"]],
                "canonical": {
                    "imagePath": clean_image_path.relative_to(output_root).as_posix(),
                    "imageSha256": clean_image_sha,
                    "maskPath": clean_mask_path.relative_to(output_root).as_posix(),
                    "maskSha256": clean_mask_sha,
                    "annotationPath": clean_annotation_path.relative_to(output_root).as_posix(),
                    "annotationSha256": sha256(annotation_bytes),
                },
            }
            if split == "train":
                page_seed = augmentation_seed(seed, score_id, page_index)
                augmented = augment_training_page(canonical_image, annotation, seed=page_seed)
                augmented_root = output_root / "augmented" / score_id / f"page-{page_index + 1}"
                augmented_image_path = augmented_root.with_suffix(".png")
                augmented_mask_path = augmented_root.with_suffix(".mask.png")
                augmented_annotation_path = augmented_root.with_suffix(".json")
                augmented_annotation_bytes = canonical_json(augmented.annotation)
                augmented_annotation_path.parent.mkdir(parents=True, exist_ok=True)
                augmented_annotation_path.write_bytes(augmented_annotation_bytes)
                page_record["augmented"] = {
                    "spec": augmented.spec,
                    "imagePath": augmented_image_path.relative_to(output_root).as_posix(),
                    "imageSha256": _save_png(augmented.image, augmented_image_path),
                    "maskPath": augmented_mask_path.relative_to(output_root).as_posix(),
                    "maskSha256": _save_png(augmented.mask, augmented_mask_path),
                    "annotationPath": augmented_annotation_path.relative_to(output_root).as_posix(),
                    "annotationSha256": sha256(augmented_annotation_bytes),
                }
            manifest_pages.append(page_record)
        manifest_items.append({**item, "declaredStaffCount": staff_count, "pageCount": len(svg_pages), "pages": manifest_pages})

    manifest = {
        "schemaVersion": "1.0.0",
        "datasetId": DATASET_ID,
        "status": "build-complete",
        "source": {
            "corpusId": plan["corpusId"],
            "revision": source_revision,
            "sourcePlanSha256": sha256(plan_bytes),
        },
        "renderer": {
            "musescoreVersion": version,
            "targetRasterWidth": TARGET_RASTER_WIDTH,
            "pillowVersion": pillow_version,
            "numpyVersion": np.__version__,
            "svgRasterizer": {
                "id": "resvg",
                "version": resvg_version,
                "skipSystemFonts": True,
                "bundledFontFileCount": font_file_count,
                "bundledFontDeclarationSha256": font_declaration_sha,
            },
        },
        "augmentation": {"baseSeed": seed, "variantsPerTrainPage": 1, "validationAugmented": False},
        "selection": selection,
        "boundaries": {"holdoutRead": False, "evaluationIdsUsed": False},
        "items": manifest_items,
    }
    manifest_path = output_root / "manifest.json"
    manifest_path.write_bytes(canonical_json(manifest))
    verification = verify_manifest_artifacts(manifest, output_root)
    print(json.dumps({"artifactVerification": verification}, sort_keys=True), flush=True)
    print(json.dumps(manifest["selection"], sort_keys=True), flush=True)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-plan", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--musescore-executable", type=Path, required=True)
    parser.add_argument("--resvg-executable", type=Path, required=True)
    parser.add_argument("--font-directory", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-items", type=int)
    parser.add_argument("--resume-from-rendered", action="store_true")
    parser.add_argument("--filter-existing-artifacts", action="store_true")
    args = parser.parse_args()
    build_dataset(
        source_plan_path=args.source_plan,
        source_root=args.source_root,
        musescore_executable=args.musescore_executable,
        resvg_executable=args.resvg_executable,
        font_directory=args.font_directory,
        output_root=args.output_root,
        seed=args.seed,
        batch_size=args.batch_size,
        max_items=args.max_items,
        resume_from_rendered=args.resume_from_rendered,
        filter_existing_artifacts=args.filter_existing_artifacts,
    )


if __name__ == "__main__":
    main()
