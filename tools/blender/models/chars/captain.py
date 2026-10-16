"""Captain Red Comet, the pirate base's boss (no game code yet: sizes per the approved concept).

A Red Comet pirate (chars/pirate.py's suit language: battered red-brown pressure suit, gunmetal open-face
helmet, skulls, duct tape) but a boss: built on a broader version of the crew skeleton and scaled 1.35x.
Long red coat with gold trim (phase 1), a gold-trimmed tricorne WELDED onto his helmet, a red beard, a cyber
eye, a jolly-roger shoulder plate, a big hazard-striped cybernetic right arm holding a blunderbuss plasma
cannon (flared brass bell), and on his back the glowing-blue SHIELD GENERATOR (core, cage, emitter fins,
antennae): the only weak spot, made to read from behind and from both sides. Phase 2 ("comet mode"): the coat
is off, the generator is cracked and leaking blue, one antenna is bent, rocket nozzles sit under it (lit in
the dash).

Sprites (build/renders/chars/captain/), 8 directions each (dir i faces game angle i*45deg, like the pirate),
every animation on its own canvas with the ground origin (the captain's (x, y)) between his feet:
  phase 1 (coat)                         phase 2 (comet mode, coat off)
  p1_idle            4 f loop            p2_idle            4 f loop (breathing, the leak drips)
  p1_walk            8 f loop            p2_walk            8 f loop
  p1_aim_buckshot    1 f                 p2_aim_buckshot    1 f
  p1_fire_buckshot   3 f once (kick, recoil, recover -> aim)            p2_fire_buckshot 3 f
  p1_spin            2 f (the game steps the dir every tick: d, d+1, ... and alternates f0/f1)  p2_spin 2 f
  p1_catch_breath    4 f loop (leaning on the cannon, panting)          p2_catch_breath  4 f
  p1_whistle         4 f once (fingers to his mouth: *WHEEEET*)
  p1_coat_off        6 f once (the 50 % transition: grabs the lapels, flings the coat back, the generator
                     cracks with a blue flash; f4/f5 are already phase 2; drop coat_floor where the coat lands)
                                         p2_dash            2 f loop (leaning in, jets lit, alternate)
                                         p2_dazed           4 f loop (wobbling, stars circle the hat)
                                         p2_defeated_stagger 6 f loop (generator bursting, staggering)
  coat_floor         1 dir, 1 f: the thrown coat lying on the floor (a prop the game drops at coat_off f3)

    blender -b --factory-startup --python tools/blender/models/chars/captain.py
    CAP_PREVIEW=<dirs> CAP_ONLY=p1_idle,p2_dash ...   16 samples, beauty only, into the scratchpad / CAP_OUT
"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
import mn
import charlib as C

PREVIEW = os.environ.get('CAP_PREVIEW')
ONLY = os.environ.get('CAP_ONLY', '').split(',') if os.environ.get('CAP_ONLY') else None
if PREVIEW:
    mn.OUT_DIR = os.environ.get('CAP_OUT', '/tmp/captain_preview'); mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json')
    mn.SAMPLES = int(os.environ.get('CAP_SAMPLES', '16'))
else:
    mn.SAMPLES = int(os.environ.get('CAP_SAMPLES', '48'))
mn.reset()
bpy.context.scene.cycles.device = 'CPU'; bpy.context.scene.render.threads_mode = 'FIXED'
bpy.context.scene.render.threads = int(os.environ.get('CAP_THREADS', '6'))

SCALE = 1.35          # the boss is the crew skeleton (broadened) at 1.35x
OUTLINE = 0.0105      # x SCALE = ~0.014 on screen (props' outline)

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
def stripes(name, a='#e8c34f', b='#1e2026', k=14.0):
    """Hazard stripes (diagonal bands in object space), lightly grimed."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    bs = N['Principled BSDF']; bs.inputs['Roughness'].default_value = 0.55
    tc = N.new('ShaderNodeTexCoord'); w = N.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = 'DIAGONAL'
    w.inputs['Scale'].default_value = k; w.inputs['Distortion'].default_value = 0.0
    Lk(tc.outputs['Object'], w.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[0].color = (*C.lift(b), 1); r.color_ramp.elements[1].position = 0.5; r.color_ramp.elements[1].color = (*C.lift(a), 1)
    Lk(w.outputs['Fac'], r.inputs[0])
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.05
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 0.35
    Lk(r.outputs[0], mx.inputs[6]); Lk(ao.outputs['Color'], mx.inputs[7]); Lk(mx.outputs[2], bs.inputs['Base Color'])
    return m

SUIT = C.worn('suit', '#b05040', 0.72, 0.0, grime=1.4, scratches=0.6, scale=2)
SUIT_DK = C.worn('suitDark', '#74362c', 0.75, 0.0, grime=1.4, scratches=0.4, scale=2)
PATCH = C.worn('patch', '#8e8a7c', 0.8, 0.0, grime=1.2, scratches=0.2, scale=3)
PATCH2 = C.worn('patch2', '#6e7a4e', 0.8, 0.0, grime=1.2, scratches=0.2, scale=3)
COAT = C.worn('coat', '#c8342a', 0.68, 0.0, grime=1.0, scratches=0.25, scale=2)
COAT_IN = C.worn('coatLining', '#4a1a1c', 0.8, 0.0, grime=0.6, scratches=0.0, scale=2)
GOLD = C.worn('gold', '#e8b034', 0.32, 0.75, grime=0.8, scratches=0.4, scale=3)
HAT = C.worn('hat', '#34303e', 0.6, 0.0, grime=0.8, scratches=0.5, scale=3)
LEATHER = C.worn('leather', '#6a4630', 0.6, 0.0, grime=1.0, scratches=0.8, scale=3)
WOOD = C.worn('wood', '#8a5a34', 0.6, 0.0, grime=1.2, scratches=0.6, scale=3)
ARMOR = C.worn('armor', '#8c929e', 0.42, 0.15, grime=1.2, scratches=1.0, scale=2)
ARMOR_DK = C.worn('armorDark', '#565c68', 0.45, 0.15, grime=1.0, scratches=1.0, scale=2)
CYBER = C.worn('cyber', '#6c7280', 0.38, 0.45, grime=1.0, scratches=1.0, scale=2)
BONE = C.worn('skullPaint', '#ece4d0', 0.55, 0.0, grime=1.3, scratches=0.8, scale=3)
BEARD = C.worn('beard', '#c4402a', 0.85, 0.0, grime=0.6, scratches=0.0, scale=5)
BRASS = C.worn('brass', '#c8963a', 0.3, 0.85, grime=0.8, scratches=0.5, scale=3)
HAZ = stripes('hazard')
DARK = mn.mat('dark', '#16181d', 0.6)
RUBBER = mn.mat('rubber', 'rubber', 0.8)
TAPE = mn.mat('tape', '#a8adb2', 0.85)
STICKER = mn.mat('sticker', '#f2d860', 0.6)
INK = mn.mat('ink', '#141210', 0.7)
SKIN = mn.mat('skin', '#e0ad86', 0.6, emit='#e0ad86', emit_strength=0.35)
SKIN_DK = mn.mat('skinShade', '#c08a64', 0.6, emit='#c08a64', emit_strength=0.2)
MOUTH = mn.mat('mouth', '#4a1c18', 0.5)
GLINT = mn.mat('glint', '#ffffff', 0.2, emit='#ffffff', emit_strength=2.5)
EYE1 = C.glow('cyEye1', '#ff3a22', 1.6, base='#a01a10')
EYE2 = C.glow('cyEye2', '#ff5a2a', 3.2, base='#ff3a1a')
L_RED = C.glow('ledR', '#ff4a3a', 2.5)
CORE = C.glow('core', '#38b4ff', 1.3, base='#1a6ab0')
CORE_HOT = C.glow('coreHot', '#5ac8ff', 1.5, base='#3a9ad8')
LEAK = C.glow('leak', '#62d4ff', 1.4, base='#2a8ac8')
BLUE_LED = C.glow('ledB', '#5ac8ff', 2.0)
MUZZLE = C.glow('muzzle', '#ff6a1a', 1.1, base='#8a2a08')
MUZZLE_HOT = C.glow('muzzleHot', '#ffb050', 2.2, base='#ffd080')
FLASH = C.glow('flash', '#ffd27a', 2.0, base='#ffffff')
JET = C.glow('jet', '#1a8cff', 1.0, base='#1a5ad0')
JET_CORE = C.glow('jetCoreM', '#bfeaff', 2.2, base='#e0f6ff')
FLAME = C.glow('flame', '#ff6a12', 1.4, base='#e04a08')
WELD = C.glow('weld', '#ffa04a', 0.9, base='#8a5a3a')
STAR = C.glow('star', '#ffe27a', 1.4, base='#ffd23a')
SMOKE = C.worn('smoke', '#3a3c42', 0.95, 0.0, grime=0.5, scratches=0.0, scale=4)

parts = []
def keep(*objs):
    parts.extend(objs); return objs[0]
def add(o, parent):
    return keep(C.attach(o, parent))

def skull(name, loc, normal, size, m=BONE, eyes=DARK, up=(0, 0, 1)):
    """A flat painted skull + crossbones decal facing `normal` (pirate.py's)."""
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

def ring(name, pts, r, m):
    """Closed round tube through world points (trim, weld beads)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1); sp.use_cyclic_u = True
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    o = mn.link(bpy.data.objects.new(name, cu)); mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return mn.smooth(o)

def circle_pts(c, r, n=32, axis='z'):
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n; u, v = r * math.cos(a), r * math.sin(a)
        out.append(Vector(c) + (Vector((u, v, 0)) if axis == 'z' else Vector((0, u, v)) if axis == 'x' else Vector((u, 0, v))))
    return out

def label(name, body, size, loc, normal, m=INK, up=(0, 0, 1)):
    """Text mesh lying on a surface with outward `normal`, reading left->right for someone facing it."""
    o = C.text_mesh(name, body, size, m, (0, 0, 0), extrude=0.002)
    n = Vector(normal).normalized(); u = Vector(up); u = (u - n * u.dot(n)).normalized(); r = u.cross(n)
    M = Matrix((r, u, n)).transposed().to_4x4(); M.translation = Vector(loc); o.matrix_world = M
    return o

def star_mesh(name, r, m):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); ring_ = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5; rr = r if k % 2 == 0 else r * 0.45
        ring_.append(bm.verts.new((rr * math.cos(a), 0, rr * math.sin(a))))
    f = bm.faces.new(ring_); ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[g for g in ex['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0.03, 0))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, -0.015, 0)); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return o

# ---------------------------------------------------------------------------
# Rig: the crew skeleton, broadened (model faces +X; +Y is his left; -Y his right, the cyber arm)
# ---------------------------------------------------------------------------
HIP_Z = 0.40
HEAD = Vector((0.03, 0, 1.03))
SH_Y = 0.30

class Rig:
    def __init__(self):
        e = C.empty
        self.root = e('captain', (0, 0, 0))
        self.lie = e('lie', (0, 0, 0), self.root)
        self.hips = e('hips', (0, 0, HIP_Z), self.lie)
        self.torso = e('torso', (0, 0, HIP_Z), self.hips)
        self.head = e('head', HEAD, self.torso)
        self.arms, self.elbows, self.hands, self.legs, self.knees = {}, {}, {}, {}, {}
        for s in (-1, 1):
            y = s * SH_Y
            self.arms[s] = e(f'shoulder{s}', (0.0, y, 0.77), self.torso)
            self.elbows[s] = e(f'elbow{s}', (0.0, y + s * 0.012, 0.60), self.arms[s])
            self.hands[s] = e(f'hand{s}', (0.01, y + s * 0.015, 0.43), self.elbows[s])
            self.legs[s] = e(f'hip{s}', (0.0, s * 0.115, HIP_Z - 0.04), self.hips)
            self.knees[s] = e(f'knee{s}', (0.0, s * 0.115, 0.21), self.legs[s])
        self.gen = e('gen', (-0.32, 0, 0.66), self.torso)             # the generator (recoil, shudder)
        self.gun = e('gun', (0.01, -SH_Y - 0.03, 0.44), self.hands[-1])
        self.skirt = e('skirt', (0, 0, HIP_Z + 0.02), self.hips)       # coat skirt (flares in the spin)
        self.fly = e('flyCoat', (0, 0, 0), self.root)                   # the thrown coat (coat_off)
        self.stars = e('stars', (0.12, 0, 1.5), self.lie)
        self.movers = [self.lie, self.hips, self.torso, self.head, *self.arms.values(), *self.elbows.values(),
                       *self.hands.values(), *self.legs.values(), *self.knees.values(), self.gen, self.gun, self.skirt,
                       self.fly, self.stars]
        self.toggles = {}
    def tog(self, name, parent, loc):
        """A switchable group: its parts hang under an empty that the pose scales to 1 (on) or ~0 (off)."""
        t = C.empty(f'tog_{name}_{len(self.toggles.get(name, []))}', loc, parent)
        self.toggles.setdefault(name, []).append(t); self.movers.append(t); t['base'] = 1.0
        return t

R = Rig()
T, Hp = R.torso, R.hips
TG = {}
def tg(name, parent, loc=None):
    key = (name, parent.name)
    if key not in TG:
        TG[key] = R.tog(name, parent, loc if loc is not None else parent.matrix_world.translation.copy())
    return TG[key]
bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# Body (rest pose, world space)
# ---------------------------------------------------------------------------
add(mn.box('body', (0.36, 0.50, 0.44), loc=(0.0, 0, 0.38), m=SUIT, bevel=0.13), T)
add(mn.sphere('belly', 0.2, loc=(0.1, 0, 0.55), m=SUIT, scale=(0.8, 1.15, 0.85)), T)
add(mn.box('pelvis', (0.32, 0.38, 0.15), loc=(0.0, 0, 0.31), m=SUIT_DK, bevel=0.06), Hp)
add(mn.box('codPlate', (0.05, 0.16, 0.1), loc=(0.16, 0, 0.29), m=ARMOR_DK, bevel=0.02), Hp)
# under the coat (shows in phase 2): chest plate with a skull, patches, duct tape, a rip, a bandolier of cells
add(mn.box('chestPlate', (0.07, 0.34, 0.2), loc=(0.17, 0, 0.6), m=ARMOR, bevel=0.035), T)
for o in skull('chestSkull', (0.212, 0, 0.71), (1, 0, 0.3), 0.15): add(o, T)
add(mn.box('patchA', (0.02, 0.12, 0.11), loc=(0.17, 0.17, 0.47), m=PATCH, bevel=0.01, rot=(0.15, 0, 0)), T)
add(mn.box('patchB', (0.13, 0.02, 0.12), loc=(-0.05, -0.255, 0.55), m=PATCH2, bevel=0.01, rot=(0, -0.2, 0)), T)
for k, (y, z, r) in enumerate(((-0.12, 0.49, 0.6), (-0.1, 0.5, -0.6), (0.18, 0.66, 0.3))):
    add(mn.box(f'suitTape{k}', (0.015, 0.16, 0.045), loc=(0.215, y, z), m=TAPE, bevel=0.004, rot=(r, 0, 0)), T)
for s in (-1, 1):
    add(mn.box(f'sideTape{s}', (0.15, 0.015, 0.045), loc=(-0.02, s * 0.255, 0.68), m=TAPE, bevel=0.004, rot=(0, s * 0.4, 0)), T)
add(mn.box('belt', (0.40, 0.54, 0.07), loc=(0.0, 0, 0.42), m=LEATHER, bevel=0.03), T)
add(mn.box('buckle', (0.04, 0.16, 0.1), loc=(0.2, 0, 0.405), m=GOLD, bevel=0.015), T)
add(label('buckleT', 'RC', 0.06, (0.222, 0, 0.455), (1, 0, 0), m=INK), T)
for i, y in enumerate((-0.19, 0.17)):
    add(mn.box(f'pouch{i}', (0.1, 0.08, 0.09), loc=(0.15, y, 0.38), m=LEATHER, bevel=0.02), T)
# collar ring + generator harness straps over the shoulders
add(mn.cyl('collar', 0.17, 0.07, loc=(0.0, 0, 0.8), m=DARK, bevel=0.025), T)
add(mn.cyl('collarRing', 0.19, 0.035, loc=(0.0, 0, 0.81), m=ARMOR, bevel=0.012), T)
for s in (-1, 1):
    st = C.tube(f'strap{s}', [(-0.22, s * 0.15, 0.62), (-0.12, s * 0.17, 0.83), (0.08, s * 0.16, 0.84), (0.205, s * 0.14, 0.66)], 0.022, LEATHER)
    st.scale = (1, 1.6, 1); C.apply_tf(st); add(st, T)
    add(mn.box(f'strapBuckle{s}', (0.03, 0.06, 0.05), loc=(0.215, s * 0.14, 0.66), m=BRASS, bevel=0.008), T)

# ---------------------------------------------------------------------------
# The shield generator (his back, -X): the only weak spot
# ---------------------------------------------------------------------------
G = R.gen; GX = -0.37
add(mn.box('genMount', (0.07, 0.40, 0.52), loc=(-0.205, 0, 0.42), m=ARMOR_DK, bevel=0.025), G)
add(mn.cyl('genBase', 0.19, 0.1, loc=(GX, 0, 0.4), m=CYBER, bevel=0.03, verts=32), G)
add(mn.cyl('genBaseHz', 0.195, 0.045, loc=(GX, 0, 0.43), m=HAZ, bevel=0.01, verts=32), G)
add(mn.cyl('genCore', 0.125, 0.36, loc=(GX, 0, 0.5), m=CORE, bevel=0.02, verts=32), G)
for k in range(8):                                   # the cage bars
    a = 2 * math.pi * (k + 0.5) / 8
    add(mn.cyl(f'cage{k}', 0.016, 0.36, loc=(GX + 0.152 * math.cos(a), 0.152 * math.sin(a), 0.5), m=ARMOR, bevel=0.0, verts=8), G)
add(ring('cageRing', circle_pts((GX, 0, 0.68), 0.155), 0.014, ARMOR), G)
add(mn.cyl('genTop', 0.19, 0.08, loc=(GX, 0, 0.86), m=CYBER, bevel=0.03, verts=32), G)
add(mn.cyl('genTopRim', 0.15, 0.04, loc=(GX, 0, 0.935), m=ARMOR_DK, bevel=0.012, verts=32), G)
add(mn.sphere('emitter', 0.11, loc=(GX, 0, 0.96), m=CORE, scale=(1, 1, 0.8), segs=24), G)
for k in range(4):                                   # emitter fins around the dome
    a = math.radians(45 + 90 * k)
    f = mn.box(f'fin{k}', (0.18, 0.025, 0.16), loc=(0, 0, 0), m=CYBER, bevel=0.008)
    f.matrix_world = Matrix.Translation((GX + 0.13 * math.cos(a), 0.13 * math.sin(a), 0.9)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.25, 4, 'Y')
    add(f, G)
    e_ = mn.box(f'finEdge{k}', (0.02, 0.03, 0.12), loc=(0, 0, 0), m=BLUE_LED, bevel=0.0)
    e_.matrix_world = Matrix.Translation((GX + 0.215 * math.cos(a), 0.215 * math.sin(a), 0.93)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.25, 4, 'Y')
    add(e_, G)
for s in (-1, 1):                                    # side radiators: glowing slots, read from the side
    for k in range(3):
        add(mn.box(f'rad{s}{k}', (0.16, 0.05, 0.03), loc=(GX + 0.02, s * 0.2, 0.55 + k * 0.08), m=CYBER, bevel=0.01), G)
        add(mn.box(f'radGlow{s}{k}', (0.12, 0.052, 0.012), loc=(GX + 0.02, s * 0.2, 0.585 + k * 0.08), m=BLUE_LED, bevel=0.0), G)
# antennae (the left one straight; the right one straight in phase 1, bent in phase 2)
def antenna(name, s, parent, bend=0.0):
    base = Vector((GX - 0.02, s * 0.11, 0.94))
    pts = [base, base + Vector((0, s * 0.03, 0.2)), base + Vector((-0.02 - bend * 0.5, s * (0.05 + bend), 0.4 - bend * 0.6))]
    o = add(C.tube(name, pts, 0.014, ARMOR, res=2), parent)
    add(mn.cyl(name + 'Disc', 0.04, 0.015, loc=base + Vector((0, s * 0.03, 0.2)), m=ARMOR_DK, bevel=0.005, verts=16), parent)
    add(mn.sphere(name + 'Tip', 0.032, loc=pts[-1], m=BLUE_LED, segs=12), parent)
    return o
antenna('antL', 1, G)
antenna('antR', -1, tg('p1', G))
antenna('antRBent', -1, tg('p2', G), bend=0.14)
# stickers and duct tape (the joke: the sign on the weak spot)
add(mn.box('signPlate', (0.014, 0.26, 0.12), loc=(GX - 0.195, 0, 0.385), m=STICKER, bevel=0.005), G)
add(label('signT', 'DO NOT\nSHOOT', 0.052, (GX - 0.204, 0, 0.445), (-1, 0, 0)), G)
add(label('genStencil', 'R.C. MK II', 0.032, (GX - 0.04, -0.192, 0.89), (0, -1, 0.25), m=STICKER), G)
add(mn.box('genTape1', (0.02, 0.2, 0.05), loc=(GX - 0.15, 0.03, 0.62), m=TAPE, bevel=0.004, rot=(0.7, 0, 0)), G)
add(mn.box('genTape2', (0.02, 0.18, 0.05), loc=(GX - 0.15, -0.02, 0.6), m=TAPE, bevel=0.004, rot=(-0.6, 0, 0)), G)
add(mn.box('genCable', (0.04, 0.04, 0.2), loc=(GX + 0.1, 0.17, 0.5), m=RUBBER, bevel=0.015, rot=(0.4, 0, 0)), G)
# phase 2: cracks, leaking plasma, scorch, the rocket nozzles
P2 = tg('p2', G)
for k, (a, z, r, l) in enumerate(((math.radians(180), 0.7, 0.9, 0.2), (math.radians(160), 0.6, -0.5, 0.17), (math.radians(215), 0.77, 0.3, 0.14),
                                  (math.radians(110), 0.66, -1.0, 0.15), (math.radians(250), 0.58, 0.8, 0.13))):
    ck = mn.box(f'crack{k}', (0.03, l, 0.03), loc=(0, 0, 0), m=DARK, bevel=0.0)
    ck.matrix_world = Matrix.Translation((GX + 0.122 * math.cos(a), 0.122 * math.sin(a), z)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(r, 4, 'X')
    add(ck, P2)
for k, (a, z, sz) in enumerate(((math.radians(180), 0.47, 1.0), (math.radians(165), 0.36, 0.8), (math.radians(200), 0.3, 0.7),
                                (math.radians(120), 0.42, 0.7), (math.radians(240), 0.4, 0.75))):
    add(mn.sphere(f'drip{k}', 0.03 * sz, loc=(GX + 0.2 * math.cos(a), 0.2 * math.sin(a), z), m=LEAK, scale=(1, 1, 1.9), segs=10), P2)
add(C.tube('leakRun', [(GX - 0.127, 0.0, 0.6), (GX - 0.19, 0.01, 0.48), (GX - 0.2, 0.0, 0.42)], 0.018, LEAK), P2)
add(mn.cyl('genCoreHot', 0.128, 0.34, loc=(GX, 0, 0.51), m=CORE_HOT, bevel=0.02, verts=32), P2)
add(mn.sphere('leakPool', 0.05, loc=(GX - 0.17, 0.05, 0.86), m=LEAK, scale=(1.2, 1.2, 0.4), segs=12), P2)
for s in (-1, 1):
    n = C.cone_x(f'nozzle{s}', 0.05, 0.075, 0.13, CYBER, verts=20, x0=0.0)
    n.matrix_world = Matrix.Translation((GX - 0.03, s * 0.1, 0.4)) @ Matrix.Rotation(math.radians(115), 4, 'Y'); add(n, P2)
    n2 = C.cone_x(f'nozzleIn{s}', 0.055, 0.055, 0.005, DARK, verts=20, x0=0.126)
    n2.matrix_world = n.matrix_world.copy(); add(n2, P2)
    add(mn.box(f'nozzleBand{s}', (0.06, 0.04, 0.03), loc=(GX - 0.03, s * 0.1, 0.38), m=HAZ, bevel=0.008), P2)
# jets (dash): a hot blue core in an orange sheath, two lengths for the flicker
for j, L in ((0, 1.0), (1, 0.8)):
    J = tg(f'jet{j}', G, (GX - 0.03, 0, 0.4))
    for s in (-1, 1):
        M_ = Matrix.Translation((GX - 0.03, s * 0.1, 0.4)) @ Matrix.Rotation(math.radians(115), 4, 'Y')
        a_ = C.cone_x(f'jetCore{j}{s}', 0.085, 0.025, 0.5 * L, JET, verts=20, x0=0.12); a_.matrix_world = M_; add(a_, J)
        b_ = C.cone_x(f'jetFlame{j}{s}', 0.045, 0.0, 0.4 * L, FLAME, verts=16, x0=0.12 + 0.42 * L); b_.matrix_world = M_; add(b_, J)
        d_ = C.cone_x(f'jetInner{j}{s}', 0.05, 0.03, 0.18 * L, JET_CORE, verts=16, x0=0.1); d_.matrix_world = M_; add(d_, J)
        c_ = mn.sphere(f'jetHot{j}{s}', 0.07, m=JET_CORE, scale=(1.4, 1, 1), segs=14); c_.matrix_world = M_ @ Matrix.Translation((0.16, 0, 0)); add(c_, J)
# burst (defeated): blue sparks out of the generator, smoke; two sets that alternate
import random
rnd = random.Random(7)
for j in range(2):
    B = tg(f'burst{j}', G, (GX, 0, 0.7))
    for k in range(9):
        d = Vector((rnd.uniform(-1, 0.2), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized()
        p = Vector((GX, 0, 0.7)) + d * rnd.uniform(0.2, 0.34)
        sp = mn.sphere(f'spark{j}{k}', 0.018, loc=p, m=JET if k % 3 else FLASH, scale=(1, 1, 3.5), segs=8)
        sp.rotation_mode = 'QUATERNION'; sp.rotation_quaternion = d.to_track_quat('Z', 'Y'); add(sp, B)
    for k in range(0):
        add(mn.sphere(f'smoke{j}{k}', 0.07 + 0.025 * k, loc=(GX - 0.05 - 0.05 * k, (0.06 if j else -0.06) * (k - 1), 1.0 + 0.11 * k + 0.05 * j),
                      m=SMOKE, segs=14), B)
    add(mn.sphere(f'burstGlow{j}', 0.15, loc=(GX - 0.06, 0.02 * j, 0.68), m=CORE_HOT, scale=(1.1, 1.3, 1.3) if j else (1.3, 1.1, 1.1), segs=16), B)

# ---------------------------------------------------------------------------
# Head: helmet with the hat welded on, beard, cyber eye, eye patch
# ---------------------------------------------------------------------------
HR = 0.235
helmet = mn.sphere('helmet', HR, loc=HEAD, m=ARMOR_DK, segs=96)
C.window(helmet, 0.215, 0.19, 0.0, False)
sol = helmet.modifiers.new('shell', 'SOLIDIFY'); sol.thickness = 0.025; sol.offset = -1
helmet.data.materials.append(DARK); sol.material_offset_rim = 1; sol.material_offset = 1
add(helmet, R.head)
for s in (-1, 1):
    add(mn.box(f'earPlate{s}', (0.12, 0.035, 0.13), loc=HEAD + Vector((-0.015, s * (HR + 0.005), -0.08)), m=ARMOR, bevel=0.014), R.head)
    add(mn.sphere(f'earBolt{s}', 0.02, loc=HEAD + Vector((-0.015, s * (HR + 0.028), -0.02)), m=BRASS, segs=10), R.head)
# the tricorne: three upturned walls (a flat side to the front), gold trim, a crown, a skull; welded on
HB = HEAD + Vector((-0.08, 0, 0.175))
HAT_TILT = Matrix.Translation(HB) @ Matrix.Rotation(-0.36, 4, 'Y') @ Matrix.Translation(-HB)     # tipped back: the face shows
hatp = []
me = bpy.data.meshes.new('hat'); bm = bmesh.new()
angs = [math.radians(a) for a in (180, 60, -60)]
def tri(r, z): return [bm.verts.new((HB.x + r * math.cos(a), HB.y + r * math.sin(a) * 1.1, HB.z + z)) for a in angs]
lo, hi = tri(0.26, 0.0), tri(0.34, 0.12)
bm.faces.new(lo[::-1])
for i in range(3): bm.faces.new([lo[i], lo[(i + 1) % 3], hi[(i + 1) % 3], hi[i]])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
hat = mn.link(bpy.data.objects.new('hat', me)); mn.assign(hat, HAT)
hs = hat.modifiers.new('wall', 'SOLIDIFY'); hs.thickness = 0.03; hs.offset = 0
mn.bev(hat, 0.025); mn.smooth(hat); hatp.append(hat)
hatp.append(ring('hatTrim', [HB + Vector((0.34 * math.cos(a), 0.34 * math.sin(a) * 1.1, 0.125)) for a in angs], 0.018, GOLD))
hatp.append(mn.sphere('crown', 0.19, loc=HB + Vector((0, 0, 0.05)), m=HAT, scale=(1.0, 1.05, 0.78), segs=32))
hatp.append(ring('crownBand', circle_pts(HB + Vector((0, 0, 0.06)), 0.18), 0.015, GOLD))
fy = 0.34 * math.cos(math.radians(60)) - 0.03     # the front wall: skull on it
hatp += skull('hatSkull', HB + Vector((fy + 0.045, 0, 0.075)), (1, 0, 0.45), 0.11)
fe = mn.sphere('feather', 1, loc=HB + Vector((-0.08, 0.17, 0.2)), m=COAT, scale=(0.18, 0.04, 0.05), segs=16); fe.rotation_euler = (0.3, 0.5, 0.6)
hatp.append(fe)
bpy.context.view_layer.update()
for o in hatp:
    o.matrix_world = HAT_TILT @ o.matrix_world; add(o, R.head)
# the weld: a glowing bead where hat meets helmet, plus spatter
add(ring('weld', circle_pts(HEAD + Vector((-0.01, 0, 0.15)), 0.18, 40), 0.016, WELD), R.head)
for k in range(6):
    a = math.radians(-50 + k * 21)
    add(mn.sphere(f'weldBlob{k}', 0.018, loc=HEAD + Vector((0.185 * math.cos(a), 0.185 * math.sin(a), 0.13)), m=WELD, segs=8), R.head)
add(mn.box('helmTape', (0.11, 0.045, 0.012), loc=HEAD + Vector((-0.1, -0.15, 0.06)), m=TAPE, bevel=0.004, rot=(-0.7, -0.2, 0.3)), R.head)

face = C.Face(R, keep, HEAD + Vector((0.05, 0, -0.01)), 0.17, tilt=26)
face.add(mn.sphere('face', 0.17, loc=face.c, m=SKIN))
face.blob('nose', SKIN_DK, (0.035, 0.032, 0.034), 0, -4, out=-0.008)
for s in (-1, 1):   # heavy brows
    face.blob(f'brow{s}', BEARD, (0.014, 0.045, 0.016), s * 24, 20, out=0.0, roll=s * math.radians(20))
# his left (+Y): the red cyber eye with a brass socket; his right: an eye patch
face.blob('eyeSocket', BRASS, (0.016, 0.036, 0.036), 24, 7, out=-0.006)
E1 = tg('eye1', R.head); E2 = tg('eye2', R.head)
p_, d_ = face.at(24, 7, 0.006); o = mn.sphere('cyEye1', 1, loc=p_, m=EYE1, scale=(0.012, 0.022, 0.022), segs=14); o.rotation_mode = 'QUATERNION'
o.rotation_quaternion = d_.to_track_quat('X', 'Z'); add(o, E1)
o = mn.sphere('cyEye2', 1, loc=p_, m=EYE2, scale=(0.014, 0.025, 0.025), segs=14); o.rotation_mode = 'QUATERNION'
o.rotation_quaternion = d_.to_track_quat('X', 'Z'); add(o, E2)
face.blob('patch', DARK, (0.014, 0.044, 0.04), -24, 6, out=0.0)
face.curve('strap', DARK, [(-70, 30), (-35, 20), (0, 15), (35, 20), (70, 30)], r=0.007, out=0.0)
# the beard: a big red bush with a braid, and a moustache
face.blob('beard', BEARD, (0.09, 0.15, 0.12), 0, -56, out=-0.02)
face.blob('beardL', BEARD, (0.06, 0.07, 0.09), 42, -38, out=-0.03)
face.blob('beardR', BEARD, (0.06, 0.07, 0.09), -42, -38, out=-0.03)
for s in (-1, 1):
    face.blob(f'stache{s}', BEARD, (0.03, 0.065, 0.026), s * 15, -20, out=0.004, roll=s * math.radians(-25))
face.blob('mouthHole', MOUTH, (0.01, 0.04, 0.014), 0, -30, out=0.0)
bp = face.at(0, -72, 0.02)[0]
for k in range(3):                                  # the braid, with gold beads
    add(mn.sphere(f'braid{k}', 0.035 - 0.005 * k, loc=bp + Vector((0.02 + 0.01 * k, 0, -0.06 * k)), m=BEARD, segs=12), R.head)
add(mn.cyl('braidBead', 0.025, 0.03, loc=bp + Vector((0.035, 0, -0.165)), m=GOLD, bevel=0.008, verts=12), R.head)

# ---------------------------------------------------------------------------
# Arms. His left (+Y): suit arm, glove, gold ring; the jolly-roger shoulder plate.
# His right (-Y): the big cybernetic arm, hazard-striped shoulder.
# ---------------------------------------------------------------------------
sh, el, hd = R.arms[1], R.elbows[1], R.hands[1]; y = SH_Y
add(C.capsule('upperArmL', 0.075, 0.77, 0.6, y=y + 0.01, m=SUIT), sh)
add(mn.sphere('elbowPadL', 0.07, loc=(0.0, y + 0.012, 0.6), m=ARMOR_DK, segs=20), el)
add(C.capsule('foreArmL', 0.07, 0.61, 0.46, y=y + 0.015, m=SUIT), el)
add(mn.cyl('cuffL', 0.078, 0.06, loc=(0.0, y + 0.015, 0.45), m=LEATHER, bevel=0.012), el)
add(mn.sphere('gloveL', 0.075, loc=(0.01, y + 0.015, 0.41), m=LEATHER, scale=(1.05, 0.9, 1.0), segs=20), hd)
add(mn.cyl('ringL', 0.02, 0.02, loc=(0.075, y + 0.015, 0.42), m=GOLD, bevel=0.006, verts=12, rot=(0, math.pi / 2, 0)), hd)
pd = mn.sphere('pauldron', 0.16, loc=(-0.005, y + 0.03, 0.8), m=HAT, scale=(1.05, 0.95, 0.62), segs=32); add(pd, sh)
add(ring('pauldronRim', [Vector((-0.005 + 0.168 * math.cos(a), y + 0.03 + 0.152 * math.sin(a), 0.79)) for a in [2 * math.pi * k / 32 for k in range(32)]], 0.014, GOLD), sh)
for o in skull('padSkull', (-0.005, y + 0.05, 0.9), (0, 0.35, 1), 0.13, up=(1, 0, 0)): add(o, sh)
for k in range(5):                                 # gold fringe
    a = math.radians(-70 + k * 35)
    add(mn.cyl(f'fringe{k}', 0.012, 0.07, loc=(-0.005 + 0.16 * math.cos(a), y + 0.03 + 0.15 * math.sin(a) * 0.6 + 0.08, 0.7), m=GOLD, bevel=0.0, verts=8), sh)

sh, el, hd = R.arms[-1], R.elbows[-1], R.hands[-1]; y = -SH_Y
add(mn.sphere('cyShoulderBall', 0.13, loc=(0.0, y - 0.01, 0.77), m=ARMOR_DK, segs=24), sh)
add(mn.box('cyShoulder', (0.3, 0.24, 0.1), loc=(0.0, y - 0.03, 0.82), m=HAZ, bevel=0.045, rot=(-0.3, 0, 0)), sh)
for k, dx in enumerate((-0.1, 0.1)): add(mn.sphere(f'cyBolt{k}', 0.02, loc=(dx, y - 0.13, 0.86), m=ARMOR, segs=10), sh)
add(C.capsule('cyUpper', 0.07, 0.75, 0.6, y=y - 0.015, m=ARMOR_DK), sh)
for s in (-1, 1):
    add(mn.cyl(f'piston{s}', 0.018, 0.16, loc=(0.06 * s, y - 0.06, 0.6), m=BRASS, bevel=0.004, verts=10), sh)
add(mn.sphere('cyElbow', 0.085, loc=(0.0, y - 0.015, 0.6), m=CYBER, segs=20), el)
add(mn.box('cyFore', (0.17, 0.17, 0.17), loc=(0.0, y - 0.02, 0.44), m=CYBER, bevel=0.05), el)
add(mn.box('cyForePlate', (0.12, 0.03, 0.12), loc=(0.0, y - 0.11, 0.465), m=HAZ, bevel=0.012), el)
for k in range(3):
    add(mn.box(f'cyLed{k}', (0.022, 0.012, 0.022), loc=(0.07, y - 0.08 + k * 0.0, 0.47 + k * 0.035), m=L_RED, bevel=0.0), el)
add(mn.box('cyTape', (0.13, 0.18, 0.04), loc=(0.0, y - 0.02, 0.555), m=TAPE, bevel=0.006, rot=(0, 0, 0.3)), el)
add(mn.sphere('cyFist', 0.085, loc=(0.02, y - 0.02, 0.41), m=ARMOR_DK, scale=(1.1, 1.0, 0.95), segs=20), hd)

def open_cone_x(name, r0, r1, length, m, x0=0.0, verts=32):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=verts, radius1=r0, radius2=r1, depth=length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x0 + length / 2, 0, 0)); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    so = o.modifiers.new('wall', 'SOLIDIFY'); so.thickness = 0.014; so.offset = 0
    return mn.smooth(o)

# ---------------------------------------------------------------------------
# The blunderbuss plasma cannon (in the cyber fist, along +X)
# ---------------------------------------------------------------------------
GN = R.gun; gy, gz = -SH_Y - 0.03, 0.44
MK_BARREL = C.empty('mkBarrel', (0.34, gy + 0.05, gz + 0.02), GN)          # where the left hand holds the barrel
MK_BREECH = C.empty('mkBreech', (0.0, gy + 0.04, gz + 0.11), GN)          # on top of the right fist (leaning)
MK_MOUTH = C.empty('mkMouth', (0.3, 0.0, 1.0), R.head)                       # just in front of the moustache (whistle)
add(mn.box('grip', (0.06, 0.06, 0.12), loc=(0.02, gy, gz - 0.07), m=WOOD, bevel=0.015, rot=(0, -0.3, 0)), GN)
add(mn.box('breech', (0.2, 0.14, 0.15), loc=(0.08, gy, gz - 0.005), m=BRASS, bevel=0.035), GN)
st_ = mn.box('stock', (0.22, 0.09, 0.11), loc=(-0.12, gy, gz - 0.03), m=WOOD, bevel=0.03, rot=(0, -0.12, 0)); add(st_, GN)
add(mn.box('stockPlate', (0.03, 0.095, 0.12), loc=(-0.23, gy, gz - 0.05), m=BRASS, bevel=0.01, rot=(0, -0.12, 0)), GN)
add(mn.cyl('drum', 0.075, 0.12, loc=(0.1, gy - 0.06, gz - 0.06), m=CYBER, bevel=0.02, verts=24, rot=(-math.pi / 2, 0, 0)), GN)
add(mn.cyl('drumGlow', 0.045, 0.125, loc=(0.1, gy - 0.0625, gz - 0.06), m=MUZZLE, bevel=0.0, verts=16, rot=(-math.pi / 2, 0, 0)), GN)
b_ = C.cone_x('barrel', 0.058, 0.064, 0.3, CYBER, verts=24, x0=0.17, bevel=0.0); b_.location = (0, gy, gz + 0.07); add(b_, GN)
for k, x in enumerate((0.2, 0.33, 0.45)):
    o = C.cone_x(f'band{k}', 0.072, 0.072, 0.035, BRASS, verts=24, x0=x); o.location = (0, gy, gz + 0.07); add(o, GN)
bell = open_cone_x('bell', 0.065, 0.15, 0.18, BRASS, x0=0.46); bell.location = (0, gy, gz + 0.07)
add(bell, GN)
o = open_cone_x('bellLip', 0.158, 0.162, 0.025, BRASS, x0=0.625); o.location = (0, gy, gz + 0.07); add(o, GN)
o = C.cone_x('bellIn', 0.1, 0.1, 0.006, MUZZLE, verts=32, x0=0.53); o.location = (0, gy, gz + 0.07); add(o, GN)
MH = tg('muzzleHot', GN, (0.64, gy, gz + 0.07))
o = C.cone_x('bellHot', 0.12, 0.12, 0.008, MUZZLE_HOT, verts=32, x0=0.56); o.location = (0, gy, gz + 0.07); add(o, MH)
for k in range(7):                                  # the flash: a spiky orange star out of the bell
    a = 2 * math.pi * k / 7
    sp = C.spike(f'flash{k}', 0.05, 0.22 if k % 2 else 0.3, FLASH, verts=8)
    sp.matrix_world = Matrix.Translation((0.66, gy + 0.05 * math.cos(a), gz + 0.07 + 0.05 * math.sin(a))) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(0.5 * math.sin(a), 4, 'X') @ Matrix.Rotation(-0.5 * math.cos(a), 4, 'Y')
    add(sp, MH)
add(mn.sphere('flashCore', 0.09, loc=(0.68, gy, gz + 0.07), m=FLASH, scale=(1.4, 1, 1), segs=16), MH)
add(mn.box('gunTape', (0.07, 0.15, 0.13), loc=(0.39, gy, gz + 0.0), m=TAPE, bevel=0.01, rot=(0, 0.2, 0)), GN)
add(mn.box('gunLed', (0.03, 0.02, 0.02), loc=(0.12, gy + 0.075, gz + 0.06), m=L_RED, bevel=0.0), GN)
add(label('gunName', 'BESSIE', 0.04, (0.07, gy - 0.072, gz + 0.04), (0, -1, 0), m=INK), GN)

# ---------------------------------------------------------------------------
# Legs
# ---------------------------------------------------------------------------
for s in (-1, 1):
    y = s * 0.115; hp, kn = R.legs[s], R.knees[s]
    add(C.capsule(f'thigh{s}', 0.088, HIP_Z - 0.03, 0.2, y=y, m=SUIT_DK), hp)
    add(mn.sphere(f'kneePad{s}', 0.078, loc=(0.04, y, 0.21), m=ARMOR if s > 0 else PATCH, segs=20, scale=(0.8, 1, 1)), kn)
    add(C.capsule(f'shin{s}', 0.082, 0.22, 0.07, y=y, m=SUIT_DK), kn)
    add(mn.box(f'boot{s}', (0.25, 0.17, 0.13), loc=(0.03, y, 0.02), m=LEATHER, bevel=0.045), kn)
    add(mn.box(f'bootTop{s}', (0.15, 0.18, 0.06), loc=(-0.01, y, 0.13), m=LEATHER, bevel=0.025), kn)
    add(mn.box(f'toecap{s}', (0.08, 0.17, 0.08), loc=(0.125, y, 0.02), m=ARMOR, bevel=0.03), kn)
    add(mn.box(f'sole{s}', (0.26, 0.18, 0.035), loc=(0.03, y, 0.0), m=RUBBER, bevel=0.012), kn)
add(mn.box('bootTape', (0.03, 0.19, 0.05), loc=(0.07, -0.115, 0.08), m=TAPE, bevel=0.006, rot=(0, 0.3, 0)), R.knees[-1])

# ---------------------------------------------------------------------------
# The coat (phase 1): torso, collar, skirt (on the hips), the left sleeve; the right sleeve is torn off
# ---------------------------------------------------------------------------
CT = tg('coat', T); CH = tg('coat', R.skirt); CS = tg('coat', R.arms[1]); CE = tg('coat', R.elbows[1])
add(mn.box('coatBody', (0.40, 0.56, 0.42), loc=(-0.005, 0, 0.43), m=COAT, bevel=0.14), CT)
add(mn.box('waistcoat', (0.03, 0.16, 0.36), loc=(0.19, 0, 0.44), m=SUIT_DK, bevel=0.012), CT)
for o in skull('vestSkull', (0.207, 0, 0.72), (1, 0, 0.35), 0.1): add(o, CT)
for s in (-1, 1):
    lp = mn.box(f'lapel{s}', (0.03, 0.06, 0.34), loc=(0, 0, 0), m=GOLD, bevel=0.012)
    lp.matrix_world = Matrix.Translation((0.2, s * 0.1, 0.48)) @ Matrix.Rotation(s * 0.18, 4, 'X'); add(lp, CT)
    for k, z in enumerate((0.5, 0.6, 0.7)):
        add(mn.sphere(f'button{s}{k}', 0.02, loc=(0.21, s * 0.155, z), m=GOLD, segs=10), CT)
add(mn.box('coatBelt', (0.43, 0.59, 0.075), loc=(-0.005, 0, 0.44), m=LEATHER, bevel=0.03), CT)
add(mn.box('coatBuckle', (0.04, 0.17, 0.11), loc=(0.215, 0, 0.425), m=GOLD, bevel=0.015), CT)
add(label('coatBuckleT', 'RC', 0.06, (0.237, 0, 0.48), (1, 0, 0), m=INK), CT)
add(mn.box('medal', (0.02, 0.05, 0.05), loc=(0.205, 0.17, 0.7), m=GOLD, bevel=0.01), CT)
add(mn.box('medalRibbon', (0.02, 0.04, 0.05), loc=(0.205, 0.17, 0.75), m=mn.mat('ribbon', '#3a6ad0', 0.6), bevel=0.006), CT)
add(mn.box('coatPatch', (0.02, 0.12, 0.1), loc=(-0.205, 0.17, 0.5), m=PATCH, bevel=0.008, rot=(0.2, 0, 0)), CT)
add(mn.box('coatTape', (0.02, 0.17, 0.045), loc=(-0.205, -0.15, 0.62), m=TAPE, bevel=0.004, rot=(-0.5, 0, 0)), CT)
col = mn.box('coatCollar', (0.07, 0.56, 0.2), loc=(0, 0, 0), m=COAT, bevel=0.03)
col.matrix_world = Matrix.Translation((-0.13, 0, 0.78)) @ Matrix.Rotation(-0.35, 4, 'Y'); add(col, CT)
ct_ = mn.box('collarTrim', (0.075, 0.565, 0.03), loc=(0, 0, 0), m=GOLD, bevel=0.012)
ct_.matrix_world = Matrix.Translation((-0.13 - 0.2 * math.sin(0.35), 0, 0.78 + 0.19)) @ Matrix.Rotation(-0.35, 4, 'Y'); add(ct_, CT)
for s in (-1, 1):                                   # shoulders of the coat
    add(mn.sphere(f'coatShoulder{s}', 0.13, loc=(-0.01, s * 0.24, 0.77), m=COAT, scale=(1.1, 0.9, 0.6), segs=24), CT)
add(mn.cyl('tornSleeve', 0.11, 0.06, loc=(0.0, -SH_Y - 0.02, 0.6), m=COAT_IN, bevel=0.02, verts=10), CT)    # ragged right armhole
# the skirt: a flared open-front cone (lining inside), gold hem and front edges
def coat_cone(name, r0, r1, z0, z1, m, open_deg=44, sy=1.12, lining=True, thick=0.016):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); n = 40
    rows = []
    for (r, z) in ((r0, z0), (r1, z1)):
        row = []
        for k in range(n + 1):
            a = math.radians(open_deg) + (2 * math.pi - 2 * math.radians(open_deg)) * k / n
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a) * sy, z)))
        rows.append(row)
    for k in range(n): bm.faces.new([rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    if lining:
        o.data.materials.append(COAT_IN)
    so = o.modifiers.new('wall', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    if lining: so.material_offset = 1
    return mn.smooth(o), rows
ZS0, ZS1, RS0, RS1 = 0.07, 0.47, 0.30, 0.255
sk, _ = coat_cone('skirt', RS1, RS0, ZS1, ZS0, COAT); add(sk, CH)
hem, _ = coat_cone('hem', RS0 + 0.004, RS0 - 0.003, ZS0 - 0.005, ZS0 + 0.045, GOLD, lining=False, thick=0.022); add(hem, CH)
a0 = math.radians(44)
for s in (-1, 1):
    pts = [(RS1 * math.cos(a0) + 0.01, s * RS1 * math.sin(a0) * 1.12, ZS1), (RS0 * math.cos(a0) + 0.012, s * RS0 * math.sin(a0) * 1.12, ZS0 + 0.01)]
    add(C.tube(f'frontTrim{s}', pts, 0.016, GOLD, res=2), CH)
add(mn.box('backVent', (0.02, 0.02, 0.24), loc=(-RS0 * 0.93, 0, ZS0 + 0.02), m=COAT_IN, bevel=0.005, rot=(0, -0.25, 0)), CH)
add(mn.box('skirtPatch', (0.02, 0.13, 0.11), loc=(-0.32, -0.16, 0.18), m=PATCH2, bevel=0.008, rot=(0.2, -0.25, -0.45)), CH)
add(mn.box('skirtTape', (0.02, 0.16, 0.04), loc=(-0.33, 0.12, 0.25), m=TAPE, bevel=0.004, rot=(0.6, -0.25, 0.4)), CH)
# the left sleeve and its big turned-back gold cuff
y = SH_Y
add(C.capsule('sleeveU', 0.09, 0.78, 0.6, y=y + 0.01, m=COAT), CS)
add(C.capsule('sleeveF', 0.085, 0.61, 0.47, y=y + 0.015, m=COAT), CE)
add(mn.cyl('sleeveCuff', 0.098, 0.08, loc=(0.0, y + 0.015, 0.455), m=GOLD, bevel=0.02, verts=24), CE)

# the thrown coat (coat_off, coat_floor): a flat, wrinkled coat seen from its back (collar towards +X), the
# left sleeve flung out, the right one torn off; gold hem, patch, tape. Posed per frame under R.fly.
FLY = R.fly
fc = []
me = bpy.data.meshes.new('flyBody'); bm = bmesh.new(); NU, NV = 14, 10
grid = [[None] * (NV + 1) for _ in range(NU + 1)]
for i in range(NU + 1):
    u = i / NU; x = 0.45 - 0.9 * u; hw = 0.25 + 0.18 * u           # collar (narrow) -> hem (wide)
    for j in range(NV + 1):
        v = j / NV; y = (v - 0.5) * 2 * hw
        if abs(y) < 0.02 and u > 0.72: y += 0.02 if v > 0.5 else -0.02       # the back vent
        z = 0.035 * math.sin(7 * u + 2.0 * v) + 0.03 * math.sin(11 * v + 1) * u + 0.05 * (abs(v - 0.5) * 2) ** 2
        grid[i][j] = bm.verts.new((x, y, z))
for i in range(NU):
    for j in range(NV): bm.faces.new([grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j], grid[i][j]])     # normals up
bm.to_mesh(me); bm.free()
o = mn.link(bpy.data.objects.new('flyBody', me)); mn.assign(o, COAT); o.data.materials.append(COAT_IN)
so = o.modifiers.new('wall', 'SOLIDIFY'); so.thickness = 0.03; so.offset = -1; so.material_offset = 1
mn.smooth(o); fc.append(o)
hp = []
for j in range(NV + 1):
    v = j / NV; hw = 0.43; y = (v - 0.5) * 2 * hw
    z = 0.035 * math.sin(7 + 2.0 * v) + 0.03 * math.sin(11 * v + 1) + 0.05 * (abs(v - 0.5) * 2) ** 2
    hp.append((-0.44, y, z + 0.012))
fc.append(C.tube('flyHem', hp, 0.022, GOLD, res=2))
fc.append(mn.box('flyCollar', (0.12, 0.54, 0.07), loc=(0.42, 0, 0.01), m=COAT, bevel=0.03))
fc.append(mn.box('flyCollarTrim', (0.03, 0.55, 0.075), loc=(0.48, 0, 0.012), m=GOLD, bevel=0.012))
fc.append(mn.box('flyPatch', (0.13, 0.11, 0.02), loc=(-0.1, 0.17, 0.05), m=PATCH, bevel=0.008, rot=(0, 0, 0.3)))
fc.append(mn.box('flyTape', (0.04, 0.2, 0.02), loc=(0.12, -0.12, 0.05), m=TAPE, bevel=0.005, rot=(0, 0, 0.6)))
fc.append(mn.box('flyTape2', (0.04, 0.2, 0.02), loc=(0.12, -0.12, 0.052), m=TAPE, bevel=0.005, rot=(0, 0, -0.5)))
sl = C.tube('flySleeve', [(0.33, 0.24, 0.05), (0.25, 0.42, 0.07), (0.05, 0.55, 0.06)], 0.075, COAT); sl.scale = (1, 1, 0.7); C.apply_tf(sl); fc.append(sl)
fc.append(mn.cyl('flyCuff', 0.085, 0.08, loc=(0, 0, 0), m=GOLD, bevel=0.02, verts=24))
fc[-1].matrix_world = Matrix.Translation((0.02, 0.57, 0.06)) @ Matrix.Rotation(math.radians(70), 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Diagonal((1, 0.7, 1, 1))
fc.append(mn.box('flyTorn', (0.1, 0.06, 0.03), loc=(0.33, -0.27, 0.02), m=COAT_IN, bevel=0.01, rot=(0, 0, -0.4)))
for o in skull('flySkull', (-0.22, -0.13, 0.075), (0, 0, 1), 0.09, up=(1, 0, 0)): fc.append(o)
FLYTOG = R.tog('fly', FLY, (0, 0, 0))
for o in fc:
    bpy.context.view_layer.update(); mw = o.matrix_world.copy(); o.parent = FLYTOG; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_basis = mw; keep(o)
FLYT = [o for o in fc]

mn.outline([o for o in parts if o.type == 'MESH' and not o.name.startswith(('flash', 'spark', 'jet', 'drip', 'leak', 'weld', 'label', 'signT', 'genStencil', 'buckleT', 'coatBuckleT', 'gunName', 'radGlow', 'finEdge', 'cyLed', 'crack', 'bellHot', 'bellIn', 'burstGlow'))], thickness=OUTLINE)
R.root.scale = (SCALE, SCALE, SCALE)

# stars over the hat (dazed)
for k in range(4):
    a = k * math.pi / 2
    st = star_mesh(f'star{k}', 0.085, STAR); st.location = (0.3 * math.cos(a), 0.3 * math.sin(a), 0.03 * math.sin(2 * a))
    st.rotation_euler = (0, 0, a + math.pi / 2); C.local(st, R.stars); keep(st)
STAR_T = R.tog('stars', R.stars, (0, 0, 0)); STAR_T.parent = R.stars; STAR_T.matrix_parent_inverse = Matrix.Identity(4); STAR_T.location = (0, 0, 0)
R.stars.matrix_parent_inverse = Matrix.Identity(4); R.stars.location = (0.12, 0, 1.5)
for o in R.stars.children:
    if o is not STAR_T and o.name.startswith('star'): o.parent = STAR_T

# ---------------------------------------------------------------------------
# Poses
# ---------------------------------------------------------------------------
rad = math.radians
UA = (Vector((0, 0.012, -0.17))).length; FA = (Vector((0.01, 0.003, -0.17))).length
TORSO_REST = Matrix.Translation((0, 0, HIP_Z))
def upd(): bpy.context.view_layer.update()
def to_torso(p_world):
    return TORSO_REST @ R.torso.matrix_world.inverted() @ p_world
def rig_to_torso(p_rig):
    return to_torso(R.root.matrix_world @ Vector(p_rig))
def dir_to_torso(d_rig):
    return (R.torso.matrix_world.to_3x3().normalized().inverted() @ R.root.matrix_world.to_3x3().normalized() @ Vector(d_rig)).normalized()
def arm_ik(s, target, pole):
    """Two-bone arm IK in torso space: wrist to `target`, elbow towards the `pole` direction."""
    S = Vector((0, s * SH_Y, 0.77)); D = Vector(target) - S
    d = max(0.05, min(D.length, UA + FA - 1e-3)); dn = D.normalized(); pole = Vector(pole)
    pp = (pole - dn * pole.dot(dn)).normalized()
    A = math.acos(max(-1, min(1, (UA * UA + d * d - FA * FA) / (2 * UA * d))))
    u = dn * math.cos(A) + pp * math.sin(A); E = S + u * UA
    v = (S + dn * d - E).normalized()
    Zs = -u; Xs = v - u * v.dot(u)
    Xs = Xs.normalized() if Xs.length > 1e-5 else pp.cross(u).normalized()
    Ys = Zs.cross(Xs)
    R.arms[s].rotation_euler = Matrix((Xs, Ys, Zs)).transposed().to_euler('XYZ')
    R.elbows[s].rotation_euler = (0, -math.acos(max(-1, min(1, u.dot(v)))), 0)
def aim_gun(d, up=(0, 0, 1)):
    """Turn the right wrist so the cannon (+X in the hand) points along d (torso space)."""
    X = Vector(d).normalized(); Z = Vector(up); Z = (Z - X * Z.dot(X)).normalized(); Y = Z.cross(X)
    Rd = Matrix((X, Y, Z)).transposed()
    Rp = R.arms[-1].rotation_euler.to_matrix() @ R.elbows[-1].rotation_euler.to_matrix()
    R.hands[-1].rotation_euler = (Rp.inverted() @ Rd).to_euler('XYZ')
def grip_left(marker, pole=(0.2, 1, -1)):
    upd(); arm_ik(1, to_torso(marker.matrix_world.translation), pole)
def arm(s, sh=(0, 0, 0), el=-12, hand=(0, 0, 0)):
    R.arms[s].rotation_euler = tuple(rad(v) for v in sh)
    R.elbows[s].rotation_euler = (0, rad(el), 0)
    R.hands[s].rotation_euler = tuple(rad(v) for v in hand)

def reset_pose(on):
    for o in R.movers:
        o.rotation_euler = (0, 0, 0); o.scale = (1, 1, 1)
    R.lie.location = (0, 0, 0); R.hips.location = (0, 0, HIP_Z); R.fly.location = (0, 0, 0)
    for s in (-1, 1): arm(s, (s * 7, 0, 0))
    R.arms[-1].rotation_euler = (rad(-9), rad(-10), 0); R.elbows[-1].rotation_euler = (0, rad(-55), 0)
    R.hands[-1].rotation_euler = (0, rad(48), 0)              # idle: cannon carried at the hip, muzzle low and forward
    for name, ts in R.toggles.items():
        for t in ts: t.scale = (1, 1, 1) if name in on else (1e-4, 1e-4, 1e-4)

def legs_walk(p, gait=1.0):
    for s in (-1, 1):
        sw = math.sin(p) * s
        R.legs[s].rotation_euler = (0, -0.5 * sw * gait, 0)
        R.knees[s].rotation_euler = (0, 0.75 * gait * max(0.0, math.cos(p) * s) ** 1.2, 0)

def base_on(ph, extra=()):
    on = {'p1', 'eye1', 'coat'} if ph == 1 else {'p2', 'eye2'}
    return on | set(extra)

def pose(kind, t, ph):
    P = 2 * math.pi * t
    if kind == 'idle':
        reset_pose(base_on(ph))
        b = math.sin(P)
        R.hips.location.z = HIP_Z - 0.006 - 0.006 * b
        R.torso.rotation_euler = (0, rad(-2 + 1.5 * b), 0)               # chest swells (leans back a touch)
        R.head.rotation_euler = (0, rad(1.5 * b), rad(3 * math.sin(P + 1)))
        R.arms[1].rotation_euler = (rad(9 + 2 * b), rad(4), 0)
        R.elbows[-1].rotation_euler = (0, rad(-55 + 2 * b), 0)
        R.gen.scale = (1 + 0.01 * b,) * 3
    elif kind == 'walk':
        reset_pose(base_on(ph))
        legs_walk(P)
        R.hips.location.z = HIP_Z - 0.035 + 0.035 * abs(math.cos(P))
        R.torso.rotation_euler = (0, 0.07, -0.1 * math.sin(P))
        R.head.rotation_euler = (0, -0.05, 0.07 * math.sin(P))
        R.arms[1].rotation_euler = (rad(8), 0.5 * math.sin(P), 0); R.elbows[1].rotation_euler = (0, rad(-15) - 0.25 * max(0, -math.sin(P)), 0)
        R.arms[-1].rotation_euler = (rad(-9), rad(-10) - 0.15 * math.sin(P), 0)
        R.skirt.rotation_euler = (0.04 * math.sin(P), 0.03 * math.cos(2 * P), 0)
    elif kind in ('aim', 'fire'):
        on = base_on(ph, ('muzzleHot',) if kind == 'fire' and t == 0 else ())
        reset_pose(on)
        k = {0: 1.0, 1: 0.6, 2: 0.2}.get(int(round(t * 3)), 0) if kind == 'fire' else 0.0       # recoil amount
        R.arms[-1].rotation_euler = (rad(6), rad(-78 - 30 * k), rad(-12))
        R.elbows[-1].rotation_euler = (0, rad(-6 - 10 * k), 0)
        R.hands[-1].rotation_euler = (0, rad(84 + 8 * k), 0)
        R.arms[1].rotation_euler = (rad(-4), rad(-62 - 14 * k), rad(-40))
        R.elbows[1].rotation_euler = (0, rad(-38), 0)
        R.legs[-1].rotation_euler = (0, 0.2, 0); R.legs[1].rotation_euler = (0, -0.24, 0); R.knees[1].rotation_euler = (0, 0.14, 0)
        R.hips.location.z = HIP_Z - 0.025
        R.torso.rotation_euler = (0, 0.04 - 0.14 * k, rad(14))
        R.head.rotation_euler = (0, 0.06 - 0.08 * k, rad(-12))
        R.lie.location.x = -0.04 * k
        R.gen.rotation_euler = (0, -0.05 * k, 0)
        R.skirt.rotation_euler = (0, -0.06 * k, 0)
        grip_left(MK_BARREL, (0.3, 1, -1))
    elif kind == 'spin':
        reset_pose(base_on(ph, ('muzzleHot',) if t == 0 else ()))
        R.arms[-1].rotation_euler = (rad(20), rad(-80), rad(-30))     # cannon swung out wide, firing
        R.elbows[-1].rotation_euler = (0, rad(-4), 0); R.hands[-1].rotation_euler = (0, rad(80), 0)
        R.arms[1].rotation_euler = (rad(-55), rad(-10), 0); R.elbows[1].rotation_euler = (0, rad(-20), 0)  # left arm out for balance
        R.torso.rotation_euler = (rad(4), 0.08, rad(-22))                 # twisted into the turn
        R.head.rotation_euler = (0, 0.05, rad(10))
        R.lie.rotation_euler = (rad(5), 0, 0)
        R.legs[-1].rotation_euler = (rad(4), -0.25 if t == 0 else 0.15, 0); R.legs[1].rotation_euler = (rad(-6), 0.2 if t == 0 else -0.2, 0)
        R.knees[1 if t == 0 else -1].rotation_euler = (0, 0.4, 0)
        R.hips.location.z = HIP_Z - 0.03
        R.skirt.scale = (1.3, 1.3, 0.85) if t == 0 else (1.34, 1.26, 0.83)      # the coat flares out
        R.skirt.rotation_euler = (0, 0, rad(-25 if t == 0 else -32))
        R.gen.rotation_euler = (0, 0, rad(8))
    elif kind == 'breath':                                                  # leaning on the cannon like a cane, panting
        reset_pose(base_on(ph))
        b = math.sin(P)
        R.lie.rotation_euler = (0, rad(10), 0)
        R.hips.location = (-0.05, 0, HIP_Z - 0.05)
        for s_ in (-1, 1):
            R.legs[s_].rotation_euler = (s_ * rad(-6), -0.32 + (0.14 if s_ < 0 else 0.0), 0); R.knees[s_].rotation_euler = (0, 0.5, 0)
        R.torso.rotation_euler = (0, rad(18 + 4 * b), rad(-10))
        R.head.rotation_euler = (0, rad(-26 - 6 * b), rad(6))
        R.gen.rotation_euler = (0, rad(-3 * b), 0)
        upd()
        H = Vector((0.36, -0.2, 0.66 - 0.015 * b)); Bf = Vector((0.5, -0.24, 0.02))     # rig space: wrist, bell on the floor
        arm_ik(-1, rig_to_torso(H), (0.2, -1, -0.4))
        aim_gun(dir_to_torso(Bf - H), dir_to_torso((-1, 0, 0.2)))
        grip_left(MK_BREECH, (0.2, 1, -0.6))
    elif kind == 'whistle':                                                  # fist to the mouth: *WHEEEET*
        reset_pose(base_on(ph))
        k = [0.55, 1.0, 1.0, 0.45][int(round(t * 4)) % 4]
        R.torso.rotation_euler = (0, rad(-5 * k), rad(-14 * k))
        # the arm is too short to reach the mouth, so the head comes down and round to meet the fist
        R.head.rotation_euler = (rad(-8 * k), rad(14 * k), rad(30 * k) + rad(3) * math.sin(P * 2) * k)
        R.hips.location.z = HIP_Z + 0.012 * k
        upd()
        rest = Vector((0.02, SH_Y + 0.02, 0.43)); mouth = to_torso(MK_MOUTH.matrix_world.translation) + Vector((0.0, 0.0, 0.02))
        arm_ik(1, rest.lerp(mouth, k), (0.0, 1, 0.2))                    # elbow out to the side
        R.hands[1].rotation_euler = (0, rad(-40 * k), 0)
    elif kind == 'coat_off':
        f = int(round(t * 6))
        if f == 0:    # grabs the lapels, crouched (anticipation)
            reset_pose(base_on(1))
            R.torso.rotation_euler = (0, rad(14), 0); R.head.rotation_euler = (0, rad(-12), 0)
            R.hips.location.z = HIP_Z - 0.05
            for s_ in (-1, 1): R.legs[s_].rotation_euler = (s_ * rad(-6), -0.3, 0); R.knees[s_].rotation_euler = (0, 0.5, 0)
            upd()
            arm_ik(1, (0.24, 0.1, 0.68), (0, 1, -0.5)); arm_ik(-1, (0.23, -0.13, 0.66), (0, -1, -0.5))
            aim_gun((0.2, -0.3, -1), (1, 0, 0))
        elif f in (1, 2, 3):   # flings it back over the shoulders; the generator cracks with a blue flash
            reset_pose({'p2', 'eye2', 'fly'} | ({'burst0'} if f == 1 else {'burst1'} if f == 2 else set()))
            k = {1: 1.0, 2: 0.8, 3: 0.35}[f]
            R.torso.rotation_euler = (0, rad(-14 * k), 0); R.head.rotation_euler = (0, rad(-18 * k), 0)
            R.hips.location.z = HIP_Z + 0.02 * k
            for s_ in (-1, 1): R.legs[s_].rotation_euler = (s_ * rad(-8 * k), 0, 0)
            upd()
            arm_ik(1, (-0.12 * k + 0.02, 0.3 + 0.16 * k, 0.43 + 0.5 * k), (-0.3, 1, -0.4))
            arm_ik(-1, (-0.1 * k + 0.02, -0.3 - 0.16 * k, 0.45 + 0.45 * k), (-0.3, -1, -0.4))
            aim_gun((0.3, -0.4 * k, 1.0 * k - 0.4 * (1 - k)), (-1, 0, 0))
            # the coat: lifted up and back (f1), flying back and spread (f2), crumpling down behind (f3)
            R.fly.location = {1: (-0.42, 0, 1.05), 2: (-0.95, 0.12, 0.75), 3: (-1.15, 0.2, 0.12)}[f]
            R.fly.rotation_euler = {1: (0, rad(-80), 0), 2: (rad(15), rad(-40), rad(15)), 3: (rad(4), rad(-8), rad(25))}[f]
            R.fly.scale = {1: (1, 0.9, 1), 2: (1, 1.1, 1.0), 3: (1.0, 1.05, 0.8)}[f]
        elif f == 4:   # flexes, cannon up: COMET MODE!
            reset_pose(base_on(2))
            R.torso.rotation_euler = (0, rad(-8), 0); R.head.rotation_euler = (0, rad(-14), 0)
            for s_ in (-1, 1): R.legs[s_].rotation_euler = (s_ * rad(-9), 0, 0)
            upd()
            arm_ik(1, (0.06, 0.5, 0.92), (0, 1, -1.2))
            arm_ik(-1, (0.08, -0.46, 1.0), (0, -1, -1.2))
            aim_gun((0.15, -0.15, 1), (-1, 0, 0))
        else:          # settles into the phase-2 stance
            pose('idle', 0.75, 2)
    elif kind == 'dash':
        reset_pose(base_on(2, (f'jet{int(round(t * 2)) % 2}',)))
        R.lie.rotation_euler = (0, rad(30), 0); R.lie.location.z = 0.04
        R.legs[-1].rotation_euler = (0, 0.55, 0); R.knees[-1].rotation_euler = (0, 0.9, 0)       # trailing leg
        R.legs[1].rotation_euler = (0, -0.35, 0); R.knees[1].rotation_euler = (0, 0.75, 0)
        R.arms[-1].rotation_euler = (rad(6), rad(-55), rad(-6)); R.elbows[-1].rotation_euler = (0, rad(-40), 0); R.hands[-1].rotation_euler = (0, rad(70), 0)
        R.arms[1].rotation_euler = (rad(-20), rad(50), 0); R.elbows[1].rotation_euler = (0, rad(-25), 0)
        R.torso.rotation_euler = (0, rad(8), 0); R.head.rotation_euler = (0, rad(-28), 0)
        R.gen.scale = (1, 1, 1)
    elif kind == 'dazed':
        reset_pose(base_on(2, ('stars',)))
        sw = math.sin(P)
        for s in (-1, 1):
            R.arms[s].rotation_euler = (s * rad(-16), rad(-6), 0); R.elbows[s].rotation_euler = (0, rad(-8), 0)
            R.legs[s].rotation_euler = (s * rad(-5), -0.3, 0); R.knees[s].rotation_euler = (0, 0.6, 0)
        R.hands[-1].rotation_euler = (0, rad(100), 0)              # cannon dangling, bell on the floor
        R.hips.location.z = HIP_Z - 0.06
        R.lie.rotation_euler = (rad(5) * sw, rad(4) * math.cos(P), 0)
        R.torso.rotation_euler = (rad(8) * sw, 0.2, 0.12 * sw)
        R.head.rotation_euler = (rad(-16) * sw, -0.12, rad(10) * math.cos(P))
        R.stars.rotation_euler = (rad(6) * math.cos(P), rad(6) * sw, P / 4)
    elif kind == 'stagger':
        f = int(round(t * 6)) % 6
        reset_pose(base_on(2, (f'burst{f % 2}',)))
        P2_ = 2 * math.pi * f / 6
        legs_walk(P2_, 0.7)
        R.lie.rotation_euler = (rad(7) * math.sin(P2_), rad(8), 0)
        R.hips.location.z = HIP_Z - 0.05 + 0.02 * abs(math.cos(P2_))
        R.torso.rotation_euler = (rad(10) * math.sin(P2_ + 1), rad(16), rad(12) * math.sin(P2_) + rad(10))
        R.head.rotation_euler = (rad(10) * math.sin(P2_ + 2), rad(-10), rad(10) * math.cos(P2_))
        R.arms[-1].rotation_euler = (rad(-14), rad(10) + 0.2 * math.sin(P2_), 0); R.elbows[-1].rotation_euler = (0, rad(-20), 0)
        R.hands[-1].rotation_euler = (0, rad(95), 0)             # the cannon dragging, bell down
        R.gen.rotation_euler = (rad(4) * math.sin(3 * P2_), 0, 0); R.gen.scale = ((1.04 if f % 2 else 0.98),) * 3
        upd()
        arm_ik(1, (-0.2, 0.36, 0.66 + 0.03 * math.sin(P2_)), (0.6, 1, -0.2))     # clutching back at the generator

def key_frame(f, kind, t, ph):
    bpy.context.scene.frame_set(f)
    pose(kind, t, ph)
    for o in R.movers:
        o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f); o.keyframe_insert('scale', frame=f)
    return f

ANIMS = []      # (name, kind, phase, n)
for ph in (1, 2):
    ANIMS += [(f'p{ph}_idle', 'idle', ph, 4), (f'p{ph}_walk', 'walk', ph, 8), (f'p{ph}_aim_buckshot', 'aim', ph, 1),
              (f'p{ph}_fire_buckshot', 'fire', ph, 3), (f'p{ph}_spin', 'spin', ph, 2), (f'p{ph}_catch_breath', 'breath', ph, 4)]
    if ph == 1: ANIMS += [('p1_whistle', 'whistle', 1, 4), ('p1_coat_off', 'coat_off', 1, 6)]
    else: ANIMS += [('p2_dash', 'dash', 2, 2), ('p2_dazed', 'dazed', 2, 4), ('p2_defeated_stagger', 'stagger', 2, 6)]
F = {}; fr = 1
for name, kind, ph, n in ANIMS:
    F[name] = []
    for i in range(n):
        F[name].append(key_frame(fr, kind, i / n, ph)); fr += 1
C.linear_keys()

proxy = mn.cyl('canvasProxy', 0.62 * SCALE, 2.05 * SCALE, verts=32, bevel=0); proxy.hide_render = True
passes = ('beauty',) if PREVIEW else ('beauty', 'normal', 'height')
ndirs = int(PREVIEW) if PREVIEW and PREVIEW.isdigit() else 8
times = {}
for name, frames in F.items():
    if ONLY and name not in ONLY: continue
    objs = [o for o in parts if o.type == 'MESH'] + [proxy]
    t0 = time.time()
    mn.render('chars/captain/' + name, objs=objs, root=R.root, dirs=ndirs, frames=frames, passes=passes)
    times[name] = round(time.time() - t0, 1)
    print(f'[captain] {name} {times[name]} s', flush=True)

# the thrown coat on the floor (a prop: drop it where the coat lands at coat_off f3)
if not ONLY or 'coat_floor' in ONLY:
    bpy.context.scene.frame_set(F['p1_coat_off'][3])
    keepers = set(fc)
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and o not in keepers: o.hide_render = True
    for o in (R.fly, R.lie, R.root): o.animation_data_clear()
    R.lie.location = (0, 0, 0); R.lie.rotation_euler = (0, 0, 0)
    R.fly.location = (0, 0, 0); R.fly.rotation_euler = (0, 0, rad(25)); R.fly.scale = (1, 1, 0.8)    # lying flat, spread
    bpy.context.view_layer.update()
    R.fly.location.z = C.lie_height(R, fc) / SCALE
    R.root.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    mn.render('chars/captain/coat_floor', objs=fc, passes=passes)
print('[captain] render times (s):', times)
