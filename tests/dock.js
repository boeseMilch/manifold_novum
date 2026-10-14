// Other ships: pirates (dock, steal, get boarded back, cast off), the derelict (jammed door, sleeping
// intruder, black box, engineer to rescue) and mining an asteroid. Run: node tests/dock.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'dk', 'mission', 'startMission', 'combat', 'combatSpawn', 'dockShip', 'dockGeom', 'walkRects', 'canStand', 'ITEMS', 'power',
  'withCrew', 'inv', 'boarding', 'FUEL_CRATE', 'hz', 'objectiveStatus', 'MISSIONS', 'CAPACITORS', 'hurtCrew', 'evs'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; G.combat.enemies.length = 0; return G; };
function holdOn(G, x, y, done, max = 20) { const m = G.me.input.mouse; m.wx = x; m.wy = y; m.down = true; let t = 0; while (!done() && t < max) { G.simTick(DT); t += DT; } m.down = false; return t; }
const via = (G, pts, max) => pts.every(([x, y]) => walkTo(G, x, y, max));
const doorC = (q) => [q.x + q.w / 2, q.y + q.h / 2];
function walkTo(G, tx, ty, max = 20) {                 // straight-line walking with WASD, axis by axis
  const me = G.me; let t = 0;
  while (Math.hypot(me.x - tx, me.y - ty) > 0.3 && t < max) {
    const k = me.input.keys; k.clear();
    if (Math.abs(me.x - tx) > 0.2) k.add(me.x < tx ? 'KeyD' : 'KeyA'); else if (Math.abs(me.y - ty) > 0.2) k.add(me.y < ty ? 'KeyS' : 'KeyW');
    G.simTick(DT); t += DT;
  }
  me.input.keys.clear(); return Math.hypot(me.x - tx, me.y - ty) <= 0.3;
}

// --- pirates
{
  const G = fresh(); G.combatSpawn('pirate', 'port');
  tickN(G, 60 * 41);
  check(G.dk.dock?.kind === 'pirate' && G.dk.pirates.length === 2, 'a pirate raider that isn\'t driven off in 40 s docks, and two pirates come aboard');
  const reserve0 = G.power.reserve; G.me.x = 37; G.me.y = 5;          // stay out of their way
  tickN(G, 60 * 40);
  check(G.power.reserve < reserve0 || G.dk.dock.crate.length > 2, `they steal fuel cells and loose items (spare cells ${reserve0} → ${G.power.reserve}, their crate: ${G.dk.dock.crate.join(', ')})`);
  // shoot them
  const p = G.dk.pirates[0]; G.withCrew(G.me, () => { G.inv.weapon = 'laser'; });
  G.me.x = p.x + 2; G.me.y = p.y; let n0 = G.dk.defeated;
  for (let i = 0; i < 3; i++) G.boarding.bolts.push({ x: p.x + 0.3, y: p.y, vx: -1, vy: 0, life: 1, owner: 'crew' }), G.simTick(DT);
  check(G.dk.defeated === n0 + 1, 'three laser hits take a pirate down (counted for objectives)');
}
// --- pirates: aim with a laser for 2 s, then a very fast shot, then a long cooldown
{
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.splice(1);
  const p = G.dk.pirates[0], me = G.me; p.x = 6; p.y = 19.5; p.cd = 0; me.x = 10.5; me.y = 19.5;
  let shotAt = null, shotSpeed = 0, sawLaser = false;
  for (let t = 0; t < 3 && shotAt === null; t += DT) {
    G.simTick(DT); if (p.aim > 0) sawLaser = true;
    const b = G.boarding.bolts.find(b => b.owner === 'pirate'); if (b) { shotAt = t; shotSpeed = Math.hypot(b.vx, b.vy); }
  }
  check(sawLaser && shotAt > 1.6 && shotAt < 1.9 && shotSpeed >= 25, `a pirate stops and aims (laser sight) for 1.7 s (locked for the last 0.3), then fires a very fast shot (after ${shotAt?.toFixed(2)} s, ${shotSpeed.toFixed(0)} units/s)`);
  for (let i = 0; i < 20; i++) G.simTick(DT);
  check(me.health === 'hurt', 'standing in the laser line gets you hit');
  let again = false; for (let i = 0; i < 60 * 4.5; i++) { G.simTick(DT); if (p.aim > 0) again = true; me.health = 'ok'; }
  check(!again, 'then a long cooldown before it aims again (your window to hit back)');
}
{
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.splice(1);
  const p = G.dk.pirates[0], me = G.me; p.x = 6; p.y = 19.5; p.cd = 0; me.x = 10.5; me.y = 19.5;
  for (let i = 0; i < 60 * 1.6; i++) G.simTick(DT);                       // the laser has locked onto where you stood…
  me.y = 17.0;                                                             // …dive out of the line
  for (let i = 0; i < 60; i++) G.simTick(DT);
  check(me.health === 'ok', 'diving out of the locked laser line dodges the shot');
}
{
  const G = fresh(); G.ITEMS.length = 0; G.power.reserve = 0; G.dockShip('pirate', 'port');
  G.me.x = 37; G.me.y = 6;
  let left = null; for (let t = 0; t < 40 && left === null; t += DT) { G.simTick(DT); if (!G.dk.dock) left = t; }
  check(left !== null, `with nothing (left) to loot, the pirates head home and cast off (after ${left?.toFixed(0)} s)`);
}
{
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.length = 0;
  const g = G.dockGeom('port'), me = G.me; me.x = 3; me.y = g.y;
  check(walkTo(G, g.crate.x + 1, g.crate.y + 1.2), 'you can walk through the tube onto their ship');
  const m = me.input.mouse; m.wx = g.crate.x; m.wy = g.crate.y; m.click = true; G.simTick(DT);
  check(me.inv.item === 'fuel', 'their loot crate has fuel cells for the taking');
  via(G, [[g.crate.x + 1, g.y], doorC(g.doors[1]), [g.core.x + 1.4, g.core.y]]);
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  holdOn(G, g.core.x, g.core.y, () => G.dk.dock?.overloaded);
  check(G.dk.dock?.overloaded, 'jamming their reactor\'s overload with the repair kit makes them panic');
  tickN(G, 60 * 16);
  check(!G.dk.dock && me.mode === 'eva', 'they cast off 15 s later — and whoever is still aboard is left floating outside');
}
// --- derelict
{
  const G = fresh(); G.dockShip('derelict', 'star', { blackbox: true, npc: true });
  const g = G.dockGeom('star'), me = G.me; me.x = 41; me.y = g.y;
  const doorX = g.doors[0].x + g.doors[0].w / 2;
  walkTo(G, doorX - 0.9, g.y, 15);
  check(me.x < doorX && /jammed/.test(me.prompt?.text || ''), `a jammed door blocks the way ("${me.prompt?.text}")`);
  G.dk.dock.doors[0] = false;                             // (forced open with the manual override)
  const alien = G.boarding.invaders[0];
  check(alien.state === 'dormant', 'something is asleep in there');
  via(G, [doorC(g.doors[0]), [g.npcSpot.x - 0.8, g.y], [g.npcSpot.x - 0.8, g.npcSpot.y]], 15);
  holdOn(G, G.dk.npc.x, G.dk.npc.y, () => G.dk.npc.state !== 'down');
  check(G.dk.npc.state === 'follow', 'treating the engineer: they follow you');
  const box = G.ITEMS.find(i => i.kind === 'blackbox');
  via(G, [[box.x - 0.5 > g.doors[1].x ? g.doors[1].x - 1 : box.x, g.y], doorC(g.doors[1]), [box.x - 0.6, g.y], [box.x - 0.6, box.y]], 15);
  check(alien.state === 'fight' || me.health !== 'ok', 'the intruder guarding the core room wakes up and attacks when you come close');
  G.boarding.invaders.length = 0; me.health = 'ok';
  const m = me.input.mouse; m.wx = box.x; m.wy = box.y; m.click = true; G.simTick(DT);
  check(me.inv.item === 'blackbox', 'the black box is there to take');
  const x0 = me.x; me.input.keys.add('KeyD'); tickN(G, 30); me.input.keys.delete('KeyD');
  check(me.slow === 0.6, 'carrying the black box slows you down');
  via(G, [[box.x - 0.6, g.y], doorC(g.doors[1]), doorC(g.doors[0]), [41, g.y]], 30); tickN(G, 60 * 4);
  G.mission.objective = { kind: 'blackbox' };
  check(G.objectiveStatus().done, 'back aboard with it: objective done');
  walkTo(G, 37, 19.5, 10); tickN(G, 60 * 6);
  check(G.dk.npc.state === 'safe', 'the engineer followed you all the way back aboard');
}
{
  const G = fresh(); G.startMission('salvage'); G.mission.events.forEach(e => { e.done = true; });
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 60);
  check(G.mission.over && !G.mission.over.won && G.mission.over.survived, `jumping without the black box: survived, but the mission failed ("${G.mission.over?.reason}")`);
}
// --- mining
{
  const G = fresh(); G.startMission('ore'); G.mission.active = false;
  G.dk.rock = { x: 22.2, y: -7.6, r: 2.2, seed: 1 };
  check(G.ITEMS.some(i => i.kind === 'drill'), 'the ore run puts a mining drill in the left airlock room');
  const me = G.me; me.mode = 'eva'; me.x = 22.2; me.y = -4.6; me.vx = me.vy = 0; G.withCrew(me, () => { G.inv.weapon = 'drill'; });
  const t = holdOn(G, 22.2, -6.0, () => G.hz.floating.some(f => f.kind === 'ore'));
  check(G.hz.floating.some(f => f.kind === 'ore') && t < 6.5, `drilling the asteroid on a spacewalk gives an ore sample (${t.toFixed(1)} s)`);
}
process.exitCode = failed ? 1 : 0;
