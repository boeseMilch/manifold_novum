"""Power-line hardware and the broken-system overlay pieces.

Power lines (js/systems.js POWER_LINES, drawPowerLines) stay procedural: they are long free polylines
whose colour and flowing dash change with the capacitor's state, which a stroked path does best. The
3D look comes from a few sprites placed along them:
  power_clamp_d0..d7     the cable clamp (strap + two bolts) drawn every 3.5 units along a line, d = the
                         line direction rounded to 45 degrees (dir i = game angle i*45; a strap across the
                         cable). Origin = the clamp centre on the floor. ~0.22 units across.
Broken systems (drawBroken): smoke, sparks and the BROKEN text stay runtime effects (they animate and
are shared by every system); the static parts are sprites:
  broken_scorch          soot decal, radius 1.0, origin at its centre (scale it to min(s.r, 1.1))
  broken_panel           the loose, bent cover panel (game: 16 x 10 px at (r*0.3, -r*0.2), rotated 0.5)
Most systems also have their own *_broken sprite (cap*, shield, helm/security, lever_base).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

def clamp():
    s = mn.reset(); M = stdmats(); P = Parts()
    # built along +x (the cable direction): a strap arching over the cable, feet with bolts on both sides
    P(pipe('strap', [(0, -0.11, 0.0), (0, -0.07, 0.07), (0, 0.07, 0.07), (0, 0.11, 0.0)], 0.03, M['steel'], corner=0.04))
    for sy in (-1, 1):
        P(mn.box('foot', (0.1, 0.07, 0.025), loc=(0, sy * 0.12, 0), m=M['frame'], bevel=0.01))
        P(mn.cyl('bolt', 0.02, 0.02, loc=(0, sy * 0.12, 0.025), m=M['steel'], verts=6, bevel=0.005))
    outline(P, 0.008)
    root = mn.group('root', list(P))
    mn.render('systems/power_clamp', objs=list(P), root=root, dirs=8)

def scorch():
    s = mn.reset(); M = stdmats(); P = Parts()
    P(soot_disc('soot', 1.0, (0, 0, 0.002), M['soot']))
    mn.render('systems/broken_scorch', objs=list(P))

def panel():
    s = mn.reset(); M = stdmats(); P = Parts()
    pm = worn('ppanel', '#5a6272', 0.5, 0.4)
    o = P(mn.box('panel', (0.34, 0.22, 0.02), m=pm, bevel=0.008))
    bd = o.modifiers.new('bend', 'SIMPLE_DEFORM'); bd.deform_method = 'BEND'; bd.angle = math.radians(35); bd.deform_axis = 'Y'
    o.modifiers.move(len(o.modifiers) - 1, 0)
    o.rotation_euler = (math.radians(12), 0, -0.5); o.location = (0, 0, 0.04)
    for sx, sy in ((-0.13, -0.07), (0.13, 0.07)):
        P(mn.cyl('rivet', 0.015, 0.01, loc=(sx * math.cos(0.5) + sy * math.sin(0.5), -sx * math.sin(0.5) + sy * math.cos(0.5), 0.06), m=M['steel'], verts=6, bevel=0.003))
    P(mn.box('scratch', (0.2, 0.012, 0.003), loc=(0, 0, 0.065), m=M['steel'], bevel=0, rot=(0, 0, -0.2)))
    outline(P, 0.01)
    mn.render('systems/broken_panel', objs=list(P))

only = [a for a in ARGS if a != 'quick']
for name, fn in [('clamp', clamp), ('scorch', scorch), ('panel', panel)]:
    if not only or name in only: fn()
