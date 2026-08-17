import importlib.util
import tempfile
import unittest
import zlib
from pathlib import Path
from struct import pack


SCRIPT = Path(__file__).with_name("build_olimpic_system_inventory.py")
SPEC = importlib.util.spec_from_file_location("build_olimpic_system_inventory", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def grayscale_png(width: int = 2, height: int = 2) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return pack(">I", len(payload)) + kind + payload + pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + bytes([255] * width) for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


MUSICXML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><tie type="start"/></note>
    <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><time-modification/></note>
    <barline><repeat direction="forward"/></barline>
  </measure></part>
</score-partwise>
"""


class OlimpicSystemInventoryTest(unittest.TestCase):
    def test_builds_ground_truth_complexity_and_positions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            samples = source / "samples" / "123"
            samples.mkdir(parents=True)
            for stem in ("p1-s1", "p1-s2", "p1-s3"):
                (samples / f"{stem}.png").write_bytes(grayscale_png())
                (samples / f"{stem}.musicxml").write_bytes(MUSICXML)
            (source / "samples.dev.txt").write_text(
                "samples/123/p1-s1\nsamples/123/p1-s2\nsamples/123/p1-s3\n", encoding="utf-8"
            )
            (source / "samples.test.txt").write_text("samples/123/p1-s1\n", encoding="utf-8")

            development = MODULE.build_split_inventory(source, "dev", "a" * 64)

        self.assertEqual([entry["systemPosition"] for entry in development], ["first", "middle", "last"])
        self.assertEqual(
            development[0]["complexity"],
            {
                "noteCount": 2,
                "voiceCount": 2,
                "chordCount": 1,
                "tieCount": 1,
                "tupletCount": 1,
                "repeatCount": 1,
            },
        )
        self.assertEqual(development[0]["item"]["split"], "development")
        self.assertEqual(development[0]["item"]["provenance"]["sampleId"], "123/p1-s1")
        self.assertEqual(
            development[0]["item"]["input"],
            {"path": "assets/olimpic/development/123/p1-s1/input.pdf"},
        )
        self.assertEqual(len(development[0]["source"]["imageSha256"]), 64)

    def test_rejects_a_split_list_with_missing_release_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            (source / "samples.dev.txt").write_text("samples/123/p1-s1\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "missing OLiMPiC asset"):
                MODULE.build_split_inventory(source, "dev", "a" * 64)

    def test_filters_only_items_proven_ready_by_an_exact_audit(self) -> None:
        entries = [{"item": {"id": "ready"}}, {"item": {"id": "blocked"}}]

        filtered = MODULE.filter_ready_entries(
            entries,
            {"items": [{"itemId": "ready", "ready": True}, {"itemId": "blocked", "ready": False}]},
        )

        self.assertEqual(filtered, [{"item": {"id": "ready"}}])
        with self.assertRaisesRegex(ValueError, "does not match inventory"):
            MODULE.filter_ready_entries(entries, {"items": [{"itemId": "ready", "ready": True}]})

    def test_position_supplement_keeps_unselected_middle_and_last_items_from_standard_works(self) -> None:
        def entry(item_id: str, work_id: str, position: str) -> dict:
            return {
                "item": {
                    "id": item_id,
                    "workId": work_id,
                    "provenance": {"sampleId": item_id},
                    "groundTruth": {"sha256": "b" * 64},
                },
                "source": {"imageSha256": "a" * 64},
                "systemPosition": position,
                "complexity": {"noteCount": 1},
            }

        standard = {
            "items": [
                {"itemId": "work-a-last", "workId": "work-a", "stratum": "easy"},
                {"itemId": "work-b-first", "workId": "work-b", "stratum": "hard"},
            ]
        }

        profile = MODULE.build_position_supplement_profile(
            [
                entry("work-a-last", "work-a", "last"),
                entry("work-a-middle", "work-a", "middle"),
                entry("work-b-first", "work-b", "first"),
                entry("outside-middle", "outside", "middle"),
            ],
            standard,
        )

        self.assertEqual([item["itemId"] for item in profile["items"]], ["work-a-middle"])
        self.assertEqual(profile["items"][0]["stratum"], "easy")
        self.assertEqual(profile["counts"]["systemPositions"], {"first": 0, "middle": 1, "last": 0})


if __name__ == "__main__":
    unittest.main()
