#!/usr/bin/env node
// Manifold Novum LAN server: serves the game over HTTP and runs the shared simulation.
// No dependencies.  Usage:  node server.js [port]   →  open http://<this-machine>:<port>
//
// Everyone who opens the page lands in the lobby. Anyone can pick the mission and start it;
// everyone in the lobby joins that game, and people who connect mid-game drop straight in.
// When the mission is over, anyone can press R to send everybody back to the lobby.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm'), os = require('os');

const PORT = +process.argv[2] || +process.env.PORT || 8080;
const ROOT = __dirname;
const SCRIPTS = ['audio', 'music', 'art', 'ship', 'decor', 'interior', 'enemies', 'combat', 'systems', 'invader', 'mission', 'hazards', 'eva', 'encounters', 'minigames', 'organic', 'dock', 'progress', 'practice', 'sidebar', 'game', 'net'];
const TICK = 1 / 60, SEND_EVERY = 2;                // simulate at 60 Hz, send snapshots at 30 Hz
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };

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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Minimal WebSocket (RFC 6455): text frames, ping/pong, close.
// ---------------------------------------------------------------------------
server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] !== '/ws' || !req.headers['sec-websocket-key']) return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);
  const client = { socket, id: nextId++, name: 'Crew', alive: true, buf: Buffer.alloc(0) };
  socket.on('data', (chunk) => { client.buf = Buffer.concat([client.buf, chunk]); readFrames(client); });
  socket.on('close', () => drop(client));
  socket.on('error', () => drop(client));
  join(client);
});
function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, masked = b[1] & 0x80;
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
    if (op === 0x1) { try { onMessage(c, JSON.parse(data.toString('utf8'))); } catch (e) { /* ignore bad messages */ } }
  }
}
function sendFrame(c, payload, op = 0x1) {
  if (!c.alive) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (len >= 126 && len < 65536) { head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else if (len >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  try { c.socket.write(Buffer.concat([head, data])); } catch (e) { drop(c); }
}
const send = (c, obj) => sendFrame(c, JSON.stringify(obj));

// ---------------------------------------------------------------------------
// Lobby + game
// ---------------------------------------------------------------------------
let nextId = 1;
const clients = new Set();
let phase = 'lobby', missionId = 'intro', game = null;
const COLORS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#c43a3a'];

function lobbyState() {
  const unlocked = [...new Set([...clients].flatMap(c => c.unlocked || []))];
  return { t: 'lobby', phase, mission: missionId, unlocked, players: [...clients].map(c => ({ id: c.id, name: c.name, color: /^#[0-9a-f]{6}$/i.test(c.kit?.paint) ? c.kit.paint : COLORS[(c.id - 1) % COLORS.length], level: c.level || 1 })) };
}
const broadcast = (obj) => { const s = JSON.stringify(obj); for (const c of clients) sendFrame(c, s); };

function join(c) {
  clients.add(c);
  send(c, { t: 'welcome', id: c.id });
  if (phase === 'game') { game.sim.netServer.addCrew(c.id, c.name, c.kit); send(c, { t: 'start', mission: missionId }); }
  broadcast(lobbyState());
}
function drop(c) {
  if (!c.alive) return;
  c.alive = false; clients.delete(c);
  if (game) game.sim.netServer.removeCrew(c.id);
  if (!clients.size && game) endGame();
  else broadcast(lobbyState());
}
function onMessage(c, m) {
  if (m.t === 'hello') {
    c.name = String(m.name || 'Crew').slice(0, 20);
    if (m.kit && typeof m.kit === 'object') c.kit = m.kit;                  // the player's gear and profession (from their own saved profile)
    if (m.ship && typeof m.ship === 'object') c.ship = m.ship;              // ship upgrades they bought
    if (Array.isArray(m.unlocked)) c.unlocked = m.unlocked.map(String).slice(0, 50);
    c.level = +m.level || 1; if (game) { const cr = game.sim.crew.find(x => x.id === c.id); if (cr) cr.name = c.name; } broadcast(lobbyState()); }
  else if (m.t === 'mission' && phase === 'lobby' && game === null) { missionId = String(m.id); broadcast(lobbyState()); }
  else if (m.t === 'start' && phase === 'lobby') startGame();
  else if (m.t === 'input' && game) game.sim.netServer.input(c.id, m);
  else if (m.t === 'cmd' && game) game.sim.netServer.command(c.id, m.cmd);
  else if (m.t === 'lobby' && game && game.sim.mission.over) endGame();
}

// A fresh simulation sandbox per game (the game scripts keep their state in globals).
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
function startGame() {
  const sim = makeSim();
  const sfx = sim.netCaptureSfx();
  const ship = Object.assign({}, ...[...clients].map(c => c.ship || {}));       // the crew's ship has every upgrade anyone bought
  sim.netServer.init(missionId, ship);
  for (const c of clients) sim.netServer.addCrew(c.id, c.name, c.kit);
  phase = 'game';
  game = { sim, sfx, tick: 0, last: Date.now(), acc: 0 };
  broadcast({ t: 'start', mission: missionId });
  game.timer = setInterval(stepGame, 1000 / 120);
  console.log(`[game] started "${missionId}" with ${clients.size} crew`);
}
function stepGame() {
  const now = Date.now();
  game.acc += Math.min(0.25, (now - game.last) / 1000); game.last = now;
  while (game.acc >= TICK) {
    game.acc -= TICK;
    try { game.sim.netServer.step(TICK); } catch (e) { console.error('[game] sim error', e); }
    if (++game.tick % SEND_EVERY === 0) {
      const snap = JSON.stringify(game.sim.netSerialize()), fx = JSON.stringify(game.sfx.splice(0));
      for (const c of clients) sendFrame(c, `{"t":"state","you":${c.id},"sfx":${fx},"s":${snap}}`);
    }
  }
}
function endGame() {
  if (game) clearInterval(game.timer);
  game = null; phase = 'lobby';
  broadcast(lobbyState());
  console.log('[game] back to the lobby');
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Manifold Novum server on port ${PORT}`);
  for (const ip of ips.length ? ips : ['localhost']) console.log(`  open  http://${ip}:${PORT}`);
});
