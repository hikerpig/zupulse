import unittest

from curve_evidence import endpoints, endpoint_pairs


class CurveEvidenceTest(unittest.TestCase):
    def test_closed_ribbon_endpoints(self):
        curves = [[[10, 20], [15, 15], [35, 15], [40, 20]],
                  [[40, 20], [35, 16], [15, 16], [10, 20]]]
        self.assertEqual(endpoints(curves), [[10, 20], [40, 20]])
        self.assertEqual(endpoints(curves[::-1]), [[10, 20], [40, 20]])
        self.assertIsNone(endpoints(curves[:1]))
        self.assertIsNone(endpoints([curves[0], curves[0]]))

    def test_unique_same_pitch_connection(self):
        heads = [dict(x=x, y=24, gap=5, valid=True, pitch=35, staff=0, measure=m)
                 for x, m in [(7, 0), (37, 1)]]
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [[0, 1]])
        heads[1]["pitch"] = 34
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [])

    def test_ambiguity_and_staff_boundary(self):
        heads = [dict(x=x, y=24, gap=5, valid=True, pitch=35, staff=0, measure=m)
                 for x, m in [(7, 0), (8, 0), (37, 1)]]
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [[0, 2], [1, 2]])
        heads[2]["staff"] = 1
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [])

    def test_distance_invalid_and_skipped_measure(self):
        heads = [dict(x=x, y=24, gap=5, valid=True, pitch=35, staff=0, measure=m)
                 for x, m in [(7, 0), (37, 2)]]
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [])
        heads[1]["measure"] = 1
        heads[1]["valid"] = False
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [])
        heads[1]["valid"] = True
        heads[1]["y"] = 30
        self.assertEqual(endpoint_pairs([[10, 20], [40, 20]], heads), [])


if __name__ == "__main__":
    unittest.main()
