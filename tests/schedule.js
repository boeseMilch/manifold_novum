// The skirmish schedule (2026-10-26, the user: "3 encounters in min 1, then nothing for 3 minutes"): many custom
// skirmishes (encounter counts, crew sizes, seeds) are evenly spread: no three arrivals within one step (the even gap),
// no two closer than half a step, no gap longer than one and a half; the count and the kinds as asked. And the herds:
// a spore mother and spore clouds never come as one herd (the user: "they're not similar"), drawn or in a chapter.
// Run: node tests/schedule.js
const { loadGame } = require('./harness');
const NAMES = ['crew', 'makeCrew', 'startMission', 'mission', 'MISSIONS', 'CAMPAIGN', 'MISSION_LENGTH', 'makeEvent', 'herdPair', 'herdOk', 'customFailures'];
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const G0 = loadGame(NAMES), L = G0.MISSION_LENGTH;
function run(G, id, n, seed, opts) {
  while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  const keep = Math.random; Math.random = mulberry(seed);
  try { G.startMission(id, opts); } finally { Math.random = keep; }
  return [...G.mission.events].sort((a, b) => a.t - b.t);
}

// --- skirmish schedules: spread out
{
  let bad = [], runs = 0, example = '';
  for (const count of [2, 3, 4, 5, 6, 8, 10, 15, 20, 30]) for (const crew of [1, 2, 3, 4, 8]) for (let seed = 1; seed <= 12; seed++) {
    const G = loadGame(NAMES), ev = run(G, 'custom', crew, seed * 97 + count, { custom: { n: count } }), t = ev.map(e => e.t); runs++;
    const step = (t[t.length - 1] - t[0]) / (t.length - 1), gaps = t.slice(1).map((x, i) => x - t[i]);
    const why = [];
    if (ev.length !== count) why.push(`${ev.length} events for ${count}`);
    if (t[0] > 30 || t[t.length - 1] > L) why.push(`first at ${t[0]}, last at ${t[t.length - 1]}`);
    if (count >= 3 && gaps.some(g => g < step / 2 - 1e-6)) why.push(`a gap of ${Math.min(...gaps).toFixed(1)} s (step ${step.toFixed(1)})`);
    if (count >= 3 && t.some((x, i) => i >= 2 && x - t[i - 2] < step - 1e-6)) why.push('three arrivals within one step');
    if (count >= 3 && gaps.some(g => g > step * 1.5 + 1e-6)) why.push(`a gap of ${Math.max(...gaps).toFixed(1)} s (step ${step.toFixed(1)})`);
    if (count >= 5 && (t.filter(x => x <= 60).length > Math.ceil(count / 5) + 1 || gaps.some(g => g > Math.max(60, 1.5 * L / count)))) why.push('bunched in the first minute or a long empty stretch');
    if (why.length) bad.push(`n=${count} crew=${crew} seed=${seed}: ${why.join('; ')} (${t.map(x => x.toFixed(0)).join(', ')})`);
    if (count === 5 && crew === 2 && seed === 1) example = ev.map(e => `${e.t.toFixed(0)} ${e.kind}`).join(', ');
  }
  check(!bad.length, `${runs} skirmish schedules spread out: no 3 arrivals within one even step, gaps between ½ and 1½ steps (5 encounters, 2 crew: ${example})${bad.length ? '\n      ' + bad.slice(0, 8).join('\n      ') : ''}`);
}
// --- the count and the kinds as asked (only the times changed): the failing parts within customFailures, the rest ticked kinds
{
  let ok = true;
  for (let seed = 1; seed <= 30; seed++) {
    const kinds = ['interceptor', 'mother', 'spores', 'herd'], G = loadGame(NAMES), ev = run(G, 'custom', 1 + seed % 4, seed, { custom: { n: 9, kinds } });
    const [lo, hi] = G.customFailures(9), m = ev.filter(e => e.kind === 'maintenance').length;
    if (ev.length !== 9 || m < lo || m > hi || ev.some(e => e.kind !== 'maintenance' && !kinds.includes(e.kind))) ok = false;
  }
  check(ok, 'a skirmish keeps its encounter count, failing parts and ticked kinds');
}
// --- the chapters keep their shape (shaped / even / written, not the skirmish's spread)
{
  const shaped = G0.CAMPAIGN.filter(id => !G0.MISSIONS[id].spacing), G = loadGame(NAMES), ev = run(G, shaped[0], 2, 5, {});
  check(ev.length >= 3 && ev[0].t === 10 && ev[1].t === 28 && G0.CAMPAIGN.every(id => G0.MISSIONS[id].spacing !== 'spread') && G0.MISSIONS.custom.spacing === 'spread',
        `the chapters keep their own timeline (${shaped[0]}, 2 crew: ${ev.map(e => e.t.toFixed(0)).join(', ')})`);
}
// --- spore mother + spore clouds are never one herd
{
  const apart = (k) => !(k.includes('mother') && k.includes('spores'));
  let ok = true; const seen = new Set();
  for (let i = 0; i < 2000; i++) { const p = G0.herdPair(); seen.add([...p].sort().join('+')); if (p.length !== 2 || p[0] === p[1] || !apart(p)) ok = false; }
  for (let i = 0; i < 300; i++) if (!apart(G0.makeEvent('herd', 50, null).kinds)) ok = false;
  check(ok && seen.size === 5 && !G0.herdOk(['spores', 'mother']) && G0.herdOk(['mother', 'leeches']), `a drawn herd never pairs the spore mother with spore clouds (pairs seen: ${[...seen].sort().join(', ')})`);
  let bad = [];
  for (const id of [...G0.CAMPAIGN, 'custom']) for (const crew of [1, 2, 4, 8]) for (let seed = 1; seed <= 8; seed++) {
    const G = loadGame(NAMES), ev = run(G, id, crew, seed, id === 'custom' ? { custom: { n: 20, kinds: ['herd', 'mother', 'spores'] } } : {});
    for (const e of ev) if (e.kind === 'herd' && !apart(e.kinds || [])) bad.push(`${id} ×${crew}: ${e.kinds.join('+')}`);
  }
  check(!bad.length, `no chapter or skirmish has a spore mother + spore cloud herd${bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
