// The balance model's inputs: the saved travel table (tools/travel-table.json), the saved damage rates
// (tools/damage-rates.json), fire spreading (tools/balance.js spread()), and its shortcuts: one sandbox for every
// build's layout, the energy as plain numbers (energyFast) instead of the game's code (energySimGame).
// Run: node tests/balancemodel.js
const fs = require('fs'), path = require('path');
const { travel, tableTrip, SPOTS, VARIANTS } = require('../tools/travel');
const B = require('../tools/balance'), { spread, fireWork, A } = B;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// --- the travel table: every pair of SPOTS in every variant, and still what walking measures
{
  const missing = [];
  for (const v of Object.keys(VARIANTS)) for (const a of SPOTS) for (const b of SPOTS) if (a !== b && !tableTrip(a, b, VARIANTS[v])) missing.push(`${v}: ${a} → ${b}`);
  check(!missing.length, `travel table has all ${SPOTS.length * (SPOTS.length - 1)} trips in ${Object.keys(VARIANTS).length} variants${missing.length ? ' (missing ' + missing.slice(0, 3).join(', ') + ', ... — node tools/travel.js --table)' : ''}`);
  for (const [a, b, o] of [['reactor', 'Front cannon', {}], ['bridge', 'Right outer airlock', { boots: true }]]) {
    const t = tableTrip(a, b, o), r = travel(a, b, o), live = r.best.at ?? r.best.enter;
    check(t && Math.abs(t[0] - live) < 0.5, `table trip ${a} → ${b}${o.boots ? ' (boots)' : ''} matches a fresh walk (${t?.[0]} vs ${live?.toFixed(2)} s; else the ship changed: node tools/travel.js --table)`);
  }
  const plain = tableTrip('reactor', 'Left cannon', {}), boots = tableTrip('reactor', 'Left cannon', { boots: true });
  check(boots[0] < plain[0], `gravity boots make trips shorter (${plain[0]} → ${boots[0]} s)`);
}

// --- fire spreading: nothing before the first period, more fires and burnt-out parts the longer they wait, never past the room
{
  const s0 = spread(1, 0, false), s15 = spread(1, 15, false), s60 = spread(1, 60, false), sLong = spread(1, 600, false);
  check(s0.fires === 1 && s0.broken === 0, 'a fire reached at once: one fire, nothing burnt out');
  check(s15.fires > 1 && s15.broken > 0.3 && s15.broken < 0.4, `after one FIRE_TIME: 1/3 burnt out, a bit more fire (${s15.fires.toFixed(2)} fires, ${s15.broken.toFixed(2)} parts)`);
  check(s60.fires > s15.fires && s60.broken > s15.broken, `after 60 s: worse (${s60.fires.toFixed(2)} fires, ${s60.broken.toFixed(2)} parts)`);
  check(sLong.fires <= A.FIRE_REACH && sLong.broken <= A.FIRE_REACH, `left alone for 10 min it stays within its reach (${sLong.fires.toFixed(1)} fires, ${sLong.broken.toFixed(1)} parts ≤ ${A.FIRE_REACH})`);
  const p = spread(1, 30, true);
  check(p.broken > s60.broken, `plasma fires burn out parts much faster (${p.broken.toFixed(2)} parts in 30 s)`);
  const w0 = fireWork({ n: 0.1, plasma: 0 }, 0), w45 = fireWork({ n: 0.1, plasma: 0 }, 45);
  check(w45.work > w0.work * 2 && w45.weight > w0.weight, `a likely fire left 45 s costs much more work (${w0.work.toFixed(2)} → ${w45.work.toFixed(2)} s)`);
}

// --- the layout: one reused sandbox (and the layout cached without the cells / reactor / overcharge) = a fresh sandbox
// and a full startMission for every build, as before
{
  const strip = (b) => JSON.stringify({ ...b, g: undefined });
  let n = 0, bad = [];
  for (const [id, k] of [['intro', 1], ['c2', 3], ['c5', 2], ['c8', 8], ['deep', 4]])
    for (const ship of [{}, { caps: true, cannons: true, inserter: true, spareCell: true }])
      for (const over of [{}, { events: 6, cells: 2, overcharge: true, reactor: 0.6 }, { events: 6 }]) {
        n++;
        if (strip(B.setup(id, k, ship, 4242 + k, over)) !== strip(B.setup(id, k, ship, 4242 + k, over, undefined, true))) bad.push(`${id} ×${k} ${JSON.stringify(ship)} ${JSON.stringify(over)}`);
      }
  check(!bad.length, `the reused layout sandbox gives the same ${n} builds as a fresh one each${bad.length ? ': not ' + bad.slice(0, 3).join('; ') : ''}`);
}

// --- the energy: energyFast (plain numbers) gives exactly what energySimGame (the game's own code) gives, on real
// plans (both passes, every mode) and on random ones (fights, shields, scrams, ion storms, the freezer, leeches drinking, low fuel,
// overcharge, the inserter)
{
  const out = (e) => JSON.stringify([e.waits, e.waitByKey, e.unmet, e.jumpOk, e.jumpWait, e.perSide, e.leverTrips, e.refuels, e.ocFires, e.produced, e.demand, e.supply, e.interval, e.cells]);
  let n = 0, tg = 0, tf = 0; const bad = [];
  const cmp = (b, plan, mode, label) => {
    let t = Date.now(); const a = B.energySimGame(b, plan, mode); tg += Date.now() - t;
    t = Date.now(); const f = B.energyFast(b, plan, mode); tf += Date.now() - t;
    n++; if (out(a) !== out(f)) bad.push(`${label} ${mode}`);
    return a;
  };
  for (const [id, k] of [['c1', 1], ['c3', 2], ['c5', 4], ['c6', 3], ['c8', 8], ['rush', 2]]) {
    const kit = B.expectedKit(id), ship = Object.fromEntries([...(kit?.ship || []), ...(B.game().MISSIONS[id].needs?.ship || [])].map(u => [u, true]));
    const b = B.setup(id, k, ship, 99 + k), s1 = B.schedule(b, {});
    const e1 = cmp(b, s1.plan, 'real', `${id} ×${k}`), s2 = B.schedule(b, e1.waitByKey);
    for (const mode of ['real', 'best', 'auto']) cmp(b, s2.plan, mode, `${id} ×${k} (pass 2)`);
  }
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, pick = (a) => a[Math.floor(rnd() * a.length)], sides = ['port', 'front', 'star'];
  for (let i = 0; i < 40; i++) {
    const b0 = B.setup('intro', 1 + Math.floor(rnd() * 4), { inserter: rnd() < 0.3, caps: rnd() < 0.4, cannons: rnd() < 0.4, shields: rnd() < 0.3 }, 7), jumpAt = 120 + rnd() * 150;
    const b = { ...b0, factor: 0.3 + rnd() * 1.5, overcharge: rnd() < 0.25, energy: { ...b0.energy, cells: 1 + Math.floor(rnd() * 6) } };
    const plan = { jumpAt, window: 15, end: jumpAt + 2, drains: [], bonusCells: rnd() < 0.2 ? 1 : 0,
      fights: Array.from({ length: Math.floor(rnd() * 14) }, (_, j) => ({ key: 'f' + j % 5, gun: pick(sides), t0: rnd() * jumpAt, shots: 1 + Math.floor(rnd() * 20), span: 1 + rnd() * 30 })),
      shields: Array.from({ length: Math.floor(rnd() * 8) }, (_, j) => ({ key: 's' + j, side: pick(sides), t: rnd() * jumpAt })),
      scrams: Array.from({ length: Math.floor(rnd() * 3) }, () => { const a = rnd() * jumpAt; return [a, a + rnd() * 40]; }),
      storms: Array.from({ length: Math.floor(rnd() * 3) }, () => rnd() * jumpAt),
      freezers: rnd() < 0.3 ? [(() => { const t0 = rnd() * jumpAt; return { key: 'z', cap: Math.floor(rnd() * 3), t0, t1: t0 + rnd() * 80, every: 3 + rnd() * 10 }; })()] : [],
      sucks: Array.from({ length: rnd() < 0.5 ? Math.floor(rnd() * 3) + 1 : 0 }, (_, j) => { const from = rnd() * jumpAt; return { key: 'l' + j, cap: Math.floor(rnd() * 3), n: 1 + Math.floor(rnd() * 6), from, until: from + rnd() * 70 }; }) };   // (leeches drinking)
    for (const mode of ['real', 'best', 'auto']) cmp(b, plan, mode, `random plan ${i}`);
  }
  check(!bad.length, `the fast energy model = the game's code in ${n} runs (game ${tg} ms, fast ${tf} ms)${bad.length ? ': not ' + bad.slice(0, 4).join('; ') : ''}`);
}

// --- the damage rates: saved for every kind, and still what the game measures (else: node tools/balance.js --rates)
{
  const file = path.join(__dirname, '..', 'tools', 'damage-rates.json'), saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).kinds : {};
  const missing = B.RATE_KINDS.filter(k => !saved[k] || saved[k].W !== 60 || String(saved[k].seeds) !== '1,2,3');
  check(!missing.length, `tools/damage-rates.json has all ${B.RATE_KINDS.length} kinds${missing.length ? ' (missing ' + missing.join(', ') + ': node tools/balance.js --rates)' : ''}`);
  for (const k of ['interceptor', 'mines']) {
    const live = B.calibrate(k, 60, [1, 2, 3], true), s = saved[k] || {}, used = (c) => JSON.stringify([c.smallRate, c.largeRate, c.first]);   // (what the model reads)
    check(used(live) === used(s), `saved ${k} rates match a fresh measurement (${s.small?.toFixed(1)} small / ${s.large?.toFixed(1)} big hits in 60 s vs ${live.small.toFixed(1)} / ${live.large.toFixed(1)}; else the game changed: node tools/balance.js --rates)`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exitCode = failed ? 1 : 0;
