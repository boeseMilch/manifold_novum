"""CONCEPT MOCK-UP (not a game sprite): the repo tug "BIG BERTHA" (Lien & Done Recovery Co.) docked at our
port airlock, for the pitch "Final Notice" (a tractor tug that tows us in and becomes a boarding encounter).

    blender -b --factory-startup --python tools/blender/models/concepts/tug.py -- <out_dir> [cpu]

Reuses the dock kit (models/dock/docklib.py + ships.py: hull, floors, back walls, jambs, engines, claw) on the
standard three-room dock layout, so it would line up with dockGeom() in js/dock.js. Rooms:
  airlock -> CUSTOMER SERVICE (clerk robot, ticket machine, queue, pay kiosk, impound cage)
  cargo   -> WINCH HALL (the cable drum with its gear, the brake lever, repo-drone rack)
  core    -> BEAM ROOM (the tractor generator, the emitter dish on the roof)
The tow cable runs from the drum over the roof to a magnet clamp bitten into our hull.
Writes beauty only, into <out_dir> (never build/renders, never the manifest).
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
import docklib as D
from docklib import *
import ships

A = D.args()
OUT = A[0] if A else '/tmp/tug_concept'
mn.SAMPLES = 24
mn.OUT_DIR = OUT
mn._manifest_put = lambda *a, **k: None
if 'cpu' in A: os.environ['DOCK_CPU'] = '1'


def mats():
    M = ships.materials('pirate')
    M.update(hull=worn('t_hull', '#c09a3a', 0.5, 0.2, wear=0.7, rust=0.06, grime=0.55, scale=0.6),
             hull2=worn('t_hull2', '#3a3628', 0.55, 0.25, rust=0.15),
             trim=stripes_mat('t_trim', '#e8c34f', '#23252b', 2.5, 0.6),
             body=worn('t_body', '#4e4a3e', 0.6, 0.3, rust=0.15),
             panel=worn('t_panel', '#6a6450', 0.5, 0.3, rust=0.2), panel2=worn('t_panel2', '#77705c', 0.45, 0.3, rust=0.15),
             lamp=emit_mat('t_lamp', '#ffe0a8', 1.1, base='#fff0d0'))
    M['plates'] = [worn(f't_plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12) for i, c in
                   enumerate(['#666258', '#625e56', '#6a665c', '#5e5a52'])]
    M['tread'] = worn('t_tread', '#848070', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08)
    M['beam'] = emit_mat('beam', '#8cd2ff', 1.3, base='#4a8ac0')
    M['beam_soft'] = emit_mat('beam_soft', '#8cd2ff', 0.6, base='#3a5a7a')
    M['screen_g'] = emit_mat('screen_g', '#6affb0', 1.0, base='#1a4a30')
    M['digits'] = emit_mat('digits', '#ff4a2a', 1.3, base='#401008')
    M['cable'] = worn('cable', '#2e2c28', 0.75, 0.3, wear=0.3, grime=0.5)
    M['rope'] = worn('rope', '#5a5246', 0.8, 0.2, wear=0.2)
    M['rubber'] = pmat('t_rubber', '#1e2026', 0.85)
    M['clamp'] = worn('clamp_y', '#f0c020', 0.45, 0.2, wear=0.5)
    M['robot'] = worn('robot', '#c8ccd2', 0.4, 0.4, wear=0.5, grime=0.8)
    M['our_hull'] = worn('our_hull', '#8a93a5', 0.5, 0.3, wear=0.5)
    return M


def build_service(M, rng, out):
    """Airlock room (-10.2 .. -5.6, +-2.4): customer service."""
    A_ = ROOMS['airlock']; v = A_[1]
    back_wall(A_[0], A_[2], v, M, rng, out, skip=[(-9.8, -6.0)])
    # the counter, with the clerk robot behind it
    out.append(ubox('counter', -9.7, v + 0.05, -7.3, v + 0.95, 0.0, 0.8, M['body'], bevel=0.04))
    out.append(ubox('counter_top', -9.8, v + 0.0, -7.2, v + 1.05, 0.8, 0.88, M['clamp'], bevel=0.02))
    out.append(ubox('counter_front', -9.6, v + 0.95, -7.4, v + 0.98, 0.15, 0.7, M['panel2'], bevel=0.01))
    text('counter_t', 'CLAIMS', -8.5, v + 0.985, 0.45, 0.16, M['ink'], face=True)
    ru, rv = -8.5, v + 0.35                                         # CLERK-9000
    out.append(ucyl('bot_body', 0.32, 0.65, ru, rv, 0.55, M['robot'], verts=24, bevel=0.04))
    out.append(cbox('bot_head', ru, rv, 0.58, 0.42, 1.22, 0.4, M['robot'], bevel=0.06))
    out.append(ubox('bot_face', ru - 0.22, rv + 0.2, ru + 0.22, rv + 0.23, 1.27, 1.56, M['screen_g'], bevel=0.01))
    text('bot_smile', ': )', ru, rv + 0.235, 1.41, 0.17, M['ink'], face=True)
    out.append(cbox('bot_cap', ru, rv - 0.08, 0.5, 0.3, 1.62, 0.07, M['red'], bevel=0.02))
    out.append(cbox('bot_visor', ru, rv + 0.12, 0.46, 0.12, 1.62, 0.025, M['red'], bevel=0.01))
    out.append(ucyl('bot_ant', 0.02, 0.3, ru + 0.18, rv - 0.1, 1.7, M['steel'], verts=8, bevel=0.004))
    out.append(mn.sphere('bot_ant_tip', 0.05, loc=P(ru + 0.18, rv - 0.1, 2.02), m=M['lamp_amber'], segs=12))
    for su in (-1, 1):                                              # arms: one holds a big stamp
        out.append(pipe_uv('bot_arm', [(ru + su * 0.3, rv, 1.0), (ru + su * 0.55, rv + 0.25, 0.95), (ru + su * 0.5, rv + 0.55, 0.92)], 0.05, M['steel'], corner=0.1))
    out.append(ucyl('stamp_handle', 0.06, 0.2, ru + 0.5, rv + 0.6, 0.98, M['red'], verts=12, bevel=0.01))
    out.append(cbox('stamp_foot', ru + 0.5, rv + 0.6, 0.26, 0.18, 0.88, 0.1, M['dark'], bevel=0.01))
    for (u, d) in ((-9.35, 0.0), (-9.1, 0.08), (-7.7, 0.02)):           # paperwork stacks
        for k in range(4):
            out.append(cbox('form', u, v + 0.6 + d, 0.26, 0.32, 0.88 + k * 0.025, 0.02, M['paper'], bevel=0, rotz=rng.uniform(-0.2, 0.2)))
    # NOW SERVING display above the counter, and the wall plaques
    out.append(ubox('ns_box', -9.4, v, -7.6, v + 0.08, 1.75, 2.15, M['dark'], bevel=0.02))
    text('ns_t', 'NOW SERVING', -8.5, v + 0.085, 2.06, 0.1, M['white'], face=True)
    text('ns_d', '03', -8.5, v + 0.085, 1.88, 0.18, M['digits'], face=True)
    out.append(ubox('eotm', -7.05, v, -6.2, v + 0.03, 0.95, 1.5, M['gold'], bevel=0.01))
    out.append(ubox('eotm_pic', -6.9, v + 0.03, -6.35, v + 0.04, 1.1, 1.4, M['screen_g'], bevel=0))
    text('eotm_t', 'EMPLOYEE', -6.62, v + 0.045, 1.02, 0.065, M['ink'], face=True)
    # ticket machine (TAKE A NUMBER)
    tu, tv = -6.45, v + 0.55
    out.append(ucyl('tk_post', 0.05, 0.9, tu, tv, 0.0, M['steel'], verts=12, bevel=0.01))
    out.append(cbox('tk_box', tu, tv, 0.36, 0.3, 0.9, 0.34, M['red'], bevel=0.04))
    out.append(cbox('tk_slot', tu, tv + 0.16, 0.18, 0.03, 1.0, 0.04, M['black'], bevel=0))
    out.append(cbox('tk_paper', tu, tv + 0.2, 0.12, 0.08, 0.92, 0.1, M['paper'], bevel=0))
    text('tk_t', 'TAKE A No.', tu, tv + 0.16, 1.15, 0.06, M['white'], face=True)
    # queue: stanchions with a red belt, a 'WAIT HERE' line on the floor
    posts = [(-9.6, -0.9), (-8.7, -0.9), (-7.8, -0.9), (-6.9, -0.9)]
    for (u, vv) in posts:
        out.append(ucyl('st_base', 0.14, 0.04, u, vv, FLOOR_Z, M['dark'], verts=16, bevel=0.01))
        out.append(ucyl('st_post', 0.035, 0.85, u, vv, FLOOR_Z, M['steel'], verts=12, bevel=0.006))
        out.append(mn.sphere('st_top', 0.05, loc=P(u, vv, 0.9), m=M['steel'], segs=12))
    for (a, b) in zip(posts, posts[1:]):
        out.append(pipe_uv('st_belt', [(a[0], a[1], 0.8), ((a[0] + b[0]) / 2, a[1], 0.72), (b[0], b[1], 0.8)], 0.025, M['red'], corner=0.3))
    out.append(ubox('wait_line', -9.8, -0.45, -6.4, -0.38, FLOOR_Z, FLOOR_Z + 0.006, M['sticker'], bevel=0))
    text('wait_t', 'PLEASE WAIT BEHIND THE LINE', -8.1, -0.18, FLOOR_Z + 0.007, 0.15, M['sticker'])
    # pay kiosk (settle the bill)
    ku, kv = -6.35, 1.75
    out.append(cbox('kiosk', ku, kv, 0.5, 0.42, 0.0, 1.05, M['clamp'], bevel=0.04))
    out.append(ubox('kiosk_scr', ku - 0.18, kv + 0.21, ku + 0.18, kv + 0.23, 0.62, 0.92, M['screen_g'], bevel=0.005))
    text('kiosk_t', 'PAY', ku, kv + 0.235, 0.77, 0.12, M['ink'], face=True)
    out.append(cbox('kiosk_slot', ku, kv + 0.22, 0.24, 0.04, 0.42, 0.04, M['black'], bevel=0))
    # impound cage, SW corner (the cat goes in here)
    cu0, cv0, cu1, cv1 = -10.05, 0.75, -8.65, 2.25
    out.append(ubox('cage_floor', cu0, cv0, cu1, cv1, FLOOR_Z, FLOOR_Z + 0.03, M['bar'], bevel=0.01))
    for (a0, b0, a1, b1) in ((cu0, cv0, cu1, cv0 + 0.06), (cu0, cv1 - 0.06, cu1, cv1), (cu0, cv0, cu0 + 0.06, cv1), (cu1 - 0.06, cv0, cu1, cv1)):
        out.append(ubox('cage_top', a0, b0, a1, b1, 0.95, 0.99, M['bar'], bevel=0.01))
    n = 9
    for i in range(n + 1):
        u = cu0 + 0.03 + i * (cu1 - cu0 - 0.06) / n
        for vv in (cv0 + 0.03, cv1 - 0.03):
            out.append(ucyl('cbar', 0.018, 0.95, u, vv, 0.0, M['steel'], verts=8, bevel=0.004))
    for j in range(1, 7):
        vv = cv0 + j * (cv1 - cv0) / 7
        out.append(ucyl('cbar', 0.018, 0.95, cu1 - 0.03, vv, 0.0, M['steel'], verts=8, bevel=0.004))
    out.append(ubox('cage_sign', cu0 + 0.15, cv1 - 0.02, cu1 - 0.15, cv1 + 0.0, 0.62, 0.86, M['sticker'], bevel=0.003))
    text('cage_t', 'IMPOUND', (cu0 + cu1) / 2, cv1 + 0.005, 0.74, 0.11, M['ink'], face=True)
    out.append(cbox('bowl', -9.75, 1.95, 0.22, 0.22, FLOOR_Z + 0.03, 0.06, M['red'], bevel=0.02))
    # entry: hazard band by the outer door
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    debris(-10.0, -0.3, -6.6, 0.6, 5, [M['paper']], rng, out, avoid=[(-7.9, 0, 0.6)])


def gear(name, u, v, z, r, teeth, w, m, out):
    """A spur gear standing in the u-z plane? no: in the v-z plane (axis along u), facing the camera side."""
    out.append(ucyl(name, r, w, u, v, z, m, axis='u', verts=48, bevel=0.02))
    out[-1].location = P(u, v, z)
    for k in range(teeth):
        a = k * math.tau / teeth
        t = mn.box(name + '_tooth', (w, 0.16, 0.2), loc=(0, 0, 0), m=m, bevel=0.015)
        t.location = P(u + w / 2, v + math.cos(a) * (r + 0.02), z + math.sin(a) * (r + 0.02))
        t.rotation_euler = (math.pi / 2 - a, 0, 0)                                  # tooth radial in the v-z plane
        out.append(t)


def build_winch(M, rng, out):
    """Cargo (-18.4 .. -10.8, +-4): the winch hall."""
    C_ = ROOMS['cargo']; v = C_[1]
    back_wall(C_[0], C_[2], v, M, rng, out, skip=[(-17.6, -11.4)])
    # the drum: axis along u, on two frames, wound with cable
    du0, du1, dv, dz, dr = -16.9, -12.7, -2.75, 1.25, 1.0
    for u in (du0 - 0.25, du1 + 0.05):
        out.append(ubox('frame', u, dv - 0.9, u + 0.2, dv + 0.9, 0.0, 0.25, M['hull2'], bevel=0.03))
        out.append(prism('frame_a', [(dv - 0.85, 0), (dv + 0.85, 0), (dv + 0.2, dz + 0.1), (dv - 0.2, dz + 0.1)], 0, 0, None, bevel=0) if False else
                   ubox('frame_up', u + 0.02, dv - 0.22, u + 0.18, dv + 0.22, 0.2, dz + 0.25, M['hull2'], bevel=0.03))
        out.append(ucyl('axle_cap', 0.24, 0.24, u - 0.02, dv, dz, M['steel'], axis='u', verts=24, bevel=0.03))
        out[-1].location = P(u - 0.02, dv, dz)
    out.append(ucyl('drum_core', dr - 0.12, du1 - du0, du0, dv, dz, M['dark'], axis='u', verts=48, bevel=0.02))
    out[-1].location = P(du0, dv, dz)
    for u in (du0, du1 - 0.12):                                    # drum flanges, hazard striped rims
        out.append(ucyl('flange', dr + 0.18, 0.12, u, dv, dz, M['clamp'], axis='u', verts=48, bevel=0.025))
        out[-1].location = P(u, dv, dz)
    x = du0 + 0.16                                                  # wound cable: a ring per turn
    while x < du1 - 0.16:
        t = D.ring('wrap', dr - 0.02, 0.13, 0.085, loc=P(x, dv, dz), m=M['cable'], rot=(0, R90, 0), verts=48)
        out.append(t); x += 0.088
    # the gearbox on the near (east) end: a big flat gear driven off the drum shaft, half under a guard;
    # the open half is the jam point (the "spanner in the works" mini-game)
    gu, gv, gz = -11.85, -2.55, 0.62
    out.append(ubox('gbox', gu - 0.95, gv - 1.3, gu + 0.95, gv + 0.95, 0.0, gz - 0.02, M['hull2'], bevel=0.05))
    out.append(ucyl('shaft', 0.16, 0.9, du1 - 0.05, dv, dz, M['steel'], axis='u', verts=20, bevel=0.02))
    out.append(ucyl('shaft_down', 0.14, dz - gz, gu - 0.6, dv, gz, M['steel'], verts=16, bevel=0.02))
    out.append(ucyl('gear', 0.78, 0.14, gu, gv, gz, M['steel'], verts=48, bevel=0.02))
    for k in range(16):
        a = k * math.tau / 16
        out.append(cbox('gear_tooth', gu + math.cos(a) * 0.84, gv + math.sin(a) * 0.84, 0.2, 0.16, gz, 0.14, M['steel'], bevel=0.02, rotz=a))
    for k in range(5):
        a = k * math.tau / 5
        out.append(cbox('gear_hole', gu + math.cos(a) * 0.45, gv + math.sin(a) * 0.45, 0.2, 0.2, gz + 0.141, 0.004, M['black'], bevel=0, rotz=a))
    out.append(ucyl('gear_hub', 0.2, 0.22, gu, gv, gz, M['clamp'], verts=24, bevel=0.03))
    out.append(prism('guard', [(gu - 1.0, gv - 1.15), (gu + 1.0, gv - 1.15), (gu + 1.0, gv - 0.1), (gu - 1.0, gv - 0.1)], gz + 0.16, gz + 0.22, M['trim'], bevel=0.02))
    for su in (-1, 1): out.append(ubox('guard_leg', gu + su * 0.95 - 0.04, gv - 1.1, gu + su * 0.95 + 0.04, gv - 0.15, 0.0, gz + 0.16, M['hull2'], bevel=0.01))
    out.append(cbox('wrench', gu + 0.15, gv + 0.75, 0.13, 0.85, gz + 0.12, 0.05, M['steel'], bevel=0.015, rotz=0.5))
    out.append(ucyl('wrench_jaw', 0.1, 0.05, gu + 0.36, gv + 1.12, gz + 0.12, M['steel'], verts=12, bevel=0.01))
    text('jam_t', 'NO HANDS', gu, gv + 1.3, FLOOR_Z + 0.004, 0.13, M['sticker'])
    # cable leaving the drum's top, up through a roof hole, along the roof to the near end and out
    rz = H_FULL
    path = [(du1 - 0.6, dv, dz + dr), (du1 - 0.6, dv - 0.5, dz + dr + 0.35), (du1 - 0.6, -4.35, rz + 0.25),
            (-9.0, -4.35, rz + 0.25), (-5.2, -4.35, rz + 0.25)]
    out.append(pipe_uv('tow_cable', path, 0.1, M['cable'], corner=0.5))
    for u in (-12.0, -9.0, -6.2):                                   # cable guide rollers on the roof
        out.append(cbox('roller_base', u, -4.35, 0.36, 0.5, rz, 0.16, M['hull2'], bevel=0.03))
        out.append(ucyl('roller', 0.12, 0.42, u, -4.56, rz + 0.25, M['clamp'], axis='v', verts=16, bevel=0.02))
        out[-1].location = P(u, -4.56, rz + 0.25)
    # brake lever (the duct-tape job): a tall hazard lever by the gear, taped down
    lu, lv = -13.4, -0.9
    out.append(cbox('brake_base', lu, lv, 0.5, 0.4, 0.0, 0.3, M['hull2'], bevel=0.04))
    lev = cbox('brake_lever', lu, lv, 0.1, 0.1, 0.25, 1.1, M['red'], bevel=0.02); lev.rotation_euler.x = math.radians(-50); out.append(lev)
    out.append(mn.sphere('brake_knob', 0.11, loc=P(lu, lv + 0.84, 0.25 + 0.7), m=M['red'], segs=16))
    for k in range(3):                                              # tape wrapped round lever and base
        tb = cbox('tape_wrap', lu, lv + 0.3 + k * 0.12, 0.2, 0.1, 0.25 + 0.2 + k * 0.08, 0.13, M['tape'], bevel=0.01, rotz=0.25 * (k - 1))
        tb.rotation_euler.x = math.radians(-50); out.append(tb)
    out.append(cbox('tape_end', lu + 0.15, lv + 0.45, 0.12, 0.45, FLOOR_Z, 0.008, M['tape'], bevel=0.002, rotz=0.6))
    out.append(ucyl('tape_roll', 0.13, 0.09, lu + 0.45, lv + 0.6, FLOOR_Z, M['tape'], verts=20, bevel=0.02))
    out.append(ucyl('tape_hole', 0.06, 0.092, lu + 0.45, lv + 0.6, FLOOR_Z, M['dark'], verts=16, bevel=0))
    text('brake_t', 'BRAKE', lu - 0.55, lv + 0.1, FLOOR_Z + 0.004, 0.14, M['sticker'])
    # keep-clear hazard paint around the drum
    out.append(ubox('kc_line', du0 - 0.4, -1.45, -12.95, -1.35, FLOOR_Z, FLOOR_Z + 0.006, M['hazard'], bevel=0))
    text('kc_t', 'KEEP CLEAR OF DRUM', -14.8, -1.15, FLOOR_Z + 0.007, 0.17, M['sticker'])
    text('ml_t', 'MAX LOAD: YES', -14.6, 2.9, FLOOR_Z + 0.003, 0.36, M['sticker'])
    # repo drone rack (SW): three clamp drones charging, spare wheel clamps
    for i, u in enumerate((-17.8, -17.0, -16.2)):
        vv = 3.2
        out.append(cbox('pad', u, vv, 0.62, 0.62, FLOOR_Z, 0.03, M['trim'], bevel=0.01))
        if i == 2: continue                                         # one drone is out (on our ship)
        out.append(cbox('drone', u, vv, 0.56, 0.48, 0.1, 0.3, M['clamp'], bevel=0.09))
        out.append(cbox('drone_eye', u, vv + 0.24, 0.3, 0.03, 0.24, 0.08, M['digits'], bevel=0.01))
        out.append(cbox('drone_boot', u, vv - 0.05, 0.36, 0.2, 0.4, 0.12, M['trim'], bevel=0.03))
        for su in (-1, 1):
            for sv in (-1, 1):
                out.append(ucyl('wheel', 0.09, 0.06, u + su * 0.2, vv + sv * 0.15, 0.09, M['rubber'], axis='u', verts=16, bevel=0.01))
                out[-1].location = P(u + su * 0.2 - 0.03, vv + sv * 0.15, 0.09)
        out.append(mn.sphere('drone_beacon', 0.07, loc=P(u + 0.18, vv - 0.1, 0.45), m=M['lamp_amber'], segs=12))
    text('rack_t', 'REPO UNITS', -17.0, 3.75, FLOOR_Z + 0.004, 0.14, M['sticker'])
    for k in range(3):                                              # spare wheel clamps ("boots") by the east wall
        u = -11.45; vv = 2.3 + k * 0.6
        out.append(cbox('boot_plate', u, vv, 0.42, 0.12, FLOOR_Z, 0.5, M['clamp'], bevel=0.03))
        out.append(pipe_uv('boot_arm', [(u - 0.18, vv + 0.06, 0.45), (u - 0.18, vv + 0.3, 0.45), (u + 0.18, vv + 0.3, 0.45), (u + 0.18, vv + 0.06, 0.45)], 0.045, M['clamp'], corner=0.1))
        out.append(cbox('boot_lock', u, vv + 0.08, 0.14, 0.06, 0.18, 0.16, M['red'], bevel=0.02))
    text('boots_t', 'CLAMPS', -11.45, 4.15 - 0.25, FLOOR_Z + 0.004, 0.12, M['sticker'])
    # back-wall plaque
    out.append(ubox('plaque', -18.25, v, -17.7, v + 0.02, 1.0, 1.5, M['sticker'], bevel=0.003))
    text('plaque_t', 'WE\nBRAKE\nFOR\nNOBODY', -17.97, v + 0.025, 1.25, 0.07, M['ink'], face=True)
    stain(-13.6, -0.6, 0.5, M['oil'], out, sv=0.6)
    stain(-15.8, 0.4, 0.35, M['oil'], out)
    debris(-18.2, -0.9, -11.0, 3.8, 9, [M['scrap'], M['steel'], M['black']], rng, out,
           avoid=[(-14.6, 2.9, 1.6), (-17.0, 3.2, 1.3), (-11.6, 3.0, 0.6), (*SPOT['npc'], 0.6)])


def build_beam(M, rng, out):
    """Core (-25 .. -19, +-2.8): the beam room with the tractor generator."""
    K_ = ROOMS['core']; v = K_[1]
    back_wall(K_[0], K_[2], v, M, rng, out, skip=[(-23.2, -20.8)])
    gu, gv = -22.0, -1.2
    out.append(ucyl('gen_base', 0.95, 0.3, gu, gv, 0.0, M['hull2'], verts=40, bevel=0.04))
    out.append(D.ring('gen_rim', 0.98, 0.1, 0.06, loc=P(gu, gv, 0.3), m=M['clamp']))
    out.append(mn.cyl('gen_glass', 0.42, 1.45, loc=P(gu, gv, 0.3), m=M['glass'], verts=32, bevel=0.01))
    out.append(ucyl('gen_core', 0.22, 1.4, gu, gv, 0.32, M['beam'], verts=24, bevel=0))
    for k in range(6):                                              # copper coil rings around the core
        out.append(D.ring('coil', 0.52, 0.09, 0.09, loc=P(gu, gv, 0.45 + k * 0.2), m=M['copper']))
    out.append(ucyl('gen_cap', 0.6, 0.2, gu, gv, 1.75, M['hull2'], verts=32, bevel=0.04))
    out.append(ucyl('gen_mast', 0.16, 0.5, gu, gv, 1.95, M['steel'], verts=16, bevel=0.02))
    for k, a in enumerate((0.6, 2.6, 4.4)):                          # capacitor cans
        cu, cv = gu + math.cos(a) * 1.3, gv + math.sin(a) * 0.9
        if cv > 0.0: continue
        out.append(ucyl('capcan', 0.22, 0.85, cu, cv, 0.0, M['body'], verts=20, bevel=0.03))
        out.append(D.ring('capband', 0.23, 0.04, 0.1, loc=P(cu, cv, 0.6), m=M['beam_soft']))
    # overload panel (the repair-kit job), facing the room
    out.append(cbox('ovl_panel', -20.2, -0.2, 0.6, 0.35, 0.0, 1.0, M['trim'], bevel=0.04))
    out.append(ubox('ovl_face', -20.42, -0.03, -19.98, -0.01, 0.55, 0.9, M['digits'], bevel=0.005))
    text('ovl_t', 'DO NOT\nOVERLOAD', -20.2, 0.0, 0.42, 0.06, M['white'], face=True)
    out.append(ubox('warn', -24.6, v, -23.4, v + 0.02, 1.0, 1.5, M['sticker'], bevel=0.003))
    text('warn_t', 'DO NOT STARE\nINTO BEAM WITH\nREMAINING EYE', -24.0, v + 0.025, 1.25, 0.06, M['ink'], face=True)
    for k in range(3):                                              # power cables from the generator to the wall
        a = -2.4 + k * 0.4
        out.append(pipe_uv('gcable', [(gu + 0.4 + k * 0.1, gv + 0.5, FLOOR_Z + 0.03), (-20.8 + k * 0.1, 0.4, FLOOR_Z + 0.03), (-19.4, 0.6 + k * 0.15, FLOOR_Z + 0.03)], 0.045, M['cables'][k], corner=0.4))
    stain(-23.4, 1.4, 0.5, M['oil'], out, sv=0.6)
    out.append(cbox('mug', -24.4, 2.2, 0.16, 0.16, FLOOR_Z, 0.18, M['white'], bevel=0.02))


def build_exterior(M, rng, out):
    zr = H_FULL
    # the emitter dish on the core roof, aimed at us (east)
    eu, ev = -22.0, -3.9
    out.append(ucyl('dish_post', 0.25, 0.7, eu, ev, zr, M['hull2'], verts=20, bevel=0.03))
    dsh = mn.sphere('dish_dish', 1.05, loc=P(eu + 0.1, ev, zr + 1.0), m=M['steel'], scale=(0.35, 1, 1), segs=32); out.append(dsh)
    out.append(mn.sphere('dish_glow', 0.55, loc=P(eu + 0.32, ev, zr + 1.0), m=M['beam'], scale=(0.3, 1, 1), segs=24))
    out.append(ucyl('dish_horn', 0.1, 0.6, eu + 0.3, ev, zr + 1.0, M['beam'], axis='u', verts=16, bevel=0.01))
    out[-1].location = P(eu + 0.3, ev, zr + 1.0)
    out.append(D.ring('dish_ring', 1.08, 0.12, 0.12, loc=P(eu + 0.05, ev, zr + 1.0), m=M['clamp'], rot=(0, R90, 0)))
    # radiator fins + warning beacons on the roof
    for k in range(4):
        u = -24.8 + k * 0.45
        out.append(ubox('fin', u - 0.05, -4.45, u + 0.05, -3.2, zr, zr + 0.35, M['steel'], bevel=0.015))
    for u in (-19.4, -10.4):
        out.append(ucyl('beacon_base', 0.16, 0.12, u, -4.0, zr, M['hull2'], verts=16, bevel=0.02))
        out.append(mn.sphere('beacon', 0.13, loc=P(u, -4.0, zr + 0.2), m=M['lamp_amber'], segs=16))
    # big tow hook on the near end, under the cable (decorative)
    out.append(ubox('bumper', HULLR[2] - 0.15, -4.5, HULLR[2] + 0.35, -1.0, 0.1, 1.1, M['rubber'], bevel=0.12))
    # tyre fenders hanging on the front (south) face: the tugboat look
    v1 = HULLR[3]
    for u in (-23.2, -17.6, -12.0, -7.8):
        t = D.ring('tyre', 0.42, 0.18, 0.22, loc=P(u, v1 + 0.24, -0.12), m=M['rubber'], rot=(R90, 0, 0), verts=32)
        out.append(t)
        out.append(pipe_uv('tyre_rope', [(u - 0.12, v1 - 0.05, H_LOW), (u, v1 + 0.15, 0.3)], 0.025, M['rope'], corner=0.1))
    out.append(ubox('trim', HULLR[0] + 0.3, v1 - 0.12, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.06, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'LIEN & DONE RECOVERY CO.', -15.0, v1 - 0.03, -0.22, 0.26, M['sticker'], face=True)
    text('reg', 'TUG 7  "BIG BERTHA"', -15.0, v1 - 0.25, H_LOW + 0.003, 0.2, M['ink'])
    for u, m in ((HULLR[0] + 0.45, M['lamp_red']), (HULLR[2] - 0.45, M['lamp_em'])):
        out.append(mn.sphere('nav', 0.07, loc=P(u, v1 - 0.25, H_LOW + 0.02), m=m, segs=16))
    ships.engines(M, out, emit_mat('eng_glow', '#ffb35c', 1.2, base='#ff9040'), v_list=(-2.6, 2.6))
    ships.claw(M, out)


def build_our_side(M, rng, out):
    """A stand-in slab for our hull face north of the tube, with the tow cable's magnet clamp bitten in.
    (The key art composites the real hull sprites over this; it only catches the cable's end and shadow.)"""
    rz = H_FULL
    # cable from the tug's near end across the gap, sagging, to a magnet clamp on our hull at u ~ +0.3
    path = [(-5.2, -4.35, rz + 0.25), (-4.2, -4.1, rz + 0.1), (-2.2, -3.6, 0.95), (-0.4, -3.2, 0.9)]
    out.append(pipe_uv('tow_span', path, 0.1, M['cable'], corner=1.0))
    mu, mv = -0.15, -3.2
    out.append(cbox('mag_body', mu, mv, 0.55, 0.8, 0.4, 1.0, M['clamp'], bevel=0.06))
    out.append(cbox('mag_face', mu + 0.3, mv, 0.1, 0.9, 0.35, 1.1, M['dark'], bevel=0.03))
    out.append(cbox('mag_stripe', mu - 0.02, mv + 0.41, 0.5, 0.02, 0.7, 0.25, M['hazard'], bevel=0.003))
    out.append(D.ring('mag_eye', 0.16, 0.06, 0.1, loc=P(mu - 0.3, mv, 0.9), m=M['steel'], rot=(0, R90, 0)))


def build():
    mn.reset(); set_side('port')
    rng = random.Random(7)
    M = mats()
    out = []
    ships.structure('pirate', M, rng, out)
    build_service(M, rng, out); build_winch(M, rng, out); build_beam(M, rng, out)
    build_exterior(M, rng, out); build_our_side(M, rng, out)
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    rest = [o for o in out if o not in big and not o.name.startswith(('stain', 'soot', 'em', 'paper', 'thr_hz', 'hz_floor', 'kc_', 'wait_', 'text', 'tape_end'))]
    mn.outline(big, thickness=0.02)
    mn.outline([o for o in rest if not o.name.startswith(('plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'frv', 'wrap', 'tray', 'cable', 'strap', 'form', 'coil'))], thickness=0.012)
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    objs = build()
    mn.render('tug_keyart_raw', objs=objs, passes=('beauty',))
