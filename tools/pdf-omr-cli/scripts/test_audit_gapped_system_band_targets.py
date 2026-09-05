#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from audit_gapped_system_band_targets import audit_page


class AuditGappedSystemBandTargetsTest(unittest.TestCase):
    def test_records_side_by_side_pages_as_excluded_without_a_merged_mask(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image_path = root / "page.png"
            Image.new("L", (80, 100), 255).save(image_path)
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

            record = audit_page(
                root,
                {"imagePath": "page.png", "pageIndex": 0, "scoreId": "side-by-side"},
            )

            self.assertEqual(record["status"], "excluded")
            self.assertNotIn("gappedMaskSha256", record)


if __name__ == "__main__":
    unittest.main()
