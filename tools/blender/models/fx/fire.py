"""Fires (js/mission.js drawFires / igniteSystem): a cluster of toon flame tongues, an 8-frame loop.

The game draws each fire at (f.x, f.y) with scale s = (0.55 + 0.45 * f.hp) * 1.6 (hp 1 -> 0 while it is
sprayed): five teardrop tongues, three colour layers (red rim, orange, yellow-white core; plasma:
violet / lilac / white), the tallest 1.15 * s units high on screen, the cluster ~1.1 * s wide, the base
0.15 * s below the origin. We build the same five tongues in 3D (same offsets, heights and phases),
add two small licks breaking off the tips and a bed of embers, and render three sizes:

  fx/fire_s   s = 0.95 (hp ~0.1, almost out)     fx/plasma_m   s = 1.31 (plasma never drops below hp 0.6)
  fx/fire_m   s = 1.24 (hp 0.5)                  fx/plasma_l   s = 1.6
  fx/fire_l   s = 1.6  (hp 1, fresh)

Each is 8 frames (_f0.._f7), loop at ~12 fps. Ground origin = the fire's (x, y).
Runtime (stays procedural): the warm floor glow / point light (flames are light sources), embers and
smoke drifting up (particles), the spread timer ring (UI). Flames are pure emission: draw them unlit
(ignore the .n/.h passes for lighting, they're there for completeness).

    blender -b --factory-startup --python tools/blender/models/fx/fire.py [-- quick]
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
if QUICK: mn.SAMPLES = 16
N = 8
FRAMES = list(range(1, N + 1))
COS, SIN = math.cos(fx.E), math.sin(fx.E)
# (offset x, height, phase) of the game's tongues, back to front in depth
TONGUES = [(0.25, 0.9, 1.7, 0.10), (0, 1.15, 3.1, 0.04), (-0.3, 0.75, 0.0, -0.02), (0.38, 0.55, 5.6, -0.10), (-0.12, 0.6, 4.4, -0.16)]

def build(s, plasma):
    fx.clear_scene_meshes()
    cols = fx.PLASMA if plasma else fx.FIRE
    hk = 1.15 if plasma else 1.0                                   # plasma flames stand taller
    mats = [fx.fire_mat('flame%d' % i, cols, strength=st, height_cool=hc) for i, (st, hc) in enumerate(((0.9, 0.6), (1.0, 0.45)))]
    ember = fx.fire_mat('ember', ['#2a1612', '#6a1e12', '#e0501c', '#ffb040'] if not plasma else ['#1e1430', '#3a1a6a', '#8a4aff', '#d2a8ff'],
                        strength=0.9, stops=(0.0, 0.45, 0.72, 0.9), height_cool=0.0)
    char = fx.worn('char', '#2a2422', 0.85, 0.1, grime=0.5)
    base_y = -0.15 * s / SIN
    allobjs = []
    for i, f in enumerate(FRAMES):
        ph_t = math.tau * i / N
        objs = []
        for j, (ox, hgt, ph, dy) in enumerate(TONGUES):
            flick = 0.85 + 0.15 * math.sin(ph_t + ph) + 0.08 * math.sin(2 * ph_t + ph * 2)
            h = hgt * s * hk * flick / COS
            w = 0.2 * s
            sway = (math.sin(ph_t + ph) * w * 0.9, math.cos(ph_t + ph * 1.3) * w * 0.4)
            objs.append(fx.tongue(f'tongue{j}', (ox * 0.9 * s, base_y + dy * s, 0.02), h, w, sway, mats[j % 2],
                                  wob=0.12, wob_ph=ph - 2 * ph_t, flat=0.85))
        for j, (ox, ph) in enumerate(((0.05, 0.4), (0.3, 3.5), (-0.25, 5.0))):      # licks breaking off the tips and rising
            q = (i / N + ph / math.tau) % 1.0
            z = (0.75 + 0.55 * q) * s * hk / COS
            sz = 0.11 * s * (1 - q) ** 0.7
            if sz < 0.02: continue
            x = ox * s + math.sin(ph_t + ph) * 0.12 * s
            objs.append(fx.tongue(f'lick{j}', (x, base_y + 0.02 * s, z), sz * 3.2, sz, (math.sin(ph + q * 3) * sz, 0), mats[0], flat=0.85, segs=12, n=10))
        for j in range(5):                                          # glowing embers / burning debris at the foot
            a = j * 1.3 + 0.4; r = 0.32 * s * (0.6 + 0.4 * (j % 2))
            objs.append(fx.lumpy(f'coal{j}', 0.085 * s, (math.cos(a) * r, base_y + math.sin(a) * r * 0.6, 0.03 * s),
                                 ember if j % 2 else char, seed=j * 3 + 1, amp=0.25, sub=2, squash=(1.2, 1.0, 0.55)))
        mn.outline(objs, thickness=0.012, color='#4a1408')
        fx.only_on(objs, f, FRAMES); allobjs += objs
    li = fx.point_light('fire', (0, base_y, 0.5 * s), (0.62, 0.45, 1.0) if plasma else (1.0, 0.55, 0.25), 40 * s, 0.4)
    return allobjs

t0 = time.time()
SIZES = [('fire_s', 0.95, False), ('fire_m', 1.24, False), ('fire_l', 1.6, False), ('plasma_m', 1.31, True), ('plasma_l', 1.6, True)]
if QUICK: SIZES = [('fire_l', 1.6, False), ('plasma_l', 1.6, True)]
mn.reset()
fx.punchy()
for name, s, plasma in SIZES:
    objs = build(s, plasma)
    mn.render('fx/' + name, objs=objs, frames=FRAMES)
print(f'[fx] fires done in {time.time() - t0:.0f} s')
