"""Deck door: the passage through the spine between the decks with a single sliding door in it (DECK_DOORS in
js/ship.js, drawDeckDoorSprite in js/sprites.js; the classic view: drawDeckDoor in js/art.js; behaviour: updateDoors
in js/game.js). Replaced the deck airlocks (decklock.py: a chamber with a door at each end and a CYCLE button) on
2026-10-21; the spine got 1 unit thinner with it (SPINE_Y1 15 -> 14, see structure.py).

Each door: passage R(d.x, 11.5, d.x + 2.2, 14.0) (the whole spine, 2.5 deep). The door sits across the middle of
the spine's high block (y 13.25 game, local -0.75): two full-height panels sliding sideways (x) into the spine, like
the doors between rooms. South of it a short alcove (the bottom deck's side), north of it the passage through the
spine's low lip (the top deck's side). Lamps: one on the front post (bottom deck), one on the spine top by the
passage (seen from the top deck); beacons on the spine top's front corners.

Every sprite: origin = (d.x, SPINE_Y1 = 14), the passage's bottom-left corner on the floor; one shared canvas
(game y 11.5 .. 14.12, up to 2.05 high) from d.x - 0.6 to d.x + 2.8 (it brings the 0.6 spine ends on both sides:
the game draws the spine tiles up to d.x - 0.6 and from d.x + 2.8).

Base (passage floor, spine ends, frame, lamps, beacons, light strips):
  interior/deckdoor_closed          works, shut: lamps green, strips dim
  interior/deckdoor_open            works, open: lamps green, strips lit
  interior/deckdoor_locked          d.locked (security, the AI glitch): lamps red, strips red
  interior/deckdoor_blast_f0..3     pressure difference (vacuum on one side): lamps blink amber, beacons turn
  interior/deckdoor_broken_f0..1    broken: lamps dead, smashed beacon, sparks flicker
Door (rendered with the spine as a holdout; draw over the base):
  interior/deckdoor_door_f0..f5     d.open = 0, .2, .4, .6, .8, 1
  interior/deckdoor_door_locked     shut, red edge caps
  interior/deckdoor_door_blast      shut, hazard-striped blast plates on the panels
  interior/deckdoor_door_forced     a broken door forced open (jammed): a bent panel edge sticks out
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *
from structure import PIPES, SPINE_Y0, SPINE_Y1, SPINE_HI

W = 2.2
Y_TOP0 = SPINE_Y0 - SPINE_Y1                      # -2.5: the passage's north end (local y, origin at the spine front)
Y_HI = SPINE_HI - SPINE_Y1                        # -1.451: the high block's north edge
Y_DOOR, DOOR_T = -0.75, 0.24                      # the door's centre line and thickness
OPEN = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
FRAMES4 = [i / 4 for i in range(4)]

def spine_end(M, x0, x1, side):
    """A spine block from x0 to x1 (long, only the 0.6 next to the passage shows). side: -1 left, +1 right."""
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
    # top plates and the three spine conduits ending in elbows down into the top next to the passage
    xe = -0.22 if side < 0 else W + 0.22
    far = x0 if side < 0 else x1
    for (p0, p1) in ((Y_HI + 0.08, -0.74), (-0.68, -0.08)):
        o.append(gbox('tplate', min(far, xe), p0, max(far, xe), p1, H_FULL, H_FULL + 0.02, M['panel'], 0.01))
    for y, m, r in PIPES:
        z = H_FULL + 0.02 + r
        o.append(pipe('conduit', [G(far, y, z), G(xe, y, z), G(xe, y, H_FULL - 0.05)], r, m=M[m], corner=0.16))
        o.append(mn.cyl('flange', r + 0.04, 0.04, loc=G(xe, y, H_FULL + 0.015), m=M['rim'], bevel=0.01))
    # the low lip's end at the passage (the top deck's side): a hazard-painted kerb
    lin = 0.0 if side < 0 else W
    o.append(gbox('lip_edge', lin - 0.06 if side < 0 else lin, Y_TOP0 - 0.01, lin if side < 0 else lin + 0.06, Y_HI, 0.0, H_LOW + 0.01, M['hazard'], 0.008))
    # pilaster on the front face: the door frame's post (covers the tile seam at the far edge)
    px0, px1 = (-0.6, 0.0) if side < 0 else (W, W + 0.6)
    o.append(gbox('post', px0, -0.02, px1, 0.07, 0.0, H_FULL - 0.06, M['panel2'], 0.02))
    o.append(gbox('post_hz', px0 + 0.06, 0.06, px1 - 0.06, 0.08, 0.14, 0.42, M['hazard'], 0.005))
    inner = px1 if side < 0 else px0                  # the edge at the passage
    o.append(gbox('post_edge', inner - 0.07, -0.02, inner + 0.07, 0.11, 0.0, H_FULL - 0.04, M['hazard'], 0.012))
    o.append(gbox('guard', (px0 if side < 0 else px1) - 0.03, -0.02, (px0 if side < 0 else px1) + 0.03, 0.1, 0.0, H_FULL - 0.1, M['steel'], 0.015))
    for z in (0.6, 1.4):
        for xx in (px0 + 0.1, px1 - 0.1): o.append(rivet(xx, 0.08, z, M, 'front', 0.02))
    # hazard rim along the passage edge on the spine top
    o.append(gbox('rim_hz', inner - 0.1 if side < 0 else inner, Y_HI + 0.02, inner if side < 0 else inner + 0.1, 0.0, H_FULL, H_FULL + 0.015, M['hazard'], 0.004))
    return o, hold

def base(M, state, t=0.0):
    o = []; hold = []
    for side, (x0, x1) in ((-1, (-3.6, 0.0)), (1, (W, W + 3.6))):
        so, sh = spine_end(M, x0, x1, side); o += so; hold += sh
    # the passage floor: tread plate all through, the door's track across the middle, dashed hazard edges at both mouths
    o.append(gbox('floor', 0.0, Y_TOP0, W, 0.0, 0.0, 0.03, M['body'], 0.008))
    for i in range(15):                                # tread ribs
        y = Y_TOP0 + 0.12 + i * 0.165
        if abs(y - Y_DOOR) < 0.2: continue
        o.append(gbox('rib', 0.12, y - 0.02, W - 0.12, y + 0.02, 0.03, 0.045, M['rim'], 0.006))
    o.append(gbox('track', 0.02, Y_DOOR - DOOR_T / 2 - 0.04, W - 0.02, Y_DOOR + DOOR_T / 2 + 0.04, 0.03, 0.036, M['hole'], 0.0))
    for (ya, yb) in ((Y_TOP0 + 0.05, Y_TOP0 + 0.11), (-0.11, -0.05)):
        n = 7
        for i in range(n):
            a = 0.08 + (W - 0.16) * i / n; b = a + (W - 0.16) / n * 0.6
            o.append(gbox('dash', a, ya, b, yb, 0.03, 0.05, M['yellow'], 0.006))
    # the door's frame in the spine: a lintel over the passage at the door line (the panels slide in under it)
    lint = gbox('lintel', -0.05, Y_DOOR - DOOR_T / 2 - 0.1, W + 0.05, Y_DOOR + DOOR_T / 2 + 0.1, 1.5, H_FULL, M['panel2'], 0.015)
    o.append(lint); hold.append(lint)
    o.append(gbox('lintel_hz', 0.1, Y_DOOR + DOOR_T / 2 + 0.08, W - 0.1, Y_DOOR + DOOR_T / 2 + 0.105, 1.52, 1.58, M['hazard'], 0.004))
    for xx in (0.15, W - 0.15): o.append(rivet(xx, Y_DOOR, H_FULL, M, r=0.022))
    # light strips along both sides of the passage floor
    if state == 'blast': s_col, s_k = '#ffb347', 0.5 + 0.6 * (0.5 + 0.5 * math.sin(t * 2 * math.pi))
    elif state == 'locked': s_col, s_k = '#ff4a3a', 0.9
    elif state == 'broken': s_col, s_k = None, 0
    elif state == 'open': s_col, s_k = '#7cc8ff', 0.8
    else: s_col, s_k = '#7cc8ff', 0.25
    for xx in (0.07, W - 0.07):
        o.append(gbox('strip_h', xx - 0.05, Y_TOP0 + 0.2, xx + 0.05, -0.2, 0.02, 0.05, M['dark'], 0.01))
        sm = glow(f'strip_{state}', s_col, s_k) if s_col else pmat('strip_dead', '#2a3440', 0.3)
        o.append(gbox('strip', xx - 0.03, Y_TOP0 + 0.23, xx + 0.03, -0.23, 0.05, 0.06, sm, 0.008))
    # status lamps (lamp() in js/art.js): top one on the spine top by the passage, bottom one on the front post
    blink = math.sin(t * 2 * math.pi * 2) > 0
    lamp = {'closed': 'open', 'open': 'open', 'locked': 'closed', 'blast': 'busy' if blink else 'busy_off', 'broken': 'off'}[state]
    o.append(gbox('lamp_box_t', -0.3, Y_HI + 0.08, -0.1, Y_HI + 0.28, H_FULL, H_FULL + 0.06, M['dark'], 0.015))
    o.append(mn.sphere('lamp_t', 0.06, loc=G(-0.2, Y_HI + 0.18, H_FULL + 0.06), m=lamp_mat(lamp), scale=(1, 1, 0.7), segs=16))
    o.append(gbox('lamp_box_b', -0.3, 0.07, -0.1, 0.12, 1.12, 1.36, M['dark'], 0.015))
    o.append(mn.sphere('lamp_b', 0.06, loc=G(-0.2, 0.13, 1.24), m=lamp_mat(lamp), scale=(1, 0.6, 1), segs=16))
    # beacons on the spine top's front corners: turning with a pressure difference
    turning = state == 'blast'
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
    # wear: duct tape on the left post
    o.append(tape_front(-0.3, 0.07, 0.95, 0.3, 12, M))
    if state == 'broken':
        sc = mn.cyl('scorch', 0.4, 0.004, loc=G(0.8, -0.35, 0.05), m=pmat('scorch2', '#15130f', 0.95, grime=0.9, grime_scale=9), bevel=0, verts=24)
        sc.scale = (1.0, 0.5, 1.0); o.append(sc)
        o.append(pipe('wire', [G(W + 0.08, 0.1, 1.3), G(W + 0.2, 0.2, 0.9), G(W + 0.12, 0.25, 0.6)], 0.014, m=M['cables'][0], corner=0.1))
        if t < 0.5:
            for (sx, sy, sz) in ((W + 0.12, 0.27, 0.62), (W + 0.18, 0.33, 0.7), (W + 0.06, 0.3, 0.55), (W + 0.22, 0.24, 0.58)):
                o.append(mn.sphere('spark', 0.025, loc=G(sx, sy, sz), m=glow('spark', '#ffc860', 1.5), segs=8))
    return o, hold

def door(M, k, state='ok'):
    """Two full-height panels sliding into the spine from the middle of the passage."""
    o = []
    yc, th, h = Y_DOOR, DOOR_T, 1.48
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
        cx = lead + dirn * 0.62
        if state == 'blast':                        # blast plates over the face: hazard stripes, no window
            objs.append(gbox('blastplate', min(lead + dirn * 0.34, lead + dirn * 1.08), fy - 0.005, max(lead + dirn * 0.34, lead + dirn * 1.08), fy + 0.03, 0.1, h - 0.08, M['hazard_big'], 0.012))
            for z in (0.3, 0.75, 1.2):
                for dx in (0.42, 1.0): objs.append(rivet(lead + dirn * dx, fy + 0.03, z, M, 'front', 0.024))
        else:                                       # panel face: frame, porthole, rivets, a big stencil number
            objs.append(gbox('face', min(lead + dirn * 0.38, lead + dirn * 1.06), fy - 0.005, max(lead + dirn * 0.38, lead + dirn * 1.06), fy + 0.015, 0.12, h - 0.1, M['panel2'], 0.012))
            objs.append(mn.cyl('port_glass', 0.13, 0.02, loc=G(cx, fy - 0.005, 1.0), m=glow('port_glass', '#5fa8c9', 0.6), rot=R90, bevel=0, verts=24))
            objs.append(ring('port_rim', 0.17, 0.06, 0.04, loc=G(cx, fy, 1.0), m=M['steel'], rot=R90))
            for z in (0.25, 0.6):
                for dx in (0.45, 0.8):
                    objs.append(rivet(lead + dirn * dx, fy + 0.015, z, M, 'front', 0.02))
            objs.append(label('num', '2' if s == 0 else '1', 0.22, (cx, -(fy + 0.017), 0.42), rot=(math.radians(90), 0, 0), m=M['paint_w']))
        if s == 1 and state not in ('forced', 'blast'): objs.append(tape_front(cx + 0.05, fy + 0.017, 1.3, 0.34, -18, M))
        if state == 'forced' and s == 0:             # crumpled leading edge, scraped paint
            for ob in objs:
                ob.rotation_euler.z += math.radians(7)
            objs.append(gbox('scrape', min(lead, lead + dirn * 0.5), fy + 0.012, max(lead, lead + dirn * 0.5), fy + 0.02, 0.3, 0.6, M['scorch'], 0.0))
        o += objs
    return o

def window(name, extra=None):
    win(name, -0.6, W + 0.6, Y_TOP0, 0.12, H_FULL + 0.45, origin=(0.0, 0.0), zmin=0.0,
        extra=dict(extra or {}, note='deck door (DECK_DOORS); origin = (d.x, SPINE_Y1) on the floor; covers d.x-0.6 .. d.x+2.8'))

def render_base(name, state, t=0.0):
    mn.reset(); M = mats()
    o, hold = base(M, state, t)
    mn.outline(o, thickness=0.012)
    window(name)

def render_door(name, k, state='ok'):
    mn.reset(); M = mats()
    o, hold = base(M, 'closed')
    keep = set(hold)
    for x in o:
        if x not in keep: bpy.data.objects.remove(x)
    p = door(M, k, state)
    mn.outline(p, thickness=0.012)
    holdout(hold)
    window(name, {'open': k})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    def want(n): return not only or only in n
    for st in ('closed', 'open', 'locked'):
        if want(f'interior/deckdoor_{st}'): render_base(f'interior/deckdoor_{st}', st)
    for i, t in enumerate(FRAMES4):
        if want(f'interior/deckdoor_blast_f{i}'): render_base(f'interior/deckdoor_blast_f{i}', 'blast', t)
    for i, t in enumerate((0.0, 0.75)):
        if want(f'interior/deckdoor_broken_f{i}'): render_base(f'interior/deckdoor_broken_f{i}', 'broken', t)
    for i, k in enumerate(OPEN):
        if want(f'interior/deckdoor_door_f{i}'): render_door(f'interior/deckdoor_door_f{i}', k)
    for st in ('locked', 'blast'):
        if want(f'interior/deckdoor_door_{st}'): render_door(f'interior/deckdoor_door_{st}', 0.0, st)
    if want('interior/deckdoor_door_forced'): render_door('interior/deckdoor_door_forced', 1.0, 'forced')
