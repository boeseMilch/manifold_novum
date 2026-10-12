"""Leeches (js/organic.js: spawnLeeches, updateOrganic, drawOrganicWorld).

A fat ringed worm, sized like the game draws it (1.7x scale: ~1.9 long, ~0.65 thick at the head),
dark wet red with pale belly rings, a row of lime glow-spots along its back, and a round sucker mouth
full of hooked teeth around a glowing throat.

Sprites (build/renders/organic/), origin = (l.x, l.y) = the head (the game's segment 0 centre):
  leech_fly_d<i>_f<j>       i = 0..15 heading (game angle i * 22.5 deg, 0 = right, 4 = down), j = 0..5
                            wriggle loop (period ~0.8 s: the game's sin(l.t * 8)). Pick i from the game's
                            `ang` = atan2(ty - y, tx - x) while flying.
  leech_latched_d<i>_f<j>   i = 0 facing right (port side: the hull is to its right), i = 1 facing left
                            (starboard). j = 0..5: latched on, sucking (a swallowing pulse runs up to
                            the head, ~0.7 s: the game's sin(l.t * 9)); the mouth is pressed flat against
                            the hull just in front of the origin.
The slime trail stays procedural (the game's fading dots); the chew ring and job marker too.

    blender -b --factory-startup --python tools/blender/models/organic/leech.py [-- quick] [fly|latched]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector, Matrix
import mn
import orglib as O

K = 1.7 / 48                                    # game pixels (at its 1.7x leech scale) -> units
F = list(range(1, 7))
Z0 = 0.0                                        # body centre height (it floats; origin = the head)

def mats():
    return dict(
        skin=O.flesh('leech_skin', '#8a2a3a', '#d8687a', c2='#3a0a18', veins='#ff8a9a', vein_k=0.25, scale=3.0,
                     rough=0.3, coat=0.9, sss=0.35, sss_col=(1.0, 0.25, 0.2), bump=0.5, belly='#e0a0a0', belly_axis=(0, 0, -1), belly_k=0.6),
        lip=O.flesh('leech_lip', '#6a1a2a', '#b04a5a', c2='#200408', scale=6, coat=0.9, sss=0.3, veins='#ff8a9a', vein_k=0.3),
        throat=O.glossy_glow('leech_throat', '#140204', '#ff3a1a', 0.9, rough=0.5, coat=0.0, veins=None),
        tooth=O.plain('leech_tooth', '#f0e8d0', 0.3, coat=0.6),
        spot=O.emit_mat('leech_spot', '#c8ff6e', 1.3, base='#c8ff6e'),
    )

def spine(phase, latched, n=120):
    """Body centreline from the mouth (+x) to the tail, as (point, radius) pairs. Unit-length-ish, wriggling."""
    pts, rad = [], []
    x_head, x_tail = 0.36, -1.44
    for j in range(n):
        u = j / (n - 1)                              # 0 = mouth end, 1 = tail
        x = x_head + (x_tail - x_head) * u
        if latched:                                  # stuck on: little sideways sway, the body arches up behind the head
            y = math.sin(phase + u * 2.5) * 0.05 * u
            z = Z0 + math.sin(u * math.pi) ** 1.5 * 0.16
            pulse = 1 + 0.13 * max(0, math.sin(phase * 1 + u * 7.0)) * (1 - u * 0.3)
        else:                                        # flying: a travelling S-wave, bigger towards the tail
            y = math.sin(phase - u * 5.0) * (0.05 + 0.16 * u)
            z = Z0 + math.sin(phase * 1 - u * 4.0 + 1.0) * 0.04 * u
            pulse = 1
        # the game's fat head tapering to the tail (rx 11 -> 4.6, ry 9 -> 3.8 px at 1.7x)
        base = (9.2 - 5.2 * u ** 1.3) * K * 1.02
        if u < 0.08: base *= 0.82 + 0.18 * (u / 0.08)       # the neck behind the sucker
        if u > 0.9: base *= math.sqrt(max(0.0, 1 - ((u - 0.9) / 0.1) ** 2)) * 0.85 + 0.15   # a rounded tail end
        ring = 1 + 0.045 * math.cos(u * 22 * math.tau / 2) ** 2       # annuli: the ringed look
        pts.append((x, y, z)); rad.append(base * ring * pulse)
    return pts, rad

def leech(name, phase, latched, M):
    pts, rad = spine(phase, latched)
    body = O.tube(name + '_body', pts, rad, m=M['skin'], res=1, segs=20)
    objs = [body]
    hx, hy, hz = pts[0]
    # the sucker mouth: a fleshy rim facing forward and a bit up (so it shows from above), throat, teeth
    tilt = math.radians(-12 if latched else -35)          # (rotation about y: the face tips up)
    R = 6 * K * (1.15 if latched else 1.0)
    face = Matrix.Translation((hx + 0.03, hy, hz)) @ Matrix.Rotation(math.pi / 2 + tilt, 4, 'Y')
    ring = [((math.cos(a) * R * 0.95, math.sin(a) * R * 0.95, 0), R * 0.42, (1, 1, 0.75)) for a in (k / 14 * math.tau for k in range(14))]
    lipo = O.blob(name + '_lip', ring + [((0, 0, -R * 0.45), R * 0.8, (1, 1, 0.5))], m=M['lip'], res=R * 0.06)
    lipo.matrix_world = face; O.apply_tf(lipo); objs.append(lipo)
    thr = mn.sphere(name + '_throat', R * 0.75, loc=(0, 0, 0), m=M['throat'], scale=(1, 1, 0.2), segs=24)
    thr.matrix_world = face @ Matrix.Translation((0, 0, -R * 0.12)); O.apply_tf(thr); objs.append(thr)
    for ring_r, nt, s in ((0.78, 14, 0.4), (0.48, 9, 0.3)):          # two rings of hooked teeth on the lip, pointing in
        for k in range(nt):
            a = k / nt * math.tau + ring_r * 3
            t = mn.cyl(name + '_tooth', R * 0.12, R * s, loc=(0, 0, 0), m=M['tooth'], verts=8, bevel=0.0)
            for v in t.data.vertices:                # a cone, hooking inwards
                k2 = v.co.z / (R * s); v.co.x *= (1 - k2); v.co.y *= (1 - k2); v.co.x -= k2 * k2 * R * 0.18
            t.matrix_world = face @ Matrix.Translation((math.cos(a) * R * ring_r, math.sin(a) * R * ring_r, R * 0.12)) @ \
                Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.5, 4, 'Y')
            O.apply_tf(t); objs.append(t)
    # glow spots along the back: pairs on every second ring
    for j in range(18, 100, 16):
        p = Vector(pts[j]); r = rad[j]
        for sd in (-1, 1):
            objs.append(mn.sphere(name + '_spot', r * 0.1, loc=p + Vector((0, sd * r * 0.42, r * 0.88)), m=M['spot'], scale=(1, 1, 0.5), segs=10))
    return objs

def build_frames(latched, M):
    sets = []
    for f in F:
        ph = (f - 1) / len(F) * math.tau
        objs = leech(f'leech{f}', ph, latched, M)
        mn.outline([o for o in objs if '_spot' not in o.name and '_throat' not in o.name and '_tooth' not in o.name], thickness=0.013)
        sets.append(objs)
    scene = bpy.context.scene
    for f in F:
        scene.frame_set(f)
        for j, objs in enumerate(sets):
            for o in objs: o.hide_render = j != f - 1; o.keyframe_insert('hide_render', frame=f)
    allo = [o for s in sets for o in s]
    root = mn.group('leech', allo)
    return allo, root

def render(which):
    if 'fly' in which:
        mn.reset(); M = mats()
        allo, root = build_frames(False, M)
        mn.render('organic/leech_fly' + ('_test' if 'test' in which else ''), objs=allo, root=root, dirs=4 if 'test' in which else 16, frames=F[:1] if 'test' in which else F)
    if 'latched' in which:
        mn.reset(); M = mats()
        allo, root = build_frames(True, M)
        mn.render('organic/leech_latched', objs=allo, root=root, dirs=2, frames=F)

if __name__ == '__main__':
    T = time.time()
    sel = [a for a in O.ARGS if a not in ('quick', 'cpu')] or ['fly', 'latched']
    render(sel)
    print(f'[leech] total {time.time() - T:.1f}s')
