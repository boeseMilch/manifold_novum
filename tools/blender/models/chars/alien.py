"""The intruder (js/invader.js drawAlien / drawAlienBody / alienPose): something with too many legs.

Violet plated carapace with a spiked bone ridge and glowing green pustules, a segmented tail with a
stinger, six long spider-knee legs with hooked claws, a wedge head with a cluster of eyes, mandibles,
long antennae and an acid sac under the throat.

Sprites (assets/sprites/chars/), 8 directions each (dir i faces game angle i*45deg, a.face), all with
the same canvas and ground origin (the game's (a.x, a.y)):
  alien/idle        1 frame   standing (wander, entering, lingering)
  alien/walk        8 frames  tripod scuttle; loops. One cycle = WALK_DIST units travelled
  alien/ready       8 frames  fight ready stance: crouched, front legs raised like a mantis, rear and
                              tail up; strafing scuttle (frame 0 doubles as standing still)
  alien/spit        5 frames  0-3 windup (act.t / SPIT_WINDUP: rears back, throat sac swells and glows),
                              4 = the spit (head thrust forward, acid at the mouth; act.fired)
  alien/coil        2 frames  pounce windup: pressed flat, legs tucked, rear wiggling (alternate fast)
  alien/leap        1 frame   pounce leap / dodge lunge (P.stretch): stretched out, legs flung wide
  alien/sprawl      1 frame   recover (P.sprawl): splayed flat, off balance
  alien/stunned     2 frames  dazed (a.stun > 0): flat, legs twitching (alternate ~6/s)
  alien/sabotage    4 frames  tearing at a system / bashing a door (task sabotage, bashDoor, locked hatch)
  alien/dormant     1 frame   asleep on the derelict: folded up, tail curled round
  alien/dead        1 frame   on its back, legs curled, in a puddle of green goo (a corpse decal)
Eyes are marked with mn.tint (.m.png): the game tints them green (wander), red (fight) or flashing
white (pounce windup), like drawAlienBody's eye colour. Hurt flash and stun stars stay procedural.

    blender -b --factory-startup --python tools/blender/models/chars/alien.py
    MN_PREVIEW=1 ...   16 samples, beauty + mask only, into /tmp/chars_preview
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
SHELL = C.chitin('shell', '#f0b8ff', '#a85ccc', '#4a1a62')
SHELL_DK = C.chitin('shellDark', '#b070cc', '#6a2e84', '#2a0c38', rough=0.38)
LEG = C.chitin('leg', '#c080dc', '#7a3c92', '#2e0c3a', rough=0.36, scale=2)
SOFT = C.chitin('soft', '#7a5a86', '#4a3054', '#1e1024', rough=0.6, coat=0.1)      # joints, underbelly
BONE = C.worn('bone', '#d8c8a0', 0.45, 0.0, grime=1.4, scratches=0.0, coat=0.4)
CLAW = C.worn('claw', '#c9b38a', 0.35, 0.0, grime=1.8, scratches=0.0, coat=0.6)
KNEE = C.chitin('knee', '#c48ae0', '#9a5ab0', '#4e2060', rough=0.3)
SPOT = C.glow('spot', '#86ff3a', 2.0, base='#7ae83a')
EYE = C.glow('eye', '#b4ff6e', 1.6, base='#9cff5a', rough=0.1)
ACID = C.glow('acid', '#9cff5a', 1.2, base='#7fe040', rough=0.15)
GOO = C.glow('goo', '#7ee04a', 0.5, base='#5cb82e', rough=0.08)
MOUTH = mn.mat('mouth', '#14060e', 0.6)
for m in (ACID, GOO):
    m.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 1.0

parts = []
def keep(*objs):
    parts.extend(objs); return objs[0]

# ---------------------------------------------------------------------------
# Rig: root (directions) > body (height, lean) > head, abdomen > tail chain; legs: IK from hips
# Model faces +X.
# ---------------------------------------------------------------------------
BODY_Z = 0.24
root = C.empty('alien')
body = C.empty('body', (0, 0, BODY_Z), root)
head = C.empty('head', (0.16, 0, BODY_Z + 0.01), body)
abd = C.empty('abdomen', (-0.08, 0, BODY_Z + 0.02), body)

def sph(name, loc, scale, m, segs=32):
    return mn.sphere(name, 1.0, loc=loc, m=m, scale=scale, segs=segs)

# thorax: rounded, with a raised shield plate and a row of small spines
keep(C.attach(sph('thorax', (0.04, 0, BODY_Z), (0.16, 0.13, 0.095), SHELL), body))
keep(C.attach(sph('underbelly', (0.02, 0, BODY_Z - 0.04), (0.15, 0.1, 0.06), SOFT), body))
shield = sph('shield', (0.05, 0, BODY_Z + 0.045), (0.14, 0.125, 0.06), SHELL_DK, 48)
keep(C.attach(shield, body))
for i, (x, s) in enumerate([(0.10, 1), (0.10, -1), (0.0, 1), (0.0, -1)]):
    sp = C.spike(f'tspine{i}', 0.016, 0.06, BONE)
    sp.location = (x, s * 0.085, BODY_Z + 0.075); sp.rotation_euler = (s * -0.7, -0.5, 0)
    keep(C.attach(sp, body))

# head: a flat wedge with a bony brow and backswept horns
HX = 0.16
keep(C.attach(sph('head', (HX + 0.07, 0, BODY_Z + 0.01), (0.11, 0.085, 0.062), SHELL_DK), head))
keep(C.attach(sph('snout', (HX + 0.15, 0, BODY_Z - 0.005), (0.06, 0.05, 0.038), SHELL_DK), head))
keep(C.attach(sph('brow', (HX + 0.08, 0, BODY_Z + 0.042), (0.085, 0.095, 0.032), SHELL), head))
for s in (-1, 1):
    hn = C.tube(f'horn{s}', [(HX + 0.08, s * 0.06, BODY_Z + 0.055), (HX + 0.0, s * 0.09, BODY_Z + 0.10), (HX - 0.07, s * 0.1, BODY_Z + 0.12)],
                0.018, BONE, r_end=0.003)
    keep(C.attach(hn, head))
keep(C.attach(sph('mouth', (HX + 0.19, 0, BODY_Z - 0.02), (0.02, 0.03, 0.014), MOUTH, 16), head))
eyes = []
for i, (x, y, z, r) in enumerate([(0.14, 0.045, 0.035, 0.032), (0.14, -0.045, 0.035, 0.032), (0.195, 0, 0.03, 0.025),
                                   (0.105, 0.072, 0.04, 0.016), (0.105, -0.072, 0.04, 0.016), (0.18, 0.035, 0.05, 0.011), (0.18, -0.035, 0.05, 0.011)]):
    e = keep(C.attach(mn.sphere(f'eye{i}', r, loc=(HX + x, y, BODY_Z + z), m=EYE, segs=16), head))
    eyes.append(e)
mn.tint(*eyes)
# antennae: long, whippy, arching forward and out
for s in (-1, 1):
    an = C.tube(f'antenna{s}', [(HX + 0.16, s * 0.035, BODY_Z + 0.04), (HX + 0.27, s * 0.12, BODY_Z + 0.16),
                                (HX + 0.38, s * 0.24, BODY_Z + 0.2), (HX + 0.44, s * 0.33, BODY_Z + 0.16)], 0.009, LEG, r_end=0.003)
    keep(C.attach(an, head))
# mandibles on their own pivots (spread to spit / chew)
mands = {}
for s in (-1, 1):
    pv = C.empty(f'mandPivot{s}', (HX + 0.18, s * 0.035, BODY_Z - 0.02), head)
    md = C.tube(f'mandible{s}', [(HX + 0.18, s * 0.035, BODY_Z - 0.02), (HX + 0.25, s * 0.06, BODY_Z - 0.03),
                                 (HX + 0.29, s * 0.02, BODY_Z - 0.04)], 0.014, CLAW, r_end=0.003)
    keep(C.attach(md, pv)); mands[s] = pv
# acid sac under the throat (scaled up during the spit windup) and the acid at the mouth (the spit)
sac = sph('sac', (HX + 0.03, 0, BODY_Z + 0.0), (0.075, 0.1, 0.07), ACID); mn._apply_scale(sac)
keep(C.attach(sac, head))
drool = sph('drool', (HX + 0.27, 0, BODY_Z - 0.04), (0.045, 0.035, 0.03), ACID, 16); mn._apply_scale(drool)
keep(C.attach(drool, head))

# abdomen: big, segmented, overlapping armour bands, a spiked ridge and glowing pustules
AC = Vector((-0.31, 0, BODY_Z + 0.05)); AS = Vector((0.27, 0.2, 0.15))
keep(C.attach(sph('abdomen', AC, AS, SOFT), abd))
def band(name, x0, x1, grow, tilt):
    o = sph(name, AC, AS * grow, SHELL, 64); C.apply_tf(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (x0 <= f.calc_center_median().x <= x1 and f.calc_center_median().z > AC.z - 0.07)], context='FACES')
    bm.to_mesh(o.data); bm.free()
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.014; sol.offset = 1
    mn.bev(o, 0.006, 2)
    o.data.transform(Matrix.Translation(Vector((x1, 0, AC.z))) @ Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Translation(-Vector((x1, 0, AC.z))))
    return mn.smooth(o)
for i, (x0, x1) in enumerate([(-0.17, -0.06), (-0.285, -0.16), (-0.40, -0.275), (-0.6, -0.39)]):
    keep(C.attach(band(f'band{i}', x0, x1, 1.06 - 0.008 * i, 0.11), abd))
def on_top(x, y, grow=1.1):
    a, b, c = AS * grow
    return AC.z + c * math.sqrt(max(0, 1 - ((x - AC.x) / a) ** 2 - (y / b) ** 2))
for i, x in enumerate([-0.11, -0.22, -0.33, -0.44]):
    zc = on_top(x, 0, 1.08)
    sp = C.spike(f'ridge{i}', 0.038, 0.17 if i % 2 == 0 else 0.13, BONE)
    sp.location = (x, 0, zc); sp.rotation_euler = (0, -0.45, 0); keep(C.attach(sp, abd))
    for s in (-1, 1):                              # smaller side spines
        sp = C.spike(f'side{i}{s}', 0.014, 0.05, BONE)
        sp.location = (x - 0.01, s * AS.y * 0.72 * math.sqrt(max(0, 1 - ((x - AC.x) / AS.x) ** 2)), zc - 0.05)
        sp.rotation_euler = (s * -0.9, -0.4, 0); keep(C.attach(sp, abd))
for i, (x, y) in enumerate([(-0.15, 0.1), (-0.21, -0.12), (-0.31, 0.13), (-0.37, -0.1), (-0.46, 0.07), (-0.27, -0.04)]):
    keep(C.attach(mn.sphere(f'spot{i}', 0.03 - 0.006 * (i % 2), loc=(x, y, on_top(x, y, 1.06) + 0.004), m=SPOT, segs=12, scale=(1, 1, 0.7)), abd))

# tail: four segments curling up behind, then the stinger
tail = []; prev = abd; tx = AC.x - AS.x + 0.03
for i in range(5):
    r = 0.058 - 0.008 * i
    j = C.empty(f'tail{i}', (tx, 0, AC.z), prev)
    keep(C.attach(sph(f'tailSeg{i}', (tx - 0.035, 0, AC.z), (0.05, r, r * 0.9), SHELL if i % 2 else SHELL_DK, 24), j))
    sp = C.spike(f'tailSpine{i}', 0.012, 0.04, BONE); sp.location = (tx - 0.035, 0, AC.z + r * 0.8); sp.rotation_euler = (0, -0.6, 0)
    keep(C.attach(sp, j))
    tail.append(j); prev = j; tx -= 0.065
sting = C.spike('stinger', 0.03, 0.12, CLAW); sting.location = (tx + 0.01, 0, AC.z); sting.rotation_euler = (0, -math.pi / 2 - 0.3, 0)
keep(C.attach(sting, prev))
keep(C.attach(mn.sphere('stingBulb', 0.035, loc=(tx + 0.02, 0, AC.z), m=SHELL_DK, segs=16), prev))

# goo puddle (dead only)
def puddle():
    me = bpy.data.meshes.new('goo'); bm = bmesh.new(); n = 40; vs = []
    import random; rnd = random.Random(7)
    rr = [1 + 0.25 * math.sin(3 * a) * 0 for a in range(n)]
    for k in range(n):
        a = 2 * math.pi * k / n
        r = 0.48 * (1 + 0.18 * math.sin(3 * a + 1) + 0.1 * math.sin(7 * a) + 0.08 * rnd.uniform(-1, 1))
        vs.append(bm.verts.new((math.cos(a) * r * 1.1 - 0.08, math.sin(a) * r, 0.004)))
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMFace)][0]
    bmesh.ops.translate(bm, verts=top.verts, vec=(0, 0, 0.012)); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('goo', me)); mn.assign(o, GOO); mn.bev(o, 0.01, 3); return mn.smooth(o)
goo = [puddle()]
for i, (x, y, r) in enumerate([(0.5, 0.25, 0.05), (0.45, -0.32, 0.035), (-0.62, 0.12, 0.04), (0.2, 0.52, 0.03)]):
    goo.append(mn.sphere(f'splat{i}', 1, loc=(x, y, 0.0), m=GOO, scale=(r * 1.3, r, 0.012), segs=16))
goo_root = C.empty('gooRoot', (0, 0, 0), root)
for g in goo: keep(C.attach(g, goo_root))

# ---------------------------------------------------------------------------
# Legs: femur + knee + tibia + claw, posed by IK from a hip (on the body) to a foot target (ground)
# ---------------------------------------------------------------------------
A, B = 0.30, 0.37
HIPS = {(i, s): Vector((x, s * y, BODY_Z - 0.01)) for i, (x, y) in enumerate([(0.11, 0.08), (0.035, 0.105), (-0.045, 0.095)]) for s in (-1, 1)}
hipmark, legE, kneeE = {}, {}, {}
for (i, s), hp in HIPS.items():
    hipmark[i, s] = C.empty(f'hipMark{i}{s}', hp, body)
    L = C.empty(f'leg{i}{s}', hp, root); legE[i, s] = L
    keep(C.local(C.cone_x(f'femur{i}{s}', 0.036, 0.026, A, LEG, x0=-0.02), L))
    for k, fx in enumerate((0.12, 0.22)):
        sp = C.spike(f'fspine{i}{s}{k}', 0.011, 0.045, BONE); sp.location = (fx, 0, 0.022); sp.rotation_euler = (0, -0.7, 0)
        keep(C.local(sp, L))
    K = C.empty(f'knee{i}{s}', (A, 0, 0)); C.local(K, L); kneeE[i, s] = K
    keep(C.local(mn.sphere(f'kneeBall{i}{s}', 0.03, m=KNEE, segs=16), K))
    keep(C.local(C.cone_x(f'tibia{i}{s}', 0.026, 0.012, B - 0.07, LEG), K))
    keep(C.local(C.cone_x(f'tibiaTip{i}{s}', 0.013, 0.003, 0.085, CLAW, x0=B - 0.075), K))
    sp = C.spike(f'tspur{i}{s}', 0.009, 0.04, CLAW); sp.location = (B - 0.11, 0, -0.01); sp.rotation_euler = (0, math.pi - 0.6, 0)
    keep(C.local(sp, K))
    for k, fx in enumerate((0.08, 0.17)):          # bristles on the shin
        sp = C.spike(f'bristle{i}{s}{k}', 0.006, 0.035, BONE); sp.location = (fx, 0, 0.016); sp.rotation_euler = (0, -0.9, 0)
        keep(C.local(sp, K))

mn.outline([o for o in parts if o.name.split('.')[0] not in ('goo',) and not o.name.startswith('splat')], thickness=0.011)
mn.outline([o for o in parts if o.name.startswith('goo') or o.name.startswith('splat')], thickness=0.008)

# ---------------------------------------------------------------------------
# Poses
# ---------------------------------------------------------------------------
FEET = {0: (0.44, 0.36), 1: (0.05, 0.50), 2: (-0.38, 0.40)}      # resting foot targets (x, |y|) on the ground
TRIPOD = {(0, 1): 0, (1, -1): 0, (2, 1): 0, (0, -1): 0.5, (1, 1): 0.5, (2, -1): 0.5}
STRIDE = 0.17                 # foot travel each way: one cycle = 4 * STRIDE units of ground
WALK_DIST = 4 * STRIDE

def step(phase, stride, lift):
    """Foot offset along x and height for a leg at gait phase 0..1 (stance first, then swing)."""
    phase %= 1.0
    if phase < 0.5: return stride * (1 - 4 * phase), 0.0
    u = (phase - 0.5) / 0.5
    return -stride * math.cos(math.pi * u), lift * math.sin(math.pi * u)

def pose(P):
    """P: dict of pose parameters; missing ones default to the plain standing pose."""
    g = lambda k, d=0.0: P.get(k, d)
    body.location = (g('bx'), g('by'), BODY_Z + g('bz'))
    body.rotation_euler = (g('roll'), -g('rear'), g('yaw'))
    head.location = (0.16 + g('head_x'), 0, BODY_Z + 0.01)
    head.rotation_euler = (0, -g('head_up'), g('head_yaw'))
    abd.location = (-0.08 + g('abd_x'), 0, BODY_Z + 0.02)
    abd.rotation_euler = (0, g('abd_down'), g('wiggle'))
    for k, j in enumerate(tail):
        j.rotation_euler = (0, -g('curl', 0.4) * (0.6 + 0.3 * k), g('swish') * (0.5 + 0.25 * k))
    for s in (-1, 1): mands[s].rotation_euler = (0, 0, s * g('mand'))
    sk = max(0.001, g('sac')); sac.scale = (sk, sk, sk)
    dk = max(0.001, g('drool')); drool.scale = (dk, dk, dk)
    gk = max(0.001, g('goo')); goo_root.scale = (gk, gk, 1)
    bpy.context.view_layer.update()
    feet = P.get('feet') or {}
    for (i, s), L in legE.items():
        hp = hipmark[i, s].matrix_world.translation.copy()
        fx, fy = FEET[i]; f = feet.get((i, s)) or feet.get(i) or (fx, fy, 0.0)
        target = Vector((f[0], s * f[1], f[2]))
        yaw, a, b = C.leg_ik(hp, target, A, B)
        L.location = hp; L.rotation_euler = (0, -a, yaw); kneeE[i, s].rotation_euler = (0, a - b, 0)

keys = C.Keys(); keys.add(body, head, abd, *tail, *mands.values(), sac, drool, goo_root, *legE.values(), *kneeE.values())

def walk_pose(t, crouch=False):
    feet = {}
    for (i, s), ph in TRIPOD.items():
        if crouch and i == 0: continue
        fx, fy = FEET[i]
        if crouch: fy += 0.06; fx += (-0.03 if i == 2 else 0.05)
        stride = STRIDE * (0.65 if crouch else 1.0)
        ph2 = ph if not crouch else (0 if (i, s) in ((1, 1), (2, -1)) else 0.5)
        dx, dz = step(t + ph2, stride, 0.09 if not crouch else 0.07)
        feet[i, s] = (fx + dx, fy, dz)
    p = 2 * math.pi * t
    P = dict(feet=feet, bz=0.012 * abs(math.cos(2 * p)), roll=0.035 * math.sin(p), swish=0.25 * math.sin(p), wiggle=0.06 * math.sin(p),
             head_yaw=-0.05 * math.sin(p), mand=0.08 + 0.06 * math.sin(4 * p))
    if crouch:
        P.update(bz=-0.07 + 0.008 * abs(math.cos(2 * p)), rear=0.2, abd_down=-0.2, curl=0.7, head_up=0.1, mand=0.25 + 0.08 * math.sin(4 * p),
                 roll=0.025 * math.sin(p))
        for s in (-1, 1):                       # raised front legs, claws up, swaying like a mantis
            q = p + (0 if s > 0 else math.pi)
            feet[0, s] = (0.46 + 0.03 * math.sin(q), 0.3 + 0.02 * math.cos(q), 0.36 + 0.03 * math.cos(q))
    return P

def spit_pose(k, fired=False):
    feet = {0: (0.48, 0.4, 0.0), 1: (0.06, 0.56, 0.0), 2: (-0.42, 0.46, 0.0)}
    if fired:
        return dict(feet=feet, bx=0.04, bz=-0.03, rear=0.05, head_x=0.05, head_up=-0.12, sac=0.35, drool=1.0, mand=0.6, abd_down=-0.1, curl=0.6)
    return dict(feet=feet, bx=-0.06 * k, bz=-0.03 + 0.02 * k, rear=0.08 + 0.18 * k, head_x=-0.05 * k, head_up=0.25 * k, sac=k * 1.25,
                mand=0.12 + 0.45 * k, abd_down=-0.1 - 0.1 * k, curl=0.5 + 0.3 * k)

def coil_pose(side):
    feet = {0: (0.3, 0.3, 0.0), 1: (0.02, 0.38, 0.0), 2: (-0.26, 0.32, 0.0)}
    return dict(feet=feet, bz=-0.12, rear=-0.06, head_x=-0.04, abd_x=0.05, wiggle=0.28 * side, swish=0.6 * side, curl=0.5,
                mand=0.35, head_up=0.05)

def leap_pose():
    feet = {0: (0.66, 0.30, 0.16), 1: (-0.05, 0.56, 0.12), 2: (-0.62, 0.34, 0.06)}
    return dict(feet=feet, bz=0.06, rear=0.08, head_x=0.03, abd_x=-0.02, abd_down=0.12, curl=-0.15, mand=0.6, head_up=0.05)

def sprawl_pose():
    feet = {0: (0.5, 0.52, 0.0), 1: (0.04, 0.66, 0.0), 2: (-0.46, 0.56, 0.0)}
    return dict(feet=feet, bz=-0.15, rear=-0.08, roll=0.1, head_up=-0.25, head_yaw=0.2, abd_down=0.05, curl=0.05, swish=0.4, mand=0.3)

def stunned_pose(side):
    feet = {(0, 1): (0.42, 0.5, 0.0), (0, -1): (0.3, 0.3, 0.16 if side > 0 else 0.0), (1, 1): (0.04, 0.4, 0.14 if side < 0 else 0.0),
            (1, -1): (0.04, 0.64, 0.0), (2, 1): (-0.44, 0.52, 0.0), (2, -1): (-0.3, 0.36, 0.1 if side > 0 else 0.0)}
    return dict(feet=feet, bz=-0.14, roll=-0.12 + 0.05 * side, rear=-0.1, head_up=-0.3, head_yaw=-0.25 * side, curl=0.0, swish=-0.3 * side, mand=0.4)

def sabotage_pose(k):
    q = 2 * math.pi * k / 4
    up = (0.36, 0.18, 0.44); down = (0.5, 0.1, 0.06)
    a = 0.5 + 0.5 * math.cos(q)                     # 1: left claw raised, right striking; then swapped
    lerp = lambda u, v, w: tuple(x + (y - x) * w for x, y in zip(u, v))
    feet = {(0, 1): lerp(down, up, a), (0, -1): lerp(down, up, 1 - a), 1: (0.07, 0.55, 0.0), 2: (-0.42, 0.45, 0.0)}
    return dict(feet=feet, bx=0.03, bz=-0.02, rear=0.22, head_up=-0.25, head_x=0.02, mand=0.15 + 0.4 * abs(math.sin(q)),
                abd_down=-0.12, curl=0.6, swish=0.25 * math.sin(q), roll=0.03 * math.cos(q))

def dormant_pose():
    feet = {0: (0.24, 0.22, 0.0), 1: (0.02, 0.28, 0.0), 2: (-0.2, 0.26, 0.0)}
    return dict(feet=feet, bz=-0.17, rear=-0.08, head_up=-0.3, head_x=-0.03, abd_down=0.06, curl=-0.3, swish=1.1, wiggle=0.15, mand=0.0)

def dead_pose():
    # collapsed on its belly, tipped onto one side, legs curled in like a dead spider's, head down in the goo
    feet = {(0, 1): (0.26, 0.2, 0.12), (0, -1): (0.36, 0.44, 0.0), (1, 1): (0.04, 0.24, 0.16), (1, -1): (0.0, 0.62, 0.0),
            (2, 1): (-0.2, 0.22, 0.12), (2, -1): (-0.4, 0.5, 0.0)}
    return dict(feet=feet, bz=-0.16, roll=-0.3, rear=-0.12, head_up=-0.35, head_yaw=0.35, abd_down=0.1, curl=-0.35, swish=0.8, wiggle=-0.2,
                mand=0.55, goo=1.0)

F = {}
F['idle'] = [keys.key(pose, dict(mand=0.08))]
F['walk'] = keys.seq(pose, [(walk_pose(i / 8),) for i in range(8)])
F['ready'] = keys.seq(pose, [(walk_pose(i / 8, crouch=True),) for i in range(8)])
F['spit'] = keys.seq(pose, [(spit_pose(k),) for k in (0.0, 0.33, 0.67, 1.0)] + [(spit_pose(1, True),)])
F['coil'] = keys.seq(pose, [(coil_pose(1),), (coil_pose(-1),)])
F['leap'] = [keys.key(pose, leap_pose())]
F['sprawl'] = [keys.key(pose, sprawl_pose())]
F['stunned'] = keys.seq(pose, [(stunned_pose(1),), (stunned_pose(-1),)])
F['sabotage'] = keys.seq(pose, [(sabotage_pose(k),) for k in range(4)])
F['dormant'] = [keys.key(pose, dormant_pose())]
F['dead'] = [keys.key(pose, dead_pose())]
C.linear_keys()

proxy = mn.cyl('canvasProxy', 0.92, 0.62, verts=32, bevel=0); proxy.hide_render = True
frame_objs = parts + [proxy]

passes = ('beauty', 'mask') if PREVIEW else ('beauty', 'normal', 'height', 'mask')
times = {}
for name, frames in F.items():
    if ONLY and name not in ONLY: continue
    t0 = time.time()
    dirs = 8 if PREVIEW != '1dir' else 1
    mn.render('chars/alien/' + name, objs=frame_objs, root=root, dirs=dirs, frames=frames, passes=passes)
    times[name] = round(time.time() - t0, 1)
print('[alien] render times (s):', times, 'walk cycle =', WALK_DIST, 'units')
