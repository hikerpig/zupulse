#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from layout_detr_targets import OLA_LABELS, LABELS, build_detr_coco_annotation, build_ola_detr_coco_annotation


def _system(*, x: float, y: float, width: float, height: float, staff_count: int) -> dict[str, object]:
    return {
        "staffCount": staff_count,
        "normalizedBBox": {"x": x, "y": y, "width": width, "height": height},
        "staffLinePolylines": [[] for _ in range(staff_count * 5)],
    }


def _ola_system(*, x: float, y: float, width: float, height: float, staff_ys: list[float]) -> dict[str, object]:
    lines = []
    for staff_y in staff_ys:
        for offset in (0.0, 0.01, 0.02, 0.03, 0.04):
            lines.append([{"x": x, "y": staff_y + offset}, {"x": x + width, "y": staff_y + offset}])
    return {
        "staffCount": len(staff_ys),
        "normalizedBBox": {"x": x, "y": y, "width": width, "height": height},
        "staffLinePolylines": lines,
    }


class LayoutDetrTargetsTest(unittest.TestCase):
    def test_builds_hierarchical_system_and_staff_objects(self) -> None:
        annotation = {
            "systems": [
                _ola_system(x=0.5, y=0.1, width=0.4, height=0.2, staff_ys=[0.11, 0.21]),
                _ola_system(x=0.1, y=0.1, width=0.3, height=0.1, staff_ys=[0.12]),
            ]
        }

        target = build_ola_detr_coco_annotation(annotation, image_id=2, image_size=(1000, 500))

        self.assertEqual(OLA_LABELS, ("system", "staff"))
        self.assertEqual(
            [(item["category_id"], [round(value, 6) for value in item["bbox"]]) for item in target["annotations"]],
            [
                (0, [100.0, 50.0, 300.0, 50.0]),
                (1, [100.0, 60.0, 300.0, 20.0]),
                (0, [500.0, 50.0, 400.0, 100.0]),
                (1, [500.0, 55.0, 400.0, 20.0]),
                (1, [500.0, 105.0, 400.0, 20.0]),
            ],
        )
        self.assertEqual([item["id"] for item in target["annotations"]], [2000, 2001, 2002, 2003, 2004])

    def test_ola_target_rejects_invalid_staff_points(self) -> None:
        system = _ola_system(x=0.1, y=0.1, width=0.8, height=0.2, staff_ys=[0.12])
        system["staffLinePolylines"][0][0]["x"] = 1.1

        with self.assertRaisesRegex(ValueError, "staff-line point must be inside the page"):
            build_ola_detr_coco_annotation({"systems": [system]}, image_id=1, image_size=(100, 100))

    def test_builds_sorted_coco_boxes_with_count_conditioned_classes(self) -> None:
        annotation = {
            "systems": [
                _system(x=0.55, y=0.2, width=0.35, height=0.1, staff_count=3),
                _system(x=0.1, y=0.2, width=0.3, height=0.1, staff_count=1),
                _system(x=0.1, y=0.5, width=0.8, height=0.2, staff_count=2),
            ]
        }

        target = build_detr_coco_annotation(annotation, image_id=7, image_size=(1000, 800))

        self.assertEqual(LABELS, ("system-1-staff", "system-2-staff", "system-3-staff"))
        self.assertEqual(target["image_id"], 7)
        self.assertEqual(
            target["annotations"],
            [
                {
                    "area": 24000.0,
                    "bbox": [100.0, 160.0, 300.0, 80.0],
                    "category_id": 0,
                    "id": 7000,
                    "image_id": 7,
                    "iscrowd": 0,
                },
                {
                    "area": 28000.0,
                    "bbox": [550.0, 160.0, 350.0, 80.0],
                    "category_id": 2,
                    "id": 7001,
                    "image_id": 7,
                    "iscrowd": 0,
                },
                {
                    "area": 128000.0,
                    "bbox": [100.0, 400.0, 800.0, 160.0],
                    "category_id": 1,
                    "id": 7002,
                    "image_id": 7,
                    "iscrowd": 0,
                },
            ],
        )

    def test_rejects_bbox_outside_page(self) -> None:
        annotation = {"systems": [_system(x=0.8, y=0.2, width=0.3, height=0.1, staff_count=1)]}

        with self.assertRaisesRegex(ValueError, "normalizedBBox must be inside the page"):
            build_detr_coco_annotation(annotation, image_id=1, image_size=(100, 100))

    def test_rejects_staff_line_topology_mismatch(self) -> None:
        system = _system(x=0.1, y=0.2, width=0.8, height=0.1, staff_count=2)
        system["staffLinePolylines"] = [[] for _ in range(5)]

        with self.assertRaisesRegex(ValueError, "staff-line topology does not match staffCount"):
            build_detr_coco_annotation({"systems": [system]}, image_id=1, image_size=(100, 100))

    def test_rejects_invalid_identifiers_and_image_size(self) -> None:
        annotation = {"systems": []}

        for image_id, image_size in ((-1, (100, 100)), (True, (100, 100)), (1, (0, 100))):
            with self.subTest(image_id=image_id, image_size=image_size), self.assertRaises(ValueError):
                build_detr_coco_annotation(annotation, image_id=image_id, image_size=image_size)


if __name__ == "__main__":
    unittest.main()
