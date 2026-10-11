// Every weak spot must be hittable from its cannon within 10 s when aiming well.
// Aims with lead at the part's side facing us, respects the cannon's aim arc, and
// runs several random sway patterns per part. Hull wear is disabled so only direct
// hits count; the frigate's shield is kept down. Run: node tests/reachability.js
const { loadGame } = require('./harness');

const TIME_LIMIT = 10, TRIALS = 6, DT = 1 / 60;
const G = loadGame(['tick', 'player', 'combat', 'combatClear', 'combatSpawn', 'teleportToGun', 'ENEMY_TYPES',
  'enemyToWorld', 'SHELL_SPEED', 'makeAsteroid', 'crackPos', 'fireCannon', 'CAPACITORS', 'CAP_MAX', 'SYSTEMS']);
for (const k in G.ENEMY_TYPES) G.ENEMY_TYPES[k].wear = Infinity;

// Point on the part's near edge (the side facing our ship), in enemy-local units.
function nearPoint(p) {
  const s = p.shape;
  if (s.circle) return [s.circle[0] + s.circle[2] * 0.6, s.circle[1]];
  const pts = s.line || s.poly, mx = Math.max(...pts.map(q => q[0]));
  return [mx - 0.06, p.c[1]];
}

// Aim at target(t) with lead: iterate the intercept time a few times.
function aimWithLead(g, target, vel) {
  let [tx, ty] = target;
  for (let i = 0; i < 4; i++) {
    const tt = Math.hypot(tx - g.x, ty - g.y) / G.SHELL_SPEED;
    tx = target[0] + vel[0] * tt; ty = target[1] + vel[1] * tt;
  }
  g.aim = Math.atan2(ty - g.y, tx - g.x);
}

function tryPart(kind, side, partId) {
  G.combatClear(); G.combatSpawn(kind, side); G.teleportToGun(side);
  const e = G.combat.enemies[0], g = G.player.gun;
  const part = e.pois.find(p => p.id === partId);
  let prev = null;
  for (let t = 0; t < TIME_LIMIT; t += DT) {
    e.shieldT = 3;                                  // keep the frigate's shield bubble down
    const pt = G.enemyToWorld(e, ...nearPoint(part));
    const vel = prev ? [(pt[0] - prev[0]) / DT, (pt[1] - prev[1]) / DT] : [0, 0];
    prev = pt;
    aimWithLead(g, pt, vel);
    G.tick(DT);                                     // the game clamps the aim to the cannon's arc and fires on demand below
    if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); G.SYSTEMS.forEach(s => { s.broken = false; }); g.shots = 3; g.reload = 0; G.fireCannon(g); }   // energy isn't what's tested here
    if (part.hit) return t;
  }
  return null;
}

function tryAsteroidCrack() {
  G.combatClear(); G.teleportToGun('front');
  const a = G.makeAsteroid(14 + Math.random() * 16, -30, true, (Math.random() - 0.5) * 0.6, 1.7);
  G.combat.asteroids.push(a);
  const g = G.player.gun;
  let prev = null;
  for (let t = 0; t < TIME_LIMIT; t += DT) {
    if (!G.combat.asteroids.includes(a)) return t;  // split = crack was hit
    const pt = G.crackPos(a);
    const vel = prev ? [(pt[0] - prev[0]) / DT, (pt[1] - prev[1]) / DT] : [0, 0];
    prev = pt;
    aimWithLead(g, pt, vel);
    if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); G.SYSTEMS.forEach(s => { s.broken = false; }); g.shots = 3; g.reload = 0; G.fireCannon(g); }   // energy isn't what's tested here
    G.tick(DT);
  }
  return null;
}

let failed = 0;
const report = (label, times) => {
  const misses = times.filter(t => t === null).length;
  const worst = Math.max(...times.map(t => t ?? Infinity));
  console.log(`${misses ? 'FAIL' : 'ok  '}  ${label.padEnd(44)} worst ${worst === Infinity ? 'never' : worst.toFixed(1) + ' s'}${misses ? `  (${misses}/${times.length} trials missed)` : ''}`);
  if (misses) failed++;
};
for (const kind of Object.keys(G.ENEMY_TYPES).filter(k => !G.ENEMY_TYPES[k].special)) {   // (grappler, spore mother: own rules, see tests/organic.js)
  for (const side of ['port', 'star']) {
    for (const p of G.ENEMY_TYPES[kind].pois) {
      report(`${kind} ${side} — ${p.name}`, Array.from({ length: TRIALS }, () => tryPart(kind, side, p.id)));
    }
  }
}
report('asteroid (front) — crack', Array.from({ length: TRIALS }, tryAsteroidCrack));
console.log(failed ? `\n${failed} weak spot(s) not reliably reachable within ${TIME_LIMIT} s` : `\nall weak spots reachable within ${TIME_LIMIT} s`);
process.exitCode = failed ? 1 : 0;
