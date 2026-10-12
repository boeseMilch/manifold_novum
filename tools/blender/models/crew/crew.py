"""Crew member (player character): bulky white spacesuit, life-support pack, big round helmet.

Sprites (all share one canvas and ground origin, 8 facing directions each):
  crew/idle, crew/idle_visor     standing, visor up (face visible) / down (gold visor)
  crew/walk, crew/walk_visor     8-frame walk cycle (loops: frame 7 -> frame 0)
Suit-colour parts (shoulder caps, backpack stripe, chest stripe) are neutral grey and marked
with mn.tint, so the .m.png mask says where the game recolours them per player.

    blender -b --factory-startup --python tools/blender/models/crew/crew.py
    MN_PREVIEW=1 ...      beauty + mask only, into /tmp/crew_preview (for iterating; =idle: one walk frame)
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import bpy
from mathutils import Vector, Matrix
import mn

PREVIEW = os.environ.get('MN_PREVIEW')
if PREVIEW:
    mn.OUT_DIR = '/tmp/crew_preview'; mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')

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
SKIN = mn.mat('skin', 'skin', 0.6, emit='skin', emit_strength=0.25)   # faint glow: the face sits in the helmet's shadow
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
# Rig: root (turns for directions) > hips (bob) > torso (twist) > arms/head; hips > legs
# Model faces +X (game right); +Y is the character's left.
# ---------------------------------------------------------------------------
root = empty('crew', (0, 0, 0))
HIP_Z = 0.40
hips = empty('hips', (0, 0, HIP_Z), root)
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
window(helmet, 0.18, 0.14, 0.035, False)
sol = helmet.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.022; sol.offset = -1
helmet.data.materials.append(SEAL); sol.material_offset_rim = 1; sol.material_offset = 1
keep(attach(helmet, head))
# gold visor: a slightly bigger spherical cap over the window, pivoting on the helmet centre
visor = mn.sphere('visor', HR + 0.012, loc=HEAD, m=VISOR, segs=96)
window(visor, 0.20, 0.16, 0.035, True)
sol = visor.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = -1
keep(attach(visor, head))
# helmet details: side lamps, top ridge
for s in (-1, 1):
    keep(attach(mn.cyl(f'lampHousing{s}', 0.04, 0.05, loc=HEAD + Vector((0.03, s * (HR - 0.01), 0.07)), m=PACK, bevel=0.012, rot=(-s * math.pi / 2, 0, 0)), head))
    keep(attach(mn.sphere(f'lamp{s}', 0.026, loc=HEAD + Vector((0.07, s * (HR + 0.025), 0.07)), m=LAMP, segs=12), head))
# face inside the helmet
keep(attach(mn.sphere('face', 0.165, loc=HEAD + Vector((0.015, 0, 0.0)), m=SKIN), head))
keep(attach(mn.sphere('hair', 0.155, loc=HEAD + Vector((-0.035, 0, 0.04)), m=HAIR, scale=(1, 1.05, 0.98)), head))
for s in (-1, 1):
    keep(attach(mn.sphere(f'eye{s}', 0.02, loc=HEAD + Vector((0.17, s * 0.055, 0.02)), m=EYE, segs=12, scale=(0.6, 1, 1.3)), head))
keep(attach(mn.sphere('nose', 0.025, loc=HEAD + Vector((0.18, 0, -0.015)), m=SKIN, segs=12), head))

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
# Poses
# ---------------------------------------------------------------------------
def pose(t=None):
    """t = walk phase in [0, 1) or None for idle. Sets the rig's transforms."""
    for s in (-1, 1):
        arms[s].rotation_euler = (s * math.radians(-6), 0, 0)     # arms slightly out from the body
        elbows[s].rotation_euler = (0, math.radians(-12), 0)
        legs[s].rotation_euler = (0, 0, 0); knees[s].rotation_euler = (0, 0, 0)
    hips.location.z = HIP_Z; torso.rotation_euler = (0, 0, 0); head.rotation_euler = (0, 0, 0)
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
movers = [hips, torso, head] + list(arms.values()) + list(elbows.values()) + list(legs.values()) + list(knees.values())
def key(frame, t):
    bpy.context.scene.frame_set(frame)        # first: frame_set re-applies existing keys
    pose(t)
    for o in movers:
        o.keyframe_insert('location', frame=frame); o.keyframe_insert('rotation_euler', frame=frame)

IDLE_F = 100
key(IDLE_F, None)
for i in range(WALK):
    key(1 + i, i / WALK)

# ---------------------------------------------------------------------------
# Shared canvas: an invisible proxy covering everything any variant can reach, so idle/walk and
# visor up/down all get the same canvas size and origin.
# ---------------------------------------------------------------------------
proxy = mn.cyl('canvasProxy', 0.46, 1.27, verts=32, bevel=0)
proxy.hide_render = True
frame_objs = parts + [proxy]

def set_visor(down):
    """Down: gold visor over the window (vacuum). Up: the visor slides up *inside* the shell (like a
    sun shade), only its lower edge peeking over the top of the open window."""
    visor.rotation_euler = (0, 0 if down else math.radians(-88), 0)
    visor.scale = (1, 1, 1) if down else (0.84, 0.84, 0.84)
    for n in ('face', 'hair', 'eye-1', 'eye1', 'nose'):
        bpy.data.objects[n].hide_render = down                          # hidden behind the visor anyway

import time
passes = ('beauty', 'mask') if PREVIEW else ('beauty', 'normal', 'height', 'mask')
walk_frames = list(range(1, 1 + WALK))
dirs = 8
if PREVIEW == 'idle': walk_frames = walk_frames[:1]
times = {}
for down in (False, True):
    set_visor(down); suf = '_visor' if down else ''
    t0 = time.time()
    mn.render('crew/idle' + suf, objs=frame_objs, root=root, dirs=dirs, frames=[IDLE_F], passes=passes)
    times['idle' + suf] = time.time() - t0; t0 = time.time()
    mn.render('crew/walk' + suf, objs=frame_objs, root=root, dirs=dirs,
              frames=walk_frames, passes=passes)
    times['walk' + suf] = time.time() - t0
print('[crew] render times (s):', {k: round(v, 1) for k, v in times.items()})
