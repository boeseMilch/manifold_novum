"""Chapter 2's cargo: the sealed salvage pods (js/invader.js CARGO_PODS, drawCargoPods), and what's left of them.

A Guild salvage capsule lying in a skid cradle, strapped down with two yellow ratchet straps: dull
grey-green steel, frosted end caps (it came out of the cold), a stencil, a tag on a strap, duct tape
over a dent. On top an oval window of warm amber membrane that glows faintly from inside, with a dark
vein web: something is in there. Footprint = the game's solid rect: POD_W x POD_H = 1.2 x 0.72 (game x
along the capsule), ~0.68 high.

Sprites (build/renders/cargo/), origin = the pod's (p.x, p.y) on the floor, one facing:
  pod_<v>        v = 0, 1 (the two pods: stencil 1 / 2, the tape on the other cap). 4 frames: 0 at rest,
                 1-3 something pushing at the membrane from inside (left bulge, right bulge, a big one in
                 the middle with the whole pod rocking). The game shows frame 0, a short twitch through
                 1-3 now and then, and cycles 1-3 ever faster while it stirs (podPose).
  pod_<v>_open   the burst shell: the membrane torn open in petals peeled back, the cavity inside slimed
                 green, goo drooling down the front onto the floor, one strap snapped, shards around.

    blender -b --factory-startup --python tools/blender/models/cargo/pod.py [-- quick]
"""
import sys, os, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..', 'props')); sys.path.insert(0, os.path.join(HERE, '..', 'organic'))
import bpy
from mathutils import Vector
import mn
from propslib import worn, plain, text, tube, Kit, R90, QUICK, ring
import orglib as O

ZC, RAD, BODY = 0.34, 0.27, 0.62             # capsule axis height, radius, cylinder length (caps add ~0.2 each side)
WIN = (0.2, 0.15)                             # the membrane window's half-axes (x, y)
STRAP_X = 0.27
F = [1, 2, 3, 4]

def frost_mat(name, base, seed=0.0):
    """Worn steel with patchy frost (white-blue, rough), more of it low down and at the very ends."""
    m = worn(name, base, 0.5, 0.45, grime=0.8, scratch=0.5)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new; b = N['Principled BSDF']
    src = b.inputs['Base Color'].links[0].from_socket
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 20; nz.inputs['Detail'].default_value = 8
    nz.noise_dimensions = '4D'; nz.inputs['W'].default_value = seed; Lk(tc.outputs['Object'], nz.inputs['Vector'])
    sx = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sx.inputs[0])
    ax = N.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; Lk(sx.outputs['X'], ax.inputs[0])
    ends = N.new('ShaderNodeMapRange'); ends.inputs['From Min'].default_value = 0.12; ends.inputs['From Max'].default_value = 0.27
    ends.inputs['To Max'].default_value = 0.5; Lk(ax.outputs[0], ends.inputs['Value'])
    ad = N.new('ShaderNodeMath'); ad.operation = 'ADD'; Lk(nz.outputs['Fac'], ad.inputs[0]); Lk(ends.outputs[0], ad.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.78; mr.inputs['From Max'].default_value = 0.86; Lk(ad.outputs[0], mr.inputs['Value'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(mr.outputs[0], mx.inputs['Factor'])
    Lk(src, mx.inputs[6]); mx.inputs[7].default_value = (0.82, 0.9, 0.98, 1); Lk(mx.outputs[2], b.inputs['Base Color'])
    ro = N.new('ShaderNodeMapRange'); ro.inputs['To Min'].default_value = 0.45; ro.inputs['To Max'].default_value = 0.9; Lk(mr.outputs[0], ro.inputs['Value'])
    if b.inputs['Roughness'].links: nt.links.remove(b.inputs['Roughness'].links[0])
    Lk(ro.outputs[0], b.inputs['Roughness'])
    return m

def mats(v):
    return dict(
        shell=worn('pod_shell', '#7d8a7a', 0.5, 0.45, grime=0.9, scratch=0.6, gain=1.5),
        cap=frost_mat('pod_cap', '#7d8a7a', seed=v * 3.1),
        hot=O.glossy_glow('pod_hot', '#e0904a', '#ffa64a', 1.5, rough=0.2, coat=0.9, sss=0.4, noise_k=0.4, veins='#5a1a08', vein_scale=6.0),
        dark=worn('pod_dark', '#34383f', 0.45, 0.6, grime=0.7, scratch=0.4),
        steel=worn('pod_steel', '#a3abb8', 0.35, 0.85, grime=0.4, scratch=0.3),
        strap=worn('pod_strap', '#e8c34f', 0.75, 0.0, grime=0.7, scratch=0.0, gain=1.15),
        membrane=O.glossy_glow('pod_membrane', '#b86a34', '#ff8a3a', 1.1, rough=0.22, coat=0.9, sss=0.35, noise_k=0.7, veins='#3a1206', vein_scale=9.0),
        torn=O.glossy_glow('pod_torn', '#8a4a2a', '#ff7a2a', 0.2, rough=0.3, coat=0.8, sss=0.3, noise_k=0.5, veins='#3a1206', vein_scale=12.0),
        cavity=O.flesh('pod_cavity', '#24120c', '#4a2214', c2='#0c0402', scale=4.0, rough=0.6, coat=0.1, sss=0.2),
        slime=O.slime_mat('pod_slime', '#8ae04a', glow=0.45),
        goo=O.glossy_glow('pod_goo', '#5aa02a', '#8aff4a', 0.8, rough=0.35, coat=0.3, sss=0.3, noise_k=0.6, veins=None),
        stencil=plain('pod_stencil', '#e8e4d8', 0.7, gain=0.95),
        tag=plain('pod_tag', '#e2574c', 0.6),
        tape=plain('pod_tape', '#b9bec6', 0.82, gain=1.15),
        ink=plain('pod_ink', '#23252b', 0.5),
    )

def X(o, deg=90): o.rotation_euler = (0, math.radians(deg), 0); return o   # a Z-axis primitive turned to lie along +X

def cradle(k, M):
    for sy in (-1, 1):                            # skid rails
        k(mn.box('rail', (1.12, 0.07, 0.07), loc=(0, sy * 0.3, 0), m=M['dark'], bevel=0.02))
    for sx in (-1, 1):                            # saddles the capsule rests in (the straps' anchors)
        k(mn.box('saddle', (0.13, 0.7, 0.13), loc=(sx * STRAP_X, 0, 0), m=M['dark'], bevel=0.025))
        for sy in (-1, 1):
            k(mn.box('anchor', (0.09, 0.05, 0.08), loc=(sx * STRAP_X, sy * 0.34, 0.06), m=M['steel'], bevel=0.015))

def capsule(k, M, v, opened=False):
    body = k(X(mn.cyl('body', RAD, BODY, loc=(-BODY / 2, 0, ZC), m=M['shell'], verts=48, bevel=0.0)))
    for sx in (-1, 1):
        k(mn.sphere('cap', RAD * 0.995, loc=(sx * BODY / 2, 0, ZC), m=M['cap'], scale=(0.78, 1, 1)))
        k(mn.sphere('nub', 0.05, loc=(sx * (BODY / 2 + RAD * 0.78), 0, ZC), m=M['steel'], scale=(0.5, 1, 1)))   # the end valves
        k(mn.cyl('band', RAD + 0.018, 0.06, loc=(sx * BODY / 2 - 0.03, 0, ZC), m=M['dark'], verts=48, bevel=0.012, rot=(0, math.radians(90), 0)))
    # the window frame (a flat oval collar sunk into the top) and, sealed, the membrane dome in it
    fr = k(ring('frame', 1.0, 0.24, 0.1, loc=(0, 0, ZC + RAD - 0.075), m=M['dark'], verts=48))   # (a ring: open, the hole shows the cavity)
    fr.scale = (WIN[0] + 0.05, WIN[1] + 0.05, 1)
    k(ring('rim', 1.0, 0.08, 0.01, loc=(0, 0, ZC + RAD + 0.022), m=M['steel'], verts=48)).scale = (WIN[0] + 0.012, WIN[1] + 0.012, 1)
    for i in range(10):                           # bolts round the collar
        a = i / 10 * math.tau
        k(mn.cyl('bolt', 0.012, 0.012, loc=(math.cos(a) * (WIN[0] + 0.032), math.sin(a) * (WIN[1] + 0.032), ZC + RAD + 0.023), m=M['steel'], verts=8, bevel=0.003))
    # stencil on the front, a number on the left cap's front
    k(text('stencil', 'SALVAGE', 0.062, (0.02, -RAD - 0.004, ZC + 0.02), M['stencil'], rot=R90), outline=False)
    k(text('num', str(v + 1), 0.11, (-BODY / 2 - 0.1, -RAD * 0.86, ZC + 0.02), M['stencil'], rot=(math.radians(90), 0, math.radians(-28))), outline=False)
    tx = (1 if v == 0 else -1) * (BODY / 2 + 0.08)  # duct tape over a dent on one cap
    k(mn.box('tape', (0.05, 0.16, 0.006), loc=(tx, -0.06, ZC + RAD * 0.86), m=M['tape'], bevel=0.002, rot=(math.radians(-18), (-1 if tx > 0 else 1) * math.radians(28), 0.3)), outline=False)
    return body

def straps(k, M, v, snapped=None):
    for i, sx in enumerate((-STRAP_X, STRAP_X)):
        if snapped == i:                          # torn: one end hangs from the anchor, the other lies across the top
            k(tube('strapA', [(sx, 0.34, 0.1), (sx, 0.3, 0.32), (sx + 0.04, 0.12, 0.6), (sx + 0.1, -0.02, 0.64)], 0.012, M['strap'], corner=0.08))
            k(tube('strapB', [(sx, -0.34, 0.1), (sx - 0.02, -0.38, 0.2), (sx - 0.06, -0.47, 0.04), (sx - 0.12, -0.52, 0.01)], 0.012, M['strap'], corner=0.06))
            continue
        k(mn.cyl('strap', RAD + 0.026, 0.055, loc=(sx - 0.0275, 0, ZC), m=M['strap'], verts=48, bevel=0.008, rot=(0, math.radians(90), 0)))
        k(mn.box('buckle', (0.085, 0.03, 0.1), loc=(sx, -RAD - 0.03, ZC - 0.1), m=M['steel'], bevel=0.01))
        k(mn.box('lever', (0.05, 0.02, 0.07), loc=(sx, -RAD - 0.05, ZC - 0.08), m=M['dark'], bevel=0.008, rot=(math.radians(20), 0, 0)))
    tx = STRAP_X if snapped != 1 else -STRAP_X      # a red tag on a strap: DO NOT OPEN
    tg = k(mn.box('tag', (0.07, 0.006, 0.1), loc=(tx + 0.045, -RAD - 0.05, ZC - 0.2), m=M['tag'], bevel=0.003, rot=(0, math.radians(12), 0)))
    k(text('tagtxt', 'X', 0.05, (tx + 0.046, -RAD - 0.054, ZC - 0.15), M['ink'], rot=R90), outline=False)

def sealed(v):
    M = mats(v); k = Kit()
    cradle(k, M); capsule(k, M, v); straps(k, M, v)
    top = ZC + RAD
    dome = k(O.displace(mn.sphere('membrane', 1.0, loc=(0, 0, top - 0.02), m=M['membrane'], scale=(WIN[0], WIN[1], 0.075)), strength=0.15, scale=0.4, seed=v + 1))
    bulge = k(mn.sphere('bulge', 1.0, loc=(0, 0, top - 0.06), m=M['hot'], scale=(0.01, 0.01, 0.01)))
    root = k.root(); sc = bpy.context.scene
    # (frame, bulge centre x, y, size x, y, height above the dome, pod rock deg)
    poses = [(1, 0.0, 0.0, 0.01, 0.01, -0.05, 0), (2, -0.08, 0.03, 0.1, 0.085, 0.1, 0.0), (3, 0.08, -0.04, 0.11, 0.09, 0.12, -1.5), (4, 0.0, 0.0, 0.15, 0.12, 0.16, 3.0)]
    for f, bx, by, sx, sy, h, rock in poses:
        sc.frame_set(f)
        bulge.location = (bx, -by, top + 0.04); bulge.scale = (sx, sy, max(0.01, h))
        dome.scale = (WIN[0], WIN[1], 0.075 + (0.012 if f > 1 else 0))
        root.rotation_euler = (math.radians(rock * 0.4), math.radians(rock), 0)
        for o in (bulge, dome): o.keyframe_insert('location', frame=f); o.keyframe_insert('scale', frame=f)
        root.keyframe_insert('rotation_euler', frame=f)
    k.outline(0.013)
    mn.render(f'cargo/pod_{v}', objs=k.parts, frames=F)

def opened(v):
    M = mats(v); k = Kit(); rnd = random.Random(7 + v * 13)
    cradle(k, M); capsule(k, M, v); straps(k, M, v, snapped=v % 2)
    top = ZC + RAD
    # the cavity: a dark wet hollow in the window, slimed
    k(mn.sphere('cavity', 1.0, loc=(0, 0, top - 0.02), m=M['cavity'], scale=(WIN[0] * 0.98, WIN[1] * 0.98, 0.06)))
    goo = O.blob('goo_in', [((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.05, 0.05), top + 0.025), rnd.uniform(0.05, 0.08), (1.4, 1.0, 0.4)) for _ in range(9)] + [((0, 0.02, top + 0.02), 0.12, (1.4, 1.0, 0.25))], m=M['goo'], res=0.008)
    k(goo)
    # petals: the membrane torn into flaps peeled back over the collar
    n = 6
    for i in range(n):
        a = i / n * math.tau + rnd.uniform(-0.2, 0.2)
        ex, ey = math.cos(a) * WIN[0], math.sin(a) * WIN[1]
        ln = rnd.uniform(0.15, 0.21); w = rnd.uniform(0.08, 0.12)
        oc, os_ = math.cos(a), -math.sin(a)          # outward, in Blender
        p = mn.sphere('petal', 1.0, loc=(ex + oc * ln * 0.38, -ey + os_ * ln * 0.38, top + 0.035), m=M['torn'], scale=(ln / 2, w / 2, 0.014), segs=24)
        p.rotation_euler = (rnd.uniform(-0.2, 0.2), math.radians(rnd.uniform(25, 45)), -a)   # peeled back: the outer edge droops over the collar
        k(O.displace(p, strength=0.6, scale=0.35, seed=i + 1 + v * 10))
    # goo drooling over the front edge, down the side, into a puddle on the floor in front
    drool = [((0.02, -0.12 - 0.17 * math.sin(q * 1.4), top - 0.01 - (top - 0.06) * q ** 1.6), 0.05 - 0.015 * math.sin(q * 3), (1.2, 1, 1.3)) for q in [i / 28 for i in range(29)]]
    k(O.blob('drool', drool, m=M['slime'], res=0.008))
    pud = [((0.06, -0.42, 0.0), 0.16, (1.6, 1.0, 0.18))] + [((0.06 + rnd.uniform(-0.25, 0.25), -0.42 - rnd.uniform(-0.08, 0.12), 0.0), rnd.uniform(0.05, 0.1), (1.4, 1, 0.2)) for _ in range(7)]
    pd = O.blob('puddle', pud, m=M['slime'], res=0.01); O.cut_below(pd, 0.0); k(pd)
    for i in range(4):                            # shell shards flung onto the floor
        a = rnd.uniform(0, math.tau); d = rnd.uniform(0.55, 0.75)
        s = k(mn.box('shard', (rnd.uniform(0.06, 0.1), rnd.uniform(0.04, 0.06), 0.01), loc=(math.cos(a) * d, math.sin(a) * d * 0.7, 0.0), m=M['torn'], bevel=0.004, rot=(0, 0, a)))
    k.outline(0.013)
    mn.render(f'cargo/pod_{v}_open', objs=k.parts)

if __name__ == '__main__':
    T = time.time()
    only = [a for a in O.ARGS if a in ('sealed', 'open')]
    for v in (0, 1):
        if not only or 'sealed' in only: mn.reset(); sealed(v)
        if not only or 'open' in only: mn.reset(); opened(v)
    print(f'[cargo] total {time.time() - T:.1f}s')
