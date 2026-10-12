"""Fuel crate (js/decor.js fuelCrate, FUEL_CRATE in js/systems.js) and the fuel inserter
(js/progress.js drawInserter, the 'inserter' ship upgrade).

Every sprite here has its origin at FUEL_CRATE (17.4, 19.6), so they stack with no offsets.
  fuel_crate_c0 .. c4     the open crate (1.3 x 0.9, turned 0.08 rad like the game) with 4 slots,
                          power.reserve cells standing in them (4 = the spare-cell upgrade; the game's
                          crate drew 3 slots)
  inserter_arm_f0..f5     the yellow robot arm from the crate's back corner to the reactor's left side
                          (game points: (FUEL_CRATE.x + 0.4, y - 0.4) -> (REACTOR.x - w/2 + 0.3, REACTOR.y + 0.2)).
                          f0 = idle (k = 0); while loading (I.t > 0) play f = floor(I.t / 2 * 6): the elbow swings
                          out to the reactor and back carrying a cell, like the game's ex = lerp(.., sin(k pi)).
  inserter_handle_f0 (AUTO), inserter_handle_f1 (OFF)
                          the scooch handle at (FUEL_CRATE.x - 0.8, y): lever forward + green lamp (AUTO) or
                          pulled back + red lamp (OFF). The AUTO / OFF text stays procedural.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

ROT = 0.08
def cell(P, M, x, y, z):
    out = [mn.cyl('cell', 0.1, 0.34, loc=(x, y, z), m=M['cell'], bevel=0.02, verts=24),
           mn.cyl('cell_cap', 0.11, 0.06, loc=(x, y, z + 0.32), m=M['steel'], bevel=0.02, verts=24),
           mn.cyl('cell_nub', 0.045, 0.04, loc=(x, y, z + 0.37), m=M['dark'], bevel=0.012, verts=12),
           ring('cell_band', 0.112, 0.025, 0.04, loc=(x, y, z + 0.14), m=M['dark'], verts=24)]
    for o in out: P(o)
    return out

def crate():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['cell'] = glow('cell', '#2ee070', 0.9)
    M['paint'] = worn('fpaint', '#4a515e', 0.5, 0.35)
    W, D, H = 1.3, 0.9, 0.4
    body = []
    def B(o): body.append(P(o)); return o
    t = 0.07
    B(mn.box('floor', (W, D, 0.06), m=M['frame'], bevel=0.02))
    for sx in (-1, 1): B(mn.box('wall', (t, D, H), loc=(sx * (W - t) / 2, 0, 0), m=M['paint'], bevel=0.025))
    for sy in (-1, 1): B(mn.box('wall', (W - 2 * t, t, H), loc=(0, sy * (D - t) / 2, 0), m=M['paint'], bevel=0.025))
    B(mn.box('insert', (W - 2 * t, D - 2 * t, 0.12), loc=(0, 0, 0.06), m=M['frame'], bevel=0.01))
    xs = [-0.45, -0.15, 0.15, 0.45]
    for x in xs:
        B(ring('slot', 0.14, 0.035, 0.04, loc=(x, 0.02, 0.18), m=M['steel'], verts=24))
        B(mn.cyl('slot_h', 0.11, 0.01, loc=(x, 0.02, 0.18), m=M['hole'], bevel=0, verts=24))
    B(mn.box('hz', (W - 0.2, 0.012, 0.08), loc=(0, -D / 2 - 0.004, 0.27), m=M['hazard'], bevel=0.003))
    B(mn.box('lbl', (0.6, 0.012, 0.1), loc=(0, -D / 2 - 0.004, 0.1), m=M['sticker'], bevel=0.003))
    B(label('lbl_t', 'FUEL CELLS', 0.06, (0, -D / 2 - 0.012, 0.15), rot=R90, m=M['ink']))
    for sx in (-1, 1):
        B(mn.box('grip', (0.04, 0.2, 0.04), loc=(sx * (W / 2 + 0.01), 0, 0.26), m=M['steel'], bevel=0.012))
    B(mn.box('tape', (0.07, 0.4, 0.006), loc=(0.3, 0.32, H), m=M['tape'], bevel=0.002, rot=(0, 0, 0.3)))
    cells = [cell(P, M, x, 0.02, 0.18) for x in xs]
    outline(P, 0.012)
    root = rot_group('root', list(P), ROT)
    for n in range(5):
        for i, c in enumerate(cells): show(c, i < n)
        mn.render(f'systems/fuel_crate_c{n}', objs=list(P))

def inserter():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['arm'] = worn('arm', '#e8c34f', 0.45, 0.2)
    M['cell'] = glow('cell', '#2ee070', 0.9)
    M['green'] = glow('green', '#5fd6a0', 1.3); M['redl'] = glow('redl', '#e2574c', 1.3)
    # all coordinates relative to FUEL_CRATE, Blender axes (game y flipped)
    SH = (0.4, 0.4); WR = (3.2, 0.1)                     # shoulder (crate back corner), wrist (reactor port)
    static = []
    def S(o): static.append(P(o)); return o
    S(mn.cyl('mount', 0.14, 0.08, loc=(*SH, 0.4), m=M['frame'], bevel=0.02, verts=24))
    S(mn.cyl('post', 0.07, 0.62, loc=(*SH, 0.45), m=M['steel'], bevel=0.015, verts=20))
    S(mn.sphere('shoulder', 0.12, loc=(*SH, 1.08), m=M['frame']))
    S(mn.box('port', (0.18, 0.22, 0.22), loc=(WR[0] + 0.02, WR[1], 0.45), m=M['frame'], bevel=0.03))
    S(ring('port_hz', 0.1, 0.03, 0.03, loc=(WR[0] - 0.08, WR[1], 0.56), m=M['hazard'], rot=(0, math.radians(90), 0), verts=20))
    moving = []
    frames = list(range(1, 7))
    elbows = []
    for i in range(6):
        k = i / 6
        ex = SH[0] + (WR[0] - SH[0]) * (0.5 + 0.5 * math.sin(k * math.pi)); ey = (SH[1] + WR[1]) / 2 + 0.6
        elbows.append((ex, ey, 1.45 - 0.25 * math.sin(k * math.pi)))
    # build one arm per frame and show only its own frame (simplest way to animate a bent tube)
    for i, (ex, ey, ez) in enumerate(elbows):
        grp = [pipe('upper', [(SH[0], SH[1], 1.08), (ex, ey, ez)], 0.085, M['arm'], corner=0),
               pipe('fore', [(ex, ey, ez), (WR[0] - 0.12, WR[1], 0.56)], 0.07, M['arm'], corner=0),
               mn.sphere('elbow', 0.13, loc=(ex, ey, ez), m=M['frame']),
               mn.cyl('claw', 0.07, 0.14, loc=(WR[0] - 0.22, WR[1], 0.56), m=M['steel'], rot=(0, math.radians(90), 0), bevel=0.015, verts=16),
               pipe('hose', [(SH[0] + 0.08, SH[1], 1.0), ((SH[0] + ex) / 2, (SH[1] + ey) / 2, (1.08 + ez) / 2 - 0.12), (ex - 0.05, ey, ez - 0.08)], 0.018, M['rubber'], corner=0.1)]
        if i:                                            # carrying a cell under the elbow
            grp += [mn.cyl('cell', 0.08, 0.26, loc=(ex, ey, ez - 0.36), m=M['cell'], bevel=0.015, verts=16),
                    mn.cyl('cell_cap', 0.09, 0.05, loc=(ex, ey, ez - 0.12), m=M['steel'], bevel=0.015, verts=16)]
        for g in grp: P(g)
        moving.append(grp)
    outline(P, 0.012)
    for i, grp in enumerate(moving):
        for f in frames:
            for g in grp: key_hide(g, f, f != i + 1)
    s.frame_set(1)
    objs = static + [g for grp in moving for g in grp]
    mn.render('systems/inserter_arm', objs=objs, frames=frames)

def handle():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['green'] = glow('green', '#5fd6a0', 1.3); M['redl'] = glow('redl', '#e2574c', 1.3)
    HX = -0.8
    P(mn.box('bracket', (0.2, 0.36, 0.22), loc=(HX + 0.04, 0, 0), m=M['body2'], bevel=0.03))
    P(mn.box('slot', (0.05, 0.26, 0.01), loc=(HX + 0.04, 0, 0.22), m=M['hole'], bevel=0.003))
    lamp = P(mn.sphere('lamp', 0.04, loc=(HX + 0.04, -0.17, 0.2), m=M['green'], scale=(1, 0.7, 1)))
    lamp2 = P(mn.sphere('lamp2', 0.04, loc=(HX + 0.04, -0.17, 0.2), m=M['redl'], scale=(1, 0.7, 1)))
    hp = [mn.cyl('stick', 0.025, 0.3, loc=(0, 0, 0), m=M['steel'], bevel=0.008, verts=12),
          mn.sphere('knob', 0.06, loc=(0, 0, 0.32), m=M['dark'])]
    for o in hp: P(o)
    g = mn.group('h', hp, loc=(HX + 0.04, 0, 0.2))
    outline(P, 0.012)
    objs = list(P)
    for f, (ang, on) in ((1, (25, True)), (2, (-25, False))):       # f0 AUTO: leaning to the cells; f1 OFF: pulled back
        s.frame_set(f); g.rotation_euler.y = math.radians(ang); g.keyframe_insert('rotation_euler', index=1, frame=f)
        key_hide(lamp, f, not on); key_hide(lamp2, f, on)
    mn.render('systems/inserter_handle', objs=objs, frames=[1, 2])

only = [a for a in ARGS if a != 'quick']
for name, fn in [('crate', crate), ('inserter', inserter), ('handle', handle)]:
    if not only or name in only: fn()
