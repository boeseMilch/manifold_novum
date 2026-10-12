"""Shared helpers for the living enemies (organic group), on top of mn.py.

Copied/adapted from models/enemy/interceptor.py (local frame, projection-exact weak spots, holdout
renders, halo/scorch materials) and models/ship/shiplib.py (exact-window renders for tiles), plus
organic modelling: metaball blobs, tapered tubes (arms, tentacles), and flesh materials (wet,
subsurface, veins, glowing photophores).

Enemy-local frame (lx, ly), as in js/enemies.js: -ly is the nose / front, +lx the side facing our
ship. Blender: X = S * lx, Y = -ly, Z = height; S = +1 for the port-side build (the creature is left
of our ship and faces right), -1 for starboard (a mirrored build, so the light still comes from the
same direction). z = 0 is the hit plane: game shapes are taken at z = 0 and things placed with
comp=True are shifted towards the camera so that they project onto their (lx, ly, 0).
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
import sys
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS                         # low samples while iterating on the look
if QUICK: mn.SAMPLES = 16

E = math.radians(mn.ELEVATION)
COT = math.cos(E) / math.sin(E)
VIEW = Vector((0, math.cos(E), -math.sin(E)))      # direction the camera looks along
S = 1

def set_side(side):
    global S
    S = 1 if side in ('port', 1) else -1
    return S

def P(lx, ly, z=0.0, comp=False):
    """Local (lx, ly) at height z -> Blender. comp: shift towards the camera so it projects onto (lx, ly, 0)."""
    return Vector((S * lx, -ly - (z * COT if comp else 0.0), z))

def screen_px(entry, X, Y, Z=0.0):
    """Blender point -> sprite pixel, given a manifest entry (for checks)."""
    sx, sy = X, Y * math.sin(E) + Z * math.cos(E)
    return entry['ox'] + sx * mn.PPU, entry['oy'] - sy * mn.PPU

# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
GAIN = 1.35
def lift(color, gain=GAIN):
    """Palette colour, a bit brighter: lit 3D surfaces under AgX read darker than the game's flat fills."""
    return tuple(min(1.0, c * gain) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def _rgba(c, gain=GAIN):
    return (*lift(c, gain), 1)

def flesh(name, c0, c1, c2=None, scale=1.0, rough=0.42, coat=0.55, sss=0.25, sss_col=None, bump=0.35,
          veins=None, vein_k=0.5, spots=None, spot_scale=3.0, spot_size=0.12, spot_strength=1.2, mottle=1.0,
          belly=None, belly_axis=(1, 0, 0), belly_k=0.0, emit_key=None, stripe=None, speckle=None):
    """Wet alien skin. c0 -> c1 mottled colour (object-space noise, `mottle` how strongly), optional c2 for
    dark crevices (AO). veins: colour of a fine network (noise ridges). spots: glow colour of photophores
    (voronoi cells, emission). belly: a paler colour on the side `belly_axis` points to (object space).
    Returns the material; emission node for the spots is named 'spots' (keyframable)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.15
    b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Scale'].default_value = 0.05
    if sss_col: b.inputs['Subsurface Radius'].default_value = sss_col
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale); Lk(tc.outputs['Object'], mp.inputs['Vector'])
    # mottled base colour
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 7; nz.inputs['Roughness'].default_value = 0.6
    Lk(mp.outputs[0], nz.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.5 - 0.22 * mottle; mr.inputs['From Max'].default_value = 0.5 + 0.22 * mottle
    Lk(nz.outputs['Fac'], mr.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(mr.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = _rgba(c0); col.inputs[7].default_value = _rgba(c1)
    out = col.outputs[2]
    if belly:
        g = N.new('ShaderNodeVectorMath'); g.operation = 'DOT_PRODUCT'; g.inputs[1].default_value = belly_axis
        Lk(tc.outputs['Normal'], g.inputs[0])       # (object-space normal: pale where it faces belly_axis)
        bm_ = N.new('ShaderNodeMapRange'); bm_.inputs['From Min'].default_value = 0.0; bm_.inputs['From Max'].default_value = 0.8
        bm_.inputs['To Max'].default_value = belly_k; Lk(g.outputs['Value'], bm_.inputs['Value'])
        bl = N.new('ShaderNodeMix'); bl.data_type = 'RGBA'; Lk(bm_.outputs[0], bl.inputs['Factor'])
        Lk(out, bl.inputs[6]); bl.inputs[7].default_value = _rgba(belly); out = bl.outputs[2]
    if veins:
        vn = N.new('ShaderNodeTexNoise'); vn.inputs['Scale'].default_value = 5.0; vn.inputs['Detail'].default_value = 3
        vn.inputs['Distortion'].default_value = 0.6; Lk(mp.outputs[0], vn.inputs['Vector'])
        rid = N.new('ShaderNodeMath'); rid.operation = 'SUBTRACT'; Lk(vn.outputs['Fac'], rid.inputs[0]); rid.inputs[1].default_value = 0.5
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; Lk(rid.outputs[0], ab.inputs[0])
        vr = N.new('ShaderNodeMapRange'); vr.inputs['From Min'].default_value = 0.025; vr.inputs['From Max'].default_value = 0.0
        vr.inputs['To Max'].default_value = vein_k; Lk(ab.outputs[0], vr.inputs['Value'])
        vm = N.new('ShaderNodeMix'); vm.data_type = 'RGBA'; Lk(vr.outputs[0], vm.inputs['Factor'])
        Lk(out, vm.inputs[6]); vm.inputs[7].default_value = _rgba(veins, 1.0); out = vm.outputs[2]
    if speckle:                                     # chromatophores: small dark dots of varying size
        vs = N.new('ShaderNodeTexVoronoi'); vs.inputs['Scale'].default_value = speckle[1]; vs.inputs['Randomness'].default_value = 1.0
        Lk(mp.outputs[0], vs.inputs['Vector'])
        sc_ = N.new('ShaderNodeSeparateColor'); Lk(vs.outputs['Color'], sc_.inputs[0])
        thr_ = N.new('ShaderNodeMath'); thr_.operation = 'MULTIPLY'; thr_.inputs[1].default_value = speckle[2]; Lk(sc_.outputs[1], thr_.inputs[0])
        dd = N.new('ShaderNodeMath'); dd.operation = 'LESS_THAN'; Lk(vs.outputs['Distance'], dd.inputs[0]); Lk(thr_.outputs[0], dd.inputs[1])
        sk = N.new('ShaderNodeMath'); sk.operation = 'MULTIPLY'; sk.inputs[1].default_value = speckle[3] if len(speckle) > 3 else 0.7; Lk(dd.outputs[0], sk.inputs[0])
        smx = N.new('ShaderNodeMix'); smx.data_type = 'RGBA'; Lk(sk.outputs[0], smx.inputs['Factor'])
        Lk(out, smx.inputs[6]); smx.inputs[7].default_value = _rgba(speckle[0], 1.0); out = smx.outputs[2]
    if stripe:                                      # a dark band along object y, |x| < stripe[1] (a dorsal stripe)
        sx = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sx.inputs[0])
        ax_ = N.new('ShaderNodeMath'); ax_.operation = 'ABSOLUTE'; Lk(sx.outputs['X'], ax_.inputs[0])
        sr = N.new('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = stripe[1]; sr.inputs['From Max'].default_value = stripe[1] * 0.6
        sr.inputs['To Max'].default_value = stripe[2] if len(stripe) > 2 else 0.6; Lk(ax_.outputs[0], sr.inputs['Value'])
        sm = N.new('ShaderNodeMix'); sm.data_type = 'RGBA'; Lk(sr.outputs[0], sm.inputs['Factor'])
        Lk(out, sm.inputs[6]); sm.inputs[7].default_value = _rgba(stripe[0], 1.0); out = sm.outputs[2]
    if c2:                                          # crevices darker (by curvature: an AO ray would hit the outline hull)
        geo = N.new('ShaderNodeNewGeometry')
        cv = N.new('ShaderNodeMapRange'); cv.inputs['From Min'].default_value = 0.44; cv.inputs['From Max'].default_value = 0.5
        Lk(geo.outputs['Pointiness'], cv.inputs['Value'])
        ao = cv
        am = N.new('ShaderNodeMix'); am.data_type = 'RGBA'; Lk(cv.outputs[0], am.inputs['Factor'])
        am.inputs[6].default_value = _rgba(c2, 1.0); Lk(out, am.inputs[7]); out = am.outputs[2]
    Lk(out, b.inputs['Base Color'])
    if spots:
        vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = spot_scale; Lk(mp.outputs[0], vo.inputs['Vector'])
        vo.inputs['Randomness'].default_value = 0.9
        sp = N.new('ShaderNodeMapRange'); sp.inputs['From Min'].default_value = spot_size; sp.inputs['From Max'].default_value = spot_size * 0.45
        Lk(vo.outputs['Distance'], sp.inputs['Value'])
        # only some cells light up
        rnd = N.new('ShaderNodeMath'); rnd.operation = 'GREATER_THAN'; rnd.inputs[1].default_value = 0.45
        sepc = N.new('ShaderNodeSeparateColor'); Lk(vo.outputs['Color'], sepc.inputs[0]); Lk(sepc.outputs[0], rnd.inputs[0])
        k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; Lk(sp.outputs[0], k.inputs[0]); Lk(rnd.outputs[0], k.inputs[1])
        st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = spot_strength; st.name = 'spots'
        Lk(k.outputs[0], st.inputs[0]); Lk(st.outputs[0], b.inputs['Emission Strength'])
        b.inputs['Emission Color'].default_value = (*mn.hex_rgb(spots), 1)
    if bump:
        bn = N.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = 18; bn.inputs['Detail'].default_value = 4
        Lk(mp.outputs[0], bn.inputs['Vector'])
        bu = N.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = bump; bu.inputs['Distance'].default_value = 0.02
        Lk(bn.outputs['Fac'], bu.inputs['Height']); Lk(bu.outputs['Normal'], b.inputs['Normal'])
    return m

def plain(name, color, rough=0.5, metal=0.0, coat=0.0, gain=GAIN, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = _rgba(color, gain); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Coat Weight'].default_value = coat
    b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Scale'].default_value = 0.03
    return m

def emit_mat(name, color, strength, base=None, rough=0.3, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(base or color), 1)
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat
    return m

def glossy_glow(name, base, glow, strength, rough=0.15, coat=1.0, sss=0.3, noise_k=0.6, veins='#1a0a20', vein_scale=7.0):
    """Translucent wet organ with an inner glow broken up by noise (sacs, photophores, spores)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = _rgba(base)
    b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat
    b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Scale'].default_value = 0.05
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(glow), 1)
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6; nz.inputs['Detail'].default_value = 3
    Lk(tc.outputs['Object'], nz.inputs['Vector'])
    fr = N.new('ShaderNodeLayerWeight'); fr.inputs['Blend'].default_value = 0.35      # brighter in the middle, darker rim
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; Lk(fr.outputs['Facing'], inv.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1 - noise_k; Lk(nz.outputs['Fac'], mr.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; Lk(inv.outputs[0], mu.inputs[0]); Lk(mr.outputs[0], mu.inputs[1])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = strength; st.name = 'glow'
    Lk(mu.outputs[0], st.inputs[0])
    if veins:                                       # a dark vein web over the glow
        v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = vein_scale
        Lk(tc.outputs['Object'], v.inputs['Vector'])
        vm = N.new('ShaderNodeMapRange'); vm.inputs['From Min'].default_value = 0.06; vm.inputs['From Max'].default_value = 0.0
        vm.inputs['To Max'].default_value = 0.85; Lk(v.outputs['Distance'], vm.inputs['Value'])
        cm = N.new('ShaderNodeMix'); cm.data_type = 'RGBA'; Lk(vm.outputs[0], cm.inputs['Factor'])
        cm.inputs[6].default_value = _rgba(base); cm.inputs[7].default_value = (*mn.hex_rgb(veins), 1); Lk(cm.outputs[2], b.inputs['Base Color'])
        ivm = N.new('ShaderNodeMath'); ivm.operation = 'SUBTRACT'; ivm.inputs[0].default_value = 1; Lk(vm.outputs[0], ivm.inputs[1])
        st2 = N.new('ShaderNodeMath'); st2.operation = 'MULTIPLY'; Lk(st.outputs[0], st2.inputs[0]); Lk(ivm.outputs[0], st2.inputs[1])
        Lk(st2.outputs[0], b.inputs['Emission Strength'])
    else:
        Lk(st.outputs[0], b.inputs['Emission Strength'])
    return m

def blue_organ(name, strength=1.3):
    """Weak-spot organ: the game's blue (#3d8fe0 / #8fd0ff) glowing through wet skin, with a vein web."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb('#2a6cc0'), 1)
    b.inputs['Roughness'].default_value = 0.2; b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Subsurface Weight'].default_value = 0.3; b.inputs['Subsurface Scale'].default_value = 0.05
    tc = N.new('ShaderNodeTexCoord')
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 9; Lk(tc.outputs['Object'], v.inputs['Vector'])
    cr = N.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.05; cr.inputs['From Max'].default_value = 0.0; Lk(v.outputs['Distance'], cr.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(cr.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = (*mn.hex_rgb('#3d8fe0'), 1); col.inputs[7].default_value = (*mn.hex_rgb('#1a3a78'), 1)
    Lk(col.outputs[2], b.inputs['Emission Color'])
    fr = N.new('ShaderNodeLayerWeight'); fr.inputs['Blend'].default_value = 0.4
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; Lk(fr.outputs['Facing'], inv.inputs[1])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY_ADD'; st.inputs[1].default_value = strength; st.inputs[2].default_value = 0.35
    Lk(inv.outputs[0], st.inputs[0]); Lk(st.outputs[0], b.inputs['Emission Strength'])
    return m

def halo_mat(name, color, strength, k=0.55):
    """Soft glow halo for a flat disc: emission fading out radially, see-through (copied from the interceptor)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*mn.hex_rgb(color), 1); em.inputs['Strength'].default_value = strength
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2; Lk(gr.outputs['Fac'], pw.inputs[0])
    kk = N.new('ShaderNodeMath'); kk.operation = 'MULTIPLY'; kk.inputs[1].default_value = k; Lk(pw.outputs[0], kk.inputs[0])
    Lk(kk.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(em.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def slime_mat(name, color='#9cff5a', glow=0.35, alpha_noise=True):
    """Glossy translucent slime (goo, drips, acid): wet clearcoat, a faint inner glow."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb(color), 1)
    b.inputs['Roughness'].default_value = 0.08; b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Subsurface Weight'].default_value = 0.4; b.inputs['Subsurface Scale'].default_value = 0.03
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = glow
    b.inputs['Alpha'].default_value = 1.0
    return m

# ---------------------------------------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------------------------------------
def apply_tf(o):
    mw = o.matrix_world.copy()
    o.data.transform(mw); o.matrix_world = Matrix.Identity(4)
    o.parent = None
    return o

def bake(o, keep_mods=()):
    """Apply all modifiers (except the named ones) into the mesh; works for metaballs and curves too."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    saved = []
    for md in getattr(o, 'modifiers', []):
        if md.name in keep_mods: saved.append(md); md.show_viewport = False
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    name, mats, mw = o.name, [s.material for s in o.material_slots], o.matrix_world.copy()
    data = o.data
    bpy.data.objects.remove(o)
    n = mn.link(bpy.data.objects.new(name, me)); n.matrix_world = mw
    me.materials.clear()
    for m in mats:
        if m: me.materials.append(m)
    return mn.smooth(n)

_blob_n = [0]
def blob(name, parts, m=None, res=0.05, threshold=0.6, smooth=0):
    """Soft union of ellipsoids/balls (metaballs) -> mesh. parts: list of dicts or tuples
    (centre(Vector/tuple), radius, scale(sx, sy, sz)=(1,1,1), rot(euler)=(0,0,0), neg=False)."""
    _blob_n[0] += 1
    mb = bpy.data.metaballs.new(f'mb{_blob_n[0]}_{name}'); mb.resolution = res; mb.render_resolution = res; mb.threshold = threshold
    o = mn.link(bpy.data.objects.new(f'mb{_blob_n[0]}x{name}', mb))
    for p in parts:
        c, r = p[0], p[1]
        sc = p[2] if len(p) > 2 and p[2] else (1, 1, 1)
        rot = p[3] if len(p) > 3 and p[3] else (0, 0, 0)
        neg = p[4] if len(p) > 4 else False
        el = mb.elements.new(); el.type = 'ELLIPSOID'; el.co = c; el.radius = r
        el.size_x, el.size_y, el.size_z = sc
        from mathutils import Euler
        el.rotation = Euler(rot).to_quaternion()
        el.use_negative = neg
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o); bpy.data.metaballs.remove(mb)
    n = mn.link(bpy.data.objects.new(name, me))
    if smooth:
        md = n.modifiers.new('sm', 'SMOOTH'); md.iterations = smooth; md.factor = 0.5
        n = bake(n)
    if m: mn.assign(n, m)
    return mn.smooth(n)

def displace(o, strength=0.05, scale=1.0, kind='CLOUDS', mid=0.5, detail=2, apply=True, seed=0):
    tx = bpy.data.textures.new(o.name + '_disp', kind)
    if kind == 'CLOUDS': tx.noise_scale = scale; tx.noise_depth = detail
    elif kind == 'VORONOI': tx.noise_scale = scale
    elif kind == 'MUSGRAVE': tx.noise_scale = scale
    md = o.modifiers.new('disp', 'DISPLACE'); md.texture = tx; md.strength = strength; md.mid_level = mid
    md.texture_coords = 'GLOBAL'
    if seed:
        e = mn.link(bpy.data.objects.new(o.name + '_dispoff', None)); e.location = (seed * 3.1, seed * 1.7, seed * 2.3)
        md.texture_coords = 'OBJECT'; md.texture_coords_object = e
    return bake(o) if apply else o

def subdiv(o, levels=1, apply=True):
    md = o.modifiers.new('sub', 'SUBSURF'); md.levels = levels; md.render_levels = levels
    return bake(o) if apply else o

def tube(name, pts, radii, m=None, res=6, segs=12, caps=True, twist=None):
    """Tapered round tube along 3D Blender points with a radius per point (arms, tentacles, cilia)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = max(1, segs // 4)
    cu.use_fill_caps = caps; cu.resolution_u = res; cu.twist_mode = 'MINIMUM'
    sp = cu.splines.new('NURBS' if len(pts) > 3 else 'POLY'); sp.points.add(len(pts) - 1)
    for p, q, r in zip(sp.points, pts, radii):
        p.co = (q[0], q[1], q[2], 1); p.radius = r
        if twist is not None: p.tilt = twist
    if sp.type == 'NURBS': sp.use_endpoint_u = True; sp.order_u = 3
    o = mn.link(bpy.data.objects.new(name, cu))
    o = bake(o)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def curve_frames(pts):
    """Per-point tangent and a side vector (perpendicular, roughly horizontal) along a polyline."""
    out = []
    for i in range(len(pts)):
        a = Vector(pts[max(0, i - 1)]); b = Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-4: side = Vector((1, 0, 0))
        side.normalize(); up = side.cross(t).normalized()
        out.append((t, side, up))
    return out

def disc(name, loc, r, m, verts=48, sy=1.0, rot=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=verts, radius=1.0); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = loc; o.scale = (r, r * sy, 1); o.rotation_euler = (0, 0, rot)
    if m: mn.assign(o, m)
    return o

def poly_prism(name, pts, z0, z1, m=None, bevel=0.0):
    """Extrude a polygon of Blender (x, y) points from z0 to z1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in pts]
    f = bm.faces.new(vs); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=Vector((0, 0, z1 - z0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def boolean(o, cutter, op='DIFFERENCE'):
    md = o.modifiers.new('bool', 'BOOLEAN'); md.object = cutter; md.operation = op; md.solver = 'MANIFOLD'
    md.material_mode = 'TRANSFER'
    cutter.hide_render = True
    n = bake(o)
    return n

def cut_to_projection(o, poly):
    """Keep only the part of mesh o that projects (along the view) inside the convex local polygon."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    pts = [P(x, y) for x, y in poly]
    c = sum(pts, Vector()) / len(pts)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n = (b - a).cross(VIEW).normalized()
        inner_pos = (c - a).dot(n) > 0
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=a, plane_no=n, clear_inner=inner_pos, clear_outer=not inner_pos)
    bm.to_mesh(o.data); bm.free()
    return o

def circle_poly(cx, cy, r, n=48):
    return [(cx + math.cos(a) * r, cy + math.sin(a) * r) for a in (i / n * math.tau for i in range(n))]

def show(objs, on):
    for o in objs: o.hide_render = not on

def holdout(objs, on):
    for o in objs: o.is_holdout = on

# ---------------------------------------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------------------------------------
def screen_bounds(objs):
    return mn._bounds(objs)

def render_window(name, x0, x1, y0, y1, passes=('beauty', 'normal', 'height'), extra=None, frames=None, origin=(0, 0, 0)):
    """Render a fixed screen-plane window (units, as mn._screen gives), snapped out to whole pixels, no
    margin (adapted from shiplib.render_exact): for tiles/sections of huge things and for patches that
    must line up exactly. The manifest gets the pixel where `origin` (a Blender ground point) lands."""
    s = bpy.context.scene
    x0 = math.floor(x0 * mn.PPU) / mn.PPU; y0 = math.floor(y0 * mn.PPU) / mn.PPU
    x1 = math.ceil(x1 * mn.PPU) / mn.PPU; y1 = math.ceil(y1 * mn.PPU) / mn.PPU
    w, h = int(round((x1 - x0) * mn.PPU)), int(round((y1 - y0) * mn.PPU))
    if w % 2: w += 1; x1 += 1 / mn.PPU
    if h % 2: h += 1; y0 -= 1 / mn.PPU
    s.render.resolution_x = w; s.render.resolution_y = h; s.render.resolution_percentage = 100
    c = mn._cam(); c.data.ortho_scale = max(w, h) / mn.PPU
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    up = Vector((0, math.sin(E), math.cos(E))); back = Vector((0, -math.cos(E), math.sin(E)))
    c.location = Vector((cx, 0, 0)) + up * cy + back * 60; c.data.clip_end = 200
    gx, gy = mn._screen(Vector(origin))
    ox = (gx - cx) * mn.PPU + w / 2; oy = h / 2 - (gy - cy) * mn.PPU
    base = os.path.join(mn.OUT_DIR, name); os.makedirs(os.path.dirname(base), exist_ok=True)
    frames = frames or [s.frame_current]; files = []
    for i, f in enumerate(frames):
        s.frame_set(f); stem = base + (f'_f{i}' if len(frames) > 1 else '')
        for kind in passes:
            mn._render_to(stem + {'beauty': '.png', 'normal': '.n.png', 'height': '.h.png', 'mask': '.m.png'}[kind], kind)
        files.append(os.path.relpath(stem, mn.OUT_DIR))
    entry = {'w': w, 'h': h, 'ox': round(ox, 2), 'oy': round(oy, 2), 'dirs': 1, 'frames': len(frames), 'files': files}
    if extra: entry.update(extra)
    mn._manifest_put(name, entry)
    print(f'[organic] rendered {name}: {w}x{h}, origin ({ox:.1f}, {oy:.1f}), {len(frames)} frames')
    return w, h, ox, oy

def render_with_halo(name, objs, halos, **kw):
    """Weak spot (ok state): the glow halo only in the beauty pass (as the interceptor does)."""
    show(halos, True); r = mn.render(name, objs=objs + halos, passes=('beauty',), **kw)
    show(halos, False); mn.render(name, objs=objs + halos, passes=('normal', 'height'), **kw)
    return r

def merge_entry(name, extra):
    """Add fields to an existing manifest entry (e.g. game-side notes or point tables)."""
    import json, fcntl
    with open(mn.MANIFEST + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(mn.MANIFEST) as f: data = json.load(f)
        data.setdefault(name, {}).update(extra)
        tmp = mn.MANIFEST + '.tmp'
        with open(tmp, 'w') as f: json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, mn.MANIFEST)

def cut_below(o, z=0.0, fill=False):
    """Remove the part of mesh o below height z (things sitting on / stuck to a surface)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    mw = o.matrix_world; inv = mw.inverted()
    co = inv @ Vector((0, 0, z)); no = (inv.to_3x3().transposed() @ Vector((0, 0, 1))).normalized()
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=co, plane_no=no, clear_inner=True)
    if fill:
        edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if edges: bmesh.ops.holes_fill(bm, edges=edges)
    bm.to_mesh(o.data); bm.free()
    return o

# GPU shared with other renders: on CUDA/OptiX out-of-memory, fall back to the CPU and retry
# (and stay on the CPU for the rest of the run). 'cpu' on the command line starts on the CPU.
_FORCE_CPU = ['cpu' in ARGS]
_orig_render_to = mn._render_to
def _render_to_retry(path, kind):
    s = bpy.context.scene
    if _FORCE_CPU[0]: s.cycles.device = 'CPU'
    for attempt in range(3):
        try:
            return _orig_render_to(path, kind)
        except RuntimeError as e:
            if 'memory' not in str(e).lower() or attempt == 2: raise
            print(f'[organic] GPU out of memory on {os.path.basename(path)}: retrying on the CPU')
            _FORCE_CPU[0] = True; s.cycles.device = 'CPU'
mn._render_to = _render_to_retry

def noise_displace(o, layers, weight=None):
    """Displace vertices along their normals by fractal noise. layers: [(strength, frequency, seed)].
    weight(v_co) -> 0..1 scales it per vertex (e.g. keep a footprint rim exact)."""
    from mathutils import noise
    me = o.data
    for v in me.vertices:
        w = weight(v.co) if weight else 1.0
        if w <= 0: continue
        d = 0.0
        for s, f, seed in layers:
            d += s * noise.fractal(v.co * f + Vector((seed * 13.1, seed * 7.7, seed * 3.3)), 0.6, 2.2, 4)
        v.co += v.normal * d * w
    me.update()
    return o

def darken_low(m, z0, z1, color, k=0.7):
    """Multiply a material's base colour towards `color` where world z < z1 (full at z0): a dark rim/underside."""
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; src = b.inputs['Base Color'].links[0].from_socket
    g = N.new('ShaderNodeNewGeometry'); sz = N.new('ShaderNodeSeparateXYZ'); Lk(g.outputs['Position'], sz.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = z1; mr.inputs['From Max'].default_value = z0
    mr.inputs['To Max'].default_value = k; Lk(sz.outputs['Z'], mr.inputs['Value'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(mr.outputs[0], mx.inputs['Factor'])
    Lk(src, mx.inputs[6]); mx.inputs[7].default_value = (*mn.hex_rgb(color), 1); Lk(mx.outputs[2], b.inputs['Base Color'])
    return m
