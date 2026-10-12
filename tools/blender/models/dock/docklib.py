"""Shared geometry, materials and kit pieces for the ships that dock with ours (js/dock.js).

The game's layout (dockGeom in js/dock.js), written for the port side relative to our airlock hatch:
    u = x - hatch.x   (port; the starboard layout is mirrored: x = SHIP_W - u)
    v = y - hatch.y   (hatch y = 19.2 port, 19.4 starboard)
Blender: X = S * u (S = +1 port, -1 starboard), Y = -v, Z = height. So the Blender origin is the hatch
point on the ground, (hatch.x, hatch.y) in game coordinates: every docked-ship sprite uses it as its
origin (manifest ox/oy), props use their own game point (crate, core, door centre).

The port and starboard sprites are separate renders of a mirrored build (light stays front-right,
text reads the right way), like the interceptor does it.

Heights follow the ship's wall kit (models/ship/walls.py): full walls 1.6, low cutaway walls 0.35.
A docked ship is built as two masses:
    low deck  z 0 .. 0.35 over the whole hull outline, rooms/doors/tube opening cut out;
    upper     z 0 .. 1.6  north of v = -0.8 only (the back walls, the walls between rooms and the
              end walls down to the door jambs), rooms cut out.
So everything south of the doors is a low cutaway: nothing tall stands in front of a walkable floor.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'ship'))
import bpy, bmesh
from mathutils import Vector
import mn
from shiplib import pmat, glow, pipe, label, ring, shadow_catcher, _fillet, _curve_to_mesh

E = math.radians(mn.ELEVATION); SIN, COS = math.sin(E), math.cos(E); COT = COS / SIN
R90 = math.radians(90)

# ---------------------------------------------------------------------------------------------------
# The game's geometry (js/dock.js dockGeom, js/ship.js HATCHES), port layout relative to the hatch
# ---------------------------------------------------------------------------------------------------
SHIP_W = 44.4
HATCH = {'port': (0.0, 19.2), 'star': (44.4, 19.4)}
TUBE = (-5.6, -0.6, 0.7, 0.6)                                   # (u0, v0, u1, v1)
ROOMS = {'airlock': (-10.2, -2.4, -5.6, 2.4), 'cargo': (-18.4, -4.0, -10.8, 4.0), 'core': (-25.0, -2.8, -19.0, 2.8)}
DOORS = [(-10.8, -0.8, -10.2, 0.8), (-19.0, -0.8, -18.4, 0.8)]   # airlock-cargo, cargo-core
HULLR = (-25.7, -4.7, -4.9, 4.7)                                # drawDock: rooms + doors bbox +- 0.7
HULL_RAD = 0.375                                                # rr(..., 18 px) at T = 48
SPOT = dict(crate=(-14.6, -2.6), core=(-23.6, 0.0), box=(-22.4, 1.8), npc=(-16.0, 2.4), alien=(-21.5, -1.6),
            fire=(-14.6, 1.4), entry=(-7.9, 0.0), tubeMid=(-2.5, 0.0), loot_drop=(-13.6, -1.4))
CRATE_WH = (1.3, 1.0); CORE_WH = (1.8, 2.2)
H_FULL, H_LOW, SPLIT = 1.6, 0.35, -0.8                          # upper mass only where v < SPLIT
FLOOR_Z = 0.035

S = 1
def set_side(side):
    global S
    S = 1 if side == 'port' else -1

def P(u, v, z=0.0):
    return Vector((S * u, -v, z))

def game_pt(side, u, v):
    hx, hy = HATCH[side]
    return (hx + (u if side == 'port' else -u), hy + v)

# ---------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------
GAIN = 1.35
def lift(color, g=GAIN):
    return tuple(min(1.0, c * g) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, wear=0.5, grime=1.0, scale=1.0, frost=0.0, rust=0.0):
    """Worn paint (after models/enemy/interceptor.py): AO + blotchy grime, fine scratches, plus optional
    rust blooms (orange-brown, rough) and frost (white-blue, in noisy patches that favour up-facing surfaces)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.15; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 2.5 * scale; blot.inputs['Detail'].default_value = 6
    Lk(tc.outputs['Object'], blot.inputs['Vector'])
    g1 = N.new('ShaderNodeMapRange'); g1.inputs['From Min'].default_value = 0.45; g1.inputs['From Max'].default_value = 0.75
    g1.inputs['To Max'].default_value = 0.3 * grime; Lk(blot.outputs['Fac'], g1.inputs['Value'])
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.75 * grime; Lk(aoi.outputs[0], aok.inputs[0])
    gs = N.new('ShaderNodeMath'); gs.operation = 'ADD'; gs.use_clamp = True; Lk(g1.outputs[0], gs.inputs[0]); Lk(aok.outputs[0], gs.inputs[1])
    dirt = N.new('ShaderNodeMix'); dirt.data_type = 'RGBA'; dirt.blend_type = 'MULTIPLY'
    Lk(gs.outputs[0], dirt.inputs['Factor']); Lk(rgb.outputs[0], dirt.inputs[6]); dirt.inputs[7].default_value = (0.09, 0.075, 0.06, 1)
    col = dirt.outputs[2]
    if rust:
        rn = N.new('ShaderNodeTexNoise'); rn.inputs['Scale'].default_value = 3.2 * scale; rn.inputs['Detail'].default_value = 9
        rn.inputs['Roughness'].default_value = 0.7; Lk(tc.outputs['Object'], rn.inputs['Vector'])
        rr = N.new('ShaderNodeMapRange'); rr.inputs['From Min'].default_value = 0.6 - 0.12 * rust; rr.inputs['From Max'].default_value = 0.68 - 0.1 * rust
        rr.inputs['To Max'].default_value = 0.85; Lk(rn.outputs['Fac'], rr.inputs['Value'])
        rm = N.new('ShaderNodeMix'); rm.data_type = 'RGBA'; Lk(rr.outputs[0], rm.inputs['Factor']); Lk(col, rm.inputs[6])
        rm.inputs[7].default_value = (*lift('#7a3e1c', 1.1), 1); col = rm.outputs[2]
    # scratches: thin stretched noise bands, bare metal
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
    Lk(tc.outputs['Object'], sm.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 7 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
    sc.inputs['To Max'].default_value = 0.5 * wear; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(sc.outputs[0], bare.inputs['Factor'])
    Lk(col, bare.inputs[6]); bare.inputs[7].default_value = (0.42, 0.43, 0.45, 1); col = bare.outputs[2]
    rough_out = None
    if frost:
        fn = N.new('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 4.5 * scale; fn.inputs['Detail'].default_value = 10
        fn.inputs['Roughness'].default_value = 0.75; Lk(tc.outputs['Object'], fn.inputs['Vector'])
        geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); Lk(geo.outputs['Normal'], sep.inputs[0])
        up = N.new('ShaderNodeMath'); up.operation = 'MULTIPLY_ADD'; up.inputs[1].default_value = 0.12; up.inputs[2].default_value = 0.0
        Lk(sep.outputs[2], up.inputs[0])
        fa = N.new('ShaderNodeMath'); fa.operation = 'ADD'; Lk(fn.outputs['Fac'], fa.inputs[0]); Lk(up.outputs[0], fa.inputs[1])
        fr = N.new('ShaderNodeMapRange'); fr.inputs['From Min'].default_value = 0.8 - 0.12 * frost; fr.inputs['From Max'].default_value = 0.86 - 0.1 * frost
        fr.inputs['To Max'].default_value = 0.8; Lk(fa.outputs[0], fr.inputs['Value'])
        fm = N.new('ShaderNodeMix'); fm.data_type = 'RGBA'; Lk(fr.outputs[0], fm.inputs['Factor']); Lk(col, fm.inputs[6])
        fm.inputs[7].default_value = (*lift('#c8dcea', 1.15), 1); col = fm.outputs[2]
        ro = N.new('ShaderNodeMapRange'); ro.inputs['To Min'].default_value = rough; ro.inputs['To Max'].default_value = 0.85
        Lk(fr.outputs[0], ro.inputs['Value']); rough_out = ro.outputs[0]
    Lk(col, b.inputs['Base Color'])
    if rough_out: Lk(rough_out, b.inputs['Roughness'])
    return m

def emit_mat(name, color, strength, base=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(base or color), 1)
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = 0.3
    return m

def decal_mat(name, color, alpha=0.8, scale=5.0, rough=0.8):
    """Stain / soot / frost decal on a flat disc: colour with a ragged radial falloff, see-through at the rim."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (*mn.hex_rgb(color), 1); d.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    Lk(tc.outputs['Object'], gr.inputs['Vector'])
    no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = scale; no.inputs['Detail'].default_value = 8; Lk(tc.outputs['Object'], no.inputs['Vector'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; Lk(gr.outputs['Fac'], mul.inputs[0]); Lk(no.outputs['Fac'], mul.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.08; mr.inputs['From Max'].default_value = 0.35; mr.inputs['To Max'].default_value = alpha
    Lk(mul.outputs[0], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(d.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def stripes_mat(name, a='#e8c34f', b='#23252b', k=5.0, grime=0.4):
    return pmat(name, None, 0.5, 0.0, stripes=(a, b), stripe_k=k, grime=grime)

# ---------------------------------------------------------------------------------------------------
# Geometry helpers (u, v, z in the port layout; mirrored through P)
# ---------------------------------------------------------------------------------------------------
def ubox(name, u0, v0, u1, v1, z0, z1, m=None, bevel=0.02, rotz=0.0):
    u0, u1 = min(u0, u1), max(u0, u1); v0, v1 = min(v0, v1), max(v0, v1)
    o = mn.box(name, (u1 - u0, v1 - v0, z1 - z0), loc=P((u0 + u1) / 2, (v0 + v1) / 2, z0), m=m, bevel=bevel, rot=(0, 0, S * rotz))
    return o

def cbox(name, u, v, w, d, z0, h, m=None, bevel=0.02, rotz=0.0):
    """Box centred at (u, v): w along u, d along v."""
    return mn.box(name, (w, d, h), loc=P(u, v, z0), m=m, bevel=bevel, rot=(0, 0, -S * rotz))

def ucyl(name, r, h, u, v, z, m=None, verts=24, bevel=0.015, axis='z'):
    rot = {'z': (0, 0, 0), 'u': (0, R90, 0), 'v': (R90, 0, 0)}[axis]
    o = mn.cyl(name, r, h, loc=P(u, v, z), m=m, verts=verts, bevel=bevel, rot=rot)
    return o

def prism(name, pts, z0, z1, m=None, bevel=0.02):
    """Extrude a polygon given in (u, v) from z0 to z1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(P(u, v, z0)) for u, v in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=Vector((0, 0, z1 - z0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    return mn.smooth(o)

def rrect_pts(u0, v0, u1, v1, rad, corners=(1, 1, 1, 1)):
    """Rounded rectangle outline (u, v); corners = (nw, ne, se, sw) rounded or not."""
    pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    out = []
    for i, (p, c) in enumerate(zip(pts, corners)):
        if not c: out.append(p); continue
        a, b = Vector(pts[i - 1]), Vector(pts[(i + 1) % 4]); q = Vector(p)
        fil = _fillet([a, q, b], rad, 6)
        out += [(w.x, w.y) for w in fil[1:-1]]
    return out

def disc(name, u, v, z, r, m, sv=1.0, rotz=0.0, verts=40):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=verts, radius=1.0); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = P(u, v, z); o.scale = (r, r * sv, 1); o.rotation_euler = (0, 0, -S * rotz)
    mn.assign(o, m); return o

def text(name, body, u, v, z, size, m, face=False, rotz=0.0, depth=0.004):
    """Flat text lying on the floor/roof (face=False) or on a wall face towards the camera (face=True).
    Never mirrored: reads correctly on both sides."""
    rot = (R90, 0, 0) if face else (0, 0, rotz)
    return label(name, body, size, P(u, v, z), rot=rot, m=m, depth=depth)

def pipe_uv(name, pts, r, m, corner=0.2):
    return pipe(name, [P(*p) for p in pts], r, m, corner=corner)

def bool_cut(o, cutters, op='DIFFERENCE'):
    for c in cutters:
        md = o.modifiers.new('cut', 'BOOLEAN'); md.operation = op; md.object = c
        try: md.solver = 'EXACT'
        except Exception: pass
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)
    for c in cutters: bpy.data.objects.remove(c, do_unlink=True)
    return o

def mass(name, outline_pts, z0, z1, cuts, m, bevel=0.03):
    """A slab with a rounded outline and rectangular holes (cuts: (u0, v0, u1, v1) going through)."""
    o = prism(name, outline_pts, z0, z1, None, bevel=0)
    cs = [ubox('cutter', c[0], c[1], c[2], c[3], z0 - 1, z1 + 1, bevel=0) for c in cuts]
    bool_cut(o, cs)
    if bevel: mn.bev(o, bevel, 2)
    mn.assign(o, m); mn.smooth(o)
    return o

def rivet(u, v, z, m, r=0.026):
    return mn.sphere('rivet', r, loc=P(u, v, z), m=m, scale=(1, 1, 0.5), segs=10)

def face_rivet(u, v, z, m, r=0.02):
    """Rivet on a wall face that faces the camera (+v)."""
    return mn.cyl('frv', r, 0.02, loc=P(u, v + 0.01, z), m=m, verts=8, bevel=0.005, rot=(R90, 0, 0))

# ---------------------------------------------------------------------------------------------------
# Kit pieces
# ---------------------------------------------------------------------------------------------------
def floor_room(room, M, rng, style, out, missing=()):
    """Riveted plates on a 1-unit grid from the room's NW corner (like models/ship/floor.py), plus the sub-floor.
    style: dict(shades=[...], tread=p, grille=p, missing=p). M needs sub, rivet, hole, bar."""
    u0, v0, u1, v1 = room
    out.append(ubox('subfloor', u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02, -0.05, 0.0, M['sub'], bevel=0))
    GAP = 0.035; plates = []
    nu, nv = math.ceil(u1 - u0 - 1e-6), math.ceil(v1 - v0 - 1e-6)
    pmats = style['plate_mats']
    for i in range(nu):
        for j in range(nv):
            a0, a1 = u0 + i, min(u1, u0 + i + 1); b0, b1 = v0 + j, min(v1, v0 + j + 1)
            cu, cv, w, d = (a0 + a1) / 2, (b0 + b1) / 2, a1 - a0 - GAP, b1 - b0 - GAP
            if w < 0.1 or d < 0.1: continue
            r = rng.random()
            if (i, j) in missing or r < style.get('missing', 0):      # missing plate: dark hole with pipes below
                out.append(ubox('hole', a0, b0, a1, b1, -0.06, -0.04, M['hole'], bevel=0))
                for k in range(2):
                    out.append(ucyl('underpipe', 0.06, b1 - b0, cu - 0.2 + 0.4 * k, b0, -0.04, M['bar'], axis='v', verts=12, bevel=0))
                continue
            kind = 'tread' if r < style['tread'] else 'grille' if r < style['tread'] + style['grille'] else 'plain'
            pm = pmats[rng.randrange(len(pmats))] if kind != 'tread' else style['tread_mat']
            tilt = rng.uniform(-0.6, 0.6) if style.get('wonky') and rng.random() < style['wonky'] else 0.0
            p = cbox('plate', cu, cv, w, d, 0.0, FLOOR_Z, pm, bevel=0.012, rotz=math.radians(tilt))
            out.append(p); plates.append(p)
            if kind == 'tread':
                n = 6
                for gi in range(n):
                    for gj in range(n):
                        bu = cu - w / 2 + 0.08 + gi * (w - 0.16) / (n - 1); bv = cv - d / 2 + 0.08 + gj * (d - 0.16) / (n - 1)
                        out.append(cbox('lz', bu, bv, 0.1, 0.032, FLOOR_Z, 0.014, pm, bevel=0.01, rotz=math.radians(45 if (gi + gj) % 2 else -45)))
                continue
            if kind == 'grille' and w > 0.7 and d > 0.7:
                out.append(cbox('grille_rim', cu, cv, 0.72, 0.72, FLOOR_Z, 0.012, M['bar'], bevel=0.006))
                out.append(cbox('grille_hole', cu, cv, 0.6, 0.6, FLOOR_Z, 0.013, M['hole'], bevel=0))
                for k in range(7):
                    out.append(cbox('slat', cu, cv - 0.27 + k * 0.09, 0.6, 0.035, FLOOR_Z, 0.018, M['bar'], bevel=0.006))
            for su in (-1, 1):
                for sv in (-1, 1):
                    if rng.random() < style.get('lost_rivets', 0): continue
                    out.append(rivet(cu + su * (w / 2 - 0.07), cv + sv * (d / 2 - 0.07), FLOOR_Z, M['rivet']))
    return plates

def back_wall(u0, u1, v, M, rng, out, lamps='on', every=1.0, skip=()):
    """Details on a full-height wall face at v facing the camera (a room's north wall), from u0 to u1.
    Lower panels with insets and vent slots, upper panels, lamp strips, a pipe run (walls.py kit).
    lamps: 'on' | 'dead' | 'flicker'. skip: list of (ua, ub) ranges left bare for custom features."""
    n = int(math.floor((u1 - u0) / every + 1e-6)); pad = ((u1 - u0) - n * every) / 2
    out.append(ubox('skirt', u0, v - 0.0, u1, v + 0.05, 0, 0.12, M['skirt'], bevel=0.012))
    for k in range(n):
        a = u0 + pad + k * every; c = a + every / 2
        if any(sa - 0.3 < c < sb + 0.3 for sa, sb in skip): continue
        out.append(ubox('lpanel', a + 0.025, v, a + every - 0.025, v + 0.03, 0.13, 0.79, M['panel'], bevel=0.012))
        out.append(ubox('inset', c - 0.25, v + 0.02, c + 0.25, v + 0.04, 0.3, 0.56, M['body'], bevel=0.01))
        for i in range(3): out.append(ubox('slot', c - 0.18, v + 0.04, c + 0.18, v + 0.05, 0.37 + i * 0.06, 0.395 + i * 0.06, M['dark'], bevel=0))
        for su in (-1, 1):
            for z in (0.2, 0.7): out.append(face_rivet(c + su * 0.4, v + 0.03, z, M['steel']))
        out.append(ubox('upanel', a + 0.025, v, a + every - 0.025, v + 0.03, 0.95, H_FULL - 0.1, M['panel2'], bevel=0.012))
        if k % 2 == 0:
            out.append(ubox('lamp_h', c - 0.3, v + 0.0, c + 0.3, v + 0.05, 1.22, 1.32, M['dark'], bevel=0.015))
            st = lamps if lamps != 'flicker' else ('on' if rng.random() < 0.4 else 'dead')
            out.append(ubox('lamp', c - 0.26, v + 0.03, c + 0.26, v + 0.06, 1.245, 1.295, M['lamp'] if st == 'on' else M['lamp_dead'], bevel=0.005))
    out.append(ucyl('pipe1', 0.055, u1 - u0, u0 if S > 0 else u1, v + 0.08, 0.84, M['pipe1'], axis='u', verts=20, bevel=0))
    out[-1].location = P(u0, v + 0.08, 0.84) if S > 0 else P(u1, v + 0.08, 0.84)
    out.append(ucyl('pipe2', 0.035, u1 - u0, u0, v + 0.06, 0.94, M['pipe2'], axis='u', verts=16, bevel=0))
    out[-1].location = P(u0, v + 0.06, 0.94) if S > 0 else P(u1, v + 0.06, 0.94)
    k = math.ceil(u0) + 0.5
    while k < u1 - 0.2:
        if not any(sa - 0.2 < k < sb + 0.2 for sa, sb in skip):
            out.append(ubox('clamp', k - 0.03, v, k + 0.03, v + 0.16, 0.78, 0.98, M['steel'], bevel=0.012))
        k += 2.0

def tray(u0, v0, u1, v1, z, M, out, axis='u'):
    """Cable tray on a wall top, centred in the given strip, running along u or v."""
    if axis == 'u':
        c = (v0 + v1) / 2
        out.append(ubox('tray', u0, c - 0.17, u1, c + 0.17, z, z + 0.04, M['dark'], bevel=0.008))
        for d in (-0.18, 0.18): out.append(ubox('tray_rim', u0, c + d - 0.02, u1, c + d + 0.02, z, z + 0.07, M['rim'], bevel=0.01))
        for i, d in enumerate((-0.09, 0.0, 0.09)):
            out.append(ucyl('cable', 0.04, u1 - u0, u0, c + d, z + 0.08, M['cables'][i], axis='u', verts=12, bevel=0))
            out[-1].location = P(u0 if S > 0 else u1, c + d, z + 0.08)
        k = math.floor(u0) + 0.5
        while k < u1:
            if k > u0 + 0.1: out.append(ubox('strap', k - 0.025, c - 0.21, k + 0.025, c + 0.21, z + 0.1, z + 0.13, M['steel'], bevel=0.01))
            k += 1.0
    else:
        c = (u0 + u1) / 2
        out.append(ubox('tray', c - 0.17, v0, c + 0.17, v1, z, z + 0.04, M['dark'], bevel=0.008))
        for d in (-0.18, 0.18): out.append(ubox('tray_rim', c + d - 0.02, v0, c + d + 0.02, v1, z, z + 0.07, M['rim'], bevel=0.01))
        for i, d in enumerate((-0.09, 0.0, 0.09)):
            out.append(ucyl('cable', 0.04, v1 - v0, c + d, v0, z + 0.08, M['cables'][i], axis='v', verts=12, bevel=0))
        k = math.floor(v0) + 0.5
        while k < v1:
            if k > v0 + 0.1: out.append(ubox('strap', c - 0.21, k - 0.025, c + 0.21, k + 0.025, z + 0.1, z + 0.13, M['steel'], bevel=0.01))
            k += 1.0

def jamb(u0, u1, M, out, lamp=None, light=True):
    """The south end face of a tall wall stub at v = SPLIT (door / tube jamb): steel corner guards,
    a hazard panel and a lamp (wall_v_end kit)."""
    v = SPLIT; c = (u0 + u1) / 2; w = u1 - u0
    out.append(ubox('endpanel', u0 + 0.05, v, u1 - 0.05, v + 0.03, 0.13, H_FULL - 0.12, M['panel'], bevel=0.012))
    out.append(ubox('end_hz', u0 + 0.07, v + 0.02, u1 - 0.07, v + 0.04, 0.25, 0.5, M['hazard'], bevel=0.005))
    for su in (u0, u1): out.append(ubox('guard', su - 0.03, v - 0.03, su + 0.03, v + 0.03, 0.0, H_FULL - 0.1, M['steel'], bevel=0.015))
    if light:
        out.append(ubox('jlamp_h', c - 0.06, v, c + 0.06, v + 0.05, 0.9, 1.3, M['dark'], bevel=0.015))
        out.append(ubox('jlamp', c - 0.03, v + 0.03, c + 0.03, v + 0.06, 0.94, 1.26, lamp or M['lamp'], bevel=0.005))

def low_lip(room, M, out, sides='swe'):
    """Hazard/steel lip along the cut edge of the low deck (z = H_LOW) around a room."""
    u0, v0, u1, v1 = room
    if 's' in sides: out.append(ubox('lip', u0 - 0.04, v1, u1 + 0.04, v1 + 0.1, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))

def build_hull(M, out, Mlow, Mup, Mbelly, roof_h=H_FULL, low_h=H_LOW, belly=(-0.55, 0.02)):
    """Belly, low deck and upper mass (see the module docstring). Returns (low, upper, belly) objects."""
    u0, v0, u1, v1 = HULLR
    rooms = list(ROOMS.values())
    bel = prism('belly', rrect_pts(u0 + 0.12, v0 + 0.1, u1 - 0.12, v1 - 0.04, HULL_RAD), belly[0], belly[1], Mbelly, bevel=0.06)
    low = mass('low_deck', rrect_pts(u0, v0, u1, v1, HULL_RAD), 0.0, low_h,
               rooms + DOORS + [(TUBE[0] - 0.01, TUBE[1], u1 + 0.5, TUBE[3])], Mlow, bevel=0.03)
    up = mass('upper', rrect_pts(u0, v0, u1, SPLIT, HULL_RAD, corners=(1, 1, 0, 0)), 0.0, roof_h,
              [(r[0], r[1], r[2], 10.0) for r in rooms], Mup, bevel=0.03)
    out += [bel, low, up]
    return low, up, bel

def wall_stubs():
    """(u0, u1) of the tall wall stubs ending at v = SPLIT: the far end wall, the two walls between rooms
    (the door jambs) and the near end wall (the tube jamb)."""
    r = ROOMS
    return [(HULLR[0], r['core'][0]), (r['core'][2], r['cargo'][0]), (r['cargo'][2], r['airlock'][0]), (r['airlock'][2], HULLR[2])]

def wall_tops(M, out, z=H_FULL):
    """Cable trays along the top of each room's back wall and down every wall stub."""
    for name in ('core', 'cargo', 'airlock'):
        a, b, c, d = ROOMS[name]
        tray(a - 0.3, max(HULLR[1] + 0.05, b - 0.62), c + 0.3, b, z, M, out, 'u')
    for a, b in wall_stubs():
        tray(a, -4.0, b, SPLIT - 0.06, z, M, out, 'v')

def emergency_strip(u0, u1, v, M, out, rng, dead=0.3, z=FLOOR_Z, color='lamp_em'):
    """Dashed glowing strip along a floor edge (the derelict's emergency lighting)."""
    out.append(ubox('em_base', u0, v - 0.035, u1, v + 0.035, z, z + 0.012, M['dark'], bevel=0.004))
    k = u0 + 0.1
    while k < u1 - 0.2:
        out.append(ubox('em', k, v - 0.022, k + 0.18, v + 0.022, z + 0.012, z + 0.022, M[color] if rng.random() > dead else M['lamp_dead'], bevel=0.0))
        k += 0.32

def emergency_strip_v(v0, v1, u, M, out, rng, dead=0.3, z=FLOOR_Z, color='lamp_em'):
    out.append(ubox('em_base', u - 0.035, v0, u + 0.035, v1, z, z + 0.012, M['dark'], bevel=0.004))
    k = v0 + 0.1
    while k < v1 - 0.2:
        out.append(ubox('em', u - 0.022, k, u + 0.022, k + 0.18, z + 0.012, z + 0.022, M[color] if rng.random() > dead else M['lamp_dead'], bevel=0.0))
        k += 0.32

def wall_screen(u, v, z, w, h, M, out, mat):
    """A screen on a wall face (centre u, bottom z) in a dark bezel."""
    out.append(ubox('scr_bezel', u - w / 2 - 0.05, v, u + w / 2 + 0.05, v + 0.07, z - 0.05, z + h + 0.05, M['dark'], bevel=0.02))
    out.append(ubox('scr', u - w / 2, v + 0.06, u + w / 2, v + 0.08, z, z + h, mat, bevel=0.004))

def skull(u, v, z, size, m, out, face=True):
    """Skull-and-crossbones stencil (flat), on a wall face (face=True) or lying on a surface."""
    s = size
    if face:
        o = mn.cyl('skull', 0.24 * s, 0.006, loc=P(u, v + 0.005, z + 0.1 * s), m=m, rot=(R90, 0, 0), verts=24, bevel=0)
        out.append(o)
        out.append(ubox('jaw', u - 0.14 * s, v, u + 0.14 * s, v + 0.006, z - 0.12 * s, z - 0.02 * s, m, bevel=0))
        for a in (0.6, -0.6):
            b = mn.box('bone', (0.75 * s, 0.006, 0.07 * s), loc=P(u, v + 0.003, z - 0.32 * s), m=m, bevel=0, rot=(0, a, 0))
            b.location = P(u, v + 0.003, z - 0.3 * s); out.append(b)
        dk = M_DARK[0]
        for su in (-1, 1): out.append(mn.cyl('eye', 0.065 * s, 0.006, loc=P(u + su * 0.09 * s, v + 0.009, z + 0.1 * s), m=dk, rot=(R90, 0, 0), verts=12, bevel=0))
    else:
        out.append(disc('skull', u, v - 0.1 * s, z, 0.24 * s, m))
        out.append(cbox('jaw', u, v + 0.07 * s, 0.28 * s, 0.1 * s, z, 0.004, m, bevel=0))
        for a in (35, -35): out.append(cbox('bone', u, v + 0.3 * s, 0.75 * s, 0.07 * s, z, 0.004, m, bevel=0, rotz=math.radians(a)))
        dk = M_DARK[0]
        for su in (-1, 1): out.append(disc('eye', u + su * 0.09 * s, v - 0.1 * s, z + 0.002, 0.065 * s, dk))
M_DARK = [None]

def debris(u0, v0, u1, v1, n, mats, rng, out, hmax=0.08, avoid=()):
    """Small junk on a floor: bolts, plate shards, cans, paper. Low (<= hmax) so it never hides anyone."""
    for _ in range(n):
        for _try in range(10):
            u, v = rng.uniform(u0, u1), rng.uniform(v0, v1)
            if all(math.hypot(u - a, v - b) > r for a, b, r in avoid): break
        else: continue
        k = rng.random(); m = mats[rng.randrange(len(mats))]
        if k < 0.35: out.append(cbox('shard', u, v, rng.uniform(0.12, 0.35), rng.uniform(0.08, 0.2), FLOOR_Z, 0.012, m, bevel=0.004, rotz=rng.uniform(0, 3.14)))
        elif k < 0.6: out.append(mn.cyl('can', 0.04, rng.uniform(0.1, 0.16), loc=P(u, v, FLOOR_Z + 0.04), m=m, verts=12, bevel=0.008, rot=(R90, 0, rng.uniform(0, 3.14))))
        elif k < 0.8: out.append(mn.cyl('bolt', 0.025, 0.04, loc=P(u, v, FLOOR_Z), m=m, verts=6, bevel=0.006))
        else: out.append(cbox('box', u, v, rng.uniform(0.12, 0.22), rng.uniform(0.1, 0.2), FLOOR_Z, min(hmax, rng.uniform(0.04, 0.1)), m, bevel=0.01, rotz=rng.uniform(0, 3.14)))

def stain(u, v, r, m, out, sv=1.0, rotz=0.0, z=FLOOR_Z + 0.002):
    out.append(disc('stain', u, v, z, r, m, sv=sv, rotz=rotz))

def tape(u, v, z, l, m, out, rotz=0.0):
    out.append(cbox('tape', u, v, l, 0.09, z, 0.006, m, bevel=0.002, rotz=rotz))

# ---------------------------------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------------------------------
def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a

def render_ship(name, objs, frames=None, passes=('beauty', 'normal', 'height')):
    """Render with the hatch point as the origin; the canvas is the tight bounds (mn.render)."""
    return mn.render(name, objs=objs, frames=frames, passes=passes)

# CPU fallback when the shared GPU is full (several agents render at once): DOCK_CPU=1
_orig_reset = mn.reset
def _reset():
    s = _orig_reset()
    if os.environ.get('DOCK_CPU'): s.cycles.device = 'CPU'
    return s
mn.reset = _reset
