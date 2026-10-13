"""Things on the outside of the hull: the outer airlock hatches, the radar antenna, the jump coils.

Sprites (build/renders/hull/):
  hatch_<side>_f<0..5>   outer airlock hatch seen from outside (HATCHES), side = port | star, frame i = h.open
                         i/5 (0 closed .. 5 fully open): a door frame standing on the side wall's outer face
                         (jamb posts + lintel, z 0 .. 1.72, flush with the inner frame interior/hatch_*), on
                         the doorstep (HULL's landing bump); open: light spills onto the doorstep. Origin =
                         (h.x, h.y) on the deck plane (the wall's outer face). Footprint: u (outwards) 0 .. 0.29,
                         y +-1.2. Draw in the wall layer (it stands up to wall height).
  hatch_<side>_locked    closed, locked by security (h.locked): red lamp, a locking bar across the opening
  hatch_<side>_broken    broken (SYSTEMS 'hatch' broken): lamp dead, scorched lintel, sparking wire, tape
  antenna_f<0..8>        the radar dish sweeping (js/eva.js: a = -90 deg + sin(t * 0.4) * 0.5): frame i = dish
                         yaw -90 deg + (i - 4) * 0.125 rad. Origin = ANTENNA (34.6, -0.15) on the deck plane;
                         the mast stands at game y 1.1 on the hull (the dish projects onto the origin).
  antenna_crooked        knocked crooked (evs.antenna false): mast bent, dish hanging, sparks
  coil_<spot>_bad / _ok  a jump coil on its bracket, spot = left | right | stern (COIL_SPOTS), status ring
                         red (misaligned) / green (aligned). Origin = the coil spot on the deck plane.
  coil_dial_d<i>         the coil's dial knob + pointer, 32 dirs (dir i points at game angle i * 11.25 deg:
                         c.a while misaligned, -90 deg = dir 24 when aligned). Same origin; draw on top.
  Coils and the antenna's mast/brackets are rendered with the hull slab as a holdout (cut where they go
  into the hull), so draw them after the hull tiles.

    blender -b --factory-startup --python tools/blender/models/hull/fixtures.py [-- quick] [-- only=hatch,antenna,coil]
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
def want(k): return ONLY is None or k in ONLY

def mats():
    return dict(
        frame=worn('frame', '#2b303a', 0.5, 0.4, wear=0.8),
        leaf=worn('leaf', '#6b7486', 0.42, 0.45, wear=1.0),
        leaf2=worn('leaf2', '#545c6c', 0.45, 0.45, wear=0.8),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        dark=worn('dark', '#1c1f25', 0.6, 0.3),
        void=mn.mat('void', '#080b14', 0.9),
        hazard=hazard_mat('hazard', 6.0),
        yellow=worn('yellow', '#e8c34f', 0.5, 0.0, wear=1.0),
        tape=tape_mat(),
        amber=emit_mat('amber', '#ffb03a', 1.2),
        red=emit_mat('red', '#ff3a2a', 1.3),
        green=emit_mat('green', '#4aff8a', 1.2),
        deadlamp=mn.mat('deadlamp', '#3a2a28', 0.4),
        shaft_light=emit_mat('shaft_light', '#7ad8e8', 0.8),
        scorch=scorch_mat('scorch', 0.8),
        char=worn('char', '#3a3532', 0.85, 0.3, wear=0.5, grime=1.4),
        ember=emit_mat('ember', '#ff7a2a', 1.5, base='#401008'),
        copper=mn.mat('copper', 'copper', 0.35, 1.0),
        coilcu=worn('coilcu', '#b87a3e', 0.35, 0.9, wear=0.3, grime=0.6),
        dish=worn('dish', '#a9b2c0', 0.4, 0.3, wear=0.8),
        gun=worn('gunmetal', '#4a515e', 0.4, 0.4, wear=0.6),
        white=mn.mat('needle', '#eef0f4', 0.4),
        rubber=mn.mat('rubber', 'rubber', 0.7),
    )

def holdout_slab(dx, dy):
    """The hull slab (body.py) as a holdout, shifted into a sprite's local frame (game offset dx, dy)."""
    h = prism('hold_slab', HULL, body.Z_SIDE, 0.0, None, bevel=0, under=body.BELLY_IN, z_under=body.Z_BELLY)
    h.data.transform(Matrix.Translation((-dx, dy, 0))); h.is_holdout = True
    return h

# ---------------------------------------------------------------------------------------------------------
# Outer airlock hatch
# ---------------------------------------------------------------------------------------------------------
# The inside view (models/interior/doors.py, interior/hatch_*) is the whole pocket door in the 0.6 thick side
# wall: red collars ly -1.16 .. -0.9 and 0.9 .. 1.16 (relative to h.y), 1.72 high, opening 1.8. The outer
# wall face (h.x) is seen edge-on in the tilted view, so the outside view is a door frame that stands proud
# of it: the two collars continued out by OD as jamb posts, a lintel across the top (tops flush with the
# inner collars, so they read as one frame), a status lamp on the north jamb's camera-facing side, and the
# interior light spilling onto the doorstep (HULL's landing bump, 0.45 deep) when the door opens.
OD, OL, CD, CH = 0.24, 0.9, 0.26, 1.72          # frame depth (outwards), half opening, collar depth, height

def render_hatch(side):
    hdef = HATCHES[side]; d = hdef['dir']
    def ubox(name, u0, y0, u1, y1, z0, z1, m, bevel=0.02):
        a, b = sorted((d * u0, d * u1))
        return gbox(name, a, y0, b, y1, z0, z1, m, bevel)
    collar = None
    for state in ('anim', 'locked', 'broken'):
        mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
        collar = worn('collar_red', '#9a4438', 0.5, 0.3, wear=0.9, grime=1.2)
        # jamb posts (the inner collars continued out through the wall face) and the lintel
        for (y0, y1) in ((-OL - CD, -OL), (OL, OL + CD)):
            P(ubox('post', -0.02, y0, OD, y1, -0.08, CH, collar, 0.025))
            P(ubox('post_hz', 0.03, y0 + 0.04, OD - 0.04, y1 - 0.04, CH - 0.004, CH + 0.008, M['hazard'], 0.003))
            P(gsphere('bolt', d * (OD - 0.06), (y0 + y1) / 2, CH + 0.004, 0.024, M['steel'], scale=(1, 1, 0.5), segs=8))
            P(ubox('post_foot', -0.02, y0 - 0.04, OD + 0.05, y1 + 0.04, -0.08, 0.1, M['frame'], 0.02))
        P(ubox('lintel', -0.02, -OL - 0.01, OD - 0.02, OL + 0.01, CH - 0.24, CH - 0.01, collar, 0.025))
        P(ubox('lintel_lip', OD - 0.07, -OL, OD, OL, CH - 0.3, CH - 0.2, M['frame'], 0.015))
        P(text('eva_txt', 'EVA', d * OD * 0.5, 0.25, CH - 0.004, 0.1, M['yellow'], rot=math.pi / 2 * d))
        for ly in (-0.55, 0.55):
            P(gsphere('lbolt', d * OD * 0.5, ly, CH - 0.01, 0.022, M['steel'], scale=(1, 1, 0.5), segs=8))
        # the door leaf in the opening (edge-on, only its threshold shows) and the sill on the doorstep
        P(ubox('leaf', 0.03, -OL, 0.11, OL, -0.02, CH - 0.24, M['leaf'], 0.012))
        P(ubox('sill', 0.0, -OL, OD, OL, -0.06, 0.05, M['frame'], 0.015))
        P(ubox('sill_hz', 0.12, -OL + 0.04, OD - 0.03, OL - 0.04, 0.05, 0.056, M['hazard'], 0.002))
        # status lamp on the north jamb's south face (faces the camera), keypad under it
        lamp = M['red'] if state == 'locked' else M['deadlamp'] if state == 'broken' else M['amber']
        P(ubox('lamp_box', OD * 0.5 - 0.07, -OL - 0.01, OD * 0.5 + 0.07, -OL + 0.04, 1.08, 1.32, M['dark'], 0.015))
        P(mn.sphere('lamp', 0.05, loc=G(d * OD * 0.5, -OL + 0.05, 1.2), m=lamp, scale=(1, 0.7, 1), segs=14))
        P(ubox('keypad', OD * 0.5 - 0.055, -OL - 0.01, OD * 0.5 + 0.055, -OL + 0.03, 0.72, 0.92, M['dark'], 0.01))
        for i in range(3):
            P(ubox('key', OD * 0.5 - 0.03, -OL + 0.03, OD * 0.5 + 0.03, -OL + 0.04, 0.75 + i * 0.055, 0.78 + i * 0.055, M['steel'], 0.003))
        P(ubox('face_hz', 0.02, OL + CD - 0.01, OD - 0.02, OL + CD + 0.012, 0.12, 0.3, M['hazard'], 0.004))   # south jamb face
        if state == 'locked':
            P(ubox('lockbar', OD - 0.02, -OL - 0.12, OD + 0.06, OL + 0.12, 0.7, 0.86, M['steel'], 0.02))
            P(ubox('lockbar_hz', OD + 0.0, -OL + 0.1, OD + 0.065, OL - 0.1, 0.86, 0.866, M['hazard'], 0.002))
            for ly in (-OL - 0.05, OL + 0.05):
                P(gcyl('lockpin', d * (OD + 0.02), ly, 0.045, 0.86, 0.92, M['red'], verts=12, bevel=0.01))
        if state == 'broken':
            P(disc('scorch', d * OD * 0.5, -0.2, CH + 0.012, 0.5, M['scorch'], sy=1.3))
            P(tube('wire', [(d * OD * 0.5, -OL + 0.04, 1.05), (d * (OD + 0.12), -OL + 0.25, 0.7), (d * (OD + 0.08), -OL + 0.45, 0.35)], 0.015, M['copper']))
            P(gsphere('spark', d * (OD + 0.08), -OL + 0.45, 0.35, 0.035, M['ember'], segs=10))
            P(mn.box('tape', (0.55, 0.12, 0.012), loc=G(d * OD * 0.5, 0.1, CH + 0.01), m=M['tape'], bevel=0.003, rot=(0, 0, 1.2)))
            P(ubox('leaf_bent', 0.08, -0.15, 0.2, 0.25, 0.05, CH - 0.3, M['leaf2'], 0.012))     # a buckled leaf edge
        mn.outline([o for o in parts if o.name.startswith(('post', 'lintel', 'sill', 'lockbar', 'lamp_box'))], thickness=0.012)
        hold = holdout_slab(hdef['x'], hdef['y'])                     # the hull cuts the posts' feet
        frame_objs = [o for o in parts]
        s = bpy.context.scene
        base = f'hull/hatch_{side}'
        org = {'origin': f'hatch (h.x, h.y) = ({hdef["x"]}, {hdef["y"]}) on the deck plane (the wall\'s outer face); '
                         f'a door frame on the wall face, up to z {CH}: draw in the wall layer'}
        if state == 'anim':
            # the door leaf slides open (edge-on: only its top shows under the lintel); interior light spills
            # out onto the doorstep, as wide as the opening
            frames = list(range(1, 7)); spills = []
            for i in range(1, 6):
                k = i / 5
                sp = ubox(f'spill{i}', OD + 0.005, -OL * k, 0.44, OL * k, 0.0, 0.004,
                          halo_mat(f'spillm{i}', '#ffd8a0', 1.2, 0.35 + 0.25 * k), 0.0)
                spills.append((i, sp)); parts.append(sp)
            leaf = next(o for o in parts if o.name.startswith('leaf'))
            for i, f in enumerate(frames):
                s.frame_set(f)
                for j, sp in spills: sp.hide_render = j != i; sp.keyframe_insert('hide_render', frame=f)
                leaf.hide_render = i == 5; leaf.keyframe_insert('hide_render', frame=f)
            mn.render(base, objs=parts, frames=frames)
            manifest_patch(base, {**org, 'note': 'frame i = h.open i/5 (f0 closed, f5 open)'})
        else:
            mn.render(f'{base}_{state}', objs=frame_objs)
            manifest_patch(f'{base}_{state}', org)

# ---------------------------------------------------------------------------------------------------------
# Radar antenna
# ---------------------------------------------------------------------------------------------------------
AX, AY = ANTENNA
BASE_Y = 1.25                                  # the mast stands this far south of the origin (game y 1.1)
MAST_H = 1.42

def build_antenna(M, crooked):
    parts = []; P = lambda o: parts.append(o) or o
    def A(x, y, z=0.0): return G(x, y, z)       # antenna-local game coords (origin = ANTENNA)
    P(gbox('base', -0.32, BASE_Y - 0.24, 0.32, BASE_Y + 0.24, -0.02, 0.07, M['frame'], 0.025))
    P(gbox('base_haz', -0.28, BASE_Y + 0.12, 0.28, BASE_Y + 0.2, 0.07, 0.077, M['hazard'], 0.002))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P(gsphere('bolt', sx * 0.25, BASE_Y + sy * 0.17, 0.07, 0.025, M['steel'], scale=(1, 1, 0.5), segs=8))
    P(gbox('box', 0.1, BASE_Y - 0.18, 0.28, BASE_Y + 0.02, 0.07, 0.25, M['gun'], 0.02))
    P(gsphere('box_lamp', 0.19, BASE_Y + 0.025, 0.2, 0.025, M['green'] if not crooked else M['red'], segs=8))
    upper = []
    mast_lo = P(gcyl('mast', 0, BASE_Y, 0.055, 0.07, MAST_H * 0.55, M['steel'], verts=16, bevel=0.01))
    upper.append(gcyl('mast_hi', 0, BASE_Y, 0.045, MAST_H * 0.55 - 0.02, MAST_H, M['steel'], verts=16, bevel=0.01))
    upper.append(gcyl('collar', 0, BASE_Y, 0.075, MAST_H * 0.55 - 0.04, MAST_H * 0.55 + 0.04, M['gun'], verts=16, bevel=0.01))
    for a in (0.3, 2.4, 4.5):                                          # bracing struts
        P(tube('strut', [(math.cos(a) * 0.26, BASE_Y + math.sin(a) * 0.2, 0.07), (0, BASE_Y, MAST_H * 0.45)], 0.018, M['steel']))
    P(tube('cable', [(0.19, BASE_Y - 0.05, 0.2), (0.06, BASE_Y - 0.02, 0.4), (0.05, BASE_Y, MAST_H * 0.5)], 0.016, M['rubber']))
    # head: yoke + dish, pivoting around the mast top (group 'dishgrp')
    grp = mn.link(bpy.data.objects.new('dishgrp', None)); grp.location = A(0, BASE_Y, MAST_H)
    head = []
    head.append(mn.cyl('yoke', 0.07, 0.08, loc=(0, 0, 0), m=M['gun'], verts=16, bevel=0.015))
    # dish: a shallow paraboloid facing +x (local), tilted up 15 deg
    me = bpy.data.meshes.new('dish'); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=12, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > 0.05], context='VERTS')  # keep the back half: a bowl
    for v in bm.verts: v.co = Vector((v.co.x * 0.12, v.co.y * 0.3, v.co.z * 0.3))
    bm.to_mesh(me); bm.free()
    dish = mn.link(bpy.data.objects.new('dish', me)); mn.assign(dish, M['dish']); mn.smooth(dish)
    sm = dish.modifiers.new('thick', 'SOLIDIFY'); sm.thickness = 0.02
    dish.location = (0.19, 0, 0.12); dish.rotation_euler = (0, math.radians(-15), 0)
    head.append(dish)
    arm = mn.box('arm', (0.24, 0.04, 0.04), loc=(0.12, 0, 0.1), m=M['steel'], bevel=0.01); head.append(arm)
    feed = mn.cyl('feed', 0.012, 0.3, loc=(0.17, 0, 0.12), m=M['steel'], verts=8, bevel=0.0, rot=(0, math.radians(75), 0)); head.append(feed)
    head.append(mn.sphere('feed_tip', 0.03, loc=(0.48, 0, 0.19), m=M['dark'], segs=10))
    head.append(mn.sphere('beacon', 0.035, loc=(0, 0, 0.12), m=M['red'], segs=12))
    for o in head: o.parent = grp
    parts += upper + head
    if crooked:
        # bend the upper mast and the head over towards the east, the dish drooping
        bend = mn.link(bpy.data.objects.new('bend', None)); bend.location = A(0, BASE_Y, MAST_H * 0.55)
        for o in upper: o.parent = bend; o.location = o.location - bend.location
        grp.parent = bend; grp.location = grp.location - bend.location
        bend.rotation_euler = (math.radians(-12), math.radians(38), 0)
        grp.rotation_euler = (0, math.radians(55), math.radians(-30))
        parts.append(P(tube('loose', [(0.05, BASE_Y, MAST_H * 0.5), (0.3, BASE_Y + 0.15, 0.55), (0.42, BASE_Y + 0.05, 0.25)], 0.016, M['rubber'])))
        parts.append(gsphere('spark', 0.42, BASE_Y + 0.05, 0.25, 0.04, M['ember'], segs=10))
        parts.append(disc('scorch', 0.0, BASE_Y, 0.08, 0.35, M['scorch']))
    return parts, grp

def render_antenna():
    for crooked in (False, True):
        mn.reset(); M = mats()
        parts, grp = build_antenna(M, crooked)
        hold = holdout_slab(AX, AY)
        mn.outline([o for o in parts if o.name.startswith(('base', 'box', 'mast', 'collar', 'yoke', 'dish', 'strut'))], thickness=0.012)
        s = bpy.context.scene
        if crooked:
            mn.render('hull/antenna_crooked', objs=parts)
            manifest_patch('hull/antenna_crooked', {'origin': 'ANTENNA (34.6, -0.15) on the deck plane'})
        else:
            frames = list(range(1, 10))
            for i, f in enumerate(frames):
                s.frame_set(f)
                yaw = -math.pi / 2 + (i - 4) * 0.125                      # game angle (clockwise on screen)
                grp.rotation_euler = (0, 0, -yaw); grp.keyframe_insert('rotation_euler', frame=f)
            mn.render('hull/antenna', objs=parts, frames=frames)
            manifest_patch('hull/antenna', {'origin': 'ANTENNA (34.6, -0.15) on the deck plane',
                                            'note': 'frame i: dish yaw = -90 deg + (i - 4) * 0.125 rad; game: pick i = round(4 + sin(t*0.4)*0.5/0.125)'})

# ---------------------------------------------------------------------------------------------------------
# Jump coils
# ---------------------------------------------------------------------------------------------------------
ZC = 0.02                                       # top of the coil housing (the dial sits on it)

def render_coils():
    for spot, (cx, cy) in COIL_SPOTS.items():
        to = {'left': (1, 0), 'right': (-1, 0), 'stern': (0, -1)}[spot]   # towards the hull
        for ok in (False, True):
            mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
            # bracket arm into the hull (cut by the holdout where it enters)
            L = 1.0
            P(tube('arm', [(to[0] * 0.2, to[1] * 0.2, -0.22), (to[0] * L, to[1] * L, -0.22)], 0.07, M['frame']))
            P(tube('arm2', [(to[0] * 0.15, to[1] * 0.15, -0.38), (to[0] * L, to[1] * L, -0.5)], 0.045, M['steel']))
            if spot == 'stern':
                P(gbox('arm_plate', -0.28, -0.66, 0.28, -0.6, -0.65, -0.05, M['frame'], 0.02))
            # housing, copper windings, status ring, hazard ticks
            P(gcyl('housing', 0, 0, 0.27, -0.42, ZC - 0.03, M['gun'], verts=40, bevel=0.03))
            for k in range(4):
                P(ring(f'wind{k}', 0.33, 0.07, 0.06, loc=G(0, 0, -0.38 + k * 0.08), m=M['coilcu'], verts=40))
            P(ring('status', 0.22, 0.05, 0.02, loc=G(0, 0, ZC - 0.012), m=M['green'] if ok else M['red'], verts=40))
            P(ring('status_rim', 0.25, 0.03, 0.03, loc=G(0, 0, ZC - 0.02), m=M['dark'], verts=40))
            for i in range(12):                                         # dial ticks
                a = i / 12 * math.tau
                P(gbox('tick', math.cos(a) * 0.13 - 0.008, math.sin(a) * 0.13 - 0.008, math.cos(a) * 0.13 + 0.008, math.sin(a) * 0.13 + 0.008, ZC - 0.03, ZC - 0.012, M['white'], 0.0))
            P(gbox('mark', -0.012, -0.17, 0.012, -0.12, ZC - 0.03, ZC - 0.008, M['yellow'], 0.0))   # "align here" (up)
            P(gcyl('face', 0, 0, 0.17, ZC - 0.04, ZC - 0.03, M['dark'], verts=32, bevel=0.0))
            if spot == 'left':
                P(mn.box('tape', (0.36, 0.1, 0.01), loc=G(0.18, 0.18, ZC - 0.02), m=M['tape'], bevel=0.003, rot=(0, 0, 0.7)))
            hold = holdout_slab(cx, cy)
            mn.outline([o for o in parts if o.name.startswith(('arm', 'housing', 'wind'))], thickness=0.012)
            nm = f'hull/coil_{spot}_{"ok" if ok else "bad"}'
            mn.render(nm, objs=parts)
            manifest_patch(nm, {'origin': f'COIL_SPOTS.{spot} = ({cx}, {cy}) on the deck plane; draw hull/coil_dial on top'})
    # the dial: knob + pointer, 32 dirs
    mn.reset(); M = mats(); parts = []
    parts.append(mn.cyl('knob', 0.09, 0.07, loc=(0, 0, ZC - 0.03), m=M['gun'], verts=24, bevel=0.02))
    parts.append(mn.box('needle', (0.15, 0.035, 0.025), loc=(0.085, 0, ZC + 0.03), m=M['white'], bevel=0.008))
    parts.append(mn.cyl('knob_cap', 0.04, 0.03, loc=(0, 0, ZC + 0.03), m=M['steel'], verts=16, bevel=0.01))
    mn.outline(parts[:2], thickness=0.01)
    root = mn.group('dial', parts)
    mn.render('hull/coil_dial', objs=parts, root=root, dirs=4 if QUICK else 32)
    manifest_patch('hull/coil_dial', {'origin': 'coil spot on the deck plane; dir i = pointer at game angle i*360/dirs (c.a; aligned = -90 deg)'})

if __name__ == '__main__':
    T = time.time()
    if want('hatch'):
        for side in ('port', 'star'): render_hatch(side)
    if want('antenna'): render_antenna()
    if want('coil'): render_coils()
    print(f'[fixtures] total {time.time() - T:.1f}s')
