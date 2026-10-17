"""The final boss of chapter 8: the INFESTED LEVIATHAN, as game sprites (look: the approved concept
models/concepts/leviathan_boss.py). ~130 units long (our ship 44 x 29), so it is a CHAIN of pieces that the
game places along its swim path and turns on screen (GFX.sprite rot).

How the pieces turn (the asteroids' trick, models/enemy/asteroids.py): every piece is modelled lying in the
plane that faces the camera (the flat build, back = +Z, tilted 40 deg about X), so turning the sprite on screen
IS turning the creature about the view axis: exact at any angle, no direction steps. For that the beauty pass
is lit only by light a turn about the view axis leaves unchanged (view_light: a sun along the view, no
specular, plus a teal world); the directional light comes from the game's runtime lighting on the normal map
(GFX turns normals and heights with rot). The creature swims "in the screen plane": all lengths below are
SCREEN units (1 unit = 1 game unit across the screen); place joints by screen distance (see CHAIN).

Every body piece is drawn at SCALE 1; at rot 0 the head is towards +x (screen right), the creature's LEFT side is
screen up. d = distance behind the nose along the spine (screen units). The whole creature is modelled once (the
approved concept's whale profile, hw(d): a blunt rounded snout, widest 11.4 at d ~28, a long taper to a slender stock)
and each piece is a window of it, so hide, lumps, spots and barnacles carry on across the joints:

  JOINTS (d)  J0 26 (neck) | J1 41 | J2 55 | J3 69 | J4 82 | J5 95 | J6 107 | the fluke's root 128
  organic/levb_head            f0..f3 breathing loop (gills flare and glow, blowholes open). Origin = J0, nose at x = +26.
                               A 3-unit feathered overhang behind J0 (x -3..0) lies over segment 0. Eye sockets left for
                               the eye sprites. Manifest: pec (left pectoral root at head-local (pec[0], -pec[1])).
  organic/levb_eye_closed|open|hit  f0 = the LEFT eye (screen up at rot 0), f1 = the RIGHT eye. Same origin and rot as the
                               head: draw over the head. hit = squeezed shut (flinch).
  organic/levb_seg_0 .. _5     the body segments J_k -> J_k+1 (15, 14, 14, 13, 13, 12 long). Origin = the front joint J_k;
                               rear joint at x = -length. Rear: a 3-unit feathered overhang over the next piece. Front: a
                               round cap (radius = the half-width at J_k) ahead of the joint, drawn UNDER the piece in front:
                               it fills the outer side of a bent joint like a ball joint (any bend up to ~35 deg holds).
  organic/levb_seg_tail        the tail stock J6 -> 128 (21 long), the same front cap, a rounded stump at x = -21.
  organic/levb_fluke           f0..f3 stroke loop (up, level, down, level), origin = its root = the tail's end (tail-local
                               x = -21); a big crescent (~29 across) spreading to -x.
  organic/levb_fin_pec         f0..f3 paddle loop: the LEFT pectoral fin, origin = its root, at head-local (7, -8.65) (x forward,
                               y down = left). The right fin: the same sprite with flip: true and rot + PI at (7, +8.65).
  organic/levb_fin_dorsal_ok|hit1|hit2   the tall dorsal sail (d 29..44), flopped over to the creature's LEFT, origin = the
                               front end of its base on the spine = segment 0's local (-3, 0); it runs back to x = -15. To flop
                               it to the right: flip: true and rot + PI. hit1/hit2: one / two scorched holes.
  organic/levb_zone            f0..f3 squirm loop: an infested zone (a glowing boil, leeches latched on, glowing
  organic/levb_zone_glow       f0..f3 the same, glowing hot (targeted, phase 3)     veins). Origin = its centre,
  organic/levb_zone_hit1       half blasted (2 leeches left, charred half, embers)  ~3 across (+ veins to ~7).
  organic/levb_scar            blasted clean: charred crater, raw pink rim, dead veins.  All 4 share one canvas.
  organic/levb_nest, levb_nest_burnt  the big nest on its back (~8 across), and burnt off. Same canvas.
       (zones, scar, nest: overlays on the back; draw after the body pieces, turned with the piece they sit on,
        at its scale, within |y| < 0.6 x the local half-width; they're nearly round, so any rot works.)
  organic/levb_brood           a leech larva crawler (~0.55 long), 8 directions x 4-frame crawl; normal light rig
                               (it crawls on our deck); dir i faces game angle i * 45 (0 = right). Origin = its
                               middle on the floor.
  organic/levb_brood_dead      belly up, curled, 8 directions (same canvas as levb_brood).
  organic/levb_gas_a|b|c       toxic gas puffs (~4-6 across), translucent; origin = centre. Draw unlit (any rot).
  systems/engine_vent_closed|open    a floor grate in the reactor room (1.0 x 0.7), origin = its centre.
  systems/engine_override_off|ready|active   the manual override panel (footprint 0.9 x 0.6), origin = centre.
  fx/engine_blast              f0..f5 burst of the main engine (ignite, swell, full, full, fading, dying).
                               origin = the engine bell's: game (22.2, 26.1); blasts down the screen (+y).
                               Unlit, alpha = brightness (like hull/engine_flame_*).

CHAIN (drawing order: pectorals and fluke first, then tail -> segments 5..0 -> head, then overlays, then the eyes):
  J0 = head origin; segment k at J_k with its rot; J_k+1 = J_k - length_k * (cos rot_k, sin rot_k); tail at J6, fluke at the
  tail's end. js/leviathan.js levChain lays it out from the head back, each joint bent at most LEVB_BEND (14 deg at the neck,
  22..35 deg further back): ~140 units nose to fluke tips.

    blender -b --factory-startup --python tools/blender/models/organic/leviathan_boss.py -- [quick] [preview] [piece ...]
pieces: body (head, eyes, segments, tail) fluke fin_pec fin_dorsal zone nest brood gas vent override blast (default all);
  look: a preview only (the front 58 units in one window, to judge the hide's look)
preview: renders at 24 px/unit (ppu=N) into $MN_PREVIEW (not build/renders, its own manifest).
"""
import sys, os, math, random, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
import mn
import orglib as O
import leviathan as LV
import leech as LE

ARGS = O.ARGS
QUICK = 'quick' in ARGS
PREVIEW = 'preview' in ARGS
mn.SAMPLES = 16 if QUICK else 40
if PREVIEW:
    mn.PPU = int(next((a.split('=')[1] for a in ARGS if a.startswith('ppu=')), 24))
    mn.OUT_DIR = os.environ.get('MN_PREVIEW', '/tmp/mn_levb_preview'); mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')
SEL = [a for a in ARGS if a not in ('quick', 'preview', 'cpu') and '=' not in a]

Z = Vector((0, 0, 1))
E = math.radians(mn.ELEVATION)
TILT = math.radians(90 - mn.ELEVATION)          # flat build -> facing the camera (rotation about X)

# --- the creature (screen units; every piece is drawn at scale 1) ---
# d = distance behind the nose along the spine. Everything is built in ONE frame, "creature coordinates": x = -d (nose at
# x = 0, head towards +x), back = +Z, the creature's left = +Y. Each piece renders a window of it with its own origin (its
# front joint), so the hide's lumps, mottling, spots and barnacles carry on exactly across the joints.
BODY_L = 128.0                                          # nose to the fluke's root
JOINTS = [26.0, 41.0, 55.0, 69.0, 82.0, 95.0, 107.0]    # J0 = the neck, J1..J6; the tail stock runs J6 -> BODY_L
HEAD_L = JOINTS[0]
SEG_L = [b - a for a, b in zip(JOINTS, JOINTS[1:])]     # [15, 14, 14, 13, 13, 12]
TAIL_L = BODY_L - JOINTS[-1]                            # 21
OVER = 3.0                                              # the feathered rear overhang (lies on top of the next piece)
STEP = 0.25                                             # the shared ring grid (all joints are multiples of it)
PEC_D = 19.0                                            # the pectoral fins' roots (d), at 0.78 x the half-width
DORSAL_D0, DORSAL_L = 29.0, 15.0                        # the dorsal sail's base: d 29 .. 44 (on segment 0)
HH = 0.6                                                # back height / half-width
# The half-width (the approved concept's profile, models/concepts/leviathan_boss.py, on a 128-unit body): a blunt rounded
# snout, the bulk right behind the head (widest, 11.4, ~28 behind the nose), then a long taper to a slender tail stock.
NOSE_D, NOSE_W = 8.0, 9.6
PROF = [(NOSE_D, NOSE_W), (15.4, 10.8), (28.2, 11.4), (46.0, 10.8), (64.0, 9.2), (82.0, 6.6), (100.0, 4.0), (115.0, 2.3),
        (124.0, 1.45), (BODY_L, 1.1)]
STUMP = 1.1                                             # the tail stock ends in a rounded stump (the fluke's root under it)

def _slopes(P):                                         # monotone cubic (Fritsch-Carlson): no overshoot between the knots
    xs, ys = [p[0] for p in P], [p[1] for p in P]; n = len(P)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]; dl = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n; m[-1] = dl[-1]                       # (m[0] = 0: joins the snout's curve smoothly)
    for i in range(1, n - 1):
        if dl[i - 1] * dl[i] <= 0: continue
        w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
        m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    return m
_M = _slopes(PROF)

def hw(d):
    """Half-width of the hide d behind the nose."""
    if d <= 0: return 0.0
    if d < NOSE_D: return NOSE_W * math.sqrt(max(0.0, 1 - (1 - d / NOSE_D) ** 2.2))      # the blunt, rounded snout
    if d > BODY_L:
        c = (d - BODY_L) / STUMP
        return PROF[-1][1] * math.sqrt(max(0.0, 1 - c * c))
    for i in range(len(PROF) - 1):
        x0, y0 = PROF[i]; x1, y1 = PROF[i + 1]
        if d <= x1:
            hh_ = x1 - x0; t = (d - x0) / hh_
            return ((2 * t ** 3 - 3 * t * t + 1) * y0 + (t ** 3 - 2 * t * t + t) * hh_ * _M[i]
                    + (-2 * t ** 3 + 3 * t * t) * y1 + (t ** 3 - t * t) * hh_ * _M[i + 1])
    return PROF[-1][1]

def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)

# ---------------------------------------------------------------------------------------------------
# scene, light, materials
# ---------------------------------------------------------------------------------------------------
def setup(view=True):
    s = mn.reset(); s.cycles.device = 'CPU'          # (no usable GPU here)
    if view: view_light()
    return s

def view_light():
    """Light that a turn about the view axis leaves unchanged (as models/enemy/asteroids.py): a soft sun along the view
    (its sheen sits where the hide faces the camera: the middle of the back, at any rot), and a deep-sea world bright
    enough to give real occlusion (creases, round barnacles, under fins)."""
    for o in [o for o in bpy.context.scene.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o, do_unlink=True)
    d = bpy.data.lights.new('view', 'SUN'); d.energy = VIEW_SUN; d.color = (1.0, 0.98, 0.94); d.angle = math.radians(24); d.specular_factor = VIEW_SPEC
    o = bpy.data.objects.new('view', d); o.rotation_euler = (math.radians(90 - mn.ELEVATION), 0, 0)
    bpy.context.scene.collection.objects.link(o)
    w = bpy.context.scene.world.node_tree.nodes['Background']
    w.inputs[0].default_value = (0.2, 0.3, 0.3, 1); w.inputs[1].default_value = WORLD_K
VIEW_SUN, VIEW_SPEC, WORLD_K = 2.2, 0.22, 0.9

def shade(m, facing=0.65, power=1.4, band=0.0, band_w=0.06):
    """Rotation-invariant volume on top of a material's base colour: darker towards the silhouette (facing ratio), and
    optionally a darker band down the spine (object-space normal straight up)."""
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new; b = N['Principled BSDF']
    src = b.inputs['Base Color'].links[0].from_socket
    def mth(op, a, bb=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, bb)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: Lk(v, n.inputs[i])
        return n.outputs[0]
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    k = mth('SUBTRACT', 1.0, mth('MULTIPLY', mth('POWER', lw.outputs['Facing'], power), facing), clamp=True)
    if band:
        tc = N.new('ShaderNodeTexCoord'); sz = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Normal'], sz.inputs[0])
        bd = N.new('ShaderNodeMapRange'); bd.inputs['From Min'].default_value = 1 - band_w * 2; bd.inputs['From Max'].default_value = 1 - band_w * 0.3
        bd.inputs['To Max'].default_value = band; Lk(sz.outputs['Z'], bd.inputs['Value'])
        k = mth('MULTIPLY', k, mth('SUBTRACT', 1.0, bd.outputs[0]))
    mx = N.new('ShaderNodeVectorMath'); mx.operation = 'SCALE'; Lk(src, mx.inputs[0]); Lk(k, mx.inputs['Scale'])
    Lk(mx.outputs[0], b.inputs['Base Color'])
    return m

SKIN = ('#04161a', '#256a6a', '#3f9696', '#a2c6c0')     # dark, light (mottling), veins, speckles: deep teal leaning green (the game's light is cold)

def mats():
    M = dict(
        skin=shade(O.flesh('lb_skin', SKIN[0], SKIN[1], c2='#030807', veins=SKIN[2], vein_k=0.35, scale=0.16, rough=0.48, coat=0.25,
                           sss=0.05, bump=0.8, mottle=2.2, speckle=(SKIN[3], 9.0, 0.16, 0.55)), facing=0.72, band=0.3),
        fin=shade(O.flesh('lb_fin', SKIN[0], SKIN[1], c2='#030807', veins=SKIN[2], vein_k=0.45, scale=0.3, rough=0.55, coat=0.15, mottle=1.8,
                          speckle=(SKIN[3], 1.6, 0.12, 0.45)), facing=0.75, power=1.2),
        ray=shade(O.flesh('lb_ray', '#2a6a7c', '#4a90a0', c2='#030807', scale=0.8, rough=0.35, coat=0.7, mottle=0.8), facing=0.6),
        spot=O.emit_mat('lb_spot', '#b4dcdc', 0.22, base='#94b8bc', rough=0.55, coat=0.1),
        gill=O.emit_mat('lb_gill', '#7af0ff', 1.2, base='#3ac0d8', coat=1.0),
        barn=O.flesh('lb_barn', '#a4aea6', '#dfe2d6', c2='#4a5048', scale=2, rough=0.6, coat=0.2, bump=1.0),
        barn_in=O.plain('lb_barn_in', '#1a1e1a', 0.8),
        scar=O.plain('lb_scar', '#8aa0ae', 0.5, coat=0.3),
        lip=O.plain('lb_lip', '#071018', 0.5, coat=0.4),
        socket=O.plain('lb_socket', '#05080c', 0.6),
        glint=O.emit_mat('lb_glint', '#fff8d0', 1.2),
        lid=shade(O.flesh('lb_lid', SKIN[0], SKIN[1], c2='#030807', scale=0.5, rough=0.45, coat=0.25, mottle=1.4), facing=0.6),
        lid_hit=O.flesh('lb_lid_hit', '#3a1a28', '#7a4050', c2='#14060a', veins='#ff6a6a', vein_k=0.5, scale=0.8, coat=0.8),
        rim=O.flesh('lb_rim', '#4a1424', '#a8444a', c2='#1a0408', veins='#f0ff50', vein_k=0.75, scale=1.2, rough=0.3, coat=0.9,
                    sss=0.3, sss_col=(1.0, 0.4, 0.3), bump=0.8, mottle=1.3),
        pus=O.emit_mat('lb_pus', '#b8f020', 1.1, base='#a0d020', coat=1.0),
        pus_hot=O.emit_mat('lb_pus_hot', '#e8ff60', 1.6, base='#d0f040', coat=1.0),
        pustule=O.emit_mat('lb_pustule', '#ffc818', 0.9, base='#f0d040', rough=0.1, coat=1.0),
        pustule_hot=O.emit_mat('lb_pustule_hot', '#ffe060', 1.5, base='#fff080', rough=0.1, coat=1.0),
        vein=O.emit_mat('lb_vein', '#c8f03a', 1.1, base='#6a7a10'),
        vein_hot=O.emit_mat('lb_vein_hot', '#e8ff70', 1.6, base='#b0d030'),
        char=O.flesh('lb_char', '#0a0806', '#2a1c14', c2='#000000', scale=1.5, rough=0.9, coat=0.0, bump=1.2, mottle=1.5),
        ember=O.emit_mat('lb_ember', '#ff6a1a', 1.3, base='#4a1a08'),
        raw=O.flesh('lb_raw', '#8a3a4a', '#d87a8a', c2='#3a1018', scale=1.2, rough=0.3, coat=0.9, sss=0.4, sss_col=(1, 0.3, 0.3)),
        dead_vein=O.plain('lb_dvein', '#1a1610', 0.8),
        egg=O.glossy_glow('lb_egg', '#d8e0a0', '#c8ff50', 0.7, veins='#3a4a10', vein_scale=5.0),
        web=O.plain('lb_web', '#c8c8a0', 0.4, coat=0.6, sss=0.3),
        grub=O.flesh('lb_grub', '#8a9a5a', '#d8e0a0', c2='#3a4020', veins='#e8ff6a', vein_k=0.3, scale=6, rough=0.25, coat=0.9,
                     sss=0.5, sss_col=(0.8, 1.0, 0.4), bump=0.4, belly='#f0f0c0', belly_axis=(0, 0, -1), belly_k=0.6),
        grub_dead=O.flesh('lb_grub_dead', '#5a5a42', '#9a9a78', c2='#2a2a1a', scale=6, rough=0.5, coat=0.4, bump=0.4),
        grub_leg=O.plain('lb_grub_leg', '#4a3a2a', 0.4, coat=0.5),
        bulb_dead=O.plain('lb_bulb_dead', '#4a4a30', 0.6),
    )
    M['eyeball'] = LV.eye_mat(1)
    M.update({'leech_' + k: v for k, v in LE.mats().items()})
    return M

def LM(M): return {k[6:]: v for k, v in M.items() if k.startswith('leech_')}

def tilt_all(objs):
    """Parent everything under one empty turned TILT about X: the flat build (back = +Z) faces the camera."""
    e = mn.link(bpy.data.objects.new('tilt', None)); e.rotation_euler = (TILT, 0, 0)
    for o in objs:
        if o.parent is None: o.parent = e
    bpy.context.view_layer.update()
    return e

# ---------------------------------------------------------------------------------------------------
# the body: a lofted tube along X (head towards +X), back = +Z, left side = +Y
# ---------------------------------------------------------------------------------------------------
def loft_d(name, d0, d1, cap=False, nr=64, m=None, shift=0.0):
    """The creature's hide from d0 to d1, in creature coordinates (x = -d + shift). Rings on the shared grid (multiples of
    STEP), and the noise is the creature's (object coordinates): overlapping pieces are the same hide.
    cap: a round front end of radius hw(d0) ahead of d0 (a ball joint: it fills the outer side of a bend, hidden under the
    piece in front otherwise) instead of the hide ahead."""
    ds = []
    if cap:
        w0 = hw(d0)
        for i in range(1, 24):
            ph = math.pi / 2 * (1 - i / 24); ds.append((d0 - w0 * math.sin(ph), w0 * math.cos(ph)))
    elif d0 <= 0:
        ds += [(0.0, 0.0)] + [(x, hw(x)) for x in (0.005, 0.02, 0.05, 0.1, 0.17)]
    k = math.ceil(max(d0, 0.25 if d0 <= 0 else d0) / STEP - 1e-9)
    while k * STEP <= d1 + 1e-9:
        ds.append((k * STEP, hw(k * STEP))); k += 1
    if d1 > BODY_L:                                     # the stump: finer rings round its end
        ds = [p for p in ds if p[0] <= BODY_L]
        for i in range(1, 13):
            dd = BODY_L + STUMP * math.sin(math.pi / 2 * i / 12); ds.append((dd, hw(dd)))
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for d, w in ds:
        w = max(w, 0.02); h = w * HH; dp = 0.5 * w; row = []
        for i in range(nr):
            th = i / nr * math.tau; cs, sn = math.cos(th), math.sin(th)
            y = w * math.copysign(abs(cs) ** 0.9, cs)
            z = h * abs(sn) ** 0.85 if sn >= 0 else -dp * abs(sn) ** 0.9
            if sn > 0: z += 0.05 * w * math.exp(-((th - math.pi / 2) / 0.16) ** 2)       # a low dorsal ridge
            row.append(bm.verts.new((-d + shift, y, z)))
        rings.append(row)
    for j in range(len(rings) - 1):
        for i in range(nr):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % nr], rings[j + 1][(i + 1) % nr], rings[j + 1][i]))
    for row, (d, _) in ((rings[0], ds[0]), (rings[-1], ds[-1])):
        c = bm.verts.new((-d + shift, 0, 0))
        for i in range(nr): bm.faces.new((row[i], row[(i + 1) % nr], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.smooth(o)
    o = O.subdiv(o, 1)
    O.noise_displace(o, [(0.45, 0.09, 11), (0.1, 0.7, 12)])
    if m: mn.assign(o, m)
    return o

def surf(body, x, y, lift=0.0):
    """Point and normal on the body's top surface above (x, y) (flat frame, body's own coordinates)."""
    hit, loc, n, _ = body.ray_cast(Vector((x, y, 30)), Vector((0, 0, -1)))
    if not hit: return None, None
    if n.z < 0: n = -n
    return loc + n * lift, n

def frame_at(n, T=Vector((1, 0, 0))):
    t = (T - n * n.dot(T)).normalized(); b = n.cross(t)
    return Matrix((t, b, n)).transposed()

def spots(M, body, d0, d1, seed, avoid=()):
    """Photophores: rows of small pale lights either side of the spine (two per side), a few bigger ones in pairs and
    threes, and a dashed lateral line along each flank."""
    rnd = random.Random(seed); objs = []
    def free(x, y): return not any((Vector((x, y)) - Vector(a[:2])).length < a[2] for a in avoid)
    def put(x, y, rr, sx=1.0):
        loc, n = surf(body, x, y)
        if loc is None: return
        s_ = mn.sphere('lb_spot', rr, loc=loc - n * 0.03, m=M['spot'], scale=(sx, 1, 0.25), segs=12)
        s_.rotation_mode = 'QUATERNION'; s_.rotation_quaternion = n.to_track_quat('Z', 'Y'); objs.append(s_)
    for row, k in ((0.24, 0.8), (0.46, 1.0)):              # the rows
        for sd in (1, -1):
            d = d0 + rnd.uniform(0, 1.0)
            while d < d1:
                w = hw(d); x, y = -d, sd * w * (row + rnd.uniform(-0.03, 0.03))
                if rnd.random() > 0.15 and free(x, y): put(x, y, rnd.uniform(0.11, 0.2) * k * (0.6 + 0.4 * w / 11.4))
                d += rnd.uniform(0.9, 1.5) * (0.6 + 0.4 * w / 11.4)
    d = d0 + rnd.uniform(1, 3)                            # bigger ones, in little groups
    while d < d1:
        w = hw(d)
        for sd in (1, -1):
            if rnd.random() < 0.45: continue
            x, y = -d, sd * w * rnd.uniform(0.1, 0.75)
            if not free(x, y): continue
            for g in range(rnd.choice((1, 2, 2, 3))):
                put(x + rnd.uniform(-0.8, 0.8), y + rnd.uniform(-0.6, 0.6), rnd.uniform(0.25, 0.55) * (0.6 + 0.4 * w / 11.4))
        d += rnd.uniform(1.4, 2.6)
    d = d0 + 1.0                                          # the lateral line: short pale dashes along each flank
    while d < d1:
        w = hw(d)
        for sd in (1, -1):
            x, y = -d, sd * w * 0.86
            if rnd.random() < 0.35 or not free(x, y): continue
            put(x, y, 0.13 * (0.5 + 0.5 * w / 11.4), sx=2.4)
        d += rnd.uniform(1.2, 2.0)
    return objs

def barnacles(M, body, d0, d1, seed, n=6, scars=3, avoid=()):
    """Clusters of small barnacles (each ~0.1-0.25 across, clusters ~0.5-1.5) crusting the back and upper flanks;
    pale scars."""
    rnd = random.Random(seed); objs = []
    for c in range(n):
        cd = rnd.uniform(d0, d1); w = hw(cd)
        cy = rnd.choice((1, -1)) * w * min(0.85, abs(rnd.gauss(0, 0.42)))
        if any((Vector((-cd, cy)) - Vector(a[:2])).length < a[2] for a in avoid): continue
        k_ = 0.6 + 0.4 * w / 11.4; spread = rnd.uniform(0.3, 0.8) * k_
        for k in range(rnd.randint(4, 16)):
            loc, nn = surf(body, -cd + rnd.gauss(0, spread), cy + rnd.gauss(0, spread * 0.8))
            if loc is None: continue
            r = rnd.uniform(0.1, 0.27) * k_ * (1.35 if rnd.random() < 0.15 else 1.0)
            cone = mn.cyl('lb_barn', r, r * 0.9, loc=(0, 0, 0), m=M['barn'], verts=8, bevel=0.0)
            for v in cone.data.vertices:
                if v.co.z > 0.01: v.co.x *= 0.45; v.co.y *= 0.45
            cone.matrix_world = Matrix.Translation(loc - nn * 0.05) @ nn.to_track_quat('Z', 'Y').to_matrix().to_4x4(); O.apply_tf(cone)
            objs.append(cone)
            objs.append(mn.sphere('lb_barnin', r * 0.4, loc=loc + nn * r * 0.82, m=M['barn_in'], scale=(1, 1, 0.3), segs=6))
    for c in range(scars):
        cd = rnd.uniform(d0 + 2, d1 - 2); cy = rnd.uniform(-0.65, 0.65) * hw(cd); a = rnd.uniform(-0.7, 0.7) + (math.pi / 2 if rnd.random() < 0.35 else 0)
        L_ = rnd.uniform(1.2, 3.2); pts = []
        for t in range(10):
            loc, nn = surf(body, -cd + t / 9 * L_ * math.cos(a), cy + t / 9 * L_ * math.sin(a))
            if loc is not None: pts.append(loc - nn * 0.03)
        if len(pts) > 4: objs.append(O.tube('lb_scar', pts, [0.05 + 0.03 * math.sin(math.pi * i / (len(pts) - 1)) for i in range(len(pts))], m=M['scar'], res=2, segs=6))
    return objs

def barn_outline(objs, t=0.02):
    mn.outline([o for o in objs if o.name.startswith('lb_barn') and not o.name.startswith('lb_barnin')], t)

# ---------------------------------------------------------------------------------------------------
# rendering helpers (PIL isn't in Blender's python: post-processing runs in the system python3)
# ---------------------------------------------------------------------------------------------------
POST = r'''
import sys, json
from PIL import Image
import numpy as np
a = json.loads(sys.argv[1])
for p in a['paths']:
    im = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)
    if a['op'] == 'feather':
        xs = (np.arange(im.shape[1]) + 0.5 - a['ox']) / a['ppu']
        f = np.ones_like(xs)
        if a['lo'] is not None: f = np.where(xs < a['c0'], np.clip((xs - a['lo']) / (a['c0'] - a['lo']), 0, 1), f)
        if a['hi'] is not None: f = np.where(xs > a['c1'], np.clip((a['hi'] - xs) / (a['hi'] - a['c1']), 0, 1), f)
        f = f * f * (3 - 2 * f)
        im[..., 3] *= f[None, :]
    elif a['op'] == 'glowify':                     # rendered on black -> alpha = brightness, colour = rgb / alpha
        rgb = im[..., :3]; al = rgb.max(axis=2)
        al = np.clip((al - 3.0) * 255.0 / 252.0, 0, 255)
        col = np.where(al[..., None] > 0, np.clip(rgb * 255.0 / np.maximum(rgb.max(axis=2), 1)[..., None], 0, 255), 0)
        im = np.dstack([col, al])
    elif a['op'] == 'tone':                        # the hide's beauty for the game's cold light: gain, a soft knee on the
        rgb = im[..., :3] / 255 * a['gain']        # sheen, more saturation, the highlights tinted back towards the teal
        W = np.array([0.2126, 0.7152, 0.0722], np.float32)
        lum = (rgb * W).sum(-1, keepdims=True)
        tl = np.where(lum > a['knee'], a['knee'] + (lum - a['knee']) * a['slope'], lum)
        rgb = rgb * (tl / np.maximum(lum, 1e-4))
        l2 = (rgb * W).sum(-1, keepdims=True); rgb = l2 + (rgb - l2) * a['sat']
        teal = np.array([0.42, 1.0, 1.0]); teal = teal / (teal * W).sum()
        t = np.clip((l2 - a['knee'] * 0.8) / 0.18, 0, 1) * 0.55
        rgb = rgb * (1 - t) + (l2 * teal) * t
        im[..., :3] = np.clip(rgb, 0, 1) * 255
    elif a['op'] == 'alpha':
        im[..., 3] *= a['k']
    Image.fromarray(im.round().clip(0, 255).astype(np.uint8), 'RGBA').save(p)
'''

def post(op, name, **kw):
    import subprocess
    with open(mn.MANIFEST) as f: e = json.load(f)[name]
    paths = [os.path.join(mn.OUT_DIR, fl + '.png') for fl in e['files']]
    subprocess.run(['python3', '-I', '-c', POST, json.dumps(dict(op=op, paths=paths, ox=e['ox'], ppu=mn.PPU, **kw))], check=True)

TONE = dict(gain=0.9, knee=0.34, slope=0.4, sat=1.15)

def tone(name):
    """The hide / fins' beauty, toned for the game's cold light (see POST 'tone'). Not the eyes."""
    post('tone', name, **TONE)

def feather(name, x_core0, x_core1, x_lo, x_hi):
    """Fade the beauty alpha to 0 over the overhangs: from the joint (x_core0 / x_core1) to x_lo / x_hi."""
    post('feather', name, c0=x_core0, c1=x_core1, lo=x_lo, hi=x_hi)

def window(name, x0, x1, y0, y1, frames=None, extra=None, passes=('beauty', 'normal', 'height'), origin=(0, 0, 0)):
    """An exact window in flat-frame units (= screen units after the tilt: x right, y up)."""
    return O.render_window(name, x0, x1, y0, y1, frames=frames, extra=extra, passes=passes, origin=origin)

def frames_hide(sets, frames):
    """sets[i] shown only on scene frame frames[i]."""
    s = bpy.context.scene
    for i, f in enumerate(frames):
        s.frame_set(f)
        for j, objs in enumerate(sets):
            for o in objs: o.hide_render = j != i; o.keyframe_insert('hide_render', frame=f)

def key(sock, f, v):
    bpy.context.scene.frame_set(f); sock.default_value = v; sock.keyframe_insert('default_value', frame=f)

def emission(m): return m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']

# ---------------------------------------------------------------------------------------------------
# body pieces: one creature, rendered as windows
# ---------------------------------------------------------------------------------------------------
BARN_N, SCAR_N = 150, 30
OUT_T = 0.06            # the body's outline (a huge creature: thicker than a prop's)

EYE_D = 9.0
EYE_SC = (3.4, 2.4, 1.0)
GILL_D = (13.5, 15.0, 16.5, 18.0)
BLOW_D = 12.5
BREATH = [(0.75, 0.55), (1.0, 0.85), (1.25, 1.0), (1.0, 0.75)]      # per frame: gill opening, blowhole opening
HEAD_AVOID = [(-EYE_D, 7.2, 4.6), (-EYE_D, -7.2, 4.6), (-BLOW_D, 0, 2.4), (-15.8, 9.0, 3.2), (-15.8, -9.0, 3.2), (-PEC_D, 9.4, 2.5), (-PEC_D, -9.4, 2.5)]

def eye_place(body, side):
    ye = side * hw(EYE_D) * 0.74
    loc, n = surf(body, -EYE_D, ye)
    axis = (n + Z * 0.9).normalized()
    T = Vector((side, 0, 0))                              # (the right eye's frame mirrored: its local y points outwards too)
    fw = (T - axis * axis.dot(T)).normalized(); yl = axis.cross(fw)
    q = Matrix((fw, yl, axis)).transposed().to_quaternion()
    return loc + n * 0.05, q

def eye_socket(M, body, side):
    """Head side: the lid-coloured rim and a dark socket (covered by the eye sprite)."""
    c, q = eye_place(body, side); R = q.to_matrix(); sc = EYE_SC
    rim = [(c + R @ Vector((math.cos(a) * sc[0] * 1.07, math.sin(a) * sc[1] * 1.09, 0.08)), 0.75, (1, 1, 0.75)) for a in (k / 40 * math.tau for k in range(40))]
    r = O.blob('lb_eye_rim', rim, m=M['lid'], res=0.1)
    s = mn.sphere('lb_socket', 1.0, loc=c - (R @ Vector((0, 0, 0.25))), m=M['socket'], scale=sc, segs=48)
    s.rotation_mode = 'QUATERNION'; s.rotation_quaternion = q
    return [r, s]

def eye_ball(M, body, side, state):
    c, q = eye_place(body, side); R = q.to_matrix(); sc = EYE_SC
    objs = []
    ball = mn.sphere('lb_eye', 1.0, loc=c, m=M['eyeball_l' if side > 0 else 'eyeball_r'], scale=sc, segs=64)
    ball.rotation_mode = 'QUATERNION'; ball.rotation_quaternion = q; objs.append(ball)
    def on_ball(a, b, lift=0.0):
        zz = sc[2] * math.sqrt(max(0.0, 1 - (a / sc[0]) ** 2 - (b / sc[1]) ** 2))
        return c + R @ Vector((a, b, zz + lift))
    if state == 'open':
        objs.append(mn.sphere('lb_glint', 0.42, loc=on_ball(-0.9, -0.8, -0.02), m=M['glint'], scale=(1, 0.8, 0.25), segs=16))
        objs.append(mn.sphere('lb_glint', 0.18, loc=on_ball(-0.2, -1.15, -0.01), m=M['glint'], scale=(1, 0.8, 0.25), segs=12))
    else:
        dd = 0.0 if state == 'closed' else -0.15
        for sd in (1, -1):
            lid = mn.sphere('lb_lid', 1.0, loc=(0, 0, 0), m=M['lid' if state == 'closed' else 'lid_hit'], segs=48)
            bm = bmesh.new(); bm.from_mesh(lid.data)
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, dd, 0), plane_no=(0, sd, 0), clear_inner=True)
            bm.to_mesh(lid.data); bm.free()
            kz = 0.3 if state == 'closed' else 0.55
            lid.scale = (sc[0] * 1.06, sc[1] * 1.08, sc[2] + kz); lid.location = c; lid.rotation_mode = 'QUATERNION'; lid.rotation_quaternion = q
            sol = lid.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.08
            lid = O.bake(lid)
            if state == 'hit': O.noise_displace(lid, [(0.14, 1.4, 5 + sd)])     # squeezed: creases
            objs.append(lid)
    return objs

def head_details(M, b):
    det = []
    for side in (1, -1): det += eye_socket(M, b, side)
    for side in (1, -1):                                  # the mouth: a long dark lip line down each side of the snout
        pts = []
        for k in range(26):
            d = 0.25 + 10.0 * (k / 25) ** 1.25
            loc, n = surf(b, -d, side * hw(d) * (0.93 if d > 1 else 0.6 + 0.33 * d))
            if loc is not None: pts.append(loc + n * 0.02)
        det.append(O.tube('lb_mouth', pts, [0.24 * (1 - 0.5 * k / 25) for k in range(len(pts))], m=M['lip'], res=2, segs=8))
    return det

def head_breath(M, b):
    """Per-frame parts: gill slits (opening, glow), blowholes (dilating)."""
    sets = []
    for gk, bk in BREATH:
        objs = []
        for side in (1, -1):
            for d in GILL_D:
                pts = []
                for j in range(6):
                    loc, n = surf(b, -d - 0.06 * j, side * hw(d) * (0.72 + 0.05 * j))
                    if loc is not None: pts.append(loc + n * 0.02)
                rr = [0.1, 0.17, 0.2, 0.2, 0.17, 0.1]
                objs.append(O.tube('lb_gill', pts, [r * gk for r in rr], m=M['gill'], res=2, segs=6))
                objs.append(O.tube('lb_gill_lip', [p + Vector((0.28 * gk, 0, 0.12)) for p in pts], [r * 0.9 for r in rr], m=M['lip'], res=2, segs=6))
        for sd in (1, -1):
            loc, n = surf(b, -BLOW_D, sd * 1.0)
            objs.append(mn.sphere('lb_blow', 0.65, loc=loc + n * 0.02, m=M['lip'], scale=(1.5, 0.75 * bk + 0.12, 0.3), segs=16))
        sets.append(objs)
    return sets

def dcenter(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return -sum(v.x for v in bb) / 8

def creature(M, dmax=BODY_L + STUMP):
    """The whole hide (a reference for placing details; not rendered) and its details, in creature coordinates."""
    ref = loft_d('lb_ref', 0.0, dmax, m=M['skin']); ref.hide_render = True
    f = min(1.0, dmax / BODY_L)
    det = head_details(M, ref)
    det += spots(M, ref, 3.0, min(dmax, BODY_L) - 1.0, 41, avoid=HEAD_AVOID)
    det += barnacles(M, ref, 4.0, min(dmax, BODY_L - 6), 9, n=int(BARN_N * f), scars=int(SCAR_N * f), avoid=HEAD_AVOID)
    mn.outline([o for o in det if o.name.startswith('lb_eye_rim')], 0.03); barn_outline(det)
    return ref, det

def piece_window(name, b, d0, d1, cap, origin_d, frames=None, extra=None, passes=('beauty', 'normal', 'height'), x_lo=None, x_hi=None):
    ws = [hw(d0 + (d1 - d0) * i / 40) for i in range(41)]
    ym = max(ws) + 0.9
    xl = -d1 if x_lo is None else x_lo
    xh = (-d0 + (hw(d0) if cap else 0.0) + 0.4) if x_hi is None else x_hi
    return window(name, xl, xh, -ym, ym, frames=frames, extra=extra, passes=passes, origin=(-origin_d, 0, 0))

def piece_body():
    """head (4 breathing frames), eyes (closed / open / hit, 2 frames: left, right), the 6 segments, the tail stock."""
    setup(); M = mats(); M['eyeball_l'] = M['eyeball']; M['eyeball_r'] = LV.eye_mat(-1)
    ref, det = creature(M)
    tilt = tilt_all([ref] + det)
    def show_range(lo, hi):
        for o in det: o.hide_render = not (lo <= dcenter(o) <= hi)
    def new_piece(d0, d1, cap):
        b = loft_d('lb_body', d0, d1, cap=cap, m=M['skin']); mn.outline([b], OUT_T); b.parent = tilt; return b
    def note(kind, d0, d1):
        return dict(chain=kind, d0=d0, d1=d1, halfwidth=[round(hw(d0), 2), round(hw(d1), 2)], over=OVER,
                    note='origin = the piece\'s front joint on the spine (head: the neck joint J0); head towards +x at rot 0; scale 1; '
                         'rear joint at x = -(d1 - d0) units; front end: a round cap (radius = the half-width there), drawn under the piece in front')
    # the head
    b = new_piece(0.0, HEAD_L + OVER + 1.5, False)
    sets = head_breath(M, ref)
    for s_ in sets:
        for o in s_: o.parent = tilt
    F = [1, 2, 3, 4]; frames_hide(sets, F)
    for f, v in zip(F, (0.8, 1.2, 1.6, 1.1)): key(emission(M['gill']), f, v)        # the gills glow with the breath
    show_range(-1, HEAD_L)
    name = 'organic/levb_head'
    piece_window(name, b, 0.0, HEAD_L + OVER, False, HEAD_L, frames=F, x_hi=0.5, extra=dict(note('head', 0.0, HEAD_L), loop=True,
                 length=HEAD_L, pec=[round(HEAD_L - PEC_D, 2), round(hw(PEC_D) * 0.78, 2)], eye=[HEAD_L - EYE_D, round(hw(EYE_D) * 0.74, 2)],
                 note='origin = the neck joint J0 on the spine; nose at x = +length (units); head towards +x at rot 0; scale 1; '
                      'eyes: levb_eye_* at the same origin; left pectoral root at (pec[0], -pec[1]), right (pec[0], +pec[1])'))
    feather(name, -0.0, 99, -OVER, None); tone(name)
    # the eyes (over the head: the head and its details as a holdout)
    for o in [o for s_ in sets for o in s_]: bpy.data.objects.remove(o, do_unlink=True)
    b.is_holdout = True
    for o in det: o.is_holdout = True
    for st in ('closed', 'open', 'hit'):
        es = [eye_ball(M, ref, 1, st), eye_ball(M, ref, -1, st)]
        mn.outline([o for s_ in es for o in s_ if o.name.startswith('lb_lid')], 0.03)
        for s_ in es:
            for o in s_: o.parent = tilt
        frames_hide(es, [1, 2])
        piece_window(f'organic/levb_eye_{st}', b, 0.0, HEAD_L, False, HEAD_L, frames=[1, 2], x_lo=-EYE_D - EYE_SC[0] - 1.0, x_hi=-EYE_D + EYE_SC[0] + 1.0,
                     extra=dict(chain='eye', note='same origin / scale / rot as levb_head; f0 = left eye (screen up at rot 0), f1 = right eye'))
        for o in [o for s_ in es for o in s_]: bpy.data.objects.remove(o, do_unlink=True)
    for o in det: o.is_holdout = False
    bpy.data.objects.remove(b, do_unlink=True)
    # the segments
    for k in range(len(SEG_L)):
        d0, d1 = JOINTS[k], JOINTS[k + 1]
        b = new_piece(d0, d1 + OVER + 1.5, True)
        show_range(d0 - 0.3, d1)
        name = f'organic/levb_seg_{k}'
        piece_window(name, b, d0, d1 + OVER, True, d0, extra=dict(note('segment', d0, d1), length=d1 - d0))
        feather(name, -(d1 - d0), 99, -(d1 - d0) - OVER, None); tone(name)
        bpy.data.objects.remove(b, do_unlink=True)
    # the tail stock (its end: a rounded stump over the fluke's root)
    d0 = JOINTS[-1]
    b = new_piece(d0, BODY_L + STUMP, True)
    show_range(d0 - 0.3, BODY_L + 2)
    piece_window('organic/levb_seg_tail', b, d0, BODY_L + STUMP + 0.3, True, d0, extra=dict(note('tail', d0, BODY_L), length=TAIL_L,
                 note='origin = its front joint J6 on the spine; the fluke\'s root at x = -length; scale 1'))
    tone('organic/levb_seg_tail')

def piece_look():
    """Preview only: the front 58 units in one window (hide, details, the sail, the pectorals, closed eyes)."""
    setup(); M = mats(); M['eyeball_l'] = M['eyeball']; M['eyeball_r'] = LV.eye_mat(-1)
    ref, det = creature(M, 60.0); ref.hide_render = False
    fin, deco = dorsal(M, ref, 0)
    pecs = []
    for sd in (1, -1):
        for o in pec_fin(M, 52, 0.0):
            if sd < 0: o.scale.y = -1; O.apply_tf(o)
            o.location = (-PEC_D, sd * hw(PEC_D) * 0.78, -0.6); O.apply_tf(o); pecs.append(o)
    eyes = eye_ball(M, ref, 1, 'closed') + eye_ball(M, ref, -1, 'closed')
    mn.outline([ref] + fin + pecs, OUT_T)
    tilt_all([ref] + det + fin + deco + pecs + eyes)
    window('organic/levb_look', -58, 0.5, -14, 14, extra=dict(note='preview'))

# ---------------------------------------------------------------------------------------------------
# fins
# ---------------------------------------------------------------------------------------------------
FLUKE_POSES = [(22, 34), (0, 14), (-22, -34), (0, -14)]     # (root, tip) pitch in degrees: up, level (going down), down, level

def fluke(M, root_a, tip_a, span=14.5, k=1.35):
    """The tail fluke at scale 1 (the game draws it at the tail's scale): root at the origin, spreading to -x.
    The stroke pitches it about the lateral axis (towards / away from the camera) and bends the tips."""
    def pitch(p, t):
        a = math.radians(root_a + (tip_a - root_a) * t)
        return Matrix.Rotation(-a, 3, 'Y') @ p             # (+a lifts the trailing part towards +Z: the camera)
    parts = [(Vector((-0.6, 0, 0)), 1.5, (1.2, 1, 0.5))]
    for sd in (-1, 1):
        for j in range(40):
            t = (j + 1) / 40
            p = Vector((-(1.0 + 5.0 * t ** 1.4) * k, sd * span * t, 0.3 * t))
            parts.append((pitch(p, t), 2.6 * k * (1 - 0.62 * t) * 0.85, (1, 1, 0.22)))
    for j in range(6):                                     # the stock into the fluke
        parts.append((pitch(Vector((-0.4 - j * 0.9, 0, 0)), j / 20), 1.4 - 0.05 * j, (1, 1, 0.55)))
    fin = O.blob('lb_fluke', parts, m=M['fin'], res=0.14)
    ribs = []
    for sd in (-1, 1):                                      # ribs fanning out to each tip
        ribs += fin_ribs(M, fin, lambda t, o, sd=sd: pitch(Vector((-(1.0 + 5.0 * t ** 1.4) * k - o * 2.2 * k * (1 - 0.6 * t), sd * span * 0.97 * t, 0.3 * t)), t),
                         (-0.3, 0.15, 0.55), r0=0.15)
    return [fin] + ribs

def piece_fluke():
    setup(); M = mats(); sets = []
    for ra, ta in FLUKE_POSES: sets.append(fluke(M, ra, ta))
    F = [1, 2, 3, 4]; frames_hide(sets, F)
    allo = [o for s in sets for o in s]
    mn.outline(allo, OUT_T); tilt_all(allo)
    x0, x1, y0, y1 = O.screen_bounds(allo)
    window('organic/levb_fluke', x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, frames=F, extra=dict(chain='fluke', loop=True,
           note="origin = root = the tail stock's end (tail-local x = -length of levb_seg_tail); draw before the tail; scale 1"))
    tone('organic/levb_fluke')

PEC_POSES = [(42, 1.6), (52, 0.0), (64, -1.6), (52, 0.0)]  # (sweep back from straight out, deg; tip lift): a rowing paddle

def pec_fin(M, sweep, lift, span=18.0):
    a = math.radians(sweep); dirv = Vector((-math.sin(a), math.cos(a), 0))          # left side (+Y), swept back
    back = Vector((-1, 0, 0)); parts = []
    for k in range(18):
        t = k / 17
        p = dirv * (span * t) + back * (1.5 * t * t) + Z * (lift * t * t - 0.4 * t)
        parts.append((p, 3.7 * (1 - 0.6 * t), (1, 1, 0.25)))
    for k in range(8):                                      # knobs on the leading edge (humpback tubercles)
        t = (k + 1) / 9
        p = dirv * (span * t) - back * (1.9 * (1 - 0.6 * t)) + Z * (lift * t * t - 0.4 * t + 0.15)
        parts.append((p, 0.75 * (1 - 0.4 * t), (1, 1, 0.7)))
    fin = O.blob('lb_pect', parts, m=M['fin'], res=0.13)
    perp = Z.cross(dirv).normalized()                       # (towards the leading edge)
    return [fin] + fin_ribs(M, fin, lambda t, o: dirv * (span * 0.95 * t) + back * (1.5 * t * t) + perp * (o * 3.0 * (1 - 0.6 * t)),
                            (-0.62, -0.25, 0.12, 0.48))

def fin_ribs(M, fin, path, offs, r0=0.17):
    """Raised ribs on a fin's top face: path(t, o) -> a flat-frame point, t 0..1 root -> tip, o across; projected onto the fin."""
    bpy.context.view_layer.update(); out = []
    for o in offs:
        pts = []
        for i in range(16):
            t = 0.04 + 0.9 * i / 15; q = path(t, o)
            hit, loc, n, _ = fin.ray_cast(Vector((q.x, q.y, q.z + 20)), Vector((0, 0, -1)))
            if hit: pts.append(loc - n * 0.02 if n.z > 0 else loc)
        if len(pts) > 5:
            out.append(O.tube('lb_rib', pts, [r0 * (1 - 0.65 * i / (len(pts) - 1)) for i in range(len(pts))], m=M['ray'], res=2, segs=8))
    return out

def piece_fin_pec():
    setup(); M = mats(); sets = [pec_fin(M, s, l) for s, l in PEC_POSES]
    F = [1, 2, 3, 4]; frames_hide(sets, F)
    allo = [o for s in sets for o in s]
    mn.outline(allo, OUT_T); tilt_all(allo)
    x0, x1, y0, y1 = O.screen_bounds(allo)
    window('organic/levb_fin_pec', x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, frames=F, extra=dict(chain='pec', loop=True,
           note='LEFT pectoral, origin = its root: at head-local (pec[0], -pec[1]); the right one: flip + rot + PI at (pec[0], +pec[1]); draw before the head'))
    tone('organic/levb_fin_pec')

LEAN = math.radians(62)                                   # the sail flops over to the left (+Y)

RIBS = 11                                                 # the sail's ribs (pleats)

def dorsal(M, body, holes=0, H=8.0):
    """The tall dorsal sail (the FIN target): a pleated membrane with thickness, flopped over to the left (so the camera
    sees its face), a rib along every crest, a rounded rim, the trailing edge scalloped between the ribs."""
    up = Vector((0, math.sin(LEAN), math.cos(LEAN))); nrm = Vector((0, -math.cos(LEAN), math.sin(LEAN)))  # nrm: the face towards the camera
    T = Vector((-1, 0, 0))
    def basept(t):
        x = -(DORSAL_D0 + DORSAL_L * t); loc, n = surf(body, x, 0.0); return loc
    def hgt(t): return H * math.sin(math.pi * min(1, t ** 0.75)) ** 0.8 * (1 - 0.25 * t)
    eul = Matrix((T, nrm, up)).transposed().to_euler()
    NT, NV = 220, 28
    def P(t, v, lift=0.0):
        ht = hgt(t) * (1 - 0.07 * (1 - math.cos(math.tau * RIBS * t)) * v ** 3)      # scalloped between the ribs, at the edge
        pleat = 0.32 * math.cos(math.tau * RIBS * t) * (0.25 + 0.75 * v) * min(1, 6 * t) * min(1, 6 * (1 - t))
        return basept(t) + up * (ht * v - 0.45) + T * (ht * 0.55 * v * v) + nrm * (pleat + lift)
    bases = [basept(i / NT) for i in range(NT + 1)]
    me = bpy.data.meshes.new('lb_dorsal'); bm = bmesh.new(); grid = []
    for i in range(NT + 1):
        t = i / NT; row = []
        for j in range(NV + 1):
            row.append(bm.verts.new(P(t, j / NV)))
        grid.append(row)
    for i in range(NT):
        for j in range(NV): bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    fin = mn.link(bpy.data.objects.new('lb_dorsal', me)); mn.smooth(fin); mn.assign(fin, M['fin'])
    sol = fin.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.3; sol.offset = 0.0; sol.use_even_offset = True
    fin = O.bake(fin)
    rays = []
    for r in range(RIBS + 1):                                # the ribs: on every crest, both faces
        t = (r + 0.0) / RIBS
        if t < 0.04 or t > 0.97: continue
        ht = hgt(t)
        if ht < 1.0: continue
        rays.append([t, [(j / 12) for j in range(13)]])
    rim = [P(i / 60, 1.0) for i in range(61)] + []          # the rounded rim along the top edge
    lead = [P(0.0, j / 20) for j in range(21)]
    out = [fin]; deco = []
    deco.append(O.tube('lb_rim', rim, [0.14 + 0.08 * math.sin(math.pi * i / 60) for i in range(61)], m=M['fin'], res=1, segs=8))
    deco.append(O.tube('lb_rim', lead, [0.2] * 21, m=M['fin'], res=1, segs=8))
    hp = []
    for h in range(holes):
        t = 0.32 + 0.3 * h; loc = basept(t); ht = hgt(t)
        hp.append(loc + up * (ht * (0.5 - 0.1 * h)) + T * (ht * 0.55 * 0.25) + T * (0.4 * h))
    for c_ in hp:                                          # punch the holes through
        cut = mn.cyl('lb_cut', 0.85, 6.0, loc=(0, 0, -3.0), m=None, verts=24, bevel=0.0)
        cut.matrix_world = Matrix.Translation(c_) @ nrm.to_track_quat('Z', 'Y').to_matrix().to_4x4(); O.apply_tf(cut)
        fin = O.boolean(fin, cut); bpy.data.objects.remove(cut, do_unlink=True)
    out = [fin]
    for t, vs in rays:
        for sgn in (1, -1):
            pts = [P(t, v, sgn * 0.17) for v in vs if v > 0.04]
            r = O.tube('lb_ray', pts, [0.2 * (1 - 0.6 * i / (len(pts) - 1)) for i in range(len(pts))], m=M['ray'], res=2, segs=8)
            for c_ in hp:                                  # rays end at a hole
                if any(((p - c_) - nrm * nrm.dot(p - c_)).length < 1.3 for p in pts): r.hide_render = True
            deco.append(r)
    rnd = random.Random(5)
    for c_ in hp:                                           # charred, smouldering rims round each hole (both faces)
        for sgn in (1, -1):
            ring = [(c_ + nrm * sgn * 0.45 + (T * math.cos(a) + up * math.sin(a)) * (0.95 + 0.1 * rnd.random()), 0.42, (1, 1, 0.6)) for a in (k / 18 * math.tau for k in range(18))]
            deco.append(O.blob('lb_burnrim', ring, m=M['char'], res=0.06))
        for k in range(9):
            a = rnd.uniform(0, math.tau); r = rnd.uniform(1.0, 1.5)
            deco.append(mn.sphere('lb_ember', rnd.uniform(0.08, 0.17), loc=c_ + nrm * 0.62 + (T * math.cos(a) + up * math.sin(a)) * r, m=M['ember'], scale=(1, 1, 0.5), segs=10))
        sc = mn.sphere('lb_soot', 1.0, loc=c_ + nrm * 0.5, m=M['char'], scale=(2.0, 0.08, 1.7), segs=24); sc.rotation_euler = eul
        deco.append(sc)
    return out, deco

def piece_fin_dorsal():
    for holes, st in ((0, 'ok'), (1, 'hit1'), (2, 'hit2')):
        setup(); M = mats()
        b = loft_d('lb_body', DORSAL_D0 - 8, DORSAL_D0 + DORSAL_L + 8, m=M['skin'])     # (the hide under it: catches its shadow)
        fin, deco = dorsal(M, b, holes)
        mn.outline(fin, 0.05); mn.outline([o for o in deco if o.name.startswith(('lb_burnrim', 'lb_rim'))], 0.02)
        allo = fin + deco
        tilt_all([b] + allo)
        if st == 'ok': BND[0] = O.screen_bounds(fin)
        x0, x1, y0, y1 = BND[0]
        args = (f'organic/levb_fin_dorsal_{st}', x0 - 1.2, x1 + 1.2, y0 - 1.2, y1 + 1.2)
        kw = dict(origin=(-DORSAL_D0, 0, 0), extra=dict(chain='dorsal', length=DORSAL_L,
                  at=[JOINTS[0] - DORSAL_D0, 0], note='origin = front end of the base on the spine: segment 0\'s local (at[0], 0) (3 behind its front joint), '
                       'its rot, scale 1; flops to the left; to the right: flip + rot + PI. The beauty pass carries its soft shadow on the hide.'))
        b.is_shadow_catcher = True                         # the beauty: the sail's occlusion on the hide (translucent dark)
        window(*args, passes=('beauty',), **kw); tone(args[0])
        b.is_shadow_catcher = False; b.is_holdout = True   # the maps: the sail alone
        window(*args, passes=('normal', 'height'), **kw)
BND = [None]

# ---------------------------------------------------------------------------------------------------
# infested zones and the nest (overlays on the back; the body below is a holdout)
# ---------------------------------------------------------------------------------------------------
def place_leech(objs, loc, n, ang, lift=0.05, k=1.0):
    R3 = frame_at(n) @ Matrix.Rotation(ang, 3, 'Z')
    mw = Matrix.Translation(loc + n * lift) @ R3.to_4x4() @ Matrix.Scale(k, 4)
    bpy.context.view_layer.update()
    for o in objs: o.matrix_world = mw @ o.matrix_world; O.apply_tf(o)
    return objs

def zone_build(M, body, R, state, seed, phase=0.0, frame=0, nest=False):
    """One infested zone at the origin of the flat frame (on the back of `body`).
    state: infested | glow | hit1 | after. Static parts depend only on seed; phase/frame move the leeches and pustules."""
    rnd = random.Random(seed)
    loc, n = surf(body, 0.0, 0.0); F_ = frame_at(n); t1, t2 = F_.col[0], F_.col[1]
    objs, hal = [], []
    def on(obj, a, r, lift=0.0):
        p = loc + (t1 * math.cos(a) + t2 * math.sin(a)) * r
        hit, l2, n2, _ = obj.ray_cast(p + n * 6, -n)
        if obj is not body:
            h2, l3, n3, _ = body.ray_cast(p + n * 6, -n)
            if h2 and (not hit or (l3 - l2).dot(n) > 0): hit, l2, n2 = h2, l3, n3
        if hit and n2.dot(n) < 0: n2 = -n2
        return (l2 + n2 * lift, n2, True) if hit else (p + n * lift, n, False)
    sick = state in ('infested', 'glow', 'hit1')
    hot = state == 'glow'
    def half_burnt(a): return state == 'hit1' and math.cos(a - 0.6) > -0.1     # the blasted half (towards +x/+y)
    parts = []
    for k in range(7 if sick else 1):                      # the swollen boil (or the flattened wound)
        a = rnd.uniform(0, math.tau); r = R * (0.15 + 0.5 * rnd.random()) if k else 0.0
        p, nn, _ = on(body, a, r, 0.1 if sick else 0.15)
        parts.append((p, R * rnd.uniform(0.6, 0.75) * (1 if sick else 2.1), (1, 1, 0.45 if sick else 0.18)))
    for k in range(12 if sick else 0):
        a = k / 12 * math.tau; p, nn, _ = on(body, a, R * (0.95 + 0.1 * math.sin(a * 3 + seed)), -0.25)
        parts.append((p, R * 0.32 * (1 + 0.25 * rnd.random()), (1, 1, 0.5)))
    mound = O.blob('lb_zone_rim', parts, m=M['rim'] if sick else M['raw'], res=0.06 * R / 1.6)
    objs.append(mound); bpy.context.view_layer.update()
    pool = []
    for k in range(9):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0, R * 0.45)
        p, nn, _ = on(mound, a, r, 0.15)
        pool.append((p, R * rnd.uniform(0.3, 0.42), (1, 1, 0.4)))
    if sick:
        objs.append(O.blob('lb_zone_pool', pool, m=M['pus_hot' if hot else 'pus'], res=0.05 * R / 1.6))
    else:                                                  # a flat charred crater
        p, nn, _ = on(mound, 0, 0, -0.02)
        c_ = mn.sphere('lb_zone_pool', R * 0.45, loc=p, m=M['char'], scale=(1, 1, 0.12), segs=32)
        c_.rotation_mode = 'QUATERNION'; c_.rotation_quaternion = nn.to_track_quat('Z', 'Y'); objs.append(c_)
    if state in ('after', 'hit1'):
        for k in range(22 if nest else 12):
            a = rnd.uniform(0, math.tau); r = rnd.uniform(0, R * 0.85)
            if state == 'hit1' and not half_burnt(a): continue
            p, nn, _ = on(mound, a, r, 0.02)
            objs.append(mn.sphere('lb_ember', rnd.uniform(0.07, 0.17) * R / 1.6, loc=p, m=M['ember'], scale=(1, 1, 0.4), segs=10))
    if state == 'hit1':                                    # the charred half: soot over boil and pus
        for k in range(10):
            a = 0.6 + rnd.uniform(-1.3, 1.3); r = rnd.uniform(0.1, 1.0) * R
            p, nn, _ = on(mound, a, r, 0.05)
            objs.append(mn.sphere('lb_char', R * rnd.uniform(0.22, 0.36), loc=p, m=M['char'], scale=(1, 1, 0.3), segs=16))
    prnd = random.Random(seed + 99)
    if sick:                                               # pustules, pulsing with the squirm
        for k in range(prnd.randint(12, 16)):
            a = prnd.uniform(0, math.tau); r = prnd.uniform(0.35, 1.0) * R; p, nn, _ = on(mound, a, r, -0.05)
            rr = prnd.uniform(0.22, 0.5) * R / 1.6 * (1 + 0.12 * math.sin(phase + k * 1.7))
            if half_burnt(a): continue
            s = mn.sphere('lb_pustule', rr, loc=p, m=M['pustule_hot' if hot else 'pustule'], scale=(1, 1, 0.8), segs=18)
            s.rotation_mode = 'QUATERNION'; s.rotation_quaternion = nn.to_track_quat('Z', 'Y'); objs.append(s)
    vrnd = random.Random(seed + 7)
    for k in range(9):                                     # veins crawling out over the hide
        a = k / 9 * math.tau + vrnd.uniform(-0.2, 0.2); pts = []; r = R * 0.95; aa = a
        for j in range(vrnd.randint(5, 8)):
            p, nn, ok = on(body, aa, r, 0.02)
            if not ok: break
            pts.append(p); r += R * vrnd.uniform(0.14, 0.24); aa += vrnd.uniform(-0.2, 0.2)
        if len(pts) < 4: continue
        rad = [(0.12 if sick else 0.09) * (R / 1.6) ** 0.5 * (1 - 0.7 * j / (len(pts) - 1)) for j in range(len(pts))]
        dead = not sick or half_burnt(a)
        objs.append(O.tube('lb_vein', pts, rad, m=M['dead_vein'] if dead else M['vein_hot' if hot else 'vein'], res=2, segs=6))
    if hot:                                                # the glow halo (beauty only)
        h = O.disc('lb_halo', loc + n * 0.6, R * 2.6, O.halo_mat('lb_halo', '#d8ff40', 1.4, k=0.6))
        h.rotation_mode = 'QUATERNION'; h.rotation_quaternion = n.to_track_quat('Z', 'Y'); hal.append(h)
    lee = []
    lm = LM(M); lrnd = random.Random(seed + 3)
    nl = {'infested': lrnd.randint(6, 8), 'glow': 7, 'hit1': 7, 'after': 0}[state] if not nest else (13 if sick else 0)
    lk = 1.0 if not nest else 1.4
    for k in range(nl):
        a = k / max(nl, 1) * math.tau + lrnd.uniform(-0.3, 0.3); r = lrnd.uniform(0.45, 0.95) * R
        ang = a + math.pi + lrnd.uniform(-1.3, 1.3); ph = lrnd.uniform(0, math.tau)
        if half_burnt(a): continue
        p, nn, _ = on(mound, a, r, 0.0)
        ob = LE.leech(f'lb_lch{seed}_{k}', ph + phase, True, lm)
        place_leech(ob, p, nn, ang + 0.22 * math.sin(phase + ph), k=lk); lee += ob     # (the squirm: each sways its own way)
    if nest and sick:                                      # the brood: clutches of glowing egg sacs, a web of threads
        ernd = random.Random(seed + 11)
        for c in range(7):
            a = ernd.uniform(0, math.tau); r = ernd.uniform(0.2, 0.9) * R
            for e in range(ernd.randint(4, 7)):
                p, nn, _ = on(mound, a + ernd.uniform(-0.25, 0.25), r + ernd.uniform(-0.5, 0.5), 0.1)
                rr = ernd.uniform(0.28, 0.5) * (1 + 0.08 * math.sin(phase + c + e))
                s = mn.sphere('lb_egg', rr, loc=p, m=M['egg'], scale=(1, 0.85, 0.75), segs=16); s.rotation_euler = (0, 0, ernd.uniform(0, 3)); objs.append(s)
        for k in range(14):
            a = ernd.uniform(0, math.tau); a2 = a + ernd.uniform(0.6, 1.6)
            p1, _, _ = on(mound, a, R * ernd.uniform(0.3, 1.0), 0.3); p2, _, _ = on(mound, a2, R * ernd.uniform(0.3, 1.0), 0.3)
            mid = (p1 + p2) / 2 + n * 0.5
            objs.append(O.tube('lb_web', [p1, mid, p2], [0.04, 0.03, 0.04], m=M['web'], res=4, segs=5))
    return objs, lee, hal

ZW = 4.6        # half-size of the zone canvas (units)
NW = 9.0        # nest canvas

def zone_piece(name, R, state, seed, frames, nest=False, win=ZW):
    setup(); M = mats()
    b = loft_d('lb_body', 50.0 - 14, 50.0 + 14, m=M['skin'], shift=50.0)    # a patch of back (d ~50) under the zone
    sets, hals = [], []
    for i in range(frames):
        o, l, h = zone_build(M, b, R, state, seed, phase=i / frames * math.tau, frame=i, nest=nest)
        mn.outline([x for x in o if x.name.startswith('lb_zone_rim')], 0.025)
        mn.outline([x for x in l if '_spot' not in x.name and '_throat' not in x.name and '_tooth' not in x.name], 0.015)
        sets.append(o + l); hals.append(h)
    F = list(range(1, frames + 1))
    if frames > 1: frames_hide([s + h for s, h in zip(sets, hals)], F)
    b.is_holdout = True
    allh = [x for h in hals for x in h]
    tilt_all([b] + [x for s in sets for x in s] + allh)
    extra = dict(chain='overlay', loop=frames > 1, note='origin = centre on the back; turned and scaled with the piece it sits on')
    if allh:                                                # the halo in the beauty pass only
        window(name, -win, win, -win, win, frames=F if frames > 1 else None, extra=extra, passes=('beauty',))
        for x in allh: x.hide_render = True; x.animation_data_clear()
        window(name, -win, win, -win, win, frames=F if frames > 1 else None, extra=extra, passes=('normal', 'height'))
    else:
        window(name, -win, win, -win, win, frames=F if frames > 1 else None, extra=extra)

def piece_zone():
    zone_piece('organic/levb_zone', 1.6, 'infested', 5, 4)
    zone_piece('organic/levb_zone_glow', 1.6, 'glow', 5, 4)
    zone_piece('organic/levb_zone_hit1', 1.6, 'hit1', 5, 1)
    zone_piece('organic/levb_scar', 1.6, 'after', 5, 1)

def piece_nest():
    zone_piece('organic/levb_nest', 3.6, 'infested', 9, 1, nest=True, win=NW)
    zone_piece('organic/levb_nest_burnt', 3.6, 'after', 9, 1, nest=True, win=NW)

# ---------------------------------------------------------------------------------------------------
# the brood: a leech larva that squeezes in through the engine vents (~0.55 long; crew ~0.6 wide). Head = +x.
# ---------------------------------------------------------------------------------------------------
BROOD_K = 0.78

def crawler(M, phase=0.0, dead=False, tag=''):
    objs = []; segs = []
    for k in range(9):
        u = k / 8; x = 0.28 - 0.62 * u
        y = math.sin(phase - u * 3) * 0.04 * u if not dead else 0.0
        r = 0.14 * (1 - 0.55 * u ** 1.3) * (0.85 if k == 0 else 1)
        z = 0.13 + 0.03 * math.sin(u * math.pi) + (0.012 * math.sin(phase * 2 - u * 6) if not dead else 0)
        if dead:                                            # curled into a C
            a = (u - 0.5) * 2.2; x = 0.03 + 0.3 * math.sin(a); y = 0.3 * (1 - math.cos(a)) - 0.12; z = 0.12
        segs.append(((x + 0.03, y, z), r))
    body = O.blob('lb_grub' + tag, [(c, r, (0.75, 1, 0.85)) for c, r in segs], m=M['grub_dead' if dead else 'grub'], res=0.012, threshold=0.6)
    objs.append(body)
    for k in range(1, 6):                                   # stubby claw legs, stepping in a wave
        (x, y, z), r = segs[k]
        for sd in (-1, 1):
            st = 0.035 * math.sin(phase + k * 1.3 + (0 if sd > 0 else math.pi)) if not dead else 0.0
            lift = max(0.0, 0.03 * math.cos(phase + k * 1.3 + (0 if sd > 0 else math.pi))) if not dead else 0.0
            if dead: pts = [(x, y + sd * r * 0.5, z - r * 0.4), (x + 0.02, y + sd * r * 1.1, z - r * 1.0), (x + 0.05, y + sd * r * 1.0, z - r * 1.5)]   # (up in the air once flipped)
            else: pts = [(x, y + sd * r * 0.7, z - r * 0.5), (x + 0.03 + st * 0.5, y + sd * r * 1.15, z - r * 0.7 + lift), (x + 0.06 + st, y + sd * r * 1.25, 0.03 + lift)]
            objs.append(O.tube('lb_grub_leg' + tag, pts, [0.022, 0.016, 0.008], m=M['grub_leg'], res=3, segs=6))
    (hx, hy, hz), hr = segs[0]
    face = Matrix.Translation((hx + hr * 0.55, hy, hz + 0.01)) @ Matrix.Rotation(math.pi / 2 - 0.5, 4, 'Y')
    ring = [((math.cos(a) * hr * 0.6, math.sin(a) * hr * 0.6, 0), hr * 0.32, (1, 1, 0.8)) for a in (k / 12 * math.tau for k in range(12))]
    lip = O.blob('lb_grub_lip' + tag, ring, m=M['leech_lip'], res=0.01); lip.matrix_world = face; O.apply_tf(lip); objs.append(lip)
    thr = mn.sphere('lb_grub_mouth' + tag, hr * 0.45, loc=(0, 0, 0), m=M['leech_throat'], scale=(1, 1, 0.3), segs=16)
    thr.matrix_world = face; O.apply_tf(thr); objs.append(thr)
    for k in range(10):
        a = k / 10 * math.tau
        t = mn.cyl('lb_grub_tooth' + tag, hr * 0.06, hr * 0.22, loc=(0, 0, 0), m=M['leech_tooth'], verts=6, bevel=0.0)
        for v in t.data.vertices:
            kk = v.co.z / (hr * 0.22); v.co.x *= (1 - kk); v.co.y *= (1 - kk)
        t.matrix_world = face @ Matrix.Translation((math.cos(a) * hr * 0.5, math.sin(a) * hr * 0.5, hr * 0.05)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.6, 4, 'Y')
        O.apply_tf(t); objs.append(t)
    for k in (2, 3, 4, 5):                                  # infected bulbs along the back (glow pulsing)
        (x, y, z), r = segs[k]
        objs.append(mn.sphere('lb_grub_bulb' + tag, r * 0.58 * (1 + (0.1 * math.sin(phase + k) if not dead else -0.2)), loc=(x, y, z + r * 0.8),
                              m=M['bulb_dead' if dead else 'pustule'], scale=(1, 1, 0.75), segs=16))
    bpy.context.view_layer.update()                         # (fresh objects: matrix_world isn't set from loc until an update)
    if dead:                                                # belly up: flip about the body axis, lying on its back
        for o in objs:
            o.matrix_world = Matrix.Translation((0, 0, 0.26)) @ Matrix.Rotation(math.pi, 4, 'X') @ o.matrix_world; O.apply_tf(o)
    for o in objs: o.matrix_world = Matrix.Scale(BROOD_K, 4) @ o.matrix_world; O.apply_tf(o)
    mn.outline([o for o in objs if any(o.name.startswith(p) for p in ('lb_grub' + tag, 'lb_grub_lip', 'lb_grub_leg'))
                and 'bulb' not in o.name and 'mouth' not in o.name and 'tooth' not in o.name], thickness=0.008)
    return objs

def piece_brood():
    setup(view=False); M = mats()
    F = [1, 2, 3, 4]
    sets = [crawler(M, i / 4 * math.tau, tag=f'_{i}') for i in range(4)]
    dead = crawler(M, 0.0, dead=True, tag='_d')
    frames_hide(sets, F)
    allo = [o for s in sets for o in s]
    for o in dead: o.hide_render = True
    root = mn.group('brood', allo + dead)
    mn.render('organic/levb_brood', objs=allo + dead, root=root, dirs=8, frames=F)
    O.merge_entry('organic/levb_brood', dict(loop=True, note='origin = the crawler\'s middle on the floor; dir i faces game angle i*45 (0 = right); ~0.55 long'))
    for o in allo: o.animation_data_clear(); o.hide_render = True
    for o in dead: o.hide_render = False
    mn.render('organic/levb_brood_dead', objs=allo + dead, root=root, dirs=8)

# ---------------------------------------------------------------------------------------------------
# toxic gas puffs: a lumpy translucent cloud, denser in the middle (view light: any rot)
# ---------------------------------------------------------------------------------------------------
def gas_mat(name, seed):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb('#a8c040'), 1); b.inputs['Roughness'].default_value = 0.9
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb('#c8e848'), 1); b.inputs['Emission Strength'].default_value = 0.35
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.9; nz.inputs['Detail'].default_value = 5
    nz.noise_dimensions = '4D'; nz.inputs['W'].default_value = seed; Lk(tc.outputs['Object'], nz.inputs['Vector'])
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; Lk(lw.outputs['Facing'], inv.inputs[1])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.6; Lk(inv.outputs[0], pw.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.3; mr.inputs['From Max'].default_value = 0.7; Lk(nz.outputs['Fac'], mr.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; Lk(pw.outputs[0], mu.inputs[0]); Lk(mr.outputs[0], mu.inputs[1])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 0.55; k.use_clamp = True; Lk(mu.outputs[0], k.inputs[0])
    Lk(k.outputs[0], b.inputs['Alpha'])
    return m

def piece_gas():
    for v, seed in (('a', 1), ('b', 2), ('c', 3)):
        setup(); rnd = random.Random(seed * 17); s = bpy.context.scene
        s.cycles.transparent_max_bounces = 64
        parts = []
        n = 9 + seed * 2; Rr = 2.0 + 0.4 * seed
        for k in range(n):
            a = rnd.uniform(0, math.tau); r = Rr * rnd.random() ** 0.7
            parts.append((Vector((math.cos(a) * r * 1.2, math.sin(a) * r, rnd.uniform(-0.3, 0.3))), rnd.uniform(0.9, 1.6) * (1.2 - 0.4 * r / Rr), (1, 1, 0.55)))
        shells = []
        for j, sc in enumerate((1.0, 0.7)):                   # two nested shells: a soft edge and a denser core
            o = O.blob('lb_gas', [(c * sc, r * sc, s_) for c, r, s_ in parts], m=gas_mat(f'gas{v}{j}', seed + j * 3), res=0.18)
            O.noise_displace(o, [(0.35, 0.6, seed + j)])
            shells.append(o)
        tilt_all(shells)
        x0, x1, y0, y1 = O.screen_bounds(shells)
        window(f'organic/levb_gas_{v}', x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, extra=dict(note='toxic gas puff, origin = centre; draw unlit, any rot / scale; translucent'))

# ---------------------------------------------------------------------------------------------------
# systems: the engine vent (floor grate) and the manual override panel (reactor room, by the stern)
# ---------------------------------------------------------------------------------------------------
def render_states(objs, states, pad=0.06):
    """[(name, setter, extra)]: every state on one canvas (the union of their bounds), origin = (0, 0, 0)."""
    b = None
    for _, fn, _ in states:
        fn(); bpy.context.view_layer.update(); x0, x1, y0, y1 = mn._bounds(objs)
        b = (x0, x1, y0, y1) if not b else (min(b[0], x0), max(b[1], x1), min(b[2], y0), max(b[3], y1))
    for name, fn, extra in states:
        fn(); O.render_window(name, b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad, extra=extra)

def syslib():
    sys.path.insert(0, os.path.join(HERE, '..', 'systems')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
    import syslib as SL
    return SL

def piece_vent():
    SL = syslib(); setup(view=False); M = SL.stdmats(); P = SL.Parts()
    M['slime'] = O.slime_mat('vslime', '#7ac84a', 0.25); M['duct'] = SL.pmat('duct', '#15181d', 0.7, 0.3)
    VW, VD = 1.0, 0.7
    # frame flush with the deck (a hair above it), dark duct below
    fr = []
    for (sx, sy, x, y) in ((VW, 0.08, 0, VD / 2 - 0.04), (VW, 0.08, 0, -VD / 2 + 0.04), (0.08, VD, VW / 2 - 0.04, 0), (0.08, VD, -VW / 2 + 0.04, 0)):
        fr.append(P(mn.box('vframe', (sx, sy, 0.05), loc=(x, y, -0.02), m=M['frame'], bevel=0.012)))
    P(mn.box('vduct', (VW - 0.12, VD - 0.12, 0.02), loc=(0, 0, -0.4), m=M['duct'], bevel=0))
    walls = [P(mn.box('vwall', (VW - 0.12, 0.02, 0.4), loc=(0, s * (VD / 2 - 0.07), -0.4), m=M['duct'], bevel=0)) for s in (1, -1)]
    walls += [P(mn.box('vwall', (0.02, VD - 0.12, 0.4), loc=(s * (VW / 2 - 0.07), 0, -0.4), m=M['duct'], bevel=0)) for s in (1, -1)]
    for x, y in ((-0.44, 0.29), (0.44, 0.29), (-0.44, -0.29), (0.44, -0.29)):
        P(mn.cyl('vbolt', 0.022, 0.02, loc=(x, y, 0.03), m=M['steel'], verts=8, bevel=0.005))
    # the grate (a group: hinged on its back edge)
    g = []
    g.append(mn.box('gframe', (VW - 0.14, VD - 0.14, 0.035), loc=(0, 0, 0), m=M['body'], bevel=0.01))
    cut = mn.box('gcut', (VW - 0.26, VD - 0.26, 0.2), loc=(0, 0, -0.08), bevel=0)
    g[0] = O.boolean(g[0], cut); bpy.data.objects.remove(cut, do_unlink=True)
    for i in range(7):
        g.append(mn.box('slat', (0.035, VD - 0.24, 0.03), loc=(-0.33 + i * 0.11, 0, 0.0), m=M['steel'], bevel=0.006))
    g.append(mn.box('gtape', (0.07, 0.3, 0.006), loc=(0.3, -0.08, 0.036), m=M['tape'], bevel=0.002, rot=(0, 0, 0.5)))
    g.append(SL.label('glabel', 'VENT', 0.07, (-0.2, -VD / 2 + 0.115, 0.037), m=M['sticker']))
    hinge = mn.group('hinge', g, loc=(0, VD / 2 - 0.08, 0.0))
    for o in g: o.location.y -= (VD / 2 - 0.08)
    for o in g: P(o)
    # the open state: slime round the rim and up from the duct, claw scratches, a bent slat
    slime = []
    rnd = random.Random(3)
    for k in range(14):
        a = rnd.uniform(0, math.tau); x = math.cos(a) * 0.42; y = math.sin(a) * 0.3
        slime.append(mn.sphere('vslime', rnd.uniform(0.02, 0.045), loc=(x, y, 0.025), m=M['slime'], scale=(1.6, 1, 0.35), segs=12))
    slime.append(mn.sphere('vglow', 0.3, loc=(0, 0, -0.38), m=O.emit_mat('vglow', '#9cff5a', 0.7, base='#2a4a10'), scale=(1.2, 0.8, 0.1), segs=24))
    for k in range(3):
        slime.append(O.tube('vdrip', [(-0.2 + k * 0.18, -0.25, 0.02), (-0.2 + k * 0.18, -0.24, -0.15), (-0.18 + k * 0.18, -0.22, -0.3)], [0.03, 0.02, 0.012], m=M['slime'], res=3, segs=6))
    for o in slime: P(o)
    SL.outline([o for o in P if not o.name.startswith(('vslime', 'vglow', 'vdrip', 'vduct', 'vwall'))], 0.012)
    objs = [o for o in P if not o.name.startswith(('vduct', 'vwall', 'vglow'))]
    deck = mn.box('vdeck', (3.0, 3.0, 0.02), loc=(0, 0, -0.02), bevel=0)       # the deck as a holdout: the duct only shows through the hole
    hole = mn.box('vhole', (VW - 0.1, VD - 0.1, 0.4), loc=(0, 0, -0.2), bevel=0)
    deck = O.boolean(deck, hole); bpy.data.objects.remove(hole, do_unlink=True); deck.is_holdout = True
    def closed(): hinge.rotation_euler.x = 0; g[3].rotation_euler.y = 0; SL.show(slime, False)
    def opened(): hinge.rotation_euler.x = math.radians(-105); g[3].rotation_euler.y = 0.5; SL.show(slime, True)
    note = 'floor grate 1.0 x 0.7 in the reactor room, origin = its centre on the floor; both states share one canvas'
    render_states(objs, [('systems/engine_vent_closed', closed, dict(note=note)),
                         ('systems/engine_vent_open', opened, dict(note=note + '; open: grate forced up (hinged at the back), slime, the duct glowing'))])

def piece_override():
    SL = syslib(); setup(view=False); M = SL.stdmats(); P = SL.Parts()
    M['paint'] = SL.worn('opaint', '#6a7383', 0.5, 0.35)
    M['lamp_e'] = SL.glow('lamp_e', '#ffe08a', 1.3); M['lamp_g'] = SL.glow('lamp_g', '#5fd6a0', 1.3); M['lamp_r'] = SL.glow('lamp_r', '#e2574c', 1.4)
    M['grip'] = SL.pmat('grip', '#e2574c', 0.35); M['slot_glow'] = SL.glow('slot_glow', '#ffe08a', 0.9)
    OW, OD = 0.9, 0.6; H0, H1 = 0.45, 0.7
    P(mn.box('obase', (OW, OD, 0.08), m=M['frame'], bevel=0.025))
    ped = P(SL.wedge('oped', OW - 0.08, OD - 0.08, H0, H1, loc=(0, 0.0, 0.06), m=M['paint'], bevel=0.04))
    P(mn.box('ohz', (OW - 0.14, 0.02, 0.1), loc=(0, -OD / 2 + 0.03, 0.12), m=M['hazard'], bevel=0.004))
    P(mn.box('oplate', (0.5, 0.01, 0.1), loc=(0, -OD / 2 + 0.035, 0.27), m=M['dark'], bevel=0.004))
    P(SL.label('oplate_t', 'MANUAL OVERRIDE', 0.045, (0, -OD / 2 + 0.028, 0.32), rot=SL.R90, m=M['sticker']))
    d = OD - 0.08
    top = []
    top.append(mn.box('oslot', (0.12, 0.34, 0.02), loc=(-0.12, 0.0, 0.0), m=M['hole'], bevel=0.008))
    slot_glow = mn.box('oslotg', (0.09, 0.3, 0.012), loc=(-0.12, 0.0, 0.004), m=M['slot_glow'], bevel=0.004); top.append(slot_glow)
    top.append(mn.box('ocollar', (0.2, 0.42, 0.025), loc=(-0.12, 0.0, -0.005), m=M['hazard'], bevel=0.01))
    lamps = []
    for i in range(3):
        top.append(mn.cyl('olamp_b', 0.05, 0.02, loc=(0.2, 0.12 - i * 0.12, 0.0), m=M['frame'], verts=20, bevel=0.006))
        l = mn.sphere('olamp', 0.035, loc=(0.2, 0.12 - i * 0.12, 0.025), m=M['lamp_off'], scale=(1, 1, 0.6), segs=16); lamps.append(l); top.append(l)
    top.append(mn.box('otape', (0.06, 0.25, 0.006), loc=(0.33, 0.0, 0.0), m=M['tape'], bevel=0.002, rot=(0, 0, 0.25)))
    # the T-handle: shaft + grip, in the slot
    hdl = [mn.cyl('oshaft', 0.025, 0.3, loc=(0, 0, 0), m=M['steel'], verts=12, bevel=0.006),
           mn.cyl('ogrip', 0.035, 0.26, loc=(0, 0.13, 0.3), m=M['grip'], verts=16, bevel=0.012, rot=(math.radians(90), 0, 0))]
    hg = mn.group('ohandle', hdl, loc=(-0.12, -0.08, 0.0)); top.append(hg)
    beacon = mn.sphere('obeacon', 0.06, loc=(0.32, 0.17, 0.05), m=M['lamp_off'], scale=(1, 1, 1.2), segs=16); top.append(beacon)
    cy = 0.0; z, tilt = SL.on_slope(H0, H1, d, cy)
    grp = mn.group('otop', top, loc=(0, cy, z + 0.06)); grp.rotation_euler.x = tilt
    for o in top:
        if o.type == 'MESH': P(o)
    for o in hdl: P(o)
    SL.outline(P, 0.012)
    objs = [o for o in P if o.type == 'MESH']
    def state(lit, pulled, beacon_m, glow_on):
        for l in lamps: SL.setmat(l, M['lamp_e'] if lit == 'e' else M['lamp_g'] if lit == 'g' else M['lamp_off'])
        hg.location.y = -0.08 if not pulled else 0.1; hg.rotation_euler.x = 0 if not pulled else math.radians(-35)
        hdl[0].scale.z = 1.0; SL.setmat(beacon, beacon_m); SL.show(slot_glow, glow_on)
    note = dict(note='manual override panel (footprint 0.9 x 0.6), origin = centre on the floor; '
                     'off: lamps dark / ready: 3 energy lamps lit / active: handle pulled, green, red beacon')
    render_states(objs, [('systems/engine_override_off', lambda: state(None, False, M['lamp_off'], False), note),
                         ('systems/engine_override_ready', lambda: state('e', False, M['lamp_off'], True), note),
                         ('systems/engine_override_active', lambda: state('g', True, M['lamp_r'], True), note)])

# ---------------------------------------------------------------------------------------------------
# fx: the main engine's huge exhaust blast (volume emission on black -> glowify, like hull/engine.py's flame)
# ---------------------------------------------------------------------------------------------------
class Nodes:
    def __init__(self, nt): self.nt = nt; self.N = nt.nodes
    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        else: self.nt.links.new(v, sock)
    def m(self, op, a, b=None, clamp=False):
        n = self.N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        self._in(n.inputs[0], a)
        if b is not None: self._in(n.inputs[1], b)
        return n.outputs[0]
    def add(self, a, b): return self.m('ADD', a, b)
    def sub(self, a, b): return self.m('SUBTRACT', a, b)
    def mul(self, a, b): return self.m('MULTIPLY', a, b)
    def div(self, a, b): return self.m('DIVIDE', a, b)
    def pow(self, a, b): return self.m('POWER', a, b)
    def clamp(self, a): return self.m('ADD', a, 0.0, clamp=True)
    def exp(self, a): return self.m('EXPONENT', a)
    def value(self, name, v):
        n = self.N.new('ShaderNodeValue'); n.name = name; n.outputs[0].default_value = v; return n
    def noise(self, vec, w, scale, detail=3.0, rough=0.55):
        n = self.N.new('ShaderNodeTexNoise'); n.noise_dimensions = '4D'
        self.nt.links.new(vec, n.inputs['Vector']); self._in(n.inputs['W'], w)
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']

BLAST_FRAMES = [(5.0, 1.7, 0.7), (13.0, 1.5, 0.9), (21.0, 1.25, 1.0), (22.5, 1.3, 1.05), (19.0, 0.75, 1.1), (14.0, 0.35, 1.2)]   # length, gain, width
BLAST_LMAX = 24.0

def blast_mat():
    m = bpy.data.materials.new('blast'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); E_ = Nodes(nt)
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); nt.links.new(em.outputs[0], out.inputs['Volume'])
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sp.inputs[0])
    X, Y, Zs = sp.outputs['X'], sp.outputs['Y'], sp.outputs['Z']
    Ln, gain, wid, seed = (E_.value(k, v).outputs[0] for k, v in (('len', 20.0), ('gain', 1.0), ('wid', 1.0), ('seed', 0.0)))
    a = E_.mul(Y, -1.0); t = E_.clamp(E_.div(a, Ln))
    cv = N.new('ShaderNodeCombineXYZ'); E_._in(cv.inputs[0], E_.mul(X, 0.5)); E_._in(cv.inputs[1], E_.mul(a, 0.22)); E_._in(cv.inputs[2], E_.mul(Zs, 0.5))
    n1 = E_.noise(cv.outputs[0], seed, 1.3); n2 = E_.noise(cv.outputs[0], E_.add(seed, 7.3), 1.3)
    n3 = E_.noise(cv.outputs[0], E_.add(seed, 13.1), 3.5, detail=6.0)
    wob = E_.mul(t, 2.4)
    xs = E_.add(X, E_.mul(E_.sub(n1, 0.5), wob)); zs = E_.add(Zs, E_.mul(E_.sub(n2, 0.5), E_.mul(wob, 0.7)))
    wx = E_.mul(wid, E_.add(1.3, E_.mul(E_.pow(t, 0.8), 4.2)))             # widening cone: 1.3 at the nozzle -> 5.5
    hz = E_.mul(wid, E_.add(0.6, E_.mul(E_.pow(t, 0.8), 2.4)))
    rn2 = E_.add(E_.pow(E_.div(xs, wx), 2.0), E_.pow(E_.div(zs, hz), 2.0))
    start = E_.clamp(E_.div(E_.add(a, 0.05), 0.3))
    fend = E_.pow(E_.sub(1.0, t), 1.2)
    body = E_.mul(E_.exp(E_.mul(rn2, -2.2)), fend)
    core = E_.mul(E_.exp(E_.mul(rn2, -9.0)), E_.pow(E_.clamp(E_.sub(1.0, E_.mul(t, 1.15))), 1.0))
    turb = E_.add(0.25, E_.mul(n3, 1.5))
    I = E_.mul(E_.add(E_.mul(E_.mul(body, turb), 0.6), E_.mul(core, 1.4)), start)
    cr = N.new('ShaderNodeValToRGB'); E_._in(cr.inputs[0], E_.mul(I, 0.85))
    ramp = [(0.0, (0.5, 0.04, 0.01, 1)), (0.2, (1.0, 0.22, 0.02, 1)), (0.45, (1.0, 0.55, 0.08, 1)), (0.75, (1.0, 0.88, 0.45, 1)), (1.0, (1.0, 1.0, 0.92, 1))]
    el = cr.color_ramp.elements
    el[0].position, el[0].color = ramp[0]; el[1].position, el[1].color = ramp[-1]
    for pos, col in ramp[1:-1]: e = el.new(pos); e.color = col
    nt.links.new(cr.outputs[0], em.inputs['Color']); E_._in(em.inputs['Strength'], E_.mul(I, gain))
    return m

def piece_blast():
    s = setup(view=False)
    for o in [o for o in s.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o, do_unlink=True)
    s.render.film_transparent = False; s.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    s.cycles.volume_bounces = 0; s.cycles.volume_step_rate = 0.5; s.cycles.max_bounces = 0
    me = bpy.data.meshes.new('blast'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x *= 13.0; v.co.z *= 7.0; v.co.y = 0.05 if v.co.y > 0 else -BLAST_LMAX
    bm.to_mesh(me); bm.free()
    fl = mn.link(bpy.data.objects.new('blast', me)); fl.location = (0, -1.26, -0.6)        # out of the bell's exhaust plate
    mat = blast_mat(); fl.data.materials.append(mat)
    V = {k: mat.node_tree.nodes[k].outputs[0] for k in ('len', 'gain', 'wid', 'seed')}
    F = list(range(1, len(BLAST_FRAMES) + 1))
    for i, (ln, g, w) in enumerate(BLAST_FRAMES):
        for k, v in (('len', ln), ('gain', g * 2.2), ('wid', w), ('seed', 9.3 * i)): key(V[k], F[i], v)
    name = 'fx/engine_blast'
    old = mn.SAMPLES; mn.SAMPLES = min(mn.SAMPLES, 24)
    window(name, -6.5, 6.5, -(1.26 + BLAST_LMAX) * math.sin(E) - 0.6 * math.cos(E) - 3.5 * math.cos(E), 0.5, frames=F, passes=('beauty',),
           extra=dict(origin='game (22.2, 26.1): the engine bell\'s origin; unlit, alpha = brightness (draw over the bell)',
                      note='6-frame burst: ignite, swell, full, full, fading, dying (f2/f3 alternate to hold it)'))
    mn.SAMPLES = old
    post('glowify', name)

# ---------------------------------------------------------------------------------------------------
PIECES = dict(body=piece_body, look=lambda: piece_look(),
              fluke=piece_fluke, fin_pec=piece_fin_pec, fin_dorsal=piece_fin_dorsal, zone=piece_zone, nest=piece_nest,
              brood=piece_brood, gas=piece_gas, vent=piece_vent, override=piece_override, blast=piece_blast)

def main():
    T = time.time()
    for k in (SEL or list(PIECES)):
        t0 = time.time(); PIECES[k](); print(f'[levb] {k}: {time.time() - t0:.1f}s', flush=True)
    print(f'[levb] total {time.time() - T:.1f}s')

if __name__ == '__main__':
    main()
