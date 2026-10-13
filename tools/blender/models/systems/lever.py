"""The power lever (js/systems.js drawLever, LEVER, leverAngle) and the patch board next to it
(js/minigames.js PATCH_BOARD, drawMinigameProps).

Lever: a round floor dial (r 0.5, the game's dial) with a track and three output lamps at r 0.38 on
leverAngle(0..2) (LEFT -180 = west, MID -90 = north, RIGHT 0 = east: each exactly where that output's cable leaves
the dial; the track runs over the top, the trunk from the reactor comes in from the NNW, -125), a hub (r LEVER_HUB) and
a handle. Origin = LEVER (x, y) for every lever sprite, so they stack: base, bus, handle, wrench.
  lever_base_p0..p2      the dial, lamp of the active output (power.lever.pos) lit green
  lever_base_broken      lamps dead, soot, a cracked cover
  lever_bus_f0..f2       the lit conductor on the dial: an amber bus bar from the trunk's inlet (top rim) to
                         the hub and on to the rim at leverAngle(c), c = the branch the energy takes (the
                         patch board's choice for the lever's output). Drawn while the trunk is live.
  lever_handle_f0..f18   the handle at game angle a_k = leverAngle(0) + k * HANDLE_STEP (10 degrees; k = 0..18
                         covers LEFT -180 .. RIGHT 0 over the top: f0 = LEFT, f9 = MID, f18 = RIGHT).
                         Pick k = round((power.lever.angle - leverAngle(0)) / HANDLE_STEP): the game lerps the angle.
  lever_wrench_f0..f2    power.lever.jammed with pos = 0..2: a spanner (yellow grip) standing upright in the
                         track, ring end rammed into the groove at r 0.38, jaw up (~0.55 tall), at
                         leverAngle(pos) + WRENCH_OFF towards the next output (pos 2: back towards MID, the way
                         RIGHT -> LEFT swings), face to the hub / camera, leaning WRENCH_LEAN over the handle;
                         plus the yellow hub cap. Drawn after the handle (sortY LEVER.y + 0.32); the per-pixel
                         depth sorts out which of knob / wrench is in front.
Labels (LEFT/MID/RIGHT, AUTO / MANUAL) stay procedural text.

Patch board: a floor junction box 0.67 x 0.5 at PATCH_BOARD with three sockets and patch cords.
  patch_idle             lamps dark (patchNeeded() false)
  patch_live             red / yellow / blue lamps lit
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from syslib import *

LEVER_DEG = (-180, -90, 0)                         # js/systems.js LEVER_ANGLES
TRUNK_DEG = -125
HANDLE_STEP = math.radians(10)
def lever_angle(i): return math.radians(LEVER_DEG[i])
def gdir(a, r):                                    # game angle, radius -> Blender (x, y)
    return (math.cos(a) * r, -math.sin(a) * r)
TOP = 0.26                                         # dial top height
HUB = 0.22
WRENCH_OFF, WRENCH_LEAN, WRENCH_SINK = 0.42, math.radians(10), 0.08   # angle past the handle, lean, depth in the groove

def lever():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('lpaint', '#6a7383', 0.5, 0.35)
    M['green'] = glow('green', '#5fd6a0', 1.3)
    M['yellow'] = pmat('yellow', '#e8c34f', 0.35, 0.2)
    base = []
    def B(o): base.append(P(o)); return o
    B(mn.cyl('foot', 0.5, 0.06, m=M['frame'], bevel=0.02, verts=64))
    B(mn.cyl('dial', 0.47, TOP - 0.06, loc=(0, 0, 0.06), m=M['paint'], bevel=0.04, verts=64))
    B(ring('hz', 0.5, 0.05, 0.05, loc=(0, 0, 0.02), m=M['hazard'], verts=64))
    # track: dark groove along the arc of the outputs
    SG = math.copysign(1, lever_angle(2) - lever_angle(0))   # the way the handle turns from LEFT to RIGHT
    a0, a1 = lever_angle(0) - SG * 0.25, lever_angle(2) + SG * 0.25
    arc = [(*gdir(a0 + (a1 - a0) * k / 20, 0.38), TOP + 0.005) for k in range(21)]
    B(pipe('track', arc, 0.045, M['hole'], corner=0.0))
    for sg in (-1, 1): B(pipe('rail', [(*gdir(a0 + (a1 - a0) * k / 20, 0.38 + sg * 0.055), TOP + 0.01) for k in range(21)], 0.016, M['steel'], corner=0.0))
    lamps = []
    for i in range(3):
        x, y = gdir(lever_angle(i), 0.38)
        B(ring('lamp_rim', 0.065, 0.025, 0.035, loc=(x, y, TOP), m=M['steel'], verts=20))
        lamps.append(B(mn.sphere('lamp', 0.055, loc=(x, y, TOP + 0.02), m=M['lamp_off'], scale=(1, 1, 0.6))))
    B(mn.cyl('hub_base', HUB, 0.05, loc=(0, 0, TOP), m=M['frame'], bevel=0.015, verts=40))
    for i in range(6):
        a = i * math.tau / 6 + 0.3
        B(mn.cyl('bolt', 0.022, 0.02, loc=(math.cos(a) * 0.3, math.sin(a) * 0.3 - 0.0, TOP), m=M['steel'], verts=6, bevel=0.005))
    B(mn.box('tape', (0.32, 0.07, 0.006), loc=(0.05, -0.32, TOP), m=M['tape'], bevel=0.002, rot=(0, 0, 0.3)))
    B(mn.box('plate', (0.3, 0.01, 0.07), loc=(0, -0.47, 0.14), m=M['sticker'], bevel=0.002))
    B(label('plate_t', 'POWER', 0.045, (0, -0.48, 0.175), rot=R90, m=M['ink']))
    soot = B(soot_disc('soot', 0.42, (0.1, -0.05, TOP + 0.003), M['soot']))
    crack = B(mn.box('crack', (0.34, 0.2, 0.004), loc=(-0.18, -0.2, TOP + 0.004), m=M['crazed'], bevel=0, rot=(0, 0, 0.4)))

    # handle: hub cap + an arm along +x (game angle 0) with a red knob; rotated per frame
    hp = [mn.cyl('hub', HUB * 0.6, 0.08, loc=(0, 0, TOP + 0.05), m=M['steel'], bevel=0.02, verts=32),
          mn.box('arm', (0.36, 0.07, 0.05), loc=(0.2, 0, TOP + 0.08), m=M['steel'], bevel=0.02),
          mn.box('arm_rise', (0.07, 0.06, 0.14), loc=(0.37, 0, TOP + 0.08), m=M['steel'], bevel=0.02),
          mn.sphere('knob', 0.075, loc=(0.38, 0, TOP + 0.24), m=pmat('knob', '#e2574c', 0.3), segs=24),
          mn.box('grip_tape', (0.08, 0.075, 0.035), loc=(0.15, 0, TOP + 0.075), m=M['tape'], bevel=0.01)]
    for o in hp: P(o)
    hroot = mn.group('handle', hp)
    # wrench: an open-end / ring spanner standing upright in the track, ring end rammed into the groove,
    # jaw up. Built flat along +x (jaw at +x), stood up by w_up (x -> +z), then turned per frame so its
    # broad face looks at the hub (and the camera) and leaned a little towards the handle it blocks.
    WL, WT = 0.62, 0.045
    M['wsteel'] = pmat('wsteel', '#c4ccd8', 0.35, 0.45, grime=0.3)   # less mirror-like than 'steel': it stands upright
    wp = [mn.box('w_shaft', (WL * 0.62, WL * 0.14, WT * 0.85), loc=(0, 0, WT * 0.075), m=M['wsteel'], bevel=WT * 0.3),
          mn.box('w_grip', (WL * 0.3, WL * 0.14 + 0.012, WT + 0.012), loc=(-WL * 0.14, 0, -0.006), m=M['yellow'], bevel=0.012),
          mn.box('w_tape', (WL * 0.07, WL * 0.14 + 0.016, WT + 0.016), loc=(WL * 0.09, 0, -0.008), m=M['tape'], bevel=0.004),
          ring('w_ring', WL * 0.105, WL * 0.05, WT, loc=(-WL * 0.36, 0, 0), m=M['wsteel'], verts=32)]
    hd = mn.cyl('w_head', WL * 0.14, WT, loc=(WL * 0.36, 0, 0), m=M['wsteel'], verts=32, bevel=WT * 0.3)
    notch = mn.box('w_notch', (WL * 0.2, WL * 0.11, WT * 4), loc=(WL * 0.46, 0, -WT), bevel=0, rot=(0, 0, 0.35))
    md = hd.modifiers.new('cut', 'BOOLEAN'); md.object = notch; md.operation = 'DIFFERENCE'; md.solver = 'EXACT'
    hd.modifiers.move(len(hd.modifiers) - 1, 0); notch.hide_render = True
    wp.append(hd)
    for o in wp: o.location.z -= WT / 2                 # centre the thickness on the plane
    for o in wp: P(o)
    wup = mn.group('w_up', wp + [notch]); wup.rotation_euler = (0, -math.pi / 2, 0)   # (the hidden cutter turns with the head)
    wroot = mn.group('wrench', [wup])
    cap = P(mn.cyl('hub_cap', HUB * 0.62, 0.03, loc=(0, 0, TOP + 0.13), m=M['yellow'], bevel=0.01, verts=32))
    # the bus: an amber conductor bar on low standoffs over the dial (above the track), trunk inlet -> hub,
    # and one hub -> output c per frame (only that one shown)
    M['bus'] = glow('bus', '#ffb640', 1.6)
    BZ = TOP + 0.06
    def bar(name, a, r0, r1):
        return [P(pipe(name, [(*gdir(a, r0), BZ), (*gdir(a, r1), BZ)], 0.026, M['bus'], corner=0.0)),
                P(mn.cyl(name + '_end', 0.034, 0.03, loc=(*gdir(a, r1), BZ - 0.015), m=M['steel'], verts=12, bevel=0.006))]
    bus_in = bar('bus_in', math.radians(TRUNK_DEG), 0.06, 0.47)
    bus_out = [bar(f'bus_out{c}', lever_angle(c), 0.06, 0.47) for c in range(3)]
    outline(P, 0.012)

    hset = hp + [hroot]; wset = wp + [wroot, cap]
    bus_all = bus_in + [o for b in bus_out for o in b]
    def only(objs):
        for o in P: o.hide_render = o not in objs
    # base states
    only(base); show([soot, crack], False)
    for p in range(3):
        for i, l in enumerate(lamps): setmat([l], M['green'] if i == p else M['lamp_off'])
        mn.render(f'systems/lever_base_p{p}', objs=base)
    for l in lamps: setmat([l], M['lamp_off'])
    show([soot, crack], True); mn.render('systems/lever_base_broken', objs=base)
    # bus frames: the inlet bar plus output c, keyed visibility, canvas shared
    only(bus_all)
    for c in range(3):
        f = c + 1; s.frame_set(f)
        for k, b in enumerate(bus_out):
            for o in b: key_hide(o, f, k != c)
    mn.render('systems/lever_bus', objs=bus_all, frames=[1, 2, 3])
    for b in bus_out:
        for o in b: o.animation_data_clear(); o.hide_render = True
    # handle frames: rotation keyed per frame, canvas shared over all of them
    only(hp)
    nf = round(abs(lever_angle(2) - lever_angle(0)) / HANDLE_STEP) + 1
    frames = list(range(1, nf + 1))
    for k, f in enumerate(frames):
        s.frame_set(f); hroot.rotation_euler.z = -(lever_angle(0) + SG * k * HANDLE_STEP); hroot.keyframe_insert('rotation_euler', index=2, frame=f)
    mn.render('systems/lever_handle', objs=hp, frames=frames)
    # wrench frames (jammed at pos 0..2)
    only(wp + [cap])
    for p in range(3):
        f = p + 1; s.frame_set(f)
        side = math.copysign(1, lever_angle((p + 1) % 3) - lever_angle(p))   # the way the handle moves next
        a = lever_angle(p) + side * WRENCH_OFF
        x, y = gdir(a, 0.38)
        wroot.location = (x, y, TOP + WL * 0.465 - WRENCH_SINK)   # ring end in the groove
        wroot.rotation_euler = (-side * WRENCH_LEAN, 0, -a)         # top leans over towards the handle
        wroot.keyframe_insert('location', frame=f); wroot.keyframe_insert('rotation_euler', frame=f)
    mn.render('systems/lever_wrench', objs=wp + [cap], frames=[1, 2, 3])

def patch():
    s = mn.reset(); M = stdmats(); P = Parts()
    M['paint'] = worn('ppaint', '#5a6272', 0.5, 0.35)
    W, D, H = 0.67, 0.5, 0.42
    P(mn.box('foot', (W, D, 0.05), m=M['frame'], bevel=0.02))
    P(wedge('box', W - 0.06, D - 0.08, H - 0.1, H, loc=(0, 0.02, 0.04), m=M['paint'], bevel=0.03))
    FY = -D / 2 + 0.06
    P(mn.box('face', (W - 0.14, 0.012, 0.24), loc=(0, FY - 0.005, 0.07), m=M['dark'], bevel=0.005))
    cols = ('#e2574c', '#e8c34f', '#3a8fc4')
    lamps = []
    for i, c in enumerate(cols):
        x = -0.19 + i * 0.19
        lamps.append((P(mn.sphere('lamp', 0.035, loc=(x, -0.06, H + 0.0), m=M['lamp_off'], scale=(1, 1, 0.7))), c))
        P(ring('lamp_rim', 0.05, 0.02, 0.03, loc=(x, -0.06, H - 0.03), m=M['steel'], verts=16))
        P(mn.cyl('sock', 0.04, 0.03, loc=(x, FY - 0.01, 0.24), m=M['steel'], rot=R90, verts=16, bevel=0.008))
        P(mn.cyl('sock_h', 0.022, 0.02, loc=(x, FY - 0.035, 0.24), m=M['hole'], rot=R90, verts=12, bevel=0))
        P(mn.cyl('sock2', 0.04, 0.03, loc=(x, FY - 0.01, 0.12), m=M['steel'], rot=R90, verts=16, bevel=0.008))
    # patch cords: crossed between top and bottom sockets (an old reroute), in the lamp colours
    for i, j in ((0, 0), (1, 2), (2, 1)):
        xa, xb = -0.19 + i * 0.19, -0.19 + j * 0.19
        P(pipe('cord', [(xa, FY - 0.04, 0.24), (xa, FY - 0.12, 0.22), ((xa + xb) / 2, FY - 0.16, 0.1), (xb, FY - 0.12, 0.13), (xb, FY - 0.04, 0.12)],
               0.016, pmat('cord' + cols[i], cols[i], 0.55), corner=0.05))
    P(mn.box('lbl', (0.3, 0.1, 0.006), loc=(0, 0.14, H - 0.005), m=M['sticker'], bevel=0.002, rot=(math.atan2(0.1, D - 0.08), 0, 0)))
    P(label('lbl_t', 'PATCH', 0.06, (0, 0.14, H + 0.004), rot=(math.atan2(0.1, D - 0.08), 0, 0), m=M['ink']))
    P(mn.box('tape', (0.06, 0.3, 0.006), loc=(0.28, 0.0, H - 0.04), m=M['tape'], bevel=0.002, rot=(0.2, 0, 0.1)))
    outline(P, 0.012)
    objs = list(P)
    mn.render('systems/patch_idle', objs=objs)
    for l, c in lamps: setmat([l], glow('on' + c, c, 1.3))
    mn.render('systems/patch_live', objs=objs)

only_ = [a for a in ARGS if a != 'quick']
if not only_ or 'lever' in only_: lever()
if not only_ or 'patch' in only_: patch()
