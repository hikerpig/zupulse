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
from train_layout_segmenter import (
    LayoutDataset,
    build_model,
    pages_compatible_with_system_gap,
    pages_with_training_artifacts,
)


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

    def test_excludes_side_by_side_pages_from_gapped_training(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "page.json").write_text(
                json.dumps(
                    {
                        "systems": [
                            {"normalizedBBox": {"x": 0.05, "y": 0.2, "width": 0.4, "height": 0.2}},
                            {"normalizedBBox": {"x": 0.55, "y": 0.2, "width": 0.4, "height": 0.2}},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            kept, excluded = pages_compatible_with_system_gap(
                root,
                [{"imagePath": "page.json", "pageIndex": 0, "scoreId": "side-by-side"}],
                (512, 768),
                minimum_inter_system_gap_px=8,
            )

            self.assertEqual(kept, [])
            self.assertEqual(excluded[0]["scoreId"], "side-by-side")

    def test_skips_pages_whose_png_or_mask_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.fromarray(np.full((20, 20), 255, dtype=np.uint8)).save(root / "kept.png")
            Image.fromarray(np.zeros((20, 20), dtype=np.uint8)).save(root / "kept.mask.png")
            (root / "kept.json").write_text("{}", encoding="utf-8")
            (root / "missing.json").write_text("{}", encoding="utf-8")
            kept, missing = pages_with_training_artifacts(
                root,
                [
                    {"imagePath": "kept.png", "maskPath": "kept.mask.png", "pageIndex": 0, "scoreId": "kept"},
                    {
                        "imagePath": "missing.png",
                        "maskPath": "missing.mask.png",
                        "pageIndex": 1,
                        "scoreId": "missing",
                    },
                ],
            )

            self.assertEqual([page["scoreId"] for page in kept], ["kept"])
            self.assertEqual(missing[0]["scoreId"], "missing")


if __name__ == "__main__":
    unittest.main()
