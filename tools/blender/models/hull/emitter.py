"""The shield emitters: the devices on the outside of the hull that project the shields (SHIELD_EMITTERS in
js/ship.js; the buttons inside only switch them on). One per shield: port, star (on the side walls, level with
the airlock rooms) and front (on the nose's left shoulder).

Each is a squat projector pylon on a bracket bolted to the hull's side face: a drum with cooling fins and a
hazard band, a column of copper coils with energy rings between them, and on top a tilted hexagonal lens array
(7 glowing cells, three prongs) that looks out from the hull, where the shield goes up. A status lamp on the
side that faces the camera, a power cable from the hull into the drum, duct tape.

Sprites (build/renders/hull/):
  emitter_<spot>_idle        ready: cells a dim blue, lamp green
  emitter_<spot>_cd          recharging (the shield dropped, combat.shields[side].cd > 0): cells dark, lamp amber
  emitter_<spot>_up_f<0..3>  projecting (shield up): cells and energy rings bright, a halo over the lens; a 4-frame
                             loop (the glow climbs the coil); game: frame = floor(t * 10) % 4
  emitter_<spot>_broken      broken (its SYSTEMS entry, kind 'emitter'): lens head knocked askew, cells smashed,
                             a coil ring sprung, scorch, a dangling wire with a spark, lamp dead
  spot = port | star | front. Origin = the emitter's (x, y) on the deck plane (SHIELD_EMITTERS). Rendered with
  the hull slab as a holdout (the bracket disappears into the hull), so draw them after the hull tiles, in the
  'main' layer (spacewalkers float round them), sortY = y.

    blender -b --factory-startup --python tools/blender/models/hull/emitter.py [-- quick] [-- only=port,front]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hulllib import *
from mathutils import Matrix
import body

ARGS = args()
QUICK = 'quick' in ARGS
ONLY = next((a.split('=')[1].split(',') for a in ARGS if a.startswith('only=')), None)
if QUICK: mn.SAMPLES = 16

# (x, y, face): keep in sync with SHIELD_EMITTERS in js/ship.js
EMITTERS = {
    'port': (-0.75, 15.7, math.pi),
    'star': (SHIP_W + 0.75, 15.7, 0.0),
    'front': (15.1, -2.05, math.atan2(-3.8, -3.2)),
}
EDGE = {'port': 0.75, 'star': 0.75, 'front': 0.6}   # how far out from the hull edge the emitter's centre is

def mats():
    return dict(
        frame=worn('frame', '#2b303a', 0.5, 0.4, wear=0.8),
        gun=worn('gunmetal', '#4a515e', 0.4, 0.45, wear=0.7),
        body=worn('body', '#6b7486', 0.42, 0.4, wear=1.0),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        dark=worn('dark', '#1c1f25', 0.6, 0.3),
        hazard=hazard_mat('hazard', 7.0),
        tape=tape_mat(),
        coilcu=worn('coilcu', '#b87a3e', 0.35, 0.9, wear=0.3, grime=0.6),
        copper=mn.mat('copper', 'copper', 0.35, 1.0),
        rubber=mn.mat('rubber', 'rubber', 0.7),
        blue=worn('blue', '#3f6fa8', 0.45, 0.2, wear=0.9),          # the "this makes the shield" paint
        white=mn.mat('stencil', '#eef0f4', 0.5),
        scorch=scorch_mat('scorch', 0.85),
        char=worn('char', '#3a3532', 0.85, 0.3, wear=0.5, grime=1.4),
        ember=emit_mat('ember', '#ff7a2a', 1.5, base='#401008'),
        deadlamp=mn.mat('deadlamp', '#3a2a28', 0.4),
        deadglass=mn.mat('deadglass', '#11161e', 0.15, 0.2),
    )

def holdout_slab(dx, dy):
    """The hull slab (body.py) as a holdout, shifted into the sprite's frame (origin = the emitter)."""
    h = prism('hold_slab', HULL, body.Z_SIDE, 0.0, None, bevel=0, under=body.BELLY_IN, z_under=body.Z_BELLY)
    h.data.transform(Matrix.Translation((-dx, dy, 0))); h.is_holdout = True
    return h

def hexagon(name, r, z0, z1, m, bevel=0.008, cx=0.0, cy=0.0):
    pts = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in (i * math.pi / 3 for i in range(6))]
    return prism(name, pts, z0, z1, m, bevel=bevel)

# Local frame (game-style coords, G() maps them): +x = out from the hull (the way the lens looks), y along the
# hull, z up. The whole model hangs under an empty turned to the spot's face angle.
ZB = -0.42                    # drum bottom
ZT = -0.1                     # drum top (the coil column starts here)
HEAD_Z = 0.36                 # lens pivot height
TILT = math.radians(38)       # the lens tilts out from the hull

def build(spot, state, M, frames=None):
    """Returns (parts, root, anim) where anim(frame index) is set up for the 'up' loop."""
    ex, ey, face = EMITTERS[spot]
    edge = EDGE[spot]
    parts = []; P = lambda o: parts.append(o) or o
    broken = state == 'broken'
    # --- bracket into the hull + a diagonal strut under it
    P(gbox('bracket', -edge - 0.35, -0.24, -0.12, 0.24, -0.4, -0.12, M['frame'], 0.025))
    P(gbox('bracket_top', -edge - 0.3, -0.2, -0.2, 0.2, -0.12, -0.1, M['blue'], 0.01))
    P(text('br_txt', 'SHLD', -edge * 0.5 - 0.12, 0.0, -0.1, 0.09, M['white'], rot=math.pi / 2))
    for by in (-0.15, 0.15):
        P(gsphere('br_bolt', -edge + 0.06, by, -0.1, 0.022, M['steel'], scale=(1, 1, 0.5), segs=8))
    P(tube('strut', [(-edge - 0.2, 0.0, -0.62), (-0.1, 0.0, -0.36)], 0.035, M['steel']))
    # --- drum: base of the pylon, hazard band, cooling fins
    P(gcyl('drum', 0, 0, 0.3, ZB, ZT, M['gun'], verts=40, bevel=0.03))
    P(ring('drum_band', 0.305, 0.03, 0.06, loc=G(0, 0, ZB + 0.1), m=M['hazard'], verts=40))
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        if abs(math.cos(a)) > 0.92 and math.cos(a) < 0: continue           # (not on the bracket side)
        fin = mn.box('fin', (0.12, 0.022, 0.24), loc=(0, 0, 0), m=M['body'], bevel=0.006)
        fin.location = G(math.cos(a) * 0.33, math.sin(a) * 0.33, ZB + 0.15); fin.rotation_euler = (0, 0, -a)
        P(fin)
    P(gcyl('drum_cap', 0, 0, 0.24, ZT - 0.01, ZT + 0.03, M['frame'], verts=40, bevel=0.012))
    # --- coil column
    P(gcyl('core', 0, 0, 0.13, ZT, HEAD_Z - 0.04, M['dark'], verts=24, bevel=0.01))
    coil_z = [ZT + 0.05, ZT + 0.16, ZT + 0.27]
    coils = []
    for k, z in enumerate(coil_z):
        c = P(ring(f'coil{k}', 0.24, 0.1, 0.075, loc=G(0, 0, z), m=M['coilcu'], verts=40))
        coils.append(c)
    if broken:                                                             # the top coil sprang loose
        coils[2].location = G(0.06, 0.04, coil_z[2] + 0.03); coils[2].rotation_euler = (0.35, -0.25, 0)
    # energy rings between the coils (glow per state; per frame in the 'up' loop)
    erings = []
    for k, z in enumerate([coil_z[0] + 0.085, coil_z[1] + 0.085]):
        erings.append(z)
    # --- neck + head (lens array), tilted out
    P(gcyl('neck', 0, 0, 0.08, HEAD_Z - 0.06, HEAD_Z + 0.02, M['steel'], verts=20, bevel=0.01))
    head = mn.link(bpy.data.objects.new('head', None)); head.location = G(0.02, 0, HEAD_Z)
    hparts = []; H = lambda o: hparts.append(o) or o
    H(hexagon('lens_back', 0.3, -0.07, 0.0, M['gun'], bevel=0.02))
    H(hexagon('lens_frame', 0.285, 0.0, 0.035, M['frame'], bevel=0.01))
    cells = []
    for i in range(7):
        if i == 0: cx, cy = 0.0, 0.0
        else:
            a = (i - 1) * math.pi / 3 + math.pi / 6
            cx, cy = math.cos(a) * 0.145, math.sin(a) * 0.145
        cells.append((cx, cy))
    for j in range(3):                                                    # three prongs around the rim
        a = j * math.tau / 3 + math.pi / 2
        px, py = math.cos(a) * 0.3, math.sin(a) * 0.3
        H(tube('prong', [(px, py, 0.0), (px * 1.1, py * 1.1, 0.12)], 0.022, M['steel']))
        H(gsphere('prong_tip', px * 1.1, py * 1.1, 0.13, 0.035, M['copper'], segs=10))
    # the cells (material depends on state / frame)
    def cell_mat(name, color, strength, base='#10304a'):
        return emit_mat(name, color, strength, base=base)
    if state == 'idle': cm = [cell_mat('cell_idle', '#4aa0e8', 0.45)] * 7
    elif state == 'cd': cm = [cell_mat('cell_cd', '#3a6aa0', 0.15)] * 7
    elif state == 'broken': cm = [M['deadglass']] * 7
    else: cm = [cell_mat('cell_up', '#a8ecff', 1.4, base='#4ab0e0')] * 7
    for i, (cx, cy) in enumerate(cells):
        if broken and i in (2, 5): continue                               # smashed out: holes
        h = H(hexagon(f'cell{i}', 0.068, 0.02, 0.05, cm[i], bevel=0.006, cx=cx, cy=cy))
        if broken and i == 4: h.rotation_euler = (0.3, 0.2, 0); h.location = (0, 0, 0.03)
    if broken:
        for i in (2, 5):
            cx, cy = cells[i]
            H(hexagon(f'hole{i}', 0.06, 0.0, 0.036, M['dark'], bevel=0.0, cx=cx, cy=cy))
        H(mn.box('tape', (0.5, 0.09, 0.008), loc=(0, 0, 0.05), m=M['tape'], bevel=0.003, rot=(0, 0, 0.7)))
    for o in hparts: o.parent = head
    if broken: head.rotation_euler = (math.radians(-22), TILT * 0.15, math.radians(25))   # knocked askew, drooping
    else: head.rotation_euler = (0, TILT, 0)
    parts += hparts
    # --- status lamp on the side that faces the camera (game +y), a stencil, the power cable, tape
    # game +y in the local frame: the local frame is turned by `face` (clockwise on screen)
    lx, ly = math.sin(face), math.cos(face)                               # rotate (0, 1) by -face
    lamp_m = {'idle': emit_mat('lamp_g', '#4aff8a', 1.2), 'cd': emit_mat('lamp_a', '#ffb03a', 1.2),
              'up': emit_mat('lamp_b', '#8ad8ff', 1.4), 'broken': M['deadlamp']}[state]
    P(gsphere('lamp', lx * 0.31, ly * 0.31, ZB + 0.22, 0.04, lamp_m, segs=12))
    P(gsphere('lamp_hood', lx * 0.3, ly * 0.3, ZB + 0.26, 0.05, M['frame'], scale=(1, 1, 0.35), segs=12))
    P(tube('cable', [(-edge - 0.2, -0.3, -0.25), (-edge + 0.25, -0.34, -0.3), (-0.18, -0.26, -0.32)], 0.03, M['rubber']))
    P(mn.box('tape_drum', (0.3, 0.08, 0.008), loc=G(-0.05, 0.12, ZT + 0.03), m=M['tape'], bevel=0.003, rot=(0, 0, 1.9)))
    if broken:
        P(disc('scorch', 0.0, 0.0, ZT + 0.035, 0.32, M['scorch']))
        P(gbox('scorch_fin', 0.18, -0.2, 0.32, 0.0, ZB + 0.05, ZT - 0.02, M['char'], 0.01))
        P(tube('wire', [(-0.05, 0.08, HEAD_Z - 0.04), (0.2, 0.25, HEAD_Z - 0.2), (0.32, 0.36, ZB + 0.12)], 0.016, M['copper']))
        P(gsphere('spark', 0.32, 0.36, ZB + 0.12, 0.04, M['ember'], segs=10))
    # --- energy: rings between the coils and a halo over the lens
    glow_objs = {}
    if state in ('idle', 'up'):
        n = 4 if state == 'up' else 1
        for f in range(n):
            for k, z in enumerate(erings):
                if state == 'idle': st = 0.25
                else: st = 1.6 if (f + k) % 2 == 0 else 0.5                  # the glow climbs the coil
                er = ring(f'ering{f}_{k}', 0.255, 0.06, 0.028, loc=G(0, 0, z), m=emit_mat(f'erm{f}_{k}', '#9ce8ff', st, base='#2a5a80'), verts=40)
                glow_objs.setdefault(f, []).append(er); parts.append(er)
            if state == 'up':
                hal = disc(f'halo{f}', 0, 0, 0.09, 0.4 + 0.06 * (f % 2), halo_mat(f'halom{f}', '#9ce8ff', 1.0 + 0.4 * (f % 2), 0.4 + 0.25 * (f % 2)))
                hal.parent = head; glow_objs[f].append(hal); parts.append(hal)
    root = mn.group('emitter', [o for o in parts if o.parent is None] + [head])
    root.rotation_euler = (0, 0, -face)
    return parts, root, glow_objs

def render_spot(spot):
    ex, ey, face = EMITTERS[spot]
    for state in ('idle', 'cd', 'up', 'broken'):
        mn.reset(); M = mats()
        parts, root, glow_objs = build(spot, state, M)
        hold = holdout_slab(ex, ey)
        mn.outline([o for o in parts if o.name.startswith(('bracket', 'drum', 'coil', 'lens_back', 'neck', 'fin', 'core'))], thickness=0.012)
        nm = f'hull/emitter_{spot}_{state}'
        org = {'origin': f'SHIELD_EMITTERS.{spot} = ({ex}, {round(ey, 3)}) on the deck plane; layer main, sortY = y'}
        if state == 'up':
            s = bpy.context.scene; frames = [1, 2, 3, 4]
            for i, f in enumerate(frames):
                s.frame_set(f)
                for j, objs in glow_objs.items():
                    for o in objs: o.hide_render = j != i; o.keyframe_insert('hide_render', frame=f)
            mn.render(nm, objs=parts, frames=frames)
            manifest_patch(nm, {**org, 'note': '4-frame loop while the shield is up: frame = floor(t * 10) % 4'})
        else:
            mn.render(nm, objs=parts)
            manifest_patch(nm, org)

if __name__ == '__main__':
    T = time.time()
    for spot in EMITTERS:
        if ONLY is None or spot in ONLY: render_spot(spot)
    print(f'[emitter] total {time.time() - T:.1f}s')
