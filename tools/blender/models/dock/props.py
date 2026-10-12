"""Stateful things inside the docked ships (js/dock.js drawDock / dockClickTarget), one sprite per state.

    blender -b --factory-startup --python tools/blender/models/dock/props.py -- [reactor|core|crate|door|all] [quick]

Each sprite's origin is the game point the prop is placed at (g.core, g.crate, the door rect's centre); the
props are symmetric, so the same sprite serves both sides.
  dock/pirate_reactor            the raider's (and the prison barge's) reactor, 6-frame slow pulse
                                 (d.kind === 'pirate' && !d.overloaded). Footprint 1.8 x 2.2 around g.core.
  dock/pirate_reactor_overload   d.overloaded: lever shoved into the red with a wrench jammed in it, core
                                 white-hot, beacon flashing: 6-frame fast loop. (The 'OVERLOAD n' countdown
                                 stays game text.)
  dock/derelict_core             the derelict's dead power core (d.kind === 'derelict'), frosted, dark.
  dock/crate_loot_full           pirate loot crate (1.3 x 1.0 around g.crate), d.crate.length >= 2
  dock/crate_loot_one            d.crate.length === 1
  dock/crate_loot_empty          d.crate.length === 0
  dock/crate_cargo               the derelict's cargo crate (always empty: dk.dock.crate = [] there)
  dock/door_jammed               a jammed derelict door (d.doors[i] true; drawn over the door rect g.doors[i])
  dock/door_open                 after the manual override (d.doors[i] false): the door pried back into the wall
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docklib as D
from docklib import *

A = D.args()
WHAT = [a for a in A if a in ('reactor', 'core', 'crate', 'door')] or ['reactor', 'core', 'crate', 'door']
QUICK = 'quick' in A
if QUICK:
    mn.SAMPLES = 16; mn.OUT_DIR = '/tmp/mn_dock'; mn._manifest_put = lambda *a, **k: None
FRAMES = list(range(1, 7))

def base_mats(der=False):
    fr = 0.6 if der else 0.0
    return dict(
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6, frost=fr),
        dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        hazard=stripes_mat('hazard'), tape=pmat('tape', '#b9bcc2', 0.85), ink=pmat('ink', '#23252b', 0.6),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6, frost=fr), sticker=pmat('sticker', '#f2df6b', 0.6),
        rubber=pmat('rubber', '#262a33', 0.7), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, frost=fr),
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2), glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        gold=worn('gold', '#e8b42e', 0.4, 0.3, wear=0.8, grime=0.6),
    )

def finish(objs, catcher=(3.0, 3.2)):
    import shiplib; shiplib._hidden_in_data.clear()               # (stale after mn.reset)
    shadow_catcher(catcher)
    mn.outline([o for o in objs if not o.name.startswith(('rivet', 'txt', 'tick', 'slot', 'stencil'))], thickness=0.013)

# ---------------------------------------------------------------------------------------------------
# Reactor / core (footprint CORE_WH = 1.8 x 2.2 centred on the origin)
# ---------------------------------------------------------------------------------------------------
def core_body(M, out, dead=False):
    W, Dp = CORE_WH
    out.append(cbox('plinth', 0, 0, W, Dp, 0, 0.14, M['plinth'], bevel=0.04))
    out.append(cbox('plinth_hz', 0, Dp / 2 - 0.16, W - 0.25, 0.2, 0.14, 0.012, M['hazard'], bevel=0.004))
    for su in (-1, 1):
        for sv in (-1, 1): out.append(mn.cyl('bolt', 0.04, 0.05, loc=P(su * (W / 2 - 0.1), sv * (Dp / 2 - 0.1), 0.14), m=M['steel'], verts=6, bevel=0.01))
    cu, cv, r = 0.0, -0.12, 0.66
    out.append(ucyl('drum', r, 1.05, cu, cv, 0.14, M['paint'], verts=48, bevel=0.05))
    for z in (0.3, 0.9):
        out.append(ring('band', r + 0.03, 0.07, 0.09, loc=P(cu, cv, z), m=M['band'], verts=48))
    for k in range(10):                                                   # rivets on the bands
        a = math.radians(200 + k * 14)
        for z in (0.345, 0.945): out.append(rivet(cu + math.cos(a) * (r + 0.035), cv - math.sin(a) * (r + 0.035), z, M['steel'], 0.018))
    # vent slits on the front, glowing from inside
    for k, a in enumerate((-40, -20, 0, 20, 40)):
        aa = math.radians(270 + a)
        x, y = cu + math.cos(aa) * (r - 0.01), cv - math.sin(aa) * (r - 0.01)
        sl = mn.box('slit', (0.07, 0.05, 0.4), loc=P(x, y, 0.42), m=M['vent'], bevel=0.01, rot=(0, 0, math.radians(a)))
        out.append(sl)
    # top: collar, caged core window
    out.append(ucyl('lid', r + 0.05, 0.1, cu, cv, 1.19, M['lid'], verts=48, bevel=0.03))
    out.append(ring('lid_hz', r + 0.06, 0.09, 0.06, loc=P(cu, cv, 1.27), m=M['hazard'], verts=48))
    out.append(ucyl('win_rim', 0.42, 0.08, cu, cv, 1.29, M['steel'], verts=40, bevel=0.02))
    out.append(ucyl('win', 0.34, 0.03, cu, cv, 1.35, M['core'], verts=40, bevel=0))
    for k in range(3):
        a = k * math.pi / 3
        b = cbox('cage', cu, cv, 0.74, 0.05, 1.37, 0.05, M['steel'], bevel=0.012, rotz=a); out.append(b)
    out.append(ucyl('cage_hub', 0.08, 0.07, cu, cv, 1.36, M['lid'], verts=16, bevel=0.015))
    # pipes from the back into the floor
    for su in (-1, 1):
        out.append(pipe_uv('pipe', [(su * 0.45, cv - 0.4, 1.0), (su * 0.62, -0.95, 1.0), (su * 0.62, -0.95, 0.14)], 0.07, M['pipe'], corner=0.18))
        out.append(ucyl('flange', 0.11, 0.05, su * 0.62, -0.95, 0.14, M['steel'], verts=16, bevel=0.012))
    out.append(ucyl('tape_pipe', 0.085, 0.1, -0.62, -0.95, 0.5, M['tape'], verts=16, bevel=0.01))

def lever(M, out, overload):
    """The overload lever on the front right: a zone plate (green up, red down) and the handle."""
    lu, lv = 0.55, 0.72
    out.append(cbox('lev_box', lu, lv, 0.38, 0.3, 0.14, 0.5, M['lid'], bevel=0.03))
    out.append(ubox('zone_g', lu - 0.14, lv + 0.15, lu + 0.14, lv + 0.16, 0.42, 0.6, M['green'], bevel=0.003))
    out.append(ubox('zone_r', lu - 0.14, lv + 0.15, lu + 0.14, lv + 0.16, 0.2, 0.4, M['redp'], bevel=0.003))
    out.append(ubox('lev_slot', lu - 0.025, lv - 0.12, lu + 0.025, lv + 0.12, 0.639, 0.645, M['black'], bevel=0))
    ang = math.radians(-35 if not overload else 60)                     # tilt about the u axis: towards the camera = down/red
    arm = mn.box('lev_arm', (0.05, 0.05, 0.55), loc=(0, 0, 0), m=M['steel'], bevel=0.012)
    knob = mn.sphere('lev_knob', 0.08, loc=(0, 0, 0.58), m=M['knob'], segs=16)
    piv = mn.group('lev_piv', [arm, knob], loc=P(lu, lv, 0.64)); piv.rotation_euler = (ang, 0, 0)
    out += [arm, knob]
    out.append(ucyl('lev_hub', 0.06, 0.1, lu, lv, 0.6, M['dark'], axis='u', verts=16, bevel=0.01))
    out[-1].location = P(lu - 0.05, lv, 0.65)
    if overload:                                                         # the wrench jammed into the slot
        w = mn.box('wrench', (0.06, 0.5, 0.025), loc=(0, 0, 0), m=M['steel'], bevel=0.008)
        jaw = ring('wrench_jaw', 0.08, 0.035, 0.03, m=M['steel'])
        jaw.location = (0, 0.27, 0.0)
        g = mn.group('wrench_g', [w, jaw], loc=P(lu + 0.02, lv - 0.05, 0.7)); g.rotation_euler = (math.radians(-25), math.radians(15), math.radians(30))
        out += [w, jaw]
        out.append(cbox('tape_lev', lu, lv + 0.12, 0.2, 0.07, 0.58, 0.07, M['tape'], bevel=0.01, rotz=0.3))

def reactor_mats(state):
    M = base_mats()
    M.update(plinth=worn('plinth', '#3a3036', 0.5, 0.6), paint=worn('paint', '#8a2e26', 0.45, 0.15, wear=0.8, rust=0.15),
             band=worn('rband', '#2e2428', 0.5, 0.4), lid=worn('lid', '#4a3c40', 0.4, 0.6),
             pipe=worn('pipe', '#6a3a30', 0.4, 0.5, rust=0.3), green=emit_mat('zg', '#5aff8a', 0.7, base='#2a7a4a'),
             redp=emit_mat('zr', '#ff4a2a', 0.9, base='#7a1a14'), knob=mn.mat('knob', '#e2574c', 0.35))
    M['core'] = glow('core', '#ff6a3a', 1.0); M['vent'] = glow('vent', '#ff7a3a', 1.0)
    return M

def build_reactor(overload):
    mn.reset(); set_side('port'); out = []
    M = reactor_mats(overload)
    core_body(M, out); lever(M, out, overload)
    # red beacon on the lid edge (flashes when overloaded)
    out.append(ucyl('beacon_base', 0.1, 0.06, -0.5, -0.65, 1.19, M['dark'], verts=16, bevel=0.015))
    bm = glow('beacon', '#ff2a1a', 1.2); M['beacon'] = bm
    out.append(mn.sphere('beacon', 0.09, loc=P(-0.5, -0.65, 1.27), m=bm, scale=(1, 1, 1.2), segs=16))
    lbl = cbox('plate_lbl', -0.35, 0.62, 0.5, 0.02, 0.28, 0.16, M['sticker'], bevel=0.003); out.append(lbl)
    out.append(text('stencil', 'DANGER', -0.35, 0.645, 0.36, 0.08, M['ink'], face=True))
    finish(out)
    # light from the core so the room gets the glow (also helps the normal-mapped look in the beauty pass)
    ld = bpy.data.lights.new('core_light', 'POINT'); ld.color = (1.0, 0.45, 0.25); ld.shadow_soft_size = 0.3
    lo = mn.link(bpy.data.objects.new('core_light', ld)); lo.location = P(0, -0.12, 1.7)
    emc, emv, emb = M['core'].node_tree.nodes['Emission'], M['vent'].node_tree.nodes['Emission'], bm.node_tree.nodes['Emission']
    for i, f in enumerate(FRAMES):
        if not overload:                                                 # slow breathing: game glow 0.5 + 0.2 sin(2t)
            k = 0.5 + 0.5 * math.cos(math.tau * i / len(FRAMES))
            emc.inputs['Strength'].default_value = 0.7 + 0.6 * k; emv.inputs['Strength'].default_value = 0.5 + 0.6 * k
            emb.inputs['Strength'].default_value = 0.0; ld.energy = 6 + 10 * k
        else:                                                            # fast flicker, white-hot, beacon blinking
            k = (1.0, 0.35, 0.85, 0.2, 0.95, 0.45)[i]
            emc.inputs['Color'].default_value = (1.0, 0.85, 0.45, 1); emc.inputs['Color'].keyframe_insert('default_value', frame=f)
            emc.inputs['Strength'].default_value = 0.8 + 0.7 * k; emv.inputs['Strength'].default_value = 0.7 + 0.8 * k
            emb.inputs['Strength'].default_value = 1.4 if i % 2 == 0 else 0.0; ld.energy = 10 + 25 * k
        for n in (emc, emv, emb): n.inputs['Strength'].keyframe_insert('default_value', frame=f)
        ld.keyframe_insert('energy', frame=f)
    objs = [o for o in out if o is not None and o.type == 'MESH']
    mn.render('dock/pirate_reactor' + ('_overload' if overload else ''), objs=objs, frames=FRAMES)

def build_dead_core():
    mn.reset(); set_side('port'); out = []
    M = base_mats(der=True)
    M.update(plinth=worn('plinth', '#3a3f46', 0.5, 0.6, frost=0.6), paint=worn('paint', '#7c848e', 0.45, 0.2, wear=0.6, frost=0.7, grime=1.2),
             band=worn('rband', '#3a4048', 0.5, 0.4, frost=0.5), lid=worn('lid', '#4c525a', 0.4, 0.6, frost=0.7),
             pipe=worn('pipe', '#3b6a7a', 0.4, 0.3, frost=0.7), core=mn.mat('core_dead', '#14202a', 0.1, 0.3, clearcoat=1.0),
             vent=pmat('vent_dead', '#101418', 0.5))
    core_body(M, out, dead=True)
    # status panel on the front: one red error lamp (the only light), cut cables hanging
    out.append(cbox('panel', 0.5, 0.75, 0.5, 0.2, 0.14, 0.42, M['lid'], bevel=0.03))
    out.append(cbox('scr', 0.5, 0.86, 0.36, 0.01, 0.3, 0.18, M['glass'], bevel=0.003))
    out.append(mn.sphere('err', 0.035, loc=P(0.35, 0.86, 0.5), m=emit_mat('err', '#ff3a2a', 0.8, base='#401010'), segs=12))
    for su, c in ((-0.25, '#9a5634'), (-0.12, '#3a5a8e')):
        out.append(pipe_uv('cut_cable', [(su, -0.12 + 0.66, 1.0), (su - 0.05, 0.75, 0.7), (su + 0.05, 0.95, 0.16)], 0.03, pmat('cc' + c, c, 0.6), corner=0.15))
    out.append(cbox('sticker', -0.3, 0.6, 0.5, 0.02, 0.6, 0.14, M['white'], bevel=0.003))
    out.append(text('txt', 'VARGA INST.', -0.3, 0.62, 0.67, 0.065, M['ink'], face=True))
    finish(out)
    mn.render('dock/derelict_core', objs=[o for o in out if o.type == 'MESH'])

# ---------------------------------------------------------------------------------------------------
# Crates (CRATE_WH = 1.3 x 1.0 centred on g.crate)
# ---------------------------------------------------------------------------------------------------
def build_crate(kind, n):
    mn.reset(); set_side('port'); out = []
    der = kind == 'cargo'
    M = base_mats(der)
    body = worn('cbody', '#8a5a3a' if not der else '#7a808a', 0.55, 0.3, wear=0.8, rust=0.2 if not der else 0, frost=0.6 if der else 0)
    W, Dp, H = CRATE_WH[0], CRATE_WH[1], 0.62
    out.append(cbox('floor_ring', 0, 0, W, Dp, 0, 0.06, M['dark'], bevel=0.02))
    t = 0.07
    out.append(cbox('bottom', 0, 0, W - 0.04, Dp - 0.04, 0.0, 0.12, body, bevel=0.02))
    for (u, v, w, d) in ((0, -Dp / 2 + t / 2 + 0.02, W - 0.04, t), (0, Dp / 2 - t / 2 - 0.02, W - 0.04, t),
                         (-W / 2 + t / 2 + 0.02, 0, t, Dp - 0.04), (W / 2 - t / 2 - 0.02, 0, t, Dp - 0.04)):
        out.append(cbox('wall', u, v, w, d, 0.0, H, body, bevel=0.02))
    out.append(cbox('inside', 0, 0, W - 0.2, Dp - 0.2, 0.0, 0.14, M['dark'], bevel=0))
    for u in (-W / 2 + 0.02, W / 2 - 0.02):                               # steel corner posts
        for v in (-Dp / 2 + 0.02, Dp / 2 - 0.02):
            out.append(cbox('post', u, v, 0.1, 0.1, 0.0, H + 0.02, M['steel'], bevel=0.02))
    out.append(ubox('band', -W / 2 + 0.02, Dp / 2 - 0.02, W / 2 - 0.02, Dp / 2 + 0.005, 0.2, 0.3, M['hazard'] if not der else M['steel'], bevel=0.008))
    out.append(text('stencil', 'LOOT' if not der else 'CARGO', 0.0, Dp / 2 + 0.01, 0.45, 0.16, M['white'], face=True))
    # lid hinged on the north edge, standing open (leaning back)
    lid = mn.box('lid', (W, 0.06, Dp), loc=(0, 0, 0), m=body, bevel=0.02)
    lid.location = P(0, -Dp / 2 - 0.02, H); lid.rotation_euler = (math.radians(-100), 0, 0)
    for o in [lid]:
        for v_ in o.data.vertices: v_.co.z += Dp / 2      # pivot at the lid's edge
    out.append(lid)
    if der:                                                               # busted: lid torn half off, frost inside
        lid.rotation_euler = (math.radians(-120), math.radians(12), 0)
        out.append(disc('frost_in', 0, 0, 0.145, 0.45, decal_mat('frostd', '#c8d8e6', 0.5, 9.0), sv=0.7))
    else:
        # straw/packing in the bottom
        for k in range(12):
            r = random.Random(k)
            out.append(cbox('straw', r.uniform(-0.45, 0.45), r.uniform(-0.3, 0.3), 0.18, 0.02, 0.14, 0.012, M['sticker'], bevel=0, rotz=r.uniform(0, 3)))
        cell = emit_mat('cell', '#2ee070', 0.9, base='#1a7a3a')
        for i in range(n):                                                # fuel cells lying in the crate (the loot)
            u = -0.22 + i * 0.42
            out.append(ucyl('cell', 0.11, 0.62, u, -0.31, 0.25, cell, axis='v', verts=20, bevel=0.015))
            out.append(ucyl('cell_cap', 0.12, 0.08, u, -0.36, 0.25, M['steel'], axis='v', verts=20, bevel=0.015))
            out.append(ucyl('cell_cap', 0.12, 0.08, u, 0.29, 0.25, M['steel'], axis='v', verts=20, bevel=0.015))
        if n:
            for k in range(6):
                r = random.Random(50 + k)
                out.append(ucyl('coin', 0.05, 0.012, r.uniform(-0.45, 0.45), r.uniform(-0.3, 0.3), 0.15 + 0.01 * k, M['gold'], verts=12, bevel=0.003))
    out = [o for o in out if o is not None]
    finish(out, (2.2, 2.0))
    name = 'dock/crate_cargo' if der else 'dock/crate_loot_' + {2: 'full', 1: 'one', 0: 'empty'}[n]
    mn.render(name, objs=[o for o in out if o.type == 'MESH'])

# ---------------------------------------------------------------------------------------------------
# The jammed derelict door (door rect 0.6 x 1.6, centred on the origin; the wall runs along v)
# ---------------------------------------------------------------------------------------------------
def build_door(state):
    mn.reset(); set_side('port'); out = []
    M = base_mats(der=True)
    slab = worn('slab', '#7c848e', 0.45, 0.4, wear=0.7, frost=0.7, grime=1.2)
    if state == 'jammed':
        out.append(cbox('slab', 0, 0, 0.22, 1.6, 0.0, H_FULL - 0.05, slab, bevel=0.03))
        out.append(ubox('slab_end_hz', -0.1, 0.8, 0.1, 0.82, 0.15, H_FULL - 0.25, M['hazard'], bevel=0.004))
        for v in (-0.5, 0.0, 0.5):
            out.append(cbox('rib', 0, v, 0.26, 0.08, H_FULL - 0.08, 0.04, M['steel'], bevel=0.01))
        out.append(cbox('seam', 0, 0.0, 0.24, 0.02, 0.0, H_FULL - 0.04, M['black'], bevel=0))   # the two leaves meet here
        # dent where something hit it from the other side, and a pry bar wedged in the seam
        out.append(mn.sphere('dent', 0.16, loc=P(0.0, 0.3, H_FULL - 0.05), m=M['black'], scale=(0.7, 1.2, 0.25), segs=16))
        bar = mn.box('prybar', (0.04, 0.04, 0.9), loc=(0, 0, 0), m=pmat('pry', '#c0392b', 0.5), bevel=0.01)
        bar.location = P(0.13, 0.05, 0.25); bar.rotation_euler = (math.radians(-35), math.radians(25), 0); out.append(bar)
        # override panel at the south end: red lamp, sparks of a shorted box
        out.append(ubox('panel', -0.12, 0.82, 0.12, 0.87, 0.75, 1.05, M['dark'], bevel=0.01))
        out.append(ubox('panel_lamp', -0.05, 0.86, 0.05, 0.885, 0.93, 0.99, emit_mat('lamp_r', '#ff3a2a', 1.2, base='#601010'), bevel=0.003))
        out.append(text('txt', 'JAMMED', 0, 0.875, 0.83, 0.05, M['white'], face=True))
    else:
        # pried open: the leaves are back in the wall, only bent lips stick out at both ends
        for sv in (-1, 1):
            lip = cbox('lip', 0, sv * 0.73, 0.22, 0.14, 0.0, H_FULL - 0.05 if sv < 0 else H_LOW + 0.1, slab, bevel=0.02)
            out.append(lip)
            out.append(ubox('lip_hz', -0.1, sv * 0.66 - 0.01, 0.1, sv * 0.66 + 0.01, 0.1, (H_FULL - 0.2) if sv < 0 else H_LOW, M['hazard'], bevel=0.003))
        bar = mn.box('prybar', (0.04, 0.9, 0.04), loc=(0, 0, 0), m=pmat('pry', '#c0392b', 0.5), bevel=0.01)
        bar.location = P(0.18, 0.15, FLOOR_Z); bar.rotation_euler = (0, 0, math.radians(20)); out.append(bar)
    finish(out, (1.6, 2.4))
    mn.render('dock/door_' + state, objs=[o for o in out if o.type == 'MESH'])

if __name__ == '__main__':
    t0 = time.time()
    if 'reactor' in WHAT: build_reactor(False); build_reactor(True)
    if 'core' in WHAT: build_dead_core()
    if 'crate' in WHAT:
        for n in (2, 1, 0): build_crate('loot', n)
        build_crate('cargo', 0)
    if 'door' in WHAT: build_door('jammed'); build_door('open')
    print(f'[dock] props {WHAT} in {time.time() - t0:.0f} s')
