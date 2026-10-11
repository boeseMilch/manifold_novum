// The newer threats can actually be dealt with by a gunner (aiming only at what a player can see):
// the stealth fighter, leech swarms, the mine drone, spore clouds; and the leviathan always warns
// before it bumps a room. Run: node tests/threats.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const N = ['tick','player','me','combat','combatClear','combatSpawn','teleportToGun','ENEMY_TYPES','enemyToWorld','SHELL_SPEED','fireCannon','CAPACITORS','CAP_MAX','SYSTEMS','mission','evs','org','spawnLeeches','spawnMineDrone','spawnSpores','stealthAlpha','startLeviathan','roomById','GUNS','gunArc'];
const DT = 1/60;
const G0 = () => { const G = loadGame(N); G.mission.active = false; return G; };
function aim(G, g, target, vel) { let [tx,ty]=target; for (let i=0;i<4;i++){ const tt=Math.hypot(tx-g.x,ty-g.y)/G.SHELL_SPEED; tx=target[0]+vel[0]*tt; ty=target[1]+vel[1]*tt; } g.aim=Math.atan2(ty-g.y,tx-g.x); }
function fire(G, g) { if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); G.SYSTEMS.forEach(s => { s.broken = false; }); g.shots = 3; g.reload = 0; G.fireCannon(g); } }
function inArc(g, x, y) { const d = Math.atan2(y - g.y, x - g.x) - g.a; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= G0gunArc(g); }
let G0gunArc;
// stealth fighter: aim only at where it was last seen (visible when alpha > 0.3)
for (const side of ['port','star']) {
  const G = G0(); G0gunArc = G.gunArc; G.combatSpawn('stealth', side); G.teleportToGun(side); const e = G.combat.enemies[0], g = G.player.gun;
  let seen = null, t = 0, prevSeen = null;
  for (; t < 120 && e.phase === 'fighting'; t += DT) {
    G.player.health = 'ok'; if (G.player.mode !== 'gun') G.teleportToGun(side);
    if (G.stealthAlpha(e) > 0.3) { const left = e.pois.find(p => !p.hit); seen = G.enemyToWorld(e, left.c[0] + 0.2, left.c[1]); }
    if (seen) { aim(G, g, seen, [0,0]); fire(G, g); }
    G.tick(DT);
  }
  check(e.phase !== 'fighting' && t < 60, `stealth fighter (${side}): killed in ${t.toFixed(0)} s, aiming only where it was last seen`);
}
// leeches: how many can a gunner shoot before they latch?
for (const side of ['port','star']) {
  const G = G0(); G0gunArc = G.gunArc; G.spawnLeeches(side); G.teleportToGun(side); const g = G.player.gun;
  for (let t = 0; t < 20; t += DT) {
    const fly = G.org.leeches.filter(l => l.state === 'fly' && inArc(g, l.x, l.y)).sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
    if (fly) { aim(G, g, [fly.x, fly.y], [(fly.tx - fly.x), (fly.ty - fly.y)].map(v => v / Math.hypot(fly.tx - fly.x, fly.ty - fly.y) * 2.4)); fire(G, g); }
    G.tick(DT);
  }
  const lat = G.org.leeches.filter(l => l.state === 'latched').length;
  check(6 - G.org.leeches.length >= 4, `leech swarm (${side}): ${6 - G.org.leeches.length} of 6 shot on the way in, ${lat} latched`);
}
// mine drone: shot down before it plants?
for (const side of ['port','star']) {
  let down = 0;
  for (let k = 0; k < 6; k++) {
    const G = G0(); G0gunArc = G.gunArc; G.spawnMineDrone(side); G.teleportToGun(side); const g = G.player.gun; const d = G.evs.drones[0]; let prev = null;
    for (let t = 0; t < 15; t += DT) {
      if (!G.evs.drones.length) break;
      const vel = prev ? [(d.x - prev[0]) / DT, (d.y - prev[1]) / DT] : [0, 0]; prev = [d.x, d.y];
      aim(G, g, [d.x, d.y], vel); fire(G, g); G.tick(DT);
    }
    if (!G.evs.drones.length && G.evs.mines.length < 3) down++;
  }
  check(down >= 5, `mine drone (${side}): shot down before it planted all its mines in ${down}/6 tries`);
}
// spore clouds from the side: popped before reaching the hull?
for (const side of ['port','star']) {
  let popped = 0, total = 0;
  for (let k = 0; k < 4; k++) {
    const G = G0(); G0gunArc = G.gunArc; G.spawnSpores(side); G.teleportToGun(side); const g = G.player.gun;
    total += G.evs.spores.length;
    for (let t = 0; t < 30; t += DT) {
      const s = G.evs.spores.filter(s => inArc(g, s.x, s.y)).sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
      if (s) { aim(G, g, [s.x, s.y], [s.vx, s.vy]); fire(G, g); }
      G.tick(DT);
    }
    popped += 3 - G.evs.barnacles.length;
  }
  check(popped >= total * 0.8, `spore clouds (${side}): ${popped}/${total} popped before they stuck`);
}
// the leviathan: every bump comes with at least 3 s of warning on that room's floor
{
  const G = G0(); G.startLeviathan(); const V = G.org.lev; let warned = null, ok = true, bumps = 0, lastI = 0;
  for (let t = 0; t < 31; t += DT) {
    if (V.i < V.order.length && warned?.room !== V.order[V.i]) warned = { room: V.order[V.i], at: t };
    G.tick(DT);
    if (G.org.lev && V.i > lastI) { lastI = V.i; bumps++; if (t - warned.at < 3) ok = false; }
  }
  check(ok && bumps >= 6, `the leviathan warns at least 3 s before each of its ${bumps} bumps`);
}
process.exitCode = failed ? 1 : 0;
