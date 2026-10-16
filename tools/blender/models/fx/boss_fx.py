"""Captain Red Comet's boss effects (concept: the captain's quarters, phases 1-2): his blue shield
generator's FRONT hex shield and its states, the full-bubble flare at the 50 % phase change, the
generator's blue electric burst at 0 %, the buckshot muzzle blast, the pellet and the spin bolt, the
dash telegraph line, the dash's fire trail and the 'dazed' stars.

There is no boss code in the game yet: sizes come from the concept (the captain ~1.8-2.2 units tall,
~1.2 wide; the shield ~2.2 wide). Change the constants below if the game settles on other numbers.

Sprites (group fx, all origins described in the report / per job below):
  fx/boss_shield_{front,back}           16 dirs x 6 frames   idle shimmer loop (front = the half of the dome
                                                             nearer the camera than the captain's origin,
                                                             back = the rest: draw back, captain, front)
  fx/boss_shield_hit_{front,back}       16 dirs x 6 frames   ripple from a shot bouncing off the front centre
  fx/boss_shield_off_{front,back}       16 dirs x 6 frames   flicker and power down (play reversed to power up)
  fx/boss_bubble_{front,back}            1 dir  x 8 frames   full bubble flare + shatter (50 % phase change)
  fx/boss_gen_burst                      1 dir  x 12 frames  generator burst at 0 % (blue electric explosion)
  fx/boss_muzzle                        16 dirs x 4 frames   buckshot muzzle blast (orange-red cone)
  fx/boss_pellet                         1 dir  x 4 frames   buckshot pellet
  fx/boss_bolt                          16 dirs x 4 frames   spin bolt
  fx/boss_dash_line                     32 dirs x 4 frames   dash telegraph: 1-unit floor strip segment, tiles
  fx/boss_trail_{a,b}                    1 dir  x 8 frames   dash fire-trail patch (burning floor loop)
  fx/boss_dazed                          1 dir  x 8 frames   dazed stars circling over a head

    FX_CPU=1 blender -b --factory-startup --python tools/blender/models/fx/boss_fx.py [-- quick] [-- only=<job>,...]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix, noise
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
ONLY = sum([a[5:].split(',') for a in ARGS if a.startswith('only=')], [])
THREADS = int(os.environ.get('FX_THREADS', '6'))
mn.SAMPLES = 16 if QUICK else 40
DIRS = 4 if QUICK else 16          # quick: a few directions only, to look at

# ---------------------------------------------------------------------------
# Shield geometry: the dual of an icosphere (hexagons + 12 pentagons), squashed onto an ellipsoid
# ---------------------------------------------------------------------------
SH_RX, SH_RY, SH_RZ, SH_Z0 = 0.95, 1.15, 1.75, 0.22   # front reach, half width, height scale, centre height (top ~1.97)
SH_AZ = math.radians(84)                               # the front shield wraps +-84 deg around its facing
INSET = 0.8                                            # cell fill size inside its hex frame
BLUE_DEEP, BLUE_LINE, BLUE_HOT = '#0838ff', '#2a9cff', '#c8f0ff'

def dual_cells(subdiv=3):
    """[(unit centre, [unit corner points in order])] of the icosphere's dual (162 cells at subdiv 3)."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    cells = []
    for v in bm.verts:
        n = v.co.normalized(); t1 = n.orthogonal().normalized(); t2 = n.cross(t1)
        cs = [f.calc_center_median().normalized() for f in v.link_faces]
        cs.sort(key=lambda c: math.atan2(c.dot(t2), c.dot(t1)))
        cells.append((n, cs))
    bm.free()
    return cells

CELLS = dual_cells()

def ell(p, rx, ry, rz, z0):
    return Vector((p.x * rx, p.y * ry, max(0.0, z0 + p.z * rz)))

def shield_mat():
    """Translucent energy: per-corner colour attribute k = (fill, line, hot). Alpha and colour from k plus a
    fresnel rim; a world-y cut (node 'side') keeps only the half nearer (-1) or farther (+1) than the origin."""
    m = bpy.data.materials.get('boss_shield')
    if m: return m
    m = bpy.data.materials.new('boss_shield'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    N.clear(); out = N.new('ShaderNodeOutputMaterial')
    def math_(op, a, b=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: L(x, n.inputs[i])
        return n.outputs[0]
    def mix(fac, a, b):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; L(fac, n.inputs[0])
        for i, x in ((6, a), (7, b)):
            if isinstance(x, tuple): n.inputs[i].default_value = x
            else: L(x, n.inputs[i])
        return n.outputs[2]
    at = N.new('ShaderNodeVertexColor'); at.layer_name = 'k'
    sp = N.new('ShaderNodeSeparateColor'); L(at.outputs['Color'], sp.inputs[0])
    fill, line, hot = sp.outputs[0], sp.outputs[1], sp.outputs[2]
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    rim = math_('POWER', lw.outputs['Facing'], 2.2)
    # alpha = fill * (0.2 + 0.55 rim) + line * fill + hot * 0.75
    a1 = math_('MULTIPLY', fill, math_('ADD', math_('MULTIPLY', rim, 0.55), 0.2))
    a2 = math_('MULTIPLY', math_('MULTIPLY', line, fill), 1.0)
    a3 = math_('MULTIPLY', hot, 0.75)
    alpha = math_('ADD', math_('ADD', a1, a2), a3, clamp=True)
    # cut: keep world y * side > 0 (side 0 keeps everything)
    geo = N.new('ShaderNodeNewGeometry'); sxyz = N.new('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sxyz.inputs[0])
    side = N.new('ShaderNodeValue'); side.name = 'side'; side.outputs[0].default_value = 0.0
    keep = math_('GREATER_THAN', math_('MULTIPLY', sxyz.outputs['Y'], side.outputs[0]), 0.0)
    allk = math_('SUBTRACT', 1.0, math_('ABSOLUTE', side.outputs[0]))
    alpha = math_('MULTIPLY', alpha, math_('MAXIMUM', keep, allk))
    col = mix(line, fx.rgba(BLUE_DEEP, 1.0), fx.rgba(BLUE_LINE, 1.0))
    col = mix(math_('MULTIPLY', rim, 0.5), col, fx.rgba(BLUE_LINE, 1.0))
    col = mix(math_('MULTIPLY', math_('MINIMUM', hot, 1.0), math_('SUBTRACT', 1.0, math_('MULTIPLY', line, 0.55))), col, fx.rgba(BLUE_HOT, 1.0))
    em = N.new('ShaderNodeEmission'); L(col, em.inputs['Color'])
    L(math_('ADD', math_('ADD', math_('MULTIPLY', line, 0.6), math_('MULTIPLY', hot, 0.9)), 1.0), em.inputs['Strength'])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L(alpha, mx.inputs[0]); L(tr.outputs[0], mx.inputs[1]); L(em.outputs[0], mx.inputs[2]); L(mx.outputs[0], out.inputs['Surface'])
    return m

def set_side(v):
    bpy.data.materials['boss_shield'].node_tree.nodes['side'].outputs[0].default_value = v

class Mesh:
    """Collects polygons with per-corner k colours, then makes one object."""
    def __init__(self): self.bm = bmesh.new(); self.lay = self.bm.loops.layers.float_color.new('k')
    def poly(self, pts, ks):
        vs = [self.bm.verts.new(p) for p in pts]
        try: f = self.bm.faces.new(vs)
        except ValueError: return
        for lp, k in zip(f.loops, ks): lp[self.lay] = (*k, 1.0)
        f.smooth = False
    def obj(self, name, m):
        me = bpy.data.meshes.new(name); self.bm.to_mesh(me); self.bm.free()
        o = mn._obj(name, me); mn.assign(o, m); return o

def hex_cells(M, keep, shape, state):
    """Add every kept cell to mesh M. state(i, centre, normal) -> None (hidden) or dict(fill, hot, push, scale, spin)."""
    for i, (n, cs) in enumerate(CELLS):
        if not keep(n): continue
        st = state(i, n)
        if not st: continue
        c = shape(n); pts = [shape(p) for p in cs]
        if all(p.z <= 0.001 for p in pts): continue
        nrm = (c - Vector((0, 0, SH_Z0))).normalized()
        off = nrm * st.get('push', 0.0) + st.get('move', Vector())
        sc = st.get('scale', 1.0)
        if st.get('spin'):
            R = Matrix.Rotation(st['spin'], 3, nrm.cross(Vector((0, 0, 1))).normalized() if abs(nrm.z) < 0.99 else Vector((1, 0, 0)))
        else: R = Matrix.Identity(3)
        P = lambda p, k: c + off + R @ ((p - c) * k * sc)
        fl, hot = st.get('fill', 1.0), st.get('hot', 0.0)
        inner = [P(p, INSET) for p in pts]; outer = [P(p, 1.0) for p in pts]
        M.poly(inner, [(fl, 0.0, hot)] * len(inner))
        ln = st.get('line', 1.0)
        for j in range(len(pts)):
            k = (j + 1) % len(pts)
            M.poly([inner[j], outer[j], outer[k], inner[k]], [(fl, ln, hot)] * 4)

def front_keep(n):
    return n.x > math.cos(SH_AZ) * math.hypot(n.x, n.y) and n.z > -0.35 and n.x > 0.02

def front_shape(n): return ell(n, SH_RX, SH_RY, SH_RZ, SH_Z0)

def ground_arc(M, rx, ry, a0, a1, glow=0.5, hot=0.0, w=0.05, spread=0.32, steps=40):
    """The emitter line where the shield meets the floor plus a soft floor glow under it."""
    for s in range(steps):
        u0, u1 = a0 + (a1 - a0) * s / steps, a0 + (a1 - a0) * (s + 1) / steps
        e = lambda a, d: Vector((math.cos(a) * (rx + d), math.sin(a) * (ry + d), 0.004))
        M.poly([e(u0, -w), e(u0, w), e(u1, w), e(u1, -w)], [(1.0, 1.0, hot)] * 4)            # bright line
        M.poly([e(u0, -spread), e(u0, -w), e(u1, -w), e(u1, -spread)], [(0, 0, 0), (glow, 0, hot * 0.5), (glow, 0, hot * 0.5), (0, 0, 0)])
        M.poly([e(u0, w), e(u0, spread * 0.6), e(u1, spread * 0.6), e(u1, w)], [(glow, 0, hot * 0.5), (0, 0, 0), (0, 0, 0), (glow, 0, hot * 0.5)])

RND = random.Random(5)
CELL_RND = [(RND.random(), RND.random(), RND.random()) for _ in CELLS]

def shimmer(i, n, t):
    """Idle: a soft bright band sweeping up the dome once per loop, plus a few twinkling cells."""
    r0, r1, r2 = CELL_RND[i]
    h = (n.z + 1) / 2
    band = math.exp(-(((h - t) + 0.5) % 1.0 - 0.5) ** 2 / 0.012)
    tw = max(0.0, math.sin(math.tau * (t * 2 + r0))) ** 12 * (r1 > 0.6)
    return dict(fill=0.62 + 0.25 * band + 0.15 * r2, hot=0.22 * band + 0.55 * tw)

HIT = Vector((1.0, 0.0, 0.42)).normalized()

def ripple(i, n, u):
    """Hit: a white flash at the impact, a ring of hot, dented cells running out over the dome."""
    base = shimmer(i, n, 0.0)
    d = (n - HIT).length
    r = 0.05 + 1.25 * u ** 0.75
    wave = math.exp(-((d - r) / 0.16) ** 2) * (1 - u) ** 0.9
    core = math.exp(-(d / 0.22) ** 2) * max(0.0, 1 - u * 2.2)
    base['hot'] = min(1.3, base['hot'] + 1.5 * wave + 1.4 * core)
    base['fill'] = min(1.0, base['fill'] + 0.35 * wave + 0.4 * core)
    base['push'] = -0.07 * core - 0.05 * wave * math.sin(d * 14)
    return base

def flicker(i, n, f):
    """Power down over 6 frames: surge, drop out, stutter back dim, crumble, a few dying cells, gone."""
    r0, r1, r2 = CELL_RND[i]
    base = shimmer(i, n, 0.0)
    if f == 0: return dict(fill=1.0, hot=0.55 + 0.3 * r0)
    if f == 1: return None if r0 < 0.55 else dict(fill=0.45, hot=0.1 * r1)
    if f == 2: return None if r0 < 0.2 else dict(fill=0.5 + 0.2 * r2, hot=0.05)
    if f == 3: return None if r0 < 0.72 or r1 < 0.3 else dict(fill=0.4, hot=0.35 * r2)
    if f == 4: return None if r0 < 0.9 else dict(fill=0.3, hot=0.6, scale=0.8)
    return None if r0 < 0.97 else dict(fill=0.2, hot=0.3, scale=0.6)

def job_shield():
    """The front shield: idle, hit ripple, flicker/off. Faces game angle 0 (+x) at dir 0, like every mn sprite.
    Origin = the captain's ground origin (his (x, y)); the dome wraps his front half."""
    m = shield_mat()
    seqs = [('boss_shield', 6, lambda i, n, f: shimmer(i, n, f / 6), lambda f: (0.55, 0.0)),
            ('boss_shield_hit', 6, lambda i, n, f: ripple(i, n, f / 5), lambda f: (0.55 + 0.45 * max(0, 1 - f / 3), 0.6 * max(0, 1 - f / 3))),
            ('boss_shield_off', 6, flicker, lambda f: ((0.9, 0.3, 0.6, 0.15, 0.25, 0.0)[f], (0.5, 0, 0, 0, 0.2, 0)[f]))]
    for name, nf, state, arc in seqs:
        if ONLY_SUB and name not in ONLY_SUB: continue
        fx.clear_scene_meshes()
        root = mn.link(bpy.data.objects.new('root', None))
        FR = list(range(1, nf + 1)); objs = []
        for f in FR:
            M = Mesh()
            hex_cells(M, front_keep, front_shape, lambda i, n: state(i, n, f - 1))
            g, h = arc(f - 1)
            if g > 0: ground_arc(M, SH_RX, SH_RY, -SH_AZ, SH_AZ, glow=g * 0.7, hot=h)
            o = M.obj(f'{name}_{f}', m); o.parent = root
            fx.only_on([o], f, FR); objs.append(o)
        # common bounds: a full-res dummy frame so every state shares one canvas per sprite
        for side, suf in ((-1.0, '_front'), (1.0, '_back')):
            set_side(side)
            mn.render('fx/' + name + suf, objs=objs, root=root, dirs=DIRS, frames=FR, passes=('beauty',))
        set_side(0.0)

def job_bubble():
    """50 % phase change: the shield wraps all the way round him, flares white, cracks and shatters.
    Origin = the captain's ground origin. 8 frames, ~14 fps."""
    m = shield_mat(); fx.clear_scene_meshes()
    FR = list(range(1, 9)); objs = []
    RX = RY = 1.3; RZ = 1.6; Z0 = 0.55
    for f in FR:
        u = (f - 1) / 7; M = Mesh()
        grow = (0.8, 0.95, 1.04, 1.0, 1.0, 1.0, 1.0, 1.0)[f - 1]
        shape = lambda n, g=grow: ell(n, RX * g, RY * g, RZ * g, Z0)
        def st(i, n, f=f):
            r0, r1, r2 = CELL_RND[i]
            if f == 1: return dict(fill=0.7 if n.x > -0.1 else 0.35 * (r0 > 0.4), hot=0.5) if (n.x > -0.1 or r0 > 0.4) else None
            if f == 2: return dict(fill=0.72, hot=0.1 + 0.15 * r0)          # kept blue (front+back layers add up)
            if f == 3: return dict(fill=0.8, hot=0.22 + 0.3 * (r1 > 0.6))
            if f == 4: return dict(fill=0.7, hot=0.25 + 0.6 * (r0 > 0.7), line=1.0) if r1 > 0.08 else None
            k = (f - 4) / 4                               # shatter: cells fly outward, tumble, shrink and fade
            if r0 < k * 0.5: return None
            sp = 0.25 + 0.6 * r2
            return dict(fill=0.85 * (1 - k * 0.7), hot=0.7 * (1 - k), move=n * sp * k * 1.6 + Vector((0, 0, -0.25 * k * k)),
                        spin=(r1 - 0.5) * 5 * k, scale=1 - 0.55 * k)
        hex_cells(M, lambda n: True, shape, st)
        if f <= 5:
            g = (0.6, 1.0, 1.0, 0.8, 0.3)[f - 1]
            ground_arc(M, RX * grow * math.sqrt(max(0.0, 1 - (Z0 / RZ) ** 2)) * 1.0, RY * grow, -math.pi, math.pi, glow=g, hot=0.6 * g, steps=72)
        o = M.obj(f'bubble_{f}', m); fx.only_on([o], f, FR); objs.append(o)
    for side, suf in ((-1.0, '_front'), (1.0, '_back')):
        set_side(side)
        mn.render('fx/boss_bubble' + suf, objs=objs, frames=FR, passes=('beauty',))
    set_side(0.0)

# ---------------------------------------------------------------------------
# Generator burst (0 %): blue electric explosion
# ---------------------------------------------------------------------------
BLUE = {   # rim -> core, strength (as explosion.py's BLUE, a touch brighter)
    'white': (['#2a6aff', '#5aa8ff', '#a8e0ff', '#f0faff'], 0.85),
    'yellow': (['#1a40e0', '#3a80ff', '#7ac4ff', '#d0f0ff'], 0.8),
    'orange': (['#1a2ab8', '#2a6aff', '#6ab8ff', '#c0eaff'], 0.75),
    'red': (['#10186a', '#1a2a9a', '#2a5ae0', '#6aa8ff'], 0.6),
    'ember': (['#10142a', '#18204a', '#203a80', '#3a6ac8'], 0.5),
}
HEAT = {
    'white': (['#ff6a00', '#ffa400', '#ffd840', '#fff6c8'], 0.95),
    'yellow': (['#f03400', '#ff6e00', '#ffa800', '#ffe060'], 0.85),
    'orange': (['#c01808', '#ff4400', '#ff9400', '#ffe060'], 0.75),
    'red': (['#600c06', '#a01406', '#e03a04', '#ff7a00'], 0.7),
    'ember': (['#2a1210', '#481810', '#80240c', '#c84410'], 0.6),
}
LEVELS = ['white', 'yellow', 'orange', 'red', 'ember', 'smoke']

def heat_mats(table, pre):
    M = {k: fx.fire_mat(pre + k, c, strength=s, height_cool=0.25) for k, (c, s) in table.items()}
    M['smoke'] = fx.smoke_mat(pre + 'smoke', '#4c5262'); M['smoke2'] = fx.smoke_mat(pre + 'smoke2', '#30323a')
    return M

def heat_of(a):
    for lim, k in zip((0.1, 0.24, 0.38, 0.52, 0.64), LEVELS):
        if a < lim: return k
    return 'smoke'

def sm(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def aim(o, d): o.rotation_euler = Vector(d).normalized().to_track_quat('Z', 'Y').to_euler()

def bolt_curve(name, pts, r, m):
    """A tube along pts (lightning), as a mesh (so it gets an outline)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 1
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts): p.co = (*q, 1.0)
    co = mn.link(bpy.data.objects.new(name + '_c', cu)); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(co.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(co, do_unlink=True)
    o = mn._obj(name, me); mn.assign(o, m); mn.smooth(o); return o

def zigzag(rnd, a, b, n=7, jit=0.12):
    a, b = Vector(a), Vector(b); d = b - a; side = d.orthogonal().normalized(); up = d.cross(side).normalized()
    pts = [a]
    for k in range(1, n):
        t = k / n; j = jit * math.sin(math.pi * t)
        pts.append(a + d * t + side * rnd.uniform(-j, j) + up * rnd.uniform(-j, j))
    pts.append(b); return [tuple(p) for p in pts]

def hex_prism(name, r, th, m):
    bm = bmesh.new()
    vs = [bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0)) for a in [k * math.tau / 6 for k in range(6)]]
    f = bm.faces.new(vs); ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += th
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = mn._obj(name, me); mn.assign(o, m); return o

def job_gen_burst():
    """The pack blows at 0 %: white-blue flash, blue fire puffs, lightning arcs, hex shards of the shield
    emitter and bits of the pack's casing, a floor shock ring, then grey-blue smoke.
    Ground origin = the ground point under the generator (the burst's centre sits PACK_Z above it); with the
    captain facing angle a, that's his (x, y) + 0.45 * (-cos a, -sin a) (the pack is on his back)."""
    fx.clear_scene_meshes()
    PACK_Z = 1.45; R = 1.25; N = 12; FR = list(range(1, N + 1)); rnd = random.Random(31)
    M = heat_mats(BLUE, 'gb_')
    arc_m = fx.glow('gb_arc', '#8ad8ff', 1.4); arc2 = fx.glow('gb_arc2', '#3a8cff', 1.4)
    shard_m = fx.fire_mat('gb_shard', ['#1a50ff', '#3a90ff', '#8ad4ff', '#e0f6ff'], strength=0.9, height_cool=0.0)
    case_m = fx.worn('gb_case', '#5a606c', 0.45, 0.5, grime=0.6)
    haz_m = fx.worn('gb_haz', '#e8c34f', 0.5, 0.1, grime=0.5, stripes=('#e8c34f', '#1c1c20'), stripe_k=9.0)
    ring_m = fx.fire_mat('gb_ring', BLUE['orange'][0], strength=0.8, height_cool=0.0)
    C = Vector((0, 0, PACK_Z))
    puffs = []
    for k in range(14):
        a = rnd.uniform(0, math.tau); el = rnd.uniform(-0.5, 1.1)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) * 0.85, math.sin(el)))
        puffs.append(dict(d=d, dist=rnd.uniform(0.2, 0.7), r=rnd.uniform(0.3, 0.48), t0=rnd.uniform(0, 0.1) * (k > 0), seed=rnd.randint(0, 999), rise=rnd.uniform(0.2, 0.5)))
    arcs = []
    for k in range(9):
        a = k / 9 * math.tau + rnd.uniform(-0.3, 0.3)
        arcs.append(dict(a=a, el=rnd.uniform(-0.6, 0.7), l=rnd.uniform(0.8, 1.25), t=rnd.choice([0, 1, 2, 3, 5]), seed=rnd.randint(0, 999)))
    shards = [dict(d=Vector((math.cos(a), math.sin(a) * 0.9, rnd.uniform(-0.2, 0.9))).normalized(), sp=rnd.uniform(0.8, 1.4),
                   spin=Vector((rnd.uniform(-7, 7), rnd.uniform(-7, 7), rnd.uniform(-7, 7))), s=rnd.uniform(0.07, 0.11))
              for a in [rnd.uniform(0, math.tau) for _ in range(11)]]
    chunks = [dict(d=Vector((math.cos(a), math.sin(a) * 0.9, rnd.uniform(0.0, 0.9))).normalized(), sp=rnd.uniform(0.7, 1.2),
                   spin=Vector((rnd.uniform(-6, 6), rnd.uniform(-6, 6), rnd.uniform(-6, 6))), s=rnd.uniform(0.08, 0.13), haz=k % 3 == 0)
              for k, a in enumerate([rnd.uniform(0, math.tau) for _ in range(7)])]
    allobjs = []
    for i, f in enumerate(FR):
        u = i / (N - 1); glow, objs, dark = [], [], []
        if u < 0.3:                                              # the flash
            k = 1 - u / 0.3
            glow.append(fx.lumpy('flash', R * (0.38 + 0.3 * (1 - k)) * (0.6 + 0.4 * k), C, M['white'], seed=3, amp=0.12))
        for p in puffs:
            a = (u - p['t0']) / (1 - p['t0'])
            if a < 0: continue
            size = p['r'] * R * (0.35 + 0.65 * sm(a / 0.25)) * (1 - sm((a - 0.6) / 0.48)) ** 0.8
            if size < 0.03: continue
            pos = C + p['d'] * R * p['dist'] * (1 - (1 - min(1, a / 0.5)) ** 2.2) + Vector((0, 0, R * p['rise'] * a * a))
            pos.z = max(pos.z, size * 0.5)
            lvl = heat_of(a)
            mm = M[lvl] if lvl != 'smoke' else (M['smoke'] if p['seed'] % 3 else M['smoke2'])
            (objs if lvl == 'smoke' else glow).append(fx.lumpy('puff', size, pos, mm, seed=p['seed'] + i * 0.15, amp=0.16))
        for k_, a_ in enumerate(arcs):                           # lightning: crackling arcs, re-rolled each frame
            if u > 0.62: break
            if (i + a_['t']) % 3 == 2 and u > 0.15: continue
            r_ = random.Random(a_['seed'] + i * 101)
            ln = R * a_['l'] * (0.55 + 0.6 * sm(u / 0.3)) * (1 - 0.4 * sm((u - 0.3) / 0.3))
            d = Vector((math.cos(a_['a']) * math.cos(a_['el']), math.sin(a_['a']) * math.cos(a_['el']) * 0.85, math.sin(a_['el'])))
            end = C + d * ln; end.z = max(0.02, end.z)
            pts = zigzag(r_, C + d * 0.15, end, n=8, jit=0.16)
            glow.append(bolt_curve('arc', pts, 0.045 if u < 0.3 else 0.032, arc_m if (i + k_) % 2 else arc2))
            if r_.random() < 0.6:                                # a fork
                mid = Vector(pts[4]); fd = (d + Vector((r_.uniform(-0.8, 0.8), r_.uniform(-0.8, 0.8), r_.uniform(-0.5, 0.5)))).normalized()
                e2 = mid + fd * ln * 0.4; e2.z = max(0.02, e2.z)
                glow.append(bolt_curve('fork', zigzag(r_, mid, e2, n=4, jit=0.08), 0.026, arc_m))
        for s in shards:                                         # glowing hex shards of the emitter
            if u > 0.8: break
            dist = R * s['sp'] * (0.15 + 0.95 * (1 - (1 - u) ** 2))
            pos = C + s['d'] * dist + Vector((0, 0, -0.9 * u * u)); pos.z = max(0.03, pos.z)
            o = hex_prism('shard', s['s'] * (1 - 0.4 * u), 0.025, shard_m); o.location = pos; o.rotation_euler = s['spin'] * u; glow.append(o)
        for c in chunks:                                         # casing bits (one in three with hazard stripes)
            if u > 0.88: break
            dist = R * c['sp'] * (0.15 + 0.9 * (1 - (1 - u) ** 1.8))
            pos = C + c['d'] * dist + Vector((0, 0, -1.3 * u * u)); pos.z = max(0.05, pos.z)
            o = mn.box('chunk', (c['s'] * 1.6, c['s'], c['s'] * 0.5), m=haz_m if c['haz'] else case_m, bevel=0.012)
            o.location = pos; o.rotation_euler = c['spin'] * u; dark.append(o)
        if u < 0.5:                                              # floor shock ring
            k = u / 0.5; rr = R * (0.5 + 0.9 * sm(k)); w = R * 0.12 * (1 - k) + 0.012
            glow.append(fx.ring('shock', rr, w, 0.025, loc=(0, 0, 0.01), m=ring_m, verts=56))
        mn.outline(objs, thickness=0.012); mn.outline(dark, thickness=0.012)
        mn.outline(glow, thickness=0.012, color='#0a1240')
        fx.only_on(objs + glow + dark, f, FR); allobjs += objs + glow + dark
    li = fx.point_light('burst', C, (0.5, 0.75, 1.0), 0, R)
    for i, f in enumerate(FR):
        li.data.energy = 160 * R * max(0.0, 1 - i / 6) ** 2; li.data.keyframe_insert('energy', frame=f)
    mn.render('fx/boss_gen_burst', objs=allobjs, frames=FR)

# ---------------------------------------------------------------------------
# Buckshot muzzle blast, pellet, spin bolt
# ---------------------------------------------------------------------------
def job_muzzle():
    """An orange-red cone of flame out of the cannon's mouth with five buckshot spikes, a mouth ring and smoke.
    4 frames (play once at ~20 fps). Faces game angle 0 (+x) at dir 0. Origin = the MUZZLE ITSELF (the cannon
    mouth, not a ground point): draw it at the muzzle's screen position."""
    fx.clear_scene_meshes()
    M = heat_mats(HEAT, 'mz_')
    root = mn.link(bpy.data.objects.new('root', None))
    FR = [1, 2, 3, 4]; allobjs = []
    spikes = [(-0.42, 0.75), (-0.2, 0.95), (0.0, 1.0), (0.2, 0.9), (0.42, 0.78)]
    for i, f in enumerate(FR):
        u = i / 3; glow, smoke = [], []
        lvl = ('white', 'yellow', 'orange', 'red')[i]
        k = (1.0, 0.9, 0.6, 0.3)[i]
        if i < 3:
            L_ = 0.62 * k + 0.12                                # the flared cone (a bell opening away from the mouth)
            prof = [0.05, 0.13, 0.2, 0.25, 0.27, 0.25, 0.19, 0.1, 0.0]
            o = fx.lathe('cone', [r * (0.55 + 0.45 * k) for r in prof], [(0, 0, L_ * t / 8) for t in range(9)], m=M[('orange', 'orange', 'red')[i]], segs=20, flat=0.8)
            o.location = (0.02, 0, 0); aim(o, (1, 0, 0)); glow.append(o)
            for a, l in spikes:                                 # five buckshot jets fanning out past the cone
                ln = (1.05 * l if i == 0 else 0.85 * l if i == 1 else 0.45 * l)
                o = fx.tongue('spike', (0, 0, 0), ln, 0.05 * (1 - 0.35 * u), m=M['yellow' if i == 0 else 'orange'], flat=0.7, segs=8, n=8)
                o.location = (0.05, 0, 0); aim(o, (math.cos(a), math.sin(a) * 0.9, 0.04)); glow.append(o)
            o = fx.lumpy('mouth', 0.11 * k + 0.04, (0.04, 0, 0), M[('white', 'yellow', 'orange')[i]], seed=4 + i, amp=0.2); glow.append(o)
        for j in range((0, 2, 3, 3)[i]):                        # small smoke puffs drifting forward and up
            s = (0.045 + 0.022 * i) * (1 - 0.2 * j)
            smoke.append(fx.lumpy('smoke', s, (0.18 + 0.13 * j + 0.08 * i, (j - 1) * 0.07, 0.04 * i + 0.03 * j), M['smoke'], seed=j + 3 * i, amp=0.2))
        for o in glow + smoke: o.parent = root
        mn.outline(smoke, thickness=0.01); mn.outline(glow, thickness=0.01, color='#3a1006')
        fx.only_on(glow + smoke, f, FR); allobjs += glow + smoke
    mn.render('fx/boss_muzzle', objs=allobjs, root=root, dirs=DIRS, frames=FR)

def glow_disc(name, r, color, alpha=0.55, z=0.0):
    """A soft round glow facing the camera (radial alpha falloff)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new; N.clear()
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = fx.rgba(color)
    em.inputs['Strength'].default_value = 1.0
    tc = N.new('ShaderNodeTexCoord'); ln = N.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L(tc.outputs['Object'], ln.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = r
    mr.inputs['To Min'].default_value = alpha; mr.inputs['To Max'].default_value = 0.0; L(ln.outputs['Value'], mr.inputs['Value'])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.6; L(mr.outputs['Result'], pw.inputs[0])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L(pw.outputs[0], mx.inputs[0]); L(tr.outputs[0], mx.inputs[1]); L(em.outputs[0], mx.inputs[2]); L(mx.outputs[0], out.inputs['Surface'])
    o = mn.cyl(name, r, 0.001, loc=(0, 0, 0), m=m, verts=32, bevel=0)
    o.rotation_euler = (math.radians(90 - mn.ELEVATION), 0, 0)   # face the camera, sit behind the core on the view axis (no screen offset)
    o.location = (0, 0.3 * math.cos(fx.E), z - 0.3 * math.sin(fx.E))
    return o

def job_pellet():
    """Buckshot pellet: a white-hot slug in an orange-red shell with a dark outline (reads on the red phase-2
    floor) and a soft glow. 4-frame flicker loop. Origin = the pellet's centre (draw at its position)."""
    fx.clear_scene_meshes()
    M = heat_mats(HEAT, 'pl_')
    FR = [1, 2, 3, 4]; allobjs = []
    for i, f in enumerate(FR):
        k = (1.0, 0.92, 1.05, 0.95)[i]
        core = fx.lumpy('pellet', 0.085 * k, (0, 0, 0), M['yellow'], seed=i, amp=0.08, sub=3)
        mn.outline([core], thickness=0.012, color='#3a0a04')
        halo = glow_disc('halo%d' % i, 0.2 * k, '#ff5a1a', alpha=0.55)
        fx.only_on([core, halo], f, FR); allobjs += [core, halo]
    mn.render('fx/boss_pellet', objs=allobjs, frames=FR)

def job_bolt():
    """Spin bolt: an elongated red-orange slug with a white core and a twisting bright band (the spin), a
    short flame tail and a soft glow. 16 dirs (dir 0 flies towards +x) x 4-frame loop. Origin = its centre."""
    fx.clear_scene_meshes()
    M = heat_mats(HEAT, 'bt_')
    root = mn.link(bpy.data.objects.new('root', None))
    band = fx.glow('bt_band', '#fff0b0', 1.2)
    FR = [1, 2, 3, 4]; allobjs = []
    for i, f in enumerate(FR):
        objs = []
        body = fx.lumpy('bolt', 0.075, (0.04, 0, 0), M['orange'], seed=7, amp=0.05, sub=3, squash=(2.6, 1, 1)); objs.append(body)
        tail = fx.tongue('tail', (0, 0, 0), 0.34 + 0.04 * (i % 2), 0.07, m=M['orange'], flat=1.0, segs=12, n=10)
        tail.location = (-0.08, 0, 0); aim(tail, (-1, 0, 0)); objs.append(tail)
        for j in range(2):                                      # the spinning band: two helix turns, phase per frame
            ph = i / 4 * math.tau + j * math.pi
            pts = [(-0.14 + 0.36 * t / 16, math.cos(ph + t / 16 * 2 * math.tau) * 0.07 * math.sin(math.pi * t / 16) ** 0.5,
                    math.sin(ph + t / 16 * 2 * math.tau) * 0.07 * math.sin(math.pi * t / 16) ** 0.5) for t in range(17)]
            objs.append(bolt_curve('band', pts, 0.011, band))
        mn.outline(objs, thickness=0.011, color='#3a0a04')
        halo = glow_disc('bhalo%d' % i, 0.26, '#ff4a14', alpha=0.45)
        for o in objs: o.parent = root
        fx.only_on(objs + [halo], f, FR); allobjs += objs + [halo]
    mn.render('fx/boss_bolt', objs=allobjs, root=root, dirs=DIRS, frames=FR)

# ---------------------------------------------------------------------------
# Dash telegraph line, fire trail
# ---------------------------------------------------------------------------
def dash_mat(phase):
    """Red floor strip, 1 unit along x: soft edges, a hot centre line, chevrons marching along +x."""
    m = bpy.data.materials.new('dash%d' % phase); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new; N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    def mt(op, a, b=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: L(x, n.inputs[i])
        return n.outputs[0]
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sp.inputs[0])
    x, y = sp.outputs['X'], sp.outputs['Y']
    ay = mt('ABSOLUTE', y); HW = 0.17
    a = mt('DIVIDE', ay, HW)                                     # 0 centre .. 1 edge
    soft = mt('SUBTRACT', 1.0, mt('POWER', a, 2.0), clamp=True)
    core = mt('EXPONENT', mt('MULTIPLY', mt('POWER', mt('DIVIDE', y, 0.028), 2.0), -1.0))
    ch = mt('FRACT', mt('DIVIDE', mt('SUBTRACT', mt('ADD', x, mt('MULTIPLY', ay, 0.9)), phase * 0.125), 0.5))
    chev = mt('MULTIPLY', mt('LESS_THAN', ch, 0.32), mt('LESS_THAN', a, 0.78))
    edge = mt('MULTIPLY', mt('GREATER_THAN', a, 0.8), mt('LESS_THAN', a, 0.95))   # crisp border lines
    alpha = mt('ADD', mt('ADD', mt('MULTIPLY', soft, 0.5), mt('MULTIPLY', chev, 0.8)), mt('ADD', mt('MULTIPLY', core, 0.9), mt('MULTIPLY', edge, 0.85)), clamp=True)
    hot = mt('MAXIMUM', mt('MULTIPLY', core, 1.0), mt('MULTIPLY', chev, 0.7))
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L(hot, mx.inputs[0])
    mx.inputs[6].default_value = fx.rgba('#ff1a00'); mx.inputs[7].default_value = fx.rgba('#ffa040')
    em = N.new('ShaderNodeEmission'); L(mx.outputs[2], em.inputs['Color']); em.inputs['Strength'].default_value = 1.4
    tr = N.new('ShaderNodeBsdfTransparent'); ms = N.new('ShaderNodeMixShader')
    L(alpha, ms.inputs[0]); L(tr.outputs[0], ms.inputs[1]); L(em.outputs[0], ms.inputs[2]); L(ms.outputs[0], out.inputs['Surface'])
    return m

def job_dash_line():
    """The dash telegraph: a 1.0 x 0.34 unit glowing red floor strip, centred on its origin, running along the
    sprite's direction (dir 0 = +x; 32 dirs). Lay segments end to end at 1.0-unit steps along the dash path
    (their ends butt seamlessly; chevrons point the way he'll go). 4-frame chevron march loop (~12 fps)."""
    fx.clear_scene_meshes()
    root = mn.link(bpy.data.objects.new('root', None))
    FR = [1, 2, 3, 4]; objs = []
    for i, f in enumerate(FR):
        bm = bmesh.new(); W = 0.17
        nx, ny = 24, 6
        vs = [[bm.verts.new((-0.5 + gx / nx, -W + 2 * W * gy / ny, 0.003)) for gy in range(ny + 1)] for gx in range(nx + 1)]
        for gx in range(nx):
            for gy in range(ny): bm.faces.new((vs[gx][gy], vs[gx + 1][gy], vs[gx + 1][gy + 1], vs[gx][gy + 1]))
        o = fx._mesh_obj('dash%d' % i, bm, dash_mat(i), smooth=False); o.parent = root
        fx.only_on([o], f, FR); objs.append(o)
    mn.render('fx/boss_dash_line', objs=objs, root=root, dirs=32 if not QUICK else 4, frames=FR, passes=('beauty',))

def job_trail(name, seed):
    """Dash fire trail: a ~1.0 x 0.6 burning floor patch (charred smear, embers, low flame tongues), 8-frame
    loop (~12 fps). Origin = the patch centre on the floor. Lay one every ~0.7 units along the dash path,
    alternating a/b, and let them burn out by fading (or swap to fx/fire_s for the last second)."""
    fx.clear_scene_meshes()
    rnd = random.Random(seed); N = 8; FR = list(range(1, N + 1))
    flame = [fx.fire_mat('tr_flame%d' % k, fx.FIRE, strength=st, height_cool=hc) for k, (st, hc) in enumerate(((0.9, 0.6), (1.0, 0.45)))]
    ember = fx.fire_mat('tr_ember', ['#2a1612', '#6a1e12', '#e0501c', '#ffb040'], strength=0.9, stops=(0.0, 0.45, 0.72, 0.9), height_cool=0.0)
    char = fx.worn('tr_char', '#2a2422', 0.85, 0.1, grime=0.5)
    soot = fx.decal_mat('tr_soot', '#1a1614', 0.55, alpha=0.8, edge=0.5, noise_scale=5.0, center='#3a1a10', center_k=0.4)
    glowd = fx.decal_mat('tr_glow', '#ff5a10', 0.38, alpha=0.5, edge=0.6, noise_scale=6.0)
    for mm in (glowd,):
        b = mm.node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = fx.rgba('#ff5a10'); b.inputs['Emission Strength'].default_value = 0.9
    tongues = []
    for k in range(7):
        x = -0.42 + 0.84 * (k + rnd.uniform(-0.3, 0.3)) / 6; y = rnd.uniform(-0.14, 0.14)
        tongues.append((x, y, rnd.uniform(0.28, 0.5) * (1.15 - abs(x)), rnd.uniform(0, math.tau)))
    tongues.sort(key=lambda t: -t[1])
    allobjs = []
    base = []
    s1 = fx.flat_poly('soot', fx.blob_pts(0.55, seed, rough=0.22, ry=0.32), z=0.002, m=soot, grid=3)
    s2 = fx.flat_poly('glowbed', fx.blob_pts(0.4, seed + 3, rough=0.25, ry=0.2), z=0.004, m=glowd, grid=3)
    base += [s1, s2]
    for i, f in enumerate(FR):
        ph_t = math.tau * i / N; objs = []
        for j, (x, y, h, ph) in enumerate(tongues):
            fl = 0.8 + 0.2 * math.sin(ph_t + ph) + 0.08 * math.sin(2 * ph_t + 2 * ph)
            w = 0.085 + 0.03 * (h > 0.4)
            sway = (math.sin(ph_t + ph) * w * 0.9 - 0.06, math.cos(ph_t + ph * 1.3) * w * 0.4)   # leaning back along the trail
            objs.append(fx.tongue('t%d' % j, (x, y, 0.01), h * fl / math.cos(fx.E) * 0.8, w, sway, flame[j % 2], wob=0.12, wob_ph=ph - 2 * ph_t, flat=0.85, segs=14))
        for j in range(3):
            q = (i / N + j / 3) % 1.0; x = -0.3 + 0.3 * j
            sz = 0.05 * (1 - q) ** 0.7
            if sz > 0.012: objs.append(fx.tongue('lick%d' % j, (x, 0.0, (0.25 + 0.35 * q)), sz * 3.0, sz, (0.02, 0), flame[0], flat=0.85, segs=10, n=8))
        mn.outline(objs, thickness=0.01, color='#4a1408')
        fx.only_on(objs, f, FR); allobjs += objs
    for j in range(6):                                          # embers and charred bits (all frames)
        a = j * 1.1 + seed; r = 0.3 + 0.12 * (j % 2)
        o = fx.lumpy('coal%d' % j, 0.045, (math.cos(a) * r, math.sin(a) * r * 0.45, 0.015), ember if j % 2 else char, seed=j + seed, amp=0.25, sub=2, squash=(1.2, 1.0, 0.55))
        mn.outline([o], thickness=0.008, color='#2a0e06'); base.append(o)
    fx.point_light('trail', (0, 0, 0.3), (1.0, 0.55, 0.25), 18, 0.4)
    mn.render('fx/' + name, objs=allobjs + base, frames=FR)

# ---------------------------------------------------------------------------
# Dazed stars
# ---------------------------------------------------------------------------
def star_mesh(name, r, m, th=0.035, pts=5, inner=0.48):
    bm = bmesh.new()
    vs = []
    for k in range(pts * 2):
        a = math.pi / 2 + k * math.pi / pts; rr = r if k % 2 == 0 else r * inner
        vs.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, -th / 2)))
    f = bm.faces.new(vs); ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += th
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = mn._obj(name, me); mn.assign(o, m)
    mn.bev(o, 0.012, 2); return o

def job_dazed():
    """Three cartoon stars (and a tiny one) circling over a head, 8-frame loop (~10 fps, one turn per loop).
    Origin = the centre of the orbit: draw it ~0.25 units above the top of the head (screen space). The stars
    face the camera and spin; the far side of the orbit is smaller."""
    fx.clear_scene_meshes()
    ym = mn.mat('star', '#ffb800', 0.35, 0.0, emit='#ffaa00', emit_strength=0.5)
    wm = mn.mat('star_w', '#fff4c0', 0.35, 0.0, emit='#fff4c0', emit_strength=0.8)
    FR = list(range(1, 9)); allobjs = []
    STARS = [(0.0, 0.15, ym), (math.tau / 3, 0.13, ym), (2 * math.tau / 3, 0.14, ym), (math.tau / 6 * 5.0, 0.07, wm)]
    for i, f in enumerate(FR):
        t = i / 8 * math.tau; objs = []
        for k, (a0, r, m) in enumerate(STARS):
            a = a0 + t
            p = Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.04 * math.sin(2 * a + k)))
            depth = 0.85 + 0.15 * -math.sin(a)                 # nearer (orbit's front, -y) a bit bigger
            o = star_mesh('star%d' % k, r * depth, m)
            o.rotation_mode = 'ZYX'; o.rotation_euler = (math.radians(90 - mn.ELEVATION), 0, t * (1.0 if k % 2 else -1.0) + k)
            o.location = p; objs.append(o)
        mn.outline(objs, thickness=0.012)
        fx.only_on(objs, f, FR); allobjs += objs
    mn.render('fx/boss_dazed', objs=allobjs, frames=FR)

# ---------------------------------------------------------------------------
ONLY_SUB = [a for a in ONLY if a.startswith('boss_shield')]
JOBS = [('shield', job_shield), ('bubble', job_bubble), ('gen_burst', job_gen_burst), ('muzzle', job_muzzle),
        ('pellet', job_pellet), ('bolt', job_bolt), ('dash_line', job_dash_line),
        ('trail', lambda: (job_trail('boss_trail_a', 3), job_trail('boss_trail_b', 8))), ('dazed', job_dazed)]

def _no_denoise(scene, *a):          # pure emission: nothing to denoise, and OIDN smears the thin hex lines
    scene.cycles.use_denoising = False

t0 = time.time()
mn.reset(); fx.punchy()
s = bpy.context.scene; s.render.threads_mode = 'FIXED'; s.render.threads = THREADS
bpy.app.handlers.render_pre.append(_no_denoise)
for n, job in JOBS:
    if ONLY and n not in ONLY and not (n == 'shield' and ONLY_SUB): continue
    t1 = time.time(); job(); print(f'[boss_fx] {n}: {time.time() - t1:.0f} s')
print(f'[boss_fx] done in {time.time() - t0:.0f} s')
