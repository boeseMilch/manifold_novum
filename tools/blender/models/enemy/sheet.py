"""Contact sheets and shape overlays for the enemy sprites (plain python3 + PIL, no Blender).

    python3 tools/blender/models/enemy/sheet.py <out.png> <spec> [<spec> ...] [--scale 0.5] [--cols 4]

spec: sprite names joined with '+' are stacked at their shared ground origin (manifest ox/oy), e.g.
  enemy/frigate_port+enemy/frigate_port_dish_ok+enemy/frigate_turret_d8@2.15,-3.65
'@lx,ly' places a sprite's origin at that enemy-local point instead (a turret on its pivot).
A spec may end in '#shapes=<kind>[:<side>[:<turn deg>]]' to draw the game's hit shapes on top (see SHAPES).
"""
import sys, json, math, os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SPR = os.path.join(ROOT, 'assets', 'sprites')
MAN = json.load(open(os.path.join(SPR, 'manifest.json')))
PPU = MAN['_meta']['ppu']; E = math.radians(MAN['_meta']['elevation'])

def box(x0, y0, x1, y1): return ('poly', [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
INTERCEPTOR_HULL = [(0, -2.6), (0.45, -1.9), (0.58, -0.6), (1.5, 0.15), (1.5, 1.2), (0.62, 1.45), (0.45, 2.1),
                    (-0.45, 2.1), (-0.62, 1.45), (-1.5, 1.2), (-1.5, 0.15), (-0.58, -0.6), (-0.45, -1.9)]
FRIGATE_HULL = [(0, -7.2), (1.1, -6.2), (1.9, -4), (2.3, -1), (2.6, 2), (2.6, 5), (2.0, 6.4), (-2.0, 6.4),
                (-2.6, 5), (-2.6, 2), (-2.3, -1), (-1.9, -4), (-1.1, -6.2)]
SHAPES = {   # (solids, weak spots) in local units, from js/enemies.js, js/encounters.js
    'interceptor': ([('poly', INTERCEPTOR_HULL), box(1.42, -0.35, 2.02, 1.9), box(-2.02, -0.35, -1.42, 1.9), ('circle', (1.0, -0.45, 0.28)), box(2.0, 0.0, 2.3, 1.6)],
                    [('line', [(0.5, -1.25), (0.82, -1.08), (0.98, -0.72)], 0.16), box(2.02, 0.35, 2.3, 1.25),
                     ('poly', [(0.12, -1.95), (0.36, -1.85), (0.44, -1.5), (0.4, -1.15), (0.24, -1.05), (0.14, -1.5)])]),
    'frigate': ([('poly', FRIGATE_HULL), ('circle', (2.15, -3.65, 0.45)), box(2.5, 1.7, 3.2, 2.1), box(2.5, 3.4, 3.1, 3.8), box(-0.3, 6.3, 0.3, 6.6),
                 box(2.2, -1.3, 3.3, 0.9), ('circle', (3.55, 1.9, 0.55)), box(3.0, 3.0, 3.85, 5.2), box(-0.95, 6.4, 0.95, 7.7)],
                [('line', [(1.3, -5.7), (1.85, -5.15), (2.1, -4.2)], 0.2), box(3.35, -0.68, 5.45, 0.28), ('circle', (3.98, 1.9, 0.36)),
                 box(2.95, 3.85, 3.95, 4.75), box(-1.1, 6.8, 1.1, 7.3)]),
}
SHAPES['tractor'] = (SHAPES['interceptor'][0] + [box(2.3, 1.6, 2.8, 1.9)], SHAPES['interceptor'][1] + [('circle', (3.1, 1.75, 0.34))])
SHAPES['big'] = ([('circle', (0, 0, 2.2 * 0.9))], [('circle', (2.2 * 0.72, 0, 0.4))])   # asteroid at rot+crackA = 0
SHAPES['small'] = ([('circle', (0, 0, 1.05))], [])
SHAPES['rock'] = ([('circle', (0, 0, 2.2)), ('circle', (0, 0, 2.5))], [])               # ore asteroid: drill reach r + 0.3
SHAPES['r06'] = ([('circle', (0, 0, 0.6))], [])                                          # click radius of hull jobs
SHAPES['r08'] = ([('circle', (0, 0, 0.8))], [])                                          # drone hit radius
SHAPES['r07'] = ([('circle', (0, 0, 0.7))], [])

def load(name):
    m = MAN[name]; im = Image.open(os.path.join(SPR, name + '.png')).convert('RGBA'); return im, m['ox'], m['oy']

def compose(spec, scale):
    shapes = None
    if '#shapes=' in spec: spec, shapes = spec.split('#shapes=')
    layers = []
    for part in spec.split('+'):
        at = (0, 0)
        if '@' in part: part, a = part.split('@'); at = tuple(float(v) for v in a.split(','))
        file = part; key = part
        while key not in MAN and '_' in key:                # a state / direction / frame file of a set: name_d3 -> name
            key = key.rsplit('_', 1)[0]
        m = MAN[key]; im = Image.open(os.path.join(SPR, file + '.png')).convert('RGBA')
        layers.append((im, m['ox'], m['oy'], at))
    sgn = 1; rot = 0.0
    if shapes and ':' in shapes:
        bits = shapes.split(':'); shapes, sd = bits[0], bits[1]; sgn = -1 if sd == 'star' else 1
        if len(bits) > 2: rot = math.radians(float(bits[2]))
    # canvas: union of all layers in "origin space"
    def off(at): return (sgn * at[0] * PPU, at[1] * math.sin(E) * PPU)
    x0 = min(-ox + off(at)[0] for im, ox, oy, at in layers); y0 = min(-oy + off(at)[1] for im, ox, oy, at in layers)
    x1 = max(im.width - ox + off(at)[0] for im, ox, oy, at in layers); y1 = max(im.height - oy + off(at)[1] for im, ox, oy, at in layers)
    pad = 10
    W, H = int(x1 - x0) + 2 * pad, int(y1 - y0) + 2 * pad
    out = Image.new('RGBA', (W, H), (24, 27, 38, 255))
    OX, OY = -x0 + pad, -y0 + pad
    for im, ox, oy, at in layers:
        dx, dy = off(at); out.alpha_composite(im, (int(round(OX - ox + dx)), int(round(OY - oy + dy))))
    if shapes:
        d = ImageDraw.Draw(out)
        def pt(lx, ly):
            lx, ly = lx * math.cos(rot) - ly * math.sin(rot), lx * math.sin(rot) + ly * math.cos(rot)
            return (OX + sgn * lx * PPU, OY + ly * math.sin(E) * PPU)
        solids, pois = SHAPES[shapes]
        for col, group in (((80, 255, 120, 255), solids), ((255, 60, 200, 255), pois)):
            for s in group:
                if s[0] == 'poly': d.polygon([pt(*p) for p in s[1]], outline=col, width=2)
                elif s[0] == 'circle':
                    cx, cy, r = s[1]; pts = [pt(cx + math.cos(a / 48 * math.tau) * r, cy + math.sin(a / 48 * math.tau) * r) for a in range(48)]
                    d.polygon(pts, outline=col, width=2)
                else:
                    pts, w = s[1], s[2]
                    d.line([pt(*p) for p in pts], fill=col, width=max(1, int(w * PPU * 0.9)))
                    d.line([pt(*p) for p in pts], fill=(0, 0, 0, 255), width=1)
        d.ellipse((OX - 3, OY - 3, OX + 3, OY + 3), fill=(255, 255, 0, 255))
    if scale != 1: out = out.resize((max(1, int(W * scale)), max(1, int(H * scale))), Image.LANCZOS)
    return out

def main():
    a = sys.argv[1:]; out = a.pop(0); scale = 1.0; cols = 4
    if '--scale' in a: i = a.index('--scale'); scale = float(a[i + 1]); del a[i:i + 2]
    if '--cols' in a: i = a.index('--cols'); cols = int(a[i + 1]); del a[i:i + 2]
    ims = [compose(s, scale) for s in a]
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    W = max(sum(i.width for i in r) for r in rows); H = sum(max(i.height for i in r) for r in rows)
    sheet = Image.new('RGBA', (W, H), (24, 27, 38, 255)); y = 0
    for r in rows:
        x = 0
        for i in r: sheet.alpha_composite(i, (x, y)); x += i.width
        y += max(i.height for i in r)
    sheet.save(out); print(out, sheet.size)

if __name__ == '__main__':
    main()
