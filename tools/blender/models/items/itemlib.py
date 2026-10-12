"""Items: everything a crew member can carry, plus the shop icons (locker gear, shipyard upgrades).

Shared helpers and one builder per object. Every builder makes its model in a *natural* frame:
origin at the bottom centre, Z up, X = the long axis / forward (guns point +X, grip down -Z), and
returns its parts. items.py lays the models on the floor for the world sprites, icons.py stands them
in a 3/4 hero pose for the square icons.

Materials: `worn` (paint with grime blotches, AO dirt and scratches) is copied from
models/enemy/interceptor.py, palette colours lifted 1.35x like there; plain bits use shiplib.pmat.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
import shiplib
from shiplib import pmat, glow, pipe, label, ring

R90 = math.radians(90)

# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
GAIN = 1.35
def lift(color):
    return tuple(min(1.0, c * GAIN) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, wear=1.0, grime=1.0, scale=1.0):
    """Worn paint (from interceptor.py): grime blotches + AO dirt in crevices + thin scratches."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.05; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 2.5 * scale; blot.inputs['Detail'].default_value = 6
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
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 7 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
    sc.inputs['To Max'].default_value = 0.5 * wear; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(sc.outputs[0], bare.inputs['Factor'])
    Lk(dirt.outputs[2], bare.inputs[6]); bare.inputs[7].default_value = (0.42, 0.43, 0.45, 1)
    Lk(bare.outputs[2], b.inputs['Base Color'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough; rr.inputs['To Max'].default_value = 0.3
    Lk(sc.outputs[0], rr.inputs['Value']); Lk(rr.outputs[0], b.inputs['Roughness'])
    return m

def emitm(name, base, color, strength, rough=0.25, coat=0.0, alpha=1.0):
    """Principled with emission (crystals, glass windows): shaded and glowing."""
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(base), 1)
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = rough
    if coat: b.inputs['Coat Weight'].default_value = coat
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m

def rim_glow(name, color, strength=1.2, power=3.0):
    """See-through bubble that glows at its rim (fresnel): force fields."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*mn.hex_rgb(color), 1); em.inputs['Strength'].default_value = strength
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = power; Lk(lw.outputs['Facing'], pw.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'; k.inputs[1].default_value = 0.85; k.inputs[2].default_value = 0.06; Lk(pw.outputs[0], k.inputs[0])
    Lk(k.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(em.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

class Mats(dict):
    __getattr__ = dict.__getitem__

M = Mats()
def make_mats():
    """(Re)create the shared materials; call after mn.reset()."""
    M.clear()
    M.update(
        steel=pmat('steel', '#a9b2c0', 0.3, 0.85, grime=0.3, grime_scale=12),
        steel_dark=pmat('steel_dark', '#5a6272', 0.35, 0.8, grime=0.3, grime_scale=12),
        dark=pmat('dark', '#2b303a', 0.5, 0.3, grime=0.3, grime_scale=12),
        rubber=pmat('rubber', '#262a33', 0.75),
        tape=pmat('tape', '#b9bcc2', 0.85),
        ink=pmat('ink', '#1c1e24', 0.6),
        white=pmat('white', '#eef0f4', 0.55, grime=0.25, grime_scale=10),
        sticker=pmat('sticker', '#f2df6b', 0.6),
        hazard=pmat('hazard', None, 0.5, stripes=('#e8c34f', '#23252b'), stripe_k=14, grime=0.3, grime_scale=10),
        hole=pmat('hole', '#0c0d10', 0.9),
        brass=pmat('brass', '#c8a24a', 0.3, 0.9, grime=0.3, grime_scale=12),
        copper=pmat('copper', '#c08a3e', 0.3, 0.9, grime=0.4, grime_scale=12),
        red_btn=pmat('red_btn', '#e2574c', 0.35),
        green_btn=pmat('green_btn', '#5fd6a0', 0.35),
    )
    return M

# ---------------------------------------------------------------------------------------------------------
# Geometry helpers (all in the model's natural frame)
# ---------------------------------------------------------------------------------------------------------
box, cyl, sphere = mn.box, mn.cyl, mn.sphere

def xcyl(name, r, x0, x1, y=0.0, z=0.0, m=None, verts=32, bevel=0.01):
    """Cylinder along +X from x0 to x1, axis at (y, z)."""
    return cyl(name, r, x1 - x0, loc=(x0, y, z), m=m, verts=verts, bevel=bevel, rot=(0, R90, 0))

def ycyl(name, r, y0, y1, x=0.0, z=0.0, m=None, verts=32, bevel=0.01):
    return cyl(name, r, y1 - y0, loc=(x, y0, z), m=m, verts=verts, bevel=bevel, rot=(-R90, 0, 0))

def cone(name, r0, r1, h, loc=(0, 0, 0), m=None, rot=(0, 0, 0), verts=32, bevel=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.rotation_euler = rot
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def slab(name, pts, z0, z1, m=None, bevel=0.01, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Extrude a 2D polygon (x, y) from z0 to z1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in pts]
    f = bm.faces.new(vs); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.rotation_euler = rot
    if bevel: mn.bev(o, bevel, 2)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def cut(o, cutter):
    """Boolean difference (the cutter is hidden in renders); applied before the bevel."""
    md = o.modifiers.new('cut', 'BOOLEAN'); md.object = cutter; md.operation = 'DIFFERENCE'; md.solver = 'EXACT'
    try: o.modifiers.move(len(o.modifiers) - 1, 0)
    except Exception: pass
    cutter.hide_render = True; cutter.display_type = 'WIRE'; cutter['cutter'] = 1
    return o

def flat(o):
    for p in o.data.polygons: p.use_smooth = False
    return o

def text(name, s, size, loc, rot=(0, 0, 0), m=None, depth=0.002):
    return label(name, s, size, loc, rot=rot, m=m or M.ink, depth=depth)

# ---------------------------------------------------------------------------------------------------------
# Item builders (natural frame). Sizes follow drawItemIcon in js/systems.js at the floor scale 1.15
# (T = 48 px/unit): ~0.6-0.8 units long, inside the 0.45-radius pickup circle.
# ---------------------------------------------------------------------------------------------------------
def wrench_parts(L=0.62, t=0.035, z=0.0, m=None, tape=True, pre='wr'):
    """Flat open-end / ring wrench, length L along X, lying in the XY plane, bottom at z."""
    m = m or M.steel; P = []
    hw = L * 0.12
    P.append(box(pre + '_handle', (L * 0.62, hw, t * 0.85), loc=(0, 0, z + t * 0.075), m=m, bevel=t * 0.3))
    hd = cyl(pre + '_head', L * 0.14, t, loc=(L * 0.36, 0, z), m=m, verts=32, bevel=t * 0.3)
    c = box(pre + '_notch', (L * 0.2, L * 0.1, t * 4), loc=(L * 0.46, 0, z - t), bevel=0, rot=(0, 0, 0.35))
    cut(hd, c); P.append(hd)
    P.append(ring(pre + '_ring', L * 0.105, L * 0.05, t, loc=(-L * 0.36, 0, z), m=m, verts=32))
    if tape:
        P.append(box(pre + '_tape', (L * 0.13, hw * 1.25, t * 1.15), loc=(-L * 0.08, 0, z - t * 0.04), m=M.tape, bevel=0.004))
    return P

def B_repair():
    """Yellow tool case with a wrench emblem (the repair kit: repairs, hull plates, wrench toss)."""
    W, D = 0.6, 0.38
    yel = worn('kit_yellow', '#e8c34f', 0.5, 0.1, scale=4)
    P = [box('case_lo', (W, D, 0.13), m=yel, bevel=0.035),
         box('case_seam', (W - 0.01, D - 0.01, 0.02), loc=(0, 0, 0.125), m=M.dark, bevel=0.005),
         box('case_lid', (W, D, 0.07), loc=(0, 0, 0.14), m=yel, bevel=0.03)]
    for sx in (-1, 1):
        for sy in (-1, 1):                                             # rubber corner bumpers
            P.append(box('bump', (0.07, 0.07, 0.215), loc=(sx * (W / 2 - 0.025), sy * (D / 2 - 0.025), -0.002), m=M.rubber, bevel=0.022))
        P.append(box('latch', (0.07, 0.03, 0.08), loc=(sx * 0.16, -D / 2 - 0.006, 0.09), m=M.steel, bevel=0.01))
        P.append(box('hinge', (0.1, 0.03, 0.04), loc=(sx * 0.16, D / 2 + 0.006, 0.12), m=M.steel_dark, bevel=0.008))
        P.append(box('h_mount', (0.04, 0.05, 0.03), loc=(sx * 0.1, 0.02, 0.205), m=M.steel_dark, bevel=0.008))
    P.append(pipe('handle', [(-0.1, 0.02, 0.215), (-0.1, 0.02, 0.27), (0.1, 0.02, 0.27), (0.1, 0.02, 0.215)], 0.02, M.rubber, corner=0.035))
    em = wrench_parts(L=0.32, t=0.008, z=0.208, m=M.dark, tape=False, pre='emb')   # emblem on the lid
    e = mn.group('emblem', em); e.location = (-0.12, -0.08, 0); e.rotation_euler = (0, 0, 0.5)
    P += em
    P.append(box('front_plate', (0.2, 0.008, 0.05), loc=(0, -D / 2 - 0.003, 0.04), m=M.dark, bevel=0.003))
    P.append(text('front_txt', 'REPAIR', 0.034, (0, -D / 2 - 0.009, 0.065), rot=(R90, 0, 0), m=M.sticker))
    P.append(box('tape', (0.08, 0.24, 0.006), loc=(0.2, -0.13, 0.209), m=M.tape, bevel=0.002, rot=(0, 0, 0.35)))
    P.append(box('tape2', (0.08, 0.006, 0.07), loc=(0.245, -D / 2 - 0.002, 0.14), m=M.tape, bevel=0.002))
    return P

def _grip(x, z0, h, w=0.075, d=0.085, rake=0.28, m=None):
    g = box('grip', (w, d, h), loc=(0, 0, 0), m=m or M.rubber, bevel=0.02)
    g.location = (x, 0, z0 + h / 2); g.rotation_euler = (0, -rake, 0)
    return g

def B_laser():
    """Laser gun: slim blaster, red energy strip and emitter."""
    body = worn('laser_body', '#7a8496', 0.42, 0.35, scale=5)
    zb = 0.11
    P = [box('body', (0.34, 0.1, 0.12), loc=(-0.03, 0, zb), m=body, bevel=0.03),
         box('shroud', (0.28, 0.08, 0.04), loc=(-0.02, 0, zb + 0.115), m=M.dark, bevel=0.015),
         xcyl('barrel', 0.034, 0.12, 0.31, z=zb + 0.07, m=M.dark, bevel=0.008),
         xcyl('tip', 0.03, 0.31, 0.33, z=zb + 0.07, m=glow('laser_glow', '#ff6a4a', 1.2), bevel=0.004),
         box('sight_f', (0.02, 0.02, 0.03), loc=(0.09, 0, zb + 0.15), m=M.dark, bevel=0.005),
         box('sight_r', (0.03, 0.04, 0.03), loc=(-0.13, 0, zb + 0.15), m=M.dark, bevel=0.006),
         xcyl('cell', 0.035, -0.26, -0.2, z=zb + 0.07, m=M.steel_dark, bevel=0.01)]
    for i in range(3):
        P.append(ring('fin', 0.05, 0.018, 0.016, loc=(0.17 + i * 0.04, 0, zb + 0.07), m=M.steel, rot=(0, R90, 0)))
    for sy in (-1, 1):                                                 # glowing strip on both sides
        P.append(box('strip', (0.2, 0.008, 0.026), loc=(-0.04, sy * 0.05, zb + 0.065), m=glow('laser_strip', '#ff6a4a', 1.0), bevel=0.002))
    P.append(_grip(-0.11, 0.0, 0.14))
    P.append(box('grip_tape', (0.085, 0.095, 0.035), loc=(-0.095, 0, 0.04), m=M.tape, bevel=0.006, rot=(0, -0.28, 0)))
    P.append(ring('guard', 0.045, 0.012, 0.02, loc=(-0.02, 0.01, zb - 0.035), m=M.dark, rot=(R90, 0, 0)))
    P.append(box('trigger', (0.014, 0.02, 0.04), loc=(-0.03, 0, zb - 0.04), m=M.steel, bevel=0.004))
    return P

def B_heavy():
    """Heavy blaster: chunky, three blue charge cells, wide muzzle with a hazard ring, carry handle."""
    body = worn('heavy_body', '#4a5468', 0.45, 0.35, scale=4)
    zb = 0.13; zc = zb + 0.09
    glowb = glow('heavy_glow', '#9cd8ff', 1.1)
    P = [box('body', (0.44, 0.15, 0.17), loc=(-0.04, 0, zb), m=body, bevel=0.035),
         box('stock', (0.16, 0.11, 0.12), loc=(-0.32, 0, zb + 0.02), m=M.dark, bevel=0.03),
         box('butt', (0.04, 0.12, 0.17), loc=(-0.41, 0, zb - 0.01), m=M.rubber, bevel=0.015),
         xcyl('shroud', 0.075, 0.17, 0.38, z=zc, m=M.dark, bevel=0.015),
         xcyl('muzzle', 0.085, 0.38, 0.44, z=zc, m=M.steel_dark, bevel=0.015),
         ring('hz_ring', 0.08, 0.02, 0.05, loc=(0.29, 0, zc), m=M.hazard, rot=(0, R90, 0)),
         xcyl('bore', 0.05, 0.44, 0.445, z=zc, m=glow('heavy_bore', '#d8f0ff', 1.3), bevel=0)]
    for i in range(3):                                                 # charge cells (windows both sides)
        for sy in (-1, 1):
            P.append(box('cellwin', (0.06, 0.01, 0.075), loc=(-0.16 + i * 0.08, sy * 0.076, zb + 0.05), m=M.dark, bevel=0.004))
            P.append(box('cell', (0.045, 0.01, 0.06), loc=(-0.16 + i * 0.08, sy * 0.08, zb + 0.057), m=glowb, bevel=0.003))
    for i in range(3):
        for sy in (-1, 1):                                             # shroud vents
            P.append(box('vent', (0.03, 0.01, 0.02), loc=(0.21 + i * 0.05, sy * 0.071, zc - 0.01), m=M.hole, bevel=0.003))
    P.append(pipe('handle', [(-0.16, 0, zb + 0.16), (-0.13, 0, zb + 0.24), (0.06, 0, zb + 0.24), (0.09, 0, zb + 0.16)], 0.018, M.steel, corner=0.04))
    P.append(_grip(-0.12, 0.0, 0.16, w=0.085, d=0.1))
    P.append(box('fore', (0.09, 0.08, 0.08), loc=(0.1, 0, zb - 0.06), m=M.rubber, bevel=0.02))
    P.append(ring('guard', 0.05, 0.014, 0.022, loc=(-0.03, 0.011, zb - 0.04), m=M.dark, rot=(R90, 0, 0)))
    P.append(box('stencil_bg', (0.12, 0.004, 0.04), loc=(0.1, -0.077, zb + 0.1), m=M.sticker, bevel=0.002))
    P.append(text('stencil', 'HX-3', 0.03, (0.1, -0.08, zb + 0.12), rot=(R90, 0, 0)))
    P.append(box('tape', (0.05, 0.16, 0.18), loc=(-0.255, 0, zb + 0.0), m=M.tape, bevel=0.006))
    return P

def B_extinguisher():
    """Fire extinguisher, standing (the world sprite lays it down, valve to the right)."""
    red = worn('ext_red', '#d8463a', 0.38, 0.15, scale=4)
    H = 0.4; r = 0.1
    P = [cyl('body', r, H, m=red, bevel=0.045, verts=40),
         cyl('band', r + 0.004, 0.13, loc=(0, 0, 0.13), m=M.white, bevel=0.004, verts=40),
         cyl('foot', r + 0.006, 0.03, loc=(0, 0, 0.0), m=M.rubber, bevel=0.01, verts=40),
         cyl('neck', 0.035, 0.05, loc=(0, 0, H - 0.01), m=M.brass, bevel=0.008),
         box('valve', (0.08, 0.06, 0.06), loc=(0, 0, H + 0.03), m=M.dark, bevel=0.012),
         box('lever', (0.17, 0.03, 0.016), loc=(-0.03, 0, H + 0.1), m=M.steel, bevel=0.006, rot=(0, -0.18, 0)),
         box('handle', (0.15, 0.03, 0.016), loc=(-0.035, 0, H + 0.075), m=M.steel, bevel=0.006),
         cyl('pin_ring', 0.015, 0.004, loc=(0.0, -0.04, H + 0.06), m=M.sticker, bevel=0.0, rot=(R90, 0, 0), verts=12),
         cyl('gauge', 0.026, 0.02, loc=(0.0, -0.025, H + 0.045), m=M.white, rot=(R90, 0, 0), bevel=0.004, verts=20),
         box('needle', (0.004, 0.003, 0.02), loc=(0.004, -0.046, H + 0.04), m=M.red_btn, bevel=0, rot=(0, 0.5, 0))]
    P.append(pipe('hose', [(0.04, 0, H + 0.06), (0.1, 0, H + 0.05), (0.13, 0, H - 0.05), (0.12, -0.02, 0.18), (0.1, -0.06, 0.12)], 0.016, M.rubber, corner=0.05))
    P.append(cone('nozzle', 0.022, 0.032, 0.06, loc=(0.1, -0.06, 0.12), m=M.dark, rot=(math.radians(160), 0.3, 0), bevel=0.005))
    P.append(text('txt', 'CO2', 0.05, (0, -r - 0.006, 0.195), rot=(R90, 0, 0), m=pmat('ext_ink', '#a8261c', 0.6)))
    P.append(box('tape', (0.03, 0.04, 0.2), loc=(0.085, -0.04, 0.05), m=M.tape, bevel=0.004, rot=(0, 0, 0.8)))
    return P

def B_drill():
    """Mining drill: yellow motor body, steel spiral bit, battery under the grip."""
    yel = worn('drill_body', '#d9a54a', 0.45, 0.15, scale=4)
    zc = 0.2
    P = [xcyl('motor', 0.075, -0.2, 0.06, z=zc, m=yel, verts=32, bevel=0.025),
         box('top', (0.22, 0.1, 0.06), loc=(-0.08, 0, zc + 0.03), m=yel, bevel=0.02),
         xcyl('endcap', 0.07, -0.23, -0.19, z=zc, m=M.dark, bevel=0.015),
         xcyl('nose', 0.06, 0.06, 0.1, z=zc, m=M.dark, bevel=0.01),
         xcyl('chuck', 0.045, 0.1, 0.15, z=zc, m=M.steel, bevel=0.01),
         ring('hz', 0.064, 0.02, 0.03, loc=(0.065, 0, zc), m=M.hazard, rot=(0, R90, 0)),
         cone('bit', 0.038, 0.004, 0.24, loc=(0.15, 0, zc), m=M.steel, rot=(0, R90, 0), verts=24)]
    hel = []
    for i in range(61):                                                # spiral flute around the bit
        k = i / 60; a = k * math.tau * 3.2
        rr = 0.038 * (1 - k) + 0.004
        hel.append((0.155 + k * 0.215, math.cos(a) * rr, zc + math.sin(a) * rr))
    P.append(pipe('flute', hel, 0.007, M.steel, corner=0))
    for i in range(4):
        for sy in (-1, 1):
            P.append(box('vent', (0.012, 0.01, 0.05), loc=(-0.16 + i * 0.03, sy * 0.073, zc - 0.035), m=M.hole, bevel=0.003))
    P.append(_grip(-0.08, 0.05, 0.11, w=0.07, d=0.08, rake=0.22))
    P.append(box('battery', (0.15, 0.1, 0.06), loc=(-0.1, 0, 0.0), m=M.dark, bevel=0.015))
    for i in range(3):
        P.append(box('led', (0.016, 0.006, 0.014), loc=(-0.13 + i * 0.025, -0.052, 0.025), m=glow('led_g', '#2ee070', 1.2), bevel=0))
    P.append(box('trigger', (0.02, 0.03, 0.04), loc=(-0.03, 0, zc - 0.11), m=M.red_btn, bevel=0.006))
    P.append(box('side', (0.05, 0.16, 0.04), loc=(0.02, 0, zc - 0.05), m=M.rubber, bevel=0.012))
    P.append(box('tape', (0.04, 0.155, 0.02), loc=(-0.12, 0, zc + 0.06), m=M.tape, bevel=0.004, rot=(0, 0.3, 0)))
    return P

def B_fuel():
    """Fuel cell: the green cell the reactor takes (same look as in models/ship/reactor.py)."""
    P = [cyl('core', 0.1, 0.34, loc=(0, 0, 0.06), m=glow('cell', '#2ee070', 0.9), bevel=0.0, verts=32),
         cyl('cap_lo', 0.12, 0.07, loc=(0, 0, 0.0), m=M.steel, bevel=0.02),
         cyl('cap_hi', 0.12, 0.07, loc=(0, 0, 0.38), m=M.steel, bevel=0.02),
         cyl('nub', 0.05, 0.05, loc=(0, 0, 0.44), m=M.dark, bevel=0.015),
         ring('band', 0.11, 0.025, 0.05, loc=(0, 0, 0.2), m=M.dark)]
    for i in range(4):
        a = i * math.tau / 4 + math.pi / 4
        P.append(cyl('bar', 0.014, 0.32, loc=(math.cos(a) * 0.105, math.sin(a) * 0.105, 0.065), m=M.steel_dark, verts=8, bevel=0.004))
    P.append(box('stk', (0.07, 0.006, 0.05), loc=(0, -0.122, 0.405), m=M.sticker, bevel=0.002))
    return P

def B_plate():
    """Hull plate: a spare hull panel with bolt holes, nailed over breaches from outside."""
    hull = worn('plate', '#8a93a5', 0.42, 0.45, scale=4)
    W, D = 0.6, 0.46
    P = [box('plate', (W, D, 0.035), m=hull, bevel=0.012),
         box('ridge', (W - 0.16, D - 0.16, 0.02), loc=(0, 0, 0.034), m=hull, bevel=0.012),
         box('ridge2', (W - 0.24, D - 0.24, 0.01), loc=(0, 0, 0.05), m=hull, bevel=0.006)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(cyl('hole', 0.022, 0.01, loc=(sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), 0.03), m=M.hole, verts=16, bevel=0))
        for k in (-1, 0, 1):
            P.append(cyl('rivet', 0.011, 0.008, loc=(sx * (W / 2 - 0.05), k * 0.1, 0.033), m=M.steel_dark, verts=8, bevel=0.003))
    P.append(box('hz', (0.04, D - 0.04, 0.004), loc=(-W / 2 + 0.03, 0, 0.034), m=M.hazard, bevel=0.0))
    P.append(text('st', 'HULL-7', 0.05, (0.0, -0.01, 0.061), m=pmat('stencil', '#3a404c', 0.6)))
    return P

def B_coolant():
    """Coolant canister: cyan, white label band, valve cap and a carry bail."""
    cy_ = worn('cool', '#4ac0e0', 0.35, 0.2, scale=4)
    H, r = 0.34, 0.11
    P = [cyl('body', r, H, m=cy_, bevel=0.04, verts=40),
         cyl('band', r + 0.004, 0.12, loc=(0, 0, 0.1), m=M.white, bevel=0.004, verts=40),
         cyl('foot', r + 0.005, 0.03, m=M.dark, bevel=0.01, verts=40),
         cyl('cap', 0.055, 0.05, loc=(0, 0, H - 0.01), m=M.dark, bevel=0.012),
         ring('wheel', 0.05, 0.012, 0.014, loc=(0, 0, H + 0.04), m=M.red_btn, verts=24),
         cyl('stem', 0.012, 0.03, loc=(0, 0, H + 0.035), m=M.steel)]
    P.append(pipe('bail', [(0, -0.09, H - 0.04), (0, -0.09, H + 0.08), (0, 0.09, H + 0.08), (0, 0.09, H - 0.04)], 0.011, M.steel, corner=0.05))
    P.append(text('txt', 'COOL', 0.06, (0, -r - 0.004, 0.16), rot=(R90, 0, 0), m=pmat('cool_ink', '#1a5a70', 0.6), depth=0.001))
    for sx in (-1, 1):                                                  # frost flakes
        P.append(text('flake', '*', 0.06, (sx * 0.06, -r * 0.75 - 0.008, 0.3), rot=(R90, 0, sx * 0.6), m=M.white))
    return P

def B_blackbox():
    """Black box (flight recorder): orange, heavy, ribbed, hazard band, handle."""
    org = worn('bb', '#e8762e', 0.45, 0.15, scale=3.5)
    W, D, H = 0.58, 0.4, 0.28
    P = [box('body', (W, D, H), m=org, bevel=0.035),
         box('hz', (W - 0.02, 0.09, 0.006), loc=(0, -D / 2 + 0.06, H - 0.004), m=M.hazard, bevel=0.0)]
    for sx in (-1, 1):
        P.append(box('rib', (0.05, D + 0.02, H + 0.02), loc=(sx * 0.17, 0, -0.01), m=M.dark, bevel=0.015))
        for sy in (-1, 1):
            P.append(box('corner', (0.07, 0.07, H + 0.02), loc=(sx * (W / 2 - 0.02), sy * (D / 2 - 0.02), -0.01), m=M.rubber, bevel=0.02))
    P.append(pipe('handle', [(-0.1, 0.06, H), (-0.1, 0.06, H + 0.06), (0.1, 0.06, H + 0.06), (0.1, 0.06, H)], 0.02, M.dark, corner=0.035))
    P.append(box('port', (0.12, 0.01, 0.06), loc=(0, -D / 2 - 0.004, 0.06), m=M.dark, bevel=0.006))
    for i in range(4):
        P.append(box('pin', (0.012, 0.01, 0.02), loc=(-0.036 + i * 0.024, -D / 2 - 0.008, 0.08), m=M.brass, bevel=0))
    P.append(text('t1', 'FLIGHT RECORDER', 0.03, (0, -D / 2 - 0.006, 0.19), rot=(R90, 0, 0), m=M.white))
    P.append(text('t2', 'DO NOT OPEN', 0.026, (0, 0.06, H + 0.002), m=M.ink))
    P.append(box('refl', (0.1, 0.006, 0.04), loc=(0, -D / 2 - 0.003, 0.215), m=M.white, bevel=0))
    return P

def B_ore(seed=3):
    """Ore sample: a rough chunk of rock with glowing cyan crystals growing out of it."""
    import random
    rnd = random.Random(seed)
    rock = worn('rock', '#6e6359', 0.85, 0.0, wear=0.0, scale=6)
    me = bpy.data.meshes.new('rock'); bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.2)
    for v in bm.verts:                                                  # lumpy, faceted
        v.co *= 1 + rnd.uniform(-0.18, 0.14)
    bm.to_mesh(me); bm.free()
    o = mn._obj('rock', me); o.scale = (1.15, 0.95, 0.62); o.location = (0, 0, 0.1)
    bpy.context.view_layer.update(); mn._apply_scale(o); mn.assign(o, rock); mn.bev(o, 0.01, 2)
    P = [o]
    cry = emitm('crystal', '#0e86b8', '#2ad0ff', 0.6, rough=0.12, coat=1.0)
    spec = [(-0.06, -0.02, 0.15, 0.055, 0.24, (-0.35, -0.2)), (0.05, 0.02, 0.15, 0.045, 0.18, (0.4, 0.3)),
            (0.0, 0.07, 0.14, 0.03, 0.12, (-0.2, 0.55)), (-0.13, 0.04, 0.1, 0.028, 0.1, (-0.8, 0.2)),
            (0.12, -0.05, 0.1, 0.025, 0.09, (0.7, -0.5)), (0.02, -0.08, 0.13, 0.024, 0.09, (0.15, -0.7))]
    for x, y, z, r, h, (ry, rx) in spec:
        c = cyl('crys', r, h, m=cry, verts=6, bevel=0)
        t = cone('crys_tip', r, 0.0, r * 1.6, loc=(0, 0, h), m=cry, verts=6)
        g = mn.group('cg', [c, t]); g.location = (x, y, z); g.rotation_euler = (rx, ry, rnd.uniform(0, 1))
        flat(c); flat(t); P += [c, t]
    return P

# ---------------------------------------------------------------------------------------------------------
# Gear builders (icons only; these are what the crew will wear later)
# ---------------------------------------------------------------------------------------------------------
def name_tag(x, y, z, rot=(0, 0, 0)):
    """'MINE' tag taped onto your own copy of a ship item."""
    P = [box('tag', (0.16, 0.08, 0.006), m=M.white, bevel=0.002),
         text('tag_t', 'MINE', 0.045, (0, 0, 0.007), m=pmat('tag_ink', '#c43a2e', 0.6)),
         box('tag_tape', (0.04, 0.1, 0.008), loc=(-0.075, 0, 0.0), m=M.tape, bevel=0.002)]
    g = mn.group('tag', P); g.location = (x, y, z); g.rotation_euler = rot
    return P

def boot(x, y, flip=1):
    suit = worn('boot_white', '#d8dce4', 0.55, 0.05, scale=4)
    P = [box('sole', (0.32, 0.15, 0.05), loc=(x + 0.02, y, 0), m=M.rubber, bevel=0.02),
         box('pad', (0.3, 0.155, 0.012), loc=(x + 0.02, y, 0.012), m=glow('grav', '#9cd8ff', 1.2), bevel=0.003),
         box('foot', (0.28, 0.14, 0.1), loc=(x + 0.015, y, 0.045), m=suit, bevel=0.045),
         sphere('toe', 0.075, loc=(x + 0.12, y, 0.09), m=suit, scale=(1.1, 1, 0.7)),
         box('toecap', (0.07, 0.15, 0.06), loc=(x + 0.15, y, 0.045), m=M.steel_dark, bevel=0.025),
         cyl('shaft', 0.075, 0.2, loc=(x - 0.07, y, 0.09), m=suit, bevel=0.03),
         ring('cuff', 0.08, 0.025, 0.04, loc=(x - 0.07, y, 0.27), m=worn('boot_orange', '#c4683a', 0.5, scale=4)),
         box('strap', (0.03, 0.165, 0.04), loc=(x + 0.03, y, 0.11), m=M.dark, bevel=0.008),
         box('buckle', (0.04, 0.012, 0.03), loc=(x + 0.03, y - 0.085, 0.115), m=M.steel, bevel=0.004),
         cyl('mag', 0.03, 0.012, loc=(x - 0.07, y - 0.078, 0.17), m=glow('grav2', '#9cd8ff', 1.0), rot=(R90, 0, 0), bevel=0.003)]
    return P

def B_boots():
    return boot(-0.02, 0.1) + boot(0.06, -0.1)

def B_thrusters():
    """Suit thruster pack: sits on the astronaut's backpack. Two nozzles, side tanks, straps."""
    suit = worn('pack', '#d8dce4', 0.5, 0.05, scale=3)
    P = [box('pack', (0.36, 0.18, 0.42), loc=(0, 0, 0.1), m=suit, bevel=0.05),
         box('lid', (0.3, 0.19, 0.06), loc=(0, 0, 0.47), m=worn('pack_or', '#c4683a', 0.5, scale=3), bevel=0.025),
         box('panel', (0.2, 0.01, 0.16), loc=(0, -0.093, 0.26), m=M.dark, bevel=0.01),
         box('hz', (0.3, 0.01, 0.04), loc=(0, -0.093, 0.13), m=M.hazard, bevel=0.0)]
    for i in range(3):
        P.append(box('led', (0.03, 0.008, 0.02), loc=(-0.05 + i * 0.05, -0.1, 0.38), m=glow('led_' + str(i), ('#2ee070', '#2ee070', '#e8c34f')[i], 1.2), bevel=0))
    for sx in (-1, 1):
        P.append(cyl('tank', 0.055, 0.34, loc=(sx * 0.215, 0.0, 0.12), m=M.steel, bevel=0.025))
        P.append(cyl('tank_cap', 0.03, 0.04, loc=(sx * 0.215, 0.0, 0.46), m=M.dark, bevel=0.01))
        P.append(cone('nozzle', 0.04, 0.07, 0.11, loc=(sx * 0.1, 0.0, 0.1), m=M.steel_dark, rot=(math.pi, 0, 0), bevel=0.008))
        P.append(cyl('flame', 0.045, 0.006, loc=(sx * 0.1, 0.0, -0.016), m=glow('thr', '#ffa040', 1.5), bevel=0))
        P.append(ring('strap', 0.05, 0.015, 0.03, loc=(sx * 0.215, 0, 0.32), m=M.dark))
    P.append(text('st', 'MN-J2', 0.035, (0, -0.1, 0.3), rot=(R90, 0, 0), m=M.white))
    P.append(box('tape', (0.05, 0.2, 0.06), loc=(0.14, 0, 0.4), m=M.tape, bevel=0.004, rot=(0, 0.6, 0)))
    return P

def B_firstaid():
    """First aid course: the medic badge (worn on the suit) on its certificate."""
    P = [box('card', (0.5, 0.36, 0.015), m=pmat('paper', '#ece4cf', 0.7, grime=0.4, grime_scale=8), bevel=0.003, rot=(0, 0, 0.12))]
    for i in range(4):
        P.append(box('line', (0.16 - (i % 2) * 0.04, 0.012, 0.003), loc=(0.11 + 0.0 * i, 0.09 - i * 0.045, 0.015), m=pmat('pline', '#8a8a88', 0.7), bevel=0, rot=(0, 0, 0.12)))
    P.append(text('cert', 'CERTIFIED', 0.035, (0.0, 0.15, 0.017), rot=(0, 0, 0.12)))
    P += [cyl('badge', 0.14, 0.03, loc=(-0.07, -0.03, 0.015), m=M.white, bevel=0.012, verts=48),
          ring('rim', 0.145, 0.025, 0.035, loc=(-0.07, -0.03, 0.015), m=worn('badge_rim', '#5fb04a', 0.4, scale=6), verts=48),
          box('cr1', (0.15, 0.05, 0.012), loc=(-0.07, -0.03, 0.044), m=M.red_btn, bevel=0.004),
          box('cr2', (0.05, 0.15, 0.012), loc=(-0.07, -0.03, 0.044), m=M.red_btn, bevel=0.004)]
    P.append(box('ribbon1', (0.06, 0.16, 0.008), loc=(-0.11, -0.16, 0.012), m=pmat('rib', '#3a8fc4', 0.6), bevel=0.002, rot=(0, 0, -0.3)))
    P.append(box('ribbon2', (0.06, 0.16, 0.008), loc=(-0.03, -0.16, 0.012), m=pmat('rib', '#3a8fc4', 0.6), bevel=0.002, rot=(0, 0, 0.3)))
    return P

def B_armor():
    """Armor vest: a vest-shaped carrier (V neck, arm holes) with chest and belly plates, shoulder straps."""
    plate = worn('armor', '#5a6272', 0.45, 0.4, scale=3)
    web = worn('web', '#3a4a3a', 0.85, 0.0, wear=0.2, scale=5)
    # outline in (x, z), front view; extruded in y (thickness), then stood up
    vest = [(-0.24, 0.0), (0.24, 0.0), (0.25, 0.3), (0.2, 0.38), (0.17, 0.5), (0.08, 0.52), (0.0, 0.36),
            (-0.08, 0.52), (-0.17, 0.5), (-0.2, 0.38), (-0.25, 0.3)]
    v = slab('vest', [(x, -z) for x, z in vest], -0.07, 0.07, m=web, bevel=0.03, rot=(-R90, 0, 0))
    P = [v]
    for sx in (-1, 1):
        P.append(box('chest', (0.17, 0.04, 0.15), loc=(sx * 0.115, -0.085, 0.2), m=plate, bevel=0.02))
        P.append(box('strap', (0.07, 0.15, 0.03), loc=(sx * 0.125, 0.0, 0.5), m=web, bevel=0.012))
        P.append(box('molle', (0.05, 0.01, 0.12), loc=(sx * 0.21, -0.075, 0.08), m=pmat('molle', '#2a342a', 0.9), bevel=0.003))
    for i in range(2):
        P.append(box('belly', (0.38, 0.04, 0.075), loc=(0, -0.085, 0.03 + i * 0.085), m=plate, bevel=0.018))
    P.append(box('hz', (0.13, 0.01, 0.025), loc=(-0.115, -0.106, 0.31), m=M.hazard, bevel=0))
    P.append(box('patch', (0.07, 0.01, 0.04), loc=(0.115, -0.106, 0.29), m=M.sticker, bevel=0.002))
    P.append(box('buckle', (0.05, 0.02, 0.035), loc=(0, -0.11, 0.05), m=M.steel, bevel=0.006))
    P.append(box('dent_tape', (0.09, 0.01, 0.025), loc=(0.12, -0.107, 0.22), m=M.tape, bevel=0.002, rot=(0, 0.5, 0)))
    return P

def B_stim():
    """Stim pack: auto-injector pen with a glowing green dose window."""
    zc = 0.05
    P = [xcyl('body', 0.045, -0.2, 0.12, z=zc, m=M.white, bevel=0.015),
         xcyl('cap', 0.05, -0.27, -0.2, z=zc, m=M.red_btn, bevel=0.02),
         xcyl('win_bg', 0.047, -0.08, 0.04, z=zc, m=M.dark, bevel=0.004),
         xcyl('dose', 0.042, -0.075, 0.035, z=zc, m=emitm('dose', '#4ac060', '#9cff5a', 1.2, rough=0.1, coat=1.0), bevel=0.002),
         xcyl('collar', 0.04, 0.12, 0.16, z=zc, m=M.steel, bevel=0.008),
         cone('tip', 0.03, 0.015, 0.05, loc=(0.16, 0, zc), m=M.steel_dark, rot=(0, R90, 0)),
         xcyl('needle', 0.004, 0.21, 0.25, z=zc, m=M.steel, bevel=0)]
    P.append(ring('band', 0.047, 0.01, 0.02, loc=(0.075, 0, zc), m=M.hazard, rot=(0, R90, 0)))
    P.append(box('clip', (0.12, 0.012, 0.02), loc=(-0.15, 0, zc + 0.04), m=M.steel, bevel=0.004))
    return P

def B_toolbelt():
    """Toolbelt: belt with pouches; a wrench and a screwdriver sticking out."""
    leather = worn('leather', '#6a4a30', 0.7, 0.0, wear=0.3, scale=5)
    canvas = worn('canvas', '#8a7a52', 0.8, 0.0, wear=0.2, scale=5)
    P = []
    R = 0.26                                                            # the belt: an oval loop of segments
    def at(a): return math.sin(a) * R * 1.15, -math.cos(a) * R
    for i in range(36):
        a = math.radians(i * 10); x, y = at(a)
        b = box('belt', (0.06, 0.022, 0.07), loc=(x, y, 0.1), m=leather, bevel=0.006); b.rotation_euler = (0, 0, a); P.append(b)
    P.append(box('buckle', (0.09, 0.03, 0.09), loc=(0, -R - 0.012, 0.09), m=M.steel, bevel=0.012))
    P.append(box('buckle_in', (0.05, 0.03, 0.05), loc=(0, -R - 0.02, 0.11), m=leather, bevel=0.005))
    for deg, w, h in ((-48, 0.13, 0.17), (50, 0.12, 0.15)):
        a = math.radians(deg); x, y = at(a)
        P.append(box('pouch', (w, 0.07, h), loc=(x * 1.12, y * 1.12, 0.0), m=canvas, bevel=0.02, rot=(0, 0, a)))
        P.append(box('flap', (w + 0.01, 0.075, 0.05), loc=(x * 1.13, y * 1.13, h - 0.04), m=leather, bevel=0.012, rot=(0, 0, a)))
        P.append(cyl('snap', 0.012, 0.01, loc=(x * 1.28, y * 1.28, h - 0.025), m=M.steel, rot=(R90, 0, a), verts=10, bevel=0.003))
    wr = wrench_parts(L=0.3, t=0.02, z=0, pre='tw')                      # wrench out of the left pouch
    g = mn.group('tw', wr); x, y = at(math.radians(-48)); g.location = (x * 1.12, y * 1.12, 0.25); g.rotation_euler = (R90, -1.3, math.radians(-48)); P += wr
    x, y = at(math.radians(50))
    P.append(cyl('sd_handle', 0.022, 0.1, loc=(x * 1.1 - 0.02, y * 1.1, 0.12), m=M.red_btn, bevel=0.008, verts=8, rot=(0, 0.2, 0)))
    P.append(cyl('sd_shaft', 0.006, 0.08, loc=(x * 1.1, y * 1.1, 0.215), m=M.steel, bevel=0, rot=(0, 0.2, 0)))
    P.append(box('pliers', (0.025, 0.02, 0.12), loc=(x * 1.1 + 0.035, y * 1.1, 0.1), m=M.steel_dark, bevel=0.006, rot=(0, -0.3, 0)))
    x, y = at(math.radians(-48))
    P.append(box('tape', (0.06, 0.075, 0.03), loc=(x * 1.2, y * 1.2, 0.05), m=M.tape, bevel=0.004, rot=(0, 0, -0.5)))
    return P

def B_overcharge():
    """Reactor overcharge: a big red override button under a flip cover, lightning sticker."""
    base = worn('oc_base', '#4a515e', 0.45, 0.4, scale=4)
    P = [box('base', (0.5, 0.4, 0.12), m=base, bevel=0.03),
         box('hz', (0.46, 0.36, 0.01), loc=(0, 0, 0.12), m=M.hazard, bevel=0.0),
         box('plate', (0.34, 0.26, 0.02), loc=(0, 0.01, 0.125), m=M.dark, bevel=0.01),
         cyl('collar', 0.11, 0.05, loc=(0, 0.01, 0.14), m=M.steel, bevel=0.015),
         cyl('btn', 0.085, 0.06, loc=(0, 0.01, 0.18), m=pmat('btn_red', '#e2574c', 0.3), bevel=0.03, verts=40),
         sphere('btn_top', 0.085, loc=(0, 0.01, 0.235), m=pmat('btn_red', '#e2574c', 0.3), scale=(1, 1, 0.35))]
    cov = box('cover', (0.26, 0.24, 0.12), m=emitm('cover', '#c8d8e8', '#ffffff', 0.0, rough=0.05, coat=1.0, alpha=0.3), bevel=0.02)
    cov.location = (0, 0.15, 0.16); cov.rotation_euler = (math.radians(-70), 0, 0); P.append(cov)
    bolt = [(-0.02, 0.07), (0.035, 0.07), (0.01, 0.015), (0.04, 0.015), (-0.03, -0.07), (-0.005, -0.01), (-0.035, -0.01)]
    P.append(slab('bolt', bolt, 0, 0.012, m=glow('bolt_glow', '#ffb030', 1.3), bevel=0.002, loc=(0.18, -0.12, 0.12)))
    P.append(slab('bolt2', bolt, 0, 0.012, m=glow('bolt_glow', '#ffb030', 1.3), bevel=0.002, loc=(-0.18, -0.12, 0.12)))
    P.append(box('label', (0.18, 0.01, 0.05), loc=(0, -0.205, 0.04), m=M.sticker, bevel=0.003))
    P.append(text('lt', 'OVERRIDE', 0.03, (0, -0.212, 0.065), rot=(R90, 0, 0)))
    return P

# ---------------------------------------------------------------------------------------------------------
# Ship upgrade builders (icons only)
# ---------------------------------------------------------------------------------------------------------
def B_spare_cell():
    tray = worn('tray', '#4a515e', 0.45, 0.4, scale=4)
    P = [box('tray', (0.62, 0.3, 0.08), m=tray, bevel=0.025), box('hz', (0.6, 0.02, 0.05), loc=(0, -0.15, 0.015), m=M.hazard, bevel=0)]
    for i, x in enumerate((-0.15, 0.15)):
        cell = B_fuel(); g = mn.group('c', cell); g.location = (x, 0, 0.05); P += cell
    plus = [box('p1', (0.16, 0.05, 0.04), m=glow('plus', '#5fd6a0', 1.3), bevel=0.01), box('p2', (0.05, 0.16, 0.04), m=glow('plus', '#5fd6a0', 1.3), bevel=0.01)]
    g = mn.group('plus', plus); g.location = (0.0, -0.05, 0.62); g.rotation_euler = (R90 - 0.5, 0, 0); P += plus
    return P

def B_coffee():
    body = worn('coffee', '#b8402e', 0.4, 0.2, scale=3)
    P = [box('base', (0.44, 0.34, 0.06), m=M.dark, bevel=0.02),
         box('drip', (0.24, 0.2, 0.012), loc=(0.0, -0.05, 0.06), m=M.steel, bevel=0.004),
         box('back', (0.44, 0.16, 0.56), loc=(0, 0.09, 0.0), m=body, bevel=0.04),
         box('head', (0.44, 0.34, 0.16), loc=(0, 0.0, 0.42), m=body, bevel=0.04),
         box('top', (0.4, 0.3, 0.03), loc=(0, 0.0, 0.58), m=M.steel, bevel=0.01),
         cyl('spout', 0.03, 0.05, loc=(0, -0.06, 0.37), m=M.steel_dark, bevel=0.01),
         box('screen', (0.16, 0.01, 0.07), loc=(-0.06, -0.172, 0.47), m=glow('cscreen', '#2ee070', 1.0), bevel=0.003),
         cyl('dial', 0.035, 0.03, loc=(0.12, -0.17, 0.5), m=M.steel, rot=(R90, 0, 0), bevel=0.008),
         cyl('mug', 0.065, 0.13, loc=(0, -0.06, 0.072), m=M.white, bevel=0.015),
         cyl('coffee', 0.054, 0.005, loc=(0, -0.06, 0.19), m=pmat('cof', '#3a2010', 0.15), bevel=0),
         ring('mug_h', 0.04, 0.015, 0.02, loc=(0.07, -0.05, 0.13), m=M.white, rot=(R90, 0, 0)),
         text('mug_t', 'BEST CREW', 0.018, (0, -0.127, 0.13), rot=(R90, 0, 0), m=M.red_btn)]
    for i in range(3):                                                  # steam puffs
        P.append(sphere('steam', 0.03 + i * 0.008, loc=(0.01 * (i % 2), -0.07, 0.24 + i * 0.05), m=emitm('steam', '#e8ecf0', '#ffffff', 0.15, alpha=0.5), segs=16))
    P.append(box('tape', (0.06, 0.18, 0.1), loc=(-0.2, 0.0, 0.25), m=M.tape, bevel=0.004))
    return P

def B_inserter():
    """Reactor fuel inserter: a little robot arm with a fuel cell in its claw."""
    yel = worn('arm', '#e8c34f', 0.45, 0.15, scale=4)
    P = [cyl('base', 0.17, 0.06, m=M.dark, bevel=0.02), cyl('turn', 0.11, 0.08, loc=(0, 0, 0.06), m=yel, bevel=0.02),
         ring('hz', 0.17, 0.04, 0.02, loc=(0, 0, 0.06), m=M.hazard)]
    a1 = box('arm1', (0.08, 0.08, 0.34), m=yel, bevel=0.025); a1.location = (-0.04, 0, 0.3); a1.rotation_euler = (0, -0.35, 0)
    j1 = ycyl('j1', 0.06, -0.06, 0.06, x=0.0, z=0.14, m=M.steel_dark)
    j2 = ycyl('j2', 0.055, -0.055, 0.055, x=-0.1, z=0.44, m=M.steel_dark)
    a2 = box('arm2', (0.32, 0.07, 0.07), m=yel, bevel=0.022); a2.location = (0.04, 0, 0.43); a2.rotation_euler = (0, 0.4, 0)
    P += [a1, j1, j2, a2]
    P.append(pipe('hose', [(-0.02, 0.05, 0.16), (-0.12, 0.06, 0.3), (-0.12, 0.05, 0.44)], 0.012, M.rubber, corner=0.05))
    cx, cz = 0.2, 0.27
    P.append(cyl('wrist', 0.045, 0.06, loc=(cx, 0, cz + 0.04), m=M.steel_dark, bevel=0.01))
    for sx in (-1, 1):
        P.append(box('claw', (0.025, 0.05, 0.12), loc=(cx + sx * 0.07, 0, cz - 0.08), m=M.steel, bevel=0.008))
    cell = B_fuel(); g = mn.group('c', cell); g.location = (cx, 0, cz - 0.38); g.scale = (0.75, 0.75, 0.75); P += cell
    return P

def B_cannons():
    """Efficient cannons: a stubby ship cannon and four shells (4 shots per energy)."""
    gun = worn('cannon', '#5a6272', 0.4, 0.4, scale=3)
    P = [box('mount', (0.3, 0.3, 0.12), m=M.dark, bevel=0.03),
         box('breech', (0.26, 0.22, 0.18), loc=(-0.04, 0, 0.12), m=gun, bevel=0.04),
         xcyl('barrel', 0.065, 0.08, 0.42, z=0.21, m=gun, bevel=0.015),
         xcyl('muzzle', 0.082, 0.38, 0.46, z=0.21, m=M.steel_dark, bevel=0.015),
         xcyl('bore', 0.04, 0.46, 0.462, z=0.21, m=M.hole, bevel=0),
         ring('hz', 0.08, 0.02, 0.05, loc=(0.12, 0, 0.21), m=M.hazard, rot=(0, R90, 0))]
    for i in range(4):
        x, y = -0.2 + i * 0.13, -0.3
        P.append(cyl('shell', 0.04, 0.13, loc=(x, y, 0), m=M.brass, bevel=0.01))
        P.append(cone('shell_tip', 0.04, 0.012, 0.07, loc=(x, y, 0.13), m=glow('shell_glow', '#ffe08a', 0.9)))
    P.append(text('x4', 'x4', 0.09, (0.0, 0.0, 0.305), m=M.white))
    return P

def B_airlocks():
    """Faster airlock pumps: a pump with a big fan, pipes and a pressure gauge."""
    body = worn('pump', '#3a7a8a', 0.42, 0.3, scale=3)
    P = [box('skid', (0.56, 0.36, 0.05), m=M.dark, bevel=0.02),
         cyl('housing', 0.17, 0.26, loc=(-0.06, 0, 0.05), m=body, bevel=0.03, verts=40),
         ring('rim', 0.175, 0.03, 0.04, loc=(-0.06, 0, 0.29), m=M.steel, verts=40),
         cyl('fan_bg', 0.15, 0.01, loc=(-0.06, 0, 0.3), m=M.hole, bevel=0)]
    for i in range(6):
        b = box('blade', (0.13, 0.05, 0.01), m=M.steel, bevel=0.004); b.location = (-0.06 + math.cos(i * 1.047) * 0.07, math.sin(i * 1.047) * 0.07, 0.305)
        b.rotation_euler = (0.4, 0, i * 1.047); P.append(b)
    P.append(cyl('hub', 0.035, 0.03, loc=(-0.06, 0, 0.3), m=M.hazard, bevel=0.01))
    P.append(pipe('pipe', [(0.1, 0, 0.15), (0.24, 0, 0.15), (0.24, 0, 0.45)], 0.045, M.copper, corner=0.08))
    P.append(ring('flange', 0.06, 0.03, 0.03, loc=(0.24, 0, 0.42), m=M.steel))
    P.append(cyl('gauge', 0.05, 0.03, loc=(0.18, -0.12, 0.2), m=M.steel, rot=(R90, 0, 0), bevel=0.01))
    P.append(cyl('gface', 0.04, 0.01, loc=(0.18, -0.15, 0.2), m=M.white, rot=(R90, 0, 0), bevel=0.002))
    P.append(box('gneedle', (0.006, 0.005, 0.035), loc=(0.19, -0.162, 0.2), m=M.red_btn, bevel=0, rot=(0, 1.0, 0)))
    for i in range(3):                                                  # speed lines
        P.append(box('speed', (0.1 - i * 0.02, 0.012, 0.012), loc=(-0.32 - i * 0.02, -0.05 + i * 0.06, 0.18 + i * 0.03), m=glow('speed', '#9cd8ff', 1.0), bevel=0.003))
    P.append(cyl('tape', 0.05, 0.05, loc=(0.24, 0, 0.27), m=M.tape, bevel=0.005))
    return P

def B_radar():
    """Long-range radar: dish on a mast, feed horn, a glowing scope at its base."""
    paint = worn('radar', '#c9ced8', 0.4, 0.3, scale=3)
    P = [box('base', (0.36, 0.3, 0.1), m=M.dark, bevel=0.03), cyl('mast', 0.04, 0.3, loc=(0, 0, 0.1), m=M.steel_dark),
         cyl('scope', 0.06, 0.01, loc=(0.0, -0.152, 0.05), m=glow('scope', '#2ee070', 1.0), rot=(R90, 0, 0), bevel=0)]
    dish = cone('dish', 0.06, 0.32, 0.12, m=paint, verts=48, bevel=0.01)
    md = dish.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.015; dish.modifiers.move(len(dish.modifiers) - 1, 0)
    for f in dish.data.polygons: pass
    bm = bmesh.new(); bm.from_mesh(dish.data)                            # open the top: it's a dish
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.99 and f.calc_center_median().z > 0.1], context='FACES')
    bm.to_mesh(dish.data); bm.free()
    inner = cone('dish_in', 0.05, 0.3, 0.11, loc=(0, 0, 0.012), m=M.white, verts=48)
    bm = bmesh.new(); bm.from_mesh(inner.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.99 and f.calc_center_median().z > 0.1], context='FACES')
    bm.to_mesh(inner.data); bm.free()
    feed = []
    for i in range(3):
        a = i * math.tau / 3
        feed.append(pipe('strut', [(math.cos(a) * 0.26, math.sin(a) * 0.26, 0.11), (0, 0, 0.3)], 0.008, M.steel, corner=0))
    feed.append(cyl('horn', 0.03, 0.06, loc=(0, 0, 0.27), m=M.dark, bevel=0.01))
    feed.append(sphere('horn_led', 0.018, loc=(0, 0, 0.335), m=glow('rled', '#e2574c', 1.3), segs=12))
    g = mn.group('dishg', [dish, inner] + feed); g.location = (0, 0, 0.38); g.rotation_euler = (math.radians(35), 0, math.radians(-55))
    P += [dish, inner] + feed
    P.append(ycyl('pivot', 0.05, -0.06, 0.06, z=0.38, m=M.steel_dark))
    return P

def B_shields():
    """Shield capacitors: a capacitor bank with a glowing blue shield bubble over its emitter."""
    body = worn('shc', '#4a515e', 0.45, 0.4, scale=3)
    blue = glow('shb', '#5ab0ff', 1.2)
    P = [box('base', (0.46, 0.34, 0.08), m=M.dark, bevel=0.025)]
    for i, x in enumerate((-0.12, 0.12)):
        P.append(cyl('cap', 0.09, 0.28, loc=(x, 0.03, 0.08), m=body, bevel=0.02))
        for k in range(3):
            P.append(ring('coil', 0.094, 0.015, 0.025, loc=(x, 0.03, 0.13 + k * 0.06), m=blue))
        P.append(cyl('term', 0.03, 0.04, loc=(x, 0.03, 0.36), m=M.brass, bevel=0.008))
    P.append(cyl('emit', 0.06, 0.06, loc=(0, -0.12, 0.08), m=M.steel, bevel=0.015))
    bub = sphere('bubble', 0.34, loc=(0, 0.0, 0.08), m=rim_glow('bubble', '#6ab8ff', 1.3), scale=(1, 1, 0.9), segs=48)
    bub['no_outline'] = 1; bub.visible_shadow = False; P.append(bub)
    hexs = []
    for k in range(6):                                                  # hex shield emblem
        a = k * math.pi / 3; hexs.append((math.cos(a) * 0.06, math.sin(a) * 0.06))
    P.append(slab('hex', hexs, 0, 0.01, m=blue, bevel=0.003, loc=(0, -0.172, 0.04), rot=(R90, 0, 0)))
    return P

def B_caps():
    """Bigger capacitors: a fat capacitor with four energy bars lit and a + terminal."""
    body = worn('cap', '#4a515e', 0.45, 0.4, scale=3)
    en = glow('energy', '#ffe08a', 1.1)
    P = [cyl('foot', 0.2, 0.05, m=M.dark, bevel=0.015, verts=40), cyl('body', 0.17, 0.48, loc=(0, 0, 0.05), m=body, bevel=0.03, verts=40),
         cyl('cap', 0.18, 0.05, loc=(0, 0, 0.5), m=M.steel_dark, bevel=0.015, verts=40),
         box('win', (0.12, 0.05, 0.36), loc=(0, -0.14, 0.1), m=M.dark, bevel=0.012)]
    for i in range(4):
        P.append(box('bar', (0.09, 0.03, 0.065), loc=(0, -0.158, 0.12 + i * 0.085), m=en, bevel=0.005))
    for sx, t in ((-1, '+'), (1, '-')):
        P.append(cyl('term', 0.035, 0.07, loc=(sx * 0.08, 0, 0.55), m=M.brass if t == '+' else M.steel, bevel=0.01))
    P.append(text('plus', '+', 0.07, (-0.08, -0.04, 0.551), m=M.red_btn))
    P.append(box('hz', (0.3, 0.02, 0.03), loc=(0, -0.17, 0.05), m=M.hazard, bevel=0, rot=(0, 0, 0)))
    P.append(ring('band', 0.175, 0.02, 0.04, loc=(0, 0, 0.47), m=M.hazard, verts=40))
    return P

def B_hull():
    """Reinforced hull: a hull panel with a thick armour plate bolted on top."""
    hull = worn('hullp', '#8a93a5', 0.42, 0.45, scale=3)
    arm = worn('armorp', '#5a6272', 0.42, 0.5, scale=3)
    P = [box('panel', (0.66, 0.5, 0.05), m=hull, bevel=0.015),
         box('armor', (0.5, 0.36, 0.08), loc=(0.02, 0.0, 0.05), m=arm, bevel=0.025),
         box('armor2', (0.36, 0.22, 0.03), loc=(0.02, 0.0, 0.13), m=arm, bevel=0.012),
         box('hz', (0.04, 0.46, 0.006), loc=(-0.3, 0, 0.05), m=M.hazard, bevel=0)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(cyl('bolt', 0.03, 0.03, loc=(0.02 + sx * 0.2, sy * 0.14, 0.13), m=M.steel, verts=6, bevel=0.008))
    P.append(text('x2', 'x2', 0.09, (0.02, 0.0, 0.161), m=M.white))
    return P

def B_sprinklers():
    """Fire sprinklers: a sprinkler head on its pipe, spraying water drops."""
    water = emitm('water', '#3a8fd8', '#9cd8ff', 0.4, rough=0.05, coat=1.0)
    P = [pipe('pipe', [(-0.35, 0.0, 0.62), (0.0, 0.0, 0.62), (0.0, 0.0, 0.5)], 0.04, M.copper, corner=0.08),
         cyl('fit', 0.05, 0.05, loc=(0, 0, 0.46), m=M.brass, verts=6, bevel=0.01),
         cyl('neck', 0.022, 0.06, loc=(0, 0, 0.4), m=M.brass),
         cyl('bulb', 0.015, 0.05, loc=(0, 0, 0.36), m=emitm('bulb', '#e2574c', '#ff6040', 0.6, rough=0.05, coat=1)),
         cyl('deflector', 0.06, 0.01, loc=(0, 0, 0.35), m=M.brass, bevel=0.003)]
    for sx in (-1, 1):
        P.append(box('arm', (0.012, 0.012, 0.08), loc=(sx * 0.03, 0, 0.36), m=M.brass, bevel=0.003))
    import random
    rnd = random.Random(5)
    for i in range(22):                                                 # spray cone of drops
        a = rnd.uniform(0, math.tau); d = rnd.uniform(0.05, 0.3); z = 0.33 - d * rnd.uniform(0.6, 1.4)
        P.append(sphere('drop', rnd.uniform(0.012, 0.022), loc=(math.cos(a) * d, math.sin(a) * d, z), m=water, scale=(0.8, 0.8, 1.3), segs=12))
    P.append(cyl('puddle', 0.22, 0.004, loc=(0, 0, 0), m=emitm('puddle', '#2a5a8a', '#5a9ad8', 0.15, rough=0.02, coat=1, alpha=0.6), bevel=0))
    P.append(cyl('tape', 0.046, 0.05, loc=(-0.2, 0, 0.62 - 0.046), m=M.tape, rot=(0, R90, 0)))
    return P

# ---------------------------------------------------------------------------------------------------------
# Posing and rendering
# ---------------------------------------------------------------------------------------------------------
def root_all(name='root'):
    """Parent every top-level mesh/empty (incl. boolean cutters) under one root empty."""
    s = bpy.context.scene
    r = mn.link(bpy.data.objects.new(name, None))
    for o in list(s.objects):
        if o is r or o.type not in ('MESH', 'EMPTY') or o.parent: continue
        o.parent = r
    return r

def world_bbox(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH' or o.get('cutter'): continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    return lo, hi

def lay(root, parts, seq=(), scale=1.0):
    """Rotate the model (seq: [(axis, degrees), ...] about world axes, in order) and set it down:
    footprint centred on the origin, lowest point on z = 0."""
    from mathutils import Matrix
    R = Matrix.Identity(3)
    for ax, deg in seq: R = Matrix.Rotation(math.radians(deg), 3, ax) @ R
    root.rotation_mode = 'QUATERNION'; root.rotation_quaternion = R.to_quaternion(); root.location = (0, 0, 0); root.scale = (scale,) * 3
    lo, hi = world_bbox(parts)
    root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
    bpy.context.view_layer.update()
    return world_bbox(parts)

ICON = 128
def render_icon(name, parts, fill=0.84, size=ICON, outline_px=2.2):
    """Square icon, beauty only, the model centred and scaled to fill `fill` of the canvas."""
    s = bpy.context.scene
    parts = [o for o in parts if o.type == 'MESH']
    x0, x1, y0, y1 = mn._bounds(parts)
    ppu = size * fill / max(x1 - x0, y1 - y0)
    mn.outline([o for o in parts if not o.get('no_outline')], thickness=outline_px / ppu)
    x0, x1, y0, y1 = mn._bounds(parts)
    s.render.resolution_x = s.render.resolution_y = size; s.render.resolution_percentage = 100
    c = mn._cam(); c.data.ortho_scale = size / ppu
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; e = math.radians(mn.ELEVATION)
    up = Vector((0, math.sin(e), math.cos(e))); back = Vector((0, -math.cos(e), math.sin(e)))
    c.location = Vector((cx, 0, 0)) + up * cy + back * 60; c.data.clip_end = 200
    path = os.path.join(mn.OUT_DIR, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mn._render_to(path + '.png', 'beauty')
    mn._manifest_put(name, {'w': size, 'h': size, 'ox': size / 2, 'oy': size / 2, 'dirs': 1, 'frames': 1,
                            'files': [os.path.relpath(path, mn.OUT_DIR)], 'icon': True})
    print(f'[items] icon {name}')
