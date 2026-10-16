"""The docked ships (js/dock.js drawDock): hull exterior + cut-away interior, one big sprite per kind and side.

    blender -b --factory-startup --python tools/blender/models/dock/ships.py -- <kind> <side> [quick]
        kind = pirate | derelict | brig   (or 'all'), side = port | star (or 'all')

Sprites (build/renders/dock/), origin = our airlock hatch on the ground (HATCHES[side].x, .y), see docklib.py:
  dock/pirate_<side>     the Red Comet raider docked (dk.dock.kind === 'pirate', no npc)
  dock/brig_<side>       the prison barge (EVENT_RUNNERS.brig: kind 'pirate' with contents.npc = Dr. Varga)
                         Both are the flying raider (enemy/pirate_<side>) cut open: same black/gold hull, nacelles,
                         canopy, turret (brig: a searchlight), flag and claw, see raider_exterior()
  dock/derelict_<side>   Dr. Varga's lab module (kind 'derelict'): airless and dark (the darkness is runtime
                         lighting; only emergency strips glow), frost, debris, dead screens, the intruder's nest
Not in these sprites (separate, stateful): the tube (tube.py), the loot crate, the reactor / dead core, the
jammed door (props.py). Fire stays procedural (fx group), as do actors and items.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docklib as D
from docklib import *

A = D.args()
KINDS = ['pirate', 'brig', 'derelict'] if not A or A[0] == 'all' else [A[0]]
SIDES = ['port', 'star'] if len(A) < 2 or A[1] == 'all' else [A[1]]
QUICK = 'quick' in A
if QUICK: mn.SAMPLES = 16

# ---------------------------------------------------------------------------------------------------
# Materials per kind
# ---------------------------------------------------------------------------------------------------
def materials(kind):
    der, brig = kind == 'derelict', kind == 'brig'
    fr = 0.6 if der else 0.0
    rust = 0.15 if not der else 0.05
    M = dict(
        sub=pmat('sub', '#16181d', 0.8), hole=pmat('hole', '#0c0d10', 0.9), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6, frost=fr * 0.5),
        rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5, frost=fr * 0.6),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5),
        tape=pmat('tape', '#b9bcc2', 0.85), ink=pmat('ink', '#23252b', 0.6),
        hazard=stripes_mat('hazard'), hazard_red=stripes_mat('hazard_red', '#c0392b', '#e8e4dc', 5.0),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2),
        lamp_em=emit_mat('lamp_em', '#5aff9a', 1.3, base='#2a7a4a'), lamp_amber=emit_mat('lamp_amber', '#ffb43a', 1.3, base='#7a5a1a'),
        lamp_red=emit_mat('lamp_red', '#ff3a2a', 1.4, base='#6a1a14'),
        screen_dead=pmat('screen_dead', '#0c1218', 0.08, 0.0, clearcoat=0) if False else mn.mat('screen_dead', '#10161c', 0.06, 0.0, clearcoat=1.0),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.4, 0.3, wear=0.8, grime=0.6),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), scrap=worn('scrap', '#6a5a48', 0.6, 0.4, rust=0.4),
        oil=decal_mat('oil', '#0a0908', 0.85, rough=0.15), soot=decal_mat('soot', '#0b0a09', 0.9),
        rustd=decal_mat('rustd', '#5a2a12', 0.6, 3.0), frostd=decal_mat('frostd', '#c8d8e6', 0.45, 9.0, rough=0.9),
        slime=decal_mat('slime', '#3a1a46', 0.85, 6.0, rough=0.1), glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        rubber=pmat('rubber', '#262a33', 0.7), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3 * (not der)),
        paper=pmat('paper', '#e6e2d6', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6),
    )
    M['pipe1'] = worn('pipe1', '#3b7a8a', 0.4, 0.3, frost=fr, rust=rust * 0.5)
    M['pipe2'] = M['copper']
    if kind == 'pirate':
        M.update(hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
                 trim=worn('trim', '#a83a3a', 0.5, 0.1, wear=0.9), body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15),
                 panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2), panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15),
                 lamp=emit_mat('lamp', '#ffb46a', 1.2, base='#ffd0a0'))
        shades = ['#6a5a5e', '#665658', '#6e5c5c', '#625458']
    elif kind == 'brig':
        M.update(hull=worn('hull', '#64644f', 0.5, 0.25, wear=0.6, rust=0.15), hull2=worn('hull2', '#34342c', 0.55, 0.25, rust=0.1),
                 trim=stripes_mat('trim', '#e8c34f', '#23252b', 2.5, 0.6), body=worn('body', '#44443c', 0.6, 0.3, rust=0.15),
                 panel=worn('panel', '#5e5c4e', 0.5, 0.3, rust=0.2), panel2=worn('panel2', '#66645a', 0.45, 0.3, rust=0.15),
                 lamp=emit_mat('lamp', '#ffe0a8', 1.1, base='#fff0d0'))
        shades = ['#6a5a5e', '#625a5a', '#6a6060', '#5e5658']
    else:
        M.update(hull=worn('hull', '#5c626c', 0.55, 0.3, wear=0.6, frost=0.7, grime=1.1), hull2=worn('hull2', '#3a3f46', 0.6, 0.3, frost=0.5),
                 trim=worn('trim', '#5a5040', 0.6, 0.1, wear=0.8, frost=0.6), body=worn('body', '#4c525a', 0.6, 0.3, frost=0.8, grime=1.1),
                 panel=worn('panel', '#7c848e', 0.45, 0.2, frost=0.9, grime=1.3), panel2=worn('panel2', '#9aa1aa', 0.4, 0.2, frost=0.9, grime=1.2),
                 lamp=M['lamp_dead'])
        shades = ['#6a6e76', '#666a72', '#6e727a', '#63676f']
    if kind in RAIDERS: raider_mats(M, kind)
    M['plates'] = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12 if not der else 0.0, frost=fr) for i, c in enumerate(shades)]
    M['tread'] = worn('tread', '#7f8794' if not der else '#6a6f78', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08 if not der else 0, frost=fr)
    D.M_DARK[0] = M['black']
    return M

# ---------------------------------------------------------------------------------------------------
# Common structure
# ---------------------------------------------------------------------------------------------------
def structure(kind, M, rng, out):
    der, raider = kind == 'derelict', kind in RAIDERS
    if raider: raider_hull(M, out)
    else: build_hull(M, out, M['hull'], M['hull'], M['hull2'])
    style = dict(plate_mats=M['plates'], tread_mat=M['tread'], tread=0.12, grille=0.08, missing=0.04 if der else 0.0,
                 wonky=0.12 if der else 0.05, lost_rivets=0.15 if der else 0.05)
    for name, r in ROOMS.items():
        floor_room(r, M, rng, style, out)
    for d in DOORS:                                              # door thresholds: hazard plate
        floor_room(d, M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
        out.append(ubox('thr_hz', d[0] + 0.04, d[1] + 0.05, d[0] + 0.12, d[3] - 0.05, FLOOR_Z, FLOOR_Z + 0.01, M['hazard'], bevel=0))
        out.append(ubox('thr_hz', d[2] - 0.12, d[1] + 0.05, d[2] - 0.04, d[3] - 0.05, FLOOR_Z, FLOOR_Z + 0.01, M['hazard'], bevel=0))
    # the outer airlock opening (where the tube clamps on): floor out to the hull edge
    floor_room((TUBE[0], TUBE[1], HULLR[2], TUBE[3]), M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
    # back walls (each room's north face) are added by the kind; the stub ends (jambs) are common
    stubs = wall_stubs()
    lamp_j = M['lamp'] if not der else M['lamp_dead']
    for i, (a, b) in enumerate(stubs):
        jamb(a, b, M, out, lamp=lamp_j)
    raider_wall_tops(M, out) if raider else wall_tops(M, out)
    # low-deck cut lips (steel edge where the deck is cut away above each room's south part)
    for r in ROOMS.values():
        out.append(ubox('lip_s', r[0] - 0.02, r[3], r[2] + 0.02, r[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
        for u in (r[0], r[2]):
            sgn = -1 if u == r[0] else 1
            out.append(ubox('lip_v', u + (0.0 if sgn > 0 else -0.08), 0.8, u + (0.08 if sgn > 0 else 0.0), r[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
    # door jambs on the south side (low): hazard caps
    for d in DOORS:
        out.append(ubox('djamb_s', d[0] - 0.02, d[3], d[2] + 0.02, d[3] + 0.12, H_LOW - 0.02, H_LOW + 0.02, M['hazard'], bevel=0.006))
    # belly front face: hull plate seams and rivets, along the camera-facing south edge
    u0, v0, u1, v1 = HULLR
    x = u0 + 0.8
    while x < u1 - 0.6 and not raider:
        out.append(ubox('belly_seam', x - 0.012, v1 - 0.06, x + 0.012, v1 + 0.005, -0.5, 0.0, M['black'], bevel=0))
        for z in (-0.12, -0.42): out.append(face_rivet(x + 0.35, v1 - 0.04, z, M['steel']))
        x += 1.6
    # low-deck roof seams (south band) and rivets
    for rn, r in ROOMS.items():
        a, c = r[0], r[2]
        if raider: v0, v1 = -EDGE[rn], EDGE[rn]
        if v1 - r[3] > 0.5:
            out.append(ubox('roof_seam', a, (r[3] + v1) / 2 - 0.01, c, (r[3] + v1) / 2 + 0.01, H_LOW, H_LOW + 0.004, M['black'], bevel=0))
        x = a + 0.4
        while x < c - 0.2:
            out.append(rivet(x, v1 - 0.18, H_LOW, M['steel'], 0.03)); x += 0.7
        x = a + 1.2
        while x < c - 0.5:                                       # plate seams across the south and north bands
            out.append(ubox('roof_seam', x - 0.01, r[3] + 0.1, x + 0.01, v1 - 0.05, H_LOW, H_LOW + 0.004, M['black'], bevel=0))
            out.append(ubox('roof_seam', x - 0.01, v0 + 0.08, x + 0.01, r[1] - 0.05, H_FULL, H_FULL + 0.004, M['black'], bevel=0))
            x += 1.6
        if r[1] - v0 > 1.2:
            out.append(ubox('roof_seam', a, (r[1] + v0) / 2 - 0.01, c, (r[1] + v0) / 2 + 0.01, H_FULL, H_FULL + 0.004, M['black'], bevel=0))

# ---------------------------------------------------------------------------------------------------
# Pirate raider
# ---------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------
# The Red Comet raider's hull (pirate + brig): the same ship that flies at us as enemy/pirate_<side>
# (models/enemy/interceptor.py in variants.py's 'pirate' paint), cut open. Its design language, scaled up
# around the rooms: a black / gunmetal hull with gold stripes and welded scrap patches, a nose that tapers
# to the docking port with the glass cockpit canopy on a beak beside the tube, swept wings carrying the two
# big engine nacelles, a centre engine at the stern (the core end), the turret on a sponson, the
# jolly roger on a mast at the stern, the docking claw at the tube. The rooms, doors and floors are untouched.
# ---------------------------------------------------------------------------------------------------
RAIDERS = ('pirate', 'brig')
# hull outline (port layout, u/v relative to our hatch): each room keeps a 0.7 wall band like before
N_OUT = [(-25.7, -3.15), (-25.35, -3.5), (-19.8, -3.5), (-18.5, -4.7), (-10.3, -4.7), (-9.0, -3.1), (-5.3, -3.1),
         (-3.5, -2.85), (-2.7, -2.0), (-2.8, -1.3), (-3.6, -0.95), (-4.9, -0.95)]
S_OUT = [(-4.9, 1.55), (-7.4, 3.1), (-9.0, 3.1), (-10.3, 4.7), (-18.5, 4.7), (-19.8, 3.5), (-25.35, 3.5), (-25.7, 3.15)]
OUTLINE = N_OUT + S_OUT
EDGE = {'airlock': 3.1, 'cargo': 4.7, 'core': 3.5}                # |v| of the hull edge beside each room
NAC_V, NAC_Z, NAC_R, NAC_U = 6.8, 0.2, 1.05, (-17.6, -23.6)      # engine nacelles (v = +-NAC_V)
CAN = (-4.0, -1.9, 1.15, 0.75, 0.58)                              # canopy: centre u, v, half-sizes u, v, height
TURRET = (-7.7, -3.55)

def _xv(a, b, v):
    t = (v - a[1]) / (b[1] - a[1]); return (a[0] + (b[0] - a[0]) * t, v)

def clip_v(poly, vmax):
    """The part of a polygon with v <= vmax (Sutherland-Hodgman against one half-plane)."""
    out = []
    for i in range(len(poly)):
        a, b = poly[i - 1], poly[i]
        ina, inb = a[1] <= vmax, b[1] <= vmax
        if inb:
            if not ina: out.append(_xv(a, b, vmax))
            out.append(b)
        elif ina: out.append(_xv(a, b, vmax))
    return out

def _area(pts):
    return 0.5 * sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))

def offset_line(pts, d, closed=False, inward_of=None):
    """Miter offset of a polyline / polygon by d to the left of travel (or towards the inside of the polygon
    `inward_of` when given)."""
    sgn = 1.0
    if inward_of is not None: sgn = 1.0 if _area(inward_of) > 0 else -1.0
    n = len(pts); segs = range(n if closed else n - 1)
    nrm = []
    for i in segs:
        a, b = pts[i], pts[(i + 1) % n]; L = math.hypot(b[0] - a[0], b[1] - a[1])
        nrm.append((-sgn * (b[1] - a[1]) / L, sgn * (b[0] - a[0]) / L))
    out = []
    for i in range(n):
        if closed: n1, n2 = nrm[i - 1], nrm[i % len(nrm)]
        else: n1, n2 = nrm[max(0, i - 1)], nrm[min(i, len(nrm) - 1)]
        k = 1.0 + n1[0] * n2[0] + n1[1] * n2[1]
        out.append((pts[i][0] + d * (n1[0] + n2[0]) / k, pts[i][1] + d * (n1[1] + n2[1]) / k))
    return out

def north_edge(u):
    pts = N_OUT[:N_OUT.index((-2.7, -2.0)) + 1]
    for a, b in zip(pts, pts[1:]):
        if a[0] <= u <= b[0]: return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0])
    return pts[0][1]

def strip(name, line, d0, d1, z0, z1, m, bevel=0.0):
    """A band between two offsets of an open polyline (offsets to the left of travel)."""
    a, b = offset_line(line, d0), offset_line(line, d1)
    return prism(name, a + b[::-1], z0, z1, m, bevel=bevel)

def mirror_fix(objs):
    """Objects modelled in port Blender coordinates (X = u, Y = -v): mirror them for starboard."""
    if S > 0: return objs
    for o in objs:
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy(); o.data.transform(mw); o.matrix_world = o.matrix_world.__class__.Identity(4)
        for v in o.data.vertices: v.co.x = -v.co.x
        o.data.flip_normals(); o.data.update()
    return objs

def u_cone(name, u0, u1, v, z, r0, r1, m, verts=40, bevel=0.03, caps=True):
    """A cylinder / cone along u from u0 (radius r0) to u1 (radius r1), axis at (v, z)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=verts, radius1=r0, radius2=r1, depth=abs(u1 - u0))
    L = abs(u1 - u0); s = 1 if u1 > u0 else -1
    for vt in bm.verts:
        x, y, t = vt.co
        vt.co = P((u0 + u1) / 2 + s * t, v + y, z + x)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel: mn.bev(o, bevel, 2)
    mn.assign(o, m); return mn.smooth(o)

def weld_patch(name, u, v, z, w, d, ang, M, out, rng):
    """A welded-on scrap plate (variants.py pirate_extras): rusty plate, weld bead all round, two bolts, soot."""
    c, s = math.cos(ang), math.sin(ang)
    pts = [(u + a * c - b * s, v + a * s + b * c) for a, b in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
    out.append(prism(name, pts, z, z + 0.035, M['scrap'], bevel=0.008))
    loop = [(x, y, z + 0.006) for x, y in pts]
    out.append(pipe_uv(name + '_weld', loop + [loop[0]], 0.017, M['weld'], corner=0.03))
    for q in (0, 2):
        bx, by = pts[q][0] * 0.82 + u * 0.18, pts[q][1] * 0.82 + v * 0.18
        out.append(mn.sphere('bolt', 0.03, loc=P(bx, by, z + 0.035), m=M['dark'], segs=10))
    out.append(disc('soot', u + 0.08, v, z + 0.037, min(w, d) * 0.35, M['soot'], sv=0.6))

# ---- the jolly roger (variants.py skull_image / flag_mat / build_flag, static and bigger) -------------
def skull_image():
    import numpy as np
    W, H = 256, 136
    img = bpy.data.images.new('skull', W, H, alpha=False)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    m = np.zeros((H, W), np.float32)
    def seg(ax, ay, bx, by, r):
        dx, dy = bx - ax, by - ay; k = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        return np.hypot(x - ax - dx * k, y - ay - dy * k) < r
    def circ(cx, cy, r): return np.hypot(x - cx, y - cy) < r
    for (ax, ay, bx, by) in ((84, 22, 172, 96), (84, 96, 172, 22)):
        m[seg(ax, ay, bx, by, 7)] = 1
        for (px, py) in ((ax, ay), (bx, by)):
            nx, ny = (bx - ax), (by - ay); L = math.hypot(nx, ny); nx, ny = -ny / L * 6, nx / L * 6
            m[circ(px + nx, py + ny, 7)] = 1; m[circ(px - nx, py - ny, 7)] = 1
    m[circ(128, 78, 30)] = 1
    m[(abs(x - 128) < 17) & (y > 46) & (y < 66)] = 1
    m[circ(116, 80, 8.5)] = 0; m[circ(140, 80, 8.5)] = 0
    m[(abs(x - 128) < 3.5 - (y - 60) * 0.35) & (y > 60) & (y < 70)] = 0
    for k in range(4): m[(abs(x - (119 + k * 6)) < 1.2) & (y > 46) & (y < 58)] = 0
    rng = np.random.default_rng(3); m *= 0.85 + 0.15 * rng.random((H, W)).astype(np.float32)
    px = np.ones((H, W, 4), np.float32); px[..., 0] = px[..., 1] = px[..., 2] = m
    img.pixels.foreach_set(px.ravel()); img.pack()
    return img

def flag_mat():
    m = bpy.data.materials.new('flag'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.9
    tx = N.new('ShaderNodeTexImage'); tx.image = skull_image(); tx.extension = 'CLIP'
    uv = N.new('ShaderNodeUVMap'); Lk(uv.outputs[0], tx.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(tx.outputs['Color'], mx.inputs[0])
    mx.inputs[6].default_value = (*mn.hex_rgb('#1a1a20'), 1); mx.inputs[7].default_value = (*lift('#e8e4dc'), 1)
    Lk(mx.outputs[2], b.inputs['Base Color'])
    return m

def flag(mu, mv, z0, w, h, M):
    """Cloth hanging off a mast at (mu, mv) towards -u, from z0 up, a frozen flutter."""
    nu, nv = 28, 12
    me = bpy.data.meshes.new('flag'); verts, faces = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, wv = i / nu, j / nv
            wave = 0.16 * (0.25 + u) * math.sin(math.tau * (1.4 * u - 0.15) + 0.6 * wv)
            z = z0 + wv * h - 0.18 * u * u
            verts.append(tuple(P(mu - 0.04 - u * w, mv + wave, z)))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    me.from_pydata(verts, [], faces); me.update()
    o = mn.link(bpy.data.objects.new('flag', me)); mn.assign(o, M['flag'])
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index; i, j = vi % (nu + 1), vi // (nu + 1); u = i / nu
            uvl.data[li].uv = ((1 - u) if S > 0 else u, j / nv)
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.02; sol.offset = 0
    return mn.smooth(o)

# ---- parts ---------------------------------------------------------------------------------------------
def raider_mats(M, kind):
    M.update(hull=worn('hull', '#3a3a42', 0.45, 0.25, wear=0.6, grime=1.0),
             hull2=worn('hull2', '#16161c', 0.5, 0.2, wear=0.5, grime=0.8),
             pod=worn('pod', '#36302b', 0.4, 0.25, wear=0.6), pod2=worn('pod2', '#1c1814', 0.45, 0.25, wear=0.5),
             stripe=worn('stripe', '#e8b42e', 0.45, 0.1, wear=0.7, grime=0.6), gun=worn('gun', '#4a515e', 0.4, 0.35, wear=0.6),
             gunl=worn('gunl', '#6a7280', 0.45, 0.2, wear=0.6), clawsteel=worn('clawsteel', '#8a8f99', 0.35, 0.6, wear=0.6),
             weld=worn('weld', '#8a8478', 0.4, 0.7, wear=0.4), shine=emit_mat('shine', '#ffffff', 1.2),
             hot=emit_mat('hot', '#ffc070', 1.5, base='#ff9040'), hot2=emit_mat('hot2', '#ff9a40', 1.2, base='#401808'),
             heat=emit_mat('heat', '#ff5a1a', 0.45, base='#2a1a12'),
             hud=emit_mat('hud', '#ff8a3a', 1.2), flag=flag_mat(), sight=emit_mat('sight', '#ff4a3a', 1.5, base='#802018'),
             navg=emit_mat('navg', '#5aff8a', 1.4, base='#2a7a4a'), navr=emit_mat('navr', '#ff5a4a', 1.4, base='#7a2a24'))

def raider_hull(M, out):
    rooms = list(ROOMS.values())
    bel = prism('belly', offset_line(OUTLINE, 0.12, closed=True, inward_of=OUTLINE), -0.55, 0.02, M['hull2'], bevel=0.06)
    low = mass('low_deck', OUTLINE, 0.0, H_LOW, rooms + DOORS + [(TUBE[0] - 0.01, TUBE[1], -4.0, TUBE[3])], M['hull'], bevel=0.03)
    up = mass('upper', clip_v(OUTLINE, SPLIT), 0.0, H_FULL, [(r[0], r[1], r[2], 10.0) for r in rooms], M['hull'], bevel=0.03)
    out += [bel, low, up]

def raider_wall_tops(M, out, z=H_FULL):
    for name in ('core', 'cargo', 'airlock'):
        a, b, c, d = ROOMS[name]
        tray(a - 0.3, b - 0.6, c + 0.3, b, z, M, out, 'u')
    for a, b in wall_stubs()[:-1]:                                  # (the tube jamb's top is the canopy beak)
        c = (a + b) / 2
        tray(a, max(north_edge(c - 0.22), north_edge(c + 0.22)) + 0.1, b, SPLIT - 0.06, z, M, out, 'v')

def wing(sv, M, out, rng):
    """Swept wing out to the nacelle, low (below the deck top): leading-edge armour, gold stripe, slits."""
    A, B, C, D = (-10.9, 4.3), (-17.0, 6.55), (-22.6, 6.55), (-23.4, 3.2)
    f = lambda p: (p[0], sv * p[1])
    pts = [f(p) for p in (A, B, C, D)]
    o = prism('wing', pts, -0.22, 0.28, M['hull'], bevel=0.04); o['big'] = 1; out.append(o)
    # leading-edge armour (dark) and the gold stripe parallel to it, like the interceptor's wings
    out.append(strip('wing_le', [f(A), f((B[0] - 0.15, B[1] + 0.06))], 0.0, -0.22 * sv, -0.25, 0.3, M['hull2'], bevel=0.02))
    dx, dy = B[0] - A[0], B[1] - A[1]; L = math.hypot(dx, dy); n = (-dy / L, dx / L)       # n: towards the trailing edge
    Lp = lambda t, off: f((A[0] + dx * t + n[0] * off, A[1] + dy * t + n[1] * off))
    out.append(prism('wing_stripe', [Lp(0.3, 0.3), Lp(0.95, 0.3), Lp(0.95, 0.95), Lp(0.55, 0.95)], 0.28, 0.292, M['stripe'], bevel=0.0))
    for k in range(3):                                              # intake slits at the wing root
        u = -20.6 + k * 0.45
        out.append(cbox('wslit', u, sv * 5.25, 0.14, 0.75, 0.28, 0.02, M['black'], bevel=0.006))
    for (u, vv) in ((-14.8, 5.2), (-18.3, 5.6), (-20.8, 4.6), (-21.6, 5.5), (-13.4, 4.95)):  # rivets
        out.append(rivet(u, sv * vv, 0.28, M['steel'], 0.035))
    # panel grooves
    for (a, b) in (((-16.0, 5.3), (-21.8, 5.3)), ((-19.0, 4.2), (-19.0, 6.4))):
        out.append(strip('groove', [f(a), f(b)], -0.012, 0.012, 0.28, 0.287, M['black']))

def nacelle(sv, M, out):
    v, z, r = sv * NAC_V, NAC_Z, NAC_R
    u0, u1 = NAC_U
    body = u_cone('nacelle', u1, u0, v, z, r, r, M['pod'], verts=48, bevel=0.04); body['big'] = 1; out.append(body)
    nose = mn.sphere('nacelle_nose', 1.0, loc=P(u0, v, z), m=M['pod'], scale=(1.15, r, r), segs=48); out.append(nose)
    for uc in (-19.3, -22.3):                                       # dark bands with rivet rows
        out.append(u_cone('nac_band', uc - 0.22, uc + 0.22, v, z, r + 0.04, r + 0.04, M['pod2'], verts=48, bevel=0.015))
        for k in range(7):
            a = math.radians(20 + 20 * k)
            out.append(rivet(uc, v + math.cos(a) * (r + 0.05), z + math.sin(a) * (r + 0.05), M['steel'], 0.032))
    # nozzle: gunmetal cone, glowing rim and a hot spike in its throat (seen from the side, the glow shows)
    out.append(u_cone('nozzle', u1 + 0.02, u1 - 0.55, v, z, r * 0.92, r * 0.85, M['gun'], verts=48, bevel=0.02))
    out.append(u_cone('nozzle_hot', u1 - 0.55, u1 - 1.0, v, z, r * 0.85, r * 0.8, M['heat'], verts=48, bevel=0.01))
    rim = u_cone('nozzle_rim', u1 - 0.98, u1 - 1.1, v, z, r * 0.84, r * 0.84, M['hot'], verts=48, bevel=0.0); rim['no_ol'] = 1; out.append(rim)
    sp = u_cone('nozzle_spike', u1 - 0.8, u1 - 1.4, v, z, r * 0.5, 0.12, M['hot2'], verts=32, bevel=0.0); sp['no_ol'] = 1; out.append(sp)
    inner = u_cone('nozzle_in', u1 - 1.0, u1 - 1.04, v, z, r * 0.74, r * 0.74, M['hot'], verts=48, bevel=0.0); inner['no_ol'] = 1; out.append(inner)
    # intake scoop on top (dark hole), nav light on the nose
    out.append(ucyl('intake', 0.45, 0.3, -18.5, v, z + r - 0.16, M['pod2'], verts=32, bevel=0.03))
    o = ucyl('intake_hole', 0.32, 0.02, -18.5, v, z + r + 0.14, M['black'], verts=32, bevel=0.0); o['no_ol'] = 1; out.append(o)
    out.append(mn.sphere('nav', 0.11, loc=P(u0 + 0.85, v + sv * 0.55, z + 0.45), m=M['navg'] if sv > 0 else M['navr'], segs=16))
    # pylon fairing where the wing meets the pod
    out.append(prism('pylon', [(-17.4, sv * 5.95), (-23.0, sv * 5.95), (-23.0, sv * 6.4), (-17.9, sv * 6.4)], -0.1, 0.55, M['hull2'], bevel=0.05))

def centre_engine(M, out):
    out.append(prism('eng_block', [(-25.4, -1.6), (-26.6, -1.35), (-26.6, 1.35), (-25.4, 1.6)], -0.45, 0.95, M['hull2'], bevel=0.08))
    for k in range(4):                                              # rear-deck vents
        vv = -0.6 + k * 0.4
        out.append(cbox('vent', -26.0, vv, 0.75, 0.12, 0.95, 0.02, M['black'], bevel=0.006))
    z = 0.25
    out.append(u_cone('cnozzle', -26.55, -27.0, 0.0, z, 0.8, 0.75, M['gun'], verts=48, bevel=0.02))
    out.append(u_cone('cnozzle_hot', -27.0, -27.45, 0.0, z, 0.75, 0.7, M['heat'], verts=48, bevel=0.01))
    o = u_cone('cnozzle_rim', -27.43, -27.55, 0.0, z, 0.73, 0.73, M['hot'], verts=48, bevel=0.0); o['no_ol'] = 1; out.append(o)
    o = u_cone('cnozzle_in', -27.45, -27.48, 0.0, z, 0.64, 0.64, M['hot'], verts=48, bevel=0.0); o['no_ol'] = 1; out.append(o)
    o = u_cone('cnozzle_spike', -27.25, -27.85, 0.0, z, 0.38, 0.1, M['hot2'], verts=32, bevel=0.0); o['no_ol'] = 1; out.append(o)

def canopy(M, out):
    cu, cv, a, b, h = CAN
    zr = H_FULL
    def ell(name, sx, sy, sz, z, m, segs=64):
        o = mn.sphere(name, 1.0, loc=P(cu, cv, z), m=m, scale=(sx, sy, sz), segs=segs); out.append(o); return o
    ell('canopy_frame', a + 0.09, b + 0.08, h * 0.45, zr - 0.02, M['gun'], 48)
    ell('canopy', a, b, h, zr, M['glass'], 96)
    s = ell('canopy_strut', 0.07, b + 0.015, h + 0.015, zr, M['gun'], 48); s.location = P(cu - 0.35, cv, zr); s['no_ol'] = 1
    g = mn.sphere('canopy_glint', 1.0, loc=P(cu + 0.45, cv - 0.25, zr + h * 0.86), m=M['shine'], scale=(0.32, 0.06, 0.02), segs=24)
    g.rotation_euler = (0.0, -0.45 * S, -0.35 * S); g['no_ol'] = 1; out.append(g)
    o = mn.sphere('hud', 0.07, loc=P(cu - 0.55, cv + 0.15, zr + 0.25), m=M['hud'], scale=(1.5, 0.6, 0.4), segs=12); o['no_ol'] = 1; out.append(o)
    # dark nose cap on the beak tip with shark teeth (the interceptor's), and the canopy's kill marks
    out.append(prism('nosecap', [(-3.15, -2.45), (-2.7, -2.0), (-2.8, -1.3), (-3.2, -1.12)], zr, zr + 0.06, M['hull2'], bevel=0.015))
    for k in range(4):
        t = 0.15 + k * 0.22
        p = (-3.15 + (0.45) * t * 0.9, -2.45 + 0.45 * t * 0.9)
        out.append(prism('tooth', [(p[0] - 0.02, p[1] + 0.06), (p[0] + 0.12, p[1] - 0.04), (p[0] - 0.08, p[1] - 0.07)], zr + 0.06, zr + 0.065, M['white'], bevel=0.0))
    for k in range(5):
        out.append(cbox('kill', -5.0 + k * 0.1, -1.04, 0.035, 0.14, zr, 0.008, M['white'], bevel=0.0))
    o = mn.sphere('sensor', 0.08, loc=P(-2.85, -1.65, zr + 0.06), m=M['navr'], segs=12); out.append(o)

def turret(M, out, u0, v0, z0, aim=-0.3, k=1.9):
    """The interceptor's turret (interceptor.py render_turret), scaled up, on a sponson; barrel along aim."""
    out.append(ucyl('sponson', 0.82, H_FULL, u0, v0, 0.0, M['hull'], verts=48, bevel=0.04)); out[-1]['big'] = 1
    out.append(ucyl('turret_ring', 0.66, 0.12, u0, v0, z0, M['steel'], verts=48, bevel=0.02))
    out.append(D.ring('tur_gold', 0.76, 0.1, 0.06, loc=P(u0, v0, z0), m=M['stripe']))
    parts = []
    gun, gun2 = M['gunl'], M['gun']
    def lpr(name, pts, za, zb, m, bevel=0.02):
        me = bpy.data.meshes.new(name); bm = bmesh.new()
        vs = [bm.verts.new((x, -y, za)) for x, y in pts]; f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, verts=[g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)], vec=Vector((0, 0, zb - za)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
        o = mn.link(bpy.data.objects.new(name, me))
        if bevel: mn.bev(o, bevel)
        mn.assign(o, m); return mn.smooth(o)
    def xcyl(name, r, x0, x1, z, m, bevel=0.01, verts=24):
        return mn.cyl(name, r, x1 - x0, loc=(x0, 0, z), m=m, verts=verts, bevel=bevel, rot=(0, R90, 0))
    parts.append(lpr('tur_head', [(-0.22, -0.2), (0.14, -0.22), (0.28, -0.12), (0.28, 0.12), (0.14, 0.22), (-0.22, 0.2), (-0.27, 0.12), (-0.27, -0.12)], 0.04, 0.28, gun, 0.025))
    parts.append(lpr('tur_plate', [(-0.16, -0.11), (0.1, -0.12), (0.1, 0.12), (-0.16, 0.11)], 0.27, 0.3, gun2, 0.008))
    parts.append(mn.sphere('tur_sight', 0.035, loc=(0.06, 0.16, 0.25), m=M['sight'], segs=12))
    parts.append(lpr('tur_mantlet', [(0.2, -0.12), (0.46, -0.12), (0.46, 0.12), (0.2, 0.12)], 0.07, 0.26, gun2, 0.03))
    parts.append(xcyl('tur_sleeve', 0.1, 0.42, 0.88, 0.165, gun))
    parts.append(xcyl('tur_barrel', 0.07, 0.86, 1.27, 0.165, M['steel']))
    parts.append(xcyl('tur_muzzle', 0.11, 1.25, 1.45, 0.165, gun2, bevel=0.015, verts=8))
    parts.append(xcyl('tur_bore', 0.045, 1.44, 1.455, 0.165, M['black'], bevel=0.0)); parts[-1]['no_ol'] = 1
    parts.append(xcyl('tur_haz', 0.103, 0.7, 0.78, 0.165, M['hazard'], bevel=0.0)); parts[-1]['no_ol'] = 1
    parts.append(lpr('tur_feed', [(-0.36, -0.12), (-0.2, -0.12), (-0.2, 0.12), (-0.36, 0.12)], 0.05, 0.2, gun2, 0.02))
    for kk in range(2):
        for sy in (1, -1): parts.append(mn.sphere('bolt', 0.02, loc=(-0.08 + kk * 0.14, 0.13 * sy, 0.22), m=M['steel'], segs=8))
    # place: scale k, turn by aim (in the u, v plane), move onto the sponson, mirror for starboard
    ca, sa = math.cos(aim), math.sin(aim)
    for o in parts:
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy(); o.data.transform(mw); o.matrix_world = o.matrix_world.__class__.Identity(4)
        for vt in o.data.vertices:
            a, b, z = vt.co.x * k, -vt.co.y * k, vt.co.z * k
            vt.co = P(u0 + a * ca - b * sa, v0 + a * sa + b * ca, z0 + 0.06 + z)
        if S < 0: o.data.flip_normals()
        o.data.update()
    out += parts

def searchlight(M, out, u, v, z):
    out.append(ucyl('tower', 0.18, 0.7, u, v, z, M['hull2'], verts=16, bevel=0.02))
    out.append(cbox('lamp_box', u, v + 0.05, 0.46, 0.36, z + 0.7, 0.28, M['hull2'], bevel=0.04))
    out.append(ubox('lamp_face', u - 0.16, v + 0.22, u + 0.16, v + 0.25, z + 0.73, z + 0.95, M['lamp'], bevel=0.01))

def claw(M, out):
    """The docking claw (variants.py build_claw's jaws, bigger): two hooked jaws on hydraulic mounts either
    side of the nose, biting round the tube's collar."""
    prof = [(0.0, 0.0), (0.38, 0.02), (0.54, 0.1), (0.6, 0.24), (0.5, 0.26), (0.44, 0.15), (0.32, 0.13), (0.04, 0.16)]
    k = 1.6
    for sv, hinge, z0, z1 in ((1, (-5.25, 1.3), 0.2, 0.4), (-1, (-4.6, -1.05), 0.2, 0.4)):
        ang = math.atan2(-sv * 0.21, 1.0)                           # pointing +u, a bit towards the tube
        c, s = math.cos(ang), math.sin(ang)
        pts = [(hinge[0] + k * (u * c + sv * w * s), hinge[1] + k * (u * s - sv * w * c)) for u, w in prof]
        out.append(prism('jaw', pts, z0, z1, M['clawsteel'], bevel=0.03))
        tip = pts[3]
        out.append(mn.sphere('jawtooth', 0.06, loc=P(tip[0], tip[1], (z0 + z1) / 2), m=M['gun'], segs=12))
        band = [(hinge[0] + k * (u * c + sv * w * s), hinge[1] + k * (u * s - sv * w * c)) for u, w in ((0.1, 0.02), (0.2, 0.025), (0.2, 0.14), (0.1, 0.155))]
        o = prism('jawband', band, z1, z1 + 0.008, M['hazard'], bevel=0.0); o['no_ol'] = 1; out.append(o)
        out.append(ucyl('jawpin', 0.1, z1 - z0 + 0.1, hinge[0], hinge[1], z0 - 0.05, M['steel'], verts=16, bevel=0.015))
        if sv > 0:
            out.append(cbox('clawmount', -5.75, 1.75, 0.6, 0.5, H_LOW, 0.2, M['gun'], bevel=0.03))
            o = cbox('clawhaz', -5.75, 1.75, 0.5, 0.36, H_LOW + 0.2, 0.006, M['hazard'], bevel=0.0); o['no_ol'] = 1; out.append(o)
            out.append(pipe_uv('piston', [(-5.6, 1.6, H_LOW + 0.12), (-4.8, 1.12, 0.32)], 0.04, M['steel'], corner=0.01))

def raider_exterior(M, rng, out, brig=False):
    zr = H_FULL
    for sv in (1, -1):
        wing(sv, M, out, rng); nacelle(sv, M, out)
    centre_engine(M, out)
    canopy(M, out)
    if brig: out.append(ucyl('sponson', 0.82, H_FULL, *TURRET, 0.0, M['hull'], verts=48, bevel=0.04)); searchlight(M, out, TURRET[0], TURRET[1], zr)
    else: turret(M, out, *TURRET, zr)
    # flag mast on the centre engine block (the flying raider flies its flag at the stern too)
    mu, mv, mz = -26.2, -0.9, 0.95
    out.append(ucyl('mast', 0.05, 3.0, mu, mv, mz, M['steel'], verts=12, bevel=0.01))
    out.append(mn.sphere('mast_knob', 0.08, loc=P(mu, mv, mz + 3.05), m=M['gold'], segs=12))
    out.append(ucyl('mast_foot', 0.11, 0.12, mu, mv, mz, M['gun'], verts=16, bevel=0.02))
    out.append(flag(mu, mv, mz + 1.75, 2.0, 1.15, M))
    # gold pinstripe round the south deck, like the stripes on the interceptor's wings
    line = [(-7.4, 3.1)] + [p for p in S_OUT if -25.0 < p[0] < -7.4] + [(-25.0, 3.5)]   # (westwards: left = inboard)
    out.append(strip('stripe_gold', line, 0.24, 0.34, H_LOW, H_LOW + 0.006, M['stripe']))
    out[-1]['no_ol'] = 1
    # name, registration, nav lights, kill marks, patches
    v1 = EDGE['cargo']
    text('name', 'RED COMET', -14.6, v1 - 0.47, H_LOW + 0.003, 0.3, M['gold'])
    if brig: text('name2', 'PRISON BARGE 9', -21.6, EDGE['core'] - 0.47, H_LOW + 0.003, 0.2, M['white'])
    else: text('reg', 'RC-13', -8.4, EDGE['airlock'] - 0.47, H_LOW + 0.003, 0.2, M['white'])
    out.append(mn.sphere('navlamp', 0.08, loc=P(-25.2, EDGE['core'] - 0.14, H_LOW + 0.02), m=M['navr'], segs=16))
    out.append(mn.sphere('navlamp', 0.08, loc=P(-7.6, EDGE['airlock'] - 0.14, H_LOW + 0.02), m=M['navg'], segs=16))
    if brig:                                                        # the comet emblem on the near wing
        cu, cv = -17.4, 5.05
        out.append(disc('comet', cu + 0.5, cv, 0.285, 0.34, M['red']))
        for kk in range(3):
            out.append(cbox('tail', cu - 0.25 - kk * 0.18, cv - 0.09 + kk * 0.09, 1.05 - kk * 0.22, 0.09, 0.282, 0.004, M['red'], bevel=0))
    else:
        skull(-17.2, 4.95, 0.285, 0.95, M['white'], out, face=False)    # jolly roger stencil on the near wing
    weld_patch('scrap', -15.5, 5.12, 0.28, 0.8, 0.5, 0.25, M, out, rng)
    weld_patch('scrap', -24.0, 2.0 + 1.1, H_LOW, 0.6, 0.38, -0.2, M, out, rng)
    weld_patch('scrap', -26.0, 0.9, 0.95, 0.5, 0.42, 0.3, M, out, rng)
    weld_patch('scrap', -22.4, -5.0, 0.28, 0.7, 0.45, -0.2, M, out, rng)
    tape(-15.3, 5.1, 0.32, 0.5, M['tape'], out, rotz=1.3)
    # antenna (pirate) / second searchlight (brig) on the cargo roof
    if brig: searchlight(M, out, -14.6, -4.35, zr)
    else:
        out.append(ucyl('antenna', 0.03, 1.1, -14.6, -4.45, zr, M['steel'], verts=10, bevel=0.005))
        out.append(mn.sphere('ant_tip', 0.06, loc=P(-14.6, -4.45, zr + 1.12), m=M['lamp_red'], segs=12))
    # rivets on the deck's south faces
    for name, (u0, u1) in (('core', (-25.0, -20.2)), ('cargo', (-18.2, -10.6)), ('airlock', (-8.8, -7.6))):
        x = u0 + 0.3
        while x < u1:
            out.append(face_rivet(x, EDGE[name] - 0.005, 0.2, M['steel'], 0.025)); x += 0.8
    claw(M, out)

def build_pirate(M, rng, out):
    der = False
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    # back walls with custom features
    back_wall(A_[0], A_[2], A_[1], M, rng, out, skip=[(-9.6, -8.4)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out, skip=[(-17.9, -16.8), (-12.6, -11.4)])
    back_wall(K_[0], K_[2], K_[1], M, rng, out, skip=[(-22.4, -20.6)])
    # airlock: weapons rack + lockers
    v = A_[1]
    out.append(ubox('rack', -9.75, v, -8.25, v + 0.08, 0.5, 1.35, M['body'], bevel=0.02))
    for i in range(4):
        u = -9.55 + i * 0.37
        out.append(ubox('rifle', u - 0.04, v + 0.08, u + 0.04, v + 0.16, 0.6, 1.25, M['black'], bevel=0.015))
        out.append(ubox('stock', u - 0.06, v + 0.08, u + 0.06, v + 0.18, 0.6, 0.78, M['scrap'], bevel=0.02))
    text('sign', 'NO SNITCHES', -7.4, v + 0.04, 1.08, 0.13, M['white'], face=True)
    for u in (-6.6, -6.1):
        out.append(ubox('locker', u - 0.23, v, u + 0.23, v + 0.32, 0.0, 1.3, M['trim'], bevel=0.03))
        for z in (0.95, 1.05, 1.15): out.append(ubox('lvent', u - 0.14, v + 0.32, u + 0.14, v + 0.335, z, z + 0.03, M['black'], bevel=0))
        out.append(ubox('lhandle', u + 0.12, v + 0.32, u + 0.16, v + 0.36, 0.6, 0.8, M['steel'], bevel=0.008))
    out.append(ubox('tape', -6.75, v + 0.32, -6.45, v + 0.335, 0.4, 0.49, M['tape'], bevel=0.002))
    # airlock floor: hazard band by the outer door, oil, boot scuffs
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    stain(-8.3, 1.2, 0.45, M['oil'], out, sv=0.7, rotz=0.4)
    debris(-10.0, -1.9, -6.4, 2.2, 6, [M['scrap'], M['steel'], M['black']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo: stolen goods stacked against the back wall, a skull painted on the floor, coins by the loot crate
    v = C_[1]
    stack = [(-18.0, 0.55, 0.9, 'trim'), (-17.35, 0.5, 0.6, 'panel'), (-17.35, 0.5, 0.55, 'scrap')]
    out.append(ubox('goods', -18.3, v, -17.6, v + 0.42, 0.0, 0.9, M['scrap'], bevel=0.03))
    out.append(ubox('goods', -17.55, v, -16.9, v + 0.42, 0.0, 0.6, M['panel'], bevel=0.03))
    out.append(ubox('goods', -17.5, v + 0.03, -16.95, v + 0.39, 0.6, 1.05, M['trim'], bevel=0.03))
    text('stencil', 'MINE', -17.95, v + 0.425, 0.45, 0.12, M['white'], face=True)
    for i, u in enumerate((-12.4, -11.85)):                          # barrels
        out.append(ucyl('barrel', 0.24, 0.8, u, v + 0.3, 0.0, M['red'] if i else M['gold'], verts=24, bevel=0.03))
        for z in (0.2, 0.6): out.append(D.ring('hoop', 0.25, 0.03, 0.04, loc=P(u, v + 0.3, z), m=M['steel']))
    out.append(ucyl('barrel_top', 0.2, 0.01, -12.4, v + 0.3, 0.8, M['black'], verts=24, bevel=0))
    skull(-14.2, 1.6, FLOOR_Z + 0.001, 1.5, M['white'], out, face=False)
    for i in range(14):                                             # spilled coins near the crate
        a, r = rng.uniform(0, math.tau), rng.uniform(0.75, 1.3)
        out.append(ucyl('coin', 0.05, 0.012, SPOT['crate'][0] + math.cos(a) * r, SPOT['crate'][1] + math.sin(a) * r * 0.8 + 0.3, FLOOR_Z, M['gold'], verts=12, bevel=0.003))
    stain(-12.0, 2.6, 0.55, M['oil'], out, sv=0.6, rotz=-0.3); stain(-17.2, 2.0, 0.4, M['rustd'], out)
    debris(-18.2, -1.0, -11.0, 3.8, 10, [M['scrap'], M['steel'], M['black'], M['gold']], rng, out,
           avoid=[(*SPOT['crate'], 1.1), (*SPOT['loot_drop'], 0.6), (-14.2, 1.6, 0.8), (*SPOT['npc'], 0.7)])
    # bottles
    for u, vv in ((-11.3, 3.4), (-11.5, 3.6), (-17.9, 3.4)):
        out.append(ucyl('bottle', 0.05, 0.2, u, vv, FLOOR_Z, M['glass'], verts=12, bevel=0.01))
    # core room back wall: gauges, valve wheels, warning
    v = K_[1]
    for i, u in enumerate((-22.1, -21.0)):
        out.append(mn.cyl('gauge', 0.16, 0.08, loc=P(u, v + 0.0, 1.0), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.02))
        out.append(mn.cyl('gface', 0.13, 0.02, loc=P(u, v + 0.08, 1.0), m=M['white'], rot=(R90, 0, 0), verts=24, bevel=0.004))
        nd = mn.box('needle', (0.016, 0.012, 0.11), loc=P(u, v + 0.1, 1.0), m=M['red'], bevel=0); nd.rotation_euler = (0, math.radians(50 if i else -30), 0); out.append(nd)
        out.append(D.ring('valve', 0.15, 0.035, 0.04, loc=P(u, v + 0.12, 0.55), m=M['red'], rot=(R90, 0, 0)))
        out.append(ubox('valve_spoke', u - 0.13, v + 0.1, u + 0.13, v + 0.13, 0.535, 0.565, M['red'], bevel=0.005))
    out.append(ubox('warn', -21.95, v, -21.15, v + 0.02, 1.3, 1.5, M['sticker'], bevel=0.003))
    text('warn_t', "DON'T TOUCH", -21.55, v + 0.025, 1.4, 0.08, M['ink'], face=True)
    stain(-21.0, 1.6, 0.5, M['oil'], out, sv=0.6); stain(-24.6, -2.2, 0.3, M['rustd'], out)
    raider_exterior(M, rng, out, brig=False)

# ---------------------------------------------------------------------------------------------------
# Prison barge (the Red Comet's brig): pirate interior, Dr. Varga in the cargo hold
# ---------------------------------------------------------------------------------------------------
def build_brig(M, rng, out):
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    back_wall(A_[0], A_[2], A_[1], M, rng, out, skip=[(-9.7, -8.5)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out)
    back_wall(K_[0], K_[2], K_[1], M, rng, out, skip=[(-22.4, -20.6)])
    # airlock: guard post (key board, lockers, a 'VISITORS' sign)
    v = A_[1]
    out.append(ubox('keyboard', -9.6, v, -8.6, v + 0.06, 0.8, 1.35, M['scrap'], bevel=0.02))
    for i in range(5):
        out.append(ubox('key', -9.45 + i * 0.18, v + 0.06, -9.4 + i * 0.18, v + 0.08, 1.02, 1.12, M['gold'], bevel=0.004))
    text('sign', 'NO VISITORS', -7.3, v + 0.04, 1.08, 0.13, M['white'], face=True)
    for u in (-6.6, -6.1):
        out.append(ubox('locker', u - 0.23, v, u + 0.23, v + 0.32, 0.0, 1.3, M['panel2'], bevel=0.03))
        for z in (0.95, 1.05, 1.15): out.append(ubox('lvent', u - 0.14, v + 0.32, u + 0.14, v + 0.335, z, z + 0.03, M['black'], bevel=0))
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    debris(-10.0, -1.9, -6.4, 2.2, 4, [M['scrap'], M['steel']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo hold: cells along the back wall (bars in front of shallow alcoves), the prisoner's spot
    v = C_[1]
    for (a, b) in ((-18.3, -15.5), (-13.7, -10.9)):
        out.append(ubox('cell_back', a, v, b, v + 0.04, 0.12, 1.45, M['body'], bevel=0.01))
        out.append(ubox('cell_top', a, v, b, v + 0.5, 1.4, 1.5, M['hull2'], bevel=0.02))
        n = int((b - a) / 0.2)
        for i in range(n + 1):
            u = a + 0.05 + i * (b - a - 0.1) / n
            out.append(ucyl('bar', 0.025, 1.38, u, v + 0.46, 0.02, M['steel'], verts=10, bevel=0.005))
        out.append(ubox('cell_rail', a, v + 0.42, b, v + 0.5, 0.0, 0.06, M['rim'], bevel=0.01))
        out.append(ubox('cell_bar_h', a, v + 0.43, b, v + 0.49, 0.75, 0.8, M['steel'], bevel=0.008))
        text('cellno', 'C1' if a < -15 else 'C2', (a + b) / 2, v + 0.505, 1.45, 0.1, M['white'], face=True)
        out.append(ubox('cot', a + 0.2, v + 0.05, a + 1.2, v + 0.38, 0.0, 0.3, M['scrap'], bevel=0.03))
    # Dr. Varga's spot (npcSpot): a thin mat on the floor, a ring bolted to the deck and a chain to it
    nu, nv = SPOT['npc']
    out.append(cbox('mat', nu, nv, 1.1, 0.62, FLOOR_Z, 0.03, M['scrap'], bevel=0.02, rotz=math.radians(4)))
    ru, rv = nu + 0.9, nv - 0.5
    out.append(D.ring('floor_ring', 0.09, 0.025, 0.03, loc=P(ru, rv, FLOOR_Z), m=M['steel']))
    out.append(ucyl('ring_base', 0.12, 0.02, ru, rv, FLOOR_Z, M['dark'], verts=16, bevel=0.005))
    links = [(ru - i * 0.11, rv + i * 0.06 + 0.02 * math.sin(i), FLOOR_Z + 0.02) for i in range(7)]
    for (a, b, z) in links: out.append(D.ring('link', 0.035, 0.012, 0.014, loc=P(a, b, z), m=M['steel']))
    stain(-12.2, 2.8, 0.5, M['oil'], out, sv=0.6)
    debris(-18.2, -2.6, -11.0, 3.8, 7, [M['scrap'], M['steel'], M['paper']], rng, out,
           avoid=[(*SPOT['crate'], 1.1), (*SPOT['loot_drop'], 0.6), (*SPOT['npc'], 1.0)])
    text('stencil', 'HOLD', -14.6, 3.4, FLOOR_Z + 0.002, 0.4, M['sticker'])
    # core room back wall: gauges as on the raider
    v = K_[1]
    for i, u in enumerate((-22.1, -21.0)):
        out.append(mn.cyl('gauge', 0.16, 0.08, loc=P(u, v, 1.0), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.02))
        out.append(mn.cyl('gface', 0.13, 0.02, loc=P(u, v + 0.08, 1.0), m=M['white'], rot=(R90, 0, 0), verts=24, bevel=0.004))
        out.append(D.ring('valve', 0.15, 0.035, 0.04, loc=P(u, v + 0.12, 0.55), m=M['red'], rot=(R90, 0, 0)))
    stain(-21.2, 1.7, 0.5, M['oil'], out, sv=0.6)
    raider_exterior(M, rng, out, brig=True)

# ---------------------------------------------------------------------------------------------------
# Derelict lab module (Dr. Varga's station)
# ---------------------------------------------------------------------------------------------------
def build_derelict(M, rng, out):
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    back_wall(A_[0], A_[2], A_[1], M, rng, out, lamps='dead', skip=[(-9.0, -7.6)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out, lamps='dead', skip=[(-18.0, -15.6), (-14.0, -11.2)])
    back_wall(K_[0], K_[2], K_[1], M, rng, out, lamps='dead', skip=[(-23.0, -21.0)])
    # emergency strips along the bottom of every back wall and the room edges (the only light in here)
    for r in ROOMS.values():
        emergency_strip(r[0] + 0.1, r[2] - 0.1, r[1] + 0.12, M, out, rng, dead=0.35)
        emergency_strip(r[0] + 0.1, r[2] - 0.1, r[3] - 0.1, M, out, rng, dead=0.5, color='lamp_amber')
    # airlock: dead suit locker, helmet on the floor, frost, a 'LAB 3' sign, a dead screen
    v = A_[1]
    wall_screen(-8.3, v, 0.85, 0.9, 0.5, M, out, M['screen_dead'])
    out.append(ubox('sign', -7.2, v, -5.9, v + 0.02, 1.15, 1.45, M['white'], bevel=0.004))
    text('sign_t', 'LAB 3  AIRLOCK', -6.55, v + 0.025, 1.3, 0.1, M['ink'], face=True)
    hel = mn.sphere('helmet', 0.2, loc=P(-9.4, 1.6, FLOOR_Z + 0.16), m=M['white'], scale=(1, 1, 0.9), segs=24); out.append(hel)
    out.append(mn.sphere('visor', 0.15, loc=P(-9.4, 1.72, FLOOR_Z + 0.17), m=M['glass'], scale=(1, 0.6, 0.7), segs=20))
    stain(-6.6, -1.4, 0.7, M['frostd'], out, sv=0.8); stain(-9.3, -1.2, 0.5, M['frostd'], out)
    debris(-10.0, -1.9, -6.0, 2.2, 10, [M['panel'], M['steel'], M['paper'], M['black']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo = the lab: specimen tanks (cracked, empty), a lab bench, dead screens, papers everywhere
    v = C_[1]
    for i, u in enumerate((-17.6, -16.4)):
        out.append(ucyl('tank_base', 0.36, 0.18, u, v + 0.32, 0.0, M['body'], verts=32, bevel=0.03))
        gl = mn.cyl('tank', 0.3, 1.05, loc=P(u, v + 0.32, 0.18), m=M['glass'], verts=32, bevel=0.01); out.append(gl)
        out.append(ucyl('tank_cap', 0.36, 0.16, u, v + 0.32, 1.23, M['body'], verts=32, bevel=0.03))
        out.append(ucyl('tank_fluid', 0.27, 0.15 if i == 0 else 0.0001, u, v + 0.32, 0.18, emit_mat('fluid', '#4aff9a', 0.6, base='#2a6a4a'), verts=24, bevel=0))
    for (u, vv) in ((-16.0, -3.2), (-16.3, -2.95), (-15.8, -2.7)):     # glass shards from the broken tank
        out.append(cbox('glass_shard', u, vv, 0.14, 0.07, FLOOR_Z, 0.01, M['glass'], bevel=0, rotz=rng.uniform(0, 3)))
    stain(-16.3, -2.9, 0.55, M['slime'], out, sv=0.7)                 # something got out of it
    out.append(ubox('bench', -14.0, v, -11.3, v + 0.42, 0.62, 0.72, M['panel2'], bevel=0.02))
    for u in (-13.85, -11.45): out.append(ubox('bench_leg', u - 0.04, v + 0.05, u + 0.04, v + 0.38, 0.0, 0.62, M['steel'], bevel=0.01))
    out.append(ucyl('scope', 0.06, 0.3, -13.4, v + 0.2, 0.72, M['black'], verts=12, bevel=0.01))
    out.append(cbox('scope_base', -13.4, v + 0.22, 0.2, 0.2, 0.72, 0.04, M['white'], bevel=0.01))
    for (u, d) in ((-12.7, 0.0), (-12.4, 0.12), (-11.9, -0.05)):
        out.append(cbox('paper', u, v + 0.2 + d, 0.2, 0.26, 0.72, 0.004, M['paper'], bevel=0, rotz=rng.uniform(-0.5, 0.5)))
    wall_screen(-12.6, v, 0.95, 1.2, 0.5, M, out, M['screen_dead'])
    out.append(ubox('scr_crack', -12.9, v + 0.085, -12.3, v + 0.09, 1.15, 1.17, M['white'], bevel=0, rotz=0.0))
    text('inst', 'VARGA INSTITUTE', -16.8, v + 0.04, 1.42, 0.1, M['white'], face=True)
    # the fire spot (dk.dock.fires starts at SPOT.fire): a burst gas line in the floor, scorch around it
    fu, fv = SPOT['fire']
    stain(fu, fv, 0.95, M['soot'], out, sv=0.8)
    out.append(cbox('fire_grate', fu, fv, 0.5, 0.5, FLOOR_Z, 0.015, M['bar'], bevel=0.005))
    out.append(cbox('fire_hole', fu, fv, 0.38, 0.38, FLOOR_Z, 0.016, M['black'], bevel=0))
    out.append(pipe_uv('burst', [(fu - 0.3, fv + 0.05, -0.02), (fu - 0.05, fv, 0.08), (fu + 0.1, fv - 0.05, 0.1)], 0.05, M['copper']))
    out.append(ring('burst_end', 0.07, 0.03, 0.03, loc=P(fu + 0.1, fv - 0.05, 0.08), m=M['black']))
    for k in range(18):                                                  # papers, everywhere
        u, vv = rng.uniform(-18.2, -11.0), rng.uniform(-2.0, 3.8)
        if math.hypot(u - fu, vv - fv) < 1.0 or math.hypot(u - SPOT['crate'][0], vv - SPOT['crate'][1]) < 1.0: continue
        out.append(cbox('paper', u, vv, 0.2, 0.26, FLOOR_Z + 0.002 * k, 0.004, M['paper'], bevel=0, rotz=rng.uniform(0, 3)))
    debris(-18.2, -2.0, -11.0, 3.8, 14, [M['panel'], M['steel'], M['black'], M['glass']], rng, out,
           avoid=[(*SPOT['crate'], 1.0), (fu, fv, 0.9), (*SPOT['npc'], 0.7)])
    stain(-11.6, 3.2, 0.7, M['frostd'], out); stain(-18.0, 3.4, 0.6, M['frostd'], out)
    # a floor plate lifted by something from below, propped against the debris
    out.append(cbox('lifted', -17.3, 1.0, 0.95, 0.95, 0.03, 0.035, M['plates'][1], bevel=0.012, rotz=0.3))
    out[-1].rotation_euler.x = math.radians(14)
    # core room: claw marks on the wall and a slime nest where the intruder sleeps (SPOT.alien)
    v = K_[1]
    wall_screen(-22.0, v, 0.8, 1.6, 0.55, M, out, M['screen_dead'])
    out.append(ubox('scr_err', -22.7, v + 0.085, -22.45, v + 0.09, 1.15, 1.25, emit_mat('err', '#ff3a2a', 0.6, base='#401010'), bevel=0))
    for k in range(4):                                                   # claw gouges on the left wall section
        u = -24.4 + k * 0.12
        g = mn.box('gouge', (0.035, 0.03, 0.55), loc=P(u, v + 0.03, 0.35), m=M['black'], bevel=0, rot=(0, math.radians(18) * S, 0)); out.append(g)
    au, av = SPOT['alien']
    stain(au, av, 0.9, M['slime'], out, sv=0.75)
    stain(au - 0.4, av + 0.35, 0.5, M['slime'], out)
    for k in range(9):                                                   # nest: lumpy purple growth around the sleeper
        a = k * math.tau / 9 + rng.uniform(-0.2, 0.2); r = rng.uniform(0.75, 0.95)
        b = mn.sphere('nest', rng.uniform(0.09, 0.15), loc=P(au + math.cos(a) * r, av + math.sin(a) * r * 0.75, FLOOR_Z), m=worn('nestm', '#5a2a6a', 0.25, 0.0, wear=0.0), scale=(1.3, 1, 0.55), segs=16)
        out.append(b)
    for k in range(3):
        out.append(mn.sphere('pod', 0.05, loc=P(au + 0.7 + k * 0.1, av - 0.5 + k * 0.08, FLOOR_Z + 0.03), m=emit_mat('podg', '#9cff5a', 0.8, base='#3a6a20'), segs=12))
    # the black box mount (SPOT.box): an opened floor locker next to where the box lies
    bu, bv = SPOT['box']
    out.append(cbox('bb_well', bu + 0.75, bv, 0.5, 0.5, FLOOR_Z, 0.01, M['black'], bevel=0))
    lid = cbox('bb_lid', bu + 0.75, bv - 0.3, 0.5, 0.05, FLOOR_Z, 0.45, M['hazard'], bevel=0.01); out.append(lid)
    text('bb_t', 'FDR', bu + 0.75, bv + 0.38, FLOOR_Z + 0.003, 0.13, M['sticker'])
    debris(-24.8, -2.6, -19.2, 2.6, 8, [M['panel'], M['steel'], M['black']], rng, out,
           avoid=[(*SPOT['core'], 1.4), (au, av, 1.1), (bu, bv, 0.5)])
    stain(-19.8, 2.2, 0.6, M['frostd'], out)
    # exterior: torn far end with girders and cables (the module was ripped off the station), dish, holes
    zr = H_FULL; u0 = HULLR[0]
    for k, vv in enumerate((-3.6, -2.0, -0.4, 1.2, 2.8)):
        L = rng.uniform(0.5, 1.4)
        z = 0.2 if vv > SPLIT else 0.7
        out.append(ubox('girder', u0 - L, vv - 0.07, u0 + 0.2, vv + 0.07, z, z + 0.14, M['steel'], bevel=0.01))
        out.append(cbox('girder_end', u0 - L, vv, 0.06, 0.24, z - 0.04, 0.22, M['soot'] if False else M['black'], bevel=0.01))
    for vv in (-3.0, -1.0, 2.0):
        out.append(pipe_uv('dangle', [(u0 + 0.1, vv, 0.3), (u0 - 0.4, vv + 0.2, 0.15), (u0 - 0.9, vv + 0.1, -0.2)], 0.035, M['cables'][rng.randrange(3)]))
    out.append(disc('tear_soot', u0 + 0.4, -3.0, zr + 0.003, 0.7, M['soot']))
    du, dv = -7.6, -3.7                                                  # broken antenna dish on the airlock roof
    out.append(ucyl('dish_post', 0.07, 0.5, du, dv, zr, M['steel'], verts=12, bevel=0.01))
    dsh = mn.sphere('dish', 0.55, loc=P(du, dv, zr + 0.55), m=M['panel2'], scale=(1, 1, 0.3), segs=32)
    dsh.rotation_euler = (math.radians(35), math.radians(-20) * S, 0); out.append(dsh)
    out.append(cbox('panel_stub', -21.5, -4.0, 1.4, 0.5, zr, 0.06, M['glass'], bevel=0.01, rotz=0.1))
    for (u, vv, r) in ((-13.2, -4.35, 0.22), (-19.4, 3.9, 0.3), (-6.9, 3.6, 0.25)):
        z = zr if vv < SPLIT else H_LOW
        out.append(disc('hole_soot', u, vv, z + 0.003, r * 2.0, M['soot']))
        out.append(disc('hole', u, vv, z + 0.006, r, M['black']))
        for k in range(6):
            a = k * math.tau / 6 + 0.3
            out.append(cbox('petal', u + math.cos(a) * r, vv + math.sin(a) * r, 0.14, 0.06, z, 0.02, M['hull'], bevel=0, rotz=a))
    v1 = HULLR[3]
    out.append(ubox('trim', HULLR[0] + 0.3, v1 - 0.12, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.06, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'VARGA INSTITUTE  LAB 3', -14.6, v1 - 0.03, -0.2, 0.24, M['white'], face=True)
    text('bio', 'BIOHAZARD', -22.5, v1 - 0.05, H_LOW + 0.003, 0.2, M['sticker'])
    for (u, vv) in ((-8.6, 3.6), (-16.4, 4.4), (-23.0, 3.8)):
        stain(u, vv, 0.6, M['frostd'], out, z=H_LOW + 0.004)
    out.append(mn.sphere('beacon', 0.09, loc=P(HULLR[2] - 0.45, v1 - 0.25, H_LOW + 0.02), m=M['lamp_dead'], segs=16))

# ---------------------------------------------------------------------------------------------------
def build(kind, side):
    mn.reset(); set_side(side)
    rng = random.Random({'pirate': 13, 'brig': 9, 'derelict': 3}[kind])
    M = materials(kind)
    out = []
    structure(kind, M, rng, out)
    {'pirate': build_pirate, 'brig': build_brig, 'derelict': build_derelict}[kind](M, rng, out)
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly')) or o.get('big')]
    rest = [o for o in out if o not in big and not o.get('no_ol') and not o.name.startswith(('stain', 'soot', 'hole_soot', 'tear_soot', 'em', 'paper', 'thr_hz', 'hz_floor'))]
    mn.outline(big, thickness=0.02)
    mn.outline([o for o in rest if not o.name.startswith(('plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'frv', 'coin', 'tray', 'cable', 'strap', 'link'))], thickness=0.012)
    mn.outline([o for o in rest if o.name.startswith('plate')], thickness=0.008)
    return out

if __name__ == '__main__':
    for kind in KINDS:
        for side in SIDES:
            t0 = time.time()
            objs = build(kind, side)
            name = f'dock/{kind}_{side}' + ('_quick' if QUICK else '')
            if QUICK:
                mn.OUT_DIR = '/tmp/mn_dock'; mn._manifest_put = lambda *a, **k: None
            mn.render(name, objs=objs)
            print(f'[dock] {name} in {time.time() - t0:.0f} s')
