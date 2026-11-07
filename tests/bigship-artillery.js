// Prototype 3 (the big ship): headless tests of the artillery (prototype3/sim-artillery.js): the loading loop from
// the magazine to a shot, firing empty / without energy, the ready rack, the range wheel and the traverse, leading a
// gunship (two hits kill it), the gunship's own fire, asteroids, and that every target stays in range.
// Run: node tests/bigship-artillery.js
const B = require('../prototype3/sim.js');
const A = B.ARTILLERY;
const DT = 1 / 30;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) sim.tick(DT); };
const secs = (sim, s) => step(sim, Math.round(s / DT));
const press = (sim, c, key, held = {}) => { sim.setInput(c.id, { ...held, pressed: [key] }); sim.tick(DT); };
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
  step(sim);
  return t;
}
const S = B.STATIONS, T = B.TURRET;
// A sim without the helm's route (sim-helm.js would jump steps and spawn its own encounters meanwhile).
const newSim = (o) => { const sim = B.createSim(o); sim.helm = null; return sim; };
const AT = { shellRacks: [S.shellRacks.x, S.shellRacks.y + 0.6], breech: [S.breech.x + 0.75, S.breech.y + 0.4], readyRack: [S.readyRack.x, S.readyRack.y - 0.55],
  cupola: [S.cupola.sx + 0.2, S.cupola.sy], rangeWheel: [S.rangeWheel.sx, S.rangeWheel.sy + 0.2] };
const place = (sim, c, where) => { [c.x, c.y] = AT[where]; step(sim); };
const events = (sim, type) => sim.takeEvents().filter(e => !type || e.type === type);
// Load the breech by hand (open it, hold E to ram) for crew member c standing at the breech with a shell.
function load(sim, c) {
  press(sim, c, 'use'); secs(sim, A.OPEN_TIME + 0.1);
  press(sim, c, 'use', { use: true }); secs(sim, A.RAM_TIME + 0.1);
  sim.setInput(c.id, { use: false }); step(sim);
}
// Aim the gun (angle and range) so that a shell fired now lands where f(t) is when it lands (t: seconds from now).
function aimAt(sim, f) {
  let t = 1;
  for (let k = 0; k < 30; k++) {
    const p = f(t), d = Math.hypot(p.x - T.x, p.y - T.y);
    t = d / A.SHELL_SPEED;
  }
  const p = f(t);
  sim.turret.angle = Math.atan2(p.y - T.y, p.x - T.x);
  sim.turret.range = Math.hypot(p.x - T.x, p.y - T.y);
  return p;
}
const loaded = (sim) => { sim.breech = 'loaded'; };
const landAll = (sim) => secs(sim, A.RANGE_MAX / A.SHELL_SPEED + 0.2);

// --- the stations are built (not the core's placeholders)
for (const id of ['cupola', 'rangeWheel', 'breech', 'readyRack', 'shellRacks'])
  check(!/not built/.test(S[id].prompt(newSim({ seed: 1 }), { carry: null, id: 0 }) || ''), `${id} is built`);
check(S.cupola.seat && S.cupola.claims.includes('fire') && S.rangeWheel.seat && !S.breech.seat, 'cupola and range wheel are seats (the cupola claims Space), the breech is not');

// --- the full loop: magazine -> breech -> open -> ram -> fire
{
  const sim = newSim({ seed: 1 }), L = sim.addCrew(1, 'Loader'), G = sim.addCrew(2, 'Gunner');
  place(sim, L, 'shellRacks');
  check(L.focus === 'shellRacks' && /Take a shell \(10 left\)/.test(L.prompt), `at the shell racks: "${L.prompt}"`);
  press(sim, L, 'use');
  check(L.carry === 'shell' && sim.magazine === 9, 'E takes a shell (9 left in the magazine)');
  press(sim, L, 'use');
  check(L.carry === null && sim.magazine === 10, 'E with a shell in hand puts it back');
  press(sim, L, 'use');
  const t = walkTo(sim, L, [[9.9, 38.3], [9.9, 30.0], [8.8, 29.6], AT.breech]);
  check(t > 7 && L.carry === 'shell', `carried the shell to the breech (${t.toFixed(1)} s, slowed to ${B.CARRY_SPEED.shell * 100} %)`);
  check(L.focus === 'breech' && /Open the breech/.test(L.prompt), `at the breech: "${L.prompt}"`);
  press(sim, L, 'use');
  check(L.action && L.action.label === 'Opening' && sim.breech === 'empty', 'E starts opening the breech');
  secs(sim, A.OPEN_TIME + 0.05);
  check(sim.breech === 'open' && !L.action, `after ${A.OPEN_TIME} s it is open`);
  step(sim);
  check(/Hold E: ram/.test(L.prompt), `with a shell in hand: "${L.prompt}"`);
  press(sim, L, 'use', { use: true }); secs(sim, A.RAM_TIME * 0.5);
  sim.setInput(L.id, { use: false }); step(sim, 2);
  check(sim.breech === 'open' && L.carry === 'shell' && !L.action, 'letting go of E half-way: no shell rammed, still in hand');
  press(sim, L, 'use', { use: true }); secs(sim, A.RAM_TIME + 0.05);
  sim.setInput(L.id, { use: false }); step(sim);
  check(sim.breech === 'loaded' && L.carry === null, `holding E for ${A.RAM_TIME} s rams it: LOADED, hands empty`);
  // the gunner sits in the cupola and fires
  place(sim, G, 'cupola');
  check(G.focus === 'cupola', 'the cupola seat is in reach');
  press(sim, G, 'use');
  check(G.station === 'cupola', 'E sits down in the cupola');
  sim.setInput(G.id, { right: true }); secs(sim, 1);
  sim.setInput(G.id, { right: false }); step(sim);
  const turned = (sim.turret.angle + Math.PI / 2) * 180 / Math.PI;
  check(Math.abs(turned - 20) < 1.5, `D traverses the turret ~20°/s (${turned.toFixed(1)}° in 1 s)`);
  events(sim);
  const aim = A.aimPoint(sim), range = sim.turret.range;
  press(sim, G, 'fire');
  const ev = events(sim);
  const shot = ev.find(e => e.type === 'gunFire');
  check(G.station === 'cupola', 'Space fires, it does not leave the seat');
  check(shot && sim.energy === 11 && sim.breech === 'empty' && sim.stats.shotsFired === 1, 'the shot: -1 energy (11), the breech is empty again');
  check(shot && Math.abs(shot.dur - range / A.SHELL_SPEED) < 0.02 && Math.hypot(shot.x1 - aim.x, shot.y1 - aim.y) < 0.02, `flight ${shot && shot.dur} s = range / ${A.SHELL_SPEED}, aimed at the range mark`);
  check(ev.some(e => e.type === 'caseEject') && sim.art.steam > 0, 'the case drops out, the breech steams');
  sim.setInput(G.id, { left: true }); secs(sim, 0.5); sim.setInput(G.id, { left: false });
  secs(sim, range / A.SHELL_SPEED);
  const sp = events(sim, 'splash')[0];
  check(sp && !sp.hit && Math.hypot(sp.x - aim.x, sp.y - aim.y) < 0.05, 'it splashes where the gun pointed when it fired (not where it points now)');
  step(sim); check(/steaming/.test(L.prompt) || sim.art.steam === 0, 'the breech steams for a moment after the shot');
  secs(sim, A.STEAM_TIME); step(sim);
  check(/Open the breech/.test(L.prompt), 'then it can be opened again');
  press(sim, G, 'use');
  check(G.station === null, 'E leaves the cupola');
}

// --- can't fire empty, open, or without energy
{
  const sim = newSim({ seed: 2 }), G = sim.addCrew(1, 'Gunner');
  place(sim, G, 'cupola'); press(sim, G, 'use');
  events(sim); press(sim, G, 'fire');
  check(sim.energy === 12 && !events(sim).some(e => e.type === 'gunFire'), 'an empty breech: no shot, no energy spent');
  sim.breech = 'open'; press(sim, G, 'fire');
  check(sim.energy === 12 && sim.breech === 'open' && !events(sim).some(e => e.type === 'gunFire'), 'an open breech: no shot');
  sim.breech = 'loaded'; sim.energy = 0; press(sim, G, 'fire');
  const ev = events(sim);
  check(sim.breech === 'loaded' && !ev.some(e => e.type === 'gunFire') && ev.some(e => e.type === 'banner' && /energy/i.test(e.text) && e.to === 1), 'no energy: no shot, the shell stays in, the gunner is told');
  sim.energy = 1; press(sim, G, 'fire');
  check(sim.energy === 0 && sim.breech === 'empty', 'the last energy fires the last shot');
  // ramming needs a shell; an open breech without one says so
  const L = sim.addCrew(2, 'Loader'); place(sim, L, 'breech'); secs(sim, A.STEAM_TIME + 0.1);
  load(sim, L);
  check(sim.breech === 'open', 'without a shell the breech opens but nothing is rammed');
}

// --- the ready rack: 2 slots
{
  const sim = newSim({ seed: 3 }), H = sim.addCrew(1, 'Hauler');
  place(sim, H, 'readyRack');
  check(H.focus === 'readyRack', 'the ready rack is in reach');
  press(sim, H, 'use');
  check(sim.readyRack === 0 && H.carry === null, 'taking from an empty rack does nothing');
  for (let i = 0; i < 3; i++) { H.carry = 'shell'; press(sim, H, 'use'); }
  check(sim.readyRack === 2 && H.carry === 'shell', 'it holds 2 shells; the third stays in hand');
  press(sim, H, 'use');
  check(sim.readyRack === 2 && H.carry === 'shell', 'with a shell in hand and the rack full, nothing changes');
  H.carry = null; press(sim, H, 'use');
  check(sim.readyRack === 1 && H.carry === 'shell', 'E takes one out');
  // from the rack into the breech
  walkTo(sim, H, [[7.0, 28.0], AT.breech]);
  load(sim, H);
  check(sim.breech === 'loaded' && H.carry === null, 'a shell from the ready rack loads the breech');
  // the magazine runs dry
  sim.magazine = 1; place(sim, H, 'shellRacks'); press(sim, H, 'use'); H.carry = null; press(sim, H, 'use');
  check(sim.magazine === 0 && H.carry === null && /empty/.test(H.prompt), 'the magazine runs out');
}

// --- the range wheel: 10..60, ~8 units/s, W/S or A/D
{
  const sim = newSim({ seed: 4 }), R = sim.addCrew(1, 'Ranger');
  place(sim, R, 'rangeWheel');
  check(R.focus === 'rangeWheel', 'the range wheel is in reach');
  press(sim, R, 'use');
  check(R.station === 'rangeWheel', 'E sits at the range wheel');
  const r0 = sim.turret.range;
  sim.setInput(R.id, { up: true }); secs(sim, 1);
  check(Math.abs(sim.turret.range - r0 - A.RANGE_SPEED) < 0.4, `W: further, ${(sim.turret.range - r0).toFixed(1)} units/s`);
  secs(sim, 10);
  check(sim.turret.range === A.RANGE_MAX, `it stops at ${A.RANGE_MAX}`);
  sim.setInput(R.id, { up: false, left: true }); secs(sim, 1);
  check(Math.abs(A.RANGE_MAX - sim.turret.range - A.RANGE_SPEED) < 0.4, 'A: nearer');
  sim.setInput(R.id, { left: false, down: true }); secs(sim, 10);
  check(sim.turret.range === A.RANGE_MIN, `S: nearer, it stops at ${A.RANGE_MIN}`);
  sim.setInput(R.id, { down: false, right: true }); secs(sim, 0.5);
  check(sim.turret.range > A.RANGE_MIN + 3, 'D: further');
  check(Math.abs(sim.turret.angle + Math.PI / 2) < 1e-9, 'the range wheel does not traverse');
}

// --- a gunship: lead it and it's hit; two hits kill it; no lead misses
for (const side of ['left', 'right']) {
  const sim = newSim({ seed: side === 'left' ? 5 : 6 }); sim.addCrew(1, 'G');
  const g = sim.spawnEncounter('gunship', { side });
  check(side === 'left' ? g.x < -15 : g.x > 40, `a gunship from the ${side} is off that side (x ${g.x.toFixed(1)})`);
  sim.hull = 1000;                  // (its own fire mustn't end the run here)
  // wait until it moves fast, then fire at where it is (no lead): a miss
  let k = 0; while (Math.abs(Math.cos(g.age * g.w + g.ph) * g.amp * g.w) < g.amp * g.w * 0.9 && k++ < 600) step(sim);
  aimAt(sim, () => ({ x: g.x, y: g.y })); loaded(sim); B.ARTILLERY.fire(sim, null); events(sim); landAll(sim);
  check(g.hp === 2 && events(sim, 'splash').some(e => !e.hit), `${side}: aimed at where it is, the shell misses (it moved on)`);
  for (let n = 1; n <= 2; n++) {
    const age = g.age;
    aimAt(sim, (t) => B.gunshipPos(g, age + t)); loaded(sim); B.ARTILLERY.fire(sim, null); events(sim);
    landAll(sim);
    const ev = events(sim);
    check(ev.some(e => e.type === 'splash' && e.hit), `${side}: with the right lead, shell ${n} hits`);
    if (n === 1) check(g.hp === 1 && !g.dead && sim.encounters.includes(g) && ev.some(e => e.type === 'gunshipHit'), `${side}: one hit leaves it with 1 hp`);
    else check(g.dead && !sim.encounters.includes(g) && ev.some(e => e.type === 'gunshipDown') && sim.stats.gunshipsDowned === 1, `${side}: the second hit destroys it`);
  }
}

// --- the gunship's fire: every 5-7 s, -6 hull each, visible shots; it falls behind at the step's end
{
  const sim = newSim({ seed: 7 }); sim.addCrew(1, 'G');
  sim.spawnEncounter('gunship', { side: 'right' }); events(sim);
  const shots = [], hits = [];
  for (let i = 0; i < 40 / DT; i++) { step(sim); for (const e of events(sim)) { if (e.type === 'enemyShot') shots.push([sim.time, e]); if (e.type === 'hullHit') hits.push(e); } }
  const gaps = shots.slice(1).map((s, i) => s[0] - shots[i][0]);
  check(shots.length >= 5 && shots.length <= 8 && gaps.every(g => g >= 4.9 && g <= 7.1), `in 40 s it fires ${shots.length} times, every ${gaps.map(g => g.toFixed(1)).join(', ')} s`);
  check(hits.length >= shots.length - 1 && hits.every(h => h.n === 6 && h.x > 20), `each shot that lands does -6 on the right side (${hits.length} hits, hull ${sim.hull})`);
  check(shots.every(([, e]) => e.dur > 0.5 && e.x0 > 30), 'the shots fly a while (visible), from the gunship');
  sim.endEncounters();
  check(sim.encounters.length === 0 && events(sim).some(e => e.type === 'gunshipLeaves'), 'at the step\'s end it falls behind');
}

// --- asteroids: 4-6 rocks from ahead over ~35 s, -8 each; one hit smashes one
{
  const sim = newSim({ seed: 8 }); sim.addCrew(1, 'G');
  const f = sim.spawnEncounter('asteroids', {}); events(sim);
  check(f.n >= 4 && f.n <= 6 && f._rocks.every(r => r.y < r.hy && r.dy > 0.5), `${f.n} rocks, all coming from ahead`);
  const impacts = [];
  for (let i = 0; i < 40 / DT; i++) { step(sim); for (const e of events(sim, 'rockImpact')) impacts.push(sim.time); }
  check(impacts.length === f.n && sim.hull === 100 - 8 * f.n, `left alone, all ${f.n} hit the hull: -8 each (hull ${sim.hull})`);
  check(impacts[0] >= 7 && impacts.at(-1) <= 37 && impacts.at(-1) - impacts[0] > 20, `spread over the step (${impacts.map(t => t.toFixed(0)).join(', ')} s)`);
  check(!sim.encounters.includes(f), 'the field is gone once every rock is');
  // shoot one down
  const s2 = newSim({ seed: 8 }); s2.addCrew(1, 'G');
  const f2 = s2.spawnEncounter('asteroids', {});
  const r = f2._rocks[0];
  secs(s2, r.t0 + 2);                                      // in sight
  const age = f2.age;
  const p = aimAt(s2, (t) => B.ARTILLERY.rockPos(r, age + t));
  check(s2.turret.range >= A.RANGE_MIN && s2.turret.range <= A.RANGE_MAX, `the first rock is in range when it shows (${s2.turret.range.toFixed(1)})`);
  loaded(s2); B.ARTILLERY.fire(s2, null); events(s2); landAll(s2);
  const ev = events(s2);
  check(r.done && ev.some(e => e.type === 'rockSmash') && s2.stats.rocksSmashed === 1 && s2.hull === 100, 'a shell on the rock smashes it, the hull is spared');
  check(f2.rocks.every(q => q[0] !== r.id), 'the smashed rock is gone from the snapshot');
  for (let i = 0; i < 40 / DT; i++) step(s2);
  check(s2.hull === 100 - 8 * (f2.n - 1), `the others still hit (hull ${s2.hull})`);
}

// --- everything is within the gun's range (10..60 from the turret) over its whole life, both sides, many seeds
{
  let worst = [Infinity, 0], rockOk = true;
  for (let seed = 1; seed <= 60; seed++) {
    const sim = newSim({ seed });
    const gs = [sim.spawnEncounter('gunship', { side: 'left' }), sim.spawnEncounter('gunship', { side: 'right' })];
    const f = sim.spawnEncounter('asteroids', {});
    sim.hull = 1e9;
    for (let i = 0; i < 45 / DT; i++) {
      step(sim);
      for (const g of gs) { const d = Math.hypot(g.x - T.x, g.y - T.y); worst = [Math.min(worst[0], d), Math.max(worst[1], d)]; }
    }
    // every rock spends at least 8 s inside 10..60 before it hits
    for (const r of f._rocks) {
      let inside = 0;
      for (let t = r.t0; t < r.tHit; t += 0.1) { const p = B.ARTILLERY.rockPos(r, t), d = Math.hypot(p.x - T.x, p.y - T.y); if (d >= A.RANGE_MIN && d <= A.RANGE_MAX) inside += 0.1; }
      if (inside < 8) rockOk = false;
    }
  }
  check(worst[0] >= A.RANGE_MIN + A.HIT_R && worst[1] <= A.RANGE_MAX - 1, `gunships stay ${worst[0].toFixed(1)}..${worst[1].toFixed(1)} units from the gun (range ${A.RANGE_MIN}..${A.RANGE_MAX})`);
  check(rockOk, 'every rock is in range for at least 8 s before it hits');
}

// --- the snapshot carries the artillery and stays small
{
  const sim = newSim({ seed: 9 }); for (let i = 1; i <= 3; i++) sim.addCrew(i, 'P' + i);
  sim.spawnEncounter('gunship', { side: 'left' }); sim.spawnEncounter('asteroids', {});
  secs(sim, 25); loaded(sim); A.fire(sim, null); step(sim);
  const snap = sim.snapshot(), json = JSON.stringify(snap);
  check(snap.art && snap.art.steam > 0 && snap.art.shells.length === 1 && snap.enc.some(e => e.kind === 'asteroids' && Array.isArray(e.rocks)), 'snap.art (steam, shells in flight) and the rocks');
  check(!json.includes('_rocks') && !json.includes('_next') && json.length < 3500, `no private fields, ${json.length} bytes`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall artillery tests passed');
process.exitCode = failed ? 1 : 0;
