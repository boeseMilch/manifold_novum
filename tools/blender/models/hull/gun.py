"""Our ship's three cannons (js/art.js drawGun / drawCover, GUNS in js/ship.js, jams in js/eva.js).

The round mount (pedestal, bolt ring, the front gun's sponson) is part of the hull body (body.py): it never
moves. Everything here rotates with the aim and is drawn on top of it, origin = the gun's pivot (g.x, g.y)
on the deck plane; modelled facing +x (game angle 0), dir i faces game angle i * 360 / DIRS (0 = right,
90 = down), the same convention as g.aim in the game.

Sprites (build/renders/hull/):
  gun_d<i>            the turret: armoured head, barrel, muzzle brake, the gunner's grips at the back
  gun_fire_d<i>       firing: barrel recoiled, muzzle brake glowing, the muzzle flash (beauty pass only: the
                      normal/height passes leave the flash out); blend towards it by g.flash
  gun_broken_d<i>     broken (SYSTEMS 'cannon' broken): barrel drooped and kinked, scorched head, a panel
                      hanging off, sparking wires
  cover_k<1..3>_d<i>  the cover plate rising in front of the gun (drawCover, k = 1/3, 2/3, 1), DIRS_COVER dirs,
                      origin = the pivot; it is a ring sector at radius 1.13..1.35 around the aim direction
  jam_<id>            debris wedged in a cannon's track (evs.jams[id]), origin = JAM_SPOTS[id]

    blender -b --factory-startup --python tools/blender/models/hull/gun.py [-- quick] [-- only=gun,fire,broken,cover,jam]
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hulllib import *

ARGS = args()
QUICK = 'quick' in ARGS
ONLY = next((a.split('=')[1].split(',') for a in ARGS if a.startswith('only=')), None)
if QUICK: mn.SAMPLES = 16
DIRS = 4 if QUICK else 48
DIRS_COVER = 4 if QUICK else 32
Z0 = 0.14                              # top of the mount (body.py)
BZ = 0.40                              # barrel axis height

def want(k): return ONLY is None or k in ONLY

def mats():
    return dict(
        head=worn('head', '#9aa4b7', 0.42, 0.25, wear=0.8),
        head2=worn('head2', '#6a7383', 0.45, 0.3, wear=0.6),
        gun=worn('gunmetal', '#4a515e', 0.4, 0.4, wear=0.6),
        dark=worn('dark', '#2b303a', 0.5, 0.3, wear=0.4),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        black=mn.mat('black', '#0b0c0f', 0.9),
        rubber=mn.mat('rubber', 'rubber', 0.7),
        hazard=hazard_mat('hazard', 7.0),
        tape=tape_mat(),
        glass=glass_mat('sight_glass', '#ffb050', 0.8),
        char=worn('char', '#3a3532', 0.85, 0.3, wear=0.5, grime=1.4),
        burnt=worn('burnt', '#6a6e76', 0.6, 0.25, wear=1.0, grime=2.0),
        scorch=scorch_mat('scorch'),
        copper=mn.mat('copper', 'copper', 0.35, 1.0),
        ember=emit_mat('ember', '#ff7a2a', 1.5, base='#401008'),
        hot=emit_mat('hot', '#ff8a3a', 1.2, base='#7a3010'),
        flash=glow('flash', '#ffd25a', 1.4),
        flash2=glow('flash2', '#ff6a00', 1.1),
        halo=halo_mat('halo', '#ff9a40', 1.2, 0.6),
        ammo=worn('ammo', '#6a6a3a', 0.5, 0.2, wear=0.8),
    )

def xcyl(name, r, x0, x1, z, m, y=0.0, verts=24, bevel=0.01, r1=None):
    """Cylinder along +x from x0 to x1 (Blender local coords), axis at (y, z)."""
    o = mn.cyl(name, r, x1 - x0, loc=(x0, y, z), m=m, verts=verts, bevel=bevel, rot=(0, math.radians(90), 0))
    if r1 is not None:
        for v in o.data.vertices:
            k = v.co.z / (x1 - x0); s = (r + (r1 - r) * k) / r; v.co.x *= s; v.co.y *= s
    return o

def lprism(name, pts, z0, z1, m, bevel=0.02, inset=0.0, chamfer=0.0):
    """prism() in Blender-local coords (pts as (x, y_blender))."""
    return prism(name, [(x, -y) for x, y in pts], z0, z1, m, bevel=bevel, inset=inset, chamfer=chamfer)

def build_turret(M, state='ok'):
    """Returns (parts, barrel_parts, extra) in Blender local coords, facing +x."""
    parts, barrel, fx = [], [], []
    P = parts.append
    # turntable
    P(mn.cyl('turntable', 0.44, 0.08, loc=(0, 0, Z0 - 0.02), m=M['gun'], verts=40, bevel=0.02))
    P(ring('turn_ring', 0.45, 0.05, 0.03, loc=(0, 0, Z0 + 0.05), m=M['dark'], verts=40))
    # head: chunky armoured block, sloped front, light paint
    hp = [(-0.36, -0.26), (-0.3, -0.31), (0.16, -0.31), (0.3, -0.18), (0.3, 0.18), (0.16, 0.31), (-0.3, 0.31), (-0.36, 0.26)]
    head = lprism('head', hp, Z0 + 0.04, Z0 + 0.46, M['burnt'] if state == 'broken' else M['head'], bevel=0.03, inset=0.06, chamfer=0.08)
    P(head)
    P(lprism('head_skirt', [(x * 1.04, y * 1.04) for x, y in hp], Z0 + 0.02, Z0 + 0.12, M['head2'], bevel=0.02))
    top = Z0 + 0.46
    # hazard band across the back of the roof, armour plate, sight periscope
    P(mn.box('haz', (0.09, 0.44, 0.012), loc=(-0.22, 0, top - 0.003), m=M['hazard'], bevel=0.003))
    P(lprism('roof_plate', [(-0.12, -0.17), (0.12, -0.17), (0.16, -0.1), (0.16, 0.1), (0.12, 0.17), (-0.12, 0.17)], top - 0.01, top + 0.025, M['head2'], bevel=0.01))
    P(mn.cyl('sight_base', 0.1, 0.05, loc=(0.02, 0, top + 0.02), m=M['dark'], verts=24, bevel=0.015))
    sight = mn.sphere('sight', 0.075, loc=(0.02, 0, top + 0.065), m=M['char'] if state == 'broken' else M['glass'], scale=(1, 1, 0.6), segs=20)
    P(sight)
    for sy in (-1, 1):                                                   # roof bolts
        for x in (-0.12, 0.12):
            P(mn.sphere('bolt', 0.018, loc=(x, sy * 0.2, top + 0.005), m=M['steel'], scale=(1, 1, 0.5), segs=8))
    # gunner's grips at the back (the gunner sits 0.75 behind the pivot)
    for sy in (-1, 1):
        P(xcyl('grip_arm', 0.022, -0.5, -0.32, Z0 + 0.3, M['steel'], y=sy * 0.2, verts=10, bevel=0.005))
        P(mn.cyl('grip', 0.035, 0.16, loc=(-0.5, sy * 0.2, Z0 + 0.22), m=M['rubber'], verts=12, bevel=0.01))
    P(mn.box('trigger_bar', (0.03, 0.4, 0.03), loc=(-0.5, 0, Z0 + 0.36), m=M['steel'], bevel=0.008))
    # ammo box on the left side (game: -y side when facing +x), feed chute into the head
    P(mn.box('ammo', (0.32, 0.14, 0.2), loc=(-0.08, 0.38, Z0 + 0.04), m=M['ammo'], bevel=0.02))
    P(mn.box('ammo_lid', (0.34, 0.15, 0.025), loc=(-0.08, 0.38, Z0 + 0.24), m=M['head2'], bevel=0.008))
    P(label('ammo_txt', 'AMMO', 0.06, (-0.08, 0.38, Z0 + 0.267), m=pmat('stencil', '#e8e4d0', 0.6)))
    if state != 'broken':
        P(mn.box('tape', (0.06, 0.2, 0.012), loc=(0.22, -0.18, top - 0.03), m=M['tape'], bevel=0.003, rot=(0, 0, 0.5)))
    # barrel: mantlet, sleeve, barrel with bands, muzzle brake
    B = barrel.append
    B(mn.box('mantlet', (0.22, 0.3, 0.24), loc=(0.32, 0, BZ - 0.12), m=M['head2'], bevel=0.04))
    B(xcyl('sleeve', 0.12, 0.38, 0.6, BZ, M['gun'], bevel=0.015))
    B(xcyl('barrel', 0.1, 0.58, 0.9, BZ, M['steel']))
    for bx in (0.62, 0.74):
        B(xcyl('band', 0.11, bx, bx + 0.035, BZ, M['dark'], bevel=0.006))
    B(xcyl('haz_band', 0.105, 0.79, 0.85, BZ, M['hazard'], bevel=0.0))
    B(xcyl('brake', 0.15, 0.86, 1.02, BZ, M['hot'] if state == 'fire' else M['gun'], verts=8, bevel=0.02))
    for k in range(2):
        B(xcyl('brake_slot', 0.152, 0.9 + k * 0.05, 0.92 + k * 0.05, BZ, M['black'], verts=8, bevel=0.0))
    B(xcyl('bore', 0.055, 1.015, 1.03, BZ, M['black'], bevel=0.0))
    if state == 'fire':
        for o in barrel: o.location.x -= 0.12                           # recoil (game: flash * 6 px)
        # muzzle flash: a hot core, petals out front and to the sides, a soft halo (beauty pass only)
        fx.append(mn.sphere('flash_core', 0.1, loc=(1.06, 0, BZ), m=M['flash'], scale=(1.4, 1, 0.9), segs=20))
        for a, L, r in ((0, 0.5, 0.1), (1.0, 0.26, 0.055), (-1.0, 0.26, 0.055), (0.45, 0.34, 0.07), (-0.45, 0.34, 0.07)):
            o = xcyl('petal', r, 0.0, L, 0.0, M['flash2'], verts=12, bevel=0.0, r1=0.005)
            apply_tf(o); o.data.transform(__import__('mathutils').Matrix.Rotation(a, 4, 'Z'))
            o.location = (1.0, 0, BZ); fx.append(o)
        h = disc('flash_halo', 0, 0, 0, 1.0, M['halo']); h.location = (1.15, 0, BZ + 0.15); h.scale = (0.5, 0.5, 1)
        fx.append(h)
    if state == 'broken':
        # barrel drooped and kinked: tilt everything after the mantlet nose-down around the mantlet
        from mathutils import Matrix
        tilt = Matrix.Translation((0.42, 0, BZ)) @ Matrix.Rotation(math.radians(14), 4, 'Y') @ Matrix.Rotation(math.radians(-9), 4, 'Z') @ Matrix.Translation((-0.42, 0, -BZ))
        for o in barrel:
            if o.name.startswith('mantlet'): continue
            apply_tf(o); o.data.transform(tilt)
            if o.name.startswith(('brake', 'band')): mn.assign(o, M['char'])
        fx_b = []
        fx_b.append(disc('soot', 0.0, 0.0, 0.0, 1.0, M['scorch']))
        fx_b[-1].location = (0.05, 0.05, top + 0.035); fx_b[-1].scale = (0.32, 0.26, 1)
        panel = mn.box('panel_loose', (0.26, 0.02, 0.2), loc=(0, 0, 0), m=M['head'], bevel=0.008)
        panel.location = (-0.05, -0.36, Z0 + 0.1); panel.rotation_euler = (math.radians(-35), math.radians(10), 0.15)
        parts.append(panel)
        for k, (ex, ey) in enumerate(((-0.02, -0.4), (0.06, -0.38))):
            parts.append(tube('wire', [(-0.02 + 0.03 * k, 0.3, Z0 + 0.3), (ex, -ey + 0.06, Z0 + 0.22), (ex + 0.05, -ey + 0.12, Z0 + 0.12)], 0.012,
                              M['copper'] if k else pmat('wire_red', '#c0392b', 0.6)))
        parts.append(mn.sphere('spark', 0.03, loc=(0.06, -0.48, Z0 + 0.13), m=M['ember'], segs=10))
        parts.append(mn.sphere('spark2', 0.02, loc=(0.0, -0.46, Z0 + 0.13), m=M['ember'], segs=8))
        parts += fx_b
    return parts, barrel, fx

def outline_parts(objs):
    skip = ('bolt', 'haz', 'tape', 'brake_slot', 'bore', 'ammo_txt', 'flash', 'petal', 'soot', 'spark', 'wire', 'sight')
    mn.outline([o for o in objs if not o.name.startswith(skip)], thickness=0.014)

def render_turret(state):
    mn.reset(); M = mats()
    parts, barrel, fx = build_turret(M, state)
    allp = parts + barrel + fx
    outline_parts(parts + barrel)
    root = mn.group('turret', allp)
    name = {'ok': 'hull/gun', 'fire': 'hull/gun_fire', 'broken': 'hull/gun_broken'}[state]
    t0 = time.time()
    if state == 'fire':
        mn.render(name, objs=allp, root=root, dirs=DIRS, passes=('beauty',))
        show(fx, False)
        mn.render(name, objs=allp, root=root, dirs=DIRS, passes=('normal', 'height'))
    else:
        mn.render(name, objs=allp, root=root, dirs=DIRS)
    manifest_patch(name, {'origin': 'gun pivot (GUNS[i].x, y) on the deck; dir i faces game angle i*360/dirs (= g.aim)'})
    print(f'[gun] {state}: {time.time() - t0:.1f}s')

# ---------------------------------------------------------------------------------------------------------
# Cover plate (drawCover): ring sector radius 1.13 .. 1.35, half angle 0.95 k around the aim, rising with k
# ---------------------------------------------------------------------------------------------------------
def render_cover():
    R1, R0, H = 1.35, 1.13, 0.62
    for ki, k in enumerate((1 / 3, 2 / 3, 1.0)):
        mn.reset(); M = mats()
        steel = worn('cover', '#a9b2c0', 0.4, 0.4, wear=0.9)
        parts = []
        half = 0.95 * k
        n = 5
        h = H * (0.45 + 0.55 * k)
        for j in range(n):                                       # five slats, telescoping out of the middle
            a0 = -half + j * 2 * half / n; a1 = a0 + 2 * half / n
            seg = 10
            outer = [(math.cos(a0 + (a1 - a0) * i / seg) * R1, math.sin(a0 + (a1 - a0) * i / seg) * R1) for i in range(seg + 1)]
            inner = [(math.cos(a1 - (a1 - a0) * i / seg) * R0, math.sin(a1 - (a1 - a0) * i / seg) * R0) for i in range(seg + 1)]
            hj = h * (1.0 - 0.06 * abs(j - 2))
            parts.append(lprism(f'slat{j}', outer + inner, -0.05, hj, steel, bevel=0.015, inset=0.015, chamfer=0.02))
            am = (a0 + a1) / 2
            for zz in (0.1, hj - 0.1):                             # rivets on the outer face
                parts.append(mn.sphere('rivet', 0.02, loc=(math.cos(am) * (R1 + 0.005), math.sin(am) * (R1 + 0.005), zz), m=M['steel'], segs=8))
            # hazard dashes along the top edge (every other slat)
            if j % 2 == 0:
                d = [(math.cos(a0 + (a1 - a0) * (0.2 + 0.6 * i / 6)) * (R1 - 0.07), math.sin(a0 + (a1 - a0) * (0.2 + 0.6 * i / 6)) * (R1 - 0.07)) for i in range(7)]
                dd = d + [(x * (R1 - 0.15) / (R1 - 0.07), y * (R1 - 0.15) / (R1 - 0.07)) for x, y in reversed(d)]
                parts.append(lprism(f'dash{j}', dd, hj - 0.005, hj + 0.006, M['hazard'], bevel=0.0))
        # hydraulic struts from the deck behind the plate
        for sa in (-half * 0.6, half * 0.6):
            parts.append(tube('strut', [(math.cos(sa) * 0.85, -math.sin(sa) * 0.85, 0.0), (math.cos(sa) * (R0 - 0.02), -math.sin(sa) * (R0 - 0.02), h * 0.7)], 0.03, M['steel']))
            parts.append(mn.cyl('strut_foot', 0.06, 0.04, loc=(math.cos(sa) * 0.85, math.sin(sa) * 0.85, 0), m=M['dark'], verts=12, bevel=0.01))
        mn.outline([o for o in parts if o.name.startswith(('slat', 'strut'))], thickness=0.014)
        root = mn.group('cover', parts)
        name = f'hull/cover_k{ki + 1}'
        t0 = time.time()
        mn.render(name, objs=parts, root=root, dirs=DIRS_COVER)
        manifest_patch(name, {'origin': 'gun pivot; dir i = aim angle i*360/dirs', 'k': round(k, 3),
                              'note': 'drawCover: pick k1/k2/k3 by the cover progress (k <= 1/3, 2/3, 1), fade in below 1/3'})
        print(f'[gun] cover k={k:.2f}: {time.time() - t0:.1f}s')

# ---------------------------------------------------------------------------------------------------------
# Debris jammed in a cannon track (evs.jams)
# ---------------------------------------------------------------------------------------------------------
def rock(name, r, m, seed, loc, scale=(1, 1, 0.7)):
    rnd = random.Random(seed)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + 0.18 * math.sin(d.x * 5 + seed) * math.cos(d.y * 4 - seed) + rnd.uniform(-0.06, 0.06)
        v.co = Vector((v.co.x * k * scale[0], v.co.y * k * scale[1], v.co.z * k * scale[2]))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = loc
    for p in o.data.polygons: p.use_smooth = False
    mn.assign(o, m); return o

def render_jams():
    for i, (gid, (jx, jy)) in enumerate(JAM_SPOTS.items()):
        mn.reset(); M = mats()
        stone = worn('rock', '#6e6359', 0.85, 0.0, wear=0.2, grime=0.8, scale=3)
        parts = []
        parts.append(rock('rock', 0.24, stone, 3 + i * 7, (0.02, 0.0, 0.1)))
        parts.append(rock('rock2', 0.12, stone, 11 + i * 5, (-0.2, 0.14, 0.06)))
        # a twisted bit of girder wedged against the track rail
        g = mn.box('girder', (0.55, 0.07, 0.07), loc=(0, 0, 0), m=worn('girder', '#8a8f99', 0.4, 0.6, wear=0.8), bevel=0.01)
        g.location = (0.05, -0.05, 0.2); g.rotation_euler = (0.3, -0.35, 0.6 + i * 0.7)
        parts.append(g)
        parts.append(mn.box('rail', (0.9, 0.12, 0.05), loc=(0, -0.02, 0.0), m=M['steel'], bevel=0.015, rot=(0, 0, 0.25 * (i - 1))))
        parts.append(mn.sphere('spark', 0.025, loc=(0.25, -0.12, 0.08), m=M['ember'], segs=8))
        mn.outline([o for o in parts if o.name != 'spark'], thickness=0.012)
        name = f'hull/jam_{gid}'
        mn.render(name, objs=parts)
        manifest_patch(name, {'origin': f'JAM_SPOTS.{gid} = ({jx}, {jy}) on the deck plane'})

if __name__ == '__main__':
    T = time.time()
    if want('gun'): render_turret('ok')
    if want('fire'): render_turret('fire')
    if want('broken'): render_turret('broken')
    if want('cover'): render_cover()
    if want('jam'): render_jams()
    print(f'[gun] total {time.time() - T:.1f}s')
