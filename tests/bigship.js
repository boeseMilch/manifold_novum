// Prototype 3 (the big ship, prototype3/): headless tests of the core sim: the layout is connected, the haul from
// the magazine to the breech takes 8-10 s with a shell, MIN_CREW, the registries, crew coming and going, stations,
// and the snapshot surviving JSON.
// Run: node tests/bigship.js
const B = require('../prototype3/sim.js');
const DT = 1 / 30;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) sim.tick(DT); };
const press = (sim, c, key) => { sim.setInput(c.id, { pressed: [key] }); sim.tick(DT); };
// Walk crew member c through the waypoints (holding the keys towards each, like a player); returns the seconds taken.
function walkTo(sim, c, pts, limit = 60) {
  let t = 0;
  for (const [px, py] of pts) {
    while (Math.hypot(c.x - px, c.y - py) > 0.25 && t < limit) {
      const dx = px - c.x, dy = py - c.y;
      sim.setInput(c.id, { left: dx < -0.12, right: dx > 0.12, up: dy < -0.12, down: dy > 0.12 });
      sim.tick(DT); t += DT;
    }
  }
  sim.setInput(c.id, { left: false, right: false, up: false, down: false });
  return t;
}

// --- MIN_CREW and the station placeholders
check(B.MIN_CREW === 3, 'MIN_CREW is 3');
for (const id of ['chart', 'cupola', 'rangeWheel', 'breech', 'readyRack', 'shellRacks'])
  check(!!B.STATIONS[id], `station ${id} exists (${B.STATIONS[id]?.room})`);
const roomOf = (id) => B.STATIONS[id].room;
check(roomOf('chart') === 'bridge' && roomOf('cupola') === 'fireControl' && ['rangeWheel', 'breech', 'readyRack'].every(i => roomOf(i) === 'gunRoom') && roomOf('shellRacks') === 'magazine',
  'stations are in their rooms: chart table on the bridge, cupola in fire control, wheel / breech / rack in the gun room, shell racks in the magazine');
for (const st of Object.values(B.STATIONS)) check(B.roomAt(st.x, st.y)?.id === st.room, `${st.id}'s x, y is inside its room`);

// --- fire control and the gun room: separate rooms with a wall between (no doorway joins them)
{
  const fc = B.ROOMS.find(r => r.id === 'fireControl').rects[0], gr = B.ROOMS.find(r => r.id === 'gunRoom').rects[0];
  const between = B.DOORWAYS.some(d => d.y >= fc.y + fc.h - 0.01 && d.y + d.h <= gr.y + 0.01 && d.x < fc.x + fc.w && d.x + d.w > fc.x);
  check(gr.y - (fc.y + fc.h) >= 0.5 && !between, 'fire control and the gun room are next to each other with a wall between, no door');
}

// --- connectivity: flood-fill the walkable area on a grid; every room and every station's reach is in one piece
{
  const G = 0.1, x0 = -3, y0 = -4, nx = 300, ny = 520, seen = new Uint8Array(nx * ny);
  const ok = (i, j) => B.canStand(x0 + i * G, y0 + j * G);
  const start = B.nearestFree(11, 20), si = Math.round((start[0] - x0) / G), sj = Math.round((start[1] - y0) / G);
  const q = [[si, sj]]; seen[sj * nx + si] = 1;
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny || seen[b * nx + a] || !ok(a, b)) continue;
      seen[b * nx + a] = 1; q.push([a, b]);
    }
  }
  const reached = (x, y, rad) => {
    for (let i = Math.floor((x - rad - x0) / G); i <= Math.ceil((x + rad - x0) / G); i++)
      for (let j = Math.floor((y - rad - y0) / G); j <= Math.ceil((y + rad - y0) / G); j++)
        if (i >= 0 && j >= 0 && i < nx && j < ny && seen[j * nx + i] && Math.hypot(x0 + i * G - x, y0 + j * G - y) < rad) return true;
    return false;
  };
  for (const room of B.ROOMS) {
    let any = false, all = true;
    for (const r of room.rects) for (let x = r.x + 0.25; x < r.x + r.w - 0.2; x += 0.5) for (let y = r.y + 0.25; y < r.y + r.h - 0.2; y += 0.5) {
      const i = Math.round((x - x0) / G), j = Math.round((y - y0) / G);
      if (!ok(i, j)) continue;
      if (seen[j * nx + i]) any = true; else all = false;
    }
    check(any && all, `${room.name}: all of its floor is reachable from the spine`);
  }
  for (const st of Object.values(B.STATIONS)) {
    check(reached(st.x, st.y, B.USE_REACH - 0.1), `${st.id} can be reached (within E's reach)`);
    if (st.seat) check(B.canStand(st.sx, st.sy), `${st.id}'s seat is a place one can stand`);
  }
}

// --- the haul: magazine -> breech with a shell takes 8-10 s
{
  const sim = B.createSim({ seed: 1 }), c = sim.addCrew(1, 'Hauler');
  const S = B.STATIONS.shellRacks, Br = B.STATIONS.breech;
  [c.x, c.y] = [S.x, S.y + 0.6];
  c.carry = 'shell';
  // the way a player walks it: out of the magazine into the spine, up to the gun room's door, in to the breech
  const t = walkTo(sim, c, [[9.9, 38.3], [9.9, 30.0], [8.8, 29.6], [Br.x + 0.75, Br.y + 0.4]]);
  check(Math.hypot(c.x - (Br.x + 0.75), c.y - (Br.y + 0.4)) < 0.3, 'the walker got to the breech');
  check(t >= 8 && t <= 10, `magazine -> breech with a shell: ${t.toFixed(1)} s (8-10 s)`);
  const sim2 = B.createSim({ seed: 1 }), c2 = sim2.addCrew(1, 'Runner');
  [c2.x, c2.y] = [S.x, S.y + 0.6];
  const t2 = walkTo(sim2, c2, [[9.9, 38.3], [9.9, 30.0], [8.8, 29.6], [Br.x + 0.75, Br.y + 0.4]]);
  check(t2 < t * 0.6, `empty-handed it's much quicker: ${t2.toFixed(1)} s`);
}

// --- walking: 4.2 units/s, walls stop you
{
  const sim = B.createSim({ seed: 2 }), c = sim.addCrew(1, 'W');
  [c.x, c.y] = [11, 30];
  sim.setInput(1, { up: true }); step(sim, 30);
  const y = c.y; step(sim, 30);
  check(Math.abs((y - c.y) - B.WALK_SPEED) < 0.05, `walk speed ${(y - c.y).toFixed(2)} units/s`);
  sim.setInput(1, { up: false, left: true }); [c.x, c.y] = [11, 25]; step(sim, 60);
  check(c.x > 9.6 - 0.01 && c.x < 9.9, `a wall stops you (x ${c.x.toFixed(2)})`);
}

// --- crew come and go
{
  const sim = B.createSim({ seed: 3 });
  const a = sim.addCrew(5, 'Ann'), b = sim.addCrew(7, 'Bob'), c = sim.addCrew(9, 'Cid');
  check(sim.crew.length === 3 && new Set(sim.crew.map(c => c.color)).size === 3, 'three crew, three colors');
  check(sim.crew.every(c => B.canStand(c.x, c.y)), 'everyone spawns somewhere they can stand');
  check(sim.addCrew(5, 'Ann again') === a && sim.crew.length === 3, 'adding the same id twice keeps one');
  sim.removeCrew(7);
  check(sim.crew.length === 2 && !sim.getCrew(7), 'removeCrew');
  sim.removeCrew(42);
  check(sim.crew.length === 2, 'removing someone unknown does nothing');
}

// --- stations: E near a seat sits you down; the keys then drive it; E leaves; Space can be claimed
{
  const sim = B.createSim({ seed: 4 }), c = sim.addCrew(1, 'Gunner');
  const drives = [];
  B.defineStation({ id: 'testSeat', kind: 'test', room: 'spine', x: 11, y: 16, sx: 11, sy: 16.6, face: 0, seat: true, label: 'Test seat', claims: ['fire'],
    prompt: () => 'Test seat', drive: (s, cr, inp) => drives.push([inp.ax, inp.ay, inp.pressed.has('fire')]) });
  [c.x, c.y] = [11, 17];
  step(sim);
  check(c.focus === 'testSeat' && c.prompt === 'E: Test seat', `the prompt (${c.prompt})`);
  press(sim, c, 'use');
  check(c.station === 'testSeat' && c.x === 11 && c.y === 16.6, 'E sits you down at the seat');
  sim.setInput(1, { right: true }); step(sim, 10);
  check(c.x === 11 && drives.length >= 10 && drives.at(-1)[0] === 1, 'seated, the movement keys go to the station, you stay put');
  sim.setInput(1, { right: false, pressed: ['fire'] }); step(sim);
  check(c.station === 'testSeat' && drives.at(-1)[2] === true, 'a claimed Space goes to the station, you stay seated');
  const d = sim.addCrew(2, 'Other'); [d.x, d.y] = [11.3, 17]; step(sim);
  check(/is on it/.test(d.prompt) && (press(sim, d, 'use'), d.station === null), 'a taken seat stays taken');
  press(sim, c, 'use');
  check(c.station === null && B.canStand(c.x, c.y), 'E leaves the seat');
  delete B.STATIONS.testSeat; B.STATION_ORDER.splice(B.STATION_ORDER.indexOf('testSeat'), 1);
  // a placeholder: banner "not built yet"
  [d.x, d.y] = [B.STATIONS.shellRacks.x, B.STATIONS.shellRacks.y + 0.7]; step(sim);
  check(d.focus === 'shellRacks', 'the shell racks are in reach in the magazine');
  sim.takeEvents(); press(sim, d, 'use');
  if (d.carry === 'shell') { check(true, 'the shell racks are built (sim-artillery.js): E took a shell'); d.carry = null; sim.magazine++; }
  else check(sim.takeEvents().some(e => e.type === 'banner' && /not built/.test(e.text) && e.to === 2), 'a placeholder says "not built yet" (to that crew member)');
  // defineStation on an existing id replaces fields, keeps the position
  const old = { ...B.STATIONS.breech };
  let used = 0;
  B.defineStation({ id: 'breech', prompt: () => 'Ram', use: () => used++ });
  [d.x, d.y] = [old.x + 0.8, old.y + 0.3]; step(sim); press(sim, d, 'use');
  check(used === 1 && B.STATIONS.breech.x === old.x && d.prompt === 'E: Ram', 'defineStation replaces a placeholder\'s behaviour, keeps where it is');
  Object.assign(B.STATIONS.breech, old);
  // timed actions
  let done = 0;
  sim.startAction(d, 0.5, 'Opening', () => done++);
  sim.setInput(2, { left: true }); const x = d.x; step(sim, 10);
  check(done === 0 && d.x === x, 'during an action you don\'t move');
  step(sim, 8);
  check(done === 1 && !d.action, 'the action finishes');
  sim.setInput(2, { left: false, use: true }); sim.startAction(d, 1, 'Ramming', () => done++, { hold: true }); step(sim, 5);
  sim.setInput(2, { use: false }); step(sim, 40);
  check(done === 1 && !d.action, 'a hold action is cancelled when E is let go');
}

// --- registries: tick hooks, init hooks, snapshot hooks, encounters
{
  let ticks = 0, inits = 0;
  const th = (s, dt) => { ticks++; }, ih = (s) => { inits++; s.testState = { n: 4 }; }, sh = (s, snap) => { snap.test = s.testState; };
  B.TICK_HOOKS.push(th); B.INIT_HOOKS.push(ih); B.SNAPSHOT_HOOKS.push(sh);
  const sim = B.createSim({ seed: 5 });
  step(sim, 3);
  check(inits === 1 && ticks === 3, 'init and tick hooks run');
  check(sim.snapshot().test.n === 4, 'a snapshot hook adds its state');
  B.TICK_HOOKS.splice(B.TICK_HOOKS.indexOf(th), 1); B.INIT_HOOKS.splice(B.INIT_HOOKS.indexOf(ih), 1); B.SNAPSHOT_HOOKS.splice(B.SNAPSHOT_HOOKS.indexOf(sh), 1);

  const g = sim.spawnEncounter('gunship', { side: 'right' }), a = sim.spawnEncounter('asteroids', {});
  check(g.kind === 'gunship' && g.side === 'right' && g.x > B.SHIP.w + 20 && a.y < 0, 'placeholder gunship (off the right) and asteroids (ahead)');
  const l = sim.spawnEncounter('gunship', { side: 'left' });
  check(l.x < -20, 'a gunship from the left is off the left');
  let ended = 0;
  B.ENCOUNTER_KINDS.test = { spawn: (s, o) => ({ x: 1, y: 2, hp: o.hp, _secret: 1 }), tick: (s, e, dt) => { if (e.age > 0.5) e.dead = true; }, end: () => ended++ };
  const t = sim.spawnEncounter('test', { hp: 3 });
  const snap = sim.snapshot(), te = snap.enc.find(e => e.id === t.id);
  check(te && te.hp === 3 && !('_secret' in te), 'encounter fields reach the snapshot, _private ones don\'t');
  step(sim, 20);
  check(!sim.encounters.includes(t) && ended === 0, 'an encounter that sets dead is removed');
  sim.spawnEncounter('test', { hp: 1 });
  sim.endEncounters();
  check(sim.encounters.length === 0 && ended === 1, 'endEncounters calls end() and clears them all');
  delete B.ENCOUNTER_KINDS.test;
  let threw = false; try { sim.spawnEncounter('nope'); } catch (e) { threw = true; }
  check(threw, 'an unknown encounter kind throws');
}

// --- hull damage and the end
{
  const sim = B.createSim({ seed: 6 }); sim.addCrew(1, 'A');
  check(sim.hull === 100 && sim.energy === 12 && sim.magazine === 10 && sim.readyRack === 0 && sim.breech === 'empty', 'starting state: hull 100, energy 12, 10 shells, rack 0, breech empty');
  sim.damageHull(30, 'left');
  const ev = sim.takeEvents().find(e => e.type === 'hullHit');
  check(sim.hull === 70 && ev && ev.x < 2, 'damageHull lowers the hull and reports where');
  sim.damageHull(80, { x: 5, y: 5 });
  check(sim.hull === 0 && sim.phase === 'end' && sim.lost && sim.summary && !sim.summary.won && sim.summary.stats.hullLost === 100, 'hull 0: the run is lost, with a summary');
  const t = sim.time; step(sim, 10);
  check(sim.time === t, 'after the end the sim stands still');
  const w = B.createSim({ seed: 7 }); w.end(true, 'Jumped.');
  check(w.won && w.summary.won && w.summary.reason === 'Jumped.', 'end(true) wins');
}

// --- the snapshot round-trips through JSON
{
  const sim = B.createSim({ seed: 8 });
  for (let i = 1; i <= 4; i++) sim.addCrew(i, 'P' + i);
  sim.getCrew(2).carry = 'shell';
  sim.spawnEncounter('gunship', { side: 'left' });
  sim.setInput(1, { up: true }); step(sim, 20);
  const snap = sim.snapshot(), json = JSON.stringify(snap), back = JSON.parse(json);
  check(JSON.stringify(back) === json, `the snapshot round-trips through JSON (${json.length} bytes)`);
  check(back.crew.length === 4 && back.crew[1].carry === 'shell' && back.enc.length === 1 && back.turret, 'with the crew, what they carry, the encounters and the turret');
  check(json.length < 3000, 'and stays small');
  const s1 = B.createSim({ seed: 9 }), s2 = B.createSim({ seed: 9 });
  check(s1.rand() === s2.rand() && s1.rand() === s2.rand(), 'the RNG is seeded');
}

console.log(failed ? `\n${failed} FAILED` : '\nall big-ship tests passed');
process.exitCode = failed ? 1 : 0;
