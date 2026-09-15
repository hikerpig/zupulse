import hashlib
import json
from pathlib import Path
import fitz
from polyphonic_timing_v2 import clean_line_inventory

root = Path("tools/pdf-omr-cli/reports/development")
out = root / "legato-polyphonic-recovery-v2-20260914"
shape = root / "legato-polyphonic-shape-v1-20260914/evidence.json"
source = root / "legato-rhythm-tail-v1-20260914/source.json"
pdfs = {w: root / f"piano-recognition-v1-20260905/{w}.pdf" for w in ["score-4", "score-9"]}
files = [shape, source, *pdfs.values(), Path(__file__), Path(__file__).with_name("polyphonic_timing_v2.py"),
         Path(__file__).with_name("test_polyphonic_timing_v2.py")]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
out.mkdir(exist_ok=False)
def write(name, value):
    with (out / name).open("x") as stream:
        json.dump(value, stream, indent=2)
write("source-protocol.json", {"hashes": hashes, "referenceReads": 0, "modelCalls": 0,
                              "rule": "Frozen three-head polyphonic shape plus complete finite glyph inventory without local accidentals, no page images, and only first-painted white background within one point of the page bounds or thin axis-line paths intersecting the cell. Under this controlled-vector assumption, the undotted hollow up-head lasts 1/2, dotted hollow down-head 3/4 and unflagged/unbeamed black up-head 1/4. No measure-closure duration inference. Candidate key signature remains a separately declared anchor for new-note alteration."})
glyph_rows = json.loads(source.read_text())["rows"]
documents = {w: fitz.open(p) for w, p in pdfs.items()}
rows = []
for row in json.loads(shape.read_text())["rows"]:
    if row["result"]["status"] != "shape-only":
        continue
    cell = next(r for r in glyph_rows if all(r[k] == row[k] for k in ["work", "staff", "measure"]))
    no_accidentals = not any(g[1] in {"\ue260", "\ue261", "\ue262"} for g in cell["glyphs"])
    page = documents[row["work"]][row["page"] - 1]
    clean = clean_line_inventory(row["pathInventory"], list(page.rect), min(h["gap"] for h in row["result"]["heads"]), row["imageCount"])
    rows.append({"work": row["work"], "staff": row["staff"], "measure": row["measure"],
                 "supported": clean and no_accidentals, "cleanPaths": clean, "noLocalAccidentals": no_accidentals,
                 "movingPitches": row["result"]["movingPitches"], "sustainedPitch": row["result"]["sustainedPitch"]})
for document in documents.values():
    document.close()
assert all(digest(Path(p)) == h for p, h in hashes.items())
write("source.json", {"sourcesUnchanged": True, "rows": rows})
print(json.dumps(rows))
