"""The ship cat (js/decor.js cat(), CAT in js/ship.js; petted via petCat() in js/mission.js).

"Held together by duct tape, optimism and one very large cat": a big round orange tabby, curled up in
its corner of the reactor room. Built ~15 % bigger than the old 2D drawing (body 0.72 x 0.58 units, tail
ring 0.9 across) so it stays inside the pet target (r 0.55 around CAT).

Origin: CAT.x, CAT.y on the floor (the body's centre). Head to the right and a bit back, face towards
the camera, tail wrapped around the front.

Sprites (assets/sprites/props/):
  cat_sleep_f0..f7   breathing loop (decor.js: b = 1 + 0.04 sin(1.6 t), period 3.93 s -> 8 frames)
  cat_flick_f0..f5   the tail tip lifts and flicks (one-shot, play now and then over cat_sleep)
  cat_pet_f0..f5     luck.pet > 0: head up, happy ^^ eyes, rubbing its cheek, tail tip curling
  cat_stare          a fire within 7 units: wide awake, big yellow eyes with slit pupils, ears up
  cat_hide           an open breach anywhere: flattened into a fur pancake, two big round eyes
                     (the game draws this one 6 px = 0.125 units lower: origin at CAT.y + 0.125)
Hearts and the z-z-z stay runtime effects (text/particles).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from propslib import *

FUR, STRIPE, CREAM, PINK = '#e08a36', '#9c4a1a', '#f6e2bf', '#e88a8a'

def fur_mat(name, stripes=True, axis='X', scale=7.0, radial=False):
    """Orange tabby fur: soft sheen, darker wavy bands (along x, or around Z for the tail ring)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.72
    b.inputs['Sheen Weight'].default_value = 0.35; b.inputs['Sheen Roughness'].default_value = 0.4
    b.inputs['Sheen Tint'].default_value = (1.0, 0.85, 0.6, 1)
    base = (*lift(FUR, 1.2), 1); dark = (*lift(STRIPE, 1.1), 1)
    if not stripes:
        b.inputs['Base Color'].default_value = base; return m
    tc = N.new('ShaderNodeTexCoord')
    if radial:                                    # bands around the tail ring: angle around Z
        gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'RADIAL'; L(tc.outputs['Object'], gr.inputs['Vector'])
        mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = scale; L(gr.outputs['Fac'], mu.inputs[0])
        fr = N.new('ShaderNodeMath'); fr.operation = 'PINGPONG'; fr.inputs[1].default_value = 0.5; L(mu.outputs[0], fr.inputs[0])
        v = fr.outputs[0]; lo, hi = 0.3, 0.36
    else:
        wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = axis
        wv.inputs['Scale'].default_value = scale; wv.inputs['Distortion'].default_value = 2.0; wv.inputs['Detail'].default_value = 0.0
        L(tc.outputs['Object'], wv.inputs['Vector']); v = wv.outputs['Fac']; lo, hi = 0.62, 0.72
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi; L(v, mr.inputs['Value'])
    # stripes only on top: fade out towards the belly (object z)
    sep = N.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    zt = N.new('ShaderNodeMapRange'); zt.inputs['From Min'].default_value = -0.3; zt.inputs['From Max'].default_value = 0.6; L(sep.outputs[2], zt.inputs['Value'])
    k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; L(mr.outputs[0], k.inputs[0]); L(zt.outputs[0], k.inputs[1])
    k2 = N.new('ShaderNodeMath'); k2.operation = 'MULTIPLY'; k2.inputs[1].default_value = 0.85; L(k.outputs[0], k2.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[6].default_value = base; mx.inputs[7].default_value = dark
    L(k2.outputs[0], mx.inputs[0]); L(mx.outputs[2], b.inputs['Base Color'])
    return m

def cone(name, r, h, loc, m, scale=(1, 1, 1), rot=(0, 0, 0), segs=16, tip=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=tip, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.scale = scale; o.rotation_euler = rot
    mn.bev(o, min(0.02, r * 0.3), 2); mn.assign(o, m); mn.smooth(o); return o

def arc_pts(cx, cy, r, a0, a1, z, n=24, zf=None):
    """Game-local arc (canvas angles: clockwise on screen), as Blender points."""
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        out.append(Vector((cx + math.cos(a) * r, -(cy + math.sin(a) * r), zf(i / n) if zf else z)))
    return out

def poly_tube(name, P, r, m):
    return pipe(name, [tuple(p) for p in P], r, m, corner=0.0)

def build(state):
    k = Kit()
    M = dict(fur=fur_mat('fur', scale=1.5), furtail=fur_mat('furtail', radial=True, scale=9.0), furhead=fur_mat('furhead', axis='X', scale=2.2),
             cream=plain('cream', CREAM, 0.75, sheen=0.5), pink=plain('pink', PINK, 0.5), nose=plain('nose', '#d86a72', 0.35, coat=0.4),
             ink=plain('ink', '#1a1410', 0.4), eye=plain('eye', '#ffd24a', 0.15, coat=1.0, emit='#ffcf40', emit_strength=0.35),
             pupil=plain('pupil', '#120c08', 0.2, coat=1.0), shine=plain('shine', '#ffffff', 0.2, emit='#ffffff', emit_strength=1.0),
             whisker=plain('whisker', '#f4f0e8', 0.4), collar=plain('collar', '#c0392b', 0.45, gain=1.2),
             tag=plain('tag', '#d8b04a', 0.25, metal=0.9), paw=plain('paw', '#f8ecd6', 0.75, sheen=0.4))
    h = {}
    hide = state == 'hide'
    if hide:
        # flattened into a fur pancake, only the ears and two big round eyes showing (origin offset by the caller)
        body = k(mn.sphere('body', 1, loc=(0, 0, 0.1), m=M['fur'], scale=(0.34, 0.2, 0.14)))
        k(mn.sphere('fluff', 1, loc=(-0.12, 0.03, 0.12), m=M['fur'], scale=(0.2, 0.14, 0.1)))
        k(mn.sphere('fluff2', 1, loc=(0.13, 0.04, 0.12), m=M['fur'], scale=(0.18, 0.13, 0.1)))
        for s in (-1, 1):
            k(cone('ear', 0.075, 0.12, (s * 0.15, 0.04, 0.16), M['fur'], scale=(1, 0.5, 1), rot=(-0.2, s * 0.85, 0)))
            k(cone('earin', 0.05, 0.085, (s * 0.15, 0.025, 0.165), M['pink'], scale=(1, 0.3, 1), rot=(-0.2, s * 0.85, 0)), outline=False)
            k(mn.sphere('eye', 0.06, loc=(s * 0.08, -0.13, 0.19), m=M['eye'], scale=(1, 0.7, 1)))
            k(mn.sphere('pupil', 0.04, loc=(s * 0.08, -0.166, 0.192), m=M['pupil'], scale=(1, 0.5, 1.05)))
            k(mn.sphere('shine', 0.013, loc=(s * 0.08 - 0.016, -0.186, 0.214), m=M['shine']), outline=False)
        k(mn.sphere('tailtip', 1, loc=(0.28, -0.12, 0.06), m=M['furtail'], scale=(0.1, 0.06, 0.05)))
        h['body'] = body
        return k, h

    # --- body: a big loaf, curled
    body = k(mn.sphere('body', 1, loc=(-0.03, 0.02, 0.18), m=M['fur'], scale=(0.37, 0.3, 0.2)))
    haunch = k(mn.sphere('haunch', 1, loc=(-0.19, 0.06, 0.2), m=M['fur'], scale=(0.19, 0.21, 0.17)))
    chest = k(mn.sphere('chest', 1, loc=(0.17, -0.1, 0.14), m=M['cream'], scale=(0.16, 0.15, 0.12)))
    h['body'] = body; h['breath'] = [body, haunch, chest]
    # front paws tucked forward, under the chin
    for px, py in ((0.1, -0.27), (0.25, -0.25)):
        k(mn.sphere('paw', 1, loc=(px, py, 0.05), m=M['paw'], scale=(0.06, 0.075, 0.045)))
    k(mn.sphere('foot', 1, loc=(-0.31, -0.17, 0.05), m=M['paw'], scale=(0.085, 0.065, 0.045)))   # back foot at the rear

    # --- tail hugging the front (from the rear, round the bottom, tip near the paws)
    def tz(u): return 0.075 + 0.015 * math.sin(u * math.pi)
    TR, TC = 0.37, (-0.03, 0.0)
    base_pts = arc_pts(TC[0], TC[1], TR, math.radians(200), math.radians(100), 0, n=20, zf=tz)
    k(poly_tube('tail', base_pts, 0.07, M['furtail']))
    a0 = math.radians(100); pv = Vector((TC[0] + math.cos(a0) * TR, -(TC[1] + math.sin(a0) * TR), tz(1.0)))
    pivot = mn.link(bpy.data.objects.new('tailpivot', None)); pivot.location = pv
    tip_pts = [p - pv for p in arc_pts(TC[0], TC[1], TR, a0, math.radians(62), 0, n=10, zf=lambda u: tz(1.0))]
    tip = k(poly_tube('tailtip', tip_pts, 0.066, M['furtail'])); tip.parent = pivot
    tipw = k(mn.sphere('tailwhite', 0.064, loc=tip_pts[-1], m=M['furtail'], scale=(1, 1, 0.95))); tipw.parent = pivot
    h['tailpivot'] = pivot
    k.parts.append(pivot)

    # --- head on a pivot (neck), face towards the camera; features placed on the head's surface
    hp = mn.link(bpy.data.objects.new('headpivot', None)); hp.location = (0.2, -0.06, 0.2)
    k.parts.append(hp); h['head'] = hp
    def H(o, ol=True): k(o, ol); o.parent = hp; return o
    hz = 0.11 if state in ('sleep', 'flick') else 0.17
    RX, RY, RZ = 0.2, 0.18, 0.165
    def S(az, el, out=0.0):
        """Point on the head ellipsoid: az = degrees right of the face centre, el = degrees up."""
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        p = Vector((d.x * RX, d.y * RY, d.z * RZ)); n = Vector((d.x / RX, d.y / RY, d.z / RZ)).normalized()
        return p + n * out + Vector((0, 0, hz))
    H(mn.sphere('head', 1, loc=(0, 0, hz), m=M['furhead'], scale=(RX, RY, RZ)))
    for s in (-1, 1):
        H(mn.sphere('cheek', 1, loc=S(s * 48, -28, -0.02), m=M['furhead'], scale=(0.075, 0.07, 0.065)))
    # muzzle, nose, chin, whiskers
    for s in (-1, 1):
        H(mn.sphere('pad', 1, loc=S(s * 13, -26, -0.012), m=M['cream'], scale=(0.042, 0.035, 0.034)))
        for j in range(3):
            p0 = S(s * 20, -24 + j * 5, -0.01)
            H(poly_tube('whisker', [p0, p0 + Vector((s * 0.12, -0.02, -0.025 + j * 0.022))], 0.004, M['whisker']), ol=False)
    H(mn.sphere('chin', 1, loc=S(0, -45, -0.01), m=M['cream'], scale=(0.035, 0.03, 0.025)))
    H(mn.sphere('nose', 1, loc=S(0, -12, 0.004), m=M['nose'], scale=(0.022, 0.014, 0.014)))
    # ears
    ear_rot = {'sleep': 0.45, 'flick': 0.45, 'pet': 0.75, 'stare': 0.15}[state]
    for s in (-1, 1):
        p = S(s * 42, 52, -0.03)
        H(cone('ear', 0.07, 0.13, p, M['furhead'], scale=(1, 0.5, 1), rot=(-0.25, s * ear_rot, 0)))
        H(cone('earin', 0.047, 0.095, p + Vector((0, -0.012, 0.004)), M['pink'], scale=(1, 0.3, 1), rot=(-0.25, s * ear_rot, 0)), ol=False)
    # eyes
    for s in (-1, 1):
        c = S(s * 30, 8, 0.0)
        if state == 'stare':
            H(mn.sphere('eye', 1, loc=c, m=M['eye'], scale=(0.045, 0.03, 0.05)))
            H(mn.box('slit', (0.013, 0.01, 0.07), loc=c + Vector((0, -0.028, -0.035)), m=M['pupil'], bevel=0.005))
            H(mn.sphere('shine', 0.011, loc=c + Vector((-0.014, -0.03, 0.022)), m=M['shine']), ol=False)
        else:
            up = state == 'pet'                       # happy '^' when petted, sleepy 'u' otherwise
            pts = []
            for i in range(9):
                t = math.pi * i / 8
                q = S(s * 30 + 14 * math.cos(t), 8 + (1 if up else -1) * 9 * math.sin(t) + (-4 if up else 3), 0.004)
                pts.append(q)
            H(poly_tube('lid', pts, 0.008, M['ink']), ol=False)
    # collar with a brass tag under the chin
    H(ring('collar', 0.13, 0.022, 0.032, loc=(0, 0.01, hz - 0.15), m=M['collar'], rot=(-0.3, 0, 0)))
    H(cone('tag', 0.024, 0.008, S(0, -62, 0.02), M['tag'], rot=(math.radians(70), 0, 0), segs=6))
    hp.rotation_euler = (-0.25, 0, 0.12)
    return k, h

def head_pose(h, f, rx=0.0, ry=0.0, rz=0.0):
    hp = h['head']; hp.rotation_euler = (rx, ry, rz); hp.keyframe_insert('rotation_euler', frame=f)

@job('cat_sleep')
def cat_sleep():
    k, h = build('sleep'); k.outline(0.013)
    F = list(range(1, 9))
    for i, f in enumerate(F):
        bpy.context.scene.frame_set(f)
        b = 1 + 0.04 * math.sin(math.tau * i / len(F))
        for o in h['breath']:
            if 's0' not in o: o['s0'] = tuple(o.scale)
            s0 = o['s0']; o.scale = (s0[0] * b, s0[1] * b, s0[2] * (1 + 0.06 * math.sin(math.tau * i / len(F))))
            o.keyframe_insert('scale', frame=f)
        head_pose(h, f, rx=-0.25 - 0.04 * math.sin(math.tau * i / len(F)), rz=0.12)
    place(k, 'cat_sleep', frames=F)

@job('cat_flick')
def cat_flick():
    k, h = build('flick'); k.outline(0.013)
    F = list(range(1, 7)); lift_ = [0.0, 0.5, 0.9, 0.6, 0.9, 0.2]; wag = [0.0, 0.15, -0.25, 0.3, -0.1, 0.0]
    for i, f in enumerate(F):
        bpy.context.scene.frame_set(f)
        p = h['tailpivot']; p.rotation_euler = (lift_[i] * 0.6, -lift_[i] * 0.5, wag[i]); p.keyframe_insert('rotation_euler', frame=f)
    place(k, 'cat_flick', frames=F)

@job('cat_pet')
def cat_pet():
    k, h = build('pet'); k.outline(0.013)
    F = list(range(1, 7))
    for i, f in enumerate(F):
        bpy.context.scene.frame_set(f)
        u = math.tau * i / len(F)
        head_pose(h, f, rx=-0.45 - 0.06 * math.sin(2 * u), ry=0.25 * math.sin(u), rz=0.12 + 0.12 * math.sin(u))   # cheek rubs, chin up
        p = h['tailpivot']; p.rotation_euler = (0.5 + 0.2 * math.sin(u), -0.3, 0.25 * math.sin(u + 1)); p.keyframe_insert('rotation_euler', frame=f)
    place(k, 'cat_pet', frames=F)

@job('cat_stare')
def cat_stare():
    k, h = build('stare'); k.outline(0.013)
    h['head'].rotation_euler = (-0.35, 0, 0.2)
    p = h['tailpivot']; p.rotation_euler = (0.4, -0.3, 0.2)
    place(k, 'cat_stare')

@job('cat_hide')
def cat_hide():
    k, h = build('hide'); k.outline(0.013)
    place(k, 'cat_hide')

if __name__ == '__main__':
    run()
