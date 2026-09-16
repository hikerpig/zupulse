"""Source-only shape proposal followed by reference-assisted diagnostics."""
import hashlib
import json
from collections import Counter
from pathlib import Path
import fitz
from polyphonic_shape import identify_shape

root = Path("tools/pdf-omr-cli/reports/development")
out = root / "legato-polyphonic-shape-v1-20260914"
inputs = {"source": root / "legato-rhythm-tail-v1-20260914/source.json",
          "heads": root / "legato-accidental-evidence-v1-20260914/evidence.json",
          "stems": root / "legato-beam-evidence-v1-20260914/evidence.json",
          "curves": root / "legato-curve-endpoints-v1-20260914/evidence.json"}
pdfs = {w: root / f"piano-recognition-v1-20260905/{w}.pdf" for w in ["score-4", "score-9"]}
files = [*inputs.values(), *pdfs.values(), Path(__file__), Path(__file__).with_name("polyphonic_shape.py"),
         Path(__file__).with_name("test_polyphonic_shape.py")]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
out.mkdir(exist_ok=False)
def write(name, value):
    with (out / name).open("x") as stream:
        json.dump(value, stream, indent=2)
write("protocol.json", {"hashes": hashes, "modelCalls": 0, "referenceReads": 0, "candidateEdits": 0,
                        "rule": "All cells. Exactly two simultaneous hollow heads with distinct up/down stems, one later black head with distinct up stem, one uniquely lower-owned dot; finite glyph inventory, no curve. Shape only, no duration or alteration inferred.",
                        "geometryAudit": "For shape-only matches, inventory all source paths intersecting the cell and page image count. Do not turn an unknown beam classification into a quarter-note assertion."})
data = {k: json.loads(p.read_text()) for k, p in inputs.items()}
documents = {w: fitz.open(p) for w, p in pdfs.items()}
rows = []
for cell in data["source"]["rows"]:
    select = lambda key: next(r for r in data[key]["results"]
                             if r["summary"]["work"] == cell["work"] and r["summary"]["page"] == cell["page"])
    heads = [h for h in select("heads")["notes"] if h["staff"] == cell["staff"] and h["measure"] == cell["measure"]]
    x0, y0, x1, y1 = cell["cell"]
    intersects = lambda r: r[0] < x1 and r[2] > x0 and r[1] < y1 and r[3] > y0
    curves = [p for p in select("curves")["paths"] if intersects(p["rect"])]
    result = identify_shape(cell["glyphs"], heads, select("stems")["observations"], bool(curves))
    row = {k: cell[k] for k in ["work", "page", "staff", "measure", "cell"]}
    row["result"] = result
    if result["status"] == "shape-only":
        page = documents[cell["work"]][cell["page"] - 1]
        # Include zero-width stems and zero-height staff lines in the diagnostic inventory.
        paths = [{"id": i, "rect": list(p["rect"]), "type": p["type"], "fill": p["fill"],
                  "width": p["width"], "items": [v[0] for v in p["items"]]}
                 for i, p in enumerate(page.get_drawings())
                 if p["rect"][0] <= x1 and p["rect"][2] >= x0 and p["rect"][1] <= y1 and p["rect"][3] >= y0]
        row["pathInventory"] = paths
        row["imageCount"] = len(page.get_images(full=True))
    rows.append(row)
for document in documents.values():
    document.close()
assert len(rows) == 224
assert all(digest(Path(p)) == h for p, h in hashes.items())
summary = [{"work": w, "statuses": dict(Counter(r["result"].get("reason", r["result"]["status"])
             for r in rows if r["work"] == w))} for w in pdfs]
write("evidence.json", {"sourcesUnchanged": True, "summary": summary, "rows": rows})
print(json.dumps(summary))
print(json.dumps([{k: r[k] for k in ["work", "staff", "measure", "imageCount"]}
                  for r in rows if r["result"]["status"] == "shape-only"]))
