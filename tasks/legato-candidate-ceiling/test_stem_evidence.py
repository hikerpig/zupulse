import unittest
from stem_evidence import stem_candidates


class StemEvidenceTest(unittest.TestCase):
    def test_up_and_down(self):
        self.assertEqual(stem_candidates((10, 50, 16), [(15.7, 30, 49, .65)], 5), [(0, "up")])
        self.assertEqual(stem_candidates((10, 50, 16), [(10.3, 51, 70, .65)], 5), [(0, "down")])

    def test_shared_chord_stem(self):
        line = [(15.7, 25, 54, .65)]
        self.assertEqual(stem_candidates((10, 50, 16), line, 5), [(0, "up")])
        self.assertEqual(stem_candidates((10, 55, 16), line, 5), [(0, "up")])

    def test_two_stems_remain_ambiguous(self):
        self.assertEqual(len(stem_candidates((10, 50, 16), [(15.7, 30, 49, .65), (10.3, 51, 70, .65)], 5)), 2)

    def test_far_thick_short_and_long_lines_reject(self):
        self.assertEqual(stem_candidates((10, 50, 16), [(30, 30, 49, .65), (15.7, 30, 49, 2),
                                                        (15.7, 46, 49, .65), (15.7, 0, 100, .65)], 5), [])


if __name__ == "__main__":
    unittest.main()
