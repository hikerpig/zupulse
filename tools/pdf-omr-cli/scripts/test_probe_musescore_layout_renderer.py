#!/usr/bin/env python3
"""Tests for deterministic MuseScore layout renderer probing."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from struct import pack

sys.path.insert(0, str(Path(__file__).parent))
from probe_musescore_layout_renderer import compare_render_runs, exported_pages, select_probe_items


def _score(staff_count: int) -> str:
    parts = "".join(f'<Part><Staff id="{staff_id}"/></Part>' for staff_id in range(1, staff_count + 1))
    return f"<museScore><Score>{parts}</Score></museScore>"


def _svg(staff_tops: list[int]) -> str:
    lines = []
    for staff_top in staff_tops:
        for line_index in range(5):
            y = staff_top + line_index * 10
            lines.append(f'<polyline class="StaffLines" points="100,{y} 900,{y}"/>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2000">' + "".join(lines) + "</svg>"


def _png(width: int, height: int) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + pack(">I", 13) + b"IHDR" + pack(">II", width, height)


class ProbeMuseScoreLayoutRendererTest(unittest.TestCase):
    def test_selects_a_bounded_number_from_each_observed_staff_count(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_root = Path(directory)
            items = []
            for score_id, staff_count in [("1", 3), ("2", 2), ("3", 3), ("4", 2), ("5", 2), ("6", 3)]:
                source_path = f"scores/{score_id}.mscx"
                path = source_root / source_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(_score(staff_count), encoding="utf-8")
                items.append({"scoreId": score_id, "sourcePath": source_path, "split": "train"})

            selected = select_probe_items({"items": items}, source_root, per_staff_count=2, max_items=4)

        self.assertEqual(
            [(item["scoreId"], item["staffCount"]) for item in selected],
            [("2", 2), ("4", 2), ("1", 3), ("3", 3)],
        )

    def test_rejects_source_paths_outside_the_pinned_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_root = Path(directory)
            plan = {"items": [{"scoreId": "1", "sourcePath": "../escape.mscx", "split": "train"}]}

            with self.assertRaisesRegex(ValueError, "source path escapes root"):
                select_probe_items(plan, source_root, per_staff_count=1, max_items=1)

    def test_orders_numbered_exports_by_page_number(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            export_root = Path(directory)
            for page_number in range(10, 0, -1):
                (export_root / f"page-{page_number}.svg").write_text("<svg/>", encoding="utf-8")

            pages = exported_pages(export_root, "svg")

        self.assertEqual(
            [path.name for path in pages],
            [f"page-{page_number}.svg" for page_number in range(1, 11)],
        )

    def test_accepts_the_single_page_export_name(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            export_root = Path(directory)
            (export_root / "page.svg").write_text("<svg/>", encoding="utf-8")

            pages = exported_pages(export_root, "svg")

        self.assertEqual([path.name for path in pages], ["page.svg"])

    def test_compares_two_identical_render_runs_and_records_boundary_truth(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            svg = _svg([100, 200, 300])
            for run_name in ["first", "second"]:
                run_root = root / run_name
                run_root.mkdir()
                (run_root / "page.svg").write_text(svg, encoding="utf-8")
                (run_root / "page.png").write_bytes(_png(1400, 2800))

            pages = compare_render_runs(root / "first", root / "second", staff_count=3)

        self.assertEqual(len(pages), 1)
        self.assertEqual(pages[0]["pageIndex"], 0)
        self.assertEqual(pages[0]["pixelWidth"], 1400)
        self.assertEqual(pages[0]["pixelHeight"], 2800)
        self.assertEqual(pages[0]["systemCount"], 1)
        self.assertEqual(pages[0]["staffCounts"], [3])
        self.assertEqual(len(pages[0]["annotationSha256"]), 64)

    def test_rejects_non_deterministic_raster_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            svg = _svg([100, 200, 300])
            for run_name, height in [("first", 2800), ("second", 2801)]:
                run_root = root / run_name
                run_root.mkdir()
                (run_root / "page.svg").write_text(svg, encoding="utf-8")
                (run_root / "page.png").write_bytes(_png(1400, height))

            with self.assertRaisesRegex(ValueError, "raster output is not deterministic"):
                compare_render_runs(root / "first", root / "second", staff_count=3)


if __name__ == "__main__":
    unittest.main()
