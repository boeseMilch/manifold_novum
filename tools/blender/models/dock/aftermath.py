"""Dr. Varga's derelict lab, after the fight: clutter that tells the story (pirates boarded, something
from the lab broke out, they dragged Varga to their claw). No creature here: this set is shared by
whichever lab creature the mission picks.

    blender -b --factory-startup --python tools/blender/models/dock/aftermath.py -- [quick] [only=a,b,...]

`quick` renders at 16 samples into the scratch dir given by $AFTER_QUICK (no manifest entry);
`only` picks jobs by name (the names below without the 'lab_' prefix, or a group: decals, wall, props).

Every sprite is dock/lab_<thing>. Local frame (docklib, port layout): u = game x, v = game y (down the
screen), z up; 1 unit = 1 game unit. Origins:
  * floor props and decals: the centre of their footprint on the floor;
  * wall pieces (claw, notes board, wall scorch): the floor point at the foot of the back wall's face,
    centred (the game places them at (x, room.y)); they stand on/in the wall face v = 0 and over the
    wall top (z = 1.6, v from 0 to -0.7: the derelict's back walls, js/dock.js dockGeom / docklib);
  * freezer and benches: footprint centre; their back edge goes against a back wall.
Nothing here changes the game's footprints: these are new decor (the integrating agent picks spots
clear of the walking line along g.y, the crate, core, fire and objective spots).
"""
import sys, os, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import docklib as D
from docklib import *
import shiplib

A = D.args()
QUICK = 'quick' in A
ONLY = None
for a in A:
    if a.startswith('only='): ONLY = set(a[5:].split(','))
if QUICK:
    mn.SAMPLES = 16
    mn.OUT_DIR = os.environ.get('AFTER_QUICK', '/tmp/mn_aftermath'); mn._manifest_put = lambda *a, **k: None
else:
    mn.SAMPLES = 48

_orig_reset = mn.reset
def _reset():                                     # no usable GPU here: CPU, a share of the cores
    s = _orig_reset(); s.cycles.device = 'CPU'
    s.render.threads_mode = 'FIXED'; s.render.threads = int(os.environ.get('AFTER_THREADS', '8'))
    return s
mn.reset = _reset

# ---------------------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------------------
def nool(o):
    """No outline for this one (decals, text, tiny bits)."""
    o['nool'] = 1; return o

def vprism(name, pts_uz, v0, v1, m=None, bevel=0.0):
    """A polygon in the wall plane (u, z), extruded from v0 to v1 (towards the camera = +v)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(P(u, v0, z)) for u, z in pts_uz]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=Vector((0, -(v1 - v0), 0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel: mn.bev(o, bevel, 2)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def plane(name, w, d, m, u=0.0, v=0.0, z=FLOOR_Z + 0.002, rotz=0.0, sub=1, face=False):
    """A flat w x d plane (decal carrier). face=True: standing on a wall face (w along u, d up z)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    n = max(1, sub)
    vs = [[bm.verts.new(((i / n - 0.5) * w, (j / n - 0.5) * d, 0)) for i in range(n + 1)] for j in range(n + 1)]
    for j in range(n):
        for i in range(n): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    o.location = P(u, v, z)
    o.rotation_euler = (R90, 0, 0) if face else (0, 0, -rotz)
    return nool(o)

def wrap_text(name, body, size, cu, cv, r, z, m, depth=0.003, bold=True):
    """Text wrapped round a vertical cylinder (centre cu, cv, radius r), centred on its front (+v) side."""
    o = label(name, body, size, (0, 0, 0), m=m, depth=depth, bold=bold)
    for vt in o.data.vertices:
        x, y, zt = vt.co.x, vt.co.y, vt.co.z
        a = x / r; rr = r + zt
        vt.co = Vector((cu + rr * math.sin(a), -(cv + rr * math.cos(a)), z + y))
    o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    return nool(o)

def stand(o, u, v, z, rx=0.0, ry=0.0, rz=0.0):
    o.location = P(u, v, z); o.rotation_euler = (rx, ry, rz); return o

def grp(objs, u=0.0, v=0.0, z=0.0, rot=(0, 0, 0)):
    e = mn.group('grp', [o for o in objs if o.parent is None], loc=P(u, v, z)); e.rotation_euler = rot
    return e

def cone(name, r0, r1, h, u, v, z, m, verts=24, bevel=0.01):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(u, v, z)
    if bevel: mn.bev(o, bevel)
    mn.assign(o, m); return mn.smooth(o)

def ragged(cu, cz, ru, rz, n, rng, jag=0.35):
    pts = []
    for k in range(n):
        a = k / n * math.tau; f = 1 - jag * rng.random() * (k % 2)
        pts.append((cu + math.cos(a) * ru * f, cz + math.sin(a) * rz * f))
    return pts

# ---------------------------------------------------------------------------------------------------
# Procedural decal and surface materials (Generated coords: 0..1 over the undeformed mesh -> -1..1)
# ---------------------------------------------------------------------------------------------------
class NB:
    def __init__(self, name):
        self.m = bpy.data.materials.new(name); self.m.use_nodes = True; self.nt = self.m.node_tree; self.N = self.nt.nodes
        self.N.clear(); self.out = self.N.new('ShaderNodeOutputMaterial')
        tc = self.N.new('ShaderNodeTexCoord'); self.gen = tc.outputs['Generated']
        sep = self.N.new('ShaderNodeSeparateXYZ'); self.L(self.gen, sep.inputs[0])
        self.gx, self.gy = sep.outputs[0], sep.outputs[1]
        self.x = self.op('MULTIPLY_ADD', self.gx, 2.0, -1.0); self.y = self.op('MULTIPLY_ADD', self.gy, 2.0, -1.0)
    def L(self, a, b): self.nt.links.new(a, b)
    def _in(self, sock, val):
        if isinstance(val, (int, float)): sock.default_value = val
        else: self.L(val, sock)
    def op(self, operation, a, b=None, c=None, clamp=False):
        n = self.N.new('ShaderNodeMath'); n.operation = operation; n.use_clamp = clamp
        self._in(n.inputs[0], a)
        if b is not None: self._in(n.inputs[1], b)
        if c is not None: self._in(n.inputs[2], c)
        return n.outputs[0]
    def mapr(self, v, a, b, c=0.0, d=1.0):
        n = self.N.new('ShaderNodeMapRange'); n.clamp = True
        self._in(n.inputs['Value'], v); n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b
        n.inputs['To Min'].default_value = c; n.inputs['To Max'].default_value = d
        return n.outputs[0]
    def vec(self, x, y, z=0.0):
        n = self.N.new('ShaderNodeCombineXYZ'); self._in(n.inputs[0], x); self._in(n.inputs[1], y); self._in(n.inputs[2], z)
        return n.outputs[0]
    def noise(self, vec, scale, detail=6.0, rough=0.55):
        n = self.N.new('ShaderNodeTexNoise'); self.L(vec, n.inputs['Vector']); n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']
    def voronoi_edge(self, vec, scale):
        n = self.N.new('ShaderNodeTexVoronoi'); n.feature = 'DISTANCE_TO_EDGE'; self.L(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale; return n.outputs['Distance']
    def white(self, v):
        n = self.N.new('ShaderNodeTexWhiteNoise'); n.noise_dimensions = '1D'; self._in(n.inputs['W'], v); return n.outputs['Value']
    def mix(self, f, a, b):
        n = self.N.new('ShaderNodeMix'); n.data_type = 'RGBA'; self._in(n.inputs['Factor'], f)
        for sock, c in ((n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(c, tuple): sock.default_value = (*c, 1) if len(c) == 3 else c
            else: self.L(c, sock)
        return n.outputs[2]
    def length(self, a, b):
        return self.op('SQRT', self.op('ADD', self.op('MULTIPLY', a, a), self.op('MULTIPLY', b, b)))
    def gen_scaled(self, sx, sy, sz=1.0, off=(0, 0, 0)):
        n = self.N.new('ShaderNodeMapping'); self.L(self.gen, n.inputs['Vector'])
        n.inputs['Scale'].default_value = (sx, sy, sz); n.inputs['Location'].default_value = off
        return n.outputs[0]
    def finish(self, alpha, color, rough=0.8, metal=0.0, emit=None, emit_strength=None, coat=0.0, bump=None, bump_strength=0.3):
        b = self.N.new('ShaderNodeBsdfPrincipled'); self._in(b.inputs['Base Color'], color) if not isinstance(color, tuple) else None
        if isinstance(color, tuple): b.inputs['Base Color'].default_value = (*color, 1)
        self._in(b.inputs['Roughness'], rough); self._in(b.inputs['Metallic'], metal)
        if coat: b.inputs['Coat Weight'].default_value = coat
        if emit is not None:
            if isinstance(emit, tuple): b.inputs['Emission Color'].default_value = (*emit, 1)
            else: self.L(emit, b.inputs['Emission Color'])
            self._in(b.inputs['Emission Strength'], emit_strength if emit_strength is not None else 1.0)
        if bump is not None:
            bn = self.N.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = bump_strength; self.L(bump, bn.inputs['Height']); self.L(bn.outputs[0], b.inputs['Normal'])
        if alpha is None:
            self.L(b.outputs[0], self.out.inputs['Surface']); return self.m
        mx = self.N.new('ShaderNodeMixShader'); tr = self.N.new('ShaderNodeBsdfTransparent')
        self._in(mx.inputs[0], alpha); self.L(tr.outputs[0], mx.inputs[1]); self.L(b.outputs[0], mx.inputs[2])
        self.L(mx.outputs[0], self.out.inputs['Surface'])
        return self.m

def C(h, g=1.0): return lift(h, g)

def scorch_mat(name, seed=0.0, heat=True):
    n = NB(name)
    w = n.noise(n.gen_scaled(1, 1, 1, (seed, seed * 0.7, 0)), 3.5, 6)
    r = n.op('ADD', n.length(n.x, n.y), n.op('MULTIPLY', n.op('SUBTRACT', w, 0.5), 0.5))
    ang = n.op('ARCTAN2', n.y, n.x)
    rays = n.noise(n.vec(n.op('MULTIPLY', ang, 1.7), n.op('MULTIPLY', r, 0.5), seed), 2.6, 3)
    outer = n.op('MULTIPLY', n.mapr(r, 1.0, 0.5), n.mapr(rays, 0.3, 0.58, 0.6, 1.0))
    core = n.mapr(r, 0.55, 0.18)
    speck = n.noise(n.gen_scaled(6, 6, 6, (seed, 0, 0)), 9.0, 2)
    alpha = n.op('MAXIMUM', n.op('MULTIPLY', outer, 0.95), core)
    alpha = n.op('MULTIPLY', alpha, n.mapr(speck, 0.25, 0.5, 0.75, 1.0))
    col = n.mix(n.mapr(r, 0.95, 0.45), C('#2e2420', 1.0), C('#060505', 1.0))
    if heat:   # heat-tint ring where the paint burned off: a faint blue-gold sheen
        ring_ = n.mapr(n.op('ABSOLUTE', n.op('SUBTRACT', r, 0.62)), 0.09, 0.0, 0.0, 0.45)
        col = n.mix(ring_, col, C('#5a5a8a', 1.0))
    return n.finish(alpha, col, rough=0.88)

def burn_mat(name, seed=0.0, ember=0.0):
    """A laser score along x: bright melted groove, sooty edges, tapered ends."""
    n = NB(name)
    warp = n.op('MULTIPLY', n.op('SUBTRACT', n.noise(n.vec(n.op('MULTIPLY', n.x, 0.6), seed, 0), 2.0, 2), 0.5), 0.35)
    ax = n.op('ABSOLUTE', n.x)
    taper = n.op('SUBTRACT', 1.0, n.op('POWER', ax, 4.0), clamp=True)
    wdt = n.op('MULTIPLY_ADD', taper, 0.8, 0.12)
    d = n.op('DIVIDE', n.op('ABSOLUTE', n.op('ADD', n.y, warp)), wdt)
    grain = n.noise(n.gen_scaled(8, 2, 1, (seed, 0, 0)), 6.0, 4)
    soot = n.op('MULTIPLY', n.mapr(d, 0.98, 0.5), n.mapr(grain, 0.3, 0.7, 0.7, 1.0))
    groove = n.op('MULTIPLY', n.mapr(d, 0.11, 0.04), n.mapr(ax, 0.94, 0.8))
    alpha = n.op('MAXIMUM', n.op('MULTIPLY', soot, 0.95), groove)
    tint = n.mapr(n.op('ABSOLUTE', n.op('SUBTRACT', d, 0.16)), 0.1, 0.0, 0.0, 0.8)
    col = n.mix(tint, C('#070606', 1.0), C('#4a3a4a', 1.0))
    col = n.mix(groove, col, C('#f0e6d8', 1.0))
    em = n.op('MULTIPLY', groove, ember) if ember else None
    return n.finish(alpha, col, rough=n.mapr(groove, 0, 1, 0.85, 0.3), metal=n.op('MULTIPLY', groove, 0.7),
                    emit=C('#ff7a2a', 1.0) if ember else None, emit_strength=em)

def drag_mat(name, seed=0.0):
    """Two heel tracks along +x (strong at the start, x = -1, fading towards +1), a scuffed struggle blot at the start."""
    n = NB(name)
    warp = n.op('MULTIPLY', n.op('SUBTRACT', n.noise(n.vec(n.op('MULTIPLY', n.x, 0.5), seed, 0), 2.0, 2), 0.5), 0.5)
    yy = n.op('ADD', n.y, warp)
    t1 = n.mapr(n.op('ABSOLUTE', n.op('SUBTRACT', yy, 0.4)), 0.17, 0.08)
    t2 = n.mapr(n.op('ABSOLUTE', n.op('ADD', yy, 0.4)), 0.17, 0.08)
    streak = n.mapr(n.noise(n.vec(n.op('MULTIPLY', n.x, 1.5), n.op('MULTIPLY', n.y, 30.0), seed), 1.0, 3), 0.35, 0.55, 0.55, 1.0)
    gaps = n.mapr(n.noise(n.vec(n.op('MULTIPLY', n.x, 5.0), seed + 3, 0), 1.0, 2), 0.3, 0.42, 0.35, 1.0)
    fade = n.mapr(n.x, 1.0, -0.4, 0.4, 1.0)
    tracks = n.op('MULTIPLY', n.op('MULTIPLY', n.op('MAXIMUM', t1, t2), streak), n.op('MULTIPLY', gaps, fade))
    bx = n.op('MULTIPLY', n.op('ADD', n.x, 0.84), 5.0)
    bw = n.noise(n.gen_scaled(4, 4, 1, (seed, 1, 0)), 4.0, 6)
    blob = n.mapr(n.op('ADD', n.length(bx, n.op('MULTIPLY', n.y, 1.05)), n.op('MULTIPLY', n.op('SUBTRACT', bw, 0.5), 0.9)), 1.0, 0.3, 0.0, 0.92)
    scr = n.op('MULTIPLY', n.mapr(n.noise(n.vec(n.op('MULTIPLY', n.x, 0.8), n.op('MULTIPLY', n.y, 70.0), seed + 7), 1.0, 2), 0.6, 0.64, 0.0, 0.5), fade)
    alpha = n.op('MAXIMUM', n.op('MAXIMUM', n.op('MULTIPLY', tracks, 0.97), blob), scr)
    return n.finish(alpha, C('#0c0a08', 1.0), rough=0.7)

def frost_mat(name, seed=0.0, dense=1.0):
    n = NB(name)
    w = n.noise(n.gen_scaled(1, 1, 1, (seed, 0, 0)), 3.0, 8)
    r = n.op('ADD', n.length(n.x, n.y), n.op('MULTIPLY', n.op('SUBTRACT', w, 0.5), 0.7))
    patch = n.mapr(r, 0.98, 0.35)
    edge = n.voronoi_edge(n.gen_scaled(1, 1, 1, (seed, 0, 0)), 7.0)
    cryst = n.mapr(edge, 0.0, 0.035, 1.0, 0.7)
    fine = n.noise(n.gen_scaled(1, 1, 1, (0, seed, 0)), 30.0, 3)
    alpha = n.op('MULTIPLY', n.op('MULTIPLY', patch, n.mapr(fine, 0.3, 0.7, 0.35, 1.0)), n.op('MULTIPLY', cryst, 0.95 * dense))
    col = n.mix(n.mapr(edge, 0.035, 0.0, 0.0, 0.6), C('#bcd8ec', 1.05), C('#f4fbff', 1.0))
    return n.finish(alpha, col, rough=0.35, coat=0.4, bump=n.op('MULTIPLY', cryst, fine), bump_strength=0.4)

def puddle_mat(name, color, emit=0.0, seed=0.0, alpha=0.85, rough=0.06):
    n = NB(name)
    w = n.noise(n.gen_scaled(1, 1, 1, (seed, 0, 0)), 2.5, 4)
    r = n.op('ADD', n.length(n.x, n.y), n.op('MULTIPLY', n.op('SUBTRACT', w, 0.5), 0.6))
    a = n.mapr(r, 0.92, 0.78, 0.0, alpha)
    col = C(color, 1.0)
    return n.finish(a, col, rough=rough, coat=1.0 if rough < 0.2 else 0.0, emit=col if emit else None, emit_strength=emit if emit else None)

def paper_mat(name, kind='text', tint='#ece8dc', seed=1.0):
    """Paper with procedural writing (rows of ink of random length), a grid, or a printed chart."""
    n = NB(name)
    paper = C(tint, 1.05)
    if kind == 'blank': return n.finish(None, paper, rough=0.85)
    k = 11.0
    row = n.op('FLOOR', n.op('MULTIPLY', n.gy, k))
    ln = n.op('MULTIPLY_ADD', n.white(n.op('ADD', row, seed)), 0.6, 0.25)
    inrow = n.op('LESS_THAN', n.op('FRACT', n.op('MULTIPLY', n.gy, k)), 0.4)
    inx = n.op('MULTIPLY', n.op('GREATER_THAN', n.gx, 0.12), n.op('LESS_THAN', n.gx, n.op('MULTIPLY_ADD', ln, 0.76, 0.12)))
    iny = n.op('MULTIPLY', n.op('GREATER_THAN', n.gy, 0.08), n.op('LESS_THAN', n.gy, 0.8))
    ink = n.op('MULTIPLY', n.op('MULTIPLY', inrow, inx), iny)
    head = n.op('MULTIPLY', n.op('MULTIPLY', n.op('GREATER_THAN', n.gy, 0.84), n.op('LESS_THAN', n.gy, 0.93)),
                n.op('MULTIPLY', n.op('GREATER_THAN', n.gx, 0.12), n.op('LESS_THAN', n.gx, 0.6)))
    col = n.mix(n.op('MULTIPLY', ink, 0.75), paper, C('#3a4458', 1.0))
    col = n.mix(head, col, C('#1e2430', 1.0))
    if kind == 'grid':
        gl = n.op('MAXIMUM', n.op('LESS_THAN', n.op('FRACT', n.op('MULTIPLY', n.gx, 14.0)), 0.08), n.op('LESS_THAN', n.op('FRACT', n.op('MULTIPLY', n.gy, 14.0)), 0.08))
        col = n.mix(gl, paper, C('#8ab0d0', 1.0))
        curve = n.op('ABSOLUTE', n.op('SUBTRACT', n.gy, n.op('MULTIPLY_ADD', n.op('POWER', n.gx, 2.2), 0.75, 0.1)))
        col = n.mix(n.mapr(curve, 0.03, 0.012), col, C('#c0392b', 1.0))
    return n.finish(None, col, rough=0.85)

def glass_mat(name, tint='#bfe0ea', dirty=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    b = N.new('ShaderNodeBsdfPrincipled'); b.inputs['Base Color'].default_value = (*C(tint, 1.0), 1); b.inputs['Roughness'].default_value = 0.08
    b.inputs['Coat Weight'].default_value = 1.0
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.22; mr.inputs['To Max'].default_value = 0.8; Lk(lw.outputs['Facing'], mr.inputs['Value'])
    f = mr.outputs[0]
    if dirty:
        tc = N.new('ShaderNodeTexCoord'); no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 5.0; Lk(tc.outputs['Object'], no.inputs['Vector'])
        d = N.new('ShaderNodeMapRange'); d.inputs['From Min'].default_value = 0.45; d.inputs['From Max'].default_value = 0.7; d.inputs['To Max'].default_value = dirty
        Lk(no.outputs['Fac'], d.inputs['Value'])
        ad = N.new('ShaderNodeMath'); ad.operation = 'ADD'; ad.use_clamp = True; Lk(f, ad.inputs[0]); Lk(d.outputs[0], ad.inputs[1]); f = ad.outputs[0]
    Lk(f, mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(b.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def frosted_glass(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    b = N.new('ShaderNodeBsdfPrincipled'); b.inputs['Base Color'].default_value = (0.72, 0.84, 0.95, 1); b.inputs['Roughness'].default_value = 0.25
    tc = N.new('ShaderNodeTexCoord'); no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 6; no.inputs['Detail'].default_value = 8
    Lk(tc.outputs['Object'], no.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.4; mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = 0.45; mr.inputs['To Max'].default_value = 0.95; Lk(no.outputs['Fac'], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(b.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def mats():
    M = dict(
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.25, grime=0.7), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        gun=worn('gunmetal', '#3a3e46', 0.4, 0.6, wear=0.7, grime=0.6), hazard=stripes_mat('hazard'), hazard_r=stripes_mat('hazr', '#e2574c', '#eeeae0', 6.0),
        tape=worn('tape', '#c4c8ce', 0.85, 0.0, wear=0.0, grime=0.5), ink=pmat('ink', '#23252b', 0.6), white=worn('white', '#dcdcd4', 0.5, 0.0, wear=0.6, grime=0.7),
        paper=paper_mat('paper', 'text'), paper2=paper_mat('paper2', 'text', '#e8e0c8', 4.0), graph=paper_mat('graph', 'grid', '#f0f0ea'), blank=paper_mat('blank', 'blank'),
        red=worn('red', '#b0302a', 0.5, 0.1, wear=0.9, grime=0.8), redhull=worn('redhull', '#a8382f', 0.5, 0.3, wear=0.9, rust=0.35),
        hull2=worn('hull2', '#2e2428', 0.5, 0.3, wear=0.6, rust=0.2), yellow=worn('yellow', '#e8c34f', 0.45, 0.2, wear=0.8),
        lab=worn('lab', '#c8d2da', 0.45, 0.05, wear=0.5, grime=0.9), labdk=worn('labdk', '#7d8a96', 0.45, 0.2, wear=0.6),
        teal=worn('teal', '#2f8c88', 0.45, 0.1, wear=0.7), varga=worn('varga', '#2d5f82', 0.45, 0.1, wear=0.6),
        top=worn('benchtop', '#3a4650', 0.35, 0.05, wear=0.5, grime=0.8), cork=worn('cork', '#a8784a', 0.9, 0.0, wear=0.0, grime=0.6, scale=4.0),
        fabric=worn('fabric', '#3a6a78', 0.9, 0.0, wear=0.0, grime=0.7), rubber=pmat('rubber', '#262a33', 0.7),
        copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3), cardboard=worn('cardboard', '#b08a58', 0.85, 0.0, wear=0.1, grime=0.8),
        terracotta=worn('terracotta', '#b5643c', 0.8, 0.0, wear=0.4, grime=1.0), soil=pmat('soil', '#2a1d14', 0.95),
        dead_leaf=worn('dead_leaf', '#a07a40', 0.8, 0.0, wear=0.0, grime=0.6), dead_leaf2=worn('dead_leaf2', '#8a8040', 0.8, 0.0, wear=0.0, grime=0.6),
        stem=pmat('stem', '#4a3a22', 0.8), ceramic=pmat('ceramic', '#e8e4dc', 0.25), coffee=pmat('coffee', '#3a2414', 0.15),
        note_y=pmat('note_y', '#f2df6b', 0.75), note_p=pmat('note_p', '#f29bc4', 0.75), note_g=pmat('note_g', '#9be08a', 0.75), note_b=pmat('note_b', '#8ac8f2', 0.75),
        shard=pmat('shard', '#d4ecf4', 0.08), glass=glass_mat('glass'), glass_d=glass_mat('glass_d', dirty=0.35), frosted=frosted_glass('frosted'),
        fluid=emit_mat('fluid', '#5af0b4', 0.55, base='#1f7a5a'), led_g=emit_mat('led_g', '#5fff9a', 1.2, base='#1a5a2a'),
        led_r=emit_mat('led_r', '#ff3a2a', 1.2, base='#601010'), led_a=emit_mat('led_a', '#ffb02a', 1.0, base='#604010'),
        ember=emit_mat('ember', '#ff8a3a', 0.9, base='#a04010'), screen_dead=pmat('screen_dead', '#141a22', 0.12),
        screen=emit_mat('screen', '#4aa8e0', 0.55, base='#183850'), cell=emit_mat('cell', '#ff5a3a', 0.8, base='#7a1a10'),
        jar_g=emit_mat('jar_g', '#7aff9a', 0.7, base='#2a6a3a'), jar_a=emit_mat('jar_a', '#ffc04a', 0.6, base='#6a4a1a'), jar_p=emit_mat('jar_p', '#c07aff', 0.6, base='#3a1a5a'),
        soot=scorch_mat('soot_s', 3.0, heat=False), ice=pmat('ice', '#dff2ff', 0.15), frost_white=worn('frostw', '#c8dcea', 0.6, 0.0, wear=0.0, grime=0.3),
        binder_r=worn('binder_r', '#b0403a', 0.5, 0.0, wear=0.6), binder_b=worn('binder_b', '#3a6ab0', 0.5, 0.0, wear=0.6), binder_y=worn('binder_y', '#d8b23a', 0.5, 0.0, wear=0.6),
        binder_g=worn('binder_g', '#4a8a5a', 0.5, 0.0, wear=0.6),
    )
    D.M_DARK[0] = M['black']
    return M

def tape_on(out, M, u, v, z, l, rotz=0.0, face=False, w=0.07):
    """A strip of duct tape: on a floor/top (face=False) or on a wall face (face=True, rotz tilts it in the face)."""
    if face:
        o = mn.box('tape', (l, 0.006, w), loc=P(u, v + 0.003, z - w / 2), m=M['tape'], bevel=0.002, rot=(0, rotz, 0))
    else:
        o = cbox('tape', u, v, l, w, z, 0.005, M['tape'], bevel=0.0015, rotz=rotz)
    out.append(nool(o)); return o

def sticky(out, M, u, v, z, s, col, lines, rotz=0.0, face=False, txt=0.035):
    """A sticky note with (unreadably small, but scribbled) text lines."""
    if face:
        n = mn.box('note', (s, 0.006, s), loc=P(u, v + 0.003, z - s / 2), m=M[col], bevel=0.002, rot=(0, rotz, 0))
        out.append(nool(n))
        for i, ln in enumerate(lines):
            t = text('note_t', ln, u, v + 0.008, z + s * 0.12 - i * txt * 1.3, txt, M['ink'], face=True, depth=0.001); t.rotation_euler.y = rotz; out.append(nool(t))
    else:
        n = cbox('note', u, v, s, s, z, 0.004, M[col], bevel=0.0015, rotz=rotz); out.append(nool(n))
        c, sn = math.cos(rotz), math.sin(rotz)
        for i, ln in enumerate(lines):
            dv = -s * 0.15 + i * txt * 1.3
            t = text('note_t', ln, u - sn * dv, v + c * dv, z + 0.0045, txt, M['ink'], rotz=-rotz, depth=0.0008); out.append(nool(t))

def finish(out, name, catcher=None, outline=0.012, dirs=1, root=None):
    shiplib._hidden_in_data.clear()
    objs = [o for o in out if o is not None]
    if catcher:
        cu, cv, cw, cd = catcher
        o = shadow_catcher((cw, cd), loc=tuple(P(cu, cv, 0))[:2]); objs.append(o)
    mn.outline([o for o in objs if o.type == 'MESH' and not o.get('nool') and not o.is_shadow_catcher], thickness=outline)
    return mn.render('dock/lab_' + name, objs=[o for o in objs if o.type == 'MESH'], root=root, dirs=dirs)

JOBS = []
def job(name, group):
    def deco(fn): JOBS.append((name, group, fn)); return fn
    return deco

# ---------------------------------------------------------------------------------------------------
# Decals: scorch marks, laser burns, drag marks, frost patches (flat on the floor, layer 'decal')
# ---------------------------------------------------------------------------------------------------
@job('scorch', 'decals')
def scorch_job():
    for nm, w, d, seed, extra in (('scorch_a', 1.3, 1.1, 1.0, 0), ('scorch_b', 0.8, 0.7, 5.0, 0), ('scorch_c', 1.8, 1.2, 9.0, 1)):
        mn.reset(); set_side('port'); out = []; M = mats()
        out.append(plane('decal', w, d, scorch_mat('sc_' + nm, seed), sub=1))
        rng = random.Random(int(seed))
        if extra:                    # a near-miss spray: small blast pits around the big one
            for k in range(6):
                a = rng.uniform(0, math.tau); r = rng.uniform(0.75, 1.05)
                out.append(plane('pit', 0.28, 0.24, scorch_mat(f'pit{k}', seed + k), u=math.cos(a) * r * w / 2, v=math.sin(a) * r * d / 2, z=FLOOR_Z + 0.003))
        # a few blackened bits of plating curled up in the middle (catch the light)
        for k in range(3 if w > 1 else 1):
            a = rng.uniform(0, math.tau); r = rng.uniform(0.0, 0.25)
            o = cbox('flake', math.cos(a) * r, math.sin(a) * r, rng.uniform(0.08, 0.15), rng.uniform(0.05, 0.08), FLOOR_Z, 0.012, M['dark'], bevel=0.004, rotz=rng.uniform(0, 3))
            o.rotation_euler.x = rng.uniform(-0.3, 0.3); out.append(nool(o))
        finish(out, nm)

@job('scorch_wall', 'wall')
def scorch_wall_job():
    """A blast on a back wall face: soot plume rising, two bolt holes, a fried wall lamp bit hanging."""
    mn.reset(); set_side('port'); out = []; M = mats()
    out.append(plane('soot', 1.1, 1.3, scorch_mat('scw', 2.0), v=0.004, z=0.75, face=True))
    for (u, z, r) in ((-0.12, 0.62, 0.07), (0.2, 0.9, 0.05)):
        out.append(nool(mn.cyl('hole', r, 0.01, loc=P(u, 0.008, z), m=M['black'], rot=(R90, 0, 0), verts=12, bevel=0)))
        out.append(nool(ring('hole_rim', r + 0.02, 0.02, 0.012, loc=P(u, 0.004, z), m=M['ember'], rot=(R90, 0, 0), verts=16)))
    for k in range(5):                             # bent shards of panel round the bigger hole
        a = k / 5 * math.tau + 0.3
        o = mn.box('shard', (0.07, 0.04, 0.012), loc=P(-0.12 + math.cos(a) * 0.1, 0.03, 0.62 + math.sin(a) * 0.1), m=M['labdk'], bevel=0.003)
        o.rotation_euler = (R90 - 0.6, a, 0); out.append(o)
    finish(out, 'scorch_wall', outline=0.008)

@job('burn', 'decals')
def burn_job():
    specs = {
        'burn_a': [(0, 0, 1.4, 0.34, 0.25, 0.0)],                                                   # one long score
        'burn_b': [(0, -0.14, 1.2, 0.3, 0.1, 0.0), (0.1, 0.18, 1.0, 0.28, -0.06, 0.0)],             # strafing pair
        'burn_c': [(-0.3, 0, 0.46, 0.24, 0.7, 0.0), (0.05, 0.14, 0.42, 0.22, 0.5, 0.0), (0.34, -0.12, 0.5, 0.26, 0.62, 0.9),
                   (-0.05, -0.24, 0.34, 0.2, 0.4, 0.0), (0.42, 0.22, 0.32, 0.2, 0.8, 0.0)],             # a burst of bolt hits, one still warm
    }
    for nm, parts in specs.items():
        mn.reset(); set_side('port'); out = []; M = mats()
        for i, (u, v, l, w, a, ember) in enumerate(parts):
            out.append(plane('burn', l, w, burn_mat(f'b_{nm}{i}', 3.0 * i + len(nm), ember), u=u, v=v, z=FLOOR_Z + 0.002 + 0.0004 * i, rotz=a))
        finish(out, nm)

@job('drag', 'decals')
def drag_job():
    """Drag marks towards the airlock: _r runs towards +x (a derelict docked at port: the airlock is to the
    right of the lab), _l towards -x (starboard). Strong struggle smear at the start, heel tracks thinning out."""
    for nm, L, bend in (('drag_a', 3.2, 0.0), ('drag_b', 2.6, 0.55)):
        for side, rot in (('r', 0.0), ('l', math.pi)):
            mn.reset(); set_side('port'); out = []; M = mats()
            o = plane('drag', L, 0.7, drag_mat('dm_' + nm, 2.0 if nm == 'drag_a' else 7.0), sub=24)
            if bend:
                md = o.modifiers.new('bend', 'SIMPLE_DEFORM'); md.deform_method = 'BEND'; md.deform_axis = 'Z'; md.angle = bend
            o.rotation_euler.z = rot; out.append(o)
            finish(out, f'{nm}_{side}')

@job('frost', 'decals')
def frost_job():
    for nm, w, d, seed, n_ice in (('frost_a', 1.6, 1.1, 1.0, 9), ('frost_b', 1.0, 0.8, 4.0, 4), ('frost_c', 2.3, 1.5, 8.0, 14)):
        mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(int(seed * 10))
        out.append(plane('frost', w, d, frost_mat('fr_' + nm, seed), sub=1))
        out.append(plane('frost2', w * 0.6, d * 0.6, frost_mat('fr2_' + nm, seed + 2), u=w * 0.12, v=-d * 0.05, z=FLOOR_Z + 0.003))
        for k in range(n_ice):                    # little ice spikes and clumps (give the patch some height)
            a = rng.uniform(0, math.tau); r = rng.uniform(0.0, 0.32)
            u, v = math.cos(a) * r * w, math.sin(a) * r * d
            if rng.random() < 0.6:
                sp = cone('ice', rng.uniform(0.025, 0.045), 0.003, rng.uniform(0.06, 0.16), u, v, FLOOR_Z, M['ice'], verts=5, bevel=0.003)
                sp.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3))
            else:
                sp = mn.sphere('clump', rng.uniform(0.025, 0.045), loc=P(u, v, FLOOR_Z), m=M['frost_white'], scale=(1.4, 1.0, 0.4), segs=10)
            out.append(sp)
        finish(out, nm, outline=0.006)

# ---------------------------------------------------------------------------------------------------
# The Red Comet's boarding claw, bitten through the back wall top (wall piece)
# ---------------------------------------------------------------------------------------------------
@job('claw', 'wall')
def claw_job():
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(7)
    Z = H_FULL; cv = -0.38                                   # collar centre on the wall top
    # roof damage under it: soot, torn-up roof plates
    out.append(plane('roof_soot', 1.9, 0.9, scorch_mat('roof_soot', 4.0), v=cv, z=Z + 0.004))
    for k in range(9):
        a = k / 9 * math.tau + 0.2
        o = cbox('petal', math.cos(a) * 0.62, cv + math.sin(a) * 0.3, 0.26, 0.09, Z, 0.035, M['labdk'], bevel=0.008, rotz=a)
        o.rotation_euler.x += 0.35 * math.sin(a); o.rotation_euler.y += -0.35 * math.cos(a); out.append(o)
    # the collar clamped onto the roof
    out.append(ucyl('collar', 0.5, 0.2, 0, cv, Z, M['hull2'], verts=36, bevel=0.04))
    out.append(ring('collar_hz', 0.52, 0.07, 0.07, loc=P(0, cv, Z + 0.1), m=M['hazard'], verts=36))
    out.append(ucyl('collar_top', 0.42, 0.08, 0, cv, Z + 0.2, M['redhull'], verts=36, bevel=0.025))
    for k in range(12):
        a = k / 12 * math.tau
        out.append(nool(rivet(math.cos(a) * 0.36, cv + math.sin(a) * 0.36, Z + 0.28, M['steel'], 0.022)))
    # four hooked fingers: two bite down over the wall's face edge into the room, two into the hull's back edge
    for su in (-1, 1):
        f = [(su * 0.34, cv + 0.12, Z + 0.18), (su * 0.48, 0.06, Z + 0.24), (su * 0.52, 0.16, Z - 0.05), (su * 0.46, 0.1, Z - 0.42)]
        out.append(pipe_uv('finger', f, 0.075, M['red'], corner=0.12))
        out.append(cbox('knuckle', su * 0.48, 0.04, 0.2, 0.2, Z + 0.12, 0.2, M['hull2'], bevel=0.04))
        tip = cone('tip', 0.075, 0.01, 0.2, su * 0.46, 0.1, Z - 0.42, M['steel'], verts=12)
        tip.location = P(su * 0.46, 0.1, Z - 0.42); tip.rotation_euler = (math.pi + 0.35, 0, 0); out.append(tip)
        b = [(su * 0.4, cv - 0.12, Z + 0.18), (su * 0.62, -0.72, Z + 0.22), (su * 0.66, -0.82, Z - 0.05)]
        out.append(pipe_uv('finger_b', b, 0.07, M['red'], corner=0.12))
        out.append(cbox('knuckle_b', su * 0.62, -0.72, 0.18, 0.18, Z + 0.1, 0.18, M['hull2'], bevel=0.04))
    # the arm: up and away north (it reached over from the raider), cut through when they fled
    dirv = Vector((-0.42, 0.5, 0.76)).normalized(); L = 1.25
    arm = mn.cyl('arm', 0.27, L, loc=P(0, cv, Z + 0.24), m=M['redhull'], verts=32, bevel=0.03)
    arm.rotation_euler = Vector((0, 0, 1)).rotation_difference(dirv).to_euler(); out.append(arm)
    def along(t, extra=0.0):
        return P(0, cv, Z + 0.24) + dirv * (L * t + extra)
    for t, mm in ((0.18, 'hull2'), (0.42, 'hazard'), (0.66, 'hull2'), (0.9, 'hull2')):
        o = ring('arm_band', 0.3, 0.06, 0.09, loc=along(t), m=M[mm], rot=arm.rotation_euler, verts=32); out.append(o)
    out.append(nool(ring('cut_rim', 0.27, 0.05, 0.03, loc=along(1.0, -0.015), m=M['ember'], rot=arm.rotation_euler, verts=32)))
    hol = mn.cyl('hollow', 0.22, 0.02, loc=along(1.0, -0.005), m=M['black'], rot=arm.rotation_euler, verts=24, bevel=0); out.append(nool(hol))
    for k, col in enumerate(('#e2574c', '#e8c34f', '#4a8ac0')):     # cut cables flopping out of the stump
        c0 = along(0.98); c0 = Vector((c0.x - 0.08 + k * 0.08, c0.y, c0.z))
        pts = [c0, c0 + Vector((0.05 * (k - 1), -0.12, 0.08)), c0 + Vector((0.12 * (k - 1), -0.3, -0.06)), c0 + Vector((0.16 * (k - 1), -0.38, -0.3))]
        out.append(shiplib.pipe('cable', pts, 0.022, pmat('cab%d' % k, col, 0.5), corner=0.08))
    # skull + RED COMET stencil on the collar top
    skull(0, cv - 0.04, Z + 0.285, 0.42, M['white'], out, face=False)
    for o in out[-6:]: nool(o)
    t = text('rc', 'RED COMET', 0, cv + 0.25, Z + 0.285, 0.075, M['white']); out.append(nool(t))
    # the breach in the wall face below: ragged hole, petals bent into the room, glowing cut edges gone dull
    hole = ragged(0, 1.02, 0.42, 0.3, 14, rng, 0.3)
    out.append(plane('wall_soot', 1.4, 1.2, scorch_mat('wall_soot', 6.0), v=0.004, z=1.0, face=True))
    out.append(nool(vprism('breach', hole, 0.0, 0.012, M['black'])))
    for k in range(10):
        a = k / 10 * math.tau + rng.uniform(-0.15, 0.15)
        pu, pz = math.cos(a) * 0.42, 1.02 + math.sin(a) * 0.3
        o = mn.box('petal_w', (rng.uniform(0.12, 0.2), 0.02, 0.07), loc=P(pu, 0.04, pz), m=M['labdk'], bevel=0.006)
        o.rotation_euler = (0, -a, 0); o.rotation_euler.x = 0.5; out.append(o)
        out.append(nool(mn.sphere('glow', 0.022, loc=P(pu * 0.95, 0.03, 1.02 + (pz - 1.02) * 0.95), m=M['ember'], segs=8)))
    for k, col in enumerate(('#2a2c30', '#e2574c', '#3a6ab0')):          # torn wiring hanging out of the hole
        u0 = -0.15 + k * 0.14
        pts = [(u0, 0.0, 0.95), (u0 + 0.03, 0.12, 0.8), (u0 - 0.02, 0.18, 0.55 - 0.08 * k)]
        out.append(pipe_uv('wire', pts, 0.018, pmat('w%d' % k, col, 0.5), corner=0.1))
    # Varga's patch job: two strips of duct tape across the hole, one peeled off and dangling, and a note
    tape_on(out, M, -0.05, 0.06, 1.18, 0.95, 0.35, face=True, w=0.09)
    o = mn.box('tape_hang', (0.08, 0.006, 0.4), loc=P(0.45, 0.07, 0.62), m=M['tape'], bevel=0.002); o.rotation_euler.y = 0.25; out.append(nool(o))
    sticky(out, M, -0.62, 0.02, 0.92, 0.2, 'note_y', ['NOT', 'AGAIN'], rotz=0.12, face=True, txt=0.045)
    finish(out, 'claw', outline=0.016)

# ---------------------------------------------------------------------------------------------------
# Varga's notes board (wall piece)
# ---------------------------------------------------------------------------------------------------
@job('notes_board', 'wall')
def board_job():
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(3)
    W, H, z0 = 1.6, 0.92, 0.56; zc = z0 + H / 2
    out.append(ubox('cork', -W / 2, 0.0, W / 2, 0.04, z0, z0 + H, M['cork'], bevel=0.01))
    for (u0, u1, za, zb) in ((-W / 2 - 0.04, W / 2 + 0.04, z0 - 0.04, z0), (-W / 2 - 0.04, W / 2 + 0.04, z0 + H, z0 + H + 0.04),
                             (-W / 2 - 0.04, -W / 2, z0, z0 + H), (W / 2, W / 2 + 0.04, z0, z0 + H)):
        out.append(ubox('frame', u0, 0.0, u1, 0.06, za, zb, M['steel'], bevel=0.01))
    out.append(ubox('tray', -0.5, 0.0, 0.5, 0.12, z0 - 0.09, z0 - 0.04, M['steel'], bevel=0.01))   # marker tray
    for k, col in enumerate(('#c0392b', '#2a6ab0', '#2a2c30')):
        out.append(ucyl('marker', 0.018, 0.16, -0.3 + k * 0.1, 0.07, z0 - 0.04, pmat('mk%d' % k, col, 0.4), axis='u', verts=10, bevel=0.005))
    V = 0.045
    def sheet(u, z, w, h, m, tilt, pin=None, tapes=True):
        o = mn.box('sheet', (w, 0.004, h), loc=P(u, V, z - h / 2), m=m, bevel=0.001); o.rotation_euler.y = tilt; out.append(nool(o))
        if pin: out.append(mn.sphere('pin', 0.022, loc=P(u, V + 0.02, z + h / 2 - 0.04), m=pmat('pin' + pin, pin, 0.3), segs=10))
        if tapes:
            for su in (-1, 1): tape_on(out, M, u + su * (w / 2 - 0.02), V + 0.003, z + h / 2 + 0.02, 0.12, su * 0.7, face=True, w=0.04)
        return o
    sheet(-0.55, zc + 0.05, 0.36, 0.48, M['paper'], 0.05, '#e2574c', tapes=False)
    sheet(-0.12, zc + 0.12, 0.42, 0.34, M['graph'], -0.04)
    sheet(0.38, zc + 0.02, 0.38, 0.52, M['paper2'], 0.03, '#2e7dc9')
    # the specimen log
    log = sheet(-0.18, zc - 0.25, 0.46, 0.3, M['blank'], 0.0, '#e8c34f', tapes=False)
    for i, (ln, col) in enumerate((('SPECIMENS', 'ink'), ('S-1   OK', 'ink'), ('S-4   ???', 'red'), ('S-7   DO NOT FEED', 'ink'))):
        out.append(nool(text('log', ln, -0.18, V + 0.006, zc - 0.13 - i * 0.06, 0.05 if i else 0.055, M[col], face=True, depth=0.001)))
    out.append(nool(ubox('circle', -0.12, V + 0.004, 0.0, V + 0.008, zc - 0.338, zc - 0.33, M['red'], bevel=0)))
    # a polaroid: something blurry in the dark, a question mark
    sheet(0.62, zc + 0.24, 0.2, 0.24, M['white'], -0.12, '#e2574c', tapes=False)
    o = mn.box('photo', (0.16, 0.006, 0.15), loc=P(0.628, V + 0.003, zc + 0.27 - 0.15), m=pmat('photo', '#1e3a3c', 0.3), bevel=0); o.rotation_euler.y = -0.12; out.append(nool(o))
    out.append(nool(text('q', '?', 0.63, V + 0.008, zc + 0.19, 0.11, M['note_y'], face=True, depth=0.001)))
    # red string from pin to pin (it means something, probably)
    pins = [(-0.55, zc + 0.25), (0.38, zc + 0.24), (-0.05, zc - 0.32), (0.62, zc + 0.32)]
    for (a, b) in ((0, 1), (1, 2), (2, 3), (0, 2)):
        out.append(nool(pipe_uv('string', [(pins[a][0], V + 0.02, pins[a][1]), (pins[b][0], V + 0.02, pins[b][1])], 0.005, M['red'], corner=0.0)))
    for (u, z) in pins: out.append(mn.sphere('pin', 0.022, loc=P(u, V + 0.022, z), m=pmat('pinr', '#e2574c', 0.3), segs=10))
    # sticky notes
    sticky(out, M, 0.6, V + 0.004, zc - 0.16, 0.2, 'note_y', ['ALSO DO NOT', 'LOOK AWAY'], rotz=0.08, face=True, txt=0.03)
    sticky(out, M, 0.12, V + 0.004, zc - 0.22, 0.17, 'note_p', ['WATER', 'GERALD'], rotz=-0.15, face=True, txt=0.03)
    sticky(out, M, -0.72, V + 0.004, zc - 0.2, 0.17, 'note_g', ['IT IS', 'FINE'], rotz=0.2, face=True, txt=0.03)
    # one page torn half off: hanging by a single strip of tape
    o = mn.box('torn', (0.3, 0.004, 0.36), loc=(0, 0, 0), m=M['paper'], bevel=0.001)
    for vt in o.data.vertices: vt.co.x -= 0.15; vt.co.z -= 0.36
    o.location = P(W / 2 - 0.06, V + 0.01, z0 + H - 0.04); o.rotation_euler = (0.0, -0.35, 0); out.append(nool(o))
    tape_on(out, M, W / 2 - 0.08, V + 0.012, z0 + H - 0.02, 0.12, 0.6, face=True, w=0.04)
    # a stray bolt went right through it: burn hole with a soot halo
    out.append(plane('bsoot', 0.2, 0.2, scorch_mat('bsoot', 8.0), u=0.05, v=V + 0.012, z=zc - 0.05, face=True))
    out.append(nool(mn.cyl('bhole', 0.04, 0.01, loc=P(0.05, V + 0.016, zc - 0.05), m=M['black'], rot=(R90, 0, 0), verts=12, bevel=0)))
    # header plaque on top
    out.append(ubox('plaque', -0.42, 0.0, 0.42, 0.06, z0 + H + 0.06, z0 + H + 0.2, M['varga'], bevel=0.012))
    out.append(nool(text('plq', 'DR. I. VARGA  ·  THINKING WALL', 0, 0.065, z0 + H + 0.13, 0.05, M['white'], face=True, depth=0.002)))
    finish(out, 'notes_board', outline=0.01)

# ---------------------------------------------------------------------------------------------------
# Specimen tanks (footprint ~0.85 round, origin = centre of the base)
# ---------------------------------------------------------------------------------------------------
def tank(out, M, state, lbl, rng):
    R, G0, GH = 0.42, 0.2, 0.95
    out.append(ucyl('base', R, G0, 0, 0, 0, M['labdk'], verts=40, bevel=0.03))
    out.append(ring('base_hz', R + 0.01, 0.03, 0.05, loc=P(0, 0, 0.03), m=M['hazard'], verts=40))
    out.append(ucyl('base_top', R - 0.03, 0.03, 0, 0, G0, M['steel'], verts=40, bevel=0.01))
    # label plate and status LED on the front
    out.append(cbox('plate', 0, R - 0.03, 0.34, 0.06, G0 + GH + 0.015, 0.13, M['yellow'], bevel=0.01))
    out.append(nool(text('lbl', lbl, 0, R + 0.002, G0 + GH + 0.08, 0.11, M['ink'], face=True)))
    led = {'intact': 'led_g', 'empty': 'led_a', 'smashed': 'led_r', 'over': None}[state]
    if led: out.append(nool(mn.sphere('led', 0.025, loc=P(0.24, R - 0.06, 0.15), m=M[led], segs=10)))
    for k in range(3):                             # three posts hold the cap
        a = math.radians(90 + 120 * k + 60)
        out.append(ucyl('post', 0.03, GH, math.cos(a) * (R - 0.06), math.sin(a) * (R - 0.06), G0, M['steel'], verts=10, bevel=0.008))
    cap_z = G0 + GH
    cap = [ucyl('cap', R - 0.02, 0.14, 0, 0, cap_z, M['labdk'], verts=40, bevel=0.03),
           ucyl('cap_top', R - 0.12, 0.06, 0, 0, cap_z + 0.14, M['steel'], verts=32, bevel=0.015),
           ring('cap_band', R - 0.01, 0.025, 0.04, loc=P(0, 0, cap_z + 0.05), m=M['teal'], verts=40)]
    for su in (-1, 1):                             # hoses from the cap back to the wall
        cap.append(pipe_uv('hose', [(su * 0.14, -0.12, cap_z + 0.16), (su * 0.18, -0.36, cap_z + 0.2), (su * 0.22, -0.56, cap_z - 0.05), (su * 0.22, -0.6, 0.25)], 0.035, M['rubber'], corner=0.12))
    out += cap
    if state == 'intact':
        out.append(ucyl('glass', R - 0.07, GH, 0, 0, G0, M['glass'], verts=40, bevel=0.01))
        out.append(nool(ucyl('fluid', R - 0.1, GH - 0.18, 0, 0, G0 + 0.01, M['fluid'], verts=40, bevel=0.01)))
        for k in range(9):
            out.append(nool(mn.sphere('bubble', rng.uniform(0.015, 0.03), loc=P(rng.uniform(-0.12, 0.12), rng.uniform(-0.1, 0.12), G0 + rng.uniform(0.1, GH - 0.22)), m=M['ice'], segs=8)))
    elif state == 'empty':
        out.append(ucyl('glass', R - 0.07, GH, 0, 0, G0, M['glass_d'], verts=40, bevel=0.01))
        out.append(nool(ucyl('dregs', R - 0.1, 0.02, 0, 0, G0 + 0.01, M['fluid'], verts=40, bevel=0.0)))
        out.append(nool(ring('residue', R - 0.075, 0.012, 0.02, loc=P(0, 0, G0 + 0.72), m=pmat('resid', '#2a5a48', 0.4), verts=40)))
        sticky(out, M, 0.0, R - 0.06, G0 + 0.62, 0.18, 'note_p', ['WHERE IS', lbl + '?'], rotz=-0.1, face=True, txt=0.034)
    elif state == 'smashed':
        # jagged crown of glass left in the base, shards thrown outwards, the fluid all over the floor
        pts = []
        for k in range(28):
            a = k / 28 * math.tau
            h = rng.uniform(0.06, 0.38) if k % 2 else rng.uniform(0.02, 0.12)
            if k in (5, 6): h = 0.62
            pts.append((a, h))
        me = bpy.data.meshes.new('crown'); bm = bmesh.new(); r_ = R - 0.07
        lo = [bm.verts.new(P(math.cos(a) * r_, math.sin(a) * r_, G0)) for a, h in pts]
        hi = [bm.verts.new(P(math.cos(a) * r_, math.sin(a) * r_, G0 + h)) for a, h in pts]
        for k in range(len(pts)):
            j = (k + 1) % len(pts); bm.faces.new((lo[k], lo[j], hi[j], hi[k]))
        bm.to_mesh(me); bm.free()
        cr = mn.link(bpy.data.objects.new('crown', me)); mn.assign(cr, M['glass']); md = cr.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.015
        out.append(cr)
        out.append(plane('puddle', 1.9, 1.3, puddle_mat('puddle', '#2a9a78', 0.22, 2.0, 0.62, rough=0.35), u=0.1, v=0.42, z=FLOOR_Z + 0.002))
        for k in range(16):
            a = rng.uniform(-0.3, math.pi + 0.3); r = rng.uniform(0.5, 1.0)
            u, v = math.cos(a) * r * 1.05, math.sin(a) * r * 0.75 + 0.05
            sh = vprism('shard', [(0, 0), (rng.uniform(0.06, 0.12), 0.0), (rng.uniform(0.0, 0.08), rng.uniform(0.06, 0.12))], 0, 0.008, M['shard'])
            sh.location = P(u, v, FLOOR_Z + 0.004); sh.rotation_euler = (-R90 + rng.uniform(-0.2, 0.2), 0, rng.uniform(0, 3)); out.append(nool(sh))
        out.append(nool(mn.sphere('led_dead', 0.02, loc=P(-0.24, R - 0.06, 0.15), m=M['led_r'], segs=8)))
        # one hose torn off its fitting, hanging down
        out.append(pipe_uv('hose_torn', [(0.2, -0.05, cap_z + 0.02), (0.3, 0.05, cap_z - 0.25), (0.33, 0.12, cap_z - 0.6)], 0.03, M['rubber'], corner=0.1))
        tape_on(out, M, 0.0, R - 0.025, 0.18, 0.34, 0.15, face=True, w=0.06)

def tank_job_variant(state, lbl):
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(sum(map(ord, state + lbl)))
    if state != 'over':
        tank(out, M, state, lbl, rng)
        finish(out, f'tank_{state}_{lbl.replace("-", "").lower()}', catcher=(0.1, 0.25, 2.2, 1.8) if state == 'smashed' else (0, 0, 1.6, 1.6))
        return
    # knocked over: the whole tank lying on its side (axis along u), cracked, its fluid spilled
    tank(out, M, 'intact', lbl, rng)
    for o in list(out):
        if o.name.startswith(('fluid', 'bubble', 'led', 'hose')):
            out.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    g = grp(out, 0.0, 0.0, 0.42, (0, R90, 0))
    g.location = P(-0.65, 0.0, 0.42)
    o = cbox('crack', 0.0, 0.0, 0.7, 0.012, 0.795, 0.01, M['black'], bevel=0, rotz=0.4); out.append(nool(o))
    o = cbox('crack2', 0.15, 0.05, 0.4, 0.012, 0.79, 0.01, M['black'], bevel=0, rotz=-0.5); out.append(nool(o))
    out.append(plane('puddle', 1.6, 1.1, puddle_mat('puddle_o', '#2a9a78', 0.22, 5.0, 0.62, rough=0.35), u=0.6, v=0.35, z=FLOOR_Z + 0.002))
    sticky(out, M, -0.2, 0.33, 0.62, 0.17, 'note_y', ['OOPS'], rotz=0.0, face=True, txt=0.045)
    finish(out, f'tank_over_{lbl.replace("-", "").lower()}', catcher=(0.1, 0.1, 2.4, 1.8))

@job('tanks', 'props')
def tanks_job():
    for state, lbl in (('intact', 'S-1'), ('intact', 'S-3'), ('empty', 'S-4'), ('empty', 'S-7'), ('smashed', 'S-4'), ('smashed', 'S-7'), ('over', 'S-2')):
        tank_job_variant(state, lbl)

# ---------------------------------------------------------------------------------------------------
# Lab furniture: office chair, shelf, desk -> the barricade
# ---------------------------------------------------------------------------------------------------
def office_chair(M, out):
    """An office chair at the origin, upright (seat at z 0.45). Returns its parts."""
    p = []
    p.append(cbox('seat', 0, 0, 0.46, 0.44, 0.42, 0.09, M['fabric'], bevel=0.035))
    p.append(cbox('back', 0, -0.22, 0.42, 0.07, 0.55, 0.42, M['fabric'], bevel=0.035))
    p.append(cbox('back_bar', 0, -0.24, 0.06, 0.04, 0.4, 0.2, M['dark'], bevel=0.01))
    p.append(ucyl('lift', 0.03, 0.3, 0, 0, 0.1, M['steel'], verts=12, bevel=0.006))
    for k in range(5):
        a = k / 5 * math.tau + 0.3
        p.append(cbox('spoke', math.cos(a) * 0.14, math.sin(a) * 0.14, 0.3, 0.05, 0.06, 0.04, M['dark'], bevel=0.012, rotz=a))
        p.append(mn.sphere('caster', 0.035, loc=P(math.cos(a) * 0.28, math.sin(a) * 0.28, 0.035), m=M['rubber'], segs=10))
    for su in (-1, 1): p.append(cbox('arm', su * 0.24, -0.02, 0.05, 0.3, 0.6, 0.04, M['dark'], bevel=0.012))
    out += p; return p

def shelf(M, out, books=True):
    """A lab shelf lying face down-ish: built upright (1.4 wide, 0.35 deep, 1.5 tall), returns parts."""
    p = []; W, Dp, H = 1.2, 0.34, 1.4
    for su in (-1, 1): p.append(cbox('side', su * (W / 2 - 0.02), 0, 0.04, Dp, 0, H, M['lab'], bevel=0.012))
    for z in (0.05, 0.5, 0.95, H - 0.04): p.append(cbox('board', 0, 0, W, Dp, z, 0.035, M['lab'], bevel=0.01))
    p.append(cbox('backp', 0, -Dp / 2 + 0.01, W, 0.02, 0, H, M['labdk'], bevel=0.005))
    if books:                                     # what's left on the boards: binders, a jar, leaning every which way
        rng = random.Random(77)
        for z in (0.085, 0.535, 0.985):
            u = -W / 2 + 0.08
            while u < W / 2 - 0.3:
                if rng.random() < 0.35: u += rng.uniform(0.1, 0.25); continue
                b = cbox('binder', u, 0.0, 0.07, 0.26, z, 0.3, M[rng.choice(['binder_r', 'binder_b', 'binder_y', 'binder_g'])], bevel=0.01)
                b.rotation_euler.y = rng.uniform(-0.25, 0.25); p.append(b); u += 0.08
    out += p; return p

def desk_on_side(M, out, rng):
    """A lab desk knocked onto its side, top facing the camera (the defenders hid behind it)."""
    p = []; W = 1.5
    p.append(cbox('desktop', 0, 0.1, W, 0.06, 0.0, 0.74, M['lab'], bevel=0.02))
    p.append(cbox('desk_edge', 0, 0.12, W + 0.01, 0.05, 0.71, 0.04, M['teal'], bevel=0.01))
    for su in (-1, 1):
        for z in (0.06, 0.62): p.append(cbox('leg', su * 0.68, -0.25, 0.05, 0.66, z, 0.05, M['steel'], bevel=0.012))
    p.append(cbox('pedestal', 0.48, -0.25, 0.42, 0.66, 0.05, 0.62, M['labdk'], bevel=0.02))
    for k in range(3): p.append(cbox('drawer_h', 0.48, -0.25, 0.04, 0.2, 0.67, 0.02, M['steel'], bevel=0.006))
    # bolt scorches and two burn-throughs on the face that took the fire
    for k, (u, z, r) in enumerate(((-0.45, 0.42, 0.24), (0.1, 0.2, 0.18), (0.42, 0.52, 0.2))):
        p.append(plane('dsoot', r * 2, r * 2, scorch_mat(f'dsoot{k}', 11.0 + k), u=u, v=0.135, z=z, face=True))
    for (u, z) in ((-0.45, 0.42), (0.42, 0.52)):
        p.append(nool(mn.cyl('dhole', 0.035, 0.01, loc=P(u, 0.14, z), m=M['black'], rot=(R90, 0, 0), verts=10, bevel=0)))
    out += p; return p

@job('barricade', 'props')
def barricade_job():
    """Lab furniture piled into a barricade: footprint ~2.4 x 1.3 around the origin, faces the camera.
    Max height ~1.15 (a crew member behind it still shows)."""
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(11)
    desk_on_side(M, out, rng)
    # the shelf toppled across the desk's left end, leaning on it
    sp = []; shelf(M, sp)
    g = grp(sp, 0, 0, 0); g.rotation_mode = 'ZXY'           # turned round, then leaning on the desk: open side up
    g.rotation_euler = (math.radians(50), 0, math.pi - 0.2); g.location = P(-0.95, -0.95, 0.0)
    out += sp
    # binders and boxes spilled in front of it
    for k in range(7):
        m = M[rng.choice(['binder_r', 'binder_b', 'binder_y', 'binder_g'])]
        u, v = -1.15 + rng.uniform(-0.25, 0.35), 0.4 + rng.uniform(-0.1, 0.3)
        o = cbox('binder', u, v, 0.26, 0.07, FLOOR_Z, 0.32, m, bevel=0.012, rotz=rng.uniform(0, 3)); o.rotation_euler.x = R90 * (0.9 + rng.random() * 0.1)
        o.location.z = FLOOR_Z + 0.035; out.append(o)
    # an office chair upside down on top of the desk, another knocked over in front
    cp = []; office_chair(M, cp)
    g2 = grp(cp, 0.0, 0.0, 0.0); g2.rotation_euler = (math.pi - 0.15, 0.25, 0.4); g2.location = P(0.25, -0.2, 1.3)
    out += cp
    cp2 = []; office_chair(M, cp2)
    g3 = grp(cp2, 0.0, 0.0, 0.0); g3.rotation_euler = (0, R90 + 0.05, 1.0); g3.location = P(1.05, 0.38, 0.27)
    out += cp2
    # boxes on the right end: SAMPLES / FRAGILE
    out.append(cbox('box1', 0.92, -0.25, 0.45, 0.4, 0.0, 0.38, M['cardboard'], bevel=0.02, rotz=0.12))
    out.append(cbox('box2', 0.85, -0.3, 0.38, 0.34, 0.38, 0.3, M['cardboard'], bevel=0.02, rotz=-0.2))
    out.append(nool(text('box_t', 'FRAGILE', 0.92, -0.04, 0.2, 0.06, M['red'], face=True)))
    tape_on(out, M, 0.85, -0.3, 0.68, 0.4, -0.2)
    # Varga's reinforcements: duct tape everywhere, a polite note
    tape_on(out, M, -0.3, 0.135, 0.62, 0.7, 0.55, face=True, w=0.08)
    tape_on(out, M, -0.3, 0.135, 0.62, 0.7, -0.55, face=True, w=0.08)
    tape_on(out, M, 0.62, 0.135, 0.3, 0.5, 0.2, face=True, w=0.08)
    sticky(out, M, 0.12, 0.137, 0.62, 0.2, 'note_y', ['PIRATES:', 'PLEASE', 'KNOCK'], rotz=-0.06, face=True, txt=0.035)
    # a spent extinguisher and a desk lamp on the floor
    out.append(ucyl('ext', 0.07, 0.42, -0.25, 0.48, FLOOR_Z + 0.07, M['red'], axis='u', verts=16, bevel=0.015))
    out[-1].location = P(-0.46, 0.48, FLOOR_Z + 0.07); out[-1].rotation_euler.z = 0.3
    out.append(nool(ucyl('ext_head', 0.04, 0.08, 0, 0, 0, M['dark'], verts=10, bevel=0.01)))
    out[-1].location = P(-0.05, 0.36, FLOOR_Z + 0.07); out[-1].rotation_euler = (0, R90, 0.3)
    finish(out, 'barricade', catcher=(0, 0, 3.2, 2.2), outline=0.012)

@job('chair', 'props')
def chair_job():
    mn.reset(); set_side('port'); out = []; M = mats()
    cp = []; office_chair(M, cp)
    g = grp(cp, 0, 0, 0); g.rotation_euler = (0, R90 + 0.05, 0.5); g.location = P(-0.1, 0.0, 0.27)
    out += cp
    finish(out, 'chair_tipped', catcher=(0, 0, 1.6, 1.4))

@job('shelf', 'props')
def shelf_job():
    """A shelf face down on the floor (footprint ~1.45 x 0.95), its contents spilled in front."""
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(5)
    sp = []; shelf(M, sp)
    g = grp(sp, 0, 0, 0); g.rotation_euler = (math.radians(-90), 0, 0.22); g.location = P(0.0, 0.0, 0.17)
    out += sp
    for k in range(9):
        m = M[rng.choice(['binder_r', 'binder_b', 'binder_y', 'binder_g'])]
        u, v = rng.uniform(-0.75, 0.75), rng.uniform(0.45, 0.85)
        o = cbox('binder', u, v, 0.26, 0.32, FLOOR_Z, 0.06, m, bevel=0.012, rotz=rng.uniform(0, 3)); out.append(o)
    for k in range(4):
        u, v = rng.uniform(-0.6, 0.6), rng.uniform(0.5, 0.95)
        out.append(cbox('sheet', u, v, 0.21, 0.29, FLOOR_Z + 0.1 + 0.003 * k, 0.004, M['paper'], bevel=0.0, rotz=rng.uniform(0, 3)))
        nool(out[-1])
    for k, jm in enumerate(('jar_g', 'jar_a', 'jar_p')):     # sample jars rolled out
        u, v = -0.5 + k * 0.45, 0.6 + 0.12 * (k % 2)
        out.append(ucyl('jar', 0.06, 0.17, u, v, FLOOR_Z + 0.06, M['glass'], axis='u', verts=14, bevel=0.01)); out[-1].rotation_euler.z = 0.6 * k
        out.append(nool(ucyl('jarc', 0.045, 0.12, u, v, FLOOR_Z + 0.06, M[jm], axis='u', verts=12, bevel=0.005))); out[-1].rotation_euler.z = 0.6 * k
    finish(out, 'shelf_down', catcher=(0, 0.2, 2.0, 1.8))

# ---------------------------------------------------------------------------------------------------
# The Red Comet carbine (dropped; 8 facings), Varga's lost shoe
# ---------------------------------------------------------------------------------------------------
@job('carbine', 'props')
def carbine_job():
    mn.reset(); set_side('port'); out = []; M = mats()
    z = FLOOR_Z
    out.append(cbox('recv', 0.0, 0.0, 0.42, 0.13, z, 0.11, M['gun'], bevel=0.02))
    out.append(cbox('guard', 0.3, 0.0, 0.28, 0.11, z + 0.005, 0.09, M['red'], bevel=0.02))
    for k in range(3): out.append(nool(cbox('vent', 0.24 + k * 0.06, 0.0, 0.025, 0.115, z + 0.092, 0.006, M['black'], bevel=0)))
    out.append(ucyl('barrel', 0.03, 0.18, 0.43, 0, z + 0.05, M['steel'], axis='u', verts=12, bevel=0.006)); out[-1].location = P(0.43, 0, z + 0.05)
    out.append(ucyl('muzzle', 0.045, 0.06, 0.6, 0, z + 0.05, M['gun'], axis='u', verts=12, bevel=0.01)); out[-1].location = P(0.6, 0, z + 0.05)
    out.append(nool(mn.sphere('emit', 0.03, loc=P(0.665, 0, z + 0.05), m=M['cell'], segs=10)))
    stock = vprism('stock', [(-0.2, 0.02), (-0.2, 0.1), (-0.5, 0.11), (-0.52, 0.0), (-0.42, 0.0), (-0.3, 0.05)], -0.05, 0.05, M['red'], bevel=0.015)
    stock.location.z += z; out.append(stock)
    out.append(cbox('butt', -0.51, 0, 0.04, 0.11, z, 0.12, M['rubber'], bevel=0.01))
    out.append(cbox('grip', -0.1, 0.12, 0.08, 0.14, z, 0.07, M['gun'], bevel=0.02, rotz=0.25))
    out.append(cbox('mag', 0.08, 0.13, 0.12, 0.14, z, 0.08, M['cell'], bevel=0.015))
    out.append(nool(cbox('magtape', 0.08, 0.13, 0.06, 0.15, z + 0.001, 0.085, M['tape'], bevel=0.005)))
    out.append(ucyl('scope', 0.035, 0.2, -0.08, 0, z + 0.14, M['dark'], axis='u', verts=12, bevel=0.008)); out[-1].location = P(-0.1, 0, z + 0.145)
    out.append(nool(mn.cyl('lens', 0.028, 0.004, loc=P(0.1, 0, z + 0.145), m=M['screen'], rot=(0, R90, 0), verts=12, bevel=0)))
    # skull sticker on the stock, a sling flopped beside it
    out.append(nool(disc('skull_st', -0.36, 0.0, z + 0.115, 0.04, M['white'])))
    out.append(nool(pipe_uv('sling', [(-0.46, 0.05, z + 0.02), (-0.4, 0.22, z + 0.01), (-0.1, 0.3, z + 0.01), (0.2, 0.24, z + 0.01), (0.34, 0.06, z + 0.03)], 0.012, M['rubber'], corner=0.08)))
    root = mn.link(bpy.data.objects.new('root', None))
    for o in out:
        if o.parent is None: o.parent = root
    finish(out, 'carbine', dirs=8, root=root, outline=0.01)

@job('shoe', 'props')
def shoe_job():
    """One of Varga's lab clogs, lost on the way to the airlock."""
    mn.reset(); set_side('port'); out = []; M = mats()
    sole = cbox('sole', 0, 0, 0.3, 0.13, FLOOR_Z, 0.035, M['rubber'], bevel=0.02, rotz=0.4); out.append(sole)
    out.append(mn.sphere('upper', 1, loc=P(0.04, 0.015, FLOOR_Z + 0.03), m=worn('clog', '#3aa8a0', 0.4, 0.0, wear=0.3), scale=(0.13, 0.065, 0.065), segs=20))
    out[-1].rotation_euler.z = -0.4
    out.append(nool(mn.sphere('hole', 1, loc=P(-0.06, -0.025, FLOOR_Z + 0.075), m=M['black'], scale=(0.06, 0.04, 0.01), segs=12))); out[-1].rotation_euler.z = -0.4
    for k in range(3):
        out.append(nool(mn.sphere('vent', 0.012, loc=P(0.06 + k * 0.03, 0.03 - k * 0.012, FLOOR_Z + 0.09), m=M['black'], segs=6)))
    finish(out, 'shoe', catcher=(0, 0, 0.6, 0.5), outline=0.008)

# ---------------------------------------------------------------------------------------------------
# Broken cryo freezer (footprint 1.5 x 0.8, h 1.4; origin = footprint centre; back edge against a wall)
# ---------------------------------------------------------------------------------------------------
@job('freezer', 'props')
def freezer_job():
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(9)
    w, d, h = 1.5, 0.8, 1.38
    u0, u1, vb, vf = -w / 2, w / 2, -d / 2, d / 2
    body = worn('frz', '#d0d8de', 0.45, 0.1, wear=0.6, grime=0.9, frost=0.7)
    out.append(ubox('frz', u0, vb, u1, vf, 0.0, h, body, bevel=0.04))
    out.append(ubox('kick', u0 + 0.02, vf - 0.03, u1 - 0.02, vf + 0.01, 0.0, 0.12, M['dark'], bevel=0.01))
    out.append(ubox('trim', u0 - 0.005, vf - 0.04, u1 + 0.005, vf + 0.012, 0.13, 0.2, M['teal'], bevel=0.01))
    # compressor housing on top, with a grille and a frosted coil
    out.append(ubox('comp', u0 + 0.06, vb + 0.06, u1 - 0.06, vf - 0.12, h, h + 0.14, M['labdk'], bevel=0.02))
    for i in range(8): out.append(nool(ubox('grille', u0 + 0.16 + i * 0.15, vb + 0.12, u0 + 0.22 + i * 0.15, vf - 0.2, h + 0.14, h + 0.15, M['black'], bevel=0)))
    out.append(pipe_uv('coil', [(u1 - 0.02, vb + 0.1, 0.3), (u1 + 0.05, vb + 0.1, 0.5), (u1 + 0.05, vb + 0.1, 1.0), (u1 + 0.05, 0.1, 1.0), (u1 + 0.05, 0.1, 0.4), (u1 - 0.02, 0.1, 0.4)], 0.025, M['copper'], corner=0.05))
    # the bay: burst open, dark inside, frost and a broken sample rack
    bu0, bu1 = u0 + 0.1, 0.28
    out.append(nool(ubox('bay', bu0, vf - 0.03, bu1, vf + 0.004, 0.24, 1.22, M['black'], bevel=0.0)))
    for z in (0.52, 0.86):
        out.append(ubox('rack', bu0 + 0.02, vf - 0.06, bu1 - 0.02, vf + 0.03, z, z + 0.025, M['steel'], bevel=0.004))
        for k in range(6):
            if rng.random() < 0.45: continue
            out.append(nool(ucyl('vial', 0.022, 0.1, bu0 + 0.1 + k * 0.1, vf + 0.0, z + 0.025, M[rng.choice(['jar_g', 'jar_a', 'jar_p'])], verts=8, bevel=0.004)))
    out.append(nool(mn.sphere('ice_in', 1, loc=P((bu0 + bu1) / 2, vf + 0.0, 0.24), m=M['frost_white'], scale=(0.4, 0.1, 0.09), segs=14)))
    # the door: off its upper hinge, hanging open towards the camera, buckled outward, three gouges
    hu, hv = u0, vf
    door = []
    door.append(cbox('door', 0.5, 0.0, 1.0, 0.07, 0.0, 1.06, body, bevel=0.025))
    # (swung right round: its inside faces the camera; it burst from the inside, so the gouges are in there)
    door.append(cbox('liner', 0.5, -0.045, 0.9, 0.025, 0.08, 0.9, M['frost_white'], bevel=0.01))
    door.append(nool(cbox('gasket', 0.5, -0.04, 0.98, 0.012, 0.02, 1.02, M['rubber'], bevel=0.004)))
    door.append(cbox('handle', 0.92, 0.06, 0.05, 0.05, 0.3, 0.45, M['steel'], bevel=0.012))
    door.append(cbox('win', 0.5, -0.02, 0.4, 0.11, 0.6, 0.28, M['frosted'], bevel=0.01))
    for k in range(3):
        g_ = cbox('gouge', 0.3 + k * 0.09, -0.06, 0.035, 0.012, 0.12, 0.4, M['black'], bevel=0.0); g_.rotation_euler.y = 0.3; door.append(nool(g_))
        g2 = cbox('gouge_e', 0.322 + k * 0.09, -0.062, 0.01, 0.012, 0.12, 0.4, M['steel'], bevel=0.0); g2.rotation_euler.y = 0.3; door.append(nool(g2))
    dg = grp(door, 0, 0, 0); dg.location = P(hu, hv + 0.02, 0.2); dg.rotation_euler = (0.04, -0.05, math.radians(-150))
    out.append(nool(text('brand', 'CRYO-MAX 9000', 0.0, vf + 0.015, 1.31, 0.06, M['varga'], face=True)))
    out += door
    # the right column: dead screen (taped), a red warning LED, the labels
    out.append(ubox('scr_bz', 0.33, vf - 0.01, 0.7, vf + 0.02, 0.98, 1.26, M['dark'], bevel=0.01))
    out.append(ubox('scr', 0.36, vf, 0.67, vf + 0.03, 1.01, 1.23, M['screen_dead'], bevel=0.004))
    tape_on(out, M, 0.52, vf + 0.03, 1.17, 0.36, 0.5, face=True, w=0.05)
    out.append(nool(mn.sphere('led', 0.03, loc=P(0.52, vf + 0.02, 0.92), m=M['led_r'], segs=10)))
    out.append(ubox('lbl', 0.32, vf, 0.72, vf + 0.015, 0.36, 0.84, M['white'], bevel=0.004))
    out.append(nool(ubox('lbl_r', 0.32, vf + 0.012, 0.72, vf + 0.019, 0.76, 0.84, M['hazard_r'], bevel=0)))
    for i, (ln, sz, col) in enumerate((('SAMPLES', 0.07, 'ink'), ('KEEP', 0.065, 'ink'), ('FROZEN', 0.065, 'ink'), ('(SERIOUSLY)', 0.04, 'red'))):
        out.append(nool(text('lbl_t', ln, 0.52, vf + 0.02, 0.68 - i * 0.085, sz, M[col], face=True)))
    sticky(out, M, 0.52, vf + 0.016, 0.33, 0.16, 'note_y', ['DEFROST', '= BAD'], rotz=0.1, face=True, txt=0.03)
    # cold spilling out on the floor, the plug yanked out
    out.append(plane('frost', 1.9, 1.1, frost_mat('frz_frost', 3.0), u=-0.25, v=vf + 0.4, z=FLOOR_Z + 0.002))
    for k in range(7):
        a = rng.uniform(0.2, math.pi - 0.2); r = rng.uniform(0.2, 0.55)
        sp = cone('ice', 0.035, 0.003, rng.uniform(0.07, 0.15), -0.25 + math.cos(a) * r * 1.4, vf + 0.15 + math.sin(a) * r * 0.6, FLOOR_Z, M['ice'], verts=5, bevel=0.003)
        sp.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0); out.append(sp)
    out.append(pipe_uv('cord', [(u1 - 0.1, vb + 0.05, 0.15), (u1 + 0.15, vb + 0.1, FLOOR_Z + 0.025), (u1 + 0.3, 0.2, FLOOR_Z + 0.025), (u1 + 0.18, 0.5, FLOOR_Z + 0.025)], 0.022, M['rubber'], corner=0.1))
    out.append(cbox('plug', u1 + 0.18, 0.56, 0.08, 0.1, FLOOR_Z, 0.05, M['dark'], bevel=0.012, rotz=0.4))
    finish(out, 'freezer_broken', catcher=(0, 0.3, 2.8, 2.0), outline=0.013)

# ---------------------------------------------------------------------------------------------------
# Lab benches with equipment (footprint 1.8 x 0.7, origin = footprint centre, back edge against a wall)
# ---------------------------------------------------------------------------------------------------
def bench_body(M, out, rng, open_door=False):
    W, Dp, H = 1.8, 0.7, 0.82
    out.append(cbox('kick', 0, 0.0, W - 0.06, Dp - 0.1, 0.0, 0.1, M['dark'], bevel=0.01))
    out.append(cbox('carcass', 0, -0.02, W - 0.04, Dp - 0.06, 0.1, H - 0.14, M['lab'], bevel=0.02))
    for k in range(3):                                # cabinet doors with handles
        cu = -W / 2 + 0.31 + k * 0.59
        if open_door and k == 0:
            dd = cbox('cdoor', 0.27, 0.0, 0.54, 0.03, 0.0, 0.56, M['lab'], bevel=0.012)
            g = grp([dd], 0, 0, 0); g.location = P(cu - 0.28, Dp / 2 - 0.03, 0.14); g.rotation_euler.z = math.radians(-70); out.append(dd)
            out.append(nool(cbox('cavity', cu, Dp / 2 - 0.05, 0.5, 0.02, 0.15, 0.54, M['black'], bevel=0)))
            for j in range(3): out.append(nool(cbox('spill_p', cu + rng.uniform(-0.25, 0.25), Dp / 2 + 0.2 + rng.uniform(0, 0.2), 0.2, 0.27, FLOOR_Z + 0.001 * j, 0.004, M['paper'], bevel=0, rotz=rng.uniform(0, 3))))
            continue
        out.append(cbox('cdoor', cu, Dp / 2 - 0.035, 0.54, 0.03, 0.14, 0.56, M['lab'], bevel=0.012))
        out.append(cbox('chandle', cu + 0.18, Dp / 2 - 0.01, 0.12, 0.03, 0.6, 0.03, M['steel'], bevel=0.008))
    out.append(cbox('top', 0, 0, W, Dp, H - 0.05, 0.05, M['top'], bevel=0.015))
    out.append(cbox('riser', 0, -Dp / 2 + 0.04, W, 0.06, H, 0.12, M['top'], bevel=0.012))
    return H

def flask(out, M, u, v, z, jm, s=1.0, tipped=False):
    if tipped:
        o = cone('flask', 0.08 * s, 0.03 * s, 0.18 * s, 0, 0, 0, M['glass'], verts=16, bevel=0.005); o.location = P(u, v, z + 0.07 * s); o.rotation_euler = (0, R90, 0.4); out.append(o)
        return
    out.append(cone('flask', 0.08 * s, 0.03 * s, 0.17 * s, u, v, z, M['glass'], verts=16, bevel=0.005))
    out.append(ucyl('neck', 0.028 * s, 0.07 * s, u, v, z + 0.17 * s, M['glass'], verts=12, bevel=0.003))
    out.append(nool(cone('liquid', 0.07 * s, 0.045 * s, 0.09 * s, u, v, z + 0.005, M[jm], verts=16, bevel=0.003)))

def microscope(out, M, u, v, z):
    out.append(cbox('ms_base', u, v, 0.2, 0.24, z, 0.04, M['white'], bevel=0.015))
    out.append(cbox('ms_arm', u, v - 0.08, 0.07, 0.06, z + 0.04, 0.3, M['white'], bevel=0.02))
    out.append(cbox('ms_stage', u, v + 0.02, 0.16, 0.14, z + 0.12, 0.02, M['dark'], bevel=0.006))
    o = ucyl('ms_tube', 0.03, 0.2, u, v - 0.02, z + 0.2, M['dark'], verts=12, bevel=0.006); o.rotation_euler.x = 0.5; out.append(o)
    o = ucyl('ms_eye', 0.02, 0.08, u, v - 0.12, z + 0.38, M['dark'], verts=10, bevel=0.005); o.rotation_euler.x = 0.5; out.append(o)

@job('bench', 'props')
def bench_job():
    # bench A: microscope, glowing sample rack, centrifuge with its lid up, the clipboard, a toppled flask dripping
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(21)
    H = bench_body(M, out, rng)
    microscope(out, M, -0.6, -0.05, H)
    out.append(cbox('rack', -0.15, -0.12, 0.34, 0.12, H, 0.07, M['steel'], bevel=0.01))
    for k, jm in enumerate(('jar_g', 'jar_a', 'jar_p', 'jar_g', None, 'jar_a')):
        tu = -0.29 + k * 0.056
        if jm is None: continue
        out.append(ucyl('tube', 0.02, 0.17, tu, -0.12, H + 0.03, M['glass'], verts=10, bevel=0.004))
        out.append(nool(ucyl('tube_l', 0.016, 0.1, tu, -0.12, H + 0.035, M[jm], verts=10, bevel=0.003)))
    out.append(ucyl('centrifuge', 0.17, 0.16, 0.32, -0.08, H, M['white'], verts=28, bevel=0.03))
    out.append(nool(ucyl('cf_in', 0.13, 0.01, 0.32, -0.08, H + 0.16, M['black'], verts=24, bevel=0)))
    lid = ucyl('cf_lid', 0.16, 0.03, 0, 0, 0, M['varga'], verts=28, bevel=0.01)
    g = grp([lid], 0, 0, 0); lid.location = P(0, 0.16, 0); g.location = P(0.32, -0.24, H + 0.16); g.rotation_euler.x = math.radians(-95)
    out.append(lid)
    out.append(nool(mn.sphere('cf_led', 0.018, loc=P(0.32, 0.09, H + 0.08), m=M['led_r'], segs=8)))
    out.append(cbox('clip', 0.7, 0.12, 0.24, 0.32, H, 0.012, M['cardboard'], bevel=0.004, rotz=-0.2))
    out.append(nool(cbox('clip_p', 0.7, 0.13, 0.21, 0.27, H + 0.012, 0.003, M['paper'], bevel=0, rotz=-0.2)))
    out.append(cbox('clip_c', 0.72, 0.0, 0.1, 0.03, H + 0.012, 0.02, M['steel'], bevel=0.005, rotz=-0.2))
    flask(out, M, 0.05, 0.18, H, 'jar_g', tipped=True)
    out.append(plane('spill', 0.36, 0.26, puddle_mat('spill', '#3ad49a', 0.3, 4.0), u=0.0, v=0.24, z=H + 0.002))
    out.append(plane('drip', 0.14, 0.32, puddle_mat('drip', '#3ad49a', 0.3, 6.0), u=-0.02, v=0.355, z=H - 0.17, face=True))
    flask(out, M, 0.55, -0.18, H, 'jar_a', 1.1)
    # shelf on the riser: bottles and a jar of... something best not asked about (it's pickles)
    for k, (jm, s) in enumerate((('jar_p', 1.0), ('jar_g', 0.8), ('jar_a', 1.2))):
        u = -0.75 + k * 0.16
        out.append(ucyl('bottle', 0.05 * s, 0.14 * s, u, -0.31, H + 0.12, M['glass'], verts=12, bevel=0.005))
        out.append(nool(ucyl('bottle_l', 0.042 * s, 0.09 * s, u, -0.31, H + 0.125, M[jm], verts=12, bevel=0.004)))
    sticky(out, M, 0.85, -0.27, H + 0.12, 0.15, 'note_p', ['LABEL', 'STUFF'], rotz=0.0, face=False, txt=0.028)
    out.append(plane('scuff', 0.6, 0.5, scorch_mat('bsc', 15.0), u=-0.35, v=0.36, z=0.42, face=True))   # a bolt glanced off the cabinet
    finish(out, 'bench_a', catcher=(0, 0.2, 2.4, 1.4))

    # bench B: cracked monitor (taped), keyboard, knocked-over lamp, flasks (one broken), a cabinet door torn open
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(22)
    H = bench_body(M, out, rng, open_door=True)
    out.append(cbox('mon_foot', -0.3, -0.18, 0.24, 0.16, H, 0.02, M['dark'], bevel=0.008))
    out.append(cbox('mon_neck', -0.3, -0.2, 0.06, 0.04, H + 0.02, 0.16, M['dark'], bevel=0.01))
    out.append(cbox('mon', -0.3, -0.18, 0.62, 0.05, H + 0.14, 0.4, M['dark'], bevel=0.015))
    out.append(cbox('mon_scr', -0.3, -0.153, 0.56, 0.01, H + 0.17, 0.34, M['screen'], bevel=0.003))
    for (a, l, du, dz) in ((0.6, 0.3, 0.05, 0.22), (-0.9, 0.22, 0.08, 0.27), (0.15, 0.25, -0.05, 0.3)):
        o = mn.box('crack', (l, 0.004, 0.008), loc=P(-0.3 + du, -0.145, H + 0.14 + dz), m=M['black'], bevel=0); o.rotation_euler.y = a; out.append(nool(o))
    tape_on(out, M, -0.25, -0.147, H + 0.42, 0.4, -0.35, face=True, w=0.05)
    out.append(nool(text('scr_t', 'SIGNAL LOST', -0.3, -0.146, H + 0.22, 0.05, M['white'], face=True, depth=0.001)))
    out.append(cbox('kbd', -0.28, 0.13, 0.48, 0.16, H, 0.03, M['dark'], bevel=0.01, rotz=0.12))
    for i in range(3): out.append(nool(cbox('keys', -0.28, 0.09 + i * 0.045, 0.42, 0.025, H + 0.03, 0.004, M['labdk'], bevel=0, rotz=0.12)))
    # desk lamp knocked over, its shade on the bench
    out.append(ucyl('lamp_base', 0.07, 0.03, 0.62, -0.2, H, M['varga'], verts=16, bevel=0.01))
    out.append(pipe_uv('lamp_arm', [(0.62, -0.2, H + 0.03), (0.66, -0.05, H + 0.2), (0.8, 0.15, H + 0.08)], 0.015, M['steel'], corner=0.05))
    sh = cone('lamp_shade', 0.06, 0.1, 0.1, 0, 0, 0, M['varga'], verts=16, bevel=0.005); sh.location = P(0.82, 0.18, H + 0.06); sh.rotation_euler = (1.4, 0, 0.6); out.append(sh)
    flask(out, M, 0.25, -0.12, H, 'jar_p', 1.0)
    flask(out, M, 0.4, -0.2, H, 'jar_a', 0.8)
    for k in range(6):                                # the third one: shards
        sh = vprism('shard', [(0, 0), (0.05, 0), (0.02, 0.06)], 0, 0.006, M['shard']); sh.location = P(0.32 + rng.uniform(-0.12, 0.12), 0.12 + rng.uniform(-0.08, 0.1), H + 0.003)
        sh.rotation_euler = (-R90, 0, rng.uniform(0, 3)); out.append(nool(sh))
    out.append(plane('spill', 0.3, 0.2, puddle_mat('spill_b', '#c07aff', 0.3, 3.0), u=0.33, v=0.12, z=H + 0.002))
    out.append(ucyl('burner', 0.035, 0.12, 0.05, -0.2, H, M['steel'], verts=12, bevel=0.006))
    out.append(nool(pipe_uv('gas', [(0.05, -0.2, H + 0.02), (0.0, -0.33, H + 0.02), (-0.05, -0.36, H + 0.3)], 0.012, M['red'], corner=0.06)))
    sticky(out, M, 0.75, 0.1, H, 0.15, 'note_y', ['BACK IN', '5 MIN', '- V.'], rotz=0.25, face=False, txt=0.026)
    out.append(plane('scorch', 0.5, 0.5, scorch_mat('bsc2', 17.0), u=0.45, v=0.36, z=0.45, face=True))
    out.append(nool(mn.cyl('bhole', 0.035, 0.01, loc=P(0.45, 0.37, 0.45), m=M['black'], rot=(R90, 0, 0), verts=10, bevel=0)))
    finish(out, 'bench_b', catcher=(0, 0.25, 2.4, 1.5))

# ---------------------------------------------------------------------------------------------------
# Small things: papers, Gerald, the mug, sticky notes
# ---------------------------------------------------------------------------------------------------
M_PAPER = [None]
def bootprint(out, u, v, z, a, m):
    c, s = math.cos(a), math.sin(a)
    for (du, r1, r2) in ((0.045, 0.075, 0.036), (-0.085, 0.036, 0.032)):       # sole and heel
        out.append(nool(disc('boot', u + du * c, v + du * s, z, r1, m, sv=r2 / r1, rotz=a)))
    for k in range(4):                                                             # tread bars (paper showing through)
        du = 0.0 + k * 0.03
        out.append(nool(cbox('tread', u + du * c, v + du * s, 0.008, 0.05, z + 0.0004, 0.0004, M_PAPER[0], bevel=0, rotz=a)))

@job('papers', 'props')
def papers_job():
    for nm, n, seed, extra in (('papers_a', 6, 31, 'boot'), ('papers_b', 8, 32, 'coffee'), ('papers_c', 4, 33, 'clip')):
        mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(seed)
        top = []
        for k in range(n):
            u, v = rng.uniform(-0.45, 0.45), rng.uniform(-0.3, 0.3)
            m = M[rng.choice(['paper', 'paper', 'paper2', 'graph'])]
            o = cbox('sheet', u, v, 0.21, 0.29, FLOOR_Z + 0.001 + k * 0.0012, 0.003, m, bevel=0.0, rotz=rng.uniform(0, math.tau))
            o.rotation_euler.x = rng.uniform(-0.04, 0.04); out.append(nool(o)); top.append((u, v, FLOOR_Z + 0.005 + k * 0.0012))
        mk = pmat('boot', '#1a1612', 0.9); M_PAPER[0] = pmat('ppr', '#ece8dc', 0.85)
        if extra == 'boot':
            u, v, z = top[-1]; bootprint(out, u, v, z + 0.001, 0.4, mk)
            u, v, z = top[-3]; bootprint(out, u + 0.03, v, z + 0.001, 0.5, mk)
        if extra == 'coffee':
            u, v, z = top[-1]
            out.append(nool(ring('cring', 0.07, 0.012, 0.0005, loc=P(u + 0.03, v, z + 0.0005), m=pmat('cring', '#7a4a24', 0.8), verts=24)))
        if extra == 'clip':
            out.append(cbox('clipboard', 0.15, 0.05, 0.26, 0.34, FLOOR_Z, 0.012, M['cardboard'], bevel=0.004, rotz=0.7))
            out.append(nool(cbox('clip_p', 0.15, 0.05, 0.22, 0.29, FLOOR_Z + 0.012, 0.003, M['paper'], bevel=0, rotz=0.7)))
            out.append(cbox('clip_c', 0.15 - 0.15 * math.sin(0.7), 0.05 - 0.15 * math.cos(0.7), 0.1, 0.03, FLOOR_Z + 0.012, 0.02, M['steel'], bevel=0.005, rotz=0.7))
            out.append(ucyl('pen', 0.012, 0.16, -0.25, 0.2, FLOOR_Z + 0.012, pmat('pen', '#2a6ab0', 0.4), axis='u', verts=8, bevel=0.003)); out[-1].rotation_euler.z = 0.3
        finish(out, nm, outline=0.006)

@job('gerald', 'props')
def gerald_job():
    """Gerald: Varga's plant. Didn't make it. Pot ~0.36 across, origin = pot centre."""
    mn.reset(); set_side('port'); out = []; M = mats(); rng = random.Random(4)
    out.append(cone('pot', 0.13, 0.17, 0.26, 0, 0, 0, M['terracotta'], verts=28, bevel=0.015))
    out.append(ring('rim', 0.185, 0.05, 0.06, loc=P(0, 0, 0.23), m=M['terracotta'], verts=28))
    out.append(nool(ucyl('soil', 0.15, 0.01, 0, 0, 0.25, M['soil'], verts=24, bevel=0)))
    out.append(nool(cbox('chip', 0.13, 0.11, 0.06, 0.03, 0.23, 0.05, M['soil'], bevel=0.005, rotz=-0.7)))
    # the stems: drooping over the rim, a few curled brown leaves still hanging on
    for k in range(6):
        a = k / 6 * math.tau + rng.uniform(-0.3, 0.3); r = rng.uniform(0.25, 0.42); hgt = rng.uniform(0.35, 0.55)
        p0 = (math.cos(a) * 0.03, math.sin(a) * 0.03, 0.25)
        p1 = (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.25 + hgt)
        p2 = (math.cos(a) * r, math.sin(a) * r, 0.25 + hgt * 0.75)
        p3 = (math.cos(a) * (r + 0.06), math.sin(a) * (r + 0.06), 0.25 + hgt * 0.35)
        out.append(pipe_uv('stem', [p0, p1, p2, p3], 0.012, M['stem'], corner=0.1))
        for t, (pa, pb) in enumerate(((p1, p2), (p2, p3))):
            lu, lv, lz = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2
            lf = mn.sphere('leaf', 1, loc=P(lu, lv, lz - 0.03), m=M['dead_leaf' if rng.random() < 0.6 else 'dead_leaf2'], scale=(0.085, 0.036, 0.012), segs=12)
            lf.rotation_euler = (rng.uniform(-0.6, 0.6), 0.9 + rng.uniform(-0.3, 0.3), -a); out.append(lf)
    for k in range(4):                             # leaves that gave up entirely
        a = rng.uniform(0, math.tau); r = rng.uniform(0.25, 0.4)
        lf = mn.sphere('fallen', 1, loc=P(math.cos(a) * r, math.sin(a) * r * 0.8 + 0.08, FLOOR_Z + 0.008), m=M['dead_leaf'], scale=(0.065, 0.03, 0.01), segs=10)
        lf.rotation_euler.z = rng.uniform(0, 3); out.append(nool(lf))
    # a stake card (and, below, the name tag)
    out.append(cbox('stake', 0.08, 0.08, 0.012, 0.012, 0.25, 0.22, pmat('stake', '#c9a46a', 0.8), bevel=0.003))
    out.append(cbox('card', 0.08, 0.087, 0.15, 0.008, 0.4, 0.09, M['white'], bevel=0.003))
    out.append(nool(text('card_t', 'R.I.P.?', 0.08, 0.093, 0.445, 0.038, M['ink'], face=True, depth=0.001)))
    # the name tag proper: a card on a string round the rim, hanging on the front
    out.append(nool(pipe_uv('string', [(-0.12, 0.12, 0.27), (0.0, 0.2, 0.2), (0.12, 0.12, 0.27)], 0.006, M['ink'], corner=0.05)))
    tag2 = mn.box('nametag', (0.26, 0.012, 0.1), loc=P(0, 0.205, 0.1), m=M['white'], bevel=0.004); tag2.rotation_euler.x = 0.15; out.append(tag2)
    t = text('nametag_t', 'GERALD', 0, 0.214, 0.15, 0.068, M['ink'], face=True, depth=0.002); t.rotation_euler.x += 0.15; out.append(nool(t))
    g = grp([o for o in out], 0, 0, 0); g.scale = (1.25, 1.25, 1.25)
    finish(out, 'gerald', catcher=(0, 0.05, 1.3, 1.1), outline=0.008)

def okay_mug(out, M, cu=0.0, cv=0.0, z=0.0):
    r, hgt = 0.165, 0.2
    cer = M['ceramic']
    out.append(ucyl('mug', r, hgt, cu, cv, z, cer, verts=32, bevel=0.02))
    out.append(nool(ring('band', r + 0.002, 0.008, 0.025, loc=P(cu, cv, z + 0.02), m=M['teal'], verts=32)))
    out.append(nool(ring('band2', r + 0.002, 0.008, 0.02, loc=P(cu, cv, z + hgt - 0.035), m=M['teal'], verts=32)))
    out.append(wrap_text('mug_t1', "WORLD'S", 0.036, cu, cv, r + 0.001, z + 0.15, M['ink'], depth=0.002))
    out.append(wrap_text('mug_t2', 'OKAYEST', 0.05, cu, cv, r + 0.001, z + 0.105, M['red'], depth=0.002))
    out.append(wrap_text('mug_t3', 'SCIENTIST', 0.036, cu, cv, r + 0.001, z + 0.06, M['ink'], depth=0.002))
    out.append(ring('handle', 0.07, 0.026, 0.035, loc=P(cu + r + 0.03, cv, z + hgt * 0.55), m=cer, rot=(R90, 0, 0)))
    return r, hgt

@job('mug', 'props')
def mug_job():
    # upright: cold coffee with a skin on it (sits on a bench or the floor; origin = mug centre, base z 0)
    mn.reset(); set_side('port'); out = []; M = mats()
    r, hgt = okay_mug(out, M)
    out.append(nool(ucyl('coffee', r - 0.022, 0.01, 0, 0, hgt - 0.03, M['coffee'], verts=28, bevel=0)))
    out.append(nool(disc('skin', 0.02, -0.02, hgt - 0.019, 0.07, pmat('skin', '#6a4a30', 0.7), sv=0.8)))
    finish(out, 'mug', catcher=(0, 0, 0.7, 0.6), outline=0.009)
    # knocked over: lying on its side, the cold coffee across the floor
    mn.reset(); set_side('port'); out = []; M = mats()
    parts = []; okay_mug(parts, M)
    g = grp(parts, 0, 0, 0); g.rotation_euler = (math.radians(-90), 0, 0.35); g.location = P(-0.06, -0.08, 0.165)
    out += parts
    out.append(plane('spill', 0.7, 0.5, puddle_mat('cspill', '#3a2414', 0.0, 3.0, 0.9), u=0.15, v=-0.25, z=FLOOR_Z + 0.002))
    finish(out, 'mug_spilled', catcher=(0, 0, 0.9, 0.8), outline=0.009)

@job('sticky', 'props')
def sticky_job():
    for nm, col, lines, rot in (('sticky_look', 'note_y', ['ALSO', 'DO NOT', 'LOOK AWAY'], 0.2),
                                ('sticky_feed', 'note_p', ['DO NOT', 'FEED', '(SERIOUSLY)'], -0.3),
                                ('sticky_back', 'note_b', ['BACK IN', '5 MIN', '- V.'], 0.5)):
        mn.reset(); set_side('port'); out = []; M = mats()
        sticky(out, M, 0, 0, FLOOR_Z, 0.3, col, lines, rotz=rot, txt=0.05)
        # a curled-up corner
        c = cbox('curl', 0.11, -0.11, 0.08, 0.08, FLOOR_Z + 0.005, 0.003, M[col], bevel=0, rotz=rot); c.rotation_euler.x = 0.5; out.append(nool(c))
        finish(out, nm, outline=0.006)

# ---------------------------------------------------------------------------------------------------
if __name__ == '__main__':
    t0 = time.time()
    for name, grp_, fn in JOBS:
        if ONLY and name not in ONLY and grp_ not in ONLY: continue
        t = time.time(); fn(); print(f'[aftermath] {name}: {time.time() - t:.1f} s', flush=True)
    print(f'[aftermath] total {time.time() - t0:.1f} s')
