"""The Red Comet pirate base's doors (js/dock.js baseGeom; the captain's quarters from the boss concept,
tools/blender/models/concepts/boss_hall.py, not in the game yet).

    blender -b --factory-startup --python tools/blender/models/base/doors.py -- [v|h|hl|brig|blast|floor ...] [quick]

Every sprite's origin is the centre of its door rect (q.x + q.w / 2, q.y + q.h / 2) on the floor, like
dock/door_jammed. All frames of one door share one fixed canvas (the same window), so the game can swap
them freely. Door rects are 0.6 deep (the wall) x 1.6 wide, except the blast door (0.7 x 2.0, the
concept's DOOR_E). The base's walls are 1.6 tall (H_FULL) with 0.35 low cutaways (H_LOW), like
models/dock/docklib.py. Leaves that slide into the wall are cut off at the frame posts' outer edge,
so nothing sticks out of the sprite into the wall.

Ordinary sliding doors (rusty Red Comet red, comet emblem split across the two leaves):
  base/door_v_f0..f5      door in an up-down wall (rect 0.6 x 1.6: bay-server room, barracks-gun corridor):
                          one leaf sliding north into the tall post (v -1.05..-0.8; the low cutaway post at
                          v 0.8..1.05 is 0.45 tall, like the dock ships: nothing tall in front of a walkable
                          floor), open = 0, .2 .. 1; lamps on the post tops: green (f0 closed but unlocked,
                          f5 open), amber while moving
  base/door_v_locked      closed, red lamps, red mag-lock bar
  base/door_h_f0..f5      door in a left-right wall, tall (rect 1.6 x 0.6: server room-barracks, gun
                          corridor-quarters): two leaves sliding left/right into posts (u +-0.8..1.05), a
                          lintel with an LED strip (green / amber / red)
  base/door_h_locked      closed, red LED, red mag-lock bar across the seam (the hacked barracks door, d.doors[1])
  base/door_hl_f0..f5     the same in a LOW cutaway wall (0.35; the quarters' south wall in the boss concept)
  base/door_hl_locked
The brig door (quarters' back wall, tall; the keypad on the wall to its right, mirrored on the starboard base):
  base/brig_<side>_locked     barred heavy door, keypad LED red, lintel strip red (d.doors[2] true)
  base/brig_<side>_f0..f5     unlocked (green), sliding open to the left (away from the keypad)
  keypad centre: (+1.4 * (port ? 1 : -1), +0.4) from the door centre, z 0.8..1.25, on the room side
The pirate-only blast door (quarters' east wall on the port base, west wall on the starboard one), rect 0.7 x 2.0:
  base/blast_<side>_closed        bolted, amber beacon dark
  base/blast_<side>_alarm_f0..3   closed, the beacon turning (pirates are about to come through)
  base/blast_<side>_f0..f5        opening: f0 bolts in, f1 bolts drawn, f2..f5 the slab slides into the wall
  base/blast_<side>_open_f0..3    open, beacon turning, the dark corridor beyond ("the rest of the base")
  base/blast_floor_<side>         floor decal in front of it (CREW ONLY / REST OF BASE, chevrons): floor layer
<side> = port | star. The corridor stub beyond the blast door sticks 1.1 out of the hull wall.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
os.environ.setdefault('DOCK_CPU', '1')
import bpy, bmesh
from mathutils import Vector, Matrix
import docklib as D
from docklib import *
from shiplib import render_exact

A = D.args()
QUICK = 'quick' in A
WHAT = [a for a in A if a in ('v', 'h', 'hl', 'brig', 'blast', 'floor')] or ['v', 'h', 'hl', 'brig', 'blast', 'floor']
ONLY = os.environ.get('MN_ONLY', '')
mn.SAMPLES = int(os.environ.get('MN_SAMPLES', 16 if QUICK else 48))
if QUICK:                                   # iterate without touching build/renders or the manifest
    mn.OUT_DIR = os.environ.get('MN_QUICK_DIR', '/tmp/mn_base_doors'); mn._manifest_put = lambda *a, **k: None

_reset0 = mn.reset
def _reset():
    s = _reset0()
    s.render.threads_mode = 'FIXED'; s.render.threads = int(os.environ.get('MN_THREADS', 6))
    return s
mn.reset = _reset

OPEN = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
OUTL = 0.013

# ---------------------------------------------------------------------------------------------------
# Materials (the base's rusty palette from the concepts, brightened by docklib.worn)
# ---------------------------------------------------------------------------------------------------
def mats():
    return dict(
        frame=worn('frame', '#5e4e4c', 0.45, 0.3, wear=0.6, rust=0.2),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15),
        door=worn('door', '#8e3a32', 0.5, 0.25, wear=0.9, grime=0.9, rust=0.3),
        door2=worn('door2', '#7e3430', 0.5, 0.25, wear=0.9, grime=0.9, rust=0.3, scale=1.3),
        gun=worn('gun', '#3a3e46', 0.4, 0.6, wear=0.6, rust=0.12),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6),
        rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5),
        tread=worn('tread', '#4c4a4e', 0.5, 0.6, wear=0.4, grime=1.1, scale=2),
        dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9), hole=pmat('hole', '#0c0d10', 0.9),
        rubber=pmat('rubber', '#262a33', 0.7), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        hazard=stripes_mat('hazard', k=6.0), hazard_big=stripes_mat('hazard_big', k=3.0, grime=0.5),
        hz_red=stripes_mat('hz_red', a='#c8352c', b='#1c1d22', k=2.6, grime=0.5),
        yellow=pmat('yellow', '#e8c34f', 0.5, 0.0, grime=0.35),
        cream=pmat('cream', '#e6dcc0', 0.6, 0.0, grime=0.4), white=pmat('white', '#e8ecf4', 0.6),
        red=pmat('red', '#d8463c', 0.45, 0.0, grime=0.3), comet=pmat('comet', '#ff7a2a', 0.45, 0.0, grime=0.2),
        cometh=pmat('cometh', '#ffd84a', 0.4), ink=pmat('ink', '#23252b', 0.6),
        tape=pmat('tape', '#b9bcc2', 0.85), note=pmat('note', '#ffe95c', 0.7), paper=pmat('paper', '#e6dcbe', 0.8),
        scorch=decal_mat('scorch', '#0a0908', 0.8, scale=4), oil=decal_mat('oil', '#0a0908', 0.7, rough=0.2),
        void=decal_mat('void', '#000000', 1.0, scale=1.5),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
        led_g=emit_mat('led_g', '#5aff9a', 1.3, base='#2a7a4a'), led_r=emit_mat('led_r', '#ff3a2a', 1.4, base='#6a1a14'),
        led_a=emit_mat('led_a', '#ffb43a', 1.3, base='#7a5a1a'), led_off=pmat('led_off', '#3a3430', 0.25),
        amber_dome=emit_mat('amber_dome', '#ff7000', 0.8, base='#e06a08'), amber_dim=emit_mat('amber_dim', '#ff7000', 0.12, base='#8a4a10'),
        amber_dead=pmat('amber_dead', '#7a5a2a', 0.2, 0.0),
        beam=glow('beam', '#ffa040', 0.9), keys=emit_mat('keys', '#ffb43a', 0.6, base='#5a4a2a'),
        cell=emit_mat('cell', '#9ab8d8', 0.35, base='#1a222c'), guide=emit_mat('guide', '#ffb43a', 1.0, base='#5a3a10'),
        exit=emit_mat('exit', '#ff3a2a', 0.8, base='#3a0a08'),
    )

LED = {'open': 'led_g', 'busy': 'led_a', 'locked': 'led_r', 'off': 'led_off'}

# ---------------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------------
def fpoly(name, pts, v, m, depth=0.006):
    """A flat polygon (u, z) on a south-facing face at v, standing out by depth (towards the camera)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(P(u, v, z)) for u, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)], vec=Vector((0, -depth, 0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return o

def tpoly(name, pts, z, m, depth=0.006):
    """A flat polygon (u, v) lying on a top surface at height z."""
    return prism(name, pts, z, z + depth, m, bevel=0)

def circle(cu, cz, r, n=28, a0=0.0):
    return [(cu + r * math.cos(a0 + 2 * math.pi * i / n), cz + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]

def clip_poly(pts, lo=None, hi=None):
    """Sutherland-Hodgman against u >= lo and u <= hi."""
    def cut(pts, inside, at):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if inside(p):
                if not inside(q): out.append(at(q, p))
                out.append(p)
            elif inside(q): out.append(at(q, p))
        return out
    def at_u(u0):
        return lambda a, b: (u0, a[1] + (b[1] - a[1]) * (u0 - a[0]) / (b[0] - a[0]))
    if lo is not None: pts = cut(pts, lambda p: p[0] >= lo, at_u(lo))
    if hi is not None and pts: pts = cut(pts, lambda p: p[0] <= hi, at_u(hi))
    return pts

def shift(objs, du=0.0, dv=0.0, dz=0.0):
    d = P(du, dv, dz) - P(0, 0, 0)
    for o in objs: o.location += d

def clip(objs, xlo=None, xhi=None, ylo=None, yhi=None):
    """Cut meshes (modifiers applied) to a Blender-world box: the parts slid into the wall disappear."""
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    planes = []
    if xlo is not None: planes.append(((xlo, 0, 0), (-1, 0, 0)))
    if xhi is not None: planes.append(((xhi, 0, 0), (1, 0, 0)))
    if ylo is not None: planes.append(((0, ylo, 0), (0, -1, 0)))
    if yhi is not None: planes.append(((0, yhi, 0), (0, 1, 0)))
    keep = []
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        bm = bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
        for co, no in planes:
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True)
        if not bm.faces:
            bm.free(); bpy.data.objects.remove(o, do_unlink=True); continue
        bm.to_mesh(me); bm.free()
        o.modifiers.clear(); o.data = me; o.matrix_world = Matrix.Identity(4)
        keep.append(o)
    return keep

def frv(u, v, z, M, r=0.02):
    return face_rivet(u, v, z, M['rivet'], r)

def trv(u, v, z, M, r=0.024):
    return rivet(u, v, z, M['rivet'], r)

def tape_face(u, v, z, l, ang, M, w=0.08):
    o = mn.box('tape', (l, 0.006, w), loc=P(u, v + 0.004, z - w / 2), m=M['tape'], bevel=0.002)
    o.rotation_euler = (0, math.radians(ang) * D.S, 0); return o

def tape_top(u, v, z, l, ang, M, w=0.08):
    return cbox('tape', u, v, l, w, z, 0.006, M['tape'], bevel=0.002, rotz=math.radians(ang))

def dome_lamp(u, v, z, M, state, r=0.07):
    o = [ucyl('lamp_base', r + 0.03, 0.04, u, v, z, M['dark'], verts=16, bevel=0.01)]
    o.append(mn.sphere('lamp', r, loc=P(u, v, z + 0.04), m=M[LED[state]], scale=(1, 1, 0.7), segs=16))
    o.append(ring('lamp_cage', r + 0.012, 0.014, 0.014, loc=P(u, v, z + 0.035), m=M['steel'], verts=20))
    return o

def window(name, u0, u1, v0, v1, zmax, extra=None):
    """Fixed screen window over local rect u0..u1, v0..v1 (things up to zmax), origin (0, 0) on a whole pixel."""
    x0g, x1g = sorted((D.S * u0, D.S * u1))
    top = -v0 * SIN + zmax * COS; bot = -v1 * SIN
    p = mn.PPU
    x0 = -math.ceil(-x0g * p) / p; x1 = math.ceil(x1g * p) / p
    y0 = -math.ceil(-bot * p) / p; y1 = math.ceil(top * p) / p
    return render_exact(name, x0, x1, y0, y1, extra=extra, origin=(0, 0, 0))

def outline(objs):
    objs = [o for o in objs if o.type == 'MESH' and not o.name.startswith(('rivet', 'frv', 'txt', 'tape', 'note', 'tally', 'em_', 'decal', 'key', 'guide', 'stencil'))]
    mn.outline(objs, thickness=OUTL)

def want(name):
    return not ONLY or ONLY in name

# ---------------------------------------------------------------------------------------------------
# The Red Comet emblem: black disc, cream ring, an orange comet with a yellow head (face coordinates u, z)
# ---------------------------------------------------------------------------------------------------
def emblem(cu, cz, R, v, M, lo=None, hi=None, prefix='em_'):
    o = []
    layers = [(circle(cu, cz, R, 32), M['cream'], 0.004), (circle(cu, cz, R * 0.8, 32), M['ink'], 0.007)]
    hu, hz = cu + R * 0.22, cz + R * 0.2
    tail = [(hu + R * 0.2, hz + R * 0.14), (cu - R * 0.62, cz - R * 0.5), (hu - R * 0.1, hz - R * 0.24)]
    layers += [(tail, M['comet'], 0.010), (circle(hu, hz, R * 0.22, 16), M['cometh'], 0.013)]
    for i, (pts, m, d) in enumerate(layers):
        pts = clip_poly(pts, lo, hi)
        if len(pts) >= 3: o.append(fpoly(f'{prefix}{i}', pts, v, m, d))
    return o

def emblem_top(cu, cv, R, z, M, lo=None, hi=None):
    """The same emblem lying on a top surface; lo/hi clip along v (the v door's seam)."""
    o = []
    def flip(pts): return [(b, a) for a, b in pts]           # clip works on the first coordinate
    for i, (pts, m, d) in enumerate([(circle(cv, cu, R, 32), M['cream'], 0.004), (circle(cv, cu, R * 0.78, 32), M['ink'], 0.007),
                                      (circle(cv - R * 0.2, cu + R * 0.1, R * 0.24, 16), M['cometh'], 0.013)]):
        pts = clip_poly(pts, lo, hi)
        if len(pts) >= 3: o.append(tpoly(f'em_{i}', flip(pts), z, m, d))
    tail = clip_poly([(cv - R * 0.32, cu + R * 0.28), (cv + R * 0.6, cu - R * 0.45), (cv - R * 0.05, cu - R * 0.12)], lo, hi)
    if len(tail) >= 3: o.append(tpoly('em_tail', flip(tail), z, M['comet'], 0.010))
    return o

# ---------------------------------------------------------------------------------------------------
# Ordinary sliding door in a LEFT-RIGHT wall (tall, or low = cutaway): rect u -0.8..0.8, v -0.3..0.3
# ---------------------------------------------------------------------------------------------------
HL, HT = 0.8, 0.36          # half opening, frame half depth
PW = 0.25                   # post width
LT = 0.12                   # leaf half thickness

def h_frame(M, state, low=False):
    o = []
    ph = 0.47 if low else 1.68
    # threshold: tread plate, yellow edges, the floor rail
    o.append(ubox('thr', -HL, -0.3, HL, 0.3, 0.0, 0.03, M['tread'], bevel=0.008))
    for vv in (-0.27, 0.27):
        o.append(ubox('thr_edge', -HL + 0.02, vv - 0.02, HL - 0.02, vv + 0.02, 0.03, 0.036, M['yellow'], bevel=0.004))
    o.append(ubox('rail', -HL, -0.03, HL, 0.03, 0.03, 0.034, M['hole'], bevel=0))
    o.append(disc('decal_oil', 0.35, 0.12, 0.034, 0.16, M['oil'], sv=0.6, rotz=0.4))
    for su in (-1, 1):
        a, b = su * HL, su * (HL + PW)
        u0, u1 = min(a, b), max(a, b)
        o.append(ubox('post', u0, -HT, u1, HT, 0.0, ph, M['frame'], bevel=0.025))
        inner = su * HL
        o.append(ubox('post_hz', inner - 0.045, HT - 0.005, inner + 0.045, HT + 0.012, 0.02, ph - 0.04, M['hazard'], bevel=0.004))
        outer = su * (HL + PW)
        o.append(ubox('guard', outer - 0.03, HT - 0.03, outer + 0.03, HT + 0.02, 0.0, ph - 0.04, M['steel'], bevel=0.012))
        o.append(ubox('post_cap', u0 + 0.03, -HT + 0.03, u1 - 0.03, HT - 0.03, ph, ph + 0.02, M['steel'], bevel=0.01))
        for vv in (-HT + 0.1, HT - 0.1): o.append(trv((u0 + u1) / 2, vv, ph + 0.02, M))
        if not low:
            for z in (0.5, 1.0, 1.45): o.append(frv(su * (HL + PW * 0.55), HT, z, M))
    if low:
        for su in (-1, 1):
            o.append(ubox('led', su * (HL + 0.06) - 0.05, -0.1, su * (HL + 0.06) + 0.05, 0.25, ph + 0.02, ph + 0.05, M[LED[state]], bevel=0.008))
        return o
    # lintel over the opening (the wall above the door) with the LED strip on its front
    LF = 0.2
    o.append(ubox('lintel', -HL - 0.02, -HT + 0.02, HL + 0.02, LF, 1.52, 1.68, M['body'], bevel=0.02))
    o.append(ubox('lintel_top', -HL + 0.05, -HT + 0.08, HL - 0.05, LF - 0.12, 1.68, 1.695, M['frame'], bevel=0.006))
    o.append(ubox('lintel_hz', -HL + 0.02, LF - 0.1, HL - 0.02, LF - 0.02, 1.68, 1.69, M['hazard'], bevel=0.003))
    o.append(ubox('led', -0.6, LF, 0.6, LF + 0.025, 1.565, 1.625, M[LED[state]], bevel=0.006))
    o.append(ubox('led_box', -0.64, LF - 0.01, 0.64, LF + 0.012, 1.55, 1.64, M['dark'], bevel=0.006))
    # right post: lamp box; left post: a cable run, taped on
    o.append(ubox('lampbox', HL + 0.06, HT, HL + 0.2, HT + 0.05, 1.12, 1.34, M['dark'], bevel=0.012))
    o.append(mn.sphere('lamp', 0.045, loc=P(HL + 0.13, HT + 0.05, 1.23), m=M[LED[state]], scale=(1, 0.6, 1), segs=14))
    for i, c in enumerate(M['cables'][:2]):
        uu = -HL - 0.1 - i * 0.06
        o.append(pipe_uv('cable', [(uu, HT + 0.03, 1.66), (uu, HT + 0.035, 0.9), (uu + 0.02, HT + 0.04, 0.05)], 0.018, c, corner=0.1))
    for z in (1.3, 0.55): o.append(tape_face(-HL - 0.13, HT + 0.05, z, 0.2, 8, M, w=0.06))
    return o

def h_leaves(M, k, state, low=False):
    """Two leaves; each closed half covers 0..0.8 from the seam and slides 0.8 * k into its post."""
    o = []
    lh = 0.42 if low else 1.52
    for su in (-1, 1):
        parts = []
        a, b = 0.0, su * HL
        u0, u1 = min(a, b), max(a, b)
        seam = 0.012 * su                                       # a hair of a gap at the seam
        u0s, u1s = (u0 + 0.006, u1) if su > 0 else (u0, u1 - 0.006)
        parts.append(ubox('leaf', u0s, -LT, u1s, LT, 0.02, lh, M['door' if su < 0 else 'door2'], bevel=0.02))
        F = LT                                                   # the front face
        parts.append(ubox('seal', seam - 0.012, F - 0.01, seam + 0.012, F + 0.012, 0.03, lh - 0.02, M['rubber'], bevel=0.005))
        parts.append(ubox('leaf_top', u0s + 0.02, -LT + 0.02, u1s - 0.02, LT - 0.02, lh, lh + 0.012, M['steel'], bevel=0.005))
        lead = su * 0.02
        parts.append(ubox('top_hz', min(lead, lead + su * 0.14), -LT + 0.03, max(lead, lead + su * 0.14), LT - 0.03, lh + 0.012, lh + 0.02, M['hazard'], bevel=0.003))
        if low:
            parts.append(ubox('hz_band', u0s + 0.02, F, u1s - 0.02, F + 0.012, 0.08, lh - 0.06, M['hazard_big'], bevel=0.004))
            for uu in (su * 0.3, su * 0.6): parts.append(frv(uu, F + 0.012, lh - 0.04, M, 0.016))
        else:
            parts.append(ubox('hz_band', u0s + 0.03, F, u1s - 0.03, F + 0.012, 0.04, 0.21, M['hazard_big'], bevel=0.004))
            parts.append(ubox('rib', u0s + 0.02, F, u1s - 0.02, F + 0.03, 0.72, 0.8, M['steel'], bevel=0.01))
            parts.append(ubox('rib_top', u0s + 0.02, F, u1s - 0.02, F + 0.02, 1.38, 1.43, M['steel'], bevel=0.008))
            for i in range(4):
                uu = su * (0.12 + i * 0.19)
                for z in (0.3, 0.64): parts.append(frv(uu, F + 0.01, z, M, 0.017))
            parts += emblem(0.0, 1.06, 0.26, F + 0.002, M, lo=(0.006 if su > 0 else None), hi=(-0.006 if su < 0 else None))
            if su < 0:
                # a sticky note (KNOCK FIRST), five scratched tally marks
                n = fpoly('note', [(-0.66, 1.18), (-0.47, 1.2), (-0.48, 1.36), (-0.67, 1.34)], F + 0.002, M['note'], 0.006)
                parts.append(n)
                parts.append(text('txt_knock', 'KNOCK', -0.57, F + 0.011, 1.3, 0.045, M['ink'], face=True))
                parts.append(text('txt_knock2', 'FIRST', -0.57, F + 0.011, 1.25, 0.045, M['ink'], face=True))
                for i in range(4):
                    uu = -0.68 + i * 0.035
                    parts.append(fpoly('tally', [(uu, 0.36), (uu + 0.012, 0.36), (uu + 0.017, 0.52), (uu + 0.005, 0.52)], F + 0.002, M['cream'], 0.004))
                parts.append(fpoly('tally', [(-0.71, 0.4), (-0.55, 0.49), (-0.555, 0.505), (-0.715, 0.415)], F + 0.002, M['cream'], 0.005))
            else:
                # a dent, taped over (an X of duct tape)
                parts.append(fpoly('decal_dent', circle(0.52, 0.45, 0.1, 16), F + 0.001, M['black'], 0.003))
                parts.append(tape_face(0.52, F + 0.002, 0.49, 0.32, 35, M)); parts.append(tape_face(0.52, F + 0.002, 0.49, 0.32, -35, M))
                parts.append(text('stencil', 'RC', 0.55, F + 0.009, 1.22, 0.12, M['cream'], face=True))
            if state == 'locked' and su < 0:
                parts.append(ubox('lockbar', -0.22, F + 0.012, 0.22, F + 0.05, 0.86, 0.94, M['led_r'], bevel=0.01))
                for uu in (-0.25, 0.25): parts.append(ubox('lockclamp', uu - 0.04, F + 0.01, uu + 0.04, F + 0.06, 0.82, 0.98, M['gun'], bevel=0.012))
        if low and state == 'locked' and su < 0:
            parts.append(ubox('lockbar', -0.2, -0.04, 0.2, 0.04, lh + 0.02, lh + 0.06, M['led_r'], bevel=0.01))
        shift(parts, du=su * (HL + 0.05) * k)
        lim = HL + PW - 0.02
        parts = clip(parts, xlo=-lim, xhi=lim)
        o += parts
    return o

def build_h(name, k, state, low=False):
    mn.reset(); set_side('port'); M = mats()
    lamp = state if state == 'locked' else ('busy' if 0 < k < 1 else 'open')
    o = h_frame(M, lamp, low) + h_leaves(M, k, state, low)
    outline(o)
    window(name, -(HL + PW + 0.05), HL + PW + 0.05, -HT - 0.05, HT + 0.08, (0.6 if low else 1.75),
           extra={'note': ('base door in a low left-right wall' if low else 'base door in a tall left-right wall') +
                  ' (rect 1.6 x 0.6); origin = rect centre, floor', 'open': k})

# ---------------------------------------------------------------------------------------------------
# Ordinary sliding door in an UP-DOWN wall (tall): rect u -0.3..0.3, v -0.8..0.8
# ---------------------------------------------------------------------------------------------------
VW = 0.36                   # frame half width (wall 0.6 + a lip)

VLT = 0.15                  # the v door's leaf half thickness
VLOW = 0.45                 # its south post: the low cutaway (nothing tall in front of a walkable floor)

def v_frame(M, state):
    """North post tall (the wall's jamb, the leaf slides into it), south post low (the cutaway)."""
    o = []
    o.append(ubox('thr', -0.3, -HL, 0.3, HL, 0.0, 0.03, M['tread'], bevel=0.008))
    for uu in (-0.27, 0.27):
        o.append(ubox('thr_edge', uu - 0.02, -HL + 0.02, uu + 0.02, HL - 0.02, 0.03, 0.036, M['yellow'], bevel=0.004))
    o.append(ubox('rail', -0.03, -HL, 0.03, HL, 0.03, 0.034, M['hole'], bevel=0))
    o.append(disc('decal_oil', -0.08, 0.35, 0.034, 0.14, M['oil'], sv=1.4, rotz=0.3))
    for sv in (-1, 1):
        ph = 1.68 if sv < 0 else VLOW
        a, b = sv * HL, sv * (HL + PW)
        v0, v1 = min(a, b), max(a, b)
        o.append(ubox('post', -VW, v0, VW, v1, 0.0, ph, M['frame'], bevel=0.025))
        o.append(ubox('post_cap', -VW + 0.03, v0 + 0.03, VW - 0.03, v1 - 0.03, ph, ph + 0.02, M['steel'], bevel=0.01))
        for uu in (-VW + 0.08, VW - 0.08): o.append(trv(uu, (v0 + v1) / 2, ph + 0.02, M))
        o += dome_lamp(0.0, (v0 + v1) / 2, ph + 0.02, M, state, r=0.06)
        fv = v1                                     # the face towards the camera (south)
        o.append(ubox('face_hz', -VW + 0.04, fv, VW - 0.04, fv + 0.012, 0.06, min(0.26, ph - 0.08), M['hazard'], bevel=0.004))
        for uu in (-VW, VW): o.append(ubox('guard', uu - 0.03, fv - 0.03, uu + 0.03, fv + 0.02, 0.0, ph - 0.04, M['steel'], bevel=0.012))
        if sv < 0:                                  # (seen in the opening once the leaf is in)
            for z in (0.5, 1.45):
                for uu in (-VW + 0.07, VW - 0.07): o.append(frv(uu, fv, z, M))
            o += emblem(0.0, 1.0, 0.18, fv + 0.002, M, prefix='em_post')
        else:
            o.append(ubox('lip_hz', -VW + 0.03, v0 + 0.02, VW - 0.03, v0 + 0.08, ph + 0.02, ph + 0.026, M['hazard'], bevel=0.002))
    return o

def v_leaves(M, k, state):
    """One leaf, closed v -0.8..0.8, sliding north into the tall post (and the wall behind it)."""
    parts = []
    lh = 1.52
    v0, v1 = -HL, HL - 0.006
    parts.append(ubox('leaf', -VLT, v0, VLT, v1, 0.02, lh, M['door'], bevel=0.022))
    parts.append(ubox('leaf_top', -VLT + 0.03, v0 + 0.02, VLT - 0.03, v1 - 0.02, lh, lh + 0.01, M['door2'], bevel=0.004))
    for uu in (-VLT + 0.015, VLT - 0.015):
        parts.append(ubox('leaf_edge', uu - 0.015, v0 + 0.01, uu + 0.015, v1 - 0.01, lh - 0.02, lh + 0.014, M['steel'], bevel=0.006))
    parts.append(ubox('top_hz', -VLT + 0.02, v1 - 0.16, VLT - 0.02, v1 - 0.02, lh + 0.012, lh + 0.02, M['hazard'], bevel=0.003))
    # the comet stripe down the top, the emblem, rivets, tape, an RC stencil
    parts.append(ubox('stripe', -0.03, v0 + 0.05, 0.03, v1 - 0.2, lh + 0.012, lh + 0.016, M['cream'], bevel=0.002))
    parts += emblem_top(0.0, 0.05, 0.13, lh + 0.02, M)
    for i in range(4):
        vv = -0.7 + i * 0.4
        if abs(vv - 0.05) < 0.2: continue
        for uu in (-VLT + 0.04, VLT - 0.04): parts.append(trv(uu, vv, lh + 0.012, M, 0.018))
    parts.append(tape_top(0.0, -0.45, lh + 0.016, 0.26, 62, M, w=0.06))
    parts.append(text('stencil', 'RC', 0.0, 0.42, lh + 0.02, 0.11, M['cream'], rotz=math.radians(90)))
    # the leading face (south, towards the camera, above the low post): rubber seal, hazard stripes
    parts.append(ubox('seal', -VLT + 0.01, v1, VLT - 0.01, v1 + 0.02, 0.04, lh - 0.04, M['rubber'], bevel=0.006))
    parts.append(ubox('face_hz', -VLT + 0.025, v1 + 0.018, VLT - 0.025, v1 + 0.03, 0.5, lh - 0.08, M['hazard_big'], bevel=0.004))
    parts.append(ubox('handle', -0.04, v1 + 0.02, 0.04, v1 + 0.07, 0.8, 1.15, M['steel'], bevel=0.012))
    if state == 'locked':
        parts.append(ubox('lockbar', -VLT - 0.01, v1 - 0.1, VLT + 0.01, v1 + 0.06, 1.05, 1.15, M['led_r'], bevel=0.012))
    shift(parts, dv=-(2 * HL + 0.05) * k)
    lim = HL + PW - 0.02
    return clip(parts, yhi=lim)

def build_v(name, k, state):
    mn.reset(); set_side('port'); M = mats()
    lamp = state if state == 'locked' else ('busy' if 0 < k < 1 else 'open')
    o = v_frame(M, lamp) + v_leaves(M, k, state)
    outline(o)
    window(name, -VW - 0.06, VW + 0.06, -(HL + PW + 0.05), HL + PW + 0.08, 1.8,
           extra={'note': 'base door in an up-down wall (rect 0.6 x 1.6); origin = rect centre, floor', 'open': k})

# ---------------------------------------------------------------------------------------------------
# The brig door (left-right wall, tall), keypad on the wall to its right (port; left on the starboard base)
# ---------------------------------------------------------------------------------------------------
KU = 1.4                    # g.keypad: pt(-32.4) vs the door's centre -33.8

def brig_frame(M, state):
    o = []
    ph = 1.7
    o.append(ubox('thr', -HL, -0.3, HL, 0.3, 0.0, 0.03, M['tread'], bevel=0.008))
    o.append(ubox('thr_hz', -HL + 0.03, 0.12, HL - 0.03, 0.28, 0.03, 0.036, M['hz_red'], bevel=0.004))
    o.append(ubox('rail', -HL, -0.03, HL, 0.03, 0.03, 0.034, M['hole'], bevel=0))
    for su in (-1, 1):
        a, b = su * HL, su * (HL + PW)
        u0, u1 = min(a, b), max(a, b)
        o.append(ubox('post', u0, -HT, u1, HT, 0.0, ph, M['gun'], bevel=0.025))
        o.append(ubox('post_hz', u0 + 0.03, HT - 0.005, u1 - 0.03, HT + 0.012, 0.03, ph - 0.05, M['hazard'], bevel=0.005))
        o.append(ubox('post_cap', u0 + 0.03, -HT + 0.03, u1 - 0.03, HT - 0.03, ph, ph + 0.02, M['steel'], bevel=0.01))
        for vv in (-HT + 0.1, HT - 0.1): o.append(trv((u0 + u1) / 2, vv, ph + 0.02, M))
    LF = 0.22
    o.append(ubox('lintel', -HL - 0.02, -HT + 0.02, HL + 0.02, LF, 1.5, ph, M['dark'], bevel=0.02))
    o.append(ubox('lintel_hz', -HL + 0.02, LF - 0.1, HL - 0.02, LF - 0.02, ph, ph + 0.01, M['hz_red'], bevel=0.003))
    o.append(text('txt_brig', 'BRIG', -0.25, LF + 0.006, 1.6, 0.13, M['led_r'], face=True))
    led = M['led_r'] if state == 'locked' else M['led_g']
    o.append(ubox('led', 0.12, LF, 0.66, LF + 0.02, 1.57, 1.63, led, bevel=0.006))
    # the keypad on the wall, right of the door: mounting plate, 3x3 amber keys, status LED, a sticky note
    o.append(ubox('kp_plate', KU - 0.3, HT - 0.06, KU + 0.3, HT - 0.0, 0.62, 1.42, M['frame'], bevel=0.015))
    for z in (0.68, 1.36):
        for uu in (KU - 0.24, KU + 0.24): o.append(frv(uu, HT, z, M, 0.018))
    o.append(ubox('keypad', KU - 0.2, HT, KU + 0.2, HT + 0.08, 0.78, 1.27, M['dark'], bevel=0.02))
    o.append(ubox('kp_screen', KU - 0.15, HT + 0.08, KU + 0.15, HT + 0.09, 1.13, 1.22, led, bevel=0.004))
    for i in range(3):
        for j in range(3):
            o.append(ubox('key', KU - 0.15 + i * 0.105, HT + 0.08, KU - 0.07 + i * 0.105, HT + 0.1, 0.83 + j * 0.095, 0.9 + j * 0.095, M['keys'], bevel=0.006))
    o.append(mn.sphere('kp_lamp', 0.03, loc=P(KU + 0.13, HT + 0.08, 1.31), m=led, scale=(1, 0.6, 1), segs=12))
    n = fpoly('note', [(KU + 0.05, 1.0), (KU + 0.26, 0.97), (KU + 0.28, 1.17), (KU + 0.07, 1.2)], HT + 0.1, M['note'], 0.006)
    o.append(n)
    o.append(text('txt_note', 'NOT', KU + 0.165, HT + 0.11, 1.12, 0.045, M['ink'], face=True))
    o.append(text('txt_note2', '1234', KU + 0.165, HT + 0.11, 1.06, 0.045, M['ink'], face=True))
    o.append(pipe_uv('kp_wire', [(KU - 0.1, HT + 0.03, 0.78), (KU - 0.12, HT + 0.03, 0.5), (KU - 0.42, HT + 0.03, 0.35), (KU - 0.52, HT + 0.03, 0.35)], 0.015, M['cables'][0], corner=0.08))
    o.append(tape_face(KU - 0.3, HT + 0.03, 0.39, 0.12, 0, M, w=0.06))
    return o

def brig_leaf(M, k, state):
    """One heavy barred slab, closed u -0.8..0.8, sliding 1.6 * k to the left (away from the keypad)."""
    parts = []
    lh, F = 1.5, LT + 0.02
    parts.append(ubox('leaf', -HL, -LT - 0.02, HL - 0.006, F, 0.02, lh, M['gun'], bevel=0.025))
    parts.append(ubox('leaf_top', -HL + 0.02, -LT, HL - 0.03, F - 0.02, lh, lh + 0.012, M['steel'], bevel=0.005))
    parts.append(ubox('hz_band', -HL + 0.04, F, HL - 0.05, F + 0.012, 0.04, 0.22, M['hz_red'], bevel=0.004))
    # the barred window (a dim cell light behind it)
    parts.append(ubox('win_frame', -0.36, F, 0.36, F + 0.03, 0.88, 1.36, M['steel'], bevel=0.012))
    parts.append(ubox('win', -0.3, F + 0.02, 0.3, F + 0.035, 0.94, 1.3, M['cell'], bevel=0.004))
    for i in range(5):
        uu = -0.24 + i * 0.12
        parts.append(ucyl('bar', 0.018, 0.36, uu, F + 0.05, 0.94, M['steel'], verts=10, bevel=0.003))
    # straps, rivets, a plaque, a pull handle by the leading edge
    for z in (0.3, 0.72):
        parts.append(ubox('strap', -HL + 0.03, F, HL - 0.04, F + 0.025, z, z + 0.08, M['steel'], bevel=0.01))
        for i in range(7): parts.append(frv(-0.68 + i * 0.22, F + 0.025, z + 0.04, M, 0.016))
    parts.append(ubox('plaque', -0.36, F, 0.36, F + 0.014, 0.44, 0.62, M['cream'], bevel=0.006))
    parts.append(text('txt_p1', 'DO NOT FEED', 0.0, F + 0.017, 0.565, 0.06, M['ink'], face=True))
    parts.append(text('txt_p2', 'THE PRISONERS', 0.0, F + 0.017, 0.495, 0.06, M['ink'], face=True))
    parts.append(ubox('handle', 0.6, F + 0.03, 0.66, F + 0.08, 0.6, 1.05, M['steel'], bevel=0.015))
    for z in (0.62, 1.03): parts.append(ubox('handle_m', 0.6, F, 0.66, F + 0.06, z - 0.02, z + 0.02, M['steel'], bevel=0.006))
    parts.append(tape_face(-0.55, F + 0.01, 1.2, 0.36, 20, M))
    parts.append(ubox('seal', HL - 0.03, -LT, HL - 0.006, F + 0.01, 0.03, lh - 0.02, M['rubber'], bevel=0.005))
    if state == 'locked':
        parts.append(ubox('bolt', HL - 0.12, F + 0.005, HL + 0.18, F + 0.04, 0.95, 1.05, M['red'], bevel=0.012))
    shift(parts, du=-(2 * HL + 0.05) * k)
    lim = HL + PW - 0.02
    return clip(parts, xlo=-lim if D.S > 0 else None, xhi=lim if D.S < 0 else None)

def build_brig(side, name, k, state):
    mn.reset(); set_side(side); M = mats()
    o = brig_frame(M, state) + brig_leaf(M, k, state)
    outline(o)
    window(name, -(HL + PW + 0.05), KU + 0.36, -HT - 0.05, HT + 0.16, 1.8,
           extra={'note': f'brig door ({side}): tall left-right wall, rect 1.6 x 0.6, keypad on the wall at u = {KU if side == "port" else -KU}; origin = rect centre, floor', 'open': k})

# ---------------------------------------------------------------------------------------------------
# The pirate-only blast door: east wall of the quarters (port; west on the starboard base),
# rect u -0.35..0.35, v -1.0..1.0; the room is at -u (P mirrors it for the starboard base)
# ---------------------------------------------------------------------------------------------------
BW, BL = 0.35, 1.0           # half wall, half opening
BP = 0.34                    # post depth (along v)
BU0, BU1 = -0.78, 0.42       # posts' u range (sticking 0.43 into the room)
TUN = 1.45                   # the corridor beyond runs to u = TUN

def blast_frame(M, beacon, t, open_k):
    o = []
    ph = 1.76
    # the dark corridor beyond: its floor, its walls (north tall, south low), guide lights into the dark
    o.append(ubox('tun_floor', BW - 0.02, -BL, TUN, BL, -0.02, 0.03, worn('tun', '#2c2a2e', 0.6, 0.5, wear=0.2, grime=1.2), bevel=0.006))
    for i in range(5):                                  # floor plate seams in the dark
        o.append(ubox('tun_seam', BW + 0.2 + i * 0.22, -BL + 0.02, BW + 0.21 + i * 0.22, BL - 0.02, 0.03, 0.032, M['hole'], bevel=0))
    # (a low cutaway on both sides, so the floor shows: the 'rest of the base' trails off into the dark)
    for sv in (-1, 1):
        a, b = sv * BL, sv * (BL + BP)
        o.append(ubox('tun_wall', BU1 - 0.02, min(a, b), TUN, max(a, b), 0.0, 0.35, M['hull'], bevel=0.025))
        o.append(ubox('tun_lip', BU1, min(a, a + sv * 0.06), TUN - 0.12, max(a, a + sv * 0.06), 0.33, 0.365, M['rim'], bevel=0.006))
    o.append(ubox('tun_rib', TUN - 0.12, -BL - BP, TUN, BL + BP, 0.0, 0.42, M['frame'], bevel=0.02))
    o.append(ubox('tun_rib_hz', TUN - 0.11, -BL + 0.05, TUN - 0.01, BL - 0.05, 0.42, 0.43, M['hazard'], bevel=0.003))
    for i in range(4):
        uu = BU1 + 0.08 + i * 0.25
        o.append(cbox('guide', uu, 0.0, 0.07, 0.07, 0.03, 0.012, M['guide'] if i < 3 else M['led_off'], bevel=0.004))
    o.append(disc('decal_dark', TUN - 0.15, 0.0, 0.045, 1.1, M['void'], sv=1.1))
    o.append(disc('decal_dark2', TUN - 0.05, 0.0, 0.046, 0.8, M['void'], sv=1.3))
    o.append(ubox('exit', TUN - 0.5, -BL - 0.03, TUN - 0.28, -BL + 0.01, 0.36, 0.38, M['exit'], bevel=0.003))
    # the threshold in the wall
    o.append(ubox('thr', -BW, -BL, BW, BL, 0.0, 0.035, M['tread'], bevel=0.008))
    o.append(ubox('thr_hz', -BW + 0.02, -BL + 0.02, -BW + 0.16, BL - 0.02, 0.035, 0.04, M['hz_red'], bevel=0.003))
    o.append(ubox('slot', -0.04, -BL, 0.22, BL, 0.035, 0.038, M['hole'], bevel=0))
    for sv in (-1, 1):
        a, b = sv * BL, sv * (BL + BP)
        v0, v1 = min(a, b), max(a, b)
        o.append(ubox('post', BU0, v0, BU1, v1, 0.0, ph, M['gun'], bevel=0.035))
        o.append(ubox('post_cap', BU0 + 0.04, v0 + 0.04, BU1 - 0.04, v1 - 0.04, ph, ph + 0.03, M['steel'], bevel=0.012))
        for uu in (BU0 + 0.12, BU1 - 0.12):
            o.append(mn.cyl('bolt', 0.045, 0.05, loc=P(uu, (v0 + v1) / 2, ph + 0.03), m=M['steel'], verts=6, bevel=0.01))
        # the room-side corner: red-black stripes all the way up
        o.append(ubox('post_hz', BU0 - 0.012, v0 + 0.03, BU0 + 0.0, v1 - 0.03, 0.05, ph - 0.05, M['hz_red'], bevel=0.003))
        o.append(ubox('post_edge', BU0 - 0.02, v0 - 0.0, BU0 + 0.1, v1, ph - 0.12, ph, M['hz_red'], bevel=0.01))
        # the face towards the camera (south)
        fv = v1
        o.append(ubox('face_hz', BU0 + 0.03, fv, BU1 - 0.03, fv + 0.012, 0.04, 0.3, M['hz_red'], bevel=0.004))
        for z in (0.45, 1.0, 1.55):
            for uu in (BU0 + 0.07, BU1 - 0.07): o.append(frv(uu, fv, z, M, 0.022))
    # the plaque on the south post's face (the one the camera sees in full), and a taped note
    fv = BL + BP
    pc = (BU0 + BU1) / 2 - 0.08
    o.append(ubox('plaque', pc - 0.4, fv, pc + 0.4, fv + 0.016, 0.78, 1.36, M['cream'], bevel=0.01))
    o.append(ubox('plaque_band', pc - 0.4, fv + 0.012, pc + 0.4, fv + 0.02, 1.18, 1.36, M['red'], bevel=0.004))
    o.append(text('txt_crew', 'CREW ONLY', pc, fv + 0.025, 1.265, 0.105, M['white'], face=True))
    o.append(text('txt_rest', 'REST OF BASE', pc, fv + 0.02, 1.06, 0.085, M['ink'], face=True))
    o.append(text('txt_rest2', '>>>', pc, fv + 0.02, 0.91, 0.1, M['red'], face=True))
    for uu in (pc - 0.36, pc + 0.36):
        for z in (0.82, 1.32): o.append(frv(uu, fv + 0.016, z, M, 0.016))
    o.append(fpoly('note', [(pc - 0.3, 0.4), (pc + 0.05, 0.43), (pc + 0.03, 0.68), (pc - 0.32, 0.65)], fv + 0.002, M['paper'], 0.006))
    o.append(text('txt_n1', 'OPENS FROM', pc - 0.135, fv + 0.012, 0.6, 0.045, M['ink'], face=True))
    o.append(text('txt_n2', 'THE OTHER SIDE', pc - 0.135, fv + 0.012, 0.545, 0.04, M['ink'], face=True))
    o.append(text('txt_n3', 'OBVIOUSLY', pc - 0.135, fv + 0.012, 0.47, 0.045, M['red'], face=True))
    o.append(tape_face(pc - 0.13, fv + 0.01, 0.72, 0.24, 6, M, w=0.06))
    # the hydraulic ram on the north post's top: pushes the slab into the wall
    o.append(ucyl('ram', 0.07, 0.6, 0.08, -BL - BP + 0.02, ph + 0.1, M['steel'], axis='v', verts=16, bevel=0.01))
    o.append(ubox('ram_mount', -0.08, -BL - BP + 0.0, 0.24, -BL - BP + 0.12, ph + 0.03, ph + 0.2, M['dark'], bevel=0.015))
    # the amber beacon on the south post
    bu, bv = BU0 + 0.22, BL + BP / 2
    # (big enough to read at 48 px/unit; it flashes: bright while the mirror faces the camera, dim the other half turn)
    o.append(ucyl('beacon_base', 0.135, 0.07, bu, bv, ph + 0.03, M['dark'], verts=20))
    lit = beacon is not None
    hot = lit and (beacon % 1.0) < 0.5
    o.append(mn.sphere('beacon', 0.115, loc=P(bu, bv, ph + 0.12), m=(M['amber_dome'] if hot else M['amber_dim']) if lit else M['amber_dead'], scale=(1, 1, 1.0), segs=20))
    o.append(ring('beacon_cage', 0.125, 0.016, 0.02, loc=P(bu, bv, ph + 0.12), m=M['steel'], verts=24))
    if lit:
        a = beacon * 2 * math.pi
        b = mn.box('beam', (0.32, 0.07, 0.06), loc=P(bu, bv, ph + 0.09), m=M['beam'], bevel=0.01)
        b.rotation_euler = (0, 0, a); o.append(b)
    return o

def blast_slab(M, bolts, k):
    """The slab: u -0.12..0.2 in the wall, closed v -1..1, slides 2.0 * k north into the wall.
    Bolts: three bars on its top, east half (the pirates' side), drawn back by 'bolts' (0..1)."""
    parts = []
    u0, u1, top = -0.24, 0.26, 1.64
    parts.append(ubox('slab', u0, -BL, u1, BL - 0.01, 0.02, top, M['body'], bevel=0.035))
    parts.append(ubox('slab_top', u0 + 0.03, -BL + 0.03, u1 - 0.03, BL - 0.04, top, top + 0.012, M['hz_red'], bevel=0.004))
    for vv in (-0.82, -0.4, 0.4, 0.82):             # heavy cross ribs
        parts.append(ubox('rib', u0 - 0.01, vv - 0.045, u1 + 0.01, vv + 0.045, top - 0.1, top + 0.05, M['steel'], bevel=0.015))
        parts.append(trv(u0 + 0.06, vv, top + 0.05, M, 0.022)); parts.append(trv(u1 - 0.06, vv, top + 0.05, M, 0.022))
    parts.append(ubox('plate', u0 + 0.05, -0.3, u1 - 0.05, 0.3, top + 0.012, top + 0.02, M['ink'], bevel=0.004))
    parts.append(text('stencil', 'CREW ONLY', (u0 + u1) / 2, 0.0, top + 0.021, 0.13, M['cream'], rotz=math.radians(90)))
    parts.append(ubox('slab_lead', u0 - 0.015, BL - 0.1, u1 + 0.015, BL - 0.01, 0.02, top + 0.04, M['steel'], bevel=0.015))
    parts.append(ubox('slab_lead_hz', u0, BL - 0.01, u1, BL + 0.005, 0.1, top - 0.08, M['hz_red'], bevel=0.003))
    parts.append(ubox('slab_face', u0 - 0.012, -BL + 0.04, u0, BL - 0.05, 0.05, top - 0.05, M['hz_red'], bevel=0.003))
    # the bolts are on THEIR side (east): bars across the slab's east edge, drawn back when they open up
    for vv in (-0.2, 0.2, 0.62):
        du = 0.14 * bolts
        parts.append(ubox('boltbar', 0.08 + du, vv - 0.055, 0.5 + du, vv + 0.055, top + 0.0, top + 0.09, M['steel'], bevel=0.02))
        parts.append(ubox('boltknob', 0.3 + du, vv - 0.02, 0.36 + du, vv + 0.02, top + 0.09, top + 0.15, M['red'], bevel=0.012))
    parts.append(tape_top(-0.05, -0.6, top + 0.018, 0.3, 80, M, w=0.07))
    shift(parts, dv=-(2 * BL + 0.06) * k)
    lim = BU1 - 0.01
    return clip(parts, yhi=BL + BP - 0.03, xhi=lim if D.S > 0 else None, xlo=-lim if D.S < 0 else None)

def build_blast(side, name, bolts, k, beacon=None):
    mn.reset(); set_side(side); M = mats()
    o = blast_frame(M, beacon, 0, k) + blast_slab(M, bolts, k)
    outline(o)
    window(name, BU0 - 0.06, TUN + 0.02, -BL - BP - 0.05, BL + BP + 0.08, 1.98,
           extra={'note': f'pirate-only blast door ({side}): rect 0.7 x 2.0 in the quarters side wall, room at {"-x" if side == "port" else "+x"}; '
                          'origin = rect centre, floor; the corridor stub reaches 1.1 past the wall', 'open': k})

def build_blast_floor(side, name):
    mn.reset(); set_side(side); M = mats(); o = []
    fu = -BW - 0.75
    o.append(text('txt_f1', 'CREW ONLY', fu - 0.12, 0.0, 0.002, 0.22, M['yellow'], rotz=math.radians(90)))
    o.append(text('txt_f2', 'REST OF BASE', fu + 0.14, 0.0, 0.002, 0.13, M['yellow'], rotz=math.radians(90)))
    for i in range(4):                                      # chevrons pointing at the door
        vv = -0.75 + i * 0.5
        a = fu + 0.38
        pts = [(a, vv - 0.16), (a + 0.12, vv), (a, vv + 0.16), (a - 0.07, vv + 0.16), (a + 0.05, vv), (a - 0.07, vv - 0.16)]
        o.append(tpoly('chev', pts, 0.002, M['hz_red'] if False else M['yellow'], 0.004))
    o.append(disc('decal_scuff', fu + 0.2, 0.3, 0.001, 0.3, M['oil'], sv=1.6, rotz=0.2))
    window(name, -BW - 1.35, -BW - 0.05, -BL - 0.1, BL + 0.1, 0.05,
           extra={'note': f'floor decal in front of the blast door ({side}); origin = blast door rect centre; draw on the floor layer'})

# ---------------------------------------------------------------------------------------------------
if __name__ == '__main__':
    import time
    t0 = time.time()
    for kind in ('v', 'h', 'hl'):
        if kind not in WHAT: continue
        nm = f'base/door_{kind}'
        for i, k in enumerate(OPEN):
            if want(f'{nm}_f{i}'):
                build_v(f'{nm}_f{i}', k, 'ok') if kind == 'v' else build_h(f'{nm}_f{i}', k, 'ok', low=kind == 'hl')
        if want(f'{nm}_locked'):
            build_v(f'{nm}_locked', 0.0, 'locked') if kind == 'v' else build_h(f'{nm}_locked', 0.0, 'locked', low=kind == 'hl')
    sides = [s for s in ('port', 'star') if s in A] or ['port', 'star']
    for side in sides:
        if 'brig' in WHAT:
            nm = f'base/brig_{side}'
            if want(nm + '_locked'): build_brig(side, nm + '_locked', 0.0, 'locked')
            for i, k in enumerate(OPEN):
                if want(f'{nm}_f{i}'): build_brig(side, f'{nm}_f{i}', k, 'ok')
        if 'blast' in WHAT:
            nm = f'base/blast_{side}'
            if want(nm + '_closed'): build_blast(side, nm + '_closed', 0.0, 0.0, None)
            for i in range(4):
                if want(f'{nm}_alarm_f{i}'): build_blast(side, f'{nm}_alarm_f{i}', 0.0, 0.0, i / 4)
            for i, (b, k) in enumerate(((0, 0), (1, 0), (1, 0.25), (1, 0.5), (1, 0.75), (1, 1))):
                if want(f'{nm}_f{i}'): build_blast(side, f'{nm}_f{i}', b, k, (i / 4) % 1)
            for i in range(4):
                if want(f'{nm}_open_f{i}'): build_blast(side, f'{nm}_open_f{i}', 1, 1.0, i / 4)
        if 'floor' in WHAT and want(f'base/blast_floor_{side}'):
            build_blast_floor(side, f'base/blast_floor_{side}')
    print(f'[base] doors {WHAT} in {time.time() - t0:.0f} s')
