#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from evaluate_layout_segmenter import (
    detect_system_centers,
    raw_system_candidate,
    relative_staff_line_ys,
    systems_match_topology,
)


class EvaluateLayoutSegmenterTest(unittest.TestCase):
    def test_detects_ordered_separated_system_centers_deterministically(self) -> None:
        score = np.zeros(300, dtype=np.float32)
        score[58:63] = [0.6, 0.8, 1.0, 0.8, 0.6]
        score[198:203] = [0.6, 0.8, 0.9, 0.8, 0.6]

        first = detect_system_centers(score, gaussian_sigma=2, minimum_distance=80, minimum_score=0.1)

        self.assertEqual(first, [60, 200])
        self.assertEqual(first, detect_system_centers(score, gaussian_sigma=2, minimum_distance=80, minimum_score=0.1))

    def test_candidate_has_three_valid_five_line_staffs(self) -> None:
        candidate = raw_system_candidate(384, confidence=0.8, page_index=2)

        self.assertEqual(candidate["staffCount"], 3)
        self.assertEqual(len(candidate["staffLinePolylines"]), 15)
        self.assertEqual(
            relative_staff_line_ys(3),
            [0.1, 0.13, 0.16, 0.19, 0.22, 0.44, 0.47, 0.5, 0.53, 0.56, 0.78, 0.81, 0.84, 0.87, 0.9],
        )
        self.assertTrue(systems_match_topology([candidate], [{"boundingBox": {"top": 350, "height": 100}}], 768))

    def test_candidate_can_emit_two_staff_topology(self) -> None:
        candidate = raw_system_candidate(384, confidence=0.8, page_index=2, staff_count=2)

        self.assertEqual(candidate["staffCount"], 2)
        self.assertEqual(len(candidate["staffLinePolylines"]), 10)
        self.assertEqual(len(relative_staff_line_ys(2)), 10)
        self.assertTrue(
            systems_match_topology([candidate], [{"boundingBox": {"top": 350, "height": 100}}], 768, [2])
        )

    def test_topology_match_rejects_wrong_count_center_or_staff_count(self) -> None:
        truth = [{"boundingBox": {"top": 300, "height": 120}}]
        candidate = raw_system_candidate(360, confidence=0.8, page_index=0)

        self.assertFalse(systems_match_topology([], truth, 768))
        candidate["staffCount"] = 2
        self.assertFalse(systems_match_topology([candidate], truth, 768))
        candidate = raw_system_candidate(600, confidence=0.8, page_index=0)
        self.assertFalse(systems_match_topology([candidate], truth, 768))


if __name__ == "__main__":
    unittest.main()
