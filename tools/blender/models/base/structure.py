"""The Red Comet pirate base's structure (js/dock.js baseGeom + drawBase): floors, hull and walls, per side.

    blender -b --factory-startup --python tools/blender/models/base/structure.py -- [port|star] [floors|doors|walls] [quick] [samples=N] [only=<name>]

Layout (port side, relative to our airlock hatch like docklib.py: u = x - hatch.x, v = y - hatch.y; starboard is the
mirror x = SHIP_W - u, rendered separately so the light and the lettering stay right):
    tube      R(-5.6, -0.6, 0.7, 0.6)       (dock/tube_<side> from models/dock/tube.py fits it: not built here)
    bay       R(-12.4, -3.0, -5.6, 3.0)
    server    R(-21.4, -4.0, -13.0, 4.0)
    barracks  R(-22.4, -12.4, -11.6, -4.6)
    corridor  R(-35.0, -10.1, -23.0, -6.9)
    quarters  R(-40.0, -20.7, -28.0, -10.7)     NEW (the boss room, 12 x 10)
    brig      R(-37.0, -29.1, -29.0, -21.3)     MOVED one room north (was R(-38, -18.5, -30, -10.7))
  doors (gaps in the walls):
    bay_server         R(-13.0, -0.8, -12.4, 0.8)
    server_barracks    R(-18.0, -4.6, -16.4, -4.0)     (the hacked one)
    barracks_corridor  R(-23.0, -9.3, -22.4, -7.7)
    corridor_quarters  R(-34.6, -10.7, -33.0, -10.1)   (the old code door, now into the quarters)
    quarters_brig      R(-33.4, -21.3, -31.8, -20.7)   (new: the brig's keypad door, behind the captain)
    blast door slot    R(-28.0, -19.3, -27.3, -17.3)   (quarters' east wall, not walkable; the door is doors.py's base/blast_<side>)
The hull around each room is the room +- 0.7 with rounded corners (drawBase: rr(q - 0.7, ..., 16 px)), unioned.

Heights (the cutaway rule, as docklib.py / doors.py: tall 1.6, low 0.35):
    tall  each room's back wall and its side walls down to the door jambs (bay/server -0.8, barracks -9.3,
          quarters -15.7, brig -25.2), except where it would hide > 0.5 units of a floor north of it. On purpose
          tall although a room is right behind: the server room's back wall (hides the barracks' south 1.34) and
          the quarters' back wall (hides the brig's south 1.34), like the concept art; doors.py's door_h / brig doors fit.
    low   everything else: near walls, outer lips, the corridor/quarters wall (doors.py's door_hl fits it).

Sprites (build/renders/base/, group 'base'; every one has the SAME origin: our hatch point on the ground, game
(hatch.x, hatch.y), like dock/pirate_<side>; draw them all at GFX.sprite(name, 0, h.x, h.y, 0, ...)):
    base/floor_<room>_<side>      room floor, ground layer. Pixels where walls stand in front are cut out (holdout), so
                                  floors and walls can be drawn in either order. (bay: + the tube threshold; quarters: +
                                  the blast door slot)
    base/door_<door>_<side>       the doorway's floor (ground layer; drawBase draws it while that door is open). The doors
                                  themselves (frames, leaves, locked state): models/base/doors.py.
    base/walls_<side>_r<R>c<C>    hull + walls in screen tiles of 8 x 6 units (768 x 576 px), wall layer, no overlap;
                                  empty tiles skipped; the index entry base/walls_<side> lists them.
Not here: the tube (dock/tube_<side>), props and wall signs (models/base/props.py, quarters.py, the game's dockSign /
stencil calls: the walls leave room for the signs DOCK_DECOR.base hangs at their x).
"""
import sys, os, math, random, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
os.environ.setdefault('DOCK_CPU', '1')            # no usable GPU here
import docklib as D
from docklib import (mn, P, ubox, cbox, ucyl, prism, rrect_pts, bool_cut, worn, emit_mat, decal_mat, stripes_mat, pmat,
                     text, face_rivet, tray, pipe_uv, skull, FLOOR_Z, R90, SIN, COS, COT)
import bpy, bmesh
from mathutils import Vector, Matrix
from shiplib import render_exact

A = D.args()
SIDES = [a for a in A if a in ('port', 'star')] or ['port', 'star']
PARTS = [a for a in A if a in ('floors', 'doors', 'walls')] or ['floors', 'doors', 'walls']
ONLY = [a.split('=', 1)[1] for a in A if a.startswith('only=')]
QUICK = 'quick' in A
mn.SAMPLES = 16 if QUICK else int(next((a.split('=')[1] for a in A if a.startswith('samples=')), 40))
GROUP = 'base'

# ---------------------------------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------------------------------
ROOMS = {
    'bay': (-12.4, -3.0, -5.6, 3.0), 'server': (-21.4, -4.0, -13.0, 4.0), 'barracks': (-22.4, -12.4, -11.6, -4.6),
    'corridor': (-35.0, -10.1, -23.0, -6.9), 'quarters': (-40.0, -20.7, -28.0, -10.7), 'brig': (-37.0, -29.1, -29.0, -21.3),
}
DOORS = {
    'bay_server': (-13.0, -0.8, -12.4, 0.8), 'server_barracks': (-18.0, -4.6, -16.4, -4.0),
    'barracks_corridor': (-23.0, -9.3, -22.4, -7.7), 'corridor_quarters': (-34.6, -10.7, -33.0, -10.1),
    'quarters_brig': (-33.4, -21.3, -31.8, -20.7),
}
DOOR_IN_V_WALL = {'bay_server', 'barracks_corridor'}          # gap in a north-south wall (walk along u)
TUBE_GAP = (-5.6, -0.6, -4.9, 0.6)                             # the bay's outer door: the tube clamps on here
PAD, RAD = 0.7, 0.333
H_LOW, H_MID, H_FULL = 0.35, 0.8, 1.6
HIDE_OK = 0.5
FLOORS = list(ROOMS.values()) + list(DOORS.values()) + [TUBE_GAP]

def hull_of(r, e=0.0): return (r[0] - PAD - e, r[1] - PAD - e, r[2] + PAD + e, r[3] + PAD + e)
HULLS = [hull_of(r) for r in ROOMS.values()]
TALL = [
    (-13.1, -3.7, -4.9, -3.0), (-13.1, -4.0, -12.3, -0.8), (-5.6, -3.0, -4.9, -0.8),            # bay (+ server east)
    (-22.1, -4.7, -12.3, -4.0), (-22.1, -4.0, -21.4, -0.8),                                      # server back wall (= barracks' near wall), west
    (-23.1, -13.1, -10.9, -12.4), (-23.1, -12.4, -22.3, -9.3), (-11.6, -12.4, -10.9, -9.3),      # barracks (+ corridor east end)
    (-28.0, -10.8, -22.3, -10.1),                                                                # corridor back (east part)
    (-40.7, -21.4, -27.3, -20.7), (-40.7, -20.7, -40.0, -15.7), (-28.0, -20.7, -27.3, -15.7),   # quarters
    (-37.7, -29.8, -28.3, -29.1), (-37.7, -29.1, -37.0, -25.2), (-29.0, -29.1, -28.3, -25.2),   # brig
]
MID = []                                   # (0.8 walls: none any more; kept for the kit)
BLAST = (-28.0, -19.3, -27.3, -17.3)       # the pirate-only blast door in the quarters' east wall (models/base/doors.py): a gap, no floor
# no tall wall where it would hide more than HIDE_OK of a floor north of it; except the barracks' and the brig's south
# strips: the server room's and the quarters' back walls are tall on purpose (concept art; door sprites in doors.py)
ZONES = [(f[0], f[3], f[2], f[3] + H_FULL * COT - HIDE_OK) for f in FLOORS if f not in (ROOMS['barracks'], ROOMS['brig'])]

def inr(u, v, r, e=0.0): return r[0] - e <= u <= r[2] + e and r[1] - e <= v <= r[3] + e
def in_rr(u, v, r, rad=RAD):
    if not inr(u, v, r): return False
    cu = min(max(u, r[0] + rad), r[2] - rad); cv = min(max(v, r[1] + rad), r[3] - rad)
    return math.hypot(u - cu, v - cv) <= rad
def in_hull(u, v): return any(in_rr(u, v, h) for h in HULLS)
def is_floor(u, v, e=0.0): return any(inr(u, v, f, e) for f in FLOORS + [BLAST])
def height_at(u, v):
    if not in_hull(u, v) or is_floor(u, v): return 0.0
    if any(inr(u, v, t) for t in TALL) and not any(inr(u, v, z) for z in ZONES): return H_FULL
    if any(inr(u, v, t) for t in TALL + MID): return H_MID
    return H_LOW

def runs_u(a, b, v, step=0.05):
    """Runs of constant structure height along u at v: [(u0, u1, h)] (h > 0 only)."""
    out = []; n = max(1, int(round((b - a) / step)))
    cur = None
    for i in range(n + 1):
        u = a + (b - a) * i / n; h = height_at(u, v)
        if cur and abs(cur[2] - h) < 1e-6: cur[1] = u
        else:
            if cur and cur[2] > 0: out.append(tuple(cur))
            cur = [u, u, h]
    if cur and cur[2] > 0: out.append(tuple(cur))
    return [r for r in out if r[1] - r[0] > 0.05]

# ---------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------
def mats():
    M = dict(
        sub=pmat('sub', '#16181d', 0.8), hole=pmat('hole', '#0c0d10', 0.9), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        brass=worn('brass', '#d8a83a', 0.3, 0.8, wear=0.3, grime=0.5),
        bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5), tape=pmat('tape', '#b9bcc2', 0.85),
        hazard=stripes_mat('hazard'), hazard_red=stripes_mat('hazard_red', '#c0392b', '#e8e4dc', 5.0),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6), pmat('c4', '#c8a23a', 0.6)],
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2), lamp=emit_mat('lamp', '#ffb46a', 1.1, base='#ffd0a0'),
        lamp_red=emit_mat('lamp_red', '#ff3a2a', 1.4, base='#6a1a14'), lamp_green=emit_mat('lamp_green', '#5aff9a', 1.2, base='#2a7a4a'),
        lamp_amber=emit_mat('lamp_amber', '#ffb43a', 1.2, base='#7a5a1a'), lamp_blue=emit_mat('lamp_blue', '#4ab8ff', 1.2, base='#1a4a6a'),
        lamp_off=pmat('lamp_off', '#4a1a16', 0.25, 0.1),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.35, 0.6, wear=0.6, grime=0.5),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), comet=worn('comet', '#c0302a', 0.45, 0.1, wear=0.9, grime=0.5),
        orange=worn('orange', '#e07a2a', 0.5, 0.1, wear=0.8, grime=0.5),
        paint_y=worn('paint_y', '#c99a2c', 0.6, 0.0, wear=1.0, grime=0.9, scale=2.0),
        paint_w=worn('paint_w', '#d8d8cc', 0.6, 0.0, wear=1.0, grime=0.9, scale=2.0),
        paint_r=worn('paint_r', '#c8463a', 0.6, 0.0, wear=1.0, grime=0.9, scale=2.0),
        chalk=pmat('chalk', '#cfd2d4', 0.9), ink=pmat('ink', '#23252b', 0.6),
        paper=pmat('paper', '#e6e2d6', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6), poster=pmat('poster', '#d8c8a0', 0.8),
        oil=decal_mat('oil', '#0a0908', 0.6, rough=0.15), soot=decal_mat('soot', '#0b0a09', 0.9, 3.0),
        rustd=decal_mat('rustd', '#5a2a12', 0.7, 3.0), grog=decal_mat('grog', '#4a2a10', 0.6, 4.0, rough=0.2),
        mud=decal_mat('mud', '#2a2016', 0.75, 7.0), grime=decal_mat('grime', '#3a2c20', 0.5, 5.0), mudp=pmat('mudp', '#2e241a', 0.9), grogp=pmat('grogp', '#4a2c14', 0.4),
        rustp=pmat('rustp', '#5a2e16', 0.8), wear_d=decal_mat('wear_d', '#2a2424', 0.35, 2.0),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.2), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
        hulltall=worn('hulltall', '#54424a', 0.5, 0.2, wear=0.7, rust=0.2),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15), panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2),
        panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15), panel3=worn('panel3', '#6a6e78', 0.45, 0.4, rust=0.1),
        copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3), pipe1=worn('pipe1', '#3b7a8a', 0.4, 0.3, rust=0.08),
        wood=worn('wood', '#5a3424', 0.55, 0.0, wear=0.4, grime=0.6), wall_posh=worn('wall_posh', '#5a1e24', 0.6, 0.0, wear=0.3, grime=0.6),
        concrete=worn('concrete', '#6a6a6c', 0.85, 0.0, wear=0.3, grime=1.2, scale=2.0),
        patches=[worn('patch0', '#6a6e78', 0.45, 0.5, wear=0.4, rust=0.1), worn('patch1', '#7a5a3a', 0.5, 0.3, wear=0.6, rust=0.3),
                 worn('patch2', '#4e5a48', 0.55, 0.3, wear=0.5, rust=0.2), worn('patch3', '#8a4a40', 0.5, 0.3, wear=0.7, rust=0.2)],
        screen=emit_mat('screen', '#3a8a6a', 0.6, base='#0c1a14'), screen_red=emit_mat('screen_red', '#ff4a3a', 0.6, base='#1a0806'),
        glass=mn.mat('glass', '#2a3440', 0.08, 0.0, clearcoat=1.0), rubber=pmat('rubber', '#262a33', 0.7),
        dart=pmat('dart', '#e8c34f', 0.5), green=worn('green', '#3a6a3a', 0.6, 0.0, wear=0.4),
    )
    shades = dict(
        bay=['#6a6466', '#6e6668', '#64605f', '#686264'], server=['#5a6070', '#566072', '#5e6474', '#58606e'],
        barracks=['#665c58', '#625650', '#6a5e56', '#5e5450'], corridor=['#5e5a52', '#625e56', '#5a5650'],
        quarters=['#4a3438', '#4e383c', '#463236'], brig=['#4e4c52', '#4a484e', '#525056'])
    M['plates'] = {k: [worn(f'pl_{k}{i}', c, 0.5 if k != 'quarters' else 0.28, 0.35 if k != 'quarters' else 0.5,
                            wear=0.5 if k != 'quarters' else 0.15, grime={'barracks': 1.5, 'brig': 1.1, 'quarters': 0.4}.get(k, 0.85),
                            scale=1.5, rust={'barracks': 0.18, 'brig': 0.2, 'quarters': 0.0}.get(k, 0.12)) for i, c in enumerate(v)]
                   for k, v in shades.items()}
    M['tread'] = worn('tread', '#7f8794', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08)
    M['tread_dark'] = worn('tread_dark', '#6a6a66', 0.45, 0.55, wear=0.7, grime=1.2, scale=1.5, rust=0.15)
    M['rug'] = worn('rug', '#6e1a20', 0.95, 0.0, wear=0.0, grime=0.7, scale=2.5)
    M['rug_in'] = worn('rug_in', '#52121a', 0.95, 0.0, wear=0.0, grime=0.6, scale=2.5)
    D.M_DARK[0] = M['black']
    return M

# ---------------------------------------------------------------------------------------------------
# Batched geometry: thousands of small boxes in a few meshes (one per material / bevel)
# ---------------------------------------------------------------------------------------------------
class Batch:
    def __init__(self): self.bms = {}
    def _bm(self, key): return self.bms.setdefault(key, bmesh.new())
    def box(self, key, u, v, w, d, z0, h, rotz=0.0):
        bm = self._bm(key); r = bmesh.ops.create_cube(bm, size=1.0)
        a = -D.S * rotz; c, s = math.cos(a), math.sin(a); cen = P(u, v, z0 + h / 2)
        for q in r['verts']:
            x, y, z = q.co.x * w, q.co.y * d, q.co.z * h
            q.co = Vector((cen.x + x * c - y * s, cen.y + x * s + y * c, cen.z + z))
    def ubox(self, key, u0, v0, u1, v1, z0, z1):
        self.box(key, (u0 + u1) / 2, (v0 + v1) / 2, abs(u1 - u0), abs(v1 - v0), z0, z1 - z0)
    def sphere(self, key, u, v, z, r, sz=0.5, segs=8):
        bm = self._bm(key); ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(4, segs // 2), radius=r)
        c = P(u, v, z)
        for q in ret['verts']: q.co = Vector((q.co.x + c.x, q.co.y + c.y, q.co.z * sz + c.z))
    def disc(self, key, u, v, z, r, h=0.004, sv=1.0, rotz=0.0, segs=20):
        bm = self._bm(key); ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=h)
        a = -D.S * rotz; c, s = math.cos(a), math.sin(a); cen = P(u, v, z + h / 2)
        for q in ret['verts']:
            x, y = q.co.x, q.co.y * sv
            q.co = Vector((cen.x + x * c - y * s, cen.y + x * s + y * c, cen.z + q.co.z))
    def rod(self, key, p, q, r, segs=10):
        a, b = P(*p), P(*q); d = b - a
        bm = self._bm(key); ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4(); mid = (a + b) / 2
        for v_ in ret['verts']: v_.co = rot @ v_.co + mid
    def build(self, name, M, bevels=None, outline=None):
        objs = []
        for key, bm in self.bms.items():
            mk = key[0] if isinstance(key, tuple) else key
            nm = f'{name}_{getattr(mk, "name", mk)}'
            me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free()
            o = mn.link(bpy.data.objects.new(nm, me))
            m = mk if not isinstance(mk, str) else (M[mk] if mk in M else None)
            if isinstance(key, tuple) and len(key) > 1 and key[1]: mn.bev(o, key[1], 2)
            if m is not None: mn.assign(o, m)
            mn.smooth(o); objs.append(o)
        self.bms = {}
        return objs

def K(m, bevel=0.0):
    """Batch key: (material object, bevel width)."""
    return (m, bevel)

# ---------------------------------------------------------------------------------------------------
# Floors
# ---------------------------------------------------------------------------------------------------
GAP = 0.035
def plate(B, M, u, v, w, d, pm, rng, rivets=True, rivet_m=None, rotz=0.0, lost=0.05, z=0.0):
    B.box(K(pm, 0.012), u, v, w, d, z, FLOOR_Z, rotz)
    if not rivets: return
    for su in (-1, 1):
        for sv in (-1, 1):
            if rng.random() < lost: continue
            B.sphere(K(rivet_m or M['rivet']), u + su * (w / 2 - 0.07), v + sv * (d / 2 - 0.07), z + FLOOR_Z, 0.026)

def tread_plate(B, M, u, v, w, d, tm, rng, z=0.0, n=6):
    B.box(K(tm, 0.012), u, v, w, d, z, FLOOR_Z)
    nu, nv = max(2, int(n * w + 0.5)), max(2, int(n * d + 0.5))
    for i in range(nu):
        for j in range(nv):
            bu = u - w / 2 + 0.08 + i * (w - 0.16) / (nu - 1); bv = v - d / 2 + 0.08 + j * (d - 0.16) / (nv - 1)
            B.box(K(tm, 0.006), bu, bv, 0.1, 0.032, z + FLOOR_Z, 0.014, math.radians(45 if (i + j) % 2 else -45))
    for su in (-1, 1):
        for sv in (-1, 1): B.sphere(K(M['rivet']), u + su * (w / 2 - 0.05), v + sv * (d / 2 - 0.05), z + FLOOR_Z + 0.004, 0.022)

def grille(B, M, u, v, w, d, pm, rng):
    B.box(K(pm, 0.012), u, v, w, d, 0, FLOOR_Z)
    B.box(K(M['bar'], 0.006), u, v, 0.72, 0.72, FLOOR_Z, 0.012)
    B.box(K(M['hole']), u, v, 0.6, 0.6, FLOOR_Z, 0.013)
    for k in range(7): B.box(K(M['bar'], 0.006), u, v - 0.27 + k * 0.09, 0.6, 0.035, FLOOR_Z, 0.02)

def grid_cells(room):
    u0, v0, u1, v1 = room
    nu, nv = math.ceil(u1 - u0 - 1e-6), math.ceil(v1 - v0 - 1e-6)
    for i in range(nu):
        for j in range(nv):
            a0, a1 = u0 + i, min(u1, u0 + i + 1); b0, b1 = v0 + j, min(v1, v0 + j + 1)
            yield i, j, (a0 + a1) / 2, (b0 + b1) / 2, a1 - a0 - GAP, b1 - b0 - GAP

def subfloor(room, M, out):
    # top at 0.012, not 0: at 0 it is coplanar with the hull belly's top (a holdout in floor renders) and the plate
    # seams came out half transparent
    out.append(ubox('subfloor', room[0] - 0.02, room[1] - 0.02, room[2] + 0.02, room[3] + 0.02, -0.08, 0.012, M['sub'], bevel=0))

def paint_line(B, m, u0, v0, u1, v1, w=0.08, z=FLOOR_Z):
    L = math.hypot(u1 - u0, v1 - v0)
    B.box(K(m), (u0 + u1) / 2, (v0 + v1) / 2, L, w, z, 0.003, math.atan2(v1 - v0, u1 - u0))

def chevron(B, m, u, v, size, dirn=1, w=0.12, z=FLOOR_Z):
    for sv in (-1, 1):
        a = (u - dirn * size * 0.5, v + sv * size * 0.6); b = (u + dirn * size * 0.25, v)
        paint_line(B, m, a[0], a[1], b[0], b[1], w, z)

def comet_logo(B, M, u, v, z, s, rot=0.0, flat=True):
    """The Red Comet: a red ball with a three-streak tail (gold/orange), painted flat on a surface."""
    B.disc(K(M['comet']), u, v, z, 0.32 * s, 0.004)
    B.disc(K(M['paint_w']), u - 0.08 * s, v - 0.09 * s, z + 0.004, 0.08 * s, 0.002)
    for k, (dv, ln, m) in enumerate(((-0.18, 1.0, 'gold'), (0.0, 1.25, 'orange'), (0.18, 0.9, 'gold'))):
        c = math.cos(rot); sn = math.sin(rot)
        du, dvv = 0.3 * s + ln * s * 0.5, dv * s
        B.box(K(M[m]), u + (du * c - dvv * sn), v + (du * sn + dvv * c), ln * s, 0.09 * s * (1.2 - 0.2 * k), z, 0.003, rot)

def footprints(B, m, pts, rng, z=FLOOR_Z + 0.003, s=1.0):
    """Boot prints along a path (list of (u, v)), alternating left/right."""
    k = 0
    for (a, b), (c, d) in zip(pts, pts[1:]):
        L = math.hypot(c - a, d - b); ang = math.atan2(d - b, c - a); n = int(L / 0.32)
        for i in range(n):
            t = (i + 0.5) / n; u, v = a + (c - a) * t, b + (d - b) * t
            side = 0.09 * (1 if k % 2 else -1); k += 1
            pu, pv = u - math.sin(ang) * side, v + math.cos(ang) * side
            if rng.random() < 0.15: continue
            B.disc(K(m), pu, pv, z, 0.05 * s, 0.002, sv=0.6, rotz=ang, segs=12)
            B.disc(K(m), pu - math.cos(ang) * 0.09 * s, pv - math.sin(ang) * 0.09 * s, z, 0.035 * s, 0.002, segs=10)

def stain(out, u, v, r, m, sv=1.0, rotz=0.0, z=FLOOR_Z + 0.002):
    o = D.disc('stain', u, v, z, r, m, sv=sv, rotz=rotz); out.append(o); return o

def ring_stain(B, m, u, v, r, z=FLOOR_Z + 0.002):
    for k in range(18):
        a = k * math.tau / 18
        if k in (4, 5): continue
        B.box(K(m), u + math.cos(a) * r, v + math.sin(a) * r, 0.06 * r * 3.2, 0.018, z, 0.002, a + math.pi / 2)

def label_flat(out, body, u, v, size, m, z=FLOOR_Z + 0.003, rotz=0.0):
    o = text('txt', body, u, v, z, size, m, rotz=rotz); out.append(o); return o

def floor_bay(room, M, rng, B, out):
    sh = M['plates']['bay']
    for i, j, u, v, w, d in grid_cells(room):
        if (i + j) % 5 == 2 or j in (0, 5) and i % 3 == 1: tread_plate(B, M, u, v, w, d, M['tread'], rng)
        else: plate(B, M, u, v, w, d, sh[rng.randrange(len(sh))], rng)
    # the docking pad: a yellow box with corner brackets, a target ring, chevrons to the outer door
    pu0, pv0, pu1, pv1 = -11.7, -2.3, -7.1, 2.3
    for (cu, cv, su, sv) in ((pu0, pv0, 1, 1), (pu1, pv0, -1, 1), (pu1, pv1, -1, -1)):          # (4th corner: the captain's spot)
        paint_line(B, M['paint_y'], cu - su * 0.045, cv, cu + su * 0.8, cv, 0.09); paint_line(B, M['paint_y'], cu, cv, cu, cv + sv * 0.8, 0.09)
    for k in range(64):                                                   # target ring (four arcs)
        if k % 16 in (14, 15): continue
        a0, a1 = k * math.tau / 64 + 0.4, (k + 1.05) * math.tau / 64 + 0.4
        paint_line(B, M['paint_y'], -9.4 + 1.35 * math.cos(a0), 1.35 * math.sin(a0), -9.4 + 1.35 * math.cos(a1), 1.35 * math.sin(a1), 0.09)
    paint_line(B, M['paint_y'], -9.4 - 0.4, 0, -9.4 + 0.4, 0, 0.08); paint_line(B, M['paint_y'], -9.4, -0.4, -9.4, 0.4, 0.08)
    for k in range(3): chevron(B, M['paint_y'], -7.9 + k * 0.55, 0.0, 0.5)
    B.ubox(K(M['hazard']), -6.25, -1.1, -5.65, 1.1, FLOOR_Z, FLOOR_Z + 0.006)            # hazard band at the outer door
    label_flat(out, 'BAY 1', -11.25, -2.65, 0.26, M['paint_y'])
    label_flat(out, 'MIND THE GAP', -6.55, 1.55, 0.11, M['paint_w'], rotz=math.radians(90) * D.S)
    # "the captain's spot": a painted bay, a chalk note
    for (a, b, c, d) in ((-12.25, 1.45, -10.45, 1.45), (-10.45, 1.45, -10.45, 2.9), (-12.25, 1.45, -12.25, 2.9)):
        paint_line(B, M['paint_r'], a, b, c, d, 0.07)
    label_flat(out, "CAPTAIN'S\nSPOT", -11.35, 2.15, 0.17, M['paint_w'])
    label_flat(out, '(not you)', -11.35, 2.62, 0.11, M['chalk'])
    # tyre skids and oil
    for k in range(2):
        stain(out, -10.4 + k * 0.05, -0.8 + k * 0.35, 0.9, M['wear_d'], sv=0.06, rotz=math.radians(-25))
    stain(out, -8.1, 1.7, 0.42, M['oil'], sv=0.7, rotz=0.4); stain(out, -10.9, -1.2, 0.3, M['oil'], sv=0.8)
    stain(out, -7.0, -2.2, 0.35, M['rustd'])
    footprints(B, M['mudp'], [(-5.8, 0.25), (-8.0, 0.4), (-10.0, 0.2), (-12.4, 0.1)], rng)

def floor_server(room, M, rng, B, out):
    sh = M['plates']['server']; u0, v0 = room[0], room[1]
    cols, row = (2, 6), 5                                                 # cable trenches: two runs from the back wall, one across
    for i, j, u, v, w, d in grid_cells(room):
        tv = i in cols and j <= row; tu = j == row and cols[0] < i < cols[1]
        if tv or tu:
            # side strips + recessed trench with cables + grate cover (some lifted)
            if tv:
                for s in (-1, 1): plate(B, M, u + s * 0.37, v, 0.22, d, sh[0], rng, rivets=False)
            else:
                for s in (-1, 1): plate(B, M, u, v + s * 0.37, w, 0.22, sh[0], rng, rivets=False)
            ww, dd = (0.5, d + GAP) if tv else (w + GAP, 0.5)
            B.box(K(M['hole']), u, v, ww, dd, -0.07, 0.02)
            for k, cm in enumerate(M['cables'][:3]):
                off = -0.14 + k * 0.14
                if tv: B.rod(K(cm), (u + off, v - dd / 2, -0.02), (u + off, v + dd / 2, -0.02), 0.045)
                else: B.rod(K(cm), (u - ww / 2, v + off, -0.02), (u + ww / 2, v + off, -0.02), 0.045)
            if rng.random() < 0.78:
                n = 9
                for k in range(n):
                    if tv: B.box(K(M['bar'], 0.004), u, v - dd / 2 + (k + 0.5) * dd / n, ww + 0.04, 0.035, FLOOR_Z - 0.008, 0.012)
                    else: B.box(K(M['bar'], 0.004), u - ww / 2 + (k + 0.5) * ww / n, v, 0.035, dd + 0.04, FLOOR_Z - 0.008, 0.012)
                for s in (-1, 1):
                    if tv: B.box(K(M['bar'], 0.004), u + s * 0.26, v, 0.03, dd, FLOOR_Z - 0.01, 0.014)
                    else: B.box(K(M['bar'], 0.004), u, v + s * 0.26, ww, 0.03, FLOOR_Z - 0.01, 0.014)
            continue
        r = rng.random()
        if r < 0.1: grille(B, M, u, v, w, d, sh[1], rng)
        elif r < 0.18: tread_plate(B, M, u, v, w, d, M['tread'], rng)
        else: plate(B, M, u, v, w, d, sh[rng.randrange(len(sh))], rng)
    # a cable loop pulled out of a lifted grate, taped down across the floor
    pipe_out = pipe_uv('loose_cable', [(-15.0, 2.1, 0.0), (-15.1, 2.6, 0.05), (-16.2, 3.1, 0.05), (-17.6, 2.9, 0.05), (-18.6, 2.3, 0.0)], 0.035, M['cables'][2], corner=0.4)
    out.append(pipe_out)
    for uu, vv in ((-16.0, 3.08), (-17.3, 2.98)): B.box(K(M['tape']), uu, vv, 0.09, 0.28, 0.08, 0.005, math.radians(15))
    label_flat(out, '(THAT MEANS YOU, WHISKERS)', -17.2, 3.68, 0.12, M['paint_y'])   # under the game's AUTHORIZED PIRATES ONLY stencil
    label_flat(out, 'DO NOT UNPLUG', -14.9, -1.6, 0.1, M['paint_w'], rotz=math.radians(90) * D.S)
    # Admiral Whiskers' paw prints, right across the stencil
    for k in range(16):
        u = -20.6 + k * 0.42; v = 2.3 + 0.9 * math.sin(k * 0.5) + (0.1 if k % 2 else -0.1)
        B.disc(K(M['mudp']), u, v, FLOOR_Z + 0.003, 0.055, 0.002, segs=12)
        for t in range(3): B.disc(K(M['mudp']), u + 0.07, v - 0.06 + t * 0.06, FLOOR_Z + 0.003, 0.022, 0.002, segs=8)
    stain(out, -20.3, -2.0, 0.3, M['grog'], sv=0.8); ring_stain(B, M['grogp'], -20.6, -1.2, 0.09)
    stain(out, -13.7, 2.9, 0.35, M['oil'], sv=0.7)

def floor_barracks(room, M, rng, B, out):
    sh = M['plates']['barracks']
    for i, j, u, v, w, d in grid_cells(room):
        r = rng.random(); rot = math.radians(rng.uniform(-1.2, 1.2)) if rng.random() < 0.12 else 0.0
        chalk = i in (8, 9) and 2 <= j <= 5                                # under the hopscotch: plain plates
        if r < 0.07 and not chalk: grille(B, M, u, v, w, d, sh[0], rng)
        elif r < 0.13 and not chalk: tread_plate(B, M, u, v, w, d, M['tread_dark'], rng)
        else: plate(B, M, u, v, w, d, sh[rng.randrange(len(sh))], rng, rotz=0.0 if chalk else rot, lost=0.2)
        if rng.random() < 0.08:                                           # duct-taped seams (strips across the joint)
            for k in range(rng.randint(1, 3)):
                B.box(K(M['tape']), u + w / 2, v - 0.2 + k * 0.17, 0.3, 0.09, FLOOR_Z, 0.005, rng.uniform(-0.15, 0.15))
    # grubby: grog, coffee rings, oil, mud trails from the door to the bunks, a hopscotch court in chalk
    for _ in range(9):
        stain(out, rng.uniform(-22.0, -12.0), rng.uniform(-12.0, -5.0), rng.uniform(0.18, 0.45), rng.choice([M['grog'], M['grime'], M['wear_d']]), sv=rng.uniform(0.5, 1.0), rotz=rng.uniform(0, 3))
    for _ in range(5): ring_stain(B, M['grogp'], rng.uniform(-21.8, -12.2), rng.uniform(-11.8, -5.2), rng.uniform(0.07, 0.1))
    footprints(B, M['mudp'], [(-17.2, -4.7), (-17.0, -6.4), (-19.6, -8.0), (-21.2, -10.6)], rng)
    footprints(B, M['mudp'], [(-16.9, -4.7), (-15.2, -7.4), (-13.2, -9.6)], rng)
    label_flat(out, 'NO SPITTING (MUCH)', -18.6, -6.2, 0.13, M['paint_w'])        # north of the strip the server room's wall hides
    hx, hv = -13.4, -7.0                                                   # hopscotch, chalk
    cells = [(0, 0), (0, 1), (-0.5, 2), (0.5, 2), (0, 3), (-0.5, 4), (0.5, 4), (0, 5)]
    for n_, (du, k) in enumerate(cells):
        cu, cv = hx + du, hv - k * 0.55 - 0.3                              # (k 0 at v -7.3: clear of the hidden strip)
        for (a, b, c, d) in ((-0.25, -0.25, 0.25, -0.25), (0.25, -0.25, 0.25, 0.25), (0.25, 0.25, -0.25, 0.25), (-0.25, 0.25, -0.25, -0.25)):
            paint_line(B, M['chalk'], cu + a, cv + b * 1.1, cu + c, cv + d * 1.1, 0.025, FLOOR_Z + 0.003)
        label_flat(out, str(n_ + 1), cu, cv, 0.16, M['chalk'], z=FLOOR_Z + 0.004)
    for _ in range(14):                                                    # bottle caps
        B.disc(K(M['gold']), rng.uniform(-22.1, -11.9), rng.uniform(-12.1, -4.9), FLOOR_Z, 0.035, 0.01, segs=10)

def floor_corridor(room, M, rng, B, out):
    sh = M['plates']['corridor']
    for i, j, u, v, w, d in grid_cells(room):
        if rng.random() < 0.72: tread_plate(B, M, u, v, w, d, M['tread_dark'], rng)
        else: plate(B, M, u, v, w, d, sh[rng.randrange(len(sh))], rng, lost=0.15)
    u0, v0, u1, v1 = room
    for vv in (v0 + 0.16, v1 - 0.16):                                       # hazard edge lines along both walls
        B.ubox(K(M['hazard']), u0 + 0.1, vv - 0.06, u1 - 0.1, vv + 0.06, FLOOR_Z + 0.014, FLOOR_Z + 0.018)
    # the sentry's line of fire: scorch streaks and pocks down the corridor
    for k in range(7):
        stain(out, -32.0 + k * 1.3 + rng.uniform(-0.3, 0.3), -8.5 + rng.uniform(-0.6, 0.6), rng.uniform(0.25, 0.45), M['soot'], sv=0.35, rotz=rng.uniform(-0.15, 0.15), z=FLOOR_Z + 0.017)
    for _ in range(22):
        B.disc(K(M['black']), rng.uniform(-33.5, -23.4), -8.5 + rng.gauss(0, 0.5), FLOOR_Z + 0.015, rng.uniform(0.025, 0.045), 0.006, segs=10)
    for k in range(2):                                                     # drag marks to the barracks door
        stain(out, -26.0, -8.35 + k * 0.3, 2.6, M['wear_d'], sv=0.03, rotz=0.04, z=FLOOR_Z + 0.017)
    for k in range(3): chevron(B, M['paint_y'], -24.0 + k * 0.4, -8.5, 0.35, dirn=1, w=0.08, z=FLOOR_Z + 0.016)

def floor_quarters(room, M, rng, B, out):
    sh = M['plates']['quarters']; u0, v0, u1, v1 = room
    for i, j, u, v, w, d in grid_cells(room):                              # polished panels, brass rivets
        plate(B, M, u, v, w, d, sh[(i + j) % len(sh)], rng, rivet_m=M['brass'], lost=0.0)
    # brass inlay border
    e = 0.35
    for (a, b, c, d) in ((u0 + e, v0 + e, u1 - e, v0 + e), (u1 - e, v0 + e, u1 - e, v1 - e), (u1 - e, v1 - e, u0 + e, v1 - e), (u0 + e, v1 - e, u0 + e, v0 + e)):
        paint_line(B, M['brass'], a, b, c, d, 0.06, FLOOR_Z)
    # the carpet: red with a gold border, tassels, the comet in the middle, a plasma burn on one corner
    cu, cv, W, Dp, rot = -34.2, -16.0, 4.6, 6.0, math.radians(9)
    out.append(cbox('rug', cu, cv, W, Dp, FLOOR_Z, 0.025, M['rug'], bevel=0.012, rotz=rot))
    out.append(cbox('rug_border', cu, cv, W - 0.25, Dp - 0.25, FLOOR_Z + 0.025, 0.003, M['gold'], bevel=0.0, rotz=rot))
    out.append(cbox('rug_in', cu, cv, W - 0.45, Dp - 0.45, FLOOR_Z + 0.027, 0.003, M['rug_in'], bevel=0.0, rotz=rot))
    c, s = math.cos(rot), math.sin(rot)
    def rp(du, dv): return cu + du * c - dv * s, cv + du * s + dv * c
    for sv in (-1, 1):
        for k in range(15):
            du = -W / 2 + 0.2 + k * (W - 0.4) / 14; a, b = rp(du, sv * (Dp / 2 + 0.07))
            B.box(K(M['gold']), a, b, 0.04, 0.14, FLOOR_Z, 0.012, rot)
    for e_ in (0.42, 0.62):                                                  # inner gold lines, diamonds in the corners
        for (a0, b0, a1, b1) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            p0 = rp(a0 * (W / 2 - e_), b0 * (Dp / 2 - e_)); p1 = rp(a1 * (W / 2 - e_), b1 * (Dp / 2 - e_))
            paint_line(B, M['gold'], p0[0], p0[1], p1[0], p1[1], 0.035, FLOOR_Z + 0.03)
    for su in (-1, 1):
        for sv in (-1, 1):
            a, b = rp(su * (W / 2 - 0.95), sv * (Dp / 2 - 0.95)); B.box(K(M['gold']), a, b, 0.22, 0.22, FLOOR_Z + 0.03, 0.003, rot + math.pi / 4)
    a, b = rp(0, 0); B.disc(K(M['rug_in']), a, b, FLOOR_Z + 0.031, 1.05, 0.003, segs=40)
    for k in range(48):
        a0, a1 = k * math.tau / 48, (k + 1.05) * math.tau / 48
        paint_line(B, M['gold'], a + 1.05 * math.cos(a0), b + 1.05 * math.sin(a0), a + 1.05 * math.cos(a1), b + 1.05 * math.sin(a1), 0.035, FLOOR_Z + 0.033)
    comet_logo(B, M, a - 0.25, b + 0.15, FLOOR_Z + 0.034, 1.3, rot=math.radians(-35))
    a, b = rp(W / 2 - 0.5, Dp / 2 - 0.6); stain(out, a, b, 0.42, M['soot'], z=FLOOR_Z + 0.032)
    a, b = rp(-W / 2 + 0.9, -Dp / 2 + 1.0); ring_stain(B, M['grogp'], a, b, 0.1, z=FLOOR_Z + 0.032)
    stain(out, -29.6, -12.4, 0.3, M['oil'], sv=0.7)

def floor_brig(room, M, rng, B, out):
    sh = M['plates']['brig']; u0, v0, u1, v1 = room
    for i, j, u, v, w, d in grid_cells(room):
        if (i, j) == (4, 4): continue
        plate(B, M, u, v, w, d, sh[rng.randrange(len(sh))], rng, lost=0.35)
    # the drain in the middle (and what runs into it)
    du, dv = u0 + 4.5, v0 + 4.5
    B.box(K(sh[0], 0.012), du, dv, 1 - GAP, 1 - GAP, 0, FLOOR_Z)
    B.disc(K(M['bar']), du, dv, FLOOR_Z, 0.32, 0.01, segs=32); B.disc(K(M['hole']), du, dv, FLOOR_Z + 0.006, 0.26, 0.006, segs=32)
    for k in range(6): B.box(K(M['bar']), du, dv - 0.2 + k * 0.08, 0.5 - abs(k - 2.5) * 0.08, 0.03, FLOOR_Z + 0.006, 0.012)
    stain(out, du + 0.2, dv + 0.3, 0.6, M['rustd'], sv=0.8)
    # tally marks scratched by a long-term guest; a pacing track; a painted line
    # (tally marks: models/base/props.py tally_floor / tally_wall)
    loop = [(u0 + 1.4, v0 + 1.8), (u0 + 1.6, v0 + 5.4), (u0 + 2.3, v0 + 5.6), (u0 + 2.2, v0 + 1.9), (u0 + 1.5, v0 + 1.7)]
    footprints(B, M['mudp'], loop, rng, s=0.9); footprints(B, M['mudp'], [(a + 0.15, b + 0.1) for a, b in loop], rng, s=0.9)   # pacing
    # (the quarters' tall back wall hides the south 1.6 * cot 50 = 1.34 of the brig: the paint stays north of that)
    paint_line(B, M['paint_y'], u0 + 0.25, v1 - 1.55, u1 - 0.25, v1 - 1.55, 0.09)
    label_flat(out, 'STAY BEHIND THE LINE', (u0 + u1) / 2 + 1.2, v1 - 2.14, 0.14, M['paint_y'])
    label_flat(out, 'VISITING HOURS: NEVER', (u0 + u1) / 2 + 1.2, v1 - 1.87, 0.11, M['paint_w'])

FLOOR_FN = dict(bay=floor_bay, server=floor_server, barracks=floor_barracks, corridor=floor_corridor, quarters=floor_quarters, brig=floor_brig)

def door_floor(name, M, rng, B, out):
    d = DOORS[name]; subfloor(d, M, out)
    u, v, w, dd = (d[0] + d[2]) / 2, (d[1] + d[3]) / 2, d[2] - d[0] - GAP, d[3] - d[1] - GAP
    tread_plate(B, M, u, v, w, dd, M['tread'], rng)
    if name in DOOR_IN_V_WALL:                                             # door rails across the travel direction
        for uu in (d[0] + 0.07, d[2] - 0.07): B.ubox(K(M['hazard']), uu - 0.04, d[1] + 0.05, uu + 0.04, d[3] - 0.05, FLOOR_Z, FLOOR_Z + 0.02)
    else:
        for vv in (d[1] + 0.07, d[3] - 0.07): B.ubox(K(M['hazard']), d[0] + 0.05, vv - 0.04, d[2] - 0.05, vv + 0.04, FLOOR_Z, FLOOR_Z + 0.02)

# ---------------------------------------------------------------------------------------------------
# Hull and walls
# ---------------------------------------------------------------------------------------------------
def solid_union(name, rects, z0, z1, rounded=False):
    mk = (lambda r: prism('p', rrect_pts(*r, RAD), z0, z1, None, bevel=0)) if rounded else (lambda r: ubox('b', *r, z0, z1, bevel=0))
    o = mk(rects[0]); o.name = name
    if len(rects) > 1: bool_cut(o, [mk(r) for r in rects[1:]], op='UNION')
    return o

def cut(o, rects, z0, z1):
    if rects: bool_cut(o, [ubox('c', *r, z0, z1, bevel=0) for r in rects])
    return o

def masses(M):
    # door cutters reach 0.05 into the rooms on either side (faces coplanar with the room cuts make the boolean skip them)
    doors = [(d[0] - 0.05, d[1], d[2] + 0.05, d[3]) if n in DOOR_IN_V_WALL else (d[0], d[1] - 0.05, d[2], d[3] + 0.05) for n, d in DOORS.items()]
    floors = list(ROOMS.values()) + doors + [(TUBE_GAP[0] - 0.05, TUBE_GAP[1], TUBE_GAP[2] + 1.0, TUBE_GAP[3]), (BLAST[0] - 0.05, BLAST[1], BLAST[2] + 1.0, BLAST[3])]
    low = solid_union('low', HULLS, 0.0, H_LOW, rounded=True); cut(low, floors, -1, 3)
    tall = solid_union('tall', TALL, 0.0, H_FULL)
    bool_cut(tall, [solid_union('ht', HULLS, -1, 3, rounded=True)], op='INTERSECT'); cut(tall, floors + ZONES, -1, 3)
    belly = solid_union('belly', [(h[0] + 0.12, h[1] + 0.1, h[2] - 0.12, h[3] - 0.04) for h in HULLS], -0.55, 0.0, rounded=True)
    for o, m, b in ((low, M['hull'], 0.03), (tall, M['hulltall'], 0.03), (belly, M['hull2'], 0.06)):
        mn.bev(o, b, 2); mn.assign(o, m); mn.smooth(o)
    return [low, tall, belly]

def plaque(out, u, v, z, w, h, body, size, bg, fg, screws=None):
    """A sign on a south-facing wall face at v (plate + text + screws). z = bottom."""
    out.append(ubox('plq', u - w / 2, v, u + w / 2, v + 0.03, z, z + h, bg, bevel=0.01))
    if body: out.append(text('plq_t', body, u, v + 0.034, z + h / 2, size, fg, face=True))
    if screws:
        for su in (-1, 1):
            for sz in (0.05, h - 0.05): out.append(face_rivet(u + su * (w / 2 - 0.05), v + 0.02, z + sz, screws, r=0.015))

def wall_face(a, b, v, h, M, rng, out, B, style='pirate'):
    """Details on the south-facing face of a wall at v (a room's back wall) from u = a to b, height h."""
    if b - a < 0.25: return
    posh, brig = style == 'posh', style == 'brig'
    out.append(ubox('skirt', a, v, b, v + 0.05, 0, 0.12, M['brass'] if posh else M['skirt'], bevel=0.012))
    n = max(1, int(round((b - a) / 1.0))); w = (b - a) / n
    pan = M['wall_posh'] if posh else M['concrete'] if brig else M['panel']
    pan2 = M['wall_posh'] if posh else M['concrete'] if brig else M['panel2']
    top_low = min(0.79, h - 0.14)
    for k in range(n):
        p = a + k * w; c = p + w / 2
        pm = pan if rng.random() > 0.18 or posh else rng.choice(M['patches'])
        out.append(ubox('lpanel', p + 0.025, v, p + w - 0.025, v + 0.03, 0.13, top_low, pm, bevel=0.012))
        if not posh and not brig and rng.random() < 0.7:
            for i in range(3): B.ubox(K(M['dark']), c - 0.18, v + 0.03, c + 0.18, v + 0.04, 0.3 + i * 0.07, 0.33 + i * 0.07)
        if posh:
            B.ubox(K(M['brass'], 0.004), p + 0.1, v + 0.03, p + w - 0.1, v + 0.045, top_low - 0.1, top_low - 0.08)
        for su in (-1, 1):
            for z in (0.2, top_low - 0.08):
                if not posh: B.sphere(K(M['steel']), c + su * (w / 2 - 0.08), v + 0.03, z, 0.02, sz=1.0)
        if h >= H_FULL - 1e-3:
            pm2 = pan2 if rng.random() > 0.2 or posh else rng.choice(M['patches'])
            out.append(ubox('upanel', p + 0.025, v, p + w - 0.025, v + 0.03, 0.95, H_FULL - 0.1, pm2, bevel=0.012))
            if k % 2 == 0 or n == 1:
                out.append(ubox('lamp_h', c - 0.28, v, c + 0.28, v + 0.05, 1.24, 1.34, M['dark'], bevel=0.015))
                lm = M['lamp'] if rng.random() > 0.12 else M['lamp_dead']
                out.append(ubox('lamp', c - 0.24, v + 0.03, c + 0.24, v + 0.06, 1.265, 1.315, lm, bevel=0.005))
            if rng.random() < 0.4 and not posh:                           # rust run-off below a panel joint
                B.box(K(M['rustp']), p + 0.03, v + 0.035, 0.05, 0.004, 0.5, 0.4, 0.0)
    if h >= H_FULL - 1e-3:
        out.append(pipe_uv('pipe1', [(a, v + 0.09, 0.86), (b, v + 0.09, 0.86)], 0.055, M['brass'] if posh else M['pipe1'], corner=0))
        out.append(pipe_uv('pipe2', [(a, v + 0.07, 0.95), (b, v + 0.07, 0.95)], 0.035, M['copper'], corner=0))
        k = a + 0.6
        while k < b - 0.3:
            B.ubox(K(M['steel'], 0.01), k - 0.03, v, k + 0.03, v + 0.16, 0.8, 1.0); k += 1.8
    else:                                                                  # mid wall: cap rail and a conduit
        out.append(ubox('cap', a, v, b, v + 0.06, h - 0.08, h, M['brass'] if posh else M['rim'], bevel=0.012))
        out.append(pipe_uv('conduit', [(a, v + 0.07, h - 0.18), (b, v + 0.07, h - 0.18)], 0.035, M['copper'] if not brig else M['pipe1'], corner=0))

def jamb_face(a, b, v, M, out, lamp=None, h=H_FULL):
    c = (a + b) / 2
    out.append(ubox('endpanel', a + 0.05, v, b - 0.05, v + 0.03, 0.13, h - 0.12, M['panel'], bevel=0.012))
    out.append(ubox('end_hz', a + 0.07, v + 0.02, b - 0.07, v + 0.04, 0.25, 0.55, M['hazard'], bevel=0.005))
    for su in (a, b): out.append(ubox('guard', su - 0.03, v - 0.03, su + 0.03, v + 0.03, 0.0, h - 0.1, M['steel'], bevel=0.015))
    out.append(ubox('jlamp_h', c - 0.06, v, c + 0.06, v + 0.05, 0.9, 1.3, M['dark'], bevel=0.015))
    out.append(ubox('jlamp', c - 0.03, v + 0.03, c + 0.03, v + 0.06, 0.94, 1.26, lamp or M['lamp'], bevel=0.005))

def lip_v(name): r = ROOMS[name]; return (r[3] + r[3] + PAD) / 2
TEXT_ZONES = [(-20.6, lip_v('server') - 0.2, -13.8, lip_v('server') + 0.2), (-39.2, lip_v('quarters') - 0.2, -37.2, lip_v('quarters') + 0.2),
              (-12.4, lip_v('bay') - 0.3, -5.6, lip_v('bay') + 0.2), (-30.6, lip_v('corridor') - 0.2, -27.4, lip_v('corridor') + 0.2)]

def top_decor(M, rng, out, B):
    """Hull tops: plate seams, rivets, patches, duct tape, rust, the red Comet trim, trays on the tall walls."""
    # bands per room: the strips between the room and its hull edge
    for name, r in ROOMS.items():
        h_ = hull_of(r)
        bands = {'n': (h_[0] + 0.15, h_[1], h_[2] - 0.15, r[1]), 's': (h_[0] + 0.15, r[3], h_[2] - 0.15, h_[3]),
                 'w': (h_[0], r[1], r[0], r[3]), 'e': (r[2], r[1], h_[2], r[3])}
        for side, (a0, b0, a1, b1) in bands.items():
            horiz = side in 'ns'
            L0, L1 = (a0, a1) if horiz else (b0, b1)
            c = ((b0 + b1) / 2) if horiz else ((a0 + a1) / 2)
            x = L0 + 0.8
            while x < L1 - 0.3:                                          # seams across the band
                p0 = (x, b0 + 0.06) if horiz else (a0 + 0.06, x); p1 = (x, b1 - 0.06) if horiz else (a1 - 0.06, x)
                hs = {round(height_at(*p0), 2), round(height_at(*p1), 2), round(height_at((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2), 2)}
                if len(hs) == 1 and 0 not in hs and not any(inr((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, t, 0.15) for t in TEXT_ZONES):
                    z = hs.pop()
                    if horiz: B.ubox(K(M['black']), x - 0.01, b0 + 0.06, x + 0.01, b1 - 0.06, z, z + 0.004)
                    else: B.ubox(K(M['black']), a0 + 0.06, x - 0.01, a1 - 0.06, x + 0.01, z, z + 0.004)
                    for t in (0.2, 0.8):                                 # rivet pairs by the seam
                        pu, pv = (x + 0.12, b0 + (b1 - b0) * t) if horiz else (a0 + (a1 - a0) * t, x + 0.12)
                        if height_at(pu, pv) == z: B.sphere(K(M['steel']), pu, pv, z, 0.028)
                x += 1.6
            # the red Comet trim along the outer edge of south bands (low lips)
            if side == 's':
                for (ua, ub, hh) in runs_u(a0, a1, b1 - 0.16):
                    if hh == H_LOW and ub - ua > 0.6 and not in_hull((ua + ub) / 2, b1 + 0.25):
                        B.ubox(K(M['comet']), ua + 0.05, b1 - 0.2, ub - 0.05, b1 - 0.1, H_LOW, H_LOW + 0.004)
                        B.ubox(K(M['paint_y']), ua + 0.05, b1 - 0.3, ub - 0.05, b1 - 0.27, H_LOW, H_LOW + 0.004)
    # patches, tape, rust blooms: scattered over all hull tops
    for _ in range(140):
        h_ = rng.choice(HULLS)
        u, v = rng.uniform(h_[0] + 0.1, h_[2] - 0.1), rng.uniform(h_[1] + 0.1, h_[3] - 0.1)
        w, d = rng.uniform(0.25, 0.55), rng.uniform(0.2, 0.45)
        pts = [(u, v), (u - w / 2, v - d / 2), (u + w / 2, v - d / 2), (u - w / 2, v + d / 2), (u + w / 2, v + d / 2)]
        hs = {round(height_at(*p), 2) for p in pts}
        if len(hs) != 1 or 0 in hs or any(inr(*p, t, 0.1) for p in pts for t in TEXT_ZONES): continue
        z = hs.pop(); k = rng.random()
        if k < 0.5:
            B.box(K(rng.choice(M['patches']), 0.006), u, v, w, d, z, 0.012)
            for su in (-1, 1):
                for sv in (-1, 1): B.sphere(K(M['steel']), u + su * (w / 2 - 0.04), v + sv * (d / 2 - 0.04), z + 0.012, 0.018)
        elif k < 0.72:
            a = rng.uniform(-0.5, 0.5); B.box(K(M['tape']), u, v, w * 1.2, 0.09, z, 0.005, a)
            if rng.random() < 0.5: B.box(K(M['tape']), u, v, w * 1.2, 0.09, z + 0.001, 0.005, a + 1.4)
        elif k < 0.9: stain(out, u, v, rng.uniform(0.15, 0.32), M['rustd'], sv=rng.uniform(0.5, 1), rotz=rng.uniform(0, 3), z=z + 0.002)
        else: stain(out, u, v, rng.uniform(0.12, 0.25), M['oil'], z=z + 0.002)
    # cable trays along tall north bands, a conduit on mid tops
    for name, r in ROOMS.items():
        h_ = hull_of(r)
        for (ua, ub, hh) in runs_u(h_[0] + 0.2, h_[2] - 0.2, (h_[1] + r[1]) / 2):
            if ub - ua < 1.0: continue
            if hh == H_FULL: tray(ua + 0.1, h_[1] + 0.06, ub - 0.1, r[1] - 0.04, H_FULL, M, out, 'u')

def exterior(M, rng, out, B):
    """Belly seams and rivets on the camera-facing outer faces; antennas and vents on the tall north tops."""
    for name, r in ROOMS.items():
        h_ = hull_of(r); ve = h_[3] - 0.04
        x = h_[0] + 0.8
        while x < h_[2] - 0.6:
            if not in_hull(x, h_[3] + 0.15) and in_rr(x, h_[3] - 0.1, h_):
                B.ubox(K(M['black']), x - 0.012, ve - 0.06, x + 0.012, ve + 0.005, -0.5, 0.0)
                for z in (-0.12, -0.42): B.sphere(K(M['steel']), x + 0.35, ve + 0.002, z, 0.025, sz=1.0)
            x += 1.6
    for (u, v, hgt) in ((-17.0, -12.75, 0.7), (-33.0, -29.45, 0.9), (-8.0, -3.35, 0.55)):     # antenna masts with a red light
        out.append(ucyl('mast_base', 0.12, 0.08, u, v, H_FULL, M['dark'], verts=16))
        out.append(ucyl('mast', 0.025, hgt, u, v, H_FULL + 0.08, M['steel'], verts=10, bevel=0.005))
        out.append(mn.sphere('mast_lamp', 0.05, loc=P(u, v, H_FULL + 0.1 + hgt), m=M['lamp_red'], segs=12))
    for (u, v) in ((-14.0, -12.75), (-20.5, -12.75), (-30.5, -29.45), (-35.5, -29.45), (-39.0, -21.05)):  # vent caps
        out.append(cbox('vent', u, v, 0.5, 0.36, H_FULL, 0.16, M['body'], bevel=0.03))
        for k in range(3): B.ubox(K(M['black']), u - 0.18, v - 0.12 + k * 0.1, u + 0.18, v - 0.09 + k * 0.1, H_FULL + 0.16, H_FULL + 0.165)

def room_walls(M, rng, out, B):
    """Back-wall faces per room (by height run), jambs, door frames, signs and jokes."""
    style = dict(quarters='posh', brig='brig')
    for name, r in ROOMS.items():
        for (ua, ub, hh) in runs_u(r[0] + 0.01, r[2] - 0.01, r[1] - 0.06):
            wall_face(ua, ub, r[1], hh, M, rng, out, B, style.get(name, 'pirate'))
    # jambs: south ends of the tall side walls (where they drop to the low lip / a door gap)
    for t in TALL:
        if t[3] - t[1] < 1.0: continue                                   # (north bands)
        v = t[3]
        for (ua, ub, hh) in runs_u(t[0], t[2], v - 0.06):
            if hh == H_FULL and ub - ua > 0.3: jamb_face(ua, ub, v, M, out, lamp=M['lamp_red'] if rng.random() < 0.3 else None)
    # tube opening: hazard posts at the outer door
    for vv in (TUBE_GAP[1] - 0.09, TUBE_GAP[3] + 0.01):
        out.append(ubox('tpost', TUBE_GAP[0] - 0.02, vv, TUBE_GAP[2], vv + 0.08, 0.0, H_LOW + 0.05, M['hazard'], bevel=0.008))

    # --- the stories ---
    # bay: the docking status board, a plaque (the game hangs its RED COMET BASE sign at u -9.0)
    v = ROOMS['bay'][1]
    plaque(out, -6.4, v + 0.04, 0.55, 0.9, 0.5, None, 0, M['dark'], None, screws=M['steel'])
    for k in range(4):
        o = mn.cyl('stat', 0.05, 0.03, loc=P(-6.7 + k * 0.2, v + 0.1, 0.86), m=[M['lamp_green'], M['lamp_green'], M['lamp_amber'], M['lamp_dead']][k], verts=12, bevel=0, rot=(R90, 0, 0)); out.append(o)
    out.append(text('txt', 'DOCK', -6.4, v + 0.08, 0.66, 0.08, M['white'], face=True))
    plaque(out, -11.4, v + 0.04, 0.95, 1.1, 0.24, 'NO LOITERING\n(YES, YOU)', 0.06, M['paint_y'], M['ink'], screws=M['steel'])
    # server room (its SERVER ROOM sign hangs at u -15.0): stickers low on the wall
    v = ROOMS['server'][1]
    plaque(out, -20.2, v + 0.04, 0.22, 0.9, 0.3, 'HIGH VOLTAGE', 0.08, M['paint_y'], M['ink'])
    plaque(out, -13.7, v + 0.04, 0.3, 0.75, 0.25, 'DO NOT UNPLUG', 0.07, M['sticker'], M['ink'])
    # barracks (CHORE WHEEL sign at u -19.4, the door code note at -14.2): days without mutiny
    v = ROOMS['barracks'][1]
    plaque(out, -21.3, v + 0.04, 1.0, 1.4, 0.5, None, 0, M['dark'], None, screws=M['steel'])
    out.append(text('txt', 'DAYS WITHOUT\nMUTINY', -21.55, v + 0.075, 1.25, 0.072, M['white'], face=True))
    out.append(ubox('digits', -20.95, v + 0.07, -20.7, v + 0.09, 1.08, 1.42, M['ink'], bevel=0.01))
    out.append(text('txt', '0', -20.83, v + 0.095, 1.25, 0.24, M['lamp_red'], face=True))
    out.append(text('txt', 'BUNK INSPECTION:\nNEVER', -16.6, v + 0.06, 0.55, 0.06, M['white'], face=True))
    # corridor: sentry testing sign on the tall part, bullet holes, DUCK
    v = ROOMS['corridor'][1]
    plaque(out, -25.6, v + 0.04, 1.15, 1.6, 0.34, 'SENTRY TESTING\nIN PROGRESS', 0.075, M['paint_y'], M['ink'], screws=M['steel'])
    for _ in range(14):
        u = rng.uniform(-27.8, -23.2); z = rng.uniform(0.25, 1.4)
        out.append(mn.cyl('bullet', 0.025, 0.01, loc=P(u, v + 0.045, z), m=M['black'], verts=10, bevel=0, rot=(R90, 0, 0)))
    out.append(text('txt', 'DUCK', -24.0, v + 0.06, 0.45, 0.12, M['paint_r'], face=True))
    # quarters (portrait, WANTED poster, trophies: models/base/quarters.py): the brig door's label
    v = ROOMS['quarters'][1]
    plaque(out, -35.2, v + 0.04, 0.25, 0.9, 0.22, 'BRIG', 0.12, M['dark'], M['lamp_red'])
    # brig (BRIG RULES sign by the game): stencil, complaints slot
    v = ROOMS['brig'][1]
    out.append(text('txt', 'BRIG', -35.4, v + 0.05, 0.62, 0.22, M['paint_y'], face=True))
    plaque(out, -30.0, v + 0.04, 0.35, 1.3, 0.3, 'COMPLAINTS\nDEPARTMENT', 0.07, M['white'], M['ink'], screws=M['steel'])
    out.append(ubox('slot', -30.25, v + 0.07, -29.75, v + 0.09, 0.2, 0.27, M['black'], bevel=0.005))
    out.append(text('txt', 'LET ME OUT', -36.2, v + 0.04, 0.32, 0.07, M['chalk'], face=True))
    # flat lettering on the low lips (readable from the camera)
    lip = lambda r: (r[3] + r[3] + PAD) / 2
    out.append(text('txt', 'NETWORK RULES:  1. MY NETWORK   2. SEE RULE 1', -17.2, lip(ROOMS['server']), H_LOW + 0.003, 0.15, M['paint_w']))
    out.append(text('txt', 'R E D   C O M E T', -9.0, lip(ROOMS['bay']) - 0.05, H_LOW + 0.003, 0.2, M['white']))
    comet_logo(B, M, -11.9, lip(ROOMS['bay']) - 0.05, H_LOW + 0.002, 0.42, rot=0.0)
    comet_logo(B, M, -6.1, lip(ROOMS['bay']) - 0.05, H_LOW + 0.002, 0.42, rot=0.0)
    out.append(text('txt', 'DEFENCE DEPT.  (MOSTLY OFFENCE)', -29.0, lip(ROOMS['corridor']), H_LOW + 0.003, 0.12, M['paint_w']))
    skull(-34.4, lip(ROOMS['corridor']) - 0.08, H_LOW + 0.002, 0.45, M['white'], out, face=False)
    out.append(text('txt', 'CAPTAIN ON BOARD', -38.2, -10.35, H_LOW + 0.003, 0.14, M['paint_w']))

# ---------------------------------------------------------------------------------------------------
# Build + render
# ---------------------------------------------------------------------------------------------------
def build(side):
    mn.reset(); D.set_side(side)
    rng = random.Random(7); M = mats()
    parts = {}
    t0 = time.time()
    # floors per room (+ subfloor), door floors, tube threshold (with the bay)
    for name, r in ROOMS.items():
        out = []; B = Batch(); subfloor(r, M, out)
        FLOOR_FN[name](r, M, random.Random(hash(name) % 1000), B, out)
        if name == 'bay':
            subfloor(TUBE_GAP, M, out); tread_plate(B, M, (TUBE_GAP[0] + TUBE_GAP[2]) / 2, 0, TUBE_GAP[2] - TUBE_GAP[0] - GAP, 1.2 - GAP, M['tread'], rng)
        if name == 'quarters':                                            # the blast door's slot in the east wall (door: doors.py)
            subfloor(BLAST, M, out); B.ubox(K(M['tread_dark'], 0.01), BLAST[0] + 0.02, BLAST[1] + 0.02, BLAST[2] - 0.02, BLAST[3] - 0.02, 0, FLOOR_Z)
        objs = out + B.build('floor_' + name, M)
        parts['floor_' + name] = objs
    for name in DOORS:
        out = []; B = Batch(); door_floor(name, M, rng, B, out)
        parts['door_' + name] = out + B.build('door_' + name, M)
    # walls
    out = []; B = Batch()
    big = masses(M)
    room_walls(M, rng, out, B); top_decor(M, rng, out, B); exterior(M, rng, out, B)
    flat = [o for o in out if o.name.startswith(('txt', 'stain', 'plq_t'))]
    det = [o for o in out if o not in flat]
    mn.outline(big, thickness=0.02); mn.outline([o for o in det if o.type == 'MESH'], thickness=0.012)
    parts['walls'] = big + out + B.build('walls', M)
    for k, objs in parts.items():
        for o in objs: o['part'] = k
    print(f'[base] built {side} in {time.time() - t0:.1f}s, {len(bpy.context.scene.objects)} objects')
    return parts

def show_only(parts, visible, holdout=(), hidden=()):
    for k, objs in parts.items():
        for o in objs:
            o.hide_render = k in hidden or (k not in visible and k not in holdout)
            o.is_holdout = k in holdout and k not in visible

def tile_has_content(x0, x1, y0, y1):
    for h in HULLS:
        X = sorted((P(h[0], 0).x, P(h[2], 0).x)); Y = (-h[3], -h[1])
        up0 = Y[0] * SIN - 0.7 * COS; up1 = Y[1] * SIN + 2.6 * COS
        if X[1] + 0.1 > x0 and X[0] - 0.1 < x1 and up1 > y0 and up0 < y1: return True
    return False

def render_side(side):
    parts = build(side)
    allk = list(parts.keys())
    floor_keys = [k for k in allk if k.startswith(('floor_', 'door_'))]
    want = lambda n: not ONLY or any(o in n for o in ONLY)
    if 'floors' in PARTS:
        for name in ROOMS:
            n = f'{GROUP}/floor_{name}_{side}'
            if not want(n): continue
            show_only(parts, ['floor_' + name], holdout=[k for k in allk if k != 'floor_' + name])
            mn.render(n, objs=[o for o in parts['floor_' + name] if o.type == 'MESH'])
    if 'doors' in PARTS:
        for name in DOORS:
            n = f'{GROUP}/door_{name}_{side}'
            if want(n):
                show_only(parts, ['door_' + name], holdout=[k for k in allk if k != 'door_' + name])
                mn.render(n, objs=parts['door_' + name])
    if 'walls' in PARTS:
        show_only(parts, ['walls'], holdout=floor_keys)
        objs = [o for o in parts['walls'] if o.type == 'MESH']
        x0, x1, y0, y1 = mn._bounds(objs)
        TW, TH = 8.0, 6.0
        X0, Y1 = math.floor(x0 - 0.1), math.ceil(y1 + 0.1)
        cols, rows = math.ceil((x1 + 0.1 - X0) / TW), math.ceil((Y1 - (y0 - 0.1)) / TH)
        tiles = []
        for rI in range(rows):
            for cI in range(cols):
                tx0, ty1 = X0 + cI * TW, Y1 - rI * TH; tx1, ty0 = tx0 + TW, ty1 - TH
                if not tile_has_content(tx0, tx1, ty0, ty1): continue
                n = f'{GROUP}/walls_{side}_r{rI}c{cI}'
                tiles.append(n)
                if not want(n): continue
                render_exact(n, tx0, tx1, ty0, ty1, origin=(0, 0, 0), extra={'tile': [rI, cI], 'layer': 'wall'})
        if not ONLY:
            mn._manifest_put(f'{GROUP}/walls_{side}', {'w': 0, 'h': 0, 'ox': 0, 'oy': 0, 'dirs': 1, 'frames': 1, 'files': [],
                             'tiles': tiles, 'tile_px': [int(TW * mn.PPU), int(TH * mn.PPU)],
                             'note': 'Red Comet base hull + walls as screen tiles; every tile (and every base/ sprite) has its origin at our '
                                     'hatch on the ground: draw all at (hatch.x, hatch.y), wall layer.'})

if __name__ == '__main__':
    t = time.time()
    for side in SIDES:
        render_side(side)
    print(f'[base] done in {time.time() - t:.0f}s')
