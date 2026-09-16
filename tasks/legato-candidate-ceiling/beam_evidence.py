import math


def beam_polygon(points, gap):
    if gap <= 0 or len(points) != 4 or not all(math.isfinite(v) for p in points for v in p):
        return None
    xs = sorted(set(p[0] for p in points))
    if len(xs) != 2 or xs[1] - xs[0] < .5 * gap:
        return None
    left = sorted(y for x, y in points if x == xs[0])
    right = sorted(y for x, y in points if x == xs[1])
    if len(left) != 2 or len(right) != 2:
        return None
    widths = [left[1] - left[0], right[1] - right[0]]
    if not all(.25 * gap <= w <= .75 * gap for w in widths) or abs(widths[0] - widths[1]) > .05 * gap:
        return None
    if abs(right[0] - left[0]) / (xs[1] - xs[0]) > .5:
        return None
    return xs[0], xs[1], left[0], right[0], sum(widths) / 2


def beam_layers(stem, direction, polygons, gap):
    if direction not in {"up", "down"} or gap <= 0:
        return None
    x, top, bottom, _ = stem
    contacts = []
    for index, points in enumerate(polygons):
        beam = beam_polygon(points, gap)
        if beam is None:
            continue
        x0, x1, y0, y1, thickness = beam
        if not x0 - .15 * gap <= x <= x1 + .15 * gap:
            continue
        y = y0 + (y1 - y0) * (min(max(x, x0), x1) - x0) / (x1 - x0)
        if y + thickness < top - .3 * gap or y > bottom + .3 * gap:
            continue
        contacts.append((y, y + thickness, index))
    if not contacts:
        return None
    contacts.sort(reverse=direction == "down")
    outer = contacts[0][0 if direction == "up" else 1]
    tip = top if direction == "up" else bottom
    if abs(outer - tip) > .3 * gap:
        return None
    # Missing levels or duplicate paths are unknown, not permission to infer a shorter note.
    for a, b in zip(contacts, contacts[1:]):
        if not .6 * gap <= abs(b[0] - a[0]) <= .9 * gap:
            return None
        if min(a[1], b[1]) >= max(a[0], b[0]):
            return None
    return [c[2] for c in contacts]
