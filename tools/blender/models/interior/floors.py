"""Deck floor tiles per zone, plus the tread floor for small connectors. Tileable, 2 x 2 layout units.

Same construction as the prototype models/ship/floor.py (one period of an infinite floor: the tile is
built once, copied 5 x 5 times, the camera frames the middle copy, so the PNG tiles seamlessly; the
depth is 1.9989 units so the canvas is a whole 147 px tall). The seams all lie on the 1-unit grid, so
every variant of every zone mixes freely with every other.

The game tints floors by zone (ZONES / zoneAtX in js/ship.js, drawFloors in js/art.js); these come
pre-coloured from the zone tints, and the plates are in the .m.png mask so the game can still shift
them at runtime (vacuum blue, alarm red).

Renders (origin = the tile's top-left corner, game (x0, y0); repeat every 192 x 147 px):
  interior/floor_red_a,   floor_red_b      zone 0 (port column, x < 14.2), tint #7a5f62
  interior/floor_white_a, floor_white_b    zone 1 (centre column),          tint #6c7282
  interior/floor_blue_a,  floor_blue_b     zone 2 (starboard, x >= 30.8),    tint #5f6a80
  interior/floor_tread                     all diamond plate, dark: the small floor rects the game
                                           draws as tread (doorways, airlock door slots; min side < 3)
The tiles are clean: scratches, gouges and duct tape are drawn per tile by the game's shader
(js/gfx.js, FS_SPRITE floor layer), so they don't repeat.
Also writes /tmp/mn_interior/<name>_3x3.png (a 3 x 3 field from Blender) to verify the tiling.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

N = 2
PX_H = round(N * mn.PPU * SIN)                          # 147
DY = PX_H / (mn.PPU * SIN)
SY = DY / N
GAP = 0.035

def hexmul(h, k):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{max(0, min(255, round(v * k))):02x}' for v in c)

ZONES = {'red': '#7a5f62', 'white': '#6c7282', 'blue': '#5f6a80'}
LAYOUTS = {   # (x0, y0, w, h), kind, brightness factor
    'a': [((0, 0, 1, 1), 'plain', 1.03), ((1, 0, 1, 1), 'tread', 1.09), ((0, 1, 1, 1), 'plain', 0.965), ((1, 1, 1, 1), 'plain', 1.0)],
    'b': [((0, 0, 2, 1), 'plain', 0.985), ((0, 1, 1, 1), 'tread', 1.09), ((1, 1, 1, 1), 'grille', 1.02)],
}

def build(PLATES, seed):
    mn.reset()
    rnd = random.Random(seed)
    M = dict(sub=pmat('sub', '#16181d', 0.8), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
             hole=pmat('hole', '#0e1014', 0.9), bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4))
    tile = []
    def T(o): tile.append(o); return o
    T(mn.box('sub', (N, DY, 0.01), loc=(N / 2, -DY / 2, -0.01), m=M['sub'], bevel=0))
    plates = []
    for i, ((px, py, pw, ph), kind, shade) in enumerate(PLATES):
        cx, cy = px + pw / 2, -(py + ph / 2) * SY
        w, h = pw - GAP, ph * SY - GAP
        tread = kind == 'tread'
        m = pmat(f'plate{i}', shade, 0.42 if tread else 0.5, 0.55 if tread else 0.35, grime=0.55, grime_scale=3.5 + rnd.random())
        p = T(mn.box(f'plate{i}', (w, h, 0.035), loc=(cx, cy, 0), m=m, bevel=0.012)); plates.append(p)
        if tread:
            for gx in range(9):
                for gy in range(9):
                    bx = cx - w / 2 + 0.07 + gx * (w - 0.14) / 8; by = cy - h / 2 + 0.07 + gy * (h - 0.14) / 8
                    a = math.radians(45 if (gx + gy) % 2 else -45)
                    plates.append(T(mn.box('lz', (0.095, 0.03, 0.016), loc=(bx, by, 0.035), m=m, bevel=0.01, rot=(0, 0, a))))
            continue
        if kind == 'grille':
            T(mn.box('plate_rim', (0.72, 0.72 * SY, 0.014), loc=(cx, cy, 0.035), m=M['bar'], bevel=0.006))
            T(mn.box('hole', (0.6, 0.6 * SY, 0.006), loc=(cx, cy, 0.036), m=M['hole'], bevel=0))
            for k in range(7):
                T(mn.box('slat', (0.6, 0.035, 0.02), loc=(cx, cy - 0.27 + k * 0.09, 0.036), m=M['bar'], bevel=0.008))
        for sx in (-1, 1):
            for sy in (-1, 1):
                T(mn.sphere('rivet', 0.034, loc=(cx + sx * (w / 2 - 0.07), cy + sy * (h / 2 - 0.07), 0.035), m=M['rivet'], scale=(1, 1, 0.45), segs=12))
        if pw > 1:
            for sy in (-1, 1):
                T(mn.sphere('rivet', 0.034, loc=(cx, cy + sy * (h / 2 - 0.07), 0.035), m=M['rivet'], scale=(1, 1, 0.45), segs=12))
    return tile, plates, M

def render_tile(name, tile, plates):
    mn.tint(*plates)
    mn.outline([o for o in tile if o.name.startswith('plate')], thickness=0.008)
    for ix in range(-2, 3):
        for iy in range(-2, 3):
            if ix == 0 and iy == 0: continue
            for o in tile:
                c = o.copy(); mn.link(c); c.location = (o.location.x + ix * N, o.location.y - iy * DY, o.location.z)
    saved_put, saved_out = mn._manifest_put, mn.OUT_DIR
    mn._manifest_put = lambda *a, **k: None; mn.OUT_DIR = '/tmp/mn_interior'
    render_exact(name.split('/')[1] + '_3x3', -N, 2 * N, -2 * DY * SIN, DY * SIN, passes=('beauty',))
    mn._manifest_put, mn.OUT_DIR = saved_put, saved_out
    render_exact(name, 0, N, -DY * SIN, 0, passes=('beauty', 'normal', 'height', 'mask'),
                 extra={'tile': [N, N], 'note': 'tileable: repeat every w x h px = 2 x 2 layout units; origin = top-left corner. '
                        'All interior/floor_* tiles (and ship/floor*) share the seam grid and mix freely.'})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    for zi, (zone, tint) in enumerate(ZONES.items()):
        for li, (lay, plates_def) in enumerate(LAYOUTS.items()):
            name = f'interior/floor_{zone}_{lay}'
            if only and only not in name: continue
            P = [(r, k, hexmul(tint, f)) for r, k, f in plates_def]
            tile, plates, M = build(P, zi * 10 + li)
            # no baked wear: scuffs, scratches and tape are procedural in the game (js/gfx.js, per tile)
            render_tile(name, tile, plates)
    if not only or only in 'interior/floor_tread':
        P = [((x, y, 1, 1), 'tread', hexmul('#6c7282', 0.82 + 0.04 * ((x + y) % 2))) for x in (0, 1) for y in (0, 1)]
        tile, plates, M = build(P, 99)
        render_tile('interior/floor_tread', tile, plates)
