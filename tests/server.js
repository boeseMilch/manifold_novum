// server.js itself: the static files (what it hands out and what not, bad requests, caching, gzip, byte ranges),
// the port (0: any free one; taken: a clear ending), the heartbeat (a connection that went silent is dropped, the
// host role moves on), a lost connection mid-mission (the seat and the crew member are kept for the way back),
// the frame size cap, the host-only debug menu (and no second pay after a debug restart), and prototype 3's
// server side not being able to end the process. Run: node tests/server.js
const http = require('http'), net = require('net'), zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { startServer } = require('../tools/testserver');
const { loadGame } = require('./harness');
const ROOT = path.join(__dirname, '..');
let failed = 0, checked = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); checked++; if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const findFile = (dir, ext) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(String).find(f => f.endsWith(ext))?.split(path.sep).join('/');   // (the first one of that kind under dir)
const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (fn()) return true; await sleep(20); } return !!fn(); };

// One HTTP request with the path exactly as given (fetch tidies /a/../b up before sending it)
const get = (port, p, headers = {}, method = 'GET') => new Promise((resolve) => {
  const req = http.request({ port, host: '127.0.0.1', path: p, method, headers }, (res) => {
    const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve({ status: res.statusCode, head: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', (e) => resolve({ status: 0, error: e.message, head: {}, body: Buffer.alloc(0) }));
  req.end();
});
// A WebSocket client on a bare socket: it can go silent (no pong: a sleeping laptop) and vanish without a close frame.
function rawClient(port, { pong = true, url = '/ws' } = {}) {
  const sock = net.connect(port, '127.0.0.1');
  const c = { sock, got: [], id: null, lobby: null, state: null, you: null, started: false, game: null, ticket: null, closed: false, pings: 0, pong };
  let buf = Buffer.alloc(0), shook = false;
  const frame = (payload, op = 0x1) => {
    const p = Buffer.from(payload), mask = crypto.randomBytes(4), body = Buffer.from(p.map((b, i) => b ^ mask[i & 3]));
    const head = p.length < 126 ? Buffer.from([0x80 | op, 0x80 | p.length]) : Buffer.from([0x80 | op, 0x80 | 126, p.length >> 8, p.length & 255]);
    return Buffer.concat([head, mask, body]);
  };
  c.send = (o) => sock.write(frame(JSON.stringify(o)));
  c.write = (b) => sock.write(b);
  sock.on('error', () => {}); sock.on('close', () => { c.closed = true; });
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!shook) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; shook = true; buf = buf.subarray(i + 4); }
    for (;;) {
      if (buf.length < 2) return;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const op = buf[0] & 0x0f, payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
      if (op === 0x9) { c.pings++; if (c.pong) sock.write(frame(payload, 0xA)); continue; }
      if (op !== 0x1) continue;
      const m = JSON.parse(payload.toString()); c.got.push(m);
      if (m.t === 'welcome') c.id = m.id;
      if (m.t === 'joined') { c.game = m.game; c.ticket = m.ticket; }
      if (m.t === 'lobby') c.lobby = m;
      if (m.t === 'start') c.started = true;
      if (m.t === 'state') { c.state = m.s; c.you = m.you; }
    }
  });
  sock.write(`GET ${url} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n\r\n`);
  return c;
}

(async () => {
  let A = null, B = null;
  try {
    A = await startServer();
    const port = A.port;
    check(port > 0 && port !== 8080 && port !== 8081, `node server.js 0 takes a free port and says which (${port})`);

    // ----- static files: what goes out
    const index = await get(port, '/'), js = await get(port, '/js/net.js'), proto = await get(port, '/prototype3/'), music = await get(port, '/music.html');
    check(index.status === 200 && /text\/html/.test(index.head['content-type']) && index.body.equals(fs.readFileSync(path.join(ROOT, 'index.html'))), '/ is index.html');
    check(js.status === 200 && /javascript/.test(js.head['content-type']) && proto.status === 200 && music.status === 200, 'js/, the prototypes (a folder: its index.html) and music.html are served');
    const sprite = findFile('assets/sprites', '.webp'), sheet = sprite && await get(port, '/assets/sprites/' + sprite);
    check(sheet && sheet.status === 200 && sheet.head['content-type'] === 'image/webp' && !sheet.head['content-encoding'], `assets/ too (${sprite}, as it is: pictures aren't gzipped)`);
    check((await get(port, '/tools/sprites/gallery.html')).status === 200, 'the sprite gallery is the one page served out of tools/');
    // ----- …and what doesn't
    const no = {};
    for (const p of ['/.git/config', '/.git/HEAD', '/.claude/settings.json', '/js/.hidden.js', '/assets/../server.js', '/js/..%2fserver.js', '/..%2f..%2fetc/passwd',
      '/CLAUDE.md', '/README.md', '/PLAN.md', '/server.js', '/tools/netlink.js', '/tests/harness.js', '/prototype3/DESIGN.md', '/prototype3', '/js//net.js', '/nothing.html', '/js/nothing.js']) no[p] = (await get(port, p)).status;
    check(Object.entries(no).every(([p, s]) => (/\/\.|%2f/i.test(p) ? s === 403 : s === 404)),
      `not the rest of the folder: dot-files and .. are refused, notes / tools / tests / the server aren't there (${Object.entries(no).map(([p, s]) => `${p} ${s}`).join(', ')})`);
    // ----- requests that used to end the process
    const bad = [await get(port, '/%'), await get(port, '/a%00b'), await get(port, '/%E0%A4%A'), await get(port, '/js/net.js%00.png')];
    const after = await get(port, '/');
    check(bad.every(r => r.status === 400) && after.status === 200, `a broken %-escape or a NUL byte answers 400 and the server lives on (${bad.map(r => r.status || r.error)}; then / ${after.status || after.error})`);
    const post = await get(port, '/', {}, 'POST'), headReq = await get(port, '/js/net.js', {}, 'HEAD');
    check(post.status === 405 && headReq.status === 200 && headReq.body.length === 0 && !!headReq.head.etag, `only GET and HEAD (POST ${post.status}, HEAD ${headReq.status} without a body)`);

    // ----- caching: ask every time, get it again only when it changed
    const file = path.join(ROOT, 'js', 'net.js'), text = fs.readFileSync(file);
    check(js.head['cache-control'] === 'no-cache' && !!js.head.etag && !!js.head['last-modified'] && js.body.equals(text), `files come with "no-cache", an ETag and Last-Modified (${js.head.etag})`);
    const same = await get(port, '/js/net.js', { 'If-None-Match': js.head.etag }), since = await get(port, '/js/net.js', { 'If-Modified-Since': js.head['last-modified'] });
    const other = await get(port, '/js/net.js', { 'If-None-Match': '"something-else"' }), old = await get(port, '/js/net.js', { 'If-Modified-Since': new Date(0).toUTCString() });
    check(same.status === 304 && same.body.length === 0 && since.status === 304 && other.status === 200 && old.status === 200, `unchanged: 304 and no body, by ETag or by date (${same.status}, ${since.status}); another ETag or an older date gets the file (${other.status}, ${old.status})`);
    const st = fs.statSync(file);
    try {
      fs.utimesSync(file, st.atime, new Date(st.mtimeMs + 2000));   // "edited" (its time moved on; put back below)
      const edited = await get(port, '/js/net.js', { 'If-None-Match': js.head.etag, 'If-Modified-Since': js.head['last-modified'] });
      check(edited.status === 200 && edited.head.etag !== js.head.etag && edited.body.equals(text), `an edited file is there on the next reload (${edited.status}, ETag ${edited.head.etag})`);
    } finally { fs.utimesSync(file, st.atime, st.mtime); }
    // ----- gzip for text, when the browser takes it
    const gz = await get(port, '/js/net.js', { 'Accept-Encoding': 'gzip, deflate, br' }), gz2 = await get(port, '/js/net.js', { 'Accept-Encoding': 'gzip' });
    const unz = gz.head['content-encoding'] === 'gzip' ? zlib.gunzipSync(gz.body) : null;
    check(unz && unz.equals(text) && gz.body.length < text.length / 2 && /accept-encoding/i.test(gz.head.vary || '') && gz.head.etag !== js.head.etag && gz2.body.equals(gz.body),
      `text goes gzipped to a browser that accepts it (${gz.body.length} of ${text.length} bytes), plain to one that doesn't`);
    const gzSame = await get(port, '/js/net.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': gz.head.etag });
    const json = await get(port, '/assets/sprites/sprites.json', { 'Accept-Encoding': 'gzip' }), html = await get(port, '/', { 'Accept-Encoding': 'gzip' });
    check(gzSame.status === 304 && json.head['content-encoding'] === 'gzip' && html.head['content-encoding'] === 'gzip', 'the gzipped copy has its own ETag (304 too); JSON and HTML are gzipped as well');
    // ----- byte ranges (seeking in a recording) still work
    const mp3 = findFile('assets/music', '.mp3');
    if (mp3) {
      const whole = fs.readFileSync(path.join(ROOT, 'assets', 'music', ...mp3.split('/'))), part = await get(port, '/assets/music/' + mp3, { Range: 'bytes=100-199', 'Accept-Encoding': 'gzip' });
      const beyond = await get(port, '/assets/music/' + mp3, { Range: `bytes=${whole.length}-` });
      check(part.status === 206 && part.body.equals(whole.subarray(100, 200)) && part.head['content-range'] === `bytes 100-199/${whole.length}` && beyond.status === 416, `a byte range of a recording: 206 with those bytes (${part.head['content-range']}), past its end 416`);
    } else check(false, 'no recording in assets/music to test byte ranges with');

    // ----- the port is taken: a clear ending, and the tests' helper fails instead of going on
    const second = spawn(process.execPath, [path.join(ROOT, 'server.js'), String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; second.stderr.on('data', d => { err += d; });
    const code = await new Promise(r => second.on('exit', r));
    check(code === 1 && /in use/.test(err) && !/\n\s+at /.test(err), `a second server on the same port ends with a plain message (exit ${code}: ${err.trim().split('\n')[0]})`);
    let refused = null; try { (await startServer([], port)).stop(); } catch (e) { refused = e.message; }
    check(/did not start/.test(refused || ''), `the tests' startServer fails when the server doesn't come up (${refused})`);

    // ----- a frame longer than any message: the connection is closed, nothing is buffered
    const big = rawClient(port); await until(() => big.id);
    const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(8 << 20), 2);
    big.write(header); big.write(Buffer.alloc(1000));
    check(await until(() => big.closed, 1500) && (await get(port, '/')).status === 200, 'a frame announcing 8 MB is refused: that connection is closed');

    // ----- the debug menu is the host's; a debug restart of a finished mission pays nothing the second time
    const h = rawClient(port), g = rawClient(port); await until(() => h.id && g.id);
    h.send({ t: 'hello', name: 'Host' }); g.send({ t: 'hello', name: 'Guest' });
    h.send({ t: 'open', mission: 'c1' }); await until(() => h.game);
    g.send({ t: 'join', game: h.game }); await until(() => g.lobby?.players.length === 2);
    h.send({ t: 'start' }); await until(() => h.state && g.state);
    const full = (c) => c.state.caps.every(([ch]) => ch === 3);
    const lampOf = () => g.state.crew.find(c => c.id === g.id).lamp, lamp0 = lampOf();
    g.send({ t: 'cmd', cmd: ['debug', 'e'] }); g.send({ t: 'cmd', cmd: ['lamp'] }); await until(() => lampOf() !== lamp0);
    const guestTried = full(h), guestLamp = lampOf() !== lamp0;
    h.send({ t: 'cmd', cmd: ['debug', 'e'] }); await until(() => full(h));
    check(!guestTried && guestLamp && full(h), "a guest's debug command does nothing (their other commands work); the host's does (fill the capacitors)");
    const run1 = h.state.mission.runId;
    for (let i = 0; i < 6; i++) g.send({ t: 'cmd', cmd: ['debug', 'b'] });
    await sleep(300);
    check(!h.state.mission.over, "a guest can't break the ship from the debug menu either");
    for (let i = 0; i < 6; i++) h.send({ t: 'cmd', cmd: ['debug', 'b'] });
    await until(() => h.state.mission.over);
    const over1 = !!h.state.mission.over;
    h.send({ t: 'cmd', cmd: ['debug', 'm'] }); await until(() => h.state.mission.runId !== run1);
    check(over1 && h.state.mission.runId !== run1 && h.state.mission.rerun === true, `the host restarts the finished mission from the debug menu: a new run, marked as a rerun (${run1} → ${h.state.mission.runId})`);
    for (let i = 0; i < 6; i++) h.send({ t: 'cmd', cmd: ['debug', 'b'] });
    await until(() => h.state.mission.over);
    {
      const pay = (rerun) => {
        const P = loadGame(['netApply', 'creditMission', 'profile', 'mission']);
        P.netApply(JSON.parse(JSON.stringify(h.state)), h.id); P.mission.rerun = rerun;
        const before = JSON.stringify([P.profile.money, P.profile.rep, P.profile.done]); P.creditMission();
        return { paid: JSON.stringify([P.profile.money, P.profile.rep, P.profile.done]) !== before || P.profile.lastRun === P.mission.runId };
      };
      check(!!h.state.mission.over?.results && pay(h.state.mission.rerun).paid === false && pay(false).paid === true, 'the rerun pays nothing when it ends (the first run did; the same ending without the mark would pay)');
    }
    h.sock.destroy(); g.sock.destroy();

    // ----- a connection lost mid-mission: the seat and the crew member wait; the ticket brings the same one back
    const a = rawClient(port), b = rawClient(port); await until(() => a.id && b.id);
    a.send({ t: 'hello', name: 'Ann' }); b.send({ t: 'hello', name: 'Blip' });
    a.send({ t: 'open', mission: 'c1' }); await until(() => a.game);
    b.send({ t: 'join', game: a.game }); await until(() => b.ticket);
    a.send({ t: 'start' }); await until(() => a.state?.crew.length === 2 && b.state);
    for (let i = 0; i < 20; i++) { b.send({ t: 'input', keys: ['KeyD'], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(16); }
    b.send({ t: 'input', keys: [], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(100);
    const bid = b.id, was = a.state.crew.find(c => c.id === bid);
    b.sock.destroy(); await sleep(300);                // (no close frame: the link just went)
    const kept = a.state.crew.find(c => c.id === bid);
    check(kept && Math.abs(kept.x - was.x) < 0.3 && a.lobby.players.find(p => p.id === bid)?.away === true, 'the link drops without a goodbye: their crew member stays aboard, the seat is marked as away');
    const b2 = rawClient(port); await until(() => b2.id);
    const freshId = b2.id;
    b2.send({ t: 'hello', name: 'Blip' }); b2.send({ t: 'join', game: a.game, ticket: b.ticket }); await until(() => b2.state);
    const back = a.state.crew.find(c => c.id === bid);
    check(b2.started && b2.id === bid && freshId !== bid && b2.you === bid && a.state.crew.length === 2 && back && Math.abs(back.x - was.x) < 0.3 && !a.lobby.players.some(p => p.away),
      `back with the ticket: straight into the mission as the same crew member, where they stood (crew ${a.state.crew.map(c => c.name)}, id ${bid} again)`);
    // the browser noticed before the server did: the old connection is still open when the ticket comes back
    const b3 = rawClient(port); await until(() => b3.id);
    b3.send({ t: 'hello', name: 'Blip' }); b3.send({ t: 'join', game: a.game, ticket: b2.ticket }); await until(() => b3.state);
    check(await until(() => b2.closed) && b3.id === bid && a.state.crew.length === 2 && a.lobby.players.length === 2, 'the ticket also takes the seat over from a connection the server has not missed yet (that one is closed)');
    // a goodbye (a closed tab) still leaves at once
    b3.write(Buffer.from([0x88, 0x80, 1, 2, 3, 4])); await until(() => a.state.crew.length === 1);
    check(a.state.crew.length === 1 && a.lobby.players.length === 1, 'closing the tab (a close frame) still takes the crew member off the ship at once');
    a.sock.destroy(); b3.sock.destroy();
    A.stop(); A = null;

    // ----- heartbeat (pinging every 400 ms here instead of every 5 s)
    B = await startServer(['--ping', '400']);
    const asleep = rawClient(B.port, { pong: true }), idle = new WebSocket(`ws://localhost:${B.port}/ws`), quiet = rawClient(B.port, { pong: true });
    const idleGot = { lobby: null, id: null, closed: false };
    idle.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === 'welcome') idleGot.id = m.id; if (m.t === 'lobby') idleGot.lobby = m; };
    idle.onclose = () => { idleGot.closed = true; };
    await until(() => asleep.id && idleGot.id && quiet.id);
    asleep.send({ t: 'hello', name: 'Sleepy' }); asleep.send({ t: 'open', mission: 'c1' }); await until(() => asleep.game);
    idle.send(JSON.stringify({ t: 'hello', name: 'Idle' })); idle.send(JSON.stringify({ t: 'join', game: asleep.game }));
    quiet.send({ t: 'hello', name: 'Quiet' }); quiet.send({ t: 'join', game: asleep.game });
    await until(() => idleGot.lobby?.players.length === 3);
    check(idleGot.lobby?.host === asleep.id, 'three in a lobby, the first one hosts');
    await sleep(2400);                                 // (six pings: everyone answers, two of them send nothing else)
    check(idleGot.lobby.players.length === 3 && !idleGot.closed && !quiet.closed && quiet.pings >= 4, `connections that only answer the pings stay (a background tab; ${quiet.pings} pings answered)`);
    asleep.pong = false;                               // the host's laptop falls asleep: no pong, no close
    const gone = await until(() => idleGot.lobby.players.length === 2, 4000);
    check(gone && asleep.closed && idleGot.lobby.host === idleGot.id && !idleGot.lobby.players.some(p => p.name === 'Sleepy'), `one that stops answering is dropped after two missed pings, and the next player hosts (${idleGot.lobby.players.map(p => p.name + (p.host ? '*' : ''))})`);
    await sleep(1000);
    check(!idleGot.closed && !quiet.closed && idleGot.lobby.players.length === 2, 'the others are still there');
    idle.close(); quiet.sock.destroy();
  } catch (e) { check(false, 'server: ' + (e.stack || e.message)); }
  finally { A?.stop(); B?.stop(); }

  // ----- prototype 3's server side lives in the same process: whatever it throws stays inside it
  {
    const P3 = require('../prototype3/netserver'), Big = require('../prototype3/sim.js');
    const escaped = []; const onErr = (e) => escaped.push(e); process.on('uncaughtException', onErr);
    const log = console.error; let logged = 0; console.error = () => { logged++; };
    const frame = (o) => { const p = Buffer.from(JSON.stringify(o)); return Buffer.concat([Buffer.from(p.length < 126 ? [0x81, p.length] : [0x81, 126, p.length >> 8, p.length & 255]), p]); };
    const join = (name) => { const s = new EventEmitter(); Object.assign(s, { write() {}, destroy() {}, end() {}, setNoDelay() {} }); P3.upgrade({ headers: { 'sec-websocket-key': 'x' } }, s); s.emit('data', frame({ t: 'hello', name })); return s; };
    const realCreate = Big.createSim; let mode = 'tick';
    Big.createSim = (o) => {
      const sim = realCreate(o);
      if (mode === 'tick') sim.tick = () => { throw new Error('boom in tick'); };
      if (mode === 'snapshot') { const snap = sim.snapshot; let n = 0; sim.snapshot = () => { if (n++) throw new Error('boom in snapshot'); return snap(); }; }
      if (mode === 'input') sim.setInput = () => { throw new Error('boom in input'); };
      return sim;
    };
    let threw = null;
    try {
      const crew = Array.from({ length: Math.max(1, Big.MIN_CREW) }, (_, i) => join('P' + i));
      for (mode of ['tick', 'snapshot']) {
        crew[0].emit('data', frame({ t: 'start' }));
        const ran = !!P3.sim; await sleep(200);
        check(ran && P3.sim === null && escaped.length === 0, `prototype 3: an exception in its ${mode} is logged and that run is dropped (nothing reaches the process)`);
      }
      mode = 'input';
      crew[0].emit('data', frame({ t: 'start' })); crew[0].emit('data', frame({ t: 'input', in: { up: true } }));
      await sleep(100);
      check(!!P3.sim && escaped.length === 0 && logged >= 3, 'prototype 3: an exception in a message is logged; the run goes on');
      for (const s of crew) s.emit('close');
      check(P3.sim === null, 'prototype 3: the run ends when everyone has left');
      const huge = join('Huge'), header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(8 << 20), 2);
      let cut = false; huge.destroy = () => { cut = true; }; huge.emit('data', header);
      check(cut, 'prototype 3: the same frame size cap');
    } catch (e) { threw = e; }
    check(!threw, `prototype 3: nothing thrown out of its socket handlers (${threw ? threw.message : 'none'})`);
    console.error = log; Big.createSim = realCreate; process.off('uncaughtException', onErr);
  }

  console.log(failed ? `\n${failed} FAILED` : `\nall ${checked} server checks passed`);
  process.exit(failed || !checked ? 1 : 0);
})();
