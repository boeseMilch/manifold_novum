// Front cannon covers 190° (±95°), and big asteroids also split after enough plain
// body hits (not only via the crack). Swarms from the side (2026-10-16): they come in on that flank and hit it,
// that side's shield eats them, that side's cannon (aiming only at what its view shows) shoots them down; the radar
// label, the approved chapters' swarms stay ahead, the snapshot carries the sides. Run: node tests/asteroids.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'combat', 'combatClear', 'teleportToGun', 'makeAsteroid', 'crackPos', 'fireCannon', 'CAPACITORS', 'CAP_MAX', 'SYSTEMS', 'ASTEROID_WEAR',
  'combatSpawn', 'spawnSwarmAsteroid', 'mission', 'gunArc', 'SHELL_SPEED', 'GUNS', 'SHIP_W', 'eventLabel', 'makeEvent', 'MISSIONS', 'startMission', 'netSerialize', 'netApply', 'me', 'swarmWhere', 'runEvent'];
const G = loadGame(NAMES);
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
// --- swarms from the side
const DT = 1 / 60;
const fresh = () => { G.combatClear(); G.combat.hits = { small: 0, large: 0, crew: 0 }; G.combat.decals = []; G.mission.active = false; };
const repairAll = () => G.SYSTEMS.forEach(s => { s.broken = false; });
for (const side of ['port', 'star']) {
  // 120 big rocks, one at a time: from far out on that flank, flying at it, hitting it (rooms all along it)
  const run = (up) => {
    let hits = 0, wrongSide = 0, far = true, flank = true, t = 0, ys = new Set();
    for (let k = 0; k < 120; k++) {
      fresh(); const a = G.spawnSwarmAsteroid(side); G.combat.asteroids.push(a);
      far = far && (side === 'port' ? a.x <= -40 : a.x >= G.SHIP_W + 40) && a.side === side;
      flank = flank && (side === 'port' ? a.vx > 0 : a.vx < 0) && Math.abs(a.vy) < Math.abs(a.vx) * 0.35;
      let i = 0;
      for (; i < 60 * 60 && G.combat.asteroids.length; i++) { if (up) G.combat.shields[side].up = 10; repairAll(); G.tick(DT); }
      if (G.combat.hits.large) { hits++; t += i * DT; const d = G.combat.decals.find(d => !d.scorch && d.r > 1); if (d.side !== side || (side === 'port' ? d.x > 3 : d.x < G.SHIP_W - 3)) wrongSide++; ys.add(d.y < 11.5 ? 'top' : 'bottom'); }
    }
    return { hits, wrongSide, far, flank, t: hits ? t / hits : 0, ys };
  };
  const down = run(false), up = run(true);
  check(down.far && down.flank && down.hits === 120 && !down.wrongSide && down.ys.size === 2 && down.t > 18,
        `${side} swarm: 120 big rocks come in from far out on that flank (sideways) and all hit it (${down.hits}/120, ${down.wrongSide} elsewhere, both decks: ${[...down.ys].join(', ')}), after ${down.t.toFixed(1)} s on average`);
  check(up.hits <= 1, `${side} shield up the whole time: ${up.hits}/120 big rocks hit`);
  // the side cannon, aiming only at rocks in its arc and in its view, shoots a whole swarm down
  let clean = 0, seenAt = [];
  for (let k = 0; k < 6; k++) {
    fresh(); G.teleportToGun(side); const g = G.player.gun; G.combatSpawn('swarm', side);
    const [vx, , vw] = g.view, inView = (x) => Math.abs(x - vx) <= vw / 2;
    for (let i = 0; i < 70 * 60 && (G.combat.swarm || G.combat.asteroids.length); i++) {
      G.player.health = 'ok'; if (G.player.mode !== 'gun') G.teleportToGun(side);
      const ok = (a) => { const d = Math.atan2(a.y - g.y, a.x - g.x) - g.a; return inView(a.x) && Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= G.gunArc(g); };
      const a = G.combat.asteroids.filter(ok).sort((p, q) => Math.hypot(p.x - g.x, p.y - g.y) - Math.hypot(q.x - g.x, q.y - g.y))[0];
      if (a) {
        if (seenAt.length === k) seenAt.push(i * DT);
        const T0 = a.big ? G.crackPos(a) : [a.x, a.y]; let [tx, ty] = T0;
        for (let j = 0; j < 4; j++) { const tt = Math.hypot(tx - g.x, ty - g.y) / G.SHELL_SPEED; tx = T0[0] + a.vx * tt; ty = T0[1] + a.vy * tt; }
        g.aim = Math.atan2(ty - g.y, tx - g.x);
        if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); repairAll(); g.shots = 3; g.reload = 0; G.fireCannon(g); }
      }
      G.tick(DT);
    }
    if (!G.combat.hits.large && !G.combat.hits.small && !G.combat.asteroids.length && !G.combat.swarm) clean++;
  }
  check(clean === 6, `the ${side} cannon shoots a whole ${side} swarm down before it hits, aiming only at what its view frames (${clean}/6; first in view after ${seenAt.map(t => t.toFixed(0)).join('/')} s)`);
}
// labels, sides of events
{
  fresh(); G.combatSpawn('swarm', 'port'); G.tick(DT);
  check(G.combat.banner.text === 'Asteroid swarm on the left side!' && G.swarmWhere() === 'left', `banner "${G.combat.banner.text}", sidebar "${G.swarmWhere()}"`);
  check(G.eventLabel({ kind: 'swarm', side: 'port' }) === 'Asteroid swarm — left' && G.eventLabel({ kind: 'swarm', side: 'star' }) === 'Asteroid swarm — right' && G.eventLabel({ kind: 'swarm', side: 'front' }) === 'Asteroid swarm — front',
        'radar labels: "Asteroid swarm — left / right / front"');
  const sides = new Set(Array.from({ length: 60 }, () => G.makeEvent('swarm', 0).side));
  check(sides.size === 3 && [...sides].every(s => ['front', 'port', 'star'].includes(s)), `makeEvent('swarm') draws its side among front / left / right (${[...sides].join(', ')})`);
  fresh(); G.runEvent({ t: 0, kind: 'swarm', side: 'star' }); G.tick(DT);
  check(G.combat.asteroids[0]?.side === 'star', 'a mission\'s right swarm sends its rocks from the right');
}
// the approved chapters keep their swarms ahead (written and repeated); the others draw
{
  const bad = [], other = new Set();
  for (const id of ['c1', 'c2', 'c3', 'c5', 'c4', 'c6', 'c7']) for (let k = 0; k < 12; k++) {
    const H = loadGame(['crew', 'makeCrew', 'startMission', 'mission']);
    while (H.crew.length < 8) H.crew.push(H.makeCrew('P' + H.crew.length));
    H.startMission(id, {});
    const sw = [...H.mission.written, ...H.mission.events].filter(e => e.kind === 'swarm');
    if (['c1', 'c2', 'c3', 'c5'].includes(id)) { if (sw.some(e => e.side !== 'front')) bad.push(id); }
    else sw.forEach(e => other.add(e.side));
  }
  check(!bad.length && other.size === 3, `chapters 1, 2, 3, 5: every swarm (written and repeated, 8 players) from the front${bad.length ? ' (not: ' + bad.join(', ') + ')' : ''}; c4, c6, c7: ${[...other].join(' / ')}`);
}
// the snapshot carries the sides
{
  fresh(); G.combatSpawn('swarm', 'star'); G.combatSpawn('swarm', 'port'); G.tick(DT);
  const B = loadGame(NAMES); B.startMission('c1'); B.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(B.combat.asteroids[0]?.side === 'star' && B.combat.swarm.sides.join() === 'star,port,port' && B.swarmWhere() === 'right + left',
        `the snapshot carries the swarm's sides (in flight: ${B.combat.asteroids.map(a => a.side).join()}, to come: ${B.combat.swarm.sides.join()}; sidebar "${B.swarmWhere()}")`);
}
process.exitCode = failed ? 1 : 0;
