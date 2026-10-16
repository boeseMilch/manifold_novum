"""CONCEPT MOCK-UP (not a game sprite): Captain Red Comet's quarters, the boss room of the pirate base (chapter 5).

The quarters sit between the gun corridor and the brig: entered through the old code door beside the sentry gun
(the corridor's north wall), the brig moves one room further north, its door in the quarters' back wall behind
the captain's throne.  Port-side coordinates relative to our hatch, like js/dock.js baseGeom:
    quarters R(-40, -20.7, -28, -10.7)   (12 x 10)
    door corridor -> quarters  (-34.6, -10.7, -33.0, -10.1)   (the old brig door)
    door quarters -> brig      (-33.4, -21.3, -31.8, -20.7)   (keypad, behind the captain)

    DOCK_CPU=1 blender -b --factory-startup --python tools/blender/models/concepts/boss_hall.py -- <out_dir> <mode> [samples]

mode  keyart : the room mid-fight (phase 1), <out_dir>/keyart_raw.png + keyart_raw.json (projection, muzzle point)
      p2room : the same room in COMET MODE (red lights, coat on the floor, dash line), p2room_raw.png + .json
      captain: the captain alone, cap_p1_front/back.png, cap_p2_front/back.png (transparent, PPU 200)
Never touches build/renders or the manifest.
"""
import sys, os, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dock'))
import bpy, bmesh
from mathutils import Vector, Matrix
import docklib as D
from docklib import *

A = D.args()
OUT = A[0] if A else '/tmp/mn_concept_boss2'
MODE = A[1] if len(A) > 1 else 'keyart'
mn.SAMPLES = int(A[2]) if len(A) > 2 else 24

ROOM = (-40.0, -20.7, -28.0, -10.7)
HULL = (-40.7, -21.4, -27.3, -10.0)
DOOR_S = (-34.6, -10.7, -33.0, -10.0)      # from the gun corridor
DOOR_N = (-33.4, -21.4, -31.8, -20.7)      # to the brig
DOOR_E = (-28.0, -19.3, -27.3, -17.3)      # the pirate-only blast door to the rest of the base (bolted on their side)
MID = -15.7                                # tall walls north of this

def mats(red_alert=False):
    M = dict(
        sub=pmat('sub', '#16181d', 0.8), hole=pmat('hole', '#0c0d10', 0.9), rivet=pmat('rivet', '#b4bcc8', 0.3, 0.8),
        bar=pmat('bar', '#4a515e', 0.4, 0.7, grime=0.4), dark=pmat('dark', '#1c1f25', 0.6), black=pmat('black', '#0b0c0f', 0.9),
        steel=worn('steel', '#a3abb8', 0.32, 0.85, wear=0.2, grime=0.6), rim=worn('rim', '#6a7383', 0.35, 0.8, grime=0.5),
        skirt=pmat('skirt', '#262a33', 0.6, 0.3, grime=0.5), tape=pmat('tape', '#b9bcc2', 0.85),
        hazard=stripes_mat('hazard'), cables=[pmat('c1', '#9a5634', 0.6), pmat('c2', '#3a5a8e', 0.6), pmat('c3', '#5a5e66', 0.6)],
        lamp_dead=pmat('lamp_dead', '#2a3038', 0.15, 0.2),
        lamp=emit_mat('lamp', '#ff3a2a', 1.5, base='#6a1a14') if red_alert else emit_mat('lamp', '#ffb46a', 1.2, base='#ffd0a0'),
        red_led=emit_mat('red_led', '#ff3a2a', 1.6, base='#6a1a14'), blue_led=emit_mat('blue_led', '#4ab8ff', 1.6, base='#1a4a6a'),
        green_led=emit_mat('green_led', '#5aff9a', 1.4, base='#2a7a4a'), amber_led=emit_mat('amber_led', '#ffb43a', 1.4, base='#7a5a1a'),
        holo=emit_mat('holo', '#1e5a6a', 0.7, base='#08141e'), holo_dot=emit_mat('holo_dot', '#8af0ff', 1.4),
        white=worn('white', '#d8d8d0', 0.5, 0.0, wear=0.6, grime=0.6), gold=worn('gold', '#e8b42e', 0.35, 0.7, wear=0.6, grime=0.5),
        red=worn('red', '#a83a3a', 0.5, 0.1, wear=0.8, grime=0.7), leather=worn('leather', '#8a2a24', 0.45, 0.0, wear=0.9, grime=0.8),
        brown=worn('brown', '#6a4a30', 0.7, 0.0, wear=0.5, grime=0.8), wood=worn('wood', '#7a5434', 0.6, 0.0, wear=0.6, grime=0.9),
        rug=worn('rug', '#7a1e22', 0.9, 0.0, wear=0.1, grime=1.0, scale=2), rubber=pmat('rubber', '#262a33', 0.7),
        paper=pmat('paper', '#e6dcbe', 0.8), sticker=pmat('sticker', '#f2df6b', 0.6), mug=worn('mug', '#d8d8d0', 0.4, 0.0, wear=0.4),
        oil=decal_mat('oil', '#0a0908', 0.85, rough=0.15), soot=decal_mat('soot', '#050404', 0.92, scale=3),
        burn=emit_mat('burn', '#ff6a1a', 1.3, base='#4a1a08'),
        hull=worn('hull', '#5a464c', 0.5, 0.2, wear=0.7, rust=0.15), hull2=worn('hull2', '#2e2428', 0.5, 0.2, rust=0.1),
        body=worn('body', '#4a3c3c', 0.6, 0.3, rust=0.15), panel=worn('panel', '#6a4a44', 0.5, 0.3, rust=0.2),
        panel2=worn('panel2', '#5e4e4c', 0.45, 0.3, rust=0.15), copper=worn('copper', '#b8902e', 0.35, 0.9, wear=0.3, rust=0.3),
        gun=worn('gun', '#3a3e46', 0.4, 0.6, wear=0.5), skin=pmat('skin', '#e6b48b', 0.6), cat=pmat('cat', '#1e1c22', 0.7),
        bone=worn('bone', '#d8ccae', 0.6, 0.0, wear=0.2, grime=0.9), alien=worn('alien', '#6a8a4a', 0.5, 0.0, wear=0.3, grime=0.8),
    )
    M['pipe1'] = worn('pipe1', '#3b7a8a', 0.4, 0.3, rust=0.08); M['pipe2'] = M['copper']
    M['plates'] = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.5, grime=0.8, scale=1.5, rust=0.12) for i, c in enumerate(['#6a5a5e', '#665658', '#6e5c5c', '#625458'])]
    M['tread'] = worn('tread', '#7f8794', 0.42, 0.55, wear=0.7, grime=1.0, scale=1.5, rust=0.08)
    # the captain
    M['coat'] = worn('coat', '#b02428', 0.6, 0.0, wear=0.25, grime=0.6)
    M['coat_in'] = worn('coat_in', '#3a1418', 0.8, 0.0, wear=0.1, grime=0.5)
    M['csuit'] = worn('csuit', '#6a5650', 0.6, 0.1, wear=0.5, grime=0.8)
    M['patch1'] = worn('patch1', '#4a6a8a', 0.7, 0.0, wear=0.3); M['patch2'] = worn('patch2', '#8a7a3a', 0.7, 0.0, wear=0.3)
    M['hat'] = worn('hat', '#24202a', 0.7, 0.0, wear=0.2, grime=0.4)
    M['beard'] = pmat('beard', '#c8401e', 0.9)
    M['weld'] = emit_mat('weld', '#ff9a3a', 0.6, base='#8a6a4a')
    M['core'] = emit_mat('core', '#3ac0ff', 1.5, base='#1a6aa0')
    M['core_hot'] = emit_mat('core_hot', '#5ad0ff', 1.3, base='#2a8ad0')
    M['leak'] = emit_mat('leak', '#2aa8ff', 1.5, base='#1a5aa0')
    M['muzzle'] = emit_mat('muzzle', '#ff5a1a', 1.3, base='#8a2a10')
    M['eye_red'] = emit_mat('eye_red', '#ff3a2a', 1.5)
    sh = bpy.data.materials.new('shield'); sh.use_nodes = True; nt = sh.node_tree; N = nt.nodes; N.clear()
    o_ = N.new('ShaderNodeOutputMaterial'); mx = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent'); em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.05, 0.35, 1.0, 1); em.inputs['Strength'].default_value = 0.8
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.1; mr.inputs['To Max'].default_value = 0.4
    nt.links.new(lw.outputs['Facing'], mr.inputs['Value']); nt.links.new(mr.outputs[0], mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o_.inputs['Surface'])
    M['shield'] = sh
    M['shield_line'] = emit_mat('shield_line', '#2a8cff', 0.9, base='#1a5ab0')
    M['flame'] = emit_mat('flame', '#ff8a2a', 1.5, base='#ff5a1a')
    M['flame_o'] = emit_mat('flame_o', '#ffe0a0', 1.4, base='#ffd080')
    D.M_DARK[0] = M['black']
    return M

# ---------------------------------------------------------------------------------------------------
# Captain Red Comet (built facing Blender -Y = game "down", feet at the origin; his right hand is at -X)
# ---------------------------------------------------------------------------------------------------
def open_cone(name, r0, r1, z0, z1, gap, m, thick=0.04, segs=32, back=0.0):
    """A cone shell (coat skirt, collar) open at the front (-Y) over +-gap degrees. back: extra flare at the back."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r0, radius2=r1, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, (z0 + z1) / 2))
    dead = []
    for f in bm.faces:
        c = f.calc_center_median(); a = math.degrees(math.atan2(c.x, -c.y))
        if abs(a) < gap: dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    if back:
        for v in bm.verts:
            if v.co.y > 0 and v.co.z < (z0 + z1) / 2: v.co.y += back * (v.co.y / max(r0, r1)) * ((z1 - v.co.z) / (z1 - z0))
    bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me))
    sd = o.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = thick; sd.offset = 0
    mn.bev(o, 0.01, 2); mn.assign(o, m); return mn.smooth(o)

def tube(name, a, b, r, m, verts=20, bevel=0.01, r2=None):
    """Cylinder (or cone with r2) from point a to point b (Blender coords)."""
    a, b = Vector(a), Vector(b); d = b - a
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=d.length)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, d.length / 2)); bm.to_mesh(me); bm.free()
    o = mn.link(bpy.data.objects.new(name, me)); o.location = a
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    if bevel: mn.bev(o, bevel)
    mn.assign(o, m); return mn.smooth(o)

def bx(name, c, size, m, bevel=0.03, rot=(0, 0, 0)):
    """Box centred at c (Blender coords)."""
    return mn.box(name, size, loc=(c[0], c[1], c[2] - size[2] / 2), m=m, bevel=bevel, rot=rot)

def sph(name, c, r, m, scale=(1, 1, 1), segs=24):
    return mn.sphere(name, r, loc=c, m=m, scale=scale, segs=segs)

def captain(M, phase=1, jets=False):
    o = []
    # boots and legs (patched pressure suit)
    for s in (-1, 1):
        o.append(bx('c_boot', (s * 0.2, -0.06, 0.12), (0.27, 0.44, 0.24), M['rubber'], bevel=0.08))
        o.append(bx('c_cuff', (s * 0.2, 0.0, 0.27), (0.3, 0.32, 0.08), M['gold'] if phase == 1 else M['steel'], bevel=0.03))
        o.append(tube('c_leg', (s * 0.2, 0, 0.25), (s * 0.21, 0, 0.82), 0.13, M['csuit'], bevel=0.03))
        o.append(sph('c_knee', (s * 0.21, -0.07, 0.55), 0.1, M['steel'], scale=(1, 0.7, 1)))
    o.append(bx('c_patch', (0.22, -0.12, 0.7), (0.14, 0.04, 0.12), M['patch1'], bevel=0.01))
    # torso: barrel chest, belt, buckle
    o.append(bx('c_torso', (0, 0.02, 1.08), (0.84, 0.56, 0.66), M['csuit'], bevel=0.18))
    o.append(bx('c_chestplate', (0, -0.22, 1.16), (0.5, 0.12, 0.34), M['steel'], bevel=0.05))
    o.append(bx('c_patch', (-0.16, -0.29, 1.22), (0.16, 0.03, 0.12), M['patch2'], bevel=0.01))
    o.append(bx('c_belt', (0, 0.02, 0.8), (0.9, 0.6, 0.12), M['brown'], bevel=0.04))
    o.append(bx('c_buckle', (0, -0.3, 0.8), (0.22, 0.05, 0.16), M['gold'], bevel=0.02))
    o.append(sph('c_buckle_skull', (0, -0.33, 0.81), 0.045, M['white']))
    o.append(bx('c_bandolier', (0, -0.25, 1.1), (0.08, 0.04, 0.7), M['brown'], bevel=0.01, rot=(0, 0.6, 0)))
    if phase == 1:
        # the long red coat, open at the front, gold trim; tails flare at the back
        o.append(open_cone('c_coat', 0.6, 0.44, 0.3, 1.4, 28, M['coat'], thick=0.05, back=0.12))
        o.append(open_cone('c_coat_hem', 0.615, 0.6, 0.29, 0.36, 28, M['gold'], thick=0.06, back=0.12))
        for s in (-1, 1):   # trim down the opening
            a = math.radians(28)
            p0 = (s * 0.6 * math.sin(a), -0.6 * math.cos(a), 0.32); p1 = (s * 0.44 * math.sin(a), -0.44 * math.cos(a), 1.4)
            o.append(tube('c_trim', p0, p1, 0.04, M['gold'], verts=10))
            for k in range(3):   # big brass buttons
                t = 0.4 + k * 0.2; q = [p0[i] + (p1[i] - p0[i]) * t for i in range(3)]
                o.append(sph('c_button', (q[0] * 0.92, q[1] - 0.03, q[2]), 0.04, M['gold']))
        o.append(bx('c_coat_patch', (0.3, 0.42, 0.75), (0.2, 0.05, 0.22), M['patch2'], bevel=0.01, rot=(0, 0, -0.5)))
        o.append(bx('c_coat_tape', (-0.32, 0.44, 0.95), (0.3, 0.04, 0.08), M['tape'], bevel=0.005, rot=(0, 0.5, -0.5)))
    # left shoulder: the jolly-roger plate; left arm (coat sleeve or patched suit)
    o.append(sph('c_lpad', (0.5, 0.0, 1.42), 0.24, M['hat'] if phase == 1 else M['csuit'], scale=(1, 1.1, 0.75)))
    o.append(bx('c_jr', (0.52, 0.0, 1.58), (0.36, 0.38, 0.05), M['black'], bevel=0.02))
    skull(0.52, 0.0, 1.61, 0.36, M['white'], o, face=False)
    o.append(tube('c_larm', (0.55, 0, 1.36), (0.62, -0.12, 0.98), 0.12, M['coat'] if phase == 1 else M['csuit']))
    o.append(tube('c_lfore', (0.62, -0.12, 0.98), (0.56, -0.36, 0.88), 0.11, M['coat'] if phase == 1 else M['csuit']))
    if phase == 1: o.append(tube('c_lcuff', (0.6, -0.2, 0.95), (0.57, -0.3, 0.9), 0.14, M['gold']))
    else: o.append(bx('c_ltape', (0.6, -0.15, 1.1), (0.27, 0.27, 0.07), M['tape'], bevel=0.01))
    o.append(sph('c_lfist', (0.55, -0.42, 0.86), 0.12, M['brown']))
    # right: the big cybernetic arm holding the comet cannon
    o.append(sph('c_rshoulder', (-0.52, 0.0, 1.42), 0.27, M['gun'], scale=(1, 1, 0.85)))
    o.append(bx('c_rplate', (-0.55, 0.0, 1.62), (0.34, 0.4, 0.06), M['hazard'], bevel=0.02))
    o.append(tube('c_rupper', (-0.6, 0, 1.36), (-0.68, -0.12, 1.02), 0.13, M['steel']))
    o.append(tube('c_piston', (-0.5, 0.08, 1.3), (-0.6, -0.1, 0.98), 0.035, M['copper']))
    o.append(sph('c_relbow', (-0.68, -0.12, 1.0), 0.14, M['gun']))
    o.append(sph('c_relbow_led', (-0.8, -0.14, 1.03), 0.04, M['eye_red']))
    o.append(tube('c_rfore', (-0.68, -0.14, 1.0), (-0.62, -0.5, 0.98), 0.17, M['gun'], r2=0.15))
    o.append(tube('c_rband', (-0.67, -0.28, 0.995), (-0.66, -0.36, 0.99), 0.18, M['hazard']))
    # the comet cannon: a brass blunderbuss bell with a glowing core and a plasma canister on top
    o.append(tube('c_gun', (-0.6, -0.45, 1.0), (-0.58, -1.05, 1.0), 0.11, M['copper'], r2=0.13))
    o.append(tube('c_bell', (-0.58, -1.0, 1.0), (-0.57, -1.3, 1.0), 0.13, M['copper'], r2=0.24))
    o.append(tube('c_bell_in', (-0.57, -1.24, 1.0), (-0.57, -1.305, 1.0), 0.19, M['muzzle'], bevel=0))
    for t in (-0.6, -0.85):
        o.append(tube('c_gband', (-0.6, t, 1.0), (-0.6, t - 0.05, 1.0), 0.14, M['steel']))
    o.append(tube('c_can', (-0.6, -0.6, 1.17), (-0.6, -0.9, 1.17), 0.07, M['muzzle']))
    o.append(tube('c_can_cap', (-0.6, -0.57, 1.17), (-0.6, -0.62, 1.17), 0.08, M['steel']))
    o.append(bx('c_gtape', (-0.6, -0.75, 1.0), (0.3, 0.09, 0.3), M['tape'], bevel=0.01))
    # head: face with a big red beard and an eye patch in an open-faced helmet
    o.append(tube('c_neckring', (0, 0, 1.38), (0, 0, 1.48), 0.26, M['steel']))
    o.append(sph('c_face', (0, -0.05, 1.7), 0.21, M['skin']))
    o.append(sph('c_beard', (0, -0.2, 1.55), 0.17, M['beard'], scale=(1.1, 0.75, 0.9)))
    o.append(sph('c_tache', (0, -0.25, 1.66), 0.1, M['beard'], scale=(1.7, 0.6, 0.4)))
    o.append(sph('c_nose', (0, -0.26, 1.72), 0.05, M['skin']))
    o.append(bx('c_patch_eye', (0.08, -0.22, 1.78), (0.1, 0.03, 0.08), M['black'], bevel=0.02))
    o.append(tube('c_strap', (-0.2, -0.05, 1.86), (0.2, -0.2, 1.76), 0.012, M['black'], verts=8, bevel=0))
    o.append(sph('c_eye', (-0.08, -0.2, 1.8), 0.045, M['eye_red'] if phase == 2 else M['black']))
    me = bpy.data.meshes.new('c_helmet'); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.3)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < -0.08 and f.calc_center_median().z < 0.17], context='FACES')
    bm.to_mesh(me); bm.free()
    h = mn.link(bpy.data.objects.new('c_helmet', me)); h.location = (0, 0.02, 1.68)
    sd = h.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = 0.04; mn.assign(h, M['gun']); mn.smooth(h); o.append(h)
    # the captain's hat, welded on: a black tricorne, gold trim, skull, glowing weld beads
    tri = mn.cyl('c_hat_brim', 0.5, 0.1, loc=(0, 0.04, 1.9), m=M['hat'], verts=3, bevel=0.14, rot=(0, 0, math.pi))
    o.append(tri)
    o.append(mn.cyl('c_hat_trim', 0.53, 0.04, loc=(0, 0.04, 1.88), m=M['gold'], verts=3, bevel=0.14, rot=(0, 0, math.pi)))
    o.append(mn.cyl('c_hat_crown', 0.22, 0.2, loc=(0, 0.04, 1.96), m=M['hat'], verts=24, bevel=0.06))
    o.append(mn.cyl('c_hat_band', 0.225, 0.05, loc=(0, 0.04, 1.97), m=M['gold'], verts=24, bevel=0.01))
    skull(0, -0.1, 2.165, 0.28, M['white'], o, face=False)       # (on top of the crown: the camera sees it)
    for i in range(10):
        a = i * 2 * math.pi / 10
        o.append(sph('c_weld', (0.3 * math.cos(a), 0.04 + 0.3 * math.sin(a), 1.9), 0.035, M['weld'], segs=10))
    # the SHIELD GENERATOR on his back: the glowing blue weak spot (lens, coils, emitter fins, antenna)
    o.append(bx('c_pack', (0, 0.44, 1.24), (0.7, 0.38, 0.66), M['gun'], bevel=0.07))
    o.append(bx('c_pack_hz', (0, 0.63, 0.96), (0.62, 0.03, 0.1), M['hazard'], bevel=0.01))
    o.append(tube('c_core', (0, 0.6, 1.26), (0, 0.7, 1.26), 0.2, M['steel'], verts=32))
    o.append(tube('c_lens', (0, 0.69, 1.26), (0, 0.73, 1.26), 0.16, M['core'], verts=32, bevel=0.01))
    o.append(sph('c_lens_hot', (0, 0.72, 1.26), 0.08, M['core_hot'], scale=(1, 0.5, 1)))
    for s_ in (-1, 1):
        o.append(tube('c_coil', (s_ * 0.3, 0.5, 0.98), (s_ * 0.3, 0.5, 1.5), 0.055, M['core'], verts=12))
        for z in (1.05, 1.2, 1.35): o.append(tube('c_coil_ring', (s_ * 0.3, 0.5, z), (s_ * 0.3, 0.5, z + 0.04), 0.07, M['copper'], verts=12))
        o.append(tube('c_hose', (s_ * 0.2, 0.42, 1.58), (s_ * 0.44, 0.15, 1.48), 0.035, M['cables'][1], verts=10))
    # emitter fins on top, fanned, with glowing tips; an antenna with a blue ball (the top glow the camera sees)
    for k, ang in enumerate((-0.5, 0.0, 0.5)):
        x = math.sin(ang) * 0.2
        fin = bx('c_fin', (x, 0.5, 1.72), (0.05, 0.26, 0.34), M['steel'], bevel=0.015, rot=(0, ang, 0)); o.append(fin)
        o.append(sph('c_fin_tip', (x + math.sin(ang) * 0.18, 0.5, 1.72 + math.cos(ang) * 0.18), 0.05, M['core_hot'], segs=12))
    o.append(tube('c_antenna', (0.24, 0.36, 1.55), (0.3, 0.36, 2.05), 0.018, M['steel'], verts=8))
    o.append(sph('c_dome', (0.3, 0.36, 2.08), 0.07, M['core_hot'], segs=14))
    o.append(bx('c_pack_tape', (-0.22, 0.64, 1.42), (0.08, 0.04, 0.3), M['tape'], bevel=0.005, rot=(0, 0.6, 0)))
    o.append(text('c_pack_lbl', 'SHIELD GEN', 0, -0.635, 1.03, 0.055, M['white'], face=False))
    o[-1].rotation_euler = (R90, 0, math.pi); o[-1].location = (0, 0.64, 1.03)
    # jet nozzles under the pack (closed in phase 1)
    for s in (-1, 1):
        o.append(tube('c_nozzle', (s * 0.2, 0.5, 0.95), (s * 0.22, 0.62, 0.72), 0.07, M['steel'], r2=0.11))
        if jets:
            o.append(tube('c_jet', (s * 0.22, 0.63, 0.7), (s * 0.28, 1.0, 0.5), 0.11, M['flame'], r2=0.04, bevel=0))
            o.append(tube('c_jet_o', (s * 0.22, 0.63, 0.7), (s * 0.26, 0.88, 0.58), 0.065, M['flame_o'], r2=0.02, bevel=0))
    if phase == 2:
        # cracked pack: dark crack lines, blue plasma leaking and dripping, a stray arc
        for (x, z, l, a) in ((-0.12, 1.3, 0.28, 0.9), (0.08, 1.18, 0.22, -0.7), (0.14, 1.4, 0.16, 0.3), (-0.05, 1.1, 0.18, -1.2)):
            o.append(bx('c_crack', (x, 0.735, z + 0.05), (l, 0.02, 0.03), M['black'], bevel=0, rot=(0, a, 0)))
        for (x, y, z, r, sz) in ((-0.2, 0.6, 1.1, 0.07, 1.6), (0.25, 0.55, 0.9, 0.06, 2.0), (0.05, 0.75, 0.95, 0.05, 2.4),
                                 (-0.3, 0.45, 0.7, 0.05, 1.4), (0.3, 0.3, 0.55, 0.04, 1.3), (0.15, 0.8, 1.4, 0.06, 1.0)):
            o.append(sph('c_leak', (x, y, z), r, M['leak'], scale=(1, 1, sz), segs=12))
        o.append(tube('c_arc', (-0.25, 0.7, 1.55), (-0.1, 0.85, 1.75), 0.015, M['leak'], verts=6, bevel=0))
        o.append(tube('c_arc', (-0.1, 0.85, 1.75), (0.05, 0.8, 1.68), 0.015, M['leak'], verts=6, bevel=0))
        o.append(bx('c_tape_x', (0, 0.6, 1.28), (0.5, 0.04, 0.08), M['tape'], bevel=0.005, rot=(0, -0.5, 0)))
    return [x for x in o if x is not None and x.type == 'MESH']

def shield(M, full=False, r=1.25):
    """The translucent blue hex energy shield: a half-dome in front of him (or a full bubble), hex lines via a dual mesh."""
    def shell(name):
        me = bpy.data.meshes.new(name); bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
        dead = [f for f in bm.faces if (f.calc_center_median().z < -0.9) or (not full and f.calc_center_median().y > -0.35 * r)]
        bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(me); bm.free()
        o = mn.link(bpy.data.objects.new(name, me)); o.location = (0, -0.05, 0.95); return mn.smooth(o)
    fill = shell('sh_fill'); mn.assign(fill, M['shield'])
    wire = shell('sh_wire')
    ng = bpy.data.node_groups.new('dual', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput'); go = ng.nodes.new('NodeGroupOutput'); dm = ng.nodes.new('GeometryNodeDualMesh')
    ng.links.new(gi.outputs[0], dm.inputs[0]); ng.links.new(dm.outputs[0], go.inputs[0])
    md = wire.modifiers.new('dual', 'NODES'); md.node_group = ng
    wf = wire.modifiers.new('wire', 'WIREFRAME'); wf.thickness = 0.022; wf.use_replace = True
    mn.assign(wire, M['shield_line'])
    return [fill, wire]

def place(objs, u, v, face_deg, scale=1.0):
    """Stand a model (built facing game 'down') at (u, v), facing game angle face_deg (0 right, 90 down)."""
    e = mn.group('cap_root', objs, loc=P(u, v, 0))
    e.rotation_euler = (0, 0, math.radians(90 - face_deg)); e.scale = (scale,) * 3
    bpy.context.view_layer.update()
    return e

# ---------------------------------------------------------------------------------------------------
# The room
# ---------------------------------------------------------------------------------------------------
def coins(u, v, r, n, M, out, rng, z0=FLOOR_Z):
    out.append(mn.sphere('gold_pile', r, loc=P(u, v, z0), m=M['gold'], scale=(1, 0.85, 0.45), segs=20))
    for _ in range(n):
        a = rng.uniform(0, 6.28); d = rng.uniform(r * 0.8, r * 1.9)
        out.append(ucyl('coin', 0.05, 0.015, u + d * math.cos(a), v + d * math.sin(a), z0, M['gold'], verts=12, bevel=0.004))

def crate(u, v, w, d, h, M, out, lbl=None, rotz=0.0, m=None):
    out.append(cbox('crate', u, v, w, d, FLOOR_Z, h, m or M['wood'], bevel=0.03, rotz=rotz))
    out.append(cbox('crate_band', u, v, w + 0.02, 0.08, FLOOR_Z + h * 0.3, 0.06, M['steel'], bevel=0.01, rotz=rotz))
    out.append(cbox('crate_band', u, v, w + 0.02, 0.08, FLOOR_Z + h * 0.7, 0.06, M['steel'], bevel=0.01, rotz=rotz))
    if lbl: out.append(text('crate_t', lbl, u, v + d / 2 + 0.01, FLOOR_Z + h * 0.5, 0.09, M['sticker'], face=True))

def build(phase=1):
    mn.reset(); set_side('port')
    rng = random.Random(11); M = mats(red_alert=phase == 2); out = []
    u0, v0, u1, v1 = HULL
    # hull: belly, low deck, tall walls north of MID
    out.append(prism('belly', rrect_pts(u0 + 0.12, v0 + 0.1, u1 - 0.12, v1 - 0.04, HULL_RAD), -0.55, 0.02, M['hull2'], bevel=0.06))
    out.append(mass('low_deck', rrect_pts(u0, v0, u1, v1, HULL_RAD), 0.0, H_LOW, [ROOM, (DOOR_S[0], DOOR_S[1], DOOR_S[2], DOOR_S[3] + 1)], M['hull'], bevel=0.03))
    out.append(mass('upper', rrect_pts(u0, v0, u1, MID, HULL_RAD, corners=(1, 1, 0, 0)), 0.0, H_FULL,
                    [(ROOM[0], ROOM[1], ROOM[2], 10), (DOOR_N[0], DOOR_N[1] - 1, DOOR_N[2], DOOR_N[3] + 0.1), (DOOR_E[0] - 0.1, DOOR_E[1], DOOR_E[2] + 1, DOOR_E[3])], M['hull'], bevel=0.03))
    style = dict(plate_mats=M['plates'], tread_mat=M['tread'], tread=0.12, grille=0.1, wonky=0.05, lost_rivets=0.05)
    floor_room(ROOM, M, rng, style, out)
    floor_room(DOOR_S, M, rng, dict(plate_mats=[M['tread']], tread_mat=M['tread'], tread=0, grille=0), out)
    out.append(ubox('lip_s', ROOM[0] - 0.02, ROOM[3], ROOM[2] + 0.02, ROOM[3] + 0.08, H_LOW - 0.02, H_LOW + 0.015, M['rim'], bevel=0.008))
    # tall-wall end faces (where the side walls drop to the low cutaway)
    for a, b in ((u0, ROOM[0]), (ROOM[2], u1)):
        out.append(ubox('endpanel', a + 0.05, MID, b - 0.05, MID + 0.03, 0.13, H_FULL - 0.12, M['panel'], bevel=0.012))
        out.append(ubox('end_hz', a + 0.07, MID + 0.02, b - 0.07, MID + 0.04, 0.25, 0.5, M['hazard'], bevel=0.005))
    # side walls: inner faces (lamp strips, pipes)
    for uu, sg in ((ROOM[0], 1), (ROOM[2], -1)):
        out.append(ubox('sidepanel', uu, ROOM[1], uu + sg * 0.03, MID, 0.12, H_FULL - 0.1, M['panel2'], bevel=0.01))
        out.append(ucyl('sidepipe', 0.05, MID - ROOM[1], uu + sg * 0.1, ROOM[1], 1.1, M['pipe1'], axis='v', verts=16, bevel=0))
    # the back wall: wall kit with gaps for the escape pod, portrait/throne, the brig door and the trophies
    back_wall(ROOM[0], ROOM[2], ROOM[1], M, rng, out, skip=[(-39.6, -38.2), (-37.0, -35.3), (-33.6, -30.6)])
    wv = ROOM[1]
    # -- the brig door (closed, locked) with its keypad
    out.append(ubox('brig_door', DOOR_N[0], wv - 0.3, DOOR_N[2], wv - 0.05, 0.0, H_FULL - 0.2, M['body'], bevel=0.02))
    for k in range(4):
        out.append(ubox('brig_bar', DOOR_N[0] + 0.25 + k * 0.37, wv - 0.06, DOOR_N[0] + 0.33 + k * 0.37, wv - 0.02, 0.15, H_FULL - 0.35, M['steel'], bevel=0.01))
    out.append(ubox('brig_hz', DOOR_N[0], wv - 0.06, DOOR_N[2], wv - 0.02, 0.0, 0.15, M['hazard'], bevel=0.005))
    for uu in (DOOR_N[0] - 0.1, DOOR_N[2]):
        out.append(ubox('brig_jamb', uu, wv - 0.05, uu + 0.1, wv + 0.06, 0.0, H_FULL - 0.05, M['hazard'], bevel=0.005))
    out.append(ubox('brig_lintel', DOOR_N[0] - 0.1, wv - 0.05, DOOR_N[2] + 0.1, wv + 0.06, H_FULL - 0.25, H_FULL - 0.05, M['dark'], bevel=0.01))
    out.append(text('brig_lbl', 'BRIG', (DOOR_N[0] + DOOR_N[2]) / 2, wv + 0.07, H_FULL - 0.23, 0.13, M['red_led'], face=True))
    out.append(ubox('keypad', -31.5, wv, -31.05, wv + 0.08, 0.8, 1.25, M['dark'], bevel=0.02))
    for i in range(3):
        for j in range(3):
            out.append(ubox('key', -31.45 + i * 0.13, wv + 0.07, -31.36 + i * 0.13, wv + 0.1, 0.86 + j * 0.1, 0.93 + j * 0.1, M['amber_led'], bevel=0.005))
    out.append(ubox('keypad_led', -31.45, wv + 0.07, -31.1, wv + 0.1, 1.16, 1.21, M['red_led'], bevel=0.005))
    out.append(ubox('pinnote', -31.45, wv + 0.08, -31.1, wv + 0.09, 1.3, 1.5, M['sticker'], bevel=0.003))
    out.append(text('pinnote_t', 'NOT\n1234', -31.27, wv + 0.1, 1.4, 0.045, M['black'], face=True))
    # -- the escape pod (far left, back wall): round hatch, captain only
    pu = -38.9
    out.append(mn.cyl('pod_ring', 0.62, 0.12, loc=P(pu, wv + 0.0, 0.78), m=M['hazard'], rot=(R90, 0, 0), verts=40, bevel=0.03))
    out.append(mn.cyl('pod_hatch', 0.5, 0.14, loc=P(pu, wv + 0.02, 0.78), m=M['steel'], rot=(R90, 0, 0), verts=40, bevel=0.03))
    out.append(mn.cyl('pod_win', 0.18, 0.16, loc=P(pu, wv + 0.04, 0.88), m=M['holo'], rot=(R90, 0, 0), verts=24, bevel=0.01))
    out.append(ubox('pod_handle', pu - 0.25, wv + 0.14, pu + 0.25, wv + 0.2, 0.52, 0.58, M['dark'], bevel=0.01))
    out.append(text('pod_lbl', 'ESCAPE POD', pu, wv + 0.08, 1.5, 0.11, M['sticker'], face=True))
    out.append(text('pod_lbl2', 'CAPTAIN ONLY', pu, wv + 0.08, 0.1, 0.075, M['white'], face=True))
    out.append(mn.sphere('pod_lamp', 0.07, loc=P(pu + 0.6, wv + 0.06, 1.35), m=M['green_led'], segs=12))
    # -- the duct-taped portrait of himself over the throne
    tu = -36.15
    out.append(ubox('portrait_fr', tu - 0.5, wv, tu + 0.5, wv + 0.07, 0.8, 1.5, M['gold'], bevel=0.03))
    out.append(ubox('portrait', tu - 0.4, wv + 0.06, tu + 0.4, wv + 0.08, 0.88, 1.42, worn('canvas', '#2a2a3a', 0.9, 0.0, grime=0.6), bevel=0.003))
    out.append(ubox('pt_coat', tu - 0.28, wv + 0.08, tu + 0.28, wv + 0.09, 0.88, 1.08, M['coat'], bevel=0.0))
    out.append(mn.cyl('pt_face', 0.12, 0.01, loc=P(tu, wv + 0.08, 1.16), m=M['skin'], rot=(R90, 0, 0), verts=20, bevel=0))
    out.append(mn.cyl('pt_beard', 0.11, 0.012, loc=P(tu, wv + 0.085, 1.08), m=M['beard'], rot=(R90, 0, 0), verts=20, bevel=0))
    out.append(ubox('pt_hat', tu - 0.24, wv + 0.08, tu + 0.24, wv + 0.095, 1.25, 1.36, M['hat'], bevel=0.0))
    out.append(ubox('pt_hat_t', tu - 0.24, wv + 0.09, tu + 0.24, wv + 0.1, 1.24, 1.26, M['gold'], bevel=0.0))
    for (a, z, r) in ((-0.42, 1.48, 0.7), (0.42, 1.48, -0.7), (0.0, 0.84, 0.0)):
        t = cbox('pt_tape', tu + a, wv + 0.1, 0.36 if r else 0.5, 0.012, z - 0.04, 0.08, M['tape'], bevel=0.003)
        t.rotation_euler = (0, r, 0); out.append(t)
    out.append(text('pt_lbl', 'THE CAPTAIN (HANDSOME)', tu, wv + 0.08, 0.72, 0.055, M['gold'], face=True))
    # -- WANTED poster between throne and brig door
    wu = -34.3
    out.append(ubox('wanted', wu - 0.34, wv + 0.03, wu + 0.34, wv + 0.05, 0.62, 1.42, M['paper'], bevel=0.004))
    out.append(text('wanted_t', 'WANTED', wu, wv + 0.06, 1.33, 0.1, M['black'], face=True))
    out.append(mn.cyl('wanted_cat', 0.13, 0.01, loc=P(wu, wv + 0.05, 1.08), m=M['cat'], rot=(R90, 0, 0), verts=20, bevel=0))
    for su in (-1, 1): out.append(ubox('wanted_ear', wu + su * 0.09 - 0.03, wv + 0.05, wu + su * 0.09 + 0.03, wv + 0.06, 1.17, 1.24, M['cat'], bevel=0))
    out.append(text('wanted_t2', 'ONE SHIP CAT', wu, wv + 0.06, 0.86, 0.065, M['black'], face=True))
    out.append(text('wanted_t3', '10,000 CR', wu, wv + 0.06, 0.73, 0.06, M['red'], face=True))
    out.append(cbox('wanted_tape', wu, wv + 0.06, 0.24, 0.012, 1.38, 0.06, M['tape'], bevel=0.003))
    # -- trophies on the right of the back wall: a ship's wheel, a mounted alien skull, crossed cutlasses, a shelf of cups
    hu = -30.0
    out.append(D.ring('wheel', 0.38, 0.07, 0.06, loc=P(hu, wv + 0.05, 1.05), m=M['wood'], rot=(R90, 0, 0)))
    for k in range(4):
        sp = mn.box('spoke', (0.95, 0.04, 0.05), loc=P(hu, wv + 0.08, 1.03), m=M['wood'], bevel=0.01, rot=(0, k * math.pi / 4, 0))
        sp.location = P(hu, wv + 0.1, 1.05); out.append(sp)
    out.append(mn.cyl('wheel_hub', 0.08, 0.1, loc=P(hu, wv + 0.05, 1.05), m=M['gold'], rot=(R90, 0, 0), verts=16))
    au = -31.0 + 2.4
    out.append(ubox('plaque', au - 0.3, wv, au + 0.3, wv + 0.06, 0.95, 1.38, M['wood'], bevel=0.02))
    out.append(mn.sphere('alien_skull', 0.22, loc=P(au, wv + 0.2, 1.22), m=M['bone'], scale=(1.0, 0.9, 1.25), segs=20))
    for su in (-1, 1): out.append(mn.sphere('alien_eye', 0.07, loc=P(au + su * 0.09, wv + 0.38, 1.26), m=M['black'], scale=(1, 0.5, 1.3), segs=12))
    out.append(text('alien_t', 'BIG ONE', au, wv + 0.07, 1.0, 0.05, M['gold'], face=True))
    # cups on a shelf
    out.append(ubox('shelf', -33.5 + 2.2, wv, -31.9 + 2.2, wv + 0.35, 1.38, 1.44, M['wood'], bevel=0.01))
    for k, uu in enumerate((-31.15, -30.75, -30.4)):
        out.append(ucyl('cup', 0.07 + 0.02 * (k == 1), 0.18 + 0.06 * (k == 1), uu, wv + 0.18, 1.44, M['gold'], verts=16))
    # -- the throne: a stolen pilot seat on a dais, gold paint, harness, skull; a rug in front
    cu, cv = -36.15, -19.55
    out.append(cbox('dais', cu, cv + 0.05, 2.2, 1.6, FLOOR_Z, 0.14, M['hull2'], bevel=0.03))
    out.append(cbox('dais_hz', cu, cv + 0.83, 2.2, 0.06, FLOOR_Z, 0.16, M['hazard'], bevel=0.01))
    out.append(cbox('rug', cu + 0.3, cv + 3.0, 1.9, 3.4, FLOOR_Z + 0.02, 0.012, M['rug'], bevel=0.005, rotz=0.08))
    out.append(cbox('rug_t', cu + 0.3, cv + 3.0, 1.98, 3.48, FLOOR_Z + 0.02, 0.008, M['gold'], bevel=0.003, rotz=0.08))
    skull(cu + 0.4, cv + 2.6, FLOOR_Z + 0.034, 1.0, M['gold'], out, face=False)
    out.append(ucyl('th_post', 0.08, 0.3, cu, cv, FLOOR_Z + 0.14, M['steel']))
    out.append(cbox('th_seat', cu, cv, 0.95, 0.85, 0.45, 0.2, M['leather'], bevel=0.08))
    out.append(cbox('th_back', cu, cv - 0.42, 1.05, 0.22, 0.5, 1.15, M['leather'], bevel=0.09))
    out.append(cbox('th_back_trim', cu, cv - 0.42, 1.12, 0.26, 1.6, 0.08, M['gold'], bevel=0.03))
    out.append(cbox('th_head', cu, cv - 0.46, 0.55, 0.25, 1.62, 0.28, M['leather'], bevel=0.08))
    for su in (-1, 1):
        out.append(cbox('th_arm', cu + su * 0.55, cv - 0.05, 0.16, 0.75, 0.6, 0.12, M['gold'], bevel=0.04))
        out.append(cbox('th_belt', cu + su * 0.22, cv - 0.3, 0.1, 0.04, 0.7, 0.8, M['dark'], bevel=0.01))
        out.append(mn.sphere('th_knob', 0.1, loc=P(cu + su * 0.55, cv + 0.33, 0.78), m=M['gold'], segs=16))
    skull(cu, cv - 0.3, 1.05, 0.48, M['white'], out, face=True)
    out.append(text('th_lbl', 'PILOT SEAT  (NOW THRONE)', cu, cv + 0.86, FLOOR_Z + 0.14, 0.07, M['sticker'], face=True))
    out.append(cbox('th_tape', cu + 0.3, cv - 0.3, 0.42, 0.012, 0.7, 0.08, M['tape'], bevel=0.003))
    out[-1].rotation_euler = (0, 0.4, 0)
    # a grog barrel and an empty cat bed beside the throne
    out.append(ucyl('grog', 0.32, 0.75, -37.85, -19.9, FLOOR_Z, M['wood'], verts=24, bevel=0.04))
    for z in (0.15, 0.6): out.append(ucyl('grog_band', 0.335, 0.06, -37.85, -19.9, FLOOR_Z + z, M['steel'], verts=24, bevel=0.01))
    out.append(text('grog_t', 'GROG', -37.85, -19.57, 0.42, 0.08, M['white'], face=True))
    out.append(ucyl('mug2', 0.07, 0.15, -37.75, -19.95, 0.8, M['mug'], verts=14))
    out.append(D.ring('catbed', 0.32, 0.1, 0.12, loc=P(-34.6, -19.9, FLOOR_Z), m=M['coat']))
    out.append(ucyl('catbed_in', 0.24, 0.04, -34.6, -19.9, FLOOR_Z, M['paper'], verts=24))
    out.append(text('catbed_t', 'ADMIRAL', -34.6, -19.45, FLOOR_Z + 0.004, 0.07, M['white']))
    # -- loot piles: gold, crates, a stolen fuel cell, a chest of goblets (back left, back right, south-west corner)
    coins(-39.2, -18.6, 0.38, 14, M, out, rng)
    crate(-39.25, -17.4, 0.7, 0.6, 0.55, M, out, 'LOOT')
    crate(-39.4, -16.6, 0.5, 0.5, 0.4, M, out, None, m=M['red'])
    coins(-30.6, -19.95, 0.28, 10, M, out, rng)
    crate(-29.25, -20.05, 0.65, 0.6, 0.7, M, out, 'NOT\nOURS')
    out.append(ucyl('fuelcell', 0.12, 0.5, -29.9, -19.45, FLOOR_Z, emit_mat('fuelg', '#b8ff6a', 1.2, base='#5a9a3a'), verts=16))
    out.append(ucyl('fuelcap', 0.135, 0.08, -29.9, -19.45, FLOOR_Z + 0.5, M['steel'], verts=16))
    # -- the PIRATE-ONLY blast door (east wall): to the rest of the base, bolted from their side
    e0, e1 = DOOR_E[1], DOOR_E[3]; eu = ROOM[2]
    out.append(ubox('bd_slab', eu + 0.05, e0, eu + 0.35, e1, 0.0, H_FULL - 0.05, M['body'], bevel=0.03))
    out.append(ubox('bd_hz', eu - 0.02, e0 + 0.1, eu + 0.05, e1 - 0.1, 0.05, H_FULL - 0.2, M['hazard'], bevel=0.01))
    for vv in (e0 - 0.32, e1):     # heavy frame posts sticking into the room, their camera-facing ends striped
        out.append(ubox('bd_post', eu - 0.38, vv, eu + 0.02, vv + 0.32, 0.0, H_FULL + 0.12, M['steel'], bevel=0.03))
        out.append(ubox('bd_post_hz', eu - 0.36, vv + 0.3, eu, vv + 0.34, 0.1, H_FULL, M['hazard'], bevel=0.005))
    out.append(ubox('bd_lintel', eu - 0.4, e0 - 0.34, eu + 0.04, e1 + 0.34, H_FULL - 0.05, H_FULL + 0.18, M['dark'], bevel=0.03))
    out.append(text('bd_lbl', 'CREW ONLY', eu - 0.18, (e0 + e1) / 2, H_FULL + 0.185, 0.14, M['sticker'], rotz=R90))
    out.append(mn.sphere('bd_lamp', 0.09, loc=P(eu - 0.2, e1 + 0.17, H_FULL + 0.2), m=M['red_led'], segs=14))
    for k in range(4):            # bolt heads (the bolts are on their side; these are just for show)
        out.append(ucyl('bd_bolt', 0.06, 0.06, eu - 0.04, e0 + 0.35 + k * 0.45, 0.75, M['steel'], axis='u', verts=12))
    out.append(text('bd_floor', 'CREW ONLY · REST OF BASE', eu - 1.05, (e0 + e1) / 2, FLOOR_Z + 0.004, 0.17, M['sticker'], rotz=R90))
    for k in range(5):            # hazard chevrons on the floor in front of it
        out.append(cbox('bd_chev', eu - 0.55, e0 + 0.2 + k * 0.4, 0.3, 0.12, FLOOR_Z, 0.006, M['hazard'], bevel=0, rotz=0.6))
    coins(-39.2, -11.7, 0.3, 9, M, out, rng)
    crate(-38.9, -12.6, 0.6, 0.55, 0.45, M, out, None)
    out.append(ucyl('goblet', 0.06, 0.2, -38.5, -11.5, FLOOR_Z, M['gold'], verts=12))
    out.append(text('loot_t', 'LOOT GOES HERE', -39.0, -11.0, FLOOR_Z + 0.004, 0.09, M['sticker']))
    # -- the map table (east side): a holo star chart with a red route to OUR ship, a dagger stuck in it
    mu, mv = -29.4, -14.9
    out.append(cbox('mt_base', mu, mv, 1.1, 1.5, FLOOR_Z, 0.72, M['body'], bevel=0.04))
    out.append(cbox('mt_top', mu, mv, 1.3, 1.7, 0.72, 0.08, M['wood'], bevel=0.03))
    out.append(cbox('mt_scr', mu, mv, 1.1, 1.5, 0.8, 0.01, M['holo'], bevel=0.0))
    for _ in range(14):
        out.append(ucyl('star', 0.025, 0.006, mu + rng.uniform(-0.5, 0.5), mv + rng.uniform(-0.7, 0.7), 0.81, M['holo_dot'], verts=8, bevel=0))
    pts = [(mu - 0.4, mv + 0.55), (mu - 0.1, mv + 0.1), (mu + 0.2, mv + 0.2), (mu + 0.35, mv - 0.45)]
    for (a, b), (c, d) in zip(pts, pts[1:]):
        L = math.hypot(c - a, d - b)
        out.append(cbox('route', (a + c) / 2, (b + d) / 2, L, 0.025, 0.812, 0.004, M['red_led'], bevel=0, rotz=math.atan2(d - b, c - a)))
    out.append(D.ring('target', 0.1, 0.02, 0.006, loc=P(mu + 0.35, mv - 0.45, 0.812), m=M['red_led']))
    out.append(text('mt_t', 'THEM', mu + 0.35, mv - 0.6, 0.82, 0.06, M['red_led']))
    out.append(cbox('dagger', mu - 0.25, mv - 0.35, 0.05, 0.05, 0.8, 0.28, M['steel'], bevel=0.01))
    out.append(cbox('dagger_h', mu - 0.25, mv - 0.35, 0.2, 0.05, 1.02, 0.04, M['gold'], bevel=0.01))
    out.append(cbox('mt_paper', mu + 0.3, mv + 0.55, 0.32, 0.22, 0.8, 0.006, M['paper'], bevel=0.0, rotz=0.4))
    out.append(ucyl('mt_mug', 0.07, 0.14, mu - 0.45, mv - 0.62, 0.8, M['mug'], verts=14))
    # -- cover 1: the overturned desk (centre left), tabletop facing the captain, legs in the air, drawers spilled
    du, dv = -37.4, -13.6
    out.append(cbox('desk_top', du, dv, 2.1, 0.14, FLOOR_Z, 0.95, M['wood'], bevel=0.03, rotz=0.05))
    out.append(cbox('desk_trim', du, dv, 2.14, 0.16, FLOOR_Z + 0.9, 0.07, M['gold'], bevel=0.02, rotz=0.05))
    for su in (-1, 1):
        for zz in (0.2, 0.75):
            out.append(cbox('desk_leg', du + su * 0.85, dv - 0.42, 0.1, 0.75, FLOOR_Z + zz, 0.1, M['wood'], bevel=0.02))
    out.append(cbox('desk_side', du + 0.55, dv - 0.4, 0.06, 0.7, FLOOR_Z, 0.85, M['wood'], bevel=0.02))
    out.append(cbox('drawer', du - 0.4, dv + 0.75, 0.5, 0.4, FLOOR_Z, 0.18, M['wood'], bevel=0.02, rotz=0.6))
    for _ in range(7):
        out.append(cbox('paper', du + rng.uniform(-1.2, 1.4), dv + rng.uniform(0.4, 1.5), 0.24, 0.32, FLOOR_Z + 0.002, 0.004, M['paper'], bevel=0, rotz=rng.uniform(0, 3)))
    for k in range(3):     # scorched holes where his shots hit the desk
        out.append(mn.cyl('desk_hole', 0.06, 0.01, loc=P(du - 0.6 + k * 0.55, dv - 0.075, 0.45 + 0.15 * (k % 2)), m=M['black'], rot=(R90, 0, 0), verts=12, bevel=0))
    out.append(text('desk_t', "CAPTAIN'S DESK", du, dv + 0.08, FLOOR_Z + 0.55, 0.08, M['gold'], face=True))
    # -- cover 2: the treasure chest (south-east), lid open, gold spilling
    tu, tv = -30.6, -12.6
    out.append(cbox('chest', tu, tv, 1.3, 0.8, FLOOR_Z, 0.62, M['wood'], bevel=0.04))
    out.append(cbox('chest_lid', tu, tv - 0.48, 1.32, 0.14, FLOOR_Z + 0.55, 0.55, M['wood'], bevel=0.04))
    for su in (-0.45, 0.45):
        out.append(cbox('chest_band', tu + su, tv, 0.08, 0.84, FLOOR_Z, 0.64, M['gold'], bevel=0.01))
    out.append(cbox('chest_gold', tu, tv, 1.15, 0.65, FLOOR_Z + 0.55, 0.1, M['gold'], bevel=0.04))
    out.append(cbox('chest_lock', tu, tv + 0.41, 0.16, 0.04, FLOOR_Z + 0.35, 0.18, M['gold'], bevel=0.01))
    coins(tu + 0.7, tv + 0.55, 0.16, 8, M, out, rng)
    # -- cover 3: a pillar (north-east), riveted, hazard bands, pipes, duct tape
    pu, pv = -31.3, -17.0
    out.append(cbox('pillar', pu, pv, 0.8, 0.8, 0.0, H_FULL + 0.25, M['panel'], bevel=0.04))
    for su in (-1, 1):
        for sv in (-1, 1): out.append(cbox('pillar_corner', pu + su * 0.38, pv + sv * 0.38, 0.12, 0.12, 0.0, H_FULL + 0.25, M['hazard'], bevel=0.02))
    out.append(cbox('pillar_top', pu, pv, 1.0, 1.0, H_FULL + 0.2, 0.12, M['steel'], bevel=0.03))
    out.append(cbox('pillar_foot', pu, pv, 1.0, 1.0, 0.0, 0.12, M['steel'], bevel=0.03))
    out.append(ucyl('pillar_pipe', 0.06, H_FULL + 0.2, pu + 0.46, pv - 0.1, 0.0, M['pipe2'], verts=12))
    for k in range(4):
        out.append(face_rivet(pu - 0.24 + k * 0.16, pv + 0.4, 0.35, M['steel'])); out.append(face_rivet(pu - 0.24 + k * 0.16, pv + 0.4, 1.5, M['steel']))
    out.append(cbox('pillar_tape', pu, pv + 0.41, 0.6, 0.012, 0.85, 0.09, M['tape'], bevel=0.003))
    out[-1].rotation_euler = (0, 0.35, 0)
    out.append(cbox('pillar_tape2', pu, pv, 0.84, 0.84, 1.15, 0.08, M['tape'], bevel=0.01))
    out.append(text('pillar_t', 'LOAD BEARING\n(PROBABLY)', pu, pv + 0.42, 0.62, 0.055, M['white'], face=True))
    # -- floor: a scorched old comet hit, oil, cables, stencils
    stain(-33.0, -14.6, 0.55, M['soot'], out)
    stain(-30.2, -19.7, 0.4, M['oil'], out)
    stain(-37.0, -16.8, 0.35, M['oil'], out)
    out.append(pipe_uv('cable', [(-29.4, -14.1, 0.06), (-29.6, -12.0, 0.06), (-28.3, -11.3, 0.06)], 0.05, M['cables'][0], corner=0.4))
    tape(-29.6, -12.6, 0.07, 0.3, M['tape'], out, rotz=0.0)
    out.append(text('st_knock', "CAPTAIN'S QUARTERS  ·  KNOCK FIRST", -33.8, -11.3, FLOOR_Z + 0.003, 0.15, M['sticker']))
    out.append(text('plaque', 'THE CAPTAIN IS ALWAYS RIGHT', -37.6, -10.25, H_LOW + 0.004, 0.13, M['white']))
    debris(ROOM[0] + 0.4, ROOM[1] + 2.0, ROOM[2] - 0.4, ROOM[3] - 0.3, 22, [M['steel'], M['panel'], M['paper'], M['gold']], rng, out,
           avoid=[(-34.4, -16.0, 1.2), (du, dv, 1.3), (tu, tv, 1.0), (pu, pv, 0.7), (mu, mv, 1.0)])
    # -- the corridor door (south): open, hazard jambs on the low lip
    for uu in (DOOR_S[0] - 0.08, DOOR_S[2]):
        out.append(ubox('door_s_jamb', uu, -10.7, uu + 0.08, -10.0, H_LOW - 0.02, H_LOW + 0.03, M['hazard'], bevel=0.005))
    out.append(ubox('door_s_led', DOOR_S[0] - 0.1, -10.08, DOOR_S[2] + 0.1, -10.0, H_LOW, H_LOW + 0.04, M['green_led'], bevel=0.004))
    # alarm beacons (lit in phase 2)
    for bu in (-37.2, -29.0):
        out.append(ucyl('beacon_base', 0.13, 0.06, bu, wv - 0.3, H_FULL, M['dark']))
        out.append(mn.sphere('beacon', 0.12, loc=P(bu, wv - 0.3, H_FULL + 0.08), m=M['red_led'] if phase == 2 else M['lamp_dead'], scale=(1, 1, 0.9), segs=20))
    extra = {}
    if phase == 2:
        # the coat he threw off, the dash telegraph line on the floor, his last fire trail, scorch marks
        for (a, b, r, sx) in ((-29.9, -15.3, 0.4, 1.5), (-29.5, -15.0, 0.3, 1.2), (-30.3, -15.0, 0.28, 1.0)):
            out.append(mn.sphere('coat_heap', r, loc=P(a, b, FLOOR_Z), m=M['coat'], scale=(sx, 1.0, 0.3), segs=20))
        out.append(cbox('coat_heap_trim', -29.9, -15.0, 1.0, 0.07, FLOOR_Z + 0.08, 0.05, M['gold'], bevel=0.02, rotz=0.4))
        out.append(mn.sphere('coat_button', 0.04, loc=P(-30.1, -15.25, FLOOR_Z + 0.12), m=M['gold'], segs=10))
    out = [o for o in dict.fromkeys(out) if o is not None and o.type == 'MESH']
    big = [o for o in out if o.name.startswith(('low_deck', 'upper', 'belly'))]
    skip = ('stain', 'plate', 'lz', 'slat', 'grille', 'subfloor', 'rivet', 'node', 'link', 'key', 'led', 'st_', 'text', 'tape', 'route', 'star',
            'pt_', 'wanted_', 'coin', 'paper', 'frv', 'rug', 'skull', 'jaw', 'bone', 'eye', 'plaque', 'desk_hole', 'mt_scr', 'mt_t', 'catbed_t', 'loot_t', 'coat_t')
    rest = [o for o in out if o not in big and not o.name.startswith(skip)]
    mn.outline(big, thickness=0.02); mn.outline(rest, thickness=0.012)
    return out, M

def project(world, ox, oy, ppu):
    x, y = mn._screen(world)
    return ox + x * ppu, oy - y * ppu

def room_render(phase):
    mn.PPU = 96
    out, M = build(phase)
    if phase == 1:
        cap = captain(M, 1); cu, cv, face = -34.4, -16.0, 128
    else:
        cap = captain(M, 2, jets=True); cu, cv, face = -31.6, -14.0, 176
    mn.outline(cap, thickness=0.014)
    root = place(cap + shield(M), cu, cv, face, 1.12)
    if phase == 2:     # red room light: a red sun from above, the warm key dimmed
        bpy.data.objects['key'].data.energy = 0.9; bpy.data.objects['fill'].data.energy = 0.3
        d = bpy.data.lights.new('alarm', 'SUN'); d.energy = 3.2; d.color = (1.0, 0.18, 0.12)
        lo = bpy.data.objects.new('alarm', d); lo.rotation_euler = (math.radians(25), 0, math.radians(-30)); bpy.context.scene.collection.objects.link(lo)
    s = bpy.context.scene
    if os.environ.get('DOCK_CPU'): s.cycles.device = 'CPU'
    bounds = (-40.95, -27.05, 7.35, 17.75)
    w, h, ox, oy = mn._frame(None, bounds)
    bpy.context.view_layer.update()
    pts = {}
    for name in ('c_bell_in', 'c_dome', 'c_core', 'c_face', 'c_hat_crown', 'c_chestplate', 'c_rshoulder'):
        ob = bpy.data.objects[name]
        pts[name] = project(ob.matrix_world @ Vector((0, 0, 0)), ox, oy, mn.PPU)
    tag = 'keyart' if phase == 1 else 'p2room'
    os.makedirs(OUT, exist_ok=True)
    mn._render_to(os.path.join(OUT, f'{tag}_raw.png'), 'beauty')
    json.dump({'w': w, 'h': h, 'ox': ox, 'oy': oy, 'ppu': mn.PPU, 'elev': mn.ELEVATION, 'captain': [cu, cv, face], 'pts': pts,
               'note': 'pixel = (ox + u*ppu, oy - (-v*sin(e) + z*cos(e))*ppu); u, v relative to our port hatch'},
              open(os.path.join(OUT, f'{tag}_raw.json'), 'w'), indent=1)
    print('[concept]', tag, w, h)

def captain_renders():
    mn.PPU = 200
    os.makedirs(OUT, exist_ok=True)
    for phase, view, face in ((1, 'front', 70), (1, 'back', 250), (2, 'front', 70), (2, 'back', 250), ('t', 'bubble', 80)):
            mn.reset(); set_side('port'); M = mats()
            cap = captain(M, 2 if phase == 't' else phase, jets=phase != 1)
            mn.outline(cap, thickness=0.014)
            sh = shield(M, full=phase == 't') if view != 'back' else []
            place(cap + sh, 0, 0, face)
            if os.environ.get('DOCK_CPU'): bpy.context.scene.cycles.device = 'CPU'
            w, h, ox, oy = mn._frame(cap + sh)
            mn._render_to(os.path.join(OUT, f'cap_p{phase}_{view}.png'), 'beauty')
            print('[concept] captain', phase, view, w, h)

if __name__ == '__main__':
    if MODE == 'captain': captain_renders()
    elif MODE == 'p2room': room_render(2)
    else: room_render(1)
