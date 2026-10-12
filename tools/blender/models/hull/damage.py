"""Hull damage seen from outside: breach holes, the plates nailed over them, small-hit marks.

Sprites (assets/sprites/hull/), all flat on the deck plane, origin = the game point they are drawn at:
  breach_v<0..1>         a hull breach (js/hazards.js drawBreachesOutside, at holeAt(room)): a torn hole with
                         the plating curled outwards, glowing edges, the hull's inside wall and space below
                         (a few stars). The game keeps its own puffs of escaping air (procedural).
  patch_nailed_v<0..2>   the plate nailed over a breach (drawPatch nailed, the room's hz.patches seed:
                         v = seed % 3), slightly rotated each
  patch_loose            plated but not nailed yet (b.plated): the plate lying askew over the hole, a corner up
  decal_small_v<0..2>    a small hit (combat.decals, r 0.5): soot, a dent, scratches
  decal_large_v<0..1>    a large hit (r 1.1): a buckled crater, soot, a torn seam
      pick a variant by the decal's seed (v = floor(seed) % n)

    blender -b --factory-startup --python tools/blender/models/hull/damage.py [-- quick]
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hulllib import *
from mathutils import Matrix

ARGS = args()
QUICK = 'quick' in ARGS
if QUICK: mn.SAMPLES = 16

def mats():
    return dict(
        plate=worn('plate', '#5d6678', 0.5, 0.35, wear=1.2),
        patch=worn('patch', '#8a93a5', 0.45, 0.35, wear=1.3, grime=0.5),
        wall=worn('wall', '#2b303a', 0.6, 0.3, wear=0.3, grime=1.4),
        void=mn.mat('void', '#05070c', 0.9),
        star=emit_mat('star', '#ffffff', 1.5),
        hot=emit_mat('hot', '#ff8a3a', 1.2, base='#7a3010'),
        char=worn('char', '#2e2a28', 0.85, 0.3, wear=0.4, grime=1.4),
        steel=worn('steel', '#c9ced8', 0.32, 0.8, wear=0.3),
        scorch=scorch_mat('scorch', 0.85, 5.0),
        soot=scorch_mat('soot', 0.6, 3.0),
        bare=worn('bare', '#9aa3b0', 0.3, 0.8, wear=0.2, grime=0.3),
        tape=tape_mat(),
    )

def star_poly(seed, n=18, ry=1.15, r0=0.26, r1=0.5):
    """The game's hole (js/hazards.js: alternating radii, y stretched 1.15), made more jagged per variant."""
    rnd = random.Random(seed); out = []
    for i in range(n):
        r = (r1 + 0.08 * math.sin(i * 3.1)) if i % 2 == 0 else r0
        r *= 1 + rnd.uniform(-0.25, 0.2)
        a = (i + rnd.uniform(-0.3, 0.3)) / n * math.tau
        out.append((r * math.cos(a), r * math.sin(a) * ry))
    return out

def well(name, pts, z0, z1, m):
    """Open walls along a polygon (no caps): the inside of a hole."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    a = [bm.verts.new(G(x, y, z0)) for x, y in pts]; b = [bm.verts.new(G(x, y, z1)) for x, y in pts]
    for i in range(len(pts)):
        j = (i + 1) % len(pts); bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return o

def render_breach(v):
    mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
    pts = star_poly(11 + v * 7)
    P(well('wall', pts, -0.6, 0.0, M['wall']))
    P(prism('void', pts, -0.62, -0.6, M['void'], bevel=0))
    rnd = random.Random(3 + v)
    for k in range(4):                                                   # stars through the hole
        P(gsphere('star', rnd.uniform(-0.12, 0.12), rnd.uniform(-0.15, 0.15), -0.59, 0.012, M['star'], segs=6))
    # petals: jagged triangles of plating torn and curled outwards around the rim, glowing torn edges
    n = len(pts)
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        if i % 3 == 2: continue
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2; L = math.hypot(mx, my); ox, oy = mx / L, my / L
        reach = 0.16 + rnd.uniform(0, 0.1); lift_ = rnd.uniform(0.04, 0.12)
        tip = (mx + ox * reach, my + oy * reach)
        me = bpy.data.meshes.new('petal'); bm = bmesh.new()
        a = bm.verts.new(G(x0, y0, 0.0)); b = bm.verts.new(G(x1, y1, 0.0)); c = bm.verts.new(G(tip[0], tip[1], lift_))
        f = bm.faces.new((a, b, c)); bm.normal_update()
        if f.normal.z < 0: f.normal_flip()
        bm.to_mesh(me); bm.free()
        o = mn.link(bpy.data.objects.new('petal', me)); md = o.modifiers.new('thick', 'SOLIDIFY'); md.thickness = 0.02
        mn.assign(o, M['plate']); P(o)
    for i in range(len(pts)):                                             # hot torn edges, here and there
        if rnd.random() < 0.45: continue
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
        P(tube('rim_hot', [(x0, y0, 0.004), (x1, y1, 0.004)], 0.012, M['hot']))
    # the hull around the hole as a holdout: only the inside of the hole shows the wall
    hold = prism('hold', [(math.cos(i / 24 * math.tau) * 1.6, math.sin(i / 24 * math.tau) * 1.6) for i in range(24)], -0.7, 0.0, None, bevel=0)
    cut = prism('cut', pts, -1, 0.5, None, bevel=0)
    md = hold.modifiers.new('hole', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cut; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = hold; bpy.ops.object.modifier_apply(modifier='hole'); bpy.data.objects.remove(cut)
    hold.is_holdout = True
    P(disc('scorch', 0, 0, 0.004, 0.95, M['scorch'], sy=1.1))
    for k in range(5):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.6, 0.85)
        s = mn.box('scratch', (0.25, 0.015, 0.004), loc=G(math.cos(a) * r, math.sin(a) * r, 0.006), m=M['bare'], bevel=0, rot=(0, 0, -a + 0.4))
        P(s)
    mn.outline([o for o in parts if o.name.startswith('petal')], thickness=0.01)
    mn.render(f'hull/breach_v{v}', objs=parts)
    manifest_patch(f'hull/breach_v{v}', {'origin': 'holeAt(room) on the deck plane'})

def render_patch(name, seed, nailed, rot):
    mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
    rnd = random.Random(seed)
    W, H = 1.1, 1.2
    plate = mn.box('patch', (W, H, 0.04), loc=(0, 0, 0), m=M['patch'], bevel=0.02)
    grp = mn.link(bpy.data.objects.new('grp', None))
    plate.parent = grp; P(plate)
    for k in range(4):                                                     # scuffs
        s = mn.box('scuff', (rnd.uniform(0.2, 0.5), 0.012, 0.004), loc=(rnd.uniform(-0.35, 0.35), rnd.uniform(-0.4, 0.4), 0.04), m=M['char'], bevel=0,
                   rot=(0, 0, rnd.uniform(0, math.pi)))
        s.parent = grp; P(s)
    if nailed:
        spots = [(-0.42, -0.45), (0.4, -0.5), (-0.45, 0.48), (0.38, 0.42), (0.05, -0.52)][:4 + int(rnd.random() * 2)]
        for (nx, ny) in spots:
            x, y = nx + rnd.uniform(-0.04, 0.04), -(ny + rnd.uniform(-0.04, 0.04))
            nh = mn.cyl('nail', 0.04, 0.02, loc=(x, y, 0.04), m=M['steel'], verts=12, bevel=0.008); nh.parent = grp; P(nh)
            if rnd.random() < 0.35:                                       # a bent one
                b = mn.box('bent', (0.12, 0.025, 0.025), loc=(x + 0.06, y + 0.02, 0.055), m=M['steel'], bevel=0.006, rot=(0, -0.3, 0.5)); b.parent = grp; P(b)
            d = mn.cyl('dent', 0.07, 0.004, loc=(x, y, 0.04), m=M['char'], verts=12, bevel=0); d.parent = grp; P(d)
        t = mn.box('tape', (0.5, 0.12, 0.01), loc=(0.35, 0.47, 0.04), m=M['tape'], bevel=0.003, rot=(0, 0, 0.8)); t.parent = grp; P(t)
    else:
        P(disc('soot', 0.0, 0.0, 0.003, 0.75, M['soot'], sy=1.1))
    grp.rotation_euler = (0, 0, -rot)
    if not nailed:
        grp.rotation_euler = (math.radians(4), math.radians(-6), -rot); grp.location = (0, 0, 0.05)
    mn.outline([plate], thickness=0.012)
    mn.render(name, objs=parts)
    manifest_patch(name, {'origin': 'holeAt(room) on the deck plane (the hole the plate covers)'})

def render_decal(name, r, seed, large):
    mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
    rnd = random.Random(seed)
    P(disc('scorch', 0, 0, 0.004, r * 1.05, M['scorch'], sy=1.0))
    # dent: an irregular charred crater with a buckled lip of plating
    cr = r * (0.26 if large else 0.24)
    cp = [(cr * (1 + rnd.uniform(-0.25, 0.25)) * math.cos(i / 14 * math.tau), cr * (1 + rnd.uniform(-0.25, 0.25)) * math.sin(i / 14 * math.tau)) for i in range(14)]
    lip = prism('lip', [(x * 1.25, y * 1.25) for x, y in cp], -0.01, 0.02 if large else 0.012, M['plate'], bevel=0.008)
    P(lip)
    P(prism('crater', cp, -0.01, 0.024 if large else 0.016, M['char'], bevel=0.006))
    P(disc('soot2', 0, 0, 0.03, cr * 2.0, M['soot']))
    if large:                                                             # torn seam, bent plate edges, a glowing spot
        for k in range(4):
            a = rnd.uniform(0, math.tau)
            o = mn.box('shard', (0.22, 0.14, 0.02), loc=(0, 0, 0), m=M['plate'], bevel=0.005)
            o.data.transform(Matrix.Translation((0.11, 0, 0)))
            o.rotation_euler = (0, -rnd.uniform(0.15, 0.3), -a); o.location = G(math.cos(a) * cr, math.sin(a) * cr, 0.0); P(o)
        P(mn.box('seam', (r * 1.3, 0.025, 0.006), loc=G(0, cr * 0.2, 0.004), m=M['void'], bevel=0, rot=(0, 0, rnd.uniform(-0.6, 0.6))))
        P(gsphere('ember', rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), 0.0, 0.05, M['hot'], scale=(1.3, 1.0, 0.4), segs=10))
    for k in range(4 if large else 3):                                     # bright scratches flung out of the hit
        a = rnd.uniform(0, math.tau); d = rnd.uniform(cr * 1.3, r * 0.9)
        P(mn.box('scratch', (r * 0.35, 0.014, 0.004), loc=G(math.cos(a) * d, math.sin(a) * d, 0.006), m=M['bare'], bevel=0, rot=(0, 0, -a)))
    mn.outline([o for o in parts if o.name.startswith(('lip', 'shard'))], thickness=0.008)
    mn.render(name, objs=parts)
    manifest_patch(name, {'origin': 'the decal centre (d.x, d.y) on the deck plane', 'r': r})

if __name__ == '__main__':
    T = time.time()
    for v in range(2): render_breach(v)
    for v, rot in enumerate((-0.18, 0.06, 0.21)): render_patch(f'hull/patch_nailed_v{v}', 40 + v, True, rot)
    render_patch('hull/patch_loose', 7, False, 0.25)
    for v in range(3): render_decal(f'hull/decal_small_v{v}', 0.5, 100 + v, False)
    for v in range(2): render_decal(f'hull/decal_large_v{v}', 1.1, 200 + v, True)
    print(f'[damage] total {time.time() - T:.1f}s')
