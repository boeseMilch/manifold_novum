"""CONCEPT MOCK-UP (not a game sprite): the pirate raider's hold with "The Quota" scale.

    DOCK_CPU=1 blender -b --factory-startup --python tools/blender/models/concepts/raider.py -- <out_dir> [samples]

Builds the existing docked raider (models/dock/ships.py, port side) and adds the pitched new pieces in
its cargo hold: the QUOTA-O-MATIC platform scale with its dial, the loot chute from the airlock, the
robo-parrot on its perch, a ballast pile, the plunder order board. Renders a crop around the hold at a
higher PPU straight to <out_dir>/raider_hold_raw.png (+ raider_hold_raw.json with the projection) and
never touches build/renders or the manifest.
"""
import sys, os, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock')); sys.path.insert(0, os.path.join(HERE, '..', '..'))
import bpy
import mn
_argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = _argv[0] if _argv else '/tmp/raider_concept'
SAMPLES = int(_argv[1]) if len(_argv) > 1 else 24
sys.argv = sys.argv[:sys.argv.index('--')] if '--' in sys.argv else sys.argv   # (ships.py reads its own args)
import docklib as D
from docklib import *
import ships

PPU = 112

def build_quota(M, out):
    steel, dark, black = M['steel'], M['dark'], M['black']
    brass = worn('brass', '#c99a3a', 0.35, 0.85, wear=0.4, grime=0.7)
    cream = worn('cream', '#e8dcb8', 0.6, 0.0, wear=0.3, grime=0.5)
    green = emit_mat('band_green', '#5fd6a0', 0.9, base='#3a9a6a')
    redz = emit_mat('band_red', '#ff4a3a', 0.8, base='#a83a3a')
    fuelg = emit_mat('fuel_glow', '#d8ff6a', 1.5, base='#9acf3a')
    eye = emit_mat('parrot_eye', '#ff3a2a', 1.5, base='#6a1a14')
    feather_r = worn('feather_r', '#d0402e', 0.5, 0.2, wear=0.3, grime=0.3)
    feather_b = worn('feather_b', '#2e6ac0', 0.5, 0.2, wear=0.3, grime=0.3)
    feather_y = worn('feather_y', '#f0c030', 0.5, 0.2, wear=0.3, grime=0.3)
    sack = worn('sack', '#9a8a60', 0.85, 0.0, wear=0.1, grime=0.8)
    # --- the scale platform (centre (-14.4, -0.9)) ---
    cu, cv = -14.4, -0.7
    out.append(cbox('sc_base', cu, cv, 2.5, 1.9, FLOOR_Z, 0.12, M['hull2'], bevel=0.04))
    out.append(cbox('sc_rim', cu, cv, 2.36, 1.76, FLOOR_Z + 0.12, 0.06, M['hazard'], bevel=0.02))
    out.append(cbox('sc_deck', cu, cv, 2.1, 1.5, FLOOR_Z + 0.12, 0.09, M['tread'], bevel=0.02))
    for su in (-1, 1):
        for sv in (-1, 1):
            out.append(rivet(cu + su * 1.1, cv + sv * 0.82, FLOOR_Z + 0.18, steel, 0.04))
    text('sc_cap', 'MAX 500 KG  ·  NO THUMBS', cu, cv + 0.92, FLOOR_Z + 0.08, 0.1, cream, face=True)
    # --- the dial column ---
    du, dv, dz = cu, -2.75, 1.55
    out.append(cbox('col', du, dv + 0.05, 0.26, 0.26, FLOOR_Z, dz - 0.4, brass, bevel=0.03))
    out.append(cbox('col_foot', du, dv + 0.05, 0.6, 0.5, FLOOR_Z, 0.12, M['hull2'], bevel=0.03))
    out.append(mn.cyl('dial_rim', 0.74, 0.16, loc=P(du, dv - 0.02, dz), m=brass, rot=(R90, 0, 0), verts=48, bevel=0.04))
    out.append(mn.cyl('dial_face', 0.64, 0.02, loc=P(du, dv + 0.14, dz), m=cream, rot=(R90, 0, 0), verts=48, bevel=0.004))
    fz = dv + 0.16
    # scale arc from -120 deg (empty) to +120 deg (max) measured from straight up, clockwise
    def arcpt(a, r): return du + r * math.sin(a), dz + r * math.cos(a)
    for i in range(25):
        a = math.radians(-120 + i * 10)
        u, z = arcpt(a, 0.54)
        tick = mn.box('tick', (0.018, 0.01, 0.1 if i % 4 == 0 else 0.06), loc=P(u, fz, z - 0.03), m=black, bevel=0)
        tick.rotation_euler = (0, a, 0); out.append(tick)
    for i in range(7):                                   # the green "quota" band
        a = math.radians(38 + i * 5)
        u, z = arcpt(a, 0.43)
        seg = mn.box('band', (0.085, 0.012, 0.07), loc=P(u, fz, z - 0.035), m=green, bevel=0); seg.rotation_euler = (0, a, 0); out.append(seg)
    for i in range(7):                                   # the red "suspicious" zone past it
        a = math.radians(78 + i * 6)
        u, z = arcpt(a, 0.43)
        seg = mn.box('redz', (0.085, 0.012, 0.07), loc=P(u, fz, z - 0.035), m=redz, bevel=0); seg.rotation_euler = (0, a, 0); out.append(seg)
    na = math.radians(50)                                # the needle, sitting in the band
    nu, nz = arcpt(na, 0.24)
    nd = mn.box('needle', (0.03, 0.012, 0.5), loc=P(nu, fz + 0.02, nz - 0.25), m=M['red'], bevel=0); nd.rotation_euler = (0, na, 0); out.append(nd)
    out.append(mn.cyl('hub', 0.06, 0.05, loc=P(du, fz, dz), m=brass, rot=(R90, 0, 0), verts=16, bevel=0.01))
    text('dial_t', 'QUOTA-O-MATIC', du, fz + 0.025, dz - 0.3, 0.075, black, face=True)
    text('dial_kg', 'KG', du, fz + 0.025, dz + 0.22, 0.08, black, face=True)
    out.append(ubox('calib', du + 0.32, fz, du + 0.62, fz + 0.012, dz - 0.62, dz - 0.5, M['sticker'], bevel=0))
    text('calib_t', 'CALIBRATED: NEVER', du + 0.47, fz + 0.016, dz - 0.56, 0.035, black, face=True)
    tp = mn.box('tape_dial', (0.34, 0.012, 0.09), loc=P(du - 0.5, fz + 0.005, dz + 0.3), m=M['tape'], bevel=0.003)   # (duct tape, the running joke)
    tp.rotation_euler = (0, -0.7, 0); out.append(tp)
    out.append(mn.sphere('bell', 0.12, loc=P(du + 0.62, dv + 0.05, dz + 0.72), m=brass, scale=(1, 1, 0.8), segs=16))
    # --- the loot on the scale: a fuel cell, the coffee machine, a cat carrier ---
    z0 = FLOOR_Z + 0.21
    for k, (u, v) in enumerate(((-15.05, -1.0), (-14.75, -0.55))):
        out.append(ucyl('fuel_base', 0.18, 0.07, u, v, z0, steel, verts=16, bevel=0.015))
        out.append(ucyl('fuel_core', 0.14, 0.44, u, v, z0 + 0.06, fuelg, verts=20, bevel=0.01))
        for a in range(4):
            out.append(ucyl('fuel_bar', 0.022, 0.44, u + 0.16 * math.cos(a * 1.57 + 0.78), v + 0.16 * math.sin(a * 1.57 + 0.78), z0 + 0.06, steel, verts=8, bevel=0))
        out.append(ucyl('fuel_cap', 0.18, 0.06, u, v, z0 + 0.5, M['hazard'], verts=16, bevel=0.015))
    out.append(cbox('coffee_body', -13.9, -1.05, 0.45, 0.38, z0, 0.55, M['red'], bevel=0.04))
    out.append(cbox('coffee_top', -13.9, -1.1, 0.48, 0.42, z0 + 0.55, 0.08, black, bevel=0.03))
    out.append(ucyl('coffee_pot', 0.12, 0.22, -13.9, -0.85, z0 + 0.03, M['glass'], verts=16, bevel=0.01))
    out.append(cbox('carrier', -13.75, -0.3, 0.62, 0.45, z0, 0.42, cream, bevel=0.06))
    out.append(cbox('carrier_door', -13.75, -0.07, 0.4, 0.02, z0 + 0.06, 0.3, black, bevel=0.01))
    for k in range(4):
        out.append(cbox('bar', -13.9 + k * 0.1, -0.05, 0.02, 0.02, z0 + 0.06, 0.3, steel, bevel=0))
    for su in (-1, 1):                                    # the cat's eyes glowing in the carrier
        out.append(mn.sphere('cat_eye', 0.03, loc=P(-13.75 + su * 0.06, -0.08, z0 + 0.24), m=green, segs=8))
    text('carrier_t', 'MEOW', -13.75, -0.3, z0 + 0.425, 0.09, black)
    # --- the loot chute: from the airlock wall over the door, down into a hopper over the scale ---
    out.append(pipe_uv('chute', [(-10.9, -3.3, 1.45), (-12.6, -3.3, 1.45), (-13.1, -2.3, 1.45), (-13.1, -1.85, 1.15)], 0.16, M['pipe1'], corner=0.45))
    out.append(mn.cyl('hopper', 0.32, 0.3, loc=P(-13.1, -1.85, 0.85), m=M['hazard'], verts=24, bevel=0.03))
    out.append(D.ring('hopper_rim', 0.34, 0.07, 0.06, loc=P(-13.1, -1.85, 1.14), m=steel))
    out.append(ubox('chute_lbl', -12.2, -3.3 + 0.17, -11.4, -3.3 + 0.18, 1.33, 1.57, M['sticker'], bevel=0))
    text('chute_t', 'LOOT ↓', -11.8, -3.3 + 0.19, 1.45, 0.11, black, face=True)
    # --- the robo-parrot on its perch (west of the scale) ---
    pu, pv = -16.85, -2.3
    out.append(cbox('perch_foot', pu, pv, 0.5, 0.5, FLOOR_Z, 0.08, M['hull2'], bevel=0.03))
    out.append(ucyl('perch_pole', 0.04, 1.3, pu, pv, FLOOR_Z + 0.08, steel, verts=12, bevel=0.01))
    out.append(ucyl('perch_bar', 0.035, 0.7, pu - 0.35, pv, 1.4, brass, axis='u', verts=12, bevel=0.01))
    out[-1].location = P(pu - 0.35, pv, 1.4)
    pz = 1.47
    out.append(mn.sphere('p_body', 0.17, loc=P(pu, pv, pz + 0.12), m=feather_r, scale=(0.9, 0.9, 1.35), segs=20))
    out.append(mn.sphere('p_head', 0.12, loc=P(pu + 0.02, pv + 0.04, pz + 0.38), m=feather_r, segs=20))
    out.append(mn.sphere('p_beak', 0.07, loc=P(pu + 0.02, pv + 0.15, pz + 0.34), m=feather_y, scale=(0.8, 1.2, 1.0), segs=12))
    for su in (-1, 1):
        out.append(mn.sphere('p_wing', 0.11, loc=P(pu + su * 0.15, pv - 0.02, pz + 0.12), m=feather_b, scale=(0.5, 0.9, 1.4), segs=14))
        out.append(mn.sphere('p_eye', 0.03, loc=P(pu + 0.02 + su * 0.06, pv + 0.12, pz + 0.42), m=eye, segs=8))
    out.append(cbox('p_tail', pu, pv - 0.16, 0.12, 0.3, pz - 0.15, 0.06, feather_b, bevel=0.02, rotz=0.0))
    out.append(ucyl('p_ant', 0.012, 0.22, pu + 0.02, pv + 0.0, pz + 0.48, steel, verts=8, bevel=0))
    out.append(mn.sphere('p_ant_tip', 0.03, loc=P(pu + 0.02, pv, pz + 0.71), m=eye, segs=8))
    out.append(mn.sphere('p_patch', 0.045, loc=P(pu - 0.04, pv + 0.1, pz + 0.43), m=black, scale=(1, 0.4, 1), segs=10))
    text('perch_t', 'EMPLOYEE OF THE MONTH', pu, pv + 0.26, FLOOR_Z + 0.085, 0.07, cream)
    # --- the ballast pile (south-west): sandbags, a "space anchor", a tipped barrel ---
    bu, bv = -17.1, 2.3
    for k, (du_, dv_, dz_) in enumerate(((-0.35, 0.0, 0), (0.25, 0.05, 0), (-0.05, 0.4, 0), (-0.05, 0.1, 0.22), (0.5, 0.55, 0))):
        out.append(mn.sphere('sandbag', 0.26, loc=P(bu + du_, bv + dv_, FLOOR_Z + 0.12 + dz_), m=sack, scale=(1.3, 0.85, 0.5), segs=18))
    text('sb_t', '40 KG', bu - 0.05, bv + 0.1, FLOOR_Z + 0.36, 0.08, black)
    au, av = -16.2, 1.2                                    # the anchor, lying on the floor
    out.append(cbox('anchor_shank', au, av, 0.12, 1.1, FLOOR_Z, 0.1, M['steel'], bevel=0.02))
    out.append(cbox('anchor_stock', au, av - 0.5, 0.6, 0.1, FLOOR_Z, 0.1, M['steel'], bevel=0.02))
    out.append(D.ring('anchor_ring', 0.12, 0.04, 0.06, loc=P(au, av - 0.68, FLOOR_Z), m=M['steel']))
    out.append(pipe_uv('anchor_arm', [(au - 0.5, av + 0.25, FLOOR_Z + 0.06), (au - 0.35, av + 0.55, FLOOR_Z + 0.06), (au, av + 0.62, FLOOR_Z + 0.06),
                           (au + 0.35, av + 0.55, FLOOR_Z + 0.06), (au + 0.5, av + 0.25, FLOOR_Z + 0.06)], 0.06, M['steel'], corner=0.2))
    text('anchor_t', 'SPACE ANCHOR (DECORATIVE)', au + 0.1, av - 0.95, FLOOR_Z + 0.004, 0.075, cream)
    out.append(ucyl('barrel_tip', 0.24, 0.8, -17.6, 3.3, FLOOR_Z + 0.24, M['gold'], axis='u', verts=24, bevel=0.03))
    out[-1].location = P(-18.0, 3.4, FLOOR_Z + 0.24)
    # --- the plunder order board on the back wall, over the barrels ---
    wv = -4.0
    out.append(ubox('board', -13.0, wv, -11.0, wv + 0.05, 0.92, 1.56, M['dark'], bevel=0.02))
    out.append(ubox('board_face', -12.92, wv + 0.04, -11.08, wv + 0.06, 0.97, 1.51, worn('chalk', '#2a3a32', 0.9, 0.0, grime=0.4), bevel=0.005))
    for k, (t, s) in enumerate((("TODAY'S PLUNDER", 0.07), ('2x FUEL CELL', 0.06), ('1x COFFEE MACHINE', 0.06), ('1x CAT (!!)', 0.06), ('QUOTA: 120 KG', 0.065))):
        text('board_t', t, -12.0, wv + 0.065, 1.44 - k * 0.11, s, cream, face=True)
    # a floor stencil and the order card pinned on the scale column
    text('st_quota', 'QUOTA OR KEELHAUL', -14.6, 3.45, FLOOR_Z + 0.004, 0.19, worn('stencil', '#d2a62e', 0.7, 0.0, grime=0.6))

def main():
    os.makedirs(OUT, exist_ok=True)
    mn.SAMPLES = SAMPLES
    mn.PPU = PPU
    out = ships.build('pirate', 'port')
    M = {}
    # grab the materials ships.build made (by name) for the new pieces
    for k in ('steel', 'dark', 'black', 'hull2', 'hazard', 'tread', 'red', 'gold', 'glass', 'sticker', 'tape', 'pipe1'):
        M[k] = bpy.data.materials.get(k) or bpy.data.materials.get(k + '.001')
    D.M_DARK[0] = M['black']
    new = []
    build_quota(M, new)
    new = [o for o in dict.fromkeys(new) if o is not None and o.type == 'MESH']
    mn.outline([o for o in new if not o.name.startswith(('band', 'redz', 'tick', 'board_t', 'st_', 'sb_t', 'anchor_t', 'perch_t', 'calib', 'dial_', 'carrier_t', 'chute_t', 'sc_cap', 'tape', 'rivet', 'cat_eye', 'p_eye'))], thickness=0.012)
    s = bpy.context.scene
    if os.environ.get('DOCK_CPU'): s.cycles.device = 'CPU'
    bounds = (-19.7, -9.4, -4.15, 4.75)        # screen-plane window (units) around the hold
    w, h, ox, oy = mn._frame(None, bounds)
    mn._render_to(os.path.join(OUT, 'raider_hold_raw.png'), 'beauty')
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': PPU, 'elev': mn.ELEVATION,
               'note': 'pixel = (ox + u*ppu, oy - (-v*sin(e) + z*cos(e))*ppu); u, v relative to our port hatch'},
              open(os.path.join(OUT, 'raider_hold_raw.json'), 'w'))
    print('[concept] wrote', OUT, w, h)

main()
