#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from layout_detr_metrics import (
    decode_predictions,
    evaluate_ola_page,
    evaluate_page,
    summarize_ola_pages,
    summarize_pages,
)


def _system(*, x: float, y: float, width: float, height: float, staff_count: int) -> dict[str, object]:
    return {
        "staffCount": staff_count,
        "normalizedBBox": {"x": x, "y": y, "width": width, "height": height},
    }


def _ola_system(*, x: float, y: float, width: float, height: float, staff_ys: list[float]) -> dict[str, object]:
    system = _system(x=x, y=y, width=width, height=height, staff_count=len(staff_ys))
    system["staffLinePolylines"] = [
        [{"x": x, "y": staff_y + offset}, {"x": x + width, "y": staff_y + offset}]
        for staff_y in staff_ys
        for offset in (0.0, 0.01, 0.02, 0.03, 0.04)
    ]
    return system


class LayoutDetrMetricsTest(unittest.TestCase):
    def test_decodes_two_class_ola_sigmoid_logits(self) -> None:
        logits = np.array([[2.0, -2.0], [-2.0, 2.0]], dtype=np.float32)
        boxes = np.array([[0.5, 0.2, 0.8, 0.1], [0.5, 0.7, 0.8, 0.05]], dtype=np.float32)

        predictions = decode_predictions(logits, boxes, threshold=0.5, activation="sigmoid", class_count=2)

        self.assertEqual([item["label"] for item in predictions], [0, 1])

    def test_ola_assembles_staff_counts_from_containment(self) -> None:
        truth = {
            "systems": [
                _ola_system(x=0.1, y=0.1, width=0.8, height=0.15, staff_ys=[0.15]),
                _ola_system(x=0.1, y=0.5, width=0.8, height=0.3, staff_ys=[0.55, 0.7]),
            ]
        }
        predictions = [
            {"centerX": 0.5, "centerY": 0.18, "width": 0.8, "height": 0.15, "label": 0, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.17, "width": 0.8, "height": 0.04, "label": 1, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.65, "width": 0.8, "height": 0.3, "label": 0, "score": 0.8},
            {"centerX": 0.5, "centerY": 0.57, "width": 0.8, "height": 0.04, "label": 1, "score": 0.8},
            {"centerX": 0.5, "centerY": 0.72, "width": 0.8, "height": 0.04, "label": 1, "score": 0.7},
        ]

        result = evaluate_ola_page(predictions, truth)
        summary = summarize_ola_pages([result])

        self.assertTrue(result["topologyExact"])
        self.assertEqual(result["truthByClass"], [1, 1, 0])
        self.assertEqual(result["predictedByClass"], [1, 1, 0])
        self.assertEqual(result["matchedByClass"], [1, 1, 0])
        self.assertEqual(summary["systemObjectExact"], 1.0)
        self.assertEqual(summary["staffObjectExact"], 1.0)
        self.assertEqual(summary["macroClassExact"], 1.0)

    def test_ola_penalizes_extra_staff_and_wrong_derived_count(self) -> None:
        truth = {"systems": [_ola_system(x=0.1, y=0.1, width=0.8, height=0.2, staff_ys=[0.15])]}
        predictions = [
            {"centerX": 0.5, "centerY": 0.2, "width": 0.8, "height": 0.2, "label": 0, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.17, "width": 0.8, "height": 0.04, "label": 1, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.23, "width": 0.8, "height": 0.04, "label": 1, "score": 0.8},
        ]

        summary = summarize_ola_pages([evaluate_ola_page(predictions, truth)])

        self.assertEqual(summary["topologyExactPages"], 0)
        self.assertEqual(summary["classExact"], [0.0, 0.0, 1.0])
        self.assertEqual(summary["staffObjectExact"], 0.5)

    def test_decodes_foreground_queries_and_sorts_reading_order(self) -> None:
        logits = np.array(
            [
                [0.0, 0.0, 5.0, -2.0],
                [5.0, 0.0, 0.0, -2.0],
                [0.0, 0.0, 0.0, 5.0],
            ],
            dtype=np.float32,
        )
        boxes = np.array(
            [
                [0.5, 0.7, 0.8, 0.1],
                [0.5, 0.2, 0.8, 0.1],
                [0.5, 0.5, 0.8, 0.1],
            ],
            dtype=np.float32,
        )

        predictions = decode_predictions(logits, boxes, threshold=0.5, activation="softmax")

        self.assertEqual([item["label"] for item in predictions], [0, 2])
        self.assertAlmostEqual(predictions[0]["centerY"], 0.2, places=6)
        self.assertAlmostEqual(predictions[1]["centerY"], 0.7, places=6)

    def test_requires_localization_and_class_and_penalizes_false_positives(self) -> None:
        truth = {
            "systems": [
                _system(x=0.1, y=0.1, width=0.8, height=0.2, staff_count=1),
                _system(x=0.1, y=0.5, width=0.8, height=0.2, staff_count=2),
            ]
        }
        predictions = [
            {"centerX": 0.5, "centerY": 0.2, "label": 0, "score": 0.9},
            {"centerX": 0.5, "centerY": 0.6, "label": 1, "score": 0.8},
            {"centerX": 0.5, "centerY": 0.9, "label": 1, "score": 0.7},
        ]

        result = evaluate_page(predictions, truth)

        self.assertFalse(result["topologyExact"])
        self.assertEqual(result["truthByClass"], [1, 1, 0])
        self.assertEqual(result["predictedByClass"], [1, 2, 0])
        self.assertEqual(result["matchedByClass"], [1, 1, 0])

    def test_rejects_mismatched_query_shapes(self) -> None:
        with self.assertRaisesRegex(ValueError, "query counts must match"):
            decode_predictions(np.zeros((2, 4)), np.zeros((1, 4)), threshold=0.5, activation="softmax")

    def test_decodes_deformable_detr_sigmoid_logits_at_same_threshold(self) -> None:
        logits = np.array([[0.0, -2.0, -3.0], [-2.0, 2.0, -3.0]], dtype=np.float32)
        boxes = np.array([[0.5, 0.2, 0.8, 0.1], [0.5, 0.7, 0.8, 0.1]], dtype=np.float32)

        predictions = decode_predictions(logits, boxes, threshold=0.5, activation="sigmoid")

        self.assertEqual([item["label"] for item in predictions], [0, 1])
        self.assertAlmostEqual(predictions[0]["score"], 0.5, places=6)

    def test_summarizes_class_exact_with_false_positive_denominator(self) -> None:
        summary = summarize_pages(
            [
                {
                    "topologyExact": True,
                    "truthByClass": [1, 2, 0],
                    "predictedByClass": [1, 2, 0],
                    "matchedByClass": [1, 2, 0],
                },
                {
                    "topologyExact": False,
                    "truthByClass": [1, 0, 1],
                    "predictedByClass": [2, 0, 1],
                    "matchedByClass": [1, 0, 1],
                },
            ]
        )

        self.assertEqual(summary["topologyExactPages"], 1)
        self.assertEqual(summary["pageCount"], 2)
        self.assertEqual(summary["classExact"], [2 / 3, 1.0, 1.0])
        self.assertAlmostEqual(summary["macroClassExact"], 8 / 9)


if __name__ == "__main__":
    unittest.main()
