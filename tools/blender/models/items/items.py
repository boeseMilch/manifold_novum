"""World sprites of the carryable items, lying on the floor (js/systems.js ITEMS / drawItems, dropped
items in js/dock.js, js/eva.js, js/hazards.js, js/mission.js), and the thrown wrench.

Sprites (assets/sprites/items/), ground origin = the item's (x, y) in the game:
  items/<kind>          kind = repair | laser | heavy | extinguisher | drill | fuel | plate | coolant |
                        blackbox | ore  (the ITEM_NAMES keys)
  items/wrench_d<i>     the thrown wrench (boarding.bolts with b.wrench), 16 spin angles: dir i is the
                        wrench turned to game angle i * 22.5 deg (use round(b.spin / (2pi/16)) mod 16).
                        Also fits the wrench wedged into the power lever (decor.js wrench(x, y, a)).

    blender -b --factory-startup --python tools/blender/models/items/items.py [-- quick] [-- name ...]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(__file__))
import itemlib as IL
import mn, bpy

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if 'quick' in ARGS: mn.SAMPLES = 16
ONLY = [a for a in ARGS if a != 'quick']

SIDE = [('X', -90)]                       # guns/tools lie on their side, grip towards the camera
WORLD = {   # kind -> (builder, rotations about world axes in order, scale)
    'repair':       (IL.B_repair, [('Z', 8)], 1.0),
    'laser':        (IL.B_laser, SIDE + [('Z', 10)], 1.2),
    'heavy':        (IL.B_heavy, SIDE + [('Z', 8)], 0.95),
    'extinguisher': (IL.B_extinguisher, [('Y', 90), ('X', -60), ('Z', -6)], 1.25),
    'drill':        (IL.B_drill, SIDE + [('Z', 12)], 1.1),
    'fuel':         (IL.B_fuel, [('Y', 90), ('Z', 18)], 1.1),
    'plate':        (IL.B_plate, [('Z', -11.5)], 1.0),
    'coolant':      (IL.B_coolant, [('Y', 90), ('Z', -14)], 1.25),
    'blackbox':     (IL.B_blackbox, [('Z', 6)], 1.0),
    'ore':          (IL.B_ore, [('Z', 0)], 1.2),
}

t0 = time.time()
for kind, (build, seq, sc) in WORLD.items():
    if ONLY and kind not in ONLY: continue
    mn.reset(); IL.make_mats()
    parts = build()
    root = IL.root_all()
    IL.lay(root, parts, seq, sc)
    mn.outline(parts, thickness=0.012)
    mn.render('items/' + kind, objs=parts)

if not ONLY or 'wrench' in ONLY:
    mn.reset(); IL.make_mats()
    parts = IL.wrench_parts(L=0.66, t=0.04)
    root = IL.root_all()
    mn.outline(parts, thickness=0.012)
    mn.render('items/wrench', objs=parts, root=root, dirs=16)
print(f'[items] done in {time.time() - t0:.0f}s')
