"""Small non-organic things out in space (js/eva.js): the mine drone, limpet mines, the debris that jams a cannon
track, and the fuel canister drifting past. All origins = the object's (x, y) in the game, z = 0 its base/middle.

Sprites (assets/sprites/enemy/):
  limpet_mine_<on|off>         limpet mine stuck beside the hull (evs.mines; game: 14 px body, 8 spikes to 20 px,
                               hazard band, red lamp). on = the blink's lit half (Math.sin(t * rate) > 0), with its
                               red glow in the beauty pass. Countdown text, job marker: procedural.
  mine_drone_<carry|empty>_<on|off>_f<i>
                               the drone (evs.drones): quad rotors (3-frame spin loop), red-brown body, blinking red
                               light (on = Math.sin(t * 8) > 0); carry = a limpet mine slung underneath (d.left > 0
                               and not d.leaving), empty = flying off. Hit radius 0.8.
  debris_jam                   a bent girder and plating wedged in a cannon track (evs.jams, at JAM_SPOTS)
  fuel_canister_d<i>           the drifting fuel cell (evs.canister), 24 turn steps: i = round(c.t * 0.9 / 15 deg)
                               mod 24 (the game spins it with ctx.rotate(c.t * 0.9)); pickup halo stays procedural

    blender -b --factory-startup --python tools/blender/models/enemy/hazards.py [-- draft] [-- mine|drone|debris|canister]
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enemylib as el
from enemylib import P, prism, lbox, mn, ic, bpy, bmesh, Vector

ARGS = el.ARGS
WHAT = [w for w in ('mine', 'drone', 'debris', 'canister') if w in ARGS] or ['mine', 'drone', 'debris', 'canister']
PX = 1 / 48                                       # the game's art is drawn in px at 48 px per unit

def mats():
    M = el.standard_mats()
    M.update(
        minebody=el.worn('minebody', '#4a515e', 0.4, 0.5, wear=0.6), spike=el.worn('spike', '#6a7280', 0.35, 0.7, wear=0.5),
        lamp_on=el.emit_mat('lamp_on', '#ff2a1a', 2.5, base='#ff4a3a'), lamp_off=mn.mat('lamp_off', '#5a1a14', 0.3, 0.0, clearcoat=1.0),
        redglow=el.halo_mat('redglow', '#ff4632', 1.2),
        drone=el.worn('drone', '#8a3a2a', 0.45, 0.2, wear=0.8), drone2=el.worn('drone2', '#4a2018', 0.5, 0.2),
        blur=blur_mat(), rock=el.worn('debris_rock', '#6e6359', 0.85, 0.0, wear=0.3, grime=1.2), girder=el.worn('girder', '#8a8f99', 0.4, 0.7, wear=0.8),
        plate=el.worn('plating', '#5a6272', 0.5, 0.4, wear=1.0, grime=1.2),
        fuel=fuel_mat(), fuelcore=el.emit_mat('fuel_core', '#c8ffd8', 2.0, base='#b8ffd0'),
        cap=el.worn('cap', '#c9ced8', 0.3, 0.8, wear=0.3),
    )
    return M

def fuel_mat():
    """The fuel cell's glowing green body: glassy, brighter in the middle like the icon's gradient."""
    m = bpy.data.materials.new('fuel'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = (*mn.hex_rgb('#3a9a5a'), 1)
    b.inputs['Roughness'].default_value = 0.12; b.inputs['Coat Weight'].default_value = 1.0
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(lw.outputs['Facing'], col.inputs[0])
    col.inputs[6].default_value = (*mn.hex_rgb('#7aff9a'), 1); col.inputs[7].default_value = (*mn.hex_rgb('#1a7a3a'), 1)
    Lk(col.outputs[2], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.7
    return m

def blur_mat():
    """Rotor blur: see-through grey disc, denser towards the rim."""
    m = bpy.data.materials.new('rotor_blur'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.clear(); Lk = nt.links.new
    out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent')
    d = N.new('ShaderNodeBsdfPrincipled'); d.inputs['Base Color'].default_value = (0.75, 0.78, 0.82, 1); d.inputs['Roughness'].default_value = 0.4
    tc = N.new('ShaderNodeTexCoord'); gr = N.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'; Lk(tc.outputs['Object'], gr.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.25
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = 0.45; Lk(gr.outputs['Fac'], mr.inputs['Value'])
    Lk(mr.outputs[0], mix.inputs[0]); Lk(tr.outputs[0], mix.inputs[1]); Lk(d.outputs[0], mix.inputs[2]); Lk(mix.outputs[0], out.inputs['Surface'])
    return m

# ---------------------------------------------------------------------------------------------------------
def build_mine(M, s=1.0, z0=0.0, name='mine'):
    """Limpet mine: squat armored dome on a magnet ring, 8 spikes, a hazard band and a red lamp on top."""
    parts = []
    R = 14 * PX * s
    parts.append(mn.cyl(f'{name}_magnet', R * 1.02, 0.06 * s, loc=(0, 0, z0), m=M['dark'], bevel=0.015, verts=32))
    dome = mn.sphere(f'{name}_dome', 1.0, loc=(0, 0, z0 + 0.05 * s), m=M['minebody'], scale=(R, R, R * 0.62), segs=32)
    parts.append(dome)
    parts.append(mn.cyl(f'{name}_band', R * 0.97, 0.05 * s, loc=(0, 0, z0 + 0.06 * s), m=M['stripes'], bevel=0.0, verts=32))
    for i in range(8):                               # spikes (game: from r 13 to 20 px)
        a = i / 8 * math.tau + math.pi / 8
        sp = mn.cyl(f'{name}_spike', 0.045 * s, (20 - 11) * PX * s, loc=(0, 0, 0), m=M['spike'], verts=10, bevel=0.0)
        for v in sp.data.vertices:
            k = v.co.z / ((20 - 11) * PX * s); v.co.x *= (1 - 0.85 * k); v.co.y *= (1 - 0.85 * k)
        sp.rotation_euler = (0, math.radians(90), a); sp.location = (math.cos(a) * 11 * PX * s, math.sin(a) * 11 * PX * s, z0 + 0.1 * s)
        bpy.context.view_layer.update(); el.apply_tf(sp); parts.append(sp)
        parts.append(mn.sphere(f'{name}_bolt', 0.02 * s, loc=(math.cos(a) * R * 0.78, -math.sin(a) * R * 0.78, z0 + 0.1 * s + R * 0.62 * 0.62), m=M['steel'], segs=8))
    parts.append(mn.cyl(f'{name}_lampring', 0.12 * s, 0.03 * s, loc=(0, 0, z0 + 0.05 * s + R * 0.6), m=M['steel'], bevel=0.008, verts=24))
    on = mn.sphere(f'{name}_lamp_on', 0.1 * s, loc=(0, 0, z0 + 0.06 * s + R * 0.62), m=M['lamp_on'], scale=(1, 1, 0.7), segs=20)
    off = mn.sphere(f'{name}_lamp_off', 0.1 * s, loc=(0, 0, z0 + 0.06 * s + R * 0.62), m=M['lamp_off'], scale=(1, 1, 0.7), segs=20)
    mn.outline([p for p in parts if 'bolt' not in p.name and 'band' not in p.name] + [on, off], thickness=0.012)
    return parts, on, off

def render_mine(M):
    parts, on, off = build_mine(M)
    glow = el.disc('mine_glow', 0, 0, 0.0, 26 * PX * 1.3, M['redglow'])
    glow.location = (0, 0, -0.01)
    def st(state):
        def setup(kind):
            on.hide_render = state != 'on'; off.hide_render = state != 'off'
            glow.hide_render = not (state == 'on' and kind in (None, 'beauty'))
        return setup
    el.render_states('enemy/limpet_mine', [('_on', st('on')), ('_off', st('off'))], lambda: parts + [on, off, glow])
    el.delete(parts + [on, off, glow])

def render_drone(M):
    body = []
    B = 0.2
    body.append(lbox('drone_body', -B, -B, B, B, 0.0, 0.16, M['drone'], bevel=0.04))
    body.append(lbox('drone_top', -B * 0.7, -B * 0.7, B * 0.7, B * 0.7, 0.16, 0.2, M['drone2'], bevel=0.02))
    body.append(lbox('drone_haz', -B * 0.95, B * 0.55, B * 0.95, B * 0.8, 0.12, 0.165, M['stripes'], bevel=0.0))
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        a = math.atan2(-sy, sx)
        arm = lbox('drone_arm', 0, -0.035, 0.42, 0.035, 0.07, 0.13, M['gun'], bevel=0.015)
        for v in arm.data.vertices:
            x, y = v.co.x, v.co.y; v.co.x = x * math.cos(a) - y * math.sin(a); v.co.y = x * math.sin(a) + y * math.cos(a)
        body.append(arm)
        cx, cy = sx * 0.3, sy * 0.3
        body.append(mn.cyl('motor', 0.065, 0.12, loc=P(cx, cy, 0.06), m=M['gun'], bevel=0.015, verts=16))
        body.append(mn.sphere('hub', 0.03, loc=P(cx, cy, 0.19), m=M['steel'], segs=10))
    body.append(mn.cyl('cam', 0.05, 0.06, loc=P(0.0, B * 0.95, 0.05), m=M['dark'], bevel=0.01, verts=12, rot=(math.radians(-90), 0, 0)))
    on = mn.sphere('dlamp_on', 3 * PX * 1.4, loc=(0, 0, 0.2), m=M['lamp_on'], scale=(1, 1, 0.6), segs=16)
    off = mn.sphere('dlamp_off', 3 * PX * 1.4, loc=(0, 0, 0.2), m=M['lamp_off'], scale=(1, 1, 0.6), segs=16)
    mn.outline([o for o in body if not o.name.startswith(('drone_haz', 'hub'))] + [on, off], thickness=0.012)
    # rotor discs + 2 blades each, 3 spin frames
    rotors = []
    for f in range(3):
        fr = []
        for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            cx, cy = sx * 0.3, sy * 0.3
            d = el.disc('rotor_blur', cx, cy, 0.19, 0.2, M['blur'])
            fr.append(d)
            ang = f / 3 * math.pi + (0.4 if sx * sy > 0 else 0.0)
            for k in range(2):
                bl = lbox('blade', -0.19, -0.018, 0.19, 0.018, 0.185, 0.195, M['dark'], bevel=0.0)
                bl.location = P(cx, cy, 0); bl.rotation_euler = (0, 0, ang + k * math.pi / 2); fr.append(bl)
        rotors.append(fr)
    mine, mon, moff = build_mine(M, s=0.75, z0=-0.2, name='slung')
    mon.hide_render = True; moff.hide_render = False
    cable = [el.tube_nc('sling', [(x * 0.12, y * 0.12, 0.0), (x * 0.18, y * 0.18, -0.08)], 0.008, M['dark']) for x, y in ((1, 1), (-1, 1), (1, -1), (-1, -1))]
    glow = el.disc('drone_glow', 0, 0, 0, 0.22, M['redglow']); glow.location = (0, 0, 0.215)
    allr = [o for fr in rotors for o in fr]
    states = []
    for carry in ('carry', 'empty'):
        for lamp in ('on', 'off'):
            def st(f, carry=carry, lamp=lamp):
                def setup(kind):
                    for i, fr in enumerate(rotors): el.show(fr, i == f)
                    el.show(mine + [moff] + cable, carry == 'carry')
                    on.hide_render = lamp != 'on'; off.hide_render = lamp != 'off'
                    glow.hide_render = not (lamp == 'on' and kind in (None, 'beauty'))
                return setup
            states += [(f'_{carry}_{lamp}_f{f}', st(f)) for f in range(3)]
    el.render_states('enemy/mine_drone', states, lambda: body + allr + mine + [moff] + cable + [on, glow], frames=3)
    el.delete(body + allr + mine + [mon, moff] + cable + [on, off, glow])

def render_debris(M):
    parts = []
    # the game's chunk: poly (-10,-4) (-2,-11) (9,-6) (11,5) (0,9) (-9,6) px, plus a steel bar (-6,0) -> (12,-9)
    chunk = [(-10, -4), (-2, -11), (9, -6), (11, 5), (0, 9), (-9, 6)]
    o = prism('debris_chunk', [(x * PX, y * PX) for x, y in chunk], -0.05, 0.13, M['rock'], inset=0.04, chamfer=0.05, bevel=0.02)
    rnd = random.Random(5)
    for v in o.data.vertices: v.co += Vector((rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), rnd.uniform(-0.03, 0.03)))
    parts.append(o)
    # a buckled piece of hull plating with rivets, jammed in at an angle
    pl = lbox('debris_plate', -0.2, -0.05, 0.12, 0.2, 0.0, 0.025, M['plate'], bevel=0.008)
    pl.rotation_euler = (0.35, -0.25, 0.4); pl.location = P(-0.04, 0.03, 0.08); parts.append(pl)
    # the bent girder (an I-beam section) sticking out
    a, b = Vector((-6 * PX, 0)), Vector((12 * PX, -9 * PX))
    for k, (w, h, z) in enumerate(((0.07, 0.016, 0.16), (0.07, 0.016, 0.24), (0.018, 0.08, 0.2))):
        g = lbox('girder', 0, -w / 2, (b - a).length + 0.06, w / 2, z - h / 2, z + h / 2, M['girder'], bevel=0.004)
        ang = math.atan2(b.y - a.y, b.x - a.x)
        g.rotation_euler = (0.25, 0, -ang); g.location = P(a.x, a.y, 0); parts.append(g)
    parts.append(mn.sphere('spark_scorch', 0.06, loc=P(0.1, 0.1, 0.14), m=M['char'], scale=(1, 1, 0.3), segs=10))
    mn.outline([p for p in parts if not p.name.startswith('spark')], thickness=0.012)
    el.render_states('enemy/debris_jam', [('', lambda kind: None)], lambda: parts)
    el.delete(parts)

def render_canister(M, dirs):
    parts = []
    L, R = 24 * PX * 1.3, 6 * PX * 1.3                 # icon: 12 x 24 px at scale 1.3, cap at the top (-y)
    def ycyl(name, r, y0, y1, m, verts=24, bevel=0.01, r1=None):
        return el.ycyl(name, r, y0, y1, 0, 0.0, m, verts=verts, bevel=bevel, r1=r1)
    parts.append(ycyl('fuel', R * 0.9, -L / 2 + 0.05, L / 2 - 0.05, M['fuel'], bevel=0.02))
    parts.append(ycyl('fuel_core', R * 0.5, -L / 2 + 0.06, L / 2 - 0.06, M['fuelcore'], bevel=0.0))
    for o in parts[-1:]:                              # the bright core shows through the top as a glowing stripe
        for v in o.data.vertices: v.co.z += R * 0.45
    parts.append(ycyl('end_bottom', R, L / 2 - 0.07, L / 2, M['cap'], verts=8, bevel=0.012))
    parts.append(ycyl('end_top', R, -L / 2 + 0.0, -L / 2 + 0.07, M['cap'], verts=8, bevel=0.012))
    parts.append(ycyl('cap', R * 0.62, -L / 2 - 0.06, -L / 2 + 0.01, M['cap'], verts=16, bevel=0.012))   # the steel cap (game: 8 x 3 px)
    for y in (-0.1, 0.1):
        parts.append(ycyl('rib', R * 1.0, y - 0.015, y + 0.015, M['gun'], verts=16, bevel=0.004))
    parts.append(ycyl('label', R * 0.95, -0.05, 0.05, M['stripes'], verts=24, bevel=0.0))
    mn.outline([p for p in parts if p.name not in ('fuel', 'fuel_core', 'label') and not p.name.startswith('rib')], thickness=0.012)
    root = mn.group('canister', parts)
    mn.render('enemy/fuel_canister', objs=parts, root=root, dirs=dirs)
    el.delete(parts + [root])

if __name__ == '__main__':
    T = time.time()
    mn.reset(); mn._mats.clear(); el.side('port')
    M = mats()
    if 'mine' in WHAT: render_mine(M)
    if 'drone' in WHAT: render_drone(M)
    if 'debris' in WHAT: render_debris(M)
    if 'canister' in WHAT: render_canister(M, 8 if 'draft' in ARGS else 24)
    print(f'[hazards] total {time.time() - T:.1f}s')
