#!/usr/bin/env python3
"""Pure target conversion for the research-only DETR layout probe."""

from __future__ import annotations

import math


LABELS = ("system-1-staff", "system-2-staff", "system-3-staff")
OLA_LABELS = ("system", "staff")


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


def normalized_staff_bboxes(system: dict[str, object]) -> list[tuple[float, float, float, float]]:
    """Return one normalized bounding box for each five-line staff."""

    staff_count = _staff_count(system)
    lines = system["staffLinePolylines"]
    boxes = []
    for staff_index in range(staff_count):
        points = []
        for line in lines[staff_index * 5 : (staff_index + 1) * 5]:
            if not isinstance(line, list) or not line:
                raise ValueError("staff-line polyline must contain points")
            for point in line:
                if not isinstance(point, dict):
                    raise ValueError("staff-line point must be an object")
                x = _finite_number(point.get("x"), "staff-line point x")
                y = _finite_number(point.get("y"), "staff-line point y")
                if not 0 <= x <= 1 or not 0 <= y <= 1:
                    raise ValueError("staff-line point must be inside the page")
                points.append((x, y))
        left = min(point[0] for point in points)
        top = min(point[1] for point in points)
        right = max(point[0] for point in points)
        bottom = max(point[1] for point in points)
        if right <= left or bottom <= top:
            raise ValueError("staff-line bounding box must have positive dimensions")
        boxes.append((left, top, right - left, bottom - top))
    return boxes


def _coco_object(
    bbox: tuple[float, float, float, float],
    *,
    category_id: int,
    image_id: int,
    object_id: int,
    image_size: tuple[int, int],
) -> dict[str, object]:
    width, height = image_size
    x, y, box_width, box_height = bbox
    pixel_bbox = [x * width, y * height, box_width * width, box_height * height]
    return {
        "area": pixel_bbox[2] * pixel_bbox[3],
        "bbox": pixel_bbox,
        "category_id": category_id,
        "id": image_id * 1000 + object_id,
        "image_id": image_id,
        "iscrowd": 0,
    }


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
        objects.append(
            _coco_object(
                (x, y, box_width, box_height),
                category_id=staff_count - 1,
                image_id=image_id,
                object_id=index,
                image_size=image_size,
            )
        )
    return {"image_id": image_id, "annotations": objects}


def build_ola_detr_coco_annotation(
    annotation: dict[str, object], *, image_id: int, image_size: tuple[int, int]
) -> dict[str, object]:
    """Build deterministic class-agnostic ``system`` and ``staff`` targets."""

    # Reuse the established validation for identifiers, image size, and system boxes.
    build_detr_coco_annotation(annotation, image_id=image_id, image_size=image_size)
    systems = []
    for system in annotation["systems"]:
        bbox = _normalized_bbox(system)
        systems.append((bbox, normalized_staff_bboxes(system)))
    systems.sort(key=lambda item: (item[0][1], item[0][0], item[0][3], item[0][2]))

    objects = []
    for system_bbox, staff_bboxes in systems:
        objects.append(
            _coco_object(
                system_bbox,
                category_id=0,
                image_id=image_id,
                object_id=len(objects),
                image_size=image_size,
            )
        )
        for staff_bbox in staff_bboxes:
            objects.append(
                _coco_object(
                    staff_bbox,
                    category_id=1,
                    image_id=image_id,
                    object_id=len(objects),
                    image_size=image_size,
                )
            )
    if len(objects) >= 1000:
        raise ValueError("a page may contain at most 999 layout objects")
    return {"image_id": image_id, "annotations": objects}
