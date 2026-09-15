def attach(x, heads, gap):
    if gap <= 0:
        raise ValueError("invalid-staff-gap")
    eligible = [(xx, index) for xx, index in heads if 0 < xx - x <= 3 * gap]
    if not eligible:
        return []
    nearest = min(xx for xx, _ in eligible)
    # A unison can expose multiple heads at one x; do not invent an ownership tie-break.
    return [index for xx, index in eligible if xx == nearest]
