"""The ship cat (js/decor.js catSprite(), CAT in js/ship.js; petted via petCat() in js/mission.js).

"Held together by duct tape, optimism and one very large cat": a big orange tabby curled up asleep in
its corner of the reactor room, the classic cat donut. About 0.78 x 0.62 units, so it stays inside the
pet target (r 0.55 around CAT).

Built from one soft body mass (a fat tube along the curled spine, shoulders at the front right, a big round
haunch over the rump at the front left with the hind leg folded under it, and a filler in the middle of the
curl, merged by a voxel remesh and smoothed, then fur clumps pushed out along the fur's direction), a big head on a neck pivot (cheek ruffs, cream muzzle and chin, pink
nose, ears with pink insides and white tufts, forehead M and cheek stripes painted on as thin strokes),
two small cream front paws under the chin, a cream chest bib, and a thick, bushy tail (fur clumps,
rounded tip) tucked in under the haunch and wrapped round the front, with soft rings and a dark tip.
The back half used to read as a lizard (a smooth egg of a thigh stuck on, a thin tapering ringed tail,
crisp bands, a shiny skin-like material): keep the fur matte, the tail fat and the shapes merged. The tabby bands are a shader driven by mesh attributes (ts = arc length
along the spine / tail, tv = how far round the body from the spine), so they curve with the body:
thick wavy bands over the back that thin out down the flanks, a dark spine stripe, a pale belly, rings
on the tail. The tail is animated with one shape key per frame.
`-- quick preview` renders at 16 samples and 3x size into /tmp/cat/preview (real renders untouched).

Origin: CAT.x, CAT.y on the floor (the body's centre). Head front right, face towards the camera.

Sprites (build/renders/props/):
  cat_sleep_f0..f7   breathing loop (decor.js: frame = floor(t / 3.93 * 8) % 8)
  cat_flick_f0..f5   the tail tip lifts and flicks (one-shot, 0.9 s every 9 s, instead of cat_sleep)
  cat_pet_f0..f5     luck.pet > 0: head up, happy ^^ eyes, rubbing its cheek, tail tip curling
  cat_stare          a fire within 7 units: wide awake, head up, big yellow eyes with slit pupils, ears up
  cat_hide           ~4 s after a big hit on the ship (the bang): a fur pancake, ears back, two big round eyes
                     (the game draws this one 0.125 units lower: origin at CAT.y + 0.125)
Hearts and the z-z-z stay runtime effects (text/particles).
"""
import sys, os, math
from mathutils import noise as mnoise, kdtree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from propslib import *

if 'preview' in ARGS:                               # iterate: 3x size into a scratch folder, real renders untouched
    mn.PPU *= 3; mn.OUT_DIR = os.environ.get('CAT_PREVIEW', '/tmp/cat/preview'); mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')

FUR, FURLIGHT, STRIPE, CREAM, PINK = '#f09634', '#f8bc6c', '#a4481a', '#f7e6c8', '#f09a9a'

# ---------------------------------------------------------------------------
# Shader helpers
# ---------------------------------------------------------------------------
class NB:
    """Tiny node-graph builder: floats or sockets in, sockets out."""
    def __init__(self, m):
        self.nt = m.node_tree; self.N = self.nt.nodes
    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        else: self.nt.links.new(v, sock)
    def op(self, op, a, b=0.0, c=0.0):
        n = self.N.new('ShaderNodeMath'); n.operation = op
        self._in(n.inputs[0], a); self._in(n.inputs[1], b); self._in(n.inputs[2], c); return n.outputs[0]
    def ss(self, v, lo, hi):                        # smoothstep(lo, hi, v)
        n = self.N.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'
        self._in(n.inputs['Value'], v); self._in(n.inputs['From Min'], lo); self._in(n.inputs['From Max'], hi)
        return n.outputs[0]
    def attr(self, name):
        n = self.N.new('ShaderNodeAttribute'); n.attribute_name = name; return n.outputs['Fac']
    def noise(self, scale, detail=2.0):
        tc = self.N.new('ShaderNodeTexCoord'); n = self.N.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        self.nt.links.new(tc.outputs['Object'], n.inputs['Vector']); return n.outputs['Fac']
    def xyz(self):
        tc = self.N.new('ShaderNodeTexCoord'); sp = self.N.new('ShaderNodeSeparateXYZ')
        self.nt.links.new(tc.outputs['Object'], sp.inputs[0]); return sp.outputs[0], sp.outputs[1], sp.outputs[2]
    def mix(self, f, a, b):
        n = self.N.new('ShaderNodeMix'); n.data_type = 'RGBA'; self._in(n.inputs[0], f)
        for s, v in ((n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, tuple): s.default_value = v
            else: self.nt.links.new(v, s)
        return n.outputs[2]

def fur_base(name, rough=0.88):
    """Matte fur: rough, almost no specular highlight (a shiny highlight made it read as skin), soft sheen."""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.18
    b.inputs['Sheen Weight'].default_value = 0.45; b.inputs['Sheen Roughness'].default_value = 0.45
    b.inputs['Sheen Tint'].default_value = (1.0, 0.82, 0.55, 1)
    b.inputs['Subsurface Weight'].default_value = 0.12; b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.2)
    b.inputs['Subsurface Scale'].default_value = 0.02
    return m, b

def fur_streaks(g, b, ts, tv, along=34.0, across=110.0, strength=0.22):
    """Fine fur streaks running along the body (ts) as a bump, so lit fur looks combed, not smooth skin.
    Returns the streak noise (0..1) for fraying stripe edges."""
    cx = g.N.new('ShaderNodeCombineXYZ')
    g._in(cx.inputs[0], g.op('MULTIPLY', ts, along)); g._in(cx.inputs[1], g.op('MULTIPLY', tv, across))
    n = g.N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 1.0; n.inputs['Detail'].default_value = 3.0
    n.inputs['Roughness'].default_value = 0.65
    g.nt.links.new(cx.outputs[0], n.inputs['Vector'])
    bump = g.N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = 0.004
    g.nt.links.new(n.outputs['Fac'], bump.inputs['Height']); g.nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return n.outputs['Fac']

def C(hexc, g=1.3): return (*lift(hexc, g), 1)

def body_mat(name, spacing=0.088):
    """Tabby body: bands across the spine (ts) that taper down the flanks (tv), a spine stripe, pale belly."""
    m, b = fur_base(name); g = NB(m)
    ts, tv = g.attr('ts'), g.attr('tv')
    fray = g.op('MULTIPLY', g.op('SUBTRACT', fur_streaks(g, b, ts, tv), 0.5), 0.22)   # fur breaks up the stripe edges
    n = g.noise(4.0, 4.0); n2 = g.noise(13.0, 2.0); n3 = g.noise(2.2, 1.0)
    x, y, _ = g.xyz()
    tr = g.op('SQRT', g.op('ADD', g.op('POWER', g.op('SUBTRACT', x, CC[0]), 2.0), g.op('POWER', g.op('SUBTRACT', y, CC[1]), 2.0)))
    wob = g.op('MULTIPLY', g.op('SUBTRACT', n, 0.5), 2.6)
    chev = g.op('MULTIPLY', g.op('POWER', tv, 1.5), 2.0)                   # bands sweep backwards down the flanks
    ph = g.op('ADD', g.op('ADD', g.op('MULTIPLY', ts, math.tau / spacing), wob), chev)
    band = g.op('MULTIPLY_ADD', g.op('SINE', ph), 0.5, 0.5)
    thr = g.op('ADD', g.op('MULTIPLY_ADD', tv, 0.75, 0.56), g.op('MULTIPLY', g.op('SUBTRACT', n3, 0.5), 0.2))
    stripe = g.ss(g.op('ADD', g.op('SUBTRACT', band, thr), fray), -0.04, 0.12)   # wide on the back, tapering down the flanks; soft, furry edges
    stripe = g.op('MULTIPLY', stripe, g.op('SUBTRACT', 1.0, g.ss(tv, 0.5, 0.62)))
    stripe = g.op('MULTIPLY', stripe, g.ss(tr, 0.03, 0.09))               # calm in the very middle of the curl
    spine = g.op('SUBTRACT', 1.0, g.ss(g.op('ADD', tv, g.op('MULTIPLY', g.op('SUBTRACT', n2, 0.5), 0.06)), 0.035, 0.07))
    dark = g.op('MAXIMUM', g.op('MULTIPLY', stripe, 0.85), g.op('MULTIPLY', spine, 0.7))
    col = g.mix(g.op('MULTIPLY', g.ss(tv, 0.25, 0.75), g.ss(tr, 0.14, 0.22)), C(FUR), C(FURLIGHT, 1.15))   # warm lighter flanks
    col = g.mix(dark, col, C(STRIPE, 1.1))
    col = g.mix(g.op('MULTIPLY', g.ss(tv, 0.8, 0.95), 0.8), col, C(CREAM, 1.1))
    m.node_tree.links.new(col, b.inputs['Base Color'])
    return m

def tail_mat(name, rings=4.0):
    """Tail: soft rings along its length (ts 0..1), the last bit dark; combed fur streaks."""
    m, b = fur_base(name); g = NB(m)
    ts = g.attr('ts'); tv = g.attr('tv'); n = g.noise(9.0, 2.0)
    fray = g.op('MULTIPLY', g.op('SUBTRACT', fur_streaks(g, b, ts, tv, along=14.0, across=40.0, strength=0.3), 0.5), 0.3)
    ph = g.op('ADD', g.op('MULTIPLY', ts, math.tau * rings), g.op('MULTIPLY', g.op('SUBTRACT', n, 0.5), 1.2))
    band = g.op('MULTIPLY_ADD', g.op('SINE', ph), 0.5, 0.5)
    ring_ = g.ss(g.op('ADD', g.op('SUBTRACT', band, g.op('MULTIPLY_ADD', ts, -0.25, 0.6)), fray), -0.03, 0.14)
    ring_ = g.op('MULTIPLY', ring_, g.ss(ts, 0.1, 0.25))
    ring_ = g.op('MULTIPLY', ring_, g.op('SUBTRACT', 1.0, g.op('MULTIPLY', g.ss(tv, 0.55, 0.9), 0.7)))   # rings fade underneath
    dark = g.op('MAXIMUM', ring_, g.ss(g.op('ADD', ts, fray), 0.86, 0.93))
    col = g.mix(g.op('MULTIPLY', dark, 0.85), C(FUR), C(STRIPE, 1.1))
    m.node_tree.links.new(col, b.inputs['Base Color'])
    return m

def head_mat(name):
    m, b = fur_base(name); b.inputs['Base Color'].default_value = C(FUR, 1.4); return m

def fluff_mat(name, col=CREAM):
    m, b = fur_base(name); b.inputs['Base Color'].default_value = C(col, 1.1); b.inputs['Sheen Weight'].default_value = 0.6
    return m

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def sweep_data(P, rw, rh, seg=28, cap0=6, cap1=6, floor=None, ts_norm=False, inner_soft=False, fuzz=None):
    """Ring vertices of a tube with an elliptic cross-section along points P (Vectors), radii rw (sideways)
    and rh (up). Caps are rounded. Returns verts, faces, per-vertex ts (arc length) and tv (0 on top, 1 below).
    fuzz(ring, j) -> radius factor: fur clumps (a function of the vertex's place on the tube, so every shape key
    of an animated tube gets the same clumps)."""
    n = len(P); Z = Vector((0, 0, 1))
    T = [(P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized() for i in range(n)]
    L = [0.0]
    for i in range(1, n): L.append(L[-1] + (P[i] - P[i - 1]).length)
    rings = []                                       # (centre, tangent, rw, rh, ts)
    for k in range(cap0, 0, -1):
        a = math.pi / 2 * k / cap0; c = P[0] - T[0] * rw[0] * 0.9 * math.sin(a)
        rings.append((c, T[0], rw[0] * math.cos(a), rh[0] * math.cos(a), -rw[0] * math.sin(a)))
    for i in range(n): rings.append((P[i], T[i], rw[i], rh[i], L[i]))
    for k in range(1, cap1 + 1):
        a = math.pi / 2 * k / cap1; c = P[-1] + T[-1] * rw[-1] * 0.9 * math.sin(a)
        rings.append((c, T[-1], rw[-1] * math.cos(a), rh[-1] * math.cos(a), L[-1] + rw[-1] * math.sin(a)))
    V, TS, TV, F = [], [], [], []
    for ri, (c, t, a, h, s) in enumerate(rings):
        side = t.cross(Z).normalized(); up = side.cross(t).normalized()
        for j in range(seg):
            ph = math.tau * j / seg                        # 0 = outer side, pi/2 = top
            fz = fuzz(ri, j) if fuzz else 1.0
            p = c + side * (math.cos(ph) * a * fz) + up * (math.sin(ph) * h * fz)
            if floor is not None and p.z < floor: p.z = floor + (p.z - floor) * 0.08
            V.append(p); TS.append(s / L[-1] if ts_norm else s)
            d = abs(((ph - math.pi / 2) + math.pi) % math.tau - math.pi) / math.pi
            TV.append(d * (0.45 if inner_soft and math.cos(ph) < 0 else 1.0))
    R = len(rings)
    for r in range(R - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            F.append((r * seg + j, r * seg + j2, (r + 1) * seg + j2, (r + 1) * seg + j))
    F.append(tuple(range(seg))[::-1]); F.append(tuple((R - 1) * seg + j for j in range(seg)))
    return V, F, TS, TV

def make_mesh(name, V, F, attrs, m):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    for k, vals in attrs.items():
        a = me.attributes.new(k, 'FLOAT', 'POINT'); a.data.foreach_set('value', vals)
    o = mn._obj(name, me); mn.assign(o, m); mn.smooth(o); return o

def add_shape_frames(o, frames_V):
    """One shape key per frame (frames_V: {frame: verts}); keyed so only that frame's key is on."""
    o.shape_key_add(name='basis')
    keys = {}
    for f, V in frames_V.items():
        sk = o.shape_key_add(name=f'f{f}'); sk.interpolation = 'KEY_LINEAR'
        for p, v in zip(sk.data, V): p.co = v
        keys[f] = sk
    for f in frames_V:
        bpy.context.scene.frame_set(f)
        for g, sk in keys.items():
            sk.value = 1.0 if g == f else 0.0; sk.keyframe_insert('value', frame=f)
    for fc in o.data.shape_keys.animation_data.action.fcurves if hasattr(o.data.shape_keys.animation_data.action, 'fcurves') else []:
        for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'

def cone(name, r, h, loc, m, scale=(1, 1, 1), rot=(0, 0, 0), segs=20, tip=0.0, bevel=0.02):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=tip, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.scale = scale; o.rotation_euler = rot
    mn.bev(o, min(bevel, r * 0.35), 3); mn.assign(o, m); mn.smooth(o); return o

def stroke(name, P, r, m, taper=True):
    """A thin painted stroke (stripe, closed eye, mouth): a tube that tapers at both ends."""
    n = len(P)
    rr = [r * (math.sin(math.pi * (0.15 + 0.7 * i / (n - 1))) if taper else 1.0) for i in range(n)]
    V, F, _, _ = sweep_data([Vector(p) for p in P], rr, rr, seg=8, cap0=2, cap1=2)
    return make_mesh(name, V, F, {}, m)

def ell_pts(c, a, b, a0, a1, n, z):
    """Points on an ellipse around c (Blender XY, ccw degrees), z(u) for u in 0..1."""
    out = []
    for i in range(n + 1):
        u = i / n; t = math.radians(a0 + (a1 - a0) * u)
        out.append(Vector((c[0] + a * math.cos(t), c[1] + b * math.sin(t), z(u))))
    return out

# ---------------------------------------------------------------------------
# The cat
# ---------------------------------------------------------------------------
CC = (-0.03, 0.03)                                  # centre of the curl

def tail_path(state, frame=0, nf=1):
    """Tail centreline: from the rump round the front towards the paws. Returns points and radii."""
    hide = state == 'hide'
    a, b = (0.33, 0.25) if hide else (0.355, 0.29)
    base = ell_pts(CC, a, b, 188, 282 if not hide else 290, 26, lambda u: (0.07 + 0.03 * math.sin(math.pi * min(1, u / 0.5)) - 0.02 * u) * (0.85 if hide else 1.0))
    P = [p.copy() for p in base]; n = len(P)
    for i, p in enumerate(P):                       # the base starts tucked in under the haunch, then wraps out round the front
        u = i / (n - 1); f = 0.78 + 0.22 * ss_py(0.0, 0.3, u)
        p.x = CC[0] + (p.x - CC[0]) * f; p.y = CC[1] + (p.y - CC[1]) * f
    u = math.tau * frame / max(nf, 1)
    lift_, curl, wag = 0.0, 0.0, 0.0
    if state == 'flick':
        lift_ = [0.0, 0.55, 1.0, 0.7, 1.0, 0.25][frame]; wag = [0.0, 0.15, -0.3, 0.35, -0.15, 0.0][frame]
    elif state == 'pet':
        lift_ = 0.55 + 0.25 * math.sin(u); curl = 0.6 + 0.4 * math.sin(u + 1.0); wag = 0.15 * math.sin(u)
    elif state == 'stare':
        lift_ = 0.5; curl = 0.3; wag = 0.1
    for i in range(n):
        w = max(0.0, (i / (n - 1) - 0.55) / 0.45)              # only the last part moves
        if w <= 0: continue
        p = P[i]
        p.z += lift_ * 0.16 * w * w
        t = (p - P[n - 1]).normalized()
        p.x += wag * 0.12 * w * w
        p.y -= curl * 0.05 * math.sin(math.pi * w)
    # thick and bushy all the way, only a little thinner towards the rounded tip (a thin tapering tube read as a lizard tail)
    rad = [0.078 + 0.012 * math.sin(math.pi * min(1.0, (i / (n - 1)) / 0.7)) - 0.012 * (i / (n - 1)) ** 2 for i in range(n)]
    if hide: rad = [r * 0.92 for r in rad]
    return P, rad

def ss_py(lo, hi, v):
    t = max(0.0, min(1.0, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t)

def soft_mass(name, V, F, m, sp, rw, rh, hc, HS, HR, voxel=0.0065, fur=0.004):
    """Union of overlapping closed shapes -> one smooth surface (voxel remesh + smoothing that rounds the
    creases), with the tabby attributes recomputed per vertex (ts along the spine, tv round it; the haunch
    gets bands that arc round the thigh) and fur clumps pushed out along the normals: clumps stretched along
    the fur's direction (head to tail), so the normal map shows combed fur rather than smooth skin or scales."""
    me = bpy.data.meshes.new(name + '_src'); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    src = mn._obj(name + '_src', me)
    md = src.modifiers.new('remesh', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = voxel; md.adaptivity = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(src.evaluated_get(dg)); me2.name = name
    bpy.data.objects.remove(src); bpy.data.meshes.remove(me)
    bm = bmesh.new(); bm.from_mesh(me2)
    for _ in range(6):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:                               # keep the bottom on the floor
        if v.co.z < 0.004: v.co.z = 0.0
    bm.to_mesh(me2); bm.free(); me2.update()
    # spine frames, densely resampled
    n = len(sp); Z = Vector((0, 0, 1)); L = [0.0]
    for i in range(1, n): L.append(L[-1] + (sp[i] - sp[i - 1]).length)
    S = []
    for i in range(n - 1):
        for k_ in range(8):
            u = k_ / 8
            S.append((sp[i].lerp(sp[i + 1], u), L[i] + (L[i + 1] - L[i]) * u, rw[i] + (rw[i + 1] - rw[i]) * u, rh[i] + (rh[i + 1] - rh[i]) * u))
    S.append((sp[-1], L[-1], rw[-1], rh[-1]))
    kd = kdtree.KDTree(len(S))
    for i, s_ in enumerate(S): kd.insert(s_[0], i)
    kd.balance()
    HRi = HR.inverted(); hip = hc + HR @ Vector((0.06, 0.1, 0.0)) + Vector((0, 0, 0.09))
    TS, TV, D = [], [], []
    for v in me2.vertices:
        p = v.co; _, i, _ = kd.find(p)
        c, li, a_, b_ = S[i]
        j0, j1 = max(0, i - 1), min(len(S) - 1, i + 1)
        t = (S[j1][0] - S[j0][0]).normalized(); side = t.cross(Z).normalized(); up = side.cross(t).normalized()
        d = p - c
        ts = li + t.dot(d)
        ph = math.atan2(up.dot(d) / max(b_, 1e-4), side.dot(d) / max(a_, 1e-4))
        tv = abs(((ph - math.pi / 2) + math.pi) % math.tau - math.pi) / math.pi
        if math.cos(ph) < 0: tv *= 0.45
        # the haunch: bands arc round the thigh (distance from the hip), pale underneath
        e = (HRi @ (p - hc)); e = Vector((e.x / HS.x, e.y / HS.y, e.z / HS.z)).length
        w = 1.0 - ss_py(1.0, 1.22, e)
        if w > 0:
            ts_h = L[-1] - 0.02 + (p - hip).length * 0.75
            dz = (p - hc).normalized().z if (p - hc).length > 1e-5 else 1.0
            tv_h = min(1.0, math.acos(max(-1, min(1, dz))) / math.pi * 1.2)
            ts = ts + (ts_h - ts) * w; tv = tv + (tv_h - tv) * w; t = t.lerp(Vector((0.3, -0.9, 0.0)).normalized(), w)
        TS.append(ts); TV.append(tv)
        # fur clumps: noise squashed along the fur direction t
        q = p - t * t.dot(p) * 0.85
        f = mnoise.noise(q * 42.0) * 0.6 + mnoise.noise(q * 95.0 + Vector((3.3, 1.7, 0))) * 0.4
        D.append(0.0 if p.z < 0.006 else f * fur * min(1.0, p.z / 0.03))
    for v, d_ in zip(me2.vertices, D): v.co = v.co + v.normal * d_
    for kname, vals in (('ts', TS), ('tv', TV)):
        a = me2.attributes.new(kname, 'FLOAT', 'POINT'); a.data.foreach_set('value', vals)
    o = mn._obj(name, me2); mn.assign(o, m); mn.smooth(o); return o

def tail_fuzz(ri, j, seg=32):
    """Fur clumps on the tail: radius factor from a noise over (ring, angle), the same for every frame."""
    ph = math.tau * j / seg
    q = Vector((ri * 0.42, math.cos(ph) * 1.6, math.sin(ph) * 1.6))
    return 1.0 + 0.075 * mnoise.noise(q) + 0.035 * mnoise.noise(q * 2.7 + Vector((5.1, 0, 0)))

def tail_sweep(state, frame=0, nf=1):
    P, rad = tail_path(state, frame, nf)
    return sweep_data(P, rad, [r * 0.95 for r in rad], seg=32, cap0=4, cap1=7, ts_norm=True, floor=0.0, fuzz=tail_fuzz)

def build(state):
    k = Kit()
    M = dict(body=body_mat('body'), tail=tail_mat('tail'), head=head_mat('head'), fluff=fluff_mat('fluff'), chest=fluff_mat('chest', '#f2cf9c'),
             stripe=plain('stripe', STRIPE, 0.7, gain=1.1), pink=plain('pink', PINK, 0.55, sheen=0.3),
             nose=plain('nose', '#e07a84', 0.35, coat=0.5), ink=plain('ink', '#2a1810', 0.45, gain=1.0),
             eye=plain('eye', '#ffd23a', 0.15, coat=1.0, emit='#ffc830', emit_strength=0.9),
             pupil=plain('pupil', '#120c08', 0.2, coat=1.0), shine=plain('shine', '#ffffff', 0.2, emit='#ffffff', emit_strength=1.2),
             whisker=plain('whisker', '#f4f0e8', 0.4), tuft=plain('tuft', '#fff6e8', 0.6, sheen=0.5))
    h = {'breath': []}
    hide = state == 'hide'
    flat = 0.55 if hide else 1.0

    # --- body: one soft mass. A fat tube along the curled spine (shoulders front right -> back -> rump front
    # left), a big round haunch over the rump (the hind leg folded under it) and a filler in the middle of the
    # curl, merged by a voxel remesh and smoothed, so there are no seams or pinches between them; then fur clumps.
    sp = ell_pts(CC, 0.13, 0.095, -30, 212, 24, lambda u: 0.0)
    rw = [0.165 + 0.05 * math.sin(math.pi * min(1, u / 0.85)) ** 0.7 + 0.045 * ss_py(0.55, 1.0, u) for u in (i / 24 for i in range(25))]
    rh = [(0.15 + 0.03 * math.sin(math.pi * u) + 0.025 * ss_py(0.55, 1.0, u)) * flat for u in (i / 24 for i in range(25))]
    for p, h_ in zip(sp, rh): p.z = h_ * 0.86
    V, F, _, _ = sweep_data(sp, rw, rh, seg=40, cap0=7, cap1=8, floor=0.0)
    hc = Vector((-0.245, -0.095, 0.15 * flat)); HS = Vector((0.19, 0.18, 0.155 * flat)); HR = mathutils_rot(0.5)
    def blob(c, sc, rot=None, ns=36):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=ns, v_segments=ns // 2, radius=1.0)
        vs = []
        for v in bm.verts:
            q = Vector((v.co.x * sc.x, v.co.y * sc.y, v.co.z * sc.z))
            if rot: q.rotate(rot)
            q += c
            if q.z < 0: q.z *= 0.08
            vs.append(q)
        fs = [tuple(v.index for v in f.verts) for f in bm.faces]; bm.free(); return vs, fs
    parts = [(V, F), blob(hc, HS, HR), blob(Vector((CC[0] - 0.01, CC[1] + 0.01, 0.15 * flat)), Vector((0.15, 0.12, 0.15 * flat)))]
    AV, AF = [], []
    for pv, pf in parts:
        o0 = len(AV); AV += pv; AF += [tuple(i + o0 for i in f) for f in pf]
    body = k(soft_mass('body', AV, AF, M['body'], sp, rw, rh, hc, HS, HR))
    h['breath'].append(body)

    # --- tail (shape keys animate it)
    V, F, TS, TV = tail_sweep(state)
    tail = k(make_mesh('tail', V, F, {'ts': TS, 'tv': TV}, M['tail'])); h['tail'] = tail

    # --- front paws and chest bib under the chin
    if not hide:
        bib = k(mn.sphere('bib', 1, loc=(0.18, -0.11, 0.08), m=M['chest'], scale=(0.075, 0.055, 0.065)))
        h['breath'].append(bib)
        for px, py, a in ((0.13, -0.205, 0.12), (0.24, -0.2, -0.08)):
            pw = k(mn.sphere('paw', 1, loc=(px, py, 0.035), m=M['fluff'], scale=(0.04, 0.062, 0.026)))
            pw.rotation_euler.z = a
            for t in (-1, 0, 1):                     # toe lines
                q = Vector((px + t * 0.013, py - 0.054, 0.03))
                k(stroke('toe', [q + Vector((0, 0.012, 0.004)), q + Vector((0, -0.006, -0.004))], 0.0035, M['ink']), outline=False)

    # --- head on a neck pivot, face towards the camera; features sit on the head's surface
    hp = mn.link(bpy.data.objects.new('headpivot', None))
    hp.location = (0.18, -0.07, 0.06 if hide else 0.1)
    k.parts.append(hp); h['head'] = hp
    def H(o, ol=True): k(o, ol); o.parent = hp; return o
    hz = {'sleep': 0.1, 'flick': 0.1, 'pet': 0.17, 'stare': 0.19, 'hide': 0.04}[state]
    hy = -0.06
    RX, RY, RZ = 0.175, 0.15, 0.145 * (0.75 if hide else 1.0)
    def S(az, el, out=0.0):
        """Point on the head ellipsoid: az = degrees right of the face centre, el = degrees up."""
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        p = Vector((d.x * RX, d.y * RY, d.z * RZ)); nrm = Vector((d.x / RX, d.y / RY, d.z / RZ)).normalized()
        return p + nrm * out + Vector((0, hy, hz))
    H(mn.sphere('head', 1, loc=(0, hy, hz), m=M['head'], scale=(RX, RY, RZ)))
    for s in (-1, 1):                                # cheek ruffs: the head is widest low down
        H(mn.sphere('cheek', 1, loc=S(s * 62, -22, -0.055), m=M['head'], scale=(0.085, 0.08, 0.07 * (0.8 if hide else 1))))
    # muzzle: two whisker pads, chin, nose, little mouth
    for s in (-1, 1):
        H(mn.sphere('pad', 1, loc=S(s * 13, -24, -0.022), m=M['fluff'], scale=(0.045, 0.036, 0.034)))
    H(mn.sphere('chin', 1, loc=S(0, -44, -0.022), m=M['fluff'], scale=(0.04, 0.032, 0.026)))
    H(mn.sphere('nose', 1, loc=S(0, -11, 0.006), m=M['nose'], scale=(0.022, 0.014, 0.014)))
    mouth = [S(-9, -29, 0.006), S(-4, -31, 0.008), S(0, -27, 0.008), S(4, -31, 0.008), S(9, -29, 0.006)]
    H(stroke('mouth', mouth, 0.0045, M['ink']), ol=False)
    for s in (-1, 1):
        for j in range(3):
            p0 = S(s * 24, -26 + j * 5, -0.012)
            H(stroke('whisker', [p0, p0 + Vector((s * 0.05, -0.02, -0.012 + j * 0.01)), p0 + Vector((s * 0.1, -0.03, -0.03 + j * 0.024))], 0.004, M['whisker'], taper=False), ol=False)
    # tabby marks: the forehead M and stripes running back over the crown, two stripes on each cheek
    for az0, az1, el0, el1 in ((0, 0, 30, 70), (-11, -17, 30, 66), (11, 17, 30, 66), (-24, -33, 28, 58), (24, 33, 28, 58)):
        pts = [S(az0 + (az1 - az0) * u, el0 + (el1 - el0) * u, 0.002) for u in (0, 0.33, 0.66, 1)]
        H(stroke('mark', pts, 0.011, M['stripe']), ol=False)
    for s in (-1, 1):
        for el in (6, -7):
            pts = [S(s * (52 + 12 * u), el - 3 * u, 0.001 + 0.004 * u) for u in (0, 0.5, 1)]
            H(stroke('cheekmark', pts, 0.009, M['stripe']), ol=False)
    # ears: rounded cones, pink inside with a white tuft
    ear_t = {'sleep': 0.5, 'flick': 0.5, 'pet': 0.62, 'stare': 0.2, 'hide': 1.25}[state]
    ear_b = {'hide': 0.6}.get(state, -0.15)
    for s in (-1, 1):
        p = S(s * 40, 50, -0.035)
        rot = (ear_b, s * ear_t, 0)
        H(cone('ear', 0.07, 0.13, p, M['head'], scale=(1, 0.55, 1), rot=rot, tip=0.006))
        H(cone('earin', 0.05, 0.1, p + Vector((0, -0.016, 0.002)), M['pink'], scale=(1, 0.3, 1), rot=rot, tip=0.004), ol=False)
        H(cone('tuft', 0.016, 0.07, p + Vector((s * 0.0, -0.022, 0.0)), M['tuft'], scale=(1, 0.5, 1), rot=(rot[0] - 0.2, rot[1] * 1.1, 0), tip=0.0, bevel=0.004), ol=False)
    # eyes
    for s in (-1, 1):
        c = S(s * 32, 14, 0.0) if hide else S(s * 30, 6, 0.0)
        if state in ('stare', 'hide'):
            big = 1.6 if hide else 1.2
            H(mn.sphere('eye', 1, loc=c + Vector((0, 0.008, 0)), m=M['eye'], scale=(0.046 * big, 0.03, 0.05 * big)))
            if hide:
                H(mn.sphere('pupil', 1, loc=c + Vector((0, -0.026, -0.004)), m=M['pupil'], scale=(0.05, 0.02, 0.056)), ol=False)
                H(mn.sphere('shine', 0.018, loc=c + Vector((-0.024, -0.045, 0.03)), m=M['shine']), ol=False)
                H(mn.sphere('shine2', 0.009, loc=c + Vector((0.02, -0.045, -0.025)), m=M['shine']), ol=False)
            else:
                H(mn.sphere('slit', 1, loc=c + Vector((0, -0.024, 0)), m=M['pupil'], scale=(0.013, 0.012, 0.05)), ol=False)
                H(mn.sphere('shine', 0.011, loc=c + Vector((-0.015, -0.03, 0.022)), m=M['shine']), ol=False)
        else:
            up = state == 'pet'                       # happy ^ when petted, sleepy u otherwise
            pts = [S(s * 30 + 15 * math.cos(math.pi * i / 8), 6 + (1 if up else -1) * 8 * math.sin(math.pi * i / 8) + (-3 if up else 3), 0.004) for i in range(9)]
            H(stroke('lid', pts, 0.011, M['ink']), ol=False)
    hp.rotation_euler = (-0.15, 0, 0.1)
    return k, h

def mathutils_rot(a):
    from mathutils import Matrix
    return Matrix.Rotation(a, 3, 'Z')

def tail_frames(h, state, F):
    shapes = {}
    for i, f in enumerate(F):
        shapes[f] = tail_sweep(state, i, len(F))[0]
    add_shape_frames(h['tail'], shapes)

def head_pose(h, f, rx=0.0, ry=0.0, rz=0.0):
    hp = h['head']; hp.rotation_euler = (rx, ry, rz); hp.keyframe_insert('rotation_euler', frame=f)

@job('cat_sleep')
def cat_sleep():
    k, h = build('sleep'); k.outline(0.013)
    F = list(range(1, 9))
    for i, f in enumerate(F):
        bpy.context.scene.frame_set(f)
        u = math.sin(math.tau * i / len(F))
        for o in h['breath']:
            if 's0' not in o: o['s0'] = tuple(o.scale)
            s0 = o['s0']; o.scale = (s0[0] * (1 + 0.025 * u), s0[1] * (1 + 0.025 * u), s0[2] * (1 + 0.06 * u))
            o.keyframe_insert('scale', frame=f)
        head_pose(h, f, rx=-0.15 - 0.04 * u, rz=0.1)
    place(k, 'cat_sleep', frames=F)

@job('cat_flick')
def cat_flick():
    k, h = build('flick'); k.outline(0.013)
    F = list(range(1, 7)); tail_frames(h, 'flick', F)
    place(k, 'cat_flick', frames=F)

@job('cat_pet')
def cat_pet():
    k, h = build('pet'); k.outline(0.013)
    F = list(range(1, 7)); tail_frames(h, 'pet', F)
    for i, f in enumerate(F):
        bpy.context.scene.frame_set(f)
        u = math.tau * i / len(F)
        head_pose(h, f, rx=-0.3 - 0.05 * math.sin(2 * u), ry=0.22 * math.sin(u), rz=0.1 + 0.12 * math.sin(u))   # cheek rubs, chin up
    place(k, 'cat_pet', frames=F)

@job('cat_stare')
def cat_stare():
    k, h = build('stare'); k.outline(0.013)
    tail_frames(h, 'stare', [1])
    h['head'].rotation_euler = (-0.2, 0, 0.12)
    place(k, 'cat_stare')

@job('cat_hide')
def cat_hide():
    k, h = build('hide'); k.outline(0.013)
    h['head'].rotation_euler = (-0.55, 0, 0.05)
    place(k, 'cat_hide')

if __name__ == '__main__':
    run()
