"""Square hero icons (128x128, beauty only, transparent background) for the inventory/HUD and the shop.

  items/icon_<kind>          the carryable items (ITEM_NAMES keys): HUD slots, pickup tags, floating items
  items/icon_gear_<id>       locker gear (GEAR in js/progress.js)
  items/icon_ship_<id>       shipyard upgrades (SHIP_UPGRADES in js/progress.js)

All share one look: same light rig and camera, the model turned ~30 deg towards the viewer and tilted
a little so it reads as a 3/4 view, scaled to fill ~84% of the canvas, 2.2 px outline.

    blender -b --factory-startup --python tools/blender/models/items/icons.py [-- quick] [-- name ...]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(__file__))
import itemlib as IL
import mn, bpy

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if 'quick' in ARGS: mn.SAMPLES = 16
ONLY = [a for a in ARGS if a != 'quick']

HERO = [('Z', -30), ('X', -12)]
GUN = [('Z', -24), ('X', -8)]

def own_kit():
    P = IL.B_repair(); P += IL.name_tag(0.13, 0.08, 0.21, rot=(0, 0, -0.25)); return P
def own_laser():
    P = IL.B_laser(); P += IL.name_tag(-0.02, -0.056, 0.18, rot=(IL.R90, 0, 0.12)); return P

ICONS = {   # name -> (builder, rotations about world axes in order)
    'icon_repair':       (IL.B_repair, [('Z', -22)]),
    'icon_laser':        (IL.B_laser, GUN),
    'icon_heavy':        (IL.B_heavy, GUN),
    'icon_extinguisher': (IL.B_extinguisher, [('Z', -40), ('X', -8)]),
    'icon_drill':        (IL.B_drill, GUN),
    'icon_fuel':         (IL.B_fuel, [('Z', -30), ('X', -10)]),
    'icon_plate':        (IL.B_plate, [('Z', -18), ('X', 25)]),
    'icon_coolant':      (IL.B_coolant, [('Z', -20), ('X', -8)]),
    'icon_blackbox':     (IL.B_blackbox, [('Z', -25)]),
    'icon_ore':          (IL.B_ore, [('Z', 20), ('X', 10)]),
    'icon_gear_boots':      (IL.B_boots, [('Z', -12), ('X', -8)]),
    'icon_gear_thrusters':  (IL.B_thrusters, [('Z', -30), ('X', -8)]),
    'icon_gear_firstAid':   (IL.B_firstaid, [('Z', -10), ('X', 25)]),
    'icon_gear_armor':      (IL.B_armor, [('Z', -20), ('X', -8)]),
    'icon_gear_stim':       (IL.B_stim, [('Z', 25), ('Y', -30)]),
    'icon_gear_ownKit':     (own_kit, [('Z', -22)]),
    'icon_gear_toolbelt':   (IL.B_toolbelt, [('Z', -10), ('X', -5)]),
    'icon_gear_overcharge': (IL.B_overcharge, [('Z', -20)]),
    'icon_gear_ownLaser':   (own_laser, GUN),
    'icon_gear_heavy':      (IL.B_heavy, GUN),
    'icon_ship_spareCell':  (IL.B_spare_cell, HERO),
    'icon_ship_coffee':     (IL.B_coffee, HERO),
    'icon_ship_inserter':   (IL.B_inserter, HERO),
    'icon_ship_cannons':    (IL.B_cannons, HERO),
    'icon_ship_airlocks':   (IL.B_airlocks, HERO),
    'icon_ship_radar':      (IL.B_radar, HERO),
    'icon_ship_shields':    (IL.B_shields, HERO),
    'icon_ship_caps':       (IL.B_caps, HERO),
    'icon_ship_hull':       (IL.B_hull, [('Z', -20), ('X', 20)]),
    'icon_ship_sprinklers': (IL.B_sprinklers, HERO),
}

t0 = time.time()
for name, (build, seq) in ICONS.items():
    if ONLY and name not in ONLY and name.split('_', 1)[1] not in ONLY: continue
    mn.reset(); IL.make_mats()
    parts = build()
    root = IL.root_all()
    IL.lay(root, parts, seq)
    IL.render_icon('items/' + name, parts)
print(f'[items] icons done in {time.time() - t0:.0f}s')
