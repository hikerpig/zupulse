import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("prepare_fp_ground_truth_audit.py")
SPEC = importlib.util.spec_from_file_location("prepare_fp_ground_truth_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PrepareFpGroundTruthAuditTest(unittest.TestCase):
    def test_prepares_each_candidate_without_repairing_converter_output(self) -> None:
        entries = [
            {
                "item": {"id": "fp-val-000"},
                "source": {"transcription": "**ekern\t**ekern\n=1\t=1\n4@C·L\t4@c·J\n*-\t*-\n"},
            }
        ]
        converted = []
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            inventory = MODULE.prepare(
                entries,
                output,
                lambda kern: converted.append(kern) or b"<score-partwise/>",
            )

            self.assertEqual((output / "fp-val-000.musicxml").read_bytes(), b"<score-partwise/>")
            self.assertEqual(inventory["oracleSystems"][0]["source"]["groundTruthPath"], "fp-val-000.musicxml")
        self.assertEqual(converted, ["**kern\t**kern\n=1\t=1\n4CL\t4cJ\n*-\t*-\n"])


if __name__ == "__main__":
    unittest.main()
