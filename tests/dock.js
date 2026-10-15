// Other ships: pirates (dock, steal, get boarded back, cast off), the derelict (jammed door, sleeping
// intruder, black box, engineer to rescue) and mining an asteroid. Run: node tests/dock.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'dk', 'mission', 'startMission', 'combat', 'combatSpawn', 'dockShip', 'dockGeom', 'walkRects', 'canStand', 'ITEMS', 'power',
  'withCrew', 'inv', 'boarding', 'FUEL_CRATE', 'hz', 'objectiveStatus', 'MISSIONS', 'CAPACITORS', 'hurtCrew', 'evs', 'hurtPirate', 'undock', 'roomAt', 'inDock', 'HATCHES',
  'baseGeom', 'baseGuards', 'baseDetach', 'baseRedock', 'openBasePad', 'miniCommand', 'freeAt', 'makeCrew', 'netSerialize', 'netApply', 'ui', 'inBase', 'COMBAT_KINDS'];
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
  check(G.dk.npc.state === 'follow', 'treating the engineer: they set off for our ship');
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
  check(G.dk.npc.state === 'safe', 'the engineer made it all the way back aboard');
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
// --- fallen pirates stay down (purely visual bodies, synced as part of dk)
{
  const G = fresh(); G.dockShip('pirate', 'port');
  const p = G.dk.pirates[0], x = p.x, y = p.y;
  G.hurtPirate(p, 99); tickN(G, 60);
  check(G.dk.bodies.length === 1 && G.dk.bodies[0].x === x && G.dk.bodies[0].y === y && G.dk.bodies[0].t >= 0.6, 'a killed pirate falls and stays lying where they died');
  check(!G.ITEMS.some(i => Math.hypot(i.x - x, i.y - y) < 1.5 && i.kind !== 'fuel'), 'the body is no pickup');
  for (let i = 0; i < 12; i++) G.dk.bodies.push({ x, y, face: 0, t: 1 });
  G.hurtPirate(G.dk.pirates[0], 99);
  check(G.dk.bodies.length <= 12, `bodies are capped (${G.dk.bodies.length})`);
}
// --- Dr. Varga makes it aboard: you stop right inside our airlock, she still comes all the way in
for (const side of ['port', 'star']) {
  const G = fresh(); G.dockShip('pirate', side, { npc: true }); G.dk.pirates.length = 0;
  const g = G.dockGeom(side), me = G.me, N = G.dk.npc, h = g.hatch;
  me.x = N.x + (side === 'port' ? 0.8 : -0.8); me.y = g.y + 1.2;
  holdOn(G, N.x, N.y, () => N.state !== 'down');
  check(N.state === 'follow', `${side}: treated, she sets off`);
  via(G, [[me.x, g.y], doorC(g.doors[0]), [g.entry.x, g.y], [h.inside[0], h.inside[1]]], 20);
  tickN(G, 60 * 12);
  check(N.state === 'safe' && G.roomAt(N.x, N.y) && Math.abs(N.x - h.x) > 1, `${side}: she walks through the tube and into our airlock room on her own (at ${N.x.toFixed(1)}, ${N.y.toFixed(1)})`);
  G.undock();
  check(G.dk.npc && G.dk.npc.state === 'safe', `${side}: she stays aboard when their ship casts off`);
}
{
  const G = fresh(); G.dockShip('derelict', 'port', { npc: true }); G.boarding.invaders.length = 0; G.dk.dock.doors = [false, false]; G.dk.dock.fires = [];
  const N = G.dk.npc, me = G.me;
  me.x = N.x + 0.8; me.y = N.y;
  holdOn(G, N.x, N.y, () => N.state !== 'down');
  me.mode = 'eva'; me.x = -3; me.y = 10;                              // the leader is gone (spacewalk): she doesn't just stand there
  let t = 0; while (N.state !== 'safe' && t < 30) { G.simTick(DT); t += DT; }
  check(N.state === 'safe', `with nobody to follow, she makes her own way aboard (${t.toFixed(1)} s)`);
}
// --- no jumping while a ship is docked; docked ships let go once the jump is due
{
  const G = fresh(); G.mission.active = true; G.mission.events.forEach(e => { e.done = true; }); G.mission.rules = {};
  G.dockShip('derelict', 'port', { alien: false }); G.dk.dock.fires = [];
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1;
  tickN(G, 60);
  check(!G.mission.over && /^Jump blocked: the derelict/.test(G.combat.banner?.text || ''), `the jump waits while the derelict is tethered ("${G.combat.banner?.text}")`);
  tickN(G, 60 * 9);
  check(!G.dk.dock && G.mission.over?.survived, 'its tether is released, then the ship jumps');
}
{
  const G = fresh(); G.mission.active = true; G.mission.events.forEach(e => { e.done = true; }); G.mission.rules = {};
  G.dockShip('pirate', 'port'); for (const p of [...G.dk.pirates]) G.hurtPirate(p, 99);
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1;
  tickN(G, 60);
  check(!G.mission.over && G.dk.dock && /pirate ship/.test(G.combat.banner?.text || ''), 'the jump waits while the (empty) pirate ship is docked');
  tickN(G, 60 * 6);
  check(!G.dk.dock && G.mission.over?.survived, 'with nobody left to fly it, it lets go and we jump');
}

// --- chapter 5: the pirate base (js/dock.js "The pirate base")
const baseFresh = (side = 'port', n = 1, easy = 0) => {
  const G = fresh(); while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  G.mission.easy = easy; G.dockShip('base', side); G.combat.enemies.length = 0; return G;
};
{
  const G = loadGame(NAMES);
  G.startMission('c5'); const ev = [...G.mission.events].sort((a, b) => a.t - b.t);
  check(ev.map(e => e.kind).join() === 'interceptor,brig' && ev[0].opener && Math.abs(ev[0].t - 25) < 1e-6 && Math.abs(ev[1].t - 60) < 1e-6 && G.mission.jumpAt === 300,
        `c5: a patrol interceptor (the opener) at 25 s, the pirate base at 60 s, the jump due at 300 s (${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', ')}, jump ${G.mission.jumpAt})`);
  let ok = true;
  for (const easy of [1, 2]) { G.startMission('c5', { easy }); ok = ok && G.mission.events.length === 2 && G.mission.extraLuck === easy / 2; }
  check(ok, 'c5 on easy / very easy: both events stay (nothing optional to drop) → luck instead, and fewer guards (below)');
  const g = G.baseGuards;
  check(g(1).join() === '0,2,2,1' && g(1, 1).join() === '0,2,1,1' && g(1, 2).join() === '0,1,1,1' && g(3).join() === '0,3,3,1' && g(8).join() === '0,3,4,2',
        `guards per room grow with the crew and shrink with the difficulty (solo ${g(1)}, easy ${g(1, 1)}, very easy ${g(1, 2)}, 3 players ${g(3)}, 8 players ${g(8)})`);
}
{
  const G = loadGame(NAMES); G.startMission('c5');
  const ev = G.mission.events.find(e => e.kind === 'brig');
  G.combat.enemies.length = 0; G.combatSpawn('interceptor', 'port'); G.mission.t = ev.t - 0.01; G.simTick(DT);
  for (let i = 0; i < 60 * 3; i++) { G.combat.shots.length = 0; G.simTick(DT); }
  check(!G.dk.dock && !ev.done, 'the base waits while their patrol is still around');
  G.combat.enemies.length = 0; for (let i = 0; i < 60 * 3; i++) G.simTick(DT);
  check(G.dk.dock?.kind === 'base' && G.dk.npc?.state === 'down', 'once it\'s gone, we dock to the base (Dr. Varga is in there, hurt)');
}
for (const side of ['port', 'star']) {
  const G = baseFresh(side), g = G.baseGeom(side), d = G.dk.dock, me = G.me;
  const hunters = G.dk.pirates.filter(p => p.mode === 'hunt'), guards = G.dk.pirates.filter(p => p.mode === 'guard');
  check(hunters.length === 2 && hunters.every(p => p.drops === 'laser') && guards.length === 5 && G.ITEMS.some(i => i.kind === 'repair' && G.inBase(i.x, i.y)),
        `${side}: two pirates rush out of the bay, five guards hold the rooms, a repair kit lies in the bay`);
  check(guards.every(p => G.canStand(p.x, p.y, G.walkRects())) && G.canStand(G.dk.npc.x, G.dk.npc.y, G.walkRects()) && G.canStand(g.terminal.x + (side === 'port' ? 0.6 : -0.6), g.terminal.y + 0.6, G.walkRects()),
        `${side}: guards, Dr. Varga and the terminal's spot are all on the floor`);
  check(!d.doors[0] && d.doors[1] && d.doors[2] && !G.walkRects().includes(g.doors[1]) && !G.walkRects().includes(g.doors[2]), `${side}: the barracks and the brig doors start locked (no walking through)`);
  // every room reachable along the chain once the doors are open (Dr. Varga walks it home on her own)
  d.doors = [false, false, false]; G.dk.pirates.length = 0;
  const N = G.dk.npc; N.state = 'follow';
  let t = 0; while (N.state !== 'safe' && t < 40) { G.simTick(DT); t += DT; }
  check(N.state === 'safe' && G.roomAt(N.x, N.y), `${side}: treated, she walks from the brig through all four rooms and the tube into our airlock room (${t.toFixed(1)} s)`);
}
{
  const G = baseFresh(), g = G.baseGeom('port'), me = G.me, p = G.dk.pirates.find(p => p.mode === 'hunt');
  G.hurtPirate(p, 99); G.simTick(DT);
  check(G.ITEMS.some(i => i.kind === 'laser' && Math.hypot(i.x - p.x, i.y - p.y) < 1.5), 'a pirate from the bay drops his carbine (a laser gun to pick up) where he falls');
  check(G.dk.bodies.length === 1, '...and still leaves his body lying there');
  const wall = { x: g.rooms[1].x - 0.3, y: g.y }, room = { x: g.rooms[1].x + 1, y: g.y };
  check(!G.freeAt(wall.x, wall.y) && G.freeAt(room.x, room.y), 'shots stop at the base\'s walls');
}
{
  // the server room: repair the broken terminal, then hack it → the barracks door opens
  const G = baseFresh(), g = G.baseGeom('port'), d = G.dk.dock, me = G.me; G.dk.pirates.length = 0;
  me.x = g.terminal.x + 0.6; me.y = g.terminal.y + 0.7;
  const m = me.input.mouse; m.wx = g.terminal.x; m.wy = g.terminal.y; G.simTick(DT);
  check(/repair kit/.test(me.hover?.text || '') && !me.hover?.ok, `the broken terminal needs the repair kit ("${me.hover?.text}")`);
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  holdOn(G, g.terminal.x, g.terminal.y, () => d.terminal === 'fixed');
  check(d.terminal === 'fixed' && d.doors[1], 'repaired: still locked');
  holdOn(G, g.terminal.x, g.terminal.y, () => d.terminal === 'hacked');
  check(d.terminal === 'hacked' && !d.doors[1], 'hacked: the barracks door slides open');
  // the brig door: its keypad wants the code from the barracks wall
  const q = g.doors[2]; me.x = q.x + q.w + 0.8; me.y = q.y + q.h / 2; G.simTick(DT);
  check(/door code/.test(me.prompt?.text || ''), `at the brig door: "${me.prompt?.text}"`);
  G.withCrew(me, () => G.openBasePad());
  const type = (code) => { G.withCrew(me, () => { for (const ch of code) G.miniCommand('pin', 'key', +ch); G.miniCommand('pin', 'ok'); }); for (let i = 0; i < 60; i++) G.simTick(DT); };
  type(d.code === '1234' ? '4321' : '1234');
  check(d.doors[2] && me.ui.panel === 'mini', 'a wrong code: ACCESS DENIED, still locked');
  type(d.code);
  check(!d.doors[2] && !me.ui.panel, `the right code (${d.code}): the brig door opens`);
}
{
  // the engine is off while docked; detach (once she's aboard) → free; someone left over there → off again
  const G = baseFresh('port', 2), g = G.baseGeom('port'), d = G.dk.dock, me = G.me, other = G.crew.find(c => c !== me);
  G.dk.pirates.length = 0; G.mission.active = true; G.mission.rules = {}; G.mission.events.forEach(e => { e.done = true; });
  me.x = 3; me.y = 19.5; other.x = 3; other.y = 18.5;
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 60);
  check(!G.mission.over && /engine is off/.test(G.combat.banner?.text || ''), `jump due while docked: blocked ("${G.combat.banner?.text}")`);
  G.mission.jump = null; G.mission.t = 10; G.mission.jumpAt = 300;
  me.x = g.hatch.inside[0]; me.y = g.hatch.inside[1]; G.simTick(DT);
  check(!/detach/.test(me.prompt?.text || ''), 'no detach before Dr. Varga is aboard');
  const N = G.dk.npc; Object.assign(N, { x: 3, y: 20, state: 'safe' });
  G.simTick(DT);
  check(/detach/.test(me.prompt?.text || ''), `with her aboard, our airlock offers to detach ("${me.prompt?.text}")`);
  other.x = g.rooms[1].x + 2; other.y = g.y;                            // somebody is still over there
  G.withCrew(me, () => G.baseDetach());
  check(d.tube === 'detached' && !G.walkRects().includes(g.tube) && G.HATCHES[0].open === 1, 'detached: the tube pulls in, no walking across');
  G.simTick(DT);
  check(G.HATCHES[0].open === 0, 'our airlock door closes');
  G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 60);
  check(!G.mission.over && new RegExp(`${other.name} still in the pirate base`).test(G.combat.banner?.text || ''), `jump due, ${other.name} left behind: blocked ("${G.combat.banner?.text}")`);
  other.x = g.console.x; other.y = g.console.y + 0.6; G.simTick(DT);
  check(/dock again/.test(other.prompt?.text || ''), `stranded, ${other.name} can call our ship back from the bay ("${other.prompt?.text}")`);
  G.withCrew(other, () => G.baseRedock());
  check(d.tube === 'docked' && G.walkRects().includes(g.tube), 'docked again: the tube is back');
  other.x = 3; other.y = 18.5; G.withCrew(me, () => G.baseDetach());
  tickN(G, 60);
  check(G.mission.over?.won, `everybody aboard, detached: we jump with her (${G.mission.over?.reason})`);
}
{
  const G = baseFresh(), d = G.dk.dock; G.dk.pirates.length = 0; G.mission.active = true; G.mission.events.forEach(e => { e.done = true; }); G.mission.t = 100; G.mission.jumpAt = 300;
  Object.assign(G.dk.npc, { x: 3, y: 20, state: 'safe' }); G.me.x = 3; G.me.y = 19; G.withCrew(G.me, () => G.baseDetach()); G.simTick(DT);
  check(Math.abs(G.mission.jumpAt - 115) < 0.1, `clear of the base with her aboard: the jump drive spools up right away (jump at ${G.mission.jumpAt.toFixed(0)} s)`);
}
{
  // a stray shot downs her on the way; the snapshot carries the base's state (multiplayer)
  const G = baseFresh(), N = G.dk.npc; G.dk.dock.doors = [false, false, false]; N.state = 'follow';
  G.boarding.bolts.push({ x: N.x + 0.1, y: N.y, vx: 0, vy: 0, life: 1, owner: 'pirate' }); G.simTick(DT);
  check(N.state === 'down', 'shot on her way out, she goes down again (treat her again)');
  G.dk.dock.terminal = 'fixed'; G.dk.dock.tube = 'detached';
  const C = loadGame(NAMES); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(C.dk.dock.kind === 'base' && C.dk.dock.tube === 'detached' && C.dk.dock.terminal === 'fixed' && C.dk.dock.code === G.dk.dock.code && C.dk.pirates.length === G.dk.pirates.length,
        'the snapshot carries the base (tube, terminal, door code, guards) to every browser');
}
// --- every mission: the ship jumping with nobody aboard is a failure
{
  const G = fresh(); G.mission.active = true; G.mission.events.forEach(e => { e.done = true; }); G.mission.rules = {};
  const me = G.me; me.mode = 'eva'; me.x = -3; me.y = 10; me.vx = me.vy = 0;
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 30);
  check(G.mission.over && !G.mission.over.won && /nobody aboard/.test(G.mission.over.reason) && !G.mission.over.results.jumped, `nobody aboard at the jump (all on a spacewalk): failed, no pay ("${G.mission.over?.reason}")`);
  const H = fresh(); H.mission.active = true; H.mission.events.forEach(e => { e.done = true; }); H.mission.rules = {};
  const gun = H.me; gun.mode = 'gun'; gun.gun = { id: 'port', name: 'Left cannon', view: [0, 0, 10], hatch: [3, 8] };
  H.CAPACITORS[1].charge = 2; H.mission.t = H.mission.jumpAt + 0.1; tickN(H, 5);
  check(H.mission.over?.won, 'sitting in a cannon counts as aboard');
}
process.exitCode = failed ? 1 : 0;
