"""Shared helpers for the ship-exterior models (tools/blender/models/hull/), on top of mn.py.

Coordinates: everything here takes *game* layout coordinates (x right, y down the screen, js/ship.js)
and converts with G(x, y, z) -> Blender (x, -y, z). z = 0 is the deck plane: the plane the game's
coordinates live in (floors, the hull's top skin, crew on a spacewalk). The hull's thickness hangs below it.

The game's shapes are copied here (HULL, GUNS, HATCHES, ...) so the models can be checked against them;
keep them in sync with js/ship.js, js/eva.js and js/hazards.js.
"""
import sys, os, math, json, fcntl
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
from shiplib import pmat, glow, pipe, label, ring, render_exact   # (shiplib also hides shadow catchers in data passes)

E = math.radians(mn.ELEVATION)
SIN, COS = math.sin(E), math.cos(E)
COT = COS / SIN

# ---- the game's shapes ------------------------------------------------------------------------------------
SHIP_W, SHIP_H = 44.4, 26.1
SPINE_Y0, SPINE_Y1 = 11.5, 15
HULL = [(17.4, -3.2), (27, -3.2), (30.8, 0), (43.4, 1.6), (44.4, 2.6),
        (44.4, 4.6), (46, 5.5), (46, 8.5), (44.4, 9.4),
        (44.4, 23.4), (43.4, 24.6), (31.2, 24.6), (30.8, 26.1), (13.6, 26.1), (13.2, 24.1),
        (1.2, 24.1), (0, 22.9), (0, 9.6), (-1.6, 8.6), (-1.6, 5.6), (0, 4.6), (0, 3.4),
        (1.4, 2.4), (13.8, 2.4), (13.8, 0)]
def R(x0, y0, x1, y1): return (x0, y0, x1, y1)
ROOM_RECTS = [R(0.6, 3.4, 13.6, SPINE_Y0), R(14.2, 0.6, 30.2, SPINE_Y0), R(18.2, -2.4, 26.2, 0.6), R(30.8, 2.6, 43.8, SPINE_Y0),
              R(0.6, SPINE_Y1, 13.6, 23.2), R(14.2, SPINE_Y1, 30.2, 23.9), R(14.2, 23.9, 19.4, 25.5), R(25.0, 23.9, 30.2, 25.5),
              R(30.8, SPINE_Y1, 43.8, 23.6)]
GUNS = {'front': (22.2, -3.6, -math.pi / 2), 'port': (-0.9, 7.1, math.pi), 'star': (45.3, 6.9, 0.0)}
ENGINE = dict(x=22.2, y=23.9, w=5.6)
HATCHES = {'port': dict(x=0.0, y=19.2, dir=-1), 'star': dict(x=SHIP_W, y=19.4, dir=1)}
ANTENNA = (34.6, -0.15)
COIL_SPOTS = {'left': (-0.6, 13.4), 'right': (45.0, 13.2), 'stern': (16.2, 26.75)}
JAM_SPOTS = {'port': (-1.7, 9.4), 'star': (46.1, 9.2), 'front': (24.0, -4.1)}
NAV_LIGHTS = [(-1.6, 9.0, '#ff5a4a'), (46, 9.0, '#5aff8a'), (13.2, 25.0, '#ffffff')]
WINDOWS = [18.9, 25.5]                    # bridge nose windows (js/decor.js drawHullDecor), y -3.05 .. -2.55

def G(x, y, z=0.0):
    return Vector((x, -y, z))

def point_in_poly(x, y, pts=HULL):
    c = False
    for i in range(len(pts)):
        (xi, yi), (xj, yj) = pts[i], pts[i - 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
    return c

def dist_to_poly(x, y, pts=HULL):
    best = 1e9
    for i in range(len(pts)):
        (ax, ay), (bx, by) = pts[i - 1], pts[i]
        dx, dy = bx - ax, by - ay
        k = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - ax - dx * k, y - ay - dy * k))
    return best

def in_room(x, y, m=0.0):
    return any(x0 - m <= x <= x1 + m and y0 - m <= y <= y1 + m for x0, y0, x1, y1 in ROOM_RECTS)

# ---------------------------------------------------------------------------------------------------------
# Materials (worn paint as on the interceptor; see models/enemy/interceptor.py)
# ---------------------------------------------------------------------------------------------------------
GAIN = 1.35
def lift(color, gain=GAIN):
    return tuple(min(1.0, c * gain) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, wear=1.0, grime=1.0, scale=1.0, gain=GAIN):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color, gain), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.12; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 2.5 * scale; blot.inputs['Detail'].default_value = 6
    Lk(tc.outputs['Object'], blot.inputs['Vector'])
    g1 = N.new('ShaderNodeMapRange'); g1.inputs['From Min'].default_value = 0.45; g1.inputs['From Max'].default_value = 0.75
    g1.inputs['To Min'].default_value = 0; g1.inputs['To Max'].default_value = 0.22 * grime
    Lk(blot.outputs['Fac'], g1.inputs['Value'])
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.7 * grime; Lk(aoi.outputs[0], aok.inputs[0])
    gsum = N.new('ShaderNodeMath'); gsum.operation = 'ADD'; gsum.use_clamp = True; Lk(g1.outputs[0], gsum.inputs[0]); Lk(aok.outputs[0], gsum.inputs[1])
    dirt = N.new('ShaderNodeMix'); dirt.data_type = 'RGBA'; dirt.blend_type = 'MULTIPLY'
    Lk(gsum.outputs[0], dirt.inputs['Factor']); Lk(rgb.outputs[0], dirt.inputs[6]); dirt.inputs[7].default_value = (0.08, 0.07, 0.06, 1)
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
    Lk(tc.outputs['Object'], sm.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 7 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
    sc.inputs['To Max'].default_value = 0.5; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    wk = N.new('ShaderNodeMapRange'); wk.inputs['To Max'].default_value = wear; Lk(sc.outputs[0], wk.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(wk.outputs[0], bare.inputs['Factor'])
    Lk(dirt.outputs[2], bare.inputs[6]); bare.inputs[7].default_value = (0.42, 0.43, 0.45, 1)
    Lk(bare.outputs[2], b.inputs['Base Color'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough; rr.inputs['To Max'].default_value = 0.3
    Lk(wk.outputs[0], rr.inputs['Value']); Lk(rr.outputs[0], b.inputs['Roughness'])
    return m

def emit_mat(name, color, strength, base=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(base or color), 1)
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = 0.3
    return m

def halo_mat(name, color, strength, alpha=0.55):
    """Soft glow for a flat disc: emission fading out radially, see-through (beauty pass only)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*mn.hex_rgb(color), 1); em.inputs['Strength'].default_value = strength
    em.name = 'Emission'
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2; Lk(gr.outputs['Fac'], pw.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = alpha; Lk(pw.outputs[0], k.inputs[0])
    Lk(k.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(em.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def scorch_mat(name, strength=0.92, scale=6.0):
    """Soot decal: black, ragged radial falloff, see-through at the rim (object space, radius 1 = edge)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (0.012, 0.01, 0.009, 1); d.inputs['Roughness'].default_value = 0.95
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = scale; no.inputs['Detail'].default_value = 8; Lk(tc.outputs['Object'], no.inputs['Vector'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; Lk(gr.outputs['Fac'], mul.inputs[0]); Lk(no.outputs['Fac'], mul.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.08; mr.inputs['From Max'].default_value = 0.4; mr.inputs['To Max'].default_value = strength
    Lk(mul.outputs[0], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(d.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def glass_mat(name, color='#5fa8c9', strength=0.6):
    """Window glass lit from inside: dark blue at the edges, a soft glow in the middle, clear coat."""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb('#1d3c56'), 1); b.inputs['Roughness'].default_value = 0.06
    b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    return m

def hazard_mat(name, k=5.5):
    return pmat(name, None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=k, grime=0.4)

def tape_mat():
    return pmat('tape', '#b9bcc2', 0.85, 0.0, grime=0.2)

# ---------------------------------------------------------------------------------------------------------
# Geometry (game coordinates)
# ---------------------------------------------------------------------------------------------------------
def finish(o, m=None, bevel=0.0, segs=3):
    if bevel: mn.bev(o, bevel, segs)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def prism(name, pts, z0, z1, m=None, bevel=0.02, inset=0.0, chamfer=0.0, under=0.0, z_under=None):
    """Extrude a game polygon from z0 up to z1. inset/chamfer: the top face is pulled in by `inset` over the
    last `chamfer` of height. under/z_under: the bottom face is pulled in by `under` and dropped to z_under
    (a tucked-in belly)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(G(x, y, z0)) for x, y in pts]
    f = bm.faces.new(vs); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    bottom = f
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)][0]
    bmesh.ops.translate(bm, verts=top.verts, vec=Vector((0, 0, (z1 - z0) - chamfer)))
    if inset:
        bmesh.ops.inset_region(bm, faces=[top], thickness=inset, depth=0)
        bmesh.ops.translate(bm, verts=top.verts, vec=Vector((0, 0, chamfer)))
    if under:
        bmesh.ops.inset_region(bm, faces=[bottom], thickness=under, depth=0)
        bmesh.ops.translate(bm, verts=bottom.verts, vec=Vector((0, 0, (z_under if z_under is not None else z0) - z0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    return finish(o, m, bevel)

def gbox(name, x0, y0, x1, y1, z0, z1, m=None, bevel=0.02):
    return prism(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, m, bevel=bevel)

def gcyl(name, x, y, r, z0, z1, m=None, verts=32, bevel=0.02):
    return mn.cyl(name, r, z1 - z0, loc=G(x, y, z0), m=m, verts=verts, bevel=bevel)

def gsphere(name, x, y, z, r, m=None, scale=(1, 1, 1), segs=16):
    return mn.sphere(name, r, loc=G(x, y, z), m=m, scale=scale, segs=segs)

def disc(name, x, y, z, r, m, verts=48, sy=1.0, rot=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=verts, radius=1.0); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = G(x, y, z); o.scale = (r, r * sy, 1); o.rotation_euler = (0, 0, rot)
    return finish(o, m)

def many_spheres(name, pts, r, m, scale=(1, 1, 0.5), segs=8):
    """One mesh of many small (squashed) spheres: rivets. pts: game (x, y, z)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for (x, y, z) in pts:
        ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(4, segs // 2), radius=r)
        vs = ret['verts']
        for v in vs: v.co = Vector((v.co.x * scale[0] + x, v.co.y * scale[1] - y, v.co.z * scale[2] + z))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return mn.smooth(o)

def many_boxes(name, boxes, m, bevel=0.0):
    """One mesh of many axis boxes [(x0, y0, x1, y1, z0, z1)] (game coords)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for (x0, y0, x1, y1, z0, z1) in boxes:
        ret = bmesh.ops.create_cube(bm, size=1.0)
        for v in ret['verts']:
            v.co = Vector(((x0 + x1) / 2 + v.co.x * abs(x1 - x0), -(y0 + y1) / 2 + v.co.y * abs(y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); return finish(o, m, bevel)

def tube(name, pts, r, m, res=6):
    """Round cable along game 3D points [(x, y, z)]."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y, z) in zip(sp.points, pts): p.co = (*G(x, y, z), 1)
    o = mn.link(bpy.data.objects.new(name, cu)); mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return mn.smooth(o)

def text(name, body, x, y, z, size, m, rot=0.0, depth=0.004):
    o = label(name, body, size, G(x, y, z), rot=(0, 0, rot), m=m, depth=depth)
    return o

def apply_tf(o):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.data.transform(mw); o.matrix_world = o.matrix_world.__class__.Identity(4)
    o.parent = None
    return o

def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)
    return o

def join(objs, name=None):
    objs = [o for o in objs if o]
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    if name: o.name = name
    o.select_set(False)
    return o

def show(objs, on):
    for o in objs: o.hide_render = not on

# ---------------------------------------------------------------------------------------------------------
# Manifest helpers
# ---------------------------------------------------------------------------------------------------------
def manifest_del(name):
    with open(mn.MANIFEST + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(mn.MANIFEST) as f: data = json.load(f)
        data.pop(name, None)
        tmp = mn.MANIFEST + '.tmp'
        with open(tmp, 'w') as f: json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, mn.MANIFEST)

def manifest_patch(name, extra):
    """Merge extra keys into an existing manifest entry (notes for the game: states, origin meaning, ...)."""
    with open(mn.MANIFEST + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(mn.MANIFEST) as f: data = json.load(f)
        data.setdefault(name, {}).update(extra)
        tmp = mn.MANIFEST + '.tmp'
        with open(tmp, 'w') as f: json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, mn.MANIFEST)

def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ---------------------------------------------------------------------------------------------------------
# GPU shared with other renders: on "out of GPU memory" retry, then fall back to the CPU
# ---------------------------------------------------------------------------------------------------------
_prev_render_to = mn._render_to
def _render_to_retry(path, kind):
    import time as _t
    for attempt in range(3):
        try:
            return _prev_render_to(path, kind)
        except RuntimeError as e:
            if 'memory' not in str(e).lower(): raise
            print(f'[hull] GPU out of memory ({path}), attempt {attempt + 1}')
            if attempt == 1:
                bpy.context.scene.cycles.device = 'CPU'; print('[hull] falling back to CPU')
            else:
                _t.sleep(5)
    return _prev_render_to(path, kind)
mn._render_to = _render_to_retry
