import math


def clean_line_inventory(paths, page_rect, gap, image_count):
    if image_count != 0 or not math.isfinite(gap) or gap <= 0 or not paths:
        return False
    for p in paths:
        rect = p["rect"]
        if not all(math.isfinite(v) for v in rect):
            return False
        # Require the first-painted background; page boxes can be rounded to whole points.
        if (p.get("id") == 0 and p["fill"] == [1, 1, 1] and p["type"] == "f" and p["items"] == ["l"] * 4
                and all(abs(a - b) <= 1 for a, b in zip(rect, page_rect))):
            continue
        width = p["width"]
        if (p["fill"] is not None or p["type"] != "s" or p["items"] != ["l"]
                or width is None or not math.isfinite(width) or not 0 < width <= .2 * gap + 1e-6
                or min(abs(rect[2] - rect[0]), abs(rect[3] - rect[1])) > 1e-5):
            return False
    return True
