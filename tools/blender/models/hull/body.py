"""The hull body of our ship (js/art.js drawShipHull + drawHullDecor in js/decor.js; HULL in js/ship.js).

The hull is a thick armoured slab whose top skin is the deck plane (z = 0), so the game's HULL polygon is
exactly the outline of its top face, and the room floors (z = 0 too) are drawn straight over it. Its
thickness hangs below: vertical sides down to z = -0.55, then a tucked-in, darker belly down to z = -0.95.
In the tilted view that shows as a lit edge band plus the belly under every south-facing edge (the stern,
the bottom corners, the undersides of the gun blisters); north-facing edges show no thickness at all.

What is visible of it in the game (see visible()): the two triangles beside the bridge's nose (north of the
bridge's back wall line), the gun blisters, the doorsteps at the outer airlock hatches, thin strips south of
the bottom rooms, the stern skirt around the engine, and the edge band/belly below the south edges (zone
stripes red/white/blue, the ship's name, vents). The rest of the top skin is under the walls (the outer walls
are flush with HULL) or hidden behind the back walls. Inside the room rectangles it is plain
plating that the floors cover. Baked in: an armoured trim along the outline, mismatched plates with
rivets (a few rusty replacements), the three gun mounts (pedestal + bolt ring; the front one on a sponson
off the nose), nav lights (red port, green starboard, white stern), stencils, duct tape, exhaust soot.

Split: screen-space tiles of TW x TH units (780 x 576 px), a grid over the whole hull; empty tiles are
skipped. Every tile's manifest entry has ox/oy = where ship-local game (0, 0) on the deck lands in that
tile, so the game draws every tile at the same place: ship origin - (ox, oy). Tiles don't overlap and
everything in them is at or below deck height (except the gun mounts, trim and nav lights: a few cm),
so their order doesn't matter: draw them all first, under everything else (where drawShipHull is now).
Index: manifest 'hull/body' lists the tiles.

    blender -b --factory-startup --python tools/blender/models/hull/body.py [-- quick] [-- tile=r1c2]
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hulllib import *

ARGS = args()
QUICK = 'quick' in ARGS
ONLY_TILE = next((a.split('=')[1] for a in ARGS if a.startswith('tile=')), None)
if QUICK: mn.SAMPLES = 16

Z_SIDE, Z_BELLY, BELLY_IN = -0.75, -1.2, 0.35
TRIM = 0.24                              # armoured trim along the outline
TW, TH = 8.125, 6.0                      # tile size (units): 780 x 576 px
TX0, TY1 = -2.25, 3.4                    # left edge (game x), top edge (screen units, up)
COLS, ROWS = 6, 4
WALL_T, WALL_H = 0.6, 1.6               # the rooms' walls (js/sprites.js): back walls hide the deck behind them

def visible(x, y, m=0.0):
    """Is deck point (x, y) on the hull and seen in the game, m units clear of anything that hides it: not
    under a wall (WALL_T around every room) and not behind a back wall (WALL_H tall, so it hides the deck
    up to WALL_H * COT north of itself)."""
    if not point_in_poly(x, y) or dist_to_poly(x, y) < m: return False
    for x0, y0, x1, y1 in ROOM_RECTS:
        if x0 - WALL_T - m <= x <= x1 + WALL_T + m and y0 - WALL_T - WALL_H * COT - m <= y <= y1 + WALL_T + m: return False
    return True
HIDDEN = []                              # decor placed where it can't be seen (printed by build())
def seen(name, x, y, m=0.0):
    if not visible(x, y, m): HIDDEN.append((name, round(x, 2), round(y, 2)))

def offset_poly(pts, d):
    """Polygon pulled inwards by d (bmesh inset), same vertex order."""
    bm = bmesh.new(); vs = [bm.verts.new((x, -y, 0)) for x, y in pts]; f = bm.faces.new(vs)
    bmesh.ops.inset_region(bm, faces=[f], thickness=d, depth=0)
    out = [(v.co.x, -v.co.y) for v in f.verts]; bm.free(); return out

def make_plates(r, seed, max_size):
    """js/art.js makePlates: recursive halving into irregular plates."""
    rnd = random.Random(seed); out = []
    def split(q, depth):
        x, y, w, h = q; big = max(w, h)
        if big <= max_size * (0.7 + rnd.random() * 0.6) or depth > 8: out.append(q); return
        k = 0.3 + rnd.random() * 0.4
        if w > h * (0.8 + rnd.random() * 0.4):
            split((x, y, w * k, h), depth + 1); split((x + w * k, y, w - w * k, h), depth + 1)
        else:
            split((x, y, w, h * k), depth + 1); split((x, y + h * k, w, h - h * k), depth + 1)
    split(r, 0)
    return [(q, rnd.random()) for q in out]

def boolean(o, cutter, op='INTERSECT'):
    md = o.modifiers.new('bool', 'BOOLEAN'); md.operation = op; md.object = cutter; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)
    return o

def south_edges(pts):
    """Edges of the polygon whose outward normal points (partly) towards +y (south, towards the camera)."""
    out = []
    for i in range(len(pts)):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % len(pts)]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy)
        nx, ny = dy / L, -dx / L                          # outward for a clockwise (screen) polygon
        if ny > 0.15: out.append(((ax, ay), (bx, by), (nx, ny)))
    return out

def zone_color(x):
    return '#b8473e' if x < 14.2 else '#d6dae2' if x < 30.8 else '#3f72c0'

def build():
    s = mn.reset()
    M = dict(
        side=worn('side', '#5d6678', 0.5, 0.35, wear=0.7),
        belly=worn('belly', '#2b303a', 0.6, 0.3, wear=0.4, grime=1.2),
        groove=mn.mat('groove', '#16181d', 0.8),
        trim=worn('trim', '#2c323c', 0.45, 0.45, wear=1.2),
        steel=worn('steel', '#a3abb8', 0.32, 0.8, wear=0.3),
        gun=worn('gunmetal', '#3a414f', 0.45, 0.4, wear=0.6),
        dark=worn('dark', '#23272f', 0.6, 0.3, wear=0.4),
        black=mn.mat('black', '#0b0c0f', 0.9),
        hazard=hazard_mat('hazard', 4.5),
        stencil=worn('stencil', '#e8e4d8', 0.6, 0.0, wear=1.4, grime=0.6),
        yellow=worn('yellow', '#e8c34f', 0.5, 0.0, wear=1.2),
        tape=tape_mat(),
        glass=glass_mat('glass', '#7fc4e8', 0.55),
        crack=mn.mat('crackline', '#d8eef8', 0.3),
        scorch=scorch_mat('scorch', 0.6, 5.0),
        soot=scorch_mat('soot', 0.4, 5.0),
        rubber=mn.mat('rubber', 'rubber', 0.7),
    )
    plate_mats = [worn(f'plate{i}', c, 0.5, 0.35, wear=0.9) for i, c in
                  enumerate(('#444c5c', '#485062', '#404858', '#4d5668', '#464d5a'))]
    rust = worn('rust', '#5a4a40', 0.75, 0.2, wear=0.6, grime=1.4, gain=1.1)
    patchm = worn('patchplate', '#6b7486', 0.45, 0.5, wear=1.2)
    objs, outl, halos = [], [], []
    def O(o, ol=False):
        objs.append(o)
        if ol: outl.append(o)
        return o

    # -- slab: sides and belly -----------------------------------------------------------------------
    slab = O(prism('slab', HULL, Z_SIDE, -0.04, M['side'], bevel=0.035, under=BELLY_IN, z_under=Z_BELLY), True)
    # belly faces get the dark material: faces below the side band
    slab.data.materials.append(M['belly'])
    for p in slab.data.polygons:
        c = sum((slab.data.vertices[v].co for v in p.vertices), Vector()) / len(p.vertices)
        if c.z < Z_SIDE - 0.01: p.material_index = 1

    # -- armoured trim along the outline ---------------------------------------------------------------
    inner = offset_poly(HULL, TRIM)
    bm = bmesh.new(); vs = [bm.verts.new(G(x, y, -0.05)) for x, y in HULL]; f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z < 0: f.normal_flip()
    bmesh.ops.inset_region(bm, faces=[f], thickness=TRIM, depth=0)
    bmesh.ops.delete(bm, geom=[f], context='FACES_ONLY')
    ring_faces = list(bm.faces)
    r = bmesh.ops.extrude_face_region(bm, geom=ring_faces)
    bmesh.ops.translate(bm, verts=[g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)], vec=Vector((0, 0, 0.075)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('trim'); bm.to_mesh(me); bm.free()
    trim = O(finish(mn.link(bpy.data.objects.new('trim', me)), M['trim'], 0.012), True)
    # trim rivets every ~0.45 along the outline
    rv = []
    for i in range(len(HULL)):
        (ax, ay), (bx, by) = HULL[i], HULL[(i + 1) % len(HULL)]
        (ix, iy), (jx, jy) = inner[i], inner[(i + 1) % len(inner)]
        L = math.hypot(bx - ax, by - ay); n = max(1, int(L / 0.45))
        for k in range(n):
            t = (k + 0.5) / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t; qx, qy = ix + (jx - ix) * t, iy + (jy - iy) * t
            rv.append((px * 0.5 + qx * 0.5, py * 0.5 + qy * 0.5, 0.025))
    O(many_spheres('trim_rivets', rv, 0.03, M['steel'], scale=(1, 1, 0.45)))

    # -- plates ------------------------------------------------------------------------------------------
    clip = prism('clip', offset_poly(HULL, TRIM + 0.02), -0.3, 0.3, None, bevel=0)
    plates = make_plates((-2, -4.5, 49, 31.5), 77, 3.2)
    groups = {}
    rivets = []
    for (x, y, w, h), rv_ in plates:
        g = 5 if rv_ < 0.05 else int(rv_ * 997) % 5
        ztop = (0.0, -0.008, 0.008, 0.0, 0.004)[int(rv_ * 131) % 5]
        groups.setdefault(g, []).append((x + 0.02, y + 0.02, x + w - 0.02, y + h - 0.02, -0.06, ztop))
        # rivets along the plate border (skipped where floors cover them)
        for (ax, ay, bx, by) in ((x, y, x + w, y), (x, y + h, x + w, y + h), (x, y, x, y + h), (x + w, y, x + w, y + h)):
            L = math.hypot(bx - ax, by - ay); n = max(1, int(L / 0.55))
            for k in range(n + 1):
                t = k / n; px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                px += 0.1 if px <= x + 1e-6 else -0.1 if px >= x + w - 1e-6 else 0
                py += 0.1 if py <= y + 1e-6 else -0.1 if py >= y + h - 1e-6 else 0
                if point_in_poly(px, py) and dist_to_poly(px, py) > TRIM + 0.1 and not in_room(px, py, 0.05):
                    rivets.append((px, py, ztop))
    for g, boxes in groups.items():
        o = many_boxes(f'plates{g}', boxes, rust if g == 5 else plate_mats[g])
        boolean(o, clip); mn.bev(o, 0.012, 2)
        O(o)
    bpy.data.objects.remove(clip)
    O(many_spheres('rivets', rivets, 0.028, M['steel'], scale=(1, 1, 0.45)))
    O(prism('deck_under', offset_poly(HULL, 0.05), -0.12, -0.05, M['groove'], bevel=0))      # shows in the plate seams

    # -- gun mounts ----------------------------------------------------------------------------------------
    O(prism('sponson', [(21.0, -3.1), (23.4, -3.1), (23.0, -3.95), (21.4, -3.95)], -0.75, -0.02, M['side'], bevel=0.04), True)
    O(prism('sponson_belly', [(21.3, -3.1), (23.1, -3.1), (22.8, -3.7), (21.6, -3.7)], -1.1, -0.7, M['belly'], bevel=0.04), True)
    for gid, (gx, gy, ga) in GUNS.items():
        O(gcyl(f'pedestal_{gid}', gx, gy, 0.6, -0.45, 0.08, M['gun'], verts=48, bevel=0.03), True)
        O(mn.cyl(f'ped_haz_{gid}', 0.605, 0.1, loc=G(gx, gy, -0.12), m=M['hazard'], verts=48, bevel=0.0))
        O(ring(f'mount_ring_{gid}', 0.52, 0.12, 0.06, loc=G(gx, gy, 0.08), m=M['steel'], verts=48), True)
        O(many_spheres(f'mount_bolts_{gid}', [(gx + math.cos(i / 8 * math.tau) * 0.53, gy + math.sin(i / 8 * math.tau) * 0.53, 0.08) for i in range(8)],
                       0.03, M['dark'], scale=(1, 1, 0.6)))
        O(gcyl(f'well_{gid}', gx, gy, 0.38, 0.06, 0.1, M['dark'], verts=40, bevel=0.01))

    # (the bridge's nose windows are gone: the nose's back wall stands on them in the tilted view)

    # -- nav lights (steady), on little stalks off the edge ---------------------------------------------------
    for (lx, ly, col) in NAV_LIGHTS:
        # stalk back to the nearest hull point
        best = None
        for i in range(len(HULL)):
            (ax, ay), (bx, by) = HULL[i - 1], HULL[i]
            dx, dy = bx - ax, by - ay; k = max(0, min(1, ((lx - ax) * dx + (ly - ay) * dy) / (dx * dx + dy * dy)))
            px, py = ax + dx * k, ay + dy * k
            if best is None or math.hypot(px - lx, py - ly) < best[0]: best = (math.hypot(px - lx, py - ly), px, py)
        _, px, py = best
        L = math.hypot(lx - px, ly - py) or 1.0
        lx, ly = px + (lx - px) / L * 0.06, py + (ly - py) / L * 0.06          # a pod on the edge, facing out
        O(gcyl('nav_base', lx, ly, 0.13, -0.25, 0.03, M['dark'], verts=20, bevel=0.03), True)
        O(gsphere('nav_light', lx, ly, 0.04, 0.09, emit_mat('nav' + col, col, 1.5, base=col), segs=20))
        h = disc('nav_halo', lx, ly, 0.08, 0.4, halo_mat('navhalo' + col, col, 1.2, 0.5)); halos.append(h); O(h)

    # -- stencils and markings on the rim ----------------------------------------------------------------------
    # What of the top skin shows in the game (see visible()): the nose triangles beside the bridge's nose (north
    # of the bridge's back wall line), the gun blisters, the doorsteps at the hatches and the thin strips south of
    # the bottom rooms. The rest of the rim is under the walls or hidden behind the back walls, so the ship's
    # name and registration are on the stern faces (side_text below), not on top.
    # hazard stripes on the blisters (where the gunners climb out): along both diagonal edges, inside the trim
    for gid in ('port', 'star'):
        gx, gy, _ = GUNS[gid]
        for (a, b) in (((0, 4.6), (-1.6, 5.6)), ((-1.6, 8.6), (0, 9.6))) if gid == 'port' else (((44.4, 4.6), (46, 5.5)), ((46, 8.5), (44.4, 9.4))):
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
            nx, ny = -dy / L, dx / L
            if nx * (gx - mx) + ny * (gy - my) < 0: nx, ny = -nx, -ny             # inwards, towards the gun
            cx, cy = mx + nx * 0.42, my + ny * 0.42
            O(mn.box('blister_haz', (0.95, 0.17, 0.016), loc=G(cx, cy, 0.0), m=M['hazard'], bevel=0.003, rot=(0, 0, -math.atan2(dy, dx))))
            for k in (-1, 1): seen('blister_haz', cx + dx / L * 0.475 * k, cy + dy / L * 0.475 * k, 0.1)
    # nose triangles: an intake grille (left) and a sensor box (right), north of the bridge's back wall line
    O(gbox('grille_frame', 16.4, -2.0, 17.35, -1.45, -0.03, 0.05, M['trim'], bevel=0.02), True)
    O(gbox('grille_hole', 16.5, -1.92, 17.25, -1.53, -0.02, 0.055, M['black'], bevel=0.0))
    for k in range(4):
        O(gbox('grille_slat', 16.52, -1.9 + k * 0.1, 17.23, -1.86 + k * 0.1, 0.0, 0.06, M['gun'], bevel=0.008))
    for (x, y) in ((16.4, -2.0), (17.35, -1.45), (16.4, -1.45)): seen('grille', x, y, 0.05)
    O(gbox('sensor_box', 27.0, -2.0, 27.9, -1.42, -0.02, 0.16, M['gun'], bevel=0.03), True)
    O(gbox('sensor_lid', 27.08, -1.92, 27.82, -1.5, 0.16, 0.19, M['trim'], bevel=0.015), True)
    O(gsphere('sensor_eye', 27.6, -1.71, 0.2, 0.07, emit_mat('sensor', '#ffb84a', 1.0), segs=16))
    O(gsphere('sensor_eye2', 27.25, -1.71, 0.2, 0.04, emit_mat('sensor2', '#5fd6a0', 1.0), segs=12))
    O(mn.box('sensor_tape', (0.5, 0.11, 0.01), loc=G(27.45, -1.55, 0.19), m=M['tape'], bevel=0.003, rot=(0, 0, 0.25)))
    for (x, y) in ((27.0, -2.0), (27.9, -2.0), (27.9, -1.42)): seen('sensor', x, y, 0.05)
    # duct tape: the ship's running joke. On top (blisters, nose) and across the stern faces (the edge band)
    for (tx, ty, tl, ta) in ((-0.35, 6.1, 0.55, 1.3), (44.75, 8.1, 0.5, -1.2), (27.2, -2.45, 0.45, 0.3)):
        O(mn.box('tape', (tl, 0.12, 0.012), loc=G(tx, ty, 0.01), m=M['tape'], bevel=0.003, rot=(0, 0, -ta)))
        seen('tape', tx, ty, 0.12)
    def face_tape(name, x, y, z, tl, ta):                                     # on a south (stern) face, tilted by ta
        return O(mn.box(name, (tl, 0.12, 0.012), loc=G(x, y + 0.008, z), m=M['tape'], bevel=0.003, rot=(math.radians(90), ta, 0)))
    for (tx, ty, ta) in ((2.8, 24.1, -0.5), (11.0, 24.1, 0.4), (34.0, 24.6, 0.3), (42.2, 24.6, -0.6)):
        face_tape('tape_side', tx, ty, -0.35, 0.5, ta)
    for a in (0.7, -0.7):                                                      # an X over a dent
        face_tape('tapex', 40.2, 24.6 + 0.004, -0.33, 0.45, a)
    # old scorch marks next to the side guns
    for (sx, sy, sr) in ((-1.25, 6.0, 0.3), (45.65, 6.0, 0.28)):
        O(disc('old_scorch', sx, sy, 0.012, sr, M['soot'], sy=0.8))
        seen('scorch', sx, sy, 0.0)

    # -- greebles on the rim (where no floor covers the hull): access panels, vent slots, arrows ----------------
    rnd = random.Random(5); spots = []
    for _ in range(6000):
        x, y = rnd.uniform(-1.5, 46), rnd.uniform(-3.2, 26.1)
        if not visible(x, y, 0.3) or dist_to_poly(x, y) < TRIM + 0.3: continue
        if any(math.hypot(x - a, y - b) < 2.2 for a, b in spots): continue
        if any(math.hypot(x - gx, y - gy) < 1.0 for gx, gy, _ in GUNS.values()): continue
        if (16.1 < x < 17.7 and -2.3 < y < -1.1) or (26.7 < x < 28.2 and -2.8 < y < -1.1): continue   # grille, sensor, tape
        if abs(y - 19.3) < 1.6 and (x < 1 or x > 43.4): continue                   # the outer airlock hatches
        if any(math.hypot(x - a, y - b) < 0.6 for a, b in ((-0.35, 6.1), (44.75, 8.1), (-1.25, 6.0), (45.65, 6.0))): continue
        if any(abs(x - gx) < 1.0 and (abs(y - (gy - 1.9)) < 0.6 or abs(y - (gy + 1.9)) < 0.6) for gx, gy, _ in GUNS.values()): continue  # blister stripes
        if math.hypot(x - ANTENNA[0], y - (ANTENNA[1] + 1.25)) < 0.8: continue
        spots.append((x, y))
    for i, (x, y) in enumerate(spots):
        horiz = not (in_room(x + 0.5, y, 0.0) or in_room(x - 0.5, y, 0.0))         # long side along the rim
        w, h = (0.5, 0.3) if horiz else (0.3, 0.5)
        kind = i % 3
        if kind == 0:                                                             # access panel with 4 bolts
            O(gbox('access', x - w / 2, y - h / 2, x + w / 2, y + h / 2, -0.01, 0.025, M['trim'], bevel=0.01))
            O(many_spheres('access_bolts', [(x + sx * (w / 2 - 0.05), y + sy * (h / 2 - 0.05), 0.025) for sx in (-1, 1) for sy in (-1, 1)], 0.018, M['steel']))
        elif kind == 1:                                                           # vent slots
            for k in range(3):
                if horiz: O(gbox('slot', x - w / 2, y - 0.1 + k * 0.08, x + w / 2, y - 0.07 + k * 0.08, -0.01, 0.003, M['black'], bevel=0))
                else: O(gbox('slot', x - 0.1 + k * 0.08, y - h / 2, x - 0.07 + k * 0.08, y + h / 2, -0.01, 0.003, M['black'], bevel=0))
        else:                                                                     # painted arrow / hazard tick
            O(gbox('tick', x - w / 2, y - h / 2, x + w / 2, y + h / 2, -0.01, 0.004, M['hazard'], bevel=0.002))
    # -- the edge band below the south edges: zone stripes, name, vents ------------------------------------------
    for (a, b, n) in south_edges(HULL):
        cuts = sorted({0.0, 1.0} | {(zx - a[0]) / (b[0] - a[0]) for zx in (14.2, 30.8) if b[0] != a[0] and 0 < (zx - a[0]) / (b[0] - a[0]) < 1})
        for t0, t1 in zip(cuts, cuts[1:]):                         # zone stripe, cut where the zone changes
            p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0); p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
            col = zone_color((p0[0] + p1[0]) / 2)
            off = 0.012
            q = [(p0[0] + n[0] * off, p0[1] + n[1] * off), (p1[0] + n[0] * off, p1[1] + n[1] * off),
                 (p1[0] - n[0] * 0.02, p1[1] - n[1] * 0.02), (p0[0] - n[0] * 0.02, p0[1] - n[1] * 0.02)]
            mz = bpy.data.materials.get('zone' + col) or worn('zone' + col, col, 0.5, 0.1, wear=1.2)
            O(prism('zone_stripe', q, -0.66, -0.54, mz, bevel=0.005))
    # name on the stern faces (front face of the y = 24.1 / 24.6 edges)
    def side_text(name, body, x, y, size):
        o = label(name, body, size, G(x, y + 0.012, -0.29), rot=(math.radians(90), 0, 0), m=M['stencil'], depth=0.004)
        return O(o)
    side_text('name_side', 'MANIFOLD NOVUM', 7.2, 24.1, 0.3)
    side_text('reg_side', 'MNV-0451', 37.3, 24.6, 0.3)
    side_text('stern_txt', 'KEEP CLEAR OF EXHAUST', 18.15, 26.1, 0.13)
    side_text('stern_txt2', 'NO RIDERS', 27.9, 26.1, 0.16)
    for vx in (14.6, 29.6):                                            # vents on the stern face
        for k in range(4):
            O(gbox('stern_vent', vx - 0.4, 26.1, vx + 0.4, 26.14, -0.6 + k * 0.11, -0.53 + k * 0.11, M['black'], bevel=0.0))
        O(gbox('stern_vent_frame', vx - 0.48, 26.08, vx + 0.48, 26.13, -0.68, -0.1, M['trim'], bevel=0.01))
    # mounting collar on the stern face for the engine bell (engine.py renders the bell itself)
    O(prism('bell_collar', [(19.9, 26.0), (24.5, 26.0), (24.5, 26.2), (19.9, 26.2)], -1.15, -0.02, M['gun'], bevel=0.03), True)
    for bx in (20.1, 24.3):
        O(gsphere('collar_bolt', bx, 26.21, -0.6, 0.04, M['steel'], segs=10))

    mn.outline(outl, thickness=0.02)
    for h in HIDDEN: print('[body] WARNING not visible in the game:', *h)
    return objs, halos

def tile_window(r, c):
    x0 = TX0 + c * TW; y1 = TY1 - r * TH
    return x0, x0 + TW, y1 - TH, y1

def alpha_empty(path):
    img = bpy.data.images.load(path); px = img.pixels[:]; bpy.data.images.remove(img)
    return max(px[3::4]) < 0.01

if __name__ == '__main__':
    T0 = time.time()
    objs, halos = build()
    print(f'[body] built in {time.time() - T0:.1f}s, {len(objs)} objects')
    tiles = []
    for r in range(ROWS):
        for c in range(COLS):
            nm = f'r{r}c{c}'
            if ONLY_TILE and nm != ONLY_TILE: continue
            x0, x1, y0, y1 = tile_window(r, c)
            name = f'hull/body_{nm}'
            t0 = time.time()
            show(halos, True)
            render_exact(name, x0, x1, y0, y1, passes=('beauty',))
            path = os.path.join(mn.OUT_DIR, name + '.png')
            if alpha_empty(path):
                os.remove(path); manifest_del(name); print(f'[body] {nm} empty'); continue
            show(halos, False)
            render_exact(name, x0, x1, y0, y1, passes=('normal', 'height'),
                         extra={'note': 'hull tile: draw at ship origin - (ox, oy); see hull/body', 'window': [x0, x1, y0, y1]})
            tiles.append(name)
            print(f'[body] {nm}: {time.time() - t0:.1f}s')
    if not ONLY_TILE:
        mn._manifest_put('hull/body', {'tiles': tiles, 'tile_px': [round(TW * mn.PPU), round(TH * mn.PPU)], 'dirs': 1, 'frames': 1, 'files': [],
                                       'note': 'hull body split into screen tiles; each tile entry has its own ox/oy = ship-local game (0,0) '
                                               'on the deck plane, so draw every tile at ship origin - (ox, oy). Draw before everything else.'})
    print(f'[body] total {time.time() - T0:.1f}s')
