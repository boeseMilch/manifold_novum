"""Rounded-corner polygon helper (2D), adapted from models/ship/shiplib.py _fillet (closed polygons)."""
def fillet(pts, rad, steps=6):
    out = []
    n = len(pts)
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        d1 = (a[0] - b[0], a[1] - b[1]); d2 = (c[0] - b[0], c[1] - b[1])
        l1 = (d1[0] ** 2 + d1[1] ** 2) ** 0.5; l2 = (d2[0] ** 2 + d2[1] ** 2) ** 0.5
        r = min(rad, l1 * 0.45, l2 * 0.45)
        p1 = (b[0] + d1[0] / l1 * r, b[1] + d1[1] / l1 * r); p2 = (b[0] + d2[0] / l2 * r, b[1] + d2[1] / l2 * r)
        for k in range(steps + 1):
            t = k / steps
            out.append((p1[0] * (1 - t) ** 2 + b[0] * 2 * t * (1 - t) + p2[0] * t * t, p1[1] * (1 - t) ** 2 + b[1] * 2 * t * (1 - t) + p2[1] * t * t))
    return out
