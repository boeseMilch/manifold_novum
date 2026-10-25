#!/usr/bin/env node
// Manifold Novum LAN server: serves the game over HTTP and runs the shared simulation.
// No dependencies.  Usage:  node server.js [port]   →  open http://<this-machine>:<port>
//
// Everyone who opens the page lands in the main menu, which lists the open games. Anyone can
// open a game (and is its host) or join one with room (8 players each), also mid-mission. Only
// the host picks the mission and starts it; when the host leaves, the next player takes over.
// When the mission is over, anyone can press R to send that game back to its lobby. A game
// closes when its last player leaves.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm'), os = require('os'), zlib = require('zlib');

const PORT = +process.argv[2] || +process.env.PORT || 8080;
const ROOT = __dirname;
const SCRIPTS = ['audio', 'music', 'art', 'gfx', 'ship', 'decor', 'interior', 'enemies', 'combat', 'systems', 'invader', 'mission', 'hazards', 'eva', 'encounters', 'minigames', 'organic', 'dock', 'culture', 'leviathan', 'captain', 'airlock', 'dockentry', 'spores', 'progress', 'practice', 'sidebar', 'claims', 'tutorial-mp', 'lights', 'sprites', 'game', 'net'];
const TICK = 1 / 60, SEND_EVERY = 2;                // simulate at 60 Hz, send snapshots at 30 Hz
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || p.includes('..')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const head = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    // A byte range (a browser seeking in a recording, js/music.js: without range answers it can't seek an audio element)
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      const n = data.length, a = r[1] ? +r[1] : Math.max(0, n - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], n - 1) : n - 1;
      if (a >= n || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${n}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${n}`, 'Content-Length': b - a + 1 });
      return res.end(data.subarray(a, b + 1));
    }
    res.writeHead(200, head);
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Minimal WebSocket (RFC 6455): text frames, ping/pong, close, and permessage-deflate (RFC 7692) when
// the browser offers it (they all do): a snapshot is ~10 KB of JSON, 30 a second (2.5 Mbit/s per player,
// too much for many home uplinks and tunnels); compressed with the context kept between messages it's
// under 1 KB. Browsers compress their own (small) messages one by one (client_no_context_takeover).
// ---------------------------------------------------------------------------
server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] !== '/ws' || !req.headers['sec-websocket-key']) return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  const offer = String(req.headers['sec-websocket-extensions'] || '').split(',').map(o => o.trim()).find(o => /^permessage-deflate\b/i.test(o));
  const deflate = !!offer && !/server_/i.test(offer);  // (an offer that limits the server's side: plain frames)
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`,
    ...(deflate ? ['Sec-WebSocket-Extensions: permessage-deflate; client_no_context_takeover'] : []), '', ''].join('\r\n'));
  socket.setNoDelay(true);
  const client = { socket, id: nextId++, name: 'Crew', alive: true, buf: Buffer.alloc(0), z: null, zq: [], zbuf: [] };
  if (deflate) { client.z = zlib.createDeflateRaw({ level: 3 }); client.z.on('data', (d) => client.zbuf.push(d)); client.z.on('error', () => drop(client)); }
  socket.on('data', (chunk) => { client.buf = Buffer.concat([client.buf, chunk]); readFrames(client); });
  socket.on('close', () => drop(client));
  socket.on('error', () => drop(client));
  connect(client);
});
function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, rsv1 = b[0] & 0x40, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    const maskOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    const data = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= b[maskOff + (i & 3)];
    c.buf = b.subarray(off + len);
    if (op === 0x8) { c.socket.end(); return drop(c); }
    if (op === 0x9) { sendFrame(c, data, 0xA); continue; }
    if (op === 0x1) {
      try {
        const text = rsv1 && c.z ? zlib.inflateRawSync(Buffer.concat([data, Buffer.from([0, 0, 0xff, 0xff])]), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: 1 << 20 }) : data;
        onMessage(c, JSON.parse(text.toString('utf8')));
      } catch (e) { /* ignore bad messages */ }
    }
  }
}
function sendFrame(c, payload, op = 0x1, compressed = false) {
  if (!c.alive) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = data.length, b0 = 0x80 | (compressed ? 0x40 : 0) | op;
  const head = len < 126 ? Buffer.from([b0, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (len >= 126 && len < 65536) { head[0] = b0; head[1] = 126; head.writeUInt16BE(len, 2); }
  else if (len >= 65536) { head[0] = b0; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  try { c.socket.write(Buffer.concat([head, data])); } catch (e) { drop(c); }
}
// Every text message goes through here (so they stay in order): compressed one after another, or plain.
function sendText(c, text) {
  if (!c.alive) return;
  if (!c.z) return sendFrame(c, text);
  c.zq.push(text);
  if (c.zq.length === 1) deflateNext(c);
}
function deflateNext(c) {
  if (!c.alive || !c.zq.length) return;
  c.z.write(c.zq[0]);
  c.z.flush(zlib.constants.Z_SYNC_FLUSH, () => {
    const out = Buffer.concat(c.zbuf); c.zbuf = [];
    c.zq.shift();
    sendFrame(c, out.subarray(0, out.length - 4), 0x1, true);   // (without the flush's 00 00 ff ff tail)
    deflateNext(c);
  });
}
// A browser that can't keep up (slow uplink, a hiccup in the tunnel) skips snapshots instead of getting
// an ever longer queue of old ones (seconds of lag that never go away). Each snapshot is the whole state.
const behind = (c) => c.zq.length > 1 || c.socket.writableLength > 64 * 1024;
const send = (c, obj) => sendText(c, JSON.stringify(obj));

// ---------------------------------------------------------------------------
// Games: every connection starts in the main menu (it gets the live list of open games).
// Anyone can open a game (they become its host) or join one; each game has its own lobby,
// its own mission choice and its own running simulation, with up to 8 players.
// ---------------------------------------------------------------------------
let nextId = 1, nextGameId = 1;
const MAX_PLAYERS = 8;                                 // per game (8 spawn spots and 8 crew colours)
const RETURN_GRACE = 15000;                            // after a mission, a page reload keeps your seat this long (ms)
const clients = new Set();                             // every connection (in the menu or in a game)
const games = new Map();                               // id → { id, members[], phase, missionId, run }
const COLORS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#c43a3a'];
const colorOf = (c) => (/^#[0-9a-f]{6}$/i.test(c.kit?.paint) ? c.kit.paint : COLORS[(c.id - 1) % COLORS.length]);
const live = (g) => g.members.filter(c => c.alive);
const hostOf = (g) => g.members[0] || null;           // the earliest joined player still in the game

const clampEasy = (v) => Math.min(2, Math.max(0, Math.floor(+v) || 0));   // difficulty: 0 normal, 1 easy, 2 very easy
// The skirmish builder's config (the host's; the sim checks it properly: customConfig in js/progress.js): just its shape here
const strs = (a) => (Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 64).map(x => x.slice(0, 40)) : undefined);
const cleanCustom = (c) => (c && typeof c === 'object' ? { n: Math.floor(+c.n) || 8, kinds: strs(c.kinds), parts: strs(c.parts) } : null);
function lobbyState(g) {
  const unlocked = [...new Set(g.members.flatMap(c => c.unlocked || []))];
  const host = hostOf(g);
  return { t: 'lobby', game: g.id, phase: g.phase, mission: g.missionId, easy: g.easy || 0, custom: g.custom || null, unlocked, host: host && host.id, hostShip: (host && host.ship) || {}, hostRep: host && Number.isFinite(host.rep) ? host.rep : null, max: MAX_PLAYERS,
    players: g.members.map(c => ({ id: c.id, name: c.name, color: colorOf(c), host: c === host, away: !c.alive || undefined })) };
}
function gameList() {
  return { t: 'games', max: MAX_PLAYERS, games: [...games.values()].map(g => {
    const h = hostOf(g);
    return { id: g.id, host: h ? h.name : '?', color: h ? colorOf(h) : '#888', mission: g.missionId, players: g.members.length, phase: g.phase, full: g.members.length >= MAX_PLAYERS };
  }) };
}
const sendAll = (list, obj) => { const s = JSON.stringify(obj); for (const c of list) sendText(c, s); };
// Changes are collected and sent once per turn: the game's lobby to its players, the list to everyone in the menu.
const dirty = new Set(); let listDirty = false, flushQueued = false;
function changed(g) {
  if (g) dirty.add(g);
  listDirty = true;
  if (!flushQueued) { flushQueued = true; setImmediate(flush); }
}
function flush() {
  flushQueued = false;
  for (const g of dirty) if (games.has(g.id)) sendAll(live(g), lobbyState(g));
  dirty.clear();
  if (listDirty) { listDirty = false; sendAll([...clients].filter(c => !c.game), gameList()); }
}

function connect(c) {
  clients.add(c);
  send(c, { t: 'welcome', id: c.id, max: MAX_PLAYERS });
  send(c, gameList());
}
function drop(c) {
  if (!c.alive) return;
  c.alive = false; clients.delete(c);
  if (c.z) { c.z.close(); c.zq.length = 0; }
  const g = c.game;
  if (!g) return;
  if (g.phase === 'lobby' && c.returning && Date.now() - c.returning < RETURN_GRACE) {
    // back from a mission: the page reloads and comes back with its ticket; keep the seat a moment
    c.away = setTimeout(() => removeMember(g, c), RETURN_GRACE);
    changed(g);
  } else removeMember(g, c);
}
function removeMember(g, c) {
  const i = g.members.indexOf(c);
  if (i < 0) return;
  g.members.splice(i, 1); c.game = null; clearTimeout(c.away);
  if (g.run) g.run.sim.netServer.removeCrew(c.id);
  if (!live(g).length) closeGame(g);                   // nobody left (seats kept for reloads don't count)
  else changed(g);
}
function closeGame(g) {
  if (g.run) clearInterval(g.run.timer);
  for (const c of g.members) { clearTimeout(c.away); c.game = null; }
  g.members.length = 0; games.delete(g.id); changed(null);
  console.log(`[game ${g.id}] closed`);
}
function enter(c, g) {                                 // c joins g (there is room)
  c.game = g; c.ticket = crypto.randomBytes(9).toString('hex'); c.returning = 0;
  send(c, { t: 'joined', game: g.id, ticket: c.ticket });
  if (g.run) { g.run.sim.netServer.addCrew(c.id, c.name, c.kit); send(c, { t: 'start', mission: g.missionId, game: g.id }); }
  changed(g);
}
function openGame(c, mission, easy, custom) {
  const g = { id: nextGameId++, members: [c], phase: 'lobby', missionId: mission ? String(mission).slice(0, 40) : 'c1', easy: clampEasy(easy), custom: cleanCustom(custom), run: null };
  games.set(g.id, g);
  enter(c, g);
  console.log(`[game ${g.id}] opened by ${c.name}`);
}
function joinGame(c, id, ticket) {
  const g = games.get(+id);
  if (!g) return send(c, { t: 'gone', game: +id || null });
  const seat = ticket && g.members.find(m => !m.alive && m.ticket === String(ticket));
  if (seat) {                                          // coming back after the reload: take your old seat (and host role)
    clearTimeout(seat.away);
    g.members[g.members.indexOf(seat)] = c;
    return enter(c, g);
  }
  if (g.members.length >= MAX_PLAYERS) return send(c, { t: 'full', max: MAX_PLAYERS, game: g.id });
  g.members.push(c);
  enter(c, g);
}
function leaveGame(c) {
  if (!c.game) return;
  removeMember(c.game, c);
  send(c, gameList());
}

function onMessage(c, m) {
  const g = c.game, isHost = g && hostOf(g) === c;
  if (m.t === 'hello') {
    c.name = String(m.name || 'Crew').slice(0, 20);
    if (m.kit && typeof m.kit === 'object') c.kit = m.kit;                  // the player's gear and profession (from their own saved profile)
    if (m.ship && typeof m.ship === 'object') c.ship = m.ship;              // ship upgrades they bought (only the host's fly)
    if (Number.isFinite(m.rep)) c.rep = Math.max(0, Math.floor(m.rep));    // unspent reputation (guests see the host's in the shipyard)
    if (Array.isArray(m.unlocked)) c.unlocked = m.unlocked.map(String).slice(0, 50);
    if (g?.run) { const cr = g.run.sim.crew.find(x => x.id === c.id); if (cr) cr.name = c.name; }
    changed(g);
  }
  else if (m.t === 'games') send(c, gameList());
  else if (m.t === 'open') { if (g) removeMember(g, c); openGame(c, m.mission, m.easy, m.custom); }
  else if (m.t === 'join') { if (g && g.id === +m.game) return; if (g) removeMember(g, c); joinGame(c, m.game, m.ticket); }
  else if (m.t === 'leave') leaveGame(c);
  else if (!g) return;                                 // (everything below is for players in a game)
  else if (m.t === 'mission' && isHost && g.phase === 'lobby') { g.missionId = String(m.id).slice(0, 40); changed(g); }
  else if (m.t === 'difficulty' && isHost && g.phase === 'lobby') { g.easy = clampEasy(m.easy); changed(g); }
  else if (m.t === 'skirmish' && isHost && g.phase === 'lobby') { g.custom = cleanCustom(m.custom); changed(g); }
  else if (m.t === 'start' && isHost && g.phase === 'lobby') startGame(g);
  else if (m.t === 'input' && g.run) g.run.sim.netServer.input(c.id, m);
  else if (m.t === 'cmd' && g.run) g.run.sim.netServer.command(c.id, m.cmd);
  else if (m.t === 'lobby' && g.run && g.run.sim.mission.over) endGame(g);
}

// A fresh simulation sandbox per mission (the game scripts keep their state in globals).
function makeSim() {
  const noop = new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), apply: () => noop, set: () => true });
  const sandbox = {
    window: { addEventListener() {}, innerWidth: 1600, innerHeight: 1000, devicePixelRatio: 1 },
    document: { getElementById: (id) => (id === 'lobby' ? null : { getContext: () => noop, style: {}, addEventListener() {} }) },
    performance: { now: () => Date.now() }, requestAnimationFrame: () => {}, location: { hash: '#server', protocol: 'server:' },
    console, Math, setTimeout, setInterval, localStorage: { getItem: () => null, setItem() {} },
  };
  vm.createContext(sandbox);
  const code = SCRIPTS.map(f => fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')).join('\n;\n')
    + '\n;globalThis.__sim = { netServer, netSerialize, netCaptureSfx, get mission() { return mission; }, get crew() { return crew; } };';
  vm.runInContext(code, sandbox, { filename: 'manifold-novum-sim.js' });
  return sandbox.__sim;
}
function startGame(g) {
  const crewNow = live(g);
  const sim = makeSim();
  const sfx = sim.netCaptureSfx();
  const host = hostOf(g);                               // one ship: the host's (their upgrades; everyone earns their own reputation)
  sim.netServer.init(g.missionId, { ...(host && host.ship || {}) }, g.easy || 0, host && { id: host.id, name: host.name }, g.custom || null);
  for (const c of crewNow) sim.netServer.addCrew(c.id, c.name, c.kit);
  g.phase = 'game';
  g.run = { sim, sfx, tick: 0, last: Date.now(), acc: 0 };
  sendAll(crewNow, { t: 'start', mission: g.missionId, game: g.id });
  g.run.timer = setInterval(() => stepGame(g), 1000 / 120);
  changed(g);
  console.log(`[game ${g.id}] started "${g.missionId}" with ${crewNow.length} crew${g.easy ? ` (${['', 'easy', 'very easy'][g.easy]})` : ''}`);
}
function stepGame(g) {
  const run = g.run, now = Date.now();
  run.acc += Math.min(0.25, (now - run.last) / 1000); run.last = now;
  let due = false;
  while (run.acc >= TICK) {
    run.acc -= TICK;
    try { run.sim.netServer.step(TICK); } catch (e) { console.error(`[game ${g.id}] sim error`, e); }
    if (++run.tick % SEND_EVERY === 0) due = true;
  }
  if (!due) return;                                    // (catching up several ticks at once: one snapshot, the latest)
  const snap = JSON.stringify(run.sim.netSerialize()), events = run.sfx.splice(0), fx = JSON.stringify(events);
  for (const c of live(g)) {
    if (behind(c)) { c.sfxLate = [...(c.sfxLate || []), ...events].slice(-60); continue; }   // (its sounds wait for the next one it gets)
    const late = c.sfxLate; c.sfxLate = null;
    sendText(c, `{"t":"state","you":${c.id},"sfx":${late ? JSON.stringify([...late, ...events]) : fx},"s":${snap}}`);
  }
}
function endGame(g) {                                  // mission over: everyone back to this game's lobby
  clearInterval(g.run.timer);
  g.run = null; g.phase = 'lobby';
  const now = Date.now();
  for (const c of g.members) c.returning = now;        // (their pages reload; see drop)
  changed(g);
  console.log(`[game ${g.id}] back to the lobby`);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Manifold Novum server on port ${PORT}`);
  for (const ip of ips.length ? ips : ['localhost']) console.log(`  open  http://${ip}:${PORT}`);
});
