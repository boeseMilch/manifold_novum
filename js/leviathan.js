// The infested leviathan: chapter 8's final boss (event kind `leviathan_boss`; js/organic.js keeps the old 30 s
// leviathan pass for Nightmare). Story: it isn't evil, it's sick. Leeches burrowed into its hide ("infested
// zones") and the pain drove the Mire's swarms mad. The crew blasts the infestation off; freed, it sinks away.
// ~130 units long, it swims round the ship one side at a time (front → left → right → … → behind):
//   1 THE PASS   across the bow: its dorsal FIN (LEVB_FIN_HP front-cannon hits), then down the LEFT flank: its infested
//                ZONES there (2 / 2 / 3+ players: 3) take LEVB_ZONE_HP left-cannon hits each, then round to the RIGHT
//                flank, the same with the right cannon. It moves on when the side it shows is clean. Every ~LEVB_FLICK s
//                a tail flick bumps a room on its side (a red warning on that floor LEVB_FLICK_WARN s ahead).
//   2 TOXIC GAS  T-LEVB_GAS_WARN (big HUD number, banner, ship voice), then a cloud wraps the hull for LEVB_GAS s: anyone
//                outside (spacewalk or cannon seat) when it arrives, or who goes out during it, goes down.
//   3 THE SIDE   it parks on the LEFT (then the RIGHT), its EYE opens and that side's zones regrow and glow: LEVB_WINDOW s (easy /
//                very easy: longer) to hit the eye and every glowing zone once with that side's cannon. Too slow: a
//                leech swarm on that side (LEVB_LEECHES: 2 solo … 6 with 4+; they drink that side's capacitor, the one
//                its cannon needs for the eye; never while its last swarm is still on the hull, then a slam instead) / a tail slam (room bump + a big hit), alternating, then a new window. In
//                time: it flinches and swims to the other side. Both sides done → 4.
//   4 BEHIND     out of every cannon's reach. Its BROOD crawls in through two engine vents in the reactor room (waves
//                every LEVB_WAVE s: 3 crawlers solo, +1 per extra player, at most 6; LEVB_BROOD_WAVES waves, then the vents
//                go quiet). Crawlers (dog-sized; one laser hit, or a stomp: walk into it) head for MID and drain 1 energy there, biting crew in
//                their way. Charge MID to LEVB_NEED (the power lever on MID, wedged) and hold the ENGINE OVERRIDE at the
//                stern (LEVB_OVERRIDE s; starting the hold draws MID's energy into the engine, safe from the brood; the
//                HUD line, the panel's ring and its prompt say what's missing; out of fuel everywhere: an emergency cell
//                drops into the crate, levEmergencyCell): the ENGINE BLAST burns the nest on its back →
//                FREED: the last leeches drop off, its teal glow comes back, it sinks (LEVB_SINK s), then the jump
//                drive spools (with c8's handle rule: someone pulls the handle). The jump never comes before that.
// State: org.boss (plain data, synced with org). Geometry: a closed swim loop round the ship (levLoop); the body is a
// chain of pieces hung back from the nose along it in SCREEN space (x, y·sin50), as the sprites are modelled
// (levChain: head, 6 segments, tail stock, fluke; ~140 units nose to fluke tips, joints bent at most LEVB_BEND). Targets and the shell tests use the same chain, in screen space. Drawing (tunable in one place):
// levChainPieces / drawLevBody (sprites, else procedural), drawLevMarks (target rings, missing details),
// drawLevGas, drawLevBlast, drawLevShip (vents, override panel, brood), drawLevBossScreen (T-10, window clock).

const LEVB_FIN_HP = 2, LEVB_ZONE_HP = 2, LEVB_FLICK = 25, LEVB_FLICK_WARN = 4, LEVB_GAS_WARN = 10, LEVB_GAS = 15;
const LEVB_WINDOW = [12, 16, 20], LEVB_PUNISH = 6, LEVB_SLAM_WARN = 3, LEVB_WAVE = 20, LEVB_WAVE_FIRST = 5, LEVB_SPAWN_GAP = 0.9;
// Phase 3's leech swarm: how many, by crew size (solo, 2, 3, 4+); the regular swarm event is 6.
const LEVB_LEECHES = [2, 3, 4, 6];
// The nest holds LEVB_BROOD_WAVES waves of brood, then the vents go quiet (so MID always fills in the end, even solo without a laser).
const LEVB_BROOD_WAVES = 3;
const LEVB_BROOD_SPEED = 0.9, LEVB_BITE_CD = 2, LEVB_NEED = 3, LEVB_OVERRIDE = 4, LEVB_BLAST = 3, LEVB_SINK = 8, LEVB_SWIM = 10, LEVB_HOLD_JUMP = 30;
// The brood's size (2026-10-20, the user: "they look so small that you could just defeat them by walking over them"): drawn
// LEVB_BROOD_SCALE x the modelled larva (~0.55 long -> ~1.1, dog-sized next to a crew member). Everything that depends on
// their size follows from it: the body our bolts hit (js/invader.js boltHitsBody), the reach of a bite (and of a stomp),
// the room they keep between each other, the dead splat, the slime burst. Speed and bite cooldown stay (balance as before).
const LEVB_BROOD_SCALE = 2;
const LEVB_BROOD_HIT = { r: 0.25 * LEVB_BROOD_SCALE, top: 0.17 * LEVB_BROOD_SCALE };   // (scale 1 was r 0.34, top 0.3: generous)
const LEVB_BROOD_REACH = 0.45 + 0.15 * LEVB_BROOD_SCALE;   // centre to centre: a bite (was 0.55); a booted stomp reaches as far
const LEVB_BROOD_GAP = 0.45 * LEVB_BROOD_SCALE;            // two crawlers' centres at least this far apart (they don't pile up)
// Anyone stomps a crawler (2026-10-20, the user: no gravity boots needed): a standing crew member inside, walking at least this fast, within its reach.
const LEVB_STOMP_SPEED = 1;
// The swim loop (world units): centre lines left / right / ahead / behind of the ship, corner radius.
const LEVB_GEO = { X0: -16, X1: SHIP_W + 16, Y0: -22, Y1: 41, R: 16 };
// The chain (screen units, the sprite contract, tools/blender/models/organic/leviathan_boss.py): every piece at scale 1.
// d = distance behind the nose: the neck joint J0 at d 26 (the head's origin), segment k from J_k to J_k+1 (its origin = its
// front joint), the tail stock J6 → d 128, the fluke's root there. Half-width levHW(d): the concept's whale (blunt snout,
// widest 11.4 at d ~28, a long taper to a slender stock). Each joint bends at most LEVB_BEND[i] degrees (head→seg 0 first,
// …, tail→fluke last): the body follows the swim path where it can and swings wide on tight turns, the head stays on.
const LEVB_JOINTS = [26, 41, 55, 69, 82, 95, 107], LEVB_BODY = 128, LEVB_HEAD = LEVB_JOINTS[0], LEVB_SEGS = 6;
const LEVB_BEND = [14, 22, 24, 26, 28, 30, 32, 35];
const LEVB_PROFILE = [[0, 0], [0.3, 2.7], [1, 4.8], [2.5, 7.2], [5, 9.0], [8, 9.6], [15.4, 10.8], [28.2, 11.4], [46, 10.8], [64, 9.2], [82, 6.6], [100, 4.0], [115, 2.3], [124, 1.45], [128, 1.1]];
function levHW(d) {                                    // the half-width d behind the nose (linear between the profile's knots)
  const P = LEVB_PROFILE;
  if (d <= 0 || d >= P[P.length - 1][0] + 1) return 0;
  for (let i = 1; i < P.length; i++) if (d <= P[i][0]) return lerp(P[i - 1][1], P[i][1], (d - P[i - 1][0]) / (P[i][0] - P[i - 1][0]));
  return P[P.length - 1][1];
}
// The infested zones and the nest are drawn (and hit) this much bigger than modelled (the boil is ~3 across at scale 1).
const LEVB_ZONE_SCALE = 1.5;
// Targets and details in piece-local screen units (x forward, -y = the creature's LEFT, which faces the ship).
const LEVB_SPOTS = {
  eye: { piece: 'head', at: [17, -7.1], r: 3.2 },
  fin: { piece: 0, at: [-10, -3], r: 4.5 },
  L1: { piece: 1, at: [-8, -6.2], r: 3.8 }, L2: { piece: 2, at: [-2, -5.9], r: 3.8 }, L3: { piece: 2, at: [-10, -5.4], r: 3.8 },
  R1: { piece: 3, at: [-2, -5], r: 3.8 }, R2: { piece: 3, at: [-9.5, -4.4], r: 3.8 }, R3: { piece: 4, at: [-4, -3.6], r: 3.6 },
  E1: { piece: 'head', at: [2, -8.5], r: 3.4 }, E2: { piece: 'head', at: [7.5, -3.5], r: 3.4 },   // (phase 3: zones regrow on its head, by the eye)
  nest: { piece: 3, at: [-10, -3], r: 5 },   // (far enough back that its station behind comes just after phase 3's right-side one: no extra lap)
};
// The dorsal sail sits on segment 0 (its origin 3 behind the neck joint); the left pectoral's root on the head (x, -y).
const LEVB_FIN_SEG = 0, LEVB_FIN_AT = [-3, 0], LEVB_PEC = [7, -8.65];
// The hide, fins and fluke: desaturation (0: the renders' teal is already tuned for the cold light outside) and how much the
// brightest pixels (the wet sheen down its back) light themselves.
const LEVB_DESAT = 0, LEVB_EMISSIVE = 0.12;
// Inside our ship: two engine vent grates near the stern of the reactor room, the override panel on the stern wall,
// where the brood goes (in front of the middle capacitor).
const LEVB_VENTS = [{ x: 24.8, y: 24.5 }, { x: 28.6, y: 24.3 }], LEVB_PANEL = { x: 26.6, y: 25.25 }, LEVB_CAP_AT = { x: 27.0, y: 16.45 };
const LEVB_ENGINE = { x: 22.2, y: 26.1 };
const LEVB_SPRITES = ['organic/levb_head', 'organic/levb_seg_0', 'organic/levb_seg_1', 'organic/levb_seg_2', 'organic/levb_seg_3', 'organic/levb_seg_4', 'organic/levb_seg_5', 'organic/levb_seg_tail', 'organic/levb_fluke'];

const levEasy = () => clamp(typeof mission !== 'undefined' ? mission.easy || 0 : 0, 0, 2);
const levSideName = (s) => (s === 'port' ? 'LEFT' : s === 'star' ? 'RIGHT' : s === 'front' ? 'FRONT' : 'BEHIND');

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
// The loop, counterclockwise on screen (the ship always on the creature's left): across the bow heading left,
// down the left flank, across behind heading right, up the right flank. s: world arc length.
const LEVB_LOOP = (() => {
  const { X0, X1, Y0, Y1, R } = LEVB_GEO, LT = X1 - X0 - 2 * R, LS = Y1 - Y0 - 2 * R, C = Math.PI * R / 2;
  const parts = [
    { len: LT, at: (u) => [X1 - R - u, Y0, -1, 0] },
    { len: C, arc: [X0 + R, Y0 + R, -Math.PI / 2] },
    { len: LS, at: (u) => [X0, Y0 + R + u, 0, 1] },
    { len: C, arc: [X0 + R, Y1 - R, Math.PI] },
    { len: LT, at: (u) => [X0 + R + u, Y1, 1, 0] },
    { len: C, arc: [X1 - R, Y1 - R, Math.PI / 2] },
    { len: LS, at: (u) => [X1, Y1 - R - u, 0, -1] },
    { len: C, arc: [X1 - R, Y0 + R, 0] },
  ];
  let s0 = 0; for (const p of parts) { p.s0 = s0; s0 += p.len; }
  return { parts, P: s0 };
})();
// Point and heading on the loop: [x, y, tx, ty] (world).
function levLoop(s) {
  const P = LEVB_LOOP.P; s = ((s % P) + P) % P;
  for (const p of LEVB_LOOP.parts) {
    if (s > p.s0 + p.len) continue;
    const u = s - p.s0;
    if (p.at) return p.at(u);
    const [cx, cy, a0] = p.arc, a = a0 - u / LEVB_GEO.R;          // (counterclockwise on screen: the angle falls)
    return [cx + Math.cos(a) * LEVB_GEO.R, cy + Math.sin(a) * LEVB_GEO.R, Math.sin(a), -Math.cos(a)];
  }
  return LEVB_LOOP.parts[0].at(0);
}
// The body behind the nose leaves the loop and curls outward (it never wraps round the ship), a slow ripple runs
// down it. v: world distance behind the nose along the loop.
const levSpiral = (v) => (v > 70 ? 40 * ((v - 70) / 80) ** 2 : 0);
function levPath(B, tt) {
  const SIN = GFX.SIN, out = [], amp = B.parked ? 0.4 : 0.9;
  let len = 0, px = 0, py = 0;
  for (let v = 0; v <= 210; v += 1.5) {
    const [x, y, tx, ty] = levLoop(B.s - v), ix = ty, iy = -tx;   // (inward: the creature's left)
    const off = -(B.out || 0) - levSpiral(v) + amp * Math.sin(0.09 * v - 1.4 * tt) * Math.min(1, v / 25);
    const sx = x + ix * off, sy = (y + iy * off) * SIN;
    if (out.length) len += Math.hypot(sx - px, sy - py);
    out.push([sx, sy, len]); px = sx; py = sy;
  }
  return out;
}
function levAlong(path, d) {                           // the path point d screen units behind the nose
  for (let i = 1; i < path.length; i++) if (path[i][2] >= d || i === path.length - 1) {
    const a = path[i - 1], b = path[i], k = clamp((d - a[2]) / ((b[2] - a[2]) || 1), 0, 1);
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  }
  return [path[0][0], path[0][1]];
}
// The chain: pieces { name, x, y (screen), rot, scale } nose first: 'head', 0..5 the segments, 'tail', 'fluke'.
// Laid out from the head back: the head points along the path ahead of its neck joint (averaged with the body's way, so
// it never kinks away from it); each next piece aims at where the path puts its rear joint, but bends at most LEVB_BEND
// from the piece in front, and its rear joint is where that leaves it (the pieces stay joined, it swings wide in turns).
function levChain(B, tt = B.t) {
  const path = levPath(B, tt), nose = levAlong(path, 0), D = [...LEVB_JOINTS, LEVB_BODY];
  const ang = (a, b) => Math.atan2(a[1] - b[1], a[0] - b[0]);        // the heading from b towards a
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const J = [levAlong(path, D[0])];
  const ahead = ang(nose, J[0]), body = ang(J[0], levAlong(path, D[1]));
  const rots = [ahead + 0.35 * wrap(body - ahead)];
  for (let k = 0; k < D.length - 1; k++) {
    const want = ang(J[k], levAlong(path, D[k + 1])), lim = LEVB_BEND[k] * Math.PI / 180;
    const r = rots[k] + clamp(wrap(want - rots[k]), -lim, lim), L = D[k + 1] - D[k];
    rots.push(r); J.push([J[k][0] - Math.cos(r) * L, J[k][1] - Math.sin(r) * L]);
  }
  const n = LEVB_SEGS, head = rots[0], lim = LEVB_BEND[n + 1] * Math.PI / 180;
  const pieces = { head: { name: 'head', x: J[0][0], y: J[0][1], rot: head, scale: 1 } };
  for (let k = 0; k < n; k++) pieces[k] = { name: 'seg_' + k, x: J[k][0], y: J[k][1], rot: rots[k + 1], scale: 1 };
  pieces.tail = { name: 'seg_tail', x: J[n][0], y: J[n][1], rot: rots[n + 1], scale: 1 };
  const flk = rots[n + 1] + clamp(wrap(ang(J[n + 1], levAlong(path, LEVB_BODY + 8)) - rots[n + 1]), -lim, lim);
  pieces.fluke = { name: 'fluke', x: J[n + 1][0], y: J[n + 1][1], rot: flk, scale: 1 };
  const hc = Math.cos(head), hs = Math.sin(head);
  return { path, nose: [J[0][0] + hc * LEVB_HEAD, J[0][1] + hs * LEVB_HEAD], J, pieces };
}
// A piece-local point (screen units) → screen.
function levLocal(pc, lx, ly) {
  const c = Math.cos(pc.rot), s = Math.sin(pc.rot);
  return [pc.x + (lx * c - ly * s) * pc.scale, pc.y + (lx * s + ly * c) * pc.scale];
}
function levSpotAt(ch, id) {
  const S = LEVB_SPOTS[id], pc = ch.pieces[S.piece];
  const [x, y] = levLocal(pc, S.at[0], S.at[1]);
  return { x, y, r: S.r, wx: x, wy: y / GFX.SIN };
}
// Where it parks for each step: the loop position (head) that puts the step's targets where the cannon sees them.
const levStationCache = new Map();
// frame: [w, h] (world) of a cannon's view centred on want: then every target is kept as far inside it as it can be (the
// worst one's distance from the centre, as a fraction of the half-frame), not just their average on the centre.
function levStation(key, ids, want, frame) {
  const k = key + ids.join(); if (levStationCache.has(k)) return levStationCache.get(k);
  const P = LEVB_LOOP.P, probe = { s: 0, out: 0, parked: true, t: 0 };
  let best = 0, bd = Infinity;
  const score = (s) => {
    probe.s = s; const ch = levChain(probe, 0);
    let x = 0, y = 0, worst = 0;
    for (const id of ids) {
      const p = levSpotAt(ch, id); x += p.wx; y += p.wy;
      if (frame) worst = Math.max(worst, Math.abs(p.wx - want[0]) / (frame[0] / 2), Math.abs(p.wy - want[1]) / (frame[1] / 2));
    }
    const mean = Math.hypot(x / ids.length - want[0], y / ids.length - want[1]);
    return frame ? worst + 0.01 * mean : mean;
  };
  for (let s = 0; s < P; s += 2) { const d = score(s); if (d < bd) { bd = d; best = s; } }
  for (let s = best - 2; s <= best + 2; s += 0.1) { const d = score(s); if (d < bd) { bd = d; best = s; } }
  levStationCache.set(k, best);
  return best;
}
const levNext = (B, base) => { const P = LEVB_LOOP.P; let s = base; while (s < B.s - 0.5) s += P; return s; };
const levZoneIds = (side, n) => (side === 'port' ? ['L1', 'L2', 'L3'] : ['R1', 'R2', 'R3']).slice(0, n);
function levStationFor(B, step) {
  const { X0, X1, Y0, Y1 } = LEVB_GEO;
  if (step === 'fin') return levStation('front', ['fin'], [22.2, Y0]);
  // the side steps: every target inside that cannon's frame, clear of the HUD in its top corners (the middle 75 %, 1.5 low)
  const view = (id) => { const [cx, cy, w] = GUNS.find(g => g.id === id).view; return [[cx, cy + 1.5], [w * 0.75, w * 0.62 * 0.75]]; };
  if (step === 'left') return levStation('left', levZoneIds('port', B.nz), ...view('port'));
  if (step === 'right') return levStation('right', levZoneIds('star', B.nz), ...view('star'));
  if (step === 'port' || step === 'star') return levStation(step, ['eye', 'E1', 'E2'], ...view(step));
  return levStation('behind', ['nest'], [LEVB_ENGINE.x, Y1 + 4], [4, 22]);    // (the nest right down the engine's exhaust, inside its reach)
}

// ---------------------------------------------------------------------------
// Starting it
// ---------------------------------------------------------------------------
// from: 1 (the whole fight), 2 (the gas), 3 (the sides, after the gas) or 4 (behind) — the practice panel's entries.
function startLevBoss(from = 1) {
  const n = crewSize(), nz = n >= 3 ? 3 : 2;
  const B = org.boss = {
    phase: 'p1', step: 'fin', s: 0, sTo: 0, out: 0, parked: false, t: 0, nz, fin: LEVB_FIN_HP, sink: 0,
    zones: [...levZoneIds('port', nz), ...levZoneIds('star', nz)].map(id => ({ id, side: id[0] === 'L' ? 'port' : 'star', hp: LEVB_ZONE_HP })),
    where: 'front', flick: { t: LEVB_FLICK, room: null }, slam: null, gas: null, p3: null,
    brood: [], dead: [], wave: null, blast: 0, freed: 0, splat: 0,
  };
  if (from >= 2) { B.fin = 0; for (const z of B.zones) z.hp = 0; }
  if (from === 2) { B.step = 'right'; B.where = 'star'; }
  if (from === 4) { B.phase = 'p4'; B.p3 = { side: 'star', done: ['port', 'star'] }; B.step = 'behind'; }
  else if (from === 3) { B.phase = 'p3'; levStartSide(B, 'port', true); }
  if (from === 2) levStartGas(B);
  B.sTo = levStationFor(B, B.step === 'behind' ? 'behind' : B.phase === 'p3' ? B.p3.side : B.step);
  B.s = B.sTo - 70; B.out = 40; B.arrive = true;
  if (from === 1) {
    combatBanner('THE LEVIATHAN — it\'s sick, leeches in its hide! Front cannon: hit its FIN');
    sfx.say?.('Leviathan. Very large. It appears to be. Injured.');
  } else combatBanner(`Leviathan (practice: from phase ${from})`);
  sfx.whale?.(); combat.shake = Math.max(combat.shake, 0.6);
}
function levStartSide(B, side, first = false) {
  B.p3 = { ...(B.p3 || { done: [] }), side, state: 'swim', win: 0, eye: false, glow: [], fails: B.p3?.fails || 0, t: 0 };
  B.where = side; B.parked = false;
  if (!first) combatBanner(`It flinches — and swims round to the ${levSideName(side)} side!`);
}

// ---------------------------------------------------------------------------
// Update (from updateOrganic)
// ---------------------------------------------------------------------------
function updateLevBoss(dt) {
  const B = org.boss;
  if (!B) return;
  B.t += dt; B.splat = Math.max(0, B.splat - dt);
  // swimming along the loop; parked at its station
  if (B.s < B.sTo - 0.02) {
    const left = B.sTo - B.s;
    B.s = Math.min(B.sTo, B.s + Math.min(LEVB_SWIM, 1.2 + left * 0.7) * dt); B.parked = false;
    if (B.arrive) B.out = 40 * clamp((B.sTo - B.s) / 70, 0, 1);
  } else { B.s = B.sTo; if (!B.parked) { B.parked = true; B.arrive = false; B.out = 0; levParked(B); } }
  // the jump drive waits for the fight
  if (B.phase !== 'freed' && !MISSIONS[mission.id]?.practice && isFinite(mission.jumpAt) && !mission.jump && mission.jumpAt < mission.t + LEVB_HOLD_JUMP) mission.jumpAt = mission.t + LEVB_HOLD_JUMP;
  if (B.phase === 'blast' || B.phase === 'freed') levEmergencyCell(B);
  if (B.phase === 'freed') {
    B.freed -= dt; B.sink = clamp(1 - B.freed / LEVB_SINK, 0, 1); B.out += dt * 3;
    if (B.freed <= 0) { org.boss = null; }
    return;
  }
  levShells(B);
  // tail flicks (phases 1 and 3, not in the gas or behind)
  if (B.phase === 'p1' || B.phase === 'p3') {
    const F = B.flick;
    F.t -= dt;
    if (F.t <= LEVB_FLICK_WARN && !F.room) F.room = levRoomOn(B.where);
    if (F.t <= 0) { levBump(F.room || levRoomOn(B.where), false); F.t = LEVB_FLICK; F.room = null; }
  }
  if (B.slam && (B.slam.t -= dt) <= 0) { levBump(B.slam.room, true, B.slam.side); B.slam = null; }
  if (B.phase === 'gas') levUpdateGas(B, dt);
  else if (B.phase === 'p3') levUpdateSide(B, dt);
  else if (B.phase === 'p4') levUpdateBehind(B, dt);
  else if (B.phase === 'blast') {
    B.blast -= dt; combat.shake = Math.max(combat.shake, 0.5);
    if (B.blast <= 0) levFree(B);
  }
  B.dead = B.dead.filter(d => (d.t -= dt) > 0);
}
const levRoomOn = (where) => {
  const pool = where === 'port' ? ['portGun', 'portLock'] : where === 'star' ? ['starGun', 'starLock'] : where === 'front' ? ['bridge'] : ['reactor'];
  return pool[Math.floor(Math.random() * pool.length)];
};
// A tail flick (small) or slam (large) on a room: crew inside get hurt, the hull takes the hit on that side.
function levBump(id, large, side) {
  const room = roomById(id), [cx, cy] = roomCenter(room);
  side = side || (room.col === 0 ? 'port' : room.col === 2 ? 'star' : 'front');
  combat.shake = 1; sfx.explosion();
  for (const c of crew) if (c.mode === 'inside' && roomAt(c.x, c.y) === room) hurtCrew(c);
  if (large) {
    const y = side === 'front' ? hullTopY(cx) : cy, x = side === 'front' ? cx : hullEdgeX(cy, side);
    shipHit(side, x, y, true); combatBanner(`TAIL SLAM on the ${room.name.toLowerCase()}!`);
  } else { smallHit(side, cx, cy); combatBanner(`Its tail flicked the ${room.name.toLowerCase()}!`); }
}
// Arrived where the step wants it: phase 3 opens its eye, phase 4 opens the vents.
function levParked(B) {
  if (B.phase === 'p1') {
    const where = { fin: 'front', left: 'port', right: 'star' }[B.step];
    B.where = where;
    if (B.step === 'left') combatBanner(`LEFT flank: ${B.zones.filter(z => z.side === 'port').length} infested zones — left cannon, 2 hits each!`);
    if (B.step === 'right') combatBanner(`RIGHT flank: ${B.zones.filter(z => z.side === 'star').length} infested zones — right cannon, 2 hits each!`);
  } else if (B.phase === 'p3') levOpenEye(B);
  else if (B.phase === 'p4' && !B.wave) {
    B.where = 'behind'; B.wave = { next: LEVB_WAVE_FIRST, queue: 0, spawn: 0, vent: 0, n: 0 };
    combatBanner('It\'s BEHIND us, out of reach — charge MID to 3, then the OVERRIDE at the stern!');
    sfx.say?.('Manual engine override available. Charge the middle capacitor.'); sfx.whale?.();
  }
}
function levOpenEye(B) {
  const P = B.p3;
  Object.assign(P, { state: 'open', win: LEVB_WINDOW[levEasy()], eye: false, glow: [{ id: 'E1', hit: false }, { id: 'E2', hit: false }] });
  combatBanner(`Its EYE opens — ${levSideName(P.side)} cannon: the eye + the glowing zones in ${P.win} s!`); sfx.alarm?.();
}
// Our shells: the step's targets, else a splat on its hide where they cross its back. Phase 1's fin and zones count as
// soon as they're out on their side of the ship and in that cannon's view, also while it's still swimming into place (you
// see them coming, so a hit counts: 2026-10-17, the user couldn't hit the right flank's zones as they swam up); the eye
// only once parked.
function levTargets(B, ch) {
  if (B.phase === 'p1') {
    const ids = B.step === 'fin' ? (B.fin > 0 ? ['fin'] : []) : B.zones.filter(z => z.side === (B.step === 'left' ? 'port' : 'star') && z.hp > 0).map(z => z.id);
    if (B.parked || !ids.length) return ids;
    ch = ch || levChain(B);
    const g = GUNS.find(q => q.id === { fin: 'front', left: 'port', right: 'star' }[B.step]), [cx, cy, w] = g.view;
    const out = (id) => {
      const p = levSpotAt(ch, id);
      return (B.step === 'fin' ? p.wy < -6 : B.step === 'left' ? p.wx < -3 : p.wx > SHIP_W + 3) && Math.abs(p.wx - cx) < w / 2 && Math.abs(p.wy - cy) < w * 0.31;
    };
    return ids.filter(out);
  }
  if (!B.parked) return [];
  if (B.phase === 'p3' && B.p3.state === 'open') return [...(B.p3.eye ? [] : ['eye']), ...B.p3.glow.filter(g => !g.hit).map(g => g.id)];
  return [];
}
function levShells(B) {
  if (!combat.shells.length) return;
  const ch = levChain(B), SIN = GFX.SIN, ids = levTargets(B, ch), spots = ids.map(id => ({ id, ...levSpotAt(ch, id) }));
  const body = [ch.nose, ...ch.J];
  for (const s of combat.shells) {
    if (s.dead) continue;
    const dt = 1 / 60, x0 = s.x - s.vx * dt, y0 = (s.y - s.vy * dt) * SIN, x1 = s.x, y1 = s.y * SIN;
    const hit = spots.find(p => segCircle(x0, y0, x1, y1, p.x, p.y, p.r));
    if (hit) { s.dead = true; levHit(B, hit.id, hit); continue; }
    for (let i = 1; i < body.length; i++) {               // across its back: a dull splat (shells don't fly through it)
      const [ax, ay] = body[i - 1], [bx, by] = body[i], w = 0.35 * levHW(i < 2 ? LEVB_HEAD * 0.6 : LEVB_JOINTS[Math.min(i - 2, LEVB_SEGS)] ?? LEVB_BODY);
      if (segDist(x1, y1, ax, ay, bx, by) < w) {
        s.dead = true; B.splat = 0.3;
        for (let k = 0; k < 6; k++) combatFx(s.x, s.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.5, k % 2 ? '#2a4a5e' : '#7ab0c0', 0.12);
        sfx.clank?.(); break;
      }
    }
  }
  combat.shells = combat.shells.filter(s => !s.dead);
}
function levHit(B, id, p) {
  sfx.squelch?.(); sfx.alienHurt?.();
  for (let i = 0; i < 10; i++) combatFx(p.wx, p.wy, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, ['#c8ff6e', '#ff8aa0', '#9cff5a'][i % 3], 0.14);
  combatFlip('fx/hit_spark', p.wx, p.wy, 1.4);
  if (B.phase === 'p1') {
    if (id === 'fin') {
      B.fin--; combatBanner(B.fin > 0 ? `FIN hit (${LEVB_FIN_HP - B.fin}/${LEVB_FIN_HP})` : `FIN ${LEVB_FIN_HP}/${LEVB_FIN_HP} — it swims on, down your LEFT flank!`);
      if (B.fin <= 0) { B.step = 'left'; B.parked = false; B.sTo = levNext(B, levStationFor(B, 'left')); combat.shake = Math.max(combat.shake, 0.4); sfx.whale?.(); }
      return;
    }
    const z = B.zones.find(q => q.id === id); if (!z) return;
    z.hp--; slimeBurst(p.wx, p.wy, z.hp ? 8 : 18);
    const left = B.zones.filter(q => q.side === z.side && q.hp > 0).length;
    combatBanner(z.hp ? 'Infested zone hit — once more!' : left ? `Zone blasted clean! ${left} left on this side` : `${levSideName(z.side)} flank clean!`);
    if (!left) {
      if (z.side === 'port') { B.step = 'right'; B.parked = false; B.sTo = levNext(B, levStationFor(B, 'right')); combatBanner('LEFT flank clean — it swims round to the RIGHT!'); sfx.whale?.(); }
      else levStartGas(B);
    }
    return;
  }
  const P = B.p3;
  if (id === 'eye') P.eye = true; else { const g = P.glow.find(q => q.id === id); if (g) g.hit = true; slimeBurst(p.wx, p.wy, 14); }
  if (P.eye && P.glow.every(g => g.hit)) {
    P.done.push(P.side); combat.shake = Math.max(combat.shake, 0.7); sfx.whale?.();
    if (P.done.length >= 2) {
      B.phase = 'p4'; B.step = 'behind'; P.state = 'swim'; B.parked = false; B.sTo = levNext(B, levStationFor(B, 'behind'));
      combatBanner('It flinches and dives — it\'s swimming round BEHIND us!');
    } else { levStartSide(B, P.side === 'port' ? 'star' : 'port'); B.sTo = levNext(B, levStationFor(B, B.p3.side)); }   // (B.p3: the new side's)
  } else combatBanner(id === 'eye' ? 'Hit the EYE! Now the glowing zones' : 'Glowing zone hit!');
}
function levStartGas(B) {
  B.phase = 'gas'; B.gas = { warn: LEVB_GAS_WARN, t: LEVB_GAS };
  combatBanner('Its gills open — TOXIC GAS in 10 s! Everyone inside!'); sfx.alarm?.();
  sfx.say?.('Toxic gas in ten seconds. Everyone inside.');
}
function levUpdateGas(B, dt) {
  const G = B.gas;
  if (G.warn > 0) {
    G.warn -= dt;
    if (G.warn <= 0) { combatBanner('TOXIC GAS round the hull — stay inside!'); sfx.rumble?.(); }
    return;
  }
  for (const c of crew) if (isOutside(c) && standing(c)) levGasDown(c);
  if ((G.t -= dt) <= 0) {
    B.gas = null; combatBanner('The gas has cleared');
    B.phase = 'p3'; levStartSide(B, 'port', true); B.sTo = levNext(B, levStationFor(B, B.p3.side));   // (left first, then right: the way it swims)
    combatBanner(`The gas has cleared — it turns to the ${levSideName(B.p3.side)} side…`);
  }
}
// The gas: out cold where you are (spacewalkers float, gunners slump in the seat); treated as usual afterwards.
function levGasDown(c) {
  const a = c.armor; c.armor = 0;                    // (a vest doesn't filter air)
  hurtCrew(c, c.health === 'hurt' ? 1 : 2); c.armor = a;
  combatBanner(`${c.name} breathed the gas — down!`);
}
function levUpdateSide(B, dt) {
  const P = B.p3;
  if (P.state === 'open') {
    P.win -= dt;
    if (P.win <= 0) {                                    // too slow: a leech swarm / a tail slam, alternating
      const leeches = (P.fails++ % 2) === 0 && !org.leeches.length;   // (no second swarm on top of the first)
      if (leeches) { spawnLeeches(P.side, LEVB_LEECHES[Math.min(crewSize(), LEVB_LEECHES.length) - 1]); combatBanner(`Too slow! It spits a LEECH SWARM at the ${levSideName(P.side)} side — they'll drink that cannon's capacitor dry!`); }
      else { B.slam = { t: LEVB_SLAM_WARN, room: levRoomOn(P.side), side: P.side }; combatBanner(`Too slow! Its tail rises — get out of the ${roomById(B.slam.room).name.toLowerCase()}!`); }
      P.state = 'punish'; P.t = LEVB_PUNISH; P.glow = [];
    }
  } else if (P.state === 'punish' && (P.t -= dt) <= 0) levOpenEye(B);
}
function levUpdateBehind(B, dt) {
  const W = B.wave;
  if (W) {
    if ((W.next -= dt) <= 0) { W.next = LEVB_WAVE; W.queue += Math.min(6, 3 + crewSize() - 1); W.n++; combatBanner(`Brood in the reactor room! They're going for the MID capacitor — shoot them or stomp them`); sfx.squelch?.(); }
    if (W.queue > 0 && (W.spawn -= dt) <= 0) {
      const v = LEVB_VENTS[W.vent++ % LEVB_VENTS.length];
      B.brood.push({ id: newUid(), x: v.x, y: v.y, hp: 1, t: Math.random() * 3, bite: 0, face: -Math.PI / 2 });
      W.queue--; W.spawn = LEVB_SPAWN_GAP;
    }
    if (W.n >= LEVB_BROOD_WAVES && !W.queue && !W.spent) { W.spent = true; W.next = Infinity; }   // (the nest's brood is spent)
    if (W.spent && !W.quiet && !B.brood.length) { W.quiet = true; combatBanner('The vents go quiet — its brood is spent. Charge MID!'); }
  }
  // the override, once started, has drawn its LEVB_NEED energy out of MID into the engine: the brood can't get at it
  if (!B.charged && crew.some(c => c.hold?.id === 'levOverride') && CAPACITORS[1].charge >= LEVB_NEED && !broken(CAPACITORS[1])) {
    CAPACITORS[1].charge -= LEVB_NEED; B.charged = true;
    combatBanner('Override engaged: MID\'s energy is in the engine now — keep holding!'); sfx.clank();
  }
  levEmergencyCell(B);
  for (const w of B.brood) {
    w.t += dt; w.bite = Math.max(0, w.bite - dt);
    const stomper = crew.find(c => levStomps(c, w));   // (before its bite: walking into it squashes it, even mid-bite)
    if (stomper) { levHurtBrood(w, 1, stomper); continue; }
    const victim = crew.find(c => c.mode === 'inside' && standing(c) && Math.hypot(c.x - w.x, c.y - w.y) < LEVB_BROOD_REACH);
    if (victim && w.bite <= 0) { hurtCrew(victim, 1); w.bite = LEVB_BITE_CD; w.pause = 0.6; combatBanner(`A brood crawler bit ${victim.name}!`); sfx.spit?.(); }
    if ((w.pause = Math.max(0, (w.pause || 0) - dt)) > 0) continue;
    const dx = LEVB_CAP_AT.x - w.x, dy = LEVB_CAP_AT.y - w.y, d = Math.hypot(dx, dy);
    w.face = Math.atan2(dy, dx);
    if (d < 0.25) {
      w.hp = 0; const cap = CAPACITORS[1];
      if (cap.charge > 0) { cap.charge--; combatBanner(`A crawler drained the middle capacitor! MID ${Math.min(cap.charge, LEVB_NEED)}/${LEVB_NEED}`); }
      levSlime(w, 10); sfx.spark?.();
      continue;
    }
    const sp = LEVB_BROOD_SPEED * (0.85 + 0.3 * Math.abs(Math.sin(w.t * 5))) * dt;
    w.x += dx / d * Math.min(d, sp); w.y += dy / d * Math.min(d, sp);
  }
  B.brood = B.brood.filter(w => w.hp > 0);
  levBroodSpacing(B.brood);
}
// They keep LEVB_BROOD_GAP between them (each pair pushed apart by half its overlap): a wave is a pack, not a pile.
function levBroodSpacing(list) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= LEVB_BROOD_GAP) continue;
    if (d < 1e-4) { dx = 1; dy = 0; d = 1e-4; }
    const k = (LEVB_BROOD_GAP - d) / 2 / Math.max(d, 1e-4);
    a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
  }
}
// Does crew member c stomp crawler w? Standing (not down / out), inside, walking into it.
const levStomps = (c, w) => c.mode === 'inside' && standing(c) && Math.hypot(c.vx || 0, c.vy || 0) >= LEVB_STOMP_SPEED
  && Math.hypot(c.x - w.x, c.y - w.y) < LEVB_BROOD_REACH;
const levSlime = (w, n) => slimeBurst(w.x, w.y, Math.round(n * (1 + LEVB_BROOD_SCALE) / 2), 0.1 * Math.sqrt(LEVB_BROOD_SCALE));
// Hand lasers / blasters / wrenches (js/invader.js boltHitsBody): the brood they can hit.
const levBrood = () => (org.boss?.brood || []);
// by: the crew member who stomped it (levStomps): a flatter splat, a squelch, a stumble.
function levHurtBrood(w, dmg = 1, by = null) {
  w.hp -= dmg;
  if (w.hp > 0) return;
  levSlime(w, by ? 16 : 12); org.boss?.dead.push({ x: w.x, y: w.y, face: w.face, t: 6, ...(by ? { stomp: 1 } : {}) });
  if (by) {
    by.vx *= 0.3; by.vy *= 0.3;                   // (the tiny pause: the step lands, then you walk on)
    combatBanner(`${by.name} stomped a brood crawler!`); sfx.clank?.();
  }
}
// The engine override at the stern: hold click (or E) for LEVB_OVERRIDE s with LEVB_NEED energy in MID. Starting the hold
// draws that energy out of MID into the engine (B.charged, levUpdateBehind): from then on the crawlers can't drain it, and a
// hold that's broken off (a bite, a step away) can simply be picked up again.
const levOverrideOn = (B = org.boss) => !!B && (B.phase === 'p4' || B.phase === 'blast') && B.parked;
// What still has to be done, for the panel's prompt, the HUD line and the sidebar.
function levOverrideStatus(short = false) {
  const B = org.boss, cap = CAPACITORS[1], mid = `MID ${Math.min(cap.charge, LEVB_NEED)}/${LEVB_NEED}`;
  if (B.charged) return { ok: true, text: 'Engine charged — hold E at the OVERRIDE panel (stern)' };
  if (broken(cap)) return { ok: false, text: `needs ${mid}: repair the middle capacitor first` };
  if (cap.charge >= LEVB_NEED) return { ok: true, text: `${mid} — quick, hold E at the OVERRIDE panel (stern) before the brood drains it` };
  const lever = power.lever, onMid = power.patch[lever.pos] === 1;
  const how = broken(LEVER) ? 'repair the power lever' : !onMid ? 'power lever to MID, then hold E on it to wedge it'
    : !lever.jammed ? 'hold E on the power lever to wedge it on MID' : 'lever wedged on MID';
  const more = broken(REACTOR) ? ' · repair the reactor' : power.reactor.fuel > 0 ? '' : ' · reactor empty: load a fuel cell';
  return { ok: false, text: `needs ${mid}: ${how}${more}${B.brood.length && !short ? ` · shoot or stomp the brood` : ''}` };
}
function levClickTarget(mx, my) {
  const P = LEVB_PANEL;
  if (Math.hypot(mx - P.x, my - P.y) > 0.7) return null;
  const t = { x: P.x, y: P.y, r: 0.7 }, B = org.boss;
  if (!near(P.x, P.y)) return { ...t, text: 'Engine manual override — get closer', ok: false };
  if (!B || B.phase === 'freed') return { ...t, text: 'Engine manual override (for emergencies only)', ok: false };
  if (B.phase === 'blast') return { ...t, text: 'The engine is firing!', ok: false };
  if (!levOverrideOn(B)) return { ...t, text: 'Engine override — nothing behind us to burn', ok: false };
  const st = levOverrideStatus(true);
  if (!st.ok) return { ...t, text: `Override — ${st.text}`, ok: false };
  return holdTarget('levOverride', LEVB_OVERRIDE, `Hold click: MANUAL OVERRIDE — fire the engine into its back (${LEVB_OVERRIDE} s${B.charged ? ', charged' : `, ${LEVB_NEED} MID energy`})`, P.x, P.y, 0.7, () => levBlast());
}
// Standing by the panel while it can't run yet: the prompt says why and what to do (E / click have nothing to do there).
function levAct() {
  const P = LEVB_PANEL, B = org.boss;
  if (!levOverrideOn(B) || B.phase !== 'p4' || Math.hypot(player.x - P.x, player.y - P.y) > REACH) return false;
  const st = levOverrideStatus(true);
  if (st.ok) return false;                               // (ready: E's own prompt, "Hold E: MANUAL OVERRIDE …")
  act({ text: `Override — ${st.text}`, at: { x: P.x, y: P.y, r: 0.7 } });
  return true;
}
// Its use ring (drawUseMarks), while it can be used.
const levUseSpots = () => (levOverrideOn() ? [{ x: LEVB_PANEL.x, y: LEVB_PANEL.y, r: 0.6 }] : []);
// No fuel left anywhere (reactor, crate, a cell lying about or carried) and MID can't reach what's still needed (the
// override's LEVB_NEED, then 1 for the jump): the engine's own emergency cell drops into the crate. Never a softlock.
function levEmergencyCell(B) {
  const cap = CAPACITORS[1], coming = power.bolts.filter(b => !b.done && b.to === 1).length;
  const need = (B.charged || B.phase !== 'p4' ? 0 : LEVB_NEED) + 1;
  const fuel = power.reactor.fuel > 0 || power.reserve > 0 || ITEMS.some(it => it.kind === 'fuel') || crew.some(c => c.inv?.item === 'fuel');
  if (fuel || cap.charge + coming >= need) return;
  power.reserve++;
  combatBanner('Out of fuel — the engine\'s EMERGENCY CELL drops into the fuel crate: load it into the reactor!'); sfx.clank();
  sfx.say?.('Emergency fuel cell released.');
}
function levBlast() {
  const B = org.boss, cap = CAPACITORS[1];
  if (!B || B.phase !== 'p4') return;
  if (!B.charged) { if (cap.charge < LEVB_NEED) return; cap.charge -= LEVB_NEED; B.charged = true; }
  B.phase = 'blast'; B.blast = LEVB_BLAST;
  combatBanner('ENGINE BLAST — burning the nest off its back!'); sfx.explosion(); sfx.whoosh?.(); combat.shake = 1;
}
function levFree(B) {
  B.phase = 'freed'; B.freed = LEVB_SINK; B.wave = null; B.parked = true;
  for (const w of B.brood) levSlime(w, 10);
  B.brood = [];
  const ch = levChain(B);
  for (const id of ['nest', 'L1', 'L2', 'R1', 'R2', 'E1', 'E2']) { const p = levSpotAt(ch, id); for (let i = 0; i < 6; i++) combatFx(p.wx, p.wy, (Math.random() - 0.5) * 4, Math.random() * 3, 1.4, '#ff6a7a', 0.18); }
  combatBanner('It\'s free.'); sfx.whale?.();
  sfx.say?.('The creature is. Free.');
  if (!MISSIONS[mission.id]?.practice && !mission.jump) mission.jumpAt = mission.t + LEVB_SINK;   // the drive spools once it's gone
}

// ---------------------------------------------------------------------------
// Hooks into the mission
// ---------------------------------------------------------------------------
EVENT_RUNNERS.leviathan_boss = () => startLevBoss(1);
EVENT_LABELS.leviathan_boss = () => 'Leviathan — front';
ESSENTIAL_KINDS.add('leviathan_boss'); COMBAT_KINDS.add('leviathan_boss');

// The sidebar plate: the phase and what to hit.
function levBossPlates(add) {
  const B = org.boss;
  if (!B) return;
  const cap = CAPACITORS[1], z = (side) => B.zones.filter(q => q.side === side && q.hp > 0).length;
  let sub = '';
  if (B.phase === 'p1') {
    if (!B.parked) sub = B.step === 'fin' ? 'crossing the bow…' : `swimming to the ${B.step.toUpperCase()} flank…`;
    else if (B.step === 'fin') sub = `Hit its FIN with the front cannon (${LEVB_FIN_HP - B.fin}/${LEVB_FIN_HP})`;
    else sub = `${B.step.toUpperCase()} flank: ${z(B.step === 'left' ? 'port' : 'star')} infested zones left · ${B.step} cannon`;
  } else if (B.phase === 'gas') sub = B.gas.warn > 0 ? `T-${Math.ceil(B.gas.warn)}: get inside!` : `toxic gas outside · ${Math.ceil(B.gas.t)} s · stay in`;
  else if (B.phase === 'p3') {
    const P = B.p3;
    sub = P.state === 'swim' ? `swimming to the ${levSideName(P.side)} side…` : P.state === 'open' ? `Eye + zones in ${Math.ceil(P.win)} s · ${levSideName(P.side).toLowerCase()} cannon (${(P.eye ? 1 : 0) + P.glow.filter(g => g.hit).length}/${1 + P.glow.length})` : 'too slow — brace!';
  } else if (B.phase === 'p4') sub = !B.parked ? 'swimming round behind us…' : `${B.brood.length ? 'Brood in the reactor room! · ' : ''}${B.charged ? 'engine charged' : `MID ${Math.min(cap.charge, LEVB_NEED)}/${LEVB_NEED}`} · engine override at the stern`;
  else if (B.phase === 'blast') sub = 'ENGINE BLAST';
  else sub = 'It\'s free.';
  add('levboss', { icon: 'unknown', title: B.phase === 'freed' ? 'THE LEVIATHAN' : `LEVIATHAN · ${{ p1: 'THE PASS', gas: 'TOXIC GAS', p3: 'THE SIDE', p4: 'BEHIND', blast: 'BEHIND' }[B.phase] || ''}`, sub, stripe: B.phase === 'freed' ? '#4ad0b0' : '#c8ff6e', red: B.phase !== 'freed', wrap: true });
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Sprites: the pieces on the 'under' layer, nose last (in front); positions are screen-space chain points turned
// back into world points (y / sin50). Without them: a procedural body in the same pieces (drawLevPieceFallback).
function levState(B) {                                  // which zone sprites, the eye, the dorsal fin
  const st = {};
  for (const z of B.zones) st[z.id] = z.hp <= 0 ? 'scar' : z.hp < LEVB_ZONE_HP ? 'hit1' : 'zone';
  if (B.phase === 'p3' && B.p3?.glow?.length) for (const g of B.p3.glow) st[g.id] = g.hit ? 'scar' : 'glow';
  if (B.phase === 'p3' || B.phase === 'p4') { if (!st.E1) st.E1 = 'scar'; if (!st.E2) st.E2 = 'scar'; }
  if (B.phase === 'blast' || B.phase === 'freed') for (const k in st) st[k] = 'scar';
  st.eye = B.phase === 'p3' && B.p3?.state === 'open' ? (B.p3.eye ? 'hit' : 'open') : B.phase === 'freed' ? 'open' : 'closed';
  st.fin = B.fin >= LEVB_FIN_HP ? 'ok' : B.fin > 0 ? 'hit1' : 'hit2';
  st.nest = B.phase === 'freed' || (B.phase === 'blast' && B.blast < LEVB_BLAST / 2) ? 'burnt' : 'live';
  return st;
}
let levFallbacks = [];                                  // details whose sprite isn't there: drawn by drawLevMarks
function levSprite(name, frame, pc, lx, ly, o = {}) {
  const [x, y] = levLocal(pc, lx, ly), B = org.boss, k = 1 - 0.35 * (B?.sink || 0);
  return GFX.on && GFX.sprite(name, frame, x, y / GFX.SIN, 0, { layer: 'under', rot: pc.rot + (o.rotAdd || 0), scale: pc.scale * (o.scale || 1) * k, flip: o.flip, alpha: (o.alpha ?? 1) * (1 - (B?.sink || 0)), emissive: o.emissive, unlit: o.unlit, desat: o.desat });
}
function drawLevBody(t) {
  const B = org.boss;
  if (!B) return;
  const ch = levChain(B, B.t), P = ch.pieces, st = levState(B);
  levFallbacks = [];
  const order = ['fluke', 'tail', 5, 4, 3, 2, 1, 0, 'head'];
  const sprites = GFX.on && LEVB_SPRITES.every(n => GFX.ready(n));
  if (!sprites) { drawLevPieceFallback(P.fluke, 'fluke', t, B); drawLevBodyFallback(ch, t, B); }
  else for (const k of order) levSprite(`organic/levb_${P[k].name}`, k === 'fluke' || k === 'head' ? Math.floor(t * 3) % 4 : 0, P[k], 0, 0, { emissive: LEVB_EMISSIVE, desat: LEVB_DESAT });   // (head: 4 frames, gills; fluke: 4)
  // details: fins, zones, the nest, the eyes
  const detail = (name, frame, pc, at, o, fb) => { if (!(sprites && levSprite(name, frame, pc, at[0], at[1], o))) (sprites ? levFallbacks : { push: (f) => f() }).push(fb); };
  const fin = P[LEVB_FIN_SEG];
  detail(`organic/levb_fin_dorsal_${st.fin}`, 0, fin, LEVB_FIN_AT, { desat: LEVB_DESAT }, () => levFinFallback(fin, st.fin));
  detail('organic/levb_fin_pec', Math.floor(t * 3) % 4, P.head, LEVB_PEC, { desat: LEVB_DESAT }, () => levPecFallback(P.head, -1, t));
  detail('organic/levb_fin_pec', (Math.floor(t * 3) + 2) % 4, P.head, [LEVB_PEC[0], -LEVB_PEC[1]], { flip: true, rotAdd: Math.PI, desat: LEVB_DESAT }, () => levPecFallback(P.head, 1, t));
  for (const id of ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'E1', 'E2']) {
    if (!st[id]) continue;
    const S = LEVB_SPOTS[id], pc = P[S.piece], look = st[id];
    detail(`organic/levb_${look === 'scar' ? 'scar' : look === 'glow' ? 'zone_glow' : look === 'hit1' ? 'zone_hit1' : 'zone'}`, look === 'zone' || look === 'glow' ? Math.floor(t * 4) % 4 : 0, pc, S.at, { emissive: look === 'scar' ? 0.2 : 0.7, scale: LEVB_ZONE_SCALE }, () => levZoneFallback(pc, S.at, look, t));
  }
  const N = LEVB_SPOTS.nest;
  if (B.phase === 'p4' || B.phase === 'blast' || B.phase === 'freed' || B.where === 'behind') detail(`organic/levb_nest${st.nest === 'burnt' ? '_burnt' : ''}`, 0, P[N.piece], N.at, { emissive: 0.5, scale: LEVB_ZONE_SCALE }, () => levNestFallback(P[N.piece], N.at, st.nest, t));
  for (const f of [0, 1]) detail(`organic/levb_eye_${st.eye}`, f, P.head, [0, 0], { emissive: 0.6 }, () => levEyeFallback(P.head, f ? 1 : -1, st.eye));
  levBodyState = { ch, st };
}
let levBodyState = null;
// The procedural body: pieces in their own screen-space frame (ctx at the piece's world point, y unsquashed).
function levPieceCtx(pc, fn, B = org.boss) {
  const k = 1 - 0.35 * (B?.sink || 0);
  ctx.save(); ctx.translate(L(pc.x), L(pc.y / GFX.SIN)); ctx.scale(1, 1 / GFX.SIN); ctx.rotate(pc.rot); ctx.scale(pc.scale * k, pc.scale * k);
  ctx.globalAlpha *= 1 - (B?.sink || 0);
  fn(); ctx.restore();
}
const LEVB_SKIN = ['#173446', '#24506a', '#2f6680'];
// The procedural body: one smooth outline along the chain (head to tail tip), widths as the pieces' (W × their scale).
function drawLevBodyFallback(ch, t, B) {
  const end = LEVB_BODY, k = 1 - 0.35 * (B.sink || 0), cx = ch.J[LEVB_SEGS][0], cy = ch.J[LEVB_SEGS][1];
  const D = [0, ...LEVB_JOINTS, LEVB_BODY], C = [ch.nose, ...ch.J];
  const at = (d) => { let i = 1; while (i < D.length - 1 && d > D[i]) i++; const u = (d - D[i - 1]) / (D[i] - D[i - 1]); return [lerp(C[i - 1][0], C[i][0], u), lerp(C[i - 1][1], C[i][1], u)]; };
  const pts = [];
  for (let d = 0.3; d <= end; d += 2) {
    const [x, y] = at(d), [x2, y2] = at(Math.min(end, d + 1)), a = Math.atan2(y2 - y, x2 - x);   // (a: towards the tail)
    pts.push({ x, y, nx: -Math.sin(a), ny: Math.cos(a), w: Math.max(0.6, levHW(d)) });
  }
  ctx.save(); ctx.scale(1, 1 / GFX.SIN);
  ctx.translate(L(cx), L(cy)); ctx.scale(k, k); ctx.translate(-L(cx), -L(cy));      // (sinking: smaller)
  ctx.globalAlpha *= 1 - (B.sink || 0);
  const edge = (sd) => pts.map(p => [L(p.x + p.nx * p.w * sd), L(p.y + p.ny * p.w * sd)]);
  const left = edge(1), right = edge(-1).reverse();
  ctx.beginPath(); ctx.moveTo(...left[0]);
  const all = [...left, ...right];
  for (let i = 1; i < all.length - 1; i++) ctx.quadraticCurveTo(all[i][0], all[i][1], (all[i][0] + all[i + 1][0]) / 2, (all[i][1] + all[i + 1][1]) / 2);
  ctx.closePath();
  ctx.fillStyle = LEVB_SKIN[1]; ctx.fill(); stroke(3);
  ctx.save(); ctx.clip();
  ctx.lineCap = 'round';                                // a lighter back down the middle, dark flanks
  for (const [w, col] of [[1.0, LEVB_SKIN[0]], [0.6, LEVB_SKIN[1]], [0.25, LEVB_SKIN[2]]]) {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(L(p.x), L(p.y)) : ctx.moveTo(L(p.x), L(p.y))));
    ctx.strokeStyle = col; ctx.lineWidth = L(16 * w); ctx.stroke();
  }
  const sick = B.phase !== 'freed';                    // photophores: dim while it's sick, its own teal glow once free
  pts.forEach((p, i) => {
    if (i % 2 || i < 3) return;
    const a = sick ? 0.22 : 0.5 + 0.4 * Math.sin(t * 3 - i * 0.3);
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(L(p.x + p.nx * p.w * 0.45 * sd), L(p.y + p.ny * p.w * 0.45 * sd), L(0.4 + 0.15 * (i % 3)), 0, TAU); ctx.fillStyle = `rgba(122,240,255,${a})`; ctx.fill(); }
  });
  ctx.restore(); ctx.restore();
}
function drawLevPieceFallback(pc, k, t, B) {
  levPieceCtx(pc, () => {
    const sick = B.phase !== 'freed';
    const body = (x0, x1, w0, w1) => {
      ctx.beginPath(); ctx.moveTo(L(x0), 0);
      ctx.bezierCurveTo(L(x0 - 1), -L(w0), L(x1 + 2), -L(w1), L(x1), 0);
      ctx.bezierCurveTo(L(x1 + 2), L(w1), L(x0 - 1), L(w0), L(x0), 0); ctx.closePath();
      const g = ctx.createLinearGradient(0, -L(Math.max(w0, w1)), 0, L(Math.max(w0, w1)));
      g.addColorStop(0, LEVB_SKIN[2]); g.addColorStop(0.5, LEVB_SKIN[1]); g.addColorStop(1, LEVB_SKIN[0]);
      ctx.fillStyle = g; ctx.fill(); stroke(3);
    };
    if (k === 'head') {
      ctx.beginPath(); ctx.moveTo(-L(2.5), -L(9.5));
      ctx.bezierCurveTo(L(8), -L(11), L(22), -L(7), L(22.5), 0); ctx.bezierCurveTo(L(22), L(7), L(8), L(11), -L(2.5), L(9.5)); ctx.closePath();
      const g = ctx.createLinearGradient(0, -L(10), 0, L(10)); g.addColorStop(0, LEVB_SKIN[2]); g.addColorStop(1, LEVB_SKIN[0]);
      ctx.fillStyle = g; ctx.fill(); stroke(3);
      ctx.strokeStyle = 'rgba(200,230,240,0.35)'; ctx.lineWidth = 2;   // gill slits
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(L(1 + i * 1.4), sd * L(6.5)); ctx.lineTo(L(0.4 + i * 1.4), sd * L(8.8)); ctx.stroke(); }
    } else if (k === 'tail') body(1, -26, 7, 2.2);
    else if (k === 'fluke') {
      const sw = Math.sin(t * 1.3) * L(1.5);
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(L(1), 0); ctx.quadraticCurveTo(-L(6), sd * L(4) + sw, -L(14), sd * L(12) + sw); ctx.quadraticCurveTo(-L(7), sd * L(3), -L(9), 0); ctx.closePath(); ctx.fillStyle = LEVB_SKIN[1]; ctx.fill(); stroke(3); }
    } else body(2.5, -18, 10, 9);
    // photophores down its back: dim where it's sick, its own teal glow once free
    const glow = sick ? 0.25 : 0.55 + 0.4 * Math.sin(t * 3 - (typeof k === 'number' ? k : 0));
    const n = k === 'head' ? 3 : k === 'fluke' ? 0 : 4, x0 = k === 'head' ? 4 : -2, step = k === 'tail' ? -6 : -4;
    for (let i = 0; i < n; i++) for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(L(x0 + i * step), sd * L(2.6), L(0.45), 0, TAU); ctx.fillStyle = `rgba(122,240,255,${glow})`; ctx.fill(); }
  }, B);
}
function levFinFallback(pc, look) {
  levPieceCtx(pc, () => {                               // a curved dorsal fin, flopped to its left (towards the ship)
    ctx.beginPath(); ctx.moveTo(L(-1), L(1.5)); ctx.bezierCurveTo(L(-3), -L(3), L(-6), -L(7), L(-12), -L(8));
    ctx.bezierCurveTo(L(-10.5), -L(4.5), L(-13), -L(1), L(-16), L(1.5)); ctx.closePath();
    ctx.fillStyle = look === 'ok' ? '#3a7a92' : look === 'hit1' ? '#55707a' : '#7a4a4a'; ctx.fill(); stroke(2.5);
    ctx.strokeStyle = 'rgba(10,30,40,0.4)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L(-3 - i * 3), L(1)); ctx.quadraticCurveTo(L(-5 - i * 3), -L(3), L(-8 - i * 1.2), -L(6.5 - i * 0.5)); ctx.stroke(); }
    if (look !== 'ok') { ctx.strokeStyle = '#ff9a7a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L(-6), -L(5.5)); ctx.lineTo(L(-8), -L(1.5)); if (look === 'hit2') { ctx.moveTo(L(-11), -L(6)); ctx.lineTo(L(-10), -L(2)); } ctx.stroke(); }
  });
}
function levPecFallback(pc, sd, t) {
  levPieceCtx(pc, () => {
    ctx.translate(L(LEVB_PEC[0]), sd * -L(LEVB_PEC[1])); ctx.rotate(sd * -(2.3 + 0.15 * Math.sin(t * 0.9)));
    ctx.beginPath(); ctx.ellipse(L(5), 0, L(6), L(1.8), 0, 0, TAU); ctx.fillStyle = LEVB_SKIN[1]; ctx.fill(); stroke(2.5);
  });
}
function levZoneFallback(pc, at, look, t) {
  levPieceCtx(pc, () => {
    ctx.translate(L(at[0]), L(at[1])); ctx.rotate(-pc.rot);       // (upright on screen)
    const r = L(1.5 * LEVB_ZONE_SCALE * 0.75);
    if (look === 'scar') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fillStyle = '#d88a96'; ctx.fill(); stroke(2);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fillStyle = '#1a0c10'; ctx.fill();
      return;
    }
    const pulse = 1 + 0.08 * Math.sin(t * 5), big = look === 'hit1' ? 0.7 : 1;
    if (look === 'glow') { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); g.addColorStop(0, 'rgba(220,255,120,0.75)'); g.addColorStop(1, 'rgba(200,255,90,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 7; i++) {                       // the leeches burrowed in, wriggling
      const a = i / 7 * TAU + Math.sin(t * 2 + i) * 0.15;
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(r * 0.9 * big, 0, r * 0.75 * big, r * 0.22, 0, 0, TAU); ctx.fillStyle = '#d0606e'; ctx.fill(); stroke(1.5); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75 * big * pulse, 0, TAU); ctx.fillStyle = look === 'glow' ? '#eaff8a' : '#b8e070'; ctx.fill(); stroke(2);
  });
}
function levNestFallback(pc, at, look, t) {
  levPieceCtx(pc, () => {
    ctx.translate(L(at[0]), L(at[1]));
    const r = L(2.6 * LEVB_ZONE_SCALE);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = look === 'burnt' ? '#2a1a14' : '#8a4a50'; ctx.fill(); stroke(2.5);
    if (look !== 'burnt') for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.35, r * 0.12, a, 0, TAU); ctx.fillStyle = i % 2 ? '#e8d8a0' : '#d0606e'; ctx.fill(); }
    else for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((i - 2) * r * 0.3, Math.sin(i * 2) * r * 0.3, 2, 0, TAU); ctx.fillStyle = '#ff8a3a'; ctx.fill(); }
  });
}
function levEyeFallback(pc, sd, look) {
  levPieceCtx(pc, () => {
    ctx.translate(L(LEVB_SPOTS.eye.at[0]), sd * -L(LEVB_SPOTS.eye.at[1]));
    const rx = L(1.9), ry = L(look === 'closed' ? 0.35 : 1.2);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fillStyle = look === 'hit' ? '#a03030' : look === 'closed' ? '#3a5a68' : '#e8b84a'; ctx.fill(); stroke(2.5);
    if (look === 'open') { ctx.beginPath(); ctx.ellipse(0, 0, L(0.35), ry * 0.85, 0, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
  });
}
// On top (GFX: from drawOutsideOverlays; classic: right after the body): details without sprites, target rings.
function drawLevMarks(t) {
  const B = org.boss;
  if (!B || !levBodyState) return;
  for (const f of levFallbacks) f();
  levFallbacks = [];
  const ch = levBodyState.ch;
  for (const id of levTargets(B, ch)) {
    const p = levSpotAt(ch, id), k = 0.6 + 0.4 * Math.sin(t * 6);
    ctx.save(); ctx.translate(L(p.wx), L(p.wy)); ctx.scale(1, 1 / GFX.SIN);
    ctx.beginPath(); ctx.arc(0, 0, L(p.r) + 4, 0, TAU); ctx.strokeStyle = id === 'eye' ? `rgba(255,210,90,${k})` : `rgba(210,255,110,${k})`; ctx.lineWidth = 4; ctx.stroke();
    if (B.phase === 'p1') {                              // hits left: pips
      const hp = id === 'fin' ? B.fin : B.zones.find(z => z.id === id)?.hp || 0;
      for (let i = 0; i < hp; i++) { ctx.beginPath(); ctx.arc((i - (hp - 1) / 2) * 14, -L(p.r) - 14, 5, 0, TAU); ctx.fillStyle = '#ffe08a'; ctx.fill(); stroke(1.5); }
    }
    ctx.restore();
  }
}
// The gas: a sickly green cloud wrapping the hull (under the hull sprites: the inside stays clear).
function drawLevGas(t) {
  const G = org.boss?.gas;
  if (!G) return;
  const k = G.warn > 0 ? clamp(1 - G.warn / 3, 0, 1) * 0.5 : Math.min(1, G.t / 2);
  if (k <= 0) return;
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU + t * 0.05, rx = SHIP_W / 2 + 6 + 3 * Math.sin(i * 1.7 + t * 0.6), ry = SHIP_H / 2 + 6 + 3 * Math.cos(i * 2.3 + t * 0.5);
    const x = 22.2 + Math.cos(a) * rx, y = 11.5 + Math.sin(a) * ry;
    if (GFX.on && GFX.sprite(`organic/levb_gas_${'abc'[i % 3]}`, 0, x, y, 0, { layer: 'under', unlit: true, alpha: k * 0.85, scale: 1.2 + 0.2 * Math.sin(i + t), rot: i + t * 0.1 })) continue;
    const r = L(7 + 2 * Math.sin(i * 3.1)), g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), r);
    g.addColorStop(0, `rgba(150,200,60,${0.4 * k})`); g.addColorStop(1, 'rgba(120,170,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), r, 0, TAU); ctx.fill();
  }
}
// The engine blast: a huge exhaust flame from the bell into its back.
function drawLevBlast(t) {
  const B = org.boss;
  if (!B || B.phase !== 'blast') return;
  const k = Math.min(1, (LEVB_BLAST - B.blast) * 4, B.blast * 2), E = LEVB_ENGINE;
  if (GFX.on && GFX.sprite('fx/engine_blast', Math.floor(t * 16) % 6, E.x, E.y, 0, { layer: 'top', unlit: true, alpha: k })) return;
  const len = 17 * k, x = L(E.x), y = L(E.y);
  const g = ctx.createLinearGradient(x, y, x, y + L(len));
  g.addColorStop(0, `rgba(255,255,230,${k})`); g.addColorStop(0.3, `rgba(255,200,80,${0.9 * k})`); g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - L(2.4), y);
  ctx.quadraticCurveTo(x - L(4 + Math.sin(t * 30)), y + L(len * 0.5), x, y + L(len)); ctx.quadraticCurveTo(x + L(4 + Math.cos(t * 27)), y + L(len * 0.5), x + L(2.4), y); ctx.fill();
}
// From drawCombatBack (the 'back' layer / classic: before the hull): the body, the gas.
function drawLevBossBack(t) {
  if (!org.boss) return;
  drawLevGas(t);
  drawLevBody(t);
  if (!GFX.on) { drawLevMarks(t); drawLevBlast(t); }
}
// From drawOutsideOverlays (sprites on: on top of everything outside).
function drawLevBossTop(t) { if (org.boss) { drawLevMarks(t); drawLevBlast(t); } }
// Inside the ship (from drawWorld in js/game.js, after the floors; the 'mid' layer): the vents, the override panel, the brood.
function drawLevShip(t) {
  const B = org.boss, p4 = B && (B.phase === 'p4' || B.phase === 'blast'), open = p4 && B.parked && !!B.wave;
  for (const v of LEVB_VENTS) if (!spr(`systems/engine_vent_${open ? 'open' : 'closed'}`, 0, v.x, v.y, 0, { layer: 'decal' })) {
    rr(L(v.x - 0.5), L(v.y - 0.35), L(1), L(0.7), 3); ctx.fillStyle = open ? '#1a0c10' : '#2b303a'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#5a6272'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L(v.x - 0.4 + i * 0.27), L(v.y - 0.28)); ctx.lineTo(L(v.x - 0.4 + i * 0.27), L(v.y + 0.28)); ctx.stroke(); }
    if (open) { ctx.fillStyle = `rgba(200,255,110,${0.3 + 0.2 * Math.sin(t * 4)})`; ctx.fillRect(L(v.x - 0.45), L(v.y - 0.3), L(0.9), L(0.6)); }
  }
  const P = LEVB_PANEL, cap = CAPACITORS[1], look = B?.phase === 'blast' ? 'active' : p4 && B.parked && (B.charged || cap.charge >= LEVB_NEED) ? 'ready' : 'off';
  if (!spr(`systems/engine_override_${look}`, 0, P.x, P.y, 0, { emissive: 0.8, sortY: P.y })) {
    rr(L(P.x - 0.45), L(P.y - 0.35), L(0.9), L(0.45), 3); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = look === 'active' ? '#ffb347' : look === 'ready' ? (Math.sin(t * 6) > 0 ? '#ff5a4a' : '#ffd0a0') : '#4a515e';
    ctx.fillRect(L(P.x - 0.25), L(P.y - 0.28), L(0.5), L(0.18));
    ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(232,236,244,0.7)';
    ctx.fillText('OVERRIDE', L(P.x), L(P.y - 0.05)); ctx.textAlign = 'left';
  }
  if (!B) return;
  const S = LEVB_BROOD_SCALE;
  for (const d of B.dead) {   // (a stomped one: squashed, spread wider)
    const a = Math.min(1, d.t), k = d.stomp ? 1.15 : 1;
    if (spr('organic/levb_brood_dead', GFX.frameIndex('organic/levb_brood_dead', d.face), d.x, d.y, 0, { layer: 'decal', alpha: a, scale: S * k, ...(d.stomp ? { sx: 1.2 } : {}) })) continue;
    ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(L(d.x), L(d.y), L(0.3 * S * k * (d.stomp ? 1.2 : 1)), L(0.15 * S * k), d.face, 0, TAU); ctx.fillStyle = '#6a7a40'; ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const w of B.brood) {
    if (spr('organic/levb_brood', GFX.frameIndex('organic/levb_brood', w.face, w.t * 8), w.x, w.y, 0, { emissive: 0.4, sortY: w.y, scale: S })) continue;
    ctx.save(); ctx.translate(L(w.x), L(w.y)); ctx.rotate(w.face); ctx.scale(S, S);
    for (let i = 3; i >= 0; i--) { ctx.beginPath(); ctx.ellipse(-i * 6 + Math.sin(w.t * 8 + i) * 1.5, 0, 6 - i * 0.6, 5 - i * 0.6, 0, 0, TAU); ctx.fillStyle = i ? '#e8d8a0' : '#d0606e'; ctx.fill(); stroke(1.2); }
    ctx.restore();
  }
}
function drawLevWarning(t) {
  const B = org.boss, room = B?.slam?.room || B?.flick?.room;
  if (!room || !(B.phase === 'p1' || B.phase === 'p3' || B.slam)) return;
  const r = roomById(room), k = (B.slam ? 0.18 : 0.12) * (0.6 + 0.4 * Math.sin(t * 10));
  ctx.fillStyle = `rgba(255,40,30,${k + 0.06})`;
  for (const q of r.rects) ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
}
// Screen space (from drawEncounterOverlay): the gas countdown, the green air outside, the eye's window.
function drawLevBossScreen(view, t) {
  const B = org.boss;
  if (!B) return;
  const big = (text, col, y) => {
    ctx.font = '900 64px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(text, VW / 2, y); ctx.fillStyle = col; ctx.fillText(text, VW / 2, y);
    ctx.textAlign = 'left';
  };
  if (B.phase === 'gas') {
    const G = B.gas;
    if (G.warn > 0) { big(`T-${Math.ceil(G.warn)}`, Math.sin(t * 8) > 0 ? '#c8ff6e' : '#ff6a4a', HUD_H + 110); if (isOutside(me)) big('GET INSIDE!', '#ffe08a', HUD_H + 170); }
    else screenTint([140, 200, 60], isOutside(me) ? 0.35 : 0.08);
  } else if (B.phase === 'p4' && B.parked) {      // what to do now, in words (the panel's ring shows where)
    const st = levOverrideStatus();
    ctx.font = '800 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = HUD_H + 96, title = B.charged ? 'ENGINE CHARGED' : `ENGINE OVERRIDE · MID ${Math.min(CAPACITORS[1].charge, LEVB_NEED)}/${LEVB_NEED}`;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(title, VW / 2, y); ctx.fillStyle = st.ok ? '#ffd25a' : '#c8ff6e'; ctx.fillText(title, VW / 2, y);
    ctx.font = '600 16px system-ui, sans-serif'; const sub = st.text.replace(/^needs MID \d\/\d: /, '').replace(/^MID \d\/\d — /, '');
    ctx.lineWidth = 5; ctx.strokeText(sub, VW / 2, y + 26); ctx.fillStyle = '#e8ecf4'; ctx.fillText(sub, VW / 2, y + 26);
    ctx.textAlign = 'left';
  } else if (B.phase === 'p3' && B.p3.state === 'open') big(`${Math.ceil(B.p3.win)}`, B.p3.win < 4 && Math.sin(t * 10) > 0 ? '#ff6a4a' : '#ffd25a', HUD_H + 110);
  else if (B.phase === 'freed' && B.freed > LEVB_SINK - 3) big('It\'s free.', '#7af0e0', HUD_H + 110);
}
