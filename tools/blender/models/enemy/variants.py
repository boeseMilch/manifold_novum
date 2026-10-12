"""The interceptor's variants, finished (js/encounters.js ENEMY_TYPES.stealth / .tractor, js/dock.js .pirate).

They share the interceptor hull, weak spots and turret (interceptor.py); this script rebuilds the hull, repaints
it and adds what each variant draws on top in the game (its D.draw), then re-renders the variant hulls:

  pirate_<side>                 black-and-gold hull + welded scrap patches, the flag pole, the claw's mount
  pirate_<side>_flag_f<i>       the skull-and-crossbones flag fluttering, 6-frame loop (hull as holdout)
  pirate_<side>_claw_f<i>       the docking claw's two jaws, 5 opening steps: open = 0.1 + 0.1 * i rad
                                (game: open = 0.3 + 0.2 * sin(3t) -> i = round((open - 0.1) / 0.1))
  tractor_<side>                work-yard yellow hull + wing hazard stripes + the emitter mast (solid box
                                2.3..2.8 x 1.6..1.9) and the emitter's collar
  tractor_<side>_emitter_<ok|hit>  the tractor emitter weak spot (circle 3.1, 1.75, r 0.34), hull as holdout
  stealth_<side>                matte black-blue, no bright decals, gold-tinted canopy, faint cloak-emitter studs

Same local frame and conventions as interceptor.py (z = 0 is the weak-spot plane; side = port | star).

    blender -b --factory-startup --python tools/blender/models/enemy/variants.py [-- draft] [-- port] [-- pirate|tractor|stealth]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enemylib as el
from enemylib import P, prism, lbox, disc, mn, ic, bpy, Vector
import numpy as np

ARGS = el.ARGS
SIDES = [s for s in ('port', 'star') if s in ARGS] or ['port', 'star']
VARIANTS = [v for v in ('pirate', 'tractor', 'stealth') if v in ARGS] or ['pirate', 'tractor', 'stealth']
EMITTER = (3.1, 1.75, 0.34)

# ---------------------------------------------------------------------------------------------------------
# Pirate raider
# ---------------------------------------------------------------------------------------------------------
def skull_image():
    """Skull and crossbones, white on black, as a mask image (drawn with numpy)."""
    W, H = 256, 136
    img = bpy.data.images.new('skull', W, H, alpha=False)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    m = np.zeros((H, W), np.float32)
    def seg(ax, ay, bx, by, r):
        dx, dy = bx - ax, by - ay; k = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        return np.hypot(x - ax - dx * k, y - ay - dy * k) < r
    def circ(cx, cy, r): return np.hypot(x - cx, y - cy) < r
    for (ax, ay, bx, by) in ((84, 22, 172, 96), (84, 96, 172, 22)):          # crossbones (behind)
        m[seg(ax, ay, bx, by, 7)] = 1
        for (px, py) in ((ax, ay), (bx, by)):
            nx, ny = (bx - ax), (by - ay); L = math.hypot(nx, ny); nx, ny = -ny / L * 6, nx / L * 6
            m[circ(px + nx, py + ny, 7)] = 1; m[circ(px - nx, py - ny, 7)] = 1
    m[circ(128, 78, 30)] = 1                                                  # cranium
    m[(abs(x - 128) < 17) & (y > 46) & (y < 66)] = 1                          # jaw
    m[circ(116, 80, 8.5)] = 0; m[circ(140, 80, 8.5)] = 0                     # eyes
    m[(abs(x - 128) < 3.5 - (y - 60) * 0.35) & (y > 60) & (y < 70)] = 0      # nose
    for k in range(4): m[(abs(x - (119 + k * 6)) < 1.2) & (y > 46) & (y < 58)] = 0   # teeth
    # frayed, grimy cloth: noise darkens the white a bit
    rng = np.random.default_rng(3); m *= 0.85 + 0.15 * rng.random((H, W)).astype(np.float32)
    px = np.ones((H, W, 4), np.float32); px[..., 0] = px[..., 1] = px[..., 2] = m
    img.pixels.foreach_set(px.ravel()); img.pack()
    return img

def flag_mat():
    m = bpy.data.materials.new('flag'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.9
    tx = N.new('ShaderNodeTexImage'); tx.image = skull_image(); tx.extension = 'CLIP'
    uv = N.new('ShaderNodeUVMap'); Lk(uv.outputs[0], tx.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(tx.outputs['Color'], mx.inputs[0])
    mx.inputs[6].default_value = (*mn.hex_rgb('#1a1a20'), 1); mx.inputs[7].default_value = (*el.lift('#e8e4dc'), 1)
    Lk(mx.outputs[2], b.inputs['Base Color'])
    return m

FLAG_FRAMES = 6
POLE = (-0.24, 1.88)
def build_flag(M):
    nu, nv = 28, 12
    verts, faces, uvs = [], [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            verts.append((0, 0, 0))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    o = el.mesh_from('flag', verts, faces, M['flag'])
    uvl = o.data.uv_layers.new(name='UVMap')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            vi = o.data.loops[li].vertex_index; i, j = vi % (nu + 1), vi // (nu + 1)
            u = i / nu
            uvl.data[li].uv = ((1 - u) if ic.S > 0 else u, j / nv)       # skull reads the right way round on screen
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = 0
    mn.smooth(o)
    def pose(f):
        ph = f / FLAG_FRAMES
        for vi, v in enumerate(o.data.vertices):
            i, j = vi % (nu + 1), vi // (nu + 1); u, w = i / nu, j / nv
            wave = 0.085 * (0.25 + u) * math.sin(math.tau * (1.4 * u - ph) + 0.6 * w)
            lx = POLE[0] - 0.03 - u * 0.8
            z = 0.6 + w * 0.48 - 0.07 * u * u + 0.025 * u * math.sin(math.tau * (u - ph) + 1.0)
            v.co = P(lx, POLE[1] + wave, z)
        o.data.update()
    pose(0)
    return o, pose

CLAW_HINGE = (-2.04, 0.85)
CLAW_OPEN = [0.1, 0.2, 0.3, 0.4, 0.5]
def build_claw(M, open_):
    parts = []
    for sd in (-1, 1):
        prof = [(0.0, 0.0), (0.38, 0.02), (0.54, 0.1), (0.6, 0.24), (0.5, 0.26), (0.44, 0.15), (0.32, 0.13), (0.04, 0.16)]
        th = sd * open_ + math.pi
        c, s = math.cos(th), math.sin(th)
        pts = [(CLAW_HINGE[0] + u * c - (sd * w) * s, CLAW_HINGE[1] + u * s + (sd * w) * c) for u, w in prof]
        parts.append(prism(f'jaw{sd}', pts, -0.15, -0.01, M['clawsteel'], bevel=0.018))
        # a tooth at the tip and a hazard band near the hinge
        tip = pts[3]
        parts.append(mn.sphere('jawtooth', 0.03, loc=P(tip[0], tip[1], -0.08), m=M['gun'], segs=10))
        u0, u1 = 0.1, 0.2
        band = [(CLAW_HINGE[0] + u * c - (sd * w) * s, CLAW_HINGE[1] + u * s + (sd * w) * c) for u, w in ((u0, 0.02), (u1, 0.025), (u1, 0.14), (u0, 0.155))]
        parts.append(prism('jawband', band, -0.01, -0.004, M['stripes'], bevel=0.0))
        parts.append(mn.cyl('jawpin', 0.05, 0.17, loc=P(*CLAW_HINGE, -0.165), m=M['steel'], bevel=0.01, verts=16))
    return parts

def pirate_extras(M):
    static = []
    # Welded scrap patches (js/dock.js): (centre, size, angle) in the local frame, on the far wing and the rear deck
    for k, (px, py, w, h, a, z) in enumerate(((-0.95, 0.75, 0.42, 0.3, 0.3, 0.036), (0.2, 1.55, 0.36, 0.26, -0.2, 0.137))):
        pts = el.rot_rect(px, py, w, h, a)
        static.append(prism(f'scrap{k}', pts, z - 0.01, z + 0.022, M['scrap'], bevel=0.006))
        loop = [(x, y, z + 0.004) for x, y in pts]
        static.append(el.tube_nc(f'weld{k}', loop, 0.011, M['weld'], closed=True))
        for q in (0, 2):                                                     # two dark bolts in opposite corners
            cx, cy = pts[q][0] * 0.82 + px * 0.18, pts[q][1] * 0.82 + py * 0.18
            static.append(mn.sphere('bolt', 0.018, loc=P(cx, cy, z + 0.022), m=M['dark'], segs=10))
        # a scorched weld line across it
        static.append(disc(f'weldsoot{k}', px + 0.05, py, z + 0.024, 0.13, M['scorch'], sy=0.6))
    # a strip of duct tape holding the tail patch on too (of course)
    static.append(prism('tape', el.rot_rect(0.32, 1.45, 0.07, 0.3, -0.2 + 1.2), 0.15, 0.163, M['tape'], bevel=0.003))
    # flag pole (the flag itself is its own animated sprite)
    static.append(mn.cyl('flagpole', 0.02, 1.06, loc=P(*POLE, 0.04), m=M['steel'], verts=10, bevel=0.0))
    static.append(mn.sphere('flagknob', 0.036, loc=P(*POLE, 1.11), m=M['gold'], segs=12))
    static.append(mn.cyl('flagfoot', 0.045, 0.05, loc=P(*POLE, 0.04), m=M['gun'], bevel=0.01, verts=16))
    # claw mount on the far nacelle: hydraulic block with a piston
    static.append(lbox('clawmount', -2.06, 0.68, -1.94, 1.02, -0.16, -0.0, M['gun'], bevel=0.02))
    static.append(lbox('clawhaz', -2.065, 0.7, -2.0, 1.0, -0.02, 0.005, M['stripes'], bevel=0.0))
    static.append(el.tube_nc('piston', [(-1.85, 1.15, -0.02), (-2.0, 0.92, -0.04)], 0.022, M['steel']))
    return static

# ---------------------------------------------------------------------------------------------------------
# Tractor tug
# ---------------------------------------------------------------------------------------------------------
def tractor_extras(M):
    static = []
    for (x0, y0) in ((-1.45, 0.25), (1.0, 0.25)):                            # wing hazard stripes (game: 0.45 x 0.22)
        static.append(lbox('wing_haz', x0, y0, x0 + 0.45, y0 + 0.22, -0.01, 0.047, M['stripes'], bevel=0.006))
    # emitter mast: a boxy boom off the radiator housing's tail (the game's solid box 2.3..2.8 x 1.6..1.9)
    static.append(lbox('mast', 2.25, 1.6, 2.86, 1.9, -0.16, 0.02, M['gunl'], bevel=0.025))
    static.append(lbox('mast_haz', 2.4, 1.62, 2.74, 1.88, 0.02, 0.03, M['stripes'], bevel=0.0))
    static.append(lbox('mast_brace', 2.3, 1.45, 2.42, 1.62, -0.14, -0.04, M['gun'], bevel=0.015))
    ex, ey, er = EMITTER
    static.append(mn.cyl('emit_collar', er + 0.07, 0.12, loc=P(ex, ey, -0.14, comp=True), m=M['gun'], bevel=0.02, verts=48))
    static.append(mn.cyl('emit_ring', er + 0.035, 0.035, loc=P(ex, ey, -0.03, comp=True), m=M['steel'], bevel=0.01, verts=48))
    for k in range(6):
        a = k * math.pi / 3 + 0.3
        static.append(mn.sphere('emit_bolt', 0.016, loc=P(ex + math.cos(a) * (er + 0.05), ey + math.sin(a) * (er + 0.05), 0.005, comp=True), m=M['steel'], segs=8))
    # amber work beacon on the boom
    static.append(mn.cyl('beacon_base', 0.045, 0.04, loc=P(2.55, 1.75, 0.03), m=M['gun'], bevel=0.008, verts=16))
    static.append(mn.sphere('beacon', 0.04, loc=P(2.55, 1.75, 0.08), m=M['amber'], segs=16))
    return static

def tractor_emitter(M):
    ex, ey, er = EMITTER
    def dome(name, r, z0, h, m):
        o = mn.sphere(name, 1.0, loc=P(ex, ey, z0, comp=True), m=m, scale=(r, r, h), segs=64)
        bpy.context.view_layer.update(); el.apply_tf(o)
        bm = el.bmesh.new(); bm.from_mesh(o.data)                          # keep the upper half
        el.bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z0 - 1e-4], context='VERTS'); bm.to_mesh(o.data); bm.free()
        return o
    ok = [dome('lens', er, -0.03, 0.09, M['blue'])]
    for r in (0.24, 0.12):
        ring = el.tube_nc('lensring', [(ex + math.cos(a) * r, ey + math.sin(a) * r + 0.055 * COT, 0.055) for a in
                                      [i / 40 * math.tau for i in range(40)]], 0.012, M['dark'], closed=True)
        ok.append(ring)
    ok.append(dome('lenscore', er * 0.45, 0.0, 0.1, M['bluel']))
    hit = [dome('lens_x', er, -0.03, 0.06, M['webglass']), dome('lenscore_x', er * 0.45, 0.0, 0.07, M['black'])]
    hit.append(mn.sphere('ember', 0.035, loc=P(ex + 0.12, ey - 0.08, 0.05, comp=True), m=M['ember'], segs=10))
    hit.append(mn.sphere('ember', 0.025, loc=P(ex - 0.15, ey + 0.1, 0.04, comp=True), m=M['ember'], segs=10))
    hit.append(disc('scorch_emit', ex, ey, 0.075, 0.33, M['scorch'], sy=1.0))
    halo = [disc('halo_emit', ex, ey, 0.12, 0.75, M['halo'], sy=1.0)]
    for o in ok + hit:
        if o.name.startswith('lens'): o['poi'] = 1
    mn.outline([o for o in ok + hit if o.name.startswith('lens') and 'ring' not in o.name], thickness=0.014)
    return ok, hit, halo

COT = el.COT

# ---------------------------------------------------------------------------------------------------------
# Stealth fighter
# ---------------------------------------------------------------------------------------------------------
def stealth_look(M):
    static = []
    for o in el.find(['tooth', 'kill', 'tag']): o.hide_render = True        # no bright decals on a stealth ship
    for name in ('paint', 'paint2', 'pod', 'pod2', 'stripe'):               # matte radar-absorbing paint
        m = bpy.data.materials.get(name)
        for n in m.node_tree.nodes:
            if n.type == 'MAP_RANGE' and any(l.to_socket.name == 'Roughness' for l in n.outputs[0].links):
                n.inputs['To Min'].default_value = 0.78; n.inputs['To Max'].default_value = 0.6
        m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.05
    g = bpy.data.materials.get('glass')                                      # gold-tinted canopy
    b = g.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb('#6a5424'), 1)
    b.inputs['Metallic'].default_value = 0.6; b.inputs['Roughness'].default_value = 0.12
    for name, k in (('nozzle', 0.45), ('nozzle_core', 0.45), ('nav_green', 0.25), ('nav_red', 0.25)):   # damped exhaust, dimmed nav lights
        b = bpy.data.materials[name].node_tree.nodes['Principled BSDF']; b.inputs['Emission Strength'].default_value *= k
    # cloak emitter studs: little dark domes with a faint cyan glow, along the wing leading edges and nacelles
    for s in (1, -1):
        for k in range(5):
            t = (k + 0.5) / 5
            x, y = 0.62 + (1.48 - 0.62) * t, -0.56 + (0.16 + 0.56) * t
            static.append(mn.sphere('cloak_stud', 0.03, loc=P(s * x, y, 0.03), m=M['cloak'], scale=(1, 1, 0.6), segs=12))
        for k in range(3):
            static.append(mn.sphere('cloak_stud', 0.03, loc=P(s * 1.72, 0.75 + k * 0.17, 0.24), m=M['cloak'], scale=(1, 1, 0.6), segs=12))
    # a thin glowing seam down the spine (the cloak's bus line)
    static.append(el.tube_nc('cloak_seam', [(0, -0.75, 0.112), (0, 0.55, 0.112)], 0.006, M['cloakdim']))
    return static

# ---------------------------------------------------------------------------------------------------------
def render_side(sd):
    hull, pois, halos = ic.build(sd)
    el.delete([o for v in pois.values() for o in v] + [o for v in halos.values() for o in v])
    M = el.standard_mats()
    M.update(scrap=worn_('scrap', '#6a5a48', 0.6, 0.4, wear=1.0, grime=1.3), weld=worn_('weld', '#8a8478', 0.4, 0.7, wear=0.4),
             gold=el.worn('gold', '#c8a040', 0.3, 0.8, wear=0.3), clawsteel=el.worn('clawsteel', '#8a8f99', 0.35, 0.6, wear=0.6),
             flag=flag_mat(), amber=el.emit_mat('amber', '#ffb030', 4.0, base='#ff9a20'),
             webglass=el.web_glass('webglass'), cloak=el.emit_mat('cloak', '#7ad8ff', 1.5, base='#1a2a38'), cloakdim=el.emit_mat('cloakdim', '#5ab0e0', 0.5, base='#141c26'))
    for v in VARIANTS:
        t0 = time.time()
        ic.set_paint(v)
        if v == 'pirate':
            for o in el.find(['tag', 'antenna']): o.hide_render = True        # (painted over; the flag pole replaces the antenna)
            static = pirate_extras(M); mn.outline(static, thickness=0.014)
            mn.render(f'enemy/pirate_{sd}', objs=[o for o in hull + static if not o.hide_render])
            flag, pose = build_flag(M); mn.outline([flag], thickness=0.01)
            claws = [build_claw(M, a) for a in CLAW_OPEN]
            for c in claws: mn.outline([o for o in c if o.name.startswith('jaw') and 'band' not in o.name], thickness=0.012)
            el.show([o for c in claws for o in c], False)
            occl = [o for o in hull + static if not o.hide_render]
            for o in occl: o.is_holdout = True
            def fstate(f):
                def setup(kind): pose(f)
                return setup
            el.render_states(f'enemy/pirate_{sd}_flag', [(f'_f{f}', fstate(f)) for f in range(FLAG_FRAMES)], lambda: [flag], frames=FLAG_FRAMES)
            flag.hide_render = True
            def cstate(i):
                def setup(kind):
                    for j, c in enumerate(claws): el.show(c, j == i)
                return setup
            el.render_states(f'enemy/pirate_{sd}_claw', [(f'_f{i}', cstate(i)) for i in range(len(CLAW_OPEN))],
                             lambda: [o for c in claws for o in c], frames=len(CLAW_OPEN), extra={'open': CLAW_OPEN})
            for o in occl: o.is_holdout = False
            el.delete(static + [flag] + [o for c in claws for o in c])
            for o in el.find(['tag', 'antenna']): o.hide_render = False
        elif v == 'tractor':
            static = tractor_extras(M); mn.outline([o for o in static if not o.name.startswith(('emit_bolt', 'mast_haz', 'beacon'))], thickness=0.014)
            mn.render(f'enemy/tractor_{sd}', objs=hull + static)
            ok, hit, halo = tractor_emitter(M)
            el.show(ok + hit + halo, False)
            el.render_poi(f'enemy/tractor_{sd}_emitter_ok', ok, hull + static, halo)
            el.render_poi(f'enemy/tractor_{sd}_emitter_hit', hit, hull + static)
            el.delete(static + ok + hit + halo)
        elif v == 'stealth':
            static = stealth_look(M)
            mn.render(f'enemy/stealth_{sd}', objs=[o for o in hull + static if not o.hide_render])
            el.delete(static)
        print(f'[variants] {v} {sd}: {time.time() - t0:.1f}s')

def worn_(name, color, rough, metal, wear=1.0, grime=1.0):
    return el.worn(name, color, rough, metal, wear=wear, grime=grime)

if __name__ == '__main__':
    T = time.time()
    for sd in SIDES:
        mn.reset(); mn._mats.clear()
        render_side(sd)
    print(f'[variants] total {time.time() - T:.1f}s')
