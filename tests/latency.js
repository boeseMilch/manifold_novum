// Multiplayer over a slow connection (a tunnel: 60 ms each way plus up to 30 ms of jitter): the server's
// simulation and a browser-side copy, with every message delayed. Your own walk shows as if there were no
// lag (input numbers, reconciled with the server's position); the power lever turns on a tap without a
// "wedging" bar, its prompt follows the turn and its handle swings every frame; shells fly on between
// snapshots; the sim clock runs smoothly. Run: node tests/latency.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// one server + one guest browser; `frame(t)` runs before each browser frame (t: ms since the start)
function session(oneWay, jitter, setup) {
  const S = loadGame(['simTick', 'netServer', 'netSerialize', 'crew', 'power', 'LEVER', 'combat', 'GUNS', 'fireCannon', 'withCrew']);
  const C = loadGame(['netApply', 'netBetween', 'netRemember', 'netLocalPrompt', 'localInput', 'me', 'crew', 'power', 'leverShownPos', 'workProgress', 'combat', 'time']);
  S.netServer.init('intro', {}, 0); S.netServer.addCrew(1, 'Host'); S.netServer.addCrew(2, 'Guest');
  const guest = S.crew[1];
  setup?.(S, guest);
  let now = 0, tick = 0, acc = 0, started = false, snaps = 0;
  const toServer = [], toClient = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // (repeatable jitter)
  const post = (q, fn) => q.push([Math.max(q.length ? q[q.length - 1][0] : 0, now + oneWay + rnd() * jitter), fn]);
  return {
    S, C, guest, get now() { return now; }, get snaps() { return snaps; },
    run(ms, frame, fps = 60) {
      for (const end = now + ms; now < end;) {
        const dt = 1 / fps; now += dt * 1000;
        acc += dt;
        while (acc >= 1 / 60) {
          acc -= 1 / 60;
          while (toServer.length && toServer[0][0] <= now) toServer.shift()[1]();
          S.simTick(1 / 60);
          if (++tick % 2 === 0) { const s = JSON.stringify(S.netSerialize()); post(toClient, () => { C.netApply(JSON.parse(s), 2); snaps++; }); }
        }
        let fresh = false;
        while (toClient.length && toClient[0][0] <= now) { toClient.shift()[1](); started = fresh = true; }
        if (!started) continue;
        const L = C.localInput, mouse = { wx: 0, wy: 0 };
        frame?.(now, L, mouse, fresh);
        C.netBetween(dt); C.netLocalPrompt();
        const m = { seq: C.netRemember(), keys: [...L.keys], pressed: [...L.pressed], mouse: { ...mouse } };
        L.pressed.clear();
        post(toServer, () => S.netServer.input(2, m));
      }
    },
  };
}
const walkRun = (oneWay, jitter) => {                  // walk right 2 s on the bridge, then stop; the guest's own screen every 50 ms
  const W = session(oneWay, jitter, (S, g) => { g.x = 14; g.y = 8; });
  const xs = {};
  W.run(4000, (t, L) => { L.keys.clear(); if (t > 1000 && t < 3000) L.keys.add('KeyD'); xs[Math.floor(t / 50)] ??= W.C.me.x; });
  return { xs, server: W.guest.x, shown: W.C.me.x };
};

// 1. your own walk: over the tunnel it looks like it does with no lag at all
const base = walkRun(1, 0), slow = walkRun(60, 30), slower = walkRun(150, 80);
const off = (r) => Math.max(...Object.keys(r.xs).filter(k => k >= 18 && base.xs[k] !== undefined).map(k => Math.abs(r.xs[k] - base.xs[k])));   // (from 0.9 s: the slow ones get their first snapshot later)
check(off(slow) < 0.15, `walking with 60+30 ms each way shows like walking with none (at most ${off(slow).toFixed(2)} apart)`);
check(off(slower) < 0.25, `…and with 150+80 ms each way too (at most ${off(slower).toFixed(2)} apart; the server is a round trip of walking behind)`);
check(Math.abs(slow.shown - slow.server) < 0.1, `once you stop, you're where the server has you (${slow.shown.toFixed(2)} / ${slow.server.toFixed(2)})`);

// 2. the server moves you (a push, a door): your browser glides over to it, it doesn't fight it
{
  const W = session(60, 30, (S, g) => { g.x = 14; g.y = 8; });
  W.run(800);
  W.guest.x += 1.0;                                     // (the server alone moves you a metre)
  W.run(800);
  check(Math.abs(W.C.me.x - W.guest.x) < 0.05, `a move only the server made reaches your screen (${W.C.me.x.toFixed(2)} / ${W.guest.x.toFixed(2)})`);
}

// 3. the power lever over the tunnel: tap E, hold E, the prompt, the handle
const atLever = (S, g) => { g.x = S.LEVER.x + 0.9; g.y = S.LEVER.y - 0.3; g.mode = 'inside'; };
{
  const W = session(60, 30, atLever);
  W.run(1000);
  const pos0 = W.C.power.lever.pos, want = (pos0 + 1) % 3;
  check(/turn lever to RIGHT/.test(W.C.me.prompt?.text || ''), `next to the lever the prompt says what E does (${W.C.me.prompt?.text})`);
  let bar = false, turnedAt = null, promptAt = null, angles = new Set(), snapsAtTurn = 0;
  W.run(1500, (t, L) => {
    const down = t > 1000 && t < 1120;                  // a 120 ms tap
    if (down && !L.keys.has('KeyE')) L.pressed.add('KeyE');
    if (down) L.keys.add('KeyE'); else L.keys.delete('KeyE');
    if (W.C.workProgress(W.C.me)) bar = true;
    if (turnedAt === null && W.C.power.lever.pos === want) { turnedAt = t; snapsAtTurn = W.snaps; }
    if (turnedAt !== null && promptAt === null && /turn lever to LEFT/.test(W.C.me.prompt?.text || '')) promptAt = t;
    if (turnedAt !== null && t - turnedAt < 250) angles.add(W.C.power.lever.angle.toFixed(4));
  });
  check(W.S.power.lever.pos === want && !W.S.power.lever.jammed, `a tap on E turns the lever once (${pos0} → ${W.S.power.lever.pos}), no wrench`);
  check(!bar, 'a tap shows no "wedging the wrench in" bar');
  check(promptAt !== null && promptAt - turnedAt < 60, `the prompt follows the turn right away (${promptAt - turnedAt} ms after the lever moved)`);
  const snapsInSwing = 250 / 33;
  check(angles.size > snapsInSwing * 1.5, `the handle swings every frame, not only on the 30 snapshots a second (${angles.size} angles in 250 ms)`);
}
{
  const W = session(60, 30, atLever);
  W.run(1000);
  let bar = 0;
  W.run(1500, (t, L) => {
    const down = t > 1000 && t < 1700;
    if (down && !L.keys.has('KeyE')) L.pressed.add('KeyE');
    if (down) L.keys.add('KeyE'); else L.keys.delete('KeyE');
    const w = W.C.workProgress(W.C.me); if (w && /wrench/i.test(w.label)) bar = Math.max(bar, w.k);
  });
  check(W.S.power.lever.jammed && W.C.power.lever.jammed, 'holding E wedges the wrench in, also over the tunnel');
  check(bar > 0.5, `…with its bar while you hold (up to ${Math.round(bar * 100)} %)`);
}

// 4. between snapshots: shells fly on, the clock runs every frame and never backwards
{
  const W = session(60, 30, (S) => { const g = S.GUNS[0]; g.shots = 3; S.withCrew(S.crew[0], () => S.fireCannon(g)); });
  let moved = 0, still = 0, back = 0, flat = 0, last = null, lastT = null;
  W.run(400, (t, L, m, fresh) => {
    const s = W.C.combat.shells[0];
    if (!fresh && s && last) (Math.hypot(s.x - last[0], s.y - last[1]) > 0.1 ? moved++ : still++);
    last = s ? [s.x, s.y] : null;
  });
  W.run(500, () => { if (lastT !== null) { if (W.C.time < lastT) back++; if (W.C.time === lastT) flat++; } lastT = W.C.time; });
  check(moved > 3 && still === 0, `a cannon shell flies on in the frames between snapshots (${moved} frames moved, ${still} stood still)`);
  check(back === 0 && flat === 0, `the sim clock runs every frame and never backwards (${back} back, ${flat} stood still)`);
}

console.log(failed ? `\n${failed} failed` : '\nall latency tests passed');
process.exitCode = failed ? 1 : 0;
