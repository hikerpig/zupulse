import unittest
from rhythm_source_evidence import source_events


class RhythmSourceTest(unittest.TestCase):
    def test_plain_heads_and_quarter_rest(self):
        glyphs = [("MScore", "\ue0a4", 10, 20), ("MScore", "\ue4e5", 20, 20)]
        heads = [{"x": 10, "y": 20, "pitch": 28, "gap": 5, "valid": True}]
        result = source_events(glyphs, heads, [], False)
        self.assertTrue(result["safe"])
        self.assertEqual([e["type"] for e in result["events"]], ["note", "rest"])
        self.assertIsNone(result["events"][0]["layers"])

    def test_dot_tuplet_flag_unknown_font_and_curve_refuse(self):
        for font, char in [("MScore", "\ue1e7"), ("FreeSerif", "3"), ("MScore", "\ue240"), ("Other", "\ue0a4")]:
            self.assertFalse(source_events([(font, char, 10, 20)], [], [], False)["safe"])
        self.assertFalse(source_events([], [], [], True)["safe"])

    def test_missing_head_and_chord_refuse(self):
        glyph = ("MScore", "\ue0a4", 10, 20)
        self.assertFalse(source_events([glyph], [], [], False)["safe"])
        heads = [{"x": 10, "y": y, "pitch": 28, "gap": 5, "valid": True} for y in [20, 25]]
        self.assertFalse(source_events([glyph, ("MScore", "\ue0a4", 10, 25)], heads, [], False)["safe"])


if __name__ == "__main__":
    unittest.main()
