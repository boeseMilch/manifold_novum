// The connection simulator's link and the server's flow control (tools/netlink.js), the rounded snapshots
// (js/net.js netSnapshotText), and server.js delaying a connection like a slow link (?lag=… or --lag …).
// Run: node tests/netlink.js
const { makeLink, makeFlow, linkOpts } = require('../tools/netlink');
const { measure } = require('../tools/netsim');
const { startServer } = require('../tools/testserver');
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. the link: latency, bandwidth (a queue: a big message delays the next), in order
{
  const L = makeLink({ lag: 100, bw: 800 });           // 800 kbit/s: 100 bytes a millisecond
  const a = L.send(1000, 0), b = L.send(100, 0), q0 = L.backlog(0), q20 = L.backlog(20), c = L.send(100, 50);
  check(a === 110 && b === 111, `100 ms + 1000 B at 800 kbit/s arrives at ${a} ms, a small one queued behind it at ${b} ms`);
  check(q0 === 1100 && q20 === 0 && c === 151, `the queue drains (backlog ${q0} B at once, ${q20} B 20 ms later)`);
  const J = makeLink({ lag: 50, jitter: 40 }); let last = 0, inOrder = true, spread = new Set();
  for (let t = 0; t < 1000; t += 10) { const at = J.send(10, t); if (at < last) inOrder = false; last = at; spread.add(Math.round(at - t)); }
  check(inOrder && spread.size > 10, `with jitter nothing overtakes (${spread.size} different delays)`);
  check(JSON.stringify(linkOpts((k) => ({ lag: '100', bw: '2000' })[k])) === '{"lag":100,"jitter":0,"bw":2000,"up":2000}' && linkOpts(() => null) === null,
    'link options from a URL query / the command line (up defaults to bw)');
}

// 2. flow control: snapshots acknowledged late (a queue the server can't see) mean "behind"
{
  const F = makeFlow();
  check(!F.behind(0), 'no acknowledgement yet: never behind (an older browser that sends none)');
  for (let n = 1; n <= 10; n++) { F.sent(n, n * 33); F.acked(n, n * 33 + 100); }
  check(!F.behind(340) && F.minRtt === 100, `acknowledged a round trip later: not behind (round trip ${F.minRtt} ms)`);
  F.sent(11, 363); F.sent(12, 396);
  check(!F.behind(500) && F.behind(700), 'a snapshot not back 150 ms after a round trip: behind');
  F.acked(12, 720);
  check(!F.behind(720), '…until it comes back');
  F.sent(13, 800);
  // nothing back for 2 s (a link seconds behind, a background tab): still behind, one probe a second goes out
  const let1 = [1200, 2700, 2900, 2933, 2967, 3500, 3867, 3900, 3933, 4900].filter(t => { const go = !F.behind(t); if (go) F.sent(14 + t, t); return go; });
  check(let1.join() === '2900,3900,4900', `nothing back for 2 s: it stays behind and lets one snapshot a second through as a probe (at ${let1.join(', ')} ms)`);
  F.acked(14 + 3900, 5000);
  check(!F.behind(5000) && !F.behind(5033), '…and the first probe acknowledged (the tab is back in front) ends it at once');
}

// 3. the same in the simulator: a 64 kbit/s link in a fight (the snapshots are ~80 kbit/s: a quarter too much for it).
// Without the rule the queue grows by about a quarter of a second every second, for as long as the fight lasts (the
// old rule only kicks in at 64 KB waiting, which this link takes 8 s to send); with it they stay a round trip old.
// 20 s, and the two compared with each other: after 12 s the run without the rule sat right on a fixed 2 s mark.
// (The simulator's dice are seeded: the same numbers every run.)
{
  const on = measure('busy', { lag: 100, bw: 64, seconds: 20 }), off = measure('busy', { lag: 100, bw: 64, seconds: 20, flow: false });
  check(on.snapshots.ageMs.p95 < 800 && off.snapshots.ageMs.p95 > 4 * on.snapshots.ageMs.p95,
    `at 64 kbit/s snapshots arrive ${on.snapshots.ageMs.mean} ms old (p95 ${on.snapshots.ageMs.p95}); without the acknowledgements ${off.snapshots.ageMs.mean} ms (p95 ${off.snapshots.ageMs.p95})`);
  check(on.snapshots.perSec > 15, `…fewer of them instead: ${on.snapshots.perSec} a second (${on.snapshots.skipped} skipped)`);
  const once = measure('busy', { lag: 100, bw: 64, seconds: 5 }), again = measure('busy', { lag: 100, bw: 64, seconds: 5 });
  check(JSON.stringify(again.snapshots) === JSON.stringify(once.snapshots) && once.snapshots.json.mean > 0, 'the simulator is repeatable: the same run again gives the same numbers');
  // a link far too slow (16 kbit/s): one probe a second while nothing comes back, instead of all 30 again after 2 s
  const thin = measure('busy', { lag: 100, bw: 16, seconds: 20 });
  check(thin.snapshots.ageMs.mean < 3500 && thin.snapshots.perSec < 8, `at 16 kbit/s the server holds back (${thin.snapshots.perSec} a second): snapshots ${thin.snapshots.ageMs.mean} ms old on average (p95 ${thin.snapshots.ageMs.p95}; 7 s when it gave up after 2 s)`);
}

// 3b. the browser's inputs: a 144 Hz screen on a 100 kbit/s uplink. One message per drawn frame is more than the
// uplink carries: they queue up and every key acts later and later. Sent when due (js/net.js netOutbox) they don't;
// and on a good link at 60 frames a second nothing is later than it was.
{
  const fast = { lag: 100, fps: 144, up: 100, seconds: 20 };
  const due = measure('walk', fast), each = measure('walk', { ...fast, inputs: 'frame' });
  check(due.own.inputs.perSec < 75 && due.own.inputs.ageMs.p95 < 150 && each.own.inputs.ageMs.last > 5 * due.own.inputs.ageMs.p95,
    `144 fps, 100 kbit/s up: ${due.own.inputs.perSec} inputs a second reach the server ${due.own.inputs.ageMs.p95} ms later (p95); one per frame: ${each.own.inputs.perSec} a second, the last one ${each.own.inputs.ageMs.last} ms late and growing`);
  const good = measure('walk', { lag: 100, seconds: 7 }), goodEach = measure('walk', { lag: 100, seconds: 7, inputs: 'frame' });
  check(good.own.keyToServerMs <= goodEach.own.keyToServerMs && good.own.keyToScreenMs <= goodEach.own.keyToScreenMs && good.own.offNoLag.max <= goodEach.own.offNoLag.max + 0.01 && good.own.inputs.perSec > 59,
    `a good link at 60 fps: nothing later than with one per frame (key → server ${Math.round(good.own.keyToServerMs)} ms, was ${Math.round(goodEach.own.keyToServerMs)}; ${good.own.inputs.perSec} inputs a second)`);
}

// 4. the snapshot as sent: numbers rounded to 3 decimals, except the crew and the doors (browsers replay their walk with those)
{
  const G = loadGame(['netServer', 'netSerialize', 'netSnapshotText', 'simTick', 'crew', 'combatSpawn']);
  G.netServer.init('c1', {}, 0); G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  G.crew[0].x = 22.123456789; G.combatSpawn('interceptor', 'port');
  for (let i = 0; i < 30; i++) G.simTick(1 / 60);
  const text = G.netSnapshotText(), raw = JSON.stringify(G.netSerialize()), s = JSON.parse(text), r = JSON.parse(raw);
  check(s.crew[0].x === r.crew[0].x && JSON.stringify(s.doors) === JSON.stringify(r.doors), 'crew and doors keep every digit');
  const e = s.combat.enemies[0], er = r.combat.enemies[0];
  check(e && Math.abs(e.x - er.x) <= 0.0005 && String(e.x).split('.')[1]?.length <= 3, `everything else to the millimetre (enemy x ${er.x} → ${e.x})`);
  check(Object.keys(s).sort().join() === Object.keys(r).sort().join(), 'the same fields');
  check(text.length < raw.length, `smaller (${text.length} / ${raw.length} characters)`);
}

// 5. server.js delays a connection like a slow link: ?lag=150 on the WebSocket, or --lag for everyone
async function rtt(port, query = '') {
  const ws = new WebSocket(`ws://localhost:${port}/ws${query}`);
  const got = [];
  ws.onmessage = (ev) => got.push([Date.now(), JSON.parse(ev.data)]);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const opened = Date.now();
  while (!got.some(([, m]) => m.t === 'games')) await sleep(5);
  const welcome = got.find(([, m]) => m.t === 'welcome')[0] - opened;
  const t0 = Date.now(); got.length = 0;
  ws.send(JSON.stringify({ t: 'games' }));
  while (!got.some(([, m]) => m.t === 'games')) await sleep(5);
  const trip = got[0][0] - t0;
  ws.close();
  return { welcome, trip };
}
const server = (args) => startServer(args);          // (on a free port of its own; throws when it doesn't come up: 'server: …' below)
(async () => {
  let a, b;
  try {
    a = await server([]);
    const plain = await rtt(a.port), slow = await rtt(a.port, '?lag=150');
    check(plain.trip < 100, `a plain connection answers at once (${plain.trip} ms there and back)`);
    check(slow.welcome >= 140 && slow.trip >= 290 && slow.trip < 600, `?lag=150: messages arrive 150 ms late (welcome after ${slow.welcome} ms, a request answered after ${slow.trip} ms)`);
    b = await server(['--lag', '120']);
    const all = await rtt(b.port);
    check(all.trip >= 230 && all.trip < 500, `node server.js <port> --lag 120 delays every connection (${all.trip} ms there and back)`);
  } catch (e) { check(false, 'server: ' + e.message); }
  finally { a?.srv.kill(); b?.srv.kill(); }
  console.log(failed ? `\n${failed} failed` : '\nall link tests passed');
  process.exitCode = failed ? 1 : 0;
})();
