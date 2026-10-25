// Claims ("this one's mine", js/claims.js): clicking a sidebar plate claims it, again releases it, someone else's
// is taken over; claims end when the problem is gone or the claimant leaves; they travel in the snapshot (a
// browser sees who took what); custom task plates for the tutorial; the claimant's guide target; the plate grows
// a flag. Run: node tests/claims.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'tick', 'render', 'netServer', 'netSerialize', 'crew', 'mission', 'fires', 'spawnFire', 'combat', 'combatSpawn', 'combatClear',
  'SYSTEMS', 'crewTasks', 'claimEncounter', 'releaseEncounter', 'claimOf', 'claimsOf', 'addTaskPlate', 'updateTaskPlate', 'removeTaskPlate', 'taskPlate',
  'encounterPlates', 'claimTarget', 'withCrew', 'ITEMS', 'GUNS', 'startMission', 'me', 'sidePlates', 'leftPanelRects', 'HUD_H', 'sendCommand', 'REACTOR'];
const G = loadGame(NAMES);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (n) => { for (let i = 0; i < n; i++) G.simTick(DT); };

G.netServer.init('practice');
G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob'); G.netServer.addCrew(3, 'Cleo');
const [A, B] = G.crew;
G.spawnFire(5, 8); step(2);
const fire = G.fires[0], key = 'fire' + fire.uid;
check(fire.uid != null && G.encounterPlates().some(p => p.key === key), `a fire's plate is keyed by its simulation uid (${key})`);

// claiming by command (what a click sends), releasing, taking over
G.netServer.command(1, ['claim', key]); step(1);
check(G.claimOf(key) === 1 && G.encounterPlates().find(p => p.key === key).claim === 1, 'Alice clicks the plate: it is hers (and the plate says so)');
G.netServer.command(1, ['claim', key]); step(1);
check(G.claimOf(key) === null, 'Alice clicks it again: released');
G.netServer.command(1, ['claim', key]); G.netServer.command(2, ['claim', key]); step(1);
check(G.claimOf(key) === 2, "Bob clicks Alice's plate: he takes it over");
G.netServer.command(2, ['claim', 'fire999999']); G.netServer.command(2, ['claim', { evil: 1 }]); step(1);
check(G.claimOf('fire999999') === null && Object.keys(G.crewTasks.claims).length === 1, 'a plate that is not there (or junk) cannot be claimed');
check(!G.claimEncounter(key, 42) && G.claimOf(key) === 2, 'the API refuses a crew id that is not aboard');

// sync: a browser-side copy sees the claim, its uid key is the same, and the plate grows a flag there
const snap = JSON.parse(JSON.stringify(G.netSerialize()));
const C = loadGame(['netApply', 'crewTasks', 'claimOf', 'encounterPlates', 'fires', 'mission', 'tick', 'render', 'sidePlates', 'leftPanelRects', 'HUD_H', 'clientUpdate', 'claimTarget', 'me']);
C.netApply(snap, 1);
C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 1);   // (a second snapshot: fresh objects, the same keys)
const cp = C.encounterPlates().find(p => p.key === key);
check(cp && cp.claim === 2 && C.claimOf(key) === 2, `the browser gets the same key and the claim (${cp?.key} → crew ${cp?.claim})`);
for (let i = 0; i < 30; i++) { C.clientUpdate(DT); C.render(i * DT); }
check(C.sidePlates.get(key)?.cw > 30, `a claimed plate grows wider on the right for the flag (+${Math.round(C.sidePlates.get(key)?.cw || 0)} px)`);
check(C.leftPanelRects(C.HUD_H).some(r => r.w > 290), 'the wider plate counts for the panels the prompt keeps off');

// auto-release: the fire goes out → the claim ends (after a short grace)
G.fires.length = 0; step(10);
check(G.claimOf(key) === 2, 'a plate missing for a moment keeps its claim (one odd tick)');
step(40);
check(G.claimOf(key) === null, 'the fire is out: the claim is released');

// auto-release when the claimant leaves
G.combatSpawn('interceptor', 'port', true); step(2);
const e = G.combat.enemies[0], ek = 'enemy' + e.uid;
G.netServer.command(3, ['claim', ek]); step(1);
check(G.claimOf(ek) === 3, 'Cleo claims the interceptor');
G.netServer.removeCrew(3); step(1);
check(G.claimOf(ek) === null, 'Cleo leaves the game: her claim is gone');
G.claimEncounter(ek, 1); G.crew.splice(G.crew.indexOf(A), 1); step(1);
check(G.claimOf(ek) === null, '…also if a crew member vanishes some other way (checked every tick)');
G.netServer.addCrew(1, 'Alice'); const A2 = G.crew.find(c => c.id === 1);

// guidance: the claimant is sent to the cannon on the enemy's side
G.claimEncounter(ek, 2); B.mode = 'inside'; B.x = 22; B.y = 5;
const gt = G.withCrew(B, () => G.claimTarget(ek, B)), gun = G.GUNS.find(g => g.id === 'port');
check(gt && gt.x === gun.hatch[0] && /cannon/.test(gt.hint), `the claimant's arrow goes to the left cannon's ladder ("${gt?.hint}")`);
G.combatClear(); step(40);
check(G.claimOf(ek) === null, 'the interceptor is gone: released');

// a fire: the extinguisher first, then the fire
G.spawnFire(30, 8); step(2);
const f2 = G.fires[0], k2 = 'fire' + f2.uid;
G.claimEncounter(k2, 2); B.inv.weapon = null;
let t2 = G.claimTarget(k2, B);
check(t2 && /extinguisher/.test(t2.hint) && G.ITEMS.some(i => i.kind === 'extinguisher' && i.x === t2.x), `no extinguisher in hand: go get one first ("${t2?.hint}")`);
B.inv.weapon = 'extinguisher'; t2 = G.claimTarget(k2, B);
check(t2 && t2.x === f2.x && /Spray/.test(t2.hint), `with it: the fire itself ("${t2?.hint}")`);
B.inv.weapon = null; G.fires.length = 0; step(40);

// custom task plates (the tutorial's)
let done = false;
G.addTaskPlate({ key: 'tut-fuel', title: 'FUEL CELL', sub: 'load one into the reactor', icon: 'jump', owner: 1,
  targets: [{ x: G.REACTOR.x, y: G.REACTOR.y + 1.7, hint: 'Click the reactor with a fuel cell' }, { x: 2, y: 22 }], done: () => done });
step(20);
const tp = G.encounterPlates().find(p => p.key === 'tut-fuel');
check(tp && tp.title === 'FUEL CELL' && tp.claim === 1, 'a custom plate shows up in the sidebar, given to its owner');
A2.mode = 'inside'; A2.x = 22; A2.y = 16;
const ct = G.claimTarget('tut-fuel', A2);
check(ct && ct.x === G.REACTOR.x && ct.hint === 'Click the reactor with a fuel cell', `its target (the nearest of them) and hint ("${ct?.hint}")`);
const snap2 = JSON.parse(JSON.stringify(G.netSerialize()));
C.netApply(snap2, 1);
check(C.encounterPlates().some(p => p.key === 'tut-fuel' && p.claim === 1) && C.claimTarget('tut-fuel', C.me)?.x === G.REACTOR.x, 'custom plates and their targets travel in the snapshot (no functions in it)');
G.updateTaskPlate('tut-fuel', { sub: 'nearly there' });
check(G.taskPlate('tut-fuel').sub === 'nearly there', 'updateTaskPlate changes its text');
G.netServer.command(2, ['claim', 'tut-fuel']); step(1);
check(G.claimOf('tut-fuel') === 2, 'custom plates can be claimed / taken over like any other');
done = true; step(1);
check(!G.taskPlate('tut-fuel') && G.claimOf('tut-fuel') === null && !G.encounterPlates().some(p => p.key === 'tut-fuel'), 'its done() check removes it (and its claim)');
G.addTaskPlate({ key: 'tut-x', title: 'X', targets: [] }); step(60);
check(!!G.taskPlate('tut-x'), 'without done(), it stays…');
G.removeTaskPlate('tut-x');
check(!G.taskPlate('tut-x'), '…until removeTaskPlate');

// a new mission starts clean; the profile never sees claims
G.spawnFire(5, 8); step(2); G.claimEncounter('fire' + G.fires[0].uid, 2);
G.startMission('practice');
check(!Object.keys(G.crewTasks.claims).length && !G.crewTasks.custom.length, 'a new mission: no claims, no task plates');

// solo: a click on a plate (the browser's own) claims it for you
const S = loadGame(['tick', 'render', 'startMission', 'spawnFire', 'fires', 'sidePlates', 'claimOf', 'me', 'localInput', 'mission']);
S.startMission('practice'); S.spawnFire(5, 8);
for (let i = 0; i < 90; i++) { S.tick(DT); S.render(i * DT); }
const sk = 'fire' + S.fires[0].uid, sp = S.sidePlates.get(sk);
S.localInput.mouse.x = 12 + 100; S.localInput.mouse.y = sp.y + 20;
const L = S.localInput.mouse; L.down = true; L.click = true;
S.tick(DT);
check(S.claimOf(sk) === S.me.id, 'solo: clicking the fire\'s plate claims it for you');

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall claim checks passed');
