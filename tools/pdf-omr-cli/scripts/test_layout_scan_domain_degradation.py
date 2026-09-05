#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from build_openscore_layout_dataset import apply_scan_domain_degradation


class LayoutScanDomainDegradationTest(unittest.TestCase):
    def test_degradation_is_seeded_and_changes_the_image(self) -> None:
        pixels = np.full((80, 60), 240, dtype=np.uint8)
        pixels[20:50, 10:50] = 30
        image = Image.fromarray(pixels, mode="L")

        first = apply_scan_domain_degradation(image, seed=20260905)
        second = apply_scan_domain_degradation(image, seed=20260905)
        other = apply_scan_domain_degradation(image, seed=20260906)

        self.assertEqual(first.size, image.size)
        self.assertEqual(first.tobytes(), second.tobytes())
        self.assertNotEqual(first.tobytes(), image.tobytes())
        self.assertNotEqual(first.tobytes(), other.tobytes())


if __name__ == "__main__":
    unittest.main()
