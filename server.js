#!/usr/bin/env node
// Manifold Novum LAN server: serves the game over HTTP and runs the shared simulation.
// No dependencies.  Usage:  node server.js [port]   →  open http://<this-machine>:<port>
// (port 0: any free port; the one it got is printed. The tests start their servers that way.)
// Testing over a slow connection: node server.js 8110 --lag 100 --jitter 20 --bw 2000 [--up 500] delays every
// connection like such a link (ms each way, ms of jitter, kbit/s to the browser / from it; tools/netlink.js), or a single
// browser opens the page with ?lag=100&bw=2000. Headless measurements of the same: node tools/netsim.js.
//
// Everyone who opens the page lands in the main menu, which lists the open games. Anyone can
// open a game (and is its host) or join one with room (8 players each), also mid-mission. Only
// the host picks the mission and starts it; when the host leaves, the next player takes over.
// When the mission is over, anyone can press a key or click to send that game back to its lobby. A game
// closes when its last player leaves.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm'), os = require('os'), zlib = require('zlib');
const { makeLink, linkOpts, makeFlow } = require('./tools/netlink');

const argOpt = (k) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : null; };
const portOf = (v) => (v != null && /^\d+$/.test(v) ? +v : null);   // (0 counts: any free port)
const PORT = portOf(process.argv[2]) ?? portOf(process.env.PORT) ?? 8080;
const LINK = linkOpts(argOpt);                         // (--lag … for everyone)
const ROOT = __dirname;
const SCRIPTS = ['audio', 'music', 'art', 'gfx', 'ship', 'decor', 'interior', 'enemies', 'combat', 'systems', 'invader', 'mission', 'hazards', 'eva', 'encounters', 'minigames', 'organic', 'dock', 'culture', 'leviathan', 'captain', 'airlock', 'dockentry', 'spores', 'progress', 'practice', 'sidebar', 'claims', 'tutorial-mp', 'lights', 'sprites', 'game', 'net'];
const TICK = 1 / 60, SEND_EVERY = 2;                // simulate at 60 Hz, send snapshots at 30 Hz
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg']);   // text: sent gzipped to a browser that takes it (the pictures and recordings are compressed already)

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
// Only what the game is made of goes out: the pages in this folder (index.html, music.html), js/, assets/ and the
// prototypes, and of those only the kinds of file a browser loads (MIME). Not the rest of the working folder (.git,
// the notes, tools/, tests/): the README tells players to open this server to the LAN and to tunnels.
// Returns the file's path, or the HTTP status to answer with.
function staticPath(url) {
  let p;
  try { p = decodeURIComponent((url || '/').split('?')[0]); } catch (e) { return 400; }   // (a broken %-escape)
  if (p[0] !== '/' || p.includes('\0')) return 400;   // (a NUL byte: fs throws on it)
  if (p === '/') p = '/index.html';
  else if (p.endsWith('/')) p += 'index.html';      // (a folder: its index.html, e.g. /prototype3/)
  const seg = p.slice(1).split('/');
  if (seg.some(x => x[0] === '.' || x.includes('\\'))) return 403;   // (.git, .claude, any dot-file, and .. out of the folder)
  const ours = seg.length === 1 ? /\.html$|^favicon\.\w+$/.test(seg[0]) : seg[0] === 'js' || seg[0] === 'assets' || /^prototype\d+$/.test(seg[0])
    || p === '/tools/sprites/gallery.html';          // (the sprite gallery, a page for whoever works on the art: the one thing out of tools/)
  if (!ours || seg.includes('') || !MIME[path.extname(p)]) return 404;
  return path.join(ROOT, ...seg);
}
// Browsers keep what they got but ask every time whether it is still current (no-cache, with the file's size and
// time as its ETag): unchanged files answer 304 with no body (after a mission the page reloads: megabytes of sprites
// and a recording otherwise come again), and an edited file shows up on the next reload, as it must while developing.
const gzipped = new Map();                             // file → { tag, data }: the gzipped text files, until they change
const server = http.createServer((req, res) => {
  const end = (code, text = '', head = {}) => { res.writeHead(code, head); res.end(text); };
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405, '', { Allow: 'GET, HEAD' });
    const file = staticPath(req.url);
    if (typeof file === 'number') return end(file, file === 404 ? 'not found' : '');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return end(404, 'not found');
      const ext = path.extname(file), range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const zip = GZIP.has(ext) && !range && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
      const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}${zip ? '-gz' : ''}"`;
      const head = { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache', ETag: tag, 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes', ...(GZIP.has(ext) ? { Vary: 'Accept-Encoding' } : {}) };
      const inm = req.headers['if-none-match'], ims = Date.parse(req.headers['if-modified-since'] || '');
      const same = inm ? inm.split(',').some(t => t.trim().replace(/^W\//, '') === tag) : Math.floor(st.mtimeMs / 1000) * 1000 <= ims;
      if (same) return end(304, '', head);
      if (req.method === 'HEAD') return end(200, '', head);
      const z = zip && gzipped.get(file);
      if (z && z.tag === tag) return end(200, z.data, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': z.data.length });
      fs.readFile(file, (err, data) => {
        if (err) return end(404, 'not found');
        // A byte range (a browser seeking in a recording, js/music.js: without range answers it can't seek an audio element)
        if (range && (range[1] || range[2])) {
          const n = data.length, a = range[1] ? +range[1] : Math.max(0, n - +range[2]), b = range[1] && range[2] ? Math.min(+range[2], n - 1) : n - 1;
          if (a >= n || a > b) return end(416, '', { 'Content-Range': `bytes */${n}` });
          return end(206, data.subarray(a, b + 1), { ...head, 'Content-Range': `bytes ${a}-${b}/${n}`, 'Content-Length': b - a + 1 });
        }
        if (!zip) return end(200, data, { ...head, 'Content-Length': data.length });
        zlib.gzip(data, (err, gz) => {
          if (err) return end(200, data, { ...head, ETag: tag.replace('-gz', '') });
          gzipped.set(file, { tag, data: gz });
          end(200, gz, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': gz.length });
        });
      });
    });
  } catch (e) { console.error('[http]', req.url, e); try { end(500); } catch (e2) { res.destroy(); } }   // (no request may end the games)
});

// ---------------------------------------------------------------------------
// Minimal WebSocket (RFC 6455): text frames, ping/pong, close, and permessage-deflate (RFC 7692) when
// the browser offers it (they all do): a snapshot is ~10 KB of JSON, 30 a second (2.5 Mbit/s per player,
// too much for many home uplinks and tunnels); compressed with the context kept between messages it's
// under 1 KB. Browsers compress their own (small) messages one by one (client_no_context_takeover).
// ---------------------------------------------------------------------------
server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] === '/ws-big') {   // prototype 3, the big ship (still changing: nothing in it may end the games here)
    try { return require('./prototype3/netserver').upgrade(req, socket); } catch (e) { console.error('[prototype 3]', e); return socket.destroy(); }
  }
  if ((req.url || '').split('?')[0] !== '/ws' || !req.headers['sec-websocket-key']) return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  const offer = String(req.headers['sec-websocket-extensions'] || '').split(',').map(o => o.trim()).find(o => /^permessage-deflate\b/i.test(o));
  const deflate = !!offer && !/server_/i.test(offer);  // (an offer that limits the server's side: plain frames)
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`,
    ...(deflate ? ['Sec-WebSocket-Extensions: permessage-deflate; client_no_context_takeover'] : []), '', ''].join('\r\n'));
  socket.setNoDelay(true);
  const client = { socket, id: nextId++, name: 'Crew', alive: true, missed: 0, buf: Buffer.alloc(0), z: null, zq: [], zbuf: [], flow: makeFlow(), link: null };
  if (deflate) { client.z = zlib.createDeflateRaw({ level: 3 }); client.z.on('data', (d) => client.zbuf.push(d)); client.z.on('error', () => drop(client)); }
  const q = new URLSearchParams((req.url || '').split('?')[1] || ''), lo = linkOpts((k) => q.get(k)) || LINK;   // a simulated slow link (testing)
  if (lo) {
    client.link = { down: makeLink({ lag: lo.lag, jitter: lo.jitter, bw: lo.bw, seed: client.id }), up: makeLink({ lag: lo.lag, jitter: lo.jitter, bw: lo.up, seed: client.id + 99 }), out: delayer(), in: delayer() };
    console.log(`[link] connection ${client.id}: ${lo.lag} ms each way${lo.jitter ? ` + up to ${lo.jitter} ms` : ''}${lo.bw ? `, ${lo.bw} kbit/s down` : ''}${lo.up ? `, ${lo.up} kbit/s up` : ''}`);
  }
  const take = (chunk) => { client.buf = Buffer.concat([client.buf, chunk]); readFrames(client); };
  socket.on('data', (chunk) => { client.missed = 0; if (client.link) client.link.in(client.link.up.send(chunk.length, Date.now()), () => client.alive && take(chunk)); else take(chunk); });
  socket.on('close', () => drop(client));
  socket.on('error', () => drop(client));
  connect(client);
});
const MAX_FRAME = 1 << 20;                             // bytes in one frame from a browser (the same in prototype3/netserver.js)
function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, rsv1 = b[0] & 0x40, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_FRAME) { c.socket.destroy(); return drop(c); }   // (nobody's message is that long: don't buffer it)
    const maskOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    const data = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= b[maskOff + (i & 3)];
    c.buf = b.subarray(off + len);
    if (op === 0x8) { try { c.socket.end(); } catch (e) { /* gone already */ } return drop(c, true); }   // (it said goodbye: a closed tab, a reload)
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
  const frame = Buffer.concat([head, data]);
  if (c.link) return c.link.out(c.link.down.send(frame.length, Date.now()), () => { if (c.alive) try { c.socket.write(frame); } catch (e) { drop(c); } });
  try { c.socket.write(frame); } catch (e) { drop(c); }
}
// Heartbeat: a laptop that falls asleep or leaves the Wi-Fi says nothing, and its connection would stay a player (and
// the host, so nobody could start) until TCP gives up, minutes later. Every connection gets a ping frame every 5 s;
// one that sent nothing at all (no pong, no input) for two pings in a row is dropped. Browsers answer pings themselves,
// below the page's scripts, so a tab in the background (its timers throttled) stays. (--ping <ms>: the tests' pace.)
const PING_EVERY = +argOpt('ping') || 5000, PING_MISSES = 2;
setInterval(() => {
  for (const c of [...clients]) {
    if (c.missed >= PING_MISSES) { c.socket.destroy(); drop(c); continue; }
    c.missed++; sendFrame(c, '', 0x9);
  }
}, PING_EVERY);
// A simulated link's delivery queue: run each callback at its time (ms, Date.now()), in order, on one timer.
function delayer() {
  const q = []; let timer = null;
  const pump = () => {
    timer = null;
    const now = Date.now();
    while (q.length && q[0][0] <= now) q.shift()[1]();
    if (q.length) timer = setTimeout(pump, q[0][0] - now);
  };
  return (at, fn) => { q.push([at, fn]); if (!timer) timer = setTimeout(pump, Math.max(0, at - Date.now())); };
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
// Also behind: snapshots coming back acknowledged much later than the quickest round trip (a queue the server can't see:
// a slow uplink, a tunnel, the kernel's socket buffer; tools/netlink.js makeFlow), or a simulated link's own queue.
const behind = (c) => c.zq.length > 1 || c.socket.writableLength + (c.link ? c.link.down.backlog(Date.now()) : 0) > 64 * 1024 || c.flow.behind(Date.now());
const send = (c, obj) => sendText(c, JSON.stringify(obj));

// ---------------------------------------------------------------------------
// Games: every connection starts in the main menu (it gets the live list of open games).
// Anyone can open a game (they become its host) or join one; each game has its own lobby,
// its own mission choice and its own running simulation, with up to 8 players.
// ---------------------------------------------------------------------------
let nextId = 1, nextGameId = 1;
const MAX_PLAYERS = 8;                                 // per game (8 spawn spots and 8 crew colours)
const RETURN_GRACE = 15000;                            // after a mission, a page reload keeps your seat this long (ms); a lost connection mid-mission too
const clients = new Set();                             // every connection (in the menu or in a game)
const games = new Map();                               // id → { id, members[], phase, missionId, run }
const COLORS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#c43a3a'];
const colorOf = (c) => (/^#[0-9a-f]{6}$/i.test(c.kit?.paint) ? c.kit.paint : COLORS[(c.id - 1) % COLORS.length]);
const live = (g) => g.members.filter(c => c.alive);
const hostOf = (g) => g.members[0] || null;           // the earliest joined player still in the game

const clampEasy = (v) => Math.min(2, Math.max(-1, Math.floor(+v) || 0));   // difficulty: -1 hard, 0 normal, 1 easy, 2 very easy
// The skirmish builder's config (the host's; the sim checks it properly: customConfig in js/progress.js): just its shape here
const strs = (a) => (Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 64).map(x => x.slice(0, 40)) : undefined);
const cleanCustom = (c) => (c && typeof c === 'object' ? { points: +c.points || undefined, n: Math.floor(+c.n) || undefined, kinds: strs(c.kinds), parts: strs(c.parts) } : null);   // (n: an older host's count)
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
function drop(c, clean = false) {                      // clean: the browser closed the connection itself (a close frame)
  if (!c.alive) return;
  c.alive = false; clients.delete(c);
  if (c.z) { c.z.close(); c.zq.length = 0; }
  const g = c.game;
  if (!g) return;
  // Keep the seat a moment: back from a mission the page reloads and comes back with its ticket; and a connection
  // lost mid-mission without a goodbye (a Wi-Fi blip, a sleeping laptop) may be back in a few seconds (js/net.js
  // netLost): their crew member stays aboard, with what they carry, until then.
  if (g.phase === 'lobby' ? c.returning && Date.now() - c.returning < RETURN_GRACE : !clean) {
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
  if (g.run) {
    if (!g.run.sim.crew.some(x => x.id === c.id)) g.run.sim.netServer.addCrew(c.id, c.name, c.kit);   // (back in their seat: still aboard)
    send(c, { t: 'start', mission: g.missionId, game: g.id });
  }
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
  const seat = ticket && g.members.find(m => m !== c && m.ticket === String(ticket));
  if (seat) {                                          // coming back after the reload: take your old seat (and host role)
    clearTimeout(seat.away);
    g.members[g.members.indexOf(seat)] = c; seat.game = null;
    if (seat.alive) { drop(seat); seat.socket.destroy(); }   // (the old connection, not missed yet: the browser noticed first)
    if (g.run) { c.id = seat.id; send(c, { t: 'welcome', id: c.id, max: MAX_PLAYERS }); }   // mid-mission: the same crew member as before
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
  else if (m.t === 'input' && g.run) { if (Number.isFinite(m.ack)) c.flow.acked(m.ack, Date.now()); g.run.sim.netServer.input(c.id, m); }
  else if (m.t === 'cmd' && g.run) { if (Array.isArray(m.cmd) && m.cmd[0] === 'debug' && !isHost) return; g.run.sim.netServer.command(c.id, m.cmd); }   // (the debug menu: the host's only)
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
    + '\n;globalThis.__sim = { netServer, netSerialize, netSnapshotText, netCaptureSfx, get mission() { return mission; }, get crew() { return crew; } };';
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
  console.log(`[game ${g.id}] started "${g.missionId}" with ${crewNow.length} crew${g.easy ? ` (${{ '-1': 'hard', 1: 'easy', 2: 'very easy' }[g.easy]})` : ''}`);
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
  const snap = run.sim.netSnapshotText(), events = run.sfx.splice(0), fx = JSON.stringify(events);   // (n: the browser acknowledges it)
  for (const c of live(g)) {
    if (behind(c)) { c.sfxLate = [...(c.sfxLate || []), ...events].slice(-60); continue; }   // (its sounds wait for the next one it gets)
    const late = c.sfxLate; c.sfxLate = null;
    c.snapN = (c.snapN || 0) + 1; c.flow.sent(c.snapN, now);
    sendText(c, `{"t":"state","n":${c.snapN},"you":${c.id},"sfx":${late ? JSON.stringify([...late, ...events]) : fx},"s":${snap}}`);
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

server.on('error', (e) => {                            // (not listening: say why and end, rather than a stack trace)
  if (server.listening) return console.error('[http]', e);
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use (another server?). Pick another one: node server.js 9000` : `Server error: ${e.message}`);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  const port = server.address().port;                  // (the real one: PORT may be 0, any free port)
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Manifold Novum server on port ${port}`);
  for (const ip of ips.length ? ips : ['localhost']) console.log(`  open  http://${ip}:${port}`);
});
