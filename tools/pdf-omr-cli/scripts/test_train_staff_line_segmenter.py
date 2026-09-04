#!/usr/bin/env python3

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from train_staff_line_segmenter import CompactStaffLineCNN, StaffLineDataset, TinyStaffLineUNet, dice_score


class TrainStaffLineSegmenterTest(unittest.TestCase):
    def test_model_preserves_page_shape(self) -> None:
        model = TinyStaffLineUNet()

        output = model(torch.zeros((2, 1, 64, 96)))

        self.assertEqual(tuple(output.shape), (2, 1, 64, 96))
        self.assertLess(sum(parameter.numel() for parameter in model.parameters()), 100_000)

    def test_compact_model_preserves_full_spatial_resolution(self) -> None:
        model = CompactStaffLineCNN()

        output = model(torch.zeros((2, 1, 64, 96)))

        self.assertEqual(tuple(output.shape), (2, 1, 64, 96))
        self.assertFalse(any(isinstance(layer, torch.nn.modules.pooling._MaxPoolNd) for layer in model.modules()))
        self.assertLess(sum(parameter.numel() for parameter in model.parameters()), 10_000)

    def test_dataset_converts_ink_and_binary_mask(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.fromarray(np.array([[255, 0]], dtype=np.uint8)).save(root / "image.png")
            Image.fromarray(np.array([[0, 255]], dtype=np.uint8)).save(root / "mask.png")
            dataset = StaffLineDataset(root, [{"imagePath": "image.png", "maskPath": "mask.png"}], (2, 1))

            image, mask = dataset[0]

            self.assertEqual(image.tolist(), [[[0.0, 1.0]]])
            self.assertEqual(mask.tolist(), [[[0.0, 1.0]]])

    def test_dice_is_one_for_matching_binary_logits(self) -> None:
        logits = torch.tensor([[[[-10.0, 10.0]]]])
        target = torch.tensor([[[[0.0, 1.0]]]])

        self.assertEqual(float(dice_score(logits, target)), 1.0)


if __name__ == "__main__":
    unittest.main()
