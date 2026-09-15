import unittest
from key_evidence import flat_prefix


class KeyEvidenceTest(unittest.TestCase):
    def symbols(self, pitches):
        return [{"pitch": pitch, "x": 10 + 6 * i, "gap": 5, "alter": -1, "valid": True} for i, pitch in enumerate(pitches)]

    def test_standard_flat_prefixes(self):
        self.assertEqual(flat_prefix(self.symbols([34, 30]), [30]), -2)
        self.assertEqual(flat_prefix(self.symbols([34, 30, 33]), []), -3)

    def test_late_signature_does_not_apply_to_earlier_notes(self):
        self.assertIsNone(flat_prefix(self.symbols([34, 30]), [9, 30]))

    def test_wrong_order_and_scattered_symbols_reject(self):
        self.assertIsNone(flat_prefix(self.symbols([30, 34]), [30]))
        symbols = self.symbols([34, 30])
        symbols[1]["x"] = 25
        self.assertIsNone(flat_prefix(symbols, [40]))

    def test_empty_invalid_and_mixed_signs_reject(self):
        self.assertIsNone(flat_prefix([], []))
        symbols = self.symbols([34, 30])
        symbols[0]["alter"] = 0
        self.assertIsNone(flat_prefix(symbols, []))
        symbols[0]["valid"] = False
        self.assertIsNone(flat_prefix(symbols, []))


if __name__ == "__main__":
    unittest.main()
