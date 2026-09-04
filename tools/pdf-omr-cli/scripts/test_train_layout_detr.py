#!/usr/bin/env python3

from __future__ import annotations

import sys
import tempfile
import unittest
import hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from train_layout_detr import sampling_weights, validate_source_model


class TrainLayoutDetrTest(unittest.TestCase):
    def test_oversamples_only_pages_containing_the_rare_one_staff_class(self) -> None:
        pages = [
            {"staffCounts": [2, 3]},
            {"staffCounts": [1, 3]},
            {"staffCounts": [3]},
        ]

        self.assertEqual(sampling_weights(pages, rare_multiplier=4), [1.0, 4.0, 1.0])

    def test_rejects_invalid_sampling_multiplier(self) -> None:
        with self.assertRaisesRegex(ValueError, "rare multiplier"):
            sampling_weights([], rare_multiplier=0)

    def test_validates_every_pinned_source_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            expected = {}
            for name, content in (("config.json", b"config"), ("weights.bin", b"weights")):
                (root / name).write_bytes(content)
                expected[name] = hashlib.sha256(content).hexdigest()

            self.assertEqual(validate_source_model(root, expected), expected)
            (root / "weights.bin").write_bytes(b"changed")

            with self.assertRaisesRegex(ValueError, "source model artifact hash mismatch"):
                validate_source_model(root, expected)


if __name__ == "__main__":
    unittest.main()
