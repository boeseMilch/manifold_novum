"""Pirate boarder (js/dock.js drawPirate / updatePirate): a rough Red Comet ganger in a battered
red-brown suit. Crew proportions (same skeleton as models/crew/crew.py, via charlib.Human) so it reads
as a person, but a mean silhouette: open-face gunmetal helmet with a red bristle crest, a spiked
pauldron, a tattered skull pennant on the pack, a bandolier and a chunky blaster carbine.

Sprites (build/renders/chars/pirate/), 8 directions each (dir i faces game angle i*45deg = p.face),
same canvas and ground origin (the game's (p.x, p.y)) for every upright set:
  pirate/idle      1 frame   standing, gun low
  pirate/walk      8 frames  crew.py's walk cycle (loops)
  pirate/aim       1 frame   p.aim > 0: two-handed, gun levelled at shoulder height (the laser sight
                             and its lock flicker stay procedural: drawn from the muzzle along p.face)
  pirate/carry     8 frames  p.carry: walking with a loot sack over the left shoulder (the game can
                             keep drawing drawItemIcon next to it to say what was stolen)
  pirate/stunned   2 frames  p.stun > 0: dazed and slumped (alternate slowly; stars stay procedural)
  pirate/down      1 frame   lying on the back, head towards the facing direction (own canvas/origin:
                             the body's centre sits on the ground origin)
The hurt flash, the red halo, the name tag and the HP pips stay procedural.

    blender -b --factory-startup --python tools/blender/models/chars/pirate.py
    MN_PREVIEW=1 ...   16 samples, beauty only, into /tmp/chars_preview
"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
import mn
import charlib as C

PREVIEW = C.preview_setup('chars')
ONLY = os.environ.get('MN_ONLY', '').split(',') if os.environ.get('MN_ONLY') else None
mn.reset(); C.maybe_cpu()

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
SUIT = C.worn('suit', '#b85a42', 0.72, 0.0, grime=1.4, scratches=0.6, scale=2)
SUIT_DK = C.worn('suitDark', '#7e3a2e', 0.75, 0.0, grime=1.4, scratches=0.4, scale=2)
LEATHER = C.worn('leather', '#6a4630', 0.6, 0.0, grime=1.0, scratches=0.8, scale=3)
ARMOR = C.worn('armor', '#8c929e', 0.42, 0.1, grime=1.2, scratches=1.0, scale=2)
ARMOR_DK = C.worn('armorDark', '#565c68', 0.45, 0.1, grime=1.0, scratches=1.0, scale=2)
BONE = C.worn('skullPaint', '#ece4d0', 0.55, 0.0, grime=1.3, scratches=0.8, scale=3)
RED = C.worn('red', '#d23a2c', 0.7, 0.0, grime=1.0, scratches=0.0, scale=3)
BRASS = mn.mat('brass', 'copper', 0.3, 1.0)
DARK = mn.mat('dark', '#16181d', 0.6)
RUBBER = mn.mat('rubber', 'rubber', 0.8)
TAPE = mn.mat('tape', '#9da3a8', 0.85)
SKIN = mn.mat('skin', '#d9a47c', 0.6, emit='#d9a47c', emit_strength=0.35)
SKIN_DK = mn.mat('skinShade', '#b98260', 0.6, emit='#b98260', emit_strength=0.2)
STUBBLE = mn.mat('stubble', '#3a2a24', 0.9, emit='#3a2a24', emit_strength=0.1)
HAIR = mn.mat('hair', '#22160f', 0.8)
EYE = mn.mat('eye', '#1a1410', 0.3)
GLINT = mn.mat('glint', '#ffffff', 0.2, emit='#ffffff', emit_strength=2.5)
SCAR = mn.mat('scar', '#a85a4a', 0.6, emit='#a85a4a', emit_strength=0.2)
MOUTH = mn.mat('mouth', '#4a1c18', 0.5)
L_RED = C.glow('ledR', '#ff4a3a', 3.0)
SIGHT = C.glow('sight', '#ff3a2a', 1.5, base='#c01a10', rough=0.1)
ENERGY = C.glow('cell', '#ff7a3a', 1.2, base='#a02a10')

parts = []
def keep(*objs):
    parts.extend(objs); return objs[0]
def add(o, parent):
    return keep(C.attach(o, parent))

R = C.Human('pirate')
HIP_Z = C.HIP_Z

def skull(name, loc, normal, size, m=BONE, eyes=DARK, up=(0, 0, 1)):
    """A flat painted skull + crossbones decal facing `normal` (thin, slightly raised)."""
    n = Vector(normal).normalized(); u = Vector(up); u = (u - n * u.dot(n)).normalized(); r = n.cross(u)
    M = Matrix((r, u, n)).transposed().to_4x4(); M.translation = Vector(loc)
    objs = []
    def mk(o, x, y, z=0.0):
        mn._apply_scale(o); o.matrix_world = M @ Matrix.Translation((x * size, y * size, z * size)); objs.append(o); return o
    mk(mn.sphere(name + 'Cran', 1, m=m, scale=(0.5 * size, 0.46 * size, 0.07 * size), segs=24), 0, 0.12)
    mk(mn.box(name + 'Jaw', (0.5 * size, 0.28 * size, 0.1 * size), m=m, bevel=0.06 * size), 0, -0.36, -0.05)
    for s in (-1, 1):
        mk(mn.sphere(name + f'Eye{s}', 1, m=eyes, scale=(0.15 * size, 0.13 * size, 0.06 * size), segs=12), s * 0.19, 0.06, 0.05)
        b = mn.box(name + f'Bone{s}', (1.5 * size, 0.12 * size, 0.06 * size), m=m, bevel=0.04 * size)
        b.matrix_world = M @ Matrix.Translation((0, -0.32 * size, -0.03 * size)) @ Matrix.Rotation(s * 0.6, 4, 'Z'); objs.append(b)
    mk(mn.sphere(name + 'Nose', 1, m=eyes, scale=(0.06 * size, 0.08 * size, 0.06 * size), segs=8), 0, -0.12, 0.05)
    return objs

# ---------------------------------------------------------------------------
# Body (rest pose, world space; same layout as crew.py so the rig fits)
# ---------------------------------------------------------------------------
T, H = R.torso, R.hips
add(mn.box('body', (0.30, 0.36, 0.40), loc=(0.0, 0, 0.39), m=SUIT, bevel=0.11), T)
add(mn.box('chestPlate', (0.06, 0.30, 0.24), loc=(0.135, 0, 0.5), m=ARMOR, bevel=0.03), T)
for o in skull('chestSkull', (0.168, 0, 0.62), (1, 0, 0.35), 0.17): add(o, T)
add(mn.box('belt', (0.32, 0.38, 0.06), loc=(0.0, 0, 0.42), m=LEATHER, bevel=0.025), T)
add(mn.box('buckle', (0.04, 0.09, 0.06), loc=(0.16, 0, 0.42), m=BRASS, bevel=0.012), T)
for i, y in enumerate((-0.15, 0.13)):
    add(mn.box(f'pouch{i}', (0.09, 0.07, 0.08), loc=(0.11, y, 0.39), m=LEATHER, bevel=0.02), T)
# bandolier: right hip to left shoulder, with brass shells
bd = mn.box('bandolier', (0.34, 0.06, 0.035), loc=(0.0, 0, 0.0), m=LEATHER, bevel=0.012)
bd.matrix_world = Matrix.Translation((0.0, 0.02, 0.6)) @ Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(-48), 4, 'X') @ Matrix.Scale(1.0, 4)
bd.scale = (1, 1, 1)
C.apply_tf(bd)
# wrap the strap over the round chest: push it outwards to the body surface
for v in bd.data.vertices:
    v.co.x = (0.168 if v.co.x > 0 else -0.168) + (v.co.x - (0.017 if v.co.x > 0 else -0.017)) * 0.4
add(bd, T)
for k in range(5):
    tk = (k - 2) * 0.055
    add(mn.cyl(f'shell{k}', 0.012, 0.04, loc=(0.19, 0.02 + tk * 0.74, 0.6 - tk * 0.67 - 0.02), m=BRASS, bevel=0.005, verts=10,
               rot=(math.radians(48), 0, 0)), T)
add(mn.box('pelvis', (0.27, 0.30, 0.14), loc=(0.0, 0, 0.32), m=SUIT_DK, bevel=0.06), H)
add(mn.box('codPlate', (0.05, 0.14, 0.1), loc=(0.135, 0, 0.3), m=ARMOR_DK, bevel=0.02), H)

# pack: two dented tanks, a battery cell and a pole with a tattered skull pennant
add(mn.box('pack', (0.15, 0.32, 0.38), loc=(-0.215, 0, 0.44), m=ARMOR_DK, bevel=0.045), T)
for s in (-1, 1):
    add(mn.cyl(f'tank{s}', 0.06, 0.32, loc=(-0.3, s * 0.085, 0.46), m=SUIT_DK, bevel=0.03), T)
    add(mn.cyl(f'tankBand{s}', 0.064, 0.03, loc=(-0.3, s * 0.085, 0.58), m=LEATHER, bevel=0.008), T)
add(mn.box('cell', (0.04, 0.12, 0.06), loc=(-0.31, 0, 0.7), m=ENERGY, bevel=0.012), T)
add(mn.box('tape', (0.012, 0.13, 0.045), loc=(-0.36, 0.08, 0.5), m=TAPE, bevel=0.004, rot=(0.35, 0, 0)), T)
add(mn.cyl('pole', 0.011, 0.5, loc=(-0.29, -0.13, 0.78), m=ARMOR, bevel=0.004, verts=8), T)
add(mn.sphere('poleTip', 0.022, loc=(-0.29, -0.13, 1.29), m=L_RED, segs=12), T)
flag = bpy.data.meshes.new('flag'); bm = bmesh.new()
fp = [(0, 0), (0, -0.17), (-0.2, -0.15), (-0.15, -0.11), (-0.23, -0.075), (-0.16, -0.04), (-0.22, 0.0)]
vs = [bm.verts.new((-0.3 + x, -0.13, 1.26 + z)) for x, z in fp]; f = bm.faces.new(vs)
r = bmesh.ops.extrude_face_region(bm, geom=[f]); bmesh.ops.translate(bm, verts=[g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0.012, 0))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(flag); bm.free()
fo = mn.link(bpy.data.objects.new('flag', flag)); mn.assign(fo, RED); mn.smooth(fo)
for v in fo.data.vertices: v.co.y += 0.03 * math.sin((v.co.x + 0.3) * 25)       # a bit of flutter
add(fo, T)
for o in skull('flagSkull', (-0.39, -0.13 + 0.03 * math.sin(-0.09 * 25) + 0.013, 1.175), (0, 1, 0.25), 0.075): add(o, T)
for o in skull('flagSkullB', (-0.39, -0.13 + 0.03 * math.sin(-0.09 * 25) - 0.001, 1.175), (0, -1, 0.25), 0.075): add(o, T)

# collar + helmet: battered gunmetal open-face helmet with a red bristle crest
HEAD = Vector((0.03, 0, 0.985)); HR = 0.215
add(mn.cyl('collar', 0.165, 0.07, loc=(0.0, 0, 0.765), m=DARK, bevel=0.025), T)
add(mn.cyl('collarRing', 0.18, 0.035, loc=(0.0, 0, 0.775), m=ARMOR, bevel=0.012), T)
add(mn.box('scarf', (0.2, 0.34, 0.06), loc=(0.02, 0, 0.74), m=RED, bevel=0.03, rot=(0, 0.15, 0)), T)
helmet = mn.sphere('helmet', HR, loc=HEAD, m=ARMOR, segs=96)
C.window(helmet, 0.19, 0.16, 0.025, False)
sol = helmet.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.024; sol.offset = -1
helmet.data.materials.append(DARK); sol.material_offset_rim = 1; sol.material_offset = 1
add(helmet, R.head)
add(mn.box('brim', (0.05, 0.26, 0.03), loc=HEAD + Vector((0.12, 0, 0.19)), m=ARMOR_DK, bevel=0.012, rot=(0, 0.9, 0)), R.head)
for k in range(7):                                    # the crest: a row of red bristles, front to back
    a = math.radians(2 + k * 16)
    p = HEAD + Vector((math.sin(-a) * -HR * 0.98, 0, math.cos(a) * HR * 0.98))
    h = 0.11 - abs(k - 2.5) * 0.012
    sp = C.spike(f'crest{k}', 0.035, h, RED, verts=8); sp.scale = (1.0, 0.45, 1.0)
    sp.location = p; sp.rotation_euler = (0, a - 0.35, 0); add(sp, R.head)
for s in (-1, 1):
    add(mn.box(f'earPlate{s}', (0.11, 0.03, 0.12), loc=HEAD + Vector((-0.01, s * (HR + 0.005), -0.07)), m=ARMOR_DK, bevel=0.012), R.head)
    for k, dx in enumerate((-0.03, 0.03)):
        add(mn.sphere(f'rivet{s}{k}', 0.011, loc=HEAD + Vector((dx, s * (HR + 0.022), -0.02)), m=BRASS, segs=8), R.head)
add(mn.box('dentTape', (0.1, 0.04, 0.012), loc=HEAD + Vector((-0.1, 0.12, 0.15)), m=TAPE, bevel=0.004, rot=(0.6, -0.3, 0.4)), R.head)

# the face: scowl, eyepatch, scar, stubble
face = C.Face(R, keep, HEAD + Vector((0.022, 0, 0.0)), 0.165, tilt=28)
face.add(mn.sphere('face', 0.165, loc=face.c, m=SKIN))
face.add(mn.sphere('hair', 0.155, loc=HEAD + Vector((-0.04, 0, 0.04)), m=HAIR, scale=(1, 1.06, 0.98)))
face.blob('stubble', STUBBLE, (0.06, 0.12, 0.07), 0, -32, out=-0.045)
for s in (-1, 1):
    face.blob(f'jaw{s}', STUBBLE, (0.05, 0.05, 0.06), s * 34, -24, out=-0.03)
face.blob('eyeL', EYE, (0.012, 0.024, 0.026), 22, 6, out=-0.004)            # his left eye (screen right when facing you)
face.blob('glintL', GLINT, (0.006, 0.009, 0.009), 18, 11, out=0.004)
face.blob('patch', DARK, (0.014, 0.04, 0.036), -22, 5, out=0.0)                # eyepatch over the right eye
face.curve('strap', DARK, [(-60, 30), (-30, 20), (0, 16), (30, 22), (60, 30)], r=0.007, out=0.0)
for s in (-1, 1):                                   # mean brows: low and angled down towards the nose
    face.blob(f'brow{s}', HAIR, (0.01, 0.036, 0.012), s * 23, 19, out=0.0, roll=s * math.radians(22))
face.blob('nose', SKIN_DK, (0.028, 0.024, 0.028), 0, -5, out=-0.008)
face.curve('mouth', MOUTH, [(-14, -22), (-6, -19), (6, -19), (14, -23)], r=0.007)     # a hard frown
face.curve('scar', SCAR, [(28, 26), (32, 12), (36, -2), (40, -14)], r=0.0045)
for s in (-1, 1): face.blob(f'tooth{s}', BONE, (0.006, 0.008, 0.01), s * 5, -20.5, out=0.002)

# arms: dark gloves, the spiked pauldron on the left, a red rag on the right
for s in (-1, 1):
    y = s * 0.235; sh, el = R.arms[s], R.elbows[s]
    if s > 0:
        pd = mn.sphere('pauldron', 0.12, loc=(0.0, y + 0.01, HIP_Z + 0.36), m=ARMOR, scale=(1.05, 0.95, 0.75), segs=32); add(pd, sh)
        for k, (dx, dz, ang) in enumerate([(-0.05, 0.06, -0.3), (0.03, 0.08, 0.15), (0.0, 0.0, 0.0)]):
            sp = C.spike(f'pspike{k}', 0.025, 0.09, BONE)
            sp.location = (dx, y + 0.03 + (0.06 if k == 2 else 0), HIP_Z + 0.4 + dz - (0.06 if k == 2 else 0))
            sp.rotation_euler = (-0.35 - (0.9 if k == 2 else 0), ang, 0); add(sp, sh)
        for o in skull('padSkull', (0.0, y + 0.03, HIP_Z + 0.452), (0, 0.25, 1), 0.085, up=(1, 0, 0)): add(o, sh)
    else:
        add(mn.sphere('shoulderPad', 0.095, loc=(0.0, y, HIP_Z + 0.345), m=SUIT_DK, scale=(1.0, 0.95, 0.8)), sh)
        add(mn.cyl('rag', 0.078, 0.07, loc=(0.0, y - 0.01, HIP_Z + 0.22), m=RED, bevel=0.02), sh)
    add(C.capsule(f'upperArm{s}', 0.066, HIP_Z + 0.34, HIP_Z + 0.17, y=y + s * 0.01, m=SUIT), sh)
    add(mn.sphere(f'elbowPad{s}', 0.064, loc=(0.0, y + s * 0.01, HIP_Z + 0.19), m=ARMOR_DK, segs=20), el)
    add(C.capsule(f'foreArm{s}', 0.062, HIP_Z + 0.20, HIP_Z + 0.06, y=y + s * 0.012, m=SUIT), el)
    add(mn.cyl(f'cuff{s}', 0.072, 0.06, loc=(0.0, y + s * 0.012, HIP_Z + 0.05), m=LEATHER, bevel=0.012), el)
    add(mn.sphere(f'glove{s}', 0.066, loc=(0.01, y + s * 0.012, HIP_Z + 0.01), m=LEATHER, scale=(1.05, 0.85, 1.0), segs=20), R.hands[s])

# legs: dark trousers, knee armour, heavy boots with steel toecaps
for s in (-1, 1):
    y = s * 0.085; hp, kn = R.legs[s], R.knees[s]
    add(C.capsule(f'thigh{s}', 0.078, HIP_Z - 0.03, 0.20, y=y, m=SUIT_DK), hp)
    add(mn.sphere(f'kneePad{s}', 0.07, loc=(0.035, y, 0.21), m=ARMOR, segs=20, scale=(0.8, 1, 1)), kn)
    add(C.capsule(f'shin{s}', 0.074, 0.22, 0.07, y=y, m=SUIT_DK), kn)
    add(mn.box(f'boot{s}', (0.22, 0.15, 0.12), loc=(0.03, y, 0.02), m=LEATHER, bevel=0.04), kn)
    add(mn.box(f'toecap{s}', (0.07, 0.15, 0.07), loc=(0.11, y, 0.02), m=ARMOR, bevel=0.03), kn)
    add(mn.box(f'sole{s}', (0.23, 0.16, 0.035), loc=(0.03, y, 0.0), m=RUBBER, bevel=0.012), kn)

# the blaster carbine, in the right hand (held by the hand empty: the wrist turns it level to aim)
G = R.hands[-1]; gy = -0.247; gz = HIP_Z + 0.03
gun = []
def gpart(o): gun.append(o); return add(o, G)
gpart(mn.box('gunGrip', (0.05, 0.045, 0.1), loc=(0.0, gy, gz - 0.04), m=DARK, bevel=0.012, rot=(0, -0.25, 0)))
gpart(mn.box('gunBody', (0.3, 0.07, 0.08), loc=(0.07, gy, gz + 0.04), m=ARMOR_DK, bevel=0.02))
gpart(mn.box('gunStripe', (0.12, 0.074, 0.02), loc=(0.1, gy, gz + 0.085), m=RED, bevel=0.006))
gpart(mn.box('gunStock', (0.12, 0.05, 0.06), loc=(-0.13, gy, gz + 0.03), m=LEATHER, bevel=0.015))
gpart(mn.box('gunMag', (0.05, 0.05, 0.08), loc=(0.11, gy, gz - 0.03), m=ENERGY, bevel=0.01))
br = C.cone_x('gunBarrel', 0.026, 0.022, 0.15, ARMOR, x0=0.21, verts=16); br.location = (0, gy, gz + 0.085); gpart(br)
gpart(C.cone_x('gunMuzzle', 0.032, 0.032, 0.035, ARMOR_DK, x0=0.35, verts=16)); gun[-1].location = (0, gy, gz + 0.085)
gpart(C.cone_x('gunEmitter', 0.018, 0.018, 0.005, L_RED, x0=0.385, verts=16)); gun[-1].location = (0, gy, gz + 0.085)
gpart(C.cone_x('scope', 0.02, 0.02, 0.1, DARK, x0=0.05, verts=12)); gun[-1].location = (0, gy, gz + 0.13)
gpart(C.cone_x('scopeLens', 0.016, 0.016, 0.006, SIGHT, x0=0.15, verts=12)); gun[-1].location = (0, gy, gz + 0.13)

# loot sack over the left shoulder (carry only)
sack = []
sk = mn.sphere('sack', 1, loc=(-0.14, 0.2, HIP_Z + 0.5), m=C.worn('burlap', '#9a7a52', 0.9, 0.0, grime=1.6, scratches=0.0, scale=4),
               scale=(0.17, 0.15, 0.14), segs=24)
sk.rotation_euler = (0.3, 0.4, 0.2)
for v in sk.data.vertices: v.co *= 1 + 0.12 * math.sin(v.co.x * 9) * math.cos(v.co.y * 7)    # lumpy
sack.append(add(sk, T))
sack.append(add(mn.cyl('sackNeck', 0.04, 0.08, loc=(0.0, 0.22, HIP_Z + 0.58), m=LEATHER, bevel=0.015, rot=(0, -1.0, 0)), T))
sack.append(add(mn.box('sackPatch', (0.08, 0.012, 0.07), loc=(-0.16, 0.355, HIP_Z + 0.52), m=TAPE, bevel=0.004, rot=(0.2, 0.3, 0)), T))

mn.outline(parts, thickness=0.012)

# ---------------------------------------------------------------------------
# Poses and renders
# ---------------------------------------------------------------------------
def set_sack(on):
    for o in sack: o.hide_render = not on

def down_pose():
    C.pose_human(R, 'down')
    R.lie.location.z = C.lie_height(R, [o for o in parts if not o.hide_render])

F = {}
set_sack(False)
F['idle'] = [R.keys.key(C.pose_human, R, 'idle')]
F['walk'] = R.keys.seq(C.pose_human, [(R, 'walk', i / 8) for i in range(8)])
F['aim'] = [R.keys.key(C.pose_human, R, 'aim')]
F['carry'] = R.keys.seq(C.pose_human, [(R, 'carry', i / 8) for i in range(8)])
F['stunned'] = R.keys.seq(C.pose_human, [(R, 'stunned', 0.25), (R, 'stunned', 0.75)])
F['down'] = [R.keys.key(down_pose)]
C.linear_keys()

proxy = mn.cyl('canvasProxy', 0.52, 1.36, verts=32, bevel=0); proxy.hide_render = True
passes = ('beauty',) if PREVIEW else ('beauty', 'normal', 'height')
times = {}
for name, frames in F.items():
    if ONLY and name not in ONLY: continue
    set_sack(name == 'carry')
    objs = [o for o in parts if not o.hide_render] + ([proxy] if name != 'down' else [])
    t0 = time.time()
    mn.render('chars/pirate/' + name, objs=objs, root=R.root, dirs=8 if PREVIEW != '1dir' else 1, frames=frames, passes=passes)
    times[name] = round(time.time() - t0, 1)
print('[pirate] render times (s):', times)
