// The balance model's inputs: the saved travel table (tools/travel-table.json) and fire spreading (tools/balance.js spread()).
// Run: node tests/balancemodel.js
const { travel, tableTrip, SPOTS, VARIANTS } = require('../tools/travel');
const { spread, fireWork, A } = require('../tools/balance');
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

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exitCode = failed ? 1 : 0;
