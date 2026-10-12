"""Doors in up-down walls: the sliding doors between rooms and the outer airlock hatches (inside view).

Both sit in a vertical wall (seen edge-on in the tilted view), so they are built as pocket doors: two
thick panels slide out of the wall jambs north and south of the opening and meet in the middle, like
drawSlideDoor/drawDoorways (js/art.js, js/mission.js) and drawHatch (js/art.js). The frame sprite has
the jamb ends (collars), the threshold and the status lamp; the panel sprites are rendered with the
jambs as a holdout (cut where the wall is in front), so they go on top of the frame (and of the wall
tiles) without any masking in the game. Every sprite of one door shares canvas and origin.

Doorways (DOORWAYS in js/ship.js: all 0.6 wide (the wall gap) x 2.2 long, door rect d)
  origin = (d.x + d.w / 2, d.y): the wall centre at the north end of the opening, on the floor.
  interior/door_v_frame              jamb collars, threshold, lamp green
  interior/door_v_frame_locked       lamp red (d.locked)
  interior/door_v_frame_blast_f0..3  red warning beacon turning (d.blast: vacuum behind it)
  interior/door_v_f0..f5             panels, d.open = 0, .2, .4, .6, .8, 1 (f5 = gone into the walls)
  interior/door_v_locked_f0..f5      same, red edge caps (d.locked)
  interior/door_v_blast_f0..f5       heavy hazard-striped blast shutter (d.blast), same openings
  interior/door_v_forced             pried open by a manual override: dented, stuck ~65 % open, crowbar
  The wall tiles stop at d.y - 0.6 (the frame shows the jamb's last 0.6) and resume at d.y + d.h + 0.2.

Outer airlock hatches (HATCHES: port at x = 0, star at x = 44.4; opening h.y +- 0.9 in the outer wall)
  origin = (wall centre x = h.x - h.dir * 0.3, h.y - 0.9), on the floor. <side> = port | star
  interior/hatch_<side>_frame, _frame_locked, _frame_broken_f0..1 (sparks flicker)
  interior/hatch_<side>_f0..f5       panels, h.open = 0 .. 1
  interior/hatch_<side>_locked       closed, red bars (h.locked)
  interior/hatch_<side>_broken       jammed shut, one panel bent, duct tape across (broken(h))
  The slot floor shows space when the doors are open (it is the way out).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ilib import *

OPEN = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]

class Spec:
    def __init__(self, kind):
        self.kind = kind
        if kind == 'door':
            self.L = 2.2; self.cw = 0.38; self.cdeep = 0.2; self.ch = 1.66
            self.pt = 0.3; self.ph = 1.5; self.slot = 0.4
        else:                                    # hatch: shorter opening, heavier everything
            self.L = 1.8; self.cw = 0.42; self.cdeep = 0.26; self.ch = 1.72
            self.pt = 0.34; self.ph = 1.55; self.slot = 0.44

def frame(S, M, side=0, state='ok', t=0.0):
    """Static part. side: 0 = doorway (symmetric), -1 = port hatch (outside is -x), +1 = star hatch."""
    o = []; hold = []
    L, cw, cd, ch = S.L, S.cw, S.cdeep, S.ch
    def xr(a, b):                               # collar x range: hatches stay flush on the outside
        if side == 0: return a, b
        if side < 0: return max(a, -0.3), b
        return a, min(b, 0.3)
    # jamb walls
    n_wall = wall_y(M, 0.0, -3.5, -cd, H_FULL)
    s_wall = wall_y(M, 0.0, L + cd, L + 3.5, H_FULL)
    o += n_wall + s_wall
    # collars (the frame around the opening)
    x0, x1 = xr(-cw, cw)
    cm = M['panel2'] if S.kind == 'door' else pmat('collar_red', '#9a4438', 0.5, 0.3, grime=0.55, grime_scale=4)
    nc = gbox('collar_n', x0, -cd, x1, 0.0, 0, ch, cm, 0.025)
    sc = gbox('collar_s', x0, L, x1, L + cd, 0, ch, cm, 0.025)
    o += [nc, sc]
    hold += [nc, sc] + [x for x in n_wall + s_wall if x.name.startswith(('body', 'cap'))]
    # collar tops: hazard stripes, bolts
    for (ya, yb) in ((-cd, 0.0), (L, L + cd)):
        o.append(gbox('ctop_hz', x0 + 0.05, ya + 0.04, x1 - 0.05, yb - 0.04, ch, ch + 0.012, M['hazard_big' if S.kind == 'hatch' else 'hazard'], 0.004))
        for sx in (x0 + 0.04, x1 - 0.04):
            o.append(rivet(sx, (ya + yb) / 2, ch, M, r=0.025))
    # the north collar's south face: the pocket slot the panel comes out of, lamp, keypad
    o.append(gbox('slot', -S.slot / 2, -0.01, S.slot / 2, 0.012, 0.02, S.ph + 0.05, M['hole'], 0.004))
    for sx in (-1, 1):
        o.append(gbox('seal', sx * S.slot / 2 - 0.02, 0.0, sx * S.slot / 2 + 0.02, 0.02, 0.02, S.ph + 0.05, M['rubber'], 0.006))
    lx = (x1 - 0.1) if side <= 0 else (x0 + 0.1)          # lamp on the room side
    lamp_state = {'ok': 'open', 'locked': 'closed', 'blast': 'closed', 'broken': 'off'}[state]
    o.append(gbox('lamp_box', lx - 0.06, -0.01, lx + 0.06, 0.04, 1.2, 1.42, M['dark'], 0.015))
    o.append(mn.sphere('lamp', 0.045, loc=G(lx, 0.04, 1.31), m=lamp_mat(lamp_state), scale=(1, 0.7, 1), segs=16))
    kx = (x0 + 0.1) if side == 0 else lx                  # hatches: keypad under the lamp, room side
    o.append(gbox('keypad', kx - 0.055, -0.01, kx + 0.055, 0.03, 0.85, 1.05, M['dark'], 0.01))
    for i in range(3):
        for j in range(2):
            o.append(gbox('key', kx - 0.035 + j * 0.05, 0.03, kx - 0.015 + j * 0.05, 0.04, 0.88 + i * 0.05, 0.91 + i * 0.05, M['steel'], 0.003))
    o.append(gbox('hz_face', x0 + 0.03, -0.01, x1 - 0.03, 0.025, 0.08, 0.26, M['hazard'], 0.005))
    # threshold floor
    o.append(gbox('thr', -0.3, 0.0, 0.3, L, 0.0, 0.03, M['body'], 0.008))
    o.append(gbox('rail', -0.06, 0.02, 0.06, L - 0.02, 0.03, 0.036, M['hole'], 0.0))
    for sx in (-1, 1):
        o.append(gbox('edge', sx * 0.255 - 0.02, 0.03, sx * 0.255 + 0.02, L - 0.03, 0.03, 0.036, M['yellow'], 0.004))
        for k in range(int(L / 0.4)):
            o.append(rivet(sx * 0.17, 0.2 + k * 0.4, 0.03, M, r=0.018))
    if S.kind == 'hatch':
        # outside of the hatch: space shows in the slot (a black grate over the void, a few stars)
        sx = 0.3 * side
        o.append(gbox('void', -0.3 if side < 0 else 0.1, 0.05, -0.1 if side < 0 else 0.3, L - 0.05, 0.031, 0.034, glow('void', '#0a1020', 0.6), 0.0))
        for k, (vx, vy) in enumerate(((0.05, 0.3), (0.12, 0.9), (0.03, 1.45), (0.15, 0.6), (0.08, 1.2))):
            o.append(mn.sphere('star', 0.012, loc=G(side * (0.3 - vx - 0.03), vy, 0.036), m=glow('star', '#e8f0ff', 1.5), segs=8))
        # heavy dogs (latch bolts) on the collar tops, room side
        for (ya, yb) in ((-cd, 0.0), (L, L + cd)):
            rx = -side * 0.27
            o.append(mn.cyl('dog', 0.06, 0.07, loc=G(rx, (ya + yb) / 2, ch + 0.012), m=M['steel'], verts=6, bevel=0.012))
    if state == 'blast':                           # rotating red warning beacon on the north collar
        bx = x0 + 0.13
        o.append(mn.cyl('beacon_base', 0.08, 0.05, loc=G(bx, -cd / 2, ch), m=M['dark'], bevel=0.01))
        o.append(mn.sphere('beacon', 0.07, loc=G(bx, -cd / 2, ch + 0.07), m=pmat('dome', '#c03030', 0.2, 0.0, emit='#ff3a2a', emit_strength=0.6), scale=(1, 1, 0.9)))
        a = t * 2 * math.pi
        o.append(mn.box('beam', (0.05, 0.11, 0.06), loc=(bx + 0.05 * math.cos(a), cd / 2 + 0.05 * math.sin(a), ch + 0.05), m=glow('beam', '#ff5040', 1.5), bevel=0.01, rot=(0, 0, a)))
    if state == 'broken':
        o.append(gbox('scorch', x0 + 0.02, -0.012, x1 - 0.1, 0.001, 0.9, 1.5, M['scorch'], 0.0))
        if t < 0.5:
            for (sx, sy, sz) in ((x1 - 0.1, 0.06, 1.3), (x1 - 0.06, 0.12, 1.22), (x1 - 0.15, 0.1, 1.4), (x1 - 0.12, 0.18, 1.18)):
                o.append(mn.sphere('spark', 0.022, loc=G(sx, sy, sz), m=glow('spark', '#ffc860', 1.5), segs=8))
        o.append(pipe('wire', [G(x1 - 0.1, 0.03, 1.35), G(x1 - 0.06, 0.12, 1.2), G(x1 - 0.12, 0.15, 1.05)], 0.012, m=M['cables'][0], corner=0.05))
    return o, hold

def panels(S, M, open_k, state='ok', side=0):
    """The two panels at openness open_k. state: ok | locked | blast | forced | broken."""
    o = []
    L = S.L; half = L / 2
    blast = state == 'blast'
    pt = (S.slot - 0.02) if blast else S.pt
    ph = S.ph + (0.06 if blast else 0)
    ext = half * (1 - open_k)                   # how far each panel sticks out of its jamb
    plen = half + 1.2
    cap_m = M['red'] if state == 'locked' else M['yellow']
    for s in (0, 1):
        if ext < 0.004: break
        if s == 0: ya, yb = ext - plen, ext      # north panel: leading edge at y = ext
        else: ya, yb = L - ext, L - ext + plen   # south panel: leading edge at y = L - ext
        bent = state in ('forced', 'broken') and s == (0 if state == 'forced' else 1)
        mat = M['blast'] if blast else (M['door'] if s == 0 else M['door2'])
        if S.kind == 'hatch' and not blast: mat = M['door2'] if s == 0 else M['door']
        objs = [gbox('panel', -pt / 2, ya, pt / 2, yb, 0.02, ph, mat, 0.03)]
        # top: groove, ribs, bolts
        lead = yb if s == 0 else ya
        dirn = -1 if s == 0 else 1               # from the leading edge back into the panel
        objs.append(gbox('groove', -0.02, min(lead, lead + dirn * 1.0), 0.02, max(lead, lead + dirn * 1.0), ph, ph + 0.004, M['dark'], 0.0))
        for k in range(3):
            yy = lead + dirn * (0.3 + 0.35 * k)
            objs.append(rivet(-pt / 2 + 0.045, yy, ph, M, r=0.018)); objs.append(rivet(pt / 2 - 0.045, yy, ph, M, r=0.018))
        if blast:
            objs.append(gbox('bl_top', -pt / 2 + 0.03, min(lead, lead + dirn * 1.3), pt / 2 - 0.03, max(lead, lead + dirn * 1.3), ph, ph + 0.012, M['hazard_big'], 0.004))
            for k in range(4):
                yy = lead + dirn * (0.15 + 0.3 * k)
                objs.append(gbox('bl_rib', -pt / 2 - 0.01, yy - 0.03, pt / 2 + 0.01, yy + 0.03, ph * 0.3, ph + 0.02, M['steel'], 0.012))
        elif S.kind == 'hatch':
            objs.append(gbox('h_top', -pt / 2 + 0.03, min(lead, lead + dirn * 0.28), pt / 2 - 0.03, max(lead, lead + dirn * 0.28), ph, ph + 0.012, M['hazard_big'], 0.004))
            objs.append(gbox('h_rib', -0.05, min(lead + dirn * 0.3, lead + dirn * 1.0), 0.05, max(lead + dirn * 0.3, lead + dirn * 1.0), ph, ph + 0.05, M['steel'], 0.015))
            for k in range(2):
                yy = lead + dirn * (0.45 + 0.35 * k)
                objs.append(gbox('h_cross', -pt / 2 + 0.04, yy - 0.025, pt / 2 - 0.04, yy + 0.025, ph, ph + 0.04, M['steel'], 0.012))
        # leading edge cap on top (yellow; red when locked), like the game's bar at the meeting edge
        objs.append(gbox('cap', -pt / 2 - 0.005, min(lead, lead + dirn * 0.1), pt / 2 + 0.005, max(lead, lead + dirn * 0.1), ph - 0.06, ph + 0.016, cap_m if not blast else M['ink'], 0.012))
        # leading face (only the north panel's faces the camera): rubber seal + hazard stripes
        if s == 0:
            objs.append(gbox('seal', -pt / 2 + 0.01, lead - 0.01, pt / 2 - 0.01, lead + 0.025, 0.04, ph - 0.07, M['rubber'], 0.01))
            objs.append(gbox('face_hz', -pt / 2 + 0.03, lead + 0.02, pt / 2 - 0.03, lead + 0.032, 0.1, ph - 0.12, M['hazard_big' if blast else 'hazard'], 0.004))
            if state == 'locked':
                objs.append(gbox('lockbar', -pt / 2 + 0.02, lead + 0.03, pt / 2 - 0.02, lead + 0.05, 0.7, 0.85, glow('lockglow', '#ff4a3a', 1.0), 0.005))
        if bent:                                 # dented, scraped, a bit twisted
            for (dy, dz) in ((0.25, 0.5), (0.45, 1.0)):
                objs.append(gbox('dent', -pt / 2 - 0.004, lead + dirn * dy - 0.06, pt / 2 + 0.004, lead + dirn * dy + 0.06, ph - 0.01, ph + 0.004, M['scorch'], 0.0))
            for ob in objs:
                ob.rotation_euler.z += math.radians(-3 if s == 0 else 4)
                ob.location.x += 0.02 * (1 if s == 0 else -1)
        o += objs
    if state == 'forced':                         # the crowbar that did it, wedged in the gap
        cy = half * (1 - open_k) + 0.12
        o.append(pipe('crowbar', [G(0.05, cy - 0.05, 0.6), G(0.0, cy + 0.25, 1.15), G(0.08, cy + 0.42, 1.25)], 0.025, m=M['red'], corner=0.08))
    if state == 'broken':                         # duct tape across the seam, an OUT OF ORDER sticker
        o.append(tape_strip(0.0, half - 0.08, ph + 0.018, pt + 0.12, 70, M))
        o.append(tape_strip(0.0, half + 0.08, ph + 0.018, pt + 0.12, 110, M))
        o.append(mn.box('sticker', (0.14, 0.16, 0.004), loc=G(0.0, half + 0.35, ph + 0.012), m=pmat('sticker', '#f2df6b', 0.6), bevel=0.002, rot=(0, 0, 0.15)))
    return o

def door_window(S, name, frames=None, extra=None):
    # x: collar width (plus a little); y: from the north jamb's last 0.6 (+ tray) to the south collar
    cw = 0.46875 if S.kind == 'door' else 0.5
    win(name, -cw, cw, -S.cdeep - 0.6, S.L + S.cdeep, H_FULL + 0.3, origin=(0.0, 0.0), zmin=0.0,
        frames=frames, extra=extra)

def render_frame(S, name, side, state, frames_t=None):
    if frames_t is None:
        mn.reset(); M = mats()
        o, hold = frame(S, M, side, state)
        mn.outline(o, thickness=0.012)
        door_window(S, name, extra={'note': NOTE[S.kind]})
        return
    for i, t in enumerate(frames_t):
        mn.reset(); M = mats()
        o, hold = frame(S, M, side, state, t)
        mn.outline(o, thickness=0.012)
        door_window(S, f'{name}_f{i}', extra={'note': NOTE[S.kind], 'loop': len(frames_t)})

def render_panels(S, name, side, state, k):
    mn.reset(); M = mats()
    o, hold = frame(S, M, side, 'ok')
    keep = set(hold)
    for x in o:                                  # the jambs and collars cut the panels; everything else goes
        if x in keep: continue
        bpy.data.objects.remove(x)
    p = panels(S, M, k, state, side)
    mn.outline(p, thickness=0.012)
    holdout(hold)
    door_window(S, name, extra={'note': NOTE[S.kind] + ' Panels: rendered with the jambs as holdout; draw over the frame.', 'open': k})

NOTE = {'door': 'doorway in an up-down wall (DOORWAYS); origin = wall centre x, north end of the opening (d.y), floor',
        'hatch': 'outer airlock hatch from the inside (HATCHES); origin = wall centre x (h.x - h.dir*0.3), h.y - 0.9, floor'}

if __name__ == '__main__':
    only = os.environ.get('MN_ONLY', '')
    def want(n): return not only or only in n
    D = Spec('door')
    if want('interior/door_v_frame'):
        render_frame(D, 'interior/door_v_frame', 0, 'ok')
        render_frame(D, 'interior/door_v_frame_locked', 0, 'locked')
        render_frame(D, 'interior/door_v_frame_blast', 0, 'blast', [0, 0.25, 0.5, 0.75])
    for state, nm in (('ok', 'door_v'), ('locked', 'door_v_locked'), ('blast', 'door_v_blast')):
        for i, k in enumerate(OPEN):
            if want(f'interior/{nm}_f{i}'): render_panels(D, f'interior/{nm}_f{i}', 0, state, k)
    if want('interior/door_v_forced'): render_panels(D, 'interior/door_v_forced', 0, 'forced', 0.65)
    Hs = Spec('hatch')
    for side, sn in ((-1, 'port'), (1, 'star')):
        if want(f'interior/hatch_{sn}_frame'):
            render_frame(Hs, f'interior/hatch_{sn}_frame', side, 'ok')
            render_frame(Hs, f'interior/hatch_{sn}_frame_locked', side, 'locked')
            render_frame(Hs, f'interior/hatch_{sn}_frame_broken', side, 'broken', [0.0, 0.75])
        for i, k in enumerate(OPEN):
            if want(f'interior/hatch_{sn}_f{i}'): render_panels(Hs, f'interior/hatch_{sn}_f{i}', side, 'ok', k)
        if want(f'interior/hatch_{sn}_locked'): render_panels(Hs, f'interior/hatch_{sn}_locked', side, 'locked', 0.0)
        if want(f'interior/hatch_{sn}_broken'): render_panels(Hs, f'interior/hatch_{sn}_broken', side, 'broken', 0.03)
