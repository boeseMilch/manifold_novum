"""The grappler's grabbing tentacle while it holds our hull (js/organic.js drawTentacle).

The arm runs from the squid (tentacleBase: local 0.6, 1.6) to the hull (e.tent.x, y) along a bezier
that sways, so it stays procedural in placement, built from rendered pieces:
  tentacle_seg_<side>_d<i>   i = 0..15: one bead of the arm (an elongated fleshy segment with two pale
                             suckers on the side that faces the camera when it reaches for our hull),
                             pointing along game angle i * 22.5 deg. Origin = the bead's centre. Full
                             size = the arm's base (radius 0.21, the game's 10 px half width); chain them
                             along the game's 24-point curve every ~0.13 units, each one scaled from 1 at the
                             squid down to 0.45 at the hull (the game's 10 -> 4.5 px taper), drawn from the
                             squid towards the hull, dir = the curve's tangent. No outline on the beads: draw
                             the game's dark tapered stroke underneath first (tapered(), pass 0) for the
                             silhouette. side = port | star: which side the squid is on (port: it reaches
                             right).
  tentacle_coil_<side>       the tip wound three times round the hull plate, suckers pressed on, acid
                             oozing (origin = (e.tent.x, e.tent.y), the rings the game draws at y - 0.45,
                             y, y + 0.45 with radius 0.32). Draw it after the beads.
The acid stain, bubbles and the progress ring stay procedural.

    blender -b --factory-startup --python tools/blender/models/organic/tentacle.py [-- quick]
"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector, Matrix
import mn
import orglib as O
import grappler as G

def bead(M, side):
    R = 10 / 48
    o = O.blob('bead', [((0, 0, 0), R * 1.1, (1.5, 1, 0.92))], m=M['grab'], res=R * 0.06)
    objs = [o]
    sd = -1 if side == 'port' else 1                      # suckers on the side towards the camera when reaching for the hull
    for x in (-R * 0.5, R * 0.5):
        c = Vector((x, sd * R * 0.78, R * 0.12))
        s = mn.sphere('sucker', R * 0.24, loc=c, m=M['sucker'], scale=(1, 1, 0.45), segs=16)
        s.rotation_euler = (math.radians(90) * -sd, 0, 0); objs.append(s)
        rim = mn.sphere('sucker_in', R * 0.12, loc=c + Vector((0, sd * R * 0.1, 0.0)), m=M['throat'], scale=(1, 1, 0.4), segs=12)
        rim.rotation_euler = (math.radians(90) * -sd, 0, 0); objs.append(rim)
    return objs

def coil(M, side):
    s = 1 if side == 'port' else -1                       # port: the arm comes in from the left
    objs = []
    for i in range(3):
        y = (i - 1) * 0.45
        pts, rad = [], []
        for k in range(25):
            a = k / 24 * math.tau * 0.97 + 0.4
            tl = (i - 1) * 0.35
            pts.append((math.cos(a) * 0.32 * s, -(y + math.sin(a) * 0.32 * 0.55 + math.cos(a) * tl * 0.3), 0.12 + math.sin(a) * 0.14))
            rad.append(0.09 - 0.012 * i)
        objs.append(O.tube(f'ring{i}', pts, rad, m=M['grab'], res=3, segs=12))
        for k in range(0, 24, 3):                         # suckers pressed against the plate
            a = k / 24 * math.tau + 0.4
            if math.sin(a) > 0.3: continue
            c = Vector((math.cos(a) * 0.32 * s, -(y + math.sin(a) * 0.32 * 0.55) - 0.05, 0.12 + math.sin(a) * 0.14 - 0.03))
            objs.append(mn.sphere('sucker', 0.035, loc=c, m=M['sucker'], scale=(1, 1, 0.5), segs=10))
    # the arm coming in, joining the top ring, and the curled tip under the bottom ring
    objs.append(O.tube('in', [(-0.9 * s, 0.35, 0.18), (-0.5 * s, 0.38, 0.17), (-0.3 * s, 0.45, 0.14)], [0.1, 0.09, 0.08], m=M['grab'], res=6, segs=12))
    objs.append(O.tube('tip', [(0.25 * s, -0.62, 0.05), (0.38 * s, -0.75, 0.08), (0.3 * s, -0.86, 0.1), (0.18 * s, -0.8, 0.1)], [0.06, 0.045, 0.03, 0.012], m=M['grab'], res=6, segs=10))
    acid = O.slime_mat('acid_ooze', '#9cff5a', glow=0.6)
    for (x, y, r) in ((0.05, 0.2, 0.06), (-0.12, -0.35, 0.05), (0.2, -0.1, 0.04), (0.0, -0.55, 0.05)):
        o = O.blob('ooze', [((x * s, y, 0.0), r * 2.6, (1.4, 1.2, 0.3)), ((x * s * 0.5, y * 0.8, 0.0), r * 2.0, (1.4, 1.2, 0.3))], m=acid, res=0.008); O.cut_below(o); objs.append(o)
    return objs

if __name__ == '__main__':
    T = time.time()
    for side in ('port', 'star'):
        O.set_side(side)
        mn.reset(); M = G.mats()
        objs = bead(M, side)
        root = mn.group('bead', objs)
        mn.render(f'organic/tentacle_seg_{side}', objs=objs, root=root, dirs=16)
        mn.reset(); M = G.mats()
        objs = coil(M, side)
        mn.outline([o for o in objs if o.name.startswith(('ring', 'in', 'tip'))], thickness=0.016)
        mn.render(f'organic/tentacle_coil_{side}', objs=objs)
    print(f'[tentacle] total {time.time() - T:.1f}s')
