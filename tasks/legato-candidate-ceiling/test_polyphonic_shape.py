import copy
import unittest
from polyphonic_shape import identify_shape


class ShapeTests(unittest.TestCase):
    def fixture(self):
        heads = [dict(x=10, y=20, glyph="0xe0a3", gap=5, valid=True, pitch=30),
                 dict(x=10, y=27.5, glyph="0xe0a3", gap=5, valid=True, pitch=27),
                 dict(x=50, y=22.5, glyph="0xe0a4", gap=5, valid=True, pitch=29)]
        glyphs = [["MScore", chr(int(h["glyph"], 16)), h["x"], h["y"]] for h in heads]
        glyphs.append(["MScore", "\ue1e7", 18.7, 27.5])
        stems = [dict(x=h["x"], y=h["y"], direction=d, stemIndex=i, status="unknown-beam", layers=None)
                 for i, (h, d) in enumerate(zip(heads, ["up", "down", "up"]))]
        return glyphs, heads, stems, False

    def test_identifies_shape_without_claiming_black_head_duration(self):
        args = self.fixture()
        frozen = copy.deepcopy(args)
        result = identify_shape(*args)
        self.assertEqual(result["status"], "shape-only")
        self.assertEqual(result["movingPitches"], [30, 29])
        self.assertEqual(result["sustainedPitch"], 27)
        self.assertFalse(result["completeTimingEvidence"])
        self.assertEqual(args, frozen)

    def test_rejects_wrong_or_ambiguous_dot(self):
        for y in [20, 24, 40]:
            args = self.fixture()
            args[0][-1][3] = y
            self.assertEqual(identify_shape(*args)["status"], "rejected")

    def test_rejects_curve_unknown_glyph_and_known_beam(self):
        args = self.fixture()
        self.assertEqual(identify_shape(*args[:3], True)["status"], "rejected")
        args[0].append(["MScore", "\ue240", 50, 20])
        self.assertEqual(identify_shape(*args)["status"], "rejected")
        args = self.fixture()
        args[2][-1]["layers"] = [1]
        self.assertEqual(identify_shape(*args)["status"], "rejected")

    def test_rejects_shared_or_duplicate_stem(self):
        args = self.fixture()
        args[2][1]["direction"] = "up"
        self.assertEqual(identify_shape(*args)["status"], "rejected")
        args = self.fixture()
        args[2].append(copy.deepcopy(args[2][0]))
        self.assertEqual(identify_shape(*args)["status"], "rejected")

    def test_rejects_extra_head_or_invalid_pitch_evidence(self):
        args = self.fixture()
        args[1].append(copy.deepcopy(args[1][0]))
        self.assertEqual(identify_shape(*args)["status"], "rejected")
        args = self.fixture()
        args[1][0]["valid"] = False
        self.assertEqual(identify_shape(*args)["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
