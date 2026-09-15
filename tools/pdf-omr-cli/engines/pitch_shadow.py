"""Bounded source-only diatonic evidence; never imports model or experiment code."""

import hashlib
import json
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


def extract_page(width, height, lines, glyphs, curves, raster):
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
        boundaries = [sum(g) / len(g) for g in clusters(candidates, gap * .5)]
        if len(boundaries) < 2 or abs(boundaries[0] - left) > 1 or abs(boundaries[-1] - right) > 1:
            return reject("incomplete-barlines")
        # Narrow prefix/double bars require semantic classification; do not silently drop an interval.
        if any(b - a < 4 * gap for a, b in zip(boundaries, boundaries[1:])):
            return reject("ambiguous-barlines")
        for measure, (a, b) in enumerate(zip(boundaries, boundaries[1:])):
            for staff, stave in enumerate([upper, lower]):
                t, g, _, _ = stave
                regions.append((system, staff, measure, a, b, t, g))
                measures.append({"systemIndex": system, "staffIndex": staff, "measureIndex": measure,
                                 "reason": "supported", "heads": []})
    clefs = {}
    for font, char, x, y in sorted(glyphs, key=lambda item: item[2]):
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
        elif char not in {"\ue4e3", "\ue4e4", "\ue4e5", "\ue4e6", "\ue4e7", "\ue4e8", "\ue4e9", "\ue1e7"}:
            # Unknowns and accidentals are not interpreted; even suggestions remain diatonic-only.
            measures[i]["reason"] = "unsupported-notation"
    for i, (_, _, _, a, b, top, gap) in enumerate(regions):
        if any(x0 < b and x1 > a and y0 < top + 7 * gap and y1 > top - 3 * gap
               for x0, y0, x1, y1 in curves):
            measures[i]["reason"] = "source-curve"
    return {"reason": "supported", "measures": measures}


def extract_pdf(path):
    import fitz

    with open(path, "rb") as stream:
        data = stream.read()
    pages = []
    with fitz.open(stream=data, filetype="pdf") as document:
        if len(document) > 32:
            raise ValueError("page-limit")
        for page in document:
            drawings = page.get_drawings()
            lines = [(p.x, p.y, q.x, q.y) for d in drawings for item in d["items"]
                     if item[0] == "l" for p, q in [item[1:]]]
            curves = [list(d["rect"]) for d in drawings if any(item[0] == "c" for item in d["items"])]
            blocks = page.get_text("rawdict")["blocks"]
            glyphs = [(s["font"], c["c"], *c["origin"]) for b in blocks if "lines" in b
                      for line in b["lines"] for s in line["spans"] for c in s["chars"]]
            raster = bool(page.get_images()) or any(b["type"] == 1 for b in blocks)
            pages.append(extract_page(page.rect.width, page.rect.height, lines, glyphs, curves, raster)
                         if page.rotation == 0 else {"reason": "rotated-page", "measures": []})
    return {"schemaVersion": "1.0.0", "inputSha256": hashlib.sha256(data).hexdigest(),
            "extractorVersion": fitz.VersionBind, "pages": pages}


if __name__ == "__main__":
    print(json.dumps(extract_pdf(sys.argv[1]), allow_nan=False))
