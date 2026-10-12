"""Manifold Novum sprite pipeline: shared Blender helpers.

Every model is a plain Python script that builds its scene with these helpers and renders sprites,
so models stay reviewable text in git (no .blend files). Run one with:

    blender -b --factory-startup --python tools/blender/models/<group>/<name>.py

Conventions (keep them, the game relies on them):
  * 1 Blender unit = 1 game layout unit (the crew is ~0.6 wide, a room ~6-9 across).
  * Game x -> Blender +X, game y (down the screen) -> Blender -Y, height -> Blender +Z.
  * The object's ground origin (0, 0, 0) is the point the game places at its (x, y).
  * Camera: orthographic, tilted top-down, ELEVATION degrees above the horizon, looking towards +Y
    (screen up = game "up"). Not rotated around Z: rooms stay rectangles on screen.
    A world point (x, y_game, z) lands on screen at (x * PPU, (y_game * sin(e) - z * cos(e)) * PPU).
  * PPU pixels per unit (2x the game's 48 px, for crisp HiDPI).
  * Each render writes three images next to each other:
      <name>.png    beauty: lit with the shared neutral light rig (what you see without runtime lights)
      <name>.n.png  world-space normals, rgb = n * 0.5 + 0.5 (x right, y up-screen/away, z up)
      <name>.h.png  height above the ground, grey = z / HEIGHT_RANGE (for runtime light falloff, shadows)
    optionally (passes=(..., 'mask')):
      <name>.m.png  tint mask: white where objects marked with tint(o) are (the parts the game recolours,
                    like a crew member's suit color), black elsewhere
    and an entry in build/renders/manifest.json: size and the pixel where the ground origin lands.
  * Renders go to build/renders/ (not in git). The game loads the packed atlases that
    `python3 tools/sprites/pack.py [group ...]` makes from them in assets/sprites/ (see tools/sprites/README.md).
"""
import bpy, bmesh, json, math, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'build', 'renders')   # raw renders (gitignored); tools/sprites/pack.py packs them into assets/sprites/
MANIFEST = os.path.join(OUT_DIR, 'manifest.json')
ELEVATION = 50.0          # degrees above the horizon
PPU = 96                  # pixels per layout unit
HEIGHT_RANGE = 4.0        # units of height mapped to the full grey range of .h.png
MARGIN = 6                # transparent pixels around each sprite
SAMPLES = 64

# The game's palette (js/art.js) so models match what's on screen today.
PALETTE = {
    'outline': '#14161b', 'hull': '#8a93a5', 'hullDark': '#5a6272', 'floor': '#3f4757', 'wall': '#2b303a',
    'panel': '#4a515e', 'steel': '#c9ced8', 'hazard': '#e8c34f', 'red': '#e2574c', 'green': '#5fd6a0',
    'glow': '#9cd8ff', 'energy': '#ffe08a', 'suit': '#c4683a', 'suitWhite': '#eef0f4', 'visor': '#d2a62e',
    'skin': '#e6c19b', 'hair': '#3a2a21', 'rubber': '#262a33', 'copper': '#b8902e', 'alien': '#5a2a6a',
    'slime': '#9cff5a', 'pirate': '#8a4a44',
}

def hex_rgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)   # sRGB -> linear

# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()                                  # (the old scene's materials are gone)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'OPTIX'; p.get_devices()
        for d in p.devices: d.use = d.type == 'OPTIX'
        s.cycles.device = 'GPU'
    except Exception:
        s.cycles.device = 'CPU'
    s.cycles.samples = SAMPLES; s.cycles.use_denoising = True
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'RGBA'
    s.world = bpy.data.worlds.new('world'); s.world.use_nodes = True
    bg = s.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.18, 0.2, 0.26, 1); bg.inputs[1].default_value = 0.35
    light_rig()
    return s

def light_rig():
    """Key light from the front right (shadows fall up and to the left), soft fill, rim from behind."""
    def sun(name, rot, energy, color=(1, 1, 1), angle=0.2):
        d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = angle
        o = bpy.data.objects.new(name, d); o.rotation_euler = [math.radians(a) for a in rot]
        bpy.context.scene.collection.objects.link(o)
    sun('key', (40, 0, 35), 3.2, (1.0, 0.97, 0.92), 0.25)
    sun('fill', (60, 0, -140), 0.8, (0.75, 0.85, 1.0), 0.8)
    sun('rim', (-55, 0, 180), 1.2, (0.9, 0.95, 1.0), 0.3)

def link(o):
    bpy.context.scene.collection.objects.link(o); return o

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
_mats = {}
def mat(name, color, rough=0.55, metal=0.0, emit=None, emit_strength=0.0, clearcoat=0.0):
    """A Principled material. color: palette key or hex. emit: glow color (palette key or hex)."""
    key = (name, color, rough, metal, emit, emit_strength)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    rgb = hex_rgb(PALETTE.get(color, color))
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if clearcoat: b.inputs['Coat Weight'].default_value = clearcoat
    if emit:
        b.inputs['Emission Color'].default_value = (*hex_rgb(PALETTE.get(emit, emit)), 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    _mats[key] = m
    return m

def assign(o, m):
    o.data.materials.clear(); o.data.materials.append(m); return o

# ---------------------------------------------------------------------------
# Primitives (all return the new object; dimensions in game units)
# ---------------------------------------------------------------------------
def _obj(name, mesh):
    return link(bpy.data.objects.new(name, mesh))

def box(name, size, loc=(0, 0, 0), m=None, bevel=0.03, rot=(0, 0, 0)):
    """Axis box of size (sx, sy, sz) with its bottom centre at loc. Rounded edges via a bevel modifier."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    o = _obj(name, me); o.scale = size; o.location = (loc[0], loc[1], loc[2] + size[2] / 2); o.rotation_euler = rot
    bpy.context.view_layer.update(); _apply_scale(o)
    if bevel: bev(o, bevel)
    if m: assign(o, m)
    smooth(o); return o

def cyl(name, r, h, loc=(0, 0, 0), m=None, verts=32, bevel=0.02, rot=(0, 0, 0)):
    """Cylinder along Z (radius r, height h) with its bottom centre at loc (before rotation)."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2)); bm.to_mesh(me); bm.free()
    o = _obj(name, me); o.location = loc; o.rotation_euler = rot
    if bevel: bev(o, bevel)
    if m: assign(o, m)
    smooth(o); return o

def sphere(name, r, loc=(0, 0, 0), m=None, scale=(1, 1, 1), segs=32):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r); bm.to_mesh(me); bm.free()
    o = _obj(name, me); o.location = loc; o.scale = scale
    if m: assign(o, m)
    smooth(o); return o

def bev(o, w, segs=3):
    md = o.modifiers.new('bevel', 'BEVEL'); md.width = w; md.segments = segs; md.limit_method = 'ANGLE'
    md.harden_normals = True; return o

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True
    return o

def _apply_scale(o):
    me = o.data
    for v in me.vertices: v.co = Vector((v.co.x * o.scale.x, v.co.y * o.scale.y, v.co.z * o.scale.z))
    o.scale = (1, 1, 1)

def group(name, children, loc=(0, 0, 0)):
    """Parent objects under an empty (for rotating a whole model when rendering directions)."""
    e = link(bpy.data.objects.new(name, None)); e.location = loc
    for c in children: c.parent = e
    return e

def outline(objs, thickness=0.012, color='outline'):
    """Inverted-hull outline: the dark contour the game's art has everywhere. Call last."""
    om = bpy.data.materials.get('outline_' + color)
    if not om:                                   # dark where the hull's inside faces us (the silhouette), see-through elsewhere
        om = bpy.data.materials.new('outline_' + color); om.use_nodes = True; nt = om.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); mix = nt.nodes.new('ShaderNodeMixShader')
        dark = nt.nodes.new('ShaderNodeEmission'); dark.inputs['Color'].default_value = (*hex_rgb(PALETTE.get(color, color)), 1)
        clear = nt.nodes.new('ShaderNodeBsdfTransparent'); g = nt.nodes.new('ShaderNodeNewGeometry')
        lp = nt.nodes.new('ShaderNodeLightPath'); inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1
        mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'      # (and invisible to everything but the camera: no shadows)
        nt.links.new(lp.outputs['Is Camera Ray'], inv.inputs[1]); nt.links.new(g.outputs['Backfacing'], mx.inputs[0]); nt.links.new(inv.outputs[0], mx.inputs[1])
        nt.links.new(mx.outputs[0], mix.inputs[0]); nt.links.new(dark.outputs[0], mix.inputs[1])
        nt.links.new(clear.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
    for o in objs:
        if o.type != 'MESH': continue
        if om.name not in [m.name for m in o.data.materials]: o.data.materials.append(om)
        md = o.modifiers.new('outline', 'SOLIDIFY'); md.thickness = thickness; md.offset = 1
        md.use_flip_normals = True; md.material_offset = len(o.data.materials) - 1
    return objs

# ---------------------------------------------------------------------------
# Camera and rendering
# ---------------------------------------------------------------------------
def _cam():
    c = bpy.context.scene.camera
    if c: return c
    d = bpy.data.cameras.new('cam'); d.type = 'ORTHO'
    c = link(bpy.data.objects.new('cam', d))
    c.rotation_euler = (math.radians(90 - ELEVATION), 0, 0)
    bpy.context.scene.camera = c
    return c

def _screen(p):
    """World point -> (right, up) on the sprite plane, in units."""
    e = math.radians(ELEVATION)
    return p.x, p.y * math.sin(e) + p.z * math.cos(e)

def _bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in objs:
        if o.type not in ('MESH', 'CURVE', 'FONT'): continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        for v in me.vertices:
            sx, sy = _screen(ev.matrix_world @ v.co); xs.append(sx); ys.append(sy)
        ev.to_mesh_clear()
    return min(xs), max(xs), min(ys), max(ys)

def _frame(objs, bounds=None):
    """Fit the camera tightly around objs at exactly PPU pixels per unit. Returns (w, h, ox, oy)."""
    s = bpy.context.scene; c = _cam()
    x0, x1, y0, y1 = bounds or _bounds(objs)
    w = int(math.ceil((x1 - x0) * PPU)) + 2 * MARGIN; h = int(math.ceil((y1 - y0) * PPU)) + 2 * MARGIN
    w += w % 2; h += h % 2
    s.render.resolution_x = w; s.render.resolution_y = h; s.render.resolution_percentage = 100
    c.data.ortho_scale = max(w, h) / PPU
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    e = math.radians(ELEVATION)
    # camera sits along its view axis from the screen-plane point (cx, cy); place it far back
    up = Vector((0, math.sin(e), math.cos(e))); back = Vector((0, -math.cos(e), math.sin(e)))
    c.location = Vector((cx, 0, 0)) + up * cy + back * 60
    c.data.clip_end = 200
    ox = (0 - cx) * PPU + w / 2; oy = h / 2 - (0 - cy) * PPU     # where the ground origin lands (pixels)
    return w, h, ox, oy

def _data_override(kind):
    m = bpy.data.materials.get('__' + kind)
    if m: return m
    m = bpy.data.materials.new('__' + kind); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    if kind == 'normal':
        g = nt.nodes.new('ShaderNodeNewGeometry'); vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
        vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs[0], em.inputs['Color'])
    else:
        g = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); mt = nt.nodes.new('ShaderNodeMath')
        mt.operation = 'MULTIPLY'; mt.inputs[1].default_value = 1 / HEIGHT_RANGE; mt.use_clamp = True
        nt.links.new(g.outputs['Position'], sp.inputs[0]); nt.links.new(sp.outputs['Z'], mt.inputs[0]); nt.links.new(mt.outputs[0], em.inputs['Color'])
    return m

def tint(*objs):
    """Mark objects as recolourable at runtime (they show white in the .m.png mask pass)."""
    for o in objs: o['tint'] = 1
    return objs

def _flat(name, rgb):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*rgb, 1)
    nt.links.new(em.outputs[0], out.inputs['Surface']); return m

def _render_to(path, kind):
    s = bpy.context.scene; vl = s.view_layers[0]
    for o in s.objects:                          # data passes: the outline hull isn't geometry
        for md in getattr(o, 'modifiers', []):
            if md.name == 'outline': md.show_render = kind == 'beauty'
    if kind == 'mask':                           # flat white on tinted objects, black elsewhere
        saved = {}
        for o in s.objects:
            if o.type != 'MESH': continue
            saved[o.name] = [sl.material for sl in o.material_slots]
            for sl in o.material_slots: sl.material = _flat('__white' if o.get('tint') else '__black', (1, 1, 1) if o.get('tint') else (0, 0, 0))
        vl.material_override = None; s.view_settings.view_transform = 'Raw'; s.cycles.samples = 4
        s.cycles.use_denoising = False; s.render.image_settings.color_depth = '8'; s.render.filepath = path
        bpy.ops.render.render(write_still=True)
        for o in s.objects:
            if o.name in saved:
                for sl, m in zip(o.material_slots, saved[o.name]): sl.material = m
        return
    if kind == 'beauty':
        vl.material_override = None; s.view_settings.view_transform = 'AgX'; s.cycles.samples = SAMPLES
        s.cycles.use_denoising = True; s.render.image_settings.color_depth = '8'
    else:
        vl.material_override = _data_override(kind); s.view_settings.view_transform = 'Raw'; s.cycles.samples = 4
        s.cycles.use_denoising = False; s.render.image_settings.color_depth = '16' if kind == 'height' else '8'
        s.cycles.filter_width = 0.01
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    s.cycles.filter_width = 1.5

def _manifest_put(name, entry):
    """Add/replace one entry in manifest.json (locked: several renders may run at once)."""
    import fcntl
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(MANIFEST + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = {}
        if os.path.exists(MANIFEST):
            with open(MANIFEST) as f: data = json.load(f)
        data.setdefault('_meta', {})
        data['_meta'].update({'elevation': ELEVATION, 'ppu': PPU, 'heightRange': HEIGHT_RANGE,
                              'files': '<name>.png beauty, .n.png normals (rgb = n*0.5+0.5), .h.png height (z / heightRange), .m.png tint mask'})
        data[name] = entry
        tmp = MANIFEST + '.tmp'
        with open(tmp, 'w') as f: json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, MANIFEST)

def render(name, objs=None, root=None, dirs=1, frames=None, passes=('beauty', 'normal', 'height')):
    """Render a sprite (or a set of them) for every view direction and animation frame.

    name    asset name, may contain a group: 'crew/crew' -> build/renders/crew/crew.png
    objs    objects to frame (default: every mesh in the scene)
    root    object rotated for the view directions (around Z, at its origin); needed when dirs > 1
    dirs    number of facing directions, evenly spaced; dir i faces game angle i * 360 / dirs
            (0 = facing +x/right, then clockwise on screen: 90 = facing down/towards the camera)
    frames  list of animation frames to render (scene frames, e.g. a walk cycle), or None for one
    All directions and frames share one canvas size and origin, so the game can swap them freely.
    """
    s = bpy.context.scene
    objs = objs or [o for o in s.objects if o.type == 'MESH']
    frames = frames or [s.frame_current]
    # common frame: bounds over every direction and frame
    b = None
    for d in range(dirs):
        if root: root.rotation_euler.z = -math.radians(d * 360 / dirs)
        for f in frames:
            s.frame_set(f); bpy.context.view_layer.update()
            x0, x1, y0, y1 = _bounds(objs)
            b = (x0, x1, y0, y1) if not b else (min(b[0], x0), max(b[1], x1), min(b[2], y0), max(b[3], y1))
    w, h, ox, oy = _frame(objs, b)
    base = os.path.join(OUT_DIR, name)
    os.makedirs(os.path.dirname(base), exist_ok=True)
    files = []
    for d in range(dirs):
        if root: root.rotation_euler.z = -math.radians(d * 360 / dirs)
        for i, f in enumerate(frames):
            s.frame_set(f)
            stem = base + (f'_d{d}' if dirs > 1 else '') + (f'_f{i}' if len(frames) > 1 else '')
            for kind in passes:
                _render_to(stem + {'beauty': '.png', 'normal': '.n.png', 'height': '.h.png', 'mask': '.m.png'}[kind], kind)
            files.append(os.path.relpath(stem, OUT_DIR))
    if root: root.rotation_euler.z = 0
    _manifest_put(name, {'w': w, 'h': h, 'ox': round(ox, 2), 'oy': round(oy, 2), 'dirs': dirs, 'frames': len(frames), 'files': files})
    print(f'[mn] rendered {name}: {w}x{h}, origin ({ox:.1f}, {oy:.1f}), {dirs} dirs x {len(frames)} frames')
    return w, h, ox, oy
