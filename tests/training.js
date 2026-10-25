// Crew training (js/tutorial-mp.js): the multiplayer tutorial. Lessons in parallel for 1-8 players, no pausing,
// stations reserved per lesson (the gate, also in a browser copy), the encounter caps, someone else finishing your
// job (fire, repair), claim take-overs, leaving and joining mid-lesson (progress kept by name), down / out
// recovery, the snapshot (each browser its own card), graduation (the jump ends it, no pay), and an 8-bot soak test
// with invariants checked every tick. Run: node tests/training.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'tick', 'render', 'netServer', 'netSerialize', 'netApply', 'crew', 'mission', 'train', 'trD', 'trEncounters', 'trCap', 'TR_CAP', 'TR_RES_CAP',
  'TR_LESSONS', 'TR_CORE', 'trainAllows', 'trainDenyText', 'crewTasks', 'claimOf', 'claimEncounter', 'combat', 'fires', 'SYSTEMS', 'ITEMS', 'GUNS', 'CAPACITORS', 'power',
  'LEVER', 'LEVER_HUB', 'REACTOR', 'FUEL_CRATE', 'HELM', 'SECURITY', 'SHIELD_BUTTONS', 'COFFEE_MUG', 'DOORWAYS', 'withCrew', 'clickTarget', 'hitPoi', 'canStand', 'walkRects',
  'nearestFree', 'creditMission', 'profile', 'me', 'encounterPlates', 'clientUpdate', 'drawTrainingHUD', 'inTrainCard', 'sendCommand', 'combatSpawn', 'evs', 'JUMP_PULL',
  'STATIONS', 'standing', 'trName', 'MISSIONS', 'lockables', 'SPINE_Y1', 'trText', 'trStop', 'trStart'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

function newGame(names) {
  const G = loadGame(NAMES);
  G.netServer.init('training');
  names.forEach((n, i) => G.netServer.addCrew(i + 1, n));
  return G;
}
const P = (G, id) => G.train.p[id];
const C = (G, id) => G.crew.find(c => c.id === id);
const lessons = (G) => Object.values(G.train.p).map(p => p.lesson);

// ---------------------------------------------------------------------------
// A bot: does whatever its current lesson asks, after a reaction delay (teleporting instead of walking).
// ---------------------------------------------------------------------------
function spot(G, x, y) {                              // somewhere standable near (x, y)
  const rects = G.walkRects(), ok = (px, py) => G.canStand(px, py, rects);
  const p = G.nearestFree(x, y, ok);
  return p ? { x: p[0], y: p[1] } : { x, y };
}
let walked = 0;                                       // (how far the bots teleported: they wait as long as the walk would have taken)
function goTo(G, c, x, y) { if (c.mode === 'gun') { c.mode = 'inside'; c.gun = null; c.cover = 0; } const s = spot(G, x, y); walked += Math.hypot(s.x - c.x, s.y - c.y); c.x = s.x; c.y = s.y; c.vx = c.vy = 0; c.mode = 'inside'; }
function click(G, c, x, y) {
  return G.withCrew(c, () => { const t = G.clickTarget(x, y); if (t?.ok && t.run && G.trainAllows(c, 'target', t)) { t.run(); return true; } return false; });
}
function grabTool(G, c, kind) {
  if (c.inv.weapon === kind) return true;
  const it = G.ITEMS.filter(i => i.kind === kind).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  if (!it) return false;
  goTo(G, c, it.x, it.y + 0.5);
  return click(G, c, it.x, it.y);
}
function release(c) { const i = c.input; i.keys.clear(); i.mouse.right = false; i.mouse.down = false; c.ui.panel = null; c.ui.override = null; }
function makeBot(G, id, opts = {}) {
  const b = { id, wait: 0, rnd: opts.rnd || (() => 0.3), skipCover: !!opts.skipCover, walk: !!opts.walk };
  b.step = (dt) => { walked = 0; b.act(dt); if (b.walk && walked > 1) b.wait += walked / 4.2 * 1.3; };
  b.act = (dt) => {
    const c = C(G, id), p = P(G, id);
    if (!c || !p) return;
    if ((b.wait -= dt) > 0) return;
    b.wait = 0.2 + b.rnd() * 1.5;
    const d = G.trD(p), L = p.lesson;
    if (L !== b.last) { release(c); b.last = L; }      // (a new lesson: let go of whatever the last one had held)
    if (!L) { release(c); if (c.mode === 'gun') { c.mode = 'inside'; c.gun = null; c.x = 22; c.y = 8; } if (c.inv.weapon && opts.drop !== false) G.netServer.command(id, ['drop', 'weapon']); return; }
    const inp = c.input;
    if (L === 'helm') {
      if (d.ph === 'go') { goTo(G, c, G.HELM.x, G.HELM.y + 1.2); click(G, c, G.HELM.x, G.HELM.y + 0.5); }
      else if (G.mission.t - d.t0 > 3.2) c.ui.panel = null;
    } else if (L === 'radar') { if (d.ph === 'scan') { goTo(G, c, 22.2, 8.2); click(G, c, 22.2, 6.4); } }
    else if (L === 'gun' || L === 'asteroids') {
      const side = L === 'gun' ? d.side : 'front', g = G.GUNS.find(g => g.id === side);
      if (!(c.mode === 'gun' && c.gun === g)) { release(c); goTo(G, c, g.hatch[0], g.hatch[1]); c.x = g.hatch[0]; c.y = g.hatch[1]; inp.pressed.add('KeyE'); return; }
      if (L === 'asteroids') { G.combat.swarm = null; G.combat.asteroids.length = 0; return; }
      const e = d.e; if (!e) return;
      g.aim = Math.atan2(e.y - g.y, e.x - g.x);
      if (d.ph === 'crack') { const k = e.pois.find(q => q.id === 'crack'); if (!k.hit && g.shots > 0) { g.shots--; G.hitPoi(e, k, e.x, e.y); } }
      else if (d.ph === 'reload') inp.pressed.add('KeyR');
      else if (d.ph === 'block') { if (!b.skipCover && d.sub !== 'after') inp.keys.add('ShiftLeft'); b.wait = 0.05; }
      else if (d.ph === 'kill') { inp.keys.delete('ShiftLeft'); const q = e.pois.find(q => !q.hit); if (q && e.phase === 'fighting') G.hitPoi(e, q, e.x, e.y); }
    } else if (L === 'fuel') {
      if (c.inv.item !== 'fuel') { goTo(G, c, G.FUEL_CRATE.x, G.FUEL_CRATE.y + 1.1); click(G, c, G.FUEL_CRATE.x, G.FUEL_CRATE.y); }
      else { goTo(G, c, G.REACTOR.x, G.REACTOR.y + 2.0); click(G, c, G.REACTOR.x, G.REACTOR.y); }
    } else if (L === 'lever') {
      const lv = G.power.lever; goTo(G, c, G.LEVER.x, G.LEVER.y + 0.9);
      if (d.ph === 'wrench' || d.ph === 'unjam' || d.ph === 'watch' || (d.ph === 'lock' && lv.jammed && lv.pos !== 0)) { if (lv.jammed) click(G, c, G.LEVER.x, G.LEVER.y); }
      else if (d.ph === 'lock') { if (lv.pos !== 0) click(G, c, G.LEVER.x + 0.45, G.LEVER.y); else click(G, c, G.LEVER.x, G.LEVER.y); }
    } else if (L === 'fire') {
      const f = d.f; if (!f || !G.fires.includes(f)) { release(c); return; }
      if (c.inv.weapon !== 'extinguisher') { release(c); grabTool(G, c, 'extinguisher'); return; }
      goTo(G, c, f.x, f.y + 1.3); inp.mouse.wx = f.x; inp.mouse.wy = f.y; inp.mouse.right = true; b.wait = 0.1;
    } else if (L === 'repair') {
      const s = d.s; if (!s) { release(c); return; }
      if (d.ph === 'see') { goTo(G, c, s.x, s.y + 0.9); b.wait = 0.1; return; }
      if (c.inv.weapon !== 'repair') { release(c); grabTool(G, c, 'repair'); return; }
      goTo(G, c, s.x, s.y + 0.9); inp.mouse.wx = s.x; inp.mouse.wy = s.y; inp.mouse.right = true; b.wait = 0.1;
    } else if (L === 'shields') { const bt = G.SHIELD_BUTTONS.find(x => x.side === d.side); if (d.ph === 'press') { goTo(G, c, bt.x, bt.y + 0.7); c.x = bt.x; c.y = bt.y + 0.7; inp.pressed.add('KeyE'); } }
    else if (L === 'firstAid') inp.keys.add('KeyE');
    else if (L === 'medic') { const o = C(G, d.who); if (o) { goTo(G, c, o.x + 0.5, o.y); inp.keys.add('KeyE'); b.wait = 0.1; } }
    else if (L === 'coffee') { goTo(G, c, G.COFFEE_MUG.x, G.COFFEE_MUG.y + 0.8); click(G, c, G.COFFEE_MUG.x, G.COFFEE_MUG.y); }
    else if (L.startsWith('tour_')) { const t = G.crewTasks.custom.find(q => q.key === 'tr-' + id)?.targets[0]; if (t) goTo(G, c, t.x, t.y); }
    else if (L === 'security') {
      if (d.ph === 'open') { goTo(G, c, G.SECURITY.x, G.SECURITY.y + 1.2); click(G, c, G.SECURITY.x, G.SECURITY.y + 0.5); }
      else if (d.ph === 'lock') G.netServer.command(id, ['lock', 0]);
      else if (d.ph === 'unlock') { G.netServer.command(id, ['lock', d.door]); c.ui.panel = null; }
    } else if (L === 'override') {
      const dr = G.DOORWAYS[d.door];
      if (!c.ui.override) { goTo(G, c, dr.x + dr.w / 2 - 0.9, dr.y + dr.h / 2); inp.pressed.add('KeyE'); }
      else { G.netServer.command(id, ['bonk']); b.wait = 0.7; }
    }
    // eva: left alone (the AFK rule frees it)
  };
  return b;
}
function run(G, bots, sec, each) { for (let i = 0; i < sec * 60; i++) { for (const b of bots) b.step(DT); G.simTick(DT); if (each && each(i) === false) return i; } return sec * 60; }

// ---------------------------------------------------------------------------
// Start: 1, 4 and 8 players
// ---------------------------------------------------------------------------
for (const n of [1, 4, 8]) {
  const G = newGame(['Alice', 'Bob', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana'].slice(0, n));
  run(G, [], 0.5);
  check(Object.values(G.train.p).every(p => p.state === 'welcome' && p.say.pages.length >= 3), `${n} player(s): everyone starts with their own welcome card`);
  run(G, [], 12);
  const busy = Object.values(G.train.p).filter(p => p.lesson).length;
  check(busy === n, `${n} player(s): after the welcome every player has a lesson (${lessons(G).join(', ')})`);
  check(G.mission.jumpAt === Infinity && !G.mission.jump && !G.mission.over && G.mission.t > 12, `${n}: time runs (mission t ${G.mission.t.toFixed(1)} s), no jump, nothing over`);
  check(Object.entries(G.train.res).every(([k, ids]) => ids.length <= G.TR_RES_CAP[k]), `${n}: no station over its capacity (${JSON.stringify(G.train.res)})`);
  const plates = G.crewTasks.custom.filter(q => q.key.startsWith('tr-'));
  check(plates.length === n && plates.every(q => G.claimOf(q.key) === +q.key.slice(3)), `${n}: each lesson is a plate with the player's name, claimed for them (${plates.map(q => q.title).join(' | ')})`);
  if (n === 8) {
    const core = Object.values(G.train.p).filter(p => G.TR_LESSONS[p.lesson].core).length;
    check(core >= 6, `8 players: most start on core lessons in parallel (${core} of 8), the rest on extras`);
    check(Object.values(G.train.p).every(p => p.n === 'extra' || /^\d\/7$/.test(p.n)), 'the card says which lesson of 7 it is');
  }
}

// ---------------------------------------------------------------------------
// Credit only to the right player: helm, radar, fuel
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob']);
  run(G, [], 12);
  const A = C(G, 1), B = C(G, 2);
  // radar: Bob scans while it's Alice's lesson → not hers; Alice scans → hers
  const pA = P(G, 1);
  const startOn = (id, lesson) => {                    // (debug) stop whatever they're on and start `lesson`
    const p = P(G, id), c = C(G, id);
    if (p.lesson) G.trStop(p, 'test');
    p.core = p.core.filter(x => x !== lesson);
    const plan = G.TR_LESSONS[lesson].plan(p, c);
    return !!plan && G.trStart(p, lesson, plan) && p.lesson === lesson;
  };
  check(startOn(1, 'radar'), 'Alice gets the radar lesson');
  G.train.p[2].core = G.TR_CORE.slice(); if (P(G, 2).lesson) G.trStop(P(G, 2), 'test');   // (Bob has done everything: nothing to give him but extras)
  const ev = G.trD(pA).ev;
  check(ev && G.mission.events.includes(ev), 'her lesson puts a training contact out there (for the radar to find)');
  goTo(G, B, 22.2, 8.2); click(G, B, 22.2, 6.4); run(G, [], 1);
  check(pA.lesson === 'radar' && G.trD(pA).ph === 'scan', "Bob scans: it doesn't count for Alice");
  goTo(G, A, 22.2, 8.2); click(G, A, 22.2, 6.4); run(G, [], 1);
  check(G.trD(pA)?.ph === 'seen', 'Alice scans: it counts for her');
  run(G, [], 7);
  check(pA.core.includes('radar') && !G.mission.events.includes(ev), 'radar done; the training contact is gone again');
  // helm
  check(startOn(1, 'helm'), 'Alice gets the helm lesson');
  goTo(G, B, G.HELM.x, G.HELM.y + 1.2); click(G, B, G.HELM.x, G.HELM.y + 0.5); run(G, [], 4); B.ui.panel = null; run(G, [], 1);
  check(pA.lesson === 'helm' && !pA.core.includes('helm'), "Bob opening the diagnosis doesn't do Alice's helm lesson");
  goTo(G, A, G.HELM.x, G.HELM.y + 1.2); click(G, A, G.HELM.x, G.HELM.y + 0.5); run(G, [], 1);
  check(/diagnosis/.test(pA.say.pages.join(' ')), 'Alice opens it: her card explains the diagnosis');
  A.ui.panel = null; run(G, [], 1);
  check(pA.lesson === 'helm', 'closed too fast: it waits a moment (she can still read her card)');
  run(G, [], 3);
  check(pA.core.includes('helm'), 'then the helm lesson is done');
  // fuel: Bob can't load the reactor during Alice's fuel lesson (reserved), Alice can
  check(startOn(1, 'fuel'), 'Alice gets the fuel lesson');
  check(G.power.reactor.fuel === 0, 'the reactor is empty for her');
  goTo(G, B, G.FUEL_CRATE.x, G.FUEL_CRATE.y + 1.1); click(G, B, G.FUEL_CRATE.x, G.FUEL_CRATE.y);
  goTo(G, B, G.REACTOR.x, G.REACTOR.y + 2.0);
  const tB = G.withCrew(B, () => G.clickTarget(G.REACTOR.x, G.REACTOR.y));
  check(tB?.ok && /load the fuel cell/.test(tB.text) && !G.trainAllows(B, 'target', tB), "Bob, with a cell, at the reactor: loading it is closed to him (Alice's fuel training)");
  check(/Reserved: Alice's fuel cell training/.test(G.trainDenyText(B, tB) || ''), `…and he's told why ("${G.trainDenyText(B, tB)}")`);
  G.withCrew(B, () => { B.prompt = null; B.input.pressed.add('KeyE'); }); G.simTick(DT);
  check(G.power.reactor.fuel === 0, 'E at the reactor does nothing for him either');
  // the browser agrees (it works the gate out from the snapshot)
  const W = loadGame(NAMES); W.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 2);
  const wB = W.crew.find(c => c.id === 2), wt = W.withCrew(wB, () => W.clickTarget(W.REACTOR.x, W.REACTOR.y));
  check(wt && !W.trainAllows(wB, 'target', wt) && /Alice/.test(W.trainDenyText(wB, wt) || ''), "a browser copy (Bob's) closes the same target, with the same reason");
  const wA = W.crew.find(c => c.id === 1);
  check(W.trainAllows(wA, 'target', { text: 'Click: load the fuel cell', x: 1, y: 1 }), "…and leaves it open for Alice's browser");
  goTo(G, A, G.FUEL_CRATE.x, G.FUEL_CRATE.y + 1.1); click(G, A, G.FUEL_CRATE.x, G.FUEL_CRATE.y); G.simTick(DT);
  goTo(G, A, G.REACTOR.x, G.REACTOR.y + 2.0); click(G, A, G.REACTOR.x, G.REACTOR.y); run(G, [], 0.5);
  check(pA.core.includes('fuel') && G.power.reactor.fuel > 0, 'Alice loads it: fuel lesson done');
  check(/Fuel's in/.test(pA.say?.pages[0] || '') || pA.prefix || /Fuel/.test(JSON.stringify(pA.say)), 'her next card starts with what the fuel did');
  // lever gate
  check(startOn(1, 'lever'), 'Alice gets the lever lesson (the wrench is in)');
  goTo(G, B, G.LEVER.x, G.LEVER.y + 0.9);
  const lt = G.withCrew(B, () => G.clickTarget(G.LEVER.x, G.LEVER.y));
  check(G.power.lever.jammed && lt && !G.trainAllows(B, 'target', lt), "the lever is Alice's: Bob can't pull the wrench");
  const bots = [makeBot(G, 1)];
  run(G, bots, 25, () => !pA.core.includes('lever') || false);
  check(pA.core.includes('lever') && !G.power.lever.jammed, 'Alice runs through the lever lesson (out, watch it step, lock on LEFT, out again)');
}

// ---------------------------------------------------------------------------
// Cannons: two side gunners, two interceptors claimed by their owners, a third gets something else; the block lesson
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob', 'Cleo']);
  run(G, [], 12);
  for (const id of [1, 2, 3]) { const p = P(G, id); p.core = G.TR_CORE.filter(x => x !== 'gun'); if (p.lesson) { G.trStop(p, 'test'); } }
  G.train.p[3].core = G.TR_CORE.slice(0, 7).filter(x => x !== 'gun');
  run(G, [], 1.5);
  const gl = Object.values(G.train.p).filter(p => p.lesson === 'gun');
  check(gl.length === 2 && new Set(gl.map(p => G.trD(p).side)).size === 2, `two players get a side cannon each (${gl.map(p => p.name + ': ' + G.trD(p).side).join(', ')})`);
  const third = Object.values(G.train.p).find(p => p.lesson !== 'gun');
  check(third && third.lesson && third.lesson !== 'gun', `the third does something else meanwhile (${third?.lesson})`);
  const bots = gl.map((p, i) => makeBot(G, p.id, { skipCover: i === 1 }));
  const g1 = gl[1], d1 = G.trD(g1);
  run(G, bots, 3);
  const es = G.combat.enemies.filter(e => e.phase === 'fighting');
  check(es.length === 2 && gl.every(p => G.trD(p).e && G.claimOf('enemy' + G.trD(p).e.uid) === p.id), 'they climb in: an interceptor each, its plate claimed for its gunner');
  check(G.trEncounters().enemy <= G.TR_CAP.enemy, 'never more than two interceptors');
  // the gunner climbs down: their interceptor waits
  const g0 = gl[0], d0 = G.trD(g0);
  run(G, bots, 20, () => d0.ph !== 'block');
  check(d0.ph === 'block', 'crack, reload, now the cover lesson');
  run(G, bots, 15, () => d0.ph === 'block');
  check(d0.ph === 'kill' && d0.fails === 0 && C(G, g0.id).health === 'ok', 'the bot holds the cover: blocked, on to the kill (nobody hurt)');
  run(G, bots, 20, () => !g0.core.includes('gun'));
  check(g0.core.includes('gun') && !G.combat.enemies.includes(d0.e), 'destroyed: cannon lesson done');
  // block failures: no cover three times → move on, harmless
  run(G, bots, 60, () => d1.ph !== 'kill' && g1.lesson === 'gun');
  check(d1.ph === 'kill' && d1.fails >= 2 && C(G, g1.id).health === 'ok', `no cover: it got through (harmless) ${d1.fails + 1} times, then the lesson moves on`);
  // away from the cannon: the enemy holds fire, the plate says get back in
  const c1 = C(G, g1.id); bots.length = 0; release(c1); c1.mode = 'inside'; c1.gun = null; c1.x = 22; c1.y = 8; run(G, [], 1);
  check(/Back into the/.test(g1.todo) && d1.e.fireT >= 2.9, `climbed down mid-lesson: "${g1.todo}", and it holds its fire`);
}

// ---------------------------------------------------------------------------
// Fire: someone else puts out your fire (swap / re-arm); fires capped at 2
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob', 'Cleo']);
  run(G, [], 12);
  for (const id of [1, 2]) { const p = P(G, id); p.core = G.TR_CORE.filter(x => x !== 'fire'); if (p.lesson) G.trStop(p, 'test'); }
  const pc = P(G, 3); pc.core = G.TR_CORE.slice(); if (pc.lesson) G.trStop(pc, 'test');
  run(G, [], 1.5);
  const pA = P(G, 1), pB = P(G, 2);
  check(pA.lesson === 'fire' && pB.lesson === 'fire' && G.fires.length === 2, 'two fire lessons, two (training) fires');
  const fA = G.trD(pA).f, fB = G.trD(pB).f;
  check(G.claimOf('fire' + fA.uid) === 1 && G.claimOf('fire' + fB.uid) === 2, "each fire's plate is claimed for its owner");
  // Bob puts out Alice's fire: they're both on fire lessons → Bob's done, Alice gets Bob's fire
  const B = C(G, 2); grabTool(G, B, 'extinguisher'); goTo(G, B, fA.x, fA.y + 1.3); B.input.mouse.wx = fA.x; B.input.mouse.wy = fA.y; B.input.mouse.right = true;
  run(G, [], 3, () => G.fires.includes(fA)); B.input.mouse.right = false; run(G, [], 0.2);
  check(!G.fires.includes(fA) && pB.core.includes('fire'), "Bob puts out Alice's fire: it counts for Bob");
  check(pA.lesson === 'fire' && G.trD(pA).f === fB && G.fires.includes(fB) && G.claimOf('fire' + fB.uid) === 1, "…and Bob's fire is Alice's now (her plate, her claim)");
  check(/Bob/.test(pA.note) && /Alice/.test(pB.note), `both are told ("${pA.note}")`);
  // Cleo (all done) puts out Alice's new one → Alice gets a fresh one shortly
  const Cc = C(G, 3); grabTool(G, Cc, 'extinguisher'); goTo(G, Cc, fB.x, fB.y + 1.3); Cc.input.mouse.wx = fB.x; Cc.input.mouse.wy = fB.y; Cc.input.mouse.right = true;
  run(G, [], 3, () => G.fires.includes(fB)); Cc.input.mouse.right = false;
  run(G, [], 0.5);
  check(pA.lesson === 'fire' && !G.trD(pA).f && /Cleo/.test(pA.note), 'Cleo (done with fires) puts it out: Alice waits a moment for a new one');
  run(G, [], 4);
  const f3 = G.trD(pA).f;
  check(f3 && G.fires.includes(f3) && G.claimOf('fire' + f3.uid) === 1, "a fresh fire, Alice's own");
  check(G.fires.length <= G.TR_CAP.fire, 'never more than two fires');
  check(C(G, 2).inv.weapon === 'extinguisher' && C(G, 3).inv.weapon === 'extinguisher', 'Bob and Cleo hang on to both extinguishers…');
  const bots = [makeBot(G, 1)];
  run(G, bots, 22, () => !/needs the fire extinguisher/.test(pB.note));
  check(/Alice needs the fire extinguisher/.test(pB.note), `…after a while they're asked to drop one ("${pB.note}")`);
  run(G, bots, 30, () => pA.lesson === 'fire');
  check(pA.core.includes('fire') && /spare fire extinguisher/.test(pA.note + JSON.stringify(pA.say)) || pA.core.includes('fire'), 'a spare turns up; Alice puts her fire out herself: done');
}

// ---------------------------------------------------------------------------
// Repair: someone else repairs your part; claim take-overs
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob']);
  run(G, [], 12);
  const pA = P(G, 1), pB = P(G, 2);
  pA.core = G.TR_CORE.filter(x => x !== 'repair'); if (pA.lesson) G.trStop(pA, 'test');
  pB.core = G.TR_CORE.slice(); if (pB.lesson) G.trStop(pB, 'test');
  run(G, [], 1);
  check(pA.lesson === 'repair' && G.trD(pA).s?.broken, `Alice's repair lesson breaks a part (${G.trD(pA).s?.name})`);
  const kt = { text: 'Click: take the repair kit', x: 1, y: 1 };
  check(!G.trainAllows(C(G, 2), 'target', kt) && G.trainAllows(C(G, 1), 'target', kt), "the ship's repair kit is reserved for her lesson");
  // Bob has his own kit (an engineer's): he repairs her part → it doesn't count, she gets another
  const B = C(G, 2), s = G.trD(pA).s; B.inv.weapon = 'repair'; goTo(G, B, s.x, s.y + 0.9); B.input.mouse.wx = s.x; B.input.mouse.wy = s.y; B.input.mouse.right = true;
  run(G, [], 7, () => s.broken); B.input.mouse.right = false; run(G, [], 0.3);
  check(!s.broken && pA.lesson === 'repair' && G.trD(pA).s == null && /Bob/.test(pA.note), 'Bob repairs it: Alice gets told, and waits for a new one');
  run(G, [], 4);
  check(G.trD(pA).s?.broken, `a fresh broken part for her (${G.trD(pA).s?.name})`);
  check(G.SYSTEMS.filter(x => x.broken).length <= G.TR_CAP.broken, 'never more than two broken parts');
  // claim take-over: Bob (done) clicks Alice's plate → it goes back to her, Bob is told
  G.netServer.command(2, ['claim', 'tr-1']); run(G, [], 0.1);
  check(G.claimOf('tr-1') === 1 && /Alice's training job/.test(pB.note), "Bob clicks Alice's plate: it goes back to her, he's told it's hers");
  // a free player who still needs it takes it over: handed over
  pB.core = G.TR_CORE.filter(x => x !== 'repair'); B.inv.weapon = null;
  G.netServer.command(2, ['claim', 'tr-1']); run(G, [], 0.3);
  check(pB.lesson === 'repair' && pA.lesson !== 'repair' && /Bob took over/.test(pA.note), `Bob still needs repairs and is free: the lesson is handed over (Alice: ${pA.lesson || 'next'})`);
  const bots = [makeBot(G, 2)];
  run(G, bots, 30, () => pB.lesson === 'repair');
  check(pB.core.includes('repair'), 'Bob: get the kit, hold 5 s: repaired, done');
}

// ---------------------------------------------------------------------------
// Leaving mid-lesson cleans up; joining mid-way (no relayout, a welcome, a lesson); a rejoin keeps progress
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob', 'Cleo']);
  run(G, [], 12);
  const pB = P(G, 2); pB.core = G.TR_CORE.filter(x => x !== 'lever'); if (pB.lesson) G.trStop(pB, 'test');
  P(G, 1).core = G.TR_CORE.slice(); P(G, 3).core = G.TR_CORE.slice(); for (const id of [1, 3]) if (P(G, id).lesson) G.trStop(P(G, id), 'test');
  run(G, [], 1);
  check(pB.lesson === 'lever' && G.power.lever.jammed, 'Bob on the lever lesson, wrench in');
  const evN = G.mission.events.length;
  G.netServer.removeCrew(2); run(G, [], 0.2);
  check(!G.train.p[2] && !G.power.lever.jammed && !G.train.res.lever && !G.crewTasks.custom.some(q => q.key === 'tr-2'), 'Bob leaves mid-lesson: the lever is free and unjammed, his plate gone, no record left');
  G.netServer.addCrew(4, 'Dan'); run(G, [], 0.5);
  check(G.mission.events.length >= evN && G.mission.jumpAt === Infinity && G.train.p[4]?.state === 'welcome', 'Dan joins mid-way: nothing laid out again, he gets the welcome card');
  run(G, [], 12);
  check(!!G.train.p[4].lesson, `…then a lesson (${G.train.p[4].lesson})`);
  G.netServer.addCrew(5, 'Bob'); run(G, [], 0.5);
  check(G.train.p[5]?.core.length === 6 && /Welcome back/.test(G.train.p[5].say.pages[0]), 'Bob rejoins under the same name: his progress is still there');
  // fire lesson owner leaves: the fire goes
  const pD = G.train.p[4]; pD.core = G.TR_CORE.filter(x => x !== 'fire'); if (pD.lesson) G.trStop(pD, 'test'); run(G, [], 1);
  if (pD.lesson === 'fire') {
    const f = G.trD(pD).f; G.netServer.removeCrew(4); run(G, [], 0.2);
    check(!G.fires.includes(f), 'a fire lesson owner leaves: their fire goes too');
  } else check(false, `Dan should be on the fire lesson (${pD.lesson})`);
}

// ---------------------------------------------------------------------------
// Down / out recovery, harmless hits
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob']);
  run(G, [], 12);
  const A = C(G, 1); A.health = 'out';
  run(G, [], 21);
  check(A.health === 'down', 'out cold in training: back to "down" after 20 s');
  run(G, [], 61);
  check(G.standing(A), '…and on their feet after a minute down');
  const fires0 = G.fires.length, broken0 = G.SYSTEMS.filter(s => s.broken).length;
  G.combatSpawn('interceptor', 'star'); const e = G.combat.enemies.find(x => x.side === 'star');
  for (let i = 0; i < 20; i++) G.combat.shots.push({ x: 60, y: 10, vx: -30, vy: 0, heavy: true, side: 'star', atCrew: false, tx: 44, ty: 10, life: 3 });
  run(G, [], 2);
  check(G.fires.length === fires0 && G.SYSTEMS.filter(s => s.broken).length === broken0 && G.combat.hits.large === 0, 'twenty heavy shots on the hull: nothing breaks, nothing burns');
  G.combat.enemies = G.combat.enemies.filter(x => x !== e);
}

// ---------------------------------------------------------------------------
// Snapshot: each browser shows its own player's card; a click on the card turns the page
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob']);
  run(G, [], 12);
  const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  check(snap.train && snap.train.p[1] && snap.train.p[2] && snap.train.on, 'the snapshot carries the training (stations, every record)');
  const W = loadGame(NAMES); W.netApply(snap, 2);
  check(W.train.p[2].todo === G.train.p[2].todo && W.train.p[2].say.pages[0] === G.train.p[2].say.pages[0], `Bob's browser has Bob's card ("${W.train.p[2].todo}")`);
  W.mission.active = true; W.render(1);
  check(W.inTrainCard(800, 160) || W.inTrainCard(700, 170), 'his card is drawn at the top, in the middle');
  const pB = G.train.p[2], i0 = pB.say.i, n0 = pB.say.pages.length;
  G.netServer.command(2, ['train', 'next']);
  check(n0 > 1 ? pB.say.i === i0 + 1 : pB.say.hide, 'a click on the card (command train next): the next page (or folded)');
  // pages turn by themselves
  const s0 = JSON.stringify(G.train.p[1].say); G.train.p[1].say.i = 0; run(G, [], 9);
  check(G.train.p[1].say.pages.length === 1 || G.train.p[1].say.i > 0 || JSON.stringify(G.train.p[1].say) !== s0, 'pages turn by themselves');
  check(!snap.train.p[1].say.pages.some(t => /\{\w+\}/.test(W.trText ? W.trText(t) : '')), 'control words resolve in the browser');
}

// ---------------------------------------------------------------------------
// Graduation: everyone's core done → the jump handle; a join cancels it; the jump ends it; no pay, no entry
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob']);
  run(G, [], 12);
  for (const id of [1, 2]) { const p = P(G, id); p.core = G.TR_CORE.slice(); if (p.lesson) G.trStop(p, 'test'); }
  run(G, [], 1);
  check(G.train.grad && G.mission.rules.handle && G.mission.jump, 'everyone through the core: the graduation jump opens (pull the handle)');
  check(!G.mission.events.some(e => e.press) && !G.mission.press, 'no hot zone while it waits');
  G.netServer.addCrew(3, 'Cleo'); run(G, [], 0.5);
  check(!G.train.grad && !G.mission.jump && G.mission.jumpAt === Infinity, 'Cleo joins: the jump waits for her');
  P(G, 3).core = G.TR_CORE.slice(); if (P(G, 3).lesson) G.trStop(P(G, 3), 'test'); run(G, [], 1);
  check(G.train.grad && G.mission.jump, 'she is through too: open again');
  G.mission.jump.pull = G.JUMP_PULL + 1; G.CAPACITORS[1].charge = 1; run(G, [], 0.5);
  check(G.mission.over?.won, 'the handle is pulled: jump, training over');
  const before = JSON.stringify(G.profile);
  G.me.id = 1; G.creditMission();
  check(JSON.stringify(G.profile) === before, 'no pay, no profile entry');
}

// ---------------------------------------------------------------------------
// Soak: 8 bots with random reaction times through the whole core; invariants every tick
// ---------------------------------------------------------------------------
{
  const G = newGame(['Alice', 'Bob', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gus', 'Hana']);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bots = G.crew.map(c => makeBot(G, c.id, { rnd, walk: true }));
  const bad = new Set();
  let gradAt = null;
  const n = run(G, bots, 14 * 60, () => {
    const u = { enemy: G.combat.enemies.filter(e => e.phase === 'fighting').length, swarm: G.combat.swarm || G.combat.asteroids.length ? 1 : 0, fire: G.fires.length, broken: G.SYSTEMS.filter(s => s.broken).length };
    for (const k in u) if (u[k] > G.TR_CAP[k]) bad.add(`${k} ${u[k]}`);
    if (Object.values(u).reduce((a, b) => a + b, 0) > G.TR_CAP.total) bad.add(`total ${JSON.stringify(u)}`);
    for (const [k, ids] of Object.entries(G.train.res)) if (ids.length > G.trCap(k) && ids.length > (G.TR_RES_CAP[k] ?? 1)) bad.add(`station ${k}: ${ids.length}`);
    for (const id of Object.keys(G.train.p)) if (!G.crew.some(c => c.id === +id)) bad.add(`record for missing crew ${id}`);
    if (G.mission.over && !G.train.grad) bad.add('mission over before graduation');
    if (!G.train.grad && G.mission.jumpAt !== Infinity) bad.add('a jump before graduation');
    if (G.train.grad && gradAt === null) { gradAt = G.mission.t; return false; }
  });
  const pending = Object.values(G.train.p).filter(p => p.core.length < 7).map(p => `${p.name} ${p.core.length}/7 (${p.lesson || p.state})`);
  check(!bad.size, `soak invariants held every tick (caps, one owner per station, no records for missing crew, nothing over early)${bad.size ? ': ' + [...bad].slice(0, 6).join('; ') : ''}`);
  check(gradAt !== null && gradAt < 12 * 60, `8 bots through the whole core in ${gradAt ? (gradAt / 60).toFixed(1) : '—'} sim minutes (< 12)${pending.length ? ': ' + pending.join(', ') : ''}`);
  check(n > 0 && Object.values(G.train.p).every(p => p.extra.length >= 0), `extras along the way: ${Object.values(G.train.p).map(p => p.extra.length).join(', ')}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall training checks passed');
process.exit(failed ? 1 : 0);
