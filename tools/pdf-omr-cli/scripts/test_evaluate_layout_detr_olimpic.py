#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from evaluate_layout_detr_olimpic import (
    classify_olimpic_failure,
    detr_predictions_to_system_candidates,
    olimpic_detr_annotation,
    systems_match_centers,
)
from evaluate_layout_segmenter import systems_match_topology
from layout_detr_metrics import evaluate_page


def _truth_page() -> dict[str, object]:
    return {
        "width": 1000,
        "height": 2000,
        "systems": [
            {"boundingBox": {"left": 100, "top": 200, "width": 800, "height": 300}},
            {"boundingBox": {"left": 100, "top": 1200, "width": 800, "height": 400}},
        ],
    }


class EvaluateLayoutDetrOlimpicTest(unittest.TestCase):
    def test_converts_olimpic_pixel_boxes_to_normalized_detr_annotation(self) -> None:
        annotation = olimpic_detr_annotation(_truth_page(), [3, 3])

        self.assertEqual(annotation["systems"][0]["staffCount"], 3)
        self.assertAlmostEqual(annotation["systems"][0]["normalizedBBox"]["y"], 0.1)
        self.assertAlmostEqual(annotation["systems"][0]["normalizedBBox"]["height"], 0.15)
        self.assertAlmostEqual(annotation["systems"][1]["normalizedBBox"]["y"], 0.6)

    def test_rejects_staff_count_outside_one_to_three(self) -> None:
        with self.assertRaisesRegex(ValueError, "staffCount"):
            olimpic_detr_annotation(_truth_page(), [3, 4])

    def test_olimpic_topology_uses_predicted_class_not_a_fixed_staff_count(self) -> None:
        truth = _truth_page()
        three_staff = detr_predictions_to_system_candidates(
            [
                {"centerX": 0.5, "centerY": 0.175, "width": 0.8, "height": 0.12, "label": 2, "score": 0.9},
                {"centerX": 0.5, "centerY": 0.7, "width": 0.8, "height": 0.16, "label": 2, "score": 0.8},
            ],
            page_index=0,
        )
        two_staff = detr_predictions_to_system_candidates(
            [
                {"centerX": 0.5, "centerY": 0.175, "width": 0.8, "height": 0.12, "label": 1, "score": 0.9},
                {"centerX": 0.5, "centerY": 0.7, "width": 0.8, "height": 0.16, "label": 1, "score": 0.8},
            ],
            page_index=0,
        )

        self.assertTrue(systems_match_topology(three_staff, truth["systems"], 2000, [3, 3]))
        self.assertFalse(systems_match_topology(two_staff, truth["systems"], 2000, [3, 3]))
        self.assertTrue(systems_match_centers(two_staff, truth["systems"], 2000))
        self.assertEqual(classify_olimpic_failure(two_staff, truth["systems"], 2000, [3, 3]), "class-mismatch")

    def test_distinguishes_count_and_center_failures(self) -> None:
        truth = _truth_page()
        extra = detr_predictions_to_system_candidates(
            [
                {"centerX": 0.5, "centerY": 0.175, "width": 0.8, "height": 0.12, "label": 2, "score": 0.9},
                {"centerX": 0.5, "centerY": 0.7, "width": 0.8, "height": 0.16, "label": 2, "score": 0.8},
                {"centerX": 0.5, "centerY": 0.95, "width": 0.8, "height": 0.08, "label": 2, "score": 0.7},
            ],
            page_index=1,
        )
        shifted = detr_predictions_to_system_candidates(
            [
                {"centerX": 0.5, "centerY": 0.4, "width": 0.8, "height": 0.12, "label": 2, "score": 0.9},
                {"centerX": 0.5, "centerY": 0.7, "width": 0.8, "height": 0.16, "label": 2, "score": 0.8},
            ],
            page_index=1,
        )

        self.assertEqual(classify_olimpic_failure(extra, truth["systems"], 2000, [3, 3]), "count-mismatch")
        self.assertEqual(classify_olimpic_failure(shifted, truth["systems"], 2000, [3, 3]), "center-out-of-band")

    def test_detr_box_metric_requires_horizontal_containment(self) -> None:
        annotation = olimpic_detr_annotation(_truth_page(), [3, 3])
        in_band_but_outside_x = [
            {"centerX": 0.02, "centerY": 0.175, "width": 0.02, "height": 0.12, "label": 2, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.7, "width": 0.8, "height": 0.16, "label": 2, "score": 0.8},
        ]
        candidates = detr_predictions_to_system_candidates(in_band_but_outside_x, page_index=0)

        self.assertTrue(systems_match_topology(candidates, _truth_page()["systems"], 2000, [3, 3]))
        self.assertFalse(evaluate_page(in_band_but_outside_x, annotation)["topologyExact"])


if __name__ == "__main__":
    unittest.main()
