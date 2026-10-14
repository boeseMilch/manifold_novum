// Pacing: every mission lasts MISSION_LENGTH to the jump; the crew size sets how many encounters
// (MISSIONS[id].crew.events, essential ones never dropped, optional ones in DROP_ORDER) and fuel cells
// (crew.cells); the reactor follows the gaps (ENERGY_TIME × gap / written gap × crew.reactor). Joining /
// leaving: a rebuild in the lead-in, else the count stays and the remaining gaps change. Then:
// tools/balance.js (its timelines and its energy runs agree with the game) rates every mission.
// Run: node tests/scaling.js
const { loadGame } = require('./harness');
const NAMES = ['crewSize', 'paceFactor', 'missionCrew', 'selectEvents', 'MISSION_LENGTH', 'DROP_ORDER', 'ESSENTIAL_KINDS', 'crew', 'makeCrew', 'startMission', 'mission', 'simTick', 'power',
  'MISSIONS', 'CAMPAIGN', 'SKIRMISH', 'JUMP_DELAY', 'finaleLead', 'ENERGY_TIME', 'CELL_ENERGY', 'reactorSpeed', 'netServer', 'combat', 'missionRequirements', 'SHIP_UPGRADES'];
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
const essential = (id) => new Set([...G0.ESSENTIAL_KINDS, ...(G0.MISSIONS[id].essential || [])]);

// --- every mission has its per-crew-size settings (fitted by `node tools/balance.js --calibrate`)
{
  const bad = ALL.filter(id => { const C = G0.MISSIONS[id].crew; return !C || C.events?.length !== 8 || C.cells?.length !== 8 || C.events.some(k => !(k >= 1)) || C.cells.some(c => !(c >= 1)); });
  check(!bad.length, `every mission has events and fuel cells for 1-8 players${bad.length ? ' (missing: ' + bad.join(', ') + ')' : ''}`);
  check(['pirates', 'c1', 'c4'].every(id => G0.MISSIONS[id].essential?.includes('pirates')) && G0.MISSIONS.c2.essential?.includes('intruder'), 'the objectives\' events are marked essential (pirates in c1 / c4 / Pirate cove, the intruder in c2)');
}

// --- the timeline for 1, 2, 4, 8 players: about the same length, fewer events for a small crew
for (const id of ['intro', 'rush', 'pirates', 'c2', 'c3', 'c7', 'c8']) {
  const lens = [], counts = [];
  let prevKept = null, okAll = true, msg = '';
  for (const n of [1, 2, 4, 8]) {
    const G = withCrew(n, id), ev = G.mission.events, want = G.missionCrew(id, n).events;
    const written = G.mission.written, kept = ev.filter(e => !e.repeat).map(e => written.findIndex(w => w.t === e.t1 && w.kind === e.kind));
    const ess = written.filter(e => essential(id).has(e.kind)).length;
    const lead = Math.min(...written.map(e => e.t)), gap = ev.length > 1 ? (L - G.finaleLead(id) - lead) / (ev.length - 1) : null;
    const even = ev.length < 2 || [...ev].sort((a, b) => a.t - b.t).every((e, i) => near(e.t, lead + i * gap, 1e-6));
    const hasEss = ev.filter(e => essential(id).has(e.kind)).length === ess;
    const subset = !prevKept || prevKept.every(i => kept.includes(i));      // what a smaller crew gets, a bigger one gets too
    const rate = near(G.ENERGY_TIME / G.reactorSpeed(), G.ENERGY_TIME * (gap ?? G.mission.gap) / G.mission.writtenGap * G.missionCrew(id, n).reactor, 1e-6);
    const ok = [Math.max(ess, want), Math.max(ess, want) + 1].includes(ev.length) && near(G.mission.jumpAt, L)   // (+1: a finale fight that isn't the objective's)
       && even && hasEss && subset && rate;
    if (!ok) { okAll = false; msg += ` ×${n}: count ${ev.length}/${want} jump ${G.mission.jumpAt} even ${even} essentials ${hasEss} subset ${subset} reactor ${rate};`; }
    prevKept = kept; lens.push(G.mission.jumpAt); counts.push(ev.length);
  }
  check(okAll, `${G0.MISSIONS[id].name}: 1 / 2 / 4 / 8 players get ${counts.join(' / ')} events, all jump at ${L} s, evenly spaced, essentials kept, a smaller crew's events a subset of a bigger one's, reactor ∝ gap${msg}`);
}
{
  const A = withCrew(1, 'c3', 3), B = withCrew(1, 'c3', 99);
  check(A.mission.events.map(e => e.kind).sort().join() === B.mission.events.map(e => e.kind).sort().join(), `a solo run of a chapter always has the same kinds of events (c3: ${A.mission.events.map(e => e.kind).join(', ')})`);
  const P = withCrew(4, 'practice');
  check(P.mission.jumpAt === Infinity && !P.mission.events.length && near(P.reactorSpeed(), 1), 'practice: no timeline, no jump, the reactor at ENERGY_TIME');
}
// --- chapter 2 (the user's playtest: too easy solo): opener (asteroids or an interceptor), the two aliens, the frigate as the
// finale, 70 s before the jump (finaleLead) so its heavy shots matter; other missions keep the 22 s (JUMP_DELAY)
{
  const openers = new Set(); let ok = true, msg = '';
  for (let seed = 1; seed <= 24; seed++) {
    const G = withCrew(1, 'c2', seed), ev = [...G.mission.events].sort((a, b) => a.t - b.t), k = ev.map(e => e.kind);
    openers.add(k[0]);
    const order = k.length === 3 && ['swarm', 'interceptor'].includes(k[0]) && k[1] === 'intruder' && ev[1].count === 2 && k[2] === 'frigate';
    const timing = near(ev[2].t, L - 70) && near(G.mission.jumpAt, L) && near(ev[1].t - ev[0].t, ev[2].t - ev[1].t);
    if (!order || !timing) { ok = false; msg += ` seed ${seed}: ${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(' ')} jump ${G.mission.jumpAt};`; }
  }
  check(ok && openers.size === 2, `c2 solo: swarm or interceptor (both seen: ${[...openers].join(', ')}), then the two intruders, then the frigate at ${L - 70} s, evenly spaced, jump at ${L} s${msg}`);
  for (const easy of [1, 2]) {
    const G = loadGame(NAMES); const keep = Math.random; Math.random = mulberry(5);
    try { G.startMission('c2', { easy }); } finally { Math.random = keep; }
    const k = [...G.mission.events].sort((a, b) => a.t - b.t).map(e => e.kind).join(', ');
    check(k === 'intruder, frigate', `c2 solo on ${easy === 1 ? 'easy' : 'very easy'}: ${k} (the frigate still the finale)`);
  }
  const big = withCrew(4, 'c2', 3), last = [...big.mission.events].sort((a, b) => a.t - b.t).pop();
  check(near(last.t, L - 70) && last.kind !== 'intruder' && near(big.mission.jumpAt, L), `c2 for 4: the finale (${last.kind}) also 70 s before the jump`);
  const c1 = withCrew(1, 'c1', 3);
  check(G0.finaleLead('c1') === G0.JUMP_DELAY && near(Math.max(...c1.mission.events.map(e => e.t)), L - G0.JUMP_DELAY) && near(c1.mission.jumpAt, L), `other missions keep the finale ${G0.JUMP_DELAY} s before the jump (c1)`);
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

// --- the balance model: rates every mission for 1-4 players (its A.RUNS builds, as --calibrate fits them); the idle
// targets: solo 70% on the first mission of the progression, 0.5 points less for every step after it (a difficulty
// ramp), 2-8 players 68% minus the same ramp; the energy in spec where it must be
{
  const { balance, targetIdle, PROGRESSION } = require('../tools/balance');
  const t0 = Date.now();
  const rows = balance({ players: [1, 2, 3, 4] });
  check(rows.length === 16 * 4 && rows.every(r => r.verdict && Number.isFinite(r.score) && r.sides.length === 3), `tools/balance.js rates ${rows.length / 4} missions × 4 crew sizes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const pct = (v) => Math.round(v * 100);
  // the targets: intro (step 0) 70% solo, then chapter n (step n) 0.5 points less per step, c8 66%; 2+ players 2 points lower
  const camp = G0.CAMPAIGN.map(id => targetIdle(id, 1));
  check(near(targetIdle('intro', 1), 0.70) && camp.every((v, i) => near(v, 0.70 - 0.005 * (i + 1))) && near(targetIdle('c8', 1), 0.66) && near(targetIdle('intro', 3), 0.68)
        && ALL.every(id => PROGRESSION[id] !== undefined), `the idle targets ramp down: intro 70%, chapters 1-8 ${camp.map(v => (v * 100).toFixed(1)).join(' ')}% solo; 68% for 2+ players on intro, same ramp`);
  // Out of spec even with every prerequisite the player can have by then (see the balance section in PLAN.md).
  const OUT = { rush: [2, 3, 4], deep: [3, 4], nightmare: [3, 4], c7: [3, 4], c8: [3, 4] };
  const early = rows.filter(r => ['intro', 'c1', 'c2'].includes(r.id));
  check(early.every(r => r.inSpec && !G0.MISSIONS[r.id].needs), `the early missions (intro, chapters 1-2) are in spec on the base ship for 1-4 players${early.filter(r => !r.inSpec).map(r => `; not ${r.name} ×${r.n}: ${r.specWhy}`).join('')}`);
  const out = rows.filter(r => !r.inSpec && !(OUT[r.id] || []).includes(r.n));
  check(!out.length, `with their prerequisites, every other mission's energy is in spec for 1-4 players${out.map(r => `; not ${r.name} ×${r.n}: ${r.specWhy}`).join('')}`);
  console.log(`      (out of spec with everything: ${rows.filter(r => !r.inSpec).map(r => `${r.name} ×${r.n}`).join(', ') || 'none'})`);
  // Solo: one encounter more or less moves a solo crew's idle by ~13-15 points (1 vs 2 encounters: ~76% vs ~62%), so
  // the nearest count lands within ~8 points of its target. SHORT: the essentials (+ the finale fight) alone keep a
  // solo crew busier than the target (two pirate raiders in c1 / c4 / Pirate cove, c6's four).
  const SHORT = ['c1', 'c4', 'c6', 'pirates'];
  // HARD: set harder than the model's target on purpose, after a playtest (c2: two aliens + opener + frigate even solo)
  const HARD = ['c2'];
  const solo = rows.filter(r => r.n === 1), fit = solo.filter(r => !SHORT.includes(r.id) && !HARD.includes(r.id));
  const hard = solo.filter(r => HARD.includes(r.id));
  check(hard.every(r => r.idle < r.aim - 0.1 && r.idle > 0.3 && r.verdict !== 'impossible'), `solo, the deliberately harder missions sit well below their targets but stay doable (> 30% idle): ${hard.map(r => `${r.id} ${pct(r.idle)}% (${r.events} encounters, ${r.verdict})`).join(', ')}`);
  const off = fit.filter(r => Math.abs(r.idle - r.aim) > 0.08), bias = fit.reduce((s, r) => s + r.idle - r.aim, 0) / fit.length;
  const intro = solo.find(r => r.id === 'intro');
  check(Math.abs(intro.idle - 0.70) <= 0.03, `solo, the first mission (intro) leaves the crew ${pct(intro.idle)}% idle (target 70%)`);
  check(!off.length && Math.abs(bias) <= 0.04, `solo, every other mission within 8 points of its ramped target, ${(bias * 100).toFixed(1)} points off on average: ${fit.map(r => `${r.id} ${pct(r.idle)}/${(r.aim * 100).toFixed(1)}`).join(', ')}${off.map(r => `; OFF: ${r.id}`).join('')}`);
  const short = solo.filter(r => SHORT.includes(r.id));
  check(short.every(r => r.idle < r.aim && r.idle > 0.35 && r.events <= 4), `solo, the essentials-only missions sit below their targets but stay playable (≥ 35% idle): ${short.map(r => `${r.id} ${pct(r.idle)}% (${r.events} encounters)`).join(', ')}`);
  // 2-4 players: around the 68% − ramp target (the event count is finer here: ~3-6 points per encounter)
  const team = [...new Set(rows.map(r => r.id))].map(id => {
    const rs = rows.filter(r => r.id === id && r.n > 1 && !(OUT[id] || []).includes(r.n));
    const dev = rs.length ? rs.reduce((s, r) => s + r.idle - r.aim, 0) / rs.length : 0;
    // (missions in spec only at ×2 — deep drift, nightmare, c7, c8 — have 1-2 heavy encounters there: one more is 10-45 points)
    return { id, ok: (rs.length < 2 || Math.abs(dev) <= 0.07) && rs.every(r => Math.abs(r.idle - r.aim) <= 0.15), per: rs.map(r => pct(r.idle)).join('/'), aim: (targetIdle(id, 2) * 100).toFixed(1) };
  });
  check(team.every(o => o.ok), `2-4 players: every mission near its target (68% − 0.5 per step; each within 15 points, a mission's mean within 7): ${team.map(o => `${o.id} ${o.per || '-'}/${o.aim}${o.ok ? '' : ' OFF'}`).join(', ')}`);
  check(rows.every(r => Math.abs(r.length - L) < 5), `every mission jumps at about ${L} s for every crew size`);
  const bad = rows.filter(r => r.verdict === 'impossible' && !(OUT[r.id] || []).includes(r.n));
  check(!bad.length, `no other mission is rated impossible${bad.map(r => `; ${r.name} ×${r.n} (${r.why.join('; ')})`).join('')}`);
}
process.exitCode = failed ? 1 : 0;
