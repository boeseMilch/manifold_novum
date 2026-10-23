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
        hazard=stripes_mat('hazard'), red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8), rubber=pmat('rubber', '#262a33', 0.7),
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

def viewport(side, state):
    mn.reset(); set_side(side); M = mats(); out = []; rng = random.Random(11)
    u0, u1, v0, v1, z = -8.6, -7.2, -4.7, -2.4, H_FULL
    cu = (u0 + u1) / 2
    out.append(ubox('vp_frame', u0 - 0.12, v0 + 0.1, u1 + 0.12, v1 + 0.12, z - 0.02, z + 0.06, M['dhull'], 0.03))
    if state == 'shut':
        out.append(ubox('vp_glass', u0 + 0.05, v0 + 0.22, u1 - 0.05, v1 - 0.02, z + 0.06, z + 0.075, M['ice'], 0.01))
        for i in range(7):                              # cracks radiating from the impact
            ang = i / 7 * math.pi * 2 + rng.random() * 0.4; L = 0.4 + rng.random() * 0.5
            o = mn.box('crack', (L, 0.015, 0.006), loc=P(cu + 0.1 + math.cos(ang) * L / 2, -3.4 + math.sin(ang) * L / 2, z + 0.078), m=M['black'], bevel=0.0)
            o.rotation_euler = (0, 0, -S * ang); out.append(o)
        for (du, dv) in ((-0.5, 0.0), (0.5, 0.2)):
            out.append(cbox('frostpatch', cu + du, -3.5 + dv, 0.35, 0.3, z + 0.076, 0.004, M['frost'], 0.0))
    else:
        out.append(ubox('vp_hole', u0 + 0.05, v0 + 0.22, u1 - 0.05, v1 - 0.02, z + 0.06, z + 0.062, M['black'], 0.0))
        lip = ubox('vp_lip', u0 + 0.05, v0 + 0.1, u1 - 0.05, v0 + 0.25, z + 0.06, z + 0.1, M['dhull'], 0.01)
        lip.rotation_euler = (0.9, 0, 0); out.append(lip)          # the frame's north edge bent up where it was pried
        for i in range(8):
            out.append(cbox('ice_bit', cu + (rng.random() - 0.5) * 2.2, v0 - 0.2 + rng.random() * 0.5, 0.08, 0.06, z + 0.06, 0.015, M['ice'], 0.003, rotz=rng.random() * 3))
    mn.outline([o for o in out if o.name.startswith(('vp_frame', 'vp_lip'))], thickness=0.012)
    render_ship(f'dock/viewport_{side}_{state}', out)

def service_hatch(side, state):
    mn.reset(); set_side(side); M = mats(); out = []
    u0, u1, v0, v1, z = -9.6, -8.2, 3.0, 3.7, 0.35
    cu = (u0 + u1) / 2
    out.append(ubox('sh_frame', u0 - 0.12, v0, u1 + 0.12, v1, 0.0, z + 0.04, M['bwall'], 0.02))
    out.append(ubox('sh_hz', u0 - 0.1, v1 - 0.02, u1 + 0.1, v1 + 0.005, 0.05, z, M['hazard'], 0.004))
    if state == 'shut':
        out.append(ubox('sh_lid', u0 + 0.05, v0 + 0.08, u1 - 0.05, v1 - 0.08, z + 0.04, z + 0.1, M['lid'], 0.02))
        out.append(ubox('sh_lid_hz', u0 + 0.15, v0 + 0.25, u1 - 0.15, v0 + 0.35, z + 0.1, z + 0.104, M['hazard'], 0.002))
        w = mn.cyl('sh_wheel', 0.2, 0.04, loc=P(cu, (v0 + v1) / 2 + 0.05, z + 0.1), m=M['red'], verts=24, bevel=0.01); out.append(w)
        out.append(mn.cyl('sh_hub', 0.06, 0.06, loc=P(cu, (v0 + v1) / 2 + 0.05, z + 0.1), m=M['steel'], verts=12, bevel=0.01))
    else:
        out.append(ubox('sh_hole', u0 + 0.05, v0 + 0.08, u1 - 0.05, v1 - 0.08, z + 0.04, z + 0.045, M['black'], 0.0))
        lid = ubox('sh_lid', u0 + 0.05, v0 - 0.05, u1 - 0.05, v0 + 0.01, z, z + 0.62, M['lid'], 0.02)   # swung up, standing at the bay edge
        out.append(lid)
        out.append(mn.cyl('sh_wheel', 0.2, 0.04, loc=P(cu, v0 - 0.07, z + 0.32), m=M['red'], verts=24, bevel=0.01, rot=(R90, 0, 0)))
    mn.outline([o for o in out if o.name.startswith(('sh_frame', 'sh_lid', 'sh_wheel'))], thickness=0.012)
    render_ship(f'base/service_hatch_{side}_{state}', out)

if __name__ == '__main__':
    for side in ('port', 'star'):
        canopy_smashed(side)
        for st in ('shut', 'open'):
            viewport(side, st)
            service_hatch(side, st)
