"""The raider's nav console (js/dock.js drawNavConsole; chapter 4: pull its core), in the core room beside the reactor.

    blender -b --factory-startup --python tools/blender/models/dock/navconsole.py

  dock/raider_navconsole   4 frames on one canvas: 0 port layout with its core in (d.navcore), 1 port, core pulled,
                           2 / 3 the same for the starboard layout (a mirrored build, text the right way round).
The origin is g.nav on the floor; the footprint is the 2D drawing's desk, 1.1 x 0.84 around it (click radius 0.6).
Layout as in the 2D version: the chart screen on the left, the core's slot at the right end, NAV on the front.
The core in the slot is the item itself (models/items/itemlib.py B_navcore, items/navcore*).
No baked ground shadow (the runtime's screen-space shadows do that, as for props/*).
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'items'))
import docklib as D
from docklib import *
import shiplib, itemlib as IL

W, DP, TOP = 1.1, 0.84, 0.66          # desk footprint (u, v) and the height of its top
SLOT = (0.36, 0.02)                   # the core's slot on the desk top (u, v)
CANVAS = (-0.8, 0.8, -1.0, 0.5, 1.36)  # u0, u1, v0, v1, z1: holds both layouts and both states

def mats():
    return dict(
        plinth=worn('plinth', '#3a3036', 0.5, 0.6), paint=worn('paint', '#8a2e26', 0.45, 0.15, wear=0.8, rust=0.15),
        lid=worn('lid', '#4a3c40', 0.4, 0.6), steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6),
        dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9), hazard=stripes_mat('hazard'),
        tape=pmat('tape', '#b9bcc2', 0.85), ink=pmat('ink', '#23252b', 0.6), white=pmat('white', '#e8e4d8', 0.6),
        sticker=pmat('sticker', '#f2df6b', 0.6), rubber=pmat('rubber', '#262a33', 0.7),
        copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3), paper=pmat('paper', '#e8dcb8', 0.8, grime=0.3),
        key=pmat('key', '#3a3f4a', 0.5), keyl=pmat('keyl', '#c9c2ae', 0.5), mug=pmat('mug', '#c8ccd2', 0.35, 0.6),
        rum=pmat('rum', '#5a2c12', 0.3), wire_y=pmat('wire_y', '#ffcf6b', 0.5), wire_r=pmat('wire_r', '#d8463c', 0.5),
        wire_b=pmat('wire_b', '#3a5a8e', 0.5), cable=pmat('cable', '#9a5634', 0.6),
    )

def build(side, core):
    mn.reset(); set_side(side); shiplib._hidden_in_data.clear(); IL.make_mats()
    M = mats(); out = []; small = []
    def sm(o): small.append(o); out.append(o); return o
    # the cabinet: plinth, body, the desk top with a raised rim, the hooded chart screen at the back left
    out.append(cbox('plinth', 0, 0, W + 0.04, DP + 0.02, 0, 0.08, M['plinth'], bevel=0.03))
    out.append(cbox('body', 0, 0, W - 0.04, DP - 0.06, 0.06, TOP - 0.1, M['paint'], bevel=0.035))
    out.append(cbox('top', 0, 0, W, DP, TOP - 0.05, 0.05, M['lid'], bevel=0.02))
    out.append(ubox('front_hz', -W / 2 + 0.05, DP / 2 - 0.03, W / 2 - 0.05, DP / 2 - 0.015, 0.1, 0.18, M['hazard'], bevel=0.004))
    out.append(cbox('door', -0.14, DP / 2 - 0.035, 0.62, 0.02, 0.22, 0.34, M['lid'], bevel=0.012))
    sm(text('txt', 'NAV', -0.14, DP / 2 - 0.012, 0.45, 0.13, M['white'], face=True))
    for k in range(3): sm(ubox('slot', 0.3, DP / 2 - 0.03, 0.46, DP / 2 - 0.012, 0.28 + k * 0.07, 0.31 + k * 0.07, M['black'], bevel=0))
    for su in (-1, 1):
        for z in (0.24, 0.54): sm(face_rivet(-0.14 + su * 0.28, DP / 2 - 0.022, z, M['steel']))
    D.M_DARK[0] = M['ink']; sk = []; skull(0.38, DP / 2 - 0.014, 0.52, 0.16, M['white'], sk); [sm(o) for o in sk]
    # the hood and the screen (it faces the camera): their charts with the hideout marked, or NO CORE
    hu, hw = -0.19, 0.66
    out.append(cbox('hood', hu, -DP / 2 + 0.16, hw, 0.3, TOP, 0.44, M['lid'], bevel=0.04))
    out.append(cbox('hood_brow', hu, -DP / 2 + 0.3, hw + 0.04, 0.1, TOP + 0.4, 0.05, M['plinth'], bevel=0.015))
    sv = -DP / 2 + 0.315
    scr = glow('scr', '#0f3a4a' if core else '#3a0d0a', 0.7 if core else 0.5)
    out.append(ubox('scr', hu - hw / 2 + 0.05, sv - 0.01, hu + hw / 2 - 0.05, sv, TOP + 0.06, TOP + 0.37, scr, bevel=0.004))
    cy, rd = glow('chart', '#78e6ff', 1.2), glow('blip', '#ff5a4a', 1.4)
    if core:
        rng = random.Random(4)
        pts = [(-0.24, 0.13), (-0.13, 0.26), (0.0, 0.18), (0.12, 0.29), (0.2, 0.12)]
        for (a, za), (b, zb) in zip(pts, pts[1:]):                      # the course: a line from star to star
            ln = mn.box('line', (math.hypot(b - a, zb - za), 0.004, 0.012), m=cy, bevel=0)
            ln.location = P(hu + (a + b) / 2, sv + 0.003, TOP + 0.02 + (za + zb) / 2 - 0.006); ln.rotation_euler = (0, -D.S * math.atan2(zb - za, b - a), 0); sm(ln)
        for a, za in pts[:-1] + [(rng.uniform(-0.27, 0.27), rng.uniform(0.09, 0.33)) for _ in range(7)]:
            sm(ubox('star', hu + a - 0.011, sv, hu + a + 0.011, sv + 0.006, TOP + 0.02 + za - 0.011, TOP + 0.02 + za + 0.011, pmat('starm', '#cfe8ff', 0.4, emit='#cfe8ff', emit_strength=1.2), bevel=0))
        a, za = pts[-1]                                                  # the hideout: a red X
        for r in (0.8, -0.8):
            x = mn.box('x', (0.075, 0.005, 0.018), m=rd, bevel=0); x.location = P(hu + a, sv + 0.004, TOP + 0.02 + za - 0.009); x.rotation_euler = (0, r, 0); sm(x)
    else:
        sm(text('txt', 'NO CORE', hu, sv + 0.003, TOP + 0.24, 0.085, rd, face=True))
        sm(text('txt', 'CHARTS LOST', hu, sv + 0.003, TOP + 0.13, 0.05, rd, face=True))
    # the keyboard, a trackball, the course lever
    rng = random.Random(11)
    out.append(cbox('kb', -0.2, 0.2, 0.56, 0.24, TOP, 0.025, M['dark'], bevel=0.008))
    for i in range(9):
        for j in range(3):
            m = M['wire_r'] if (i, j) == (8, 0) else M['keyl'] if rng.random() < 0.25 else M['key']
            if (i, j) == (3, 1): continue                                # a key is missing
            sm(cbox('keycap', -0.44 + i * 0.06, 0.125 + j * 0.07, 0.046, 0.052, TOP + 0.025, 0.02, m, bevel=0.006))
    out.append(ucyl('ball_seat', 0.06, 0.03, 0.17, 0.26, TOP, M['steel'], verts=20, bevel=0.008))
    out.append(mn.sphere('ball', 0.045, loc=P(0.17, 0.26, TOP + 0.045), m=pmat('ball', '#e2574c', 0.25), segs=16))
    out.append(cbox('lev_box', 0.17, 0.08, 0.1, 0.12, TOP, 0.03, M['dark'], bevel=0.008))
    arm = mn.box('lev_arm', (0.022, 0.022, 0.14), m=M['steel'], bevel=0.006); knob = mn.sphere('lev_knob', 0.032, loc=(0, 0, 0.15), m=M['sticker'], segs=12)
    piv = mn.group('lev_piv', [arm, knob], loc=P(0.17, 0.08, TOP + 0.02)); piv.rotation_euler = (math.radians(25), 0, 0); out += [arm, knob]
    # the core's slot at the right end: a steel collar with clamps, a status lamp, a hand-painted warning
    su, sv2 = SLOT
    out.append(cbox('slot_base', su, sv2, 0.34, 0.5, TOP, 0.035, M['plinth'], bevel=0.012))
    out.append(ring('collar', 0.165, 0.045, 0.09, loc=P(su, sv2, TOP + 0.03), m=M['steel'], verts=32))
    out.append(ucyl('well', 0.122, 0.02, su, sv2, TOP + 0.03, M['black'], verts=24, bevel=0))
    for k in range(3):
        a = math.radians(90 + k * 120)
        out.append(cbox('clamp', su + math.cos(a) * 0.17, sv2 + math.sin(a) * 0.17, 0.07, 0.05, TOP + 0.03, 0.12, M['copper'], bevel=0.012, rotz=a))
    lamp = emit_mat('lamp', '#5aff8a' if core else '#ff3a2a', 1.3, base='#2a7a4a' if core else '#601010')
    out.append(ucyl('lamp_base', 0.035, 0.02, su - 0.1, sv2 + 0.215, TOP + 0.035, M['dark'], verts=12, bevel=0.005))
    out.append(mn.sphere('lamp', 0.028, loc=P(su - 0.1, sv2 + 0.215, TOP + 0.06), m=lamp, segs=12))
    sm(cbox('warn', su + 0.05, sv2 + 0.215, 0.17, 0.06, TOP + 0.035, 0.004, M['sticker'], bevel=0.001))
    sm(text('txt', 'HANDS OFF', su + 0.05, sv2 + 0.215, TOP + 0.041, 0.027, M['ink']))
    if core:
        parts = IL.B_navcore()
        g = mn.group('core', parts, loc=P(su, sv2, TOP - 0.01)); out += parts
        ld = bpy.data.lights.new('core_light', 'POINT'); ld.color = (0.45, 0.9, 1.0); ld.shadow_soft_size = 0.2; ld.energy = 5
        mn.link(bpy.data.objects.new('core_light', ld)).location = P(su - 0.25, sv2 + 0.25, TOP + 0.45)
    else:                                                               # torn out: the leads hang out of the well
        for k, (m, a, l) in enumerate(((M['wire_y'], 20, 0.2), (M['wire_r'], 150, 0.17), (M['wire_y'], 250, 0.22), (M['wire_b'], 310, 0.15))):
            c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
            out.append(pipe_uv('lead', [(su + c * 0.04, sv2 + s_ * 0.04, TOP + 0.02), (su + c * 0.08, sv2 + s_ * 0.08, TOP + 0.2), (su + c * (0.12 + l), sv2 + s_ * (0.12 + l), TOP + 0.13)], 0.011, m, corner=0.08))
            out.append(mn.sphere('lead_end', 0.015, loc=P(su + c * (0.12 + l), sv2 + s_ * (0.12 + l), TOP + 0.13), m=M['copper'], segs=8))
    # clutter: a rolled chart and a note on the hood, tape, a mug of rum, the cables to the wall
    roll = ucyl('chart_roll', 0.035, 0.46, hu - 0.2, -DP / 2 + 0.12, TOP + 0.475, M['paper'], axis='u', verts=16, bevel=0.006); out.append(roll)
    roll.location = P(hu - 0.23 if D.S > 0 else hu + 0.23, -DP / 2 + 0.12, TOP + 0.475)
    out.append(ring('roll_band', 0.039, 0.005, 0.03, loc=P(hu, -DP / 2 + 0.12, TOP + 0.475), m=M['wire_r'], rot=(0, R90, 0), verts=16))
    sm(cbox('note', hu + 0.22, -DP / 2 + 0.2, 0.11, 0.1, TOP + 0.44, 0.003, M['sticker'], bevel=0, rotz=0.25))
    tape(hu - 0.05, -DP / 2 + 0.22, TOP + 0.44, 0.2, M['tape'], out, rotz=-0.5); small.append(out[-1])
    out.append(ucyl('mug', 0.05, 0.1, -0.45, -0.02, TOP, M['mug'], verts=20, bevel=0.012))
    out.append(ucyl('rum', 0.04, 0.005, -0.45, -0.02, TOP + 0.097, M['rum'], verts=16, bevel=0))
    out.append(ring('mug_ear', 0.032, 0.012, 0.014, loc=P(-0.51, -0.02, TOP + 0.05), m=M['mug'], rot=(R90, 0, 0), verts=16))
    for k, (u, m, r) in enumerate(((-0.34, M['cable'], 0.03), (-0.26, M['wire_b'], 0.022))):
        out.append(pipe_uv('cable', [(u, -DP / 2 + 0.04, 0.34), (u, -DP / 2 - 0.1, 0.3), (u - 0.03 + k * 0.1, -DP / 2 - 0.2, 0.03), (u + 0.06 - k * 0.12, -0.92, 0.03)], r, m, corner=0.1))
    out.append(cbox('cable_clip', -0.3, -DP / 2 - 0.36, 0.2, 0.05, 0.0, 0.05, M['steel'], bevel=0.012))
    objs = [o for o in out if o is not None and o.type == 'MESH']
    mn.outline([o for o in objs if o not in small and not o.name.startswith(('rivet', 'frv', 'keycap', 'em_', 'lbl', 'pin'))], thickness=0.013)
    return objs

def canvas_bounds():
    u0, u1, v0, v1, z1 = CANVAS
    xs, ys = [], []
    for u in (u0, u1):
        for v in (v0, v1):
            for z in (0, z1):
                x, y = mn._screen(Vector((u, -v, z))); xs.append(x); ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)

if __name__ == '__main__':
    t0 = time.time(); name = 'dock/raider_navconsole'; B = canvas_bounds(); files = []
    for i, (side, core) in enumerate((('port', True), ('port', False), ('star', True), ('star', False))):
        objs = build(side, core)
        b = mn._bounds(objs); assert b[0] >= B[0] and b[1] <= B[1] and b[2] >= B[2] and b[3] <= B[3], (b, B)
        w, h, ox, oy = mn._frame(objs, B)
        stem = os.path.join(mn.OUT_DIR, f'{name}_f{i}'); os.makedirs(os.path.dirname(stem), exist_ok=True)
        for kind, ext in (('beauty', '.png'), ('normal', '.n.png'), ('height', '.h.png')): mn._render_to(stem + ext, kind)
        files.append(os.path.relpath(stem, mn.OUT_DIR))
    mn._manifest_put(name, {'w': w, 'h': h, 'ox': round(ox, 2), 'oy': round(oy, 2), 'dirs': 1, 'frames': 4, 'files': files})
    print(f'[dock] {name}: {w}x{h}, origin ({ox:.1f}, {oy:.1f}), 4 frames in {time.time() - t0:.0f} s')
