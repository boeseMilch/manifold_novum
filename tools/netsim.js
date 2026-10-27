#!/usr/bin/env node
// Connection simulator: the server's simulation and browser copies (the game scripts in Node, like the tests),
// every message over a simulated link (tools/netlink.js: latency each way, jitter, a bandwidth limit with a
// queue), all in virtual time, so a run is quick and repeatable. It does what server.js does per snapshot
// (one JSON, permessage-deflate with the context kept: estimated with the last 32 KB sent as the dictionary;
// a connection that is behind skips snapshots: --no-flow without the acknowledgement rule, makeFlow) and what a browser
// does per frame (js/net.js netFrame). Scenarios: walk (through a doorway and about), door (into a locked doorway and
// along it), frame (at an angle into a closed doorway's frame while it opens), lock (the open doorway locked as you get
// there), busy (a fight with intruders: the snapshot sizes).
// It measures what the guest's player experiences:
//   - snapshots: JSON size, size on the wire, how many a second, kbit/s, how old they are when they arrive, skipped;
//   - own walk: key to movement on screen, key to the server's (confirmed) movement, how far the screen is off a run
//     with no lag at all ("rubber band"), jumps, frames spent standing in a wall / closed door;
//   - others: how far the other player, the intruders and the enemies are shown from where the server has them now.
//
//   node tools/netsim.js                         # 100 ms each way, no bandwidth limit, all scenarios
//   node tools/netsim.js --lag 100 --jitter 20 --bw 2000 --scenario door
//   node tools/netsim.js --players 4 --bw 1000 --seconds 20 --json
// Manual play with the same link: node server.js 8110 --lag 100 --bw 2000, or open the page with ?lag=100&bw=2000.
const zlib = require('zlib');
const { loadGame } = require('../tests/harness');
const { makeLink, makeFlow } = require('./netlink');

const EXPOSE_S = ['simTick', 'netServer', 'netSerialize', 'netCaptureSfx', 'crew', 'DOORS', 'combat', 'combatSpawn', 'boarding', 'spawnInvader',
  'mission', 'ITEMS', 'fires', 'withCrew', 'time', 'canStand', 'walkRects', 'netSnapshotText'];
const EXPOSE_C = ['netApply', 'netBetween', 'netRemember', 'netLocalPrompt', 'netPlaySfx', 'localInput', 'me', 'crew', 'combat', 'boarding',
  'DOORS', 'time', 'canStand', 'walkRects', 'netStats'];
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// One session: a server and `players` browsers (player 1 the host on the same machine: no lag; the others over the link).
// script(t, i, L, mouse, W) sets browser i's keys every frame. Returns the session; run(ms) advances it.
function session({ lag = 100, jitter = 0, bw = 0, up, players = 2, seed = 7, setup, script, mission = 'c1', fps = 60, hostLag = 0, encode, flow = true } = {}) {
  const S = loadGame(EXPOSE_S);
  S.netServer.init(mission, {}, 0);
  const sfx = S.netCaptureSfx();
  for (let i = 1; i <= players; i++) S.netServer.addCrew(i, i === 1 ? 'Host' : 'Guest' + i);
  const clients = [];
  for (let i = 1; i <= players; i++) {
    const remote = i > 1 || hostLag;
    const L = remote ? { lag: i > 1 ? lag : hostLag, jitter: i > 1 ? jitter : 0, bw: i > 1 ? bw : 0, up: i > 1 ? (up ?? bw) : 0 } : { lag: 0, jitter: 0, bw: 0, up: 0 };
    clients.push({ id: i, C: null, down: makeLink({ lag: L.lag, jitter: L.jitter, bw: L.bw, seed: seed + i }), up: makeLink({ lag: L.lag, jitter: L.jitter, bw: L.up, seed: seed + 100 + i }),
      toClient: [], toServer: [], dict: Buffer.alloc(0), started: false, skipped: 0, late: null, flow: makeFlow(), n: null });
  }
  setup?.(S);
  let now = 0, tick = 0, acc = 0;
  const W = { S, clients, get now() { return now; }, stats: { snaps: [] }, encode };
  const deliver = (q, at, fn) => q.push([at, fn]);
  const loadClient = (cl) => { cl.C = loadGame(EXPOSE_C); };
  clients.forEach(loadClient);
  W.run = (ms, each) => {
    for (const end = now + ms; now < end - 1e-6;) {
      const dt = 1 / fps; now += dt * 1000; acc += dt;
      while (acc >= 1 / 60 - 1e-9) {
        acc -= 1 / 60;
        for (const cl of clients) while (cl.toServer.length && cl.toServer[0][0] <= now + 1e-6) cl.toServer.shift()[1]();
        S.simTick(1 / 60);
        if (++tick % 2) continue;
        const events = sfx.splice(0);
        let snapText;                                    // (as server.js: netSnapshotText, rounded; an older js/net.js: plain JSON)
        try { snapText = W.encode ? null : S.netSnapshotText(); } catch (e) { snapText = null; }
        if (snapText === null) { const o = S.netSerialize(); snapText = W.encode ? W.encode(o) : JSON.stringify(o); }
        for (const cl of clients) {
          // (server.js stepGame: one JSON for everyone; a connection that is behind skips it, its sounds wait)
          if (cl.down.backlog(now) > 64 * 1024 || (flow && cl.flow.behind(now))) { cl.skipped++; cl.late = [...(cl.late || []), ...events].slice(-60); continue; }
          const fx = cl.late ? [...cl.late, ...events] : events; cl.late = null;
          cl.snapN = (cl.snapN || 0) + 1;
          const text = `{"t":"state","n":${cl.snapN},"you":${cl.id},"sfx":${JSON.stringify(fx)},"s":${snapText}}`;
          const raw = Buffer.from(text);
          const wire = zlib.deflateRawSync(raw, { level: 3, dictionary: cl.dict.length ? cl.dict : undefined }).length + 4;
          cl.dict = Buffer.concat([cl.dict, raw]).subarray(-32768);
          const at = cl.down.send(wire, now), sentAt = now, rec = { json: raw.length, wire, sentAt, at };
          if (cl.id === 2) W.stats.snaps.push(rec);
          cl.flow.sent(cl.snapN, now);
          deliver(cl.toClient, at, () => { const m = JSON.parse(text); cl.n = m.n; cl.C.netApply(m.s, cl.id); cl.started = true; if (cl.id === 2) rec.age = now - sentAt; });
        }
      }
      for (const cl of clients) {
        let fresh = false;
        while (cl.toClient.length && cl.toClient[0][0] <= now + 1e-6) { cl.toClient.shift()[1](); fresh = true; }
        if (!cl.started) continue;
        const C = cl.C, L = C.localInput, mouse = { wx: 0, wy: 0 };
        L.keys.clear();
        script?.(now, cl.id, L, mouse, W);
        C.netBetween(dt); C.netLocalPrompt();
        const m = { t: 'input', seq: C.netRemember(), ack: cl.n, keys: [...L.keys], pressed: [...L.pressed], mouse: { ...mouse } };
        L.pressed.clear();
        const json = JSON.stringify(m);
        const at = cl.up.send(json.length + 6, now);
        deliver(cl.toServer, at, () => { const m2 = JSON.parse(json); if (Number.isFinite(m2.ack)) cl.flow.acked(m2.ack, now); S.netServer.input(cl.id, m2); });
        each?.(now, cl, fresh);
      }
    }
  };
  return W;
}

// ---------------------------------------------------------------------------
// Scenarios (the guest is player 2)
// ---------------------------------------------------------------------------
const keyAt = (route, t) => route.filter(([t0, t1]) => t >= t0 && t < t1).flatMap(r => r[2]);
const SCENARIOS = {
  // walk about the top deck through the left doorway and back, straight and at an angle; the host walks the bridge
  walk: {
    seconds: 14,
    setup(S) { const g = S.crew[1]; g.x = 9; g.y = 7.3; const h = S.crew[0]; h.x = 22; h.y = 5; },
    route: [[500, 2700, ['KeyD']], [3200, 5400, ['KeyA']], [5800, 6600, ['KeyW']], [6700, 8700, ['KeyD', 'KeyS']], [9000, 11000, ['KeyA', 'KeyW']], [11200, 12400, ['KeyD']]],
    host: [[500, 3000, ['KeyD']], [3000, 6000, ['KeyS', 'KeyA']], [6000, 9000, ['KeyW']], [9000, 12000, ['KeyA']]],
  },
  // into a locked doorway head-on, push against it, then along it (the left doorway between the left cannon room and the bridge)
  door: {
    seconds: 5,
    setup(S) { const g = S.crew[1]; g.x = 11; g.y = 7.3; S.DOORS[0].locked = true; const h = S.crew[0]; h.x = 22; h.y = 5; },
    route: [[500, 1800, ['KeyD']], [1800, 2400, ['KeyD', 'KeyS']], [2400, 3000, ['KeyD', 'KeyW']], [3000, 3600, ['KeyD', 'KeyS']], [3600, 4500, ['KeyA']]],
    host: [],
  },
  // at an angle into the frame of a closed (unlocked) doorway: you slide along the wall while it opens, then go through
  frame: {
    seconds: 4,
    setup(S) { const g = S.crew[1]; g.x = 13; g.y = 4.6; const h = S.crew[0]; h.x = 22; h.y = 5; },
    route: [[500, 1000, ['KeyD', 'KeyS']], [1000, 1300, ['KeyD']], [1300, 3000, ['KeyD', 'KeyS']]],
    host: [],
  },
  // the doorway is open (the host stands in front of it on the far side) and gets locked from the security console
  // just as you reach it: it shuts in front of you
  lock: {
    seconds: 4,
    setup(S) { const g = S.crew[1]; g.x = 8.5; g.y = 7.3; const h = S.crew[0]; h.x = 14.8; h.y = 7.3; },
    route: [[500, 2900, ['KeyD']], [1500, 1501, [(W) => { W.S.DOORS[0].locked = true; }]]],
    host: [],
  },
  // a busy fight for the snapshot sizes: enemies on both sides, intruders aboard, the guest walking about
  busy: {
    seconds: 14,
    setup(S) {
      const g = S.crew[1]; g.x = 9; g.y = 7.3; const h = S.crew[0]; h.x = 22; h.y = 5;
      S.combatSpawn('interceptor', 'port'); S.combatSpawn('interceptor', 'star');
      try { S.spawnInvader('port'); S.spawnInvader('star'); } catch (e) { /* (not on every mission) */ }
    },
    route: [[500, 2700, ['KeyD']], [3200, 5400, ['KeyA']], [5800, 6600, ['KeyW']], [6700, 8700, ['KeyD', 'KeyS']], [9000, 11000, ['KeyA', 'KeyW']], [11200, 12400, ['KeyD']]],
    host: [[500, 3000, ['KeyD']], [3000, 6000, ['KeyS', 'KeyA']], [6000, 9000, ['KeyW']], [9000, 12000, ['KeyA']]],
  },
};

// Run one scenario with the given link, plus the same with no lag (the reference walk), and measure.
function measure(name, link = {}) {
  const sc = SCENARIOS[name], ms = (link.seconds || sc.seconds) * 1000;
  const script = (t, id, L, mouse, W) => {
    const ks = keyAt(id === 2 ? sc.route : sc.host, t - (W.t0 ?? 0));
    for (const k of ks) if (typeof k === 'function') { if (!W.done?.has(k)) { (W.done ??= new Set()).add(k); k(W); } } else L.keys.add(k);
  };
  const run = (opts) => {
    const W = session({ ...opts, setup: sc.setup, script });
    const out = { pass: null, pos: [], wall: 0, jumps: 0, other: [], invaders: [], enemies: [], firstMove: null, firstSrvMove: null };
    let firstKey = null, prev = null;
    W.run(400);                                          // (until the first snapshots are in)
    W.t0 = W.now - 400 + 0;
    W.run(ms, (now, cl) => {
      if (cl.id !== 2) return;
      const C = cl.C, me = C.me, t = now - W.t0;
      out.pos.push([t, me.x, me.y]);
      const keys = keyAt(sc.route, t).filter(k => typeof k === 'string');
      if (firstKey === null && keys.length) { firstKey = t; out.start = [me.x, me.y, me.nx, me.ny]; }
      if (firstKey !== null && out.firstMove === null && Math.hypot(me.x - out.start[0], me.y - out.start[1]) > 0.01) out.firstMove = t - firstKey;
      if (firstKey !== null && out.firstSrvMove === null && Math.hypot(me.nx - out.start[2], me.ny - out.start[3]) > 0.01) out.firstSrvMove = t - firstKey;
      if (out.pass === null && me.x > 14.4) out.pass = t;
      if (!C.canStand(me.x, me.y, C.walkRects())) out.wall++;
      if (prev && Math.hypot(me.x - prev[0], me.y - prev[1]) > 4.2 * 1.6 / 60 + 0.01) out.jumps++;
      prev = [me.x, me.y];
      const S = W.S;
      for (const c of C.crew) if (c.id !== 2) { const s = S.crew.find(x => x.id === c.id); if (s) out.other.push(Math.hypot(c.x - s.x, c.y - s.y)); }
      for (const a of C.boarding.invaders) { const s = S.boarding.invaders.find(x => x.uid === a.uid); if (s && a.mode === 'inside') out.invaders.push(Math.hypot(a.x - s.x, a.y - s.y)); }
      for (const e of C.combat.enemies) { const s = S.combat.enemies.find(x => x.uid === e.uid); if (s) out.enemies.push(Math.hypot(e.x - s.x, e.y - s.y)); }
    });
    out.W = W;
    return out;
  };
  const ref = run({ ...link, lag: 0, jitter: 0, bw: 0, up: 0 }), r = run(link);
  // the rubber band: how far the screen is from the no-lag walk at the same moment (both start at the same key time)
  const refAt = new Map(ref.pos.map(([t, x, y]) => [Math.round(t), [x, y]]));
  const dev = r.pos.map(([t, x, y]) => { const p = refAt.get(Math.round(t)); return p ? Math.hypot(x - p[0], y - p[1]) : 0; });
  const snaps = r.W.stats.snaps, secs = ms / 1000 + 0.4;
  const C = r.W.clients[1].C;
  return {
    scenario: name, link: { lag: link.lag ?? 100, jitter: link.jitter ?? 0, bw: link.bw ?? 0, players: link.players ?? 2 },
    snapshots: {
      perSec: +(snaps.length / secs).toFixed(1), skipped: r.W.clients[1].skipped,
      json: { mean: Math.round(mean(snaps.map(s => s.json))), max: Math.max(...snaps.map(s => s.json)) },
      wire: { mean: Math.round(mean(snaps.map(s => s.wire))), p95: pct(snaps.map(s => s.wire), 0.95), max: Math.max(...snaps.map(s => s.wire)) },
      kbps: Math.round(snaps.reduce((a, s) => a + s.wire, 0) * 8 / secs / 1000),
      ageMs: { mean: Math.round(mean(snaps.filter(s => s.age != null).map(s => s.age))), p95: Math.round(pct(snaps.filter(s => s.age != null).map(s => s.age), 0.95)) },
    },
    own: {
      keyToScreenMs: r.firstMove, keyToServerMs: r.firstSrvMove, throughDoorMs: r.pass, throughDoorMsNoLag: ref.pass,
      offNoLag: { mean: +mean(dev).toFixed(3), p95: +pct(dev, 0.95).toFixed(3), max: +Math.max(...dev).toFixed(3) },
      jumps: r.jumps, wallFrames: r.wall, wallFramesNoLag: ref.wall,
      corrections: (() => { try { return { ...C.netStats }; } catch (e) { return undefined; } })(),
    },
    others: {
      crew: { mean: +mean(r.other).toFixed(3), p95: +pct(r.other, 0.95).toFixed(3) },
      invaders: r.invaders.length ? { mean: +mean(r.invaders).toFixed(3), p95: +pct(r.invaders, 0.95).toFixed(3) } : null,
      enemies: r.enemies.length ? { mean: +mean(r.enemies).toFixed(3), p95: +pct(r.enemies, 0.95).toFixed(3) } : null,
    },
  };
}

function report(m) {
  const s = m.snapshots, o = m.own, x = m.others;
  return [
    `[${m.scenario}] ${m.link.lag} ms each way${m.link.jitter ? ` + ${m.link.jitter} jitter` : ''}${m.link.bw ? `, ${m.link.bw} kbit/s` : ', no bandwidth limit'}, ${m.link.players} players`,
    `  snapshots: ${s.perSec}/s (${s.skipped} skipped), JSON ${s.json.mean} B (max ${s.json.max}), wire ${s.wire.mean} B (p95 ${s.wire.p95}, max ${s.wire.max}), ${s.kbps} kbit/s, age on arrival ${s.ageMs.mean} ms (p95 ${s.ageMs.p95})`,
    `  own walk: key → screen ${Math.round(o.keyToScreenMs)} ms, key → server ${Math.round(o.keyToServerMs)} ms;${o.throughDoorMs != null ? ` through the doorway at ${Math.round(o.throughDoorMs)} ms (no lag: ${Math.round(o.throughDoorMsNoLag)});` : ''} off the no-lag walk mean ${o.offNoLag.mean} m, p95 ${o.offNoLag.p95}, max ${o.offNoLag.max}; ${o.jumps} jumps; ${o.wallFrames} frames in a wall (no lag: ${o.wallFramesNoLag})`,
    ...(o.corrections?.acks ? [`  corrections: ${o.corrections.replays} replays of ${o.corrections.acks} snapshots, glided ${o.corrections.glided.toFixed(2)} m in all, largest ${o.corrections.maxErr.toFixed(2)} m, ${o.corrections.jumps} jumps`] : []),
    `  others shown off the server's now: crew mean ${x.crew.mean} m (p95 ${x.crew.p95})${x.invaders ? `, intruders ${x.invaders.mean} (p95 ${x.invaders.p95})` : ''}${x.enemies ? `, enemies ${x.enemies.mean} (p95 ${x.enemies.p95})` : ''}`,
  ].join('\n');
}

module.exports = { session, measure, report, SCENARIOS };

if (require.main === module) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const link = { lag: +opt('lag', 100), jitter: +opt('jitter', 0), bw: +opt('bw', 0), players: +opt('players', 2), seconds: opt('seconds') ? +opt('seconds') : undefined, flow: !a.includes('--no-flow') };
  if (opt('up')) link.up = +opt('up');
  const names = opt('scenario') ? [opt('scenario')] : Object.keys(SCENARIOS);
  const all = names.map(n => measure(n, link));
  if (a.includes('--json')) console.log(JSON.stringify(all, null, 1));
  else for (const m of all) console.log(report(m) + '\n');
}
