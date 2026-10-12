"""Contact sheets and animated GIF previews for the fx sprites (plain python3 + PIL, no Blender).

    python3 tools/blender/models/fx/sheets.py [name ...]      (default: every fx/ entry in the manifest)

Writes /tmp/fx_sheet.png (every sprite and frame at sprite scale, 96 px/unit, plus a game-scale
48 px/unit row, on the ship's floor colour), /tmp/fx_<name>.gif for each flipbook (at sprite scale
over the floor colour, 12 fps), and /tmp/fx_<name>_sheet.png (one row per flipbook).
The red cross marks the ground origin from the manifest.
"""
import json, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SPR = os.path.join(ROOT, 'build', 'renders')   # the raw renders (tools/blender/mn.py OUT_DIR)
BG = (63, 71, 87, 255)            # PALETTE.floor
man = json.load(open(os.path.join(SPR, 'manifest.json')))
names = sys.argv[1:] or sorted(k for k in man if k.startswith('fx/'))
names = [n if n.startswith('fx/') else 'fx/' + n for n in names]

def frames(n):
    e = man[n]; return [Image.open(os.path.join(SPR, f + '.png')).convert('RGBA') for f in e['files']], e

def on_bg(im, e, cross=True, bg=BG):
    c = Image.new('RGBA', im.size, bg); c.alpha_composite(im)
    if cross:
        d = ImageDraw.Draw(c); x, y = e['ox'], e['oy']
        d.line((x - 4, y, x + 4, y), fill=(255, 40, 40, 255)); d.line((x, y - 4, x, y + 4), fill=(255, 40, 40, 255))
    return c

rows = []
for n in names:
    ims, e = frames(n)
    row = [on_bg(im, e) for im in ims]
    small = [on_bg(im.resize((im.width // 2, im.height // 2), Image.LANCZOS), {'ox': e['ox'] / 2, 'oy': e['oy'] / 2}, cross=False) for im in ims]
    rows.append((n, row, small))
    if len(ims) > 1:
        g = [on_bg(im, e, cross=False).convert('RGB') for im in ims]
        g[0].save(f'/tmp/fx_{n[3:]}.gif', save_all=True, append_images=g[1:], duration=83, loop=0)
        W = sum(i.width for i in row) + 4 * len(row); H = max(i.height for i in row)
        sh = Image.new('RGBA', (W, H), (30, 32, 38, 255)); x = 0
        for i in row: sh.paste(i, (x, 0)); x += i.width + 4
        sh.save(f'/tmp/fx_{n[3:]}_sheet.png')

PAD = 6; LBL = 14
W = max(sum(i.width + PAD for i in r) + sum(i.width + PAD for i in s) + 20 for _, r, s in rows)
H = sum(max(i.height for i in r) + LBL + PAD for _, r, _ in rows)
sheet = Image.new('RGBA', (min(W, 6000), H), (24, 26, 31, 255)); d = ImageDraw.Draw(sheet); y = 0
for n, r, s in rows:
    d.text((4, y + 1), f"{n}  ({man[n]['w']}x{man[n]['h']}, {len(r)} frames)  | right: game scale 48 px/unit", fill=(220, 220, 220, 255))
    x = 0; yy = y + LBL
    for i in r: sheet.paste(i, (x, yy)); x += i.width + PAD
    x += 20
    for i in s: sheet.paste(i, (x, yy)); x += i.width + PAD
    y += max(i.height for i in r) + LBL + PAD
sheet.save('/tmp/fx_sheet.png')
print('wrote /tmp/fx_sheet.png', sheet.size, 'and gifs for', [n for n, r, _ in rows if len(r) > 1])
