#!/usr/bin/env python3
"""Deterministic row-center targets for compact music layout experiments."""

from __future__ import annotations

import numpy as np


def _row(normalized_y: float, height: int) -> int:
    if not 0 <= normalized_y <= 1:
        raise ValueError("normalized center is outside the page")
    return round(normalized_y * (height - 1))


def _energy(centers: list[int], height: int, sigma: int) -> np.ndarray:
    rows = np.arange(height, dtype=np.float32)
    result = np.zeros(height, dtype=np.float32)
    for center in centers:
        result = np.maximum(result, np.exp(-((rows - center) ** 2) / (2 * sigma**2)))
    return result


def build_center_energy_targets(
    annotation: dict[str, object],
    *,
    height: int,
    system_sigma: int,
    staff_sigma: int,
) -> dict[str, object]:
    if min(height, system_sigma, staff_sigma) < 1:
        raise ValueError("target height and sigmas must be positive")
    system_centers = []
    staff_centers = []
    for system in annotation["systems"]:
        bbox = system["normalizedBBox"]
        system_centers.append(_row(bbox["y"] + bbox["height"] / 2, height))
        lines = system["staffLinePolylines"]
        if len(lines) != system["staffCount"] * 5:
            raise ValueError("staff-line topology does not match staffCount")
        for index in range(0, len(lines), 5):
            middle_line = lines[index + 2]
            staff_centers.append(_row(sum(point["y"] for point in middle_line) / len(middle_line), height))
    if any(second <= first for first, second in zip(system_centers, system_centers[1:])) or any(
        second <= first for first, second in zip(staff_centers, staff_centers[1:])
    ):
        raise ValueError("layout centers must have strict row order")
    return {
        "systemCenters": system_centers,
        "staffCenters": staff_centers,
        "systemEnergy": _energy(system_centers, height, system_sigma),
        "staffEnergy": _energy(staff_centers, height, staff_sigma),
    }
