import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("materialize_olimpic_system_selection.py")
SPEC = importlib.util.spec_from_file_location("materialize_olimpic_system_selection", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

INVENTORY_TEST = Path(__file__).with_name("test_build_olimpic_system_inventory.py")
INVENTORY_SPEC = importlib.util.spec_from_file_location("test_build_olimpic_system_inventory_fixture", INVENTORY_TEST)
INVENTORY_MODULE = importlib.util.module_from_spec(INVENTORY_SPEC)
assert INVENTORY_SPEC.loader is not None
INVENTORY_SPEC.loader.exec_module(INVENTORY_MODULE)


class MaterializeOlimpicSelectionTest(unittest.TestCase):
    def test_materializes_only_explicit_profiles(self) -> None:
        selection = {
            "profiles": {
                "standard-development": {"items": [{"itemId": "dev", "stratum": "easy"}]},
                "standard-holdout": {"items": [{"itemId": "holdout", "stratum": "hard"}]},
            }
        }

        self.assertEqual(
            MODULE._selected_strata(selection, ("standard-development",)),
            {"dev": "easy"},
        )

    def test_rejects_unknown_explicit_profile(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing OLiMPiC selection profile"):
            MODULE._selected_strata({"profiles": {}}, ("standard-development",))

    def test_builds_a_development_oracle_manifest_from_materialized_items(self) -> None:
        materialized = {
            "oracleSystems": [
                {
                    "item": {
                        "id": "dev",
                        "split": "development",
                        "category": "olimpic-scanned-system",
                    }
                }
            ]
        }

        manifest = MODULE.build_manifest(materialized, "expanded", "1.0.0")

        self.assertEqual(manifest["corpusId"], "expanded")
        self.assertEqual(manifest["items"][0]["benchmarkSuite"], "oracle-system")

    def test_writes_hash_verified_pdf_and_musicxml_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            sample = source / "samples" / "123"
            sample.mkdir(parents=True)
            (sample / "p1-s1.png").write_bytes(INVENTORY_MODULE.grayscale_png())
            (sample / "p1-s1.musicxml").write_bytes(INVENTORY_MODULE.MUSICXML)
            (source / "samples.dev.txt").write_text("samples/123/p1-s1\n", encoding="utf-8")
            inventory_entry = INVENTORY_MODULE.MODULE.build_split_inventory(source, "dev", "a" * 64)[0]
            inventory = {"schemaVersion": "1.0.0", "release": {}, "oracleSystems": [inventory_entry]}
            selection = {
                "schemaVersion": "1.0.0",
                "profiles": {
                    "standard-development": {
                        "items": [{"itemId": inventory_entry["item"]["id"], "stratum": "easy"}]
                    },
                    "standard-holdout": {"items": []},
                },
            }
            output = root / "output"

            result = MODULE.materialize(source, inventory, selection, output)

            item = result["oracleSystems"][0]["item"]
            self.assertEqual(result["oracleSystems"][0]["selectionStratum"], "easy")
            pdf = output / item["input"]["path"]
            truth = output / item["groundTruth"]["path"]
            self.assertTrue(pdf.read_bytes().startswith(b"%PDF-1.4"))
            self.assertEqual(truth.read_bytes(), INVENTORY_MODULE.MUSICXML)
            self.assertEqual(MODULE.sha256(pdf.read_bytes()), item["input"]["sha256"])
            self.assertEqual(MODULE.sha256(truth.read_bytes()), item["groundTruth"]["sha256"])

    def test_rejects_source_image_hash_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            sample = source / "samples" / "123"
            sample.mkdir(parents=True)
            image = sample / "p1-s1.png"
            image.write_bytes(INVENTORY_MODULE.grayscale_png())
            (sample / "p1-s1.musicxml").write_bytes(INVENTORY_MODULE.MUSICXML)
            (source / "samples.dev.txt").write_text("samples/123/p1-s1\n", encoding="utf-8")
            entry = INVENTORY_MODULE.MODULE.build_split_inventory(source, "dev", "a" * 64)[0]
            image.write_bytes(b"drift")
            selection = {
                "profiles": {
                    "standard-development": {"items": [{"itemId": entry["item"]["id"], "stratum": "easy"}]},
                    "standard-holdout": {"items": []},
                }
            }

            with self.assertRaisesRegex(ValueError, "source image hash mismatch"):
                MODULE.materialize(
                    source,
                    {"schemaVersion": "1.0.0", "release": {}, "oracleSystems": [entry]},
                    selection,
                    root / "output",
                )


if __name__ == "__main__":
    unittest.main()
