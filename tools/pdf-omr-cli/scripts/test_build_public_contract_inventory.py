import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_public_contract_inventory.py")
SPEC = importlib.util.spec_from_file_location("build_public_contract_inventory", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PublicContractInventoryTest(unittest.TestCase):
    def test_clones_five_hash_verified_contracts_per_profile_split(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            items = []
            fixture_ids = ["melody-clean", "melody-low-contrast", "melody-blur", "piano-clean", "piano-low-contrast"]
            for index, fixture_id in enumerate(fixture_ids):
                pdf = f"pdf-{index}".encode()
                truth = f"<score-partwise id='{index}'/>".encode()
                (source / f"input-{index}.pdf").write_bytes(pdf)
                (source / f"truth-{index}.musicxml").write_bytes(truth)
                items.append(
                    {
                        "id": fixture_id,
                        "workId": f"work-{index}",
                        "variantId": "render",
                        "split": "development",
                        "category": "synthetic",
                        "input": {"path": f"input-{index}.pdf", "sha256": hashlib.sha256(pdf).hexdigest()},
                        "groundTruth": {
                            "path": f"truth-{index}.musicxml",
                            "sha256": hashlib.sha256(truth).hexdigest(),
                            "format": "musicxml",
                        },
                        "license": {"id": "CC0-1.0", "source": "https://example.test/license"},
                    }
                )

            inventory, selection = MODULE.build_contracts(items, source, root / "output")

            self.assertEqual(len(inventory["contractItems"]), 10)
            self.assertEqual(
                {item["split"] for item in inventory["contractItems"]},
                {"development", "holdout"},
            )
            self.assertEqual(selection["profiles"]["quick-development"]["counts"]["items"], 2)
            self.assertEqual(
                selection["profiles"]["quick-development"]["sourceFixtureIds"],
                ["melody-blur", "piano-clean"],
            )
            self.assertEqual(selection["profiles"]["standard-development"]["counts"]["items"], 5)
            self.assertEqual(selection["profiles"]["standard-holdout"]["counts"]["items"], 5)
            for item in inventory["contractItems"]:
                self.assertEqual(item["inputScope"], "full-page")
                expected_layout = "single-staff" if item["id"].split("-", 2)[2].startswith("melody-") else "grand-staff"
                self.assertEqual(item["staffLayout"], expected_layout)
                self.assertTrue((root / "output" / item["input"]["path"]).is_file())
                self.assertTrue((root / "output" / item["groundTruth"]["path"]).is_file())


if __name__ == "__main__":
    unittest.main()
