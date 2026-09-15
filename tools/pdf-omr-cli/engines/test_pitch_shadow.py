import unittest

from pitch_shadow import extract_page


def page_data():
    lines = [(20, y, 580, y) for y in [100, 105, 110, 115, 120, 160, 165, 170, 175, 180]]
    lines += [(x, 100, x, 180) for x in [20, 300, 580]]
    glyphs = [("MScore", "\ue050", 35, 115), ("Leland", "\ue062", 35, 165),
              ("MScore", "\ue0a4", 80, 120), ("Leland", "\ue0a4", 80, 180),
              ("MScore", "\ue0a4", 350, 117.5), ("Leland", "\ue0a3", 350, 180)]
    return dict(width=600, height=800, lines=lines, glyphs=glyphs, curves=[], raster=False)


class PitchShadowTests(unittest.TestCase):
    def test_extracts_explicit_clefs_and_source_positions(self):
        result = extract_page(**page_data())
        self.assertEqual(result["reason"], "supported")
        self.assertEqual([b["heads"][0]["diatonic"] for b in result["measures"]], [30, 18, 31, 18])
        self.assertEqual(result["measures"][2]["measureIndex"], 1)

    def test_page_border_is_not_a_staff_line(self):
        data = page_data()
        data["lines"] += [(0, 0, 600, 0), (0, 800, 600, 800)]
        self.assertEqual(extract_page(**data)["reason"], "supported")

    def test_continuous_barline_segments_merge_without_bridging_gaps(self):
        for separation, expected in [(0, "supported"), (5, "incomplete-barlines")]:
            data = page_data()
            data["lines"] = data["lines"][:10] + [segment for x in [20, 300, 580]
                for segment in [(x, 100, x, 140), (x, 140 + separation, x, 180)]]
            self.assertEqual(extract_page(**data)["reason"], expected)

    def test_missing_clef_is_not_inferred_from_staff_order(self):
        data = page_data()
        data["glyphs"] = data["glyphs"][1:]
        self.assertEqual(extract_page(**data)["reason"], "unresolved-clef")

    def test_scan_and_incomplete_staff_geometry_abstain(self):
        data = page_data()
        data["raster"] = True
        self.assertEqual(extract_page(**data)["reason"], "raster-content")
        data = page_data()
        data["lines"].pop()
        self.assertEqual(extract_page(**data)["reason"], "incomplete-barlines")

    def test_unknown_font_or_off_grid_head_abstains(self):
        for font, y in [("Other", 120), ("MScore", 120.8)]:
            data = page_data()
            data["glyphs"][2] = (font, "\ue0a4", 80, y)
            self.assertNotEqual(extract_page(**data)["reason"], "supported")

    def test_curve_and_accidental_reject_only_intersecting_measure(self):
        data = page_data()
        data["curves"] = [(60, 110, 110, 119)]
        data["glyphs"].append(("MScore", "\ue262", 330, 180))
        result = extract_page(**data)
        self.assertEqual(result["measures"][0]["reason"], "source-curve")
        self.assertEqual(result["measures"][1]["reason"], "supported")
        self.assertEqual(result["measures"][3]["reason"], "unsupported-notation")

    def test_unassigned_or_ambiguous_head_rejects_page(self):
        data = page_data()
        data["glyphs"].append(("MScore", "\ue0a4", 590, 120))
        self.assertEqual(extract_page(**data)["reason"], "unassigned-glyph")

    def test_contiguous_staff_segments_merge_but_gaps_do_not(self):
        for separation, expected in [(0, "supported"), (5, "unsupported-staff-layout")]:
            data = page_data()
            data["lines"] = [(x, y, 300, yy) for x, y, xx, yy in data["lines"][:10]] + [
                (300 + separation, y, xx, yy) for x, y, xx, yy in data["lines"][:10]
            ] + data["lines"][10:]
            self.assertEqual(extract_page(**data)["reason"], expected)

    def test_unsupported_clef_or_ottava_does_not_leave_stale_pitch_context(self):
        for glyph in [("MScore", "\ue053", 310, 115), ("Times", "8", 310, 100)]:
            data = page_data()
            data["glyphs"].append(glyph)
            self.assertNotEqual(extract_page(**data)["reason"], "supported")


if __name__ == "__main__":
    unittest.main()
