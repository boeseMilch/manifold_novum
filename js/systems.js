// Ship systems: energy (reactor, distribution lever, capacitors), breakable parts and
// repairs, the inventory (weapon slot + item slot) with items lying around, and the
// hand weapons (laser gun, heavy blaster, wrench toss). Units: layout units.

const CELL_ENERGY = 5, ENERGY_TIME = 20, REPAIR_TIME = 5;
// One colour for everything that is energy / power (cables, capacitors, fuel cells, the HUD's energy readouts),
// and one for "you can use this": white (the rings round interactables, prompts and tooltips).
const POWER_COL = '#ffd84a', POWER_RGB = '255,216,74';
const USE_COL = '#ffffff', USE_RGB = '255,255,255';
let SHOTS_PER_ENERGY = 3;                              // (ship upgrades: see progress.js)
// Power lever: its position is the capacitor index it feeds (port, middle, starboard). Auto mode steps
// on and wraps: mid → stbd → port → mid. Each position points exactly at the gland its branch leaves the
// dial by (POWER_ROUTES): LEFT out of the left side, MID out of the top (up to the middle capacitor by the
// cat), RIGHT out of the right side; the trunk from the reactor comes in from the NNW, between LEFT and MID.
const LEVER_NAMES = ['LEFT', 'MID', 'RIGHT'];
const LEVER = { x: 22.2, y: 22.75 }, LEVER_HUB = 0.22;
const LEVER_ANGLES = [-180, -90, 0].map(d => d * Math.PI / 180), LEVER_TRUNK_ANGLE = -125 * Math.PI / 180;
const leverAngle = (i) => LEVER_ANGLES[i];
// the handle sprite's frames (tools/blender/models/systems/lever.py): from LEFT, LEVER_HANDLE_STEP apart towards RIGHT
const LEVER_HANDLE_STEP = 10 * Math.PI / 180, LEVER_HANDLE_FRAMES = 19, LEVER_HANDLE_DIR = Math.sign(LEVER_ANGLES[2] - LEVER_ANGLES[0]);
const FUEL_CRATE = { x: 17.4, y: 19.6 };
const REACH = 1.9;                                // how far you can reach to click things
const LASER_COOLDOWN = 0.9, WRENCH_COOLDOWN = 8, BOLT_SPEED = 26, WRENCH_SPEED = 13;
// Heavy blaster (weapons specialist gear): slower shots of 1-2 damage; hold to charge a 3-damage blast
// (outside it also flies on as a cannon shell). Carrying it slows you a bit, charging a lot.
const BLASTER_COOLDOWN = LASER_COOLDOWN / 0.66, BLASTER_CHARGE = 1.5, BLASTER_SLOW_AFTER = 0.2;
const BLASTER_CARRY_SPEED = 0.85, BLASTER_CHARGE_SPEED = 0.3;
const OVERCHARGE_FIRE = 0.1;                      // overcharged reactor: chance per energy that it catches fire
// How fast the reactor runs: 1/paceFactor() (js/mission.js: the mission's pace times the crew-size curve;
// the encounters come that much faster or slower, so the energy per gap between encounters stays the
// same), doubled while overcharged.
const reactorSpeed = () => (power.overcharge ? 2 : 1) / paceFactor();

const power = {
  reactor: { fuel: CELL_ENERGY, t: 0 },          // energy left in the loaded cell, progress to the next one
  reserve: 3,                                     // spare fuel cells in the crate
  lever: { pos: 1, jammed: false, angle: 0 },     // starts on MID; jammed = a wrench wedged in front of the handle
  bolts: [],                                      // energy travelling from the reactor to a capacitor
  pulses: [],                                     // energy travelling from a capacitor to what used it
  patch: [0, 1, 2],                               // patch board: lever output → capacitor it feeds
  overcharge: false,                              // an engineer overcharged it: double speed, may catch fire
};
// How full the loaded cell still is, 0..1, in whole energies (energy is discrete: one bar per energy left).
const fuelFraction = (R = power.reactor) => Math.max(0, Math.min(1, R.fuel / CELL_ENERGY));
let inv = { weapon: null, item: null, cd: 0 };     // the acting crew member's inventory (see withCrew)
const ITEMS = [
  { kind: 'repair', x: 1.6, y: 22.35 },          // the one repair kit, bottom left
  { kind: 'laser', x: 42.4, y: 22.4 },
  { kind: 'extinguisher', x: 15.3, y: 2.2 },     // bridge
  { kind: 'extinguisher', x: 31.7, y: 3.8 },     // starboard cannon room
];
const ITEM_NAMES = { repair: 'repair kit', laser: 'laser gun', heavy: 'heavy blaster', fuel: 'fuel cell', extinguisher: 'fire extinguisher', plate: 'hull plate',
                     coolant: 'coolant canister', blackbox: 'black box', drill: 'mining drill', ore: 'ore sample' };
const WEAPONS = new Set(['repair', 'laser', 'heavy', 'extinguisher', 'drill']);
const slotOf = (kind) => WEAPONS.has(kind) ? 'weapon' : 'item';

// ---------------------------------------------------------------------------
// Breakable systems. col: which zone column a hit on that side damages.
// ---------------------------------------------------------------------------
const SYSTEMS = [
  ...GUNS.map(g => ({ kind: 'cannon', ref: g, col: { front: 1, port: 0, star: 2 }[g.id], x: g.hatch[0], y: g.hatch[1], name: g.name })),
  ...SHIELD_BUTTONS.map(b => ({ kind: 'shield', ref: b, col: SIDE_CAP[b.side], x: b.x, y: b.y, name: `${SIDE_LABEL[b.side]} shield button` })),
  ...CAPACITORS.map((c, i) => ({ kind: 'capacitor', ref: c, col: i, x: c.x, y: c.y, name: `${['Left', 'Middle', 'Right'][i]} capacitor` })),
  { kind: 'reactor', ref: REACTOR, col: 1, x: REACTOR.x, y: REACTOR.y, name: 'Reactor', r: 1.9 },
  { kind: 'lever', ref: LEVER, col: 1, x: LEVER.x, y: LEVER.y, name: 'Power lever' },
  ...DECK_LOCKS.map(L => ({ kind: 'lock', ref: L, col: L.col, x: L.x + L.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2, name: `${['Left', 'Middle', 'Right'][L.col]} deck airlock`, r: 2.4 })),
  ...HATCHES.map(h => ({ kind: 'hatch', ref: h, col: h.side === 'port' ? 0 : 2, x: h.inside[0] - h.dir * 0.4, y: h.inside[1], name: `${h.side === 'port' ? 'Left' : 'Right'} outer airlock` })),
  // outside on the hull (outside: no fires in vacuum, no inside repair, no saboteur; fixed on a spacewalk)
  ...SHIELD_EMITTERS.map(e => ({ kind: 'emitter', ref: e, col: SIDE_CAP[e.side], x: e.x, y: e.y, name: `${SIDE_LABEL[e.side]} shield emitter`, r: 0.7, outside: true })),
].map(s => ({ ...s, broken: false, r: s.r || 1.0 }));
const broken = (ref) => !!SYSTEMS.find(s => s.ref === ref)?.broken;

function breakSystem(s) {
  s.broken = true;
  sfx.spark(); sfx.clank();
  combatBanner(`${s.name} broken!`);
  for (let i = 0; i < 14; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, i % 2 ? '#ffb347' : '#6a6f7a', 0.12);
  combatFlip('fx/hit_spark', s.x, s.y, 1.4);
}
// Hits on the hull damage systems in the zone column that was hit.
function damageColumn(side, large) {
  const col = side === 'port' ? 0 : side === 'star' ? 2 : 1;
  const intact = SYSTEMS.filter(s => s.col === col && !s.broken);
  const n = large ? 1 : 0;                       // big hits: exactly one part (plus a fire: mission.js bigHitFire)
  for (let i = 0; i < n && intact.length; i++) breakSystem(intact.splice(Math.floor(Math.random() * intact.length), 1)[0]);
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------
const capBroken = (i) => broken(CAPACITORS[i]);
// line: the power line the energy leaves through (a pulse runs along it to the consumer)
function useEnergy(i, line) {
  const c = CAPACITORS[i];
  if (capBroken(i) || c.charge <= 0) return false;
  c.charge--;
  if (line) power.pulses.push({ line, t: 0 });
  return true;
}

// ---------------------------------------------------------------------------
// Power lines: the cables actually carry the energy. One trunk from the reactor into the power lever,
// from the lever a branch to each capacitor (feed0..2: LEFT / MID / RIGHT), and from each capacitor a
// line to its shield button and its cannon. A line glows while its capacitor holds charge (the trunk and
// the branches: while the reactor runs); energy runs along it as a pulse when it's delivered or used.
// Each line's route starts and ends in a fitting (POWER_FITTINGS; sprites power/*, drawn in js/cables.js):
//   plug  a socket on a machine's face (capacitor cabinets, the reactor, the shield buttons)
//   gland a cable gland at the foot of the power lever's dial (the trunk in, the three branches out)
//   box   a conduit box on a wall where the cable goes in;  riser: one on a lower-deck back wall whose
//         conduit climbs into the spine (the line comes out of a box on the upper deck's near wall)
// (x, y): the point on the face / wall at floor level, a: the way the cable leaves it. The cable starts
// REACH from it. 'hide' in a route: the next stretch runs inside the walls (not drawn, and no length: a
// pulse jumps through it, so linePoint(l, 0.5), the splice spot for surges, is always on the floor).
// The cannon lines end in a box on the room wall next to their cannon; outside, a jack (power/jack_*)
// carries them on to the cannon's mount.
// ---------------------------------------------------------------------------
const FIT_REACH = { plug: 0.40, box: 0.48, riser: 0.48, gland: 0.22 };
const COMPASS = { E: 0, SE: 0.25, S: 0.5, SW: 0.75, W: 1, NW: -0.75, N: -0.5, NE: -0.25 };
const powerFit = (kind, x, y, dir) => ({ kind, x, y, a: COMPASS[dir] * Math.PI });   // dir: compass on screen (N = up)
// A gland on the lever dial's rim (r LEVER_DIAL), facing out at angle a.
const LEVER_DIAL = 0.5;
const leverPort = (a) => ({ kind: 'gland', x: LEVER.x + Math.cos(a) * LEVER_DIAL, y: LEVER.y + Math.sin(a) * LEVER_DIAL, a });
const POWER_ROUTES = [
  // the trunk: out of the reactor's front, down into the lever from the NNW (no capacitor: cap -1; it never arcs)
  { id: 'trunk', cap: -1, feed: true, route: [powerFit('plug', 21.5, 20.6, 'S'), leverPort(LEVER_TRUNK_ANGLE)] },
  // the lever's three outputs, each out of the gland its position points at: LEFT out of the left side (to the
  // left airlock), MID out of the top and up past the reactor's right side to the middle capacitor (back wall,
  // by the cat), RIGHT out of the right side (over to the right airlock)
  { id: 'feed0', cap: 0, feed: true, route: [leverPort(leverAngle(0)), [20.9, 22.75], [18.6, 21.5], [16.2, 20.8], [13.9, 19.4], [11.0, 20.6], [8.6, 21.5], powerFit('plug', 7.48, 22.6, 'E')] },
  { id: 'feed1', cap: 1, feed: true, route: [leverPort(leverAngle(1)), [22.3, 21.45], [24.7, 21.25], [25.25, 20.0], [25.25, 16.6], powerFit('plug', 26.12, 15.85, 'W')] },
  { id: 'feed2', cap: 2, feed: true, route: [leverPort(leverAngle(2)), [25.8, 22.65], [28.9, 20.9], [30.5, 19.6], [33.5, 20.6], [35.2, 21.5], [35.55, 23.2], powerFit('plug', 36.72, 23.2, 'W')] },
  { id: 'shield_port', cap: 0, route: [powerFit('plug', 5.72, 22.35, 'W'), [5.1, 21.2], [5.4, 16.4], powerFit('plug', 6.6, 15.4, 'W')] },
  // the middle capacitor's lines: the front shield's along the back wall to its button, the front cannon's into
  // a riser right beside the cabinet (up through the spine to the upper deck)
  { id: 'shield_front', cap: 1, route: [powerFit('plug', 26.12, 15.45, 'W'), powerFit('plug', 22.6, 15.4, 'E')] },
  { id: 'shield_star', cap: 2, route: [powerFit('plug', 36.72, 22.8, 'W'), [36.05, 21.8], [36.05, 16.4], powerFit('plug', 36.8, 15.4, 'W')] },
  { id: 'gun_port', cap: 0, route: [powerFit('plug', 5.72, 22.85, 'W'), [3.4, 21.8], [2.5, 18.6], powerFit('riser', 2.5, 15.0, 'S'), 'hide',
                                    powerFit('box', 2.5, 11.5, 'N'), [2.4, 7.2], [1.6, 5.95], powerFit('box', 0.6, 5.95, 'E')] },
  { id: 'gun_front', cap: 1, route: [powerFit('plug', 27.88, 15.65, 'E'), powerFit('riser', 28.9, 15.0, 'S'), 'hide',
                                     powerFit('box', 28.4, 11.5, 'N'), [28.4, 6.0], [27.2, 1.6], [25.6, 0.3], [24.2, -0.9], powerFit('box', 24.2, -2.4, 'S')] },
  { id: 'gun_star', cap: 2, route: [powerFit('plug', 38.48, 23.0, 'E'), [41.6, 21.6], [42.6, 18.2], [43.35, 16.4], powerFit('riser', 43.35, 15.0, 'S'), 'hide',
                                    powerFit('box', 42.35, 11.5, 'N'), [42.35, 7.0], [42.8, 5.75], powerFit('box', 43.8, 5.75, 'W')] },
];
const POWER_FITTINGS = [];
// Rounded corners (radius r) on a polyline, so the cable bends instead of kinking.
function filletPath(P, r = 0.35, steps = 5) {
  if (P.length < 3) return P.slice();
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const [a, b, c] = [P[i - 1], P[i], P[i + 1]];
    const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, l1 * 0.45, l2 * 0.45);
    if (k < 0.01) { out.push(b); continue; }
    const p1 = [b[0] + (a[0] - b[0]) / l1 * k, b[1] + (a[1] - b[1]) / l1 * k], p2 = [b[0] + (c[0] - b[0]) / l2 * k, b[1] + (c[1] - b[1]) / l2 * k];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, u = 1 - t;
      out.push([p1[0] * u * u + b[0] * 2 * t * u + p2[0] * t * t, p1[1] * u * u + b[1] * 2 * t * u + p2[1] * t * t]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const POWER_LINES = POWER_ROUTES.map(l => {
  // runs: the visible stretches between 'hide's; each starts and ends REACH out of its fittings, with a short
  // straight lead out of the fitting before the first bend
  const runs = [[]], fits = [];
  for (const it of l.route) {
    if (it === 'hide') { runs.push([]); continue; }
    const run = runs[runs.length - 1];
    if (Array.isArray(it)) { run.push(it); continue; }
    const r = FIT_REACH[it.kind], dx = Math.cos(it.a), dy = Math.sin(it.a);
    const exit = [it.x + dx * r, it.y + dy * r], lead = [it.x + dx * (r + 0.15), it.y + dy * (r + 0.15)];
    if (run.length) run.push(lead, exit); else run.push(exit, lead);
    fits.push({ ...it, line: l.id, cap: l.cap, feed: !!l.feed });
  }
  const smooth = runs.map(r => filletPath(r));
  const pts = [], hidden = [];                        // hidden[i]: the segment pts[i-1] → pts[i] runs inside a wall
  smooth.forEach((r, j) => r.forEach((p, i) => { pts.push(p); hidden.push(j > 0 && i === 0); }));
  let len = 0; const seg = [0];
  for (let i = 1; i < pts.length; i++) { if (!hidden[i]) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(len); }
  POWER_FITTINGS.push(...fits);
  return { id: l.id, cap: l.cap, feed: l.feed, pts, runs: smooth, hidden, len, seg };
});
const LINE = Object.fromEntries(POWER_LINES.map(l => [l.id, l]));
// Point at fraction k (0..1) along a power line, by the length of its visible stretches (the bits inside the
// walls take no time).
function linePoint(l, k) {
  const d = clamp(k, 0, 1) * l.len;
  let i = 1; while (i < l.seg.length - 1 && (l.seg[i] < d || l.hidden[i])) i++;
  const q = (d - l.seg[i - 1]) / ((l.seg[i] - l.seg[i - 1]) || 1);
  return [lerp(l.pts[i - 1][0], l.pts[i][0], q), lerp(l.pts[i - 1][1], l.pts[i][1], q)];
}
// With sprites (GFX on) the energy running along a live cable glows in the unlit 'glow' layer (still under
// the crew), clipped to the floors so it doesn't show over the walls and the spine.
function floorClip(g) {                               // clip g (world transform set) to the floors, minus the strip the near walls' tops cover
  if (!(GFX.on && typeof WALLS !== 'undefined' && WALLS)) return;
  g.beginPath(); for (const r of [...ROOM_RECTS, ...DOORWAYS]) g.rect(L(r.x), L(r.y), L(r.w), L(r.h)); g.clip();
  const lift = GFX.lift(H_LOW), near = WALLS.hRuns.filter(h => h.kind === 'near');
  g.beginPath(); g.rect(L(-50), L(-50), L(150), L(150));
  for (const h of near) g.rect(L(h.x0), L(h.y - lift), L(h.x1 - h.x0), L(lift));
  g.clip('evenodd');
}
// Dead (dark red): its capacitor is broken; the trunk (cap -1): the reactor is.
const lineDead = (l) => (l.cap >= 0 ? capBroken(l.cap) : broken(REACTOR));
// The branch the next energy takes: the lever's (shown) output, through the patch board.
const nextFeed = () => power.patch[leverShownPos()];
// A line's look: 'dead' (dark red), 'live' (amber, self-lit, energy flowing along it), 'idle' (a branch the
// lever isn't on: powered but dimmed, so the lit path reactor → lever → branch reads at a glance), 'off'
// (no fuel / an empty capacitor).
function lineState(l) {
  if (lineDead(l)) return 'dead';
  if (l.feed) {
    if (!(power.reactor.fuel > 0) || broken(REACTOR)) return 'off';
    return l.cap < 0 || l.cap === nextFeed() ? 'live' : 'idle';
  }
  return CAPACITORS[l.cap].charge > 0 ? 'live' : 'off';
}
const powerLineLive = (l) => lineState(l) === 'live';
// GFX on: js/cables.js (lit 3D cables, Blender fittings). Classic: flat strokes along the visible stretches,
// a small box for each fitting, clamps along the way.
function drawPowerLines(t) {
  if (GFX.on && typeof drawCables3d === 'function' && drawCables3d(t)) return;
  for (const l of POWER_LINES) {
    const st = lineState(l), dead = st === 'dead', live = st === 'live';
    for (const run of l.runs) {
      const path = () => { ctx.beginPath(); run.forEach(([x, y], i) => (i ? ctx.lineTo(L(x), L(y)) : ctx.moveTo(L(x), L(y)))); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      path(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 11; ctx.save(); ctx.translate(2, 3); ctx.stroke(); ctx.restore();
      path(); ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke();
      path(); ctx.strokeStyle = dead ? '#5a2a26' : live ? '#b8902e' : st === 'idle' ? '#5e5236' : '#4a4a44'; ctx.lineWidth = 6; ctx.stroke();
      if (live) {                                     // energy flowing (slowly) towards the far end
        ctx.setLineDash([3, 14]); ctx.lineDashOffset = -t * 18;
        path(); ctx.strokeStyle = 'rgba(255,236,160,0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
        if (l.feed) feedPulse(t);
        ctx.setLineDash([]);
      }
    }
    for (let d = 2.5; d < l.len - 1; d += 3.5) {        // clamps
      const [x, y] = linePoint(l, d / l.len);
      rr(L(x) - 4, L(y) - 4, 8, 8, 2); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.2);
    }
  }
  for (const f of POWER_FITTINGS) {                     // where it plugs in / goes into the wall
    const live = powerLineLive(LINE[f.line]), r = FIT_REACH[f.kind];
    ctx.save(); ctx.translate(L(f.x), L(f.y)); ctx.rotate(f.a);
    rr(0, -8, r * T * 0.6, 16, 3); ctx.fillStyle = f.kind === 'plug' ? '#3a3f4a' : '#4a8090'; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.arc(5, -3, 2.5, 0, TAU); ctx.fillStyle = live ? '#ffd27a' : '#2b303a'; ctx.fill();
    ctx.restore();
  }
}
// GFX on: the energy on the live cables, glowing (in the 'glow' layer: unlit, under the crew) on the cable's
// indicator window.
// The lit feed path (the trunk and the branch the lever is on) gets a soft, slower pulse over its dashes, so
// where the next energy goes stands out from the shield / cannon lines. Strokes the current path.
function feedPulse(t) {
  ctx.setLineDash([16, 44]); ctx.lineDashOffset = -t * 30;
  ctx.strokeStyle = 'rgba(255,214,120,0.32)'; ctx.lineWidth = 6; ctx.stroke();
}
function drawPowerGlow(t) {
  ctx.save(); floorClip(ctx);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const l of POWER_LINES) {
    if (!powerLineLive(l)) continue;
    for (const run of l.runs) {
      ctx.beginPath(); run.forEach(([x, y], i) => (i ? ctx.lineTo(L(x), L(y)) : ctx.moveTo(L(x), L(y))));
      ctx.setLineDash([3, 14]); ctx.lineDashOffset = -t * 18;
      ctx.strokeStyle = 'rgba(255,240,190,0.85)'; ctx.lineWidth = 2; ctx.stroke();
      if (l.feed) feedPulse(t);                      // the way the next energy goes: a soft, slow pulse on top
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
function deliverEnergy() {
  const i = power.patch[power.lever.pos];
  if (typeof surging === 'function' && surging('feed' + i)) {          // an arcing feed line: the energy is lost on the way
    combatBanner(`Energy lost — the ${lineName(LINE['feed' + i])} is arcing`); sfx.spark();
  } else power.bolts.push({ to: i, out: power.lever.pos, t: 0 });
  if (!power.lever.jammed && !broken(LEVER)) power.lever.pos = (power.lever.pos + 1) % 3;
}
// A delivery bolt's way (it takes the same 0.9 s as ever, eased): down the trunk, through the lever's hub,
// out along the branch to its capacitor (feed<to>; the patch board picks which). Returns [x, y] at progress t.
const BOLT_TIME = 0.9;
function boltPoint(b, t = b.t) {
  const T = LINE.trunk, F = LINE['feed' + b.to];
  if (!F) return null;
  const k = clamp(t, 0, 1), e = k * k * (3 - 2 * k);
  const tEnd = T.pts[T.pts.length - 1], fStart = F.pts[0];
  const h1 = Math.hypot(LEVER.x - tEnd[0], LEVER.y - tEnd[1]), h2 = Math.hypot(fStart[0] - LEVER.x, fStart[1] - LEVER.y);
  let d = e * (T.len + h1 + h2 + F.len);
  if (d <= T.len) return linePoint(T, d / T.len);
  d -= T.len;
  if (d <= h1) return [lerp(tEnd[0], LEVER.x, d / h1), lerp(tEnd[1], LEVER.y, d / h1)];
  d -= h1;
  if (d <= h2) return [lerp(LEVER.x, fStart[0], d / h2), lerp(LEVER.y, fStart[1], d / h2)];
  return linePoint(F, (d - h2) / F.len);
}
// Progress at which a bolt passes the lever's hub.
function boltAtLever(b) {
  const T = LINE.trunk, F = LINE['feed' + b.to];
  if (!F) return 0;
  const tEnd = T.pts[T.pts.length - 1], fStart = F.pts[0];
  const h1 = Math.hypot(LEVER.x - tEnd[0], LEVER.y - tEnd[1]), h2 = Math.hypot(fStart[0] - LEVER.x, fStart[1] - LEVER.y);
  const e = (T.len + h1) / (T.len + h1 + h2 + F.len);       // eased fraction → invert smoothstep (bisection)
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; (m * m * (3 - 2 * m) < e ? (lo = m) : (hi = m)); }
  return lo;
}
// What the lever shows: while a delivery is on its way, the output it left by (the lever has already stepped
// on in the game state; the handle, its lamp and the lit path follow once the energy has arrived), so the
// bolt runs along the lit path the handle points at; else its position.
function leverShownPos() {
  for (const b of power.bolts) if (!b.done && b.out !== undefined) return b.out;
  return power.lever.pos;
}
function updatePower(dt) {
  const R = power.reactor;
  updateInserter(dt);
  if (power.overcharge && broken(REACTOR)) power.overcharge = false;
  if (R.fuel > 0 && !broken(REACTOR) && !(enc.scram > 0)) {
    R.t += dt * reactorSpeed();
    if (R.t >= ENERGY_TIME) {
      R.t = 0; R.fuel--; deliverEnergy();
      if (power.overcharge && Math.random() < OVERCHARGE_FIRE) igniteSystem(SYSTEMS.find(s => s.ref === REACTOR));
    }
  }
  for (const b of power.bolts) {
    b.t += dt / BOLT_TIME;
    if (b.t >= 1 && !b.done) {
      b.done = true;
      const c = CAPACITORS[b.to];
      if (capBroken(b.to) || c.charge >= CAP_MAX) {                  // full or broken: wasted
        for (let k = 0; k < 10; k++) combatFx(c.x, c.y - 0.3, (Math.random() - 0.5) * 3, -Math.random() * 3, 0.8, POWER_COL, 0.1);
        if (capBroken(b.to)) combatBanner(`Energy wasted — the ${['left', 'middle', 'right'][b.to]} capacitor is broken`);   // (full: the sparks show it, no banner)
      } else { c.charge++; c.pulse = 1; sfx.poi(); }
    }
  }
  power.bolts = power.bolts.filter(b => b.t < 1.2);
  for (const p of power.pulses) p.t += dt / 0.7;
  power.pulses = power.pulses.filter(p => p.t < 1);
  for (const c of CAPACITORS) c.pulse = Math.max(0, (c.pulse || 0) - dt * 2);
  const target = leverAngle(leverShownPos());                            // handle points at the active output
  power.lever.angle = lerp(power.lever.angle || target, target, 1 - Math.exp(-10 * dt));
}

// ---------------------------------------------------------------------------
// Inventory and clicking things
// ---------------------------------------------------------------------------
function grab(kind) {
  const slot = slotOf(kind);
  if (inv[slot]) ITEMS.push({ kind: inv[slot], ...dropSpot(player.x + (Math.random() - 0.5) * 0.4, player.y + 0.35) });   // drop what you had
  inv[slot] = kind; sfx.clank();
}
// Somewhere on a fixed floor (a room or an airlock chamber), so a dropped item never ends
// up somewhere unreachable like a doorway, and never inside a crate or furniture (SOLIDS).
function dropSpot(x, y) {
  const floors = [...ROOM_RECTS, ...DECK_LOCKS.map(Lk => Lk.chamber), ...(typeof dockRects === 'function' ? dockRects() : [])];
  const free = (px, py) => floors.some(q => inRect(px, py, q, -0.3)) && !SOLIDS.some(S => inRect(px, py, S, CREW_R + 0.05));
  let best = null, bd = Infinity;
  if (floors.some(q => inRect(x, y, q, -0.3))) best = { x, y };
  else for (const q of floors) {
    const px = clamp(x, q.x + 0.5, q.x + q.w - 0.5), py = clamp(y, q.y + 0.5, q.y + q.h - 0.5), d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  const p = nearestFree(best.x, best.y, free);       // (null: already free)
  return p ? { x: p[0], y: p[1] } : best;
}
const near = (x, y, r = REACH) => Math.hypot(player.x - x, player.y - y) <= r;

// What a left click on (mx, my) would do. Returns { text, ok, run?, repair?, x, y, r }.
function clickTarget(mx, my) {
  // crew members you can treat (or yourself, when you're down)
  for (const c of crew) {
    if (Math.hypot(mx - c.x, my - c.y) > 0.55 || c.mode === 'gun') continue;
    const info = treatInfo(c);
    if (!info) continue;
    if (c !== player && Math.hypot(player.x - c.x, player.y - c.y) > REACH) return { text: `${c.name} needs help — get closer`, ok: false, x: c.x, y: c.y, r: 0.55 };
    return { text: `Hold click: ${info.label} (${info.time} s)`, ok: true, treat: c, time: info.time, x: c.x, y: c.y, r: 0.55 };
  }
  if (!standing(player)) return null;                                      // down: you can only patch yourself up
  if (player.mode === 'eva') return evaClickTarget(mx, my);
  if (player.mode !== 'inside') return null;
  // broken systems first
  const m = hazardClickTarget(mx, my) || dockClickTarget(mx, my) || encounterClickTarget(mx, my) || minigameClickTarget(mx, my) || missionClickTarget(mx, my);
  if (m) return m;
  for (const s of SYSTEMS) {
    if (!s.broken || Math.hypot(mx - s.x, my - s.y) > s.r) continue;
    if (s.outside) return { text: `${s.name} is broken — it's outside on the hull: repair it on a spacewalk`, ok: false, ...s };
    if (!near(s.x, s.y, REACH + s.r * 0.6)) return { text: `${s.name} is broken — get closer`, ok: false, ...s };
    if (burning(s)) return { text: `${s.name} is on fire — put the fire out before you can repair it`, ok: false, ...s };
    if (inv.weapon !== 'repair') return { text: `${s.name} is broken — needs the repair kit`, ok: false, ...s };
    return { text: `Hold click: repair the ${s.name.toLowerCase()} (${REPAIR_TIME} s)`, ok: true, repair: s, x: s.x, y: s.y, r: s.r };
  }
  for (const it of ITEMS) {
    if (Math.hypot(mx - it.x, my - it.y) > 0.45) continue;
    const swap = inv[slotOf(it.kind)] ? ` (drops your ${ITEM_NAMES[inv[slotOf(it.kind)]]})` : '';
    if (!near(it.x, it.y)) return { text: `${ITEM_NAMES[it.kind]} — get closer`, ok: false, x: it.x, y: it.y, r: 0.45 };
    return { text: `Click: take the ${ITEM_NAMES[it.kind]}${swap}`, ok: true, x: it.x, y: it.y, r: 0.45,
             run: () => { ITEMS.splice(ITEMS.indexOf(it), 1); grab(it.kind); } };
  }
  if (power.inserter && Math.hypot(mx - (FUEL_CRATE.x - 0.8), my - FUEL_CRATE.y) < 0.3) {   // the inserter: scooch the cells out of its reach (or back)
    const t = { x: FUEL_CRATE.x - 0.8, y: FUEL_CRATE.y, r: 0.3 };
    if (!near(t.x, t.y)) return { ...t, text: 'Inserter handle — get closer', ok: false };
    return { ...t, ok: true, text: power.inserter.on ? 'Click: switch the inserter off' : 'Click: switch the inserter on', run: () => { power.inserter.on = !power.inserter.on; sfx.clank(); } };
  }
  if (Math.hypot(mx - FUEL_CRATE.x, my - FUEL_CRATE.y) < 0.75) {
    const t = { x: FUEL_CRATE.x, y: FUEL_CRATE.y, r: 0.75 };
    if (!power.reserve) return { ...t, text: 'Fuel crate is empty', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Fuel crate — get closer', ok: false };
    return { ...t, text: `Click: take a fuel cell (${power.reserve} left${inv.item ? `, drops your ${ITEM_NAMES[inv.item]}` : ''})`, ok: true,
             run: () => { power.reserve--; grab('fuel'); } };
  }
  if (Math.hypot(mx - LEVER.x, my - LEVER.y) < LEVER_HUB) {          // the hub: wedge / pull the wrench
    const t = { x: LEVER.x, y: LEVER.y, r: LEVER_HUB + 0.05 };
    if (!near(t.x, t.y)) return { ...t, text: 'Power lever — get closer', ok: false };
    return { ...t, ok: true, eHold: leverEHold(), text: power.lever.jammed ? 'Click: pull the wrench out (lever steps on its own again)' : `Click: wedge the wrench in (locks the lever on ${LEVER_NAMES[power.lever.pos]})`,
             run: () => { power.lever.jammed = !power.lever.jammed; sfx.clank(); } };
  }
  if (Math.hypot(mx - LEVER.x, my - LEVER.y) < 0.6) {
    const t = { x: LEVER.x, y: LEVER.y, r: 0.6 };
    if (!near(t.x, t.y)) return { ...t, text: 'Power lever — get closer', ok: false };
    if (power.lever.jammed) return { ...t, text: 'The wrench blocks the lever (click the hub to pull it out)', ok: false };
    const nextPos = (power.lever.pos + 1) % 3;
    return { ...t, ok: true, eHold: leverEHold(), text: `Click: turn lever to ${LEVER_NAMES[nextPos]} (now ${LEVER_NAMES[power.lever.pos]})`,
             run: () => { power.lever.pos = nextPos; sfx.clank(); } };
  }
  const R = REACTOR;
  if (Math.abs(mx - R.x) < R.w / 2 && Math.abs(my - R.y) < R.h / 2) {
    const t = { x: R.x, y: R.y, r: 1.9 };
    const status = power.reactor.fuel ? `${power.reactor.fuel} energy left in the cell, next in ${Math.ceil((ENERGY_TIME - power.reactor.t) / reactorSpeed())} s` : 'out of fuel';
    const close = near(R.x, R.y, REACH + 1.4);
    if (inv.item === 'fuel' && !power.reactor.fuel) {
      if (!close) return { ...t, text: 'Reactor — get closer', ok: false };
      return { ...t, ok: true, text: 'Click: load the fuel cell', run: () => { inv.item = null; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); sfx.poi(); } };
    }
    if (inv.item === 'fuel' && power.reactor.fuel) {             // early swap: the old cell is thrown out with what's left in it
      if (!close) return { ...t, text: 'Reactor — get closer', ok: false };
      const left = power.reactor.fuel;
      return { ...t, ok: true, text: `Click: swap in a fresh cell (wastes the ${left} energy left in this one)`,
               run: () => { inv.item = null; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); sfx.poi(); combatBanner(`Fresh fuel cell loaded (${left} energy wasted)`); } };
    }
    if (power.overcharge && close)
      return { ...t, ok: true, text: `Click: stop the overcharge (${status})`, run: () => { power.overcharge = false; sfx.clank(); } };
    if (perk(player, 'overcharge') && close && !broken(REACTOR))
      return { ...t, ok: true, text: `Click: overcharge the reactor — double speed, ${OVERCHARGE_FIRE * 100}% fire risk per energy (${status})`, run: () => { power.overcharge = true; sfx.spark(); combatBanner('Reactor OVERCHARGED — double speed, watch for fire'); } };
    return { ...t, text: `Reactor: ${status}`, ok: false };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Injuries. ok → (hit) hurt for HURT_TIME: tunnel vision, slower → (hit) down: patch yourself up
// (hold click on yourself, SELF_TREAT s) → (hit while down) out: someone else has to treat you.
// Anyone can treat anyone by holding click on them for TREAT_TIME (down / out → hurt, hurt → ok).
// Alone on the ship, someone who's out can still crawl back slowly (SOLO_TREAT s) — no softlocks.
// ---------------------------------------------------------------------------
const HURT_TIME = 30, SELF_TREAT = 10, SOLO_TREAT = 20, TREAT_TIME = 2;
const standing = (c) => (c.health || 'ok') === 'ok' || c.health === 'hurt';
// dmg: how many steps along ok → hurt → down → out (a ship's shot in the body: 3, straight out).
function hurtCrew(c, dmg = 1) {
  if (!c) return;
  if (c.armor > 0) {                               // (gear: see progress.js) the vest soaks one step
    c.armor--; combatBanner(`${c.name}'s armor vest took the hit`); sfx.clank();
    if (--dmg <= 0) return;
  }
  for (let i = 0; i < dmg; i++) { const h = c.health || 'ok'; c.health = h === 'ok' ? 'hurt' : h === 'hurt' ? 'down' : 'out'; }
  c.hurtT = HURT_TIME; c.treat = null;
  if (c.health === 'down' || c.health === 'out') {
    if (c.mode === 'gun') {                       // slumps in the seat, below the rim: shots can't reach them (js/combat.js)
      c.cover = 0; c.gunReady = false;
      combatBanner(c.health === 'out' ? `${c.name} is OUT in the ${c.gun.name.toLowerCase()} — pull them out at its ladder` : `${c.name} is down in the ${c.gun.name.toLowerCase()}`);
    } else combatBanner(`${c.name} is ${c.health === 'out' ? 'OUT — someone has to treat them!' : 'down!'}`);
  }
}
// A crew member at a cannon's ladder pulls the one slumped in it (down or out) back inside, next to the
// hatch, still down: there they can be treated as usual, and the cannon is free again.
function pullOutOfCannon(c, g) {
  if (c.mode !== 'gun' || c.gun !== g || standing(c)) return;
  c.mode = 'inside'; c.gun = null; c.cover = 0; c.vx = c.vy = 0; c.treat = null;
  const rects = walkRects(), [hx, hy] = g.hatch;
  const spots = [[0, 0.75], [0.75, 0], [-0.75, 0], [0, -0.75]].map(([dx, dy]) => [hx + dx, hy + dy]).filter(([x, y]) => canStand(x, y, rects));
  spots.sort((a, b) => Math.hypot(b[0] - player.x, b[1] - player.y) - Math.hypot(a[0] - player.x, a[1] - player.y));   // not on the puller's feet
  [c.x, c.y] = spots[0] || g.hatch;
  sfx.clank(); combatBanner(`${player.name} pulled ${c.name} out of the ${g.name.toLowerCase()}`);
}
function updateInjury(c, dt) {
  if (c.health === 'hurt' && (c.hurtT -= dt) <= 0) { c.health = 'ok'; c.hurtT = 0; }
}
// The treat action on crew member `who`, from the acting crew member: { time, label } or null.
function treatInfo(who) {
  if (!who || standing(who) && who.health !== 'hurt') return null;
  if (who === player) {
    if (who.health === 'down') return { time: perk(who, 'stim') ? 3 : perk(who, 'firstAid') ? 6 : SELF_TREAT, label: 'get up' };
    if (who.health === 'out' && crew.every(c => c === who || !standing(c))) return { time: SOLO_TREAT, label: 'crawl back up' };
    return null;
  }
  return standing(player) ? { time: perk(player, 'firstAid') ? 1.2 : TREAT_TIME, label: `treat ${who.name}` } : null;
}
function updateTreat(dt, target, holding, click = mouse.click) {   // (click: a fresh click or E press)
  if (!target?.treat) { player.treat = null; return; }
  const who = target.treat;
  if (!holding) {                                    // letting go briefly (to click on a heartbeat) doesn't lose progress
    if (player.treat?.id === who.id && (player.treat.up = (player.treat.up || 0) + dt) > 0.4) player.treat = null;
    return;
  }
  if (player.treat?.id !== who.id) player.treat = { id: who.id, t: 0, time: target.time };
  if (click && player.treat.t > 0.1) {               // a click (or E pressed again) right on the heartbeat speeds it up
    const off = Math.abs(((player.treat.t + BEAT / 2) % BEAT) - BEAT / 2);
    if (off < 0.15) { player.treat.t += 0.5; player.treat.beat = 1; sfx.poi(); }
  }
  player.treat.up = 0; player.treat.beat = Math.max(0, (player.treat.beat || 0) - dt * 3);
  player.treat.t += dt;
  if (player.treat.t >= target.time) {
    who.health = who.health === 'hurt' ? 'ok' : 'hurt'; who.hurtT = HURT_TIME;
    sfx.poi(); combatBanner(who === player ? 'Patched up — still hurt for a while' : `${who.name} is back on their feet`);
    if (who !== player) hz.stats.treated[player.name] = (hz.stats.treated[player.name] || 0) + 1;
    player.treat = null;
  }
}

// E on the power lever (hub or handle): a tap (let go before LEVER_E_HOLD s) steps the lever like a
// click on the handle; holding E that long wedges the wrench in (or pulls it out) instead.
// target.eHold = { time, tap, hold, text }: game.js updateInteraction runs it (only for E; clicks stay as they are).
const LEVER_E_HOLD = 0.5;
function leverEHold() {
  const lv = power.lever, next = LEVER_NAMES[(lv.pos + 1) % 3];
  return {
    time: LEVER_E_HOLD, label: lv.jammed ? 'Pulling the wrench out' : 'Wedging the wrench in',
    text: lv.jammed ? 'Hold E: pull the wrench out' : `E: turn lever to ${next} · hold E: wedge the wrench in`,
    tap: () => { if (power.lever.jammed) return; power.lever.pos = (power.lever.pos + 1) % 3; sfx.clank(); },
    hold: () => { power.lever.jammed = !power.lever.jammed; sfx.clank(); },
  };
}

// "Hold click: weld the plate on (4 s)" → "Weld the plate on" (the progress bar's caption).
function workLabel(text) {
  const s = String(text || '').replace(/^[^:]{0,24}:\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').split(' · ')[0].split(' — ')[0];
  return s ? s[0].toUpperCase() + s.slice(1) : 'Working';
}
// Generic "hold click" jobs (tarps, welds, splices, …): target.hold = { id, time, done }.
function updateHold(dt, target, holding) {
  if (!holding || !target?.hold) { player.hold = null; return; }
  const h = target.hold;
  if (player.hold?.id !== h.id) player.hold = { id: h.id, t: 0, time: h.time, label: h.label || workLabel(target.text) };
  player.hold.t += h.exact ? dt : dt * (player.health === 'hurt' ? 0.8 : 1) * repairSpeed(player);   // (exact: a key-hold timing, not work)
  if (!h.exact && Math.random() < dt * 8) combatFx(target.x + (Math.random() - 0.5) * 0.6, target.y + (Math.random() - 0.5) * 0.6, 0, -1, 0.3, '#ffe08a', 0.06);
  if (player.hold.t >= h.time - 1e-6) { player.hold = null; h.done(); }
}
// What a click does on a spacewalk (hazards, EVA jobs, broken parts outside on the hull).
function evaClickTarget(mx, my) {
  return hazardEvaTarget(mx, my) || evaJobTarget(mx, my) || organicEvaTarget(mx, my) || dockEvaTarget(mx, my) || outsideRepairTarget(mx, my);
}
// Broken parts on the outside of the hull (the shield emitters): hold click with the repair kit, as inside.
function outsideRepairTarget(mx, my) {
  for (const s of SYSTEMS) {
    if (!s.outside || !s.broken || Math.hypot(mx - s.x, my - s.y) > s.r) continue;
    if (!near(s.x, s.y, REACH + s.r * 0.6)) return { text: `${s.name} is broken — get closer`, ok: false, x: s.x, y: s.y, r: s.r };
    if (inv.weapon !== 'repair') return { text: `${s.name} is broken — needs the repair kit`, ok: false, x: s.x, y: s.y, r: s.r };
    return holdTarget('fix' + s.kind + s.ref.side, REPAIR_TIME, `Hold click: repair the ${s.name.toLowerCase()} (${REPAIR_TIME} s)`, s.x, s.y, s.r,
                      () => { s.broken = false; hz.stats.repairs++; combatBanner(`${s.name} repaired — the shield works again`); sfx.win(); });
  }
  return null;
}

// Repairing: hold the mouse on a broken system with the repair kit.
function updateRepair(dt, target, holding) {
  if (!holding || !target?.repair) { player.repair = null; return; }
  if (player.repair?.sys !== target.repair) player.repair = { sys: target.repair, t: 0 };
  player.repair.t += dt * repairSpeed(player);
  if (Math.random() < dt * 8) combatFx(target.x + (Math.random() - 0.5) * 0.6, target.y + (Math.random() - 0.5) * 0.6, 0, -1, 0.3, '#ffe08a', 0.06);
  if (player.repair.t >= REPAIR_TIME) {
    if (target.service) { serviceDone(player.repair.sys); combatBanner(`${player.repair.sys.name} serviced — it won't break now`); }
    else { player.repair.sys.broken = false; hz.stats.repairs++; combatBanner(`${player.repair.sys.name} repaired`); }
    sfx.win();
    player.repair = null;
  }
}

// The weapon in hand: right click towards the mouse, or Space the way you face (arrow keys aim).
// The heavy blaster fires when you let go: a quick click is a shot, held until charged a blast.
function updateWeapon(dt, mx, my) {
  const keyHeld = keys.has('Space'), keyPressed = pressed.has('Space');
  const mouseAim = () => Math.atan2(my - player.y, mx - player.x);
  if (inv.weapon !== 'heavy') player.charge = null;
  if (inv.weapon === 'heavy') {
    if (player.charge == null && (mouse.rightClick || keyPressed) && canShoot()) { player.charge = 0; player.chargeKey = !mouse.rightClick; }
    if (player.charge == null) return;
    if (!canShoot(true)) { player.charge = null; return; }
    const a = player.chargeKey ? player.face : mouseAim();
    if (player.chargeKey ? keyHeld : mouse.right) { player.charge = Math.min(BLASTER_CHARGE, player.charge + dt); player.face = a; return; }
    const blast = player.charge >= BLASTER_CHARGE; player.charge = null;
    attack(a, blast, player.chargeKey ? null : [mx, my]);
  } else if (mouse.rightClick) attack(mouseAim(), false, [mx, my]);
  else if (keyPressed) attack(player.face);
  if (inv.weapon === 'extinguisher' && player.mode === 'inside') {
    if (mouse.right) spray(mx, my, dt);
    else if (keyHeld) spray(player.x + Math.cos(player.face) * 2, player.y + Math.sin(player.face) * 2, dt);
  }
}
// The hand weapon sits in the right hand: its muzzle, from the crew member's ground point, in the model's frame
// [x forward, y left, z up] = the idle pose's right glove (the crew sprites' `hand`) + the held item's `muzzle`
// (tools/blender/models/items/items.py HELD). js/sprites.js draws the item in the animated hand.
const HAND_REST = [0.047, -0.213, 0.417];
const HELD_MUZZLE = { laser: [0.418, 0, 0.104], heavy: [0.508, 0, 0.126], drill: [0.405, 0, 0.09], repair: [0, 0, 0], extinguisher: [0.108, -0.048, -0.284] };
function muzzleAt(c, a = c.face) {
  const m = HELD_MUZZLE[c.inv?.weapon] || HELD_MUZZLE.laser, fx = HAND_REST[0] + m[0], ly = HAND_REST[1] + m[1];
  return { x: c.x + Math.cos(a) * fx + Math.sin(a) * ly, y: c.y + Math.sin(a) * fx - Math.cos(a) * ly, z: HAND_REST[2] + m[2] };
}
// Aiming at a point: the body turns to it, the shot leaves the muzzle (beside the body) straight for it.
function aimFromMuzzle(c, a, tx, ty) {
  if (Math.hypot(tx - c.x, ty - c.y) < 1.2) return a;  // (too close: just straight ahead)
  const m = muzzleAt(c, a);
  return Math.atan2(ty - m.y, tx - m.x);
}
function canShoot(ignoreCd = false) {
  return !!inv.weapon && inv.weapon !== 'extinguisher' && inv.weapon !== 'drill' && inv.item !== 'blackbox' && (ignoreCd || inv.cd <= 0) && (player.mode === 'inside' || player.mode === 'eva');
}
const weaponCooldown = (w) => w === 'laser' ? LASER_COOLDOWN : w === 'heavy' ? BLASTER_COOLDOWN : WRENCH_COOLDOWN;
// Fire the weapon in hand at angle a (from the body; at the point `to` if given). Laser: fast bolt. Heavy
// blaster: slower 1-2 damage bolt, or a charged blast. Repair kit: throw a wrench (long cooldown). Shots
// leave the held weapon's muzzle (z: its height, for drawing).
function attack(a, blast = false, to = null) {
  if (!canShoot()) return;
  player.face = a;
  const M = muzzleAt(player, a);
  if (to) a = aimFromMuzzle(player, a, to[0], to[1]);
  const dx = Math.cos(a), dy = Math.sin(a), { x, y, z } = M;
  const fast = perk(player, 'weapons') ? 0.65 : 1;
  if (inv.weapon === 'laser') {
    inv.cd = LASER_COOLDOWN * fast;
    boarding.bolts.push({ x, y, z, ox: x, oy: y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew' });
    sfx.enemyShot();
  } else if (inv.weapon === 'heavy') {
    inv.cd = BLASTER_COOLDOWN * fast;
    if (blast) {
      boarding.bolts.push({ x, y, z, ox: x, oy: y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew', dmg: 3, stun: 1, heavy: true });
      if (player.mode === 'eva') combat.shells.push({ x, y, vx: dx * SHELL_SPEED, vy: dy * SHELL_SPEED, life: SHELL_LIFE });   // hits like a ship cannon
      for (let i = 0; i < 10; i++) combatFxAt(z, x, y, dx * 4 + (Math.random() - 0.5) * 3, dy * 4 + (Math.random() - 0.5) * 3, 0.3, '#9cd8ff', 0.1);
      sfx.shoot();
    } else {
      boarding.bolts.push({ x, y, z, ox: x, oy: y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew', dmg: Math.random() < 0.5 ? 1 : 2 });
      sfx.enemyShot();
    }
  } else if (inv.weapon === 'repair') {
    inv.cd = WRENCH_COOLDOWN;
    boarding.bolts.push({ x, y, z: z + 0.15, vx: dx * WRENCH_SPEED, vy: dy * WRENCH_SPEED, life: 0.8, owner: 'crew', wrench: true, spin: 0 });   // (out of the kit in your hand)
    sfx.clank();
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Rooms of a zone column go dim when its capacitor is empty or broken.
const lightLevel = [1, 1, 1];
function updateLightLevels(dt) {                        // (the sprite renderer's lights read these too: js/lights.js)
  for (let col = 0; col < 3; col++) {
    const dark = CAPACITORS[col].charge <= 0 || capBroken(col);
    lightLevel[col] = lerp(lightLevel[col], dark ? 0 : 1, 1 - Math.exp(-3 * dt));
  }
}
function drawLights(dt) {
  updateLightLevels(dt);
  for (let col = 0; col < 3; col++) {
    const a = (1 - lightLevel[col]) * 0.42;
    if (a < 0.01) continue;
    ctx.fillStyle = `rgba(40,4,6,${a})`;                // emergency lighting: dim and red
    for (const r of ROOMS.filter(r => r.col === col)) for (const q of r.rects) ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
  }
}

// Sprites: systems/lever_base_p<pos> (or _broken), the lit bus (systems/lever_bus, frame = the branch fed),
// the handle (LEVER_HANDLE_FRAMES angles, LEVER_HANDLE_STEP apart from LEFT over the top to RIGHT) and the wedged wrench,
// all with their origin at LEVER; the output names and AUTO / MANUAL stay text on the floor.
function drawLeverSprite(lv) {
  const base = broken(LEVER) ? 'systems/lever_base_broken' : `systems/lever_base_p${leverShownPos()}`;
  if (!sprReady(base, 'systems/lever_handle')) return false;
  const o = { sortY: LEVER.y + 0.3 };
  // pick: the hub sits up on the dial (z ≈ 0.39), so on screen it's above the ground point; pointing at it
  // picks the lever's ground point = the hub (wedge / pull the wrench), not the handle zone below it
  spr(base, 0, LEVER.x, LEVER.y, 0, { ...o, emissive: 0.5, pick: [LEVER_HUB, 0.42] });
  // the lit bus on the dial (trunk inlet → hub → the gland of the branch the energy takes) while the trunk is live
  if (powerLineLive(LINE.trunk)) spr('systems/lever_bus', nextFeed(), LEVER.x, LEVER.y, 0, { ...o, sortY: LEVER.y + 0.305, emissive: 1 });
  spr('systems/lever_handle', clamp(Math.round((lv.angle - leverAngle(0)) * LEVER_HANDLE_DIR / LEVER_HANDLE_STEP), 0, LEVER_HANDLE_FRAMES - 1), LEVER.x, LEVER.y, 0, { ...o, sortY: LEVER.y + 0.31 });
  if (lv.jammed) spr('systems/lever_wrench', lv.pos, LEVER.x, LEVER.y, 0, { ...o, sortY: LEVER.y + 0.32 });
  return true;
}
function drawLever(t) {
  const x = L(LEVER.x), y = L(LEVER.y), lv = power.lever;
  if (drawLeverSprite(lv)) {
    // the labels stand up as billboards next to their outputs (flat on the floor the base and the engine
    // housing hid them), the mode (AUTO / MANUAL) over the top; depth-tested, so the crew still cover them
    const o = { layer: 'main', depthBias: 0.4, outline: 'rgba(10,12,18,0.7)' }, f1 = `800 ${T * 0.13}px system-ui, sans-serif`;
    for (let i = 0; i < 3; i++) {
      const a = leverAngle(i), lx = LEVER.x + Math.cos(a) * 1.05, ly = LEVER.y + Math.sin(a) * 1.05;   // (low, over its own branch, just past the gland)
      worldText(lx, ly, 0.3, LEVER_NAMES[i], f1, 'rgba(232,236,244,0.8)', { ...o, sortY: ly });
    }
    const my = LEVER.y + 0.6;                       // (in front, the top is where the trunk and MID come in)
    worldText(LEVER.x, my, 0.5, lv.jammed ? 'WEDGED' : 'AUTO', `800 ${T * 0.11}px system-ui, sans-serif`, lv.jammed ? '#ffcf6b' : 'rgba(232,236,244,0.65)', { ...o, sortY: my });
    return;
  }
  shadowEllipse(x + 3, y + 5, T * 0.55, T * 0.45, 0.3);
  ctx.beginPath(); ctx.arc(x, y, T * 0.5, 0, TAU); ctx.fillStyle = '#3f4757'; ctx.fill(); stroke(2.5);
  ctx.beginPath(); ctx.arc(x, y, T * 0.38, Math.min(...LEVER_ANGLES) - 0.25, Math.max(...LEVER_ANGLES) + 0.25);   // the track (LEFT → MID → RIGHT)
  ctx.strokeStyle = '#262a33'; ctx.lineWidth = 7; ctx.stroke();
  if (powerLineLive(LINE.trunk)) {                 // the lit bus: trunk inlet → hub → the branch the energy takes
    const a = leverAngle(nextFeed()), r = T * 0.47;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = '#ffc860'; ctx.lineWidth = 4; ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {                    // the three outputs, left → right
    const a = leverAngle(i), on = i === leverShownPos();
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * T * 0.38, y + Math.sin(a) * T * 0.38, 4.5, 0, TAU);
    ctx.fillStyle = on ? '#5fd6a0' : '#4a515e'; ctx.fill(); stroke(1);
    ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.13}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LEVER_NAMES[i], x + Math.cos(a) * T * 1.1, y + Math.sin(a) * T * 1.1 - T * 0.12);   // (just past its gland, over its branch)
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(lv.angle + Math.PI / 2);   // handle
  rr(-4, -T * 0.42, 8, T * 0.42, 3); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.5);
  ctx.beginPath(); ctx.arc(0, -T * 0.42, 6, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.5);
  ctx.restore();
  if (lv.jammed) {                                 // wrench stood upright right next to the handle, on the side it would step to
    const next = (lv.pos + 1) % 3, a = leverAngle(lv.pos) + Math.sign(leverAngle(next) - leverAngle(lv.pos)) * 0.42;   // (as the sprite: ±0.42 rad, r 0.38)
    const wx = x + Math.cos(a) * T * 0.38, wy = y + Math.sin(a) * T * 0.38, h = T * 0.24;
    shadowEllipse(wx + 2, wy + 2, 7, 3.5, 0.35);   // its foot in the track
    rr(wx - 3, wy - h, 6, h, 2.5); ctx.fillStyle = '#a9b2c0'; ctx.fill(); stroke(1.5);   // shaft, standing up
    ctx.beginPath(); ctx.arc(wx, wy - h, 7, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + TAU); ctx.lineTo(wx, wy - h); ctx.closePath();   // open jaw on top
    ctx.fillStyle = '#c3cad6'; ctx.fill(); stroke(1.5);
  }
  ctx.beginPath(); ctx.arc(x, y, T * LEVER_HUB * 0.55, 0, TAU); ctx.fillStyle = lv.jammed ? '#e8c34f' : '#9aa3b5'; ctx.fill(); stroke(1.5);   // hub
  ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.11}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(lv.jammed ? 'WEDGED' : 'AUTO', x, y + T * 0.55);
  ctx.textAlign = 'left';
}

// Glowing energy packets flying from the reactor to a capacitor.
// Energy pulses running along the power lines (deliveries from the reactor, and energy being used).
function drawEnergyBolts() {
  if (GFX.on) ctx.save(), floorClip(ctx);
  const orb = ([x, y]) => {
    const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), 15);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ffe08a'); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), 15, 0, TAU); ctx.fill();
  };
  for (const b of power.bolts) if (b.t < 1) { const p = boltPoint(b); if (p) orb(p); }
  for (const p of power.pulses) if (LINE[p.line]) orb(linePoint(LINE[p.line], p.t));
  if (GFX.on) ctx.restore();
}

// Broken look: scorch, a loose panel, smoke and the odd spark.
// Sprites: the machine itself switches to its *_broken sprite where it has one (capacitors, shield buttons,
// the lever, hatches, deck airlocks, the reactor, the cannon ladders); systems/broken_scorch (radius 1, scaled to min(s.r, 1.1)) on the
// floor round it, the loose cover panel (systems/broken_panel) lying on the floor in front of the machine,
// where it can be seen; while the reactor's / a ladder's broken sprite is still loading they get a burn mark
// on their front (fx/scorch_*, upright) instead; fx/smoke_* puffs rising; sparks 2D (glow layer), the BROKEN label on top.
const BROKEN_FRONT = { reactor: 1.3, cannon: 0.36, shield: 0.32, capacitor: 0.42, lever: 0.45, lock: 0.3, hatch: 0.4, emitter: 0.1 };
function drawBrokenSprites(s, t) {
  const rad = Math.min(s.r, 1.1), panel = GFX.has('systems/broken_panel') ? 'systems/broken_panel' : 'fx/loose_panel';
  if (!GFX.ready('systems/broken_scorch') || !GFX.ready(panel) || !GFX.ready('fx/smoke_0')) return false;
  const front = BROKEN_FRONT[s.kind] ?? 0.4;
  if (s.kind !== 'lock' && s.kind !== 'hatch') {       // (the airlocks have broken sprites of their own; nothing lies in the spine / the side wall)
    GFX.sprite('systems/broken_scorch', 0, s.x, s.y + front * 0.5, 0, { layer: 'decal', scale: rad, alpha: 0.85 });
    GFX.sprite(panel, 0, s.x + 0.35, s.y + front + 0.22, 0, { sortY: s.y + front + 0.22 });
  }
  const own = { reactor: 'ship/reactor_broken', cannon: 'interior/gun_ladder_broken' }[s.kind];
  if (own && !GFX.ready(own) && GFX.ready('fx/scorch_1'))   // broken sprite not (yet) there: a burn mark on its front
    GFX.sprite('fx/scorch_1', 0, s.x - 0.15, s.y + front + 0.02, s.kind === 'reactor' ? 0.55 : 0.35, { billboard: true, scale: s.kind === 'reactor' ? 1.0 : 0.55, alpha: 0.8, sortY: s.y + front + 0.05, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const q = (t * 0.5 + i / 3) % 1;
    fxSmoke(s.x + Math.sin(t + i * 2) * 0.1, s.y + 0.05, 0.3 + q * 1.3, 0.12 + q * 0.25, 0.6 * (1 - q) * Math.min(1, q * 6), i + Math.floor(s.x), 2);   // (biased: out of the machine it rises from)
  }
  return true;
}
function drawBroken(s, t) {
  const x = L(s.x), y = L(s.y), r = L(Math.min(s.r, 1.1));
  if (s.outside) { /* on the hull, in vacuum: its own broken look (drawShieldEmitters), no smoke or floor scorch; just the sparks */ }
  else if (!(GFX.on && drawBrokenSprites(s, t))) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(15,12,10,0.55)'); g.addColorStop(1, 'rgba(15,12,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x + r * 0.3, y - r * 0.2); ctx.rotate(0.5);
    rr(-8, -5, 16, 10, 2); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.5); ctx.restore();
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.5 + i / 3) % 1;
      ctx.beginPath(); ctx.arc(x + Math.sin(t + i * 2) * 5, y - q * L(1.1), L(0.12 + q * 0.25), 0, TAU);
      ctx.fillStyle = `rgba(70,70,76,${0.5 * (1 - q)})`; ctx.fill();
    }
  }
  const rr2 = rng(Math.floor(t * 5) + s.x * 7);
  if (rr2() < 0.15) {                                 // (GFX: at the machine's front, a little up; js/lights.js flashes with it)
    const sx = x, sy = GFX.on ? L(s.y + (BROKEN_FRONT[s.kind] ?? 0.4) - GFX.lift(0.5)) : y;
    ctx.strokeStyle = 'rgba(255,220,120,0.85)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const a = rr2() * TAU; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9); ctx.stroke(); }
  }
  if (!GFX.on) drawBrokenLabel(s);
}
// The BROKEN label. With sprites it's drawn later, on top (drawBrokenLabels, from render()), upright and
// lifted above the machine so the machine's sprite doesn't hide it.
function drawBrokenLabel(s) {
  const x = L(s.x), r = L(Math.min(s.r, 1.1)), y = L(s.y - GFX.lift(1.1)) - r * 0.6;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / viewSy());
  if (crewInFront(s.x, s.y, 1.1 + Math.min(s.r, 1.1) * 0.6 / GFX.COS)) ctx.globalAlpha = 0.3;
  ctx.fillStyle = 'rgba(255,120,100,0.9)'; ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  if (GFX.on) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,10,10,0.7)'; ctx.strokeText('BROKEN', 0, 0); }
  ctx.fillText('BROKEN', 0, 0); ctx.restore(); ctx.textAlign = 'left';
}
function drawBrokenLabels() { if (GFX.on) for (const s of SYSTEMS) if (s.broken) drawBrokenLabel(s); }

// Item icons (pixel coords). Used on the floor and in the inventory.
function drawItemIcon(kind, x, y, s = 1, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (kind === 'repair') {
    rr(-6, -13, 12, 5, 2); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();             // handle
    rr(-15, -9, 30, 19, 3); ctx.fillStyle = C.hazard; ctx.fill(); stroke(2);                     // yellow tool case
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-15, -3, 30, 2);
    ctx.save(); ctx.rotate(-0.6);                                                               // wrench emblem
    ctx.fillStyle = '#2b303a';
    ctx.fillRect(-7, -1.8, 12, 3.6);
    ctx.beginPath(); ctx.arc(6.5, 0, 4.2, 0.75, TAU - 0.75); ctx.lineTo(6.5, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-7.5, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (kind === 'laser') {
    rr(-14, -4, 22, 8, 3); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(2);
    rr(6, -3, 9, 6, 2); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.5);
    rr(-10, 2, 6, 9, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = '#ff6a4a'; ctx.fillRect(-8, -2, 10, 2.5);
    ctx.beginPath(); ctx.arc(15, 0, 2, 0, TAU); ctx.fillStyle = '#ffb0a0'; ctx.fill();
  } else if (kind === 'heavy') {
    rr(-16, -6, 26, 12, 3); ctx.fillStyle = '#4a5468'; ctx.fill(); stroke(2);                   // chunky body
    rr(8, -4, 10, 8, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);                     // muzzle
    rr(-11, 4, 7, 9, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);                     // grip
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#9cd8ff'; ctx.fillRect(-12 + i * 6, -3, 4, 6); }   // charge cells
    ctx.beginPath(); ctx.arc(18, 0, 2.5, 0, TAU); ctx.fillStyle = '#d8f0ff'; ctx.fill();
  } else if (kind === 'extinguisher') {
    extinguisher(-4, 0, 0);
  } else if (kind === 'plate') {
    ctx.rotate(0.2); rr(-13, -10, 26, 20, 3); ctx.fillStyle = '#8a93a5'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#2b303a'; for (const [rx, ry] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-11, -8, 22, 3);
  } else if (kind === 'coolant') {
    rr(-7, -12, 14, 24, 4); ctx.fillStyle = '#4ac0e0'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#e8f8ff'; ctx.fillRect(-5, -4, 10, 6); ctx.fillStyle = '#2b303a'; ctx.fillRect(-4, -15, 8, 4);
    ctx.fillStyle = '#1a5a70'; ctx.font = '800 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('COOL', 0, -1);
  } else if (kind === 'blackbox') {
    rr(-13, -9, 26, 18, 3); ctx.fillStyle = '#e8762e'; ctx.fill(); stroke(2);         // (black boxes are orange)
    ctx.fillStyle = '#2b303a'; ctx.fillRect(-10, -3, 20, 2); ctx.fillRect(-10, 2, 20, 2);
    hazardStripe(-13, -9, 26, 4);
  } else if (kind === 'drill') {
    rr(-14, -5, 16, 10, 3); ctx.fillStyle = '#d9a54a'; ctx.fill(); stroke(2);
    poly([[2, -4], [15, 0], [2, 4]]); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#6b7486'; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(4 + i * 3.5, -3); ctx.lineTo(6 + i * 3.5, 3); ctx.stroke(); }
    rr(-10, 4, 6, 8, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.2);
  } else if (kind === 'ore') {
    poly([[-9, -4], [-3, -10], [6, -8], [10, 0], [5, 9], [-6, 8]]); ctx.fillStyle = '#6e6359'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#7af0ff'; for (const [ox, oy] of [[-2, -3], [3, 2], [-4, 4]]) { ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, TAU); ctx.fill(); }
  } else if (kind === 'fuel') {
    rr(-6, -12, 12, 24, 5);
    const g = ctx.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, '#b8902e'); g.addColorStop(0.5, '#fff0b0'); g.addColorStop(1, '#8a6a1e');   // (the power colour)
    ctx.fillStyle = g; ctx.fill(); stroke(2);
    ctx.fillStyle = '#c9ced8'; ctx.fillRect(-4, -14, 8, 3);
  }
  ctx.restore();
}
// The "you can use this" look (world px, white: yellow is energy). Everything usable in your room gets a
// thin dashed white ring, what a click / E would do right now a thick solid one plus a soft white haze
// and a small white light on it (useLights, js/lights.js), something you can't use (yet) a dim grey
// dashed ring. All of it is drawn on top of the world (drawUseMarks, from render()), so furniture,
// counters or the dark never hide it.
function useGlow(x, y, hw, hh = hw, k = 1) {
  if (k <= 0.01) return;
  const r = Math.max(hw, hh) * 1.35;
  ctx.save(); ctx.translate(x, y); ctx.scale(hw / Math.max(hw, hh), hh / Math.max(hw, hh));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${USE_RGB},${0.22 * k})`); g.addColorStop(0.6, `rgba(${USE_RGB},${0.08 * k})`); g.addColorStop(1, `rgba(${USE_RGB},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.restore();
}
// A ring round a usable thing: style 'spot' (thin dashed white, alpha a), 'target' (thick solid white),
// 'no' (dim grey dashed). hw, hh in world px (an ellipse for wide things).
function useRing(x, y, hw, hh, style, a = 1) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(4, hw), Math.max(4, hh), 0, 0, TAU);
  if (style === 'target') {
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(10,12,18,0.5)'; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  } else if (style === 'hover') {                    // the mouse's target (when it isn't E's): thin, solid
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.45)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  } else if (style === 'no') {
    ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(140,146,158,0.75)'; ctx.stroke();
  } else {
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -time * 6;
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(10,12,18,${0.3 * a})`; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.stroke();
  }
  ctx.restore();
}
const useLift = (s) => (s.z ? GFX.lift(s.z) : 0) + (s.hullTop && typeof hullTopZ === 'function' ? GFX.lift(hullTopZ(s.x, s.y)) : 0);   // (on a counter / the hull wall's top)
function drawItems(t) {
  ITEMS.forEach((it, i) => {
    const x = L(it.x), y = L(it.y), bob = Math.sin(t * 2.6 + i * 1.7) * 3;
    shadowEllipse(x + 3, y + 5, 13 - bob * 0.6, 8, 0.3);
    if (!spr('items/' + it.kind, 0, it.x, it.y, 0.12 + bob / T, { pick: [0.4, 0.7], emissive: 0.15, ...(it.kind === 'fuel' ? { recolor: POWER_COL } : {}) })) drawItemIcon(it.kind, x, y - 3 + bob, 1.15, t);
  });
}
// What E would do ('target': the thick ring and a haze) or what the mouse is on ('hover'), world space.
function drawClickTarget(target, style = 'target') {
  if (!target) return;
  const x = L(target.x), y = L(target.y - useLift(target)), r = L(target.r);
  if (!target.ok) return useRing(x, y, r, r, 'no');
  if (style === 'target') useGlow(x, y, r * 1.1, r * 1.1, 1.6);
  useRing(x, y, r, r, style);
}
// The spot E acts on right now (by where you stand and face, never the mouse): your prompt's, if E does it.
const eTargetOf = (c) => c?.prompt?.eAct && c.prompt.at && !c.prompt.screen ? { ...c.prompt.at, ok: true } : null;
// Spacewalk jobs and other pickups register here while they're drawn (js/eva.js jobMarker, pickupHalo);
// drawUseMarks rings them.
let useExtra = [];
function pickupHalo(x, y, r) { useExtra.push({ x: x / T, y: y / T, r: r / T }); }   // (world px in, like the old halo)
// Every usable thing near you (thin dashed rings: faint in your room, brighter in reach), then the
// current target on top. World transform set; called late in render(), over everything in the world.
function drawUseMarks(t) {
  if (me && standing(me) && (me.mode === 'inside' || me.mode === 'eva')) {
    const here = roomAt(me.x, me.y), ov = typeof cam !== 'undefined' ? cam.overview : 0;
    const spots = me.mode === 'inside' ? [...interactSpots(), ...ITEMS.map(it => ({ x: it.x, y: it.y, r: 0.45 })),
      ...(power.reserve > 0 ? [{ x: FUEL_CRATE.x, y: FUEL_CRATE.y, r: 0.75 }] : []), ...useExtra] : useExtra;
    for (const s of spots) {
      const d = Math.hypot(s.x - me.x, s.y - me.y), p = s.probe || [s.x, s.y];
      const sameRoom = me.mode === 'eva' ? d < 6 : here && (s.both ? d < 8 : roomAt(p[0], p[1]) === here);
      const close = d < REACH + 0.9;
      const a = close ? 0.8 : sameRoom || d < 6 ? 0.4 : ov * 0.4;
      if (a < 0.03) continue;
      const hw = L(s.w ? s.w / 2 : s.r) + 3, hh = L(s.h ? s.h / 2 : s.r) + 3, y = L(s.y - useLift(s));
      if (close) useGlow(L(s.x), y, hw, hh, 0.6);   // (a soft highlight on what's in reach)
      useRing(L(s.x), y, hw, hh, 'spot', a);
    }
  }
  useExtra = [];
  const eT = eTargetOf(me), h = me.hover;
  const same = eT && h && Math.hypot(h.x - eT.x, h.y - eT.y) < 0.05;
  if (h && !same) drawClickTarget(h, 'hover');       // the mouse's own cue (a click does that), thinner
  drawClickTarget(eT, 'target');                     // E: always the thick one
}
// E's target gets a small white light, so the object itself brightens (sprite view).
function useLights() {
  const tg = eTargetOf(me);
  if (!tg || !isFinite(tg.x)) return [];
  return [{ x: tg.x, y: tg.y + 0.15, z: (tg.z || 0) + 1.1, color: [1, 1, 1], radius: 1.2 + (tg.r || 0.5), intensity: 0.9, shadow: false }];
}
// How far along the hold job `c` is busy with (repair, a hold target, treating someone): { k, label } or null.
function workProgress(c) {
  if (c.repair?.sys) return { k: c.repair.t / REPAIR_TIME, label: `Repairing the ${c.repair.sys.name.toLowerCase()}` };
  if (c.hold && c.hold.time) return { k: c.hold.t / c.hold.time, label: c.hold.label || 'Working' };
  if (c.treat) {
    const who = crew.find(o => o.id === c.treat.id);
    if (who && c.treat.time) return { k: c.treat.t / c.treat.time, label: who === c ? 'Patching yourself up' : `Treating ${who.name}` };
  }
  return null;
}

// All the energy the ship still has: the cell in the reactor, the capacitors, and every spare fuel cell
// (in the crate, carried, lying around) at CELL_ENERGY each.
function shipEnergy() {
  const caps = CAPACITORS.reduce((n, c) => n + (capBroken(CAPACITORS.indexOf(c)) ? 0 : c.charge), 0);
  const cells = power.reserve + ITEMS.filter(it => it.kind === 'fuel').length + crew.filter(c => c.inv?.item === 'fuel').length;
  return { total: power.reactor.fuel + caps + cells * CELL_ENERGY, reactor: power.reactor.fuel, caps, cells };
}
// Inventory slots, bottom centre (screen px). Clicking a full one drops it (js/game.js clientUpdate).
const INV_SLOT = 184, INV_GAP = 14, INV_RESERVE = INV_SLOT + 20;   // (the camera keeps the room above it: js/game.js)
function invSlots() {
  const w = INV_SLOT * 2 + INV_GAP, x0 = Math.max(VW / 2 - w / 2, 14 + 262 + 16), y = VH - INV_SLOT - 14;   // (centred, clear of the energy panel)
  return ['weapon', 'item'].map((slot, i) => ({ slot, x: x0 + i * (INV_SLOT + INV_GAP), y, w: INV_SLOT, h: INV_SLOT }));
}
const invSlotAt = (x, y) => invSlots().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
// Drop what's in a slot at your feet (inside only, standing).
function dropSlot(slot) {
  if (!inv[slot] || player.mode !== 'inside' || !standing(player)) return;
  ITEMS.push({ kind: inv[slot], ...dropSpot(player.x + (slot === 'item' ? 0.3 : -0.3), player.y + 0.35) });
  inv[slot] = null; if (slot === 'weapon') inv.cd = 0;
  sfx.clank();
}
// A sprite icon with its cyan / green energy pixels in the power colour (like the `recolor` sprite option),
// rendered once into a small canvas.
const powerIcons = {};
function drawPowerIcon(name, cx, cy, size) {
  let c = powerIcons[name + size];
  if (!c && typeof document !== 'undefined' && document.createElement) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size * 2;
    const g = cv.getContext && cv.getContext('2d'), prev = ctx;
    if (!g) return false;
    ctx = g; const ok = drawSpriteIcon(name, size, size, size); ctx = prev;
    if (!ok) return false;
    const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data, [tr, tg, tb] = [255, 216, 74];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, m = clamp((Math.max(gg, b) - r - 0.08) / 0.2, 0, 1);
      if (m <= 0) continue;
      const v = Math.max(r, gg, b);
      d[i] = lerp(d[i], tr * v, m); d[i + 1] = lerp(d[i + 1], tg * v, m); d[i + 2] = lerp(d[i + 2], tb * v, m);
    }
    g.putImageData(im, 0, 0);
    c = powerIcons[name + size] = cv;
  }
  if (!c) return false;
  ctx.drawImage(c, cx - size, cy - size);
  return true;
}
function boltGlyph(x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  poly([[2, -12], [-6, 1], [0, 1], [-3, 12], [7, -2], [1, -2]]); ctx.fillStyle = col; ctx.fill(); stroke(1.5);
  ctx.restore();
}
// Screen space: the inventory (bottom centre) and the power panel (bottom left).
function drawSystemsHUD(top) {
  const hoverSlot = me.mode === 'inside' && standing(me) && !me.ui.panel ? invSlotAt(mouse.x, mouse.y) : null;
  for (const b of invSlots()) {
    const { slot, x, y, w, h } = b, kind = inv[slot], hov = hoverSlot === b && kind;
    rr(x, y, w, h, 10); ctx.fillStyle = hov ? 'rgba(40,44,54,0.92)' : 'rgba(10,12,18,0.85)'; ctx.fill(); stroke(hov ? 2.5 : 1.5, hov ? USE_COL : '#5a6272');
    ctx.fillStyle = '#9aa3b5'; ctx.font = '700 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(slot === 'weapon' ? 'WEAPON' : 'ITEM', x + w / 2, y + 10);
    if (kind) {
      if (!(kind === 'fuel' ? drawPowerIcon('items/icon_fuel', x + w / 2, y + h / 2, 116) : drawSpriteIcon('items/icon_' + kind, x + w / 2, y + h / 2, 116)))
        drawItemIcon(kind, x + w / 2, y + h / 2 + 2, 3.2);
      if (slot === 'weapon' && inv.cd > 0) {
        const k = Math.min(1, inv.cd / weaponCooldown(inv.weapon));
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 2, y + h - 2 - (h - 4) * k, w - 4, (h - 4) * k);
      }
      ctx.fillStyle = '#f2f4f8'; ctx.font = '600 17px system-ui, sans-serif'; ctx.textBaseline = 'bottom';
      ctx.fillText(ITEM_NAMES[kind], x + w / 2, y + h - 10);
    } else {
      ctx.fillStyle = '#6b7486'; ctx.font = '16px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText('empty', x + w / 2, y + h / 2);
    }
  }
  if (hoverSlot && inv[hoverSlot.slot]) {
    const text = `Click: drop the ${ITEM_NAMES[inv[hoverSlot.slot]]}`;
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 18, cx = hoverSlot.x + hoverSlot.w / 2, cy = hoverSlot.y - 30;
    rr(cx - w / 2, cy - 12, w, 24, 6); ctx.fillStyle = 'rgba(12,14,20,0.9)'; ctx.fill(); stroke(1.5, USE_COL);
    ctx.fillStyle = USE_COL; ctx.fillText(text, cx, cy);
  }
  ctx.textAlign = 'left';
  drawPowerPanel();
}
// Bottom left: the energy the ship has left (big, in the power colour), where it is, and the repair supplies.
function drawPowerPanel() {
  const E = shipEnergy(), R = power.reactor, x = 14, w = 262, h = 104, y = VH - h - 14;
  rr(x, y, w, h, 10); ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fill(); stroke(1.5, '#5a6272');
  const low = E.total <= 3;
  boltGlyph(x + 24, y + 26, 1.25, low && Math.sin(time * 6) > 0 ? '#ff6a4a' : POWER_COL);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '800 30px system-ui, sans-serif'; ctx.fillStyle = low ? '#ff8a7a' : POWER_COL;
  ctx.fillText(E.total, x + 42, y + 27);
  const nw = ctx.measureText(String(E.total)).width;
  ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#e8ecf4';
  ctx.fillText('ENERGY LEFT', x + 50 + nw, y + 22);
  ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#c9ced8';
  ctx.fillText(E.cells ? `incl. ${E.cells} spare cell${E.cells > 1 ? 's' : ''}` : 'no spare cells', x + 50 + nw, y + 37);
  // reactor + the three capacitors, as pips in the power colour
  const pips = (px, py, n, max, dead) => {
    for (let i = 0; i < max; i++) { rr(px + i * 9, py - 6, 7, 12, 2); ctx.fillStyle = dead ? '#5a2a26' : i < n ? POWER_COL : '#2b303a'; ctx.fill(); stroke(1); }
  };
  ctx.font = '700 12px system-ui, sans-serif';
  const ry = y + 60, rDead = broken(REACTOR);
  ctx.fillStyle = rDead || !R.fuel ? '#ff9a8a' : '#e8ecf4';
  ctx.fillText(rDead ? 'REACTOR ✖' : power.overcharge ? 'REACTOR ⚠' : 'REACTOR', x + 12, ry);
  pips(x + 92, ry, R.fuel, CELL_ENERGY, rDead);
  const cy = y + 82;
  CAPACITORS.forEach((c, i) => {
    const cx = x + 12 + i * 82, dead = capBroken(i);
    ctx.fillStyle = dead ? '#ff9a8a' : '#e8ecf4'; ctx.fillText(['LEFT', 'MID', 'RIGHT'][i], cx, cy);
    pips(cx + (i === 2 ? 40 : 34), cy, c.charge, CAP_MAX, dead);
  });
  ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'right';
  ctx.fillText(`tape ${hz.tape} · plates ${hz.plates}`, x + w - 10, ry);
  ctx.textAlign = 'left';
}
