"""Shared helpers for the fx group (fires, breaches, decals, explosions), on top of mn.py.

Flipbooks: every frame gets its own objects (meshes built for that frame), shown only on that scene
frame via keyframed hide_render (see `only_on`). That lets us sculpt each frame procedurally (flame
tongues, explosion puffs) instead of fighting simulations, and keeps the stylized, toy-like look.

Materials
  fire_mat   toon fire: pure emission, colour from a CONSTANT ramp over "how much the surface faces the
             camera" (centre hot, rim cool) and height (tips cooler). Banded like the game's three-layer
             flames, so a single mesh reads as red rim / orange / yellow-white core.
  decal_mat  flat floor decal with a soft alpha edge (radial falloff with noise)
  worn       shiplib.pmat (grime) re-exported
"""
import sys, os, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ship'))
import bpy, bmesh
from mathutils import Vector, noise
import mn
from shiplib import pmat, glow, pipe, label, ring   # noqa: F401  (re-exported for the fx scripts)

E = math.radians(mn.ELEVATION)
GAIN = 1.35

def lift(color, gain=GAIN):
    return tuple(min(1.0, c * gain) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def rgba(color, gain=1.0):
    return (*lift(color, gain), 1)

worn = pmat

# ---------------------------------------------------------------------------
# Fire material
# ---------------------------------------------------------------------------
FIRE = ['#c01808', '#ff4400', '#ff9400', '#ffe060']            # rim -> core (normal fire)
PLASMA = ['#3a0ca8', '#6a1cff', '#b05cff', '#f0d0ff']           # rim -> core (plasma fire)

def fire_mat(name, cols=FIRE, strength=1.2, stops=(0.0, 0.25, 0.5, 0.7), height_cool=0.55, alpha=1.0):
    """Toon fire emission. cols: 4 colours rim -> core. height_cool: how much cooler the top gets."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    N.clear()
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); em.name = 'Emission'
    em.inputs['Strength'].default_value = strength
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    Lk(lw.outputs['Facing'], inv.inputs[1])                      # 1 facing the camera, 0 at the silhouette
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Generated'], sep.inputs[0])
    hz = N.new('ShaderNodeMath'); hz.operation = 'MULTIPLY_ADD'; hz.inputs[1].default_value = -height_cool; hz.inputs[2].default_value = 1.0
    Lk(sep.outputs['Z'], hz.inputs[0])                           # 1 at the bottom, 1-height_cool at the top
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 2
    Lk(tc.outputs['Object'], nz.inputs['Vector'])
    nk = N.new('ShaderNodeMath'); nk.operation = 'MULTIPLY_ADD'; nk.inputs[1].default_value = 0.25; nk.inputs[2].default_value = 0.88
    Lk(nz.outputs['Fac'], nk.inputs[0])
    v1 = N.new('ShaderNodeMath'); v1.operation = 'MULTIPLY'; Lk(inv.outputs[0], v1.inputs[0]); Lk(hz.outputs[0], v1.inputs[1])
    v2 = N.new('ShaderNodeMath'); v2.operation = 'MULTIPLY'; Lk(v1.outputs[0], v2.inputs[0]); Lk(nk.outputs[0], v2.inputs[1])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    while len(cr.elements) < len(cols): cr.elements.new(0.5)
    for el, p, c in zip(cr.elements, stops, cols): el.position = p; el.color = rgba(c)
    Lk(v2.outputs[0], ramp.inputs[0]); Lk(ramp.outputs[0], em.inputs['Color'])
    if alpha < 1.0:
        tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader'); mx.inputs[0].default_value = alpha
        Lk(tr.outputs[0], mx.inputs[1]); Lk(em.outputs[0], mx.inputs[2]); Lk(mx.outputs[0], out.inputs['Surface'])
    else:
        Lk(em.outputs[0], out.inputs['Surface'])
    return m

def smoke_mat(name, color='#4a4a52', rough=0.95):
    """Lit, soft smoke (diffuse grey). Stays toy-like thanks to the outline."""
    return pmat(name, color, rough, 0.0, grime=0.25, grime_scale=3.0)

# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
def _mesh_obj(name, bm, m=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me)
    if m: mn.assign(o, m)
    if smooth: mn.smooth(o)
    return o

def lathe(name, profile, path, m=None, segs=20, flat=1.0, twist=0.0):
    """Surface of revolution along a bent centre line.
    profile: list of radii, path: list of (x, y, z) centre points (same length). flat: y squash."""
    bm = bmesh.new(); rings = []
    for k, (r, c) in enumerate(zip(profile, path)):
        ring_ = []
        if r <= 1e-4:
            ring_ = [bm.verts.new(c)]
        else:
            for i in range(segs):
                a = i / segs * math.tau + twist * k
                ring_.append(bm.verts.new((c[0] + math.cos(a) * r, c[1] + math.sin(a) * r * flat, c[2])))
        rings.append(ring_)
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) == 1 and len(B) == 1: continue
        if len(A) == 1:
            for i in range(segs): bm.faces.new((A[0], B[i], B[(i + 1) % segs]))
        elif len(B) == 1:
            for i in range(segs): bm.faces.new((A[i], B[0], A[(i + 1) % segs]))
        else:
            for i in range(segs): bm.faces.new((A[i], B[i], B[(i + 1) % segs], A[(i + 1) % segs]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _mesh_obj(name, bm, m)

def tongue(name, base, h, w, sway=(0.0, 0.0), m=None, wob=0.0, wob_ph=0.0, n=18, flat=0.8, segs=18):
    """A teardrop flame tongue standing on base (x, y, z): height h, belly radius w, tip bent by sway."""
    prof, path = [], []
    for k in range(n + 1):
        t = k / n
        r = w * math.sin(math.pi * t ** 0.62) ** 1.1 * (1.0 + wob * math.sin(t * 9 + wob_ph) * t)
        if k == n: r = 0
        prof.append(max(0.0, r))
        path.append((base[0] + sway[0] * t * t, base[1] + sway[1] * t * t, base[2] + h * t))
    return lathe(name, prof, path, m, segs=segs, flat=flat)

def lumpy(name, r, loc=(0, 0, 0), m=None, seed=0, amp=0.18, freq=1.6, sub=3, squash=(1, 1, 1)):
    """Ico sphere pushed around by 3D noise: a puff of fire or smoke, a rock, a lump of slag."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    off = Vector((seed * 7.13, seed * 3.71, seed * 5.27))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1.0 + amp * noise.noise(d * freq + off) * 2.0 + amp * 0.5 * noise.noise(d * freq * 2.3 + off)
        v.co = Vector((d.x * r * k * squash[0], d.y * r * k * squash[1], d.z * r * k * squash[2]))
    o = _mesh_obj(name, bm, m); o.location = loc; return o

def blob_pts(r, seed, n=40, rough=0.25, freq=2.2, ry=None):
    """Irregular closed outline (list of (x, y)) around the origin, radius about r."""
    off = Vector((seed * 1.37, seed * 2.11, 0.5))
    ry = ry or r; pts = []
    for i in range(n):
        a = i / n * math.tau
        k = 1.0 + rough * noise.noise(Vector((math.cos(a) * freq, math.sin(a) * freq, 0)) + off) * 2.0
        pts.append((math.cos(a) * r * k, math.sin(a) * ry * k))
    return pts

def flat_poly(name, pts, z=0.0, m=None, thick=0.0, grid=0):
    """A flat polygon (triangle fan, optionally extruded by thick). grid>0 adds inner rings for shading."""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, z))
    rings = [[bm.verts.new((x * (k + 1) / (grid + 1), y * (k + 1) / (grid + 1), z)) for x, y in pts] for k in range(grid + 1)]
    n = len(pts)
    for i in range(n): bm.faces.new((c, rings[0][i], rings[0][(i + 1) % n]))
    for k in range(grid):
        A, B = rings[k], rings[k + 1]
        for i in range(n): bm.faces.new((A[i], B[i], B[(i + 1) % n], A[(i + 1) % n]))
    if thick:
        ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
        for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if not thick:                                       # a decal must face up (towards the camera)
        for f in bm.faces:
            if f.normal.z < 0: f.normal_flip()
    for f in bm.faces: f.smooth = True
    return _mesh_obj(name, bm, m, smooth=False)

# ---------------------------------------------------------------------------
# Decal material (soft-edged floor stains)
# ---------------------------------------------------------------------------
def decal_mat(name, color, r, alpha=0.85, rough=0.8, metal=0.0, edge=0.45, noise_scale=4.0, clearcoat=0.0,
              center=None, center_k=0.5):
    """Principled decal: alpha falls off from the centre (object space, radius r) with noise.
    center: optional darker/other colour towards the middle (mixed by 1 - dist)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if clearcoat: b.inputs['Coat Weight'].default_value = clearcoat; b.inputs['Coat Roughness'].default_value = 0.08
    tc = N.new('ShaderNodeTexCoord')
    ln = N.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; Lk(tc.outputs['Object'], ln.inputs[0])
    d = N.new('ShaderNodeMath'); d.operation = 'DIVIDE'; d.inputs[1].default_value = r; Lk(ln.outputs['Value'], d.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = noise_scale; nz.inputs['Detail'].default_value = 5
    Lk(tc.outputs['Object'], nz.inputs['Vector'])
    dn = N.new('ShaderNodeMath'); dn.operation = 'MULTIPLY_ADD'; dn.inputs[1].default_value = 0.5; Lk(nz.outputs['Fac'], dn.inputs[0]); Lk(d.outputs[0], dn.inputs[2])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 1.25 - edge; mr.inputs['From Max'].default_value = 1.25
    mr.inputs['To Min'].default_value = alpha; mr.inputs['To Max'].default_value = 0.0
    Lk(dn.outputs[0], mr.inputs['Value']); Lk(mr.outputs['Result'], b.inputs['Alpha'])
    col = N.new('ShaderNodeRGB'); col.outputs[0].default_value = rgba(color)
    if center:
        cc = N.new('ShaderNodeRGB'); cc.outputs[0].default_value = rgba(center)
        k = N.new('ShaderNodeMapRange'); k.inputs['From Min'].default_value = 0.0; k.inputs['From Max'].default_value = 1.0
        k.inputs['To Min'].default_value = center_k; k.inputs['To Max'].default_value = 0.0; Lk(dn.outputs[0], k.inputs['Value'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(k.outputs['Result'], mx.inputs[0])
        Lk(col.outputs[0], mx.inputs[6]); Lk(cc.outputs[0], mx.inputs[7]); Lk(mx.outputs[2], b.inputs['Base Color'])
    else:
        Lk(col.outputs[0], b.inputs['Base Color'])
    return m

# ---------------------------------------------------------------------------
# Flipbooks
# ---------------------------------------------------------------------------
def only_on(objs, f, frames):
    """Show objs only on scene frame f (keyframed hide_render over the given frame list)."""
    for o in objs:
        for g in [frames[0] - 1] + list(frames) + [frames[-1] + 1]:
            o.hide_render = g != f
            o.keyframe_insert('hide_render', frame=g)
    return objs

def clear_scene_meshes():
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'CURVE', 'FONT', 'EMPTY') or (o.type == 'LIGHT' and o.name.startswith('fx_')):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.frame_set(1)

def point_light(name, loc, color, energy, size=0.3):
    d = bpy.data.lights.new('fx_' + name, 'POINT'); d.color = color; d.energy = energy; d.shadow_soft_size = size
    o = mn.link(bpy.data.objects.new('fx_' + name, d)); o.location = loc; return o

def punchy():
    """AgX with the 'Punchy' look: AgX alone turns bright saturated emission (flames) mustard/pastel.
    Only the fx scripts use it (their sprites are mostly pure emission); camera and lights are untouched."""
    vs = bpy.context.scene.view_settings; vs.view_transform = 'AgX'
    try: vs.look = 'AgX - Punchy'
    except TypeError:
        try: vs.look = 'Punchy'
        except TypeError: print('[fx] no Punchy look available')
    print('[fx] look:', vs.look)

# GPU shared with other agents: FX_CPU=1 renders on the CPU instead (mn.reset picks OptiX).
_orig_reset = mn.reset
def _reset():
    s = _orig_reset()
    if os.environ.get('FX_CPU'):
        s.cycles.device = 'CPU'; bpy.context.scene.render.threads_mode = 'AUTO'
        print('[fx] rendering on the CPU')
    return s
mn.reset = _reset
