"""Capacitor bank (js/art.js drawCapacitor; CAPACITORS, CAP_MAX in js/ship.js / js/systems.js).

A squat cabinet on a hazard-edged plinth with a row of caged plasma cells standing in it (one per
charge slot), copper bus bars, a front panel with one LED per cell, a stencil and duct tape.
The cabinet width follows the game: max * 0.42 + (max - 1) * 5/48 + 14/48 units (1.76 for 3 cells,
2.28 for 4), 0.9 deep; the cells sit where the game's cells are. Origin = the capacitor's (x, y).

Renders (build/renders/systems/), every state of one size on one canvas:
  cap3_c0 .. cap3_c3          CAP_MAX = 3, charge 0..3 (lit cells from the left, like the game)
  cap3_c1_pulse .. c3_pulse   just received energy (c.pulse > 0): the newest cell flashes white
  cap3_broken                 cracked cells, dark, soot, a bent front panel
  cap4_*                      the same for CAP_MAX = 4 (the capacitor upgrade)

    blender -b --factory-startup --python tools/blender/models/systems/capacitor.py [-- quick]
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

def build(cmax):
    s = mn.reset(); M = stdmats(); P = Parts()
    M['cell_on'] = glow('cell_on', '#4fd8ee', 1.35)
    M['cell_top'] = glow('cell_top', '#e9fdff', 1.2)
    M['cell_hot'] = glow('cell_hot', '#f4ffff', 1.5)
    M['cell_off'] = pmat('cell_off', '#1d2a33', 0.15, 0.3)
    M['led_on'] = glow('led_on', '#5fd6a0', 1.2)
    M['paint'] = worn('cpaint', '#4a8090', 0.5, 0.3)          # teal-ish electrical cabinet

    cw, gap, pad = 0.42, 5 / 48, 7 / 48
    W = cmax * cw + (cmax - 1) * gap + 14 / 48; D = 0.9
    cell_x = [-W / 2 + pad + cw / 2 + i * (cw + gap) for i in range(cmax)]

    # plinth and cabinet
    P(mn.box('plinth', (W, D, 0.1), m=M['frame'], bevel=0.03))
    P(mn.box('plinth_hz', (W - 0.12, 0.12, 0.012), loc=(0, -D / 2 + 0.1, 0.1), m=M['hazard'], bevel=0.003))
    CB0, CB1, CZ = -D / 2 + 0.2, D / 2 - 0.04, 0.5          # cabinet front, back, top
    P(mn.box('cab', (W - 0.06, CB1 - CB0, CZ - 0.1), loc=(0, (CB0 + CB1) / 2, 0.1), m=M['paint'], bevel=0.05))
    P(mn.box('lid', (W - 0.02, CB1 - CB0 + 0.04, 0.06), loc=(0, (CB0 + CB1) / 2, CZ - 0.02), m=M['paint'], bevel=0.025))
    TOP = CZ + 0.04
    # front panel: LEDs, stencil, vents
    FY = CB0
    P(mn.box('fpanel', (W - 0.3, 0.03, 0.22), loc=(0, FY - 0.005, 0.17), m=M['body2'], bevel=0.01))
    leds = []
    for i, x in enumerate(cell_x):
        P(mn.cyl('led_ring', 0.035, 0.03, loc=(x, FY - 0.02, 0.33), m=M['dark'], rot=R90, verts=12, bevel=0.006))
        leds.append(P(mn.cyl('led', 0.024, 0.03, loc=(x, FY - 0.035, 0.33), m=M['lamp_off'], rot=R90, verts=12, bevel=0.005)))
    for i in range(3):
        P(mn.box('slat', (W * 0.35, 0.03, 0.02), loc=(W * 0.18, FY - 0.03, 0.17 + i * 0.045), m=M['dark'], bevel=0.005))
    P(mn.box('stk', (0.36, 0.01, 0.1), loc=(-W * 0.2, FY - 0.03, 0.16), m=M['sticker'], bevel=0.002))
    P(label('stk_t', 'HIGH VOLT', 0.045, (-W * 0.2, FY - 0.04, 0.21), rot=R90, m=M['ink']))
    for x in (-W / 2 + 0.1, W / 2 - 0.1):
        for z in (0.16, 0.42):
            P(mn.cyl('rivet', 0.018, 0.02, loc=(x, FY - 0.01, z), m=M['steel'], rot=R90, verts=8, bevel=0.005))
    P(mn.box('tape', (0.28, 0.01, 0.07), loc=(W / 2 - 0.3, FY - 0.04, 0.4), m=M['tape'], bevel=0.002, rot=(0, math.radians(14), 0)))

    # the cells: a socket, a glowing core in a 4-bar cage, a copper coil band and a cap with a terminal
    CY = 0.04; R = cw * 0.38; Z0, Z1 = TOP, TOP + 0.62
    cores, tops, cages = [], [], []
    for i, x in enumerate(cell_x):
        P(mn.cyl('sock', R + 0.05, 0.05, loc=(x, CY, TOP - 0.01), m=M['steel'], bevel=0.015))
        cores.append(P(mn.cyl('core', R - 0.02, Z1 - Z0, loc=(x, CY, Z0), m=M['cell_off'], bevel=0, verts=24)))
        tops.append(P(mn.cyl('core_top', R - 0.03, 0.02, loc=(x, CY, Z1 + 0.02), m=M['cell_off'], bevel=0, verts=24)))
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            cages.append(P(mn.cyl('cage', 0.014, Z1 - Z0, loc=(x + math.cos(a) * R, CY + math.sin(a) * R, Z0), m=M['steel'], verts=8, bevel=0.005)))
        P(ring('coil', R + 0.025, 0.04, 0.05, loc=(x, CY, Z0 + 0.12), m=M['copper'], verts=24))
        P(ring('coil2', R + 0.025, 0.04, 0.05, loc=(x, CY, Z0 + 0.2), m=M['copper'], verts=24))
        P(ring('cap', R + 0.035, 0.07, 0.07, loc=(x, CY, Z1), m=M['body2'], verts=24))
        P(mn.cyl('term', 0.035, 0.05, loc=(x, CY + R + 0.04, Z1 + 0.02), m=M['steel'], bevel=0.012, verts=10))
    # copper bus bar over the cell terminals, out to the back (the power line leaves here)
    P(mn.box('bus', (cell_x[-1] - cell_x[0] + 0.1, 0.05, 0.03), loc=((cell_x[0] + cell_x[-1]) / 2, CY + R + 0.04, Z1 + 0.06), m=M['copper'], bevel=0.01))
    P(pipe('feed', [(cell_x[-1] + 0.05, CY + R + 0.04, Z1 + 0.075), (W / 2 - 0.08, CY + R + 0.04, Z1 + 0.075), (W / 2 - 0.08, D / 2 - 0.12, TOP + 0.1), (W / 2 - 0.08, D / 2 - 0.12, TOP)],
           0.03, pmat('cable', '#b8902e', 0.5, 0.6), corner=0.08))
    P(mn.box('warn', (0.22, 0.2, 0.01), loc=(-W / 2 + 0.2, D / 2 - 0.2, TOP), m=M['hazard'], bevel=0.003))

    # broken extras: soot, bent panel, a shattered cell
    broken = [P(soot_disc('soot', 0.55, (-0.1, CY - 0.05, TOP + 0.002), M['soot'])),
              P(plate('bent', (0.34, 0.02, 0.2), (W * 0.12, FY - 0.12, 0.12), (math.radians(55), 0, math.radians(18)), M['body']))]
    outline(P, thickness=0.012)
    for o in broken: show(o, False)
    return s, M, P, dict(cores=cores, tops=tops, leds=leds, broken=broken, cmax=cmax)

def render_states(cmax):
    s, M, P, S = build(cmax)
    name = f'systems/cap{cmax}'
    def state(charge, pulse=False):
        for i in range(cmax):
            on = i < charge
            setmat([S['cores'][i]], M['cell_on'] if on else M['cell_off'])
            setmat([S['tops'][i]], (M['cell_hot'] if pulse and i == charge - 1 else M['cell_top']) if on else M['cell_off'])
            setmat([S['leds'][i]], M['led_on'] if on else M['lamp_off'])
        if pulse: setmat([S['cores'][charge - 1]], M['cell_hot'])
    for c in range(cmax + 1):
        state(c); mn.render(f'{name}_c{c}', objs=list(P))
    for c in range(1, cmax + 1):
        state(c, pulse=True); mn.render(f'{name}_c{c}_pulse', objs=list(P))
    state(0)
    for o in S['cores'] + S['tops']: o.data.materials[0] = M['crazed']
    S['cores'][1].scale.z = 0.55
    for o in S['broken']: show(o, True)
    mn.render(f'{name}_broken', objs=list(P))

for cmax in ([3] if 'quick' in ARGS else [3, 4]):
    render_states(cmax)
