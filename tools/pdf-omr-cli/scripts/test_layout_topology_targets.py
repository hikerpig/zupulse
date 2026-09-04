#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from layout_topology_targets import build_center_energy_targets


def _staff(center: float) -> list[list[dict[str, float]]]:
    return [
        [{"x": 0.1, "y": center + offset}, {"x": 0.9, "y": center + offset}]
        for offset in (-0.02, -0.01, 0, 0.01, 0.02)
    ]


class LayoutTopologyTargetsTest(unittest.TestCase):
    def test_builds_separate_deterministic_system_and_staff_energy_peaks(self) -> None:
        annotation = {
            "systems": [
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1},
                    "staffLinePolylines": _staff(0.25),
                },
                {
                    "staffCount": 2,
                    "normalizedBBox": {"x": 0.1, "y": 0.6, "width": 0.8, "height": 0.2},
                    "staffLinePolylines": _staff(0.65) + _staff(0.75),
                },
            ]
        }

        first = build_center_energy_targets(annotation, height=101, system_sigma=3, staff_sigma=2)
        second = build_center_energy_targets(annotation, height=101, system_sigma=3, staff_sigma=2)

        self.assertEqual(first["systemCenters"], [25, 70])
        self.assertEqual(first["staffCenters"], [25, 65, 75])
        self.assertEqual(np.flatnonzero(first["systemEnergy"] == 1).tolist(), [25, 70])
        self.assertEqual(tuple(first["systemEnergyByStaffCount"].shape), (3, 101))
        self.assertEqual(np.flatnonzero(first["systemEnergyByStaffCount"][0] == 1).tolist(), [25])
        self.assertEqual(np.flatnonzero(first["systemEnergyByStaffCount"][1] == 1).tolist(), [70])
        self.assertEqual(np.flatnonzero(first["systemEnergyByStaffCount"][2] == 1).tolist(), [])
        self.assertEqual(np.flatnonzero(first["staffEnergy"] == 1).tolist(), [25, 65, 75])
        np.testing.assert_array_equal(first["systemEnergy"], second["systemEnergy"])
        np.testing.assert_array_equal(first["staffEnergy"], second["staffEnergy"])

    def test_rejects_staff_count_and_polyline_mismatch(self) -> None:
        annotation = {
            "systems": [
                {
                    "staffCount": 2,
                    "normalizedBBox": {"x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1},
                    "staffLinePolylines": _staff(0.25),
                }
            ]
        }

        with self.assertRaisesRegex(ValueError, "staff-line topology does not match staffCount"):
            build_center_energy_targets(annotation, height=101, system_sigma=3, staff_sigma=2)

    def test_rejects_centers_that_cannot_be_represented_in_strict_row_order(self) -> None:
        annotation = {
            "systems": [
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1},
                    "staffLinePolylines": _staff(0.25),
                },
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.6, "y": 0.2, "width": 0.3, "height": 0.1},
                    "staffLinePolylines": _staff(0.25),
                },
            ]
        }

        with self.assertRaisesRegex(ValueError, "strict row order"):
            build_center_energy_targets(annotation, height=101, system_sigma=3, staff_sigma=2)


if __name__ == "__main__":
    unittest.main()
