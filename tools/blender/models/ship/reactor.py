"""The reactor: the heart of the ship (js/systems.js; footprint REACTOR.w x REACTOR.h in js/ship.js).

A chunky industrial "REAKTOMAT 3000": orange housing on a hazard-striped plinth, a caged plasma core
on top, cooling fins on both sides, coolant pipes, a fuel-cell socket (the green cell plugs in from
the top), pressure gauges and a fuel bar screen on the front.

Renders
  ship/reactor      6-frame loop, the core pulsing (frames _f0.._f5)
  ship/reactor_off  out of fuel: core dark, socket empty, screen and lamps red
  ship/reactor_broken  broken (drawReactor when broken(REACTOR)): 2 frames, f0 core dark, f1 a weak
                    flicker (the game shows f1 now and then); cracked core window, scorched housing,
                    an access panel hanging off one hinge, sparking cables out of the hole behind it,
                    a cage bar snapped off. Same canvas and origin as the other two.

MN_ONLY=ship/reactor_broken (comma list of names) renders only those sets.
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Matrix
import mn
from shiplib import pmat, glow, pipe, label, ring

ONLY = os.environ.get('MN_ONLY', '').split(',') if os.environ.get('MN_ONLY') else None
def want(n): return not ONLY or n in ONLY
W, D = 3.8, 2.6                       # footprint (REACTOR.w, REACTOR.h)
FRAMES = list(range(1, 7))
s = mn.reset()

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
M = dict(
    plinth=pmat('plinth', '#3a3f4a', 0.5, 0.6, grime=0.6),
    paint=pmat('paint', '#c0683c', 0.45, 0.15, grime=0.55, grime_scale=4),
    lid=pmat('lid', '#4a515e', 0.4, 0.7, grime=0.4),
    steel=pmat('steel', '#a3abb8', 0.32, 0.85, grime=0.3),
    dark=pmat('dark', '#262a33', 0.5, 0.4),
    hazard=pmat('hazard', None, 0.5, 0.0, stripes=('#e8c34f', '#23252b'), stripe_k=5.5, grime=0.4),
    copper=pmat('copper', '#c08a3e', 0.3, 0.9, grime=0.4),
    coolant=pmat('coolant', '#3b7a8a', 0.4, 0.3, grime=0.3),
    rubber=pmat('rubber', '#262a33', 0.7),
    tape=pmat('tape', '#b9bcc2', 0.85, 0.0),
    dial=pmat('dial', '#ece8dc', 0.5),
    needle=pmat('needle', '#e2574c', 0.4),
    sticker=pmat('sticker', '#f2df6b', 0.6),
    ink=pmat('ink', '#23252b', 0.6),
    core=glow('core', '#48c8ff', 2.0),
    cell=glow('cell', '#2ee070', 0.9),
    screen=glow('screen', '#2ee070', 1.0),
    screen_bg=pmat('screen_bg', '#0f1a14', 0.3),
    lamp=glow('lamp', '#2ee070', 1.2),
    hole=pmat('hole', '#0c0d10', 0.9),
)
# The plasma: emission colour swirls between cyan and white-hot (a 3D noise sampled along a circle,
# so the loop closes), the strength pulses. Both keyframed below.
nt = M['core'].node_tree; em = nt.nodes['Emission']
tc = nt.nodes.new('ShaderNodeTexCoord'); off = nt.nodes.new('ShaderNodeVectorMath'); off.operation = 'ADD'; off.name = 'swirl'
nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 4
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.0, 0.06, 0.9, 1)
ramp.color_ramp.elements[1].position = 0.72; ramp.color_ramp.elements[1].color = (0.0, 0.85, 1.0, 1)
nt.links.new(tc.outputs['Object'], off.inputs[0]); nt.links.new(off.outputs[0], nz.inputs['Vector'])
nt.links.new(nz.outputs['Fac'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], em.inputs['Color'])

parts = []
def P(o): parts.append(o); return o

# ---------------------------------------------------------------------------
# Plinth with hazard edge
# ---------------------------------------------------------------------------
P(mn.box('plinth', (W, D, 0.16), m=M['plinth'], bevel=0.04))
P(mn.box('plinth_hz', (W - 0.3, 0.26, 0.012), loc=(0, -D / 2 + 0.17, 0.16), m=M['hazard'], bevel=0.004))
for x in (-W / 2 + 0.12, W / 2 - 0.12):                       # floor bolts
    for y in (-D / 2 + 0.12, D / 2 - 0.12):
        P(mn.cyl('bolt', 0.045, 0.05, loc=(x, y, 0.16), m=M['steel'], verts=6, bevel=0.01))

# ---------------------------------------------------------------------------
# Housing
# ---------------------------------------------------------------------------
HX, HY0, HY1, HZ0, HZ1 = 1.5, -0.86, 1.05, 0.16, 1.08          # half width, front, back, bottom, top
HYc = (HY0 + HY1) / 2
P(mn.box('housing', (2 * HX, HY1 - HY0, HZ1 - HZ0), loc=(0, HYc, HZ0), m=M['paint'], bevel=0.07))
P(mn.box('lid', (2 * HX + 0.06, HY1 - HY0 + 0.06, 0.12), loc=(0, HYc, HZ1 - 0.02), m=M['lid'], bevel=0.04))
LID = HZ1 + 0.10
P(mn.box('lid_top', (2 * HX - 0.12, HY1 - HY0 - 0.12, 0.02), loc=(0, HYc, LID - 0.012), m=M['paint'], bevel=0.01))
LID += 0.008
for x in (-0.62, 0.55):
    P(mn.box('lseam', (0.022, HY1 - HY0 - 0.2, 0.012), loc=(x, HYc, LID - 0.008), m=M['dark'], bevel=0))
P(mn.box('kick', (2 * HX + 0.04, HY1 - HY0 + 0.04, 0.1), loc=(0, HYc, HZ0), m=M['dark'], bevel=0.02))
# panel seams on the front (dark grooves) and corner rivets
for x in (-0.48, 0.62):
    P(mn.box('seam', (0.025, 0.02, HZ1 - HZ0 - 0.2), loc=(x, HY0 - 0.004, HZ0 + 0.1), m=M['dark'], bevel=0))
for x in (-HX + 0.1, -0.56, -0.40, 0.54, 0.70, HX - 0.1):
    for z in (HZ0 + 0.17, HZ1 - 0.08):
        P(mn.cyl('rivet', 0.022, 0.02, loc=(x, HY0, z), m=M['steel'], verts=8, bevel=0.006, rot=(math.radians(90), 0, 0)))

# cooling fins on both sides
for sx in (-1, 1):
    for i in range(9):
        y = -0.66 + i * 0.2
        P(mn.box('fin', (0.36, 0.045, 0.78), loc=(sx * (HX + 0.16), y, HZ0 + 0.08), m=M['steel'], bevel=0.012))
    P(mn.box('fin_bar', (0.06, 1.75, 0.07), loc=(sx * (HX + 0.3), 0.14, HZ0 + 0.84), m=M['lid'], bevel=0.02))
    P(mn.box('fin_bar2', (0.06, 1.75, 0.07), loc=(sx * (HX + 0.3), 0.14, HZ0 + 0.14), m=M['lid'], bevel=0.02))

# ---------------------------------------------------------------------------
# Front: core window, gauges, fuel screen, vent
# ---------------------------------------------------------------------------
FY = HY0                                                         # front plane
R90 = (math.radians(90), 0, 0)
wx, wz, wr = -0.98, 0.62, 0.31                                   # porthole into the core chamber
P(mn.cyl('win_back', wr + 0.02, 0.06, loc=(wx, FY + 0.03, wz), m=M['dark'], rot=R90, bevel=0.01))
P(mn.cyl('win_glow', wr - 0.04, 0.04, loc=(wx, FY + 0.0, wz), m=M['core'], rot=R90, bevel=0))
P(ring('win_frame', wr + 0.05, 0.1, 0.08, loc=(wx, FY + 0.02, wz), m=M['steel'], rot=R90))
for i in range(8):
    a = i * math.pi / 4 + math.pi / 8
    P(mn.cyl('win_bolt', 0.022, 0.03, loc=(wx + math.cos(a) * (wr + 0.0), FY - 0.06, wz + math.sin(a) * (wr + 0.0)), m=M['dark'], verts=6, bevel=0.005, rot=R90))
for i, bx in enumerate((wx - 0.17, wx + 0.17)):                 # window grill bars
    P(mn.box('win_bar', (0.03, 0.03, 2 * wr - 0.06), loc=(bx, FY - 0.07, wz - wr + 0.03), m=M['steel'], bevel=0.008))

for gx, ang in ((-0.18, 35), (0.2, -60)):                        # pressure gauges
    gz = 0.8
    P(mn.cyl('gauge_body', 0.15, 0.08, loc=(gx, FY + 0.02, gz), m=M['steel'], rot=R90, bevel=0.02))
    P(mn.cyl('gauge_face', 0.12, 0.02, loc=(gx, FY - 0.05, gz), m=M['dial'], rot=R90, bevel=0.004))
    for k in range(7):                                           # tick marks
        a = math.radians(-135 + k * 45 + 90)
        P(mn.box('tick', (0.012, 0.01, 0.03), loc=(gx + math.cos(a) * 0.09, FY - 0.072, gz + math.sin(a) * 0.09 - 0.015), m=M['ink'], bevel=0, rot=(0, -a + math.pi / 2, 0)))
    P(mn.box('red_zone', (0.06, 0.008, 0.02), loc=(gx + 0.07, FY - 0.073, gz + 0.05), m=M['needle'], bevel=0, rot=(0, math.radians(-45), 0)))
    nd = P(mn.box('needle', (0.016, 0.012, 0.1), loc=(0, 0, 0), m=M['needle'], bevel=0))
    nd.location = (gx, FY - 0.08, gz); nd.rotation_euler = (0, math.radians(ang), 0)
    P(mn.cyl('gauge_pin', 0.018, 0.02, loc=(gx, FY - 0.07, gz), m=M['ink'], rot=R90, verts=8, bevel=0))
P(mn.box('gauge_plate', (0.7, 0.03, 0.08), loc=(0.01, FY - 0.01, 0.56), m=M['dark'], bevel=0.01))
P(label('gauge_txt', 'PRESSURE', 0.055, (0.01, FY - 0.03, 0.6), rot=R90, m=M['dial']))

# fuel screen: five bars, one per energy in the cell
sxc, szc = 0.98, 0.72
P(mn.box('scr_bezel', (0.62, 0.07, 0.46), loc=(sxc, FY - 0.01, szc - 0.23), m=M['dark'], bevel=0.03))
P(mn.box('scr_bg', (0.5, 0.02, 0.34), loc=(sxc, FY - 0.045, szc - 0.17), m=M['screen_bg'], bevel=0.005))
bars = []
for i in range(5):
    bars.append(P(mn.box('scr_bar', (0.075, 0.015, 0.16), loc=(sxc - 0.18 + i * 0.09, FY - 0.055, szc - 0.12), m=M['screen'], bevel=0)))
P(mn.box('scr_line', (0.42, 0.015, 0.025), loc=(sxc, FY - 0.055, szc + 0.08), m=M['screen'], bevel=0))
for i, c in enumerate(('#e2574c', '#e8c34f', '#5fd6a0')):        # buttons under the screen
    P(mn.cyl('btn', 0.035, 0.04, loc=(sxc - 0.12 + i * 0.12, FY - 0.02, 0.33), m=pmat('btn' + c, c, 0.35), rot=R90, verts=12, bevel=0.01))

# vent slats low on the front
for i in range(4):
    P(mn.box('slat', (0.62, 0.05, 0.035), loc=(0.01, FY - 0.01, 0.26 + i * 0.065), m=M['dark'], bevel=0.01))

# ---------------------------------------------------------------------------
# Top: the core
# ---------------------------------------------------------------------------
CX, CY = -0.15, 0.22
P(mn.cyl('collar', 0.8, 0.12, loc=(CX, CY, LID), m=M['lid'], bevel=0.03, verts=48))
P(ring('collar_hz', 0.84, 0.1, 0.1, loc=(CX, CY, LID), m=M['hazard'], verts=48))
P(mn.cyl('collar2', 0.66, 0.08, loc=(CX, CY, LID + 0.12), m=M['steel'], bevel=0.02, verts=48))
for i in range(12):                                                 # collar bolts
    a = i * math.tau / 12
    P(mn.cyl('cbolt', 0.03, 0.03, loc=(CX + math.cos(a) * 0.73, CY + math.sin(a) * 0.73, LID + 0.12), m=M['steel'], verts=6, bevel=0.006))
CZ0, CZ1 = LID + 0.2, LID + 1.2
core = P(mn.cyl('core', 0.48, CZ1 - CZ0, loc=(CX, CY, CZ0), m=M['core'], verts=48, bevel=0))
for i in range(10):                                                 # cage bars
    a = i * math.tau / 10 + 0.15
    P(mn.cyl('bar', 0.04, CZ1 - CZ0, loc=(CX + math.cos(a) * 0.56, CY + math.sin(a) * 0.56, CZ0), m=M['steel'], verts=10, bevel=0.01))
P(ring('band', 0.62, 0.1, 0.07, loc=(CX, CY, (CZ0 + CZ1) / 2 - 0.035), m=M['lid'], verts=48))
P(mn.cyl('cap', 0.7, 0.14, loc=(CX, CY, CZ1), m=M['lid'], bevel=0.04, verts=48))
P(ring('cap_hz', 0.71, 0.12, 0.05, loc=(CX, CY, CZ1 + 0.13), m=M['paint'], verts=48))
P(mn.cyl('cap2', 0.42, 0.1, loc=(CX, CY, CZ1 + 0.14), m=M['steel'], bevel=0.03, verts=40))
P(mn.cyl('cap_glow', 0.26, 0.03, loc=(CX, CY, CZ1 + 0.235), m=M['core'], bevel=0.0, verts=40))
P(ring('cap_glow_rim', 0.29, 0.05, 0.05, loc=(CX, CY, CZ1 + 0.22), m=M['dark'], verts=40))
for i in range(4):                                                  # cross brace over the top glow
    a = i * math.pi / 2 + math.pi / 4
    b = P(mn.box('brace', (0.3, 0.04, 0.04), loc=(0, 0, 0), m=M['steel'], bevel=0.01))
    b.location = (CX + math.cos(a) * 0.14, CY + math.sin(a) * 0.14, CZ1 + 0.25); b.rotation_euler = (0, 0, a)
light_d = bpy.data.lights.new('core_light', 'POINT'); light_d.color = (0.5, 0.88, 1.0); light_d.shadow_soft_size = 0.3
core_light = mn.link(bpy.data.objects.new('core_light', light_d)); core_light.location = (CX, CY, (CZ0 + CZ1) / 2)
core.visible_shadow = False                                          # let the light out between the bars

# ---------------------------------------------------------------------------
# Top: fuel socket (the cell plugs in from above), vents, lamps, sticker
# ---------------------------------------------------------------------------
FX, FYc = 0.98, -0.32
P(mn.box('sock_base', (0.62, 0.62, 0.06), loc=(FX, FYc, LID), m=M['hazard'], bevel=0.02))
P(mn.cyl('sock', 0.22, 0.12, loc=(FX, FYc, LID + 0.06), m=M['steel'], bevel=0.03))
P(mn.cyl('sock_hole', 0.16, 0.01, loc=(FX, FYc, LID + 0.175), m=M['hole'], bevel=0))
cell = [P(mn.cyl('cell', 0.13, 0.36, loc=(FX, FYc, LID + 0.17), m=M['cell'], bevel=0.02)),
        P(mn.cyl('cell_cap', 0.14, 0.07, loc=(FX, FYc, LID + 0.5), m=M['steel'], bevel=0.02)),
        P(mn.cyl('cell_nub', 0.06, 0.05, loc=(FX, FYc, LID + 0.56), m=M['dark'], bevel=0.015)),
        P(ring('cell_band', 0.145, 0.03, 0.05, loc=(FX, FYc, LID + 0.3), m=M['dark']))]
P(label('fuel_txt', 'FUEL', 0.1, (FX, FYc - 0.36, LID + 0.008), m=M['ink']))
P(mn.box('fuel_plate', (0.36, 0.13, 0.008), loc=(FX, FYc - 0.36, LID), m=M['sticker'], bevel=0.002))

for vx in (0.75, 1.15):                                              # vent grilles behind the socket
    P(mn.box('vent', (0.32, 0.6, 0.04), loc=(vx, 0.62, LID), m=M['dark'], bevel=0.015))
    for i in range(5):
        P(mn.box('vslat', (0.26, 0.04, 0.03), loc=(vx, 0.4 + i * 0.11, LID + 0.03), m=M['lid'], bevel=0.008))

lamps = []
for lx, ly in ((-1.3, 0.85), (-1.32, 0.3)):
    P(mn.cyl('lamp_base', 0.09, 0.05, loc=(lx, ly, LID), m=M['dark'], bevel=0.015))
    lamps.append(P(mn.sphere('lamp', 0.07, loc=(lx, ly, LID + 0.06), m=M['lamp'], scale=(1, 1, 0.8))))

stk = P(mn.box('sticker', (0.62, 0.17, 0.008), loc=(-0.98, -0.66, LID), m=M['sticker'], bevel=0.003))
P(label('stk_txt', 'REAKTOMAT 3000', 0.065, (-0.98, -0.66, LID + 0.009), m=M['ink']))
P(mn.box('tape', (0.34, 0.09, 0.006), loc=(0.42, -0.62, LID), m=M['tape'], bevel=0.002, rot=(0, 0, math.radians(18))))

# ---------------------------------------------------------------------------
# Pipes
# ---------------------------------------------------------------------------
for sx in (-1, 1):                                                   # main coolant loops into the collar
    x0 = CX + sx * 1.05
    P(pipe('pipe_main', [(x0, 1.18, HZ0), (x0, 1.18, LID + 0.62), (CX + sx * 0.62, CY + 0.42, LID + 0.62), (CX + sx * 0.62, CY + 0.42, LID + 0.15)],
           0.09, M['copper'], corner=0.22))
    P(mn.cyl('flange', 0.13, 0.06, loc=(x0, 1.18, HZ0), m=M['steel'], bevel=0.015))
    P(ring('pflange', 0.12, 0.05, 0.05, loc=(x0, 1.18, LID + 0.12), m=M['steel']))
P(mn.cyl('tape_pipe', 0.1, 0.12, loc=(CX - 1.05, 1.18, 0.62), m=M['tape'], bevel=0.01))   # the ship's running joke
P(pipe('pipe_cool', [(HX + 0.3, 0.55, HZ0 + 0.91), (HX - 0.05, 0.55, LID + 0.1), (0.62, 0.55, LID + 0.1), (0.62, 0.3, LID + 0.1), (CX + 0.7, 0.3, LID + 0.08)],
       0.055, M['coolant'], corner=0.12))
P(pipe('pipe_cool2', [(-HX - 0.3, -0.3, HZ0 + 0.91), (-HX + 0.05, -0.3, LID + 0.1), (-1.05, -0.3, LID + 0.1), (CX - 0.62, -0.1, LID + 0.08)],
       0.055, M['coolant'], corner=0.12))
# power cables out of the back (the power lines leave from here)
for i, (cx, c) in enumerate(((0.35, '#c9662e'), (0.5, '#2e6ec9'), (0.65, '#d2a62e'))):
    P(pipe('cable', [(cx, 1.0, LID - 0.02), (cx, 1.2, LID - 0.02), (cx, 1.27, LID - 0.25), (cx, 1.27, HZ0)], 0.035, pmat('cable' + c, c, 0.6), corner=0.12))

mn.outline(parts, thickness=0.014)

# ---------------------------------------------------------------------------
# Animation: 6-frame pulse loop
# ---------------------------------------------------------------------------
em = M['core'].node_tree.nodes['Emission']; sw = M['core'].node_tree.nodes['swirl']
for i, f in enumerate(FRAMES):
    k = 0.5 + 0.5 * math.cos(math.tau * i / len(FRAMES))            # 1 at frame 0, 0 at frame 3
    em.inputs['Strength'].default_value = 0.45 + 0.9 * k; em.inputs['Strength'].keyframe_insert('default_value', frame=f)
    a = math.tau * i / len(FRAMES)
    sw.inputs[1].default_value = (0.35 * math.cos(a), 0.35 * math.sin(a), 0.0); sw.inputs[1].keyframe_insert('default_value', frame=f)
    light_d.energy = 8 + 25 * k; light_d.keyframe_insert('energy', frame=f)

objs = parts
if want('ship/reactor'): mn.render('ship/reactor', objs=objs, frames=FRAMES)

# ---------------------------------------------------------------------------
# Out of fuel: core dark, cell gone, screen and lamps red
# ---------------------------------------------------------------------------
s.frame_set(1)
dead = pmat('core_dead', '#1a2630', 0.15, 0.4)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.materials and o.data.materials[0] == M['core']:
        o.data.materials[0] = dead
for o in cell: o.hide_render = True
red = glow('screen_red', '#ff2a1a', 1.0)
for b in bars[1:]: b.data.materials[0] = M['screen_bg']
bars[0].data.materials[0] = red
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.materials and o.data.materials[0] == M['screen']: o.data.materials[0] = red
for l in lamps: l.data.materials[0] = glow('lamp_red', '#ff2010', 1.2)
light_d.animation_data_clear(); light_d.energy = 0
M['core'].node_tree.animation_data_clear()
if want('ship/reactor_off'): mn.render('ship/reactor_off', objs=objs)

# ---------------------------------------------------------------------------
# Broken (fuel still in): on top of the out-of-fuel look. New parts are framed by `objs` (the intact
# reactor), so the canvas and origin stay those of ship/reactor and ship/reactor_off.
# ---------------------------------------------------------------------------
for o in cell: o.hide_render = False                                 # the cell is still in
brk = []
def B(o): brk.append(o); return o
flick = glow('core_flicker', '#ff8a3a', 0.05)                         # the core: dark, now and then a sick orange flicker
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.materials and o.data.materials[0] == dead: o.data.materials[0] = flick
fem = flick.node_tree.nodes['Emission']
for f, k in ((1, 0.0), (2, 0.5)):
    fem.inputs['Strength'].default_value = k; fem.inputs['Strength'].keyframe_insert('default_value', frame=f)
light_d.color = (1.0, 0.55, 0.25)
for f, k in ((1, 0.0), (2, 9.0)):
    light_d.energy = k; light_d.keyframe_insert('energy', frame=f)
BA = 7 * math.tau / 10 + 0.15                                         # one cage bar (front) snapped off
for o in parts:
    if o.name.startswith('bar') and not o.name.startswith('bar_') and abs(o.location.x - (CX + math.cos(BA) * 0.56)) < 1e-3 and abs(o.location.y - (CY + math.sin(BA) * 0.56)) < 1e-3:
        o.hide_render = True
P_ = (CX + math.cos(BA) * 0.56, CY + math.sin(BA) * 0.56)
B(mn.cyl('bar_stub', 0.04, 0.28, loc=(P_[0], P_[1], CZ0), m=M['steel'], verts=10, bevel=0.01))
B(mn.cyl('bar_bent', 0.04, 0.55, loc=(P_[0], P_[1], CZ1 - 0.02), m=M['steel'], verts=10, bevel=0.01, rot=(math.radians(150), math.radians(-25), 0)))

# scorch: dark, mottled blotches over the paint (front round the window, the lid edge, the top)
scorch = pmat('scorch', '#17130f', 0.95, 0.0, grime=1.0, grime_scale=9)
soot = pmat('soot', '#3a2a20', 0.9, 0.0, grime=1.0, grime_scale=7)
for (x, z, rx, rz, m) in ((-0.98, 0.8, 0.62, 0.3, soot), (-0.72, 0.9, 0.36, 0.18, scorch), (-1.3, 0.5, 0.2, 0.3, scorch), (0.0, 0.42, 0.5, 0.2, soot), (0.98, 0.98, 0.4, 0.12, soot)):
    B(mn.sphere('scorch_f', 1.0, loc=(x, FY + 0.012, z), m=m, scale=(rx, 0.02, rz), segs=24))
for (x, y, r, m) in ((-0.62, -0.42, 0.42, soot), (-0.42, -0.2, 0.26, scorch), (0.25, 0.75, 0.3, soot)):
    B(mn.sphere('scorch_t', 1.0, loc=(x, y, LID), m=m, scale=(r, r * 0.8, 0.012), segs=24))

# cracked core window: pale cracks from an impact point, a chip knocked out
glass_crack = pmat('crack', '#dfe9ee', 0.25, 0.0)
ix, iz = wx + 0.08, wz + 0.07
B(mn.sphere('chip', 0.055, loc=(ix, FY - 0.045, iz), m=M['hole'], scale=(1.0, 0.2, 0.8), segs=12))
for a, L in ((0.3, 0.27), (1.4, 0.2), (2.3, 0.3), (3.3, 0.24), (4.2, 0.33), (5.3, 0.22)):
    c = B(mn.box('crack', (L, 0.006, 0.011), m=glass_crack, bevel=0))
    c.location = (ix + math.cos(a) * L / 2, FY - 0.048, iz + math.sin(a) * L / 2); c.rotation_euler = (0, -a, 0)
    a2 = a + 0.6; L2 = L * 0.45; ex, ez = ix + math.cos(a) * L * 0.7, iz + math.sin(a) * L * 0.7
    c = B(mn.box('crack2', (L2, 0.006, 0.008), m=glass_crack, bevel=0))
    c.location = (ex + math.cos(a2) * L2 / 2, FY - 0.048, ez + math.sin(a2) * L2 / 2); c.rotation_euler = (0, -a2, 0)

# the vent's access panel: torn off at one side, hanging from its top-left hinge; a dark hole behind it
B(mn.box('vent_hole', (0.6, 0.02, 0.3), loc=(0.01, FY - 0.035, 0.24), m=M['hole'], bevel=0.01))
pn = B(mn.box('panel_hang', (0.62, 0.03, 0.32), m=M['paint'], bevel=0.015))
pn.data.transform(Matrix.Translation((0.31, 0, -0.32)))                # pivot = its top-left corner
pn.location = (-0.3, FY - 0.09, 0.56); pn.rotation_euler = (math.radians(-20), math.radians(68), math.radians(-14))
B(mn.box('panel_stripe', (0.5, 0.034, 0.05), m=M['hazard'], bevel=0.004)).data.transform(Matrix.Translation((0.06 + 0.25, 0, -0.27)))
brk[-1].location = pn.location; brk[-1].rotation_euler = pn.rotation_euler
B(mn.cyl('hinge', 0.03, 0.05, loc=(-0.3, FY - 0.05, 0.56), m=M['steel'], verts=8, bevel=0.006, rot=R90))

# sparking cables hanging out of the hole, frayed copper ends, sparks (glowing) at the ends
spark = glow('spark', '#ffe7a0', 3.0)
spark_hot = glow('spark_hot', '#ffffff', 4.0)
for i, (x0, pts, c) in enumerate(((0.08, [(0.12, FY - 0.25, 0.3), (0.2, FY - 0.32, 0.2)], '#c9662e'),
                                  (0.2, [(0.3, FY - 0.2, 0.36), (0.42, FY - 0.3, 0.24)], '#2e6ec9'),
                                  (-0.08, [(-0.12, FY - 0.22, 0.26), (-0.2, FY - 0.3, 0.22)], '#d2a62e'))):
    path = [(x0, FY + 0.02, 0.38), (x0, FY - 0.1, 0.38)] + pts
    B(pipe('cable_hang', path, 0.03, pmat('cbl' + c, c, 0.6), corner=0.08))
    ex, ey, ez = pts[-1]
    for k in range(3):                                               # frayed strands
        a = k * 2.1 + i
        B(pipe('strand', [(ex, ey, ez), (ex + math.cos(a) * 0.05, ey - 0.03, ez - 0.04 + math.sin(a) * 0.02)], 0.008, M['copper'], corner=0.0))
    if i < 2:
        B(mn.sphere('spark_core', 0.045, loc=(ex, ey - 0.04, ez - 0.05), m=spark_hot, segs=10))
        for k in range(5):                                          # spark streaks
            a = k * 1.3 + i * 0.7
            sp = B(mn.box('spark', (0.016, 0.016, 0.14 + 0.06 * (k % 2)), m=spark, bevel=0))
            sp.location = (ex, ey - 0.04, ez - 0.05); sp.rotation_euler = (math.radians(20), a, 0)

# fuel screen: the bars scrambled (red, every other), the lamps red (as when out of fuel)
for k, b in enumerate(bars): b.data.materials[0] = red if k % 2 == 0 else M['screen_bg']
mn.outline([o for o in brk if not o.name.startswith(('spark', 'crack', 'scorch'))], thickness=0.012)
if want('ship/reactor_broken'): mn.render('ship/reactor_broken', objs=objs, frames=[1, 2])
