#!/usr/bin/env python3
"""Tests for the deterministic OpenScore Lieder layout-training source plan."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from plan_openscore_lieder_layout_corpus import build_plan, parse_scores_tsv


SCORES_TSV = """id\tpath\tname\tlink\timslp\tset_id\tlyricist_url
1001\tComposer_A/Set_One/Song_One\tSong One\thttps://example.test/1001\t#1\t10\t
1002\tComposer_A/Set_One/Song_Two\tSong Two\thttps://example.test/1002\t#1\t10\t
2001\tComposer_B/_/Song_Three\tSong Three\thttps://example.test/2001\t#2\t20\t
3001\tComposer_C/Set_Three/Song_Four\tSong Four\thttps://example.test/3001\t#3\t30\t
"""


class PlanOpenScoreLiederLayoutCorpusTest(unittest.TestCase):
    def test_excludes_protected_evaluation_works_and_keeps_composers_in_one_split(self) -> None:
        scores = parse_scores_tsv(SCORES_TSV)

        plan = build_plan(
            scores,
            protected_work_ids={"2001"},
            source_revision="a" * 40,
            scores_tsv_sha256="b" * 64,
            license_sha256="c" * 64,
        )

        self.assertEqual(plan["source"]["scoreCount"], 4)
        self.assertEqual(plan["selection"]["excludedEvaluationWorkIds"], ["2001"])
        self.assertEqual(plan["selection"]["eligibleScoreCount"], 3)
        self.assertEqual(
            plan["source"]["license"]["evidence"],
            "https://github.com/OpenScore/Lieder/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/LICENSE.txt",
        )
        self.assertNotIn("2001", [item["scoreId"] for item in plan["items"]])
        composer_a_splits = {
            item["split"] for item in plan["items"] if item["composerGroup"] == "Composer_A"
        }
        self.assertEqual(len(composer_a_splits), 1)
        self.assertEqual(plan["boundaries"]["realScanEvaluationReplacement"], False)
        self.assertEqual(plan["boundaries"]["renderedArtifactsProduced"], False)
        self.assertEqual(plan["boundaries"]["holdoutRead"], False)

    def test_rejects_duplicate_score_ids(self) -> None:
        duplicate = SCORES_TSV + (
            "1001\tComposer_D/_/Duplicate\tDuplicate\thttps://example.test/duplicate\t#4\t40\t\n"
        )

        with self.assertRaisesRegex(ValueError, "duplicate score id: 1001"):
            parse_scores_tsv(duplicate)

    def test_rejects_paths_that_do_not_have_composer_set_and_song(self) -> None:
        invalid = "id\tpath\tname\tlink\timslp\tset_id\tlyricist_url\n1001\tSong\tSong\turl\t\t\t\n"

        with self.assertRaisesRegex(ValueError, "invalid score path"):
            parse_scores_tsv(invalid)

    def test_uses_the_pinned_tree_path_and_reports_metadata_without_source_files(self) -> None:
        scores = parse_scores_tsv(SCORES_TSV)

        plan = build_plan(
            scores,
            protected_work_ids=set(),
            source_revision="a" * 40,
            scores_tsv_sha256="b" * 64,
            license_sha256="c" * 64,
            available_source_paths={
                "scores/Renamed_Composer/Set_One/Song_One/lc1001.mscx",
                "scores/Composer_A/Set_One/Song_Two/lc1002.mscx",
                "scores/Composer_B/_/Song_Three/lc2001.mscx",
            },
        )

        self.assertEqual(plan["selection"]["missingSourceScoreIds"], ["3001"])
        self.assertEqual(plan["selection"]["eligibleScoreCount"], 3)
        item = next(item for item in plan["items"] if item["scoreId"] == "1001")
        self.assertEqual(item["setGroup"], "Set_One")
        self.assertEqual(
            item["sourcePath"], "scores/Renamed_Composer/Set_One/Song_One/lc1001.mscx"
        )


if __name__ == "__main__":
    unittest.main()
