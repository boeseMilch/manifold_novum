"""The docking tube (js/dock.js g.tube = R(-5.6, y-0.6, 0.7, y+0.6), mirrored for starboard): a ribbed,
flexible cut-away gangway from the docked ship's outer door to our hatch. Same for every dock kind.

    blender -b --factory-startup --python tools/blender/models/dock/tube.py -- [port|star|all] [quick]

Sprites dock/tube_port, dock/tube_star; origin = our hatch on the ground (HATCHES[side].x, .y), like the ships.
The walkway runs from u = -5.6 (the docked ship's door, under its hull end at -4.9) to u = 0 (our hull's
outer face, where a clamp collar bites on); the game's rect continues to 0.7 inside our airlock wall, which
our own hatch art covers. Cut-away: the far (north) wall of the tube is a tall bellows, the near (south)
one only a low lip, so nobody in the tube is hidden.
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docklib as D
from docklib import *

A = D.args()
SIDES = [a for a in A if a in ('port', 'star')] or ['port', 'star']
if 'quick' in A:
    mn.SAMPLES = 16; mn.OUT_DIR = '/tmp/mn_dock'; mn._manifest_put = lambda *a, **k: None

def build(side):
    mn.reset(); set_side(side); out = []
    M = dict(grate=worn('grate', '#8a93a5', 0.5, 0.25, wear=0.5), sub=pmat('sub', '#0e1014', 0.9),
             bellows=worn('bellows', '#6a7080', 0.75, 0.0, wear=0.2, grime=0.6), rib=worn('rib', '#e8c34f', 0.4, 0.3, wear=0.6),
             steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2), hazard=stripes_mat('hazard'), dark=pmat('dark', '#1c1f25', 0.6),
             lamp=emit_mat('tlamp', '#9cd8ff', 0.9, base='#4a6a8a'), tape=pmat('tape', '#b9bcc2', 0.85))
    u0, u1 = TUBE[0], 0.0
    W = 0.6
    out.append(ubox('sub', u0, -W, u1, W, -0.08, -0.0, M['sub'], bevel=0))
    k = u0 + 0.05                                                   # grating sections
    while k < u1 - 0.05:
        e = min(u1 - 0.03, k + 0.9)
        out.append(ubox('grate_rim', k, -W + 0.06, e, W - 0.06, -0.02, 0.03, M['grate'], bevel=0.01))
        for j in range(int((e - k - 0.1) / 0.09)):
            x = k + 0.08 + j * 0.09
            out.append(ubox('grate_slat', x, -W + 0.12, x + 0.04, W - 0.12, 0.03, 0.04, M['grate'], bevel=0.004))
        k = e + 0.03
    for sv in (-1, 1):                                              # edge rails with lamps on the floor
        out.append(ubox('rail', u0, sv * W - 0.06, u1, sv * W + 0.06, -0.02, 0.06, M['dark'], bevel=0.01))
    for j in range(5):
        x = u0 + 0.6 + j * 1.1
        out.append(ubox('rlamp', x, -W - 0.025, x + 0.25, -W + 0.025, 0.06, 0.075, M['lamp'], bevel=0.003))
    # bellows: tall on the far side, low on the near side; steel hoops every 0.45
    out.append(ubox('bellows_n', u0, -W - 0.14, u1, -W - 0.05, 0.0, 0.85, M['bellows'], bevel=0.03))
    out.append(ubox('bellows_s', u0, W + 0.05, u1, W + 0.14, -0.1, 0.18, M['bellows'], bevel=0.03))
    x = u0 + 0.3
    while x < u1 - 0.1:
        out.append(pipe_uv('hoop_n', [(x, -W + 0.02, 0.0), (x, -W + 0.0, 0.0), (x, -W + 0.0, 0.9)], 0.035, M['rib'], corner=0.08))
        out.append(pipe_uv('hoop_s', [(x, W - 0.02, 0.0), (x, W + 0.0, 0.0), (x, W + 0.0, 0.22)], 0.035, M['rib'], corner=0.08))
        for f in (0.15, 0.3):                                       # bellows folds
            out.append(ubox('fold', x + f - 0.015, -W - 0.06, x + f + 0.015, -W - 0.03, 0.05, 0.82, M['dark'], bevel=0.008))
        x += 0.45
    out.append(ubox('top_rail', u0, -W - 0.16, u1, -W - 0.03, 0.85, 0.93, M['rib'], bevel=0.02))
    out.append(ubox('tape', -3.0, -W - 0.16, -2.7, -W - 0.13, 0.4, 0.5, M['tape'], bevel=0.002))
    # clamp collar on our hull (u = 0) and the frame on their door (u = TUBE[0])
    for (a, b, hz) in ((-0.32, 0.06, True), (u0 - 0.05, u0 + 0.25, False)):
        out.append(ubox('collar_n', a, -W - 0.22, b, -W - 0.0, -0.1, 1.05, M['steel'], bevel=0.03))
        out.append(ubox('collar_s', a, W + 0.0, b, W + 0.22, -0.15, 0.3, M['steel'], bevel=0.03))
        out.append(ubox('collar_f', a + 0.02, W + 0.21, b - 0.02, W + 0.23, -0.1, 0.25, M['hazard'] if hz else M['dark'], bevel=0.005))
    for sv in (-1, 1):                                              # clamp bolts on our side
        out.append(ucyl('clamp_bolt', 0.05, 0.1, -0.13, sv * (W + 0.11), 0.3 if sv > 0 else 1.05, M['dark'], verts=8, bevel=0.01))
    import shiplib; shiplib._hidden_in_data.clear()
    shadow_catcher((8.0, 3.0), loc=P(-2.8, 0, 0))
    mn.outline([o for o in out if not o.name.startswith(('grate_slat', 'rlamp', 'tape'))], thickness=0.012)
    mn.render(f'dock/tube_{side}', objs=out)

if __name__ == '__main__':
    t0 = time.time()
    for side in SIDES: build(side)
    print(f'[dock] tube in {time.time() - t0:.0f} s')
