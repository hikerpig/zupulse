#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from plan_layout_topology_training_slice import build_slice


def _page(index: int, staff_counts: list[int]) -> dict[str, object]:
    return {
        "pageIndex": index,
        "eligibleForTraining": True,
        "staffCounts": staff_counts,
        "canonical": {
            "imagePath": f"canonical-{index}.png",
            "maskPath": f"canonical-{index}.mask.png",
        },
        "augmented": {
            "imagePath": f"augmented-{index}.png",
            "maskPath": f"augmented-{index}.mask.png",
        },
    }


class PlanLayoutTopologyTrainingSliceTest(unittest.TestCase):
    def test_moves_complete_composer_groups_and_uses_split_appropriate_variants(self) -> None:
        manifest = {
            "datasetId": "dataset",
            "items": [
                {"scoreId": "v", "split": "validation", "pages": [_page(0, [2, 3])]},
                {"scoreId": "a1", "split": "train", "pages": [_page(0, [1, 1, 3])]},
                {"scoreId": "a2", "split": "train", "pages": [_page(0, [1, 2, 3])]},
                {"scoreId": "t", "split": "train", "pages": [_page(0, [1, 2, 3])]},
            ],
        }
        source_plan = {
            "selection": {"excludedEvaluationWorkIds": ["999"]},
            "items": [
                {"scoreId": "v", "composerGroup": "validation"},
                {"scoreId": "a1", "composerGroup": "added"},
                {"scoreId": "a2", "composerGroup": "added"},
                {"scoreId": "t", "composerGroup": "train"},
            ],
        }

        result = build_slice(
            manifest,
            source_plan,
            train_limit=2,
            validation_limit=3,
            minimum_train_systems_per_staff_count=1,
            minimum_validation_systems_per_staff_count=1,
        )

        self.assertEqual(result["selection"]["additionalValidationComposerGroups"], ["train"])
        self.assertEqual(result["selection"]["composerGroupOverlap"], [])
        self.assertEqual({page["scoreId"] for page in result["validation"]}, {"v", "t"})
        self.assertTrue(all(page["imagePath"].startswith("canonical-") for page in result["validation"]))
        self.assertEqual({page["scoreId"] for page in result["train"]}, {"a1", "a2"})
        self.assertTrue(all(page["imagePath"].startswith("augmented-") for page in result["train"]))
        self.assertEqual(result["selection"]["protectedEvaluationWorkIdOverlap"], [])

    def test_fails_when_group_isolation_cannot_preserve_training_evidence(self) -> None:
        manifest = {
            "datasetId": "dataset",
            "items": [
                {"scoreId": "v", "split": "validation", "pages": [_page(0, [2, 3])]},
                {"scoreId": "only", "split": "train", "pages": [_page(0, [1, 1, 3])]},
            ],
        }
        source_plan = {
            "selection": {"excludedEvaluationWorkIds": []},
            "items": [
                {"scoreId": "v", "composerGroup": "validation"},
                {"scoreId": "only", "composerGroup": "only-rare"},
            ],
        }

        with self.assertRaisesRegex(ValueError, "cannot satisfy validation topology minimums"):
            build_slice(
                manifest,
                source_plan,
                train_limit=1,
                validation_limit=2,
                minimum_train_systems_per_staff_count=1,
                minimum_validation_systems_per_staff_count=1,
            )


if __name__ == "__main__":
    unittest.main()
