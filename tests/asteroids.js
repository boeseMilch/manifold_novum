// Front cannon covers 190° (±95°), and big asteroids also split after enough plain
// body hits (not only via the crack). Run: node tests/asteroids.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'player', 'combat', 'combatClear', 'teleportToGun', 'makeAsteroid', 'crackPos', 'fireCannon', 'CAPACITORS', 'CAP_MAX', 'SYSTEMS', 'ASTEROID_WEAR']);
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// arc: aim far past both limits, see where the game clamps it
G.combatClear(); G.teleportToGun('front');
const g = G.player.gun, deg = (r) => r * 180 / Math.PI;
const limits = [];
for (const want of [g.a - 2.2, g.a + 2.2]) {                 // ~126° to either side of straight ahead
  g.aim = want; G.tick(1 / 60); limits.push(deg(g.aim - g.a));
}
check(Math.abs(Math.abs(limits[0]) - 95) < 0.5 && Math.abs(Math.abs(limits[1]) - 95) < 0.5,
      `front cannon swings ±95° (got ${limits.map(l => l.toFixed(1)).join('°, ')}°)`);

// wear: shoot the body (side opposite the crack) until it splits
G.combatClear(); G.teleportToGun('front');
const a = G.makeAsteroid(22.2, -22, true, 0, 0); a.vr = 0; a.vy = 0;
a.crackA = -Math.PI / 2 - a.rot;                             // far side (up, away from the cannon)
G.combat.asteroids.push(a);
let shots = 0;
for (let i = 0; i < 60 * 10 && G.combat.asteroids.includes(a); i++) {
  g.aim = Math.atan2(a.y - g.y, a.x - g.x);
  if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); G.SYSTEMS.forEach(s => { s.broken = false; }); g.shots = 3; g.reload = 0; G.fireCannon(g); shots++; }
  G.tick(1 / 60);
}
const split = !G.combat.asteroids.includes(a) && G.combat.asteroids.filter(x => !x.big).length === 2;
check(split && a.damage.length === G.ASTEROID_WEAR, `big asteroid splits into two after ${G.ASTEROID_WEAR} body hits (took ${a.damage.length} hits, ${shots} shots)`);
process.exitCode = failed ? 1 : 0;
