// The inner doors (2026-10-21): single sliding doors, closed until a crew member stands in front of one, shut
// again a moment after; locked / broken / pressure-difference doors stay shut (the manual override forces them);
// intruders can't open them at all; pirates force them, slowly; the door state reaches every browser.
// Run: node tests/doors.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'tick', 'me', 'player', 'crew', 'makeCrew', 'DOORS', 'DOORWAYS', 'DECK_DOORS', 'SYSTEMS', 'SPINE_Y0', 'SPINE_Y1',
  'roomAt', 'inRect', 'walkRects', 'canStand', 'ui', 'overrideHit', 'breachRoom', 'hz', 'vacuumRoom', 'boarding', 'spawnInvader', 'dk', 'ITEMS',
  'FUEL_CRATE', 'power', 'PIRATE_HP', 'newUid', 'mission', 'startMission', 'combat', 'netSerialize', 'netApply', 'netServer', 'roomLinkOpen', 'ROOMS',
  'DOOR_LINGER', 'DOOR_DELAY', 'DOOR_TIME', 'DOOR_PRY_LOCKED', 'DOOR_HOLD', 'doorName'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false; G.combat.enemies.length = 0; return G; };
const walk = (G, c, key, sec, until) => { c.input.keys.add(key); for (let t = 0; t < sec && !until?.(); t += DT) G.simTick(DT); c.input.keys.delete(key); };
const pressE = (G, c) => { c.input.keys.add('KeyE'); c.input.pressed.add('KeyE'); G.simTick(DT); c.input.keys.delete('KeyE'); };
async function bonk3(G, c) {                         // the manual override: three whacks, then it gives
  tickN(G, 2);                                       // (let go of the E that opened it first)
  for (let k = 0; k < 3; k++) { pressE(G, c); tickN(G, 40); }
  tickN(G, 90);
}
const inside = (G, a, x, y) => Object.assign(a, { state: 'wander', mode: 'inside', x, y, path: [], linger: 0, hatch: null, t: 0 });

(async () => {
  // --- closed by default; open for whoever stands in front; shut again behind them
  {
    const G = fresh(), me = G.me, L = G.DECK_DOORS[0], cx = L.x + L.w / 2;
    tickN(G, 30);
    check(G.DOORS.every(d => d.open === 0), 'every inner door starts closed');
    check(!G.walkRects().includes(L), 'a closed door is a wall');
    me.x = cx; me.y = G.SPINE_Y1 + 2.5; tickN(G, 30);
    check(L.open === 0, '2.5 units away: still closed');
    me.x = cx; me.y = G.SPINE_Y1 + 0.9; tickN(G, Math.round(G.DOOR_DELAY * 0.8 / DT));
    check(L.open === 0, `stepping up, it doesn't open at once (a noticeable delay: it reacts after ${G.DOOR_DELAY} s)`);
    tickN(G, Math.round((G.DOOR_DELAY * 0.2 + G.DOOR_TIME) / DT) + 2);
    check(L.open === 1, `within a unit of it (standing still): it slides open (${G.DOOR_DELAY} + ${G.DOOR_TIME} s)`);
    walk(G, me, 'KeyW', 3, () => me.y < G.SPINE_Y0 - 1.6);
    check(me.y < G.SPINE_Y0 - 1.6 && G.roomAt(me.x, me.y)?.deck === 'top', 'you walk straight through to the upper deck');
    tickN(G, Math.round(G.DOOR_LINGER * 0.5 / DT));
    check(L.open > 0.9, 'it stays open for a moment after you left');
    tickN(G, Math.round((G.DOOR_LINGER * 0.5 + G.DOOR_TIME) / DT) + 4);
    check(L.open === 0, `…and shuts about ${G.DOOR_LINGER} s after nobody is near`);
    const d = G.DOORWAYS[0]; me.x = d.x - 0.7; me.y = d.y + d.h / 2; tickN(G, Math.round((G.DOOR_DELAY + G.DOOR_TIME) / DT) + 2);
    check(d.open === 1, 'a doorway between rooms opens the same way');
    me.x = d.x - 3; tickN(G, 120);
    check(d.open === 0, 'and shuts again');
    me.x = d.x - 0.7; me.y = d.y - 1.2; tickN(G, 30);
    check(d.open === 0, 'walking past along the wall, off to the side of it, doesn\'t open it');
  }
  // --- the lock (2026-10-24): bolted while shut; the bolts slide back while the sensor reacts, gone exactly when the
  // leaves move; they shoot home again once it's shut. And the 'doors' ship upgrade: all of it 40% quicker
  for (const fast of [false, true]) {
    const G = loadGame(NAMES); G.startMission('c1', fast ? { ship: { doors: true } } : {}); G.mission.active = false; G.combat.enemies.length = 0;
    const me = G.me, L = G.DECK_DOORS[0], cx = L.x + L.w / 2, total = G.DOOR_DELAY + G.DOOR_TIME, tag = fast ? 'fast doors' : 'plain doors';
    if (fast) check(Math.abs(total - 0.6) < 1e-9 && Math.abs(G.DOOR_TIME - 0.36) < 1e-9, `the fast door actuators: unbolt + slide in ${total.toFixed(2)} s (instead of 1 s)`);
    else check(Math.abs(total - 1) < 1e-9, `plain doors: unbolt + slide in ${total.toFixed(2)} s`);
    tickN(G, 30);
    check(G.DOORS.every(d => d.bolt === 1), `${tag}: every shut door is bolted`);
    me.x = cx; me.y = G.SPINE_Y1 + 0.9;
    let honest = true, mid = null;
    for (let t = 0; t < total + 0.1; t += DT) { G.simTick(DT); if (L.open > 0 && L.bolt > 0) honest = false; if (mid === null && t >= G.DOOR_DELAY / 2) mid = L.bolt; }
    check(mid > 0.3 && mid < 0.7, `${tag}: halfway through the delay the bolts are half back (${mid?.toFixed(2)})`);
    check(honest && L.open === 1 && L.bolt === 0, `${tag}: the leaves only move once the bolts are out; open after ${total.toFixed(2)} s`);
    me.x = cx; me.y = G.SPINE_Y1 + 4; tickN(G, Math.round((G.DOOR_LINGER + G.DOOR_TIME) / DT) + 4);
    check(L.open === 0 && L.bolt < 0.5, `${tag}: shut again, the bolts are still sliding home (${L.bolt.toFixed(2)})`);
    tickN(G, Math.round(G.DOOR_DELAY / DT) + 2);
    check(L.bolt === 1, `${tag}: …and then it's bolted`);
    G.startMission('c1');
    if (fast) check(Math.abs(G.DOOR_DELAY + G.DOOR_TIME - 1) < 1e-9, 'the next mission without the upgrade: back to 1 s (it doesn\'t leak between missions)');
  }
  // --- never shuts on someone in the doorway
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    me.x = d.x - 0.6; me.y = d.y + d.h / 2; tickN(G, 20);
    walk(G, me, 'KeyD', 1, () => G.inRect(me.x, me.y, d, -0.1));
    check(G.inRect(me.x, me.y, d), 'you stop in the doorway');
    me.health = 'down'; tickN(G, 60 * 4);
    check(d.open === 1, 'down in the doorway (not a sensor trigger any more): it still doesn\'t shut on you');
    me.health = 'ok'; me.x = 22; me.y = 4.5; tickN(G, 120);
    G.spawnInvader('port'); const a = inside(G, G.boarding.invaders[0], d.x + d.w / 2, d.y + d.h / 2); a.linger = 99;
    d.open = 1; tickN(G, 60 * 3);
    check(d.open === 1, 'nor on an intruder standing in it');
  }
  // --- locked: stays shut; the override unlocks it
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[0];
    d.locked = true; me.x = d.x - 0.7; me.y = d.y + d.h / 2; tickN(G, 60);
    check(d.open === 0, 'a locked door doesn\'t open for you');
    check(/locked/.test(me.prompt?.text || '') && /manual override/.test(me.prompt.text), `the prompt says why, and offers the override ("${me.prompt?.text}")`);
    pressE(G, me);
    check(G.me.ui.panel === 'override', 'E: the manual override');
    await bonk3(G, me);
    check(!d.locked && d.open === 1, 'forced: unlocked, and it opens for you');
  }
  // --- broken deck door: stuck shut; forced, it stays open until repaired
  {
    const G = fresh(), me = G.me, L = G.DECK_DOORS[2], s = G.SYSTEMS.find(s => s.ref === L);
    check(s && s.kind === 'lock' && s.name === 'Right deck door', `the deck doors are parts ("${s?.name}")`);
    s.broken = true; me.x = L.x + L.w / 2; me.y = G.SPINE_Y0 - 0.7; tickN(G, 60);
    check(L.open === 0 && /broken/.test(me.prompt?.text || ''), `broken: stuck shut ("${me.prompt?.text}")`);
    pressE(G, me); await bonk3(G, me);
    me.x = 37; me.y = 7; tickN(G, 120);
    check(L.open === 1, 'forced open, it stays open (jammed) with nobody near');
    s.broken = false; tickN(G, 120);
    check(L.open === 0, 'repaired: it works again (shut, nobody near)');
  }
  // --- pressure difference: stays shut; the override warns, opens it and the pressurized side vents until it shuts
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[0];
    G.breachRoom('portGun'); tickN(G, 10);
    me.x = d.x + d.w + 0.7; me.y = d.y + d.h / 2; tickN(G, 60);
    check(d.blast && d.open === 0, 'vacuum on one side: the door stays shut (blast door)');
    check(/vents the bridge/.test(me.prompt?.text || ''), `the prompt warns what forcing it does ("${me.prompt?.text}")`);
    pressE(G, me); await bonk3(G, me);
    check(d.open === 1 && G.vacuumRoom('bridge'), 'forced: it opens and the bridge vents through it');
    me.x = 22; me.y = 6; tickN(G, Math.round((G.DOOR_HOLD + 1.5) / DT));
    check(d.open === 0 && !G.vacuumRoom('bridge') && d.blast, `after ${G.DOOR_HOLD} s with nobody near it shuts again: the bridge has air, the blast door holds`);
    // both sides in vacuum: no pressure difference, it works as usual
    const L = G.DECK_DOORS[0]; G.breachRoom('portLock'); tickN(G, 10);
    check(!L.blast, 'a door between two rooms in vacuum is no blast door');
  }
  // --- the cat: never vent the reactor room
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    G.breachRoom('portLock'); tickN(G, 10);
    me.x = d.x + d.w + 0.7; me.y = d.y + d.h / 2; tickN(G, 30);
    check(d.blast && /cat/.test(me.prompt?.text || '') && !me.prompt.ok, `from the reactor room it can't be forced ("${me.prompt?.text}")`);
    me.x = d.x - 0.7; tickN(G, 30);
    check(/cat/.test(me.prompt?.text || '') && !me.prompt.ok, `nor from the vacuum side ("${me.prompt?.text}")`);
  }
  // --- intruders (2026-10-21, the user: every door opens for anyone): an unlocked door opens for an alien too; a locked one
  // stays shut (only humans override): shut out, it waits by the door to you (no jitter); opened, it comes through
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    G.spawnInvader('port'); const a = inside(G, G.boarding.invaders[0], 7, 19);
    me.mode = 'eva'; me.x = -3; me.y = 10;          // nobody aboard: it prowls, through unlocked doors too
    const rooms = new Set(); tickN(G, 60 * 60, () => rooms.add(G.roomAt(a.x, a.y)?.id));
    check([...rooms].filter(Boolean).length >= 2, `an unlocked door opens for an alien: it prowls from room to room (${[...rooms].filter(Boolean)})`);
  }
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    for (const q of G.DOORS) q.locked = true;        // security locked every door
    G.spawnInvader('port'); const a = inside(G, G.boarding.invaders[0], 7, 19);
    me.x = 27; me.y = 22; tickN(G, 60 * 12);
    check(G.roomAt(a.x, a.y)?.id === 'portLock' && d.open === 0, `with every door locked it stays in its room (${G.roomAt(a.x, a.y)?.name})`);
    const near = Math.hypot(a.x - (d.x + d.w / 2), a.y - (d.y + d.h / 2));
    const x0 = a.x, y0 = a.y; tickN(G, 60 * 3);
    check(near < 2.6 && Math.hypot(a.x - x0, a.y - y0) < 0.3, `it waits by the locked door towards you (${near.toFixed(1)} from it), keeping still (moved ${Math.hypot(a.x - x0, a.y - y0).toFixed(2)})`);
    check(d.open === 0, 'an alien can\'t override a locked door');
    G.DOORWAYS[2].locked = false;                    // unlocked again: it opens for the alien, and it comes for you
    let t = 0; for (; t < 15 && G.roomAt(a.x, a.y)?.id !== 'reactor'; t += DT) { G.simTick(DT); me.health = 'ok'; }
    check(G.roomAt(a.x, a.y)?.id === 'reactor', `unlocked, the door opens for it and it comes through (${t.toFixed(1)} s)`);
  }
  // --- pirates: a door opens for them like for anyone; a locked one they force (a manual override: humans), slowly
  for (const lockIt of [false, true]) {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    me.x = 37; me.y = 7; G.ITEMS.length = 0; G.power.reserve = 3;
    d.locked = lockIt;
    const p = { uid: G.newUid(), x: 9, y: 19.1, face: 0, walk: 0, hp: G.PIRATE_HP, carry: null, state: 'steal', cd: 99, aim: 0, route: [], stuck: 0, stun: 0, flash: 0 };
    G.dk.pirates.push(p);
    let t = 0, forcing = false;
    for (; t < 20 && d.open < 0.6; t += DT) { G.simTick(DT); p.cd = 99; if (p.pry >= 0 && d.pry > 0) forcing = true; }
    const need = G.DOOR_PRY_LOCKED;
    if (lockIt) check(forcing && t > need && t < need + 5, `a pirate forces a locked door: it stands at it (p.pry), the door gives after ${t.toFixed(1)} s (needs ${need} s)`);
    else check(!forcing && t < 15, `an unlocked door just opens for a pirate (${t.toFixed(1)} s from where it started), no forcing`);
    if (lockIt) check(!d.locked, '…and the lock is broken');
    for (t = 0; t < 10 && G.roomAt(p.x, p.y)?.id !== 'reactor'; t += DT) { G.simTick(DT); p.cd = 99; }
    check(G.roomAt(p.x, p.y)?.id === 'reactor', 'then it walks through');
  }
  {
    const G = fresh(), me = G.me, d = G.DOORWAYS[2];
    me.x = 37; me.y = 7; G.ITEMS.length = 0; G.power.reserve = 3; G.breachRoom('portLock');
    const p = { uid: G.newUid(), x: 9, y: 19.1, face: 0, walk: 0, hp: G.PIRATE_HP, carry: null, state: 'steal', cd: 99, aim: 0, route: [], stuck: 0, stun: 0, flash: 0 };
    G.dk.pirates.push(p);
    tickN(G, 60 * 15, () => { p.cd = 99; });
    check(d.open === 0 && G.roomAt(p.x, p.y)?.id === 'portLock', 'a pirate leaves a door with vacuum behind it alone (it waits)');
  }
  // --- the saboteur (no alien: a sneak in a suit) still slips through unlocked doors
  {
    const G = fresh(), R = (id) => G.ROOMS.find(r => r.id === id);
    check(G.roomLinkOpen(R('portLock'), R('reactor')) && G.roomLinkOpen(R('portLock'), R('portGun')), 'the saboteur passes shut, unlocked doors');
    G.DOORWAYS[2].locked = true;
    check(!G.roomLinkOpen(R('portLock'), R('reactor')), '…but not locked ones');
  }
  // --- multiplayer: the door state is in the snapshot
  {
    const G = loadGame(NAMES); G.netServer.init('c1'); G.netServer.addCrew(11, 'A');
    const [A] = G.crew, L = G.DECK_DOORS[1];
    A.x = L.x + L.w / 2; A.y = G.SPINE_Y1 + 0.6; G.DOORWAYS[1].locked = true; G.DOORWAYS[3].pry = 0.4;
    G.SYSTEMS.find(s => s.ref === G.DECK_DOORS[2]).broken = true; G.DECK_DOORS[2].jammed = true;
    tickN(G, Math.round((G.DOOR_DELAY + G.DOOR_TIME) / DT) + 4);
    const C = loadGame(NAMES); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 11);
    check(C.DECK_DOORS[1].open === 1 && C.DOORWAYS[1].locked && C.DOORWAYS[3].pry > 0.25 && C.DECK_DOORS[2].jammed, 'a browser gets every door\'s state: open, locked, pried, jammed');
    check(C.walkRects().includes(C.DECK_DOORS[1]) && !C.walkRects().includes(C.DECK_DOORS[0]), 'and walks (predicts) through the open ones only');
    check(C.DECK_DOORS[1].bolt === 0 && C.DECK_DOORS[0].bolt === 1, 'and the locks: the open door unbolted, the shut ones bolted');
    G.breachRoom('portGun'); tickN(G, 5); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 11);
    check(C.DOORWAYS[0].blast && C.DECK_DOORS[0].blast, 'the blast doors too');
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall door tests passed');
  process.exitCode = failed ? 1 : 0;
})();
