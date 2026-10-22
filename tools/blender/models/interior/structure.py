"""Wall junctions, the vertical-wall step and the spine (the hull block between the decks).

Builds on the prototype wall kit (ship/wall_h, wall_h_low, wall_v, wall_v_low, wall_v_end,
wall_v_low_end): same thickness (0.6), heights (1.6 back walls, 0.35 cut-down near walls), materials
and cable tray.

Junctions (corners, T-junctions, crossings, free ends)
  interior/wall_j_<arms>        full height (1.6)
  interior/wall_j_low_<arms>    cut-down height (0.35)
  <arms> = the directions the wall continues in, from 'nesw' (n = up the screen / game -y):
    es, sw (corners at a back wall: ┌ ┐), ne, nw (corners at a near wall: └ ┘), esw (┬), nes (├),
    nsw (┤), new (┴), nesw (┼), ew / ns (straight, for completeness), e, s, w, n (free ends).
  The square is the 0.6 x 0.6 where the walls meet. Origin = the centre line of the up-down wall (x),
  at the south edge of the square (= the front-face line of the horizontal wall), on the floor.
  Canvas 60 px wide (like ship/wall_v). With an 's' arm only the square's top shows (the arm's
  top strip covers the rest); without one the square's south face (a corner column with a lamp,
  guards and a hazard plate) shows down to the floor. Draw junctions after the straight pieces.

Step
  interior/wall_v_step   an up-down wall stepping from full height (north) to the cut-down height
                         (south), ~1.4 units before a near wall (the cutaway rule). Origin = the
                         step's position, wall centre, on the floor. Shows the step face and the
                         last 0.4 units of the high top; draw it over the wall_v / wall_v_low tiles.

Spine (SPINE_Y0 = 11.5 .. SPINE_Y1 = 14 in js/ship.js; drawSpine in js/art.js; 2.5 thick since the deck airlocks
became single deck doors, 2026-10-21: it was 3.5)
  interior/spine_a, spine_b   tileable along x, 2 units per tile (192 px). Origin = left end, on the
                              floor at y = SPINE_Y1 (the bottom deck's back wall front-face line).
  interior/spine_label        the DECK 2 stencil on the spine top, placed by the game (no baked text in
                              the tiles: the deck airlocks clip them).
  The spine is the top deck's near wall and the bottom deck's back wall in one block: a full-height
  block from y = 12.55 to 14 with a cut-down (0.35) lip from 11.5 to 12.55. 12.55 is where a 1.6
  high top hides exactly as much of the top rooms as a 0.35 near wall does (0.29 units), so the
  lip never shows; only the high top (the conduits from drawSpine: teal, grey, copper, with clamps)
  and the front face (the bottom rooms' back wall). Top-deck up-down walls run at full height
  through the lip down to y = 12.55, so their tops join the spine top without an end face.
  The deck doors' passages cut through the spine: see deckdoor.py (it brings its own spine ends).
"""
import sys, os, math, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

ARMLEN = 3.0
SPINE_Y0, SPINE_Y1 = 11.5, 14.0
SPINE_HI = SPINE_Y0 - H_LOW * COS / SIN + COVER           # 12.549: the high block's north edge

def cross_pts(arms, a=-0.3, b=0.3, n=-0.6, s=0.0, L=ARMLEN):
    p = [(a, n)]
    if 'n' in arms: p += [(a, n - L), (b, n - L)]
    p.append((b, n))
    if 'e' in arms: p += [(b + L, n), (b + L, s)]
    p.append((b, s))
    if 's' in arms: p += [(b, s + L), (a, s + L)]
    p.append((a, s))
    if 'w' in arms: p += [(a - L, s), (a - L, n)]
    return p

def junction(arms, H):
    mn.reset(); M = mats(); objs = []
    low = H < 1
    objs.append(prism('body', cross_pts(arms), 0, H - 0.08, M['body'], 0.02))
    d = 0.02
    objs.append(prism('cap', cross_pts(arms, -0.3 - d, 0.3 + d, -0.6 - d, 0.0 + d, ARMLEN), H - 0.08, H, M['cut' if low else 'cap'], 0.02))
    # front faces of the horizontal arms (mostly outside the canvas, but they shade the corner)
    for arm, (x0, x1) in (('e', (0.3, 0.3 + ARMLEN)), ('w', (-0.3 - ARMLEN, -0.3))):
        if arm in arms: objs += wall_x(M, x0, x1, 0.0, H, tray_on=False, body=False)
    if 's' not in arms:                                    # the square's south face shows: a corner column
        objs.append(gbox('col', -0.3, -0.02, 0.3, 0.035, 0.0, H - 0.1, M['panel2'] if not low else M['panel'], 0.015))
        objs += end_face(M, 0.0, 0.035, H)
    if not low:
        ty = -0.3                                          # tray centre lines
        if 'e' in arms or 'w' in arms:
            objs += tray(M, 'x', -0.3 - ARMLEN if 'w' in arms else -0.1, 0.3 + ARMLEN if 'e' in arms else 0.1, H, c=ty)
        if 'n' in arms or 's' in arms:
            objs += tray(M, 'y', -0.6 - ARMLEN if 'n' in arms else ty - 0.1, ARMLEN if 's' in arms else ty + 0.1, H, c=0.0)
        # junction box where the trays meet (or the tray ends)
        objs.append(gbox('jbox', -0.22, ty - 0.22, 0.22, ty + 0.22, H, H + 0.13, M['body'], 0.02))
        objs.append(gbox('jlid', -0.19, ty - 0.19, 0.19, ty + 0.19, H + 0.13, H + 0.16, M['panel2'], 0.012))
        for sx in (-1, 1):
            for sy in (-1, 1): objs.append(rivet(sx * 0.15, ty + sy * 0.15, H + 0.16, M, r=0.022))
        objs.append(gbox('jhz', -0.12, ty + 0.05, 0.12, ty + 0.11, H + 0.16, H + 0.165, M['hazard'], 0.003))
    else:
        for sx in (-1, 1):                                 # cut-down corner: two bolts on the cut
            objs.append(rivet(sx * 0.17, -0.3, H, M, r=0.025))
    mn.outline(objs, thickness=0.012)
    return objs

def render_junction(arms, H):
    junction(arms, H)
    name = f"interior/wall_j_{'low_' if H < 1 else ''}{arms}"
    top_margin = 0.0 if 'n' in arms else (0.25 if H > 1 else 0.06)
    xmax = 0.3125
    # window in game terms: the square, from the top-back edge (+ tray) down to the floor or the top-front edge
    zmin = 0.0 if 's' not in arms else H
    gy1 = 0.0 if 's' not in arms else 0.0
    w = win(name, -xmax, xmax, -0.6, gy1, H + top_margin / COS, origin=(0.0, 0.0), zmin=zmin,
            extra={'height': H, 'arms': arms,
                   'note': 'wall junction square (0.6 x 0.6); origin = up-down wall centre x, south edge of the square, on the floor'})

def render_step():
    mn.reset(); M = mats()
    # full height from the north to y = 0, cut-down from 0 to the south
    objs = wall_y(M, 0.0, -4.0, 0.0, H_FULL)
    objs += wall_y(M, 0.0, 0.0, 2.0, H_LOW)
    objs += [gbox('step_face', -0.27, -0.03, 0.27, 0.0, H_LOW, H_FULL - 0.1, M['panel'], 0.012)]
    for sx in (-1, 1):
        objs.append(gbox('guard', sx * 0.3 - 0.03, -0.03, sx * 0.3 + 0.03, 0.03, H_LOW, H_FULL - 0.1, M['steel'], 0.015))
    objs.append(gbox('hz', -0.23, -0.005, 0.23, 0.015, H_LOW + 0.05, H_LOW + 0.25, M['hazard'], 0.005))
    objs.append(gbox('lamp_h', -0.06, -0.005, 0.06, 0.045, 0.85, 1.35, M['dark'], 0.015))
    objs.append(gbox('lamp', -0.03, 0.04, 0.03, 0.06, 0.89, 1.31, M['light'], 0.005))
    mn.outline(objs, thickness=0.012)
    win('interior/wall_v_step', -0.3125, 0.3125, -0.4, 0.0, H_FULL + 0.18 / COS, origin=(0.0, 0.0), zmin=H_LOW,
        extra={'note': 'up-down wall stepping from 1.6 (north) to 0.35 (south); origin = step position, wall centre, floor. '
                       'Draw over wall_v (north of the step) and wall_v_low (south) tiles.'})

# The high top's furniture, in local y (origin at the front face, y = SPINE_Y1; the high block runs from
# SPINE_HI - SPINE_Y1 = -1.451 to 0): the three conduits (teal, grey, copper, like drawSpine), their clamps, the
# vent / access plates. Shared with deckdoor.py (its spine ends bring the conduits down into the top).
PIPES = [(-1.18, 'teal', 0.075), (-0.82, 'greyp', 0.11), (-0.48, 'copper', 0.075)]
CLAMP = (-1.36, -0.3)

def spine(variant):
    mn.reset(); M = mats(); objs = []
    A, B = -3.0, 5.0                                      # build wide, render [0, 2]
    d = SPINE_Y1                                          # local y: origin at the front-face line (game y 14)
    yl0, yh0 = SPINE_Y0 - d, SPINE_HI - d                 # -2.5, -1.451
    objs.append(gbox('lip', A, yl0, B, yh0 + 0.02, 0, H_LOW, M['cut'], 0.02))
    objs.append(gbox('body', A, yh0, B, 0, 0, H_FULL - 0.08, M['body'], 0.02))
    objs.append(gbox('cap', A, yh0 - 0.02, B, 0.02, H_FULL - 0.08, H_FULL, M['cap'], 0.02))
    objs += wall_x(M, A, B, 0.0, H_FULL, tray_on=False, body=False)
    # top: hull plates with seams, then the three conduits of drawSpine
    for u in range(int(A), int(B)):
        for (p0, p1) in ((yh0 + 0.08, -0.74), (-0.68, -0.08)):
            objs.append(gbox('tplate', u + 0.04, p0, u + 0.96, p1, H_FULL, H_FULL + 0.02, M['panel'], 0.01))
    for y, m, r in PIPES:
        objs.append(mn.cyl('pipe', r, B - A, loc=(A, -y, H_FULL + 0.02 + r), m=M[m], rot=RY90, bevel=0, verts=24))
    rnd = [0.55, 1.45] if variant == 'a' else [0.35, 1.2]
    for x in rnd:                                         # pipe clamps (drawSpine draws them every 1.3-3.5 units)
        for k in (-2, 0, 2):
            xx = x + k
            objs.append(gbox('clamp', xx - 0.05, CLAMP[0], xx + 0.05, CLAMP[1], H_FULL + 0.02, H_FULL + 0.27, M['rim'], 0.02))
            for y in (CLAMP[0] + 0.05, CLAMP[1] - 0.05): objs.append(rivet(xx, y, H_FULL + 0.27, M, r=0.02))
    if variant == 'a':
        for k in (-2, 0, 2):                              # a vent grille between the clamps, and duct tape on the teal pipe
            gx = 1.0 + k
            objs.append(gbox('vent', gx - 0.22, -0.36, gx + 0.22, -0.12, H_FULL + 0.02, H_FULL + 0.05, M['dark'], 0.01))
            for j in range(4): objs.append(gbox('slat', gx - 0.2, -0.34 + j * 0.06, gx + 0.2, -0.32 + j * 0.06, H_FULL + 0.05, H_FULL + 0.065, M['rim'], 0.004))
            objs.append(mn.cyl('tape', 0.083, 0.14, loc=(gx - 0.6, -PIPES[0][0], H_FULL + 0.02 + 0.075), m=M['tape'], rot=RY90, bevel=0.01, verts=24))
    else:
        for k in (-2, 0, 2):                              # a hazard-edged access plate (the DECK 2 stencil: spine_label)
            gx = 0.8 + k
            objs.append(gbox('acc', gx - 0.3, -1.43, gx + 0.3, -1.29, H_FULL + 0.02, H_FULL + 0.04, M['hazard'], 0.006))
            for sx in (-1, 1): objs.append(rivet(gx + sx * 0.25, -1.36, H_FULL + 0.04, M, r=0.02))
    mn.outline(objs, thickness=0.012)
    top = -yh0 * SIN + H_FULL * COS + 0.3                 # screen units above the origin
    return top

def render_spine(variant):
    top = spine(variant)
    # tile window: x [0, 2]; y from the floor at the origin up to the high top's back edge + conduits
    h = math.ceil((top + 0.06) * mn.PPU)
    render_exact(f'interior/spine_{variant}', 0, 2, -0.06, -0.06 + h / mn.PPU,
                 extra={'tile': [2, 0], 'height': H_FULL, 'depth': SPINE_Y1 - SPINE_Y0,
                        'note': 'spine (hull block between the decks); repeat every w px along x (2 units); origin = left end, '
                                'on the floor at y = SPINE_Y1 (14). Variants a/b mix freely.'})

def render_spine_label():
    # the DECK 2 stencil on the spine's top, near its front edge (it used to be baked into spine_b, where the
    # tiles clipped at the deck airlocks cut it): the game places it mid-segment. Origin = the label's
    # centre x, on the floor at y = SPINE_Y1 (like the spine tiles).
    mn.reset(); M = mats()
    objs = [label('stencil', 'DECK 2', 0.13, G(0.0, -0.24, H_FULL + 0.021), m=M['paint_w'])]
    mn.outline(objs, thickness=0.012)
    win('interior/spine_label', -0.45, 0.45, -0.38, -0.1, H_FULL + 0.04, origin=(0.0, 0.0), zmin=H_FULL,
        extra={'note': 'DECK 2 stencil for the spine top; origin = label centre x, on the floor at y = SPINE_Y1 (14)'})

JUNCTIONS = ['es', 'sw', 'ne', 'nw', 'esw', 'nes', 'nsw', 'new', 'nesw', 'ew', 'ns', 'e', 's', 'w', 'n']

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    for arms in JUNCTIONS:
        for H in (H_FULL, H_LOW):
            name = f"interior/wall_j_{'low_' if H < 1 else ''}{arms}"
            if only and only not in name: continue
            render_junction(arms, H)
    if not only or 'step' in only: render_step()
    for v in ('a', 'b'):
        if not only or f'spine_{v}' in only: render_spine(v)
    if not only or 'spine_label' in only: render_spine_label()
