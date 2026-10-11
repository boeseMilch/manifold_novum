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
const COIL_SPOTS = [{ x: -0.6, y: 13.4, name: 'left' }, { x: 45.0, y: 13.2, name: 'right' }, { x: 16.2, y: 26.75, name: 'stern' }];
const JAM_SPOTS = { port: [-1.7, 9.4], star: [46.1, 9.2], front: [24.0, -4.1] };
const roomNearHull = (side, y, x) => side === 'front' ? 'bridge' : side === 'port' ? (y < SPINE_Y0 ? 'portGun' : 'portLock') : (y < SPINE_Y0 ? 'starGun' : 'starLock');
const sideCol = (side) => side === 'port' ? 0 : side === 'star' ? 2 : 1;

function resetEva(rules = {}) {
  Object.assign(evs, { mines: [], drones: [], barnacles: [], spores: [], jams: {}, antenna: true, canister: null,
                       coils: rules.coils ? COIL_SPOTS.map(c => ({ ...c, ok: false, a: 0.6 + Math.random() * 1.6 })) : [] });
}
function freeHullSpot(side) {
  const used = [...evs.mines, ...evs.barnacles];
  const pool = HULL_SPOTS[side].filter(([x, y]) => !used.some(u => Math.hypot(u.x - x, u.y - y) < 0.8));
  return pool[Math.floor(Math.random() * pool.length)] || null;
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
function spawnSpores(side, from = null) {             // from: [x, y] where they start (a spore mother's mouth)
  const sx = from ? from[0] : side === 'port' ? -16 : SHIP_W + 16, sy0 = from ? from[1] : null;
  for (let i = 0; i < 3; i++) {
    const [tx, ty] = HULL_SPOTS[side][Math.floor(Math.random() * HULL_SPOTS[side].length)];
    const y = sy0 !== null ? sy0 + (Math.random() - 0.5) * 1.5 : ty + (Math.random() - 0.5) * 6, d = Math.hypot(tx - sx, ty - y), sp = 1.3 + Math.random() * 0.4;
    evs.spores.push({ uid: newUid(), side, x: sx - (from ? 0 : i * 3 * Math.sign(tx - sx)), y, vx: (tx - sx) / d * sp, vy: (ty - y) / d * sp, t: Math.random() * 10 });
  }
  combatBanner(`Spore cloud drifting in on the ${SIDE_LABEL[side].toLowerCase()} side — shoot the clouds!`);
}
function jamCannon(id) {
  if (evs.jams[id]) return;
  evs.jams[id] = true;
  combatBanner(`Debris wedged in the ${GUNS.find(g => g.id === id).name.toLowerCase()}'s track — half its arc. Pull it out on a spacewalk.`);
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
  combatBanner(`A fuel canister is drifting past on the ${SIDE_LABEL[side].toLowerCase()} side — grab it on a spacewalk!`);
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
      if (spot) { evs.barnacles.push({ uid: newUid(), side: s.side, x: spot[0], y: spot[1], age: 0, drain: 0, hp: 2 }); combatBanner('Spores stuck to the hull — barnacles are growing'); }
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
    for (const s of evs.spores) if (!s.dead && Math.hypot(sh.x - s.x, sh.y - s.y) < 1.2) {
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
    const b = evs.barnacles.find(b => Math.hypot(bo.x - b.x, bo.y - b.y) < 0.45);
    if (b) { bo.dead = true; if (--b.hp <= 0) { evs.barnacles = evs.barnacles.filter(q => q !== b); slimeBurst(b.x, b.y, 12); combatBanner('Barnacle burned off'); } sfx.alienHurt(); }
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
    if (!near(b.x, b.y)) return far('Barnacle', b.x, b.y, 0.6);
    return holdTarget('scrape' + b.uid, SCRAPE_TIME, `Hold click: scrape the barnacle off (${SCRAPE_TIME} s)`, b.x, b.y, 0.6,
                      () => { evs.barnacles = evs.barnacles.filter(q => q !== b); slimeBurst(b.x, b.y, 12); combatBanner('Barnacle scraped off'); });
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
function drawEvaJobs(t) {
  const reach = (x, y) => me.mode === 'eva' && Math.hypot(me.x - x, me.y - y) <= REACH + 1;
  // the antenna: a dish on a mast at the top of the hull
  {
    const x = L(ANTENNA.x), y = L(ANTENNA.y + 0.35), a = evs.antenna ? -Math.PI / 2 + Math.sin(t * 0.4) * 0.5 : 0.7;
    ctx.fillStyle = '#5a6272'; ctx.fillRect(x - 3, y - 4, 6, 14); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y - 4, 6, 14);
    ctx.save(); ctx.translate(x, y - 4); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(10, 0, 6, 15, 0, 0, TAU); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    if (!evs.antenna) jobMarker(ANTENNA.x, ANTENNA.y, t, reach(ANTENNA.x, ANTENNA.y), '#ffd84a');
  }
  // jump coils: a ring with a dial, red until aligned
  for (const c of evs.coils) {
    const x = L(c.x), y = L(c.y);
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
    poly([[x - 10, y - 4], [x - 2, y - 11], [x + 9, y - 6], [x + 11, y + 5], [x, y + 9], [x - 9, y + 6]]);
    ctx.fillStyle = '#6e6359'; ctx.fill(); stroke(2);
    ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 12, y - 9); ctx.stroke();
    jobMarker(jx, jy, t, reach(jx, jy), '#ffd84a');
  }
  // barnacles: grow in three stages, pulse when they drain
  for (const b of evs.barnacles) {
    const x = L(b.x), y = L(b.y), k = Math.min(1, b.age / BARNACLE_GROW), r = 5 + 9 * k;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + b.uid, rr2 = r * (0.5 + 0.2 * (i % 2));
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, rr2, 0, TAU);
      ctx.fillStyle = k >= 1 ? '#8a6aa8' : '#a89a7a'; ctx.fill(); stroke(1.5);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, rr2 * 0.35, 0, TAU); ctx.fillStyle = '#3a2a48'; ctx.fill();
    }
    if (k >= 1) { const p = 0.5 + 0.5 * Math.sin(t * 6); ctx.beginPath(); ctx.arc(x, y, r + 4 + p * 4, 0, TAU); ctx.strokeStyle = `rgba(190,120,255,${0.6 * p})`; ctx.lineWidth = 2; ctx.stroke(); }
    jobMarker(b.x, b.y, t, reach(b.x, b.y), '#c08aff');
  }
  // limpet mines: blink faster as they run down
  for (const m of evs.mines) {
    const x = L(m.x), y = L(m.y), rate = 2 + (1 - m.t / MINE_TIME) * 14, on = Math.sin(t * rate) > 0;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.fillStyle = '#2b303a'; ctx.fillRect(x + Math.cos(a) * 11 - 2, y + Math.sin(a) * 11 - 2, 4, 4); }
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fillStyle = on ? '#ff4a3a' : '#5a1a14'; ctx.fill();
    ctx.fillStyle = '#ffd0c8'; ctx.font = `800 ${T * 0.18}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(Math.ceil(m.t), x, y - 13); ctx.textAlign = 'left';
    jobMarker(m.x, m.y, t, reach(m.x, m.y), '#ff6a5a');
  }
  // the drone: a little quadcopter thing with a mine slung underneath
  for (const d of evs.drones) {
    const x = L(d.x), y = L(d.y);
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
  for (const s of evs.spores) {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + s.t * 0.8, r = L(0.35 + 0.15 * Math.sin(s.t * 2 + i));
      const g = ctx.createRadialGradient(L(s.x) + Math.cos(a) * 12, L(s.y) + Math.sin(a) * 12, 0, L(s.x) + Math.cos(a) * 12, L(s.y) + Math.sin(a) * 12, r);
      g.addColorStop(0, 'rgba(220,240,170,0.7)'); g.addColorStop(1, 'rgba(220,180,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(s.x) + Math.cos(a) * 12, L(s.y) + Math.sin(a) * 12, r, 0, TAU); ctx.fill();
    }
  }
  // the fuel canister, tumbling past
  if (evs.canister) {
    const c = evs.canister;
    pickupHalo(L(c.x), L(c.y), T * 0.5, t, reach(c.x, c.y), 4.2);
    ctx.save(); ctx.translate(L(c.x), L(c.y)); ctx.rotate(c.t * 0.9); drawItemIcon('fuel', 0, 0, 1.3); ctx.restore();
  }
}
// A pulsing ring around a spacewalk job, brighter in reach (the outside version of the brackets).
function jobMarker(x, y, t, close, col) {
  const k = 0.5 + 0.5 * Math.sin(t * 4);
  ctx.beginPath(); ctx.arc(L(x), L(y), L(0.6) + k * 3, 0, TAU);
  ctx.setLineDash([5, 5]); ctx.strokeStyle = close ? '#ffffff' : col; ctx.globalAlpha = close ? 0.9 : 0.55; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
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
