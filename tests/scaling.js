// Pacing: every mission lasts MISSION_LENGTH to the jump; the crew size sets how many encounters
// (MISSIONS[id].crew.events, essential ones never dropped, optional ones in DROP_ORDER) and fuel cells
// (crew.cells); the reactor follows the gaps (ENERGY_TIME × gap / written gap × crew.reactor). Joining /
// leaving: a rebuild in the lead-in, else the count stays and the remaining gaps change. Then:
// tools/balance.js (its timelines and its energy runs agree with the game) rates every mission.
// Run: node tests/scaling.js
const { loadGame } = require('./harness');
const NAMES = ['crewSize', 'paceFactor', 'missionCrew', 'selectEvents', 'MISSION_LENGTH', 'DROP_ORDER', 'ESSENTIAL_KINDS', 'crew', 'makeCrew', 'startMission', 'mission', 'simTick', 'power',
  'MISSIONS', 'CAMPAIGN', 'SKIRMISH', 'JUMP_DELAY', 'finaleLead', 'ENERGY_TIME', 'CELL_ENERGY', 'reactorSpeed', 'netServer', 'combat', 'missionRequirements', 'SHIP_UPGRADES', 'shapedTimes'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// A fresh game with n crew aboard at mission start (same random seed: same written timeline).
function withCrew(n, id = 'intro', seed = 7, ship = {}) {
  const G = loadGame(NAMES);
  while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  const keep = Math.random; Math.random = mulberry(seed);
  try { G.startMission(id, { ship }); } finally { Math.random = keep; }
  return G;
}
const calm = (G) => { G.combat.enemies = []; };
const G0 = loadGame(NAMES), L = G0.MISSION_LENGTH, ALL = [...G0.SKIRMISH, ...G0.CAMPAIGN];
const essential = (id) => new Set([...G0.ESSENTIAL_KINDS, ...(G0.MISSIONS[id].essential || []), ...(G0.MISSIONS[id].always || [])]);

// --- every mission has its per-crew-size settings (fitted by `node tools/balance.js --calibrate`)
{
  const bad = ALL.filter(id => { const C = G0.MISSIONS[id].crew; return !C || C.events?.length !== 8 || C.cells?.length !== 8 || C.events.some(k => !(k >= 1)) || C.cells.some(c => !(c >= 1)); });
  check(!bad.length, `every mission has events and fuel cells for 1-8 players${bad.length ? ' (missing: ' + bad.join(', ') + ')' : ''}`);
  check(['pirates', 'c1', 'c4'].every(id => G0.MISSIONS[id].essential?.includes('pirates')) && G0.MISSIONS.c2.essential?.includes('intruder'), 'the objectives\' events are marked essential (pirates in c1 / c4 / Pirate cove, the intruder in c2)');
}

// --- the timeline for 1, 2, 4, 8 players: about the same length, fewer events for a small crew
for (const id of ['intro', 'rush', 'pirates', 'c2', 'c3', 'c4', 'c7', 'c8']) {
  const lens = [], counts = [];
  let prevKept = null, okAll = true, msg = '';
  const L = G0.MISSIONS[id].length || G0.MISSION_LENGTH;   // (c8: its own length, the boss fight's estimate after the events: js/progress.js)
  for (const n of [1, 2, 4, 8]) {
    const G = withCrew(n, id), ev = G.mission.events, want = G.missionCrew(id, n).events;
    const written = G.mission.written, kept = ev.filter(e => !e.repeat).map(e => written.findIndex(w => w.t === e.t1 && w.kind === e.kind));
    const ess = written.filter(e => essential(id).has(e.kind) && !e.optional).length;   // (optional: a written one of an `always` kind that may go: c8's second failing part)
    // laid out: shapedTimes (2026-10-18; ±10 s jitter, stretched up to ~2× in the calm), or evenly for spacing: 'even' (c5 / c8)
    const lead = Math.min(...written.map(e => e.t)), evenly = G0.MISSIONS[id].spacing === 'even';
    const gap = evenly ? (ev.length > 1 ? (L - G.finaleLead(id) - lead) / (ev.length - 1) : null) : G.mission.gap;
    const shape = G.shapedTimes(ev.length, n, L, null, G0.MISSIONS[id].finaleLead || 0), sorted = [...ev].sort((a, b) => a.t - b.t);
    const even = ev.length < 2 || (evenly ? sorted.every((e, i) => near(e.t, lead + i * gap, 1e-6)) : sorted.every((e, i) => Math.abs(e.t - shape[i]) <= 25));
    const hasEss = written.every((e, i) => !essential(id).has(e.kind) || e.optional || kept.includes(i));   // (every written essential one kept; an `always` kind may come back as repeats too)
    const subset = !prevKept || prevKept.every(i => kept.includes(i));      // what a smaller crew gets, a bigger one gets too
    const rate = near(G.ENERGY_TIME / G.reactorSpeed(), G.ENERGY_TIME * (gap ?? G.mission.gap) / G.mission.writtenGap * G.missionCrew(id, n).reactor, 1e-6);
    const x = G.missionCrew(id, n).extra.length;                            // (crew.extra: repeats on top, 2026-10-20: c4 solo's second failing part)
    const ok = [Math.max(ess, want) + x, Math.max(ess, want) + x + 1].includes(ev.length) && near(G.mission.jumpAt, L)   // (+1: a finale fight that isn't the objective's)
       && even && hasEss && subset && rate;
    if (!ok) { okAll = false; msg += ` ×${n}: count ${ev.length}/${want} jump ${G.mission.jumpAt} even ${even} essentials ${hasEss} subset ${subset} reactor ${rate};`; }
    prevKept = kept; lens.push(G.mission.jumpAt); counts.push(ev.length);
  }
  check(okAll, `${G0.MISSIONS[id].name}: 1 / 2 / 4 / 8 players get ${counts.join(' / ')} events, all jump at ${G0.MISSIONS[id].length || L} s, laid out (shaped; c8 evenly), essentials kept, a smaller crew's events a subset of a bigger one's, reactor ∝ gap${msg}`);
}
// --- Red Comet Cove (c4) runs 5 min to the jump (2026-10-17: 7 min by mistake that morning, then back to 5 at the user's
// word; was 6, the default): the nav core takes a fight + a fetch (or a boarding) + the install in our helm. Solo / 2 players
// get the first raider ~1:30 in (~3.5 min to get its core) and the last one ~75-85 s before the jump (2026-10-18: the shaped
// timeline, ±jitter): enough to shoot it down, fish the core in and install it (~50-60 s), not to let it dock and board it (~90-100 s)
{
  const msg = []; let ok = G0.MISSIONS.c4.length === 300;
  for (const n of [1, 2, 3, 4, 8]) {
    const G = withCrew(n, 'c4'), raiders = G.mission.events.filter(e => e.kind === 'pirates').map(e => e.t).sort((a, b) => a - b);
    const left = G.mission.jumpAt - raiders[raiders.length - 1];
    if (!(near(G.mission.jumpAt, 300) && raiders.length === 2 && raiders[0] < 120 && left >= 70)) ok = false;
    msg.push(`×${n}: raiders at ${raiders.map(t => t.toFixed(0)).join(' / ')} s, ${left.toFixed(0)} s from the last to the jump`);
  }
  check(ok, `Red Comet Cove jumps at 300 s, the first raider before 120 s, the last at least 70 s before the jump at every crew size (${msg.join('; ')})`);
}
{
  const A = withCrew(1, 'c3', 3), B = withCrew(1, 'c3', 99);
  check(A.mission.events.map(e => e.kind).sort().join() === B.mission.events.map(e => e.kind).sort().join(), `a solo run of a chapter always has the same kinds of events (c3: ${A.mission.events.map(e => e.kind).join(', ')})`);
  const P = withCrew(4, 'practice');
  check(P.mission.jumpAt === Infinity && !P.mission.events.length && near(P.reactorSpeed(), 1), 'practice: no timeline, no jump, the reactor at ENERGY_TIME');
}
// --- chapters 1-3 (2026-10-16: still too easy solo): a part fails (one maintenance event) at every crew size, solo too
// (MISSIONS[id].always), on top of what the crew size had; easy / very easy keep it too
{
  let ok = true; const msg = [];
  for (const id of ['c1', 'c2', 'c3']) for (const n of [1, 2, 3, 4, 8]) for (const easy of [0, 2]) {
    const G = loadGame(NAMES); while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
    const keep = Math.random; Math.random = mulberry(11); try { G.startMission(id, { easy }); } finally { Math.random = keep; }
    const m = G.mission.events.filter(e => e.kind === 'maintenance').length;
    if (!(m >= 1 && (n > 2 || m === 1))) { ok = false; msg.push(`${id} ×${n}${easy ? ' easy ' + easy : ''}: ${m}`); }
  }
  check(ok && ['c1', 'c2', 'c3'].every(id => G0.MISSIONS[id].always?.includes('maintenance')), `chapters 1-3: a part fails at every crew size, exactly one for 1-2 players, also on very easy${msg.length ? ' (' + msg.join(', ') + ')' : ''}`);
}
// --- chapter 2 (the user's playtest: too easy solo): opener (the asteroid swarm; 2026-10-16 no more interceptor), the two aliens, a failing part
// (2026-10-16), the frigate as the finale, 70 s before the jump (finaleLead) so its heavy shots matter; other missions keep
// the 22 s (JUMP_DELAY). 2026-10-20 (solo playtest: one more encounter): solo also gets the mine drone, between the aliens and the
// failing part; easy drops it again, very easy also gives half a cat of luck
{
  const openers = new Set(); let ok = true, msg = '';
  for (let seed = 1; seed <= 24; seed++) {
    const G = withCrew(1, 'c2', seed), ev = [...G.mission.events].sort((a, b) => a.t - b.t), k = ev.map(e => e.kind);
    openers.add(k[0]);
    const order = k.length === 5 && k[0] === 'swarm' && k[1] === 'intruder' && ev[1].count === 2 && k[2] === 'mines' && k[3] === 'maintenance' && k[4] === 'frigate';
    const timing = near(ev[4].t, L - 70) && near(G.mission.jumpAt, L) && near(ev[0].t, 15) && ev[1].t < ev[2].t && ev[2].t < ev[3].t && ev[3].t < ev[4].t;
    if (!order || !timing) { ok = false; msg += ` seed ${seed}: ${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(' ')} jump ${G.mission.jumpAt};`; }
  }
  check(ok && openers.size === 1, `c2 solo: the asteroid swarm (${[...openers].join(', ')}), then the two intruders, the mine drone, a failing part, then the frigate at ${L - 70} s, the swarm at 15 s, jump at ${L} s${msg}`);
  for (const easy of [1, 2]) {
    const G = loadGame(NAMES); const keep = Math.random; Math.random = mulberry(5);
    try { G.startMission('c2', { easy }); } finally { Math.random = keep; }
    const ev = [...G.mission.events].sort((a, b) => a.t - b.t), k = ev.map(e => e.kind).join(', ');
    check(/^swarm, intruder, maintenance, frigate$/.test(k) && ev[0].opener && G.mission.extraLuck === (easy - 1) / 2,
          `c2 solo on ${easy === 1 ? 'easy' : 'very easy'}: ${k} (the mine drone dropped; the opener and the failing part are never dropped, the frigate still the finale: ${G.mission.extraLuck} cat(s) of luck for the second step)`);
  }
  const big = withCrew(4, 'c2', 3), last = [...big.mission.events].sort((a, b) => a.t - b.t).pop();
  check(near(last.t, L - 70) && last.kind !== 'intruder' && near(big.mission.jumpAt, L), `c2 for 4: the finale (${last.kind}) also 70 s before the jump`);
  const c1 = withCrew(1, 'c1', 3);
  check(G0.finaleLead('c1') === G0.JUMP_DELAY && near(Math.max(...c1.mission.events.map(e => e.t)), 0.9 * L) && near(c1.mission.jumpAt, L), `other missions: the finale at 90% (${0.9 * L} s), the jump at ${L} s (c1)`);
}
// --- 2026-10-16: interceptors only where the story has pirates (c1, c4's scout, c5's patrol): the openers of c2 / c3 / c6
// are an asteroid swarm, a mine drone, a leech swarm; nothing from a pirate ship beyond the Mire (c6-c8, Deep drift)
{
  const SHIPS = ['interceptor', 'frigate', 'stealth', 'tractor', 'pirates', 'saboteur'], bad = [];
  const OPEN = { c2: 'swarm', c3: 'mines', c6: 'leeches', c7: 'spores', c8: 'spores' };
  for (let seed = 1; seed <= 6; seed++) for (const id of ['c2', 'c3', 'c6', 'c7', 'c8', 'deep']) {
    const G = withCrew(1, id, seed), w = G.mission.written, first = [...w].sort((a, b) => a.t - b.t)[0];
    if (w.some(e => e.kind === 'interceptor')) bad.push(`${id}: an interceptor`);
    if (id !== 'c2' && id !== 'c3' && w.some(e => SHIPS.includes(e.kind))) bad.push(`${id}: ${w.filter(e => SHIPS.includes(e.kind)).map(e => e.kind).join(', ')}`);
    if (OPEN[id] && !(first.opener && first.kind === OPEN[id])) bad.push(`${id}: opens with ${first.kind}`);
  }
  check(!bad.length && ['c1', 'c4', 'c5'].every(id => withCrew(1, id).mission.written.some(e => e.kind === 'interceptor' || e.kind === 'pirates')),
        `pirate ships only in the pirates' chapters; openers c2 swarm, c3 mine drone, c6 leeches, c7 / c8 spores${bad.length ? ' (' + [...new Set(bad)].join('; ') + ')' : ''}`);
}
// --- more self-breaking parts from chapter 4 on (2026-10-16): at every crew size at least one failing part in c4 / c6
// (and their twins), two in c7 / c8 (and Deep drift), also on very easy
{
  const want = { c4: 1, pirates: 1, c6: 1, ore: 1, c7: 2, deep: 2, c8: 1 }; let ok = true; const msg = [];   // (c8: two until 2026-10-20)
  for (const [id, m0] of Object.entries(want)) for (const n of [1, 2, 3, 4, 8]) for (const easy of [0, 2]) {
    const G = loadGame(NAMES); while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
    const keep = Math.random; Math.random = mulberry(13); try { G.startMission(id, { easy }); } finally { Math.random = keep; }
    const m = G.mission.events.filter(e => e.kind === 'maintenance').length;
    if (m < m0) { ok = false; msg.push(`${id} ×${n}${easy ? ' easy ' + easy : ''}: ${m}`); }
  }
  check(ok && Object.keys(want).every(id => G0.MISSIONS[id].always?.includes('maintenance')), `failing parts at every crew size: ${Object.entries(want).map(([id, m]) => `${id} ≥${m}`).join(', ')}${msg.length ? ' (' + msg.join(', ') + ')' : ''}`);
}
// --- 2026-10-20 (solo playtest: one more encounter, an easy one): c4 solo gets a second failing part (crew.extra, a repeat on
// top of the count; the count's next pick would have been the mine drone); easy takes it out again, very easy then half a
// cat of luck; ×2 keeps its five
{
  const run = (n, easy, seed) => { const G = loadGame(NAMES); while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
    const keep = Math.random; Math.random = mulberry(seed); try { G.startMission('c4', { easy }); } finally { Math.random = keep; }
    return { k: [...G.mission.events].sort((a, b) => a.t - b.t).map(e => e.kind).join(', '), luck: G.mission.extraLuck }; };
  const SOLO = 'interceptor, pirates, maintenance, pirates, maintenance, swarm', BASE = 'interceptor, pirates, maintenance, pirates, swarm', bad = [];
  for (let seed = 1; seed <= 8; seed++) { const s = run(1, 0, seed); if (s.k !== SOLO) bad.push(`seed ${seed}: ${s.k}`); }
  const e1 = run(1, 1, 5), e2 = run(1, 2, 5), two = run(2, 0, 5);
  check(!bad.length && e1.k === BASE && e1.luck === 0 && e2.k === BASE && e2.luck === 0.5 && two.k === BASE,
        `c4 solo: ${SOLO}; easy: ${e1.k} (luck ${e1.luck}); very easy: ${e2.k} (luck ${e2.luck}); ×2: ${two.k}${bad.length ? ' (' + bad.join('; ') + ')' : ''}`);
}
// --- The Deep (c7): one gravity tide, 70 s in (it knocks a coil out), the handle by hand, herds of two organic kinds
// from one side, no interceptors; solo gets a herd (the finale fight), both failing parts and (2026-10-17, "too chill") the
// alien, early, at every crew size; solo a spore mother on top (2026-10-20)
{
  const R = G0.MISSIONS.c7.rules; let ok = R.tides > 0 && R.coils && R.handle; const msg = [];
  for (const n of [1, 2, 4, 8]) {
    const G = withCrew(n, 'c7', 5), ev = [...G.mission.events].sort((a, b) => a.t - b.t), herds = ev.filter(e => e.kind === 'herd');
    const good = herds.length >= 1 && herds.every(h => h.kinds?.length === 2 && h.kinds[0] !== h.kinds[1] && h.kinds.every(k => ['grappler', 'leeches', 'mother', 'spores'].includes(k)) && h.side)
      && ev[ev.length - 1].kind !== 'maintenance' && ev.filter(e => e.kind === 'maintenance').length >= 2 && (n < 4 || herds.length >= 2)
      && ev.filter(e => e.kind === 'intruder').length === 1 && ev.findIndex(e => e.kind === 'intruder') < ev.findIndex(e => e.kind === 'herd') && ev.length === G0.MISSIONS.c7.crew.events[n - 1] + (G0.MISSIONS.c7.crew.extra?.mother?.[n - 1] || 0)
      && (n > 1 || ev.some(e => e.kind === 'mother'));   // (solo: + a spore mother, 2026-10-20 playtest)
    if (!good) ok = false;
    msg.push(`×${n}: ${ev.map(e => e.kind === 'herd' ? `herd(${e.kinds.join('+')})` : e.kind).join(', ')}`);
  }
  check(ok, `The Deep: a tide ${R.tides} s in with the coils and handle rules, herds, two failing parts, the alien before the herds (${msg.join(' · ')})`);
}
// --- The Mother of All (c8): a fixed escalating timeline; at every crew size (and difficulty) the spore clouds first, the
// spore mother, the grappler, a failing part (two until 2026-10-20) and the leviathan as the finale, at 270 s (one
// encounter less: the mission 500 s, was 560; the fight keeps its ~4 min); more players get herds, leeches
{
  let ok = true; const msg = [];
  for (const n of [1, 2, 3, 4, 8]) for (const easy of [0, 2]) {
    const G = loadGame(NAMES); while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
    const keep = Math.random; Math.random = mulberry(17); try { G.startMission('c8', { easy }); } finally { Math.random = keep; }
    const ev = [...G.mission.events].sort((a, b) => a.t - b.t), k = ev.map(e => e.kind), has = (x) => k.includes(x);
    const good = k[0] === 'spores' && ['mother', 'grappler', 'leviathan_boss'].every(has) && k.filter(x => x === 'maintenance').length >= 1
      && k[k.length - 1] === 'leviathan_boss' && Math.abs(ev[ev.length - 1].t - 270) < 1e-6 && k.indexOf('mother') < k.indexOf('grappler') && !has('interceptor') && !has('frigate') && (n < 4 || easy || has('herd'));
    if (!good) ok = false;
    if (!easy && (n === 1 || n === 4)) msg.push(`×${n}: ${k.join(', ')}`);
  }
  check(ok, `The Mother of All: spores, the mother, the grappler, a failing part and the infested leviathan (the boss) last, at 270 s, at every crew size, herds on top for 4+ (${msg.join(' · ')})`);
}
// --- the model builds the same timelines as the game
{
  const B = require('../tools/balance');
  let ok = true, msg = [];
  for (const [id, n] of [['intro', 1], ['rush', 2], ['c5', 3], ['deep', 4], ['c8', 8]]) {
    const b = B.setup(id, n, {}, 99), G = loadGame(NAMES);
    while (G.crew.length < n) G.crew.push(G.makeCrew('P'));
    const keep = Math.random; Math.random = mulberry(99); try { G.startMission(id, {}); } finally { Math.random = keep; }
    const same = b.events.length === G.mission.events.length && b.events.every((e, i) => near(e.t, G.mission.events[i].t, 1e-9) && e.kind === G.mission.events[i].kind)
      && near(b.jumpAt, G.mission.jumpAt, 1e-9) && near(b.energy.interval, G.ENERGY_TIME / G.reactorSpeed(), 1e-9) && b.energy.cells === 1 + G.power.reserve;
    ok = ok && same; msg.push(`${id} ×${n} ${same ? 'same' : 'DIFFERENT'}`);
  }
  check(ok, `tools/balance.js lays out the events, the reactor and the fuel exactly like the game (${msg.join(', ')})`);
}

// --- the server's way: startMission with nobody aboard, crew added right after: rebuilt for them
{
  const G = loadGame(NAMES);
  G.netServer.init('intro', {});
  for (let i = 1; i <= 3; i++) G.netServer.addCrew(i, 'P' + i, null);
  G.simTick(DT);
  const want = G.missionCrew('intro', 3);
  check(G.mission.events.length === want.events && G.mission.paceN === 3 && G.power.reserve === want.cells - 1,
        `server start (crew added after startMission): rebuilt for 3 on the first tick (${G.mission.events.length} events, ${G.power.reserve + 1} cells)`);
}

// --- joining and leaving mid-mission: in the lead-in a rebuild; after the first encounter nothing moves
{
  const G = withCrew(1, 'intro'); calm(G);
  for (let i = 0; i < 10 * 60; i++) { G.simTick(DT); calm(G); }
  G.crew.push(G.makeCrew('Early joiner')); G.simTick(DT);
  check(G.mission.events.length === G.missionCrew('intro', 2).events && G.power.reserve === G.missionCrew('intro', 2).cells - 1, `someone joins in the lead-in: the timeline is rebuilt for 2 (${G.mission.events.length} events, ${G.power.reserve + 1} cells)`);
}
{
  const G = withCrew(1, 'intro'); calm(G);
  const first = G.mission.events[0].t;
  while (G.mission.t < first + 5) { G.simTick(DT); calm(G); }
  const before = G.mission.events.map(e => e.t).join(), jump0 = G.mission.jumpAt, cells0 = G.power.reserve;
  G.crew.push(G.makeCrew('Late joiner')); G.simTick(DT);
  const more = Math.max(0, G.missionCrew('intro', 2).cells - G.missionCrew('intro', 1).cells);
  check(G.mission.events.map(e => e.t).join() === before && G.mission.jumpAt === jump0 && G.power.reserve === cells0 + more,
        `someone joins after the first encounter: the encounters and the jump stay (${G.mission.events.length} events, jump at ${jump0} s), the crate gets the 2-player cells (+${more})`);
  G.crew.pop(); G.simTick(DT);
  check(G.power.reserve === cells0 + more && G.mission.paceN === 1 && G.mission.jumpAt === jump0, 'leaving: nothing moves, no cells taken away');
}

// --- the reactor and the fuel
{
  const G = withCrew(2, 'intro'); G.power.reactor.t = 0;
  const fuel0 = G.power.reactor.fuel; let t = 0;
  while (G.power.reactor.fuel === fuel0 && t < 300) { G.simTick(DT); t += DT; calm(G); }
  const want = G.ENERGY_TIME * G.paceFactor();
  check(Math.abs(t - want) < 0.05, `intro, 2 players: an energy every ${t.toFixed(1)} s (ENERGY_TIME × gap ${G.mission.gap.toFixed(0)} s / written gap ${G.mission.writtenGap.toFixed(0)} s = ${want.toFixed(1)})`);
  G.power.overcharge = true;
  check(near(G.reactorSpeed(), 2 / G.paceFactor()), 'overcharged: twice that');
  const S = withCrew(2, 'intro', 7, { spareCell: true });
  check(S.power.reserve === G0.missionCrew('intro', 2).cells - 1 + 1, 'the spare cell upgrade still adds its cell on top of the mission\'s');
}
{
  const reqs = ALL.filter(id => G0.MISSIONS[id].needs).map(id => `${id}: ${G0.missionRequirements(id).join('; ')}`);
  check(ALL.every(id => !G0.MISSIONS[id].needs || G0.missionRequirements(id).length) && ['intro', 'c1', 'c2'].every(id => !G0.MISSIONS[id].needs),
        `prerequisites show as lobby warnings, none for the early missions (${reqs.join(' · ') || 'none'})`);
}

// --- the model's energy runs on the game's code: a scripted case, against a direct run of the full game
{
  const B = require('../tools/balance');
  const b = { ...B.setup('intro', 1, {}, 1), factor: 1, overcharge: false };   // solo, reactor at ENERGY_TIME: an energy every 20 s
  const plan = { fights: [{ key: 'a', gun: 'port', t0: 30, shots: 15, span: 14 }], shields: [{ t: 50, side: 'star', key: 'b' }], jumpAt: 100, window: 15, end: 102, scrams: [], drains: [], storms: [] };
  b.energy = { ...b.energy, cells: 4 };
  const sim = B.energySim(b, plan, 'auto');
  // the same by hand: simTick, the left cannon fired / reloaded as planned, the lever left alone
  const G = loadGame(['simTick', 'GUNS', 'fireCannon', 'reloadCannon', 'pressShield', 'power', 'CAPACITORS', 'mission', 'useEnergy', 'me']);
  G.mission.active = false; Object.assign(G.me, { x: 22.2, y: 16.6 });
  const g = G.GUNS.find(x => x.id === 'port'); let left = 15, next = 30, waitFrom = null, shield = null, jump = null; const waits = [];
  for (let t = 0; t <= 115; t += 0.1) {
    if (t >= 30 && left > 0 && t >= next && !(g.reload > 0)) {
      if (g.shots > 0) { if (waitFrom !== null) { waits.push([waitFrom, t - waitFrom]); waitFrom = null; } if (!(g.cd > 0)) { G.fireCannon(g); left--; next = t + 14 / 15; } }
      else if (G.reloadCannon(g)) g.reload = Math.min(g.reload, B.reloadTime());
      else if (waitFrom === null) waitFrom = t;
    }
    if (shield === null && t >= 50 && G.pressShield('star') === true) shield = t;
    if (jump === null && t >= 100 && G.CAPACITORS[1].charge > 0) { G.useEnergy(1); jump = t; }
    G.simTick(0.1);
  }
  const w = sim.waits.filter(x => !x.never), open = sim.waits.find(x => x.never);
  check(w.length === waits.length && w.every((x, i) => near(x.t, waits[i][0], 0.11) && near(x.wait, waits[i][1], 0.11)) && near(open?.t ?? -1, waitFrom ?? -2, 0.11),
        `energy run = direct game run: the left cannon waits ${waits.map(([a, d]) => `${d.toFixed(1)} s at ${a.toFixed(1)} s`).join(', ')}, then runs dry at ${waitFrom?.toFixed(1)} s`);
  check(!sim.unmet.length && shield !== null && near(sim.jumpWait + 100, jump, 0.11), `the right shield goes up at 50 s and the jump gets its energy at ${jump?.toFixed(1)} s in both`);
  check(sim.perSide[0].need === 3 && sim.perSide[0].have === 2 && sim.perSide[1].have === 3 && sim.perSide[2].have === 3,
        `capacitors: the left one needed 3 (reloads for 15 shots, the cannon starting with ${b.energy.spe}) but only had 2 (1 + 1 delivered: the auto lever goes mid → right → left)`);
  const best = B.energySim(b, plan, 'best');
  check(best.waited < sim.waited && best.jumpOk, `perfect routing waits less (${best.waited.toFixed(1)} s vs ${sim.waited.toFixed(1)} s on auto)`);
}

// --- the balance model: rates every mission for 1-4 players (its A.RUNS builds, as --calibrate fits them), with the
// expected kit (tools/balance.js expectedKit: the gear and upgrades a first-time campaign run affords by then); the idle
// targets (2026-10-18): solo 29.6% (the solo average of chapters 1-5 with fire spreading), 2-8 players 45%, no ramp; a mission's
// own (MISSIONS[id].balance), kept until more playtesting: chapters 6-8 and their twins 37% solo, Nightmare 25%, their crews
// the old ramped aims (64-66%); the energy in spec where it must be
{
  const { balance, targetIdle, PROGRESSION } = require('../tools/balance');
  const t0 = Date.now();
  const rows = balance({ players: [1, 2, 3, 4] });
  check(rows.length === 16 * 4 && rows.every(r => r.verdict && Number.isFinite(r.score) && r.sides.length === 3), `tools/balance.js rates ${rows.length / 4} missions × 4 crew sizes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const pct = (v) => Math.round(v * 100);
  // the targets: 29.6% solo / 45% for 2+ players everywhere, except the missions with their own (not retuned yet)
  const own = { c6: [0.37, 0.65], c7: [0.37, 0.645], c8: [0.37, 0.64], ore: [0.37, 0.66], deep: [0.37, 0.645], nightmare: [0.25, 0.64] };
  check(ALL.every(id => near(targetIdle(id, 1), own[id]?.[0] ?? 0.296) && near(targetIdle(id, 2), own[id]?.[1] ?? 0.45) && near(targetIdle(id, 8), own[id]?.[1] ?? 0.45))
        && ALL.every(id => PROGRESSION[id] !== undefined),
        `the idle targets: 29.6% solo, 45% for 2+ players, no ramp; own targets: ${Object.entries(own).map(([id, [a, b]]) => `${id} ${a * 100} / ${b * 100}%`).join(', ')}`);
  // Out of spec even with every prerequisite the player can have by then (see the balance section in PLAN.md).
  // (with the kit: c6 ×3 waits 27 s at 235 s (the drifting rock's two drill trips); Nightmare solo / ×2 have 3 encounters for the
  // solo targets; 2026-10-16, tides and herds: c7 / Deep drift ×4 (a herd's two fights on one side); c8 back in spec for 1-4 with a ×0.35 reactor)
  // 2026-10-18 (recalibrated: shaped timeline, 5 min): intro ×4 (12 s at 220 s) and c2 ×4 (8 s at 44 s) the nearest the fit gets
  const OUT = { rush: [1, 2, 3, 4], deep: [4], nightmare: [1, 2, 3, 4], c6: [3], c7: [4], intro: [4], c2: [4] };
  // FIXED: the user's fixed minimum (c8, 2026-10-16: the spore clouds, the spore mother, the grappler, two failing parts and
  // the leviathan at every crew size) is more work than the target for 1-2 players: kept out of the target checks below
  const FIXED = { c8: [1, 2] };
  const early = rows.filter(r => ['intro', 'c1', 'c2'].includes(r.id));
  check(early.every(r => (r.inSpec || (OUT[r.id] || []).includes(r.n)) && !G0.MISSIONS[r.id].needs), `the early missions (intro, chapters 1-2) are in spec on the base ship for 1-4 players (but OUT)${early.filter(r => !r.inSpec).map(r => `; not ${r.name} ×${r.n}: ${r.specWhy}`).join('')}`);
  const out = rows.filter(r => !r.inSpec && !(OUT[r.id] || []).includes(r.n));
  check(!out.length, `with their prerequisites, every other mission's energy is in spec for 1-4 players${out.map(r => `; not ${r.name} ×${r.n}: ${r.specWhy}`).join('')}`);
  console.log(`      (out of spec with everything: ${rows.filter(r => !r.inSpec).map(r => `${r.name} ×${r.n}`).join(', ') || 'none'})`);
  // Solo (2026-10-18, 5 min, shaped timeline): SHORT: the essentials (+ the finale fight) alone keep a solo crew busier than
  // the target: c1 (two raiders, a failing part, the finale), c2 (opener, the two aliens, a failing part, the frigate), c3
  // (opener, the lab, a failing part, the finale), c4 (two raiders, the opener, a failing part, the finale: ~0% idle).
  // (2026-10-20, solo playtest: c2 / c3 one encounter more than that, a mine drone each: ~10% / ~9% idle)
  // They must stay doable. (HARD, the deliberately harder ones, merged into SHORT: at 29.6% everything is that hard.)
  const SHORT = ['c1', 'c2', 'c3', 'c4'];
  // PLAYTESTED: rated busier than the model likes, but the user's playtest says it's fine (2026-10-20: c4 solo "can use one
  // more easy encounter": a second failing part; the model reads ~-5% idle, 'impossible'): exempt from the 'doable' checks
  // (c7 solo too: the playtest asked for one more encounter, a spore mother, on top of what the model already called impossible)
  // (c8 solo: the playtest's own shape, 2026-10-20: one encounter less, the leviathan a minute earlier; the model reads ~5.2 open)
  const PLAYTESTED = { c4: [1], c7: [1], c8: [1] }, playtested = (r) => (PLAYTESTED[r.id] || []).includes(r.n);
  const HARD = [];
  // COARSE: the nearest count is still above the target (one more is out of spec or far below): rush (2 encounters).
  // PENDING: chapter 5 is set by hand: the pirate base is boarding work the model doesn't see (its idle reads high)
  const COARSE = ['rush'], PENDING = ['c5'];
  // BELOW: busier solo than its own target, accepted (the user: keep the encounters): c6 (not retuned since 2026-10-16;
  // at 5 min since 2026-10-18 it's well below: waiting for a playtest)
  const BELOW = ['c6'];
  const solo = rows.filter(r => r.n === 1), fit = solo.filter(r => ![...SHORT, ...HARD, ...COARSE, ...PENDING, ...BELOW].includes(r.id) && !(FIXED[r.id] || []).includes(1));
  const fixed = rows.filter(r => (FIXED[r.id] || []).includes(r.n));
  check(fixed.every(r => r.idle < r.aim && r.idle > 0 && r.inSpec && (r.verdict !== 'impossible' || playtested(r))), `the fixed minimum (c8: five encounters at every crew size) keeps 1-2 players busier than the target, in spec and doable: ${fixed.map(r => `${r.id} ×${r.n} ${pct(r.idle)}% (${r.events} encounters, ${r.verdict})`).join(', ')}`);
  const coarse = solo.filter(r => COARSE.includes(r.id));
  check(coarse.every(r => r.events <= 2 && r.idle > r.aim && r.idle < 0.8), `solo, the coarse missions sit above their targets (one more would be out of spec or far below): ${coarse.map(r => `${r.id} ${pct(r.idle)}% (${r.events})`).join(', ')}`);
  const hard = solo.filter(r => HARD.includes(r.id));
  check(hard.every(r => r.idle < r.aim - 0.1 && r.idle > 0.2 && r.verdict !== 'impossible'), `solo, the deliberately harder missions sit well below their targets but stay doable (> 20% idle): ${hard.map(r => `${r.id} ${pct(r.idle)}% (${r.events} encounters, ${r.verdict})`).join(', ')}`);
  const off = fit.filter(r => Math.abs(r.idle - r.aim) > 0.08), bias = fit.reduce((s, r) => s + r.idle - r.aim, 0) / fit.length;
  const below = solo.filter(r => BELOW.includes(r.id));
  check(below.every(r => r.idle < r.aim && r.idle > 0.2 && r.inSpec && r.verdict !== 'impossible'), `solo, the missions accepted below their targets (BELOW) stay in spec and doable (> 20% idle): ${below.map(r => `${r.id} ${pct(r.idle)}/${(r.aim * 100).toFixed(1)}% (${r.verdict})`).join(', ')}`);
  check(!off.length && Math.abs(bias) <= 0.04, `solo, every other mission within 8 points of its target, ${(bias * 100).toFixed(1)} points off on average: ${fit.map(r => `${r.id} ${pct(r.idle)}/${(r.aim * 100).toFixed(1)}`).join(', ')}${off.map(r => `; OFF: ${r.id}`).join('')}`);
  const short = solo.filter(r => SHORT.includes(r.id));
  check(short.every(r => r.idle < r.aim && r.events <= 6 && (r.verdict !== 'impossible' || playtested(r))), `solo, the essentials-only missions sit below their targets but stay doable: ${short.map(r => `${r.id} ${pct(r.idle)}% (${r.events} encounters, ${r.verdict})`).join(', ')}`);
  // 2-4 players: around the 45% target (own targets: 64-66%; the event count is finer here: ~3-6 points per encounter)
  const team = [...new Set(rows.map(r => r.id))].filter(id => !PENDING.includes(id)).map(id => {
    const rs = rows.filter(r => r.id === id && r.n > 1 && !(OUT[id] || []).includes(r.n) && !(FIXED[id] || []).includes(r.n));
    const dev = rs.length ? rs.reduce((s, r) => s + r.idle - r.aim, 0) / rs.length : 0;
    // (missions in spec only at ×2 — deep drift, nightmare, c7, c8 — have 1-2 heavy encounters there: one more is 10-45 points)
    return { id, ok: (rs.length < 2 || Math.abs(dev) <= 0.07) && rs.every(r => Math.abs(r.idle - r.aim) <= 0.15), per: rs.map(r => pct(r.idle)).join('/'), aim: (targetIdle(id, 2) * 100).toFixed(1) };
  });
  check(team.every(o => o.ok), `2-4 players: every mission near its target (45%, own targets 64-66%; each within 15 points, a mission's mean within 7): ${team.map(o => `${o.id} ${o.per || '-'}/${o.aim}${o.ok ? '' : ' OFF'}`).join(', ')}`);
  check(rows.every(r => Math.abs(r.length - (G0.MISSIONS[r.id].length || L)) < 5), `every mission jumps at about ${L} s (or its own length: c5 ${G0.MISSIONS.c5.length} s) for every crew size`);
  const bad = rows.filter(r => r.verdict === 'impossible' && !(OUT[r.id] || []).includes(r.n) && !playtested(r));
  check(!bad.length, `no other mission is rated impossible${bad.map(r => `; ${r.name} ×${r.n} (${r.why.join('; ')})`).join('')}`);
}
process.exitCode = failed ? 1 : 0;
