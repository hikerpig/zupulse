import unittest
from polyphonic_timing_v2 import clean_line_inventory


class BackgroundTests(unittest.TestCase):
    def test_accepts_first_background_with_rounded_page_bounds(self):
        p = dict(id=0, fill=[1, 1, 1], type="f", rect=[0, 0, 595.275085, 841.88873], items=["l"] * 4, width=None)
        self.assertTrue(clean_line_inventory([p], [0, 0, 595, 842], 5, 0))
        p["id"] = 10
        self.assertFalse(clean_line_inventory([p], [0, 0, 595, 842], 5, 0))
        p["id"] = 0
        p["rect"] = [10, 20, 30, 40]
        self.assertFalse(clean_line_inventory([p], [0, 0, 595, 842], 5, 0))

    def test_rejects_nonnotation_geometry(self):
        for p in [dict(fill=[0, 0, 0], type="f", rect=[10, 20, 30, 23], items=["l"] * 4, width=None),
                  dict(fill=None, type="s", rect=[10, 20, 30, 23], items=["c"], width=.5),
                  dict(fill=None, type="s", rect=[10, 20, 30, 23], items=["l"], width=.5),
                  dict(fill=None, type="s", rect=[10, 20, 10, 50], items=["l"], width=2)]:
            self.assertFalse(clean_line_inventory([p], [0, 0, 595, 842], 5, 0))
        self.assertFalse(clean_line_inventory([], [0, 0, 595, 842], 5, 1))


if __name__ == "__main__":
    unittest.main()
