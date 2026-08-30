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

    def test_uses_brace_anchors_to_recover_systems_with_hidden_staves(self) -> None:
        svg = _svg([100, 200, 300, 600, 700, 900, 1000, 1100]).replace(
            "</svg>",
            """<path class="Bracket" d="M0,200 L0,340"/>
            <path class="Bracket" d="M0,600 L0,740"/>
            <path class="Bracket" d="M0,1000 L0,1140"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=3)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [3, 2, 3])
        self.assertEqual([len(system["staffLinePolylines"]) for system in page["systems"]], [15, 10, 15])

    def test_applies_svg_matrix_to_brace_anchor_geometry(self) -> None:
        svg = _svg([100, 200, 300, 600, 700]).replace(
            "</svg>",
            """<path class="Bracket" transform="matrix(1,0,0,1,0,340)" d="M0,-140 L0,0"/>
            <path class="Bracket" transform="matrix(1,0,0,1,0,740)" d="M0,-140 L0,0"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=3)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [3, 2])

    def test_uses_brace_bottoms_when_voice_staff_is_asymmetrically_spaced(self) -> None:
        svg = _svg([100, 200, 300, 390, 600, 700]).replace(
            "</svg>",
            """<path class="Bracket" d="M0,200 L0,340"/>
            <path class="Bracket" d="M0,600 L0,740"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=3)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [3, 3])

    def test_prefers_vertical_square_brackets_over_decorative_hook_paths(self) -> None:
        svg = _svg([100, 200, 300, 400, 600, 700, 800, 900]).replace(
            "</svg>",
            """<polyline class="Bracket" points="50,100 50,440"/>
            <polyline class="Bracket" points="50,100 80,100"/>
            <polyline class="Bracket" points="50,440 80,440"/>
            <polyline class="Bracket" points="50,600 50,940"/>
            <polyline class="Bracket" points="50,600 80,600"/>
            <polyline class="Bracket" points="50,940 80,940"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=4)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [4, 4])

    def test_keeps_an_unbracketed_facilitation_staff_in_its_system(self) -> None:
        svg = _svg([100, 200, 300, 600, 700, 800, 900]).replace(
            "</svg>",
            """<path class="Bracket" d="M0,200 L0,340"/>
            <path class="Bracket" d="M0,700 L0,840"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=4)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [3, 4])

    def test_combines_vocal_square_brackets_and_piano_braces_per_system(self) -> None:
        svg = _svg([100, 200, 300, 400, 700, 800, 900, 1200, 1300, 1400, 1500]).replace(
            "</svg>",
            """<polyline class="Bracket" points="0,100 0,240"/>
            <path class="Bracket" d="M0,300 L0,440"/>
            <path class="Bracket" d="M0,800 L0,940"/>
            <polyline class="Bracket" points="0,1200 0,1340"/>
            <path class="Bracket" d="M0,1400 L0,1540"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=4)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [4, 3, 4])

    def test_orders_side_by_side_single_staff_excerpts_after_a_three_staff_system(self) -> None:
        svg = _svg([100, 200, 300], width=1000, height=1200).replace(
            "</svg>",
            """<polyline class="StaffLines" points="100,700 450,700"/>
            <polyline class="StaffLines" points="100,710 450,710"/>
            <polyline class="StaffLines" points="100,720 450,720"/>
            <polyline class="StaffLines" points="100,730 450,730"/>
            <polyline class="StaffLines" points="100,740 450,740"/>
            <polyline class="StaffLines" points="550,700 900,700"/>
            <polyline class="StaffLines" points="550,710 900,710"/>
            <polyline class="StaffLines" points="550,720 900,720"/>
            <polyline class="StaffLines" points="550,730 900,730"/>
            <polyline class="StaffLines" points="550,740 900,740"/>
            <path class="Bracket" d="M0,200 L0,340"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=3)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [3, 1, 1])
        self.assertLess(
            page["systems"][1]["normalizedBBox"]["x"],
            page["systems"][2]["normalizedBBox"]["x"],
        )

    def test_uses_barline_connectivity_when_declared_staves_are_hidden_without_brackets(self) -> None:
        svg = _svg([100, 300, 500, 700]).replace(
            "</svg>",
            """<polyline class="BarLine" points="900,100 900,140"/>
            <polyline class="BarLine" points="900,300 900,340"/>
            <polyline class="BarLine" points="900,500 900,540"/>
            <polyline class="BarLine" points="900,700 900,740"/></svg>""",
        )

        page = extract_layout_page(svg, page_index=0, staff_count=3)

        self.assertEqual([system["staffCount"] for system in page["systems"]], [1, 1, 1, 1])


if __name__ == "__main__":
    unittest.main()
