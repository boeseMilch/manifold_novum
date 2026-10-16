"""CONCEPT MOCK-UP (not a game sprite): the Red Comet prison barge with the CELL-O-MATIC, a revolving cell drum.

    blender -b --factory-startup --python tools/blender/models/concepts/barge.py -- [out_dir] [samples]

Reuses the dock-ship kit (models/dock/docklib.py, ships.py: hull, floors, walls, engines, claw, brig materials)
and replaces the barge's cargo-hold cells with the drum: a fixed bar cage with ONE gate (south, towards the
camera), a turntable with six wedge cells inside it, a hub with the riot lamps on top, a drive shaft through the
door to the crank wheel in the core room. Renders the port side, beauty pass only, to out_dir (never to
build/renders, never touches the manifest). Prints the origin (the hatch point) so a PIL step can paste the
characters at game coordinates.
"""
import sys, os, math, random, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
_argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sys.argv = sys.argv[:sys.argv.index('--')] if '--' in sys.argv else sys.argv   # ships.py parses '--' args on import
import docklib as D
from docklib import *
import ships

OUT = _argv[0] if _argv else '/tmp/mn_concepts/barge'
SAMPLES = int(_argv[1]) if len(_argv) > 1 else 24
mn.SAMPLES = SAMPLES
if os.environ.get('DOCK_CPU'): pass   # (docklib's reset hook switches to CPU)

# the drum (game coords relative to the hatch, port layout)
CU, CV, RD = -14.6, -0.7, 2.3           # centre, cage radius
HUB = 0.42
OCC = ['convict', 'varga', 'goat', 'tunnel', 'cat', 'tape']   # wedge k is centred at game angle 90 + 60k (k = 0: at the gate)

def pt(r, deg):
    a = math.radians(deg); return (CU + r * math.cos(a), CV + r * math.sin(a))

def mats(M):
    M['orange'] = worn('orange', '#e07a2a', 0.55, 0.0, wear=0.5, grime=0.6)
    M['goat'] = worn('goatfur', '#e8e2d2', 0.85, 0.0, wear=0.2, grime=0.5)
    M['horn'] = worn('horn', '#8a7a5a', 0.5, 0.0, wear=0.3)
    M['wedge'] = [worn(f'wedge{i}', c, 0.55, 0.2, wear=0.6, grime=0.8) for i, c in enumerate(['#4a4a40', '#3e3e36'])]
    M['num'] = pmat('num', '#e8c34f', 0.6)
    M['riot_on'] = emit_mat('riot_on', '#ff3a2a', 1.5, base='#ff6a50')
    M['riot_off'] = pmat('riot_off', '#4a1a16', 0.3)
    M['dial'] = emit_mat('dial', '#9cff7a', 1.1, base='#30602a')
    M['mug'] = emit_mat('mug', '#8ad8ff', 0.9, base='#204060')
    M['tapeg'] = worn('tapeg', '#b9bcc2', 0.8, 0.0, wear=0.2, grime=0.3)
    return M

def drum(M, rng, out):
    z0 = FLOOR_Z
    # base ring (fixed) with a hazard band, turntable on top
    out.append(ucyl('drum_base', RD + 0.18, 0.08, CU, CV, z0, M['hull2'], verts=64, bevel=0.02))
    out.append(D.ring('drum_hz', RD + 0.16, 0.14, 0.012, loc=P(CU, CV, z0 + 0.08), m=M['hazard'], verts=64))
    out.append(ucyl('turntable', RD - 0.02, 0.05, CU, CV, z0 + 0.06, M['steel'], verts=64, bevel=0.01))
    zt = z0 + 0.11
    for k in range(6):                                           # wedge floor plates, numbered
        a0, a1 = 90 + 60 * k - 29, 90 + 60 * k + 29
        pts = [pt(HUB + 0.05, a0)] + [pt(RD - 0.08, a0 + (a1 - a0) * i / 10) for i in range(11)] + [pt(HUB + 0.05, a1)]
        out.append(prism('wedge', pts, zt, zt + 0.012, M['wedge'][k % 2], bevel=0.004))
        nu, nv = pt(RD - 0.45, 90 + 60 * k)
        out.append(text('cellnum', str(k + 1), nu, nv, zt + 0.014, 0.42, M['num']))
    # radial walls (turn with the drum): low steel plates with a hazard cap
    for k in range(6):
        a = 90 + 60 * k + 30
        mu, mv = pt((HUB + RD) / 2, a)
        out.append(cbox('rwall', mu, mv, RD - HUB - 0.05, 0.07, zt, 0.45, M['panel'], bevel=0.015, rotz=a))
        out.append(cbox('rwall_cap', mu, mv, RD - HUB - 0.05, 0.09, zt + 0.45, 0.04, M['gold'], bevel=0.01, rotz=a))
        for r in (0.9, 1.5): ru, rv = pt(r, a); out.append(rivet(ru, rv, zt + 0.49, M['steel'], 0.025))
    # the fixed cage: bars all round except the gate (south, 90 deg +- 26)
    zc = z0 + 0.08
    for i in range(72):
        a = i * 5
        if abs(((a - 90 + 180) % 360) - 180) < 26: continue
        bu, bv = pt(RD + 0.05, a)
        out.append(ucyl('bar', 0.028, 1.05, bu, bv, zc, M['steel'], verts=8, bevel=0.005))
    for z in (1.12,):
        o = D.ring('cage_hoop', RD + 0.1, 0.1, 0.06, loc=P(CU, CV, zc + z), m=M['rim'], verts=72)
        out.append(o)
    # cut the hoops at the gate: cover with gate posts and a slid-open gate
    for a in (90 - 27, 90 + 27):
        gu, gv = pt(RD + 0.08, a)
        out.append(cbox('gate_post', gu, gv, 0.16, 0.16, zc, 1.3, M['hazard'], bevel=0.02))
        out.append(ucyl('gate_lamp', 0.07, 0.06, gu, gv, zc + 1.3, M['lamp_red'] if a < 90 else M['lamp_em'], verts=12, bevel=0.01))
    for j in range(5):                                           # the gate leaf, slid aside (open): a second row of bars
        lu, lv = pt(RD + 0.24, 90 + 30 + j * 5)
        out.append(ucyl('gate_bar', 0.026, 1.08, lu, lv, zc + 0.02, M['steel'], verts=8, bevel=0.004))
    # hub column: the CELL-O-MATIC, riot lamps on top
    out.append(ucyl('hub', HUB, 1.55, CU, CV, zt, M['body'], verts=32, bevel=0.03))
    out.append(ucyl('hub_band', HUB + 0.02, 0.16, CU, CV, zt + 0.5, M['hazard'], verts=32, bevel=0.01))
    out.append(ucyl('hub_cap', HUB + 0.06, 0.1, CU, CV, zt + 1.55, M['hull2'], verts=32, bevel=0.02))
    for j, on in enumerate((True, True, False)):                 # riot meter: 2 of 3 lit
        a = 200 + j * 70
        lu, lv = CU + 0.24 * math.cos(math.radians(a)), CV + 0.24 * math.sin(math.radians(a))
        out.append(mn.sphere('riot', 0.11, loc=P(lu, lv, zt + 1.72), m=M['riot_on'] if on else M['riot_off'], segs=16))
    text('hub_label', 'CELL-O-MATIC', CU, CV + HUB + 0.005, zt + 1.05, 0.11, M['white'], face=True)
    tape(CU - 0.1, CV + HUB + 0.01, zt + 0.82, 0.5, M['tape'], out, rotz=0.4)
    # drive shaft: from the hub through the cargo-core door to the crank (covered, hazard)
    out.append(ubox('shaft_cover', -21.0, CV - 0.14, CU - HUB, CV + 0.14, FLOOR_Z, FLOOR_Z + 0.12, M['hazard'], bevel=0.03))
    for u in (-20.2, -18.7, -17.2): out.append(ubox('shaft_clamp', u - 0.06, CV - 0.18, u + 0.06, CV + 0.18, FLOOR_Z, FLOOR_Z + 0.15, M['steel'], bevel=0.01))

def occupants(M, rng, out):
    zt = FLOOR_Z + 0.11
    # 3: the space goat (wedge k=2, NW)
    gu, gv = pt(1.4, 90 + 120)
    S_ = 1.35; n0 = len(out)
    out.append(cbox('goat_body', gu, gv, 0.62, 0.32, zt + 0.28, 0.3, M['goat'], bevel=0.12, rotz=20))
    for du, dv in ((-0.22, -0.1), (-0.22, 0.12), (0.2, -0.1), (0.2, 0.12)):
        out.append(ucyl('goat_leg', 0.04, 0.3, gu + du, gv + dv, zt, M['goat'], verts=8, bevel=0.01))
    hu, hv = gu + 0.38, gv + 0.12
    out.append(mn.sphere('goat_head', 0.15, loc=P(hu, hv, zt + 0.66), m=M['goat'], scale=(1.3, 0.9, 1), segs=16))
    for s in (-1, 1):
        o = mn.cyl('horn', 0.035, 0.24, loc=P(hu - 0.05, hv + s * 0.07, zt + 0.76), m=M['horn'], verts=8, bevel=0.01, rot=(s * 0.4, -0.5, 0)); out.append(o)
    out.append(cbox('goat_beard', hu + 0.14, hv, 0.06, 0.06, zt + 0.44, 0.1, M['horn'], bevel=0.02))
    out.append(cbox('goat_tape', hu + 0.2, hv, 0.12, 0.2, zt + 0.55, 0.04, M['tape'], bevel=0.01, rotz=10))   # (eating the tape)
    c = P(gu, gv, zt)
    for o in out[n0:]:                                           # a bigger goat reads better at game scale
        o.location = c + (o.location - c) * S_; o.scale = o.scale * S_
    # 5: contraband duct tape (wedge k=5, SE): a pile of rolls
    tu, tv = pt(1.35, 90 + 300)
    for i in range(9):
        du, dv = rng.uniform(-0.35, 0.35), rng.uniform(-0.25, 0.25); z = zt + (0.0 if i < 6 else 0.1)
        out.append(D.ring('tape_roll', 0.13, 0.07, 0.09, loc=P(tu + du, tv + dv, z), m=M['tapeg'], verts=20))
    text('confisc', 'CONFISCATED', tu, tv + 0.5, zt + 0.02, 0.12, M['sticker'], rotz=math.radians(-25))
    # the tunnel (wedge k=3, N, behind the hub; the cat sits in k=4, NE): a hole, a spoon, a sign
    nu, nv = pt(1.35, 90 + 180)
    out.append(disc('tunnel', nu, nv, zt + 0.015, 0.32, M['hole'], sv=0.8))
    out.append(D.ring('tunnel_rim', 0.34, 0.07, 0.03, loc=P(nu, nv, zt + 0.01), m=M['scrap'], verts=24))
    out.append(cbox('spoon', nu - 0.42, nv + 0.15, 0.3, 0.04, zt + 0.015, 0.015, M['steel'], bevel=0.005, rotz=30))
    out.append(cbox('sign_post', nu + 0.4, nv - 0.1, 0.04, 0.04, zt, 0.5, M['scrap'], bevel=0.005))
    out.append(cbox('sign', nu + 0.4, nv - 0.08, 0.6, 0.03, zt + 0.42, 0.24, M['paper'], bevel=0.01))
    text('sign_t', 'WORKING ON IT', nu + 0.4, nv - 0.06, zt + 0.54, 0.065, M['ink'], face=True)
    # 1: Big Lou's cell (k=0, at the gate): a cot pushed aside
    lu, lv = pt(1.55, 90)
    out.append(cbox('cot', lu - 0.55, lv - 0.1, 0.36, 0.8, zt, 0.22, M['scrap'], bevel=0.03, rotz=15))
    # 2: Varga's cell (k=1, SW): the bedroll, tally marks on the wedge
    vu, vv = pt(1.45, 90 + 60)
    out.append(cbox('bedroll', vu, vv, 0.9, 0.5, zt + 0.012, 0.04, M['orange'], bevel=0.02, rotz=60))
    for j in range(5):
        a = 90 + 60 + 18; tu2, tv2 = pt(RD - 0.95 + j * 0.06, a)
        out.append(cbox('tally', tu2, tv2, 0.02, 0.18, zt + 0.013, 0.003, M['white'], bevel=0, rotz=a))

def core_room(M, rng, out):
    K_ = ROOMS['core']; v = K_[1]
    # the crank wheel on a pedestal (where the raider has its reactor)
    cu, cv = -21.6, CV
    out.append(cbox('crank_ped', cu, cv, 0.7, 0.6, FLOOR_Z, 0.75, M['hull2'], bevel=0.05))
    out.append(cbox('crank_hz', cu, cv + 0.3, 0.7, 0.02, FLOOR_Z + 0.05, 0.12, M['hazard'], bevel=0.004))
    w = D.ring('crank_wheel', 0.48, 0.07, 0.07, loc=P(cu, cv, 0.85), m=M['red'], verts=40)
    w.rotation_euler = (math.radians(70), 0, 0); out.append(w)
    for k in range(4):
        a = k * math.pi / 4
        out.append(mn.box('spoke', (0.86, 0.05, 0.05), loc=P(cu, cv, 0.85), m=M['steel'], bevel=0.01, rot=(math.radians(70), a, 0)))
    out.append(mn.cyl('crank_hub', 0.1, 0.12, loc=P(cu, cv - 0.02, 0.85), m=M['steel'], rot=(math.radians(70), 0, 0), verts=16, bevel=0.02))
    out.append(mn.cyl('crank_handle', 0.04, 0.25, loc=P(cu + 0.4, cv + 0.15, 1.05), m=M['black'], rot=(math.radians(-20), 0, 0), verts=10, bevel=0.01))
    # back wall: the cell dial (big number) and the flickering mugshot monitor
    out.append(ubox('dial_box', -22.7, v, -21.5, v + 0.1, 0.75, 1.45, M['dark'], bevel=0.03))
    out.append(ubox('dial_face', -22.6, v + 0.1, -21.6, v + 0.12, 0.82, 1.38, M['dial'], bevel=0.005))
    text('dial_n', 'CELL 1', -22.1, v + 0.125, 1.1, 0.16, M['black'], face=True)
    wall_screen(-20.3, v, 0.8, 0.9, 0.62, M, out, M['mug'])
    text('mug_t', '???', -20.3, v + 0.09, 1.08, 0.18, M['dark'], face=True)
    out.append(ubox('brake', -23.9, v, -23.5, v + 0.25, 0.4, 1.0, M['hazard'], bevel=0.03))
    out.append(mn.sphere('brake_knob', 0.1, loc=P(-23.7, v + 0.3, 1.0), m=M['red'], segs=16))
    stain(-21.2, 1.7, 0.5, M['oil'], out, sv=0.6)

def gate_post(M, out):
    gu, gv = pt(RD + 0.75, 90 - 40)                               # the gate key switch, beside the gate
    out.append(cbox('key_post', gu, gv, 0.3, 0.3, FLOOR_Z, 0.95, M['hazard'], bevel=0.03))
    out.append(cbox('key_head', gu, gv, 0.42, 0.36, FLOOR_Z + 0.95, 0.2, M['hull2'], bevel=0.04))
    out.append(mn.cyl('key_lock', 0.08, 0.06, loc=P(gu, gv + 0.18, FLOOR_Z + 1.05), m=M['gold'], rot=(R90, 0, 0), verts=16, bevel=0.01))
    out.append(cbox('key', gu, gv + 0.24, 0.05, 0.03, FLOOR_Z + 1.05, 0.16, M['gold'], bevel=0.008))
    out.append(cbox('ring_tag', gu + 0.08, gv + 0.26, 0.12, 0.02, FLOOR_Z + 0.95, 0.1, M['red'], bevel=0.005))

def airlock_room(M, rng, out):
    A_ = ROOMS['airlock']; v = A_[1]
    # the warden's roster board (it lies)
    out.append(ubox('roster', -9.8, v, -7.8, v + 0.06, 0.65, 1.42, M['white'], bevel=0.02))
    for i in range(6):
        x = -9.6 + (i % 3) * 0.62; z = 1.05 if i < 3 else 0.72
        out.append(ubox('mug', x, v + 0.06, x + 0.4, v + 0.08, z, z + 0.3, M['panel2'], bevel=0.005))
    text('roster_t', 'ROSTER', -8.8, v + 0.07, 1.36, 0.08, M['red'], face=True)
    out.append(ubox('xout', -9.65, v + 0.08, -9.15, v + 0.09, 1.18, 1.22, M['red'], bevel=0, rotz=0))
    for u in (-6.6, -6.1):
        out.append(ubox('locker', u - 0.23, v, u + 0.23, v + 0.32, 0.0, 1.3, M['panel2'], bevel=0.03))
    out.append(ubox('hz_floor', -6.2, -1.0, -5.65, 1.0, FLOOR_Z, FLOOR_Z + 0.008, M['hazard'], bevel=0))
    debris(-10.0, -1.9, -6.4, 2.2, 4, [M['scrap'], M['steel']], rng, out, avoid=[(-7.9, 0, 0.7)])

def exterior(M, out):
    zr = H_FULL
    for (u, vv) in ((-8.4, -3.6), (-21.8, -3.8)):
        out.append(ucyl('tower', 0.18, 0.7, u, vv, zr, M['hull2'], verts=16, bevel=0.02))
        out.append(cbox('lamp_box', u, vv + 0.05, 0.42, 0.34, zr + 0.7, 0.26, M['hull2'], bevel=0.04))
        out.append(ubox('lamp_face', u - 0.15, vv + 0.2, u + 0.15, vv + 0.235, zr + 0.73, zr + 0.93, M['lamp'], bevel=0.01))
    v1 = HULLR[3]
    out.append(ubox('trim', HULLR[0] + 0.3, v1 - 0.12, HULLR[2] - 0.3, v1 + 0.0, H_LOW - 0.06, H_LOW + 0.01, M['trim'], bevel=0.01))
    text('name', 'RED COMET  PRISON BARGE 9', -15.0, v1 - 0.03, -0.2, 0.22, M['white'], face=True)
    for u in (-23.4, -20.6, -9.6, -6.6):
        out.append(mn.cyl('port', 0.17, 0.05, loc=P(u, v1 - 0.06, -0.22), m=M['steel'], rot=(R90, 0, 0), verts=24, bevel=0.015))
        out.append(mn.cyl('port_glass', 0.13, 0.02, loc=P(u, v1 - 0.0, -0.22), m=M['lamp_amber'], rot=(R90, 0, 0), verts=24, bevel=0))
    for u, m in ((HULLR[0] + 0.45, M['lamp_red']), (HULLR[2] - 0.45, M['lamp_em'])):
        out.append(mn.sphere('nav', 0.07, loc=P(u, v1 - 0.25, H_LOW + 0.02), m=m, segs=16))
    ships.engines(M, out, emit_mat('eng_glow', '#ffb35c', 1.2, base='#ff9040'), v_list=(-3.0, 0.0, 3.0))
    ships.claw(M, out)

def build():
    mn.reset(); set_side('port')
    rng = random.Random(9)
    M = mats(ships.materials('brig'))
    out = []
    ships.structure('brig', M, rng, out)
    A_, C_, K_ = ROOMS['airlock'], ROOMS['cargo'], ROOMS['core']
    back_wall(A_[0], A_[2], A_[1], M, rng, out, skip=[(-9.9, -7.7)])
    back_wall(C_[0], C_[2], C_[1], M, rng, out)
    back_wall(K_[0], K_[2], K_[1], M, rng, out, skip=[(-22.8, -19.7)])
    text('stencil', 'KEEP HANDS INSIDE THE CELL', -14.6, 3.35, FLOOR_Z + 0.002, 0.2, M['sticker'])
    stain(-12.2, 2.8, 0.5, M['oil'], out, sv=0.6)
    drum(M, rng, out); occupants(M, rng, out); core_room(M, rng, out); gate_post(M, out); airlock_room(M, rng, out); exterior(M, out)
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    rest = [o for o in out if o not in big and not o.name.startswith(('stain', 'soot', 'em', 'paper', 'thr_hz', 'hz_floor', 'wedge', 'cellnum', 'tally', 'tunnel', 'confisc'))]
    mn.outline(big, thickness=0.02)
    mn.outline([o for o in rest if not o.name.startswith(('plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'frv', 'coin', 'tray', 'cable', 'strap', 'link', 'bar', 'gate_bar'))], thickness=0.012)
    mn.outline([o for o in rest if o.name.startswith(('plate', 'bar', 'gate_bar'))], thickness=0.008)
    return out

if __name__ == '__main__':
    t0 = time.time()
    objs = build()
    mn.OUT_DIR = OUT; mn._manifest_put = lambda *a, **k: None   # concept only: never the game's renders / manifest
    w, h, ox, oy = mn.render('barge_keyart_raw', objs=objs, passes=('beauty',))
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU, 'elevation': mn.ELEVATION}, open(os.path.join(OUT, 'barge_keyart_raw.json'), 'w'))
    print(f'[concept] barge in {time.time() - t0:.0f} s -> {OUT}')
