// The outer airlocks (js/airlock.js, 2026-10-21): a chamber with an inner and an outer door, only one ever open.
// Out and back through real inputs (WASD), the timing, docked ships (a pressurized passage; the derelict's airless
// tube: cycled), a broken / locked airlock and its manual override (vents the room), the vent panel, intruders coming
// in through the chamber, and the multiplayer snapshot. Run: node tests/airlock.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'HATCHES', 'startMission', 'mission', 'roomAt', 'dk', 'dockShip', 'undock', 'DG', 'boarding', 'spawnInvader',
  'SYSTEMS', 'overrideHit', 'withCrew', 'ui', 'hz', 'startVent', 'VENT_TIME', 'netSerialize', 'netApply', 'netServer', 'airlockPass', 'airlockVacuum',
  'applyShipUpgrades', 'LOCK_CYCLE', 'canStand', 'walkRects', 'inDock', 'airlockAt', 'OL_BLOCK', 'inRect', 'makeCrew', 'SHIP_W'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; return G; };
let both = 0;                                       // ticks with both doors of an airlock open (outside a vent / a docked passage)
const tick = (G, n = 1) => { for (let i = 0; i < n; i++) { G.simTick(DT); for (const h of G.HATCHES) if (h.doors.inner > 0 && h.doors.outer > 0 && h.phase !== 'vent' && h.phase !== 'shut' && !(G.dk.dock && G.dk.dock.side === h.side && G.dk.dock.kind !== 'derelict')) both++; } };
// hold a key until done() (or max s); returns the seconds it took
const holdKey = (G, key, done, max = 15) => { const k = G.me.input.keys; k.add(key); let t = 0; while (!done() && t < max) { tick(G); t += DT; } k.delete(key); return t; };

// --- out and back, through real inputs: walk at the inner door, it opens; in; it shuts; pump; the outer door opens; out
for (const side of ['port', 'star']) {
  const G = fresh(), h = G.HATCHES.find(h => h.side === side), me = G.me, out = side === 'port' ? 'KeyA' : 'KeyD', back = side === 'port' ? 'KeyD' : 'KeyA';
  check(h.doors.inner === 0 && h.doors.outer === 0 && h.air === 'inner', `${side}: at rest both doors are shut, the chamber has air`);
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); tick(G);
  let sawVisor = false;
  const tOut = holdKey(G, out, () => { if (G.airlockVacuum(me.x, me.y) && G.inRect(me.x, me.y, h.chamber)) sawVisor = true; return me.mode === 'eva'; });
  check(me.mode === 'eva' && Math.abs(me.y - h.y) < 0.6, `${side}: walking (one key held) from in front of the inner door out onto the hull: a spacewalk in ${tOut.toFixed(2)} s`);
  check(h.air === 'outer' && sawVisor, `${side}: the chamber was pumped out on the way (visor down in there)`);
  holdKey(G, out, () => false, 0.6);
  tick(G, 60);
  check(h.doors.outer === 0 && h.doors.inner === 0, `${side}: once you've floated off, the outer door shuts behind you`);
  // back: float at the hatch, it cycles to you (it's pumped out: the outer door opens), in, pump up, the inner door, in
  Object.assign(me, { x: h.outside[0], y: h.outside[1], vx: 0, vy: 0 }); tick(G);
  const tIn = holdKey(G, back, () => me.mode === 'inside' && G.roomAt(me.x, me.y)?.id === (side === 'port' ? 'portLock' : 'starLock') && Math.abs(me.x - h.x) >= Math.abs(h.inside[0] - h.x));
  holdKey(G, back, () => false, 0.5);                // (a few steps on into the room)
  check(me.mode === 'inside' && G.roomAt(me.x, me.y), `${side}: and back in from just off the hatch: in front of the inner door, in the room, in ${tIn.toFixed(2)} s`);
  tick(G, 60);
  check(h.air === 'inner' && h.doors.inner === 0 && h.doors.outer === 0, `${side}: behind you it's at rest again (air, both doors shut)`);
  if (side === 'port') console.log(`      (timing, port: out ${tOut.toFixed(2)} s, back in ${tIn.toFixed(2)} s; the old scripted hatch took 1.6 s each way)`);
}
check(both === 0, `only ever one door open at a time (${both} ticks with both)`);

// --- the 'airlocks' upgrade (faster pumps) and the model's pass time
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  G.applyShipUpgrades({ airlocks: true });
  check(G.LOCK_CYCLE === 0.7, 'the faster airlock pumps: 0.7 s cycles');
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); tick(G);
  const t = holdKey(G, 'KeyA', () => me.mode === 'eva');
  const G2 = fresh(), h2 = G2.HATCHES[0], me2 = G2.me; Object.assign(me2, { x: h2.inside[0], y: h2.inside[1], vx: 0, vy: 0, mode: 'inside' }); G2.simTick(DT);
  const t0 = (() => { const k = me2.input.keys; k.add('KeyA'); let s = 0; while (me2.mode !== 'eva' && s < 15) { G2.simTick(DT); s += DT; } k.delete('KeyA'); return s; })();
  check(t < t0 - 0.5, `with the upgrade a spacewalk starts quicker (${t.toFixed(2)} s vs ${t0.toFixed(2)} s)`);
  // tools/balance.js counts airlockPass() per pass (plus the walk to the airlock, which its travel table has)
  const pass = G2.airlockPass(), walkIn = 1.3 / 4.2;
  check(Math.abs(t0 - walkIn - pass) < 0.6, `the balance model's pass time (${pass.toFixed(2)} s) matches the real walk out (${t0.toFixed(2)} s from in front of the door)`);
}

// --- E / click in the chamber cycles it by hand (turning back halfway)
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); tick(G);
  holdKey(G, 'KeyA', () => G.inRect(me.x, me.y, h.chamber, -0.25) && h.phase === 'cycling');
  tick(G, 120);
  check(h.air === 'outer' && h.doors.outer === 1, 'standing still in the chamber: it pumps out and opens to space');
  me.input.pressed.add('KeyE'); tick(G, 150);
  check(h.air === 'inner' && h.doors.inner === 1 && h.doors.outer === 0 && me.mode === 'inside', 'E in there: it pumps back up and the inner door opens (changed your mind)');
  tick(G, 120);
  check(h.phase === 'idle' && h.air === 'inner' && h.doors.inner === 1, '…and it waits for you to step out (no endless cycling)');
}

// --- a docked pirate ship: a plain passage (air on both sides), pirates come through it
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  G.dockShip('pirate', 'port');
  const g = G.DG();
  Object.assign(me, { x: 22, y: 4.5 });
  let inRoom = false;
  for (let i = 0; i < 60 * 12 && !inRoom; i++) { tick(G); inRoom = G.dk.pirates.some(p => G.roomAt(p.x, p.y)?.id === 'portLock'); }
  check(inRoom, 'docked pirates walk from their tube through our airlock\'s chamber into the airlock room');
  G.dk.pirates.length = 0; tick(G, 60);
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' });
  const t = holdKey(G, 'KeyA', () => G.inDock(me.x, me.y) && me.x < -2);
  check(me.mode === 'inside' && G.inDock(me.x, me.y), `you walk straight through (no pumping: air both sides) into their tube (${t.toFixed(2)} s)`);
  const tb = holdKey(G, 'KeyD', () => G.roomAt(me.x, me.y)?.id === 'portLock' && me.x > h.inside[0]);
  check(G.roomAt(me.x, me.y) && tb < 2.5, `and back (${tb.toFixed(2)} s)`);
  // cast off with the outer door open: it shuts, the chamber keeps the room's air
  Object.assign(me, { x: 1.7, y: h.y, vx: 0, vy: 0 }); tick(G, 30);
  G.undock(); tick(G, 60);
  check(h.doors.outer === 0 && !(h.doors.inner > 0 && h.doors.outer > 0), 'they cast off: the outer door shuts (never both open to space)');
}

// --- the derelict's tube is airless: the chamber cycles, its outer door opens into the tube
{
  const G = fresh(), h = G.HATCHES[0], me = G.me; both = 0;
  G.dockShip('derelict', 'port');
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); tick(G);
  let cycled = false;
  const t = holdKey(G, 'KeyA', () => { if (h.phase === 'cycling') cycled = true; return G.inDock(me.x, me.y) && me.x < -1.5; });
  check(cycled && me.mode === 'inside' && G.inDock(me.x, me.y), `to the derelict: through the pumped chamber into its tube, on foot (${t.toFixed(2)} s)`);
  const tb = holdKey(G, 'KeyD', () => G.roomAt(me.x, me.y)?.id === 'portLock' && me.x > h.inside[0]);
  check(G.roomAt(me.x, me.y), `and back aboard through the chamber (${tb.toFixed(2)} s)`);
  check(both === 0, 'only one door open at a time on the way');
}

// --- broken: the doors stay as they are; the manual override vents the room (both doors open), then they shut
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  G.SYSTEMS.find(s => s.ref === h).broken = true;
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); tick(G, 30);
  check(h.doors.inner === 0 && /force the broken outer airlock/.test(me.prompt?.text || ''), `broken: it doesn't open; the prompt offers the override ("${me.prompt?.text}")`);
  me.input.pressed.add('KeyE'); tick(G);
  check(G.withCrew(me, () => G.ui.panel) === 'override', 'E starts the manual override');
  for (let k = 0; k < 3; k++) { G.withCrew(me, () => G.overrideHit()); tick(G, 40); }
  tick(G, 40);
  check(G.hz.vent?.room === 'portLock' && h.doors.inner === 1 && h.doors.outer === 1, 'forced: both doors open, the airlock room vents');
  tick(G, 60 * (G.VENT_TIME + 2));
  check(!G.hz.vent && h.doors.inner === 0 && h.doors.outer === 0, 'the vent over, both doors shut again (broken or not)');
}

// --- locked by security: nothing opens; you're never shut in a door
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  h.locked = true;
  Object.assign(me, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' });
  holdKey(G, 'KeyA', () => false, 2);
  check(h.doors.inner === 0 && me.x > h.inner.x + h.inner.w, 'locked: walking at it, the inner door stays shut');
  check(/force the locked outer airlock/.test(me.prompt?.text || ''), 'and the prompt offers the override');
}

// --- the vent panel: both doors open for the vent (hostiles in the chamber are blown out too)
{
  const G = fresh(), h = G.HATCHES[0];
  G.me.x = 22; G.me.y = 9;
  G.spawnInvader('port'); const a = G.boarding.invaders[0];
  Object.assign(a, { mode: 'inside', state: 'wander', x: h.chamber.x + 1.1, y: h.y });
  G.startVent('portLock'); tick(G, 30);
  check(h.doors.inner === 1 && h.doors.outer === 1 && a.dead, 'venting the room opens both doors; an intruder in the chamber is blown out');
}

// --- intruders come in through the chamber (outer door, pump, inner door), then keep out of it
{
  const G = fresh(), h = G.HATCHES[0]; both = 0;
  G.me.x = 37; G.me.y = 5;
  G.spawnInvader('port'); const a = G.boarding.invaders[0];
  let inChamber = false, wasOuter = false, wasInner = false;
  for (let i = 0; i < 60 * 4 && a.state === 'entering'; i++) { tick(G); if (G.inRect(a.x, a.y, h.chamber)) inChamber = true; if (h.doors.outer > 0.9) wasOuter = true; if (h.doors.inner > 0.9) wasInner = true; }
  check(a.state !== 'entering' && a.mode === 'inside' && G.roomAt(a.x, a.y)?.id === 'portLock' && inChamber && wasOuter && wasInner && both === 0,
        'an intruder forces its way in through the chamber (outer door, pump, inner door) into the airlock room');
  let back = false;
  for (let i = 0; i < 60 * 40; i++) { tick(G); if (G.airlockAt(a.x, a.y)) back = true; }
  check(!back, 'afterwards it never goes back into an airlock chamber (it would get shut in)');
}

// --- multiplayer: a second crew member walks out on the server; the snapshot carries the doors, the pump and the mode
{
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob');
  const [A, B] = G.crew, h = G.HATCHES[0];
  Object.assign(B, { x: h.inside[0], y: h.inside[1], vx: 0, vy: 0, mode: 'inside' }); Object.assign(A, { x: 22, y: 4.5 });
  let cyc = null;
  for (let i = 0; i < 60 * 6 && B.mode !== 'eva'; i++) { G.netServer.input(2, { keys: ['KeyA'], pressed: [], mouse: { wx: 0, wy: 0 } }); G.simTick(DT); if (h.phase === 'cycling' && !cyc) cyc = JSON.parse(JSON.stringify(G.netSerialize())); }
  check(B.mode === 'eva', 'Bob walks out through the airlock on the server');
  const C = loadGame(NAMES); C.startMission('intro');
  C.netApply(cyc, 1);
  check(C.HATCHES[0].phase === 'cycling' && C.HATCHES[0].air === h.air || C.HATCHES[0].phase === 'cycling', 'a client sees the chamber pumping (phase in the snapshot)');
  C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 1);
  const cb = C.crew.find(c => c.id === 2), ch = C.HATCHES[0];
  check(cb.mode === 'eva' && ch.doors.outer === h.doors.outer && ch.air === 'outer', 'and Bob out on the hull, with the outer door and the pumped-out chamber as on the server');
}

console.log(failed ? `\n${failed} FAILED` : '\nall airlock checks passed');
process.exit(failed ? 1 : 0);
