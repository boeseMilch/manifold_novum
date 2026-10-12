"""The docked ships (js/dock.js drawDock): hull exterior + cut-away interior, one big sprite per kind and side.

    blender -b --factory-startup --python tools/blender/models/dock/ships.py -- <kind> <side> [quick]
        kind = pirate | derelict | brig   (or 'all'), side = port | star (or 'all')

Sprites (build/renders/dock/), origin = our airlock hatch on the ground (HATCHES[side].x, .y), see docklib.py:
  dock/pirate_<side>     the Red Comet raider docked (dk.dock.kind === 'pirate', no npc)
  dock/brig_<side>       the prison barge (EVENT_RUNNERS.brig: kind 'pirate' with contents.npc = Dr. Varga)
  dock/derelict_<side>   Dr. Varga's lab module (kind 'derelict'): airless and dark (the darkness is runtime
                         lighting; only emergency strips glow), frost, debris, dead screens, the intruder's nest
Not in these sprites (separate, stateful): the tube (tube.py), the loot crate, the reactor / dead core, the
jammed door (props.py). Fire stays procedural (fx group), as do actors and items.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docklib as D
from docklib import *

A = D.args()
KINDS = ['pirate', 'brig', 'derelict'] if not A or A[0] == 'all' else [A[0]]
SIDES = ['port', 'star'] if len(A) < 2 or A[1] == 'all' else [A[1]]
QUICK = 'quick' in A
if QUICK: mn.SAMPLES = 16

# ---------------------------------------------------------------------------------------------------
# Materials per kind
# ---------------------------------------------------------------------------------------------------
def materials(kind):
    der, brig = kind == 'derelict', kind == 'brig'
    fr = 0.6 if der else 0.0
    rust = 0.15 if not der else 0.05
    M = dict(
        sub=pmat('sub', '#16181d', 0.8), hole=pmat('hole', '#0c0d10', 0.9), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6, frost=fr * 0.5),
        rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5, frost=fr * 0.6),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5),
        tape=pmat('tape', '#b9bcc2', 0.85), ink=pmat('ink', '#23252b', 0.6),
        hazard=stripes_mat('hazard'), hazard_red=stripes_mat('hazard_red', '#c0392b', '#e8e4dc', 5.0),
        cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2),
        lamp_em=emit_mat('lamp_em', '#5aff9a', 1.3, base='#2a7a4a'), lamp_amber=emit_mat('lamp_amber', '#ffb43a', 1.3, base='#7a5a1a'),
        lamp_red=emit_mat('lamp_red', '#ff3a2a', 1.4, base='#6a1a14'),
        screen_dead=pmat('screen_dead', '#0c1218', 0.08, 0.0, clearcoat=0) if False else mn.mat('screen_dead', '#10161c', 0.06, 0.0, clearcoat=1.0),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.4, 0.3, wear=0.8, grime=0.6),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), scrap=worn('scrap', '#6a5a48', 0.6, 0.4, rust=0.4),
        oil=decal_mat('oil', '#0a0908', 0.85, rough=0.15), soot=decal_mat('soot', '#0b0a09', 0.9),
        rustd=decal_mat('rustd', '#5a2a12', 0.6, 3.0), frostd=decal_mat('frostd', '#c8d8e6', 0.45, 9.0, rough=0.9),
        slime=decal_mat('slime', '#3a1a46', 0.85, 6.0, rough=0.1), glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        rubber=pmat('rubber', '#262a33', 0.7), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3 * (not der)),
        paper=pmat('paper', '#e6e2d6', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6),
    )
    M['pipe1'] = worn('pipe1', '#3b7a8a', 0.4, 0.3, frost=fr, rust=rust * 0.5)
    M['pipe2'] = M['copper']
    if kind == 'pirate':
        M.update(hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
                 trim=worn('trim', '#a83a3a', 0.5, 0.1, wear=0.9), body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15),
                 panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2), panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15),
                 lamp=emit_mat('lamp', '#ffb46a', 1.2, base='#ffd0a0'))
        shades = ['#6a5a5e', '#665658', '#6e5c5c', '#625458']
    elif kind == 'brig':
        M.update(hull=worn('hull', '#64644f', 0.5, 0.25, wear=0.6, rust=0.15), hull2=worn('hull2', '#34342c', 0.55, 0.25, rust=0.1),
                 trim=stripes_mat('trim', '#e8c34f', '#23252b', 2.5, 0.6), body=worn('body', '#44443c', 0.6, 0.3, rust=0.15),
                 panel=worn('panel', '#5e5c4e', 0.5, 0.3, rust=0.2), panel2=worn('panel2', '#66645a', 0.45, 0.3, rust=0.15),
                 lamp=emit_mat('lamp', '#ffe0a8', 1.1, base='#fff0d0'))
        shades = ['#6a5a5e', '#625a5a', '#6a6060', '#5e5658']
    else:
        M.update(hull=worn('hull', '#5c626c', 0.55, 0.3, wear=0.6, frost=0.7, grime=1.1), hull2=worn('hull2', '#3a3f46', 0.6, 0.3, frost=0.5),
                 trim=worn('trim', '#5a5040', 0.6, 0.1, wear=0.8, frost=0.6), body=worn('body', '#4c525a', 0.6, 0.3, frost=0.8, grime=1.1),
                 panel=worn('panel', '#7c848e', 0.45, 0.2, frost=0.9, grime=1.3), panel2=worn('panel2', '#9aa1aa', 0.4, 0.2, frost=0.9, grime=1.2),
                 lamp=M['lamp_dead'])
        shades = ['#6a6e76', '#666a72', '#6e727a', '#63676f']
    M['plates'] = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12 if not der else 0.0, frost=fr) for i, c in enumerate(shades)]
    M['tread'] = worn('tread', '#7f8794' if not der else '#6a6f78', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08 if not der else 0, frost=fr)
    D.M_DARK[0] = M['black']
    return M

# ---------------------------------------------------------------------------------------------------
# Common structure
# ---------------------------------------------------------------------------------------------------
def structure(kind, M, rng, out):
    der = kind == 'derelict'
    build_hull(M, out, M['hull'], M['hull'], M['hull2'])
    style = dict(plate_mats=M['plates'], tread_mat=M['tread'], tread=0.12, grille=0.08, missing=0.04 if der else 0.0,
                 wonky=0.12 if der else 0.05, lost_rivets=0.15 if der else 0.05)
    for name, r in ROOMS.items():
        floor_room(r, M, rng, style, out)
    for d in DOORS:                                              # door thresholds: hazard plate
        floor_room(d, M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
        out.append(ubox('thr_hz', d[0] + 0.04, d[1] + 0.05, d[0] + 0.12, d[3] - 0.05, FLOOR_Z, FLOOR_Z + 0.01, M['hazard'], bevel=0))
        out.append(ubox('thr_hz', d[2] - 0.12, d[1] + 0.05, d[2] - 0.04, d[3] - 0.05, FLOOR_Z, FLOOR_Z + 0.01, M['hazard'], bevel=0))
    # the outer airlock opening (where the tube clamps on): floor out to the hull edge
    floor_room((TUBE[0], TUBE[1], HULLR[2], TUBE[3]), M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
    # back walls (each room's north face) are added by the kind; the stub ends (jambs) are common
    stubs = wall_stubs()
    lamp_j = M['lamp'] if not der else M['lamp_dead']
    for i, (a, b) in enumerate(stubs):
        jamb(a, b, M, out, lamp=lamp_j)
    wall_tops(M, out)
    # low-deck cut lips (steel edge where the deck is cut away above each room's south part)
    for r in ROOMS.values():
        out.append(ubox('lip_s', r[0] - 0.02, r[3], r[2] + 0.02, r[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
        for u in (r[0], r[2]):
            sgn = -1 if u == r[0] else 1
            out.append(ubox('lip_v', u + (0.0 if sgn > 0 else -0.08), 0.8, u + (0.08 if sgn > 0 else 0.0), r[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
    # door jambs on the south side (low): hazard caps
    for d in DOORS:
        out.append(ubox('djamb_s', d[0] - 0.02, d[3], d[2] + 0.02, d[3] + 0.12, H_LOW - 0.02, H_LOW + 0.02, M['hazard'], bevel=0.006))
    # belly front face: hull plate seams and rivets, along the camera-facing south edge
    u0, v0, u1, v1 = HULLR
    x = u0 + 0.8
    while x < u1 - 0.6:
        out.append(ubox('belly_seam', x - 0.012, v1 - 0.06, x + 0.012, v1 + 0.005, -0.5, 0.0, M['black'], bevel=0))
        for z in (-0.12, -0.42): out.append(face_rivet(x + 0.35, v1 - 0.04, z, M['steel']))
        x += 1.6
    # low-deck roof seams (south band) and rivets
    for r in ROOMS.values():
        a, c = r[0], r[2]
        if v1 - r[3] > 0.5:
            out.append(ubox('roof_seam', a, (r[3] + v1) / 2 - 0.01, c, (r[3] + v1) / 2 + 0.01, H_LOW, H_LOW + 0.004, M['black'], bevel=0))
        x = a + 0.4
        while x < c - 0.2:
            out.append(rivet(x, v1 - 0.18, H_LOW, M['steel'], 0.03)); x += 0.7
        x = a + 1.2
        while x < c - 0.5:                                       # plate seams across the south and north bands
            out.append(ubox('roof_seam', x - 0.01, r[3] + 0.1, x + 0.01, v1 - 0.05, H_LOW, H_LOW + 0.004, M['black'], bevel=0))
            out.append(ubox('roof_seam', x - 0.01, v0 + 0.08, x + 0.01, r[1] - 0.05, H_FULL, H_FULL + 0.004, M['black'], bevel=0))
            x += 1.6
        if r[1] - v0 > 1.2:
            out.append(ubox('roof_seam', a, (r[1] + v0) / 2 - 0.01, c, (r[1] + v0) / 2 + 0.01, H_FULL, H_FULL + 0.004, M['black'], bevel=0))

# ---------------------------------------------------------------------------------------------------
# Pirate raider
# ---------------------------------------------------------------------------------------------------
def engines(M, out, glow_mat, v_list=(-2.6, 2.6), dead=False):
    u0 = HULLR[0]
    M['bell'] = worn('bell', '#8a929e', 0.45, 0.35, wear=0.4)
    for v in v_list:
        out.append(ucyl('eng_body', 0.75, 1.3, u0 + 0.6, v, 0.55, M['hull2'], axis='u', verts=32, bevel=0.04))
        o = out[-1]; o.location = P(u0 + 0.6, v, 0.55) if S < 0 else P(u0 + 0.6, v, 0.55); o.rotation_euler = (0, -R90 * S, 0)
        out.append(ucyl('eng_band', 0.78, 0.18, 0, v, 0.55, M['trim'], axis='u', verts=32, bevel=0.02))
        o = out[-1]; o.location = P(u0 + 0.2, v, 0.55); o.rotation_euler = (0, -R90 * S, 0)
        out.append(ucyl('eng_bell', 0.62, 0.55, 0, v, 0.55, M['bell'], axis='u', verts=32, bevel=0.03))
        o = out[-1]; o.location = P(u0 - 0.65, v, 0.55); o.rotation_euler = (0, -R90 * S, 0)
        if not dead:
            out.append(ucyl('eng_glow', 0.5, 0.02, 0, v, 0.55, glow_mat, axis='u', verts=32, bevel=0))
            o = out[-1]; o.location = P(u0 - 1.21, v, 0.55); o.rotation_euler = (0, -R90 * S, 0)
        for k in range(6):
            a = k * math.tau / 6
            out.append(rivet(u0 - 0.1, v + math.cos(a) * 0.79, 0.55 + math.sin(a) * 0.79, M['steel'], 0.03))

def claw(M, out):
    """Docking claw arms gripping round the tube collar on the near end."""
    for sv in (-1, 1):
        pts = [(-5.2, sv * 1.15, 0.3), (-4.4, sv * 1.15, 0.3), (-4.1, sv * 0.85, 0.3)]
        out.append(pipe_uv('claw_arm', pts, 0.1, M['steel'], corner=0.25))
        out.append(cbox('claw_tip', -4.05, sv * 0.78, 0.22, 0.16, 0.18, 0.24, M['hull2'], bevel=0.03))
        out.append(ucyl('claw_hinge', 0.14, 0.32, -5.2, sv * 1.15, 0.14, M['hull2'], verts=16, bevel=0.03))

def build_pirate(M, rng, out):
    der = False
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    # back walls with custom features
    back_wall(A_[0], A_[2], A_[1], M, rng, out, skip=[(-9.6, -8.4)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out, skip=[(-17.9, -16.8), (-12.6, -11.4)])
    back_wall(K_[0], K_[2], K_[1], M, rng, out, skip=[(-22.4, -20.6)])
    # airlock: weapons rack + lockers
    v = A_[1]
    out.append(ubox('rack', -9.75, v, -8.25, v + 0.08, 0.5, 1.35, M['body'], bevel=0.02))
    for i in range(4):
        u = -9.55 + i * 0.37
        out.append(ubox('rifle', u - 0.04, v + 0.08, u + 0.04, v + 0.16, 0.6, 1.25, M['black'], bevel=0.015))
        out.append(ubox('stock', u - 0.06, v + 0.08, u + 0.06, v + 0.18, 0.6, 0.78, M['scrap'], bevel=0.02))
    text('sign', 'NO SNITCHES', -7.4, v + 0.04, 1.08, 0.13, M['white'], face=True)
    for u in (-6.6, -6.1):
        out.append(ubox('locker', u - 0.23, v, u + 0.23, v + 0.32, 0.0, 1.3, M['trim'], bevel=0.03))
        for z in (0.95, 1.05, 1.15): out.append(ubox('lvent', u - 0.14, v + 0.32, u + 0.14, v + 0.335, z, z + 0.03, M['black'], bevel=0))
        out.append(ubox('lhandle', u + 0.12, v + 0.32, u + 0.16, v + 0.36, 0.6, 0.8, M['steel'], bevel=0.008))
    out.append(ubox('tape', -6.75, v + 0.32, -6.45, v + 0.335, 0.4, 0.49, M['tape'], bevel=0.002))
    # airlock floor: hazard band by the outer door, oil, boot scuffs
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    stain(-8.3, 1.2, 0.45, M['oil'], out, sv=0.7, rotz=0.4)
    debris(-10.0, -1.9, -6.4, 2.2, 6, [M['scrap'], M['steel'], M['black']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo: stolen goods stacked against the back wall, a skull painted on the floor, coins by the loot crate
    v = C_[1]
    stack = [(-18.0, 0.55, 0.9, 'trim'), (-17.35, 0.5, 0.6, 'panel'), (-17.35, 0.5, 0.55, 'scrap')]
    out.append(ubox('goods', -18.3, v, -17.6, v + 0.42, 0.0, 0.9, M['scrap'], bevel=0.03))
    out.append(ubox('goods', -17.55, v, -16.9, v + 0.42, 0.0, 0.6, M['panel'], bevel=0.03))
    out.append(ubox('goods', -17.5, v + 0.03, -16.95, v + 0.39, 0.6, 1.05, M['trim'], bevel=0.03))
    text('stencil', 'MINE', -17.95, v + 0.425, 0.45, 0.12, M['white'], face=True)
    for i, u in enumerate((-12.4, -11.85)):                          # barrels
        out.append(ucyl('barrel', 0.24, 0.8, u, v + 0.3, 0.0, M['red'] if i else M['gold'], verts=24, bevel=0.03))
        for z in (0.2, 0.6): out.append(D.ring('hoop', 0.25, 0.03, 0.04, loc=P(u, v + 0.3, z), m=M['steel']))
    out.append(ucyl('barrel_top', 0.2, 0.01, -12.4, v + 0.3, 0.8, M['black'], verts=24, bevel=0))
    skull(-14.2, 1.6, FLOOR_Z + 0.001, 1.5, M['white'], out, face=False)
    for i in range(14):                                             # spilled coins near the crate
        a, r = rng.uniform(0, math.tau), rng.uniform(0.75, 1.3)
        out.append(ucyl('coin', 0.05, 0.012, SPOT['crate'][0] + math.cos(a) * r, SPOT['crate'][1] + math.sin(a) * r * 0.8 + 0.3, FLOOR_Z, M['gold'], verts=12, bevel=0.003))
    stain(-12.0, 2.6, 0.55, M['oil'], out, sv=0.6, rotz=-0.3); stain(-17.2, 2.0, 0.4, M['rustd'], out)
    debris(-18.2, -1.0, -11.0, 3.8, 10, [M['scrap'], M['steel'], M['black'], M['gold']], rng, out,
           avoid=[(*SPOT['crate'], 1.1), (*SPOT['loot_drop'], 0.6), (-14.2, 1.6, 0.8), (*SPOT['npc'], 0.7)])
    # bottles
    for u, vv in ((-11.3, 3.4), (-11.5, 3.6), (-17.9, 3.4)):
        out.append(ucyl('bottle', 0.05, 0.2, u, vv, FLOOR_Z, M['glass'], verts=12, bevel=0.01))
    # core room back wall: gauges, valve wheels, warning
    v = K_[1]
    for i, u in enumerate((-22.1, -21.0)):
        out.append(mn.cyl('gauge', 0.16, 0.08, loc=P(u, v + 0.0, 1.0), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.02))
        out.append(mn.cyl('gface', 0.13, 0.02, loc=P(u, v + 0.08, 1.0), m=M['white'], rot=(R90, 0, 0), verts=24, bevel=0.004))
        nd = mn.box('needle', (0.016, 0.012, 0.11), loc=P(u, v + 0.1, 1.0), m=M['red'], bevel=0); nd.rotation_euler = (0, math.radians(50 if i else -30), 0); out.append(nd)
        out.append(D.ring('valve', 0.15, 0.035, 0.04, loc=P(u, v + 0.12, 0.55), m=M['red'], rot=(R90, 0, 0)))
        out.append(ubox('valve_spoke', u - 0.13, v + 0.1, u + 0.13, v + 0.13, 0.535, 0.565, M['red'], bevel=0.005))
    out.append(ubox('warn', -21.95, v, -21.15, v + 0.02, 1.3, 1.5, M['sticker'], bevel=0.003))
    text('warn_t', "DON'T TOUCH", -21.55, v + 0.025, 1.4, 0.08, M['ink'], face=True)
    stain(-21.0, 1.6, 0.5, M['oil'], out, sv=0.6); stain(-24.6, -2.2, 0.3, M['rustd'], out)
    # exterior: turret + flag on the airlock roof, radiators + exhaust stacks on the core roof
    zr = H_FULL
    tu, tv = -7.4, -3.7
    out.append(ucyl('tur_base', 0.62, 0.14, tu, tv, zr, M['hull2'], verts=40, bevel=0.03))
    out.append(D.ring('tur_ring', 0.66, 0.08, 0.08, loc=P(tu, tv, zr), m=M['gold']))
    dome = mn.sphere('tur_dome', 0.5, loc=P(tu, tv, zr + 0.14), m=M['hull'], scale=(1, 1, 0.7), segs=32); out.append(dome)
    for sv in (-0.12, 0.12):
        out.append(ucyl('tur_barrel', 0.06, 1.0, tu + 0.35, tv + sv, zr + 0.36, M['black'], axis='u', verts=16, bevel=0.01))
        out[-1].location = P(tu + 0.35, tv + sv, zr + 0.36) if S > 0 else P(tu + 1.35, tv + sv, zr + 0.36)
    out.append(cbox('tur_slit', tu + 0.2, tv + 0.3, 0.32, 0.08, zr + 0.28, 0.08, M['lamp_red'], bevel=0.02))
    mu, mv = -9.6, -3.9                                                # flag mast
    out.append(ucyl('mast', 0.035, 1.3, mu, mv, zr, M['steel'], verts=12, bevel=0.008))
    out.append(cbox('flag', mu - 0.4, mv, 0.72, 0.012, zr + 0.82, 0.42, M['black'], bevel=0.004))
    skull(mu - 0.4, mv + 0.006, zr + 1.06, 0.45, M['white'], out, face=True)
    for k in range(5):                                                 # radiator fins on the core roof
        u = -24.6 + k * 0.6
        out.append(ubox('fin', u - 0.05, -4.45, u + 0.05, -3.05, zr, zr + 0.4, M['steel'], bevel=0.015))
    out.append(ubox('fin_bar', -24.75, -3.85, -21.95, -3.65, zr + 0.4, zr + 0.48, M['hull2'], bevel=0.02))
    for u in (-20.9, -19.9):
        out.append(ucyl('stack', 0.22, 0.75, u, -3.7, zr, M['hull2'], verts=24, bevel=0.03))
        out.append(D.ring('stack_rim', 0.24, 0.06, 0.08, loc=P(u, -3.7, zr + 0.72), m=M['steel']))
        out.append(ucyl('stack_hole', 0.17, 0.01, u, -3.7, zr + 0.74, M['soot'] if False else M['black'], verts=24, bevel=0))
        out.append(disc('soot', u, -3.7 - 0.0, zr + 0.003, 0.5, M['soot']))
    # cargo roof: scrap patches welded on, antenna
    for (u, vv, w, d, a) in ((-16.8, -4.35, 0.8, 0.45, 8), (-12.4, -4.4, 0.6, 0.38, -12)):
        out.append(cbox('patch', u, vv, w, d, zr, 0.04, M['scrap'], bevel=0.01, rotz=math.radians(a)))
        for su in (-1, 1):
            for sv in (-1, 1): out.append(rivet(u + su * (w / 2 - 0.07), vv + sv * (d / 2 - 0.06), zr + 0.04, M['steel'], 0.022))
    out.append(ucyl('antenna', 0.03, 1.1, -14.6, -4.4, zr, M['steel'], verts=10, bevel=0.005))
    out.append(mn.sphere('ant_tip', 0.06, loc=P(-14.6, -4.4, zr + 1.12), m=M['lamp_red'], segs=12))
    # low south deck: gold stripe + red trim, name, nav lights, a scrap patch
    v1 = HULLR[3]
    out.append(ubox('stripe_gold', HULLR[0] + 0.5, v1 - 0.38, HULLR[2] - 0.5, v1 - 0.3, H_LOW, H_LOW + 0.004, M['gold'], bevel=0))
    out.append(ubox('stripe_red', HULLR[0] + 0.3, v1 - 0.1, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.05, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'RED COMET', -8.2, v1 - 0.03, -0.2, 0.26, M['gold'], face=True)
    text('reg', 'RC-13', -14.6, v1 - 0.06, H_LOW + 0.003, 0.22, M['white'])
    skull(-21.8, v1 - 0.035, -0.22, 0.42, M['white'], out, face=True)
    for u, m in ((HULLR[0] + 0.45, M['lamp_red']), (HULLR[2] - 0.45, M['lamp_em'])):
        out.append(mn.sphere('nav', 0.07, loc=P(u, v1 - 0.25, H_LOW + 0.02), m=m, segs=16))
    out.append(cbox('patch', -18.2, v1 - 0.02, 0.7, 0.04, -0.4, 0.3, M['scrap'], bevel=0.01))
    engines(M, out, emit_mat('eng_glow', '#ffb35c', 1.4, base='#ff9040'))
    claw(M, out)

# ---------------------------------------------------------------------------------------------------
# Prison barge (the Red Comet's brig): pirate interior, Dr. Varga in the cargo hold
# ---------------------------------------------------------------------------------------------------
def build_brig(M, rng, out):
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    back_wall(A_[0], A_[2], A_[1], M, rng, out, skip=[(-9.7, -8.5)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out)
    back_wall(K_[0], K_[2], K_[1], M, rng, out, skip=[(-22.4, -20.6)])
    # airlock: guard post (key board, lockers, a 'VISITORS' sign)
    v = A_[1]
    out.append(ubox('keyboard', -9.6, v, -8.6, v + 0.06, 0.8, 1.35, M['scrap'], bevel=0.02))
    for i in range(5):
        out.append(ubox('key', -9.45 + i * 0.18, v + 0.06, -9.4 + i * 0.18, v + 0.08, 1.02, 1.12, M['gold'], bevel=0.004))
    text('sign', 'NO VISITORS', -7.3, v + 0.04, 1.08, 0.13, M['white'], face=True)
    for u in (-6.6, -6.1):
        out.append(ubox('locker', u - 0.23, v, u + 0.23, v + 0.32, 0.0, 1.3, M['panel2'], bevel=0.03))
        for z in (0.95, 1.05, 1.15): out.append(ubox('lvent', u - 0.14, v + 0.32, u + 0.14, v + 0.335, z, z + 0.03, M['black'], bevel=0))
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    debris(-10.0, -1.9, -6.4, 2.2, 4, [M['scrap'], M['steel']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo hold: cells along the back wall (bars in front of shallow alcoves), the prisoner's spot
    v = C_[1]
    for (a, b) in ((-18.3, -15.5), (-13.7, -10.9)):
        out.append(ubox('cell_back', a, v, b, v + 0.04, 0.12, 1.45, M['body'], bevel=0.01))
        out.append(ubox('cell_top', a, v, b, v + 0.5, 1.4, 1.5, M['hull2'], bevel=0.02))
        n = int((b - a) / 0.2)
        for i in range(n + 1):
            u = a + 0.05 + i * (b - a - 0.1) / n
            out.append(ucyl('bar', 0.025, 1.38, u, v + 0.46, 0.02, M['steel'], verts=10, bevel=0.005))
        out.append(ubox('cell_rail', a, v + 0.42, b, v + 0.5, 0.0, 0.06, M['rim'], bevel=0.01))
        out.append(ubox('cell_bar_h', a, v + 0.43, b, v + 0.49, 0.75, 0.8, M['steel'], bevel=0.008))
        text('cellno', 'C1' if a < -15 else 'C2', (a + b) / 2, v + 0.505, 1.45, 0.1, M['white'], face=True)
        out.append(ubox('cot', a + 0.2, v + 0.05, a + 1.2, v + 0.38, 0.0, 0.3, M['scrap'], bevel=0.03))
    # Dr. Varga's spot (npcSpot): a thin mat on the floor, a ring bolted to the deck and a chain to it
    nu, nv = SPOT['npc']
    out.append(cbox('mat', nu, nv, 1.1, 0.62, FLOOR_Z, 0.03, M['scrap'], bevel=0.02, rotz=math.radians(4)))
    ru, rv = nu + 0.9, nv - 0.5
    out.append(D.ring('floor_ring', 0.09, 0.025, 0.03, loc=P(ru, rv, FLOOR_Z), m=M['steel']))
    out.append(ucyl('ring_base', 0.12, 0.02, ru, rv, FLOOR_Z, M['dark'], verts=16, bevel=0.005))
    links = [(ru - i * 0.11, rv + i * 0.06 + 0.02 * math.sin(i), FLOOR_Z + 0.02) for i in range(7)]
    for (a, b, z) in links: out.append(D.ring('link', 0.035, 0.012, 0.014, loc=P(a, b, z), m=M['steel']))
    stain(-12.2, 2.8, 0.5, M['oil'], out, sv=0.6)
    debris(-18.2, -2.6, -11.0, 3.8, 7, [M['scrap'], M['steel'], M['paper']], rng, out,
           avoid=[(*SPOT['crate'], 1.1), (*SPOT['loot_drop'], 0.6), (*SPOT['npc'], 1.0)])
    text('stencil', 'HOLD', -14.6, 3.4, FLOOR_Z + 0.002, 0.4, M['sticker'])
    # core room back wall: gauges as on the raider
    v = K_[1]
    for i, u in enumerate((-22.1, -21.0)):
        out.append(mn.cyl('gauge', 0.16, 0.08, loc=P(u, v, 1.0), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.02))
        out.append(mn.cyl('gface', 0.13, 0.02, loc=P(u, v + 0.08, 1.0), m=M['white'], rot=(R90, 0, 0), verts=24, bevel=0.004))
        out.append(D.ring('valve', 0.15, 0.035, 0.04, loc=P(u, v + 0.12, 0.55), m=M['red'], rot=(R90, 0, 0)))
    stain(-21.2, 1.7, 0.5, M['oil'], out, sv=0.6)
    # exterior: two searchlight towers, a comet emblem, hazard trim, barred portholes on the belly
    zr = H_FULL
    for (u, vv) in ((-8.4, -3.6), (-21.8, -3.8)):
        out.append(ucyl('tower', 0.18, 0.7, u, vv, zr, M['hull2'], verts=16, bevel=0.02))
        out.append(cbox('lamp_box', u, vv + 0.05, 0.42, 0.34, zr + 0.7, 0.26, M['hull2'], bevel=0.04))
        out.append(ubox('lamp_face', u - 0.15, vv + 0.2, u + 0.15, vv + 0.235, zr + 0.73, zr + 0.93, M['lamp'], bevel=0.01))
    cu, cv = -14.6, -4.32                                             # comet emblem on the cargo roof
    out.append(disc('comet', cu + 0.35, cv, zr + 0.003, 0.22, M['red']))
    for k in range(3):
        out.append(cbox('tail', cu - 0.15 - k * 0.12, cv - 0.06 + k * 0.06, 0.7 - k * 0.15, 0.06, zr + 0.002, 0.004, M['red'], bevel=0))
    for k in range(5):
        u = -24.6 + k * 0.6
        out.append(ubox('fin', u - 0.05, -4.45, u + 0.05, -3.05, zr, zr + 0.35, M['steel'], bevel=0.015))
    v1 = HULLR[3]
    out.append(ubox('trim', HULLR[0] + 0.3, v1 - 0.12, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.06, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'RED COMET  PRISON BARGE 9', -15.0, v1 - 0.03, -0.2, 0.22, M['white'], face=True)
    for u in (-23.4, -20.6, -9.6, -6.6):                              # barred portholes on the belly face
        out.append(mn.cyl('port', 0.17, 0.05, loc=P(u, v1 - 0.06, -0.22), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.015))
        out.append(mn.cyl('port_glass', 0.13, 0.02, loc=P(u, v1 - 0.0, -0.22), m=M['lamp_amber'], rot=(R90, 0, 0), verts=24, bevel=0))
        for k in (-0.06, 0.0, 0.06): out.append(ubox('pbar', u + k - 0.012, v1 - 0.0, u + k + 0.012, v1 + 0.03, -0.36, -0.08, M['black'], bevel=0))
    for u, m in ((HULLR[0] + 0.45, M['lamp_red']), (HULLR[2] - 0.45, M['lamp_em'])):
        out.append(mn.sphere('nav', 0.07, loc=P(u, v1 - 0.25, H_LOW + 0.02), m=m, segs=16))
    engines(M, out, emit_mat('eng_glow', '#ffb35c', 1.2, base='#ff9040'), v_list=(-3.0, 0.0, 3.0))
    claw(M, out)

# ---------------------------------------------------------------------------------------------------
# Derelict lab module (Dr. Varga's station)
# ---------------------------------------------------------------------------------------------------
def build_derelict(M, rng, out):
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    back_wall(A_[0], A_[2], A_[1], M, rng, out, lamps='dead', skip=[(-9.0, -7.6)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out, lamps='dead', skip=[(-18.0, -15.6), (-14.0, -11.2)])
    back_wall(K_[0], K_[2], K_[1], M, rng, out, lamps='dead', skip=[(-23.0, -21.0)])
    # emergency strips along the bottom of every back wall and the room edges (the only light in here)
    for r in ROOMS.values():
        emergency_strip(r[0] + 0.1, r[2] - 0.1, r[1] + 0.12, M, out, rng, dead=0.35)
        emergency_strip(r[0] + 0.1, r[2] - 0.1, r[3] - 0.1, M, out, rng, dead=0.5, color='lamp_amber')
    # airlock: dead suit locker, helmet on the floor, frost, a 'LAB 3' sign, a dead screen
    v = A_[1]
    wall_screen(-8.3, v, 0.85, 0.9, 0.5, M, out, M['screen_dead'])
    out.append(ubox('sign', -7.2, v, -5.9, v + 0.02, 1.15, 1.45, M['white'], bevel=0.004))
    text('sign_t', 'LAB 3  AIRLOCK', -6.55, v + 0.025, 1.3, 0.1, M['ink'], face=True)
    hel = mn.sphere('helmet', 0.2, loc=P(-9.4, 1.6, FLOOR_Z + 0.16), m=M['white'], scale=(1, 1, 0.9), segs=24); out.append(hel)
    out.append(mn.sphere('visor', 0.15, loc=P(-9.4, 1.72, FLOOR_Z + 0.17), m=M['glass'], scale=(1, 0.6, 0.7), segs=20))
    stain(-6.6, -1.4, 0.7, M['frostd'], out, sv=0.8); stain(-9.3, -1.2, 0.5, M['frostd'], out)
    debris(-10.0, -1.9, -6.0, 2.2, 10, [M['panel'], M['steel'], M['paper'], M['black']], rng, out, avoid=[(-7.9, 0, 0.7)])
    # cargo = the lab: specimen tanks (cracked, empty), a lab bench, dead screens, papers everywhere
    v = C_[1]
    for i, u in enumerate((-17.6, -16.4)):
        out.append(ucyl('tank_base', 0.36, 0.18, u, v + 0.32, 0.0, M['body'], verts=32, bevel=0.03))
        gl = mn.cyl('tank', 0.3, 1.05, loc=P(u, v + 0.32, 0.18), m=M['glass'], verts=32, bevel=0.01); out.append(gl)
        out.append(ucyl('tank_cap', 0.36, 0.16, u, v + 0.32, 1.23, M['body'], verts=32, bevel=0.03))
        out.append(ucyl('tank_fluid', 0.27, 0.15 if i == 0 else 0.0001, u, v + 0.32, 0.18, emit_mat('fluid', '#4aff9a', 0.6, base='#2a6a4a'), verts=24, bevel=0))
    for (u, vv) in ((-16.0, -3.2), (-16.3, -2.95), (-15.8, -2.7)):     # glass shards from the broken tank
        out.append(cbox('glass_shard', u, vv, 0.14, 0.07, FLOOR_Z, 0.01, M['glass'], bevel=0, rotz=rng.uniform(0, 3)))
    stain(-16.3, -2.9, 0.55, M['slime'], out, sv=0.7)                 # something got out of it
    out.append(ubox('bench', -14.0, v, -11.3, v + 0.42, 0.62, 0.72, M['panel2'], bevel=0.02))
    for u in (-13.85, -11.45): out.append(ubox('bench_leg', u - 0.04, v + 0.05, u + 0.04, v + 0.38, 0.0, 0.62, M['steel'], bevel=0.01))
    out.append(ucyl('scope', 0.06, 0.3, -13.4, v + 0.2, 0.72, M['black'], verts=12, bevel=0.01))
    out.append(cbox('scope_base', -13.4, v + 0.22, 0.2, 0.2, 0.72, 0.04, M['white'], bevel=0.01))
    for (u, d) in ((-12.7, 0.0), (-12.4, 0.12), (-11.9, -0.05)):
        out.append(cbox('paper', u, v + 0.2 + d, 0.2, 0.26, 0.72, 0.004, M['paper'], bevel=0, rotz=rng.uniform(-0.5, 0.5)))
    wall_screen(-12.6, v, 0.95, 1.2, 0.5, M, out, M['screen_dead'])
    out.append(ubox('scr_crack', -12.9, v + 0.085, -12.3, v + 0.09, 1.15, 1.17, M['white'], bevel=0, rotz=0.0))
    text('inst', 'VARGA INSTITUTE', -16.8, v + 0.04, 1.42, 0.1, M['white'], face=True)
    # the fire spot (dk.dock.fires starts at SPOT.fire): a burst gas line in the floor, scorch around it
    fu, fv = SPOT['fire']
    stain(fu, fv, 0.95, M['soot'], out, sv=0.8)
    out.append(cbox('fire_grate', fu, fv, 0.5, 0.5, FLOOR_Z, 0.015, M['bar'], bevel=0.005))
    out.append(cbox('fire_hole', fu, fv, 0.38, 0.38, FLOOR_Z, 0.016, M['black'], bevel=0))
    out.append(pipe_uv('burst', [(fu - 0.3, fv + 0.05, -0.02), (fu - 0.05, fv, 0.08), (fu + 0.1, fv - 0.05, 0.1)], 0.05, M['copper']))
    out.append(ring('burst_end', 0.07, 0.03, 0.03, loc=P(fu + 0.1, fv - 0.05, 0.08), m=M['black']))
    for k in range(18):                                                  # papers, everywhere
        u, vv = rng.uniform(-18.2, -11.0), rng.uniform(-2.0, 3.8)
        if math.hypot(u - fu, vv - fv) < 1.0 or math.hypot(u - SPOT['crate'][0], vv - SPOT['crate'][1]) < 1.0: continue
        out.append(cbox('paper', u, vv, 0.2, 0.26, FLOOR_Z + 0.002 * k, 0.004, M['paper'], bevel=0, rotz=rng.uniform(0, 3)))
    debris(-18.2, -2.0, -11.0, 3.8, 14, [M['panel'], M['steel'], M['black'], M['glass']], rng, out,
           avoid=[(*SPOT['crate'], 1.0), (fu, fv, 0.9), (*SPOT['npc'], 0.7)])
    stain(-11.6, 3.2, 0.7, M['frostd'], out); stain(-18.0, 3.4, 0.6, M['frostd'], out)
    # a floor plate lifted by something from below, propped against the debris
    out.append(cbox('lifted', -17.3, 1.0, 0.95, 0.95, 0.03, 0.035, M['plates'][1], bevel=0.012, rotz=0.3))
    out[-1].rotation_euler.x = math.radians(14)
    # core room: claw marks on the wall and a slime nest where the intruder sleeps (SPOT.alien)
    v = K_[1]
    wall_screen(-22.0, v, 0.8, 1.6, 0.55, M, out, M['screen_dead'])
    out.append(ubox('scr_err', -22.7, v + 0.085, -22.45, v + 0.09, 1.15, 1.25, emit_mat('err', '#ff3a2a', 0.6, base='#401010'), bevel=0))
    for k in range(4):                                                   # claw gouges on the left wall section
        u = -24.4 + k * 0.12
        g = mn.box('gouge', (0.035, 0.03, 0.55), loc=P(u, v + 0.03, 0.35), m=M['black'], bevel=0, rot=(0, math.radians(18) * S, 0)); out.append(g)
    au, av = SPOT['alien']
    stain(au, av, 0.9, M['slime'], out, sv=0.75)
    stain(au - 0.4, av + 0.35, 0.5, M['slime'], out)
    for k in range(9):                                                   # nest: lumpy purple growth around the sleeper
        a = k * math.tau / 9 + rng.uniform(-0.2, 0.2); r = rng.uniform(0.75, 0.95)
        b = mn.sphere('nest', rng.uniform(0.09, 0.15), loc=P(au + math.cos(a) * r, av + math.sin(a) * r * 0.75, FLOOR_Z), m=worn('nestm', '#5a2a6a', 0.25, 0.0, wear=0.0), scale=(1.3, 1, 0.55), segs=16)
        out.append(b)
    for k in range(3):
        out.append(mn.sphere('pod', 0.05, loc=P(au + 0.7 + k * 0.1, av - 0.5 + k * 0.08, FLOOR_Z + 0.03), m=emit_mat('podg', '#9cff5a', 0.8, base='#3a6a20'), segs=12))
    # the black box mount (SPOT.box): an opened floor locker next to where the box lies
    bu, bv = SPOT['box']
    out.append(cbox('bb_well', bu + 0.75, bv, 0.5, 0.5, FLOOR_Z, 0.01, M['black'], bevel=0))
    lid = cbox('bb_lid', bu + 0.75, bv - 0.3, 0.5, 0.05, FLOOR_Z, 0.45, M['hazard'], bevel=0.01); out.append(lid)
    text('bb_t', 'FDR', bu + 0.75, bv + 0.38, FLOOR_Z + 0.003, 0.13, M['sticker'])
    debris(-24.8, -2.6, -19.2, 2.6, 8, [M['panel'], M['steel'], M['black']], rng, out,
           avoid=[(*SPOT['core'], 1.4), (au, av, 1.1), (bu, bv, 0.5)])
    stain(-19.8, 2.2, 0.6, M['frostd'], out)
    # exterior: torn far end with girders and cables (the module was ripped off the station), dish, holes
    zr = H_FULL; u0 = HULLR[0]
    for k, vv in enumerate((-3.6, -2.0, -0.4, 1.2, 2.8)):
        L = rng.uniform(0.5, 1.4)
        z = 0.2 if vv > SPLIT else 0.7
        out.append(ubox('girder', u0 - L, vv - 0.07, u0 + 0.2, vv + 0.07, z, z + 0.14, M['steel'], bevel=0.01))
        out.append(cbox('girder_end', u0 - L, vv, 0.06, 0.24, z - 0.04, 0.22, M['soot'] if False else M['black'], bevel=0.01))
    for vv in (-3.0, -1.0, 2.0):
        out.append(pipe_uv('dangle', [(u0 + 0.1, vv, 0.3), (u0 - 0.4, vv + 0.2, 0.15), (u0 - 0.9, vv + 0.1, -0.2)], 0.035, M['cables'][rng.randrange(3)]))
    out.append(disc('tear_soot', u0 + 0.4, -3.0, zr + 0.003, 0.7, M['soot']))
    du, dv = -7.6, -3.7                                                  # broken antenna dish on the airlock roof
    out.append(ucyl('dish_post', 0.07, 0.5, du, dv, zr, M['steel'], verts=12, bevel=0.01))
    dsh = mn.sphere('dish', 0.55, loc=P(du, dv, zr + 0.55), m=M['panel2'], scale=(1, 1, 0.3), segs=32)
    dsh.rotation_euler = (math.radians(35), math.radians(-20) * S, 0); out.append(dsh)
    out.append(cbox('panel_stub', -21.5, -4.0, 1.4, 0.5, zr, 0.06, M['glass'], bevel=0.01, rotz=0.1))
    for (u, vv, r) in ((-13.2, -4.35, 0.22), (-19.4, 3.9, 0.3), (-6.9, 3.6, 0.25)):
        z = zr if vv < SPLIT else H_LOW
        out.append(disc('hole_soot', u, vv, z + 0.003, r * 2.0, M['soot']))
        out.append(disc('hole', u, vv, z + 0.006, r, M['black']))
        for k in range(6):
            a = k * math.tau / 6 + 0.3
            out.append(cbox('petal', u + math.cos(a) * r, vv + math.sin(a) * r, 0.14, 0.06, z, 0.02, M['hull'], bevel=0, rotz=a))
    v1 = HULLR[3]
    out.append(ubox('trim', HULLR[0] + 0.3, v1 - 0.12, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.06, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'VARGA INSTITUTE  LAB 3', -14.6, v1 - 0.03, -0.2, 0.24, M['white'], face=True)
    text('bio', 'BIOHAZARD', -22.5, v1 - 0.05, H_LOW + 0.003, 0.2, M['sticker'])
    for (u, vv) in ((-8.6, 3.6), (-16.4, 4.4), (-23.0, 3.8)):
        stain(u, vv, 0.6, M['frostd'], out, z=H_LOW + 0.004)
    out.append(mn.sphere('beacon', 0.09, loc=P(HULLR[2] - 0.45, v1 - 0.25, H_LOW + 0.02), m=M['lamp_dead'], segs=16))

# ---------------------------------------------------------------------------------------------------
def build(kind, side):
    mn.reset(); set_side(side)
    rng = random.Random({'pirate': 13, 'brig': 9, 'derelict': 3}[kind])
    M = materials(kind)
    out = []
    structure(kind, M, rng, out)
    {'pirate': build_pirate, 'brig': build_brig, 'derelict': build_derelict}[kind](M, rng, out)
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    rest = [o for o in out if o not in big and not o.name.startswith(('stain', 'soot', 'hole_soot', 'tear_soot', 'em', 'paper', 'thr_hz', 'hz_floor'))]
    mn.outline(big, thickness=0.02)
    mn.outline([o for o in rest if not o.name.startswith(('plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'frv', 'coin', 'tray', 'cable', 'strap', 'link'))], thickness=0.012)
    mn.outline([o for o in rest if o.name.startswith('plate')], thickness=0.008)
    return out

if __name__ == '__main__':
    for kind in KINDS:
        for side in SIDES:
            t0 = time.time()
            objs = build(kind, side)
            name = f'dock/{kind}_{side}' + ('_quick' if QUICK else '')
            if QUICK:
                mn.OUT_DIR = '/tmp/mn_dock'; mn._manifest_put = lambda *a, **k: None
            mn.render(name, objs=objs)
            print(f'[dock] {name} in {time.time() - t0:.0f} s')
