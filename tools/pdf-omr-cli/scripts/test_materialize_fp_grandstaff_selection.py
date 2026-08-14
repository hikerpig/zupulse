import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("materialize_fp_grandstaff_selection.py")
SPEC = importlib.util.spec_from_file_location("materialize_fp_grandstaff_selection", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

INVENTORY_SCRIPT = Path(__file__).with_name("build_fp_grandstaff_inventory.py")
INVENTORY_SPEC = importlib.util.spec_from_file_location("build_fp_grandstaff_inventory_fixture", INVENTORY_SCRIPT)
INVENTORY_MODULE = importlib.util.module_from_spec(INVENTORY_SPEC)
assert INVENTORY_SPEC.loader is not None
INVENTORY_SPEC.loader.exec_module(INVENTORY_MODULE)


class MaterializeFpGrandstaffSelectionTest(unittest.TestCase):
    def test_restores_kern_and_materializes_pdf_musicxml(self) -> None:
        row = {
            "rowIndex": 0,
            "imageBytes": b"source-image",
            "imagePath": "0.png",
            "transcription": "**ekern\t**ekern\n=1\t=1\n4@C·L\t4@c·J\n*-\t*-\n",
        }
        entry = INVENTORY_MODULE.build_entries([row], "val", "a" * 64)[0]
        inventory = {"schemaVersion": "1.0.0", "release": {}, "fullPages": [entry]}
        selection = {
            "profiles": {
                "standard-development": {"items": [{"itemId": entry["item"]["id"]}]},
                "standard-holdout": {"items": []},
            }
        }
        converted = []

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "output"
            result = MODULE.materialize(
                inventory,
                selection,
                output,
                load_image=lambda _split, _index: b"source-image",
                decode_image=lambda _bytes: (2, 2, bytes([255, 255, 255, 255])),
                convert_kern=lambda kern: converted.append(kern) or b"<score-partwise/>",
            )

            item = result["fullPages"][0]["item"]
            self.assertTrue((output / item["input"]["path"]).read_bytes().startswith(b"%PDF-1.4"))
            self.assertEqual((output / item["groundTruth"]["path"]).read_bytes(), b"<score-partwise/>")
            self.assertEqual(
                (output / item["groundTruth"]["path"]).with_name("truth.krn").read_text(encoding="utf-8"),
                "**kern\t**kern\n=1\t=1\n4CL\t4cJ\n*-\t*-\n",
            )

        self.assertEqual(converted, ["**kern\t**kern\n=1\t=1\n4CL\t4cJ\n*-\t*-\n"])

    def test_rejects_selected_image_hash_drift(self) -> None:
        row = {
            "rowIndex": 0,
            "imageBytes": b"expected",
            "imagePath": "0.png",
            "transcription": "**ekern\t**ekern\n=1\t=1\n*-\t*-\n",
        }
        entry = INVENTORY_MODULE.build_entries([row], "test", "b" * 64)[0]
        selection = {
            "profiles": {
                "standard-development": {"items": []},
                "standard-holdout": {"items": [{"itemId": entry["item"]["id"]}]},
            }
        }

        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "source image hash mismatch"):
                MODULE.materialize(
                    {"schemaVersion": "1.0.0", "release": {}, "fullPages": [entry]},
                    selection,
                    Path(temporary) / "output",
                    load_image=lambda _split, _index: b"drift",
                    decode_image=lambda _bytes: (1, 1, b"\xff"),
                    convert_kern=lambda _kern: b"<score-partwise/>",
                )


if __name__ == "__main__":
    unittest.main()
