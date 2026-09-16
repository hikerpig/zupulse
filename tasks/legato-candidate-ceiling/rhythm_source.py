"""Freeze complete staff-cell glyph evidence before rhythm candidate generation."""
import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path
from rhythm_source_evidence import source_events

root = Path("tools/pdf-omr-cli/reports/development")
out = root / "legato-rhythm-tail-v1-20260914"
prior = root / "legato-count-alignment-v1-20260913/harness"
head_path = root / "legato-accidental-evidence-v1-20260914/evidence.json"
beam_path = root / "legato-beam-evidence-v1-20260914/evidence.json"
curve_path = root / "legato-curve-endpoints-v1-20260914/evidence.json"
files = [Path(__file__), Path(__file__).with_name("rhythm_source_evidence.py"),
         Path(__file__).with_name("test_rhythm_source_evidence.py"), head_path, beam_path, curve_path,
         prior / "audit.py", prior / "align_counts.py",
         root / "legato-repeat-region-v1-20260913/harness/audit.py",
         root / "legato-repeat-region-v1-20260913/harness/repeat_prefix.py",
         Path("tools/pdf-omr-cli/reports/exploratory/legato-page-coverage-v1.md"),
         *[root / f"piano-recognition-v1-20260905/{w}.pdf" for w in ["score-4", "score-9"]]]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
out.mkdir(exist_ok=False)
with (out / "source-protocol.json").open("x") as stream:
    json.dump({"hashes": hashes, "referenceReads": 0, "modelCalls": 0,
               "rule": "All staff-measure cells bounded by source barlines and midpoints of adjacent staff centers. Complete glyph-origin inventory; finite MScore/Leland alphabet only, no dots/flags/digits/unknown glyphs, no source curve rectangles intersecting cell. Require head coverage and strictly separated sequential events. Only quarter-rest glyph accepted. Controlled-vector assumption, not scanned or arbitrary font support; does not infer duration for unbeamed heads."}, stream, indent=2)
sys.path.insert(0, str(prior))
namespace = {"__file__": str(prior / "audit.py")}
with contextlib.redirect_stdout(io.StringIO()):
    exec((prior / "audit.py").read_text().split('print(json.dumps({"alignerSha256"', 1)[0], namespace)
heads = json.loads(head_path.read_text())["results"]
beams = json.loads(beam_path.read_text())["results"]
curves = json.loads(curve_path.read_text())["results"]
rows = []
work, offset = None, 0
for line in namespace["output"].getvalue().splitlines():
    layout = json.loads(line)
    if "source" in layout:
        work, offset = layout["source"], 0
        continue
    page = layout["page"]
    select = lambda items: next(r for r in items if r["summary"]["work"] == work and r["summary"]["page"] == page)
    page_heads, page_beams, page_curves = select(heads)["notes"], select(beams)["observations"], select(curves)["paths"]
    centers = sorted((top + 2 * s["gap"], si, staff) for si, s in enumerate(layout["systems"]) for staff, top in enumerate(s["staffTops"]))
    for si, system in enumerate(layout["systems"]):
        xs = system["x"][int(system["repeatPrefix"]):]
        for local in range(len(xs) - 1):
            for staff in [0, 1]:
                ci = next(i for i, (_, s, st) in enumerate(centers) if (s, st) == (si, staff))
                y0 = (centers[ci - 1][0] + centers[ci][0]) / 2 if ci else -1e6
                y1 = (centers[ci + 1][0] + centers[ci][0]) / 2 if ci + 1 < len(centers) else 1e6
                x0, x1 = xs[local:local + 2]
                glyphs = [g for g in layout["glyphs"] if x0 <= g[2] < x1 and y0 <= g[3] < y1]
                measure = offset + local
                hs = [h for h in page_heads if h["measure"] == measure and h["staff"] == staff]
                has_curve = any(r["rect"][0] < x1 and r["rect"][2] > x0 and r["rect"][1] < y1 and r["rect"][3] > y0 for r in page_curves)
                result = source_events(glyphs, hs, page_beams, has_curve)
                rows.append({"work": work, "page": page, "staff": staff, "measure": measure,
                             "cell": [x0, y0, x1, y1], "glyphs": glyphs, **result})
        offset += len(xs) - 1
assert all(digest(Path(p)) == h for p, h in hashes.items())
with (out / "source.json").open("x") as stream:
    json.dump({"sourcesUnchanged": True, "rows": rows}, stream, indent=2)
for work in ["score-4", "score-9"]:
    selected = [r for r in rows if r["work"] == work]
    print(json.dumps({"work": work, "measures": len(selected), "safeSourceSequence": sum(r["safe"] for r in selected)}))
