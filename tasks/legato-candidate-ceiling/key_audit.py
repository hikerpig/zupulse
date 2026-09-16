import hashlib
import json
from pathlib import Path

from key_evidence import flat_prefix

root = Path("tools/pdf-omr-cli/reports/development")
output = root / "legato-key-evidence-v1-20260914"
evidence_path = root / "legato-accidental-evidence-v1-20260914/evidence.json"
ranges_path = root / "legato-crop-provenance-v1-20260914/source-ranges.json"
references = {w: root / f"piano-recognition-v1-20260905/{w}-baseline-cli/expected.json" for w in ["score-4", "score-9"]}
files = [Path(__file__), Path(__file__).with_name("key_evidence.py"), Path(__file__).with_name("test_key_evidence.py"), evidence_path, ranges_path, *references.values()]
digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
hashes = {str(p): digest(p) for p in files}
output.mkdir(exist_ok=False)


def write(name, value):
    with (output / f"{name}.json").open("x") as stream:
        json.dump(value, stream, indent=2)


write("protocol", {"hashes": hashes, "modelCalls": 0, "candidateEdits": 0,
                   "rule": "Known standard notation only; initial absence of unassigned key glyphs means zero fifths; compact ordered flat prefix before all local noteheads establishes state; late or unresolved symbols make state unknown until a later valid prefix",
                   "boundary": "No note alteration, no accidental-scope inference; save complete states before parsing reference Drafts"})
evidence = json.loads(evidence_path.read_text())["results"]
ranges = json.loads(ranges_path.read_text())
predictions = []
for work in references:
    pages = [p for p in evidence if p["summary"]["work"] == work]
    assert all(not p["summary"]["issues"] for p in pages)
    notes = [n for p in pages for n in p["notes"]]
    symbols = [s for p in pages for s in p["symbols"]]
    total = max(r["range"][1] for r in ranges if r["work"] == work)
    states = [0, 0]
    rows = []
    for measure in range(total):
        for staff in [0, 1]:
            local = [s for s in symbols if s["measure"] == measure and s["staff"] == staff and s["status"] != "attached"]
            reason = "inherited" if measure else "initial-no-signature"
            if local:
                note_xs = [n["x"] for n in notes if n["measure"] == measure and n["staff"] == staff]
                states[staff] = flat_prefix(local, note_xs)
                reason = "flat-prefix" if states[staff] is not None else "unresolved-or-late-signature"
            rows.append({"measure": measure, "staff": staff, "fifths": states[staff], "reason": reason,
                         "unassignedGlyphs": len(local)})
    predictions.append({"work": work, "rows": rows})
write("predictions", predictions)
results = []
for item in predictions:
    reference = json.loads(references[item["work"]].read_text())
    staves = [s for p in reference["parts"] for s in p["staves"]]
    compared, mismatches, abstained = 0, [], []
    for row in item["rows"]:
        if row["fifths"] is None:
            abstained.append([row["measure"], row["staff"]])
            continue
        expected = staves[row["staff"]]["measures"][row["measure"]]["keySignature"]["fifths"]
        compared += 1
        if expected != row["fifths"]:
            mismatches.append({**row, "expected": expected})
    result = {"work": item["work"], "compared": compared, "matched": compared - len(mismatches),
              "mismatches": mismatches, "abstained": abstained}
    results.append(result)
    print(json.dumps(result))
assert all(digest(p) == h for p, h in hashes.items())
write("evaluation", {"sourcesUnchanged": True, "results": results, "correctionValidated": False})
