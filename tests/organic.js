// Organic enemies: grappler (tentacle, healing weak spots), leech swarm, spore mother, leviathan.
// Run: node tests/organic.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'org', 'evs', 'mission', 'startMission', 'combat', 'combatSpawn', 'pressShield', 'CAPACITORS', 'hitPoi', 'enemyToWorld',
  'tentacleBase', 'spawnLeeches', 'startLeviathan', 'SYSTEMS', 'withCrew', 'inv', 'roomById', 'HEAL_TIME', 'GUNS', 'power'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; G.combat.enemies.length = 0; G.power.reactor.fuel = 0; return G; };
const hit = (G, e, id) => { const p = e.pois.find(p => p.id === id); G.hitPoi(e, p, ...G.enemyToWorld(e, ...p.c)); };

// --- grappler
{
  const G = fresh(); G.combatSpawn('grappler', 'port'); const e = G.combat.enemies[0];
  tickN(G, 60 * 10);
  check(e.tent.state === 'attached', 'the grappler throws a tentacle around the hull');
  G.CAPACITORS[0].charge = 2;
  check(G.withCrew(G.me, () => G.pressShield('port')) === 'grabbed' && G.CAPACITORS[0].charge === 2, 'while it holds on, that side\'s shield can\'t go up (no energy used)');
  const g = G.GUNS.find(g => g.id === 'front'), me = G.me; me.mode = 'gun'; me.gun = g; const a0 = g.aim; me.input.mouse.moved = 0;
  tickN(G, 60);
  check(Math.abs(g.aim - a0) > 0.1, 'the ship turns: a manned cannon drifts');
  me.mode = 'inside'; me.gun = null;
  const [bx, by] = G.tentacleBase(e), mx = (bx + e.tent.x) / 2, my = (by + e.tent.y) / 2;
  for (let i = 0; i < 5; i++) { G.combat.shells.push({ x: mx, y: my, vx: 0, vy: 0, life: 1 }); G.simTick(DT); }
  check(e.tent.state === 'idle', 'five cannon hits on the tentacle make it let go');
  tickN(G, 60 * 17);
  const t = e.tent; me.mode = 'eva'; me.x = t.x + (t.x < 0 ? -0.8 : 0.8); me.y = t.y; me.vx = me.vy = 0;
  const m = me.input.mouse; m.wx = t.x; m.wy = t.y; m.down = true; let s = 0;
  while (t.state === 'attached' && s < 5) { G.simTick(DT); s += DT; }
  m.down = false;
  check(t.state === 'idle' && s < 3.3, `on a spacewalk you can hack it off (${s.toFixed(1)} s)`);
  hit(G, e, 'eye'); tickN(G, 60 * (G.HEAL_TIME + 1));
  check(!e.pois.find(p => p.id === 'eye').hit, 'a weak spot heals after 15 s if the others weren\'t hit in time');
  hit(G, e, 'eye'); hit(G, e, 'sac'); hit(G, e, 'beak');
  check(e.phase === 'burning', 'all three hit in time: the grappler is done for');
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
