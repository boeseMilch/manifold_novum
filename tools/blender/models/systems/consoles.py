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
        Built for depth in the 50° view (the first version, a box with a 60° screen slope, read flat):
        pedestals + knee recess, overhanging top (0.72, where the mug / sticky notes land), a riser at
        the back, upright CRT monitors (monitor()) whose tops and sides show. Helm: nav screen + two
        wing monitors on arms, flight yoke, throttle. Security: stacked bank of six CCTV sets, a
        door-lock panel, PA mic, camera joystick, LOCKDOWN button. `-- wip` renders to /tmp instead.
  seat_d0..d7    the swivel seat, 8 facings (dir i faces game angle i*45; the stations use d6 = up).
                 Origin = the seat centre: station + rot(0, 1.05) as in drawStation.
  maptable, maptable_off
        round radar table, r 1.1, origin = its centre (22.2, 6.4). The game's rotating sweep wedge
        stays procedural (a translucent overlay on the screen, z = TABLE_Z: see the manifest note).
  mug_full, mug_empty
        origin = COFFEE_MUG on the floor (the mug itself sits at desk height, 0.72). It now stands on the
        kitchen counter (0.8): the game lifts it by the difference. Steam stays procedural.
  jump_off, jump_p0..p4
        the jump handle cabinet against the wall at JUMP_HANDLE. off: no jump spooling (dim);
        p0..p4: mission.jump active, pull = mission.jump.pull / JUMP_PULL in 5 steps (the handle
        slides down its slot, the gauge fills).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

DESK_Z = 0.72
if 'wip' in ARGS:                                          # trial renders go to /tmp, not into the packed set
    mn.OUT_DIR = '/tmp/mn_wip_renders'; mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')

# ---------------------------------------------------------------------------------------------------------
# Desk
# ---------------------------------------------------------------------------------------------------------
def monitor(P, M, name, w, h, d, shell, loc, tilt=0.0, yaw=0.0, bez=0.035):
    """A chunky CRT-style monitor: bezelled front (screen recessed behind a lip), tapered tube housing
    behind it, vents on top. Built facing -Y (into the room) with its bottom-front-centre at the
    origin, then tilted back by `tilt` and turned by `yaw` and moved to `loc`.
    Returns (screen, on_screen(u, v, z_off)) where u, v in -0.5..0.5 address the glass."""
    parts = []
    def A(o): parts.append(P(o)); return o
    A(mn.box(name + '_front', (w, 0.07, h), loc=(0, 0.035, 0), m=shell, bevel=0.028))
    A(mn.box(name + '_tube', (w * 0.74, d - 0.05, h * 0.74), loc=(0, 0.05 + (d - 0.05) / 2, h * 0.1), m=shell, bevel=0.045))
    A(mn.box(name + '_cap', (w * 0.5, 0.05, h * 0.42), loc=(0, d + 0.02, h * 0.26), m=M['body2'], bevel=0.015))
    sw, sh = w - 2 * bez, h - 2 * bez
    A(mn.box(name + '_well', (sw + 0.01, 0.012, sh + 0.01), loc=(0, -0.002, bez - 0.005), m=M['dark'], bevel=0.004))
    for i, (bw, bh, bx, bz) in enumerate([(w, bez, 0, 0), (w, bez, 0, h - bez), (bez, h, -w / 2 + bez / 2, 0), (bez, h, w / 2 - bez / 2, 0)]):
        A(mn.box(name + f'_lip{i}', (bw, 0.03, bh), loc=(bx, -0.012, bz), m=shell, bevel=0.012))
    scr = A(plate(name + '_glass', (sw - 0.004, sh - 0.004, 0.006), (0, -0.006, h / 2), R90, M['scr']))
    scr['no_outline'] = 1
    for k in range(4):                                       # vent slots on the top
        A(mn.box(name + '_vent', (w * 0.5, 0.018, 0.01), loc=(0, 0.1 + k * 0.035, h * 0.84 - 0.004), m=M['hole'], bevel=0.003))
    A(mn.box(name + '_led', (0.03, 0.012, 0.014), loc=(w / 2 - 0.07, -0.03, 0.008), m=glow(name + '_ledm', '#5fd6a0', 1.0), bevel=0.003))
    g = mn.group(name, parts, loc=loc); g.rotation_euler = (-tilt, 0, yaw)
    def on_screen(u, v, z_off=0.0):
        return (u * sw, -0.01 - z_off, h / 2 + v * sh)
    on_screen.group = g
    return scr, on_screen

def ink(P, on_screen, kind, size, u, v, m, inks):
    """A glowing mark on a monitor's glass (parented to the monitor), keyframed per frame by kind."""
    o = plate('ink', (size[0], size[1], 0.004), on_screen(u, v), R90, m)
    o.parent = on_screen.group; o['no_outline'] = 1
    inks.append((kind, P(o))); return o

def desk(kind):
    s = mn.reset(); M = stdmats(); P = Parts()
    M['scr_bg'] = pmat('scr_bg', '#10222c', 0.25)
    M['scr'] = glow('scr', '#28536e', 0.7)
    M['ink_g'] = glow('ink_g', '#c8fff0', 1.1)
    M['ink_c'] = glow('ink_c', '#5fd6e4', 1.0)
    M['ink_r'] = glow('ink_r', '#ff6a5a', 1.2)
    helm = kind == 'helm'                                    # helm: blue-grey with light-grey screens; security: olive with beige CCTV sets
    M['paint'] = worn('dpaint', '#8796ad' if helm else '#8e927a', 0.5, 0.3)
    M['panel'] = worn('dpanel', '#5f6b7e' if helm else '#666a58', 0.55, 0.3)
    M['topm'] = worn('dtop', '#687284', 0.6, 0.2, wear=0.6)
    M['shell'] = worn('shell', '#c2c6cc' if helm else '#cdbf9c', 0.55, 0.05, wear=0.4)
    W, D, TOP = 1.6, 0.6, DESK_Z
    # --- desk: two pedestal cabinets, a knee recess between them, an overhanging top, a raised riser at the back
    P(mn.box('kick', (W - 0.2, D - 0.16, 0.08), loc=(0, -D / 2 + 0.04, 0), m=M['dark'], bevel=0.02))
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.22)
        P(mn.box('ped', (0.42, D - 0.04, TOP - 0.13), loc=(x, -D / 2 + 0.01, 0.06), m=M['paint'], bevel=0.035))
        P(mn.box('door', (0.32, 0.014, 0.4), loc=(x, -D + 0.035, 0.15), m=M['panel'], bevel=0.008))
        P(mn.box('pull', (0.14, 0.03, 0.025), loc=(x, -D + 0.02, 0.5), m=M['steel'], bevel=0.008))
        P(mn.box('kickpl', (0.36, 0.012, 0.05), loc=(x, -D + 0.035, 0.075), m=M['hazard'], bevel=0.004))
    P(mn.box('knee_back', (W - 0.86, 0.05, TOP - 0.2), loc=(0, -0.16, 0.08), m=M['panel'], bevel=0.015))
    P(mn.box('knee_rail', (W - 0.84, 0.36, 0.07), loc=(0, -0.36, TOP - 0.135), m=M['frame'], bevel=0.015))
    P(pipe('knee_cable', [(-0.28, -0.13, TOP - 0.1), (-0.25, -0.15, 0.2), (0.05, -0.15, 0.12), (0.3, -0.14, 0.3), (0.3, -0.13, TOP - 0.1)], 0.022, M['rubber'], corner=0.1))
    P(mn.box('top', (W + 0.06, D + 0.04, 0.07), loc=(0, -D / 2 - 0.01, TOP - 0.07), m=M['topm'], bevel=0.025))
    P(mn.cyl('bumper', 0.034, W + 0.02, loc=(-(W + 0.02) / 2, -D - 0.025, TOP - 0.036), m=M['rubber'], rot=(0, math.radians(90), 0), bevel=0.01, verts=16))
    RY, RH = 0.17, 0.12                                      # riser: back strip of the desk, monitors stand on it
    P(mn.box('riser', (W - 0.04, RY, RH), loc=(0, -RY / 2, TOP), m=M['paint'], bevel=0.025))
    RZ = TOP + RH
    lamps = []                                              # status lamps on the riser's front face
    for j, c in enumerate(('#e2574c', '#e8c34f', '#5fd6a0')):
        lamps.append(P(mn.sphere('lamp', 0.026, loc=(-0.12 + j * 0.08, -RY - 0.004, TOP + RH * 0.5), m=glow('l' + c, c, 1.2), scale=(1, 0.6, 1))))
    for j in range(4):
        P(mn.box('sw', (0.03, 0.03, 0.04), loc=(0.16 + j * 0.06, -RY - 0.01, TOP + 0.04), m=M['steel'], bevel=0.008))
    P(mn.box('stk', (0.36, 0.012, 0.09), loc=(-(W / 2 - 0.22), -D + 0.024, 0.34), m=M['sticker'], bevel=0.003))
    P(label('stk_t', 'HELM' if kind == 'helm' else 'SECURITY', 0.07 if kind == 'helm' else 0.05, (-(W / 2 - 0.22), -D + 0.016, 0.385), rot=R90, m=M['ink']))
    for k in range(4):
        P(mn.box('vent', (0.22, 0.012, 0.018), loc=(W / 2 - 0.22, -D + 0.026, 0.27 + k * 0.04), m=M['hole'], bevel=0.003))
    screens, inks = [], []
    if kind == 'helm':
        # main nav screen on a neck in the middle, two wing monitors on arms turned towards the pilot
        P(mn.box('neck_base', (0.3, 0.13, 0.03), loc=(0, -0.085, RZ), m=M['frame'], bevel=0.01))
        P(mn.box('neck', (0.09, 0.06, 0.12), loc=(0, -0.07, RZ + 0.02), m=M['frame'], bevel=0.015))
        sc, on_c = monitor(P, M, 'main', 0.68, 0.44, 0.2, M['shell'], (0, -0.12, RZ + 0.11), tilt=0.2)
        screens.append(sc)
        for sx, nm in ((-1, 'wl'), (1, 'wr')):
            x = sx * 0.6
            P(pipe('arm', [(sx * 0.42, -0.06, RZ), (sx * 0.42, -0.06, RZ + 0.12), (x, -0.08, RZ + 0.12), (x, -0.08, RZ + 0.16)], 0.022, M['steel'], corner=0.05))
            P(mn.cyl('arm_foot', 0.05, 0.025, loc=(sx * 0.42, -0.06, RZ), m=M['frame'], bevel=0.008))
            scw, on_w = monitor(P, M, nm, 0.36, 0.3, 0.17, M['shell'], (x, -0.12, RZ + 0.16), tilt=0.22, yaw=-sx * 0.38)
            screens.append(scw)
            if sx < 0:
                for j in range(3): ink(P, on_w, 'bar', (0.24, 0.035), -0.05, 0.28 - j * 0.28, M['ink_g'], inks)
            else:
                for j in range(6): ink(P, on_w, 'blip', (0.032, 0.14), -0.38 + j * 0.15, 0.0, M['ink_c'], inks)
            P(pipe('wcable', [(x - sx * 0.05, 0.04, RZ + 0.24), (x - sx * 0.12, 0.05, RZ + 0.05), (x - sx * 0.2, -0.02, RZ + 0.005)], 0.016, M['rubber'], corner=0.06))
        # nav screen: range rings, a heading line and the course blips
        for i, r in enumerate((0.13, 0.08)):
            o = ring('navring', r, 0.012, 0.004, m=M['ink_c'], rot=R90, verts=40); o.location = on_c(-0.22, 0.0, 0.002)
            o.parent = on_c.group; o['no_outline'] = 1; inks.append(('ring', P(o)))
        ink(P, on_c, 'bar', (0.012, 0.13), -0.22, 0.18, M['ink_g'], inks)
        for j in range(4): ink(P, on_c, 'bar', (0.22, 0.03), 0.22, 0.3 - j * 0.2, M['ink_g'] if j else M['ink_c'], inks)
        ink(P, on_c, 'blink', (0.03, 0.03), -0.12, 0.2, M['ink_r'], inks)
        P(mn.box('tape_m', (0.2, 0.06, 0.006), loc=(0.27, -0.06, 0), m=M['tape'], bevel=0.002, rot=(math.radians(90), 0, 0.0))).parent = on_c.group
        P[-1].location = (0.3, -0.032, 0.44); P[-1].rotation_euler = (math.radians(90), math.radians(35), 0)
        # flight yoke on a column in front of the screen
        P(mn.box('yoke_base', (0.24, 0.16, 0.04), loc=(0, -0.3, TOP), m=M['frame'], bevel=0.012))
        P(mn.box('yoke_col', (0.08, 0.08, 0.1), loc=(0, -0.3, TOP + 0.03), m=M['panel'], bevel=0.015))
        P(mn.cyl('yoke_shaft', 0.025, 0.2, loc=(0, -0.28, TOP + 0.1), m=M['steel'], rot=R90, bevel=0.006, verts=12))
        P(mn.box('yoke_hub', (0.1, 0.06, 0.07), loc=(0, -0.47, TOP + 0.065), m=M['frame'], bevel=0.015))
        P(pipe('yoke', [(-0.17, -0.5, TOP + 0.2), (-0.17, -0.5, TOP + 0.1), (0.17, -0.5, TOP + 0.1), (0.17, -0.5, TOP + 0.2)], 0.022, M['frame'], corner=0.05))
        for gx in (-0.17, 0.17):
            P(mn.cyl('grip', 0.032, 0.1, loc=(gx, -0.5, TOP + 0.14), m=M['rubber'], bevel=0.01, verts=16))
            P(mn.cyl('trig', 0.018, 0.02, loc=(gx, -0.5, TOP + 0.24), m=M['red'], bevel=0.006, verts=12))
        P(mn.box('tape_y', (0.06, 0.08, 0.004), loc=(0.17, -0.5, TOP + 0.13), m=M['tape'], bevel=0.002, rot=(0, 0, 0.2)))
        # throttle quadrant (right of the yoke, left of the mug)
        P(wedge('thr', 0.16, 0.22, 0.05, 0.11, loc=(0.29, -0.4, TOP), m=M['panel'], bevel=0.015))
        for j, (c, a) in enumerate((('#e2574c', 0.35), ('#e8c34f', -0.1))):
            x = 0.26 + j * 0.06
            P(mn.box('thr_slot', (0.016, 0.16, 0.01), loc=(x, -0.4, TOP + 0.075), m=M['hole'], bevel=0.003, rot=(math.atan2(0.06, 0.22), 0, 0)))
            P(mn.cyl('thr_lever', 0.012, 0.13, loc=(x, -0.4, TOP + 0.07), m=M['steel'], rot=(a, 0, 0), bevel=0.004, verts=8))
            P(mn.sphere('thr_knob', 0.03, loc=(x, -0.4 - math.sin(a) * 0.13, TOP + 0.07 + math.cos(a) * 0.13), m=pmat('k' + c, c, 0.35)))
        # keyboard on the left (the sticky notes land on it)
        P(mn.box('kbd', (0.42, 0.2, 0.03), loc=(-0.47, -0.42, TOP), m=M['dark'], bevel=0.01, rot=(0, 0, 0.05)))
        for r in range(2):
            for k in range(6):
                P(mn.box('key', (0.05, 0.05, 0.02), loc=(-0.65 + k * 0.071, -0.46 + r * 0.075, TOP + 0.03), m=M['steel'], bevel=0.006, rot=(0, 0, 0.05)))
        P(pipe('yoke_cable', [(0.05, -0.38, TOP + 0.02), (0.15, -0.28, TOP + 0.015), (0.18, -0.19, TOP + 0.02), (0.18, -0.16, TOP + 0.06)], 0.014, M['rubber'], corner=0.05))
    else:
        # CCTV bank: a rack of six small monitors in two rows (the game's camera grid)
        P(mn.box('shelf', (1.0, 0.17, 0.025), loc=(0, -0.085, RZ), m=M['frame'], bevel=0.008))
        rnd = __import__('random').Random(11)
        for row in range(2):
            for c in range(3):
                x = (c - 1) * 0.32 + (0.03 if row else 0); z = RZ + 0.025 + row * 0.215
                sc, on = monitor(P, M, f'cam{row}{c}', 0.3, 0.21, 0.15, M['shell'], (x, -0.13 + 0.03 * row, z), tilt=0.1 + 0.08 * row, yaw=(0.12 * (1 - c) if row else 0), bez=0.028)
                screens.append(sc)
                # a camera picture: a doorway / corridor block and a crew blob, plus the REC dot on one
                ink(P, on, 'cam', (0.13, 0.09), -0.18 + rnd.random() * 0.1, -0.12, M['ink_c'], inks)
                ink(P, on, 'cam', (0.04, 0.07), 0.25 - rnd.random() * 0.1, -0.15, M['ink_g'], inks)
                if row == 1 and c == 2: ink(P, on, 'blink', (0.035, 0.035), 0.36, 0.32, M['ink_r'], inks)
        P(mn.box('tape_r', (0.2, 0.012, 0.05), loc=(-0.17, -0.165, RZ + 0.2), m=M['tape'], bevel=0.002, rot=(0, math.radians(-14), 0)))
        P(pipe('rcable', [(0.5, -0.02, RZ + 0.42), (0.6, 0.0, RZ + 0.2), (0.62, -0.03, RZ + 0.01)], 0.016, M['rubber'], corner=0.06))
        P(pipe('rcable2', [(-0.5, -0.02, RZ + 0.35), (-0.62, 0.0, RZ + 0.15), (-0.6, -0.04, RZ + 0.01)], 0.016, M['rubber'], corner=0.06))
        # door-lock panel on the right: a status screen (the door list) over a keypad, one lamp per door
        dp_parts = []
        def DPA(o): dp_parts.append(P(o)); return o
        DPA(mn.box('dp_body', (0.24, 0.1, 0.4), loc=(0, 0.05, 0), m=M['panel'], bevel=0.025))
        DPA(mn.box('dp_well', (0.19, 0.012, 0.13), loc=(0, -0.002, 0.24), m=M['dark'], bevel=0.004))
        dscr = DPA(plate('dp_glass', (0.17, 0.11, 0.006), (0, -0.006, 0.305), R90, M['scr'])); dscr['no_outline'] = 1
        screens.append(dscr)
        for r in range(3):
            for c in range(3):
                DPA(mn.box('dp_key', (0.045, 0.02, 0.04), loc=(-0.055 + c * 0.055, -0.01, 0.05 + r * 0.055), m=M['steel'], bevel=0.006))
        dlamps = []
        for j in range(3):
            dlamps.append(DPA(mn.sphere('dp_lamp', 0.018, loc=(0.1, -0.01, 0.06 + j * 0.055), m=glow('dl%d' % j, '#5fd6a0' if j else '#e2574c', 1.2), scale=(1, 0.6, 1))))
        DPA(mn.box('dp_tag', (0.14, 0.012, 0.035), loc=(0, -0.006, 0.415), m=M['sticker'], bevel=0.003))
        DPA(label('dp_t', 'DOORS', 0.026, (0, -0.013, 0.432), rot=R90, m=M['ink']))
        dg = mn.group('doorpanel', dp_parts, loc=(0.66, -0.1, RZ)); dg.rotation_euler = (-0.25, 0, -0.3)
        lamps += dlamps
        dpo = lambda u, v: (u * 0.17, -0.01, 0.305 + v * 0.11)
        dpo.group = dg
        for j in range(3): ink(P, dpo, 'bar', (0.12, 0.018), -0.08, 0.3 - j * 0.3, M['ink_g'] if j else M['ink_r'], inks)
        # desk: keyboard, a PA microphone on a gooseneck, a camera joystick, the big red LOCKDOWN button
        P(mn.box('kbd', (0.44, 0.19, 0.03), loc=(-0.08, -0.42, TOP), m=M['dark'], bevel=0.01, rot=(0, 0, -0.04)))
        for r in range(2):
            for k in range(6):
                P(mn.box('key', (0.05, 0.05, 0.02), loc=(-0.26 + k * 0.071, -0.455 + r * 0.075, TOP + 0.03), m=M['shell'], bevel=0.006, rot=(0, 0, -0.04)))
        P(mn.cyl('mic_base', 0.07, 0.03, loc=(-0.6, -0.33, TOP), m=M['frame'], bevel=0.01, verts=20))
        P(pipe('mic_neck', [(-0.6, -0.33, TOP + 0.03), (-0.6, -0.33, TOP + 0.22), (-0.5, -0.4, TOP + 0.3)], 0.014, M['steel'], corner=0.1))
        P(mn.sphere('mic_head', 0.04, loc=(-0.47, -0.42, TOP + 0.3), m=M['rubber'], scale=(1.3, 1.3, 1)))
        P(mn.box('mic_btn', (0.05, 0.05, 0.02), loc=(-0.6, -0.42, TOP), m=M['red'], bevel=0.008))
        P(mn.box('joy_base', (0.14, 0.14, 0.04), loc=(0.27, -0.42, TOP), m=M['frame'], bevel=0.015))
        P(mn.sphere('joy_boot', 0.05, loc=(0.27, -0.42, TOP + 0.04), m=M['rubber'], scale=(1, 1, 0.6)))
        P(mn.cyl('joy_stick', 0.018, 0.12, loc=(0.27, -0.42, TOP + 0.04), m=M['steel'], bevel=0.005, verts=10, rot=(0.25, 0.15, 0)))
        P(mn.sphere('joy_knob', 0.035, loc=(0.288, -0.45, TOP + 0.16), m=M['rubber']))
        P(mn.box('ld_base', (0.2, 0.2, 0.04), loc=(0.55, -0.43, TOP), m=M['hazard'], bevel=0.012))
        P(mn.cyl('ld_btn', 0.06, 0.05, loc=(0.55, -0.43, TOP + 0.04), m=M['red'], bevel=0.02, verts=24))
        P(mn.box('ld_cover', (0.16, 0.012, 0.15), loc=(0.55, -0.335, TOP + 0.05), m=glass('ld_glass', '#ffd2c8', 0.5), bevel=0.006, rot=(-0.4, 0, 0)))
        P(mn.box('tape_l', (0.22, 0.06, 0.004), loc=(0.42, -0.53, TOP), m=M['tape'], bevel=0.002, rot=(0, 0, -0.5)))
        P(mn.box('ld_lbl', (0.18, 0.04, 0.004), loc=(0.55, -0.56, TOP), m=M['paper'], bevel=0.002))
        P(label('ld_t', 'LOCKDOWN', 0.026, (0.55, -0.56, TOP + 0.006), m=M['ink']))
    broken = [P(soot_disc('soot', 0.45, (0.12, -0.36, TOP + 0.005), M['soot'], sy=0.7)),
              P(soot_disc('soot2', 0.22, (-0.3, -0.17, RZ + 0.003), M['soot'], sy=0.6))]
    outline(P, 0.012)
    show(broken, False)

    objs = list(P)
    for i in range(4):                                       # 4-frame screen loop (~0.5 s per frame in the game)
        f = i + 1; s.frame_set(f)
        for j, (k, o) in enumerate(inks):
            if k == 'bar': o.scale.x = 0.3 + 0.7 * abs(math.sin(i * 0.9 + j * 1.7))
            elif k == 'blip': o.scale.y = 0.35 + 0.65 * abs(math.sin(i * 1.3 + j * 0.8))
            elif k == 'ring': o.scale = (1, 1, 1) if (i + j) % 2 else (1.12, 1.12, 1)
            elif k == 'blink': key_hide(o, f, i % 2 == 1); continue
            elif k == 'cam': key_hide(o, f, (i * 7 + j * 3) % 11 == 0); continue
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

only = [a for a in ARGS if a not in ('quick', 'wip')]
for name, fn in [('helm', lambda: desk('helm')), ('security', lambda: desk('security')), ('seat', seat),
                 ('maptable', maptable), ('mug', mug), ('jump', jump)]:
    if not only or name in only: fn()
