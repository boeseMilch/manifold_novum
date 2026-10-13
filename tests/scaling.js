// Crew-size scaling: the time between encounters shrinks with crewPace(n) = 1/sqrt(n), the reactor runs
// 1/crewPace(n) times as fast, every extra crew member brings a spare fuel cell, and joining / leaving
// mid-mission re-times what hasn't happened yet. Last: tools/balance.js runs and rates every mission.
// Run: node tests/scaling.js
const { loadGame } = require('./harness');
const NAMES = ['crewPace', 'crewSize', 'crew', 'makeCrew', 'startMission', 'mission', 'simTick', 'power', 'MISSIONS', 'CAMPAIGN', 'JUMP_DELAY',
  'ENERGY_TIME', 'CELL_ENERGY', 'reactorSpeed', 'netServer', 'combat'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// A fresh game with n crew aboard at mission start (same random seed: same kinds and sides).
function withCrew(n, id = 'intro', seed = 7, ship = {}) {
  const G = loadGame(NAMES);
  while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  const keep = Math.random; Math.random = mulberry(seed);
  try { G.startMission(id, { ship }); } finally { Math.random = keep; }
  return G;
}
const calm = (G) => { G.combat.enemies = []; };

// --- f(n)
{
  const G = loadGame(NAMES), f = [1, 2, 3, 4, 8].map(n => G.crewPace(n));
  check(near(f[0], 1) && near(f[1], 0.7071, 1e-4) && near(f[2], 0.5774, 1e-4) && near(f[3], 0.5) && near(f[4], 0.3536, 1e-4),
        `crewPace(1, 2, 3, 4, 8) = ${f.map(v => v.toFixed(2)).join(', ')} (100%, ~70%, ~60%, 50%, 35% of the solo gaps)`);
  check(G.crewPace(0) === 1, 'no crew counts as one player');
}

// --- re-timed timelines for 1, 2, 4 players: same order and kinds, gaps scaled, lead-in and jump delay kept
for (const id of ['intro', 'rush', 'pirates', 'c3', 'c7']) {
  const solo = withCrew(1, id), ev1 = solo.mission.events;
  for (const n of [2, 4]) {
    const G = withCrew(n, id), ev = G.mission.events, f = G.crewPace(n);
    const sameKinds = ev.map(e => e.kind + (e.side || '')).join() === ev1.map(e => e.kind + (e.side || '')).join();
    const lead = Math.min(...ev1.map(e => e.t));
    const scaled = ev.every((e, i) => near(e.t, lead + (ev1[i].t - lead) * f, 1e-9));
    const order = [...ev].sort((a, b) => a.t - b.t).map(e => e.id).join() === [...ev1].sort((a, b) => a.t - b.t).map(e => e.id).join();
    const last = Math.max(...ev.map(e => e.t));
    check(sameKinds && scaled && order && near(G.mission.jumpAt, last + G.JUMP_DELAY),
          `${G.MISSIONS[id].name}, ${n} players: same ${ev.length} events in the same order, gaps × ${f.toFixed(2)}, first at ${lead} s, jump ${G.JUMP_DELAY} s after the last (${solo.mission.jumpAt.toFixed(0)} → ${G.mission.jumpAt.toFixed(0)} s)`);
  }
}
{
  const G = withCrew(1, 'intro'), ev = G.mission.events;
  check(ev.map(e => e.t).join() === '40,100,160,220,280' && G.mission.jumpAt === 302, 'solo timelines are unchanged (intro: 40, 100, 160, 220, 280; jump at 302)');
  const P = withCrew(4, 'practice');
  check(P.mission.jumpAt === Infinity && !P.mission.events.length, 'practice: still no timeline, no jump');
}

// --- the server's way: startMission with nobody aboard, crew added right after, first tick re-times
{
  const G = loadGame(NAMES);
  G.netServer.init('intro', {});
  const t0 = G.mission.events.map(e => e.t);
  for (let i = 1; i <= 3; i++) G.netServer.addCrew(i, 'P' + i, null);
  G.simTick(DT);
  const f = G.crewPace(3), ok = G.mission.events.every((e, i) => near(e.t, 40 + (t0[i] - 40) * f, 1e-9));
  check(ok && G.mission.paceN === 3, `server start (crew added after startMission): re-timed for 3 on the first tick (${G.mission.events.map(e => e.t.toFixed(0)).join(', ')})`);
  check(G.power.reserve === 3 + 2, `…and 2 extra spare fuel cells for the 2 extra crew (${G.power.reserve} in the crate)`);
}

// --- mid-mission join and leave: only events that haven't started move; the jump keeps its distance
{
  const G = withCrew(1, 'intro'); calm(G);
  for (let i = 0; i < 50 * 60; i++) { G.simTick(DT); calm(G); }              // t = 50: the interceptor (40) has happened
  const before = G.mission.events.map(e => ({ t: e.t, done: e.done })), jump0 = G.mission.jumpAt, now = G.mission.t, cells0 = G.power.reserve;
  G.crew.push(G.makeCrew('Late joiner')); G.simTick(DT);
  const f = G.crewPace(2), at = G.mission.t;                                  // (re-timed at the start of this tick)
  const doneSame = G.mission.events.every((e, i) => !before[i].done || e.t === before[i].t);
  const pendingScaled = G.mission.events.every((e, i) => before[i].done || near(e.t, at + (before[i].t - at) * f, 1e-6));
  const lastOld = Math.max(...before.map(e => e.t)), lastNew = Math.max(...G.mission.events.map(e => e.t));
  check(doneSame && pendingScaled, `someone joins at ${now.toFixed(0)} s: what has happened stays, the rest moves closer (${before.map(e => e.t.toFixed(0)).join(', ')} → ${G.mission.events.map(e => e.t.toFixed(0)).join(', ')})`);
  check(near(G.mission.jumpAt - lastNew, jump0 - lastOld, 1e-6), `the jump stays ${G.JUMP_DELAY} s after the last event (${jump0.toFixed(0)} → ${G.mission.jumpAt.toFixed(0)} s)`);
  check(G.power.reserve === cells0 + 1, 'the joiner brings a spare fuel cell');
  for (let i = 0; i < 10 * 60; i++) { G.simTick(DT); calm(G); }
  const mid = G.mission.events.map(e => ({ t: e.t, done: e.done })), now2 = G.mission.t;
  G.crew.pop(); G.simTick(DT);
  const at2 = G.mission.t, back = G.mission.events.every((e, i) => mid[i].done || near(e.t, at2 + (mid[i].t - at2) / f, 1e-6));
  check(back && G.mission.paceN === 1, `they leave at ${now2.toFixed(0)} s: the remaining gaps stretch back to the solo pace (${G.mission.events.map(e => e.t.toFixed(0)).join(', ')})`);
  check(G.power.reserve === cells0 + 1, 'leaving doesn\'t take the cell away');
  G.crew.push(G.makeCrew('Back again')); G.simTick(DT);
  check(G.power.reserve === cells0 + 1, '…and rejoining doesn\'t add another one');
  const order = [...G.mission.events].sort((a, b) => a.t - b.t).map(e => e.kind).join();
  check(order === 'interceptor,maintenance,frigate,swarm,intruder', 'the order never changes');
}
{
  // a join during the lead-in: the first event keeps its time, the gaps after it scale
  const G = withCrew(1, 'intro'); calm(G);
  for (let i = 0; i < 10 * 60; i++) G.simTick(DT);
  G.crew.push(G.makeCrew('B')); G.simTick(DT);
  const f = G.crewPace(2), ev = G.mission.events;
  check(ev[0].t === 40 && ev.every((e, i) => near(e.t, 40 + ([40, 100, 160, 220, 280][i] - 40) * f, 1e-6)), `a join during the lead-in: the first event stays at 40 s (${ev.map(e => e.t.toFixed(0)).join(', ')})`);
}

// --- the reactor and the fuel per crew size
for (const n of [1, 2, 4, 8]) {
  const G = withCrew(n, 'intro'); G.power.reactor.t = 0;
  const fuel0 = G.power.reactor.fuel; let t = 0;
  while (G.power.reactor.fuel === fuel0 && t < 30) { G.simTick(DT); t += DT; G.combat.enemies = []; }
  const want = G.ENERGY_TIME * G.crewPace(n);
  check(Math.abs(t - want) < 0.05 && G.power.reserve === 3 + n - 1, `${n} player${n > 1 ? 's' : ''}: an energy every ${t.toFixed(1)} s (${want.toFixed(1)}), ${G.power.reserve} spare cells`);
}
{
  const G = withCrew(4, 'intro'); G.power.overcharge = true;
  check(near(G.reactorSpeed(), 4), 'overcharged with 4 players: 4× the solo speed (2 for the crew, 2 for the overcharge)');
  const S = withCrew(2, 'intro', 7, { spareCell: true });
  check(S.power.reserve === 3 + 1 + 1, 'the spare cell upgrade still adds its cell on top (2 players: 5)');
}

// --- the balance model: runs, and rates every mission for 1-4 players
{
  const { balance } = require('../tools/balance');
  const t0 = Date.now();
  const rows = balance({ players: [1, 2, 3, 4], runs: 3 });
  check(rows.length === 16 * 4 && rows.every(r => r.verdict && Number.isFinite(r.score)), `tools/balance.js rates ${rows.length / 4} missions × 4 crew sizes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  // Beyond the model's crew at every size (unchanged solo, so not from the scaling; see the balance
  // section in PLAN.md for the proposals). Everything else must come out doable or tight for 1-4 players.
  const KNOWN = { deep: [1, 2, 3, 4], nightmare: [1, 2, 3, 4], c7: [1, 2, 3, 4], c8: [1, 2, 3, 4], c4: [1, 2], pirates: [1] };
  const bad = rows.filter(r => r.verdict === 'impossible' && !(KNOWN[r.id] || []).includes(r.n));
  check(!bad.length, `every other mission is at least doable / tight for 1-4 players${bad.length ? ': not ' + bad.map(r => `${r.name} ×${r.n} (${r.why.join('; ')})`).join(', ') : ''}`);
  const known = Object.entries(KNOWN).flatMap(([id, ns]) => ns.map(n => rows.find(r => r.id === id && r.n === n)));
  console.log(`      (rated impossible by the model: ${known.filter(r => r.verdict === 'impossible').map(r => `${r.name} ×${r.n}`).join(', ')})`);
  const worse = ['intro', 'rush', 'ore', 'pirates', 'salvage', 'rescue', ...rows.filter(r => r.campaign).map(r => r.id)].filter((id, i, a) => a.indexOf(id) === i)
    .filter(id => { const s = (n) => rows.find(r => r.id === id && r.n === n).score; return s(4) > s(1) + 5; });
  check(!worse.length, `no mission gets clearly harder with 4 players than solo${worse.length ? ': ' + worse.join(', ') : ''}`);
}
process.exitCode = failed ? 1 : 0;
