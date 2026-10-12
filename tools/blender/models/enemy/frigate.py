"""Frigate (js/enemies.js ENEMY_TYPES.frigate, drawFrigate): the long armored gunship.

Sprites (build/renders/enemy/), all on the frigate's ground origin (manifest ox/oy) unless noted:
  frigate_<side>                       hull without light turret, weak spots and radar dish; side = port | star
  frigate_<side>_<poi>_<state>         one weak spot, hull as holdout (lines up with the game's POI shapes):
      cable_ok|hit     turret power cable           line (1.3,-5.7)(1.85,-5.15)(2.1,-4.2), w 0.2
      heavy_ok|hit     heavy cannon capacitor coils box 3.35..5.45 x -0.68..0.28
      heavy_charge_f0..3  the coils while the heavy shot charges (pink energy crawling along, 4-frame loop)
      dish_ok|up|hit   shield emitter               circle (3.98, 1.9) r 0.36 (up = while e.shieldUp)
      aux_ok|hit       side engine coolant jacket   box 2.95..3.95 x 3.85..4.75
      main_ok|hit      main engine coolant ring     box -1.1..1.1 x 6.8..7.3
  frigate_turret_d<i>                  light turret, 32 aim directions, origin = its pivot (2.15, -3.65)
  frigate_radar_d<i>                   the bridge radar dish turning (game: angle t), 16 directions, on the frigate
                                       origin (pivot at (0, -3.1) on the tower roof; same for both sides)

Local frame and side handling as in interceptor.py (z = 0 is the deck / weak-spot plane). Round weak spots are
sized so their silhouette on screen covers the game's shape; boxy ones (main ring, aux jacket) are sheared along
the view (comp) so they project exactly onto it. Left to the game (procedural): engine flames, the heavy shot's
muzzle charge glow (radial gradient growing with e.charge), the hex shield bubble (drawEnemyShield), smoke,
sparks and the hit flash.

    blender -b --factory-startup --python tools/blender/models/enemy/frigate.py [-- draft] [-- port|star] [-- noturret]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enemylib as el
from enemylib import P, prism, lbox, ycyl, disc, tube, mn, ic, bpy, bmesh, Vector

ARGS = el.ARGS
SIDES = [s for s in ('port', 'star') if s in ARGS] or ['port', 'star']
NAME = 'enemy/frigate'
COT = el.COT

HULL = [(0, -7.2), (1.1, -6.2), (1.9, -4), (2.3, -1), (2.6, 2), (2.6, 5), (2.0, 6.4), (-2.0, 6.4),
        (-2.6, 5), (-2.6, 2), (-2.3, -1), (-1.9, -4), (-1.1, -6.2)]
PIVOT = (2.15, -3.65)
CABLE = [(1.3, -5.7), (1.85, -5.15), (2.1, -4.2)]; CABLE_W = 0.2
HEAVY = (3.35, -0.68, 5.45, 0.28)
DISH = (3.98, 1.9, 0.36)
AUX = (2.95, 3.85, 3.95, 4.75)
MAIN = (-1.1, 6.8, 1.1, 7.3)
RADAR = (0, -3.1)

def xcyl(name, r, x0, x1, ly, z, m, verts=32, bevel=0.015, r1=None, sz=1.0):
    """Cylinder along local x from x0 to x1 (axis at ly, height z); sz squashes it vertically."""
    o = mn.cyl(name, r, x1 - x0, loc=(0, 0, 0), m=m, verts=verts, bevel=bevel)
    for v in o.data.vertices:
        k = v.co.z / (x1 - x0); s = 1.0 if r1 is None else (r + (r1 - r) * k) / r
        lx = x0 + v.co.z; ly_ = ly + v.co.y * s; zz = z + v.co.x * s * sz
        v.co = P(lx, ly_, zz)
    return o

def shear(o):
    """Shear a mesh along the view about z = 0 so it projects exactly onto its footprint (see interceptor comp)."""
    for v in o.data.vertices: v.co.y -= v.co.z * COT
    return o

def squash_z(o, k, z0=0.0):
    for v in o.data.vertices: v.co.z = z0 + (v.co.z - z0) * k
    return o

def groove(name, ax, ay, bx, by, z, m, w=0.012):
    L = math.hypot(bx - ax, by - ay); n = (-(by - ay) / L * w, (bx - ax) / L * w)
    return prism(name, [(ax + n[0], ay + n[1]), (bx + n[0], by + n[1]), (bx - n[0], by - n[1]), (ax - n[0], ay - n[1])], z, z + 0.004, m, bevel=0.0)

# ---------------------------------------------------------------------------------------------------------
def build(sd):
    el.side(sd)
    M = el.standard_mats()
    M.update(
        paint=el.worn('paint', '#7a5c64', 0.45, 0.15), paint2=el.worn('paint2', '#3a2a30', 0.5, 0.15),
        bridge=el.worn('bridge', '#8a6c74', 0.45, 0.15), stripe=el.worn('stripe', '#a8342a', 0.45, 0.1, wear=0.7),
        pod=el.worn('pod', '#6a6f7a', 0.4, 0.25), pod2=el.worn('pod2', '#3a3f4a', 0.45, 0.25),
        breech=el.worn('breech', '#5a6272', 0.4, 0.4, wear=0.6), door=el.worn('door', '#2b2226', 0.6, 0.2),
        mount=el.worn('mount', '#5a5054', 0.45, 0.2), dishm=el.worn('dishframe', '#9aa3b5', 0.35, 0.6, wear=0.4),
        pink=el.emit_mat('pink', '#ff6ab0', 1.4, base='#ff5aa8'), pinkl=el.emit_mat('pink_light', '#ffc0e0', 3.0, base='#ffb0d8'),
        blue=el.emit_mat('blue_f', '#4aa8ff', 1.0, base='#2f7fd8'), bluel=el.emit_mat('bluel_f', '#bfe6ff', 2.4, base='#8fd0ff'),
        bluew=el.emit_mat('blue_white', '#e8f8ff', 5.0, base='#ffffff'), bluedim=el.emit_mat('blue_dim', '#5fb4ff', 1.2, base='#2a5a90'),
        webglass=el.web_glass('webglass'), halo_big=el.halo_mat('halo_big', '#6ebeff', 4.0), halo_pink=el.halo_mat('halo_pink', '#ff8ac0', 3.5),
    )
    hull, outl = [], []
    def H(o, ol=True):
        hull.append(o)
        if ol: outl.append(o)
        return o

    # -- main body ------------------------------------------------------------------------------------
    belly = H(prism('belly', HULL, -0.55, -0.22, M['paint2'], bevel=0.06))
    for v in belly.data.vertices: v.co.x *= 0.96; v.co.y *= 0.98
    H(prism('deck', HULL, -0.28, 0.0, M['paint'], inset=0.1, chamfer=0.08, bevel=0.03))
    spine = [(0, -6.5), (0.62, -5.6), (1.0, -4.1), (1.25, -1.0), (1.4, 2.0), (1.4, 6.15)]
    spine = spine + [(-x, y) for x, y in reversed(spine[1:])]
    H(prism('spine', spine, -0.05, 0.2, M['paint2'], inset=0.08, chamfer=0.07, bevel=0.025))
    # armor plates on the spine: a darker inset block aft (the game's shaded rectangle)
    H(prism('aft_plate', [(1.25, 2.05), (1.25, 4.95), (-1.25, 4.95), (-1.25, 2.05)], 0.18, 0.24, M['paint2'], inset=0.03, chamfer=0.03, bevel=0.012))
    for i, x in enumerate((-0.9, -0.5, -0.1, 0.3, 0.7)):                     # vents
        H(lbox(f'vent{i}', x, 5.4, x + 0.22, 6.0, 0.17, 0.215, M['black'], bevel=0.01), False)
    # red edge stripes (both sides)
    for s in (1, -1):
        st = [(s * 2.0, -1), (s * 2.25, -1), (s * 2.5, 2), (s * 2.25, 2)]
        H(prism(f'redstripe{s}', st, 0.0, 0.008, M['stripe'], bevel=0.0), False)
    # panel lines on the deck and spine
    for (ax, ay, bx, by) in ((-2.4, -4, -1.0, -4), (1.0, -4, 2.0, -4), (-2.3, -1, -1.25, -1), (1.25, -1, 2.3, -1), (-2.55, 2, -1.4, 2), (1.4, 2, 2.55, 2),
                             (-2.55, 5, -1.4, 5), (1.4, 5, 2.55, 5), (0, -6.2, 0, -4.75), (-1.9, -1, -1.9, 6.2), (1.9, -1, 1.9, 6.2)):
        H(groove('groove', ax, ay, bx, by, 0.0, M['black']), False)
    for (ax, ay, bx, by) in ((0, -2.4, 0, 2.0), (-1.2, -1, 1.2, -1), (-1.33, 2.0, 1.33, 2.0), (-1.33, 5.0, -1.25, 5.0)):
        H(groove('groove', ax, ay, bx, by, 0.2, M['black']), False)
    # rivets
    for lx, ly in [(0.6, -6), (-0.6, -6), (1.2, -3.4), (-1.2, -3.4), (1.8, 0.4), (-1.8, 0.4), (2.2, 4), (-2.2, 4), (1, 6), (-1, 6),
                   (1.6, -2.2), (-1.6, -2.2), (2.3, 2.6), (-2.3, 1.3), (1.6, 5.6), (-1.6, 5.6)]:
        z = 0.2 if abs(lx) < 1.2 and ly < 6.1 else 0.0
        H(mn.sphere('rivet', 0.026, loc=P(lx, ly, z), m=M['steel'], segs=10), False)
    # stencils, kill marks, tape
    H(el.text('tag', 'FR-21', -1.95, -2.9, 0.004, 0.32, M['white'], rot=math.radians(90) * ic.S), False)
    for k in range(7):
        H(lbox(f'kill{k}', -0.6 + k * 0.1 - 0.02, -2.3, -0.6 + k * 0.1 + 0.02, -2.1, 0.2, 0.214, M['white'], bevel=0.0), False)
    for k, (cx, cy, a) in enumerate(((1.8, 1.25, 0.55), (1.8, 1.25, -0.55))):
        H(prism(f'tape{k}', el.rot_rect(cx, cy, 0.5, 0.11, a), 0.0 + 0.006 * k, 0.012 + 0.006 * k, M['tape'], bevel=0.003), False)
    # spine details: two round hatches, conduit pipes along the spine edges, a raised plate amidships, arrows
    for (hx, hy) in ((0.0, -1.7), (0.0, 0.9)):
        H(mn.cyl('hatch', 0.36, 0.05, loc=P(hx, hy, 0.19), m=M['paint'], bevel=0.02, verts=40))
        H(mn.cyl('hatch_ring', 0.38, 0.02, loc=P(hx, hy, 0.18), m=M['stripes'], bevel=0.0, verts=40), False)
        H(lbox('hatch_handle', hx - 0.14, hy - 0.03, hx + 0.14, hy + 0.03, 0.24, 0.27, M['steel'], bevel=0.01), False)
    for s in (1, -1):
        H(el.tube_nc('conduit', [(s * 1.05, -1.6, 0.22), (s * 1.18, -0.9, 0.22), (s * 1.24, 2.2, 0.22), (s * 1.24, 5.2, 0.22)], 0.035, M['pod2']))
        for yy in (-0.6, 0.8, 2.6, 4.0):
            H(lbox('clamp', s * 1.24 - 0.05, yy - 0.03, s * 1.24 + 0.05, yy + 0.03, 0.2, 0.265, M['steel'], bevel=0.006), False)
    H(prism('mid_plate', [(0.9, -0.6), (0.9, 0.3), (-0.9, 0.3), (-0.9, -0.6)], 0.18, 0.225, M['paint'], inset=0.02, chamfer=0.02, bevel=0.01))
    for k in range(3):
        y = 3.0 + k * 0.42
        H(prism('arrow', [(0, y - 0.16), (0.16, y + 0.04), (0.06, y + 0.04), (0.06, y + 0.16), (-0.06, y + 0.16), (-0.06, y + 0.04), (-0.16, y + 0.04)],
                0.24, 0.247, M['white'], bevel=0.0), False)
    H(disc('soot_heavy', 2.0, -0.2, 0.012, 0.55, M['scorch'], sy=0.8), False)
    H(disc('soot_nose', -0.7, -5.2, 0.205, 0.3, M['scorch'], sy=0.7), False)

    # -- bridge tower, radar mast, nose antenna ---------------------------------------------------------
    H(prism('tower', [(0.95, -4.7), (0.95, -2.5), (-0.95, -2.5), (-0.95, -4.7)], 0.15, 0.62, M['bridge'], inset=0.1, chamfer=0.1, bevel=0.06))
    H(prism('tower_roof', [(0.7, -4.55), (0.7, -3.55), (-0.7, -3.55), (-0.7, -4.55)], 0.6, 0.64, M['paint2'], bevel=0.015))
    for r in range(2):
        for c in range(4):
            x0, y0 = -0.75 + c * 0.42, -4.4 + r * 0.45
            H(lbox('window', x0 + 0.02, y0 + 0.02, x0 + 0.24, y0 + 0.18, 0.62, 0.655, M['window'], bevel=0.01), False)
            H(lbox('wframe', x0, y0, x0 + 0.26, y0 + 0.2, 0.6, 0.645, M['dark'], bevel=0.008), False)
    H(mn.cyl('radar_base', 0.16, 0.08, loc=P(*RADAR, 0.6), m=M['gun'], bevel=0.015))
    H(ycyl('antenna', 0.022, -8.0, -6.9, 0, 0.03, M['steel'], verts=10, bevel=0.0), False)
    H(mn.sphere('nav_nose', 0.07, loc=P(0, -8.0, 0.03), m=M['navr'], segs=16), False)
    H(prism('nosecap', [(0, -7.15), (0.45, -6.75), (0.3, -6.55), (-0.3, -6.55), (-0.45, -6.75)], 0.0, 0.08, M['paint2'], inset=0.02, chamfer=0.02, bevel=0.012))

    # -- far side: hangar door, two decorative turrets -------------------------------------------------
    H(lbox('hangar', -2.2, 2.5, -1.2, 4.5, -0.02, 0.025, M['door'], bevel=0.02))
    for k in range(1, 4):
        H(groove('hangar_seam', -2.15, 2.75 + k * 0.42, -1.25, 2.75 + k * 0.42, 0.025, M['black']), False)
    H(lbox('hangar_haz', -2.15, 2.55, -1.25, 2.71, 0.025, 0.035, M['stripes'], bevel=0.0), False)
    for y in (-2.2, 0.6):
        H(mn.cyl('dturret_base', 0.32, 0.1, loc=P(-1.75, y, 0.0), m=M['mount'], bevel=0.025))
        H(mn.cyl('dturret_head', 0.22, 0.12, loc=P(-1.75, y, 0.1), m=M['gunl'], bevel=0.03))
        H(xcyl('dturret_barrel', 0.06, -2.62, -1.8, y, 0.16, M['gun'], verts=12))
        H(xcyl('dturret_muzzle', 0.075, -2.68, -2.55, y, 0.16, M['pod2'], verts=8))

    # -- light turret sponson + cable junction --------------------------------------------------------
    H(mn.cyl('sponson', 0.45, 0.2, loc=P(*PIVOT, -0.2), m=M['mount'], bevel=0.04, verts=48))
    H(mn.cyl('turret_ring', 0.4, 0.06, loc=P(*PIVOT, 0.0), m=M['steel'], bevel=0.015, verts=48))
    H(mn.cyl('turret_well', 0.2, 0.02, loc=P(*PIVOT, 0.05), m=M['dark'], bevel=0.0), False)
    for k in range(10):
        a = k * math.tau / 10
        H(mn.sphere('ringbolt', 0.02, loc=P(PIVOT[0] + math.cos(a) * 0.33, PIVOT[1] + math.sin(a) * 0.33, 0.062), m=M['gun'], segs=8), False)

    # -- heavy broadside cannon (housing, armored breech, barrel) --------------------------------------
    H(lbox('heavy_housing', 2.2, -1.3, 3.3, 0.9, -0.38, 0.12, M['gun'], bevel=0.05))
    H(lbox('breech', 2.35, -1.15, 3.15, 0.75, 0.1, 0.34, M['breech'], bevel=0.04))
    for i in range(1, 6):
        H(groove('breech_rib', 2.42, -1.15 + i * 0.32, 3.08, -1.15 + i * 0.32, 0.34, M['black'], w=0.018), False)
    H(lbox('breech_haz', 2.4, 0.62, 3.1, 0.72, 0.34, 0.35, M['stripes'], bevel=0.0), False)
    H(xcyl('barrel', 0.235, 3.2, 5.47, -0.2, 0.0, M['gun'], verts=32))
    H(xcyl('muzzle', 0.3, 5.42, 5.64, -0.2, 0.0, M['pod2'], verts=8, bevel=0.02))
    H(xcyl('bore', 0.16, 5.635, 5.645, -0.2, 0.0, M['black'], bevel=0.0), False)
    for k in range(3):
        H(xcyl('brake', 0.302, 5.46 + k * 0.055, 5.48 + k * 0.055, -0.2, 0.0, M['black'], verts=8, bevel=0.0), False)

    # -- shield emitter pylon + dish frame -------------------------------------------------------------
    H(lbox('dish_pylon', 2.4, 1.7, 3.3, 2.1, -0.12, 0.06, M['mount'], bevel=0.03))
    H(mn.cyl('dish_frame', 0.55, 0.1, loc=P(3.55, 1.9, -0.06, comp=True), m=M['dishm'], bevel=0.03, verts=48))
    H(mn.cyl('dish_inner', 0.42, 0.02, loc=P(3.55, 1.9, 0.035, comp=True), m=M['gun'], bevel=0.0, verts=48), False)
    for k in range(3):
        a = math.pi * 0.6 + k * math.pi * 0.4
        H(mn.sphere('dish_bolt', 0.022, loc=P(3.55 + math.cos(a) * 0.48, 1.9 + math.sin(a) * 0.48, 0.045, comp=True), m=M['steel'], segs=8), False)

    # -- side engine on its pylon (the pod is sheared like the coolant jacket, so they stay together) ------------
    H(lbox('engine_pylon', 2.4, 3.4, 3.1, 3.8, -0.12, 0.06, M['mount'], bevel=0.03))
    pod = []
    pod.append(ycyl('pod', 0.425, 3.25, 5.0, 3.425, 0.0, M['pod'], bevel=0.03))
    nose = mn.sphere('pod_nose', 0.425, loc=P(3.425, 3.25, 0.0), m=M['pod'], scale=(1, 0.6, 1), segs=32)
    bpy.context.view_layer.update(); el.apply_tf(nose); pod.append(nose)
    pod.append(ycyl('pod_band', 0.435, 3.55, 3.65, 3.425, 0.0, M['pod2'], bevel=0.01))
    pod.append(ycyl('pod_tail', 0.4, 5.0, 5.2, 3.425, 0.0, M['pod2'], bevel=0.02, r1=0.33))
    for o in pod: squash_z(o, 0.75); shear(o); H(o)
    H(mn.cyl('intake', 0.22, 0.06, loc=P(3.42, 3.25, 0.0, comp=True), m=M['pod2'], bevel=0.015))
    H(mn.cyl('intake_hole', 0.15, 0.02, loc=P(3.42, 3.25, 0.06, comp=True), m=M['black'], bevel=0.0), False)
    H(ycyl('pod_nozzle_in', 0.27, 5.19, 5.21, 3.425, 0.0, M['hot'], bevel=0.0), False)
    shear(hull[-1])
    H(ycyl('pod_nozzle_core', 0.14, 5.2, 5.22, 3.425, 0.0, M['hot2'], bevel=0.0), False)
    shear(hull[-1])

    # -- main engine at the stern (sheared like its coolant ring) -----------------------------------------
    eng = [lbox('main_engine', -0.95, 6.3, 0.95, 7.7, -0.4, 0.22, M['breech'], bevel=0.06, comp=True)]
    eng.append(lbox('main_plate', -0.6, 6.5, 0.6, 6.75, 0.22, 0.26, M['pod2'], bevel=0.015, comp=True))
    eng.append(lbox('main_nozzle', -0.7, 7.45, 0.7, 7.75, -0.32, 0.12, M['gun'], bevel=0.03, comp=True))
    for o in eng: H(o)
    H(lbox('main_glow', -0.55, 7.74, 0.55, 7.78, -0.25, 0.05, M['hot'], bevel=0.0, comp=True), False)
    for x in (-1.5, 1.5):                                                    # trim thrusters
        H(ycyl('trim', 0.1, 6.15, 6.45, x, -0.12, M['gun'], verts=16, bevel=0.01, r1=0.08))
        H(ycyl('trim_in', 0.065, 6.44, 6.455, x, -0.12, M['hot'], verts=16, bevel=0.0), False)

    # ---------------------------------------------------------------------------------------------------
    # weak spots
    # ---------------------------------------------------------------------------------------------------
    pois, halos = {}, {}
    # cable: braided blue power line from a junction box on the deck edge to the turret ring
    zc = 0.09
    cab = [(x, y, zc) for x, y in CABLE]
    ok = [tube('cable', cab, CABLE_W / 2, M['blue'])]
    for k in range(11):
        t = (k + 0.5) / 11; i = 0 if t < 0.42 else 1; u = t / 0.42 if i == 0 else (t - 0.42) / 0.58
        a, b = CABLE[i], CABLE[i + 1]
        p = (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        d = (Vector(P(b[0], b[1])) - Vector(P(a[0], a[1]))).normalized()
        q = mn.sphere('braid', 1.0, loc=P(*p, zc, comp=True), m=M['bluel'], segs=12)
        q.rotation_euler = (0, 0, math.atan2(d.y, d.x)); q.scale = (0.03, 0.105, 0.105); ok.append(q)
    conns = [mn.box('conn', (0.22, 0.22, 0.14), loc=P(x, y, 0.02, comp=True), m=M['steel'], bevel=0.025) for x, y in (CABLE[0], CABLE[-1])]
    pois[('cable', 'ok')] = ok + conns
    hit = []
    a, m_, b = CABLE
    def along(p, q, d):
        L = math.hypot(q[0] - p[0], q[1] - p[1]); return (p[0] + (q[0] - p[0]) * d / L, p[1] + (q[1] - p[1]) * d / L)
    e1, e2 = along(m_, a, 0.13), along(m_, b, 0.13)
    hit.append(tube('cable_cut1', [(a[0], a[1], zc), (e1[0], e1[1], zc - 0.03)], CABLE_W / 2 * 0.95, M['rubber']))
    hit.append(tube('cable_cut2', [(e2[0], e2[1], zc - 0.03), (b[0], b[1], zc)], CABLE_W / 2 * 0.95, M['rubber']))
    for e, f in ((e1, a), (e2, b)):
        for k in range(5):
            ang = k * 1.3
            tip = (e[0] + (e[0] - f[0]) * 0.22 + math.cos(ang) * 0.04, e[1] + (e[1] - f[1]) * 0.22 + math.sin(ang) * 0.04)
            hit.append(tube('wire', [(e[0], e[1], zc - 0.03), (tip[0], tip[1], zc + 0.02 * (k % 2))], 0.014, M['copper']))
        hit.append(mn.sphere('ember', 0.055, loc=P(e[0], e[1], zc - 0.03, comp=True), m=M['ember'], segs=12))
    hit += [mn.box('conn', (0.22, 0.22, 0.14), loc=P(x, y, 0.02, comp=True), m=M['char'], bevel=0.025) for x, y in (CABLE[0], CABLE[-1])]
    hit.append(disc('scorch_cable', *m_, 0.012, 0.5, M['scorch'], sy=0.85))
    pois[('cable', 'hit')] = hit
    halos['cable'] = [disc('halo_cable', *m_, 0.2, 0.55, M['halo'], sy=0.8)]

    # heavy cannon coils: five capacitor rings around the barrel (radius sized so they cover the box on screen)
    x0, y0, x1, y1 = HEAVY
    rc = (y1 - y0) * math.sin(el.E) / 2; yc = (y0 + y1) / 2
    def coils(m_body, m_band, tag, charge_frame=None):
        out = []
        for i in range(5):
            cx = 3.42 + i * 0.42
            mb = m_body
            if charge_frame is not None:                                    # a pulse of energy crawling along the coils
                ph = (charge_frame / 4 - i * 0.25) % 1.0
                mb = M['pinkl'] if ph < 0.25 else M['pink']
            out.append(xcyl(f'coil{tag}{i}', rc, cx, cx + 0.24, yc, 0.0, mb, verts=40, bevel=0.03))
            for k in range(3):                                              # winding ridges
                out.append(xcyl(f'wind{tag}{i}', rc + 0.008, cx + 0.04 + k * 0.07, cx + 0.07 + k * 0.07, yc, 0.0, m_band, verts=40, bevel=0.0))
        return out
    ok = coils(M['blue'], M['bluel'], 'o')
    pois[('heavy', 'ok')] = ok
    hit = coils(M['char'], M['dark'], 'x')
    hit.append(xcyl('coil_split', rc + 0.012, 4.33, 4.37, yc, 0.0, M['ember'], verts=40, bevel=0.0))
    for k in range(4):
        ang = k * 1.6
        hit.append(tube('wire', [(4.35, yc - rc * 0.6, 0.1), (4.35 + math.cos(ang) * 0.12, yc - rc * 0.6 + math.sin(ang) * 0.1, 0.18)], 0.014, M['copper']))
    hit.append(disc('scorch_heavy', 4.3, -0.2, rc + 0.02, 0.7, M['scorch'], sy=0.5))
    hit.append(mn.sphere('ember', 0.05, loc=P(3.7, yc, rc, comp=False), m=M['ember'], segs=10))
    pois[('heavy', 'hit')] = hit
    halos['heavy'] = [disc('halo_heavy', 4.4, -0.2, rc + 0.04, 1.35, M['halo_big'], sy=0.6)]
    for f in range(4):
        pois[('heavy', f'charge_f{f}')] = coils(M['pink'], M['pinkl'], f'c{f}', charge_frame=f)
    halos['heavy_charge'] = [disc('halo_charge', 4.4, -0.2, rc + 0.04, 1.35, M['halo_pink'], sy=0.6)]

    # shield emitter: a domed lens with two ring grooves and a bright core (flat dome, comp so it covers the circle)
    dx, dy, dr = DISH
    def dome(name, r, z0, h, m):
        o = mn.sphere(name, 1.0, loc=P(dx, dy, z0, comp=True), m=m, scale=(r, r, h), segs=64)
        bpy.context.view_layer.update(); el.apply_tf(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z0 - 1e-4], context='VERTS'); bm.to_mesh(o.data); bm.free()
        return o
    def rings(m):
        return [el.tube_nc('lensring', [(dx + math.cos(a) * r, dy + math.sin(a) * r + 0.1 * COT, 0.1) for a in [i / 48 * math.tau for i in range(48)]],
                           0.013, m, closed=True) for r in (0.24, 0.12)]
    base = lambda nm, m: mn.cyl(nm, dr, 0.05, loc=P(dx, dy, 0.0, comp=True), m=m, bevel=0.015, verts=48)
    pois[('dish', 'ok')] = [base('lens_base', M['gun']), dome('lens', dr - 0.02, 0.05, 0.08, M['blue']), *rings(M['dark']), dome('lenscore', 0.07, 0.11, 0.05, M['bluel'])]
    pois[('dish', 'up')] = [base('lens_base', M['gun']), dome('lens', dr - 0.02, 0.05, 0.08, M['bluel']), *rings(M['blue']), dome('lenscore', 0.08, 0.11, 0.06, M['bluew'])]
    hit = [base('lens_base', M['char']), dome('lens', dr - 0.02, 0.05, 0.05, M['webglass']), dome('lenscore', 0.08, 0.1, 0.03, M['black'])]
    hit.append(mn.sphere('ember', 0.04, loc=P(dx + 0.12, dy - 0.1, 0.1, comp=True), m=M['ember'], segs=10))
    hit.append(mn.sphere('ember', 0.03, loc=P(dx - 0.14, dy + 0.12, 0.09, comp=True), m=M['ember'], segs=10))
    hit.append(disc('scorch_dish', dx, dy, 0.14, 0.36, M['scorch'], sy=1.0))
    pois[('dish', 'hit')] = hit
    halos['dish'] = [disc('halo_dish', dx, dy, 0.16, 0.8, M['halo'], sy=1.0)]
    halos['dish_up'] = [disc('halo_dish_up', dx, dy, 0.16, 1.3, M['halo_big'], sy=1.0)]

    # side engine coolant jacket: a finned ring around the pod (sheared with it -> exactly the game box)
    x0, y0, x1, y1 = AUX
    def jacket(m, mf, tag, broken=False):
        r = (x1 - x0) / 2; cx = (x0 + x1) / 2
        out = [ycyl(f'jacket{tag}', r, y0 + 0.03, y1 - 0.03, cx, 0.0, m, bevel=0.03)]
        out += [ycyl(f'jrim{tag}', r - 0.01, yy, yy + 0.05, cx, 0.0, M['steel'] if not broken else M['char'], bevel=0.01) for yy in (y0, y1 - 0.05)]
        for k in range(1, 4):
            out.append(ycyl(f'jfin{tag}', r + 0.008, y0 + k * 0.225 - 0.02, y0 + k * 0.225 + 0.02, cx, 0.0, mf, bevel=0.0))
        for o in out: squash_z(o, 0.75); shear(o)
        return out
    pois[('aux', 'ok')] = jacket(M['blue'], M['bluel'], 'o')
    hit = jacket(M['char'], M['dark'], 'x', broken=True)
    hit.append(mn.sphere('ember', 0.045, loc=P(3.6, 4.2, 0.3, comp=True), m=M['ember'], segs=10))
    hit.append(mn.sphere('ember', 0.03, loc=P(3.2, 4.5, 0.3, comp=True), m=M['ember'], segs=10))
    hit.append(disc('scorch_aux', 3.45, 4.3, 0.33, 0.5, M['scorch'], sy=0.9))
    pois[('aux', 'hit')] = hit
    halos['aux'] = [disc('halo_aux', 3.45, 4.3, 0.34, 0.95, M['halo'], sy=0.9)]

    # main engine coolant ring: a collar around the engine block (sheared box)
    x0, y0, x1, y1 = MAIN
    def collar(m, mf, tag):
        out = [lbox(f'collar{tag}', x0, y0, x1, y1, -0.45, 0.3, m, bevel=0.05, comp=True)]
        for k in range(1, 4):
            xx = x0 + k * (x1 - x0) / 4
            out.append(lbox(f'cfin{tag}', xx - 0.025, y0 + 0.03, xx + 0.025, y1 - 0.03, 0.29, 0.31, mf, bevel=0.005, comp=True))
        return out
    pois[('main', 'ok')] = collar(M['blue'], M['bluel'], 'o')
    hit = collar(M['char'], M['dark'], 'x')
    hit.append(mn.sphere('ember', 0.05, loc=P(-0.4, 7.05, 0.32, comp=True), m=M['ember'], segs=10))
    hit.append(mn.sphere('ember', 0.035, loc=P(0.55, 6.95, 0.32, comp=True), m=M['ember'], segs=10))
    hit.append(disc('scorch_main', 0.0, 7.05, 0.32, 0.75, M['scorch'], sy=0.45))
    pois[('main', 'hit')] = hit
    halos['main'] = [disc('halo_main', 0.0, 7.05, 0.33, 1.1, M['halo'], sy=0.55)]

    mn.outline(outl, thickness=0.02)
    skip = ('scorch', 'braid', 'ember', 'wire', 'halo', 'wind', 'jfin', 'cfin', 'lensring', 'lenscore', 'coil_split')
    mn.outline([o for v in pois.values() for o in v if not o.name.startswith(skip)], thickness=0.016)
    return hull, pois, halos, M

def render_side(sd):
    hull, pois, halos, M = build(sd)
    allp = [o for v in pois.values() for o in v]; allh = [o for v in halos.values() for o in v]
    t0 = time.time()
    el.show(allp + allh, False)
    mn.render(f'{NAME}_{sd}', objs=hull)
    print(f'[frigate] {sd} hull: {time.time() - t0:.1f}s'); t0 = time.time()
    for (pid, state), objs in pois.items():
        halo = halos.get(pid, []) if state == 'ok' else halos.get(f'{pid}_up', []) if state == 'up' else \
               halos['heavy_charge'] if state.startswith('charge') else []
        nm = f'{NAME}_{sd}_{pid}_{state}'
        if state.startswith('charge'):
            continue
        el.render_poi(nm, objs, hull, halo, hide=allp + allh)
    # the charge loop: one sprite set, 4 frames
    for o in hull: o.is_holdout = True
    el.show(allp + allh, False)
    frames = [pois[('heavy', f'charge_f{f}')] for f in range(4)]
    def st(f):
        def setup(kind):
            for i, fr in enumerate(frames): el.show(fr, i == f)
            el.show(halos['heavy_charge'], kind in (None, 'beauty'))
        return setup
    el.render_states(f'{NAME}_{sd}_heavy_charge', [(f'_f{f}', st(f)) for f in range(4)],
                     lambda: [o for fr in frames for o in fr] + halos['heavy_charge'], frames=4)
    for o in hull: o.is_holdout = False
    el.show(allp + allh, False)
    print(f'[frigate] {sd} weak spots: {time.time() - t0:.1f}s'); t0 = time.time()
    # radar dish on the bridge: its own little sprite set turning around its mast (16 directions)
    el.side(sd)
    parts = [mn.cyl('radar_post', 0.05, 0.14, loc=(0, 0, 0), m=M['steel'], bevel=0.0, verts=12)]
    dish = mn.sphere('radar_dish', 1.0, loc=(0.0, 0, 0.0), m=M['dishm'], scale=(0.1, 0.38, 0.26), segs=32)
    dish.location = (0.07, 0, 0.24); dish.rotation_euler = (0, math.radians(-25), 0); parts.append(dish)
    parts.append(mn.cyl('radar_arm', 0.018, 0.3, loc=(0.0, 0, 0.17), m=M['gun'], bevel=0.0, verts=8, rot=(0, math.radians(90), 0)))
    parts.append(mn.sphere('radar_feed', 0.035, loc=(0.32, 0, 0.17), m=M['navr'], segs=10))
    mn.outline(parts[:2], thickness=0.012)
    pivot = P(*RADAR, 0.68)
    root = mn.group('radar', parts, loc=pivot)
    for o in hull: o.hide_render = True
    if sd == SIDES[0]: mn.render(f'{NAME}_radar', objs=parts, root=root, dirs=16)
    for o in hull: o.hide_render = False
    print(f'[frigate] {sd} radar: {time.time() - t0:.1f}s')

# ---------------------------------------------------------------------------------------------------------
# Light turret: own sprite set, origin = pivot, modelled pointing +x (game angle 0); barrel 1.25 like the game
# ---------------------------------------------------------------------------------------------------------
def render_turret():
    el.side('port'); mn.reset(); mn._mats.clear()
    gun = el.worn('gunmetal', '#6a6f7a', 0.45, 0.15, wear=0.7)
    gun2 = el.worn('gunmetal2', '#3a3f4a', 0.5, 0.1, wear=0.5)
    steel = el.worn('steel', '#9aa3b5', 0.35, 0.5, wear=0.3)
    haz = el.hazard_mat('hz', period=0.06)
    blk = mn.mat('black', '#0b0c0f', 0.9)
    red = el.emit_mat('sight', '#ff4a3a', 6.0)
    parts = []
    head = prism('head', [(-0.3, -0.27), (0.18, -0.3), (0.36, -0.16), (0.36, 0.16), (0.18, 0.3), (-0.3, 0.27), (-0.36, 0.15), (-0.36, -0.15)],
                 0.05, 0.36, gun, inset=0.07, chamfer=0.08, bevel=0.03)
    parts.append(head)
    parts.append(prism('head_plate', [(-0.22, -0.15), (0.12, -0.16), (0.12, 0.16), (-0.22, 0.15)], 0.35, 0.39, gun2, bevel=0.01))
    parts.append(mn.sphere('sight', 0.04, loc=(0.1, -0.22, 0.32), m=red, segs=12))
    parts.append(lbox('mantlet', 0.28, -0.15, 0.56, 0.15, 0.09, 0.33, gun2, bevel=0.035))
    def xc(name, r, x0, x1, z, m, bevel=0.012, verts=24):
        return mn.cyl(name, r, x1 - x0, loc=(x0, 0, z), m=m, verts=verts, bevel=bevel, rot=(0, math.radians(90), 0))
    parts.append(xc('barrel_sleeve', 0.11, 0.52, 0.86, 0.21, gun))
    parts.append(xc('barrel', 0.08, 0.84, 1.1, 0.21, steel))
    parts.append(xc('muzzle', 0.12, 1.08, 1.27, 0.21, gun2, bevel=0.015, verts=8))
    parts.append(xc('bore', 0.05, 1.265, 1.275, 0.21, blk, bevel=0.0))
    for k in range(3): parts.append(xc(f'brake{k}', 0.122, 1.12 + k * 0.045, 1.14 + k * 0.045, 0.21, blk, bevel=0.0, verts=8))
    parts.append(xc('haz_band', 0.112, 0.66, 0.74, 0.21, haz, bevel=0.0))
    parts.append(lbox('feed', -0.46, -0.16, -0.28, 0.16, 0.06, 0.26, gun2, bevel=0.025))
    for k in range(2):
        for s in (1, -1):
            parts.append(mn.sphere('bolt', 0.024, loc=(-0.1 + k * 0.18, s * 0.17, 0.28), m=steel, segs=8))
    mn.outline([p for p in parts if p.name not in ('sight', 'bore') and not p.name.startswith(('bolt', 'brake', 'haz'))], thickness=0.016)
    root = mn.group('turret', parts)
    t0 = time.time()
    mn.render(f'{NAME}_turret', objs=parts, root=root, dirs=32)
    print(f'[frigate] turret: {time.time() - t0:.1f}s')

if __name__ == '__main__':
    T = time.time()
    for sd in SIDES:
        mn.reset(); mn._mats.clear()
        render_side(sd)
    if 'noturret' not in ARGS:
        render_turret()
    print(f'[frigate] total {time.time() - T:.1f}s')
