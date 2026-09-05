#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from evaluate_layout_segmenter import raw_system_candidate
from evaluate_piano_layout import classify_failure


class EvaluatePianoLayoutTest(unittest.TestCase):
    def test_classifies_count_mismatch_for_two_staff_pages(self) -> None:
        truth = [{"boundingBox": {"top": 100, "height": 80}}, {"boundingBox": {"top": 300, "height": 80}}]
        predicted = [raw_system_candidate(140, confidence=0.9, page_index=0, staff_count=2)]

        self.assertEqual(classify_failure(predicted, truth, 768, [2, 2]), "count-mismatch")

    def test_accepts_two_staff_centers_inside_truth_bands(self) -> None:
        truth = [{"boundingBox": {"top": 300, "height": 120}}]
        predicted = [raw_system_candidate(384, confidence=0.9, page_index=0, staff_count=2)]

        self.assertIsNone(classify_failure(predicted, truth, 768, [2]))


if __name__ == "__main__":
    unittest.main()
