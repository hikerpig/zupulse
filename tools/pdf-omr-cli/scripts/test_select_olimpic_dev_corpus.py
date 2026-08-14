#!/usr/bin/env python3
"""Tests for deterministic OLiMPiC development selection."""

from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from select_olimpic_dev_corpus import parse_samples, select_works


class SelectOlimpicDevCorpusTest(unittest.TestCase):
    def test_selects_stratified_works_and_forced_medium_work(self) -> None:
        samples = parse_samples(
            """
            samples/4976604/p1-s1
            samples/4976604/p2-s1
            samples/4945954/p1-s1
            samples/4945954/p2-s1
            samples/4945954/p3-s1
            samples/6007571/p1-s1
            samples/6007571/p2-s1
            samples/6007571/p3-s1
            samples/6007571/p4-s1
            samples/4985990/p1-s1
            samples/4985990/p2-s1
            samples/4985990/p3-s1
            samples/4985990/p4-s1
            samples/4985990/p5-s1
            samples/5862368/p1-s1
            samples/5862368/p2-s1
            samples/5862368/p3-s1
            samples/5862368/p4-s1
            samples/5862368/p5-s1
            samples/5862368/p6-s1
            samples/5862368/p7-s1
            samples/6011095/p1-s1
            samples/6011095/p2-s1
            samples/6011095/p3-s1
            samples/6011095/p4-s1
            samples/6011095/p5-s1
            samples/6011095/p6-s1
            samples/6011095/p7-s1
            samples/6011095/p8-s1
            """
        )

        selected = select_works(samples, force_include="6007571")

        self.assertEqual(
            [work.work_id for work in selected],
            ["4945954", "4976604", "4985990", "6007571", "5862368", "6011095"],
        )
        self.assertEqual([work.stratum for work in selected], ["small", "small", "medium", "medium", "large", "large"])
        self.assertEqual(sum(work.system_count for work in selected), 29)

    def test_rejects_duplicate_sample_paths(self) -> None:
        with self.assertRaisesRegex(ValueError, "duplicate sample"):
            parse_samples("samples/4976604/p1-s1\nsamples/4976604/p1-s1\n")


if __name__ == "__main__":
    unittest.main()
