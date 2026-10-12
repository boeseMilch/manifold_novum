"""Floor decals: flat, soft-edged stains lying on the floor (z ~ 0), lit like the floor.

  fx/scorch_0..2     where a fire burned (js/hazards.js scorch(): combat.decals {scorch, r 0.75}, drawn by
                     drawGoo's stain()), also the dark patch under a broken system (js/systems.js
                     drawBroken: radius min(s.r, 1.1)) and a hull-hit mark (drawShipDecals, r 1.1 / 0.5).
                     Rendered at r = 0.75 (dark core ~1.5 units, faint soot halo ~2); scale by r / 0.75
                     (flat decals scale fine). Pick the variant by the decal's seed % 3.
  fx/crack_0..1      cracked floor plating (~1 unit), e.g. under a big hit or a broken deck lock
  fx/oil_0..1        oil puddles (~1 unit), glossy, for broken machinery / decoration
  fx/coolant_puddle  the coolant leak under the reactor (js/encounters.js startCoolantLeak; the game drips
                     at REACTOR.x - 0.6 .. + 0.5, REACTOR.y + REACTOR.h / 2): a cyan puddle with frost
                     crystals, ~1.8 x 0.9 units; origin = puddle centre (put it at (REACTOR.x, REACTOR.y +
                     REACTOR.h / 2 + 0.35)). The drips stay procedural.
  fx/frost           ice crystals for a room in vacuum around the breach (drawBreaches' frost gradient, r 2.5):
                     ~2.4 units across, mostly transparent; fade it in with the vacuum time.

The beauty pass has the soft alpha. Note: mn's normal/height passes use a material override, so they
come out as the decal's mesh shape without the soft edge: multiply them by the beauty alpha.

    blender -b --factory-startup --python tools/blender/models/fx/decals.py [-- quick]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
if QUICK: mn.SAMPLES = 16
Z = 0.002

def scorch(seed):
    m = fx.decal_mat('scorch', '#2a2018', 0.75, alpha=0.88, center='#0c0907', center_k=0.85, edge=0.5, noise_scale=5)
    m2 = fx.decal_mat('soot_halo', '#2a221a', 1.0, alpha=0.4, edge=0.8, noise_scale=7)
    flake = fx.worn('flake', '#141110', 0.9, 0.0)
    ember = fx.glow('ember_dead', '#3a1408', 0.6)
    objs = [fx.flat_poly('halo', fx.blob_pts(0.85, seed + 1, n=64, rough=0.32, freq=3.5), z=Z, m=m2, grid=3),
            fx.flat_poly('scorch', fx.blob_pts(0.7, seed, n=56, rough=0.28, freq=3.0), z=Z + 0.001, m=m, grid=3)]
    rnd = random.Random(seed)
    for i in range(7):                                           # charred flakes and a warm one or two
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.05, 0.5)
        o = fx.lumpy('flake', rnd.uniform(0.025, 0.05), (math.cos(a) * r, math.sin(a) * r, 0.006), ember if i < 1 else flake, seed=i + seed, amp=0.4, sub=1)
        o.scale = (1.4, 1.0, 0.3); objs.append(o)
    mn.outline([o for o in objs if o.name.startswith('flake')], thickness=0.006)
    return objs

def crack(seed):
    """Branching cracks: dark gap with a lighter chipped edge under it."""
    m = fx.worn('gap', '#0c0d10', 0.9); chip = fx.decal_mat('chip', '#6a7282', 0.6, alpha=0.55, edge=0.2, noise_scale=12)
    dent = fx.decal_mat('dent', '#1a1c22', 0.55, alpha=0.35, edge=0.6)
    objs = [fx.flat_poly('dent', fx.blob_pts(0.45, seed, rough=0.3), z=Z, m=dent, grid=2)]
    return objs + cracks(seed, m, chip, n=None, L=(0.35, 0.55), w=0.018, edge=1.8)

def cracks(seed, m, chip, n=None, L=(0.35, 0.55), w=0.018, edge=1.8, depth_max=2):
    rnd = random.Random(seed); objs = []
    def branch(p, a, L, w, depth):
        pts = [p]; q = Vector(p)
        for k in range(6):
            a += rnd.uniform(-0.5, 0.5); q = q + Vector((math.cos(a), math.sin(a))) * L / 6; pts.append(q.copy())
        left = [pt + Vector((-math.sin(a), math.cos(a))) * w * (1 - i / 6) for i, pt in enumerate(pts)]
        right = [pt - Vector((-math.sin(a), math.cos(a))) * w * (1 - i / 6) for i, pt in enumerate(pts)]
        poly = [(v.x, v.y) for v in left] + [(v.x, v.y) for v in reversed(right)]
        wide = [(v.x, v.y) for v in [pt + Vector((-math.sin(a), math.cos(a))) * (w * edge + 0.006) for pt in pts]] + \
               [(v.x, v.y) for v in reversed([pt - Vector((-math.sin(a), math.cos(a))) * (w * edge + 0.006) for pt in pts])]
        objs.append(_strip('gap', poly, Z + 0.002, m))
        if chip: objs.append(_strip('chip', wide, Z + 0.001, chip))
        if depth < depth_max:
            for _ in range(2 if depth == 0 else 1):
                i = rnd.randint(2, 5); branch(pts[i], a + rnd.choice((-1, 1)) * rnd.uniform(0.5, 1.0), L * 0.55, w * 0.6, depth + 1)
    n = n or rnd.randint(3, 4)
    for k in range(n):
        branch(Vector((0, 0)), k / n * math.tau + rnd.uniform(-0.4, 0.4), rnd.uniform(*L), w, 0)
    return objs

def _strip(name, poly, z, m):
    """Polygon (possibly concave) as a flat mesh, triangulated."""
    bm = bmesh.new(); vs = [bm.verts.new((x, y, z)) for x, y in poly]
    try: f = bm.faces.new(vs)
    except ValueError: f = None
    if f:
        bmesh.ops.triangulate(bm, faces=[f])
        for g in bm.faces:
            if g.normal.z < 0: g.normal_flip()
    return fx._mesh_obj(name, bm, m, smooth=False)

def oil(seed):
    m = fx.decal_mat('oil', '#16110e', 0.5, alpha=0.95, rough=0.12, metal=0.0, clearcoat=1.0, edge=0.25, noise_scale=3, center='#0a0706', center_k=0.4)
    rnd = random.Random(seed)
    objs = [fx.flat_poly('oil', fx.blob_pts(0.42, seed, n=40, rough=0.28, ry=0.34), z=0.0, m=m, thick=0.008, grid=2)]
    for i in range(4):                                           # drips
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.5, 0.65); s = rnd.uniform(0.04, 0.08)
        objs.append(fx.flat_poly('drip', fx.blob_pts(s, seed + i, n=14, rough=0.2), z=0.0, m=m, thick=0.006))
        objs[-1].location = (math.cos(a) * r, math.sin(a) * r * 0.8, 0)
    return objs

def coolant():
    m = fx.decal_mat('coolant', '#3ab4d8', 0.85, alpha=0.85, rough=0.08, clearcoat=1.0, edge=0.2, noise_scale=3, center='#1a7090', center_k=0.5)
    ice = fx.worn('ice', '#dff4ff', 0.25, 0.0, grime=0.1)
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = fx.rgba('#4ac0e0')   # a faint chemical glow
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.15
    objs = [fx.flat_poly('puddle', fx.blob_pts(0.85, 21, n=56, rough=0.18, ry=0.42), z=0.0, m=m, thick=0.01, grid=3)]
    rnd = random.Random(22)
    for i in range(26):                                          # frost crystals around the rim
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.85, 1.05)
        x, y = math.cos(a) * 0.85 * r, math.sin(a) * 0.42 * r
        s = rnd.uniform(0.03, 0.07)
        o = fx.lumpy('ice', s, (x, y, 0.005), ice, seed=i, amp=0.5, sub=1); o.scale = (1.5, 1.0, 0.4); o.rotation_euler.z = rnd.uniform(0, 3)
        objs.append(o)
    mn.outline([o for o in objs if o.name.startswith('ice')], thickness=0.005, color='#3a6a80')
    return objs

def frost():
    m = fx.decal_mat('frost', '#d8f0ff', 1.15, alpha=0.4, rough=0.3, edge=0.9, noise_scale=6)
    fern = fx.decal_mat('fern', '#eef8ff', 1.25, alpha=0.65, rough=0.25, edge=0.8, noise_scale=8)
    ice = fx.worn('ice', '#e6f6ff', 0.2, 0.0, grime=0.1)
    objs = [fx.flat_poly('frost', fx.blob_pts(1.1, 31, n=48, rough=0.25), z=Z, m=m, grid=3)]
    objs += cracks(32, fern, None, n=9, L=(0.6, 1.0), w=0.03, depth_max=2)      # frost ferns
    rnd = random.Random(33)
    for i in range(18):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.2, 0.9)
        o = fx.lumpy('crystal', rnd.uniform(0.02, 0.045), (math.cos(a) * r, math.sin(a) * r, 0.004), ice, seed=i, amp=0.5, sub=1)
        o.scale = (1.2, 1.2, 0.5); objs.append(o)
    mn.outline([o for o in objs if o.name.startswith('crystal')], thickness=0.005, color='#5a8aa8')
    return objs

t0 = time.time()
mn.reset()
JOBS = [('scorch_%d' % i, lambda i=i: scorch(100 + i * 17)) for i in range(3)] + \
       [('crack_%d' % i, lambda i=i: crack(200 + i * 13)) for i in range(2)] + \
       [('oil_%d' % i, lambda i=i: oil(300 + i * 7)) for i in range(2)] + \
       [('coolant_puddle', coolant), ('frost', frost)]
for name, job in JOBS:
    fx.clear_scene_meshes()
    mn.render('fx/' + name, objs=job())
print(f'[fx] decals done in {time.time() - t0:.0f} s')
