"""CONCEPT MOCK-UP (not a game sprite): "The Mimic" (S-4 learns faces).

    blender -b --factory-startup --python tools/blender/models/concepts/mimic.py -- [lab|ship|unfold|true|all] [out_dir]

  lab     Dr. Varga's lab module exactly like models/dock/ships.py (build('derelict', 'port')) plus the story:
          a Red Comet boarding claw torn into the airlock (its tube cut off when they fled), drag marks from
          the cold store to the claw, the frosted-glass cold store with Varga's barricade, the pirates'
          firefight among themselves (scorch, laser burns, a dropped carbine), the specimen board, the
          empty S-4 tank, an overturned tank, Gerald and the cold coffee. Actors are composited later from
          the game's sprites (crew, Varga 'down', pirates 'down', Specimen 7 'dormant').
  ship    a small room of our own ship (the cargo bay): bench with the black box plugged into a console.
  unfold  close-up (mn.PPU 230) of S-4's true form unfolding out of the Varga disguise (split suit, helmet
          hanging back, glasses on the floor, the "DR. VRAGA" tag on the shell).
  true    the same true form without the husk (for the cloak / saboteur shots).
Writes <out_dir>/<variant>.png (+ .json with the canvas origin). Never touches build/renders or the manifest.
"""
import sys, os, math, random, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock')); sys.path.insert(0, os.path.join(HERE, '..', 'chars'))
import bpy
from mathutils import Vector
import docklib as D
from docklib import *
import ships
import charlib as C

A = D.args()
VARIANTS = [a for a in A if a in ('lab', 'ship', 'unfold', 'true')] or ['lab', 'ship', 'unfold', 'true']
OUT = next((a for a in A if a.startswith('/')), '/tmp/mn_concepts/mimic')
mn.SAMPLES = int(os.environ.get('MN_SAMPLES', 24))
mn.OUT_DIR = OUT
_entry = {}
mn._manifest_put = lambda name, e: _entry.update(e)

def add_light(kind, name, loc, energy, color, radius=0.15, aim=None, spot=0.6, blend=0.35):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind in ('POINT', 'SPOT'): d.shadow_soft_size = radius
    if kind == 'SPOT': d.spot_size = spot; d.spot_blend = blend
    o = bpy.data.objects.new(name, d); o.location = loc; bpy.context.scene.collection.objects.link(o)
    if aim is not None: o.rotation_euler = (aim - loc).to_track_quat('-Z', 'Y').to_euler()
    return o

def frosted_glass(name):
    """Frosted glass: part see-through, part milky blue-white with frost blooms."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    b = N.new('ShaderNodeBsdfPrincipled'); b.inputs['Base Color'].default_value = (0.72, 0.84, 0.95, 1); b.inputs['Roughness'].default_value = 0.25
    b.inputs['Coat Weight'].default_value = 1.0
    tc = N.new('ShaderNodeTexCoord'); no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 3.5; no.inputs['Detail'].default_value = 8
    Lk(tc.outputs['Object'], no.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.4; mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = 0.35; mr.inputs['To Max'].default_value = 0.85; Lk(no.outputs['Fac'], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(b.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

def streak(name, pts, w, m, out, rng, gap=0.25, z=FLOOR_Z + 0.004):
    """A broken scuff / burn line on the floor through (u, v) points: short flat dashes with gaps."""
    for (a, b) in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / 0.16))
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for k in range(n):
            if rng.random() < gap: continue
            t = (k + 0.5) / n
            u, v = a[0] + (b[0] - a[0]) * t + rng.uniform(-0.02, 0.02), a[1] + (b[1] - a[1]) * t + rng.uniform(-0.02, 0.02)
            out.append(cbox(name, u, v, 0.17 * rng.uniform(0.6, 1.1), w * rng.uniform(0.6, 1.2), z, 0.003, m, bevel=0, rotz=ang + rng.uniform(-0.1, 0.1)))

def carbine(u, v, rotz, out, M):
    """The Red Comet carbine (chunky, red stock, glowing-dead emitter), lying on the floor."""
    parts = [((0.0, 0.0), (0.62, 0.11, 0.1), M['gunbody']), ((-0.36, 0.02), (0.26, 0.09, 0.08), M['gunred']),
             ((0.42, 0.0), (0.26, 0.05, 0.05), M['steel']), ((0.05, 0.1), (0.07, 0.12, 0.05), M['gunbody']),
             ((0.18, -0.08), (0.18, 0.06, 0.06), M['gunred'])]
    c, s = math.cos(rotz), math.sin(rotz)
    for (du, dv), (w, d, h), m in parts:
        out.append(cbox('carbine', u + du * c - dv * s, v + du * s + dv * c, w, d, FLOOR_Z, h, m, bevel=0.015, rotz=rotz))
    eu, ev = u + 0.56 * c, v + 0.56 * s
    out.append(mn.sphere('carb_tip', 0.035, loc=P(eu, ev, FLOOR_Z + 0.03), m=M['ember'], segs=10))

# ---------------------------------------------------------------------------------------------------
# The lab
# ---------------------------------------------------------------------------------------------------
def lab():
    import shiplib; shiplib._hidden_in_data.clear()
    objs = ships.build('derelict', 'port')
    rng = random.Random(41); out = []
    M = dict(
        steel=worn('mst', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), dark=pmat('mdark', '#1c1f25', 0.6), black=pmat('mblack', '#0b0c0f', 0.9),
        tape=pmat('mtape', '#b9bcc2', 0.85), ink=pmat('mink', '#23252b', 0.6), paper=pmat('mpaper', '#e6e2d6', 0.8),
        red=worn('mred', '#b0302a', 0.5, 0.1, wear=0.9, grime=0.8), redhull=worn('mredh', '#9a3430', 0.5, 0.25, wear=0.9, rust=0.3),
        hull2=worn('mh2', '#2e2428', 0.5, 0.2, rust=0.2), yellow=worn('myel', '#e8c34f', 0.45, 0.3, wear=0.8), hazard=stripes_mat('mhaz'),
        white=worn('mwhite', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.7), bench=worn('mbench', '#9aa1aa', 0.4, 0.2, frost=0.5),
        cab=worn('mcab', '#6a7a5a', 0.5, 0.2, wear=0.7), teal=worn('mteal', '#3a9a94', 0.45, 0.1, wear=0.7),
        soot=decal_mat('msoot', '#0b0a09', 0.9), scuff=decal_mat('mscuff', '#0e0c0b', 0.75, 9.0), drag=pmat('mdrag', '#141210', 0.9),
        burn=pmat('mburn', '#0a0807', 0.95), frost=decal_mat('mfrost', '#d8e8f4', 0.7, 7.0, rough=0.9), slime=decal_mat('mslime', '#4aa85a', 0.8, 6.0, rough=0.1),
        glass=frosted_glass('frosted'), clear=mn.mat('mclear', '#3a4654', 0.08, 0.0, clearcoat=1.0),
        ember=emit_mat('ember', '#ff7a2a', 1.2, base='#ff5010'), cyan=emit_mat('mcyan', '#7ae8ff', 1.0, base='#2a6a7a'),
        jar_g=emit_mat('jarg', '#7aff9a', 0.9, base='#2a6a3a'), jar_a=emit_mat('jara', '#ffc04a', 0.8, base='#6a4a1a'), jar_p=emit_mat('jarp', '#c07aff', 0.8, base='#3a1a5a'),
        lamp=emit_mat('lantern', '#ffd58a', 1.3, base='#ffe0b0'), foil=mn.mat('mfoil', '#d8b04a', 0.25, 0.9),
        gunbody=pmat('gunb', '#2a2c30', 0.5, 0.4), gunred=worn('gunr', '#b0302a', 0.5, 0.2, wear=0.8), cutglow=emit_mat('cutglow', '#ff9a3a', 1.1, base='#a04010'),
        redled=emit_mat('redled', '#ff3a2a', 1.2, base='#601010'),
    )
    D.M_DARK[0] = M['black']
    Av, Cv, Kv = ROOMS['airlock'][1], ROOMS['cargo'][1], ROOMS['core'][1]
    # --- 1. the Red Comet boarding claw, bitten into the airlock roof; the pirates cut its tube when they fled
    cu_, cz = -8.0, 1.0
    claw = []
    claw.append(ucyl('claw_tube', 0.62, 2.6, cu_, -7.4, cz, M['redhull'], axis='v', verts=32, bevel=0.04))
    claw.append(ucyl('claw_collar', 0.78, 0.5, cu_, -5.25, cz, M['hull2'], axis='v', verts=32, bevel=0.05))
    for k in range(3):
        claw.append(ucyl('claw_band', 0.66, 0.1, cu_, -7.0 + k * 0.6, cz, M['hazard'] if k == 1 else M['hull2'], axis='v', verts=32, bevel=0.02))
    out += claw
    out.append(ring('claw_cut', 0.62, 0.06, 0.05, loc=P(cu_, -7.42, cz), m=M['cutglow'], rot=(R90, 0, 0)))   # torch-cut rim, still glowing
    out.append(ucyl('claw_hollow', 0.52, 0.02, cu_, -7.43, cz, M['black'], axis='v', verts=32, bevel=0))
    for sx in (-1, 1):                                            # four hooked fingers biting into the roof
        for dv in (0.0, 0.0):
            pts = [(cu_ + sx * 0.6, -5.0, cz + 0.55), (cu_ + sx * 1.05, -4.3, H_FULL + 0.55), (cu_ + sx * 0.95, -3.55, H_FULL + 0.25), (cu_ + sx * 0.7, -3.25, H_FULL - 0.05)]
            out.append(pipe_uv('claw_finger', pts, 0.12, M['red'], corner=0.3))
            out.append(cbox('claw_knuckle', cu_ + sx * 1.05, -4.3, 0.3, 0.3, H_FULL + 0.4, 0.3, M['hull2'], bevel=0.05))
    for sx in (-0.35, 0.35):
        pts = [(cu_ + sx, -5.0, cz + 0.75), (cu_ + sx * 1.3, -4.1, H_FULL + 0.7), (cu_ + sx * 1.2, -3.2, H_FULL + 0.2), (cu_ + sx, -2.9, H_FULL - 0.05)]
        out.append(pipe_uv('claw_finger', pts, 0.1, M['red'], corner=0.3))
    skull(cu_, -6.1, cz + 0.62, 0.55, M['white'], out, face=False)
    out[-1].location.z += 0.0
    out.append(text('claw_rc', 'RED COMET', cu_, -6.85, cz + 0.63, 0.13, M['white']))
    # torn roof petals round the bite, soot
    out.append(disc('claw_soot', cu_, -3.4, H_FULL + 0.004, 1.3, M['soot'], sv=0.6))
    for k in range(7):
        a = k * math.tau / 7
        out.append(cbox('petal', cu_ + math.cos(a) * 0.95, -3.5 + math.sin(a) * 0.45, 0.32, 0.1, H_FULL, 0.05, M['steel'], bevel=0.01, rotz=a))
    # the breach in the airlock's back wall below it: a ragged black hole, the petals bent inwards, a tarp of duct tape
    out.append(ubox('breach', cu_ - 0.55, Av + 0.01, cu_ + 0.55, Av + 0.03, 0.15, 1.2, M['black'], bevel=0.0))
    for k in range(9):
        a = k * math.tau / 9; r = 0.6
        out.append(cbox('wpetal', cu_ + math.cos(a) * r, Av + 0.12, 0.26, 0.2, 0.68 + math.sin(a) * 0.5, 0.06, M['steel'], bevel=0.01, rotz=0.3 * math.sin(a)))
    out.append(disc('breach_soot', cu_, Av + 0.6, FLOOR_Z + 0.003, 0.9, M['soot'], sv=0.6))
    # --- 2. drag marks: from the cold store, round the fire, through the door, into the claw's breach
    path = [(-15.1, 2.75), (-13.8, 2.85), (-12.4, 2.2), (-11.3, 0.9), (-10.5, 0.25), (-9.4, -0.3), (-8.6, -1.3), (-8.1, -2.15)]
    for off in (-0.13, 0.13):
        pts = [(u, v + off) for (u, v) in path]
        streak('drag', pts, 0.06, M['drag'], out, rng, gap=0.2)
    for (u, v) in ((-14.4, 2.8), (-12.0, 1.8), (-9.9, -0.05)):          # a scuffed boot heel, a glove print
        out.append(disc('scuff', u, v, FLOOR_Z + 0.003, 0.25, M['scuff'], sv=0.7))
    # --- 3. the cold store: frosted glass box in the lab's SW corner, the door gap on its east side
    L0, L1, T0, T1 = -18.35, -15.35, 1.05, 3.95
    GH = 1.15
    out.append(ubox('cs_glass', L0, T0 - 0.03, L1, T0 + 0.03, 0.05, GH, M['glass'], bevel=0.0))
    for (a, b) in ((T0, 1.95), (3.0, T1)):
        out.append(ubox('cs_glass', L1 - 0.03, a, L1 + 0.03, b, 0.05, GH, M['glass'], bevel=0.0))
    for (u, v) in ((L0 + 0.02, T0), (-16.85, T0), (L1, T0), (L1, 1.95), (L1, 3.0), (L1, T1 - 0.02)):
        out.append(cbox('cs_post', u, v, 0.08, 0.08, 0.0, GH + 0.06, M['steel'], bevel=0.015))
    out.append(ubox('cs_rail', L0, T0 - 0.05, L1 + 0.04, T0 + 0.05, GH, GH + 0.06, M['steel'], bevel=0.01))
    out.append(ubox('cs_rail', L1 - 0.05, T0, L1 + 0.05, 1.95, GH, GH + 0.06, M['steel'], bevel=0.01))
    out.append(ubox('cs_rail', L1 - 0.05, 3.0, L1 + 0.05, T1, GH, GH + 0.06, M['steel'], bevel=0.01))
    out.append(ubox('cs_sign', -17.9, T0 + 0.04, -16.95, T0 + 0.06, 0.82, 1.05, M['cyan'] if False else M['white'], bevel=0.004))
    out.append(text('cs_sign_t', 'COLD STORE', -17.42, T0 + 0.065, 0.97, 0.085, M['ink'], face=True))
    out.append(text('cs_sign_t2', '-20 C', -17.42, T0 + 0.065, 0.88, 0.07, pmat('mblue', '#2a6ab0', 0.5), face=True))
    # Varga's notes taped to the glass (inside, facing out), one big "KEEP OUT"
    for (u, z, w) in ((-16.3, 0.6, 0.32), (-15.85, 0.85, 0.26), (-18.0, 0.45, 0.28)):
        out.append(ubox('note', u - w / 2, T0 + 0.035, u + w / 2, T0 + 0.045, z, z + w * 1.25, M['paper'], bevel=0.0))
        out.append(ubox('ntape', u - 0.07, T0 + 0.045, u + 0.07, T0 + 0.055, z + w * 1.15, z + w * 1.3, M['tape'], bevel=0.0))
    out.append(ubox('note_big', -16.75, T0 + 0.035, -16.0, T0 + 0.045, 0.25, 0.55, M['paper'], bevel=0.0))
    out.append(text('note_big_t', 'KEEP OUT - I.V.', -16.37, T0 + 0.05, 0.4, 0.07, pmat('mredink', '#b0281e', 0.7), face=True))
    for k in range(3):
        out.append(ubox('ntape', -16.8 + k * 0.33, T0 + 0.045, -16.65 + k * 0.33, T0 + 0.055, 0.5, 0.6, M['tape'], bevel=0.0))
    # inside: shelves of jars along the west wall, frost, a freezer coil, the foil blanket and a lantern
    for k in range(3):
        v = 1.35 + k * 0.85
        out.append(ubox('shelf', L0 + 0.05, v - 0.3, L0 + 0.5, v + 0.3, 0.0, 0.06, M['steel'], bevel=0.01))
        out.append(ubox('shelf', L0 + 0.05, v - 0.3, L0 + 0.5, v + 0.3, 0.55, 0.6, M['steel'], bevel=0.01))
        for j in range(3):
            jm = [M['jar_g'], M['jar_a'], M['jar_p']][(k + j) % 3]
            out.append(ucyl('jar', 0.07, 0.16, L0 + 0.27, v - 0.2 + j * 0.2, 0.6, jm, verts=14, bevel=0.01))
            out.append(ucyl('jar_lid', 0.075, 0.03, L0 + 0.27, v - 0.2 + j * 0.2, 0.76, M['dark'], verts=14, bevel=0.005))
    for (u, v, r) in ((-17.4, 1.6, 0.6), (-16.2, 3.4, 0.7), (-17.6, 3.3, 0.55), (-15.9, 1.4, 0.4)):
        stain(u, v, r, M['frost'], out, sv=0.8)
    out.append(cbox('foil', -16.75, 3.15, 0.75, 0.5, FLOOR_Z, 0.02, M['foil'], bevel=0.01, rotz=0.4))
    out.append(ucyl('lantern', 0.08, 0.2, -17.15, 2.0, FLOOR_Z, M['yellow'], verts=14, bevel=0.01))
    out.append(ucyl('lantern_glow', 0.065, 0.12, -17.15, 2.0, FLOOR_Z + 0.05, M['lamp'], verts=14, bevel=0.005))
    add_light('POINT', 'lantern', P(-17.15, 2.0, 0.35), 18.0, (1.0, 0.8, 0.5), radius=0.1)
    add_light('POINT', 'coldstore', P(-17.3, 2.4, 1.1), 22.0, (0.55, 0.75, 1.0), radius=0.5)
    # the barricade in the door gap: overturned lab bench, a filing cabinet on its side, stools, a gas bottle, all taped
    bk = []
    bk.append(cbox('bar_bench', -14.95, 2.05, 0.4, 1.1, 0.0, 0.62, M['bench'], bevel=0.02, rotz=0.12))
    bk.append(cbox('bar_cab', -14.75, 2.75, 0.75, 0.42, 0.0, 0.4, M['cab'], bevel=0.02, rotz=-0.35))
    for k in range(3): bk.append(cbox('cab_handle', -14.98 + k * 0.22, 2.97 - k * 0.08, 0.12, 0.03, 0.18, 0.04, M['steel'], bevel=0.005, rotz=-0.35))
    st = mn.cyl('bar_stool', 0.16, 0.5, loc=P(-14.55, 1.75, 0.18), m=M['dark'], verts=16, bevel=0.01, rot=(0, R90, 0.4)); bk.append(st)
    bk.append(ucyl('bar_seat', 0.2, 0.06, -14.4, 1.65, 0.0, M['red'], verts=18, bevel=0.01))
    gb = mn.cyl('bar_gas', 0.13, 0.7, loc=P(-14.4, 2.4, 0.13), m=M['yellow'], verts=16, bevel=0.02, rot=(R90 * 0.9, 0, 0.9)); bk.append(gb)
    out += bk
    for (u, v, r) in ((-14.95, 1.8, 0.4), (-14.9, 2.4, 1.3), (-14.6, 2.65, -0.6)):
        tape(u, v, 0.63 if u < -14.9 else 0.42, 0.42, M['tape'], out, rotz=r)
    out.append(text('bar_t', 'NO', -14.95, 2.05, 0.63, 0.14, pmat('mredink2', '#b0281e', 0.7), rotz=math.radians(85)))
    # --- 4. the pirates' firefight among themselves: two bodies face to face (sprites), scorch, burn streaks, embers
    pa, pb = (-13.7, -1.5), (-11.6, -0.9)
    for (u, v) in (pa, pb): stain(u, v, 0.55, M['soot'], out, sv=0.7)
    for k in range(6):                                                  # laser streaks on the floor between them
        t = rng.uniform(0.15, 0.85); u = pa[0] + (pb[0] - pa[0]) * t; v = pa[1] + (pb[1] - pa[1]) * t + rng.uniform(-0.6, 0.6)
        out.append(cbox('burn', u, v, rng.uniform(0.35, 0.7), 0.035, FLOOR_Z + 0.004, 0.003, M['burn'], bevel=0, rotz=math.atan2(pb[1] - pa[1], pb[0] - pa[0]) + rng.uniform(-0.25, 0.25)))
        if k % 2 == 0: out.append(mn.sphere('ember', 0.025, loc=P(u + 0.1, v, FLOOR_Z + 0.01), m=M['ember'], segs=8))
    for (u, z) in ((-15.3, 0.5), (-15.05, 1.05), (-12.15, 0.4), (-10.95, 0.9), (-11.25, 1.25), (-13.7, 0.35)):   # wall hits
        out.append(ubox('wburn', u - 0.2, Cv + 0.03, u + 0.2, Cv + 0.05, z - 0.06, z + 0.06, M['burn'], bevel=0))
        out.append(ucyl('whit', 0.05, 0.03, u, Cv + 0.06, z, M['ember'], axis='v', verts=10, bevel=0))
    carbine(-12.75, -0.25, 0.5, out, M)                                 # one dropped between them
    carbine(-15.6, 0.45, 2.6, out, M)                                    # and one by the cold store door
    for k in range(7):                                                  # spent cells
        out.append(mn.cyl('cell', 0.03, 0.09, loc=P(-12.6 + rng.uniform(-1.2, 1.2), -1.2 + rng.uniform(-0.6, 0.8), FLOOR_Z + 0.03), m=M['red'], verts=8, bevel=0.005, rot=(R90, 0, rng.uniform(0, 3))))
    # --- 5. the lab's story pieces: specimen board, S-4's empty tank, an overturned tank, Gerald, the coffee
    bu0, bu1 = -15.5, -14.15
    out.append(ubox('board', bu0, Cv + 0.05, bu1, Cv + 0.09, 0.8, 1.45, M['white'], bevel=0.01))
    out.append(ubox('board_fr', bu0 - 0.03, Cv + 0.04, bu1 + 0.03, Cv + 0.07, 0.77, 1.48, M['dark'], bevel=0.01))
    out.append(text('board_t', 'SPECIMENS', (bu0 + bu1) / 2, Cv + 0.1, 1.38, 0.07, M['ink'], face=True))
    for k, (lab_, col) in enumerate((('S-1  ok', M['ink']), ('S-4  tank EMPTY', pmat('mredink3', '#c0281e', 0.7)), ('S-7  DO NOT FEED', M['ink']))):
        out.append(text(f'board_r{k}', lab_, (bu0 + bu1) / 2, Cv + 0.1, 1.24 - k * 0.14, 0.075, col, face=True))
    out.append(ubox('board_x', bu0 + 0.1, Cv + 0.095, bu1 - 0.1, Cv + 0.1, 1.085, 1.115, pmat('mredink4', '#c0281e', 0.7), bevel=0))
    for k in range(4): out.append(ubox('board_pin', bu0 + 0.15 + k * 0.33, Cv + 0.09, bu0 + 0.2 + k * 0.33, Cv + 0.11, 1.42, 1.46, M['red'], bevel=0))
    out.append(text('tank_s7', 'S-7', -17.6, Cv + 0.72, 0.55, 0.11, M['ink'], face=True))
    out.append(text('tank_s4', 'S-4', -16.4, Cv + 0.72, 0.55, 0.11, pmat('mredink5', '#c0281e', 0.7), face=True))
    out.append(ubox('plaque', -17.95, Cv, -16.05, Cv + 0.02, 1.42, 1.58, worn('plq', '#e8c34f', 0.5, 0.2, wear=0.6), bevel=0.004))
    out.append(text('plaque_t', 'SPECIMEN 7 - DO NOT FEED', -17.0, Cv + 0.03, 1.5, 0.07, M['ink'], face=True))
    # the overturned tank, lying, cracked, slime spilled
    tu, tv = -17.2, -1.7
    out.append(mn.cyl('otank', 0.3, 1.0, loc=P(tu - 0.5, tv, 0.33), m=M['clear'], verts=28, bevel=0.01, rot=(0, R90, 0.25)))
    out.append(mn.cyl('otank_cap', 0.36, 0.16, loc=P(tu - 0.62, tv + 0.12, 0.36), m=M['steel'], verts=28, bevel=0.02, rot=(0, R90, 0.25)))
    stain(tu + 0.9, tv + 0.4, 0.75, M['slime'], out, sv=0.7)
    for k in range(4): out.append(cbox('glass_shard', tu + 0.7 + rng.uniform(-0.4, 0.4), tv + 0.4 + rng.uniform(-0.3, 0.3), 0.13, 0.06, FLOOR_Z, 0.01, M['clear'], bevel=0, rotz=rng.uniform(0, 3)))
    gu, gv = -11.5, -3.2
    out.append(ucyl('pot', 0.2, 0.3, gu, gv, 0.0, worn('pot', '#b86a3a', 0.6, 0.0, wear=0.5), verts=20, bevel=0.03))
    for k in range(6):
        a = k * math.tau / 6
        out.append(pipe_uv('stem', [(gu, gv, 0.3), (gu + math.cos(a) * 0.12, gv + math.sin(a) * 0.08, 0.5), (gu + math.cos(a) * 0.3, gv + math.sin(a) * 0.2, 0.42)], 0.018, pmat('deadleaf', '#6a5a2a', 0.8), corner=0.08))
    out.append(text('gerald', 'GERALD', gu, gv + 0.32, 0.12, 0.07, M['paper'], face=True))
    out.append(ucyl('mug', 0.07, 0.11, -12.9, Cv + 0.2, 0.72, M['white'], verts=14, bevel=0.01))
    # the black box: its mount in the core (the game draws items/blackbox at SPOT.box) and the scrawl on the core floor
    out.append(text('scrawl', 'WHICH ONE IS JONNO??', -12.6, -2.55, FLOOR_Z + 0.004, 0.16, decal_mat('redpaint', '#b0281e', 0.9, rough=0.7), rotz=0.06))
    # pirate graffiti on the airlock floor near the claw: their crew mark, half scuffed out
    out.append(text('rc_tag', 'RC WOZ ERE', -7.0, 1.6, FLOOR_Z + 0.004, 0.16, decal_mat('redpaint2', '#b0281e', 0.85, rough=0.7), rotz=-0.1))
    # --- lighting: dim (the module is dark), the lantern and the cold store glow, suit lamps, the fire, embers
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN': o.data.energy *= 0.36
    bg = bpy.context.scene.world.node_tree.nodes['Background']; bg.inputs[1].default_value = 0.08
    fu, fv = SPOT['fire']
    add_light('POINT', 'fire', P(fu, fv, 0.5), 30.0, (1.0, 0.55, 0.2), radius=0.3)
    add_light('POINT', 'cut', P(cu_, -7.2, cz + 0.4), 12.0, (1.0, 0.6, 0.3), radius=0.3)
    add_light('SPOT', 'beam_red', P(-14.6, 3.2, 1.0), 900.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(-16.2, 2.5, 0.0), spot=0.55, blend=0.3)
    add_light('SPOT', 'beam_blue', P(-19.3, 1.0, 1.0), 700.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(-22.4, 1.8, 0.0), spot=0.55, blend=0.3)
    add_light('SPOT', 'beam_green', P(-7.4, 0.2, 1.0), 800.0, (0.85, 0.92, 1.0), radius=0.05, aim=P(-8.0, -2.0, 0.3), spot=0.6, blend=0.3)
    add_light('SPOT', 'beam_pir', P(-12.6, 1.4, 1.2), 500.0, (0.9, 0.92, 1.0), radius=0.05, aim=P(-12.6, -1.2, 0.0), spot=0.8, blend=0.5)
    mn.outline(claw + bk + [o for o in out if o.name.split('.')[0] in ('claw_finger', 'claw_knuckle', 'pot', 'otank', 'otank_cap', 'board_fr', 'carbine', 'cs_post', 'cs_rail', 'shelf', 'lantern')], thickness=0.012)
    meshes = [o for o in objs + out if o is not None and o.type == 'MESH']
    return meshes

# ---------------------------------------------------------------------------------------------------
# A room of our own ship (the cargo bay) for the storyboard
# ---------------------------------------------------------------------------------------------------
def ship():
    mn.reset(); D.set_side('port')
    import shiplib; shiplib._hidden_in_data.clear()
    rng = random.Random(5); out = []
    M = ships.materials('brig')
    M.update(panel=worn('spanel', '#56606e', 0.45, 0.2, wear=0.5), panel2=worn('spanel2', '#6c7684', 0.45, 0.2, wear=0.5),
             body=worn('sbody', '#3e4652', 0.5, 0.3), lamp=emit_mat('slamp', '#dff0ff', 1.2, base='#ffffff'),
             hull=worn('shull', '#8a93a5', 0.5, 0.3, wear=0.6))
    plates = [worn(f'splate{i}', c, 0.5, 0.35, wear=0.5, grime=0.7, scale=1.5) for i, c in enumerate(['#58627a', '#5c6680', '#545e74'])]
    room = (-4.0, -2.4, 4.0, 2.4)
    floor_room(room, M, rng, dict(plate_mats=plates, tread_mat=M['tread'], tread=0.1, grille=0.1, lost_rivets=0.05), out)
    out.append(ubox('wall_n', -4.4, -3.4, 4.4, -2.4, 0.0, H_FULL, M['hull'], bevel=0.03))
    out.append(ubox('wall_w', -4.4, -2.4, -4.0, 2.8, 0.0, H_LOW, M['hull'], bevel=0.03))
    out.append(ubox('wall_e', 4.0, -2.4, 4.4, 2.8, 0.0, H_LOW, M['hull'], bevel=0.03))
    out.append(ubox('wall_s', -4.4, 2.4, 4.4, 2.8, 0.0, H_LOW, M['hull'], bevel=0.03))
    back_wall(-4.0, 4.0, -2.4, M, rng, out, lamps='on', skip=[(-1.6, 1.6)])
    # bench + the black box plugged into a console on the wall; a speaker glowing with the log's waveform
    v = -2.4
    out.append(ubox('bench', -1.5, v, 1.5, v + 0.55, 0.62, 0.72, M['panel2'], bevel=0.02))
    for u in (-1.4, 1.4): out.append(ubox('bench_leg', u - 0.05, v + 0.05, u + 0.05, v + 0.5, 0.0, 0.62, M['steel'], bevel=0.01))
    out.append(cbox('bbox', -0.2, v + 0.3, 0.62, 0.42, 0.72, 0.3, worn('bbox', '#e86a1e', 0.45, 0.3, wear=0.6), bevel=0.04))
    out.append(text('bbox_t', 'FLIGHT RECORDER', -0.2, v + 0.25, 1.03, 0.055, M['ink']))
    wall_screen(0.6, v, 0.95, 1.4, 0.55, M, out, emit_mat('scr_wave', '#5aff9a', 0.6, base='#103020'))
    for k in range(11):                                         # the waveform on the screen
        h = [0.05, 0.12, 0.3, 0.18, 0.42, 0.22, 0.36, 0.1, 0.25, 0.08, 0.04][k]
        out.append(ubox('wave', 0.02 + k * 0.11, v + 0.085, 0.07 + k * 0.11, v + 0.095, 1.22 - h / 2, 1.22 + h / 2, emit_mat('wave', '#d8ffe0', 1.2), bevel=0))
    out.append(ucyl('speaker', 0.16, 0.08, -1.0, v + 0.04, 1.15, M['dark'], axis='v', verts=24, bevel=0.01))
    out.append(ring('speaker_r', 0.16, 0.03, 0.03, loc=P(-1.0, v + 0.09, 1.15), m=emit_mat('spk', '#ffd58a', 0.9), rot=(R90, 0, 0)))
    out.append(pipe_uv('lead', [(-0.2, v + 0.1, 0.8), (0.1, v + 0.15, 0.9), (0.3, v + 0.07, 0.95)], 0.025, M['cables'][0], corner=0.15))
    out.append(pipe_uv('lead2', [(-0.45, v + 0.12, 0.78), (-0.8, v + 0.1, 0.9), (-1.0, v + 0.06, 1.0)], 0.02, M['cables'][1], corner=0.15))
    tape(-0.6, v + 0.3, 0.725, 0.3, M['tape'], out, rotz=0.5)
    out.append(text('cargo_t', 'CARGO', -1.6, 1.9, FLOOR_Z + 0.004, 0.3, decal_mat('ypaint', '#e8c34f', 0.85, rough=0.6)))
    # crates and clutter on the sides
    for (u, vv, s) in ((-3.4, -1.7, 0.7), (-3.4, -0.9, 0.6), (-2.75, -1.75, 0.55), (3.3, -1.6, 0.8), (3.35, 0.9, 0.6)):
        out.append(cbox('crate', u, vv, s, s * 0.85, 0.0, s * 0.8, worn('crate', '#7a6a4a', 0.6, 0.1, wear=0.7), bevel=0.03))
        out.append(ubox('crate_band', u - s / 2, vv + s * 0.42, u + s / 2, vv + s * 0.44, 0.1, s * 0.75, M['hazard'], bevel=0))
    out.append(ucyl('drum', 0.3, 0.7, 2.6, -1.8, 0.0, worn('drum', '#3a7a8a', 0.5, 0.3, wear=0.7), verts=24, bevel=0.03))
    debris(-3.8, -1.0, 3.8, 2.2, 8, [M['steel'], M['black'], M['paper']], rng, out, avoid=[(0, 0, 2.0)])
    mn.outline([o for o in out if o.name.split('.')[0] in ('bench', 'bbox', 'crate', 'drum', 'speaker', 'bench_leg')], thickness=0.012)
    mn.outline([o for o in out if o.name.split('.')[0].startswith('wall_')], thickness=0.02)
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN': o.data.energy *= 0.55
    add_light('POINT', 'scr', P(0.6, v + 0.9, 1.2), 25.0, (0.5, 1.0, 0.65), radius=0.4)
    add_light('POINT', 'warm', P(-2.0, 0.5, 2.0), 50.0, (1.0, 0.85, 0.65), radius=0.8)
    return [o for o in out if o.type == 'MESH']

# ---------------------------------------------------------------------------------------------------
# S-4, the true form
# ---------------------------------------------------------------------------------------------------
def skin_mat():
    """Translucent, mottled chameleon skin: colour patches that shift (violet / teal / mint / rose / amber),
    darker spots, wet coat, subsurface, faint inner veins glowing."""
    m = bpy.data.materials.new('s4skin'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    no = N.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 3.2; no.inputs['Detail'].default_value = 4; no.inputs['Distortion'].default_value = 1.2
    Lk(tc.outputs['Object'], no.inputs['Vector'])
    cr = N.new('ShaderNodeValToRGB'); E_ = cr.color_ramp.elements
    stops = [(0.3, '#3a1a6a'), (0.42, '#1a7a8a'), (0.5, '#5ad0a0'), (0.58, '#c04a7a'), (0.7, '#e08a30')]
    E_[0].position, E_[0].color = stops[0][0], (*lift(stops[0][1], 1.0), 1); E_[1].position, E_[1].color = stops[-1][0], (*lift(stops[-1][1], 1.0), 1)
    for p, c in stops[1:-1]:
        e = E_.new(p); e.color = (*lift(c, 1.0), 1)
    Lk(no.outputs['Fac'], cr.inputs['Fac'])
    vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 14; Lk(tc.outputs['Object'], vo.inputs['Vector'])
    sp = N.new('ShaderNodeMapRange'); sp.inputs['From Min'].default_value = 0.05; sp.inputs['From Max'].default_value = 0.15
    sp.inputs['To Min'].default_value = 0.55; sp.inputs['To Max'].default_value = 1.0; Lk(vo.outputs['Distance'], sp.inputs['Value'])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    Lk(cr.outputs[0], mul.inputs[6]); Lk(sp.outputs[0], mul.inputs[7])
    Lk(mul.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.32; b.inputs['Coat Weight'].default_value = 0.7; b.inputs['Coat Roughness'].default_value = 0.15
    b.inputs['Subsurface Weight'].default_value = 0.3; b.inputs['Subsurface Radius'].default_value = (0.4, 0.6, 0.5); b.inputs['Subsurface Scale'].default_value = 0.08
    b.inputs['Transmission Weight'].default_value = 0.2
    # veins: thin glowing lines from a second, stretched voronoi
    v2 = N.new('ShaderNodeTexVoronoi'); v2.feature = 'DISTANCE_TO_EDGE'; v2.inputs['Scale'].default_value = 6; Lk(tc.outputs['Object'], v2.inputs['Vector'])
    vr = N.new('ShaderNodeMapRange'); vr.inputs['From Min'].default_value = 0.0; vr.inputs['From Max'].default_value = 0.025
    vr.inputs['To Min'].default_value = 0.15; vr.inputs['To Max'].default_value = 0.0; Lk(v2.outputs['Distance'], vr.inputs['Value'])
    b.inputs['Emission Color'].default_value = (0.55, 1.0, 0.85, 1); Lk(vr.outputs[0], b.inputs['Emission Strength'])
    return m

def sac_mat():
    m = bpy.data.materials.new('s4sac'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1.0, 0.45, 0.08, 1); b.inputs['Emission Color'].default_value = (1.0, 0.5, 0.1, 1)
    b.inputs['Emission Strength'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.15; b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Transmission Weight'].default_value = 0.4
    return m

def creature(husk):
    mn.reset()
    import shiplib; shiplib._hidden_in_data.clear()
    out = []; flat = []                                       # flat: no outline (ribs, decals, tiny bits)
    SK = skin_mat(); SAC = sac_mat(); DK = mn.mat('s4dark', '#0c0a12', 0.15, 0.0, clearcoat=1.0)
    EYE = emit_mat('s4eye', '#b8ff4a', 0.9, base='#0a1408')
    s = 0.82                                                  # overall scale: ~1.5 units tall unfolded (crew ~1.05)
    def V(x, y, z): return Vector((x * s, y * s, z * s))
    # facing the camera = Blender -Y
    if not husk:
        out.append(mn.sphere('pelvis', 0.15 * s, loc=V(0, 0.02, 0.92), m=SK, scale=(1.25, 0.9, 0.8), segs=24))
        for sx in (-1, 1):                                    # digitigrade legs: thigh forward, shin back, long foot, splayed toes
            h = V(sx * 0.13, 0.02, 0.9); kn = V(sx * 0.22, -0.26, 0.62); hk = V(sx * 0.24, 0.2, 0.3); ft = V(sx * 0.26, -0.02, 0.04)
            out.append(C.tube('thigh', [h, (h + kn) / 2 + V(sx * 0.03, 0, 0.02), kn], 0.08 * s, SK, r_end=0.05 * s))
            out.append(C.tube('shin', [kn, (kn + hk) / 2, hk], 0.05 * s, SK, r_end=0.035 * s))
            out.append(C.tube('meta', [hk, (hk + ft) / 2, ft], 0.035 * s, SK, r_end=0.03 * s))
            for p in (kn, hk): out.append(mn.sphere('joint', 0.055 * s, loc=p, m=SK, segs=16))
            for t in (-0.5, 0.0, 0.5):                        # three long toes
                a = -math.pi / 2 + t * 0.9 + sx * 0.1
                tip = ft + V(math.cos(a) * 0.22, math.sin(a) * 0.22, -0.02); mid = ft + V(math.cos(a) * 0.11, math.sin(a) * 0.11, 0.02)
                out.append(C.tube('toe', [ft, mid, tip], 0.022 * s, SK, r_end=0.008 * s))
    # spine: arched back as it unfolds; chest; faint rib ridges
    base_z = 0.95 if not husk else 0.7
    sp = [V(0, 0.03, base_z), V(0, 0.08, (base_z + 1.25) / 2), V(0, 0.06, 1.25), V(0, 0.0, 1.38)]
    out.append(C.tube('torso', sp, 0.13 * s, SK, r_end=0.12 * s))
    out.append(mn.sphere('chest', 0.16 * s, loc=V(0, 0.01, 1.3), m=SK, scale=(1.35, 0.85, 1.0), segs=24))
    for k in range(3):
        z = 1.14 + k * 0.07
        flat.append(C.tube('rib', [V(-0.17, 0.0, z), V(-0.06, -0.13, z - 0.03), V(0.06, -0.13, z - 0.03), V(0.17, 0.0, z)], 0.014 * s, SK))
    out.append(C.tube('neck', [V(0, 0.0, 1.4), V(0, -0.05, 1.55), V(0, -0.12, 1.66)], 0.06 * s, SK, r_end=0.05 * s))
    out.append(mn.sphere('sac', 0.095 * s, loc=V(0, -0.15, 1.36), m=SAC, scale=(1.0, 0.85, 1.1), segs=24))   # the glowing throat sac
    head = mn.sphere('head', 0.17 * s, loc=V(0, -0.2, 1.74), m=SK, scale=(0.8, 1.35, 0.72), segs=28); head.rotation_euler = (math.radians(-35), 0, 0); out.append(head)
    for k in range(5):                                        # crest frill
        a = (k - 2) * 0.38
        f = mn.sphere('frill', 0.07 * s, loc=V(math.sin(a) * 0.14, -0.06 + abs(a) * 0.05, 1.86 - abs(a) * 0.06), m=SK, scale=(0.35, 1.4, 1.0), segs=12)
        f.rotation_euler = (math.radians(-30), 0, -a); out.append(f)
    for sx in (-1, 1):                                        # two pairs of small glossy eyes
        flat.append(mn.sphere('eye', 0.04 * s, loc=V(sx * 0.08, -0.37, 1.72), m=EYE, segs=12))
        flat.append(mn.sphere('eye2', 0.02 * s, loc=V(sx * 0.1, -0.3, 1.8), m=EYE, segs=10))
    flat.append(C.tube('mouth', [V(-0.06, -0.37, 1.63), V(0, -0.395, 1.615), V(0.06, -0.37, 1.63)], 0.007 * s, DK))
    # arms: too many joints (shoulder, two elbows, wrist), unfolding up and out; 4 long fingers with 4 joints each
    for sx in (-1, 1):
        sh = V(sx * 0.2, 0.0, 1.36); e1 = V(sx * 0.48, -0.06, 1.62); e2 = V(sx * 0.76, -0.16, 1.44); wr = V(sx * 0.86, -0.26, 1.14)
        for a_, b_, r0, r1 in ((sh, e1, 0.05, 0.04), (e1, e2, 0.04, 0.035), (e2, wr, 0.035, 0.028)):
            out.append(C.tube('arm', [a_, (a_ + b_) / 2, b_], r0 * s, SK, r_end=r1 * s))
        for p in (sh, e1, e2, wr): out.append(mn.sphere('ajoint', 0.045 * s, loc=p, m=SK, segs=14))
        for f in range(4):
            spread = (f - 1.5) * 0.35
            d = Vector((sx * math.sin(0.4 + spread) * 0.6, -0.5, -math.cos(0.4 + spread))).normalized() * 0.075 * s
            pts = [wr]; p = wr.copy()
            for j in range(4):                                # each segment curls a bit more
                d = Vector((d.x, d.y - 0.012 * s, d.z + 0.014 * s * j)); p = p + d; pts.append(p.copy())
            out.append(C.tube('finger', pts, 0.014 * s, SK, r_end=0.007 * s))
            for q in pts[1:-1]: flat.append(mn.sphere('knuckle', 0.018 * s, loc=q, m=SK, segs=10))
    if husk:
        # the Varga disguise peeled down like a wetsuit: her suit legs still standing, the torso fabric hanging
        # in flaps round the waist (wet pink inside), her helmet dangling at the hip, glasses on the floor,
        # and the name tag on the front flap: "DR. VRAGA"
        WH = C.worn('husk', '#e8e4dc', 0.55, 0.0, scratches=0.4); TE = C.worn('husk_t', '#3a9a94', 0.5, 0.1, scratches=0.4)
        IN = mn.mat('husk_in', '#9a4a5a', 0.35, 0.0, clearcoat=0.8)
        for sx in (-1, 1):
            out.append(C.capsule('suit_leg', 0.11 * s, 0.1 * s, 0.62 * s, x=sx * 0.13 * s, y=0.0, m=WH))
            out.append(mn.box('suit_knee', (0.2 * s, 0.05 * s, 0.08 * s), loc=V(sx * 0.13, -0.1, 0.34), m=TE, bevel=0.02))
            out.append(mn.sphere('boot', 0.12 * s, loc=V(sx * 0.14, -0.06, 0.06), m=TE, scale=(1.0, 1.45, 0.65), segs=18))
        out.append(mn.cyl('suit_belt', 0.22 * s, 0.1 * s, loc=V(0, 0, 0.6), m=TE, verts=28, bevel=0.02))
        # the torso of the suit, peeled down: a ragged flared skirt, white outside, wet pink inside (two-sided)
        import bmesh
        sm = bpy.data.materials.new('skirt'); sm.use_nodes = True; nt = sm.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
        o_ = N.new('ShaderNodeOutputMaterial'); mx = N.new('ShaderNodeMixShader'); g = N.new('ShaderNodeNewGeometry')
        wb = N.new('ShaderNodeBsdfPrincipled'); wb.inputs['Base Color'].default_value = (*lift('#e8e4dc', 1.1), 1); wb.inputs['Roughness'].default_value = 0.55
        pb = N.new('ShaderNodeBsdfPrincipled'); pb.inputs['Base Color'].default_value = (*lift('#a8445a', 1.1), 1); pb.inputs['Roughness'].default_value = 0.2; pb.inputs['Coat Weight'].default_value = 1.0
        Lk(g.outputs['Backfacing'], mx.inputs[0]); Lk(wb.outputs[0], mx.inputs[1]); Lk(pb.outputs[0], mx.inputs[2]); Lk(mx.outputs[0], o_.inputs['Surface'])
        rng = random.Random(3); me = bpy.data.meshes.new('skirt'); bm = bmesh.new(); n = 28; rows = 4; vs = []
        for r in range(rows + 1):
            t = r / rows; row = []
            for k in range(n):
                a = k * math.tau / n
                rag = rng.uniform(-0.06, 0.06) * t + (0.08 * t if k % 5 == 0 else 0)
                rad = 0.2 + 0.24 * t + 0.03 * math.sin(a * 3) * t
                row.append(bm.verts.new(V(math.cos(a) * rad, math.sin(a) * rad, 0.68 - 0.36 * t - rag)))
            vs.append(row)
        for r in range(rows):
            for k in range(n):
                if r == rows - 1 and k in (6, 7, 19): continue          # torn notches
                bm.faces.new([vs[r][k], vs[r][(k + 1) % n], vs[r + 1][(k + 1) % n], vs[r + 1][k]])
        bm.to_mesh(me); bm.free()
        sk = mn.link(bpy.data.objects.new('skirt', me)); mn.assign(sk, sm)
        sol = sk.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012; mn.smooth(sk); out.append(sk)
        out.append(ring('waist_trim', 0.21 * s, 0.03, 0.06 * s, loc=V(0, 0, 0.66), m=TE))
        # a deflated suit sleeve hanging off the side, glove at the end
        out.append(C.tube('sleeve', [V(-0.3, -0.05, 0.6), V(-0.44, -0.12, 0.42), V(-0.46, -0.2, 0.2), V(-0.42, -0.3, 0.06)], 0.055 * s, WH, r_end=0.045 * s))
        out.append(mn.sphere('glove', 0.065 * s, loc=V(-0.4, -0.34, 0.05), m=TE, scale=(1.3, 1.2, 0.5), segs=14))
        out.append(mn.cyl('waist_goo', 0.15 * s, 0.05 * s, loc=V(0, 0, 0.66), m=IN, verts=24, bevel=0.02))
        # name tag on the front flap
        flat.append(mn.box('tagplate', (0.38 * s, 0.012, 0.1 * s), loc=V(0, -0.36, 0.52), m=mn.mat('tagw', '#f6f4ec', 0.5), bevel=0.004, rot=(math.radians(-55), 0, 0)))
        flat.append(C.text_mesh('tag', 'DR. VRAGA', 0.075 * s, mn.mat('tagink', '#1a1c22', 0.6), V(0, -0.372, 0.525), rot=(math.radians(90 - 55), 0, 0)))
        # her helmet dangling at the hip on a strap, silver visor down; grey hair tuft caught in the seal
        out.append(C.tube('strap', [V(0.2, 0.05, 0.66), V(0.38, 0.0, 0.5), V(0.48, -0.08, 0.3)], 0.02 * s, TE))
        out.append(mn.sphere('helmet', 0.16 * s, loc=V(0.5, -0.1, 0.17), m=WH, scale=(1, 1, 0.95), segs=28))
        vz = mn.sphere('visor', 0.125 * s, loc=V(0.5, -0.2, 0.16), m=mn.mat('visor', '#b8c4d0', 0.1, 0.9), scale=(1.0, 0.55, 0.65), segs=20); out.append(vz)
        out.append(mn.sphere('hair', 0.08 * s, loc=V(0.5, -0.02, 0.3), m=mn.mat('hair', '#a8a8a8', 0.8), scale=(1.2, 1, 0.6), segs=12))
        for dx in (-0.055, 0.055):                            # round glasses on the floor
            flat.append(ring('glass_r', 0.045 * s, 0.009, 0.006, loc=V(-0.4 + dx, -0.45, 0.01), m=mn.mat('gl', '#2a2a2a', 0.4, 0.6)))
        flat.append(disc('pool', 0, -0.05, 0.002, 0.6 * s, decal_mat('pool', '#7ae8b0', 0.55, 5.0, rough=0.08), sv=0.8))
    else:
        flat.append(disc('pool', 0, 0.0, 0.002, 0.35 * s, decal_mat('pool', '#7ae8b0', 0.4, 5.0, rough=0.08), sv=0.8))
    shadow_catcher((4.0, 4.0))
    mn.outline([o for o in out if o.type == 'MESH'], thickness=0.008)
    add_light('POINT', 'sacglow', V(0, -0.4, 1.4), 5.0, (1.0, 0.65, 0.3), radius=0.1)
    allm = [o for o in out + flat if o.type == 'MESH']
    root = bpy.data.objects.new('root', None); bpy.context.scene.collection.objects.link(root)
    for o in allm + [o for o in bpy.context.scene.objects if o.name.startswith('outline') or o.name.endswith('_outline')]:
        if o.parent is None: o.parent = root
    root.rotation_euler.z = math.radians(-28 if husk else 25)
    bpy.context.view_layer.update()
    return allm

def render(name, meshes, ppu=None):
    _entry.clear()
    old = mn.PPU
    if ppu: mn.PPU = ppu
    try:
        mn.render(name, objs=meshes, passes=('beauty',))
    except Exception as e:                                       # shared GPU: fall back to the CPU
        print('[concept] GPU render failed, CPU fallback:', e)
        bpy.context.scene.cycles.device = 'CPU'
        mn.render(name, objs=meshes, passes=('beauty',))
    mn.PPU = old
    with open(os.path.join(OUT, f'{name}.json'), 'w') as f: json.dump(dict(_entry, ppu=ppu or old), f)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if os.environ.get('MN_CPU'): mn.reset = (lambda f: (lambda: (f(), setattr(bpy.context.scene.cycles, 'device', 'CPU'), bpy.context.scene)[-1]))(mn.reset)
    for v in VARIANTS:
        if v == 'lab': render('lab', lab())
        elif v == 'ship': render('ship', ship())
        elif v == 'unfold': render('unfold', creature(True), ppu=230)
        elif v == 'true': render('true', creature(False), ppu=230)
