"""Contact sheet of every props sprite, plus a mock of the left cannon room's decor at game coordinates.

    python3 tools/blender/models/props/contact.py [outdir]     (default /tmp/mn_props)

Writes <outdir>/props_sheet.png (all sprites at sprite scale, 96 px/unit, animation strips for the
loops) and <outdir>/room_portgun.png (+ _game.png at 48 px/unit): the left cannon room's floor with our
sprites placed by the manifest's ox/oy at the game's coordinates, painter-sorted by game y, and the
game's footprints (FURNITURE rects, crate rects at their angles) overlaid as thin lines to check fit.
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SPR = os.path.join(ROOT, 'build', 'renders')   # the raw renders (tools/blender/mn.py OUT_DIR)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mn_props'
os.makedirs(OUT, exist_ok=True)
MAN = json.load(open(os.path.join(SPR, 'manifest.json')))
PPU = MAN['_meta']['ppu']; E = math.radians(MAN['_meta']['elevation']); SIN = math.sin(E)

def font(sz):
    for f in ('/usr/share/fonts/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def img(stem): return Image.open(os.path.join(SPR, stem + '.png')).convert('RGBA')

# ---------------------------------------------------------------------------
# Contact sheet
# ---------------------------------------------------------------------------
GROUPS = [
    ('The cat', ['cat_sleep', 'cat_flick', 'cat_pet', 'cat_stare', 'cat_hide']),
    ('Crates', ['crate_ammo_port', 'crate_blank_port', 'crate_snax', 'crate_ammo_star', 'crate_misc', 'crate_plates_port',
                'crate_coolant', 'crate_tape', 'crate_plates_star', 'crate_blank_star', 'crate_cargo', 'crate_loot',
                'fuel_crate_3', 'fuel_crate_2', 'fuel_crate_1', 'fuel_crate_0']),
    ('Personality', ['duck_star', 'duck_reactor', 'duck', 'plant', 'pizza', 'donut_box', 'coffee_full', 'coffee_empty',
                     'sticky_yellow', 'sticky_pink', 'papers_bridge', 'papers_maptable', 'socks']),
    ('Tools and junk', ['toolbox', 'wrench', 'extinguisher', 'extinguisher_wall', 'bucket', 'sleeping_bag', 'tape_roll', 'tape_strip', 'tape_x',
                        'nut_r0', 'nut_r1', 'nut_r2', 'nut_r3', 'soda_can', 'wrapper', 'cable_engine_l', 'cable_engine_r',
                        'crack_portgun', 'crack_bridge', 'crack_stargun', 'crack_starlock']),
    ('Furniture', ['kitchen_counter', 'fridge', 'table_kitchen', 'table_kitchen_bare', 'stool', 'bunks', 'lockers', 'couch',
                   'treadmill', 'treadmill_belt', 'toilet_stall', 'toilet', 'plunger', 'magazine',
                   'plaque_hang_in_there', 'plaque_toilet', 'plaque_incident']),
]

def frames_of(name):
    e = MAN.get('props/' + name)
    if not e: return []
    fs = e['files']
    if e['dirs'] > 1 and e['frames'] == 1:                 # directions: show up to 8 spread over the circle
        step = max(1, e['dirs'] // 8); fs = fs[::step][:8]
    return [img(f) for f in fs]

def sheet():
    W = 2400; pad = 14; f1, f2 = font(26), font(14)
    tiles = []
    for title, names in GROUPS:
        tiles.append(('title', title))
        for n in names:
            fr = frames_of(n)
            if fr: tiles.append((n, fr))
    # layout
    x = pad; y = pad; rowh = 0; placed = []
    for t in tiles:
        if t[0] == 'title':
            if x > pad: y += rowh + 34; x = pad; rowh = 0
            placed.append((t, x, y)); y += 40; continue
        n, fr = t; tw = sum(f.width for f in fr) + 4 * (len(fr) - 1); th = max(f.height for f in fr)
        if x + tw > W - pad: x = pad; y += rowh + 34; rowh = 0
        placed.append((t, x, y)); x += tw + 26; rowh = max(rowh, th)
    H = y + rowh + 50
    im = Image.new('RGBA', (W, H), '#3b4150'); d = ImageDraw.Draw(im)
    for t, x, y in placed:
        if t[0] == 'title':
            d.text((x, y), t[1], fill='#ffe08a', font=f1); continue
        n, fr = t; xx = x; th = max(f.height for f in fr)
        for f in fr:
            d.rectangle([xx, y, xx + f.width - 1, y + th - 1], fill='#4d5465')
            im.alpha_composite(f, (xx, y)); xx += f.width + 4
        e = MAN['props/' + n]
        tag = n + (f'  {e["dirs"]} dirs' if e['dirs'] > 1 else '') + (f'  {e["frames"]} fr' if e['frames'] > 1 else '')
        d.text((x, y + th + 4), tag, fill='white', font=f2)
    p = os.path.join(OUT, 'props_sheet.png'); im.convert('RGB').save(p); print(p, im.size)

# ---------------------------------------------------------------------------
# Room mock: left cannon room (portGun), R(0.6, 3.4, 13.6, 11.5)
# ---------------------------------------------------------------------------
def rng(seed):
    s = [seed & 0xffffffff]
    def imul(a, b): return (a * b) & 0xffffffff
    def f():
        s[0] = (s[0] + 0x6D2B79F5) & 0xffffffff; t = s[0]
        t = imul(t ^ (t >> 15), 1 | t); t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return f

ROOM = (0.6, 3.4, 13.6, 11.5)
FURN = {'counter': (6.2, 10.7, 11.0, 11.5), 'fridge': (11.2, 10.3, 12.4, 11.5), 'table': (9.05, 7.75, 10.15, 8.85)}
OTHERS = {'security desk (console agent)': (7.2, 3.4, 8.8, 4.0)}
SOLIDS = [(20.3, 18.0, 24.1, 20.6), (21.3, 5.5, 23.1, 7.3), (21.4, -2.4, 23.0, -1.8), (7.2, 3.4, 8.8, 4.0)] + \
         [(c[0] - 0.8, c[1] - 0.45, c[0] + 0.8, c[1] + 0.45) for c in ((6.6, 22.6), (27.0, 24.9), (37.6, 23.0))] + \
         [(b[0] - 0.4, b[1] - 0.35, b[0] + 0.4, b[1] + 0.35) for b in ((7.0, 15.35), (37.2, 15.35), (22.2, 15.35))] + list(FURN.values())

def junk_portgun():
    """decor.js JUNK for the first room (portGun): the same rng sequence (only nuts are kept)."""
    r = rng(4242); out = []; q = ROOM
    for i in range(14):
        x = q[0] + 0.4 + r() * (q[2] - q[0] - 0.8); y = q[1] + 0.4 + r() * (q[3] - q[1] - 0.8); k = r()
        if math.hypot(x - 22.8, y - 22.75) < 1.6: continue
        if any(S[0] - 0.25 <= x <= S[2] + 0.25 and S[1] - 0.25 <= y <= S[3] + 0.25 for S in SOLIDS): continue
        if k > 0.45: continue
        out.append((x, y, r() * math.tau))
    return out

PLACED = [   # sprite, game x, y   (origins as documented in the scripts)
    ('crack_portgun', 4.6, 6.6, 'floor'),
    ('crate_ammo_port', 11.6, 4.5, None), ('crate_blank_port', 12.8, 4.4, None), ('crate_snax', 12.3, 5.6, None),
    ('table_kitchen', 9.6, 8.3, None), ('stool', 9.6 - 0.85, 8.3 + 0.25, None), ('stool', 9.6 + 0.7, 8.3 - 0.55, None),
    ('kitchen_counter', 8.6, 11.1, None), ('fridge', 11.8, 10.9, None),
    ('cat_sleep', 3.2, 9.6, 'guest'), ('duck', 2.6, 5.2, 'guest'), ('plant', 1.3, 10.8, 'guest'), ('toolbox', 5.5, 4.4, 'guest'),
]
CRATE_RECTS = [(11.6, 4.5, 1.0, 0.9, 0.05), (12.8, 4.4, 0.8, 0.8, -0.1), (12.3, 5.6, 0.9, 0.8, 0.25)]

def room(scale=1.0):
    x0, y0, x1, y1 = ROOM; M = 1.0
    def P(gx, gy): return ((gx - x0 + M) * PPU, (gy - y0 + M) * PPU * SIN)
    W = int((x1 - x0 + 2 * M) * PPU); H = int((y1 - y0 + 2 * M) * PPU * SIN) + 120
    im = Image.new('RGBA', (W, H), '#1d2027')
    tile = None
    for t in ('interior/floor_red_a', 'ship/floor'):
        if os.path.exists(os.path.join(SPR, t + '.png')): tile = img(t); break
    fl = Image.new('RGBA', (int((x1 - x0) * PPU), int((y1 - y0) * PPU * SIN)))
    for ty in range(0, fl.height, tile.height):
        for tx in range(0, fl.width, tile.width): fl.alpha_composite(tile, (tx, ty))
    im.alpha_composite(fl, tuple(int(v) for v in P(x0, y0)))
    d = ImageDraw.Draw(im)
    # the stencil (runtime text, squashed onto the floor like the decals)
    st = Image.new('RGBA', (900, 60)); ImageDraw.Draw(st).text((450, 30), '← LADDER UP TO THE CANNON', fill=(210, 166, 46, 140), font=font(int(0.24 * PPU)), anchor='mm')
    st = st.resize((st.width, int(st.height * SIN)))
    px, py = P(5.2, 8.6); im.alpha_composite(st, (int(px - st.width / 2), int(py - st.height / 2)))
    items = []
    for n, gx, gy, kind in PLACED:
        e = MAN.get('props/' + n)
        if not e: continue
        items.append((0 if kind == 'floor' else 1, gy, n, gx, e))
    for (gx, gy, a) in junk_portgun():
        n = f'nut_r{int(round((math.degrees(a) % 60) / 15)) % 4}'; items.append((0, gy, n, gx, MAN['props/' + n]))
    for _, gy, n, gx, e in sorted(items, key=lambda t: (t[0], t[1])):
        s = img(e['files'][0]); px, py = P(gx, gy)
        im.alpha_composite(s, (int(round(px - e['ox'])), int(round(py - e['oy']))))
    # footprints: the game's solid rects (green), crate rects at their angles (yellow), other agents' (grey)
    def rect(r, col):
        a, b = P(r[0], r[1]), P(r[2], r[3]); d.rectangle([a[0], a[1], b[0], b[1]], outline=col, width=2)
    for r in FURN.values(): rect(r, (95, 214, 160, 255))
    for name, r in OTHERS.items():
        rect(r, (150, 150, 150, 255)); a = P(r[0], r[1]); d.text((a[0] + 4, a[1] + 4), name, fill='#c9ced8', font=font(14))
    for (cx, cy, w, h, a) in CRATE_RECTS:
        pts = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx * w / 2, sy * h / 2
            pts.append(P(cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a)))
        d.polygon(pts, outline=(232, 195, 79, 255))
    a, b = P(x0, y0), P(x1, y1); d.rectangle([a[0], a[1], b[0], b[1]], outline='#8a93a5', width=3)
    d.text((a[0], b[1] + 12), 'Left cannon room (portGun) at game coordinates, 96 px/unit. Green/yellow lines: the game\'s footprints on the floor.',
           fill='#e8ecf4', font=font(18))
    d.text((a[0], b[1] + 40), 'Guests (not placed here in the game, shown for scale): cat, duck, plant, toolbox. Grey: other agents\' objects.',
           fill='#9aa3b5', font=font(16))
    p = os.path.join(OUT, 'room_portgun.png'); im.convert('RGB').save(p); print(p, im.size)
    g = im.resize((im.width // 2, im.height // 2), Image.LANCZOS); p2 = os.path.join(OUT, 'room_portgun_game.png'); g.convert('RGB').save(p2); print(p2)

if __name__ == '__main__':
    sheet(); room()
