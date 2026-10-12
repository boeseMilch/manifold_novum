"""The grappler (js/organic.js ENEMY_TYPES.grappler, drawGrappler): a violet squid, swimming mantle first.

Sprites (assets/sprites/organic/), all sharing the enemy's ground origin (e.x, e.y) through the
manifest's ox/oy, side = port | star (mirrored builds; port = the squid is left of our ship):
  grappler_<side>_f<i>            i = 0..7: the body: mantle (dorsal stripe, mottling, mint photophores),
                                  rear fins and the six trailing arms rippling (the game's
                                  sin(t * 2.4 + i + u * 4): loop period 2.6 s, ~0.33 s per frame).
                                  Without the grabbing arm and without the three weak organs.
  grappler_<side>_grab_c<k>       the grabbing arm when it is not attached, k = 0..4 for coil = k / 4
                                  (0 = idle / leaving, 1 = about to throw; the game's TENTACLE_COIL
                                  windup). Rendered with the mantle as a holdout: draw it after the body.
  grappler_<side>_eye_<state>     state = ok | hit. ok: yellow slit-pupil eye in a socket with a
                                  glowing blue rim and halo; hit: swollen shut, a green tear.
  grappler_<side>_sac_ok_f<i>     i = 0..3: the poison sac (blue-veined translucent pouch on a stalk,
                                  sloshing toxic green with bubbles and a drop at its tip), slosh loop
                                  ~1 s (the game's sin(t * 3)); the game's 5% puff scale can stay.
  grappler_<side>_sac_hit         shrivelled and leaking.
  grappler_<side>_beak_ok_f<i>    i = 0..3: beak opening, open = i / 3 (e.wind before a spit, or the
                                  munching while leaving: 0.5 + 0.5 sin(munch * 12)). Acid wells up when
                                  open > 0.3. Blue glowing lips around it, plus the halo.
  grappler_<side>_beak_hit        jaws shut, cracked and dull.
  grappler_plate                  the hull plate it rips off, with bites taken out (origin = its centre;
                                  the game places it at local (bx + 0.5, by - 0.3), rotated 0.4 + wobble).
Weak organs are rendered with the mantle and fins as a holdout and placed so they project onto the
game's POI circles at z = 0 (eye 1.45, 0.45 r 0.32; sac 1.65, -0.85 r 0.46; beak 1.05, 1.35 r 0.3).
Draw order: body frame, grab arm, organs (ok/hit), plate. The healing rings, hit flash, and the shadow
stay procedural.

    blender -b --factory-startup --python tools/blender/models/organic/grappler.py [-- quick] [port|star] [body|grab|organs|plate]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
import mn
import orglib as O
from orglib import P

BODY = [(0, -2.8), (1.1, -2.2), (1.5, -0.8), (1.3, 0.8), (0.7, 1.6), (-0.7, 1.6), (-1.3, 0.8), (-1.5, -0.8), (-1.1, -2.2)]
EYE, SAC, BEAK = (1.45, 0.45, 0.32), (1.65, -0.85, 0.46), (1.05, 1.35, 0.3)
FR = list(range(1, 9))

# ---------------------------------------------------------------------------------------------------------
# The game's outline (quadratic curves through the polygon's edge midpoints) -> half width per ly
# ---------------------------------------------------------------------------------------------------------
def outline_pts(n=24):
    B = BODY; out = []
    for i in range(len(B)):
        a = B[i]; prev = B[i - 1]; nxt = B[(i + 1) % len(B)]
        p0 = ((prev[0] + a[0]) / 2, (prev[1] + a[1]) / 2); p2 = ((a[0] + nxt[0]) / 2, (a[1] + nxt[1]) / 2)
        for k in range(n):
            t = k / n
            out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * a[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * a[1] + t * t * p2[1]))
    return out
OUTLINE = outline_pts()
Y_MIN = min(p[1] for p in OUTLINE); Y_MAX = max(p[1] for p in OUTLINE)

def half_width(ly):
    best = 0.0; pts = OUTLINE
    for i in range(len(pts)):
        (ax, ay), (bx, by) = pts[i - 1], pts[i]
        if (ay - ly) * (by - ly) <= 0 and ay != by:
            x = ax + (ly - ay) / (by - ay) * (bx - ax); best = max(best, abs(x))
    return best

def height(ly, w):
    h = 0.2 + 0.42 * math.exp(-((ly + 0.9) / 1.4) ** 2) + 0.1 * math.exp(-((ly - 1.0) / 0.4) ** 2)
    return h * min(1.0, w / 0.7) ** 0.7

# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
def mats():
    return dict(
        mantle=O.flesh('mantle', '#6e2e88', '#a860c0', c2='#3e1650', veins='#e8a8ff', vein_k=0.25, scale=1.4,
                       spots='#bef8ec', spot_scale=5, spot_size=0.07, spot_strength=0.9, stripe=('#3a1448', 0.28, 0.6),
                       belly='#e6b8f0', belly_axis=(0, 0, -1), belly_k=0.5, sss=0.2, sss_col=(1.0, 0.4, 0.9), coat=0.8, bump=0.4, rough=0.35,
                       speckle=('#3a0c48', 9.0, 0.28, 0.7)),
        arm=O.flesh('arm', '#6e2e88', '#a058b8', c2='#3e1650', scale=3, sss=0.3, sss_col=(1.0, 0.4, 0.9), coat=0.6, belly='#e0b0ea', belly_axis=(0, 0, -1), belly_k=0.5, speckle=('#4a1458', 14.0, 0.3, 0.6)),
        grab=O.flesh('grab', '#8a3e9e', '#cc7ae0', c2='#3e1650', scale=3, sss=0.3, sss_col=(1.0, 0.4, 0.9), coat=0.6, veins='#f0b0ff', vein_k=0.3),
        fin=O.flesh('fin', '#7a3a8a', '#b070c8', c2='#3e1650', veins='#f0b8ff', vein_k=0.5, scale=2.5, sss=0.5, sss_col=(1.0, 0.4, 0.9), coat=0.5, mottle=0.6, spots='#bef8ec', spot_scale=9, spot_size=0.06, spot_strength=1.0),
        sucker=O.plain('sucker', '#f0c8ec', 0.3, coat=0.5, sss=0.3),
        photo=O.emit_mat('photo', '#8af0dc', 1.1, base='#6ad8c0', coat=1.0),
        white=O.plain('eye_white', '#f2eedf', 0.15, coat=1.0, sss=0.2),
        iris=O.emit_mat('iris', '#e8b02e', 0.6, base='#e8a020', coat=1.0),
        pupil=O.plain('pupil', '#0a0608', 0.3),
        cornea=cornea(),
        blue=O.blue_organ('blue_rim', 1.3),
        halo=O.halo_mat('halo', '#6ebeff', 1.6, k=0.45),
        chitin=chitin('chitin', '#e0cfa2'), chitin2=chitin('chitin2', '#cdb987'), chitin_dead=chitin('chitin_dead', '#6a5a48', 0.7),
        acid=O.emit_mat('acid', '#9cff5a', 1.2, base='#5fd12a', coat=1.0),
        poison=O.glossy_glow('poison', '#3fa818', '#7cff3a', 1.6, veins=None, noise_k=0.4),
        gland=O.plain('gland', '#1e5a10', 0.3, sss=0.3),
        membrane=membrane('membrane'),
        bruise=O.flesh('bruise', '#3a1838', '#6a2a5a', c2='#14060f', veins='#20060f', scale=4, coat=0.7),
        shrivel=O.flesh('shrivel', '#4a3d2a', '#5a3a4a', c2='#1a120a', scale=6, coat=0.4, rough=0.6, bump=1.0),
        throat=O.emit_mat('throat', '#ff4a6a', 0.6, base='#3a0614'),
    )

def chitin(name, color, rough=0.32):
    m = O.flesh(name, color, color, c2='#3a2a14', scale=6, rough=rough, coat=0.6, sss=0.05, mottle=0.4, bump=0.25)
    return m

def cornea():
    m = bpy.data.materials.new('cornea'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.0; b.inputs['IOR'].default_value = 1.2
    return m

def membrane(name):
    """The poison sac's skin: see-through pale green with a glowing blue vein web (it's a weak spot)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*O.lift('#a8f070'), 1)
    b.inputs['Transmission Weight'].default_value = 0.7; b.inputs['Roughness'].default_value = 0.08; b.inputs['IOR'].default_value = 1.05
    b.inputs['Coat Weight'].default_value = 1.0
    tc = N.new('ShaderNodeTexCoord')
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 7; Lk(tc.outputs['Object'], v.inputs['Vector'])
    cr = N.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.04; cr.inputs['From Max'].default_value = 0.0; Lk(v.outputs['Distance'], cr.inputs['Value'])
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb('#5fb4ff'), 1)
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 2.2; Lk(cr.outputs[0], k.inputs[0]); Lk(k.outputs[0], b.inputs['Emission Strength'])
    tw = N.new('ShaderNodeMath'); tw.operation = 'SUBTRACT'; tw.inputs[0].default_value = 0.7; Lk(cr.outputs[0], tw.inputs[1])
    Lk(tw.outputs[0], b.inputs['Transmission Weight'])
    return m

# ---------------------------------------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------------------------------------
def mantle(M):
    """Loft along ly: each section is a superellipse, the game outline's half width at z = 0."""
    me = bpy.data.meshes.new('mantle'); bm = bmesh.new(); NR = 40
    ys = []
    for i in range(46):                                   # denser at the ends
        t = i / 45; ys.append(Y_MIN + 0.002 + (Y_MAX - 0.002 - Y_MIN - 0.002) * (0.5 - 0.5 * math.cos(t * math.pi)))
    secs = [(ly, half_width(ly)) for ly in ys]
    for k in range(1, 6):                                 # round off the back (the arms come out there)
        f = k / 6; w0 = secs[-1][1]
        secs.append((Y_MAX + 0.16 * f, w0 * math.sqrt(1 - f * f) * 0.95 + 0.0))
    rings = []
    for ly, w in secs:
        w = max(w, 0.004); h = height(min(ly, Y_MAX), max(w, secs[-6][1] if ly > Y_MAX else w))
        if ly > Y_MAX: h *= w / max(secs[-6][1], 1e-3)
        row = []
        for i in range(NR):
            th = i / NR * math.tau; c, s = math.cos(th), math.sin(th)
            x = w * math.copysign(abs(c) ** 0.9, c)
            z = h * abs(s) ** 1.1 if s >= 0 else -0.42 * h * abs(s) ** 0.9
            row.append(bm.verts.new(P(x, ly, z)))
        rings.append(row)
    for j in range(len(rings) - 1):
        for i in range(NR):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % NR], rings[j + 1][(i + 1) % NR], rings[j + 1][i]))
    for row, ly in ((rings[0], secs[0][0]), (rings[-1], secs[-1][0])):
        c = bm.verts.new(P(0, ly, 0))
        for i in range(NR): bm.faces.new((row[i], row[(i + 1) % NR], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('mantle', me)); mn.smooth(o)
    o = O.subdiv(o, 2)
    o = O.displace(o, 0.03, 0.5, seed=3)
    mn.assign(o, M['mantle'])
    return o

def surface_z(o, lx, ly):
    """Height of the mantle's top at local (lx, ly) (ray cast from above)."""
    hit, loc, n, i = o.ray_cast(P(lx, ly, 5.0), Vector((0, 0, -1)))
    return (loc.z, n) if hit else (0.0, Vector((0, 0, 1)))

def body_static(M):
    """Mantle and everything on it that doesn't move: returns (objs, mantle)."""
    m = mantle(M); objs = [m]
    # head: a crown of flesh where the arms join, and the far-side eye (only the near one is a weak spot)
    crown = O.blob('crown', [(P(0, 1.45, -0.05), 0.75, (1.25, 0.6, 0.55)), (P(0.5, 1.55, -0.08), 0.4, (1, 1, 0.8)), (P(-0.5, 1.55, -0.08), 0.4, (1, 1, 0.8))],
                   m=M['mantle'], res=0.03)
    objs.append(crown)
    sock = O.blob('socket_near', [(P(1.22, 0.45, 0.12), 0.42, (0.8, 1.1, 0.8))], m=M['mantle'], res=0.03); objs.append(sock)
    far = O.blob('socket_far', [(P(-1.22, 0.45, 0.12), 0.42, (0.8, 1.1, 0.8))], m=M['mantle'], res=0.03); objs.append(far)
    fe = mn.sphere('far_eye', 0.17, loc=P(-1.3, 0.45, 0.2), m=M['white'], segs=24); objs.append(fe)
    fi = mn.sphere('far_iris', 0.11, loc=P(-1.4, 0.47, 0.26), m=M['iris'], scale=(0.5, 1, 1), segs=20); objs.append(fi)
    fp = mn.sphere('far_pupil', 0.09, loc=P(-1.445, 0.47, 0.27), m=M['pupil'], scale=(0.25, 0.25, 1), segs=16); objs.append(fp)
    lid = O.blob('far_lid', [(P(-1.3, 0.42, 0.3), 0.3, (1, 1.2, 0.45))], m=M['mantle'], res=0.02); objs.append(lid)
    # photophores where the game twinkles its nine spots
    for i in range(9):
        sx, sy = -1.0 + (i * 0.73) % 2, -2.0 + i * 0.4
        z, n = surface_z(m, sx, sy)
        r = 0.045 + (i % 3) * 0.02
        o = mn.sphere(f'photo{i}', r, loc=P(sx, sy, z - r * 0.35), m=M['photo'], scale=(1, 1, 0.55), segs=16); objs.append(o)
        ring = O.blob(f'photo_ring{i}', [(P(sx, sy, z - r * 0.3), r * 1.9, (1, 1, 0.35))], m=M['mantle'], res=r * 0.25)
        objs.append(ring)
    return objs, m

def arm_path(i, phase):
    """The game's trailing arm i at loop phase: 15 points (x, y local, z)."""
    x0 = -0.95 + i * 0.38; pts = []
    for k in range(15):
        u = k / 14
        x = x0 + math.sin(phase + i + u * 4) * 0.35 * u + (i - 2.5) * 0.12 * u
        y = 1.3 + u * (2.6 + (i % 2) * 0.5)
        z = -0.06 - 0.12 * u + 0.05 * math.sin(phase + i * 0.7 + u * 3) * u
        pts.append((x, y, z))
    return pts

def arm(name, pts, r0, r1, m, sucker_m, side=1):
    bp = [P(*p) for p in pts]; n = len(bp)
    radii = [r0 + (r1 - r0) * (k / (n - 1)) for k in range(n)]
    radii[-1] *= 0.5
    o = O.tube(name, bp, radii, m=m, res=4, segs=12)
    objs = [o]
    fr = O.curve_frames(bp)
    for k in range(2, n - 1):                                 # a row of pale suckers along the side facing us
        t, sd, up = fr[k]; r = radii[k]
        c = Vector(bp[k]) + sd * (r * 0.75) * side * (1 if S_() > 0 else -1) - up * r * 0.35
        s = mn.sphere(name + '_sucker', r * 0.42, loc=c, m=sucker_m, scale=(1, 1, 0.5), segs=12)
        s.rotation_euler = sd.to_track_quat('Z', 'Y').to_euler(); objs.append(s)
    return objs

def S_():
    return O.S

def fin(name, sd, phase, M):
    """A rounded triangular membrane (the game's fin polygon), rippling."""
    from shiplib_fillet import fillet
    pts = fillet([(1.2, 0.2), (2.0, 0.9), (1.0, 1.4)], 0.22)
    bp = [P(sd * x, y) for x, y in pts]
    o = O.poly_prism(name, [(v.x, v.y) for v in bp], -0.018, 0.018, M['fin'])
    o = O.subdiv(o, 2)
    for v in o.data.vertices:
        lx = abs(v.co.x); ly = -v.co.y; out = max(0.0, lx - 1.0)
        v.co.z += 0.06 + 0.12 * out + 0.05 * math.sin(phase + ly * 3.5 + sd) * out
    return o

# ---------------------------------------------------------------------------------------------------------
# Weak organs
# ---------------------------------------------------------------------------------------------------------
def eye(M, hit):
    cx, cy, r = EYE; objs = []
    n = Vector((0.6 * O.S, -0.45, 0.66)).normalized()           # it looks out sideways, towards our ship (and up at us)
    c = P(cx, cy, 0.2, comp=True)
    rot = n.to_track_quat('Z', 'Y')
    def at(v): return c + rot @ Vector(v)
    if not hit:
        objs.append(mn.sphere('eyeball', r * 0.78, loc=c, m=M['white'], segs=40))
        ir = mn.sphere('iris', r * 0.5, loc=at((0, 0, r * 0.64)), m=M['iris'], scale=(1, 1, 0.3), segs=32); ir.rotation_euler = rot.to_euler(); objs.append(ir)
        pu = mn.sphere('pupil', r * 0.5, loc=at((0, 0, r * 0.72)), m=M['pupil'], scale=(0.16, 0.8, 0.2), segs=24); pu.rotation_euler = rot.to_euler(); objs.append(pu)
        # the socket's lids: a fleshy ring with a glowing blue rim (weak spot)
        ring = [(at((math.cos(a) * r * 0.86, math.sin(a) * r * 0.86 * 1.05, -r * 0.05)), r * 0.34, (1, 1, 1)) for a in (k / 28 * math.tau for k in range(28))]
        lids = O.blob('lids', ring, m=M['mantle'], res=0.015); objs.append(lids)
        rim = [(at((math.cos(a) * r * 0.78, math.sin(a) * r * 0.78 * 1.05, r * 0.12)), r * 0.12, (1, 1, 1)) for a in (k / 36 * math.tau for k in range(36))]
        objs.append(O.blob('blue_rim', rim, m=M['blue'], res=0.01))
    else:
        objs.append(O.displace(O.blob('lids_shut', [(c, r * 1.25, (1, 1.05, 0.8)), (at((0, r * 0.3, r * 0.15)), r * 0.8, (1.1, 0.9, 0.7)),
                                                    (at((0, -r * 0.3, r * 0.15)), r * 0.8, (1.1, 0.9, 0.7))], m=M['bruise'], res=0.012), 0.02, 0.25, seed=5))
        lid_r = r * 0.68                                       # the shut seam, curving over the swollen lids
        seam = O.tube('seam', [at((math.cos(a) * lid_r, 0.04 * math.sin(a * 2), lid_r * 0.75 * math.sin(a) + r * 0.3)) for a in (0.5, 1.0, 1.57, 2.1, 2.6)],
                      [0.01, 0.016, 0.018, 0.016, 0.01], m=M['pupil'], res=6, segs=6)
        objs.append(seam)
        tear = O.blob('tear', [(at((0.0, r * 0.4, r * 0.4)) + Vector((0, -0.1, -0.05)), 0.06, (0.8, 1.3, 0.8)), (P(cx + 0.05, cy + 0.38, 0.05, comp=True), 0.07, (1, 1.2, 0.9))], m=M['acid'], res=0.008)
        objs.append(tear)
    return objs

def sac(M, hit, phase=0.0):
    cx, cy, r = SAC; objs = []
    c = P(cx, cy, 0.16, comp=True)
    stalk_pts = [P(1.12, -0.72, 0.18, comp=True), P(1.3, -0.8, 0.2, comp=True), c]
    objs.append(O.tube('stalk', stalk_pts, [0.2, 0.17, 0.14], m=M['mantle'] if not hit else M['shrivel'], res=6, segs=12))
    if not hit:
        R = r * 0.88 * (1 + 0.04 * math.sin(phase))
        skin = mn.sphere('sac_skin', R, loc=c, m=M['membrane'], scale=(1, 1.05, 0.92), segs=48); objs.append(skin)
        # the poison inside, its surface sloshing (a tilted cut), with glands and bubbles
        liq = mn.sphere('poison', R * 0.94, loc=c, m=M['poison'], scale=(1, 1.05, 0.9), segs=48)
        lvl = 0.15 * R + math.sin(phase) * 0.04
        tilt = Vector((math.sin(phase) * 0.25, math.cos(phase) * 0.1, 1)).normalized()
        bm = bmesh.new(); bm.from_mesh(liq.data)
        cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, 0, lvl), plane_no=tilt, clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=[e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge)])
        bm.to_mesh(liq.data); bm.free(); objs.append(liq)
        rnd = random.Random(4)
        for k, (gx, gy, gz, gr) in enumerate(((-0.35, 0.35, -0.2, 0.22), (0.3, 0.5, -0.3, 0.18), (0.1, -0.05, -0.1, 0.15))):
            s = 1 + 0.1 * math.sin(phase * 2 + gx * 9)
            objs.append(mn.sphere(f'gland{k}', R * gr * s, loc=c + Vector((O.S * gx * R, -gy * R, gz * R)), m=M['gland'], segs=16))
        for k in range(5):
            q = ((phase / math.tau) + k / 5) % 1
            objs.append(mn.sphere(f'bubble{k}', 0.02 + 0.01 * (k % 2), loc=c + Vector((O.S * (-0.4 + k * 0.2) * R, 0.1 * R * (k % 3 - 1), (-0.7 + q * 0.85) * R)), m=M['membrane'], segs=10))
        q = (phase / math.tau) % 1                         # the drop forming at its tip
        objs.append(O.blob('drop', [(c + Vector((O.S * 0.1 * R, -1.0 * R, -0.25 * R)), 0.05 + 0.03 * q, (1, 1.2, 1.1)),
                                    (c + Vector((O.S * 0.08 * R, -0.85 * R, -0.15 * R)), 0.04, (1, 1, 1))], m=M['acid'], res=0.006))
        ring = [(c + Vector((math.cos(a) * R * 0.98 * O.S, math.sin(a) * R * 1.03, 0.0)), 0.035, (1, 1, 1)) for a in (k / 28 * math.tau for k in range(28))]
        objs.append(O.blob('sac_rim', ring, m=M['blue'], res=0.008))
    else:
        R = r * 0.62
        sk = O.blob('sac_dead', [(c, R, (1, 1.05, 0.7)), (c + Vector((0, -R * 0.4, -R * 0.2)), R * 0.6, (1, 1, 0.6))], m=M['shrivel'], res=0.012)
        sk = O.displace(sk, 0.05, 0.12, seed=7); objs.append(sk)
        objs.append(O.blob('leak', [(c + Vector((O.S * 0.05, -R * 1.1, -0.06)), 0.05, (1, 1.4, 0.9)), (c + Vector((O.S * 0.06, -R * 1.5, -0.12)), 0.04, (1, 1, 1))], m=M['acid'], res=0.006))
    return objs

def beak(M, open_k, hit):
    cx, cy, r = BEAK; objs = []
    base = P(cx, cy, 0.05, comp=True)
    ang = 0.7                                                  # pointing out and down, from between the arms
    d = Vector((O.S * math.cos(ang), -math.sin(ang), -0.15)).normalized()
    side = Vector((0, 0, 1)).cross(d).normalized()
    # lips: a fleshy ring around the mouth, rimmed with blue glow
    lip_m = M['mantle'] if not hit else M['bruise']
    ring = [(base + side * math.cos(a) * r * 0.8 + Vector((0, 0, 1)) * math.sin(a) * r * 0.55 - d * 0.05, r * 0.36, (1, 1, 1)) for a in (k / 20 * math.tau for k in range(20))]
    objs.append(O.blob('lips', ring, m=lip_m, res=0.015))
    if not hit:
        rim = [(base + side * math.cos(a) * r * 0.78 + Vector((0, 0, 1)) * math.sin(a) * r * 0.52 + d * 0.06, r * 0.09, (1, 1, 1)) for a in (k / 24 * math.tau for k in range(24))]
        objs.append(O.blob('beak_rim', rim, m=M['blue'], res=0.008))
    objs.append(mn.sphere('mouth', r * 0.55, loc=base + d * 0.02, m=M['throat'], scale=(1, 1, 0.8), segs=20))
    R0 = r * 1.5
    for sd in (-1, 1):                                        # upper and lower jaw: curved, hooked
        a = sd * (0.15 + open_k * 0.55)
        rot = Matrix.Rotation(a * O.S, 3, 'Z')
        dd = rot @ d; ss = rot @ side
        pts = [(-0.3, 0.0), (0.1, sd * 0.32), (0.55, sd * 0.36), (0.88, sd * 0.18), (1.0, -sd * 0.04)]
        bp = [base + dd * (u * R0) + ss * (v * R0) * O.S * -1 + Vector((0, 0, 0.1 + 0.03 * sd)) for u, v in pts]
        rad = [0.1, 0.11, 0.08, 0.05, 0.012]
        m_ = M['chitin_dead'] if hit else (M['chitin'] if sd < 0 else M['chitin2'])
        j = O.tube(f'jaw{sd}', bp, [x * 1.45 for x in rad], m=m_, res=6, segs=12)
        for v in j.data.vertices:                             # flatten sideways a little: a blade, not a horn
            rel = v.co - base; z = rel.dot(Vector((0, 0, 1)))
            v.co = v.co - Vector((0, 0, 1)) * z * 0.25
        objs.append(j)
    if hit:                                                   # a crack across the upper jaw
        objs.append(O.tube('crack', [base + d * 0.12 + side * 0.08 + Vector((0, 0, 0.14)), base + d * 0.25 + Vector((0, 0, 0.14)), base + d * 0.3 - side * 0.06 + Vector((0, 0, 0.13))],
                           [0.012, 0.014, 0.01], m=M['pupil'], res=4, segs=6))
    elif open_k > 0.3:                                        # acid welling up between the jaws
        g = (3 + open_k * 3) / 48
        objs.append(O.blob('acid', [(base + d * (r * 1.0), g * 1.4, (1, 1, 0.8)), (base + d * (r * 0.6), g, (1, 1, 0.8))], m=M['acid'], res=0.008))
    return objs

def halo(name, cx, cy, rr, M):
    return O.disc(name, P(cx, cy, -0.02, comp=True), rr, M['halo'], sy=0.85)

# ---------------------------------------------------------------------------------------------------------
# Renders
# ---------------------------------------------------------------------------------------------------------
def frame_keys(sets, frames):
    scene = bpy.context.scene
    for f in frames:
        scene.frame_set(f)
        for j, objs in enumerate(sets):
            for o in objs: o.hide_render = j != frames.index(f); o.keyframe_insert('hide_render', frame=f)

def build_body(M, frames):
    static, man = body_static(M)
    sets = []
    for f in frames:
        ph = (f - frames[0]) / len(frames) * math.tau
        objs = []
        for i in range(6):
            objs += arm(f'arm{f}_{i}', arm_path(i, ph), 0.135, 0.0375, M['arm'], M['sucker'])
        for sd in (-1, 1):
            objs.append(fin(f'fin{f}_{sd}', sd, ph, M))
        sets.append(objs)
    return static, man, sets

def outline_body(static, sets):
    mn.outline([o for o in static if not o.name.startswith(('photo', 'far_'))], thickness=0.02)
    for objs in sets:
        mn.outline([o for o in objs if '_sucker' not in o.name], thickness=0.016)

def render_side(side, what):
    O.set_side(side); T0 = time.time()
    mn.reset(); M = mats()
    static, man, sets = build_body(M, FR)
    outline_body(static, sets)
    fins0 = [o for o in sets[0] if o.name.startswith('fin')]
    allb = static + [o for s in sets for o in s]
    if 'body' in what:
        frame_keys(sets, FR)
        mn.render(f'organic/grappler_{side}', objs=allb, frames=FR)
        print(f'[grappler] {side} body {time.time() - T0:.1f}s'); T0 = time.time()
    # everything else: the body hidden except the mantle (+ static bits) and the frame-0 fins as holdout
    for o in allb: o.animation_data_clear()
    for s in sets[1:]: O.show(s, False)
    for o in sets[0]: o.hide_render = not o.name.startswith('fin')
    hold = static + fins0
    O.holdout(hold, True)
    if 'grab' in what:
        for k in range(5):
            coil = k / 4; kk = 0.5 + coil * 0.5; pts = []
            for j in range(17):
                u = j / 16; a = -1.2 + u * (2.0 + coil * 2.6)
                pts.append((0.6 + math.cos(a) * (0.4 + u * 1.0) * kk + u * 0.4, 1.6 - math.sin(a) * (0.4 + u * 1.0) * kk + u * 0.6, -0.02 + coil * 0.3 * u))
            g = arm(f'grab{k}', pts, 0.19, 0.0625, M['grab'], M['sucker'])
            mn.outline([o for o in g if '_sucker' not in o.name], thickness=0.016)
            mn.render(f'organic/grappler_{side}_grab_c{k}', objs=g)
            O.show(g, False)
    if 'organs' in what:
        def go(name, objs, halos=None):
            mn.outline([o for o in objs if not o.name.startswith(('cornea', 'pupil', 'iris', 'blue', 'beak_rim', 'sac_rim', 'bubble', 'gland', 'poison', 'mouth', 'seam', 'crack', 'drop', 'leak', 'acid', 'tear'))], thickness=0.014)
            if halos: O.render_with_halo(name, objs, halos)
            else: mn.render(name, objs=objs)
            O.show(objs + (halos or []), False)
        for hit in (False, True):
            st = 'hit' if hit else 'ok'
            go(f'organic/grappler_{side}_eye_{st}', eye(M, hit), None if hit else [halo('halo_eye', EYE[0], EYE[1], EYE[2] * 2.1, M)])
        # sac: 4 slosh frames
        sets_ = []
        for f in range(4):
            objs = sac(M, False, f / 4 * math.tau)
            mn.outline([o for o in objs if o.name.startswith(('stalk', 'sac_skin'))], thickness=0.014)
            sets_.append(objs)
        hl = [halo('halo_sac', SAC[0], SAC[1], SAC[2] * 2.1, M)]
        F4 = [1, 2, 3, 4]; frame_keys(sets_, F4)
        allo = [o for s in sets_ for o in s]
        O.show(hl, True); mn.render(f'organic/grappler_{side}_sac_ok', objs=allo + hl, frames=F4, passes=('beauty',))
        O.show(hl, False); mn.render(f'organic/grappler_{side}_sac_ok', objs=allo + hl, frames=F4, passes=('normal', 'height'))
        for o in allo: o.animation_data_clear(); o.hide_render = True
        go(f'organic/grappler_{side}_sac_hit', sac(M, True))
        # beak: 4 open stages, and hit
        sets_ = []
        for f in range(4):
            objs = beak(M, f / 3, False)
            mn.outline([o for o in objs if o.name.startswith(('lips', 'jaw'))], thickness=0.014)
            sets_.append(objs)
        hl = [halo('halo_beak', BEAK[0], BEAK[1], BEAK[2] * 2.1, M)]
        frame_keys(sets_, F4); allo = [o for s in sets_ for o in s]
        O.show(hl, True); mn.render(f'organic/grappler_{side}_beak_ok', objs=allo + hl, frames=F4, passes=('beauty',))
        O.show(hl, False); mn.render(f'organic/grappler_{side}_beak_ok', objs=allo + hl, frames=F4, passes=('normal', 'height'))
        for o in allo: o.animation_data_clear(); o.hide_render = True
        go(f'organic/grappler_{side}_beak_hit', beak(M, 0.0, True))
    O.holdout(hold, False)
    print(f'[grappler] {side} parts {time.time() - T0:.1f}s')

def render_plate():
    mn.reset(); O.set_side('port')
    hull = O.plain('plate', '#8a93a5', 0.45, 0.3); dark = O.plain('plate_dark', '#2b303a', 0.6); slime = O.emit_mat('plate_slime', '#9cff5a', 0.6, base='#5fd12a', coat=1.0)
    W, H = 24 / 48, 18 / 48
    pts = []
    for k in range(40):                                       # rounded rectangle with two bites out of one side
        a = k / 40 * math.tau; c, s = math.cos(a), math.sin(a)
        x = W / 2 * math.copysign(abs(c) ** 0.25, c); y = H / 2 * math.copysign(abs(s) ** 0.25, s)
        for bx, by, br in ((12 / 48, -3 / 48, 6 / 48), (8 / 48, 8 / 48, 5 / 48)):
            dx, dy = x - bx, y - by; d = math.hypot(dx, dy)
            if d < br: x, y = bx + dx / d * br, by + dy / d * br
        pts.append((x, -y))
    p = O.poly_prism('plate', pts, -0.03, 0.03, hull, bevel=0.008)
    md = p.modifiers.new('bend', 'SIMPLE_DEFORM'); md.deform_method = 'BEND'; md.angle = 0.5; md.deform_axis = 'Y'
    p = O.bake(p)
    objs = [p]
    for x, y in ((-8 / 48, -6 / 48), (-8 / 48, 3 / 48)):
        objs.append(mn.cyl('hole', 0.03, 0.01, loc=(x + 1.5 / 48, -(y + 1.5 / 48), 0.03), m=dark, verts=6, bevel=0))
    objs.append(O.blob('slime', [((0.1, 0.0, 0.03), 0.07, (1.5, 1, 0.4)), ((0.16, -0.08, 0.02), 0.05, (1, 1, 0.5))], m=slime, res=0.008))
    mn.outline(objs[:1], thickness=0.012)
    mn.render('organic/grappler_plate', objs=objs)

if __name__ == '__main__':
    T = time.time()
    sel = [a for a in O.ARGS if a not in ('quick', 'cpu')]
    sides = [s for s in ('port', 'star') if s in sel] or ['port', 'star']
    what = [w for w in ('body', 'grab', 'organs', 'plate') if w in sel] or ['body', 'grab', 'organs', 'plate']
    for side in sides:
        if set(what) - {'plate'}: render_side(side, what)
    if 'plate' in what: render_plate()
    print(f'[grappler] total {time.time() - T:.1f}s')
