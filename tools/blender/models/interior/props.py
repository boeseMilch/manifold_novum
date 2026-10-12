"""Gun ladders, lamps and room plaques.

Gun ladder (drawGunLadder in js/art.js; GUNS[i].hatch in js/ship.js)
  interior/gun_ladder        a ladder well (0.72 x 0.72 footprint, like the game's square) going up to
                             the cannon: open towards the camera, rungs inside, hazard collar on top.
                             Origin = g.hatch (the centre of the footprint), floor. The 'CANNON' text
                             stays in the game (drawn under it).
  interior/gun_ladder_lit    the same with the green "manned / ready" beacon on top lit.

Lamps (drawLightPools in js/interior.js, lamp() in js/art.js). The light itself (the warm pools) is a
runtime light; nothing is baked into the floors.
  interior/lamp_ceiling_on / _off   caged pendant lamp hanging at 2.0 above the floor (over the walls'
                                    1.6, so it is drawn last); origin = the floor point under it = the
                                    LIGHTS entry. The cable runs up out of the canvas top.
  interior/lamp_wall_on / _off      bulkhead lamp for a back wall's front face, centre 1.15 high;
                                    origin = the wall foot under its centre (x, front-face y).
  interior/status_<state>           the small status lamp of lamp(): open (green), closed (red),
                                    busy / busy_off (amber blink: alternate them), off (dead).
                                    Origin = its centre on the surface it sits on.

Room labels (drawRoomLabel): the names stay text in the game; this is a plaque to draw them on.
  interior/plaque_<zone>_l, _m, _r  9-slice plaque for a back wall's front face (plate 0.42..0.74 high):
                                    left cap (18 px), middle (24 px, repeat), right cap (18 px). Origin =
                                    the wall foot at the piece's left edge (x, front-face y). The stripe
                                    along the bottom is the zone's label colour (red / white / blue).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

def cone(name, r1, r2, h, loc, m, verts=32):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; mn.bev(o, 0.01); mn.assign(o, m); mn.smooth(o); return o

# ---------------------------------------------------------------------------
def gun_ladder(lit):
    mn.reset(); M = mats(); o = []
    s = 0.36; H = 1.75
    o.append(gbox('plate', -s, -s, s, s, 0, 0.05, M['body'], 0.03))
    o.append(gbox('hz', -s + 0.04, -s + 0.04, s - 0.04, -s + 0.15, 0.05, 0.062, M['hazard'], 0.004))
    o.append(mn.cyl('hole', 0.28, 0.01, loc=G(0, 0.03, 0.05), m=M['hole'], bevel=0, verts=32))
    # the well: a faceted half shell around the north side
    n = 7
    for i in range(n):
        a = math.pi + math.pi * (i + 0.5) / n               # north half (game y < 0)
        cx, cy = 0.31 * math.cos(a), 0.31 * math.sin(a) * 1.0
        o.append(mn.box('shell', (2 * 0.31 * math.sin(math.pi / (2 * n)) + 0.03, 0.05, H), loc=(cx, -cy, 0.05), m=M['panel'] if i % 2 else M['panel2'], bevel=0.012, rot=(0, 0, -a + math.pi / 2)))
    for z in (0.5, 1.15):                                   # bands around the shell
        o.append(ring('band', 0.345, 0.03, 0.06, loc=G(0, 0, z), m=M['rim']))
    # rails and rungs
    for sx in (-1, 1):
        o.append(gbox('rail', sx * 0.16 - 0.025, -0.08, sx * 0.16 + 0.025, -0.03, 0.05, H + 0.15, M['steel'], 0.012))
    for k in range(7):
        z = 0.28 + k * 0.22
        o.append(mn.cyl('rung', 0.018, 0.32, loc=G(-0.16, -0.055, z), m=M['steel'], rot=RY90, bevel=0.004, verts=10))
    # top collar (hatch ring up into the cannon) with hazard paint and a beacon
    o.append(ring('collar', 0.39, 0.1, 0.1, loc=G(0, 0, H), m=M['hazard_big']))
    o.append(ring('collar_rim', 0.4, 0.03, 0.12, loc=G(0, 0, H), m=M['dark']))
    o.append(mn.cyl('bc_base', 0.06, 0.05, loc=G(0.27, -0.27, H + 0.08), m=M['dark'], bevel=0.01))
    o.append(mn.sphere('bc', 0.05, loc=G(0.27, -0.27, H + 0.14), m=glow('bc_on', '#47e07a', 1.3) if lit else pmat('bc_off', '#2d5a3c', 0.25), segs=16))
    o.append(tape_front(-0.08, 0.33, 0.9, 0.28, 25, M))         # duct tape over a crack in the shell
    mn.outline(o, thickness=0.013)
    win('interior/gun_ladder' + ('_lit' if lit else ''), -0.45, 0.45, -0.45, 0.42, H + 0.25, origin=(0.0, 0.0),
        extra={'note': 'ladder well to a cannon; origin = GUNS[i].hatch, floor; footprint 0.72 x 0.72'})

# ---------------------------------------------------------------------------
def lamp_ceiling(on):
    mn.reset(); M = mats(); o = []
    Z = 2.0
    green = pmat('enamel', '#3f6a5a', 0.4, 0.2, grime=0.3)
    o.append(cone('shade', 0.3, 0.09, 0.2, G(0, 0, Z), green))
    o.append(mn.cyl('shade_rim', 0.31, 0.03, loc=G(0, 0, Z - 0.01), m=M['rim'], bevel=0.008))
    o.append(mn.cyl('socket', 0.08, 0.12, loc=G(0, 0, Z + 0.18), m=M['dark'], bevel=0.01))
    o.append(ring('halo', 0.33, 0.05, 0.03, loc=G(0, 0, Z - 0.035), m=glow('halo_on', '#ffd8a0', 1.2) if on else pmat('halo_off', '#5a5850', 0.3)))
    o.append(mn.sphere('bulb', 0.12, loc=G(0, 0, Z - 0.1), m=glow('bulb_on', '#ffd8a0', 1.5) if on else pmat('bulb_off', '#8a8578', 0.2), segs=20))
    for i in range(4):                                       # wire cage under the shade
        a = i * math.pi / 2 + math.pi / 4
        o.append(pipe('cage', [G(0.27 * math.cos(a), 0.27 * math.sin(a), Z), G(0.18 * math.cos(a), 0.18 * math.sin(a), Z - 0.17), G(0, 0, Z - 0.2)], 0.008, m=M['steel'], corner=0.05))
    o.append(mn.cyl('cable', 0.014, 1.4, loc=G(0, 0, Z + 0.3), m=M['rubber'], bevel=0, verts=10))
    o.append(tape_front(0.0, 0.0, Z + 0.62, 0.05, 0, M, w=0.06))  # taped-up cable
    mn.outline(o, thickness=0.012)
    win('interior/lamp_ceiling_' + ('on' if on else 'off'), -0.36, 0.36, -0.35, 0.35, 3.2, origin=(0.0, 0.0), zmin=Z - 0.3,
        extra={'note': 'pendant lamp at 2.0 above the floor; origin = the floor point under it (LIGHTS); the light is a runtime light'})

def lamp_wall(on):
    mn.reset(); M = mats(); o = []
    zc = 1.15
    o.append(gbox('back', -0.2, -0.01, 0.2, 0.03, zc - 0.13, zc + 0.13, M['dark'], 0.02))
    lens = glow('lens_warm', '#ffd8a0', 1.3) if on else pmat('lens_dead', '#6a6658', 0.2)
    o.append(mn.sphere('lens', 0.15, loc=G(0, 0.03, zc), m=lens, scale=(1.15, 0.45, 0.65), segs=20))
    for dz in (-0.06, 0.0, 0.06):                            # cage bars
        o.append(gbox('bar', -0.17, 0.08, 0.17, 0.1, zc + dz - 0.01, zc + dz + 0.01, M['steel'], 0.005))
    o.append(gbox('bar_v', -0.01, 0.08, 0.01, 0.1, zc - 0.1, zc + 0.1, M['steel'], 0.005))
    mn.outline(o, thickness=0.012)
    win('interior/lamp_wall_' + ('on' if on else 'off'), -0.24, 0.24, 0.0, 0.14, zc + 0.18, origin=(0.0, 0.0), zmin=zc - 0.2,
        extra={'note': 'bulkhead lamp on a back wall front face, centre 1.15 high; origin = wall foot (x, front-face y)'})

def status(state):
    mn.reset(); M = mats(); o = []
    o.append(gbox('box', -0.1, -0.1, 0.1, 0.1, 0, 0.05, M['dark'], 0.015))
    o.append(mn.sphere('dome', 0.075, loc=G(0, 0, 0.05), m=lamp_mat(state), scale=(1, 1, 0.75), segs=16))
    mn.outline(o, thickness=0.01)
    win('interior/status_' + state, -0.13, 0.13, -0.13, 0.13, 0.15, origin=(0.0, 0.0),
        extra={'note': "status lamp (lamp() in js/art.js); origin = centre on its surface"})

# ---------------------------------------------------------------------------
ZONE_LABEL = {'red': '#ff9a8a', 'white': '#e8ecf4', 'blue': '#9cc4ff'}
CAP, MID = 18 / 96, 24 / 96

def plaque(zone):
    mn.reset(); M = mats(); o = []
    L = 3.0; z0, z1 = 0.42, 0.74
    plate = pmat('plq', '#2b303a', 0.5, 0.3)                  # no grime: the middle must tile
    o.append(gbox('plate', 0.02, -0.01, L - 0.02, 0.04, z0, z1, plate, 0.02))
    o.append(gbox('stripe', 0.06, 0.035, L - 0.06, 0.045, z0 + 0.03, z0 + 0.07, pmat('stripe', ZONE_LABEL[zone], 0.45), 0.004))
    for x in (0.09, L - 0.09):
        for z in (z0 + 0.12, z1 - 0.07):
            o.append(rivet(x, 0.045, z, M, 'front', 0.022))
    mn.outline(o, thickness=0.01)
    for part, (a, b) in (('l', (0.0, CAP)), ('m', (1.0, 1.0 + MID)), ('r', (L - CAP, L))):
        win(f'interior/plaque_{zone}_{part}', a, b, 0.0, 0.07, z1 + 0.04, origin=(a, 0.0), zmin=z0 - 0.04,
            extra={'note': 'room-name plaque, 9-slice (l, m repeated, r) on a back wall front face; origin = wall foot at the left edge. Text: drawn by the game.'})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    def want(n): return not only or only in n
    for lit in (False, True):
        if want('interior/gun_ladder' + ('_lit' if lit else '')): gun_ladder(lit)
    for on in (True, False):
        if want('interior/lamp_ceiling'): lamp_ceiling(on)
        if want('interior/lamp_wall'): lamp_wall(on)
    for st in ('open', 'closed', 'busy', 'busy_off', 'off'):
        if want('interior/status_' + st): status(st)
    for z in ZONE_LABEL:
        if want('interior/plaque_' + z): plaque(z)
