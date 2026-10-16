"""CONCEPT MOCK-UP (not a game sprite): Captain Red Comet, the pirate base's boss, in his Captain's Hall.

    DOCK_CPU=1 blender -b --factory-startup --python tools/blender/models/concepts/boss.py -- <hall|sheet> <out_dir> [samples]

hall   the Captain's Hall (the brig grown to 12 x 10 units, Dr. Varga's cell in the back wall) in phase 1:
       the captain in his coat aiming a BROADSIDE (5 red laser sights on the floor) at the crew member
       behind the overturned desk, while the flanker goes for the blue reactor pack on his back.
       -> <out_dir>/hall_raw.png + hall_raw.json (projection)
sheet  the captain alone on four floor pads: phase 1 front, phase 1 back (the pack), phase 2 front (coat off,
       cracked leaking pack), phase 2 dash (jets lit, leaning in).
       -> <out_dir>/sheet_raw.png + sheet_raw.json

Hall coordinates (own frame, not the game's): u 0..12 right, v 0..10 down, v = 0 the back wall.
In the game the brig hangs off the gun corridor's south wall (js/dock.js baseGeom), so the entrance is a door in
the back wall (right), the cell is in the back wall (centre-left), the escape pod hatch in the back wall (left).
Never touches build/renders or the manifest.
"""
import sys, os, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
import docklib as D
from docklib import *

A = D.args()
MODE = A[0] if A else 'hall'
OUT = A[1] if len(A) > 1 else '/tmp/mn_concept_boss'
mn.SAMPLES = int(A[2]) if len(A) > 2 else 24

ROOM = (0.0, 0.0, 12.0, 10.0)
HULL = (-0.7, -2.4, 12.7, 10.7)
CELL = (3.0, -2.0, 7.0, 0.0)
DOOR = (9.6, -2.4, 11.0, 0.0)
POD = (0.3, -2.1, 2.2, -0.45)

# key-art staging (hall frame)
CAPT = (6.0, 4.6)
DECOY = (2.4, 7.5)
FLANK = (8.7, 2.5)
FIRE = (10.5, 6.6)
EXT = (11.25, 8.2)
DESK = (3.05, 6.65, 2.0, 0.55, 52.0)     # centre u, v, length, depth, angle (deg, game frame)
CHEST = (8.5, 7.3, 1.1, 0.7)
PILLAR = (10.2, 4.0, 0.42)

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
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.35, 0.7, wear=0.5, grime=0.5),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), leather=worn('leather', '#8a2a24', 0.45, 0.0, wear=0.9, grime=0.8),
        brown=worn('brown', '#6a4428', 0.6, 0.0, wear=0.5, grime=0.8), wood=worn('wood', '#7a5232', 0.7, 0.0, wear=0.4, grime=0.9, scale=2),
        paper=pmat('paper', '#e6e2d6', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6), parch=worn('parch', '#d9c89a', 0.8, 0.0, wear=0.1, grime=0.7),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15), panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2),
        panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3),
        carpet=worn('carpet', '#7a1e22', 0.9, 0.0, wear=0.2, grime=0.9, scale=2.0), glass=mn.mat('glass', '#6a9ab8', 0.08, 0.2, clearcoat=1.0),
        # the captain
        coat=worn('coat', '#c0302a', 0.65, 0.0, wear=0.35, grime=0.7, scale=2.0), coat_in=pmat('coat_in', '#3a1416', 0.8),
        suit=worn('csuit', '#6e7468', 0.6, 0.1, wear=0.4, grime=0.8, scale=2.0), patch=worn('cpatch', '#8a7a52', 0.7, 0.0, wear=0.2, grime=0.6),
        armour=worn('armour', '#b4bcc8', 0.35, 0.45, wear=0.6, grime=0.8, scale=1.5), gunmetal=worn('gunmetal', '#5a606c', 0.4, 0.5, wear=0.6, grime=0.6),
        helm=worn('helm', '#5a606c', 0.35, 0.7, wear=0.5, grime=0.7), hat=worn('hat', '#3e3648', 0.45, 0.0, wear=0.5, grime=0.3),
        brass=worn('brass', '#c99a3a', 0.3, 0.85, wear=0.4, grime=0.6), skin=pmat('skin', '#f0c8a8', 0.6),
        beard=worn('beard', '#b0281a', 0.8, 0.0, wear=0.0, grime=0.4, scale=4.0), rubber=pmat('rubber', '#262a33', 0.7),
        core=emit_mat('core', '#3ab4ff', 1.5, base='#1a5a9a'), core_hot=emit_mat('core_hot', '#2aa8ff', 1.8, base='#1a6aba'),
        leak=emit_mat('leak', '#4ac8ff', 1.3, base='#1a5a8a'), muzzle=emit_mat('muzzle', '#ff3a0a', 1.0, base='#5a1a08'),
        weld=emit_mat('weld', '#ff9a4a', 0.7, base='#8a5a3a'), eye=emit_mat('ceye', '#ff4a2a', 1.4, base='#6a1a14'),
        jet=emit_mat('jet', '#3ab4ff', 1.6, base='#1a6aba'), jet_out=emit_mat('jet_out', '#ff5a00', 1.0, base='#c83a00'),
        sight=emit_mat('sight', '#ff2a1a', 1.5, base='#ff2a1a'), sight_dim=emit_mat('sight_dim', '#ff4a3a', 0.8, base='#5a1410'),
        cat=pmat('cat', '#d8843a', 0.7), alien=worn('alien', '#5a2a6a', 0.5, 0.0, wear=0.1, grime=0.5), slime=emit_mat('slime', '#9cff5a', 0.9, base='#5a9a2a'),
        oil=decal_mat('oil', '#0a0908', 0.85, rough=0.15), scorch=decal_mat('scorch', '#140c08', 0.9, rough=0.9),
        pirate=worn('pirate', '#8a4a44', 0.6, 0.0, wear=0.4),
    )
    M['pipe1'] = worn('pipe1', '#3b7a8a', 0.4, 0.3, rust=0.08); M['pipe2'] = M['copper']
    M['plates'] = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12) for i, c in enumerate(['#6a5a5e', '#665658', '#6e5c5c', '#625458'])]
    M['tread'] = worn('tread', '#7f8794', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08)
    D.M_DARK[0] = M['black']
    return M

def cone(name, r1, r2, h, loc, m, verts=32, rot=(0, 0, 0), bevel=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.rotation_euler = rot
    if bevel: mn.bev(o, bevel)
    if m: mn.assign(o, m)
    return mn.smooth(o)

# ---------------------------------------------------------------------------------------------------
# Captain Red Comet. Built at the origin, facing -Y (towards the camera = game angle 90); his right is -X.
# ---------------------------------------------------------------------------------------------------
def captain(M, phase=1, dash=False, at=(0.0, 0.0), face=90.0, lean=0.0, scale=1.0):
    p = []; a = p.append
    B = mn.box; C = mn.cyl; SP = mn.sphere
    # boots and legs
    for sx in (-1, 1):
        a(B('boot', (0.3, 0.46, 0.28), loc=(sx * 0.23, -0.07, 0), m=M['rubber'], bevel=0.07))
        a(SP('toecap', 0.13, loc=(sx * 0.23, -0.26, 0.12), m=M['armour'], scale=(1.05, 1, 0.75), segs=16))
        a(C('leg', 0.16, 0.5, loc=(sx * 0.22, 0.02, 0.24), m=M['suit'], verts=20, bevel=0.03))
        a(B('kneepad', (0.24, 0.08, 0.2), loc=(sx * 0.22, -0.16, 0.42), m=M['armour'] if sx > 0 else M['patch'], bevel=0.04))
    # hips, belt, buckle
    a(B('hips', (0.8, 0.5, 0.26), loc=(0, 0.02, 0.66), m=M['suit'], bevel=0.1))
    # torso (the patched pressure suit) and the armoured breastplate
    a(C('torso', 0.43, 0.82, loc=(0, 0.04, 0.72), m=M['suit'], verts=32, bevel=0.06))
    a(B('breast', (0.62, 0.22, 0.62), loc=(0, -0.33, 0.86), m=M['armour'], bevel=0.08))
    a(B('breast_ridge', (0.08, 0.06, 0.5), loc=(0, -0.45, 0.92), m=M['gunmetal'], bevel=0.02))
    for sx in (-1, 1):
        for z in (0.95, 1.3): a(SP('br_rivet', 0.025, loc=(sx * 0.26, -0.445, z), m=M['steel'], segs=8))
    a(B('belt', (0.9, 0.56, 0.11), loc=(0, 0.02, 0.8), m=M['leather'], bevel=0.03))
    a(B('buckle', (0.24, 0.06, 0.17), loc=(0, -0.29, 0.77), m=M['gold'], bevel=0.02))
    a(SP('buckle_skull', 0.05, loc=(0, -0.325, 0.86), m=M['white'], segs=10))
    if phase == 1:
        # the long red coat: a flared cone, open at the front (cut), gold hem trim, lapels, buttons
        coat = cone('coat', 0.62, 0.46, 1.08, (0, 0.06, 0.34), M['coat'], verts=40)
        hem = D.ring('coat_hem', 0.64, 0.06, 0.07, loc=(0, 0.06, 0.32), m=M['gold'], verts=40)
        inner = cone('coat_lining', 0.6, 0.44, 1.06, (0, 0.06, 0.35), M['coat_in'], verts=40)
        for o in (coat, hem, inner):
            cut = mn.box('cutter', (0.5, 0.9, 1.4), loc=(0, -0.62, 0.2), bevel=0)
            cut.rotation_euler = (0.0, 0, 0); D.bool_cut(o, [cut])
        a(coat); a(hem); a(inner)
        for sx in (-1, 1):
            lap = B('lapel', (0.07, 0.05, 0.9), loc=(sx * 0.26, -0.44, 0.42), m=M['gold'], bevel=0.02); lap.rotation_euler = (0.12, sx * 0.1, 0); a(lap)
            for z in (0.62, 0.85, 1.08): a(SP('button', 0.035, loc=(sx * 0.33, -0.43, z), m=M['gold'], segs=10))
        a(B('collar', (1.0, 0.6, 0.2), loc=(0, 0.1, 1.4), m=M['coat'], bevel=0.08))
        a(B('collar_up', (0.86, 0.12, 0.32), loc=(0, 0.3, 1.5), m=M['coat'], bevel=0.05))
        # a patch and a cigar burn on the coat's back
        a(B('back_slit', (0.05, 0.05, 0.5), loc=(0, 0.66, 0.3), m=M['coat_in'], bevel=0.01))
        for z in (0.82, 0.95): a(SP('button', 0.04, loc=(0.12 * (1 if z > 0.9 else -1), 0.6, z), m=M['gold'], segs=10))
        a(B('coat_patch', (0.2, 0.04, 0.18), loc=(0.25, 0.6, 0.6), m=M['patch'], bevel=0.01))
    else:
        # coat off: the barrel-chested patched suit, duct tape everywhere, a striped shirt at the neck
        a(B('shoulders', (0.96, 0.56, 0.2), loc=(0, 0.06, 1.4), m=M['suit'], bevel=0.09))
        for (x, z, r) in ((0.3, 1.1, 0.5), (-0.28, 0.85, -0.6), (0.05, 1.32, 0.2)):
            t = B('suit_tape', (0.34, 0.03, 0.08), loc=(x, -0.45 if abs(x) < 0.2 else -0.4, z), m=M['tape'], bevel=0.005); t.rotation_euler = (0, r, 0); a(t)
        for sx in (-1, 1):
            t = B('suit_tape_side', (0.03, 0.3, 0.08), loc=(sx * 0.44, 0.05, 1.0), m=M['tape'], bevel=0.005); t.rotation_euler = (sx * 0.4, 0, 0); a(t)
        a(B('rip', (0.12, 0.03, 0.1), loc=(-0.15, -0.44, 1.32), m=M['black'], bevel=0.01))
    # neck ring and head
    a(D.ring('neckring', 0.24, 0.06, 0.08, loc=(0, 0.02, 1.52), m=M['armour']))
    a(SP('helmet', 0.3, loc=(0, 0.04, 1.84), m=M['helm'], segs=32))
    a(SP('face', 0.21, loc=(0, -0.2, 1.82), m=M['skin'], scale=(1, 0.85, 1), segs=24))
    vr = D.ring('visor_rim', 0.23, 0.05, 0.07, loc=(0, -0.26, 1.82), m=M['brass'], rot=(R90, 0, 0)); a(vr)
    a(SP('beard', 0.25, loc=(0, -0.3, 1.64), m=M['beard'], scale=(1.15, 0.8, 1.05), segs=24))
    for sx in (-1, 1):
        mu = SP('moustache', 0.1, loc=(sx * 0.1, -0.41, 1.75), m=M['beard'], scale=(1.4, 0.6, 0.5), segs=14); mu.rotation_euler = (0, sx * 0.4, 0); a(mu)
    a(SP('nose', 0.065, loc=(0, -0.4, 1.82), m=M['skin'], segs=12))
    a(SP('eye', 0.04, loc=(0.085, -0.37, 1.9), m=M['eye'], segs=10))                 # his left eye: a red cyber-eye
    a(B('patch_eye', (0.11, 0.03, 0.09), loc=(-0.085, -0.38, 1.86), m=M['black'], bevel=0.015))   # his right: an eye patch
    st = B('patch_strap', (0.5, 0.02, 0.025), loc=(0, -0.33, 1.91), m=M['black'], bevel=0.005); st.rotation_euler = (0, -0.35, 0); a(st)
    # the hat, welded onto the helmet: tricorne brim with gold trim, crown, skull, a weld bead, a red plume
    a(D.ring('weld', 0.27, 0.05, 0.05, loc=(0, 0.04, 2.0), m=M['weld']))
    tri = math.radians(-90)                                     # a corner of the tricorne points forward (-Y)
    hy = 0.12
    brim = C('brim', 0.46, 0.2, loc=(0, hy, 2.0), m=M['hat'], verts=3, bevel=0.14); brim.rotation_euler = (0, 0, tri); a(brim)
    a(D.ring('cock_trim', 0.48, 0.04, 0.04, loc=(0, hy, 2.19), m=M['gold'], rot=(0, 0, tri), verts=3))
    a(SP('crown', 0.24, loc=(0, hy + 0.02, 2.14), m=M['hat'], scale=(1, 1, 0.75), segs=24))
    a(D.ring('crown_band', 0.245, 0.04, 0.05, loc=(0, hy + 0.02, 2.14), m=M['gold']))
    a(SP('hat_skull', 0.065, loc=(0, -0.18, 2.24), m=M['white'], scale=(1, 0.5, 1), segs=12))
    for sx in (-1, 1):
        bn = B('hat_bone', (0.2, 0.03, 0.035), loc=(0, -0.2, 2.18), m=M['white'], bevel=0.01); bn.rotation_euler = (0, sx * 0.6, 0); a(bn)
    for k, (y, z, r) in enumerate(((0.1, 2.36, 0.09), (0.26, 2.45, 0.1), (0.42, 2.47, 0.095), (0.58, 2.42, 0.08), (0.72, 2.32, 0.06), (0.82, 2.2, 0.045))):
        a(SP('plume', r, loc=(0.16, y, z), m=M['coat'], scale=(0.6, 1.5, 1.0), segs=14))
    # his left shoulder: the jolly-roger pauldron (+X); epaulette fringe
    a(SP('pauldron', 0.3, loc=(0.52, 0.04, 1.42), m=M['gunmetal'], scale=(1, 1.05, 0.72), segs=28))
    a(SP('pd_skull', 0.1, loc=(0.56, -0.02, 1.62), m=M['white'], scale=(1, 1, 0.35), segs=14))
    for sy in (-1, 1):
        bn = B('pd_bone', (0.3, 0.05, 0.03), loc=(0.56, -0.02, 1.6), m=M['white'], bevel=0.01); bn.rotation_euler = (0, 0, sy * 0.7); a(bn)
    for e in (-0.06, 0.06): a(SP('pd_eye', 0.025, loc=(0.56 + e, -0.06, 1.65), m=M['black'], segs=8))
    for k in range(6):
        ang = math.radians(-60 + k * 24)
        a(C('fringe', 0.025, 0.14, loc=(0.52 + 0.3 * math.sin(ang) * 0.4 + 0.22, 0.04 - 0.3 * math.cos(ang), 1.2), m=M['gold'], verts=8, bevel=0))
    # left arm (coat sleeve or suit), a gloved fist with a gold ring
    sleeve = M['coat'] if phase == 1 else M['suit']
    a(pipe('l_arm', [Vector((0.6, 0.04, 1.38)), Vector((0.7, -0.05, 1.05)), Vector((0.6, -0.32, 0.92))], 0.12, sleeve, corner=0.12))
    if phase == 1: a(D.ring('cuff', 0.15, 0.05, 0.12, loc=(0.6, -0.32, 0.92), m=M['gold'], rot=(R90 + 0.4, 0, 0)))
    a(SP('fist', 0.13, loc=(0.6, -0.42, 0.9), m=M['leather'], segs=16))
    a(D.ring('ring', 0.05, 0.02, 0.03, loc=(0.6, -0.5, 0.96), m=M['gold'], rot=(R90, 0, 0)))
    # the cybernetic right arm (-X) and the COMET cannon (a flared plasma blunderbuss)
    a(SP('cy_shoulder', 0.24, loc=(-0.6, 0.04, 1.4), m=M['armour'], segs=24))
    a(D.ring('cy_joint', 0.17, 0.05, 0.06, loc=(-0.6, 0.04, 1.6), m=M['gunmetal']))
    a(pipe('cy_upper', [Vector((-0.66, 0.04, 1.34)), Vector((-0.72, -0.02, 1.08))], 0.13, M['gunmetal'], corner=0.05))
    a(SP('cy_elbow', 0.15, loc=(-0.72, -0.04, 1.04), m=M['armour'], segs=18))
    for sx in (-0.06, 0.06):
        a(pipe('piston', [Vector((-0.72 + sx, 0.08, 1.3)), Vector((-0.72 + sx, -0.1, 1.06)), Vector((-0.66 + sx, -0.42, 1.04))], 0.025, M['brass'], corner=0.05))
    fa = B('cy_fore', (0.3, 0.56, 0.3), loc=(-0.66, -0.34, 0.9), m=M['gunmetal'], bevel=0.07); a(fa)
    a(B('cy_fore_plate', (0.32, 0.4, 0.06), loc=(-0.66, -0.34, 1.18), m=M['armour'], bevel=0.03))
    for k in range(3): a(B('cy_led', (0.04, 0.04, 0.02), loc=(-0.6 + k * 0.0, -0.22 - k * 0.1, 1.24), m=M['red_led'], bevel=0.0))
    tp = B('cy_tape', (0.34, 0.1, 0.012), loc=(-0.66, -0.5, 1.2), m=M['tape'], bevel=0.003); tp.rotation_euler = (0, 0, 0.5); a(tp)
    # cannon: breech, barrel, bell mouth, brass bands, glowing muzzle, drum magazine
    a(B('breech', (0.32, 0.36, 0.3), loc=(-0.66, -0.68, 0.88), m=M['brass'], bevel=0.06))
    a(cone('barrel', 0.12, 0.13, 0.5, Vector((-0.66, -0.82, 1.03)), M['gunmetal'], verts=24, rot=(R90, 0, 0)))
    a(cone('bell', 0.13, 0.24, 0.32, Vector((-0.66, -1.28, 1.03)), M['brass'], verts=28, rot=(R90, 0, 0)))
    a(C('muzzle_glow', 0.2, 0.02, loc=(-0.66, -1.585, 1.03), m=M['muzzle'], verts=24, bevel=0, rot=(R90, 0, 0)))
    for y in (-0.95, -1.15): a(D.ring('band', 0.15, 0.04, 0.06, loc=(-0.66, y, 1.03), m=M['brass'], rot=(R90, 0, 0)))
    a(C('drum', 0.17, 0.16, loc=(-0.74, -0.74, 0.62), m=M['gunmetal'], verts=24, bevel=0.03, rot=(0, R90, 0)))
    a(C('drum_glow', 0.1, 0.17, loc=(-0.745, -0.74, 0.62), m=M['muzzle'], verts=16, bevel=0, rot=(0, R90, 0)))
    # the reactor pack on his back (+Y): the only soft spot. A cage around a blue core, top dome, two jet nozzles.
    a(B('pack', (0.74, 0.3, 0.92), loc=(0, 0.48, 0.98), m=M['body'], bevel=0.06))
    a(B('pack_hz', (0.76, 0.32, 0.12), loc=(0, 0.48, 0.98), m=M['hazard'], bevel=0.02))
    core = C('pack_core', 0.2, 0.72, loc=(0, 0.66, 1.06), m=M['core_hot'] if phase == 2 else M['core'], verts=24, bevel=0.03); a(core)
    for k in range(5):
        ang = math.radians(-60 + k * 30)
        a(C('cage', 0.022, 0.74, loc=(0.22 * math.sin(ang), 0.66 + 0.22 * math.cos(ang), 1.05), m=M['steel'], verts=8, bevel=0))
    for z in (1.08, 1.76): a(D.ring('cage_ring', 0.25, 0.04, 0.05, loc=(0, 0.66, z), m=M['steel']))
    a(SP('pack_dome', 0.2, loc=(0, 0.6, 1.84), m=M['core_hot'] if phase == 2 else M['core'], scale=(1, 1, 0.75), segs=20))
    a(D.ring('dome_rim', 0.23, 0.05, 0.06, loc=(0, 0.6, 1.83), m=M['steel']))
    for sx in (-1, 1):
        a(C('vent', 0.06, 0.32, loc=(sx * 0.32, 0.55, 1.62), m=M['steel'], verts=12, bevel=0.01))
        a(C('vent_glow', 0.045, 0.02, loc=(sx * 0.32, 0.55, 1.94), m=M['core'], verts=12, bevel=0))
        n = cone('nozzle', 0.09, 0.14, 0.24, Vector((sx * 0.24, 0.56, 0.72)), M['gunmetal'], verts=20, rot=(math.radians(-150), 0, 0)); a(n)
    a(B('pack_tape', (0.08, 0.36, 0.5), loc=(0.3, 0.5, 1.15), m=M['tape'], bevel=0.005))
    tl = label('pack_lbl', 'DO NOT\nSHOOT', 0.08, Vector((-0.2, 0.64, 1.25)), rot=(R90, 0, math.pi), m=M['sticker']); a(tl)
    extra = []
    if phase == 2:
        # cracked casing: jagged dark cracks over the core, shards, blue plasma dripping down the back, sparks
        for (x, z, r, l) in ((0.05, 1.5, 0.9, 0.3), (-0.08, 1.32, -0.5, 0.26), (0.1, 1.2, 0.3, 0.22), (-0.02, 1.62, -1.1, 0.2)):
            ck = B('crack', (l, 0.04, 0.06), loc=(x, 0.87, z), m=M['black'], bevel=0.0); ck.rotation_euler = (0, r, 0); a(ck)
        for k, (x, z, s) in enumerate(((0.06, 0.95, 1.0), (-0.1, 0.78, 0.8), (0.12, 0.6, 0.7), (-0.02, 0.45, 0.6), (0.05, 0.25, 0.55))):
            a(SP('drip', 0.05 * s, loc=(x, 0.82 - 0.02 * k, z), m=M['leak'], scale=(1, 1, 1.8), segs=10))
        a(pipe('leak_run', [Vector((0.06, 0.87, 1.3)), Vector((0.07, 0.86, 1.06)), Vector((0.05, 0.83, 0.98))], 0.035, M['leak'], corner=0.05))
        for k in range(4):
            ang = k * 1.6
            sh = B('shard', (0.1, 0.03, 0.12), loc=(0.25 * math.cos(ang), 0.66 + 0.25 * math.sin(ang), 1.9 + 0.08 * k), m=M['steel'], bevel=0.005)
            sh.rotation_euler = (ang, ang * 0.5, ang); a(sh)
    if dash:
        for sx in (-1, 1):            # jets: hot core and an orange sheath, pointing back and down
            a(cone('jet', 0.13, 0.03, 1.1, Vector((sx * 0.24, 0.68, 0.64)), M['jet'], verts=16, rot=(math.radians(-115), 0, 0)))
            a(cone('jet_out', 0.2, 0.05, 0.85, Vector((sx * 0.24, 0.66, 0.66)), M['jet_out'], verts=16, rot=(math.radians(-115), 0, 0)))
    root = mn.link(bpy.data.objects.new('captain', None))
    for o in p: o.parent = root
    root.location = P(*at, 0.0); root.scale = (scale, scale, scale)
    root.rotation_euler = Euler((lean, 0, math.radians(90 - face)), 'XYZ')
    bpy.context.view_layer.update()
    for o in p:
        if o.type == 'MESH' and any(m is None for m in o.data.materials):
            ms = [m for m in o.data.materials if m]; o.data.materials.clear()
            for m in ms: o.data.materials.append(m)
    nol = ('drip', 'leak', 'crack', 'eye', 'pd_eye', 'br_rivet', 'button', 'cy_led', 'cy_tape', 'pack_lbl', 'muzzle_glow', 'vent_glow', 'jet', 'fringe', 'suit_tape', 'rip', 'buckle_skull', 'coat_lining', 'shard')
    mn.outline([o for o in p if not o.name.startswith(nol)], thickness=0.014)
    return root, p

# the coat, thrown on the floor (phase 2)
def coat_on_floor(M, u, v, out, rotz=0.4):
    out.append(cbox('fcoat', u, v, 1.3, 0.75, FLOOR_Z, 0.1, M['coat'], bevel=0.05, rotz=rotz))
    out.append(cbox('fcoat2', u + 0.35, v + 0.2, 0.6, 0.5, FLOOR_Z + 0.06, 0.1, M['coat'], bevel=0.05, rotz=rotz + 0.6))
    out.append(cbox('fcoat_trim', u, v + 0.33, 1.3, 0.06, FLOOR_Z, 0.11, M['gold'], bevel=0.02, rotz=rotz))
    out.append(cbox('fsleeve', u - 0.6, v - 0.3, 0.6, 0.2, FLOOR_Z, 0.14, M['coat'], bevel=0.06, rotz=rotz - 0.9))

# ---------------------------------------------------------------------------------------------------
# The hall
# ---------------------------------------------------------------------------------------------------
def throne(M, u, v, out):
    """A pilot seat ripped out of some ship, bolted onto a dais of loot crates, gold-painted, a skull on top."""
    out.append(ubox('dais', u - 1.1, v - 0.8, u + 1.1, v + 0.85, 0.0, 0.18, M['wood'], bevel=0.03))
    out.append(ubox('dais_step', u - 0.8, v + 0.85, u + 0.8, v + 1.15, 0.0, 0.09, M['wood'], bevel=0.02))
    out.append(ubox('dais_trim', u - 1.12, v + 0.8, u + 1.12, v + 0.86, 0.12, 0.18, M['gold'], bevel=0.01))
    out.append(ucyl('t_post', 0.08, 0.3, u, v, 0.18, M['steel']))
    out.append(cbox('t_seat', u, v, 0.86, 0.74, 0.46, 0.18, M['leather'], bevel=0.08))
    out.append(cbox('t_back', u, v - 0.38, 0.9, 0.2, 0.5, 1.2, M['leather'], bevel=0.08))
    out.append(cbox('t_head', u, v - 0.38, 0.56, 0.2, 1.68, 0.32, M['leather'], bevel=0.08))
    for su in (-1, 1):
        out.append(cbox('t_wing', u + su * 0.5, v - 0.36, 0.14, 0.26, 0.5, 1.15, M['gold'], bevel=0.04))
        out.append(cbox('t_arm', u + su * 0.5, v - 0.02, 0.16, 0.7, 0.62, 0.12, M['gold'], bevel=0.04))
        out.append(mn.sphere('t_knob', 0.08, loc=P(u + su * 0.5, v + 0.32, 0.8), m=M['gold'], segs=12))
        out.append(ubox('t_belt', u + su * 0.2 - 0.04, v - 0.28, u + su * 0.2 + 0.04, v - 0.26, 0.66, 1.4, M['hazard'], bevel=0.0))   # (the old 5-point harness)
    out.append(cbox('t_buckle', u, v - 0.26, 0.16, 0.03, 1.0, 0.12, M['steel'], bevel=0.01))
    skull(u, v - 0.27, 1.88, 0.42, M['white'], out, face=True)
    out.append(text('t_lbl', 'PILOT', u, v - 0.27, 0.55, 0.07, M['sticker'], face=True))
    out.append(text('t_eject', 'EJECT ▲', u + 0.25, v + 0.38, 0.66, 0.05, M['red_led']))
    # a cushion with a tassel and a pile of gold at its feet
    out.append(cbox('cushion', u, v + 0.05, 0.62, 0.52, 0.64, 0.08, M['coat'], bevel=0.04))
    for k, (du, dv, r) in enumerate(((-0.9, 0.95, 0.24), (-0.6, 1.25, 0.18), (0.95, 1.0, 0.22), (1.2, 0.6, 0.16))):
        out.append(mn.sphere('gold_pile', r, loc=P(u + du, v + dv, 0.0), m=M['gold'], scale=(1.4, 1.2, 0.55), segs=16))

def portrait(M, u0, u1, out):
    """A duct-taped portrait of the captain himself, gold frame, on the back wall."""
    z0, z1 = 0.72, 1.5
    out.append(ubox('fr', u0, 0.0, u1, 0.07, z0, z1, M['gold'], bevel=0.02))
    out.append(ubox('canvas', u0 + 0.07, 0.06, u1 - 0.07, 0.08, z0 + 0.07, z1 - 0.07, worn('canvas', '#3a4a6a', 0.8, 0.0, grime=0.8), bevel=0))
    c = (u0 + u1) / 2
    out.append(ubox('pt_coat', c - 0.28, 0.08, c + 0.28, 0.09, z0 + 0.07, z0 + 0.36, M['coat'], bevel=0))
    out.append(mn.cyl('pt_face', 0.12, 0.01, loc=P(c, 0.085, z0 + 0.35), m=M['skin'], rot=(R90, 0, 0), verts=20, bevel=0))
    out.append(mn.cyl('pt_beard', 0.12, 0.01, loc=P(c, 0.09, z0 + 0.27), m=M['beard'], rot=(R90, 0, 0), verts=20, bevel=0))
    out.append(ubox('pt_hat', c - 0.24, 0.09, c + 0.24, 0.1, z0 + 0.43, z0 + 0.5, M['hat'], bevel=0))
    for a_ in (0.8, -0.7):
        t = cbox('pt_tape', c + (0.35 if a_ > 0 else -0.35), 0.1, 0.36, 0.01, z1 - 0.1, 0.08, M['tape'], bevel=0.002); t.rotation_euler = (0, a_, 0); out.append(t)
    t = cbox('pt_tape3', c - 0.3, 0.1, 0.3, 0.01, z0, 0.08, M['tape'], bevel=0.002); t.rotation_euler = (0, 0.5, 0); out.append(t)
    out.append(text('pt_lbl', 'SELF-PORTRAIT', c, 0.1, z0 - 0.08, 0.06, M['sticker'], face=True))

def cell(M, out):
    u0, v0, u1, v1 = CELL
    style = dict(plate_mats=M['plates'][:2], tread_mat=M['tread'], tread=0.0, grille=0.3)
    floor_room((u0, v0, u1, v1), M, random.Random(3), style, out)
    back_wall(u0, u1, v0, M, random.Random(4), out, lamps='flicker')
    for k in range(17):                                   # the bars along the front
        uu = u0 + 0.12 + k * (u1 - u0 - 0.24) / 16
        out.append(ucyl('cbar', 0.035, H_FULL - 0.05, uu, -0.02, 0.0, M['steel'], verts=10, bevel=0))
    for z in (0.08, 0.85, H_FULL - 0.1):
        out.append(ubox('cbar_h', u0, -0.07, u1, 0.03, z, z + 0.07, M['rim'], bevel=0.01))
    # the lock: a heavy maglock, red light (drops at the end of the fight)
    out.append(ubox('lock', 4.9, 0.0, 5.3, 0.14, 0.62, 1.02, M['gunmetal'], bevel=0.03))
    out.append(ubox('lock_led', 5.02, 0.13, 5.18, 0.16, 0.88, 0.96, M['red_led'], bevel=0))
    out.append(text('lock_lbl', 'CAPTAIN\nONLY', 5.1, 0.15, 0.73, 0.045, M['sticker'], face=True))
    out.append(text('cell_lbl', 'GUEST QUARTERS', 5.0, 0.04, H_FULL + 0.06, 0.12, M['sticker'], face=True))
    # inside: a bucket, a bedroll, tally marks, her lab coat... (Varga herself is composited from her game sprite)
    out.append(cbox('bedroll', 3.8, -1.4, 1.2, 0.6, FLOOR_Z, 0.1, worn('bedroll', '#4a6a4a', 0.9, 0.0, grime=0.8), bevel=0.04))
    out.append(ucyl('bucket', 0.17, 0.3, 6.5, -1.5, FLOOR_Z, M['steel'], verts=20))
    for k in range(9):
        out.append(ubox('tally', 6.0 + k * 0.06, v0 + 0.03, 6.02 + k * 0.06, v0 + 0.05, 0.6, 0.85, M['white'], bevel=0))
    t = cbox('tally_x', 6.25, v0 + 0.05, 0.55, 0.01, 0.7, 0.02, M['white'], bevel=0); t.rotation_euler = (0, 0.4, 0); out.append(t)
    out.append(text('cell_note', 'E = mc²\n(HELP)', 4.3, v0 + 0.06, 1.15, 0.07, M['white'], face=True))

def escape_pod(M, out):
    u0, v0, u1, v1 = POD
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    # the pod sits in its launch well in the wall's top, nose up; a launch rail; hazard collar
    out.append(ubox('pod_well', u0, v0, u1, v1, 0.2, 0.3, M['dark'], bevel=0))
    out.append(D.ring('pod_collar', 0.86, 0.14, 0.12, loc=P(cu, cv, H_FULL - 0.05), m=M['hazard']))
    out.append(mn.cyl('pod_body', 0.68, 1.15, loc=P(cu, cv, 0.4), m=worn('podc', '#d8d4c8', 0.5, 0.1, wear=0.5, grime=0.7), verts=36, bevel=0.06))
    out.append(mn.sphere('pod_nose', 0.68, loc=P(cu, cv, 1.55), m=worn('podn', '#d8d4c8', 0.5, 0.1, wear=0.5, grime=0.7), scale=(1, 1, 0.65), segs=32))
    out.append(D.ring('pod_band', 0.7, 0.1, 0.16, loc=P(cu, cv, 1.45), m=M['coat']))
    out.append(mn.sphere('pod_window', 0.22, loc=P(cu, cv + 0.4, 1.86), m=M['glass'], scale=(1.2, 0.8, 0.6), segs=20))
    out.append(text('pod_lbl', 'R.C. 1', cu, cv - 0.2, 2.0, 0.16, M['red']))
    for k in range(4):
        a_ = k * math.pi / 2 + 0.4
        out.append(mn.cyl('pod_fin', 0.06, 0.4, loc=P(cu + 0.72 * math.cos(a_), cv + 0.72 * math.sin(a_), 1.15), m=M['gunmetal'], verts=10, bevel=0.01))
    # the hatch on the wall face, its sign and the launch lever
    out.append(ubox('pod_door', 0.6, 0.0, 1.9, 0.06, 0.0, 1.35, M['gunmetal'], bevel=0.04))
    out.append(ubox('pod_door_hz', 0.55, 0.0, 1.95, 0.05, 1.35, 1.45, M['hazard'], bevel=0.01))
    out.append(mn.cyl('pod_port', 0.18, 0.04, loc=P(1.25, 0.06, 0.9), m=M['glass'], rot=(R90, 0, 0), verts=20, bevel=0.01))
    out.append(D.ring('pod_port_r', 0.21, 0.05, 0.05, loc=P(1.25, 0.06, 0.9), m=M['brass'], rot=(R90, 0, 0)))
    out.append(text('pod_sign', 'ESCAPE POD\nCAPTAIN ONLY', 1.25, 0.08, 0.45, 0.075, M['sticker'], face=True))
    out.append(ubox('lever_box', 2.0, 0.0, 2.2, 0.1, 0.7, 1.0, M['red'], bevel=0.02))
    out.append(ucyl('lever', 0.025, 0.25, 2.1, 0.12, 0.95, M['steel'], verts=8, bevel=0))
    out.append(mn.sphere('lever_knob', 0.05, loc=P(2.1, 0.12, 1.22), m=M['red_led'], segs=10))

def hall(M, rng):
    out = []
    u0, v0, u1, v1 = HULL
    out.append(prism('belly', rrect_pts(u0 + 0.12, v0 + 0.1, u1 - 0.12, v1 - 0.04, HULL_RAD), -0.55, 0.02, M['hull2'], bevel=0.06))
    out.append(mass('low_deck', rrect_pts(u0, 0.0, u1, v1, HULL_RAD, corners=(0, 0, 1, 1)), 0.0, H_LOW, [ROOM], M['hull'], bevel=0.03))
    out.append(mass('upper', rrect_pts(u0, v0, u1, 0.0, HULL_RAD, corners=(1, 1, 0, 0)), 0.0, H_FULL,
                    [CELL, (DOOR[0], DOOR[1] - 1, DOOR[2], DOOR[3] + 0.05), (POD[0], POD[1], POD[2], POD[3])], M['hull'], bevel=0.03))
    style = dict(plate_mats=M['plates'], tread_mat=M['tread'], tread=0.1, grille=0.08, wonky=0.05, lost_rivets=0.06)
    floor_room(ROOM, M, rng, style, out)
    floor_room(DOOR, M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
    out.append(ubox('lip_s', ROOM[0] - 0.02, ROOM[3], ROOM[2] + 0.02, ROOM[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
    # back wall segments
    out.append(ubox('podwall', POD[0] - 0.3, 0.0, 2.95, 0.03, 0.0, H_FULL - 0.05, M['panel2'], bevel=0.01))
    back_wall(7.0, DOOR[0], 0.0, M, rng, out)
    back_wall(DOOR[2], 12.0, 0.0, M, rng, out, skip=[(11.0, 12.0)])
    for uu in (DOOR[0] - 0.08, DOOR[2]):
        out.append(ubox('door_jamb', uu, -0.1, uu + 0.08, 0.02, 0.0, H_FULL - 0.1, M['hazard'], bevel=0.005))
    out.append(ubox('door_led', DOOR[0] - 0.08, -0.06, DOOR[2] + 0.08, 0.0, H_FULL - 0.25, H_FULL - 0.17, M['red_led'], bevel=0.005))
    out.append(text('door_lbl', 'GUN CORRIDOR', 10.3, 0.02, H_FULL + 0.05, 0.1, M['sticker'], face=True))
    out.append(text('door_floor', 'WIPE YOUR BOOTS', 10.3, 0.5, FLOOR_Z + 0.003, 0.11, M['sticker']))
    cell(M, out); escape_pod(M, out); portrait(M, 11.08, 11.97, out)
    # WANTED poster between the pod and the cell
    out.append(ubox('wanted', 2.28, 0.0, 2.88, 0.03, 0.75, 1.5, M['parch'], bevel=0.005))
    out.append(text('wanted_t', 'WANTED', 2.58, 0.035, 1.4, 0.09, M['red'], face=True))
    out.append(ucyl('wanted_cat', 0.13, 0.01, 2.58, 0.035, 1.1, M['cat'], axis='v', verts=16, bevel=0))
    out[-1].location = P(2.58, 0.04, 1.13)
    out.append(text('wanted_t2', 'ONE SHIP CAT\n10,000 CR', 2.58, 0.035, 0.87, 0.055, M['black'], face=True))
    # trophies: a ship's wheel on the wall right of the door, a mounted alien head above the cell, a stolen nameplate
    out.append(ubox('plaque_t', 7.15, 0.0, 7.4, 0.04, 1.2, 1.4, M['wood'], bevel=0.01))
    out.append(mn.sphere('alien_head', 0.25, loc=P(6.4, -0.25, H_FULL + 0.2), m=M['alien'], scale=(1.2, 1, 0.9), segs=20))
    for su in (-1, 1):
        out.append(mn.sphere('alien_eye', 0.06, loc=P(6.4 + su * 0.12, -0.05, H_FULL + 0.25), m=M['slime'], segs=10))
        out.append(pipe_uv('alien_horn', [(6.4 + su * 0.2, -0.3, H_FULL + 0.35), (6.4 + su * 0.42, -0.4, H_FULL + 0.55), (6.4 + su * 0.5, -0.45, H_FULL + 0.75)], 0.04, M['white'], corner=0.1))
    out.append(ubox('alien_board', 6.0, -0.5, 6.8, -0.1, H_FULL, H_FULL + 0.08, M['wood'], bevel=0.02))
    out.append(text('nameplate', 'HMS NOT-YOURS', 8.2, -1.2, H_FULL + 0.01, 0.16, M['gold']))
    # roof: cable trays, the base's pirate flag pole
    tray(-0.4, -2.2, 12.4, -1.5, H_FULL, M, out, 'u')
    out.append(ucyl('flagpole', 0.035, 1.2, 11.9, -1.9, H_FULL, M['steel'], verts=8))
    out.append(ubox('flag', 11.94, -1.92, 12.6, -1.88, H_FULL + 0.75, H_FULL + 1.18, M['black'], bevel=0.005))
    out.append(text('flag_s', '☠', 12.27, -1.86, H_FULL + 0.96, 0.25, M['white'], face=True))
    # the throne in front of the portrait, a red carpet down from it
    throne(M, 8.2, 1.25, out)
    out.append(ubox('carpet', 7.65, 2.4, 8.75, 5.6, FLOOR_Z, FLOOR_Z + 0.02, M['carpet'], bevel=0.005))
    out.append(ubox('carpet_trim', 7.55, 2.4, 7.65, 5.6, FLOOR_Z, FLOOR_Z + 0.025, M['gold'], bevel=0.003))
    out.append(ubox('carpet_trim2', 8.75, 2.4, 8.85, 5.6, FLOOR_Z, FLOOR_Z + 0.025, M['gold'], bevel=0.003))
    for k in range(9): out.append(cbox('fringe', 7.7 + k * 0.13, 5.68, 0.04, 0.16, FLOOR_Z, 0.015, M['gold'], bevel=0))
    # cover 1: his overturned desk (on its side, top facing him, legs sticking out, drawers spilled)
    du, dv, dl, dd, da = DESK
    rz = math.radians(da)
    nu, nv = math.cos(rz + R90), math.sin(rz + R90)                # away from the captain
    out.append(cbox('desk_top', du, dv, dl, 0.12, FLOOR_Z, 0.85, M['wood'], bevel=0.03, rotz=rz))
    out.append(cbox('desk_edge', du - nu * 0.04, dv - nv * 0.04, dl + 0.04, 0.06, FLOOR_Z + 0.82, 0.06, M['gold'], bevel=0.02, rotz=rz))
    for s_ in (-0.8, 0.8):
        for zz in (0.12, 0.66):
            out.append(cbox('desk_leg', du + math.cos(rz) * s_ + nu * 0.36, dv + math.sin(rz) * s_ + nv * 0.36, 0.62, 0.1, zz, 0.1, M['wood'], bevel=0.02, rotz=rz + R90))
    out.append(cbox('drawer', du + nu * 0.8 + 0.3, dv + nv * 0.8, 0.5, 0.4, FLOOR_Z, 0.15, M['wood'], bevel=0.02, rotz=0.4))
    for k in range(6):
        out.append(cbox('paper', du + rng.uniform(-1.2, 1.2) + nu * rng.uniform(0.4, 1.2), dv + nv * rng.uniform(0.3, 1.0), 0.22, 0.3, FLOOR_Z, 0.004, M['paper'], bevel=0, rotz=rng.uniform(0, 3)))
    out.append(text('desk_lbl', "CAPTAIN'S DESK", du - nu * 0.07, dv - nv * 0.07, 0.4, 0.09, M['sticker'], face=False, rotz=-rz + math.pi))
    # cover 2: the treasure chest (lid open, gold spilling)
    cu_, cv_, cw, cd = CHEST
    out.append(cbox('chest', cu_, cv_, cw, cd, FLOOR_Z, 0.55, M['wood'], bevel=0.04))
    for k in (-0.38, 0.38): out.append(cbox('chest_band', cu_ + k, cv_, 0.08, cd + 0.03, FLOOR_Z, 0.57, M['brass'], bevel=0.01))
    out.append(mn.sphere('chest_gold', 0.48, loc=P(cu_, cv_, 0.5), m=M['gold'], scale=(1.0, 0.65, 0.3), segs=20))
    lid = cbox('chest_lid', cu_, cv_ - cd / 2 - 0.05, cw, 0.12, 0.5, 0.45, M['wood'], bevel=0.04); out.append(lid)
    out.append(cbox('chest_lock', cu_, cv_ + cd / 2, 0.14, 0.04, 0.32, 0.16, M['gold'], bevel=0.01))
    for k in range(9):
        out.append(mn.cyl('coin', 0.06, 0.015, loc=P(cu_ + rng.uniform(-0.9, 0.9), cv_ + rng.uniform(0.45, 1.0), FLOOR_Z), m=M['gold'], verts=12, bevel=0.004))
    out.append(mn.cyl('goblet', 0.07, 0.2, loc=P(cu_ - 0.7, cv_ + 0.5, FLOOR_Z), m=M['gold'], verts=12, bevel=0.01))
    # cover 3: the pillar, a jolly roger banner and a coil of rope
    pu, pv, pr = PILLAR
    out.append(ucyl('pillar', pr, H_FULL + 0.3, pu, pv, 0.0, M['panel'], verts=32, bevel=0.04))
    for z in (0.0, H_FULL + 0.15): out.append(ucyl('pillar_ring', pr + 0.06, 0.15, pu, pv, z, M['rim'], verts=32, bevel=0.03))
    out.append(ucyl('pillar_cap', pr + 0.02, 0.02, pu, pv, H_FULL + 0.3, M['hazard'], verts=32, bevel=0.0))
    out.append(ucyl('pillar_cap2', pr - 0.12, 0.03, pu, pv, H_FULL + 0.31, M['dark'], verts=32, bevel=0.0))
    out.append(ubox('banner', pu - 0.3, pv + pr - 0.01, pu + 0.3, pv + pr + 0.01, 0.6, 1.55, M['black'], bevel=0.0))
    skull(pu, pv + pr + 0.02, 1.2, 0.5, M['white'], out, face=True)
    out.append(D.ring('rope', 0.28, 0.1, 0.1, loc=P(pu + 0.6, pv + 0.55, FLOOR_Z), m=M['parch']))
    out.append(ubox('pillar_hz', pu - pr, pv + pr - 0.03, pu + pr, pv + pr + 0.0, 0.2, 0.4, M['hazard'], bevel=0.0))
    # the map table (west), with a map, a dagger stuck in it, a compass, a mug
    mu, mv = 1.55, 3.4
    out.append(cbox('mt', mu, mv, 1.6, 1.1, FLOOR_Z, 0.78, M['wood'], bevel=0.04))
    out.append(cbox('mt_top', mu, mv, 1.7, 1.2, 0.78, 0.06, M['brown'], bevel=0.02))
    out.append(cbox('map', mu, mv, 1.35, 0.9, 0.84, 0.005, M['parch'], bevel=0))
    for k in range(6):
        out.append(cbox('map_route', mu - 0.5 + k * 0.18, mv + 0.15 * math.sin(k), 0.1, 0.02, 0.846, 0.002, M['red'], bevel=0, rotz=0.4 * math.cos(k)))
    out.append(cbox('map_x', mu + 0.45, mv - 0.1, 0.16, 0.035, 0.847, 0.003, M['red'], bevel=0, rotz=0.78))
    out.append(cbox('map_x2', mu + 0.45, mv - 0.1, 0.16, 0.035, 0.847, 0.003, M['red'], bevel=0, rotz=-0.78))
    out.append(text('map_t', 'OUR SHIP?', mu - 0.2, mv - 0.32, 0.848, 0.06, M['black']))
    out.append(mn.box('dagger', (0.04, 0.04, 0.28), loc=P(mu + 0.45, mv - 0.1, 0.84), m=M['steel'], bevel=0.005))
    out.append(mn.box('dagger_h', (0.16, 0.05, 0.04), loc=P(mu + 0.45, mv - 0.1, 1.12), m=M['gold'], bevel=0.01))
    out.append(ucyl('compass', 0.12, 0.04, mu - 0.5, mv + 0.25, 0.84, M['brass'], verts=20))
    out.append(ucyl('mug', 0.07, 0.15, mu + 0.6, mv + 0.35, 0.84, M['white'], verts=14))
    for su in (-1, 1): out.append(cbox('stool', mu + su * 0.6, mv + 0.95, 0.4, 0.4, FLOOR_Z, 0.45, M['wood'], bevel=0.04))
    # loot piles: south-west corner and east wall
    for (lu, lv) in ((0.8, 9.0), (11.3, 3.0)):
        out.append(cbox('loot_crate', lu, lv, 0.8, 0.7, FLOOR_Z, 0.6, M['wood'], bevel=0.04, rotz=0.2))
        out.append(mn.sphere('loot_gold', 0.35, loc=P(lu + 0.5, lv + 0.3, 0.0), m=M['gold'], scale=(1.3, 1.1, 0.5), segs=16))
        out.append(ucyl('loot_barrel', 0.24, 0.7, lu - 0.55, lv - 0.2, FLOOR_Z, M['red'], verts=20))
    out.append(text('loot_t', 'MINE', 0.8, 9.0, 0.66, 0.12, M['white'], rotz=0.2))
    # a burn mark from an earlier comet near the door, oil, junk
    stain(5.6, 8.4, 0.45, M['scorch'], out); stain(2.6, 1.5, 0.3, M['oil'], out)
    debris(0.4, 0.6, 11.6, 9.6, 26, [M['steel'], M['gold'], M['dark'], M['paper']], rng, out,
           avoid=[(CAPT[0], CAPT[1], 1.0), (DECOY[0], DECOY[1], 0.6), (FLANK[0], FLANK[1], 0.6), (EXT[0], EXT[1], 0.6), (FIRE[0], FIRE[1], 0.9)])
    # the cat's bed (empty; the poster explains why)
    out.append(ucyl('catbed', 0.36, 0.12, 11.2, 9.3, FLOOR_Z, M['coat'], verts=24))
    out.append(ucyl('catbed_in', 0.27, 0.13, 11.2, 9.3, FLOOR_Z + 0.02, M['coat_in'], verts=24))
    out.append(text('catbed_t', 'RESERVED', 11.2, 9.75, FLOOR_Z + 0.003, 0.08, M['sticker']))
    # floor stencils and the south lip's plaque
    out.append(text('stencil', "CAPTAIN'S HALL", 4.2, 9.25, FLOOR_Z + 0.003, 0.3, M['sticker']))
    out.append(text('plaque', 'RULE 1: THE CAPTAIN IS ALWAYS RIGHT  ·  RULE 2: SEE RULE 1', 6.0, 10.4, H_LOW + 0.003, 0.17, M['white']))
    return out

def sight_lines(M, out):
    """The BROADSIDE telegraph: 5 red laser sights fanning from his cannon, stopped by walls and cover."""
    cu, cv = CAPT; base = math.radians(142)
    du, dv, dl, dd, da = DESK; rz = math.radians(da)
    def hit_desk(px, py, dx, dy):
        # segment intersection with the desk's long axis (a thin wall)
        ax, ay = du - math.cos(rz) * dl / 2, dv - math.sin(rz) * dl / 2; bx, by = du + math.cos(rz) * dl / 2, dv + math.sin(rz) * dl / 2
        ex, ey = bx - ax, by - ay; den = dx * ey - dy * ex
        if abs(den) < 1e-9: return None
        t = ((ax - px) * ey - (ay - py) * ex) / den; s = ((ax - px) * dy - (ay - py) * dx) / den
        return t if t > 0 and 0 <= s <= 1 else None
    ends = []
    for k in range(-2, 3):
        a_ = base + math.radians(15 * k)
        dx, dy = math.cos(a_), math.sin(a_)
        px, py = cu + dx * 1.3, cv + dy * 1.3
        ts = []
        for (lim, d_, p_) in ((0.05, dx, px), (11.95, dx, px)):
            if d_: t = (lim - p_) / d_; ts.append(t if t > 0 else 99)
        for (lim, d_, p_) in ((0.05, dy, py), (9.95, dy, py)):
            if d_: t = (lim - p_) / d_; ts.append(t if t > 0 else 99)
        hd = hit_desk(px, py, dx, dy)
        if hd: ts.append(hd)
        L = min(ts)
        mu_, mv_ = px + dx * L / 2, py + dy * L / 2
        out.append(cbox('sight', mu_, mv_, L, 0.05, FLOOR_Z + 0.004, 0.006, M['sight'], bevel=0, rotz=a_))
        out.append(cbox('sight_glow', mu_, mv_, L, 0.16, FLOOR_Z + 0.003, 0.004, M['sight_dim'], bevel=0, rotz=a_))
        out.append(disc('sight_dot', px + dx * L, py + dy * L, FLOOR_Z + 0.012, 0.09, M['sight']))
        ends.append((px + dx * L, py + dy * L))
    return ends

def build_hall():
    mn.reset(); set_side('port'); mn.PPU = 100
    rng = random.Random(11); M = mats()
    out = hall(M, rng)
    ends = sight_lines(M, out)
    root, parts = captain(M, phase=1, at=CAPT, face=142.0, scale=1.25)
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    skip = ('stain', 'plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'led', 'stencil', 'text', 'tape', 'sight', 'paper', 'coin', 'tally',
            'map', 'carpet', 'fringe', 'door_floor', 'plaque', 'wanted_t', 'pt_', 'canvas', 'nameplate', 'catbed_t', 'pod_lbl', 'pod_sign', 'cell_', 'lock_lbl',
            't_lbl', 't_eject', 'desk_lbl', 'loot_t', 'flag_s', 'alien_eye', 'frv', 'slot', 'em', 'hole', 'shard', 'can', 'bolt', 'box')
    rest = [o for o in out if o not in big and not o.name.startswith(skip)]
    mn.outline(big, thickness=0.02); mn.outline(rest, thickness=0.012)
    s = bpy.context.scene
    if os.environ.get('DOCK_CPU'): s.cycles.device = 'CPU'
    x0, x1 = HULL[0] - 0.1, HULL[2] + 0.1
    y0 = -HULL[3] * SIN - 0.15; y1 = -HULL[1] * SIN + (H_FULL + 1.3) * COS
    w, h, ox, oy = mn._frame(None, (x0, x1, y0, y1))
    os.makedirs(OUT, exist_ok=True)
    mn._render_to(os.path.join(OUT, 'hall_raw.png'), 'beauty')
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU, 'elev': mn.ELEVATION, 'sight_ends': ends,
               'note': 'pixel = (ox + u*ppu, oy - (-v*sin(e) + z*cos(e))*ppu), hall frame'}, open(os.path.join(OUT, 'hall_raw.json'), 'w'))
    print('[concept] hall', w, h)

def build_sheet():
    mn.reset(); set_side('port'); mn.PPU = 150
    M = mats(); out = []
    poses = [dict(phase=1, face=115.0), dict(phase=1, face=-55.0), dict(phase=2, face=-125.0), dict(phase=2, face=180.0, dash=True, lean=0.22)]
    xs = [0.0, 3.2, 6.6, 10.0]
    for x, pz in zip(xs, poses):
        out.append(ucyl('pad', 1.25, 0.06, x, 0.0, -0.06, worn('pad', '#4a4246', 0.5, 0.3, wear=0.5, rust=0.1), verts=48))
        out.append(D.ring('pad_rim', 1.3, 0.08, 0.08, loc=P(x, 0.0, -0.07), m=M['hazard'], verts=48))
        captain(M, at=(x, 0.0), **pz)
    # phase 2 props: the coat thrown down, a blue leak puddle; the dash's lean is done by the jets' direction
    coat_on_floor(M, xs[2] + 0.55, 0.85, out, rotz=0.3)
    out.append(disc('puddle', xs[2] + 0.45, -0.5, 0.005, 0.32, M['leak'], sv=0.7))
    out.append(disc('puddle2', xs[3] + 1.0, 0.1, 0.005, 0.22, M['leak'], sv=0.7))
    mn.outline([o for o in out if o.name.startswith(('pad', 'fcoat', 'fsleeve'))], thickness=0.014)
    s = bpy.context.scene
    if os.environ.get('DOCK_CPU'): s.cycles.device = 'CPU'
    x0, x1 = -1.5, 11.8; y0 = -1.4 * SIN - 0.2; y1 = 1.4 * SIN + 2.6 * COS
    w, h, ox, oy = mn._frame(None, (x0, x1, y0, y1))
    os.makedirs(OUT, exist_ok=True)
    mn._render_to(os.path.join(OUT, 'sheet_raw.png'), 'beauty')
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU, 'xs': xs}, open(os.path.join(OUT, 'sheet_raw.json'), 'w'))
    print('[concept] sheet', w, h)

if MODE == 'sheet': build_sheet()
else: build_hall()
