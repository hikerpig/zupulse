#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from layout_object_targets import build_object_center_targets


def _staff(center_x: float, center_y: float, width: float = 0.3) -> list[list[dict[str, float]]]:
    return [
        [
            {"x": center_x - width / 2, "y": center_y + offset},
            {"x": center_x + width / 2, "y": center_y + offset},
        ]
        for offset in (-0.02, -0.01, 0, 0.01, 0.02)
    ]


class LayoutObjectTargetsTest(unittest.TestCase):
    def test_preserves_side_by_side_system_and_staff_instances(self) -> None:
        annotation = {
            "systems": [
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1},
                    "staffLinePolylines": _staff(0.25, 0.25),
                },
                {
                    "staffCount": 1,
                    "normalizedBBox": {"x": 0.6, "y": 0.2, "width": 0.3, "height": 0.1},
                    "staffLinePolylines": _staff(0.75, 0.25),
                },
            ]
        }

        target = build_object_center_targets(
            annotation,
            size=(101, 101),
            system_sigma=(3, 3),
            staff_sigma=(3, 2),
        )

        self.assertEqual(tuple(target.shape), (4, 101, 101))
        self.assertEqual(np.argwhere(target[0] == 1).tolist(), [[25, 25], [25, 75]])
        self.assertEqual(np.argwhere(target[1] == 1).tolist(), [])
        self.assertEqual(np.argwhere(target[2] == 1).tolist(), [])
        self.assertEqual(np.argwhere(target[3] == 1).tolist(), [[25, 25], [25, 75]])


if __name__ == "__main__":
    unittest.main()
