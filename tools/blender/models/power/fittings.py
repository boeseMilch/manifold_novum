"""Power-line fittings: where the cables (js/cables.js, procedural) plug into things and go through walls.

The cables themselves are drawn by the game (a lit, ribbed strip along POWER_LINES in js/systems.js); these
are the fixed pieces at their ends, modelled to meet the game's cable exactly: an armoured cable of radius
CABLE_R lying on the floor (axis at height CABLE_R), dark gunmetal jacket with steel ribs and an amber
indicator window along its top (lit while the line is live). Every fitting's cable leaves it along +x
(dir 0 = game angle 0; dir i faces game angle i * 360 / dirs), and its stub ends REACH units from the origin
on the floor, where the game's cable takes over (POWER_FITTINGS in js/systems.js uses the same numbers).

Renders (build/renders/power/), each in _on (line live: amber LED and window) and _off:
  plug_{on,off}        8 dirs. A socket bolted to a machine's face (capacitor cabinets, the reactor, the
                       shield buttons): mounting flange with hazard band and a PWR tag, socket collar, a
                       heavy plug with a yellow latch and a ribbed boot. Origin = the point on the machine's
                       face at floor level; REACH 0.40.
  gland_{on,off}       8 dirs. Where the cables meet the power lever (js/systems.js leverPort): a steel saddle
                       clamped to the foot of the lever's round dial (r 0.5, the dial at x < 0), a hex cable
                       gland on it and a short ribbed boot down to the floor; an amber LED on top. The trunk
                       from the reactor goes in through one, the three branches (LEFT, MID, RIGHT) come out of
                       the others. Origin = the dial's rim at floor level; REACH 0.22.
  box_{on,off}         4 dirs. A conduit box on a wall where the cable goes into it (dir 0: on a left wall's
                       inner face, cable leaving east; 1: a back wall, leaving south; 2: a right wall;
                       3: a near wall, leaving north). Origin = the wall face at floor level; REACH 0.48.
  riser_{on,off}       1 dir (cable leaving south). The same box on a lower-deck back wall with an armoured
                       conduit rising up the wall face into it: the line climbs through the spine to the
                       upper deck (where a box_ dir 3 lets it out again). Origin as box_; REACH 0.48.
  clamp                8 dirs (the cable's direction, 45 degrees). A steel strap over the cable with a yellow tag,
                       bolted down on both sides; js/cables.js puts one every ~3 units. Origin = on the axis.
  jack_{port,star}_{on,off}   outside, on the gun blister: an outlet on the hull wall's outer face, a short
                       armoured cable and a connector clamped onto the cannon's pedestal (the mount in the hull
                       body). Origin = the cannon's pivot (GUNS[i].x, y), z = 0.
  jack_front_{on,off}  on the nose wall's top (z 1.6), where the front cannon is drawn: an outlet coming up
                       through the wall top right of the helm's turret, the cable along the wall top and a
                       connector collar at the turret's base. Origin = the turret as drawn: (22.2, -2.8), z 1.6.

    blender -b --factory-startup --python tools/blender/models/power/fittings.py [-- quick] [-- plug gland box riser clamp jack]
"""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'systems'))
from syslib import *
from mathutils import Vector

CABLE_R = 0.095                          # the game's cable (js/cables.js CABLE_R)
JACKET, RIB, AMBER, AMBER_OFF = '#3d4352', '#7d8696', '#ffb640', '#4a3f2c'
BOX_PAINT = '#4a8090'                    # the capacitor cabinet's teal: power gear
Y90 = (0, math.radians(90), 0)           # cylinders along +x

def mats(on):
    M = stdmats()
    M['jacket'] = worn('jacket', JACKET, 0.55, 0.45, wear=0.4)
    M['rib'] = pmat('rib', RIB, 0.35, 0.8, grime=0.3)
    M['window'] = glow('window', AMBER, 1.1) if on else pmat('window_off', AMBER_OFF, 0.25, 0.1)
    M['led'] = glow('led', AMBER, 1.4) if on else M['lamp_off']
    M['paint'] = worn('bpaint', BOX_PAINT, 0.5, 0.3)
    M['yellow'] = pmat('yellow', '#e8c34f', 0.45, 0.1, grime=0.3)
    return M

def _rot_to(d):
    """Euler that turns +Z onto direction d (for cylinders along a path)."""
    return Vector(d).normalized().to_track_quat('Z', 'Y').to_euler()

def armoured(P, M, name, pts, r=CABLE_R, corner=0.12, rib_step=0.075):
    """The game's cable as a mesh: jacket tube, steel ribs every rib_step, the amber window strip on top."""
    from shiplib import _fillet
    P(pipe(name, pts, r, M['jacket'], corner=corner))
    dense = _fillet(pts, corner)
    # walk the path: ribs at even spacing, the window strip slightly above the jacket's top
    acc, nxt = 0.0, rib_step * 0.5
    top = []
    for a, b in zip(dense[:-1], dense[1:]):
        seg = (b - a); L = seg.length
        if L < 1e-6: continue
        while nxt <= acc + L:
            p = a + seg * ((nxt - acc) / L)
            o = mn.cyl(name + '_rib', r * 1.09, 0.022, m=M['rib'], verts=16, bevel=0.006)
            o.rotation_euler = _rot_to(seg); o.location = p - seg.normalized() * 0.011
            P(o); nxt += rib_step
        acc += L
    for p in dense: top.append((p.x, p.y, p.z + r * 0.86))
    P(pipe(name + '_win', top, r * 0.3, M['window'], corner=corner * 0.8))

def plug_head(P, M, x0=0.0, z=0.16, tag=True):
    """Flange at x0 (against a face), socket collar, plug body with latch, ribbed boot down to the floor;
    the boot ends at x0 + 0.40 on the floor (cable axis at CABLE_R)."""
    P(mn.box('flange', (0.05, 0.36, 0.33), loc=(x0 + 0.025, 0, 0.0), m=M['frame'], bevel=0.015))
    P(mn.box('flange_hz', (0.054, 0.36, 0.06), loc=(x0 + 0.027, 0, 0.27), m=M['hazard'], bevel=0.006))
    for sy in (-0.13, 0.13):
        for bz in (0.05, 0.22):
            P(mn.cyl('bolt', 0.02, 0.025, loc=(x0 + 0.045, sy, bz), m=M['steel'], rot=Y90, verts=6, bevel=0.005))
    P(mn.cyl('collar', 0.13, 0.07, loc=(x0 + 0.045, 0, z), m=M['steel'], rot=Y90, verts=24, bevel=0.015))
    P(mn.cyl('collar_y', 0.136, 0.02, loc=(x0 + 0.1, 0, z), m=M['yellow'], rot=Y90, verts=24, bevel=0.004))
    P(mn.cyl('body', 0.105, 0.13, loc=(x0 + 0.115, 0, z), m=M['rubber'], rot=Y90, verts=20, bevel=0.02))
    for gx in (0.15, 0.185, 0.22):
        P(mn.cyl('grip', 0.111, 0.012, loc=(x0 + gx, 0, z), m=M['dark'], rot=Y90, verts=20, bevel=0.003))
    P(mn.box('latch', (0.13, 0.06, 0.025), loc=(x0 + 0.13, 0, z + 0.095), m=M['yellow'], bevel=0.008, rot=(0, math.radians(-8), 0)))
    P(mn.cyl('latch_pin', 0.018, 0.08, loc=(x0 + 0.075, -0.04, z + 0.11), m=M['steel'], rot=(math.radians(-90), 0, 0), verts=8, bevel=0.004))
    led = P(mn.sphere('led', 0.028, loc=(x0 + 0.05, 0.12, 0.335), m=M['led'], scale=(1, 1, 0.7)))
    if tag:
        P(mn.box('tag', (0.1, 0.16, 0.012), loc=(x0 + 0.03, -0.06, 0.33), m=M['sticker'], bevel=0.003))
        P(label('tag_t', 'PWR', 0.05, (x0 + 0.03, -0.06, 0.343), rot=(0, 0, math.radians(90)), m=M['ink']))
    # boot: from the plug body down to the floor, ribbed, a turn of duct tape
    P(pipe('boot', [(x0 + 0.24, 0, z), (x0 + 0.32, 0, z - 0.02), (x0 + 0.40, 0, CABLE_R)], 0.093, M['rubber'], corner=0.06))
    for bx, bz in ((0.27, z - 0.003), (0.3, z - 0.01)):
        P(mn.cyl('boot_rib', 0.1, 0.014, loc=(x0 + bx, 0, bz), m=M['dark'], rot=Y90, verts=16, bevel=0.003))
    P(mn.cyl('boot_tape', 0.097, 0.045, loc=(x0 + 0.33, 0, z - 0.035), m=M['tape'], rot=(0, math.radians(110), 0), verts=16, bevel=0.004))
    armoured(P, M, 'lead', [(x0 + 0.385, 0, CABLE_R), (x0 + 0.42, 0, CABLE_R)], corner=0.0, rib_step=1.0)
    return led

def plug(on):
    s = mn.reset(); M = mats(on); P = Parts()
    plug_head(P, M)
    outline(P, 0.012)
    root = mn.group('root', list(P))
    mn.render(f'power/plug_{"on" if on else "off"}', objs=list(P), root=root, dirs=8)

DIAL_R = 0.5                             # the lever's dial (models/systems/lever.py)

def gland(on):
    s = mn.reset(); M = mats(on); P = Parts()
    # saddle: a block hugging the dial's foot (its back half sunk into the dial)
    P(mn.box('saddle', (0.14, 0.24, 0.2), loc=(0.02, 0, 0.0), m=M['frame'], bevel=0.02))
    P(mn.box('saddle_hz', (0.145, 0.245, 0.04), loc=(0.02, 0, 0.15), m=M['hazard'], bevel=0.005))
    for sy in (-0.085, 0.085):
        P(mn.cyl('bolt', 0.018, 0.02, loc=(0.06, sy, 0.2), m=M['steel'], verts=6, bevel=0.004))
    P(mn.cyl('lamp_rim', 0.036, 0.02, loc=(0.05, 0, 0.2), m=M['steel'], verts=16, bevel=0.005))
    P(mn.sphere('led', 0.028, loc=(0.05, 0, 0.215), m=M['led'], scale=(1, 1, 0.7)))
    # gland: hex nut and a yellow collar on the outer face, the boot down to the floor
    gz = 0.09
    P(mn.cyl('gland_nut', 0.1, 0.035, loc=(0.088, 0, gz), m=M['steel'], rot=Y90, verts=6, bevel=0.008))
    P(mn.cyl('gland_y', 0.104, 0.015, loc=(0.12, 0, gz), m=M['yellow'], rot=Y90, verts=20, bevel=0.003))
    P(pipe('boot', [(0.13, 0, gz), (0.17, 0, gz - 0.005), (0.22, 0, CABLE_R)], 0.092, M['rubber'], corner=0.03))
    P(mn.cyl('boot_rib', 0.099, 0.014, loc=(0.155, 0, gz - 0.002), m=M['dark'], rot=Y90, verts=16, bevel=0.003))
    armoured(P, M, 'lead', [(0.205, 0, CABLE_R), (0.24, 0, CABLE_R)], corner=0.0, rib_step=1.0)
    outline(P, 0.012)
    root = mn.group('root', list(P))
    mn.render(f'power/gland_{"on" if on else "off"}', objs=list(P), root=root, dirs=8)

def wall_box(P, M, riser=False):
    """A teal junction box against a wall face (wall at x < 0), its cable gland low on the front; the boot
    reaches the floor at x 0.48. riser: an armoured conduit climbs the wall face out of its top."""
    D, W, Z0, Z1 = 0.26, 0.48, 0.06, 0.56
    P(mn.box('bracket', (0.08, W - 0.06, 0.06), loc=(0.04, 0, 0.0), m=M['frame'], bevel=0.015))
    P(mn.box('box', (D, W, Z1 - Z0), loc=(D / 2, 0, Z0), m=M['paint'], bevel=0.04))
    P(mn.box('lid', (0.03, W - 0.07, Z1 - Z0 - 0.08), loc=(D + 0.005, 0, Z0 + 0.04), m=M['body2'], bevel=0.012))
    for sy in (-1, 1):
        for sz in (Z0 + 0.075, Z1 - 0.075):
            P(mn.cyl('screw', 0.018, 0.02, loc=(D + 0.018, sy * (W / 2 - 0.07), sz), m=M['steel'], rot=Y90, verts=8, bevel=0.004))
    P(mn.box('hz', (0.012, W - 0.12, 0.06), loc=(D + 0.026, 0, Z1 - 0.15), m=M['hazard'], bevel=0.003))
    P(mn.box('pwr', (0.012, 0.2, 0.075), loc=(D + 0.026, 0.07, Z0 + 0.2), m=M['sticker'], bevel=0.003))
    P(label('pwr_t', 'PWR', 0.055, (D + 0.034, 0.07, Z0 + 0.238), rot=(math.radians(90), 0, math.radians(90)), m=M['ink']))
    P(mn.cyl('lamp_rim', 0.045, 0.025, loc=(D + 0.02, -0.12, Z0 + 0.24), m=M['steel'], rot=Y90, verts=16, bevel=0.006))
    led = P(mn.sphere('led', 0.034, loc=(D + 0.045, -0.12, Z0 + 0.24), m=M['led'], scale=(0.7, 1, 1)))
    P(mn.box('tape', (0.012, 0.09, 0.2), loc=(D + 0.03, 0.17, Z0 + 0.18), m=M['tape'], bevel=0.002, rot=(math.radians(18), 0, 0)))
    # the cable gland and the boot down to the floor
    gz = Z0 + 0.075
    P(mn.cyl('gland', 0.105, 0.05, loc=(D + 0.02, 0, gz), m=M['steel'], rot=Y90, verts=20, bevel=0.012))
    P(mn.cyl('gland_nut', 0.112, 0.03, loc=(D + 0.035, 0, gz), m=M['frame'], rot=Y90, verts=6, bevel=0.006))
    P(pipe('boot', [(D + 0.05, 0, gz), (0.4, 0, gz - 0.01), (0.48, 0, CABLE_R)], 0.092, M['rubber'], corner=0.05))
    armoured(P, M, 'lead', [(0.46, 0, CABLE_R), (0.5, 0, CABLE_R)], corner=0.0, rib_step=1.0)
    if riser:
        # conduit from the box's top up the wall face, into the wall through a flange near the top
        cz = 1.0
        P(mn.cyl('top_gland', 0.075, 0.05, loc=(0.12, 0, Z1 - 0.01), m=M['steel'], verts=16, bevel=0.01))
        armoured(P, M, 'riser', [(0.12, 0, Z1 + 0.02), (0.12, 0, cz), (-0.02, 0, cz)], r=0.07, corner=0.1, rib_step=0.07)
        P(mn.cyl('wall_flange', 0.12, 0.03, loc=(0.0, 0, cz), m=M['frame'], rot=Y90, verts=20, bevel=0.008))
        for z in (0.68,):
            P(mn.box('strap', (0.03, 0.2, 0.04), loc=(0.2, 0, z), m=M['steel'], bevel=0.008))
            for sy in (-0.09, 0.09):
                P(mn.cyl('strap_bolt', 0.016, 0.02, loc=(0.2, sy, z + 0.02), m=M['dark'], rot=Y90, verts=6, bevel=0.003))
        P(mn.box('riser_tag', (0.01, 0.15, 0.06), loc=(0.2, 0, 0.8), m=M['hazard'], bevel=0.002))
    return led

def box(on):
    s = mn.reset(); M = mats(on); P = Parts()
    wall_box(P, M)
    outline(P, 0.012)
    root = mn.group('root', list(P))
    mn.render(f'power/box_{"on" if on else "off"}', objs=list(P), root=root, dirs=4)

def riser(on):
    s = mn.reset(); M = mats(on); P = Parts()
    wall_box(P, M, riser=True)
    outline(P, 0.012)
    root = mn.group('root', list(P)); root.rotation_euler.z = -math.radians(90)   # cable leaving south (game +y)
    bpy.context.view_layer.update()
    mn.render(f'power/riser_{"on" if on else "off"}', objs=list(P))

def clamp():
    """A strap over the cable (cable along +x, top at 2 * CABLE_R), bolted to the floor on both sides."""
    s = mn.reset(); M = mats(False); P = Parts()
    t = 2 * CABLE_R
    P(pipe('strap', [(0, -0.15, 0.0), (0, -0.11, t * 0.85), (0, -0.06, t + 0.02), (0, 0.06, t + 0.02), (0, 0.11, t * 0.85), (0, 0.15, 0.0)], 0.024, M['steel'], corner=0.05))
    P(mn.box('tag', (0.05, 0.07, 0.01), loc=(0, 0, t + 0.035), m=M['yellow'], bevel=0.003))
    for sy in (-1, 1):
        P(mn.box('foot', (0.11, 0.08, 0.025), loc=(0, sy * 0.17, 0), m=M['frame'], bevel=0.01))
        P(mn.cyl('bolt', 0.022, 0.02, loc=(0, sy * 0.175, 0.025), m=M['steel'], verts=6, bevel=0.005))
    outline(P, 0.008)
    root = mn.group('root', list(P))
    mn.render('power/clamp', objs=list(P), root=root, dirs=8)

# --- outside: the cannons ---------------------------------------------------------------------------------
PED_R = 0.6                              # the gun pedestal in the hull body (models/hull/body.py)

def side_jack(P, M, sg, wall_dx, wall_dy):
    """Port (sg = -1) / star (+1): the hull wall's outer face is wall_dx from the pivot (towards the ship, -sg
    in x), the outlet sits on it wall_dy north of the pivot; the cable leaves it outwards, turns and goes into
    a connector clamped onto the pedestal's north side (turned a little towards the wall). Built in game
    coordinates relative to the pivot (G flips y)."""
    G = lambda x, y, z=0.0: (x, -y, z)
    wx, oy = -sg * wall_dx, -wall_dy
    # outlet: a squat teal box on the wall face, hazard band, LED, a gland pointing out from the hull
    P(mn.box('outlet', (0.2, 0.34, 0.3), loc=G(wx + sg * 0.1, oy, 0.0), m=M['paint'], bevel=0.035))
    P(mn.box('outlet_hz', (0.205, 0.345, 0.05), loc=G(wx + sg * 0.1, oy, 0.24), m=M['hazard'], bevel=0.006))
    led = P(mn.sphere('led', 0.03, loc=G(wx + sg * 0.1, oy - 0.11, 0.3), m=M['led'], scale=(1, 1, 0.7)))
    P(mn.box('o_tag', (0.12, 0.012, 0.07), loc=G(wx + sg * 0.1, oy + 0.172, 0.08), m=M['sticker'], bevel=0.002))
    P(mn.cyl('o_gland', 0.1, 0.06, loc=G(wx + sg * 0.19, oy, 0.13), m=M['steel'], rot=(0, sg * math.radians(90), 0), verts=20, bevel=0.012))
    # connector on the pedestal (radius PED_R), facing out along angle a
    a = math.radians(-90 - sg * 22)
    ca, sa = math.cos(a), math.sin(a)
    cx, cy = ca * (PED_R - 0.02), sa * (PED_R - 0.02)
    clamp = P(mn.box('clamp', (0.2, 0.28, 0.2), m=M['frame'], bevel=0.03))
    clamp.location = G(cx, cy, 0.0); clamp.rotation_euler.z = -a
    band = P(mn.box('clamp_hz', (0.205, 0.285, 0.045), m=M['hazard'], bevel=0.006))
    band.location = G(cx, cy, 0.16); band.rotation_euler.z = -a
    for k, (r, ln, m) in enumerate(((0.105, 0.08, M['steel']), (0.111, 0.02, M['yellow']))):
        o = P(mn.cyl(f'c_collar{k}', r, ln, m=m, verts=20, bevel=0.01))
        o.rotation_euler = (0, math.radians(90), -a); o.location = G(cx + ca * (0.09 + k * 0.05), cy + sa * (0.09 + k * 0.05), 0.12)
    # the cable: out of the gland, down onto the deck, round to the connector
    p0 = (wx + sg * 0.24, oy, 0.13)
    p1 = (wx + sg * 0.42, oy + 0.02, CABLE_R)
    p3 = (cx + ca * 0.16, cy + sa * 0.16, 0.12)
    p2 = (cx + ca * 0.42, cy + sa * 0.42, CABLE_R)
    armoured(P, M, 'stub', [G(*p0), G(*p1), G(*p2), G(*p3)], corner=0.16)
    P(mn.box('tape', (0.07, 0.22, 0.21), loc=G((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, 0.0), m=M['tape'], bevel=0.004,
             rot=(0, 0, -math.atan2(p2[1] - p1[1], p2[0] - p1[0]))))
    return led

def jack_side(side, on):
    s = mn.reset(); M = mats(on); P = Parts()
    if side == 'port': side_jack(P, M, -1, 0.9, 1.15)         # GUNS port (-0.9, 7.1), wall face x 0, outlet y 5.95
    else: side_jack(P, M, 1, 0.9, 1.15)                       # GUNS star (45.3, 6.9), wall face x 44.4
    outline(P, 0.012)
    mn.render(f'power/jack_{side}_{"on" if on else "off"}', objs=list(P))

def jack_front(on):
    """On the nose wall's top (the jack sprite is drawn at z 1.6): an outlet rising through the wall top at
    x +2.0 (game 24.2, right above the conduit box on the wall face below), the cable along the top to a
    connector collar at the turret's base (x +0.55)."""
    s = mn.reset(); M = mats(on); P = Parts()
    G = lambda x, y, z=0.0: (x, -y, z)
    ox, cy = 2.0, 0.12                   # outlet x, the cable's line (game y relative to the drawn pivot)
    P(mn.box('outlet', (0.32, 0.3, 0.16), loc=G(ox, cy, 0.0), m=M['paint'], bevel=0.03))
    P(mn.box('outlet_hz', (0.325, 0.305, 0.04), loc=G(ox, cy, 0.12), m=M['hazard'], bevel=0.005))
    led = P(mn.sphere('led', 0.03, loc=G(ox + 0.1, cy + 0.1, 0.17), m=M['led'], scale=(1, 1, 0.7)))
    P(mn.cyl('o_gland', 0.095, 0.05, loc=G(ox - 0.16, cy, 0.09), m=M['steel'], rot=(0, -math.radians(90), 0), verts=20, bevel=0.012))
    P(mn.box('collar_base', (0.26, 0.3, 0.14), loc=G(0.62, cy, 0.0), m=M['frame'], bevel=0.03))
    P(mn.box('collar_hz', (0.265, 0.305, 0.04), loc=G(0.62, cy, 0.1), m=M['hazard'], bevel=0.005))
    P(mn.cyl('c_collar', 0.1, 0.08, loc=G(0.75, cy, 0.09), m=M['steel'], rot=Y90, verts=20, bevel=0.012))
    P(mn.cyl('c_yellow', 0.106, 0.02, loc=G(0.83, cy, 0.09), m=M['yellow'], rot=Y90, verts=20, bevel=0.004))
    armoured(P, M, 'stub', [G(ox - 0.2, cy, 0.09), G(ox - 0.35, cy, CABLE_R), G(1.3, cy + 0.06, CABLE_R), G(0.98, cy, CABLE_R), G(0.84, cy, 0.09)], corner=0.12)
    P(mn.box('tape', (0.05, 0.2, 0.2), loc=G(1.45, cy + 0.04, 0.0), m=M['tape'], bevel=0.004))
    outline(P, 0.012)
    mn.render(f'power/jack_front_{"on" if on else "off"}', objs=list(P))

only = [a for a in ARGS if a != 'quick']
for name, fn in [('plug', plug), ('gland', gland), ('box', box), ('riser', riser)]:
    if not only or name in only:
        for on in (True, False): fn(on)
if not only or 'clamp' in only: clamp()
if not only or 'jack' in only:
    for on in (True, False):
        jack_side('port', on); jack_side('star', on); jack_front(on)
