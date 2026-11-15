// The automatic resolution (js/gfx.js autoScaler; 2026-11-14: a laptop with integrated graphics drew the game at
// 12 fps, split screen at 6): a factor on the internal resolution steered by the frame times. Here it runs against
// model machines (a GPU whose time goes with the pixels, a script that takes its own time, a screen that shows
// whole refreshes only): it has to find a resolution the machine draws smoothly, leave a fast machine and a
// script-bound one alone, come back up when there is room, and not pump up and down.
// Run: node tests/gfxauto.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const { GFX } = loadGame(['GFX']), A = GFX.AUTO;

// One machine: gpu(t) ms for a full-resolution frame (∝ a², plus `fixed` ms that don't shrink), js ms of script per
// view, `views` on one thread, a screen of `hz` that shows whole refreshes only. The script of the next frame may
// run while the GPU still draws this one (one frame queued, as browsers do), so a GPU that needs 41 ms shows frames
// of 33 and 50 ms in turn. Runs S for `secs` seconds from t0 → the changes [{ t (s), a, ms }].
function run(S, secs, M, t0 = 0) {
  const R = 1000 / (M.hz || 60), views = M.views || 1, js = M.js ?? 4, gpu = typeof M.gpu === 'function' ? M.gpu : () => M.gpu;
  const changes = [], a0 = S.a, spent = new Map(), T0 = t0 * 1000;
  let start = T0, done = T0, shown = T0, slow = 0, low = S.a, under = 0;   // this frame's script start, GPU finish, on screen
  while (start < T0 + secs * 1000) {
    const next = Math.ceil((Math.max(start + js * views, shown - R) - 1e-6) / R) * R;   // (the next frame's script: on a refresh, when the thread is free)
    const dt = Math.max(R, next - start); start += dt;
    done = Math.max(done, start + js * views) + gpu(start / 1000) * S.a * S.a + (M.fixed || 0);
    shown = Math.max(Math.ceil((done - 1e-6) / R) * R, shown + R);
    if (dt > 20) slow += dt; if (S.a < a0 - 1e-9) under += dt;
    spent.set(S.a, (spent.get(S.a) || 0) + dt);
    if (S.frame(dt, js, views, M.min ?? 0.4)) changes.push({ t: start / 1000, a: S.a, ms: dt });
    low = Math.min(low, S.a);
  }
  run.slow = slow / (secs * 1000);                     // the share of the time spent in frames slower than 50 a second
  run.low = low;                                       // the lowest it went (a step up being tried is above it)
  run.under = under / (secs * 1000);                   // the share of the time below where it started
  run.at = [...spent.entries()].sort((p, q) => q[1] - p[1])[0][0];   // where it was most of the time
  return changes;
}
const fmt = (a) => a.toFixed(2);

// a machine that draws it easily: nothing changes
{
  const S = GFX.autoScaler(), ch = run(S, 120, { gpu: 5 });
  check(S.a === 1 && !ch.length, 'a fast machine (5 ms of GPU a frame): full resolution, never touched in two minutes');
  const S2 = GFX.autoScaler(), ch2 = run(S2, 120, { gpu: 5, hz: 144 });
  check(S2.a === 1 && !ch2.length, '…at 144 Hz too');
}
// the laptop: 56 ms of GPU a frame at the full resolution
{
  const S = GFX.autoScaler(), M = { gpu: 56 }, ch = run(S, 6, M);
  const settled = ch.find(c => c.a <= Math.sqrt(16.6 / 56)), found = run.low;
  check(settled && settled.t < 4, `integrated graphics (56 ms a frame at full resolution): smooth after ${settled?.t.toFixed(1)} s, at ${fmt(found)} of the resolution`);
  check(found >= 0.4 && found * found * 56 <= 16.7 && found * found * 56 >= 7, `…and not lower than it needs: ${(found * found * 56).toFixed(1)} ms of GPU a frame`);
  // then ten minutes of play: it asks for more now and then, goes back, and asks less and less often
  const later = run(S, 600, M, 6), tries = later.filter((c, i) => c.a > (i ? later[i - 1].a : found));
  const gaps = tries.map((c, i) => (i ? c.t - tries[i - 1].t : 0)).slice(1);
  check(run.low === found && run.slow < 0.02, `ten minutes on: still at ${fmt(run.low)}, ${(run.slow * 100).toFixed(1)} % of the time in slower frames (the tries for more)`);
  check(tries.length >= 4 && tries.length <= 8 && gaps[gaps.length - 1] >= 150, `it tried for more ${tries.length} times, ever less often (${gaps.map(g => Math.round(g)).join(', ')} s apart; ${A.WAIT[1]} s at most)`);
  check(S.wait === A.WAIT[1], `…and what it learned is kept for the next page: wait ${S.wait} s`);
  const N = GFX.autoScaler({ a: found, wait: S.wait }), first = run(N, 60, M);
  check(N.a === found && !first.length && run.slow === 0, `the next mission (a fresh page) starts at ${fmt(N.a)}: smooth from its first frame, nothing tried in its first minute`);
}
// a little too slow: a little less
{
  const S = GFX.autoScaler(); run(S, 30, { gpu: 24 }); run(S, 60, { gpu: 24 }, 30);   // (run.at: the minute after it settled)
  check(run.at >= 0.75 && run.at < 1 && run.at * run.at * 24 <= A.GOOD, `a little too slow (24 ms a frame, 42 a second): ${fmt(run.at)} of the resolution makes it ${(run.at * run.at * 24).toFixed(1)} ms`);
  const S2 = GFX.autoScaler(); run(S2, 30, { gpu: 24, hz: 120 }); run(S2, 60, { gpu: 24, hz: 120 }, 30);
  check(run.at >= 0.75 && run.at < 1 && run.at * run.at * 24 <= A.GOOD, `…the same on a 120 Hz screen (${fmt(run.at)})`);
  const S3 = GFX.autoScaler(); run(S3, 90, { gpu: 15, hz: 120 });
  check(S3.a === 1, '…and 15 ms there is 60 a second already: left alone (120 a second is not the aim)');
  const S4 = GFX.autoScaler(), ch4 = run(S4, 120, { gpu: 13.5, js: 4 });
  check(S4.a === 1 && !ch4.length, 'a frame late now and then (17.5 ms on a 60 Hz screen, 57 a second): left alone');
}
// the load goes away (another program stopped using the GPU): back up to the full resolution
{
  const S = GFX.autoScaler(), M = { gpu: (t) => (t < 30 ? 56 : 6) };
  run(S, 30, M); const low = S.a; const ch = run(S, 60, M, 30);
  check(low < 0.6 && S.a === 1 && ch[ch.length - 1].t < 60, `the GPU gets its time back (56 → 6 ms): from ${fmt(low)} up to the full resolution again within ${(ch[ch.length - 1].t - 30).toFixed(0)} s`);
}
// the script is what's slow (Firefox drawing its 2D canvases in software): fewer pixels wouldn't help
{
  const S = GFX.autoScaler(), ch = run(S, 120, { gpu: 5, js: 26 });
  check(S.a === 1 && !ch.length, 'script-bound (26 ms of script, 5 of GPU): the resolution stays, it would only get blurry');
  const S2 = GFX.autoScaler(), ch2 = run(S2, 120, { gpu: 5, js: 13, views: 2 });
  check(S2.a === 1 && !ch2.length, '…two split-screen views of 13 ms each on one thread: the same');
  // both: the GPU far too slow and the script over a refresh: down until the script is what's left, no further
  const S3 = GFX.autoScaler(); run(S3, 120, { gpu: 120, js: 12, views: 2 });
  check(run.low < 0.6 && run.low >= 0.4 && run.low * run.low * 120 <= 34, `split screen on the laptop (120 ms of GPU, 2 × 12 ms of script): down to ${fmt(run.low)}, where the script is what's left (${(run.low * run.low * 120).toFixed(0)} ms of GPU)`);
}
// something else is the limit (the browser putting the page together, another program on the GPU): 30 ms a frame
// that no resolution takes away
{
  const M = { gpu: 2, fixed: 30 }, S = GFX.autoScaler(), ch = run(S, 60, M);
  const dip = ch.length >= 2 ? ch[1].t - ch[0].t : 0;
  check(S.a === 1 && ch.length >= 2 && ch[0].a < 1 && ch[1].a === 1 && dip < 1.5 && S.best > 30, `frames of 33 ms that fewer pixels don't speed up: one step down, no faster, back to the full resolution after ${dip.toFixed(1)} s`);
  const again = run(S, 600, M, 60);
  check(S.a === 1 && run.under < 0.01 && again.length <= 14, `…and it stays there: asked ${again.length / 2} times in ten minutes whether fewer pixels help by now (${(run.under * 100).toFixed(1)} % of the time a step lower)`);
  const N = GFX.autoScaler({ a: S.a, wait: S.wait, best: S.best }), first = run(N, 60, M);
  check(N.a === 1 && first.length === 2 && run.under < 0.02, `…the next page knows: no search again, one early check whether it still holds (${(run.under * 60).toFixed(1)} s a step lower)`);
  // …and when that limit goes away, the usual aim is back
  const N1 = GFX.autoScaler({ a: 1, wait: 300, best: N.best }); run(N1, 30, { gpu: 40 });
  check(N1.best === 0 && run.low < 0.7 && run.low * run.low * 40 <= 16.7, `the limit is gone and the GPU is what's slow (40 ms): the usual aim again, down to ${fmt(run.low)}`);
  const X = N; run(N, 30, { gpu: 40 }, 60);
  check(X.best === 0 && run.low < 0.7, '…in the middle of a page too');
  const N2 = GFX.autoScaler({ a: 1, wait: 5, best: 33.3 }); run(N2, 40, { gpu: 30 });
  check(N2.best === 0 && run.low * run.low * 30 <= 16.7, `…also when the GPU is just as slow as the old limit was (30 ms): asked, fewer pixels help now, down to ${fmt(run.low)}`);
}
// both: a slow GPU and 28 ms a frame that stay: down to the floor, then up to the sharpest picture with the floor's frame rate
{
  const M = { gpu: 56, fixed: 28 }, S = GFX.autoScaler(); run(S, 30, M); run(S, 120, M, 30);
  const ms = (a) => 56 * a * a + 28;
  check(run.at > 0.42 && run.at < 0.6 && ms(run.at) <= ms(0.4) * A.BEST[1], `a slow GPU and a limit that stays (56 ms + 28): not left at the floor, ${fmt(run.at)} is about as fast (${ms(run.at).toFixed(0)} ms a frame, the floor ${ms(0.4).toFixed(0)}) and sharper`);
}
// hopeless: it stops at the floor
{
  const S = GFX.autoScaler(); run(S, 60, { gpu: 400 });
  check(S.a === 0.4, `a GPU far too slow for it (400 ms): down to the floor (${fmt(S.a)}) and no further`);
  const S2 = GFX.autoScaler(); run(S2, 60, { gpu: 400, min: 0.625 });
  check(S2.a === 0.625, 'a small window\'s floor is higher (never under 800 px across)');
  check(GFX.autoFloor(2048) === 0.4 && GFX.autoFloor(1280) === 0.625 && GFX.autoFloor(640) === 1, 'the floor: 0.4 of a big screen, 800 px of a middling one, a small one stays whole');
  const S3 = GFX.autoScaler({ a: 0.45 }); S3.frame(16.7, 4, 1, 0.625);
  check(S3.a === 0.625, 'the window was made smaller: up to its floor at once');
}
// what isn't the machine's speed doesn't count
{
  const S = GFX.autoScaler(); let changed = false;
  for (let i = 0; i < 3000; i++) changed = S.frame(i % 97 === 0 ? 400 : 16.7, 4, 1) || changed;   // (a hitch every second and a half)
  for (let i = 0; i < 200; i++) changed = S.frame(i % 2 ? 5000 : 16.7, 4, 1) || changed;         // (a hidden tab's frames)
  check(!changed && S.a === 1, 'hitches (a 400 ms frame now and then) and a hidden tab\'s frames: nothing changes');
  const S2 = GFX.autoScaler(); let c2 = false;
  for (let i = 0; i < 600; i++) c2 = S2.frame(i < 12 ? 50 : 16.7, 4, 1) || c2;                   // (0.6 s of loading)
  check(!c2 && S2.a === 1, 'a slow start (0.6 s of 50 ms frames while the sprites load): nothing changes');
}
// what is remembered is used, and only if it makes sense
{
  const ok = GFX.autoScaler({ a: 0.6, wait: 80 });
  check(ok.a === 0.6 && ok.wait === 80, 'it starts from what the last page found');
  const bad = [{ a: 'x', wait: -3 }, { a: 7, wait: 1e9 }, {}, { a: NaN }].map(o => GFX.autoScaler(o));
  check(bad.every(S => S.a > 0 && S.a <= 1 && S.wait >= A.WAIT[0] && S.wait <= A.WAIT[1]), 'a broken record is no record (full resolution, the usual wait)');
}
process.exitCode = failed ? 1 : 0;
