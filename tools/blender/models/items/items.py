"""World sprites of the carryable items, lying on the floor (js/systems.js ITEMS / drawItems, dropped
items in js/dock.js, js/eva.js, js/hazards.js, js/mission.js), and the thrown wrench.

Sprites (build/renders/items/), ground origin = the item's (x, y) in the game:
  items/<kind>          kind = repair | laser | heavy | extinguisher | drill | fuel | plate | coolant |
                        blackbox | ore  (the ITEM_NAMES keys)
  items/wrench_d<i>     the thrown wrench (boarding.bolts with b.wrench), 16 spin angles: dir i is the
                        wrench turned to game angle i * 22.5 deg (use round(b.spin / (2pi/16)) mod 16).
                        Also fits the wrench wedged into the power lever (decor.js wrench(x, y, a)).

  items/held_<kind>     kind = laser | heavy | repair | extinguisher | drill: the item in a crew member's
                        right hand (js/sprites.js drawHeldItem), 16 dirs (dir i points at game angle
                        i * 22.5 deg), ground origin = the point held in the glove (the crew sprites' `hand`);
                        `muzzle` [x fwd, y left, z] from that point: where shots / the spray come out.

    blender -b --factory-startup --python tools/blender/models/items/items.py [-- quick] [-- name ...]
    (name: a kind, wrench, held (all held_*) or held_<kind>)
"""
import sys, os, math, time, json
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
# Held in the right hand: upright (guns level, barrel forward = +x), turned with the facing. hold = the
# point in the glove (model units, before scale); muzzle = where the shot / spray leaves (model units).
HELD = {   # kind -> (builder, rotations, scale, hold, muzzle)
    'laser':        (IL.B_laser, [], 0.95, (-0.11, 0, 0.07), (0.33, 0, 0.18)),
    'heavy':        (IL.B_heavy, [], 0.9, (-0.12, 0, 0.08), (0.445, 0, 0.22)),
    'drill':        (IL.B_drill, [], 0.9, (-0.08, 0, 0.1), (0.37, 0, 0.2)),
    'repair':       (IL.B_repair, [], 0.75, (0, 0.02, 0.27), (0, 0.02, 0.27)),          # carried by its handle
    'extinguisher': (IL.B_extinguisher, [], 0.8, (-0.035, 0, 0.475), (0.1, -0.06, 0.12)),   # by the handle, hose nozzle low
}
for kind, (build, seq, sc, hold, muz) in HELD.items():
    if ONLY and kind not in ONLY and 'held' not in ONLY and 'held_' + kind not in ONLY: continue
    mn.reset(); IL.make_mats()
    parts = build()
    inner = IL.root_all('inner')
    pivot = mn.link(bpy.data.objects.new('pivot', None))
    inner.parent = pivot; inner.scale = (sc,) * 3; inner.location = tuple(-v * sc for v in hold)
    mn.outline(parts, thickness=0.012)
    name = 'items/held_' + kind
    mn.render(name, objs=parts, root=pivot, dirs=16)
    with open(mn.MANIFEST) as fh: ent = json.load(fh)[name]
    ent['muzzle'] = [round((m - h) * sc, 3) for m, h in zip(muz, hold)]; mn._manifest_put(name, ent)
print(f'[items] done in {time.time() - t0:.0f}s')
