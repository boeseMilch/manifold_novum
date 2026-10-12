"""Interior walls, tileable along their length. 0.6 units thick (the gap between rooms in js/ship.js).

Occlusion: in the tilted view a wall of height H covers H * cos(50) / sin(50) = 0.84 H layout units of
floor *behind* it (north of it). So:
  * back walls (the north edge of a room, face towards the camera) are full height, H = 1.6:
    they only hide things beyond the room (the spine / the room above), never the room itself;
  * near walls (the south edge of a room: the camera looks over them into the room) are cut down to
    H = 0.35, a classic cutaway, so they hide only 0.3 units of the room;
  * vertical walls are full height (their sides are edge-on: only the top strip and the south end
    show), stepping down to the low variant over the last ~1.4 units before a near wall.

Renders (all tile exactly along their length; see the manifest's 'tile' / 'note'):
  ship/wall_h, ship/wall_h_low          1 unit along x. Origin: left end, bottom of the front face
                                        (the wall body lies north of the origin, y in [-0.6, 0])
  ship/wall_v, ship/wall_v_low          1 unit along y (the top strip only). Origin: the segment's
                                        north end, on the floor, centred on the wall (below the canvas)
  ship/wall_v_end, ship/wall_v_low_end  the south end (front face + the last bit of the top); origin:
                                        the end, on the floor, centred. Draw it, then the tiles over it.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
import mn
from shiplib import pmat, glow, pipe, render_exact

E = math.radians(mn.ELEVATION); SIN, COS = math.sin(E), math.cos(E)
THICK = 0.6
H_FULL, H_LOW = 1.6, 0.35
PV = 74 / (mn.PPU * SIN)                   # vertical walls: pitch giving an integer 74 px period (1.0063 units)
R90 = (math.radians(90), 0, 0)

def mats():
    return dict(
        body=pmat('body', '#3a414f', 0.6, 0.3, grime=0.4),
        cap=pmat('cap', '#2b303a', 0.55, 0.4, grime=0.5, grime_scale=3),
        cut=pmat('cut', '#23272f', 0.7, 0.2, grime=0.4, grime_scale=3),
        rim=pmat('rim', '#6a7383', 0.35, 0.8, grime=0.3),
        panel=pmat('panel', '#566070', 0.5, 0.35, grime=0.5, grime_scale=3),
        panel2=pmat('panel2', '#626c7c', 0.45, 0.35, grime=0.4, grime_scale=3),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5),
        steel=pmat('steel', '#a3abb8', 0.32, 0.85, grime=0.3),
        dark=pmat('dark', '#1c1f25', 0.6),
        teal=pmat('teal', '#3b7a8a', 0.4, 0.3, grime=0.3),
        copper=pmat('copper', '#a8743b', 0.35, 0.8, grime=0.4),
        light=glow('light', '#d8ecff', 1.4),
        hazard=pmat('hazard', None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=6.0, grime=0.3),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
    )

def tray(M, length_axis, a0, a1, z, per, pitch):
    """Cable tray on a wall top running along an axis ('x' or 'y') from a0 to a1, straps every pitch."""
    out = []
    def L(sz, c, zz, m, b=0.01):         # long box along the axis
        if length_axis == 'x': return mn.box('tr', (a1 - a0, sz, 0.04), loc=((a0 + a1) / 2, c, zz), m=m, bevel=b)
        return mn.box('tr', (sz, a1 - a0, 0.04), loc=(c, (a0 + a1) / 2, zz), m=m, bevel=b)
    mid = THICK / 2 if length_axis == 'x' else 0.0
    out.append(L(0.34, mid, z, M['dark'], 0.008))                       # channel floor
    for d in (-0.18, 0.18): out.append(L(0.04, mid + d, z, M['rim'], 0.012))
    for i, (d, m) in enumerate(zip((-0.09, 0.0, 0.09), M['cables'])):
        r = 0.04
        if length_axis == 'x': o = mn.cyl('cable', r, a1 - a0, loc=(a0, mid + d, z + 0.04 + r), m=m, rot=(0, math.radians(90), 0), bevel=0, verts=16)
        else: o = mn.cyl('cable', r, a1 - a0, loc=(d, a1, z + 0.04 + r), m=m, rot=R90, bevel=0, verts=16)
        out.append(o)
    k = math.ceil(a0 / pitch)
    while k * pitch + per < a1:                                           # straps
        c = k * pitch + per
        if length_axis == 'x': out.append(mn.box('strap', (0.05, 0.42, 0.03), loc=(c, mid, z + 0.12), m=M['steel'], bevel=0.01))
        else: out.append(mn.box('strap', (0.42, 0.05, 0.03), loc=(0, c, z + 0.12), m=M['steel'], bevel=0.01))
        k += 1
    return out

# ---------------------------------------------------------------------------
# Horizontal wall (runs along x, faces the camera at y = 0, body north of it)
# ---------------------------------------------------------------------------
def wall_h(H):
    mn.reset(); M = mats(); objs = []; A, B = -3.0, 4.0               # long pieces span [A, B]; we render [0, 1]
    yc = THICK / 2                                                    # body centre (Blender +y = north)
    low = H < 1
    objs.append(mn.box('body', (B - A, THICK, H - 0.08), loc=((A + B) / 2, yc, 0), m=M['body'], bevel=0.02))
    objs.append(mn.box('cap', (B - A, THICK + 0.04, 0.08), loc=((A + B) / 2, yc, H - 0.08), m=M['cut' if low else 'cap'], bevel=0.02))
    objs.append(mn.box('skirt', (B - A, 0.05, 0.12), loc=((A + B) / 2, -0.02, 0), m=M['skirt'], bevel=0.015))
    if low:
        for u in range(int(A), int(B)):
            objs.append(mn.box('lpanel', (0.95, 0.03, H - 0.24), loc=(u + 0.5, -0.01, 0.13), m=M['panel'], bevel=0.01))
            for x in (0.12, 0.88): objs.append(mn.cyl('rv', 0.02, 0.02, loc=(u + x, -0.025, 0.13 + (H - 0.24) / 2), m=M['steel'], rot=R90, verts=8, bevel=0.005))
        return objs + []
    for u in range(int(A), int(B)):                                   # per-unit panels
        objs.append(mn.box('lpanel', (0.95, 0.03, 0.66), loc=(u + 0.5, -0.01, 0.13), m=M['panel'], bevel=0.012))
        objs.append(mn.box('inset', (0.5, 0.02, 0.26), loc=(u + 0.5, -0.03, 0.3), m=M['body'], bevel=0.01))
        for sx in (-1, 1):
            for z in (0.33, 0.53): objs.append(mn.cyl('rv', 0.018, 0.02, loc=(u + 0.5 + sx * 0.21, -0.04, z), m=M['steel'], rot=R90, verts=8, bevel=0.005))
        for i in range(3): objs.append(mn.box('slot', (0.36, 0.01, 0.025), loc=(u + 0.5, -0.04, 0.37 + i * 0.06), m=M['dark'], bevel=0))
        objs.append(mn.box('upanel', (0.95, 0.03, H - 0.08 - 0.95), loc=(u + 0.5, -0.01, 0.95), m=M['panel2'], bevel=0.012))
        objs.append(mn.box('lamp_h', (0.6, 0.05, 0.1), loc=(u + 0.5, -0.03, 1.25), m=M['dark'], bevel=0.015))
        objs.append(mn.box('lamp', (0.52, 0.02, 0.05), loc=(u + 0.5, -0.06, 1.275), m=M['light'], bevel=0.005))
        objs.append(mn.box('clamp', (0.06, 0.16, 0.2), loc=(u + 0.5, -0.07, 0.78), m=M['steel'], bevel=0.015))
    objs.append(mn.cyl('pipe1', 0.055, B - A, loc=(A, -0.08, 0.84), m=M['teal'], rot=(0, math.radians(90), 0), bevel=0, verts=24))
    objs.append(mn.cyl('pipe2', 0.035, B - A, loc=(A, -0.06, 0.94), m=M['copper'], rot=(0, math.radians(90), 0), bevel=0, verts=20))
    objs += tray(M, 'x', A, B, H, 0.5, 1.0)
    return objs

def render_h(name, H):
    objs = wall_h(H); mn.outline(objs, thickness=0.012)
    top = THICK * SIN + H * COS + 0.25                                   # tray + margin
    y0 = -0.06; h = math.ceil((top - y0) * mn.PPU)
    render_exact(name, 0, 1, y0, y0 + h / mn.PPU, extra={'tile': [1, 0], 'height': H,
                 'note': 'repeat every w px along x (1 unit); origin = left end, bottom of the front face'})

# ---------------------------------------------------------------------------
# Vertical wall (runs along y, centred on x = 0). Pitch PV per tile.
# ---------------------------------------------------------------------------
def wall_v(H, end):
    """Wall from Blender y = 0 (the south end if end, else it continues) to y = 8 PV (north)."""
    mn.reset(); M = mats(); objs = []
    A, B = (0.0 if end else -3 * PV), 8 * PV
    low = H < 1
    objs.append(mn.box('body', (THICK, B - A, H - 0.08), loc=(0, (A + B) / 2, 0), m=M['body'], bevel=0.02))
    objs.append(mn.box('cap', (THICK + 0.04, B - A + (0.04 if end else 0), 0.08), loc=(0, (A + B) / 2 - (0.02 if end else 0), H - 0.08), m=M['cut' if low else 'cap'], bevel=0.02))
    if not low:
        objs += tray(M, 'y', A + (0.08 if end else 0), B, H, 0.5 * PV, PV)
    if end:                                                             # the end face, towards the camera
        hh = H - 0.2
        objs.append(mn.box('skirt', (THICK + 0.04, 0.05, 0.12), loc=(0, -0.02, 0), m=M['skirt'], bevel=0.015))
        objs.append(mn.box('endpanel', (THICK - 0.1, 0.03, hh - 0.04), loc=(0, -0.01, 0.13), m=M['panel'], bevel=0.012))
        for sx in (-1, 1):                                              # steel corner guards
            objs.append(mn.box('guard', (0.06, 0.06, H - 0.1), loc=(sx * (THICK / 2 + 0.0), -0.0, 0.0), m=M['steel'], bevel=0.015))
        if not low:
            objs.append(mn.box('lamp_h', (0.12, 0.05, 0.4), loc=(0, -0.03, 0.95), m=M['dark'], bevel=0.015))
            objs.append(mn.box('lamp', (0.06, 0.02, 0.32), loc=(0, -0.06, 0.99), m=M['light'], bevel=0.005))
            objs.append(mn.box('hz', (THICK - 0.14, 0.02, 0.22), loc=(0, -0.03, 0.3), m=M['hazard'], bevel=0.005))
    return objs

def render_v(name, H):
    objs = wall_v(H, False); mn.outline(objs, thickness=0.012)
    k = 3                                                               # tile k covers y in [k PV, (k+1) PV]
    top_s = lambda y: y * SIN + H * COS
    render_exact(name, -0.3125, 0.3125, top_s(k * PV), top_s((k + 1) * PV), origin=(0, (k + 1) * PV, 0),
                 extra={'tile': [0, 1], 'height': H, 'pitch': round(PV, 5),
                        'note': 'top strip only; repeat every h px along y (1 unit, 0.6% stretched to 74 px); origin = north end on the floor'})

def render_v_end(name, H):
    objs = wall_v(H, True); mn.outline(objs, thickness=0.012)
    y0 = -0.06; y1 = H * COS + 0.4 * SIN + 0.18
    h = math.ceil((y1 - y0) * mn.PPU)
    render_exact(name, -0.3125, 0.3125, y0, y0 + h / mn.PPU,
                 extra={'height': H, 'note': 'south end of a vertical wall: front face + last 0.4 units of top; draw before the wall_v tiles'})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    jobs = [('ship/wall_h', render_h, H_FULL), ('ship/wall_h_low', render_h, H_LOW),
            ('ship/wall_v', render_v, H_FULL), ('ship/wall_v_low', render_v, H_LOW),
            ('ship/wall_v_end', render_v_end, H_FULL), ('ship/wall_v_low_end', render_v_end, H_LOW)]
    for name, fn, H in jobs:
        if only and only not in name: continue
        fn(name, H)
