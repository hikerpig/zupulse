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
from train_layout_topology_segmenter import (
    MODEL_SIZE,
    LayoutTopologyDataset,
    build_model,
    initialize_from_two_head_state,
)


def _staff(center: float) -> list[list[dict[str, float]]]:
    return [
        [{"x": 0.1, "y": center + offset}, {"x": 0.9, "y": center + offset}]
        for offset in (-0.02, -0.01, 0, 0.01, 0.02)
    ]


class TrainLayoutTopologySegmenterTest(unittest.TestCase):
    def test_model_emits_system_and_staff_row_logits(self) -> None:
        model = build_model("compact-layout-row-energy-v1")

        output = model(torch.zeros((2, 1, 96, 64), dtype=torch.float32))

        self.assertEqual(tuple(output.shape), (2, 4, 96))

    def test_initializes_count_channels_from_system_head_and_preserves_staff_head(self) -> None:
        model = build_model("compact-layout-row-energy-v1")
        source = model.state_dict()
        source["row_head.weight"] = torch.stack(
            (torch.full((8, 1), 2.0), torch.full((8, 1), 3.0))
        )
        source["row_head.bias"] = torch.tensor([5.0, 7.0])

        initialize_from_two_head_state(model, source)

        self.assertTrue(torch.all(model.row_head.weight[:3] == 2))
        self.assertTrue(torch.all(model.row_head.weight[3] == 3))
        self.assertEqual(model.row_head.bias.tolist(), [5.0, 5.0, 5.0, 7.0])

    def test_dataset_builds_energy_targets_and_reports_incompatible_train_pages(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = Image.fromarray(np.full((32, 24), 255, dtype=np.uint8), mode="L")
            pages = []
            for score_id, centers in (("valid", [0.25, 0.65]), ("invalid", [0.25, 0.25])):
                image_path = Path(f"{score_id}.png")
                image.save(root / image_path)
                systems = [
                    {
                        "staffCount": 1,
                        "normalizedBBox": {"x": 0.1, "y": center - 0.05, "width": 0.8, "height": 0.1},
                        "staffLinePolylines": _staff(center),
                    }
                    for center in centers
                ]
                (root / image_path.with_suffix(".json")).write_text(json.dumps({"systems": systems}))
                pages.append({"scoreId": score_id, "pageIndex": 0, "imagePath": str(image_path)})

            dataset = LayoutTopologyDataset(root, pages, MODEL_SIZE, allow_incompatible=True)

            self.assertEqual(len(dataset), 1)
            self.assertEqual(dataset.excluded_pages[0]["scoreId"], "invalid")
            image_tensor, target = dataset[0]
            self.assertEqual(tuple(image_tensor.shape), (1, MODEL_SIZE[1], MODEL_SIZE[0]))
            self.assertEqual(tuple(target.shape), (4, MODEL_SIZE[1]))


if __name__ == "__main__":
    unittest.main()
