#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from build_openscore_layout_dataset import (
    MINIMUM_INTER_SYSTEM_GAP_PX,
    SystemBandGapError,
    adjust_vertical_bands,
    draw_system_band_mask,
    inter_system_background_rows,
    system_band_rectangles,
)


def _system(*, x: float, y: float, width: float, height: float) -> dict[str, object]:
    return {"normalizedBBox": {"x": x, "y": y, "width": width, "height": height}}


class LayoutSystemBandGapTest(unittest.TestCase):
    def test_leaves_already_separated_bands_unchanged(self) -> None:
        bands = adjust_vertical_bands([(10, 40), (80, 120)], minimum_gap_px=8, image_height=200)

        self.assertEqual(bands, [(10, 40), (80, 120)])
        self.assertGreaterEqual(min(inter_system_background_rows(bands)), 8)

    def test_splits_shrink_toward_centers_until_the_registered_gap(self) -> None:
        # Inclusive rows 30-90 and 96-155 have 5 background rows between them.
        bands = adjust_vertical_bands([(30, 90), (96, 155)], minimum_gap_px=8, image_height=300)

        self.assertEqual(bands, [(30, 88), (97, 155)])
        self.assertEqual(inter_system_background_rows(bands), [8])
        self.assertTrue(30 <= 60 <= 88)
        self.assertTrue(97 <= 125.5 <= 155)

    def test_rejects_bands_that_cannot_keep_the_gap_and_their_centers(self) -> None:
        with self.assertRaisesRegex(SystemBandGapError, "non-positive"):
            adjust_vertical_bands([(0, 3), (4, 7)], minimum_gap_px=8, image_height=20)

    def test_gapped_mask_keeps_horizontal_bbox_and_is_byte_identical(self) -> None:
        annotation = {
            "systems": [
                _system(x=0.1, y=0.10, width=0.8, height=0.20),
                _system(x=0.1, y=0.32, width=0.8, height=0.20),
            ]
        }
        size = (200, 300)
        first = draw_system_band_mask(annotation, size, minimum_inter_system_gap_px=8)
        second = draw_system_band_mask(annotation, size, minimum_inter_system_gap_px=8)
        filled = draw_system_band_mask(annotation, size)
        gapped = np.asarray(first)
        filled_array = np.asarray(filled)
        rectangles = system_band_rectangles(annotation, size, minimum_inter_system_gap_px=8)

        self.assertEqual(first.tobytes(), second.tobytes())
        self.assertEqual([left for left, _top, right, _bottom in rectangles], [round(0.1 * 199), round(0.1 * 199)])
        self.assertEqual([right for left, _top, right, _bottom in rectangles], [round(0.9 * 199), round(0.9 * 199)])
        self.assertGreaterEqual(min(inter_system_background_rows([(top, bottom) for _l, top, _r, bottom in rectangles])), 8)
        self.assertLess(int((gapped > 0).sum()), int((filled_array > 0).sum()))
        self.assertEqual(MINIMUM_INTER_SYSTEM_GAP_PX, 8)

    def test_default_mask_still_fills_the_annotated_bbox(self) -> None:
        annotation = {"systems": [_system(x=0.2, y=0.25, width=0.6, height=0.08)]}
        mask = np.asarray(draw_system_band_mask(annotation, (200, 300)))

        self.assertGreater(mask[75:100, 40:160].min(), 0)
        self.assertEqual(mask[:70].max(), 0)
        self.assertEqual(mask[105:].max(), 0)

    def test_side_by_side_overlap_fail_closes_instead_of_merging(self) -> None:
        annotation = {
            "systems": [
                _system(x=0.05, y=0.2, width=0.4, height=0.2),
                _system(x=0.55, y=0.2, width=0.4, height=0.2),
            ]
        }

        with self.assertRaises(SystemBandGapError):
            system_band_rectangles(annotation, (512, 768), minimum_inter_system_gap_px=8)
        filled = np.asarray(draw_system_band_mask(annotation, (512, 768)))
        self.assertGreater(int((filled > 0).sum()), 0)


if __name__ == "__main__":
    unittest.main()
