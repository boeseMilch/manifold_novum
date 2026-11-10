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

// --- every arrow points at the spot its job is done at: for each kind of claimable job, the claimant goes where the
// arrow says and clicks (or uses the repair kit) exactly there, and that starts the job. (2026-11-10: the breach's
// arrow pointed at the inside of the hole, where a click tapes a tarp; the jump's at the helm, 1.6 from the handle;
// the gravity one at the room's middle; the plasma fire's at the fire.)
{
  const NAMES2 = ['simTick', 'me', 'startMission', 'mission', 'hz', 'withCrew', 'inv', 'ui', 'clickTarget', 'repairPick', 'claimTarget', 'claimEncounter', 'encounterPlates', 'fires', 'igniteSystem',
    'SYSTEMS', 'ITEMS', 'GRAV_PANELS', 'VENT_PANELS', 'BREACH_SPOTS', 'JUMP_HANDLE', 'POWER_LINES', 'CAPACITORS', 'power', 'LEVER', 'HATCHES', 'GUNS', 'combat', 'combatSpawn', 'boarding', 'spawnInvader', 'PLATE_CRATES', 'LEVER_NAMES'];
  const setup = () => { const H = loadGame(NAMES2); H.startMission('c7'); H.mission.events.forEach(e => { e.done = true; }); H.simTick(DT); Object.assign(H.me, { mode: 'inside', health: 'ok' }); return H; };
  // me, standing next to the arrow's spot, in the right place for it (out on the hull for a spot outside)
  const go = (H, key, mode = 'inside') => {
    H.me.mode = mode;
    const t = H.claimTarget(key, H.me);
    if (t) Object.assign(H.me, { x: t.x + 0.5, y: t.y + 0.6 });
    return t;
  };
  const click = (H, t) => H.withCrew(H.me, () => H.clickTarget(t.x, t.y));
  const kit = (H, t) => H.withCrew(H.me, () => H.repairPick(t.x, t.y, true));
  const give = (H, weapon, item = null) => H.withCrew(H.me, () => { H.inv.weapon = weapon; H.inv.item = item; });
  const has = (H, key) => H.encounterPlates().some(p => p.key === key);
  const d = (t, x, y) => Math.hypot(t.x - x, t.y - y);

  { // hull breach: plate crate → out to the hole's outside spot → plate on → nail it down
    const H = setup(), room = 'portGun', key = 'breach' + room, S = H.BREACH_SPOTS[room];
    H.hz.breaches.push({ room, t: 0 }); H.hz.tape = 3;
    check(has(H, key), 'a hull breach has a plate to claim');
    give(H, 'repair'); let t = go(H, key);
    let c = click(H, t); c?.run?.();
    check(H.PLATE_CRATES.some(q => d(t, q.x, q.y) < 0.01) && H.me.inv.item === 'plate', `breach, no plate in hand: the arrow is on a plate crate, a click there takes one ("${t.hint}")`);
    H.me.x = 3; H.me.y = 10; t = H.claimTarget(key, H.me);
    const port = H.HATCHES.find(h => h.side === 'port');
    check(t.via && d(t, ...port.inside) < 0.01, `breach, plate and kit in hand, inside: out through the airlock on the hole's side ("${t.hint}")`);
    t = go(H, key, 'eva'); c = click(H, t);
    check(d(t, ...S.out) < 0.01 && /hull plate over the hole/.test(c?.text || '') && c.ok, `out there the arrow is on the hole's outside spot, a click holds the plate over it ("${c?.text}")`);
    const tape = H.hz.tape; c.run();
    check(H.hz.breaches[0].plated && H.hz.tape === tape, '…the plate is on, no duct tape spent');
    t = go(H, key, 'eva'); const k = kit(H, t);
    check(d(t, ...S.out) < 0.01 && k?.hold?.id === 'weld' + room, `plated: the arrow stays there, the repair kit nails it down ("${t.hint}")`);
    // a tarped breach: the lasting fix is the same
    const b = H.hz.breaches[0]; b.plated = false; b.tarp = true; give(H, 'repair', 'plate');
    t = go(H, key, 'eva'); c = click(H, t);
    check(d(t, ...S.out) < 0.01 && c?.ok && !!c.run, 'a tarped breach: the arrow leads to the same spot outside (plate over the tarp)');
  }
  { // the bridge's hole is at the nose: whichever airlock makes the shorter trip
    const H = setup(); H.hz.breaches.push({ room: 'bridge', t: 0 }); give(H, 'repair', 'plate');
    const side = (x) => { H.me.x = x; H.me.y = 20; return H.HATCHES.find(h => d(H.claimTarget('breachbridge', H.me), ...h.inside) < 0.01)?.side; };
    check(side(6) === 'port' && side(38) === 'star', `a job at the nose: out through the airlock nearer to you (${side(6)}, ${side(38)})`);
    // an outside job on the right: the right airlock, wherever you are (it was: the airlock nearest to you)
    const em = H.SYSTEMS.find(q => q.kind === 'emitter' && q.ref.side === 'star'); H.hz.breaches.length = 0; em.broken = true; give(H, 'repair');
    const sides = [[10, 8], [20, 18], [21.9, 5], [30, 18]].map(([x, y]) => { H.me.x = x; H.me.y = y; const t = H.claimTarget('broken', H.me); return H.HATCHES.find(h => d(t, ...h.inside) < 0.01)?.side; });
    check(sides.every(q => q === 'star'), `the right shield emitter broken: out through the right airlock from anywhere (${sides.join(', ')})`);
    const t = go(H, 'broken', 'eva'), k = kit(H, t);
    check(k?.repair === em, 'out there the arrow is on the emitter and the kit repairs it');
    Object.assign(H.me, { mode: 'eva', x: 46, y: 15 }); em.broken = false; H.SYSTEMS.find(q => q.name === 'Reactor').broken = true;
    const back = H.claimTarget('broken', H.me);
    check(back.via && d(back, ...H.HATCHES.find(h => h.side === 'star').outside) < 0.01, `outside on the right, the job inside: back in through the right airlock ("${back.hint}")`);
  }
  { // the jump handle (and, with the middle capacitor empty, the lever's handle, not its hub)
    const H = setup(); H.mission.jump = { t: 0, st: 0, fails: 0 }; H.CAPACITORS[1].charge = 1;
    check(has(H, 'jump'), 'the spooling jump drive has a plate to claim');
    let t = go(H, 'jump'), c = click(H, t);
    check(c?.hold?.id === 'jumpHandle', `jump: a click at the arrow pulls the handle ("${t.hint}" → "${c?.text}")`);
    H.hz.breaches.push({ room: 'bridge', t: 0 }); H.hz.tape = 0;
    check(click(H, t)?.hold?.id === 'jumpHandle', '…also with the bridge holed and no tape left');
    H.hz.breaches.length = 0; H.mission.jump.pull = 99; H.CAPACITORS[1].charge = 0; H.power.bolts.length = 0;
    for (const pos of [0, 2]) {
      H.power.lever.pos = pos; H.power.lever.jammed = false;
      t = go(H, 'jump'); c = click(H, t);
      check(/turn lever to/.test(c?.text || '') && c.ok, `jump, MID empty, lever on ${H.LEVER_NAMES[pos]}: a click at the arrow turns the lever ("${c?.text}")`);
    }
    H.power.lever.jammed = true; t = go(H, 'jump'); c = click(H, t);
    check(/pull the wrench out/.test(c?.text || ''), `…wedged on the wrong output: the arrow is on the hub, a click pulls the wrench ("${c?.text}")`);
  }
  { // gravity breakers and arcing lines: the repair kit's jobs
    const H = setup(); give(H, 'repair');
    H.hz.noGrav = Object.keys(H.GRAV_PANELS);
    const badG = Object.keys(H.GRAV_PANELS).filter(id => { const t = go(H, 'grav' + id); return !(has(H, 'grav' + id) && kit(H, t)?.hold?.id === 'grav' + id); });
    check(!badG.length, `no gravity, all ${Object.keys(H.GRAV_PANELS).length} rooms: the kit at the arrow resets that room's breaker${badG.length ? ' — not: ' + badG : ''}`);
    H.hz.noGrav = []; H.hz.surges = H.POWER_LINES.map(l => l.id);
    const badS = H.POWER_LINES.map(l => l.id).filter(id => { const t = go(H, 'surge' + id); return !(has(H, 'surge' + id) && kit(H, t)?.hold?.id === 'splice' + id); });
    check(!badS.length, `power surge, all ${H.POWER_LINES.length} lines: the kit at the arrow splices that line${badS.length ? ' — not: ' + badS : ''}`);
    give(H, null); H.hz.surges = [H.POWER_LINES[0].id];
    const t = go(H, 'surge' + H.POWER_LINES[0].id), c = click(H, t); c?.run?.();
    check(H.me.inv.weapon === 'repair', `without the kit: the arrow is on the repair kit, a click takes it ("${t.hint}")`);
  }
  { // a plasma fire: the room's vent panel; a plain fire: the extinguisher, then the fire
    for (const [room, v] of Object.entries(setup().VENT_PANELS)) {
      const H = setup(), cap = H.SYSTEMS.filter(q => q.kind === 'capacitor').sort((a, b) => Math.hypot(a.x - v[0], a.y - v[1]) - Math.hypot(b.x - v[0], b.y - v[1]))[0];
      H.igniteSystem(cap, true);
      const f = H.fires[0], key = 'fire' + f.uid, t = go(H, key), c = click(H, t);
      c?.run?.();
      check(f.plasma && has(H, key) && d(t, ...v) < 0.01 && H.me.ui.mini?.kind === 'pin' && H.me.ui.mini.room === room, `plasma fire at the ${cap.name.toLowerCase()}: a click at the arrow opens that room's vent panel ("${t.hint}")`);
    }
    const H = setup(); H.igniteSystem(H.SYSTEMS.find(q => q.name === 'Reactor'));
    const f = H.fires[0], key = 'fire' + f.uid;
    let t = go(H, key), c = click(H, t); c?.run?.();
    check(H.me.inv.weapon === 'extinguisher', `a fire, empty hands: the arrow is on an extinguisher, a click takes it ("${t.hint}")`);
    t = H.claimTarget(key, H.me);
    check(d(t, f.x, f.y) < 0.01 && /Spray/.test(t.hint), 'with it: the fire itself, to spray at');
  }
  { // broken and failing parts inside: the kit at the arrow works on that part
    const H = setup(); give(H, 'repair');
    const s = H.SYSTEMS.find(q => q.name === 'Left capacitor'); s.broken = true;
    let t = go(H, 'broken'), k = kit(H, t);
    check(k?.repair === s && !k.service, 'a broken part: the kit at the arrow repairs it');
    s.broken = false;
    const f = H.SYSTEMS.find(q => q.name === 'Right capacitor');
    H.mission.events.push({ id: 99, kind: 'maintenance', t: H.mission.t + 5, t1: H.mission.t + 5, sys: f, decoy: s, serviced: false, done: false, radar: false });
    const key = 'failing' + f.name; t = go(H, key); k = kit(H, t);
    check(has(H, key) && k?.repair === f && k.service, 'a failing part: the kit at the arrow services it');
  }
  { // enemies: the ladder of the cannon on their side (E there climbs in); boarders: the laser gun, then the boarder
    const H = setup(); H.combatSpawn('interceptor', 'star', true); H.simTick(DT);
    const e = H.combat.enemies[0], key = 'enemy' + e.uid, t = H.claimTarget(key, H.me), g = H.GUNS.find(q => q.id === 'star');
    Object.assign(H.me, { x: t.x, y: t.y + 0.3 });
    const i = H.me.input; i.keys.add('KeyE'); i.pressed.add('KeyE'); H.simTick(DT); i.keys.delete('KeyE'); H.simTick(DT);
    check(d(t, ...g.hatch) < 0.01 && H.me.mode === 'gun' && H.me.gun === g, `an enemy on the right: the arrow is on the right cannon's ladder, E there climbs in ("${t.hint}")`);
    const t2 = H.claimTarget(key, H.me);
    check(t2 && d(t2, e.x, e.y) < 0.01, 'in the cannon: the arrow is on the enemy');
    const B = setup(); B.spawnInvader('port', null, false);
    const a = B.boarding.invaders[0]; Object.assign(a, { state: 'hunt', mode: 'inside', x: 10, y: 20 });
    const ik = 'inv' + a.uid; let ti = go(B, ik), c = click(B, ti); c?.run?.();
    check(B.me.inv.weapon === 'laser', `an intruder, no gun: the arrow is on the laser gun, a click takes it ("${ti.hint}")`);
    ti = B.claimTarget(ik, B.me);
    check(d(ti, a.x, a.y) < 0.01, 'armed: the arrow is on the intruder');
    a.state = 'cloak';
    check(B.claimTarget(ik, B.me) === null, 'a cloaked saboteur gets no arrow (nobody knows where it is)');
  }
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall claim checks passed');
