// Jobs on the outside of the hull: reasons to go on a spacewalk.
//   Limpet mines (a drone sticks them on; pry them off or they blow a hole), debris jamming a cannon's
//   track, a crooked radar antenna, a fuel canister drifting past (optional loot), and the three
//   jump coils: part of every ship's jump drive (they light up and spin while it spools, and flare at the
//   jump); only missions with the `coils` rule start them misaligned (and a gravity tide can knock one off).
// Spore clouds drift in from outside too, but they're not a spacewalk job any more (2026-10-22, the user: the hull
// barnacles are gone): they head for the outer airlock on their side and seep in (js/spores.js); shoot them on the way.
// Everything in `evs` is plain data (sent to browsers as is).

const evs = { mines: [], drones: [], spores: [], cloud: null, jams: {}, antenna: true, canister: null, coils: [] };   // (cloud: the spore mother's, js/spores.js)
const MINE_TIME = 30, PRY_TIME = 2, PRY_BARE = 4, CLEAR_TIME = 3, ALIGN_TIME = 3, COIL_DELAY = 15;

// Spots just outside the hull, per side, where things can stick (and spacewalkers can reach).
const HULL_SPOTS = {
  port: [[-0.55, 10.8], [-0.55, 12.6], [-0.55, 14.6], [-0.55, 16.8], [-0.55, 21.6], [-0.55, 22.4]],
  star: [[44.95, 10.8], [44.95, 12.6], [44.95, 14.6], [44.95, 16.4], [44.95, 22.6], [44.95, 21.8]],
  front: [[17.9, -3.75], [19.6, -3.75], [21.0, -3.75], [23.6, -3.75], [25.0, -3.75], [26.6, -3.75]],
};
const ANTENNA = { x: 34.6, y: -0.15 };
const COIL_SPOTS = [{ x: -0.6, y: 13.4, name: 'left' }, { x: 45.0, y: 13.2, name: 'right' }, { x: 16.2, y: 26.75, name: 'rear' }];
// Debris jamming a cannon's track: on the gun blister behind the side cannons. The front one lies up on the
// nose wall's top (y -2.75, z 1.6) beside the turret (drawn there with depth); its spot is where that roof
// point shows on screen (y -2.75 - lift(1.6)), out in front of the nose where a spacewalker can reach it.
const JAM_SPOTS = { port: [-0.8, 8.35], star: [45.2, 8.2], front: [24.0, -4.1] };
const JAM_ROOF = { front: [-2.75, 1.6] };            // [drawn y, z] of a jam on the roof
const roomNearHull = (side, y, x) => side === 'front' ? 'bridge' : side === 'port' ? (y < SPINE_Y0 ? 'portGun' : 'portLock') : (y < SPINE_Y0 ? 'starGun' : 'starLock');
const sideCol = (side) => side === 'port' ? 0 : side === 'star' ? 2 : 1;

function resetEva(rules = {}) {
  Object.assign(evs, { mines: [], drones: [], spores: [], cloud: null, jams: {}, antenna: true, canister: null,
                       coils: COIL_SPOTS.map(c => ({ ...c, ok: !rules.coils, a: rules.coils ? 0.6 + Math.random() * 1.6 : 1.4 })) });   // (always there; misaligned only with the rule; no random draw without it: missions' random builds stay as they were)
}
function freeHullSpot(side) {
  // mines sit just off the hull: compare the places along the hull
  const along = (x, y) => side === 'front' ? x : y, used = evs.mines.filter(u => u.side === side);
  const pool = HULL_SPOTS[side].filter(([x, y]) => !used.some(u => Math.abs(along(u.x, u.y) - along(x, y)) < 0.8));
  return pool[Math.floor(Math.random() * pool.length)] || null;
}
// Drawing only: how high the top of the hull's outer wall is at (x, y), from the wall runs of js/sprites.js
// (full height 1.6, the low cutaway 0.35 before a near wall; the spine's high top); 0 without sprites.
function hullTopZ(x, y) {
  if (!GFX.on || typeof WALLS === 'undefined' || !WALLS) return 0;
  for (const v of WALLS.vRuns) if (Math.abs(x - v.x) <= 0.35 && y >= v.y0 - 0.05 && y <= v.y1 + 0.05) return y < v.step ? 1.6 : H_LOW;
  for (const h of WALLS.hRuns) if (x >= h.x0 - 0.05 && x <= h.x1 + 0.05 && (h.kind === 'back' ? y >= h.y - 0.65 && y <= h.y + 0.05 : y >= h.y - 0.05 && y <= h.y + 0.65))
    return h.kind === 'back' ? 1.6 : H_LOW;
  return 1.6;                                        // (the spine block between the decks: its high top)
}

// ---------------------------------------------------------------------------
// Spawning (mission events / debug)
// ---------------------------------------------------------------------------
const MINES_PER_DRONE = 3;   // always 3 (2026-10-17 playtest: it was a random 1-3, and a single mine made it far too easy)
function spawnMineDrone(side) {
  const n = MINES_PER_DRONE, sx = side === 'port' ? -18 : SHIP_W + 18;
  evs.drones.push({ uid: newUid(), side, x: sx, y: 6 + Math.random() * 10, left: n, spot: null, t: 0, leaving: false });
  combatBanner(`Mine drone on the ${SIDE_LABEL[side].toLowerCase()} side — it sticks limpet mines on the hull!`);
  sfx.alarm();
}
// A spore cloud: n clumps drifting in on that side, each heading for the outer airlock there (from the front: one of the
// two), where it seeps in through the seals (js/spores.js). from: [x, y] where they start (default: off that side).
const sporeTarget = (h) => [h.x + h.dir * 0.9, h.y];   // just off the hatch, against its seals
function spawnSpores(side, from = null, n = 3, quiet = false) {
  const s = side === 'port' || side === 'star' ? side : Math.random() < 0.5 ? 'port' : 'star', h = HATCHES.find(q => q.side === s), [tx, ty] = sporeTarget(h);
  const sx = from ? from[0] : s === 'port' ? -16 : SHIP_W + 16, sy0 = from ? from[1] : null;
  for (let i = 0; i < n; i++) {
    const y = sy0 !== null ? sy0 + (Math.random() - 0.5) * 1.5 : ty + (Math.random() - 0.5) * 12, x = sx - (from ? 0 : i * 3 * Math.sign(tx - sx)), sp = 1.3 + Math.random() * 0.4;
    const d = Math.hypot(tx - x, ty - y) || 1;
    evs.spores.push({ uid: newUid(), side: s, x, y, sp, vx: (tx - x) / d * sp, vy: (ty - y) / d * sp, t: Math.random() * 10, seep: 0 });
  }
  if (!quiet) combatBanner(`Spore cloud drifting in on the ${SIDE_LABEL[s].toLowerCase()} side — it's heading for the airlock! Shoot it down`);
}
function jamCannon(id) {
  if (evs.jams[id]) return;
  evs.jams[id] = true;
  combatBanner(`Debris jams the ${GUNS.find(g => g.id === id).name.toLowerCase()} — half arc until it's cleared outside`);
  sfx.clank();
}
function knockAntenna() {
  if (!evs.antenna) return;
  evs.antenna = false;
  combatBanner('The radar antenna got knocked crooked — scans come back garbled. Straighten it outside.');
  sfx.clank();
}
function spawnCanister(side) {
  const x = side === 'port' ? -1.9 : SHIP_W + 1.9;
  evs.canister = { x, y: 2, vy: 0.55, t: 0, side };
  combatBanner(`Fuel canister drifting past, ${SIDE_LABEL[side].toLowerCase()} side — grab it outside!`);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function explodeMine(m, by) {
  evs.mines = evs.mines.filter(q => q !== m);
  for (let i = 0; i < 24; i++) combatFx(m.x, m.y, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, 0.7, i % 2 ? '#ffb347' : '#e2574c', 0.18);
  if (by === 'laser') { shipHit(m.side, m.x, m.y, false); combatBanner('Mine shot — it blew early, but small'); return; }
  shipHit(m.side, m.x, m.y, true);
  if (mission.rules?.breach) breachRoom(roomNearHull(m.side, m.y, m.x));
  combatBanner('A limpet mine went off!');
}
function updateEva(dt) {
  // drones fly in, stick mines on, fly off
  for (const d of evs.drones) {
    d.t += dt;
    if (d.leaving) { d.x += (d.side === 'port' ? -1 : 1) * 8 * dt; continue; }
    if (!d.spot) d.spot = freeHullSpot(d.side) || HULL_SPOTS[d.side][0];
    const [tx, ty] = d.spot, dx = tx + (d.side === 'port' ? -0.9 : 0.9) - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
    if (dist > 0.1) { const sp = Math.min(dist, 6 * dt); d.x += dx / dist * sp; d.y += dy / dist * sp; continue; }
    evs.mines.push({ uid: newUid(), side: d.side, x: tx, y: ty, t: MINE_TIME }); sfx.clank();
    d.spot = null; if (--d.left <= 0) d.leaving = true;
  }
  evs.drones = evs.drones.filter(d => Math.abs(d.x - SHIP_W / 2) < 50);
  for (const m of [...evs.mines]) if ((m.t -= dt) <= 0) explodeMine(m);
  // spore clouds drift to the outer airlock on their side and seep in through its seals (js/spores.js)
  for (const s of evs.spores) {
    s.t += dt;
    const h = HATCHES.find(q => q.side === s.side), [tx, ty] = sporeTarget(h), dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
    if (d > 0.05 && !(s.seep > 0)) { const sp = s.sp || 1.5, step = Math.min(d, sp * dt); s.vx = dx / d * sp; s.vy = dy / d * sp; s.x += dx / d * step; s.y += dy / d * step; continue; }
    s.vx = s.vy = 0;
    if (!(s.seep > 0)) combatBanner(`The spore cloud is at the ${SIDE_LABEL[s.side].toLowerCase()} airlock — it's seeping in!`);
    s.seep = (s.seep || 0) + dt;
    if (s.seep >= SPORE_SEEP) { s.dead = true; infestRoom(airlockRoomId(h), 'seep', [h.inner.x + h.inner.w / 2, h.y]); }
  }
  // our cannon shells pop spore clouds and drones
  for (const sh of combat.shells) {
    for (const s of evs.spores) if (!s.dead && Math.hypot(sh.x - s.x, sh.y - s.y) < 1.5) {
      s.dead = true; sh.dead = true; sfx.crack();
      for (let i = 0; i < 16; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.8, i % 2 ? '#d8f0a0' : '#ffe0f0', 0.12);
    }
    for (const d of evs.drones) if (!d.dead && Math.hypot(sh.x - d.x, sh.y - d.y) < 0.8) {
      d.dead = true; sh.dead = true; sfx.crack(); combatBanner('Mine drone shot down');
      for (let i = 0; i < 16; i++) combatFx(d.x, d.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.6, i % 2 ? '#ffb347' : '#6a6f7a', 0.12);
    }
  }
  combat.shells = combat.shells.filter(s => !s.dead);
  evs.spores = evs.spores.filter(s => !s.dead && Math.abs(s.x - SHIP_W / 2) < 50);
  evs.drones = evs.drones.filter(d => !d.dead);
  // laser bolts (on a spacewalk): blow mines early
  for (const bo of boarding.bolts) {
    if (bo.owner !== 'crew' || bo.wrench) continue;
    const m = evs.mines.find(m => Math.hypot(bo.x - m.x, bo.y - m.y) < 0.4);
    if (m) { bo.dead = true; explodeMine(m, 'laser'); continue; }
  }
  boarding.bolts = boarding.bolts.filter(b => !b.dead);
  // the canister drifts past, then it's gone
  if (evs.canister) {
    const c = evs.canister; c.y += c.vy * dt; c.t += dt;
    if (c.y > 26) { evs.canister = null; combatBanner('The fuel canister drifted away'); }
  }
}

// Cannons: debris in the track halves the arc.
const gunArc = (g) => (g.arc ?? GUN_ARC) * (evs.jams[g.id] ? 0.5 : 1);

// ---------------------------------------------------------------------------
// Clicking on a spacewalk
// ---------------------------------------------------------------------------
function evaJobTarget(mx, my) {
  const at = (x, y, r) => Math.hypot(mx - x, my - y) <= r;
  const far = (name, x, y, r) => ({ text: `${name} — get closer`, ok: false, x, y, r });
  for (const m of evs.mines) {
    if (!at(m.x, m.y, 0.6)) continue;
    if (!near(m.x, m.y)) return far('Limpet mine', m.x, m.y, 0.6);
    const tool = inv.weapon === 'repair', time = tool ? PRY_TIME : PRY_BARE;
    return holdTarget('pry' + m.uid, time, `Hold click: pry the mine off (${time} s${tool ? '' : ', faster with the repair kit'}) · ${Math.ceil(m.t)} s left!`, m.x, m.y, 0.6,
                      () => { evs.mines = evs.mines.filter(q => q !== m); sfx.clank(); combatBanner('Mine pried off and flung into space'); });
  }
  for (const [id, on] of Object.entries(evs.jams)) {
    if (!on) continue;
    const [x, y] = JAM_SPOTS[id];
    if (!at(x, y, 0.7)) continue;
    if (!near(x, y)) return far('Debris in the cannon track', x, y, 0.7);
    return holdTarget('jam' + id, CLEAR_TIME, `Hold click: pull the debris out of the track (${CLEAR_TIME} s)`, x, y, 0.7,
                      () => { delete evs.jams[id]; sfx.clank(); combatBanner(`${GUNS.find(g => g.id === id).name}: full arc again`); });
  }
  if (!evs.antenna && at(ANTENNA.x, ANTENNA.y, 0.7)) {
    if (!near(ANTENNA.x, ANTENNA.y)) return far('Radar antenna', ANTENNA.x, ANTENNA.y, 0.7);
    return holdTarget('antenna', 2, 'Hold click: push the antenna back into line (2 s)', ANTENNA.x, ANTENNA.y, 0.7,
                      () => { evs.antenna = true; sfx.clank(); combatBanner('Radar antenna straightened — scans are clear again'); });
  }
  for (const c of evs.coils) {
    if (c.ok || !at(c.x, c.y, 0.7)) continue;
    if (!near(c.x, c.y)) return far(`Jump coil (${c.name})`, c.x, c.y, 0.7);
    return holdTarget('coil' + c.name, ALIGN_TIME, `Hold click: turn the ${c.name} jump coil until it's green (${ALIGN_TIME} s)`, c.x, c.y, 0.7,
                      () => { c.ok = true; sfx.poi(); combatBanner(`Jump coil (${c.name}) aligned — ${evs.coils.filter(q => q.ok).length}/${evs.coils.length}`); });
  }
  if (evs.canister && at(evs.canister.x, evs.canister.y, 0.6)) {
    const c = evs.canister;
    if (!near(c.x, c.y)) return far('Fuel canister', c.x, c.y, 0.6);
    return { text: `Click: grab the fuel canister${inv.item ? ` (drops your ${ITEM_NAMES[inv.item]})` : ''}`, ok: true, x: c.x, y: c.y, r: 0.6,
             run: () => { evs.canister = null; if (inv.item) hz.floating.push({ uid: newUid(), kind: inv.item, x: player.x, y: player.y, t: 0 }); inv.item = 'fuel'; sfx.clank(); } };
  }
  return null;
}

// Jump coils left misaligned delay the jump (once, when it spools up).
function coilDelay() {
  const n = evs.coils.filter(c => !c.ok).length;
  return n * COIL_DELAY;
}
// Knock one aligned coil out of alignment (a gravity tide, missions with the `coils` rule): red light, sparks.
function knockCoil() {
  const pool = evs.coils.filter(c => c.ok);
  const c = pool[Math.floor(Math.random() * pool.length)];
  if (!c) return null;
  c.ok = false; c.a = 0.6 + Math.random() * 1.6;
  for (let i = 0; i < 18; i++) combatFx(c.x, c.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.5, i % 2 ? '#ffe08a' : '#7af0ff', 0.08);
  sfx.spark(); sfx.clank();
  return c;
}
// What a coil shows (drawing only, also used by the tests): k, the jump drive's charge (jumpCharge: 0 at rest,
// rising through the spool-up); spin, how fast its dial turns (rad/s: aligned coils spin up with the charge,
// a misaligned one only jitters); sputter, a misaligned coil while the drive charges (red flicker, sparks);
// flare, 1 → 0 over the first moments of the jump itself (the coils burst white-blue).
const COIL_FLARE = 0.9;
function coilFx(c) {
  const k = typeof jumpCharge === 'function' ? jumpCharge() : 0, u = typeof jumpOutT === 'function' ? jumpOutT() : Infinity;
  return { k, spin: c.ok && k > 0.02 ? 1.5 + 22 * k * k : 0, sputter: !c.ok && k > 0.05, flare: u < COIL_FLARE ? 1 - u / COIL_FLARE : 0 };
}
const coilSpin = { a: 0, t: null };                  // this browser's dial angle (a smooth spin while k changes)

// ---------------------------------------------------------------------------
// Drawing (outside the hull)
// ---------------------------------------------------------------------------
// The shield emitters on the hull (SHIELD_EMITTERS; hull/emitter_<side>_<state>, tools/blender/models/hull/emitter.py):
// ready, recharging, projecting (a 4-frame loop) or broken (a spacewalk job: a red ring round it).
function drawShieldEmitters(t, reach) {
  for (const e of SHIELD_EMITTERS) {
    const s = combat.shields[e.side], dead = broken(e), st = dead ? 'broken' : s.up > 0 ? 'up' : s.cd > 0 ? 'cd' : 'idle';
    const drawn = GFX.on && GFX.sprite(`hull/emitter_${e.side}_${st}`, st === 'up' ? Math.floor(t * 10) % 4 : 0, e.x, e.y, 0,
                                       { layer: 'main', sortY: e.y, emissive: st === 'up' ? 0.9 : 0.5 });
    if (!drawn) {                                        // 2D: a bracket from the hull, the coil drum, the hex lens
      ctx.save(); ctx.translate(L(e.x), L(e.y)); ctx.rotate(e.face);
      if (st === 'up') { const g = ctx.createRadialGradient(L(0.1), 0, 0, L(0.1), 0, L(0.8)); g.addColorStop(0, 'rgba(160,230,255,0.55)'); g.addColorStop(1, 'rgba(160,230,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(0.1), 0, L(0.8), 0, TAU); ctx.fill(); }
      rr(-L(0.8), -L(0.18), L(0.6), L(0.36), 3); ctx.fillStyle = '#3f5f8a'; ctx.fill(); stroke(1.5);
      ctx.beginPath(); ctx.arc(0, 0, L(0.3), 0, TAU); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(2);
      ctx.beginPath(); ctx.arc(0, 0, L(0.22), 0, TAU); ctx.strokeStyle = '#b87a3e'; ctx.lineWidth = 4; ctx.stroke();
      poly(Array.from({ length: 6 }, (_, i) => [L(0.06) + Math.cos(i * Math.PI / 3) * L(0.2), Math.sin(i * Math.PI / 3) * L(0.2)]));
      ctx.fillStyle = { idle: '#4aa0e8', cd: '#2a4a70', up: '#c8f4ff', broken: '#1a1d24' }[st]; ctx.fill(); stroke(1.5);
      if (dead) { ctx.strokeStyle = '#b9bcc2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L(0.12), -L(0.14)); ctx.lineTo(L(0.24), L(0.14)); ctx.stroke(); }
      ctx.restore();
    }
    if (dead) jobMarker(e.x, e.y, t, reach(e.x, e.y), '#ff6a5a');
  }
}
function drawEvaJobs(t) {
  const reach = (x, y) => me.mode === 'eva' && Math.hypot(me.x - x, me.y - y) <= REACH + 1;
  drawShieldEmitters(t, reach);
  // the antenna: a dish on a mast at the top of the hull
  {
    const x = L(ANTENNA.x), y = L(ANTENNA.y + 0.35), a = evs.antenna ? -Math.PI / 2 + Math.sin(t * 0.4) * 0.5 : 0.7;
    const ant = evs.antenna ? ['hull/antenna', clamp(Math.round(4 + Math.sin(t * 0.4) * 0.5 / 0.125), 0, 8)] : ['hull/antenna_crooked', 0];   // (hull/fixtures.py)
    if (!(GFX.on && GFX.sprite(ant[0], ant[1], ANTENNA.x, ANTENNA.y, 0, { layer: 'decal' }))) {
      ctx.fillStyle = '#5a6272'; ctx.fillRect(x - 3, y - 4, 6, 14); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y - 4, 6, 14);
      ctx.save(); ctx.translate(x, y - 4); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(10, 0, 6, 15, 0, 0, TAU); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    if (!evs.antenna) jobMarker(ANTENNA.x, ANTENNA.y, t, reach(ANTENNA.x, ANTENNA.y), '#ffd84a');
  }
  // the outer airlock hatches seen from outside (hull/hatch_<side>: a door frame standing on the side wall's
  // outer face, as tall as the wall, on the hull's doorstep; the inside view is interior/hatch_*, js/sprites.js,
  // and their tops line up): in the wall layer, depth-sorted at its south jamb
  if (GFX.on) for (const h of HATCHES) {
    const s = `hull/hatch_${h.side}`, n = broken(h) ? s + '_broken' : h.locked && h.doors.outer < 0.05 ? s + '_locked' : s;
    GFX.sprite(n, n === s ? Math.round(clamp(h.doors.outer, 0, 1) * 5) : 0, h.x, h.y, 0, { layer: 'wall', sortY: h.y + 1.16, emissive: 0.5 });
  }
  // jump coils: a ring with a dial, red until aligned; the dials spin up while the drive spools (coilFx; the
  // glow, energy rings and the flare at the jump are drawn in the glow layer: drawCoilEnergy, js/mission.js)
  {
    const ref = evs.coils.find(c => c.ok), sp = ref ? coilFx(ref).spin : 0;
    if (coilSpin.t !== null && sp > 0) coilSpin.a = (coilSpin.a + clamp(t - coilSpin.t, 0, 0.1) * sp) % TAU;
    else if (!sp) coilSpin.a = 0;
    coilSpin.t = t;
  }
  for (const c of evs.coils) {
    const fx = coilFx(c), x = L(c.x), y = L(c.y);
    const dial = c.ok ? -Math.PI / 2 + coilSpin.a : c.a + Math.sin(t * (fx.sputter ? 17 : 2) + c.x) * (fx.sputter ? 0.35 : 0.15);
    const cs = `hull/coil_${c.name === 'rear' ? 'stern' : c.name}`;   // (the rear coil's sprites are named 'stern')
    if (GFX.on && GFX.ready(`${cs}_ok`) && GFX.ready('hull/coil_dial')) {   // the coil on its bracket, the dial on top
      GFX.sprite(`${cs}_${c.ok ? 'ok' : 'bad'}`, 0, c.x, c.y, 0, { layer: 'decal', emissive: 0.6 });
      GFX.sprite('hull/coil_dial', GFX.frameIndex('hull/coil_dial', dial), c.x, c.y, 0, { layer: 'decal' });
      if (!c.ok) jobMarker(c.x, c.y, t, reach(c.x, c.y), '#7af0ff');
      continue;
    }
    ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.strokeStyle = c.ok ? '#5fd6a0' : '#e2574c'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(dial);
    ctx.fillStyle = '#e8ecf4'; ctx.fillRect(0, -1.5, 9, 3); ctx.restore();
    if (!c.ok) jobMarker(c.x, c.y, t, reach(c.x, c.y), '#7af0ff');
  }
  // debris in a cannon track
  for (const [id, on] of Object.entries(evs.jams)) {
    if (!on) continue;
    const [jx, jy] = JAM_SPOTS[id], x = L(jx), y = L(jy);
    const roof = JAM_ROOF[id], jo = roof ? { layer: 'wall', sortY: roof[0], depthBias: 0.05 } : { layer: 'decal' };
    if (GFX.on && GFX.sprite(`hull/jam_${id}`, 0, jx, roof ? roof[0] : jy, roof ? roof[1] : 0, jo)) { jobMarker(jx, jy, t, reach(jx, jy), '#ffd84a'); continue; }
    poly([[x - 10, y - 4], [x - 2, y - 11], [x + 9, y - 6], [x + 11, y + 5], [x, y + 9], [x - 9, y + 6]]);
    ctx.fillStyle = '#6e6359'; ctx.fill(); stroke(2);
    ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 12, y - 9); ctx.stroke();
    jobMarker(jx, jy, t, reach(jx, jy), '#ffd84a');
  }
  // limpet mines: blink faster as they run down
  for (const m of evs.mines) {
    const x = L(m.x), y = L(m.y), rate = 2 + (1 - m.t / MINE_TIME) * 14, on = Math.sin(t * rate) > 0;
    if (GFX.on && GFX.ready('enemy/limpet_mine') && GFX.sprite('enemy/limpet_mine', on ? 0 : 1, m.x, m.y, 0, { layer: 'main', emissive: on ? 0.9 : 0.3 })) {
      worldText(m.x, m.y, 0.55, String(Math.ceil(m.t)), `800 ${T * 0.18}px system-ui, sans-serif`, '#ffd0c8', { base: 'bottom', outline: 'rgba(10,12,18,0.8)', sortY: m.y + 0.01 });   // the countdown above it
      jobMarker(m.x, m.y, t, reach(m.x, m.y), '#ff6a5a');
      continue;
    }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; poly([[x + Math.cos(a - 0.18) * 13, y + Math.sin(a - 0.18) * 13], [x + Math.cos(a) * 20, y + Math.sin(a) * 20], [x + Math.cos(a + 0.18) * 13, y + Math.sin(a + 0.18) * 13]]); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.3); }   // spikes
    ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); const mg = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 14); mg.addColorStop(0, '#6a707c'); mg.addColorStop(1, '#2b303a'); ctx.fillStyle = mg; ctx.fill(); stroke(2.2);
    hazardStripe(x - 9, y + 5, 18, 4);
    if (on) { const lg = ctx.createRadialGradient(x, y, 0, x, y, 26); lg.addColorStop(0, 'rgba(255,70,50,0.55)'); lg.addColorStop(1, 'rgba(255,70,50,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y - 1, 5.5, 0, TAU); ctx.fillStyle = on ? '#ff4a3a' : '#5a1a14'; ctx.fill(); stroke(1.2);
    ctx.fillStyle = '#ffd0c8'; ctx.font = `800 ${T * 0.18}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(Math.ceil(m.t), x, y - 21); ctx.textAlign = 'left';
    jobMarker(m.x, m.y, t, reach(m.x, m.y), '#ff6a5a');
  }
  // the drone: a little quadcopter thing with a mine slung underneath
  for (const d of evs.drones) {
    const x = L(d.x), y = L(d.y), carry = d.left > 0 && !d.leaving, lit = Math.sin(t * 8) > 0;
    if (GFX.on && GFX.ready('enemy/mine_drone') && GFX.sprite('enemy/mine_drone', ((carry ? 0 : 2) + (lit ? 0 : 1)) * 3 + Math.floor(t * 24) % 3, d.x, d.y, 0, { layer: 'main', emissive: 0.6 })) continue;
    ctx.save(); ctx.translate(x, y);
    for (const [ox, oy] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
      ctx.beginPath(); ctx.ellipse(ox, oy, 8, 2.5, t * 30 + ox, 0, TAU); ctx.fillStyle = 'rgba(200,210,220,0.5)'; ctx.fill();
      ctx.strokeStyle = '#4b5263'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ox, oy); ctx.stroke();
    }
    rr(-8, -8, 16, 16, 4); ctx.fillStyle = '#8a3a2a'; ctx.fill(); stroke(2);
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff4a3a' : '#5a1a14'; ctx.fill();
    ctx.restore();
  }
  // spore clouds (at the airlock: shrinking as they seep in through its seals, wisps sucked into the hatch)
  for (const s of evs.spores) {                          // a clump of spore pods in a glowing haze, trailing hair-thin feelers
    const seep = clamp((s.seep || 0) / SPORE_SEEP, 0, 1), sc = 1 - 0.65 * seep;
    if (seep > 0) {
      const h = HATCHES.find(q => q.side === s.side);
      for (let i = 0; i < 9; i++) {
        const q = (t * 0.9 + i / 9) % 1, a = i * 2.4, r = (1 - q) * 1.4;
        sporePuff(s.x + Math.cos(a) * r + (h.x - s.x) * q, s.y + Math.sin(a) * r * 0.8, 0.25 + 0.35 * (1 - q), 0.7 * (1 - q) * (0.4 + seep), 'cloud');   // (js/spores.js)
      }
    }
    if (GFX.on && GFX.ready('organic/spore_cloud')) {   // the clump as a sprite (already at the 1.6x scale), the haze stays 2D
      const x = L(s.x), y = L(s.y), hz0 = ctx.createRadialGradient(x, y, 0, x, y, L(1.1) * 1.6 * sc);
      hz0.addColorStop(0, 'rgba(200,240,150,0.35)'); hz0.addColorStop(1, 'rgba(190,150,230,0)'); ctx.fillStyle = hz0; ctx.beginPath(); ctx.arc(x, y, L(1.1) * 1.6 * sc, 0, TAU); ctx.fill();
      GFX.sprite('organic/spore_cloud', Math.floor(s.t / 0.2), s.x, s.y, 0, { layer: 'main', rot: s.t * 0.8, emissive: 0.6, scale: sc });
      continue;
    }
    ctx.save(); ctx.translate(L(s.x), L(s.y)); ctx.scale(1.6 * sc, 1.6 * sc); ctx.translate(-L(s.x), -L(s.y));   // big enough to see from a cannon
    const x = L(s.x), y = L(s.y), hz0 = ctx.createRadialGradient(x, y, 0, x, y, L(1.1));
    hz0.addColorStop(0, 'rgba(200,240,150,0.35)'); hz0.addColorStop(1, 'rgba(190,150,230,0)'); ctx.fillStyle = hz0; ctx.beginPath(); ctx.arc(x, y, L(1.1), 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(210,230,170,0.5)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + s.t * 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * 14, y + Math.sin(a + 0.5) * 14, x + Math.cos(a) * (22 + 4 * Math.sin(s.t * 3 + i)), y + Math.sin(a) * (22 + 4 * Math.sin(s.t * 3 + i))); ctx.stroke(); }
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + s.t * 0.8, d = i ? 9 : 0, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, r = 5 + (i % 3) * 1.5 + Math.sin(s.t * 2 + i);
      const g = ctx.createRadialGradient(px - 1.5, py - 1.5, 0.5, px, py, r); g.addColorStop(0, '#f0ffd0'); g.addColorStop(1, i % 2 ? '#9a7ac0' : '#7ab070');
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fillStyle = g; ctx.fill(); stroke(1);
    }
    ctx.restore();
  }
  // the fuel canister, tumbling past
  if (evs.canister) {
    const c = evs.canister;
    pickupHalo(L(c.x), L(c.y), T * 0.5, t, reach(c.x, c.y), 4.2);
    if (!(GFX.on && GFX.ready('enemy/fuel_canister') && GFX.sprite('enemy/fuel_canister', GFX.frameIndex('enemy/fuel_canister', c.t * 0.9), c.x, c.y, 0, { layer: 'main', emissive: 0.4, recolor: POWER_COL }))) {
      ctx.save(); ctx.translate(L(c.x), L(c.y)); ctx.rotate(c.t * 0.9); drawItemIcon('fuel', 0, 0, 1.3); ctx.restore();
    }
  }
}
// A spacewalk job: ringed like everything usable inside (js/systems.js drawUseMarks, on top of everything).
function jobMarker(x, y, t, close, col) { useExtra.push({ x, y, r: 0.6 }); }

// Sidebar plates for all of the above.
function evaPlates(add) {
  if (evs.mines.length) add('mines', { icon: 'mine', title: 'LIMPET MINES', sub: `${evs.mines.length} on the hull · next blows in ${Math.ceil(Math.min(...evs.mines.map(m => m.t)))} s`, stripe: '#ff6a5a', red: true });
  if (evs.drones.some(d => !d.leaving)) add('drone', { icon: 'mine', title: 'MINE DRONE', sub: 'shoot it down before it sticks mines on', stripe: '#ff6a5a', red: true });
  if (evs.spores.length) add('spores', { icon: 'spore', title: 'SPORE CLOUD', sub: `${evs.spores.length} drifting at the ${SIDE_LABEL[evs.spores[0].side].toLowerCase()} airlock · shoot them before they seep in`, stripe: '#c08aff', red: true, wrap: true });
  sporePlates(add);                                     // spores inside, the mother's cloud outside (js/spores.js)
  for (const id of Object.keys(evs.jams)) add('jam' + id, { icon: 'wrench', title: 'JAMMED TRACK', sub: `${GUNS.find(g => g.id === id).name} · half arc · clear it outside`, stripe: '#ffd84a', red: true });
  if (!evs.antenna) add('antenna', { icon: 'wrench', title: 'ANTENNA CROOKED', sub: 'radar garbled · straighten it outside', stripe: '#ffd84a' });
  if (evs.canister) add('canister', { icon: 'jump', title: 'FUEL CANISTER', sub: `drifting past, ${SIDE_LABEL[evs.canister.side].toLowerCase()} side · grab it outside`, stripe: '#5fd6a0' });
  if (evs.coils.length && evs.coils.some(c => !c.ok)) add('coils', { icon: 'jump', title: 'JUMP COILS', sub: `${evs.coils.filter(c => c.ok).length}/${evs.coils.length} aligned · each one off = +${COIL_DELAY} s`, stripe: '#7af0ff' });
}
