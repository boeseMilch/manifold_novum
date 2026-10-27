"""The inner doors' round lock (2026-10-26, the user: "Door bars look weird, that's not how 3d works. Put in some circle
lock in the middle that turns"). Replaces the 2D bolt bar + hand wheel overlay (js/art.js drawDoorLocks, now only the
classic view's and the fallback while these load).

A round lock sits in the middle of every inner door, on the seam where the two leaves meet: a dark bezel ring (split
on the seam, each half fixed to its leaf) and in it a turning rotor (light steel disc, a split groove across it, two
yellow grips, a hub lamp, a white index arrow). Bolted, the rotor stands a quarter turn round: its groove crosses the
seam, so it holds both leaves together (the arrow points at the bezel's red mark). While the sensor reacts (d.bolt
1 -> 0, js/game.js updateDoors) it turns a quarter turn until the groove lies along the seam (arrow on the green
mark); then the leaves part and each takes its half of the rotor with it. Shut again, it turns back.

Rendered as overlays in their own small group (doorlock/), over the unchanged door sprites (interior/door_v_*,
interior/deckdoor_door_*), in the very same canvas and origin as those (doors.door_window / deckdoor.window), with
the jambs / spine ends as holdout (where a leaf slides into the wall, its half of the lock goes with it):

  doorlock/door_v_k0..k4       doorways (on the leaves' tops): the bezel halves at d.open step k (0, .2 .. .8, as
                               the panel sprites interior/door_v_f<k>); k >= 1 also the rotor halves (free, hub green)
  doorlock/door_v_rotor_f0..f9 the whole rotor, turned from bolted (f0, 90 deg) to free (f9, 0 deg); the hub lamp is
                               green so the game recolours it (red bolted, amber turning, green free; GFX recolor)
  doorlock/deck_k0..k4         deck doors (on the leaves' south face, z = 0.9): the same
  doorlock/deck_rotor_f0..f9

The rotor turns in the plane of the door (seen at the camera's 50 deg tilt: on a doorway's top an ellipse squashed
to sin 50, on a deck door's face to cos 50), so it is rendered per angle, not turned on the screen.

Every material is warm-neutral or yellow (red >= green, blue) except the hub lamp, so GFX's recolor (saturated
cyan / green pixels) only takes the lamp.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *
import doors as DR
import deckdoor as DD

ROT_FRAMES = 10                                   # rotor angles: f0 = bolted (90 deg) .. f9 = free (0 deg)
STEPS = [0.0, 0.2, 0.4, 0.6, 0.8]                 # d.open steps with something of the leaves left (f5 = gone)
LOCK = {'door': dict(R=0.235, r=0.175),           # bezel / rotor radius (a doorway's leaf top is 0.51 wide)
        'deck': dict(R=0.30, r=0.23)}
DECK_Z = 0.9                                      # the deck door lock's centre height on the face

def lmats():
    return dict(
        bezel=pmat('lk_bezel', '#3a3836', 0.5, 0.5, grime=0.4, grime_scale=5),
        rotor=pmat('lk_rotor', '#b8b4ac', 0.32, 0.8, grime=0.25, grime_scale=6),
        groove=pmat('lk_groove', '#100e0c', 0.9),
        hub=pmat('lk_hub', '#26231f', 0.5, 0.4),
        grip=pmat('lk_grip', '#e8c34f', 0.45, 0.0, grime=0.35),
        bolt=pmat('lk_bolt', '#9c978e', 0.35, 0.8),
        arrow=pmat('lk_arrow', '#f2eee6', 0.5),
        recess=pmat('lk_recess', '#0e0d0c', 0.9),
        lamp=glow('lk_lamp', '#47e07a', 1.3),        # (recoloured in the game)
        red=glow('lk_red', '#e2574c', 0.8),
        green=glow('lk_green', '#47e07a', 0.8),
    )

def lprism(name, pts, z0, z1, m, bevel=0.006):
    """prism() in the lock's local Blender frame (x, y as given; ilib's prism flips y)."""
    return prism(name, [(x, -y) for x, y in pts], z0, z1, m, bevel)

def arc(r, a0, a1, n=24):
    return [(r * math.cos(a0 + (a1 - a0) * i / n), r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def half_pts(r0, r1, h, gap=0.004):
    """Half annulus (r0 = 0: half disc) on side h (+1: local y > 0), pulled back gap from the split line."""
    a0, a1 = (0.0, math.pi) if h > 0 else (math.pi, 2 * math.pi)
    outer = [(x, y + h * gap) for x, y in arc(r1, a0, a1)]
    inner = [(x, y + h * gap) for x, y in arc(r0, a1, a0)] if r0 > 0 else []
    return outer + inner

def tri(cx, cy, ang, s):
    """A small arrow head at (cx, cy) pointing along ang."""
    c, si = math.cos(ang), math.sin(ang)
    P = [(s, 0), (-s * 0.6, s * 0.75), (-s * 0.6, -s * 0.75)]
    return [(cx + x * c - y * si, cy + x * si + y * c) for x, y in P]

ARROW = 3 * math.pi / 4                           # the arrow's direction on the rotor (on half +1); bolted: + 90 deg

def bezel(L, R, r, h, recess=False):
    """The fixed ring (half h), its bolts and its mark (half +1: green = free, half -1: red = bolted)."""
    o = [lprism('bezel', half_pts(r + 0.008, R, h), 0.0, 0.03, L['bezel'])]
    for a in (0.25, 0.5, 0.75):                   # bolts round the ring
        q = (a if h > 0 else 1 + a) * math.pi
        rm = (R + r) / 2 + 0.004
        o.append(mn.cyl('lk_bolt', 0.012 * R / 0.235, 0.012, loc=(rm * math.cos(q), rm * math.sin(q), 0.028), m=L['bolt'], verts=8, bevel=0.003))
    q = ARROW if h > 0 else ARROW + math.pi / 2
    rm = (R + r) / 2 + 0.004
    o.append(lprism('lk_mark', tri(rm * math.cos(q), rm * math.sin(q), q, (R - r) * 0.42), 0.028, 0.036, L['green' if h > 0 else 'red'], 0.002))
    if recess: o.append(lprism('recess', half_pts(0, r + 0.01, h), 0.0, 0.008, L['recess'], 0.0))
    return o

def rotor(L, r, h=0):
    """The turning disc: whole (h = 0, with its split groove) or one half (h = +-1, as it rides on a leaf)."""
    o = []; k = r / 0.175
    if h == 0:
        o.append(mn.cyl('rotor', r, 0.03, loc=(0, 0, 0.01), m=L['rotor'], verts=48, bevel=0.008))
        o.append(mn.box('groove', (2 * r - 0.02, 0.02 * k, 0.006), loc=(0, 0, 0.038), m=L['groove'], bevel=0.0))
        o.append(mn.cyl('hub', 0.05 * k, 0.026, loc=(0, 0, 0.036), m=L['hub'], verts=24, bevel=0.006))
        o.append(mn.sphere('lamp', 0.03 * k, loc=(0, 0, 0.06), m=L['lamp'], scale=(1, 1, 0.6), segs=16))
    else:
        o.append(lprism('rotor', half_pts(0, r, h), 0.01, 0.04, L['rotor'], 0.008))
        o.append(lprism('hub', half_pts(0, 0.05 * k, h), 0.036, 0.062, L['hub'], 0.005))
        o.append(lprism('lamp', half_pts(0, 0.03 * k, h, 0.008), 0.06, 0.074, L['lamp'], 0.004))
    for s in ((1, -1) if h == 0 else (h,)):       # the grips: one ridge on each half, along the split
        y = s * 0.085 * k
        o.append(mn.box('grip', (0.2 * k, 0.042 * k, 0.034), loc=(0, y, 0.038), m=L['grip'], bevel=0.012))
    if h >= 0:                                    # the index arrow (on half +1)
        rm = r * 0.72
        o.append(lprism('arrow', tri(rm * math.cos(ARROW), rm * math.sin(ARROW), ARROW, 0.04 * k), 0.038, 0.046, L['arrow'], 0.002))
    return o

def place(objs, kind, c, psi_extra, phi=0.0):
    """Chain: objs -> turn phi (the rotor) -> psi (deck: the split vertical) -> the lock's centre on the door."""
    ip = mn.group('lk_phi', objs); ip.rotation_euler = (0, 0, phi)
    ps = mn.group('lk_psi', [ip]); ps.rotation_euler = (0, 0, psi_extra)
    if kind == 'door':
        S = DR.Spec('door')
        out = mn.group('lk_at', [ps], loc=G(0.0, c, S.ph))
    else:
        fy = DD.Y_DOOR + DD.DOOR_T / 2
        out = mn.group('lk_at', [ps], loc=G(c, fy, DECK_Z)); out.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.update()
    return objs

def scene(kind):
    """Fresh scene with the jambs (doorway) / spine ends (deck) as holdout; returns the materials."""
    mn.reset(); M = mats()
    if kind == 'door':
        o, hold = DR.frame(DR.Spec('door'), M, 0, 'ok')
    else:
        o, hold = DD.base(M, 'closed')
    keep = set(hold)
    for x in o:
        if x not in keep: bpy.data.objects.remove(x)
    holdout(hold)
    return lmats()

def geo(kind):
    if kind == 'door':
        S = DR.Spec('door'); return S.L / 2, 0.0
    return DD.W / 2, math.pi / 2

def window(kind, name, extra):
    if kind == 'door': DR.door_window(DR.Spec('door'), name, extra=extra)
    else: DD.window(name, extra)

def render_steps(kind, prefix):
    half, psi = geo(kind); P = LOCK[kind]
    for i, k in enumerate(STEPS):
        name = f'{prefix}_k{i}'
        if not want(name): continue
        L = scene(kind); objs = []
        ext = half * (1 - k)
        for h, c in ((1, ext), (-1, 2 * half - ext)):    # half +1 rides on leaf 0 (north / left), half -1 on leaf 1
            part = bezel(L, P['R'], P['r'], h, recess=(k == 0))
            if k > 0: part += rotor(L, P['r'], h)
            objs += place(part, kind, c, psi)
        mn.outline(objs, thickness=0.01)
        window(kind, name, {'open': k, 'note': 'round door lock overlay (doorlock.py): bezel halves' + (' + rotor halves' if k else '') + f' at d.open step {i}; draw over the door sprite'})

def render_rotor(kind, prefix):
    half, psi = geo(kind); P = LOCK[kind]
    for i in range(ROT_FRAMES):
        name = f'{prefix}_rotor_f{i}'
        if not want(name): continue
        L = scene(kind)
        phi = math.radians(90.0 * (1 - i / (ROT_FRAMES - 1)))
        objs = place(rotor(L, P['r']), kind, half, psi, phi)
        mn.outline(objs, thickness=0.01)
        window(kind, name, {'turn': round(1 - i / (ROT_FRAMES - 1), 3), 'note': 'round door lock rotor (doorlock.py), shut door: f0 bolted .. f9 free; hub lamp green -> GFX recolor'})

only = os.environ.get('MN_ONLY', '')
def want(n): return not only or only in n

if __name__ == '__main__':
    render_steps('door', 'doorlock/door_v'); render_rotor('door', 'doorlock/door_v')
    render_steps('deck', 'doorlock/deck'); render_rotor('deck', 'doorlock/deck')
