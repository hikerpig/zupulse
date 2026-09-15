import unittest
from beam_evidence import beam_polygon, beam_layers


def rectangle(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


class BeamEvidenceTest(unittest.TestCase):
    def test_supported_polygon_and_reversed_vertices(self):
        points = [(10, 20), (30, 22), (30, 24.5), (10, 22.5)]
        self.assertEqual(beam_polygon(points, 5), beam_polygon(list(reversed(points)), 5))
        self.assertIsNotNone(beam_polygon(points, 5))

    def test_reject_thick_steep_and_short_polygons(self):
        for points in [rectangle(10, 20, 30, 30), rectangle(10, 20, 11, 22.5),
                       [(10, 20), (30, 40), (30, 42.5), (10, 22.5)]]:
            self.assertIsNone(beam_polygon(points, 5))

    def test_three_layers_and_partial_beam(self):
        polygons = [rectangle(10, 20, 40, 22.5), rectangle(10, 23.75, 40, 26.25), rectangle(20, 27.5, 30, 30)]
        self.assertEqual(beam_layers((25, 20, 50, .65), "up", polygons, 5), [0, 1, 2])
        self.assertEqual(beam_layers((10, 20, 50, .65), "up", polygons, 5), [0, 1])

    def test_down_stem(self):
        self.assertEqual(beam_layers((25, 5, 22.5, .65), "down", [rectangle(10, 20, 40, 22.5)], 5), [0])

    def test_reject_duplicates_missing_outer_and_wrong_spacing(self):
        p = rectangle(10, 20, 40, 22.5)
        self.assertIsNone(beam_layers((25, 20, 50, .65), "up", [p, p], 5))
        self.assertIsNone(beam_layers((25, 15, 50, .65), "up", [p], 5))
        self.assertIsNone(beam_layers((25, 20, 50, .65), "up", [p, rectangle(10, 26, 40, 28.5)], 5))

    def test_no_beams_is_unknown(self):
        self.assertIsNone(beam_layers((25, 20, 50, .65), "up", [], 5))


if __name__ == "__main__":
    unittest.main()
