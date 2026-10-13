"""Gun ladders, lamps and room plaques.

Gun ladder (drawGunLadder in js/art.js; GUNS[i].hatch in js/ship.js)
  interior/gun_ladder        an open floor hatch (0.72 x 0.72 footprint, like the game's square) with the
                             ladder going DOWN into a dark well (the cannons' crawlways run under the
                             deck): hazard ring flush with the floor, the lid swung open behind it, the
                             top rungs and the grab rails sticking up out of the hole. Origin = g.hatch
                             (the centre of the footprint), floor. Below-floor parts are seen only
                             through the hole (a holdout floor around it); their height clamps to 0, so
                             in the game the hole counts as floor. The 'CANNON' text stays in the game.
  interior/gun_ladder_lit    manned: a light glowing up out of the well, the lid's beacon lit green.
  interior/gun_ladder_broken the cannon broken: scorched ring, bent rails and top rungs, the lid knocked
                             askew, the beacon smashed, sparks from a torn cable. Same canvas and origin.

Lamps (drawLightPools in js/interior.js, lamp() in js/art.js). The light itself (the warm pools) is a
runtime light; nothing is baked into the floors.
  interior/lamp_ceiling_on / _off   caged pendant lamp hanging at 2.0 above the floor (over the walls'
                                    1.6, so it is drawn last); origin = the floor point under it = the
                                    LIGHTS entry. The cable runs up out of the canvas top.
  interior/lamp_wall_on / _off      caged bulkhead lamp for a back wall's front face (~1.0 wide), centre
                                    1.15 high; origin = the wall foot under its centre (x, front-face y).
                                    On: the lens glows warm; off: a dark lens.
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
from mathutils import Matrix

def cone(name, r1, r2, h, loc, m, verts=32):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; mn.bev(o, 0.01); mn.assign(o, m); mn.smooth(o); return o

# ---------------------------------------------------------------------------
def gun_ladder(lit, broken=False):
    mn.reset(); M = mats(); o = []; fx = []
    s = 0.36; R = 0.27; D = 1.4                             # footprint half size, hole radius, well depth
    # floor plate with the hole, hazard ring flush with the floor, a dark rim lip
    plate = gbox('plate', -s, -s, s, s, -0.02, 0.02, M['body'], 0.02)
    cut = mn.cyl('cut', R + 0.005, 0.2, loc=G(0, 0, -0.1), verts=48, bevel=0)
    bo = plate.modifiers.new('hole', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cut
    plate.modifiers.move(len(plate.modifiers) - 1, 0); cut.hide_render = True; cut.hide_viewport = True
    o.append(plate)
    o.append(ring('lip', R + 0.02, 0.03, 0.035, loc=G(0, 0, -0.01), m=M['dark']))
    o.append(ring('hz_ring', R + 0.075, 0.055, 0.03, loc=G(0, 0, 0.0), m=M['hazard_big']))
    for i in range(4):                                      # corner bolts
        x, y = (-1 if i % 2 else 1) * (s - 0.05), (-1 if i // 2 else 1) * (s - 0.05)
        o.append(rivet(x, y, 0.02, M, 'up', 0.022))
    # the well: a tube going down (seen only through the hole), a dark bottom, bands
    o.append(ring('shaft', R + 0.04, 0.04, D, loc=G(0, 0, -D), m=M['panel'], verts=40))
    for z in (-0.35, -0.8):
        o.append(ring('sband', R + 0.005, 0.02, 0.05, loc=G(0, 0, z), m=M['rim'], verts=40))
    o.append(mn.cyl('bottom', R + 0.02, 0.02, loc=G(0, 0, -D), m=glow('well_glow', '#7fe8a4', 1.4) if lit else M['hole'], bevel=0, verts=32))
    # the ladder on the far (north) wall: rails rising out of the hole as grab handles, rungs going down
    ry = -(R - 0.05)
    for sx in (-1, 1):
        x = sx * 0.12
        if broken and sx > 0:                               # this rail bent over sideways
            o.append(pipe('rail', [G(x, ry, -D + 0.1), G(x, ry, 0.0), G(x + 0.05, ry + 0.02, 0.16), G(x + 0.2, ry + 0.12, 0.22)], 0.02, m=M['steel'], corner=0.06))
        else:
            o.append(pipe('rail', [G(x, ry, -D + 0.1), G(x, ry, 0.3), G(x, ry + 0.1, 0.4), G(x, ry + 0.2, 0.3), G(x, ry + 0.2, 0.06)], 0.02, m=M['steel'], corner=0.06))
    for k in range(6):
        z = -0.08 - k * 0.22
        if broken and k == 0:                               # the top rung kinked down, the next one hanging off one end
            o.append(pipe('rung', [G(-0.12, ry, z), G(0.0, ry + 0.03, z - 0.09), G(0.12, ry, z)], 0.016, m=M['steel'], corner=0.03))
            continue
        if broken and k == 1:
            o.append(pipe('rung', [G(-0.12, ry, z), G(-0.03, ry + 0.04, z - 0.2)], 0.016, m=M['steel'], corner=0.0))
            continue
        o.append(mn.cyl('rung', 0.016, 0.24, loc=G(-0.12, ry, z), m=M['steel'], rot=RY90, bevel=0.004, verts=10))
    if lit:                                                 # the light coming up out of the well
        ld = bpy.data.lights.new('well_light', 'POINT'); ld.energy = 14; ld.color = (0.55, 1.0, 0.7); ld.shadow_soft_size = 0.15
        lo = mn.link(bpy.data.objects.new('well_light', ld)); lo.location = G(0, 0.05, -0.5)
    # the lid, swung open on its hinge at the north edge (leaning back a little): hazard face, handle, beacon
    hy = -s + 0.02
    lid_rot = (math.radians(86 if not broken else 72), math.radians(0 if not broken else 14), 0)   # standing up, just past vertical (broken: knocked askew)
    lid = mn.cyl('lid', R + 0.01, 0.05, loc=G(0, hy, 0.02), m=M['door'], rot=lid_rot, bevel=0.012, verts=32)
    lid.data.transform(Matrix.Translation((0, R + 0.01, 0)))   # pivot = the hinge (its edge)
    o.append(lid)
    face = mn.cyl('lid_face', R - 0.05, 0.012, loc=G(0, hy, 0.02), m=M['hazard'], rot=lid_rot, bevel=0.003, verts=32)
    face.data.transform(Matrix.Translation((0, R + 0.01, 0.05)))
    o.append(face)
    hnd = mn.box('lid_handle', (0.18, 0.04, 0.04), m=M['steel'], bevel=0.01, rot=lid_rot)
    hnd.data.transform(Matrix.Translation((0, R + 0.01, 0.062))); hnd.location = G(0, hy, 0.02)
    o.append(hnd)
    for sx in (-1, 1):
        o.append(mn.cyl('hinge', 0.03, 0.12, loc=G(sx * 0.18 - 0.06, hy, 0.04), m=M['rim'], rot=RY90, bevel=0.006, verts=12))
    o.append(mn.cyl('bc_base', 0.05, 0.04, loc=G(s - 0.08, -s + 0.08, 0.02), m=M['dark'], bevel=0.01))
    if broken:
        o.append(mn.sphere('bc', 0.045, loc=G(s - 0.08, -s + 0.08, 0.06), m=pmat('bc_dead', '#1e2a22', 0.3), scale=(1, 0.8, 0.4), segs=10))
    else:
        o.append(mn.sphere('bc', 0.045, loc=G(s - 0.08, -s + 0.08, 0.08), m=glow('bc_on', '#47e07a', 1.5) if lit else pmat('bc_off', '#2d5a3c', 0.25), segs=16))
    o.append(tape_strip(-0.2, 0.27, 0.021, 0.18, 30, M, w=0.06))  # duct tape over a crack in the plate
    if broken:
        soot = pmat('soot', '#2a211b', 0.95, 0.0, grime=1.0, grime_scale=8)
        for k, (a, r) in enumerate(((200, 0.08), (250, 0.06), (300, 0.075), (30, 0.055), (80, 0.07), (130, 0.05))):
            a = math.radians(a)
            fx.append(mn.sphere('scorch', 1.0, loc=G(0.31 * math.cos(a), -0.31 * math.sin(a), 0.032), m=soot, scale=(r, r * 0.7, 0.006), segs=16))
        # a torn cable out of the well's lip, sparking
        ex, ey, ez = 0.3, 0.22, 0.12
        fx.append(pipe('cable', [G(0.18, 0.12, -0.3), G(0.22, 0.17, 0.02), G(ex, ey, ez)], 0.02, m=M['cables'][0], corner=0.06))
        for k in range(3):
            a = k * 2.1
            fx.append(pipe('strand', [G(ex, ey, ez), G(ex + math.cos(a) * 0.04, ey + 0.03, ez + 0.03)], 0.006, m=M['copper'], corner=0.0))
        sp_m = glow('spark', '#ffe7a0', 3.0)
        for (cx, cy, cz, n) in ((ex + 0.02, ey + 0.03, ez + 0.04, 6), (-0.14, -0.2, 0.2, 4)):
            fx.append(mn.sphere('spark_core', 0.035, loc=G(cx, cy, cz), m=glow('spark_hot', '#ffffff', 4.0), segs=10))
            for k in range(n):
                sp = mn.box('spark', (0.013, 0.013, 0.09 + 0.05 * (k % 2)), m=sp_m, bevel=0)
                sp.location = G(cx, cy, cz); sp.rotation_euler = (math.radians(25 + 20 * (k % 3)), k * 6.28 / n + 0.3, 0); fx.append(sp)
    mn.outline([x for x in o if x.name.split('.')[0] not in ('shaft', 'sband', 'bottom')], thickness=0.012)
    # the floor round the hole hides what is below it (the well is seen only through the hole)
    mask = ring('floor_mask', 3.0, 3.0 - R - 0.01, 0.002, loc=G(0, 0, -0.004), m=M['dark'], verts=48)
    holdout([mask])
    name = 'interior/gun_ladder' + ('_broken' if broken else '_lit' if lit else '')
    win(name, -0.45, 0.45, -0.45, 0.42, 0.75, origin=(0.0, 0.0), zmin=-0.05,
        extra={'note': 'floor hatch with the ladder down to a cannon; origin = GUNS[i].hatch, floor; footprint 0.72 x 0.72' + ('; broken' if broken else '')})

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
    """Chunky caged bulkhead lamp, ~1.0 wide: a dark mounting plate with bolts, a thick housing rim round a
    wide capsule lens, a heavy wire cage over it, a conduit up into the wall's cable tray."""
    mn.reset(); M = mats(); o = []
    zc = 1.15
    o.append(gbox('plate', -0.46, -0.01, 0.46, 0.04, zc - 0.22, zc + 0.22, M['cap'], 0.03))          # mounting plate
    for x in (-0.41, 0.41):
        for dz in (-0.16, 0.16):
            o.append(rivet(x, 0.04, zc + dz, M, 'front', 0.026))
    o.append(gbox('housing', -0.37, 0.03, 0.37, 0.12, zc - 0.17, zc + 0.17, M['dark'], 0.06))       # housing round the lens
    o.append(gbox('rim', -0.35, 0.11, 0.35, 0.15, zc - 0.15, zc + 0.15, M['rim'], 0.05))
    lens = glow('lens_warm', '#ffb35a', 3.2) if on else pmat('lens_dead', '#34373b', 0.15, 0.1)
    o.append(mn.sphere('lens', 1.0, loc=G(0, 0.14, zc), m=lens, scale=(0.32, 0.13, 0.135), segs=28))
    if on:                                                   # the white-hot filament bar inside
        o.append(mn.sphere('core', 1.0, loc=G(0, 0.25, zc + 0.02), m=glow('lens_hot', '#fff6e6', 6.0), scale=(0.22, 0.02, 0.05), segs=16))
    # the cage: two horizontal bars, three vertical hoops (open enough to see the lens), end clamps
    for dz in (-0.075, 0.075):
        o.append(gbox('bar', -0.36, 0.3, 0.36, 0.32, zc + dz - 0.013, zc + dz + 0.013, M['steel'], 0.006))
    for x in (-0.33, 0.0, 0.33):
        o.append(pipe('hoop', [G(x, 0.12, zc - 0.17), G(x, 0.31, zc - 0.12), G(x, 0.31, zc + 0.12), G(x, 0.12, zc + 0.17)], 0.014, m=M['steel'], corner=0.06))
    for x in (-0.4, 0.4):
        o.append(gbox('clamp', x - 0.04, 0.03, x + 0.04, 0.2, zc - 0.07, zc + 0.07, M['yellow'], 0.015))
    o.append(mn.cyl('conduit', 0.032, 0.3, loc=G(0.24, 0.05, zc + 0.2), m=M['rubber'], bevel=0, verts=10))
    o.append(mn.cyl('gland', 0.045, 0.05, loc=G(0.24, 0.05, zc + 0.17), m=M['steel'], bevel=0.008, verts=10))
    o.append(tape_front(-0.24, 0.042, zc + 0.19, 0.16, -8, M, w=0.05))
    mn.outline([x for x in o if x.name.split('.')[0] not in ('lens', 'core')], thickness=0.014)
    win('interior/lamp_wall_' + ('on' if on else 'off'), -0.52, 0.52, 0.0, 0.36, zc + 0.5, origin=(0.0, 0.0), zmin=zc - 0.26,
        extra={'note': 'caged bulkhead lamp (~1.0 wide) on a back wall front face, centre 1.15 high; origin = wall foot (x, front-face y)'})

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
    if want('interior/gun_ladder_broken'): gun_ladder(False, broken=True)
    for on in (True, False):
        if want('interior/lamp_ceiling'): lamp_ceiling(on)
        if want('interior/lamp_wall'): lamp_wall(on)
    for st in ('open', 'closed', 'busy', 'busy_off', 'off'):
        if want('interior/status_' + st): status(st)
    for z in ZONE_LABEL:
        if want('interior/plaque_' + z): plaque(z)
