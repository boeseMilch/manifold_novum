"""The gym's dumbbell rack (js/decor.js, right airlock room = the gym, top right corner).

Solid (CLUTTER.weightRack in js/ship.js, its footprint), in a corner that no walkway, power line or
interaction uses: against the back wall (y 15.0) between the wall beacon (x 40.6) and the right cannon's
power line (x 42.6). Origin: the footprint's centre on the floor, game (41.5, 15.36).
Kept low (0.8) so it never covers the wall lamp above it.

    blender -b --factory-startup --python tools/blender/models/props/gym.py [-- quick]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propslib
from propslib import *
from clutter import tape_mat, INK
propslib.JOBS.clear()

W, D = 1.5, 0.62                                   # footprint (game x, game y)
HEX = 6

def dumbbell(k, x, gy, z, r, hl, col, name, taped=False):
    """A hex dumbbell lying front to back (game y), centred at (x, gy), resting with its heads on z."""
    head = plain('db' + name, col, 0.55, coat=0.15)
    steel = worn('dbh', '#a3abb8', 0.3, 0.85, grime=0.3, scratch=0.2, gain=1.2)
    hw = 0.065 + r * 0.25                          # head thickness
    zc = z + r * math.cos(math.pi / 6)            # axis height (hex lies on a flat face)
    k(mn.cyl('handle', 0.02, hl + 0.04, loc=(x, -(gy - hl / 2 - 0.02), zc), m=steel, verts=12, bevel=0.004, rot=(math.radians(90), 0, 0)), outline=False)
    for s in (-1, 1):
        y0 = gy + s * hl / 2 + (0 if s > 0 else -hw)
        k(mn.cyl('head', r, hw, loc=(x, -y0, zc), m=head, verts=HEX, bevel=0.012, rot=(math.radians(90), 0, math.radians(30))))
        k(mn.cyl('cap', r * 0.45, 0.008, loc=(x, -(y0 + (hw if s > 0 else -0.008)), zc), m=steel, verts=16, bevel=0.002, rot=(math.radians(90), 0, 0)), outline=False)
    if taped:                                      # a cracked head, held together the usual way
        k(mn.cyl('dbtape', r * 1.02, 0.05, loc=(x, -(gy + hl / 2 + hw * 0.5 - 0.025), zc), m=tape_mat(), verts=HEX, bevel=0.004, rot=(math.radians(90), 0, math.radians(30))), outline=False)

@job('weight_rack')
def rack_job():
    k = Kit()
    frame = worn('rframe', '#3a3f4a', 0.45, 0.5, grime=0.9, scratch=0.7, gain=1.5)
    rail = worn('rrail', '#d2a62e', 0.45, 0.3, grime=1.0, scratch=0.6, gain=1.2)
    # two side frames (seen from the side: a slanted ladder, high at the back, low at the front)
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.04)
        k(prism('side', [(-0.035, -D / 2 + 0.02), (0.035, -D / 2 + 0.02), (0.035, D / 2 - 0.02), (-0.035, D / 2 - 0.02)], 0, 0.05, frame, bevel=0.012))
        k.parts[-1].location.x = x
        k(mn.box('post_b', (0.07, 0.07, 0.78), loc=(x, -(-D / 2 + 0.06), 0.0), m=frame, bevel=0.015))
        k(mn.box('post_f', (0.07, 0.07, 0.4), loc=(x, -(D / 2 - 0.06), 0.0), m=frame, bevel=0.015))
        k(mn.box('brace', (0.06, 0.06, 0.5), loc=(x, -0.0, 0.08), m=frame, bevel=0.012, rot=(math.radians(-38), 0, 0)))
        k(mn.box('foot', (0.12, D, 0.03), loc=(x, 0, 0.0), m=plain('rfoot', '#1c2028', 0.9), bevel=0.01), outline=False)
    # the two tiers: a pair of rails each (yellow, the gym's colour), long along x
    tiers = [(-0.15, 0.62), (0.17, 0.34)]           # (game y of the tier's centre, rail top height)
    for gy, z in tiers:
        for dy in (-0.075, 0.075):
            k(mn.box('rail', (W - 0.02, 0.04, 0.04), loc=(0, -(gy + dy), z - 0.04), m=rail, bevel=0.01))
    # the weights: small coloured ones up top, big black ones below; one slot empty (someone is "still using it")
    top = [('#c0392b', 0.06), ('#e8c34f', 0.062), ('#2e7dc9', 0.065), ('#3a9a5a', 0.068), ('#9b59b6', 0.07)]
    for i, (c, r) in enumerate(top):
        dumbbell(k, -0.56 + i * 0.28, tiers[0][0], tiers[0][1], r, 0.14, c, 't%d' % i)
    for i, r in enumerate((0.088, 0.094, 0.1)):
        if i == 1: continue
        dumbbell(k, -0.5 + i * 0.33, tiers[1][0], tiers[1][1], r, 0.13, '#2b2f38', 'b%d' % i, taped=(i == 2))
    dumbbell(k, 0.5, tiers[1][0], tiers[1][1], 0.105, 0.13, '#2b2f38', 'b3')
    # a towel draped over the right back post
    towel = plain('towel', '#e8e4dc', 0.95, sheen=0.6)
    tx = W / 2 - 0.04
    k(mn.box('towel_top', (0.16, 0.16, 0.02), loc=(tx, -(-D / 2 + 0.06), 0.78), m=towel, bevel=0.008))
    for sy in (-1, 1):
        k(mn.box('towel_hang', (0.15, 0.02, 0.3), loc=(tx, -(-D / 2 + 0.06) - sy * 0.08, 0.49), m=towel, bevel=0.008, rot=(sy * 0.08, 0, 0.05)))
    k(mn.box('towel_stripe', (0.155, 0.022, 0.025), loc=(tx, -(-D / 2 + 0.06) + 0.08, 0.5), m=plain('tstripe', '#2e7dc9', 0.9, sheen=0.4), bevel=0.0, rot=(-0.08, 0, 0.05)), outline=False)
    # a label strip on the lower rail, its loose end taped back down
    lab = k(mn.box('labelplate', (0.6, 0.012, 0.085), loc=(-0.15, -(tiers[1][0] + 0.075 + 0.026), tiers[1][1] - 0.075), m=plain('lplate', '#e8e4d4', 0.5), bevel=0.004), outline=False)
    k(text('ltxt', 'RE-RACK IT', 0.068, (-0.15, -(tiers[1][0] + 0.075 + 0.034), tiers[1][1] - 0.033), plain('ink', INK, 0.5), rot=R90), outline=False)
    k(mn.box('ltape', (0.07, 0.014, 0.1), loc=(0.11, -(tiers[1][0] + 0.075 + 0.03), tiers[1][1] - 0.085), m=tape_mat(), bevel=0.002, rot=(0, 0.25, 0)), outline=False)
    k.outline(0.013); place(k, 'weight_rack')

if __name__ == '__main__':
    run()
