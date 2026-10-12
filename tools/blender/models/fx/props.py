"""Small damage props and particle sprites.

  fx/loose_panel     the broken-system overlay's panel (js/systems.js drawBroken: a 16 x 10 px plate at
                     (x + r*0.3, y - r*0.2), turned 0.5 rad): an access panel hanging off by one screw,
                     a scorched edge and two cut wires with bare copper ends. ~0.4 x 0.3 units. Origin =
                     panel centre on the floor. (Scorch under it: fx/scorch_*, scaled to r; smoke and the
                     odd spark stay runtime particles, see fx/smoke_*.)
  fx/smoke_0..3      lit grey smoke puffs (r ~0.25) for the runtime smoke particles (fires, broken systems,
                     burning enemies, explosions' tail). Draw with the particle's alpha and scale; multiply
                     towards white for steam / escaping air (vent, breach outside).
  fx/junk_<kind>     8-frame tumbling debris (a full turn), for things floating in a room without
                     gravity (hz.noGrav), stuff blown about when a room is vented, breach / explosion
                     debris. kinds: bolt, wrench, shard, can, cable. ~0.25-0.45 units. Origin = centre.
                     Play at any speed (8 frames = one turn); the drift / bob stays runtime.

    blender -b --factory-startup --python tools/blender/models/fx/props.py [-- quick]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector, Quaternion
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
if QUICK: mn.SAMPLES = 16

def M():
    return dict(
        panel=fx.worn('panel', '#6b7486', 0.45, 0.55, grime=0.8, grime_scale=6),
        dark=fx.worn('dark', '#262a33', 0.5, 0.4),
        hole=fx.worn('hole', '#0c0d10', 0.9),
        steel=fx.worn('steel', '#c9ced8', 0.3, 0.85, grime=0.3),
        copper=fx.worn('copper', '#d0903e', 0.3, 0.9),
        red=fx.worn('wire_r', '#c8402e', 0.5), yel=fx.worn('wire_y', '#e8c34f', 0.5),
        soot=fx.decal_mat('soot', '#1a1410', 0.22, alpha=0.7, edge=0.6, noise_scale=12),
        hazard=fx.pmat('hz', None, 0.5, stripes=('#e8c34f', '#23252b'), stripe_k=14, grime=0.4),
        smoke=fx.smoke_mat('smoke', '#6a6a72'),
        wrench=fx.worn('wrench', '#a3abb8', 0.3, 0.85, grime=0.3),
        can=fx.worn('can', '#c0683c', 0.4, 0.4, grime=0.5),
        label=fx.worn('label', '#e8c34f', 0.6),
        hull=fx.worn('hull', '#8a93a5', 0.45, 0.6, grime=0.7),
        rubber=fx.worn('rubber', '#262a33', 0.7),
    )

def loose_panel():
    m = M(); parts = []
    P = lambda o: parts.append(o) or o
    # the opening in the floor/casing the panel came off, rimmed
    P(mn.box('opening', (0.36, 0.24, 0.01), m=m['hole'], bevel=0.01))
    P(mn.box('rim_t', (0.4, 0.03, 0.025), loc=(0, 0.13, 0), m=m['panel'], bevel=0.008))
    P(mn.box('rim_b', (0.4, 0.03, 0.025), loc=(0, -0.13, 0), m=m['panel'], bevel=0.008))
    P(mn.box('rim_l', (0.03, 0.26, 0.025), loc=(-0.19, 0, 0), m=m['panel'], bevel=0.008))
    P(mn.box('rim_r', (0.03, 0.26, 0.025), loc=(0.19, 0, 0), m=m['panel'], bevel=0.008))
    # the panel: hanging off its last screw, swung out of the opening and propped on the rim
    g = [mn.box('panel', (0.34, 0.22, 0.018), loc=(0.17, 0.11, 0), m=m['panel'], bevel=0.008)]
    g.append(mn.box('stripe', (0.3, 0.05, 0.003), loc=(0.17, 0.035, 0.018), m=m['hazard'], bevel=0.001))
    for x, y in ((0.03, 0.19), (0.31, 0.19), (0.31, 0.03)):
        g.append(mn.cyl('screwhole', 0.012, 0.004, loc=(x, y, 0.018), m=m['hole'], verts=8, bevel=0))
    g.append(mn.cyl('screw', 0.018, 0.012, loc=(0.03, 0.03, 0.018), m=m['steel'], verts=8, bevel=0.004))
    g.append(fx.flat_poly('scorch', fx.blob_pts(0.09, 5, n=20, rough=0.3), z=0.0195, m=m['soot']))
    g[-1].location = (0.27, 0.15, 0)
    hinge = mn.group('hinge', g, loc=(-0.06, -0.36, 0.006))        # lying beside the opening, propped on its rim
    hinge.rotation_euler = (math.radians(-14), math.radians(4), math.radians(28))
    parts += g
    # cut wires spilling out, bare copper ends
    for col, pts in ((m['red'], [(-0.05, 0.02, -0.01), (0.0, 0.0, 0.08), (0.12, -0.06, 0.1), (0.2, -0.12, 0.05)]),
                     (m['yel'], [(0.04, 0.05, -0.01), (0.07, 0.02, 0.06), (0.17, 0.02, 0.09), (0.25, -0.02, 0.07)])):
        P(fx.pipe('wire', pts, 0.014, col, corner=0.05))
        P(mn.cyl('cu', 0.009, 0.03, loc=pts[-1], m=m['copper'], verts=6, bevel=0.002, rot=(0, math.radians(70), math.radians(-25))))
    mn.outline(parts, thickness=0.01)
    return parts

def smoke(seed):
    m = M(); rnd = random.Random(seed); objs = []
    for k in range(rnd.randint(3, 5)):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.0, 0.12) * (k > 0)
        objs.append(fx.lumpy('puff', rnd.uniform(0.11, 0.17) * (1.0 if k == 0 else 0.85), (math.cos(a) * r, math.sin(a) * r * 0.6, 0.18 + rnd.uniform(-0.03, 0.06)),
                             m['smoke'], seed=seed * 5 + k, amp=0.14, sub=3))
    mn.outline(objs, thickness=0.008, color='#2a2a30')
    return objs

def junk(kind):
    m = M(); g = []
    if kind == 'bolt':
        g.append(mn.cyl('head', 0.06, 0.04, loc=(0, 0, -0.08), m=m['steel'], verts=6, bevel=0.01))
        g.append(mn.cyl('shaft', 0.026, 0.16, loc=(0, 0, -0.04), m=m['steel'], verts=12, bevel=0.005))
        for i in range(5): g.append(fx.ring('thread', 0.03, 0.008, 0.008, loc=(0, 0, -0.02 + i * 0.024), m=m['steel'], verts=12))
        g.append(mn.cyl('nut', 0.05, 0.035, loc=(0, 0, 0.06), m=m['dark'], verts=6, bevel=0.008))
    elif kind == 'wrench':
        g.append(mn.box('handle', (0.36, 0.05, 0.022), loc=(0, 0, -0.011), m=m['wrench'], bevel=0.008))
        g.append(mn.box('grip', (0.14, 0.06, 0.03), loc=(-0.11, 0, -0.015), m=m['rubber'], bevel=0.01))
        g.append(fx.ring('jaw', 0.065, 0.03, 0.024, loc=(0.2, 0, -0.012), m=m['wrench'], verts=20))
        g.append(mn.box('gap', (0.06, 0.05, 0.03), loc=(0.25, 0, -0.015), m=m['hole'], bevel=0.0))
    elif kind == 'shard':
        pts = [(-0.18, -0.08), (-0.05, -0.14), (0.16, -0.1), (0.2, 0.04), (0.04, 0.13), (-0.14, 0.08)]
        o = fx.flat_poly('shard', pts, z=-0.012, m=m['hull'], thick=0.024); g.append(o)
        g.append(mn.box('stripe', (0.2, 0.04, 0.004), loc=(0.0, -0.03, 0.012), m=m['hazard'], bevel=0.0, rot=(0, 0, 0.3)))
    elif kind == 'can':
        g.append(mn.cyl('can', 0.07, 0.2, loc=(0, 0, -0.1), m=m['can'], verts=20, bevel=0.012))
        g.append(mn.cyl('label', 0.072, 0.08, loc=(0, 0, -0.04), m=m['label'], verts=20, bevel=0.0))
        g.append(mn.cyl('lid', 0.06, 0.012, loc=(0, 0, 0.1), m=m['steel'], verts=20, bevel=0.004))
    elif kind == 'cable':
        pts = [(-0.18, 0.02, 0), (-0.08, -0.06, 0.03), (0.04, 0.05, -0.02), (0.16, -0.03, 0.02)]
        g.append(fx.pipe('cable', pts, 0.022, m['red'], corner=0.06))
        g.append(mn.cyl('plug', 0.032, 0.06, loc=(0.16, -0.03, 0.02), m=m['dark'], verts=10, bevel=0.008, rot=(0, math.radians(90), 0)))
        g.append(mn.cyl('cu', 0.012, 0.04, loc=(-0.18, 0.02, 0), m=m['copper'], verts=6, bevel=0.003, rot=(0, math.radians(-90), 0)))
    root = mn.group('junk', g, loc=(0, 0, 0.25))                  # floats a bit above the floor
    FR = list(range(1, 9))
    axis = Vector((0.6, 0.3, 0.75)).normalized()
    for i, f in enumerate(FR):
        q = Quaternion(axis, math.tau * i / 8)
        root.rotation_mode = 'QUATERNION'; root.rotation_quaternion = q; root.keyframe_insert('rotation_quaternion', frame=f)
    mn.outline(g, thickness=0.01)
    return g, FR

t0 = time.time()
mn.reset()
mn.render('fx/loose_panel', objs=loose_panel())
for i in range(4):
    fx.clear_scene_meshes(); mn.render('fx/smoke_%d' % i, objs=smoke(40 + i))
for k in ('bolt', 'wrench', 'shard', 'can', 'cable'):
    fx.clear_scene_meshes(); objs, FR = junk(k); mn.render('fx/junk_' + k, objs=objs, frames=FR)
print(f'[fx] props done in {time.time() - t0:.0f} s')
