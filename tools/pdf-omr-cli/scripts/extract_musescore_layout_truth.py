#!/usr/bin/env python3
"""Extract deterministic staff-system truth from MuseScore SVG pages."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass


OUTPUT_SCHEMA_VERSION = "1.0.0"
POINT_PATTERN = re.compile(r"^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$")
PATH_POINT_PATTERN = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)")
MATRIX_PATTERN = re.compile(
    r"^matrix\((-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?),"
    r"(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)\)$"
)


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
    raw_lines = [_parse_staff_line(element) for element in root.iter() if element.get("class") == "StaffLines"]
    if not raw_lines or len(raw_lines) % 5 != 0:
        raise ValueError(f"{len(raw_lines)} staff lines for {staff_count} visible staves per system")
    _validate_staff_groups(raw_lines)
    staff_groups = [raw_lines[index : index + 5] for index in range(0, len(raw_lines), 5)]
    staff_groups.sort(key=lambda group: (group[0].y, group[0].left))
    lines = [line for staff_group in staff_groups for line in staff_group]
    system_line_groups = _group_visible_systems(root, lines, declared_staff_count=staff_count)

    systems = []
    for system_lines in system_line_groups:
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
                "staffCount": len(system_lines) // 5,
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


def _group_visible_systems(root: ET.Element, lines: list[Line], *, declared_staff_count: int) -> list[list[Line]]:
    staff_groups = [lines[index : index + 5] for index in range(0, len(lines), 5)]
    staff_centers = [staff_group[2].y for staff_group in staff_groups]
    bracket_elements = [element for element in root.iter() if element.get("class") == "Bracket"]
    bracket_ranges: list[tuple[float, float]] = []
    for element in bracket_elements:
        if element.tag.endswith("polyline"):
            points = []
            for raw_point in element.get("points", "").split():
                match = POINT_PATTERN.fullmatch(raw_point)
                if match is None:
                    raise ValueError("bracket polyline point is invalid")
                points.append((float(match.group(1)), float(match.group(2))))
            points = _transform_points(points, element.get("transform"))
            if len(points) != 2 or abs(points[0][0] - points[1][0]) > 1e-6:
                continue
        elif element.tag.endswith("path"):
            points = [(float(x), float(y)) for x, y in PATH_POINT_PATTERN.findall(element.get("d", ""))]
            if len(points) < 2:
                continue
            points = _transform_points(points, element.get("transform"))
        else:
            continue
        ys = [y for _, y in points]
        bracket_top, bracket_bottom = min(ys), max(ys)
        covered_staffs = [
            index for index, center in enumerate(staff_centers) if bracket_top <= center <= bracket_bottom
        ]
        if len(covered_staffs) >= 2:
            bracket_ranges.append((bracket_top, bracket_bottom))
    if not bracket_ranges:
        barline_groups = _group_staffs_by_barlines(root, staff_groups)
        if barline_groups is not None:
            return [[line for staff_group in group for line in staff_group] for group in barline_groups]
        if len(staff_groups) % declared_staff_count != 0:
            raise ValueError(f"{len(lines)} staff lines for {declared_staff_count} visible staves per system")
        return [
            lines[index : index + declared_staff_count * 5]
            for index in range(0, len(lines), declared_staff_count * 5)
        ]

    spans = []
    for bracket_top, bracket_bottom in sorted(bracket_ranges):
        covered_staffs = [
            index for index, center in enumerate(staff_centers) if bracket_top <= center <= bracket_bottom
        ]
        span = (covered_staffs[0], covered_staffs[-1], bracket_top, bracket_bottom)
        if not spans or span[:2] != spans[-1][:2]:
            spans.append(span)
    first_leading = [index for index, center in enumerate(staff_centers) if center < spans[0][2]]
    system_starts = [first_leading[0] if first_leading else spans[0][0]]
    positive_gaps = [staff_centers[index + 1] - staff_centers[index] for index in range(len(staff_centers) - 1)]
    median_gap = sorted(positive_gaps)[len(positive_gaps) // 2] if positive_gaps else 0
    previous_span = spans[0]
    for span in spans[1:]:
        leading_staffs = [
            index
            for index, center in enumerate(staff_centers)
            if previous_span[3] < center < span[2]
        ]
        gap_before_span = staff_centers[span[0]] - staff_centers[previous_span[1]]
        exceeds_system_capacity = span[1] - system_starts[-1] + 1 > declared_staff_count
        crosses_large_gap = median_gap > 0 and gap_before_span > median_gap * 1.5
        if leading_staffs:
            system_starts.append(leading_staffs[0])
        elif exceeds_system_capacity or crosses_large_gap:
            system_starts.append(span[0])
        previous_span = span
    if system_starts[0] != 0 or any(
        system_starts[index + 1] <= system_starts[index] for index in range(len(system_starts) - 1)
    ):
        raise ValueError("brace anchors do not define valid visible system topology")
    grouped_staffs = [
        staff_groups[start : system_starts[index + 1] if index + 1 < len(system_starts) else len(staff_groups)]
        for index, start in enumerate(system_starts)
    ]
    split_groups = []
    for group in grouped_staffs:
        while len(group) > declared_staff_count:
            split_groups.append(group[:declared_staff_count])
            group = group[declared_staff_count:]
        if len(group) > 1 and all(abs(staff[2].y - group[0][2].y) <= 1e-6 for staff in group):
            if any(group[index][0].right > group[index + 1][0].left + 1e-6 for index in range(len(group) - 1)):
                raise ValueError("same-row staffs must not overlap horizontally")
            split_groups.extend([[staff] for staff in group])
        elif group:
            split_groups.append(group)
    grouped_staffs = split_groups
    if any(not group or len(group) > declared_staff_count for group in grouped_staffs):
        raise ValueError("brace anchors do not define valid visible system topology")
    return [[line for staff_group in group for line in staff_group] for group in grouped_staffs]


def _group_staffs_by_barlines(root: ET.Element, staff_groups: list[list[Line]]) -> list[list[list[Line]]] | None:
    parent = list(range(len(staff_groups)))
    has_barline = False

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parent[second_root] = first_root

    for element in root.iter():
        if element.get("class") != "BarLine" or not element.tag.endswith("polyline"):
            continue
        raw_points = element.get("points", "").split()
        if len(raw_points) != 2:
            continue
        points = []
        for raw_point in raw_points:
            match = POINT_PATTERN.fullmatch(raw_point)
            if match is None:
                points = []
                break
            points.append((float(match.group(1)), float(match.group(2))))
        if len(points) != 2:
            continue
        points = _transform_points(points, element.get("transform"))
        if abs(points[0][0] - points[1][0]) > 1e-6:
            continue
        has_barline = True
        x = points[0][0]
        top, bottom = sorted([points[0][1], points[1][1]])
        covered = [
            index
            for index, staff in enumerate(staff_groups)
            if staff[0].left <= x <= staff[0].right and top <= staff[2].y <= bottom
        ]
        for index in covered[1:]:
            union(covered[0], index)
    if not has_barline:
        return None
    components: dict[int, list[list[Line]]] = {}
    for index, staff in enumerate(staff_groups):
        components.setdefault(find(index), []).append(staff)
    return sorted(components.values(), key=lambda group: (group[0][0].y, group[0][0].left))


def _transform_points(points: list[tuple[float, float]], transform: str | None) -> list[tuple[float, float]]:
    if transform is None:
        return points
    match = MATRIX_PATTERN.fullmatch(transform)
    if match is None:
        raise ValueError(f"unsupported bracket transform: {transform}")
    a, b, c, d, e, f = (float(match.group(index)) for index in range(1, 7))
    return [(a * x + c * y + e, b * x + d * y + f) for x, y in points]


def _normalized(value: float, extent: float) -> float:
    return round(value / extent, 10)
