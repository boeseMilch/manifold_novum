// Organic enemies: grappler (tentacle, healing weak spots), leech swarm, spore mother, leviathan.
// Run: node tests/organic.js
const { loadGame } = require('./harness');
const NAMES = ['hz', 'simTick', 'me', 'crew', 'org', 'evs', 'mission', 'startMission', 'combat', 'combatSpawn', 'pressShield', 'CAPACITORS', 'hitPoi', 'enemyToWorld',
  'tentacleBase', 'spawnLeeches', 'startLeviathan', 'SYSTEMS', 'withCrew', 'inv', 'roomById', 'HEAL_TIME', 'GUNS', 'power',
  'LEECH_SUCK_ONE', 'leechSuckTime', 'leechSuckPoint', 'paceFactor', 'deliverEnergy', 'CAP_MAX', 'netSerialize', 'netApply', 'runEvent', 'organicPlates'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false; G.combat.enemies.length = 0; G.power.reactor.fuel = 0; return G; };
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
// --- leeches: latched, they never break parts; they drain their side's capacitor, one energy ball at a time
{
  const G = fresh(); G.spawnLeeches('star');
  tickN(G, 60 * 12);
  const latched = G.org.leeches.filter(l => l.state === 'latched').length;
  check(latched === 6, `leeches latch onto the hull (${latched})`);
  // pin the clock: a full right capacitor, no reactor, the leeches latched; measure one unit with 6, then with 1
  G.org.suck = []; G.org.leeches.forEach(l => { l.drank = 0; l.fed = 0; });   // (what they drank while latching on doesn't count)
  G.CAPACITORS[2].charge = 3; G.CAPACITORS[0].charge = 1; G.CAPACITORS[1].charge = 1; G.SYSTEMS.forEach(s => { s.broken = false; });
  const per6 = G.leechSuckTime(6);
  check(Math.abs(G.leechSuckTime(1) - G.LEECH_SUCK_ONE * G.paceFactor()) < 1e-9 && Math.abs(per6 - G.leechSuckTime(1) / 6) < 1e-9, `one unit per LEECH_SUCK_ONE / n s (${G.leechSuckTime(1).toFixed(1)} s alone, ${per6.toFixed(1)} s with 6)`);
  G.simTick(DT);
  const b = G.org.suck[0];
  check(G.org.suck.length === 1 && b.side === 'star' && G.CAPACITORS[2].charge === 2, 'a ball sets off from the right capacitor (its energy leaves it at once)');
  const p0 = G.leechSuckPoint(b); tickN(G, Math.round(60 * per6 / 2)); const p1 = G.leechSuckPoint(b);
  check(G.org.suck[0] === b && Math.abs(b.k - 0.5) < 0.03 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 3, `halfway after ${(per6 / 2).toFixed(1)} s, on its way (k ${b.k.toFixed(2)})`);
  const to = G.org.leeches.find(l => l.uid === b.to);
  tickN(G, Math.round(60 * per6 / 2) + 2);
  check(!G.org.suck.includes(b) && to.drank === 1 && to.fed > 0.9, 'it arrives: that leech swells (drank 1)');
  check(G.org.suck.length === 1 && G.org.suck[0].to !== to.uid && G.CAPACITORS[2].charge === 1, 'the next ball sets off at once, for the next leech');
  tickN(G, Math.round(60 * per6 * 2) + 4);
  check(G.CAPACITORS[2].charge === 0 && new Set(G.org.leeches.filter(l => l.drank).map(l => l.uid)).size === 3, 'and so forth: three units, three different leeches');
  check(!G.SYSTEMS.some(s => s.broken) && G.CAPACITORS[0].charge === 1 && G.CAPACITORS[1].charge === 1, 'nothing breaks; the other capacitors aren\'t touched');
  // empty: they wait; the reactor's next energy goes straight to them
  tickN(G, 60 * 10);
  check(G.org.suck.length === 0 && G.CAPACITORS[2].charge === 0, 'right capacitor empty: no ball, they wait');
  G.power.lever.pos = 2; G.power.lever.jammed = true; G.deliverEnergy(); tickN(G, 60 * 1.2);
  check(G.CAPACITORS[2].charge === 0 && G.org.suck.length === 1, 'the reactor\'s next energy: they take it as soon as it arrives');
  // a lone leech: 6 times slower
  G.org.suck = []; G.org.leeches.splice(1); G.CAPACITORS[2].charge = 2; const one = G.org.leeches[0], d0 = one.drank || 0;
  tickN(G, Math.round(60 * G.leechSuckTime(1) * 0.9));
  check((one.drank || 0) === d0, 'a lone leech: not done after 90 % of LEECH_SUCK_ONE');
  tickN(G, Math.round(60 * G.leechSuckTime(1) * 0.1) + 3);
  check(one.drank === d0 + 1 && G.CAPACITORS[2].charge === 0, `…done after ${G.leechSuckTime(1).toFixed(0)} s, and the next one is on its way`);
  const sub = []; G.organicPlates((k, o) => sub.push(o.sub));
  check(sub.some(t => /1 latched, sucking the right capacitor/.test(t)), `the sidebar card: "${sub[0]}"`);
  // multiplayer: the ball is plain synced data
  const H = fresh(); H.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(H.org.suck.length === 1 && Math.abs(H.org.suck[0].k - G.org.suck[0].k) < 1e-9 && H.org.suck[0].to === one.uid
        && JSON.stringify(H.leechSuckPoint(H.org.suck[0])) === JSON.stringify(G.leechSuckPoint(G.org.suck[0])), 'multiplayer: the ball (and where it is) reaches the browsers as is');
  // pry it off mid-way: the ball rolls back, the energy goes back into the capacitor
  tickN(G, 60 * 5); const k = G.org.suck[0].k;
  G.org.leeches = [];
  tickN(G, 2);
  check(G.org.suck[0]?.back && G.org.suck[0].k < k, 'its leech gone (none left): the ball rolls back');
  tickN(G, 60 * 1.5);
  check(G.org.suck.length === 0 && G.CAPACITORS[2].charge === 1, 'and its energy is back in the capacitor');
  // a broken capacitor: they can't get at it
  const K = fresh(); K.spawnLeeches('port'); tickN(K, 60 * 12); K.SYSTEMS.find(s => s.ref === K.CAPACITORS[0]).broken = true; K.CAPACITORS[0].charge = 2; K.org.suck = [];
  tickN(K, 60 * 10);
  check(K.CAPACITORS[0].charge === 2 && !K.org.suck.length, 'a broken capacitor: they wait (nothing to drink)');
  // a shield doesn't stop them; a shell pops one on its way in
  const S = fresh(); S.CAPACITORS[2].charge = 3; S.withCrew(S.me, () => S.pressShield('star')); S.spawnLeeches('star'); tickN(S, 60 * 12);
  check(S.org.leeches.filter(l => l.state === 'latched').length === 6, 'shields don\'t stop leeches');
  const G2 = fresh(); G2.spawnLeeches('port'); const l = G2.org.leeches[0];
  G2.combat.shells.push({ x: l.x, y: l.y, vx: 0, vy: 0, life: 1 }); G2.simTick(DT);
  check(!G2.org.leeches.includes(l), 'a cannon shell pops a leech on its way in');
  // a herd with leeches: the same rule
  const R = fresh(); R.runEvent({ t: 0, kind: 'herd', kinds: ['leeches', 'spores'], side: 'port' }); R.CAPACITORS[0].charge = 3; tickN(R, 60 * 20);
  check(R.CAPACITORS[0].charge < 3 && R.org.leeches.some(l => l.drank) && !R.SYSTEMS.some(s => s.broken && s.col === 0 && s.kind !== 'emitter'), 'a herd\'s leeches drink the left capacitor too');
}
// --- spore mother
{
  const G = fresh(); G.combatSpawn('mother', 'star'); const e = G.combat.enemies[0];
  check(e.D.closed(e, e.pois[0]), 'the spore mother\'s sacs are shut');
  tickN(G, 60 * 7);
  check(e.open > 0 && !!G.evs.cloud && !G.evs.spores.length, 'it screams: one mouth opens, a spore cloud forms round the hull, and no spore pods fly at us (they got in the way of the shots)');
  const p = e.pois[e.openSac];
  check(!e.D.closed(e, p) && e.pois.filter(q => !e.D.closed(e, q)).length === 1, 'exactly one tongue can be hit while it screams');
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
