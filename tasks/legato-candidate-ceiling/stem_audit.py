import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

import fitz
from stem_evidence import stem_candidates

root = Path("tools/pdf-omr-cli/reports/development")
output = root / "legato-stem-evidence-v1-20260914"
prior = root / "legato-count-alignment-v1-20260913/harness"
xml_paths = [root / "legato-decoder-v1-20260913-r2/score-9/baseline/engine/pages/page-001.musicxml",
             root / "legato-input-fidelity-v1-20260905/score-9-s03/baseline/pages/page-001.musicxml"]
files = [Path(__file__), Path(__file__).with_name("stem_evidence.py"), Path(__file__).with_name("test_stem_evidence.py"),
         prior / "audit.py", root / "legato-repeat-region-v1-20260913/harness/audit.py",
         root / "legato-repeat-region-v1-20260913/harness/repeat_prefix.py",
         Path("tools/pdf-omr-cli/reports/exploratory/legato-page-coverage-v1.md"),
         *[root / f"piano-recognition-v1-20260905/{work}.pdf" for work in ["score-4", "score-9"]], *xml_paths]
digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
output.mkdir(exist_ok=False)


def write(name, value):
    with (output / f"{name}.json").open("x") as stream:
        json.dump(value, stream, indent=2)


write("protocol", {"hashes": hashes, "modelCalls": 0, "referenceReads": 0, "candidateEdits": 0,
                   "interpretation": "source-only stem adjacency evidence; unique geometry is not validated voice identity",
                   "rule": "Known notehead glyphs only; nearest unambiguous physical staff; thin vertical line length 2..12 staff gaps; edge tolerance .15 gap, head contact tolerance .3 gap; no threshold tuning"})
sys.path.insert(0, str(prior))
namespace = {"__file__": str(prior / "audit.py")}
with contextlib.redirect_stdout(io.StringIO()):
    exec((prior / "audit.py").read_text().split('print(json.dumps({"alignerSha256"', 1)[0], namespace)
geometry, work = {}, None
for line in namespace["output"].getvalue().splitlines():
    row = json.loads(line)
    if "source" in row:
        work = row["source"]
        geometry[work] = []
    else:
        geometry[work].append(row)
results = []
for work, pages in geometry.items():
    document = fitz.open(root / f"piano-recognition-v1-20260905/{work}.pdf")
    offset = 0
    for page, layout in zip(document, pages):
        lines = []
        for path in page.get_drawings():
            for item in path["items"]:
                if item[0] != "l":
                    continue
                a, b = item[1:]
                if abs(a.x - b.x) < .01:
                    lines.append((a.x, min(a.y, b.y), max(a.y, b.y), path.get("width", 0)))
        systems = layout["systems"]
        offsets = []
        for system in systems:
            offsets.append(offset)
            offset += system["musicalIntervals"]
        heads = []
        for block in page.get_text("rawdict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    for char in span["chars"]:
                        if char["c"] not in {"\ue0a3", "\ue0a4"}:
                            continue
                        x, y = char["origin"]
                        candidates = sorted((abs(y - (top + 2 * s["gap"])), si, staff)
                                            for si, s in enumerate(systems) for staff, top in enumerate(s["staffTops"]))
                        distance, si, staff = candidates[0]
                        s = systems[si]
                        xs = s["x"][int(s["repeatPrefix"]):]
                        intervals = [i for i in range(len(xs) - 1) if xs[i] <= x < xs[i + 1]]
                        valid = span["font"] in {"MScore", "Leland"} and len(intervals) == 1 and distance <= 6 * s["gap"] and candidates[1][0] - distance >= s["gap"]
                        matches = stem_candidates((x, y, char["bbox"][2]), lines, s["gap"]) if valid else []
                        heads.append({"x": x, "y": y, "staff": staff, "measure": offsets[si] + intervals[0] if valid else None,
                                      "validStaffAssignment": valid, "matches": matches,
                                      "status": "unique" if len(matches) == 1 else "ambiguous" if matches else "unresolved"})
        summary = {"work": work, "page": layout["page"], "heads": len(heads),
                   **{status: sum(h["status"] == status for h in heads) for status in ["unique", "ambiguous", "unresolved"]}}
        results.append({"summary": summary, "lines": lines, "heads": heads})
        print(json.dumps(summary))
xml_inventory = []
for path in xml_paths:
    tree = ET.parse(path)
    xml_inventory.append({"path": str(path), **{name: len(tree.findall(f".//{name}")) for name in ["note", "stem", "slur", "tie"]}})
assert all(digest(p) == h for p, h in hashes.items())
write("evidence", {"sourcesUnchanged": True, "results": results, "xmlInventory": xml_inventory,
                   "voiceAssignmentValidated": False, "recognitionGain": 0})
