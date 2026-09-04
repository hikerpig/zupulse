#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from train_layout_segmenter import LayoutDataset, build_model


class TrainLayoutSegmenterTest(unittest.TestCase):
    def test_model_emits_staff_line_and_system_band_logits(self) -> None:
        model = build_model("compact-layout-unet-v1")

        staff_logits, system_logits = model(torch.zeros((1, 1, 96, 64)))

        self.assertEqual(staff_logits.shape, (1, 1, 96, 64))
        self.assertEqual(system_logits.shape, (1, 1, 96, 64))

    def test_dataset_derives_system_mask_from_the_matching_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.fromarray(np.full((100, 80), 255, dtype=np.uint8)).save(root / "page.png")
            Image.fromarray(np.zeros((100, 80), dtype=np.uint8)).save(root / "page.mask.png")
            annotation = {
                "systems": [
                    {
                        "normalizedBBox": {"x": 0.25, "y": 0.2, "width": 0.5, "height": 0.3},
                        "staffLinePolylines": [],
                    }
                ]
            }
            (root / "page.json").write_text(json.dumps(annotation), encoding="utf-8")
            dataset = LayoutDataset(
                root,
                [{"imagePath": "page.png", "maskPath": "page.mask.png"}],
                (40, 50),
            )

            image, staff_mask, system_mask = dataset[0]

            self.assertEqual(image.shape, (1, 50, 40))
            self.assertEqual(staff_mask.shape, (1, 50, 40))
            self.assertEqual(system_mask.shape, (1, 50, 40))
            self.assertGreater(float(system_mask.sum()), 0)
            self.assertEqual(float(system_mask[:, :5].sum()), 0)


if __name__ == "__main__":
    unittest.main()
