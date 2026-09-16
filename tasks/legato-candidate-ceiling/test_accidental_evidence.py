import unittest
from accidental_evidence import attach


class AccidentalEvidenceTest(unittest.TestCase):
    def test_closest_later_matching_head(self):
        self.assertEqual(attach(10, [(12, 0), (16, 1)], 5), [0])

    def test_rejects_before_and_distant_heads(self):
        self.assertEqual(attach(10, [(9, 0), (26, 1)], 5), [])

    def test_shared_x_remains_ambiguous(self):
        self.assertEqual(attach(10, [(16, 0), (16, 1)], 5), [0, 1])

    def test_no_head_and_invalid_gap(self):
        self.assertEqual(attach(10, [], 5), [])
        with self.assertRaises(ValueError):
            attach(10, [], 0)


if __name__ == "__main__":
    unittest.main()
