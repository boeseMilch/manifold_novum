"""Outer airlock chambers (HATCHES in js/ship.js, the logic in js/airlock.js; 2026-10-21).

Each bottom side room has a chamber (OL_W x OL_H = 2.2 x 2.2) against the hull wall: the OUTER door is the hatch
in the hull wall (interior/hatch_<side>_*, doors.py), the INNER door the doorways' sliding door (interior/door_v_*),
the walls round it the ship's wall kit. This script renders what is the chamber's own:

Floor plate (the chamber's floor: grating, hazard-striped thresholds at both doors, light strips along the walls in
the colour of its state), origin = the chamber's north-west corner (c.x, c.y) on the floor, covers c .. c + 2.2:
  interior/outerlock_<side>_floor_air          pressurized, at rest: strips green
  interior/outerlock_<side>_floor_vac          pumped out (or venting): strips red
  interior/outerlock_<side>_floor_locked       locked by security: strips red, the centre plate's lamp red
  interior/outerlock_<side>_floor_cycle_f0..7  pumping: strips pulse amber, air swirl marks
  interior/outerlock_<side>_floor_busy_f0..7   doors moving: strips blink amber
  interior/outerlock_<side>_floor_broken_f0..1 broken: strips dead, one flickering, a scorch
Control panel (on the room side of the inner door's north jamb: js/airlock.js airlockPanelAt; origin there, on the
floor): a box with a status dome on top and a big yellow-black CYCLE button, a little pressure gauge
  interior/outerlock_<side>_panel_air / _vac / _locked, _cycle_f0..7, _busy_f0..7, _vent_f0..7, _broken_f0..1
<side> = port (outside is -x) | star (outside is +x).

  blender -b --factory-startup --python tools/blender/models/interior/outerlock.py   (MN_ONLY=<substring> for some)
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

W = H = 2.2
FRAMES8 = [i / 8 for i in range(8)]
STRIP = {'air': ('#5be08a', 0.9), 'vac': ('#ff4a3a', 0.9), 'locked': ('#ff4a3a', 1.1), 'cycle': ('#ffb347', None), 'busy': ('#ffb347', None),
         'broken': (None, 0), 'vent': ('#ff4a3a', None)}

def strip_mat(state, t):
    col, k = STRIP[state]
    if state in ('cycle', 'vent'): k = 0.35 + 1.0 * (0.5 + 0.5 * math.sin(t * 2 * math.pi * 2))
    if state == 'busy': k = 1.1 if math.sin(t * 2 * math.pi * 4) > 0 else 0.15
    if col is None: return pmat('strip_dead', '#2a3440', 0.3)
    return glow(f'strip_{state}_{int(t * 8)}', col, k)

def floor(M, side, state, t=0.0):
    o = []
    out_x = 0.0 if side == 'port' else W                 # the hatch side
    o.append(gbox('plate', 0.0, 0.0, W, H, 0.0, 0.02, M['dark'], 0.008))
    for i in range(12):                                   # grating bars (across, like the deck airlocks')
        y = 0.18 + i * 0.167
        o.append(gbox('grate', 0.42, y - 0.025, W - 0.42, y + 0.025, 0.02, 0.04, M['rim'], 0.008))
    for xx in (0.45, W / 2, W - 0.45):
        o.append(gbox('grate_y', xx - 0.03, 0.12, xx + 0.03, H - 0.12, 0.02, 0.045, M['steel'], 0.01))
    # thresholds at both doors: hazard stripes, the outer one heavier, with a magnetic boot plate
    for x0, x1, m in ((0.02, 0.36, M['hazard_big']), (W - 0.36, W - 0.02, M['hazard'])) if side == 'port' else ((W - 0.36, W - 0.02, M['hazard_big']), (0.02, 0.36, M['hazard'])):
        o.append(gbox('thresh', x0, 0.1, x1, H - 0.1, 0.02, 0.035, m, 0.008))
    # light strips along the north and south walls
    sm = strip_mat(state, t)
    for yy in (0.08, H - 0.08):
        o.append(gbox('strip_h', 0.4, yy - 0.05, W - 0.4, yy + 0.05, 0.02, 0.045, M['dark'], 0.01))
        if state == 'broken':
            o.append(gbox('strip', 0.45, yy - 0.03, W / 2 - 0.05, yy + 0.03, 0.045, 0.055, pmat('strip_dead', '#2a3440', 0.3), 0.006))
            fl = glow('strip_flick', '#5be08a', 1.0) if t < 0.5 and yy < 1 else pmat('strip_dead', '#2a3440', 0.3)
            o.append(gbox('strip', W / 2 + 0.05, yy - 0.03, W - 0.45, yy + 0.03, 0.045, 0.055, fl, 0.006))
        else:
            o.append(gbox('strip', 0.45, yy - 0.03, W - 0.45, yy + 0.03, 0.045, 0.055, sm, 0.006))
    # the centre plate: where the game draws its pump ring; a lamp in its rim shows the state
    cx, cy = W / 2, H / 2
    o.append(mn.cyl('cplate', 0.4, 0.035, loc=G(cx, cy, 0.02), m=M['body'], bevel=0.012, verts=40))
    o.append(ring('cring', 0.34, 0.06, 0.025, loc=G(cx, cy, 0.055), m=M['yellow']))
    o.append(label('arrow', '<<<' if side == 'port' else '>>>', 0.12, G(cx, cy + 0.12, 0.056), m=M['paint_w']))
    lamp = {'air': 'open', 'vac': 'closed', 'locked': 'closed', 'vent': 'closed', 'broken': 'off'}.get(state, 'busy' if math.sin(t * 2 * math.pi * 4) > 0 else 'busy_off')
    o.append(mn.sphere('clamp', 0.06, loc=G(cx, cy - 0.12, 0.06), m=lamp_mat(lamp), scale=(1, 1, 0.6), segs=16))
    # boot rails by the hatch (clip on before it opens), a duct-tape patch on the grating
    bx = 0.55 if side == 'port' else W - 0.55
    for yy in (0.6, H - 0.6):
        o.append(gbox('rail', bx - 0.04, yy - 0.18, bx + 0.04, yy + 0.18, 0.04, 0.07, M['steel'], 0.01))
    o.append(tape_strip(W * 0.7 if side == 'port' else W * 0.3, H * 0.75, 0.046, 0.4, 25, M))
    if state == 'cycle':                                  # air swirling: faint pale arcs over the grating
        for i in range(3):
            a = t * 2 * math.pi + i * 2.1
            o.append(mn.box('swirl', (0.5, 0.04, 0.004), loc=(cx + 0.65 * math.cos(a), -(cy + 0.65 * math.sin(a)), 0.07), m=glow('swirl', '#cfe6ff', 0.35), bevel=0.0, rot=(0, 0, a + math.pi / 2)))
    if state == 'broken':
        sc = mn.cyl('scorch', 0.45, 0.004, loc=G(W * 0.62, H * 0.4, 0.046), m=pmat('scorch2', '#15130f', 0.95, grime=0.9, grime_scale=9), bevel=0, verts=24)
        sc.scale = (1.0, 0.7, 1.0); o.append(sc)
    return o

def panel(M, side, state, t=0.0):
    """Box on the room side of the inner wall: origin at the wall face (x = 0), extends into the room."""
    o = []
    d = 1 if side == 'port' else -1                       # into the room
    x0, x1 = (0.0, 0.24) if d > 0 else (-0.24, 0.0)
    o.append(gbox('box', x0, -0.26, x1, 0.26, 0.7, 1.32, M['panel'], 0.02))
    o.append(gbox('box_cap', x0 - 0.01, -0.27, x1 + 0.01, 0.27, 1.32, 1.36, M['cap'], 0.015))
    o.append(gbox('stripe', x0, 0.255, x1, 0.27, 0.72, 0.8, M['hazard'], 0.004))
    # the status dome on top
    busy_on = math.sin(t * 2 * math.pi * 4) > 0
    col = {'air': ('#47e07a', 1.3), 'vac': ('#e2574c', 1.3), 'locked': ('#e2574c', 1.5), 'cycle': ('#ffb347', 1.4 if busy_on else 0.25),
           'busy': ('#ffb347', 1.4 if busy_on else 0.25), 'vent': ('#ff3a2a', 1.6 if busy_on else 0.3), 'broken': (None, 0)}[state]
    dm = glow(f'dome_{state}_{busy_on}', col[0], col[1]) if col[0] else pmat('dome_dead', '#3a3030', 0.3)
    o.append(mn.cyl('dome_base', 0.075, 0.03, loc=G((x0 + x1) / 2, -0.1, 1.36), m=M['dark'], bevel=0.008))
    o.append(mn.sphere('dome', 0.065, loc=G((x0 + x1) / 2, -0.1, 1.39), m=dm, scale=(1, 1, 0.9), segs=16))
    # the big CYCLE button (top, front) and a little gauge on the south face
    pressed = state in ('cycle', 'busy') and busy_on
    o.append(mn.cyl('btn_ring', 0.08, 0.025, loc=G((x0 + x1) / 2, 0.12, 1.36), m=M['hazard'], bevel=0.006))
    o.append(mn.cyl('btn', 0.06, 0.04 if not pressed else 0.02, loc=G((x0 + x1) / 2, 0.12, 1.38), m=M['red'] if state != 'broken' else M['scorch'], bevel=0.012))
    o.append(mn.cyl('gauge', 0.07, 0.02, loc=G((x0 + x1) / 2, 0.27, 1.05), m=M['paint_w'], rot=R90, bevel=0.005, verts=24))
    k = {'air': 0.85, 'vac': 0.1, 'locked': 0.85, 'cycle': 0.5 + 0.4 * math.sin(t * 2 * math.pi), 'busy': 0.85, 'vent': 0.05, 'broken': 0.4}[state]
    a = math.radians(-120 + 240 * k)
    o.append(mn.box('needle', (0.012, 0.004, 0.06), loc=((x0 + x1) / 2 + 0.025 * math.sin(a), -(0.285), 1.05 + 0.025 * math.cos(a)), m=M['red'], bevel=0.0, rot=(0, a, 0)))
    o.append(label('lbl', 'CYCLE', 0.05, ((x0 + x1) / 2, -0.276, 0.86), rot=(math.radians(90), 0, 0), m=M['ink']))
    o.append(pipe('conduit', [G((x0 + x1) / 2, 0.0, 0.7), G((x0 + x1) / 2, 0.0, 0.3), G((x0 + x1) / 2 + 0.0, 0.0, 0.02)], 0.03, m=M['cables'][1], corner=0.05))
    if state == 'broken':
        o.append(tape_front((x0 + x1) / 2, 0.27, 1.2, 0.3, 20, M))
        if t < 0.5:
            for (sx, sy, sz) in ((0.05, 0.3, 1.0), (0.12, 0.33, 1.1), (0.0, 0.28, 0.9)):
                o.append(mn.sphere('spark', 0.022, loc=G(d * sx, sy, sz), m=glow('spark', '#ffc860', 1.5), segs=8))
    return o

def render_floor(name, side, state, t=0.0):
    mn.reset(); M = mats()
    o = floor(M, side, state, t)
    mn.outline(o, thickness=0.008)
    win(name, -0.05, W + 0.05, -0.05, H + 0.05, 0.2, origin=(0.0, 0.0),
        extra={'note': f'outer airlock chamber floor ({side}); origin = chamber north-west corner on the floor'})

def render_panel(name, side, state, t=0.0):
    mn.reset(); M = mats()
    o = panel(M, side, state, t)
    mn.outline(o, thickness=0.012)
    x0, x1 = (-0.1, 0.4) if side == 'port' else (-0.4, 0.1)
    win(name, x0, x1, -0.4, 0.4, 1.55, origin=(0.0, 0.0), extra={'note': f'outer airlock panel ({side}); origin = inner wall room face, on the floor'})

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    def want(n): return not only or only in n
    for side in ('port', 'star'):
        p = f'interior/outerlock_{side}'
        for st in ('air', 'vac', 'locked'):
            if want(f'{p}_floor_{st}'): render_floor(f'{p}_floor_{st}', side, st)
            if want(f'{p}_panel_{st}'): render_panel(f'{p}_panel_{st}', side, st)
        for st in ('cycle', 'busy'):
            for i, t in enumerate(FRAMES8):
                if want(f'{p}_floor_{st}_f{i}'): render_floor(f'{p}_floor_{st}_f{i}', side, st, t)
        for st in ('cycle', 'busy', 'vent'):
            for i, t in enumerate(FRAMES8):
                if want(f'{p}_panel_{st}_f{i}'): render_panel(f'{p}_panel_{st}_f{i}', side, st, t)
        for i, t in enumerate((0.0, 0.75)):
            if want(f'{p}_floor_broken_f{i}'): render_floor(f'{p}_floor_broken_f{i}', side, 'broken', t)
            if want(f'{p}_panel_broken_f{i}'): render_panel(f'{p}_panel_broken_f{i}', side, 'broken', t)
