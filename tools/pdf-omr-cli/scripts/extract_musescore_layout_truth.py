#!/usr/bin/env python3
"""Extract deterministic staff-system truth from MuseScore SVG pages."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass


OUTPUT_SCHEMA_VERSION = "1.0.0"
POINT_PATTERN = re.compile(r"^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$")


@dataclass(frozen=True)
class Line:
    left: float
    right: float
    y: float


def extract_score_staff_count(mscx_text: str) -> int:
    root = ET.fromstring(mscx_text)
    score = root.find("./Score")
    if score is None:
        raise ValueError("MuseScore source is missing Score")
    staff_ids = [staff.get("id") for staff in score.findall("./Part/Staff")]
    if not staff_ids or any(staff_id is None or not staff_id.isdigit() for staff_id in staff_ids):
        raise ValueError("score parts must declare numeric staff ids")
    if len(staff_ids) != len(set(staff_ids)):
        raise ValueError("duplicate declared staff id")
    return len(staff_ids)


def extract_layout_page(svg_text: str, *, page_index: int, staff_count: int) -> dict[str, object]:
    if page_index < 0 or staff_count < 1:
        raise ValueError("page index must be non-negative and staff count must be positive")
    root = ET.fromstring(svg_text)
    width, height = _parse_view_box(root.get("viewBox"))
    lines = [_parse_staff_line(element) for element in root.iter() if element.get("class") == "StaffLines"]
    lines_per_system = staff_count * 5
    if not lines or len(lines) % lines_per_system != 0:
        raise ValueError(f"{len(lines)} staff lines for {staff_count} visible staves per system")

    systems = []
    for system_index in range(len(lines) // lines_per_system):
        system_lines = lines[system_index * lines_per_system : (system_index + 1) * lines_per_system]
        _validate_staff_groups(system_lines)
        normalized_lines = [
            [
                {"x": _normalized(line.left, width), "y": _normalized(line.y, height)},
                {"x": _normalized(line.right, width), "y": _normalized(line.y, height)},
            ]
            for line in system_lines
        ]
        left = min(line.left for line in system_lines)
        right = max(line.right for line in system_lines)
        top = system_lines[0].y
        bottom = system_lines[-1].y
        systems.append(
            {
                "pageIndex": page_index,
                "confidence": 1.0,
                "normalizedBBox": {
                    "x": _normalized(left, width),
                    "y": _normalized(top, height),
                    "width": _normalized(right - left, width),
                    "height": _normalized(bottom - top, height),
                },
                "staffCount": staff_count,
                "staffLinePolylines": normalized_lines,
            }
        )

    return {"schemaVersion": OUTPUT_SCHEMA_VERSION, "pageIndex": page_index, "systems": systems}


def _parse_view_box(value: str | None) -> tuple[float, float]:
    if value is None:
        raise ValueError("SVG is missing viewBox")
    parts = value.split()
    if len(parts) != 4:
        raise ValueError("SVG viewBox must have four numbers")
    x, y, width, height = (float(part) for part in parts)
    if x != 0 or y != 0 or width <= 0 or height <= 0:
        raise ValueError("SVG viewBox must start at zero and have positive dimensions")
    return width, height


def _parse_staff_line(element: ET.Element) -> Line:
    raw_points = element.get("points", "").split()
    if len(raw_points) != 2:
        raise ValueError("staff line must contain exactly two points")
    points = []
    for raw_point in raw_points:
        match = POINT_PATTERN.fullmatch(raw_point)
        if match is None:
            raise ValueError("staff line point is invalid")
        points.append((float(match.group(1)), float(match.group(2))))
    (left, first_y), (right, second_y) = points
    if left < 0 or right <= left or first_y < 0:
        raise ValueError("staff line coordinates are invalid")
    if abs(first_y - second_y) > 1e-6:
        raise ValueError("staff line must be horizontal")
    return Line(left=left, right=right, y=first_y)


def _validate_staff_groups(lines: list[Line]) -> None:
    for staff_index in range(len(lines) // 5):
        staff_lines = lines[staff_index * 5 : staff_index * 5 + 5]
        gaps = [staff_lines[index + 1].y - staff_lines[index].y for index in range(4)]
        mean_gap = sum(gaps) / len(gaps)
        if mean_gap <= 0 or any(abs(gap - mean_gap) / mean_gap > 0.01 for gap in gaps):
            raise ValueError(f"staff {staff_index} does not contain five evenly ordered lines")
    if any(lines[index + 1].y <= lines[index].y for index in range(len(lines) - 1)):
        raise ValueError("staff lines must be ordered from top to bottom")


def _normalized(value: float, extent: float) -> float:
    return round(value / extent, 10)
