"""Source-only beam-layer audit; no reference reads or candidate edits."""
import hashlib
import json
from pathlib import Path

import fitz
from beam_evidence import beam_layers

root = Path("tools/pdf-omr-cli/reports/development")
out = root / "legato-beam-evidence-v1-20260914"
stem_path = root / "legato-stem-evidence-v1-20260914/evidence.json"
head_path = root / "legato-accidental-evidence-v1-20260914/evidence.json"
works = ["score-4", "score-9"]
files = [Path(__file__), Path(__file__).with_name("beam_evidence.py"),
         Path(__file__).with_name("test_beam_evidence.py"), stem_path, head_path,
         *[root / f"piano-recognition-v1-20260905/{w}.pdf" for w in works]]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
out.mkdir(exist_ok=False)


def write(name, value):
    with (out / f"{name}.json").open("x") as stream:
        json.dump(value, stream, indent=2)


write("protocol", {"hashes": hashes, "modelCalls": 0, "referenceReads": 0, "candidateEdits": 0,
                   "rule": "All pages and heads from frozen source evidence. Unique stems only; black filled closed four-line quadrilaterals; two distinct x coordinates; width >= .5 gap; thickness .25..75 gap, thickness drift <= .05 gap, absolute slope <= .5. Stem contact x tolerance .15 gap; outer edge within .3 gap of tip; level spacing .6..9 gap; overlaps rejected. No supported contact means unknown, not quarter note.",
                   "decision": "Positive beam geometry is evidence only. Reference evaluation follows generation; incorrect accepted layer counts require diagnosis before any rhythm candidate. No default promotion or inference of absent rests, flags, dots, tuplets or ties."})
stems = json.loads(stem_path.read_text())["results"]
heads = json.loads(head_path.read_text())["results"]
results = []
for row in stems:
    work, number = row["summary"]["work"], row["summary"]["page"]
    source = next(r for r in heads if r["summary"]["work"] == work and r["summary"]["page"] == number)
    document = fitz.open(root / f"piano-recognition-v1-20260905/{work}.pdf")
    page = document[number - 1]
    polygons, path_ids = [], []
    for path_id, path in enumerate(page.get_drawings()):
        items = path["items"]
        if path["fill"] != (0., 0., 0.) or len(items) != 4 or any(i[0] != "l" for i in items):
            continue
        if any(items[i][2] != items[(i + 1) % 4][1] for i in range(4)):
            continue
        polygons.append([list(i[1]) for i in items])
        path_ids.append(path_id)
    observations = []
    for head in row["heads"]:
        matches = [h for h in source["notes"] if abs(h["x"] - head["x"]) < .001 and abs(h["y"] - head["y"]) < .001]
        if len(matches) != 1 or not matches[0]["valid"] or head["status"] != "unique":
            observations.append({"head": head, "status": "unknown-source-correspondence"})
            continue
        h = matches[0]
        line_index, direction = head["matches"][0]
        layers = beam_layers(row["lines"][line_index], direction, polygons, h["gap"])
        observations.append({"x": h["x"], "y": h["y"], "pitch": h["pitch"], "staff": h["staff"],
                             "measure": h["measure"], "direction": direction, "stemIndex": line_index,
                             "layers": None if layers is None else [path_ids[i] for i in layers],
                             "status": "unknown-beam" if layers is None else "supported"})
    summary = {"work": work, "page": number, "heads": len(observations),
               "supported": sum(h["status"] == "supported" for h in observations)}
    print(json.dumps(summary))
    results.append({"summary": summary, "observations": observations, "polygons": polygons, "pathIds": path_ids})
    document.close()
assert all(digest(Path(p)) == h for p, h in hashes.items())
write("evidence", {"sourcesUnchanged": True, "recognitionGain": 0, "results": results})
