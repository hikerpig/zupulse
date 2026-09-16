def source_events(glyphs, heads, beams, has_curve):
    reject = lambda reason: {"safe": False, "reason": reason, "events": []}
    if has_curve:
        return reject("source-curve")
    # This finite alphabet is a controlled-vector assumption; unknowns never imply absent notation.
    allowed = {"\ue0a3", "\ue0a4", "\ue4e5", "\ue260", "\ue261", "\ue262", "\ue4a2", "\ue4a3", "\ue050", "\ue062"}
    if any(font not in {"MScore", "Leland"} or char not in allowed for font, char, _, _ in glyphs):
        return reject("unsupported-glyph")
    events = []
    for _, char, x, y in glyphs:
        if char == "\ue4e5":
            events.append({"type": "rest", "x": x, "pitch": None, "layers": None, "group": None})
        elif char in {"\ue0a3", "\ue0a4"}:
            matches = [h for h in heads if abs(h["x"] - x) < .001 and abs(h["y"] - y) < .001]
            if len(matches) != 1 or not matches[0]["valid"]:
                return reject("head-correspondence")
            paths = [b for b in beams if b.get("status") == "supported" and abs(b["x"] - x) < .001 and abs(b["y"] - y) < .001]
            if len(paths) > 1:
                return reject("beam-correspondence")
            layers = paths[0]["layers"] if paths else None
            events.append({"type": "note", "x": x, "pitch": matches[0]["pitch"],
                           "layers": len(layers) if layers else None, "group": layers[0] if layers else None})
    if len([e for e in events if e["type"] == "note"]) != len(heads):
        return reject("head-count")
    events.sort(key=lambda e: e["x"])
    gap = min((h["gap"] for h in heads), default=5)
    if any(b["x"] - a["x"] <= .5 * gap for a, b in zip(events, events[1:])):
        return reject("simultaneous-or-ambiguous-events")
    return {"safe": True, "reason": "supported-glyph-sequence", "events": events}
