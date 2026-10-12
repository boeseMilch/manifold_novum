"""Clickable props: snack machine (js/hazards.js SNACK), hull plate crates (PLATE_CRATES), the coolant
crate (js/encounters.js COOLANT_CRATE) and the treadmill (TREADMILL, FURNITURE.tread* in js/ship.js,
js/interior.js exerciseBike).

  snack           1.1 x 0.8 vending machine against the north wall, origin = SNACK (x, y)
  plates_a_full, plates_a_empty     crate 1.0 x 0.9 turned 0.1 rad, origin = PLATE_CRATES[0] (12.6, 22.4)
  plates_b_full, plates_b_empty     crate 0.9 x 0.8 turned -0.1 rad, origin = PLATE_CRATES[1] (33.1, 22.8)
                  full while hz.plates > 0 (one shared count for both crates)
  coolant         crate 0.8 x 0.7 turned -0.2 rad with canisters, origin = COOLANT_CRATE (11.4, 22.6)
  treadmill_f0..f5
                  frame, rails and handlebar over R(39.3, 20.9, 40.3, 22.0); origin = its centre (39.8, 21.45).
                  Belt loop: the slats run towards the back (+y) with period 0.1875 units (the game's 9 px);
                  frame = floor(((t * WALK_SPEED * BELT_K) % 0.1875) / 0.1875 * 6).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

def snack():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('spaint', '#b8402e', 0.45, 0.2)
    W, D, H = 1.1, 0.8, 1.45
    P(mn.box('plinth', (W - 0.06, D - 0.06, 0.08), m=M['dark'], bevel=0.02))
    P(mn.box('body', (W, D, H - 0.08), loc=(0, 0, 0.08), m=M['paint'], bevel=0.05))
    P(mn.box('roof', (W + 0.03, D + 0.03, 0.06), loc=(0, 0, H - 0.02), m=M['paint'], bevel=0.02))
    P(mn.box('roof_vent', (0.5, 0.25, 0.02), loc=(0.1, 0.1, H + 0.04), m=M['dark'], bevel=0.01))
    P(mn.box('roof_box', (0.3, 0.22, 0.14), loc=(-0.25, 0.05, H + 0.04), m=pmat('cardboard', '#a48c5c', 0.8), bevel=0.01, rot=(0, 0, 0.3)))
    FY = -D / 2
    # window with three shelves of snacks
    wx, ww, wz0, wz1 = -0.16, 0.66, 0.42, 1.28
    P(mn.box('win_back', (ww, 0.04, wz1 - wz0), loc=(wx, FY - 0.01, wz0), m=pmat('wb', '#1c2633', 0.5), bevel=0.005))
    P(mn.box('win_frame', (ww + 0.06, 0.03, 0.03), loc=(wx, FY - 0.08, wz1), m=M['frame'], bevel=0.01))
    P(mn.box('win_frame2', (ww + 0.06, 0.03, 0.03), loc=(wx, FY - 0.08, wz0 - 0.03), m=M['frame'], bevel=0.01))
    cols = ['#e8c34f', '#5fd6a0', '#e2574c', '#9b59b6', '#2e7dc9', '#e8762e']
    rnd = __import__('random').Random(3)
    for r in range(3):
        z = wz0 + 0.04 + r * 0.28
        P(mn.box('shelf', (ww - 0.02, 0.12, 0.015), loc=(wx, FY - 0.08, z), m=M['steel'], bevel=0.003))
        for c in range(4):
            col = cols[(r * 4 + c) % len(cols)]
            h = 0.14 + rnd.random() * 0.06
            P(mn.box('snack', (0.12, 0.05, h), loc=(wx - ww / 2 + 0.1 + c * 0.155, FY - 0.08, z + 0.015), m=pmat('s' + col, col, 0.4), bevel=0.012))
            P(pipe('coil', [(wx - ww / 2 + 0.1 + c * 0.155 + 0.05 * math.cos(a), FY - 0.05 + 0.04 * math.sin(a), z + 0.04 + 0.0 * a) for a in [k * 0.6 for k in range(12)]], 0.006, M['steel'], corner=0))
    gl = pmat('glass', '#bfe8ff', 0.05); b = gl.node_tree.nodes['Principled BSDF']; b.inputs['Alpha'].default_value = 0.18; b.inputs['Coat Weight'].default_value = 1
    for sx in (-1, 1): P(mn.box('case_side', (0.03, 0.16, wz1 - wz0 + 0.03), loc=(wx + sx * (ww / 2 + 0.015), FY - 0.07, wz0 - 0.03), m=M['frame'], bevel=0.01))
    P(mn.box('glare', (0.025, 0.012, 0.3), loc=(wx - 0.2, FY - 0.16, wz0 + 0.45), m=glow('glare', '#e8f6ff', 0.6), bevel=0, rot=(0, math.radians(-25), 0)))
    # right column: sign, keypad, coin slot
    cx = W / 2 - 0.17
    P(mn.box('sign_bg', (0.26, 0.03, 0.16), loc=(cx, FY - 0.005, 1.12), m=M['dark'], bevel=0.01))
    P(label('sign', 'SNAX', 0.09, (cx, FY - 0.02, 1.2), rot=R90, m=glow('sign', '#ffd38a', 1.3)))
    for r in range(3):
        for c in range(3):
            P(mn.box('key', (0.045, 0.02, 0.04), loc=(cx - 0.06 + c * 0.06, FY - 0.01, 0.78 + r * 0.06), m=M['steel'], bevel=0.006))
    P(mn.box('coin', (0.1, 0.02, 0.1), loc=(cx, FY - 0.01, 0.6), m=M['frame'], bevel=0.01))
    P(mn.box('coin_slot', (0.012, 0.02, 0.05), loc=(cx, FY - 0.02, 0.625), m=M['hole'], bevel=0))
    P(mn.box('tray', (0.6, 0.06, 0.16), loc=(-0.12, FY - 0.01, 0.15), m=M['hole'], bevel=0.02))
    P(mn.box('tray_flap', (0.6, 0.03, 0.09), loc=(-0.12, FY - 0.03, 0.15), m=M['frame'], bevel=0.01))
    P(mn.box('tape', (0.3, 0.012, 0.06), loc=(0.2, FY - 0.02, 0.36), m=M['tape'], bevel=0.002, rot=(0, math.radians(20), 0)))
    P(mn.box('stk', (0.18, 0.012, 0.12), loc=(cx, FY - 0.012, 0.36), m=M['sticker'], bevel=0.002, rot=(0, math.radians(-6), 0)))
    P(label('stk_t', 'FREE', 0.05, (cx, FY - 0.02, 0.36 + 0.0), rot=(math.radians(90), math.radians(-6), 0), m=M['ink']))
    outline(P, 0.013)
    mn.render('systems/snack', objs=list(P))

def crate(name, w, d, rot, col, text, contents):
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('cpaint', col, 0.55, 0.3)
    H, t = 0.42, 0.06
    P(mn.box('floor', (w, d, 0.06), m=M['frame'], bevel=0.02))
    for sx in (-1, 1): P(mn.box('wall', (t, d, H), loc=(sx * (w - t) / 2, 0, 0), m=M['paint'], bevel=0.02))
    for sy in (-1, 1): P(mn.box('wall', (w - 2 * t, t, H), loc=(0, sy * (d - t) / 2, 0), m=M['paint'], bevel=0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P(mn.box('corner', (0.09, 0.09, H + 0.02), loc=(sx * (w / 2 - 0.035), sy * (d / 2 - 0.035), 0), m=M['frame'], bevel=0.015))
    P(mn.box('lbl', (min(0.6, w - 0.3), 0.012, 0.12), loc=(0, -d / 2 - 0.004, 0.14), m=M['sticker'], bevel=0.003))
    P(label('lbl_t', text, 0.075, (0, -d / 2 - 0.012, 0.2), rot=R90, m=M['ink']))
    P(mn.box('tape', (0.07, 0.3, 0.006), loc=(w / 2 - 0.2, -0.05, H), m=M['tape'], bevel=0.002, rot=(0, 0, 0.5)))
    stuff = contents(P, M, w, d, H)
    outline(P, 0.012)
    rot_group('root', list(P), rot)
    objs = list(P)
    if stuff is None: mn.render(f'systems/{name}', objs=objs); return
    mn.render(f'systems/{name}_full', objs=objs)
    show(stuff, False); mn.render(f'systems/{name}_empty', objs=objs)

def plates(P, M, w, d, H):
    pm = worn('plate', '#b0b8c6', 0.4, 0.6)
    out = []
    for i in range(6):                                     # hull plates on edge, leaning in a row
        y = -d / 2 + 0.2 + i * (d - 0.38) / 5
        o = P(mn.box('hplate', (w - 0.22, 0.04, 0.5), loc=(0, 0, 0), m=pm, bevel=0.012))
        o.location = (0.02 * (i % 2), y, 0.06); o.rotation_euler = (math.radians(16), 0, 0.03 * (i - 2.5))
        out.append(o)
    return out

def coolant(P, M, w, d, H):
    cm = pmat('can', '#4ac0e0', 0.35, 0.3); lb = pmat('canlbl', '#e8f8ff', 0.5)
    for i, (x, y) in enumerate([(-0.17, 0.13), (0.15, 0.13), (-0.17, -0.15), (0.15, -0.15)]):
        P(mn.cyl('can', 0.12, 0.48, loc=(x, y, 0.06), m=cm, bevel=0.03, verts=24))
        P(ring('can_lbl', 0.122, 0.01, 0.12, loc=(x, y, 0.28), m=lb, verts=24))
        P(mn.cyl('can_cap', 0.06, 0.07, loc=(x, y, 0.54), m=M['dark'], bevel=0.015, verts=16))
        P(mn.cyl('can_ring', 0.09, 0.02, loc=(x, y, 0.53), m=M['steel'], bevel=0.006, verts=20))
    return None

def treadmill():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('tpaint', '#3a3f4a', 0.5, 0.35)
    M['belt'] = pmat('belt', '#1c2028', 0.8)
    M['slat'] = pmat('slat', '#5a6272', 0.6)
    cx, cy = 39.8, 21.45
    def G(x, y): return (x - cx, -(y - cy))          # game -> local Blender
    bx0, bx1, by0, by1 = 39.51, 40.09, 21.15, 22.0  # belt (TREADMILL)
    fx0, fx1, fy0 = 39.3, 40.3, 20.9
    (x0, y0), (x1, y1) = G(bx0, by0), G(bx1, by1)
    BZ = 0.12
    P(mn.box('deck', (bx1 - bx0, abs(y1 - y0) + 0.04, BZ - 0.02), loc=(0, (y0 + y1) / 2, 0.0), m=M['belt'], bevel=0.02))
    for sx, (rx0, rx1) in ((-1, (fx0, bx0)), (1, (bx1, fx1))):
        a, _ = G(rx0, 0); b_, _ = G(rx1, 0)
        P(mn.box('rail', (b_ - a, abs(y1 - y0), 0.16), loc=((a + b_) / 2, (y0 + y1) / 2, 0), m=M['paint'], bevel=0.03))
        P(mn.box('grip', (b_ - a - 0.06, abs(y1 - y0) - 0.1, 0.01), loc=((a + b_) / 2, (y0 + y1) / 2, 0.16), m=M['rubber'], bevel=0.003))
    P(mn.box('roller_end', (bx1 - bx0, 0.06, 0.1), loc=(0, y1 - 0.01, 0.0), m=M['frame'], bevel=0.02))
    # front: console posts and handlebar over FURNITURE.treadBar
    _, hy0 = G(0, fy0); _, hy1 = G(0, by0)
    hy = (hy0 + hy1) / 2
    P(mn.box('front', (fx1 - fx0, hy0 - hy1, 0.2), loc=(0, hy, 0), m=M['paint'], bevel=0.03))
    for sx in (-1, 1):
        P(mn.box('upright', (0.07, 0.07, 0.95), loc=(sx * 0.42, hy, 0.15), m=M['frame'], bevel=0.02, rot=(math.radians(-8), 0, 0)))
    P(mn.box('console', (0.5, 0.18, 0.12), loc=(0, hy + 0.02, 1.0), m=M['paint'], bevel=0.03, rot=(math.radians(-25), 0, 0)))
    P(mn.box('display', (0.18, 0.01, 0.06), loc=(0, hy - 0.07, 1.07), m=glow('disp', '#47e07a', 1.2), bevel=0.003, rot=(math.radians(65), 0, 0)))
    P(pipe('bar', [(-0.48, hy - 0.06, 0.98), (-0.48, hy - 0.2, 0.95), (0.48, hy - 0.2, 0.95), (0.48, hy - 0.06, 0.98)], 0.035, pmat('red', '#c0392b', 0.45), corner=0.08))
    P(mn.box('tape', (0.06, 0.12, 0.08), loc=(0.3, hy - 0.2, 0.91), m=M['tape'], bevel=0.01))
    P(mn.box('towel', (0.2, 0.06, 0.25), loc=(-0.48, hy - 0.06, 0.72), m=pmat('towel', '#5fa8c9', 0.9), bevel=0.02))
    # belt slats: one set per frame, each slat moving towards the back (Blender -Y)
    period = 9 / 48; frames = list(range(1, 7)); sets = []
    L0, L1 = min(y0, y1), max(y0, y1)
    for i in range(6):
        off = period * i / 6; grp = []
        yy = L1 - 0.02 - off
        while yy > L0 + 0.02:
            grp.append(P(mn.box('slat', (bx1 - bx0 - 0.04, 0.03, 0.006), loc=(0, yy, BZ - 0.02), m=M['slat'], bevel=0)))
            yy -= period
        sets.append(grp)
    outline([o for o in P if o.name.split('.')[0] != 'slat'], 0.012)
    for i, grp in enumerate(sets):
        for f in frames:
            for g in grp: key_hide(g, f, f != i + 1)
    s.frame_set(1)
    mn.render('systems/treadmill', objs=list(P), frames=frames)

only = [a for a in ARGS if a != 'quick']
jobs = [('snack', snack),
        ('plates', lambda: (crate('plates_a', 1.0, 0.9, 0.1, '#6a6f7a', 'PLATES', plates), crate('plates_b', 0.9, 0.8, -0.1, '#6a6f7a', 'PLATES', plates))),
        ('coolant', lambda: crate('coolant', 0.8, 0.7, -0.2, '#4a8aa0', 'COOLANT', coolant)),
        ('treadmill', treadmill)]
for name, fn in jobs:
    if not only or name in only: fn()
