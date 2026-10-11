// Organic enemies: grappler (tentacle, healing weak spots), leech swarm, spore mother, leviathan.
// Run: node tests/organic.js
const { loadGame } = require('./harness');
const NAMES = ['hz', 'simTick', 'me', 'crew', 'org', 'evs', 'mission', 'startMission', 'combat', 'combatSpawn', 'pressShield', 'CAPACITORS', 'hitPoi', 'enemyToWorld',
  'tentacleBase', 'spawnLeeches', 'startLeviathan', 'SYSTEMS', 'withCrew', 'inv', 'roomById', 'HEAL_TIME', 'GUNS', 'power'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; G.combat.enemies.length = 0; G.power.reactor.fuel = 0; return G; };
const hit = (G, e, id) => { const p = e.pois.find(p => p.id === id); G.hitPoi(e, p, ...G.enemyToWorld(e, ...p.c)); };

// --- grappler: tentacle (1 hit), acid, weak spots that switch its tricks off, cannon + spacewalk
{
  const G = fresh({ breach: true }); G.mission.rules.breach = true; G.combatSpawn('grappler', 'port'); const e = G.combat.enemies[0];
  tickN(G, 60 * 9);
  check(e.tent.state === 'attached', 'the grappler wraps a tentacle around the hull');
  G.CAPACITORS[0].charge = 2;
  check(G.withCrew(G.me, () => G.pressShield('port')) === 'grabbed' && G.CAPACITORS[0].charge === 2, 'while it holds on, that side\'s shield can\'t go up (no energy used)');
  const [bx, by] = G.tentacleBase(e), mx = (bx + e.tent.x) / 2, my = (by + e.tent.y) / 2;
  G.combat.shells.push({ x: mx, y: my, vx: 0, vy: 0, life: 1 }); G.simTick(DT);
  check(e.tent.state === 'idle', 'a single cannon hit on the tentacle makes it let go');
  hit(G, e, 'eye'); tickN(G, 60 * 15);
  check(e.tent.state === 'idle', 'with its eye shot, it doesn\'t throw a new tentacle');
  tickN(G, 60 * 9);
  check(e.tent.state === 'attached', 'once the eye has healed (20 s), it grabs again');
  const a0 = e.tent.acid; hit(G, e, 'sac'); tickN(G, 60 * 5);
  check(Math.abs(e.tent.acid - a0) < 0.01, 'with its poison sac shot, the acid stops eating the hull');
  for (const p of e.pois) { p.hit = false; p.healT = 0; }
  const me = G.me; me.mode = 'eva'; me.x = e.tent.x - 0.8; me.y = e.tent.y; me.vx = me.vy = 0; me.health = 'ok';
  let spat = false; const h0 = G.combat.shots.length;
  for (let i = 0; i < 60 * 4; i++) { G.simTick(DT); if (G.combat.shots.some(s => s.acid)) spat = true; me.health = 'ok'; }
  check(spat, 'the beak spits acid at a spacewalker on its side');
  hit(G, e, 'beak'); G.combat.shots.length = 0; let spat2 = false;
  for (let i = 0; i < 60 * 6; i++) { G.simTick(DT); if (G.combat.shots.some(s => s.acid)) spat2 = true; me.health = 'ok'; }
  check(!spat2, 'with its beak shot, it stops spitting');
  const m = me.input.mouse; m.wx = e.tent.x; m.wy = e.tent.y; m.down = true; let s = 0;
  while (e.tent.state === 'attached' && s < 5) { G.simTick(DT); s += DT; }
  m.down = false;
  check(e.tent.state === 'idle' && s < 3.3, `a spacewalker can hack the tentacle off (${s.toFixed(1)} s)`);
  hit(G, e, 'eye'); hit(G, e, 'sac'); hit(G, e, 'beak');
  check(e.phase === 'burning', 'all three weak spots down at once: the grappler is done for');
}
{
  const G = fresh(); G.combatSpawn('grappler', 'star'); const e = G.combat.enemies[0];   // (any mission: always a real hole)
  tickN(G, 60 * 9); const room = e.tent.y < 11.5 ? 'starGun' : 'starLock';
  tickN(G, 60 * 31);
  check(room === 'starGun' && G.hz.breaches.some(b => b.room === room) && e.phase !== 'fighting', `left alone, it always grabs the upper room and rips the weakened hull plate off (a breach in the ${room}) and swims away with it`);
  tickN(G, 60 * 25);
  check(!G.combat.enemies.includes(e), '…and that\'s the end of the encounter');
}
// --- leeches
{
  const G = fresh(); G.spawnLeeches('star');
  tickN(G, 60 * 12);
  const latched = G.org.leeches.filter(l => l.state === 'latched').length;
  check(latched >= 3, `leeches latch onto the hull (${latched})`);
  const broken0 = G.SYSTEMS.filter(s => s.broken).length; tickN(G, 60 * 21);
  check(G.SYSTEMS.filter(s => s.broken && s.col === 2).length > 0 && G.SYSTEMS.filter(s => s.broken).length > broken0, 'latched leeches chew through parts on their side');
  G.SYSTEMS.forEach(s => { s.broken = false; }); G.CAPACITORS[2].charge = 2; G.withCrew(G.me, () => G.pressShield('star')); G.simTick(DT);   // (they may have chewed the shield button)
  check(!G.org.leeches.some(l => l.state === 'latched'), 'raising the shield on that side burns them off');
  const G2 = fresh(); G2.spawnLeeches('port'); const l = G2.org.leeches[0];
  G2.combat.shells.push({ x: l.x, y: l.y, vx: 0, vy: 0, life: 1 }); G2.simTick(DT);
  check(!G2.org.leeches.includes(l), 'a cannon shell pops a leech on its way in');
}
// --- spore mother
{
  const G = fresh(); G.combatSpawn('mother', 'star'); const e = G.combat.enemies[0];
  check(e.D.closed(e, e.pois[0]), 'the spore mother\'s sacs are shut');
  tickN(G, 60 * 7);
  check(G.evs.spores.length > 0 && e.open > 0, 'it puffs spore clouds, and one sac opens');
  const p = e.pois[e.openSac];
  check(!e.D.closed(e, p) && e.pois.filter(q => !e.D.closed(e, q)).length === 1, 'exactly one sac can be hit right after a puff');
}
// --- leviathan
{
  const G = fresh(); G.startLeviathan(); const V = G.org.lev, first = G.roomById(V.order[0]);
  const me = G.me; const [x0, y0] = [first.rects[0].x + 2, first.rects[0].y + 2]; me.x = x0; me.y = y0;
  tickN(G, 60 * 4.5);
  check(me.health === 'hurt' && G.combat.shake > 0, `it bumps the rooms one by one, and whoever is in the room it bumps gets hurt (${first.name})`);
  tickN(G, 60 * 27);
  check(!G.org.lev, 'after 30 s it swims off');
}
process.exitCode = failed ? 1 : 0;
