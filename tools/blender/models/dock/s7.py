"""S-7, the thawed grappler tissue culture that overgrew Dr. Varga's lab (the derelict, js/dock.js), as game sprites.

    blender -b --factory-startup --python tools/blender/models/dock/s7.py -- [what ...] [quick]
        what = mats tendril heart creep wrap freezer junction frost cocoon (default: all)
        quick = 16 samples into the scratch dir given by S7_QUICK_DIR (no manifest entry)

Built from the concept mock-up (models/concepts/culture.py): the same flesh family (dark purple, sickly green belly,
glowing green nodules, pink heart), the same freezer / J1 / cocoon props, cut into separate stateful sprites.
Coordinates below are game-relative to each sprite's origin (x right, y down); heights z above the floor.
The derelict's floor plates are FLOOR_Z = 0.035 high, so floor growth starts there.

Sprites (build/renders/dock/), all single-sided (no text mirrored; flip for starboard if wanted):
  s7_mat_airlock[_husk]   floor growth for the airlock R(-10.2, y-2.4, -5.6, y+2.4): 4.6 x 4.8, origin = room centre
  s7_mat_lab[_husk]       ... the lab (cargo) R(-18.4, y-4, -10.8, y+4): 7.6 x 8, origin = room centre
  s7_mat_core[_husk]      ... the core R(-25, y-2.8, -19, y+2.8): 6 x 5.6, origin = room centre
                          Growth heavy along the walls / corners and round the heat (lab fire, freezer outpour,
                          heart), a clear walkway door-to-door. Max height ~0.15 (fine on the ground layer).
  s7_tendril              8 dirs x 6 frames: idle breathing (a swell runs root -> tip). Origin = the root (a fleshy
                          mound), lying along the facing direction, ~2.4 long.
  s7_tendril_twitch       8 dirs x 4 frames: telegraph (tenses, tip rears up, nodules flare). Play once / hold f3.
  s7_tendril_grab         8 dirs x 4 frames (squeeze loop): risen and coiled round a crew member standing 1.2 from
  s7_tendril_grab_front   the root along the facing. Draw grab, then the crew, then grab_front (the coil parts in
                          front of the crew; the crew-shaped hole is cut out). Same canvas / origin / frames.
  s7_tendril_recoil       8 dirs x 3 frames: pulled back, curled up near the root, trembling (loop).
  s7_tendril_husk         8 dirs x 1: frozen grey husk, thinner, cracked into pieces.
  s7_heart                8 frames: heartbeat (lub-dub) loop, ~2.4 wide; wrapped round the black box. Origin = the
                          black box spot (g.boxSpot); the mass sits north of it (to y - 1.7).
  s7_heart_open           8 frames (weaker beat): the grip unwound, an empty wet hollow at the origin: the game
                          draws items/blackbox there.
  s7_heart_husk           1 frame: frozen, shrivelled, let go (no box either).
  s7_creep_seg            8 dirs x 1: a 1-unit tendril segment along the facing, open ends; chain them every 1.0
                          (dir 0 tiles seamlessly: periodic shape and texture). Origin = the segment's centre.
  s7_creep_tip            8 dirs x 4 frames: the growing tip, drawn as the next 1-unit tile after the last segment
                          (its root end joins the segment; origin = its centre, like a segment).
  s7_wrap_capacitor       vines wrapping the 3-cell capacitor (systems/cap3_*): overlay drawn over it, same origin
  s7_wrap_capacitor4      (the capacitor's x, y). The 4-cell bank (capacitor upgrade) gets its own fit.
  s7_freezer_off          Varga's cryo freezer, burst open from the inside, dead. 1.5 x 0.78, origin = footprint
  s7_freezer_on           centre (the concept puts it at hatch + (-12.6, -3.6), its back against the lab's back
                          wall). on: running again on our power: lit blue bay, frost, cold vapour.
  s7_junction_dead        J1, the lab's power junction on a back wall. Origin = the wall's foot below its centre
  s7_junction_patched     (concept: hatch + (-6.7, -2.4), the airlock's back wall). patched: our tether plugged in;
                          the cable runs down and ends on the floor at (0, +0.75) from the origin, where the game's
                          procedural tether line takes over.
  s7_frost_a, s7_frost_b  floor frost patches (~1.6 x 1.2), origin = centre.
  s7_cocoon_pirate        a Red Comet pirate cocooned on a back wall. Origin = the wall's foot below it.
"""
import sys, os, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'organic'))
import docklib as D
from docklib import *
import orglib as O
import shiplib
from mathutils import Vector, noise

A = D.args()
ALL = ['mats', 'tendril', 'heart', 'creep', 'wrap', 'freezer', 'junction', 'frost', 'cocoon']
WHAT = [a for a in A if a in ALL] or ALL
SUB = [a for a in A if a.startswith('only=')]           # e.g. only=grab: one tendril state while iterating
QUICK = 'quick' in A
if QUICK:
    mn.SAMPLES = 16; mn.OUT_DIR = os.environ.get('S7_QUICK_DIR', '/tmp/mn_s7')
    def _quick_put(name, e):                       # quick runs: origins into <dir>/origins.json, not the manifest
        import json
        f = os.path.join(mn.OUT_DIR, 'origins.json'); os.makedirs(mn.OUT_DIR, exist_ok=True)
        d = json.load(open(f)) if os.path.exists(f) else {}
        d[name.split('/')[-1]] = (e['ox'], e['oy']); json.dump(d, open(f, 'w'))
    mn._manifest_put = _quick_put
else:
    mn.SAMPLES = 40

GROUP = 'dock/'

def reset():
    s = mn.reset(); set_side('port')
    s.cycles.device = 'CPU'
    shiplib._hidden_in_data.clear()
    D.M_DARK[0] = None
    return s

# ---------------------------------------------------------------------------------------------------
# Materials (the concept's S-7 family)
# ---------------------------------------------------------------------------------------------------
def mats():
    M = {}
    M['flesh'] = O.flesh('s7_flesh', '#30103a', '#62287a', c2='#1c0624', veins='#b4e04a', vein_k=0.55, scale=1.6,
                         spots='#9cffc8', spot_scale=6, spot_size=0.06, spot_strength=1.1, sss=0.25, sss_col=(1.0, 0.4, 0.9),
                         coat=0.7, rough=0.3, bump=0.5, speckle=('#2a0834', 11.0, 0.25, 0.6))
    M['tend'] = O.flesh('s7_tend', '#3e1248', '#7a3a90', c2='#1c0624', veins='#b4e04a', vein_k=0.6, scale=3.0, spots='#9cffc8', spot_scale=9,
                        spot_size=0.05, spot_strength=1.0, sss=0.3, sss_col=(1.0, 0.4, 0.9), coat=0.75, rough=0.28,
                        belly='#a8d050', belly_axis=(0, 0, -1), belly_k=0.35)
    M['heart'] = O.flesh('s7_heart', '#4a1052', '#8a3482', c2='#1e0622', veins='#ff6ab4', vein_k=1.0, scale=1.8,
                         spots='#ff7ac8', spot_scale=4, spot_size=0.1, spot_strength=1.3, sss=0.4, sss_col=(1.0, 0.3, 0.6),
                         coat=0.9, rough=0.22, bump=0.6)
    M['frozen'] = O.flesh('s7_frozen', '#5c5668', '#a7a6b8', c2='#2a2832', veins='#dff0ff', vein_k=0.5, scale=2.0,
                          sss=0.0, coat=0.2, rough=0.75, bump=0.9)
    M['husk'] = O.flesh('s7_husk', '#5a5268', '#9894a8', c2='#2a2632', veins='#c8d8e8', vein_k=0.35, scale=2.0,
                        sss=0.0, coat=0.15, rough=0.8, bump=1.0, speckle=('#e8f0f8', 14.0, 0.2, 0.5))
    M['nod'] = O.emit_mat('s7_nod', '#9cffc8', 1.3, base='#5ad8a0', coat=1.0)
    M['nod_hot'] = O.emit_mat('s7_nod_hot', '#d8ff7a', 1.5, base='#a8e05a', coat=1.0)
    M['nod_dim'] = O.emit_mat('s7_nod_dim', '#6ac89a', 0.35, base='#3a6a5a', coat=1.0)
    M['nod_pink'] = O.emit_mat('s7_nodp', '#ff7ac8', 1.2, base='#c04a90', coat=1.0)
    M['nod_dead'] = O.plain('s7_nod_dead', '#8a90a0', 0.4, coat=0.6)
    M['pus'] = O.emit_mat('s7_pus', '#c8ff5a', 0.9, base='#8ac02a', coat=1.0)
    M['sucker'] = O.flesh('s7_sucker', '#b8d070', '#d8e8a0', c2='#4a5a20', scale=4, coat=0.8, rough=0.3, sss=0.2, bump=0.2)
    M['ice'] = O.plain('s7_ice', '#e8f4ff', 0.12, coat=1.0, sss=0.3)
    M['frost'] = decal_mat('s7_frostd', '#dceaf6', 0.75, 7.0, rough=0.9)
    M['frost2'] = decal_mat('s7_frostd2', '#eef6ff', 0.55, 12.0, rough=0.9)
    M['ooze'] = decal_mat('s7_ooze', '#2a0a30', 0.85, 6.0, rough=0.1)
    M['cavity'] = O.flesh('s7_cavity', '#2a0a2e', '#5a1a4a', c2='#10020f', veins='#ff6ab4', vein_k=0.6, scale=3, coat=1.0, rough=0.15, sss=0.3)
    # props (ships.materials('derelict') subset, plus the concept's)
    M['steel'] = worn('s7_steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6, frost=0.3)
    M['dark'] = pmat('s7_dark', '#1c1f25', 0.6); M['black'] = pmat('s7_black', '#0b0c0f', 0.9)
    M['ink'] = pmat('s7_ink', '#23252b', 0.6); M['tape'] = pmat('s7_tape', '#b9bcc2', 0.85)
    M['paper'] = pmat('s7_paper', '#e6e2d6', 0.8); M['white'] = worn('s7_white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6)
    M['glass'] = mn.mat('s7_glass', '#3a4654', 0.08, 0.0, clearcoat=1.0)
    M['screen_dead'] = mn.mat('s7_screen_dead', '#10161c', 0.06, 0.0, clearcoat=1.0)
    M['hazard'] = stripes_mat('s7_hazard'); M['hazard_red'] = stripes_mat('s7_hazard_red', '#c0392b', '#e8e4dc', 5.0)
    M['cables'] = [pmat('s7_c1', '#9a5634', 0.6), pmat('s7_c2', '#3a5a8e', 0.6), pmat('s7_c3', '#5a5e66', 0.6)]
    M['copper'] = worn('s7_copper', '#b8902e', 0.35, 0.9, wear=0.3)
    M['cab'] = worn('s7_cab', '#d8dcd8', 0.45, 0.1, wear=0.6, grime=0.9)
    M['cab_frost'] = worn('s7_cab_frost', '#d8dcd8', 0.45, 0.1, wear=0.6, grime=0.9, frost=1.0)
    M['cab_trim'] = worn('s7_cab_trim', '#3a78b8', 0.4, 0.2, wear=0.7)
    M['cold_in'] = emit_mat('s7_cold_in', '#7ad8ff', 1.1, base='#2a6a9a')
    M['cold_scr'] = emit_mat('s7_cold_scr', '#5ac8ff', 0.9, base='#0a2a3a')
    M['led_g'] = emit_mat('s7_led_g', '#5aff9a', 1.4, base='#2a7a4a')
    M['led_r'] = emit_mat('s7_led_r', '#ff3a2a', 1.4, base='#6a1a14')
    M['led_off'] = pmat('s7_led_off', '#3a1a18', 0.3)
    M['heater'] = emit_mat('s7_heater', '#ff8a2a', 1.3, base='#a04010')
    M['bbox'] = worn('s7_bbox', '#e8762e', 0.45, 0.15, wear=0.6)
    M['rubber'] = pmat('s7_rubber', '#262a33', 0.7)
    M['tether'] = stripes_mat('s7_tether', '#ffd84a', '#23252b', 4.0)
    M['live'] = emit_mat('s7_live', '#ffd84a', 0.9, base='#c8a030')
    M['j1'] = worn('s7_j1', '#e8c34f', 0.45, 0.3, wear=0.8, grime=0.8, frost=0.4)
    M['j1_door'] = worn('s7_j1d', '#8a909a', 0.5, 0.2, frost=0.8)
    M['mist'] = mist_mat()
    # the Red Comet pirate (models/chars/pirate.py palette)
    M['suit'] = worn('s7_psuit', '#b85a42', 0.72, 0.0, wear=0.3, grime=1.2)
    M['suit_dk'] = worn('s7_psuit_dk', '#7e3a2e', 0.75, 0.0, wear=0.3, grime=1.2)
    M['armor'] = worn('s7_parmor', '#8c929e', 0.45, 0.05, wear=0.8, grime=0.9)
    M['crest'] = worn('s7_pcrest', '#d23a2c', 0.7, 0.0, wear=0.0, grime=0.8)
    M['skin'] = mn.mat('s7_pskin', '#c89a80', 0.6, emit='#a88a80', emit_strength=0.15)
    M['bone'] = worn('s7_pbone', '#ece4d0', 0.55, 0.0, wear=0.5, grime=1.0)
    M['membrane'] = membrane_mat()
    return M

def mist_mat():
    """Cold vapour: pale, see-through, thicker in noisy wisps."""
    m = bpy.data.materials.new('s7_mist'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.78, 0.9, 1.0, 1); em.inputs['Strength'].default_value = 0.55
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.5; nz.inputs['Detail'].default_value = 4
    Lk(tc.outputs['Object'], nz.inputs['Vector'])
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; Lk(lw.outputs['Facing'], mu.inputs[0]); mu.inputs[0].default_value = 1
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; Lk(lw.outputs['Facing'], inv.inputs[1])
    mu2 = N.new('ShaderNodeMath'); mu2.operation = 'MULTIPLY'; Lk(inv.outputs[0], mu2.inputs[0]); Lk(nz.outputs['Fac'], mu2.inputs[1])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.12; mr.inputs['From Max'].default_value = 0.55; mr.inputs['To Max'].default_value = 0.55
    Lk(mu2.outputs[0], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(em.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def membrane_mat():
    """Translucent wet membrane (the cocoon's sac): flesh tones, partly see-through."""
    m = O.flesh('s7_membrane', '#5a2a66', '#9a5aae', c2='#2a0a30', veins='#b4e04a', vein_k=0.5, scale=3.0, coat=0.9, rough=0.2, sss=0.4,
                sss_col=(1.0, 0.4, 0.9))
    return m

def periodic(m, period=1.0):
    """Make a flesh material's object-space texture periodic along x (for the tileable creep segment):
    (x, y, z) -> (R cos(2 pi x / P), R sin(2 pi x / P), z + 0.7 y), R = P / (2 pi)."""
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    tc = next(n for n in N if n.type == 'TEX_COORD')
    sep = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sep.inputs[0])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = math.tau / period; Lk(sep.outputs['X'], k.inputs[0])
    R = period / math.tau
    c = N.new('ShaderNodeMath'); c.operation = 'COSINE'; Lk(k.outputs[0], c.inputs[0])
    s = N.new('ShaderNodeMath'); s.operation = 'SINE'; Lk(k.outputs[0], s.inputs[0])
    cr = N.new('ShaderNodeMath'); cr.operation = 'MULTIPLY'; cr.inputs[1].default_value = R; Lk(c.outputs[0], cr.inputs[0])
    sr = N.new('ShaderNodeMath'); sr.operation = 'MULTIPLY'; sr.inputs[1].default_value = R; Lk(s.outputs[0], sr.inputs[0])
    yz = N.new('ShaderNodeMath'); yz.operation = 'MULTIPLY_ADD'; yz.inputs[1].default_value = 0.7; Lk(sep.outputs['Y'], yz.inputs[0]); Lk(sep.outputs['Z'], yz.inputs[2])
    cb = N.new('ShaderNodeCombineXYZ'); Lk(cr.outputs[0], cb.inputs[0]); Lk(sr.outputs[0], cb.inputs[1]); Lk(yz.outputs[0], cb.inputs[2])
    for l in list(nt.links):
        if l.from_node == tc and l.from_socket.name == 'Object' and l.to_node != sep:
            to = l.to_socket; nt.links.remove(l); Lk(cb.outputs[0], to)
    return m

# ---------------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------------
def V(x, y, z=0.0):
    """Game-relative (x right, y down) at height z -> Blender."""
    return Vector((x, -y, z))

def smooth_path(pts, sub=6):
    """Catmull-Rom through points (tuples of any length)."""
    P_ = [pts[0]] + list(pts) + [pts[-1]]; res = []; nd = len(pts[0])
    for i in range(1, len(P_) - 2):
        p0, p1, p2, p3 = P_[i - 1], P_[i], P_[i + 1], P_[i + 2]
        for s in range(sub):
            t = s / sub; t2, t3 = t * t, t * t * t
            res.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                                    (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(nd)))
    res.append(tuple(pts[-1])); return res

def tendril(name, pts, radii, m, out, rng=None, nod_mat=None, every=6, suckers=None, caps=True, segs=12, cut=True):
    """Tapered tube along Blender points; glowing nodules on top every `every` points; optional pale suckers
    along the underside edge. cut: remove what's below the floor."""
    pts = [Vector(p) for p in pts]
    o = O.tube(name, pts, radii, m, segs=segs, caps=caps)
    if cut: O.cut_below(o, 0.0)
    out.append(o)
    fr = O.curve_frames(pts)
    if nod_mat is not None:
        rng = rng or random.Random(len(pts))
        for j in range(2, len(pts) - 2, every):
            t, side, up = fr[j]; r = radii[j]
            if rng.random() < 0.85:
                q = pts[j] + up * r * 0.72 + side * r * rng.uniform(-0.45, 0.45)
                out.append(mn.sphere(name + '_nod', r * rng.uniform(0.3, 0.42), loc=q, m=nod_mat if rng.random() < 0.8 else nod_mat, segs=10))
    if suckers is not None:
        for j in range(2, len(pts) - 1, 3):
            t, side, up = fr[j]; r = radii[j]
            for sd in (-1, 1):
                q = pts[j] + side * sd * r * 0.85 - up * r * 0.25
                s = mn.sphere(name + '_suck', r * 0.22, loc=q, m=suckers, scale=(1, 1, 0.55), segs=10); out.append(s)
    return o

def per_frame(sets, frames):
    """sets[j] visible only on frames[j] (hide_render keyed)."""
    for j, objs in enumerate(sets):
        for o in objs:
            for g in frames:
                o.hide_render = g != frames[j]; o.keyframe_insert('hide_render', frame=g)

def hide_all(objs, on=True):
    for o in objs: o.hide_render = on

def frost_disc(x, y, r, M, out, z=None, sv=0.8, rot=0.0, k=0):
    stain(x, y, r, M['frost'] if k % 2 == 0 else M['frost2'], out, sv=sv, rotz=rot, z=(FLOOR_Z if z is None else z) + 0.003 + 0.0006 * (k % 5))

def ice_spikes(x, y, rad, n, M, out, rng, z=FLOOR_Z, h=(0.05, 0.16)):
    for _ in range(n):
        a = rng.uniform(0, math.tau); r = rad * math.sqrt(rng.random())
        sp = mn.cyl('ice', rng.uniform(0.018, 0.04), rng.uniform(*h), loc=V(x + math.cos(a) * r, y + math.sin(a) * r * 0.8, z), m=M['ice'], verts=5, bevel=0.004)
        sp.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3)); out.append(sp)

def meshes(objs):
    return [o for o in objs if o is not None and o.type == 'MESH']

def render(name, objs, **kw):
    return mn.render(GROUP + name, objs=meshes(objs), **kw)

# ---------------------------------------------------------------------------------------------------
# Floor mats (one per room), live and husk
# ---------------------------------------------------------------------------------------------------
# room size (w, h) and features in room-local game coords (origin = room centre, y down):
#   walk: polyline of the walkway kept clear; hot: (x, y, sigma, k) growth magnets; clear: (x, y, sigma, k) kept bare
ROOMS_S7 = {
    'airlock': dict(w=4.6, h=4.8, seed=3, walk=[(2.4, 0.0), (0.4, 0.15), (-2.4, 0.0)],
                    hot=[], clear=[(1.2, -2.2, 0.6, 0.6)]),
    'lab':     dict(w=7.6, h=8.0, seed=7, walk=[(3.9, 0.0), (1.4, 0.4), (-1.2, -0.2), (-3.9, 0.0)],
                    hot=[(0.0, 1.4, 0.95, 0.9), (2.0, -3.0, 0.9, 0.8), (-0.4, -3.6, 0.7, 0.6)], clear=[(0.0, 1.4, 0.32, 0.9)]),
    'core':    dict(w=6.0, h=5.6, seed=11, walk=[(3.1, 0.0), (1.6, 0.5), (0.5, 1.3)],
                    hot=[(-0.4, 1.4, 1.2, 1.1), (-1.6, 0.0, 1.0, 0.5)], clear=[]),
}

def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def mat_density(room):
    R = ROOMS_S7[room]; W, H = R['w'], R['h']; sd = R['seed']
    def d(x, y):
        e = min(W / 2 - abs(x), H / 2 - abs(y))                       # distance to the nearest wall
        ex, ey = W / 2 - abs(x), H / 2 - abs(y)
        g = 1.2 * math.exp(-e / 0.7) + 0.9 * math.exp(-(ex * ex + ey * ey) / (2 * 1.3 ** 2))
        g += 0.25 * math.exp(-(H / 2 + y) / 0.6)                       # a bit more along the back wall
        n = noise.noise(Vector((x * 0.62 + sd, y * 0.62, 0.3))) + 0.4 * noise.noise(Vector((x * 1.9 + 10 + sd, y * 1.9, 1.1)))
        g += 0.6 * n - 0.66
        for hx, hy, s, k in R['hot']: g += k * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * s * s))
        for hx, hy, s, k in R['clear']: g -= k * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * s * s))
        w = min(seg_dist(x, y, a, b) for a, b in zip(R['walk'], R['walk'][1:]))
        g -= 1.1 * math.exp(-(w * w) / (2 * 0.75 ** 2))
        return g
    return d

def grid_mesh(name, rect, hfn, place, m, step=0.07, keep=lambda h: h > 0, subsurf=True):
    """Height-field patch over rect (x0, y0, x1, y1): faces where >= 3 corners keep(h); place(x, y, h) -> point."""
    import bmesh
    x0, y0, x1, y1 = rect
    nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    Hh = [[hfn(x0 + i * step, y0 + j * step) for j in range(ny)] for i in range(nx)]
    bm = bmesh.new(); Vv = {}
    def vert(i, j):
        if (i, j) not in Vv:
            x, y, h = x0 + i * step, y0 + j * step, Hh[i][j]
            if not keep(h):                      # an outside corner: slide it onto the zero contour (smooth edges)
                best = None
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    a, b = i + di, j + dj
                    if 0 <= a < nx and 0 <= b < ny and keep(Hh[a][b]) and (best is None or Hh[a][b] > best[2]): best = (a, b, Hh[a][b])
                if best:
                    t = min(0.95, (-h) / (best[2] - h + 1e-9))
                    x, y = x + (x0 + best[0] * step - x) * t, y + (y0 + best[1] * step - y) * t; h = 0.0
            Vv[(i, j)] = bm.verts.new(place(x, y, h))
        return Vv[(i, j)]
    nf = 0
    for i in range(nx - 1):
        for j in range(ny - 1):
            hs = (Hh[i][j], Hh[i + 1][j], Hh[i + 1][j + 1], Hh[i][j + 1])
            if sum(1 for h in hs if keep(h)) >= 3 and keep(sum(hs) / 4):
                bm.faces.new((vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j))); nf += 1
    if not nf: bm.free(); return None
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); mn.smooth(o)
    if sum(p.normal.z for p in o.data.polygons) < 0:
        for p in o.data.polygons: p.flip()
    if subsurf:
        md = o.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1
    return o

def build_mat(room, husk):
    reset(); M = mats(); out = []
    R = ROOMS_S7[room]; W, H = R['w'], R['h']
    rng = random.Random(R['seed'] + (100 if husk else 0))
    dens = mat_density(room)
    shrink = 0.18 if husk else 0.0                                     # shrivelled: retreats a little
    hk = 0.45 if husk else 1.0
    def hf(x, y): return dens(x, y) - shrink
    def place(x, y, h):
        bump = 0.025 * noise.noise(Vector((x * 4.1, y * 4.1, 2.0)))
        return V(x, y, FLOOR_Z + 0.005 + hk * (max(0.0, min(0.13, h * 0.16)) + max(0.0, bump) * (h > 0.05)))
    rect = (-W / 2 + 0.03, -H / 2 + 0.03, W / 2 - 0.03, H / 2 - 0.03)
    if husk: sheet = O.flesh('s7_husk_sheet', '#5a5268', '#9894a8', c2='#2a2632', veins='#3a3444', vein_k=0.5, scale=2.0, sss=0.0, coat=0.15,
                             rough=0.8, bump=1.0, speckle=('#f0f6ff', 14.0, 0.25, 0.6))
    else: sheet = O.flesh('s7_flesh_sheet', '#30103a', '#62287a', c2='#1c0624', veins='#b4e04a', vein_k=0.55, scale=1.6, spots='#9cffc8', spot_scale=6,
                          spot_size=0.06, spot_strength=1.1, sss=0.25, sss_col=(1.0, 0.4, 0.9), coat=0.7, rough=0.3, bump=0.5,
                          speckle=('#2a0834', 11.0, 0.25, 0.6))
    O.darken_low(sheet, FLOOR_Z + 0.006, FLOOR_Z + 0.035, '#120414' if not husk else '#24222c', 0.8)   # a dark rim where it thins out
    out.append(grid_mesh('mat', rect, hf, place, sheet))
    # runners: thin tendrils reaching out from the mat over bare floor (they read as "it's spreading")
    for k in range(int(W * H / 2.6)):
        for _ in range(40):
            x, y = rng.uniform(-W / 2 + 0.3, W / 2 - 0.3), rng.uniform(-H / 2 + 0.3, H / 2 - 0.3)
            if 0.0 < hf(x, y) < 0.3: break
        else: continue
        # walk downhill (towards bare floor), wiggling
        pts = [(x, y)]; L = rng.uniform(0.7, 1.6)
        for s in range(6):
            e = 0.06; gx = (hf(x + e, y) - hf(x - e, y)) / (2 * e); gy = (hf(x, y + e) - hf(x, y - e)) / (2 * e)
            gl = math.hypot(gx, gy) or 1
            a = math.atan2(-gy, -gx) + rng.uniform(-0.6, 0.6)
            x = max(-W / 2 + 0.1, min(W / 2 - 0.1, x + math.cos(a) * L / 6)); y = max(-H / 2 + 0.1, min(H / 2 - 0.1, y + math.sin(a) * L / 6))
            pts.append((x, y))
        sm = smooth_path(pts, 3); n = len(sm); r0 = rng.uniform(0.035, 0.06) * (0.7 if husk else 1.0)
        rad = [r0 * (1 - 0.8 * i / (n - 1)) for i in range(n)]
        tendril('runner', [V(px, py, FLOOR_Z + r * 0.7) for (px, py), r in zip(sm, rad)], rad,
                M['husk'] if husk else M['tend'], out, rng, nod_mat=None, segs=8)
    # lumps, pustules, glowing nodules on the thick parts
    n = int(W * H * 1.3); k = 0; tries = 0
    while k < n and tries < 8000:
        tries += 1
        x, y = rng.uniform(-W / 2 + 0.15, W / 2 - 0.15), rng.uniform(-H / 2 + 0.15, H / 2 - 0.15)
        g = hf(x, y)
        if g < 0.3: continue
        z = FLOOR_Z + 0.005 + hk * min(0.13, g * 0.16)
        r = rng.random()
        if r < 0.4:
            o = mn.sphere('lump', rng.uniform(0.07, 0.17) * (0.75 if husk else 1), loc=V(x, y, z - 0.02), m=M['husk'] if husk else M['flesh'],
                          scale=(1.2, 1.0, 0.5 if husk else 0.6), segs=16)
            o.rotation_euler.z = rng.uniform(0, 3); out.append(o)
        elif not husk:
            out.append(mn.sphere('nod', rng.uniform(0.03, 0.065), loc=V(x, y, z + 0.02), m=M['nod'] if r < 0.85 else M['pus'], segs=10))
        else:
            out.append(mn.sphere('nod', rng.uniform(0.025, 0.05), loc=V(x, y, z + 0.005), m=M['nod_dead'], scale=(1, 1, 0.6), segs=8))
        k += 1
    if husk:                                                       # frost over it all, ice needles on the thick parts
        for k in range(int(W * H * 0.3)):
            x, y = rng.uniform(-W / 2 + 0.3, W / 2 - 0.3), rng.uniform(-H / 2 + 0.3, H / 2 - 0.3)
            if hf(x, y) < 0.2: continue
            frost_disc(x, y, rng.uniform(0.15, 0.3), M, out, z=FLOOR_Z + 0.005 + hk * min(0.13, max(0, hf(x, y)) * 0.16), rot=rng.uniform(0, 3), k=k)
        for k in range(int(W * H * 0.25)):
            x, y = rng.uniform(-W / 2 + 0.3, W / 2 - 0.3), rng.uniform(-H / 2 + 0.3, H / 2 - 0.3)
            if hf(x, y) < 0.2: continue
            ice_spikes(x, y, 0.15, 3, M, out, rng, z=FLOOR_Z + 0.02, h=(0.04, 0.1))
    # a hidden frame so live and husk share one canvas: the room rect
    fr = ubox('frame', -W / 2 - 0.1, -H / 2 - 0.1, W / 2 + 0.1, H / 2 + 0.1, 0.0, 0.25, bevel=0); fr.hide_render = True
    render(f's7_mat_{room}' + ('_husk' if husk else ''), [fr] + out)

# ---------------------------------------------------------------------------------------------------
# The floor tendril (8 directions; local frame: root at the origin, lying along Blender +X)
# ---------------------------------------------------------------------------------------------------
TL = 2.4                       # length
TR0, TR1 = 0.165, 0.035        # root / tip radius
GRAB_D = 1.2                   # where the grabbed crew member stands (from the root, along the facing)

def root_mound(M, out, husk=False, rng=None):
    rng = rng or random.Random(4)
    parts = [((0.02, 0.0, 0.0), 0.33, (1.15, 1.0, 0.72)), ((-0.12, 0.1, 0.0), 0.24, (1.0, 1.0, 0.65)), ((-0.05, -0.14, 0.0), 0.22, (1.0, 1.0, 0.6))]
    b = O.blob('mound', [((p[0], p[1], FLOOR_Z + p[2]), r, s) for p, r, s in parts], m=M['husk'] if husk else M['flesh'], res=0.03)
    O.cut_below(b, 0.0); out.append(b)
    for k in range(5 if not husk else 0):
        a = rng.uniform(0, math.tau); r = rng.uniform(0.05, 0.22)
        out.append(mn.sphere('mnod', rng.uniform(0.025, 0.045), loc=(math.cos(a) * r - 0.05, math.sin(a) * r, FLOOR_Z + 0.11), m=M['nod'], segs=10))
    for k in range(4):                                         # rootlets into the floor
        a = math.pi * 0.5 + k * math.pi / 3.2 + rng.uniform(-0.2, 0.2)
        pts = [(math.cos(a) * 0.2, math.sin(a) * 0.18, FLOOR_Z + 0.04), (math.cos(a) * 0.38, math.sin(a) * 0.33, FLOOR_Z + 0.02), (math.cos(a + 0.2) * 0.5, math.sin(a + 0.2) * 0.42, FLOOR_Z + 0.01)]
        tendril('rootlet', pts, [0.045, 0.03, 0.012], M['husk'] if husk else M['tend'], out, segs=8)
    return b

def lying(t, L=TL, amp=0.15, sway=0.0, swell=0.0, n=14):
    """Control points (x, y, z, r) of the lying tendril; t = loop phase 0..1."""
    pts = []
    for k in range(n):
        u = k / (n - 1); x = -0.05 + (L + 0.05) * u
        y = amp * math.sin(math.pi * x / 1.15 + 0.5) * u ** 0.5 + sway * u * u * math.sin(math.tau * t)
        r = (TR0 - (TR0 - TR1) * u ** 0.85) * (1 + swell * math.sin(math.tau * (t - x / 1.6)))
        pts.append((x, y, FLOOR_Z + r * 0.88 - 0.06 * max(0.0, 1 - x / 0.3), r))
    return [(-0.24, 0.0, FLOOR_Z + 0.05, TR0 * 0.5)] + pts       # (starts tapered inside the mound: no end cap shows)

def dense(ctrl, sub=5):
    sm = smooth_path(ctrl, sub)
    return [Vector(p[:3]) for p in sm], [p[3] for p in sm]

def tendril_idle(M, f, n):
    out = []; t = f / n
    pts, rad = dense(lying(t, sway=0.07, swell=0.1))
    tendril('tend', pts, rad, M['tend'], out, random.Random(5), nod_mat=M['nod'], every=6, suckers=M['sucker'])
    return out

def tendril_twitch(M, f):
    k = [0.35, 0.7, 1.0, 0.9][f]; shake = [0.0, 0.05, -0.05, 0.03][f]
    ctrl = []
    for (x, y, z, r) in lying(0.0, L=TL * (1 - 0.1 * k), amp=0.15 + 0.08 * k):
        u = x / TL
        lift = k * 0.85 * max(0.0, (u - 0.4) / 0.6) ** 1.5
        back = k * 0.45 * max(0.0, (u - 0.65) / 0.35) ** 2               # the tip rears back over itself
        ctrl.append((x - back, y + shake * u * 2, z + lift, r * (1 + 0.12 * k * (1 - u))))
    pts, rad = dense(ctrl)
    out = []
    tendril('tend', pts, rad, M['tend'], out, random.Random(5), nod_mat=M['nod_hot'], every=6, suckers=M['sucker'])
    return out

def tendril_grab(M, f):
    """Risen from the root, coiled round a crew member's legs and hips at (GRAB_D, 0)."""
    sq = [0.285, 0.27, 0.258, 0.272][f]; wob = [0.0, 0.03, 0.05, 0.02][f]
    cx = GRAB_D
    ctrl = [(-0.24, 0.0, FLOOR_Z + 0.05, 0.08), (0.0, 0.0, FLOOR_Z + 0.12, 0.16), (0.38, 0.05 + wob, FLOOR_Z + 0.15, 0.155), (0.62, 0.1 + wob, 0.32, 0.14), (0.8, 0.08, 0.55, 0.125)]
    # helix: starts on the root side at the top, winds 2.4 turns down to the floor
    turns = 2.1; N = 40; z0, z1 = 0.6, 0.12
    for i in range(N + 1):
        u = i / N; a = math.pi + math.tau * turns * u * (1 if True else -1)
        r = sq * (1 + 0.06 * math.sin(u * 9 + f))
        z = z0 + (z1 - z0) * u
        ctrl.append((cx + math.cos(a) * r, math.sin(a) * r * 1.0, z, 0.075 - 0.035 * u))
    sm = smooth_path(ctrl[:5], 5) + [tuple(c) for c in ctrl[5:]]
    pts = [Vector(p[:3]) for p in sm]; rad = [p[3] for p in sm]
    out = []
    tendril('tend', pts, rad, M['tend'], out, random.Random(7), nod_mat=M['nod'], every=5, cut=False)
    return out

def figure_proxy():
    """Crew-sized stand-in at the grab point (models/crew/crew.py: hips 0.4, shoulders ~0.74, helmet ~0.9-1.15)."""
    objs = [mn.cyl('fig_legs', 0.2, 0.45, loc=(GRAB_D, 0, 0), verts=24, bevel=0),
            mn.cyl('fig_body', 0.25, 0.45, loc=(GRAB_D, 0, 0.42), verts=24, bevel=0),
            mn.sphere('fig_head', 0.27, loc=(GRAB_D, 0, 0.98), segs=24)]
    for o in objs: o.is_holdout = True
    return objs

def tendril_recoil(M, f):
    jit = [(0.0, 0.0), (0.03, -0.02), (-0.02, 0.03)][f]
    ctrl = [(-0.24, 0.0, FLOOR_Z + 0.05, 0.08), (0.0, 0.0, FLOOR_Z + 0.12, 0.165), (0.4, 0.08, FLOOR_Z + 0.15, 0.15), (0.72, 0.2 + jit[1], 0.2, 0.125), (0.92 + jit[0], 0.06, 0.34, 0.105),
            (0.85, -0.18 + jit[1], 0.42, 0.088), (0.62, -0.2, 0.44 + jit[0], 0.072), (0.5, -0.02, 0.38, 0.058), (0.6, 0.1, 0.3, 0.045),
            (0.72, 0.0, 0.28, 0.032), (0.68, -0.08, 0.3, 0.018)]
    pts, rad = dense(ctrl, 5)
    out = []
    tendril('tend', pts, rad, M['tend'], out, random.Random(9), nod_mat=M['nod_dim'], every=6)
    return out

def tendril_husk(M):
    out = []; rng = random.Random(12)
    pts, rad = dense(lying(0.3, amp=0.17, swell=0.0))
    rad = [r * 0.62 for r in rad]
    pts = [Vector((p.x, p.y, FLOOR_Z + r * 0.8)) for p, r in zip(pts, rad)]
    # broken into three pieces: small gaps where it cracked
    n = len(pts); cuts = [0, int(n * 0.38), int(n * 0.7), n]
    for a, b in zip(cuts, cuts[1:]):
        a2 = a + (1 if a else 0); b2 = b - (1 if b < n else 0)
        tendril('husk', pts[a2:b2], rad[a2:b2], M['husk'], out, rng, nod_mat=M['nod_dead'], every=7)
    for k in range(10):                                         # rime crystals along it
        j = rng.randrange(2, n - 2); p = pts[j]
        sp = mn.cyl('ice', rng.uniform(0.012, 0.025), rng.uniform(0.04, 0.09), loc=(p.x + rng.uniform(-0.05, 0.05), p.y + rng.uniform(-0.05, 0.05), p.z + rad[j] * 0.6), m=M['ice'], verts=5, bevel=0.003)
        sp.rotation_euler = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0); out.append(sp)
    return out

def build_tendrils():
    only = [s.split('=')[1] for s in SUB]
    def want(k): return not only or k in only
    states = []
    if want('idle'): states.append(('s7_tendril', lambda M: [tendril_idle(M, f, 6) for f in range(6)]))
    if want('twitch'): states.append(('s7_tendril_twitch', lambda M: [tendril_twitch(M, f) for f in range(4)]))
    if want('grab'): states.append(('s7_tendril_grab', lambda M: [tendril_grab(M, f) for f in range(4)]))
    if want('recoil'): states.append(('s7_tendril_recoil', lambda M: [tendril_recoil(M, f) for f in range(3)]))
    if want('husk'): states.append(('s7_tendril_husk', lambda M: [tendril_husk(M)]))
    for name, fn in states:
        t0 = time.time()
        reset(); M = mats(); static = []
        root_mound(M, static, husk=name.endswith('husk'))
        sets = fn(M)
        frames = list(range(1, len(sets) + 1))
        if len(sets) > 1: per_frame(sets, frames)
        allo = static + [o for s in sets for o in s]
        tend = [o for o in allo if o.name.split('.')[0] in ('tend', 'husk', 'mound')]
        mn.outline(tend, thickness=0.014)
        root = mn.group('root', allo)
        if name == 's7_tendril_grab':
            fig = figure_proxy(); hide_all(fig)
            render(name, allo, root=root, dirs=8, frames=frames)
            for o in fig: o.parent = root
            hide_all(fig, False)
            render(name + '_front', allo, root=root, dirs=8, frames=frames)
        else:
            render(name, allo, root=root, dirs=8, frames=frames if len(frames) > 1 else None)
        print(f'[s7] {name} in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# The heart, wrapped round the black box (origin = the box spot; the mass sits north of it)
# ---------------------------------------------------------------------------------------------------
def beat(t):
    """Lub-dub, 0..1."""
    def g(c, w): return min(math.exp(-((t - c) / w) ** 2), 1)
    return 0.65 * (g(0.1, 0.06) + g(1.1, 0.06)) + 0.4 * (g(0.32, 0.07) + g(1.32, 0.07))

def black_box(M, out):
    """items/blackbox (models/items/itemlib.py B_blackbox) as it lies there, turned 6 deg; its heater on."""
    W, Dp, Hh = 0.58, 0.4, 0.28
    parts = [mn.box('bb', (W, Dp, Hh), loc=(0, 0, FLOOR_Z), m=M['bbox'], bevel=0.035),
             mn.box('bb_hz', (W - 0.02, 0.09, 0.006), loc=(0, -Dp / 2 + 0.06, FLOOR_Z + Hh - 0.004), m=M['hazard'], bevel=0)]
    for sx in (-1, 1):
        parts.append(mn.box('bb_rib', (0.05, Dp + 0.02, Hh + 0.02), loc=(sx * 0.17, 0, FLOOR_Z - 0.01), m=M['dark'], bevel=0.015))
        for sy in (-1, 1):
            parts.append(mn.box('bb_corner', (0.07, 0.07, Hh + 0.02), loc=(sx * (W / 2 - 0.02), sy * (Dp / 2 - 0.02), FLOOR_Z - 0.01), m=M['rubber'], bevel=0.02))
    parts.append(mn.box('bb_heat', (0.3, 0.012, 0.05), loc=(0, -Dp / 2 - 0.004, FLOOR_Z + 0.08), m=M['heater'], bevel=0))
    e = mn.group('bbox', parts); e.rotation_euler.z = math.radians(6)
    out += parts
    return parts

def heart_mass(M, out, s, rng, state):
    """The lumpy mass; s = beat scale. state: live | open | husk. The box's back half sinks into its front."""
    husk = state == 'husk'
    k = 0.85 if husk else 1.0; zk = 0.7 if husk else 1.0
    cy = 0.52                                     # mass centre, Blender +Y = game north of the box
    parts = [((0, cy, FLOOR_Z + 0.4 * s * zk), 0.84 * s * k, (1.3, 0.85, 0.95 * zk))]
    r2 = random.Random(21)
    for j in range(13):
        a = math.radians(r2.uniform(-25, 205)); rr = r2.uniform(0.5, 0.85) * k
        parts.append(((math.cos(a) * rr * 1.3, cy + math.sin(a) * rr * 0.8, FLOOR_Z + r2.uniform(0.15, 0.55) * s * zk), r2.uniform(0.3, 0.45) * s * k, (1.15, 1.0, 0.9 * zk)))
    parts.append(((-0.15, cy + 0.08, FLOOR_Z + 0.95 * s * zk), 0.45 * s * k, (1.1, 1.0, zk)))
    parts.append(((0.35, cy + 0.2, FLOOR_Z + 0.85 * s * zk), 0.36 * s * k, (1.0, 1.0, zk)))
    if state == 'live':                           # two lobes hugging the box's sides
        for su in (-1, 1): parts.append(((su * 0.43, 0.2, FLOOR_Z + 0.16), 0.25 * s, (1.0, 1.6, 0.85)))
    else:                                         # pulled back off it
        for su in (-1, 1): parts.append(((su * 0.6, 0.3, FLOOR_Z + 0.15), 0.26 * s * k, (1.0, 1.2, 0.8 * zk)))
    hb = O.blob('heart', parts, m=M['husk'] if husk else M['heart'], res=0.045, threshold=0.6)
    hb = O.displace(hb, strength=0.1 if husk else 0.05, scale=0.28 if husk else 0.35, seed=3)
    O.cut_below(hb, 0.0)
    out.append(hb)
    return hb

def surface_pts(o, n, rng, rx=1.15, y0=0.3, y1=1.6, zmin=0.25):
    """Points on top of mesh o (ray cast straight down)."""
    res = []; bpy.context.view_layer.update()
    inv = o.matrix_world.inverted()
    for _ in range(n * 4):
        x, y = rng.uniform(-rx, rx), rng.uniform(y0, y1)
        ok, loc, nor, _i = o.ray_cast(inv @ Vector((x, y, 5)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
        if ok and loc.z > zmin: res.append((o.matrix_world @ loc, nor))
        if len(res) >= n: break
    return res

def heart_frame(M, f, n, state):
    """One frame's moving parts."""
    out = []; rng = random.Random(30)
    husk = state == 'husk'
    t = f / n; p = 0.0 if husk else beat(t) * (0.45 if state == 'open' else 1.0)
    s = 1 + 0.1 * p
    hb = heart_mass(M, out, s, rng, state)
    tm = M['husk'] if husk else M['tend']
    if not husk:                                   # glowing nodules on top
        for k, (q, nor) in enumerate(surface_pts(hb, 26, random.Random(31), rx=1.1, y0=0.1, y1=1.3)):
            out.append(mn.sphere('hnod', 0.045 + 0.03 * ((k * 7) % 5) / 4, loc=q + nor * 0.01, m=M['nod_pink'] if k % 3 else M['nod'], segs=10))
    else:
        for k, (q, nor) in enumerate(surface_pts(hb, 16, random.Random(31), rx=1.0, y0=0.1, y1=1.2, zmin=0.15)):
            sp = mn.cyl('ice', 0.02, 0.07, loc=q, m=M['ice'], verts=5, bevel=0.003); sp.rotation_euler = (nor.y * -0.6, nor.x * 0.6, 0); out.append(sp)
    # veins arching over the mass, flank to flank, hugging it
    zk = 0.7 if husk else 1.0
    for k, dy in enumerate((0.2, 0.6, 0.98)):
        w = (1.02 - abs(dy - 0.6) * 0.35) * (0.88 if husk else 1.0)
        top = (1.3 - abs(dy - 0.55) * 0.45) * s * zk
        pts = [(-w, dy + 0.08, FLOOR_Z + 0.22 * zk), (-w * 0.7, dy + 0.03, top * 0.78), (-w * 0.15, dy, top + 0.03), (w * 0.45, dy, top * 0.9), (w, dy + 0.1, FLOOR_Z + 0.22 * zk)]
        rr = 0.075 * (1 + 0.2 * p) * (0.7 if husk else 1.0)
        tendril('heart_art', pts, [rr * 0.8, rr, rr * 1.05, rr, rr * 0.8], tm, out, segs=10)
    # the grip: two tendrils over the box, clamped down its front (live); unwound and lying limp (open / husk)
    for su in (-1, 1):
        if state == 'live':
            pts = [(su * 0.16, 0.34, FLOOR_Z + 0.8 * s), (su * 0.08, 0.08, FLOOR_Z + 0.42), (-su * 0.12, -0.12, FLOOR_Z + 0.33), (-su * 0.27, -0.23, FLOOR_Z + 0.17), (-su * 0.34, -0.3, FLOOR_Z + 0.03)]
            rr = [0.09, 0.075, 0.062, 0.05, 0.04]
        else:
            pts = [(su * 0.3, 0.2, FLOOR_Z + 0.36), (su * 0.62, 0.0, FLOOR_Z + 0.2), (su * 0.95, 0.02, FLOOR_Z + 0.08), (su * 1.2, 0.2, FLOOR_Z + 0.05), (su * 1.3, 0.42, FLOOR_Z + 0.04)]
            rr = [0.09, 0.075, 0.06, 0.045, 0.025]
            if husk: rr = [r * 0.75 for r in rr]
        tendril('grip', pts, [r * (1 + 0.12 * p) for r in rr], tm, out, random.Random(40 + su),
                nod_mat=None if husk else (M['nod'] if state == 'live' else M['nod_dim']), every=4)
    # rootlets spreading over the floor round its base
    for k, a in enumerate((-0.15, 0.5, 1.5, 2.6, 3.3)):
        L = (0.75, 0.6, 0.5, 0.6, 0.75)[k]; c = (0, 0.52)
        pts = []
        for j in range(5):
            u = j / 4; rr_ = 0.85 + L * u
            pts.append((c[0] + math.cos(a + 0.25 * math.sin(j * 1.7)) * rr_ * 1.25, c[1] + math.sin(a + 0.25 * math.sin(j * 1.7)) * rr_ * 0.8, FLOOR_Z + 0.035 - 0.015 * u))
        rr = [0.055, 0.045, 0.033, 0.022, 0.01]
        if husk: rr = [r * 0.75 for r in rr]
        tendril('hroot', pts, rr, tm, out, segs=8)
    return out

def build_heart(state):
    t0 = time.time()
    reset(); M = mats(); static = []
    n = 1 if state == 'husk' else 8
    if state == 'live': black_box(M, static)
    if state == 'open':                            # the empty hollow: wet ooze, slime strings off the mass's front
        static.append(disc('hollow', 0.0, 0.0, FLOOR_Z + 0.003, 0.4, M['ooze'], sv=0.7))
        for k, (x, y0) in enumerate(((-0.2, 0.12), (0.05, 0.1), (0.25, 0.14))):
            pts = [(x, y0 + 0.08, FLOOR_Z + 0.36), (x + 0.03, y0 - 0.06, FLOOR_Z + 0.16), (x + 0.02, y0 - 0.16, FLOOR_Z + 0.02)]
            static.append(O.tube('slime', [Vector(p) for p in pts], [0.012, 0.008, 0.015], O.slime_mat('s7_slime', '#c060c0', glow=0.2), segs=6))
    if state == 'husk':
        rng = random.Random(77)
        for k in range(7): frost_disc(rng.uniform(-1.1, 1.1), rng.uniform(-1.6, 0.3), rng.uniform(0.3, 0.55), M, static, rot=rng.uniform(0, 3), k=k)
        ice_spikes(0, -0.6, 0.9, 14, M, static, rng)
    sets = [heart_frame(M, f, n, state) for f in range(n)]
    frames = list(range(1, n + 1))
    if n > 1:
        per_frame(sets, frames)
        for mat_key, base in (('nod_pink', 1.2), ('heart', None)):
            m = M[mat_key]
            for j, f in enumerate(frames):
                p = beat(j / n) * (0.45 if state == 'open' else 1.0)
                if base is not None:
                    sock = m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
                    sock.default_value = (0.7 if state == 'open' else 0.9) + 0.6 * p; sock.keyframe_insert('default_value', frame=f)
                else:
                    sp = m.node_tree.nodes['spots'].inputs[1]
                    sp.default_value = (0.7 if state == 'open' else 1.0) + 0.5 * p; sp.keyframe_insert('default_value', frame=f)
    allo = static + [o for s in sets for o in s]
    mn.outline([o for o in allo if o.name.split('.')[0] in ('heart', 'heart_art', 'grip', 'bb', 'bb_rib', 'bb_corner')], thickness=0.014)
    shadow_catcher((4.0, 4.0), loc=(0, 0.6, 0))
    render('s7_heart' + {'live': '', 'open': '_open', 'husk': '_husk'}[state], allo, frames=frames if n > 1 else None)
    print(f'[s7] heart {state} in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# Creep: tileable segment and the growing tip (8 directions, 1-unit tiles along Blender +X)
# ---------------------------------------------------------------------------------------------------
CR = 0.11
def creep_y(x): return 0.05 * math.sin(math.tau * x)
def creep_r(x): return CR * (1 + 0.1 * math.sin(2 * math.tau * x))
CZ = 0.03                       # our floors / the tube grating

def creep_seg(M, out):
    n = 41
    xs = [-0.5 + i / (n - 1) for i in range(n)]
    pts = [(x, creep_y(x), CZ + creep_r(x) * 0.88) for x in xs]; rad = [creep_r(x) for x in xs]
    o = tendril('creep', pts, rad, M['tend_p'], out, caps=False, segs=14)
    for x, sd in ((-0.22, 1), (0.18, -1)):
        out.append(mn.sphere('cnod', 0.04, loc=(x, creep_y(x) + sd * 0.03, CZ + creep_r(x) * 1.65), m=M['nod'], segs=10))
    out.append(mn.sphere('cnod', 0.028, loc=(0.36, creep_y(0.36) - 0.02, CZ + creep_r(0.36) * 1.7), m=M['pus'], segs=10))
    for x, sd in ((-0.05, 1), (0.3, -1), (-0.38, -1)):              # rootlets gripping the floor
        pts = [(x, creep_y(x) + sd * 0.07, CZ + 0.05), (x + 0.05, creep_y(x) + sd * 0.17, CZ + 0.02), (x + 0.12, creep_y(x) + sd * 0.22, CZ + 0.008)]
        tendril('crootlet', pts, [0.03, 0.018, 0.008], M['tend_p'], out, segs=8)
    return o

def creep_tip(M, out, f):
    t = f / 4
    ctrl = []
    for i in range(12):
        u = i / 11; x = -0.5 + 1.0 * u
        lift = 0.22 * u ** 2.2 * (1 + 0.35 * math.sin(math.tau * t))
        y = creep_y(x) if u < 0.3 else creep_y(x) + 0.09 * (u - 0.3) ** 1.3 * math.sin(math.tau * t + 1.0) * 2
        r = creep_r(x) * (1 - 0.82 * u ** 1.1) if u > 0 else creep_r(x)
        ctrl.append((x, y, CZ + creep_r(x) * 0.88 * (1 - u) + (r * 0.88) * u + lift, r))
    sm = smooth_path(ctrl, 4)
    pts = [p[:3] for p in sm]; rad = [p[3] for p in sm]
    tendril('creep', pts, rad, M['tend_p'], out, caps=True, segs=14)
    tip = Vector(pts[-1])
    for k, (a, l) in enumerate(((0.5, 0.16), (-0.4, 0.14), (0.05, 0.2))):      # feelers
        ph = math.sin(math.tau * t + k)
        q = [tip, tip + Vector((math.cos(a) * l * 0.5, math.sin(a) * l * 0.5, 0.03 + 0.02 * ph)), tip + Vector((math.cos(a + 0.3 * ph) * l, math.sin(a + 0.3 * ph) * l, 0.02 + 0.04 * ph))]
        tendril('feeler', q, [0.016, 0.011, 0.005], M['tend_p'], out, segs=6, cut=False)
    out.append(mn.sphere('cnod', 0.035, loc=(-0.18, creep_y(-0.18) + 0.03, CZ + creep_r(-0.18) * 1.65), m=M['nod'], segs=10))
    out.append(mn.sphere('cnod', 0.026, loc=(0.15, creep_y(0.15) - 0.01, CZ + 0.17), m=M['nod_hot'], segs=10))
    for x, sd in ((-0.3, 1), (0.0, -1)):
        pts = [(x, creep_y(x) + sd * 0.06, CZ + 0.05), (x + 0.05, creep_y(x) + sd * 0.15, CZ + 0.02), (x + 0.12, creep_y(x) + sd * 0.2, CZ + 0.008)]
        tendril('crootlet', pts, [0.028, 0.017, 0.008], M['tend_p'], out, segs=8)
    return out

def build_creep():
    for kind in ('seg', 'tip'):
        t0 = time.time()
        reset(); M = mats(); M['tend_p'] = periodic(M['tend'])
        if kind == 'seg':
            out = []; creep_seg(M, out); sets = [out]; frames = None
        else:
            sets = [creep_tip(M, [], f) for f in range(4)]; frames = [1, 2, 3, 4]; per_frame(sets, frames)
        allo = [o for s in sets for o in s]
        outl = mn.outline([o for o in allo if o.name.split('.')[0] == 'creep'], thickness=0.014)
        for o in outl:
            for md in o.modifiers:
                if md.name == 'outline': md.use_rim = False          # open tile ends: no dark ring at the seams
        root = mn.group('root', allo)
        render('s7_creep_' + kind, allo, root=root, dirs=8, frames=frames)
        print(f'[s7] creep {kind} in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# Vines on our capacitor (models/systems/capacitor.py shapes as holdout proxies)
# ---------------------------------------------------------------------------------------------------
def cap_geom(cmax):
    cw, gap, pad = 0.42, 5 / 48, 7 / 48
    W = cmax * cw + (cmax - 1) * gap + 14 / 48; Dp = 0.9
    cell_x = [-W / 2 + pad + cw / 2 + i * (cw + gap) for i in range(cmax)]
    return W, Dp, cell_x

def cap_proxy(cmax):
    W, Dp, cell_x = cap_geom(cmax)
    CB0, CB1, CZv = -Dp / 2 + 0.2, Dp / 2 - 0.04, 0.5
    R = 0.42 * 0.38; TOP = CZv + 0.04; Z1 = TOP + 0.62
    objs = [mn.box('px_plinth', (W, Dp, 0.1), bevel=0.03),
            mn.box('px_cab', (W - 0.06, CB1 - CB0, CZv - 0.1), loc=(0, (CB0 + CB1) / 2, 0.1), bevel=0.05),
            mn.box('px_lid', (W - 0.02, CB1 - CB0 + 0.04, 0.06), loc=(0, (CB0 + CB1) / 2, CZv - 0.02), bevel=0.025)]
    # (Blender Y here is the capacitor script's own Y: it builds with -Y = front, like everything else)
    for x in cell_x:
        objs.append(mn.cyl('px_cell', R + 0.03, Z1 - TOP + 0.08, loc=(x, 0.04, TOP - 0.01), verts=24, bevel=0))
    for o in objs: o.is_holdout = True
    return objs, dict(W=W, D=Dp, cells=cell_x, R=R, TOP=TOP, Z1=Z1, CB0=CB0, CB1=CB1)

def helix(cx, cy, r, z0, z1, turns, a0=0.0, n=None, rk=1.0):
    n = n or int(turns * 18) + 2
    return [(cx + math.cos(a0 + math.tau * turns * i / (n - 1) * rk) * r, cy + math.sin(a0 + math.tau * turns * i / (n - 1) * rk) * r, z0 + (z1 - z0) * i / (n - 1)) for i in range(n)]

def build_wrap(cmax):
    t0 = time.time()
    reset(); M = mats(); out = []
    proxy, g = cap_proxy(cmax)
    W, c0, c1 = g['W'], g['cells'][0], g['cells'][1]
    L = -W / 2; top = g['TOP']
    # A: from the floor at the back-left, up the left end, over the lid, two turns round the first cell, tip curling up
    ctrl = [(L - 0.75, 0.55, 0.04), (L - 0.35, 0.4, 0.05), (L - 0.08, 0.25, 0.25), (L + 0.03, 0.15, top + 0.06), (c0 - 0.15, 0.3, top + 0.08)]
    hel = helix(c0, 0.04, g['R'] + 0.06, top + 0.12, g['Z1'] - 0.05, 1.8, a0=math.pi * 0.6)
    tipc = [(hel[-1][0] + 0.08, hel[-1][1] - 0.1, g['Z1'] + 0.08), (hel[-1][0] + 0.02, hel[-1][1] - 0.18, g['Z1'] + 0.2), (hel[-1][0] - 0.06, hel[-1][1] - 0.12, g['Z1'] + 0.24)]
    sm = smooth_path(ctrl, 5) + hel + smooth_path(tipc, 3)
    n = len(sm); rad = [0.085 * (1 - 0.75 * (i / (n - 1)) ** 1.2) for i in range(n)]
    tendril('vine', sm, rad, M['tend'], out, random.Random(1), nod_mat=M['nod'], every=6, cut=False)
    # B: along the floor in front of the plinth, hooking over the front-left corner and onto the front panel
    ctrl = [(L - 0.8, -0.15, 0.05), (L - 0.3, -0.42, 0.05), (L + 0.1, -0.52, 0.08), (L + 0.25, -0.5, 0.2), (L + 0.38, -0.32, 0.36), (L + 0.55, -0.27, 0.42), (L + 0.75, -0.3, 0.3), (L + 0.82, -0.32, 0.18)]
    sm = smooth_path(ctrl, 5); n = len(sm); rad = [0.07 * (1 - 0.7 * i / (n - 1)) for i in range(n)]
    tendril('vine', sm, rad, M['tend'], out, random.Random(2), nod_mat=M['nod'], every=6, cut=False)
    # C: thin, over the lid from the back, one turn round the second cell
    ctrl = [(L - 0.4, 0.75, 0.04), (L + 0.2, 0.62, 0.15), (c0 + 0.2, 0.45, top + 0.05), ((c0 + c1) / 2, 0.25, top + 0.06)]
    hel = helix(c1, 0.04, g['R'] + 0.05, top + 0.1, top + 0.38, 1.1, a0=math.pi * 0.75)
    sm = smooth_path(ctrl, 5) + hel; n = len(sm); rad = [0.055 * (1 - 0.7 * (i / (n - 1))) for i in range(n)]
    tendril('vine', sm, rad, M['tend'], out, random.Random(3), nod_mat=M['nod'], every=7, cut=False)
    # fleshy pads where it grips, a little ooze
    for (x, y, z) in ((L + 0.02, 0.18, top + 0.03), (c0 - 0.3, 0.35, top + 0.02), (L + 0.32, -0.36, 0.38)):
        out.append(mn.sphere('pad', 0.07, loc=(x, y, z), m=M['flesh'], scale=(1.3, 1.0, 0.45), segs=14))
    out.append(disc('ooze', L - 0.3, -0.25 * -1, 0.004, 0.32, M['ooze'], sv=0.7))
    mn.outline([o for o in out if o.name.split('.')[0] == 'vine'], thickness=0.013)
    render('s7_wrap_capacitor' + ('' if cmax == 3 else str(cmax)), out)
    print(f'[s7] wrap cap{cmax} in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# The cryo freezer (origin = footprint centre; its back stands against a back wall)
# ---------------------------------------------------------------------------------------------------
def build_freezer(running):
    t0 = time.time()
    reset(); M = mats(); out = []; rng = random.Random(8)
    w, d, h = 1.5, 0.78, 1.38
    u0, u1, vb, vf = -w / 2, w / 2, -d / 2, d / 2
    cab = M['cab_frost'] if running else M['cab']
    out.append(ubox('frz', u0, vb, u1, vf, 0.0, h, cab, bevel=0.04))
    out.append(ubox('frz_trim', u0 - 0.01, vf - 0.05, u1 + 0.01, vf + 0.01, 0.06, 0.16, M['cab_trim'], bevel=0.01))
    out.append(ubox('frz_top', u0 + 0.05, vb + 0.05, u1 - 0.05, vf - 0.05, h, h + 0.12, M['dark'], bevel=0.02))
    for i in range(6): out.append(ubox('frz_vent', u0 + 0.15 + i * 0.2, vb + 0.15, u0 + 0.25 + i * 0.2, vf - 0.15, h + 0.12, h + 0.13, M['steel'], bevel=0))
    # the bay (it burst from the inside), dark or glowing cold
    out.append(ubox('frz_bay', u0 + 0.1, vf - 0.02, 0.25, vf + 0.005, 0.22, 1.18, M['cold_in'] if running else M['black'], bevel=0.0))
    for z in (0.5, 0.82):                                                   # bent shelf racks
        out.append(ubox('frz_rack', u0 + 0.12, vf - 0.01, 0.23, vf + 0.02, z, z + 0.025, M['steel'], bevel=0.004))
    # torn bay rim: jagged metal petals bent outwards
    for k in range(7):
        z = 0.3 + k * 0.13; side = -1 if k % 2 else 1
        u = u0 + 0.12 if side < 0 else 0.23
        p = cbox('frz_petal', u, vf + 0.04, 0.12, 0.03, z, 0.09, M['cab'], bevel=0.008, rotz=side * 0.6); out.append(p)
    # the door, hanging off its left hinge, buckled
    ang = math.radians(118); hu, hv = u0, vf
    du, dv = math.cos(ang), math.sin(ang); Ld = 1.0
    door = mn.box('frz_door', (Ld, 0.07, 1.0), loc=P(hu + du * Ld / 2, hv + dv * Ld / 2, 0.18), m=cab, bevel=0.02)
    door.rotation_euler = (0.06, -0.05, math.atan2(-dv, du)); out.append(door)
    win = mn.box('frz_win', (0.5, 0.075, 0.35), loc=P(hu + du * Ld * 0.55, hv + dv * Ld * 0.55 + 0.01, 0.65), m=M['glass'], bevel=0.01)
    win.rotation_euler = door.rotation_euler; out.append(win)
    # right column: screen, LED, the label
    out.append(ubox('frz_scr', 0.33, vf, 0.68, vf + 0.02, 1.0, 1.24, M['cold_scr'] if running else M['screen_dead'], bevel=0.005))
    if running: out.append(text('frz_t', '-80 C', 0.505, vf + 0.025, 1.12, 0.09, M['ice'], face=True))
    out.append(mn.sphere('frz_led', 0.04, loc=P(0.505, vf + 0.02, 0.93), m=M['led_g'] if running else M['led_r'], segs=10))
    out.append(ubox('frz_lab', 0.29, vf, 0.72, vf + 0.015, 0.3, 0.86, M['white'], bevel=0.004))
    out.append(ubox('frz_labr', 0.29, vf + 0.012, 0.72, vf + 0.018, 0.76, 0.86, M['hazard_red'], bevel=0))
    out.append(text('frz_s7', 'S-7', 0.505, vf + 0.02, 0.63, 0.15, M['ink'], face=True))
    out.append(text('frz_g', 'GRAPPLER', 0.505, vf + 0.02, 0.5, 0.064, M['ink'], face=True))
    out.append(text('frz_g2', 'TISSUE', 0.505, vf + 0.02, 0.43, 0.064, M['ink'], face=True))
    out.append(text('frz_k', 'KEEP FROZEN', 0.505, vf + 0.02, 0.35, 0.058, M['cab_trim'], face=True))
    out.append(text('frz_brand', 'CRYO-MAX 9000', -0.1, vf + 0.02, 1.27, 0.07, M['cab_trim'], face=True))
    tape(0.2, vf + 0.02, 1.33, 0.5, M['tape'], out)
    out.append(ucyl('mug', 0.07, 0.11, 0.55, -0.1, h + 0.12, M['white'], verts=14, bevel=0.01))   # cold coffee
    out.append(ucyl('coffee', 0.058, 0.005, 0.55, -0.1, h + 0.225, pmat('coffee', '#2a1a10', 0.1), verts=14, bevel=0))
    if running:
        # frost: rime on the floor round it, icicles off the bay lip, ice needles, cold vapour pouring out
        for k in range(9): frost_disc(rng.uniform(-1.0, 0.9), rng.uniform(0.3, 1.25), rng.uniform(0.3, 0.55), M, out, rot=rng.uniform(0, 3), k=k)
        for k in range(6):
            u = u0 + 0.15 + k * 0.17
            out.append(mn.cyl('icicle', 0.025, 0.1 + 0.06 * (k % 3), loc=P(u, vf + 0.02, 1.08 - 0.06 * (k % 3)), m=M['ice'], verts=6, bevel=0.004))
        ice_spikes(-0.3, 0.85, 0.5, 10, M, out, rng)
        parts = [((-0.25, -(vf + 0.15), 0.5), 0.3, (1.6, 0.9, 1.2)), ((-0.3, -(vf + 0.45), 0.22), 0.36, (1.8, 1.2, 0.6)),
                 ((-0.1, -(vf + 0.8), 0.1), 0.38, (2.2, 1.3, 0.35)), ((-0.65, -(vf + 0.65), 0.1), 0.3, (1.6, 1.2, 0.35)),
                 ((0.4, -(vf + 0.7), 0.08), 0.26, (1.6, 1.2, 0.35))]
        mist = O.blob('mist', parts, m=M['mist'], res=0.04)
        O.cut_below(mist, 0.0); out.append(mist)
        mist['nodata'] = 1
    else:
        # burst open: torn S-7 tissue shreds hanging off the rack, ooze run-off, shards
        for (u, z, L) in ((-0.5, 0.82, 0.35), (-0.2, 0.5, 0.42), (0.05, 0.82, 0.3)):
            pts = [P(u, vf + 0.02, z), P(u + 0.03, vf + 0.1, z - L * 0.5), P(u - 0.02, vf + 0.14, z - L)]
            tendril('shred', pts, [0.05, 0.035, 0.015], M['tend'], out, segs=8, cut=False)
        stain(-0.3, vf + 0.45, 0.55, M['ooze'], out, sv=0.6)
        for k in range(6):
            out.append(cbox('shard', rng.uniform(-0.8, 0.4), rng.uniform(vf + 0.15, vf + 0.9), rng.uniform(0.05, 0.12), 0.04, 0.0, 0.01, M['glass'], bevel=0.003, rotz=rng.uniform(0, 3)))
    mn.outline([o for o in out if o.name.split('.')[0] in ('frz', 'frz_top', 'frz_door', 'mug')], thickness=0.013)
    shadow_catcher((3.0, 3.0))
    if running:                                     # the vapour isn't geometry: hide it in the data passes
        shiplib._hidden_in_data.append(mist)
    render('s7_freezer_' + ('on' if running else 'off'), out)
    print(f'[s7] freezer in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# J1, the lab's power junction (origin = the wall's foot under its centre; it sticks out 0.18 + door)
# ---------------------------------------------------------------------------------------------------
def build_junction(patched):
    t0 = time.time()
    reset(); M = mats(); out = []
    out.append(ubox('j1', -0.38, 0.0, 0.38, 0.18, 0.35, 1.05, M['j1'], bevel=0.02))
    out.append(ubox('j1_in', -0.3, 0.18, 0.3, 0.19, 0.42, 0.98, M['black'], bevel=0.0))
    door = mn.box('j1_door', (0.62, 0.03, 0.62), loc=P(-0.42 - 0.2, 0.4, 0.4), m=M['j1_door'], bevel=0.01)
    door.rotation_euler.z = math.radians(-60); out.append(door)
    for i in range(3):
        for j in range(2):
            out.append(mn.cyl('j1_sock', 0.05, 0.03, loc=P(-0.17 + i * 0.17, 0.19, 0.58 + j * 0.22), m=M['steel'], rot=(R90, 0, 0), verts=12, bevel=0.005))
    out.append(text('j1_t', 'J1  LAB POWER', 0.0, 0.19, 0.93, 0.065, M['ink'], face=True))
    out.append(mn.sphere('j1_led', 0.04, loc=P(0.3, 0.2, 1.0), m=M['led_g'] if patched else M['led_r'], segs=10))
    tape(0.0, 0.19, 0.45, 0.45, M['tape'], out)
    out.append(ubox('j1_conduit', -0.06, 0.0, 0.06, 0.1, 1.05, 1.6, M['steel'], bevel=0.02))
    if patched:                                              # patch leads + our tether plugged into the bottom-right socket
        out.append(pipe_uv('j1_lead', [(-0.17, 0.22, 0.8), (-0.05, 0.32, 0.7), (0.17, 0.22, 0.58)], 0.018, M['live']))
        out.append(pipe_uv('j1_lead', [(0.0, 0.22, 0.8), (0.1, 0.3, 0.68), (-0.17, 0.22, 0.58)], 0.018, M['cables'][1]))
        out.append(cbox('tplug', 0.17, 0.27, 0.13, 0.14, 0.52, 0.13, M['live'], bevel=0.02))
        out.append(pipe_uv('tether', [(0.17, 0.34, 0.585), (0.2, 0.5, 0.5), (0.18, 0.55, 0.2), (0.1, 0.6, 0.06), (0.0, 0.75, 0.055)], 0.055, M['tether'], corner=0.12))
        tape(0.1, 0.62, 0.06, 0.25, M['tape'], out, rotz=1.3)
    else:                                                    # a cut feed hanging out, frost
        out.append(pipe_uv('j1_cut', [(-0.17, 0.2, 0.58), (-0.2, 0.3, 0.45), (-0.15, 0.34, 0.3)], 0.02, M['cables'][0]))
    mn.outline([o for o in out if o.name.split('.')[0] in ('j1', 'j1_door', 'tplug', 'tether', 'j1_conduit')], thickness=0.012)
    shadow_catcher((2.0, 2.0))
    hb = ubox('frame', -1.0, 0.0, 0.4, 0.85, 0.0, 1.6, bevel=0); hb.hide_render = True    # dead/patched share a canvas
    render('s7_junction_' + ('patched' if patched else 'dead'), [hb] + out)
    print(f'[s7] junction in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
# Frost patches
# ---------------------------------------------------------------------------------------------------
def build_frost(var):
    reset(); M = mats(); out = []; rng = random.Random({'a': 1, 'b': 2}[var])
    for k in range(9):
        a = rng.uniform(0, math.tau); r = rng.uniform(0, 0.45)
        frost_disc(math.cos(a) * r * 1.2, math.sin(a) * r * 0.9, rng.uniform(0.28, 0.5), M, out, rot=rng.uniform(0, 3), k=k)
    ice_spikes(0, 0, 0.55, 9 if var == 'a' else 5, M, out, rng, h=(0.03, 0.09))
    for k in range(14 if var == 'b' else 6):                          # rime flakes
        a = rng.uniform(0, math.tau); r = rng.uniform(0, 0.6)
        out.append(cbox('flake', math.cos(a) * r * 1.2, math.sin(a) * r * 0.9, rng.uniform(0.04, 0.1), rng.uniform(0.03, 0.06), FLOOR_Z, 0.01, M['ice'], bevel=0.004, rotz=rng.uniform(0, 3)))
    render('s7_frost_' + var, out)

# ---------------------------------------------------------------------------------------------------
# A Red Comet pirate, cocooned on a back wall (origin = the wall's foot under it; the wall face is y = 0)
# ---------------------------------------------------------------------------------------------------
def build_cocoon():
    t0 = time.time()
    reset(); M = mats(); out = []; rng = random.Random(19)
    cv = 0.36                                                    # body axis, out from the wall
    zf = 0.18                                                    # hung up off the floor
    # the sac / web spread flat on the wall behind him
    web = O.blob('web', [((0, -0.02, 0.9), 0.55, (1.25, 0.12, 1.6)), ((0.3, -0.02, 1.35), 0.32, (1.3, 0.12, 1.0)),
                         ((-0.35, -0.02, 0.45), 0.3, (1.3, 0.12, 1.0)), ((0.15, -0.02, 0.2), 0.28, (1.6, 0.12, 0.8))], m=M['flesh'], res=0.03)
    out.append(web)
    for k in range(7):                                           # web strands spreading flat over the wall
        a = math.radians(-20 + k * 36 + rng.uniform(-8, 8)); L = rng.uniform(0.55, 0.85)
        pts = []
        for i in range(6):
            u = i / 5; r = 0.15 + L * u; b = a + 0.35 * math.sin(u * 3 + k)
            pts.append(P(math.cos(b) * r * 1.1, 0.06 - 0.03 * u, 0.85 + math.sin(b) * r * 1.1))
        tendril('strand', pts, [0.06 * (1 - 0.75 * i / 5) for i in range(6)], M['tend'], out, random.Random(80 + k), nod_mat=M['nod'] if k % 2 else None, every=3, segs=8, cut=False)
    out.append(mn.sphere('coc_body', 0.28, loc=P(0, cv, zf + 0.66), m=M['suit'], scale=(1.0, 0.85, 1.6), segs=24))
    for su in (-0.1, 0.1):
        out.append(cbox('coc_boot', su, cv + 0.04, 0.13, 0.2, zf - 0.06, 0.16, M['rubber'], bevel=0.04))
    hx, hz = 0.07, zf + 1.24
    out.append(mn.sphere('coc_helm', 0.2, loc=P(hx, cv - 0.02, hz), m=M['armor'], scale=(1, 1, 1.05), segs=24))
    out.append(mn.sphere('coc_face', 0.125, loc=P(hx + 0.01, cv + 0.12, hz - 0.04), m=M['skin'], scale=(1, 0.85, 0.95), segs=16))
    for su in (-0.045, 0.045):                                   # eyes shut (dark slits)
        out.append(cbox('coc_eye', hx + 0.01 + su, cv + 0.225, 0.045, 0.012, hz - 0.01, 0.012, M['black'], bevel=0.002))
    out.append(cbox('coc_stubble', hx + 0.01, cv + 0.2, 0.12, 0.05, hz - 0.13, 0.05, M['rubber'], bevel=0.02))
    out.append(ubox('coc_brim', hx - 0.2, cv + 0.06, hx + 0.2, cv + 0.16, hz + 0.08, hz + 0.12, M['armor'], bevel=0.02))
    for k in range(7):                                           # the red bristle crest
        out.append(cbox('coc_crest', hx, cv + 0.1 - k * 0.05, 0.045, 0.04, hz + 0.15 - 0.012 * abs(k - 3), 0.14 - 0.012 * abs(k - 3), M['crest'], bevel=0.01))
    out.append(cbox('coc_pauldron', -0.22, cv + 0.02, 0.18, 0.22, zf + 1.02, 0.1, M['armor'], bevel=0.03, rotz=0.2))
    for k in range(3):                                           # spikes on it
        out.append(mn.cyl('coc_spike', 0.022, 0.08, loc=P(-0.28 + k * 0.06, cv + 0.02, zf + 1.11), m=M['steel'], verts=6, bevel=0.004))
    # one arm hanging out, the glove dangling
    out.append(O.tube('coc_arm', [P(0.24, cv + 0.05, zf + 1.0), P(0.38, cv + 0.12, zf + 0.75), P(0.4, cv + 0.16, zf + 0.5)], [0.075, 0.07, 0.065], M['suit']))
    out.append(mn.sphere('coc_glove', 0.075, loc=P(0.41, cv + 0.17, zf + 0.44), m=M['rubber'], segs=12))
    # a skull patch on the chest, half overgrown
    out.append(mn.cyl('coc_skull', 0.07, 0.01, loc=P(-0.08, cv + 0.25, zf + 0.92), m=M['bone'], rot=(R90, 0, 0), verts=16, bevel=0.003))
    # the wrap: thick tendril bands round him, tilted, a membrane over the middle
    for k, (z, tilt, rr) in enumerate(((0.12, 0.08, 0.29), (0.38, -0.08, 0.31), (0.64, 0.1, 0.32), (0.9, -0.09, 0.31))):
        pts = []
        for i in range(21):
            a = i / 20 * math.tau
            pts.append(P(math.cos(a) * rr, cv + math.sin(a) * rr * 0.8, zf + z + tilt * math.cos(a)))
        o = tendril('coc_wrap', pts, [0.055 + 0.015 * math.sin(i * 1.3 + k) for i in range(len(pts))], M['tend'], out, random.Random(60 + k), nod_mat=M['nod'], every=6, caps=False, cut=False)
    sac = O.blob('coc_sac', [((0, -cv - 0.02, zf + 0.5), 0.3, (1.08, 0.9, 1.25))], m=M['membrane'], res=0.025)
    out.append(sac)
    for i in range(5):
        out.append(mn.sphere('nod', 0.04, loc=P(rng.uniform(-0.35, 0.35), 0.06, rng.uniform(0.3, 1.5)), m=M['nod'], segs=10))
    stain(0.0, 0.35, 0.45, M['ooze'], out, sv=0.6)
    mn.outline([o for o in out if o.name.split('.')[0] in ('coc_body', 'coc_helm', 'coc_wrap', 'coc_arm', 'coc_sac', 'coc_pauldron', 'web')], thickness=0.013)
    shadow_catcher((2.4, 2.0), loc=(0, -0.6, 0))
    render('s7_cocoon_pirate', out)
    print(f'[s7] cocoon in {time.time() - t0:.0f} s')

# ---------------------------------------------------------------------------------------------------
if __name__ == '__main__':
    T = time.time()
    if 'mats' in WHAT:
        rooms = [s.split('=')[1] for s in SUB] or ['airlock', 'lab', 'core']
        for room in rooms:
            for husk in (False, True): build_mat(room, husk)
    if 'tendril' in WHAT: build_tendrils()
    if 'heart' in WHAT:
        for st in ([s.split('=')[1] for s in SUB] or ['live', 'open', 'husk']): build_heart(st)
    if 'creep' in WHAT: build_creep()
    if 'wrap' in WHAT:
        for c in (3, 4): build_wrap(c)
    if 'freezer' in WHAT:
        for r in (False, True): build_freezer(r)
    if 'junction' in WHAT:
        for p in (False, True): build_junction(p)
    if 'frost' in WHAT:
        for v in ('a', 'b'): build_frost(v)
    if 'cocoon' in WHAT: build_cocoon()
    print(f'[s7] total {time.time() - T:.0f} s')
