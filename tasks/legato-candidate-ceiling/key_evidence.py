def flat_prefix(symbols, note_xs):
    ordered = sorted(symbols, key=lambda s: s["x"])
    if not 1 <= len(ordered) <= 7 or any(not s["valid"] or s["alter"] != -1 for s in ordered):
        return None
    if [s["pitch"] % 7 for s in ordered] != [6, 2, 5, 1, 4, 0, 3][:len(ordered)]:
        return None
    if note_xs and ordered[-1]["x"] >= min(note_xs):
        return None
    if any(not .5 * a["gap"] <= b["x"] - a["x"] <= 2 * a["gap"] for a, b in zip(ordered, ordered[1:])):
        return None
    # A late/courtesy signature cannot silently change the state of preceding notes.
    return -len(ordered)
