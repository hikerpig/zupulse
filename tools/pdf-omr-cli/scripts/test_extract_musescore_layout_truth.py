#!/usr/bin/env python3
"""Tests for MuseScore SVG layout truth extraction."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract_musescore_layout_truth import extract_layout_page, extract_score_staff_count


def _svg(staff_tops: list[int], *, width: int = 1000, height: int = 2000) -> str:
    lines = []
    for staff_top in staff_tops:
        for line_index in range(5):
            y = staff_top + line_index * 10
            lines.append(
                '<polyline class="StaffLines" points="100,{y} 900,{y}" />'.format(y=y)
            )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
        + "".join(lines)
        + "</svg>"
    )


class ExtractMuseScoreLayoutTruthTest(unittest.TestCase):
    def test_extracts_ordered_three_staff_systems_in_learned_boundary_shape(self) -> None:
        page = extract_layout_page(
            _svg([100, 200, 300, 600, 700, 800]),
            page_index=2,
            staff_count=3,
        )

        self.assertEqual(page["schemaVersion"], "1.0.0")
        self.assertEqual(page["pageIndex"], 2)
        self.assertEqual(len(page["systems"]), 2)
        first = page["systems"][0]
        self.assertEqual(first["pageIndex"], 2)
        self.assertEqual(first["staffCount"], 3)
        self.assertEqual(first["confidence"], 1.0)
        self.assertEqual(len(first["staffLinePolylines"]), 15)
        self.assertEqual(first["staffLinePolylines"][0], [{"x": 0.1, "y": 0.05}, {"x": 0.9, "y": 0.05}])
        self.assertEqual(first["normalizedBBox"], {"x": 0.1, "y": 0.05, "width": 0.8, "height": 0.12})
        self.assertLess(
            first["normalizedBBox"]["y"] + first["normalizedBBox"]["height"],
            page["systems"][1]["normalizedBBox"]["y"],
        )

    def test_rejects_staff_lines_that_do_not_form_complete_visible_systems(self) -> None:
        with self.assertRaisesRegex(ValueError, "25 staff lines for 3 visible staves per system"):
            extract_layout_page(_svg([100, 200, 300, 600, 700]), page_index=0, staff_count=3)

    def test_rejects_non_horizontal_staff_lines(self) -> None:
        malformed = _svg([100, 200, 300]).replace("100,100 900,100", "100,100 900,101")

        with self.assertRaisesRegex(ValueError, "staff line must be horizontal"):
            extract_layout_page(malformed, page_index=0, staff_count=3)

    def test_reads_declared_staff_count_from_score_parts_not_measure_content(self) -> None:
        score = """<museScore><Score>
          <Part><Staff id="1"/><Staff id="2"/></Part>
          <Part><Staff id="3"/></Part>
          <Staff id="1"><Measure/></Staff><Staff id="2"/><Staff id="3"/>
        </Score></museScore>"""

        self.assertEqual(extract_score_staff_count(score), 3)

    def test_rejects_duplicate_declared_staff_ids(self) -> None:
        score = """<museScore><Score>
          <Part><Staff id="1"/></Part><Part><Staff id="1"/></Part>
        </Score></museScore>"""

        with self.assertRaisesRegex(ValueError, "duplicate declared staff id"):
            extract_score_staff_count(score)


if __name__ == "__main__":
    unittest.main()
