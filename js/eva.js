// Jobs on the outside of the hull: reasons to go on a spacewalk.
//   Limpet mines (a drone sticks them on; pry them off or they blow a hole), hull barnacles
//   (spore clouds seed them; scrape them off before they drill in), debris jamming a cannon's
//   track, a crooked radar antenna, a fuel canister drifting past (optional loot), and the three
//   jump coils that must be aligned before the jump (missions with the `coils` rule).
// Everything in `evs` is plain data (sent to browsers as is).

const evs = { mines: [], drones: [], barnacles: [], spores: [], jams: {}, antenna: true, canister: null, coils: [] };
const MINE_TIME = 30, PRY_TIME = 2, PRY_BARE = 4, SCRAPE_TIME = 3, CLEAR_TIME = 3, ALIGN_TIME = 3, COIL_DELAY = 15;
const BARNACLE_GROW = 40, BARNACLE_DRAIN = 10, BARNACLE_DRILL = 75;

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
  Object.assign(evs, { mines: [], drones: [], barnacles: [], spores: [], jams: {}, antenna: true, canister: null,
                       coils: rules.coils ? COIL_SPOTS.map(c => ({ ...c, ok: false, a: 0.6 + Math.random() * 1.6 })) : [] });
}
function freeHullSpot(side) {
  // mines sit just off the hull, barnacles on it (onHullPlating): compare the places along the hull
  const along = (x, y) => side === 'front' ? x : y, used = [...evs.mines, ...evs.barnacles].filter(u => u.side === side);
  const pool = HULL_SPOTS[side].filter(([x, y]) => !used.some(u => Math.abs(along(u.x, u.y) - along(x, y)) < 0.8));
  return pool[Math.floor(Math.random() * pool.length)] || null;
}
// Barnacles grow ON the hull: on the outer wall's top over that stretch of hull (the side walls, the nose's
// back wall), a crust straddling its outer edge, not out in space beside it. (b.x, b.y) is that point on the
// hull (reach, clicks, drilling); the sprite renderer draws it up at the wall top's height (hullTopZ).
const onHullPlating = (side, [x, y]) => side === 'port' ? [0.15, y] : side === 'star' ? [SHIP_W - 0.15, y] : [clamp(x, 18.4, 26.0), -2.85];   // (front: clear of the nose's corner posts)
const BARNACLE_FX_Z = 1.6;                           // (slime bursts: up on the wall top too)
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
function spawnMineDrone(side) {
  const n = 1 + Math.floor(Math.random() * 3), sx = side === 'port' ? -18 : SHIP_W + 18;
  evs.drones.push({ uid: newUid(), side, x: sx, y: 6 + Math.random() * 10, left: n, spot: null, t: 0, leaving: false });
  combatBanner(`Mine drone on the ${SIDE_LABEL[side].toLowerCase()} side — it sticks limpet mines on the hull!`);
  sfx.alarm();
}
function spawnSpores(side, from = null, n = 3, quiet = false) {   // from: [x, y] where they start (a spore mother's mouth)
  const sx = from ? from[0] : side === 'port' ? -16 : SHIP_W + 16, sy0 = from ? from[1] : null;
  for (let i = 0; i < n; i++) {
    const [tx, ty] = HULL_SPOTS[side][Math.floor(Math.random() * HULL_SPOTS[side].length)];
    const y = sy0 !== null ? sy0 + (Math.random() - 0.5) * 1.5 : ty + (Math.random() - 0.5) * 6, d = Math.hypot(tx - sx, ty - y), sp = 1.3 + Math.random() * 0.4;
    evs.spores.push({ uid: newUid(), side, x: sx - (from ? 0 : i * 3 * Math.sign(tx - sx)), y, vx: (tx - sx) / d * sp, vy: (ty - y) / d * sp, t: Math.random() * 10 });
  }
  if (!quiet) combatBanner(`Spore cloud drifting in on the ${SIDE_LABEL[side].toLowerCase()} side — shoot the clouds!`);
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
  // spore clouds drift in and seed barnacles where they touch the hull
  for (const s of evs.spores) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt;
    if (distToPoly(s.x, s.y) < 0.7 || pointInPoly(s.x, s.y)) {
      s.dead = true;
      const spot = freeHullSpot(s.side);
      if (spot) { const [x, y] = onHullPlating(s.side, spot); evs.barnacles.push({ uid: newUid(), side: s.side, x, y, age: 0, drain: 0, hp: 2 }); combatBanner('Spores stuck to the hull — barnacles are growing'); }
    }
  }
  // barnacles grow; full grown ones drain power, and eventually drill through
  for (const b of [...evs.barnacles]) {
    b.age += dt;
    if (b.age < BARNACLE_GROW) continue;
    if ((b.drain += dt) >= BARNACLE_DRAIN) {
      b.drain = 0;
      const cap = CAPACITORS[sideCol(b.side)];
      if (cap.charge > 0) { cap.charge--; combatBanner(`Barnacles are sucking power from the ${['left', 'middle', 'right'][sideCol(b.side)]} capacitor`); }
    }
    if (b.age >= BARNACLE_DRILL) {
      evs.barnacles = evs.barnacles.filter(q => q !== b);
      combatBanner('A barnacle drilled through the hull!'); sfx.crack();
      if (mission.rules?.breach) breachRoom(roomNearHull(b.side, b.y, b.x));
      else { const pool = SYSTEMS.filter(s => s.col === sideCol(b.side) && !s.broken); if (pool.length) breakSystem(pool[Math.floor(Math.random() * pool.length)]); }
    }
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
  // laser bolts (on a spacewalk): blow mines early, kill barnacles
  for (const bo of boarding.bolts) {
    if (bo.owner !== 'crew' || bo.wrench) continue;
    const m = evs.mines.find(m => Math.hypot(bo.x - m.x, bo.y - m.y) < 0.4);
    if (m) { bo.dead = true; explodeMine(m, 'laser'); continue; }
    // (barnacles sit on the hull, where a bolt stops: it counts from just outside, the last place it was alive;
    // bolts inside the ship never reach them)
    const b = !pointInPoly(bo.x, bo.y) && evs.barnacles.find(b => Math.hypot(bo.x - b.x, bo.y - b.y) < 0.75);
    if (b) { bo.dead = true; if ((b.hp -= boltDamage(bo)) <= 0) { evs.barnacles = evs.barnacles.filter(q => q !== b); slimeBurst(b.x, b.y, 12, 0.1, BARNACLE_FX_Z); combatBanner('Barnacle burned off'); } sfx.alienHurt(); }
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
  for (const b of evs.barnacles) {
    if (!at(b.x, b.y, 0.6)) continue;
    if (!near(b.x, b.y)) return { ...far('Barnacle', b.x, b.y, 0.6), hullTop: true };
    return { ...holdTarget('scrape' + b.uid, SCRAPE_TIME, `Hold click: scrape the barnacle off (${SCRAPE_TIME} s)`, b.x, b.y, 0.6,
                           () => { evs.barnacles = evs.barnacles.filter(q => q !== b); slimeBurst(b.x, b.y, 12, 0.1, BARNACLE_FX_Z); combatBanner('Barnacle scraped off'); }),
             hullTop: true };                       // (its ring is drawn up on the wall top, with the barnacle)
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
    const s = `hull/hatch_${h.side}`, n = broken(h) ? s + '_broken' : h.locked && h.open < 0.05 ? s + '_locked' : s;
    GFX.sprite(n, n === s ? Math.round(clamp(h.open, 0, 1) * 5) : 0, h.x, h.y, 0, { layer: 'wall', sortY: h.y + 1.16, emissive: 0.5 });
  }
  // jump coils: a ring with a dial, red until aligned
  for (const c of evs.coils) {
    const x = L(c.x), y = L(c.y), dial = c.ok ? -Math.PI / 2 : c.a + Math.sin(t * 2 + c.x) * 0.15;
    if (GFX.on && GFX.ready(`hull/coil_${c.name}_ok`) && GFX.ready('hull/coil_dial')) {   // the coil on its bracket, the dial on top
      GFX.sprite(`hull/coil_${c.name}_${c.ok ? 'ok' : 'bad'}`, 0, c.x, c.y, 0, { layer: 'decal', emissive: 0.6 });
      GFX.sprite('hull/coil_dial', GFX.frameIndex('hull/coil_dial', dial), c.x, c.y, 0, { layer: 'decal' });
      if (!c.ok) jobMarker(c.x, c.y, t, reach(c.x, c.y), '#7af0ff');
      continue;
    }
    ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.strokeStyle = c.ok ? '#5fd6a0' : '#e2574c'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.ok ? -Math.PI / 2 : c.a + Math.sin(t * 2 + c.x) * 0.15);
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
  // barnacles: grow in three stages, pulse when they drain. They sit on the hull wall's top (hullTopZ), straddling
  // its outer edge; on screen that is lifted by the wall's height (sy), the marker goes there too
  for (const b of evs.barnacles) {
    const z = hullTopZ(b.x, b.y), sy = b.y - GFX.lift(z);
    const x = L(b.x), y = L(sy), k = Math.min(1, b.age / BARNACLE_GROW), r = 5 + 9 * k;
    if (GFX.on) {                                        // organic/barnacle_s<stage>_v<variant>, draining when grown
      const st = Math.min(3, Math.floor(k * 3)), v = b.uid % 2, n = st === 3 ? `organic/barnacle_s3_v${v}_drain` : `organic/barnacle_s${st}_v${v}`;
      // (pick: pointing at it on screen gives its point on the hull, so clicks find it up there)
      if (GFX.ready(n) && GFX.sprite(n, st === 3 ? Math.floor(t * 6) : 0, b.x, b.y, z, { layer: 'main', depthBias: 0.04, emissive: 0.5, pick: [0.45, 0.55] })) { jobMarker(b.x, sy, t, reach(b.x, b.y), '#c08aff'); continue; }
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + b.uid, rr2 = r * (0.5 + 0.2 * (i % 2));
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, rr2, 0, TAU);
      ctx.fillStyle = k >= 1 ? '#8a6aa8' : '#a89a7a'; ctx.fill(); stroke(1.5);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, rr2 * 0.35, 0, TAU); ctx.fillStyle = '#3a2a48'; ctx.fill();
    }
    if (k >= 1) { const p = 0.5 + 0.5 * Math.sin(t * 6); ctx.beginPath(); ctx.arc(x, y, r + 4 + p * 4, 0, TAU); ctx.strokeStyle = `rgba(190,120,255,${0.6 * p})`; ctx.lineWidth = 2; ctx.stroke(); }
    jobMarker(b.x, sy, t, reach(b.x, b.y), '#c08aff');
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
  // spore clouds
  for (const s of evs.spores) {                          // a clump of spore pods in a glowing haze, trailing hair-thin feelers
    if (GFX.on && GFX.ready('organic/spore_cloud')) {   // the clump as a sprite (already at the 1.6x scale), the haze stays 2D
      const x = L(s.x), y = L(s.y), hz0 = ctx.createRadialGradient(x, y, 0, x, y, L(1.1) * 1.6);
      hz0.addColorStop(0, 'rgba(200,240,150,0.35)'); hz0.addColorStop(1, 'rgba(190,150,230,0)'); ctx.fillStyle = hz0; ctx.beginPath(); ctx.arc(x, y, L(1.1) * 1.6, 0, TAU); ctx.fill();
      GFX.sprite('organic/spore_cloud', Math.floor(s.t / 0.2), s.x, s.y, 0, { layer: 'main', rot: s.t * 0.8, emissive: 0.6 });
      continue;
    }
    ctx.save(); ctx.translate(L(s.x), L(s.y)); ctx.scale(1.6, 1.6); ctx.translate(-L(s.x), -L(s.y));   // big enough to see from a cannon
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
    if (!(GFX.on && GFX.ready('enemy/fuel_canister') && GFX.sprite('enemy/fuel_canister', GFX.frameIndex('enemy/fuel_canister', c.t * 0.9), c.x, c.y, 0, { layer: 'main', emissive: 0.4 }))) {
      ctx.save(); ctx.translate(L(c.x), L(c.y)); ctx.rotate(c.t * 0.9); drawItemIcon('fuel', 0, 0, 1.3); ctx.restore();
    }
  }
}
// A pulsing ring around a spacewalk job, brighter in reach (the outside version of the brackets).
function jobMarker(x, y, t, close, col) {          // (a dashed ring on the hull: unlit glow layer with sprites, so it reads in the dark)
  glowLayer(() => {
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.beginPath(); ctx.arc(L(x), L(y), L(0.6) + k * 3, 0, TAU);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = close ? '#ffffff' : col; ctx.globalAlpha = close ? 0.9 : 0.55; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  });
}

// Sidebar plates for all of the above.
function evaPlates(add) {
  if (evs.mines.length) add('mines', { icon: 'mine', title: 'LIMPET MINES', sub: `${evs.mines.length} on the hull · next blows in ${Math.ceil(Math.min(...evs.mines.map(m => m.t)))} s`, stripe: '#ff6a5a', red: true });
  if (evs.drones.some(d => !d.leaving)) add('drone', { icon: 'mine', title: 'MINE DRONE', sub: 'shoot it down before it sticks mines on', stripe: '#ff6a5a', red: true });
  if (evs.spores.length) add('spores', { icon: 'spore', title: 'SPORE CLOUD', sub: `${evs.spores.length} drifting in · shoot them`, stripe: '#c08aff', red: true });
  if (evs.barnacles.length) add('barnacles', { icon: 'spore', title: 'BARNACLES', sub: `${evs.barnacles.length} on the hull · scrape them off outside`, stripe: '#c08aff', red: evs.barnacles.some(b => b.age >= BARNACLE_GROW) });
  for (const id of Object.keys(evs.jams)) add('jam' + id, { icon: 'wrench', title: 'JAMMED TRACK', sub: `${GUNS.find(g => g.id === id).name} · half arc · clear it outside`, stripe: '#ffd84a', red: true });
  if (!evs.antenna) add('antenna', { icon: 'wrench', title: 'ANTENNA CROOKED', sub: 'radar garbled · straighten it outside', stripe: '#ffd84a' });
  if (evs.canister) add('canister', { icon: 'jump', title: 'FUEL CANISTER', sub: `drifting past, ${SIDE_LABEL[evs.canister.side].toLowerCase()} side · grab it outside`, stripe: '#5fd6a0' });
  if (evs.coils.length && evs.coils.some(c => !c.ok)) add('coils', { icon: 'jump', title: 'JUMP COILS', sub: `${evs.coils.filter(c => c.ok).length}/${evs.coils.length} aligned · each one off = +${COIL_DELAY} s`, stripe: '#7af0ff' });
}
