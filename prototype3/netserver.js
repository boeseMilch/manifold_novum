// Prototype 3, the big ship: the server side. WebSocket path /ws-big, handed over by the root server.js's
// upgrade handler (require('./prototype3/netserver').upgrade(req, socket)). One crew per server.
//
// Client -> server (JSON text frames):
//   { t: 'hello', name }            join (or rename); answered with { t: 'welcome', id }
//   { t: 'start' }                  start the run (anyone; needs >= MIN_CREW connected)
//   { t: 'input', in: { up, down, left, right, use, fire, back, pressed: ['use', ...] } }
//   { t: 'reset' }                  R after the end: everyone back to the lobby
// Server -> client:
//   { t: 'lobby', players: [{ id, name, color }], minCrew, running }   on every change
//   { t: 'snap', s: snapshot, ev: [events since the last snapshot] }  ~20 Hz while running
// The sim ticks at 30 Hz. Joining mid-run spawns you in; leaving removes your body; when the last one
// leaves, the run is dropped and the lobby is empty again.
'use strict';
const crypto = require('crypto');
const B = require('./sim.js');

const TICK_HZ = 30, SNAP_MS = 50;
const clients = new Map();          // id -> { id, socket, name, color, alive, buf }
let nextId = 1, sim = null, tickTimer = null, snapTimer = null, lastTick = 0;

function upgrade(req, socket) {
  if (!req.headers['sec-websocket-key']) return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);
  const c = { id: nextId++, socket, name: null, color: null, alive: true, buf: Buffer.alloc(0) };
  socket.on('data', (chunk) => { c.buf = Buffer.concat([c.buf, chunk]); readFrames(c); });
  socket.on('close', () => drop(c));
  socket.on('error', () => drop(c));
}

// --- frames (RFC 6455, text only; copied from server.js without the compression)
function readFrames(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 1 << 20) { c.socket.destroy(); return drop(c); }
    const maskOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    const data = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= b[maskOff + (i & 3)];
    c.buf = b.subarray(off + len);
    if (op === 0x8) { try { c.socket.end(); } catch (e) {} return drop(c); }
    if (op === 0x9) { sendFrame(c, data, 0xA); continue; }
    if (op === 0x1) { let m; try { m = JSON.parse(data.toString('utf8')); } catch (e) { continue; } onMessage(c, m); }
  }
}
function sendFrame(c, payload, op = 0x1) {
  if (!c.alive) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = data.length, b0 = 0x80 | op;
  let head;
  if (len < 126) head = Buffer.from([b0, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = b0; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = b0; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  try { c.socket.write(Buffer.concat([head, data])); } catch (e) { drop(c); }
}
const send = (c, m) => sendFrame(c, JSON.stringify(m));
const players = () => [...clients.values()].filter(c => c.name);
const broadcast = (m) => { const s = JSON.stringify(m); for (const c of players()) sendFrame(c, s); };

// --- the lobby and the run
function lobby() { broadcast({ t: 'lobby', players: players().map(c => ({ id: c.id, name: c.name, color: c.color })), minCrew: B.MIN_CREW, running: !!sim }); }
function freeColor() { const used = new Set(players().map(c => c.color)); return B.COLORS.find(k => !used.has(k)) || B.COLORS[nextId % B.COLORS.length]; }
function onMessage(c, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    const first = !c.name;
    c.name = String(m.name || 'Crew').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Crew';
    if (first) { clients.set(c.id, c); c.color = freeColor(); send(c, { t: 'welcome', id: c.id }); }
    if (sim) { const body = sim.addCrew(c.id, c.name, c.color); body.name = c.name; }
    lobby();
    return;
  }
  if (!c.name) return;
  if (m.t === 'start') {
    if (sim || players().length < B.MIN_CREW) return;
    sim = B.createSim({});
    for (const p of players()) sim.addCrew(p.id, p.name, p.color);
    lastTick = Date.now();
    tickTimer = setInterval(tick, 1000 / TICK_HZ);
    snapTimer = setInterval(snapshot, SNAP_MS);
    lobby();
    snapshot();
  } else if (m.t === 'input') {
    if (sim && m.in && typeof m.in === 'object') sim.setInput(c.id, { ...m.in, pressed: Array.isArray(m.in.pressed) ? m.in.pressed.slice(0, 16) : [] });
  } else if (m.t === 'reset') {
    if (sim && sim.phase === 'end') stop();
  }
}
function tick() {
  if (!sim) return;
  const now = Date.now(), dt = Math.min(0.1, (now - lastTick) / 1000); lastTick = now;
  sim.tick(dt);
}
function snapshot() {
  if (!sim) return;
  broadcast({ t: 'snap', s: sim.snapshot(), ev: sim.takeEvents() });
}
function stop() {
  clearInterval(tickTimer); clearInterval(snapTimer); tickTimer = snapTimer = null;
  sim = null;
  lobby();
}
function drop(c) {
  if (!c.alive) return;
  c.alive = false;
  try { c.socket.destroy(); } catch (e) {}
  const was = clients.delete(c.id);
  if (sim) sim.removeCrew(c.id);
  if (sim && players().length === 0) stop();
  else if (was) lobby();
}

module.exports = { upgrade, get sim() { return sim; } };
