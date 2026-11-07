// Prototype 3: the artillery (DESIGN.md "Interactable 1"). Loaded after sim.js (BIG.SIM_MODULES).
//
// Stations (replacing the core's placeholders, same ids and places):
//   cupola      seat in fire control: the only view outside. A/D traverses the turret (TRAVERSE rad/s), Space fires.
//   rangeWheel  seat in the gun room: W/S or A/D sets the range (RANGE_MIN..RANGE_MAX, RANGE_SPEED units/s). Dial only.
//   breech      E opens it (OPEN_TIME); E held with a shell in hand rams it (RAM_TIME) -> LOADED. Steams after a shot.
//   readyRack   2 slots: E puts a carried shell in or takes one out.
//   shellRacks  the magazine: E takes a shell (or puts a carried one back).
// Firing: a loaded breech + 1 energy. The shell flies range / SHELL_SPEED s and lands where the barrel pointed when it
// fired (turret + range along the angle); within HIT_R of a target it's a hit (the nearest target only).
// Encounters: gunship ({ side }) and asteroids ({}), see below.
// Events for the client (view-artillery.js): gunFire, caseEject, splash, gunshipHit, gunshipDown, gunshipLeaves,
// enemyShot, rockSmash, rockImpact, dryFire. Snapshot: snap.art = { steam, opening }.
(function () {
'use strict';
const B = globalThis.BIG;
const { TURRET, SHIP, HULL, clamp } = B;
const TAU = Math.PI * 2;

const A = B.ARTILLERY = {
  TRAVERSE: 20 * Math.PI / 180,     // rad/s, the turret's slow motor
  RANGE_MIN: 10, RANGE_MAX: 60, RANGE_SPEED: 8,
  SHELL_SPEED: 18,                  // units/s: flight time = range / 18 (0.56 .. 3.3 s)
  HIT_R: 2.5,
  OPEN_TIME: 0.6, RAM_TIME: 1.0, STEAM_TIME: 1.0,
  RACK_SLOTS: 2,
  SHOT_COST: 1,
  MUZZLE: TURRET.r * 0.3 + TURRET.barrel,     // the barrel's tip, from the turret's middle
  GUNSHIP: { DIST: [32, 45], HP: 2, DAMAGE: 6, FIRE_EVERY: [5, 7], FIRST_SHOT: [3.5, 5.5], AMP: [4, 6.5], SPEED: [0.35, 0.5], BOLT_SPEED: 28 },
  ASTEROIDS: { COUNT: [4, 6], DAMAGE: 8, FIRST: 9, LAST: 35, TRAVEL: 15, SPEED: [2.6, 3.4], R: [0.8, 1.4] },
};
const between = (sim, [a, b]) => a + (b - a) * sim.rand();
const r2 = (v) => Math.round(v * 100) / 100;

function pointInHull(x, y) {
  let inside = false;
  for (let i = 0, j = HULL.length - 1; i < HULL.length; j = i++) {
    const [xi, yi] = HULL[i], [xj, yj] = HULL[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Where the gun's shell lands for the current traverse and range.
const aimPoint = (sim, angle = sim.turret.angle, range = sim.turret.range) =>
  ({ x: TURRET.x + Math.cos(angle) * range, y: TURRET.y + Math.sin(angle) * range });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
B.INIT_HOOKS.push((sim) => {
  sim.art = { shells: [], bolts: [], steam: 0, opening: null };
  Object.assign(sim.stats, { shotsFired: 0, hits: 0, gunshipsDowned: 0, rocksSmashed: 0 });
});
B.SNAPSHOT_HOOKS.push((sim, snap) => {
  snap.art = { steam: r2(sim.art.steam), opening: sim.art.opening ? 1 : 0, shells: sim.art.shells.map(s => [r2(s.x1), r2(s.y1), r2(s.t / s.dur)]) };
});
B.TICK_HOOKS.push((sim, dt) => {
  const S = sim.art;
  S.steam = Math.max(0, S.steam - dt);
  for (const s of S.shells.slice()) {
    if ((s.t += dt) < s.dur) continue;
    S.shells.splice(S.shells.indexOf(s), 1);
    landShell(sim, s);
  }
  for (const b of S.bolts.slice()) {
    if ((b.t += dt) < b.dur) continue;
    S.bolts.splice(S.bolts.indexOf(b), 1);
    sim.damageHull(b.dmg, { x: b.x1, y: b.y1 });
    if (sim.phase !== 'run') return;
  }
});

// ---------------------------------------------------------------------------
// Firing and landing
// ---------------------------------------------------------------------------
function fire(sim, c) {
  if (sim.breech !== 'loaded') { sim.banner(sim.breech === 'open' ? 'Breech open: nothing rammed' : 'Breech empty: load a shell', c && c.id); sim.event({ type: 'dryFire' }); return false; }
  if (sim.energy < A.SHOT_COST) { sim.banner('No energy to fire', c && c.id); sim.event({ type: 'dryFire' }); return false; }
  sim.energy -= A.SHOT_COST;
  sim.breech = 'empty';
  sim.art.steam = A.STEAM_TIME;
  const a = sim.turret.angle, range = sim.turret.range, p = aimPoint(sim);
  const x0 = TURRET.x + Math.cos(a) * A.MUZZLE, y0 = TURRET.y + Math.sin(a) * A.MUZZLE;
  const s = { x0, y0, x1: p.x, y1: p.y, t: 0, dur: range / A.SHELL_SPEED };
  sim.art.shells.push(s);
  sim.stats.shotsFired++;
  sim.event({ type: 'gunFire', a: r2(a), x0: r2(x0), y0: r2(y0), x1: r2(p.x), y1: r2(p.y), dur: r2(s.dur) });
  sim.event({ type: 'caseEject', x: B.STATIONS.breech.x, y: B.STATIONS.breech.y });
  return true;
}
function landShell(sim, s) {
  // the nearest target within HIT_R: a live gunship or a rock in the air
  let best = null, bd = A.HIT_R;
  for (const e of sim.encounters) {
    if (e.dead) continue;
    if (e.kind === 'gunship') {
      const d = Math.hypot(e.x - s.x1, e.y - s.y1);
      if (d <= bd) { best = { e }; bd = d; }
    } else if (e.kind === 'asteroids') {
      for (const r of e._rocks) {
        if (r.done || e.age < r.t0) continue;
        const d = Math.hypot(r.x - s.x1, r.y - s.y1);
        if (d <= bd) { best = { e, r }; bd = d; }
      }
    }
  }
  sim.event({ type: 'splash', x: r2(s.x1), y: r2(s.y1), hit: !!best });
  if (!best) return;
  sim.stats.hits++;
  if (best.r) {
    best.r.done = true;
    sim.stats.rocksSmashed++;
    sim.event({ type: 'rockSmash', x: r2(best.r.x), y: r2(best.r.y), r: best.r.r, seed: best.r.seed });
    syncRocks(best.e);
    return;
  }
  const g = best.e;
  g.hp--;
  if (g.hp > 0) { g.hitT = 1; sim.event({ type: 'gunshipHit', id: g.id, x: r2(g.x), y: r2(g.y) }); sim.banner('Hit! The gunship is smoking'); return; }
  g.dead = true;
  sim.stats.gunshipsDowned++;
  sim.event({ type: 'gunshipDown', id: g.id, x: r2(g.x), y: r2(g.y), side: g.side });
  sim.banner('Gunship destroyed!', null);
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------
B.defineStation({
  id: 'cupola', label: 'Cupola seat', claims: ['fire'],
  prompt: () => 'Cupola seat: look out, aim, fire',
  hint: 'A / D: traverse · Space: fire · E: leave',
  drive(sim, c, inp, dt) {
    if (inp.ax) sim.turret.angle = ((sim.turret.angle + inp.ax * A.TRAVERSE * dt) % TAU + TAU + Math.PI) % TAU - Math.PI;   // keep -PI..PI
    if (inp.pressed.has('fire')) fire(sim, c);
  },
  use: () => {},
});
B.defineStation({
  id: 'rangeWheel', label: 'Range wheel',
  prompt: () => 'Range wheel: set the elevation',
  hint: 'W / S (or A / D): range · E / Space: leave',
  drive(sim, c, inp, dt) {
    const d = inp.ax - inp.ay;          // W (up) or D (right): further
    if (d) sim.turret.range = clamp(sim.turret.range + Math.sign(d) * A.RANGE_SPEED * dt, A.RANGE_MIN, A.RANGE_MAX);
  },
  use: () => {},
});

function startRam(sim, c) {
  if (c.action || sim.breech !== 'open' || c.carry !== 'shell' || sim.art.opening) return;
  sim.art.opening = c.id;
  sim.startAction(c, A.RAM_TIME, 'Ramming', (s, cr) => {
    s.art.opening = null;
    if (s.breech !== 'open' || cr.carry !== 'shell') return;
    cr.carry = null; s.breech = 'loaded';
    s.event({ type: 'rammed', x: B.STATIONS.breech.x, y: B.STATIONS.breech.y });
    s.banner('Breech LOADED', null);
  }, { hold: true, cancel: (s) => { s.art.opening = null; } });
}
B.defineStation({
  id: 'breech', label: 'Breech',
  prompt(sim, c) {
    if (sim.art.opening && sim.art.opening !== c.id) return 'Breech: busy';
    if (sim.breech === 'loaded') return 'Breech: LOADED';
    if (sim.breech === 'empty') return sim.art.steam > 0 ? 'Breech: steaming…' : 'Open the breech';
    return c.carry === 'shell' ? 'Hold E: ram the shell in' : 'Breech open: bring a shell';
  },
  use(sim, c) {
    if (sim.art.opening) return;
    if (sim.breech === 'empty') {
      if (sim.art.steam > 0) return;
      sim.art.opening = c.id;
      sim.startAction(c, A.OPEN_TIME, 'Opening', (s) => { s.art.opening = null; if (s.breech === 'empty') { s.breech = 'open'; s.event({ type: 'breechOpen' }); } },
        { cancel: (s) => { s.art.opening = null; } });
    } else if (sim.breech === 'open') {
      if (c.carry === 'shell') startRam(sim, c);
      else sim.banner('Bring a shell: the ready rack or the magazine', c.id);
    }
  },
  hold(sim, c) { startRam(sim, c); },
});
B.defineStation({
  id: 'readyRack', label: 'Ready rack',
  prompt(sim, c) {
    const n = `(${sim.readyRack}/${A.RACK_SLOTS})`;
    if (c.carry === 'shell') return sim.readyRack < A.RACK_SLOTS ? `Put the shell in the ready rack ${n}` : `Ready rack full ${n}`;
    return sim.readyRack > 0 ? `Take a shell from the ready rack ${n}` : `Ready rack: empty ${n}`;
  },
  use(sim, c) {
    if (c.carry === 'shell') { if (sim.readyRack < A.RACK_SLOTS) { sim.readyRack++; c.carry = null; } else sim.banner('The ready rack is full', c.id); }
    else if (!c.carry) { if (sim.readyRack > 0) { sim.readyRack--; c.carry = 'shell'; } else sim.banner('The ready rack is empty', c.id); }
  },
});
B.defineStation({
  id: 'shellRacks', label: 'Shell racks',
  prompt(sim, c) {
    if (c.carry === 'shell') return 'Put the shell back';
    return sim.magazine > 0 ? `Take a shell (${sim.magazine} left)` : 'Shell racks: empty';
  },
  use(sim, c) {
    if (c.carry === 'shell') { sim.magazine++; c.carry = null; }
    else if (!c.carry) { if (sim.magazine > 0) { sim.magazine--; c.carry = 'shell'; } else sim.banner('The magazine is empty', c.id); }
  },
});

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------
// Gunship: DIST units off that side of the ship's middle line (so 21..34 units off its hull; from the gun on the
// left sponson that's 20..34 units to the left and 43..58 to the right, inside the 60 range), at the gun's height, drifting up and down (and a little
// outwards) so the gunner needs a lead. A bolt at the hull on its side every FIRE_EVERY s, visible in flight.
function hullTarget(sim, side) {
  const y = 10 + sim.rand() * 33, x = side === 'left' ? (y > 21 && y < 26.2 ? -2.4 : 0.6) : (y > 19.8 && y < 26.2 ? 23.8 : 21.4);
  return { x, y };
}
const G = A.GUNSHIP;
const gunshipPos = (e, age) => ({ x: e.x0 + e.s * (1 + Math.sin(age * e.w * 0.53 + e.ph * 2)) * 0.6, y: e.y0 + Math.sin(age * e.w + e.ph) * e.amp });
B.ENCOUNTER_KINDS.gunship = {
  spawn(sim, opts = {}) {
    const side = opts.side === 'right' ? 'right' : 'left', s = side === 'left' ? -1 : 1;
    const e = { side, s, x0: SHIP.cx + s * between(sim, G.DIST), y0: TURRET.y + (sim.rand() - 0.5) * 6, amp: between(sim, G.AMP), w: between(sim, G.SPEED),
      ph: sim.rand() * TAU, hp: G.HP, hitT: 0, flash: 0, _next: between(sim, G.FIRST_SHOT) };
    Object.assign(e, gunshipPos(e, 0));
    return e;
  },
  tick(sim, e, dt) {
    Object.assign(e, gunshipPos(e, e.age));
    e.hitT = Math.max(0, e.hitT - dt); e.flash = Math.max(0, e.flash - dt * 3);
    if (e.age < e._next) return;
    e._next = e.age + between(sim, G.FIRE_EVERY);
    const p = hullTarget(sim, e.side), dur = Math.hypot(p.x - e.x, p.y - e.y) / G.BOLT_SPEED;
    sim.art.bolts.push({ x1: p.x, y1: p.y, t: 0, dur, dmg: G.DAMAGE });
    e.flash = 1;
    sim.event({ type: 'enemyShot', id: e.id, x0: r2(e.x), y0: r2(e.y), x1: r2(p.x), y1: r2(p.y), dur: r2(dur) });
  },
  end(sim, e) { if (!e.dead) sim.event({ type: 'gunshipLeaves', x: r2(e.x), y: r2(e.y), side: e.side, hp: e.hp }); },
};
B.gunshipPos = gunshipPos;

// Asteroid field: COUNT rocks, arriving at the hull between FIRST and LAST s; each one is seen TRAVEL s before it
// hits, flying in a straight line from ahead to a point on the hull's front. One shell hit smashes one.
const AS = A.ASTEROIDS;
function hullFrontAt(x) { for (let y = -12; y < 20; y += 0.05) if (pointInHull(x, y)) return y; return 0; }
function rockPos(r, age) { const k = (r.tHit - age) * r.v; return { x: r.hx - r.dx * k, y: r.hy - r.dy * k }; }
function syncRocks(e) {          // the snapshot's copy: [id, x, y, r, seed] of the rocks in sight
  e.rocks = e._rocks.filter(r => !r.done && e.age >= r.t0).map(r => [r.id, r2(r.x), r2(r.y), r.r, r.seed]);
  e.left = e._rocks.filter(r => !r.done).length;
}
B.ENCOUNTER_KINDS.asteroids = {
  spawn(sim, opts = {}) {
    const n = Math.round(between(sim, [AS.COUNT[0] - 0.49, AS.COUNT[1] + 0.49])), rocks = [];
    for (let i = 0; i < n; i++) {
      const tHit = AS.FIRST + (AS.LAST - AS.FIRST) * (n > 1 ? i / (n - 1) : 0.5) + (sim.rand() - 0.5) * 2;
      const hx = 3 + sim.rand() * 16, hy = hullFrontAt(hx), v = between(sim, AS.SPEED);
      const sx = hx + (sim.rand() - 0.5) * 16, sy = hy - AS.TRAVEL * v, L = Math.hypot(hx - sx, hy - sy);
      const r = { id: i, hx, hy, dx: (hx - sx) / L, dy: (hy - sy) / L, v, tHit, t0: tHit - AS.TRAVEL, r: r2(between(sim, AS.R)), seed: (sim.rand() * 1e6) | 0, done: false };
      Object.assign(r, rockPos(r, 0));
      rocks.push(r);
    }
    const e = { x: SHIP.cx, y: -30, n, _rocks: rocks, rocks: [], left: n };
    syncRocks(e);
    return e;
  },
  tick(sim, e, dt) {
    for (const r of e._rocks) {
      if (r.done) continue;
      Object.assign(r, rockPos(r, e.age));
      if (e.age >= r.tHit) {
        r.done = true;
        sim.event({ type: 'rockImpact', x: r2(r.hx), y: r2(r.hy), r: r.r, seed: r.seed });
        sim.damageHull(AS.DAMAGE, { x: r.hx, y: r.hy });
        if (sim.phase !== 'run') return;
      }
    }
    syncRocks(e);
    if (!e.left) e.dead = true;
  },
  end() {},
};

Object.assign(A, { fire, aimPoint, pointInHull, rockPos, hullFrontAt });
})();
