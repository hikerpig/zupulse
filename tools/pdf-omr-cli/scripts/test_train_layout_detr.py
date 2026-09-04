#!/usr/bin/env python3

from __future__ import annotations

import sys
import tempfile
import unittest
import hashlib
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from train_layout_detr import cloned_state_dict, model_profile, sampling_weights, validate_source_model


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

    def test_selects_deformable_doclaynet_profile(self) -> None:
        profile = model_profile("deformable-detr-doclaynet")

        self.assertEqual(profile["activation"], "sigmoid")
        self.assertEqual(profile["modelType"], "deformable_detr")
        self.assertEqual(profile["revision"], "c5946fb892bd99f527c0dd69577b9e9e55364f8f")

        with self.assertRaisesRegex(ValueError, "unsupported architecture"):
            model_profile("unknown")

    def test_clones_shared_parameters_for_safe_serialization(self) -> None:
        shared = torch.nn.Linear(2, 2)
        model = torch.nn.Module()
        model.first = shared
        model.second = shared

        state = cloned_state_dict(model)

        self.assertTrue(torch.equal(state["first.weight"], state["second.weight"]))
        self.assertNotEqual(state["first.weight"].data_ptr(), state["second.weight"].data_ptr())


if __name__ == "__main__":
    unittest.main()
