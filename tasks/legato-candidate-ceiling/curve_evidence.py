def endpoints(curves):
    if len(curves) != 2 or any(len(c) != 4 for c in curves):
        return None
    a, b = curves
    close = lambda p, q: max(abs(p[i] - q[i]) for i in [0, 1]) < .001
    if not close(a[0], b[-1]) or not close(a[-1], b[0]):
        return None
    result = sorted([a[0], a[-1]], key=lambda p: p[0])
    if result[0][0] >= result[1][0]:
        return None
    return result


def endpoint_pairs(points, heads):
    candidates = [[i for i, h in enumerate(heads)
                   if h["valid"] and h["gap"] > 0
                   and abs(x - h["x"]) <= 2 * h["gap"]
                   and abs(y - h["y"]) <= h["gap"]]
                  for x, y in points]
    # Same-pitch geometry is only a possible connection; it cannot distinguish every tie from a slur.
    return [[i, j] for i in candidates[0] for j in candidates[1]
            if heads[i]["x"] < heads[j]["x"] and heads[i]["staff"] == heads[j]["staff"]
            and heads[i]["pitch"] == heads[j]["pitch"]
            and 0 <= heads[j]["measure"] - heads[i]["measure"] <= 1]
