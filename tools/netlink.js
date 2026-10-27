// A simulated network link, one direction: a base latency, optional jitter, and a bandwidth limit
// (every message takes bytes / rate to serialize, queued behind the ones before it, so a big snapshot
// delays the next ones too). In order, like TCP: nothing overtakes. Used by the connection simulator
// (tools/netsim.js, headless, virtual time) and by server.js (manual play: `node server.js 8110 --lag 100
// --bw 2000`, or a browser's ?lag=100&bw=2000).
//
//   const L = makeLink({ lag: 100, jitter: 20, bw: 2000 });   // ms one way, ms extra (0..jitter), kbit/s (0: unlimited)
//   const at = L.send(bytes, now);   // when (ms) the message arrives at the other end
//   L.backlog(now)                   // bytes still waiting to go onto the wire (the sender's queue)
function makeLink({ lag = 0, jitter = 0, bw = 0, seed = 7 } = {}) {
  let freeAt = 0, lastAt = 0, s = seed >>> 0 || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const perByte = bw > 0 ? 8 / bw : 0;                 // ms per byte (bw in kbit/s = bits per ms)
  return {
    lag, jitter, bw,
    send(bytes, now) {
      freeAt = Math.max(freeAt, now) + bytes * perByte;    // (serialized after everything queued before it)
      lastAt = Math.max(lastAt, freeAt + lag + rnd() * jitter);
      return lastAt;
    },
    backlog(now) { return perByte ? Math.max(0, freeAt - now) / perByte : 0; },
    get busyUntil() { return freeAt; },
  };
}
// The link settings from command-line style options or a URL query: lag, jitter, bw (and up: the other way's bw).
function linkOpts(get) {
  const num = (k) => { const v = get(k); return v == null || v === '' ? undefined : Math.max(0, +v || 0); };
  const o = { lag: num('lag'), jitter: num('jitter'), bw: num('bw'), up: num('up') };
  return o.lag !== undefined || o.jitter !== undefined || o.bw !== undefined || o.up !== undefined
    ? { lag: o.lag ?? 0, jitter: o.jitter ?? 0, bw: o.bw ?? 0, up: o.up ?? o.bw ?? 0 } : null;
}
// Flow control by the acknowledgements: each snapshot has a number, each input from the browser says the latest it got.
// A snapshot that takes much longer than the quickest round trip lately (a queue somewhere: a slow uplink, a tunnel, the
// kernel's socket buffer, none of which the server can see) means the connection is behind: skip snapshots (each one
// is the whole state) until the queue has drained, instead of piling up seconds of lag.
//   const F = makeFlow();  F.sent(n, now);  F.acked(n, now);  F.behind(now)
function makeFlow({ slack = 150, window = 10000 } = {}) {
  const sentAt = new Map();
  let lastAckSent = null, minRtt = Infinity, minNext = Infinity, windowAt = 0;
  return {
    sent(n, now) { sentAt.set(n, now); if (sentAt.size > 600) sentAt.delete(sentAt.keys().next().value); },
    acked(n, now) {
      const t = sentAt.get(n);
      if (t === undefined) return;
      for (const k of sentAt.keys()) { if (k > n) break; sentAt.delete(k); }
      const rtt = now - t;
      if (now - windowAt > window) { minRtt = Math.min(minNext, rtt); minNext = rtt; windowAt = now; }   // (the quickest of the last 10-20 s)
      minRtt = Math.min(minRtt, rtt); minNext = Math.min(minNext, rtt);
      lastAckSent = t;
    },
    // the oldest snapshot not acknowledged yet left longer ago than a round trip and some jitter: they are queueing
    // (only once this browser has acknowledged anything at all)
    // (nothing back for 2 s: a background tab, a new page, a new game: start over rather than wait for it for ever)
    behind(now) {
      if (lastAckSent === null) return false;
      for (const t of sentAt.values()) {
        if (now - t > 2000) { sentAt.clear(); lastAckSent = null; return false; }
        return now - t > minRtt + slack;
      }
      return false;
    },
    get minRtt() { return minRtt; },
  };
}
module.exports = { makeLink, linkOpts, makeFlow };
