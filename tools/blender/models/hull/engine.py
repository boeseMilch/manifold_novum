"""The ship's engine (js/art.js drawEngineBell / drawEngines / drawEngineHousing; ENGINE in js/ship.js).

Sprites (build/renders/hull/):
  engine_bell_cruise_f<0..3>   the big flattened nozzle sticking out of the stern, exhaust plate glowing orange
                               (flicker loop; the game's throttle sits at ~0.45 all the time)
  engine_bell_spool_f<0..3>    jump drive spooling up (mission.jump set, until the jump): blue-white, pulsing
  engine_bell_off              cold (no flame: throttle 0)
      origin = game (ENGINE.x, SHIP_H) = (22.2, 26.1) on the deck plane (the middle of the stern edge).
      Rendered with the hull slab as a holdout, so the part inside the hull is cut away: draw it AFTER the
      hull tiles (it sits in front of the stern face). The flame/plume stays procedural (drawEngines'
      gradient, drawn under the bell from about game y 27.4 on).
  engine_housing_f<0..5>       the engine block inside the reactor room (19.4..25.0 x 23.9..25.5): turbine
                               intake turning (6 frames = 60 deg, the blades repeat), warm glow
  engine_housing_spool_f<0..5> the same while the jump drive spools: blue glow
      origin = game (ENGINE.x, ENGINE.y) = (22.2, 23.9): the middle of the housing's north edge, on the floor.
      Draw it where drawEngineHousing is drawn now (after the floors).

    blender -b --factory-startup --python tools/blender/models/hull/engine.py [-- quick] [-- only=bell,housing]
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
    for state, (co, ci, ks) in {'cruise': ('#ff7a2a', '#ffcf7a', (1.0, 1.15, 0.9, 1.1)),
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
    print(f'[engine] total {time.time() - T:.1f}s')
