"""Local helpers for the ship-interior models (reactor, floor, walls), on top of mn.py.

Kept here rather than in mn.py so the shared pipeline stays untouched; candidates for mn.py:
pipe(), label(), pmat() (grime + procedural stripes), shadow catcher, render_tile().
"""
import bpy, math, os
from mathutils import Vector
import mn

# ---------------------------------------------------------------------------
# Materials with a bit of procedural wear
# ---------------------------------------------------------------------------
def _rgb(c):
    return (*mn.hex_rgb(mn.PALETTE.get(c, c)), 1)

def pmat(name, color, rough=0.55, metal=0.0, grime=0.0, grime_scale=6.0, emit=None, emit_strength=0.0,
         stripes=None, stripe_k=6.0, scratches=0.0):
    """Principled material; grime darkens the base color in noisy blotches (object space).
    stripes=(colorA, colorB): diagonal hazard stripes (x+z+y in object space, period 1/stripe_k)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    col_out = None
    if stripes:
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        a1 = nt.nodes.new('ShaderNodeMath'); a1.operation = 'ADD'; nt.links.new(sep.outputs[0], a1.inputs[0]); nt.links.new(sep.outputs[2], a1.inputs[1])
        a2 = nt.nodes.new('ShaderNodeMath'); a2.operation = 'ADD'; nt.links.new(a1.outputs[0], a2.inputs[0]); nt.links.new(sep.outputs[1], a2.inputs[1])
        mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = stripe_k; nt.links.new(a2.outputs[0], mu.inputs[0])
        fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(mu.outputs[0], fr.inputs[0])
        st = nt.nodes.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = 0.5; nt.links.new(fr.outputs[0], st.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
        mx.inputs[6].default_value = _rgb(stripes[0]); mx.inputs[7].default_value = _rgb(stripes[1])
        nt.links.new(st.outputs[0], mx.inputs[0]); col_out = mx.outputs[2]
    else:
        rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = _rgb(color); col_out = rgb.outputs[0]
    if grime:
        tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = grime_scale; nz.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[1].position = 0.75
        nt.links.new(nz.outputs['Fac'], ramp.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = grime
        nt.links.new(ramp.outputs[0], mm.inputs[0]); nt.links.new(mm.outputs[0], mx.inputs[0])
        nt.links.new(col_out, mx.inputs[6]); mx.inputs[7].default_value = (0.35, 0.3, 0.26, 1)
        col_out = mx.outputs[2]
        # grimy spots are rougher
        ra = nt.nodes.new('ShaderNodeMath'); ra.operation = 'MULTIPLY_ADD'; ra.inputs[1].default_value = 0.3; ra.inputs[2].default_value = rough
        nt.links.new(mm.outputs[0], ra.inputs[0]); nt.links.new(ra.outputs[0], b.inputs['Roughness'])
    nt.links.new(col_out, b.inputs['Base Color'])
    if emit:
        b.inputs['Emission Color'].default_value = _rgb(emit); b.inputs['Emission Strength'].default_value = emit_strength
    return m

def glow(name, color, strength):
    """Pure emission (screens, the core). Strength is keyframable via node 'Emission'.inputs[1]."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); em.name = 'Emission'
    em.inputs['Color'].default_value = _rgb(color); em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface']); return m

# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
def _fillet(pts, rad, steps=6):
    """Polyline with rounded corners (radius rad) -> dense point list."""
    pts = [Vector(p) for p in pts]
    if len(pts) < 3 or rad <= 0: return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d1 = (a - b); d2 = (c - b); l1, l2 = d1.length, d2.length
        r = min(rad, l1 * 0.45, l2 * 0.45); d1.normalize(); d2.normalize()
        p1 = b + d1 * r; p2 = b + d2 * r
        for k in range(steps + 1):                    # quadratic bezier p1 -> b -> p2
            t = k / steps
            out.append(p1 * (1 - t) ** 2 + b * 2 * t * (1 - t) + p2 * t * t)
    out.append(pts[-1]); return out

def pipe(name, pts, r, m=None, corner=0.25, res=12):
    """A pipe (tube mesh) along a polyline with rounded bends. pts: list of (x, y, z)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = r; cu.bevel_resolution = max(2, res // 4); cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); P = _fillet(pts, corner)
    sp.points.add(len(P) - 1)
    for p, q in zip(sp.points, P): p.co = (q.x, q.y, q.z, 1)
    return _curve_to_mesh(name, cu, m)

def _curve_to_mesh(name, cu, m):
    tmp = bpy.data.objects.new(name + '_tmp', cu); bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    o = mn.link(bpy.data.objects.new(name, me))
    if m: mn.assign(o, m)
    mn.smooth(o); return o

def label(name, text, size, loc, rot=(0, 0, 0), m=None, depth=0.004, bold=True):
    """Flat text (decals, stickers), converted to mesh. loc = centre of the text."""
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = text; cu.size = size; cu.extrude = depth
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = _curve_to_mesh(name, cu, m)
    for p in o.data.polygons: p.use_smooth = False
    o.location = loc; o.rotation_euler = rot; return o

def ring(name, r, w, h, loc=(0, 0, 0), m=None, rot=(0, 0, 0), verts=40):
    """A flat ring (washer), outer radius r, width w, height h, bottom at loc."""
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs_o = [bm.verts.new((r * math.cos(2 * math.pi * i / verts), r * math.sin(2 * math.pi * i / verts), 0)) for i in range(verts)]
    vs_i = [bm.verts.new(((r - w) * math.cos(2 * math.pi * i / verts), (r - w) * math.sin(2 * math.pi * i / verts), 0)) for i in range(verts)]
    for i in range(verts):
        j = (i + 1) % verts; bm.faces.new((vs_o[i], vs_o[j], vs_i[j], vs_i[i]))
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += h
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = mn._obj(name, me); o.location = loc; o.rotation_euler = rot
    mn.bev(o, min(0.01, w * 0.3), 2)
    if m: mn.assign(o, m)
    mn.smooth(o); return o

# ---------------------------------------------------------------------------
# Rendering extras
# ---------------------------------------------------------------------------
_hidden_in_data = []
def shadow_catcher(size, loc=(0, 0, 0)):
    """Invisible ground plane that only receives shadows (semi-transparent dark in the beauty pass).
    Hidden in the data passes (normal/height/mask) by the patched _render_to below."""
    o = mn.box('shadow_catcher', (size[0], size[1], 0.001), loc=(loc[0], loc[1], -0.001), bevel=0)
    o.is_shadow_catcher = True; _hidden_in_data.append(o); return o

_orig_render_to = mn._render_to
def _render_to(path, kind):
    for o in _hidden_in_data: o.hide_render = kind != 'beauty'
    _orig_render_to(path, kind)
    for o in _hidden_in_data: o.hide_render = False
mn._render_to = _render_to

def render_exact(name, x0, x1, y0, y1, passes=('beauty', 'normal', 'height'), extra=None, frames=None, origin=(0, 0, 0)):
    """Render a fixed screen-plane window (units, as mn._screen gives) with no margin: for tiles.
    The canvas is exactly (x1-x0)*PPU x (y1-y0)*PPU pixels, which the caller keeps integer."""
    s = bpy.context.scene
    W = (x1 - x0) * mn.PPU; H = (y1 - y0) * mn.PPU
    w, h = int(round(W)), int(round(H))
    assert abs(W - w) < 1e-3 and abs(H - h) < 1e-3, (W, H)
    saved = mn.MARGIN
    s.render.resolution_x = w; s.render.resolution_y = h; s.render.resolution_percentage = 100
    c = mn._cam(); c.data.ortho_scale = max(w, h) / mn.PPU
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; e = math.radians(mn.ELEVATION)
    up = Vector((0, math.sin(e), math.cos(e))); back = Vector((0, -math.cos(e), math.sin(e)))
    c.location = Vector((cx, 0, 0)) + up * cy + back * 60; c.data.clip_end = 200
    gx, gy = mn._screen(Vector(origin))                 # where the given ground point lands
    ox = (gx - cx) * mn.PPU + w / 2; oy = h / 2 - (gy - cy) * mn.PPU
    base = os.path.join(mn.OUT_DIR, name); os.makedirs(os.path.dirname(base), exist_ok=True)
    frames = frames or [s.frame_current]; files = []
    for i, f in enumerate(frames):
        s.frame_set(f); stem = base + (f'_f{i}' if len(frames) > 1 else '')
        for kind in passes:
            mn._render_to(stem + {'beauty': '.png', 'normal': '.n.png', 'height': '.h.png', 'mask': '.m.png'}[kind], kind)
        files.append(os.path.relpath(stem, mn.OUT_DIR))
    entry = {'w': w, 'h': h, 'ox': round(ox, 2), 'oy': round(oy, 2), 'dirs': 1, 'frames': len(frames), 'files': files}
    if extra: entry.update(extra)
    mn._manifest_put(name, entry)
    print(f'[ship] rendered {name}: {w}x{h}, origin ({ox:.1f}, {oy:.1f})')
    return w, h, ox, oy
