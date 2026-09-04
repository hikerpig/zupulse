#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from evaluate_staff_line_detector import raw_system_candidate, systems_match_truth
from staff_line_reconstruction import StaffEvidence, SystemEvidence


class EvaluateStaffLineDetectorTest(unittest.TestCase):
    def test_matches_ordered_system_centers_inside_truth_boxes(self) -> None:
        predicted = [{"normalizedBBox": {"y": 0.1, "height": 0.1}}, {"normalizedBBox": {"y": 0.5, "height": 0.1}}]
        truth = [
            {"boundingBox": {"top": 80, "height": 100}},
            {"boundingBox": {"top": 480, "height": 140}},
        ]

        self.assertTrue(systems_match_truth(predicted, truth, truth_page_height=1000))

    def test_rejects_count_or_ordered_center_mismatch(self) -> None:
        truth = [{"boundingBox": {"top": 100, "height": 100}}]

        self.assertFalse(systems_match_truth([], truth, truth_page_height=1000))
        self.assertFalse(
            systems_match_truth([{"normalizedBBox": {"y": 0.4, "height": 0.1}}], truth, truth_page_height=1000)
        )

    def test_candidate_bbox_contains_rounded_first_and_last_staff_lines(self) -> None:
        staff = StaffEvidence((238, 242, 246, 250, 254), 4, 0.9)

        candidate = raw_system_candidate(SystemEvidence((staff,), 238, 254, 0), page_index=0)

        bbox = candidate["normalizedBBox"]
        line_ys = [line[0]["y"] for line in candidate["staffLinePolylines"]]
        self.assertGreaterEqual(min(line_ys), bbox["y"])
        self.assertLessEqual(max(line_ys), bbox["y"] + bbox["height"])


if __name__ == "__main__":
    unittest.main()
