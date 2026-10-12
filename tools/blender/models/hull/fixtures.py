"""Things on the outside of the hull: the outer airlock hatches, the radar antenna, the jump coils.

Sprites (build/renders/hull/):
  hatch_<side>_f<0..5>   outer airlock hatch (js/art.js drawHatch; HATCHES), side = port | star, frame i = h.open
                         i/5 (0 closed .. 5 fully open): two leaves sliding apart under a hazard-striped
                         coaming, the airlock shaft below. Origin = (h.x, h.y) on the deck plane (the hull's
                         side edge at the hatch). Footprint = the 2D rect: u (outwards) -0.5 .. 0.4, y +-0.9.
  hatch_<side>_locked    closed, locked by security (h.locked): red lamps, a locking bar across the leaves
  hatch_<side>_broken    broken (SYSTEMS 'hatch' broken): leaves jammed a crack open, one buckled, scorched,
                         lamps dead, a sparking wire
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
def render_hatch(side):
    hdef = HATCHES[side]; d = hdef['dir']
    def U(u, ly, z=0.0): return G(d * u, ly, z)                      # u = outwards
    def ubox(name, u0, y0, u1, y1, z0, z1, m, bevel=0.02):
        a, b = sorted((d * u0, d * u1))
        return gbox(name, a, y0, b, y1, z0, z1, m, bevel)
    for state in ('anim', 'locked', 'broken'):
        mn.reset(); M = mats(); parts = []; P = lambda o: parts.append(o) or o
        U0, U1, Y = -0.5, 0.4, 0.9                                    # footprint (the 2D rect)
        OU0, OU1, OY = -0.31, 0.21, 0.65                              # opening
        ZT = 0.1
        # coaming: four strips around the opening, hazard tops, a skirt down into the hull
        P(ubox('coam_n', U0, -Y, U1, -OY, -0.35, ZT, M['frame'], 0.03))
        P(ubox('coam_s', U0, OY, U1, Y, -0.35, ZT, M['frame'], 0.03))
        P(ubox('coam_w', U0, -OY, OU0, OY, -0.35, ZT, M['frame'], 0.03))
        P(ubox('coam_e', OU1, -OY, U1, OY, -0.35, ZT, M['frame'], 0.03))
        for (a0, b0, a1, b1) in ((U0 + 0.05, -Y + 0.05, U1 - 0.05, -OY - 0.05), (U0 + 0.05, OY + 0.05, U1 - 0.05, Y - 0.05)):
            P(ubox('haz', a0, b0, a1, b1, ZT - 0.005, ZT + 0.006, M['hazard'], 0.003))
        for (a0, a1) in ((U0 + 0.04, OU0 - 0.04), (OU1 + 0.04, U1 - 0.04)):
            P(ubox('haz', a0, -OY + 0.02, a1, OY - 0.02, ZT - 0.005, ZT + 0.006, M['hazard'], 0.003))
        for su in (U0 + 0.08, U1 - 0.08):                               # corner bolts
            for sy in (-Y + 0.08, Y - 0.08):
                P(gsphere('bolt', d * su, sy, ZT + 0.005, 0.025, M['steel'], scale=(1, 1, 0.5), segs=8))
        # the shaft below (seen when open): dark walls, a lit strip, ladder rungs
        P(ubox('shaft_floor', OU0, -OY, OU1, OY, -0.6, -0.55, M['void'], 0.0))
        P(ubox('shaft_light', OU0 + 0.03, -0.5, OU0 + 0.07, 0.5, -0.56, -0.54, M['shaft_light'], 0.0))
        for k in range(4):
            P(ubox('rung', OU0 + 0.12, -0.45 + k * 0.3, OU1 - 0.06, -0.42 + k * 0.3, -0.42, -0.39, M['steel'], 0.005))
        # leaves
        leaves = []
        for sgn in (-1, 1):                                            # -1: north leaf, +1: south leaf
            y0, y1 = (-OY - 0.03, 0.0) if sgn < 0 else (0.0, OY + 0.03)
            lv = [ubox('leaf', OU0 - 0.03, y0, OU1 + 0.03, y1, -0.09, -0.03, M['leaf'], 0.012)]
            for k in range(3):                                         # ribs
                yy = (y0 + y1) / 2 + (k - 1) * 0.17
                lv.append(ubox('rib', OU0 + 0.03, yy - 0.025, OU1 - 0.03, yy + 0.025, -0.035, -0.008, M['leaf2'], 0.01))
            ye = y1 - 0.06 if sgn < 0 else y0                          # chevron edge on the meeting side
            lv.append(ubox('edge', OU0, ye, OU1, ye + 0.06, -0.035, -0.025, M['hazard'], 0.0))
            grp = mn.link(bpy.data.objects.new(f'leafgrp{sgn}', None))
            edge = sgn * (OY + 0.03); grp.location = (0, -edge, 0)          # pivot at the leaf's outer edge (Blender y = -game y)
            for o in lv:
                o.parent = grp; o.data.transform(Matrix.Translation((0, edge, 0)))
            leaves.append((grp, sgn, lv)); parts += lv
        # lamps on the coaming (inner end)
        lamps = []
        for sy in (-Y + 0.13, Y - 0.13):
            P(gcyl('lamp_base', d * (U0 + 0.16), sy, 0.07, ZT, ZT + 0.03, M['dark'], verts=16, bevel=0.01))
            lamps.append(P(gsphere('lamp', d * (U0 + 0.16), sy, ZT + 0.04, 0.05,
                                   M['red'] if state == 'locked' else M['deadlamp'] if state == 'broken' else M['amber'], segs=14)))
        P(text('eva_txt', 'EVA', d * 0.05, -Y + 0.17, ZT + 0.008, 0.11, M['dark']))
        if state == 'locked':
            P(ubox('lockbar', OU0 - 0.12, -0.07, OU1 + 0.12, 0.07, 0.08, 0.16, M['steel'], 0.02))
            for su in (OU0 - 0.06, OU1 + 0.06):
                P(gcyl('lockpin', d * su, 0, 0.06, 0.15, 0.2, M['red'], verts=12, bevel=0.01))
            P(gcyl('lockhub', d * (OU0 + OU1) / 2, 0, 0.09, 0.15, 0.22, M['dark'], verts=16, bevel=0.015))
        if state == 'broken':
            P(disc('scorch', d * (-0.05), 0.15, ZT + 0.02, 0.55, M['scorch'], sy=1.1))
            P(tube('wire', [(d * (U0 + 0.1), 0.5, ZT), (d * (U0 + 0.05), 0.75, ZT + 0.1), (d * (U0 - 0.1), 0.95, ZT + 0.03)], 0.015, M['copper']))
            P(gsphere('spark', d * (U0 - 0.1), 0.95, ZT + 0.04, 0.035, M['ember'], segs=10))
            P(mn.box('tape', (0.5, 0.12, 0.012), loc=G(d * (-0.05), -0.35, 0.09), m=M['tape'], bevel=0.003, rot=(0, 0, 0.6)))
        mn.outline([o for o in parts if o.name.startswith(('coam', 'leaf', 'lockbar', 'lamp_base'))], thickness=0.012)
        # the hull around the hatch hides the leaves when they slide under the deck (and the coaming's skirt)
        hold = holdout_slab(hdef['x'], hdef['y'])
        cut = ubox('cut', OU0, -OY, OU1, OY, -2, 1, None, 0.0)
        md = hold.modifiers.new('hole', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cut; md.solver = 'EXACT'
        bpy.context.view_layer.objects.active = hold; bpy.ops.object.modifier_apply(modifier='hole'); bpy.data.objects.remove(cut)
        frame_objs = [o for o in parts if o.name.startswith(('coam', 'lamp', 'lock', 'wire', 'spark', 'scorch'))]
        s = bpy.context.scene
        def pose(k, buckle=False):
            for grp, sgn, lv in leaves:                                # leaves retract into the coaming (2D: they shrink)
                grp.scale = (1, max(0.001, 1 - k), 1)
                grp.rotation_euler = (0.0, 0.0, 0.0)
            if buckle:                                                 # south leaf buckled up at its edge
                grp, sgn, lv = leaves[1]; grp.rotation_euler = (math.radians(-8), math.radians(5), 0)
        base = f'hull/hatch_{side}'
        org = {'origin': f'hatch (h.x, h.y) = ({hdef["x"]}, {hdef["y"]}) on the deck plane'}
        if state == 'anim':
            frames = list(range(1, 7))
            for i, f in enumerate(frames):
                s.frame_set(f); pose(i / 5)
                for grp, _, lv in leaves:
                    grp.keyframe_insert('scale', frame=f)
                    for o in lv: o.hide_render = i == 5; o.keyframe_insert('hide_render', frame=f)
            mn.render(base, objs=frame_objs, frames=frames)
            manifest_patch(base, {**org, 'note': 'frame i = h.open i/5 (f0 closed, f5 open)'})
        else:
            pose(0.12 if state == 'broken' else 0.0, buckle=state == 'broken')
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
