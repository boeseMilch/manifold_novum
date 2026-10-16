"""Captain Red Comet's quarters (the boss room of the pirate base): furniture and clutter, one sprite per piece/state.

    blender -b --factory-startup --python tools/blender/models/base/quarters.py -- [quick] [only=throne,desk,...]

`quick` renders at 16 samples into the scratch dir given by MN_QUICK_DIR (default /tmp/mn_base), without touching the
manifest (it gets its own manifest.json there). The room is new (concept: models/concepts/boss_hall.py, 12 x 10 units), so there is no game code yet: the sizes
below are the ones this sprite set defines. Every sprite is built facing the camera (its front towards game +y / down),
origin = the point the game places at (x, y) on the floor:

  floor pieces   origin = centre of the footprint (u right, v down the screen, in game units)
  wall pieces    origin = on the wall's face (the room's north wall), centred, at floor level; they hang at their real height
                 (portrait 0.72..1.5, poster 0.62..1.45, trophies 0.6..1.6) and stick out <= 0.4 towards +v

Sprites (group 'base'):
  base/throne            pilot seat turned throne on a dais           footprint 2.0 x 1.4
  base/desk              his desk, upright                            2.4 x 1.0
  base/desk_cover        the same desk kicked over as cover           2.4 x 0.8 (blocks), papers spill south of it
  base/chest_closed      treasure chest (cover)                       1.4 x 0.9
  base/chest_open        open, heaped with gold (cover)               1.4 x 0.9 (lid swings back over v -0.45..-1.0)
  base/pillar            structural pillar (cover)                    0.9 x 0.9, 1.85 tall
  base/map_table         holo star chart, red route to THEM, 4 frames (target ring pulses)   1.6 x 1.2
  base/portrait          duct-taped self-portrait (wall)              1.1 wide
  base/wanted            'WANTED: ONE SHIP CAT' poster (wall)         0.7 wide
  base/trophies          wall shelf: skulls, space-squid head, golden duck (wall)   2.2 wide
  base/loot_gold, base/loot_crates, base/loot_coffee   loot piles     ~1.1 x 0.9 each
  base/grog              grog barrel                                  r 0.34
  base/catbed            the cat bed 'ADMIRAL' (no cat)               r 0.36 (+ bowl)
  base/rug               red rug with a gold skull (floor decal)      2.0 x 3.2
  base/pod_closed, base/pod_open, base/pod_launched   the escape pod  1.6 wide x 1.5 deep (back panel against the wall)
  base/stencil_right, base/stencil_knock   floor stencils (flat paint)
"""
import sys, os, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
os.environ.setdefault('DOCK_CPU', '1')                      # no usable GPU here
import bpy, bmesh
from mathutils import Vector
import docklib as D
from docklib import *
import shiplib

A = D.args()
QUICK = 'quick' in A
ONLY = None
for a in A:
    if a.startswith('only='): ONLY = set(a[5:].split(','))
mn.SAMPLES = 16 if QUICK else 48
if QUICK:
    mn.OUT_DIR = os.environ.get('MN_QUICK_DIR', '/tmp/mn_base'); mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')

# ---------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------
def wood(name, color, axis='x', k=7.0, grain=0.35, rough=0.62, seam=0.75, grime=0.9):
    """Painted-over old planks: grain bands, dark seams every 1/k along `axis` ('x', 'y', 'z' or 'ang' = barrel
    staves around Z), AO grime in the cracks."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    if axis == 'ang':
        at = N.new('ShaderNodeMath'); at.operation = 'ARCTAN2'; L(sep.outputs['Y'], at.inputs[0]); L(sep.outputs['X'], at.inputs[1])
        coord = at.outputs[0]; kk = k / math.tau
    else:
        coord = sep.outputs['XYZ'.index(axis.upper())]; kk = k
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = kk; L(coord, mu.inputs[0])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L(mu.outputs[0], fr.inputs[0])
    sm = N.new('ShaderNodeMapRange'); sm.inputs['From Min'].default_value = 0.9; sm.inputs['From Max'].default_value = 0.97
    sm.inputs['To Max'].default_value = seam; L(fr.outputs[0], sm.inputs['Value'])
    # per-plank shade
    fl = N.new('ShaderNodeMath'); fl.operation = 'FLOOR'; L(mu.outputs[0], fl.inputs[0])
    wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '1D'; L(fl.outputs[0], wn.inputs['W'])
    pk = N.new('ShaderNodeMapRange'); pk.inputs['To Min'].default_value = 0.78; pk.inputs['To Max'].default_value = 1.12; L(wn.outputs['Value'], pk.inputs['Value'])
    wave = N.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 6.0; wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 3; L(tc.outputs['Object'], wave.inputs['Vector'])
    gr = N.new('ShaderNodeMapRange'); gr.inputs['To Min'].default_value = 1.0; gr.inputs['To Max'].default_value = 1.0 - grain; L(wave.outputs['Fac'], gr.inputs['Value'])
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color), 1)
    c1 = N.new('ShaderNodeVectorMath'); c1.operation = 'SCALE'; L(rgb.outputs[0], c1.inputs[0]); L(pk.outputs[0], c1.inputs['Scale'])
    c2 = N.new('ShaderNodeVectorMath'); c2.operation = 'SCALE'; L(c1.outputs[0], c2.inputs[0]); L(gr.outputs[0], c2.inputs['Scale'])
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.1; ao.samples = 8
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; L(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY_ADD'; aok.inputs[1].default_value = 0.7 * grime; L(aoi.outputs[0], aok.inputs[0]); L(sm.outputs[0], aok.inputs[2])
    cl = N.new('ShaderNodeMath'); cl.operation = 'MINIMUM'; cl.inputs[1].default_value = 0.9; L(aok.outputs[0], cl.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; L(cl.outputs[0], mx.inputs['Factor'])
    L(c2.outputs[0], mx.inputs[6]); mx.inputs[7].default_value = (0.08, 0.05, 0.035, 1)
    L(mx.outputs[2], b.inputs['Base Color'])
    return m

def paint(name, color, alpha=0.9, scale=14.0, rough=0.7):
    """Spray-stencil paint on the floor: the colour, worn through in noisy patches (see-through there)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); L = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (*lift(color, 1.2), 1); d.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = scale; no.inputs['Detail'].default_value = 8
    L(tc.outputs['Object'], no.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.36; mr.inputs['From Max'].default_value = 0.5; mr.inputs['To Max'].default_value = alpha
    L(no.outputs['Fac'], mr.inputs['Value'])
    L(mr.outputs[0], mix.inputs[0]); L(tr.outputs[0], mix.inputs[1]); L(d.outputs[0], mix.inputs[2]); L(mix.outputs[0], out.inputs['Surface'])
    return m

def mats():
    M = dict(
        dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9), ink=pmat('ink', '#1a1b20', 0.6),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.3, grime=0.7), iron=worn('iron', '#4c5260', 0.45, 0.7, wear=0.5, grime=0.8, rust=0.25),
        rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5), hull2=worn('hull2', '#3a3036', 0.5, 0.3, wear=0.6, rust=0.12),
        panel=worn('panel', '#6a4a44', 0.5, 0.3, wear=0.7, rust=0.2), panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15),
        tape=pmat('tape', '#c4c7cc', 0.85, grime=0.3, grime_scale=30), hazard=stripes_mat('hazard'),
        paper=worn('paper', '#ece2c4', 0.85, 0.0, wear=0.0, grime=0.7, scale=3), paper2=worn('paper2', '#d8cfae', 0.85, 0.0, wear=0.0, grime=1.0, scale=3),
        sticker=pmat('sticker', '#f2df6b', 0.6), white=worn('white', '#e4e2da', 0.5, 0.0, wear=0.3, grime=0.6),
        gold=worn('gold', '#f0bc34', 0.3, 0.75, wear=0.25, grime=0.45), gold2=worn('gold2', '#d89a24', 0.36, 0.7, wear=0.3, grime=0.6),
        coin=pmat('coin', '#ffc640', 0.28, 0.85), leather=worn('leather', '#a8242a', 0.42, 0.0, wear=0.6, grime=0.75),
        leather_d=worn('leather_d', '#5a1418', 0.5, 0.0, wear=0.4, grime=0.6),
        red=worn('red', '#c0322e', 0.45, 0.1, wear=0.7, grime=0.7), redp=pmat('redp', '#e2574c', 0.5),
        wood=wood('wood', '#8a5230', 'x', 6.0), wood_y=wood('wood_y', '#8a5230', 'y', 6.0), wood_z=wood('wood_z', '#7a4a2a', 'z', 5.0),
        wood_d=wood('wood_d', '#5a3420', 'x', 5.0), staves=wood('staves', '#8a5634', 'ang', 16.0, grain=0.3),
        crate=wood('crate', '#9a7048', 'x', 5.0), crate_z=wood('crate_z', '#9a7048', 'z', 4.0),
        bone=worn('bone', '#e6dcbe', 0.6, 0.0, wear=0.1, grime=1.1), bone_g=worn('bone_g', '#a8d07a', 0.55, 0.0, wear=0.1, grime=1.1),
        rubber=pmat('rubber', '#262a33', 0.7), glass=mn.mat('glass', '#24303c', 0.06, 0.0, clearcoat=1.0),
        mug=worn('mug', '#dcd8cc', 0.4, 0.0, wear=0.4), pewter=worn('pewter', '#8a909a', 0.35, 0.8, wear=0.3, grime=0.8),
        copper=worn('copper', '#c08a4a', 0.35, 0.9, wear=0.3, rust=0.15), cable_r=pmat('cable_r', '#b8382e', 0.5), cable_b=pmat('cable_b', '#3a5a8e', 0.5),
        grog=mn.mat('grogl', '#3a1c0a', 0.12, 0.0, clearcoat=1.0), puddle=decal_mat('puddle', '#2a1406', 0.85, 7.0, rough=0.1),
        soot=decal_mat('soot', '#060505', 0.9, 4.0), oil=decal_mat('oil', '#0a0908', 0.8, 6.0, rough=0.15),
        green_led=emit_mat('green_led', '#5aff9a', 1.3, base='#2a7a4a'), red_led=emit_mat('red_led', '#ff3a2a', 1.4, base='#6a1a14'),
        amber_led=emit_mat('amber_led', '#ffb43a', 1.2, base='#7a5a1a'), lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2),
        warm=emit_mat('warm', '#ffcf8a', 1.0, base='#ffe0b0'),
    )
    D.M_DARK[0] = M['black']
    return M

# ---------------------------------------------------------------------------------------------------
# Helpers (u right, v down the screen / towards the camera, z up; origin = the sprite's game point)
# ---------------------------------------------------------------------------------------------------
NO_OUTLINE = ('n_', 'rivet', 'frv', 'skull', 'jaw', 'bone', 'eye', 'stain', 'tape')

def txt(body, u, v, z, size, m, face=False, rotz=0.0):
    return text('n_txt', body, u, v, z, size, m, face=face, rotz=rotz)

def ftape(u, v, z, l, m, rot_y=0.0, w=0.08):
    """A strip of duct tape on a camera-facing surface (plane at v), tilted by rot_y."""
    o = mn.box('n_tape', (l, 0.012, w), loc=(0, 0, 0), m=m, bevel=0.003); o.location = P(u, v, z); o.rotation_euler = (0, rot_y, 0)
    return o

def ttape(u, v, z, l, m, rotz=0.0, w=0.08):
    """A strip of duct tape lying on a top surface at height z."""
    return cbox('n_tape', u, v, l, w, z, 0.008, m, bevel=0.002, rotz=rotz)

def skull3d(u, v, z, s, m, out, eyes=None, alien=False):
    """A chunky toy skull facing the camera (+v), centre of the cranium at (u, v, z), size s ~ its radius."""
    sc = (1.0, 0.95, 0.92) if not alien else (0.85, 1.05, 1.35)
    out.append(mn.sphere('skull_c', s, loc=P(u, v, z), m=m, scale=sc, segs=24))
    out.append(cbox('skull_jaw', u, v + 0.3 * s, 1.05 * s, 0.85 * s, z - 0.95 * s, 0.55 * s, m, bevel=0.25 * s))
    dk = eyes or M_['black']
    sockets = ((-0.38, 0.0), (0.38, 0.0)) if not alien else ((-0.36, 0.05), (0.36, 0.05), (0.0, 0.45))
    for su, sz in sockets:
        out.append(mn.sphere('n_eye', 0.27 * s, loc=P(u + su * s, v + (0.78 if not alien else 0.9) * s, z - 0.08 * s + sz * s), m=dk, scale=(1, 0.55, 1.15), segs=14))
    out.append(mn.sphere('n_nose', 0.11 * s, loc=P(u, v + 0.9 * s, z - 0.42 * s), m=dk, scale=(1, 0.5, 1.4), segs=10))
    for k in range(4):                                       # teeth: dark gaps on the jaw's front
        out.append(cbox('n_tooth', u - 0.3 * s + k * 0.2 * s, v + 0.73 * s, 0.025 * s, 0.03, z - 0.82 * s, 0.32 * s, dk, bevel=0))

def torus(name, R, r, u, v, z, m, segs=40, rsegs=14, sz=1.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = math.tau * i / segs; ring_ = []
        for j in range(rsegs):
            b = math.tau * j / rsegs
            ring_.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b) * sz)))
        rings.append(ring_)
    for i in range(segs):
        for j in range(rsegs):
            a, b_ = rings[i], rings[(i + 1) % segs]
            bm.faces.new((a[j], b_[j], b_[(j + 1) % rsegs], a[(j + 1) % rsegs]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(u, v, z); mn.assign(o, m); return mn.smooth(o)

def half_cyl(name, r, length, u, v, z, m, sz=1.0, verts=32, bevel=0.03):
    """The top half of a cylinder lying along u (a chest lid), axis at (u, v, z)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.radians(90), 3, 'Y'))
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    for vv in bm.verts: vv.co.z *= sz
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(u, v, z)
    if bevel: mn.bev(o, bevel)
    mn.assign(o, m); return mn.smooth(o)

def dome(name, r, u, v, z, m, sz=1.0, segs=32):
    """The top half of a sphere (closed at the bottom), base centre at (u, v, z)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    for vv in bm.verts: vv.co.z *= sz
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(u, v, z); mn.assign(o, m); return mn.smooth(o)

def coin_pile(u, v, z, r, n, out, rng, h=0.45, spread=1.8, sv=0.9):
    """A heap of gold: a lumpy mound covered in coins, a few spilled around it."""
    M = M_
    out.append(mn.sphere('pile', r, loc=P(u, v, z), m=M['gold2'], scale=(1, sv, h), segs=24))
    for _ in range(int(n * 0.7)):                            # coins on the mound
        a = rng.uniform(0, math.tau); d = math.sqrt(rng.random()) * r * 0.95
        cu, cv = u + d * math.cos(a), v + d * math.sin(a) * sv
        cz = z + h * r * math.sqrt(max(0.0, 1 - (d / r) ** 2)) - 0.01
        c = mn.cyl('n_coin', 0.055, 0.016, loc=P(cu, cv, cz), m=M['coin'], verts=14, bevel=0.005)
        c.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0); out.append(c)
    for _ in range(n - int(n * 0.7)):                        # spilled
        a = rng.uniform(0, math.tau); d = rng.uniform(r * 1.0, r * spread)
        c = mn.cyl('n_coin', 0.055, 0.016, loc=P(u + d * math.cos(a), v + d * math.sin(a), 0.0), m=M['coin'], verts=14, bevel=0.005)
        c.rotation_euler = (rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0); out.append(c)

def crate(u, v, w, d, h, out, lbl=None, m=None, z0=0.0, rotz=0.0, lbl_m=None):
    M = M_
    out.append(cbox('crate', u, v, w, d, z0, h, m or M['crate'], bevel=0.03, rotz=rotz))
    for zz in (0.18, 0.75):
        out.append(cbox('crate_band', u, v, w + 0.02, d + 0.02, z0 + h * zz, 0.05, M['iron'], bevel=0.01, rotz=rotz))
    for su in (-1, 1):
        for sv in (-1, 1):
            out.append(cbox('crate_corner', u + su * (w / 2 - 0.03) * math.cos(rotz) - sv * (d / 2 - 0.03) * math.sin(rotz),
                            v + su * (w / 2 - 0.03) * math.sin(rotz) + sv * (d / 2 - 0.03) * math.cos(rotz), 0.09, 0.09, z0, h + 0.01, M['iron'], bevel=0.015, rotz=rotz))
    if lbl:
        t = txt(lbl, u - math.sin(rotz) * (d / 2 + 0.01), v + math.cos(rotz) * (d / 2 + 0.01), z0 + h * 0.47, 0.1, lbl_m or M['white'], face=True)
        t.rotation_euler.z = -rotz; out.append(t)

def goblet(u, v, z, s, out, m=None):
    m = m or M_['gold']
    out.append(ucyl('goblet_foot', 0.07 * s, 0.025 * s, u, v, z, m, verts=16, bevel=0.008))
    out.append(ucyl('goblet_stem', 0.022 * s, 0.12 * s, u, v, z, m, verts=10, bevel=0.005))
    out.append(mn.cyl('goblet_cup', 0.075 * s, 0.11 * s, loc=P(u, v, z + 0.12 * s), m=m, verts=18, bevel=0.02))
    out.append(ucyl('n_goblet_in', 0.06 * s, 0.005, u, v, z + 0.225 * s, M_['dark'], verts=16, bevel=0))

def gem(u, v, z, s, color, out):
    m = emit_mat('gem' + color, color, 0.35, base=color)
    o = mn.sphere('gem', s, loc=P(u, v, z), m=m, scale=(1, 1, 0.75), segs=6); out.append(o)

def mug(u, v, z, out, m=None, r=0.065, h=0.13, handle=True):
    M = M_
    out.append(ucyl('mug', r, h, u, v, z, m or M['mug'], verts=16, bevel=0.012))
    out.append(ucyl('n_mug_in', r * 0.78, 0.006, u, v, z + h - 0.012, M['grog'], verts=14, bevel=0))
    if handle:
        o = D.ring('mug_h', r * 0.6, 0.02, 0.025, loc=P(u + r * 1.05, v, z + h * 0.5), m=m or M['mug'], rot=(R90, 0, 0), verts=16); out.append(o)

CATCHERS = []      # shadow catchers of the current sprite: framed too, so the shadow isn't cut off at the canvas edge

def floor_shadow(w, d, loc=(0, 0)):
    CATCHERS.append(shiplib.shadow_catcher((w, d), loc=(loc[0], -loc[1], 0)))

def wall_shadow(w, h, z0=0.0):
    """Invisible plane on the wall face catching the hung thing's shadow."""
    o = mn.box('wall_catcher', (w, 0.001, h), loc=(0, 0.0015, z0), bevel=0)
    o.is_shadow_catcher = True; shiplib._hidden_in_data.append(o); CATCHERS.append(o)

def finish(name, out, frames=None, thick=0.013):
    objs = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    mn.outline([o for o in objs if not o.name.startswith(NO_OUTLINE)], thickness=thick)
    return mn.render('base/' + name, objs=objs + [shadow_frame(objs)], frames=frames)

def shadow_frame(objs):
    """An unrendered point cloud that widens the framing so the cast shadow (falling up and to the left, i.e. -X, +Y
    and up the wall) isn't cut off at the canvas edge; clamped to the shadow catchers so it adds no empty margin."""
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    olo = [min(p[i] for p in pts) for i in range(3)]; ohi = [max(p[i] for p in pts) for i in range(3)]
    m = 0.15 + 0.75 * max(ohi[2], 0.0)
    lo = [olo[0] - m, olo[1] - 0.1, olo[2]]; hi = [ohi[0] + 0.1, ohi[1] + m, ohi[2] + m]
    if CATCHERS:      # never past the catchers (no shadow there), never inside the model's own bounds
        cp = [c.matrix_world @ Vector(v) for c in CATCHERS for v in c.bound_box]
        clo = [min(p[i] for p in cp) for i in range(3)]; chi = [max(p[i] for p in cp) for i in range(3)]
        lo = [max(lo[i], min(clo[i], olo[i])) for i in range(3)]; hi = [min(hi[i], max(chi[i], ohi[i])) for i in range(3)]
    me = bpy.data.meshes.new('shadow_frame')
    me.from_pydata([(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])], [], [])
    o = bpy.data.objects.new('shadow_frame', me); bpy.context.scene.collection.objects.link(o); o.hide_render = True
    return o

M_ = {}
JOBS = []
def job(name):
    def deco(fn): JOBS.append((name, fn)); return fn
    return deco

# ---------------------------------------------------------------------------------------------------
# The throne: a pilot seat ripped out of some cockpit, bolted onto a dais (footprint 2.0 x 1.4)
# ---------------------------------------------------------------------------------------------------
@job('throne')
def throne_job():
    M = M_; out = []; rng = random.Random(3)
    W, Dp = 2.0, 1.4
    out.append(cbox('dais', 0, 0, W, Dp, 0, 0.16, M['hull2'], bevel=0.035))
    out.append(cbox('dais_step', 0, Dp / 2 - 0.12, 1.3, 0.34, 0, 0.08, M['iron'], bevel=0.02))
    out.append(cbox('n_dais_hz', 0, Dp / 2 - 0.035, W - 0.1, 0.05, 0.16, 0.006, M['hazard'], bevel=0.002))
    for su in (-1, 1):
        for sv in (-1, 1): out.append(rivet(su * (W / 2 - 0.09), sv * (Dp / 2 - 0.1), 0.16, M['steel'], 0.03))
    out.append(txt('PILOT SEAT  (NOW THRONE)', 0, Dp / 2 + 0.006, 0.115, 0.055, M['sticker'], face=True))
    out.append(txt('BOW BEFORE YE CAPTAIN', 0, Dp / 2 - 0.12 + 0.17 + 0.005, 0.04, 0.045, M['white'], face=True))
    # swivel post, frame, pistons, ripped-out cables
    cv = -0.12
    out.append(ucyl('post', 0.13, 0.28, 0, cv, 0.16, M['steel'], verts=20))
    out.append(ucyl('post_foot', 0.3, 0.05, 0, cv, 0.16, M['iron'], verts=24))
    out.append(cbox('frame', 0, cv, 0.95, 0.85, 0.4, 0.1, M['dark'], bevel=0.03))
    for su in (-1, 1):
        out.append(D.pipe_uv('piston', [(su * 0.3, cv - 0.36, 0.2), (su * 0.33, cv - 0.5, 0.9)], 0.035, M['steel'], corner=0.0))
        out.append(ucyl('piston_foot', 0.06, 0.04, su * 0.3, cv - 0.36, 0.16, M['iron'], verts=12))
    for k, (c, du) in enumerate(((M['cable_r'], -0.2), (M['cable_b'], 0.05), (M['copper'], 0.22))):
        out.append(D.pipe_uv('cable', [(du, cv + 0.1, 0.42), (du + 0.08, cv + 0.32, 0.3), (du + 0.25 - 0.2 * k, cv + 0.48, 0.17)], 0.022, c, corner=0.12))
    out.append(cbox('n_cable_end', 0.47, cv + 0.48, 0.05, 0.05, 0.16, 0.03, M['copper'], bevel=0.01))
    # seat
    out.append(cbox('cushion', 0, cv + 0.02, 0.82, 0.78, 0.5, 0.17, M['leather'], bevel=0.07))
    for i in range(3):                                       # tufted: gold studs in a diamond grid on the cushion and the back
        for j in range(3):
            out.append(mn.sphere('n_stud', 0.022, loc=P(-0.24 + i * 0.24, cv - 0.2 + j * 0.22, 0.665), m=M['gold'], scale=(1, 1, 0.6), segs=8))
    for i in range(4):
        for z in (0.78, 1.62):
            out.append(mn.sphere('n_stud', 0.02, loc=P(-0.3 + i * 0.2, cv - 0.42 + 0.125, z), m=M['gold'], segs=8))
    out.append(ttape(0.24, cv + 0.18, 0.668, 0.26, M['tape'], rotz=0.5))
    out.append(ttape(0.24, cv + 0.18, 0.672, 0.24, M['tape'], rotz=-0.6))
    BV = cv - 0.42
    out.append(cbox('back', 0, BV, 0.9, 0.24, 0.5, 1.2, M['leather'], bevel=0.09))
    for su in (-1, 1):
        out.append(cbox('bolster', su * 0.5, BV + 0.06, 0.16, 0.34, 0.55, 0.95, M['leather'], bevel=0.07))
        out.append(cbox('arm', su * 0.54, cv + 0.02, 0.18, 0.78, 0.66, 0.1, M['gold'], bevel=0.035))
        out.append(cbox('arm_post', su * 0.54, cv + 0.3, 0.1, 0.1, 0.45, 0.22, M['iron'], bevel=0.02))
        out.append(mn.sphere('arm_knob', 0.085, loc=P(su * 0.54, cv + 0.42, 0.76), m=M['gold'], segs=16))
        out.append(cbox('strap', su * 0.33, BV + 0.125, 0.11, 0.03, 0.75, 0.88, M['dark'], bevel=0.008))
    out.append(cbox('buckle', 0, BV + 0.14, 0.2, 0.03, 0.85, 0.12, M['steel'], bevel=0.015))
    # gold trim and the headrest with its fins
    out.append(cbox('trim', 0, BV, 0.96, 0.28, 1.68, 0.06, M['gold'], bevel=0.025))
    out.append(cbox('head', 0, BV - 0.02, 0.62, 0.26, 1.72, 0.3, M['leather'], bevel=0.09))
    for su in (-1, 1):
        f = mn.box('fin', (0.5, 0.07, 0.11), loc=(0, 0, 0), m=M['gold'], bevel=0.03)
        f.location = P(su * 0.48, BV - 0.02, 1.9); f.rotation_euler = (0, -su * 0.55, 0); out.append(f)
    skull3d(0, BV + 0.08, 1.88, 0.15, M['bone'], out)
    # gold skull & crossbones on the back cushion
    D.skull(0, BV + 0.122, 1.28, 0.55, M['gold'], out, face=True)
    # left arm: the old flight stick, taped; right arm: a tankard of grog in a cup holder
    out.append(ucyl('stick', 0.03, 0.2, -0.54, cv + 0.2, 0.76, M['dark'], verts=12))
    out.append(mn.sphere('stick_top', 0.05, loc=P(-0.54, cv + 0.2, 0.98), m=M['black'], scale=(1, 1, 1.4), segs=14))
    out.append(mn.sphere('n_stick_btn', 0.022, loc=P(-0.54, cv + 0.24, 1.03), m=M['red_led'], segs=10))
    out.append(ucyl('n_tape_stick', 0.04, 0.05, -0.54, cv + 0.2, 0.83, M['tape'], verts=12, bevel=0.005))
    out.append(ucyl('cupholder', 0.08, 0.04, 0.54, cv + 0.2, 0.76, M['iron'], verts=16))
    mug(0.54, cv + 0.2, 0.78, out, m=M['pewter'], r=0.06, h=0.14)
    # dais clutter: coins, a bone, a sticky note
    for _ in range(6):
        a = rng.uniform(-0.9, 0.9); b = rng.uniform(0.2, 0.55)
        c = mn.cyl('n_coin', 0.05, 0.015, loc=P(a, b, 0.16), m=M['coin'], verts=14, bevel=0.005); out.append(c)
    out.append(cbox('n_note', 0.75, -0.45, 0.16, 0.16, 0.16, 0.004, M['sticker'], bevel=0, rotz=0.3))
    out.append(txt('MINE', 0.75, -0.45, 0.166, 0.05, M['ink'], rotz=0.3))
    floor_shadow(3.0, 2.6)
    finish('throne', out)

# ---------------------------------------------------------------------------------------------------
# The desk (2.4 x 1.0, top at 0.8) and the same desk kicked over as cover (2.4 x 0.8)
# ---------------------------------------------------------------------------------------------------
DW, DD, DH = 2.4, 1.0, 0.8
def desk_body(out, M, toppled):
    rng = random.Random(7)
    # top: thick slab, gold trim, leather pad, coffee rings, carved initials, taped crack
    out.append(cbox('top', 0, 0, DW, DD, DH - 0.09, 0.09, M['wood_d'], bevel=0.03))
    out.append(cbox('top_trim', 0, 0, DW + 0.03, DD + 0.03, DH - 0.075, 0.04, M['gold'], bevel=0.015))
    out.append(cbox('pad', -0.2, 0.05, 1.1, 0.6, DH, 0.012, pmat('felt', '#2a5a44', 0.9), bevel=0.004))
    for su in (-1, 1):
        for sv in (-1, 1):
            out.append(cbox('n_pad_c', -0.2 + su * 0.5, 0.05 + sv * 0.25, 0.12, 0.12, DH + 0.012, 0.004, M['gold'], bevel=0, rotz=math.radians(45)))
    for (a, b, r) in ((0.65, 0.2, 0.07), (0.72, 0.28, 0.075), (-0.95, -0.25, 0.07)):
        out.append(D.ring('n_ring', r, 0.012, 0.002, loc=P(a, b, DH + 0.001), m=pmat('coffee', '#3a2414', 0.4), verts=24))
    out.append(txt('R.C. WOZ ERE', 0.75, -0.3, DH + 0.001, 0.05, pmat('carve', '#2a160c', 0.8), rotz=0.12))
    out.append(cbox('n_crack', -0.95, 0.22, 0.4, 0.015, DH, 0.003, M['black'], bevel=0, rotz=0.6))
    out.append(ttape(-0.95, 0.22, DH + 0.002, 0.2, M['tape'], rotz=-0.9))
    out.append(ttape(-0.92, 0.27, DH + 0.004, 0.2, M['tape'], rotz=-0.7))
    # two pedestals of drawers, a modesty panel with the gold nameplate
    for su in (-1, 1):
        pu = su * (DW / 2 - 0.32)
        out.append(cbox('ped', pu, 0, 0.6, DD - 0.06, 0, DH - 0.09, M['wood'], bevel=0.025))
        for k in range(3):
            z = 0.06 + k * 0.21
            out.append(cbox('drawer', pu, DD / 2 - 0.03, 0.52, 0.03, z, 0.18, M['wood_y'] if k % 2 else M['wood'], bevel=0.012))
            out.append(cbox('handle', pu, DD / 2 + 0.0, 0.16, 0.04, z + 0.07, 0.035, M['gold'], bevel=0.01))
    out.append(cbox('modesty', 0, DD / 2 - 0.12, DW - 1.2, 0.05, 0.12, DH - 0.24, M['wood_d'], bevel=0.015))
    out.append(cbox('plate', 0, DD / 2 - 0.09, 0.62, 0.02, 0.36, 0.14, M['gold'], bevel=0.008))
    out.append(txt("CAPT. R. COMET", 0, DD / 2 - 0.075, 0.43, 0.058, M['ink'], face=True))
    out.append(cbox('n_sticker', -0.35, DD / 2 - 0.09, 0.14, 0.01, 0.2, 0.08, M['sticker'], bevel=0))
    out.append(txt('NO\nREFUNDS', 0.32, DD / 2 - 0.09, 0.2, 0.035, M['white'], face=True))
    if toppled:   # scorch holes where his shots hit the top
        for k, (a, b) in enumerate(((-0.75, -0.25), (-0.2, 0.3), (0.35, -0.1), (0.95, 0.25), (0.6, 0.32))):
            out.append(D.disc('n_hole', a, b, DH + 0.018, 0.055, M['black']))
            out.append(D.ring('n_ember', 0.07, 0.022, 0.003, loc=P(a, b, DH + 0.016), m=emit_mat('ember', '#ff7a2a', 0.6, base='#5a2a10'), verts=20))
            out.append(D.disc('n_scorch', a, b, DH + 0.015, 0.17, M['soot']))
        out.append(txt('NICE TRY', -0.2, -0.3, DH + 0.004, 0.07, M['white'], rotz=-0.08))

def desk_items(out, M):
    """What stands on the upright desk (falls off when it's kicked over)."""
    # skull candle, wax drips
    skull3d(-0.9, -0.2, DH + 0.12, 0.1, M['bone'], out)
    out.append(ucyl('candle', 0.035, 0.12, -0.9, -0.22, DH + 0.2, M['white'], verts=12))
    out.append(mn.sphere('n_flame', 0.03, loc=P(-0.9, -0.22, DH + 0.35), m=M['warm'], scale=(1, 1, 1.8), segs=10))
    # papers, wanted posters stack, an in/out tray (OUT overflowing), a quill
    for k in range(4):
        out.append(cbox('n_paper', -0.25 + k * 0.03, 0.05 + k * 0.02, 0.3, 0.4, DH + 0.01 + k * 0.004, 0.003, M['paper'] if k % 2 else M['paper2'], bevel=0, rotz=0.15 * k - 0.2))
    out.append(txt('PLANS', -0.16, 0.12, DH + 0.03, 0.05, M['ink'], rotz=0.25))
    out.append(cbox('tray', 0.55, -0.25, 0.4, 0.3, DH, 0.08, M['iron'], bevel=0.01))
    for k in range(5): out.append(cbox('n_tray_p', 0.55, -0.25, 0.34, 0.25, DH + 0.06 + k * 0.012, 0.005, M['paper'], bevel=0, rotz=0.1 * (k - 2)))
    out.append(txt('OUT', 0.55, -0.1, DH + 0.04, 0.04, M['white'], face=True))
    mug(0.75, 0.25, DH, out, m=M['red'])
    out.append(txt('#1 CAPN', 0.75, 0.317, DH + 0.06, 0.025, M['white'], face=True))
    # a dagger stuck in the top
    out.append(cbox('dagger', 0.15, -0.3, 0.035, 0.05, DH - 0.02, 0.2, M['steel'], bevel=0.008))
    out.append(cbox('dagger_g', 0.15, -0.3, 0.16, 0.05, DH + 0.18, 0.03, M['gold'], bevel=0.008))
    out.append(cbox('dagger_h', 0.15, -0.3, 0.04, 0.05, DH + 0.21, 0.11, M['leather_d'], bevel=0.01))
    out.append(mn.sphere('dagger_p', 0.03, loc=P(0.15, -0.3, DH + 0.33), m=M['gold'], segs=10))
    # a model ship (his old one)
    out.append(cbox('model', -0.55, -0.3, 0.3, 0.12, DH, 0.08, M['red'], bevel=0.03))
    out.append(cbox('model_fin', -0.6, -0.3, 0.08, 0.03, DH + 0.06, 0.08, M['red'], bevel=0.01))
    coin_pile(1.0, -0.25, DH, 0.08, 6, out, random.Random(5), h=0.6, spread=1.5)

@job('desk')
def desk_job():
    M = M_; out = []
    desk_body(out, M, False); desk_items(out, M)
    floor_shadow(3.4, 2.2)
    finish('desk', out)

@job('desk_cover')
def desk_cover_job():
    M = M_; out = []; rng = random.Random(9)
    desk_body(out, M, True)
    root = mn.group('desk_root', [o for o in out if o.parent is None])
    # tipped forward onto its front edge: (y, z) -> (-z, y), then shifted: footprint v -0.4..0.4, height 1.0,
    # the top (with his shots' scorch marks) faces the camera, the pedestals stick out north
    root.rotation_euler = (math.radians(90), 0, 0); root.location = (0, 0.4, DD / 2)
    bpy.context.view_layer.update()
    # the pedestals' backs now face up: a stencil, tape, chewing gum
    out.append(txt('PROPERTY OF\nTHE CAPTAIN', -(DW / 2 - 0.32), -0.05, 0.975, 0.07, M['white']))
    out.append(ttape(DW / 2 - 0.32, -0.1, 0.975, 0.5, M['tape'], rotz=0.3))
    out.append(mn.sphere('n_gum', 0.03, loc=P(DW / 2 - 0.2, 0.15, 0.975), m=pmat('gum', '#ff7ab0', 0.4), scale=(1.2, 1, 0.4), segs=10))
    # what fell off: papers fanned out in front, the skull candle on its side, the mug, coins
    for k in range(9):    # each sheet a bit higher than the last: coplanar sheets z-fought into black wedges
        out.append(cbox('n_paper', rng.uniform(-1.3, 1.3), rng.uniform(0.5, 1.15), 0.26, 0.34, 0.002 + k * 0.003, 0.002, M['paper'] if rng.random() < 0.6 else M['paper2'], bevel=0, rotz=rng.uniform(0, 3)))
    sk = []; skull3d(0.0, 0.0, 0.1, 0.1, M['bone'], sk)
    g = mn.group('n_skg', sk, loc=P(-0.75, 0.62, 0.0)); g.rotation_euler = (0, 0.4, 0.6); out += sk
    c = ucyl('candle', 0.035, 0.12, 0, 0, 0, M['white'], verts=12); c.location = P(-0.5, 0.75, 0.035); c.rotation_euler = (0, R90, 0.3); out.append(c)
    m_ = []; mug(0, 0, 0, m_, m=M['red'])
    g2 = mn.group('n_mugg', m_, loc=P(0.85, 0.7, 0.065)); g2.rotation_euler = (R90, 0, 0.8); out += m_
    out.append(D.disc('n_spill', 0.95, 0.85, 0.003, 0.18, M['puddle'], sv=0.6))
    for _ in range(7):
        c = mn.cyl('n_coin', 0.05, 0.015, loc=P(rng.uniform(-1.2, 1.2), rng.uniform(0.45, 0.95), 0.0), m=M['coin'], verts=14, bevel=0.005); out.append(c)
    # one drawer slid out onto the floor
    out.append(cbox('drawer_out', 0.4, 0.75, 0.52, 0.4, 0.0, 0.14, M['wood'], bevel=0.015, rotz=0.4))
    out.append(cbox('n_drawer_in', 0.4, 0.75, 0.44, 0.32, 0.03, 0.12, M['dark'], bevel=0, rotz=0.4))
    floor_shadow(3.4, 2.6, (0, 0.3))
    finish('desk_cover', out)

# ---------------------------------------------------------------------------------------------------
# Treasure chest (1.4 x 0.9 cover): closed / open with the gold
# ---------------------------------------------------------------------------------------------------
CW, CD, CH = 1.4, 0.9, 0.58
def chest(open_):
    M = M_; out = []; rng = random.Random(4)
    out.append(cbox('chest', 0, 0, CW, CD, 0, CH, M['wood'], bevel=0.035))
    for su in (-1, 1):
        out.append(cbox('band', su * 0.42, 0, 0.09, CD + 0.03, 0, CH + 0.005, M['gold2'], bevel=0.015))
        for sv in (-1, 1): out.append(cbox('corner', su * (CW / 2 - 0.04), sv * (CD / 2 - 0.04), 0.12, 0.12, 0, CH + 0.01, M['iron'], bevel=0.02))
        out.append(cbox('handle_b', su * (CW / 2 + 0.01), 0, 0.03, 0.18, 0.32, 0.08, M['iron'], bevel=0.01))
    for k in range(4):
        out.append(face_rivet(-0.6 + k * 0.4, CD / 2, 0.08, M['steel'], 0.018))
    # front: lock plate, stencils, tape
    out.append(cbox('lockplate', 0, CD / 2 + 0.005, 0.2, 0.03, CH - 0.26, 0.24, M['gold'], bevel=0.012))
    out.append(txt('NOT\nTREASURE', -0.21, CD / 2 + 0.008, 0.25, 0.05, M['white'], face=True))
    out.append(ftape(0.26, CD / 2 + 0.012, 0.16, 0.24, M['tape'], 0.5))
    out.append(ftape(0.27, CD / 2 + 0.014, 0.16, 0.22, M['tape'], -0.45))
    lid = []
    hz = CH; hv = -CD / 2                                       # hinge: back top edge
    lid.append(half_cyl('lid', CD / 2, CW, 0, CD / 2, 0, M['wood_y'], sz=0.6, bevel=0.03))
    for su in (-1, 1):
        lid.append(half_cyl('lid_band', CD / 2 + 0.015, 0.1, su * 0.42, CD / 2, 0, M['gold2'], sz=0.62, bevel=0.012))
        lid.append(half_cyl('lid_end', CD / 2 + 0.01, 0.06, su * (CW / 2 - 0.03), CD / 2, 0, M['iron'], sz=0.62, bevel=0.012))
    sk = []
    D.skull(0, 0, 0, 0.32, M['gold'], sk, face=False)
    for o in sk:                                              # flat skull on the lid's top
        o.location.z += CD / 2 * 0.6 + 0.004; o.location.y -= CD / 2
    lid += sk
    if not open_:
        lid.append(cbox('hasp', 0, CD - 0.0, 0.12, 0.04, -0.2, 0.2, M['gold'], bevel=0.01))
        lid.append(D.ring('padlock_s', 0.06, 0.018, 0.02, loc=P(0, CD + 0.03, -0.22), m=M['steel'], rot=(R90, 0, 0), verts=16))
        lid.append(cbox('padlock', 0, CD + 0.035, 0.14, 0.06, -0.38, 0.13, M['iron'], bevel=0.02))
    g = mn.group('n_lid', lid, loc=P(0, hv, hz))
    if open_:
        g.rotation_euler = (math.radians(-112), 0, 0)
        # inside: a heap of gold, a crown, a goblet, gems, pearls over the rim
        out.append(cbox('n_inside', 0, 0, CW - 0.14, CD - 0.14, 0.2, CH - 0.21, M['dark'], bevel=0))
        coin_pile(0, 0.0, CH - 0.05, 0.6, 40, out, rng, h=0.32, spread=1.0, sv=0.6)
        for su, c in ((-0.45, '#e2242a'), (0.3, '#2a8aff'), (0.1, '#3aee6a')):
            gem(su, rng.uniform(-0.15, 0.15), CH + 0.12, 0.05, c, out)
        crown_u, crown_v, cz = 0.32, -0.08, CH + 0.12
        out.append(D.ring('crown', 0.12, 0.025, 0.1, loc=P(crown_u, crown_v, cz), m=M['gold'], verts=24))
        for k in range(6):
            a = k * math.tau / 6
            out.append(mn.sphere('crown_pt', 0.025, loc=P(crown_u + 0.11 * math.cos(a), crown_v + 0.11 * math.sin(a), cz + 0.12), m=M['gold'], scale=(1, 1, 1.6), segs=8))
        goblet(-0.4, -0.15, CH + 0.04, 1.1, out)
        for k in range(9):                                    # pearl string over the front rim
            t = k / 8
            out.append(mn.sphere('n_pearl', 0.026, loc=P(-0.1 + 0.4 * t, CD / 2 + 0.02 + 0.03 * math.sin(t * 3), CH + 0.02 - 0.22 * math.sin(t * math.pi)), m=M['white'], segs=10))
        coin_pile(0.5, CD / 2 + 0.3, 0.0, 0.12, 12, out, rng, h=0.5, spread=2.5)
    out += lid
    floor_shadow(2.4, 2.2)
    finish('chest_' + ('open' if open_ else 'closed'), out)

@job('chest_closed')
def chest_closed_job(): chest(False)
@job('chest_open')
def chest_open_job(): chest(True)

# ---------------------------------------------------------------------------------------------------
# The pillar (0.9 x 0.9, 1.85 tall)
# ---------------------------------------------------------------------------------------------------
@job('pillar')
def pillar_job():
    M = M_; out = []; H = 1.85
    out.append(cbox('foot', 0, 0, 0.9, 0.9, 0, 0.14, M['steel'], bevel=0.03))
    out.append(cbox('pillar', 0, 0, 0.72, 0.72, 0.1, H - 0.2, M['panel'], bevel=0.035))
    for su in (-1, 1):
        for sv in (-1, 1): out.append(cbox('corner', su * 0.36, sv * 0.36, 0.12, 0.12, 0.1, H - 0.2, M['hazard'], bevel=0.02))
    out.append(cbox('cap', 0, 0, 0.9, 0.9, H - 0.12, 0.12, M['steel'], bevel=0.03))
    out.append(cbox('cap_in', 0, 0, 0.6, 0.6, H - 0.005, 0.01, M['dark'], bevel=0))
    for k in range(3):                                       # cut cable bundle going up through the ceiling
        c = (M['cable_r'], M['cable_b'], M['copper'])[k]
        out.append(ucyl('cable_up', 0.035, 0.12, -0.12 + k * 0.12, -0.05, H, c, verts=10))
    for z in (0.3, 1.45):
        for k in range(4): out.append(face_rivet(-0.21 + k * 0.14, 0.36, z, M['steel'], 0.018))
    # panel seam, a hatch with a vent
    out.append(cbox('n_seam', 0, 0.362, 0.6, 0.008, 0.9, 0.012, M['black'], bevel=0))
    out.append(cbox('hatch', 0, 0.37, 0.4, 0.02, 0.98, 0.32, M['panel2'], bevel=0.01))
    for k in range(4): out.append(cbox('n_slot', 0, 0.382, 0.28, 0.008, 1.03 + k * 0.06, 0.025, M['dark'], bevel=0))
    # signage: LOAD BEARING (PROBABLY), the mutiny counter, a sticky note, tally marks
    out.append(cbox('sign', 0, 0.37, 0.5, 0.012, 0.6, 0.2, M['sticker'], bevel=0.004))
    out.append(txt('LOAD BEARING\n(PROBABLY)', 0, 0.378, 0.7, 0.055, M['ink'], face=True))
    out.append(cbox('mutiny', 0.0, 0.37, 0.5, 0.012, 0.18, 0.26, M['white'], bevel=0.004))
    out.append(txt('DAYS WITHOUT\nA MUTINY', 0.0, 0.378, 0.37, 0.036, M['ink'], face=True))
    out.append(cbox('mutiny_n', 0.0, 0.38, 0.12, 0.008, 0.21, 0.08, M['dark'], bevel=0))
    out.append(txt('0', 0.0, 0.386, 0.25, 0.06, M['red_led'], face=True))
    for k in range(5):
        t = mn.box('n_tally', (0.012, 0.004, 0.1), loc=P(0.12 + k * 0.025, 0.372, 1.45), m=M['white'], bevel=0); t.rotation_euler = (0, 0.9 if k == 4 else 0, 0)
        if k == 4: t.location = P(0.17, 0.372, 1.45); t.scale = (1, 1, 1.6)
        out.append(t)
    # a duct-tape band and a taped crack
    out.append(cbox('tape_band', 0, 0, 0.75, 0.75, 1.3, 0.08, M['tape'], bevel=0.01))
    out.append(ftape(-0.15, 0.372, 1.65, 0.28, M['tape'], 0.4))
    # copper pipe up one side with a valve, red lamp
    out.append(ucyl('pipe', 0.055, H - 0.25, 0.43, 0.1, 0.12, M['copper'], verts=14))
    out.append(D.ring('pipe_clamp', 0.07, 0.025, 0.05, loc=P(0.43, 0.1, 0.55), m=M['iron'], verts=14))
    out.append(D.ring('pipe_clamp', 0.07, 0.025, 0.05, loc=P(0.43, 0.1, 1.3), m=M['iron'], verts=14))
    out.append(ucyl('valve', 0.1, 0.03, 0.5, 0.1, 0.95, M['red'], axis='u', verts=16))
    out.append(ucyl('lampb', 0.06, 0.05, -0.2, 0.37, 1.7, M['dark'], axis='v', verts=14))
    out.append(mn.sphere('lamp', 0.05, loc=P(-0.2, 0.43, 1.725), m=M['red_led'], segs=12))
    floor_shadow(2.4, 2.4)
    finish('pillar', out)

# ---------------------------------------------------------------------------------------------------
# The map table (1.6 x 1.2, top 0.85): holo star chart, a red route to THEM (4 frames: the target pulses)
# ---------------------------------------------------------------------------------------------------
@job('map_table')
def map_table_job():
    M = M_; out = []; rng = random.Random(21); TW, TD, TZ = 1.6, 1.2, 0.85
    out.append(cbox('foot', 0, 0, 1.0, 0.7, 0, 0.08, M['iron'], bevel=0.02))
    out.append(cbox('column', 0, 0, 0.6, 0.4, 0.06, TZ - 0.16, M['hull2'], bevel=0.03))
    for k in range(3): out.append(cbox('n_vent', 0, 0.2, 0.4, 0.012, 0.3 + k * 0.08, 0.03, M['dark'], bevel=0))
    out.append(cbox('rim', 0, 0, TW, TD, TZ - 0.12, 0.12, M['wood_d'], bevel=0.035))
    out.append(cbox('rim_t', 0, 0, TW + 0.02, TD + 0.02, TZ - 0.04, 0.03, M['gold'], bevel=0.012))
    holo = emit_mat('holo', '#1a5a6e', 0.55, base='#06121a')
    out.append(cbox('n_screen', 0, 0, TW - 0.2, TD - 0.2, TZ - 0.02, 0.025, holo, bevel=0.004))
    grid = emit_mat('grid', '#3ab0d0', 0.6, base='#1a5a6a')
    for k in range(-3, 4): out.append(cbox('n_grid', k * 0.2, 0, 0.006, TD - 0.22, TZ + 0.006, 0.002, grid, bevel=0))
    for k in range(-2, 3): out.append(cbox('n_grid', 0, k * 0.2, TW - 0.22, 0.006, TZ + 0.006, 0.002, grid, bevel=0))
    dot = emit_mat('dot', '#a0f4ff', 1.3)
    for _ in range(22):
        out.append(ucyl('n_star', rng.uniform(0.012, 0.028), 0.004, rng.uniform(-0.65, 0.65), rng.uniform(-0.45, 0.45), TZ + 0.007, dot, verts=8, bevel=0))
    out.append(mn.sphere('n_planet', 0.07, loc=P(-0.25, -0.25, TZ + 0.02), m=emit_mat('planet', '#6ad08a', 0.7, base='#2a6a4a'), scale=(1, 1, 0.4), segs=16))
    D_route = emit_mat('route', '#ff4a3a', 1.3, base='#a02a20')
    pts = [(-0.55, 0.35), (-0.3, 0.12), (-0.05, 0.22), (0.2, -0.05), (0.45, -0.25)]
    for (a, b), (c, d) in zip(pts, pts[1:]):
        L = math.hypot(c - a, d - b); n = max(2, int(L / 0.07))
        for i in range(n):                                   # dashed
            t0 = i / n; t1 = (i + 0.55) / n
            x0, y0, x1, y1 = a + (c - a) * t0, b + (d - b) * t0, a + (c - a) * t1, b + (d - b) * t1
            out.append(cbox('n_route', (x0 + x1) / 2, (y0 + y1) / 2, math.hypot(x1 - x0, y1 - y0), 0.022, TZ + 0.009, 0.003, D_route, bevel=0, rotz=math.atan2(y1 - y0, x1 - x0)))
    for (a, b) in pts[1:-1]: out.append(ucyl('n_wp', 0.025, 0.004, a, b, TZ + 0.01, D_route, verts=12, bevel=0))
    # our marker: a little skull flag at the start
    D.skull(-0.55, 0.35, TZ + 0.012, 0.12, M['white'], out, face=False)
    out.append(txt('US', -0.55, 0.47, TZ + 0.012, 0.05, M['white']))
    tgt = emit_mat('target', '#ff3a2a', 1.4, base='#a01a10')
    tu, tv = 0.45, -0.25
    out.append(D.ring('n_target', 0.1, 0.018, 0.004, loc=P(tu, tv, TZ + 0.01), m=tgt, verts=32))
    out.append(D.ring('n_target2', 0.16, 0.012, 0.004, loc=P(tu, tv, TZ + 0.01), m=tgt, verts=32))
    out.append(txt('THEM', tu, tv - 0.24, TZ + 0.012, 0.09, tgt))
    # a dagger stuck right into THEM, a brass divider, a mug, a sticky note, a curling paper chart
    out.append(cbox('dagger', tu + 0.02, tv, 0.03, 0.05, TZ - 0.02, 0.18, M['steel'], bevel=0.008))
    out.append(cbox('dagger_g', tu + 0.02, tv, 0.15, 0.05, TZ + 0.16, 0.03, M['gold'], bevel=0.008))
    out.append(cbox('dagger_h', tu + 0.02, tv, 0.04, 0.05, TZ + 0.19, 0.11, M['leather_d'], bevel=0.01))
    out.append(mn.sphere('dagger_p', 0.03, loc=P(tu + 0.02, tv, TZ + 0.31), m=M['gold'], segs=10))
    for a in (-0.3, 0.3):
        o = mn.box('divider', (0.02, 0.32, 0.015), loc=(0, 0, 0), m=M['gold'], bevel=0.005); o.location = P(-0.1 + a * 0.2, -0.38 + 0.1, TZ + 0.012); o.rotation_euler = (0, 0, a); out.append(o)
    mug(0.62, 0.42, TZ - 0.04, out)
    out.append(cbox('n_note', 0.15, 0.4, 0.16, 0.16, TZ + 0.01, 0.004, M['sticker'], bevel=0, rotz=-0.2))
    out.append(txt('GET\nTHEM!!', 0.15, 0.4, TZ + 0.016, 0.04, M['ink'], rotz=-0.2))
    chart = mn.box('chart', (0.5, 0.35, 0.01), loc=(0, 0, 0), m=M['paper2'], bevel=0.004)
    chart.modifiers.new('roll', 'SIMPLE_DEFORM').deform_method = 'BEND'
    chart.location = P(-0.72, -0.5, TZ - 0.04); chart.rotation_euler = (0.1, 0, 0.4); out.append(chart)
    out.append(txt('NAV-PAD 2000', 0, TD / 2 + 0.006, TZ - 0.07, 0.045, M['gold'], face=True))
    floor_shadow(2.6, 2.2)
    # pulse: the target rings and the THEM label breathe
    nodes = tgt.node_tree.nodes['Principled BSDF']
    FR = [1, 2, 3, 4]
    for i, f in enumerate(FR):
        k = (1.5, 1.0, 0.55, 1.0)[i]
        nodes.inputs['Emission Strength'].default_value = k; nodes.inputs['Emission Strength'].keyframe_insert('default_value', frame=f)
    finish('map_table', out, frames=FR)

# ---------------------------------------------------------------------------------------------------
# Wall pieces (origin on the wall face at floor level; they hang at their real height)
# ---------------------------------------------------------------------------------------------------
def hang(out, z1, tilt):
    """Lean a wall piece back (top against the wall at z1, bottom out) so its face turns up towards the camera."""
    g = mn.group('n_hang', [o for o in out if o.parent is None], loc=(0, 0, z1))
    for o in out:
        if o.parent is g: o.location.z -= z1
    g.rotation_euler = (math.radians(-tilt), 0, 0)
    bpy.context.view_layer.update()

@job('portrait')
def portrait_job():
    """The self-portrait: a heroic bust in a gold frame, torn and duct-taped back together, 'by me'."""
    M = M_; out = []; z0, z1, W = 0.62, 1.5, 1.15
    zc = (z0 + z1) / 2
    out.append(ubox('frame', -W / 2, 0, W / 2, 0.08, z0, z1, M['gold'], bevel=0.035))
    out.append(ubox('n_canvas', -W / 2 + 0.1, 0.07, W / 2 - 0.1, 0.085, z0 + 0.1, z1 - 0.1, worn('canvas', '#28304a', 0.9, 0.0, grime=0.6, scale=2), bevel=0.003))
    for su in (-1, 1):
        for zz in (z0 + 0.04, z1 - 0.04): out.append(mn.sphere('frame_knob', 0.055, loc=P(su * (W / 2 - 0.04), 0.08, zz), m=M['gold'], segs=12))
    F = 0.085
    out.append(mn.sphere('n_p_neb', 0.2, loc=P(0.25, F, z1 - 0.28), m=emit_mat('neb', '#7a3a9a', 0.35, base='#4a2a6a'), scale=(1.1, 0.03, 0.6), segs=16))
    for k in range(5): out.append(mn.sphere('n_p_star', 0.014, loc=P(-0.38 + k * 0.17, F + 0.003, z1 - 0.16 - 0.04 * (k % 3)), m=emit_mat('pst', '#fff4c0', 1.0), segs=6))
    coat = worn('coatp', '#d0302c', 0.6, 0.0, wear=0.2, grime=0.4)
    out.append(mn.sphere('p_coat', 0.34, loc=P(0, F - 0.005, z0 + 0.1), m=coat, scale=(1.05, 0.1, 0.6), segs=20))
    for su in (-1, 1): out.append(mn.sphere('p_epaulet', 0.08, loc=P(su * 0.27, F + 0.02, z0 + 0.27), m=M['gold'], scale=(1.3, 0.3, 0.6), segs=12))
    out.append(cbox('p_coat_t', 0, F + 0.025, 0.05, 0.02, z0 + 0.1, 0.2, M['gold'], bevel=0.005))
    out.append(mn.sphere('p_face', 0.13, loc=P(0, F + 0.01, zc + 0.02), m=pmat('skinp', '#f0bc94', 0.6), scale=(1, 0.25, 1.05), segs=18))
    out.append(mn.sphere('p_beard', 0.14, loc=P(0, F + 0.02, zc - 0.1), m=pmat('beardp', '#ee5020', 0.9), scale=(1.1, 0.25, 0.85), segs=18))
    out.append(cbox('p_eyepatch', 0.05, F + 0.048, 0.07, 0.01, zc + 0.03, 0.055, M['black'], bevel=0.01))
    st = mn.box('n_p_strap', (0.28, 0.01, 0.014), loc=(0, 0, 0), m=M['black'], bevel=0); st.location = P(0, F + 0.044, zc + 0.07); st.rotation_euler = (0, 0.35, 0); out.append(st)
    out.append(mn.sphere('n_p_eye', 0.017, loc=P(-0.05, F + 0.045, zc + 0.055), m=M['black'], segs=8))
    out.append(cbox('n_p_smile', -0.01, F + 0.05, 0.08, 0.01, zc - 0.07, 0.014, M['white'], bevel=0))
    out.append(cbox('p_hat', 0, F + 0.01, 0.5, 0.03, zc + 0.13, 0.15, M['black'], bevel=0.035))
    out.append(cbox('p_hat_rim', 0, F + 0.02, 0.58, 0.03, zc + 0.12, 0.035, M['gold'], bevel=0.012))
    D.skull(0, F + 0.04, zc + 0.215, 0.14, M['white'], out, face=True)
    # signature, the tear, the duct tape holding it all together
    out.append(txt('by me', 0.33, F + 0.003, z0 + 0.15, 0.045, M['white'], face=True))
    tr = mn.box('n_tear', (0.36, 0.004, 0.016), loc=(0, 0, 0), m=M['black'], bevel=0); tr.location = P(-0.24, F + 0.003, z0 + 0.42); tr.rotation_euler = (0, -0.7, 0); out.append(tr)
    out.append(ftape(-0.24, 0.1, z0 + 0.42, 0.36, M['tape'], -0.7, w=0.09))
    out.append(ftape(-W / 2 + 0.07, 0.095, z1 - 0.07, 0.32, M['tape'], 0.8, w=0.09))
    out.append(ftape(W / 2 - 0.08, 0.095, z0 + 0.07, 0.28, M['tape'], 0.75, w=0.09))
    out.append(ubox('plaque', -0.3, 0.07, 0.3, 0.1, z0 - 0.0, z0 + 0.09, M['gold'], bevel=0.01))
    out.append(txt('THE CAPTAIN (HANDSOME)', 0, 0.104, z0 + 0.045, 0.04, M['ink'], face=True))
    hang(out, z1, 22)
    wall_shadow(2.0, 1.6, 0.4)
    finish('portrait', out)

@job('wanted')
def wanted_job():
    """'WANTED: ONE SHIP CAT' (for the bed called ADMIRAL), pinned to the wall with a knife."""
    M = M_; out = []; z0, z1, W = 0.55, 1.5, 0.78
    paper = worn('wpaper', '#f0e2b4', 0.85, 0.0, wear=0.0, grime=0.6, scale=4)
    out.append(ubox('poster', -W / 2, 0.01, W / 2, 0.025, z0, z1, paper, bevel=0.004))
    curl = mn.box('curl', (0.17, 0.012, 0.17), loc=(0, 0, 0), m=paper, bevel=0.004)   # the bottom right corner curling off
    curl.location = P(W / 2 - 0.085, 0.07, z0 + 0.0); curl.rotation_euler = (math.radians(-40), 0, 0.3); out.append(curl)
    ink = pmat('pink', '#2a1810', 0.7)
    out.append(txt('WANTED', 0, 0.03, z1 - 0.13, 0.15, ink, face=True))
    out.append(cbox('n_rule', 0, 0.026, W - 0.14, 0.004, z1 - 0.23, 0.012, ink, bevel=0))
    cz = z1 - 0.46
    cat = pmat('catp', '#1e1c22', 0.7)
    out.append(mn.sphere('n_cat', 0.15, loc=P(0, 0.03, cz), m=cat, scale=(1.15, 0.1, 0.9), segs=18))
    for su in (-1, 1):
        e = mn.box('n_cat_ear', (0.1, 0.012, 0.1), loc=(0, 0, 0), m=cat, bevel=0); e.location = P(su * 0.1, 0.03, cz + 0.1); e.rotation_euler = (0, math.radians(45), 0); out.append(e)
        out.append(mn.sphere('n_cat_eye', 0.028, loc=P(su * 0.055, 0.045, cz + 0.015), m=emit_mat('cateye', '#e8e04a', 0.6, base='#c8c03a'), scale=(1, 0.3, 1.3), segs=10))
        for k in (-1, 1):
            w_ = mn.box('n_whisk', (0.12, 0.004, 0.006), loc=(0, 0, 0), m=cat, bevel=0); w_.location = P(su * 0.2, 0.03, cz - 0.03 + k * 0.025); w_.rotation_euler = (0, su * k * 0.15, 0); out.append(w_)
    out.append(txt('ONE SHIP CAT', 0, 0.03, z0 + 0.33, 0.075, ink, face=True))
    out.append(txt('REWARD 10,000 CR', 0, 0.03, z0 + 0.21, 0.055, pmat('wred', '#c02020', 0.6), face=True))
    out.append(txt('MUST LIKE CAPTAINS', 0, 0.03, z0 + 0.11, 0.036, ink, face=True))
    out.append(cbox('knife', 0, 0.07, 0.035, 0.14, z1 - 0.06, 0.03, M['steel'], bevel=0.006))
    out.append(cbox('knife_h', 0, 0.17, 0.055, 0.14, z1 - 0.075, 0.055, M['leather_d'], bevel=0.012))
    out.append(ftape(-W / 2 + 0.05, 0.03, z0 + 0.06, 0.2, M['tape'], 0.7))
    hang(out, z1, 14)
    wall_shadow(1.4, 1.4, 0.4)
    finish('wanted', out)

@job('trophies')
def trophies_job():
    M = M_; out = []; SZ = 0.95; W = 2.2
    out.append(ubox('shelf', -W / 2, 0, W / 2, 0.34, SZ - 0.06, SZ, M['wood'], bevel=0.015))
    out.append(ubox('shelf_lip', -W / 2, 0.32, W / 2, 0.35, SZ - 0.07, SZ + 0.02, M['gold'], bevel=0.008))
    for su in (-0.85, 0.85):
        b = mn.box('bracket', (0.05, 0.3, 0.3), loc=(0, 0, 0), m=M['iron'], bevel=0.01); b.location = P(su, 0.15, SZ - 0.36); out.append(b)
    # the space squid: a mounted head on a wooden shield, tentacles draping over the shelf
    sq = worn('squid', '#8a4aa0', 0.45, 0.0, wear=0.2, grime=0.7); sq2 = worn('squid2', '#c890d0', 0.5, 0.0, wear=0.1, grime=0.5)
    su_ = -0.55
    sh = mn.box('shield', (0.62, 0.05, 0.62), loc=(0, 0, 0), m=M['wood_d'], bevel=0.06); sh.location = P(su_, 0.025, SZ + 0.0); out.append(sh)
    out.append(mn.sphere('squid_head', 0.25, loc=P(su_, 0.2, SZ + 0.35), m=sq, scale=(0.9, 0.8, 1.15), segs=24))
    out.append(mn.sphere('squid_mantle', 0.14, loc=P(su_, 0.12, SZ + 0.6), m=sq, scale=(0.9, 0.8, 0.8), segs=16))
    for sx in (-1, 1):
        out.append(mn.sphere('squid_eye', 0.075, loc=P(su_ + sx * 0.12, 0.38, SZ + 0.38), m=pmat('sqeye', '#f2e8a0', 0.2), segs=14))
        out.append(mn.sphere('n_squid_pupil', 0.035, loc=P(su_ + sx * 0.12, 0.445, SZ + 0.38), m=M['black'], scale=(0.5, 0.5, 1.2), segs=10))
    for k in range(6):                                       # tentacles: curl down over the shelf edge
        x = su_ - 0.2 + k * 0.08; swing = (k - 2.5) * 0.04
        pts = [(x, 0.3, SZ + 0.2), (x + swing, 0.42, SZ + 0.04), (x + swing * 2, 0.42, SZ - 0.2), (x + swing * 2.6, 0.36, SZ - 0.36 - 0.05 * (k % 2))]
        o = D.pipe_uv('squid_t', pts, 0.035 - 0.003 * (k % 3), sq if k % 2 else sq2, corner=0.12); out.append(o)
        out.append(mn.sphere('squid_tip', 0.03, loc=P(*pts[-1]), m=sq2, segs=10))
    out.append(ubox('plq1', su_ - 0.22, 0.34, su_ + 0.22, 0.36, SZ - 0.055, SZ - 0.005, M['gold'], bevel=0.004))
    out.append(txt('GOT AWAY (MOSTLY)', su_, 0.362, SZ - 0.03, 0.028, M['ink'], face=True))
    # on the shelf: a skull, an alien skull, the golden duck on its plinth, a little cup
    skull3d(0.12, 0.17, SZ + 0.1, 0.1, M['bone'], out)
    skull3d(0.42, 0.17, SZ + 0.13, 0.1, M['bone_g'], out, alien=True)
    du = 0.82
    out.append(cbox('plinth', du, 0.17, 0.24, 0.2, SZ, 0.07, M['wood_d'], bevel=0.015))
    gold = M['gold']
    out.append(mn.sphere('duck_body', 0.13, loc=P(du, 0.17, SZ + 0.17), m=gold, scale=(1.25, 0.95, 0.8), segs=20))
    out.append(mn.sphere('duck_head', 0.08, loc=P(du - 0.06, 0.2, SZ + 0.32), m=gold, segs=16))
    out.append(mn.sphere('duck_beak', 0.04, loc=P(du - 0.13, 0.26, SZ + 0.31), m=M['redp'], scale=(1.4, 1.0, 0.5), segs=10))
    out.append(mn.sphere('duck_tail', 0.05, loc=P(du + 0.15, 0.17, SZ + 0.24), m=gold, scale=(1, 0.8, 1.2), segs=10))
    for sx in (-1, 1): out.append(mn.sphere('n_duck_eye', 0.013, loc=P(du - 0.06 + sx * 0.035, 0.27, SZ + 0.345), m=M['black'], segs=6))
    out.append(txt('EMPLOYEE\nOF THE MONTH', du, 0.271, SZ + 0.035, 0.018, M['gold'], face=True))
    goblet(0.62, 0.15, SZ, 0.9, out)
    for (a, l) in ((0.12, 'BOB'), (0.42, 'NOT BOB')):
        out.append(ubox('plq', a - 0.1, 0.34, a + 0.1, 0.36, SZ - 0.055, SZ - 0.005, M['gold'], bevel=0.004))
        out.append(txt(l, a, 0.362, SZ - 0.03, 0.03, M['ink'], face=True))
    # crossed cutlasses on the wall to the right, above the shelf
    for a in (0.6, -0.6):
        c = mn.box('cutlass', (0.6, 0.02, 0.04), loc=(0, 0, 0), m=M['steel'], bevel=0.008); c.location = P(0.45, 0.04, SZ + 0.42); c.rotation_euler = (0, a, 0); out.append(c)
        h = mn.box('cutlass_h', (0.14, 0.04, 0.05), loc=(0, 0, 0), m=M['gold'], bevel=0.01)
        h.location = P(0.45 - math.cos(a) * 0.32, 0.05, SZ + 0.42 + math.sin(a) * 0.32 - 0.025); h.rotation_euler = (0, a, 0); out.append(h)
    out.append(ftape(0.45, 0.065, SZ + 0.43, 0.14, M['tape'], 0.0))
    wall_shadow(2.8, 1.4, 0.4)
    finish('trophies', out)

# ---------------------------------------------------------------------------------------------------
# Loot piles (~1.1 x 0.9 each)
# ---------------------------------------------------------------------------------------------------
@job('loot_gold')
def loot_gold_job():
    M = M_; out = []; rng = random.Random(31)
    coin_pile(0, 0, 0, 0.45, 50, out, rng, h=0.6, spread=1.4)
    for k in range(3):                                       # a stack of gold bars
        out.append(cbox('bar', 0.38, -0.25 + 0.0, 0.26, 0.12, k * 0.075, 0.075, M['gold'], bevel=0.015, rotz=0.15 + 0.1 * (k % 2)))
    out.append(cbox('bar', 0.36, -0.12, 0.26, 0.12, 0.0, 0.075, M['gold'], bevel=0.015, rotz=0.1))
    goblet(-0.35, -0.2, 0.0, 1.3, out)
    gem(0.05, 0.1, 0.27, 0.05, '#e2242a', out); gem(-0.15, -0.05, 0.25, 0.045, '#2a8aff', out); gem(0.2, 0.05, 0.2, 0.04, '#3aee6a', out)
    out.append(D.ring('crown', 0.11, 0.025, 0.09, loc=P(-0.02, -0.05, 0.25), m=M['gold'], verts=24))
    for k in range(6):
        a = k * math.tau / 6
        out.append(mn.sphere('crown_pt', 0.023, loc=P(-0.02 + 0.1 * math.cos(a), -0.05 + 0.1 * math.sin(a), 0.36), m=M['gold'], scale=(1, 1, 1.6), segs=8))
    gem(-0.02, 0.06, 0.31, 0.025, '#e2242a', out)
    floor_shadow(2.0, 1.8)
    finish('loot_gold', out)

@job('loot_crates')
def loot_crates_job():
    M = M_; out = []; rng = random.Random(32)
    crate(-0.18, -0.05, 0.75, 0.6, 0.55, out, 'LOOT')
    crate(0.42, 0.12, 0.5, 0.5, 0.42, out, None, m=wood('redcrate', '#b03028', 'x', 5.0), rotz=-0.12)
    out.append(txt('NOT\nOURS', 0.45, 0.39, 0.22, 0.07, M['white'], face=True))
    out[-1].rotation_euler.z = 0.12
    crate(-0.2, -0.05, 0.45, 0.4, 0.3, out, None, z0=0.56, rotz=0.25)
    out.append(cbox('n_fragile', -0.2, -0.05, 0.3, 0.12, 0.865, 0.004, M['redp'], bevel=0, rotz=0.25))
    out.append(txt('FRAGILE', -0.2, -0.05, 0.871, 0.045, M['white'], rotz=0.25))
    # a stolen fuel cell leaning on the crates, coins
    cell = emit_mat('cell', '#5af08a', 0.9, base='#2a9a4a')
    c = ucyl('cell', 0.1, 0.48, 0, 0, 0, cell, verts=18, bevel=0.015); cc1 = ucyl('cell_cap', 0.11, 0.07, 0, 0, 0, M['steel'], verts=18); cc2 = ucyl('cell_cap', 0.11, 0.07, 0, 0, 0.41, M['steel'], verts=18)
    g = mn.group('n_cellg', [c, cc1, cc2], loc=P(0.62, -0.32, 0.0)); g.rotation_euler = (0, -0.3, 0); out += [c, cc1, cc2]
    for _ in range(9):
        out.append(mn.cyl('n_coin', 0.05, 0.015, loc=P(rng.uniform(-0.5, 0.7), rng.uniform(0.3, 0.55), 0.0), m=M['coin'], verts=14, bevel=0.005))
    out.append(ftape(-0.3, 0.255, 0.32, 0.25, M['tape'], 0.3))
    floor_shadow(2.2, 1.8)
    finish('loot_crates', out)

@job('loot_coffee')
def loot_coffee_job():
    """A stolen espresso machine on a crate, beans, mugs; tagged 'TAKEN FROM: THEM'."""
    M = M_; out = []; rng = random.Random(33)
    crate(0, 0, 0.8, 0.6, 0.4, out, None)
    chrome = worn('chrome', '#c8ccd4', 0.18, 0.95, wear=0.2, grime=0.5)
    out.append(cbox('cm_body', 0, -0.05, 0.5, 0.36, 0.4, 0.42, chrome, bevel=0.04))
    out.append(cbox('cm_top', 0, -0.05, 0.52, 0.38, 0.82, 0.04, M['red'], bevel=0.015))
    for k in range(3): mug(-0.15 + k * 0.15, -0.08, 0.86, out, handle=False)
    out.append(cbox('cm_head', 0, 0.14, 0.2, 0.08, 0.6, 0.08, M['dark'], bevel=0.02))
    out.append(cbox('cm_porta', -0.12, 0.2, 0.26, 0.05, 0.57, 0.04, M['black'], bevel=0.015, rotz=-0.4))
    out.append(cbox('cm_tray', 0, 0.16, 0.32, 0.12, 0.4, 0.03, M['steel'], bevel=0.008))
    mug(0, 0.17, 0.43, out, r=0.05, h=0.09)
    out.append(ucyl('cm_gauge', 0.06, 0.02, 0.16, 0.13, 0.72, M['white'], axis='v', verts=16))
    out[-1].location = P(0.16, 0.14, 0.72)
    out.append(cbox('n_needle', 0.16, 0.152, 0.004, 0.004, 0.72, 0.045, M['redp'], bevel=0))
    out.append(mn.sphere('cm_btn', 0.025, loc=P(-0.17, 0.135, 0.72), m=M['green_led'], segs=10))
    out.append(cbox('n_bow', 0.12, -0.05, 0.08, 0.38, 0.82, 0.045, M['redp'], bevel=0.01))
    # the tag on a string, bean sacks, a spill of beans
    out.append(cbox('tag', 0.3, 0.17, 0.16, 0.01, 0.48, 0.1, M['paper2'], bevel=0.004))
    out.append(txt('TAKEN FROM:\nTHEM', 0.3, 0.177, 0.53, 0.024, M['ink'], face=True))
    sack = worn('sack', '#a08458', 0.9, 0.0, wear=0.0, grime=1.0, scale=4)
    for (a, b, r) in ((-0.5, 0.15, 0.2), (-0.62, -0.18, 0.17)):
        out.append(mn.sphere('sack', r, loc=P(a, b, r * 0.8), m=sack, scale=(1, 0.9, 1.15), segs=18))
    out.append(txt('BEANS', -0.5, 0.15 + 0.19, 0.17, 0.05, M['ink'], face=True))
    bean = pmat('bean', '#3a2010', 0.4)
    for _ in range(14):
        out.append(mn.sphere('n_bean', 0.018, loc=P(rng.uniform(-0.55, -0.2), rng.uniform(0.25, 0.5), 0.008), m=bean, scale=(1.3, 1, 0.6), segs=6))
    floor_shadow(2.2, 1.8)
    finish('loot_coffee', out)

# ---------------------------------------------------------------------------------------------------
# Grog barrel, cat bed, rug
# ---------------------------------------------------------------------------------------------------
@job('grog')
def grog_job():
    M = M_; out = []; R, H = 0.32, 0.78
    # bulging barrel: a cylinder with more verts in z, bulged
    me = bpy.data.meshes.new('barrel'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=R, radius2=R, depth=H)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1], cuts=8)
    for v in bm.verts:
        t = v.co.z / H; k = 1 + 0.12 * (1 - (2 * t) ** 2)
        v.co.x *= k; v.co.y *= k; v.co.z += H / 2
    bm.to_mesh(me); bm.free()
    b = mn.link(bpy.data.objects.new('barrel', me)); mn.bev(b, 0.02); mn.assign(b, M['staves']); mn.smooth(b); out.append(b)
    for z in (0.08, 0.3, 0.52, 0.72):
        t = (z - H / 2) / H; k = 1 + 0.12 * (1 - (2 * t) ** 2)
        out.append(D.ring('hoop', R * k + 0.012, 0.03, 0.05, loc=P(0, 0, z - 0.025), m=M['iron'], verts=40))
    out.append(ucyl('lid', R - 0.02, 0.02, 0, 0, H, wood('lidw', '#7a4a2a', 'x', 9.0), verts=32))
    # front: GROG stencil, XXX, chalk tally, the tap, a drip and a puddle, a taped leak
    fv = R * 1.12
    out.append(txt('GROG', 0, fv + 0.01, 0.42, 0.11, M['white'], face=True))
    out.append(txt('XXX', 0, fv + 0.0, 0.62, 0.06, M['redp'], face=True))
    out.append(ucyl('tap', 0.035, 0.12, 0, fv - 0.02, 0.17, M['gold2'], axis='v', verts=12))
    out[-1].location = P(0, fv + 0.1, 0.19)
    out.append(cbox('tap_spout', 0, fv + 0.1, 0.04, 0.04, 0.12, 0.07, M['gold2'], bevel=0.01))
    out.append(cbox('tap_lever', 0, fv + 0.08, 0.03, 0.03, 0.22, 0.09, M['red'], bevel=0.01))
    out.append(mn.sphere('n_drip', 0.016, loc=P(0, fv + 0.1, 0.07), m=M['grog'], scale=(1, 1, 1.4), segs=8))
    out.append(D.disc('n_puddle', 0.02, fv + 0.12, 0.003, 0.16, M['puddle'], sv=0.7))
    out.append(ftape(-0.22, fv - 0.05, 0.3, 0.16, M['tape'], 0.4))
    out[-1].rotation_euler = (0, 0.4, 0.55)
    # on the lid: a tankard and a ladle
    mug(0.08, -0.06, H + 0.02, out, m=M['pewter'], r=0.07, h=0.15)
    l = mn.box('ladle', (0.32, 0.03, 0.02), loc=(0, 0, 0), m=M['steel'], bevel=0.008); l.location = P(-0.12, 0.08, H + 0.03); l.rotation_euler = (0, 0, 0.5); out.append(l)
    out.append(mn.sphere('ladle_cup', 0.05, loc=P(-0.25, 0.15, H + 0.05), m=M['steel'], scale=(1, 1, 0.6), segs=12))
    floor_shadow(1.6, 1.6)
    finish('grog', out)

@job('catbed')
def catbed_job():
    """The cat bed for the ship cat he never got: name 'ADMIRAL', a tiny captain's hat, untouched food bowl."""
    M = M_; out = []
    red = worn('bedred', '#c0303a', 0.75, 0.0, wear=0.1, grime=0.7)
    out.append(torus('bed', 0.27, 0.09, 0, 0, 0.09, red, sz=1.1))
    out.append(torus('bed_trim', 0.27, 0.025, 0, 0, 0.175, M['gold'], sz=1.0))
    out.append(ucyl('bed_base', 0.33, 0.06, 0, 0, 0, red, verts=32, bevel=0.03))
    out.append(ucyl('cushion', 0.22, 0.09, 0, 0, 0.04, worn('cush', '#e8dcc0', 0.8, 0.0, wear=0.0, grime=0.8), verts=28, bevel=0.04))
    out.append(cbox('nameplate', 0, 0.36, 0.3, 0.02, 0.09, 0.07, M['gold'], bevel=0.008))
    out.append(txt('ADMIRAL', 0, 0.373, 0.125, 0.045, M['ink'], face=True))
    # the tiny tricorn hat, a toy mouse, the bowl full of untouched food
    hat = []
    hat.append(mn.sphere('hat', 0.07, loc=P(0, 0, 0), m=M['black'], scale=(1.4, 1.2, 0.5), segs=16))
    hat.append(mn.sphere('hat_crown', 0.05, loc=P(0, 0, 0.03), m=M['black'], scale=(1, 1, 0.7), segs=14))
    D.skull(0, 0.07, 0.04, 0.05, M['white'], hat, face=True)
    g = mn.group('n_hatg', hat, loc=P(-0.04, -0.02, 0.15)); g.rotation_euler = (0.2, 0, 0.3); out += hat
    out.append(mn.sphere('mouse', 0.045, loc=P(0.12, 0.08, 0.15), m=pmat('mouse', '#8a8e98', 0.8), scale=(1.4, 0.9, 0.8), segs=12))
    out.append(D.pipe_uv('n_mouse_tail', [(0.18, 0.08, 0.15), (0.24, 0.12, 0.14), (0.22, 0.18, 0.13)], 0.006, M['redp'], corner=0.05))
    bu, bv = 0.5, 0.22
    out.append(ucyl('bowl', 0.12, 0.06, bu, bv, 0, M['steel'], verts=24, bevel=0.02))
    out.append(mn.sphere('n_food', 0.095, loc=P(bu, bv, 0.05), m=pmat('kibble', '#9a6a3a', 0.8), scale=(1, 1, 0.25), segs=14))
    out.append(txt('ADMIRAL', bu, bv + 0.125, 0.03, 0.025, M['ink'], face=True))
    out.append(cbox('n_tag', -0.35, 0.3, 0.16, 0.1, 0.0, 0.004, M['paper'], bevel=0, rotz=-0.3))
    out.append(txt('ANY DAY\nNOW', -0.35, 0.3, 0.006, 0.03, M['ink'], rotz=-0.3))
    floor_shadow(1.6, 1.4)
    finish('catbed', out)

@job('rug')
def rug_job():
    M = M_; out = []; W, L = 2.0, 3.2
    rug = worn('rugm', '#9a1e26', 0.95, 0.0, wear=0.05, grime=1.0, scale=1.5)
    out.append(cbox('rug', 0, 0, W, L, 0, 0.018, rug, bevel=0.006))
    gold = worn('rugg', '#e0aa30', 0.8, 0.0, wear=0.05, grime=0.8)
    for (u, v, w, d) in ((0, -L / 2 + 0.15, W - 0.24, 0.05), (0, L / 2 - 0.15, W - 0.24, 0.05), (-W / 2 + 0.12, 0, 0.05, L - 0.26), (W / 2 - 0.12, 0, 0.05, L - 0.26),
                         (0, -L / 2 + 0.24, W - 0.42, 0.025), (0, L / 2 - 0.24, W - 0.42, 0.025), (-W / 2 + 0.21, 0, 0.025, L - 0.44), (W / 2 - 0.21, 0, 0.025, L - 0.44)):
        out.append(cbox('n_border', u, v, w, d, 0.018, 0.003, gold, bevel=0))
    for su in (-1, 1):
        for sv in (-1, 1):
            o = cbox('n_diamond', su * (W / 2 - 0.36), sv * (L / 2 - 0.4), 0.12, 0.12, 0.018, 0.003, gold, bevel=0, rotz=math.radians(45)); out.append(o)
    D.skull(0, -0.05, 0.022, 1.2, gold, out, face=False)
    for k in range(21):                                      # fringe at the short ends
        u = -W / 2 + 0.1 + k * (W - 0.2) / 20
        for sv in (-1, 1): out.append(cbox('n_fringe', u, sv * (L / 2 + 0.05), 0.025, 0.12, 0.0, 0.01, pmat('fringe', '#e8d4a0', 0.8), bevel=0))
    # wear: a burn hole, boot-scuffed path, a grog stain
    out.append(D.disc('n_burn', 0.55, 0.95, 0.021, 0.09, M['black']))
    out.append(D.disc('n_burn_s', 0.55, 0.95, 0.0205, 0.18, M['soot']))
    out.append(D.disc('n_stain', -0.5, -1.0, 0.0205, 0.22, M['puddle'], sv=0.7))
    out.append(ttape(0.62, 0.85, 0.021, 0.2, M['tape'], rotz=0.4))
    floor_shadow(2.8, 4.0)
    finish('rug', out, thick=0.008)

# ---------------------------------------------------------------------------------------------------
# The escape pod: a top hatch in a hazard collar against the back wall (1.6 wide; collar centre = origin)
# ---------------------------------------------------------------------------------------------------
POD_R = 0.62
def pod(state):
    M = M_; out = []; rng = random.Random(41)
    CR, CZ = 0.78, 0.32                                       # collar outer radius, height
    WV = -0.72                                                # back panel / wall face
    # back panel against the wall: ESCAPE POD sign, CAPTAIN ONLY, status lamp, launch lever
    out.append(ubox('panel', -0.8, WV - 0.08, 0.8, WV, 0, 1.55, M['hull2'], bevel=0.03))
    out.append(ubox('panel_hz', -0.8, WV - 0.02, 0.8, WV + 0.01, 0, 0.14, M['hazard'], bevel=0.008))
    out.append(ubox('sign', -0.55, WV, 0.55, WV + 0.03, 1.15, 1.45, M['sticker'], bevel=0.01))
    out.append(txt('ESCAPE POD', 0, WV + 0.034, 1.3, 0.11, M['ink'], face=True))
    out.append(ubox('sign2', -0.42, WV, 0.42, WV + 0.03, 0.95, 1.1, M['red'], bevel=0.01))
    out.append(txt('CAPTAIN ONLY', 0, WV + 0.034, 1.025, 0.075, M['white'], face=True))
    lamp = M['red_led'] if state == 'launched' else M['green_led']
    out.append(ucyl('lampb', 0.07, 0.06, 0.66, WV, 1.3, M['dark'], axis='v', verts=14)); out[-1].location = P(0.66, WV + 0.06, 1.3)
    out.append(mn.sphere('lamp', 0.06, loc=P(0.66, WV + 0.08, 1.3), m=lamp, segs=14))
    out.append(ubox('lever_box', -0.75, WV, -0.58, WV + 0.1, 0.55, 0.85, M['dark'], bevel=0.015))
    lv = mn.box('lever', (0.03, 0.03, 0.22), loc=(0, 0, 0), m=M['steel'], bevel=0.008); lv.location = P(-0.665, WV + 0.1, 0.7)
    lv.rotation_euler = (math.radians(-40 if state == 'launched' else 40), 0, 0); out.append(lv)
    out.append(mn.sphere('lever_k', 0.04, loc=(0, 0, 0), m=M['redp'], segs=12)); out[-1].parent = lv; out[-1].location = (0, 0, 0.24)
    out.append(txt('PULL', -0.665, WV + 0.105, 0.6, 0.035, M['white'], face=True))
    if state == 'launched':                                    # "BACK SOON" sign hung on the panel
        s = mn.box('back_soon', (0.42, 0.015, 0.2), loc=(0, 0, 0), m=M['paper2'], bevel=0.005); s.location = P(0.15, WV + 0.04, 0.55); s.rotation_euler = (0, 0.12, 0); out.append(s)
        t = txt('BACK SOON', 0, 0, 0, 0.06, M['ink'], face=True); t.location = P(0.15, WV + 0.05, 0.65); t.rotation_euler = (R90, 0.12, 0); out.append(t)
    else:
        out.append(ubox('rules', 0.12, WV, 0.48, WV + 0.02, 0.42, 0.78, M['paper'], bevel=0.004))
        out.append(txt('RULES:\n1. CAPTAIN\n2. NOBODY\n   ELSE', 0.3, WV + 0.024, 0.6, 0.03, M['ink'], face=True))
    # the collar: a hazard ring with bolts, the well inside
    out.append(D.ring('collar', CR, CR - POD_R + 0.02, CZ, loc=P(0, 0, 0), m=M['iron'], verts=48))
    out.append(D.ring('collar_hz', CR - 0.02, 0.12, 0.012, loc=P(0, 0, CZ), m=M['hazard'], verts=48))
    for k in range(12):
        a = k * math.tau / 12
        out.append(rivet((POD_R + 0.05) * math.cos(a), (POD_R + 0.05) * math.sin(a), CZ + 0.012, M['steel'], 0.022))
    out.append(txt('KEEP CLEAR', 0, CR + 0.004, CZ * 0.5, 0.06, M['sticker'], face=True))
    hv = -POD_R + 0.06; hz = CZ + 0.03                         # the hatch hinge (north)
    if state == 'launched':
        out.append(ucyl('n_well', POD_R, 0.02, 0, 0, CZ - 0.25, M['black'], verts=40, bevel=0))
        out.append(D.ring('well_wall', POD_R + 0.005, 0.03, 0.24, loc=P(0, 0, CZ - 0.25), m=M['dark'], verts=40))
        out.append(D.disc('n_soot', 0, 0, CZ + 0.014, CR + 0.05, M['soot']))
        for k in range(4):                                     # the release clamps, sprung open
            a = math.radians(45 + k * 90)
            c = mn.box('clamp', (0.16, 0.08, 0.06), loc=(0, 0, 0), m=M['steel'], bevel=0.015)
            c.location = P((POD_R + 0.05) * math.cos(a), (POD_R + 0.05) * math.sin(a), CZ + 0.02); c.rotation_euler = (0, 0, -a); out.append(c)
        for k, (c, a) in enumerate(((M['cable_r'], 2.0), (M['cable_b'], 2.4), (M['copper'], 0.9))):   # torn umbilicals
            x0, y0 = (POD_R - 0.05) * math.cos(a), (POD_R - 0.05) * math.sin(a)
            out.append(D.pipe_uv('cable', [(x0 * 1.2, y0 * 1.2, CZ + 0.02), (x0, y0, CZ + 0.02), (x0 * 0.8, y0 * 0.8, CZ - 0.15)], 0.025, c, corner=0.06))
        out.append(mn.sphere('n_spark', 0.02, loc=P(0.8 * (POD_R - 0.05) * math.cos(0.9), 0.8 * (POD_R - 0.05) * math.sin(0.9), CZ - 0.15), m=M['amber_led'], segs=8))
        floor_shadow(2.4, 2.4)
        return finish('pod_launched', out)
    # the pod inside the well: its top shell and the seat (visible when open)
    out.append(ucyl('pod_shell', POD_R - 0.01, CZ - 0.06, 0, 0, 0.04, M['white'], verts=40))
    if state == 'open':
        out.append(ucyl('n_pod_in', POD_R - 0.06, 0.02, 0, 0, CZ - 0.03, M['dark'], verts=40, bevel=0))
        out.append(D.ring('pod_lip', POD_R - 0.01, 0.06, 0.03, loc=P(0, 0, CZ - 0.03), m=M['white'], verts=40))
        out.append(cbox('seat', 0, 0.05, 0.6, 0.55, CZ - 0.01, 0.06, M['leather'], bevel=0.03))
        out.append(cbox('seat_back', 0, -0.36, 0.55, 0.2, CZ - 0.01, 0.12, M['leather'], bevel=0.04))
        D.skull(0, 0.05, CZ + 0.052, 0.3, M['gold'], out, face=False)
        for su in (-1, 1): out.append(cbox('strap', su * 0.18, 0.05, 0.07, 0.55, CZ + 0.05, 0.012, M['dark'], bevel=0.004))
        # his stash: a bottle of grog, a framed photo of himself, a rubber duck
        out.append(ucyl('bottle', 0.05, 0.22, 0.38, 0.22, CZ - 0.02, pmat('bottle', '#2a6a3a', 0.2), verts=12))
        out.append(ucyl('cork', 0.025, 0.05, 0.38, 0.22, CZ + 0.2, pmat('cork', '#b08a5a', 0.8), verts=10))
        fr = mn.box('photo', (0.18, 0.02, 0.22), loc=(0, 0, 0), m=M['gold'], bevel=0.01); fr.location = P(-0.38, 0.18, CZ - 0.02); fr.rotation_euler = (-0.5, 0, 0.3); out.append(fr)
        out.append(mn.sphere('duck', 0.05, loc=P(-0.32, -0.2, CZ + 0.04), m=pmat('duck', '#f2cc2a', 0.4), scale=(1.2, 1, 0.9), segs=12))
        out.append(mn.sphere('duck_h', 0.033, loc=P(-0.35, -0.18, CZ + 0.1), m=pmat('duck', '#f2cc2a', 0.4), segs=10))
        out.append(cbox('console', 0.3, -0.38, 0.2, 0.12, CZ - 0.02, 0.1, M['dark'], bevel=0.02))
        out.append(cbox('n_console_scr', 0.3, -0.38, 0.14, 0.08, CZ + 0.081, 0.004, M['green_led'], bevel=0))
    # the hatch: a domed lid with a porthole and a wheel
    hatch = []
    hatch.append(ucyl('hatch_slab', POD_R - 0.02, 0.06, 0, -hv, -0.03, M['steel'], verts=40, bevel=0.02))
    hatch.append(dome('hatch', POD_R - 0.08, 0, -hv, 0.03, M['steel'], sz=0.26))
    hatch.append(D.ring('n_gasket', POD_R - 0.06, 0.05, 0.01, loc=P(0, -hv, -0.04), m=M['rubber'], verts=40))
    hatch.append(D.ring('hatch_rim', POD_R, 0.06, 0.05, loc=P(0, -hv, -0.02), m=M['red'], verts=40))
    hatch.append(ucyl('port_rim', 0.17, 0.06, 0, -hv + 0.18, 0.1, M['gold2'], verts=24))
    hatch.append(ucyl('port', 0.13, 0.065, 0, -hv + 0.18, 0.1, M['glass'], verts=24, bevel=0.01))
    hatch.append(D.ring('wheel', 0.14, 0.025, 0.03, loc=P(0, -hv - 0.16, 0.16), m=M['iron'], verts=24))
    for k in range(2):
        s = mn.box('wheel_spoke', (0.27, 0.02, 0.02), loc=(0, 0, 0), m=M['iron'], bevel=0.005); s.location = P(0, -hv - 0.16, 0.175); s.rotation_euler = (0, 0, k * R90); hatch.append(s)
    hatch.append(ucyl('wheel_hub', 0.035, 0.04, 0, -hv - 0.16, 0.15, M['red'], verts=12))
    t = txt('CAPTAIN ONLY', 0, -hv + 0.4, 0.13, 0.085, M['redp']); hatch.append(t)
    t.rotation_euler = (0.32, 0, 0)
    hatch.append(cbox('n_tape_h', -0.3, -hv - 0.35, 0.22, 0.08, 0.1, 0.008, M['tape'], bevel=0, rotz=0.7))
    g = mn.group('n_hatchg', hatch, loc=P(0, hv, hz))
    hatch.append(cbox('hinge', 0, 0, 0.36, 0.08, -0.04, 0.08, M['iron'], bevel=0.02))
    hatch[-1].parent = None; hatch[-1].location = P(0, hv - 0.02, hz - 0.04)
    if state == 'open': g.rotation_euler = (math.radians(-105), 0, 0)
    out += hatch
    floor_shadow(2.4, 2.4)
    finish('pod_' + state, out)

@job('pod_closed')
def pod_closed_job(): pod('closed')
@job('pod_open')
def pod_open_job(): pod('open')
@job('pod_launched')
def pod_launched_job(): pod('launched')

# ---------------------------------------------------------------------------------------------------
# Floor stencils (flat, worn spray paint)
# ---------------------------------------------------------------------------------------------------
def stencil(name, body, color, size):
    out = [txt(body, 0, 0, 0.002, size, paint('paint_' + name, color, scale=6.0))]   # coarse wear: fine noise cut thin letters (I read as !)
    out[0].name = 'n_stencil'
    mn.render('base/' + name, objs=out)

@job('stencil_right')
def stencil_right_job(): stencil('stencil_right', 'THE CAPTAIN IS ALWAYS RIGHT', '#e6e2d6', 0.17)
@job('stencil_knock')
def stencil_knock_job(): stencil('stencil_knock', "CAPTAIN'S QUARTERS  ·  KNOCK FIRST", '#e8c34f', 0.17)

# ---------------------------------------------------------------------------------------------------
def run():
    t0 = time.time()
    for name, fn in JOBS:
        if ONLY and name not in ONLY: continue
        t = time.time(); mn.reset(); set_side('port'); shiplib._hidden_in_data.clear(); CATCHERS.clear()
        M_.clear(); M_.update(mats())
        fn()
        print(f'[base] {name}: {time.time() - t:.1f} s')
    print(f'[base] total {time.time() - t0:.1f} s')

run()
