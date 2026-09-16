def identify_shape(glyphs, heads, stems, has_curve):
    reject = lambda reason: {"status": "rejected", "reason": reason}
    if has_curve:
        return reject("curve")
    allowed = {"\ue0a3", "\ue0a4", "\ue1e7", "\ue260", "\ue261", "\ue262"}
    if any(font not in {"MScore", "Leland"} or char not in allowed for font, char, _, _ in glyphs):
        return reject("glyph")
    dots = [g for g in glyphs if g[1] == "\ue1e7"]
    note_glyphs = [g for g in glyphs if g[1] in {"\ue0a3", "\ue0a4"}]
    if len(heads) != 3 or len(note_glyphs) != 3 or len(dots) != 1 or not all(h["valid"] for h in heads):
        return reject("inventory")
    notes = sorted(heads, key=lambda h: (h["x"], h["y"]))
    gap = min(h["gap"] for h in notes)
    if gap <= 0:
        return reject("gap")
    for h in notes:
        if sum(abs(g[2] - h["x"]) < .001 and abs(g[3] - h["y"]) < .001
               and ord(g[1]) == int(h["glyph"], 16) for g in note_glyphs) != 1:
            return reject("head-correspondence")
    upper, lower, later = notes
    if (abs(upper["x"] - lower["x"]) > .1 * gap or later["x"] - lower["x"] <= 2 * gap
            or lower["y"] - upper["y"] < gap
            or [h["glyph"] for h in notes] != ["0xe0a3", "0xe0a3", "0xe0a4"]):
        return reject("shape")
    assigned = []
    for h in notes:
        matches = [s for s in stems if "x" in s and abs(s["x"] - h["x"]) < .001 and abs(s["y"] - h["y"]) < .001]
        if len(matches) != 1 or matches[0].get("layers") is not None or matches[0].get("direction") not in {"up", "down"}:
            return reject("stem")
        assigned.append(matches[0])
    if [s["direction"] for s in assigned] != ["up", "down", "up"] or len({s["stemIndex"] for s in assigned}) != 3:
        return reject("voice-direction")
    dot = dots[0]
    owners = [i for i, h in enumerate(notes) if gap <= dot[2] - h["x"] <= 2.5 * gap and abs(dot[3] - h["y"]) <= .25 * gap]
    if owners != [1]:
        return reject("dot-owner")
    # A unique stem with no supported beam is not evidence that no beam exists.
    return {"status": "shape-only", "movingPitches": [upper["pitch"], later["pitch"]],
            "sustainedPitch": lower["pitch"], "heads": notes, "dot": dot,
            "stemIndices": [s["stemIndex"] for s in assigned], "completeTimingEvidence": False}
