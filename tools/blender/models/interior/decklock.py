"""Deck airlock: the shaft through the spine between the decks (DECK_LOCKS in js/ship.js,
drawDeckLock in js/art.js, updateDeckLock in js/game.js).

Each lock: chamber R(L.x, 12.0, L.x + 2.2, 14.5), top door slot y 11.5..12.0, bottom door slot
14.5..15.0; the doors slide sideways (x) into the spine. The shaft is a gap in the spine block, so
the chamber floor is seen between the two spine ends. The top door sits in the (cut-down) near wall
of the top deck, so its panels are cut down too (0.32 high: a closed top door hides no more of the
top room than the spine does); the bottom door is a full-height door in the bottom rooms' back wall.

Every sprite: origin = (L.x, SPINE_Y1 = 15), the shaft's bottom-left corner on the floor; one shared
canvas from L.x - 0.6 to L.x + 2.8 (it brings the 0.6 spine ends on both sides: draw the spine tiles
up to L.x - 0.6 and from L.x + 2.8).

Base (chamber, frames, spine ends, lamps, beacons, light strips):
  interior/decklock_top          idle, top door open: top lamp green, bottom red
  interior/decklock_bottom       idle, bottom door open
  interior/decklock_busy_f0..7   closing / opening (L.phase): lamps blink amber, beacons turn
  interior/decklock_cycle_f0..7  cycling (pressure): same + the chamber light strips pulse blue
  interior/decklock_locked       L.locked: both lamps red, strips red
  interior/decklock_broken_f0..1 broken(L): lamps dead, smashed beacon, sparks flicker
Doors (rendered with the spine as a holdout; draw over the base):
  interior/decklock_topdoor_f0..f5      L.doors.top = 0, .2, .4, .6, .8, 1
  interior/decklock_botdoor_f0..f5      L.doors.bottom
  interior/decklock_topdoor_locked, decklock_botdoor_locked   closed, red edge caps
  interior/decklock_topdoor_forced, decklock_botdoor_forced   forced open (forceDeckLock): jammed,
                                                              a bent panel edge sticks out
The cycle progress ring stays procedural (UI).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

W = 2.2
Y_TOP0, Y_CH0, Y_CH1 = -3.5, -3.0, -0.5           # local y (origin at the spine front line, y = 15)
Y_HI = 12.549 - 15.0                              # -2.451: spine high block north edge (see structure.py)
OPEN = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
FRAMES8 = [i / 8 for i in range(8)]

def spine_end(M, x0, x1, side):
    """A spine block from x0 to x1 (long, only the 0.6 next to the shaft shows). side: -1 left, +1 right."""
    o = []; hold = []
    lip = gbox('lip', x0, Y_TOP0, x1, Y_HI + 0.02, 0, H_LOW, M['cut'], 0.02)
    body = gbox('body', x0, Y_HI, x1, 0.0, 0, H_FULL - 0.08, M['body'], 0.02)
    cap = gbox('cap', x0, Y_HI - 0.02, x1, 0.02, H_FULL - 0.08, H_FULL, M['cap'], 0.02)
    o += [lip, body, cap]; hold += [lip, body, cap]
    if side < 0: o += wall_x(M, x0, -0.6, 0.0, H_FULL, tray_on=False, body=False)
    else: o += wall_x(M, W + 0.6, x1, 0.0, H_FULL, tray_on=False, body=False)
    fx = -0.6 if side < 0 else W + 0.6                # the front pipes go into the post: flanges
    for (pz, py, pr) in ((0.84, 0.08, 0.055), (0.94, 0.06, 0.035)):
        o.append(mn.cyl('pflange', pr + 0.035, 0.05, loc=(fx - 0.025, -py, pz), m=M['rim'], rot=RY90, bevel=0.01, verts=20))
    # top plates and the three spine conduits ending in elbows down into the top next to the shaft
    xe = -0.22 if side < 0 else W + 0.22
    far = x0 if side < 0 else x1
    for (p0, p1) in ((Y_HI + 0.1, -1.25), (-1.15, -0.1)):
        o.append(gbox('tplate', min(far, xe), p0, max(far, xe), p1, H_FULL, H_FULL + 0.02, M['panel'], 0.01))
    for y, m, r in ((-2.05, M['teal'], 0.075), (-1.4125, M['greyp'], 0.11), (-0.8875, M['copper'], 0.075)):
        z = H_FULL + 0.02 + r
        o.append(pipe('conduit', [G(far, y, z), G(xe, y, z), G(xe, y, H_FULL - 0.05)], r, m=m, corner=0.18))
        o.append(mn.cyl('flange', r + 0.04, 0.04, loc=G(xe, y, H_FULL + 0.015), m=M['rim'], bevel=0.01))
    # pilaster on the front face: the bottom door's frame post (covers the tile seam at the far edge)
    px0, px1 = (-0.6, 0.0) if side < 0 else (W, W + 0.6)
    post = gbox('post', px0, -0.02, px1, 0.07, 0.0, H_FULL - 0.06, M['panel2'], 0.02)
    o.append(post)
    o.append(gbox('post_hz', px0 + 0.06, 0.06, px1 - 0.06, 0.08, 0.14, 0.42, M['hazard'], 0.005))
    inner = px1 if side < 0 else px0                  # the edge at the shaft
    o.append(gbox('post_edge', inner - 0.07, -0.02, inner + 0.07, 0.11, 0.0, H_FULL - 0.04, M['hazard'], 0.012))
    o.append(gbox('guard', (px0 if side < 0 else px1) - 0.03, -0.02, (px0 if side < 0 else px1) + 0.03, 0.1, 0.0, H_FULL - 0.1, M['steel'], 0.015))
    for z in (0.6, 1.4):
        for xx in (px0 + 0.1, px1 - 0.1): o.append(rivet(xx, 0.08, z, M, 'front', 0.02))
    # hazard rim along the shaft edge on the spine top
    o.append(gbox('rim_hz', inner - 0.1 if side < 0 else inner, Y_HI + 0.02, inner if side < 0 else inner + 0.1, 0.0, H_FULL, H_FULL + 0.015, M['hazard'], 0.004))
    return o, hold

def base(M, state, t=0.0):
    o = []; hold = []
    for side, (x0, x1) in ((-1, (-3.6, 0.0)), (1, (W, W + 3.6))):
        so, sh = spine_end(M, x0, x1, side); o += so; hold += sh
    # floors: door slots (tread with a track), chamber (grating, dashed hazard border, light strips)
    for (ya, yb) in ((Y_TOP0, Y_CH0), (Y_CH1, 0.0)):
        o.append(gbox('slot', 0.0, ya, W, yb, 0.0, 0.03, M['body'], 0.008))
        o.append(gbox('track', 0.03, (ya + yb) / 2 - 0.05, W - 0.03, (ya + yb) / 2 + 0.05, 0.03, 0.036, M['hole'], 0.0))
    o.append(gbox('chamber', 0.0, Y_CH0, W, Y_CH1, 0.0, 0.025, M['dark'], 0.008))
    for i in range(14):                                # floor grating bars
        y = Y_CH0 + 0.15 + i * 0.158
        o.append(gbox('grate', 0.22, y - 0.025, W - 0.22, y + 0.025, 0.025, 0.045, M['rim'], 0.008))
    for xx in (0.25, W / 2, W - 0.25):
        o.append(gbox('grate_x', xx - 0.03, Y_CH0 + 0.1, xx + 0.03, Y_CH1 - 0.1, 0.025, 0.05, M['steel'], 0.01))
    # dashed hazard border (like the game's dashed outline)
    k = 0
    for (xa, ya, xb, yb) in ((0.08, Y_CH0 + 0.05, W - 0.08, Y_CH0 + 0.11), (0.08, Y_CH1 - 0.11, W - 0.08, Y_CH1 - 0.05)):
        n = 7
        for i in range(n):
            a = xa + (xb - xa) * i / n; b = a + (xb - xa) / n * 0.6
            o.append(gbox('dash', a, ya, b, yb, 0.025, 0.05, M['yellow'], 0.006))
    # centre plate (where the game draws its progress ring)
    o.append(mn.cyl('cplate', 0.36, 0.04, loc=G(W / 2, (Y_CH0 + Y_CH1) / 2, 0.025), m=M['body'], bevel=0.012, verts=40))
    o.append(ring('cring', 0.3, 0.06, 0.03, loc=G(W / 2, (Y_CH0 + Y_CH1) / 2, 0.065), m=M['yellow']))
    o.append(label('cyc', 'CYCLE', 0.09, G(W / 2, (Y_CH0 + Y_CH1) / 2, 0.066), m=M['paint_w']))
    # light strips along both sides of the chamber
    if state == 'cycle': s_col, s_k = '#7cc8ff', 0.5 + 0.9 * (0.5 + 0.5 * math.sin(t * 2 * math.pi * 2))
    elif state == 'locked': s_col, s_k = '#ff4a3a', 0.9
    elif state == 'broken': s_col, s_k = None, 0
    else: s_col, s_k = '#7cc8ff', 0.25
    for xx in (0.1, W - 0.1):
        o.append(gbox('strip_h', xx - 0.06, Y_CH0 + 0.15, xx + 0.06, Y_CH1 - 0.15, 0.02, 0.05, M['dark'], 0.01))
        sm = glow(f'strip_{state}', s_col, s_k) if s_col else pmat('strip_dead', '#2a3440', 0.3)
        o.append(gbox('strip', xx - 0.035, Y_CH0 + 0.18, xx + 0.035, Y_CH1 - 0.18, 0.05, 0.06, sm, 0.008))
    # status lamps (lamp() in js/art.js): top one on the spine top by the shaft, bottom one on the post
    busy_on = math.sin(t * 2 * math.pi * 4) > 0
    lamps = {'top': ('open', 'closed'), 'bottom': ('closed', 'open'), 'busy': ('busy' if busy_on else 'busy_off',) * 2,
             'cycle': ('busy' if busy_on else 'busy_off',) * 2, 'locked': ('closed', 'closed'), 'broken': ('off', 'off')}[state]
    o.append(gbox('lamp_box_t', -0.3, Y_HI + 0.08, -0.1, Y_HI + 0.28, H_FULL, H_FULL + 0.06, M['dark'], 0.015))
    o.append(mn.sphere('lamp_t', 0.06, loc=G(-0.2, Y_HI + 0.18, H_FULL + 0.06), m=lamp_mat(lamps[0]), scale=(1, 1, 0.7), segs=16))
    o.append(gbox('lamp_box_b', -0.3, 0.07, -0.1, 0.12, 1.12, 1.36, M['dark'], 0.015))
    o.append(mn.sphere('lamp_b', 0.06, loc=G(-0.2, 0.13, 1.24), m=lamp_mat(lamps[1]), scale=(1, 0.6, 1), segs=16))
    # beacons on the spine top's front corners: turning when busy / cycling
    turning = state in ('busy', 'cycle')
    for i, bx in enumerate((-0.32, W + 0.32)):
        by = -0.32
        o.append(mn.cyl('bc_base', 0.11, 0.06, loc=G(bx, by, H_FULL), m=M['dark'], bevel=0.015))
        if state == 'broken' and i == 1:              # smashed: dome gone, a bulb stump
            o.append(mn.cyl('bc_stump', 0.04, 0.08, loc=G(bx, by, H_FULL + 0.06), m=M['steel'], bevel=0.01))
            continue
        dome = pmat('bc_dome', '#d08a2a', 0.2, 0.0, emit='#ffaa30', emit_strength=0.6 if turning else 0.0)
        if state == 'locked': dome = pmat('bc_dome_r', '#a83a30', 0.25, 0.0)
        o.append(mn.sphere('bc_dome', 0.095, loc=G(bx, by, H_FULL + 0.07), m=dome, scale=(1, 1, 1.0), segs=20))
        if turning:
            a = t * 2 * math.pi + i * math.pi
            o.append(mn.box('bc_beam', (0.07, 0.15, 0.06), loc=(bx + 0.06 * math.cos(a), -by + 0.06 * math.sin(a), H_FULL + 0.05), m=glow('bc_beam', '#ffc860', 1.5), bevel=0.012, rot=(0, 0, a + math.pi / 2)))
        o.append(mn.cyl('bc_cage', 0.1, 0.02, loc=G(bx, by, H_FULL + 0.12), m=M['steel'], bevel=0.005))
    # wear: duct tape on a conduit flange, a sticker on the left post
    o.append(tape_front(-0.3, 0.07, 0.95, 0.3, 12, M))
    if state == 'broken':
        sc = mn.cyl('scorch', 0.4, 0.004, loc=G(0.75, Y_CH0 + 0.75, 0.05), m=pmat('scorch2', '#15130f', 0.95, grime=0.9, grime_scale=9), bevel=0, verts=24)
        sc.scale = (1.0, 0.7, 1.0); o.append(sc)
        o.append(pipe('wire', [G(W + 0.08, 0.1, 1.3), G(W + 0.2, 0.2, 0.9), G(W + 0.12, 0.25, 0.6)], 0.014, m=M['cables'][0], corner=0.1))
        if t < 0.5:
            for (sx, sy, sz) in ((W + 0.12, 0.27, 0.62), (W + 0.18, 0.33, 0.7), (W + 0.06, 0.3, 0.55), (W + 0.22, 0.24, 0.58)):
                o.append(mn.sphere('spark', 0.025, loc=G(sx, sy, sz), m=glow('spark', '#ffc860', 1.5), segs=8))
    return o, hold

def door(M, which, k, state='ok'):
    """Two panels sliding into the spine. which: 'top' (cut-down) or 'bot' (full height)."""
    o = []
    if which == 'top': yc, th, h = (Y_TOP0 + Y_CH0) / 2, 0.24, 0.32
    else: yc, th, h = (Y_CH1 + 0.0) / 2, 0.26, 1.5
    half = W / 2; ext = half * (1 - k); plen = half + 1.3
    cap_m = M['red'] if state == 'locked' else M['yellow']
    if state == 'forced': ext = 0.2
    for s in (0, 1):
        if ext < 0.004: break
        if s == 0: xa, xb = ext - plen, ext; lead, dirn = xb, -1
        else: xa, xb = W - ext, W - ext + plen; lead, dirn = xa, 1
        mat = M['door'] if s == 0 else M['door2']
        objs = [gbox('panel', xa, yc - th / 2, xb, yc + th / 2, 0.02, h, mat, 0.03)]
        fy = yc + th / 2                            # the south face (towards the camera)
        objs.append(gbox('cap', min(lead, lead + dirn * 0.12), yc - th / 2 - 0.005, max(lead, lead + dirn * 0.12), fy + 0.012, 0.02, h + 0.012, cap_m, 0.012))
        objs.append(gbox('lead_hz', min(lead + dirn * 0.12, lead + dirn * 0.32), fy - 0.005, max(lead + dirn * 0.12, lead + dirn * 0.32), fy + 0.012, 0.06, h - 0.05, M['hazard'], 0.005))
        if which == 'bot':
            # panel face: frame, porthole into the chamber, rivets, a big stencil number
            cx = lead + dirn * 0.62
            objs.append(gbox('face', min(lead + dirn * 0.38, lead + dirn * 1.06), fy - 0.005, max(lead + dirn * 0.38, lead + dirn * 1.06), fy + 0.015, 0.12, h - 0.1, M['panel2'], 0.012))
            objs.append(mn.cyl('port_glass', 0.13, 0.02, loc=G(cx, fy - 0.005, 1.0), m=glow('port_glass', '#5fa8c9', 0.6), rot=R90, bevel=0, verts=24))
            objs.append(ring('port_rim', 0.17, 0.06, 0.04, loc=G(cx, fy, 1.0), m=M['steel'], rot=R90))
            for z in (0.25, 0.6):
                for dx in (0.45, 0.8):
                    objs.append(rivet(lead + dirn * dx, fy + 0.015, z, M, 'front', 0.02))
            objs.append(label('num', '2' if s == 0 else '1', 0.22, (cx, -(fy + 0.017), 0.45), rot=(math.radians(90), 0, 0), m=M['paint_w']))
            if s == 1 and state != 'forced': objs.append(tape_front(cx + 0.05, fy + 0.017, 1.3, 0.34, -18, M))
        else:
            for dx in (0.4, 0.75):
                objs.append(rivet(lead + dirn * dx, yc, h, M, r=0.02))
        if state == 'forced' and s == 0:             # crumpled leading edge, scraped paint
            for ob in objs:
                ob.rotation_euler.z += math.radians(7)
            objs.append(gbox('scrape', min(lead, lead + dirn * 0.5), fy + 0.012, max(lead, lead + dirn * 0.5), fy + 0.02, 0.3, 0.45 if which == 'bot' else 0.25, M['scorch'], 0.0))
        o += objs
    return o

def window(name, extra=None):
    win(name, -0.6, W + 0.6, Y_HI, 0.12, H_FULL + 0.45, origin=(0.0, 0.0), zmin=0.0,
        extra=dict(extra or {}, note='deck airlock (DECK_LOCKS); origin = (L.x, SPINE_Y1) on the floor; covers L.x-0.6 .. L.x+2.8'))

def render_base(name, state, t=0.0):
    mn.reset(); M = mats()
    o, hold = base(M, state, t)
    mn.outline(o, thickness=0.012)
    window(name)

def render_door(name, which, k, state='ok'):
    mn.reset(); M = mats()
    o, hold = base(M, 'top')
    keep = set(hold)
    for x in o:
        if x not in keep: bpy.data.objects.remove(x)
    p = door(M, which, k, state)
    mn.outline(p, thickness=0.012)
    holdout(hold)
    window(name, {'open': k})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    def want(n): return not only or only in n
    for st in ('top', 'bottom', 'locked'):
        if want(f'interior/decklock_{st}'): render_base(f'interior/decklock_{st}', st)
    for st in ('busy', 'cycle'):
        for i, t in enumerate(FRAMES8):
            if want(f'interior/decklock_{st}_f{i}'): render_base(f'interior/decklock_{st}_f{i}', st, t)
    for i, t in enumerate((0.0, 0.75)):
        if want(f'interior/decklock_broken_f{i}'): render_base(f'interior/decklock_broken_f{i}', 'broken', t)
    for which in ('top', 'bot'):
        for i, k in enumerate(OPEN):
            if want(f'interior/decklock_{which}door_f{i}'): render_door(f'interior/decklock_{which}door_f{i}', which, k)
        if want(f'interior/decklock_{which}door_locked'): render_door(f'interior/decklock_{which}door_locked', which, 0.0, 'locked')
        if want(f'interior/decklock_{which}door_forced'): render_door(f'interior/decklock_{which}door_forced', which, 1.0, 'forced')
