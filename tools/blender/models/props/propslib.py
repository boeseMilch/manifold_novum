"""Shared helpers for the ship's furniture and clutter (models/props/*.py), on top of mn.py.

Materials follow the interceptor's look (worn paint: AO grime in crevices, soft blotches, thin
scratches; palette colours lifted 1.35x because AgX darkens lit surfaces). Every script registers
its sprites with @job and runs them one scene at a time:

    blender -b --factory-startup --python tools/blender/models/props/<script>.py [-- quick] [-- only a,b]

`quick` renders at 16 samples (for iterating), `only` picks jobs by name.

Placement: the game draws most clutter with ctx.rotate(a) around its (x, y). A model is built in its
local frame (x right, game y down = Blender -Y) and rendered at that exact angle: the root turns by -a
around Z (canvas rotation is clockwise on screen). The sprite's origin is the game's (x, y) on the floor.
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
from shiplib import glow, pipe, label, ring

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
ONLY = None
for a in ARGS:
    if a.startswith('only='): ONLY = set(a[5:].split(','))
if 'only' in ARGS: ONLY = set(ARGS[ARGS.index('only') + 1].split(','))
if QUICK: mn.SAMPLES = 16

GAIN = 1.35
R90 = (math.radians(90), 0, 0)
E = math.radians(mn.ELEVATION)

def lift(color, gain=GAIN):
    return tuple(min(1.0, c * gain) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
def worn(name, color, rough=0.55, metal=0.0, grime=1.0, scratch=0.5, scale=1.0, gain=GAIN, emit=None, emit_strength=0.0, coat=0.0):
    """Worn paint: dirt in crevices (AO) and soft blotches, a few thin scratches showing bare metal."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color, gain), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.08; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 3.0 * scale; blot.inputs['Detail'].default_value = 6
    L(tc.outputs['Object'], blot.inputs['Vector'])
    g1 = N.new('ShaderNodeMapRange'); g1.inputs['From Min'].default_value = 0.45; g1.inputs['From Max'].default_value = 0.75
    g1.inputs['To Max'].default_value = 0.25 * grime; L(blot.outputs['Fac'], g1.inputs['Value'])
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; L(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.6 * grime; L(aoi.outputs[0], aok.inputs[0])
    gs = N.new('ShaderNodeMath'); gs.operation = 'ADD'; gs.use_clamp = True; L(g1.outputs[0], gs.inputs[0]); L(aok.outputs[0], gs.inputs[1])
    dirt = N.new('ShaderNodeMix'); dirt.data_type = 'RGBA'; dirt.blend_type = 'MULTIPLY'
    L(gs.outputs[0], dirt.inputs['Factor']); L(rgb.outputs[0], dirt.inputs[6]); dirt.inputs[7].default_value = (0.1, 0.085, 0.07, 1)
    col = dirt.outputs[2]; rough_out = None
    if scratch:
        sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
        L(tc.outputs['Object'], sm.inputs['Vector'])
        sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 7 * scale; sn.inputs['Detail'].default_value = 2; L(sm.outputs[0], sn.inputs['Vector'])
        sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
        sc.inputs['To Max'].default_value = scratch; L(sn.outputs['Fac'], sc.inputs['Value'])
        bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; L(sc.outputs[0], bare.inputs['Factor'])
        L(col, bare.inputs[6]); bare.inputs[7].default_value = (0.45, 0.46, 0.48, 1); col = bare.outputs[2]
        rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough; rr.inputs['To Max'].default_value = 0.3
        L(sc.outputs[0], rr.inputs['Value']); rough_out = rr.outputs[0]
    L(col, b.inputs['Base Color'])
    if rough_out: L(rough_out, b.inputs['Roughness'])
    else: b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*mn.hex_rgb(mn.PALETTE.get(emit, emit)), 1); b.inputs['Emission Strength'].default_value = emit_strength
    return m

def plain(name, color, rough=0.5, metal=0.0, gain=GAIN, coat=0.0, emit=None, emit_strength=0.0, sheen=0.0, sss=0.0):
    """Clean material (plastic, paper, fabric, food)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lift(color, gain), 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat
    if sheen: b.inputs['Sheen Weight'].default_value = sheen
    if emit:
        b.inputs['Emission Color'].default_value = (*mn.hex_rgb(mn.PALETTE.get(emit, emit)), 1); b.inputs['Emission Strength'].default_value = emit_strength
    return m

def stripes_mat(name, a, b_, k=6.0, rough=0.5, axis='xy', soft=False):
    """Two-colour bands (hazard stripes, tabby fur). axis 'xy' = diagonal in x+y, 'x', 'y', 'z'."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    if len(axis) == 2:
        s = N.new('ShaderNodeMath'); s.operation = 'ADD'; L(sep.outputs['XYZ'.index(axis[0].upper())], s.inputs[0]); L(sep.outputs['XYZ'.index(axis[1].upper())], s.inputs[1]); v = s.outputs[0]
    else:
        v = sep.outputs['XYZ'.index(axis.upper())]
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = k; L(v, mu.inputs[0])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L(mu.outputs[0], fr.inputs[0])
    st = N.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = 0.5; L(fr.outputs[0], st.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    mx.inputs[6].default_value = (*lift(a), 1); mx.inputs[7].default_value = (*lift(b_), 1)
    L(st.outputs[0], mx.inputs[0]); L(mx.outputs[2], b.inputs['Base Color'])
    return m

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def prism(name, pts, z0, z1, m=None, bevel=0.01, segs=2):
    """Extrude a 2D polygon given in game-local coords (x, y_game) from z0 to z1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, -y, z0)) for x, y in pts]
    f = bm.faces.new(vs)
    if f.normal.z < 0: f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn._obj(name, me)
    if bevel: mn.bev(o, bevel, segs)
    if m: mn.assign(o, m)
    return o

def tube(name, pts, r, m=None, corner=0.05, res=12):
    """Pipe through game-local points (x, y_game, z)."""
    return pipe(name, [(x, -y, z) for x, y, z in pts], r, m, corner=corner, res=res)

def text(name, body, size, loc, m, rot=(0, 0, 0), depth=0.003):
    return label(name, body, size, loc, rot=rot, m=m, depth=depth)

def G(x, y, z=0.0):
    """Game-local (x, y) -> Blender."""
    return (x, -y, z)

def shift_mesh(o, dx=0.0, dy=0.0, dz=0.0):
    """Move the mesh inside its object (to put the pivot at an edge)."""
    for v in o.data.vertices: v.co.x += dx; v.co.y += dy; v.co.z += dz
    return o

def bend(o, angle, axis='Z', origin=None):
    md = o.modifiers.new('bend', 'SIMPLE_DEFORM'); md.deform_method = 'BEND'; md.angle = angle; md.deform_axis = axis
    if origin: md.origin = origin
    return o

# ---------------------------------------------------------------------------
# Jobs and rendering
# ---------------------------------------------------------------------------
JOBS = []
_CPU = [False]
_orig_reset = mn.reset
def _reset():
    sc = _orig_reset()
    if _CPU[0]: sc.cycles.device = 'CPU'
    return sc
mn.reset = _reset
def job(name):
    def deco(fn): JOBS.append((name, fn)); return fn
    return deco

class Kit:
    """Collects the parts of one model; outline() and the root for placing it."""
    def __init__(self): self.parts = []; self.no_outline = set()
    def __call__(self, o, outline=True):
        self.parts.append(o)
        if not outline: self.no_outline.add(o.name)
        return o
    def outline(self, thickness=0.013):
        mn.outline([o for o in self.parts if o.name not in self.no_outline and o.type == 'MESH'], thickness=thickness)
    def root(self):
        r = mn.link(bpy.data.objects.new('root', None))
        for o in self.parts:
            if o.parent is None: o.parent = r
        return r

def place(k, name, a=0.0, frames=None, passes=('beauty', 'normal', 'height'), dirs=1):
    """Render kit k: dirs == 1 at the exact game angle a (radians, canvas rotation), else dirs facings."""
    r = k.root()
    if dirs > 1:
        return mn.render('props/' + name, objs=k.parts, root=r, dirs=dirs, frames=frames, passes=passes)
    r.rotation_euler.z = -a
    bpy.context.view_layer.update()
    return mn.render('props/' + name, objs=k.parts, frames=frames, passes=passes)

def run():
    import time
    t0 = time.time()
    for name, fn in JOBS:
        if ONLY and name not in ONLY: continue
        for attempt in range(4):                  # the GPU is shared with other renders: retry, then fall back to CPU
            t = time.time(); mn.reset()
            try:
                fn(); break
            except RuntimeError as e:
                if 'memory' not in str(e).lower() or attempt == 3: raise
                print(f'[props] {name}: out of GPU memory, retry {attempt + 1}' + (' on CPU' if attempt >= 1 else ''))
                time.sleep(5); _CPU[0] = _CPU[0] or attempt >= 1
        print(f'[props] {name}: {time.time() - t:.1f} s')
    print(f'[props] total {time.time() - t0:.1f} s')

# mulberry32, exactly as js/art.js rng(): for the game's seeded scatter (papers, cracks, junk)
def rng(seed):
    s = [seed & 0xffffffff]
    def imul(a, b): return (a * b) & 0xffffffff
    def f():
        s[0] = (s[0] + 0x6D2B79F5) & 0xffffffff
        t = s[0]
        t = imul(t ^ (t >> 15), 1 | t)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return f
