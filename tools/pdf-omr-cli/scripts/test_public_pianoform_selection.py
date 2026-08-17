#!/usr/bin/env python3
"""Validate the checked public benchmark selection contract."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


SELECTION_ROOT = Path(__file__).parents[1] / "corpus" / "public-pianoform-v1"


def load(name: str) -> dict:
    return json.loads((SELECTION_ROOT / name).read_text(encoding="utf-8"))


class PublicPianoformSelectionTest(unittest.TestCase):
    def test_profile_sizes_and_quality_suites_are_frozen(self) -> None:
        contract = load("contract-selection.json")
        olimpic = load("olimpic-selection.json")
        fp = load("fp-grandstaff-selection.json")

        for profile, expected in (
            ("quick-development", (2, 6, 2)),
            ("standard-development", (5, 36, 4)),
            ("standard-holdout", (5, 36, 4)),
        ):
            self.assertEqual(contract["profiles"][profile]["counts"]["items"], expected[0])
            self.assertEqual(olimpic["profiles"][profile]["counts"]["items"], expected[1])
            self.assertEqual(fp["profiles"][profile]["counts"]["items"], expected[2])

        supplement = olimpic["profiles"]["position-supplement-development"]
        self.assertEqual(supplement["counts"]["items"], 10)
        self.assertEqual(supplement["counts"]["systemPositions"], {
            "first": 0,
            "middle": 10,
            "last": 0,
        })

        self.assertEqual(contract["qualityClaim"], "excluded")
        for profile in ("standard-development", "standard-holdout"):
            self.assertEqual(olimpic["profiles"][profile]["counts"]["strata"], {
                "easy": 12,
                "medium": 12,
                "hard": 12,
            })
            self.assertEqual(len(olimpic["profiles"][profile]["repeatItemIds"]), 6)

    def test_development_and_holdout_do_not_share_works(self) -> None:
        olimpic = load("olimpic-selection.json")
        development = {
            item["workId"] for item in olimpic["profiles"]["standard-development"]["items"]
        }
        holdout = {item["workId"] for item in olimpic["profiles"]["standard-holdout"]["items"]}
        self.assertTrue(development.isdisjoint(holdout))

    def test_pinned_public_releases_and_readiness_are_recorded(self) -> None:
        olimpic = load("olimpic-selection.json")
        fp = load("fp-grandstaff-selection.json")

        self.assertEqual(
            olimpic["release"]["archiveSha256"],
            "a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993",
        )
        self.assertEqual(fp["release"]["revision"], "334351427faf94cdb17fecbbab8d83fcf225fa46")
        self.assertEqual(
            fp["release"]["splitArtifactSha256"],
            {
                "val": "c7d6d77dd0e4874c7875c36f02b8c4dd62edbcb4a8e31dc49db4006f3135a1bc",
                "test": "6a16319fd368ce5fa9b99d13817733ed1fe4f7a01565cb4d0bf5f50f829d17ad",
            },
        )
        for selection in (olimpic, fp):
            self.assertEqual(len(selection["groundTruthReadiness"]["auditSha256"]), 64)


if __name__ == "__main__":
    unittest.main()
