"""Ways into a docked ship from a spacewalk (js/dockentry.js, 2026-10-23): what a spacewalker breaks open or cranks.

    blender -b --factory-startup --python tools/blender/models/dock/entries.py [-- quick]

Every sprite has the docked ships' origin: our airlock hatch on the ground (draw at h.x, h.y like dock/pirate_<side>),
drawn over the ship sprite (it covers the intact part it replaces). Port layout, u/v relative to the hatch (docklib.py).
  dock/canopy_smashed_<side>       the Red Comet raider's glass canopy (ships.py canopy(): centre (-4.0, -1.9), half
                                   1.15 x 0.75, 0.58 tall on the beak's roof at 1.6) smashed in: a ring of jagged glass
                                   on the frame, the dark cockpit under it (seat, dead HUD), shards on the roof
  dock/viewport_<side>_shut        the derelict's roof viewport over its airlock room's north wall (u -8.6 .. -7.2,
                                   v -4.7 .. -2.4): frosted glass, cracked right across
  dock/viewport_<side>_open        the same pried open: glass gone, frame bent up, a dark hole down into the hull
  base/service_hatch_<side>_shut   the pirate base's service hatch in its docking bay's low south wall (u -9.6 .. -8.2,
                                   v 3.0 .. 3.7): a hand-cranked lid with a wheel, hazard paint
  base/service_hatch_<side>_open   cranked open: the lid swung up, the dark opening
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docklib as D
from docklib import *

A = D.args()
if 'quick' in A: mn.SAMPLES = 16
H_FULL = 1.6

def mats():
    return dict(
        gun=worn('gun', '#2b2f36', 0.45, 0.6, wear=0.4, grime=0.8), glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        glass_hi=mn.mat('glass_hi', '#6a7c90', 0.05, 0.0, clearcoat=1.0), black=pmat('black', '#07080a', 0.95),
        dark=pmat('dark', '#16181d', 0.8), seat=worn('seat', '#5a2a2a', 0.7, 0.0, wear=0.6), steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2),
        hud=emit_mat('hud', '#ff6a3a', 0.6, base='#3a1a10'), frost=worn('frost', '#9aa8b8', 0.6, 0.1, frost=1.0, grime=1.0),
        dhull=worn('dhull', '#5c626c', 0.55, 0.3, wear=0.6, frost=0.7, grime=1.1), ice=mn.mat('ice', '#6f8296', 0.2, 0.0, clearcoat=0.6),
        bwall=worn('bwall', '#4a4440', 0.6, 0.3, rust=0.3, grime=1.1), lid=worn('lid', '#6a6458', 0.5, 0.4, rust=0.3, wear=0.7),
        hazard=stripes_mat('hazard'), labwhite=worn('labwhite', '#d8d6cc', 0.5, 0.1, wear=0.6, grime=1.0, frost=0.5), teal=worn('teal', '#3b7a8a', 0.4, 0.3, frost=0.3),
        crack=pmat('crack', '#e8f0f8', 0.3), ink=pmat('ink', '#23252b', 0.6), gold=worn('gold', '#e8b42e', 0.4, 0.3, wear=0.8), red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8), rubber=pmat('rubber', '#262a33', 0.7),
    )

def shard_ring(M, out, cu, cv, a, b, h, zr, rng):
    """The canopy's glass broken out: jagged shards standing round the frame's rim."""
    n = 26
    for i in range(n):
        t = i / n * 2 * math.pi
        hgt = h * (0.15 + 0.55 * rng.random())
        w = 0.12 + 0.12 * rng.random()
        u, v = cu + a * 0.92 * math.cos(t), cv + b * 0.92 * math.sin(t)
        o = mn.box('shard', (w, 0.02, hgt), loc=P(u, v, zr), m=M['glass_hi'] if i % 3 == 0 else M['glass'], bevel=0.0)
        o.rotation_euler = (0.15 * (rng.random() - 0.5), 0.3 * (rng.random() - 0.5), -S * t + math.pi / 2 + 0.3 * (rng.random() - 0.5))
        out.append(o)

def canopy_smashed(side):
    mn.reset(); set_side(side); M = mats(); out = []; rng = random.Random(7)
    cu, cv, a, b, h = (-4.0, -1.9, 1.15, 0.75, 0.58)
    zr = H_FULL
    # the frame (as the intact one's), a dark cockpit well under it (covers the intact glass from above), the seat
    o = mn.sphere('frame', 1.0, loc=P(cu, cv, zr - 0.02), m=M['gun'], scale=(a + 0.09, b + 0.08, h * 0.45), segs=48); out.append(o)
    o = mn.sphere('frame_gold', 1.0, loc=P(cu, cv, zr - 0.035), m=M['gold'], scale=(a + 0.1, b + 0.09, h * 0.42), segs=48); out.append(o)   # the raider's gold trim
    o = mn.cyl('well', 1.0, 0.04, loc=P(cu, cv, zr + h * 0.45 - 0.02), m=M['black'], verts=48, bevel=0.0); o.scale = (a, b, 1.0); out.append(o)
    out.append(cbox('seat', cu - 0.15, cv + 0.05, 0.42, 0.4, zr + h * 0.45, 0.12, M['seat'], 0.03))
    out.append(cbox('seat_back', cu + 0.08, cv + 0.05, 0.1, 0.4, zr + h * 0.45, 0.42, M['seat'], 0.03))
    o = mn.sphere('hud_dead', 0.08, loc=P(cu - 0.55, cv + 0.15, zr + h * 0.45 + 0.12), m=M['hud'], scale=(1.4, 0.6, 0.4), segs=12); out.append(o)
    shard_ring(M, out, cu, cv, a, b, h, zr + h * 0.4, rng)
    # the strut, bent, and glass on the roof round it
    s = mn.sphere('strut', 1.0, loc=P(cu - 0.35, cv, zr), m=M['gun'], scale=(0.07, b + 0.015, h * 0.8), segs=32)
    s.rotation_euler = (0.35, 0.0, 0.0); out.append(s)
    for i in range(22):
        t = rng.random() * 2 * math.pi; r = 1.0 + 0.35 * rng.random()
        out.append(cbox('glass_bit', cu + a * r * math.cos(t), cv + b * r * math.sin(t), 0.06 + 0.06 * rng.random(), 0.05, zr, 0.012,
                        M['glass_hi'] if i % 2 else M['glass'], 0.002, rotz=rng.random() * 3))
    mn.outline([o for o in out if o.name.startswith(('frame', 'seat', 'strut'))], thickness=0.012)
    render_ship(f'dock/canopy_smashed_{side}', out)

def crack_web(M, out, cu, cv, z, rng, n=11, r=0.75, sv=1.0):
    """Crazed glass: radial cracks from an impact, with rings of short cross cracks (on the glass at height z)."""
    spokes = []
    for i in range(n):
        ang = i / n * 2 * math.pi + rng.uniform(-0.2, 0.2); L = r * rng.uniform(0.55, 1.0)
        spokes.append((ang, L))
        o = mn.box('crack', (L, 0.012, 0.004), loc=P(cu + math.cos(ang) * L / 2, cv + math.sin(ang) * L / 2 * sv, z), m=M['crack'], bevel=0.0)
        o.rotation_euler = (0, 0, -S * ang); out.append(o)
    for ring_r in (0.18, 0.36, 0.55):
        for ang, L in spokes:
            if L < ring_r: continue
            a2 = ang + 2 * math.pi / n * rng.uniform(0.6, 1.0); x0, y0 = math.cos(ang) * ring_r, math.sin(ang) * ring_r * sv
            x1, y1 = math.cos(a2) * ring_r * 1.05, math.sin(a2) * ring_r * 1.05 * sv
            L2 = math.hypot(x1 - x0, y1 - y0); a3 = math.atan2(y1 - y0, x1 - x0)
            o = mn.box('crack_x', (L2, 0.009, 0.004), loc=P(cu + (x0 + x1) / 2, cv + (y0 + y1) / 2, z), m=M['crack'], bevel=0.0)
            o.rotation_euler = (0, 0, -S * a3); out.append(o)
    out.append(mn.sphere('impact', 0.05, loc=P(cu, cv, z), m=M['glass_hi'], scale=(1, 1, 0.3), segs=12))

def viewport(side, state):
    """The derelict's roof viewport (an old science vessel's: rounded white frame, a teal band, bolts)."""
    mn.reset(); set_side(side); M = mats(); out = []; rng = random.Random(11)
    u0, u1, v0, v1, z = -8.6, -7.2, -4.7, -2.4, H_FULL
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2 - 0.05
    fw = 0.16                                           # frame width
    frame = prism('vp_frame', rrect_pts(u0 - fw, v0 + 0.05, u1 + fw, v1 + 0.08, 0.28), z - 0.02, z + 0.07, M['labwhite'], bevel=0.025)
    gl = (u0 + 0.06, v0 + 0.24, u1 - 0.06, v1 - 0.04)
    cut = prism('vp_cut', rrect_pts(*gl, 0.18), z - 0.1, z + 0.2, M['dark'], bevel=0.0)
    bool_cut(frame, [cut])                               # (a ring: the glass sits in it)
    out.append(frame)
    out.append(prism('vp_well', rrect_pts(*gl, 0.18), z - 0.04, z + 0.02, M['dark'], bevel=0.0))
    out.append(prism('vp_band', rrect_pts(u0 - fw + 0.03, v1 - 0.04, u1 + fw - 0.03, v1 + 0.05, 0.04), z + 0.07, z + 0.085, M['teal'], bevel=0.005))
    for (bu, bv) in ((u0 - 0.08, v0 + 0.2), (u1 + 0.08, v0 + 0.2), (u0 - 0.08, v1 - 0.15), (u1 + 0.08, v1 - 0.15), (cu, v0 + 0.1)):
        out.append(mn.cyl('vp_bolt', 0.03, 0.03, loc=P(bu, bv, z + 0.07), m=M['steel'], verts=10, bevel=0.008))
    if state == 'shut':
        out.append(prism('vp_glass', rrect_pts(*gl, 0.18), z + 0.035, z + 0.06, M['ice'], bevel=0.008))
        crack_web(M, out, cu + 0.12, cv - 0.15, z + 0.063, rng, n=12, r=0.9, sv=1.15)
        for (du, dv, w, d) in ((-0.42, 0.6, 0.22, 0.18), (0.38, -0.75, 0.18, 0.14), (-0.35, -0.85, 0.14, 0.1)):
            o = mn.cyl('frostpatch', 1.0, 0.004, loc=P(cu + du, cv + dv, z + 0.064), m=M['frost'], verts=20, bevel=0.0); o.scale = (w, d, 1.0); out.append(o)
        out.append(text('vp_txt', 'VIEW 2', u1 + 0.02, v1 - 0.6, z + 0.075, 0.08, M['ink'], rotz=math.pi / 2))
    else:
        out.append(prism('vp_hole', rrect_pts(*gl, 0.18), z + 0.035, z + 0.037, M['black'], bevel=0.0))
        # glass left in the frame: jagged teeth along the edges
        for k in range(16):
            t = k / 16
            if k % 4 == 0: u, v, rz = gl[0] + 0.02, gl[1] + 0.15 + (gl[3] - gl[1] - 0.3) * (t * 4 % 1), math.pi / 2
            elif k % 4 == 1: u, v, rz = gl[2] - 0.02, gl[1] + 0.15 + (gl[3] - gl[1] - 0.3) * (t * 4 % 1), -math.pi / 2
            elif k % 4 == 2: u, v, rz = gl[0] + 0.15 + (gl[2] - gl[0] - 0.3) * (t * 4 % 1), gl[3] - 0.02, 0.0
            else: u, v, rz = gl[0] + 0.15 + (gl[2] - gl[0] - 0.3) * (t * 4 % 1), gl[1] + 0.02, math.pi
            out.append(prism('vp_tooth', [(u - 0.06, v), (u + 0.06, v), (u + rng.uniform(-0.03, 0.03), v + (0.1 + rng.random() * 0.1) * (-1 if rz == 0.0 else 1))] if rz in (0.0, math.pi) else
                              [(u, v - 0.06), (u, v + 0.06), (u + (0.1 + rng.random() * 0.1) * (1 if rz > 0 else -1), v)], z + 0.06, z + 0.075, M['glass_hi'], bevel=0.0))
        lip = ubox('vp_lip', u0 - fw, v0 + 0.05, u1 + fw, v0 + 0.3, z - 0.02, z + 0.07, M['steel'], 0.02)
        lip.rotation_euler = (S * 0.0 + 0.75, 0, 0); out.append(lip)        # the frame's outer edge bent up where it was pried
        out.append(cbox('vp_bar', cu + 0.35, v0 - 0.15, 0.9, 0.06, z + 0.05, 0.05, M['steel'], 0.01, rotz=0.4))   # the pry bar left in it
        for i in range(12):
            out.append(cbox('ice_bit', cu + rng.uniform(-1.2, 1.2), v0 - 0.4 + rng.random() * 0.6, 0.06 + rng.random() * 0.06, 0.05, z + 0.06, 0.012, M['ice'], 0.003, rotz=rng.random() * 3))
    mn.outline([o for o in out if o.name.startswith(('vp_frame', 'vp_lip', 'vp_bar'))], thickness=0.012)
    render_ship(f'dock/viewport_{side}_{state}', out)

def wheel(M, out, u, v, z, ang, r=0.2, axis='z'):
    """A hand-crank wheel: rim, four spokes at angle ang, a hub and the crank handle on the rim."""
    rot = (0, 0, 0) if axis == 'z' else (R90, 0, 0)
    out.append(ring('sh_wheel', r, 0.04, 0.045, loc=P(u, v, z), m=M['red'], rot=rot))
    for k in range(4):
        a = ang + k * math.pi / 2
        if axis == 'z':
            o = mn.box('sh_spoke', (r * 1.9, 0.03, 0.025), loc=P(u, v, z + 0.01), m=M['red'], bevel=0.005); o.rotation_euler = (0, 0, -S * a + 0.0)
        else:
            o = mn.box('sh_spoke', (r * 1.9, 0.025, 0.03), loc=P(u, v, z), m=M['red'], bevel=0.005); o.rotation_euler = (0, a, 0)
        out.append(o)
    out.append(mn.cyl('sh_hub', 0.055, 0.07, loc=P(u, v, z), m=M['steel'], verts=12, bevel=0.01, rot=rot))
    if axis == 'z':
        out.append(mn.cyl('sh_handle', 0.025, 0.14, loc=P(u + math.cos(ang) * r, v + math.sin(ang) * r, z + 0.02), m=M['steel'], verts=8, bevel=0.005))

def service_hatch(side, state, f=0):
    """The pirate base's service hatch in the docking bay's low south wall: heavy, bolted, hand-cranked (a wheel on
    both faces: outside the bigger one on the lid, inside one on the bay side of the wall)."""
    mn.reset(); set_side(side); M = mats(); out = []
    u0, u1, v0, v1, z = -9.6, -8.2, 3.0, 3.7, 0.35
    cu, cvm = (u0 + u1) / 2, (v0 + v1) / 2
    out.append(ubox('sh_frame', u0 - 0.16, v0 - 0.02, u1 + 0.16, v1, 0.0, z + 0.05, M['bwall'], 0.02))
    out.append(ubox('sh_hz', u0 - 0.14, v1 - 0.02, u1 + 0.14, v1 + 0.006, 0.04, z, M['hazard'], 0.004))
    for bu in (u0 - 0.09, u1 + 0.09):
        for bv in (v0 + 0.12, v1 - 0.12):
            out.append(mn.cyl('sh_bolt', 0.035, 0.03, loc=P(bu, bv, z + 0.05), m=M['steel'], verts=6, bevel=0.006))
    out.append(text('sh_txt', 'SERVICE', cu, v1 - 0.09, z + 0.051, 0.07, M['ink']))
    ang = f * math.pi / 8                                  # (4 frames turning through a quarter of the spokes' period)
    if state in ('shut', 'crank'):
        out.append(ubox('sh_lid', u0 + 0.04, v0 + 0.06, u1 - 0.04, v1 - 0.16, z + 0.05, z + 0.13, M['lid'], 0.025))
        out.append(ubox('sh_lid_rim', u0 + 0.02, v0 + 0.04, u1 - 0.02, v0 + 0.1, z + 0.05, z + 0.14, M['steel'], 0.01))
        for k in range(6):
            out.append(mn.cyl('sh_lbolt', 0.022, 0.02, loc=P(u0 + 0.14 + k * (u1 - u0 - 0.28) / 5, v1 - 0.22, z + 0.13), m=M['steel'], verts=6, bevel=0.004))
        wheel(M, out, cu, cvm - 0.04, z + 0.15, ang, r=0.2)
        # inside: a smaller wheel on the bay side of the wall (the same crank, turned from in there)
        wheel(M, out, cu, v0 - 0.05, z - 0.08, -ang, r=0.13, axis='x')
    else:
        out.append(ubox('sh_hole', u0 + 0.04, v0 + 0.06, u1 - 0.04, v1 - 0.16, z + 0.05, z + 0.055, M['black'], 0.0))
        out.append(ubox('sh_rungs', cu - 0.25, v0 + 0.1, cu + 0.25, v0 + 0.14, z - 0.2, z + 0.054, M['steel'], 0.01))
        lid = ubox('sh_lid', u0 + 0.04, v0 - 0.12, u1 - 0.04, v0 - 0.04, z, z + 0.7, M['lid'], 0.025)   # swung up against the bay side
        out.append(lid)
        wheel(M, out, cu, v0 - 0.13, z + 0.38, 0.0, r=0.2, axis='x')
    mn.outline([o for o in out if o.name.startswith(('sh_frame', 'sh_lid', 'sh_wheel'))], thickness=0.012)
    name = f'base/service_hatch_{side}_{state}' + (f'_f{f}' if state == 'crank' else '')
    render_ship(name, out)

if __name__ == '__main__':
    for side in ('port', 'star'):
        canopy_smashed(side)
        for st in ('shut', 'open'):
            viewport(side, st)
            service_hatch(side, st)
        for f in range(4): service_hatch(side, 'crank', f)
