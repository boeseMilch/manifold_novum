"""Mock-ups: each docked ship composed at the game's coordinates next to our hull outline (python3 + PIL).

    python3 tools/blender/models/dock/mock.py [out_dir]      (default /tmp/mn_dock_mock)

Game scale (48 px per unit), tilted like the sprites: a ground point (x, y) lands at
(x * 48, y * sin(50) * 48). Our hull (js/ship.js HULL) and rooms are drawn flat as outlines; the dock
sprites are pasted at their manifest origins; the game's own shapes are overlaid on top so the fit can be
checked: rooms (cyan), doors (yellow), tube (magenta), crate / core footprints (red), spots (white dots:
entry, tubeMid, npc, alien, fire, black box).
"""
import json, math, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SPR = os.path.join(ROOT, 'build', 'renders')   # the raw renders (tools/blender/mn.py OUT_DIR)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mn_dock_mock'
K = 48; SIN = math.sin(math.radians(50))
MAN = json.load(open(os.path.join(SPR, 'manifest.json')))

SHIP_W = 44.4
HULL = [[17.4, -3.2], [27, -3.2], [30.8, 0], [43.4, 1.6], [44.4, 2.6], [44.4, 4.6], [46, 5.5], [46, 8.5], [44.4, 9.4],
        [44.4, 23.4], [43.4, 24.6], [31.2, 24.6], [30.8, 26.1], [13.6, 26.1], [13.2, 24.1], [1.2, 24.1], [0, 22.9], [0, 9.6],
        [-1.6, 8.6], [-1.6, 5.6], [0, 4.6], [0, 3.4], [1.4, 2.4], [13.8, 2.4], [13.8, 0]]
R = lambda x0, y0, x1, y1: (x0, y0, x1, y1)
OUR_ROOMS = [R(0.6, 3.4, 13.6, 11.5), R(14.2, 0.6, 30.2, 11.5), R(18.2, -2.4, 26.2, 0.6), R(30.8, 2.6, 43.8, 11.5),
             R(0.6, 15, 13.6, 23.2), R(14.2, 15, 30.2, 23.9), R(30.8, 15, 43.8, 23.6)]
HATCH = {'port': (0.0, 19.2), 'star': (44.4, 19.4)}

def dock_geom(side):                     # js/dock.js dockGeom
    y = HATCH[side][1]
    P = [R(-5.6, y - 0.6, 0.7, y + 0.6), R(-10.2, y - 2.4, -5.6, y + 2.4), R(-18.4, y - 4.0, -10.8, y + 4.0),
         R(-25.0, y - 2.8, -19.0, y + 2.8), R(-10.8, y - 0.8, -10.2, y + 0.8), R(-19.0, y - 0.8, -18.4, y + 0.8)]
    M = P if side == 'port' else [R(SHIP_W - q[2], q[1], SHIP_W - q[0], q[3]) for q in P]
    mx = (lambda x: x) if side == 'port' else (lambda x: SHIP_W - x)
    return dict(tube=M[0], rooms=M[1:4], doors=M[4:6], crate=(mx(-14.6), y - 2.6), core=(mx(-23.6), y),
                spots=[(mx(-7.9), y), (mx(-2.5), y), (mx(-16.0), y + 2.4), (mx(-21.5), y - 1.6), (mx(-14.6), y + 1.4), (mx(-22.4), y + 1.8)])

X0, Y0 = -30.0, -6.0                     # world window
X1, Y1 = 74.4, 30.0
def px(x, y): return ((x - X0) * K, (y - Y0) * SIN * K)

def paste(img, name, x, y, frame=None):
    e = MAN.get(name)
    if not e: print('missing', name); return
    f = e['files'][0] if frame is None else e['files'][frame]
    s = Image.open(os.path.join(SPR, f + '.png')).convert('RGBA')
    s = s.resize((round(s.width / 2), round(s.height / 2)), Image.LANCZOS)
    X, Y = px(x, y)
    img.alpha_composite(s, (round(X - e['ox'] / 2), round(Y - e['oy'] / 2)))

def rect(d, q, col, w=2):
    a, b = px(q[0], q[1]), px(q[2], q[3]); d.rectangle([a, b], outline=col, width=w)

def mock(kind, side):
    g = dock_geom(side)
    W, H = round((X1 - X0) * K), round((Y1 - Y0) * SIN * K)
    img = Image.new('RGBA', (W, H), (14, 16, 24, 255)); d = ImageDraw.Draw(img)
    d.polygon([px(x, y) for x, y in HULL], fill=(60, 66, 80, 255), outline=(150, 160, 180, 255))
    for q in OUR_ROOMS: d.rectangle([px(q[0], q[1]), px(q[2], q[3])], fill=(90, 96, 110, 255), outline=(30, 32, 40, 255))
    hx, hy = HATCH[side]
    paste(img, f'dock/{kind}_{side}', hx, hy)
    paste(img, f'dock/tube_{side}', hx, hy)
    if kind == 'derelict':
        paste(img, 'dock/derelict_core', *g['core']); paste(img, 'dock/crate_cargo', *g['crate'])
        q = g['doors'][0]; paste(img, 'dock/door_jammed', (q[0] + q[2]) / 2, (q[1] + q[3]) / 2)
    else:
        paste(img, 'dock/pirate_reactor', *g['core'], frame=0); paste(img, 'dock/crate_loot_full', *g['crate'])
    if '--clean' not in sys.argv:
        d = ImageDraw.Draw(img)
        for q in g['rooms']: rect(d, q, (80, 230, 255, 255))
        for q in g['doors']: rect(d, q, (255, 220, 60, 255))
        rect(d, g['tube'], (255, 80, 220, 255))
        cx, cy = g['crate']; rect(d, (cx - 0.65, cy - 0.5, cx + 0.65, cy + 0.5), (255, 70, 60, 255))
        cx, cy = g['core']; rect(d, (cx - 0.9, cy - 1.1, cx + 0.9, cy + 1.1), (255, 70, 60, 255))
        for x, y in g['spots']:
            X, Y = px(x, y); d.ellipse([X - 4, Y - 4, X + 4, Y + 4], fill=(255, 255, 255, 255))
        X, Y = px(hx, hy); d.ellipse([X - 6, Y - 6, X + 6, Y + 6], outline=(0, 255, 0, 255), width=2)
    # crop to the interesting half
    xs = (-28, 16) if side == 'port' else (28, 72.4)
    a, b = px(xs[0], -5), px(xs[1], 28)
    return img.crop((round(a[0]), round(a[1]), round(b[0]), round(b[1])))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ims = []
    for kind in ('pirate', 'brig', 'derelict'):
        for side in ('port', 'star'):
            im = mock(kind, side); im.save(os.path.join(OUT, f'{kind}_{side}.png')); ims.append(im)
    w, h = ims[0].size
    sheet = Image.new('RGBA', (2 * w + 10, 3 * h + 20), (0, 0, 0, 255))
    for i, im in enumerate(ims): sheet.alpha_composite(im, ((i % 2) * (w + 10), (i // 2) * (h + 10)))
    sheet.save(os.path.join(OUT, 'sheet.png')); print('wrote', OUT)
