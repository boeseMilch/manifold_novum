"""Shared helpers for the enemy-group models (frigate, interceptor variants, asteroids, space hazards).

Builds on interceptor.py (its local-frame helpers P/prism/lbox/ycyl/tube/disc, worn paint, blue weak-spot
glass, halos, scorch decals) and adds:
  * render_states(): one sprite set whose states (directions, frames, damage states, rebuilt geometry) all
    share one canvas and origin, with a per-state setup callback (mn.render can only rotate a root or step
    scene frames).
  * render_poi(): a weak spot rendered with the hull as a holdout (exactly like interceptor.py).
  * a few materials: hazard stripes, rock, lava, flat emissive.
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
import interceptor as ic
from interceptor import worn, emit_mat, blue_glass, web_glass, halo_mat, scorch_mat, lift

E = ic.E; COT = ic.COT; VIEW = ic.VIEW
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if 'quick' in ARGS or 'draft' in ARGS: mn.SAMPLES = 16

def side(s):
    """Set the current side for the interceptor-style local frame (P, prism, ... read ic.S)."""
    ic.S = 1 if s in ('port', 1) else -1

# re-export the local-frame geometry helpers
def P(lx, ly, z=0.0, comp=False): return ic.P(lx, ly, z, comp)
prism, lbox, ycyl, tube, disc, text, finish = ic.prism, ic.lbox, ic.ycyl, ic.tube, ic.disc, ic.text, ic.finish
apply_tf, cut_to_projection, keep_projected = ic.apply_tf, ic.cut_to_projection, ic.keep_projected

def show(objs, on):
    for o in objs: o.hide_render = not on

def delete(objs):
    for o in objs:
        if o and o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------------------------------------
PASS_EXT = {'beauty': '.png', 'normal': '.n.png', 'height': '.h.png', 'mask': '.m.png'}

def render_states(name, states, objs, passes=('beauty', 'normal', 'height'), dirs=1, frames=1, extra=None):
    """Render one sprite set whose states share a canvas.

    name    'enemy/xyz'
    states  list of (suffix, setup) ; setup(kind) prepares the scene for that state and pass
            (kind = None while measuring bounds). suffix '' -> name.png, '_d3' -> name_d3.png ...
    objs    callable -> objects to frame (re-evaluated per state: geometry may be rebuilt)
    dirs/frames  only recorded in the manifest (the suffixes carry the layout)
    """
    s = bpy.context.scene
    b = None
    for suf, setup in states:
        setup(None); bpy.context.view_layer.update()
        x0, x1, y0, y1 = mn._bounds([o for o in objs() if not o.hide_render or o.get('frame')])
        b = (x0, x1, y0, y1) if not b else (min(b[0], x0), max(b[1], x1), min(b[2], y0), max(b[3], y1))
    w, h, ox, oy = mn._frame(None, b)
    base = os.path.join(mn.OUT_DIR, name); os.makedirs(os.path.dirname(base), exist_ok=True)
    files = []
    for suf, setup in states:
        for kind in passes:
            setup(kind); bpy.context.view_layer.update()
            mn._render_to(base + suf + PASS_EXT[kind], kind)
        files.append(os.path.relpath(base + suf, mn.OUT_DIR))
    entry = {'w': w, 'h': h, 'ox': round(ox, 2), 'oy': round(oy, 2), 'dirs': dirs, 'frames': frames, 'files': files}
    if extra: entry.update(extra)
    mn._manifest_put(name, entry)
    print(f'[enemy] rendered {name}: {w}x{h}, origin ({ox:.1f}, {oy:.1f}), {len(states)} states')
    return w, h, ox, oy

def render_poi(name, objs, hull, halo=(), passes=('beauty', 'normal', 'height'), hide=()):
    """Weak spot (or any overlay part) alone, with the hull as a holdout so it lines up with the hull sprite.
    halo: glow discs shown only in the beauty pass."""
    show(hide, False)
    for o in hull: o.is_holdout = True
    show(hull, True); show(objs, True)
    def setup(kind):
        show(halo, kind in (None, 'beauty'))
    render_states(name, [('', setup)], lambda: list(objs) + list(halo), passes)
    for o in hull: o.is_holdout = False
    show(objs, False); show(halo, False)

# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
def hazard_mat(name, period=0.16, a='#e8c34f', b='#2b2b2b', rough=0.5, axis=(1, 1, 0), wear=0.8):
    """Diagonal yellow/black hazard stripes in object space, slightly worn (a scratched noise mask)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    bs = N['Principled BSDF']; bs.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); dp = N.new('ShaderNodeVectorMath'); dp.operation = 'DOT_PRODUCT'
    dp.inputs[1].default_value = axis; Lk(tc.outputs['Object'], dp.inputs[0])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = 1 / period; Lk(dp.outputs['Value'], mu.inputs[0])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; Lk(mu.outputs[0], fr.inputs[0])
    st = N.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = 0.5; Lk(fr.outputs[0], st.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(st.outputs[0], mx.inputs[0])
    mx.inputs[6].default_value = (*lift(a), 1); mx.inputs[7].default_value = (*mn.hex_rgb(b), 1)
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 18; nz.inputs['Detail'].default_value = 8; Lk(tc.outputs['Object'], nz.inputs['Vector'])
    wr = N.new('ShaderNodeMapRange'); wr.inputs['From Min'].default_value = 0.62; wr.inputs['From Max'].default_value = 0.7
    wr.inputs['To Max'].default_value = wear; Lk(nz.outputs['Fac'], wr.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(wr.outputs[0], bare.inputs[0])
    Lk(mx.outputs[2], bare.inputs[6]); bare.inputs[7].default_value = (0.3, 0.3, 0.31, 1)
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.1
    dk = N.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    Lk(aoi.outputs[0], dk.inputs[0]); Lk(bare.outputs[2], dk.inputs[6]); dk.inputs[7].default_value = (0.1, 0.09, 0.08, 1)
    Lk(dk.outputs[2], bs.inputs['Base Color'])
    return m

def flat_emit(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*mn.hex_rgb(color), 1); em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface']); return m

def standard_mats():
    """The interceptor's material set (so the frigate and the variants look like the same family)."""
    return dict(
        steel=worn('steel', '#9aa3b5', 0.35, 0.8, wear=0.3),
        gun=worn('gunmetal', '#4a515e', 0.4, 0.35, wear=0.6),
        gunl=worn('gunmetal_l', '#6a7280', 0.45, 0.2, wear=0.6),
        dark=mn.mat('dark', '#1c1f25', 0.7, 0.3),
        black=mn.mat('black', '#0b0c0f', 0.9),
        rubber=mn.mat('rubber', 'rubber', 0.7),
        glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        shine=emit_mat('shine', '#ffffff', 1.2),
        hot=emit_mat('nozzle', '#ffb35c', 9.0, base='#ff9040'),
        hot2=emit_mat('nozzle_core', '#fff0c8', 14.0),
        navg=emit_mat('nav_green', '#5aff8a', 8.0), navr=emit_mat('nav_red', '#ff5a4a', 8.0),
        white=worn('decal_white', '#d8d8d0', 0.5, 0.0, wear=1.2, grime=0.6),
        hazard=worn('hazard', 'hazard', 0.5, 0.0, wear=1.0),
        stripes=hazard_mat('hazard_stripes'),
        blue=emit_mat('blue', '#5fb4ff', 3.5, base='#3d8fe0'),
        bluel=emit_mat('blue_light', '#bfe6ff', 6.0, base='#8fd0ff'),
        crackglass=blue_glass('crackglass'),
        halo=halo_mat('halo', '#6ebeff', 3.0),
        scorch=scorch_mat('scorch'),
        char=worn('char', '#4a4440', 0.8, 0.3, wear=0.5, grime=1.2),
        copper=mn.mat('copper', 'copper', 0.35, 1.0),
        ember=emit_mat('ember', '#ff7a2a', 12.0, base='#401008'),
        window=emit_mat('window', '#ffd38a', 2.5, base='#ffb850'),
        tape=worn('tape', '#b2b8c0', 0.6, 0.0, wear=0.2, grime=0.8),
    )

def mesh_from(name, verts, faces, m=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    o = mn.link(bpy.data.objects.new(name, me))
    if m: mn.assign(o, m)
    return o

def raycast_down_view(objs, gx, gy, bvh=None):
    """The surface point of objs seen through the ground point (gx, gy, 0) (Blender coords), i.e. the first hit
    of the camera ray that passes through it. Returns (point, normal) or (None, None)."""
    from mathutils.bvhtree import BVHTree
    if bvh is None: bvh = make_bvh(objs)
    o = Vector((gx, gy, 0)) - VIEW * 50
    p, n, i, d = bvh.ray_cast(o, VIEW, 200)
    return p, n

def make_bvh(objs):
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get(); bm = bmesh.new()
    for o in objs:                                  # base mesh (without the bevel / outline modifiers)
        t = bmesh.new(); t.from_mesh(o.data)
        t.transform(o.matrix_world); tm = bpy.data.meshes.new('_tmp'); t.to_mesh(tm); t.free(); bm.from_mesh(tm)
        bpy.data.meshes.remove(tm)
    tree = BVHTree.FromBMesh(bm); bm.free(); return tree

def tube_nc(name, pts, r, m, closed=False, res=4):
    """Round tube along local 3D points [(lx, ly, z)] (no projection compensation)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1); sp.use_cyclic_u = closed
    for p, (x, y, z) in zip(sp.points, pts): p.co = (*P(x, y, z), 1)
    o = mn.link(bpy.data.objects.new(name, cu)); mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return mn.smooth(o)

def rot_rect(cx, cy, w, h, a):
    """Corners of a w x h rectangle centred at (cx, cy), turned by a (the game's ctx.rotate, local frame)."""
    c, s = math.cos(a), math.sin(a)
    return [(cx + u * c - v * s, cy + u * s + v * c) for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]

def find(prefixes):
    return [o for o in bpy.context.scene.objects if o.name.split('.')[0] in prefixes or o.name.startswith(tuple(prefixes))]
