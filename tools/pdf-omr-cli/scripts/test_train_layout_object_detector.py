#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from train_layout_object_detector import build_model, focal_heatmap_loss, initialize_backbone_from_band_state


class TrainLayoutObjectDetectorTest(unittest.TestCase):
    def test_model_emits_four_two_dimensional_object_heatmaps(self) -> None:
        model = build_model("compact-layout-object-center-stride4-v1")

        output = model(torch.zeros((2, 1, 96, 64), dtype=torch.float32))

        self.assertEqual(tuple(output.shape), (2, 4, 24, 16))

    def test_initializes_backbone_but_uses_sparse_object_head_prior(self) -> None:
        model = build_model("compact-layout-object-center-stride4-v1")
        source = model.state_dict()
        source.pop("object_head.weight")
        source.pop("object_head.bias")
        source["system_head.weight"] = torch.full((1, 8, 1, 1), 2.0)
        source["system_head.bias"] = torch.tensor([3.0])
        source["staff_head.weight"] = torch.full((1, 8, 1, 1), 5.0)
        source["staff_head.bias"] = torch.tensor([7.0])

        initialize_backbone_from_band_state(model, source)

        self.assertTrue(torch.allclose(model.object_head.bias, torch.full((4,), -2.19)))
        self.assertLess(float(model.object_head.weight.detach().std()), 0.002)

    def test_focal_loss_rewards_correct_center_and_background_predictions(self) -> None:
        target = torch.zeros((1, 1, 5, 5))
        target[0, 0, 2, 2] = 1
        good = torch.full_like(target, -5)
        good[0, 0, 2, 2] = 5

        self.assertLess(focal_heatmap_loss(good, target), focal_heatmap_loss(torch.zeros_like(target), target))


if __name__ == "__main__":
    unittest.main()
