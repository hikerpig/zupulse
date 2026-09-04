#!/usr/bin/env python3
"""Tests for deterministic OpenScore layout dataset construction."""

from __future__ import annotations

import hashlib
import tempfile
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from build_openscore_layout_dataset import (
    augmentation_seed,
    augment_training_page,
    build_render_jobs,
    build_resvg_command,
    canonicalize_svg_paint_order,
    canonical_json,
    select_staff_bounded_items,
    validate_source_plan,
    verify_manifest_artifacts,
)


def _annotation() -> dict[str, object]:
    lines = []
    for line_index in range(5):
        y = 0.25 + line_index * 0.02
        lines.append([{"x": 0.2, "y": y}, {"x": 0.8, "y": y}])
    return {
        "schemaVersion": "1.0.0",
        "pageIndex": 0,
        "systems": [
            {
                "pageIndex": 0,
                "confidence": 1.0,
                "normalizedBBox": {"x": 0.2, "y": 0.25, "width": 0.6, "height": 0.08},
                "staffCount": 1,
                "staffLinePolylines": lines,
            }
        ],
    }


class BuildOpenScoreLayoutDatasetTest(unittest.TestCase):
    def test_seed_is_stable_and_page_specific(self) -> None:
        first = augmentation_seed(20260829, "4904021", 0)

        self.assertEqual(first, augmentation_seed(20260829, "4904021", 0))
        self.assertNotEqual(first, augmentation_seed(20260829, "4904021", 1))
        self.assertNotEqual(first, augmentation_seed(20260829, "4919673", 0))

    def test_augmentation_is_byte_deterministic_and_transforms_truth(self) -> None:
        pixels = np.full((300, 200), 246, dtype=np.uint8)
        pixels[75:100, 40:161] = 32
        image = Image.fromarray(pixels, mode="L")

        first = augment_training_page(image, _annotation(), seed=1234)
        second = augment_training_page(image, _annotation(), seed=1234)

        self.assertEqual(first.spec, second.spec)
        self.assertEqual(first.image.tobytes(), second.image.tobytes())
        self.assertEqual(first.mask.tobytes(), second.mask.tobytes())
        self.assertEqual(canonical_json(first.annotation), canonical_json(second.annotation))
        self.assertNotEqual(first.annotation, _annotation())
        self.assertEqual(first.image.size, (200, 300))
        self.assertEqual(first.mask.size, (200, 300))
        self.assertGreater(np.count_nonzero(np.asarray(first.mask)), 0)
        for system in first.annotation["systems"]:
            bbox = system["normalizedBBox"]
            self.assertGreaterEqual(bbox["x"], 0)
            self.assertGreaterEqual(bbox["y"], 0)
            self.assertLessEqual(bbox["x"] + bbox["width"], 1)
            self.assertLessEqual(bbox["y"] + bbox["height"], 1)

    def test_different_seed_changes_augmented_raster(self) -> None:
        image = Image.fromarray(np.full((300, 200), 240, dtype=np.uint8), mode="L")

        first = augment_training_page(image, _annotation(), seed=1)
        second = augment_training_page(image, _annotation(), seed=2)

        self.assertNotEqual(
            hashlib.sha256(first.image.tobytes()).hexdigest(),
            hashlib.sha256(second.image.tobytes()).hexdigest(),
        )

    def test_source_plan_requires_exact_split_counts_and_no_protected_ids(self) -> None:
        plan = {
            "corpusId": "openscore-lieder-layout-train-v1",
            "selection": {"excludedEvaluationWorkIds": ["protected"]},
            "items": [
                {"scoreId": "train", "sourcePath": "scores/train.mscx", "split": "train"},
                {"scoreId": "validation", "sourcePath": "scores/validation.mscx", "split": "validation"},
            ],
        }

        items = validate_source_plan(plan, expected_train=1, expected_validation=1)

        self.assertEqual([item["scoreId"] for item in items], ["train", "validation"])
        plan["items"][0]["scoreId"] = "protected"
        with self.assertRaisesRegex(ValueError, "protected evaluation score ID"):
            validate_source_plan(plan, expected_train=1, expected_validation=1)

    def test_render_jobs_have_stable_score_specific_output_roots(self) -> None:
        items = [
            {"scoreId": "a", "sourcePath": "scores/a.mscx", "split": "train"},
            {"scoreId": "b", "sourcePath": "scores/b.mscx", "split": "validation"},
        ]

        jobs = build_render_jobs(items, Path("/source"), Path("/output"))

        self.assertEqual(
            jobs,
            [
                {
                    "in": "/source/scores/a.mscx",
                    "out": ["/output/canonical/train/a/render/page.svg"],
                },
                {
                    "in": "/source/scores/b.mscx",
                    "out": ["/output/canonical/validation/b/render/page.svg"],
                },
            ],
        )

    def test_builds_resvg_command_with_only_bundled_fonts(self) -> None:
        command = build_resvg_command(
            Path("/opt/resvg"), Path("/fonts"), Path("/input/page.svg")
        )

        self.assertEqual(
            command,
            [
                "/opt/resvg",
                "-w",
                "1400",
                "--background",
                "#fff",
                "--skip-system-fonts",
                "--use-fonts-dir",
                "/fonts",
                "--resources-dir",
                "/input",
                "-",
                "-c",
            ],
        )

    def test_canonicalizes_elements_within_class_slots_only(self) -> None:
        first = b"""<svg>\n<path class=\"Note\" d=\"b\"/>\n<rect class=\"StaffLines\"/>\n<path class=\"Note\" d=\"a\"/>\n</svg>\n"""
        second = b"""<svg>\n<path class=\"Note\" d=\"a\"/>\n<rect class=\"StaffLines\"/>\n<path class=\"Note\" d=\"b\"/>\n</svg>\n"""

        canonical = canonicalize_svg_paint_order(first)

        self.assertEqual(canonical, canonicalize_svg_paint_order(second))
        self.assertEqual(
            canonical,
            b"""<svg>\n<path class=\"Note\" d=\"a\"/>\n<rect class=\"StaffLines\"/>\n<path class=\"Note\" d=\"b\"/>\n</svg>\n""",
        )

    def test_excludes_entire_scores_declaring_more_than_three_staves(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source_root = Path(directory)
            items = []
            for score_id, staff_count in [("two", 2), ("three", 3), ("four", 4)]:
                source_path = f"scores/{score_id}.mscx"
                path = source_root / source_path
                path.parent.mkdir(parents=True, exist_ok=True)
                parts = "".join(f'<Part><Staff id="{index + 1}"/></Part>' for index in range(staff_count))
                path.write_text(f"<museScore><Score>{parts}</Score></museScore>", encoding="utf-8")
                items.append({"scoreId": score_id, "sourcePath": source_path, "split": "train"})

            selected, excluded = select_staff_bounded_items(items, source_root, max_staff_count=3)

            self.assertEqual([item["scoreId"] for item in selected], ["two", "three"])
            self.assertEqual([item["declaredStaffCount"] for item in selected], [2, 3])
            self.assertEqual(excluded, {"4": 1})

    def test_verifies_artifact_hashes_and_forbids_validation_augmentation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            variant = {}
            for artifact_name in ["image", "mask", "annotation"]:
                content = artifact_name.encode()
                path = root / f"{artifact_name}.bin"
                path.write_bytes(content)
                variant[f"{artifact_name}Path"] = path.name
                variant[f"{artifact_name}Sha256"] = hashlib.sha256(content).hexdigest()
            manifest = {
                "items": [
                    {
                        "split": "validation",
                        "pages": [{"eligibleForTraining": True, "canonical": variant}],
                    }
                ]
            }

            result = verify_manifest_artifacts(manifest, root)

            self.assertEqual(result, {"eligiblePageCount": 1, "augmentedPageCount": 0, "verifiedFileCount": 3})
            manifest["items"][0]["pages"][0]["augmented"] = variant
            with self.assertRaisesRegex(ValueError, "validation page must not contain augmentation"):
                verify_manifest_artifacts(manifest, root)


if __name__ == "__main__":
    unittest.main()
