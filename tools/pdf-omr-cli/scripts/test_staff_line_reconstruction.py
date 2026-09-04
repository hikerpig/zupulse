#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from staff_line_reconstruction import StaffEvidence, extract_row_peaks, group_staffs_by_connectors, select_complete_staffs


class StaffLineReconstructionTest(unittest.TestCase):
    def test_extracts_one_peak_from_each_adjacent_probability_run(self) -> None:
        probability = np.zeros((20, 10), dtype=np.float32)
        probability[4:6, :8] = 0.95
        probability[12, :4] = 0.99

        peaks = extract_row_peaks(probability)

        self.assertEqual([peak.y for peak in peaks], [4, 12])

    def test_selects_complete_staffs_and_discards_an_isolated_false_peak(self) -> None:
        peaks = [(y, 0.9) for y in [10, 14, 18, 22, 26, 31, 40, 44, 48, 52, 56]]

        staffs = select_complete_staffs(peaks)

        self.assertEqual([staff.lines for staff in staffs], [(10, 14, 18, 22, 26), (40, 44, 48, 52, 56)])

    def test_does_not_infer_a_staff_from_four_lines(self) -> None:
        peaks = [(y, 0.9) for y in [10, 14, 22, 26]]

        self.assertEqual(select_complete_staffs(peaks), [])

    def test_groups_at_most_three_staffs_using_vertical_connectors(self) -> None:
        image = np.full((80, 100), 255, dtype=np.uint8)
        staffs = [
            StaffEvidence((10, 12, 14, 16, 18), 2, 0.9),
            StaffEvidence((24, 26, 28, 30, 32), 2, 0.9),
            StaffEvidence((38, 40, 42, 44, 46), 2, 0.9),
            StaffEvidence((60, 62, 64, 66, 68), 2, 0.9),
        ]
        image[10:47, 5] = 0

        systems = group_staffs_by_connectors(image, staffs)

        self.assertEqual([len(system.staffs) for system in systems], [3, 1])
        self.assertEqual((systems[0].top, systems[0].bottom), (10, 46))

    def test_does_not_join_staffs_without_connector_evidence(self) -> None:
        image = np.full((40, 100), 255, dtype=np.uint8)
        staffs = [
            StaffEvidence((5, 7, 9, 11, 13), 2, 0.9),
            StaffEvidence((20, 22, 24, 26, 28), 2, 0.9),
        ]

        self.assertEqual([len(system.staffs) for system in group_staffs_by_connectors(image, staffs)], [1, 1])


if __name__ == "__main__":
    unittest.main()
