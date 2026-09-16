"""Bounded source-only written-pitch evidence; never imports model or experiment code."""

import hashlib
import json
import re
import sys


def clusters(values, tolerance):
    groups = []
    for value in sorted(set(values)):
        if groups and value - groups[-1][0] <= tolerance:
            groups[-1].append(value)
        else:
            groups.append([value])
    return groups


def merged(intervals, tolerance):
    ranges = []
    for a, b in sorted(intervals):
        if ranges and a <= ranges[-1][1] + tolerance:
            ranges[-1][1] = max(ranges[-1][1], b)
        else:
            ranges.append([a, b])
    return ranges


def is_repeat_prefix(upper, lower, edges, glyphs):
    if len(edges) < 3 or edges[1][-1] - edges[1][0] < upper[1] * .5:
        return False
    boundary = edges[1][-1]
    for top, gap, left, _ in (upper, lower):
        prefix = [(font, char, x, y) for font, char, x, y in glyphs
                  if left <= x < edges[1][0] and top - 2 * gap <= y <= top + 6 * gap]
        # Only an explicit clef/key header plus two source repeat dots licenses dropping this non-musical interval.
        if not any(char in {"\ue050", "\ue062"} for _, char, _, _ in prefix):
            return False
        if any(font not in {"MScore", "Leland"} or char not in {"\ue050", "\ue062", "\ue260", "\ue262"}
               for font, char, _, _ in prefix):
            return False
        dots = [(x, y) for font, char, x, y in glyphs if font in {"MScore", "Leland"} and char == "\ue044"
                and boundary < x < boundary + gap and top < y < top + 4 * gap]
        if len(dots) != 2 or abs(dots[0][0] - dots[1][0]) > .2 * gap:
            return False
        if any(abs(y - expected) > .2 * gap for (_, y), expected in
               zip(sorted(dots, key=lambda p: p[1]), [top + 1.5 * gap, top + 2.5 * gap])):
            return False
    return True


def header_glyphs(staves, glyphs, spans, regions):
    ignored = set()
    # SMuFL U+E000 is a brace; require its source endpoint to match a complete grand staff.
    for upper, lower in zip(staves[::2], staves[1::2]):
        top, gap, left, _ = upper
        bottom = lower[0] + 4 * lower[1]
        ignored.update(g for g in glyphs if g[0] in {"MScore", "Leland"} and g[1] == "\ue000"
                       and left - 2 * gap <= g[2] < left and abs(g[3] - bottom) <= .2 * gap)
    numbered = []
    measure_starts = [sum(1 for system, staff, *_ in regions if system < index and staff == 0)
                      for index in range(len(staves) // 2)]
    for span in spans:
        # Match a complete non-pitch expression, never a prefix that could hide an octave instruction.
        if span["text"].strip().casefold() in {"a tempo", "andantino", "cresc.", "decresc."}:
            ignored.update(span["glyphs"])
            continue
        x0, _, x1, y1 = span["bbox"]
        y = span["glyphs"][0][3] if span["glyphs"] else y1
        for system, (top, gap, left, right) in enumerate(staves[::2]):
            if not top - 3 * gap <= y <= top - gap or not left - 2 * gap <= x0 < right:
                continue
            clefs = [x for font, char, x, yy in glyphs if font in {"MScore", "Leland"}
                     and char in {"\ue050", "\ue062"} and left <= x < left + 5 * gap
                     and top <= yy <= top + 4 * gap]
            if (re.fullmatch(r"[1-9][0-9]*", span["text"].strip()) and clefs
                    and x0 <= left and x1 < min(clefs) + .2 * gap):
                ignored.update(span["glyphs"])
            if (re.fullmatch(r"[1-9][0-9]{0,3}", span["text"].strip()) and clefs
                    and abs(x0 - left) <= .2 * gap and x1 <= left + 3 * gap
                    and abs(y - (top - 2 * gap)) <= .25 * gap and y1 < top - gap):
                number = int(span["text"].strip())
                # Bare octave labels remain ambiguous even at a system's left margin.
                if number not in {8, 15, 22}:
                    numbered.append((system, number - measure_starts[system], span["glyphs"]))
            if re.fullmatch(r"\s*=\s*[1-9][0-9]{0,2}\s*", span["text"]):
                marks = [g for g in glyphs if g[0] in {"BravuraText", "MScore", "Leland"}
                         and g[1] == "\ueca5" and 0 < x0 - g[2] <= 2 * gap and abs(y - g[3]) < .2 * gap]
                if len(marks) == 1:
                    ignored.update([*span["glyphs"], marks[0]])
    # Glyph overhang can cross the clef origin; source bar counts provide independent evidence of numbering.
    if (len(numbered) >= 2 and len({system for system, _, _ in numbered}) == len(numbered)
            and len({offset for _, offset, _ in numbered}) == 1):
        for _, _, chars in numbered:
            ignored.update(chars)
    return ignored


def resolve_alters(measures, regions, glyphs, assigned_accidentals, initial_keys):
    keys = list(initial_keys)
    key_glyphs = set()
    key_by_staff = {}
    for system, staff, measure, left, right, top, gap in regions:
        if measure != 0:
            continue
        clefs = [g for g in glyphs if g[0] in {"MScore", "Leland"} and g[1] in {"\ue050", "\ue062"}
                 and left <= g[2] < left + 5 * gap and top <= g[3] <= top + 4 * gap]
        timed = [g[2] for g in glyphs if g[0] in {"MScore", "Leland"}
                 and g[1] in {"\ue0a3", "\ue0a4", "\ue4e3", "\ue4e4", "\ue4e5", "\ue4e6", "\ue4f4"}
                 and left <= g[2] < right and top - gap <= g[3] <= top + 5 * gap]
        if not clefs or not timed:
            keys[staff] = None
        else:
            clef = min(clefs, key=lambda g: g[2])
            prefix = sorted((g for g in glyphs if len(g[1]) == 1 and 0xE260 <= ord(g[1]) <= 0xE2FF
                             and clef[2] < g[2] < min(timed) - 2.5 * gap
                             and top - gap <= g[3] <= top + 5 * gap), key=lambda g: g[2])
            if prefix and prefix[0][2] < clef[2] + 4 * gap:
                key_glyphs.update(prefix)
                base = 30 if clef[1] == "\ue050" else 18
                positions = [(top + 4 * gap - g[3]) / (gap / 2) for g in prefix]
                steps = "".join("CDEFGAB"[(base + round(p)) % 7] for p in positions)
                sign = -1 if prefix[0][1] == "\ue260" else 1
                order = "BEADGCF" if sign == -1 else "FCGDAEB"
                valid = (len(prefix) <= 7 and steps == order[:len(prefix)]
                         and all(g[0] in {"MScore", "Leland"} and g[1] == prefix[0][1] for g in prefix)
                         and prefix[0][1] in {"\ue260", "\ue262"}
                         and all(abs(p - round(p)) <= .1 for p in positions))
                keys[staff] = sign * len(prefix) if valid else None
        key_by_staff[system, staff] = keys[staff]
    for i, (m, (system, staff, _, left, right, top, gap)) in enumerate(zip(measures, regions)):
        fifths = key_by_staff[system, staff]
        m["keyFifths"] = fifths
        accidentals = [g for g in assigned_accidentals.get(i, []) if g not in key_glyphs]
        explicit = {}
        for accidental in accidentals:
            targets = sorted((h for h in m["heads"] if 0 < h["x"] - accidental[2] <= 3 * gap
                              and abs(h["y"] - accidental[3]) <= .2 * gap), key=lambda h: h["x"])
            if not targets or len(targets) > 1 and targets[1]["x"] - targets[0]["x"] < .5 * gap:
                m["reason"] = "unresolved-accidental"
                continue
            target = (targets[0]["x"], targets[0]["y"])
            if target in explicit:
                m["reason"] = "unresolved-accidental"
            explicit[target] = {"\ue260": -1, "\ue261": 0, "\ue262": 1}[accidental[1]]
        state = {}
        for h in sorted(m["heads"], key=lambda h: h["x"]):
            if (h["x"], h["y"]) in explicit:
                state[h["diatonic"]] = explicit[h["x"], h["y"]]
            key = None if fifths is None else (
                (-1 if fifths < 0 else 1) if "CDEFGAB"[h["diatonic"] % 7] in
                ("BEADGCF" if fifths < 0 else "FCGDAEB")[:abs(fifths)] else 0)
            h["alter"] = state.get(h["diatonic"], key)
        if fifths is None:
            m["reason"] = "unresolved-key"
    # An unmatched accidental may be a mid-system key change, not a local decoration.
    # Its scope is unknown, so do not reuse the old signature elsewhere or on the next page.
    uncertain = {m["staffIndex"] for m in measures if m["reason"] == "unresolved-accidental"}
    for staff in uncertain:
        keys[staff] = None
    for m in measures:
        if m["staffIndex"] in uncertain:
            m["keyFifths"] = None
            if m["reason"] == "supported":
                m["reason"] = "unresolved-key"
            for h in m["heads"]:
                h["alter"] = None
    return keys


def extract_page(width, height, lines, glyphs, curves, raster, text_spans=(), initial_keys=(0, 0)):
    reject = lambda reason: {"reason": reason, "measures": []}
    if raster:
        return reject("raster-content")
    # Require complete long staff lines; fragmented/scanned geometry is not negative evidence.
    horizontal = [(y, min(x, xx), max(x, xx)) for x, y, xx, yy in lines
                  if abs(y - yy) < .2 and abs(x - xx) > 10 and 5 < y < height - 5]
    rows = []
    for group in clusters([h[0] for h in horizontal], .3):
        y = sum(group) / len(group)
        ranges = merged([(a, b) for yy, a, b in horizontal if abs(yy - y) <= .3], 1)
        a, b = max(ranges, key=lambda pair: pair[1] - pair[0])
        if b - a >= width * .6:
            rows.append((y, a, b))
    if not rows or len(rows) % 10:
        return reject("unsupported-staff-layout")
    staves = []
    for i in range(0, len(rows), 5):
        group = rows[i:i + 5]
        gaps = [group[j + 1][0] - group[j][0] for j in range(4)]
        if min(gaps) < 3 or max(gaps) > 8 or max(gaps) - min(gaps) > .3:
            return reject("unsupported-staff-layout")
        staves.append((group[0][0], sum(gaps) / 4, max(r[1] for r in group), min(r[2] for r in group)))
    measures, regions = [], []
    for system in range(len(staves) // 2):
        upper, lower = staves[2 * system:2 * system + 2]
        top, gap, left, right = upper
        bottom = lower[0] + 4 * lower[1]
        if abs(gap - lower[1]) > .3 or lower[0] - (top + 4 * gap) < 4 * gap:
            return reject("unsupported-staff-layout")
        vertical = [(x, min(y, yy), max(y, yy)) for x, y, xx, yy in lines
                    if abs(x - xx) < .2 and abs(y - yy) > 1 and left - 1 <= x <= right + 1]
        candidates = [x for x in sorted(set(v[0] for v in vertical))
                      if any(a <= top + .8 and b >= bottom - .8 for a, b in
                             merged([(a, b) for xx, a, b in vertical if abs(xx - x) <= .8], .8))]
        edges = clusters(candidates, gap * 1.5)
        if len(edges) < 2 or abs(edges[0][0] - left) > .35 * gap or abs(edges[-1][-1] - right) > .35 * gap:
            return reject("incomplete-barlines")
        for edge in edges:
            if edge[-1] - edge[0] > .5 * gap and any(
                edge[0] < x < edge[-1] and top - 4 * gap < y < bottom + 4 * gap and char != "\ue044"
                for _, char, x, y in glyphs
            ):
                return reject("ambiguous-barlines")
        boundaries = [sum(g) / len(g) for g in edges]
        # Stroke centers do not coincide with the outer staff endpoint on thick terminal barlines.
        boundaries[0], boundaries[-1] = left, right
        if is_repeat_prefix(upper, lower, edges, glyphs):
            boundaries.pop(1)
        if any(b - a < 4 * gap for a, b in zip(boundaries, boundaries[1:])):
            return reject("ambiguous-barlines")
        for measure, (a, b) in enumerate(zip(boundaries, boundaries[1:])):
            for staff, stave in enumerate([upper, lower]):
                t, g, _, _ = stave
                regions.append((system, staff, measure, a, b, t, g))
                measures.append({"systemIndex": system, "staffIndex": staff, "measureIndex": measure,
                                 "reason": "supported", "heads": []})
    ignored = header_glyphs(staves, glyphs, text_spans, regions)
    for span in text_spans:
        if span["glyphs"] and all(g in ignored for g in span["glyphs"]):
            continue
        if any(0xE000 <= ord(c) <= 0xF8FF for c in span["text"]):
            continue
        x0, y0, x1, y1 = span["bbox"]
        if any(x0 < right and x1 > left and y0 < top + 7 * gap and y1 > top - 3 * gap
               for top, gap, left, right in staves):
            return reject("unsupported-notation")
    clefs = {}
    assigned_accidentals = {}
    # SMuFL non-pitch alphabet, verified against metadata/glyphnames.json; no ottava or accidental ranges.
    non_pitch = {"\ue044", "\ue240", "\ue241", "\ue4a0", "\ue4a1", "\ue4a2", "\ue4a3", "\ue4c0",
                 "\ue4e3", "\ue4e4", "\ue4e5", "\ue4e6", "\ue4e7", "\ue4e8", "\ue4e9", "\ue4f4", "\ue1e7"}
    non_pitch.update(chr(value) for value in range(0xE080, 0xE08A))
    # https://smufl.formats.music/latest/tables/dynamics.html defines E520-E549, including composed mf/pp.
    non_pitch.update(chr(value) for value in range(0xE520, 0xE54A))
    for font, char, x, y in sorted(glyphs, key=lambda item: item[2]):
        if (font, char, x, y) in ignored or font in {"MScore", "Leland"} and char in non_pitch:
            continue
        musical = font in {"MScore", "Leland"} or (len(char) == 1 and 0xE000 <= ord(char) <= 0xF8FF)
        if not musical:
            # Text within a staff may be tuplets, ottava, or other unsupported pitch/timing instructions.
            for i, (_, _, _, a, b, top, gap) in enumerate(regions):
                if a <= x < b and top - 3 * gap <= y <= top + 7 * gap:
                    return reject("unsupported-notation")
            continue
        near = sorted((abs(y - (t + 2 * g)), i) for i, (_, _, _, a, b, t, g) in enumerate(regions)
                      if a <= x < b)
        if not near or near[0][0] > 6 * regions[near[0][1]][6]:
            return reject("unassigned-glyph")
        distance, i = near[0]
        system, staff, _, _, _, top, gap = regions[i]
        if len(near) > 1 and near[1][0] - distance < gap:
            return reject("ambiguous-staff")
        if font not in {"MScore", "Leland"}:
            return reject("unsupported-font")
        if char in {"\ue050", "\ue062"}:
            offset, base = (3, 30) if char == "\ue050" else (1, 18)
            if abs(y - (top + offset * gap)) > .25 * gap:
                return reject("unresolved-clef")
            clefs[(system, staff)] = base
        elif len(char) == 1 and 0xE050 <= ord(char) <= 0xE07F:
            return reject("unresolved-clef")
        elif char in {"\ue0a3", "\ue0a4"}:
            base = clefs.get((system, staff))
            if base is None:
                return reject("unresolved-clef")
            offset = (top + 4 * gap - y) / (gap / 2)
            if abs(offset - round(offset)) > .1 or not 0 <= base + round(offset) < 70:
                return reject("off-grid-head")
            measures[i]["heads"].append({"x": x, "y": y, "gap": gap, "diatonic": base + round(offset)})
        elif char in {"\ue260", "\ue261", "\ue262"}:
            assigned_accidentals.setdefault(i, []).append((font, char, x, y))
        else:
            # Unknown pitch instructions (e.g. ottava) can extend beyond the containing measure.
            return reject("unsupported-notation")
    end_keys = resolve_alters(measures, regions, glyphs, assigned_accidentals, initial_keys)
    for i, (_, _, _, a, b, top, gap) in enumerate(regions):
        if any(x0 < b and x1 > a and y0 < top + 7 * gap and y1 > top - 3 * gap
               for x0, y0, x1, y1 in curves):
            measures[i]["reason"] = "source-curve"
    return {"reason": "supported", "measures": measures, "endKeys": end_keys}


def drawing_lines(drawings):
    # A dashed expression line exposes its full extent as one PDF line, not continuous staff ink.
    return [(p.x, p.y, q.x, q.y) for d in drawings
            if re.fullmatch(r"\[\s*\]\s+\S+", d.get("dashes") or "")
            for item in d["items"] if item[0] == "l" for p, q in [item[1:]]]


def extract_pdf(path):
    import fitz

    with open(path, "rb") as stream:
        data = stream.read()
    pages = []
    keys = (0, 0)
    with fitz.open(stream=data, filetype="pdf") as document:
        if len(document) > 32:
            raise ValueError("page-limit")
        for page in document:
            drawings = page.get_drawings()
            lines = drawing_lines(drawings)
            curves = [list(d["rect"]) for d in drawings if any(item[0] == "c" for item in d["items"])]
            blocks = page.get_text("rawdict")["blocks"]
            glyphs = [(s["font"], c["c"], *c["origin"]) for b in blocks if "lines" in b
                      for line in b["lines"] for s in line["spans"] for c in s["chars"]]
            text_spans = [{"text": "".join(c["c"] for c in s["chars"]), "bbox": s["bbox"],
                           "glyphs": [(s["font"], c["c"], *c["origin"]) for c in s["chars"]]}
                          for b in blocks if "lines" in b for line in b["lines"] for s in line["spans"]]
            raster = bool(page.get_images()) or any(b["type"] == 1 for b in blocks)
            evidence = (extract_page(page.rect.width, page.rect.height, lines, glyphs, curves, raster, text_spans, keys)
                        if page.rotation == 0 else {"reason": "rotated-page", "measures": []})
            keys = evidence.pop("endKeys", [None, None])
            pages.append(evidence)
    return {"schemaVersion": "1.0.0", "inputSha256": hashlib.sha256(data).hexdigest(),
            "extractorVersion": fitz.VersionBind, "pages": pages}


if __name__ == "__main__":
    print(json.dumps(extract_pdf(sys.argv[1]), allow_nan=False))
