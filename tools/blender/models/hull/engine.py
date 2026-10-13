"""The ship's engine (js/art.js drawEngineBell / drawEngines / drawEngineHousing; ENGINE in js/ship.js).

Sprites (build/renders/hull/):
  engine_bell_cruise_f<0..3>   the big flattened nozzle sticking out of the stern: hot orange rim, blue-white exhaust plate
                               (flicker loop; the game's throttle sits at ~0.45 all the time)
  engine_bell_spool_f<0..3>    jump drive spooling up (mission.jump set, until the jump): blue-white, pulsing
  engine_bell_off              cold (no flame: throttle 0)
      origin = game (ENGINE.x, SHIP_H) = (22.2, 26.1) on the deck plane (the middle of the stern edge).
      Rendered with the hull slab as a holdout, so the part inside the hull is cut away: draw it AFTER the
      hull tiles (it sits in front of the stern face).
  engine_flame_cruise_f<0..7>  the blue exhaust plume coming out of the bell (flicker: the game picks frames at random)
  engine_flame_spool_f<0..7>   the same while the jump drive spools: longer, brighter, whiter, pulsing
      origin = the bell's. An emissive volume (white-hot core, cyan/blue body, violet edge, shock diamonds,
      noise turbulence; flame_mat) rendered on black with the bell and the hull as black occluders, then
      glowify: alpha = brightness, colour = rgb / alpha, beauty only. Draw it unlit right after the bell: it
      only adds light. Per-frame length and brightness: FLAME_STATES (mirrored in js/art.js FLAME_FRAMES,
      which also drives the flickering light at the nozzle in js/lights.js).
  engine_housing_f<0..5>       the engine block inside the reactor room (19.4..25.0 x 23.9..25.5): turbine
                               intake turning (6 frames = 60 deg, the blades repeat), warm glow
  engine_housing_spool_f<0..5> the same while the jump drive spools: blue glow
      origin = game (ENGINE.x, ENGINE.y) = (22.2, 23.9): the middle of the housing's north edge, on the floor.
      Draw it where drawEngineHousing is drawn now (after the floors).

    blender -b --factory-startup --python tools/blender/models/hull/engine.py [-- quick] [-- only=bell,housing,flame]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hulllib import *
import body

ARGS = args()
QUICK = 'quick' in ARGS
ONLY = next((a.split('=')[1].split(',') for a in ARGS if a.startswith('only=')), None)
if QUICK: mn.SAMPLES = 16
def want(k): return ONLY is None or k in ONLY

EX, EY = ENGINE['x'], SHIP_H                  # bell origin
AXZ = -0.6                                     # nozzle axis height (middle of the hull's thickness)

def L(x, y, z=0.0):                            # bell-local game coords (relative to (EX, EY)) -> Blender
    return G(x, y, z)

def superellipse(w, h, n=3.2, seg=48):
    out = []
    for i in range(seg):
        a = i / seg * math.tau; c, s = math.cos(a), math.sin(a)
        out.append((w * math.copysign(abs(c) ** (2 / n), c), h * math.copysign(abs(s) ** (2 / n), s)))
    return out

def loft(name, stations, m, seg=48, cap0=False, cap1=False, flip=False):
    """Tube through cross-sections: stations = [(y, w, h)] (bell-local game y), axis at z = AXZ."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for (y, w, h) in stations:
        rings.append([bm.verts.new(L(x, y, AXZ + z)) for x, z in superellipse(w, h, seg=seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            f = bm.faces.new((a[i], a[j], b[j], b[i]) if not flip else (a[i], b[i], b[j], a[j]))
    if cap0: bm.faces.new(rings[0][::-1] if not flip else rings[0])
    if cap1: bm.faces.new(rings[-1] if not flip else rings[-1][::-1])
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return mn.smooth(o)

def heat_mat(name, cold, hot, y0, y1):
    """Metal that shifts from `cold` to a heat tint towards the mouth (Blender -y = game +y)."""
    m = worn(name, cold, 0.4, 0.6, wear=0.6)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; src = b.inputs['Base Color'].links[0].from_socket
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sp.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -y0; mr.inputs['From Max'].default_value = -y1
    Lk(sp.outputs['Y'], mr.inputs['Value'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; Lk(mr.outputs[0], mx.inputs['Factor'])
    Lk(src, mx.inputs[6]); mx.inputs[7].default_value = (*lift(hot), 1)
    Lk(mx.outputs[2], b.inputs['Base Color'])
    return m

def glow_mat(name, color, strength):
    m = emit_mat(name, color, strength, base='#1a1c22')
    return m

# ---------------------------------------------------------------------------------------------------------
def build_bell():
    mn.reset()
    M = dict(
        shell=heat_mat('shell', '#5a6272', '#7a604f', 0.6, 1.6),
        inner=worn('inner', '#2b2a2e', 0.6, 0.5, wear=0.2, grime=1.5),
        band=worn('band', '#3a414f', 0.45, 0.5, wear=0.8),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        dark=worn('dark', '#1c1f25', 0.6, 0.3),
        hazard=hazard_mat('hazard', 5.0),
        tape=tape_mat(),
    )
    parts = []
    # outer shell: throat inside the hull, flaring out to the mouth at y = 1.45 (game 27.55)
    st = []
    for i in range(13):
        t = i / 12; y = -0.6 + t * 2.05
        k = max(0.0, (y - 0.0) / 1.45)
        st.append((y, 1.32 + 0.4 * k ** 1.6, 0.5 + 0.36 * k ** 1.3))
    parts.append(loft('shell', st, M['shell'], cap0=True))
    # inner surface (slightly smaller), joined to the outer one by a lip at the mouth
    ist = [(y, w - 0.07, h - 0.07) for (y, w, h) in st if y >= 0.55]
    inner = loft('inner', ist, M['inner'], flip=True)
    parts.append(inner)
    y1, w1, h1 = st[-1]
    lip = loft('lip', [(y1, w1, h1), (y1 + 0.001, w1 - 0.07, h1 - 0.07)], M['band'])
    parts.append(lip)
    # reinforcement bands and bolts
    for yb in (0.12, 0.62, 1.12):
        k = max(0.0, yb / 1.45); w = 1.32 + 0.4 * k ** 1.6; h = 0.5 + 0.36 * k ** 1.3
        parts.append(loft(f'band{yb}', [(yb - 0.06, w + 0.035, h + 0.035), (yb + 0.06, w + 0.035, h + 0.035)], M['band'], cap0=True, cap1=True))
        for i in range(10):
            a = (i + 0.5) / 10 * math.pi                                  # top half only (the rest is hidden)
            x, z = superellipse(w + 0.05, h + 0.05, seg=200)[int((a / math.tau) * 200) % 200]
            parts.append(mn.sphere('bolt', 0.03, loc=L(x, yb, AXZ + z), m=M['steel'], segs=8))
    # hazard chevron strip on top of the first band, a tape repair on the shell (of course)
    parts.append(mn.box('tape', (0.55, 0.12, 0.012), loc=L(0.7, 0.9, AXZ + 0.79), m=M['tape'], bevel=0.003, rot=(0.3, 0, 0.35)))
    # exhaust plate deep in the mouth: concentric rings, a central spike
    plate_y = 1.28
    k = plate_y / 1.45; pw = 1.32 + 0.4 * k ** 1.6 - 0.1; ph = 0.5 + 0.36 * k ** 1.3 - 0.1
    plate = loft('plate', [(plate_y, pw, ph), (plate_y + 0.02, pw, ph)], M['dark'], cap1=True)
    parts.append(plate)
    glows = []
    for i, f in enumerate((0.92, 0.7, 0.48)):
        g = loft(f'glow{i}', [(plate_y + 0.021 + i * 0.002, pw * f, ph * f), (plate_y + 0.03 + i * 0.002, pw * f, ph * f)], M['dark'], cap1=True)
        glows.append(g); parts.append(g)
    spike = mn.cyl('spike', 0.2, 0.2, loc=L(0, plate_y, AXZ), m=M['band'], verts=24, bevel=0.02, rot=(math.radians(90), 0, 0))
    for v in spike.data.vertices:
        t = v.co.z / 0.2; v.co.x *= (1 - 0.75 * t); v.co.y *= (1 - 0.75 * t)
    parts.append(spike)
    # holdout: the hull slab and the collar from body.py, so the bell is cut where the hull is in front
    hold = [prism('hold_slab', HULL, body.Z_SIDE, 0.0, None, bevel=0, under=body.BELLY_IN, z_under=body.Z_BELLY),
            prism('hold_collar', [(19.9, 26.0), (24.5, 26.0), (24.5, 26.2), (19.9, 26.2)], -1.15, -0.02, None, bevel=0)]
    for h in hold:
        h.data.transform(__import__('mathutils').Matrix.Translation((-EX, EY, 0)))
        h.is_holdout = True
    mn.outline([o for o in parts if o.name.startswith(('shell', 'band', 'lip'))], thickness=0.02)
    return parts, glows, M, inner, hold

def render_bell():
    parts, glows, M, inner, hold = build_bell()
    s = bpy.context.scene
    # glow materials: rings get brighter towards the centre; the inner wall glows faintly near the plate
    def set_state(col_out, col_in, k):
        for i, g in enumerate(glows):
            c = (col_out, col_in, col_in)[i]
            mn.assign(g, emit_mat(f'g{i}{c}{k:.2f}', c, (0.7 + 0.2 * i) * k, base=c))
        mn.assign(inner, emit_mat(f'in{col_out}{k:.2f}', col_out, 0.45 * k, base='#2b2a2e'))
    frames = [1, 2, 3, 4]
    t0 = time.time()
    for state, (co, ci, ks) in {'cruise': ('#ff7a2a', '#bfe6ff', (1.0, 1.15, 0.9, 1.1)),
                                'spool': ('#4aa8ff', '#d8f0ff', (0.8, 1.05, 1.3, 1.05))}.items():
        for i, k in enumerate(ks):
            set_state(co, ci, k)
            # (frames rendered one at a time: material swaps can't be keyframed simply)
            mn.render(f'hull/engine_bell_{state}_f{i}', objs=parts)
            manifest_patch(f'hull/engine_bell_{state}_f{i}', {'origin': 'game (22.2, 26.1) on the deck: middle of the stern edge',
                                                             'loop': f'engine_bell_{state}_f0..3'})
    for g in glows: mn.assign(g, M['dark'])
    mn.assign(inner, M['inner'])
    mn.render('hull/engine_bell_off', objs=parts)
    manifest_patch('hull/engine_bell_off', {'origin': 'game (22.2, 26.1) on the deck: middle of the stern edge'})
    print(f'[engine] bell: {time.time() - t0:.1f}s')


# ---------------------------------------------------------------------------------------------------------
# The exhaust plume: an emissive volume coming out of the bell's mouth (rendered on black, the bell and the
# hull as black occluders; turned into "light" sprites afterwards: alpha = brightness, see glowify)
class Nodes:
    """Tiny expression helper for shader node math (sockets or plain numbers)."""
    def __init__(self, nt): self.nt = nt; self.N = nt.nodes
    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        else: self.nt.links.new(v, sock)
    def m(self, op, a, b=None, clamp=False):
        n = self.N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        self._in(n.inputs[0], a)
        if b is not None: self._in(n.inputs[1], b)
        return n.outputs[0]
    def add(self, a, b): return self.m('ADD', a, b)
    def sub(self, a, b): return self.m('SUBTRACT', a, b)
    def mul(self, a, b): return self.m('MULTIPLY', a, b)
    def div(self, a, b): return self.m('DIVIDE', a, b)
    def pow(self, a, b): return self.m('POWER', a, b)
    def clamp(self, a): return self.m('ADD', a, 0.0, clamp=True)
    def exp(self, a): return self.m('EXPONENT', a)
    def value(self, name, v):
        n = self.N.new('ShaderNodeValue'); n.name = name; n.outputs[0].default_value = v; return n
    def noise(self, vec, w, scale, detail=3.0, rough=0.55):
        n = self.N.new('ShaderNodeTexNoise'); n.noise_dimensions = '4D'
        self.nt.links.new(vec, n.inputs['Vector']); self._in(n.inputs['W'], w)
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']

FLAME_PLATE = 1.26                             # where the plume starts (bell-local game y: the exhaust plate)

def flame_mat(ramp):
    """Volume emission in the flame object's space (origin on the plate, local -Y = downstream).
    Value nodes 'len' (plume length), 'gain' (brightness) and 'seed' (noise) are keyframed per frame."""
    m = bpy.data.materials.new('flame'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); E = Nodes(nt)
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Volume'])
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sp.inputs[0])
    X, Y, Z = sp.outputs['X'], sp.outputs['Y'], sp.outputs['Z']
    Ln, gain, seed = (E.value(k, v).outputs[0] for k, v in (('len', 3.4), ('gain', 1.0), ('seed', 0.0)))
    a = E.mul(Y, -1.0)                                            # distance downstream from the plate
    t = E.clamp(E.div(a, Ln))
    cv = N.new('ShaderNodeCombineXYZ'); E._in(cv.inputs[0], E.mul(X, 0.8)); E._in(cv.inputs[1], E.mul(a, 0.45)); E._in(cv.inputs[2], Z)
    n1 = E.noise(cv.outputs[0], seed, 1.6); n2 = E.noise(cv.outputs[0], E.add(seed, 7.3), 1.6)
    n3 = E.noise(cv.outputs[0], E.add(seed, 13.1), 4.5, detail=5.0)
    wob = E.mul(t, 1.0)                                           # wobble grows downstream
    xs = E.add(X, E.mul(E.sub(n1, 0.5), E.mul(wob, 0.55)))
    zs = E.add(Z, E.mul(E.sub(n2, 0.5), E.mul(wob, 0.35)))
    wx = E.sub(1.42, E.mul(t, 0.85))                              # flattened like the nozzle, narrowing and rounding off
    hz = E.sub(0.6, E.mul(t, 0.2))
    rn2 = E.add(E.pow(E.div(xs, wx), 2.0), E.pow(E.div(zs, hz), 2.0))
    start = E.clamp(E.div(E.add(a, 0.04), 0.14))
    fend = E.pow(E.sub(1.0, t), 1.5)
    body = E.mul(E.exp(E.mul(rn2, -2.4)), fend)
    core = E.mul(E.exp(E.mul(rn2, -18.0)), E.pow(E.clamp(E.sub(1.0, E.mul(t, 1.25))), 1.1))
    # shock diamonds: bright knots along the axis
    ph = E.mul(E.sub(a, 0.35), math.tau / 0.78)
    dia = E.pow(E.add(0.5, E.mul(E.m('COSINE', ph), 0.5)), 10.0)
    dia = E.mul(E.mul(dia, E.exp(E.mul(rn2, -9.0))), E.mul(E.clamp(E.sub(1.0, E.mul(t, 1.35))), E.clamp(E.div(a, 0.35))))
    turb = E.add(0.3, E.mul(n3, 1.4))
    I = E.mul(E.add(E.add(E.mul(E.mul(body, turb), 0.55), E.mul(core, 1.6)), E.mul(dia, 2.0)), start)
    cr = N.new('ShaderNodeValToRGB'); E._in(cr.inputs[0], E.mul(I, 0.9))
    el = cr.color_ramp.elements
    el[0].position, el[0].color = ramp[0]
    el[1].position, el[1].color = ramp[-1]
    for pos, col in ramp[1:-1]:
        e = el.new(pos); e.color = col
    nt.links.new(cr.outputs[0], em.inputs['Color'])
    E._in(em.inputs['Strength'], E.mul(I, gain))
    return m

def glowify(path):
    """Rendered on black → a sprite to draw over the scene: alpha = brightness, colour = rgb / alpha
    (alpha-blended, this adds about the rendered light: the plume never darkens what's under it)."""
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    al = a.max(axis=2)
    al = np.clip((al - 3.0) * 255.0 / 252.0, 0, 255)               # cut the denoiser's floor
    col = np.where(al[..., None] > 0, np.clip(a * 255.0 / np.maximum(a.max(axis=2), 1)[..., None], 0, 255), 0)
    Image.fromarray(np.dstack([col, al]).astype(np.uint8), 'RGBA').save(path)

FLAME_STATES = {
    # ramp: (position, rgba linear) on the brightness; frames: (length, gain) per frame of the loop
    'cruise': dict(ramp=[(0.0, (0.16, 0.02, 0.45, 1)), (0.18, (0.08, 0.12, 1.0, 1)), (0.45, (0.05, 0.55, 1.0, 1)),
                         (0.75, (0.55, 0.88, 1.0, 1)), (1.0, (1.0, 1.0, 1.0, 1))],
                   frames=[(3.8, 1.0), (4.1, 1.08), (3.65, 0.92), (4.0, 1.04), (3.9, 0.97), (4.25, 1.12), (3.7, 0.95), (4.05, 1.02)]),
    'spool':  dict(ramp=[(0.0, (0.3, 0.05, 0.6, 1)), (0.15, (0.2, 0.25, 1.0, 1)), (0.4, (0.25, 0.75, 1.0, 1)),
                         (0.65, (0.75, 0.95, 1.0, 1)), (1.0, (1.0, 1.0, 1.0, 1))],
                   frames=[(4.0, 1.25), (4.5, 1.45), (5.0, 1.65), (4.6, 1.5), (4.2, 1.3), (4.7, 1.55), (5.1, 1.7), (4.4, 1.4)]),
}
# (the game's light at the nozzle follows these per frame: FLAME_FRAMES in js/art.js)

def render_flame():
    t0 = time.time()
    for state, S in FLAME_STATES.items():
        parts, glows, M, inner, hold = build_bell()
        s = bpy.context.scene
        s.render.film_transparent = False
        s.world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
        s.cycles.volume_bounces = 0; s.cycles.volume_step_rate = 0.3; s.cycles.max_bounces = 0
        black = bpy.data.materials.new('black'); black.use_nodes = True; nt = black.node_tree; nt.nodes.clear()
        e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (0, 0, 0, 1)
        nt.links.new(e.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
        for o in list(s.objects):
            if o.type == 'LIGHT': bpy.data.objects.remove(o); continue
            if o.type != 'MESH': continue
            for md in list(o.modifiers):
                if md.name == 'outline': o.modifiers.remove(md)
            o.is_holdout = False
            o.data.materials.clear(); o.data.materials.append(black)
        Lmax = max(f[0] for f in S['frames']) + 0.3
        me = bpy.data.meshes.new('flame'); bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:                                         # local: x ±1.7, downstream (-y) -0.05 .. Lmax, z ±0.85
            v.co.x *= 3.4; v.co.z *= 1.7; v.co.y = 0.05 if v.co.y > 0 else -Lmax
        bm.to_mesh(me); bm.free()
        fl = mn.link(bpy.data.objects.new('flame', me)); fl.location = L(0, FLAME_PLATE, AXZ)
        mat = flame_mat(S['ramp']); fl.data.materials.append(mat)
        V = {k: mat.node_tree.nodes[k].outputs[0] for k in ('len', 'gain', 'seed')}
        frames = list(range(1, len(S['frames']) + 1))
        for i, (ln, g) in enumerate(S['frames']):
            s.frame_set(frames[i])
            for k, v in (('len', ln), ('gain', g * (2.4 if state == 'cruise' else 1.6)), ('seed', 11.7 * i + (40 if state == 'spool' else 0))):
                V[k].default_value = v; V[k].keyframe_insert('default_value', frame=frames[i])
        name = f'hull/engine_flame_{state}'
        mn.render(name, objs=[fl], frames=frames, passes=('beauty',))
        for i in range(len(frames)): glowify(os.path.join(mn.OUT_DIR, f'{name}_f{i}.png'))
        manifest_patch(name, {'origin': 'game (22.2, 26.1): same as engine_bell; unlit, alpha = brightness (draw over the bell)',
                              'loop': True})
    print(f'[engine] flame: {time.time() - t0:.1f}s')

# ---------------------------------------------------------------------------------------------------------
def build_housing(spool):
    mn.reset()
    M = dict(
        body=worn('hbody', '#5f6879', 0.45, 0.35, wear=0.9),
        body2=worn('hbody2', '#3a414f', 0.5, 0.35, wear=0.6),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        dark=worn('dark', '#20242b', 0.6, 0.3),
        hazard=hazard_mat('hazard', 5.0),
        pipe=worn('pipe', '#7a5a3b', 0.4, 0.6, wear=0.5),
        stencil=worn('stencil', '#e8ecf4', 0.6, 0.0, wear=1.2, grime=0.5),
        tape=tape_mat(),
        blade=worn('blade', '#2a2d34', 0.4, 0.6, wear=0.4),
        glow=emit_mat('hglow', '#4aa8ff' if spool else '#ff9a48', 1.3, base='#401808'),
        lamp=emit_mat('lamp', '#5fd6a0', 1.2),
        lamp2=emit_mat('lamp2', '#7ac8ff' if spool else '#ffb03a', 1.3),
    )
    W2 = ENGINE['w'] / 2; Y0, Y1 = 0.0, 1.68; H = 0.85
    def B(x, y, z=0.0): return G(x, y, z)          # housing-local game coords (origin (22.2, 23.9))
    parts = []
    P = lambda o: parts.append(o) or o
    P(prism('base', [(-W2, Y0), (W2, Y0), (W2, Y1), (-W2, Y1)], 0.0, 0.12, M['body2'], bevel=0.03))
    P(prism('block', [(-W2 + 0.08, Y0 + 0.06), (W2 - 0.08, Y0 + 0.06), (W2 - 0.08, Y1 - 0.05), (-W2 + 0.08, Y1 - 0.05)], 0.1, H, M['body'], bevel=0.05, inset=0.06, chamfer=0.06))
    P(gbox('haz', -W2 + 0.2, Y0 + 0.14, W2 - 0.2, Y0 + 0.33, H - 0.01, H + 0.008, M['hazard'], bevel=0.004))
    # intake: ring, well, glow, turning blades
    cx, cy, r = 0.0, Y0 + Y1 * 0.62 + 0.02, 0.55
    cutter = gcyl('cutter', cx, cy, r + 0.01, H - 0.3, H + 0.5, M['dark'], verts=48, bevel=0.0)
    blk = parts[1]; md = blk.modifiers.new('hole', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cutter; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = blk; bpy.ops.object.modifier_move_to_index(modifier='hole', index=0)
    bpy.ops.object.modifier_apply(modifier='hole'); bpy.data.objects.remove(cutter)
    P(ring('intake_ring', r + 0.1, 0.14, 0.08, loc=B(cx, cy, H - 0.02), m=M['steel'], verts=48))
    P(ring('well', r, 0.05, 0.24, loc=B(cx, cy, H - 0.25), m=M['dark'], verts=48))
    P(gcyl('well_floor', cx, cy, r, H - 0.27, H - 0.25, M['dark'], verts=48, bevel=0.0))
    P(gcyl('glow', cx, cy, r * 0.82, H - 0.24, H - 0.2, M['glow'], verts=48, bevel=0.0))
    for i in range(12):
        a = i / 12 * math.tau
        P(gsphere('ring_bolt', cx + math.cos(a) * (r + 0.04), cy + math.sin(a) * (r + 0.04), H + 0.06, 0.022, M['dark'], segs=8))
    rotor = mn.link(bpy.data.objects.new('rotor', None)); rotor.location = B(cx, cy, H - 0.12)
    blades = []
    for i in range(6):
        a = i / 6 * math.tau
        bl = mn.box('blade', (r * 0.82, 0.12, 0.02), loc=(0, 0, 0), m=M['blade'], bevel=0.008)
        bl.location = (math.cos(a) * r * 0.45, math.sin(a) * r * 0.45, 0); bl.rotation_euler = (0.45, 0, a)
        bl.parent = rotor; blades.append(bl); parts.append(bl)
    hub = mn.cyl('hub', 0.12, 0.08, loc=(0, 0, -0.02), m=M['steel'], verts=20, bevel=0.02); hub.parent = rotor; parts.append(hub)
    # side pipes (the 2D's brown pipes), clamps
    for sx in (-1, 1):
        x = sx * W2 * 0.72
        P(tube('pipe', [(x, Y0 + 0.5, H + 0.08), (x, Y1 - 0.15, H + 0.08), (x, Y1 + 0.02, H - 0.25)], 0.11, M['pipe']))
        for yy in (0.7, 1.2):
            P(gbox('clamp', x - 0.15, Y0 + yy - 0.04, x + 0.15, Y0 + yy + 0.04, H - 0.01, H + 0.2, M['steel'], bevel=0.015))
    P(text('engine_txt', 'ENGINE', 1.15, Y0 + 1.3, H + 0.002, 0.22, M['stencil']))
    # status lamps, a vent grille on the front face, the tape
    for i, lx in enumerate((-W2 + 0.35, -W2 + 0.6)):
        P(gsphere('lamp', lx, Y1 - 0.3, H + 0.01, 0.06, M['lamp'] if i == 0 else M['lamp2'], segs=12))
    for k in range(4):
        P(gbox('front_slat', -1.2, Y1 - 0.05, 1.2, Y1 - 0.01, 0.2 + k * 0.13, 0.27 + k * 0.13, M['dark'], bevel=0.008))
    P(mn.box('tape', (0.5, 0.12, 0.012), loc=G(-1.15, Y0 + 0.62, H + 0.004), m=M['tape'], bevel=0.003, rot=(0, 0, -0.4)))
    mn.outline([o for o in parts if o.name.startswith(('base', 'block', 'intake_ring', 'pipe', 'clamp'))], thickness=0.014)
    return parts, rotor

def render_housing():
    for spool in (False, True):
        parts, rotor = build_housing(spool)
        s = bpy.context.scene
        frames = list(range(1, 7))
        for i, f in enumerate(frames):
            s.frame_set(f); rotor.rotation_euler.z = -math.radians((20 if spool else 10) * i)
            rotor.keyframe_insert('rotation_euler', frame=f)
        name = 'hull/engine_housing' + ('_spool' if spool else '')
        mn.render(name, objs=[o for o in parts], frames=frames)
        manifest_patch(name, {'origin': 'game ENGINE (22.2, 23.9) on the floor: middle of the housing\'s north edge', 'loop': True})

if __name__ == '__main__':
    T = time.time()
    if want('bell'): render_bell()
    if want('housing'): render_housing()
    if want('flame'): render_flame()
    print(f'[engine] total {time.time() - T:.1f}s')
