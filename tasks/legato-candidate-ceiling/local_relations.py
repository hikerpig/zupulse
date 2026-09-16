"""Local positive dot ownership, not a complete rhythmic transcription."""
import math
from fractions import Fraction


def dot_relations(glyphs, heads, stems):
    dots = [g for g in glyphs if g[1] == "\ue1e7"]
    allowed = {"\ue0a3", "\ue0a4", "\ue1e7", "\ue260", "\ue261", "\ue262"}

    def owns(head, dot):
        gap = head["gap"]
        return (math.isfinite(gap) and gap > 0 and gap <= dot[2] - head["x"] <= 2.5 * gap
                and abs(dot[3] - head["y"]) <= .6 * gap)

    rows = []
    for dot in dots:
        row = {"dot": dot, "status": "rejected"}
        rows.append(row)
        # Invalid nearby heads still compete: dropping them would create false uniqueness.
        owners = [h for h in heads if owns(h, dot)]
        if len(owners) != 1:
            row["reason"] = "dot-owner"
            continue
        head = owners[0]
        x, y, gap = head["x"], head["y"], head["gap"]
        row["head"] = head
        inventory = [g for g in glyphs if abs(g[2] - x) < .001 and abs(g[3] - y) < .001
                     and hex(ord(g[1])) == head["glyph"]]
        if not head["valid"] or len(inventory) != 1:
            row["reason"] = "head-inventory"
            continue
        if sum(owns(head, other) for other in dots) != 1:
            row["reason"] = "multiple-dots"
            continue
        local = [g for g in glyphs if x - .5 * gap <= g[2] <= dot[2] + .5 * gap and abs(g[3] - y) <= gap]
        if any(g[0] not in {"MScore", "Leland"} or g[1] not in allowed for g in local):
            row["reason"] = "local-glyph"
            continue
        matches = [s for s in stems if abs(s["x"] - x) < .001 and abs(s["y"] - y) < .001]
        if len(matches) != 1 or matches[0].get("direction") not in {"up", "down"}:
            row["reason"] = "stem"
            continue
        row.update(status="supported", stem=matches[0])
    return rows


def dotted_duration(relation, layers, clean_paths, possible_tuplet):
    if relation["status"] != "supported" or not clean_paths or possible_tuplet:
        return None
    glyph = relation["head"]["glyph"]
    if glyph == "0xe0a3" and layers is None:
        return 3, 4
    if glyph == "0xe0a4" and layers and 1 <= len(layers) <= 4:
        return 3, 8 * 2 ** len(layers)
    return None


def select_duration(measure, alternatives, relation, heads):
    reject = lambda reason: {"reason": reason}
    if relation["status"] != "supported" or not relation.get("duration"):
        return reject("unknown-duration")
    pitch = relation["head"].get("pitch")
    if pitch is None or sum(h.get("pitch") == pitch for h in heads) != 1:
        return reject("source-correspondence")

    def natural(event):
        p = event.get("writtenPitch")
        return None if event["type"] != "note" or p is None else p["octave"] * 7 + "CDEFGAB".index(p["step"])

    def value(rational):
        return Fraction(rational["numerator"], rational["denominator"])

    def matches(m):
        return [(v, e) for v in m["voices"] for e in v["events"] if natural(e) == pitch]

    current = matches(measure)
    if len(current) != 1:
        return reject("candidate-correspondence")
    voice, event = current[0]
    if "tie" in event or "tuplet" in event:
        return reject("protected-event")
    target = Fraction(*relation["duration"])
    if value(event["duration"]) == target:
        return reject("already-supported")
    admitted = []
    for index, alternative in enumerate(alternatives):
        notes = matches(alternative)
        if len(notes) != 1:
            continue
        other = notes[0][1]
        if ("tie" not in other and "tuplet" not in other and other["writtenPitch"] == event["writtenPitch"]
                and value(other["onset"]) == value(event["onset"]) and value(other["duration"]) == target):
            admitted.append(index)
    if not admitted:
        return reject("no-existing-candidate")
    start, end = value(event["onset"]), value(event["onset"]) + target
    if "duration" not in measure or end > value(measure["duration"]):
        return reject("timing-conflict")
    if any(e is not event and value(e["onset"]) < end
           and value(e["onset"]) + value(e["duration"]) > start for e in voice["events"]):
        return reject("timing-conflict")
    return {"reason": "proposed", "eventId": event["id"], "alternatives": admitted,
            "duration": {"numerator": target.numerator, "denominator": target.denominator}}
