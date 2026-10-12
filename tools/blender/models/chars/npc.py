"""Dr. Ilse Varga, the rescued scientist-engineer (js/dock.js dk.npc, drawn with drawCrew(.., '#e8e4dc')).

Same skeleton and walk as the crew (charlib.Human = crew.py's rig), so she walks beside them, but a
civilian research suit: warm off-white ('#e8e4dc') with teal Institute trim, a rounded sample pack
with a glowing specimen canister, a data tablet on the thigh, duct tape over a torn sleeve, a silver
visor instead of the crew's gold. Grey hair, round glasses, a plaster on her cheek.

Sprites (build/renders/chars/varga/), 8 directions each (dir i faces game angle i*45deg = N.face),
the game's (N.x, N.y) at the ground origin:
  varga/idle, varga/idle_visor     standing (state 'safe' / waiting), visor up / down
  varga/walk, varga/walk_visor     8-frame walk (state 'follow'); crew.py's cycle. The game draws
                                   the visor down while inVacuum || inDock, like now
  varga/down, varga/down_visor     state 'down' (hurt, waiting for treatment): lying on her back,
                                   head towards the facing direction, body centre on the origin
                                   (the game draws down with the visor down today)
The name tag stays procedural.

    blender -b --factory-startup --python tools/blender/models/chars/npc.py
"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector, Matrix
import mn
import charlib as C

PREVIEW = C.preview_setup('chars')
ONLY = os.environ.get('MN_ONLY', '').split(',') if os.environ.get('MN_ONLY') else None
mn.reset(); C.maybe_cpu()

SUIT = C.worn('suit', '#e8e4dc', 0.62, 0.0, grime=0.9, scratches=0.3, scale=2, gain=1.1)
SUIT_SH = C.worn('suitShade', '#b8b2a6', 0.7, 0.0, grime=0.8, scratches=0.2, scale=2, gain=1.1)
TEAL = C.worn('teal', '#2f9a9a', 0.5, 0.0, grime=0.6, scratches=0.4, scale=3)
GLOVE = mn.mat('glove', '#8a9096', 0.55)
PACK = C.worn('pack', '#c8c4ba', 0.45, 0.1, grime=1.0, scale=2, gain=1.1)
PACK_DK = mn.mat('packDark', 'hullDark', 0.5, 0.3)
RUBBER = mn.mat('rubber', 'rubber', 0.8)
PANEL = mn.mat('panel', 'panel', 0.4, 0.2)
HELM = mn.mat('helmet', '#f3f1ec', 0.28, clearcoat=0.6)
SEAL = mn.mat('seal', '#3a3f4a', 0.6)
VISOR = mn.mat('visor', '#a8c8e0', 0.18, 0.9, clearcoat=1.0)
SKIN = mn.mat('skin', '#ecc6a4', 0.6, emit='#ecc6a4', emit_strength=0.4)
SKIN_DK = mn.mat('skinShade', '#d4a284', 0.6, emit='#d4a284', emit_strength=0.2)
HAIR = mn.mat('hair', '#b9b4ac', 0.7)
EYE = mn.mat('eye', '#1a1410', 0.3)
GLINT = mn.mat('glint', '#ffffff', 0.2, emit='#ffffff', emit_strength=2.5)
GLASSES = mn.mat('glasses', '#2a2a30', 0.3, 0.6)
PLASTER = mn.mat('plaster', '#e8c89a', 0.7, emit='#e8c89a', emit_strength=0.2)
MOUTH = mn.mat('mouth', '#6a3028', 0.5)
TAPE = mn.mat('tape', '#9da3a8', 0.85)
SPEC = C.glow('specimen', '#9cff5a', 1.4, base='#5ab02a', rough=0.05)
SCREEN = C.glow('screen', '#7ae0ff', 1.2, base='#1a3a48')
L_GREEN = C.glow('ledG', '#5fd6a0', 3.0)
LAMP = C.glow('lamp', '#9cd8ff', 3.0)

parts = []
def keep(*objs):
    parts.extend(objs); return objs[0]
def add(o, parent):
    return keep(C.attach(o, parent))

R = C.Human('varga'); HIP_Z = C.HIP_Z; T, H = R.torso, R.hips

# torso (crew layout), teal trim, Institute patch
add(mn.box('body', (0.29, 0.35, 0.40), loc=(0.0, 0, 0.39), m=SUIT, bevel=0.11), T)
add(mn.box('belt', (0.31, 0.37, 0.05), loc=(0.0, 0, 0.42), m=TEAL, bevel=0.02), T)
add(mn.box('chestStripe', (0.05, 0.3, 0.035), loc=(0.13, 0, 0.67), m=TEAL, bevel=0.015), T)
add(mn.box('chestUnit', (0.06, 0.15, 0.09), loc=(0.145, 0, 0.53), m=PANEL, bevel=0.02), T)
add(mn.box('chestScreen', (0.02, 0.1, 0.05), loc=(0.175, 0, 0.55), m=SCREEN, bevel=0.008), T)
add(mn.cyl('patch', 0.045, 0.01, loc=(0.14, 0.11, 0.62), m=TEAL, bevel=0.004, rot=(0, math.radians(75), 0)), T)
add(mn.sphere('patchDot', 0.018, loc=(0.152, 0.11, 0.625), m=mn.mat('white', '#f4f4f0', 0.5), scale=(0.4, 1, 1)), T)
add(mn.box('pelvis', (0.26, 0.29, 0.14), loc=(0.0, 0, 0.32), m=SUIT_SH, bevel=0.06), H)
add(mn.box('pouch', (0.08, 0.06, 0.08), loc=(0.02, -0.17, 0.38), m=PACK, bevel=0.02), T)

# rounded sample pack with a glowing specimen canister on top
add(mn.box('pack', (0.16, 0.34, 0.42), loc=(-0.22, 0, 0.43), m=PACK, bevel=0.07), T)
add(mn.box('packStripe', (0.17, 0.35, 0.05), loc=(-0.22, 0, 0.72), m=TEAL, bevel=0.02), T)
add(mn.cyl('canister', 0.05, 0.16, loc=(-0.26, 0.08, 0.78), m=SPEC, bevel=0.015), T)
for z in (0.78, 0.93):
    add(mn.cyl(f'canRing{z}', 0.055, 0.02, loc=(-0.26, 0.08, z), m=PACK_DK, bevel=0.006), T)
add(mn.cyl('canCap', 0.035, 0.03, loc=(-0.26, 0.08, 0.95), m=PANEL, bevel=0.01), T)
add(mn.box('packBox', (0.1, 0.12, 0.08), loc=(-0.23, -0.09, 0.85), m=PACK_DK, bevel=0.02), T)
add(mn.sphere('packLed', 0.016, loc=(-0.18, -0.09, 0.93), m=L_GREEN, segs=12), T)
add(mn.box('tape', (0.012, 0.12, 0.04), loc=(-0.305, -0.03, 0.55), m=TAPE, bevel=0.004, rot=(-0.3, 0, 0)), T)

# helmet with a silver visor (same mechanics as the crew's)
HEAD = Vector((0.03, 0, 0.985)); HR = 0.22
add(mn.cyl('collar', 0.165, 0.07, loc=(0.0, 0, 0.765), m=SEAL, bevel=0.025), T)
add(mn.cyl('collarRing', 0.18, 0.035, loc=(0.0, 0, 0.775), m=TEAL, bevel=0.012), T)
helmet = mn.sphere('helmet', HR, loc=HEAD, m=HELM, segs=96)
C.window(helmet, 0.19, 0.15, 0.035, False)
sol = helmet.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.022; sol.offset = -1
helmet.data.materials.append(SEAL); sol.material_offset_rim = 1; sol.material_offset = 1
add(helmet, R.head)
visor = mn.sphere('visor', HR + 0.012, loc=HEAD, m=VISOR, segs=96)
C.window(visor, 0.205, 0.17, 0.035, True)
sol = visor.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = -1
add(visor, R.head)
add(mn.cyl('headLamp', 0.035, 0.05, loc=HEAD + Vector((0.02, 0.215, 0.09)), m=PACK, bevel=0.012, rot=(-math.pi / 2, 0, 0)), R.head)
add(mn.sphere('lamp', 0.022, loc=HEAD + Vector((0.06, 0.245, 0.09)), m=LAMP, segs=12), R.head)

face = C.Face(R, keep, HEAD + Vector((0.022, 0, 0.0)), 0.165, tilt=28)
face.add(mn.sphere('face', 0.165, loc=face.c, m=SKIN))
face.add(mn.sphere('hair', 0.155, loc=HEAD + Vector((-0.045, 0, 0.05)), m=HAIR, scale=(1, 1.06, 0.98)))
for i, az in enumerate((-40, -14, 14, 40)):                    # swept grey fringe
    face.blob(f'fringe{i}', HAIR, (0.03, 0.055, 0.035), az, 47 - abs(az) * 0.2, out=-0.012, roll=math.radians(az * 0.8))
for s in (-1, 1):
    face.blob(f'eye{s}', EYE, (0.012, 0.022, 0.03), s * 22, 6, out=-0.004)
    face.blob(f'glint{s}', GLINT, (0.006, 0.008, 0.008), s * 22 - 4, 11, out=0.004)
    face.blob(f'brow{s}', HAIR, (0.008, 0.03, 0.009), s * 24, 23, out=-0.001, roll=s * math.radians(-18))   # worried
    p, d = face.at(s * 22, 6, 0.012)                            # round glasses
    bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.0045, major_segments=24, minor_segments=6)
    ro = bpy.context.active_object; ro.name = f'lens{s}'
    ro.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y')); ro.location = p
    mn.assign(ro, GLASSES); mn.smooth(ro); face.put(ro, d)
face.curve('bridge', GLASSES, [(-8, 9), (0, 11), (8, 9)], r=0.004, out=0.012)
face.blob('nose', SKIN_DK, (0.022, 0.02, 0.022), 0, -4, out=-0.008)
face.blob('plaster', PLASTER, (0.006, 0.04, 0.02), 38, -6, out=0.0, roll=0.5)
face.curve('mouth', MOUTH, [(-10, -19), (-3, -20.5), (3, -20.5), (10, -19)], r=0.006)    # a tight, brave little line

# arms with teal shoulder caps, the taped sleeve; legs with a tablet on the right thigh
for s in (-1, 1):
    y = s * 0.235; sh, el = R.arms[s], R.elbows[s]
    add(mn.sphere(f'shoulderCap{s}', 0.092, loc=(0.0, y, HIP_Z + 0.345), m=TEAL, scale=(1.0, 0.95, 0.8)), sh)
    add(C.capsule(f'upperArm{s}', 0.066, HIP_Z + 0.34, HIP_Z + 0.17, y=y + s * 0.01, m=SUIT), sh)
    add(mn.sphere(f'elbowPad{s}', 0.064, loc=(0.0, y + s * 0.01, HIP_Z + 0.19), m=SUIT_SH, segs=20), el)
    add(C.capsule(f'foreArm{s}', 0.062, HIP_Z + 0.20, HIP_Z + 0.06, y=y + s * 0.012, m=SUIT), el)
    add(mn.cyl(f'cuff{s}', 0.068, 0.035, loc=(0.0, y + s * 0.012, HIP_Z + 0.05), m=TEAL, bevel=0.012), el)
    add(mn.sphere(f'glove{s}', 0.064, loc=(0.01, y + s * 0.012, HIP_Z + 0.01), m=GLOVE, scale=(1.05, 0.85, 1.0), segs=20), R.hands[s])
add(mn.cyl('sleeveTape', 0.07, 0.035, loc=(0.0, 0.247, HIP_Z + 0.26), m=TAPE, bevel=0.01, rot=(0, 0.15, 0)), R.arms[1])
for s in (-1, 1):
    y = s * 0.085; hp, kn = R.legs[s], R.knees[s]
    add(C.capsule(f'thigh{s}', 0.076, HIP_Z - 0.03, 0.20, y=y, m=SUIT), hp)
    add(mn.sphere(f'kneePad{s}', 0.068, loc=(0.035, y, 0.21), m=SUIT_SH, segs=20, scale=(0.8, 1, 1)), kn)
    add(C.capsule(f'shin{s}', 0.072, 0.22, 0.07, y=y, m=SUIT), kn)
    add(mn.box(f'boot{s}', (0.2, 0.14, 0.1), loc=(0.03, y, 0.025), m=GLOVE, bevel=0.04), kn)
    add(mn.box(f'sole{s}', (0.21, 0.15, 0.035), loc=(0.03, y, 0.0), m=RUBBER, bevel=0.012), kn)
add(mn.box('tablet', (0.1, 0.03, 0.13), loc=(0.02, -0.17, 0.2), m=PANEL, bevel=0.012), R.legs[-1])
add(mn.box('tabletScreen', (0.08, 0.005, 0.1), loc=(0.02, -0.186, 0.215), m=SCREEN, bevel=0.002), R.legs[-1])

mn.outline(parts, thickness=0.012)

def set_visor(down):
    visor.rotation_euler = (0, 0 if down else math.radians(-88), 0)
    visor.scale = (1, 1, 1) if down else (0.84, 0.84, 0.84)
    for o in face.parts: o.hide_render = down

def down_pose():
    C.pose_human(R, 'down')
    R.lie.location.z = C.lie_height(R, [o for o in parts if not o.hide_render])

F = {}
F['idle'] = [R.keys.key(C.pose_human, R, 'idle')]
F['walk'] = R.keys.seq(C.pose_human, [(R, 'walk', i / 8) for i in range(8)])
F['down'] = [R.keys.key(down_pose)]
C.linear_keys()

proxy = mn.cyl('canvasProxy', 0.5, 1.3, verts=32, bevel=0); proxy.hide_render = True
passes = ('beauty',) if PREVIEW else ('beauty', 'normal', 'height')
times = {}
for down in (False, True):
    set_visor(down)
    for name, frames in F.items():
        nm = name + ('_visor' if down else '')
        if ONLY and nm not in ONLY: continue
        objs = [o for o in parts if not o.hide_render] + ([proxy] if name != 'down' else [])
        t0 = time.time()
        mn.render('chars/varga/' + nm, objs=objs, root=R.root, dirs=8 if PREVIEW != '1dir' else 1, frames=frames, passes=passes)
        times[nm] = round(time.time() - t0, 1)
print('[varga] render times (s):', times)
