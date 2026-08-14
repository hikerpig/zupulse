import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_public_pianoform_benchmark.py")
SPEC = importlib.util.spec_from_file_location("build_public_pianoform_benchmark", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def corpus_item(item_id: str, work_id: str, split: str) -> dict[str, object]:
    contract_index = int(item_id.rsplit("-", 1)[1]) if item_id.startswith("contract-") else None
    return {
        "id": item_id,
        "workId": work_id,
        "variantId": "release",
        "split": split,
        "category": "public-fixture",
        "inputScope": "full-page",
        "staffLayout": "single-staff" if contract_index is not None and contract_index < 3 else "grand-staff",
        "input": {"path": f"inputs/{item_id}.png", "sha256": "a" * 64},
        "groundTruth": {"path": f"truth/{item_id}.musicxml", "sha256": "b" * 64, "format": "musicxml"},
        "license": {"id": "CC-BY-SA-4.0", "source": "https://example.test/license"},
    }


def oracle_inventory(split: str) -> list[dict[str, object]]:
    positions = ("first", "middle", "last")
    return [
        {
            "item": {
                **corpus_item(f"olimpic-{split}-{index:02d}", f"olimpic-{split}-work-{index:02d}", split),
                "inputScope": "system-crop",
            },
            "systemPosition": positions[index % len(positions)],
            "complexity": {
                "noteCount": index * 10,
                "voiceCount": 1 + index // 12,
                "chordCount": index,
                "tieCount": index // 2,
                "tupletCount": index // 3,
                "repeatCount": index // 4,
            },
        }
        for index in range(45)
    ]


def full_page_inventory(split: str) -> list[dict[str, object]]:
    return [
        {
            "item": corpus_item(f"fp-{split}-{index:02d}", f"fp-{split}-work-{index:02d}", split),
            "measureCount": index + 1,
        }
        for index in range(8)
    ]


class PublicPianoformBenchmarkTest(unittest.TestCase):
    def test_merges_materialized_suite_inventories(self) -> None:
        merged = MODULE.merge_inventories(
            {"sourceCorpusId": "contract-v1", "contractItems": [{"id": "contract"}]},
            {"release": {"archiveSha256": "a" * 64}, "oracleSystems": [{"id": "oracle"}]},
            {"release": {"revision": "revision"}, "fullPages": [{"id": "full-page"}]},
        )

        self.assertEqual(merged["contractItems"], [{"id": "contract"}])
        self.assertEqual(merged["oracleSystems"], [{"id": "oracle"}])
        self.assertEqual(merged["fullPages"], [{"id": "full-page"}])
        self.assertEqual(merged["release"]["contract"]["sourceCorpusId"], "contract-v1")

    def test_builds_deterministic_quick_and_standard_profiles(self) -> None:
        contracts = [
            corpus_item(f"contract-{split}-{index}", f"contract-{split}-work-{index}", split)
            for split in ("development", "holdout")
            for index in range(5)
        ]
        inventory = {
            "schemaVersion": "1.0.0",
            "release": {"olimpic": "1.0", "fpGrandStaff": "test"},
            "contractItems": contracts,
            "oracleSystems": oracle_inventory("development") + oracle_inventory("holdout"),
            "fullPages": full_page_inventory("development") + full_page_inventory("holdout"),
        }

        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            MODULE.build_profiles(inventory, Path(first))
            MODULE.build_profiles(inventory, Path(second))

            first_files = {path.name: path.read_bytes() for path in Path(first).iterdir()}
            second_files = {path.name: path.read_bytes() for path in Path(second).iterdir()}
            self.assertEqual(first_files, second_files)

            quick = json.loads(first_files["quick-development.manifest.json"])
            development = json.loads(first_files["standard-development.manifest.json"])
            holdout = json.loads(first_files["standard-holdout.manifest.json"])

        self.assertEqual(len(quick["items"]), 10)
        self.assertEqual(len(development["items"]), 45)
        self.assertEqual(len(holdout["items"]), 45)
        self.assertEqual(quick["execution"]["repeatItemIds"], [])
        quick_contracts = [item for item in quick["items"] if item["benchmarkSuite"] == "contract"]
        self.assertEqual([item["staffLayout"] for item in quick_contracts], ["single-staff", "grand-staff"])
        self.assertEqual(len(development["execution"]["repeatItemIds"]), 6)
        self.assertEqual(len(holdout["execution"]["repeatItemIds"]), 6)
        self.assertEqual(
            {item["benchmarkSuite"] for item in quick["items"]},
            {"contract", "oracle-system", "full-page"},
        )
        self.assertTrue({item["id"] for item in quick["items"]}.issubset({item["id"] for item in development["items"]}))

        for manifest in (development, holdout):
            oracle = [item for item in manifest["items"] if item["benchmarkSuite"] == "oracle-system"]
            self.assertEqual(len(oracle), 36)
            self.assertEqual(len({item["workId"] for item in oracle}), 36)
            self.assertTrue(set(manifest["execution"]["repeatItemIds"]).issubset({item["id"] for item in oracle}))

        selection = json.loads(first_files["selection.json"])
        self.assertEqual(selection["profiles"]["quick-development"]["oracleStrata"], {"easy": 2, "medium": 2, "hard": 2})
        self.assertEqual(
            selection["profiles"]["quick-development"]["oracleSystemPositions"],
            {"first": 2, "middle": 2, "last": 2},
        )
        self.assertEqual(
            selection["profiles"]["standard-development"]["oracleStrata"],
            {"easy": 12, "medium": 12, "hard": 12},
        )
        self.assertEqual(
            selection["profiles"]["standard-development"]["oracleSystemPositions"],
            {"first": 12, "middle": 12, "last": 12},
        )

    def test_rejects_work_leakage_between_development_and_holdout(self) -> None:
        contracts = [
            corpus_item(f"contract-{split}-{index}", f"contract-{split}-work-{index}", split)
            for split in ("development", "holdout")
            for index in range(5)
        ]
        development = oracle_inventory("development")
        holdout = oracle_inventory("holdout")
        holdout[0]["item"]["workId"] = development[0]["item"]["workId"]
        inventory = {
            "schemaVersion": "1.0.0",
            "release": {"olimpic": "1.0", "fpGrandStaff": "test"},
            "contractItems": contracts,
            "oracleSystems": development + holdout,
            "fullPages": full_page_inventory("development") + full_page_inventory("holdout"),
        }

        with tempfile.TemporaryDirectory() as output:
            with self.assertRaisesRegex(ValueError, "work crosses development and holdout"):
                MODULE.build_profiles(inventory, Path(output))


if __name__ == "__main__":
    unittest.main()
