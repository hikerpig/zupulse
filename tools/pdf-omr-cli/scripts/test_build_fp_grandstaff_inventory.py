import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_fp_grandstaff_inventory.py")
SPEC = importlib.util.spec_from_file_location("build_fp_grandstaff_inventory", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def row(index: int, measures: int) -> dict[str, object]:
    transcription = "**ekern\t**ekern\n*clefF4\t*clefG2\n" + "\n".join(
        f"={measure}\t={measure}\n4@C\t4@c" for measure in range(1, measures + 1)
    )
    return {
        "rowIndex": index,
        "imageBytes": f"image-{index}".encode(),
        "imagePath": f"{index}.png",
        "transcription": transcription,
    }


class FpGrandstaffInventoryTest(unittest.TestCase):
    def test_builds_locked_candidates_and_measure_density(self) -> None:
        entries = MODULE.build_entries([row(3, 7)], "val", "a" * 64)

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["measureCount"], 7)
        self.assertEqual(entries[0]["item"]["split"], "development")
        self.assertEqual(entries[0]["item"]["provenance"]["sampleId"], "val/3")
        self.assertEqual(entries[0]["source"]["rowIndex"], 3)
        self.assertNotIn("sha256", entries[0]["item"]["input"])

    def test_selects_density_spread_from_val_and_test(self) -> None:
        development = MODULE.build_entries([row(index, index + 1) for index in range(8)], "val", "a" * 64)
        holdout = MODULE.build_entries([row(index, index + 2) for index in range(8)], "test", "b" * 64)

        selection = MODULE.build_selection_document(development, holdout, "a" * 64, "b" * 64)

        self.assertEqual(selection["profiles"]["quick-development"]["counts"], {"items": 2, "works": 2})
        self.assertEqual(selection["profiles"]["standard-development"]["measureCounts"], [1, 3, 6, 8])
        self.assertEqual(selection["profiles"]["standard-holdout"]["measureCounts"], [2, 4, 7, 9])

    def test_filters_only_rows_proven_ready_by_an_exact_audit(self) -> None:
        entries = MODULE.build_entries([row(0, 1), row(1, 2)], "val", "a" * 64)
        audit = {
            "items": [
                {"itemId": entries[0]["item"]["id"], "ready": True},
                {"itemId": entries[1]["item"]["id"], "ready": False},
            ]
        }

        self.assertEqual(MODULE.filter_ready_entries(entries, audit), [entries[0]])


if __name__ == "__main__":
    unittest.main()
