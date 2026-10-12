"""Consoles and bridge kit: the helm / security desk (js/art.js drawStation, STATIONS in js/ship.js),
the operator's swivel seat (drawSeat), the radar map table (js/decor.js mapTable; the radar in
js/mission.js stationSpots), the helm's coffee mug (js/hazards.js COFFEE_MUG) and the jump handle
(js/minigames.js JUMP_HANDLE, drawMinigameProps).

Renders (build/renders/systems/):
  helm_f0..f3, helm_off, helm_broken
  security_f0..f3, security_off, security_broken
        the desk, 1.6 wide, 0.6 deep (the SOLIDS box), against the wall the station sits on. Origin =
        the station's (x, y): the middle of the desk's back edge on the wall. Built for face = -pi/2
        (both stations sit on a north wall, operator looking up). f0..f3: screen loop (the game's
        flickering bars), ~0.5 s per frame. off: screens dark (e.g. its zone's capacitor empty).
  seat_d0..d7    the swivel seat, 8 facings (dir i faces game angle i*45; the stations use d6 = up).
                 Origin = the seat centre: station + rot(0, 1.05) as in drawStation.
  maptable, maptable_off
        round radar table, r 1.1, origin = its centre (22.2, 6.4). The game's rotating sweep wedge
        stays procedural (a translucent overlay on the screen, z = TABLE_Z: see the manifest note).
  mug_full, mug_empty
        on the helm desk; origin = COFFEE_MUG on the floor (the mug itself sits at desk height, so it
        lands on the desk). Steam stays procedural.
  jump_off, jump_p0..p4
        the jump handle cabinet against the wall at JUMP_HANDLE. off: no jump spooling (dim);
        p0..p4: mission.jump active, pull = mission.jump.pull / JUMP_PULL in 5 steps (the handle
        slides down its slot, the gauge fills).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

DESK_Z = 0.72

# ---------------------------------------------------------------------------------------------------------
# Desk
# ---------------------------------------------------------------------------------------------------------
def desk(kind):
    s = mn.reset(); M = stdmats(); P = Parts()
    M['scr_bg'] = pmat('scr_bg', '#10222c', 0.25)
    M['scr'] = glow('scr', '#28536e', 0.7)
    M['ink_g'] = glow('ink_g', '#c8fff0', 1.1)
    M['ink_c'] = glow('ink_c', '#5fd6e4', 1.0)
    M['paint'] = worn('dpaint', '#6a7383', 0.5, 0.35)
    W, D = 1.6, 0.6
    # desk body: from the wall (y=0) to D into the room (Blender -Y)
    P(mn.box('kick', (W - 0.1, D - 0.12, 0.1), loc=(0, -D / 2 + 0.02, 0), m=M['dark'], bevel=0.02))
    P(mn.box('body', (W, D, DESK_Z - 0.1 - 0.05), loc=(0, -D / 2, 0.1), m=M['paint'], bevel=0.04))
    P(mn.box('top', (W + 0.04, D + 0.02, 0.06), loc=(0, -D / 2, DESK_Z - 0.06), m=M['body2'], bevel=0.025))
    P(mn.box('edge', (W + 0.02, 0.05, 0.04), loc=(0, -D + 0.01, DESK_Z - 0.07), m=M['rubber'], bevel=0.015))
    # screen bank, tilted towards the operator (and the camera)
    BY0, BY1 = -0.24, 0.0
    P(wedge('bank', W - 0.06, BY1 - BY0, 0.2, 0.62, loc=(0, (BY0 + BY1) / 2, DESK_Z - 0.01), m=M['paint'], bevel=0.03))
    tilt = math.atan2(0.42, BY1 - BY0)
    def on_bank(x, f, z_off=0.0):          # point on the slanted face: f in 0..1 from front to back
        y = BY0 + f * (BY1 - BY0); z = DESK_Z - 0.01 + 0.2 + f * 0.42 + z_off
        return (x, y, z)
    screens, inks = [], []
    rot = (tilt - math.pi / 2 + math.pi / 2, 0, 0)
    sw = [(-0.44, 0.62), (0.3, 0.7)] if kind == 'helm' else [(-0.4, 0.66), (0.36, 0.62)]
    for i, (sx, w) in enumerate(sw):
        c = on_bank(sx, 0.5, 0.012)
        P(plate('bezel', (w + 0.06, 0.4, 0.02), c, (tilt, 0, 0), M['dark']))
        screens.append(P(plate('screen', (w, 0.33, 0.012), on_bank(sx, 0.5, 0.025), (tilt, 0, 0), M['scr'])))
    # screen contents (glowing bars / shapes, keyframed per frame)
    rnd = __import__('random').Random(7 if kind == 'helm' else 11)
    if kind == 'helm':
        for j in range(3):                                    # left: the game's three status bars
            inks.append(('bar', P(plate('bar', (0.5, 0.04, 0.006), on_bank(-0.44, 0.25 + j * 0.25, 0.033), (tilt, 0, 0), M['ink_g']))))
        for j in range(7):                                    # right: a wave / nav plot
            x = 0.3 - 0.3 + j * 0.1; h = 0.03 + 0.1 * abs(math.sin(j * 1.1))
            inks.append(('blip', P(plate('wave', (0.06, h, 0.006), on_bank(x, 0.5, 0.033), (tilt, 0, 0), M['ink_c']))))
    else:
        for gx in range(3):                                   # left: camera grid
            for gy in range(2):
                inks.append(('cam', P(plate('cam', (0.17, 0.13, 0.006), on_bank(-0.6 + gx * 0.2, 0.3 + gy * 0.4, 0.033), (tilt, 0, 0), M['ink_c']))))
        for j in range(3):                                    # right: door status list
            inks.append(('bar', P(plate('bar', (0.45, 0.04, 0.006), on_bank(0.36, 0.25 + j * 0.25, 0.033), (tilt, 0, 0), M['ink_g']))))
    # desk surface: keyboard, three status lamps, a big knob
    P(mn.box('kbd', (0.6, 0.18, 0.03), loc=(-0.25, -0.42, DESK_Z), m=M['dark'], bevel=0.01))
    for r in range(2):
        for k in range(8):
            P(mn.box('key', (0.055, 0.055, 0.02), loc=(-0.5 + k * 0.071, -0.46 + r * 0.075, DESK_Z + 0.03), m=M['steel'], bevel=0.006))
    lamps = []
    for j, c in enumerate(('#e2574c', '#e8c34f', '#5fd6a0')):
        lamps.append(P(mn.sphere('lamp', 0.035, loc=(0.32 + j * 0.1, -0.42, DESK_Z + 0.01), m=glow('l' + c, c, 1.2), scale=(1, 1, 0.7))))
    P(mn.cyl('knob', 0.06, 0.05, loc=(0.6, -0.42, DESK_Z), m=M['frame'], bevel=0.015))
    P(mn.box('knob_mark', (0.012, 0.05, 0.01), loc=(0.6, -0.4, DESK_Z + 0.05), m=M['paper'], bevel=0))
    P(mn.box('tape', (0.3, 0.07, 0.006), loc=(0.15, -0.55, DESK_Z), m=M['tape'], bevel=0.002, rot=(0, 0, 0.25)))
    P(mn.box('stk', (0.32, 0.01, 0.08), loc=(0, -D - 0.005, 0.38), m=M['sticker'], bevel=0.002))
    P(label('stk_t', 'HELM' if kind == 'helm' else 'SECURITY', 0.055, (0, -D - 0.012, 0.42), rot=R90, m=M['ink']))
    for x in (-W / 2 + 0.12, W / 2 - 0.12):
        P(mn.box('vent', (0.2, 0.01, 0.12), loc=(x, -D - 0.003, 0.2), m=M['dark'], bevel=0.003))
    broken = [P(soot_disc('soot', 0.5, (0.2, -0.3, DESK_Z + 0.005), M['soot'], sy=0.7))]
    outline(P, 0.012)
    show(broken, False)

    objs = list(P)
    base = {id(o): o.scale.copy() for _, o in inks}
    for i in range(4):                                       # 4-frame screen loop
        f = i + 1; s.frame_set(f)
        for j, (k, o) in enumerate(inks):
            if k == 'bar': o.scale.x = 0.3 + 0.7 * abs(math.sin(i * 0.9 + j * 1.7))
            elif k == 'blip': o.scale.y = 0.4 + 0.6 * abs(math.sin(i * 1.3 + j * 0.8))
            else: o.hide_render = rnd.random() < 0.15; o.keyframe_insert('hide_render', frame=f)
            o.keyframe_insert('scale', frame=f)
    mn.render(f'systems/{kind}', objs=objs, frames=[1, 2, 3, 4])
    for o in bpy.data.objects: o.animation_data_clear()
    s.frame_set(1)
    for _, o in inks: o.hide_render = True
    for o in lamps: o.data.materials[0] = M['lamp_off']
    setmat(screens, M['scr_bg'])
    mn.render(f'systems/{kind}_off', objs=objs)
    setmat(screens, M['crazed']); show(broken, True)
    mn.render(f'systems/{kind}_broken', objs=objs)

# ---------------------------------------------------------------------------------------------------------
# Seat (built facing +x, the game's angle 0; rendered in 8 directions)
# ---------------------------------------------------------------------------------------------------------
def seat():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['cushion'] = worn('cushion', '#5a6478', 0.75, 0.0, wear=0.3)
    for i in range(5):                                       # star base with castors
        a = i * math.tau / 5
        leg = P(mn.box('leg', (0.26, 0.05, 0.04), loc=(math.cos(a) * 0.13, math.sin(a) * 0.13, 0.05), m=M['frame'], bevel=0.012, rot=(0, 0, a)))
        P(mn.sphere('castor', 0.035, loc=(math.cos(a) * 0.25, math.sin(a) * 0.25, 0.035), m=M['rubber']))
    P(mn.cyl('post', 0.035, 0.3, loc=(0, 0, 0.08), m=M['steel'], bevel=0.01))
    P(mn.box('seat', (0.46, 0.5, 0.1), loc=(0.02, 0, 0.36), m=M['cushion'], bevel=0.045))
    P(mn.box('pan', (0.4, 0.44, 0.04), loc=(0.02, 0, 0.33), m=M['frame'], bevel=0.015))
    P(mn.box('back', (0.1, 0.5, 0.42), loc=(-0.25, 0, 0.42), m=M['cushion'], bevel=0.045, rot=(0, math.radians(-10), 0)))
    P(mn.box('back_frame', (0.06, 0.12, 0.3), loc=(-0.26, 0, 0.3), m=M['frame'], bevel=0.015))
    for sy in (-1, 1):
        P(mn.box('arm', (0.32, 0.07, 0.05), loc=(0.0, sy * 0.27, 0.52), m=M['rubber'], bevel=0.02))
        P(mn.box('arm_post', (0.04, 0.04, 0.1), loc=(-0.06, sy * 0.27, 0.43), m=M['frame'], bevel=0.01))
    P(mn.box('tape', (0.06, 0.2, 0.004), loc=(0.08, 0.1, 0.461), m=M['tape'], bevel=0.002, rot=(0, 0, 0.6)))
    outline(P, 0.012)
    root = mn.group('root', list(P))
    mn.render('systems/seat', objs=list(P), root=root, dirs=8)

# ---------------------------------------------------------------------------------------------------------
# Map table
# ---------------------------------------------------------------------------------------------------------
TABLE_Z = 0.78
def maptable():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('tpaint', '#6a7383', 0.5, 0.35)
    M['holo'] = pmat('holo_bg', '#16222c', 0.6)
    M['holo_ln'] = glow('holo_ln', '#5fd6e4', 0.6)
    M['star'] = glow('star', '#c8faff', 1.4)
    R = 1.1
    P(mn.cyl('foot', 0.55, 0.08, m=M['frame'], bevel=0.03, verts=48))
    P(mn.cyl('column', 0.32, TABLE_Z - 0.2, loc=(0, 0, 0.08), m=M['paint'], bevel=0.04, verts=40))
    P(ring('col_hz', 0.34, 0.06, 0.08, loc=(0, 0, 0.18), m=M['hazard'], verts=40))
    P(mn.cyl('top', R, 0.14, loc=(0, 0, TABLE_Z - 0.14), m=M['paint'], bevel=0.05, verts=64))
    P(ring('rim', R + 0.02, 0.1, 0.05, loc=(0, 0, TABLE_Z - 0.02), m=M['frame'], verts=64))
    P(ring('rim_hz', R * 0.8, 0.07, 0.012, loc=(0, 0, TABLE_Z - 0.005), m=M['hazard'], verts=64))
    for j, c in enumerate(('#e2574c', '#e8c34f', '#5fd6a0')):
        P(mn.cyl('btn', 0.04, 0.03, loc=(0.5 + j * 0.11, -0.66 + j * 0.1, TABLE_Z), m=pmat('b' + c, c, 0.35), verts=12, bevel=0.01))
    scr = P(mn.cyl('screen', R * 0.72, 0.01, loc=(0, 0, TABLE_Z - 0.005), m=M['holo'], bevel=0, verts=64))
    holo = []
    for i in (1, 2, 3):
        holo.append(P(ring('grid', R * 0.22 * i, 0.012, 0.006, loc=(0, 0, TABLE_Z + 0.004), m=M['holo_ln'], verts=64)))
    for a in (0, math.pi / 2):
        holo.append(P(mn.box('axis', (R * 1.4, 0.01, 0.006), loc=(0, 0, TABLE_Z + 0.004), m=M['holo_ln'], bevel=0, rot=(0, 0, a))))
    rnd = __import__('random').Random(5)
    for i in range(14):
        x, y = (rnd.random() - 0.5) * R * 1.3, (rnd.random() - 0.5) * R * 1.3
        if math.hypot(x, y) < R * 0.68: holo.append(P(mn.sphere('star', 0.025, loc=(x, y, TABLE_Z + 0.01), m=M['star'], scale=(1, 1, 0.4), segs=8)))
    for i in range(10):                                     # rim bolts
        a = i * math.tau / 10
        P(mn.cyl('bolt', 0.025, 0.02, loc=(math.cos(a) * (R * 0.86), math.sin(a) * (R * 0.86), TABLE_Z), m=M['steel'], verts=6, bevel=0.005))
    P(mn.box('tape', (0.36, 0.08, 0.006), loc=(-0.55, -0.62, TABLE_Z - 0.01), m=M['tape'], bevel=0.002, rot=(0, 0, 0.7)))
    P(mn.box('plate', (0.34, 0.01, 0.07), loc=(0, -R - 0.005, TABLE_Z - 0.09), m=M['sticker'], bevel=0.002))
    P(label('plate_t', 'RADAR', 0.05, (0, -R - 0.012, TABLE_Z - 0.055), rot=R90, m=M['ink']))
    outline(P, 0.013)
    objs = list(P)
    mn.render('systems/maptable', objs=objs)
    show(holo, False)
    mn.render('systems/maptable_off', objs=objs)

# ---------------------------------------------------------------------------------------------------------
# Coffee mug (origin on the floor below it; the desk front is 0.3 south of it)
# ---------------------------------------------------------------------------------------------------------
def mug():
    s = mn.reset(); M = stdmats(); P = Parts()
    cer = pmat('ceramic', '#e8e4dc', 0.35); cer.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0.5
    Z = DESK_Z
    r = 0.13
    P(ring('mug', r, 0.025, 0.2, loc=(0, 0, Z), m=cer, verts=40))
    P(mn.cyl('bottom', r - 0.01, 0.03, loc=(0, 0, Z), m=cer, bevel=0.005, verts=40))
    P(ring('band', r + 0.003, 0.01, 0.04, loc=(0, 0, Z + 0.1), m=M['red'], verts=40))
    P(pipe('handle', [(r - 0.01, 0, Z + 0.16), (r + 0.08, 0, Z + 0.15), (r + 0.08, 0, Z + 0.06), (r - 0.01, 0, Z + 0.05)], 0.02, cer, corner=0.035))
    inside = P(mn.cyl('inside', r - 0.024, 0.01, loc=(0, 0, Z + 0.03), m=pmat('in', '#3a2414', 0.7), bevel=0, verts=40))
    coffee = P(mn.cyl('coffee', r - 0.024, 0.01, loc=(0, 0, Z + 0.16), m=pmat('coffee', '#4a2c1a', 0.15), bevel=0, verts=40))
    outline(P, 0.008)
    objs = list(P)
    mn.render('systems/mug_full', objs=objs)
    show(coffee, False)
    mn.render('systems/mug_empty', objs=objs)

# ---------------------------------------------------------------------------------------------------------
# Jump handle: a narrow cabinet on the wall (wall line 0.4 north of JUMP_HANDLE)
# ---------------------------------------------------------------------------------------------------------
def jump():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('jpaint', '#3a4458', 0.5, 0.35)
    M['cyan'] = glow('cyan', '#7af0ff', 1.3)
    M['cyan_dim'] = pmat('cyan_dim', '#2a5060', 0.3)
    WY = 0.4                                              # the wall, Blender +Y
    W, D, H = 0.34, 0.3, 1.15
    y0 = WY - D
    P(mn.box('cab', (W, D, H), loc=(0, WY - D / 2, 0), m=M['paint'], bevel=0.035))
    P(mn.box('cap', (W + 0.04, D + 0.02, 0.05), loc=(0, WY - D / 2, H), m=M['frame'], bevel=0.02))
    P(mn.box('hz', (W - 0.04, 0.012, 0.1), loc=(0, y0 - 0.005, 0.05), m=M['hazard'], bevel=0.003))
    P(mn.box('slot', (0.06, 0.012, 0.62), loc=(-0.05, y0 - 0.005, 0.32), m=M['hole'], bevel=0.004))
    segs = [P(mn.box('seg', (0.05, 0.012, 0.09), loc=(0.11, y0 - 0.008, 0.36 + i * 0.115), m=M['cyan_dim'], bevel=0.004)) for i in range(5)]
    P(mn.box('lbl', (0.26, 0.012, 0.07), loc=(0, y0 - 0.006, H - 0.14), m=M['dark'], bevel=0.003))
    lbl = P(label('lbl_t', 'JUMP', 0.05, (0, y0 - 0.013, H - 0.105), rot=R90, m=M['cyan_dim']))
    lamp = P(mn.sphere('lamp', 0.035, loc=(0, y0 - 0.01, H - 0.02), m=M['cyan_dim'], scale=(1, 0.7, 1)))
    # the T-handle on a carriage that slides down the slot
    hp = [mn.box('carriage', (0.09, 0.05, 0.08), loc=(-0.05, y0 - 0.03, -0.04), m=M['steel'], bevel=0.015),
          mn.cyl('shaft', 0.022, 0.16, loc=(-0.05, y0 - 0.04, 0), m=M['steel'], rot=R90, bevel=0.006, verts=12),
          mn.cyl('grip', 0.035, 0.26, loc=(-0.05 - 0.13, y0 - 0.2, 0), m=M['red'], rot=(0, math.radians(90), 0), bevel=0.012, verts=16)]
    for o in hp: P(o)
    hg = mn.group('handle', hp, loc=(0, 0, 0))
    P(mn.box('tape', (0.36, 0.012, 0.06), loc=(0, y0 - 0.01, 0.78), m=M['tape'], bevel=0.002, rot=(0, math.radians(-12), 0)))
    outline(P, 0.012)
    objs = list(P)
    Ztop, Zbot = 0.88, 0.4
    hg.location.z = Ztop; mn.render('systems/jump_off', objs=objs)
    setmat([lbl, lamp], M['cyan'])
    for i in range(5):
        k = i / 4
        hg.location.z = Ztop + (Zbot - Ztop) * k
        for j, sg in enumerate(segs): setmat([sg], M['cyan'] if j < round(k * 5) else M['cyan_dim'])
        mn.render(f'systems/jump_p{i}', objs=objs)

only = [a for a in ARGS if a != 'quick']
for name, fn in [('helm', lambda: desk('helm')), ('security', lambda: desk('security')), ('seat', seat),
                 ('maptable', maptable), ('mug', mug), ('jump', jump)]:
    if not only or name in only: fn()
