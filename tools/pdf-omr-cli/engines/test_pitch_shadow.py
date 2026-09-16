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

    def test_curve_is_local_but_unresolved_accidental_invalidates_staff_key(self):
        data = page_data()
        data["curves"] = [(60, 110, 110, 119)]
        data["glyphs"].append(("MScore", "\ue262", 330, 180))
        result = extract_page(**data)
        self.assertEqual(result["measures"][0]["reason"], "source-curve")
        self.assertEqual(result["measures"][1]["reason"], "unresolved-key")
        self.assertEqual(result["measures"][3]["reason"], "unresolved-accidental")

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

    def test_compound_final_bar_is_one_boundary(self):
        data = page_data()
        data["lines"][-1] = (578.75, 100, 578.75, 180)
        data["lines"].append((573.45, 100, 573.45, 180))
        result = extract_page(**data)
        self.assertEqual(result["reason"], "supported")
        self.assertEqual(len(result["measures"]), 4)

    def test_compound_bar_must_not_swallow_a_note(self):
        data = page_data()
        data["lines"].append((574, 100, 574, 180))
        data["glyphs"].append(("MScore", "\ue0a4", 577, 120))
        self.assertEqual(extract_page(**data)["reason"], "ambiguous-barlines")

    def test_explicit_start_repeat_prefix_is_not_an_empty_measure(self):
        data = page_data()
        data["lines"] += [(50, 100, 50, 180), (55.3, 100, 55.3, 180)]
        data["glyphs"] += [("MScore", "\ue044", 59, y) for y in [107.5, 112.5, 167.5, 172.5]]
        result = extract_page(**data)
        self.assertEqual(result["reason"], "supported")
        self.assertEqual(len(result["measures"]), 4)
        self.assertEqual(result["measures"][0]["heads"][0]["x"], 80)

    def test_metronome_mark_requires_matching_numeric_text_outside_staff(self):
        data = page_data()
        mark = ("BravuraText", "\ueca5", 80, 90)
        text = [("FreeSerifBold", c, 90 + i * 4, 90) for i, c in enumerate("=120")]
        data["glyphs"] += [mark, *text]
        data["text_spans"] = [{"text": "=120", "glyphs": text, "bbox": [90, 82, 106, 92]}]
        self.assertEqual(extract_page(**data)["reason"], "supported")
        data["text_spans"] = []
        self.assertNotEqual(extract_page(**data)["reason"], "supported")

    def test_measure_number_must_be_wholly_before_clef_and_above_staff(self):
        for x, y, expected in [(18, 90, "supported"), (40, 90, "unsupported-notation"), (18, 115, "unsupported-notation")]:
            data = page_data()
            glyphs = [("FreeSerif", "8", x, y)]
            data["glyphs"] += glyphs
            data["text_spans"] = [{"text": "8", "glyphs": glyphs, "bbox": [x, y-8, x+5, y+2]}]
            self.assertEqual(extract_page(**data)["reason"], expected)

    def test_known_non_pitch_symbols_do_not_block_source_pitch(self):
        for char in ["\ue4a0", "\ue4a1", "\ue4a2", "\ue4a3", "\ue240", "\ue4c0", "\ue520", "\ue083"]:
            data = page_data()
            data["glyphs"].append(("MScore", char, 100, 105))
            result = extract_page(**data)
            self.assertEqual(result["reason"], "supported", hex(ord(char)))
            self.assertEqual(result["measures"][0]["reason"], "supported", hex(ord(char)))

    def test_margin_measure_numbers_require_source_count_agreement(self):
        for numbers, expected in [((16, 18), "supported"), ((16, 19), "unsupported-notation"),
                                  ((8, 10), "unsupported-notation")]:
            with self.subTest(numbers=numbers):
                data = page_data()
                data["lines"] += [(x, y + 200, xx, yy + 200) for x, y, xx, yy in list(data["lines"])]
                data["glyphs"] += [(font, char, x, y + 200) for font, char, x, y in list(data["glyphs"])]
                data["text_spans"] = []
                for number, y in zip(numbers, [90, 290]):
                    text = str(number)
                    glyphs = [("FreeSerif", c, 20.3 + i * 4, y) for i, c in enumerate(text)]
                    data["glyphs"] += glyphs
                    data["text_spans"].append({"text": text, "glyphs": glyphs,
                                               "bbox": [20.3, y - 8, 20.3 + len(text) * 4, y + 2]})
                self.assertEqual(extract_page(**data)["reason"], expected)

    def test_isolated_margin_number_is_not_proof_of_a_measure_label(self):
        data = page_data()
        glyphs = [("FreeSerif", c, 20.3 + i * 4, 90) for i, c in enumerate("16")]
        data["glyphs"] += glyphs
        data["text_spans"] = [{"text": "16", "glyphs": glyphs, "bbox": [20.3, 82, 28.3, 92]}]
        self.assertEqual(extract_page(**data)["reason"], "unsupported-notation")

    def test_complete_non_pitch_expression_does_not_hide_mixed_instructions(self):
        for text, expected in [("a tempo", "supported"), ("Andantino", "supported"),
                               ("cresc.", "supported"), ("decresc.", "supported"),
                               ("cresc. 8va", "unsupported-notation"),
                               ("a tempo 15ma", "unsupported-notation"),
                               ("8", "unsupported-notation"), ("unknown", "unsupported-notation")]:
            with self.subTest(text=text):
                data = page_data()
                glyphs = [("FreeSerif", c, 100 + i * 4, 140) for i, c in enumerate(text)]
                data["glyphs"] += glyphs
                data["text_spans"] = [{"text": text, "glyphs": glyphs,
                                       "bbox": [100, 132, 100 + len(text) * 4, 142]}]
                self.assertEqual(extract_page(**data)["reason"], expected)

    def test_system_brace_requires_known_font_and_matching_lower_staff_endpoint(self):
        for font, x, y, expected in [("Leland", 14, 180, "supported"),
                                     ("Other", 14, 180, "unassigned-glyph"),
                                     ("Leland", 14, 160, "unassigned-glyph"),
                                     ("Leland", 80, 180, "unsupported-notation")]:
            with self.subTest(font=font, x=x, y=y):
                data = page_data()
                data["glyphs"].append((font, "\ue000", x, y))
                self.assertEqual(extract_page(**data)["reason"], expected)

    def test_defined_dynamic_glyphs_need_no_pitch_staff_assignment(self):
        baseline = extract_page(**page_data())
        for codepoint in range(0xE520, 0xE54A):
            data = page_data()
            data["glyphs"].append(("Leland", chr(codepoint), 200, 140))
            self.assertEqual(extract_page(**data), baseline, hex(codepoint))
        for codepoint in (0xE510, 0xE54A):
            data = page_data()
            data["glyphs"].append(("Leland", chr(codepoint), 200, 140))
            self.assertNotEqual(extract_page(**data)["reason"], "supported")

    def test_source_key_signature_and_local_accidental_have_separate_scope(self):
        data = page_data()
        data["glyphs"][2] = ("MScore", "\ue0a4", 80, 110)  # B4.
        data["glyphs"][4] = ("MScore", "\ue0a4", 350, 110)
        data["glyphs"] += [("MScore", "\ue260", 45, 110), ("MScore", "\ue261", 337, 110)]
        result = extract_page(**data)
        self.assertEqual(result["measures"][0]["heads"][0]["alter"], -1)
        self.assertEqual(result["measures"][2]["heads"][0]["alter"], 0)

    def test_accidental_carries_within_measure_but_resets_at_barline(self):
        data = page_data()
        data["glyphs"][4] = ("MScore", "\ue0a4", 350, 120)
        data["glyphs"] += [("MScore", "\ue262", 67, 120), ("MScore", "\ue0a4", 200, 120)]
        result = extract_page(**data)
        self.assertEqual([h["alter"] for h in result["measures"][0]["heads"]], [1, 1])
        self.assertEqual(result["measures"][2]["heads"][0]["alter"], 0)

    def test_unknown_key_pattern_abstains_instead_of_assuming_c_major(self):
        data = page_data()
        data["glyphs"].append(("MScore", "\ue260", 45, 120))  # E flat is not the first standard key accidental.
        result = extract_page(**data)
        self.assertEqual(result["measures"][0]["reason"], "unresolved-key")
        self.assertIsNone(result["measures"][2]["heads"][0]["alter"])

    def test_unmatched_accidental_cannot_disappear(self):
        data = page_data()
        data["glyphs"].append(("MScore", "\ue262", 337, 115))
        result = extract_page(**data)
        self.assertEqual(result["measures"][2]["reason"], "unresolved-accidental")

    def test_ledger_line_accidental_is_not_dropped_by_staff_bounds(self):
        data = page_data()
        data["glyphs"][4] = ("MScore", "\ue0a4", 350, 87.5)
        data["glyphs"].append(("MScore", "\ue262", 337, 87.5))
        result = extract_page(**data)
        self.assertEqual(result["measures"][2]["heads"][0]["alter"], 1)

    def test_unresolved_accidental_cannot_leave_stale_key_context(self):
        data = page_data()
        data["glyphs"].append(("MScore", "\ue262", 200, 115))
        result = extract_page(**data)
        self.assertIsNone(result["measures"][2]["heads"][0]["alter"])
        self.assertIsNone(result["endKeys"][0])

    def test_music_font_ottava_rejects_page_not_only_its_start_measure(self):
        data = page_data()
        data["glyphs"].append(("MScore", "\ue510", 200, 95))
        self.assertEqual(extract_page(**data)["reason"], "unsupported-notation")


if __name__ == "__main__":
    unittest.main()
