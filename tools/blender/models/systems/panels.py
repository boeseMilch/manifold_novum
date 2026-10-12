"""Gravity breakers (js/hazards.js GRAV_PANELS, drawn while hz.noGrav lists the room) and the airlock
vent panels (VENT_PANELS, drawHazardProps).

  grav_ok, grav_on, grav_off
        a floor hatch 0.58 x 0.42 with the breaker under a glass dome. ok: dome dark (no failure: the game
        draws nothing, use it as floor detail or skip it); on / off: the two blink phases of a failure
        (Math.sin(t * 6) > 0 -> on). Origin = the panel's (x, y). 'NO GRAVITY' stays procedural text.
  vent_port_*, vent_star_*   (* = idle, alarm_f0, alarm_f1, venting)
        the vent panels sit against the side walls, which are edge-on in the tilted view, so the panel is a
        floor-standing control post (0.375 x 0.5 footprint, as the game's 18 x 24 px box) with its sloped
        face turned towards the room. idle: lamp dark; alarm_f0/f1: plasma fire in the room, red blink
        (Math.sin(t * 8) > 0 -> f0); venting: hz.vent in this room, blue. Origin = VENT_PANELS[room].
        'VENT' text stays procedural.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

def grav():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['plate'] = worn('gplate', '#4a515e', 0.55, 0.5)
    W, D = 0.58, 0.42
    P(mn.box('frame', (W, D, 0.03), m=M['frame'], bevel=0.01))
    P(mn.box('plate', (W - 0.06, D - 0.06, 0.03), loc=(0, 0, 0.012), m=M['plate'], bevel=0.008))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P(mn.cyl('screw', 0.022, 0.015, loc=(sx * (W / 2 - 0.06), sy * (D / 2 - 0.06), 0.04), m=M['steel'], verts=8, bevel=0.004))
    P(ring('dome_rim', 0.085, 0.03, 0.03, loc=(0, 0, 0.04), m=M['hazard'], verts=24))
    dome = P(mn.sphere('dome', 0.075, loc=(0, 0, 0.055), m=M['lamp_off'], scale=(1, 1, 0.7)))
    P(mn.box('pry', (0.08, 0.02, 0.006), loc=(-W / 2 + 0.1, 0, 0.042), m=M['hole'], bevel=0))
    P(mn.box('pry2', (0.08, 0.02, 0.006), loc=(W / 2 - 0.1, 0, 0.042), m=M['hole'], bevel=0))
    P(mn.box('stripe', (0.14, 0.05, 0.004), loc=(0, -D / 2 + 0.07, 0.042), m=M['sticker'], bevel=0))
    outline(P, 0.008)
    objs = list(P)
    mn.render('systems/grav_ok', objs=objs)
    setmat([dome], glow('cy', '#7af0ff', 1.4)); mn.render('systems/grav_on', objs=objs)
    setmat([dome], pmat('cyd', '#2a5060', 0.2)); mn.render('systems/grav_off', objs=objs)

def vent(side):
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('vpaint', '#6a7383', 0.5, 0.35)
    sg = -1 if side == 'port' else 1                   # the wall is on this side (-x for port)
    W, D = 0.375, 0.5
    P(mn.box('foot', (W, D, 0.05), m=M['frame'], bevel=0.015))
    P(mn.box('post', (0.14, 0.16, 0.45), loc=(sg * 0.05, 0.08, 0.05), m=M['frame'], bevel=0.03))
    HZ0, HZ1 = 0.45, 0.85
    P(mn.box('head', (W - 0.02, 0.3, HZ1 - HZ0), loc=(0, 0.04, HZ0), m=M['paint'], bevel=0.035))
    P(mn.box('top', (W + 0.01, 0.33, 0.04), loc=(0, 0.04, HZ1 - 0.01), m=M['body2'], bevel=0.015))
    FY = 0.04 - 0.15
    P(mn.box('stripe', (W - 0.08, 0.012, 0.07), loc=(0, FY - 0.004, HZ1 - 0.12), m=M['hazard'], bevel=0.003))
    P(mn.cyl('lamp_rim', 0.09, 0.03, loc=(0, FY - 0.0, HZ0 + 0.17), m=M['steel'], rot=R90, verts=24, bevel=0.01))
    lamp = P(mn.sphere('lamp', 0.07, loc=(0, FY - 0.03, HZ0 + 0.17), m=M['lamp_off'], scale=(1, 0.6, 1)))
    P(mn.box('lbl', (0.22, 0.012, 0.05), loc=(0, FY - 0.004, HZ0 + 0.03), m=M['sticker'], bevel=0.002))
    P(label('lbl_t', 'VENT', 0.04, (0, FY - 0.012, HZ0 + 0.055), rot=R90, m=M['ink']))
    P(mn.box('cover', (0.2, 0.18, 0.03), loc=(0, 0.05, HZ1 + 0.03), m=M['red'], bevel=0.01, rot=(math.radians(-12), 0, 0)))
    P(mn.box('hinge', (0.22, 0.03, 0.03), loc=(0, 0.15, HZ1 + 0.03), m=M['steel'], bevel=0.01))
    P(pipe('conduit', [(sg * 0.05, 0.16, 0.1), (sg * 0.05, 0.28, 0.1), (sg * 0.05, 0.28, 0.0)], 0.03, M['rubber'], corner=0.05))
    outline(P, 0.012)
    objs = list(P)
    mn.render(f'systems/vent_{side}_idle', objs=objs)
    setmat([lamp], glow('r1', '#ff4a3a', 1.4)); mn.render(f'systems/vent_{side}_alarm_f0', objs=objs)
    setmat([lamp], pmat('r0', '#7a1a14', 0.2)); mn.render(f'systems/vent_{side}_alarm_f1', objs=objs)
    setmat([lamp], glow('b1', '#7ab8ff', 1.4)); mn.render(f'systems/vent_{side}_venting', objs=objs)

only = [a for a in ARGS if a != 'quick']
for name, fn in [('grav', grav), ('vent', lambda: (vent('port'), vent('star')))]:
    if not only or name in only: fn()
