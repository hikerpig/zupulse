#!/usr/bin/env python3
"""Deterministic two-dimensional center targets for music layout objects."""

from __future__ import annotations

import numpy as np


def _coordinate(normalized: float, extent: int) -> int:
    if not 0 <= normalized <= 1:
        raise ValueError("normalized object center is outside the page")
    return round(normalized * (extent - 1))


def _add_gaussian(target: np.ndarray, center_x: int, center_y: int, sigma_x: int, sigma_y: int) -> None:
    radius_x = sigma_x * 4
    radius_y = sigma_y * 4
    left = max(0, center_x - radius_x)
    right = min(target.shape[1] - 1, center_x + radius_x)
    top = max(0, center_y - radius_y)
    bottom = min(target.shape[0] - 1, center_y + radius_y)
    x = np.arange(left, right + 1, dtype=np.float32) - center_x
    y = np.arange(top, bottom + 1, dtype=np.float32) - center_y
    gaussian = np.exp(-(x[None] ** 2 / (2 * sigma_x**2) + y[:, None] ** 2 / (2 * sigma_y**2)))
    target[top : bottom + 1, left : right + 1] = np.maximum(
        target[top : bottom + 1, left : right + 1], gaussian
    )


def build_object_center_targets(
    annotation: dict[str, object],
    *,
    size: tuple[int, int],
    system_sigma: tuple[int, int],
    staff_sigma: tuple[int, int],
) -> np.ndarray:
    width, height = size
    if min(width, height, *system_sigma, *staff_sigma) < 1:
        raise ValueError("target size and sigmas must be positive")
    target = np.zeros((4, height, width), dtype=np.float32)
    for system in annotation["systems"]:
        staff_count = system["staffCount"]
        if staff_count not in (1, 2, 3):
            raise ValueError("staffCount must be between one and three")
        bbox = system["normalizedBBox"]
        center_x = _coordinate(bbox["x"] + bbox["width"] / 2, width)
        center_y = _coordinate(bbox["y"] + bbox["height"] / 2, height)
        _add_gaussian(target[staff_count - 1], center_x, center_y, *system_sigma)
        lines = system["staffLinePolylines"]
        if len(lines) != staff_count * 5:
            raise ValueError("staff-line topology does not match staffCount")
        for index in range(0, len(lines), 5):
            middle_line = lines[index + 2]
            staff_x = _coordinate(sum(point["x"] for point in middle_line) / len(middle_line), width)
            staff_y = _coordinate(sum(point["y"] for point in middle_line) / len(middle_line), height)
            _add_gaussian(target[3], staff_x, staff_y, *staff_sigma)
    return target
