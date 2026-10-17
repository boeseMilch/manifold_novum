// The tutorial's step machine, driven headlessly: gates, the windshield (a miss gives the shot back),
// the block lesson (a hit that gets through loops, does no damage, costs no shots), out of energy → the
// reactor, the lever demo, lock LEFT only while the interceptor lives, the fire on climbing out (both
// branches; it never spreads), the repair, the overview, and the free roam after it (saved, nothing
// ends it, only the player leaves). Run: node tests/tutorial.js
const { loadGame } = require('./harness');
const NAMES = ['tut', 'tutGo', 'tutorialNext', 'tutorialClient', 'tutorialAllows', 'startTutorial', 'me', 'GUNS', 'combat', 'CAPACITORS', 'power', 'simTick',
  'fires', 'mission', 'SYSTEMS', 'ITEMS', 'LEVER', 'REACTOR', 'FUEL_CRATE', 'hitPoi', 'enemyToWorld', 'openDiagnosis', 'radarScan', 'clickTarget', 'withCrew', 'SHOTS_PER_ENERGY',
  'SHIELD_BUTTONS', 'roomAt', 'tutLeave', 'tutEscapeAsks'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const maintOf = (G) => { const e = G.mission.events.find(e => e.kind === 'maintenance'); return { target: e.sys, decoy: e.decoy }; };

// helpers
const skip = (G) => { for (let n = 0; G.tut.msg && !G.tut.msg.waitFor && n < 100; n++) G.tutorialNext(); };
const one = (G) => { const m = G.tut.msg; for (let n = 0; G.tut.msg === m && m && n < 50; n++) G.tutorialNext(); };   // just this message
const page = (G) => G.tut.msg ? G.tut.msg.pages[G.tut.msg.i].text : '';
const allText = (G) => G.tut.msg ? G.tut.msg.pages.map(p => p.text).join(' ') : '';
function tickUntil(G, cond, secs = 10) {               // (stops at a message: the game is paused then)
  for (let i = 0; i < secs * 60 && !G.tut.msg && !cond(); i++) G.simTick(DT);
  return cond();
}
const msgUntil = (G, secs = 10) => tickUntil(G, () => !!G.tut.msg, secs);
function clickAt(G, x, y) {
  const m = G.me.input.mouse; m.wx = x; m.wy = y; m.click = true; m.down = true;
  G.simTick(DT); m.down = false; m.click = false;
}
function runTarget(G, x, y) {                          // a click on (x, y), as the gate sees it
  const t = G.withCrew(G.me, () => G.clickTarget(x, y));
  if (!t?.run || !G.tutorialAllows('target', t)) return false;
  G.withCrew(G.me, () => t.run()); return true;
}
const foe = (G) => G.combat.enemies.find(e => e.kind === 'interceptor' && e.phase === 'fighting');
const port = (G) => G.GUNS.find(g => g.id === 'port');
const brokenNow = (G) => G.SYSTEMS.filter(s => s.broken).map(s => s.name);
function climbLeft(G) {
  const g = port(G); Object.assign(G.me, { mode: 'inside', gun: null, x: g.hatch[0], y: g.hatch[1] - 0.3 });
  clickAt(G, g.hatch[0], g.hatch[1]);
}
function holdFire(G, secs) { G.me.input.keys.add('Space'); tickUntil(G, () => false, secs); G.me.input.keys.delete('Space'); }

// From the start to the 'kill' step (blocking the first shot right away when quick, else via one failed block).
function toKill(G, controls, failBlock) {
  G.mission.active = false; G.startTutorial(controls);
  check(G.tut.step === 'welcome' && !!G.tut.msg, `${controls}: the tutorial opens with the welcome message`);
  check(/Rapid Assistance & Interplanetary Defense Enterprise Resources/.test(allText(G)) && /corporation/.test(allText(G)), `${controls}: …RAIDER, spelled out`);
  skip(G);
  check(G.tut.step === 'helm', `${controls}: then the helm`);
  check(G.tutorialAllows('target', { run: G.openDiagnosis }) && !G.tutorialAllows('target', { run: G.radarScan }), 'gate: only the helm works now (not the radar)');
  check(!G.tutorialAllows('fire') && !G.tutorialAllows('reload') && !G.tutorialAllows('debug') && !G.tutorialAllows('closePanel'), 'gate: no firing, reloading, debug menu, panel closing');
  Object.assign(G.me, { x: 22.2, y: -0.9 }); clickAt(G, 22.2, -1.9);
  check(G.me.ui.panel === 'diagnosis' && !!G.tut.msg, 'clicking the helm opens the diagnosis, and the explanation');
  const m = maintOf(G);
  check(/irregular readings/.test(allText(G)) && allText(G).includes(m.target.name.toLowerCase()) && allText(G).includes(m.decoy.name.toLowerCase()), '…naming the two yellow systems');
  skip(G); G.me.input.pressed.add('Escape'); G.simTick(DT);
  check(!G.me.ui.panel && !!G.tut.msg, 'Esc closes the panel; on to the radar');
  skip(G);
  Object.assign(G.me, { x: 22.2, y: 7.4 }); clickAt(G, 22.2, 6.4);
  check(G.tut.msg && /pirate interceptor/.test(allText(G)) && G.mission.revealed.size === 1 && !/scan twice/i.test(allText(G)), 'the first scan finds the interceptor');
  skip(G);
  tickUntil(G, () => false, 40);
  check(!foe(G), 'it doesn\'t arrive on its own while you walk');
  climbLeft(G);
  const g = port(G), e = foe(G);
  check(G.me.mode === 'gun' && !!e && e.side === 'port', 'climbing into the left cannon spawns it on the left');
  check(g.shots === 1 && G.CAPACITORS[0].charge === 1 && G.power.lever.jammed && G.power.lever.pos === 1 && G.power.reactor.fuel === 0, 'one shot loaded, one energy left, lever wedged on MID, empty cell');
  skip(G);
  check(G.tut.step === 'shoot1' && G.tutorialAllows('fire') && !G.tutorialAllows('reload') && !G.tutorialAllows('climbDown'), 'shoot step: only firing');
  // a miss gives the shot back
  g.aim = g.a + 1.2; holdFire(G, 0.1); msgUntil(G, 4);
  check(G.tut.msg && /Missed/.test(page(G)) && g.shots === 0, 'a miss: a kind message');
  skip(G);
  check(g.shots === 1, '…and the shot comes back');
  G.hitPoi(e, e.pois.find(p => p.id === 'cable'), e.x, e.y); G.simTick(DT);
  check(!e.pois.find(p => p.id === 'cable').hit, 'other weak spots are repaired at once (only the windshield counts)');
  const crack = e.pois.find(p => p.id === 'crack');
  G.hitPoi(e, crack, ...G.enemyToWorld(e, ...crack.c)); msgUntil(G, 3);
  check(G.tut.step === 'advantage' && /duct-taping/.test(allText(G)) && /Weapon cable/.test(allText(G)) && /Engine cooling/.test(allText(G)), 'windshield hit: the advantages, with the interceptor\'s weak spots');
  skip(G);
  check(G.tut.step === 'reload' && G.tutorialAllows('reload') && !G.tutorialAllows('fire'), 'then: reload (only)');
  G.me.input.pressed.add('KeyR'); G.simTick(DT);
  check(g.reload > 0 && G.CAPACITORS[0].charge === 0, 'the reload takes the last energy');
  tickUntil(G, () => G.tut.step === 'block', 6);
  g.aim = Math.atan2(e.y - g.y, e.x - g.x);               // (pointing at it: the plate goes up in front of the cannon)
  check(G.tut.step === 'block' && g.shots === G.SHOTS_PER_ENERGY && crack.hit, 'reloaded; the windshield stays hit');
  msgUntil(G, 6);
  check(G.tut.msg?.waitFor && /cover plate/.test(page(G)), 'the shot is mid-air: paused, the cover lesson');
  check(G.combat.shots.length === 1 && G.tut.msg.pages[0].mark(), '…with the shot still there (and marked)');
  G.tutorialNext();
  check(!!G.tut.msg, 'Next doesn\'t close it: only the cover does');
  const key = controls === 'keyboard' ? 'ShiftLeft' : null;
  check(page(G).includes(controls === 'keyboard' ? 'Shift' : 'right mouse'), `…and it names the ${controls} control`);
  const hold = () => { if (key) G.me.input.keys.add(key); else G.me.input.mouse.right = true; };
  const release = () => { if (key) G.me.input.keys.delete(key); else G.me.input.mouse.right = false; };
  if (failBlock) {
    hold(); G.tutorialClient(DT);
    check(!G.tut.msg, 'holding the cover unpauses');
    release(); msgUntil(G, 4);
    check(G.tut.msg && /got through/.test(allText(G)) && /hurt/.test(allText(G)) && /fire/.test(allText(G)), 'let go too early: the shot gets through, damage is explained');
    check(G.me.health === 'ok' && G.combat.hits.crew === 0 && !G.fires.length && !brokenNow(G).length, '…and it did nothing to you or the ship');
    check(g.shots === G.SHOTS_PER_ENERGY, '…and cost no shots');
    skip(G);
    check(G.tut.step === 'block', 'then the block lesson again');
    msgUntil(G, 6);
    check(G.tut.msg?.waitFor && /Again/.test(page(G)), 'second shot: paused again');
  }
  hold(); G.tutorialClient(DT); msgUntil(G, 4); release();
  check(G.tut.msg && /Blocked/.test(allText(G)) && G.me.health === 'ok', 'held: blocked');
  skip(G);
  check(G.tut.step === 'kill' && G.tutorialAllows('fire') && G.tutorialAllows('cover'), 'then: hit the other blue spots');
  return { g, e };
}

// --- mouse; the block fails once; out of energy → reactor → lock LEFT → kill → fire → repair → overview
{
  const G = loadGame(NAMES);
  const glob = G.tutorialNext.constructor('return this')();          // the game's global: a storage, and a stand-in for the page reload
  const store = {}; let left = 0;
  glob.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  glob.backToLobby = () => { left++; };
  const { g, e } = toKill(G, 'mouse', true);
  g.aim = g.a + 1.2; holdFire(G, 3); msgUntil(G, 3);
  check(G.tut.msg && /out of shots/i.test(allText(G)) && /reactor/.test(allText(G)) && foe(G), 'three misses: out of energy, go check the reactor');
  skip(G);
  check(G.tut.step === 'toReactor' && G.tutorialAllows('climbDown') && !G.tutorialAllows('fire'), 'reactor step: climb down');
  tickUntil(G, () => false, 10);
  check(!G.fires.length && !brokenNow(G).length && G.me.health === 'ok', 'the interceptor fires on, harmlessly');
  G.me.input.pressed.add('KeyE'); G.simTick(DT);
  check(G.me.mode === 'inside' && !G.fires.length, 'climbed down (no fire: the interceptor is still alive)');
  Object.assign(G.me, { x: 22.2, y: 16.6 }); msgUntil(G, 1);
  check(G.tut.msg && /empty/.test(allText(G)), 'in the reactor room: the cell is empty');
  skip(G);
  Object.assign(G.me, { x: 18.8, y: 19.0 });
  check(runTarget(G, G.FUEL_CRATE.x, G.FUEL_CRATE.y) && G.me.inv.item === 'fuel', 'take a fuel cell');
  Object.assign(G.me, { x: 20.0, y: 17.4 });
  check(runTarget(G, G.REACTOR.x, G.REACTOR.y) && G.power.reactor.fuel > 0, 'load it');
  msgUntil(G, 1);
  check(/bolt/.test(allText(G)) && /wrench/.test(allText(G)), 'energy explained: bolts, the lever, the wrench');
  skip(G);
  Object.assign(G.me, { x: 22.2, y: 21.9 });
  check(G.power.lever.jammed && runTarget(G, G.LEVER.x, G.LEVER.y) && !G.power.lever.jammed, 'pull the wrench out');
  msgUntil(G, 1); skip(G);
  check(G.tut.step === 'cycle', 'the lever demo');
  const seen = new Set([G.power.lever.pos]);
  for (let i = 0; i < 20 * 60 && !G.tut.msg; i++) { G.simTick(DT); seen.add(G.power.lever.pos); }
  check(seen.size === 3 && G.tut.msg && /LEFT/.test(allText(G)) && /lock/i.test(allText(G)), 'it cycles through all three outputs, then: lock it on LEFT (the interceptor lives)');
  skip(G);
  check(G.tut.step === 'lockLeft', 'lock LEFT step');
  for (let n = 0; n < 4 && G.power.lever.pos !== 0; n++) runTarget(G, G.LEVER.x + 0.4, G.LEVER.y);
  check(G.power.lever.pos === 0 && runTarget(G, G.LEVER.x, G.LEVER.y) && G.power.lever.jammed, 'turned to LEFT and wedged');
  msgUntil(G, 1); skip(G);
  check(G.tut.step === 'toCannon2', 'back to the cannon');
  climbLeft(G);
  check(G.tut.step === 'kill2', 'in the cannon again');
  const charge0 = G.CAPACITORS[0].charge;
  tickUntil(G, () => G.CAPACITORS[0].charge > charge0, 15);
  check(G.CAPACITORS[0].charge > charge0, 'the left capacitor gets energy (fast)');
  for (const p of e.pois) if (!p.hit) G.hitPoi(e, p, e.x, e.y);
  msgUntil(G, 3);
  check(G.tut.msg && /destroyed/.test(allText(G)), 'interceptor destroyed');
  skip(G);
  check(G.tut.step === 'exitCannon' && !G.fires.length, 'climb down…');
  G.me.input.pressed.add('KeyE'); G.simTick(DT);
  const lc = G.SYSTEMS.find(s => s.ref === port(G));
  check(G.fires.length === 1 && G.fires[0].sys === lc && G.fires[0].tame, '…and the fire starts at the left cannon as you climb out');
  msgUntil(G, 2);
  check(/BOOM/.test(allText(G)) && /spread/.test(allText(G)) && /extinguisher/.test(allText(G)), 'the fire explained (a late hit, spreading, the extinguisher)');
  skip(G);
  check(G.tut.step === 'extinguish' && G.tutorialAllows('weapon') && G.tutorialAllows('target', { text: 'Click: take the fire extinguisher' }) && !G.tutorialAllows('target', { text: 'Click: take the repair kit' }), 'extinguish: only the extinguisher');
  tickUntil(G, () => false, 90);
  check(G.fires.length === 1 && G.fires[0].hp === 1 && !brokenNow(G).length, 'the tutorial fire never spreads, burns out or goes out on its own');
  G.fires[0].hp = 0; msgUntil(G, 2);
  check(G.tut.msg && /out/.test(allText(G)), 'put out');
  one(G);
  const t = maintOf(G).target;
  check(G.tut.step === 'repair' && t.broken && brokenNow(G).length === 1 && /irregular readings/.test(allText(G)), 'repair: the irregular one breaks (the reactor is done)');
  skip(G);
  const b = G.SHIELD_BUTTONS.find(b => b.side === 'port'); Object.assign(G.me, { x: b.x, y: b.y + 0.8 });
  msgUntil(G, 3);
  check(G.tut.msg && /Broken/.test(allText(G)) && /repair kit/.test(allText(G)), 'trying it: it\'s broken; get the repair kit');
  skip(G);
  check(G.tutorialAllows('target', { repair: t }) && G.tutorialAllows('target', { text: 'Click: take the repair kit' }), 'fix: the kit and the repair are allowed');
  t.broken = false; msgUntil(G, 1);
  check(/Repaired/.test(allText(G)), 'repaired');
  one(G);
  check(G.tut.step === 'overview' && G.tut.msg && /laser gun/.test(allText(G)) && /spacewalk/.test(allText(G)) && /security console/.test(allText(G)) && /jump/.test(allText(G)), 'the overview of the rest');
  one(G);
  check(G.tut.step === 'end' && G.tut.done && /coming soon/.test(allText(G)), 'the end: more modules coming soon');
  check(store['mn-tutorial-done'] === '1', 'the training is saved the moment it ends (before any roaming)');
  // free roam: nothing kicks you out, everything works, only the player leaves
  check(/BACK TO MENU/.test(allText(G)) && G.tut.msg.button && !/LOBBY/.test(G.tut.msg.button), 'the last message: explore, no "back to the lobby"');
  skip(G);
  check(G.tut.step === 'roam' && !G.tut.msg && G.tut.on && left === 0, 'closing it: free roam (not back to the menu)');
  check(['fire', 'reload', 'cover', 'climbDown', 'closePanel', 'weapon', 'drop'].every(w => G.tutorialAllows(w)) && G.tutorialAllows('target', { run: G.radarScan }) && G.tutorialAllows('target', { text: 'Click: take the repair kit' }), 'every gate is open');
  const scan0 = G.mission.scanT;
  Object.assign(G.me, { mode: 'inside', gun: null, x: 22.2, y: 7.4 }); G.simTick(DT); clickAt(G, 22.2, 6.4);
  check(G.mission.scanT > scan0, 'stations work (a radar scan)');
  const x0 = G.me.x; G.me.input.keys.add('KeyD'); tickUntil(G, () => false, 1); G.me.input.keys.delete('KeyD');
  check(G.me.x > x0 + 0.5, 'you can walk');
  climbLeft(G);
  check(G.me.mode === 'gun', 'and climb into a cannon…');
  G.me.input.pressed.add('KeyE'); G.simTick(DT);
  check(G.me.mode === 'inside', '…and out again');
  let t0 = G.mission.t;
  for (let i = 0; i < 10 * 60 * 60; i++) {               // 10 minutes, wandering about
    if (i % 600 === 0) { G.me.input.keys.clear(); G.me.input.keys.add(['KeyW', 'KeyA', 'KeyS', 'KeyD'][(i / 600) % 4]); }
    G.simTick(DT);
  }
  G.me.input.keys.clear();
  check(G.mission.t - t0 > 599 && G.mission.active && !G.mission.over && !G.mission.jump && G.tut.step === 'roam' && !G.tut.msg && left === 0, '10 minutes later: still roaming (no jump, no end, no message)');
  check(!G.combat.enemies.length, '…and nothing attacked');
  G.me.input.pressed.add('Escape'); G.simTick(DT);
  check(G.tutEscapeAsks() && !G.tut.ask && left === 0, 'Esc with nothing open: asks first (the browser shows the confirm)');
  G.me.ui.panel = 'radar';
  check(!G.tutEscapeAsks(), '…but with a panel open, Esc just closes the panel');
  G.me.ui.panel = null;
  G.tutLeave();
  check(left === 1, 'BACK TO MENU: back to the menu');
}

// --- keyboard; the interceptor dies in the first fight: climbing out starts nothing, the reactor comes first
// (no lock LEFT), and only then the fire
{
  const G = loadGame(NAMES); const { e } = toKill(G, 'keyboard', false);
  for (const p of e.pois) if (!p.hit) G.hitPoi(e, p, e.x, e.y);
  msgUntil(G, 3);
  check(G.tut.msg && /destroyed/.test(allText(G)) && /empty/.test(allText(G)), 'killed in the first fight (but the capacitor is empty)');
  skip(G);
  check(G.tut.step === 'toReactor', 'reactor step');
  G.me.input.pressed.add('KeyE'); G.simTick(DT);
  check(G.me.mode === 'inside' && G.fires.length === 0, 'climbing out starts no fire (the reactor comes first)');
  Object.assign(G.me, { x: 22.2, y: 16.6 }); msgUntil(G, 1); skip(G);
  Object.assign(G.me, { x: 18.8, y: 19.0 }); runTarget(G, G.FUEL_CRATE.x, G.FUEL_CRATE.y);
  Object.assign(G.me, { x: 20.0, y: 17.4 }); runTarget(G, G.REACTOR.x, G.REACTOR.y);
  msgUntil(G, 1);
  check(/hold E/.test(allText(G)), 'keyboard texts: hold E at the lever');
  skip(G);
  Object.assign(G.me, { x: 22.2, y: 21.9 }); runTarget(G, G.LEVER.x, G.LEVER.y);
  msgUntil(G, 1); skip(G);
  msgUntil(G, 20);
  check(G.tut.msg && !/lock it on/i.test(allText(G)) && !G.fires.length, 'demo done: no lock-LEFT (it\'s dead already), no fire yet');
  skip(G);
  check(G.tut.step === 'fire' && G.fires.length === 1 && G.fires[0].sys === G.SYSTEMS.find(s => s.ref === port(G)), 'after the reactor: the fire at the left cannon');
  msgUntil(G, 2); skip(G);
  G.fires[0].hp = 0; msgUntil(G, 2);
  check(/out/.test(allText(G)) && !/reactor room/.test(allText(G)), 'fire out (no second trip to the reactor)');
  one(G);
  check(G.tut.step === 'repair' && maintOf(G).target.broken, 'then the repair');
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
