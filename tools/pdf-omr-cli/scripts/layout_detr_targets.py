#!/usr/bin/env python3
"""Pure target conversion for the research-only DETR layout probe."""

from __future__ import annotations

import math


LABELS = ("system-1-staff", "system-2-staff", "system-3-staff")


def _finite_number(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{field} must be a finite number")
    return float(value)


def _normalized_bbox(system: object) -> tuple[float, float, float, float]:
    if not isinstance(system, dict) or not isinstance(system.get("normalizedBBox"), dict):
        raise ValueError("system normalizedBBox must be an object")
    bbox = system["normalizedBBox"]
    x = _finite_number(bbox.get("x"), "normalizedBBox.x")
    y = _finite_number(bbox.get("y"), "normalizedBBox.y")
    width = _finite_number(bbox.get("width"), "normalizedBBox.width")
    height = _finite_number(bbox.get("height"), "normalizedBBox.height")
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        raise ValueError("normalizedBBox must be inside the page")
    return x, y, width, height


def _staff_count(system: dict[str, object]) -> int:
    staff_count = system.get("staffCount")
    if isinstance(staff_count, bool) or not isinstance(staff_count, int) or staff_count not in (1, 2, 3):
        raise ValueError("staffCount must be between one and three")
    lines = system.get("staffLinePolylines")
    if not isinstance(lines, list) or len(lines) != staff_count * 5:
        raise ValueError("staff-line topology does not match staffCount")
    return staff_count


def build_detr_coco_annotation(
    annotation: dict[str, object], *, image_id: int, image_size: tuple[int, int]
) -> dict[str, object]:
    """Build the COCO detection annotation accepted by ``DetrImageProcessor``."""

    if isinstance(image_id, bool) or not isinstance(image_id, int) or image_id < 0:
        raise ValueError("image_id must be a non-negative integer")
    width, height = image_size
    if isinstance(width, bool) or isinstance(height, bool) or not isinstance(width, int) or not isinstance(height, int):
        raise ValueError("image size must contain integers")
    if width <= 0 or height <= 0:
        raise ValueError("image size must be positive")
    systems = annotation.get("systems")
    if not isinstance(systems, list):
        raise ValueError("systems must be a list")
    if len(systems) >= 1000:
        raise ValueError("a page may contain at most 999 systems")

    normalized = []
    for system in systems:
        bbox = _normalized_bbox(system)
        normalized.append((*bbox, _staff_count(system)))
    normalized.sort(key=lambda item: (item[1], item[0], item[3], item[2], item[4]))

    objects = []
    for index, (x, y, box_width, box_height, staff_count) in enumerate(normalized):
        pixel_bbox = [x * width, y * height, box_width * width, box_height * height]
        objects.append(
            {
                "area": pixel_bbox[2] * pixel_bbox[3],
                "bbox": pixel_bbox,
                "category_id": staff_count - 1,
                "id": image_id * 1000 + index,
                "image_id": image_id,
                "iscrowd": 0,
            }
        )
    return {"image_id": image_id, "annotations": objects}
