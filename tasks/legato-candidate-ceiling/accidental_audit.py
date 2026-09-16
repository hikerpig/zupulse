import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys

from accidental_evidence import attach

root = Path("tools/pdf-omr-cli/reports/development")
output = root / "legato-accidental-evidence-v1-20260914"
prior = root / "legato-count-alignment-v1-20260913/harness"
pitch_path = root / "legato-pitch-alignment-v1-20260914/harness"
files = [Path(__file__), Path(__file__).with_name("accidental_evidence.py"), Path(__file__).with_name("test_accidental_evidence.py"),
         prior / "audit.py", pitch_path / "pitch_features.py", root / "legato-repeat-region-v1-20260913/harness/audit.py",
         root / "legato-repeat-region-v1-20260913/harness/repeat_prefix.py",
         Path("tools/pdf-omr-cli/reports/exploratory/legato-page-coverage-v1.md"),
         *[root / f"piano-recognition-v1-20260905/{w}.pdf" for w in ["score-4", "score-9"]]]
digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
output.mkdir(exist_ok=False)


def write(name, value):
    with (output / f"{name}.json").open("x") as stream:
        json.dump(value, stream, indent=2)


write("protocol", {"hashes": hashes, "modelCalls": 0, "referenceReads": 0, "candidateEdits": 0,
                   "rule": "Known flat/natural/sharp glyphs; same source measure, staff and diatonic pitch; nearest later head within 3 gaps; retain ambiguous or unassigned symbols, no key-signature inference or correction"})
sys.path[:0] = [str(prior), str(pitch_path)]
from pitch_features import diatonic_pitch
namespace = {"__file__": str(prior / "audit.py")}
with contextlib.redirect_stdout(io.StringIO()):
    exec((prior / "audit.py").read_text().split('print(json.dumps({"alignerSha256"', 1)[0], namespace)
results, work, offset = [], None, 0
for line in namespace["output"].getvalue().splitlines():
    row = json.loads(line)
    if "source" in row:
        work, offset = row["source"], 0
        continue
    systems, glyphs = row["systems"], row["glyphs"]
    clefs = [[[], []] for _ in systems]
    issues = []
    for font, char, x, y in glyphs:
        if not 0xE050 <= ord(char) <= 0xE07F:
            continue
        sign = {"\ue050": "G", "\ue062": "F"}.get(char)
        if font not in {"MScore", "Leland"} or sign is None:
            issues.append(["unsupported-clef", x, y])
            continue
        candidates = sorted((abs(y - (top + (3 if sign == "G" else 1) * s["gap"])), si, staff)
                            for si, s in enumerate(systems) for staff, top in enumerate(s["staffTops"]))
        distance, si, staff = candidates[0]
        if distance > .25 * systems[si]["gap"] or candidates[1][0] - distance < .25 * systems[si]["gap"]:
            issues.append(["ambiguous-clef", x, y])
        else:
            clefs[si][staff].append((x, sign))
    offsets = []
    for system in systems:
        offsets.append(offset)
        offset += system["musicalIntervals"]
    notes, symbols = [], []
    for font, char, x, y in glyphs:
        is_head = char in {"\ue0a3", "\ue0a4"}
        if not is_head and not 0xE260 <= ord(char) <= 0xE26F:
            continue
        candidates = sorted((abs(y - (top + 2 * s["gap"])), si, staff)
                            for si, s in enumerate(systems) for staff, top in enumerate(s["staffTops"]))
        distance, si, staff = candidates[0]
        system = systems[si]
        xs, gap = system["x"][int(system["repeatPrefix"]):], system["gap"]
        intervals = [i for i in range(len(xs) - 1) if xs[i] <= x < xs[i + 1]]
        pitch = diatonic_pitch(system["staffTops"][staff], gap, x, y, clefs[si][staff])
        valid = not issues and font in {"MScore", "Leland"} and len(intervals) == 1 and pitch is not None and distance <= 6 * gap and candidates[1][0] - distance >= gap
        observation = {"x": x, "y": y, "glyph": hex(ord(char)), "measure": offsets[si] + intervals[0] if intervals else None,
                       "staff": staff, "pitch": pitch, "gap": gap, "valid": valid}
        (notes if is_head else symbols).append(observation)
    for symbol in symbols:
        symbol["alter"] = {"0xe260": -1, "0xe261": 0, "0xe262": 1}.get(symbol["glyph"])
        possible = [(n["x"], i) for i, n in enumerate(notes) if n["valid"] and all(n[k] == symbol[k] for k in ["measure", "staff", "pitch"])]
        symbol["heads"] = attach(symbol["x"], possible, symbol["gap"]) if symbol["valid"] and symbol["alter"] is not None else []
        symbol["status"] = "attached" if len(symbol["heads"]) == 1 else "ambiguous" if symbol["heads"] else "unassigned"
    summary = {"work": work, "page": row["page"], "symbols": len(symbols), "issues": issues,
               **{status: sum(s["status"] == status for s in symbols) for status in ["attached", "ambiguous", "unassigned"]}}
    results.append({"summary": summary, "notes": notes, "symbols": symbols})
    print(json.dumps(summary))
assert all(digest(p) == h for p, h in hashes.items())
write("evidence", {"sourcesUnchanged": True, "results": results, "safeAbsenceInference": False})
