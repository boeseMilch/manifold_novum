"""Shared helpers for the ship-systems models (capacitors, buttons, consoles, lever, crates, ...).

On top of mn.py and models/ship/shiplib.py (imported, never edited). Conventions:
  * every object is built around its game anchor: Blender (0, 0, 0) = the game's (x, y) for it;
    Blender +X = game +x, Blender -Y = game +y (towards the camera / down the screen), +Z = up.
  * states of one object are rendered with the same `objs` list for framing, so every state of an
    object shares one canvas and origin (the game can swap them freely).
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
from shiplib import pmat, glow, pipe, label, ring

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if 'quick' in ARGS: mn.SAMPLES = 16
R90 = (math.radians(90), 0, 0)

# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
GAIN = 1.35
def lift(color):
    """Palette colour, a bit brighter: lit 3D surfaces under AgX read darker than the game's flat fills."""
    return tuple(min(1.0, c * GAIN) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, wear=0.8, grime=1.0, scale=1.0):
    """Worn paint (from the interceptor): AO grime in crevices, soft blotches, thin scratches."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.08; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 3.5 * scale; blot.inputs['Detail'].default_value = 6
    Lk(tc.outputs['Object'], blot.inputs['Vector'])
    g1 = N.new('ShaderNodeMapRange'); g1.inputs['From Min'].default_value = 0.45; g1.inputs['From Max'].default_value = 0.75
    g1.inputs['To Min'].default_value = 0; g1.inputs['To Max'].default_value = 0.22 * grime
    Lk(blot.outputs['Fac'], g1.inputs['Value'])
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.6 * grime; Lk(aoi.outputs[0], aok.inputs[0])
    gsum = N.new('ShaderNodeMath'); gsum.operation = 'ADD'; gsum.use_clamp = True; Lk(g1.outputs[0], gsum.inputs[0]); Lk(aok.outputs[0], gsum.inputs[1])
    dirt = N.new('ShaderNodeMix'); dirt.data_type = 'RGBA'; dirt.blend_type = 'MULTIPLY'
    Lk(gsum.outputs[0], dirt.inputs['Factor']); Lk(rgb.outputs[0], dirt.inputs[6]); dirt.inputs[7].default_value = (0.08, 0.07, 0.06, 1)
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
    Lk(tc.outputs['Object'], sm.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 9 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
    sc.inputs['To Max'].default_value = 0.5 * wear; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(sc.outputs[0], bare.inputs['Factor'])
    Lk(dirt.outputs[2], bare.inputs[6]); bare.inputs[7].default_value = (0.42, 0.43, 0.45, 1)
    Lk(bare.outputs[2], b.inputs['Base Color'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough; rr.inputs['To Max'].default_value = 0.3
    Lk(sc.outputs[0], rr.inputs['Value']); Lk(rr.outputs[0], b.inputs['Roughness'])
    return m

def glass(name, color='#9cd8ff', alpha=0.25):
    """Clear-ish glass tube: a coated, slightly tinted transparent shell."""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Roughness'].default_value = 0.05
    b.inputs['Transmission Weight'].default_value = 0.9; b.inputs['IOR'].default_value = 1.2
    b.inputs['Alpha'].default_value = 1 - alpha * 0.5; b.inputs['Coat Weight'].default_value = 0.6
    return m

def soot(name):
    """Black soot decal: ragged radial falloff, see-through at the rim (from the interceptor)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (0.012, 0.01, 0.009, 1); d.inputs['Roughness'].default_value = 0.95
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 6; no.inputs['Detail'].default_value = 8; Lk(tc.outputs['Object'], no.inputs['Vector'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; Lk(gr.outputs['Fac'], mul.inputs[0]); Lk(no.outputs['Fac'], mul.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.08; mr.inputs['From Max'].default_value = 0.4; mr.inputs['To Max'].default_value = 0.9
    Lk(mul.outputs[0], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(d.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def crazed(name, base='#1c2633', crack='#d8e0e8'):
    """Smashed screen / glass: dark with a web of white cracks."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.3
    tc = N.new('ShaderNodeTexCoord')
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 9; Lk(tc.outputs['Object'], v.inputs['Vector'])
    cr = N.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.03; cr.inputs['From Max'].default_value = 0.0; Lk(v.outputs['Distance'], cr.inputs['Value'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(cr.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = (*mn.hex_rgb(base), 1); col.inputs[7].default_value = (*mn.hex_rgb(crack), 1)
    Lk(col.outputs[2], b.inputs['Base Color'])
    return m

def stdmats():
    """The common set every systems model uses (fresh per scene: mn.reset wipes materials)."""
    return dict(
        body=worn('body', '#4a515e', 0.5, 0.35),           # panel grey housing
        body2=worn('body2', '#3a3f4a', 0.55, 0.35),        # darker housing
        frame=pmat('frame', '#2b303a', 0.55, 0.5, grime=0.5),
        steel=pmat('steel', '#a3abb8', 0.32, 0.85, grime=0.3),
        dark=pmat('dark', '#1c1f25', 0.6, 0.3),
        rubber=pmat('rubber', '#262a33', 0.75),
        hazard=pmat('hazard', None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=7.0, grime=0.4),
        tape=pmat('tape', '#b9bcc2', 0.85, 0.0),
        sticker=pmat('sticker', '#f2df6b', 0.6),
        ink=pmat('ink', '#23252b', 0.6),
        paper=pmat('paper', '#ece8dc', 0.6),
        copper=pmat('copper', '#c08a3e', 0.3, 0.9, grime=0.4),
        hole=pmat('hole', '#0c0d10', 0.9),
        red=pmat('red', '#e2574c', 0.35),
        lamp_off=pmat('lamp_off', '#3a3f48', 0.3, 0.2),
        soot=soot('soot'),
        crazed=crazed('crazed'),
    )

# ---------------------------------------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------------------------------------
class Parts(list):
    """Collects the objects of one model; P(o) adds and returns."""
    def __call__(self, o): self.append(o); return o

def show(objs, on=True):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]): o.hide_render = not on

def setmat(objs, m):
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]): o.data.materials[0] = m

def wedge(name, w, d, h0, h1, loc=(0, 0, 0), m=None, bevel=0.02):
    """Box w (x) by d (y) whose top slopes from height h0 at the front (-y) to h1 at the back (+y)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    v = [bm.verts.new(p) for p in [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0),
                                   (x0, y0, h0), (x1, y0, h0), (x1, y1, h1), (x0, y1, h1)]]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = loc
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def plate(name, size, loc, rot, m, bevel=0.004):
    """Thin box (a label plate / screen face) centred at loc, rotated."""
    o = mn.box(name, size, loc=(0, 0, -size[2] / 2), m=m, bevel=bevel)
    o.location = loc; o.rotation_euler = rot; return o

def on_slope(h0, h1, d, y):
    """Height of a wedge top (front h0 at y=-d/2, back h1 at y=+d/2) at y, and its tilt angle."""
    k = (y + d / 2) / d
    return h0 + (h1 - h0) * k, math.atan2(h1 - h0, d)

def rot_group(name, objs, angle_game):
    """Parent objs under an empty rotated by a game-space angle (clockwise on screen = -Z in Blender)."""
    e = mn.group(name, objs); e.rotation_euler.z = -angle_game
    bpy.context.view_layer.update(); return e

def key_hide(o, frame, hidden):
    o.hide_render = hidden; o.keyframe_insert('hide_render', frame=frame)

def key_strength(m, frame, s):
    n = m.node_tree.nodes.get('Emission') or m.node_tree.nodes.get('Principled BSDF')
    inp = n.inputs['Strength'] if 'Strength' in n.inputs else n.inputs['Emission Strength']
    inp.default_value = s; inp.keyframe_insert('default_value', frame=frame)

def soot_disc(name, r, loc, m, sy=1.0):
    """Flat soot decal of radius r (the soot material needs unit object-space radius). Not outlined."""
    o = mn.cyl(name, 1.0, 0.004, loc=loc, m=m, bevel=0, verts=40); o.scale = (r, r * sy, 1)
    o['no_outline'] = 1; return o

def outline(P, thickness=0.012):
    mn.outline([o for o in P if not o.get('no_outline')], thickness=thickness)
