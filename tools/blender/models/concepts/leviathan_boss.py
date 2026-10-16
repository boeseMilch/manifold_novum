"""CONCEPT MOCK-UP (not a game sprite): the final boss of chapter 8 "The Mother of All": the INFESTED LEVIATHAN.

The leviathan isn't evil, it's sick: leeches have burrowed into its hide (glowing yellow-green "infested zones"
crawling with leeches). It travels round our ship one side at a time (front -> left -> right ... -> behind);
the crew blasts the infestation off; at the end, freed, it sinks away into the deep.

Game coordinates as js/ship.js (x right, y down the screen, ship body x 0..44.4, y -3.2..26.1); Blender
(x, -y, z), the game camera (mn: orthographic, 50 deg). ~130 units long: 3 ship widths, 4-5 ship lengths.

    blender -b --factory-startup --python tools/blender/models/concepts/leviathan_boss.py -- <out_dir> <mode> [samples] [ppu]

mode  keyart : swimming down our LEFT flank (phase 1), <out_dir>/keyart_lev.png + .json (projection, points)
      details: a straight pose for close-ups (zones before / after, the eye open, the back nest burning),
               details_lev.png + .json; the brood crawler alone, crawler.png (+ .json)
      behind : lying across behind our stern (phase 4), behind_lev.png + .json
Writes only to <out_dir>: never build/renders or the manifest.
"""
import sys, os, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'organic'))
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
import mn
import orglib as O
import leviathan as LV
import leech as LE

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = A[0] if A else '/tmp/mn_concept_leviathan'
MODE = A[1] if len(A) > 1 else 'keyart'
mn.SAMPLES = int(A[2]) if len(A) > 2 else 24
PPU = float(A[3]) if len(A) > 3 else 20
Z = Vector((0, 0, 1))

def G(gx, gy, z=0.0): return Vector((gx, -gy, z))

# ---------------------------------------------------------------------------------------------------
# the spine: a Catmull-Rom curve through game points, resampled by arc length
# ---------------------------------------------------------------------------------------------------
class Spine:
    def __init__(self, pts, inner_sign=1):
        P_ = [G(*p) for p in pts]; P_ = [P_[0] * 2 - P_[1]] + P_ + [P_[-1] * 2 - P_[-2]]
        dense = []
        for i in range(1, len(P_) - 2):
            p0, p1, p2, p3 = P_[i - 1], P_[i], P_[i + 1], P_[i + 2]
            for k in range(40):
                t = k / 40
                dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        dense.append(P_[-2])
        self.d = dense; self.s = [0.0]
        for a, b in zip(dense, dense[1:]): self.s.append(self.s[-1] + (b - a).length)
        self.L = self.s[-1]; self.sg = inner_sign
    def at(self, u):
        """centre, forward tangent (towards the TAIL), inner side (horizontal, towards our ship)"""
        s = max(0.0, min(1.0, u)) * self.L
        import bisect
        i = min(max(bisect.bisect_right(self.s, s) - 1, 0), len(self.d) - 2)
        a, b = self.d[i], self.d[i + 1]; seg = self.s[i + 1] - self.s[i]
        t = (s - self.s[i]) / seg if seg else 0
        T = (b - a).normalized(); side = Z.cross(T) * self.sg
        return a + (b - a) * t, T, side.normalized()

def interp(u, us, vs):
    if u <= us[0]: return vs[0]
    for i in range(1, len(us)):
        if u <= us[i]:
            t = (u - us[i - 1]) / (us[i] - us[i - 1]); t = t * t * (3 - 2 * t)
            return vs[i - 1] + (vs[i] - vs[i - 1]) * t
    return vs[-1]

WU = [0, 0.006, 0.025, 0.06, 0.12, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 0.97, 1.0]
WV = [0.0, 3.4, 7.0, 9.4, 10.8, 11.4, 10.8, 9.2, 6.6, 4.0, 2.3, 1.5, 0.6]
def width(u): return interp(u, WU, WV)
def height(u): return width(u) * interp(u, [0, 0.1, 0.4, 1], [0.66, 0.62, 0.58, 0.55])

def surf_analytic(sp, u, th):
    """Point and normal on the (undisplaced) body: th = 0 inner flank (towards the ship), 90 up, 180 outer flank, 270 belly."""
    c, T, side = sp.at(u); w = width(u); h = height(u); d = 0.5 * w; a = math.radians(th)
    cs, sn = math.cos(a), math.sin(a)
    hh = h if sn >= 0 else d
    p = c + side * (w * cs) + Z * (hh * sn)
    n = (side * (cs / max(w, 0.1)) + Z * (sn / max(hh, 0.1))).normalized()
    return p, n, T, side

def surf(body, sp, u, th, lift=0.0):
    p, n, T, side = surf_analytic(sp, u, th)
    hit, loc, nn, _ = body.ray_cast(p + n * 4.0, -n)
    if hit and (loc - p).length < 3.0:
        if nn.dot(n) < 0: nn = -nn                     # (the hide's faces point inwards)
        return loc + nn * lift, nn, T, side
    return p + n * lift, n, T, side

# ---------------------------------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------------------------------
def mats():
    M = dict(
        skin=O.flesh('lb_skin', '#0d2230', '#2a5a70', c2='#04090e', veins='#3a8a9a', vein_k=0.3, scale=0.12, rough=0.5, coat=0.35,
                     sss=0.05, bump=0.6, mottle=1.4, belly='#8aa8b8', belly_axis=(0, 0, -1), belly_k=0.8, speckle=('#8aa6b0', 0.7, 0.12, 0.45)),
        fin=O.flesh('lb_fin', '#0e2434', '#2a5a72', c2='#050a10', veins='#48a8c0', vein_k=0.45, scale=0.3, coat=0.7, mottle=1.2,
                    speckle=('#8aa6b0', 1.0, 0.12, 0.4)),
        ray=O.emit_mat('lb_ray', '#5ae0ff', 0.9, base='#2a7a90'),
        spot=O.emit_mat('lb_spot', '#7af0ff', 1.5, base='#3ac0d8', coat=1.0),
        spot_sick=O.emit_mat('lb_spot_sick', '#8a9a3a', 0.35, base='#3a4020', coat=1.0),
        barn=O.flesh('lb_barn', '#8a9486', '#c8ccbc', c2='#3a4038', scale=2, rough=0.7, coat=0.1, bump=1.0),
        barn_in=O.plain('lb_barn_in', '#1a1e1a', 0.8),
        scar=O.plain('lb_scar', '#8aa0ae', 0.5, coat=0.3),
        lip=O.plain('lb_lip', '#071018', 0.5, coat=0.4),
        glint=O.emit_mat('lb_glint', '#fff8d0', 1.2),
        lid=O.flesh('lb_lid', '#123040', '#2e5a70', c2='#050a10', scale=0.5, coat=0.7),
        # the infection
        rim=O.flesh('lb_rim', '#4a1424', '#a8444a', c2='#1a0408', veins='#f0ff50', vein_k=0.75, scale=1.2, rough=0.3, coat=0.9,
                    sss=0.3, sss_col=(1.0, 0.4, 0.3), bump=0.8, mottle=1.3),
        pus=O.emit_mat('lb_pus', '#b8f020', 1.1, base='#a0d020', coat=1.0),
        pustule=O.emit_mat('lb_pustule', '#ffc818', 0.9, base='#f0d040', rough=0.1, coat=1.0),
        vein=O.emit_mat('lb_vein', '#c8f03a', 1.1, base='#6a7a10'),
        # after the blast
        char=O.flesh('lb_char', '#0a0806', '#2a1c14', c2='#000000', scale=1.5, rough=0.9, coat=0.0, bump=1.2, mottle=1.5),
        ember=O.emit_mat('lb_ember', '#ff6a1a', 1.3, base='#4a1a08'),
        raw=O.flesh('lb_raw', '#8a3a4a', '#d87a8a', c2='#3a1018', scale=1.2, rough=0.3, coat=0.9, sss=0.4, sss_col=(1, 0.3, 0.3)),
        dead_vein=O.plain('lb_dvein', '#1a1610', 0.8),
        burn=O.emit_mat('lb_burn', '#ffa030', 1.5, base='#ff6a1a'),
        # the brood crawler
        grub=O.flesh('lb_grub', '#8a9a5a', '#d8e0a0', c2='#3a4020', veins='#e8ff6a', vein_k=0.3, scale=6, rough=0.25, coat=0.9,
                     sss=0.5, sss_col=(0.8, 1.0, 0.4), bump=0.4, belly='#f0f0c0', belly_axis=(0, 0, -1), belly_k=0.6),
        grub_leg=O.plain('lb_grub_leg', '#4a3a2a', 0.4, coat=0.5),
    )
    M.update({'leech_' + k: v for k, v in LE.mats().items()})
    return M

def LM(M): return {k[6:]: v for k, v in M.items() if k.startswith('leech_')}

# ---------------------------------------------------------------------------------------------------
# the body
# ---------------------------------------------------------------------------------------------------
def body(sp, M, quick):
    NU = 160 if quick else 280; NR = 48 if quick else 72
    me = bpy.data.meshes.new('lb'); bm = bmesh.new(); rings = []
    us = [0.5 - 0.5 * math.cos(i / NU * math.pi) for i in range(NU + 1)]
    us = [u ** 1.15 for u in us]                       # (denser at the head)
    us[0] = 0.0005; us[-1] = 0.9995
    for u in us:
        c, T, side = sp.at(u); w = max(width(u), 0.05); h = height(u); d = 0.5 * w
        row = []
        for i in range(NR):
            th = i / NR * math.tau; cs, sn = math.cos(th), math.sin(th)
            x = w * math.copysign(abs(cs) ** 0.9, cs)
            z = h * abs(sn) ** 0.85 if sn >= 0 else -d * abs(sn) ** 0.9
            # a low dorsal ridge
            if sn > 0: z += 0.06 * w * math.exp(-((th - math.pi / 2) / 0.18) ** 2)
            row.append(bm.verts.new(c + side * x + Z * z))
        rings.append(row)
    for j in range(len(rings) - 1):
        for i in range(NR):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % NR], rings[j + 1][(i + 1) % NR], rings[j + 1][i]))
    for row, u in ((rings[0], us[0]), (rings[-1], us[-1])):
        c = bm.verts.new(sp.at(u)[0])
        for i in range(NR): bm.faces.new((row[i], row[(i + 1) % NR], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('lb_body', me)); mn.smooth(o)
    o = O.subdiv(o, 1)
    O.noise_displace(o, [(0.5, 0.09, 11), (0.12, 0.7, 12)])
    mn.assign(o, M['skin'])
    return o

def eye(M, body, sp, inner, state, u=0.07, th=34, sc=(3.4, 2.4, 1.0)):
    """The big eye on the flank (inner=True: the side facing our ship); state open / half / shut."""
    side_th = th if inner else 180 - th
    loc, n, T, side = surf(body, sp, u, side_th)
    axis = (n + Z * 0.9).normalized()
    fw = (-T - axis * axis.dot(-T)).normalized()            # local x: towards the head
    yl = axis.cross(fw)
    q = Matrix((fw, yl, axis)).transposed().to_quaternion()
    c = loc + n * 0.05; R = q.to_matrix()
    O.S = 1
    objs = []
    ball = mn.sphere('lb_eye', 1.0, loc=c, m=M['eyeball'], scale=sc, segs=64)
    ball.rotation_mode = 'QUATERNION'; ball.rotation_quaternion = q; objs.append(ball)
    def on_ball(a, b, lift=0.0):
        zz = sc[2] * math.sqrt(max(0.0, 1 - (a / sc[0]) ** 2 - (b / sc[1]) ** 2))
        return c + R @ Vector((a, b, zz + lift))
    objs.append(mn.sphere('lb_glint', 0.42, loc=on_ball(-0.9, 0.8, -0.02), m=M['glint'], scale=(1, 0.8, 0.25), segs=16))
    objs.append(mn.sphere('lb_glint', 0.18, loc=on_ball(-0.2, 1.2, -0.01), m=M['glint'], scale=(1, 0.8, 0.25), segs=12))
    rim = [(c + R @ Vector((math.cos(a) * sc[0] * 1.07, math.sin(a) * sc[1] * 1.09, 0.08)), 0.75, (1, 1, 0.75)) for a in (k / 40 * math.tau for k in range(40))]
    objs.append(O.blob('lb_eye_rim', rim, m=M['lid'], res=0.1))
    if state != 'open':
        cut = {'half': (0.55, -0.85), 'shut': (-0.1, -0.1)}[state]
        for sd, dd in ((1, cut[0]), (-1, cut[1])):
            lid = mn.sphere('lb_lid', 1.0, loc=(0, 0, 0), m=M['lid'], segs=48)
            bm = bmesh.new(); bm.from_mesh(lid.data)
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, dd, 0), plane_no=(0, sd, 0), clear_inner=True)
            bm.to_mesh(lid.data); bm.free()
            lid.scale = (sc[0] * 1.06, sc[1] * 1.08, sc[2] + 0.3); lid.location = c; lid.rotation_mode = 'QUATERNION'; lid.rotation_quaternion = q
            sol = lid.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.08
            objs.append(lid)
    return objs, c

def mouth(M, body, sp):
    objs = []
    for th in (-12, 192):
        pts = []
        for k in range(26):
            u = 0.004 + k * 0.0026
            loc, n, T, side = surf(body, sp, u, th - (k / 25) * 6 * (1 if th < 90 else -1))
            pts.append(loc - n * 0.05)
        objs.append(O.tube('lb_mouth', pts, [0.22 * (1 - 0.5 * k / 25) for k in range(26)], m=M['lip'], res=2, segs=8))
    return objs

def pectorals(M, sp, u=0.15, span=18.0, sweep=55):
    objs = []
    for inner in (True, False):
        c, T, side = sp.at(u); sdv = side if inner else -side
        root = c + sdv * width(u) * 0.75 + Z * (-0.5)
        a = math.radians(sweep); dirv = (sdv * math.cos(a) + T * math.sin(a)).normalized()
        parts = []
        for k in range(18):
            t = k / 17
            p = root + dirv * (span * t) + T * (1.5 * t * t) - Z * (0.8 * t)
            parts.append((p, 3.6 * (1 - 0.6 * t), (1, 1, 0.25)))
        for k in range(8):                        # knobs on the leading edge (humpback tubercles)
            t = (k + 1) / 9
            p = root + dirv * (span * t) - T * (2.0 * (1 - 0.6 * t)) - Z * (0.8 * t - 0.15)
            parts.append((p, 0.8 * (1 - 0.4 * t), (1, 1, 0.7)))
        objs.append(O.blob('lb_pect', parts, m=M['fin'], res=0.14))
    return objs

def dorsal(M, body, sp, u0=0.30, u1=0.43, H=8.0, holes=0, lean=0.0):
    """The tall dorsal sail (the FIN target): metaball columns flattened across the body, swept back, glowing rays.
    lean (degrees): it flops over towards the outer side (sick and tired), so the camera sees its face."""
    parts = []; rays = []; L = math.radians(lean)
    def basis(T, side):
        up = (Z * math.cos(L) - side * math.sin(L)).normalized(); nrm = (side * math.cos(L) + Z * math.sin(L)).normalized()
        return up, nrm
    for k in range(22):
        t = k / 21; u = u0 + (u1 - u0) * t
        loc, n, T, side = surf(body, sp, u, 90)
        up, nrm = basis(T, side)
        ht = H * math.sin(math.pi * min(1, t ** 0.75)) ** 0.8 * (1 - 0.25 * t)
        eul = Matrix((T, nrm, up)).transposed().to_euler()
        for j in range(7):
            v = j / 6
            p = loc + up * (ht * v - 0.3) + T * (ht * 0.55 * v * v)
            parts.append((p, 1.9 * (1 - 0.5 * v) + 0.3, (1.0, 0.32, 1.0), tuple(eul)))
        if k % 3 == 1 and ht > 1:
            rays.append(([loc + up * (ht * v - 0.2) + T * (ht * 0.55 * v * v) for v in (0, 0.3, 0.6, 0.85)], nrm))
    fin = O.blob('lb_dorsal', parts, m=M['fin'], res=0.12)
    out = [fin]
    for pts, nrm in rays:
        for sgn in (1, -1):
            out.append(O.tube('lb_ray', [p + nrm * sgn * 0.55 for p in pts], [0.14, 0.12, 0.1, 0.06], m=M['ray'], res=3, segs=6))
    # scorch holes (the front cannon's two hits)
    hp = []
    for h in range(holes):
        t = 0.35 + 0.3 * h; u = u0 + (u1 - u0) * t
        loc, n, T, side = surf(body, sp, u, 90); up, nrm = basis(T, side)
        ht = H * math.sin(math.pi * t ** 0.75) ** 0.8 * (1 - 0.25 * t)
        c_ = loc + up * (ht * 0.45) + T * (ht * 0.55 * 0.2) + nrm * 0.5
        eul = Matrix((T, nrm, up)).transposed().to_euler()
        d = mn.sphere('lb_hole', 1.0, loc=c_, m=M['char'], scale=(1.2, 0.15, 1.0), segs=20); d.rotation_euler = eul; out.append(d)
        e = mn.sphere('lb_hole_e', 1.0, loc=c_ + nrm * 0.08, m=M['ember'], scale=(0.5, 0.12, 0.45), segs=16); e.rotation_euler = eul
        out.append(e); hp.append(c_)
    return out, hp

def fluke(M, sp, span=10.0):
    c, T, side = sp.at(0.995)
    parts = [(c, 2.0, (1, 1, 0.45))]
    for sd in (-1, 1):
        for k in range(18):
            t = (k + 1) / 18
            p = c + side * (sd * span * t) + T * (1.0 + 5.0 * t ** 1.4) + Z * (0.3 * t)
            parts.append((p, 2.6 * (1 - 0.6 * t), (1, 1, 0.22)))
    return [O.blob('lb_fluke', parts, m=M['fin'], res=0.14)]

def spots(M, body, sp, zones, seed=4):
    """Bioluminescence: photophores scattered in drifts along the back, a dashed glowing lateral line on each flank,
    glowing gill slits behind the head. Near an infested zone they go dull and sickly."""
    rnd = random.Random(seed); objs = []
    def mat_at(loc):
        near_sick = min([(loc - z['c']).length - z['R'] for z in zones if z['state'] in ('infested', 'burning')] or [99])
        return M['spot_sick'] if near_sick < 5.0 else M['spot']
    def free(loc, pad=0.8): return min([(loc - z['c']).length - z['R'] for z in zones] or [99]) > pad
    # photophores: two loose bands either side of the spine, biggest towards the head
    u = 0.05
    while u < 0.9:
        for th0 in (62, 118):
            if rnd.random() < 0.2: continue
            th = th0 + rnd.uniform(-9, 9); uu = u + rnd.uniform(-0.004, 0.004)
            loc, n, T, side = surf(body, sp, uu, th)
            if not free(loc): continue
            rr = (0.32 + 0.4 * rnd.random()) * (0.6 + 0.4 * width(uu) / 11)
            s = mn.sphere('lb_spot', rr, loc=loc - n * 0.05, m=mat_at(loc), scale=(1, 1, 0.5), segs=16)
            s.rotation_mode = 'QUATERNION'; s.rotation_quaternion = n.to_track_quat('Z', 'Y'); objs.append(s)
            if rnd.random() < 0.35:                    # a small companion
                l2, n2, _, _ = surf(body, sp, uu + 0.006, th + rnd.uniform(-6, 6))
                if free(l2): objs.append(mn.sphere('lb_spot', rr * 0.5, loc=l2 - n2 * 0.03, m=mat_at(l2), scale=(1, 1, 0.5), segs=12))
        u += rnd.uniform(1.6, 3.2) / sp.L
    # gill slits behind the head (the gas comes out of here in phase 2)
    for th in (8, 172):
        for k in range(4):
            u = 0.105 + k * 0.012; pts = []
            for j in range(5):
                loc, n, T, side = surf(body, sp, u + 0.002 * j, th - 22 + 11 * j); pts.append(loc + n * 0.02)
            objs.append(O.tube('lb_gill', pts, [0.12, 0.2, 0.22, 0.2, 0.12], m=M['spot'], res=2, segs=6))
    return objs

def barnacles(M, body, sp, zones, n=40, seed=3):
    rnd = random.Random(seed); objs = []
    for c in range(n):
        u = rnd.uniform(0.04, 0.85); th = rnd.choice([rnd.uniform(40, 150), rnd.uniform(140, 200)])
        for k in range(rnd.randint(5, 13)):
            loc, nn, T, side = surf(body, sp, u + rnd.uniform(-0.012, 0.012), th + rnd.uniform(-9, 9))
            if any((loc - z['c']).length < z['R'] * 1.3 for z in zones): continue
            r = rnd.uniform(0.2, 0.5)
            cone = mn.cyl('lb_barn', r, r * 0.9, loc=(0, 0, 0), m=M['barn'], verts=10, bevel=0.0)
            for v in cone.data.vertices:
                if v.co.z > 0.01: v.co.x *= 0.45; v.co.y *= 0.45
            cone.matrix_world = Matrix.Translation(loc - nn * 0.08) @ nn.to_track_quat('Z', 'Y').to_matrix().to_4x4(); O.apply_tf(cone)
            objs.append(cone)
            objs.append(mn.sphere('lb_barn_in', r * 0.4, loc=loc + nn * r * 0.82, m=M['barn_in'], scale=(1, 1, 0.3), segs=8))
    for c in range(12):
        u = rnd.uniform(0.06, 0.8); th = rnd.uniform(30, 170); a = rnd.uniform(-0.5, 0.5); pts = []
        for t in range(9):
            loc, nn, T, side = surf(body, sp, u + t * 0.003 * math.cos(a), th + t * 3 * math.sin(a)); pts.append(loc - nn * 0.04)
        if not any((pts[4] - z['c']).length < z['R'] * 1.4 for z in zones):
            objs.append(O.tube('lb_scar', pts, [0.12] * 9, m=M['scar'], res=2, segs=6))
    return objs

def frame_at(loc, n, T):
    t = (T - n * n.dot(T)).normalized(); b = n.cross(t)
    return Matrix((t, b, n)).transposed()

LS = 2.0                                               # leeches on the giant: a bit bigger than the ones that hit our hull

def place_leech(objs, loc, n, T, ang, lift=0.12, k=LS):
    R3 = frame_at(loc, n, T) @ Matrix.Rotation(ang, 3, 'Z')
    mw = Matrix.Translation(loc + n * lift) @ R3.to_4x4() @ Matrix.Scale(k, 4)
    bpy.context.view_layer.update()                    # (fresh objects: matrix_world isn't set from loc until an update)
    for o in objs:
        o.matrix_world = mw @ o.matrix_world; O.apply_tf(o)
    return objs

def zone(M, body, sp, u, th, R, state, seed=1, flying=0):
    """One infested zone on the hide: a swollen glowing boil, pustules, veins crawling out, leeches latched on.
    state: infested | after (blasted clean: a charred crater, raw pink rim, dead veins) | burning (under the engine blast)."""
    rnd = random.Random(seed)
    loc, n, T, side = surf(body, sp, u, th)
    F_ = frame_at(loc, n, T); t1, t2 = F_.col[0], F_.col[1]
    objs = []
    def on(obj, a, r, lift=0.0):
        p = loc + (t1 * math.cos(a) + t2 * math.sin(a)) * r
        hit, l2, n2, _ = obj.ray_cast(p + n * 6, -n)
        if obj is not body:                       # the higher of the boil and the hide
            h2, l3, n3, _ = body.ray_cast(p + n * 6, -n)
            if h2 and (not hit or (l3 - l2).dot(n) > 0): hit, l2, n2 = h2, l3, n3
        if hit and n2.dot(n) < 0: n2 = -n2
        return (l2 + n2 * lift, n2, True) if hit else (p + n * lift, n, False)
    sick = state in ('infested', 'burning')
    # the swollen boil (infested) or the flattened, raw wound (after)
    parts = []
    for k in range(7 if sick else 1):
        a = rnd.uniform(0, math.tau); r = R * (0.15 + 0.5 * rnd.random()) if k else 0.0
        p, nn, _ = on(body, a, r, 0.1 if sick else 0.15)
        parts.append((p, R * rnd.uniform(0.6, 0.75) * (1 if sick else 2.1), (1, 1, 0.45 if sick else 0.18)))
    for k in range(12 if sick else 0):
        a = k / 12 * math.tau; p, nn, _ = on(body, a, R * (0.95 + 0.1 * math.sin(a * 3 + seed)), -0.25)
        parts.append((p, R * 0.32 * (1 + 0.25 * rnd.random()), (1, 1, 0.5)))
    mound = O.blob('lb_zone_rim', parts, m=M['rim'] if sick else M['raw'], res=0.12)
    objs.append(mound); bpy.context.view_layer.update()
    # the glowing crater of pus (or char)
    pool = []
    for k in range(9):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0, R * 0.45)
        p, nn, _ = on(mound, a, r, 0.15 if sick else -0.12)
        pool.append((p, R * rnd.uniform(0.3, 0.42), (1, 1, 0.4)))
    if not sick:                                       # a flat charred crater
        p, nn, _ = on(mound, 0, 0, -0.02)
        c_ = mn.sphere('lb_zone_pool', R * 0.42, loc=p, m=M['char'], scale=(1, 1, 0.12), segs=32)
        c_.rotation_mode = 'QUATERNION'; c_.rotation_quaternion = nn.to_track_quat('Z', 'Y'); objs.append(c_); pool = []
    if pool: objs.append(O.blob('lb_zone_pool', pool, m={'infested': M['pus'], 'burning': M['burn'], 'after': M['char']}[state], res=0.1))
    if state == 'after':
        for k in range(12):
            a = rnd.uniform(0, math.tau); r = rnd.uniform(0, R * 0.8); p, nn, _ = on(mound, a, r, 0.02)
            objs.append(mn.sphere('lb_ember', rnd.uniform(0.1, 0.25), loc=p, m=M['ember'], scale=(1, 1, 0.4), segs=10))
    if sick:
        for k in range(rnd.randint(12, 16)):
            a = rnd.uniform(0, math.tau); r = rnd.uniform(0.35, 1.0) * R; p, nn, _ = on(mound, a, r, -0.05)
            rr = rnd.uniform(0.35, 0.8)
            s = mn.sphere('lb_pustule', rr, loc=p, m=M['pustule'] if state == 'infested' else M['burn'], scale=(1, 1, 0.8), segs=18)
            s.rotation_mode = 'QUATERNION'; s.rotation_quaternion = nn.to_track_quat('Z', 'Y'); objs.append(s)
    # veins crawling out over the hide: glowing (sick) or dead and dark (after)
    for k in range(9):
        a = k / 9 * math.tau + rnd.uniform(-0.2, 0.2); pts = []; r = R * 0.95; aa = a
        for j in range(rnd.randint(5, 8)):
            p, nn, ok = on(body, aa, r, -0.03)
            if not ok: break
            pts.append(p); r += R * rnd.uniform(0.14, 0.24); aa += rnd.uniform(-0.2, 0.2)
        if len(pts) < 4: continue
        rad = [(0.24 if sick else 0.16) * (1 - 0.8 * j / (len(pts) - 1)) for j in range(len(pts))]
        objs.append(O.tube('lb_vein', pts, rad, m=M['vein'] if sick else M['dead_vein'], res=2, segs=6))
    lm = LM(M); lee = []
    nl = {'infested': rnd.randint(6, 8), 'burning': 4, 'after': 0}[state]
    for k in range(nl):
        a = k / nl * math.tau + rnd.uniform(-0.3, 0.3); r = rnd.uniform(0.45, 0.95) * R; p, nn, _ = on(mound, a, r, 0.0)
        ob = LE.leech(f'lb_lch{seed}_{k}', rnd.uniform(0, math.tau), True, lm)
        place_leech(ob, p, nn, T, a + math.pi + rnd.uniform(-1.3, 1.3), lift=0.05); lee += ob
    fly = []
    for k in range(flying):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.3, 1.0) * R; p, nn, _ = on(mound, a, r, rnd.uniform(2.0, 5.0))
        ob = LE.leech(f'lb_fly{seed}_{k}', rnd.uniform(0, math.tau), False, lm)
        R3 = Matrix.Rotation(rnd.uniform(0, math.tau), 3, 'Z') @ Matrix.Rotation(rnd.uniform(-0.8, 0.8), 3, 'X')
        mw = Matrix.Translation(p + (t1 * math.cos(a) + t2 * math.sin(a)) * rnd.uniform(1.0, 3.5)) @ R3.to_4x4() @ Matrix.Scale(LS, 4)
        bpy.context.view_layer.update()
        for o in ob: o.matrix_world = mw @ o.matrix_world; O.apply_tf(o)
        fly += ob
    if False:                                             # a couple of dead ones, curled up, drifting off
        for k in range(2):
            a = rnd.uniform(0, math.tau); p, nn, _ = on(body, a, R * 1.3, 1.5 + k)
            ob = LE.leech(f'lb_dead{seed}_{k}', 1.0, False, lm)
            for o in ob:
                if '_spot' in o.name or '_throat' in o.name: o.data.materials[0] = M['dead_vein']
            mw = Matrix.Translation(p) @ Matrix.Rotation(rnd.uniform(0, 6), 4, 'Z') @ Matrix.Rotation(2.6, 4, 'X') @ Matrix.Scale(LS, 4)
            for o in ob: o.matrix_world = mw @ o.matrix_world; O.apply_tf(o)
            fly += ob
    return objs, lee + fly, {'c': loc, 'n': n, 'R': R, 'state': state, 'u': u, 'th': th}

def blowholes(M, body, sp, u=0.11):
    objs = []
    for sd in (-1, 1):
        loc, n, T, side = surf(body, sp, u, 90 + sd * 9)
        objs.append(mn.sphere('lb_blow', 0.55, loc=loc + n * 0.02, m=M['lip'], scale=(1.6, 0.8, 0.3), segs=16))
        objs[-1].rotation_euler = (0, 0, math.atan2(T.y, T.x))
    return objs

def creature(sp, M, quick, zone_specs, eye_state='half', fin_holes=0, eyes=(True, False), lean=0.0):
    b = body(sp, M, quick)
    zones = []; zobjs = []; leeches = []
    for zs in zone_specs:
        o, l, info = zone(M, b, sp, **zs); zobjs += o; leeches += l; zones.append(info)
    det = []
    eye_c = {}
    for inner in eyes:
        objs, c = eye(M, b, sp, inner, eye_state); det += objs; eye_c['inner' if inner else 'outer'] = c
    det += mouth(M, b, sp) + blowholes(M, b, sp)
    fins = pectorals(M, sp) + fluke(M, sp)
    dfin, holes = dorsal(M, b, sp, holes=fin_holes, lean=lean); fins += dfin
    det += spots(M, b, sp, zones) + barnacles(M, b, sp, zones)
    mn.outline([b] + [o for o in fins if o.name.startswith(('lb_pect', 'lb_fluke', 'lb_dorsal'))], thickness=0.07)
    mn.outline([o for o in det if o.name.startswith(('lb_eye_rim', 'lb_lid'))] + [o for o in zobjs if 'rim' in o.name], thickness=0.04)
    mn.outline([o for o in leeches if '_spot' not in o.name and '_throat' not in o.name and '_tooth' not in o.name], thickness=0.02)
    return dict(body=b, zones=zones, eye=eye_c, holes=holes, objs=[b] + zobjs + leeches + det + fins)

# ---------------------------------------------------------------------------------------------------
# the brood crawler: a leech larva that squeezes in through the engine vents (~0.7 long, crew ~0.6 wide)
# ---------------------------------------------------------------------------------------------------
def crawler(M, at=Vector((0, 0, 0)), ang=0.0, phase=0.0):
    """The brood: a fat segmented larva (~0.75 long, crew ~0.6 wide), pale and translucent, a leech's sucker mouth
    with hooked teeth at the front, stubby claw legs, the infection glowing in bulbs along its back. Head = +x."""
    objs = []; segs = []
    for k in range(9):
        u = k / 8; x = 0.28 - 0.62 * u; y = math.sin(phase - u * 3) * 0.035 * u
        r = 0.14 * (1 - 0.55 * u ** 1.3) * (0.85 if k == 0 else 1)
        z = 0.13 + 0.03 * math.sin(u * math.pi)
        segs.append(((x, y, z), r))
    body = O.blob('lb_grub', [(c, r, (0.75, 1, 0.85)) for c, r in segs], m=M['grub'], res=0.012, threshold=0.6)
    objs.append(body)
    # stubby claw legs: 5 pairs under the front segments
    for k in range(1, 6):
        (x, y, z), r = segs[k]
        for sd in (-1, 1):
            leg = O.tube('lb_grub_leg', [(x, y + sd * r * 0.7, z - r * 0.5), (x + 0.03, y + sd * r * 1.15, z - r * 0.7), (x + 0.06, y + sd * r * 1.25, 0.03)],
                         [0.022, 0.016, 0.008], m=M['grub_leg'], res=3, segs=6)
            objs.append(leg)
    # the sucker: a fleshy ring with teeth around a glowing throat, facing forward and a bit up
    (hx, hy, hz), hr = segs[0]
    face = Matrix.Translation((hx + hr * 0.55, hy, hz + 0.01)) @ Matrix.Rotation(math.pi / 2 - 0.5, 4, 'Y')
    ring = [((math.cos(a) * hr * 0.6, math.sin(a) * hr * 0.6, 0), hr * 0.32, (1, 1, 0.8)) for a in (k / 12 * math.tau for k in range(12))]
    lip = O.blob('lb_grub_lip', ring, m=M['leech_lip'], res=0.01); lip.matrix_world = face; O.apply_tf(lip); objs.append(lip)
    thr = mn.sphere('lb_grub_mouth', hr * 0.45, loc=(0, 0, 0), m=M['leech_throat'], scale=(1, 1, 0.3), segs=16)
    thr.matrix_world = face; O.apply_tf(thr); objs.append(thr)
    for k in range(10):
        a = k / 10 * math.tau
        t = mn.cyl('lb_grub_tooth', hr * 0.06, hr * 0.22, loc=(0, 0, 0), m=M['leech_tooth'], verts=6, bevel=0.0)
        for v in t.data.vertices:
            kk = v.co.z / (hr * 0.22); v.co.x *= (1 - kk); v.co.y *= (1 - kk)
        t.matrix_world = face @ Matrix.Translation((math.cos(a) * hr * 0.5, math.sin(a) * hr * 0.5, hr * 0.05)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.6, 4, 'Y')
        O.apply_tf(t); objs.append(t)
    # infected bulbs along the back
    for k in (2, 3, 4, 5):
        (x, y, z), r = segs[k]
        objs.append(mn.sphere('lb_grub_bulb', r * 0.5, loc=(x, y, z + r * 0.62), m=M['pustule'], scale=(1, 1, 0.75), segs=16))
    mw = Matrix.Translation(at) @ Matrix.Rotation(ang, 4, 'Z')
    bpy.context.view_layer.update()
    for o in objs: o.matrix_world = mw @ o.matrix_world; O.apply_tf(o)
    mn.outline([o for o in objs if o.name.startswith(('lb_grub', 'lb_grub_lip')) and 'bulb' not in o.name and 'mouth' not in o.name and 'tooth' not in o.name], thickness=0.01)
    return objs

# ---------------------------------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------------------------------
def scr(p, ox, oy):
    x, y = mn._screen(p); return [round(ox + x * mn.PPU, 1), round(oy - y * mn.PPU, 1)]

def setup():
    s = mn.reset(); s.cycles.device = 'CPU'
    # deep-sea ambience: a cold teal fill from below/behind, on top of the usual rig
    d = bpy.data.lights.new('abyss', 'SUN'); d.energy = 0.6; d.color = (0.3, 0.8, 0.9)
    lo = bpy.data.objects.new('abyss', d); lo.rotation_euler = (math.radians(-120), 0, math.radians(20)); s.collection.objects.link(lo)
    return s

def render(tag, bounds, info):
    mn.PPU = PPU
    w, h, ox, oy = mn._frame(None, bounds)
    bpy.context.view_layer.update()
    os.makedirs(OUT, exist_ok=True)
    data = {'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU, 'elev': mn.ELEVATION,
            'note': 'pixel = (ox + gx*ppu, oy - (-gy*sin(e) + z*cos(e))*ppu), game coordinates as js/ship.js'}
    for k, v in info.items(): data[k] = v
    json.dump(data, open(os.path.join(OUT, f'{tag}.json'), 'w'), indent=1)
    mn._render_to(os.path.join(OUT, f'{tag}.png'), 'beauty')
    print('[leviathan_boss]', tag, w, h)

def pts_info(C, sp, ox, oy):
    return {
        'zones': [dict(px=scr(z['c'], ox, oy), state=z['state'], R=z['R']) for z in C['zones']],
        'eye': {k: scr(v, ox, oy) for k, v in C['eye'].items()},
        'holes': [scr(p, ox, oy) for p in C['holes']],
        'spine': [scr(sp.at(u)[0], ox, oy) for u in [k / 40 for k in range(41)]],
        'fin_top': scr(surf_analytic(sp, 0.37, 90)[0] + Z * 8.0, ox, oy),
        'head': scr(sp.at(0.0)[0], ox, oy), 'tail': scr(sp.at(1.0)[0], ox, oy),
    }

QUICK = 'quick' in A

def keyart():
    setup(); M = mats(); M['eyeball'] = LV.eye_mat(1)
    # down our LEFT flank, head towards the stern, the tail trailing far beyond the bow
    sp = Spine([(-14, 52), (-19, 32), (-23, 10), (-24, -12), (-22, -34), (-16, -54), (-10, -70), (-8, -82)], inner_sign=1)
    # inner side: Z x T, T points to the tail (game -y = blender +y): Z x (0,1,0) = (-1,0,0)... flip so it faces +x (the ship)
    c, T, side = sp.at(0.5)
    if side.x < 0: sp.sg = -sp.sg
    specs = [dict(u=0.22, th=28, R=3.2, state='after', seed=2),
             dict(u=0.36, th=24, R=3.4, state='infested', seed=5, flying=6),
             dict(u=0.52, th=30, R=3.0, state='infested', seed=7),
             dict(u=0.47, th=96, R=3.6, state='infested', seed=9),          # the nest on its back (phase 4)
             dict(u=0.30, th=160, R=2.6, state='infested', seed=11)]       # on the far flank
    C = creature(sp, M, QUICK, specs, eye_state='half', fin_holes=2, lean=55)
    bounds = (-42, 50, -60 * math.sin(math.radians(50)), 84 * math.sin(math.radians(50)) + 6)
    mn.PPU = PPU
    w, h, ox, oy = mn._frame(None, bounds)
    render('keyart_lev', bounds, pts_info(C, sp, ox, oy))

def details():
    setup(); M = mats(); M['eyeball'] = LV.eye_mat(1)
    # straight, head to the left, the inner flank towards the camera
    sp = Spine([(-60, 0), (0, 0), (60, 0)], inner_sign=1)
    c, T, side = sp.at(0.5)
    if side.y > 0: sp.sg = -sp.sg                     # blender -y = game +y = towards the camera
    specs = [dict(u=0.28, th=30, R=3.2, state='infested', seed=5),
             dict(u=0.52, th=30, R=3.2, state='after', seed=5),
             dict(u=0.42, th=100, R=3.4, state='burning', seed=9)]
    C = creature(sp, M, QUICK, specs, eye_state='open', fin_holes=0, lean=15)
    bounds = (-62, 10, -14, 16) if 'zonetest' not in A else (-36, 8, -10, 14)
    mn.PPU = PPU
    w, h, ox, oy = mn._frame(None, bounds)
    render('details_lev', bounds, pts_info(C, sp, ox, oy))

def behind():
    setup(); M = mats(); M['eyeball'] = LV.eye_mat(1)
    # across behind our stern (game y ~ 44), head to the right; inner flank (towards the ship) faces up the screen
    sp = Spine([(78, 46), (40, 43), (10, 43), (-20, 47), (-48, 52)], inner_sign=1)
    c, T, side = sp.at(0.5)
    if side.y < 0: sp.sg = -sp.sg                      # blender +y = game -y = towards our ship
    specs = [dict(u=0.25, th=28, R=3.2, state='after', seed=2), dict(u=0.36, th=24, R=3.4, state='after', seed=5),
             dict(u=0.52, th=30, R=3.0, state='after', seed=7), dict(u=0.30, th=160, R=2.6, state='after', seed=11),
             dict(u=0.42, th=96, R=3.6, state='burning', seed=9)]
    C = creature(sp, M, QUICK, specs, eye_state='open', fin_holes=2, lean=35)
    # (the nest centre lands under the engine at x ~ 22: u 0.42 of this spine)
    bounds = (-52, 82, -62 * math.sin(math.radians(50)) - 4, -24 * math.sin(math.radians(50)) + 12)
    mn.PPU = PPU
    w, h, ox, oy = mn._frame(None, bounds)
    render('behind_lev', bounds, pts_info(C, sp, ox, oy))

def crawler_render():
    setup(); M = mats()
    objs = crawler(M, Vector((0, 0, 0)), math.radians(200), 0.0)
    objs += crawler(M, Vector((1.1, 0.25, 0)), math.radians(150), 1.5)
    mn.PPU = PPU
    w, h, ox, oy = mn._frame(objs)
    os.makedirs(OUT, exist_ok=True)
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU}, open(os.path.join(OUT, 'crawler.json'), 'w'))
    mn._render_to(os.path.join(OUT, 'crawler.png'), 'beauty')

if __name__ == '__main__':
    if MODE != 'none': {'keyart': keyart, 'details': details, 'behind': behind, 'crawler': crawler_render}[MODE]()
