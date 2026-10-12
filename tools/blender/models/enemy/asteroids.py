"""Asteroids (js/enemies.js makeAsteroid / drawAsteroidBody, js/combat.js) and the ore asteroid (js/dock.js dk.rock).

Sprites (assets/sprites/enemy/), origin = the asteroid's centre (a.x, a.y), z = 0 its middle plane:
  asteroid_big<k>_d<i>        big rock k = 0..2 (game r = 2.2), 48 turn steps; i picks the angle i * 7.5 deg
  asteroid_big<k>_crack_d<i>  its molten fissure (the weak spot), same steps, rock as holdout. The fissure sits at
                              rock-local angle 0, so the game should pick BOTH sprites with i = round((a.rot + a.crackA)
                              / 7.5 deg) mod 48 (the rock shape is random anyway; only the crack's angle matters). Each
                              step has the fissure re-laid where the camera ray through the game's crack point
                              crackPos() (r * 0.72 out, at z = 0) meets the rock, so it always covers the hit circle
                              (r 0.4) on screen; the glow halo is in the beauty pass only.
  asteroid_small<k>_d<i>      small rock k = 0..2 (game r = 1.0), 32 turn steps (i = round(a.rot / 11.25 deg)),
                              shot through with glowing hot veins (rendered in, they turn with it)
  ore_rock                    the ore asteroid ("living rock", game r = 2.2, drawn at fixed angle 0.3): cyan ore
                              crystals where the game draws its five glowing dots, lichen and moss
  ore_rock_glow               the crystals' glow alone (rock as holdout), for the game to pulse with alpha

Turn direction: index i shows the rock turned by game angle +i*step (clockwise on screen, like ctx.rotate).
Left to the game: the damage cracks from body hits (a.damage, random angles; draw them as now, but squashed by
sin 50 deg in y and lifted to the rock's top, or skip them), the hit flash (tint the sprite), dust, the drop shadow.

    blender -b --factory-startup --python tools/blender/models/enemy/asteroids.py [-- draft] [-- big|small|ore] [-- k0] [-- cracksonly]
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enemylib as el
from enemylib import P, mn, ic, bpy, bmesh, Vector
from mathutils import noise

ARGS = el.ARGS
WHAT = [w for w in ('big', 'small', 'ore') if w in ARGS] or ['big', 'small', 'ore']
ONLY = [int(a[1:]) for a in ARGS if a.startswith('k') and a[1:].isdigit()]
BIG_DIRS, SMALL_DIRS = 48, 32
if 'draft' in ARGS and 'alldirs' not in ARGS: BIG_DIRS, SMALL_DIRS = 8, 8

BIG_PAL = ('#8d8274', '#6e6359', '#4c433c')
SMALL_PAL = ('#9a8e80', '#776b5f', '#544a40')

# ---------------------------------------------------------------------------------------------------------
def rock_mat(name, pal, veins=False, lichen=False):
    """Rock: three palette tones mixed by noise, darker in crevices, pale dust on top; optional hot veins / lichen."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.88
    tc = N.new('ShaderNodeTexCoord')
    n1 = N.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 2.6; n1.inputs['Detail'].default_value = 8; n1.inputs['Roughness'].default_value = 0.55
    Lk(tc.outputs['Object'], n1.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    cr.elements[0].position = 0.35; cr.elements[0].color = (*el.lift(pal[2]), 1)
    cr.elements[1].position = 0.65; cr.elements[1].color = (*el.lift(pal[0]), 1)
    e = cr.elements.new(0.5); e.color = (*el.lift(pal[1]), 1)
    Lk(n1.outputs['Fac'], ramp.inputs[0])
    # fine speckle
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 22; n2.inputs['Detail'].default_value = 4; Lk(tc.outputs['Object'], n2.inputs['Vector'])
    sp = N.new('ShaderNodeMix'); sp.data_type = 'RGBA'; sp.blend_type = 'OVERLAY'; sp.inputs[0].default_value = 0.35
    Lk(ramp.outputs[0], sp.inputs[6]); Lk(n2.outputs['Color'], sp.inputs[7])
    # crevices darker (AO)
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.35; ao.samples = 8
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.8; Lk(aoi.outputs[0], aok.inputs[0])
    dk = N.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; Lk(aok.outputs[0], dk.inputs[0])
    Lk(sp.outputs[2], dk.inputs[6]); dk.inputs[7].default_value = (0.12, 0.1, 0.09, 1)
    geo0 = N.new('ShaderNodeNewGeometry')         # ridges catch light, pits stay dark (pointiness)
    pt = N.new('ShaderNodeMapRange'); pt.inputs['From Min'].default_value = 0.47; pt.inputs['From Max'].default_value = 0.56
    pt.inputs['To Min'].default_value = -0.35; pt.inputs['To Max'].default_value = 0.18; Lk(geo0.outputs['Pointiness'], pt.inputs['Value'])
    ptp = N.new('ShaderNodeMath'); ptp.operation = 'MAXIMUM'; ptp.inputs[1].default_value = 0.0; Lk(pt.outputs[0], ptp.inputs[0])
    ptn = N.new('ShaderNodeMath'); ptn.operation = 'MINIMUM'; ptn.inputs[1].default_value = 0.0; Lk(pt.outputs[0], ptn.inputs[0])
    ptn2 = N.new('ShaderNodeMath'); ptn2.operation = 'MULTIPLY'; ptn2.inputs[1].default_value = -1.0; Lk(ptn.outputs[0], ptn2.inputs[0])
    hi = N.new('ShaderNodeMix'); hi.data_type = 'RGBA'; Lk(ptp.outputs[0], hi.inputs[0]); Lk(dk.outputs[2], hi.inputs[6]); hi.inputs[7].default_value = (*mn.hex_rgb('#b0a490'), 1)
    lo = N.new('ShaderNodeMix'); lo.data_type = 'RGBA'; Lk(ptn2.outputs[0], lo.inputs[0]); Lk(hi.outputs[2], lo.inputs[6]); lo.inputs[7].default_value = (0.05, 0.045, 0.04, 1)
    col = lo.outputs[2]
    if lichen:                                    # living rock: purple-green lichen in blotches, mostly on top
        n3 = N.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 5.5; n3.inputs['Detail'].default_value = 12; Lk(tc.outputs['Object'], n3.inputs['Vector'])
        lm = N.new('ShaderNodeMapRange'); lm.inputs['From Min'].default_value = 0.6; lm.inputs['From Max'].default_value = 0.66
        Lk(n3.outputs['Fac'], lm.inputs['Value'])
        nz = N.new('ShaderNodeSeparateXYZ'); geo = N.new('ShaderNodeNewGeometry'); Lk(geo.outputs['Normal'], nz.inputs[0])
        up = N.new('ShaderNodeMapRange'); up.inputs['From Min'].default_value = -0.2; up.inputs['From Max'].default_value = 0.6; Lk(nz.outputs['Z'], up.inputs['Value'])
        lk = N.new('ShaderNodeMath'); lk.operation = 'MULTIPLY'; Lk(lm.outputs[0], lk.inputs[0]); Lk(up.outputs[0], lk.inputs[1])
        lc = N.new('ShaderNodeMix'); lc.data_type = 'RGBA'; Lk(n2.outputs['Fac'], lc.inputs[0])
        lc.inputs[6].default_value = (*mn.hex_rgb('#5a3a6a'), 1); lc.inputs[7].default_value = (*mn.hex_rgb('#4a6a34'), 1)
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; Lk(lk.outputs[0], mix.inputs[0]); Lk(col, mix.inputs[6]); Lk(lc.outputs[2], mix.inputs[7])
        col = mix.outputs[2]
    Lk(col, b.inputs['Base Color'])
    if veins:                                     # hot veins: voronoi cell edges, thinned and masked by noise
        vo = N.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 1.5; vo.inputs['Randomness'].default_value = 1.0; Lk(tc.outputs['Object'], vo.inputs['Vector'])
        vw = N.new('ShaderNodeMapRange'); vw.inputs['From Min'].default_value = 0.045; vw.inputs['From Max'].default_value = 0.012; Lk(vo.outputs['Distance'], vw.inputs['Value'])
        n4 = N.new('ShaderNodeTexNoise'); n4.inputs['Scale'].default_value = 1.8; n4.inputs['Detail'].default_value = 3; Lk(tc.outputs['Object'], n4.inputs['Vector'])
        vm = N.new('ShaderNodeMapRange'); vm.inputs['From Min'].default_value = 0.5; vm.inputs['From Max'].default_value = 0.58; Lk(n4.outputs['Fac'], vm.inputs['Value'])
        vk = N.new('ShaderNodeMath'); vk.operation = 'MULTIPLY'; Lk(vw.outputs[0], vk.inputs[0]); Lk(vm.outputs[0], vk.inputs[1])
        hot = N.new('ShaderNodeMix'); hot.data_type = 'RGBA'; Lk(vw.outputs[0], hot.inputs[0])
        hot.inputs[6].default_value = (*mn.hex_rgb('#e8601c'), 1); hot.inputs[7].default_value = (*mn.hex_rgb('#ffd278'), 1)
        Lk(hot.outputs[2], b.inputs['Emission Color'])
        st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 2.2; Lk(vk.outputs[0], st.inputs[0])
        Lk(st.outputs[0], b.inputs['Emission Strength'])
        dv = N.new('ShaderNodeMix'); dv.data_type = 'RGBA'; Lk(vk.outputs[0], dv.inputs[0]); Lk(col, dv.inputs[6]); dv.inputs[7].default_value = (0.1, 0.03, 0.01, 1)
        Lk(dv.outputs[2], b.inputs['Base Color'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; Lk(n2.outputs['Fac'], bump.inputs['Height'])
    Lk(bump.outputs['Normal'], b.inputs['Normal'])
    return m

def make_rock(name, r, seed, m, flat=0.68, lumps=0.16, craters=5, facets=4, subdiv=6):
    """A lumpy, faceted, cratered potato around the origin: mean footprint radius ~0.9 r (the game's lump outline
    runs 0.7..1.09 r; body hits count within 0.9 r), flattened to `flat` in height."""
    rnd = random.Random(seed)
    off = Vector((rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50)))
    cr = []
    for _ in range(craters):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized()
        cr.append((d, rnd.uniform(0.14, 0.34), rnd.uniform(0.06, 0.12)))
    cuts = []
    for _ in range(facets):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.6, 0.8))).normalized()
        cuts.append((d, rnd.uniform(0.82, 0.92)))
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        rad = 0.9 * (1 + lumps * noise.fractal(d * 1.1 + off, 0.7, 2.0, 3) + 0.06 * noise.noise(d * 3 + off) + 0.03 * noise.ridged_multi_fractal(d * 6 + off, 0.9, 2.0, 3, 0.5, 1.5) - 0.02)
        for c, cr_, dep in cr:
            a = d.angle(c)
            if a < cr_: rad -= dep * (1 - (a / cr_) ** 2)
            elif a < cr_ * 1.35: rad += dep * 0.35 * math.sin((a - cr_) / (0.35 * cr_) * math.pi)
        p = d * rad
        for n, k in cuts:
            h = p.dot(n)
            if h > k: p -= n * (h - k) * 0.95
        p.z *= flat
        v.co = p * r
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); mn.smooth(o)
    return o

def ribbon(name, pts, width, lift_, m, surf):
    """A flat strip following ground-plane points pts (Blender x, y at z=0) laid on the surface seen through them."""
    samples = []
    for i in range(len(pts) - 1):
        for k in range(8):
            t = k / 8; samples.append(pts[i].lerp(pts[i + 1], t))
    samples.append(pts[-1])
    hits = [h for h in (surf(p.x, p.y) for p in samples) if h[0] is not None]   # (a crack tip past the rim: dropped)
    if len(hits) < 2: return None
    verts, faces = [], []
    for i, (p, n) in enumerate(hits):
        a = hits[max(0, i - 1)][0]; b = hits[min(len(hits) - 1, i + 1)][0]
        t = (b - a).normalized(); w = n.cross(t).normalized()
        taper = 0.55 + 0.45 * math.sin(math.pi * (i / (len(hits) - 1)))
        q = p + n * lift_
        verts += [q + w * width / 2 * taper, q - w * width / 2 * taper]
        if i: faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    return el.mesh_from(name, verts, faces, m)

CRACK = [(-0.55, -0.1), (-0.2, 0.12), (0.0, -0.15), (0.25, 0.1), (0.5, -0.05)]   # drawAsteroidBody, around cx = r * 0.72

def render_big(k, seed):
    mn.reset(); mn._mats.clear(); el.side('port')
    r = 2.2
    rock = make_rock(f'big{k}', r, seed, rock_mat('rock', BIG_PAL), flat=0.66, lumps=0.15, craters=10, facets=8)
    mn.outline([rock], thickness=0.02)
    root = mn.group('root', [rock])
    t0 = time.time()
    if 'cracksonly' not in ARGS: mn.render(f'enemy/asteroid_big{k}', objs=[rock], root=root, dirs=BIG_DIRS)
    print(f'[asteroids] big{k} rock: {time.time() - t0:.1f}s'); t0 = time.time()
    # the fissure, re-laid for every turn step
    groove = el.emit_mat('crack_dark', '#3a1408', 0.4, base='#1a1614')
    lava = el.emit_mat('lava', '#ff5a10', 1.1, base='#c83a08')
    core = el.emit_mat('lava_core', '#ffb040', 2.2, base='#ffc060')
    halo = el.halo_mat('lava_halo', '#ff7a28', 1.6)
    rock.is_holdout = True
    rock.modifiers.remove(rock.modifiers['outline'])          # (its shell would cover the fissure at grazing angles)
    built = []
    def setup_dir(d):
        def setup(kind):
            nonlocal built
            if kind not in (None, 'beauty') and built:          # same geometry for the data passes: only hide the halo
                built[-1].hide_render = True; return
            el.delete(built); built = []
            th = d * math.tau / BIG_DIRS
            root.rotation_euler.z = -th; bpy.context.view_layer.update()
            bvh = el.make_bvh([rock])
            def surf(x, y):
                p, n = el.raycast_down_view(None, x, y, bvh)
                return (p, n) if p is not None else (None, None)
            cx = r * 0.72
            def g(u, v):                                       # crack-frame (u along the radius) -> Blender ground
                gx, gy = math.cos(th) * (cx + u) - math.sin(th) * v, math.sin(th) * (cx + u) + math.cos(th) * v
                return Vector((gx, -gy, 0))
            pts = [g(u, v) for u, v in CRACK]
            for nm, w, lf, m in (('crack_groove', 0.34, 0.012, groove), ('crack_lava', 0.2, 0.022, lava), ('crack_core', 0.08, 0.03, core)):
                o = ribbon(nm, pts, w, lf, m, surf)
                if o: built.append(o)
            # a few short side fissures
            for (u0, v0, u1, v1) in ((-0.2, 0.12, -0.12, 0.32), (0.25, 0.1, 0.38, 0.28), (0.0, -0.15, 0.1, -0.33)):
                o = ribbon('crack_branch', [g(u0, v0), g(u1, v1)], 0.07, 0.024, lava, surf)
                if o: built.append(o)
            cp, cn = surf(*g(0, 0).xy)
            hd = el.disc('halo', 0, 0, 0, 0.95, halo); hd.location = cp + cn * 0.05
            hd.rotation_euler = cn.to_track_quat('Z', 'Y').to_euler(); built.append(hd)
            hd.hide_render = kind not in (None, 'beauty')
        return setup
    el.render_states(f'enemy/asteroid_big{k}_crack', [(f'_d{d}', setup_dir(d)) for d in range(BIG_DIRS)], lambda: built, dirs=BIG_DIRS)
    print(f'[asteroids] big{k} crack: {time.time() - t0:.1f}s')

def render_small(k, seed):
    mn.reset(); mn._mats.clear()
    rock = make_rock(f'small{k}', 1.0, seed, rock_mat('rock_s', SMALL_PAL, veins=True), flat=0.72, lumps=0.2, craters=4, facets=6, subdiv=5)
    mn.outline([rock], thickness=0.016)
    root = mn.group('root', [rock])
    t0 = time.time()
    mn.render(f'enemy/asteroid_small{k}', objs=[rock], root=root, dirs=SMALL_DIRS)
    print(f'[asteroids] small{k}: {time.time() - t0:.1f}s')

def render_ore():
    mn.reset(); mn._mats.clear(); el.side('port')
    r = 2.2
    rock = make_rock('ore', r, 4242, rock_mat('rock_ore', BIG_PAL, lichen=True), flat=0.7, lumps=0.14, craters=7, facets=7)
    rock.rotation_euler.z = -0.3; bpy.context.view_layer.update(); el.apply_tf(rock)
    bvh = el.make_bvh([rock])
    cry = el.emit_mat('ore_crystal', '#7af0ff', 1.6, base='#3ac8e8')
    cry2 = el.emit_mat('ore_crystal_core', '#d8ffff', 3.0, base='#a0f8ff')
    glow = el.halo_mat('ore_halo', '#7af0ff', 2.0)
    rnd = random.Random(7)
    crystals, halos = [], []
    for i in range(5):                                         # dk.rock's dots: (cos(1.3 i) * 1.2, sin(1.3 i) * 1.1) world
        gx, gy = math.cos(i * 1.3) * 1.2, math.sin(i * 1.3) * 1.1
        p, n = el.raycast_down_view(None, gx, -gy, bvh)
        if p is None: continue
        for j in range(5):                                     # a cluster of hexagonal crystal prisms along the normal
            tilt = Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), rnd.uniform(-0.2, 0.2)))
            ax = (n + tilt).normalized(); L = rnd.uniform(0.26, 0.42) * (1.3 if j == 0 else 1.0); w = rnd.uniform(0.07, 0.1)
            base = p + Vector((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), 0)) - ax * 0.04
            c = mn.cyl('crystal', w, L, loc=(0, 0, 0), m=cry if j else cry2, verts=6, bevel=0.008)
            tip = [v for v in c.data.vertices if v.co.z > L - 1e-4]
            for v in tip: v.co.x *= 0.35; v.co.y *= 0.35; v.co.z += w * 0.8
            c.location = base; c.rotation_euler = ax.to_track_quat('Z', 'Y').to_euler(); crystals.append(c)
        hd = el.disc('ore_halo', 0, 0, 0, 0.5, glow); hd.location = p + n * 0.06; hd.rotation_euler = n.to_track_quat('Z', 'Y').to_euler(); halos.append(hd)
    mn.outline([rock], thickness=0.02); mn.outline(crystals, thickness=0.008)
    t0 = time.time()
    el.show(halos, False)
    mn.render('enemy/ore_rock', objs=[rock] + crystals)
    rock.is_holdout = True
    el.render_poi('enemy/ore_rock_glow', crystals, [rock], halos)
    print(f'[asteroids] ore rock: {time.time() - t0:.1f}s')

if __name__ == '__main__':
    T = time.time()
    if 'big' in WHAT:
        for k, seed in enumerate((11, 23, 37)):
            if not ONLY or k in ONLY: render_big(k, seed)
    if 'small' in WHAT:
        for k, seed in enumerate((101, 113, 127)):
            if not ONLY or k in ONLY: render_small(k, seed)
    if 'ore' in WHAT: render_ore()
    print(f'[asteroids] total {time.time() - T:.1f}s')
