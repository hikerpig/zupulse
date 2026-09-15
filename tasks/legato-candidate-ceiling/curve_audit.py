import hashlib
import json
from pathlib import Path

import fitz

from curve_evidence import endpoints, endpoint_pairs

root = Path("tools/pdf-omr-cli/reports/development")
output = root / "legato-curve-endpoints-v1-20260914"
evidence_path = root / "legato-accidental-evidence-v1-20260914/evidence.json"
pilot_protocol = root / "legato-pitch-correction-v1-20260914/protocol.json"
pdfs = {w: root / f"piano-recognition-v1-20260905/{w}.pdf" for w in ["score-4", "score-9"]}
digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
# Reuse exactly the source-head artifact already schema-validated by the frozen pitch pilot.
assert digest(evidence_path) == json.loads(pilot_protocol.read_text())["hashes"][str(evidence_path)]
files = [Path(__file__), Path(__file__).with_name("curve_evidence.py"),
         Path(__file__).with_name("test_curve_evidence.py"), evidence_path, pilot_protocol, *pdfs.values()]
hashes = {str(p): digest(p) for p in files}
output.mkdir(exist_ok=False)


def write(name, value):
    with (output / f"{name}.json").open("x") as stream:
        json.dump(value, stream, indent=2)


write("protocol", {"hashes": hashes, "modelCalls": 0, "referenceReads": 0, "candidateEdits": 0,
                   "rule": "All pages and native curved paths; exactly two cubic curves with reversed coincident endpoints; x-sorted endpoints each within two staff gaps horizontally and one vertically of a valid head; pair only same physical staff, same diatonic pitch, increasing x and same/next measure; keep all pairs, never break ambiguity",
                   "boundary": "Possible same-pitch connection evidence only; unsupported or unresolved paths retained; no absence inference, no tie/slur semantic claim, no pitch or carry changes"})
evidence = json.loads(evidence_path.read_text())["results"]
results = []
for work, pdf in pdfs.items():
    document = fitz.open(pdf)
    pages = sorted([p for p in evidence if p["summary"]["work"] == work], key=lambda p: p["summary"]["page"])
    assert [p["summary"]["page"] for p in pages] == list(range(1, len(document) + 1))
    for page, source in zip(document, pages):
        assert not source["summary"]["issues"]
        heads = source["notes"]
        paths = []
        for index, path in enumerate(page.get_drawings()):
            curves = [[[p.x, p.y] for p in item[1:]] for item in path["items"] if item[0] == "c"]
            if not curves:
                continue
            points = endpoints(curves) if len(path["items"]) == 2 else None
            pairs = endpoint_pairs(points, heads) if points else []
            status = "unsupported" if points is None else "unique" if len(pairs) == 1 else "ambiguous" if pairs else "unresolved"
            paths.append({"index": index, "rect": list(path["rect"]), "curves": curves, "points": points,
                          "status": status, "pairs": pairs,
                          "linkedHeads": [[heads[i], heads[j]] for i, j in pairs]})
        summary = {"work": work, "page": source["summary"]["page"], "curvedPaths": len(paths),
                   **{s: sum(p["status"] == s for p in paths) for s in ["unique", "ambiguous", "unresolved", "unsupported"]}}
        results.append({"summary": summary, "paths": paths})
        print(json.dumps(summary))
assert all(digest(p) == h for p, h in hashes.items())
write("evidence", {"sourcesUnchanged": True, "results": results, "tieSemanticsValidated": False, "safeAbsenceInference": False})
