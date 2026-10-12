"""Deck floor tile: 2 x 2 layout units of riveted steel plates (one treadplate), tileable.

The canvas is exactly one period of an infinite, periodic floor: the tile is built once, copied
5 x 5 times, and the camera frames exactly the middle copy with no margin. So shading, outlines and
relief that cross the tile edge come out right and the PNG tiles seamlessly.

A flat 2-unit square is 2 * 96 * sin(50 deg) = 147.08 px tall on screen; to get an integer canvas
the tile's depth is 147 / (96 sin 50) = 1.9989 units (0.05 % squash, invisible).
Origin (ox, oy) = the tile's top-left corner (game x0, y0). The plates are in the tint mask (.m.png)
so the game can recolor them by zone; seams and rivets are not.

Variants ship/floor and ship/floor_b share the seam grid and mix freely.
Also writes /tmp/mn_ship/floor_3x3.png (and floor_b_3x3.png): a 3 x 3 field rendered in Blender, to verify the tiling.
"""
import sys, os, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
import mn
from shiplib import pmat, render_exact

N = 2                                                    # tile size in units
E = math.radians(mn.ELEVATION)
PX_H = round(N * mn.PPU * math.sin(E))                   # 147
DY = PX_H / (mn.PPU * math.sin(E))                       # tile depth in units (1.9989)
SY = DY / N                                              # y scale for the content
GAP = 0.035                                              # seam width

def plate_mat(name, shade, tread=False):
    return pmat(name, shade, 0.42 if tread else 0.5, 0.55 if tread else 0.35, grime=0.55, grime_scale=3.5)

# Plates per variant: (x0, y0, w, h) in units (game y downwards), kind, shade.
# All seams lie on the 1-unit grid with the same profile, so variants can be mixed freely.
VARIANTS = {
    'ship/floor': [((0, 0, 1, 1), 'plain', '#6f7585'), ((1, 0, 1, 1), 'tread', '#767d8d'),
                   ((0, 1, 1, 1), 'plain', '#686e7e'), ((1, 1, 1, 1), 'plain', '#6c7282')],
    'ship/floor_b': [((0, 0, 2, 1), 'plain', '#6a7080'), ((0, 1, 1, 1), 'tread', '#767d8d'),
                     ((1, 1, 1, 1), 'grille', '#6e7484')],
}

def build(PLATES):
    mn.reset()
    M = dict(sub=pmat('sub', '#16181d', 0.8), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
             hole=pmat('hole', '#0e1014', 0.9), bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4))
    tile = []
    def T(o): tile.append(o); return o
    T(mn.box('sub', (N, DY, 0.01), loc=(N / 2, -DY / 2, -0.01), m=M['sub'], bevel=0))   # shows in the seams
    plates = []
    for i, ((px, py, pw, ph), kind, shade) in enumerate(PLATES):
        cx, cy = px + pw / 2, -(py + ph / 2) * SY
        w, h = pw - GAP, ph * SY - GAP
        m = plate_mat(f'plate{i}', shade, kind == 'tread')
        p = T(mn.box(f'plate{i}', (w, h, 0.035), loc=(cx, cy, 0), m=m, bevel=0.012)); plates.append(p)
        if kind == 'tread':                              # diamond plate: raised lozenges, alternating 45 deg
            for gx in range(9):
                for gy in range(9):
                    bx = cx - w / 2 + 0.07 + gx * (w - 0.14) / 8; by = cy - h / 2 + 0.07 + gy * (h - 0.14) / 8
                    a = math.radians(45 if (gx + gy) % 2 else -45)
                    plates.append(T(mn.box('lz', (0.095, 0.03, 0.016), loc=(bx, by, 0.035), m=m, bevel=0.01, rot=(0, 0, a))))
            continue
        if kind == 'grille':                             # vent: dark opening with slats
            T(mn.box('plate_rim', (0.72, 0.72 * SY, 0.014), loc=(cx, cy, 0.035), m=M['bar'], bevel=0.006))
            T(mn.box('hole', (0.6, 0.6 * SY, 0.006), loc=(cx, cy, 0.036), m=M['hole'], bevel=0))
            for k in range(7):
                T(mn.box('slat', (0.6, 0.035, 0.02), loc=(cx, cy - 0.27 + k * 0.09, 0.036), m=M['bar'], bevel=0.008))
        for sx in (-1, 1):                               # four corner rivets
            for sy in (-1, 1):
                T(mn.sphere('rivet', 0.034, loc=(cx + sx * (w / 2 - 0.07), cy + sy * (h / 2 - 0.07), 0.035), m=M['rivet'], scale=(1, 1, 0.45), segs=12))
        if pw > 1:                                       # long plates get mid rivets too
            for sy in (-1, 1):
                T(mn.sphere('rivet', 0.034, loc=(cx, cy + sy * (h / 2 - 0.07), 0.035), m=M['rivet'], scale=(1, 1, 0.45), segs=12))
    mn.tint(*plates)
    mn.outline([o for o in tile if o.name.startswith('plate')], thickness=0.008)
    for ix in range(-2, 3):                              # 5 x 5 periodic copies (linked data)
        for iy in range(-2, 3):
            if ix == 0 and iy == 0: continue
            for o in tile:
                c = o.copy(); mn.link(c); c.location = (o.location.x + ix * N, o.location.y - iy * DY, o.location.z)

for name, PLATES in VARIANTS.items():
    build(PLATES)
    # Verification: a 3 x 3 field straight from Blender (not tiled by us)
    saved_put, saved_out = mn._manifest_put, mn.OUT_DIR
    mn._manifest_put = lambda *a, **k: None; mn.OUT_DIR = '/tmp/mn_ship'
    render_exact(name.split('/')[1] + '_3x3', -N, 2 * N, -2 * DY * math.sin(E), DY * math.sin(E), passes=('beauty',))
    mn._manifest_put, mn.OUT_DIR = saved_put, saved_out
    render_exact(name, 0, N, -DY * math.sin(E), 0, passes=('beauty', 'normal', 'height', 'mask'),
                 extra={'tile': [N, N], 'note': 'tileable: repeat every w x h px = 2 x 2 layout units; origin = top-left corner. Variants (floor, floor_b) mix freely.'})
