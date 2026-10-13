"""Saboteur (js/invader.js): a stealth boarder. It slips in through an outer airlock, cloaks (the game
fades it to a shimmer with runtime alpha: not modelled), pops up in a neighbouring room and quietly
sabotages a ship part; caught, it backs off and fires a slow shot from a small sidearm.

Crew proportions (the same skeleton, walk cycle, canvas and ground origin as models/crew/crew.py, via
charlib.Human), but its own lean, slightly hunched silhouette so it never reads as crew, pirate or
alien: a matte charcoal / dark slate stealth suit with soft quilted panels, a smooth close-fitting
helmet with one narrow visor slit, a flat cloak emitter on the back (a ring coil and two small fins),
thin light strips along the suit's seams, a tool pouch and a multitool on the belt, a small pistol
holstered on the right thigh.

Tint mask (.m.png): the visor slit, the suit's light strips, the emitter's ring / core / fin lights and
the pistol's cell. The game tints them (cyan #5ae0ff sneaking / working, red #ff4a3a fighting) with
some emissive. In the beauty pass they glow a pale cyan.

Sprites (build/renders/chars/saboteur/), 8 directions each (dir i faces game angle i*45deg), same
canvas and ground origin (the game's (x, y)) for every upright set:
  saboteur/idle      1 frame   standing, slightly hunched, pistol holstered
  saboteur/walk      8 frames  crew.py's walk cycle (loops), a little lower and more hunched
  saboteur/aim       1 frame   one-handed: the pistol levelled forward at shoulder height
  saboteur/sabotage  6 frames  kneeling, both hands working just in front of it with the multitool
                               (a spark at its tip; loops: hands moving, tool jiggling)
  saboteur/stunned   2 frames  dazed and slumped (alternate slowly)
  saboteur/down      1 frame   lying on the back, head towards the facing direction (own canvas/origin:
                               the body's centre sits on the ground origin) -- the corpse
The shot, the cloak shimmer, the hurt flash and any HP pips stay procedural.

    blender -b --factory-startup --python tools/blender/models/chars/saboteur.py
    MN_PREVIEW=1 ...   16 samples, beauty + mask only, into /tmp/chars_preview (=1dir: one direction)
    MN_ONLY=idle,aim   only these sets;  MN_CPU=1  render on the CPU
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

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
def quilted(m, scale=15.0, strength=0.7, axis='Z'):
    """Soft quilting on a worn() material: rounded padded bands (wave bump in object space)."""
    nt = m.node_tree; N = nt.nodes; Lk = nt.links.new; b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = axis; wv.wave_profile = 'SIN'
    wv.inputs['Scale'].default_value = scale; wv.inputs['Distortion'].default_value = 0.0
    Lk(tc.outputs['Object'], wv.inputs['Vector'])
    sq = N.new('ShaderNodeMath'); sq.operation = 'POWER'; sq.inputs[1].default_value = 0.4; Lk(wv.outputs['Fac'], sq.inputs[0])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = strength; bp.inputs['Distance'].default_value = 0.02
    Lk(sq.outputs[0], bp.inputs['Height']); Lk(bp.outputs['Normal'], b.inputs['Normal'])
    return m

SUIT = quilted(C.worn('suit', '#505a68', 0.82, 0.0, grime=0.8, scratches=0.25, scale=2))
SUIT_Q = quilted(C.worn('suitQuiltV', '#505a68', 0.82, 0.0, grime=0.8, scratches=0.25, scale=2), scale=18, axis='Y')
SUIT_DK = C.worn('suitDark', '#363d48', 0.85, 0.0, grime=0.8, scratches=0.2, scale=2)
PLATE = C.worn('plate', '#7a8494', 0.5, 0.15, grime=1.0, scratches=0.7, scale=2)
PLATE_DK = C.worn('plateDark', '#4a525e', 0.55, 0.15, grime=0.9, scratches=0.6, scale=2)
HELM = C.worn('helmet', '#636d7c', 0.32, 0.1, grime=0.6, scratches=0.35, scale=2, coat=0.6)
STRAP = C.worn('strap', '#2e333b', 0.75, 0.0, grime=0.8, scratches=0.4, scale=3)
POUCH = C.worn('pouch', '#4c4a42', 0.85, 0.0, grime=1.2, scratches=0.3, scale=3)
STEEL = mn.mat('steel', 'steel', 0.3, 0.9)
DARK = mn.mat('dark', '#101216', 0.5)
RUBBER = mn.mat('rubber', 'rubber', 0.8)
TAPE = mn.mat('tape', '#9da3a8', 0.85)
HAZ = mn.mat('hazard', 'hazard', 0.5)
GLOW = C.glow('seam', '#9aeeff', 1.2, base='#5ae0ff', rough=0.2)       # tinted at runtime
SPARK = C.glow('spark', '#fff4c0', 2.5, base='#ffe08a', rough=0.2)
L_RED = C.glow('ledR', '#ff4a3a', 2.0)

parts, tinted = [], []
def keep(*objs):
    parts.extend(objs); return objs[0]
def add(o, parent):
    return keep(C.attach(o, parent))
def glow(o, parent):
    tinted.append(o); return add(o, parent)

R = C.Human('saboteur')
HIP_Z = C.HIP_Z
T, H = R.torso, R.hips

# ---------------------------------------------------------------------------
# Body (rest pose, world space; crew layout so the rig fits) -- a bit slimmer than the crew
# ---------------------------------------------------------------------------
add(mn.box('body', (0.27, 0.32, 0.40), loc=(0.0, 0, 0.39), m=SUIT, bevel=0.1), T)
add(mn.box('chestPad', (0.04, 0.2, 0.2), loc=(0.122, 0, 0.5), m=SUIT_Q, bevel=0.018), T)
add(mn.box('chestYoke', (0.06, 0.3, 0.07), loc=(0.11, 0, 0.7), m=PLATE_DK, bevel=0.025), T)
for s in (-1, 1):                                     # light strips: a V down the chest
    st = mn.box(f'chestStrip{s}', (0.014, 0.016, 0.24), loc=(0, 0, 0), m=GLOW, bevel=0.005)
    st.matrix_world = Matrix.Translation((0.142, s * 0.085, 0.47)) @ Matrix.Rotation(s * 0.33, 4, 'X')
    C.apply_tf(st); glow(st, T)
glow(mn.box('chestNode', (0.016, 0.04, 0.03), loc=(0.144, 0, 0.44), m=GLOW, bevel=0.008), T)
for s in (-1, 1):                                     # side seams
    glow(mn.box(f'sideStrip{s}', (0.016, 0.014, 0.26), loc=(0.0, s * 0.161, 0.47), m=GLOW, bevel=0.005), T)
add(mn.box('belt', (0.29, 0.34, 0.05), loc=(0.0, 0, 0.42), m=STRAP, bevel=0.02), T)
add(mn.box('buckle', (0.03, 0.07, 0.05), loc=(0.145, 0, 0.42), m=PLATE, bevel=0.01), T)
add(mn.box('toolPouch', (0.08, 0.07, 0.09), loc=(0.07, 0.165, 0.37), m=POUCH, bevel=0.022), T)
add(mn.box('pouchFlap', (0.085, 0.075, 0.03), loc=(0.07, 0.165, 0.44), m=STRAP, bevel=0.01), T)
add(mn.box('pouchTape', (0.012, 0.078, 0.025), loc=(0.11, 0.165, 0.395), m=TAPE, bevel=0.004), T)
# the spare multitool clipped to the belt (the one in use is in the hand while sabotaging)
add(mn.box('beltTool', (0.025, 0.03, 0.12), loc=(-0.02, -0.17, 0.33), m=HAZ, bevel=0.008, rot=(0, 0.25, 0)), T)
add(mn.box('beltToolHead', (0.04, 0.035, 0.03), loc=(-0.035, -0.17, 0.45), m=STEEL, bevel=0.008, rot=(0, 0.25, 0)), T)
add(mn.box('pelvis', (0.25, 0.28, 0.14), loc=(0.0, 0, 0.32), m=SUIT_DK, bevel=0.06), H)

# the cloak emitter: a flat unit on the back, a ring coil with a glowing core, two small fins
add(mn.box('emitter', (0.085, 0.27, 0.3), loc=(-0.175, 0, 0.45), m=PLATE_DK, bevel=0.03), T)
add(mn.box('emitterFace', (0.02, 0.22, 0.24), loc=(-0.222, 0, 0.48), m=PLATE, bevel=0.012), T)
bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.02, major_segments=40, minor_segments=10)
ring = bpy.context.active_object; ring.name = 'coil'
ring.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y')); ring.location = (-0.245, 0, 0.6)
mn.assign(ring, PLATE); mn.smooth(ring); add(ring, T)
bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.009, major_segments=40, minor_segments=8)
gr = bpy.context.active_object; gr.name = 'coilGlow'
gr.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y')); gr.location = (-0.265, 0, 0.6)
mn.assign(gr, GLOW); mn.smooth(gr); glow(gr, T)
glow(mn.cyl('emitterCore', 0.035, 0.02, loc=(-0.25, 0, 0.6), m=GLOW, bevel=0.008, rot=(0, -math.pi / 2, 0)), T)
for k in range(4):                                    # coil windings
    a = k * math.pi / 2 + math.pi / 4
    add(mn.box(f'winding{k}', (0.05, 0.03, 0.03), loc=(-0.25, 0.085 * math.cos(a), 0.6 - 0.015 + 0.085 * math.sin(a)),
               m=STRAP, bevel=0.008), T)
for s in (-1, 1):
    fin = mn.box(f'fin{s}', (0.11, 0.018, 0.12), loc=(0, 0, 0), m=PLATE, bevel=0.008)
    fin.matrix_world = Matrix.Translation((-0.19, s * 0.1, 0.72)) @ Matrix.Rotation(s * -0.35, 4, 'X') @ Matrix.Rotation(0.35, 4, 'Y')
    C.apply_tf(fin); add(fin, T)
    fl = mn.box(f'finLight{s}', (0.02, 0.022, 0.08), loc=(0, 0, 0), m=GLOW, bevel=0.006)
    fl.matrix_world = Matrix.Translation((-0.24, s * 0.1, 0.735)) @ Matrix.Rotation(s * -0.35, 4, 'X') @ Matrix.Rotation(0.35, 4, 'Y')
    C.apply_tf(fl); glow(fl, T)
add(mn.sphere('emitterLed', 0.012, loc=(-0.225, 0.09, 0.42), m=L_RED, segs=10), T)
add(mn.box('emitterTape', (0.012, 0.1, 0.035), loc=(-0.232, -0.06, 0.43), m=TAPE, bevel=0.004, rot=(0.4, 0, 0)), T)
for s in (-1, 1):                                     # straps over the shoulders
    add(mn.box(f'strap{s}', (0.3, 0.04, 0.035), loc=(-0.02, s * 0.105, 0.765), m=STRAP, bevel=0.012), T)

# collar + helmet: smooth, close-fitting, a bit egg-shaped, one narrow visor slit
HEAD = Vector((0.04, 0, 0.97)); HR = 0.185
add(mn.cyl('collar', 0.14, 0.07, loc=(0.0, 0, 0.765), m=SUIT_DK, bevel=0.025), T)
add(mn.cyl('collarRing', 0.155, 0.03, loc=(0.0, 0, 0.775), m=PLATE_DK, bevel=0.01), T)
HS = (1.12, 0.92, 0.98)
add(mn.sphere('helmet', HR, loc=HEAD, m=HELM, scale=HS, segs=64), R.head)
add(mn.sphere('chin', 0.11, loc=HEAD + Vector((0.1, 0, -0.08)), m=PLATE_DK, scale=(0.9, 1.1, 0.75), segs=32), R.head)
for k in range(3):                                    # rebreather grille
    add(mn.box(f'grille{k}', (0.02, 0.07, 0.008), loc=HEAD + Vector((0.195, 0, -0.105 + k * 0.022)), m=DARK, bevel=0.003,
               rot=(0, 0.5, 0)), R.head)
def slit(name, r_out, ry, rz, dz, m, thick):
    o = mn.sphere(name, r_out, loc=HEAD, m=m, scale=HS, segs=96)
    bpy.context.view_layer.update(); mn._apply_scale(o)
    C.window(o, ry, rz, dz, True)
    sol = o.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = thick; sol.offset = -1
    return o
add(slit('visorFrame', HR + 0.005, 0.2, 0.062, 0.03, DARK, 0.01), R.head)
glow(slit('visor', HR + 0.011, 0.175, 0.026, 0.035, GLOW, 0.006), R.head)
for s in (-1, 1):                                     # sensor pucks on the sides
    add(mn.cyl(f'puck{s}', 0.05, 0.03, loc=HEAD + Vector((-0.015, s * (HR * HS[1] - 0.012), 0.0)), m=PLATE_DK, bevel=0.01,
               rot=(-s * math.pi / 2, 0, 0)), R.head)

# arms: slim, quilted, armoured forearms with a light strip each
for s in (-1, 1):
    y = s * 0.235; sh, el = R.arms[s], R.elbows[s]
    add(mn.sphere(f'shoulderPad{s}', 0.085, loc=(0.0, y - s * 0.005, HIP_Z + 0.345), m=PLATE_DK, scale=(1.0, 0.9, 0.75)), sh)
    glow(mn.box(f'shoulderStrip{s}', (0.12, 0.014, 0.014), loc=(0.0, y + s * 0.07, HIP_Z + 0.345), m=GLOW, bevel=0.005,
                rot=(s * 0.5, 0, 0)), sh)
    add(C.capsule(f'upperArm{s}', 0.056, HIP_Z + 0.34, HIP_Z + 0.17, y=y + s * 0.005, m=SUIT), sh)
    add(mn.sphere(f'elbowPad{s}', 0.055, loc=(0.0, y + s * 0.007, HIP_Z + 0.19), m=SUIT_DK, segs=20), el)
    add(C.capsule(f'foreArm{s}', 0.056, HIP_Z + 0.20, HIP_Z + 0.06, y=y + s * 0.01, m=PLATE_DK), el)
    glow(mn.box(f'armStrip{s}', (0.016, 0.014, 0.1), loc=(0.0, y + s * 0.066, HIP_Z + 0.08), m=GLOW, bevel=0.005), el)
    add(mn.sphere(f'glove{s}', 0.058, loc=(0.01, y + s * 0.012, HIP_Z + 0.01), m=STRAP, scale=(1.05, 0.85, 1.0), segs=20), R.hands[s])

# legs: slim quilted legs, shin guards, soft-soled boots; light strips down the outer thighs
for s in (-1, 1):
    y = s * 0.085; hp, kn = R.legs[s], R.knees[s]
    add(C.capsule(f'thigh{s}', 0.07, HIP_Z - 0.03, 0.20, y=y, m=SUIT), hp)
    glow(mn.box(f'thighStrip{s}', (0.016, 0.014, 0.13), loc=(0.0, y + s * 0.072, 0.22), m=GLOW, bevel=0.005), hp)
    add(mn.sphere(f'kneePad{s}', 0.06, loc=(0.03, y, 0.21), m=PLATE_DK, segs=20, scale=(0.8, 1, 1)), kn)
    add(C.capsule(f'shin{s}', 0.066, 0.22, 0.07, y=y, m=SUIT_DK), kn)
    add(mn.box(f'shinGuard{s}', (0.03, 0.09, 0.11), loc=(0.06, y, 0.09), m=PLATE, bevel=0.012), kn)
    add(mn.box(f'boot{s}', (0.2, 0.13, 0.1), loc=(0.03, y, 0.02), m=STRAP, bevel=0.04), kn)
    add(mn.box(f'sole{s}', (0.21, 0.14, 0.03), loc=(0.03, y, 0.0), m=RUBBER, bevel=0.012), kn)

# the pistol: two copies -- holstered on the right thigh, or in the right hand
def pistol(tag, parent, M):
    objs = []
    def p(o):
        o.matrix_basis = M @ o.matrix_basis; C.apply_tf(o); objs.append(o); return o
    p(mn.box(tag + 'Grip', (0.04, 0.032, 0.075), loc=(0.0, 0, -0.06), m=DARK, bevel=0.01, rot=(0, -0.2, 0)))
    p(mn.box(tag + 'Slide', (0.17, 0.042, 0.05), loc=(0.04, 0, 0.0), m=PLATE, bevel=0.012))
    p(mn.box(tag + 'Frame', (0.1, 0.03, 0.025), loc=(0.03, 0, -0.018), m=DARK, bevel=0.008))
    mz = C.cone_x(tag + 'Muzzle', 0.018, 0.016, 0.035, DARK, x0=0.125, verts=12); mz.location = (0, 0, 0.025); p(mz)
    cell = p(mn.box(tag + 'Cell', (0.07, 0.044, 0.014), loc=(0.02, 0, 0.046), m=GLOW, bevel=0.004))
    for o in objs: add(o, parent)
    tinted.append(cell)
    return objs
gun_hand = pistol('gun', R.hands[-1], Matrix.Translation((0.045, -0.247, HIP_Z + 0.02)) @ Matrix.Scale(1.35, 4))
holster = [add(mn.box('holster', (0.06, 0.03, 0.13), loc=(0.015, -0.168, 0.12), m=STRAP, bevel=0.012), R.legs[-1])]
gun_hol = pistol('holGun', R.legs[-1], Matrix.Translation((-0.005, -0.19, 0.25)) @ Matrix.Rotation(1.35, 4, 'Y') @ Matrix.Scale(1.1, 4))

# the multitool in use (sabotage): held in the right hand, pointing forward, a spark at its tip
TOOL = []
tm = Matrix.Translation((0.03, -0.247, HIP_Z + 0.0))
def tp(o):
    o.matrix_basis = tm @ o.matrix_basis; C.apply_tf(o); TOOL.append(add(o, R.hands[-1])); return o
tp(mn.box('toolGrip', (0.11, 0.035, 0.035), loc=(0.02, 0, -0.017), m=HAZ, bevel=0.01))
tp(mn.box('toolBand', (0.02, 0.038, 0.038), loc=(0.06, 0, -0.019), m=DARK, bevel=0.006))
tp(C.cone_x('toolShaft', 0.012, 0.006, 0.12, STEEL, x0=0.075, verts=10))
spark = []
for k in range(5):                                    # a small star of hot streaks at the tip
    a = k * 2 * math.pi / 5
    sp = C.cone_x(f'spark{k}', 0.006, 0.0, 0.05, SPARK, verts=6)
    sp.matrix_world = Matrix.Rotation(a, 4, 'X') @ Matrix.Rotation(0.9, 4, 'Z'); C.apply_tf(sp)
    spark.append(sp)
spk = C.empty('sparkPivot', (0.03 + 0.195, -0.247, HIP_Z), R.hands[-1])
for sp in spark:
    sp.location = (0, 0, 0); C.local(sp, spk); keep(sp)
glow_ball = mn.sphere('sparkCore', 0.014, loc=(0, 0, 0), m=SPARK, segs=10); C.local(glow_ball, spk); keep(glow_ball)
TOOL += spark + [glow_ball]
R.keys.add(spk)

mn.tint(*tinted)
no_outline = set(spark + [glow_ball])
mn.outline([o for o in parts if o not in no_outline], thickness=0.012)

# ---------------------------------------------------------------------------
# Poses
# ---------------------------------------------------------------------------
def neutral_extras():
    spk.rotation_euler = (0, 0, 0); spk.scale = (1, 1, 1)

def hunch(R, lean=0.24, look=-0.2):
    R.torso.rotation_euler.y += lean; R.head.rotation_euler.y += look
    for s in (-1, 1):                                  # arms hang a touch forward, slightly bent
        R.arms[s].rotation_euler.y -= lean * 0.7
        R.elbows[s].rotation_euler.y -= 0.1

def pose(kind, t=0.0):
    neutral_extras()
    if kind == 'idle':
        C.pose_human(R, 'idle'); hunch(R)
        for s in (-1, 1):                              # knees a little soft, weight low
            R.legs[s].rotation_euler.y -= 0.14; R.knees[s].rotation_euler.y += 0.28
        R.hips.location.z -= 0.012
    elif kind == 'walk':                               # crew.py's cycle, a little lower and hunched
        C.pose_human(R, 'walk', t, gait=0.95); hunch(R, 0.26, -0.22)
        for s in (-1, 1):
            R.legs[s].rotation_euler.y -= 0.16; R.knees[s].rotation_euler.y += 0.32
        R.hips.location.z -= 0.015
    elif kind == 'aim':                                # one-handed, pistol at shoulder height
        C.pose_human(R, 'idle')
        R.torso.rotation_euler = (0, 0.1, math.radians(22))
        R.head.rotation_euler = (0, -0.06, math.radians(-18))
        R.arms[-1].rotation_euler = (math.radians(4), math.radians(-86), math.radians(-20))
        R.elbows[-1].rotation_euler = (0, math.radians(-4), 0)
        R.hands[-1].rotation_euler = (0, math.radians(90), 0)
        R.arms[1].rotation_euler = (math.radians(-12), math.radians(20), 0)       # free arm back, for balance
        R.elbows[1].rotation_euler = (0, math.radians(-35), 0)
        R.legs[-1].rotation_euler = (0, 0.22, 0); R.legs[1].rotation_euler = (0, -0.3, 0)
        R.knees[-1].rotation_euler = (0, 0.2, 0); R.knees[1].rotation_euler = (0, 0.3, 0)
        R.hips.location.z = HIP_Z - 0.025
    elif kind == 'sabotage':                           # kneeling, both hands at work in front
        C.pose_human(R, 'idle')
        p = 2 * math.pi * t
        dz = -0.16; hj = HIP_Z - 0.04 + dz
        R.hips.location.z = HIP_Z + dz + 0.006 * math.sin(2 * p)
        def leg(s, a):                                 # thigh forward by a, shin back down to the floor
            kz = hj - 0.15 * math.cos(a); phi = math.acos(max(-1, min(1, (kz - 0.02) / 0.2)))
            R.legs[s].rotation_euler = (0, -a, 0); R.knees[s].rotation_euler = (0, a + phi, 0)
        leg(1, 1.3)                                    # left foot planted forward
        leg(-1, 0.15)                                  # right knee down
        R.legs[-1].rotation_euler.x = math.radians(4)
        R.torso.rotation_euler = (0, 0.42 + 0.02 * math.sin(p), math.radians(-6))
        R.head.rotation_euler = (0, 0.2, math.radians(6))
        R.arms[-1].rotation_euler = (math.radians(14), -0.72 + 0.1 * math.sin(p), 0)
        R.elbows[-1].rotation_euler = (0, -0.85 + 0.12 * math.cos(p), 0)
        R.hands[-1].rotation_euler = (0.35 * math.sin(2 * p), 0.85 + 0.15 * math.sin(p + 1.0), 0.25 * math.cos(3 * p))
        R.arms[1].rotation_euler = (math.radians(-16), -0.62 - 0.1 * math.sin(p + 1.5), 0)
        R.elbows[1].rotation_euler = (0, -0.95 + 0.1 * math.cos(p + 0.7), 0)
        R.hands[1].rotation_euler = (0.2 * math.cos(p), 0.4, 0)
        sc = (1.0, 0.55, 1.25, 0.75, 1.15, 0.45)[int(round(t * 6)) % 6]
        spk.rotation_euler = (t * 7.0, 0.3 * math.sin(p), 0); spk.scale = (sc, sc, sc)
    elif kind == 'stunned':
        C.pose_human(R, 'stunned', t); R.torso.rotation_euler.y += 0.08
    elif kind == 'down':
        C.pose_human(R, 'down')
        R.lie.location.z = C.lie_height(R, [o for o in parts if not o.hide_render])

def show(objs, on):
    for o in objs: o.hide_render = not on

F = {}
F['idle'] = [R.keys.key(pose, 'idle')]
F['walk'] = R.keys.seq(pose, [('walk', i / 8) for i in range(8)])
F['aim'] = [R.keys.key(pose, 'aim')]
F['sabotage'] = R.keys.seq(pose, [('sabotage', i / 6) for i in range(6)])
F['stunned'] = R.keys.seq(pose, [('stunned', 0.25), ('stunned', 0.75)])
show(gun_hand + TOOL, False)                          # down: lie_height over what's shown then
F['down'] = [R.keys.key(pose, 'down')]
C.linear_keys()

proxy = mn.cyl('canvasProxy', 1.0, 1.36, verts=32, bevel=0); proxy.hide_render = True
proxy.scale = (0.72, 0.52, 1.0)          # the crew's canvas, a bit wider for the aim / sabotage reach
passes = ('beauty', 'mask') if PREVIEW else ('beauty', 'normal', 'height', 'mask')
times = {}
for name, frames in F.items():
    if ONLY and name not in ONLY: continue
    show(gun_hand, name == 'aim'); show(gun_hol, name != 'aim'); show(TOOL, name == 'sabotage')
    objs = [o for o in parts if not o.hide_render] + ([proxy] if name != 'down' else [])
    t0 = time.time()
    mn.render('chars/saboteur/' + name, objs=objs, root=R.root, dirs=8 if PREVIEW != '1dir' else 1, frames=frames, passes=passes)
    times[name] = round(time.time() - t0, 1)
print('[saboteur] render times (s):', times)
