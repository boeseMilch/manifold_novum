"""Clutter: crates, the fuel-cell crate, personality items and floor junk (js/decor.js).

Every sprite's origin is the game's (x, y) of the draw call on the floor, rendered at the exact
canvas angle it is drawn with (see propslib.place). Things that are carried, thrown or spun get
directions instead. Things that sit on a desk/table (coffee, sticky notes, donut box, map-table
papers, pizza) are modelled from their own base: the game lifts them by the furniture's top height
(screen offset = -z * cos(50 deg) * 48 px at game scale).

    blender -b --factory-startup --python tools/blender/models/props/clutter.py [-- quick] [-- only=a,b]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from propslib import *

U = 1 / 48                         # one game pixel (at T = 48) in layout units

def tape_mat():
    m = bpy.data.materials.get('tape')
    if m: return m
    m = plain('tape', '#b9bec6', 0.82, gain=1.15)
    nt = m.node_tree; N = nt.nodes; L = nt.links.new; b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40
    L(tc.outputs['Object'], nz.inputs['Vector'])
    bm = N.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.25; L(nz.outputs['Fac'], bm.inputs['Height']); L(bm.outputs[0], b.inputs['Normal'])
    m.name = 'tape'; return m

def tape_strip(k, x, y, length, a, seed=1, z=0.0, w=0.2, th=0.006):
    """Duct tape strip with torn zig-zag ends, flat on the floor (game-local coords, canvas angle a)."""
    r = rng(seed); pts = [(-length / 2, -w / 2), (length / 2, -w / 2)]
    for i in range(1, 5): pts.append((length / 2 + (3 if i % 2 else -1) * r() * U, -w / 2 + i * w / 4))
    pts.append((-length / 2, w / 2))
    for i in range(3, -1, -1): pts.append((-length / 2 + (-3 if i % 2 else 1) * r() * U, -w / 2 + i * w / 4))
    ca, sa = math.cos(a), math.sin(a)
    P = [(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in pts]
    o = k(prism('tape', P[:-1] if P[-1] == P[0] else P, z, z + th, tape_mat(), bevel=0.0015, segs=1), outline=False)
    return o

def tape_x(k, x, y, s=0.55, seed=1, z=0.0):
    tape_strip(k, x, y, s, 0.75, seed, z); tape_strip(k, x, y, s, -0.75, seed + 1, z + 0.004)

INK = '#23252b'

def hinged_lid(k, w, d, th, m, hinge_y, z, deg):
    """A box lid hinged at its back edge (game-local y = hinge_y, height z), opened by deg (110 = leaning back).
    Children for its inside: lid-local (x, -y_from_hinge, -0.002); text needs rot=(pi, 0, 0)."""
    lid = k(shift_mesh(mn.box('lid', (w, d, th), m=m, bevel=min(0.008, th * 0.3)), dy=-d / 2, dz=th / 2))   # pivot on the hinge edge, local -y = away from the hinge
    lid.location = (0, -hinge_y, z); lid.rotation_euler.x = math.radians(-deg)
    return lid

def on_lid(lid, o, x, y, dz=-0.002):
    o.parent = lid; o.location = (x, -y, dz); return o

# ---------------------------------------------------------------------------
# Crates
# ---------------------------------------------------------------------------
CRATES = [   # name, game x, y, w, h, angle, colour, label   (decor.js drawPropDecor; dock.js for cargo/loot)
    ('crate_ammo_port', 11.6, 4.5, 1.0, 0.9, 0.05, '#8a7a4a', 'AMMO'),
    ('crate_blank_port', 12.8, 4.4, 0.8, 0.8, -0.1, '#8a7a4a', None),
    ('crate_snax', 12.3, 5.6, 0.9, 0.8, 0.25, '#7a8a5a', 'SNAX'),
    ('crate_ammo_star', 42.4, 3.6, 1.0, 0.9, -0.05, '#8a7a4a', 'AMMO'),
    ('crate_misc', 41.7, 10.4, 0.9, 0.9, 0.15, '#6a6f7a', 'MISC'),
    ('crate_plates_port', 12.6, 22.4, 1.0, 0.9, 0.1, '#6a6f7a', 'PLATES'),
    ('crate_coolant', 11.4, 22.6, 0.8, 0.7, -0.2, '#4a8aa0', 'COOLANT'),
    ('crate_tape', 32.0, 22.6, 1.0, 0.9, 0.2, '#6a6f7a', 'TAPE'),
    ('crate_plates_star', 33.1, 22.8, 0.9, 0.8, -0.1, '#6a6f7a', 'PLATES'),
    ('crate_blank_star', 32.4, 21.6, 0.7, 0.7, 0.5, '#7a8a5a', None),
    ('crate_cargo', None, None, 1.3, 1.0, 0.05, '#6a6f7a', 'CARGO'),
    ('crate_loot', None, None, 1.3, 1.0, 0.05, '#8a5a3a', 'LOOT'),
]

def crate_height(w, h): return round(0.3 + 0.3 * min(w, h), 3)

def crate(k, w, h, col, text_, seed=1):
    H = crate_height(w, h)
    paint = worn('paint', col, 0.55, 0.15, grime=1.0, scratch=0.6)
    lidp = worn('lidpaint', col, 0.5, 0.15, grime=0.8, scratch=0.5, gain=1.55)
    dark = worn('frame', '#3a3f4a', 0.45, 0.6, grime=0.6, scratch=0.4)
    k(mn.box('body', (w - 0.05, h - 0.05, H - 0.05), m=paint, bevel=0.03))
    k(mn.box('lid', (w, h, 0.07), loc=(0, 0, H - 0.07), m=lidp, bevel=0.025))
    k(mn.box('inset', (w - 0.18, h - 0.18, 0.012), loc=(0, 0, H - 0.004), m=paint, bevel=0.006))
    dx, dy = w - 0.24, h - 0.24                   # the diagonal brace (top-left to bottom-right in the game)
    k(mn.box('brace', (math.hypot(dx, dy), 0.075, 0.02), loc=(0, 0, H + 0.004), m=lidp, bevel=0.008, rot=(0, 0, -math.atan2(dy, dx))))
    k(mn.box('band', (w + 0.012, h + 0.012, 0.07), loc=(0, 0, H * 0.32), m=dark, bevel=0.012))
    for sx in (-1, 1):                            # corner guards, side handles
        for sy in (-1, 1):
            k(mn.box('corner', (0.11, 0.11, H + 0.02), loc=(sx * (w / 2 - 0.045), sy * (h / 2 - 0.045), -0.005), m=dark, bevel=0.018))
        k(mn.box('handle', (0.03, 0.24, 0.06), loc=(sx * (w / 2 + 0.005), 0, H * 0.58), m=dark, bevel=0.01))
    for sx in (-1, 1):                            # rivets on the front band
        for x in (-w / 2 + 0.2, w / 2 - 0.2):
            pass
    if text_:
        sz = 0.135 if len(text_) <= 5 else 0.115
        pw = len(text_) * sz * 0.66 + 0.1
        k(mn.box('placard', (pw, sz + 0.07, 0.008), loc=(0, 0, H + 0.022), m=plain('placard', '#e9e3cf', 0.6, gain=1.1), bevel=0.003))
        k(text('label', text_, sz, (0, 0, H + 0.03), plain('ink', INK, 0.5)), outline=False)
        # stencil on the front face, faded paint
        k(text('stencil', text_, 0.1, (0, -h / 2 - 0.004, H * 0.66), plain('stencil', '#e8e4d8', 0.7, gain=0.9), rot=R90), outline=False)
    return H

def crate_extras(k, name, w, h, H):
    """A little personality per crate."""
    if 'ammo' in name:                           # hazard stripes on the front band
        k(mn.box('hz', (w - 0.3, 0.012, 0.06), loc=(0, -h / 2 - 0.006, H * 0.32 + 0.005), m=stripes_mat('hz', '#e8c34f', '#23252b', 9, axis='xz'), bevel=0), outline=False)
    if 'snax' in name:                           # a crumpled wrapper left on the lid
        wr = k(mn.sphere('wrapper', 0.07, loc=(w * 0.28, h * 0.2, H + 0.03), m=plain('wrap', '#e2574c', 0.3, metal=0.6), scale=(1.3, 0.9, 0.5), segs=8))
        tape_strip(k, -w * 0.28, h * 0.18, 0.3, 0.6, 7, z=H + 0.026, w=0.12)
    if 'tape' in name:                           # a roll of the stuff on top, of course
        k(ring('roll', 0.13, 0.065, 0.08, loc=(w * 0.24, h * 0.18, H + 0.02), m=tape_mat()))
        k(ring('core', 0.068, 0.012, 0.081, loc=(w * 0.24, h * 0.18, H + 0.02), m=plain('cardboard', '#c9a46a', 0.8)))
    if 'coolant' in name:                        # frost drips down the front, a snowflake sticker
        k(mn.box('frost', (w - 0.3, 0.01, 0.05), loc=(0, -h / 2 - 0.004, 0.03), m=plain('frost', '#d8f0ff', 0.3, gain=1.0), bevel=0.004), outline=False)
    if 'misc' in name:                           # a sticky note: someone's inventory system
        k(mn.box('note', (0.22, 0.22, 0.004), loc=(-w * 0.22, -h * 0.2, H + 0.024), m=plain('note', '#f29bc4', 0.7), bevel=0.001, rot=(0, 0, 0.25)), outline=False)
    if 'plates' in name:                         # a corner of tape holding the lid shut
        tape_strip(k, w * 0.26, h * 0.26, 0.3, -0.5, 3, z=H + 0.026, w=0.12)
    if 'loot' in name:
        k(text('skull', 'X', 0.16, (0, -h / 2 - 0.004, H * 0.35), plain('skullp', '#e8e4d8', 0.7), rot=R90), outline=False)

for (name, gx, gy, w, h, a, col, lbl) in CRATES:
    def mk(name=name, w=w, h=h, a=a, col=col, lbl=lbl):
        k = Kit(); H = crate(k, w, h, col, lbl); crate_extras(k, name, w, h, H); k.outline(0.013)
        place(k, name, a)
    job(name)(mk)

# ---------------------------------------------------------------------------
# Fuel-cell crate (FUEL_CRATE, decor.js fuelCrate): 3 slots, filled with power.reserve cells
# ---------------------------------------------------------------------------
def fuel_crate(left):
    k = Kit(); w, h, H = 1.3, 0.9, 0.42
    body = worn('fbody', '#4f586a', 0.5, 0.4, grime=0.9, scratch=0.6, gain=1.7)
    k(mn.box('body', (w, h, H), m=body, bevel=0.05))
    k(mn.box('rim', (w + 0.03, h + 0.03, 0.06), loc=(0, 0, H - 0.06), m=worn('frim', '#5a6272', 0.4, 0.6, gain=1.7), bevel=0.02))
    k(mn.box('hz', (w - 0.2, 0.012, 0.09), loc=(0, -h / 2 - 0.006, 0.06), m=stripes_mat('fhz', '#e8c34f', '#23252b', 7, axis='xz'), bevel=0), outline=False)
    k(text('lbl', 'FUEL CELLS', 0.1, (0, -h / 2 - 0.004, 0.26), plain('lbl', '#e8ecf4', 0.6, gain=1.0), rot=R90), outline=False)
    k(mn.box('handle', (0.03, 0.3, 0.06), loc=(-w / 2 - 0.01, 0, 0.25), m=plain('hdl', '#262a33', 0.5)))
    k(mn.box('handle2', (0.03, 0.3, 0.06), loc=(w / 2 + 0.01, 0, 0.25), m=plain('hdl', '#262a33', 0.5)))
    cellm = glow('cell', '#2ee070', 0.9); steel = worn('steel', '#a3abb8', 0.32, 0.85, grime=0.3, scratch=0.2)
    hole = plain('hole', '#0c0d10', 0.9, gain=1.0)
    for i in range(3):
        cx = -w / 2 + 0.25 + i * (w - 0.5) / 2
        k(ring('collar', 0.19, 0.05, 0.03, loc=(cx, 0, H), m=steel))
        k(mn.cyl('hole', 0.15, 0.01, loc=(cx, 0, H + 0.002), m=hole, bevel=0), outline=False)
        if i < left:                              # a cell standing in the slot, sticking out
            k(mn.cyl('cell', 0.12, 0.26, loc=(cx, 0, H - 0.02), m=cellm, bevel=0.02))
            k(ring('band', 0.126, 0.02, 0.03, loc=(cx, 0, H + 0.12), m=plain('cband', '#262a33', 0.5)))
            k(mn.cyl('cap', 0.1, 0.05, loc=(cx, 0, H + 0.235), m=steel, bevel=0.02))
            k(mn.cyl('nub', 0.045, 0.035, loc=(cx, 0, H + 0.28), m=plain('nub', '#262a33', 0.5), bevel=0.012))
    tape_strip(k, 0.45, 0.36, 0.34, 0.2, 11, z=H, w=0.12)
    k.outline(0.013)
    place(k, f'fuel_crate_{left}', 0.08)
for n in range(4):
    job(f'fuel_crate_{n}')(lambda n=n: fuel_crate(n))

# ---------------------------------------------------------------------------
# Small personality items
# ---------------------------------------------------------------------------
@job('duck')
def duck_all():
    def build():
        k = Kit()
        yel = plain('duck', '#f4cf3a', 0.28, coat=0.6, gain=1.1); org = plain('beak', '#ef8a2a', 0.3, coat=0.5, gain=1.1)
        k(mn.sphere('body', 1, loc=(0, 0, 0.1), m=yel, scale=(0.2, 0.15, 0.11)))
        k(mn.sphere('tail', 1, loc=(-0.17, 0, 0.16), m=yel, scale=(0.07, 0.06, 0.06)))
        for s in (-1, 1): k(mn.sphere('wing', 1, loc=(-0.03, s * 0.12, 0.14), m=yel, scale=(0.1, 0.04, 0.06)))
        k(mn.sphere('head', 0.105, loc=(0.12, 0, 0.27), m=yel))
        k(mn.sphere('beak', 1, loc=(0.225, 0, 0.25), m=org, scale=(0.065, 0.05, 0.025)))
        k(mn.sphere('beak2', 1, loc=(0.215, 0, 0.232), m=org, scale=(0.05, 0.04, 0.015)))
        for s in (-1, 1):
            k(mn.sphere('eye', 0.022, loc=(0.18, s * 0.06, 0.3), m=plain('eye', '#14161b', 0.2, coat=1.0)), outline=False)
            k(mn.sphere('shine', 0.007, loc=(0.198, s * 0.064, 0.312), m=plain('sh', '#ffffff', 0.2, emit='#ffffff', emit_strength=1.0)), outline=False)
        k(mn.sphere('blush', 1, loc=(0.16, -0.085, 0.255), m=plain('blush', '#ff9a6a', 0.5), scale=(0.025, 0.006, 0.016)), outline=False)
        k(mn.sphere('blush2', 1, loc=(0.16, 0.085, 0.255), m=plain('blush', '#ff9a6a', 0.5), scale=(0.025, 0.006, 0.016)), outline=False)
        k.outline(0.012); return k
    place(build(), 'duck_star', math.pi)            # right cannon room (42.6, 6.4)
    mn.reset(); place(build(), 'duck_reactor', 0.5)  # reactor room (18.4, 23.1)
    mn.reset(); place(build(), 'duck', dirs=8)       # any other spot

def mug(k, full=True, x=0.0, y=0.0, z=0.0, cup='#e8e4dc', r=0.165, hgt=0.2, handle=True):
    cer = plain('ceramic', cup, 0.3, coat=0.5, gain=1.15)
    k(mn.cyl('mug', r, hgt, loc=(x, -y, z), m=cer, bevel=0.02))
    k(mn.cyl('inside', r - 0.025, 0.01, loc=(x, -y, z + hgt - 0.005), m=plain('in', '#c9b49a' if not full else '#4a2c1a', 0.2 if full else 0.6, coat=0.8 if full else 0), bevel=0), outline=False)
    if not full:
        k(ring('ring', r - 0.035, 0.02, 0.006, loc=(x, -y, z + hgt - 0.002), m=plain('dreg', '#2a1a10', 0.5)), outline=False)
    if handle:
        k(ring('handle', 0.07, 0.025, 0.035, loc=(x + r + 0.03, -y, z + hgt * 0.55), m=cer, rot=R90))
    k(ring('stripe', r + 0.002, 0.01, 0.03, loc=(x, -y, z + hgt * 0.62), m=plain('mstripe', '#c0392b', 0.4)), outline=False)

@job('coffee')
def coffee_job():
    for full in (True, False):
        if not full: mn.reset()
        k = Kit(); mug(k, full)
        k(mn.cyl('crema', 0.06, 0.004, loc=(-0.03, 0.03, 0.198), m=plain('crema', '#c8a07a', 0.3), bevel=0) if full else mn.box('dummy', (0.001, 0.001, 0.001)), outline=False)
        k.outline(0.012); place(k, 'coffee_full' if full else 'coffee_empty')

@job('sticky_notes')
def sticky_job():
    for nm, col, a in (('sticky_yellow', '#f2df6b', 0.2), ('sticky_pink', '#f29bc4', -0.3)):
        mn.reset(); k = Kit()
        n = k(mn.box('note', (0.25, 0.25, 0.006), m=plain('note', col, 0.75, gain=1.1), bevel=0.002))
        n.modifiers.new('curl', 'SIMPLE_DEFORM').deform_method = 'BEND'; n.modifiers['curl'].angle = 0.25; n.modifiers['curl'].deform_axis = 'Y'
        for i, (l, yy) in enumerate(((7, -3), (5, 0), (6, 3))):
            k(mn.box('scrawl', (l * U, 1.2 * U, 0.002), loc=((-4 + l / 2) * U, -yy * U, 0.006), m=plain('pen', '#28285a', 0.5), bevel=0), outline=False)
        k.outline(0.008); place(k, nm, a)

def sheets(k, seed, z0=0.0):
    r = rng(seed); paper = plain('paper', '#e9e6dc', 0.85, gain=1.08); ink = plain('ink2', '#3c465a', 0.6)
    for i in range(4):
        px, py, a = (r() - 0.5) * 0.8, (r() - 0.5) * 0.6, (r() - 0.5) * 1.6
        z = z0 + i * 0.005
        s = k(mn.box('sheet', (18 * U, 24 * U, 0.003), loc=(0, 0, 0), m=paper, bevel=0.001), outline=True)
        lines = []
        for l in range(5):
            ln = 8 + r() * 4
            lines.append(k(mn.box('line', (ln * U, 1.2 * U, 0.002), loc=((-6 + ln / 2) * U, -(-8 + l * 4 + 0.6) * U, 0.003), m=ink, bevel=0), outline=False))
        e = mn.link(bpy.data.objects.new('sheetroot', None))
        for o in [s] + lines: o.parent = e
        e.location = (px, -py, z); e.rotation_euler.z = -a

@job('papers')
def papers_job():
    k = Kit(); sheets(k, 53); k.outline(0.008); place(k, 'papers_bridge')        # floor of the bridge (17.0, 6.0)
    mn.reset(); k = Kit(); sheets(k, 57); k.outline(0.008); place(k, 'papers_maptable')   # on the map table (21.6, 6.0)

@job('wrench')
def wrench_job():
    k = Kit(); st = worn('chrome', '#b4bcc8', 0.3, 0.55, grime=0.4, scratch=0.3, gain=1.3)
    k(mn.box('shaft', (0.52, 0.11, 0.04), loc=(-0.06, 0, 0.0), m=st, bevel=0.018))
    jaw = []                                      # open-end jaw: a ring with a slot towards +x
    R0, gap = 0.15, 0.055
    for i in range(29):
        t = math.asin(gap / R0) + (math.tau - 2 * math.asin(gap / R0)) * i / 28; jaw.append((0.24 + math.cos(t) * R0, math.sin(t) * R0))
    jaw += [(0.25, -gap), (0.25, gap)]
    k(prism('jaw', jaw, 0.0, 0.045, st, bevel=0.01))
    k(mn.cyl('ring', 0.105, 0.045, loc=(-0.3, 0, 0), m=st, bevel=0.012))
    k(mn.cyl('ringhole', 0.05, 0.05, loc=(-0.3, 0, 0.001), m=plain('hole', '#14161b', 0.9)), outline=False)
    k(mn.box('grip', (0.2, 0.115, 0.045), loc=(-0.08, 0, 0.002), m=plain('grip', '#c0392b', 0.6), bevel=0.02))
    k.outline(0.01); place(k, 'wrench', dirs=16)

@job('toolbox')
def toolbox_job():
    k = Kit(); w, h, H = 0.84, 0.48, 0.28
    red = worn('tbred', '#b8402e', 0.45, 0.2, grime=1.0, scratch=0.8, gain=1.25)
    k(mn.box('box', (w, h, H), m=red, bevel=0.03))
    k(mn.box('inside', (w - 0.1, h - 0.1, 0.02), loc=(0, 0, H - 0.03), m=plain('tbin', '#5a1f17', 0.7)), outline=False)
    # open lid leaning back (hinged at the back edge)
    lid = k(shift_mesh(mn.box('lid', (w, 0.04, h * 0.9), m=red, bevel=0.015), dz=h * 0.45 - 0.0))
    lid.location = (0, h / 2 + 0.02, H - 0.02); lid.rotation_euler.x = -0.35
    k(mn.box('latch', (0.08, 0.03, 0.05), loc=(0, -h / 2 - 0.01, H - 0.08), m=worn('latch', '#c9ced8', 0.3, 0.9, grime=0.2)))
    # tools: screwdriver, a yellow tape measure-ish thing, green pliers handle
    k(mn.box('driver', (0.3, 0.05, 0.05), loc=(-0.15, 0.12, H - 0.04), m=worn('drv', '#c9ced8', 0.3, 0.9, grime=0.2), bevel=0.02))
    k(mn.box('drvh', (0.12, 0.07, 0.07), loc=(-0.02, 0.12, H - 0.05), m=plain('drvh', '#e8c34f', 0.4), bevel=0.025))
    k(mn.box('meas', (0.32, 0.09, 0.07), loc=(0.11, 0.0, H - 0.05), m=plain('meas', '#e8c34f', 0.4), bevel=0.02))
    k(mn.box('plier', (0.18, 0.1, 0.05), loc=(-0.16, -0.08, H - 0.03), m=plain('plier', '#5fd6a0', 0.5, gain=1.0), bevel=0.02))
    k(mn.box('handle', (0.36, 0.05, 0.05), loc=(0, 0, H + 0.08), m=plain('tbh', '#262a33', 0.5), bevel=0.02))
    for sx in (-1, 1): k(mn.box('post', (0.04, 0.04, 0.12), loc=(sx * 0.17, 0, H - 0.02), m=plain('tbh', '#262a33', 0.5), bevel=0.01))
    k.outline(0.012); place(k, 'toolbox', -0.3)

def leaf(name, ang, length, width, m, base_z, rise=0.6, droop=0.9):
    """A leaf from the pot centre outwards at canvas angle ang: arcs up, then droops. V-folded midrib."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); NU, NV = 12, 4
    d = Vector((math.cos(ang), -math.sin(ang), 0)); s = Vector((-d.y, d.x, 0))
    rows = []
    for i in range(NU + 1):
        u = i / NU; wdt = width * (math.sin(math.pi * min(1, u * 1.05)) ** 0.8) + 0.004
        z = base_z + length * (rise * math.sin(u * math.pi * 0.75) - droop * u * u * 0.6)
        row = []
        for j in range(-NV, NV + 1):
            v = j / NV
            p = d * (0.04 + u * length) + s * (v * wdt) + Vector((0, 0, z + abs(v) * wdt * 0.35))
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(NU):
        for j in range(2 * NV):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = 0
    mn.assign(o, m); mn.smooth(o); return o

@job('plant')
def plant_job():
    k = Kit()
    pot = worn('pot', '#9a5a3a', 0.7, 0.0, grime=0.8, scratch=0.0, gain=1.3)
    k(mn.cyl('pot', 0.25, 0.26, loc=(0, 0, 0), m=pot, bevel=0.03))
    k(ring('rim', 0.27, 0.05, 0.06, loc=(0, 0, 0.24), m=pot))
    k(mn.cyl('soil', 0.21, 0.01, loc=(0, 0, 0.255), m=plain('soil', '#3e2a1e', 0.95)), outline=False)
    # a crack in the pot, taped (of course)
    t = k(mn.box('tape', (0.06, 0.012, 0.18), loc=(0.07, -0.245, 0.05), m=tape_mat(), bevel=0.003, rot=(0, 0.25, 0.28)), outline=False)
    # a little plant tag: STEVE
    tag = k(mn.box('tag', (0.12, 0.01, 0.07), loc=(-0.1, -0.1, 0.33), m=plain('ptag', '#f2efe6', 0.6), bevel=0.003, rot=(-0.3, 0, 0.2)))
    k(mn.box('tagstick', (0.012, 0.01, 0.1), loc=(-0.1, -0.1, 0.25), m=plain('ptag', '#f2efe6', 0.6), bevel=0), outline=False)
    k(text('tagtxt', 'STEVE', 0.035, (-0.1, -0.107, 0.37), plain('ink', INK, 0.5), rot=(math.radians(90) - 0.3, 0, 0.2)), outline=False)
    greens = [plain('leafA', '#5f9a4a', 0.45, coat=0.3), plain('leafB', '#4c8240', 0.45, coat=0.3)]
    pivots = []
    for i in range(7):
        a = i / 7 * math.tau; l = 0.35 + (i % 3) * 0.08 + 0.08
        pv = mn.link(bpy.data.objects.new('lp', None)); pv.location = (0, 0, 0)
        lf = k(leaf('leaf', a, l, 0.085, greens[i % 2], 0.26, rise=0.75 + 0.15 * (i % 2), droop=0.8)); lf.parent = pv
        pivots.append(pv); k.parts.append(pv)
    # a new shoot in the middle
    k(leaf('shoot', 1.2, 0.18, 0.05, greens[0], 0.26, rise=1.6, droop=0.3))
    k.outline(0.012)
    F = list(range(1, 7))
    for fi, f in enumerate(F):
        bpy.context.scene.frame_set(f); tt = fi / len(F) * math.tau / 0.8
        for i, pv in enumerate(pivots):
            pv.rotation_euler.z = -math.sin(tt * 0.8 + i) * 0.06; pv.keyframe_insert('rotation_euler', frame=f)
    place(k, 'plant', frames=F)

def flute_mat(name, axis):
    """The cut edge of corrugated cardboard: light liner with darker flutes across it."""
    m = bpy.data.materials.get(name)
    return m or stripes_mat(name, '#e6cc98', '#9a7444', k=36.0, rough=0.9, axis=axis)

def blob(name, r, seed, z, m, cx=0.0, cy=0.0, n=40, th=0.003):
    """An irregular flat splotch (grease, stains), game-local centre (cx, cy)."""
    rr = rng(seed); ph = [rr() * math.tau for _ in range(3)]; pts = []
    for i in range(n):
        a = i / n * math.tau
        q = r * (1 + 0.2 * math.sin(2 * a + ph[0]) + 0.12 * math.sin(3 * a + ph[1]) + 0.06 * math.sin(5 * a + ph[2]))
        pts.append((cx + math.cos(a) * q, cy + math.sin(a) * q))
    return prism(name, pts, z, z + th, m, bevel=0)

def pizza_model(k, s=1.0, z=0.0):
    """Open corrugated pizza box (~4.5 cm walls at pizza scale) with the pizza sitting inside, two slices gone.
    Game-local: the box spans +-0.45 s, the lid is hinged at the back (game -y) and leans back, its
    printed, grease-stained inside facing the camera; its front tuck flap sticks out towards the camera."""
    from mathutils import Vector, noise, Matrix
    W, T, HB, BOT, TH = 0.9 * s, 0.032 * s, 0.12 * s, 0.014 * s, 0.018 * s
    kraft = worn('pbox', '#c9a46a', 0.88, 0.0, grime=0.55, scratch=0, scale=3.0, gain=1.12)
    kraftd = worn('pboxin', '#b89058', 0.88, 0.0, grime=0.7, scratch=0, scale=3.0, gain=1.12)
    red = plain('pprint', '#c0392b', 0.6, gain=1.15); cream = plain('pcream', '#efe2c2', 0.75, gain=1.05)
    grease = plain('grease', '#9a6c34', 0.3, coat=0.5, gain=1.1); grease2 = plain('grease2', '#7e5426', 0.25, coat=0.6, gain=1.1)
    # tray: bottom and four double-thick walls; their cut tops show the corrugation
    k(mn.box('pbot', (W, W, BOT), loc=(0, 0, z), m=kraftd, bevel=0.004 * s))
    walls = ((0, W / 2 - T / 2, W, T, 'x'), (0, -(W / 2 - T / 2), W, T, 'x'),
             (W / 2 - T / 2, 0, T, W - 2 * T, 'y'), (-(W / 2 - T / 2), 0, T, W - 2 * T, 'y'))
    for i, (x, y, sx, sy, ax) in enumerate(walls):
        k(mn.box('pwall', (sx, sy, HB), loc=(x, -y, z), m=kraft, bevel=0.005 * s))
        k(mn.box('pflute', (sx - 0.006 * s, sy - 0.01 * s, 0.003 * s), loc=(x, -y, z + HB), m=flute_mat('pflute' + ax, ax), bevel=0), outline=False)
    # print on the front wall (towards the camera): a red band and the name
    k(mn.box('pband', (W * 0.96, 0.002, HB * 0.28), loc=(0, -(W / 2 + 0.0005), z + HB * 0.58), m=red, bevel=0), outline=False)
    k(text('pfront', 'NOVA PIZZA', 0.05 * s, (0, -(W / 2 + 0.002), z + HB * 0.3), red, rot=R90), outline=False)
    # the inside: grease soaked into the bottom where the missing slices were, a few crumbs
    k(blob('pgr', 0.11 * s, 7, z + BOT, grease, 0.2 * s, -0.04 * s), outline=False)
    k(blob('pgr2', 0.05 * s, 9, z + BOT + 0.0008, grease2, 0.24 * s, -0.06 * s), outline=False)
    for i in range(5):
        r = rng(40 + i); k(mn.sphere('crumb', 0.009 * s, loc=((0.12 + r() * 0.2) * s, (r() - 0.6) * 0.25 * s, z + BOT + 0.004), m=plain('crust', '#d8984a', 0.6), segs=6), outline=False)
    # lid: a slightly crumpled corrugated sheet hinged on the back wall, open past upright
    piv = k(mn.link(bpy.data.objects.new('lidpivot', None)))
    piv.location = (0, W / 2, z + HB); piv.rotation_euler.x = math.radians(-101)
    def dent(x, y):                                # lid-local (y runs 0 at the hinge to -W at the free edge)
        u, v = x / W, -y / W
        d = 0.012 * s * noise.noise(Vector((u * 3.1, v * 3.1, 0.7))) + 0.004 * s * noise.noise(Vector((u * 9, v * 9, 2.3)))
        d += 0.02 * s * max(0.0, 1 - abs((u - 0.62) - (v - 0.3) * 0.55) / 0.07) * min(1, v * 3)   # a crease from a fist
        d += 0.01 * s * (u * u * 4) * v                 # the free corners curl a little
        return d
    me = bpy.data.meshes.new('lid'); bm = bmesh.new()
    NX = 26; vs = {}
    for i in range(NX + 1):
        for j in range(NX + 1):
            x = -W / 2 + W * i / NX; y = -W * j / NX
            vs[i, j] = bm.verts.new((x, y, dent(x, y)))
    for i in range(NX):
        for j in range(NX):
            f = bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    lid = k(mn._obj('lid', me)); mn.assign(lid, kraftd); mn.smooth(lid)
    sd = lid.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = TH; sd.offset = 1      # inside face at z = dent (faces the pizza when shut), the outside above it
    lid.parent = piv
    def stick(o, lift=0.0012 * s):
        """Put a decal (child of the lid pivot) onto the crumpled inside of the lid."""
        o.parent = piv; M = o.matrix_basis.copy(); Mi = M.inverted()
        for v in o.data.vertices:
            p = M @ v.co; p.z += dent(p.x, p.y) - lift; v.co = Mi @ p
        return o
    def decal(o): return stick(k(o, outline=False))
    # the inside print: a round logo (a slice in a red ring) above the name
    lx, ly = -0.04 * s, -0.68 * W
    decal(mn.cyl('plogo', 0.15 * s, 0.002, loc=(lx, ly, -0.002), m=red, bevel=0, verts=40))
    decal(mn.cyl('plogo2', 0.12 * s, 0.002, loc=(lx, ly, -0.003), m=cream, bevel=0, verts=40))
    # a slice, tip down: cheese, crust along the top, two pepperoni
    for nm, pts, m, dz in (('pslice', [(0, 0.085 * s), (0.07 * s, -0.06 * s), (-0.07 * s, -0.06 * s)], plain('pyel', '#e8b04a', 0.6), -0.0045),
                           ('pcrust', [(0.075 * s, -0.055 * s), (0.075 * s, -0.08 * s), (-0.075 * s, -0.08 * s), (-0.075 * s, -0.055 * s)], plain('pbrn', '#a8682a', 0.6), -0.0055)):
        o = k(prism(nm, pts, 0, 0.002, m, bevel=0), outline=False); o.location = (lx, ly, dz); o.rotation_euler = (math.pi, 0, 0); stick(o)
    for px, py in ((-0.018, -0.025), (0.022, 0.0)):
        decal(mn.cyl('ppep', 0.014 * s, 0.002, loc=(lx + px * s, ly + py * s, -0.0065), m=red, bevel=0, verts=16))
    decal(text('ptxt', 'PIZZA', 0.13 * s, (lx, -0.42 * W, -0.003), red, rot=(math.pi, 0, 0)))
    decal(text('ptxt2', 'HOT & FRESH', 0.05 * s, (lx, -0.28 * W, -0.003), red, rot=(math.pi, 0, 0)))
    # grease soaked through where the pizza touched the lid, a darker core, a drip
    for nm, r, sd_, cx, cy, m, dz in (('lgr', 0.13, 3, 0.27, -0.5, grease, -0.0035), ('lgr2', 0.06, 5, 0.3, -0.53, grease2, -0.0045),
                                      ('lgr3', 0.05, 11, -0.24, -0.82, grease, -0.0035)):
        b_ = k(blob(nm, r * s, sd_, 0, m, 0, 0), outline=False); b_.location = (cx * s, cy * s, dz); b_.rotation_euler = (math.pi, 0, 0); stick(b_)
    # front tuck flap at the free edge, sagging towards the camera; its cut edge shows the flutes
    fp = k(mn.link(bpy.data.objects.new('flappivot', None))); fp.parent = piv; fp.location = (0, -W, dent(0, -W)); fp.rotation_euler.x = math.radians(18)
    FL = 0.13 * s
    flap = k(mn.box('pflap', (W - 0.05 * s, TH, FL), loc=(0, TH / 2, -FL), m=kraft, bevel=0.003 * s)); flap.parent = fp
    fe = k(mn.box('pflapcut', (W - 0.056 * s, TH * 0.8, 0.003 * s), loc=(0, TH / 2, -FL - 0.0015 * s), m=flute_mat('pflutex', 'x'), bevel=0), outline=False); fe.parent = fp
    # side ears folded in along the lid's sides
    for sx in (-1, 1):                             # trapezoids in the lid's y-z plane, TH thick in x
        ear = k(prism('pear', [(-0.08 * W, 0.0), (-0.84 * W, 0.0), (-0.76 * W, 0.1 * s), (-0.17 * W, 0.1 * s)], 0, TH, kraft, bevel=0.002 * s))
        for v in ear.data.vertices:
            v.co = Vector((sx * (W / 2 - 0.02 * s) + v.co.z - TH / 2, v.co.x, v.co.y))
        ear.parent = piv
    # pizza: two slices gone (canvas arc 0.6 .. TAU - 1.0), a clear gap to the walls
    a0, a1 = 0.6, math.tau - 1.0; R = 0.33 * s; zb = z + BOT
    pts = [(0, 0)] + [(math.cos(a0 + (a1 - a0) * i / 40) * R, math.sin(a0 + (a1 - a0) * i / 40) * R) for i in range(41)]
    k(prism('dough', pts, zb, zb + 0.014 * s, plain('dough', '#d8a25a', 0.6), bevel=0.004 * s))
    k(prism('cheese', pts, zb + 0.012 * s, zb + 0.03 * s, plain('cheese', '#e8b04a', 0.45, coat=0.3), bevel=0.006 * s))
    k(tube('crust', [(math.cos(a0 + (a1 - a0) * i / 40) * R, math.sin(a0 + (a1 - a0) * i / 40) * R, zb + 0.026 * s) for i in range(41)], 0.028 * s,
           plain('crust', '#d8984a', 0.6), corner=0.0))
    pep = plain('pep', '#c0392b', 0.4, coat=0.3)
    for px, py in ((-8, -6), (6, -10), (-4, 8), (-12, 4), (2, 2)):
        k(mn.cyl('pep', 3 * U * s * 1.2, 0.012 * s, loc=(px * U * s, -py * U * s, zb + 0.026 * s), m=pep, bevel=0.003 * s, verts=16), outline=False)
    for bx, by in ((-0.12, 0.1), (0.1, 0.18), (-0.02, -0.2)):   # basil
        k(mn.sphere('basil', 1, loc=(bx * s, -by * s, zb + 0.034 * s), m=plain('basil', '#3f8a3a', 0.5), scale=(0.025 * s, 0.015 * s, 0.006 * s), segs=8), outline=False)

@job('pizza')
def pizza_job():
    k = Kit(); pizza_model(k, 0.62); k.outline(0.01)
    place(k, 'pizza', 0.3)                        # on the kitchen table, see interior.py table_kitchen

@job('donut_box')
def donut_job():
    k = Kit(); w, h = 0.8, 0.56
    pink = plain('dbox', '#f2c6d8', 0.75, gain=1.05); pinkd = plain('dboxd', '#e0a8c0', 0.75, gain=1.05)
    k(mn.box('tray', (w, h, 0.03), m=pink, bevel=0.008))
    for sx in (-1, 1): k(mn.box('wall', (0.025, h, 0.08), loc=(sx * (w / 2 - 0.0125), 0, 0), m=pink, bevel=0.006))
    k(mn.box('wallf', (w, 0.025, 0.08), loc=(0, -h / 2 + 0.0125, 0), m=pink, bevel=0.006))
    lid = hinged_lid(k, w, h, 0.025, pinkd, -h / 2, 0.06, 105)
    on_lid(lid, k(text('dtxt', 'DONUTS', 0.1, (0, 0, 0), plain('dtxtm', '#c0587a', 0.5), rot=(math.pi, 0, 0)), outline=False), 0, h * 0.45, -0.003)
    cups = plain('cup', '#f7f2ea', 0.8)
    for gx in (-0.25, 0.0, 0.25):
        for gy in (-0.12, 0.12):
            k(mn.cyl('cup', 0.105, 0.012, loc=(gx, -gy, 0.03), m=cups, bevel=0.003), outline=False)
    dough = plain('dough', '#d89a58', 0.6)
    sprinkle_cols = ['#5fd6a0', '#e8c34f', '#9cd8ff', '#ffffff', '#e2574c']
    for (dx, dy, icing) in ((-0.2, -0.1, '#e87aa8'), (0.2, 0.12, '#7a4a2a')):
        x, y = dx, -dy
        k(ring('donut', 0.11, 0.075, 0.06, loc=(x, y, 0.035), m=dough))
        k(ring('icing', 0.108, 0.072, 0.022, loc=(x, y, 0.088), m=plain('icing' + icing, icing, 0.3, coat=0.6)), outline=False)
        r = rng(int(abs(dx * 100)) + 5)
        for i in range(10):
            a = r() * math.tau; rr_ = 0.06 + r() * 0.03
            k(mn.box('spr', (0.022, 0.007, 0.006), loc=(x + math.cos(a) * rr_, y + math.sin(a) * rr_, 0.11), m=plain('spr%d' % (i % 5), sprinkle_cols[i % 5], 0.4), bevel=0, rot=(0, 0, r() * 3)), outline=False)
    for i in range(6):                            # crumbs
        r = rng(90 + i); k(mn.sphere('crumb', 0.01, loc=((r() - 0.5) * 0.6, (r() - 0.5) * 0.4, 0.035), m=dough, segs=6), outline=False)
    k.outline(0.01); place(k, 'donut_box', 0.3)

@job('extinguisher')
def extinguisher_job():
    def body(k, upright=False):
        red = worn('ext', '#e0503e', 0.35, 0.3, grime=0.5, scratch=0.5, gain=1.1)
        r, L = 0.13, 0.56
        k(mn.cyl('tank', r, L - 2 * r * 0.6, loc=(0, 0, r * 0.6), m=red, bevel=0.0, verts=32))
        k(mn.sphere('bot', r, loc=(0, 0, r * 0.6), m=red, scale=(1, 1, 0.6)))
        k(mn.sphere('top', r, loc=(0, 0, L - r * 0.6), m=red, scale=(1, 1, 0.6)))
        k(mn.cyl('label', r + 0.003, 0.16, loc=(0, 0, 0.18), m=plain('extlbl', '#e9e6dc', 0.7), bevel=0), outline=False)
        k(mn.cyl('valve', 0.045, 0.08, loc=(0, 0, L - 0.02), m=worn('valve', '#2b303a', 0.4, 0.7, grime=0.3)))
        k(mn.box('lever', (0.16, 0.035, 0.03), loc=(0.05, 0, L + 0.05), m=worn('lever', '#c9ced8', 0.3, 0.9, grime=0.2), bevel=0.01, rot=(0, -0.3, 0)))
        k(mn.cyl('gauge', 0.03, 0.02, loc=(0, -0.05, L + 0.0), m=plain('gauge', '#ece8dc', 0.4), rot=R90, bevel=0.005))
        k(tube('hose', [(0.0, 0.03, L + 0.02), (0.08, 0.1, L - 0.05), (0.13, 0.16, L - 0.25), (0.12, 0.14, 0.2)], 0.02, plain('hose', '#1a1c22', 0.6), corner=0.06))
        return r, L
    k = Kit(); grp = []
    r, L = body(k)
    root = mn.link(bpy.data.objects.new('lay', None))
    for o in k.parts:
        if o.parent is None: o.parent = root
    root.rotation_euler = (0, math.radians(90), 0); root.location = (-0.32 + 0.03, 0, r)   # lying on its side, valve towards +x
    k.parts.append(root)
    k.outline(0.012); place(k, 'extinguisher', dirs=16)
    # standing in a wall bracket (for walls: a strap and a backplate, faces the camera)
    mn.reset(); k = Kit(); body(k)
    k(mn.box('plate', (0.34, 0.03, 0.5), loc=(0, 0.16, 0.12), m=worn('bplate', '#4a515e', 0.4, 0.6, grime=0.5)))
    k(ring('strap', r + 0.02, 0.02, 0.05, loc=(0, 0, 0.36), m=worn('strap', '#262a33', 0.5, 0.4, grime=0.2)))
    k(mn.box('sign', (0.3, 0.012, 0.1), loc=(0, 0.14, 0.66), m=plain('signr', '#c0392b', 0.5)))
    k(text('signt', 'FIRE', 0.06, (0, 0.13, 0.71), plain('signw', '#ffffff', 0.5), rot=R90), outline=False)
    k.outline(0.012); place(k, 'extinguisher_wall')

@job('sleeping_bag')
def bag_job():
    k = Kit(); green = plain('bag', '#3f7a5a', 0.75, sheen=0.5, gain=1.3)
    bag = k(mn.box('bag', (1.8, 0.7, 0.2), m=green, bevel=0.1)); bag.modifiers.new('puff', 'SUBSURF').levels = 2
    flap = k(mn.box('flap', (0.9, 0.62, 0.06), loc=(-0.42, 0.0, 0.16), m=green, bevel=0.03)); flap.modifiers.new('puff', 'SUBSURF').levels = 2
    for i in range(-2, 2):
        k(mn.box('quilt', (0.02, 0.62, 0.02), loc=(i * 0.3, 0, 0.205 if i * 0.3 < 0.12 else 0.18), m=plain('quiltd', '#2a5a40', 0.8)), outline=False)
    k(mn.box('zip', (1.5, 0.02, 0.02), loc=(-0.1, 0.33, 0.12), m=plain('zip', '#c9ced8', 0.3, metal=0.8)), outline=False)
    pl = k(mn.box('pillow', (0.42, 0.56, 0.13), loc=(0.66, 0, 0.12), m=plain('pillow', '#e9e6dc', 0.8, sheen=0.4), bevel=0.06)); pl.modifiers.new('puff', 'SUBSURF').levels = 2
    k(mn.box('dent', (0.2, 0.25, 0.02), loc=(0.66, 0, 0.245), m=plain('pillowd', '#d8d4c8', 0.8), bevel=0.01), outline=False)
    k.outline(0.013); place(k, 'sleeping_bag', 0.12)

@job('socks')
def socks_job():
    """Washing line in the reactor room (decor.js socks(15.0, 19.0, 24.6)): origin (17.0, 24.6)."""
    k = Kit(); cols = ['#e2574c', '#e8e4dc', '#5f9ad6', '#e8c34f', '#e2574c']
    Z = 1.05; pole = worn('pole', '#8a8f99', 0.4, 0.7, grime=0.5)
    for sx in (-2, 2):                            # two mop handles taped to floor stands
        k(mn.cyl('pole', 0.03, Z + 0.06, loc=(sx, 0, 0), m=plain('wood', '#b8874f', 0.6)))
        k(mn.cyl('stand', 0.14, 0.04, loc=(sx, 0, 0), m=pole, bevel=0.015))
        k(mn.cyl('tapep', 0.04, 0.08, loc=(sx, 0, 0.3), m=tape_mat(), bevel=0.01), outline=False)
    line = []
    for i in range(41):
        u = i / 40; line.append((-2 + 4 * u, 0, Z - 0.25 * 4 * u * (1 - u) * 0.5))
    k(tube('line', line, 0.008, plain('rope', '#d8d4c8', 0.7), corner=0.0), outline=False)
    pivots = []
    for i in range(5):
        u = (i + 1) / 6; x = -2 + 4 * u; z = Z - 0.25 * 4 * u * (1 - u) * 0.5
        pv = mn.link(bpy.data.objects.new('sp', None)); pv.location = (x, 0, z); pivots.append(pv); k.parts.append(pv)
        m = plain('sock%d' % i, cols[i], 0.85, sheen=0.4)
        pts = [(-0.08, 0), (-0.08, 0.29), (-0.05, 0.4), (0.06, 0.42), (0.15, 0.42), (0.15, 0.29), (0.08, 0.29), (0.08, 0)]
        s = k(prism('sock', pts, -0.025, 0.025, m, bevel=0.022, segs=3))
        s.rotation_euler = (math.radians(90), 0, 0); s.location = (0, 0, 0)   # hang in the XZ plane: game y -> -Z
        s.parent = pv
        cuff = k(mn.box('cuff', (0.17, 0.055, 0.06), loc=(0, 0, -0.07), m=plain('cuff%d' % i, '#ffffff' if i != 1 else '#e2574c', 0.85)), outline=False); cuff.parent = pv
        pin = k(mn.box('pin', (0.03, 0.03, 0.08), loc=(0, -0.02, -0.04), m=plain('pin', '#c9a46a', 0.6), bevel=0.008)); pin.parent = pv
    k.outline(0.012)
    F = list(range(1, 7))
    for fi, f in enumerate(F):
        bpy.context.scene.frame_set(f); t = fi / len(F) * math.tau / 1.2
        for i, pv in enumerate(pivots):
            pv.rotation_euler.y = math.sin(t * 1.2 + i) * 0.12; pv.keyframe_insert('rotation_euler', frame=f)
    place(k, 'socks', frames=F)

def cable_pts(pts):
    """decor.js cable(): quadratic segments through the points with a sideways sag."""
    out = [pts[0]]
    for i in range(1, len(pts)):
        (ax, ay), (bx, by) = pts[i - 1], pts[i]
        cx, cy = (ax + bx) / 2 + (by - ay) * 0.12, (ay + by) / 2 - (bx - ax) * 0.12
        for j in range(1, 13):
            t = j / 12
            out.append(((1 - t) ** 2 * ax + 2 * t * (1 - t) * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * t * (1 - t) * cy + t * t * by))
    return out

@job('cables')
def cables_job():
    for nm, pts, col, wpx, seed in (('cable_engine_l', [(20.8, 20.6), (19.9, 22.3), (20.3, 23.8)], '#c9662e', 5, 82),
                                    ('cable_engine_r', [(23.6, 20.6), (24.5, 22.3), (24.2, 23.8)], '#d2a62e', 4, 83)):
        mn.reset(); k = Kit()
        o = pts[0]; P = [(x - o[0], y - o[1]) for x, y in pts]
        r = wpx * U / 2 * 1.3
        k(tube('cable', [(x, y, r) for x, y in cable_pts(P)], r, plain('cab', col, 0.55, coat=0.2), corner=0.0))
        (ax, ay), (bx, by) = P[0], P[2]
        tape_strip(k, P[1][0], P[1][1], 0.5, math.atan2(by - ay, bx - ax) + math.pi / 2, seed + 1, z=0.0)
        tsp = k.parts[-1]; tsp.location.z += 2 * r - 0.004
        k.outline(0.012); place(k, nm)

def crack_model(k, length, a, seed, z=0.0):
    r = rng(seed)
    pts = [(-length / 2, 0.0)] + [(-length / 2 + i * length / 6, (r() - 0.5) * 0.25) for i in range(1, 7)]
    ca, sa = math.cos(a), math.sin(a)
    def rot(p): return (p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca)
    dark = plain('crack', '#0f1116', 0.9, gain=1.0); lip = plain('lip', '#8a93a5', 0.4, metal=0.6)
    def ribbon(P, wd, m, zz):
        L = [rot(p) for p in P]
        left, right = [], []
        for i, (x, y) in enumerate(L):
            j0, j1 = max(0, i - 1), min(len(L) - 1, i + 1)
            dx, dy = L[j1][0] - L[j0][0], L[j1][1] - L[j0][1]; n = math.hypot(dx, dy) or 1
            ww = wd * (0.4 if i in (0, len(L) - 1) else 1.0)
            left.append((x - dy / n * ww, y + dx / n * ww)); right.append((x + dy / n * ww, y - dx / n * ww))
        return k(prism('crack', left + right[::-1], zz, zz + 0.004, m, bevel=0), outline=False)
    ribbon(pts, 0.05, lip, z)                      # bent-up lip of the plate, then the dark gap
    ribbon(pts, 0.026, dark, z + 0.002)
    ribbon([(-length * 0.1, 0), (-length * 0.075, 0.11), (-length * 0.05, 0.22)], 0.016, dark, z + 0.002)

@job('cracks')
def cracks_job():
    """Floor cracks with their tape (decor.js drawFloorDecor), origin = crack centre."""
    jobs = [('crack_portgun', 1.6, 0.3, 41, lambda k: tape_x(k, 0, 0, 0.6, 42, z=0.006)),
            ('crack_bridge', 2.0, -0.5, 54, lambda k: (tape_strip(k, 0, 0, 0.6, 1.0, 55, z=0.006), tape_strip(k, 0.6, -0.3, 0.6, 1.2, 56, z=0.006))),
            ('crack_stargun', 1.4, 1.0, 61, lambda k: tape_x(k, 0, 0, 0.6, 62, z=0.006)),
            ('crack_starlock', 1.4, 0.2, 91, lambda k: tape_x(k, 0, 0, 0.6, 92, z=0.006))]
    for i, (nm, ln, a, seed, tp) in enumerate(jobs):
        if i: mn.reset()
        k = Kit(); crack_model(k, ln, a, seed); tp(k); place(k, nm)

@job('tape')
def tape_job():
    k = Kit(); tape_strip(k, 0, 0, 0.55, 0.0, 1); place(k, 'tape_strip', dirs=16)    # 180-degree symmetric: d8..d15 repeat d0..d7
    mn.reset(); k = Kit(); tape_x(k, 0, 0, 0.55, 1); place(k, 'tape_x')
    mn.reset(); k = Kit()                          # a roll, with a bit unrolled (decor.js tapeRoll)
    k(ring('roll', 10 * U, 5 * U, 0.1, m=tape_mat()))
    k(ring('core', 5.2 * U, 0.015, 0.101, m=plain('cardboard', '#c9a46a', 0.8)))
    tape_strip(k, 13 * U, 8 * U, 0.26, math.atan2(6, 11), 5, w=0.12)
    k.outline(0.012); place(k, 'tape_roll')

@job('junk')
def junk_job():
    steel = worn('nut', '#9aa3b5', 0.35, 0.85, grime=0.5, scratch=0.3, gain=1.1)
    for i, deg in enumerate((0, 15, 30, 45)):      # nuts are 6-fold symmetric: 4 turns cover every angle
        if i: mn.reset(); steel = worn('nut', '#9aa3b5', 0.35, 0.85, grime=0.5, scratch=0.3, gain=1.1)
        k = Kit()
        k(prism('nut', [(math.cos(j / 6 * math.tau) * 4.5 * U * 1.15, math.sin(j / 6 * math.tau) * 4.5 * U * 1.15) for j in range(6)], 0, 0.05, steel, bevel=0.008))
        k(mn.cyl('hole', 1.8 * U * 1.2, 0.052, m=plain('hole', '#3a3f4a', 0.6), bevel=0), outline=False)
        k.outline(0.008); place(k, f'nut_r{i}', math.radians(deg))
    # soda can lying on its side, dented; body in the tint mask (game colours: red, blue, green, yellow)
    mn.reset(); k = Kit()
    can = k(mn.cyl('can', 5.5 * U, 0.36, m=plain('canw', '#e8ecf0', 0.3, metal=0.6), rot=(0, math.radians(90), 0), bevel=0.01))
    can.location = (-0.19, 0, 5.5 * U)
    end = k(mn.cyl('end', 5.0 * U, 0.03, m=worn('canend', '#c9ced8', 0.25, 0.9, grime=0.2), rot=(0, math.radians(90), 0), bevel=0.006)); end.location = (0.17, 0, 5.5 * U)
    mn.tint(can)
    k.outline(0.01); place(k, 'soda_can', dirs=8, passes=('beauty', 'normal', 'height', 'mask'))
    # crumpled wrapper (tinted)
    mn.reset(); k = Kit()
    w = k(mn.sphere('wrap', 1, loc=(0, 0, 0.04), m=plain('wrapw', '#eeeeee', 0.25, metal=0.5), scale=(0.16, 0.1, 0.045), segs=10))
    d = w.modifiers.new('crumple', 'DISPLACE'); tx = bpy.data.textures.new('cr', 'VORONOI'); tx.noise_scale = 0.05; d.texture = tx; d.strength = 0.03
    mn.tint(w); k.outline(0.008); place(k, 'wrapper', passes=('beauty', 'normal', 'height', 'mask'))

@job('bucket')
def bucket_job():
    k = Kit(); blue = worn('bucket', '#4a7ab8', 0.45, 0.1, grime=0.6, scratch=0.4, gain=1.15)
    me = bpy.data.meshes.new('bucket'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.2, radius2=0.25, depth=0.3)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.15)); bm.to_mesh(me); bm.free()
    b = k(mn._obj('bucket', me)); mn.assign(b, blue); mn.bev(b, 0.015); mn.smooth(b)
    k(ring('rim', 0.255, 0.025, 0.03, loc=(0, 0, 0.29), m=blue))
    k(mn.cyl('water', 0.235, 0.005, loc=(0, 0, 0.24), m=plain('water', '#5a8a9a', 0.05, coat=1.0)), outline=False)
    k(tube('handle', [(-0.25, 0, 0.24), (-0.18, -0.05, 0.42), (0.0, -0.06, 0.47), (0.18, -0.05, 0.42), (0.25, 0, 0.24)], 0.01, plain('hdl', '#c9ced8', 0.3, metal=0.8), corner=0.05))
    k.outline(0.012); place(k, 'bucket')

if __name__ == '__main__':
    run()
