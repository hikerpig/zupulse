#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from plan_staff_line_training_slice import build_slice


def _page(index: int, staff_counts: list[int]) -> dict[str, object]:
    variant = {"imagePath": f"image-{index}.png", "maskPath": f"mask-{index}.png"}
    return {
        "pageIndex": index,
        "eligibleForTraining": True,
        "staffCounts": staff_counts,
        "canonical": variant,
        "augmented": variant,
    }


class PlanStaffLineTrainingSliceTest(unittest.TestCase):
    def test_retains_all_rare_pages_then_hash_fills_common_pages(self) -> None:
        manifest = {
            "datasetId": "dataset",
            "items": [
                {"scoreId": "train", "split": "train", "pages": [_page(0, [3]), _page(1, [2]), _page(2, [1, 3])]},
                {"scoreId": "validation", "split": "validation", "pages": [_page(0, [3]), _page(1, [2])]},
            ],
        }

        result = build_slice(manifest, train_limit=3, validation_limit=2)

        self.assertEqual({page["pageIndex"] for page in result["train"][:2]}, {1, 2})
        self.assertEqual(result["validation"][0]["pageIndex"], 1)
        self.assertEqual(len(result["train"]), 3)
        self.assertEqual(len(result["validation"]), 2)

    def test_fails_when_limit_would_drop_a_rare_page(self) -> None:
        manifest = {
            "datasetId": "dataset",
            "items": [
                {"scoreId": "train", "split": "train", "pages": [_page(0, [1]), _page(1, [2])]},
                {"scoreId": "validation", "split": "validation", "pages": [_page(0, [3])]},
            ],
        }

        with self.assertRaisesRegex(ValueError, "cannot retain all 2 rare-topology pages"):
            build_slice(manifest, train_limit=1, validation_limit=1)


if __name__ == "__main__":
    unittest.main()
