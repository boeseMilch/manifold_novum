"""Menu UI kit: metal plates, raised silver buttons, recessed screens, paint swatches, LEDs and a few
decals for the main menu, the game lobby and the Locker / Shipyard (index.html; drawn lit at runtime
by js/menugl.js, or as plain CSS border-images without WebGL2 / in ?classic).

View: the menu is a panel facing you (like a console on a back wall), seen slightly from above:
orthographic, ELEV = 70° (the ship's sprites use 50°), so raised pieces show their lower side wall,
recesses show their upper inner wall and the plate shows its thickness along the bottom edge. Pieces
are modelled in "screen" coordinates (x right, y up, z out of the plate) and squeezed in y by
1 / sin(ELEV) under a parent, so their footprint at the reference height fills the texture exactly
(the 9-slice math stays square). Normals stay in the plate's space (x right, y up the plate, z out of it:
the view's tilt only changes what you see), heights stay world z.

Light: the ship's key light (mn.light_rig 'key': front right, above) as it falls on such a wall,
i.e. from the upper right, plus a soft fill, and a studio-like gradient world (bright above, dark
below) so the metal's bevels reflect something: silver reads as silver, not flat grey.

Scale: 1 Blender unit = 32 CSS px = TPX (64) texture px (2x for HiDPI screens).

Pieces (9-slices unless noted; assets/ui/ui.json, written by this script):
  plate            thick panel slab: chamfered outer rim, raised worn lip with hex bolts in the
                   corners, a seam groove where the panelling starts. Centre unused (the runtime and
                   the CSS fill it with `plate_fill`, sized per plate).
  plate_fill       one painted-steel panel (not a 9-slice, repeated / stretched to an even grid):
                   worn paint, grime, scratches, a rivet in each corner, half a seam on each edge.
  btn, btn_down    big raised brushed-silver button in a dark bezel well; _down = pushed in.
  btns, btns_down  small (0.55x size and relief): JOIN, ‹ MENU.
  btn_red(_down)   the one red button (START MISSION): red cap in a hazard-striped collar. Its
                   edges and centre REPEAT (`repeat`: the stripes tile every 1 unit) instead of stretching.
  inset            a deep recessed screen: chamfered rim, an inner wall in shadow, dark glass floor.
  swatch(_down)    round paint button: white cap with a tint mask (the runtime / CSS colours it).
  led_on, led_off  indicator lamp (not a 9-slice).
  tape             a strip of duct tape (decal, not a 9-slice), laid over a plate corner.
  tag_<name>       small riveted name plates with a stencil (decals): CREW 07, FLIGHT OPS, BRIEFING, STORES.

Files per piece: assets/ui/<name>.png (beauty, RGBA, also the CSS fallback) and <name>.nh.png
(r, g = normal x, y * 0.5 + 0.5; b = height, (z - zmin) / (zmax - zmin); a = coverage).
Swatches also get <name>.m.png (tint mask).

Re-render (CPU; ~1 min with 24 cores):
    blender -b --factory-startup --python tools/blender/models/ui/ui.py              # all pieces
    blender -b --factory-startup --python tools/blender/models/ui/ui.py -- quick     # 16 samples
    blender -b --factory-startup --python tools/blender/models/ui/ui.py -- btn inset # some (prefix match)
Raw passes go to build/renders/ui/ (not in git); the game files are written to assets/ui/ directly.
"""
import os, sys, math, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'systems'))
from syslib import *            # mn, pmat, glow, worn, label, ring, ARGS
import numpy as np

TPX = 64                        # texture px per unit
CSS = 32                        # CSS px per unit
ELEV = 70.0
E = math.radians(ELEV); SN, CS = math.sin(E), math.cos(E)
ASSETS = os.path.join(mn.ROOT, 'assets', 'ui')
RAW = os.path.join(mn.OUT_DIR, 'ui')
ONLY = [a for a in ARGS if a != 'quick']
mn.SAMPLES = 16 if 'quick' in ARGS else 128
PLATE_Z = 0.3                   # the plate's panel surface (the runtime's height 0)
GAP = 0.07                      # seam groove width (fill tiles carry half of it on each edge)

# ---------------------------------------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------------------------------------
def cam_to_world(v):
    """Camera-space direction (x right, y up the screen, z towards the viewer) -> world."""
    x, y, z = v
    return Vector((x, y * SN - z * CS, y * CS + z * SN))

def scene():
    s = mn.reset()
    for o in list(s.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o)
    # gradient world: bright above, darker below, a warm-ish band: something for metal to reflect
    nt = s.world.node_tree; N = nt.nodes; bg = N['Background']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    el = ramp.color_ramp.elements                   # (Generated z of the world = direction's z, -1..1 -> 0..1)
    el[0].position = 0.5; el[0].color = (0.03, 0.032, 0.036, 1)
    el[1].position = 1.0; el[1].color = (0.3, 0.31, 0.33, 1)    # zenith: what flat tops reflect
    for pos, v in ((0.62, 0.05), (0.7, 1.1), (0.86, 1.1), (0.92, 0.2)):   # a softbox ring: bevels catch it
        e = el.new(pos); e.color = (v, v * 0.98, v * 0.95, 1)
    nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.0
    def sun(name, frm, energy, color, angle):
        d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = angle
        o = mn.link(bpy.data.objects.new(name, d))
        o.rotation_euler = cam_to_world(frm).normalized().to_track_quat('Z', 'Y').to_euler()
    sun('key', (0.38, 0.55, 0.74), 3.0, (1.0, 0.96, 0.9), math.radians(10))     # upper right
    sun('fill', (-0.55, -0.3, 0.78), 0.45, (0.72, 0.82, 1.0), math.radians(45))
    d = bpy.data.cameras.new('uicam'); d.type = 'ORTHO'
    c = mn.link(bpy.data.objects.new('uicam', d)); c.rotation_euler = (math.radians(90 - ELEV), 0, 0); s.camera = c
    d.clip_start = 0.1; d.clip_end = 200
    s.cycles.max_bounces = 8
    return s

def M_():
    silver = pmat('silver', '#c4cad3', 0.3, 0.92, grime=0.22, grime_scale=1.5)
    brushed(silver)
    return dict(
        paint=worn('paint', '#58627a', 0.5, 0.35, wear=0.9, grime=1.0, scale=1.6),
        frame=worn('frame', '#3d4452', 0.42, 0.6, wear=1.2, grime=0.9, scale=2.2),
        rim=pmat('rim', '#2b303a', 0.4, 0.7, grime=0.3, grime_scale=3),
        wall=pmat('wall', '#23272f', 0.6, 0.5, grime=0.5, grime_scale=4),
        seam=pmat('seam', '#101216', 0.85),
        bolt=pmat('bolt', '#b4bcc8', 0.28, 0.95, grime=0.4, grime_scale=14),
        hole=pmat('hole', '#08090b', 0.9),
        glass=dull(pmat('glass', '#0b0e13', 0.5, 0.0, grime=0.3, grime_scale=1.2), 0.25),
        silver=silver,
        red=coated('cap_red', '#a8301f', 0.32, 0.05),
        hazard=pmat('hazard', None, 0.5, 0.0, stripes=('#e8c34f', '#1e2026'), stripe_k=4.0, grime=0.35, grime_scale=3),
        white=coated('cap_white', '#e8ecf4', 0.35, 0.0),
        led_off=coated('led_off', '#1d3328', 0.2),
        led_on=glow('led_on', '#3fdc8e', 0.9),
        lens=pmat('lens', '#cfffe6', 0.1),
        tape=pmat('tape', '#a9adb4', 0.7, 0.25, grime=0.6, grime_scale=4),
        ink=pmat('ink', '#1a1c21', 0.7),
        tagplate=pmat('tagplate', '#c9b47a', 0.4, 0.75, grime=0.6, grime_scale=4),
    )

def dull(m, k):
    m.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = k; return m

def coated(name, color, rough, metal=0.0):
    m = pmat(name, color, rough, metal, grime=0.15, grime_scale=1.5)
    m.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0.4
    return m

def brushed(m):
    """Fine horizontal brushing in the roughness / a touch of the colour (stretched noise)."""
    nt = m.node_tree; N = nt.nodes; b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.0, 90.0, 1.0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6.0; nz.inputs['Detail'].default_value = 4
    nt.links.new(mp.outputs[0], nz.inputs['Vector'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.1; rr.inputs['To Max'].default_value = 0.22
    nt.links.new(nz.outputs['Fac'], rr.inputs['Value']); nt.links.new(rr.outputs[0], b.inputs['Roughness'])

# ---------------------------------------------------------------------------------------------------------
# Geometry (screen coordinates; the parent squeezes y): rounded-rect prisms and frames
# ---------------------------------------------------------------------------------------------------------
def rr_pts(w, h, r, seg=8, cx=0.0, cy=0.0):
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4)); pts = []
    for k, (qx, qy) in enumerate(((w / 2 - r, h / 2 - r), (-w / 2 + r, h / 2 - r), (-w / 2 + r, -h / 2 + r), (w / 2 - r, -h / 2 + r))):
        for i in range(seg + 1):
            a = math.pi / 2 * (k + i / seg)
            pts.append((cx + qx + r * math.cos(a), cy + qy + r * math.sin(a)))
    return pts

def _mesh(name, verts, faces, m, bevel, segs=4):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = mn.link(bpy.data.objects.new(name, me))
    if bevel:
        md = o.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = segs; md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(40); md.harden_normals = True
    if m: mn.assign(o, m)
    return mn.smooth(o) if bevel else o              # (an unbevelled n-gon smoothed would bend its normals)

def slab(name, pts, z0, z1, m, bevel=0.03, segs=4):
    n = len(pts); V = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    F = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return _mesh(name, V, F, m, bevel, segs)

def frame(name, outer, inner, z0, z1, m, bevel=0.03, segs=4, zin=None):
    """Prism between two polygons with the same number of points. zin: the inner top edge's height
    (default z1): a sloped (chamfered) frame top."""
    zi = z1 if zin is None else zin
    n = len(outer); V = [(x, y, z0) for x, y in outer] + [(x, y, z0) for x, y in inner] + [(x, y, z1) for x, y in outer] + [(x, y, zi) for x, y in inner]
    o0, i0, o1, i1 = 0, n, 2 * n, 3 * n; F = []
    for a in range(n):
        b = (a + 1) % n
        F += [[o1 + a, o1 + b, i1 + b, i1 + a], [o0 + b, o0 + a, i0 + a, i0 + b], [o0 + a, o0 + b, o1 + b, o1 + a], [i0 + b, i0 + a, i1 + a, i1 + b]]
    return _mesh(name, V, F, m, bevel, segs)

def hexbolt(x, y, z, r, M, ang=0.3):
    w = mn.cyl('washer', r * 1.4, r * 0.3, loc=(x, y, z), m=M['rim'], verts=28, bevel=r * 0.1)
    hx = mn.cyl('bolt', r, r * 0.7, loc=(x, y, z + r * 0.3), m=M['bolt'], verts=6, bevel=r * 0.2); hx.rotation_euler.z = ang
    return [w, hx]

# ---------------------------------------------------------------------------------------------------------
# Rendering one piece: squeeze, an exact window, beauty / normal / height (/ mask) -> assets/ui
# ---------------------------------------------------------------------------------------------------------
META = {}
def render_piece(name, size_u, zmin, zmax, slice_u=None, mask=False, extra=None, zlo=PLATE_Z, zhi=PLATE_Z, h_u=None):
    """size_u (x h_u): the footprint (screen units) that fills the texture. zlo / zhi: heights of its
    bottom / top outer edge (they land exactly on the texture's bottom / top row)."""
    s = bpy.context.scene; c = s.camera
    W = size_u; H = h_u or size_u
    k = 1 - (zhi - zlo) * CS / H; sh = -(zhi + zlo) * CS / 2
    root = mn.link(bpy.data.objects.new('squeeze', None))
    for o in s.objects:
        if o.type == 'MESH' and o.parent is None: o.parent = root
    root.scale = (1, k / SN, 1); root.location = (0, sh / SN, 0)
    bpy.context.view_layer.update()
    pw, ph = int(round(W * TPX)), int(round(H * TPX))
    s.render.resolution_x = pw; s.render.resolution_y = ph; s.render.resolution_percentage = 100
    c.data.ortho_scale = max(W, H)
    up = Vector((0, SN, CS)); back = Vector((0, -CS, SN))
    c.location = up * 0 + back * 60
    os.makedirs(RAW, exist_ok=True)
    base = os.path.join(RAW, name)
    for kind in ('beauty', 'normal', 'height') + (('mask',) if mask else ()):
        mn._render_to(base + {'beauty': '.png', 'normal': '.n.png', 'height': '.h.png', 'mask': '.m.png'}[kind], kind)
    export(name, base, zmin, zmax, mask)
    e = {'size': pw, 'zmin': round((zmin - PLATE_Z) * CSS, 3), 'zmax': round((zmax - PLATE_Z) * CSS, 3)}
    if ph != pw: e['h'] = ph
    if slice_u is not None: e['slice'] = int(round(slice_u * TPX))
    if mask: e['mask'] = True
    if extra: e.update(extra)
    META[name] = e
    print(f'[ui] {name}: {pw}x{ph}px, z {zmin:.3f}..{zmax:.3f}')

def _load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size; a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)

def _save(path, arr):
    h, w = arr.shape[:2]
    im = bpy.data.images.new('out', w, h, alpha=True)
    im.colorspace_settings.name = 'Non-Color'; im.alpha_mode = 'STRAIGHT'
    im.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)

def export(name, base, zmin, zmax, mask):
    os.makedirs(ASSETS, exist_ok=True)
    beauty = _load(base + '.png'); _save(os.path.join(ASSETS, name + '.png'), beauty)
    n = _load(base + '.n.png'); hgt = _load(base + '.h.png')
    z = hgt[..., 0] * mn.HEIGHT_RANGE
    w = n[..., :3] * 2 - 1
    L = np.linalg.norm(w, axis=-1, keepdims=True); w = np.where(L > 1e-3, w / np.maximum(L, 1e-3), np.array([0, 0, 1.0]))
    cx = w[..., 0]; cy = w[..., 1]                     # world normals: x right, y up the plate, z out of it (the view's tilt doesn't matter)
    covered = n[..., 3] > 0.01
    nh = np.zeros_like(n)
    nh[..., 0] = np.where(covered, cx * 0.5 + 0.5, 0.5); nh[..., 1] = np.where(covered, cy * 0.5 + 0.5, 0.5)
    nh[..., 2] = np.where(covered, (z - zmin) / (zmax - zmin), 0.0)
    nh[..., 3] = beauty[..., 3]
    _save(os.path.join(ASSETS, name + '.nh.png'), nh)
    if mask:
        m = _load(base + '.m.png'); mm = np.zeros_like(m); mm[..., :3] = m[..., :1]; mm[..., 3] = 1
        _save(os.path.join(ASSETS, name + '.m.png'), mm)

def want(name):
    return not ONLY or any(name.startswith(o) for o in ONLY)

# ---------------------------------------------------------------------------------------------------------
# Pieces
# ---------------------------------------------------------------------------------------------------------
B_PLATE = 0.875                  # plate frame (9-slice border): 28 CSS px
LIP = 0.5                        # lip top

def piece_plate():
    """4 x 4 units. A 0.3-thick slab with a chamfered rim rising to a worn lip (0.5), corner bolts,
    a step down to the panel level at the slice line (the fill tiles start there with half a seam)."""
    scene(); M = M_(); S = 4.0; B = B_PLATE; R = 0.42
    P = []
    P.append(slab('back', rr_pts(S - 0.1, S - 0.1, R), 0.0, PLATE_Z - 0.1, M['seam'], 0.0))
    P.append(slab('centre', rr_pts(S - 2 * B - GAP, S - 2 * B - GAP, 0.06), 0.0, PLATE_Z, M['paint'], 0.02))
    lip_in = rr_pts(S - 2 * B + GAP, S - 2 * B + GAP, 0.08)
    # outer chamfer: from the slab's edge (z 0.12) up to the lip, then the lip's flat top, then a step down
    P.append(frame('chamfer', rr_pts(S, S, R), rr_pts(S - 0.36, S - 0.36, R - 0.16), 0.0, 0.16, M['frame'], 0.03, 3, zin=LIP))
    P.append(frame('lip', rr_pts(S - 0.34, S - 0.34, R - 0.15), lip_in, 0.0, LIP, M['frame'], 0.05, 4))
    P.append(frame('step', rr_pts(S - 2 * B + 0.24, S - 2 * B + 0.24, 0.14), lip_in, 0.0, LIP - 0.08, M['frame'], 0.025, 3))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P += hexbolt(sx * (S / 2 - 0.44), sy * (S / 2 - 0.44), LIP, 0.14, M, ang=0.2 + 0.7 * (sx + 2 * sy))
    mn.outline(P, 0.012)
    render_piece('plate', S, 0.0, LIP + 0.15, B, zlo=0.0, zhi=0.16, extra={'fillAt': int(B * TPX)})

def piece_fill():
    """One painted-steel panel, 8 x 8 units (256 CSS px before the runtime fits it), seams at the edges."""
    scene(); M = M_(); T = 8.0
    P = [mn.box('back', (3 * T, 3 * T, PLATE_Z - 0.12), m=M['seam'], bevel=0)]
    for ix in (-1, 0, 1):
        for iy in (-1, 0, 1):
            cx, cy = ix * T, iy * T
            P.append(slab(f'panel{ix}{iy}', rr_pts(T - GAP, T - GAP, 0.08, cx=cx, cy=cy), 0.0, PLATE_Z, M['paint'], 0.03))
            for sx in (-1, 1):
                for sy in (-1, 1):
                    x, y = cx + sx * (T / 2 - 0.32), cy + sy * (T / 2 - 0.32)
                    P.append(mn.cyl('rivet', 0.1, 0.05, loc=(x, y, PLATE_Z), m=M['bolt'], verts=20, bevel=0.02))
    mn.outline(P, 0.009)
    render_piece('plate_fill', T, 0.0, PLATE_Z + 0.08, None, extra={'tile': True})

def piece_button(tone, small=False, down=False):
    """Raised button in a bezel well. Big: 2 x 2 u, slice 0.5 u (16 px), the cap 0.42 u (13 px) above
    the plate with a rounded 0.14 bevel; small: 0.55x. down: pushed in to 0.1 u. red: hazard collar."""
    scene(); M = M_()
    k = 0.55 if small else 1.0
    S = 2.0 * k; R = 0.3 * k
    hz = tone == 'red'
    zb = PLATE_Z - 0.18 * k
    P = [slab('well', rr_pts(S - 0.1 * k, S - 0.1 * k, R), zb - 0.02, PLATE_Z - 0.05 * k, M['hole'], 0)]
    cw = (0.22 if hz else 0.13) * k                                      # collar width
    P.append(frame('collar', rr_pts(S, S, R), rr_pts(S - 2 * cw, S - 2 * cw, R - cw * 0.7), PLATE_Z - 0.05 * k, PLATE_Z + 0.07 * k,
                   M['hazard'] if hz else M['rim'], 0.03 * k, 3))
    top = PLATE_Z + (0.1 if down else 0.42) * k
    ci = cw + 0.07 * k
    cap_pts = rr_pts(S - 2 * ci, S - 2 * ci, R - ci * 0.7)
    capm = M['red'] if hz else M['silver']
    P.append(slab('cap', cap_pts, zb, top, capm, 0.14 * k, 6))
    mn.outline(P, 0.012 * k)
    name = ('btns' if small else 'btn') + ('_red' if hz else '') + ('_down' if down else '')
    render_piece(name, S, PLATE_Z - 0.22 * k, PLATE_Z + 0.46 * k, 0.5 * k, extra={'repeat': True} if hz else None)

def piece_inset():
    """Recessed screen, 2 x 2 u, slice 0.5 u: a chamfered rim, an inner wall 0.5 u (16 px) deep, glass."""
    scene(); M = M_(); S = 2.0; R = 0.32
    floor = PLATE_Z - 0.5
    P = [slab('glass', rr_pts(S - 0.36, S - 0.36, R - 0.14), floor - 0.02, floor, M['glass'], 0.0)]
    P.append(frame('rim', rr_pts(S, S, R), rr_pts(S - 0.2, S - 0.2, R - 0.08), floor - 0.02, PLATE_Z + 0.04, M['rim'], 0.04, 3, zin=PLATE_Z + 0.02))
    P.append(frame('wall', rr_pts(S - 0.18, S - 0.18, R - 0.08), rr_pts(S - 0.36, S - 0.36, R - 0.14), floor - 0.02, PLATE_Z + 0.02, M['wall'], 0.015, 2, zin=floor + 0.02))
    mn.outline(P, 0.01)
    render_piece('inset', S, floor - 0.02, PLATE_Z + 0.06, 0.5)

def piece_swatch(down=False):
    scene(); M = M_(); S = 1.0
    P = [mn.cyl('well', 0.46, 0.08, loc=(0, 0, PLATE_Z - 0.08), m=M['hole'], verts=48, bevel=0)]
    P.append(ring('bezel', 0.5, 0.09, 0.1, loc=(0, 0, PLATE_Z - 0.04), m=M['rim'], verts=48))
    cap = mn.sphere('cap', 0.39, loc=(0, 0, PLATE_Z - 0.08), m=M['white'], scale=(1, 1, (0.26 if down else 0.55) / 0.39), segs=48)
    mn.tint(cap)
    mn.outline(P + [cap], 0.012)
    render_piece('swatch' + ('_down' if down else ''), S, PLATE_Z - 0.1, PLATE_Z + 0.5, 0.5, mask=True)

def piece_led(on):
    scene(); M = M_(); S = 0.5
    P = [ring('bezel', 0.22, 0.06, 0.07, loc=(0, 0, PLATE_Z), m=M['rim'], verts=40)]
    P.append(mn.sphere('lens', 0.165, loc=(0, 0, PLATE_Z), m=M['led_on' if on else 'led_off'], scale=(1, 1, 0.6), segs=32))
    if on: P.append(mn.sphere('glint', 0.05, loc=(0.05, 0.06, PLATE_Z + 0.09), m=M['lens'], scale=(1, 1, 0.3), segs=16))
    mn.outline(P, 0.01)
    render_piece('led_' + ('on' if on else 'off'), S, PLATE_Z - 0.02, PLATE_Z + 0.16, None, extra={'emissive': 1.0 if on else 0.0})

def piece_tape():
    """A strip of duct tape, 3.4 x 0.62 u at 38°, crinkled, torn ends. Decal: lies on the lip / plate."""
    scene(); M = M_()
    import bmesh, random
    random.seed(7)
    L, Wd = 4.2, 0.78
    me = bpy.data.meshes.new('tape'); bm = bmesh.new()
    nx, ny = 40, 6; vs = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            x = -L / 2 + L * i / nx; y = -Wd / 2 + Wd * j / ny
            if i in (0, nx): x += random.uniform(-0.05, 0.05)                    # torn ends
            z = 0.02 + 0.006 * math.sin(i * 0.9 + j * 1.3) + 0.004 * random.random()
            vs[i, j] = bm.verts.new((x, y, z))
    for i in range(nx):
        for j in range(ny): bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new('tape', me)); mn.assign(o, M['tape']); mn.smooth(o)
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.012
    o.rotation_euler.z = math.radians(38); o.location.z = PLATE_Z + 0.2
    render_piece('tape', 3.9, PLATE_Z + 0.15, PLATE_Z + 0.3, None, zlo=PLATE_Z + 0.2, zhi=PLATE_Z + 0.2, h_u=3.2)

TAGS = {'tag_crew': 'CREW 07', 'tag_ops': 'FLIGHT OPS', 'tag_brief': 'BRIEFING', 'tag_stores': 'STORES'}
def piece_tag(name, text):
    """Small riveted brass name plate with a stencil, 2.6 x 0.56 u. Decal: sits on a plate's lip."""
    scene(); M = M_(); W, H = 2.6, 0.56
    P = [slab('tag', rr_pts(W - 0.06, H - 0.06, 0.08), PLATE_Z, PLATE_Z + 0.05, M['tagplate'], 0.02, 3)]
    for sx in (-1, 1): P.append(mn.cyl('rv', 0.05, 0.03, loc=(sx * (W / 2 - 0.16), 0, PLATE_Z + 0.05), m=M['bolt'], verts=16, bevel=0.01))
    t = label('txt', text, 0.27, (0, -0.005, PLATE_Z + 0.052), m=M['ink'], depth=0.003)
    mn.outline(P, 0.01)
    P.append(t)
    render_piece(name, W, PLATE_Z, PLATE_Z + 0.1, None, h_u=H)

# ---------------------------------------------------------------------------------------------------------
jobs = [('plate_fill', piece_fill), ('plate', piece_plate), ('inset', piece_inset)]
for tone in ('steel', 'red'):
    for small in ((False, True) if tone == 'steel' else (False,)):
        for down in (False, True):
            jobs.append((('btns' if small else 'btn') + ('_red' if tone == 'red' else '') + ('_down' if down else ''),
                         lambda t=tone, sm=small, d=down: piece_button(t, sm, d)))
jobs += [('swatch', lambda: piece_swatch(False)), ('swatch_down', lambda: piece_swatch(True)),
         ('led_on', lambda: piece_led(True)), ('led_off', lambda: piece_led(False)), ('tape', piece_tape)]
jobs += [(n, lambda n=n, t=t: piece_tag(n, t)) for n, t in TAGS.items()]
for name, fn in jobs:
    if want(name): fn()

meta_path = os.path.join(ASSETS, 'ui.json')
old = {}
if os.path.exists(meta_path) and ONLY:
    with open(meta_path) as f: old = json.load(f).get('pieces', {})
old.update(META)
with open(meta_path, 'w') as f:
    json.dump({'_': 'Menu UI kit (tools/blender/models/ui/ui.py, drawn by js/menugl.js). size (x h) / slice / fillAt: texture px '
                    '(texPerCss per CSS px). zmin / zmax: the heights in CSS px above the plate surface that nh.png blue 0..1 spans. '
                    'repeat: edges and centre tile instead of stretching.',
               'texPerCss': TPX / CSS, 'pieces': old}, f, indent=1, sort_keys=True)
print('[ui] wrote', meta_path)
