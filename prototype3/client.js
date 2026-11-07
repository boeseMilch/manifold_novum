// Prototype 3, browser only: the lobby, input, the network link (/ws-big) and solo mode (the sim in the page with
// MIN_CREW bodies; Tab switches which one you are). Loaded last (BIG.CLIENT_MODULES).
(function () {
'use strict';
const B = globalThis.BIG;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = (id) => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

let mode = 'lobby';                 // 'lobby' | 'net' (a running server game) | 'solo'
let ws = null, myId = null, lobbyState = { players: [], minCrew: B.MIN_CREW, running: false }, joined = false;
let snap = null, solo = null, soloAcc = 0;
const view = { banners: [], solo: false };
const cam = { x: 11, y: 20, zoom: 0.8 };
const smooth = new Map();           // crew id -> displayed [x, y]

// ---------------------------------------------------------------------------
// Input: held keys + presses since the last send
// ---------------------------------------------------------------------------
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'use', Space: 'fire', Backspace: 'back', KeyQ: 'back' };
const held = B.EMPTY_INPUT();
let pressed = [];
const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
addEventListener('keydown', (e) => {
  if (typing()) { if (e.code === 'Enter') joinOrRename(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (mode === 'solo') switchBody(); return; }
  if (e.code === 'KeyR' && snap && snap.phase === 'end') { backToLobby(); return; }
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (!e.repeat) pressed.push(k);
  held[k] = true;
  sendInput();
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (!k) return; held[k] = Object.entries(KEYMAP).some(([c, v]) => v === k && down.has(c) && c !== e.code); sendInput(); });
const down = new Set();
addEventListener('keydown', (e) => down.add(e.code), true);
addEventListener('keyup', (e) => down.delete(e.code), true);
addEventListener('blur', () => { for (const k of B.KEYS) held[k] = false; down.clear(); sendInput(); });
function sendInput() {
  if (mode === 'net' && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'input', in: { ...held, pressed } }));
  if (mode === 'solo' && solo) solo.sim.setInput(solo.me, { ...held, pressed });
  pressed = [];
}
setInterval(() => { if (mode === 'net') sendInput(); }, 250);

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------
function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws-big`;
  try { ws = new WebSocket(url); } catch (e) { ws = null; setStatus('No server: only "test alone" works.'); return; }
  ws.onopen = () => { setStatus(''); if (joined) hello(); };
  ws.onclose = () => { setStatus('Disconnected from the server. Reload to rejoin.'); if (mode === 'net') { mode = 'lobby'; snap = null; showLobby(true); } ws = null; };
  ws.onerror = () => setStatus('No server here: open the page through "node server.js" for the crew game, or test alone.');
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch (e) { return; }
    if (msg.t === 'welcome') myId = msg.id;
    else if (msg.t === 'lobby') { lobbyState = msg; renderLobby(); if (!msg.running && mode === 'net') { mode = 'lobby'; snap = null; showLobby(true); } }
    else if (msg.t === 'snap' && mode !== 'solo' && joined) {
      if (mode !== 'net') { mode = 'net'; showLobby(false); view.solo = false; }
      snap = msg.s;
      for (const ev of msg.ev || []) onEvent(ev);
    }
  };
}
const hello = () => ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'hello', name: $('name').value.trim() || 'Crew' }));
function joinOrRename() { store.set('mn-big-name', $('name').value.trim()); joined = true; hello(); $('name').blur(); renderLobby(); }

// ---------------------------------------------------------------------------
// Solo: the sim in the page
// ---------------------------------------------------------------------------
function startSolo() {
  const sim = B.createSim({});
  const name = $('name').value.trim() || 'You';
  for (let i = 1; i <= B.MIN_CREW; i++) sim.addCrew(i, i === 1 ? name : `Body ${i}`);
  solo = { sim, me: 1 };
  mode = 'solo'; view.solo = true; showLobby(false); smooth.clear();
  if (ws && ws.readyState === 1) { /* stay connected for the lobby list, but don't play there */ }
}
function switchBody() {
  for (const k of B.KEYS) held[k] = false;
  solo.sim.setInput(solo.me, { ...held });
  const ids = solo.sim.crew.map(c => c.id), i = ids.indexOf(solo.me);
  solo.me = ids[(i + 1) % ids.length];
  banner(`You are ${solo.sim.getCrew(solo.me).name}`, '#9cc4ff');
}
function backToLobby() {
  if (mode === 'solo') { solo = null; mode = 'lobby'; snap = null; view.solo = false; showLobby(true); }
  else if (mode === 'net' && ws) ws.send(JSON.stringify({ t: 'reset' }));
}

// ---------------------------------------------------------------------------
// Events -> banners and effects
// ---------------------------------------------------------------------------
let flash = 0;
function banner(text, color) { view.banners.push({ text, color, left: 3 }); if (view.banners.length > 4) view.banners.shift(); }
function onEvent(ev) {
  const me = meId();
  if (ev.type === 'banner' && (ev.to == null || ev.to === me)) banner(ev.text, ev.color);
  else if (ev.type === 'hullHit') flash = Math.min(1, flash + 0.25 + ev.n / 40);
  for (const fn of B.EVENT_HOOKS) fn(ev, snap, snap && snap.crew.find(c => c.id === me));
}
const meId = () => mode === 'solo' ? solo && solo.me : myId;

// ---------------------------------------------------------------------------
// Lobby overlay
// ---------------------------------------------------------------------------
function showLobby(on) { $('lobby').hidden = !on; }
function setStatus(s) { $('status').textContent = s; }
function renderLobby() {
  const L = lobbyState, n = L.players.length;
  $('crew').innerHTML = '';
  for (const p of L.players) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span>`;
    li.appendChild(document.createTextNode(p.name + (p.id === myId ? ' (you)' : '')));
    $('crew').appendChild(li);
  }
  $('count').textContent = `${n} aboard · at least ${L.minCrew} to start`;
  $('join').textContent = joined ? 'Rename' : 'Join the crew';
  $('start').disabled = !joined || n < L.minCrew || L.running;
  $('start').textContent = L.running ? 'Running…' : n < L.minCrew ? `START (needs ${L.minCrew - n} more)` : 'START';
}
$('name').value = store.get('mn-big-name') || '';
$('join').onclick = joinOrRename;
$('start').onclick = () => ws && ws.readyState === 1 && ws.send(JSON.stringify({ t: 'start' }));
$('solo').onclick = startSolo;

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const w = cv.width = innerWidth, h = cv.height = innerHeight;
  if (mode === 'solo' && solo) {
    soloAcc += dt;
    while (soloAcc >= 1 / 30) { solo.sim.tick(1 / 30); soloAcc -= 1 / 30; }
    snap = solo.sim.snapshot();
    for (const ev of solo.sim.takeEvents()) onEvent(ev);
  }
  for (const b of view.banners) b.left -= dt;
  view.banners = view.banners.filter(b => b.left > 0);
  if (!snap) { ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, w, h); requestAnimationFrame(frame); return; }
  // smooth the crew between snapshots (net) and draw from the smoothed copy
  const k = mode === 'net' ? Math.min(1, dt * 18) : 1;
  const shown = { ...snap, crew: snap.crew.map(c => {
    let p = smooth.get(c.id);
    if (!p || Math.hypot(p[0] - c.x, p[1] - c.y) > 3) p = [c.x, c.y];
    p = [p[0] + (c.x - p[0]) * k, p[1] + (c.y - p[1]) * k]; smooth.set(c.id, p);
    return { ...c, x: p[0], y: p[1] };
  }) };
  const me = shown.crew.find(c => c.id === meId());
  if (location.hash === '#overview') Object.assign(cam, { x: 11, y: 21, zoom: Math.min(w / (30 * 48), h / (54 * 48)) });   // (debug: the whole ship)
  else if (me) {
    const tg = B.render.cameraTarget(me.x, me.y, w, h), q = Math.min(1, dt * 5);
    cam.x += (tg.x - cam.x) * q; cam.y += (tg.y - cam.y) * q; cam.zoom += (tg.zoom - cam.zoom) * Math.min(1, dt * 3);
  }
  B.render.drawFrame(ctx, shown, meId(), w, h, now / 1000, cam, view);
  if (flash > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(226,60,40,${flash * 0.35})`; ctx.fillRect(0, 0, w, h); flash = Math.max(0, flash - dt * 2); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderLobby();
connect();
if (/[?&]solo\b/.test(location.search)) startSolo();
B.client = { get snap() { return snap; }, get mode() { return mode; }, get me() { return meId(); }, get solo() { return solo; }, cam, banner };
})();
