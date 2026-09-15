def stem_candidates(head, lines, gap):
    left, y, right = head
    if gap <= 0:
        raise ValueError("invalid-staff-gap")
    candidates = []
    for index, (x, top, bottom, width) in enumerate(lines):
        if not 2 * gap <= bottom - top <= 12 * gap or not 0 < width <= .2 * gap:
            continue
        # A chord can share one stem; the stem endpoint need not touch every head.
        if abs(x - right) <= .15 * gap and top <= y - 2 * gap and bottom >= y - .3 * gap:
            candidates.append((index, "up"))
        if abs(x - left) <= .15 * gap and bottom >= y + 2 * gap and top <= y + .3 * gap:
            candidates.append((index, "down"))
    return candidates
