"""Crew member (player character): bulky white spacesuit, life-support pack, big round helmet.

Sprites (8 facing directions each; dir i faces game angle i*45deg = c.face):
  crew/idle, crew/idle_visor     standing, visor up (face visible) / down (gold visor)
  crew/walk, crew/walk_visor     8-frame walk cycle (loops: frame 7 -> frame 0)
  crew/down, crew/down_visor     health 'down' / 'out': flat on the back, head towards the facing
                                 direction, limbs sprawled; the body's centre on the ground origin
                                 (own canvas). 'out' = the same sprite, greyed and faded by the game.
idle/walk share one canvas and ground origin (c.x, c.y); down has its own.
Suit-colour parts (shoulder caps, backpack stripe, chest stripe) are neutral grey and marked
with mn.tint, so the .m.png mask says where the game recolours them per player.

Worn gear (js/progress.js GEAR, c.kit.gear), one overlay set per piece, drawn over the crew sprite
with the same canvas, origin, direction and frame (rendered with the body as a holdout, so the
parts the body hides are already cut away; no tint mask):
  crew/gear_<id>_idle, crew/gear_<id>_walk, crew/gear_<id>_down
  id = boots | thrusters | armor | toolbelt | firstAid | stim
  (armor: only while c.armor > 0, and no _down: the vest is always used up before its wearer goes down)
Several pieces at once: each gear entry has `depth` (one number per frame, k = dir * frames + frame:
the piece's mean distance from the camera); draw the worn pieces of a frame sorted far to near.

    blender -b --factory-startup --python tools/blender/models/crew/crew.py
    MN_PREVIEW=1 ...      16 samples, beauty + mask only, into /tmp/crew_preview (=idle: one walk frame; =1dir)
    MN_ONLY=down,gear ... only these sprites (names, their first token, or gear_<id>)
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import bpy
from mathutils import Vector, Matrix
import mn

PREVIEW = os.environ.get('MN_PREVIEW')
if PREVIEW:
    mn.OUT_DIR = '/tmp/crew_preview'; mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json'); mn.SAMPLES = 16

mn.reset()
P = mn.PALETTE
# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
SUIT = mn.mat('suit', '#f4f5f7', 0.6)                 # slightly warm off-white fabric
SUIT_SH = mn.mat('suitShade', '#c3c8d1', 0.7)          # folds, joints, seams
TINT = mn.mat('tint', '#d0d0d0', 0.5)                  # neutral grey: recoloured at runtime
GLOVE = mn.mat('glove', '#9aa1ad', 0.55)
PACK = mn.mat('pack', '#8b93a3', 0.45, 0.35)
PACK_DK = mn.mat('packDark', 'hullDark', 0.5, 0.3)
RUBBER = mn.mat('rubber', 'rubber', 0.8)
PANEL = mn.mat('panel', 'panel', 0.4, 0.2)
HELM = mn.mat('helmet', '#f1f3f6', 0.28, clearcoat=0.6)
SEAL = mn.mat('seal', '#3a3f4a', 0.6)
VISOR = mn.mat('visor', '#e8b838', 0.22, 0.85, clearcoat=1.0)
SKIN = mn.mat('skin', 'skin', 0.6, emit='skin', emit_strength=0.4)    # faint glow: the face sits in the helmet's shadow
HAIR = mn.mat('hair', 'hair', 0.75)
EYE = mn.mat('eye', '#1a1410', 0.3)
L_GREEN = mn.mat('ledG', 'green', 0.3, emit='green', emit_strength=4)
L_RED = mn.mat('ledR', 'red', 0.3, emit='red', emit_strength=4)
L_AMBER = mn.mat('ledA', 'energy', 0.3, emit='energy', emit_strength=4)
LAMP = mn.mat('lamp', 'glow', 0.2, emit='glow', emit_strength=6)

parts = []
def keep(o):
    parts.append(o); return o

def empty(name, loc, parent=None):
    e = mn.link(bpy.data.objects.new(name, None)); e.location = loc
    if parent: attach(e, parent)
    return e

def attach(child, parent):
    """Parent keeping the child's world placement (mn.group only works for parents at the origin)."""
    bpy.context.view_layer.update()
    child.parent = parent; child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child

def capsule(name, r, z0, z1, x=0, y=0, m=SUIT):
    """Vertical limb segment with round ends, from z0 down/up to z1."""
    h = abs(z1 - z0)
    o = mn.cyl(name, r, h, loc=(x, y, min(z0, z1)), m=m, verts=24, bevel=r * 0.7)
    o.modifiers['bevel'].segments = 4
    return o

# ---------------------------------------------------------------------------
# Rig: root (turns for directions) > lie (lying down) > hips (bob) > torso (twist) > arms/head; hips > legs
# Model faces +X (game right); +Y is the character's left.
# ---------------------------------------------------------------------------
root = empty('crew', (0, 0, 0))
HIP_Z = 0.40
lie = empty('lie', (0, 0, 0), root)            # whole-body transform for the lying-down pose
hips = empty('hips', (0, 0, HIP_Z), lie)
torso = empty('torso', (0, 0, HIP_Z), hips)

# Torso: bulky rounded suit body, belt, chest unit
keep(attach(mn.box('body', (0.30, 0.36, 0.40), loc=(0.0, 0, 0.39), m=SUIT, bevel=0.11), torso))
for o in [mn.box('belt', (0.32, 0.38, 0.06), loc=(0.0, 0, 0.42), m=SUIT_SH, bevel=0.03),
          mn.box('buckle', (0.04, 0.10, 0.05), loc=(0.155, 0, 0.425), m=PACK_DK, bevel=0.012),
          mn.box('chestStripe', (0.05, 0.30, 0.045), loc=(0.135, 0, 0.665), m=TINT, bevel=0.02),
          mn.box('chestUnit', (0.07, 0.17, 0.10), loc=(0.15, 0, 0.53), m=PANEL, bevel=0.02)]:
    keep(attach(o, torso))
mn.tint(bpy.data.objects['chestStripe'])
for i, (m, y) in enumerate([(L_GREEN, -0.05), (L_AMBER, 0.0), (L_RED, 0.05)]):
    keep(attach(mn.sphere(f'led{i}', 0.014, loc=(0.188, y, 0.595), m=m, segs=12), torso))
keep(attach(mn.box('dial', (0.02, 0.06, 0.035), loc=(0.19, 0, 0.545), m=mn.mat('screen', '#2a4a58', 0.2, emit='glow', emit_strength=1.5), bevel=0.008), torso))
# pants/hip block
keep(attach(mn.box('pelvis', (0.27, 0.30, 0.14), loc=(0.0, 0, 0.32), m=SUIT, bevel=0.06), hips))

# Life-support pack on the back, with the suit-colour stripe, two tanks and an antenna
pack = mn.box('pack', (0.17, 0.38, 0.46), loc=(-0.225, 0, 0.42), m=PACK, bevel=0.05)
keep(attach(pack, torso))
stripe = mn.box('packStripe', (0.18, 0.39, 0.07), loc=(-0.225, 0, 0.70), m=TINT, bevel=0.02)
keep(attach(stripe, torso)); mn.tint(stripe)
for s in (-1, 1):
    keep(attach(mn.cyl(f'tank{s}', 0.055, 0.34, loc=(-0.315, s * 0.095, 0.45), m=PACK_DK, bevel=0.03), torso))
    keep(attach(mn.cyl(f'tankCap{s}', 0.03, 0.03, loc=(-0.315, s * 0.095, 0.79), m=PANEL, bevel=0.01), torso))
keep(attach(mn.box('packTop', (0.12, 0.26, 0.03), loc=(-0.225, 0, 0.875), m=PACK_DK, bevel=0.012), torso))
keep(attach(mn.sphere('packLed', 0.018, loc=(-0.17, 0.12, 0.885), m=L_GREEN, segs=12), torso))
keep(attach(mn.cyl('antenna', 0.009, 0.24, loc=(-0.27, -0.15, 0.86), m=PACK_DK, bevel=0.004, verts=8), torso))
keep(attach(mn.sphere('antennaTip', 0.02, loc=(-0.27, -0.15, 1.10), m=L_RED, segs=12), torso))
# a strip of duct tape on the pack (the ship's running joke)
keep(attach(mn.box('tape', (0.012, 0.11, 0.04), loc=(-0.31, -0.02, 0.56), m=mn.mat('tape', '#9da3a8', 0.85), bevel=0.004, rot=(0.25, 0, 0)), torso))

# Neck ring + helmet (big, so it reads from above)
HEAD = Vector((0.03, 0, 0.985)); HR = 0.225
keep(attach(mn.cyl('collar', 0.17, 0.07, loc=(0.0, 0, 0.765), m=SEAL, bevel=0.025), torso))
keep(attach(mn.cyl('collarRing', 0.185, 0.035, loc=(0.0, 0, 0.775), m=PACK, bevel=0.012), torso))
head = empty('head', HEAD, torso)
def window(o, ry, rz, dz, keep_inside):
    """Delete the sphere's faces inside (or outside) an oval window on its front (+X)."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    def inside(f):
        c = f.calc_center_median()
        return c.x > 0.02 and (c.y / ry) ** 2 + ((c.z - dz) / rz) ** 2 < 1
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if inside(f) != keep_inside], context='FACES')
    bm.to_mesh(o.data); bm.free(); return mn.smooth(o)

helmet = mn.sphere('helmet', HR, loc=HEAD, m=HELM, segs=96)
window(helmet, 0.19, 0.15, 0.035, False)
sol = helmet.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.022; sol.offset = -1
helmet.data.materials.append(SEAL); sol.material_offset_rim = 1; sol.material_offset = 1
keep(attach(helmet, head))
# gold visor: a slightly bigger spherical cap over the window, pivoting on the helmet centre
visor = mn.sphere('visor', HR + 0.012, loc=HEAD, m=VISOR, segs=96)
window(visor, 0.205, 0.17, 0.035, True)
sol = visor.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = -1
keep(attach(visor, head))
# helmet details: side lamps, top ridge
for s in (-1, 1):
    keep(attach(mn.cyl(f'lampHousing{s}', 0.04, 0.05, loc=HEAD + Vector((0.03, s * (HR - 0.01), 0.07)), m=PACK, bevel=0.012, rot=(-s * math.pi / 2, 0, 0)), head))
    keep(attach(mn.sphere(f'lamp{s}', 0.026, loc=HEAD + Vector((0.07, s * (HR + 0.025), 0.07)), m=LAMP, segs=12), head))
# Face inside the helmet. Cartoon proportions, and the face is tilted up towards the camera
# (which looks down at 50 deg) so the eyes, brows and smile face the viewer instead of the floor.
FACE_C = HEAD + Vector((0.022, 0, 0.0)); FACE_R = 0.17; FACE_TILT = math.radians(28)
SKIN_DK = mn.mat('skinShade', '#d9a27e', 0.6, emit='#d9a27e', emit_strength=0.2)
CHEEK = mn.mat('cheek', '#f08a7a', 0.6, emit='#f08a7a', emit_strength=0.3)
GLINT = mn.mat('glint', '#ffffff', 0.2, emit='#ffffff', emit_strength=3)
face_parts = []
def on_face(az, el, out=0.0):
    """Point on the face sphere (degrees: az to the character's left, el up, in the tilted face frame)
    and the outward direction there."""
    az, el = math.radians(az), math.radians(el) + FACE_TILT
    d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    return FACE_C + d * (FACE_R + out), d
def feature(o, d, roll=0.0):
    """Orient o so its local X points out of the face along d (flat features: thin in X)."""
    q = d.to_track_quat('X', 'Z'); o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = q @ Matrix.Rotation(roll, 4, 'X').to_quaternion()
    face_parts.append(keep(attach(o, head))); return o
def blob(name, m, size, az, el, out=0.0, roll=0.0, segs=16):
    p, d = on_face(az, el, out)
    return feature(mn.sphere(name, 1.0, loc=p, m=m, scale=size, segs=segs), d, roll)

face_parts.append(keep(attach(mn.sphere('face', FACE_R, loc=FACE_C, m=SKIN), head)))
face_parts.append(keep(attach(mn.sphere('hair', 0.158, loc=HEAD + Vector((-0.04, 0, 0.045)), m=HAIR, scale=(1, 1.06, 0.98)), head)))
for i, az in enumerate((-46, -24, 0, 24, 46)):                         # fringe framing the face under the rim
    blob(f'fringe{i}', HAIR, (0.03, 0.05, 0.04), az, 46 - abs(az) * 0.25, out=-0.012, roll=math.radians(az * 0.6))
for s in (-1, 1):
    blob(f'eye{s}', EYE, (0.012, 0.027, 0.037), s * 23, 6, out=-0.004)                  # big dark cartoon eyes
    blob(f'eyeGlint{s}', GLINT, (0.006, 0.01, 0.01), s * 23 - 5, 12, out=0.004)       # white catch-light (same side for both)
    blob(f'brow{s}', HAIR, (0.008, 0.032, 0.011), s * 25, 25, out=-0.001, roll=s * math.radians(-12))
    blob(f'cheek{s}', CHEEK, (0.004, 0.026, 0.019), s * 38, -9, out=-0.001)
blob('nose', SKIN_DK, (0.024, 0.022, 0.02), 0, -4, out=-0.008)
# smile: a small dark arc (a bevelled curve baked into a mesh)
cu = bpy.data.curves.new('mouth', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0065; cu.bevel_resolution = 2
sp = cu.splines.new('POLY'); pts = []
for k in range(9):
    az = -15 + 30 * k / 8
    pts.append(on_face(az, -17 - 6 * (1 - (az / 15) ** 2), out=0.001)[0])
sp.points.add(len(pts) - 1)
for pt, co in zip(sp.points, pts): pt.co = (*co, 1)
_tmp = mn.link(bpy.data.objects.new('mouthCurve', cu)); bpy.context.view_layer.update()
mouth = mn.link(bpy.data.objects.new('mouth', bpy.data.meshes.new_from_object(_tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))))
bpy.data.objects.remove(_tmp); mn.assign(mouth, mn.mat('mouth', '#5a2a24', 0.5)); mn.smooth(mouth)
face_parts.append(keep(attach(mouth, head)))

# Arms: shoulder pivot, upper arm, elbow pivot, forearm + glove; tinted shoulder caps
arms, elbows = {}, {}
for s in (-1, 1):
    y = s * 0.235
    sh = empty(f'shoulder{s}', (0.0, y, HIP_Z + 0.34), torso)
    cap = mn.sphere(f'shoulderCap{s}', 0.095, loc=(0.0, y, HIP_Z + 0.345), m=TINT, scale=(1.0, 0.95, 0.8))
    keep(attach(cap, sh)); mn.tint(cap)
    keep(attach(capsule(f'upperArm{s}', 0.068, HIP_Z + 0.34, HIP_Z + 0.17, y=y + s * 0.01), sh))
    el = empty(f'elbow{s}', (0.0, y + s * 0.01, HIP_Z + 0.19), sh)
    keep(attach(mn.sphere(f'elbowPad{s}', 0.066, loc=(0.0, y + s * 0.01, HIP_Z + 0.19), m=SUIT_SH, segs=20), el))
    keep(attach(capsule(f'foreArm{s}', 0.064, HIP_Z + 0.20, HIP_Z + 0.06, y=y + s * 0.012), el))
    keep(attach(mn.cyl(f'cuff{s}', 0.07, 0.035, loc=(0.0, y + s * 0.012, HIP_Z + 0.05), m=GLOVE, bevel=0.012), el))
    keep(attach(mn.sphere(f'glove{s}', 0.068, loc=(0.01, y + s * 0.012, HIP_Z + 0.01), m=GLOVE, scale=(1.05, 0.85, 1.0), segs=20), el))
    arms[s], elbows[s] = sh, el

# Legs: hip pivot, thigh, knee pivot, shin + boot
legs, knees = {}, {}
for s in (-1, 1):
    y = s * 0.085
    hp = empty(f'hip{s}', (0.0, y, HIP_Z - 0.04), hips)
    keep(attach(capsule(f'thigh{s}', 0.078, HIP_Z - 0.03, 0.20, y=y), hp))
    kn = empty(f'knee{s}', (0.0, y, 0.21), hp)
    keep(attach(mn.sphere(f'kneePad{s}', 0.07, loc=(0.035, y, 0.21), m=SUIT_SH, segs=20, scale=(0.8, 1, 1)), kn))
    keep(attach(capsule(f'shin{s}', 0.074, 0.22, 0.07, y=y), kn))
    keep(attach(mn.box(f'boot{s}', (0.21, 0.14, 0.10), loc=(0.03, y, 0.025), m=GLOVE, bevel=0.04), kn))
    keep(attach(mn.box(f'sole{s}', (0.22, 0.15, 0.035), loc=(0.03, y, 0.0), m=RUBBER, bevel=0.012), kn))
    legs[s], knees[s] = hp, kn

mn.outline(parts, thickness=0.012)

# ---------------------------------------------------------------------------
# Worn gear (js/progress.js GEAR; looks like the item icons in build/renders/items/icon_gear_*.png).
# Each piece is its own overlay sprite set, drawn over the crew sprite; hidden in the crew's own
# renders. Everything sits > 0.012 (the body's outline) off the suit, because the overlays are
# rendered with the body (and its outline) as a holdout.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'chars'))
import charlib as C
G_WHITE = mn.mat('gWhite', '#f4f5f7', 0.35, clearcoat=0.4)
G_ORANGE = mn.mat('gOrange', '#ff8a2a', 0.45)
G_SOLE = mn.mat('gSole', '#2a3140', 0.6)
G_BLUE = C.glow('gBlue', '#4ab0ff', 1.5, base='#8cd0ff')
G_METAL = mn.mat('gMetal', '#8a93a3', 0.35, 0.6)
G_DARK = mn.mat('gDark', 'hullDark', 0.5, 0.3)
G_HAZ = mn.mat('gHaz', 'hazard', 0.5)
OLIVE = C.worn('olive', '#5f6b3a', 0.75, 0.0, grime=0.8, scratches=0.15, scale=2)
PLATE = C.worn('plate', '#8f96a0', 0.4, 0.4, grime=0.6, scratches=0.6, scale=2)
LEATHER = C.worn('leather', '#7a4e2c', 0.6, 0.0, grime=0.8, scratches=0.3, scale=2)
CANVAS = C.worn('canvas', '#a8915e', 0.85, 0.0, grime=0.9, scratches=0.0, scale=2)
BRASS = mn.mat('brass', 'copper', 0.35, 0.8)
CROSS = mn.mat('cross', '#e8322a', 0.45)
RIM = mn.mat('rim', '#3fbf62', 0.45)
INJ_DARK = mn.mat('injDark', '#1c1f26', 0.5)
INJ_CAP = mn.mat('injCap', '#f2604a', 0.5)
DOSE = C.glow('dose', '#5fd6a0', 1.2)

gear = {k: [] for k in ('boots', 'thrusters', 'armor', 'toolbelt', 'firstAid', 'stim')}
def wear(kind, o, parent):
    gear[kind].append(attach(o, parent)); return o

def on_normal(o, d, roll=0.0):
    """Turn o (built along +Z) so its Z points along d."""
    q = Vector(d).normalized().to_track_quat('Z', 'X'); o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = q @ Matrix.Rotation(roll, 4, 'Z').to_quaternion(); return o

# Gravity boots: white shells over the boots, orange cuffs, glowing blue soles
for s in (-1, 1):
    y = s * 0.085; kn = knees[s]
    wear('boots', mn.box(f'gbGlow{s}', (0.262, 0.192, 0.05), loc=(0.03, y, -0.016), m=G_BLUE, bevel=0.012), kn)
    wear('boots', mn.box(f'gbSole{s}', (0.256, 0.186, 0.03), loc=(0.03, y, 0.03), m=G_SOLE, bevel=0.01), kn)
    wear('boots', mn.box(f'gbBoot{s}', (0.25, 0.18, 0.105), loc=(0.03, y, 0.05), m=G_WHITE, bevel=0.045), kn)
    wear('boots', mn.cyl(f'gbCuff{s}', 0.098, 0.05, loc=(0.0, y, 0.13), m=G_ORANGE, bevel=0.016), kn)
    wear('boots', mn.box(f'gbCoil{s}', (0.09, 0.012, 0.022), loc=(0.02, y + s * 0.093, 0.075), m=G_BLUE, bevel=0.005), kn)

# Suit thrusters: two tanks beside the life-support pack with orange caps, a cross bar, two nozzles
for s in (-1, 1):
    x, y = -0.275, s * 0.24
    wear('thrusters', mn.cyl(f'gtTank{s}', 0.052, 0.32, loc=(x, y, 0.46), m=G_WHITE, bevel=0.03), torso)
    wear('thrusters', mn.sphere(f'gtCap{s}', 0.055, loc=(x, y, 0.78), m=G_ORANGE, scale=(1, 1, 0.75), segs=24), torso)
    wear('thrusters', mn.cyl(f'gtBand{s}', 0.057, 0.03, loc=(x, y, 0.64), m=G_DARK, bevel=0.01), torso)
    bell = C.cone_x(f'gtNozzle{s}', 0.028, 0.05, 0.08, G_METAL, verts=20)
    bell.location = (x, y, 0.46); bell.rotation_euler = (0, math.radians(104), 0)
    wear('thrusters', bell, torso)
    wear('thrusters', mn.box(f'gtHaz{s}', (0.012, 0.05, 0.035), loc=(x - 0.054, y, 0.55), m=G_HAZ, bevel=0.004), torso)
wear('thrusters', mn.box('gtBar', (0.10, 0.54, 0.06), loc=(-0.29, 0, 0.42), m=G_DARK, bevel=0.02), torso)
wear('thrusters', mn.box('gtBarTop', (0.11, 0.2, 0.02), loc=(-0.29, 0, 0.475), m=G_ORANGE, bevel=0.008), torso)

# Armor vest: olive carrier over the chest and sides, grey chest and belly plates, a hazard tag
wear('armor', mn.box('gvFront', (0.075, 0.36, 0.285), loc=(0.19, 0, 0.478), m=OLIVE, bevel=0.03), torso)
for s in (-1, 1):
    wear('armor', mn.box(f'gvSide{s}', (0.27, 0.035, 0.24), loc=(0.0, s * 0.2, 0.49), m=OLIVE, bevel=0.012), torso)
    wear('armor', mn.box(f'gvStrap{s}', (0.17, 0.075, 0.035), loc=(0.1, s * 0.135, 0.755), m=OLIVE, bevel=0.012, rot=(0, 0.3, 0)), torso)
wear('armor', mn.box('gvChest', (0.028, 0.27, 0.12), loc=(0.232, 0, 0.62), m=PLATE, bevel=0.012), torso)
wear('armor', mn.box('gvBelly', (0.028, 0.27, 0.085), loc=(0.232, 0, 0.505), m=PLATE, bevel=0.012), torso)
wear('armor', mn.box('gvTag', (0.012, 0.06, 0.028), loc=(0.25, -0.085, 0.705), m=G_HAZ, bevel=0.004), torso)

# Toolbelt: leather belt over the suit's belt, brass buckle, canvas pouches, a wrench
wear('toolbelt', mn.box('gtbBelt', (0.37, 0.43, 0.06), loc=(0, 0, 0.405), m=LEATHER, bevel=0.025), torso)
wear('toolbelt', mn.box('gtbBuckle', (0.03, 0.09, 0.06), loc=(0.19, 0, 0.405), m=BRASS, bevel=0.01), torso)
for nm, size, loc in (('gtbPouchR', (0.13, 0.07, 0.12), (0.05, -0.245, 0.31)), ('gtbPouchL', (0.11, 0.065, 0.11), (0.06, 0.245, 0.32)),
                      ('gtbPouchF', (0.055, 0.09, 0.09), (0.205, -0.115, 0.33))):
    wear('toolbelt', mn.box(nm, size, loc=loc, m=CANVAS, bevel=0.015), torso)
    wear('toolbelt', mn.box(nm + 'Flap', (size[0] + 0.006, size[1] + 0.006, 0.03), loc=(loc[0], loc[1], loc[2] + size[2] - 0.022), m=LEATHER, bevel=0.01), torso)
wear('toolbelt', mn.box('gtbWrench', (0.024, 0.014, 0.15), loc=(-0.06, 0.232, 0.26), m=G_METAL, bevel=0.006), torso)
wear('toolbelt', mn.box('gtbWrenchHead', (0.06, 0.016, 0.035), loc=(-0.06, 0.232, 0.245), m=G_METAL, bevel=0.008), torso)

# First aid course: a round white badge with a red cross and a green rim on both shoulders
for s in (-1, 1):
    d = Vector((0, s * 0.55, 0.83)).normalized()
    c = Vector((0.0, s * 0.235, HIP_Z + 0.345)) + Vector((0, d.y * 0.095 * 0.95, d.z * 0.095 * 0.8)) + d * 0.014
    for nm, o in ((f'gfRim{s}', mn.cyl(f'gfRim{s}', 0.068, 0.012, m=RIM, bevel=0.004, verts=32)),
                  (f'gfDisc{s}', mn.cyl(f'gfDisc{s}', 0.053, 0.016, m=G_WHITE, bevel=0.004, verts=32)),
                  (f'gfCrossA{s}', mn.box(f'gfCrossA{s}', (0.07, 0.024, 0.02), m=CROSS, bevel=0.003)),
                  (f'gfCrossB{s}', mn.box(f'gfCrossB{s}', (0.024, 0.07, 0.02), m=CROSS, bevel=0.003))):
        on_normal(o, d); o.location = c + (d * 0.017 if 'Cross' in nm else Vector()); wear('firstAid', o, arms[s])

# Stim pack: a white auto-injector strapped to the front-outside of the right thigh, green dose window
y0 = -0.085
wear('stim', mn.cyl('gsStrap', 0.094, 0.028, loc=(0.0, y0, 0.275), m=G_DARK, bevel=0.008), legs[-1])
side = Vector((0.7, -0.7, 0)).normalized()                  # out of the thigh, between front and outside
inj_c = Vector((0.0, y0, 0.19)) + side * 0.135
for nm, r, h, z, m in (('gsBody', 0.04, 0.09, 0.085, G_WHITE), ('gsGrip', 0.042, 0.09, 0.0, INJ_DARK),
                       ('gsCap', 0.04, 0.036, -0.034, INJ_CAP), ('gsTop', 0.02, 0.03, 0.17, G_METAL)):
    wear('stim', mn.cyl(nm, r, h, loc=inj_c + Vector((0, 0, z)), m=m, bevel=min(0.01, r * 0.3), verts=20), legs[-1])
win = mn.box('gsDose', (0.014, 0.03, 0.06), loc=(0, 0, 0), m=DOSE, bevel=0.004)
win.location = inj_c + side * 0.036 + Vector((0, 0, 0.095)); win.rotation_euler = (0, 0, math.atan2(side.y, side.x))
wear('stim', win, legs[-1])

for kind, objs in gear.items():
    mn.outline(objs, thickness=0.008 if kind == 'firstAid' else 0.012)
    for o in objs: o.hide_render = True
all_gear = [o for v in gear.values() for o in v]

# ---------------------------------------------------------------------------
# Poses
# ---------------------------------------------------------------------------
LIE_SHIFT = 0.55       # lying down: the body's centre (not the feet) sits on the ground origin

def pose(t=None, down=False):
    """t = walk phase in [0, 1) or None for idle; down: flat on the back, head towards +X (the
    facing direction), limbs sprawled (charlib.pose_human 'down'). Sets the rig's transforms."""
    for s in (-1, 1):
        arms[s].rotation_euler = (s * math.radians(-6), 0, 0)     # arms slightly out from the body
        elbows[s].rotation_euler = (0, math.radians(-12), 0)
        legs[s].rotation_euler = (0, 0, 0); knees[s].rotation_euler = (0, 0, 0)
    lie.location = (0, 0, 0); lie.rotation_euler = (0, 0, 0)
    hips.location.z = HIP_Z; torso.rotation_euler = (0, 0, 0); head.rotation_euler = (0, 0, 0)
    if down:
        lie.rotation_euler = (0, math.radians(-90), math.radians(180))
        lie.location = (-LIE_SHIFT, 0, 0)
        # (rotation about X by s * angle swings a limb outwards; about Y by -angle forwards = up when lying)
        arms[-1].rotation_euler = (math.radians(-75), math.radians(-10), 0)               # right arm flung out
        arms[1].rotation_euler = (math.radians(55), math.radians(-50), 0)                 # left arm up by the head
        elbows[-1].rotation_euler = (0, math.radians(-25), 0); elbows[1].rotation_euler = (0, math.radians(-60), 0)
        legs[-1].rotation_euler = (math.radians(-14), math.radians(-30), 0); knees[-1].rotation_euler = (0, math.radians(60), 0)
        legs[1].rotation_euler = (math.radians(12), 0, 0)                                  # legs apart, one knee up
        head.rotation_euler = (math.radians(-18), math.radians(10), 0)
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); zmin = 1e9
        for o in parts:                              # lift the lowest point of the body onto the floor
            if o.type != 'MESH': continue
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            for v in me.vertices: zmin = min(zmin, (ev.matrix_world @ v.co).z)
            ev.to_mesh_clear()
        lie.location.z = -zmin
        return
    if t is None: return
    p = 2 * math.pi * t
    for s in (-1, 1):
        sw = math.sin(p) * s                                   # +1: this leg forward
        legs[s].rotation_euler = (0, -0.50 * sw, 0)            # -y rotation swings the foot to +X
        # knee bends while the leg swings forward (recovery), stays straight while it carries weight
        knees[s].rotation_euler = (0, 0.75 * max(0.0, math.cos(p) * s) ** 1.2, 0)
        arms[s].rotation_euler = (s * math.radians(-6), 0.55 * sw, 0)   # arms opposite the legs
        elbows[s].rotation_euler = (0, math.radians(-15) - 0.25 * max(0.0, -sw), 0)
    hips.location.z = HIP_Z - 0.035 + 0.035 * abs(math.cos(p))     # low at full stride, high when passing
    torso.rotation_euler = (0, 0.06, -0.10 * math.sin(p))           # lean in, twist with the stride
    head.rotation_euler = (0, -0.04, 0.06 * math.sin(p))            # head counters the twist a bit

WALK = 8
movers = [lie, hips, torso, head] + list(arms.values()) + list(elbows.values()) + list(legs.values()) + list(knees.values())
def key(frame, t, down=False):
    bpy.context.scene.frame_set(frame)        # first: frame_set re-applies existing keys
    pose(t, down)
    for o in movers:
        o.keyframe_insert('location', frame=frame); o.keyframe_insert('rotation_euler', frame=frame)

IDLE_F, DOWN_F = 100, 101
key(IDLE_F, None)
for i in range(WALK):
    key(1 + i, i / WALK)
key(DOWN_F, None, down=True)

# ---------------------------------------------------------------------------
# Shared canvases: invisible proxies covering everything any variant (and any gear) can reach, so
# idle/walk, visor up/down and the gear overlays all get the same canvas size and origin; the
# lying-down sprites get their own (proxyDown, sized from the down pose with all gear).
# ---------------------------------------------------------------------------
proxy = mn.cyl('canvasProxy', 0.46, 1.27, verts=32, bevel=0)
proxy.hide_render = True
frame_objs = parts + [proxy]

def reach(objs):
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); r = z = 0.0
    for o in objs:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co; r = max(r, math.hypot(w.x, w.y)); z = max(z, w.z)
        ev.to_mesh_clear()
    return r, z
bpy.context.scene.frame_set(DOWN_F)
_r, _z = reach(parts + all_gear)
proxy_down = mn.cyl('canvasProxyDown', round(_r + 0.02, 2), round(_z + 0.02, 2), verts=48, bevel=0)
proxy_down.hide_render = True
down_objs = parts + [proxy_down]
for f in [IDLE_F] + list(range(1, 1 + WALK)):            # the standing proxy must hold the gear too
    bpy.context.scene.frame_set(f); _r, _z = reach(all_gear)
    assert _r < 0.455 and _z < 1.27, f'gear sticks out of the canvas proxy at frame {f}: r={_r:.3f} z={_z:.3f} ' + str(sorted((round(reach([o])[0], 3), o.name) for o in all_gear)[-4:])

def set_visor(down):
    """Down: gold visor over the window (vacuum). Up: the visor slides up *inside* the shell (like a
    sun shade), only its lower edge peeking over the top of the open window."""
    visor.rotation_euler = (0, 0 if down else math.radians(-88), 0)
    visor.scale = (1, 1, 1) if down else (0.84, 0.84, 0.84)
    for o in face_parts:
        o.hide_render = down                          # hidden behind the visor anyway

import time
ONLY = os.environ.get('MN_ONLY', '').split(',') if os.environ.get('MN_ONLY') else None
want = lambda n: not ONLY or n in ONLY or n.split('_')[0] in ONLY
passes = ('beauty', 'mask') if PREVIEW else ('beauty', 'normal', 'height', 'mask')
walk_frames = list(range(1, 1 + WALK))
dirs = 8 if PREVIEW != '1dir' else 1
if PREVIEW == 'idle': walk_frames = walk_frames[:1]
times = {}
canvas = {}
for down in (False, True):
    set_visor(down); suf = '_visor' if down else ''
    for nm, objs, frames in (('idle', frame_objs, [IDLE_F]), ('walk', frame_objs, walk_frames), ('down', down_objs, [DOWN_F])):
        if not want(nm + suf): continue
        t0 = time.time()
        canvas[nm] = mn.render(f'crew/{nm}{suf}', objs=objs, root=root, dirs=dirs, frames=frames, passes=passes)
        times[nm + suf] = round(time.time() - t0, 1)

# Gear overlays: one gear piece visible, the body a holdout (it cuts away what it hides), the same
# canvas as the body's sprites. Not tinted (no mask). The visor doesn't matter (the face is inside).
# The armor vest has no 'down' overlay: it is always used up (c.armor) before its wearer goes down.
def gear_depth(objs, frames):
    """Per sprite frame (k = dir * frames + frame, like the files): the gear's mean distance from the
    camera in units (bigger = further back). Worn gear overlaps (vest and belt, thrusters and boots):
    the game draws the worn pieces sorted by this, far ones first."""
    e = math.radians(mn.ELEVATION); view = Vector((0, math.cos(e), -math.sin(e))); out = []
    for d in range(dirs):
        root.rotation_euler.z = -math.radians(d * 360 / dirs)
        for f in frames:
            bpy.context.scene.frame_set(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
            tot, n = 0.0, 0
            for o in objs:
                if o.type != 'MESH': continue
                ev = o.evaluated_get(dg); me = ev.to_mesh()
                for v in me.vertices: tot += (ev.matrix_world @ v.co).dot(view); n += 1
                ev.to_mesh_clear()
            out.append(round(tot / n, 3))
    root.rotation_euler.z = 0
    return out

def add_depth(name, depth):
    import json
    with open(mn.MANIFEST) as fh: ent = json.load(fh)[name]
    ent['depth'] = depth; mn._manifest_put(name, ent)

DEPTH_ONLY = os.environ.get('MN_DEPTH_ONLY')         # only (re)compute the gear entries' depth lists
set_visor(True)
gpasses = ('beauty',) if PREVIEW else ('beauty', 'normal', 'height')
for o in parts: o.is_holdout = True
for kind, objs in gear.items():
    for o in all_gear: o.hide_render = o not in objs
    for nm, fobjs, frames in (('idle', frame_objs, [IDLE_F]), ('walk', frame_objs, walk_frames), ('down', down_objs, [DOWN_F])):
        name = f'gear_{kind}_{nm}'
        if (kind == 'armor' and nm == 'down') or not want(name) and not want('gear') and not want('gear_' + kind): continue
        t0 = time.time()
        if not DEPTH_ONLY:
            got = mn.render('crew/' + name, objs=fobjs + objs, root=root, dirs=dirs, frames=frames, passes=gpasses)
            if nm in canvas: assert got == canvas[nm], f'{name}: canvas {got} != body {canvas[nm]}'
        add_depth('crew/' + name, gear_depth(objs, frames))
        times[name] = round(time.time() - t0, 1)
for o in parts: o.is_holdout = False
for o in all_gear: o.hide_render = True
print('[crew] render times (s):', times)
