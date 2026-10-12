"""Mock composition of the bridge from the interior kit, every piece at the game's coordinates.

Proves the kit fits the layout in js/ship.js (ROOMS, DOORWAYS, DECK_LOCKS, GUNS, LIGHTS). Plain
Python + PIL (no Blender):   python3 tools/blender/models/interior/mock_bridge.py
Writes /tmp/mn_interior/mock_bridge.png (96 px/unit), mock_bridge_game.png (48 px/unit, game scale)
and mock_bridge_overlay.png (the game's rects drawn on the floor plane over the render).

Placement rule for every sprite: the game point (x, y) on the floor lands at screen pixel
(x * 96, y * sin(50) * 96); the sprite goes there with its manifest (ox, oy).
"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SPR = os.path.join(ROOT, 'build', 'renders')   # the raw renders (tools/blender/mn.py OUT_DIR)
MAN = json.load(open(os.path.join(SPR, 'manifest.json')))
PPU, SIN, COS = 96, math.sin(math.radians(50)), math.cos(math.radians(50))
X0, X1, YG0, YG1 = 12.8, 31.8, -3.4, 16.2                  # game area shown
TOP = (YG0 * SIN - 1.6) * PPU                               # screen px of the canvas top (room for the nose wall)
W, H = int((X1 - X0) * PPU), int(YG1 * SIN * PPU - TOP)
canvas = Image.new('RGBA', (W, H), (24, 26, 32, 255))
_cache = {}

def S(x, y, z=0.0):
    return (x - X0) * PPU, (y * SIN - z * COS) * PPU - TOP

def sprite(name):
    if name not in _cache:
        m = MAN[name]; _cache[name] = (Image.open(os.path.join(SPR, m['files'][0] + '.png')).convert('RGBA'), m)
    return _cache[name]

def put(name, x, y, clip=None, file=None):
    """Draw sprite `name` with its origin at game (x, y). clip = (sx0, sy0, sx1, sy1) screen px."""
    im, m = sprite(name)
    if file: im = Image.open(os.path.join(SPR, file + '.png')).convert('RGBA')
    sx, sy = S(x, y); px, py = round(sx - m['ox']), round(sy - m['oy'])
    if clip:
        cx0, cy0, cx1, cy1 = [round(v) for v in clip]
        a, b = max(0, cx0 - px), max(0, cy0 - py)
        c, d = min(im.width, cx1 - px), min(im.height, cy1 - py)
        if c <= a or d <= b: return
        im = im.crop((a, b, c, d)); px += a; py += b
    if px >= W or py >= H or px + im.width <= 0 or py + im.height <= 0: return
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); layer.paste(im, (px, py))
    canvas.alpha_composite(layer)

R = lambda x0, y0, x1, y1: (x0, y0, x1, y1)
ZONE = lambda x: 'red' if x < 14.2 else 'white' if x < 30.8 else 'blue'

# ---------------------------------------------------------------- floors
FLOORS = [R(0.6, 3.4, 13.6, 11.5), R(14.2, 0.6, 30.2, 11.5), R(18.2, -2.4, 26.2, 0.6), R(30.8, 2.6, 43.8, 11.5),
          R(0.6, 15, 13.6, 23.2), R(14.2, 15, 30.2, 23.9), R(30.8, 15, 43.8, 23.6)]
DOORWAYS = [R(13.6, 6.2, 14.2, 8.4), R(30.2, 5.8, 30.8, 8.0)]
def floor_rect(r, tread=False):
    x0, y0, x1, y1 = r
    clip = (*S(x0, y0), *S(x1, y1))
    for i in range(int(x0 // 2) - 1, int(x1 // 2) + 1):
        for j in range(int(y0 // 2) - 1, int(y1 // 2) + 1):
            name = 'interior/floor_tread' if tread else f"interior/floor_{ZONE(x0 + 0.01)}_{'ab'[(i * 7 + j * 3) % 5 < 2]}"
            put(name, 2 * i, 2 * j, clip)
for r in FLOORS: floor_rect(r)
for r in DOORWAYS: floor_rect(r, True)

# ---------------------------------------------------------------- walls etc., painter's order by front y
items = []
def wall_h(x0, x1, yf):
    def f():
        clip = (S(x0, 0)[0], 0, S(x1, 0)[0], H)
        x = x0
        while x < x1: put('ship/wall_h', x, yf, clip); x += 1
    items.append((yf, f))
PV = MAN['ship/wall_v']['pitch']
def wall_v(cx, y0, y1):
    def f():
        clip = (0, S(0, y0, 1.6)[1], W, S(0, y1, 1.6)[1])
        y = y0
        while y < y1: put('ship/wall_v', cx, y, clip); y += PV
    items.append((y1, f))
def junction(cx, yf, arms):
    items.append((yf + 0.001, lambda: put(f'interior/wall_j_{arms}', cx, yf)))
def door(cx, y0, frame, panels):
    items.append((y0 + 2.4, lambda: (put(frame, cx, y0), put(panels, cx, y0))))

wall_h(12.8, 13.6, 3.4); wall_h(14.2, 17.6, 0.6); wall_h(18.2, 26.2, -2.4); wall_h(26.8, 30.2, 0.6); wall_h(31.1, 31.8, 2.6)
for cx, yf, arms in ((13.9, 0.6, 'es'), (17.9, 0.6, 'nw'), (17.9, -2.4, 'es'), (26.5, -2.4, 'sw'), (26.5, 0.6, 'ne'),
                     (30.5, 0.6, 'sw'), (13.9, 3.4, 'nsw'), (30.5, 2.6, 'nes')):
    junction(cx, yf, arms)
wall_v(17.9, -2.4, 0.0); wall_v(26.5, -2.4, 0.0)
wall_v(13.9, 0.6, 2.8); wall_v(13.9, 3.4, 5.6); wall_v(13.9, 8.6, 12.55)
wall_v(30.5, 0.6, 2.0); wall_v(30.5, 2.6, 5.2); wall_v(30.5, 8.2, 12.55)
door(13.9, 6.2, 'interior/door_v_frame', 'interior/door_v_f2')
door(30.5, 5.8, 'interior/door_v_frame_locked', 'interior/door_v_locked_f0')

LX = 16.7                                                  # middle deck lock (COLS[1].x + 2.5), starts open at the bottom
def spine():
    def tiles(xa, xb):
        clip = (S(xa, 0)[0], 0, S(xb, 0)[0], H)
        k = math.floor((xa - 0.6) / 2)
        while 0.6 + 2 * k < xb:
            put(f"interior/spine_{'ab'[k % 2]}", 0.6 + 2 * k, 15.0, clip); k += 1
    tiles(X0, LX - 0.6); tiles(LX + 2.8, X1)
    put('interior/decklock_bottom', LX, 15.0); put('interior/decklock_topdoor_f0', LX, 15.0); put('interior/decklock_botdoor_f5', LX, 15.0)
items.append((15.0, spine))
items.append((-1.85 + 0.36, lambda: put('interior/gun_ladder', 25.1, -1.85)))

def plaque():                                              # "BRIDGE" on the back wall: label at (q.x + 0.4, q.y + 0.35)
    x, yf, n = 14.6, 0.6, 7
    put('interior/plaque_white_l', x, yf)
    for i in range(n): put('interior/plaque_white_m', x + 18 / 96 + i * 24 / 96, yf)
    put('interior/plaque_white_r', x + 18 / 96 + n * 24 / 96, yf)
    d = ImageDraw.Draw(canvas)
    try: font = ImageFont.truetype('DejaVuSans-Bold.ttf', 22)
    except OSError: font = ImageFont.load_default()
    sx, sy = S(x + 0.12, yf, 0.66)
    d.text((sx, sy), 'B R I D G E', fill=(232, 236, 244, 235), font=font)
items.append((0.61, plaque))
items.sort(key=lambda t: t[0])
for _, f in items: f()
for lx, ly in ((18.5, 4.5), (26.0, 4.5), (22.2, 9.5)):     # LIGHTS in the bridge: drawn last (hanging at 2.0)
    put('interior/lamp_ceiling_on', lx, ly)

os.makedirs('/tmp/mn_interior', exist_ok=True)
canvas.save('/tmp/mn_interior/mock_bridge.png')
canvas.resize((W // 2, H // 2), Image.LANCZOS).save('/tmp/mn_interior/mock_bridge_game.png')
# overlay: the game's shapes on the floor plane
ov = canvas.copy(); d = ImageDraw.Draw(ov)
def rect(r, col, w=2):
    x0, y0, x1, y1 = r; d.rectangle([*S(x0, y0), *S(x1, y1)], outline=col, width=w)
for r in FLOORS: rect(r, (95, 214, 160, 255))
for r in DOORWAYS: rect(r, (255, 200, 60, 255))
rect(R(LX, 12.0, LX + 2.2, 14.5), (120, 190, 255, 255)); rect(R(LX, 11.5, LX + 2.2, 12.0), (255, 120, 255, 255)); rect(R(LX, 14.5, LX + 2.2, 15.0), (255, 120, 255, 255))
rect(R(25.1 - 0.36, -1.85 - 0.36, 25.1 + 0.36, -1.85 + 0.36), (255, 80, 80, 255))
for lx, ly in ((18.5, 4.5), (26.0, 4.5), (22.2, 9.5)):
    sx, sy = S(lx, ly); d.ellipse([sx - 5, sy - 5, sx + 5, sy + 5], outline=(255, 170, 90, 255), width=2)
ov.save('/tmp/mn_interior/mock_bridge_overlay.png')
print('mock', canvas.size)
