"""Shared helpers for the ship-interior kit (floors, walls, doors, airlocks, ladders, lamps, plaques).

Builds on the prototype floor/wall kit in models/ship/ (floor.py, walls.py): same materials, the
same 0.6 wall thickness, H_FULL = 1.6 back walls and H_LOW = 0.35 cut-down near walls.

Coordinates: helpers take *game* coordinates (x right, y down the screen) relative to the piece's
origin and convert to Blender (+Y = game up / north): G(x, y, z) -> (x, -y, z).

Rendering: win() renders a fixed window around the piece's ground origin, snapped so the origin
lands on a whole pixel, and with the same canvas for every state of a piece (so the game can swap
states without moving anything).
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy
from mathutils import Vector
import mn
from shiplib import pmat, glow, pipe, label, ring, render_exact

if os.environ.get('MN_SAMPLES'): mn.SAMPLES = int(os.environ['MN_SAMPLES'])
E = math.radians(mn.ELEVATION); SIN, COS = math.sin(E), math.cos(E)
THICK = 0.6                     # wall thickness (the gap between rooms in js/ship.js)
H_FULL, H_LOW = 1.6, 0.35       # back walls / cut-down near walls (see models/ship/walls.py)
COVER = H_FULL * COS / SIN      # floor a full-height top hides behind it (1.343 units)
R90 = (math.radians(90), 0, 0)
RY90 = (0, math.radians(90), 0)

def G(x, y, z=0.0):
    return (x, -y, z)

# ---------------------------------------------------------------------------
# Materials (wall kit palette from models/ship/walls.py, plus door / airlock parts)
# ---------------------------------------------------------------------------
def mats():
    M = dict(
        body=pmat('body', '#3a414f', 0.6, 0.3, grime=0.4),
        cap=pmat('cap', '#2b303a', 0.55, 0.4, grime=0.5, grime_scale=3),
        cut=pmat('cut', '#23272f', 0.7, 0.2, grime=0.4, grime_scale=3),
        rim=pmat('rim', '#6a7383', 0.35, 0.8, grime=0.3),
        panel=pmat('panel', '#566070', 0.5, 0.35, grime=0.5, grime_scale=3),
        panel2=pmat('panel2', '#626c7c', 0.45, 0.35, grime=0.4, grime_scale=3),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5),
        steel=pmat('steel', '#a3abb8', 0.32, 0.85, grime=0.3),
        dark=pmat('dark', '#1c1f25', 0.6),
        hole=pmat('hole', '#0c0d10', 0.9),
        teal=pmat('teal', '#3b7a8a', 0.4, 0.3, grime=0.3),
        copper=pmat('copper', '#a8743b', 0.35, 0.8, grime=0.4),
        greyp=pmat('greyp', '#6a6f7a', 0.45, 0.5, grime=0.4),
        light=glow('light', '#d8ecff', 1.4),
        hazard=pmat('hazard', None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=6.0, grime=0.3),
        hazard_big=pmat('hazard_big', None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=3.0, grime=0.45, grime_scale=4),
        yellow=pmat('yellow', '#e8c34f', 0.5, 0.0, grime=0.35),
        red=pmat('red', '#d8463c', 0.45, 0.0, grime=0.3),
        door=pmat('door', '#8a93a5', 0.42, 0.55, grime=0.45, grime_scale=4),
        door2=pmat('door2', '#727c8f', 0.45, 0.55, grime=0.45, grime_scale=4),
        blast=pmat('blast', '#5f6779', 0.5, 0.6, grime=0.6, grime_scale=3),
        tape=pmat('tape', '#b9bcc2', 0.85, 0.0),
        ink=pmat('ink', '#23252b', 0.6),
        paint_w=pmat('paint_w', '#e8ecf4', 0.6),
        rubber=pmat('rubber', '#262a33', 0.7),
        scorch=pmat('scorch', '#15130f', 0.95),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
    )
    return M

def lamp_mat(state):
    """Status lamp lens (js/art.js lamp()): open green, closed red, busy amber (on/off), dark."""
    col = {'open': '#47e07a', 'closed': '#e2574c', 'busy': '#ffb347', 'busy_off': '#6b4a20', 'off': '#2a2e36'}[state]
    if state in ('busy_off', 'off'): return pmat('lens_' + state, col, 0.25, 0.0)
    return glow('lens_' + state, col, 1.3)

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def gbox(name, x0, y0, x1, y1, z0, z1, m, bevel=0.015):
    """Box from game rect (x0, y0)-(x1, y1) (y down), heights z0..z1."""
    return mn.box(name, (x1 - x0, y1 - y0, z1 - z0), loc=((x0 + x1) / 2, -(y0 + y1) / 2, z0), m=m, bevel=bevel)

def rivet(x, y, z, M, facing='up', r=0.02):
    if facing == 'up': return mn.cyl('rv', r, 0.02, loc=G(x, y, z), m=M['steel'], verts=8, bevel=0.005)
    return mn.cyl('rv', r, 0.02, loc=G(x, y - 0.01, z), m=M['steel'], rot=R90, verts=8, bevel=0.005)   # on a south face

def tape_strip(x, y, z, length, ang, M, w=0.09):
    """Duct tape, lying flat (ang in degrees, on top surfaces)."""
    return mn.box('tape', (length, w, 0.006), loc=G(x, y, z), m=M['tape'], bevel=0.002, rot=(0, 0, math.radians(ang)))

def tape_front(x, y, z, length, ang, M, w=0.09):
    """Duct tape on a south-facing face (ang tilts it in the face)."""
    return mn.box('tape', (length, 0.006, w), loc=G(x, y + 0.004, z - w / 2), m=M['tape'], bevel=0.002, rot=(0, math.radians(ang), 0))

def tray(M, axis, a0, a1, z, c=0.0, pitch=1.0, per=0.5):
    """Cable tray on a wall top (same as models/ship/walls.py), along 'x' (at game y = c) or 'y' (at x = c).
    a0..a1 in game coords along the axis."""
    out = []
    def L(sz, off, zz, m, b=0.01):
        if axis == 'x': return mn.box('tr', (a1 - a0, sz, 0.04), loc=((a0 + a1) / 2, -(c + off), zz), m=m, bevel=b)
        return mn.box('tr', (sz, a1 - a0, 0.04), loc=(c + off, -(a0 + a1) / 2, zz), m=m, bevel=b)
    out.append(L(0.34, 0, z, M['dark'], 0.008))
    for d in (-0.18, 0.18): out.append(L(0.04, d, z, M['rim'], 0.012))
    for d, m in zip((-0.09, 0.0, 0.09), M['cables']):
        r = 0.04
        if axis == 'x': out.append(mn.cyl('cable', r, a1 - a0, loc=(a0, -(c + d), z + 0.04 + r), m=m, rot=RY90, bevel=0, verts=16))
        else: out.append(mn.cyl('cable', r, a1 - a0, loc=(c + d, -a0, z + 0.04 + r), m=m, rot=R90, bevel=0, verts=16))
    k = math.ceil((a0 - per) / pitch)
    while k * pitch + per < a1:
        p = k * pitch + per
        if p > a0:
            if axis == 'x': out.append(mn.box('strap', (0.05, 0.42, 0.03), loc=(p, -c, z + 0.12), m=M['steel'], bevel=0.01))
            else: out.append(mn.box('strap', (0.42, 0.05, 0.03), loc=(c, -p, z + 0.12), m=M['steel'], bevel=0.01))
        k += 1
    return out

def wall_x(M, x0, x1, yf, H, front=True, details=True, tray_on=True, body=True):
    """Horizontal wall (prototype ship/wall_h look), front face at game y = yf, body yf-0.6..yf,
    from x0 to x1. front=False: no panels (the face is hidden)."""
    objs = []
    low = H < 1
    if body:
        objs.append(gbox('body', x0, yf - THICK, x1, yf, 0, H - 0.08, M['body'], 0.02))
        objs.append(gbox('cap', x0, yf - THICK - 0.02, x1, yf + 0.02, H - 0.08, H, M['cut' if low else 'cap'], 0.02))
    if not front: return objs
    objs.append(gbox('skirt', x0, yf - 0.005, x1, yf + 0.045, 0, 0.12, M['skirt'], 0.015))
    if not details: return objs
    for u in range(math.floor(x0), math.ceil(x1)):
        a, b = max(u + 0.025, x0 + 0.025), min(u + 0.975, x1 - 0.025)
        if b - a < 0.2: continue
        cx = (a + b) / 2
        if low:
            objs.append(gbox('lpanel', a, yf - 0.005, b, yf + 0.025, 0.13, H - 0.11, M['panel'], 0.01))
            continue
        objs.append(gbox('lpanel', a, yf - 0.005, b, yf + 0.025, 0.13, 0.79, M['panel'], 0.012))
        if b - a > 0.6:
            objs.append(gbox('inset', cx - 0.25, yf + 0.015, cx + 0.25, yf + 0.035, 0.3, 0.56, M['body'], 0.01))
            for sx in (-1, 1):
                for z in (0.33, 0.53): objs.append(rivet(cx + sx * 0.21, yf + 0.04, z, M, 'front', 0.018))
            for i in range(3): objs.append(gbox('slot', cx - 0.18, yf + 0.035, cx + 0.18, yf + 0.045, 0.37 + i * 0.06, 0.395 + i * 0.06, M['dark'], 0))
            objs.append(gbox('lamp_h', cx - 0.3, yf + 0.005, cx + 0.3, yf + 0.055, 1.25, 1.35, M['dark'], 0.015))
            objs.append(gbox('lamp', cx - 0.26, yf + 0.05, cx + 0.26, yf + 0.07, 1.275, 1.325, M['light'], 0.005))
            objs.append(gbox('clamp', cx - 0.03, yf, cx + 0.03, yf + 0.16, 0.78, 0.98, M['steel'], 0.015))
        objs.append(gbox('upanel', a, yf - 0.005, b, yf + 0.025, 0.95, H - 0.08, M['panel2'], 0.012))
    if not low:
        objs.append(mn.cyl('pipe1', 0.055, x1 - x0, loc=(x0, -(yf + 0.08), 0.84), m=M['teal'], rot=RY90, bevel=0, verts=24))
        objs.append(mn.cyl('pipe2', 0.035, x1 - x0, loc=(x0, -(yf + 0.06), 0.94), m=M['copper'], rot=RY90, bevel=0, verts=20))
        if tray_on: objs += tray(M, 'x', x0, x1, H, c=yf - THICK / 2)
    return objs

def wall_y(M, cx, y0, y1, H, end=False, tray_on=True):
    """Vertical wall (prototype ship/wall_v look) centred on game x = cx from y0 (north) to y1 (south).
    end=True: the south end face is visible (panel, guards, lamp, hazard like ship/wall_v_end)."""
    objs = []
    low = H < 1
    objs.append(gbox('body', cx - THICK / 2, y0, cx + THICK / 2, y1, 0, H - 0.08, M['body'], 0.02))
    objs.append(gbox('cap', cx - THICK / 2 - 0.02, y0, cx + THICK / 2 + 0.02, y1 + (0.02 if end else 0), H - 0.08, H, M['cut' if low else 'cap'], 0.02))
    if not low and tray_on: objs += tray(M, 'y', y0, y1 - (0.08 if end else 0), H, c=cx)
    if end:
        objs += end_face(M, cx, y1, H)
    return objs

def end_face(M, cx, y, H, lamp=True, hazard=True):
    o = []
    hh = H - 0.2
    o.append(gbox('skirt', cx - THICK / 2 - 0.02, y - 0.005, cx + THICK / 2 + 0.02, y + 0.045, 0, 0.12, M['skirt'], 0.015))
    o.append(gbox('endpanel', cx - THICK / 2 + 0.05, y - 0.005, cx + THICK / 2 - 0.05, y + 0.025, 0.13, 0.13 + hh - 0.04, M['panel'], 0.012))
    for sx in (-1, 1):
        o.append(gbox('guard', cx + sx * THICK / 2 - 0.03, y - 0.03, cx + sx * THICK / 2 + 0.03, y + 0.03, 0, H - 0.1, M['steel'], 0.015))
    if H > 1:
        if lamp:
            o.append(gbox('lamp_h', cx - 0.06, y + 0.005, cx + 0.06, y + 0.055, 0.95, 1.35, M['dark'], 0.015))
            o.append(gbox('lamp', cx - 0.03, y + 0.05, cx + 0.03, y + 0.07, 0.99, 1.31, M['light'], 0.005))
        if hazard: o.append(gbox('hz', cx - THICK / 2 + 0.07, y + 0.01, cx + THICK / 2 - 0.07, y + 0.03, 0.3, 0.52, M['hazard'], 0.005))
    return o

def holdout(objs, on=True):
    for o in objs:
        if o.type == 'MESH': o.is_holdout = on

# ---------------------------------------------------------------------------
# Rendering: fixed windows (game-coordinate bounds) with the origin on a whole pixel
# ---------------------------------------------------------------------------
def win(name, gx0, gx1, gy0, gy1, zmax, origin=(0.0, 0.0), passes=('beauty', 'normal', 'height'), extra=None, frames=None,
        zmin=0.0):
    """Render the screen area covering game rect (gx0..gx1, gy0..gy1) with things up to zmax tall
    (and down to zmin). origin = the game point (on the floor) the manifest's ox/oy refers to."""
    ox_g, oy_g = origin
    sx0, sx1 = gx0, gx1                                          # screen x = game x
    top = -gy0 * SIN + zmax * COS                                # screen up (units) at the far top
    bot = -gy1 * SIN + zmin * COS
    gsx, gsy = ox_g, -oy_g * SIN                                 # origin on the screen plane
    P = mn.PPU
    x0 = gsx - math.ceil((gsx - sx0) * P) / P; x1 = gsx + math.ceil((sx1 - gsx) * P) / P
    y0 = gsy - math.ceil((gsy - bot) * P) / P; y1 = gsy + math.ceil((top - gsy) * P) / P
    return render_exact(name, x0, x1, y0, y1, passes=passes, extra=extra, frames=frames, origin=G(ox_g, oy_g))

def prism(name, pts, z0, z1, m, bevel=0.02):
    """Polygon (game coords, any winding) extruded from z0 to z1, bevelled: one clean body, no seams."""
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, -y, z0)) for x, y in pts]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.dissolve_limit(bm, angle_limit=0.01, verts=bm.verts[:], edges=bm.edges[:])
    bm.to_mesh(me); bm.free()
    o = mn._obj(name, me)
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    mn.smooth(o); return o
