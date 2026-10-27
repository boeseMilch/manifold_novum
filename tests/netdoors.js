// Multiplayer at doors over a slow link (the connection simulator, tools/netsim.js: 100 ms each way, also with
// jitter). The browser predicts your walk against the same walls and the same (predicted) door states as the
// server and replays your inputs from the server's position: running into a door never shows you sliding into
// the wall beside it and snapping back, a door opens for you as you get there (not a round trip later), and a
// doorway locked in front of you stops you where the server stops you. Run: node tests/netdoors.js
const { measure } = require('../tools/netsim');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const ms = (v) => (v == null ? 'never' : `${Math.round(v)} ms`);

// 1. at an angle into the frame of a closed doorway while it opens (the user's "drift into the wall")
for (const jitter of [0, 40]) {
  const m = measure('frame', { lag: 100, jitter }), o = m.own, link = `100 ms each way${jitter ? ` + ${jitter} jitter` : ''}`;
  check(o.wallFrames === 0, `${link}, at an angle into a doorway's frame: never shown inside the wall (${o.wallFrames} frames)`);
  check(o.throughDoorMs != null && o.throughDoorMs - o.throughDoorMsNoLag <= 34,
    `…and through the doorway when it opens, as without lag (${ms(o.throughDoorMs)}, no lag ${ms(o.throughDoorMsNoLag)})`);
  check(o.offNoLag.max < 0.15 && o.jumps === 0, `…shown at most ${o.offNoLag.max} m off the no-lag walk, ${o.jumps} jumps`);
}

// 2. into a locked doorway head-on, pushing, then along it: you stay where the server has you
{
  const m = measure('door', { lag: 100 }), o = m.own;
  check(o.wallFrames === 0 && o.jumps === 0, `against a locked doorway: never in the wall, no jumps (${o.wallFrames} frames, ${o.jumps} jumps)`);
  check(o.offNoLag.max < 0.1, `…shown as without lag (at most ${o.offNoLag.max} m off)`);
}

// 3. the open doorway gets locked as you reach it: it shuts in front of you, no walking into it and being pulled back
{
  const m = measure('lock', { lag: 100 }), o = m.own;
  check(o.wallFrames === 0 && o.jumps === 0, `a doorway locked as you reach it: never in the wall, no jumps (${o.wallFrames} frames, ${o.jumps} jumps)`);
  check(o.offNoLag.max < 0.1, `…you stop at it like without lag (at most ${o.offNoLag.max} m off)`);
}

// 4. walking through a doorway (it opens as you get there) and about: same walk as without lag
{
  const m = measure('walk', { lag: 100 }), o = m.own;
  check(o.throughDoorMs != null && o.throughDoorMs - o.throughDoorMsNoLag <= 17,
    `the doorway opens as you get there, not a round trip later (through at ${ms(o.throughDoorMs)}, no lag ${ms(o.throughDoorMsNoLag)})`);
  check(o.offNoLag.max < 0.05 && o.wallFrames === 0, `…the whole walk shows as without lag (at most ${o.offNoLag.max} m off, ${o.wallFrames} frames in a wall)`);
  check(m.others.crew.p95 < 0.55, `the other player is shown near where the server has them now (p95 ${m.others.crew.p95} m off; moved on by their speed)`);
}

console.log(failed ? `\n${failed} failed` : '\nall door-prediction tests passed');
process.exitCode = failed ? 1 : 0;
