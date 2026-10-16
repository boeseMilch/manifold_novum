"""Extra decor for the docked pirate raider's rooms (airlock, cargo hold, core): no gameplay, just personality.

    blender -b --factory-startup --python tools/blender/models/dock/raider_decor.py [-- quick] [-- only=a,b]

`quick` renders at 16 samples into /tmp/mn_raider (with its own manifest.json there), `only=` picks jobs by name. Renders on the CPU.

Coordinates below are the port layout relative to our hatch, like DOCK_DECOR in js/dock.js (x = u, y = v off
g.y; the starboard side mirrors x with SHIP_W - x). The props are rendered once and serve both sides (text
reads the right way, the key light stays front-right).

Floor props: origin = the floor point under the prop's centre.
Wall props (*): origin = the foot of the room's back wall under the prop's centre (x, room.y): the mounting
height is baked into the sprite, so draw it at z = 0 with sortY just in front of the wall (like the hull's wall
details, not as a billboard).

  dock/raider_parrot_f0..f3       robot parrot on its perch with an 'EMPLOYEE OF THE MONTH' plaque, idle loop
                                  (squawk / wing ruffle / head bob, antenna LED blinks). 0.5 x 0.5, h 1.6
  dock/raider_anchor              'SPACE ANCHOR (DECORATIVE)' on a plinth, leaning on the wall, chain heap. 1.0 x 0.5
  dock/raider_sandbags            ballast sandbag stack (6 bags, one taped, 'BALLAST' stencil). 1.2 x 0.8
  dock/raider_barrel_yellow       oil drum 'OIL (PROBABLY)', drips. r 0.25
  dock/raider_barrel_red          drum 'NOT RUM', dented, taped. r 0.25
  dock/raider_plunder_board  (*)  'TODAY'S PLUNDER' chalk board with this docking's list (fixed text). 1.2 wide
  dock/raider_plunder_board_blank (*) the same board, title only: for the game to write the live order on
  dock/raider_skull_stencil       worn floor stencil, skull and crossbones (flat decal). 1.5 x 1.4
  dock/raider_quota_stencil       'QUOTA OR KEELHAUL' floor stencil (flat decal). 2.5 x 0.5
  dock/raider_hammock             striped hammock on a pipe frame, pillow, a sock, a bottle under it. 2.2 x 0.8
  dock/raider_wheel_table         a ship's wheel laid on a barrel as a card table (cards, dice, mug, candle). d 1.3
  dock/raider_treasure_map   (*)  treasure map stuck to the wall with a dagger: the X is 'YOUR SHIP'. 0.8 wide
  dock/raider_rum                 rum bottles: two standing, one tipped over in a puddle. 0.6 x 0.45
  dock/raider_eyepatch_hook  (*)  'SPARES' hook rail: eyepatch, tricorn hat, hook hand. 0.9 wide
  dock/raider_mutiny_board   (*)  'DAYS WITHOUT A MUTINY: 3' board (replaces the canvas 'mutiny' sign)
  dock/raider_mutiny_board_0 (*)  the same with the counter on 0 (for after a fight, optional)
  dock/raider_birdcage            cage on a stand with the stuffed parrot 'POLLY v1 (RETIRED)'. 0.5 x 0.5, h 1.7
"""
import sys, os, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ['DOCK_CPU'] = '1'                       # no usable GPU: docklib's reset puts Cycles on the CPU
import docklib as D
from docklib import mn, bpy, bmesh, Vector, worn, emit_mat, pmat, ring, pipe, R90
import shiplib

ARGS = D.args()
QUICK = 'quick' in ARGS
ONLY = None
for a in ARGS:
    if a.startswith('only='): ONLY = set(a[5:].split(','))
if QUICK:
    mn.SAMPLES = 16; mn.OUT_DIR = '/tmp/mn_raider'; mn.MANIFEST = '/tmp/mn_raider/manifest.json'
else:
    mn.SAMPLES = 48

_reset0 = mn.reset
def _reset():
    s = _reset0(); s.cycles.device = 'CPU'
    s.render.threads_mode = 'FIXED'; s.render.threads = 8          # (the CPU is shared with other agents)
    shiplib._hidden_in_data.clear()
    return s
mn.reset = _reset

FONTS = {'bold': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
         'narrow': '/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf',
         'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
         'chalk': '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'}

# ---------------------------------------------------------------------------------------------------
# Kit + helpers (local frame: X right, Y = away from the camera / towards the back wall, Z up)
# ---------------------------------------------------------------------------------------------------
class Kit:
    def __init__(self): self.parts = []; self.flat = set()
    def __call__(self, o, outline=True):
        self.parts.append(o)
        if not outline: self.flat.add(o.name)
        return o
    def outline(self, t=0.012):
        mn.outline([o for o in self.parts if o.name not in self.flat and o.type == 'MESH'], thickness=t)

def B(name, size, loc, m, bevel=0.015, rot=(0, 0, 0)): return mn.box(name, size, loc=loc, m=m, bevel=bevel, rot=rot)
def C(name, r, h, loc, m, verts=24, bevel=0.01, rot=(0, 0, 0)): return mn.cyl(name, r, h, loc=loc, m=m, verts=verts, bevel=bevel, rot=rot)
def SP(name, r, loc, m, scale=(1, 1, 1), segs=24): return mn.sphere(name, r, loc=loc, m=m, scale=scale, segs=segs)

def txt(name, body, size, loc, m, rot=(0, 0, 0), font='bold', depth=0.003, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.extrude = depth
    cu.align_x = align; cu.align_y = 'CENTER'
    p = FONTS.get(font)
    if p and os.path.exists(p): cu.font = bpy.data.fonts.load(p, check_existing=True)
    o = shiplib._curve_to_mesh(name, cu, m)
    for f in o.data.polygons: f.use_smooth = False
    o.location = loc; o.rotation_euler = rot; return o

def poly(name, pts, z0, z1, m, bevel=0.0):
    """Extrude a polygon given in local (x, y) (Blender XY) from z0 to z1."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in pts]; f = bm.faces.new(vs)
    if f.normal.z < 0: f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = mn._obj(name, me)
    if bevel: mn.bev(o, bevel, 2)
    mn.assign(o, m); return o

def blob_pts(rx, ry, seed, n=28, j=0.18, cx=0.0, cy=0.0):
    r = random.Random(seed); out = []
    ph = [r.uniform(0, 6.28) for _ in range(3)]
    for i in range(n):
        a = i / n * math.tau
        k = 1 + j * (0.6 * math.sin(2 * a + ph[0]) + 0.3 * math.sin(3 * a + ph[1]) + 0.25 * math.sin(5 * a + ph[2]))
        out.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    return out

def torus(name, R, r, loc, m, rot=(0, 0, 0), maj=48, mnr=12):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=mnr, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; mn.assign(o, m); mn.smooth(o); return o

def tube(name, pts, r, m, corner=0.05, res=12): return pipe(name, [Vector(p) for p in pts], r, m, corner=corner, res=res)

def wall_group(children, z, y=-0.02):
    """Parent flat-built children (built lying in XY, facing +Z, local +Y = up) onto the wall: facing the camera."""
    e = mn.link(bpy.data.objects.new('wallmount', None)); e.location = (0, y, z); e.rotation_euler = (R90, 0, 0)
    for c in children: c.parent = e
    return e

def floor_catcher(k, sx, sy, cx=0.0, cy=0.0):
    o = shiplib.shadow_catcher((sx, sy), loc=(cx, cy, 0)); k(o, outline=False); return o

def wall_catcher(k, w, z0, z1):
    o = mn.box('shadow_catcher', (w, 0.001, z1 - z0), loc=(0, 0.0005, z0), bevel=0)
    o.is_shadow_catcher = True; shiplib._hidden_in_data.append(o); k(o, outline=False); return o

def tape(k, size, loc, rot=(0, 0, 0)):
    return k(B('tape', size, loc, M['tape'], bevel=0.003, rot=rot), outline=False)

# ---------------------------------------------------------------------------------------------------
# Materials (raider palette, lifted like docklib.worn does)
# ---------------------------------------------------------------------------------------------------
M = {}
def mats():
    M.clear()
    M.update(
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), dark=pmat('dark', '#1c1f25', 0.6),
        black=pmat('black', '#0b0c0f', 0.9), ink=pmat('ink', '#23252b', 0.6), tape=pmat('tape', '#b9bcc2', 0.85),
        red=worn('red', '#b03a34', 0.45, 0.15, wear=0.8, grime=0.7, rust=0.12), yellow=worn('yellow', '#e0b42a', 0.45, 0.15, wear=0.8, grime=0.7, rust=0.08),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15),
        wood=worn('wood', '#7a5230', 0.7, 0.0, wear=0.3, grime=0.8, scale=2.0), wood_dark=worn('wood_dark', '#4e3420', 0.7, 0.0, wear=0.3, grime=0.8, scale=2.0),
        brass=worn('brass', '#c9a03a', 0.3, 0.9, wear=0.3, grime=0.5), gold=worn('gold', '#e8b42e', 0.35, 0.6, wear=0.5, grime=0.5),
        white=worn('white', '#e2ddd0', 0.55, 0.0, wear=0.3, grime=0.6), paper=pmat('paper', '#e6e2d6', 0.8),
        rubber=pmat('rubber', '#262a33', 0.7), leather=worn('leather', '#3a2418', 0.6, 0.0, wear=0.4, grime=0.5),
        glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0), led_red=emit_mat('led_red', '#ff3a2a', 1.3, base='#6a1a14'),
        led_cyan=emit_mat('led_cyan', '#7af0ff', 1.2, base='#2a6a7a'), flame=emit_mat('flame', '#ffb43a', 1.5, base='#ffd080'),
        oil=D.decal_mat('oil', '#0a0908', 0.85, rough=0.15), rum_puddle=mn.mat('rum_puddle', '#3a1c08', 0.05, 0.0, clearcoat=1.0),
    )

def burlap(name='burlap', color='#a8946a'):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = 0.9
    tc = N.new('ShaderNodeTexCoord')
    w1 = N.new('ShaderNodeTexWave'); w1.wave_type = 'BANDS'; w1.bands_direction = 'X'; w1.inputs['Scale'].default_value = 60
    w2 = N.new('ShaderNodeTexWave'); w2.wave_type = 'BANDS'; w2.bands_direction = 'Y'; w2.inputs['Scale'].default_value = 60
    for w in (w1, w2): L(tc.outputs['Object'], w.inputs['Vector'])
    mx = N.new('ShaderNodeMath'); mx.operation = 'MULTIPLY'; L(w1.outputs['Fac'], mx.inputs[0]); L(w2.outputs['Fac'], mx.inputs[1])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.35; L(mx.outputs[0], bp.inputs['Height']); L(bp.outputs[0], b.inputs['Normal'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6; nz.inputs['Detail'].default_value = 6; L(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[0].color = (*[c * 0.55 for c in D.lift(color)], 1); ramp.color_ramp.elements[1].color = (*D.lift(color), 1)
    L(nz.outputs['Fac'], ramp.inputs[0]); L(ramp.outputs[0], b.inputs['Base Color'])
    return m

def stripes(name, a, b_, k, axis=1, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links.new
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = k; L(sep.outputs[axis], mu.inputs[0])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L(mu.outputs[0], fr.inputs[0])
    st = N.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = 0.5; L(fr.outputs[0], st.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[6].default_value = (*D.lift(a), 1); mx.inputs[7].default_value = (*D.lift(b_), 1)
    L(st.outputs[0], mx.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 5; L(tc.outputs['Object'], nz.inputs['Vector'])
    gr = N.new('ShaderNodeMapRange'); gr.inputs['From Min'].default_value = 0.45; gr.inputs['From Max'].default_value = 0.75; gr.inputs['To Max'].default_value = 0.35
    L(nz.outputs['Fac'], gr.inputs['Value'])
    dm = N.new('ShaderNodeMix'); dm.data_type = 'RGBA'; dm.blend_type = 'MULTIPLY'; L(gr.outputs[0], dm.inputs['Factor'])
    L(mx.outputs[2], dm.inputs[6]); dm.inputs[7].default_value = (0.1, 0.08, 0.06, 1)
    L(dm.outputs[2], b.inputs['Base Color']); return m

def paint(name, color, worn_k=0.35, scale=9.0, alpha=1.0, rough=0.7, scuff=0.2):
    """Floor paint with worn-through patches (alpha holes from noise), for stencils."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); L = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    p = N.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*D.lift(color, 1.15), 1); p.inputs['Roughness'].default_value = rough
    tc = N.new('ShaderNodeTexCoord')
    n1 = N.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = scale; n1.inputs['Detail'].default_value = 10; n1.inputs['Roughness'].default_value = 0.65
    L(tc.outputs['Object'], n1.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.7 - 0.25 * worn_k; mr.inputs['From Max'].default_value = 0.66 - 0.25 * worn_k
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = alpha; L(n1.outputs['Fac'], mr.inputs['Value'])
    # scuffs: stretched noise
    sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1, 14, 1); sm.inputs['Rotation'].default_value = (0, 0, 0.3)
    L(tc.outputs['Object'], sm.inputs['Vector'])
    n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 4; L(sm.outputs[0], n2.inputs['Vector'])
    sc = N.new('ShaderNodeMapRange'); sc.inputs['From Min'].default_value = 0.66; sc.inputs['From Max'].default_value = 0.7
    sc.inputs['To Min'].default_value = 1.0; sc.inputs['To Max'].default_value = scuff; L(n2.outputs['Fac'], sc.inputs['Value'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.use_clamp = True; L(mr.outputs[0], mul.inputs[0]); L(sc.outputs[0], mul.inputs[1])
    L(mul.outputs[0], mix.inputs[0]); L(tr.outputs[0], mix.inputs[1]); L(p.outputs[0], mix.inputs[2]); L(mix.outputs[0], out.inputs['Surface'])
    return m

def chalk(name='chalk', color='#e8e6dc'):
    """Chalk: matte, a little patchy (see-through where the stroke is thin)."""
    return paint(name, color, worn_k=0.15, scale=40.0, alpha=0.95, rough=1.0)

# ---------------------------------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------------------------------
JOBS = []
def job(name):
    def deco(fn): JOBS.append((name, fn)); return fn
    return deco

def render(k, name, frames=None, outline=0.012):
    k.outline(outline)
    return mn.render('dock/raider_' + name, objs=[o for o in k.parts if o.type == 'MESH'], frames=frames)

# --- robot parrot on its perch ------------------------------------------------------------------------
def robot_parrot(k, base_z, M2):
    """Robot parrot sitting on the perch bar at height base_z, facing the camera (slightly right).
    Returns (body pivot, head pivot, wing pivots, beak lower, antenna led material)."""
    red, yel, blue, grn = M2['pred'], M2['pyel'], M2['pblue'], M2['pgrn']
    body_p = mn.link(bpy.data.objects.new('body_piv', None)); body_p.location = (0, 0, base_z)
    parts = []
    # feet: clamps on the bar
    for sx in (-0.06, 0.06):
        parts.append(k(C('foot', 0.03, 0.06, (sx, -0.0, 0.0), M['steel'], verts=12, bevel=0.008)))
        parts.append(k(B('claw', (0.05, 0.1, 0.02), (sx, -0.02, -0.035), M['dark'], bevel=0.006)))
    body = k(SP('pbody', 0.16, (0, 0.01, 0.2), red, scale=(0.85, 0.75, 1.15)))
    belly = k(SP('pbelly', 0.12, (0, -0.06, 0.17), yel, scale=(0.75, 0.55, 0.95)))
    for z in (0.12, 0.2):                                           # riveted seam rings
        parts.append(k(ring('pseam', 0.14 if z < 0.15 else 0.137, 0.012, 0.012, loc=(0, 0.01, z), m=M['steel'], verts=32)))
    for a in range(-60, 61, 30):
        aa = math.radians(270 + a)
        k(SP('prv', 0.009, (0.138 * math.cos(aa), 0.01 + 0.138 * math.sin(aa) * 0.75, 0.205), M['steel'], segs=8), outline=False)
    # tail: three long metal feathers (blue/red/green) hanging down behind the perch
    for i, (m, a) in enumerate(((blue, -0.3), (red, 0.0), (grn, 0.3))):
        t = k(B('tail', (0.07, 0.03, 0.46), (0, 0, -0.46), m, bevel=0.014)); t.parent = body_p
        t.location = (math.sin(a) * 0.05, 0.1, 0.12); t.rotation_euler = (math.radians(14), a * 0.5, 0)
    # wings: plates on the sides, pivot at the shoulder
    wings = []
    for s in (-1, 1):
        wp = mn.link(bpy.data.objects.new('wing_piv', None)); wp.parent = body_p; wp.location = (s * 0.12, 0.03, 0.3)
        w1 = k(SP('wing', 0.1, (s * 0.01, 0.02, -0.11), blue, scale=(0.32, 0.75, 1.25)))
        w2 = k(SP('wing2', 0.075, (s * 0.02, 0.05, -0.22), grn, scale=(0.3, 0.6, 1.1)))
        for o in (w1, w2): o.parent = wp
        wings.append(wp)
    # head: red dome, white face plate, a big pale hooked beak
    hp = mn.link(bpy.data.objects.new('head_piv', None)); hp.parent = body_p; hp.location = (0, -0.01, 0.34)
    hd = [k(SP('phead', 0.12, (0, 0.0, 0.09), red, scale=(0.95, 1.05, 0.95)))]
    hd.append(k(SP('pface', 0.085, (0, -0.07, 0.085), M2['face'], scale=(1.05, 0.6, 0.85))))
    hd.append(k(ring('pcollar', 0.1, 0.025, 0.03, loc=(0, 0, -0.03), m=M['steel'], verts=28)))
    hook = [(0, -0.1, 0.1, 0.052), (0, -0.14, 0.098, 0.044), (0, -0.172, 0.08, 0.034), (0, -0.188, 0.052, 0.024), (0, -0.183, 0.03, 0.016)]
    for (x, y, z, r) in hook: hd.append(k(SP('beak', r, (x, y, z), M2['beak'], segs=16)))
    hd.append(k(B('beak_line', (0.11, 0.004, 0.006), (0, -0.165, 0.065), M['dark'], bevel=0, rot=(0.5, 0, 0)), outline=False))
    jp = mn.link(bpy.data.objects.new('jaw_piv', None)); jp.parent = hp; jp.location = (0, -0.11, 0.05)
    for (y, z, r) in ((-0.02, -0.01, 0.035), (-0.06, -0.025, 0.026)):
        o = k(SP('jaw', r, (0, y, z), M['dark'], segs=12)); o.parent = jp
    # eyes: a cyan LED lens on each side, an eyepatch over the left one (its strap round the head)
    for sx in (-1, 1):
        hd.append(k(C('eye_rim', 0.032, 0.03, (sx * 0.08, -0.07, 0.12), M['steel'], verts=16, bevel=0.006, rot=(R90, 0, sx * 1.0))))
        if sx > 0: hd.append(k(SP('eye', 0.024, (0.095, -0.085, 0.12), M['led_cyan'], segs=12), outline=False))
    hd.append(k(SP('patch', 0.042, (-0.095, -0.075, 0.12), M['black'], scale=(0.5, 1.0, 0.85), segs=16)))
    strap = k(torus('patch_strap', 0.12, 0.007, (0, 0.0, 0.13), M['black'], rot=(0.0, math.radians(-16), 0), mnr=6)); hd.append(strap)
    # antenna with blinking bulb, and a crest of steel 'feathers'
    hd.append(k(C('ant', 0.008, 0.16, (0.02, 0.03, 0.18), M['steel'], verts=8, bevel=0.002, rot=(0, 0.2, 0))))
    led = M2['ant_led']
    hd.append(k(SP('ant_led', 0.026, (0.052, 0.03, 0.335), led, segs=12)))
    for i, a in enumerate((-0.35, 0.0, 0.35)):
        f = k(B('crest', (0.03, 0.07, 0.13), (0, 0, 0), red if i != 1 else yel, bevel=0.01)); f.parent = hp
        f.location = (math.sin(a) * 0.04 - 0.02, 0.06, 0.17); f.rotation_euler = (math.radians(-35), a, 0)
    for o in hd: o.parent = hp
    for o in [body, belly] + parts: o.parent = body_p
    for o in k.parts:
        if o.name.startswith('prv'): o.parent = body_p
    return body_p, hp, wings, jp

@job('parrot')
def parrot_job():
    k = Kit(); mats()
    M2 = dict(pred=worn('pred', '#d0402e', 0.35, 0.55, wear=0.6, grime=0.5), pyel=worn('pyel', '#f0c23a', 0.35, 0.5, wear=0.5, grime=0.4),
              pblue=worn('pblue', '#3a7ad0', 0.35, 0.55, wear=0.5, grime=0.5), pgrn=worn('pgrn', '#3aa86a', 0.35, 0.55, wear=0.5, grime=0.5),
              beak=worn('beak', '#e8dcc0', 0.35, 0.1, wear=0.2, grime=0.6), face=worn('pface', '#eef0f4', 0.4, 0.2, wear=0.3, grime=0.5), ant_led=emit_mat('ant_led', '#ff4a2a', 1.2, base='#ff6a4a'))
    # stand: weighted base, pole, T perch, seed cup, plaque
    k(C('base', 0.24, 0.07, (0, 0, 0), M['hull'], verts=32, bevel=0.025))
    k(ring('base_hz', 0.245, 0.04, 0.02, loc=(0, 0, 0.06), m=D.stripes_mat('hz'), verts=32))
    for a in range(0, 360, 90):
        k(C('bolt', 0.022, 0.03, (0.17 * math.cos(math.radians(a + 45)), 0.17 * math.sin(math.radians(a + 45)), 0.07), M['steel'], verts=6, bevel=0.006))
    k(C('pole', 0.028, 1.08, (0, 0.04, 0.07), M['steel'], verts=16, bevel=0.006))
    k(C('pole_tape', 0.034, 0.08, (0, 0.04, 0.45), M['tape'], verts=16, bevel=0.006))
    k(C('perch', 0.025, 0.62, (-0.31, 0.04, 1.15), M['wood'], verts=12, bevel=0.008, rot=(0, R90, 0)))
    k(B('perch_clamp', (0.07, 0.07, 0.08), (0, 0.04, 1.11), M['dark'], bevel=0.01))
    for s in (-1, 1): k(C('perch_cap', 0.034, 0.03, (s * 0.31 - (0.03 if s > 0 else 0), 0.04, 1.15), M['brass'], verts=12, bevel=0.006, rot=(0, R90, 0)))
    k(C('cup', 0.06, 0.06, (0.27, 0.04, 1.08), M['steel'], verts=16, bevel=0.01))
    k(C('seeds', 0.05, 0.005, (0.27, 0.04, 1.135), M['yellow'], verts=16, bevel=0), outline=False)
    k(C('nut', 0.03, 0.02, (0.27, 0.04, 1.14), M['steel'], verts=6, bevel=0.004), outline=False)
    # plaque, hung from the pole under the perch on two little chains
    pl = [k(B('plaque', (0.7, 0.27, 0.025), (0, 0, 0), M['gold'], bevel=0.012))]
    pl.append(k(B('plaque_in', (0.65, 0.22, 0.004), (0, 0, 0.025), M['dark'], bevel=0.002), outline=False))
    pl.append(k(txt('pl_t1', 'EMPLOYEE', 0.1, (0, 0.04, 0.03), M['gold'], font='bold'), outline=False))
    pl.append(k(txt('pl_t2', 'OF THE MONTH', 0.066, (0, -0.06, 0.03), M['gold'], font='bold'), outline=False))
    for s in (-1, 1): pl.append(k(SP('pl_star', 0.014, (s * 0.3, 0.0, 0.03), M['gold'], segs=8), outline=False))
    wall_group(pl, 0.6, y=-0.0).rotation_euler = (R90 - math.radians(35), 0, 0)
    for s in (-1, 1): k(C('chain', 0.006, 0.38, (s * 0.2, 0.012, 0.72), M['steel'], verts=6, bevel=0, rot=(0, s * -0.55, 0)), outline=False)
    k(B('pl_bar', (0.06, 0.05, 0.04), (0, 0.03, 0.96), M['dark'], bevel=0.008))
    body_p, hp, wings, jp = robot_parrot(k, 1.18, M2)
    body_p.location = (0.02, 0.0, 1.18); body_p.rotation_euler = (0, 0, math.radians(38)); body_p.scale = (1.25, 1.25, 1.25)
    # idle loop: 0 rest, 1 squawk (head up, beak open, LED on), 2 wing ruffle, 3 head bob
    s = bpy.context.scene
    led = M2['ant_led'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    poses = [dict(h=(0, 0, 0), j=0, w=0, b=0, led=0.2),
             dict(h=(-0.35, 0.15, 0.2), j=0.55, w=0.15, b=0.02, led=1.4),
             dict(h=(0.1, -0.12, -0.25), j=0.1, w=0.7, b=0.0, led=0.2),
             dict(h=(0.35, 0.0, 0.1), j=0.0, w=0.05, b=-0.03, led=0.9)]
    for f, p in enumerate(poses, start=1):
        s.frame_set(f)
        hp.rotation_euler = p['h']; hp.keyframe_insert('rotation_euler', frame=f)
        jp.rotation_euler = (p['j'], 0, 0); jp.keyframe_insert('rotation_euler', frame=f)
        for i, wp in enumerate(wings):
            sgn = -1 if i == 0 else 1
            wp.rotation_euler = (0, sgn * p['w'] * 0.9, 0); wp.keyframe_insert('rotation_euler', frame=f)
        body_p.location.z = 1.18 + p['b']; body_p.keyframe_insert('location', frame=f)
        led.default_value = p['led']; led.keyframe_insert('default_value', frame=f)
    floor_catcher(k, 0.9, 0.7)
    render(k, 'parrot', frames=[1, 2, 3, 4])

# --- space anchor -----------------------------------------------------------------------------------
@job('anchor')
def anchor_job():
    k = Kit(); mats()
    iron = worn('iron', '#7e8592', 0.35, 0.85, wear=0.4, grime=0.9, rust=0.35)
    # plinth: a riveted steel block with a brass plaque on its front
    k(B('plinth', (1.0, 0.42, 0.16), (0, 0.04, 0), M['body'], bevel=0.025))
    k(B('plinth_top', (0.92, 0.36, 0.02), (0, 0.04, 0.16), M['hull'], bevel=0.008))
    for sx in (-0.44, 0.44):
        for sy in (-0.12, 0.2): k(SP('rv', 0.014, (sx, sy, 0.17), M['steel'], scale=(1, 1, 0.5), segs=8), outline=False)
    pl = [k(B('plq', (0.74, 0.12, 0.012), (0, 0, 0), M['brass'], bevel=0.006))]
    pl.append(k(txt('plq_t', 'SPACE ANCHOR', 0.058, (0, 0.018, 0.013), M['ink'], font='bold'), outline=False))
    pl.append(k(txt('plq_t2', '(DECORATIVE)', 0.038, (0, -0.033, 0.013), M['ink'], font='bold'), outline=False))
    wall_group(pl, 0.085, y=-0.172)
    # the anchor: built in the XZ plane, then leaned back against the wall
    parts = []
    shank_h = 1.15
    parts.append(k(C('shank', 0.05, shank_h, (0, 0, 0.22), iron, verts=20, bevel=0.015)))
    parts.append(k(C('stock', 0.04, 0.62, (-0.31, 0, 1.18), iron, verts=16, bevel=0.012, rot=(0, R90, 0))))
    for sx in (-0.31, 0.31): parts.append(k(SP('stock_ball', 0.055, (sx, 0, 1.18), iron, segs=16)))
    parts.append(k(torus('eye', 0.09, 0.025, (0, 0, 1.46), iron, rot=(R90, 0, 0), maj=24, mnr=8)))
    # arms: an arc from the crown up to the flukes
    arc = [(0.4 * math.sin(a), 0, 0.62 - 0.4 * math.cos(a)) for a in [math.radians(t) for t in range(-80, 81, 10)]]
    parts.append(k(tube('arms', arc, 0.045, iron, corner=0.05)))
    parts.append(k(SP('crown', 0.08, (0, 0, 0.22), iron, segs=16)))
    for s in (-1, 1):                                                 # flukes: flat arrow heads at the arm tips
        tip = (s * 0.4 * math.sin(math.radians(80)), 0.62 - 0.4 * math.cos(math.radians(80)))
        fl = poly('fluke', [(-0.08, 0), (0.08, 0), (0.0, 0.2)], -0.025, 0.025, iron, bevel=0.012)
        fl.rotation_euler = (R90, s * math.radians(-30), 0); fl.location = (tip[0] - s * 0.02, 0.0, tip[1] - 0.06)
        parts.append(k(fl))
    parts.append(tape(k, (0.13, 0.115, 0.06), (0, 0, 0.72)))            # duct tape round the shank (a crack)
    parts.append(k(B('sticker', (0.16, 0.01, 0.1), (0, -0.055, 0.86), M['yellow'], bevel=0.003), outline=False))
    parts.append(k(txt('sticker_t', 'DO NOT\nDEPLOY', 0.03, (0, -0.062, 0.91), M['ink'], rot=(R90, 0, 0)), outline=False))
    g = mn.link(bpy.data.objects.new('anchor', None)); g.location = (0, 0.06, 0.06); g.rotation_euler = (math.radians(-8), 0, 0)
    for o in parts: o.parent = g
    # chain from the eye down onto the floor in a heap (links as small tori)
    a0, a1 = Vector((0.06, -0.06, 1.42)), Vector((0.44, -0.3, 0.05))
    for i in range(1, 19):
        t = i / 19; p = a0.lerp(a1, t) + Vector((0.12 * math.sin(t * math.pi), 0, -0.25 * math.sin(t * math.pi)))
        if p.z < 0.05: break
        k(torus('link', 0.03, 0.01, tuple(p), M['steel'], rot=(R90 * (i % 2), 0.4, 0.3), maj=10, mnr=5), outline=False)
    for i in range(16):                                               # heap on the floor, in front-right of the plinth
        a = i * 0.9; rr = 0.04 + 0.012 * i
        k(torus('link', 0.032, 0.011, (0.44 + rr * math.cos(a), -0.32 + rr * math.sin(a) * 0.8, 0.012 + 0.012 * (i % 3)), M['steel'],
                rot=(R90 * (i % 2), 0, a), maj=10, mnr=5), outline=False)
    floor_catcher(k, 1.3, 0.9, 0.05, -0.05)
    render(k, 'anchor')

# --- sandbags ---------------------------------------------------------------------------------------
def sandbag(k, name, loc, rz, m, s=1.0, tilt=(0, 0)):
    o = B(name, (0.5 * s, 0.3 * s, 0.17 * s), (0, 0, -0.085 * s), m, bevel=0.07 * s)
    o.modifiers['bevel'].segments = 4
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    o.location = Vector(loc) + Vector((0, 0, 0.085 * s)); o.rotation_euler = (tilt[0], tilt[1], rz)
    k(o)
    for e in (-1, 1):                                                 # tied ends
        t = k(C('tie', 0.035 * s, 0.07 * s, (0, 0, 0), m, verts=10, bevel=0.01, rot=(0, R90, 0)))
        t.parent = o; t.location = (e * 0.26 * s - (0.07 * s if e < 0 else 0), 0, 0.0)
        tie = k(torus('cord', 0.04 * s, 0.008, (0, 0, 0), M['rubber'], rot=(0, R90, 0), maj=12, mnr=5), outline=False)
        tie.parent = o; tie.location = (e * 0.24 * s, 0, 0)
    return o

@job('sandbags')
def sandbags_job():
    k = Kit(); mats()
    bags = [burlap('burlap', '#a8946a'), burlap('burlap2', '#9a8660'), burlap('burlap3', '#b0a070')]
    r = random.Random(7)
    lay = [(-0.32, -0.1, 0, 0.05), (0.2, -0.12, 0, -0.06), (-0.3, 0.22, 0, 0.1), (0.22, 0.2, 0, -0.04),
           (-0.05, 0.05, 0.15, 0.08), (0.02, 0.1, 0.29, -0.3)]
    objs = []
    for i, (x, y, z, a) in enumerate(lay):
        tilt = (r.uniform(-0.05, 0.05), r.uniform(-0.06, 0.06)) if z else (0, 0)
        objs.append(sandbag(k, 'bag', (x, y, z), a, bags[i % 3], s=1.0, tilt=tilt))
    # a split bag on the floor with spilled sand, a taped one
    sand = pmat('sand', '#c8b480', 0.95)
    k(poly('spill', blob_pts(0.16, 0.09, 3, cx=0.5, cy=-0.32), 0, 0.012, sand, bevel=0.005), outline=False)
    k(sandbag(k, 'bag', (0.48, -0.2, 0), 0.5, bags[1], s=0.7))
    tape(k, (0.08, 0.32, 0.01), (-0.32, -0.1, 0.165), rot=(0, 0, 0.3))
    tape(k, (0.28, 0.07, 0.01), (-0.32, -0.1, 0.168), rot=(0, 0, -0.3))
    # stencil on the front bag
    k(txt('st', 'BALLAST', 0.07, (0.2, -0.27, 0.09), paint('stp', '#2a2420', 0.25, 20.0), rot=(R90 - 0.35, 0, -0.06)), outline=False)
    k(txt('st2', '40 KG', 0.05, (0.0, 0.0, 0.27), paint('stp2', '#2a2420', 0.25, 20.0), rot=(0.08, 0, 0.08)), outline=False)
    floor_catcher(k, 1.5, 1.05)
    render(k, 'sandbags')

# --- oil barrels ------------------------------------------------------------------------------------
def drum(k, paint_m, label_lines, label_m, dent=False, seed=1, zc=0.43):
    r, h = 0.25, 0.8
    body = k(C('drum', r, h, (0, 0, 0), paint_m, verts=40, bevel=0.03))
    for z in (0.27, 0.53): k(ring('hoop', r + 0.012, 0.03, 0.035, loc=(0, 0, z), m=paint_m, verts=40))
    k(ring('rim', r + 0.004, 0.03, 0.03, loc=(0, 0, h - 0.02), m=M['steel'], verts=40))
    k(C('lid', r - 0.02, 0.01, (0, 0, h - 0.015), M['dark'], verts=40, bevel=0.003), outline=False)
    k(C('bung', 0.035, 0.025, (0.13, 0.11, h - 0.01), M['steel'], verts=8, bevel=0.006))
    k(C('bung2', 0.025, 0.02, (-0.04, 0.17, h - 0.01), M['steel'], verts=8, bevel=0.005))
    objs = []
    for i, (t, sz) in enumerate(label_lines):
        o = k(txt('lbl', t, sz, (0, -r - 0.004, zc - i * (sz * 1.25) + (len(label_lines) - 1) * sz * 0.6), label_m, rot=(R90, 0, 0), depth=0.002), outline=False)
        sw = o.modifiers.new('wrap', 'SHRINKWRAP'); sw.target = body; sw.offset = 0.005; sw.wrap_method = 'NEAREST_SURFACEPOINT'
        objs.append(o)
    return body

@job('barrel_yellow')
def barrel_yellow_job():
    k = Kit(); mats()
    drum(k, M['yellow'], [('OIL', 0.13), ('(PROBABLY)', 0.05)], M['black'], zc=0.38)   # kept between the hoops (the top hoop hid OIL's upper half)
    for x, l in ((-0.2, 0.25), (-0.16, 0.4), (0.2, 0.18)):               # oil drips down the front
        a = math.asin(x / 0.25)
        d = k(B('drip', (0.025, 0.008, l), (x, -0.25 * math.cos(a) - 0.002, 0.8 - l), M['black'], bevel=0.004, rot=(0, 0, a)), outline=False)
    k(D.ring('drip_rim', 0.255, 0.01, 0.012, loc=(0, 0, 0.79), m=M['black'], verts=40), outline=False)
    k(D.disc('oilpool', -0.06, 0.3, 0.001, 0.3, M['oil'], sv=0.5), outline=False)
    floor_catcher(k, 0.9, 0.8)
    render(k, 'barrel_yellow')

@job('barrel_red')
def barrel_red_job():
    k = Kit(); mats()
    body = drum(k, M['red'], [('NOT', 0.075), ('RUM', 0.15)], paint('lblw', '#efe8dc', 0.08, 25.0))
    # a dent on the front (a lattice-free cheat: a shallow dark crease) and a taped split
    k(B('dent', (0.12, 0.012, 0.03), (0.12, -0.21, 0.66), M['dark'], bevel=0.006, rot=(0.0, 0.25, 0.55)), outline=False)
    tape(k, (0.16, 0.014, 0.05), (-0.16, -0.19, 0.16), rot=(0, 0.2, -0.65))
    tape(k, (0.16, 0.014, 0.05), (-0.16, -0.19, 0.16), rot=(0, -0.4, -0.65))
    floor_catcher(k, 0.8, 0.8)
    render(k, 'barrel_red')

# --- wall boards ------------------------------------------------------------------------------------
def frame_board(k, w, h, face_m, frame_m, t=0.05, depth=0.04):
    out = [k(B('board', (w, h, depth * 0.6), (0, 0, 0), face_m, bevel=0.006))]
    for (cx, cy, sx, sy) in ((0, h / 2, w + t, t), (0, -h / 2, w + t, t), (-w / 2, 0, t, h + t), (w / 2, 0, t, h + t)):
        out.append(k(B('frame', (sx, sy, depth), (cx, cy, 0), frame_m, bevel=0.012)))
    return out

def plunder_board(blank):
    k = Kit(); mats()
    slate = worn('slate', '#2c3a33', 0.85, 0.0, wear=0.05, grime=0.5)
    ch = chalk('chalk'); chy = chalk('chalky', '#f2d36a'); chr_ = chalk('chalkr', '#f08a7a')
    W, H = 1.16, 0.74
    p = frame_board(k, W, H, slate, M['wood'])
    z = 0.026
    p.append(k(txt('t', "TODAY'S PLUNDER", 0.105, (0, 0.27, z), chy, font='chalk', rot=(0, 0, 0.012)), outline=False))
    p.append(k(B('ul', (0.86, 0.012, 0.002), (0, 0.2, z), chy, bevel=0), outline=False))
    if not blank:
        lines = ['2x FUEL CELL', '1x COFFEE MACHINE', '1x CAT  (!!)']
        for i, l in enumerate(lines):
            p.append(k(txt('l', l, 0.068, (-0.47, 0.12 - i * 0.1, z), ch, font='chalk', align='LEFT', rot=(0, 0, 0.01 * (i - 1))), outline=False))
        p.append(k(txt('q', 'QUOTA:  50 KG', 0.07, (-0.47, -0.22, z), chr_, font='chalk', align='LEFT'), outline=False))
        for i in range(3):                                            # check marks
            p.append(k(B('chk', (0.05, 0.01, 0.002), (0.38, 0.11 - i * 0.1, z), chy, bevel=0, rot=(0, 0, 0.7)), outline=False))
            p.append(k(B('chk2', (0.09, 0.01, 0.002), (0.42, 0.125 - i * 0.1, z), chy, bevel=0, rot=(0, 0, -0.95)), outline=False))
    # a chalk skull doodle in the corner, smudges
    p.append(k(D.ring('sk', 0.045, 0.01, 0.002, loc=(0.44, -0.21, z), m=ch, verts=16), outline=False))
    for s in (-1, 1): p.append(k(B('skb', (0.12, 0.01, 0.002), (0.44, -0.27, z), ch, bevel=0, rot=(0, 0, s * 0.6)), outline=False))
    smudge = paint('smudge', '#c8ccc4', 0.6, 6.0, alpha=0.18, rough=1.0)
    p.append(k(poly('smudge', blob_pts(0.2, 0.06, 2, cx=0.1, cy=-0.31), z - 0.003, z - 0.001, smudge), outline=False))
    # chalk tray with a stick and a sponge
    p.append(k(B('tray', (0.9, 0.05, 0.1), (0, -H / 2 - 0.03, 0.0), M['wood_dark'], bevel=0.01)))
    p.append(k(C('stick', 0.012, 0.09, (-0.2, -H / 2 - 0.02, 0.1), ch, verts=8, bevel=0.003, rot=(0, R90, 0)), outline=False))
    p.append(k(B('sponge', (0.13, 0.05, 0.05), (0.25, -H / 2 - 0.02, 0.1), M['yellow'], bevel=0.012)))
    # two nails and a strip of duct tape over a crack in the frame
    for s in (-1, 1): p.append(k(SP('nail', 0.016, (s * (W / 2), H / 2, 0.045), M['steel'], segs=8)))
    p.append(tape(k, (0.08, 0.18, 0.01), (W / 2, -0.15, 0.04), rot=(0, 0, 0.15)))
    wall_group(p, 1.12, y=-0.09).rotation_euler = (R90 - math.radians(12), 0, 0)    # propped out at the bottom on the tray brackets
    for sx in (-0.4, 0.4): k(B('bracket', (0.04, 0.12, 0.04), (sx, -0.06, 0.7), M['steel'], bevel=0.008))
    wall_catcher(k, W + 0.6, 0.55, 1.6)
    render(k, 'plunder_board' + ('_blank' if blank else ''))

@job('plunder_board')
def _pb(): plunder_board(False)
@job('plunder_board_blank')
def _pbb(): plunder_board(True)

def mutiny_board(n):
    k = Kit(); mats()
    face = worn('mface', '#2b303a', 0.6, 0.2, wear=0.4, grime=0.7)
    yel = paint('myel', '#ffcf6b', 0.2, 18.0)
    W, H = 1.36, 0.6
    p = frame_board(k, W, H, face, M['steel'], t=0.04)
    z = 0.026
    p.append(k(txt('t1', 'DAYS WITHOUT', 0.105, (-0.16, 0.13, z), yel, font='bold'), outline=False))
    p.append(k(txt('t2', 'A MUTINY:', 0.105, (-0.16, -0.02, z), yel, font='bold'), outline=False))
    # the counter: a hook with a hung number card
    p.append(k(B('card', (0.3, 0.36, 0.02), (0.47, 0.02, 0.02), M['white'], bevel=0.008)))
    p.append(k(txt('n', str(n), 0.3, (0.47, 0.0, 0.042), pmat('num', '#c0392b', 0.5), font='bold', depth=0.004), outline=False))
    p.append(k(SP('hook', 0.018, (0.47, 0.22, 0.05), M['brass'], segs=8)))
    # older counts scratched in underneath: tally marks, crossed out
    sc = paint('scratch', '#9aa0a8', 0.3, 30.0, alpha=0.8)
    for g in range(3):
        for i in range(4): p.append(k(B('tal', (0.008, 0.08, 0.002), (-0.55 + g * 0.16 + i * 0.025, -0.18, z), sc, bevel=0), outline=False))
        p.append(k(B('tal5', (0.12, 0.008, 0.002), (-0.51 + g * 0.16, -0.18, z), sc, bevel=0, rot=(0, 0, 0.5)), outline=False))
    p.append(k(txt('rec', 'RECORD: 4', 0.05, (-0.02, -0.2, z), sc, font='bold'), outline=False))
    # a dagger stuck through the top-right corner
    p.append(k(B('blade', (0.03, 0.2, 0.012), (0.62, 0.3, 0.06), M['steel'], bevel=0.004, rot=(0, 0, -0.5))))
    p.append(k(B('guard', (0.12, 0.025, 0.03), (0.66, 0.38, 0.07), M['brass'], bevel=0.008, rot=(0, 0, -0.5))))
    p.append(k(C('grip', 0.018, 0.12, (0.69, 0.42, 0.07), M['leather'], verts=10, bevel=0.004, rot=(-R90, 0, -0.5))))
    for s in (-1, 1):
        for t in (-1, 1): p.append(k(SP('bolt', 0.014, (s * (W / 2), t * (H / 2), 0.04), M['steel'], segs=8)))
    wall_group(p, 1.26, y=-0.08).rotation_euler = (R90 - math.radians(10), 0, 0)
    for sx in (-0.5, 0.5): k(B('bracket', (0.04, 0.1, 0.04), (sx, -0.05, 0.94), M['steel'], bevel=0.008))
    wall_catcher(k, W + 0.6, 0.75, 1.7)
    render(k, 'mutiny_board' + ('' if n == 3 else '_0'))

@job('mutiny_board')
def _mb(): mutiny_board(3)
@job('mutiny_board_0')
def _mb0(): mutiny_board(0)

@job('treasure_map')
def map_job():
    k = Kit(); mats()
    parch = worn('parch', '#d9c08a', 0.85, 0.0, wear=0.0, grime=1.4, scale=2.5)
    W, H = 0.8, 0.56
    r = random.Random(11); pts = []
    for i in range(12): pts.append((-W / 2 + W * i / 12, -H / 2 + r.uniform(-0.015, 0.015)))
    for i in range(9): pts.append((W / 2 + r.uniform(-0.015, 0.015), -H / 2 + H * i / 9))
    for i in range(12): pts.append((W / 2 - W * i / 12, H / 2 + r.uniform(-0.015, 0.015)))
    for i in range(9): pts.append((-W / 2 + r.uniform(-0.015, 0.015), H / 2 - H * i / 9))
    pts[-1] = (-W / 2 + 0.06, H / 2 - 0.02)                           # a torn corner
    p = [k(poly('parch', pts, 0, 0.006, parch))]
    z = 0.008
    sea = paint('sea', '#5a8a9a', 0.3, 12.0, alpha=0.45); land = paint('land', '#7a9a4a', 0.2, 14.0, alpha=0.85)
    inkm = paint('mink', '#3a2418', 0.15, 30.0); redm = paint('mred', '#c0392b', 0.1, 30.0)
    for (cx, cy, rx, ry, sd) in ((-0.2, 0.06, 0.13, 0.09, 1), (0.16, -0.08, 0.1, 0.07, 2), (0.24, 0.16, 0.05, 0.035, 3)):
        p.append(k(poly('island', blob_pts(rx, ry, sd, cx=cx, cy=cy, j=0.3), z, z + 0.002, land), outline=False))
    p.append(k(poly('wash', blob_pts(0.36, 0.24, 9, j=0.06), z - 0.001, z, sea), outline=False))
    # dotted route and the X
    route = [(-0.3, -0.18), (-0.22, -0.1), (-0.12, -0.04), (-0.02, -0.06), (0.06, -0.1), (0.13, -0.08)]
    for (x, y) in route: p.append(k(B('dot', (0.025, 0.01, 0.002), (x, y, z + 0.002), inkm, bevel=0, rot=(0, 0, 0.5)), outline=False))
    for s in (-1, 1): p.append(k(B('x', (0.1, 0.022, 0.002), (0.17, -0.07, z + 0.003), redm, bevel=0, rot=(0, 0, s * 0.75)), outline=False))
    p.append(k(txt('ys', 'YOUR SHIP', 0.04, (0.18, -0.16, z + 0.003), inkm, font='serif'), outline=False))
    p.append(k(txt('hb', 'HERE BE LOOT', 0.045, (-0.08, 0.21, z + 0.003), inkm, font='serif'), outline=False))
    # compass rose
    for a in (0, R90):
        p.append(k(B('cmp', (0.016, 0.1, 0.002), (-0.3, 0.17, z + 0.002), inkm, bevel=0, rot=(0, 0, a)), outline=False))
    p.append(k(txt('N', 'N', 0.03, (-0.3, 0.24, z + 0.002), inkm, font='serif'), outline=False))
    # a dagger pinning it to the wall (top-left), drawing pins on the other corners, a strip of tape
    p.append(k(B('blade', (0.03, 0.16, 0.01), (-0.33, 0.24, 0.02), M['steel'], bevel=0.004, rot=(0, 0, 0.6))))
    p.append(k(B('guard', (0.11, 0.025, 0.03), (-0.39, 0.31, 0.04), M['brass'], bevel=0.008, rot=(0, 0, 0.6))))
    p.append(k(C('grip', 0.018, 0.12, (-0.41, 0.34, 0.05), M['leather'], verts=10, bevel=0.004, rot=(-R90, 0, 0.6))))
    p.append(k(SP('pommel', 0.025, (-0.47, 0.42, 0.05), M['brass'], segs=10)))
    for (x, y) in ((0.36, 0.24), (0.36, -0.24), (-0.36, -0.24)):
        p.append(k(SP('pin', 0.022, (x, y, 0.015), M['red'], scale=(1, 1, 0.6), segs=10)))
    p.append(tape(k, (0.16, 0.06, 0.01), (0.36, -0.03, 0.01), rot=(0, 0, 1.2)))
    wall_group(p, 1.02)
    wall_catcher(k, W + 0.5, 0.6, 1.45)
    render(k, 'treasure_map')

@job('eyepatch_hook')
def hooks_job():
    k = Kit(); mats()
    W = 0.86
    p = [k(B('rail', (W, 0.16, 0.04), (0, 0, 0), M['wood'], bevel=0.012))]
    for s in (-1, 1): p.append(k(SP('screw', 0.014, (s * (W / 2 - 0.05), 0.0, 0.045), M['steel'], segs=8)))
    p.append(k(B('tag', (0.3, 0.07, 0.006), (0, 0.13, 0.0), M['paper'], bevel=0.002)))
    p.append(k(txt('tag_t', 'SPARES', 0.05, (0, 0.13, 0.007), M['ink']), outline=False))
    p.append(tape(k, (0.06, 0.09, 0.006), (-0.15, 0.13, 0.004), rot=(0, 0, 0.2)))
    p.append(tape(k, (0.06, 0.09, 0.006), (0.15, 0.13, 0.004), rot=(0, 0, -0.2)))
    wall_group(p, 1.16)
    zH = 1.08                                                          # hook height
    hooks = (-0.28, 0.0, 0.28)
    for x in hooks:                                                    # brass hooks: stem out of the rail, curled up
        k(tube('hook', [(x, -0.04, zH + 0.05), (x, -0.1, zH + 0.02), (x, -0.12, zH - 0.02), (x, -0.1, zH + 0.03)], 0.012, M['brass'], corner=0.03))
    # 1: eyepatch on its string
    x = hooks[0]
    k(torus('string', 0.11, 0.005, (x, -0.1, zH - 0.11), M['black'], rot=(R90, 0, 0), maj=24, mnr=5), outline=False)
    k(SP('patch', 0.07, (x, -0.11, zH - 0.24), M['black'], scale=(1.0, 0.25, 0.75), segs=20))
    k(SP('patch_skull', 0.022, (x, -0.13, zH - 0.23), M['white'], scale=(1, 0.2, 0.9), segs=10), outline=False)
    # 2: tricorn hat hung by its brim
    x = hooks[1]; hz = zH - 0.2
    # a real tricorn silhouette: a rounded-triangle brim with three upturned flaps (gold-trimmed), point to the front
    hatm = worn('hatm', '#4a3a3e', 0.7, 0.0, wear=0.3, grime=0.5)
    V = [(0.2 * math.cos(math.radians(a)), 0.2 * math.sin(math.radians(a))) for a in (270, 30, 150)]   # corners (front, right-back, left-back)
    tri = []
    for i in range(3):                                                  # rounded triangle outline for the brim plate
        (x0, y0), (x1, y1) = V[i], V[(i + 1) % 3]
        for t in range(6): u = t / 6; tri.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u))
    tri = [(x * (1 - 0.05 * abs(math.cos(3 * math.atan2(y, x)))), y) for x, y in tri]
    hat = [k(poly('brim_plate', tri, -0.06, -0.045, hatm))]
    hat.append(k(SP('crown', 0.115, (0, 0.01, -0.03), hatm, scale=(1.0, 1.0, 1.05), segs=24)))   # the dome rises well above the flaps
    for i in range(3):                                                  # the cocked-up flaps along each side
        (x0, y0), (x1, y1) = V[i], V[(i + 1) % 3]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2; L = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0); lean = math.radians(-15)   # corners run counter-clockwise: local -Y is outward; lean in against the crown
        hat.append(k(B('flap', (L * 0.9, 0.022, 0.065), (mx * 0.92, my * 0.92, -0.025), hatm, bevel=0.01, rot=(lean, 0, ang))))
        hat.append(k(B('flap_trim', (L * 0.9, 0.028, 0.016), (mx * 0.92 + 0.012 * math.sin(ang), my * 0.92 - 0.012 * math.cos(ang), 0.007), M['gold'], bevel=0.005, rot=(lean, 0, ang)), outline=False))
    hat.append(k(SP('hat_skull', 0.03, (0, -0.08, 0.05), M['white'], scale=(1, 0.45, 1), segs=10), outline=False))
    for s_ in (-1, 1): hat.append(k(B('hat_bones', (0.075, 0.012, 0.012), (0, -0.098, 0.018), M['white'], bevel=0.004, rot=(0, s_ * 0.6, 0)), outline=False))
    hg = mn.link(bpy.data.objects.new('hat', None)); hg.location = (x, -0.19, hz - 0.03); hg.rotation_euler = (math.radians(25), 0, 0.1)
    for o in hat: o.parent = hg
    # 3: hook hand: leather cup with straps, steel hook
    x = hooks[2]
    k(C('cup', 0.06, 0.16, (x, -0.12, zH - 0.24), M['leather'], verts=16, bevel=0.012))
    k(D.ring('cupband', 0.064, 0.012, 0.02, loc=(x, -0.12, zH - 0.14), m=M['brass'], verts=16))
    k(tube('handhook', [(x, -0.12, zH - 0.24), (x, -0.12, zH - 0.34), (x + 0.07, -0.12, zH - 0.4), (x + 0.1, -0.12, zH - 0.32)], 0.014, M['steel'], corner=0.04))
    k(tube('strap', [(x, -0.1, zH - 0.08), (x - 0.02, -0.13, zH - 0.02), (x, -0.12, zH + 0.0)], 0.01, M['leather'], corner=0.03))
    wall_catcher(k, W + 0.5, 0.65, 1.4)
    render(k, 'eyepatch_hook')

# --- floor stencils ---------------------------------------------------------------------------------
@job('skull_stencil')
def skull_job():
    k = Kit(); mats()
    pm = paint('skullp', '#e8e4dc', 0.55, 7.0, alpha=0.82)
    z0, z1 = 0.001, 0.003
    s = 1.0
    sk = poly('skull', blob_pts(0.33, 0.29, 5, j=0.03, cy=0.14), z0, z1, pm)
    jaw = poly('jaw', [(-0.19, -0.04), (0.19, -0.04), (0.16, -0.2), (-0.16, -0.2)], z0, z1, pm)
    cuts = []
    for sx in (-1, 1): cuts.append(mn.cyl('eye', 0.085, 0.02, loc=(sx * 0.13, 0.13, -0.005), verts=20, bevel=0))
    cuts.append(poly('nose', [(-0.045, 0.0), (0.045, 0.0), (0.0, 0.08)], -0.005, 0.02, pm))
    for i in range(3): cuts.append(mn.box('tooth', (0.022, 0.12, 0.03), loc=(-0.08 + i * 0.08, -0.17, -0.005), bevel=0))
    cuts.append(mn.box('bridge', (0.6, 0.03, 0.03), loc=(0, -0.05, -0.005), bevel=0))
    D.bool_cut(sk, [jaw], op='UNION')
    D.bool_cut(sk, cuts); mn.assign(sk, pm); k(sk, outline=False)
    for a in (0.62, -0.62):                                            # crossed bones below with knobby ends
        bone = [poly('bone', [(-0.56, -0.045), (0.56, -0.045), (0.56, 0.045), (-0.56, 0.045)], z0, z1, pm)]
        for e in (-1, 1):
            for t in (-1, 1): bone.append(mn.cyl('knob', 0.065, z1 - z0, loc=(e * 0.58, t * 0.05, z0), m=pm, verts=16, bevel=0))
        g = mn.link(bpy.data.objects.new('bones', None)); g.location = (0, -0.42, 0); g.rotation_euler = (0, 0, a)
        for o in bone: o.parent = g; k(o, outline=False)
    render(k, 'skull_stencil')

@job('quota_stencil')
def quota_job():
    k = Kit(); mats()
    pm = paint('quotap', '#d2a62e', 0.15, 5.0, alpha=0.85, scuff=0.6)
    tm = paint('quotat', '#d2a62e', -0.6, 5.0, alpha=0.85, scuff=0.6)    # the letters wear less: worn-through holes ate whole strokes (KEELHAUL's E)
    t = k(txt('quota', 'QUOTA OR KEELHAUL', 0.24, (0, 0, 0.001), tm, font='bold', depth=0.002), outline=False)
    for s in (-1, 1):                                                  # stencil rails and arrow ticks
        k(mn.box('rail', (2.4, 0.03, 0.002), loc=(0, s * 0.2, 0.001), m=pm, bevel=0), outline=False)
        k(poly('tick', [(s * 1.32, 0.12), (s * 1.32, -0.12), (s * 1.46, 0.0)], 0.001, 0.003, pm), outline=False)
    render(k, 'quota_stencil')

# --- hammock ----------------------------------------------------------------------------------------
@job('hammock')
def hammock_job():
    k = Kit(); mats()
    L_, Wd = 1.6, 0.58
    canvas = stripes('canvas', '#c8443a', '#e8dcc0', 7.0, axis=1, rough=0.85)
    # the cloth: a sagging, curled grid with its ends gathered
    me = bpy.data.meshes.new('cloth'); bm = bmesh.new(); nx, ny = 28, 12; vs = {}
    for i in range(nx + 1):
        u = i / nx * 2 - 1
        for j in range(ny + 1):
            v = j / ny * 2 - 1
            gather = 1 - 0.75 * abs(u) ** 3
            x = u * L_ / 2; y = v * Wd / 2 * gather
            zc = 0.78 - 0.36 * (1 - u * u) + 0.13 * (v * v) * gather
            vs[i, j] = bm.verts.new((x, y, zc))
    for i in range(nx):
        for j in range(ny): bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
    bm.to_mesh(me); bm.free()
    cl = k(mn._obj('cloth', me)); mn.assign(cl, canvas); mn.smooth(cl)
    so = cl.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.02; so.offset = 0
    # pipe frame: a base bar along the floor, two bent uprights
    fr = worn('frame', '#6a7383', 0.35, 0.8, grime=0.6, rust=0.2)
    k(tube('base', [(-1.05, 0.0, 0.04), (1.05, 0.0, 0.04)], 0.035, fr))
    for s in (-1, 1):
        k(tube('upright', [(s * 0.7, 0.0, 0.04), (s * 1.0, 0.0, 0.25), (s * 1.08, 0.0, 0.9)], 0.035, fr, corner=0.12))
        k(tube('foot', [(s * 1.05, -0.22, 0.03), (s * 1.05, 0.22, 0.03)], 0.03, fr))
        for t in (-1, 1): k(SP('cap', 0.035, (s * 1.05, t * 0.22, 0.03), M['rubber'], segs=10))
        k(SP('top', 0.045, (s * 1.08, 0.0, 0.92), M['brass'], segs=12))
        for t in (-1, 0, 1):                                          # ropes from the gathered end to the hook
            k(tube('rope', [(s * 0.8, t * 0.05, 0.78), (s * 1.06, 0.0, 0.88)], 0.008, pmat('rope', '#c8b48a', 0.9), corner=0.01), outline=False)
    tape(k, (0.1, 0.09, 0.09), (-0.9, 0.0, 0.13), rot=(0, -0.6, 0))
    # a pillow, a blanket fold, a sock dangling off the side
    k(B('pillow', (0.32, 0.4, 0.09), (-0.5, 0.0, 0.52), pmat('pillow', '#e6e2d6', 0.9, grime=0.6), bevel=0.04, rot=(0, -0.25, 0)))
    k(B('blanket', (0.5, 0.5, 0.05), (0.25, 0.02, 0.45), stripes('blanket', '#3a5a8e', '#2a3a5a', 10.0, axis=0), bevel=0.02, rot=(0, 0.12, 0.08)))
    k(tube('sock', [(0.1, -0.24, 0.46), (0.12, -0.3, 0.36), (0.14, -0.31, 0.26), (0.22, -0.32, 0.24)], 0.03, stripes('sock', '#e8dcc0', '#c8443a', 22.0, axis=2), corner=0.04))
    # a rum bottle and a magazine underneath
    k(C('bottle', 0.045, 0.2, (0.42, -0.18, 0.0), worn('btl', '#4a2a14', 0.08, 0.0, wear=0.0, grime=0.3), verts=12, bevel=0.01))
    k(C('neck', 0.018, 0.08, (0.42, -0.18, 0.2), worn('btl2', '#4a2a14', 0.08, 0.0, wear=0.0, grime=0.3), verts=10, bevel=0.005))
    k(B('mag', (0.24, 0.17, 0.01), (-0.2, -0.22, 0.0), stripes('mag', '#e8c34f', '#c0392b', 9.0, axis=1, rough=0.4), bevel=0.003, rot=(0, 0, 0.4)))
    floor_catcher(k, 2.6, 1.0)
    render(k, 'hammock')

# --- ship's wheel table -----------------------------------------------------------------------------
@job('wheel_table')
def wheel_table_job():
    k = Kit(); mats()
    staves = stripes('staves', '#6a4628', '#5a3a20', 18.0, axis=0, rough=0.75)
    # base: a squat barrel
    k(C('keg', 0.27, 0.5, (0, 0, 0), staves, verts=32, bevel=0.03))
    for z in (0.08, 0.4): k(ring('keg_hoop', 0.285, 0.03, 0.04, loc=(0, 0, z), m=M['steel'], verts=32))
    # the wheel lying flat on top
    zt = 0.52
    k(torus('rim', 0.5, 0.035, (0, 0, zt + 0.035), M['wood'], maj=48, mnr=10))
    k(C('hub', 0.1, 0.07, (0, 0, zt), M['brass'], verts=24, bevel=0.015))
    for i in range(8):
        a = i * math.pi / 4
        k(tube('spoke', [(0.08 * math.cos(a), 0.08 * math.sin(a), zt + 0.035), (0.62 * math.cos(a), 0.62 * math.sin(a), zt + 0.035)], 0.022, M['wood']))
        k(SP('handle', 0.04, (0.67 * math.cos(a), 0.67 * math.sin(a), zt + 0.035), M['wood_dark'], scale=(1.0, 1.0, 1.0), segs=12))
    # a round scrap-metal top laid over the spokes
    k(C('top', 0.46, 0.025, (0, 0, zt + 0.06), worn('top', '#6a5a48', 0.6, 0.4, rust=0.4), verts=48, bevel=0.008))
    zs = zt + 0.085
    # cards (a fanned hand and a pile), dice, a tin mug, a candle in a bottle, a coin stack
    cardm = pmat('card', '#eeeae0', 0.6); back = stripes('cardback', '#c0392b', '#e8dcc0', 30.0, axis=0)
    for i in range(5):
        c = k(B('card', (0.08, 0.12, 0.003), (-0.12 + i * 0.025, -0.16, zs + 0.002 * i), cardm, bevel=0.002, rot=(0, 0, 0.5 - i * 0.22)), outline=False)
        k(B('pip', (0.02, 0.02, 0.001), (-0.12 + i * 0.025, -0.15, zs + 0.002 * i + 0.003), M['red'] if i % 2 else M['ink'], bevel=0, rot=(0, 0, 0.5 - i * 0.22)), outline=False)
    k(B('deck', (0.08, 0.12, 0.04), (0.2, -0.05, zs), back, bevel=0.004, rot=(0, 0, 0.2)))
    for (x, y, a) in ((0.0, 0.05, 0.3), (0.07, 0.0, 1.0)):
        k(B('die', (0.045, 0.045, 0.045), (x, y, zs), M['white'], bevel=0.008, rot=(0, 0, a)))
        k(SP('dpip', 0.007, (x, y, zs + 0.046), M['ink'], segs=6), outline=False)
    k(C('mug', 0.055, 0.1, (-0.22, 0.17, zs), M['steel'], verts=16, bevel=0.01))
    k(C('mug_in', 0.045, 0.005, (-0.22, 0.17, zs + 0.09), M['rum_puddle'], verts=16, bevel=0), outline=False)
    k(torus('mug_h', 0.035, 0.009, (-0.28, 0.17, zs + 0.05), M['steel'], rot=(R90, 0, 0), maj=12, mnr=5))
    k(C('cbottle', 0.045, 0.16, (0.18, 0.22, zs), worn('cb', '#2f5a2a', 0.08, 0.0, wear=0.0, grime=0.3), verts=14, bevel=0.012))
    k(C('cneck', 0.018, 0.05, (0.18, 0.22, zs + 0.16), worn('cb2', '#2f5a2a', 0.08, 0.0, wear=0.0, grime=0.3), verts=10, bevel=0.004))
    k(C('candle', 0.022, 0.08, (0.18, 0.22, zs + 0.2), pmat('wax', '#ece2c4', 0.6), verts=10, bevel=0.006))
    for i in range(3): k(SP('drip', 0.014, (0.18 + 0.02 * math.cos(i * 2), 0.22 + 0.02 * math.sin(i * 2), zs + 0.19 - 0.04 * i), pmat('wax2', '#ece2c4', 0.6), segs=8), outline=False)
    k(SP('flame', 0.03, (0.18, 0.22, zs + 0.32), M['flame'], scale=(1, 1, 2.0), segs=12), outline=False)
    k(SP('flame_core', 0.016, (0.18, 0.215, zs + 0.31), emit_mat('flame_core', '#fff0b0', 1.5, base='#fff4d0'), scale=(1, 1, 1.6), segs=10), outline=False)
    for i in range(4): k(C('coin', 0.035, 0.012, (0.05 + 0.004 * i, 0.22, zs + 0.012 * i), M['gold'], verts=12, bevel=0.003), outline=False)
    k(B('ticket', (0.14, 0.08, 0.003), (-0.06, 0.28, zs), M['paper'], bevel=0.001, rot=(0, 0, -0.3)), outline=False)
    k(txt('iou', 'I.O.U.', 0.03, (-0.06, 0.28, zs + 0.004), M['ink'], rot=(0, 0, -0.3)), outline=False)
    floor_catcher(k, 1.6, 1.5)
    render(k, 'wheel_table')

# --- rum bottles ------------------------------------------------------------------------------------
def bottle(k, x, y, z, glass, rot=None, cork=True, lbl='XXX'):
    parts = [k(C('btl', 0.055, 0.2, (0, 0, 0), glass, verts=16, bevel=0.02)),
             k(C('shoulder', 0.035, 0.04, (0, 0, 0.2), glass, verts=14, bevel=0.012)),
             k(C('neck', 0.022, 0.09, (0, 0, 0.22), glass, verts=12, bevel=0.005)),
             k(C('label', 0.057, 0.08, (0, 0, 0.05), M['paper'], verts=16, bevel=0.003), outline=False)]
    parts.append(k(txt('xxx', lbl, 0.04, (0, -0.058, 0.09), M['ink'], rot=(R90, 0, 0), depth=0.002), outline=False))
    if cork: parts.append(k(C('cork', 0.02, 0.04, (0, 0, 0.3), pmat('cork', '#b08a5a', 0.8), verts=10, bevel=0.006)))
    g = mn.link(bpy.data.objects.new('bottle', None)); g.location = (x, y, z)
    if rot: g.rotation_euler = rot
    for o in parts: o.parent = g
    return g

@job('rum')
def rum_job():
    k = Kit(); mats()
    amber = mn.mat('amber', '#6a3412', 0.06, 0.0, clearcoat=1.0); green = mn.mat('green', '#2a5a2a', 0.06, 0.0, clearcoat=1.0)
    bottle(k, -0.12, 0.08, 0.0, amber, lbl='XXX')
    bottle(k, 0.04, 0.12, 0.0, green, lbl='RUM')
    bottle(k, 0.1, -0.08, 0.055, amber, rot=(R90, 0, 1.9), cork=False, lbl='XXX')
    k(poly('puddle', blob_pts(0.22, 0.1, 6, cx=-0.12, cy=-0.16, j=0.25), 0.0, 0.003, M['rum_puddle']), outline=False)
    k(C('cork_lost', 0.02, 0.04, (-0.24, -0.12, 0.02), pmat('cork', '#b08a5a', 0.8), verts=10, bevel=0.006, rot=(R90, 0, 0.4)))
    floor_catcher(k, 0.8, 0.6)
    render(k, 'rum')

# --- birdcage with the stuffed parrot ---------------------------------------------------------------
@job('birdcage')
def birdcage_job():
    k = Kit(); mats()
    br = M['brass']
    k(C('base', 0.23, 0.06, (0, 0, 0), M['hull'], verts=32, bevel=0.02))
    k(C('pole', 0.025, 1.68, (0, 0.14, 0.06), M['steel'], verts=12, bevel=0.005))
    k(tube('arm', [(0, 0.14, 1.72), (0, 0.14, 1.78), (0, 0.0, 1.8), (0, -0.02, 1.72)], 0.02, M['steel'], corner=0.06))
    # cage: tray, bars, dome, ring
    zb, zt = 0.92, 1.36
    k(C('tray', 0.22, 0.06, (0, -0.02, zb - 0.06), br, verts=32, bevel=0.015))
    k(ring('tray_rim', 0.225, 0.02, 0.03, loc=(0, -0.02, zb - 0.01), m=br, verts=32))
    k(ring('mid_ring', 0.205, 0.012, 0.014, loc=(0, -0.02, zt - 0.02), m=br, verts=32))
    n = 16
    for i in range(n):
        a = i / n * math.tau
        if i in (12, 13): continue                                      # the door is open (front-right): no bars there
        x, y = 0.2 * math.cos(a), -0.02 + 0.2 * math.sin(a)
        k(C('bar', 0.006, zt - zb, (x, y, zb), br, verts=6, bevel=0), outline=False)
    for i in range(4):
        a = i / 4 * math.pi
        arc = [(0.2 * math.cos(t) * math.cos(a), -0.02 + 0.2 * math.cos(t) * math.sin(a), zt + 0.22 * math.sin(t)) for t in [x / 8 * math.pi for x in range(9)]]
        k(tube('dome', arc, 0.006, br, corner=0.02), outline=False)
    k(SP('finial', 0.03, (0, -0.02, zt + 0.23), br, segs=10))
    k(torus('hang', 0.04, 0.008, (0, -0.02, zt + 0.29), br, rot=(R90, 0, 0), maj=12, mnr=5))
    # the open door, swung out
    dg = mn.link(bpy.data.objects.new('door', None)); dg.location = (0.2 * math.cos(12.5 / n * math.tau - 0.2), -0.02 + 0.2 * math.sin(12.5 / n * math.tau - 0.2), zb)
    dg.rotation_euler = (0, 0, -0.9)
    for j in range(4):
        b = k(C('dbar', 0.005, 0.26, (0.02 + j * 0.04, 0, 0.04), br, verts=6, bevel=0), outline=False); b.parent = dg
    for z in (0.04, 0.3):
        b = k(B('dframe', (0.15, 0.012, 0.012), (0.08, 0, z), br, bevel=0.003)); b.parent = dg
    # the swing and the stuffed parrot: faded, patched, button eye, X eye, stuffing poking out
    k(C('swing', 0.008, 0.2, (-0.1, -0.02, zb + 0.12), br, verts=6, bevel=0, rot=(0, R90, 0)), outline=False)
    for s in (-1, 1): k(C('swing_wire', 0.004, 0.24, (s * 0.1, -0.02, zb + 0.12), br, verts=6, bevel=0), outline=False)
    fg = pmat('felt_g', '#5a9a5a', 0.95, grime=0.7); fy = pmat('felt_y', '#d8b450', 0.95, grime=0.5); fr = pmat('felt_r', '#b04a3a', 0.95, grime=0.6)
    pz = zb + 0.13
    k(SP('pbody', 0.075, (0, -0.03, pz + 0.07), fg, scale=(0.9, 0.8, 1.2)))
    k(SP('pbelly', 0.055, (0, -0.07, pz + 0.065), fy, scale=(0.8, 0.5, 1.0)))
    hd = k(SP('phead', 0.055, (0.01, -0.04, pz + 0.17), fg))
    k(SP('pbeak', 0.025, (0.01, -0.095, pz + 0.16), fy, scale=(0.8, 1.0, 1.2)))
    for s in (-1, 1): k(SP('pwing', 0.05, (s * 0.06, -0.02, pz + 0.07), fr, scale=(0.3, 0.7, 1.1)))
    k(B('ptail', (0.05, 0.03, 0.12), (0, 0.04, pz - 0.05), fr, bevel=0.012, rot=(-0.4, 0, 0)))
    k(C('button', 0.016, 0.008, (0.035, -0.085, pz + 0.185), M['black'], verts=10, bevel=0.002, rot=(R90 + 0.3, 0, 0.4)), outline=False)
    for s in (-1, 1): k(B('xeye', (0.03, 0.006, 0.006), (-0.022, -0.085, pz + 0.185), M['black'], bevel=0, rot=(0.3, s * 0.8, 0)), outline=False)
    for i, (x, z) in enumerate(((0.05, 0.1), (0.06, 0.06), (0.045, 0.03))):
        k(SP('stuffing', 0.02, (x, -0.04, pz + z), pmat('fluff', '#f2f0ea', 0.95), segs=8), outline=False)
    k(B('patch', (0.035, 0.008, 0.03), (-0.035, -0.09, pz + 0.05), stripes('ptch', '#3a5a8e', '#e8dcc0', 60.0, axis=0), bevel=0.003), outline=False)
    # tag on the tray: "POLLY v1 (RETIRED)"
    tg = [k(B('tag', (0.26, 0.09, 0.004), (0, 0, 0), M['paper'], bevel=0.002))]
    tg.append(k(txt('tg1', 'POLLY v1', 0.04, (0, 0.015, 0.005), M['ink']), outline=False))
    tg.append(k(txt('tg2', '(RETIRED)', 0.03, (0, -0.025, 0.005), M['ink']), outline=False))
    wall_group(tg, zb - 0.1, y=-0.255).rotation_euler = (R90, 0, 0.0)
    k(B('tag_string', (0.004, 0.004, 0.06), (0.1, -0.24, zb - 0.07), M['ink'], bevel=0), outline=False)
    # a feather on the floor
    k(B('feather', (0.12, 0.03, 0.004), (0.18, -0.2, 0.06), fr, bevel=0.002, rot=(0, 0, 0.5)), outline=False)
    floor_catcher(k, 0.8, 0.7)
    render(k, 'birdcage')

# ---------------------------------------------------------------------------------------------------
if __name__ == '__main__':
    t0 = time.time()
    for name, fn in JOBS:
        if ONLY and name not in ONLY: continue
        t = time.time(); mn.reset(); fn()
        print(f'[raider] {name}: {time.time() - t:.1f} s')
    print(f'[raider] total {time.time() - t0:.1f} s')
