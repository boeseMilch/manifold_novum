"""Interceptor (js/enemies.js ENEMY_TYPES.interceptor): the small twin-nacelle dart, the most common enemy.

Sprites (build/renders/enemy/), all sharing the enemy's ground origin through the manifest's ox/oy:
  interceptor_<side>                 hull without turret and without weak spots, side = port | star
  stealth_<side>, pirate_<side>,     the same hull in the paint jobs of ENEMY_TYPES.stealth / pirate / tractor
  tractor_<side>
  interceptor_<side>_<poi>_<state>   one weak spot, poi = cable | cooling | crack, state = ok | hit
                                     (rendered with the hull as a holdout, so they sit exactly in place)
  interceptor_turret_d<i>            the gun, 32 aim directions around its pivot (ground origin = pivot)

Enemy-local frame (lx, ly): -ly is the nose, +lx the side facing our ship. Blender: X = dir * lx, Y = -ly,
where dir = +1 on the port side (enemy left of us, faces right) and -1 on starboard. The port and starboard
sprites are separate renders of a mirrored build (so the light still comes from the upper left).
z = 0 is the weak-spot plane: the deck. Weak spots are cut/placed so that they project exactly onto the
game's POI shapes taken at z = 0 (see mn.py for the projection).

Draw order in the game: hull, weak spots, turret (and the game's own flames / smoke / sparks).

    blender -b --factory-startup --python tools/blender/models/enemy/interceptor.py [-- quick]
"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import bpy, bmesh
from mathutils import Vector
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS                     # port side, default paint, no turret: for iterating on the look
NAME = 'enemy/interceptor'

E = math.radians(mn.ELEVATION)
COT = math.cos(E) / math.sin(E)
VIEW = Vector((0, math.cos(E), -math.sin(E)))      # direction the camera looks along

# ---- the game's shapes (js/enemies.js), enemy-local units -------------------------------------------------
HULL = [(0, -2.6), (0.45, -1.9), (0.58, -0.6), (1.5, 0.15), (1.5, 1.2), (0.62, 1.45), (0.45, 2.1),
        (-0.45, 2.1), (-0.62, 1.45), (-1.5, 1.2), (-1.5, 0.15), (-0.58, -0.6), (-0.45, -1.9)]
PIVOT, BARREL = (1.0, -0.45), 1.45
CABLE = [(0.5, -1.25), (0.82, -1.08), (0.98, -0.72)]; CABLE_W = 0.16
COOL = (2.02, 0.35, 2.3, 1.25)
CRACK = [(0.12, -1.95), (0.36, -1.85), (0.44, -1.5), (0.4, -1.15), (0.24, -1.05), (0.14, -1.5)]

PAINTS = {   # name -> (hull light, hull dark, stripe, pod light, pod dark): D.paint in the game
    'interceptor': ('#8a4a44', '#4a2626', '#c0392b', '#6a6f7a', '#3a3f4a'),
    'stealth': ('#3a4458', '#141a26', '#2a3448', '#3a4250', '#1a1e28'),
    'pirate': ('#3a3a42', '#16161c', '#e8b42e', '#4a4038', '#221c18'),
    'tractor': ('#c09a3a', '#6a5018', '#2b2b2b', '#7a7a70', '#3a3a34'),
}

S = 1   # current side sign (dir)

def P(lx, ly, z=0.0, comp=False):
    """Local (lx, ly) at height z -> Blender. comp: shift towards the camera so it projects onto (lx, ly, 0)."""
    return Vector((S * lx, -ly - (z * COT if comp else 0.0), z))

# ---------------------------------------------------------------------------------------------------------
# Materials (local: worn paint with AO grime and edge wear; mn.mat stays for plain ones)
# ---------------------------------------------------------------------------------------------------------
PAINT_NODES = {}

GAIN = 1.35
def lift(color):
    """Palette colour, a bit brighter: lit 3D surfaces under AgX read darker than the game's flat fills."""
    return tuple(min(1.0, c * GAIN) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, wear=1.0, grime=1.0, key=None, scale=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color), 1)
    if key: PAINT_NODES.setdefault(key, []).append(rgb)
    tc = N.new('ShaderNodeTexCoord')
    # grime: darker in crevices (AO) and in big soft blotches
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
    # edge wear: convex edges (AO "inside") show bare metal, broken up by fine noise
    ed = N.new('ShaderNodeAmbientOcclusion'); ed.inside = True; ed.inputs['Distance'].default_value = 0.025; ed.samples = 8
    edi = N.new('ShaderNodeMath'); edi.operation = 'SUBTRACT'; edi.inputs[0].default_value = 1; Lk(ed.outputs['AO'], edi.inputs[1])
    fn = N.new('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 14 * scale; fn.inputs['Detail'].default_value = 8
    Lk(tc.outputs['Object'], fn.inputs['Vector'])
    em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; Lk(edi.outputs[0], em.inputs[0]); Lk(fn.outputs['Fac'], em.inputs[1])
    # scratches: thin stretched noise bands
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
    Lk(tc.outputs['Object'], sm.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 7 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71; sc.inputs['To Max'].default_value = 1.0
    sc.inputs['To Max'].default_value = 0.5; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    wsum = N.new('ShaderNodeMath'); wsum.operation = 'ADD'; wsum.inputs[0].default_value = 0; Lk(sc.outputs[0], wsum.inputs[1])   # (edge AO wear looked like camo: off)
    wk = N.new('ShaderNodeMapRange'); wk.inputs['From Min'].default_value = 0.0; wk.inputs['From Max'].default_value = 1.0
    wk.inputs['To Max'].default_value = wear; Lk(wsum.outputs[0], wk.inputs['Value'])
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

def blue_glass(name):
    """Weak-spot glass: glowing blue with a web of bright cracks (voronoi edges)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb('#1f4f86'), 1)
    b.inputs['Roughness'].default_value = 0.08; b.inputs['Coat Weight'].default_value = 1.0
    tc = N.new('ShaderNodeTexCoord')
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 7; Lk(tc.outputs['Object'], v.inputs['Vector'])
    v.inputs['Randomness'].default_value = 1.0
    cr = N.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.035; cr.inputs['From Max'].default_value = 0.0; Lk(v.outputs['Distance'], cr.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(cr.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = (*mn.hex_rgb('#3d8fe0'), 1); col.inputs[7].default_value = (*mn.hex_rgb('#d8f0ff'), 1)
    Lk(col.outputs[2], b.inputs['Emission Color'])
    st = N.new('ShaderNodeMapRange'); st.inputs['To Min'].default_value = 1.6; st.inputs['To Max'].default_value = 6.0
    Lk(cr.outputs[0], st.inputs['Value']); Lk(st.outputs[0], b.inputs['Emission Strength'])
    return m

def web_glass(name):
    """Shot-up glass: smoky, crazed with a web of white cracks."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.35
    tc = N.new('ShaderNodeTexCoord')
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 5; Lk(tc.outputs['Object'], v.inputs['Vector'])
    cr = N.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.025; cr.inputs['From Max'].default_value = 0.0; Lk(v.outputs['Distance'], cr.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(cr.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = (*mn.hex_rgb('#4a5562'), 1); col.inputs[7].default_value = (*mn.hex_rgb('#e8ecf0'), 1)
    Lk(col.outputs[2], b.inputs['Base Color'])
    return m

def halo_mat(name, color, strength):
    """Soft glow halo for a flat disc: emission fading out radially, see-through."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*mn.hex_rgb(color), 1); em.inputs['Strength'].default_value = strength
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2; Lk(gr.outputs['Fac'], pw.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 0.55; Lk(pw.outputs[0], k.inputs[0])
    Lk(k.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(em.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def scorch_mat(name):
    """Soot decal: black, ragged radial falloff, see-through at the rim."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (0.012, 0.01, 0.009, 1); d.inputs['Roughness'].default_value = 0.95
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 6; no.inputs['Detail'].default_value = 8; Lk(tc.outputs['Object'], no.inputs['Vector'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; Lk(gr.outputs['Fac'], mul.inputs[0]); Lk(no.outputs['Fac'], mul.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.08; mr.inputs['From Max'].default_value = 0.4; mr.inputs['To Max'].default_value = 0.92
    Lk(mul.outputs[0], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(d.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

# ---------------------------------------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------------------------------------
def finish(o, m=None, bevel=0.0, segs=3):
    if bevel: mn.bev(o, bevel, segs)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def prism(name, pts, z0, z1, m=None, inset=0.0, chamfer=0.0, bevel=0.02, comp=False):
    """Extrude a local polygon from z0 to z1; inset/chamfer: the top face is pulled in by `inset` over the
    last `chamfer` of height (a sloped armor rim)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(P(x, y, z0, comp)) for x, y in pts]
    f = bm.faces.new(vs); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)][0]
    h = (z1 - z0) - chamfer
    bmesh.ops.translate(bm, verts=top.verts, vec=Vector((0, -h * COT if comp else 0, h)))
    if inset:
        ri = bmesh.ops.inset_individual(bm, faces=[top], thickness=inset, depth=0)
        bmesh.ops.translate(bm, verts=top.verts, vec=Vector((0, -chamfer * COT if comp else 0, chamfer)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    return finish(o, m, bevel)

def ycyl(name, r, y0, y1, x, z, m=None, verts=32, bevel=0.02, r1=None):
    """Cylinder (or cone, r -> r1) along the local y axis from y0 to y1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r1 is None else r1, depth=abs(y1 - y0))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    # cone axis is +Z (radius1 at -Z); rotate so +Z -> -Y (towards the local y0 -> y1 direction: y0 nose, y1 tail)
    o.rotation_euler = (math.radians(90), 0, 0)
    o.location = P(x, (y0 + y1) / 2, z)
    bpy.context.view_layer.update(); apply_tf(o)
    return finish(o, m, bevel)

def apply_tf(o):
    mw = o.matrix_world.copy()
    o.data.transform(mw); o.matrix_world = o.matrix_world.__class__.Identity(4)
    o.parent = None
    return o

def lbox(name, lx0, ly0, lx1, ly1, z0, z1, m=None, bevel=0.02, comp=False):
    return prism(name, [(lx0, ly0), (lx1, ly0), (lx1, ly1), (lx0, ly1)], z0, z1, m, bevel=bevel, comp=comp)

def disc(name, lx, ly, z, r, m, verts=48, sy=1.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=verts, radius=1.0); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(lx, ly, z); o.scale = (r, r * sy, 1)
    return finish(o, m)

def tube(name, pts, r, m, comp_z=None):
    """Round cable along local 3D points [(lx, ly, z)]; comp: projected onto the z=0 line."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y, z) in zip(sp.points, pts): p.co = (*P(x, y, z, comp=True), 1)
    o = mn.link(bpy.data.objects.new(name, cu)); mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return mn.smooth(o)

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

def keep_projected(o, poly):
    """Delete the faces of o whose centre does not project inside the (any shape) local polygon."""
    def scr(v): return (v.x, v.y * math.sin(E) + v.z * math.cos(E))
    pp = [scr(P(x, y)) for x, y in poly]
    def inside(x, y):
        c = False
        for i in range(len(pp)):
            (ax, ay), (bx, by) = pp[i], pp[i - 1]
            if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay): c = not c
        return c
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not inside(*scr(f.calc_center_median()))], context='FACES')
    bm.to_mesh(o.data); bm.free()
    return o

def text(name, body, lx, ly, z, size, m, rot=0.0):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = mn.link(bpy.data.objects.new(name, cu)); o.location = P(lx, ly, z); o.rotation_euler = (0, 0, rot)
    mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return o

# ---------------------------------------------------------------------------------------------------------
# The ship
# ---------------------------------------------------------------------------------------------------------
def build(side):
    """Returns dict of object lists: hull, pois[(id, state)], halo[(id)]."""
    global S
    S = 1 if side == 'port' else -1
    PAINT_NODES.clear()
    c0, c1, stripe, pod0, pod1 = PAINTS['interceptor']
    M = dict(
        paint=worn('paint', c0, 0.45, 0.15, key='paint'),
        paint2=worn('paint2', c1, 0.5, 0.15, key='paint2'),
        pod=worn('pod', pod0, 0.4, 0.25, key='pod'),
        pod2=worn('pod2', pod1, 0.45, 0.25, key='pod2'),
        stripe=worn('stripe', stripe, 0.45, 0.1, wear=0.7, key='stripe'),
        steel=worn('steel', '#9aa3b5', 0.35, 0.8, wear=0.3),
        gun=worn('gunmetal', '#4a515e', 0.4, 0.35, wear=0.6),
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
        hud=emit_mat('hud', '#ff8a3a', 3.0),
        blue=emit_mat('blue', '#5fb4ff', 3.5, base='#3d8fe0'),
        bluel=emit_mat('blue_light', '#bfe6ff', 6.0, base='#8fd0ff'),
        crackglass=blue_glass('crackglass'),
        halo=halo_mat('halo', '#6ebeff', 3.0),
        scorch=scorch_mat('scorch'),
        char=worn('char', '#4a4440', 0.8, 0.3, wear=0.5, grime=1.2),
        copper=mn.mat('copper', 'copper', 0.35, 1.0),
        ember=emit_mat('ember', '#ff7a2a', 12.0, base='#401008'),
    )
    hull, outl = [], []
    def H(o, ol=True):
        hull.append(o)
        if ol: outl.append(o)
        return o

    # -- main body: belly, armored deck, raised spine --------------------------------------------------
    H(prism('belly', HULL, -0.34, -0.14, M['paint2'], bevel=0.05))
    for o in hull[-1:]:                                  # tuck the belly in a little
        for v in o.data.vertices: v.co.x *= 0.96; v.co.y = (v.co.y - 0.0) * 0.97
    H(prism('deck', HULL, -0.2, 0.0, M['paint'], inset=0.06, chamfer=0.05, bevel=0.025))
    spine = [(0, -2.42), (0.24, -2.0), (0.36, -1.5), (0.4, -0.7), (0.42, 0.5), (0.36, 1.5), (0.3, 2.06)]
    spine = spine + [(-x, y) for x, y in reversed(spine[1:])]
    H(prism('spine', spine, -0.05, 0.11, M['paint2'], inset=0.07, chamfer=0.06, bevel=0.02))
    # dark rear deck around the vents
    H(prism('rear_plate', [(0.26, 0.62), (0.26, 1.42), (0.2, 1.9), (-0.2, 1.9), (-0.26, 1.42), (-0.26, 0.62)],
            0.0, 0.135, M['paint2'], inset=0.03, chamfer=0.03, bevel=0.012))
    for i, x in enumerate((-0.15, -0.05, 0.05, 0.15)):
        H(lbox(f'vent{i}', x - 0.03, 0.78, x + 0.03, 1.32, 0.1, 0.142, M['black'], bevel=0.008), False)
    # wing armor plates (both wings), leading-edge armor and the near/far stripes
    for s in (1, -1):
        wp = [(0.68, -0.38), (1.4, 0.22), (1.4, 1.1), (0.66, 1.32)]
        wp = [(s * x, y) for x, y in wp]
        H(prism(f'wingplate{s}', wp if s > 0 else wp[::-1], -0.02, 0.035, M['paint'], inset=0.03, chamfer=0.025, bevel=0.01))
        le = [(0.6, -0.62), (1.5, 0.12), (1.5, 0.22), (0.62, -0.5)]
        le = [(s * x, y) for x, y in le]
        H(prism(f'leading{s}', le if s > 0 else le[::-1], -0.06, 0.03, M['paint2'], bevel=0.012))
        st = [(0.76, -0.24), (1.38, 0.27), (1.38, 0.47), (0.76, -0.04)]
        st = [(s * x, y) for x, y in st]
        H(prism(f'stripe{s}', st if s > 0 else st[::-1], 0.03, 0.038, M['stripe'], bevel=0.0), False)
        # wing-root intake slits (mean look)
        for k in range(3):
            y = 0.62 + k * 0.13
            H(lbox(f'slit{s}{k}', s * 0.5 if s > 0 else -0.62, y, 0.62 if s > 0 else -0.5, y + 0.06, 0.0, 0.03, M['black'], bevel=0.006), False)
    # panel grooves on the wing plates and a riveted repair patch on the far wing
    for s in (1, -1):
        for (ax, ay, bx, by) in ((0.72, 0.62, 1.36, 0.62), (1.02, 0.66, 1.02, 1.08), (0.95, 0.05, 1.36, 0.38)):
            L = math.hypot(bx - ax, by - ay); n = (-(by - ay) / L * 0.008, (bx - ax) / L * 0.008)
            g = [(s * (ax + n[0]), ay + n[1]), (s * (bx + n[0]), by + n[1]), (s * (bx - n[0]), by - n[1]), (s * (ax - n[0]), ay - n[1])]
            H(prism('groove', g if s > 0 else g[::-1], 0.034, 0.037, M['black'], bevel=0.0), False)
    H(prism('patch', [(-0.78, 0.98), (-1.18, 0.94), (-1.22, 1.16), (-0.8, 1.22)][::-1], 0.03, 0.055, M['pod2'], bevel=0.008))
    for lx, ly in ((-0.82, 1.0), (-1.15, 0.97), (-1.18, 1.14), (-0.84, 1.18)):
        H(mn.sphere('rivet', 0.018, loc=P(lx, ly, 0.056), m=M['steel'], segs=10), False)
    H(disc('soot_gun', 1.35, -0.2, 0.04, 0.32, M['scorch'], sy=0.7), False)
    # nose: dark armored tip and a sensor
    H(prism('nosecap', [(0, -2.56), (0.2, -2.18), (0.14, -2.05), (-0.14, -2.05), (-0.2, -2.18)], 0.0, 0.08, M['paint2'], inset=0.02, chamfer=0.02, bevel=0.01))
    # shark teeth on the nose cap: mean
    for k, sgn in ((0, 1), (1, 1), (2, 1), (0, -1), (1, -1), (2, -1)):
        y0 = -2.32 + k * 0.08
        x0 = 0.04 + 0.13 * ((y0 + 2.56) / 0.51) * 0.9
        H(prism(f'tooth{k}{sgn}', [(sgn * x0, y0 - 0.035), (sgn * (x0 + 0.075), y0 + 0.035), (sgn * x0, y0 + 0.07)][::sgn], 0.08, 0.084,
                M['white'], bevel=0.0), False)
    # kill marks under the canopy, far side tag
    for k in range(5):
        H(lbox(f'kill{k}', -0.3 + k * 0.06 - 0.012, -0.55, -0.3 + k * 0.06 + 0.012, -0.42, 0.1, 0.114, M['white'], bevel=0.0), False)
    H(text('tag', 'IX-7', -1.02, 0.86, 0.037, 0.24, M['white']), False)
    # rivets
    for lx, ly in [(0.3, -0.3), (-0.3, -0.3), (0.4, 1.2), (-0.4, 1.2), (1.1, 0.7), (-1.1, 0.7), (0.75, 1.15), (-0.75, 1.15),
                   (1.3, 0.95), (-1.3, 0.95), (0.85, 0.0), (-0.85, 0.0)]:
        z = 0.035 if abs(lx) > 0.6 else (0.11 if abs(lx) < 0.4 else 0.0)
        H(mn.sphere(f'rivet', 0.022, loc=P(lx, ly, z), m=M['steel'], segs=12), False)

    # -- canopy ---------------------------------------------------------------------------------------
    can = mn.sphere('canopy', 1.0, loc=P(0, -1.5, 0.0), m=M['glass'], scale=(0.47, 0.76, 0.27), segs=96)
    bpy.context.view_layer.update(); apply_tf(can); H(can)
    ring = mn.sphere('canopy_frame', 1.0, loc=P(0, -1.5, -0.02), m=M['gun'], scale=(0.52, 0.81, 0.17), segs=48)
    bpy.context.view_layer.update(); apply_tf(ring); H(ring)
    strut = mn.sphere('canopy_strut', 1.0, loc=P(0, -1.5, 0.0), m=M['gun'], scale=(0.485, 0.045, 0.28), segs=48)
    bpy.context.view_layer.update(); apply_tf(strut); H(strut, False)
    hl = mn.sphere('canopy_glint', 1.0, loc=P(-0.17 * S, -1.82, 0.19), m=M['shine'], scale=(0.05, 0.17, 0.02), segs=24)
    hl.rotation_euler = (0.55, 0.0, 0.35); bpy.context.view_layer.update(); apply_tf(hl); H(hl, False)
    H(mn.sphere('hud', 0.05, loc=P(-0.12, -1.3, 0.13), m=M['hud'], scale=(1.5, 0.6, 0.4), segs=12), False)

    # -- nacelles ---------------------------------------------------------------------------------------
    for s in (1, -1):
        x = s * 1.72
        H(ycyl(f'nacelle{s}', 0.3, -0.12, 1.6, x, -0.06, M['pod'], bevel=0.03))
        H(mn.sphere(f'nacelle_nose{s}', 0.3, loc=P(x, -0.12, -0.06), m=M['pod'], scale=(1, 0.75, 1)))
        hull[-1].location = P(x, -0.1, -0.06); hull[-1].scale = (1, 0.8, 1)
        H(ycyl(f'band{s}a', 0.31, 0.44, 0.56, x, -0.06, M['pod2'], bevel=0.01))
        H(ycyl(f'band{s}b', 0.31, 1.14, 1.26, x, -0.06, M['pod2'], bevel=0.01))
        H(ycyl(f'nozzle{s}', 0.27, 1.6, 1.9, x, -0.06, M['gun'], bevel=0.015, r1=0.23))
        H(ycyl(f'nozzle_in{s}', 0.2, 1.86, 1.905, x, -0.06, M['hot'], bevel=0.0), False)
        H(ycyl(f'nozzle_core{s}', 0.11, 1.89, 1.91, x, -0.06, M['hot2'], bevel=0.0), False)
        # top intake scoop (dark hole, as in the game)
        H(mn.cyl(f'intake{s}', 0.17, 0.12, loc=P(x, -0.15, 0.13), m=M['pod2'], bevel=0.02))
        H(mn.cyl(f'intake_hole{s}', 0.12, 0.02, loc=P(x, -0.15, 0.24), m=M['black'], bevel=0.0), False)
        H(mn.sphere(f'nav{s}', 0.055, loc=P(x, -0.43, 0.0), m=M['navg'] if s > 0 else M['navr'], segs=16), False)
        for k in range(4):                               # rivet ring on the band
            a = math.radians(30 + 40 * k)
            H(mn.sphere('rivet', 0.018, loc=P(x + math.cos(a) * 0.3 * 0.8, 0.5, -0.06 + math.sin(a) * 0.305), m=M['steel'], segs=10), False)
    # radiator housing on the near nacelle (solid box 2.0..2.3 x 0.0..1.6)
    H(lbox('rad_housing', 1.9, 0.0, 2.3, 1.6, -0.22, 0.02, M['gun'], bevel=0.03))
    H(lbox('rad_recess', 2.0, 0.3, 2.32, 1.3, -0.02, 0.03, M['black'], bevel=0.0), False)
    # hazard tick on the housing
    for k in range(3):
        H(lbox(f'haz{k}', 2.05, 1.38 + k * 0.06, 2.25, 1.41 + k * 0.06, 0.02, 0.03, M['hazard'], bevel=0.0), False)

    # -- centre engine --------------------------------------------------------------------------------
    H(prism('engine_block', [(0.32, 1.5), (0.32, 1.95), (-0.32, 1.95), (-0.32, 1.5)], -0.22, 0.06, M['paint2'], inset=0.03, chamfer=0.03, bevel=0.02))
    H(ycyl('cnozzle', 0.25, 1.85, 2.12, 0, -0.06, M['gun'], bevel=0.015, r1=0.22))
    H(ycyl('cnozzle_in', 0.18, 2.1, 2.125, 0, -0.06, M['hot'], bevel=0.0), False)
    H(ycyl('cnozzle_core', 0.1, 2.12, 2.13, 0, -0.06, M['hot2'], bevel=0.0), False)
    # antenna
    H(mn.cyl('antenna', 0.012, 0.32, loc=P(-0.22, 1.7, 0.06), m=M['steel'], verts=8, bevel=0.0), False)
    H(mn.sphere('antenna_tip', 0.025, loc=P(-0.22, 1.7, 0.38), m=M['navr'], segs=10), False)

    # -- turret mount (the turret itself is its own sprite) -------------------------------------------
    H(mn.cyl('sponson', 0.3, 0.12, loc=P(*PIVOT, -0.12), m=M['paint2'], bevel=0.03))
    H(mn.cyl('turret_ring', 0.27, 0.06, loc=P(*PIVOT, 0.0), m=M['steel'], bevel=0.015))
    H(mn.cyl('turret_well', 0.13, 0.02, loc=P(*PIVOT, 0.05), m=M['dark'], bevel=0.0), False)
    for k in range(8):
        a = k * math.pi / 4
        H(mn.sphere('ringbolt', 0.016, loc=P(PIVOT[0] + math.cos(a) * 0.22, PIVOT[1] + math.sin(a) * 0.22, 0.062), m=M['gun'], segs=8), False)

    # -- weak spots -----------------------------------------------------------------------------------
    pois, halos = {}, {}
    # cable: braided blue power line from the spine to the turret mount, connectors at both ends
    zc = 0.075
    cab = [(x, y, zc) for x, y in CABLE]
    ok = [tube('cable', cab, CABLE_W / 2, M['blue'])]
    for k in range(9):                                   # bright braid bands along the cable
        t = (k + 0.5) / 9; i = 0 if t < 0.5 else 1; u = t * 2 - i
        a, b = CABLE[i], CABLE[i + 1]
        p = (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        q = mn.sphere('braid', 1.0, loc=P(*p, zc, comp=True), m=M['bluel'], scale=(0.03, 0.03, 0.03), segs=12)
        d = Vector(P(b[0], b[1]) - P(a[0], a[1])).normalized()
        q.scale = (0.083, 0.083, 0.083); q.rotation_euler = (0, 0, math.atan2(d.y, d.x)); q.scale = (0.025, 0.084, 0.084)
        ok.append(q)
    conns = []
    for (x, y) in (CABLE[0], CABLE[-1]):
        conns.append(mn.box('conn', (0.17, 0.17, 0.12), loc=P(x, y, 0.02, comp=True), m=M['steel'], bevel=0.02))
    pois[('cable', 'ok')] = ok + conns
    hit = []
    gap = 0.11
    a, m_, b = CABLE
    def along(p, q, d):
        L = math.hypot(q[0] - p[0], q[1] - p[1]); return (p[0] + (q[0] - p[0]) * d / L, p[1] + (q[1] - p[1]) * d / L)
    e1 = along(m_, a, gap); e2 = along(m_, b, gap)
    hit.append(tube('cable_cut1', [(a[0], a[1], zc), (e1[0], e1[1], zc - 0.02)], CABLE_W / 2 * 0.95, M['rubber']))
    hit.append(tube('cable_cut2', [(e2[0], e2[1], zc - 0.02), (b[0], b[1], zc)], CABLE_W / 2 * 0.95, M['rubber']))
    for e, f in ((e1, a), (e2, b)):                          # frayed copper ends glowing hot
        for k in range(4):
            ang = k * 1.7
            tip = (e[0] + (e[0] - f[0]) * 0.18 + math.cos(ang) * 0.03, e[1] + (e[1] - f[1]) * 0.18 + math.sin(ang) * 0.03)
            hit.append(tube('wire', [(e[0], e[1], zc - 0.02), (tip[0], tip[1], zc + 0.02 * (k % 2))], 0.012, M['copper']))
        hit.append(mn.sphere('ember', 0.045, loc=P(e[0], e[1], zc - 0.02, comp=True), m=M['ember'], segs=12))
    hit += [mn.box('conn', (0.17, 0.17, 0.12), loc=P(x, y, 0.02, comp=True), m=M['char'], bevel=0.02) for x, y in (CABLE[0], CABLE[-1])]
    sc = disc('scorch_cable', *m_, 0.012, 0.4, M['scorch'], sy=0.85)
    hit.append(sc)
    pois[('cable', 'hit')] = hit
    halos['cable'] = [disc('halo_cable', *m_, 0.13, 0.42, M['halo'], sy=0.75)]

    # cooling: radiator block with fins (footprint = the POI box), blue coolant glowing through
    x0, y0, x1, y1 = COOL
    zb, zt = -0.02, 0.11
    ok = [lbox('rad_core', x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, zb, zt - 0.03, M['blue'], bevel=0.01, comp=True)]
    ok.append(lbox('rad_frame_a', x0, y0, x1, y0 + 0.05, zb, zt, M['steel'], bevel=0.012, comp=True))
    ok.append(lbox('rad_frame_b', x0, y1 - 0.05, x1, y1, zb, zt, M['steel'], bevel=0.012, comp=True))
    for k in range(1, 6):
        y = y0 + k * 0.15
        ok.append(lbox(f'fin{k}', x0 + 0.015, y - 0.018, x1 - 0.015, y + 0.018, zb, zt - 0.005, M['bluel'] if k % 2 else M['blue'], bevel=0.006, comp=True))
    pois[('cooling', 'ok')] = ok
    hit = [lbox('rad_core_x', x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02, zb, zt - 0.05, M['black'], bevel=0.01, comp=True)]
    hit.append(lbox('rad_frame_ax', x0, y0, x1, y0 + 0.05, zb, zt, M['char'], bevel=0.012, comp=True))
    hit.append(lbox('rad_frame_bx', x0, y1 - 0.05, x1, y1, zb, zt - 0.02, M['char'], bevel=0.012, comp=True))
    for k in range(1, 6):
        y = y0 + k * 0.15
        f = lbox(f'finx{k}', x0 + 0.015, y - 0.018, x1 - 0.015, y + 0.018, zb, zt - 0.01 - 0.02 * (k % 3), M['char'], bevel=0.006, comp=True)
        f.rotation_euler = (0.25 * ((k * 7) % 3 - 1), 0.0, 0.12 * ((k * 5) % 3 - 1))
        hit.append(f)
    hit.append(mn.sphere('ember', 0.04, loc=P(2.12, 0.62, 0.06, comp=True), m=M['ember'], segs=10))
    hit.append(mn.sphere('ember', 0.03, loc=P(2.2, 1.0, 0.06, comp=True), m=M['ember'], segs=10))
    hit.append(disc('scorch_cool', 2.16, 0.8, zt + 0.03, 0.3, M['scorch'], sy=1.6))
    pois[('cooling', 'hit')] = hit
    halos['cooling'] = [disc('halo_cool', 2.16, 0.8, zt + 0.02, 0.6, M['halo'], sy=1.25)]

    # canopy crack: the part of the canopy that projects onto the crack polygon
    def patch(name, grow, m):
        p = mn.sphere(name, 1.0, loc=P(0, -1.5, 0.0), m=m, scale=(0.47 + grow, 0.76 + grow, 0.27 + grow), segs=128)
        bpy.context.view_layer.update(); apply_tf(p)
        return cut_to_projection(p, CRACK)
    ok = [patch('crack_glass', 0.004, M['crackglass'])]
    pois[('crack', 'ok')] = ok
    soot = patch('crack_web', 0.004, web_glass('webglass'))
    hole = patch('crack_hole', 0.008, M['black'])
    cx, cy = sum(p[0] for p in CRACK) / len(CRACK), sum(p[1] for p in CRACK) / len(CRACK)
    star = [(cx + math.cos(a) * r * 0.15, cy + math.sin(a) * r * 0.4) for a, r in
            ((k / 14 * math.tau, 1.0 if k % 2 else 0.45 + 0.2 * ((k * 7) % 3)) for k in range(14))]
    keep_projected(hole, star)
    pois[('crack', 'hit')] = [soot, hole]
    for k in range(7):                                       # glass shards around the hole
        ang = k / 7 * math.tau
        cx, cy = 0.29 + math.cos(ang) * 0.1, -1.5 + math.sin(ang) * 0.3
        sh = mn.sphere('shard', 1.0, loc=P(cx, cy, 0.0), m=M['glass'], scale=(0.035, 0.07, 0.01), segs=8)
        # put it on the canopy surface
        u = (cx / 0.47) ** 2 + ((cy + 1.5) / 0.76) ** 2
        sh.location.z = 0.275 * math.sqrt(max(0.0, 1 - u)); sh.rotation_euler = (0.4, 0.3 * k, ang)
        pois[('crack', 'hit')].append(sh)
    halos['crack'] = [disc('halo_crack', 0.3, -1.5, 0.3, 0.5, M['halo'], sy=1.2)]

    allp = [o for v in pois.values() for o in v]
    mn.outline([o for o in outl], thickness=0.022)
    mn.outline([o for k, v in pois.items() for o in v if not o.name.startswith(('scorch', 'braid', 'ember', 'wire', 'halo', 'crack_hole', 'crack_web'))], thickness=0.016)
    return hull, pois, halos

def set_paint(variant):
    c0, c1, stripe, pod0, pod1 = PAINTS[variant]
    for key, col in (('paint', c0), ('paint2', c1), ('stripe', stripe), ('pod', pod0), ('pod2', pod1)):
        for n in PAINT_NODES.get(key, []): n.outputs[0].default_value = (*lift(col), 1)

def show(objs, on):
    for o in objs: o.hide_render = not on

def render_side(side):
    hull, pois, halos = build(side)
    allpoi = [o for v in pois.values() for o in v]; allhalo = [o for v in halos.values() for o in v]
    t0 = time.time()
    # hull (every paint job): weak spots hidden
    show(allpoi + allhalo, False)
    for variant in (['interceptor'] if QUICK else PAINTS):
        set_paint(variant)
        mn.render(f'enemy/{variant}_{side}', objs=hull)
    set_paint('interceptor')
    print(f'[interceptor] {side} hull(s): {time.time() - t0:.1f}s'); t0 = time.time()
    # weak spots: the hull is a holdout (cuts them where it is in front), everything else hidden
    for o in hull: o.is_holdout = True
    for (pid, state), objs in pois.items():
        show(allpoi + allhalo, False); show(objs, True)
        frame = objs + (halos[pid] if state == 'ok' else [])
        nm = f'{NAME}_{side}_{pid}_{state}'
        if state == 'ok':                                  # glow halo only in the beauty pass
            show(halos[pid], True); mn.render(nm, objs=frame, passes=('beauty',))
            show(halos[pid], False); mn.render(nm, objs=frame, passes=('normal', 'height'))
        else:
            mn.render(nm, objs=frame)
    for o in hull: o.is_holdout = False
    print(f'[interceptor] {side} weak spots: {time.time() - t0:.1f}s')

# ---------------------------------------------------------------------------------------------------------
# Turret: its own sprite set, origin = the pivot, modelled pointing +x (game angle 0)
# ---------------------------------------------------------------------------------------------------------
def render_turret():
    global S
    S = 1
    mn.reset(); mn._mats.clear()
    gun = worn('gunmetal', '#6a7280', 0.45, 0.1, wear=0.7)
    gun2 = worn('gunmetal2', '#4a515e', 0.5, 0.1, wear=0.5)
    steel = worn('steel', '#9aa3b5', 0.35, 0.5, wear=0.3)
    haz = worn('hazard', 'hazard', 0.5, 0.0, wear=1.0)
    blk = mn.mat('black', '#0b0c0f', 0.9)
    red = emit_mat('sight', '#ff4a3a', 6.0)
    parts = []
    # head: chunky armored block with a sloped front, slightly longer than wide
    head = prism('head', [(-0.22, -0.2), (0.14, -0.22), (0.28, -0.12), (0.28, 0.12), (0.14, 0.22), (-0.22, 0.2), (-0.27, 0.12), (-0.27, -0.12)],
                 0.04, 0.28, gun, inset=0.06, chamfer=0.07, bevel=0.025)
    parts.append(head)
    parts.append(prism('head_plate', [(-0.16, -0.11), (0.1, -0.12), (0.1, 0.12), (-0.16, 0.11)], 0.27, 0.3, gun2, bevel=0.008))
    parts.append(mn.sphere('sight', 0.035, loc=(0.06, -0.16, 0.25), m=red, segs=12))
    # barrel: housing, barrel, muzzle brake (the game: 0.2 wide barrel to 1.4, 0.18 x 0.3 brake at 1.25)
    parts.append(lbox('mantlet', 0.2, -0.12, 0.46, 0.12, 0.07, 0.26, gun2, bevel=0.03))
    def xcyl(name, r, x0, x1, z, m, r1=None, bevel=0.01, verts=24):
        o = mn.cyl(name, r, x1 - x0, loc=(x0, 0, z), m=m, verts=verts, bevel=bevel, rot=(0, math.radians(90), 0))
        if r1 is not None:
            for v in o.data.vertices:
                k = v.co.z / (x1 - x0); s = (r + (r1 - r) * k) / r; v.co.x *= s; v.co.y *= s
        return o
    parts.append(xcyl('barrel_sleeve', 0.1, 0.42, 0.88, 0.165, gun))
    parts.append(xcyl('barrel', 0.07, 0.86, 1.27, 0.165, steel))
    parts.append(xcyl('muzzle', 0.11, 1.25, 1.45, 0.165, gun2, bevel=0.015, verts=8))
    parts.append(xcyl('bore', 0.045, 1.44, 1.455, 0.165, blk, bevel=0.0))
    for k in range(3):
        parts.append(xcyl(f'brake{k}', 0.112, 1.29 + k * 0.05, 1.31 + k * 0.05, 0.165, blk, bevel=0.0, verts=8))
    parts.append(xcyl('haz_band', 0.103, 0.7, 0.78, 0.165, haz, bevel=0.0))
    # ammo feed box on the back
    parts.append(lbox('feed', -0.36, -0.12, -0.2, 0.12, 0.05, 0.2, gun2, bevel=0.02))
    for k in range(2):
        parts.append(mn.sphere('bolt', 0.02, loc=(-0.08 + k * 0.14, 0.13, 0.22), m=steel, segs=8))
        parts.append(mn.sphere('bolt', 0.02, loc=(-0.08 + k * 0.14, -0.13, 0.22), m=steel, segs=8))
    mn.outline([p for p in parts if p.name not in ('sight', 'bore') and not p.name.startswith(('bolt', 'brake', 'haz'))], thickness=0.014)
    root = mn.group('turret', parts)
    t0 = time.time()
    mn.render(f'{NAME}_turret', objs=parts, root=root, dirs=32)
    print(f'[interceptor] turret: {time.time() - t0:.1f}s')

if __name__ == '__main__':
    T = time.time()
    for side in (['port'] if QUICK else ['port', 'star']):
        mn.reset(); mn._mats.clear()
        render_side(side)
    if not QUICK or 'turret' in ARGS:
        render_turret()
    print(f'[interceptor] total {time.time() - T:.1f}s')
