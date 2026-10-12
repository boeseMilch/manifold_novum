"""Spore clouds and hull barnacles (js/eva.js: spawnSpores, the barnacle growth, drawEva).

Sprites (build/renders/organic/):
  spore_cloud_f<i>        i = 0..7: a clump of glowing spore pods (purple and green, pale glowing
                          tips) on a fleshy knot, with hair-thin feelers; a loop of the pods breathing
                          (staggered) and the feelers waving. Origin = the cloud centre (s.x, s.y).
                          Already at the game's 1.6x drawing scale (the clump ~1.1 across, feelers to
                          ~0.9 from the centre). The soft haze around it stays procedural (additive radial
                          gradient, as now); the game may also keep rotating the sprite slowly (s.t * 0.8).
                          Loop period: ~1.6 s (0.2 s per frame).
  spore_pod               one pod (~0.3 across), the spore the spore mother's tongue carries.
  barnacle_s<k>_v<j>      a barnacle stuck on the hull, k = 0..3 growth stage, j = 0..1 variant
                          (two cluster layouts, pick by uid). Stage = floor(min(1, age / BARNACLE_GROW)
                          * 3): 0 fresh spores just stuck, 1 small tan cones, 2 bigger cones, 3 = grown
                          (age >= BARNACLE_GROW): purple shells glowing inside, the draining ones.
                          Footprints follow the game: r = 5 + 9k px (0.1 .. 0.29 units), 5 cones
                          at 0.5 r around the centre. Origin = (b.x, b.y) on the hull surface.
  barnacle_s3_v<j>_drain_f<i>  i = 0..5: the grown barnacle draining power: feathery cirri sweep out of the
                          shells and back, the inner glow pulses (period ~1 s, the game's sin(t * 6)).

    blender -b --factory-startup --python tools/blender/models/organic/spores.py [-- quick]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Euler
import mn
import orglib as O

FR = list(range(1, 9))

def pod_mats():
    return dict(
        purple=O.glossy_glow('pod_purple', '#5a3a86', '#c27aff', 1.5, noise_k=0.8),
        green=O.glossy_glow('pod_green', '#3a6a3a', '#9cff5a', 1.4, noise_k=0.8),
        tip=O.emit_mat('pod_tip', '#f0ffd0', 1.5, base='#f0ffd0'),
        veins=None,
        knot=O.flesh('knot', '#5a2a6a', '#8a4a7a', c2='#200a28', veins='#c06ad0', scale=3, sss=0.3),
        hair=O.plain('hair', '#d2e6aa', 0.4, sss=0.2),
    )

def spore_pod(name, M, mat, r, loc, axis, seed=0):
    """A bulbous pod: teardrop body, a glowing pore at the tip, a few ridges (as a blob)."""
    ax = Vector(axis).normalized(); c = Vector(loc)
    rot = ax.to_track_quat('Z', 'Y').to_euler()
    parts = [(c, r, (1, 1, 1.25), tuple(rot)), (c - ax * r * 0.7, r * 0.55, (1, 1, 1.4), tuple(rot))]
    o = O.blob(name, parts, m=mat, res=r * 0.12)
    tip = mn.sphere(name + '_tip', r * 0.2, loc=c + ax * r * 1.2, m=M['tip'], scale=(1, 1, 0.5), segs=16)
    tip.rotation_euler = rot
    return [o, tip]

def build_cloud():
    M = pod_mats()
    objs, pods = [], []
    knot = O.blob('knot', [((0, 0, 0), 0.16, (1, 1, 0.9))], m=M['knot'], res=0.02); objs.append(knot)
    # pods: one in the middle, six around (the game: d = 9 px, r = 5..8 px, at 1.6x -> units)
    k = 1.6 / 48
    layout = [(0, 0, 0.0, 6.5)] + [(i * 0.9 + 0.3, 9.5, (0.12 if i % 2 else -0.1), 5 + (i % 3) * 1.5) for i in range(6)]
    for i, (a, d, z, r) in enumerate(layout):
        dirv = Vector((math.cos(a), -math.sin(a), 0.55 if i else 1.0)).normalized()
        c = Vector((math.cos(a) * d * k, -math.sin(a) * d * k, z + (0.14 if i == 0 else 0.0)))
        mat = M['purple'] if i % 2 else M['green']
        if i == 0: mat = M['purple']
        p = spore_pod(f'pod{i}', M, mat, r * k * 1.05, c, dirv)
        pods.append((p, c, i)); objs += p
    # hair-thin feelers: 6 long curved ones and a fringe of short ones
    hairs = []
    for i in range(14):
        long = i < 6
        a = i / 6 * math.tau if long else (i - 6) / 8 * math.tau + 0.4
        L = (0.75 + 0.1 * math.sin(i * 1.7)) if long else 0.32
        hairs.append((a, L, 0.008 if long else 0.006))
    return M, objs, pods, hairs

def feeler(name, a, L, r, phase, wave, m):
    pts, rad = [], []
    for j in range(9):
        u = j / 8
        ang = a + 0.5 * (1 - u) * 0.6 + math.sin(phase + u * 3.0) * wave * u
        d = 0.12 + u * L
        pts.append((math.cos(ang) * d, -math.sin(ang) * d, 0.05 * math.sin(u * 3 + phase) - 0.05 * u))
        rad.append(r * (1 - 0.7 * u))
    return O.tube(name, pts, rad, m=m, res=3, segs=6)

def render_cloud():
    mn.reset()
    M, objs, pods, hairs = build_cloud()
    scene = bpy.context.scene
    # hair is rebuilt per frame (curves): render frame by frame through one canvas
    frames = []
    for f in FR:
        ph = (f - 1) / len(FR) * math.tau
        hs = [feeler(f'feeler{f}_{i}', a, L, r, ph + i * 1.3, 0.25, M['hair']) for i, (a, L, r) in enumerate(hairs)]
        for h in hs: h.hide_render = True
        frames.append(hs)
    # pods breathe (staggered) by keyframed scale around their centres
    for (parts, c, i) in pods:
        for o in parts:
            o.data.transform(__import__('mathutils').Matrix.Translation(-(c))); o.location = c
    for f in FR:
        scene.frame_set(f)
        ph = (f - 1) / len(FR) * math.tau
        for (parts, c, i) in pods:
            s = 1 + 0.07 * math.sin(ph + i * 1.9)
            for o in parts:
                o.scale = (s, s, s); o.keyframe_insert('scale', frame=f)
        for j, hs in enumerate(frames):
            for h in hs:
                h.hide_render = (j != f - 1); h.keyframe_insert('hide_render', frame=f)
    mn.outline([o for o in objs if not o.name.endswith('_tip')], thickness=0.01)
    for hs in frames: mn.outline(hs, thickness=0.006)
    allo = objs + [h for hs in frames for h in hs]
    for o in allo:
        if o.animation_data and o.animation_data.action:
            for fc in getattr(o.animation_data.action, 'fcurves', []):
                for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'
    mn.render('organic/spore_cloud', objs=allo, frames=FR)
    # a single pod (the spore the mother's tongue carries)
    mn.reset(); M = pod_mats()
    p = spore_pod('pod', M, M['purple'], 0.14, (0, 0, 0), (0.3, -0.3, 1))
    mn.outline(p[:1], thickness=0.01)
    mn.render('organic/spore_pod', objs=p)

# ---------------------------------------------------------------------------------------------------------
# Barnacles
# ---------------------------------------------------------------------------------------------------------
def shell(name, r, h, m, inner, seed, plates=6):
    """A barnacle cone: a ring of ridged wall plates around an opening, the opening dark/glowing."""
    rnd = random.Random(seed)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    n, rings = 48, 7
    rows = []
    for j in range(rings + 1):
        v = j / rings; rr = r * (1 - 0.55 * v ** 0.8); z = h * v
        row = []
        for i in range(n):
            a = i / n * math.tau
            ridge = 1 + 0.12 * max(0, math.cos(a * plates + seed)) ** 3 + 0.05 * math.sin(a * 17 + seed * 3)
            row.append(bm.verts.new((math.cos(a) * rr * ridge, math.sin(a) * rr * ridge, z)))
        rows.append(row)
    for j in range(rings):
        for i in range(n):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % n], rows[j + 1][(i + 1) % n], rows[j + 1][i]))
    # inner wall going down into the opening
    rin = []
    for i in range(n):
        a = i / n * math.tau; rr = r * 0.45 * 0.8
        rin.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, h * 0.55)))
    for i in range(n):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % n], rin[(i + 1) % n], rin[i]))
    bot = bm.faces.new(rin[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    o.data.materials.append(inner); o.data.polygons[-1].material_index = 1
    mn.smooth(o)
    md = o.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1
    return O.bake(o)

def barnacle(stage, variant, M, drain_phase=None):
    """stage 0..3 -> list of objects. Footprint: r = 5 + 9k px with k = stage / 3."""
    rnd = random.Random(variant * 31 + 7)
    k = stage / 3; r = (5 + 9 * k) / 48
    base = rnd.uniform(0, math.tau)
    objs, cirri = [], []
    if stage == 0:                                  # fresh spores stuck to the hull: glistening buds in a slime film
        film = O.blob('film', [((0, 0, 0), r * 1.6, (1.2, 1, 0.15))], m=M['slime'], res=0.01); O.cut_below(film); objs.append(film)
        for i in range(5):
            a = base + i / 5 * math.tau; d = r * 0.6
            objs.append(mn.sphere(f'bud{i}', r * (0.45 + 0.15 * (i % 2)), loc=(math.cos(a) * d, math.sin(a) * d, 0.0), m=M['bud'], scale=(1, 1, 0.8), segs=20))
            objs.append(mn.sphere(f'budtip{i}', r * 0.15, loc=(math.cos(a) * d, math.sin(a) * d, r * 0.38), m=M['budtip'], segs=10))
        return objs, cirri
    grown = stage == 3
    for i in range(5):                              # the game's cluster: 5 cones at 0.5 r, radius 0.5 / 0.7 r
        a = base + i / 5 * math.tau; d = r * 0.5 + rnd.uniform(-0.01, 0.01)
        rr = r * (0.5 + 0.2 * (i % 2)) * rnd.uniform(0.9, 1.05)
        h = rr * (0.9 + 0.3 * rnd.random()) * (1.1 if grown else 0.9)
        sh = shell(f'shell{i}', rr, h, M['shell3' if grown else 'shell'], M['inner3' if grown else 'inner'], seed=i + variant * 5)
        sh.location = (math.cos(a) * d, math.sin(a) * d, -0.01)
        sh.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 6))
        objs.append(sh)
        if grown:                                   # the grown ones feed: feathery cirri out of the opening
            top = Vector((math.cos(a) * d, math.sin(a) * d, h * 0.9))
            out_dir = Vector((math.cos(a), math.sin(a), 0))
            cirri.append((top, out_dir, rr, i))
    # crust of mucus around the base
    film = O.blob('film', [((math.cos(base + i / 5 * math.tau) * r * 0.5, math.sin(base + i / 5 * math.tau) * r * 0.5, 0), r * 0.75, (1, 1, 0.18)) for i in range(5)],
                  m=M['crust'], res=0.01)
    O.cut_below(film); objs.append(film)
    return objs, cirri

def cirrus(name, top, out_dir, rr, phase, ext, m):
    """A curled feeding arm with fine side hairs: sweeps out (ext 1) and curls back in (ext 0)."""
    pts, rad = [], []
    for j in range(8):
        u = j / 7
        curl = (1 - ext) * 2.6 * u + 0.3
        p = top + out_dir * (math.sin(curl) * rr * 1.6 * u * (0.6 + ext)) + Vector((0, 0, math.cos(curl) * rr * 1.4 * u * (0.5 + ext)))
        pts.append(tuple(p)); rad.append(rr * 0.09 * (1 - 0.7 * u))
    return O.tube(name, pts, rad, m=m, res=3, segs=6)

def barnacle_mats():
    return dict(
        shell=O.flesh('shell', '#a89a7a', '#d8ccaa', c2='#4a3d2a', scale=8, rough=0.6, coat=0.1, sss=0.05, bump=0.6),
        shell3=O.flesh('shell3', '#8a6aa8', '#b49ad0', c2='#2a1838', veins='#e0b0ff', vein_k=0.35, scale=8, rough=0.5, coat=0.3, sss=0.1, bump=0.6),
        inner=O.plain('inner', '#3a2a48', 0.6),
        inner3=O.emit_mat('inner3', '#c070ff', 1.3, base='#3a1a58'),
        crust=O.flesh('crust', '#6a5a48', '#8a7a5a', scale=6, coat=0.6, rough=0.3, sss=0.1),
        bud=O.glossy_glow('bud', '#a89a7a', '#f0ffd0', 0.6),
        budtip=O.emit_mat('budtip', '#f0ffd0', 1.2),
        slime=O.slime_mat('film', '#b8d890', glow=0.1),
        cirri=O.glossy_glow('cirri', '#d8b0ff', '#e8c8ff', 0.9, sss=0.2),
    )

def render_barnacles():
    for variant in (0, 1):
        for stage in range(4):
            mn.reset(); M = barnacle_mats()
            objs, cirri = barnacle(stage, variant, M)
            mn.outline([o for o in objs if not o.name.startswith(('film', 'budtip'))], thickness=0.008)
            if stage < 3:
                mn.render(f'organic/barnacle_s{stage}_v{variant}', objs=objs)
                continue
            # still (cirri tucked in) and the draining loop
            mn.render(f'organic/barnacle_s3_v{variant}', objs=objs)
            scene = bpy.context.scene; F = list(range(1, 7)); sets = []
            inner = M['inner3'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
            for f in F:
                ph = (f - 1) / len(F) * math.tau; ext = 0.5 - 0.5 * math.cos(ph)
                cs = [cirrus(f'cir{f}_{i}', top, d, rr, ph, ext, M['cirri']) for (top, d, rr, i) in cirri]
                for c in cs: c.hide_render = True
                mn.outline(cs, thickness=0.005); sets.append(cs)
            for f in F:
                scene.frame_set(f); ph = (f - 1) / len(F) * math.tau
                inner.default_value = 1.0 + 0.5 * (0.5 - 0.5 * math.cos(ph)); inner.keyframe_insert('default_value', frame=f)
                for j, cs in enumerate(sets):
                    for c in cs: c.hide_render = j != f - 1; c.keyframe_insert('hide_render', frame=f)
            allo = objs + [c for cs in sets for c in cs]
            mn.render(f'organic/barnacle_s3_v{variant}_drain', objs=allo, frames=F)

if __name__ == '__main__':
    T = time.time()
    sel = [a for a in O.ARGS if a not in ('quick', 'cpu')]
    if not sel or 'cloud' in sel: render_cloud()
    if not sel or 'barnacle' in sel: render_barnacles()
    print(f'[spores] total {time.time() - T:.1f}s')
