#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from audit_layout_topology_targets import audit_annotations


def _staff(center: float) -> list[list[dict[str, float]]]:
    return [
        [{"x": 0.1, "y": center + offset}, {"x": 0.9, "y": center + offset}]
        for offset in (-0.02, -0.01, 0, 0.01, 0.02)
    ]


class AuditLayoutTopologyTargetsTest(unittest.TestCase):
    def test_reports_exact_sparse_energy_targets_and_incompatible_pages(self) -> None:
        valid = {
            "systems": [
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1},
                    "staffLinePolylines": _staff(0.25),
                },
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.1, "y": 0.6, "width": 0.8, "height": 0.1},
                    "staffLinePolylines": _staff(0.65),
                },
            ]
        }
        invalid = {
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

        result = audit_annotations(
            [("valid", 0, valid), ("invalid", 1, invalid)],
            height=101,
            system_sigma=3,
            staff_sigma=2,
        )

        self.assertEqual(result["pageCount"], 2)
        self.assertEqual(result["centerEnergyCompatiblePageCount"], 1)
        self.assertEqual(result["centerEnergySystemComponentExactPageCount"], 1)
        self.assertEqual(result["centerEnergyStaffComponentExactPageCount"], 1)
        self.assertLess(result["centerEnergySystemActiveRowCount"], result["filledBandActiveRowCount"])
        self.assertEqual(result["incompatiblePages"][0]["scoreId"], "invalid")


if __name__ == "__main__":
    unittest.main()
