"""The leviathan (js/organic.js startLeviathan, drawOrganicWorld, PLAN.md 8u): a whale of the deep gliding
past just outside the hull. Flippers, a fluke, throat grooves, barnacle crusts, rows of glowing spots and a
huge eye. It's 64 units long (70 with the fluke), so it is rendered in pieces.

Local frame as the game draws it: origin = (x, y) of org.lev (x = -14.5 or SHIP_W + 14.5), head towards
+y (it swims down the screen), +x = the side facing our ship (the game's scale(-side, 1)): side = port
(the leviathan is left of us, S = +1) | star (mirrored build). It lies rolled on its side: pale grooved
belly towards our ship, the glowing spots along its back, the eye on the flank facing up.

Sprites (build/renders/organic/), all sharing the leviathan's origin through the manifest's ox/oy:
  leviathan_<side>_body<k>       k = 0..3: the static body in four horizontal bands (head first, k = 0 is
                                 the top of the screen = the tail end), exact windows that abut
                                 pixel-perfectly: draw all four at the same origin. Eye open (amber, slit
                                 pupil towards our ship; modelled 1 unit further in than the game's (6.2, 18) so
                                 it sits on the flank). Body k = 3 carries `spots`: [[px, py] or null, ...] the
                                 glowing spots' centres (null: off the body's edge, where the game draws it over
                                 space) (pixels from the origin at 96 px/unit, at the skin surface) in the game's
                                 order (k = 0..15, two per row), for the game's travelling pulse (additive glow).
  leviathan_<side>_eye_f<i>      the blink, a tight patch of the lids only (body and eye as holdout): i = 0 half
                                 shut, 1 shut. Draw over the body at the same origin while the game blinks
                                 (blink < 1: f1; ease in/out with f0 if wanted); nothing when the eye is open.
  leviathan_<side>_fluke_f<i>    i = 0..4: tail stock and fluke at the poses sw = `poses`[i] = -1, -0.5, 0,
                                 0.5, 1 (not a time loop: the game's sw = sin(t * 1.2), pick the nearest pose,
                                 i = round((sw + 1) * 2)). Draw before the body bands (they cover the joint).
  leviathan_<side>_flipper<j>    j = 0 (far side, -x) | 1 (near side, +x): one still each at the game's mean
                                 angle (0.6). The game rotates it on screen by its paddle sd * 0.15 * sin(t * 0.8 + sd)
                                 (sd = -1 for j = 0, +1 for j = 1; negated for star, the mirrored build: clockwise
                                 positive, as canvas rotate()) around `pivot` [px, py] (pixels from the origin at 96 px/unit: the root,
                                 hidden under the body). No holdout: draw before the body bands.
The roll (rotate(sin(t * 0.4) * 0.03)) stays a runtime rotation of the whole stack; the warning wash on
the room floor stays procedural.

    blender -b --factory-startup --python tools/blender/models/organic/leviathan.py [-- quick] [port|star] [body|fluke|flippers|eye]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
import mn
import orglib as O
from orglib import P

EYE = (6.2, 18.0)

def bez(p0, p1, p2, p3, n=40):
    out = []
    for k in range(n + 1):
        t = k / n; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out
# the game's outline (right half), head (+y) to tail
OUT = bez((0, 30), (9, 26), (9.5, 5), (6, -14)) + bez((6, -14), (4, -24), (1.5, -30), (0, -34))[1:]

def half_width(ly):
    best = 0.0
    for i in range(1, len(OUT)):
        (ax, ay), (bx, by) = OUT[i - 1], OUT[i]
        if (ay - ly) * (by - ly) <= 0 and ay != by: best = max(best, ax + (ly - ay) / (by - ay) * (bx - ax))
    return best

def mats(S):
    skin = O.flesh('lev_skin', '#0e1c2a', '#2a4a62', c2='#050a10', veins='#3a6a80', vein_k=0.25, scale=0.35, rough=0.4, coat=0.7,
                   sss=0.05, bump=0.5, mottle=1.3, belly='#9ab0c0', belly_axis=(S, 0, -0.15), belly_k=0.85,
                   speckle=('#8a9aa6', 1.6, 0.12, 0.45))
    return dict(
        skin=skin,
        groove=O.plain('lev_groove', '#4a6070', 0.5, coat=0.4),
        barn=O.flesh('lev_barn', '#8a9486', '#c8ccbc', c2='#3a4038', scale=6, rough=0.7, coat=0.1, bump=1.0),
        barn_in=O.plain('lev_barn_in', '#1a1e1a', 0.8),
        scar=O.plain('lev_scar', '#8a9cab', 0.5, coat=0.3),
        spot=O.emit_mat('lev_spot', '#7af0ff', 1.5, base='#3ac0d8', coat=1.0),
        eyeball=eye_mat(S),
        glint=O.emit_mat('lev_glint', '#fff8d0', 1.2),
        lid=O.flesh('lev_lid', '#142638', '#2e5068', c2='#050a10', scale=1.0, coat=0.7),
        fin=O.flesh('lev_fin', '#0e1c2a', '#26445a', c2='#050a10', veins='#3a6a80', vein_k=0.3, scale=0.6, coat=0.7, mottle=1.2,
                    speckle=('#8a9aa6', 2.0, 0.12, 0.4)),
    )

def height(ly, w):
    return min(3.7, 0.42 * w + 0.25) * min(1.0, w / 1.5) ** 0.5

def body(M, quick):
    me = bpy.data.meshes.new('lev'); bm = bmesh.new(); NR = 48 if quick else 72
    ys = [30 - 64 * (0.5 - 0.5 * math.cos(i / (110 if quick else 170) * math.pi)) for i in range((110 if quick else 170) + 1)]
    ys[0] = 29.98; ys[-1] = -33.98
    rings = []
    for ly in ys:
        w = max(half_width(ly), 0.02); h = height(ly, w); d = 0.55 * h
        row = []
        for i in range(NR):
            th = i / NR * math.tau; c, s = math.cos(th), math.sin(th)
            x = w * math.copysign(abs(c) ** 0.9, c)
            z = h * abs(s) ** 0.85 if s >= 0 else -d * abs(s) ** 0.9
            row.append(bm.verts.new(P(x, ly, z)))
        rings.append(row)
    for j in range(len(rings) - 1):
        for i in range(NR):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % NR], rings[j + 1][(i + 1) % NR], rings[j + 1][i]))
    for row, ly in ((rings[0], ys[0]), (rings[-1], ys[-1])):
        c = bm.verts.new(P(0, ly, 0))
        for i in range(NR): bm.faces.new((row[i], row[(i + 1) % NR], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('lev_body', me)); mn.smooth(o)
    o = O.subdiv(o, 1)
    # a brow over the eye and a lumpy hide
    O.noise_displace(o, [(0.25, 0.25, 11), (0.06, 1.2, 12)])
    ex, ey = EYE
    ex -= 1.0; ey -= 1.9                              # (the brow: just above the eye, see eye_frame)
    for v in o.data.vertices:
        lx, ly = v.co.x * O.S, -v.co.y
        k = math.exp(-(((lx - ex) / 2.4) ** 2 + ((ly - ey) / 1.2) ** 2))
        if v.co.z > 0: v.co.z += 0.6 * k
    o.data.update()
    mn.assign(o, M['skin'])
    return o

def surf(o, lx, ly):
    hit, loc, n, i = o.ray_cast(P(lx, ly, 10.0), Vector((0, 0, -1)))
    return (loc, n) if hit else (P(lx, ly, 0), Vector((0, 0, 1)))

def details(M, b, quick):
    objs = []; spots = []
    rnd = random.Random(5)
    # throat grooves: long parallel furrows on the belly side (the game: x 2..8, y 8..28)
    for k in range(7):
        pts = []
        for t in range(24):
            u = t / 23; ly = 28.5 - u * 21; lx = 2 + k * 0.95 + 1.6 * math.sin(u * math.pi) - 0.8 * u
            if half_width(ly) < lx + 0.6: continue
            loc, n = surf(b, lx, ly); pts.append(loc - n * 0.05)
        if len(pts) > 3: objs.append(O.tube('groove', pts, [0.09] * len(pts), m=M['groove'], res=2, segs=8))
    # two rows of glowing spots along the back (the game's 16 x 2, x = -3.5 / -1.5 + sin(k) * 0.4)
    for k in range(16):
        ly = -26 + k * 3.3
        for xx in (-3.5, -1.5):
            lx = xx + math.sin(k) * 0.4
            if half_width(ly) < abs(lx) + 0.6: spots.append(None); continue
            loc, n = surf(b, lx, ly)
            s = mn.sphere('spot', 0.36, loc=loc - n * 0.06, m=M['spot'], scale=(1, 1, 0.5), segs=20); objs.append(s)
            ring = O.blob('spot_ring', [(loc - n * 0.05, 0.62, (1, 1, 0.3))], m=M['skin'], res=0.06); objs.append(ring)
            spots.append(loc.copy())
    # barnacle crusts and pale scars
    for c in range(14 if quick else 22):
        ly = rnd.uniform(-24, 24); w = half_width(ly); lx = rnd.uniform(-w * 0.85, w * 0.4)
        for k in range(rnd.randint(5, 12)):
            px, py = lx + rnd.uniform(-0.9, 0.9), ly + rnd.uniform(-1.2, 1.2)
            loc, n = surf(b, px, py); r = rnd.uniform(0.12, 0.3)
            cone = mn.cyl('barn', r, r * 0.9, loc=(0, 0, 0), m=M['barn'], verts=10, bevel=0.0)
            for v in cone.data.vertices:
                if v.co.z > 0.01: v.co.x *= 0.45; v.co.y *= 0.45
            cone.matrix_world = Matrix.Translation(loc - n * 0.05) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4(); O.apply_tf(cone)
            objs.append(cone)
            objs.append(mn.sphere('barn_in', r * 0.4, loc=loc + n * r * 0.85, m=M['barn_in'], scale=(1, 1, 0.3), segs=8))
    for c in range(8):
        ly = rnd.uniform(-20, 20); w = half_width(ly); lx = rnd.uniform(-w * 0.6, w * 0.3); a = rnd.uniform(-0.6, 0.6)
        pts = []
        for t in range(8):
            loc, n = surf(b, lx + math.cos(a) * t * 0.35, ly + math.sin(a) * t * 0.35); pts.append(loc - n * 0.03)
        objs.append(O.tube('scar', pts, [0.07] * 8, m=M['scar'], res=2, segs=6))
    # the eye: a big glossy amber dome bulging out of the flank, a vertical slit pupil (painted in its
    # material, so it always sits on the surface), a glint, and a thick fleshy rim around it
    objs += eye_ball(M, b)
    return objs, spots, EYE_FRAME[0]

EYE_FRAME = [None]
EYE_SC = (1.8, 1.3, 0.62)
def eye_frame(b):
    """Centre and orientation of the eye: on the flank at the game's (6.2, 18), turned half towards the
    sky so the camera sees it face-on rather than edge-on."""
    from mathutils import Quaternion
    ex, ey = EYE
    ex -= 1.0                                         # (a bit in from the game's spot, so all of it sits on the flank)
    loc, n = surf(b, ex, ey)
    axis = (n + Vector((0, 0, 1.1))).normalized()
    xl = (Vector((1, 0, 0)) - axis * axis.x).normalized(); yl = axis.cross(xl)   # local x stays along world x (towards our ship for S = 1)
    q = Matrix((xl, yl, axis)).transposed().to_quaternion() @ Quaternion((0, 0, 1), -0.2 * O.S)
    return loc + n * 0.05, q

def eye_mat(S):
    """Amber iris with fibres and a dark limbal ring, the slit pupil, a soft inner glow. Unit-sphere object coords."""
    m = bpy.data.materials.new('lev_eye'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.12; b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Coat Roughness'].default_value = 0.03
    tc = N.new('ShaderNodeTexCoord'); sx = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sx.inputs[0])
    def mathn(op, a, bb=None):
        n_ = N.new('ShaderNodeMath'); n_.operation = op
        for i, v in enumerate((a, bb)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: Lk(v, n_.inputs[i])
        return n_.outputs[0]
    X, Y = sx.outputs['X'], sx.outputs['Y']
    # pupil: ((x - 0.6/1.8 S) / (0.36/1.8))^2 + (y / (1.0/1.3))^2 < 1
    px = mathn('DIVIDE', mathn('SUBTRACT', X, 0.6 / 1.8 * S), 0.36 / 1.8); py = mathn('DIVIDE', Y, 1.0 / 1.3)
    pd = mathn('ADD', mathn('MULTIPLY', px, px), mathn('MULTIPLY', py, py))
    pupil = N.new('ShaderNodeMapRange'); pupil.inputs['From Min'].default_value = 1.08; pupil.inputs['From Max'].default_value = 0.92
    Lk(pd, pupil.inputs['Value'])
    rr = mathn('SQRT', mathn('ADD', mathn('MULTIPLY', X, X), mathn('MULTIPLY', Y, Y)))
    limb = N.new('ShaderNodeMapRange'); limb.inputs['From Min'].default_value = 0.78; limb.inputs['From Max'].default_value = 0.97
    Lk(rr, limb.inputs['Value'])
    # fibres: noise stretched along the radius (angle-driven), plus mottling
    ang = N.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'; Lk(Y, ang.inputs[0]); Lk(X, ang.inputs[1])
    cmb = N.new('ShaderNodeCombineXYZ'); Lk(ang.outputs[0], cmb.inputs['X']); Lk(mathn('MULTIPLY', rr, 0.15), cmb.inputs['Y'])
    fn = N.new('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 9.0; fn.inputs['Detail'].default_value = 3; Lk(cmb.outputs[0], fn.inputs['Vector'])
    fr = N.new('ShaderNodeMapRange'); fr.inputs['From Min'].default_value = 0.35; fr.inputs['From Max'].default_value = 0.7; Lk(fn.outputs['Fac'], fr.inputs['Value'])
    c = N.new('ShaderNodeMix'); c.data_type = 'RGBA'; Lk(fr.outputs[0], c.inputs['Factor'])
    c.inputs[6].default_value = (*O.lift('#c8901c'), 1); c.inputs[7].default_value = (*O.lift('#f2d36a'), 1)
    c2 = N.new('ShaderNodeMix'); c2.data_type = 'RGBA'; Lk(limb.outputs[0], c2.inputs['Factor'])
    Lk(c.outputs[2], c2.inputs[6]); c2.inputs[7].default_value = (*mn.hex_rgb('#5a3008'), 1)
    c3 = N.new('ShaderNodeMix'); c3.data_type = 'RGBA'; Lk(pupil.outputs[0], c3.inputs['Factor'])
    Lk(c2.outputs[2], c3.inputs[6]); c3.inputs[7].default_value = (*mn.hex_rgb('#05070a'), 1)
    Lk(c3.outputs[2], b.inputs['Base Color'])
    # a soft inner glow (the iris lit from within), not in the pupil nor the limbal ring
    gl = mathn('MULTIPLY', mathn('SUBTRACT', 1.0, pupil.outputs[0]), mathn('SUBTRACT', 1.0, limb.outputs[0]))
    Lk(mathn('MULTIPLY', gl, 0.55), b.inputs['Emission Strength'])
    Lk(c.outputs[2], b.inputs['Emission Color'])
    return m

def eye_ball(M, b):
    c, q = eye_frame(b); EYE_FRAME[0] = (c, q)
    R = q.to_matrix()
    ball = mn.sphere('eye', 1.0, loc=c, m=M['eyeball'], scale=EYE_SC, segs=64)
    ball.rotation_mode = 'QUATERNION'; ball.rotation_quaternion = q
    def on_ball(u, v, lift_=0.0):                     # a point on the ball's surface, (u, v) in its local x/y units
        z = EYE_SC[2] * math.sqrt(max(0.0, 1 - (u / EYE_SC[0]) ** 2 - (v / EYE_SC[1]) ** 2))
        return c + R @ Vector((u, v, z + lift_))
    glint = mn.sphere('glint', 0.26, loc=on_ball(-0.45 * O.S, 0.5, -0.02), m=M['glint'], scale=(1, 0.8, 0.25), segs=16)
    glint2 = mn.sphere('glint', 0.11, loc=on_ball(-0.05 * O.S, 0.72, -0.01), m=M['glint'], scale=(1, 0.8, 0.25), segs=12)
    rim = [(c + R @ Vector((math.cos(a) * 1.92, math.sin(a) * 1.42, 0.05)), 0.42, (1, 1, 0.75)) for a in (k / 36 * math.tau for k in range(36))]
    rim = O.blob('eye_rim', rim, m=M['lid'], res=0.06)
    return [ball, glint, glint2, rim]

def eyelids(M, state):
    """Lids closing over the eye, from above and below (half: the upper one down to the pupil's top)."""
    c, q = EYE_FRAME[0]
    cut = {'half': (0.2, -0.6), 'shut': (-0.12, -0.12)}[state]
    objs = []
    for sd, d in ((1, cut[0]), (-1, cut[1])):
        lid = mn.sphere('lid', 1.0, loc=(0, 0, 0), m=M['lid'], segs=48)
        bm = bmesh.new(); bm.from_mesh(lid.data)
        k = d / 1.4                                       # (in the unit sphere: the lid shell is 1.4 high in its local y)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, k, 0), plane_no=(0, sd, 0), clear_inner=True)
        bm.to_mesh(lid.data); bm.free()
        lid.scale = (1.9, 1.4, EYE_SC[2] + 0.17); lid.location = c; lid.rotation_mode = 'QUATERNION'; lid.rotation_quaternion = q
        sol = lid.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.05
        objs.append(lid)
    return objs

def fluke(M, sw):
    """Tail stock and fluke, hinged at local y = -31, beating (pitch) and swaying (the game's sw)."""
    pitch = 0.32 * sw
    parts = [(P(0, -31.5, 0.2), 2.2, (0.8, 1.4, 0.55)), (P(0, -33.5, 0.1), 1.8, (0.7, 1.2, 0.45))]
    for sd in (-1, 1):
        for k in range(16):
            u = (k + 1) / 16
            x = sd * 8 * u; y = -34.3 - 4.5 * u ** 1.3 - sw * 1.2 * u
            parts.append((P(x, y, 0.0), 2.0 * (1 - 0.55 * u), (1.3, 0.8, 0.25)))
    o = O.blob('fluke', parts, m=M['fin'], res=0.12)
    hinge = P(0, -31.0, 0.2)
    rot = Matrix.Translation(hinge) @ Matrix.Rotation(pitch, 4, 'X') @ Matrix.Translation(-hinge)
    o.data.transform(rot)
    for v in o.data.vertices:                    # trailing edge notched in the middle, flexing
        ly = -v.co.y
        if ly < -36: v.co.z -= 0.2 * sw * (-(ly + 36)) / 4   # (the tips lag behind the beat)
    o.data.update()
    return o

def flipper(M, sd, phase=None):
    """Pectoral flipper: long, knobbly front edge, rooted at (sd * 8, 10). phase None: the mean angle."""
    ang = sd * (0.6 + (0.15 * math.sin(phase) if phase is not None else 0.0))
    parts = []
    for k in range(16):
        u = k / 15
        parts.append(((sd * (u * 9.0), 0, 0), 2.4 * (1 - 0.6 * u), (1.0, 0.75, 0.25)))
    for k in range(7):
        u = k / 6
        parts.append(((sd * (u * 8.5), -0.75 + 0.35 * u, 0.1), 0.7 * (1 - 0.4 * u), (1, 1, 0.7)))   # knobs along the leading edge
    o = O.blob('flipper', parts, m=M['fin'], res=0.1)
    root = P(sd * 7.5, 10.0, -0.6)
    mw = Matrix.Translation(root) @ Matrix.Rotation(-ang * O.S, 4, 'Z') @ Matrix.Rotation(sd * 0.25, 4, 'X')
    if O.S < 0: mw = mw @ Matrix.Scale(-1, 4, (1, 0, 0))
    o.data.transform(mw); o.data.update()
    return o

def bands(b):
    x0, x1, y0, y1 = mn._bounds([b])
    x0 -= 0.2; x1 += 0.2; y0 -= 0.2; y1 += 0.2
    step = math.ceil((y1 - y0) / 4 * mn.PPU) / mn.PPU
    y0 = math.floor(y0 * mn.PPU) / mn.PPU
    return [(x0, x1, y0 + k * step, y0 + (k + 1) * step) for k in range(4)]   # k = 0 bottom of the screen (head)

def render_side(side, what, quick):
    S = O.set_side(side); T0 = time.time()
    mn.reset(); M = mats(S)
    b = body(M, quick)
    det, spots, eye = details(M, b, quick)
    mn.outline([b], thickness=0.03)
    mn.outline([o for o in det if o.name.startswith(('eye_rim', 'barn'))], thickness=0.014)
    print(f'[leviathan] {side} built {time.time() - T0:.1f}s'); T0 = time.time()
    statics = [b] + det
    win = bands(b)
    if 'body' in what:
        for k, (x0, x1, y0, y1) in enumerate(win):
            name = f'organic/leviathan_{side}_body{3 - k}'
            extra = None
            if k == 0:
                pts = []
                for p in spots:
                    if p is None: pts.append(None); continue
                    sx, sy = mn._screen(p); pts.append([round(sx * mn.PPU, 1), round(-sy * mn.PPU, 1)])
                extra = {'spots': pts}
            O.render_window(name, x0, x1, y0, y1, extra=extra)
        print(f'[leviathan] {side} body {time.time() - T0:.1f}s'); T0 = time.time()
    if 'eyetest' in what:                                   # (iterating on the look: the eye region only)
        c, q = EYE_FRAME[0]
        x0, x1, y0, y1 = mn._bounds([o for o in det if o.name.startswith(('eye', 'eye_rim'))])
        O.render_window(f'organic/_test_leviathan_{side}_eye', x0 - 1.5, x1 + 1.5, y0 - 1.5, y1 + 1.5)
        for st in ('half', 'shut'):
            lids = eyelids(M, st); mn.outline(lids, thickness=0.014)
            O.render_window(f'organic/_test_leviathan_{side}_eye_{st}', x0 - 1.5, x1 + 1.5, y0 - 1.5, y1 + 1.5)
            for o in lids: bpy.data.objects.remove(o)
    if 'eye' in what:
        # the blink: the lids alone, with the body and the open eye as a holdout (a tight patch over the eye)
        O.holdout(statics, True)
        sets = []
        for st in ('half', 'shut'):
            lids = eyelids(M, st); mn.outline(lids, thickness=0.014); sets.append(lids)
        allf = [o for s_ in sets for o in s_]
        x0, x1, y0, y1 = mn._bounds(allf)
        scene = bpy.context.scene
        for f in (1, 2):
            scene.frame_set(f)
            for j, objs in enumerate(sets):
                for o in objs: o.hide_render = j != f - 1; o.keyframe_insert('hide_render', frame=f)
        O.render_window(f'organic/leviathan_{side}_eye', x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, frames=[1, 2])
        for o in allf: o.animation_data_clear(); bpy.data.objects.remove(o)
        O.holdout(statics, False)
        print(f'[leviathan] {side} eye {time.time() - T0:.1f}s'); T0 = time.time()
    if 'fluke' in what:
        # drawn first, the body over it (no holdout). Poses, not a time loop: f<i> is the fluke at the game's
        # sw = sin(t * 1.2) = FLUKE_SW[i]; the game picks the nearest one.
        O.show(statics, False)
        sets = []
        for sw in FLUKE_SW:
            o = fluke(M, sw); mn.outline([o], thickness=0.025); sets.append([o])
        scene = bpy.context.scene
        fr = list(range(1, len(FLUKE_SW) + 1))
        for f in fr:
            scene.frame_set(f)
            for j, objs in enumerate(sets):
                for o in objs: o.hide_render = j != f - 1; o.keyframe_insert('hide_render', frame=f)
        allf = [o for s_ in sets for o in s_]
        name = f'organic/leviathan_{side}_fluke'
        mn.render(name, objs=allf, frames=fr)
        O.merge_entry(name, {'poses': FLUKE_SW})
        for o in allf: o.animation_data_clear(); o.hide_render = True
        O.show(statics, True)
        print(f'[leviathan] {side} fluke {time.time() - T0:.1f}s'); T0 = time.time()
    if 'flippers' in what:
        # one still each (at the game's mean angle 0.6); the game rotates it by its own paddle
        # 0.15 * sin(t * 0.8 + sd) around `pivot` (the root, hidden under the body). Drawn before the body.
        O.show(statics, False)
        for j, sd in enumerate((-1, 1)):
            o = flipper(M, sd); mn.outline([o], thickness=0.025)
            name = f'organic/leviathan_{side}_flipper{j}'
            mn.render(name, objs=[o])
            sx, sy = mn._screen(P(sd * 7.5, 10.0, -0.6))
            O.merge_entry(name, {'pivot': [round(sx * mn.PPU, 1), round(-sy * mn.PPU, 1)]})
            o.hide_render = True
        O.show(statics, True)
        print(f'[leviathan] {side} flippers {time.time() - T0:.1f}s')

FLUKE_SW = [-1.0, -0.5, 0.0, 0.5, 1.0]

if __name__ == '__main__':
    T = time.time()
    sel = [a for a in O.ARGS if a not in ('quick', 'cpu')]
    sides = [s for s in ('port', 'star') if s in sel] or ['port', 'star']
    what = [w for w in ('body', 'fluke', 'flippers', 'eye', 'eyetest') if w in sel] or ['body', 'fluke', 'flippers', 'eye']
    for side in sides: render_side(side, what, O.QUICK)
    print(f'[leviathan] total {time.time() - T:.1f}s')
