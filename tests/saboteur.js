// Saboteur: cloaks after the outer airlock, pops up in one of the two rooms next to it, wrecks a part
// (slowly solo, quickly with a crew), is weak in a fight, and security locks decide where it can go.
// The timers are checked against real walking times (tools/travel.js). Run: node tests/saboteur.js
const { loadGame } = require('./harness');
const { travel } = require('../tools/travel');
const NAMES = ['tick', 'player', 'crew', 'makeCrew', 'boarding', 'spawnSaboteur', 'hurtInvader', 'SYSTEMS', 'ROOMS', 'roomAt', 'adjacentRooms',
  'HATCHES', 'DOORWAYS', 'DECK_LOCKS', 'SAB_FADE', 'SAB_WORK_SOLO', 'SAB_WORK_TEAM', 'SAB_SHOT_SPEED', 'SAB_AIM', 'SAB_HP', 'WALK_SPEED', 'combat'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const away = (c) => { c.mode = 'eva'; c.x = -3; c.y = 12; };                 // on a spacewalk: nobody to catch it
const room = (G, a) => G.ROOMS.find(r => r.id === a.room);
// Spawn one and run until it decloaks (or `limit` s); returns it.
function untilPopUp(G, side, limit = 20) {
  G.spawnSaboteur(side); const a = G.boarding.invaders[G.boarding.invaders.length - 1];
  for (let t = 0; t < limit && a.state !== 'decloak'; t += DT) G.tick(DT);
  return a;
}

// where it turns up: always one of the two rooms next to its airlock, and both happen
for (const side of ['port', 'star']) {
  const seen = new Map(); let bad = 0, cloaked = true;
  for (let k = 0; k < 24; k++) {
    const G = loadGame(NAMES); away(G.player);
    G.spawnSaboteur(side); const a = G.boarding.invaders[0];
    const lockRoom = G.roomAt(...G.HATCHES.find(h => h.side === side).inside), next = G.adjacentRooms(lockRoom).map(r => r.id);
    for (let t = 0; t < 20 && a.state !== 'decloak'; t += DT) { G.tick(DT); if (a.state === 'sneak' && a.mode !== 'cloaked') cloaked = false; }
    if (!next.includes(a.room)) bad++;
    seen.set(a.room, (seen.get(a.room) || 0) + 1);
  }
  check(bad === 0 && seen.size === 2, `${side}: it pops up in a room next to the airlock, either one (${[...seen].map(([r, n]) => `${r} ×${n}`).join(', ')})`);
  check(cloaked, `${side}: while it sneaks it is cloaked (not in the ship, nothing to see or hit)`);
}
// cloaked, our shots go right through where it was
{
  const G = loadGame(NAMES); away(G.player);
  G.spawnSaboteur('port'); const a = G.boarding.invaders[0];
  for (let t = 0; t < 10 && a.state !== 'sneak'; t += DT) G.tick(DT);
  G.boarding.bolts.push({ x: a.x - 2, y: a.y, vx: 26, vy: 0, life: 0.5, owner: 'crew' });
  for (let i = 0; i < 20; i++) G.tick(DT);
  check(a.state === 'sneak' && a.hp === G.SAB_HP, 'a shot through a sneaking saboteur does nothing');
}
// how long the work takes: solo long enough to run over, with a crew too quick unless you're there
for (const [n, want] of [[1, 'SAB_WORK_SOLO'], [2, 'SAB_WORK_TEAM'], [3, 'SAB_WORK_TEAM']]) {
  const G = loadGame(NAMES); away(G.player);
  for (let i = 1; i < n; i++) { const c = G.makeCrew('X' + i); away(c); G.crew.push(c); }
  const a = untilPopUp(G, 'port'), sys = a.task.sys;
  let t = 0; for (; t < 30 && !sys.broken; t += DT) G.tick(DT);
  check(sys.broken && Math.abs(t - G.SAB_FADE - G[want]) < 0.1, `${n} player${n > 1 ? 's' : ''}: it decloaks, then wrecks the ${sys.name.toLowerCase()} after ${t.toFixed(1)} s (${G.SAB_FADE} + ${G[want]} s)`);
  // ...then cloaks again and turns up in a room next to the one it was in
  const was = room(G, a);
  for (let s = 0; s < 20 && a.state !== 'decloak'; s += DT) G.tick(DT);
  if (n === 1) check(G.adjacentRooms(was).includes(room(G, a)), `afterwards it cloaks and pops up next door (${was.id} → ${a.room})`);
}
// the timers against real walking times between rooms (tools/travel.js)
{
  const G = loadGame(NAMES);
  let worstPair = 0, quickest = Infinity;
  for (const h of G.HATCHES) {
    const [r1, r2] = G.adjacentRooms(G.roomAt(...h.inside));
    worstPair = Math.max(worstPair, travel(r1.id, r2.id).worst.at);
  }
  for (const r of G.ROOMS) for (const q of G.adjacentRooms(r)) quickest = Math.min(quickest, travel(r.id, q.id).best.at);
  check(G.SAB_FADE + G.SAB_WORK_SOLO >= worstPair + 2, `solo: decloak + work (${G.SAB_FADE + G.SAB_WORK_SOLO} s) beats running between the two rooms next to an airlock (${worstPair.toFixed(1)} s) with time to spare`);
  check(G.SAB_FADE + G.SAB_WORK_TEAM < quickest - 0.5, `with a crew: decloak + work (${G.SAB_FADE + G.SAB_WORK_TEAM} s) is shorter than any room-to-room trip (${quickest.toFixed(1)} s)`);
}
// caught at it: someone close by stops the work; it fights back weakly (slow, telegraphed shots)
{
  const G = loadGame(NAMES); away(G.player);
  const a = untilPopUp(G, 'port'), sys = a.task.sys;
  for (let i = 0; i < 60; i++) G.tick(DT);
  Object.assign(G.player, { mode: 'inside', x: a.x, y: a.y, health: 'ok' });
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]]) if (G.roomAt(a.x + dx, a.y + dy)) { G.player.x = a.x + dx; G.player.y = a.y + dy; break; }
  G.tick(DT);
  check(a.state === 'fight' && !a.task, 'when you come close it stops working and turns on you');
  const px = G.player.x, py = G.player.y, shots = [], aims = [];
  let t = 0;
  for (; t < 20; t += DT) {
    G.tick(DT); G.player.x = px; G.player.y = py; G.player.health = 'ok';
    if (a.act?.kind === 'aim' && (!aims.length || t - aims[aims.length - 1] > 1.5)) aims.push(t);
    for (const b of G.boarding.bolts) if (b.owner === 'saboteur' && !b.seen) { b.seen = true; shots.push({ t, v: Math.hypot(b.vx, b.vy) }); }
  }
  const gaps = shots.slice(1).map((s, i) => s.t - shots[i].t);
  check(shots.length >= 2 && gaps.every(g => g >= 3.4) && !sys.broken, `it shoots now and then (${shots.length} shots in 20 s, ≥ ${Math.min(...gaps).toFixed(1)} s apart) and the part stays intact`);
  check(shots.every(s => s.v <= G.WALK_SPEED * 1.2) && aims.length >= shots.length && Math.abs(shots[0].t - aims[0] - G.SAB_AIM) < 0.05, `each shot is aimed for ${G.SAB_AIM} s first and flies at ${shots[0]?.v.toFixed(1)} u/s (you walk ${G.WALK_SPEED}): easy to sidestep`);
  // standing still you get hit; stepping aside you don't
  const hits0 = G.combat.hits.crew;
  a.shotT = 0; a.act = null; G.player.health = 'ok'; G.boarding.bolts.length = 0;
  for (let i = 0; i < 60 * 4; i++) { G.tick(DT); G.player.x = px; G.player.y = py; }
  const stillHit = G.combat.hits.crew > hits0;
  G.player.health = 'ok'; G.player.x = px; G.player.y = py; G.boarding.bolts.length = 0;
  const hits1 = G.combat.hits.crew; a.shotT = 0; a.act = null; let fired = null;
  for (let i = 0; i < 60 * 4; i++) {
    G.tick(DT);
    if (fired === null && G.boarding.bolts.some(b => b.owner === 'saboteur')) fired = i;
    const k = fired === null ? 0 : Math.min(1, (i - fired) / 30);       // after the shot leaves: half a second's walk sideways
    const ang = Math.atan2(py - a.y, px - a.x) + Math.PI / 2, x = px + Math.cos(ang) * 1.6 * k, y = py + Math.sin(ang) * 1.6 * k;
    if (G.roomAt(x, y)) { G.player.x = x; G.player.y = y; }
  }
  check(stillHit && G.combat.hits.crew === hits1, 'standing still its shot hits you; a half-second step aside once it fires and it misses');
}
// weak: three laser hits; on its last legs it tries to cloak away
{
  const G = loadGame(NAMES); away(G.player);
  const a = untilPopUp(G, 'star');
  G.hurtInvader(a, 1);
  check(a.state === 'fight' && a.hp === 2, 'a hit interrupts it (fighting, 2/3 hp)');
  G.hurtInvader(a, 1);
  check(a.state === 'cloak', 'down to its last hit point, it cloaks to slip away');
  G.hurtInvader(a, 1);
  check(a.dead && G.combat.decals.some(d => d.body === 'saboteur'), 'caught while cloaking, the third hit kills it (it leaves a body)');
}
// security decides where it can go
{
  let ok = 0;
  for (let k = 0; k < 12; k++) {
    const G = loadGame(NAMES); away(G.player);
    G.DOORWAYS[2].locked = true;                                         // left airlock room ↔ reactor
    if (untilPopUp(G, 'port').room === 'portGun') ok++;
  }
  check(ok === 12, `with the door to the reactor locked it always turns up in the left cannon room (${ok}/12)`);
  ok = 0;
  for (let k = 0; k < 6; k++) {
    const G = loadGame(NAMES); away(G.player);
    G.DOORWAYS[2].locked = true; G.DECK_LOCKS[0].locked = true;           // both ways out of the left airlock room
    if (untilPopUp(G, 'port').room === 'portLock') ok++;
  }
  check(ok === 6, `with both ways locked it is stuck in the left airlock room and sabotages there (${ok}/6)`);
  ok = 0;
  for (let k = 0; k < 8; k++) {                                          // locked while it sneaks over
    const G = loadGame(NAMES); away(G.player);
    G.spawnSaboteur('port'); const a = G.boarding.invaders[0];
    for (let t = 0; t < 10 && a.state !== 'sneak'; t += DT) G.tick(DT);
    G.DOORWAYS[2].locked = true; G.DECK_LOCKS[0].locked = true;
    for (let t = 0; t < 10 && a.state !== 'decloak'; t += DT) G.tick(DT);
    if (a.room === 'portLock' && a.task && G.SYSTEMS.includes(a.task.sys)) ok++;
  }
  check(ok === 8, `locked in while it sneaks over: it stays in the room it was in and works there (${ok}/8)`);
}
process.exitCode = failed ? 1 : 0;
