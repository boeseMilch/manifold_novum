"""CONCEPT MOCK-UP (not a game sprite): "The Culture" -- Dr. Varga's lab overgrown by S-7, a thawed grappler tissue culture.

    blender -b --factory-startup --python tools/blender/models/concepts/culture.py -- <out_dir> [key|full|late ...] [samples]
    (DOCK_CPU=1 renders on the CPU when the shared GPU is busy)

Builds the derelict lab exactly like models/dock/ships.py (build('derelict', 'port')), our docking tube (copied from
tube.py) and a slice of our own left airlock room (x 0.6 .. 8.8 of portLock, the left capacitor stands at (6.6, 22.6),
i.e. u 6.6, v 3.4), then adds the concept on top:
  * the pirates' fight: a Red Comet boarding claw torn into the lab roof (its arm cut off), scorch marks and laser
    burns, a barricade of lab furniture at the core door, a dropped pirate carbine, a red pirate helmet, an overturned
    specimen tank, drag marks from the core to the airlock (where they took Varga), one of her shoes, her taped notes,
    the SPECIMEN 7 - DO NOT FEED plaque, Gerald the dead plant, cold coffee;
  * S-7: fleshy purple / sickly green mats over floors and back walls, thick tendrils across floors and doorways,
    bioluminescent nodules, the pulsing HEART in the core wrapped round the warm black box (heater), a cocooned pirate
    on the lab wall, the burst cryo freezer ("S-7 GRAPPLER TISSUE - KEEP FROZEN"), growth creeping along the tube into
    our airlock room towards our warm capacitor;
  * the fix: the lab's power junction J1 in its airlock patched to our tether power line; the line glows along the
    wall tops to the freezer; cold spreads from the freezer room by room (frozen grey husks where the growth retreated).
Variants:
  key   mid-mission: freezer just restarted (cold radius ~3 around it), growth everywhere else
  full  arrival: freezer dead, tether line still coiled at the tube mouth, growth at full strength
  late  the freezer has run a while: lab and airlock frozen, the heart shrivelled and letting go of the black box
  (every variant also renders <v>_coil.png: only the front half of the tendril coil round the grabbed crew member,
   to composite over the crew sprite)
Writes <out_dir>/culture_<v>.png (+ .json: ppu, ox, oy of the hatch point) and never touches build/renders.
All variants share one camera window (a hidden frame box), so the same projection works for every image.
"""
import sys, os, math, random, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock')); sys.path.insert(0, os.path.join(HERE, '..', 'organic'))
sys.path.insert(0, os.path.join(HERE, '..', '..'))
import bpy
import mn
_argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = next((a for a in _argv if a.startswith('/')), '/tmp/mn_concept_culture')
VARIANTS = [a for a in _argv if a in ('key', 'full', 'late')] or ['key', 'full', 'late']
SAMPLES = next((int(a) for a in _argv if a.isdigit()), 24)
sys.argv = sys.argv[:sys.argv.index('--')] if '--' in sys.argv else sys.argv   # (ships.py / orglib read their own args)
import docklib as D
from docklib import *
import ships
import orglib as O
from mathutils import Vector, noise

mn.PPU = 88
mn.OUT_DIR = OUT
_entry = {}
mn._manifest_put = lambda name, e: _entry.update(e)

FREEZER = (-12.6, -3.6)                 # cryo cabinet against the lab's back wall
HEART = (-22.35, 0.7)                  # the heart mass in the core, wrapped round the black box (SPOT.box)
BOX = SPOT['box']
FIRE = SPOT['fire']
JUNC = (-6.7, ROOMS['airlock'][1])      # the lab's dead power junction J1, on the airlock's back wall
GRAB = (-16.55, 1.95)                   # where the tendril holds a crew member (comp places the sprite here)
CAP = (6.6, 3.4)                        # our left capacitor (js/ship.js CAPACITORS[0], relative to the hatch)
DOOR_AL, DOOR_LC, MOUTH = (-10.5, 0.0), (-18.7, 0.0), (-5.6, 0.0)
OURROOM = (0.6, -4.2, 8.8, 4.0)         # the visible slice of our left airlock room
POWER = '#ffd84a'                       # js/systems.js POWER_COL

def inr(u, v, r, pad=0.0):
    return r[0] + pad <= u <= r[2] - pad and r[1] + pad <= v <= r[3] - pad

def region(u, v):
    if inr(u, v, ROOMS['cargo']): return 'lab'
    if inr(u, v, ROOMS['core']): return 'core'
    if inr(u, v, ROOMS['airlock']): return 'air'
    if inr(u, v, DOORS[0]): return 'doorAL'
    if inr(u, v, DOORS[1]): return 'doorLC'
    if inr(u, v, (TUBE[0], TUBE[1], 0.6, TUBE[3])): return 'tube'
    if inr(u, v, OURROOM): return 'ship'
    return None

def hyp(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])

def cold_dist(u, v):
    """Distance the cold has to travel from the open freezer: room by room, through the doors."""
    p = (u, v); r = region(u, v)
    if r in ('lab', 'doorAL', 'doorLC', None): return hyp(FREEZER, p)
    if r == 'core': return hyp(FREEZER, DOOR_LC) + hyp(DOOR_LC, p)
    if r == 'air': return hyp(FREEZER, DOOR_AL) + hyp(DOOR_AL, p)
    return hyp(FREEZER, DOOR_AL) + hyp(DOOR_AL, MOUTH) + hyp(MOUTH, p)

COLD_R = 0.0
def cold(u, v):
    if COLD_R <= 0: return 0.0
    return max(0.0, min(1.0, (COLD_R - cold_dist(u, v)) / 0.9))

def gauss(u, v, c, s): return math.exp(-((u - c[0]) ** 2 + (v - c[1]) ** 2) / (2 * s * s))

def dens(u, v):
    """How thick S-7 grows here (> TH = covered). Heat sources pull it in; a faint walkway stays readable."""
    r = region(u, v)
    if r in (None, 'tube', 'ship'): return -1.0
    n = noise.noise(Vector((u * 0.55, v * 0.55, 0.3))) + 0.35 * noise.noise(Vector((u * 1.9 + 10, v * 1.9, 1.1)))
    d = 0.42 + 0.95 * n
    d += {'core': 0.42, 'lab': 0.08, 'air': -0.12, 'doorAL': 0.1, 'doorLC': 0.3}[r]
    d += 1.1 * gauss(u, v, HEART, 1.7) + 0.75 * gauss(u, v, FIRE, 0.9) + 0.6 * gauss(u, v, (FREEZER[0], FREEZER[1] + 0.6), 0.9)
    d += 0.55 * gauss(u, v, (-15.0, -3.6), 0.7)                     # round the cocoon
    if r in ('lab', 'air'): d -= 0.28 * math.exp(-(v - 0.3) ** 2 / 0.6)
    d -= 0.5 * gauss(u, v, JUNC, 0.6)
    return d
TH = 0.55

# ---------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------
def culture_mats():
    M = {}
    M['flesh'] = O.flesh('s7_flesh', '#3c1446', '#7a3a8e', c2='#1c0624', veins='#b4e04a', vein_k=0.55, scale=1.6,
                         spots='#9cffc8', spot_scale=6, spot_size=0.06, spot_strength=1.1, sss=0.25, sss_col=(1.0, 0.4, 0.9),
                         coat=0.7, rough=0.3, bump=0.5, speckle=('#2a0834', 11.0, 0.25, 0.6))
    M['tend'] = O.flesh('s7_tend', '#3e1248', '#7a3a90', c2='#1c0624', veins='#b4e04a', vein_k=0.6, scale=3.0, spots='#9cffc8', spot_scale=9, spot_size=0.05, spot_strength=1.0,
                        sss=0.3, sss_col=(1.0, 0.4, 0.9), coat=0.75, rough=0.28, belly='#a8d050', belly_axis=(0, 0, -1), belly_k=0.35)
    M['heart'] = O.flesh('s7_heart', '#4a1052', '#8a3482', c2='#1e0622', veins='#ff6ab4', vein_k=1.0, scale=1.8,
                         spots='#ff7ac8', spot_scale=4, spot_size=0.1, spot_strength=1.5, sss=0.4, sss_col=(1.0, 0.3, 0.6),
                         coat=0.9, rough=0.22, bump=0.6)
    M['frozen'] = O.flesh('s7_frozen', '#5c5668', '#a7a6b8', c2='#2a2832', veins='#dff0ff', vein_k=0.5, scale=2.0,
                          sss=0.0, coat=0.2, rough=0.75, bump=0.9)
    M['wither'] = O.flesh('s7_wither', '#3a2440', '#6e5478', c2='#160c1a', veins='#d8ecff', vein_k=0.45, scale=2.2,
                          sss=0.1, coat=0.3, rough=0.6, bump=1.0, spots='#ff7ac8', spot_scale=4, spot_size=0.06, spot_strength=0.6)
    M['nod'] = O.emit_mat('s7_nod', '#9cffc8', 1.3, base='#5ad8a0', coat=1.0)
    M['nod_pink'] = O.emit_mat('s7_nodp', '#ff7ac8', 1.2, base='#c04a90', coat=1.0)
    M['pus'] = O.emit_mat('s7_pus', '#c8ff5a', 0.9, base='#8ac02a', coat=1.0)
    M['ice'] = O.plain('ice', '#e8f4ff', 0.12, coat=1.0, sss=0.3)
    M['frost'] = decal_mat('frostc', '#dceaf6', 0.75, 7.0, rough=0.9)
    M['frost2'] = decal_mat('frostc2', '#eef6ff', 0.55, 12.0, rough=0.9)
    M['soot'] = decal_mat('soot2', '#0b0a09', 0.92)
    M['drag'] = decal_mat('drag', '#b8bcc4', 0.55, 9.0)
    M['ooze'] = decal_mat('ooze', '#2a0a30', 0.85, 6.0, rough=0.1)
    M['red'] = worn('rc_red', '#b03028', 0.45, 0.2, wear=0.9, grime=0.9)
    M['redsuit'] = worn('rc_suit', '#a8322a', 0.6, 0.0, wear=0.4, grime=0.8)
    M['gun'] = worn('rc_gun', '#30343c', 0.4, 0.6, wear=0.6)
    M['visor'] = mn.mat('rc_visor', '#d2a62e', 0.15, 0.6, clearcoat=1.0)
    M['tether'] = stripes_mat('tether', POWER, '#23252b', 4.0)
    M['live'] = emit_mat('live', POWER, 0.9, base='#c8a030')
    M['dead_cable'] = pmat('dead_cable', '#2a2c30', 0.6)
    M['cab'] = worn('cab', '#d8dcd8', 0.45, 0.1, wear=0.6, grime=0.9)
    M['cab_trim'] = worn('cab_trim', '#3a78b8', 0.4, 0.2, wear=0.7)
    M['cold_in'] = emit_mat('cold_in', '#7ad8ff', 1.1, base='#2a6a9a')
    M['cold_scr'] = emit_mat('cold_scr', '#5ac8ff', 0.9, base='#0a2a3a')
    M['led_g'] = emit_mat('led_g', '#5aff9a', 1.4, base='#2a7a4a')
    M['led_r'] = emit_mat('led_r2', '#ff3a2a', 1.4, base='#6a1a14')
    M['heater'] = emit_mat('heater', '#ff8a2a', 1.3, base='#a04010')
    M['bbox'] = worn('bbox', '#e86a1e', 0.45, 0.3, wear=0.6)
    M['ship_floor'] = [worn(f'sfl{i}', c, 0.5, 0.35, wear=0.5, grime=0.9, scale=1.5) for i, c in enumerate(['#3f4757', '#3b4353', '#434b5b'])]
    M['ship_tread'] = worn('stread', '#7f8794', 0.42, 0.55, wear=0.6, grime=0.8, scale=1.5)
    M['ship_hull'] = worn('shull', '#4e5666', 0.45, 0.3, wear=0.6, grime=1.0)
    M['ship_panel'] = worn('spanel', '#4a515e', 0.5, 0.3, wear=0.5, grime=0.7)
    M['ship_panel2'] = worn('spanel2', '#5a6272', 0.45, 0.3, wear=0.5, grime=0.6)
    M['ship_lamp'] = emit_mat('slamp', '#ffe2b0', 1.3, base='#fff0d0')
    M['locker'] = worn('slocker', '#c4683a', 0.5, 0.1, wear=0.7, grime=0.7)
    M['white2'] = worn('white2', '#e8e8e0', 0.5, 0.0, wear=0.5, grime=0.6)
    M['chair'] = worn('chair', '#4a5a6a', 0.5, 0.1, wear=0.7)
    M['cabinet'] = worn('fcab', '#8a8e7a', 0.5, 0.3, wear=0.7)
    M['shoe'] = worn('shoe', '#7a2a24', 0.6, 0.0, wear=0.3)
    M['leaf'] = pmat('deadleaf', '#6a5a2a', 0.8)
    M['pot'] = worn('pot', '#b86a3a', 0.6, 0.0, wear=0.5)
    M['note_ink'] = pmat('note_ink', '#2a3a8a', 0.6)
    M['redpaint'] = decal_mat('redpaint', '#b0281e', 0.9, rough=0.7)
    return M

# ---------------------------------------------------------------------------------------------------
# Growth geometry
# ---------------------------------------------------------------------------------------------------
def grid_mesh(name, rect, hfn, place, m, step=0.07, keep=lambda h: h > 0, subsurf=True):
    """Height-field patch over rect (u0, a0, u1, a1): faces where all corners keep(h); place(u, a, h) -> Blender point."""
    import bmesh
    u0, a0, u1, a1 = rect
    nu, na = int((u1 - u0) / step) + 1, int((a1 - a0) / step) + 1
    H = [[hfn(u0 + i * step, a0 + j * step) for j in range(na)] for i in range(nu)]
    bm = bmesh.new(); V = {}
    def vert(i, j):
        if (i, j) not in V: V[(i, j)] = bm.verts.new(place(u0 + i * step, a0 + j * step, H[i][j]))
        return V[(i, j)]
    nf = 0
    for i in range(nu - 1):
        for j in range(na - 1):
            hs = (H[i][j], H[i + 1][j], H[i + 1][j + 1], H[i][j + 1])
            if sum(1 for h in hs if keep(h)) >= 3 and keep(sum(hs) / 4):
                bm.faces.new((vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1))); nf += 1
    if not nf: bm.free(); return None
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); mn.smooth(o)
    if subsurf:
        md = o.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1
    return o

def floor_growth(M, out):
    rects = [ROOMS['cargo'], ROOMS['core'], ROOMS['airlock'], DOORS[0], DOORS[1]]
    for k, r in enumerate(rects):
        rr = (r[0] + 0.04, r[1] + 0.04, r[2] - 0.04, r[3] - 0.04)
        def live_h(u, v):
            g = dens(u, v) - TH
            return g if cold(u, v) < 0.45 else -1
        def dead_h(u, v):
            g = dens(u, v) - TH
            return g * 0.5 if cold(u, v) >= 0.45 else -1
        def place(u, v, h, k_=1.0):
            bump = 0.02 * noise.noise(Vector((u * 4.1, v * 4.1, 2.0)))
            return P(u, v, FLOOR_Z + 0.006 + max(0.0, min(0.16, h * 0.22 * k_)) + max(0, bump) * (h > 0))
        o = grid_mesh(f'grow_{k}', rr, live_h, place, M['flesh']); out.append(o)
        o = grid_mesh(f'growd_{k}', rr, dead_h, lambda u, v, h: place(u, v, h, 0.4), M['frozen']); out.append(o)

def wall_growth(M, out):
    """Mats climbing the back walls (thickest behind the cocoon, the freezer and in the core)."""
    for k, (name, extra) in enumerate((('cargo', 0.0), ('core', 0.25), ('airlock', -0.25))):
        r = ROOMS[name]; wv = r[1]
        def h(u, z):
            if cold(u, wv + 0.3) >= 0.45: return -1
            g = dens(u, wv + 0.35) - TH + extra + 0.3 - z * 0.5 + 0.25 * noise.noise(Vector((u * 1.3, z * 2.0, 5.0)))
            g += 1.1 * gauss(u, z, (-15.0, 0.9), 0.75) if name == 'cargo' else 0
            return g
        def place(u, z, g):
            return P(u, wv + 0.1 + max(0.0, min(0.12, g * 0.18)), z)
        o = grid_mesh(f'wgrow_{k}', (r[0] + 0.05, 0.05, r[2] - 0.05, 1.5), h, place, M['flesh'], step=0.06)
        out.append(o)

def smooth_path(pts, sub=6):
    """Catmull-Rom through (u, v, z) points."""
    P_ = [pts[0]] + list(pts) + [pts[-1]]; res = []; nd = len(pts[0])
    for i in range(1, len(P_) - 2):
        p0, p1, p2, p3 = P_[i - 1], P_[i], P_[i + 1], P_[i + 2]
        for s in range(sub):
            t = s / sub; t2, t3 = t * t, t * t * t
            res.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                                    (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(nd)))
    res.append(tuple(pts[-1])); return res

def tendril(name, pts, r0, r1, M, out, rng, lie=True, wiggle=0.08, nodules=True, mat=None, tag=None, cut=True):
    """A tapered tendril along (u, v[, z]) points, root first. Lying on the floor (z = radius) unless z given.
    Where the cold has reached it, the rest is a thin frozen husk (it retreated from there)."""
    pts3 = [(p[0], p[1], p[2] if len(p) > 2 else None) for p in pts]
    sm = smooth_path([(u, v, z or 0.0, 0.0 if z is None else 1.0) for u, v, z in pts3], 8)
    L = len(sm); res = []
    for i, (u, v, z, e) in enumerate(sm):
        e = max(0.0, min(1.0, e))
        t = i / max(1, L - 1)
        r = r0 + (r1 - r0) * t ** 0.8
        r *= 1.0 + 0.18 * math.sin(i * 0.9 + rng.uniform(0, 0.3))
        ph = noise.noise(Vector((u * 2.3, v * 2.3, 7.7)))
        if i > 0 and i < L - 1:
            a = sm[max(0, i - 1)]; b = sm[min(L - 1, i + 1)]
            du, dv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(du, dv) or 1
            u += -dv / ln * ph * wiggle; v += du / ln * ph * wiggle
        zz = (FLOOR_Z + r * 0.8) * (1 - e) + z
        res.append((u, v, zz, r))
    # split where it froze
    segs = []; cur = []; state = None
    for q in res:
        c = cold(q[0], q[1]) >= 0.45 if cut else False
        if state is None: state = c
        if c != state:
            cur.append(q); segs.append((state, cur)); cur = [q]; state = c
        else: cur.append(q)
    if cur: segs.append((state, cur))
    objs = []
    for frozen, sg in segs:
        if len(sg) < 2: continue
        if frozen:
            bp = [P(u, v, max(FLOOR_Z + r * 0.35, z - r * 0.5)) for u, v, z, r in sg]
            o = O.tube(name + '_ice', bp, [r * 0.55 for *_, r in sg], M['frozen'], segs=10)
        else:
            o = O.tube(name, [P(u, v, z) for u, v, z, r in sg], [r for *_, r in sg], mat or M['tend'], segs=12)
            if nodules:
                for j in range(3, len(sg) - 2, 7):
                    u, v, z, r = sg[j]
                    if rng.random() < 0.75:
                        objs.append(mn.sphere('nod', r * rng.uniform(0.32, 0.45), loc=P(u + rng.uniform(-0.3, 0.3) * r, v - r * 0.3, z + r * 0.75),
                                              m=M['nod'] if rng.random() < 0.8 else M['pus'], segs=10))
        objs.append(o)
    out += objs
    if tag is not None: tag += objs
    return res

def lumps(M, out, rng, n=140):
    """Pustules and glowing nodules scattered on the live mats."""
    k = 0; tries = 0
    while k < n and tries < 6000:
        tries += 1
        u, v = rng.uniform(-25.0, -5.7), rng.uniform(-4.0, 4.0)
        g = dens(u, v) - TH
        if g < 0.25 or cold(u, v) >= 0.45 or region(u, v) is None: continue
        z = FLOOR_Z + min(0.16, g * 0.22)
        if rng.random() < 0.45:
            out.append(mn.sphere('lump', rng.uniform(0.08, 0.2), loc=P(u, v, z), m=M['flesh'], scale=(1.2, 1.0, 0.55), segs=16))
        else:
            out.append(mn.sphere('nod', rng.uniform(0.035, 0.07), loc=P(u, v, z + 0.03), m=M['nod'] if rng.random() < 0.7 else M['pus'], segs=10))
        k += 1

def heart(M, out, rng, shrink=1.0, frozen=False):
    """The heart: a big lumpy pulsing mass wrapped round the warm black box (which sticks out at the front)."""
    hu, hv = HEART if not frozen else (-23.9, -0.5)        # late: shrunk back towards the last warm corner
    s = shrink
    parts = [(P(hu, hv - 0.15, 0.6 * s), 1.3 * s, (1.3, 0.85, 0.95))]
    for k in range(13):
        a = math.radians(rng.uniform(165, 375)); r = rng.uniform(0.85, 1.3) * s
        parts.append((P(hu + math.cos(a) * r * 1.2, hv + math.sin(a) * r * 0.85, rng.uniform(0.2, 0.75) * s), rng.uniform(0.4, 0.68) * s, (1.2, 1.0, 0.85)))
    parts.append((P(hu - 0.2, hv - 0.3, 1.25 * s), 0.6 * s, (1.0, 1.0, 1.0)))
    for su in ((-1, 1) if not frozen else ()):           # two lobes hugging the box from the sides
        parts.append((P(BOX[0] + su * 0.6 * max(0.6, s), BOX[1] - 0.15, 0.22), 0.3 * s, (1.0, 1.3, 0.8)))
    m = M['wither'] if frozen else M['heart']
    hb = O.blob('heart', parts, m=m, res=0.06, threshold=0.6)
    out.append(hb)
    if not frozen:
        hb = O.displace(hb, strength=0.05, scale=0.35, seed=3)
        out[-1] = hb
        for k in range(34):                              # glowing nodules on top
            a = rng.uniform(0, math.tau); r = rng.uniform(0.2, 1.3)
            out.append(mn.sphere('hnod', rng.uniform(0.05, 0.1), loc=P(hu + math.cos(a) * r * 1.2, hv + math.sin(a) * r * 0.7 - 0.1, 1.45 - r * 0.6),
                                 m=M['nod_pink'] if k % 3 else M['nod'], segs=10))
        for k, dv in enumerate((-0.75, -0.2, 0.35)):     # veins arching over it, side to side
            w = 1.75 - abs(dv) * 0.4; top = 1.55 - abs(dv + 0.2) * 0.5
            pts = [(hu - w, hv + dv + 0.2, 0.08), (hu - w * 0.62, hv + dv + 0.05, top * 0.82), (hu - w * 0.1, hv + dv - 0.05, top + 0.05),
                   (hu + w * 0.45, hv + dv, top * 0.9), (hu + w, hv + dv + 0.25, 0.08)]
            out.append(O.tube('heart_art', [P(*p) for p in pts], [0.13, 0.11, 0.1, 0.1, 0.12], M['tend'], segs=10))
        add_light('POINT', 'heart_glow', P(hu, hv + 1.4, 1.6), 140.0, (1.0, 0.45, 0.8), radius=0.8)

def add_light(kind, name, loc, energy, color, radius=0.15, aim=None, spot=0.6, blend=0.35, size=None):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind in ('POINT', 'SPOT'): d.shadow_soft_size = radius
    if kind == 'SPOT': d.spot_size = spot; d.spot_blend = blend
    if kind == 'AREA': d.shape = 'RECTANGLE'; d.size, d.size_y = size
    o = bpy.data.objects.new(name, d); o.location = loc; bpy.context.scene.collection.objects.link(o)
    if aim is not None: o.rotation_euler = (aim - loc).to_track_quat('-Z', 'Y').to_euler()
    return o

# ---------------------------------------------------------------------------------------------------
# Props
# ---------------------------------------------------------------------------------------------------
def remove_named(prefixes, pred=lambda o: True):
    for o in list(bpy.data.objects):
        if o.name.split('.')[0].startswith(prefixes) and pred(o): bpy.data.objects.remove(o)

def freezer(M, Mb, out, running):
    fu, fv = FREEZER; w, d, h = 1.5, 0.78, 1.38
    u0, u1, vb, vf = fu - w / 2, fu + w / 2, fv - d / 2, fv + d / 2
    out.append(ubox('frz', u0, vb, u1, vf, 0.0, h, M['cab'], bevel=0.04))
    out.append(ubox('frz_trim', u0 - 0.01, vf - 0.05, u1 + 0.01, vf + 0.01, 0.06, 0.16, M['cab_trim'], bevel=0.01))
    out.append(ubox('frz_top', u0 + 0.05, vb + 0.05, u1 - 0.05, vf - 0.05, h, h + 0.12, Mb['dark'], bevel=0.02))
    for i in range(6): out.append(ubox('frz_vent', u0 + 0.15 + i * 0.2, vb + 0.15, u0 + 0.25 + i * 0.2, vf - 0.15, h + 0.12, h + 0.13, Mb['steel'], bevel=0))
    # the open bay (it burst from the inside): dark, or glowing cold when it runs again
    out.append(ubox('frz_bay', u0 + 0.1, vf - 0.02, fu + 0.25, vf + 0.005, 0.22, 1.18, M['cold_in'] if running else Mb['black'], bevel=0.0))
    for z in (0.5, 0.82):                                                   # bent shelf racks
        out.append(ubox('frz_rack', u0 + 0.12, vf - 0.01, fu + 0.23, vf + 0.02, z, z + 0.025, Mb['steel'], bevel=0.004))
    # the door: hanging open off its left hinge, buckled
    ang = math.radians(118); hu, hv = u0, vf
    du, dv = math.cos(ang), math.sin(ang); L = 1.0
    door = mn.box('frz_door', (L, 0.07, 1.0), loc=P(hu + du * L / 2, hv + dv * L / 2, 0.18), m=M['cab'], bevel=0.02)
    door.rotation_euler = (0.06, -0.05, math.atan2(-dv, du)); out.append(door)
    win = mn.box('frz_win', (0.5, 0.075, 0.35), loc=P(hu + du * L * 0.55, hv + dv * L * 0.55 + 0.01, 0.65), m=Mb['glass'], bevel=0.01)
    win.rotation_euler = door.rotation_euler; out.append(win)
    # right column: status screen, LED, the label
    out.append(ubox('frz_scr', fu + 0.33, vf, fu + 0.68, vf + 0.02, 1.0, 1.24, M['cold_scr'] if running else Mb['screen_dead'], bevel=0.005))
    if running: out.append(text('frz_t', '-80 C', fu + 0.505, vf + 0.025, 1.12, 0.09, M['ice'], face=True))
    out.append(mn.sphere('frz_led', 0.035, loc=P(fu + 0.505, vf + 0.02, 0.92), m=M['led_g'] if running else M['led_r'], segs=10))
    out.append(ubox('frz_lab', fu + 0.3, vf, fu + 0.71, vf + 0.015, 0.3, 0.84, Mb['white'], bevel=0.004))
    out.append(ubox('frz_labr', fu + 0.3, vf + 0.012, fu + 0.71, vf + 0.018, 0.74, 0.84, Mb['hazard_red'], bevel=0))
    out.append(text('frz_s7', 'S-7', fu + 0.505, vf + 0.02, 0.6, 0.13, Mb['ink'], face=True))
    out.append(text('frz_g', 'GRAPPLER', fu + 0.505, vf + 0.02, 0.48, 0.055, Mb['ink'], face=True))
    out.append(text('frz_g2', 'TISSUE', fu + 0.505, vf + 0.02, 0.42, 0.055, Mb['ink'], face=True))
    out.append(text('frz_k', 'KEEP FROZEN', fu + 0.505, vf + 0.02, 0.34, 0.05, M['cab_trim'], face=True))
    out.append(text('frz_brand', 'CRYO-MAX 9000', fu - 0.1, vf + 0.02, 1.27, 0.07, M['cab_trim'], face=True))
    tape(fu + 0.2, vf + 0.02, 1.33, 0.5, Mb['tape'], out)
    out.append(ucyl('mug', 0.07, 0.11, fu + 0.55, fv - 0.1, h + 0.12, Mb['white'], verts=14, bevel=0.01))   # cold coffee
    out.append(ucyl('coffee', 0.058, 0.005, fu + 0.55, fv - 0.1, h + 0.225, pmat('coffee', '#2a1a10', 0.1), verts=14, bevel=0))
    # power feed: the wall-top tray from J1, down into the freezer's back
    live = running
    path = [(JUNC[0], JUNC[1] - 0.05, 0.9), (JUNC[0], JUNC[1] - 0.25, H_FULL + 0.06), (-10.5, -2.65, H_FULL + 0.06), (-10.5, -4.3, H_FULL + 0.06),
            (fu + 0.4, -4.3, H_FULL + 0.06), (fu + 0.4, vb + 0.08, h + 0.2), (fu + 0.4, vb + 0.15, h + 0.1)]
    out.append(pipe_uv('feed', path, 0.045, M['live'] if live else M['dead_cable'], corner=0.15))
    if running:                                              # cold pouring out: frost round it, ice on the floor
        add_light('POINT', 'frz_cold', P(fu - 0.2, vf + 0.6, 0.7), 55.0, (0.55, 0.85, 1.0), radius=0.4)

def frost_floor(M, out, rng):
    """Frost decals wherever the cold has reached (denser near the freezer), ice spikes near it."""
    if COLD_R <= 0: return
    n = 0
    for _ in range(900):
        u, v = rng.uniform(-25.0, -5.6), rng.uniform(-4.0, 4.0)
        c = cold(u, v)
        if c < 0.3 or region(u, v) is None: continue
        stain(u, v, rng.uniform(0.25, 0.6) * (0.6 + 0.4 * c), M['frost'] if rng.random() < 0.6 else M['frost2'], out, sv=rng.uniform(0.6, 1.0), rotz=rng.uniform(0, 3), z=FLOOR_Z + 0.003 + 0.0005 * (n % 7))
        n += 1
        if n > (160 if COLD_R < 6 else 300): break
    fu, fv = FREEZER
    for k in range(26):
        a = rng.uniform(math.pi * 0.05, math.pi * 0.95); r = rng.uniform(0.5, 1.8 if COLD_R < 6 else 2.6)
        u, v = fu - 0.2 + math.cos(a) * r * 1.2, fv + 0.4 + math.sin(a) * r
        if region(u, v) != 'lab': continue
        sp = mn.cyl('ice', rng.uniform(0.03, 0.06), rng.uniform(0.08, 0.22), loc=P(u, v, FLOOR_Z), m=M['ice'], verts=5, bevel=0.005)
        sp.rotation_euler = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0); out.append(sp)

def cocoon(M, Mb, out, rng):
    """A Red Comet pirate wrapped onto the lab's back wall. Dead; left behind."""
    cu, cv = -15.0, ROOMS['cargo'][1] + 0.38
    out.append(mn.sphere('coc_body', 0.3, loc=P(cu, cv, 0.85), m=M['redsuit'], scale=(1.0, 0.8, 2.3), segs=24))
    out.append(mn.sphere('coc_helm', 0.24, loc=P(cu + 0.05, cv + 0.02, 1.62), m=M['red'], segs=24))
    out.append(mn.sphere('coc_visor', 0.17, loc=P(cu + 0.08, cv + 0.14, 1.6), m=M['visor'], scale=(1, 0.6, 0.75), segs=20))
    out.append(cbox('coc_crest', cu + 0.05, cv - 0.02, 0.05, 0.3, 1.8, 0.14, Mb['black'], bevel=0.02))
    out.append(O.tube('coc_arm', [P(cu + 0.25, cv + 0.05, 1.2), P(cu + 0.42, cv + 0.15, 0.85), P(cu + 0.45, cv + 0.2, 0.55)], [0.08, 0.075, 0.07], M['redsuit']))
    out.append(mn.sphere('coc_glove', 0.08, loc=P(cu + 0.46, cv + 0.22, 0.48), m=Mb['black'], segs=12))
    for su in (-0.1, 0.12): out.append(cbox('coc_boot', cu + su, cv + 0.05, 0.14, 0.22, 0.0, 0.18, Mb['black'], bevel=0.04))
    for k, (z, tilt, rr) in enumerate(((0.3, 0.12, 0.34), (0.62, -0.1, 0.36), (0.95, 0.14, 0.37), (1.25, -0.12, 0.33), (1.47, 0.1, 0.3))):
        pts = []
        for i in range(19):
            a = i / 18 * math.tau
            pts.append((cu + math.cos(a) * rr, cv + math.sin(a) * rr * 0.8, z + tilt * math.cos(a)))
        out.append(O.tube('coc_wrap', [P(*p) for p in pts], [0.075 + 0.02 * math.sin(i) for i in range(len(pts))], M['tend'], caps=False))
    for i in range(5):
        out.append(mn.sphere('nod', 0.045, loc=P(cu + rng.uniform(-0.3, 0.3), cv + 0.3, rng.uniform(0.3, 1.5)), m=M['nod'], segs=10))
    stain(cu, cv + 0.6, 0.55, M['ooze'], out, sv=0.6)

def claw(M, Mb, out):
    """The Red Comet boarding claw, torn into the lab's roof north of the lab; its arm cut through when they fled."""
    cu, cv, z = -13.6, -4.42, H_FULL
    out.append(ucyl('cl_hub', 0.32, 0.36, cu, cv, z + 0.18, M['red'], verts=20, bevel=0.04))
    out.append(ucyl('cl_hubring', 0.36, 0.08, cu, cv, z + 0.3, Mb['hazard'], verts=20, bevel=0.01))
    for (du, dv) in ((-0.75, 0.3), (0.75, 0.3), (0.0, -0.45)):
        pts = [(cu, cv, z + 0.35), (cu + du * 0.7, cv + dv * 0.7, z + 0.55), (cu + du, cv + dv, z + 0.2), (cu + du * 1.05, cv + dv * 1.05, z - 0.1)]
        out.append(O.tube('cl_prong', [P(*p) for p in pts], [0.1, 0.09, 0.075, 0.05], M['red'], segs=10))
        out.append(disc('cl_hole', cu + du * 1.05, cv + dv * 1.05, z + 0.004, 0.16, Mb['black']))
        out.append(disc('cl_soot', cu + du * 1.05, cv + dv * 1.05, z + 0.002, 0.34, M['soot']))
        for k in range(5):
            a = k * math.tau / 5
            out.append(cbox('cl_petal', cu + du * 1.05 + math.cos(a) * 0.17, cv + dv * 1.05 + math.sin(a) * 0.17, 0.12, 0.05, z, 0.04, Mb['hull'], bevel=0, rotz=a))
    # the arm: up and away north, cut off (the pirates left in a hurry)
    out.append(O.tube('cl_arm', [P(cu, cv, z + 0.4), P(cu + 0.1, cv - 0.5, z + 0.9), P(cu + 0.25, cv - 1.0, z + 1.1)], [0.16, 0.15, 0.15], M['red'], segs=12))
    out.append(mn.sphere('cl_stump', 0.15, loc=P(cu + 0.25, cv - 1.0, z + 1.1), m=Mb['steel'], scale=(1, 1, 0.4), segs=16))
    for k, c in enumerate(Mb['cables']):
        out.append(pipe_uv('cl_cable', [(cu + 0.2 + k * 0.05, cv - 0.98, z + 1.1), (cu + 0.35 + k * 0.08, cv - 1.25, z + 0.95), (cu + 0.3 + k * 0.1, cv - 1.4, z + 0.7)], 0.02, c, corner=0.1))
    out.append(text('cl_rc', 'RC', cu, cv, z + 0.37, 0.18, Mb['white']))

def barricade(M, Mb, out, rng):
    """Lab furniture piled at the core door (Varga's last stand), half torn apart."""
    # lab bench on its side, top facing the door
    out.append(ubox('bar_top', -18.05, -2.5, -17.92, -0.95, 0.0, 0.78, Mb['panel2'], bevel=0.02))
    for v in (-2.35, -1.1):
        for z in (0.1, 0.65): out.append(ubox('bar_leg', -17.92, v - 0.03, -17.3, v + 0.03, z - 0.03, z + 0.03, Mb['steel'], bevel=0.008))
    # filing cabinet lying down, drawers spilled
    out.append(cbox('bar_cab', -17.35, -1.75, 0.55, 1.0, 0.0, 0.45, M['cabinet'], bevel=0.03, rotz=0.25))
    for k in range(3):
        out.append(cbox('bar_paper', -16.9 + rng.uniform(-0.3, 0.3), -1.4 + rng.uniform(-0.4, 0.4), 0.22, 0.28, FLOOR_Z + 0.004 * k, 0.004, Mb['paper'], bevel=0, rotz=rng.uniform(0, 3)))
    # a chair on its back and an upturned specimen cart on the other side of the door
    out.append(cbox('bar_seat', -17.5, 1.25, 0.45, 0.45, 0.25, 0.07, M['chair'], bevel=0.02, rotz=0.4))
    o = cbox('bar_back', -17.75, 1.05, 0.45, 0.07, 0.15, 0.5, M['chair'], bevel=0.02, rotz=0.4); o.rotation_euler.x = math.radians(-60); out.append(o)
    out.append(ucyl('bar_pole', 0.03, 0.45, -17.5, 1.25, 0.0, Mb['steel'], verts=8, bevel=0))
    out.append(ubox('bar_cart', -18.05, 1.6, -17.3, 2.5, 0.0, 0.55, M['cab'], bevel=0.03, rotz=0.0))
    out.append(ubox('bar_carttop', -18.1, 1.55, -17.25, 2.55, 0.55, 0.6, Mb['steel'], bevel=0.02))
    out.append(ubox('bar_mattress', -17.95, -0.95, -17.2, -0.75, 0.0, 0.5, worn('matt', '#b8a888', 0.8, 0.0, wear=0.2), bevel=0.06))
    for k in range(5):                                                          # spilled sample jars
        u, v = -16.9 + rng.uniform(-0.5, 0.4), 2.2 + rng.uniform(-0.5, 0.6)
        out.append(mn.cyl('jar', 0.06, 0.16, loc=P(u, v, FLOOR_Z + 0.06), m=Mb['glass'], verts=12, bevel=0.01, rot=(R90, 0, rng.uniform(0, 3))))
    tape(-17.98, -1.5, 0.82, 0.6, Mb['tape'], out, rotz=1.2)

def story(M, Mb, out, rng):
    """The fight and the kidnapping, told by what's lying about."""
    # scorch marks and laser burns
    for (u, v, r) in ((-16.9, -2.1, 0.55), (-13.4, 2.7, 0.5), (-20.2, 1.5, 0.45), (-8.2, -1.3, 0.4), (-18.6, -0.4, 0.35), (-11.9, 1.6, 0.4)):
        stain(u, v, r, M['soot'], out, sv=0.7, rotz=rng.uniform(0, 3))
    for k in range(14):
        name = rng.choice(['cargo', 'core', 'airlock']); r = ROOMS[name]
        u = rng.uniform(r[0] + 0.3, r[2] - 0.3); z = rng.uniform(0.35, 1.35)
        if abs(u - FREEZER[0]) < 0.9 and name == 'cargo': continue
        out.append(mn.cyl('burn', 0.06, 0.012, loc=P(u, r[1] + 0.07, z), m=Mb['black'], rot=(R90, 0, 0), verts=12, bevel=0))
        out.append(mn.cyl('burn_rim', 0.1, 0.008, loc=P(u, r[1] + 0.065, z), m=M['soot'], rot=(R90, 0, 0), verts=14, bevel=0))
    # drag marks: two heel streaks from the core door, across the lab, through the airlock, into the tube
    path = [(-19.6, 0.4), (-18.4, 0.35), (-16.0, 0.6), (-13.6, 0.15), (-11.6, 0.25), (-10.2, 0.2), (-8.4, 0.05), (-6.2, 0.05), (-5.4, 0.0)]
    for off in (-0.1, 0.1):
        for (a, b) in zip(path, path[1:]):
            mu, mv = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + off
            L = hyp(a, b); ang = math.atan2(b[1] - a[1], b[0] - a[0])
            out.append(cbox('drag', mu, mv, L + 0.05, 0.06, FLOOR_Z + 0.002, 0.002, M['drag'], bevel=0, rotz=ang))
    out.append(cbox('shoe', -9.5, 0.75, 0.24, 0.1, FLOOR_Z, 0.09, M['shoe'], bevel=0.035, rotz=0.6))          # one of Varga's shoes
    # the dropped pirate carbine
    gu, gv = -16.3, -1.25
    out.append(cbox('carb', gu, gv, 0.78, 0.11, FLOOR_Z, 0.08, M['gun'], bevel=0.02, rotz=0.35))
    out.append(cbox('carb_stock', gu - 0.42, gv - 0.15, 0.24, 0.13, FLOOR_Z, 0.09, M['red'], bevel=0.03, rotz=0.35))
    out.append(cbox('carb_mag', gu + 0.05, gv + 0.1, 0.1, 0.16, FLOOR_Z, 0.06, Mb['black'], bevel=0.015, rotz=0.35))
    out.append(mn.sphere('carb_led', 0.025, loc=P(gu + 0.36, gv + 0.12, FLOOR_Z + 0.09), m=M['led_r'], segs=8))
    # a red pirate helmet in the airlock
    out.append(mn.sphere('ph', 0.2, loc=P(-7.3, -1.55, FLOOR_Z + 0.15), m=M['red'], scale=(1, 1, 0.9), segs=20))
    out.append(cbox('ph_crest', -7.3, -1.55, 0.36, 0.05, 0.28, 0.12, Mb['black'], bevel=0.02, rotz=0.4))
    out.append(mn.sphere('ph_visor', 0.15, loc=P(-7.25, -1.42, FLOOR_Z + 0.16), m=M['visor'], scale=(1, 0.6, 0.6), segs=16))
    # overturned specimen tank (it rolled off its base), shards and ooze
    o = mn.cyl('tank_fallen', 0.3, 1.05, loc=P(-16.5, -2.7, 0.33), m=Mb['glass'], verts=28, bevel=0.01, rot=(0, R90, 0.4)); out.append(o)
    o = mn.cyl('tank_cap_f', 0.35, 0.15, loc=P(-17.0, -2.9, 0.36), m=Mb['body'], verts=28, bevel=0.03, rot=(0, R90, 0.4)); out.append(o)
    stain(-15.8, -2.4, 0.6, M['ooze'], out, sv=0.6, rotz=0.4)
    # Varga's notes taped to the lab wall next to the freezer, one circled in red
    Cv = ROOMS['cargo'][1]
    for k, (u, z, rz) in enumerate(((-14.05, 1.15, 0.08), (-13.7, 1.05, -0.12), (-14.0, 0.72, -0.05), (-11.4, 1.1, 0.1))):
        p = ubox('note', u - 0.15, Cv + 0.07, u + 0.15, Cv + 0.08, z - 0.2, z + 0.2, Mb['paper'], bevel=0.002); p.rotation_euler.y = rz; out.append(p)
        out.append(ubox('note_tape', u - 0.08, Cv + 0.081, u + 0.08, Cv + 0.085, z + 0.15, z + 0.2, Mb['tape'], bevel=0))
        for j in range(4): out.append(ubox('note_l', u - 0.11, Cv + 0.082, u + 0.06 + 0.04 * (j % 2), Cv + 0.084, z + 0.08 - j * 0.07, z + 0.09 - j * 0.07, M['note_ink'], bevel=0))
    out.append(mn.cyl('note_circ', 0.13, 0.004, loc=P(-13.7, Cv + 0.087, 1.05), m=M['redpaint'], rot=(R90, 0, 0), verts=20, bevel=0))
    # SPECIMEN 7 - DO NOT FEED plaque with a sticky note
    out.append(ubox('plaque', -17.8, Cv, -16.2, Cv + 0.02, 1.38, 1.62, worn('plq', '#e8c34f', 0.5, 0.2, wear=0.6), bevel=0.004))
    out.append(text('plaque_t', 'SPECIMEN 7 - DO NOT FEED', -17.0, Cv + 0.03, 1.5, 0.075, Mb['ink'], face=True))
    out.append(ubox('sticky', -16.3, Cv + 0.025, -16.0, Cv + 0.03, 1.2, 1.45, Mb['sticker'], bevel=0.002))
    out.append(text('sticky_t', 'TOO LATE', -16.15, Cv + 0.032, 1.32, 0.05, Mb['ink'], face=True))
    # Gerald, the dead plant
    gu, gv = -11.35, 3.25
    out.append(ucyl('pot', 0.2, 0.3, gu, gv, 0.0, M['pot'], verts=20, bevel=0.03))
    for k in range(6):
        a = k * math.tau / 6
        out.append(pipe_uv('stem', [(gu, gv, 0.3), (gu + math.cos(a) * 0.12, gv + math.sin(a) * 0.08, 0.5), (gu + math.cos(a) * 0.3, gv + math.sin(a) * 0.2, 0.42)], 0.018, M['leaf'], corner=0.08))
    out.append(text('gerald', 'GERALD', gu, gv + 0.32, 0.12, 0.07, Mb['paper'], face=True))

def junction(M, Mb, out, patched):
    """J1: the lab's dead power junction (a little patch board behind a door) on the airlock back wall."""
    ju, jv = JUNC
    out.append(ubox('j1', ju - 0.38, jv, ju + 0.38, jv + 0.18, 0.35, 1.05, worn('j1y', '#e8c34f', 0.45, 0.3, wear=0.8, grime=0.8), bevel=0.02))
    out.append(ubox('j1_in', ju - 0.3, jv + 0.18, ju + 0.3, jv + 0.19, 0.42, 0.98, Mb['black'], bevel=0.0))
    door = mn.box('j1_door', (0.62, 0.03, 0.62), loc=P(ju - 0.42 - 0.2, jv + 0.4, 0.4), m=worn('j1d', '#5a6068', 0.5, 0.4, frost=0.8), bevel=0.01)
    door.rotation_euler.z = math.radians(-60); out.append(door)
    for i in range(3):
        for j in range(2):
            out.append(mn.cyl('j1_sock', 0.05, 0.03, loc=P(ju - 0.17 + i * 0.17, jv + 0.19, 0.58 + j * 0.22), m=Mb['steel'], rot=(R90, 0, 0), verts=12, bevel=0.005))
    if patched:                                              # patch leads between the sockets
        out.append(pipe_uv('j1_lead', [(ju - 0.17, jv + 0.22, 0.8), (ju - 0.05, jv + 0.32, 0.7), (ju + 0.17, jv + 0.22, 0.58)], 0.018, M['live']))
        out.append(pipe_uv('j1_lead', [(ju, jv + 0.22, 0.8), (ju + 0.1, jv + 0.3, 0.68), (ju - 0.17, jv + 0.22, 0.58)], 0.018, Mb['cables'][1]))
    out.append(text('j1_t', 'J1  LAB POWER', ju, jv + 0.19, 0.93, 0.065, Mb['ink'], face=True))
    out.append(mn.sphere('j1_led', 0.04, loc=P(ju + 0.3, jv + 0.2, 1.0), m=M['led_g'] if patched else M['led_r'], segs=10))
    tape(ju, jv + 0.19, 0.45, 0.45, Mb['tape'], out)

def tether_line(M, Mb, out, rng, connected):
    """Our tether's power line: from our left capacitor, through the hatch and along the tube floor. Patched into J1,
    or (on arrival) still coiled at the lab's door."""
    pts = [(CAP[0] - 0.4, CAP[1] - 0.2, 0.06), (4.2, 2.6, 0.06), (1.6, 1.0, 0.06), (0.5, 0.42, 0.06), (-2.0, 0.42, 0.08), (-5.6, 0.44, 0.08)]
    if connected:
        pts += [(-6.3, 0.6, 0.06), (-6.9, -0.5, 0.06), (-6.95, -1.8, 0.06), (JUNC[0] - 0.1, JUNC[1] + 0.25, 0.4), (JUNC[0] - 0.05, JUNC[1] + 0.2, 0.6)]
        out.append(pipe_uv('tether', pts, 0.055, M['tether'], corner=0.3))
        out.append(cbox('tplug', JUNC[0] - 0.05, JUNC[1] + 0.27, 0.16, 0.12, 0.52, 0.16, M['live'], bevel=0.02))
        for (u, v) in ((-6.9, -0.9), (-3.0, 0.42), (2.6, 1.6)):
            tape(u, v, 0.12, 0.3, Mb['tape'], out, rotz=1.3)
    else:
        pts += [(-6.3, 0.9, 0.06)]
        out.append(pipe_uv('tether', pts, 0.055, M['tether'], corner=0.3))
        for k in range(3):                                   # the coiled rest of the line
            r = 0.38 - k * 0.05
            ring_pts = [(-6.7 + math.cos(a) * r, 1.3 + math.sin(a) * r * 0.85, 0.06 + k * 0.1) for a in [i / 16 * math.tau for i in range(17)]]
            out.append(pipe_uv('tcoil', ring_pts, 0.055, M['tether'], corner=0.05))
        out.append(cbox('tplug', -6.25, 1.75, 0.2, 0.14, FLOOR_Z, 0.14, worn('tplugy', '#e8c34f', 0.45, 0.3), bevel=0.02))

# ---------------------------------------------------------------------------------------------------
# The tube (copied from models/dock/tube.py, without its own reset / render) and our airlock room
# ---------------------------------------------------------------------------------------------------
def build_tube(out):
    M = dict(grate=worn('grate', '#8a93a5', 0.5, 0.25, wear=0.5), sub=pmat('tsub', '#0e1014', 0.9),
             bellows=worn('bellows', '#6a7080', 0.75, 0.0, wear=0.2, grime=0.6), rib=worn('rib', '#e8c34f', 0.4, 0.3, wear=0.6),
             steel=worn('tsteel', '#a3abb8', 0.32, 0.85, wear=0.2), hazard=stripes_mat('thazard'), dark=pmat('tdark', '#1c1f25', 0.6),
             lamp=emit_mat('tlamp', '#9cd8ff', 0.9, base='#4a6a8a'), tape=pmat('ttape', '#b9bcc2', 0.85))
    u0, u1 = TUBE[0], 0.0; W = 0.6
    out.append(ubox('sub', u0, -W, u1, W, -0.08, -0.0, M['sub'], bevel=0))
    k = u0 + 0.05
    while k < u1 - 0.05:
        e = min(u1 - 0.03, k + 0.9)
        out.append(ubox('grate_rim', k, -W + 0.06, e, W - 0.06, -0.02, 0.03, M['grate'], bevel=0.01))
        for j in range(int((e - k - 0.1) / 0.09)):
            x = k + 0.08 + j * 0.09
            out.append(ubox('grate_slat', x, -W + 0.12, x + 0.04, W - 0.12, 0.03, 0.04, M['grate'], bevel=0.004))
        k = e + 0.03
    for sv in (-1, 1): out.append(ubox('rail', u0, sv * W - 0.06, u1, sv * W + 0.06, -0.02, 0.06, M['dark'], bevel=0.01))
    out.append(ubox('bellows_n', u0, -W - 0.14, u1, -W - 0.05, 0.0, 0.85, M['bellows'], bevel=0.03))
    out.append(ubox('bellows_s', u0, W + 0.05, u1, W + 0.14, -0.1, 0.18, M['bellows'], bevel=0.03))
    x = u0 + 0.3
    while x < u1 - 0.1:
        out.append(pipe_uv('hoop_n', [(x, -W + 0.02, 0.0), (x, -W + 0.0, 0.0), (x, -W + 0.0, 0.9)], 0.035, M['rib'], corner=0.08))
        out.append(pipe_uv('hoop_s', [(x, W - 0.02, 0.0), (x, W + 0.0, 0.0), (x, W + 0.0, 0.22)], 0.035, M['rib'], corner=0.08))
        for f in (0.15, 0.3): out.append(ubox('fold', x + f - 0.015, -W - 0.06, x + f + 0.015, -W - 0.03, 0.05, 0.82, M['dark'], bevel=0.008))
        x += 0.45
    out.append(ubox('top_rail', u0, -W - 0.16, u1, -W - 0.03, 0.85, 0.93, M['rib'], bevel=0.02))
    for (a, b, hz) in ((-0.32, 0.06, True), (u0 - 0.05, u0 + 0.25, False)):
        out.append(ubox('collar_n', a, -W - 0.22, b, -W - 0.0, -0.1, 1.05, M['steel'], bevel=0.03))
        out.append(ubox('collar_s', a, W + 0.0, b, W + 0.22, -0.15, 0.3, M['steel'], bevel=0.03))
        out.append(ubox('collar_f', a + 0.02, W + 0.21, b - 0.02, W + 0.23, -0.1, 0.25, M['hazard'] if hz else M['dark'], bevel=0.005))

def our_room(M, Mb, out, rng):
    """A slice of our left airlock room (portLock): floor, back wall with lamps, the hull wall with the hatch."""
    u0, v0, u1, v1 = OURROOM
    style = dict(plate_mats=M['ship_floor'], tread_mat=M['ship_tread'], tread=0.1, grille=0.06, missing=0.0, wonky=0.0, lost_rivets=0.02)
    floor_room(OURROOM, Mb, rng, style, out)
    floor_room((0.0, -0.6, 0.6, 0.6), Mb, rng, dict(plate_mats=[M['ship_tread']], tread_mat=M['ship_tread'], tread=0, grille=0), out)
    hull = M['ship_hull']
    out.append(ubox('sh_back', -0.4, -4.95, u1 + 0.3, v0, 0.0, H_FULL, hull, bevel=0.03))
    out.append(ubox('sh_left_n', -0.4, v0, 0.6, -0.6, 0.0, H_FULL, hull, bevel=0.03))
    out.append(ubox('sh_left_s', -0.4, 0.6, 0.6, v1, 0.0, H_LOW, hull, bevel=0.03))
    out.append(ubox('sh_south', -0.4, v1, u1 + 0.3, v1 + 0.7, 0.0, H_LOW, hull, bevel=0.03))
    out.append(ubox('sh_belly', -0.4, v1 + 0.6, u1 + 0.3, v1 + 0.72, -0.5, 0.0, M['ship_panel'], bevel=0.02))
    out.append(ubox('sh_trim', -0.3, v1 + 0.58, u1 + 0.3, v1 + 0.72, H_LOW - 0.08, H_LOW, Mb['hazard_red'], bevel=0.01))
    mb2 = dict(Mb); mb2.update(panel=M['ship_panel'], panel2=M['ship_panel2'], body=M['ship_panel'], lamp=M['ship_lamp'])
    back_wall(u0, u1, v0, mb2, rng, out, lamps='on', skip=[(2.2, 3.6)])
    # suit lockers on the back wall (the growth wraps them)
    for u in (2.5, 3.2):
        out.append(ubox('slock', u - 0.3, v0, u + 0.3, v0 + 0.4, 0.0, 1.35, M['locker'], bevel=0.03))
        for z in (1.0, 1.1, 1.2): out.append(ubox('slvent', u - 0.18, v0 + 0.4, u + 0.18, v0 + 0.415, z, z + 0.03, Mb['black'], bevel=0))
        out.append(ubox('slh', u + 0.17, v0 + 0.4, u + 0.22, v0 + 0.44, 0.55, 0.8, Mb['steel'], bevel=0.008))
    out.append(text('slock_t', 'SUITS', 2.85, v0 + 0.42, 1.27, 0.08, Mb['white'], face=True))
    out.append(ubox('hang', 5.1, v0, 5.9, v0 + 0.02, 0.9, 1.4, worn('poster', '#3a78b8', 0.6, 0.0, wear=0.3), bevel=0.004))
    out.append(text('hang_t', 'HANG IN THERE', 5.5, v0 + 0.025, 0.98, 0.06, Mb['white'], face=True))
    out.append(text('hatch_t', 'PORT AIRLOCK', 1.3, 3.3, FLOOR_Z + 0.004, 0.16, Mb['sticker']))
    # hatch frame
    for sv in (-1, 1): out.append(ubox('hframe', -0.1, sv * 0.6 - 0.08, 0.7, sv * 0.6 + 0.08, 0.0, 0.5 if sv > 0 else 1.25, Mb['hazard'], bevel=0.02))

# ---------------------------------------------------------------------------------------------------
def concept(variant):
    global COLD_R
    COLD_R = {'key': 3.3, 'full': 0.0, 'late': 12.8}[variant]
    running = variant != 'full'
    rng = random.Random(11)
    objs = ships.build('derelict', 'port')              # (mn.reset inside; the dock sprite exactly)
    remove_named(('bench', 'bench_leg', 'scope', 'scope_base'))
    remove_named(('paper',), lambda o: o.location.z > 0.5)
    remove_named(('nest', 'pod'))                      # the intruder's nest is not part of this concept
    Mb = ships.materials('derelict')
    M = culture_mats()
    out = []
    build_tube(out); our_room(M, Mb, out, rng)
    freezer(M, Mb, out, running); junction(M, Mb, out, running); tether_line(M, Mb, out, rng, running)
    claw(M, Mb, out); barricade(M, Mb, out, rng); story(M, Mb, out, rng); cocoon(M, Mb, out, rng)
    bu, bv = BOX                                       # the black box (heater on: that's why the heart wraps it)
    out.append(cbox('bbox', bu, bv, 0.62, 0.42, FLOOR_Z, 0.3, M['bbox'], bevel=0.04))
    out.append(text('bbox_t', 'FLIGHT RECORDER', bu, bv - 0.05, 0.34, 0.06, Mb['ink']))
    out.append(ubox('bbox_heat', bu - 0.22, bv + 0.21, bu + 0.22, bv + 0.225, 0.1, 0.16, M['heater'], bevel=0))
    # the dead core block (dock/derelict_core stand-in) so the heart has something to climb
    cu, cv = SPOT['core']
    out.append(ubox('dcore', cu - 0.9, cv - 1.1, cu + 0.9, cv + 1.1, 0.0, 0.9, Mb['body'], bevel=0.05))
    out.append(ucyl('dcore_ring', 0.6, 0.12, cu, cv, 0.9, Mb['rim'], verts=24, bevel=0.02))
    out.append(ucyl('dcore_lens', 0.45, 0.04, cu, cv, 1.0, Mb['screen_dead'], verts=24, bevel=0.01))
    # --- S-7
    floor_growth(M, out); wall_growth(M, out); lumps(M, out, rng)
    heart(M, out, rng, shrink=0.55 if variant == 'late' else 1.0, frozen=variant == 'late')
    if variant == 'late':                              # the box is free; frost and a few husks round it
        for k in range(8):
            a = rng.uniform(0, math.tau)
            stain(bu + math.cos(a) * 0.5, bv + math.sin(a) * 0.35, 0.35, M['frost'], out, z=FLOOR_Z + 0.004)
        for su in (-1, 1):                             # the grip, frozen and let go: husks lying beside the box
            O_ = [P(bu + su * 0.5, bv + 0.1, 0.05), P(bu + su * 0.9, bv - 0.5, 0.05), P(-23.0, -0.3 + su * 0.3, 0.06), P(-23.5, -0.5 + su * 0.2, 0.1)]
            out.append(O.tube('husk', O_, [0.04, 0.05, 0.06, 0.08], M['frozen'], segs=8))
    else:
        for su in (-1, 1):                             # two tendrils clamped over the box
            tendril('boxgrip', [(HEART[0] + su * 0.25, HEART[1] - 0.1, 0.75), (bu + su * 0.15, bv - 0.1, 0.45), (bu + su * 0.2, bv + 0.25, 0.3), (bu + su * 0.35, bv + 0.5, None)], 0.12, 0.05, M, out, rng)
    tendrils(M, out, rng, variant)
    frost_floor(M, out, rng)
    fu, fv = FIRE                                      # the fire (feeds the growth round it)
    for k in range(5 if variant != 'late' else 0):     # (put out by the time the freezer has done its work)
        h = rng.uniform(0.25, 0.5); du, dv = rng.uniform(-0.15, 0.15), rng.uniform(-0.1, 0.1)
        out.append(mn.sphere('flame', 0.12, loc=P(fu + du, fv + dv, FLOOR_Z + h * 0.5), m=emit_mat('flame', '#ff9a2a', 1.0, base='#ff6a10'), scale=(0.7, 0.7, h / 0.24), segs=12))
    if variant != 'late': add_light('POINT', 'fire', P(fu, fv, 0.6), 35.0, (1.0, 0.55, 0.2), radius=0.3)
    else:
        for k in range(6): stain(fu + rng.uniform(-0.4, 0.4), fv + rng.uniform(-0.3, 0.3), rng.uniform(0.2, 0.4), M['frost2'], out, z=FLOOR_Z + 0.02)
    # lights: the lab is dark (its power is cut); glows, our suit lamps and our own ship's warm light do the work
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN': o.data.energy *= 0.32
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.1
    add_light('AREA', 'ourlight', P(4.6, -0.2, 4.5), 280.0, (1.0, 0.93, 0.82), size=(8.5, 8.0))
    add_light('AREA', 'tubelight', P(-2.6, 0.0, 3.0), 120.0, (0.7, 0.85, 1.0), size=(5.0, 1.5))
    for (u, v) in ((-14.6, -1.5), (-20.5, -1.0), (-8.5, 1.2), (-12.2, 2.6), (-17.0, 2.8)):
        if cold(u, v) < 0.45: add_light('POINT', 'bio', P(u, v, 0.8), 18.0, (0.55, 1.0, 0.75), radius=0.5)
    add_light('SPOT', 'lamp_a', P(-6.6, 0.3, 1.2), 500.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(JUNC[0], JUNC[1], 0.6), spot=0.7, blend=0.4)
    add_light('SPOT', 'lamp_b', P(-14.6, 3.6, 1.2), 260.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(GRAB[0], GRAB[1], 0.0), spot=0.6, blend=0.4)
    if variant == 'late':
        add_light('SPOT', 'lamp_c', P(-20.5, 3.2, 1.3), 900.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(bu, bv, 0.0), spot=0.7, blend=0.4)
        add_light('POINT', 'cold_wide', P(-17.0, 0.0, 2.0), 160.0, (0.6, 0.85, 1.0), radius=1.0)
    # outlines on the chunky things
    out = [o for o in out if o is not None]
    mn.outline([o for o in out if o.type == 'MESH' and o.name.split('.')[0] in
                ('frz', 'frz_door', 'frz_top', 'j1', 'cl_hub', 'cl_prong', 'cl_arm', 'bar_top', 'bar_cab', 'bar_cart', 'bar_seat', 'carb', 'carb_stock',
                 'ph', 'tank_fallen', 'pot', 'bbox', 'slock', 'coc_body', 'coc_helm', 'dcore', 'tcoil', 'tether', 'shoe')], thickness=0.012)
    mn.outline([o for o in out if o.type == 'MESH' and o.name.split('.')[0] in ('heart', 'heart_art', 'tend', 'boxgrip', 'coc_wrap', 'grab', 'grabcoil')], thickness=0.014)
    # one fixed camera window for every variant
    fr = mn.box('frame', (34.9, 10.9, 3.6), loc=(-8.6, 0.2, -0.8), bevel=0)
    fr.hide_render = True
    try:
        mn.render(f'culture_{variant}', objs=[fr], passes=('beauty',))
    except Exception as e:
        print('[concept] GPU render failed, CPU fallback:', e)
        bpy.context.scene.cycles.device = 'CPU'
        mn.render(f'culture_{variant}', objs=[fr], passes=('beauty',))
    e = dict(_entry); e['ppu'] = mn.PPU
    with open(os.path.join(OUT, f'culture_{variant}.json'), 'w') as f: json.dump(e, f)
    # the coil overlay: only the front half of the grab coil, everything else held out
    if variant in ('key', 'full'):
        keep = set(o.name for o in COIL_FRONT)
        for o in bpy.context.scene.objects:
            if o.type == 'MESH' and o.name not in keep and o is not fr: o.is_holdout = True
        mn.render(f'culture_{variant}_coil', objs=[fr], passes=('beauty',))

COIL_FRONT = []
def tendrils(M, out, rng, variant):
    global COIL_FRONT
    COIL_FRONT = []
    late = variant == 'late'
    # the creeper: heart -> core door -> lab -> airlock -> tube -> our airlock room (towards our warm capacitor)
    main = [(-21.6, 0.5), (-20.4, 0.1), (-19.0, 0.2), (-17.6, -0.25), (-15.6, 0.0), (-13.4, -0.35), (-11.6, 0.0), (-10.4, 0.25),
            (-8.6, -0.25), (-6.9, 0.15), (-5.6, -0.1), (-3.6, -0.18), (-1.5, -0.12), (0.4, -0.1)]
    if variant == 'full':
        tip = [(1.6, 0.4), (2.8, 1.25), (3.9, 2.05), (5.0, 2.7), (5.7, 2.95)]
    else:
        tip = [(1.6, 0.4), (2.7, 1.2), (3.5, 1.75)]           # held back by our defender
    tendril('tend', main + tip, 0.16, 0.05, M, out, rng, wiggle=0.12)
    tendril('tend', [(-3.6, -0.15), (-1.0, -0.4), (0.6, -0.5), (1.6, -1.4), (2.3, -2.6), (2.5, -3.5, 0.5), (2.6, -3.75, 1.0), (2.9, -3.7, 1.25)], 0.1, 0.04, M, out, rng)
    for k, z in enumerate((0.35, 0.75)):                       # wrapped round the suit lockers
        pts = [(2.15 + 1.4 * i / 10, -3.7 + 0.42 + 0.05 * math.sin(i), z + 0.08 * math.sin(i * 1.3)) for i in range(11)]
        tendril('tend', pts, 0.06, 0.05, M, out, rng, nodules=False)
    tendril('tend', [(-1.5, -0.12), (0.2, 0.35), (1.0, 1.6), (1.4, 2.9)], 0.08, 0.03, M, out, rng)
    # doorways: thick ones lying across
    tendril('tend', [(-10.7, -1.9), (-10.5, -0.6), (-10.35, 0.5), (-10.6, 1.9)], 0.14, 0.07, M, out, rng)
    tendril('tend', [(-18.9, -1.7), (-18.6, -0.4), (-18.8, 0.7), (-18.5, 2.0)], 0.15, 0.08, M, out, rng)
    # climbing over the dead core block
    cu, cv = SPOT['core']
    tendril('tend', [(HEART[0] - 0.6, HEART[1] - 0.3, 0.6), (cu + 0.6, cv - 0.2, 1.0), (cu, cv - 0.6, 1.02), (cu - 0.7, cv - 0.9, 0.95), (cu - 1.1, cv - 1.4)], 0.12, 0.05, M, out, rng)
    tendril('tend', [(HEART[0] - 0.7, HEART[1] + 0.2, 0.5), (cu + 0.5, cv + 0.6, 0.98), (cu - 0.3, cv + 0.7, 1.0), (cu - 1.0, cv + 1.3)], 0.1, 0.04, M, out, rng)
    # heart roots across the core
    for a in (0.3, 1.2, 2.3, 3.0, 3.8, 4.6, 5.4):
        L = rng.uniform(1.6, 3.0); pts = [HEART]
        for s in range(1, 5):
            pts.append((HEART[0] + math.cos(a + 0.25 * math.sin(s)) * L * s / 4 * 1.3, HEART[1] + math.sin(a + 0.25 * math.sin(s)) * L * s / 4 * 0.9))
        pts = [(u, max(-2.6, min(2.6, v))) for u, v in pts]
        pts = [(max(-24.8, u), v) for u, v in pts]
        tendril('tend', pts, 0.14 if not late else 0.08, 0.04, M, out, rng)
    # the lab: from the core door to the fire, round it; the burst freezer's outpour; strays
    tendril('tend', [(-18.6, 0.6), (-17.4, 1.1), (-16.0, 1.3), (-15.1, 1.05), (-14.4, 0.95), (-14.0, 1.4), (-14.3, 1.9), (-15.0, 1.95)], 0.13, 0.06, M, out, rng)
    tendril('tend', [(FREEZER[0] - 0.4, FREEZER[1] + 0.3, 0.7), (-12.9, -2.9, 0.3), (-12.6, -2.2), (-12.0, -1.2), (-11.3, -0.6), (-11.0, 0.8), (-11.6, 2.0)], 0.13, 0.05, M, out, rng)
    tendril('tend', [(FREEZER[0] - 0.2, FREEZER[1] + 0.3, 0.5), (-13.6, -2.6), (-14.4, -2.2), (-15.2, -1.2), (-15.5, -0.2)], 0.11, 0.05, M, out, rng)
    tendril('tend', [(FREEZER[0] + 0.1, FREEZER[1] + 0.35, 0.4), (-12.0, -2.6), (-11.3, -2.6), (-11.0, -3.3)], 0.08, 0.04, M, out, rng)
    tendril('tend', [(-15.0, -3.2), (-14.7, -2.4), (-13.9, -1.6), (-12.9, -1.4)], 0.09, 0.04, M, out, rng)
    tendril('tend', [(-17.8, 3.2), (-16.2, 3.4), (-14.8, 3.1), (-13.4, 3.5), (-12.2, 3.2)], 0.1, 0.04, M, out, rng)
    tendril('tend', [(-9.6, -1.8), (-8.4, -1.2), (-7.6, -1.9), (-6.4, -1.6)], 0.08, 0.03, M, out, rng)
    tendril('tend', [(-9.9, 1.9), (-8.6, 1.4), (-7.2, 1.9), (-6.2, 1.5)], 0.08, 0.03, M, out, rng)
    # the grab: a tendril from the fire patch, rising and coiled round a crew member at GRAB
    if not late:
        gu, gv = GRAB
        tendril('grab', [(-15.0, 1.95), (-15.5, 2.4, 0.2), (-15.95, 2.55, 0.35), (gu + 0.3, gv + 0.32, 0.3)], 0.13, 0.08, M, out, rng, nodules=False, cut=False)
        for k, (z, tilt, r) in enumerate(((0.22, 0.05, 0.3), (0.45, -0.06, 0.32), (0.68, 0.06, 0.3))):
            for half in ('back', 'front'):
                a0, a1 = (math.pi, math.tau) if half == 'back' else (0.0, math.pi)
                pts = [(gu + math.cos(a) * r, gv + math.sin(a) * r * 0.8, z + tilt * math.cos(a) + 0.04 * k) for a in [a0 + (a1 - a0) * i / 12 for i in range(13)]]
                tag = COIL_FRONT if half == 'front' else None
                tendril('grabcoil', pts, 0.075, 0.075, M, out, rng, wiggle=0.0, nodules=half == 'front', cut=False, tag=tag)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    mn.SAMPLES = SAMPLES
    for v in VARIANTS: concept(v)
