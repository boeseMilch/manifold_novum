"""Hull breaches (js/hazards.js drawBreaches / drawBreachesOutside / drawPatch).

The game draws the hole at holeAt(room) (straddling the wall's inner edge, seen from both sides):
a jagged 9-point star, radius 0.28 / 0.42 units, black with a few stars, rimmed in hot orange
(#c96a3a). Here it's a real hole: the hull's cross-section (inner plate, yellow insulation foam, outer
plate) going down into space, torn metal petals curled up into the room, a glowing torn edge, a
sooty buckled ring and a few bits of debris.

  fx/breach_hole        the open hole (inside view; outside it works too). Origin = hole centre.
  fx/breach_tarp        the blue tarp taped over it, sucked into the hole a bit (1 x 1 units, like the
                        game's rr(-T/2, -T/2, T, T)); drawn over breach_hole while b.tarp
  fx/breach_tarp_torn   4-frame flutter: the tarp ripped open by the next hit, flaps pulled towards
                        the hole; drawn over breach_hole (the game drops b.tarp on a tear; keep a
                        "torn" flag if you want to show it)
  fx/breach_patch_a/b/c the hull plate nailed on (drawPatch nailed=true, 1.1 x 1.2 units), three
                        rotations / nail sets for the seed's random tilt (-0.18, +0.02, +0.2 rad)
  fx/breach_patch_loose the plate placed but not nailed yet (b.plated: rotated +0.25 rad, no nails)

Runtime (procedural): the vacuum's blue room tint, the air streaks rushing into the hole and the frost
gradient (drawBreaches when vacuumRoom), the escaping-air puffs outside, the hit's spark burst.

    blender -b --factory-startup --python tools/blender/models/fx/breach.py [-- quick]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, noise
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
if QUICK: mn.SAMPLES = 16

def mats():
    return dict(
        hull=fx.worn('hull', '#8a93a5', 0.45, 0.6, grime=0.7, grime_scale=5),
        hull_in=fx.worn('hull_in', '#5a6272', 0.5, 0.5, grime=0.6),
        foam=fx.worn('foam', '#e0b43a', 0.9, 0.0, grime=0.5, grime_scale=9),
        void=fx.glow('void', '#04060b', 1.0),
        star=fx.glow('star', '#ffffff', 1.4),
        hot=fx.glow('hot', '#e0702c', 0.9),
        soot=fx.decal_mat('soot', '#1c1612', 0.75, alpha=0.8, center='#0a0806', center_k=0.7),
        steel=fx.worn('steel', '#c9ced8', 0.3, 0.85, grime=0.3),
        tarp=fx.worn('tarp', '#3c6eb0', 0.75, 0.0, grime=0.35, grime_scale=4),
        tarp_dark=fx.worn('tarp_dark', '#2a4e80', 0.8, 0.0, grime=0.3),
        tape=fx.worn('tape', '#b9bcc2', 0.85, 0.0, grime=0.4, grime_scale=12),
        plate=fx.worn('plate', '#b4b8b0', 0.4, 0.7, grime=0.8, grime_scale=4),
        weld=fx.worn('weld', '#6a5a4a', 0.35, 0.8, grime=0.6),
        dark=fx.worn('dark', '#262a33', 0.5, 0.4),
        sticker=fx.worn('sticker', '#e8c34f', 0.6, 0.0, grime=0.4),
        ink=fx.worn('ink', '#23252b', 0.6),
    )

def star_pts(n=9, r0=0.28, r1=0.42, seed=1, jag=0.04):
    """The game's star outline (alternating radii), plus a little jitter between the points."""
    rnd = random.Random(seed); pts = []
    for i in range(n * 2):
        a = i / (n * 2) * math.tau
        r = (r1 if i % 2 == 0 else r0) + rnd.uniform(-jag, jag)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts

def prism(name, pts, z0, z1, m, scale=1.0):
    """Vertical wall along a closed outline (the hole's sides), facing inwards."""
    bm = bmesh.new(); n = len(pts)
    lo = [bm.verts.new((x * scale, y * scale, z0)) for x, y in pts]; hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces: f.normal_flip()                       # we look at the inside
    return fx._mesh_obj(name, bm, m, smooth=False)

def petal(name, am, rb, wb, L, th0, curl, m, seed):
    """A torn metal petal: base along the rim at angle am, bent up into the room and curling outwards."""
    c, s = math.cos(am), math.sin(am)
    B = Vector((c * rb, s * rb, 0)); T = Vector((-s, c, 0)); I = Vector((-c, -s, 0)); Z = Vector((0, 0, 1))
    bm = bmesh.new(); NU, NV = 4, 6; grid = []
    for j in range(NV + 1):
        v = j / NV; th = th0 + curl * v
        half = wb * (1 - v) ** 0.7 + 0.004
        row = []
        for i in range(NU + 1):
            u = i / NU * 2 - 1
            p = B + T * u * half + (I * math.cos(th) + Z * math.sin(th)) * L * v
            p += Z * 0.02 * noise.noise(Vector((u * 2 + seed, v * 3, seed))) + I * 0.01 * abs(u)
            row.append(bm.verts.new(p))
        grid.append(row)
    for j in range(NV):
        for i in range(NU): bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    o = fx._mesh_obj(name, bm, m)
    sd = o.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = 0.016; sd.offset = 0
    return o

def build_hole():
    M = mats(); parts = []
    P = lambda o: parts.append(o) or o
    pts = star_pts()
    D = 0.16                                                   # hull thickness shown in the hole
    P(fx.flat_poly('void', [(x * 1.05, y * 1.05) for x, y in pts], z=-D, m=M['void']))
    rnd = random.Random(4)
    for i in range(6):                                         # stars through it
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.02, 0.22)
        P(mn.sphere('star', 0.012 if i % 3 else 0.018, loc=(math.cos(a) * r, math.sin(a) * r, -D + 0.005), m=M['star'], segs=8))
    # cross-section: inner plate, foam, outer plate
    P(prism('wall_in', pts, -0.05, 0.0, M['hull_in']))
    P(prism('wall_foam', pts, -0.12, -0.05, M['foam']))
    P(prism('wall_out', pts, -D, -0.12, M['hull_in']))
    # the glowing torn edge (game: #c96a3a stroke)
    bm = bmesh.new(); n = len(pts)                             # a ring between the outline and 1.13x the outline
    a_ = [bm.verts.new((x, y, 0.004)) for x, y in pts]; b_ = [bm.verts.new((x * 1.13, y * 1.13, 0.004)) for x, y in pts]
    for i in range(n): bm.faces.new((a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P(fx._mesh_obj('rim', bm, M['hot'], smooth=False))
    # buckled, sooty ring around it
    ring_pts = fx.blob_pts(0.66, 3, n=36, rough=0.18)
    bm = bmesh.new(); n2 = len(ring_pts)
    inner = [bm.verts.new((math.cos(i / n2 * math.tau) * 0.44, math.sin(i / n2 * math.tau) * 0.44, 0.003)) for i in range(n2)]
    outer = [bm.verts.new((x, y, 0.002)) for x, y in ring_pts]
    for i in range(n2): bm.faces.new((inner[i], inner[(i + 1) % n2], outer[(i + 1) % n2], outer[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P(fx._mesh_obj('soot', bm, M['soot'], smooth=False))
    # petals between the star's tips, bent up into the room
    rnd = random.Random(9)
    for i in range(9):
        if i in (2, 6): continue                               # a couple were blown out completely
        am = (i * 2 + 1) / 18 * math.tau
        P(petal('petal', am, 0.36 + rnd.uniform(-0.02, 0.03), rnd.uniform(0.1, 0.14), rnd.uniform(0.16, 0.26),
                math.radians(rnd.uniform(35, 65)), math.radians(rnd.uniform(40, 90)), M['hull'], i))
    # debris
    for i in range(5):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.5, 0.75)
        o = P(fx.lumpy('debris', rnd.uniform(0.03, 0.05), (math.cos(a) * r, math.sin(a) * r, 0.015), M['hull'] if i % 2 else M['dark'], seed=i, amp=0.4, sub=1))
        o.scale = (1.4, 1.0, 0.45)
    P(mn.cyl('bolt', 0.025, 0.02, loc=(0.62, -0.25, 0), m=M['steel'], verts=6, bevel=0.005))
    mn.outline([p for p in parts if p.name.startswith(('petal', 'debris', 'bolt'))], thickness=0.01)
    return parts

def tarp_mesh(name, M, torn=0.0, frame=0, seed=5):
    """The tarp: a 1 x 1 sheet sagging into the hole, radial wrinkles; torn > 0 cuts a ragged hole and
    turns the cut edge into flaps pulled down into it (flutter by frame)."""
    NN = 28; S = 1.0; bm = bmesh.new(); vs = {}
    hole = fx.blob_pts(torn, seed, n=24, rough=0.3, freq=3.0) if torn else None
    def inside(x, y):
        if not torn: return False
        a = math.atan2(y, x) % math.tau; i = int(a / math.tau * 24) % 24
        hx, hy = hole[i]; return math.hypot(x, y) < math.hypot(hx, hy)
    for j in range(NN + 1):
        for i in range(NN + 1):
            x = (i / NN - 0.5) * S; y = (j / NN - 0.5) * S; r = math.hypot(x, y)
            edge = min(0.5 - abs(x), 0.5 - abs(y))
            z = 0.03 - 0.07 * max(0, 1 - r / 0.45) ** 1.5 * (0 if torn else 1)
            z += 0.012 * math.sin(math.atan2(y, x) * 7 + r * 9) * min(1, r * 3) * min(1, max(0, edge - 0.12) * 10)
            z = min(z, 0.03) if edge < 0.06 else z
            vs[i, j] = bm.verts.new((x, y, z))
    for j in range(NN):
        for i in range(NN):
            cx = ((i + 0.5) / NN - 0.5) * S; cy = ((j + 0.5) / NN - 0.5) * S
            if inside(cx, cy): continue
            bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    if torn:                                                     # flaps: the cut edge droops into the hole and flutters
        for v in bm.verts:
            r = math.hypot(v.co.x, v.co.y)
            k = max(0.0, 1 - (r - torn * 0.7) / (torn * 0.7))
            if k <= 0: continue
            a = math.atan2(v.co.y, v.co.x)
            fl = math.sin(frame / 4 * math.tau + a * 3) * 0.5 + 0.5
            v.co.z -= k ** 1.2 * (0.14 + 0.08 * fl)
            v.co.x *= 1 - 0.15 * k * fl; v.co.y *= 1 - 0.15 * k * fl
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = fx._mesh_obj(name, bm, M['tarp'])
    sd = o.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = 0.008; sd.offset = 1
    o.data.materials.append(M['tarp_dark']); sd.material_offset = 1
    return o

def tape_strip(name, x, y, length, ang, M, seed):
    rnd = random.Random(seed)
    o = mn.box(name, (length, 0.11, 0.006), loc=(x, y, 0.036), m=M['tape'], bevel=0.002, rot=(0, 0, ang + rnd.uniform(-0.06, 0.06)))
    return o

def build_tarp(torn=0.0, frame=0):
    M = mats(); parts = [tarp_mesh('tarp', M, torn, frame)]
    for k, (x, y, a) in enumerate(((0, -0.42, 0), (0, 0.42, 0), (-0.42, 0, math.pi / 2), (0.42, 0, math.pi / 2))):
        parts.append(tape_strip('tape', x, y, 0.9, a, M, 300 + k))
    for sx in (-1, 1):                                           # grommets at the corners
        for sy in (-1, 1):
            parts.append(fx.ring('grommet', 0.035, 0.015, 0.012, loc=(sx * 0.44, sy * 0.44, 0.032), m=M['steel'], verts=16))
    parts.append(fx.label('stencil', 'TARP 1x1', 0.07, (0.18, 0.3, 0.032), m=M['tarp_dark']))
    mn.outline(parts, thickness=0.012)
    return parts

def build_patch(rot, nailed, seed):
    M = mats(); parts = []; rnd = random.Random(seed)
    g = []
    plate = mn.box('plate', (1.1, 1.2, 0.045), m=M['plate'], bevel=0.03); g.append(plate)
    for i in range(4):                                           # scuffs: shallow dark grooves
        x0, y0 = rnd.uniform(-0.4, 0.4), rnd.uniform(-0.45, 0.45)
        g.append(mn.box('scuff', (rnd.uniform(0.15, 0.4), 0.012, 0.004), loc=(x0, y0, 0.044), m=M['dark'], bevel=0, rot=(0, 0, rnd.uniform(0, math.pi))))
    g.append(fx.label('stencil', 'HULL PLATE', 0.08, (0.05, -0.38, 0.046), m=M['ink']))
    g.append(mn.box('stripe', (0.9, 0.06, 0.004), loc=(0, -0.48, 0.044), m=M['sticker'], bevel=0.001))
    if nailed:
        spots = [(-0.42, -0.45), (0.4, -0.5), (-0.45, 0.48), (0.38, 0.42), (0.05, -0.52)][:4 + (seed % 2)]
        for k, (nx, ny) in enumerate(spots):
            x, y = nx + rnd.uniform(-0.04, 0.04), ny + rnd.uniform(-0.04, 0.04)
            g.append(mn.cyl('nail', 0.045, 0.025, loc=(x, y, 0.045), m=M['steel'], verts=10, bevel=0.008))
            if rnd.random() < 0.35:                              # a bent one
                b = mn.cyl('bent', 0.012, 0.12, loc=(x, y, 0.07), m=M['steel'], verts=6, bevel=0.003, rot=(0, math.radians(80), math.radians(-30)))
                g.append(b)
        for k in range(9):                                       # a short weld bead along one edge
            g.append(fx.lumpy('weld', 0.035, (-0.3 + k * 0.07, 0.6, 0.02), M['weld'], seed=k, amp=0.2, sub=1))
        g.append(mn.box('tape', (0.32, 0.1, 0.006), loc=(0.5, 0.52, 0.045), m=M['tape'], bevel=0.002, rot=(0, 0, math.radians(40))))
    grp = mn.group('patch', g); grp.rotation_euler.z = -rot      # game rotates clockwise on screen (y down)
    mn.outline(g, thickness=0.014)
    return g

t0 = time.time()
mn.reset()
mn.render('fx/breach_hole', objs=build_hole())
fx.clear_scene_meshes(); mn.render('fx/breach_tarp', objs=build_tarp())
fx.clear_scene_meshes()
FR = [1, 2, 3, 4]; allp = []
for i, f in enumerate(FR):
    ps = build_tarp(torn=0.27, frame=i); fx.only_on(ps, f, FR); allp += ps
mn.render('fx/breach_tarp_torn', objs=allp, frames=FR)
for name, rot, nailed, seed in (('breach_patch_a', -0.18, True, 11), ('breach_patch_b', 0.02, True, 12), ('breach_patch_c', 0.2, True, 13),
                                ('breach_patch_loose', 0.25, False, 14)):
    fx.clear_scene_meshes(); mn.render('fx/' + name, objs=build_patch(rot, nailed, seed))
print(f'[fx] breaches done in {time.time() - t0:.0f} s')
