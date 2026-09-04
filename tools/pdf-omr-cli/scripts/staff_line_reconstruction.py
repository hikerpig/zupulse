#!/usr/bin/env python3
"""Deterministic reconstruction of complete five-line staffs from model evidence."""

from __future__ import annotations

import bisect
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class RowPeak:
    y: int
    confidence: float


@dataclass(frozen=True)
class StaffEvidence:
    lines: tuple[int, int, int, int, int]
    spacing: int
    confidence: float


@dataclass(frozen=True)
class SystemEvidence:
    staffs: tuple[StaffEvidence, ...]
    top: int
    bottom: int
    connector_coverage: float


def extract_row_peaks(
    probability: np.ndarray, *, probability_threshold: float = 0.9, coverage_threshold: float = 0.3
) -> list[RowPeak]:
    if probability.ndim != 2:
        raise ValueError("staff-line probability must be a two-dimensional array")
    coverage = np.mean(probability >= probability_threshold, axis=1)
    candidate_rows = np.flatnonzero(coverage >= coverage_threshold)
    groups = np.split(candidate_rows, np.where(np.diff(candidate_rows) > 1)[0] + 1)
    result = []
    for group in groups:
        if len(group) == 0:
            continue
        y = int(group[np.argmax(coverage[group])])
        result.append(RowPeak(y, float(coverage[y])))
    return result


def select_complete_staffs(
    raw_peaks: list[RowPeak] | list[tuple[int, float]],
    *,
    minimum_spacing: int = 3,
    maximum_spacing: int = 7,
    tolerance: int = 2,
) -> list[StaffEvidence]:
    peaks = [peak if isinstance(peak, RowPeak) else RowPeak(*peak) for peak in raw_peaks]
    peaks.sort(key=lambda peak: peak.y)
    candidates: dict[tuple[int, ...], tuple[int, int, float, StaffEvidence]] = {}
    for anchor in peaks:
        for spacing in range(minimum_spacing, maximum_spacing + 1):
            for anchor_slot in range(5):
                expected = [anchor.y + (slot - anchor_slot) * spacing for slot in range(5)]
                matches: list[RowPeak] = []
                used: set[int] = set()
                residual = 0
                for target in expected:
                    choices = sorted(
                        (abs(peak.y - target), -peak.confidence, index, peak)
                        for index, peak in enumerate(peaks)
                        if index not in used and abs(peak.y - target) <= tolerance
                    )
                    if not choices:
                        break
                    distance, _, index, peak = choices[0]
                    used.add(index)
                    residual += distance
                    matches.append(peak)
                if len(matches) != 5:
                    continue
                lines = tuple(peak.y for peak in matches)
                if len(set(lines)) != 5:
                    continue
                confidence = sum(peak.confidence for peak in matches) / 5
                evidence = StaffEvidence(lines, spacing, confidence)
                score = 5000 + confidence * 100 - residual
                current = candidates.get(lines)
                candidate = (lines[0], lines[-1], score, evidence)
                if current is None or candidate[2] > current[2]:
                    candidates[lines] = candidate

    ordered = sorted(candidates.values(), key=lambda candidate: (candidate[1], candidate[0], candidate[3].lines))
    ends = [candidate[1] for candidate in ordered]
    best: list[tuple[float, tuple[StaffEvidence, ...]]] = [(0, ())]
    for index, candidate in enumerate(ordered, 1):
        prior = bisect.bisect_left(ends, candidate[0], 0, index - 1)
        take = (best[prior][0] + candidate[2], best[prior][1] + (candidate[3],))
        skip = best[index - 1]
        best.append(take if (take[0], tuple(staff.lines for staff in take[1])) > (skip[0], tuple(staff.lines for staff in skip[1])) else skip)
    return sorted(best[-1][1], key=lambda staff: staff.lines[0])


def group_staffs_by_connectors(
    image: np.ndarray,
    staffs: list[StaffEvidence],
    *,
    minimum_connector_coverage: float = 0.85,
    maximum_staff_count: int = 3,
) -> list[SystemEvidence]:
    if image.ndim != 2:
        raise ValueError("connector image must be grayscale")
    if maximum_staff_count < 1:
        raise ValueError("maximum staff count must be positive")
    ordered = sorted(staffs, key=lambda staff: staff.lines[0])
    dark = image <= _otsu_threshold(image)
    best: list[tuple[float, tuple[SystemEvidence, ...]] | None] = [None] * (len(ordered) + 1)
    best[-1] = (0, ())
    for index in range(len(ordered) - 1, -1, -1):
        single = SystemEvidence((ordered[index],), ordered[index].lines[0], ordered[index].lines[-1], 0)
        suffix = best[index + 1]
        assert suffix is not None
        choices = [(suffix[0], (single,) + suffix[1])]
        for staff_count in range(2, maximum_staff_count + 1):
            if index + staff_count > len(ordered):
                break
            selected = tuple(ordered[index : index + staff_count])
            top = selected[0].lines[0]
            bottom = selected[-1].lines[-1]
            coverage = float(np.max(np.mean(dark[top : bottom + 1], axis=0)))
            if coverage < minimum_connector_coverage:
                continue
            suffix = best[index + staff_count]
            assert suffix is not None
            system = SystemEvidence(selected, top, bottom, coverage)
            choices.append(((staff_count - 1) * 1000 + coverage + suffix[0], (system,) + suffix[1]))
        best[index] = max(
            choices,
            key=lambda choice: (
                choice[0],
                tuple((-len(system.staffs), system.top) for system in choice[1]),
            ),
        )
    result = best[0]
    assert result is not None
    return list(result[1])


def _otsu_threshold(image: np.ndarray) -> int:
    histogram = np.bincount(image.ravel(), minlength=256)
    total = image.size
    weighted_total = int(np.dot(np.arange(256), histogram))
    background_weight = 0
    background_sum = 0
    maximum_variance = -1.0
    threshold = 0
    for value, count in enumerate(histogram):
        background_weight += int(count)
        if background_weight == 0:
            continue
        foreground_weight = total - background_weight
        if foreground_weight == 0:
            break
        background_sum += value * int(count)
        background_mean = background_sum / background_weight
        foreground_mean = (weighted_total - background_sum) / foreground_weight
        variance = background_weight * foreground_weight * (background_mean - foreground_mean) ** 2
        if variance > maximum_variance:
            maximum_variance = variance
            threshold = value
    return threshold
