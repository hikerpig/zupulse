"""Convert validated Transcoda **kern output to MusicXML."""

import sys
from pathlib import Path

import converter21
from music21 import converter


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: transcoda-kern-to-musicxml.py <input.krn> <output.musicxml>", file=sys.stderr)
        return 2
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    converter21.register()
    score = converter.parse(input_path, format="humdrum")
    score.write("musicxml", fp=output_path)
    if not output_path.is_file() or output_path.stat().st_size == 0:
        print("converter produced no MusicXML", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
