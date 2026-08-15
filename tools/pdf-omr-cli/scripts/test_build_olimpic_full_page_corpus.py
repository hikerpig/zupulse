#!/usr/bin/env python3
"""Tests for full-page OLiMPiC source mapping."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_olimpic_full_page_corpus import build_page_mapping


class BuildOlimpicFullPageCorpusTest(unittest.TestCase):
    def test_maps_ordered_sample_systems_to_source_pages_and_boxes(self) -> None:
        mapping = {
            "42/p2-s1": {"imslpDocument": "#9", "imslpPage": 11, "imslpSystem": 1},
            "42/p1-s1": {"imslpDocument": "#9", "imslpPage": 10, "imslpSystem": 1},
            "42/p1-s2": {"imslpDocument": "#9", "imslpPage": 10, "imslpSystem": 2},
        }
        annotations = {
            10: {
                "width": 100,
                "height": 200,
                "systems": [
                    {"boundingBox": {"left": 1, "top": 2, "width": 90, "height": 10}},
                    {"boundingBox": {"left": 1, "top": 20, "width": 90, "height": 10}},
                ],
            },
            11: {
                "width": 100,
                "height": 200,
                "systems": [{"boundingBox": {"left": 1, "top": 2, "width": 90, "height": 10}}],
            },
        }

        pages = build_page_mapping("42", mapping, annotations)

        self.assertEqual([page.source_page for page in pages], [10, 11])
        self.assertEqual([len(page.systems) for page in pages], [2, 1])
        self.assertEqual(pages[0].systems[1].sample_variant, "p1-s2")
        self.assertEqual(pages[1].systems[0].bounding_box["width"], 90)

    def test_rejects_missing_annotation_and_non_contiguous_pages(self) -> None:
        mapping = {
            "42/p1-s1": {"imslpDocument": "#9", "imslpPage": 10, "imslpSystem": 1},
            "42/p2-s1": {"imslpDocument": "#9", "imslpPage": 12, "imslpSystem": 1},
        }
        annotations = {
            10: {
                "width": 100,
                "height": 200,
                "systems": [{"boundingBox": {"left": 1, "top": 2, "width": 90, "height": 10}}],
            },
            12: {
                "width": 100,
                "height": 200,
                "systems": [{"boundingBox": {"left": 1, "top": 2, "width": 90, "height": 10}}],
            },
        }

        with self.assertRaisesRegex(ValueError, "non-contiguous source pages"):
            build_page_mapping("42", mapping, annotations)


if __name__ == "__main__":
    unittest.main()
