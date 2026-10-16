"""CONCEPT MOCK-UP (not a game sprite): the Red Comet base's server room as the "Security Desk".

Pitch: someone sits in Captain Red Comet's own chair and fights him for the base's network (doors, sentry,
lights, the base's flak turret, the docking clamps) while the others push to the brig.

    blender -b --factory-startup --python tools/blender/models/concepts/base.py -- <out_dir> [samples]

Writes <out_dir>/keyart_raw.png only (no manifest entry, nothing in build/renders). Uses the dock kit
(docklib.py); the room is the base's server room at its game coordinates (js/dock.js baseGeom, port side,
relative to our hatch): R(-21.4, -4, -13, 4), barracks door in the back wall at u -18 .. -16.4, bay door
in the east wall at v -0.8 .. 0.8, terminal at (-20.4, -3.2).
DOCK_CPU=1 renders on the CPU when the shared GPU is busy.
"""
import sys, os, math, random
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dock'))
import docklib as D
from docklib import *

A = D.args()
OUT = A[0] if A else '/tmp/mn_concept_base'
mn.SAMPLES = int(A[1]) if len(A) > 1 else 24
mn.PPU = 124

ROOM = (-21.4, -4.0, -13.0, 4.0)
HULL = (-22.1, -4.7, -12.3, 4.7)
DOOR_N = (-18.0, -4.7, -16.4, -4.0)       # to the barracks (hacked open)
DOOR_E = (-13.0, -0.8, -12.3, 0.8)        # to the docking bay

def mats():
    M = dict(
        sub=pmat('sub', '#16181d', 0.8), hole=pmat('hole', '#0c0d10', 0.9), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5), tape=pmat('tape', '#b9bcc2', 0.85),
        hazard=stripes_mat('hazard'), cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2), lamp=emit_mat('lamp', '#ffb46a', 1.2, base='#ffd0a0'),
        red_led=emit_mat('red_led', '#ff3a2a', 1.6, base='#6a1a14'), blue_led=emit_mat('blue_led', '#4ab8ff', 1.6, base='#1a4a6a'),
        green_led=emit_mat('green_led', '#5aff9a', 1.4, base='#2a7a4a'), amber_led=emit_mat('amber_led', '#ffb43a', 1.4, base='#7a5a1a'),
        feed=emit_mat('feed', '#5a8aa8', 0.55, base='#1a2a36'), feed_red=emit_mat('feed_red', '#ff4a3a', 0.7, base='#3a0a08'),
        netscr=emit_mat('netscr', '#0e2a3e', 0.6, base='#08141e'), screen_dead=mn.mat('screen_dead', '#10161c', 0.06, 0.0, clearcoat=1.0),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.4, 0.5, wear=0.8, grime=0.6),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), leather=worn('leather', '#8a2a24', 0.45, 0.0, wear=0.9, grime=0.8),
        suit=worn('suit', '#c4683a', 0.6, 0.0, wear=0.3, grime=0.5), suit2=worn('suit2', '#3a6ac4', 0.6, 0.0, wear=0.3, grime=0.5),
        visor=mn.mat('visor', '#d2a62e', 0.15, 0.6, clearcoat=1.0), rubber=pmat('rubber', '#262a33', 0.7),
        cat=pmat('cat', '#1e1c22', 0.7), cat_eye=emit_mat('cat_eye', '#c8ff5a', 1.2), pink=pmat('pink', '#d88a9a', 0.6),
        paper=pmat('paper', '#e6e2d6', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6), mug=worn('mug', '#d8d8d0', 0.4, 0.0, wear=0.4),
        coffee=pmat('coffee', '#3a2214', 0.1), oil=decal_mat('oil', '#0a0908', 0.85, rough=0.15),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15), panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2),
        panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3),
        gun=worn('gun', '#3a3e46', 0.4, 0.6, wear=0.5), pirate=worn('pirate', '#8a4a44', 0.6, 0.0, wear=0.4),
        skin=pmat('skin', '#e6c19b', 0.6), hair=pmat('hair', '#3a2a21', 0.8), suit3=worn('suit3', '#5aa86a', 0.6, 0.0, wear=0.3, grime=0.5),
    )
    M['pipe1'] = worn('pipe1', '#3b7a8a', 0.4, 0.3, rust=0.08); M['pipe2'] = M['copper']
    M['plates'] = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12) for i, c in enumerate(['#6a5a5e', '#665658', '#6e5c5c', '#625458'])]
    M['tread'] = worn('tread', '#7f8794', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08)
    D.M_DARK[0] = M['black']
    return M

def crew(u, v, M, out, suit, seated=False, face=0.0):
    """A chunky stand-in crew member (mock-up only; the game has the real crew sprite)."""
    z = 0.42 if seated else 0.0
    if not seated:
        for su in (-1, 1): out.append(cbox('leg', u + su * 0.11, v, 0.16, 0.2, 0.0, 0.42, M['rubber'], bevel=0.05))
    out.append(cbox('torso', u, v, 0.5, 0.36, z + 0.38, 0.5, suit, bevel=0.12))
    out.append(cbox('pack', u, v + 0.2, 0.36, 0.14, z + 0.45, 0.4, M['body'], bevel=0.05))
    out.append(mn.sphere('helmet', 0.24, loc=P(u, v, z + 1.08), m=M['white'], segs=24))
    out.append(mn.sphere('visor', 0.19, loc=P(u + 0.06 * math.cos(face), v - 0.09, z + 1.1), m=M['visor'], scale=(1, 0.8, 0.8), segs=20))

def cat(u, v, z, M, out):
    """Admiral Whiskers, the base's cat (black, an eye patch), strolling across the keyboard."""
    out.append(mn.sphere('cat_body', 0.2, loc=P(u, v, z + 0.14), m=M['cat'], scale=(1.5, 0.75, 0.75), segs=20))
    out.append(mn.sphere('cat_head', 0.12, loc=P(u - 0.32, v + 0.02, z + 0.25), m=M['cat'], segs=18))
    for sv in (-1, 1):
        e = cbox('cat_ear', u - 0.34, v + sv * 0.07, 0.06, 0.05, z + 0.32, 0.1, M['cat'], bevel=0.02); out.append(e)
        for su in (-0.18, 0.18): out.append(cbox('cat_leg', u + su, v + sv * 0.08, 0.06, 0.06, z, 0.12, M['cat'], bevel=0.02))
    out.append(mn.sphere('cat_eye', 0.025, loc=P(u - 0.38, v + 0.1, z + 0.27), m=M['cat_eye'], segs=10))
    out.append(cbox('patch', u - 0.33, v + 0.11, 0.07, 0.02, z + 0.24, 0.06, M['black'], bevel=0.01))
    out.append(pipe_uv('cat_tail', [(u + 0.28, v, z + 0.2), (u + 0.45, v + 0.05, z + 0.3), (u + 0.5, v + 0.02, z + 0.55), (u + 0.42, v - 0.02, z + 0.62)], 0.03, M['cat'], corner=0.12))

def build():
    mn.reset(); set_side('port')
    rng = random.Random(5); M = mats(); out = []
    u0, v0, u1, v1 = HULL
    # hull: belly, low deck, tall back/side walls north of the split
    out.append(prism('belly', rrect_pts(u0 + 0.12, v0 + 0.1, u1 - 0.12, v1 - 0.04, HULL_RAD), -0.55, 0.02, M['hull2'], bevel=0.06))
    out.append(mass('low_deck', rrect_pts(u0, v0, u1, v1, HULL_RAD), 0.0, H_LOW, [ROOM, (DOOR_E[0] - 0.1, DOOR_E[1], DOOR_E[2] + 1, DOOR_E[3])], M['hull'], bevel=0.03))
    out.append(mass('upper', rrect_pts(u0, v0, u1, SPLIT, HULL_RAD, corners=(1, 1, 0, 0)), 0.0, H_FULL,
                    [(ROOM[0], ROOM[1], ROOM[2], 10), (DOOR_N[0], DOOR_N[1] - 1, DOOR_N[2], DOOR_N[3] + 0.1)], M['hull'], bevel=0.03))
    style = dict(plate_mats=M['plates'], tread_mat=M['tread'], tread=0.12, grille=0.1, wonky=0.05, lost_rivets=0.05)
    floor_room(ROOM, M, rng, style, out)
    for d in (DOOR_N, DOOR_E):
        floor_room(d, M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
    out.append(ubox('lip_s', ROOM[0] - 0.02, ROOM[3], ROOM[2] + 0.02, ROOM[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
    jamb(u0, ROOM[0], M, out); jamb(ROOM[2], u1, M, out)
    # door frames: the LED strip shows who owns that door on the network (blue: us, red: the captain)
    out.append(ubox('door_n_led', DOOR_N[0] - 0.08, -4.06, DOOR_N[2] + 0.08, -4.0, H_FULL - 0.25, H_FULL - 0.17, M['blue_led'], bevel=0.005))
    for uu in (DOOR_N[0] - 0.08, DOOR_N[2]):
        out.append(ubox('door_n_jamb', uu, -4.1, uu + 0.08, -3.98, 0.0, H_FULL - 0.17, M['hazard'], bevel=0.005))
    out.append(ubox('door_e_led', -13.06, -1.0, -12.98, 1.0, H_LOW, H_LOW + 0.05, M['red_led'], bevel=0.005))
    out.append(ubox('door_e_led2', -13.06, -1.0, -12.98, -0.8, 0.0, H_LOW, M['red_led'], bevel=0.005))
    # back wall, right part: wall kit; left part: the CCTV wall
    back_wall(DOOR_N[2] + 0.1, ROOM[2], -4.0, M, rng, out)
    out.append(ubox('cctv_wall', ROOM[0], -4.0, DOOR_N[0] - 0.1, -3.97, 0.0, H_FULL - 0.05, M['panel2'], bevel=0.01))
    out.append(ubox('skirt', ROOM[0], -4.0, DOOR_N[0] - 0.1, -3.94, 0.0, 0.12, M['skirt'], bevel=0.01))
    feeds = [M['feed'], M['feed'], M['feed_red'], M['feed'], M['screen_dead'], M['feed']]
    for i in range(3):
        for j in range(2):
            cu = -20.75 + i * 0.95; z = 0.88 + j * 0.34
            wall_screen(cu, -3.97, z, 0.84, 0.28, M, out, feeds[i + 3 * j])
            if feeds[i + 3 * j] is M['feed']:     # a little camera picture: a pirate silhouette on a floor line
                out.append(ubox('fd_floor', cu - 0.38, -3.88, cu + 0.38, -3.87, z + 0.02, z + 0.05, M['dark'], bevel=0))
                px = cu + rng.uniform(-0.25, 0.25)
                out.append(ubox('fd_pirate', px - 0.04, -3.88, px + 0.04, -3.87, z + 0.05, z + 0.2, M['dark'], bevel=0))
                out.append(mn.cyl('fd_head', 0.035, 0.01, loc=P(px, -3.875, z + 0.23), m=M['dark'], rot=(R90, 0, 0), verts=12, bevel=0))
    tape(-19.8, -3.86, 1.08, 0.9, M['tape'], out, rotz=0)    # (a cracked feed, taped)
    out[-1].rotation_euler = (R90, 0.35, 0)
    text('rec', 'REC', -19.8 + 0.25, -3.86, 0.93, 0.07, M['red_led'], face=True)
    text('sec', 'SECURITY', -19.8, -3.95, 1.53, 0.07, M['white'], face=True)
    # the captain's webcam on top of the CCTV wall, taped over
    out.append(cbox('cam', -19.8, -4.1, 0.2, 0.16, H_FULL, 0.12, M['dark'], bevel=0.03))
    for a in (0.6, -0.6):
        t = cbox('cam_tape', -19.8, -4.02, 0.28, 0.07, H_FULL + 0.05, 0.006, M['tape'], bevel=0.002); t.rotation_euler = (R90, a, 0); t.location = P(-19.8, -4.01, H_FULL + 0.06); out.append(t)
    # the alarm beacon over the barracks door and the PA horn
    out.append(ucyl('beacon_base', 0.13, 0.06, -17.2, -4.3, H_FULL, M['dark']))
    out.append(mn.sphere('beacon', 0.12, loc=P(-17.2, -4.3, H_FULL + 0.08), m=M['red_led'], scale=(1, 1, 0.9), segs=20))
    out.append(ucyl('pa_horn', 0.13, 0.22, -15.0, -3.98, 1.25, M['steel'], axis='v', verts=20))
    out.append(text('pa_lbl', 'CAPT. RED COMET SPEAKING', -14.6, -3.9, 1.47, 0.07, M['sticker'], face=True))
    # the server racks on the right, blinking (red where the captain holds the node, blue where we do)
    for k, cu in enumerate((-15.7, -14.75, -13.8)):
        out.append(cbox('rack', cu, -3.55, 0.82, 0.8, 0.0, 1.45, M['body'], bevel=0.04))
        out.append(ubox('rack_face', cu - 0.36, -3.15, cu + 0.36, -3.13, 0.1, 1.38, M['dark'], bevel=0.01))
        for r in range(9):
            zz = 0.2 + r * 0.13
            out.append(ubox('slot', cu - 0.32, -3.13, cu + 0.32, -3.12, zz, zz + 0.09, M['panel'], bevel=0.004))
            for q in range(3):
                led = rng.choice([M['red_led'], M['red_led'], M['blue_led'], M['green_led'], M['amber_led'], M['lamp_dead']]) if k != 1 else rng.choice([M['blue_led'], M['green_led'], M['blue_led']])
                out.append(cbox('led', cu + 0.12 + q * 0.07, -3.115, 0.035, 0.01, zz + 0.03, 0.03, led, bevel=0.0))
    tape(-14.75, -3.11, 0.7, 0.8, M['tape'], out); out[-1].rotation_euler = (R90, 0.9, 0)
    out.append(text('rack_lbl', 'DO NOT\nUNPLUG', -13.8, -3.1, 0.06, 0.06, M['sticker'], face=True))
    # the security desk: a console in front of the CCTV wall
    out.append(ubox('desk', -21.2, -3.95, -18.3, -2.9, 0.0, 0.7, M['panel'], bevel=0.03))
    out.append(ubox('desk_top', -21.25, -3.95, -18.25, -2.85, 0.7, 0.76, M['steel'], bevel=0.02))
    out.append(ubox('desk_front', -21.15, -2.92, -18.35, -2.88, 0.12, 0.62, M['body'], bevel=0.01))
    out.append(text('desk_lbl', "CAPTAIN'S DESK  ·  KEEP OUT", -19.75, -2.87, 0.47, 0.085, M['sticker'], face=True))
    # the network map: a big screen set into the desk top, tilted towards the chair; nodes red (the captain's) and
    # blue (ours), lines between them, an amber ring where the captain is grabbing a node right now
    out.append(ubox('net_bezel', -21.15, -3.9, -18.35, -3.35, 0.76, 0.8, M['dark'], bevel=0.02))
    out.append(ubox('net_scr', -21.05, -3.85, -18.45, -3.4, 0.8, 0.805, M['netscr'], bevel=0.0))
    nodes = [(-20.8, -3.75, 'r'), (-20.3, -3.55, 'b'), (-19.8, -3.75, 'b'), (-19.3, -3.5, 'r'), (-18.75, -3.72, 'r'), (-20.75, -3.48, 'r'), (-19.0, -3.78, 'b')]
    for (a, vv, c) in nodes:
        out.append(ucyl('node', 0.06, 0.012, a, vv, 0.806, M['red_led'] if c == 'r' else M['blue_led'], verts=16, bevel=0))
    for (a, va, _), (b, vb, _) in zip(nodes, nodes[1:]):
        L = math.hypot(b - a, vb - va)
        out.append(cbox('link', (a + b) / 2, (va + vb) / 2, L, 0.014, 0.806, 0.004, M['feed'], bevel=0, rotz=math.atan2(vb - va, b - a)))
    ring_ = ucyl('grab_ring', 0.11, 0.008, -19.3, -3.5, 0.815, M['amber_led'], verts=24, bevel=0); out.append(ring_)
    out.append(ucyl('grab_hole', 0.085, 0.01, -19.3, -3.5, 0.816, M['netscr'], verts=24, bevel=0))
    out.append(ucyl('node_c', 0.06, 0.012, -19.3, -3.5, 0.822, M['red_led'], verts=16, bevel=0))
    out.append(cbox('kbd', -19.8, -3.08, 0.95, 0.26, 0.76, 0.04, M['dark'], bevel=0.015))
    out.append(cbox('mug', -18.6, -3.1, 0.14, 0.14, 0.76, 0.16, M['mug'], bevel=0.03))
    out.append(cbox('coffee', -18.6, -3.1, 0.11, 0.11, 0.9, 0.025, M['coffee'], bevel=0.01))
    out.append(cbox('note', -18.65, -3.82, 0.24, 0.02, 1.0, 0.22, M['sticker'], bevel=0.003))
    out.append(text('note_t', 'PW:\npassword1', -18.65, -3.8, 1.1, 0.045, M['black'], face=True))
    cat(-20.75, -3.1, 0.76, M, out)
    # the captain's chair (stolen leather throne, skull on the back) with our hacker in it
    cu, cv = -19.85, -2.3
    out.append(ucyl('chair_post', 0.05, 0.38, cu, cv, 0.05, M['steel']))
    for a in range(5):
        ang = a * 2 * math.pi / 5
        out.append(cbox('chair_leg', cu + 0.2 * math.cos(ang), cv + 0.2 * math.sin(ang), 0.36, 0.06, 0.03, 0.04, M['steel'], bevel=0.01, rotz=math.degrees(ang) * 0 + ang))
    out.append(cbox('seat', cu, cv, 0.78, 0.66, 0.4, 0.14, M['leather'], bevel=0.06))
    crew(cu, cv - 0.15, M, out, M['suit'], seated=True)
    for su in (-1, 1):
        out.append(pipe_uv('arm', [(cu + su * 0.25, cv - 0.15, 1.15), (cu + su * 0.27, cv - 0.5, 0.95), (cu + su * 0.18, cv - 0.75, 0.86)], 0.07, M['suit'], corner=0.1))
        out.append(cbox('armrest', cu + su * 0.4, cv - 0.05, 0.1, 0.5, 0.55, 0.08, M['leather'], bevel=0.03))
    out.append(cbox('chair_back', cu, cv + 0.32, 0.86, 0.16, 0.5, 0.78, M['leather'], bevel=0.07))
    out.append(cbox('chair_trim', cu, cv + 0.32, 0.9, 0.18, 1.24, 0.06, M['gold'], bevel=0.03))
    skull(cu, cv + 0.41, 0.9, 0.42, M['white'], out, face=True)
    out.append(text('chair_lbl', 'CAPT.', cu, cv + 0.42, 0.6, 0.09, M['gold'], face=True))
    # cables from the racks to the desk, across the floor; duct tape holding them down
    out.append(pipe_uv('cable_a', [(-15.7, -3.1, 0.06), (-15.9, -1.6, 0.06), (-17.8, -1.4, 0.06), (-18.3, -3.0, 0.06)], 0.05, M['cables'][0], corner=0.5))
    out.append(pipe_uv('cable_b', [(-14.75, -3.1, 0.06), (-14.9, -1.3, 0.06), (-17.9, -1.2, 0.06), (-18.3, -2.95, 0.06)], 0.05, M['cables'][1], corner=0.5))
    for uu in (-16.6, -17.4): tape(uu, -1.3, 0.1, 0.28, M['tape'], out, rotz=1.5708)
    # floor stencil and the runner heading out to the bay
    out.append(text('stencil', 'AUTHORISED PIRATES ONLY', -17.2, 1.8, FLOOR_Z + 0.003, 0.32, M['sticker']))
    out.append(text('stencil2', '(THAT MEANS YOU, WHISKERS)', -17.2, 2.35, FLOOR_Z + 0.003, 0.16, M['sticker']))
    stain(-18.4, -2.1, 0.32, M['oil'], out)
    crew(-14.3, 0.4, M, out, M['suit2'], face=0)
    out.append(cbox('carbine', -14.6, 0.05, 0.6, 0.1, 0.62, 0.08, M['gun'], bevel=0.02, rotz=-0.4))
    # a guard, duct-taped to a spare office chair (the room's guard post, handled)
    gu, gv = -20.2, 2.6
    out.append(ucyl('g_post', 0.05, 0.38, gu, gv, 0.05, M['steel']))
    out.append(cbox('g_seat', gu, gv, 0.7, 0.6, 0.4, 0.12, M['panel2'], bevel=0.05))
    out.append(cbox('g_back', gu, gv - 0.32, 0.72, 0.12, 0.5, 0.6, M['panel2'], bevel=0.05))
    out.append(cbox('g_body', gu, gv, 0.52, 0.38, 0.5, 0.5, M['pirate'], bevel=0.12))
    out.append(mn.sphere('g_head', 0.2, loc=P(gu, gv + 0.02, 1.15), m=M['skin'], segs=20))
    out.append(mn.sphere('g_band', 0.205, loc=P(gu, gv + 0.0, 1.2), m=M['red'], scale=(1, 1, 0.55), segs=20))
    out.append(mn.sphere('g_beard', 0.15, loc=P(gu, gv + 0.12, 1.02), m=M['hair'], scale=(1, 0.8, 0.8), segs=16))
    for z in (0.62, 0.8, 0.95):
        out.append(cbox('g_tape', gu, gv, 0.6, 0.46, z, 0.07, M['tape'], bevel=0.02))
    out.append(cbox('g_tape_mouth', gu, gv + 0.19, 0.22, 0.03, 1.07, 0.05, M['tape'], bevel=0.01))
    for su in (-1, 1): out.append(cbox('g_leg', gu + su * 0.12, gv + 0.32, 0.15, 0.3, 0.05, 0.35, M['hull2'], bevel=0.04))
    out.append(text('g_sign', 'ON BREAK', gu + 0.9, gv + 0.75, FLOOR_Z + 0.004, 0.16, M['white']))
    # a second runner on the way to the barracks door (the door code is on the barracks wall)
    crew(-17.2, -2.6, M, out, M['suit3'], face=0)
    # coffee machine by the bay door
    out.append(cbox('cm', -13.5, 2.9, 0.6, 0.5, 0.0, 1.1, M['red'], bevel=0.05))
    out.append(ubox('cm_slot', -13.75, 3.13, -13.25, 3.16, 0.3, 0.7, M['dark'], bevel=0.01))
    out.append(cbox('cm_lamp', -13.5, 3.16, 0.1, 0.02, 0.85, 0.06, M['green_led'], bevel=0.0))
    out.append(text('cm_lbl', 'GROG', -13.5, 3.17, 0.95, 0.08, M['white'], face=True))
    # the west wall's plaque (on the low lip): the chore wheel's cousin
    out.append(text('plaque', 'NETWORK RULES: 1. MY NETWORK  2. SEE RULE 1', -17.2, 4.45, H_LOW + 0.003, 0.17, M['white']))
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    rest = [o for o in out if o not in big and not o.name.startswith(('stain', 'plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'fd_', 'node', 'link', 'key', 'led', 'stencil', 'text', 'tape', 'cam_tape', 'grab', 'node_c'))]
    mn.outline(big, thickness=0.02); mn.outline(rest, thickness=0.012)
    return out

if __name__ == '__main__':
    objs = build()
    w, h, ox, oy = mn._frame(objs)
    os.makedirs(OUT, exist_ok=True)
    mn._render_to(os.path.join(OUT, 'keyart_raw.png'), 'beauty')
    print(f'[concept] {OUT}/keyart_raw.png {w}x{h}')
