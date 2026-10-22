"""The spore mother (js/organic.js ENEMY_TYPES.mother, drawMother, drawTongue): a vast mottled mass far
out on one side, three lipped mouths on its near flank; one at a time opens in a silent scream (the green spore cloud
pours out, js/spores.js) and its tongue, the weak spot, rears up inside it.

Sprites (build/renders/organic/), side = port | star (mirrored builds; port = it's left of our ship),
all sharing the enemy's ground origin (e.x, e.y) through the manifest's ox/oy:
  mother_<side>                    the whole body (24 x 34 units footprint = MOTHER_RX/RY, the game's
                                   hit polygon at z = 0; a 3-unit-high dome), all three mouths shut (a
                                   puckered crease), blotches, pores, veins running to the mouths and
                                   clusters of glowing spore sacs growing on its back. Breathing = the game's
                                   1.2% scale, as now. The cilia along the edge stay procedural (160 waving
                                   strokes; recolour them to the hide's #d8c48e / #9c8752).
  mother_<side>_m<i>_<state>       patches over mouth i = 0..2 (MOTHER_MOUTHS: y = -6.5, 0, 6.5): exact
                                   windows of the body with that mouth in a state; draw over the body at
                                   the same origin. state = g1 | g2 | g3 (gape 0.35 / 0.7 / 1) | g4 (the
                                   silent scream: gape 1.5, 2.3 deep, lips peeled back into rolls, gum and
                                   nubs bared, a ridged throat pit going down at the back) | hit (torn
                                   out: gape 0.45, a ragged stump, slime bleeding). Pick by the game's
                                   gape (0 = no patch). Edges feathered over 8 px so they blend into the body.
  mother_<side>_tongue_<pose>      the screaming tongue (blue = weak spot, a groove, wet) rising out of the
                                   throat pit: pose = r1 (lifting) | r2 (half up) | r3 (reared, tip curling
                                   up and back). Origin = the root's ground spot, mouth-local x = -1.6
                                   (TONGUE_ROOT); the game jitters its rotation a little (the quiver).
                                   (mother_<side>_tongue, the old straight tongue, is no longer built.)
  mother_<side>_eye_<state>        state = open | half | shut: one of the nine eyes (radius 0.5 in its
                                   socket, looking towards our ship; scale by the game's rad / 0.5 in x and y,
                                   the game already squashes them 1.3 : 1). Origin = the eye's centre.

    blender -b --factory-startup --python tools/blender/models/organic/mother.py [-- quick] [port|star] [body|mouths|tongue|eyes] [scream]
    (scream: only the g4 mouth patches, plus the tongues if 'tongue' is given too)
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
SCREAM_K, SCREAM_D = 1.5, 2.3               # the silent scream (g4): gape 1.5 (half height 2.4), recess 2.3 deep
PIT_Z = -1.7                                # the throat pit at the back of a screaming gullet goes down to here

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

def gullet_mat(name, centre, reach=MD * 0.8):
    """Wet red throat: pale at the lips, black-red deep inside (by distance from the mouth's edge point)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.35; b.inputs['Coat Weight'].default_value = 0.5
    b.inputs['Subsurface Weight'].default_value = 0.3; b.inputs['Subsurface Scale'].default_value = 0.05
    g = N.new('ShaderNodeNewGeometry'); vm = N.new('ShaderNodeVectorMath'); vm.operation = 'DISTANCE'; vm.inputs[1].default_value = centre
    Lk(g.outputs['Position'], vm.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.2; mr.inputs['From Max'].default_value = reach; Lk(vm.outputs['Value'], mr.inputs['Value'])
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
            pts = []; x, y = mx - SCREAM_D - 0.35, my + (k - 1.5) * 0.7   # (behind even the screaming mouth)
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
def lens(mx, my, k, n=24, out=1.2, md=MD):
    """The opening in local coords: inner curve (the game's cavity) closed by points outside the body."""
    pts = []
    for i in range(n + 1):
        s = -1 + 2 * i / n
        pts.append((mx + 0.05 - md * (1 - s * s) ** 0.75, my + s * MH * k))
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

def body_edge(x, y):
    """How far out the body's rim reaches at local height y (on the near flank, around the point (x, y))."""
    a = math.atan2(y / RY, x / RX)
    return RX * wob(a) * math.sqrt(max(0.0, 1 - (y / (RY * wob(a))) ** 2))

def make_liner(b, inner, floor, mx, my, hole=None):
    """The gullet's lining: walls just inside the cut (inner lens curve, closed along the body's edge), from
    the floor up to just under the hide's surface, plus the floor. Seen from inside (normals inward).
    hole = (cx, cy, rx, ry, z1): the floor gets an elliptic hole there and a funnel down to z1 (the throat)."""
    cx = sum(p[0] for p in inner) / len(inner); cy = sum(p[1] for p in inner) / len(inner)
    ring = [(x + (cx - x) * 0.03 / max(1e-3, math.hypot(cx - x, cy - y)), y + (cy - y) * 0.03 / max(1e-3, math.hypot(cx - x, cy - y))) for x, y in inner]
    ring += [(mx + 0.6, inner[-1][1] - 0.02), (mx + 0.6, inner[0][1] + 0.02)]
    ring = [(min(x, body_edge(x, y) - 0.25), y) for x, y in ring]   # (the floor stops at the body's edge: no slab out in space)
    me = bpy.data.meshes.new('liner'); bm = bmesh.new()
    bot, top, ok = [], [], []
    for x, y in ring:
        hit, loc, nn, _ = b.ray_cast(P(x, y, 10.0), Vector((0, 0, -1)))
        ok.append(hit and loc.z > floor + 0.08)
        bot.append(bm.verts.new(P(x, y, floor + 0.01))); top.append(bm.verts.new(P(x, y, (loc.z - 0.03) if hit else floor + 0.01)))
    n = len(ring)
    for i in range(n - 3):                               # walls along the inner curve only, where there is hide above
        if ok[i] and ok[i + 1]: bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    if not hole: bm.faces.new(bot[:n - 2])
    else:                                                # floor = quads from the hole's rim out to the outline; then the funnel
        hx, hy, rx, ry, z1 = hole; poly = ring[:n]; NA = 48
        def hit_out(a):                                  # ray from the hole's centre to the outline
            dx, dy = math.cos(a), math.sin(a); best = None
            for j in range(len(poly)):
                (ax, ay), (bx, by) = poly[j - 1], poly[j]
                ex, ey = bx - ax, by - ay; den = dx * ey - dy * ex
                if abs(den) < 1e-9: continue
                t = ((ax - hx) * ey - (ay - hy) * ex) / den; u = ((ax - hx) * dy - (ay - hy) * dx) / den
                if t > 0 and 0 <= u <= 1 and (best is None or t < best): best = t
            return (hx + dx * best, hy + dy * best)
        rings = []
        for lev in range(6):                              # 0: the outline, 1: the hole's rim, 2..5: down the funnel
            row = []
            for k in range(NA):
                a = k / NA * math.tau
                if lev == 0: x, y = hit_out(a); z = floor + 0.01
                else:
                    q = (lev - 1) / 4; sc = 1 - 0.55 * q ** 1.3; z = floor + 0.01 + (z1 - floor) * q
                    x, y = hx + math.cos(a) * rx * sc, hy + math.sin(a) * ry * sc
                row.append(bm.verts.new(P(x, y, z)))
            rings.append(row)
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(NA): bm.faces.new((r0[k], r0[(k + 1) % NA], r1[(k + 1) % NA], r1[k]))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('liner', me)); mn.smooth(o)
    return o

def scream(M, b, i):
    """Mouth i in the silent scream (g4): stretched far wider and deeper than g3, the lips peeled back into
    tight rolls, the wet gum and a row of pale nubs bared along the rim, and at the back of the gullet the
    throat: a ridged pit going down into the dark (where the tongue rises from)."""
    mx, my = MOUTHS[i]; k, md = SCREAM_K, SCREAM_D; extra = []
    pts = lens(mx, my, k, md=md); floor = -0.35
    hx, hy = mx + TONGUE_ROOT, my                         # the throat pit, where the tongue's root is
    liner = make_liner(b, pts[:-2], floor, mx, my, hole=(hx, hy, 0.56, 1.0, PIT_Z))
    cut = O.poly_prism('cut', [(P(x, y).x, P(x, y).y) for x, y in pts], floor, 6.0)
    pit = O.poly_prism('pitcut', [(P(x, y).x, P(x, y).y) for x, y in
                                  [(hx + math.cos(a) * 0.54, hy + math.sin(a) * 0.98) for a in [j / 32 * math.tau for j in range(32)]]], PIT_Z - 0.2, 0.0)
    gm = gullet_mat(f'gullet{i}s', P(mx + 0.4, my, 0.3), reach=2.6); mn.assign(cut, gm); mn.assign(pit, gm)
    for c in (cut, pit):
        md_ = b.modifiers.new('bool', 'BOOLEAN'); md_.object = c; md_.operation = 'DIFFERENCE'; md_.solver = 'MANIFOLD'; md_.material_mode = 'TRANSFER'
        c.hide_render = True
        b = O.bake(b); bpy.data.objects.remove(c)
    mn.assign(liner, gm); extra.append(liner)
    for kk in (1, 2, 3):                                   # ridges of the gullet floor, ringing the throat
        rr = []; hh = 1.0 + kk * 0.38
        for t in range(13):
            a = -math.pi * 0.62 + t / 12 * math.pi * 1.24
            rr.append(P(hx + math.cos(a) * (0.56 + kk * 0.3), hy + math.sin(a) * hh, floor + 0.05))
        extra.append(O.tube('ridge', rr, [0.07] * 13, m=gm, res=3, segs=8))
    for q in (0.3, 0.62):                                  # ridges going down the throat
        sc = 1 - 0.55 * q ** 1.3; z = floor + (PIT_Z - floor) * q
        rr = [P(hx + math.cos(a) * 0.56 * sc, hy + math.sin(a) * 0.98 * sc, z) for a in [j / 24 * math.tau for j in range(25)]]
        extra.append(O.tube('ridge', rr, [0.05] * 25, m=gm, res=2, segs=8))
    gum = O.flesh('gum', '#8a2a38', '#c85a64', c2='#3a0a10', veins='#5a0a18', vein_k=0.4, scale=2.5, coat=0.9, sss=0.35, sss_col=(1, 0.3, 0.3))
    rnd = random.Random(40 + i)
    gpts, lpts, grad, lrad = [], [], [], []               # all along the rim: the bared gum, nubs on it, the lip peeled back
    NR = 29
    for t in range(NR):
        sp = -0.97 + 1.94 * t / (NR - 1)
        x = mx + 0.05 - md * (1 - sp * sp) ** 0.75; y = my + sp * MH * k
        s2 = sp + 0.01; x2 = mx + 0.05 - md * (1 - s2 * s2) ** 0.75; y2 = my + s2 * MH * k
        tx, ty = x2 - x, y2 - y; ln = math.hypot(tx, ty); nx, ny = -ty / ln, tx / ln
        if nx * (x - (mx - md * 0.5)) + ny * (y - my) < 0: nx, ny = -nx, -ny      # outward: away from the opening
        loc, _ = surf(b, x + nx * 0.5, y + ny * 0.5); zs = max(loc.z, 0.05)
        fade = min(1.0, (1 - abs(sp)) / 0.12) ** 0.5
        gpts.append(P(x + nx * 0.06, y + ny * 0.06, zs * 0.6)); grad.append(0.05 + 0.12 * fade)
        lpts.append(P(x + nx * 0.36, y + ny * 0.36, zs * 0.92)); lrad.append(0.06 + 0.17 * fade)
        if 2 <= t <= NR - 3 and t % 2 == 0:                  # pale nubs on the bared gum, pointing into the gullet
            extra.append(mn.sphere('nub', 0.08 + rnd.uniform(-0.015, 0.02), loc=P(x - nx * 0.02, y - ny * 0.02, zs * 0.6 + 0.09),
                                   m=M['tooth'], scale=(1, 1, 1.7), segs=10))
    extra.append(O.tube('gumline', gpts, grad, m=gum, res=3, segs=10))
    extra.append(O.tube('lip', lpts, lrad, m=M['lip'], res=3, segs=10))   # the lip, peeled back into a tight roll
    return b, extra

def mouth(M, b, i, state):
    """Cut mouth i into body b for a state; returns (new body, extra objects)."""
    if state == 'g4': return scream(M, b, i)
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

def mouth_window(i, state=None):
    mx, my = MOUTHS[i]
    xs, ys = [], []
    sc = state == 'g4'; md, mh = (SCREAM_D, MH * SCREAM_K) if sc else (MD, MH)
    for lx in (mx - md - 1.0, mx + 2.0):
        for ly in (my - mh - 1.0, my + mh + 1.0):
            for z in ((PIT_Z - 0.2) if sc else -0.9, 1.6):
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

# The screaming tongue (mother_<side>_tongue_r1..r3): it rises out of the throat pit and quivers. Centre lines
# in local (x out of the body from the root, z up); the origin (ground point) is the root's spot in the
# game (mouth-local x = TONGUE_ROOT); the root itself comes out of the pit's far side (the part the camera sees into). r1: lifting, r2: half up, r3: reared
# up, its tip curling up and back.
TONGUE_ROOT = -1.6
TONGUE_POSES = {
    'r1': [(-0.05, -0.5, -0.3), (0.3, -0.25, -0.3), (0.8, 0, -0.2), (1.4, 0, 0.0), (1.95, 0, 0.18), (2.35, 0, 0.38)],
    'r2': [(-0.05, -0.5, -0.3), (0.3, -0.25, -0.22), (0.75, 0, 0.0), (1.3, 0, 0.45), (1.75, 0, 0.85), (2.05, 0, 1.2)],
    'r3': [(-0.05, -0.5, -0.3), (0.25, -0.25, -0.18), (0.65, 0, 0.2), (1.15, 0, 0.8), (1.6, 0, 1.35), (1.95, 0, 1.75), (2.05, 0, 2.1), (1.9, 0, 2.3)],
}
def tongue_up(M, pose):
    W = 0.55
    ctl = [Vector(c) for c in TONGUE_POSES[pose]]
    dense = []                                             # a smooth centre line (Catmull-Rom through the control points)
    for j in range(len(ctl) - 1):
        p0, p1, p2, p3 = ctl[max(0, j - 1)], ctl[j], ctl[j + 1], ctl[min(len(ctl) - 1, j + 2)]
        for q in range(10):
            u = q / 10
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    dense.append(ctl[-1])
    cum = [0.0]
    for a, b in zip(dense, dense[1:]): cum.append(cum[-1] + (b - a).length)
    Ltot = cum[-1]
    radius = lambda u: W * (1 - 0.55 * u ** 1.4)
    loc = lambda v: P(v.x, v.y, v.z)
    idx = list(range(0, len(dense), 3)) + ([len(dense) - 1] if (len(dense) - 1) % 3 else [])
    pts = [loc(dense[j]) for j in idx]; rad = [radius(cum[j] / Ltot) * (0.8 if j == len(dense) - 1 else 1) for j in idx]
    bm_ = O.blue_organ('tongue_blue', 1.1)
    t = O.tube('tongue', pts, rad, m=bm_, res=4, segs=16)
    tip = mn.sphere('tip', rad[-1] * 0.95, loc=pts[-1], m=bm_, segs=24); t = join([t, tip])
    frames = []                                            # (centre, up, tangent) per dense point, Blender coords
    for j in range(len(dense)):
        a, b = dense[max(0, j - 1)], dense[min(len(dense) - 1, j + 1)]
        tg = (loc(b) - loc(a)).normalized()
        side = tg.cross(Vector((0, 1, 0))).normalized()     # in the x-z plane, perpendicular to the tongue
        up = side if side.z > 0 else -side
        frames.append((loc(dense[j]), up, cum[j] / Ltot))
    for v in t.data.vertices:                              # flatten it across its "up" (a tongue, not a tube)
        c, up, u = min(frames, key=lambda f: (v.co - f[0]).length_squared)
        d = v.co - c; v.co = c + d - up * d.dot(up) * 0.45
    objs = [t]
    top = lambda j, off=0.0: frames[j][0] + frames[j][1] * (radius(frames[j][2]) * 0.55 + off)
    gi = [j for j in range(len(dense)) if 0.12 < frames[j][2] < 0.88][::3]
    objs.append(O.tube('groove', [top(j, -0.03) for j in gi], [0.06 - 0.03 * frames[j][2] for j in gi], m=O.plain('groove', '#0a2858', 0.3), res=3, segs=8))
    rnd = random.Random(3)
    pap = O.emit_mat('pap', '#bfe6ff', 1.0)
    for k in range(30):                                    # papillae on the upper face
        j = rnd.randrange(int(len(dense) * 0.15), int(len(dense) * 0.9)); c, up, u = frames[j]
        tg = (frames[min(j + 1, len(frames) - 1)][0] - frames[max(j - 1, 0)][0]).normalized(); sd = tg.cross(up).normalized()
        a = rnd.uniform(-0.9, 0.9); r = radius(u)
        objs.append(mn.sphere('papilla', 0.035, loc=c + sd * a * r * 0.75 + up * (r * 0.55 * math.sqrt(max(0, 1 - a * a)) - 0.01), m=pap, segs=8))
    # the root in the throat: a collar of dark wet gullet flesh it slides out of
    c0 = loc(dense[0]); c1 = loc(dense[min(len(dense) - 1, 6)])
    gm = gullet_mat('tongue_throat', c0 + Vector((0, 0, 1.3)))
    objs.append(O.blob('collar', [(c0.lerp(c1, 0.25), W * 1.05, (1.1, 1.3, 0.45)), (c0, W * 1.1, (1.0, 1.4, 0.4))], m=gm, res=0.04))
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
def render_side(side, what, quick, states=('g1', 'g2', 'g3', 'g4', 'hit')):
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
                for state in states:
                    # rebuild from the shut body: re-cut this mouth wider
                    nb = clean.copy(); nb.data = clean.data.copy(); mn.link(nb); nb.hide_render = False
                    shut.hide_render = True; O.show(shut_ex[i], False)
                    nb, ex = mouth(M, nb, i, state)
                    mn.outline([nb], thickness=0.022)
                    mn.outline([o for o in ex if o.name.startswith(('lip', 'stump', 'gumline'))], thickness=0.014)
                    x0, x1, y0, y1 = mouth_window(i, state)
                    name = f'organic/mother_{side}_m{i}_{state}'
                    O.render_window(name, x0, x1, y0, y1)
                    feather(os.path.join(mn.OUT_DIR, name))
                    bpy.data.objects.remove(nb)
                    for o in ex: bpy.data.objects.remove(o)
                    shut.hide_render = False; O.show(shut_ex[i], True)
            print(f'[mother] {side} mouths {time.time() - T0:.1f}s'); T0 = time.time()
    if 'tongue' in what:
        for pose in TONGUE_POSES:
            mn.reset(); M = mats(); objs = tongue_up(M, pose)
            mn.outline(objs[:1], thickness=0.016)
            mn.render(f'organic/mother_{side}_tongue_{pose}', objs=objs)
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
    if 'scream' in sel: what = ['mouths'] + (['tongue'] if 'tongue' in sel else [])   # (only the new g4 patches)
    states = ('g4',) if 'scream' in sel else ('g1', 'g2', 'g3', 'g4', 'hit')
    for side in sides: render_side(side, what, O.QUICK, states)
    print(f'[mother] total {time.time() - T:.1f}s')
