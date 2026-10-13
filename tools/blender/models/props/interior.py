"""The lived-in furniture (js/interior.js; footprints FURNITURE / TREADMILL in js/ship.js).

Origins: each piece of furniture is rendered with its origin at the centre of its FURNITURE rect on the
floor (footprint exactly the rect, so the solid area doesn't change). Wall signs (plaques) are vertical
plates facing the camera with their origin at the plaque's centre (the walls decide how high they hang).

Kitchen appliances are 'top-loading' (the microwave, the chest fridge): the game draws them from above,
so their windows, displays and notes are on top, where the tilted camera sees them best.

    blender -b --factory-startup --python tools/blender/models/props/interior.py [-- quick] [-- only=a,b]
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propslib
from mathutils import Vector
from propslib import *
import clutter
from clutter import tape_mat, tape_strip, mug, pizza_model, U, INK
propslib.JOBS.clear()                       # (only this file's jobs)

def frect(x0, y0, x1, y1): return dict(x=x0, y=y0, w=x1 - x0, h=y1 - y0, cx=(x0 + x1) / 2, cy=(y0 + y1) / 2)
FURN = dict(counter=frect(6.2, 10.7, 11.0, 11.5), fridge=frect(11.2, 10.3, 12.4, 11.5), table=frect(9.05, 7.75, 10.15, 8.85),
            bunks=frect(36.9, 2.6, 39.7, 4.9), lockers=frect(40.1, 2.6, 41.5, 3.4), couch=frect(29.1, 3.3, 30.2, 5.5),
            stall=frect(11.3, 15.0, 11.95, 17.0), toilet=frect(12.5, 15.0, 13.3, 16.0), tread=frect(39.3, 20.9, 40.3, 22.0))
BELT = frect(39.51, 21.15, 40.09, 22.0)

def L(name, gx, gy):
    """Game coords -> local (x, y_game) relative to a furniture origin."""
    f = FURN[name]; return gx - f['cx'], gy - f['cy']

def steelm(name='steel'): return worn(name, '#a3abb8', 0.32, 0.8, grime=0.4, scratch=0.3, gain=1.25)

# ---------------------------------------------------------------------------
# Kitchen
# ---------------------------------------------------------------------------
@job('kitchen_counter')
def counter_job():
    k = Kit(); f = FURN['counter']; w, h, H = f['w'], f['h'], 0.8
    top = worn('ctop', '#a3abb8', 0.4, 0.5, grime=0.8, scratch=0.6, gain=1.3)
    cab = worn('cab', '#6a7384', 0.5, 0.3, grime=1.0, scratch=0.5, gain=1.35)
    # the sink is set into the counter: one cutter punches the hole through the top, the rim and the cabinet
    sx = L('counter', 6.85, 0)[0]; HX, HY0, HY1, D = 0.8, -0.24, 0.31, 0.32     # hole: x width, Blender y range, depth
    hy = (HY0 + HY1) / 2; HD = HY1 - HY0
    cut = mn.box('sinkcut', (HX, HD, 0.5), loc=(sx, hy, H - D - 0.05), bevel=0); cut.hide_render = True; cut.display_type = 'WIRE'
    def holed(o, w_=0.02):
        bo = o.modifiers.new('hole', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cut
        if w_: mn.bev(o, w_)
        return o
    k(holed(mn.box('cab', (w - 0.04, h - 0.06, H - 0.06), loc=(0, 0, 0), m=cab, bevel=0), 0.025))
    k(mn.box('kick', (w - 0.1, h - 0.1, 0.08), loc=(0, 0.02, 0), m=plain('kick', '#262a33', 0.6)))
    k(holed(mn.box('top', (w, h, 0.06), loc=(0, 0, H - 0.06), m=top, bevel=0), 0.02))
    k(mn.box('splash', (w - 0.04, 0.05, 0.1), loc=(0, -(h / 2 - 0.05), H), m=worn('splash', '#7d8593', 0.45, 0.4, gain=1.3), bevel=0.012))
    for i in range(6):                                      # cupboard doors on the face we see
        x = -w / 2 + 0.06 + (i + 0.5) * (w - 0.12) / 6
        k(mn.box('door', ((w - 0.12) / 6 - 0.05, 0.02, H - 0.24), loc=(x, -h / 2 + 0.02, 0.11), m=cab, bevel=0.012))
        k(mn.box('knob', (0.1, 0.03, 0.025), loc=(x + (0.13 if i % 2 else -0.13), -h / 2 - 0.0, H - 0.22), m=steelm('knob')), outline=False)
    k(mn.box('dtape', (0.09, 0.012, 0.3), loc=(-w / 2 + 0.06 + 1.0 * (w - 0.12) / 6, -h / 2 + 0.005, 0.3), m=tape_mat(), bevel=0.002, rot=(0, 0.15, 0)), outline=False)   # (a door that won't stay shut)
    Z = H
    # steel flange around the hole
    k(holed(mn.box('sinkrim', (HX + 0.1, HD + 0.08, 0.016), loc=(sx, hy, Z), m=steelm('srim'), bevel=0), 0.008))
    # the basin: sloped walls down to a floor D below the top (the back wall and the side slopes face the camera)
    FX, FY0, FY1, Zf = HX - 0.12, HY0 + 0.05, HY1 - 0.06, Z - D
    me = bpy.data.meshes.new('basin'); bm = bmesh.new()
    tv = [bm.verts.new(c) for c in ((sx - HX / 2, HY0, Z + 0.004), (sx + HX / 2, HY0, Z + 0.004), (sx + HX / 2, HY1, Z + 0.004), (sx - HX / 2, HY1, Z + 0.004))]
    fv = [bm.verts.new(c) for c in ((sx - FX / 2, FY0, Zf), (sx + FX / 2, FY0, Zf), (sx + FX / 2, FY1, Zf), (sx - FX / 2, FY1, Zf))]
    for i in range(4):
        j = (i + 1) % 4; bm.faces.new((tv[i], tv[j], fv[j], fv[i]))
    bm.faces.new(fv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:                                       # normals into the basin (up / inwards)
        c = f.calc_center_median()
        if f.normal.dot(Vector((sx, hy, Z + 0.2)) - c) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    basin = k(mn._obj('basin', me), outline=False)
    mn.assign(basin, worn('basin', '#8a93a3', 0.3, 0.75, grime=1.4, scratch=0.25, gain=1.05))
    sd = basin.modifiers.new('wall', 'SOLIDIFY'); sd.thickness = 0.015; sd.offset = -1
    mn.bev(basin, 0.035, 4); mn.smooth(basin)
    # drain (towards the back, where the camera sees the floor) with a puddle and a crust of old food
    dx_, dy_ = sx - 0.075, 0.21
    k(mn.cyl('puddle', 0.15, 0.002, loc=(dx_ - 0.03, dy_ - 0.01, Zf), m=plain('puddle', '#7d93a8', 0.04, coat=1.0, gain=1.0), bevel=0, verts=40), outline=False)
    k(ring('drainring', 0.065, 0.02, 0.008, loc=(dx_, dy_, Zf), m=steelm('drainr')), outline=False)
    k(mn.cyl('drainhole', 0.047, 0.004, loc=(dx_, dy_, Zf), m=plain('drainh', '#101216', 0.6), bevel=0), outline=False)
    for r_ in (0, 1):
        k(mn.box('drainbar', (0.09, 0.008, 0.006), loc=(dx_, dy_, Zf + 0.002), m=steelm('drainb'), bevel=0, rot=(0, 0, r_ * math.pi / 2 + 0.3)), outline=False)
    k(mn.sphere('gunk', 0.02, loc=(dx_ - 0.09, dy_ + 0.03, Zf + 0.004), m=plain('gunk', '#7a8a3a', 0.4, coat=0.4), scale=(1.4, 1, 0.4), segs=10), outline=False)
    # dirty dishes, sunk in: a stack on the floor, one plate leaning on the back wall with its top above the rim
    plate = plain('plate', '#e8e4dc', 0.3, coat=0.5, gain=1.1); smear = plain('smear', '#a06e3c', 0.6)
    px_, py_ = sx - 0.16, 0.0
    for i in range(4):
        p = k(mn.cyl('dish', 0.14 - i * 0.004, 0.018, loc=(px_ + i * 0.006, py_ - i * 0.004, Zf + 0.004 + i * 0.022), m=plate, bevel=0.007, verts=40))
        p.rotation_euler = (0.04 * (i % 2), -0.05, 0)
    k(ring('food', 0.08, 0.025, 0.004, loc=(px_ + 0.018, py_ - 0.012, Zf + 0.094), m=smear), outline=False)
    lean = mn.link(bpy.data.objects.new('lean', None)); lean.location = (sx - 0.25, HY1 - 0.14, Zf + 0.06); lean.rotation_euler = (math.radians(66), 0, 0.0); k.parts.append(lean)
    for o in (k(mn.cyl('dishL', 0.15, 0.018, loc=(0, 0.15, 0), m=plate, bevel=0.007, verts=40)),
              k(ring('foodL', 0.1, 0.03, 0.004, loc=(0.02, 0.13, 0.018), m=smear), outline=False),
              k(mn.sphere('peaL', 0.012, loc=(-0.05, 0.18, 0.022), m=plain('pea', '#6aa04a', 0.5), segs=8), outline=False)):
        o.parent = lean
    # a frying pan on its side with the handle sticking up over the right edge
    pan = mn.link(bpy.data.objects.new('pan', None)); pan.location = (sx + 0.17, 0.03, Zf + 0.14); pan.rotation_euler = (0.12, math.radians(-50), 0.15); k.parts.append(pan)
    panm = plain('pan', '#2b303a', 0.35, coat=0.3)
    for o in (k(mn.cyl('panb', 0.15, 0.05, loc=(0, 0, 0), m=panm, bevel=0.015, verts=40)),
              k(mn.cyl('panin', 0.13, 0.004, loc=(0, 0, 0.05), m=plain('panin', '#3e3528', 0.4), bevel=0), outline=False),
              k(mn.box('panh', (0.36, 0.045, 0.03), loc=(0.32, 0, 0.025), m=plain('panhm', '#14161b', 0.5), bevel=0.012))):
        o.parent = pan
    # tall gooseneck faucet on the counter's edge, two taps
    fy = 0.36
    k(mn.cyl('fbase', 0.05, 0.04, loc=(sx, -fy, Z), m=steelm('fbase'), bevel=0.012))
    k(tube('tap', [(sx, fy, Z), (sx, fy, Z + 0.42), (sx, fy - 0.2, Z + 0.46), (sx, fy - 0.26, Z + 0.32)], 0.024, steelm('tap'), corner=0.09))
    k(mn.cyl('nozzle', 0.03, 0.04, loc=(sx, -(fy - 0.26), Z + 0.29), m=steelm('noz'), bevel=0.01))
    for tx_, col in ((-0.14, '#e2574c'), (0.14, '#2e7dc9')):
        k(mn.cyl('tapstem', 0.022, 0.06, loc=(sx + tx_, -fy, Z), m=steelm('tstem'), bevel=0.006))
        k(mn.box('taph', (0.1, 0.03, 0.025), loc=(sx + tx_, -fy, Z + 0.06), m=steelm('taph'), bevel=0.01, rot=(0, 0, 0.5 if tx_ < 0 else -0.5)))
        k(mn.cyl('tapdot', 0.014, 0.005, loc=(sx + tx_, -fy, Z + 0.085), m=plain('tdot' + col, col, 0.4), bevel=0), outline=False)
    # stove: two rings, the right one glowing on low, a pot of mystery stew on the left
    kx = L('counter', 8.3, 0)[0]
    k(mn.box('hob', (1.1, 0.56, 0.03), loc=(kx, 0.04, Z), m=plain('hob', '#2b303a', 0.3, coat=0.5)))
    k(ring('ringR', 0.17, 0.03, 0.012, loc=(kx + 0.25, 0.04, Z + 0.03), m=glow('hot', '#ff7832', 0.9)), outline=False)
    k(ring('ringR2', 0.1, 0.025, 0.012, loc=(kx + 0.25, 0.04, Z + 0.03), m=glow('hot2', '#ff6a2a', 0.6)), outline=False)
    k(ring('ringL', 0.2, 0.03, 0.01, loc=(kx - 0.25, 0.04, Z + 0.03), m=plain('ringoff', '#4a4f5a', 0.4)), outline=False)
    for i in range(4):
        k(mn.cyl('knob', 0.03, 0.03, loc=(kx - 0.36 + i * 0.24, -0.04 + 0.27, Z + 0.03), m=plain('hknob', '#c9ced8', 0.4)), outline=False)
    k(mn.cyl('pot', 0.2, 0.2, loc=(kx - 0.25, 0.04, Z + 0.03), m=steelm('pot'), bevel=0.02))
    k(ring('potrim', 0.205, 0.02, 0.02, loc=(kx - 0.25, 0.04, Z + 0.21), m=steelm('potrim')))
    k(mn.cyl('stew', 0.17, 0.01, loc=(kx - 0.25, 0.04, Z + 0.19), m=plain('stew', '#9b6a3a', 0.3, coat=0.6)), outline=False)
    for i, (bx, by) in enumerate(((-0.05, 0.03), (0.06, -0.05), (0.02, 0.07))):
        k(mn.sphere('chunk', 0.025, loc=(kx - 0.25 + bx, 0.04 + by, Z + 0.2), m=plain('chunk', '#c98a4a' if i % 2 else '#6aa04a', 0.5), segs=8), outline=False)
    k(mn.box('pothandle', (0.22, 0.05, 0.035), loc=(kx - 0.25 + 0.3, 0.04, Z + 0.17), m=plain('ph', '#3a3f4a', 0.5), bevel=0.012))
    # cutting board with cheese and lettuce, hot sauce, a mug
    cb = mn.link(bpy.data.objects.new('cb', None)); cb.location = (L('counter', 9.35, 0)[0], 0.04, Z); cb.rotation_euler.z = -0.12; k.parts.append(cb)
    for o in (k(mn.box('board', (0.6, 0.4, 0.035), m=plain('board', '#b8874f', 0.6), bevel=0.012)),
              k(mn.box('cheese', (9 * U * 1.3, 6 * U * 1.3, 0.08), loc=(-1.5 * U, 0, 0.035), m=plain('cheese', '#e8c34f', 0.5), bevel=0.012)),
              k(mn.sphere('lettuce', 1, loc=(7 * U, 3 * U, 0.06), m=plain('lettuce', '#5fa84a', 0.5), scale=(0.07, 0.05, 0.035), segs=12)),
              k(mn.box('knife', (0.22, 0.03, 0.01), loc=(0.1, -0.13, 0.035), m=steelm('knife'), bevel=0.003))):
        o.parent = cb
    hx = L('counter', 9.85, 0)[0]; ky = 0.04
    k(mn.cyl('sauce', 4.5 * U * 1.1, 0.2, loc=(hx, ky + 6 * U, Z), m=plain('sauce', '#c0392b', 0.25, coat=0.6), bevel=0.02))
    k(mn.cyl('sneck', 0.035, 0.06, loc=(hx, ky + 6 * U, Z + 0.2), m=plain('sauce', '#c0392b', 0.25, coat=0.6), bevel=0.01))
    k(mn.cyl('scap', 0.04, 0.04, loc=(hx, ky + 6 * U, Z + 0.26), m=plain('scap', '#2e7a3a', 0.4), bevel=0.01))
    k(mn.box('slabel', (0.1, 0.01, 0.07), loc=(hx, ky + 6 * U - 0.105, Z + 0.06), m=plain('slab', '#f2efe6', 0.6)), outline=False)
    mug(k, True, hx, -ky + 8 * U, Z, cup='#2e7dc9', r=5.5 * U * 1.2, hgt=0.15)
    # microwave (top-loading, forever 12:00)
    mx = L('counter', 10.5, 0)[0]; my = 0.04 + 0.03
    k(mn.box('mw', (0.8, 0.54, 0.38), loc=(mx, my, Z), m=worn('mw', '#d9dde3', 0.4, 0.1, grime=0.7, scratch=0.3, gain=1.1), bevel=0.04))
    k(mn.box('mwwin', (0.42, 0.36, 0.01), loc=(mx - 0.11, my, Z + 0.38), m=plain('mwwin', '#2b3340', 0.1, coat=1.0)), outline=False)
    k(mn.box('mwlight', (0.3, 0.24, 0.005), loc=(mx - 0.11, my, Z + 0.381), m=plain('mwglass', '#3a4658', 0.05, coat=1.0)), outline=False)
    k(mn.box('mwpanel', (0.24, 0.42, 0.012), loc=(mx + 0.24, my, Z + 0.38), m=plain('mwpanel', '#262a33', 0.4)), outline=False)
    k(text('mwclock', '12:00', 0.075, (mx + 0.24, my + 0.1, Z + 0.394), glow('lcd', '#47e07a', 1.1)), outline=False)
    for i in range(3):
        k(mn.cyl('mwbtn', 0.022, 0.012, loc=(mx + 0.2 + (i % 2) * 0.08, my - 0.04 - (i // 2) * 0.08, Z + 0.39), m=plain('mwb', '#8a8f99', 0.4)), outline=False)
    k(mn.box('mwhandle', (0.05, 0.3, 0.03), loc=(mx - 0.36, my, Z + 0.38), m=steelm('mwh'), bevel=0.012))
    k.outline(0.013); place(k, 'kitchen_counter')

@job('fridge')
def fridge_job():
    k = Kit(); f = FURN['fridge']; w, h, H = f['w'], f['h'], 0.95
    enamel = worn('enamel', '#e4e7ec', 0.35, 0.05, grime=0.9, scratch=0.3, gain=1.05, coat=0.3)
    k(mn.box('body', (w, h, H - 0.08), m=enamel, bevel=0.06))
    lid = k(mn.box('lid', (w + 0.02, h + 0.02, 0.1), loc=(0, 0, H - 0.1), m=enamel, bevel=0.04))
    k(mn.box('seal', (w - 0.02, h - 0.02, 0.03), loc=(0, 0, H - 0.12), m=plain('seal', '#3a3f4a', 0.6)), outline=False)
    k(mn.box('edge', (w - 0.08, 0.1, 0.02), loc=(0, h / 2 - 0.1, H), m=plain('edge', '#b9bfc9', 0.4, gain=1.1), bevel=0.008))
    k(mn.box('handle', (w * 0.3, 0.06, 0.06), loc=(w * (0.75 - 0.5), h / 2 - 0.08, H + 0.01), m=plain('fh', '#6b7486', 0.4), bevel=0.02))
    k(mn.box('vent', (w - 0.3, 0.02, 0.1), loc=(0, -h / 2 - 0.0, 0.1), m=plain('fvent', '#3a3f4a', 0.6), bevel=0.01))
    for i in range(4):
        k(mn.box('slat', (w - 0.34, 0.025, 0.012), loc=(0, -h / 2 - 0.01, 0.115 + i * 0.022), m=enamel, bevel=0), outline=False)
    k(text('brand', 'FROSTMASTER', 0.07, (0, -h / 2 - 0.004, 0.55), plain('brand', '#8a93a5', 0.4), rot=R90), outline=False)
    for dx, dy, col in ((0.2, 0.55, '#e2574c'), (0.75, 0.7, '#e8c34f'), (0.4, 0.85, '#5fd6a0')):
        k(mn.cyl('magnet', 3.5 * U * 1.2, 0.03, loc=(-w / 2 + w * dx, -(-h / 2 + h * dy), H), m=plain('mag' + col, col, 0.3, coat=0.5), bevel=0.01))
    note = mn.link(bpy.data.objects.new('note', None)); note.location = (0, -(-h / 2 + h * 0.48), H + 0.002); note.rotation_euler.z = 0.08; k.parts.append(note)
    nm = plain('fnote', '#f2df6b', 0.7)
    for o in (k(mn.box('paper', (0.84, 0.34, 0.004), m=nm, bevel=0.001)),
              k(text('l1', 'WHO ATE MY', 0.085, (0, 0.045, 0.006), plain('fink', '#3a2f20', 0.5)), outline=False),
              k(text('l2', 'PUDDING??', 0.085, (0, -0.06, 0.006), plain('fink', '#3a2f20', 0.5)), outline=False)):
        o.parent = note
    for sx in (-1, 1):
        t = tape_strip(k, 0, 0, 0.16, 0.0, 40 + sx, z=0.005, w=0.07); t.parent = note; t.location = (sx * 0.4, 0.0, 0)
    k.outline(0.013); place(k, 'fridge')

def stool(k, x=0.0, y=0.0):
    seat = plain('seat', '#c0392b', 0.45, coat=0.3)
    k(mn.cyl('seat', 0.22, 0.07, loc=(x, -y, 0.38), m=seat, bevel=0.03))
    k(ring('seam', 0.12, 0.015, 0.072, loc=(x, -y, 0.38), m=plain('seatd', '#8a2a20', 0.5)), outline=False)
    k(mn.cyl('post', 0.035, 0.38, loc=(x, -y, 0), m=steelm('post')))
    k(mn.cyl('foot', 0.16, 0.03, loc=(x, -y, 0), m=plain('foot', '#3a3f4a', 0.5), bevel=0.012))
    tape_strip(k, x + 0.04, y - 0.05, 0.18, 0.6, 77, z=0.45, w=0.07)

@job('table_kitchen')
def table_job():
    for with_pizza in (True, False):
        if not with_pizza: mn.reset()
        k = Kit(); Z = 0.64
        wood = worn('tablewood', '#9a7a52', 0.55, 0.0, grime=0.7, scratch=0.5, gain=1.25)
        k(mn.cyl('top', 0.55, 0.05, loc=(0, 0, Z - 0.05), m=wood, bevel=0.02, verts=48))
        k(ring('ring', 6 * U, 0.012, 0.002, loc=(9 * U, -7 * U, Z), m=plain('mugring', '#6a4428', 0.6)), outline=False)
        k(mn.cyl('leg', 0.06, Z - 0.05, loc=(0, 0, 0), m=steelm('tleg')))
        k(mn.cyl('base', 0.3, 0.04, loc=(0, 0, 0), m=plain('tbase', '#3a3f4a', 0.5), bevel=0.015))
        if with_pizza:
            e = mn.link(bpy.data.objects.new('pz', None)); n0 = len(k.parts)
            pizza_model(k, 0.62, z=0.0)
            for o in k.parts[n0:]:
                if o.parent is None: o.parent = e
            e.location = (-3 * U, -4 * U, Z); e.rotation_euler.z = -0.3
        k.outline(0.013); place(k, 'table_kitchen' if with_pizza else 'table_kitchen_bare')

@job('stool')
def stool_job():
    k = Kit(); stool(k); k.outline(0.012); place(k, 'stool')   # at table centre + (-0.85, 0.25) and (0.7, -0.55)

# ---------------------------------------------------------------------------
# Bunks and lockers (right cannon room)
# ---------------------------------------------------------------------------
def bunk(k, x0, w, h, blanket, messy, cy):
    """One bunk bed, local x from x0 to x0 + w, y (game) from -h/2 to h/2. Upper bed at Z1."""
    frame = worn('bframe', '#4b5263', 0.45, 0.6, grime=0.7, scratch=0.5, gain=1.4)
    cx = x0 + w / 2; Z0, Z1, PH = 0.32, 1.12, 1.42
    for px in (x0 + 0.05, x0 + w - 0.05):
        for py in (-h / 2 + 0.05, h / 2 - 0.05):
            k(mn.box('post', (0.1, 0.1, PH), loc=(px, -py, 0), m=frame, bevel=0.02))
    for z in (Z0, Z1):
        k(mn.box('rail', (w, h, 0.1), loc=(cx, 0, z - 0.1), m=frame, bevel=0.02))
    k(mn.box('headboard', (w - 0.1, 0.05, 0.28), loc=(cx, h / 2 - 0.05, Z1), m=frame, bevel=0.015))
    mat_ = plain('mattress', '#d9d4c7', 0.8, sheen=0.3)
    for z in (Z0, Z1):
        mt = k(mn.box('mattress', (w - 0.08, h - 0.08, 0.14), loc=(cx, 0, z), m=mat_, bevel=0.05))
    k(mn.box('pillow', (w - 0.24, h * 0.15, 0.1), loc=(cx, -(-h / 2 + 0.06 + h * 0.075), Z1 + 0.13), m=plain('pillow', '#f2efe6', 0.8, sheen=0.4), bevel=0.045)).modifiers.new('s', 'SUBSURF').levels = 1
    bl = plain('blanket' + blanket, blanket, 0.85, sheen=0.5, gain=1.3)
    b = k(mn.box('blanket', (w - 0.06, h * 0.6, 0.06), loc=(0, 0, 0), m=bl, bevel=0.025))
    b.location = (cx, -(h * 0.12), Z1 + 0.12); b.rotation_euler.z = -(0.12 if messy else 0)
    b.modifiers.new('s', 'SUBSURF').levels = 1
    k(mn.box('fold', (w - 0.08, 0.1, 0.07), loc=(cx, -(h * 0.12 - h * 0.3 + 0.05), Z1 + 0.13), m=plain('fold' + blanket, '#f2efe6', 0.8), bevel=0.03)).rotation_euler.z = -(0.12 if messy else 0)
    # the lower bunk's blanket hangs out underneath
    k(mn.box('lower', (w * 0.7, 0.04, 0.3), loc=(x0 + 0.03 + w * 0.35, -(h / 2 + 0.03), Z0 - 0.15), m=plain('lowbl' + blanket, blanket, 0.85, gain=1.0), bevel=0.015))
    # ladder on the right side
    lx = x0 + w + 0.04
    for py in (h * 0.3 - h / 2, h * 0.75 - h / 2):
        k(mn.box('lrail', (0.04, 0.04, Z1 + 0.15), loc=(lx, -py, 0), m=steelm('lrail')))
    for i in range(4):
        k(mn.box('rung', (0.04, h * 0.45, 0.035), loc=(lx, -(h * 0.525 - h / 2), 0.25 + i * 0.25), m=steelm('rung')))
    return Z1

@job('bunks')
def bunks_job():
    k = Kit(); f = FURN['bunks']; half = (f['w'] - 0.4) / 2; h = f['h']
    Z1 = bunk(k, -f['w'] / 2, half, h, '#3a6ea8', False, 0)
    bunk(k, -f['w'] / 2 + half + 0.4, half, h, '#a8553a', True, 0)
    zt = Z1 + 0.14
    # a teddy bear on the messy one
    bx, by = -f['w'] / 2 + half + 0.4 + half / 2, -h / 2 + 0.6
    fur = plain('teddy', '#a8763a', 0.85, sheen=0.6, gain=1.3)
    for dx, dy, r, dz in ((0, 6, 8, 0.07), (0, -5, 6, 0.1), (-5, -10, 2.8, 0.15), (5, -10, 2.8, 0.15), (-8, 4, 3, 0.07), (8, 4, 3, 0.07), (-4, 12, 3, 0.05), (4, 12, 3, 0.05)):
        k(mn.sphere('ted', r * U * 1.25, loc=(bx + dx * U, -(by + dy * U), zt + dz), m=fur))
    k(mn.sphere('snout', 0.035, loc=(bx, -(by - 2 * U), zt + 0.15), m=plain('snout', '#e0c090', 0.8)), outline=False)
    for s in (-1, 1): k(mn.sphere('teye', 0.012, loc=(bx + s * 0.045, -(by - 7 * U), zt + 0.17), m=plain('teye', '#14161b', 0.3)), outline=False)
    k(mn.box('patch', (0.06, 0.06, 0.01), loc=(bx + 0.05, -(by + 6 * U), zt + 0.16), m=tape_mat(), rot=(0, 0, 0.5)), outline=False)
    # a comic on the tidy one
    cm = mn.link(bpy.data.objects.new('comic', None)); cm.location = (-f['w'] / 2 + half / 2, -(-h / 2 + 1.6), zt + 0.06); cm.rotation_euler.z = 0.25; k.parts.append(cm)
    for o in (k(mn.box('cover', (18 * U * 1.2, 12 * U * 1.2, 0.012), m=plain('comic', '#e8c34f', 0.6), bevel=0.003)),
              k(mn.box('art', (7 * U * 1.2, 5 * U * 1.2, 0.004), loc=(-2.5 * U * 1.2, 1.5 * U, 0.012), m=plain('comicr', '#c0392b', 0.5)), outline=False),
              k(text('pow', 'POW!', 0.05, (0.07, -0.04, 0.013), plain('pow', '#2a2a6a', 0.5)), outline=False)):
        o.parent = cm
    # a curtain half drawn on the messy bunk (right side, front half)
    cx = f['w'] / 2 - 0.03
    pts = []
    for i in range(13):
        u = i / 12; pts.append((math.sin(u * math.pi * 6) * 0.025, -h / 2 + 0.05 + u * 1.0))
    me = bpy.data.meshes.new('curtain'); bm = bmesh.new(); rows = []
    for (ox, py) in pts:
        rows.append((bm.verts.new((cx + ox, -py, 0.42)), bm.verts.new((cx + ox, -py, 1.38))))
    for i in range(len(rows) - 1):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    bm.to_mesh(me); bm.free()
    cur = k(mn._obj('curtain', me)); s_ = cur.modifiers.new('s', 'SOLIDIFY'); s_.thickness = 0.02
    mn.assign(cur, plain('curtain', '#46705a', 0.85, sheen=0.4, gain=1.2)); mn.smooth(cur)
    k(mn.cyl('crod', 0.015, 1.1, loc=(cx, h / 2 - 0.05, 1.4), m=steelm('crod'), rot=(math.radians(90), 0, 0)))
    k.outline(0.013); place(k, 'bunks')

@job('lockers')
def lockers_job():
    k = Kit(); f = FURN['lockers']; lw, d, H = f['w'] / 2, f['h'], 1.7
    for i, col in enumerate(('#56709a', '#5f7aa0')):
        x = -f['w'] / 2 + lw * (i + 0.5); paint = worn('locker%d' % i, col, 0.45, 0.4, grime=0.9, scratch=0.7, gain=1.35)
        k(mn.box('body', (lw - 0.02, d, H), loc=(x, 0, 0), m=paint, bevel=0.025))
        if i == 0:
            k(mn.box('door', (lw - 0.08, 0.02, H - 0.1), loc=(x, -d / 2, 0.05), m=paint, bevel=0.01))
            for kk in range(3): k(mn.box('vent', (lw - 0.24, 0.02, 0.02), loc=(x, -d / 2 - 0.01, H - 0.25 + kk * 0.05), m=plain('lvent', '#1a1e26', 0.6)), outline=False)
            k(mn.box('lhandle', (0.03, 0.03, 0.14), loc=(x + lw / 2 - 0.1, -d / 2 - 0.02, 0.85), m=steelm('lh'), bevel=0.01))
            k(mn.box('sticker', (0.16, 0.01, 0.16), loc=(x - 0.1, -d / 2 - 0.012, 1.1), m=plain('lstk', '#e8c34f', 0.6), rot=(0, 0.2, 0)), outline=False)
            k(text('lnum', '07', 0.07, (x - 0.1, -d / 2 - 0.02, 1.18), plain('ink', INK, 0.5), rot=R90), outline=False)
        else:
            k(mn.box('inside', (lw - 0.08, 0.02, H - 0.1), loc=(x, -d / 2 + 0.03, 0.05), m=plain('linside', '#1a1e26', 0.8)), outline=False)
            k(mn.box('shelf', (lw - 0.08, d - 0.1, 0.02), loc=(x, -0.02, 1.3), m=paint), outline=False)
            # a jacket on a hook, its sleeve hanging out of the open door
            k(mn.box('jacket', (lw - 0.2, 0.12, 0.6), loc=(x - 0.02, -d / 2 + 0.12, 0.65), m=plain('jacket', '#c4683a', 0.85, sheen=0.4), bevel=0.04))
            k(tube('sleeve', [(x + 0.1, d / 2 - 0.15, 1.15), (x + 0.2, d / 2 + 0.05, 0.95), (x + 0.24, d / 2 + 0.12, 0.6)], 0.05, plain('jacket', '#c4683a', 0.85, sheen=0.4), corner=0.1))
            k(mn.cyl('hook', 0.02, 0.08, loc=(x - 0.02, -d / 2 + 0.12, 1.25), m=steelm('hook')))
            # the door, swung open on its right hinge
            dr = k(shift_mesh(mn.box('door', (lw - 0.08, 0.02, H - 0.1), m=paint, bevel=0.01), dx=-(lw - 0.08) / 2, dz=(H - 0.1) / 2))
            dr.location = (x + lw / 2 - 0.03, -d / 2 - 0.01, 0.05); dr.rotation_euler.z = 1.0
            for kk in range(3):
                v = k(mn.box('vent', (lw - 0.24, 0.02, 0.02), loc=(-(lw - 0.08) / 2, -0.012, H - 0.3 + kk * 0.05), m=plain('lvent', '#1a1e26', 0.6)), outline=False); v.parent = dr
    k.outline(0.013); place(k, 'lockers')

# ---------------------------------------------------------------------------
# Wall plaques (vertical, facing the camera; origin at the plaque centre)
# ---------------------------------------------------------------------------
def plaque(k, w, h, lines, bg, fg, extra=None):
    k(mn.box('plate', (w, 0.04, h), loc=(0, 0.02, -h / 2), m=worn('plq' + bg, bg, 0.4, 0.3, grime=0.6, scratch=0.5, gain=1.15), bevel=0.02))
    for sx in (-1, 1):
        for sz in (-1, 1):
            k(mn.cyl('screw', 0.022, 0.015, loc=(sx * (w / 2 - 0.07), -0.005, sz * (h / 2 - 0.07)), m=steelm('screw'), rot=R90, verts=10), outline=False)
    step = h / (len(lines) + 0.4)
    for i, (t, size, *wt) in enumerate(lines):
        z = h / 2 - step * (i + 0.7)
        k(text('ptxt', t, size * 0.92, (0, -0.004, z), plain('pfg' + fg, fg, 0.5, gain=1.0), rot=R90), outline=False)

@job('plaques')
def plaques_job():
    k = Kit(); plaque(k, 1.5, 0.5, [('HANG IN THERE', 0.12)], '#2d5f82', '#e8f4ff')
    # the classic: a tiny kitten clinging to a bar
    k(mn.box('bar', (0.3, 0.012, 0.012), loc=(0.58, -0.006, 0.12), m=plain('bar', '#c9a46a', 0.6)), outline=False)
    k(mn.sphere('kit', 0.045, loc=(0.58, -0.02, 0.03), m=plain('kitten', '#e08a36', 0.7), scale=(1, 0.5, 1.2)), outline=False)
    for s in (-1, 1): k(mn.box('paw', (0.012, 0.012, 0.08), loc=(0.58 + s * 0.03, -0.02, 0.05), m=plain('kitten', '#e08a36', 0.7)), outline=False)
    k.outline(0.01); place(k, 'plaque_hang_in_there')
    mn.reset(); k = Kit()
    plaque(k, 2.05, 0.72, [('PLEASE CLOSE THE LID', 0.14), ('OR THE AIR RUNS OUT', 0.12), ('- the management', 0.085, 600)], '#e8e4d4', '#2a2d35')
    k.outline(0.01); place(k, 'plaque_toilet')
    mn.reset(); k = Kit()
    plaque(k, 2.6, 0.5, [('DAYS SINCE LAST INCIDENT:  0', 0.13)], '#2b303a', '#ffcf6b')
    k.outline(0.01); place(k, 'plaque_incident')

# ---------------------------------------------------------------------------
# The toilet (left airlock room)
# ---------------------------------------------------------------------------
@job('toilet_stall')
def stall_job():
    k = Kit(); f = FURN['stall']; H = 1.3
    panel = worn('stallp', '#8f98a8', 0.45, 0.3, grime=0.9, scratch=0.6, gain=1.3)
    wx, _ = L('stall', 11.375, 0)
    k(mn.box('wall', (0.15, 2.0, H), loc=(wx, 0, 0.0), m=panel, bevel=0.02))
    k(mn.box('front', (0.65, 0.15, H), loc=(L('stall', 11.625, 0)[0], -(16.925 - f['cy']), 0.0), m=panel, bevel=0.02))
    hx, hy = L('stall', 11.95, 17.0)
    dr = k(shift_mesh(mn.box('door', (0.95, 0.06, H - 0.2), m=worn('stalld', '#a3abb8', 0.45, 0.3, grime=0.8, scratch=0.5, gain=1.3), bevel=0.015), dx=0.475, dz=(H - 0.2) / 2))
    dr.location = (hx, -hy, 0.15); dr.rotation_euler.z = -0.9
    vac = k(mn.box('vacant', (0.12, 0.012, 0.06), loc=(0.75, -0.035, 0.7), m=glow('vacant', '#47e07a', 0.9)), outline=False); vac.parent = dr
    vt = k(text('vtxt', 'VACANT', 0.028, (0.75, -0.043, 0.7), plain('vtxt', '#0e2a14', 0.5), rot=R90), outline=False); vt.parent = dr
    k(mn.box('dhandle', (0.03, 0.04, 0.12), loc=(0.85, -0.05, 0.5), m=steelm('dh'), bevel=0.01)).parent = dr
    # toilet paper on the wall (toilet side)
    tx, ty = L('stall', 11.6, 15.85)
    k(mn.box('tpbracket', (0.04, 0.2, 0.04), loc=(wx + 0.09, -ty, 0.62), m=steelm('tpb')))
    k(mn.cyl('tp', 0.11, 0.17, loc=(tx + 0.04, -ty + 0.085, 0.67), m=plain('tp', '#f4f5f6', 0.85, gain=1.05), rot=R90, bevel=0.02))
    k(mn.cyl('tpcore', 0.045, 0.172, loc=(tx + 0.04, -ty + 0.086, 0.67), m=plain('tpcore', '#b9a07a', 0.8), rot=R90, bevel=0), outline=False)
    k(mn.box('tpsheet', (0.11, 0.01, 0.16), loc=(tx + 0.04, -ty - 0.01, 0.5), m=plain('tp', '#f4f5f6', 0.85, gain=1.05), bevel=0.003), outline=False)
    k.outline(0.013); place(k, 'toilet_stall')

@job('toilet')
def toilet_job():
    k = Kit(); f = FURN['toilet']; por = plain('porcelain', '#eef1f4', 0.25, coat=0.6, gain=1.0)
    y0 = -f['h'] / 2
    k(mn.box('tank', (0.72, 0.26, 0.42), loc=(0, -(y0 + 2 * U + 0.13), 0.38), m=por, bevel=0.05))
    k(mn.box('tanklid', (0.76, 0.3, 0.05), loc=(0, -(y0 + 2 * U + 0.13), 0.8), m=por, bevel=0.02))
    k(mn.cyl('flush', 0.04, 0.02, loc=(0, -(y0 + 0.15), 0.85), m=plain('flush', '#b9bfc9', 0.3, metal=0.6), bevel=0.008))
    k(mn.box('pipe', (0.12, 0.2, 0.4), loc=(0, -(y0 + 0.2), 0.0), m=por, bevel=0.03))
    cy = y0 + 0.66
    # bowl: a tapered pedestal, the seat ring, water
    me = bpy.data.meshes.new('bowl'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.15, radius2=0.26, depth=0.38)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.19)); bm.to_mesh(me); bm.free()
    bowl = k(mn._obj('bowl', me)); bowl.location = (0, -cy, 0); bowl.scale = (1.0, 1.22, 1); mn.assign(bowl, por); mn.bev(bowl, 0.03); mn.smooth(bowl)
    seat = k(ring('seat', 0.27, 0.11, 0.04, loc=(0, -cy, 0.38), m=plain('seat', '#f7f8f9', 0.3, coat=0.4)))
    seat.scale = (1.0, 1.22, 1)
    k(mn.cyl('hole', 0.16, 0.01, loc=(0, -(cy + 0.02), 0.39), m=plain('bowlin', '#c9d6df', 0.2, coat=0.6), bevel=0), outline=False).scale = (1, 1.4, 1)
    k(mn.cyl('water', 0.09, 0.012, loc=(0, -(cy + 0.06), 0.395), m=plain('twater', '#78aac8', 0.05, coat=1.0)), outline=False).scale = (1, 1.3, 1)
    # the lid: up, of course (leaning against the tank, its underside towards us)
    lid = k(shift_mesh(mn.box('lid', (0.54, 0.62, 0.035), m=plain('tlid', '#f7f8f9', 0.3, coat=0.4), bevel=0.015), dy=-0.31, dz=0.0175))
    lid.location = (0, -(y0 + 0.3), 0.41); lid.rotation_euler.x = math.radians(-100)
    k.outline(0.013); place(k, 'toilet')

@job('toilet_bits')
def bits_job():
    k = Kit()                                         # plunger (13.25, 16.6)
    k(mn.sphere('cup', 0.13, loc=(0, 0, 0.0), m=plain('plunger', '#b8402e', 0.45, coat=0.3), scale=(1, 1, 0.75)))
    k(mn.cyl('stick', 0.025, 0.62, loc=(0, 0, 0.06), m=plain('pwood', '#b8874f', 0.6)))
    k(mn.box('cut', (0.4, 0.4, 0.2), loc=(0, 0, -0.2), m=plain('x', '#000000', 1.0)), outline=False)
    cut = k.parts[-1]; bl = k.parts[0].modifiers.new('cut', 'BOOLEAN'); bl.object = cut; bl.operation = 'DIFFERENCE'; cut.hide_render = True
    k.parts.remove(cut)
    k.outline(0.012); place(k, 'plunger')
    mn.reset(); k = Kit()                             # magazine on the floor (12.05, 16.4), angle -0.4
    k(mn.box('mag', (20 * U * 1.1, 14 * U * 1.1, 0.02), m=plain('magp', '#e8e4dc', 0.6), bevel=0.004))
    k(mn.box('header', (16 * U * 1.1, 5 * U * 1.1, 0.004), loc=(0, 3.5 * U * 1.1, 0.02), m=plain('magh', '#7b5fd6', 0.5)), outline=False)
    k(text('magt', 'SPACE', 0.05, (0, 3.5 * U * 1.1, 0.025), plain('magw', '#ffffff', 0.5)), outline=False)
    k(mn.box('pic', (8 * U, 5 * U, 0.003), loc=(-2 * U, -2.5 * U, 0.02), m=plain('magpic', '#5f9ad6', 0.5)), outline=False)
    k.outline(0.008); place(k, 'magazine', -0.4)

# ---------------------------------------------------------------------------
# Bridge couch, treadmill
# ---------------------------------------------------------------------------
@job('couch')
def couch_job():
    k = Kit(); f = FURN['couch']; w, h = f['w'], f['h']
    fab = worn('couch', '#6a5a8a', 0.8, 0.0, grime=0.7, scratch=0.0, gain=1.35)
    fab2 = worn('couch2', '#7a6a9a', 0.8, 0.0, grime=0.6, scratch=0.0, gain=1.35)
    base = k(mn.box('base', (w, h, 0.25), m=fab, bevel=0.06))
    back = k(mn.box('back', (w * 0.42, h - 0.04, 0.82), loc=(w * 0.29, 0, 0.0), m=worn('couchb', '#5a4b78', 0.8, 0.0, grime=0.7, scratch=0.0, gain=1.35), bevel=0.1))
    back.modifiers.new('s', 'SUBSURF').levels = 1
    for sy in (-1, 1):
        a = k(mn.box('arm', (w * 0.6, 0.18, 0.5), loc=(-w * 0.2, sy * (h / 2 - 0.09), 0.0), m=fab, bevel=0.07)); a.modifiers.new('s', 'SUBSURF').levels = 1
    ch = (h - 0.36 - 0.04) / 2
    for i in range(2):
        c = k(mn.box('cushion', (w * 0.56, ch, 0.16), loc=(-w * 0.18, -(-h / 2 + 0.2 + ch / 2 + i * (ch + 0.04)), 0.24), m=fab2, bevel=0.06))
        c.modifiers.new('s', 'SUBSURF').levels = 1
    tape_strip(k, -w / 2 + w * 0.3, -h / 2 + h * 0.65, 0.4, 0.7, 141, z=0.41, w=0.16)
    # a blanket thrown over it
    me = bpy.data.meshes.new('throw'); bm = bmesh.new(); NX, NY = 10, 8; rows = []
    for i in range(NX + 1):
        row = []
        for j in range(NY + 1):
            u, v = i / NX - 0.5, j / NY - 0.5
            x, y = u * 0.7, v * 0.55
            gx, gy = x * math.cos(0.3) - y * math.sin(0.3) + (-w / 2 + w * 0.3), x * math.sin(0.3) + y * math.cos(0.3) + (-h / 2 + h * 0.25)
            z = 0.43 + 0.03 * math.sin(i * 1.3) * math.cos(j * 0.9)
            if gx > w * 0.08: z += min(0.4, (gx - w * 0.08) * 1.6)      # rides up the backrest
            row.append(bm.verts.new((gx, -gy, z)))
        rows.append(row)
    for i in range(NX):
        for j in range(NY): bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    bm.to_mesh(me); bm.free()
    th = k(mn._obj('throw', me)); so = th.modifiers.new('s', 'SOLIDIFY'); so.thickness = 0.03
    th.modifiers.new('ss', 'SUBSURF').levels = 1
    mn.assign(th, stripes_mat('throwm', '#d9a54a', '#c08a34', 14, 0.85, axis='xy')); mn.smooth(th)
    k.outline(0.013); place(k, 'couch')

@job('treadmill')
def treadmill_job():
    k = Kit(); f = FURN['tread']; w = f['w']; h = f['h']
    frame = worn('tframe', '#3a3f4a', 0.45, 0.5, grime=0.8, scratch=0.6, gain=1.5)
    k(mn.box('deck', (w, h, 0.08), m=frame, bevel=0.03))
    for side in (-1, 1):                             # side rails (FURNITURE.treadRailL/R)
        k(mn.box('rail', (0.21, h - 0.25, 0.14), loc=(side * (w / 2 - 0.105), -(0.125), 0.0), m=frame, bevel=0.03))
        k(mn.box('grip', (0.17, h - 0.35, 0.012), loc=(side * (w / 2 - 0.105), -(0.125), 0.14), m=plain('tgrip', '#1c2028', 0.9)), outline=False)
        k(mn.box('upright', (0.08, 0.1, 0.95), loc=(side * (w / 2 - 0.08), -(-h / 2 + 0.12), 0.08), m=frame, bevel=0.025))
    k(mn.box('hood', (w, 0.25, 0.14), loc=(0, -(-h / 2 + 0.125), 0.0), m=frame, bevel=0.04))
    k(mn.box('handlebar', (w + 0.12, 0.13, 0.08), loc=(0, -(-h / 2 + 0.1), 1.0), m=plain('tbar', '#c0392b', 0.45, coat=0.3), bevel=0.03))
    k(mn.box('console', (0.42, 0.18, 0.12), loc=(0, -(-h / 2 + 0.1), 1.06), m=plain('tcon', '#262a33', 0.4), bevel=0.03))
    k(mn.box('display', (0.26, 0.1, 0.01), loc=(0, -(-h / 2 + 0.09), 1.18), m=glow('tdisp', '#47e07a', 1.0)), outline=False)
    k(text('tkm', '0.0 km', 0.04, (0, -(-h / 2 + 0.09), 1.191), plain('tkmink', '#0e2a14', 0.5)), outline=False)
    tape_strip(k, 0.3, -h / 2 + 0.1, 0.16, 1.4, 99, z=1.081, w=0.08)
    k.outline(0.013); place(k, 'treadmill')

@job('treadmill_belt')
def belt_job():
    """The belt (TREADMILL rect), slats running to the back: 4 frames = 1/4 slat gap apart. Same origin as
    the treadmill. Frame i shows the slats shifted by i/4 * GAP (decor: off = t * U(WALK_SPEED * BELT_K) % gap)."""
    k = Kit(); f = FURN['tread']; bx0, bx1 = BELT['x'] - f['cx'], BELT['x'] + BELT['w'] - f['cx']
    by0, by1 = BELT['y'] - f['cy'], BELT['y'] + BELT['h'] - f['cy']; GAP = 9 / 48
    k(mn.box('belt', (bx1 - bx0, by1 - by0, 0.08), loc=((bx0 + bx1) / 2, -(by0 + by1) / 2, 0.0), m=plain('belt', '#1c2028', 0.8), bevel=0.01))
    slat = plain('slat', '#3a404c', 0.6)
    holder = mn.link(bpy.data.objects.new('slats', None)); k.parts.append(holder)
    n = int((by1 - by0) / GAP) + 3
    sl = []
    for i in range(-1, n):
        o = k(mn.box('slat', (bx1 - bx0 - 0.02, 0.03, 0.004), loc=((bx0 + bx1) / 2, -(by0 + i * GAP), 0.08), m=slat, bevel=0), outline=False)
        o.parent = holder; sl.append(o)
    # clip the slats to the belt
    cutter = mn.box('clip', (bx1 - bx0, by1 - by0, 0.2), loc=((bx0 + bx1) / 2, -(by0 + by1) / 2, 0.0)); cutter.hide_render = True
    for o in sl:
        b = o.modifiers.new('clip', 'BOOLEAN'); b.object = cutter; b.operation = 'INTERSECT'
    F = [1, 2, 3, 4]
    for i, fr in enumerate(F):
        bpy.context.scene.frame_set(fr); holder.location.y = -(i / 4) * GAP; holder.keyframe_insert('location', frame=fr)
    place(k, 'treadmill_belt', frames=F)

if __name__ == '__main__':
    run()
