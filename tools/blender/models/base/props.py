"""The Red Comet base's props and clutter (js/dock.js baseGeom / drawBase / drawGunCorridor / DOCK_DECOR.base),
for the rooms other than the hull: docking bay, server room, barracks, gun corridor, brig.

    blender -b --factory-startup --python tools/blender/models/base/props.py -- [quick] [only=a,b,...]

`quick` renders at 16 samples; `only=` picks jobs by name (see JOBS at the bottom). Every sprite goes to
build/renders/base/<name> via mn.render (group 'base').

Conventions (like models/props and models/dock):
  * Floor props: the origin is the game point the prop stands on (centre of its footprint unless noted).
  * Wall items (plaques, the code note, the dartboard, the tally marks): vertical plates facing the camera,
    origin at the plate's centre (the game hangs them at WALL_SIGN_Z + 0.15 with wallSign/dockSign).
  * Props are not mirrored for the starboard layout (text must read the right way); the only sprite whose
    shape depends on the side is the brig's cell door hanging open (cell_bars_open_port / _star).
Sizes come from baseGeom where the game has the object; the rest are new (see the report / NOTES below).
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
import docklib as D
from docklib import *
import shiplib
import bpy, bmesh
from mathutils import Vector

A = D.args()
QUICK = 'quick' in A
ONLY = None
for a in A:
    if a.startswith('only='): ONLY = set(a[5:].split(','))
mn.SAMPLES = 16 if QUICK else 48
if os.environ.get('BASE_SAMPLES'): mn.SAMPLES = int(os.environ['BASE_SAMPLES'])
CPU = True                                       # no usable GPU in the sandbox

_orig_reset = mn.reset
def _reset():
    s = _orig_reset()
    if CPU: s.cycles.device = 'CPU'
    s.render.threads_mode = 'FIXED'; s.render.threads = int(os.environ.get('BASE_THREADS', '6'))
    shiplib._hidden_in_data.clear()
    set_side('port')
    return s
mn.reset = _reset

FONT_FILES = {'sans': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'mono': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
              'hand': '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf', 'narrow': '/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf',
              'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'}
def font(k):
    f = bpy.data.fonts.get('mnf_' + k)
    if f: return f
    f = bpy.data.fonts.load(FONT_FILES[k]); f.name = 'mnf_' + k; return f

FR4 = [1, 2, 3, 4]

# ---------------------------------------------------------------------------------------------------
# Collector: every part goes through add(); outline=False keeps tiny details (text, LEDs, tape) clean
# ---------------------------------------------------------------------------------------------------
OUT = []
def add(o, outline=True):
    if o is None: return o
    if not outline: o['nool'] = 1
    OUT.append(o); return o

def T(name, body, u, v, z, size, m, face=True, f='sans', rotz=0.0, tilt=0.0, depth=0.003, spacing=1.0, line=1.0, rotx=None):
    """Text: on a camera-facing vertical face (face=True; tilt leans its top back by `tilt` radians) or lying flat."""
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.extrude = depth
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.font = font(f); cu.space_character = spacing; cu.space_line = line
    o = shiplib._curve_to_mesh(name, cu, m)
    for p in o.data.polygons: p.use_smooth = False
    o.location = P(u, v, z)
    o.rotation_euler = ((R90 - tilt) if rotx is None else rotx, 0, rotz) if face else (0, 0, -rotz)
    return add(o, False)

def keys_emit(m, seq, frames=FR4):
    """Keyframe a material's emission strength (Principled) per frame."""
    b = m.node_tree.nodes.get('Principled BSDF')
    inp = b.inputs['Emission Strength'] if b else m.node_tree.nodes['Emission'].inputs['Strength']
    for f, s in zip(frames, seq):
        inp.default_value = s; inp.keyframe_insert('default_value', frame=f)

def keys_show(o, seq, frames=FR4):
    """Keyframe visibility per frame (seq of bools)."""
    for f, on in zip(frames, seq):
        o.hide_render = not on; o.keyframe_insert('hide_render', frame=f)
    return o

def mats():
    M = dict(
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5),
        iron=worn('iron', '#5a5e66', 0.45, 0.7, wear=0.4, grime=0.8, rust=0.35), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        hazard=stripes_mat('hazard'), tape=pmat('tape', '#c4c7cc', 0.85), tape_y=pmat('tape_y', '#e8c34f', 0.8),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15), panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2),
        panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15), gunmetal=worn('gunmetal', '#3a3e46', 0.4, 0.6, wear=0.6, grime=0.8),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), leather=worn('leather', '#8a2a24', 0.45, 0.0, wear=0.9, grime=0.8),
        gold=worn('gold', '#e8b42e', 0.4, 0.5, wear=0.8, grime=0.6), white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6),
        wood=worn('wood', '#8a6a4a', 0.7, 0.0, wear=0.3, grime=0.9), wood2=worn('wood2', '#6e5236', 0.7, 0.0, wear=0.3, grime=0.9),
        olive=worn('olive', '#5e6a3e', 0.6, 0.1, wear=0.5, grime=0.8), navy=worn('navy', '#2e3e5e', 0.55, 0.2, wear=0.6, grime=0.7),
        copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3), rubber=pmat('rubber', '#262a33', 0.7),
        sticker=pmat('sticker', '#f2df6b', 0.6), paper=pmat('paper', '#ece8dc', 0.8), ink=pmat('ink', '#23252b', 0.6),
        inkred=pmat('inkred', '#c0392b', 0.6), cream=pmat('cream', '#e8dcb8', 0.7), card=pmat('cardb', '#b08a5a', 0.85),
        glass=mn.mat('glass', '#3a4654', 0.08, 0.0, clearcoat=1.0), lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2),
        red_led=emit_mat('red_led', '#ff3a2a', 1.4, base='#6a1a14'), blue_led=emit_mat('blue_led', '#4ab8ff', 1.4, base='#1a4a6a'),
        green_led=emit_mat('green_led', '#5aff9a', 1.2, base='#2a7a4a'), amber_led=emit_mat('amber_led', '#ffb43a', 1.2, base='#7a5a1a'),
        cables=[pmat('c1', '#b0603a', 0.6), pmat('c2', '#3a64a0', 0.6), pmat('c3', '#5a5e66', 0.6), pmat('c4', '#c8a030', 0.6), pmat('c5', '#a03030', 0.6)],
        oil=decal_mat('oil', '#0a0908', 0.75, rough=0.15), scorch=decal_mat('scorch', '#0c0a08', 0.85, scale=7.0),
        bottle_g=mn.mat('bottle_g', '#3a8a3a', 0.1, 0.0, clearcoat=1.0), bottle_b=mn.mat('bottle_b', '#7a5228', 0.1, 0.0, clearcoat=1.0),
        chalk=pmat('chalk', '#e6e8ee', 0.9), skin=pmat('skin', '#e6c19b', 0.6), felt=worn('felt', '#2e6a42', 0.9, 0.0, wear=0.0, grime=0.8),
    )
    D.M_DARK[0] = M['black']
    return M

def screws(u0, u1, v, z0, z1, M, r=0.018, inset=0.05):
    for uu in (u0 + inset, u1 - inset):
        for zz in (z0 + inset, z1 - inset):
            add(mn.cyl('screw', r, 0.012, loc=P(uu, v + 0.006, zz), m=M['steel'], verts=8, bevel=0.004, rot=(R90, 0, 0)), False)

def tape_face(u, v, z, l, rot, M, w=0.08, m=None):
    """A strip of duct tape on a camera-facing face (rot: angle in the face plane)."""
    o = mn.box('tape', (l, 0.006, w), m=m or M['tape'], bevel=0.002); o.location = P(u, v + 0.003, z); o.rotation_euler = (0, rot, 0)
    return add(o, False)

def tape_flat(u, v, z, l, rotz, M, w=0.08, m=None):
    return add(cbox('tape', u, v, l, w, z, 0.006, m or M['tape'], bevel=0.002, rotz=rotz), False)

def bolt_flat(u, v, z, M, r=0.025):
    return add(mn.cyl('bolt', r, 0.02, loc=P(u, v, z), m=M['steel'], verts=6, bevel=0.006), False)

def wedge_disc(name, u, v, z, r, a0, a1, m, face=True, h=0.01, segs=12):
    """A pie wedge (a0..a1 radians, counter-clockwise from +u), on a camera-facing face (face=True) or flat."""
    bm = bmesh.new(); c = bm.verts.new((0, 0, 0))
    ring_ = [bm.verts.new((r * math.cos(a0 + (a1 - a0) * i / segs), r * math.sin(a0 + (a1 - a0) * i / segs), 0)) for i in range(segs + 1)]
    for i in range(segs): bm.faces.new((c, ring_[i], ring_[i + 1]))
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for e in ext['geom']:
        if isinstance(e, bmesh.types.BMVert): e.co.z += h
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    o.location = P(u, v, z); o.rotation_euler = (R90, 0, 0) if face else (0, 0, 0)
    return o

def drape(name, u0, v0, u1, v1, z, support, m, seed=1, n=22, bump=0.035, hang=1.6, thick=0.03, floor=0.0):
    """A crumpled blanket: a grid over (u0..u1, v0..v1) lying at z on the support rect, folds from summed waves,
    flopping down (hang per unit) wherever it sticks out past the support, never below `floor`."""
    rnd = random.Random(seed); waves = [(rnd.uniform(3, 9), rnd.uniform(3, 9), rnd.uniform(0, 6.3), rnd.uniform(0.3, 1)) for _ in range(6)]
    su0, sv0, su1, sv1 = support
    bm = bmesh.new(); vs = []
    nu = n; nv = max(4, int(n * (v1 - v0) / max(0.01, u1 - u0)))
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            u = u0 + (u1 - u0) * i / nu; v = v0 + (v1 - v0) * j / nv
            h = sum(a * math.sin(fu * u + fv * v + ph) for fu, fv, ph, a in waves) / 3.0 * bump
            out_d = max(su0 - u, u - su1, sv0 - v, v - sv1, 0)
            zz = max(floor, z + h - out_d * hang)
            # pull the hanging part in a bit (cloth falls rather than sliding out)
            uu = u if out_d == 0 else u - math.copysign(out_d * 0.5, u - (su0 + su1) / 2) * (1 if (u < su0 or u > su1) else 0)
            vv = v if out_d == 0 else v - math.copysign(out_d * 0.5, v - (sv0 + sv1) / 2) * (1 if (v < sv0 or v > sv1) else 0)
            row.append(bm.verts.new(P(uu, vv, zz)))
        vs.append(row)
    for j in range(nv):
        for i in range(nu): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f_ in bm.faces:
        if f_.normal.z < 0: f_.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); mn.assign(o, m)
    sd = o.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = thick; sd.offset = -1
    ss = o.modifiers.new('sub', 'SUBSURF'); ss.levels = 1; ss.render_levels = 1
    mn.smooth(o); return o

def render(name, frames=None, catcher=None, ol=0.013, passes=('beauty', 'normal', 'height')):
    meshes = [o for o in OUT if o.type == 'MESH']
    for o in meshes:                                 # (boolean cuts can leave an empty material slot)
        ms = [m for m in o.data.materials if m]
        for i, m in enumerate(o.data.materials):
            if m is None and ms: o.data.materials[i] = ms[0]
    mn.outline([o for o in meshes if not o.get('nool')], thickness=ol)
    if catcher: shiplib.shadow_catcher(catcher)
    r = mn.render('base/' + name, objs=meshes, frames=frames, passes=passes)
    return r

JOBS = []
def job(name):
    def deco(fn): JOBS.append((name, fn)); return fn
    return deco

def start():
    mn.reset(); OUT.clear(); return mats()

# ===================================================================================================
# Server room: the security terminal (baseGeom terminal pt(-20.4, -3.2); the 2D draws a 1.1 x 0.75 box,
# y -0.4 .. +0.35 around the point; click radius 0.8). d.terminal: 'broken' | 'fixed' | 'hacked'.
# ===================================================================================================
def terminal(M, state, frame_mats=None):
    # the cabinet: lower body, a slanted keyboard deck, the monitor hood at the back
    add(cbox('t_foot', 0, -0.02, 1.08, 0.66, 0.0, 0.08, M['dark'], bevel=0.02))
    add(cbox('t_body', 0, -0.05, 1.0, 0.58, 0.06, 0.7, M['panel'], bevel=0.035))
    add(ubox('t_strip', -0.5, 0.235, 0.5, 0.25, 0.08, 0.16, M['hazard'], bevel=0.004), False)
    deck = add(cbox('t_deck', 0, 0.0, 1.06, 0.42, 0.0, 0.06, M['panel2'], bevel=0.02)); deck.rotation_euler.x = math.radians(-14); deck.location = P(0, 0.06, 0.72)
    add(cbox('t_hood', 0, -0.24, 1.02, 0.3, 0.74, 0.62, M['body'], bevel=0.035))
    add(cbox('t_hood_cap', 0, -0.24, 1.06, 0.34, 1.34, 0.05, M['panel2'], bevel=0.02))
    # the screen: a bezel and a face tilted back a little
    tilt = math.radians(10)
    bez = add(mn.box('t_bezel', (0.92, 0.04, 0.5), m=M['dark'], bevel=0.02)); bez.location = P(0, -0.08, 1.04); bez.rotation_euler.x = tilt
    scr_m = frame_mats['screen']
    scr = add(mn.box('t_screen', (0.8, 0.02, 0.4), m=scr_m, bevel=0.006), False); scr.location = P(0, -0.06, 1.04); scr.rotation_euler.x = tilt
    sy, sz = 0.05, 1.04                                    # text plane just in front of the screen
    def stxt(name, body, dz, size, m, f='mono'):
        o = T(name, body, 0, -sy + 0.0 + 0.0, sz + dz, size, m, f=f, tilt=-tilt)
        o.location = P(0, -0.035 + dz * math.sin(tilt), sz + dz * math.cos(tilt)); return o
    # the keyboard on the deck
    kb = add(cbox('t_kb', 0, 0, 0.72, 0.2, 0, 0.03, M['dark'], bevel=0.01)); kb.rotation_euler.x = math.radians(-14); kb.location = P(-0.05, 0.08, 0.78)
    for r in range(3):
        for c in range(9):
            k = add(cbox('key', -0.32 + c * 0.08, -0.06 + r * 0.06, 0.06, 0.045, 0.03, 0.018, M['white'] if (r + c) % 7 else M['red'], bevel=0.006), False)
            k.parent = kb; k.location = P(-0.32 + c * 0.08, -0.06 + r * 0.06, 0.03)
    add(ucyl('t_knob', 0.05, 0.04, 0.42, 0.06, 0.76, M['steel'], verts=16), False)
    # the front: a label plate, a skull sticker, the access panel
    add(ubox('t_plate', -0.3, 0.226, 0.3, 0.236, 0.52, 0.64, M['steel'], bevel=0.006))
    T('t_plate_t', 'SECURITY', 0, 0.24, 0.58, 0.075, M['ink'])
    D.skull(0.36, 0.232, 0.55, 0.12, M['white'], OUT, face=True)
    T('t_maker', 'RED COMET SYSTEMS  v0.9 BETA', 0, 0.24, 0.45, 0.035, M['white'])
    # side vents
    for su in (-1, 1):
        for i in range(4): add(ubox('vent', su * 0.505 - 0.005, -0.25 + i * 0.07, su * 0.505 + 0.005, -0.21 + i * 0.07, 0.3, 0.55, M['dark'], bevel=0), False)
    if state == 'broken':
        # the access panel: kicked off, hanging from its top-left screw, wires spilling out of the hole
        add(ubox('t_hole', -0.32, 0.225, 0.22, 0.24, 0.12, 0.4, M['black'], bevel=0.004), False)
        pnl = add(mn.box('t_panel', (0.54, 0.02, 0.28), m=M['panel'], bevel=0.01)); pnl.location = P(-0.08, 0.36, 0.17); pnl.rotation_euler = (math.radians(-60), math.radians(18), math.radians(8))
        for i, (a, b, c) in enumerate([(-0.25, 0.25, 0.3), (-0.1, 0.24, 0.25), (0.05, 0.24, 0.32), (0.15, 0.24, 0.2)]):
            pts = [(a, b, c), (a + 0.04, b + 0.15, c - 0.08), (a + 0.1 * (i - 1.5), b + 0.32, 0.04), (a + 0.14 * (i - 1.5), b + 0.45, 0.03)]
            add(pipe_uv('wire', pts, 0.016, M['cables'][i], corner=0.08), False)
        for i in range(2): add(ucyl('wire_end', 0.02, 0.04, -0.33 + 0.25 * i, 0.68 + 0.02 * i, 0.03, M['copper'], verts=8), False)
        # the screen cracked (a star of dark cracks), a scorch on the hood, a sticky note: IT'S FINE
        for a in (0.3, 1.2, 2.2, 3.5, 4.6, 5.5):
            l = 0.08 + 0.05 * (a % 1.0)
            c = mn.box('crack', (l, 0.004, 0.006), m=M['black'], bevel=0); c.location = P(0.18 + math.cos(a) * l / 2, -0.03, 1.1 + math.sin(a) * l / 2 * math.cos(tilt))
            c.rotation_euler = (tilt, -a, 0); add(c, False)
        D.stain(0.22, -0.24, 0.16, M['scorch'], OUT, z=1.396)
        nt = add(mn.box('t_note', (0.16, 0.006, 0.15), m=M['sticker'], bevel=0.003), False); nt.location = P(0.4, -0.05, 1.22); nt.rotation_euler = (tilt, 0.2, 0)
        o = T('t_note_t', "IT'S\nFINE", 0, 0, 0, 0.04, M['ink'], f='hand'); o.location = P(0.4, -0.056, 1.22); o.rotation_euler = (R90 + tilt, 0.2, 0)
    else:
        # repaired: the panel back on, held with a duct-tape X (and a spare strip on the side)
        add(ubox('t_panel', -0.32, 0.225, 0.22, 0.245, 0.12, 0.4, M['panel'], bevel=0.008))
        for a in (0.45, -0.45): tape_face(-0.05, 0.245, 0.26, 0.62, a, M)
        tape_face(0.505, 0.0, 0.4, 0.2, 1.3, M)
        if state == 'hacked':      # our crew's sticker on it now
            add(mn.cyl('t_sticker', 0.06, 0.006, loc=P(0.38, 0.26, 0.3), m=M['sticker'], rot=(R90, 0, 0), verts=20, bevel=0), False)
            T('t_smile', ':)', 0.38, 0.27, 0.3, 0.06, M['ink'])
    return stxt

def term_screen(M, state):
    """Screen materials per state and frame: returns ({'screen': mat}, text builder after the terminal exists)."""
    if state == 'broken': m = emit_mat('scr_broken', '#3a1612', 0.0, base='#101317')
    elif state == 'fixed': m = emit_mat('scr_fixed', '#1d3a5a', 0.9, base='#0d1a2a')
    else: m = emit_mat('scr_hacked', '#1d5a3e', 0.9, base='#0d2a1a')
    return {'screen': m}

def build_terminal(state):
    M = start(); fm = term_screen(M, state)
    stxt = terminal(M, state, fm)
    frames = None
    if state == 'broken':
        # 3-frame flicker: dead / ERR 0x0BAD in dim red / garbage lines
        err_m = emit_mat('err', '#ff6a5a', 1.0, base='#3a1210'); garb_m = emit_mat('garb', '#ff9a7a', 0.8, base='#3a1210')
        e1 = stxt('err', 'ERR 0x0BAD', 0.06, 0.1, err_m); e2 = stxt('err2', 'SYSTEM HALTED', -0.06, 0.055, err_m)
        gl = []
        for i in range(5):
            o = mn.box('garb', (0.15 + 0.5 * random.Random(i).random(), 0.004, 0.025), m=garb_m, bevel=0)
            o.location = P(-0.15 + 0.2 * random.Random(i + 9).random(), -0.045, 0.9 + i * 0.06); o.rotation_euler.x = math.radians(10); gl.append(add(o, False))
        frames = [1, 2, 3]
        keys_emit(fm['screen'], [0.0, 0.25, 0.0], frames)
        for o in (e1, e2): keys_show(o, [True, False, False], frames)
        for o in gl: keys_show(o, [False, True, False], frames)
    elif state == 'fixed':
        m = emit_mat('locked', '#9cd8ff', 1.1, base='#2a4a6a')
        stxt('lk', 'LOCKED', 0.04, 0.12, m)
        stxt('lk2', 'ENTER ADMIN PASSWORD', -0.09, 0.038, m)
        cur = stxt('cur', '_', -0.155, 0.05, m)
        frames = [1, 2]; keys_show(cur, [True, False], frames)
    else:
        m = emit_mat('open', '#7affb8', 1.1, base='#2a6a4a')
        stxt('op', 'OPEN', 0.05, 0.14, m)
        stxt('op2', 'ACCESS GRANTED  :)', -0.09, 0.042, m)
        stxt('op3', 'barracks door: UNLOCKED', -0.15, 0.03, m)
    render('terminal_' + state, frames=frames, catcher=(2.4, 2.0))

@job('terminal')
def job_terminal():
    for s in ('broken', 'fixed', 'hacked'): build_terminal(s)

# ===================================================================================================
# Docking bay: the docking control (baseGeom console pt(-6.3, -2.4); 2D box 0.58 x 0.42; green while docked,
# blinking yellow once detached: console_docked, console_detached (2 frames))
# ===================================================================================================
def build_console(state):
    M = start()
    add(cbox('c_foot', 0, 0.02, 0.5, 0.4, 0, 0.06, M['dark'], bevel=0.02))
    add(cbox('c_post', 0, -0.0, 0.32, 0.26, 0.05, 0.7, M['body'], bevel=0.03))
    add(ubox('c_post_hz', -0.16, 0.125, 0.16, 0.135, 0.1, 0.24, M['hazard'], bevel=0.003), False)
    head = add(cbox('c_head', 0, 0, 0.58, 0.42, 0, 0.16, M['panel'], bevel=0.03)); head.location = P(0, 0.0, 0.72); head.rotation_euler.x = math.radians(-22)
    top = lambda u, v, dz=0.0: P(u, v * math.cos(math.radians(22)), 0.72 + 0.16 + dz + v * math.sin(math.radians(22)))
    # the status bar and the big button in a hazard ring
    on = state == 'docked'
    bar_m = emit_mat('bar', '#5aff9a' if on else '#ffd84a', 1.2, base='#2a7a4a' if on else '#7a6a1a')
    b = add(mn.box('c_bar', (0.42, 0.06, 0.03), m=bar_m, bevel=0.008), False); b.location = top(0, -0.13); b.rotation_euler.x = math.radians(-22)
    ring_ = add(mn.cyl('c_ring', 0.12, 0.02, loc=top(-0.08, 0.06), m=M['hazard'], verts=24, bevel=0.005)); ring_.rotation_euler.x = math.radians(-22)
    btn = add(mn.cyl('c_btn', 0.085, 0.06, loc=top(-0.08, 0.06, 0.01), m=M['red'] if on else emit_mat('btn', '#ff5a3a', 0.6, base='#a83a3a'), verts=24, bevel=0.025)); btn.rotation_euler.x = math.radians(-22)
    # the 'undock' toggle under a taped-on flap
    flap = add(mn.box('c_flap', (0.12, 0.1, 0.012), m=M['glass'], bevel=0.004), False); flap.location = top(0.17, 0.07, 0.005); flap.rotation_euler.x = math.radians(-22)
    t = add(mn.box('c_tape', (0.18, 0.04, 0.006), m=M['tape'], bevel=0.002), False); t.location = top(0.17, 0.07, 0.014); t.rotation_euler = (math.radians(-22), 0, 0.5)
    T('c_lbl', 'DOCK', 0, 0.215, 0.76, 0.075, M['white'])
    add(ubox('c_sticker', -0.2, 0.135, 0.2, 0.14, 0.4, 0.56, M['sticker'], bevel=0.003), False)
    T('c_sticker_t', 'PUSH ONCE.\nONCE!!', 0, 0.145, 0.48, 0.045, M['ink'], f='hand')
    D.stain(0.15, 0.2, 0.18, M['oil'], OUT, z=0.003)
    frames = None
    if not on:
        frames = [1, 2]; keys_emit(bar_m, [1.2, 0.1], frames); keys_emit(btn.data.materials[0], [0.6, 0.1], frames)
    render('console_' + state, frames=frames, catcher=(1.6, 1.4))

@job('console')
def job_console():
    for s in ('docked', 'detached'): build_console(s)

# ===================================================================================================
# Gun corridor: the brig door's keypad (baseGeom keypad pt(-32.4, -9.85): 0.25 in front of the corridor's
# north wall). Mounted on that wall at z 1.0..1.4; the origin is the game point on the floor.
# keypad_locked (d.doors[2] true: red), keypad_open (green).
# ===================================================================================================
def build_keypad(state):
    M = start(); wv = -0.25
    add(ubox('k_back', -0.21, wv, 0.21, wv + 0.03, 0.92, 1.5, M['iron'], bevel=0.01))
    add(ubox('k_box', -0.17, wv + 0.02, 0.17, wv + 0.1, 0.96, 1.44, M['gunmetal'], bevel=0.02))
    lm = M['red_led'] if state == 'locked' else M['green_led']
    add(ubox('k_lamp', -0.12, wv + 0.09, 0.12, wv + 0.12, 1.36, 1.41, lm, bevel=0.006), False)
    for i in range(12):
        c, r = i % 3, i // 3
        add(ubox('k_key', -0.1 + c * 0.07 - 0.025, wv + 0.09, -0.1 + c * 0.07 + 0.025, wv + 0.115, 1.28 - r * 0.075 - 0.025, 1.28 - r * 0.075 + 0.02, M['white'] if i not in (9, 11) else (M['red'] if i == 9 else M['olive']), bevel=0.006), False)
    T('k_hint', "HINT: IT'S NOT 1234", 0, wv + 0.04, 0.88, 0.032, M['ink'], f='hand')
    add(ubox('k_hint_bg', -0.2, wv + 0.025, 0.2, wv + 0.035, 0.85, 0.91, M['sticker'], bevel=0.002), False)
    add(pipe_uv('k_conduit', [(0.15, wv + 0.03, 1.4), (0.26, wv + 0.03, 1.48), (0.28, wv + 0.03, 1.62)], 0.02, M['rim'], corner=0.05), False)
    tape_face(0.0, wv + 0.1, 1.2, 0.36, 0.25, M, w=0.035)      # (a taped crack across the keys)
    render('keypad_' + state)

@job('keypad')
def job_keypad():
    for s in ('locked', 'open'): build_keypad(s)


# ---------------------------------------------------------------------------------------------------
# Small builders shared by the clutter
# ---------------------------------------------------------------------------------------------------
def grp(objs, u, v, z=0.0, rotz=0.0):
    """Parent parts built around the origin under an empty placed at (u, v, z), turned by rotz (radians,
    clockwise on screen like the game's canvas rotation)."""
    e = mn.link(bpy.data.objects.new('grp', None)); e.location = P(u, v, z); e.rotation_euler.z = -rotz
    for o in objs:
        if o.parent is None: o.parent = e
    return e

def collect(fn, *a, **k):
    """Run a builder and return the parts it added."""
    n = len(OUT); fn(*a, **k); return OUT[n:]

def crate_wood(M, w, d, h, label=None, mtl='wood', lid=True, stencil=None):
    """Planked pirate crate centred on the origin: boards, iron corner bands, a stencil on the front."""
    W = M[mtl]
    add(cbox('cr_core', 0, 0, w - 0.04, d - 0.04, 0.0, h - 0.02, M['wood2'], bevel=0.01))
    n = max(2, round(h / 0.2))
    for i in range(n):                                       # front/back/side boards (slightly uneven)
        z0 = i * h / n + 0.006; z1 = (i + 1) * h / n - 0.006
        for sv in (-1, 1): add(ubox('cr_board', -w / 2 + 0.02, sv * d / 2 - 0.012, w / 2 - 0.02, sv * d / 2 + 0.012, z0, z1, W, bevel=0.01))
        for su in (-1, 1): add(ubox('cr_board', su * w / 2 - 0.012, -d / 2 + 0.02, su * w / 2 + 0.012, d / 2 - 0.02, z0, z1, W, bevel=0.01))
    if lid:
        m = max(2, round(w / 0.22))
        for i in range(m):
            u0 = -w / 2 + i * w / m + 0.008; u1 = -w / 2 + (i + 1) * w / m - 0.008
            add(ubox('cr_lid', u0, -d / 2 + 0.01, u1, d / 2 - 0.01, h - 0.03, h + 0.005, W, bevel=0.01))
    for su in (-1, 1):                                       # iron corner posts
        for sv in (-1, 1): add(ubox('cr_corner', su * w / 2 - 0.035, sv * d / 2 - 0.035, su * w / 2 + 0.035, sv * d / 2 + 0.035, 0, h + 0.01, M['iron'], bevel=0.012))
    add(ubox('cr_band', -w / 2 - 0.01, d / 2 + 0.005, w / 2 + 0.01, d / 2 + 0.025, h * 0.45, h * 0.45 + 0.06, M['iron'], bevel=0.008))
    for su in (-1, 1): add(mn.cyl('nail', 0.015, 0.01, loc=P(su * (w / 2 - 0.08), d / 2 + 0.025, h * 0.45 + 0.03), m=M['steel'], rot=(R90, 0, 0), verts=8, bevel=0), False)
    if stencil: T('cr_st', stencil, 0, d / 2 + 0.03, h * 0.72, min(0.09, 0.8 * w / max(4, len(stencil))), M['black'], f='narrow')

def crate_metal(M, w, d, h, color='olive', stencil=None, lid=True):
    add(cbox('mc_body', 0, 0, w, d, 0, h, M[color], bevel=0.03))
    add(cbox('mc_lid', 0, 0, w + 0.02, d + 0.02, h - 0.06, 0.07, M[color], bevel=0.025))
    for su in (-1, 1): add(ubox('mc_handle', su * (w / 2 + 0.005) - 0.015, -0.12, su * (w / 2 + 0.005) + 0.015, 0.12, h * 0.55, h * 0.62, M['dark'], bevel=0.008), False)
    for su in (-1, 1): add(ubox('mc_latch', su * w * 0.3 - 0.04, d / 2, su * w * 0.3 + 0.04, d / 2 + 0.03, h - 0.14, h - 0.03, M['steel'], bevel=0.008), False)
    if stencil: T('mc_st', stencil, 0, d / 2 + 0.006, h * 0.45, min(0.1, 0.85 * w / max(4, len(stencil))), M['cream'], f='narrow')

def barrel(M, r, h, mtl='red', label=None):
    add(mn.cyl('br', r, h, loc=P(0, 0, 0), m=M[mtl], verts=32, bevel=0.03))
    for z in (0.12, h / 2, h - 0.14): add(ring('br_hoop', r + 0.012, 0.02, 0.04, loc=P(0, 0, z - 0.02), m=M['iron'], verts=32), False)
    add(ring('br_rim', r - 0.01, 0.025, 0.02, loc=P(0, 0, h), m=M['iron'], verts=32), False)
    add(mn.cyl('br_cap', 0.05, 0.02, loc=P(r * 0.45, 0, h), m=M['steel'], verts=12, bevel=0.005), False)
    if label: T('br_lbl', label, 0, r + 0.004, h * 0.62, 0.055, M['cream'], f='narrow')

def bottle(M, glass='bottle_g', h=0.3, r=0.055, label=True):
    gm = M[glass]
    add(mn.cyl('bt', r, h * 0.62, loc=P(0, 0, 0), m=gm, verts=16, bevel=0.02))
    add(mn.cyl('bt_sh', r * 0.55, h * 0.12, loc=P(0, 0, h * 0.6), m=gm, verts=16, bevel=0.015))
    add(mn.cyl('bt_neck', r * 0.35, h * 0.28, loc=P(0, 0, h * 0.7), m=gm, verts=12, bevel=0.008))
    add(mn.cyl('bt_cork', r * 0.36, 0.03, loc=P(0, 0, h * 0.97), m=M['card'], verts=10, bevel=0.005), False)
    if label: add(mn.cyl('bt_lbl', r + 0.003, h * 0.22, loc=P(0, 0, h * 0.2), m=M['cream'], verts=16, bevel=0), False)

# ===================================================================================================
# Gun corridor: the cover (baseGeom H[0..2]: 1.0 x 1.4 floor holes, the origin is the hole's centre;
# cover_0 / cover_2 stand against the south wall, cover_1 against the north wall) and the sentry gun's
# pedestal (H[3]: 1.0 x 1.2 around g.sentry; the gun (hull/gun, scale 0.8) sits on it at z 0.3).
# ===================================================================================================
def build_cover(k):
    M = start()
    if k == 0:       # two planked crates and a steel ammo box on top, taped down; a bottle and a sock
        ps = collect(crate_wood, M, 0.96, 0.66, 0.62, stencil='NOT AMMO'); grp(ps, 0.0, 0.34, 0, 0.03)
        ps = collect(crate_wood, M, 0.94, 0.64, 0.58, mtl='wood2', stencil='FRAGILE'); grp(ps, 0.01, -0.34, 0, -0.04)
        ps = collect(crate_metal, M, 0.72, 0.5, 0.36, 'olive', 'AMMO'); grp(ps, -0.04, 0.0, 0.62, 0.1)
        for a in (0.0, 0.9): tape_flat(-0.04, 0.0, 0.985, 0.62, a + 1.57, M)
        ps = collect(bottle, M, 'bottle_b'); grp(ps, 0.3, 0.42, 0.63, 0)
        add(pipe_uv('sock', [(-0.42, 0.5, 0.64), (-0.47, 0.6, 0.64), (-0.5, 0.67, 0.45), (-0.5, 0.7, 0.36)], 0.035, M['cream'], corner=0.05))
    elif k == 1:     # a steel shelf rack stuffed with junk
        H = 1.3
        for su in (-1, 1):
            for sv in (-1, 1): add(ubox('sh_post', su * 0.47 - 0.03, sv * 0.67 - 0.03, su * 0.47 + 0.03, sv * 0.67 + 0.03, 0, H, M['iron'], bevel=0.01))
        for z in (0.06, 0.5, 0.92):
            add(ubox('sh_shelf', -0.5, -0.7, 0.5, 0.7, z, z + 0.04, M['rim'], bevel=0.01))
        for sv in (-1, 1):
            for z in (0.3, 0.72, 1.1): add(ubox('sh_brace', -0.47, sv * 0.67 - 0.01, 0.47, sv * 0.67 + 0.01, z, z + 0.025, M['iron'], bevel=0.005), False)
        rnd = random.Random(4)
        # bottom: a barrel on its side and a crate
        b = collect(barrel, M, 0.22, 0.8, 'navy', 'WATER?'); e = grp(b, 0.05, -0.25, 0.1, 0); e.rotation_euler = (0, R90, 0); e.location = P(-0.38, -0.3, 0.32)
        ps = collect(crate_metal, M, 0.6, 0.5, 0.34, 'red', 'SPARE PARTS'); grp(ps, 0.12, 0.38, 0.1, 0.05)
        # middle: cans, a toolbox, a rubber duck
        for i in range(5):
            add(mn.cyl('can', 0.06, 0.16, loc=P(-0.32 + i * 0.13, -0.45 + rnd.uniform(-0.05, 0.05), 0.52), m=rnd.choice([M['red'], M['olive'], M['steel']]), verts=16, bevel=0.01))
        add(cbox('tb', 0.15, 0.25, 0.5, 0.26, 0.52, 0.2, M['red'], bevel=0.03)); add(cbox('tb_h', 0.15, 0.25, 0.3, 0.04, 0.72, 0.05, M['dark'], bevel=0.015))
        add(mn.sphere('duck', 0.08, loc=P(-0.3, 0.42, 0.6), m=M['sticker'], scale=(1.2, 1, 0.9), segs=16))
        add(mn.sphere('duck_h', 0.05, loc=P(-0.24, 0.45, 0.7), m=M['sticker'], segs=12)); add(cbox('duck_b', -0.18, 0.47, 0.06, 0.03, 0.68, 0.02, M['amber_led'], bevel=0.008), False)
        # top shelf: boxes, a coil of cable, bottles
        for i, (u, v, w, d, h) in enumerate([(-0.25, -0.42, 0.4, 0.42, 0.28), (0.22, -0.4, 0.38, 0.4, 0.2), (0.18, 0.36, 0.42, 0.44, 0.3)]):
            add(cbox('box', u, v, w, d, 0.94, h, M['card'], bevel=0.015, rotz=rnd.uniform(-0.1, 0.1)))
            tape_flat(u, v, 0.94 + h + 0.001, d - 0.02, 1.57, M, w=0.06, m=M['tape_y'] if i == 1 else None)
        add(ring('coil', 0.16, 0.06, 0.08, loc=P(-0.24, 0.4, 0.96), m=M['cables'][3]))
        for i in range(3):
            ps = collect(bottle, M, 'bottle_g', 0.26); grp(ps, -0.3 + i * 0.12, 0.0, 0.96, 0)
        add(ubox('sh_top', -0.5, 0.64, 0.5, 0.7, H - 0.08, H - 0.02, M['rim'], bevel=0.008))
        add(ubox('sh_top2', -0.5, -0.7, 0.5, -0.64, H - 0.08, H - 0.02, M['rim'], bevel=0.008))
        add(ubox('sh_tag', -0.3, 0.7, 0.3, 0.712, H - 0.24, H - 0.1, M['paper'], bevel=0.003), False)
        T('sh_tag_t', 'STUFF', 0, 0.716, H - 0.17, 0.08, M['ink'], f='hand')
    else:            # two barrels under a tarp corner and a crate
        for su in (-1, 1):
            b = collect(barrel, M, 0.25, 0.86, 'red' if su < 0 else 'olive', 'FLAMMABLE-ISH' if su < 0 else 'GROG'); grp(b, su * 0.24, -0.38, 0, 0.4 * su)
        ps = collect(crate_wood, M, 0.98, 0.6, 0.56, stencil='BOOTY'); grp(ps, 0.0, 0.38, 0, -0.03)
        add(drape('tarp', -0.52, -0.72, 0.1, -0.05, 0.875, (-0.5, -0.63, -0.0, -0.13), worn('tarp', '#4e6a4a', 0.8, 0.0, wear=0.0), seed=3, bump=0.03, hang=2.0, floor=0.3, thick=0.02))
        D.skull(0.0, 0.69, 0.3, 0.16, M['white'], OUT, face=True)
        add(mn.cyl('cup', 0.06, 0.1, loc=P(0.25, 0.4, 0.56), m=M['steel'], verts=16, bevel=0.01))
    render(f'cover_{k}', catcher=(2.2, 2.6))

@job('cover')
def job_cover():
    for k in range(3): build_cover(k)

def build_pedestal(state):
    M = start(); W, Dd = 1.0, 1.2
    add(cbox('pd_plate', 0, 0, W, Dd, 0, 0.05, M['dark'], bevel=0.02))
    for su in (-1, 1):
        for sv in (-1, 1): bolt_flat(su * (W / 2 - 0.07), sv * (Dd / 2 - 0.07), 0.05, M, 0.035)
    add(prism('pd_body', [(-0.42, -0.52), (0.42, -0.52), (0.45, -0.4), (0.45, 0.4), (0.42, 0.52), (-0.42, 0.52), (-0.45, 0.4), (-0.45, -0.4)], 0.05, 0.27, M['gunmetal'], bevel=0.02))
    add(ubox('pd_hz', -0.42, 0.515, 0.42, 0.53, 0.07, 0.13, M['hazard'], bevel=0.003), False)
    add(cbox('pd_deck', 0, 0, 0.86, 1.06, 0.27, 0.03, M['steel'], bevel=0.012))
    add(ring('pd_ring', 0.38, 0.06, 0.03, loc=P(0, 0, 0.29), m=M['iron'], verts=40))
    for i in range(8):
        a = i * math.pi / 4; bolt_flat(0.35 * math.cos(a), 0.35 * math.sin(a), 0.315, M, 0.018)
    T('pd_st', 'DO NOT HUG', 0, 0.47, 0.302, 0.06, M['white'], face=False, f='narrow')
    # the power cell hatch on the front face
    if state == 'on':
        add(ubox('pd_hatch', -0.2, 0.515, 0.2, 0.545, 0.14, 0.255, M['steel'], bevel=0.008))
        T('pd_hatch_t', 'POWER CELL', 0, 0.55, 0.2, 0.035, M['ink'])
        add(ubox('pd_led', 0.24, 0.52, 0.3, 0.54, 0.18, 0.22, M['red_led'], bevel=0.004), False)
        screws(-0.2, 0.2, 0.545, 0.14, 0.255, M, 0.012, 0.025)
    else:
        add(ubox('pd_hole', -0.18, 0.51, 0.18, 0.535, 0.15, 0.25, M['black'], bevel=0.003), False)
        h = add(mn.box('pd_hatch', (0.4, 0.025, 0.115), m=M['steel'], bevel=0.008)); h.location = P(0.0, 0.62, 0.07); h.rotation_euler = (math.radians(-75), 0, 0.1)
        add(ubox('pd_led', 0.24, 0.52, 0.3, 0.54, 0.18, 0.22, M['lamp_dead'], bevel=0.004), False)
        for i, (a, b) in enumerate([(-0.08, 0.3), (0.05, 0.45), (0.12, 0.2)]):
            add(pipe_uv('pd_rip', [(a, 0.52, 0.2), (a + 0.03, 0.62, 0.18), (b, 0.72 + 0.05 * i, 0.04)], 0.016, M['cables'][i], corner=0.05), False)
            add(ucyl('pd_end', 0.018, 0.03, b, 0.74 + 0.05 * i, 0.025, M['copper'], verts=8), False)
        D.stain(0.15, 0.42, 0.2, M['scorch'], OUT, z=0.302)
    # the feed cable out of the back, to the corridor's north wall, taped down
    add(pipe_uv('pd_feed', [(0.25, -0.5, 0.15), (0.3, -0.7, 0.03), (0.35, -1.0, 0.03), (0.3, -1.55, 0.03)], 0.04, M['rubber'], corner=0.15))
    tape_flat(0.33, -1.15, 0.065, 0.24, 0.0, M)
    render('sentry_pedestal' + ('' if state == 'on' else '_off'), catcher=(2.0, 3.0))

@job('pedestal')
def job_pedestal():
    for s in ('on', 'off'): build_pedestal(s)

# ===================================================================================================
# Brig: the cell bars (drawBase: a line of bars along the room's height at x = g.cellX, a door gap at
# g.cellGap = y-15.5 .. y-13.7). Origin: (g.cellX, room centre y = y-14.6); the bars span v -3.9 .. +3.9,
# the door v -0.9 .. +0.9. cell_bars_closed (Dr. Varga still inside), cell_bars_open_port / _star (her door
# hangs open, swung out into the room: +x on the port layout, -x on starboard).
# ===================================================================================================
def bar_run(M, v0, v1, H, name='bar'):
    n = max(1, round((v1 - v0) / 0.32)); step = (v1 - v0) / n
    for i in range(1, n):
        vv = v0 + i * step                                   # flat bars, broad side across the line (reads from above)
        add(ubox(name, -0.045, vv - 0.016, 0.045, vv + 0.016, 0.06, H - 0.06, M['iron'], bevel=0.008))
        add(mn.sphere('bar_cap', 0.035, loc=P(0, vv, H - 0.02), m=M['gunmetal'], scale=(1.4, 0.7, 0.6), segs=10), False)
    for z in (0.0, H - 0.1):
        add(ubox(name + '_rail', -0.07, v0, 0.07, v1, z, z + 0.08, M['gunmetal'], bevel=0.012))
    add(ubox(name + '_mid', -0.06, v0, 0.06, v1, 0.7, 0.78, M['gunmetal'], bevel=0.01))

def build_bars(state, side='port'):
    M = start(); set_side(side); H = 1.55
    for v0, v1 in ((-3.9, -0.95), (0.95, 3.9)): bar_run(M, v0, v1, H)
    add(ubox('sill', -0.16, -3.95, 0.16, 3.95, 0.0, 0.035, M['dark'], bevel=0.01))
    for v0, v1 in ((-3.9, -1.0), (1.0, 3.9)): add(ubox('sill_hz', -0.15, v0, 0.15, v1, 0.035, 0.04, M['hazard'], bevel=0.0), False)
    for vv in (-3.4, -2.2, -1.4, 1.4, 2.2, 3.4):
        for su in (-1, 1): bolt_flat(su * 0.11, vv, 0.04, M, 0.02)
    for vv in (-3.9, -0.95, 0.95, 3.9):
        add(ubox('post', -0.07, vv - 0.07, 0.07, vv + 0.07, 0, H + 0.04, M['gunmetal'], bevel=0.015))
    add(ubox('lintel', -0.06, -0.95, 0.06, 0.95, H - 0.08, H, M['gunmetal'], bevel=0.012))
    # the door: its own little bar run, hinged at v = -0.92
    n = len(OUT); bar_run(M, 0.0, 1.78, H - 0.1, 'door')
    add(ubox('door_stile', -0.045, 1.72, 0.045, 1.8, 0.0, H - 0.1, M['gunmetal'], bevel=0.01))
    add(ubox('lockbox', -0.1, 1.5, 0.1, 1.72, 0.62, 0.9, M['steel'], bevel=0.02))
    add(ucyl('keyhole', 0.02, 0.01, 0.1, 1.61, 0.78, M['black'], axis='u', verts=10), False)
    parts = OUT[n:]
    e = grp(parts, 0, -0.92, 0.02, 0)
    if state == 'open': e.rotation_euler.z = D.S * math.radians(105)      # swung out to +u (port) / -u (starboard)
    # a tin cup hanging on a bar, a CELL plaque, a padlock on the closed door
    add(ubox('cell_plq', -0.03, 2.0, 0.03, 2.6, H - 0.4, H - 0.15, M['cream'], bevel=0.008))
    o = T('cell_plq_t', 'CELL 2', 0.035, 2.3, H - 0.275, 0.09, M['ink'], face=False, f='narrow'); o.rotation_euler = (R90, 0, D.S * R90)
    add(ucyl('cup', 0.05, 0.1, 0.08, 2.9, 0.8, M['steel'], verts=16), False)
    add(ucyl('cup_h', 0.018, 0.06, 0.045, 2.9, 0.86, M['steel'], axis='u', verts=8), False)
    if state == 'closed':
        add(ring('padlock_shackle', 0.05, 0.015, 0.02, loc=P(0.12, 0.74, 0.86), m=M['steel'], rot=(0, R90, 0), verts=16), False)
        add(cbox('padlock', 0.13, 0.74, 0.04, 0.1, 0.72, 0.1, M['gold'], bevel=0.015))
    render('cell_bars_' + (state if state == 'closed' else f'open_{side}'), ol=0.012)

@job('bars')
def job_bars():
    build_bars('closed'); build_bars('open', 'port'); build_bars('open', 'star')


# ===================================================================================================
# Server room: the racks (new: the game draws none yet). One rack 0.8 x 0.8 x 1.45, the bank of three 2.5 x 0.8
# (meant for the server room's back wall, v -4 .. -3.2, right of the barracks door; the concept had them at
# x -15.7 .. -13.8). LEDs blink in a 4-frame loop; the middle rack's "CPU" is a hamster in a wheel.
# ===================================================================================================
def led_bank(seed):
    """Blinking LED materials: per colour, four phase groups with their own on/off pattern over 4 frames."""
    rnd = random.Random(seed); cols = {'r': ('#ff3a2a', '#5a1a14'), 'b': ('#4ab8ff', '#1a3a5a'), 'g': ('#5aff9a', '#1a5a3a'), 'a': ('#ffb43a', '#5a4a1a')}
    bank = {}
    for c, (e, b) in cols.items():
        for ph in range(4):
            m = emit_mat(f'led_{c}{ph}', e, 1.4, base=b)
            pat = [rnd.random() < 0.6 for _ in FR4]
            if ph == 0: pat = [True] * 4                            # (some stay on)
            keys_emit(m, [1.4 if on else 0.05 for on in pat])
            bank[(c, ph)] = m
    return bank

def rack(M, LED, u, rnd, hamster=False, label=None):
    W, Dd, H = 0.8, 0.8, 1.45
    body = add(cbox('rk_body', u, 0, W, Dd, 0, H, M['body'], bevel=0.035))
    if hamster: D.bool_cut(body, [ubox('cut', u - 0.34, Dd / 2 - 0.32, u + 0.34, Dd / 2 + 0.2, 0.72, 1.14, bevel=0)])
    add(cbox('rk_top', u, 0, W - 0.08, Dd - 0.08, H, 0.02, M['panel2'], bevel=0.01))
    for k in range(5): add(ubox('rk_vent', u - 0.3, 0.06 + k * 0.05, u + 0.3, 0.08 + k * 0.05, H + 0.02, H + 0.024, M['black'], bevel=0), False)
    for i in range(3): add(ubox('rk_fan', u - 0.25 + i * 0.25 - 0.09, -0.2, u - 0.25 + i * 0.25 + 0.09, 0.0, H + 0.005, H + 0.03, M['iron'], bevel=0.008), False)
    face = add(ubox('rk_face', u - 0.36, Dd / 2 - 0.01, u + 0.36, Dd / 2 + 0.01, 0.08, H - 0.06, M['dark'], bevel=0.01))
    if hamster: D.bool_cut(face, [ubox('cut', u - 0.34, Dd / 2 - 0.32, u + 0.34, Dd / 2 + 0.2, 0.72, 1.14, bevel=0)])
    for su in (-1, 1): add(ubox('rk_rail', u + su * 0.37 - 0.02, Dd / 2, u + su * 0.37 + 0.02, Dd / 2 + 0.03, 0.06, H - 0.04, M['steel'], bevel=0.008))
    slots = [z for z in [0.14 + r * 0.135 for r in range(9)]]
    for r, z in enumerate(slots):
        if hamster and 0.7 < z < 1.12: continue
        add(ubox('rk_slot', u - 0.33, Dd / 2 + 0.005, u + 0.33, Dd / 2 + 0.025, z, z + 0.11, M['panel'], bevel=0.006))
        add(ubox('rk_grill', u - 0.3, Dd / 2 + 0.024, u - 0.05, Dd / 2 + 0.03, z + 0.03, z + 0.08, M['iron'], bevel=0.0), False)
        for q in range(4):
            c = rnd.choice('rrbbgga')
            add(cbox('led', u + 0.05 + q * 0.065, Dd / 2 + 0.03, 0.035, 0.012, z + 0.04, 0.03, LED[(c, rnd.randrange(4))], bevel=0.0), False)
    if hamster:     # the CPU: a hamster in a wheel behind a little window
        z0 = 0.72
        add(ubox('hm_back', u - 0.34, Dd / 2 - 0.33, u + 0.34, Dd / 2 - 0.31, z0, z0 + 0.42, M['card'], bevel=0.0), False)
        for k in range(5): add(ubox('hm_shav', u - 0.3 + k * 0.13, Dd / 2 - 0.25 + 0.03 * (k % 2), u - 0.24 + k * 0.13, Dd / 2 - 0.2 + 0.03 * (k % 2), z0 + 0.03, z0 + 0.045, M['cream'], bevel=0.005), False)
        add(ubox('hm_floor', u - 0.34, Dd / 2 - 0.32, u + 0.34, Dd / 2, z0, z0 + 0.03, M['card'], bevel=0.005), False)
        wheel = mn.link(bpy.data.objects.new('hm_wheel', None)); wheel.location = P(u - 0.06, Dd / 2 - 0.12, z0 + 0.2)
        rim = add(ring('hm_rim', 0.17, 0.025, 0.1, loc=(0, 0.05, 0), m=M['steel'], rot=(R90, 0, 0), verts=32), False); rim.parent = wheel
        for k in range(6):
            sp = add(mn.box('hm_spoke', (0.32, 0.012, 0.012), m=M['steel'], bevel=0), False); sp.parent = wheel
            sp.location = (0, 0.04, 0); sp.rotation_euler = (0, k * math.pi / 6, 0)
        for f, a in zip(FR4, (0, 15, 30, 45)):
            wheel.rotation_euler = (0, math.radians(a), 0); wheel.keyframe_insert('rotation_euler', frame=f)
        hm = mn.link(bpy.data.objects.new('hm', None)); hm.location = P(u - 0.06, Dd / 2 - 0.1, z0 + 0.09)
        body = add(mn.sphere('hm_body', 0.08, m=worn('hamster', '#d89a5a', 0.8, 0.0, wear=0.0, grime=0.3), scale=(1.3, 0.9, 0.85), segs=16)); body.parent = hm
        head = add(mn.sphere('hm_head', 0.05, loc=(-0.09, -0.01, 0.025), m=body.data.materials[0], segs=12)); head.parent = hm
        for e in (-1, 1):
            ear = add(mn.sphere('hm_ear', 0.018, loc=(-0.08, e * 0.03, 0.07), m=M['skin'], segs=8), False); ear.parent = hm
        eye = add(mn.sphere('hm_eye', 0.012, loc=(-0.13, -0.035, 0.035), m=M['black'], segs=8), False); eye.parent = hm
        for f, b in zip(FR4, (0.0, 0.02, 0.0, 0.02)):
            hm.location.z = z0 + 0.09 + b; hm.keyframe_insert('location', frame=f)
        add(ubox('hm_glass', u - 0.34, Dd / 2 + 0.005, u + 0.34, Dd / 2 + 0.015, z0, z0 + 0.42, mn.mat('hm_glass', '#9cc8e0', 0.05, 0.0), bevel=0.004), False)
        hg = bpy.data.materials['hm_glass'].node_tree.nodes['Principled BSDF']; hg.inputs['Alpha'].default_value = 0.15
        add(ubox('hm_lbl', u - 0.12, Dd / 2 + 0.02, u + 0.12, Dd / 2 + 0.025, z0 + 0.43, z0 + 0.5, M['sticker'], bevel=0.002), False)
        T('hm_lbl_t', 'CPU', u, Dd / 2 + 0.03, z0 + 0.465, 0.05, M['ink'])
        add(cbox('hm_seed', u + 0.2, Dd / 2 - 0.1, 0.1, 0.08, z0 + 0.03, 0.03, M['card'], bevel=0.01), False)
    if label: T('rk_lbl', label, u, Dd / 2 + 0.035, H - 0.02 - 0.04, 0.045, M['sticker'], f='narrow')

def rack_cables(M, us, H=1.45):
    """Spaghetti over the tops: loops between the racks, a bundle going up off-screen at the back."""
    rnd = random.Random(7)
    for i in range(5):
        a, b = rnd.choice(us), rnd.choice(us)
        if a == b: b = a + 0.3
        pts = [(a + rnd.uniform(-0.2, 0.2), -0.25 + i * 0.08, H + 0.02), ((a + b) / 2, -0.1 + i * 0.07, H + 0.12 + 0.05 * i), (b + rnd.uniform(-0.2, 0.2), -0.2 + i * 0.06, H + 0.02)]
        add(pipe_uv('cab', pts, 0.022, M['cables'][i % 5], corner=0.2), False)
    for i, u in enumerate(us):
        add(pipe_uv('cab_up', [(u + 0.2, -0.32, H), (u + 0.22, -0.38, H + 0.18), (u + 0.25, -0.4, H + 0.3)], 0.035, M['cables'][(i + 2) % 5], corner=0.08), False)

def build_racks(n):
    M = start(); LED = led_bank(11); rnd = random.Random(5)
    us = [0.0] if n == 1 else [-0.84, 0.0, 0.84]
    for i, u in enumerate(us): rack(M, LED, u, rnd, hamster=(n == 3 and i == 1), label=['NODE 1', 'NODE 2', 'NODE 3'][i] if n == 3 else 'NODE 4')
    rack_cables(M, us)
    if n == 3:
        add(ubox('rk_note', 0.62, 0.41, 1.06, 0.42, 0.98, 1.16, M['sticker'], bevel=0.003), False)
        T('rk_note_t', 'DO NOT\nUNPLUG', 0.84, 0.425, 1.07, 0.05, M['ink'], f='hand')
        tape_face(-0.84, 0.43, 0.8, 0.6, 0.7, M); tape_face(-0.84, 0.432, 0.8, 0.5, -0.5, M)
        add(ubox('rk_kick', -1.15, 0.41, -0.95, 0.42, 0.18, 0.3, M['iron'], bevel=0.0), False)    # (a boot scuff)
    render('server_racks' if n == 3 else 'server_rack', frames=FR4, catcher=(3.6, 1.8))

@job('racks')
def job_racks():
    build_racks(3); build_racks(1)

# ===================================================================================================
# Server room: the CCTV wall (new). A cabinet against the back wall, 2.7 x 0.35 x 1.6, six feeds in a 4-frame
# loop (a guard pacing, the cat on the bay console, a red REC feed, NO SIGNAL, a taped-over dead one, two
# pirates playing cards). Meant for the server room's back wall left of the barracks door, behind the terminal.
# ===================================================================================================
def build_cctv():
    M = start(); W, Dd, H = 2.7, 0.35, 1.6; fv = Dd / 2
    add(cbox('cc_body', 0, 0, W, Dd, 0, H, M['panel2'], bevel=0.03))
    add(cbox('cc_base', 0, 0.02, W + 0.04, Dd + 0.04, 0, 0.12, M['dark'], bevel=0.015))
    add(cbox('cc_cap', 0, 0, W + 0.06, Dd + 0.04, H, 0.05, M['body'], bevel=0.02))
    feed = emit_mat('feed', '#6a9ab8', 0.6, base='#1a2a36'); feed_r = emit_mat('feed_r', '#ff5a4a', 0.7, base='#3a0a08')
    nos = emit_mat('nosig', '#3a5ab8', 0.7, base='#10183a'); dead = mn.mat('cc_dead', '#10161c', 0.06, 0.0, clearcoat=1.0)
    sil = pmat('sil', '#0e1418', 0.8); white_e = emit_mat('cc_txt', '#e8f0ff', 1.0)
    rec = emit_mat('rec', '#ff3a2a', 1.4, base='#5a1a14'); keys_emit(rec, [1.4, 1.4, 0.0, 0.0])
    kinds = ['guard', 'cat', 'red', 'cards', 'nosig', 'dead']
    sw, sh = 0.78, 0.42
    for i in range(3):
        for j in range(2):
            cu = -0.88 + i * 0.88; z = 0.5 + (1 - j) * 0.52; kind = kinds[i + 3 * j]
            add(ubox('cc_bezel', cu - sw / 2 - 0.04, fv, cu + sw / 2 + 0.04, fv + 0.05, z - 0.04, z + sh + 0.04, M['dark'], bevel=0.015))
            mat = {'red': feed_r, 'nosig': nos, 'dead': dead}.get(kind, feed)
            add(ubox('cc_scr', cu - sw / 2, fv + 0.04, cu + sw / 2, fv + 0.055, z, z + sh, mat, bevel=0.003), False)
            fz = fv + 0.06
            def fbox(name, a, b, c, d, m=sil): return add(ubox(name, a, fz, b, fz + 0.004, c, d, m, bevel=0), False)
            if kind in ('guard', 'cat', 'red', 'cards'):
                fbox('fd_floor', cu - sw / 2 + 0.02, cu + sw / 2 - 0.02, z + 0.02, z + 0.08)
                add(ubox('fd_door', cu + 0.12, fz - 0.001, cu + 0.28, fz + 0.002, z + 0.08, z + 0.32, M['dark'], bevel=0), False)
            if kind == 'guard' or kind == 'red':
                g = mn.link(bpy.data.objects.new('fd_guard', None)); g.location = P(cu, fz, z)
                for o in (mn.box('fd_body', (0.07, 0.004, 0.14), loc=(0, 0, 0.08), m=sil, bevel=0),
                          mn.cyl('fd_head', 0.035, 0.004, loc=(0, 0, 0.26), m=sil, rot=(R90, 0, 0), verts=12, bevel=0),
                          mn.box('fd_gun', (0.1, 0.004, 0.02), loc=(0.05, 0, 0.16), m=sil, bevel=0)):
                    add(o, False); o.parent = g
                path = (-0.25, -0.12, 0.0, -0.12) if kind == 'guard' else (0.05, 0.05, 0.08, 0.05)
                for f, x in zip(FR4, path): g.location.x = cu + x; g.keyframe_insert('location', frame=f)
            if kind == 'cat':       # Admiral Whiskers, tail flicking
                add(mn.sphere('fd_cat', 0.07, loc=P(cu - 0.1, fz + 0.002, z + 0.13), m=sil, scale=(1.4, 0.05, 0.6), segs=12), False)
                add(mn.cyl('fd_cath', 0.04, 0.004, loc=P(cu - 0.22, fz, z + 0.17), m=sil, rot=(R90, 0, 0), verts=12, bevel=0), False)
                for k, a in enumerate((0.3, 0.9, 0.5, 1.1)):
                    t = add(mn.box('fd_tail', (0.12, 0.004, 0.018), m=sil, bevel=0), False); t.location = P(cu + 0.04 + 0.05 * math.cos(a), fz, z + 0.15 + 0.05 * math.sin(a)); t.rotation_euler = (0, -a, 0)
                    keys_show(t, [q == k for q in range(4)])
            if kind == 'cards':
                fbox('fd_table', cu - 0.15, cu + 0.15, z + 0.12, z + 0.15)
                for su in (-1, 1):
                    fbox('fd_p', cu + su * 0.22 - 0.035, cu + su * 0.22 + 0.035, z + 0.08, z + 0.22)
                    add(mn.cyl('fd_ph', 0.033, 0.004, loc=P(cu + su * 0.22, fz, z + 0.26), m=sil, rot=(R90, 0, 0), verts=12, bevel=0), False)
                arm = fbox('fd_arm', cu - 0.2, cu - 0.08, z + 0.17, z + 0.19)
                for f, dz in zip(FR4, (0, 0.03, 0, 0.03)): arm.location.z = z + 0.17 + dz; arm.keyframe_insert('location', frame=f)
            if kind == 'red':
                add(mn.cyl('fd_rec', 0.025, 0.004, loc=P(cu - sw / 2 + 0.07, fz + 0.004, z + sh - 0.06), m=rec, rot=(R90, 0, 0), verts=12, bevel=0), False)
                T('fd_rec_t', 'REC', cu - sw / 2 + 0.16, fz + 0.004, z + sh - 0.06, 0.04, rec)
            if kind == 'nosig':
                T('fd_ns', 'NO SIGNAL', cu, fz, z + sh / 2, 0.07, white_e, f='mono')
                bars = [add(ubox('fd_static', cu - sw / 2 + 0.01, fz, cu + sw / 2 - 0.01, fz + 0.003, z + 0.05 + k * 0.08, z + 0.065 + k * 0.08, white_e, bevel=0), False) for k in range(4)]
                for k, b in enumerate(bars): keys_show(b, [(k + f) % 3 == 0 for f in range(4)])
            if kind == 'dead':
                tape_face(cu, fv + 0.07, z + sh / 2, 0.86, 0.35, M); tape_face(cu, fv + 0.072, z + sh / 2, 0.86, -0.35, M)
            T('fd_lbl', {'guard': 'CAM 1 BAY', 'cat': 'CAM 2 SERVER', 'red': 'CAM 3 CORRIDOR', 'cards': 'CAM 4 BARRACKS', 'nosig': 'CAM 5 BRIG', 'dead': 'CAM 6 ???'}[kind],
              cu, fv + 0.06, z - 0.02, 0.028, M['white'], f='mono')
    # the header, the captain's webcam (taped over), a password sticky note, cables out of the top
    add(ubox('cc_hdr', -0.6, fv, 0.6, fv + 0.02, 1.5, 1.58, M['steel'], bevel=0.006))
    T('cc_hdr_t', 'SECURITY  ·  CAPTAIN ONLY', 0, fv + 0.025, 1.54, 0.05, M['ink'])
    add(cbox('cc_cam', 0.95, 0.0, 0.2, 0.16, H + 0.05, 0.13, M['dark'], bevel=0.03))
    add(ucyl('cc_lens', 0.045, 0.03, 0.95, 0.08, H + 0.115, M['glass'], axis='v', verts=16), False)
    for a in (0.6, -0.6): tape_face(0.95, 0.1, H + 0.115, 0.26, a, M, w=0.06)
    add(ubox('cc_note', 1.18, fv + 0.03, 1.36, fv + 0.035, 1.3, 1.46, M['sticker'], bevel=0.002), False)
    T('cc_note_t', 'PW:\npassword1', 1.27, fv + 0.04, 1.38, 0.035, M['ink'], f='hand')
    for i, u in enumerate((-1.0, -0.2, 0.6)):
        add(pipe_uv('cc_cab', [(u, -0.05, H + 0.04), (u + 0.1, -0.1, H + 0.2), (u + 0.12, -0.15, H + 0.32)], 0.03, M['cables'][i], corner=0.08), False)
    render('cctv_wall', frames=FR4, catcher=(3.6, 1.4))

@job('cctv')
def job_cctv(): build_cctv()

# ===================================================================================================
# Server room: the GROG machine (new; the concept had it by the bay door, x -13.5, y +2.9). 0.8 x 0.6 x 1.6,
# the marquee flickers (2 frames: GROG / G_OG).
# ===================================================================================================
def build_grog():
    M = start(); W, Dd, H = 0.8, 0.6, 1.6; fv = Dd / 2
    gb = add(cbox('gr_body', 0, 0, W, Dd, 0.04, H - 0.04, M['red'], bevel=0.04))
    D.bool_cut(gb, [ubox('cut', -0.33, fv - 0.26, 0.13, fv + 0.2, 0.53, 1.37, bevel=0)])
    add(cbox('gr_feet', 0, 0, W - 0.1, Dd - 0.1, 0, 0.06, M['dark'], bevel=0.01))
    # the window with spiral shelves of bottles and snacks
    for a, b, c, d in ((-0.37, -0.33, 0.5, 1.4), (0.13, 0.17, 0.5, 1.4), (-0.37, 0.17, 0.5, 0.54), (-0.37, 0.17, 1.36, 1.4)):
        add(ubox('gr_win_frame', a, fv - 0.01, b, fv + 0.025, c, d, M['dark'], bevel=0.008))
    add(ubox('gr_inside', -0.33, fv - 0.27, 0.13, fv - 0.25, 0.53, 1.37, M['dark'], bevel=0.0), False)
    add(ubox('gr_lamp', -0.31, fv - 0.24, 0.11, fv - 0.2, 1.33, 1.36, emit_mat('gr_lamp', '#fff0d0', 1.0), bevel=0.0), False)
    rnd = random.Random(3)
    for r, z in enumerate((0.55, 0.83, 1.11)):
        add(ubox('gr_shelf', -0.33, fv - 0.25, 0.13, fv - 0.02, z, z + 0.02, M['steel'], bevel=0.003), False)
        for c in range(3):
            u = -0.26 + c * 0.155
            if r == 1 and c == 2:          # the classic: a bottle stuck, leaning out of its spiral
                ps = collect(bottle, M, 'bottle_g', 0.22, 0.04); e = grp(ps, u, fv - 0.1, z + 0.03, 0); e.rotation_euler.x = math.radians(-35); continue
            if r == 2:                    # snack bags on the top shelf
                add(cbox('gr_snack', u, fv - 0.12, 0.11, 0.05, z + 0.02, 0.18, rnd.choice([M['sticker'], M['navy'], M['olive']]), bevel=0.02))
                continue
            ps = collect(bottle, M, 'bottle_g' if (r + c) % 2 else 'bottle_b', 0.22, 0.04); grp(ps, u, fv - 0.12, z + 0.02, 0)
            add(pipe_uv('gr_coil', [(u - 0.05, fv - 0.03, z + 0.05), (u + 0.05, fv - 0.03, z + 0.08)], 0.008, M['steel'], corner=0.0), False)
    glass = add(ubox('gr_glass', -0.34, fv + 0.005, 0.14, fv + 0.012, 0.52, 1.38, mn.mat('gr_glass', '#b8d8e8', 0.04, 0.0), bevel=0.003), False)
    gl_ = bpy.data.materials['gr_glass'].node_tree.nodes['Principled BSDF']; gl_.inputs['Alpha'].default_value = 0.18
    for k, (a, l) in enumerate(((0.5, 0.22), (-0.4, 0.16), (1.6, 0.12))):     # a cracked pane (someone tried to get a free one)
        c = add(mn.box('gr_crack', (l, 0.003, 0.007), m=M['white'], bevel=0), False); c.location = P(-0.18 + math.cos(a) * l / 2, fv + 0.014, 0.98 + math.sin(a) * l / 2); c.rotation_euler = (0, -a, 0)
    # the control column: keypad, coin slot (DOUBLOONS ONLY), the tray
    add(ubox('gr_col', 0.2, fv - 0.005, 0.37, fv + 0.02, 0.5, 1.4, M['panel2'], bevel=0.01))
    for i in range(9):
        add(ubox('gr_key', 0.22 + (i % 3) * 0.045, fv + 0.018, 0.255 + (i % 3) * 0.045, fv + 0.03, 1.12 - (i // 3) * 0.045, 1.15 - (i // 3) * 0.045, M['white'], bevel=0.004), False)
    add(ubox('gr_coin', 0.255, fv + 0.018, 0.315, fv + 0.03, 0.88, 0.98, M['steel'], bevel=0.006), False)
    add(ubox('gr_coin_s', 0.28, fv + 0.029, 0.29, fv + 0.032, 0.9, 0.96, M['black'], bevel=0), False)
    T('gr_coin_t', 'DOUBLOONS\nONLY', 0.285, fv + 0.025, 0.8, 0.022, M['sticker'], f='narrow')
    add(ubox('gr_tray', -0.3, fv - 0.02, 0.1, fv + 0.04, 0.16, 0.36, M['dark'], bevel=0.02))
    add(ubox('gr_flap', -0.28, fv + 0.035, 0.08, fv + 0.045, 0.2, 0.33, M['gunmetal'], bevel=0.006), False)
    # the marquee
    add(ubox('gr_marq', -0.38, fv - 0.02, 0.38, fv + 0.05, 1.42, 1.58, M['dark'], bevel=0.02))
    lit = emit_mat('grog_lit', '#ffb43a', 1.3, base='#7a5a1a'); lit_r = emit_mat('grog_r', '#ffb43a', 1.3, base='#7a5a1a')
    keys_emit(lit_r, [1.3, 0.04], [1, 2])
    for ch, u in zip('GROG', (-0.2, -0.067, 0.067, 0.2)):
        T('gr_l', ch, u, fv + 0.055, 1.5, 0.13, lit_r if ch == 'R' else lit)
    # wear and jokes: a dent with a KICK HERE sticker, duct tape on the side seam, a skull, a grog puddle
    add(ubox('gr_kick', 0.15, fv + 0.02, 0.38, fv + 0.025, 0.3, 0.42, M['sticker'], bevel=0.002), False)
    T('gr_kick_t', 'KICK HERE', 0.265, fv + 0.028, 0.36, 0.03, M['ink'], f='hand')
    add(mn.sphere('gr_dent', 0.07, loc=P(0.3, fv + 0.04, 0.22), m=M['red'], scale=(1, 0.25, 0.8), segs=12))
    tape_face(0.41, -0.05, 0.9, 0.4, 1.4, M); tape_face(0.41, 0.05, 1.0, 0.3, 1.7, M)
    D.skull(-0.1, fv + 0.012, 0.42, 0.11, M['white'], OUT, face=True)
    D.stain(-0.1, 0.32, 0.17, decal_mat('grog_puddle', '#5a3a14', 0.7, rough=0.1), OUT, sv=0.6, z=0.004)
    render('grog_machine', frames=[1, 2], catcher=(1.8, 1.6))

@job('grog')
def job_grog(): build_grog()

# ===================================================================================================
# Server room: Captain Red Comet's chair (new; stolen leather throne, CAPT. on the back, seen from behind as it
# faces his desk) and a spare office chair with cut duct tape and an ON BREAK sign (a guard was taped to it).
# Footprint ~0.8 x 0.8 each, origin under the post.
# ===================================================================================================
def office_chair(M, seat_m, back_h=0.6, gold=False):
    add(ucyl('ch_post', 0.045, 0.36, 0, 0, 0.06, M['steel'], verts=16))
    for a in range(5):
        ang = a * 2 * math.pi / 5 + 0.3
        add(cbox('ch_leg', 0.17 * math.cos(ang), 0.17 * math.sin(ang), 0.36, 0.06, 0.03, 0.04, M['gunmetal'], bevel=0.012, rotz=ang))
        add(mn.sphere('ch_wheel', 0.035, loc=P(0.33 * math.cos(ang), 0.33 * math.sin(ang), 0.035), m=M['rubber'], segs=10), False)
    add(cbox('ch_seat', 0, 0, 0.62, 0.58, 0.4, 0.13, seat_m, bevel=0.05))
    add(cbox('ch_back', 0, -0.3, 0.66, 0.14, 0.48, back_h, seat_m, bevel=0.06))
    for su in (-1, 1):
        add(cbox('ch_arm_p', su * 0.33, 0.0, 0.05, 0.05, 0.45, 0.16, M['steel'], bevel=0.01))
        add(cbox('ch_arm', su * 0.33, 0.02, 0.09, 0.4, 0.6, 0.06, seat_m, bevel=0.025))

def build_chair(kind):
    M = start()
    if kind == 'capt':
        # facing away from the camera (towards his desk): we see the back with the skull and CAPT.
        office_chair(M, M['leather'], 0.82)
        add(cbox('ch_trim', 0, -0.3, 0.7, 0.16, 1.28, 0.07, M['gold'], bevel=0.03))
        for su in (-1, 1): add(mn.sphere('ch_knob', 0.05, loc=P(su * 0.34, -0.3, 1.36), m=M['gold'], segs=12))
        # the back faces the camera? no: the chair faces up-screen, so its back's south face is towards us
        D.skull(0, -0.225, 0.98, 0.32, M['white'], OUT, face=True)
        T('ch_lbl', 'CAPT.', 0, -0.225, 0.62, 0.1, M['gold'], f='serif')
        tape_face(0.22, -0.225, 1.12, 0.2, 0.6, M, w=0.05)       # (a split in the leather)
        add(cbox('ch_cushion', 0.05, 0.05, 0.4, 0.3, 0.53, 0.06, worn('cushion', '#c8a030', 0.7, 0.0, wear=0.0), bevel=0.03))
        render('chair_capt', catcher=(1.6, 1.6))
    else:
        office_chair(M, M['panel2'], 0.6)
        for i, z in enumerate((0.62, 0.8, 0.96)):        # tape loops, cut open, hanging
            add(pipe_uv('ch_tape', [(-0.34, -0.22, z), (-0.36, -0.05, z - 0.05), (-0.3, 0.12, z - 0.18 - 0.04 * i), (-0.25, 0.18, z - 0.32)], 0.012, M['tape'], corner=0.05), False)
            add(pipe_uv('ch_tape', [(0.34, -0.22, z), (0.37, -0.02, z - 0.08), (0.36, 0.1, z - 0.3)], 0.012, M['tape'], corner=0.05), False)
        add(ring('ch_roll', 0.08, 0.04, 0.06, loc=P(0.12, 0.08, 0.53), m=M['tape']))
        sign = add(cbox('ch_sign', 0, -0.22, 0.46, 0.02, 0.98, 0.26, M['cream'], bevel=0.008)); sign.rotation_euler.z = 0.05
        T('ch_sign_t', 'ON BREAK', 0, -0.205, 1.11, 0.08, M['ink'], f='hand')
        add(pipe_uv('ch_string', [(-0.2, -0.22, 1.24), (0, -0.24, 1.3), (0.2, -0.22, 1.24)], 0.006, M['card'], corner=0.05), False)
        render('chair_taped', catcher=(1.6, 1.6))

@job('chairs')
def job_chairs():
    build_chair('capt'); build_chair('taped')


# ===================================================================================================
# Wall items: vertical plates facing the camera, origin at the centre (the game hangs them like its dockSign
# canvases: x = sign x, at the room's back wall, z = WALL_SIGN_Z + 0.15). Widths follow DOCK_DECOR.base.signs.
# ===================================================================================================
def plate(M, w, h, bg, rust=0.15, bolts=True, depth=0.04):
    m = worn('plq' + bg, bg, 0.45, 0.3, wear=0.7, grime=0.8, rust=rust)
    add(mn.box('plq', (w, depth, h), loc=P(0, -depth / 2, -h / 2), m=m, bevel=0.02))
    if bolts: screws(-w / 2, w / 2, depth / 2 - 0.004, -h / 2, h / 2, M, 0.02, 0.06)
    return m

def lines_on(M, lines, w, h, fg, top=0.07, f='sans', fy=0.0):
    """dockSign's layout: from `top` down, each line `size` high plus a quarter of it as spacing."""
    fm = pmat('fg' + fg, fg, 0.5) if isinstance(fg, str) else fg
    y = top
    for text, size, *wt in lines:
        cz = h / 2 - (y + size * 0.62)
        T('pl_t', text, fy, 0.026, cz, size * 0.95, fm, f=('narrow' if wt and wt[0] == 700 else f))
        y += size * 1.25
    return fm

def build_sign_base():
    """RED COMET BASE (bay back wall; game: 1.8 wide). 1.8 x 0.55 with the comet emblem."""
    M = start(); w, h = 1.8, 0.55
    plate(M, w, h, '#7a1f1a', rust=0.25)
    add(mn.box('plq_trim', (w - 0.08, 0.01, 0.025), loc=P(0, 0.025, h / 2 - 0.06), m=M['gold'], bevel=0.004), False)
    add(mn.box('plq_trim', (w - 0.08, 0.01, 0.025), loc=P(0, 0.025, -h / 2 + 0.035), m=M['gold'], bevel=0.004), False)
    # the comet: a red-orange ball with a flame tail of three tapered wedges
    cu, cz = -0.66, 0.0
    add(mn.cyl('cm_ball', 0.12, 0.03, loc=P(cu + 0.06, 0.04, cz), m=emit_mat('comet', '#ff6a3a', 0.6, base='#e2574c'), rot=(R90, 0, 0), verts=24, bevel=0.01))
    for k, (dz, l, col) in enumerate(((0.06, 0.26, '#ffb43a'), (0.0, 0.34, '#ff8a3a'), (-0.06, 0.24, '#ffd84a'))):
        o = wedge_disc('cm_tail', cu - 0.02, 0.035, cz + dz, l, math.radians(170), math.radians(190), emit_mat(f'tail{k}', col, 0.5, base=col), h=0.008, segs=4)
        add(o, False)
    lines_on(M, [('RED COMET BASE', 0.15), ('NO VISITORS · NO REFUNDS', 0.075, 700)], w, h, '#ffe0d0', top=0.11, fy=0.14)
    add(mn.sphere('dent', 0.05, loc=P(0.7, 0.02, -0.12), m=bpy.data.materials['plq#7a1f1a'], scale=(1, 0.3, 1), segs=12))
    render('sign_red_comet', ol=0.01)

def build_brig_rules():
    M = start(); w, h = 1.6, 0.49
    plate(M, w, h, '#2b303a', rust=0.1)
    lines_on(M, [('BRIG RULES', 0.12), ('1. NO ESCAPING', 0.08, 700), ('2. SEE RULE 1', 0.08, 700)], w, h, '#ff9a8a')
    T('pl_add', '3. no tunnels', 0.48, 0.03, -0.16, 0.045, M['chalk'], f='hand')      # (scratched in by a guest)
    for k in range(3): add(mn.sphere('dent', 0.035, loc=P(-0.62 + 0.09 * k, 0.015, -0.12 + 0.05 * k), m=M['iron'], scale=(1, 0.3, 1), segs=10), False)
    render('plaque_brig_rules', ol=0.01)

def build_chores():
    """CHORE WHEEL (barracks; game: 1.6 wide, its three text lines): 1.6 x 0.8, with the wheel on the right."""
    M = start(); w, h = 1.6, 0.8
    plate(M, w, h, '#e8dcb8', rust=0.05)
    fm = pmat('ch_fg', '#3a2418', 0.5)
    T('ch_t', 'CHORE WHEEL', -0.32, 0.026, 0.22, 0.13, fm)
    T('ch_l1', 'DISHES: NOBODY', -0.32, 0.026, 0.0, 0.085, fm, f='narrow')
    T('ch_l2', 'MUTINY: TUESDAY', -0.32, 0.026, -0.13, 0.085, fm, f='narrow')
    T('ch_l3', 'SWAB: THE NEW GUY', -0.32, 0.026, -0.26, 0.06, pmat('ch_fg2', '#7a2418', 0.5), f='hand')
    cu = 0.5; R_ = 0.3; cols = ['#c0392b', '#e8c34f', '#3a64a0', '#5e8a3e', '#c4683a', '#8a4a8a']
    for k in range(6):
        add(wedge_disc('ch_w', cu, 0.03, 0.0, R_, k * math.pi / 3, (k + 1) * math.pi / 3, worn(f'wd{k}', cols[k], 0.6, 0.0, wear=0.3), h=0.02), False)
    add(ring('ch_rim', R_ + 0.02, 0.03, 0.03, loc=P(cu, 0.02, 0.0), m=M['wood2'], rot=(R90, 0, 0), verts=40))
    add(mn.cyl('ch_pin', 0.035, 0.05, loc=P(cu, 0.07, 0.0), m=M['steel'], rot=(R90, 0, 0), verts=12, bevel=0.01), False)
    arrow = add(prism('ch_arrow', [(0, -0.025), (0.38, 0.0), (0, 0.025)], 0, 0.012, M['black'], bevel=0.003), False)
    arrow.rotation_euler = (R90, math.radians(-50), 0); arrow.location = P(cu, 0.06, 0.0)
    tape_face(cu + 0.15, 0.03, 0.33, 0.22, 0.2, M, w=0.06)                     # (taped so it always lands on MUTINY)
    render('plaque_chores', ol=0.01)

def build_note():
    """The brig door code note (barracks back wall, g.note; game: dockSign 1.3 wide, 0.6275 high). The code is
    random per game, so the middle line is left blank: the game writes d.code there (or draws note_digits)."""
    M = start(); w, h = 1.3, 0.6275
    m = worn('note', '#ffe95c', 0.75, 0.0, wear=0.0, grime=0.35)
    add(mn.box('note', (w, 0.012, h), loc=P(0, -0.006, -h / 2), m=m, bevel=0.004))
    curl = add(mn.box('note_curl', (0.16, 0.01, 0.16), m=m, bevel=0.004)); curl.location = P(w / 2 - 0.08, 0.04, -h / 2 + 0.08); curl.rotation_euler = (math.radians(-35), math.radians(45), 0)
    for su in (-1, 1): tape_face(su * (w / 2 - 0.08), 0.008, h / 2 - 0.03, 0.26, su * 0.6, M, w=0.08)
    ink = pmat('note_ink', '#26324f', 0.5)
    T('n_h', 'BRIG DOOR CODE', 0, 0.01, h / 2 - 0.132, 0.1, ink)
    T('n_f', '(DO NOT WRITE DOWN)', 0, 0.01, h / 2 - 0.513, 0.07, ink, f='narrow')
    add(mn.box('n_line', (0.7, 0.004, 0.012), loc=P(0, 0.008, h / 2 - 0.46), m=ink, bevel=0), False)
    add(mn.box('n_heart', (0.0, 0, 0)) if False else None)
    T('n_doodle', '<- ME', 0.5, 0.01, h / 2 - 0.33, 0.05, ink, f='hand')
    render('note_code', ol=0.008)
    # the digits, in the same marker, as 10 frames (frame d = digit d), origin at the digit's centre
    M = start(); ink = pmat('note_ink', '#26324f', 0.5); objs = []
    for d in range(10):
        o = T('dg', str(d), 0, 0.012, 0, 0.24, ink, f='hand', depth=0.004); objs.append(o)
    frames = list(range(1, 11))
    for d, o in enumerate(objs): keys_show(o, [k == d for k in range(10)], frames)
    render('note_digits', frames=frames, ol=0.0)

def build_tally():
    """Tally marks |||| |||| || : scratched into a wall (tally_wall, vertical, origin centre) and in chalk on the
    floor (tally_floor, flat; the prison barge's brig stencil)."""
    for kind in ('wall', 'floor'):
        M = start(); m = worn('scratch', '#d8dce4', 0.9, 0.0, wear=0.0, grime=0.4) if kind == 'wall' else M['chalk']
        rnd = random.Random(2); u = -0.45
        for g, n in enumerate((4, 4, 2)):
            for i in range(n):
                l = 0.28 + rnd.uniform(-0.03, 0.03); a = rnd.uniform(-0.08, 0.08)
                if kind == 'wall': o = mn.box('tm', (0.022, 0.006, l), loc=P(u + i * 0.065, 0.0, -l / 2), m=m, bevel=0.003); o.rotation_euler.y = a
                else: o = cbox('tm', u + i * 0.065, 0, 0.03, l, 0.0, 0.004, m, bevel=0.002, rotz=a)
                add(o, False)
            if n == 4:
                c = u + 0.1; l = 0.4
                if kind == 'wall': o = mn.box('tm_x', (l, 0.006, 0.022), loc=P(c, 0.004, -0.011), m=m, bevel=0.003); o.rotation_euler.y = -0.6
                else: o = cbox('tm_x', c, 0, l, 0.03, 0.002, 0.004, m, bevel=0.002, rotz=0.6)
                add(o, False)
            u += n * 0.065 + 0.12
        render('tally_' + kind, ol=0.0)

def build_dartboard():
    """A dartboard with a photo of OUR ship pinned to it and three darts in it (barracks wall; new, 0.7 x 0.7,
    origin centre)."""
    M = start()
    add(mn.box('db_back', (0.7, 0.04, 0.7), loc=P(0, -0.02, -0.35), m=M['wood'], bevel=0.02))
    cork = worn('cork', '#b8905a', 0.9, 0.0, wear=0.0, grime=0.6)
    add(mn.cyl('db_cork', 0.3, 0.04, loc=P(0, 0.0, 0), m=M['black'], rot=(R90, 0, 0), verts=40, bevel=0.01))
    for k in range(20):
        add(wedge_disc('db_w', 0, 0.045, 0, 0.27, k * math.pi / 10, (k + 1) * math.pi / 10, cork if k % 2 else M['dark'], h=0.004, segs=3), False)
    for r, mm in ((0.27, M['inkred']), (0.17, M['olive'])):
        add(ring('db_ring', r, 0.025, 0.006, loc=P(0, 0.05, 0), m=mm, rot=(R90, 0, 0), verts=40), False)
    # the photo: our ship (grey hull, orange stripe, blue engines) with THEM scrawled on it
    add(mn.box('db_photo', (0.3, 0.006, 0.22), loc=P(0.02, 0.06, -0.11), m=M['paper'], bevel=0.003), False)
    add(mn.box('db_sky', (0.27, 0.004, 0.17), loc=P(0.02, 0.064, -0.095), m=pmat('photo_sky', '#1a2238', 0.6), bevel=0), False)
    hull = add(prism('db_ship', [(-0.11, -0.03), (0.06, -0.04), (0.11, 0.0), (0.06, 0.04), (-0.11, 0.03)], 0, 0.004, pmat('photo_hull', '#a8b0c0', 0.5), bevel=0), False)
    hull.rotation_euler = (R90, 0, 0); hull.location = P(0.02, 0.068, 0.0)
    add(mn.box('db_stripe', (0.16, 0.004, 0.012), loc=P(0.0, 0.07, -0.006), m=pmat('photo_or', '#e08a3a', 0.5), bevel=0), False)
    for dz in (-0.022, 0.022): add(mn.cyl('db_eng', 0.012, 0.004, loc=P(-0.12, 0.07, dz), m=emit_mat('photo_eng', '#7ad0ff', 0.8), rot=(R90, 0, 0), verts=8, bevel=0), False)
    T('db_them', 'THEM', 0.08, 0.072, -0.07, 0.04, M['inkred'], f='hand')
    for u, z in ((0.0, 0.0), (0.06, 0.04), (-0.17, 0.15)):        # the darts: shafts sticking out at the camera, flights
        add(pipe_uv('dart', [(u, 0.05, z), (u + 0.02, 0.2, z - 0.03)], 0.008, M['steel'], corner=0.0), False)
        add(ucyl('dart_b', 0.015, 0.06, u + 0.02, 0.18, z - 0.03, M['red'], axis='v', verts=10), False)
        f_ = add(mn.box('flight', (0.06, 0.05, 0.004), loc=P(u + 0.023, 0.235, z - 0.035), m=M['sticker'], bevel=0), False)
    for u in (0.32, -0.25): add(mn.cyl('miss', 0.008, 0.004, loc=P(u, 0.0, 0.3), m=M['black'], rot=(R90, 0, 0), verts=8, bevel=0), False)
    render('dartboard', ol=0.01)

@job('wall')
def job_wall():
    build_sign_base(); build_brig_rules(); build_chores(); build_note(); build_tally(); build_dartboard()


# ===================================================================================================
# Barracks and brig clutter (new: the game has no code for these yet; sizes are suggestions)
# ===================================================================================================
def tricorn(M, u, v, z, s=1.0, rotz=0.0):
    """A pirate hat: a squashed dome with three upturned brim lobes, a skull badge."""
    ps = []
    ps.append(add(mn.sphere('hat_crown', 0.13 * s, loc=P(0, 0, 0.06 * s), m=M['black'], scale=(1, 1, 0.75), segs=16)))
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        b = add(mn.sphere('hat_brim', 0.13 * s, loc=P(0.13 * s * math.cos(a), 0.13 * s * math.sin(a), 0.07 * s), m=M['black'], scale=(1.2, 0.45, 0.55), segs=14))
        b.rotation_euler.z = -a + math.pi / 2; ps.append(b)
    ps.append(add(mn.sphere('hat_badge', 0.035 * s, loc=P(0, 0.17 * s, 0.1 * s), m=M['white'], scale=(1, 0.4, 1), segs=10), False))
    grp(ps, u, v, z, rotz)

def bunk(M, variant):
    """Two-tier bunk, 1.0 x 2.0 (long side along y, head at the back wall), 1.45 high."""
    W, L, H = 1.0, 2.0, 1.45
    rnd = random.Random(variant + 3)
    for su in (-1, 1):
        for sv in (-1, 1): add(ubox('bk_post', su * W / 2 - 0.035, sv * L / 2 - 0.035, su * W / 2 + 0.035, sv * L / 2 + 0.035, 0, H, M['iron'], bevel=0.012))
    for z in (0.26, 0.92):
        for su in (-1, 1): add(ubox('bk_rail', su * W / 2 - 0.03, -L / 2, su * W / 2 + 0.03, L / 2, z, z + 0.07, M['iron'], bevel=0.01))
        for sv in (-1, 1): add(ubox('bk_end', -W / 2, sv * L / 2 - 0.03, W / 2, sv * L / 2 + 0.03, z, z + 0.07, M['iron'], bevel=0.01))
        add(ubox('bk_mat', -W / 2 + 0.05, -L / 2 + 0.05, W / 2 - 0.05, L / 2 - 0.05, z + 0.05, z + 0.17, worn('mattress', '#a89a7a', 0.85, 0.0, wear=0.0, grime=0.7, scale=3.0), bevel=0.04))
    for sv in (-1, 1): add(ubox('bk_head', -W / 2, sv * L / 2 - 0.02, W / 2, sv * L / 2 + 0.02, H - 0.25, H - 0.05, M['iron'], bevel=0.01))
    # a ladder at the foot, right side
    for su in (0.22, 0.42): add(ubox('bk_lad', su - 0.015, L / 2 + 0.02, su + 0.015, L / 2 + 0.05, 0, 1.15, M['steel'], bevel=0.006))
    for z in (0.35, 0.6, 0.85): add(ubox('bk_rung', 0.22, L / 2 + 0.02, 0.42, L / 2 + 0.05, z, z + 0.025, M['steel'], bevel=0.006), False)
    blank = [worn('blanket_a', '#7a2a24', 0.9, 0.0, wear=0.0, grime=0.3, scale=4.0), worn('blanket_b', '#3e4e6a', 0.9, 0.0, wear=0.0, grime=0.3, scale=4.0)][variant]
    # upper: a crumpled blanket hanging over the near side, a pillow, a hat on the post / a one-eyed teddy
    add(drape('bk_blanket', -0.62, -0.45, 0.48, 0.92, 1.1, (-0.45, -0.95, 0.45, 0.95), blank, seed=variant * 7 + 1, bump=0.04, hang=1.8, floor=0.4))
    add(mn.sphere('bk_pillow', 0.18, loc=P(0.05, -0.78, 1.12), m=M['cream'], scale=(1.7, 0.9, 0.45), segs=16))
    if variant == 0:
        tricorn(M, -W / 2, -L / 2, H + 0.02, 0.9, 0.3)
        add(pipe_uv('bk_sock', [(W / 2 + 0.03, 0.3, 0.98), (W / 2 + 0.06, 0.32, 0.86), (W / 2 + 0.07, 0.38, 0.74), (W / 2 + 0.07, 0.45, 0.72)], 0.035, M['cream'], corner=0.05))
    else:
        tb = worn('teddy', '#a87a4a', 0.9, 0.0, wear=0.0, grime=0.5)
        add(mn.sphere('td_body', 0.12, loc=P(0.25, -0.55, 1.2), m=tb, scale=(1, 0.8, 0.9), segs=14))
        add(mn.sphere('td_head', 0.085, loc=P(0.25, -0.5, 1.34), m=tb, segs=14))
        for e in (-1, 1): add(mn.sphere('td_ear', 0.03, loc=P(0.25 + e * 0.07, -0.52, 1.41), m=tb, segs=8), False)
        add(cbox('td_patch', 0.22, -0.43, 0.05, 0.02, 1.33, 0.05, M['black'], bevel=0.01), False)
    # lower: blanket kicked half onto the floor, a magazine, a bottle under the bed
    add(drape('bk_blanket2', -0.3, -0.2, 0.75, 0.9, 0.44, (-0.45, -0.95, 0.45, 0.95), [blank, worn('blanket_c', '#5e6a3e', 0.9, 0.0, wear=0.0, grime=0.3, scale=4.0)][1 - variant], seed=variant * 5 + 2, bump=0.03, hang=1.5, floor=0.03))
    ps = collect(bottle, M, 'bottle_g', 0.26); e = grp(ps, -0.62, 0.7, 0.05, 0); e.rotation_euler = (R90, 0, 0.6); e.location = P(-0.65, 0.7, 0.06)
    add(cbox('bk_mag', -0.75, 0.2, 0.22, 0.3, 0.0, 0.01, M['inkred'], bevel=0.003, rotz=0.4), False)
    # name stencilled on the foot end
    T('bk_name', ['ONE-EYE / STINKY', 'NOT STINKY'][variant], 0, L / 2 + 0.035, 1.27, 0.06, M['white'], f='narrow')

@job('bunks')
def job_bunks():
    for v in (0, 1):
        M = start(); bunk(M, v); render(f'bunk_{"ab"[v]}', catcher=(2.2, 3.0))

def build_lockers():
    """Three lockers, 1.5 x 0.45 x 1.6 against a wall; the middle one hangs open (coat, cutlass, boots)."""
    M = start(); w, Dd, H = 0.5, 0.45, 1.6; fv = Dd / 2
    cols = [M['navy'], M['olive'], M['red']]
    for i, u in enumerate((-w, 0, w)):
        if i == 1:
            body = add(cbox('lk_body', u, 0, w - 0.01, Dd, 0, H, M['iron'], bevel=0.02))
            D.bool_cut(body, [ubox('cut', u - w / 2 + 0.04, -fv + 0.04, u + w / 2 - 0.04, fv + 0.2, 0.06, H - 0.06, M['iron'], bevel=0)])
            add(ubox('lk_inner', u - w / 2 + 0.04, -fv + 0.03, u + w / 2 - 0.04, -fv + 0.05, 0.06, H - 0.06, M['dark'], bevel=0), False)
            add(ubox('lk_shelf', u - w / 2 + 0.04, -fv + 0.04, u + w / 2 - 0.04, fv - 0.02, 1.25, 1.28, M['steel'], bevel=0.005), False)
            # coat on a hook, a cutlass, boots
            add(cbox('lk_coat', u - 0.05, -0.05, 0.3, 0.12, 0.55, 0.62, worn('coat', '#5a2a24', 0.85, 0.0, wear=0.0), bevel=0.05))
            for su in (-1, 1): add(cbox('lk_lapel', u - 0.05 + su * 0.06, 0.02, 0.08, 0.04, 0.95, 0.2, M['gold'], bevel=0.02), False)
            add(pipe_uv('lk_cutlass', [(u + 0.15, -0.05, 0.25), (u + 0.17, 0.0, 0.9), (u + 0.12, 0.02, 1.15)], 0.014, M['steel'], corner=0.3), False)
            add(ucyl('lk_hilt', 0.04, 0.03, u + 0.17, 0.0, 0.2, M['gold'], verts=12), False)
            for su in (-1, 1): add(cbox('lk_boot', u + su * 0.1, 0.03, 0.12, 0.26, 0.06, 0.18, M['black'], bevel=0.04))
            ps = collect(bottle, M, 'bottle_b', 0.22, 0.04); grp(ps, u + 0.12, -0.05, 1.28, 0)
            add(cbox('lk_hat', u - 0.1, -0.05, 0.2, 0.18, 1.28, 0.1, M['black'], bevel=0.04))
            # the door, swung open on the right hinge
            dr = add(mn.box('lk_door', (w - 0.06, 0.025, H - 0.1), m=cols[i], bevel=0.012))
            for v in dr.data.vertices: v.co.x -= (w - 0.06) / 2; v.co.z += (H - 0.1) / 2
            dr.location = P(u + w / 2 - 0.02, fv + 0.01, 0.05); dr.rotation_euler.z = 1.2
            continue
        add(cbox('lk_body', u, 0, w - 0.01, Dd, 0, H, M['iron'], bevel=0.02))
        add(ubox('lk_door', u - w / 2 + 0.03, fv - 0.005, u + w / 2 - 0.03, fv + 0.02, 0.05, H - 0.05, cols[i], bevel=0.012))
        for k in range(4): add(ubox('lk_vent', u - 0.14, fv + 0.018, u + 0.14, fv + 0.024, H - 0.3 + k * 0.045, H - 0.28 + k * 0.045, M['black'], bevel=0), False)
        add(ubox('lk_handle', u + 0.14, fv + 0.018, u + 0.18, fv + 0.05, 0.7, 0.86, M['steel'], bevel=0.008), False)
        add(ubox('lk_tag', u - 0.15, fv + 0.018, u + 0.1, fv + 0.024, H - 0.48, H - 0.38, M['paper'], bevel=0.002), False)
        T('lk_tag_t', ['ONE-EYE', '', 'CAPT.'][i], u - 0.025, fv + 0.026, H - 0.43, 0.05, M['ink'], f='hand')
    # dents, stickers, the captain's padlock, a kicked-in door
    add(mn.sphere('lk_dent', 0.07, loc=P(-w - 0.05, fv + 0.025, 0.45), m=cols[0], scale=(1, 0.3, 1.2), segs=12))
    D.skull(w - 0.05, fv + 0.024, 0.48, 0.12, M['white'], OUT, face=True)
    add(ring('lk_shackle', 0.035, 0.012, 0.012, loc=P(w + 0.16, fv + 0.06, 0.94), m=M['steel'], rot=(R90, 0, 0), verts=12), False)
    add(cbox('lk_lock', w + 0.16, fv + 0.06, 0.07, 0.04, 0.84, 0.08, M['gold'], bevel=0.012))
    tape_face(-w, fv + 0.03, 1.05, 0.3, 0.5, M)
    add(ubox('lk_sticker', -w - 0.12, fv + 0.022, -w + 0.12, fv + 0.026, 1.0, 1.1, M['sticker'], bevel=0.002), False)
    T('lk_st', 'MY SOCKS', -w, fv + 0.03, 1.05, 0.04, M['ink'], f='hand')
    render('lockers', catcher=(2.2, 1.8))

@job('lockers')
def job_lockers(): build_lockers()

def build_bucket():
    """The brig's bucket (r 0.2, 0.34 high; DOCK_DECOR.base puts props/bucket at (-37.2, -17.6)): dented tin,
    rope handle, a mop in it, BRIG stencil."""
    M = start()
    me = bpy.data.meshes.new('bk'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.15, radius2=0.2, depth=0.34)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.17)); bm.to_mesh(me); bm.free()
    o = add(mn.link(bpy.data.objects.new('bucket', me))); mn.assign(o, worn('tin', '#8a929e', 0.4, 0.8, wear=0.5, grime=1.2, rust=0.4)); mn.bev(o, 0.01); mn.smooth(o)
    sd = o.modifiers.new('hollow', 'SOLIDIFY'); sd.thickness = 0.015
    add(mn.cyl('bk_water', 0.185, 0.01, loc=P(0, 0, 0.27), m=pmat('slop', '#4a4a2a', 0.1), verts=28, bevel=0), False)
    for z in (0.08, 0.3): add(ring('bk_hoop', 0.17 + z * 0.15, 0.015, 0.025, loc=P(0, 0, z), m=M['iron'], verts=28), False)
    add(pipe_uv('bk_rope', [(-0.2, 0, 0.3), (-0.15, 0.08, 0.42), (0.0, 0.12, 0.46), (0.15, 0.08, 0.42), (0.2, 0, 0.3)], 0.014, M['card'], corner=0.06), False)
    add(pipe_uv('bk_mop', [(0.02, 0.0, 0.1), (-0.25, -0.35, 1.0)], 0.022, M['wood'], corner=0.0))
    for k in range(7):
        a = k * 0.9; add(pipe_uv('bk_mophead', [(0.0, 0.0, 0.26), (0.06 * math.cos(a), 0.06 * math.sin(a), 0.3), (0.16 * math.cos(a), 0.12 * math.sin(a), 0.36 - 0.03 * k % 3)], 0.02, M['cream'], corner=0.04), False)
    T('bk_st', 'BRIG', 0, 0.2, 0.17, 0.065, M['black'], f='narrow', tilt=-0.15)
    add(mn.sphere('bk_dent', 0.05, loc=P(0.12, 0.13, 0.12), m=o.data.materials[0], scale=(1, 0.4, 1), segs=10))
    render('bucket', catcher=(1.0, 1.0))

def build_bedroll():
    """A bedroll (1.9 x 0.75, long side along x like props/sleeping_bag): patched mat, crumpled blanket, pillow."""
    M = start()
    mat_m = worn('roll', '#6a5a3e', 0.9, 0.0, wear=0.0, grime=0.5, scale=3.0)
    add(prism('br_mat', rrect_pts(-0.92, -0.34, 0.92, 0.34, 0.12), 0.0, 0.06, mat_m, bevel=0.02))
    add(drape('br_blanket', -0.45, -0.42, 0.98, 0.45, 0.075, (-0.6, -0.34, 0.95, 0.34), worn('br_blank', '#7a2a24', 0.9, 0.0, wear=0.0, grime=0.3, scale=4.0), seed=9, bump=0.05, hang=1.2, floor=0.005))
    add(mn.sphere('br_pillow', 0.17, loc=P(-0.68, 0.0, 0.1), m=M['cream'], scale=(0.8, 1.5, 0.45), segs=16))
    add(cbox('br_patch', 0.4, -0.1, 0.18, 0.16, 0.13, 0.01, worn('br_patch', '#c8a030', 0.9, 0.0, wear=0.0), bevel=0.004, rotz=0.3), False)
    for k in range(4): add(cbox('br_stitch', 0.4 + 0.08 * math.cos(k * 1.57 + 0.3), -0.1 + 0.07 * math.sin(k * 1.57 + 0.3), 0.04, 0.012, 0.142, 0.004, M['black'], bevel=0, rotz=k * 1.57), False)
    add(pipe_uv('br_rope', [(-0.85, 0.3, 0.02), (-0.95, 0.4, 0.01), (-0.8, 0.5, 0.01), (-0.6, 0.45, 0.01)], 0.018, M['card'], corner=0.06), False)
    ps = collect(bottle, M, 'bottle_g', 0.24); e = grp(ps, 0.6, 0.55, 0.05, 0); e.rotation_euler = (R90, 0, -0.9); e.location = P(0.68, 0.5, 0.055)
    render('bedroll', catcher=(2.6, 1.6))

@job('brig')
def job_brig(): build_bucket(); build_bedroll()

# ===================================================================================================
# Generic pirate clutter (new): pizza boxes, grog bottles, the card table
# ===================================================================================================
def pizza_box(M, open_=False, slice_=True):
    s = 0.48; bm_ = worn('pbox', '#c8a46a', 0.85, 0.0, wear=0.0, grime=1.4)
    add(cbox('pz_base', 0, 0, s, s, 0, 0.045, bm_, bevel=0.006))
    if open_:
        add(cbox('pz_in', 0, 0, s - 0.03, s - 0.03, 0.04, 0.008, worn('pin', '#e0c89a', 0.85, 0.0, wear=0.0, grime=1.6), bevel=0.002), False)
        lid = add(mn.box('pz_lid', (s, s, 0.012), m=bm_, bevel=0.005))
        for v in lid.data.vertices: v.co.y -= s / 2
        lid.location = P(0, -s / 2, 0.045); lid.rotation_euler.x = math.radians(-100)
        T('pz_logo', "CAPT'N PIZZA", 0, -s / 2 - 0.016, 0.3, 0.05, M['inkred'], tilt=-0.17)
        D.stain(0.08, 0.05, 0.12, M['oil'], OUT, z=0.05)
        if slice_:
            sl = add(wedge_disc('pz_slice', -0.08, 0.06, 0.05, 0.2, math.radians(-25), math.radians(25), worn('cheese', '#e8b44a', 0.6, 0.0, wear=0.0, grime=0.4), face=False, h=0.02, segs=5)); sl.rotation_euler.z = 0.4
            for a, b in ((0.0, 0.08), (0.05, 0.03)): add(mn.cyl('pep', 0.025, 0.006, loc=P(-0.0 + a, 0.03 + b - 0.05, 0.07), m=M['inkred'], verts=10, bevel=0), False)
        for k in range(3):
            add(pipe_uv('pz_crust', [(0.05 + 0.04 * k, -0.15 + 0.1 * k, 0.06), (0.15 + 0.03 * k, -0.08 + 0.1 * k, 0.06)], 0.018, worn('crust', '#b8803a', 0.8, 0.0, wear=0.0), corner=0.0))
    else:
        add(cbox('pz_lid', 0, 0, s + 0.006, s + 0.006, 0.04, 0.012, bm_, bevel=0.005))
        T('pz_logo', "CAPT'N\nPIZZA", 0, 0, 0.053, 0.06, M['inkred'], face=False)
        D.stain(0.12, 0.12, 0.08, M['oil'], OUT, z=0.054)

def build_pizza():
    M = start()
    for k, (rot, open_) in enumerate(((0.1, False), (-0.15, False), (0.25, True))):
        ps = collect(pizza_box, M, open_); grp(ps, 0.02 * k, 0, 0.057 * k, rot)
    ps = collect(pizza_box, M, False); e = grp(ps, 0.45, 0.15, 0.0, -0.4)
    render('pizza_stack', catcher=(1.8, 1.6))

def build_bottles():
    M = start()
    for (u, v, g) in ((-0.08, -0.06, 'bottle_g'), (0.08, -0.02, 'bottle_b'), (-0.02, 0.1, 'bottle_g')):
        ps = collect(bottle, M, g, 0.32, 0.055)
        T('bt_skull', 'GROG', 0, 0.059, 0.1, 0.03, M['inkred'], f='narrow'); OUT[-1].location = P(0, 0.059, 0.1); ps.append(OUT[-1])
        grp(ps, u, v, 0, 0)
    ps = collect(bottle, M, 'bottle_b', 0.32, 0.055); e = grp(ps, 0.25, 0.12, 0.055, 0); e.rotation_euler = (R90, 0, -1.2)
    D.stain(0.4, 0.22, 0.16, decal_mat('grog_puddle', '#5a3a14', 0.7, rough=0.1), OUT, sv=0.6, rotz=0.3, z=0.003)
    render('bottles', catcher=(1.4, 1.2))
    M = start(); ps = collect(bottle, M, 'bottle_g', 0.32, 0.055)
    T('bt_skull', 'GROG', 0, 0.059, 0.1, 0.03, M['inkred'], f='narrow')
    render('bottle', catcher=(0.8, 0.8))

def build_card_table():
    """The card table (1.3 x 0.85, 0.75 high; a barracks corner): green felt, a hand of cards face up (four
    aces, of course), chips, a grog bottle, a knife stuck in it, a card on the floor."""
    M = start(); W, Dd, H = 1.3, 0.85, 0.74
    for su in (-1, 1):
        for sv in (-1, 1): add(ubox('ct_leg', su * (W / 2 - 0.1) - 0.03, sv * (Dd / 2 - 0.1) - 0.03, su * (W / 2 - 0.1) + 0.03, sv * (Dd / 2 - 0.1) + 0.03, 0, H - 0.05, M['wood2'], bevel=0.01))
    add(prism('ct_top', rrect_pts(-W / 2, -Dd / 2, W / 2, Dd / 2, 0.12), H - 0.06, H, M['wood'], bevel=0.015))
    add(prism('ct_felt', rrect_pts(-W / 2 + 0.07, -Dd / 2 + 0.07, W / 2 - 0.07, Dd / 2 - 0.07, 0.08), H, H + 0.006, M['felt'], bevel=0.0), False)
    rnd = random.Random(8); card_m = M['paper']; back_m = M['inkred']
    def card(u, v, z, rot, up=True, m=None):
        o = add(cbox('ct_card', u, v, 0.1, 0.14, z, 0.006, m or (card_m if up else back_m), bevel=0.002, rotz=rot), False)
        return o
    for k in range(4):     # four aces fanned out
        card(-0.3 + k * 0.06, 0.18, H + 0.008 + k * 0.002, 0.3 - k * 0.15)
        T('ct_a', 'A', -0.3 + k * 0.06, 0.15, H + 0.012 + k * 0.002, 0.05, M['inkred'] if k % 2 else M['ink'], face=False, rotz=0.3 - k * 0.15)
    for k in range(5): card(0.25 + rnd.uniform(-0.05, 0.05), -0.18 + rnd.uniform(-0.05, 0.05), H + 0.007 + k * 0.003, rnd.uniform(-0.4, 0.4), up=False)
    for k, (u, v, n, col) in enumerate(((0.0, -0.05, 5, 'inkred'), (0.1, 0.0, 3, 'navy'), (-0.12, -0.15, 7, 'cream'))):
        for i in range(n): add(mn.cyl('chip', 0.04, 0.012, loc=P(u, v, H + 0.006 + i * 0.013), m=M[col], verts=16, bevel=0.003), False)
    ps = collect(bottle, M, 'bottle_g', 0.3); grp(ps, 0.45, 0.2, H + 0.006, 0)
    knife = add(mn.box('ct_blade', (0.02, 0.006, 0.16), m=M['steel'], bevel=0.002)); knife.location = P(-0.4, -0.2, H + 0.06); knife.rotation_euler = (0.2, 0.25, 0)
    add(ucyl('ct_handle', 0.02, 0.12, -0.42, -0.21, H + 0.13, M['wood2'], verts=10), False)
    add(cbox('ct_mug', 0.42, -0.25, 0.12, 0.12, H + 0.006, 0.12, M['white'], bevel=0.03))
    card(0.55, 0.55, 0.0, 0.8); T('ct_a2', 'A', 0.55, 0.53, 0.008, 0.05, M['ink'], face=False, rotz=0.8)
    card(-0.7, 0.35, 0.0, -0.4, up=False)
    render('card_table', catcher=(2.4, 2.0))

@job('clutter')
def job_clutter(): build_pizza(); build_bottles(); build_card_table()


# ===================================================================================================
# Floor storytelling (new, flat; draw on the decal layer or as low props)
#   server_cables  the cable run from the racks to the terminal across the server room floor, duct-taped down
#                  (concept key art). Origin: port game point (hatch.x - 17.5, hatch.y - 1.4); ends at origin +
#                  (2.3, -1.8) (the racks' foot) and (-2.35, -1.6) (the terminal's right side). Port only:
#                  mirror the x offsets (flip the sprite) on starboard.
#   casings        spent brass and scorch marks (1.4 x 0.9) for the gun corridor in front of the sentry
#   doormat        WIPE YOUR BOOTS doormat with a skull (1.2 x 0.7) for the bay entrance
# ===================================================================================================
def build_server_cables():
    M = start()
    pts = [(2.3, -1.8), (2.15, -0.6), (1.5, 0.05), (-0.3, 0.12), (-1.9, -0.05), (-2.25, -0.7), (-2.35, -1.6)]
    for i, (dv, m) in enumerate(((0.0, M['cables'][0]), (0.1, M['cables'][1]), (0.18, M['cables'][2]))):
        add(pipe_uv('sc', [(u + (0.05 * i if u > 0 else -0.05 * i), v + dv, 0.04) for u, v in pts], 0.04 if i < 2 else 0.028, m, corner=0.45))
    for u, v, a in ((1.0, 0.18, 1.57), (-0.6, 0.22, 1.5), (2.2, -0.9, 0.05), (-2.2, -0.5, -0.1)):
        tape_flat(u, v, 0.075, 0.42, a, M, w=0.1)
    T('sc_lbl', 'TRIP HAZARD (HA)', 0.3, 0.52, 0.004, 0.09, M['sticker'], face=False, f='narrow')
    render('server_cables', catcher=(5.6, 2.8))

def build_casings():
    M = start(); rnd = random.Random(12); brass = worn('brass', '#d8a83a', 0.3, 0.9, wear=0.2, grime=0.4)
    D.stain(-0.2, 0.0, 0.45, M['scorch'], OUT, sv=0.6, z=0.002)
    D.stain(0.4, 0.15, 0.25, M['scorch'], OUT, sv=0.7, rotz=0.6, z=0.003)
    for k in range(26):
        u, v = rnd.gauss(0, 0.35), rnd.gauss(0, 0.2)
        o = add(mn.cyl('cs', 0.018, 0.07, loc=P(u, v, 0.018), m=brass, rot=(R90, 0, rnd.uniform(0, 6.3)), verts=10, bevel=0.004), False)
    for k in range(3):
        o = add(mn.cyl('cs_up', 0.018, 0.07, loc=P(rnd.uniform(-0.5, 0.5), rnd.uniform(-0.3, 0.3), 0.0), m=brass, verts=10, bevel=0.004), False)
    render('casings', ol=0.0, catcher=(1.8, 1.4))

def build_doormat():
    M = start()
    mm = worn('mat', '#3a3226', 0.95, 0.0, wear=0.0, grime=0.5, scale=4.0)
    add(prism('dm', rrect_pts(-0.6, -0.35, 0.6, 0.35, 0.06), 0.0, 0.025, mm, bevel=0.008))
    T('dm_t', 'WIPE YOUR BOOTS', 0.12, 0.12, 0.027, 0.085, M['sticker'], face=False, f='narrow')
    D.skull(-0.42, -0.06, 0.027, 0.22, M['cream'], OUT, face=False)
    T('dm_t2', 'or else', 0.15, -0.12, 0.027, 0.06, M['cream'], face=False, f='hand')
    D.stain(0.35, -0.15, 0.14, M['oil'], OUT, z=0.028)
    render('doormat', ol=0.008, catcher=(1.6, 1.0))

@job('floor')
def job_floor(): build_server_cables(); build_casings(); build_doormat()

# ===================================================================================================
if __name__ == '__main__':
    import time
    t0 = time.time()
    for name, fn in JOBS:
        if ONLY and name not in ONLY: continue
        t = time.time(); fn(); print(f'[base] {name}: {time.time() - t:.1f} s')
    print(f'[base] total {time.time() - t0:.1f} s')
