"""Explosions and hit sparks: stylized flipbooks built from toon fire puffs (no simulation).

Each frame is sculpted from lumpy puffs whose heat steps down white-hot -> yellow -> orange -> red ->
embers -> lit grey smoke as they age, plus a flat shock ring, flying sparks (stretched flame tongues)
and dark debris chunks. Banded emission + dark outlines, like the fires (fire.py).

  fx/explosion_l      12 frames, ~2 units radius: an enemy destroyed (js/enemies.js hitPoi -> phase
                      'burning'), a big hit on our hull (js/combat.js shipHit large, decal r 1.1),
                      a limpet mine going off (js/eva.js explodeMine)
  fx/explosion_s      8 frames, ~0.9 units: small hull hits (shipHit small, decal r 0.5), a mine shot
                      early by the laser, breach blowing in (js/hazards.js breachRoom)
  fx/hit_spark        6 frames, ~0.45 units, orange-yellow: weak spot hit (hitPoi), crew hit, a shot
                      fizzling, the override panel's bonk
  fx/hit_spark_blue   6 frames, electric blue: zaps from arcing lines (zap), capacitors arcing in the
                      ion storm, shield absorbs

Ground origin = the centre of the blast (the game's (x, y) of the hit). Play at ~16 fps (hit sparks at
~20 fps), once, then drop the sprite. Draw unlit (emission) on top; the game's particle bursts
(combatFx) can keep running alongside for extra debris.

    blender -b --factory-startup --python tools/blender/models/fx/explosion.py [-- quick] [-- only=<name>]
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
import fxlib as fx
import mn

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = 'quick' in ARGS
ONLY = [a[5:] for a in ARGS if a.startswith('only=')]
if QUICK: mn.SAMPLES = 16

HEAT = {   # rim -> core, strength
    'white': (['#ff6a00', '#ffa400', '#ffd840', '#fff6c8'], 0.95),
    'yellow': (['#f03400', '#ff6e00', '#ffa800', '#ffe060'], 0.85),
    'orange': (['#c01808', '#ff4400', '#ff9400', '#ffe060'], 0.75),
    'red': (['#600c06', '#a01406', '#e03a04', '#ff7a00'], 0.7),
    'ember': (['#2a1210', '#481810', '#80240c', '#c84410'], 0.6),
}
BLUE = {
    'white': (['#2a6aff', '#5aa8ff', '#a8e0ff', '#f0faff'], 0.8),
    'yellow': (['#1a40e0', '#3a80ff', '#7ac4ff', '#d0f0ff'], 0.75),
    'orange': (['#1a2ab8', '#2a6aff', '#6ab8ff', '#c0eaff'], 0.75),
    'red': (['#10186a', '#1a2a9a', '#2a5ae0', '#6aa8ff'], 0.6),
    'ember': (['#10142a', '#18204a', '#203a80', '#3a6ac8'], 0.5),
}
LEVELS = ['white', 'yellow', 'orange', 'red', 'ember', 'smoke']

def materials(blue=False):
    M = {k: fx.fire_mat('x_' + k, c, strength=s, height_cool=0.25) for k, (c, s) in (BLUE if blue else HEAT).items()}
    M['smoke'] = fx.smoke_mat('x_smoke', '#44444c' if not blue else '#5a6070')
    M['smoke2'] = fx.smoke_mat('x_smoke2', '#2e2e34')
    M['chunk'] = fx.worn('x_chunk', '#3a3f4a', 0.5, 0.6, grime=0.6)
    M['ring'] = fx.fire_mat('x_ring', (BLUE if blue else HEAT)['orange'][0], strength=0.7, height_cool=0.0)
    return M

def heat_of(a, cool):
    """Age 0..1 -> heat level name. cool shifts towards smoke (small blasts burn out faster)."""
    for lim, k in zip((0.1, 0.24, 0.38, 0.52, 0.64), LEVELS):
        if a < lim * cool: return k
    return 'smoke'

def smooth(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def aim(o, d):
    """Rotate an object built along +Z so its +Z points along d."""
    o.rotation_euler = Vector(d).normalized().to_track_quat('Z', 'Y').to_euler()

def blast(name, R, N, seed, n_puffs, n_sparks, n_chunks, ring=True, blue=False, smoke=True, cool=1.0, outline=0.012):
    fx.clear_scene_meshes()
    M = materials(blue)
    rnd = random.Random(seed)
    FR = list(range(1, N + 1))
    puffs = []
    for k in range(n_puffs):
        a = rnd.uniform(0, math.tau); el = rnd.uniform(0.15, 1.2)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) * 0.85, math.sin(el) * 0.9))
        puffs.append(dict(d=d, dist=rnd.uniform(0.25, 0.75), r=rnd.uniform(0.32, 0.5), t0=rnd.uniform(0.0, 0.12) * (k > 0),
                          seed=rnd.randint(0, 999), rise=rnd.uniform(0.2, 0.5)))
    sparks = [dict(d=Vector((math.cos(a), math.sin(a) * 0.9, rnd.uniform(0.1, 0.8))).normalized(), sp=rnd.uniform(0.9, 1.4), l=rnd.uniform(0.7, 1.1))
              for a in [i / max(1, n_sparks) * math.tau + rnd.uniform(-0.25, 0.25) for i in range(n_sparks)]]
    chunks = [dict(d=Vector((math.cos(a), math.sin(a) * 0.9, rnd.uniform(0.3, 0.9))).normalized(), sp=rnd.uniform(0.9, 1.3),
                   s=rnd.uniform(0.07, 0.13), spin=Vector((rnd.uniform(-6, 6), rnd.uniform(-6, 6), rnd.uniform(-6, 6))))
              for a in [rnd.uniform(0, math.tau) for _ in range(n_chunks)]]
    allobjs = []
    light = fx.point_light('blast', (0, 0, R * 0.4), (1.0, 0.6, 0.3) if not blue else (0.5, 0.75, 1.0), 0, R)
    for i, f in enumerate(FR):
        u = i / (N - 1)
        objs, glow = [], []
        # core flash
        if u < 0.25:
            k = 1 - u / 0.25
            glow.append(fx.lumpy('flash', R * (0.45 + 0.25 * (1 - k)) * (0.6 + 0.4 * k), (0, 0, R * 0.25), M['white'], seed=seed, amp=0.12))
        # fire / smoke puffs
        for p in puffs:
            a = (u - p['t0']) / (1 - p['t0'])
            if a < 0: continue
            size = p['r'] * R * (0.35 + 0.65 * smooth(a / 0.25))
            if smoke: size *= (1 - smooth((a - 0.6) / 0.48)) ** 0.8
            else: size *= (1 - smooth((a - 0.35) / 0.55))
            if size < 0.02 * R: continue
            pos = p['d'] * R * p['dist'] * (1 - (1 - min(1, a / 0.5)) ** 2.2) + Vector((0, 0, R * p['rise'] * a * a))
            lvl = heat_of(a, cool)
            if lvl == 'smoke' and not smoke: continue
            m = M[lvl] if lvl != 'smoke' else (M['smoke'] if p['seed'] % 3 else M['smoke2'])
            o = fx.lumpy('puff', size, pos + Vector((0, 0, size * 0.6)), m, seed=p['seed'] + i * 0.15, amp=0.16, sub=3)
            (objs if lvl == 'smoke' else glow).append(o)
        # shock ring: a flat torus-ish ring on the ground, expanding and thinning
        if ring and u < 0.45:
            k = u / 0.45; rr = R * (0.45 + 0.9 * smooth(k)); w = R * 0.14 * (1 - k) + 0.01
            glow.append(fx.ring('shock', rr, w, 0.03, loc=(0, 0, 0.01), m=M['ring'], verts=48))
        # sparks: stretched flame tongues flying out
        for s in sparks:
            if u > 0.6: break
            k = u / 0.6; dist = R * s['sp'] * (0.25 + 0.9 * smooth(k ** 0.7))
            ln = R * 0.38 * s['l'] * (1 - k) ** 0.8 + 0.02; w = R * 0.045 * (1 - k * 0.6)
            o = fx.tongue('spark', (0, 0, 0), ln, w, m=M['white' if k < 0.3 else 'yellow'], flat=1.0, segs=8, n=8)
            o.location = s['d'] * (dist - ln) + Vector((0, 0, 0.05)); aim(o, s['d']); glow.append(o)
        # debris
        for c in chunks:
            if u > 0.85: break
            dist = R * c['sp'] * (0.15 + 1.0 * (1 - (1 - u) ** 1.8))
            o = fx.lumpy('chunk', c['s'] * R * 0.6, c['d'] * dist + Vector((0, 0, 0.05)), M['chunk'], seed=hash(id(c)) % 97, amp=0.35, sub=1)
            o.rotation_euler = c['spin'] * u; o.scale = (1.3, 0.8, 0.6); objs.append(o)
        mn.outline(objs, thickness=outline)
        mn.outline(glow, thickness=outline, color='#3a1006' if not blue else '#0a1240')
        fx.only_on(objs + glow, f, FR); allobjs += objs + glow
        light.data.energy = 120 * R * max(0.0, 1 - u / 0.5) ** 2; light.data.keyframe_insert('energy', frame=f)
    mn.render('fx/' + name, objs=allobjs, frames=FR)

def hit_spark(name, blue, seed):
    """A short star burst: white flash, a cross flare, 7 streaks and a wisp of smoke."""
    fx.clear_scene_meshes()
    M = materials(blue); rnd = random.Random(seed); N = 6; FR = list(range(1, N + 1)); R = 0.45
    dirs = [Vector((math.cos(a), math.sin(a) * 0.9, rnd.uniform(0.1, 0.7))).normalized() for a in
            [i / 7 * math.tau + rnd.uniform(-0.3, 0.3) for i in range(7)]]
    lens = [rnd.uniform(0.6, 1.0) for _ in dirs]
    allobjs = []
    for i, f in enumerate(FR):
        u = i / (N - 1); glow = []; objs = []
        if u < 0.5:
            k = 1 - u / 0.5
            glow.append(fx.lumpy('flash', R * (0.22 + 0.2 * k), (0, 0, 0.12), M['white'], seed=seed + i, amp=0.15))
            for a in (0, math.pi / 2):                      # the cartoon cross flare
                for sgn in (1, -1):
                    o = fx.tongue('flare', (0, 0, 0), R * 1.1 * k + 0.05, R * 0.07 * k + 0.01, m=M['white'], flat=0.35, segs=8, n=8)
                    o.location = (0, 0, 0.12); aim(o, (sgn * math.cos(a), 0, sgn * math.sin(a))); glow.append(o)
        for d, l in zip(dirs, lens):
            if u > 0.85: break
            k = u / 0.85; dist = R * (0.3 + 1.1 * (1 - (1 - k) ** 2)); ln = R * 0.55 * l * (1 - k) + 0.02
            o = fx.tongue('streak', (0, 0, 0), ln, R * 0.05 * (1 - 0.5 * k) + 0.008, m=M['white' if k < 0.4 else 'yellow'], flat=1.0, segs=8, n=8)
            o.location = d * (dist - ln) + Vector((0, 0, 0.12)); aim(o, d); glow.append(o)
        if u >= 0.4:                                         # a wisp of smoke
            k = (u - 0.4) / 0.6
            objs.append(fx.lumpy('wisp', R * 0.18 * (1 - k * 0.7), (0.05, 0, 0.2 + k * 0.25), M['smoke'], seed=seed, amp=0.2))
        mn.outline(objs, thickness=0.008)
        mn.outline(glow, thickness=0.008, color='#3a1006' if not blue else '#0a1240')
        fx.only_on(objs + glow, f, FR); allobjs += objs + glow
    mn.render('fx/' + name, objs=allobjs, frames=FR)

t0 = time.time()
mn.reset()
fx.punchy()
JOBS = [
    ('explosion_l', lambda: blast('explosion_l', 2.0, 12, 7, 16, 10, 8)),
    ('explosion_s', lambda: blast('explosion_s', 0.9, 8, 3, 9, 7, 4, cool=0.9)),
    ('hit_spark', lambda: hit_spark('hit_spark', False, 11)),
    ('hit_spark_blue', lambda: hit_spark('hit_spark_blue', True, 12)),
]
for n, job in JOBS:
    if ONLY and n not in ONLY: continue
    job()
print(f'[fx] explosions done in {time.time() - t0:.0f} s')
