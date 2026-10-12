"""Shared helpers for the character models (alien, pirate, Dr. Varga), on top of mn.py.

Rig approach (same as models/crew/crew.py, so walk cycles are comparable):
  * Everything hangs under one `root` empty at the ground origin; mn.render turns only the root for
    the 8 directions, and the root is never keyframed.
  * Joints are empties. Meshes are built in world space at the rest pose and attached to their joint
    with attach() (keeps the world placement). Poses set the joints' location / rotation_euler, and
    key() stores them on a scene frame; mn.render then renders frames by number.
  * Humans: human_rig() builds the crew's skeleton (same joint positions and proportions as crew.py)
    and pose_human() poses it; its walk is crew.py's walk formula, unchanged.
  * The alien uses the same root / body / joint empties, plus a 2-bone IK (leg_ik) that plants
    every foot on a ground target, so its legs never slide or sink.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler
import mn

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
GAIN = 1.35
def lift(color, gain=GAIN):
    """Palette colour, a bit brighter: lit 3D surfaces under AgX read darker than the game's flat fills."""
    return tuple(min(1.0, c * gain) for c in mn.hex_rgb(mn.PALETTE.get(color, color)))

def worn(name, color, rough=0.5, metal=0.1, grime=1.0, scratches=0.5, scale=1.0, coat=0.0, gain=GAIN):
    """Worn paint / fabric: AO grime in crevices, soft dirt blotches, thin scratches (interceptor style)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*lift(color, gain), 1)
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.05; ao.samples = 8
    blot = N.new('ShaderNodeTexNoise'); blot.inputs['Scale'].default_value = 7 * scale; blot.inputs['Detail'].default_value = 6
    Lk(tc.outputs['Object'], blot.inputs['Vector'])
    g1 = N.new('ShaderNodeMapRange'); g1.inputs['From Min'].default_value = 0.45; g1.inputs['From Max'].default_value = 0.75
    g1.inputs['To Max'].default_value = 0.25 * grime; Lk(blot.outputs['Fac'], g1.inputs['Value'])
    aoi = N.new('ShaderNodeMath'); aoi.operation = 'SUBTRACT'; aoi.inputs[0].default_value = 1; Lk(ao.outputs['AO'], aoi.inputs[1])
    aok = N.new('ShaderNodeMath'); aok.operation = 'MULTIPLY'; aok.inputs[1].default_value = 0.6 * grime; Lk(aoi.outputs[0], aok.inputs[0])
    gsum = N.new('ShaderNodeMath'); gsum.operation = 'ADD'; gsum.use_clamp = True; Lk(g1.outputs[0], gsum.inputs[0]); Lk(aok.outputs[0], gsum.inputs[1])
    dirt = N.new('ShaderNodeMix'); dirt.data_type = 'RGBA'; dirt.blend_type = 'MULTIPLY'
    Lk(gsum.outputs[0], dirt.inputs['Factor']); Lk(rgb.outputs[0], dirt.inputs[6]); dirt.inputs[7].default_value = (0.09, 0.075, 0.065, 1)
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 30, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.5)
    Lk(tc.outputs['Object'], sm.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 16 * scale; sn.inputs['Detail'].default_value = 2; Lk(sm.outputs[0], sn.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.7; sc.inputs['From Max'].default_value = 0.71
    sc.inputs['To Max'].default_value = 0.45 * scratches; Lk(sn.outputs['Fac'], sc.inputs['Value'])
    bare = N.new('ShaderNodeMix'); bare.data_type = 'RGBA'; Lk(sc.outputs[0], bare.inputs['Factor'])
    Lk(dirt.outputs[2], bare.inputs[6]); bare.inputs[7].default_value = (0.42, 0.42, 0.43, 1)
    Lk(bare.outputs[2], b.inputs['Base Color'])
    return m

def chitin(name, light, mid, dark, rough=0.32, coat=0.7, scale=1.0, gain=1.6):
    """Glossy alien carapace: dark in crevices (AO), light on exposed curves, mottled with noise."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.15
    tc = N.new('ShaderNodeTexCoord')
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.06; ao.samples = 8
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 18 * scale; nz.inputs['Detail'].default_value = 5
    Lk(tc.outputs['Object'], nz.inputs['Vector'])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'; k.inputs[1].default_value = 0.35; Lk(nz.outputs['Fac'], k.inputs[0])
    Lk(ao.outputs['AO'], k.inputs[2])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    cr.elements[0].position = 0.3; cr.elements[0].color = (*lift(dark, gain), 1)
    cr.elements[1].position = 1.1; cr.elements[1].color = (*lift(light, gain), 1)
    e = cr.elements.new(0.75); e.color = (*lift(mid, gain), 1)
    Lk(k.outputs[0], ramp.inputs[0]); Lk(ramp.outputs[0], b.inputs['Base Color'])
    return m

def glow(name, color, strength, base=None, rough=0.3):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*mn.hex_rgb(base or color), 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb(color), 1); b.inputs['Emission Strength'].default_value = strength
    return m

# ---------------------------------------------------------------------------
# Scene graph helpers
# ---------------------------------------------------------------------------
def empty(name, loc=(0, 0, 0), parent=None):
    e = mn.link(bpy.data.objects.new(name, None)); e.location = loc
    if parent: attach(e, parent)
    return e

def attach(child, parent):
    """Parent keeping the child's world placement."""
    bpy.context.view_layer.update()
    child.parent = parent; child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child

def local(child, parent):
    """Parent with the child's transform read in the parent's space (for meshes built at the origin)."""
    child.parent = parent; child.matrix_parent_inverse = Matrix.Identity(4)
    return child

def apply_tf(o):
    o.data.transform(o.matrix_basis); o.matrix_basis = Matrix.Identity(4)
    return o

def cone_x(name, r0, r1, length, m, verts=16, x0=0.0, bevel=0.0):
    """Tapered cylinder along +X from x0 (radius r0) to x0 + length (radius r1)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r0, radius2=r1, depth=length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x0 + length / 2, 0, 0))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel: mn.bev(o, bevel)
    mn.assign(o, m); return mn.smooth(o)

def spike(name, r, h, m, verts=10):
    """Cone pointing +Z, base at the origin."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=0.0, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m); return mn.smooth(o)

def tube(name, pts, r, m, r_end=None, res=4):
    """Round (optionally tapering) tube through world points, converted to a mesh."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, (p, c) in enumerate(zip(sp.bezier_points, pts)):
        p.co = c; p.handle_left_type = p.handle_right_type = 'AUTO'
        if r_end is not None: p.radius = 1 + (r_end / r - 1) * i / (len(pts) - 1)
    o = mn.link(bpy.data.objects.new(name, cu)); mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return mn.smooth(o)

def capsule(name, r, z0, z1, x=0, y=0, m=None):
    """Vertical limb segment with round ends (crew.py's)."""
    h = abs(z1 - z0)
    o = mn.cyl(name, r, h, loc=(x, y, min(z0, z1)), m=m, verts=24, bevel=r * 0.7)
    o.modifiers['bevel'].segments = 4
    return o

def window(o, ry, rz, dz, keep_inside):
    """Delete a sphere's faces inside (or outside) an oval window on its front (+X) (crew.py's)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    def inside(f):
        c = f.calc_center_median()
        return c.x > 0.02 and (c.y / ry) ** 2 + ((c.z - dz) / rz) ** 2 < 1
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if inside(f) != keep_inside], context='FACES')
    bm.to_mesh(o.data); bm.free(); return mn.smooth(o)

def text_mesh(name, body, size, m, loc, rot=(0, 0, 0), extrude=0.002):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.extrude = extrude
    o = mn.link(bpy.data.objects.new(name, cu)); o.location = loc; o.rotation_euler = rot
    mn.assign(o, m)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return o

# ---------------------------------------------------------------------------
# Keyframing
# ---------------------------------------------------------------------------
class Keys:
    """Collects the posed objects and keys them on scene frames (frame_set first: see README)."""
    def __init__(self): self.movers = []; self.next = 1
    def add(self, *objs): self.movers.extend(objs)
    def key(self, pose_fn, *args):
        f = self.next; self.next += 1
        bpy.context.scene.frame_set(f)
        pose_fn(*args)
        for o in self.movers:
            o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f)
            o.keyframe_insert('scale', frame=f)
        return f
    def seq(self, pose_fn, args_list):
        return [self.key(pose_fn, *a) for a in args_list]

def linear_keys():
    """Constant interpolation: frames are separate poses, never in-betweens."""
    for o in bpy.context.scene.objects:
        ad = o.animation_data
        if not ad or not ad.action: continue
        try:
            for fc in ad.action.fcurves:
                for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'
        except AttributeError:                       # Blender 5 layered actions
            for layer in ad.action.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        for fc in cb.fcurves:
                            for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'

# ---------------------------------------------------------------------------
# 2-bone IK (alien legs): knee bends upwards, in the vertical plane through hip and foot
# ---------------------------------------------------------------------------
def leg_ik(hip, foot, A, B, knee_lift=0.0):
    """hip, foot: Vectors in root space. Returns (yaw, femur elevation, tibia elevation) in radians.
    knee_lift > 0 pushes the knee higher by treating the leg as slightly shorter-reach."""
    d3 = foot - hip
    h = math.hypot(d3.x, d3.y); v = d3.z
    yaw = math.atan2(d3.y, d3.x)
    d = min(math.hypot(h, v), (A + B) * 0.999); d = max(d, abs(A - B) + 1e-3)
    phi = math.atan2(v, h)
    ca = (A * A + d * d - B * B) / (2 * A * d); cb = (B * B + d * d - A * A) / (2 * B * d)
    a = phi + math.acos(max(-1, min(1, ca))); b = phi - math.acos(max(-1, min(1, cb)))
    return yaw, a, b

# ---------------------------------------------------------------------------
# Human rig (the crew's skeleton, shared by the pirate and Dr. Varga)
# Model faces +X (game right); +Y is the character's left.
# ---------------------------------------------------------------------------
HIP_Z = 0.40

class Human:
    def __init__(self, name):
        self.root = empty(name, (0, 0, 0))
        self.lie = empty('lie', (0, 0, 0), self.root)           # whole-body transform for lying down
        self.hips = empty('hips', (0, 0, HIP_Z), self.lie)
        self.torso = empty('torso', (0, 0, HIP_Z), self.hips)
        self.head = empty('head', (0.03, 0, 0.985), self.torso)
        self.arms, self.elbows, self.legs, self.knees, self.hands = {}, {}, {}, {}, {}
        for s in (-1, 1):
            y = s * 0.235
            sh = empty(f'shoulder{s}', (0.0, y, HIP_Z + 0.34), self.torso)
            el = empty(f'elbow{s}', (0.0, y + s * 0.01, HIP_Z + 0.19), sh)
            hd = empty(f'hand{s}', (0.01, y + s * 0.012, HIP_Z + 0.01), el)    # wrist: holds a gun / a sack
            self.arms[s], self.elbows[s], self.hands[s] = sh, el, hd
            ly = s * 0.085
            hp = empty(f'hip{s}', (0.0, ly, HIP_Z - 0.04), self.hips)
            kn = empty(f'knee{s}', (0.0, ly, 0.21), hp)
            self.legs[s], self.knees[s] = hp, kn
        self.keys = Keys()
        self.keys.add(self.lie, self.hips, self.torso, self.head, *self.arms.values(), *self.elbows.values(),
                      *self.hands.values(), *self.legs.values(), *self.knees.values())

LIE_SHIFT = 0.55    # lying down: the body's centre (not the feet) sits on the ground origin

def pose_human(R, kind='idle', t=0.0, arms_out=6, gait=1.0):
    """kind: idle | walk (t = phase 0..1, crew.py's cycle) | aim | carry (walk with t, left hand up on
    the shoulder) | stunned (t = sway phase) | down (lying on the back, head towards +X)."""
    for s in (-1, 1):
        R.arms[s].rotation_euler = (s * math.radians(-arms_out), 0, 0)
        R.elbows[s].rotation_euler = (0, math.radians(-12), 0)
        R.hands[s].rotation_euler = (0, 0, 0)
        R.legs[s].rotation_euler = (0, 0, 0); R.knees[s].rotation_euler = (0, 0, 0)
    R.lie.location = (0, 0, 0); R.lie.rotation_euler = (0, 0, 0)
    R.hips.location = (0, 0, HIP_Z); R.torso.rotation_euler = (0, 0, 0); R.head.rotation_euler = (0, 0, 0)
    if kind in ('walk', 'carry'):
        p = 2 * math.pi * t
        for s in (-1, 1):
            sw = math.sin(p) * s
            R.legs[s].rotation_euler = (0, -0.50 * sw * gait, 0)
            R.knees[s].rotation_euler = (0, 0.75 * gait * max(0.0, math.cos(p) * s) ** 1.2, 0)
            R.arms[s].rotation_euler = (s * math.radians(-arms_out), 0.55 * sw * gait, 0)
            R.elbows[s].rotation_euler = (0, math.radians(-15) - 0.25 * max(0.0, -sw), 0)
            R.hands[s].rotation_euler = (0, -0.55 * sw * gait + math.radians(15) + 0.25 * max(0.0, -sw), 0)   # keeps a held gun level
        R.hips.location.z = HIP_Z - 0.035 + 0.035 * abs(math.cos(p))
        R.torso.rotation_euler = (0, 0.06, -0.10 * math.sin(p))
        R.head.rotation_euler = (0, -0.04, 0.06 * math.sin(p))
        if kind == 'carry':                          # left hand up on the left shoulder, holding the sack
            R.arms[1].rotation_euler = (math.radians(-25), math.radians(-35), 0)
            R.elbows[1].rotation_euler = (0, math.radians(-150), 0)
            R.torso.rotation_euler = (math.radians(-6), 0.12, -0.06 * math.sin(p))   # leans under the weight
    elif kind == 'aim':                              # two-handed: gun up at shoulder height, feet apart
        R.arms[-1].rotation_euler = (math.radians(4), math.radians(-82), math.radians(-10))
        R.elbows[-1].rotation_euler = (0, math.radians(-8), 0)
        R.hands[-1].rotation_euler = (0, math.radians(82), 0)          # wrist: gun level, along the arm
        R.arms[1].rotation_euler = (math.radians(-2), math.radians(-60), math.radians(-38))
        R.elbows[1].rotation_euler = (0, math.radians(-40), 0)
        R.legs[-1].rotation_euler = (0, 0.18, 0); R.legs[1].rotation_euler = (0, -0.22, 0)
        R.knees[1].rotation_euler = (0, 0.12, 0)
        R.hips.location.z = HIP_Z - 0.02
        R.torso.rotation_euler = (0, 0.05, math.radians(14))           # blades the shoulders, gun arm forward
        R.head.rotation_euler = (0, 0.08, math.radians(-12))
    elif kind == 'stunned':                          # dazed: knees buckled, slumped, arms hanging, swaying
        sway = math.sin(2 * math.pi * t)
        for s in (-1, 1):
            R.arms[s].rotation_euler = (s * math.radians(-14), math.radians(-8), 0)
            R.elbows[s].rotation_euler = (0, math.radians(-6), 0)
            R.legs[s].rotation_euler = (s * math.radians(-4), -0.35, 0); R.knees[s].rotation_euler = (0, 0.7, 0)
        R.hips.location.z = HIP_Z - 0.07
        R.torso.rotation_euler = (math.radians(9) * sway, 0.42, 0.1 * sway)
        R.head.rotation_euler = (math.radians(-14) * sway, 0.35, 0)
    elif kind == 'down':                             # flat on the back, head towards +X, limbs sprawled
        R.lie.rotation_euler = (0, math.radians(-90), math.radians(180))
        R.lie.location = (-LIE_SHIFT, 0, 0.0)
        R.arms[-1].rotation_euler = (math.radians(55), math.radians(-15), 0)
        R.arms[1].rotation_euler = (math.radians(-35), math.radians(10), 0)
        R.elbows[-1].rotation_euler = (0, math.radians(-30), 0); R.elbows[1].rotation_euler = (0, math.radians(-55), 0)
        R.legs[-1].rotation_euler = (math.radians(10), math.radians(-35), 0); R.knees[-1].rotation_euler = (0, math.radians(70), 0)
        R.legs[1].rotation_euler = (math.radians(-12), 0, 0)
        R.head.rotation_euler = (math.radians(-18), math.radians(10), 0)

def lie_height(R, objs):
    """After posing 'down': lift the body so its lowest point touches the floor."""
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); zmin = 1e9
    for o in objs:
        if o.type != 'MESH' or o.hide_render: continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        for v in me.vertices: zmin = min(zmin, (ev.matrix_world @ v.co).z)
        ev.to_mesh_clear()
    return -zmin

# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def outline_only(objs, th):
    mn.outline([o for o in objs if o.type == 'MESH'], thickness=th)

def preview_setup(group):
    pv = os.environ.get('MN_PREVIEW')
    if pv:
        mn.OUT_DIR = f'/tmp/{group}_preview'; mn.MANIFEST = os.path.join(mn.OUT_DIR, 'manifest.json'); mn.SAMPLES = 16
    return pv

# ---------------------------------------------------------------------------
# Faces (crew.py's cartoon face: tilted up towards the camera, features oriented along the sphere)
# ---------------------------------------------------------------------------
class Face:
    def __init__(self, R, keep, center, radius=0.17, tilt=28):
        self.R, self.keep, self.c, self.r, self.tilt = R, keep, center, radius, math.radians(tilt)
        self.parts = []
    def at(self, az, el, out=0.0):
        az, el = math.radians(az), math.radians(el) + self.tilt
        d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        return self.c + d * (self.r + out), d
    def put(self, o, d, roll=0.0):
        q = d.to_track_quat('X', 'Z'); o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = q @ Matrix.Rotation(roll, 4, 'X').to_quaternion()
        self.keep(attach(o, self.R.head)); self.parts.append(o); return o
    def blob(self, name, m, size, az, el, out=0.0, roll=0.0, segs=16):
        p, d = self.at(az, el, out)
        return self.put(mn.sphere(name, 1.0, loc=p, m=m, scale=size, segs=segs), d, roll)
    def add(self, o):
        self.keep(attach(o, self.R.head)); self.parts.append(o); return o
    def curve(self, name, m, pts_azel, r=0.0065, out=0.001):
        """A thin dark line over the face through (az, el) points (mouths, scars)."""
        cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
        sp = cu.splines.new('POLY'); pts = [self.at(a, e, out)[0] for a, e in pts_azel]
        sp.points.add(len(pts) - 1)
        for pt, co in zip(sp.points, pts): pt.co = (*co, 1)
        tmp = mn.link(bpy.data.objects.new(name + 'Curve', cu)); bpy.context.view_layer.update()
        o = mn.link(bpy.data.objects.new(name, bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))))
        bpy.data.objects.remove(tmp); mn.assign(o, m); mn.smooth(o)
        return self.add(o)

def maybe_cpu():
    """MN_CPU=1: render on the CPU (when the shared GPU is busy or out of memory)."""
    if os.environ.get('MN_CPU'):
        bpy.context.scene.cycles.device = 'CPU'; bpy.context.scene.render.threads_mode = 'AUTO'
