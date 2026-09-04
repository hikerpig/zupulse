#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from validate_layout_diagnostic_truth import canonical_json, validate_diagnostic_truth


def mapping() -> dict[str, object]:
    return {
        "schemaVersion": "1.0.0",
        "workId": "42",
        "pages": [
            {
                "samplePage": 1,
                "systems": [
                    {"sampleVariant": "p1-s1", "sourceSystem": 1},
                    {"sampleVariant": "p1-s2", "sourceSystem": 2},
                ],
            }
        ],
    }


class ValidateLayoutDiagnosticTruthTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.corpus_root = Path(self.temporary_directory.name)
        work_root = self.corpus_root / "dev" / "42"
        work_root.mkdir(parents=True)
        mapping_bytes = canonical_json(mapping())
        (work_root / "source-mapping.json").write_bytes(mapping_bytes)
        self.truth = {
            "schemaVersion": "1.0.0",
            "reviewBasis": "human-visible-five-line-staff-count",
            "items": [
                {
                    "workId": "42",
                    "sourceMappingSha256": hashlib.sha256(mapping_bytes).hexdigest(),
                    "pages": [
                        {
                            "samplePage": 1,
                            "systems": [
                                {"sampleVariant": "p1-s1", "visibleStaffCount": 3},
                                {"sampleVariant": "p1-s2", "visibleStaffCount": 2},
                            ],
                        }
                    ],
                }
            ],
        }

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_accepts_exact_coverage_and_returns_canonical_summary(self) -> None:
        summary = validate_diagnostic_truth(self.truth, self.corpus_root)

        self.assertEqual(summary, {"itemCount": 1, "pageCount": 1, "systemCount": 2})
        self.assertEqual(canonical_json(summary), canonical_json(summary))

    def test_rejects_missing_duplicate_out_of_range_and_hash_drift(self) -> None:
        mutations = []

        missing = json.loads(json.dumps(self.truth))
        missing["items"][0]["pages"][0]["systems"].pop()
        mutations.append(missing)

        duplicate = json.loads(json.dumps(self.truth))
        duplicate["items"][0]["pages"][0]["systems"][1]["sampleVariant"] = "p1-s1"
        mutations.append(duplicate)

        out_of_range = json.loads(json.dumps(self.truth))
        out_of_range["items"][0]["pages"][0]["systems"][0]["visibleStaffCount"] = 4
        mutations.append(out_of_range)

        hash_drift = json.loads(json.dumps(self.truth))
        hash_drift["items"][0]["sourceMappingSha256"] = "0" * 64
        mutations.append(hash_drift)

        for value in mutations:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_diagnostic_truth(value, self.corpus_root)


if __name__ == "__main__":
    unittest.main()
