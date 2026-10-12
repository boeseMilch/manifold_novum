"""The spore mother (js/organic.js ENEMY_TYPES.mother, drawMother, drawTongue): a vast mottled mass far
out on one side, three lipped mouths on its near flank, a tongue (the weak spot) that tosses spores.

Sprites (assets/sprites/organic/), side = port | star (mirrored builds; port = it's left of our ship),
all sharing the enemy's ground origin (e.x, e.y) through the manifest's ox/oy:
  mother_<side>                    the whole body (24 x 34 units footprint = MOTHER_RX/RY, the game's
                                   hit polygon at z = 0; a 3-unit-high dome), all three mouths shut (a
                                   puckered crease), blotches, pores, veins running to the mouths and
                                   clusters of glowing spore sacs growing on its back. Breathing = the game's
                                   1.2% scale, as now. The cilia along the edge stay procedural (160 waving
                                   strokes; recolour them to the hide's #d8c48e / #9c8752).
  mother_<side>_m<i>_<state>       patches over mouth i = 0..2 (MOTHER_MOUTHS: y = -6.5, 0, 6.5): exact
                                   windows of the body with that mouth in a state; draw over the body at
                                   the same origin. state = g1 | g2 | g3 (gape 0.35 / 0.7 / 1: pick by the
                                   game's gape, 0 = no patch) | hit (torn out: gape 0.45, a ragged stump,
                                   slime bleeding). Edges feathered over 8 px so they blend into the body.
  mother_<side>_tongue             the tongue (blue = weak spot, a groove, wet), modelled lying along
                                   game +x from its root (origin) to its tip 4 units out, 1.1 wide: stretch
                                   it along x to the game's (tipX - base) / 4 and rotate it by the wag
                                   (atan2(tipY, length)); clip to the gullet like now. The carried spore is
                                   organic/spore_pod at the tip.
  mother_<side>_eye_<state>        state = open | half | shut: one of the nine eyes (radius 0.5 in its
                                   socket, looking towards our ship; scale by the game's rad / 0.5 in x and y,
                                   the game already squashes them 1.3 : 1). Origin = the eye's centre.

    blender -b --factory-startup --python tools/blender/models/organic/mother.py [-- quick] [port|star] [body|mouths|tongue|eyes]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
import mn
import orglib as O
from orglib import P

RX, RY = 12.0, 17.0
HGT = 3.0                                   # dome height (the height pass maps 0..4 units)
MOUTHS = [(RX * math.sqrt(1 - (y / RY) ** 2), y) for y in (-6.5, 0.0, 6.5)]
MD, MH = 1.7, 1.6                           # mouth recess depth into the body, half height (game D, H)

def wob(a):
    """The game's MOTHER_BODY radius wobble: its 40 vertices, interpolated smoothly in between."""
    f = a / math.tau * 40; i0 = math.floor(f); t = f - i0
    w = lambda i: 1 + 0.03 * math.sin((i % 40) * 2.7) + 0.02 * math.sin((i % 40) * 5.3)
    t = t * t * (3 - 2 * t)
    return w(i0) * (1 - t) + w(i0 + 1) * t

def mats():
    return dict(
        hide=O.darken_low(O.flesh('hide', '#6a5430', '#c8b47a', c2='#3a2e1a', veins='#6a2030', vein_k=0.4, scale=0.5, rough=0.45, coat=0.4,
                     sss=0.15, sss_col=(1.0, 0.6, 0.3), bump=0.8, mottle=1.8, speckle=('#3a2a10', 2.2, 0.3, 0.75)), -0.6, 1.4, '#2a2010', 0.75),
        lip=O.flesh('lip', '#7a4a34', '#a87458', c2='#3a1a10', veins='#8a3040', vein_k=0.3, scale=1.2, coat=0.6, sss=0.25, sss_col=(1, 0.5, 0.3)),
        vein=O.flesh('vein', '#5a1828', '#8a2c40', scale=3, coat=0.8, sss=0.4, sss_col=(1, 0.3, 0.3), mottle=0.5),
        sac=O.glossy_glow('spore_sac', '#7a8a40', '#e8ff8a', 1.3, noise_k=0.7, veins='#3a2a10', vein_scale=5),
        sac2=O.glossy_glow('spore_sac2', '#7a5a90', '#e0b8ff', 1.2, noise_k=0.7, veins='#2a1a20', vein_scale=5),
        pore=O.plain('pore', '#2a1e10', 0.7),
        tooth=O.plain('nub', '#e8dcb8', 0.4, coat=0.4),
        slime=O.emit_mat('m_slime', '#9cff5a', 0.9, base='#5fd12a', coat=1.0),
        white=O.plain('m_eye_white', '#f0ead2', 0.15, coat=1.0, sss=0.2),
        iris=O.emit_mat('m_iris', '#7a3a2a', 0.15, base='#8a3a28', coat=1.0),
        pupil=O.plain('m_pupil', '#0a0608', 0.2, coat=1.0),
        stump=O.flesh('stump', '#2a4a78', '#5a7ab0', c2='#101a30', veins='#8a2030', vein_k=0.4, scale=4, coat=0.8),
    )

def gullet_mat(name, centre):
    """Wet red throat: pale at the lips, black-red deep inside (by distance from the mouth's edge point)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.35; b.inputs['Coat Weight'].default_value = 0.5
    b.inputs['Subsurface Weight'].default_value = 0.3; b.inputs['Subsurface Scale'].default_value = 0.05
    g = N.new('ShaderNodeNewGeometry'); vm = N.new('ShaderNodeVectorMath'); vm.operation = 'DISTANCE'; vm.inputs[1].default_value = centre
    Lk(g.outputs['Position'], vm.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.2; mr.inputs['From Max'].default_value = MD * 0.8; Lk(vm.outputs['Value'], mr.inputs['Value'])
    ramp = N.new('ShaderNodeValToRGB'); Lk(mr.outputs[0], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (*mn.hex_rgb('#a03a44'), 1); ramp.color_ramp.elements[1].color = (*mn.hex_rgb('#120204'), 1)
    el = ramp.color_ramp.elements.new(0.35); el.color = (*mn.hex_rgb('#4a0e18'), 1)
    Lk(ramp.outputs[0], b.inputs['Base Color'])
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb('#ff3a4a'), 1)
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; Lk(mr.outputs[0], inv.inputs[1])
    em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = 0.25; Lk(inv.outputs[0], em.inputs[0]); Lk(em.outputs[0], b.inputs['Emission Strength'])
    return m

# ---------------------------------------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------------------------------------
def body(M, quick):
    """A cube-sphere (no poles) mapped onto the footprint: the rim at z = 0 is the game's polygon, a dome
    of HGT on top, a shallow rounded underside."""
    me = bpy.data.meshes.new('body'); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=40 if quick else 64, use_grid_fill=True)
    for v in bm.verts:
        n = v.co.normalized(); r = math.hypot(n.x, n.y); a = math.atan2(n.y, n.x); w = wob(a)
        if n.z >= 0: z = HGT * (1 - r * r) ** 0.62 * (1 - 0.12 * (1 - r) ** 2)
        else: z = -0.7 * (-n.z) ** 0.8
        # spread the rings so the dome isn't crowded at the rim
        v.co = P(math.cos(a) * RX * w * r, math.sin(a) * RY * w * r, z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('body', me)); mn.smooth(o)
    o = O.subdiv(o, 1)
    def inner(co):                                        # keep the rim (the hit polygon at z = 0) in place
        r = math.hypot(co.x / RX, co.y / RY)
        return max(0.0, min(1.0, (0.97 - r) / 0.12)) if co.z > -0.05 else 0.0
    O.noise_displace(o, [(0.5, 0.22, 1), (0.12, 0.9, 2), (0.03, 3.0, 3)], weight=inner)
    mn.assign(o, M['hide'])
    return o

def surf(o, lx, ly):
    hit, loc, n, i = o.ray_cast(P(lx, ly, 10.0), Vector((0, 0, -1)))
    return (loc, n) if hit else (P(lx, ly, 0), Vector((0, 0, 1)))

def decorations(M, b, quick):
    """Veins to the mouths, spore-sac clusters, pores, nubs: things on the hide."""
    objs = []
    rnd = random.Random(7)
    # veins: wandering from each mouth inward, branching
    for (mx, my) in MOUTHS:
        for k in range(4):
            pts = []; x, y = mx - MD - 0.3, my + (k - 1.5) * 0.7
            ang = math.pi + (k - 1.5) * 0.35
            for s in range(28):
                loc, n = surf(b, x, y); pts.append(loc + n * 0.01)
                ang += rnd.uniform(-0.12, 0.12); x += math.cos(ang) * 0.27; y += math.sin(ang) * 0.27
            rad = [0.06 * (1 - s / 28) + 0.02 for s in range(28)]
            objs.append(O.tube('vein', pts, rad, m=M['vein'], res=2, segs=8))
    # spore-sac clusters on its back: glowing translucent bulbs
    for c in range(9 if quick else 14):
        a = rnd.uniform(0, math.tau); rr = math.sqrt(rnd.uniform(0.05, 0.75))
        cx, cy = math.cos(a) * RX * rr * 0.9, math.sin(a) * RY * rr * 0.9
        if cx > RX * 0.6 and any(abs(cy - my) < 3 for _, my in MOUTHS): continue
        mat = M['sac'] if c % 3 else M['sac2']
        for k in range(rnd.randint(4, 9)):
            px, py = cx + rnd.uniform(-0.8, 0.8), cy + rnd.uniform(-0.8, 0.8)
            loc, n = surf(b, px, py); r = rnd.uniform(0.18, 0.38)
            s = mn.sphere('sac', r, loc=loc + n * r * 0.35, m=mat, scale=(1, 1, 0.85), segs=24); objs.append(s)
        loc, n = surf(b, cx, cy)
        ring = O.blob('sac_bed', [(loc, 1.0, (1.1, 1.1, 0.25))], m=M['lip'], res=0.06); objs.append(ring)
    # pores / craters and pale nubs
    for k in range(40 if quick else 90):
        a = rnd.uniform(0, math.tau); rr = math.sqrt(rnd.uniform(0.0, 0.92))
        px, py = math.cos(a) * RX * rr, math.sin(a) * RY * rr
        loc, n = surf(b, px, py)
        if k % 3:
            r = rnd.uniform(0.08, 0.2)
            rim = O.blob('pore_rim', [(loc, r * 2.2, (1, 1, 0.35))], m=M['hide'], res=r * 0.25); objs.append(rim)
            objs.append(mn.sphere('pore', r * 0.8, loc=loc + n * r * 0.25, m=M['pore'], scale=(1, 1, 0.2), segs=12))
        else:
            r = rnd.uniform(0.05, 0.1)
            objs.append(mn.sphere('nub', r, loc=loc + n * r * 0.3, m=M['tooth'], scale=(1, 1, 1.3), segs=10))
    return objs

# ---------------------------------------------------------------------------------------------------------
# Mouths
# ---------------------------------------------------------------------------------------------------------
def lens(mx, my, k, n=24, out=1.2):
    """The opening in local coords: inner curve (the game's cavity) closed by points outside the body."""
    pts = []
    for i in range(n + 1):
        s = -1 + 2 * i / n
        pts.append((mx + 0.05 - MD * (1 - s * s) ** 0.75, my + s * MH * k))
    return pts + [(mx + out, my + MH * k + 0.3), (mx + out, my - MH * k - 0.3)]

def paint_cavity(b, poly, m, zmin=-0.37):
    """Give the faces inside the cut (their centre inside the lens, in local x/y) the gullet material."""
    if m.name not in [x.name for x in b.data.materials if x]: b.data.materials.append(m)
    idx = [x.name if x else None for x in b.data.materials].index(m.name)
    def inside(x, y):
        c = False
        for i in range(len(poly)):
            (ax, ay), (bx, by) = poly[i], poly[i - 1]
            if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay): c = not c
        return c
    for f in b.data.polygons:
        c = f.center
        if c.z >= zmin and inside(c.x * O.S, -c.y): f.material_index = idx
    return b

def make_liner(b, inner, floor, mx, my):
    """The gullet's lining: walls just inside the cut (inner lens curve, closed along the body's edge), from
    the floor up to just under the hide's surface, plus the floor. Seen from inside (normals inward)."""
    cx = sum(p[0] for p in inner) / len(inner); cy = sum(p[1] for p in inner) / len(inner)
    ring = [(x + (cx - x) * 0.03 / max(1e-3, math.hypot(cx - x, cy - y)), y + (cy - y) * 0.03 / max(1e-3, math.hypot(cx - x, cy - y))) for x, y in inner]
    ring += [(mx + 0.6, inner[-1][1] - 0.02), (mx + 0.6, inner[0][1] + 0.02)]
    me = bpy.data.meshes.new('liner'); bm = bmesh.new()
    bot, top, ok = [], [], []
    for x, y in ring:
        hit, loc, nn, _ = b.ray_cast(P(x, y, 10.0), Vector((0, 0, -1)))
        ok.append(hit and loc.z > floor + 0.08)
        bot.append(bm.verts.new(P(x, y, floor + 0.01))); top.append(bm.verts.new(P(x, y, (loc.z - 0.03) if hit else floor + 0.01)))
    n = len(ring)
    for i in range(n - 3):                               # walls along the inner curve only, where there is hide above
        if ok[i] and ok[i + 1]: bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    bm.faces.new(bot[:n - 2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('liner', me)); mn.smooth(o)
    return o

def mouth(M, b, i, state):
    """Cut mouth i into body b for a state; returns (new body, extra objects)."""
    mx, my = MOUTHS[i]
    gape = {'shut': 0.0, 'g1': 0.35, 'g2': 0.7, 'g3': 1.0, 'hit': 0.45}[state]
    extra = []
    edge, _ = surf(b, mx - 0.4, my)
    if gape < 0.05:                                       # shut: a puckered crease with wrinkles
        k = 0.17
        pts = lens(mx, my, k)
        cut = O.poly_prism('cut', [(P(x, y).x, P(x, y).y) for x, y in pts], 0.05, 6.0)
        gm = gullet_mat(f'gullet{i}', P(mx, my, 0)); mn.assign(cut, gm)
        b = O.boolean(b, cut); bpy.data.objects.remove(cut)
        paint_cavity(b, pts, gm, 0.03)
        folds = []                                        # puckered folds radiating from the seam
        for kk in range(-3, 4):
            a = math.pi + kk * 0.32; x = mx - 0.8 + math.cos(a) * 0.45; y = my + math.sin(a) * 0.65
            loc, n = surf(b, x, y)
            folds.append((loc - n * 0.03, 0.26, (1.5, 0.42, 0.5), (0, 0, -a * O.S if O.S > 0 else a)))
        extra.append(O.blob('wrinkle', folds, m=M['hide'], res=0.03))
        return b, extra
    pts = lens(mx, my, gape)
    floor = -0.35
    liner = make_liner(b, pts[:-2], floor, mx, my)
    cut = O.poly_prism('cut', [(P(x, y).x, P(x, y).y) for x, y in pts], floor, 6.0)
    gm = gullet_mat(f'gullet{i}', P(mx + 0.2, my, 0)); mn.assign(cut, gm)
    md = b.modifiers.new('bool', 'BOOLEAN'); md.object = cut; md.operation = 'DIFFERENCE'; md.solver = 'MANIFOLD'
    md.material_mode = 'TRANSFER'
    cut.hide_render = True
    b = O.bake(b); bpy.data.objects.remove(cut)
    mn.assign(liner, gm); extra.append(liner)
    # ridges of the gullet on its floor
    for kk in (1, 2, 3):
        rr = []; hh = MH * gape * (1 - kk * 0.18)
        for t in range(9):
            s = -1 + 2 * t / 8
            x = mx - MD * 0.15 * kk - 0.12 * (1 - s * s); y = my + s * hh * 0.9
            rr.append(P(x, y, floor + 0.04))
        extra.append(O.tube('ridge', rr, [0.06] * 9, m=gm, res=3, segs=8))
    # puffy lips: swellings of the hide along the upper and lower edge, parting with the gape
    for sd in (-1, 1):
        y = my + sd * MH * (0.22 + 0.78 * gape)
        loc, n = surf(b, mx - MD * 0.5, y + sd * 0.25)
        lip = O.blob('lip', [(P(mx - MD * 0.5, y + sd * 0.12, loc.z * 0.6 + 0.05), MD * 0.62, (1.0, 0.55 * (0.6 + 0.4 * gape), 0.5)),
                             (P(mx - MD * 0.15, y + sd * 0.05, loc.z * 0.5), MD * 0.4, (1.0, 0.5, 0.45))], m=M['lip'], res=0.035)
        extra.append(lip)
        for t in range(5):                                 # little pale nubs/teeth along the lip
            x = mx - MD * (0.1 + 0.17 * t)
            extra.append(mn.sphere('nub', 0.07, loc=P(x, my + sd * (MH * gape * (1 - (1 - (0.1 + 0.17 * t)) ** 2 * 0.0) * 0.92 - 0.02), loc.z * 0.5 + 0.12),
                                   m=M['tooth'], scale=(1, 1, 1.4), segs=10))
    if state == 'hit':                                     # the torn-out tongue: a ragged blue-grey stump, slime bleeding out
        st = O.blob('stump', [(P(mx - MD * 0.75, my, floor + 0.25), 0.5, (1.4, 0.9, 0.6)), (P(mx - MD * 0.4, my + 0.1, floor + 0.25), 0.35, (1, 0.8, 0.5))], m=M['stump'], res=0.03)
        st = O.displace(st, 0.08, 0.15, seed=9); extra.append(st)
        sl = O.blob('bleed', [(P(mx - MD * 0.45, my, floor + 0.2), 0.35, (1.6, 0.8, 0.35)), (P(mx + 0.1, my - 0.2, -0.1), 0.3, (1.5, 0.7, 0.4)),
                              (P(mx + 0.55, my + 0.1, -0.35), 0.22, (1.0, 0.8, 1.2))], m=M['slime'], res=0.02)
        extra.append(sl)
    return b, extra

def mouth_window(i):
    mx, my = MOUTHS[i]
    xs, ys = [], []
    for lx in (mx - MD - 1.0, mx + 2.0):
        for ly in (my - MH - 1.0, my + MH + 1.0):
            for z in (-0.9, 1.6):
                sx, sy = mn._screen(P(lx, ly, z)); xs.append(sx); ys.append(sy)
    return min(xs), max(xs), min(ys), max(ys)

def feather(stem, px=8):
    """Fade the patch's beauty alpha out towards its border (hides sampling-noise seams)."""
    try:
        import numpy as np
    except ImportError:
        return
    img = bpy.data.images.load(stem + '.png'); w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    a[..., 3] *= np.clip(d / px, 0, 1)
    img.pixels[:] = a.ravel(); img.filepath_raw = stem + '.png'; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)

# ---------------------------------------------------------------------------------------------------------
# Tongue and eyes
# ---------------------------------------------------------------------------------------------------------
def join(objs):
    ctx = bpy.context
    for o in ctx.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    ctx.view_layer.objects.active = objs[0]; bpy.ops.object.join(); return objs[0]

def tongue(M):
    L, W = 4.0, 0.55
    pts, rad = [], []
    for k in range(16):
        u = k / 15
        pts.append(P(u * L, 0.08 * math.sin(u * 3), 0.25 * math.sin(u * math.pi) * 0.6))
        rad.append(W * (1 - 0.55 * u ** 1.4) * (0.75 if k == 15 else 1))
    bm_ = O.blue_organ('tongue_blue', 1.1)
    t = O.tube('tongue', pts, rad, m=bm_, res=4, segs=16)
    tip = mn.sphere('tip', rad[-1], loc=pts[-1], m=bm_, segs=24); t = join([t, tip])
    for v in t.data.vertices: v.co.z = v.co.z * 0.42 + 0.1           # flattened
    groove = O.tube('groove', [P(0.2 + u * 3.3, 0.08 * math.sin((0.05 + u * 0.82) * 3), 0.0) + Vector((0, 0, 0.0)) for u in (0, 0.33, 0.66, 1.0)],
                    [0.06, 0.06, 0.05, 0.03], m=O.plain('groove', '#0a2858', 0.3), res=4, segs=8)
    for v in groove.data.vertices:
        u = abs(v.co.x) / L; v.co.z = (0.25 * math.sin(u * math.pi) * 0.6) * 0.55 + 0.1 + W * (1 - 0.55 * u ** 1.4) * 0.55 - 0.03
    objs = [t, groove]
    rnd = random.Random(3)
    for k in range(30):                                    # papillae
        u = rnd.uniform(0.05, 0.9); a = rnd.uniform(-1.0, 1.0)
        r = W * (1 - 0.55 * u ** 1.4)
        c = P(u * L, 0.08 * math.sin(u * 3) + a * r * 0.7, 0.0); c.z = (0.25 * math.sin(u * math.pi) * 0.6) * 0.55 + 0.1 + r * 0.55 * math.sqrt(max(0, 1 - a * a)) - 0.01
        objs.append(mn.sphere('papilla', 0.035, loc=c, m=O.emit_mat('pap', '#bfe6ff', 1.0), segs=8))
    return objs

def eye(M, state):
    R = 0.5; objs = []
    sock = O.blob('socket', [((0, 0, 0.0), R * 1.2, (1.4, 1.1, 0.45))], m=M['hide'], res=0.03); objs.append(sock)
    c = Vector((0, 0, 0.1)); SC = (1.3, 1.0, 0.6)
    ball = mn.sphere('ball', R * 0.82, loc=c, m=M['white'], scale=SC, segs=48); objs.append(ball)
    if state != 'shut':                                   # iris and slit pupil, looking towards our ship
        ir = mn.sphere('iris', R * 0.5, loc=c + Vector((0.42 * R * O.S, 0, 0.36 * R)), m=M['iris'], scale=(1, 1, 0.3), segs=32); objs.append(ir)
        pu = mn.sphere('pupil', R * 0.36, loc=c + Vector((0.5 * R * O.S, 0, 0.42 * R)), m=M['pupil'], scale=(0.32, 1, 0.3), segs=24); objs.append(pu)
        objs.append(mn.sphere('glint', R * 0.07, loc=c + Vector((0.2 * R * O.S, 0.18 * R, 0.5 * R)), m=O.emit_mat('glint', '#ffffff', 1.0), segs=10))
    cut = {'open': (0.78, 0.97), 'half': (0.25, 0.6), 'shut': (-0.03, 0.03)}[state]
    for sd, d in ((1, cut[0]), (-1, cut[1])):            # eyelids: shells over the ball, closing from above and below
        lid = mn.sphere('lid', R * 0.9, loc=(0, 0, 0), m=M['lip'], segs=40)
        bm = bmesh.new(); bm.from_mesh(lid.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, sd * d * R * 0.9, 0), plane_no=(0, sd, 0), clear_inner=True)
        bm.to_mesh(lid.data); bm.free()
        lid.location = c; lid.scale = SC
        sol = lid.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.04; lid = O.bake(lid); objs.append(lid)
    return objs

# ---------------------------------------------------------------------------------------------------------
def render_side(side, what, quick):
    O.set_side(side); T0 = time.time()
    if 'body' in what or 'mouths' in what:
        mn.reset(); M = mats()
        b = body(M, quick)
        deco = decorations(M, b, quick)
        base = b; shut_ex = []
        for i in range(3): base, ex = mouth(M, base, i, 'shut'); deco += ex; shut_ex.append(ex)
        clean = base.copy(); clean.data = base.data.copy(); mn.link(clean); clean.hide_render = True
        mn.outline([base], thickness=0.022)
        mn.outline([o for o in deco if o.name.startswith(('sac', 'lip'))], thickness=0.014)
        print(f'[mother] {side} built {time.time() - T0:.1f}s'); T0 = time.time()
        if 'body' in what:
            mn.render(f'organic/mother_{side}', objs=[base])
            print(f'[mother] {side} body {time.time() - T0:.1f}s'); T0 = time.time()
        if 'mouths' in what:
            shut = base
            for i in range(3):
                for state in ('g1', 'g2', 'g3', 'hit'):
                    # rebuild from the shut body: re-cut this mouth wider
                    nb = clean.copy(); nb.data = clean.data.copy(); mn.link(nb); nb.hide_render = False
                    shut.hide_render = True; O.show(shut_ex[i], False)
                    nb, ex = mouth(M, nb, i, state)
                    mn.outline([nb], thickness=0.022)
                    mn.outline([o for o in ex if o.name.startswith(('lip', 'stump'))], thickness=0.014)
                    x0, x1, y0, y1 = mouth_window(i)
                    name = f'organic/mother_{side}_m{i}_{state}'
                    O.render_window(name, x0, x1, y0, y1)
                    feather(os.path.join(mn.OUT_DIR, name))
                    bpy.data.objects.remove(nb)
                    for o in ex: bpy.data.objects.remove(o)
                    shut.hide_render = False; O.show(shut_ex[i], True)
            print(f'[mother] {side} mouths {time.time() - T0:.1f}s'); T0 = time.time()
    if 'tongue' in what:
        mn.reset(); M = mats(); objs = tongue(M)
        mn.outline(objs[:1], thickness=0.016)
        mn.render(f'organic/mother_{side}_tongue', objs=objs)
    if 'eyes' in what:
        for state in ('open', 'half', 'shut'):
            mn.reset(); M = mats(); objs = eye(M, state)
            mn.outline([o for o in objs if o.name.startswith(('socket', 'lid', 'ball'))], thickness=0.014)
            mn.render(f'organic/mother_{side}_eye_{state}', objs=objs)
    print(f'[mother] {side} rest {time.time() - T0:.1f}s')

if __name__ == '__main__':
    T = time.time()
    sel = [a for a in O.ARGS if a not in ('quick', 'cpu')]
    sides = [s for s in ('port', 'star') if s in sel] or ['port', 'star']
    what = [w for w in ('body', 'mouths', 'tongue', 'eyes') if w in sel] or ['body', 'mouths', 'tongue', 'eyes']
    for side in sides: render_side(side, what, O.QUICK)
    print(f'[mother] total {time.time() - T:.1f}s')
