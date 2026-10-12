"""Shield button (js/art.js drawShieldButton; SHIELD_BUTTONS in js/ship.js; combat.js shields).

A sloped console pedestal against the lower deck's back wall (footprint 0.8 x 0.7, the game's SOLIDS
box) with a big mushroom button under a hazard collar, a ring of 8 LED segments around it that fills
up during the cooldown, an emitter grille and a SHIELD plate. Origin = the button's (x, y).

Renders (build/renders/systems/), one canvas:
  shield_ready          red button, ring dark: press me
  shield_up             button pushed in and glowing blue, ring all blue (the game adds its blue halo
                        as a runtime light / its radial gradient)
  shield_cd0 .. cd7     cooldown: dark red button, k = 1 - cd / SHIELD_COOLDOWN -> frame floor(k * 8),
                        that many ring segments lit
  shield_broken         cracked button cap, soot, a loose panel, dead LEDs
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

s = mn.reset(); M = stdmats(); P = Parts()
M['btn_red'] = pmat('btn_red', '#e2574c', 0.25, 0.0); M['btn_red'].node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 1
M['btn_dim'] = pmat('btn_dim', '#7a3a34', 0.4, 0.0)
M['btn_up'] = glow('btn_up', '#9cd8ff', 1.3)
M['seg_on'] = glow('seg_on', '#9cd8ff', 1.3)
M['paint'] = worn('spaint', '#6a7383', 0.5, 0.35)

W, D = 0.8, 0.7
P(mn.box('base', (W, D, 0.08), m=M['frame'], bevel=0.025))
H0, H1 = 0.42, 0.62                                   # sloped top: front lower, back higher
ped = P(wedge('ped', W - 0.08, D - 0.1, H0, H1, loc=(0, 0.02, 0.06), m=M['paint'], bevel=0.04))
P(mn.box('hz', (W - 0.14, 0.02, 0.1), loc=(0, -D / 2 + 0.06, 0.12), m=M['hazard'], bevel=0.004))
P(mn.box('plate', (0.36, 0.01, 0.09), loc=(0, -D / 2 + 0.065, 0.25), m=M['dark'], bevel=0.004))
P(label('plate_t', 'SHIELD', 0.06, (0, -D / 2 + 0.055, 0.295), rot=R90, m=M['sticker']))
for x in (-W / 2 + 0.09, W / 2 - 0.09):
    P(mn.cyl('rivet', 0.016, 0.02, loc=(x, -D / 2 + 0.07, 0.36), m=M['steel'], rot=R90, verts=8, bevel=0.004))

# the button sits on the slope: everything there is parented to a tilted empty
d = D - 0.1; cy = 0.0
z, tilt = on_slope(H0, H1, d, cy - 0.02)
top = []
top.append(mn.cyl('collar', 0.25, 0.05, m=M['hazard'], bevel=0.015, verts=40))
segs = []
for i in range(8):                                      # cooldown ring: 8 segments, clockwise from 12 o'clock
    a = math.pi / 2 - (i + 0.5) * math.tau / 8
    sg = mn.box('seg', (0.07, 0.035, 0.02), loc=(math.cos(a) * 0.335, math.sin(a) * 0.335, 0.03), m=M['lamp_off'], bevel=0.006, rot=(0, 0, a + math.pi / 2))
    segs.append(sg); top.append(sg)
stem = mn.cyl('stem', 0.12, 0.08, loc=(0, 0, 0.05), m=M['steel'], bevel=0.02, verts=24); top.append(stem)
cap = mn.sphere('cap', 0.2, loc=(0, 0, 0.12), m=M['btn_red'], scale=(1, 1, 0.55), segs=40); top.append(cap)
rim = ring('cap_rim', 0.205, 0.04, 0.05, loc=(0, 0, 0.1), m=M['frame'], verts=40); top.append(rim)
hl = mn.sphere('hl', 0.06, loc=(-0.07, 0.06, 0.225), m=pmat('hl', '#ffffff', 0.2), scale=(1, 0.7, 0.25)); top.append(hl)
press = [cap, rim, hl]
crack = soot_disc('soot', 0.38, (0.05, -0.03, 0.055), M['soot']); top.append(crack)
g = mn.group('top', top, loc=(0, cy, z + 0.06)); g.rotation_euler.x = tilt
for o in top: P(o)
# emitter grille behind the button
P(mn.box('grille', (0.6, 0.12, 0.05), loc=(0, D / 2 - 0.13, H1 + 0.02), m=M['dark'], bevel=0.015))
for i in range(5): P(mn.box('gslat', (0.04, 0.09, 0.03), loc=(-0.2 + i * 0.1, D / 2 - 0.13, H1 + 0.06), m=M['steel'], bevel=0.008))
P(mn.box('tape', (0.06, 0.32, 0.01), loc=(0.33, -0.05, 0.53), m=M['tape'], bevel=0.002, rot=(tilt, 0, 0.2)))
loose = P(plate('loose', (0.3, 0.02, 0.22), (-0.2, -D / 2 - 0.1, 0.1), (math.radians(65), 0, math.radians(-25)), M['paint']))
outline(P, 0.012)
show([crack, loose], False)
bpy.context.view_layer.update()

base_cap_z = cap.location.z
def state(btn, lit, pressed=False):
    setmat([cap], btn)
    for i, sg in enumerate(segs): setmat([sg], M['seg_on'] if i < lit else M['lamp_off'])
    for o in press: o.location.z = o.location.z  # (keep)
    dz = -0.05 if pressed else 0.0
    cap.location.z = base_cap_z + dz; rim.location.z = 0.1 + dz; hl.location.z = 0.225 + dz
    show(hl, btn == M['btn_red'])

objs = list(P)
state(M['btn_red'], 0); mn.render('systems/shield_ready', objs=objs)
state(M['btn_up'], 8, True); mn.render('systems/shield_up', objs=objs)
for k in range(8):
    state(M['btn_dim'], k); mn.render(f'systems/shield_cd{k}', objs=objs)
state(M['crazed'], 0); show([crack, loose], True); mn.render('systems/shield_broken', objs=objs)
