"""CONCEPT MOCK-UP (not a game sprite): "Lights Out" — the derelict lab lit only by the crew's party lights.

    blender -b --factory-startup --python tools/blender/models/concepts/derelict.py -- [lit|brown|all] [out_dir]

Builds Dr. Varga's lab module exactly like models/dock/ships.py (build('derelict', 'port')) and adds the
concept's pieces on top: the string of party lights snaking from the tube through the airlock and the lab
towards the core, the cable reel, the core's junction box (J3) and the black box cradle it powers, Gerald the
dead plant, a few taped notes. Real lights instead of the sprite rig: the sun is turned almost off, the
bulbs, the fire and two suit lamps light the scene (the game would do this at runtime from the normal and
height passes).
  lit    party lights on (the lab is safe where they shine)
  out    as lit, the black box already taken out of its cradle (storyboard)
  brown  brownout: the main cannon fired on our ship, the string is dark, only suit lamps and the fire
Writes <out_dir>/keyart_<variant>.png (+ .json with the canvas origin). Never touches build/renders.
"""
import sys, os, math, random, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
import bpy
import docklib as D
from docklib import *
import ships

A = D.args()
VARIANTS = [a for a in A if a in ('lit', 'brown', 'out')] or ['lit', 'brown', 'out']
OUT = next((a for a in A if a.startswith('/')), '/tmp/mn_concepts/derelict')
mn.SAMPLES = 24
mn.OUT_DIR = OUT
_entry = {}
mn._manifest_put = lambda name, e: _entry.update(e)

# the party-light string: from the tube mouth, through the forced airlock door, round the fire, into the core
PATH = [(-4.9, 0.35), (-6.0, 0.6), (-7.6, -0.9), (-9.0, 0.2), (-10.5, 0.35), (-12.0, 0.1), (-13.0, -0.9), (-14.6, -1.2),
        (-16.2, -0.6), (-17.2, 0.3), (-18.7, 0.25), (-19.5, 0.7)]
BULB_COLS = ['#ffd27a', '#ff6a5a', '#7aff8a', '#6ab4ff', '#ffe25a']

def resample(pts, step):
    out = [pts[0]]; acc = 0.0
    for (a, b) in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / 0.12))
        for k in range(1, n + 1):
            p = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
            acc += L / n
            if acc >= step: out.append(p); acc = 0.0
    return out

def add_light(kind, name, loc, energy, color, radius=0.15, aim=None, spot=0.6, blend=0.35):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind in ('POINT', 'SPOT'): d.shadow_soft_size = radius
    if kind == 'SPOT': d.spot_size = spot; d.spot_blend = blend
    o = bpy.data.objects.new(name, d); o.location = loc; bpy.context.scene.collection.objects.link(o)
    if aim is not None:
        o.rotation_euler = (aim - loc).to_track_quat('-Z', 'Y').to_euler()
    return o

def concept(variant):
    objs = ships.build('derelict', 'port')
    lit = variant in ('lit', 'out')
    rng = random.Random(7); out = []
    cable = pmat('cable', '#1d2a22', 0.6)
    yel = worn('reel', '#e8c34f', 0.45, 0.3, wear=0.8, grime=0.8); dark = pmat('cdark', '#1c1f25', 0.6)
    tape = pmat('ctape', '#b9bcc2', 0.85); ink = pmat('cink', '#23252b', 0.6); paper = pmat('cpaper', '#e6e2d6', 0.8)
    redp = decal_mat('redpaint', '#b0281e', 0.9, rough=0.7)
    # --- the cable: sags a little between pins, lies on the floor
    pts = resample(PATH, 0.18)
    cpts = [(u + rng.uniform(-0.04, 0.04), v + rng.uniform(-0.04, 0.04), FLOOR_Z + 0.03) for (u, v) in pts]
    out.append(pipe_uv('pcable', cpts, 0.028, cable, corner=0.08))
    # --- bulbs every ~0.45 units, alternating colours; dark glass in a brownout
    bulbs = resample(PATH, 0.45)
    for i, (u, v) in enumerate(bulbs[1:-1]):
        c = BULB_COLS[i % len(BULB_COLS)]
        m = emit_mat(f'bulb{i % 5}', c, 1.4, base=c) if lit else mn.mat(f'bulbd{i % 5}', '#3a3a34', 0.2, 0.0, clearcoat=1.0)
        out.append(ucyl('bsock', 0.045, 0.05, u, v, FLOOR_Z + 0.03, dark, verts=10, bevel=0.005))
        out.append(mn.sphere('bulb', 0.07, loc=P(u, v, FLOOR_Z + 0.13), m=m, scale=(1, 1, 1.25), segs=14))
    if lit:
        for k, (u, v) in enumerate(resample(PATH, 1.25)[1:]):
            col = mn.hex_rgb(BULB_COLS[k % 3 if k % 3 != 1 else 0])
            add_light('POINT', f'pl{k}', P(u, v, 0.45), 22.0, tuple(min(1, 0.6 + c * 0.5) for c in col), radius=0.25)
    # the plug end in the runner's hand area (core door) and a taped joint at the airlock door
    pu, pv = PATH[-1]
    out.append(cbox('plug', pu - 0.12, pv + 0.05, 0.22, 0.12, FLOOR_Z, 0.1, yel, bevel=0.02))
    for (u, v) in ((-10.5, 0.35), (-14.6, -1.2)):
        out.append(cbox('ctape', u, v, 0.1, 0.32, FLOOR_Z + 0.02, 0.02, tape, bevel=0.003, rotz=rng.uniform(-0.3, 0.3)))
    # --- the reel in the derelict's airlock (brought over from our ship)
    ru, rv = -6.3, -1.6
    for dv in (-0.28, 0.28):
        disc_ = mn.cyl('reel_side', 0.42, 0.05, loc=P(ru, rv + dv, 0.44), m=yel, verts=28, bevel=0.01, rot=(R90, 0, 0)); out.append(disc_)
    out.append(mn.cyl('reel_drum', 0.28, 0.52, loc=P(ru, rv, 0.44), m=cable, verts=24, bevel=0.02, rot=(R90, 0, 0)))
    out.append(ubox('reel_foot', ru - 0.45, rv - 0.36, ru + 0.45, rv + 0.36, 0.0, 0.06, dark, bevel=0.02))
    out.append(cbox('reel_crank', ru + 0.0, rv + 0.36, 0.06, 0.06, 0.4, 0.3, dark, bevel=0.01))
    out.append(text('reel_t', 'PARTY LIGHTS 30 m', ru, rv + 0.75, FLOOR_Z + 0.003, 0.11, yel))
    out.append(text('reel_t2', 'PROPERTY OF OUR SHIP - BRING IT BACK', ru, rv + 0.95, FLOOR_Z + 0.003, 0.07, tape))
    out.append(pipe_uv('reel_lead', [(ru + 0.2, rv + 0.3, 0.2), (ru + 0.5, rv + 1.2, FLOOR_Z + 0.03), (-6.0, 0.6, FLOOR_Z + 0.03)], 0.028, cable, corner=0.3))
    # --- J3: the core's junction box on the back wall, and the black box cradle it powers
    Kv = ROOMS['core'][1]
    ju = -20.3
    out.append(ubox('j3', ju - 0.35, Kv - 0.02, ju + 0.35, Kv + 0.16, 0.35, 1.0, yel, bevel=0.02))
    out.append(ubox('j3_door', ju - 0.3, Kv + 0.16, ju + 0.3, Kv + 0.18, 0.4, 0.95, worn('j3d', '#5a6068', 0.5, 0.4, frost=0.8), bevel=0.01))
    out.append(text('j3_t', 'J3', ju, Kv + 0.19, 0.83, 0.16, ink, face=True))
    out.append(mn.sphere('j3_led', 0.04, loc=P(ju + 0.18, Kv + 0.2, 0.55), m=emit_mat('led_r', '#ff3a2a', 1.2, base='#601010'), segs=10))
    bu, bv = SPOT['box']
    for du in (-0.42, 0.42):                                     # cradle clamps round the black box
        out.append(cbox('clamp', bu + du, bv, 0.12, 0.6, FLOOR_Z, 0.32, yel, bevel=0.02))
        out.append(cbox('clamp_jaw', bu + du * 0.72, bv, 0.12, 0.42, 0.22, 0.08, dark, bevel=0.01))
    if variant != 'out': out.append(cbox('bbox', bu, bv, 0.62, 0.42, FLOOR_Z, 0.3, worn('bbox', '#e86a1e', 0.45, 0.3, wear=0.6), bevel=0.04))
    if variant != 'out': out.append(text('bbox_t', 'FLIGHT RECORDER', bu, bv - 0.05, 0.34, 0.06, ink))
    out.append(mn.sphere('cr_led', 0.035, loc=P(bu - 0.42, bv + 0.3, 0.36), m=emit_mat('led_r', '#ff3a2a', 1.2, base='#601010'), segs=10))
    out.append(pipe_uv('cr_wire', [(bu - 0.42, bv - 0.25, 0.05), (bu - 0.9, bv - 2.0, 0.04), (ju, -2.3, 0.04), (ju, Kv + 0.1, 0.4)], 0.025, dark, corner=0.3))
    # --- writing on the core floor and taped notes in the lab
    out.append(text('scrawl', 'IT ONLY MOVES IN THE DARK', -22.0, -0.45, FLOOR_Z + 0.004, 0.2, redp, rotz=0.05))
    Cv = ROOMS['cargo'][1]
    out.append(ubox('plaque', -17.8, Cv, -16.2, Cv + 0.02, 1.38, 1.62, worn('plq', '#e8c34f', 0.5, 0.2, wear=0.6), bevel=0.004))
    out.append(text('plaque_t', 'SPECIMEN 7 - DO NOT FEED', -17.0, Cv + 0.03, 1.5, 0.075, ink, face=True))
    out.append(ubox('note', -18.9, -0.95, -18.55, -0.93, 0.95, 1.35, paper, bevel=0.002))
    for (u, v) in ((-11.4, 3.3), (-15.3, 3.0)):                  # papers with the duct tape still on
        out.append(cbox('npaper', u, v, 0.32, 0.4, FLOOR_Z + 0.004, 0.004, paper, bevel=0, rotz=rng.uniform(-0.5, 0.5)))
        out.append(cbox('ntape', u, v - 0.18, 0.2, 0.06, FLOOR_Z + 0.009, 0.004, tape, bevel=0))
    # Gerald, the dead plant, and the cold coffee on the bench
    gu, gv = -11.5, -3.2
    out.append(ucyl('pot', 0.2, 0.3, gu, gv, 0.0, worn('pot', '#b86a3a', 0.6, 0.0, wear=0.5), verts=20, bevel=0.03))
    for k in range(6):
        a = k * math.tau / 6
        out.append(pipe_uv('stem', [(gu, gv, 0.3), (gu + math.cos(a) * 0.12, gv + math.sin(a) * 0.08, 0.5), (gu + math.cos(a) * 0.3, gv + math.sin(a) * 0.2, 0.42)], 0.018,
                           pmat('deadleaf', '#6a5a2a', 0.8), corner=0.08))
    out.append(text('gerald', 'GERALD', gu, gv + 0.32, 0.12, 0.07, paper, face=True))
    out.append(ucyl('mug', 0.07, 0.11, -12.9, Cv + 0.2, 0.72, worn('mug', '#d8d8d0', 0.4, 0.0), verts=14, bevel=0.01))
    # the fire: a few emissive tongues and a real orange light
    fu, fv = SPOT['fire']
    for k in range(5):
        h = rng.uniform(0.25, 0.5); du, dv = rng.uniform(-0.15, 0.15), rng.uniform(-0.1, 0.1)
        fl = mn.sphere('flame', 0.12, loc=P(fu + du, fv + dv, FLOOR_Z + h * 0.5), m=emit_mat('flame', '#ff9a2a', 1.0, base='#ff6a10'), scale=(0.7, 0.7, h / 0.24), segs=12)
        out.append(fl)
    add_light('POINT', 'fire', P(fu, fv, 0.5), 30.0, (1.0, 0.55, 0.2), radius=0.3)
    # suit lamps: the watcher keeps Specimen 7 in her beam; the runner looks at the cradle
    au, av = SPOT['alien']
    add_light('SPOT', 'beam_watch', P(-17.4, 1.6, 1.0), 1400.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(au, av, 0.0), spot=0.42, blend=0.25)
    add_light('SPOT', 'beam_run', P(-19.6, 0.9, 1.0), 600.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(bu, bv, 0.0), spot=0.5, blend=0.3)
    if not lit:
        add_light('SPOT', 'beam_air', P(-7.0, -0.5, 1.0), 600.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(-9.5, 1.0, 0.0), spot=0.5, blend=0.3)
    # night: the sprite rig almost off, so the only light is ours
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN':
            o.data.energy *= 0.12 if lit else 0.05
    bg = bpy.context.scene.world.node_tree.nodes['Background']; bg.inputs[1].default_value = 0.06
    mn.outline([o for o in out if o.name.split('.')[0] in ('reel_side', 'reel_drum', 'reel_foot', 'j3', 'clamp', 'bbox', 'pot', 'plug')], thickness=0.012)
    meshes = [o for o in objs + out if o is not None and o.type == 'MESH']
    try:
        mn.render(f'keyart_{variant}', objs=meshes, passes=('beauty',))
    except Exception as e:                                       # shared GPU: fall back to the CPU
        print('[concept] GPU render failed, CPU fallback:', e)
        bpy.context.scene.cycles.device = 'CPU'
        mn.render(f'keyart_{variant}', objs=meshes, passes=('beauty',))
    with open(os.path.join(OUT, f'keyart_{variant}.json'), 'w') as f: json.dump(_entry, f)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for v in VARIANTS: concept(v)
