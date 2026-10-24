// Other ships: pirates (dock, steal, get boarded back, cast off), the derelict (jammed door, S-7 the growth,
// black box, engineer to rescue) and mining an asteroid. Run: node tests/dock.js
const { loadGame } = require('./harness');
const NAMES = ['grab', 'simTick', 'me', 'crew', 'dk', 'mission', 'startMission', 'combat', 'combatSpawn', 'dockShip', 'dockGeom', 'walkRects', 'canStand', 'ITEMS', 'power',
  'withCrew', 'inv', 'boarding', 'FUEL_CRATE', 'hz', 'objectiveStatus', 'MISSIONS', 'CAPACITORS', 'hurtCrew', 'evs', 'hurtPirate', 'undock', 'roomAt', 'inDock', 'HATCHES',
  'baseGeom', 'baseGuards', 'PIRATE_AIM', 'lineOfSight', 'GFX', 'segBody', 'sentryLive', 'SENTRY_SPOOL', 'SENTRY_BURST', 'SENTRY_COOL', 'separatePirates', 'pirateOk', 'baseDetach', 'baseRedock', 'openBasePad', 'miniCommand', 'freeAt', 'makeCrew', 'netSerialize', 'netApply', 'ui', 'inBase', 'COMBAT_KINDS', 'ENEMY_TYPES', 'inRect',
  's7Geom', 's7Holding', 's7Wrapped', 'attack', 'spray', 'useEnergy', 'S7_FREEZE', 'S7_DRAW', 'S7_RECOIL_SHOT', 'S7_RECOIL_SPRAY', 'S7_STRUGGLE_PRESSES', 'resetDock', 'SIDE_CAP',
  'NAVCORE_LIFE', 'NAVCORE_PULL', 'NAVCORE_INSTALL', 'HELM', 'clickTarget', 'flingNavcore', 'ROCK_REACH', 'ROCK_Y', 'EVENT_RUNNERS', 'evaOk', 'evaReach', 'REACH', 'rockReachLeft'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const inside = (o, q) => q.x >= o.x && q.y >= o.y && q.x + q.w <= o.x + o.w && q.y + q.h <= o.y + o.h;
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; G.combat.enemies.length = 0; return G; };
function holdOn(G, x, y, done, max = 20, btn = 'down') { const m = G.me.input.mouse; m.wx = x; m.wy = y; m[btn] = true; let t = 0; while (!done() && t < max) { G.simTick(DT); t += DT; } m[btn] = false; return t; }
const kitOn = (G, x, y, done, max = 20) => holdOn(G, x, y, done, max, 'right');   // the repair kit's jobs: hold right click (2026-10-20)
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
  check(sawLaser && shotAt > 1.6 && shotAt < 1.9 && shotSpeed >= 25, `a pirate stops and aims (laser sight) for 1.7 s, then fires a very fast shot (after ${shotAt?.toFixed(2)} s, ${shotSpeed.toFixed(0)} units/s)`);
  for (let i = 0; i < 20; i++) G.simTick(DT);
  check(me.health === 'hurt', 'standing in the laser line gets you hit');
  let again = false; for (let i = 0; i < 60 * 4.5; i++) { G.simTick(DT); if (p.aim > 0) again = true; me.health = 'ok'; }
  check(!again, 'then a long cooldown before it aims again (your window to hit back)');
}
// no lock-on: the sight follows you right up to the shot; only getting out of its sight dodges it
for (const hide of [false, true]) {
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.splice(1);
  const p = G.dk.pirates[0], me = G.me; p.x = 6; p.y = 19.5; p.cd = 0; me.x = 10.5; me.y = 19.5;
  check(G.PIRATE_AIM === 1.7 && !/PIRATE_LOCK|locked = p\.aim/.test(require('fs').readFileSync(require('path').join(__dirname, '../js/dock.js'), 'utf8')), 'there is no lock-on phase (PIRATE_LOCK and the locked sight are gone)');
  let spot = null;                                                         // somewhere 2-6 units off, in (or out of) its sight
  for (let r = 2; r < 9 && !spot; r += 0.5) for (let a = 0; a < 32 && !spot; a++) {
    const x = me.x + Math.cos(a / 32 * 6.283) * r, y = me.y + Math.sin(a / 32 * 6.283) * r;
    if (G.canStand(x, y, G.walkRects()) && G.lineOfSight(p.x, p.y, x, y) !== hide && Math.hypot(x - p.x, y - p.y) < 8.5) spot = { x, y };
  }
  for (let i = 0; i < 60 * 1.6; i++) G.simTick(DT);                       // the sight is on where you stand…
  me.x = spot.x; me.y = spot.y;                                            // …0.1 s before the shot, move
  for (let i = 0; i < 60; i++) G.simTick(DT);
  check(hide ? me.health === 'ok' : me.health === 'hurt', hide ? 'getting out of its sight just before the shot dodges it' : 'stepping aside within its sight doesn\'t: the sight tracks you until the shot');
}
{
  const G = fresh(); G.ITEMS.length = 0; G.power.reserve = 0; G.dockShip('pirate', 'port');
  G.me.x = 37; G.me.y = 6;
  let left = null; for (let t = 0; t < 40 && left === null; t += DT) { G.simTick(DT); if (!G.dk.dock) left = t; }
  check(left !== null, `with nothing (left) to loot, the pirates head home and cast off (after ${left?.toFixed(0)} s)`);
}
{
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.length = 0;
  const g = G.dockGeom('port'), me = G.me; me.x = 5; me.y = g.y;
  check(walkTo(G, g.crate.x + 1, g.crate.y + 1.2), 'you can walk through the tube onto their ship');
  const m = me.input.mouse; m.wx = g.crate.x; m.wy = g.crate.y; m.click = true; G.simTick(DT);
  check(me.inv.item === 'fuel', 'their loot crate has fuel cells for the taking');
  via(G, [[g.crate.x + 1, g.y], doorC(g.doors[1]), [g.core.x + 1.4, g.core.y]]);
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  kitOn(G, g.core.x, g.core.y, () => G.dk.dock?.overloaded);
  check(G.dk.dock?.overloaded, 'jamming their reactor\'s overload with the repair kit makes them panic');
  tickN(G, 60 * 16);
  check(!G.dk.dock && me.mode === 'eva', 'they cast off 15 s later — and whoever is still aboard is left floating outside');
  check(G.dk.ships === 1, 'their jammed reactor blows the raider apart as it pulls away: a pirate ship destroyed');
  G.dk.defeated = 0; G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }, { hit: true }] });
  check(G.dk.ships === 2 && G.dk.defeated === 1, 'a raider shot to scrap counts as a ship destroyed (and a pirate defeated)');
  G.mission.objective = G.MISSIONS.c1.objective;
  check(G.MISSIONS.c1.objective.kind === 'raiders' && G.MISSIONS.c4.objective.kind === 'navcore' && G.objectiveStatus().done, 'First Contract: destroy two pirate ships, done (Red Comet Cove wants a nav core now)');
}
// --- derelict
{
  const G = fresh(); G.dockShip('derelict', 'star', { blackbox: true, npc: true });
  const s7 = G.dk.dock.s7, tick0 = G.simTick;                // (S-7 itself: tested below; here the freezer keeps every room frozen)
  Object.assign(s7, { j1: true, freezer: true, cold: [1, 1, 1] });
  Object.defineProperty(G, 'simTick', { value: (dt) => { G.CAPACITORS[2].charge = 3; tick0(dt); }, configurable: true });
  const g = G.dockGeom('star'), me = G.me; me.x = 41; me.y = g.y;
  const doorX = g.doors[0].x + g.doors[0].w / 2;
  walkTo(G, doorX - 0.9, g.y, 15);
  check(me.x < doorX && /jammed/.test(me.prompt?.text || ''), `a jammed door blocks the way ("${me.prompt?.text}")`);
  G.dk.dock.doors[0] = false;                             // (forced open with the manual override)
  check(!G.boarding.invaders.length && !!G.dk.dock.s7, 'no intruder sleeps on the derelict any more: S-7 grows there instead');
  via(G, [doorC(g.doors[0]), [g.npcSpot.x - 0.8, g.y], [g.npcSpot.x - 0.8, g.npcSpot.y]], 15);
  holdOn(G, G.dk.npc.x, G.dk.npc.y, () => G.dk.npc.state !== 'down');
  check(G.dk.npc.state === 'follow', 'treating the engineer: they set off for our ship');
  const box = G.ITEMS.find(i => i.kind === 'blackbox');
  via(G, [[box.x - 0.5 > g.doors[1].x ? g.doors[1].x - 1 : box.x, g.y], doorC(g.doors[1]), [box.x - 0.6, g.y], [box.x - 0.6, box.y]], 15);
  check(s7.heartOpen && !G.crew.some(c => G.s7Holding(c)), `with the lab frozen, the husks let you through and the heart has let go of the box (${s7.heartOpen}, ${me.health}, ${G.combat.banner?.text})`);
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
// --- S-7, the derelict's growth (js/culture.js)
const s7Fresh = (side = 'port', contents = { blackbox: true }) => {
  const G = fresh(); G.dockShip('derelict', side, contents); G.dk.dock.fires = []; G.dk.dock.doors = [false, false];
  return { G, s: G.dk.dock.s7, S: G.s7Geom(side), g: G.dockGeom(side) };
};
const tendrilBy = (G, s, S, i, dx = 0.6) => { const h = S.tendrils[i].head; G.me.x = h.x + dx; G.me.y = h.y; G.me.vx = G.me.vy = 0; };   // stand right by tendril i's head
{
  const { G, s, S } = s7Fresh();
  check(!G.boarding.invaders.length, 'no intruder spawns on the derelict any more');
  check(G.ITEMS.some(it => it.kind === 'extinguisher' && G.inDock(it.x, it.y)), 'Varga\'s own fire extinguisher hangs in the lab\'s airlock');
  const me = G.me; tendrilBy(G, s, S, 0);
  tickN(G, 18);
  check(s.tendrils[0].state === 'twitch' && !G.s7Holding(me), 'come close to a tendril: it twitches first (the telegraph)');
  tickN(G, 60);
  check(G.s7Holding(me) && s.tendrils[0].state === 'grab', 'then it grabs');
  const x0 = me.x; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  check(Math.abs(me.x - x0) < 1e-6, 'held: you can\'t walk');
  tickN(G, 60 * 3);
  check(me.health === 'hurt', 'and it squeezes (a hurt every few seconds)');
  // a laser shot (yourself, while held: solo works) frees you, the tendril recoils ~4 s
  const root = S.tendrils[0].root;
  G.withCrew(me, () => { G.inv.weapon = 'laser'; G.inv.cd = 0; G.attack(Math.atan2(root.y - me.y, root.x - me.x), false, [root.x, root.y]); });
  tickN(G, 6);
  check(!G.s7Holding(me) && s.tendrils[0].state === 'recoil', 'shooting the tendril that holds you frees you (solo self-free)');
  tickN(G, 60 * 3);
  check(s.tendrils[0].state === 'recoil' && !G.s7Holding(me), `a shot tendril stays recoiled for a while (and recoiled tendrils don't grab) (${s.tendrils[0].t.toFixed(1)} s left)`);
  tickN(G, 60 * 2);
  check(s.tendrils[0].state !== 'recoil', `after ~${G.S7_RECOIL_SHOT} s it comes back`);
}
{
  const { G, s, S } = s7Fresh(), me = G.me;
  tendrilBy(G, s, S, 0); tickN(G, 60 * 2);
  check(G.s7Holding(me), '(grabbed again)');
  const root = S.tendrils[0].root;
  G.withCrew(me, () => { G.inv.weapon = 'extinguisher'; });
  for (let i = 0; i < 30; i++) { G.withCrew(me, () => G.spray(root.x, root.y, DT)); G.simTick(DT); }
  check(!G.s7Holding(me) && s.tendrils[0].state === 'recoil' && s.tendrils[0].t > 12, `the extinguisher (cold CO2) frees you too, and the tendril shrinks back much longer (${s.tendrils[0].t.toFixed(1)} s)`);
}
{
  const { G, s, S } = s7Fresh(), me = G.me;
  tendrilBy(G, s, S, 0); tickN(G, 60 * 2);
  let n = 0; while (G.s7Holding(me) && n < 60) { me.input.pressed.add(n % 2 ? 'KeyA' : 'KeyD'); G.simTick(DT); G.simTick(DT); n++; }
  check(!G.s7Holding(me) && n >= G.S7_STRUGGLE_PRESSES - 2 && n <= G.S7_STRUGGLE_PRESSES + 4, `empty-handed: mashing the keys wriggles you free (${n} presses)`);
}
{
  const { G, s, S } = s7Fresh(), me = G.me;          // two crew: one is held, the other shoots the tendril
  const B = G.makeCrew('B'); G.crew.push(B);
  tendrilBy(G, s, S, 0); B.x = S.tendrils[0].head.x + 4; B.y = S.tendrils[0].head.y; tickN(G, 60 * 2);
  const root = S.tendrils[0].root, mid = { x: (root.x + me.x) / 2, y: (root.y + me.y) / 2 };
  G.withCrew(B, () => { G.inv.weapon = 'laser'; G.inv.cd = 0; G.attack(Math.atan2(mid.y - B.y, mid.x - B.x), false, [mid.x, mid.y]); });
  tickN(G, 12);
  check(!G.s7Holding(me), 'a crewmate\'s laser hit on the tendril frees you');
}
// J1, the freezer and our capacitor; the cold room by room; the heart lets go only when the core is frozen
{
  const { G, s, S, g } = s7Fresh(), me = G.me, cap = G.CAPACITORS[S.capIdx];
  check(S.capIdx === 0 && G.s7Geom('star').capIdx === 2, 'the freezer draws from our capacitor on the docked side (left / right)');
  for (const T of s.tendrils) { T.state = 'recoil'; T.t = 999; }   // (S-7's tendrils held off: this is about the machine)
  me.x = S.freezer.x; me.y = S.freezer.y + 1;
  holdOn(G, S.freezer.x, S.freezer.y, () => s.freezer, 3);
  check(!s.freezer && /J1/.test(G.withCrew(me, () => me.hover?.text) || me.prompt?.text || ''), `the freezer is dead until J1 is patched ("${me.hover?.text}")`);
  me.x = S.j1.x; me.y = S.j1.y + 0.8;
  const m = me.input.mouse; m.wx = S.j1.x; m.wy = S.j1.y; m.click = true; G.simTick(DT);
  check(me.ui.mini?.kind === 'j1', 'J1 opens a patch-board panel');
  G.withCrew(me, () => { G.miniCommand('j1', 'src'); G.miniCommand('j1', 'to', 0); });
  check(!s.j1, 'the wrong circuit (the lights) does nothing');
  G.withCrew(me, () => { G.miniCommand('j1', 'src'); G.miniCommand('j1', 'to', 2); });
  check(s.j1 && !me.ui.mini, 'patching our tether line into C3 (the cold store) connects the lab');
  G.power.reactor.fuel = 0; G.power.reserve = 0; cap.charge = 2;   // (no new energy: count what the freezer takes)
  me.x = S.freezer.x; me.y = S.freezer.y + 1;
  const t = holdOn(G, S.freezer.x, S.freezer.y, () => s.freezer, 4);
  check(s.freezer && t > 1.9 && cap.charge === 1, `hold click ~2 s: the freezer runs, drawing its first energy from our left capacitor (${t.toFixed(1)} s, ${cap.charge} left)`);
  const at = [null, null, null]; let open = null, boxEarly = null, why = '';
  const box = G.ITEMS.find(it => it.kind === 'blackbox');
  for (let k = 0; k < 60 * 45; k++) {
    if (k === 60 * 5) { me.x = box.x + 0.6; me.y = box.y; const mm = me.input.mouse; mm.wx = box.x; mm.wy = box.y; mm.click = true; }
    if (k === 60 * 5 + 1) { boxEarly = me.inv.item === 'blackbox'; why = me.hover?.text || ''; }
    cap.charge = Math.max(cap.charge, 1); G.simTick(DT);
    s.frozen.forEach((f, i) => { if (f && at[i] === null) at[i] = k / 60; });
    if (s.heartOpen && open === null) open = k / 60;
  }
  check(boxEarly === false && /heart is wrapped round it/.test(why), `before the core is frozen the black box can't be taken, and the prompt says why ("${why}")`);
  check(at[1] < at[0] && at[0] <= at[2] && Math.abs(at[1] - G.S7_FREEZE[1]) < 1 && Math.abs(at[2] - G.S7_FREEZE[2]) < 1,
        `the cold spreads: the lab freezes first, then the airlock, then the core (${at.map(v => v?.toFixed(0)).join(' / ')} s: airlock / lab / core)`);
  check(open !== null && Math.abs(open - at[2]) < 0.05, `the heart lets go of the black box when the core is frozen (${open?.toFixed(0)} s)`);
  me.x = box.x + 0.6; me.y = box.y; me.health = 'ok'; const mm = me.input.mouse; mm.wx = box.x; mm.wy = box.y; mm.click = true; G.simTick(DT);
  check(me.inv.item === 'blackbox', 'then the box can be taken');
  // husks don't grab: stand right by a lab tendril
  for (const T of s.tendrils) { T.state = 'idle'; T.t = 0; } tickN(G, 1);
  check(s.tendrils.every(T => T.state === 'husk'), 'in frozen rooms the tendrils are grey husks');
  tendrilBy(G, s, S, 1, 0.3); tickN(G, 120);
  check(!G.s7Holding(me), 'husks don\'t grab');
  // the capacitor runs dry: the freezer stops, the rooms thaw slowly
  cap.charge = 0; let stopAt = null;
  for (let k = 0; k < 60 * 70 && stopAt === null; k++) { G.simTick(DT); if (!s.freezer) stopAt = k / 60; }
  check(stopAt !== null && stopAt <= G.S7_DRAW[0] + 0.1 && /capacitor/.test(G.combat.banner?.text || ''), `our capacitor empty: the freezer stops (after ${stopAt?.toFixed(0)} s: "${G.combat.banner?.text}")`);
  // ...but the heart froze to death: S-7 died with it. The frost fades, the growth stays dead (2026-10-20 playtest)
  let stirred = false; me.x = 37; me.y = 6;
  for (let k = 0; k < 60 * 90; k++) { G.simTick(DT); if (/stirs again|warming up|closes round/.test(G.combat.banner?.text || '')) stirred = true; }
  check(s.cold.every(c => c === 0) && s.dead && s.heartOpen && s.frozen.every(f => f), `then the cold retreats (cold ${s.cold.join(' / ')}), but the dead heart stays open and every room stays husks`);
  for (const T of s.tendrils) { T.state = 'idle'; T.t = 0; } tickN(G, 1);
  check(!stirred && s.tendrils.every(T => T.state === 'husk') && s.creep.dead, `no "stirs again" for a dead culture: tendrils stay husks, the creep stays withered ("${G.combat.banner?.text}")`);
  tendrilBy(G, s, S, 4, 0.3); tickN(G, 120);
  check(!G.s7Holding(me), 'the dead core\'s tendrils don\'t grab, thawed or not');
  me.x = S.freezer.x; me.y = S.freezer.y + 1;
  const hov = G.withCrew(me, () => G.clickTarget(S.freezer.x, S.freezer.y));
  check(hov && !hov.ok && /dead/.test(hov.text), `the freezer isn't needed any more ("${hov?.text}")`);
}
{
  const { G, s, S } = s7Fresh(), me = G.me;          // a living culture (the core never froze) does thaw and stir again
  me.x = 37; me.y = 6; s.creep.d = 0;
  Object.assign(s, { j1: true, freezer: true, drawT: 99 }); s.cold = [1, 1, 0.5]; G.CAPACITORS[0].charge = 3; tickN(G, 2);
  s.freezer = false;
  let thaw = null, banner = '';
  for (let k = 0; k < 60 * 40 && thaw === null; k++) { G.simTick(DT); if (!s.frozen[1]) { thaw = k / 60; banner = G.combat.banner?.text || ''; } }
  check(!s.dead && thaw > 10 && thaw < 30 && /stirs again/.test(banner), `the core not frozen: the lab thaws and S-7 stirs again (${thaw?.toFixed(0)} s later: "${banner}")`);
}
{
  const { G, s, S } = s7Fresh(), me = G.me;          // a grab is released when the room freezes
  tendrilBy(G, s, S, 1); tickN(G, 120);
  const held = G.s7Holding(me);
  s.cold[1] = 0.999; s.freezer = true; s.j1 = true; G.CAPACITORS[0].charge = 3; tickN(G, 30);
  check(held && !G.s7Holding(me) && s.tendrils[1].state === 'husk', 'when its room freezes, a tendril lets go of whoever it holds');
}
// casting off the derelict once the black box is aboard (2026-10-20 playtest: no waiting for the jump)
{
  const { G, s, g } = s7Fresh(), me = G.me, d = G.dk.dock, B = G.makeCrew('B'); G.crew.push(B);
  G.mission.objective = { kind: 'blackbox' };
  for (const T of s.tendrils) { T.state = 'recoil'; T.t = 999; }
  B.x = g.rooms[1].x + 2; B.y = g.y;                              // somebody is still over there
  me.x = G.HATCHES[0].inside[0]; me.y = G.HATCHES[0].inside[1]; G.simTick(DT);
  check(!/cast off/.test(me.prompt?.text || ''), `the box still in the heart: no casting off ("${me.prompt?.text || ''}")`);
  const box = G.ITEMS.find(it => it.kind === 'blackbox');
  box.x = g.rooms[0].x + 1; box.y = g.y; G.simTick(DT);
  check(!/cast off/.test(me.prompt?.text || ''), 'the box free but still over there: no casting off yet');
  G.ITEMS.splice(G.ITEMS.indexOf(box), 1); G.withCrew(B, () => { G.inv.item = 'blackbox'; }); G.simTick(DT);
  check(!/cast off/.test(me.prompt?.text || ''), 'in a crewmate\'s hands over in the lab: not yet either');
  G.withCrew(B, () => { G.inv.item = null; }); G.ITEMS.push({ kind: 'blackbox', x: 4.5, y: 17.6 }); G.simTick(DT);
  check(G.objectiveStatus().done && /cast off the derelict/.test(me.prompt?.text || '') && /B is still over there/.test(me.prompt?.text || ''),
        `the box aboard: our airlock offers to cast off, and warns who is still over there ("${me.prompt?.text}")`);
  me.input.pressed.add('KeyE'); G.simTick(DT);
  check(d.detachT > 0 && G.dk.dock === d && /tether releases/.test(G.combat.banner?.text || ''), `casting off starts the tether's countdown ("${G.combat.banner?.text}")`);
  G.simTick(DT);
  check(/Tether releases in/.test(me.prompt?.text || ''), `the airlock shows the countdown ("${me.prompt?.text}")`);
  tickN(G, 60 * 9);
  check(!G.dk.dock && B.mode === 'eva' && G.ITEMS.some(it => it.kind === 'blackbox') && G.objectiveStatus().done,
        `the derelict drifts away: whoever stayed over there is cast adrift (B: ${B.mode}), the box stays aboard`);
}
// ... and by itself (2026-10-24 playtest: "detach the derelict lab sooner"): the box aboard, nobody over there for 5 s
{
  const { G, s, g } = s7Fresh(), me = G.me, d = G.dk.dock, B = G.makeCrew('B'); G.crew.push(B);
  Object.assign(G.mission, { active: true, objective: { kind: 'blackbox' }, jumpAt: 1e9 }); G.mission.events.forEach(e => { e.done = true; });
  for (const T of s.tendrils) { T.state = 'recoil'; T.t = 999; }
  me.x = 4.5; me.y = 18.5; B.x = g.rooms[1].x + 2; B.y = g.y;     // B still over there
  const box = G.ITEMS.find(it => it.kind === 'blackbox'); Object.assign(box, { x: 4.5, y: 17.6 });
  tickN(G, 60 * 10);
  check(d.detachT === null && G.dk.dock === d, 'the box aboard but a crewmate still over in the lab: the derelict stays tethered');
  B.x = 5.5; B.y = 17.6; tickN(G, 60 * 4);
  check(d.detachT === null, 'everyone back aboard: not at once (a few seconds\' grace)');
  tickN(G, 60 * 2);
  check(d.detachT > 0 && /casting off the derelict/.test(G.combat.banner?.text || ''), `then it casts off by itself ("${G.combat.banner?.text}")`);
  B.x = g.tube.x + g.tube.w / 2; B.y = g.tube.y + g.tube.h / 2; G.simTick(DT);
  check(d.detachT === null && /Tether held/.test(G.combat.banner?.text || ''), `someone steps back into the tube: the tether holds ("${G.combat.banner?.text}")`);
  B.x = 5.5; B.y = 17.6; tickN(G, 60 * 15);
  check(!G.dk.dock && B.mode === 'inside' && me.mode === 'inside' && G.objectiveStatus().done, 'back aboard: it casts off again and drifts away, nobody cast adrift, the box stays aboard');
}
{
  const { G, g } = s7Fresh('star', { npc: true }), me = G.me, h = G.HATCHES.find(h => h.side === 'star');   // the engineer's derelict: no box, no casting off
  G.mission.objective = { kind: 'rescue' };
  me.x = h.inside[0]; me.y = h.inside[1]; G.simTick(DT);
  check(!/cast off/.test(me.prompt?.text || '') && G.dk.dock.detachT === null, `a derelict without a black box (rescue) can't be cast off early ("${me.prompt?.text || ''}")`);
}
// the creep: toward our ship, wraps our capacitor (no charging, no using it); spray / shots push it back
{
  const { G, s, S } = s7Fresh(), me = G.me, cap = G.CAPACITORS[0];
  me.x = 37; me.y = 6;                               // (out of the way)
  let inRoom = null, wrapped = null;
  for (let k = 0; k < 60 * 200 && wrapped === null; k++) { G.simTick(DT); if (s.creep.inRoom && inRoom === null) inRoom = k / 60; if (s.creep.wrapped) wrapped = k / 60; }
  check(inRoom > 50 && inRoom < 100, `S-7 creeps along the tube and reaches our airlock room (${inRoom?.toFixed(0)} s solo)`);
  check(wrapped !== null && G.s7Wrapped(0) && /capacitor/.test(G.combat.banner?.text || ''), `then wraps our left capacitor (${wrapped?.toFixed(0)} s: "${G.combat.banner?.text}")`);
  cap.charge = 2;
  check(!G.useEnergy(0) && cap.charge === 2, 'a wrapped capacitor can\'t be used');
  G.power.lever.pos = 0; G.power.lever.jammed = true; G.power.reactor.t = 19.9; tickN(G, 60 * 3);
  check(cap.charge === 2, 'nor charged (the energy is wasted)');
  me.x = cap.x + 1.2; me.y = cap.y - 0.2; G.withCrew(me, () => { G.inv.weapon = 'extinguisher'; });
  let t = 0; while (s.creep.wrapped && t < 5) { G.withCrew(me, () => G.spray(cap.x, cap.y - 0.15, DT)); G.simTick(DT); t += DT; }
  check(!s.creep.wrapped && t > 1.8 && t < 2.3 && G.useEnergy(0), `spraying it for ~2 s clears the wrap (${t.toFixed(1)} s)`);
  const tipAt = (d) => { const P = S.creep; let rest = d; for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (rest <= l) return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * rest / l, y: P[i - 1].y + (P[i].y - P[i - 1].y) * rest / l }; rest -= l; } return P[P.length - 1]; };
  const d0 = s.creep.d, tip = tipAt(d0);
  const by = tipAt(d0 - 1.5); me.x = by.x; me.y = by.y + 0.8;                     // (beside the creep, a bit back from the tip)
  for (let i = 0; i < 60; i++) { const q = tipAt(s.creep.d); G.withCrew(me, () => G.spray(q.x, q.y, DT)); G.simTick(DT); }   // (following the tip)
  check(s.creep.d < d0 - 2, `spraying the creep pushes it back a good chunk (${d0.toFixed(1)} → ${s.creep.d.toFixed(1)} units in 1 s)`);
  const d1 = s.creep.d, tip1 = tipAt(d1);
  G.HATCHES.find(h => h.side === 'port').doors.inner = 1;   // (pushed back into the airlock's inner doorway: shots stop at a closed door, so open it)
  G.boarding.bolts.push({ x: tip1.x + 0.5, y: tip1.y - 1.5, z: 1, vx: -0.5 * 26 / 1.58, vy: 1.5 * 26 / 1.58, life: 0.5, owner: 'crew' }); tickN(G, 6);
  check(s.creep.d < d1 - 0.8 && s.creep.d > d1 - 1.3, `a shot pushes it back a bit (${d1.toFixed(1)} → ${s.creep.d.toFixed(1)})`);
  // three shots clear a wrap
  s.creep.d = 1e9; tickN(G, 2); check(s.creep.wrapped, '(wrapped again)');
  for (let i = 0; i < 3; i++) { G.boarding.bolts.push({ x: cap.x + 2, y: cap.y - 0.15, z: 1, vx: -26, vy: 0, life: 0.5, owner: 'crew' }); tickN(G, 10); }
  check(!s.creep.wrapped, 'three hits clear the wrap too');
  // casting off cuts it
  s.creep.d = 1e9; tickN(G, 2);
  G.undock();
  check(!G.dk.dock && !G.s7Wrapped(0) && G.useEnergy(0), 'when the derelict casts off the creep is cut and dies: our capacitor works again');
}
{
  const { G, s } = s7Fresh(), cap = G.CAPACITORS[0];  // the core freezes: the heart turns to a husk, the creep withers with it
  G.me.x = 37; G.me.y = 6; s.creep.d = 1e9; tickN(G, 2);
  const w = G.s7Wrapped(0);
  Object.assign(s, { j1: true, freezer: true, drawT: 99 }); s.cold = [1, 1, 0.999]; cap.charge = 3; tickN(G, 30);   // (drawT: its energy for now already drawn)
  check(w && s.creep.dead && !G.s7Wrapped(0), 'when the core freezes the creep withers and lets go of our capacitor');
}
// the snapshot carries S-7
{
  const { G, s, S } = s7Fresh(); tendrilBy(G, s, S, 0); tickN(G, 120); s.j1 = true; s.cold[1] = 0.4; s.creep.d = 3.3;
  const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  const H = loadGame(NAMES); H.startMission('intro'); H.netApply(snap, G.me.id);
  const t = H.dk.dock?.s7;
  check(t && t.j1 && t.cold[1] === 0.4 && t.creep.d === 3.3 && t.tendrils[0].state === 'grab' && H.s7Holding(H.crew.find(c => c.id === G.me.id)), 'the snapshot (netSerialize / netApply) carries S-7: tendrils, cold, J1, the creep');
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
// --- chapter 4 / Pirate cove: get a Red Comet nav core and install it in our helm (way 1: pull it from a docked raider's nav console)
// Installing: walk up to the helm with the core in hand and hold click NAVCORE_INSTALL s on it (carrying it aboard isn't enough).
function installAtHelm(G) {
  const me = G.me; me.mode = 'inside'; me.x = G.HELM.x; me.y = G.HELM.y + 1.5; me.vx = me.vy = 0;
  const tg = G.withCrew(me, () => G.clickTarget(G.HELM.x, G.HELM.y + 0.5));
  const t = holdOn(G, G.HELM.x, G.HELM.y + 0.5, () => G.dk.helmCore);
  return { tg, t };
}
const c4 = (id = 'c4') => { const G = fresh(); G.startMission(id); G.mission.active = false; G.combat.enemies.length = 0; return G; };
{
  const G = c4();
  check(G.MISSIONS.c4.objective.kind === 'navcore' && G.MISSIONS.pirates.objective.kind === 'navcore' && G.MISSIONS.c1.objective.kind === 'raiders', 'Red Comet Cove and Pirate cove want a nav core; First Contract still two raiders');
  check(!G.objectiveStatus().done && G.objectiveStatus().text === 'Get a Red Comet nav core and install it in our helm', `the objective: "${G.objectiveStatus().text}"`);
  G.dockShip('pirate', 'port'); G.dk.pirates.length = 0;
  const g = G.dockGeom('port'), me = G.me; me.x = 5; me.y = g.y;
  check(G.dk.dock.navcore, 'a docked raider\'s nav console still has its core');
  via(G, [[g.crate.x + 1, g.y], doorC(g.doors[1]), [g.nav.x + 0.6, g.nav.y + 0.9]]);
  const t = holdOn(G, g.nav.x, g.nav.y, () => me.inv.item === 'navcore');
  check(me.inv.item === 'navcore' && !G.dk.dock.navcore && Math.abs(t - G.NAVCORE_PULL) < 0.3, `holding click on the nav console pulls the nav core out (${t.toFixed(1)} s)`);
  check(!G.objectiveStatus().done, 'not done while it is still over on their ship');
  via(G, [[g.nav.x + 0.6, g.y], doorC(g.doors[1]), [g.crate.x + 1, g.y], doorC(g.doors[0]), [g.entry.x, g.y], [5, g.y]]);   // (back through our outer airlock's chamber)
  check(G.roomAt(me.x, me.y) && !G.inDock(me.x, me.y) && !G.objectiveStatus().done && G.objectiveStatus().text === 'Install the nav core in our helm (bridge)',
        `carried aboard our ship: not done yet ("${G.objectiveStatus().text}", jumping now: "${G.objectiveStatus().fail}")`);
  const { tg, t: ti } = installAtHelm(G);
  check(tg?.hold?.id === 'navInstall' && /install the nav core/.test(tg.text), `at the helm with it in hand: "${tg?.text}"`);
  check(G.dk.helmCore && !me.inv.item && Math.abs(ti - G.NAVCORE_INSTALL) < 0.3 && G.objectiveStatus().done, `holding click on the helm installs it (${ti.toFixed(1)} s): objective done`);
  G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }], side: 'star', y: 9 });
  check(!G.hz.floating.some(q => q.kind === 'navcore'), 'with a core installed, the next raider\'s core isn\'t flung out');
  const tg2 = G.withCrew(me, () => G.clickTarget(G.HELM.x, G.HELM.y + 0.5));
  check(tg2?.run && !tg2.hold, 'then the helm is the diagnosis console again');
  const m = me.input.mouse; m.wx = g.nav.x; m.wy = g.nav.y; G.simTick(DT);
}
{
  const G = fresh(), me = G.me; G.withCrew(me, () => { G.inv.item = 'navcore'; });   // (a mission that doesn't want one: the helm is just the helm)
  me.x = G.HELM.x; me.y = G.HELM.y + 1.5;
  const tg = G.withCrew(me, () => G.clickTarget(G.HELM.x, G.HELM.y + 0.5));
  check(tg?.run && tg.hold?.id !== 'navInstall', 'the helm still installs nothing in a mission without the nav core objective');
}
// way 2: a raider shot to scrap flings its core clear; a spacewalk fetches it; ~60 s, then it's lost
{
  const G = c4(), me = G.me;
  G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }, { hit: true }], side: 'port', y: 9 });
  const f = G.hz.floating.find(f => f.kind === 'navcore');
  check(f && f.life === G.NAVCORE_LIFE && G.evaOk(f.x, f.y), `a raider shot to scrap flings its nav core clear, within spacewalk reach (${f && f.x.toFixed(1)}, ${f && f.y.toFixed(1)}), ${G.NAVCORE_LIFE} s to fetch it`);
  const x0 = f.x, y0 = f.y; tickN(G, 60 * 40);
  check(G.hz.floating.includes(f) && Math.hypot(f.x - x0, f.y - y0) > 1 && G.evaOk(f.x, f.y) && G.evaReach(f.x, f.y).e < 0.9, `it drifts slowly away (${Math.hypot(f.x - x0, f.y - y0).toFixed(1)} units in 40 s) and stays reachable`);
  me.mode = 'eva'; me.x = f.x + 0.6; me.y = f.y; me.vx = me.vy = 0;
  const m = me.input.mouse; m.wx = f.x + Math.sin(f.t * 0.7) * 0.3; m.wy = f.y + Math.cos(f.t * 0.5) * 0.3; m.click = true; G.simTick(DT);
  check(me.inv.item === 'navcore' && !G.hz.floating.some(q => q.kind === 'navcore'), 'clicking it on a spacewalk grabs it');
  check(!G.objectiveStatus().done, 'not done while you are still outside with it');
  me.mode = 'inside'; me.x = 7.5; me.y = 19; G.simTick(DT);
  check(!G.objectiveStatus().done, 'brought inside: not done yet (picking it up adrift isn\'t the whole job)');
  G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }], side: 'star', y: 9 });
  check(!G.hz.floating.some(q => q.kind === 'navcore'), 'with a core aboard, the next raider\'s core isn\'t flung out');
  installAtHelm(G);
  check(G.dk.helmCore && !me.inv.item && G.objectiveStatus().done, 'carried to the helm and installed: objective done');
}
{
  const G = c4('pirates');
  G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }], side: 'star', y: 15 });
  check(G.hz.floating.some(f => f.kind === 'navcore' && f.x > 44), 'Pirate cove too: on the right side when the raider was there');
  tickN(G, 60 * 61);
  check(!G.hz.floating.some(f => f.kind === 'navcore') && !G.objectiveStatus().done, 'nobody fetched it: after 60 s the core is lost (another raider\'s will do)');
  const H = fresh(); H.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }], side: 'port', y: 9 });
  check(!H.hz.floating.some(f => f.kind === 'navcore'), 'no nav core flung out in a mission that doesn\'t want one');
}
{
  const G = c4(); G.dockShip('pirate', 'star'); G.dk.dock.navcore = false;
  G.ENEMY_TYPES.pirate.onHit({ pois: [{ hit: true }], side: 'port', y: 9 }); G.hz.floating[0].life = 33;
  const C = loadGame(NAMES); C.startMission('intro'); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  const f = C.hz.floating.find(f => f.kind === 'navcore');
  check(C.dk.dock?.navcore === false && f && f.life === 33 && f.vx, 'the snapshot carries the nav console\'s state and the drifting core (its life and drift)');
  G.dk.helmCore = true; C.startMission('c4'); check(!C.dk.helmCore, 'a new mission starts with an empty helm');
  C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(C.dk.helmCore && C.objectiveStatus().done, 'the snapshot carries the installed core: done for every player');
}
// --- the ore asteroid drifts past (Ore run, chapter 6): in from one side, past the front within reach, out the other
{
  const G = fresh(), reachable = (x) => {                  // a spot within the spacewalk's reach (e < 1) from where its near side is in REACH
    for (let a = 0; a < 6.283; a += 0.05) { const sx = x + Math.cos(a) * 2.2, sy = G.ROCK_Y + Math.sin(a) * 2.2;
      for (let d = 0.2; d < G.REACH - 0.1; d += 0.1) if (G.evaOk(sx + Math.cos(a) * d, sy + Math.sin(a) * d) && G.evaReach(sx + Math.cos(a) * d, sy + Math.sin(a) * d).e < 0.9) return true; }
    return false;
  };
  check(reachable(G.ROCK_REACH[0]) && reachable(G.ROCK_REACH[1]) && reachable((G.ROCK_REACH[0] + G.ROCK_REACH[1]) / 2), `the rock is drillable on a spacewalk all along its stretch (x ${G.ROCK_REACH.join(' – ')})`);
  for (const [side, easy] of [['port', 0], ['star', 0], ['port', 1]]) {
    const H = fresh(); H.mission.easy = easy; H.EVENT_RUNNERS.rock({ side });
    const r = H.dk.rock, x0 = r.x; let on = null, off = null, t = 0;
    check(side === 'port' ? r.dir === 1 && x0 < H.ROCK_REACH[0] : r.dir === -1 && x0 > H.ROCK_REACH[1], `${side}: it comes in from the ${side === 'port' ? 'left' : 'right'}, out of reach`);
    while (H.dk.rock && t < 400) { H.simTick(0.1); t += 0.1; if (H.dk.rock?.reach && on === null) on = t; if (H.dk.rock?.gone && off === null) off = t; }
    const span = off - on;
    check(on !== null && on < 30 && (easy ? span > 185 && span < 215 : span > 150 && span < 180), `${side}${easy ? ', easy' : ''}: in reach after ${on?.toFixed(0)} s, for ${span.toFixed(0)} s`);
    check(!H.dk.rock && t < 400, `then it drifts off the other side and is gone (${t.toFixed(0)} s)`);
  }
}
{
  { const S = fresh(); S.startMission('ore'); S.mission.active = false;
    check(S.objectiveStatus().text === 'Drill an ore sample and bring it aboard', `solo: one sample ("${S.objectiveStatus().text}")`); }
  const G = fresh(); G.crew.push(G.makeCrew('B')); G.startMission('ore'); G.mission.active = false;   // (two players: two samples)
  check(G.MISSIONS.ore.objective.perPlayer && G.MISSIONS.c6.objective.perPlayer && G.objectiveStatus().text === 'Bring 2 ore samples aboard (0/2)', `Ore run and Spore Season want one sample per player: for two "${G.objectiveStatus().text}"`);
  G.EVENT_RUNNERS.rock({ side: 'port' }); const r = G.dk.rock; r.x = 16;
  const me = G.me, m = me.input.mouse;
  G.withCrew(me, () => { G.inv.weapon = 'drill'; });
  for (let k = 1; k <= 2; k++) {
    me.mode = 'eva'; me.x = r.x; me.y = -4.6; me.vx = me.vy = 0;
    const x0 = r.x, t = holdOn(G, r.x, r.y + 1.2, () => G.hz.floating.some(f => f.kind === 'ore'));
    check(G.hz.floating.some(f => f.kind === 'ore') && t > 5.8 && t < 6.5 && r.x > x0 + 1, `sample ${k}: drilled in ${t.toFixed(1)} s while the rock drifted on (${(r.x - x0).toFixed(1)} units)`);
    const f = G.hz.floating.find(f => f.kind === 'ore'); me.x = f.x; me.y = f.y + 0.5;
    m.wx = f.x + Math.sin(f.t * 0.7) * 0.3; m.wy = f.y + Math.cos(f.t * 0.5) * 0.3; m.click = true; G.simTick(DT);
    check(me.inv.item === 'ore', `sample ${k}: grabbed`);
    me.mode = 'inside'; me.x = 7.5; me.y = 19; G.simTick(DT);
    check(G.dk.ore === k && !me.inv.item, `sample ${k}: carried inside it's stowed (${G.dk.ore} aboard, hands free for the next trip)`);
    check(k === 1 ? !G.objectiveStatus().done && /\(1\/2\)/.test(G.objectiveStatus().text) : G.objectiveStatus().done, `objective after ${k}: ${G.objectiveStatus().done ? 'done' : G.objectiveStatus().text}`);
  }
  // grabbing a sample with one already in hand on a spacewalk: the old one floats there (it used to land on a floor inside: stowed)
  { const before = G.dk.ore; me.mode = 'eva'; me.x = r.x; me.y = -4.6; G.withCrew(me, () => { G.inv.item = 'ore'; G.grab('ore'); }); G.simTick(DT);
    check(G.dk.ore === before && me.inv.item === 'ore' && G.hz.floating.some(f => f.kind === 'ore') && !G.ITEMS.some(i => i.kind === 'ore'),
          'a second sample grabbed on a spacewalk: the one in hand floats away beside you, nothing is stowed');
    G.hz.floating = G.hz.floating.filter(f => f.kind !== 'ore'); me.inv.item = null; me.mode = 'inside'; me.x = 7.5; me.y = 19; }
  const C = loadGame(NAMES); C.startMission('intro'); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(C.dk.ore === 2 && C.dk.rock && C.dk.rock.dir === 1 && Math.abs(C.dk.rock.x - r.x) < 1e-9, 'the snapshot carries the drifting rock and the samples aboard');
  G.mission.objective = { kind: 'ore' }; G.dk.ore = 0; G.ITEMS.push({ kind: 'ore', x: 7.5, y: 19 }); G.simTick(DT);
  check(G.objectiveStatus().done && G.objectiveStatus().text === 'Drill an ore sample and bring it aboard', 'an ore objective without a count still wants one sample');
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
  G.dockShip('derelict', 'port'); G.dk.dock.fires = [];
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
  check(ev.map(e => e.kind).join() === 'interceptor,brig' && ev[0].opener && Math.abs(ev[0].t - 25) < 1e-6 && Math.abs(ev[1].t - 60) < 1e-6 && G.mission.jumpAt === 420,
        `c5: a patrol interceptor (the opener) at 25 s, the pirate base at 60 s, the jump due at 420 s (7 min) (${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', ')}, jump ${G.mission.jumpAt})`);
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
  check(!d.doors[0] && d.doors[1] && d.doors[2] && d.doors[4] && [1, 2, 4].every(i => !G.walkRects().includes(g.doors[i])), `${side}: the barracks, the captain's quarters' and the brig doors start locked (no walking through)`);
  // the captain's quarters: 12 x 10 between the gun corridor and the brig; its cover blocks walking and shots; the
  // pirates' blast door in its side wall stays bolted (no walking through, no way to open it)
  const Qr = g.rooms[5], B = g.blast, bx = B.x + B.w / 2, by = B.y + B.h / 2, out = side === 'port' ? 1 : -1;
  check(Qr.w === 12 && Qr.h === 10 && G.canStand(Qr.x + 1, Qr.y + 5, G.walkRects()) && G.canStand(Qr.x + 11, Qr.y + 8, G.walkRects()), `${side}: the captain's quarters (12 x 10) are walkable`);
  check(Object.values(g.qcover).every(q => inside(Qr, q) && !G.canStand(q.x + q.w / 2, q.y + q.h / 2, G.walkRects()) && !G.freeAt(q.x + q.w / 2, q.y + q.h / 2)),
        `${side}: its cover (desk, chest, pillar) can't be walked through and stops shots`);
  me.x = bx - out * 1.0; me.y = by; G.simTick(DT);
  check(!G.canStand(bx, by, G.walkRects()) && !G.canStand(bx + out * 0.8, by, G.walkRects()) && /CREW ONLY/.test(me.prompt?.text || '') && !me.prompt?.run && d.blast === 'closed',
        `${side}: the pirates' blast door is bolted from their side ("${me.prompt?.text}")`);
  me.x = 37; me.y = 5;
  // every room reachable along the chain once the doors are open (Dr. Varga walks it home on her own)
  d.doors = [false, false, false, false, false]; G.dk.pirates.length = 0;
  const N = G.dk.npc; N.state = 'follow';
  tickN(G, 60 * 5);
  check(N.state === 'follow' && G.inBase(N.x, N.y) && Math.hypot(N.x - g.npcSpot.x, N.y - g.npcSpot.y) < 3 && G.sentryLive(), `${side}: with the sentry gun still live, she waits in the brig (Varga safe)`);
  d.sentry.state = 'off';
  let t = 0; while (N.state !== 'safe' && t < 40) { G.simTick(DT); t += DT; }
  check(N.state === 'safe' && G.roomAt(N.x, N.y), `${side}: once it's off, she walks from the brig through the captain's quarters, down the gun corridor (past the cover), through the rooms and the tube into our airlock room (${t.toFixed(1)} s)`);
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
  kitOn(G, g.terminal.x, g.terminal.y, () => d.terminal === 'fixed');
  check(d.terminal === 'fixed' && d.doors[1], 'repaired: still locked');
  holdOn(G, g.terminal.x, g.terminal.y, () => d.terminal === 'hacked');
  check(d.terminal === 'hacked' && !d.doors[1], 'hacked: the barracks door slides open');
  // the door to the captain's quarters: its keypad wants the code from the barracks wall
  const q = g.doors[2]; me.x = q.x + q.w / 2; me.y = q.y + q.h + 0.6; G.simTick(DT);
  check(/door code/.test(me.prompt?.text || ''), `at the quarters' door: "${me.prompt?.text}"`);
  G.withCrew(me, () => G.openBasePad(2));
  const type = (code) => { G.withCrew(me, () => { for (const ch of code) G.miniCommand('pin', 'key', +ch); G.miniCommand('pin', 'ok'); }); for (let i = 0; i < 60; i++) G.simTick(DT); };
  type(d.code === '1234' ? '4321' : '1234');
  check(d.doors[2] && me.ui.panel === 'mini', 'a wrong code: ACCESS DENIED, still locked');
  type(d.code);
  check(!d.doors[2] && d.doors[4] && !me.ui.panel, `the right code (${d.code}): the quarters' door opens (the brig door stays shut)`);
  // the brig door behind the captain: in lockdown while Captain Red Comet holds his quarters (no code opens it: js/captain.js,
  // tests/captain.js); once he's fled (or in a base without him) its own keypad takes the same code
  const qb = g.doors[4]; me.x = qb.x + qb.w / 2; me.y = qb.y + qb.h + 0.6; G.withCrew(me, () => { G.inv.weapon = null; }); G.simTick(DT);
  check(!/brig door code/.test(me.prompt?.text || '') && !me.prompt?.run, `at the brig door (in the quarters' back wall) while the captain's there: no keypad ("${me.prompt?.text}")`);
  G.withCrew(me, () => G.openBasePad(4)); type(d.code); G.withCrew(me, () => { me.ui.panel = null; });
  check(d.doors[4], 'the code doesn\'t open it while the captain holds the quarters');
  G.dk.boss = null; G.simTick(DT);
  check(/brig door code/.test(me.prompt?.text || ''), `without the captain: "${me.prompt?.text}"`);
  G.withCrew(me, () => G.openBasePad(4)); type(d.code);
  check(!d.doors[4] && !me.ui.panel && G.walkRects().includes(qb), `...the same code opens the brig door`);
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
  const N = G.dk.npc; Object.assign(N, { x: 5, y: 20, state: 'safe' });
  G.simTick(DT);
  check(/detach/.test(me.prompt?.text || ''), `with her aboard, our airlock offers to detach ("${me.prompt?.text}")`);
  other.x = g.rooms[1].x + 2; other.y = g.y;                            // somebody is still over there
  G.withCrew(me, () => G.baseDetach());
  check(d.tube === 'detached' && !G.walkRects().includes(g.tube), 'detached: the tube pulls in, no walking across');
  tickN(G, 60);
  check(G.HATCHES[0].doors.outer === 0, 'our airlock\'s outer door is shut');
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
  Object.assign(G.dk.npc, { x: 5, y: 20, state: 'safe' }); G.me.x = 5; G.me.y = 19; G.withCrew(G.me, () => G.baseDetach()); G.simTick(DT);
  check(Math.abs(G.mission.jumpAt - 115) < 0.1, `clear of the base with her aboard: the jump drive spools up right away (jump at ${G.mission.jumpAt.toFixed(0)} s)`);
}
{
  // a stray shot downs her on the way; the snapshot carries the base's state (multiplayer)
  const G = baseFresh(), N = G.dk.npc; G.dk.dock.doors = [false, false, false, false, false]; N.state = 'follow';
  G.boarding.bolts.push({ x: N.x + 0.1, y: N.y, vx: 0, vy: 0, life: 1, owner: 'pirate' }); G.simTick(DT);
  check(N.state === 'down', 'shot on her way out, she goes down again (treat her again)');
  G.dk.dock.terminal = 'fixed'; G.dk.dock.tube = 'detached';
  const C = loadGame(NAMES); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(C.dk.dock.kind === 'base' && C.dk.dock.tube === 'detached' && C.dk.dock.terminal === 'fixed' && C.dk.dock.code === G.dk.dock.code && C.dk.pirates.length === G.dk.pirates.length,
        'the snapshot carries the base (tube, terminal, door code, guards) to every browser');
}
// --- our bolts vs pirates: a swept test against the body as drawn (js/combat.js segBody, js/invader.js boltHitsBody)
{
  const G = fresh(); G.dockShip('pirate', 'port'); G.dk.pirates.splice(1);
  const p = G.dk.pirates[0], place = () => { p.x = 10; p.y = 19.5; p.hp = 3; p.cd = 99; p.route = []; p.flash = 0; };
  const shoot = (dy, speed, z = 0.52, ticks = 3) => { place(); G.boarding.bolts.length = 0; G.boarding.bolts.push({ x: 7, y: 19.5 + dy, z, vx: speed, vy: 0, life: 1, owner: 'crew' }); tickN(G, ticks); return p.hp < 3; };
  check(shoot(0.33, 26, 0.52, 12) && !shoot(0.6, 26, 0.52, 12), 'classic view: a grazing bolt 0.33 off the pirate\'s middle hits, one 0.6 off misses');
  // a very fast bolt steps 2 units a frame: the old point test skipped right past
  let fast = 0; for (const x0 of [7.0, 7.3, 7.7, 8.1, 8.5]) { place(); G.boarding.bolts.length = 0; G.boarding.bolts.push({ x: x0, y: 19.5, vx: 120, vy: 0, life: 0.1, owner: 'crew' }); tickN(G, 4); if (p.hp < 3) fast++; }
  check(fast === 5, `a very fast bolt (2 units a frame) can't tunnel through a pirate (${fast}/5 hit)`);
  G.GFX.on = true;                                      // the sprite view: bodies stand up, bolts fly at muzzle height
  const behind = shoot(-0.45, 26, 0.52, 12), front = shoot(0.35, 26, 0.52, 12), below = shoot(0.95, 26, 0.52, 12), over = shoot(-1.6, 26, 0.52, 12);
  G.GFX.on = false;
  check(behind && front && !below && !over, `sprite view: what you see is what you hit — a bolt drawn across the head (behind) ${behind ? 'hits' : 'misses'}, across the legs ${front ? 'hits' : 'misses'}, under the feet ${below ? 'hits' : 'misses'}, far over the head ${over ? 'hits' : 'misses'}`);
  check(p.flash > 0 || (shoot(0, 26, 0.52, 12) && p.flash > 0), 'a hit shows on the pirate it hit (hit flash; its HP pips: drawPirate)');
  // two pirates in a row: the near one takes it
  const G2 = fresh(); G2.dockShip('pirate', 'port');
  const [a, b] = G2.dk.pirates; Object.assign(a, { x: 10, y: 19.5, cd: 99, route: [] }); Object.assign(b, { x: 11, y: 19.5, cd: 99, route: [] });
  G2.boarding.bolts.push({ x: 7, y: 19.5, z: 0.52, vx: 26, vy: 0, life: 1, owner: 'crew' }); tickN(G2, 12);
  check(a.hp === 2 && b.hp === 3, 'a bolt hits the first pirate along its path, not the one behind');
}
// --- pirates keep apart (and pass each other in single file through the tube)
{
  const G = fresh(); G.dockShip('pirate', 'port');
  G.dk.pirates.push({ ...G.dk.pirates[0], uid: 999 });
  for (const p of G.dk.pirates) Object.assign(p, { x: 10, y: 19.5, cd: 99, done: true, home: false });
  G.me.x = 10.2; G.me.y = 19.6;
  tickN(G, 30);
  const P = G.dk.pirates, dists = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) dists.push(Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y));
  check(Math.min(...dists) > 0.7, `three pirates dropped on one spot push apart (closest pair ${Math.min(...dists).toFixed(2)})`);
  check(P.every(p => Math.hypot(p.x - G.me.x, p.y - G.me.y) > 0.55), 'and out of the crew member standing there');
}
for (const side of ['port', 'star']) {
  const G = baseFresh(side), g = G.baseGeom(side), me = G.me; me.x = 37; me.y = 5;
  const [a, b] = G.dk.pirates; G.dk.pirates.length = 0; G.dk.pirates.push(a, b);
  const ours = { x: g.hatch.inside[0] - g.hatch.dir * 1.5, y: g.hatch.inside[1] }, bay = { x: g.entry.x, y: g.y };
  Object.assign(a, { mode: 'guard', room: 0, x: ours.x, y: ours.y, post: bay, cd: 99, route: [] });
  Object.assign(b, { mode: 'guard', room: 0, x: bay.x, y: bay.y, post: ours, cd: 99, route: [] });
  let t = 0; while (t < 20 && !(Math.hypot(a.x - bay.x, a.y - bay.y) < 0.5 && Math.hypot(b.x - ours.x, b.y - ours.y) < 0.5)) { G.simTick(DT); t += DT; }
  check(t < 20, `${side}: two pirates meeting head-on in the docking tube get past each other (no deadlock, ${t.toFixed(1)} s)`);
}
// --- the gun corridor's sentry gun
{
  const G = baseFresh(), g = G.baseGeom('port'), d = G.dk.dock, S = d.sentry, me = G.me, y = g.y; G.dk.pirates.length = 0;
  const at = (x, dy) => ({ x, y: y + dy }), put = (q) => { me.x = q.x; me.y = q.y; me.health = 'ok'; me.armor = 0; };
  check(g.rooms[4] && !G.walkRects().includes(g.rooms[4]) && g.cover.every(q => !G.canStand(q.x + q.w / 2, q.y + q.h / 2, G.walkRects()) && !G.freeAt(q.x + q.w / 2, q.y + q.h / 2)),
        'a gun corridor between the barracks and the brig, with cover you can\'t walk through and shots don\'t pass');
  put(at(-24.0, -7.6)); tickN(G, 60);
  check(S.state === 'idle', 'behind the first crates it doesn\'t see you');
  put(at(-29.0, -8.5)); G.simTick(DT);
  check(S.state === 'spool', 'step into its line of fire: it spools up (whine, glowing barrel)');
  let fired = null;
  for (let t = 0; t < 4 && !fired; t += DT) { G.simTick(DT); if (S.state === 'fire') fired = t; }
  tickN(G, 60 * (G.SENTRY_BURST + 0.5));
  check(fired !== null && Math.abs(fired - G.SENTRY_SPOOL[0]) < 0.1, `then it opens fire (after ${fired?.toFixed(2)} s)`);
  check(me.health !== 'ok', `standing in the open through a burst gets you hit (${me.health})`);
  check(S.state === 'cool' && S.shots > 25, `it fires for ${G.SENTRY_BURST} s (${S.shots} shots), then cools down`);
  tickN(G, 60 * (G.SENTRY_COOL + 0.1)); me.x = 37; me.y = 5; G.simTick(DT);
  check(S.state === 'idle', 'and goes back to watching');
  // cover: crouched behind each stack, a whole burst doesn't touch you
  let safe = true;
  for (const q of g.cover) {
    put({ x: q.x + q.w + 0.35, y: q.y + q.h / 2 }); S.state = 'fire'; S.t = 0; S.shotT = 0;
    tickN(G, 60 * G.SENTRY_BURST); if (me.health !== 'ok') safe = false;
  }
  check(safe, 'behind each stack of cover a whole burst misses you');
  const spots = g.cover.map(q => ({ x: q.x + q.w + 0.35, y: q.y + q.h / 2 })), gap = Math.max(...spots.slice(1).map((q, i) => Math.hypot(q.x - spots[i].x, q.y - spots[i].y)));
  check(gap / 4.2 + 0.5 < G.SENTRY_COOL + G.SENTRY_SPOOL[0], `between bursts there's time to run to the next cover (${gap.toFixed(1)} units, ${(G.SENTRY_COOL + G.SENTRY_SPOOL[0]).toFixed(1)} s)`);
  // right beside it you're out of its fan, and can switch it off
  S.state = 'idle'; G.boarding.bolts.length = 0;
  put(at(-34.5, -9.7)); tickN(G, 30);
  check(S.state === 'idle', 'right beside the gun it can\'t see you (it never turns)');
  S.state = 'fire'; S.t = 0; tickN(G, 60 * 2);
  check(me.health === 'ok', '…and its fire doesn\'t reach you there');
  S.state = 'idle';
  const tHand = holdOn(G, g.sentry.x, g.sentry.y, () => S.state === 'off');
  check(S.state === 'off' && tHand > 3.5 && tHand < 4.5, `hold click on it: switched off by hand (${tHand.toFixed(1)} s)`);
  put(at(-29.0, -8.5)); G.boarding.bolts.length = 0; tickN(G, 60 * 4);
  check(S.state === 'off' && !G.boarding.bolts.some(b => b.owner === 'sentry') && me.health === 'ok', 'switched off, it stays quiet');
  // with the repair kit it's quicker
  const H = baseFresh(), hg = H.baseGeom('port'); H.dk.pirates.length = 0; H.me.x = hg.sentry.x; H.me.y = hg.y - 9.7;
  H.withCrew(H.me, () => { H.inv.weapon = 'repair'; });
  const tKit = holdOn(H, hg.sentry.x, hg.sentry.y, () => H.dk.dock.sentry.state === 'off');
  check(H.dk.dock.sentry.state === 'off' && tKit < 2.5, `with the repair kit: ${tKit.toFixed(1)} s`);
  // the snapshot carries it
  const C = loadGame(NAMES); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(C.dk.dock.sentry?.state === 'off' && C.walkRects().length === G.walkRects().length, 'the snapshot carries the sentry gun\'s state (and every browser has the corridor\'s cover)');
}
{
  // a pirate guards the gun's end; the starboard base is the mirror image
  const G = baseFresh('star'), g = G.baseGeom('star');
  const gunGuard = G.dk.pirates.find(p => p.mode === 'guard' && p.room === 4);
  check(gunGuard && Math.hypot(gunGuard.x - g.sentry.x, gunGuard.y - g.sentry.y) < 3, 'a pirate guards the gun\'s end of the corridor');
  const big = baseFresh('port', 4), bg = big.baseGeom('port'), qGuard = big.dk.pirates.find(p => p.mode === 'guard' && p.room === 5);
  check(qGuard && G.inRect(qGuard.x, qGuard.y, bg.rooms[5]) && big.canStand(qGuard.x, qGuard.y, big.walkRects()), 'a big crew: a second guard holds the captain\'s quarters');
  check(g.sentry.dir === Math.PI && g.sentry.muzzle.x < g.sentry.x && G.canStand(g.sentry.muzzle.x - 4, g.y - 8.5, G.walkRects()), 'starboard: the gun faces the other way, down its own corridor');
}
{
  // difficulty: on very easy it spools up longer and fires fewer shots
  const burst = (easy) => {
    const G = baseFresh('port', 1, easy), g = G.baseGeom('port'), S = G.dk.dock.sentry; G.dk.pirates.length = 0;
    G.me.x = g.sentry.muzzle.x + 4.75; G.me.y = g.y - 8.5; G.me.armor = 0;
    let t = 0; while (S.state !== 'fire' && t < 5) { G.simTick(DT); t += DT; G.me.health = 'ok'; }
    tickN(G, 60 * 5, () => { G.me.health = 'ok'; });
    return { spool: t, shots: S.shots };
  };
  const n = burst(0), e = burst(2);
  check(e.spool > n.spool + 0.8 && e.shots < n.shots * 0.6, `easier: a longer spool-up (${n.spool.toFixed(1)} → ${e.spool.toFixed(1)} s) and fewer shots a burst (${n.shots} → ${e.shots})`);
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
