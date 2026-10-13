// Hands-on station mini-games. Each player's open mini-game lives in their ui.mini (sent to their
// browser); actions arrive as commands ['mini', action, ...args], so solo and multiplayer work the same.
//   radar dish      turn the dish by hand, ping, echoes come back from that direction only
//   oscilloscope    the helm diagnosis: match two dials to the reference wave first
//   patch board     next to the power lever: reroute which capacitor each lever output feeds
//   tape            a quick (sloppy) repair: drag along the cracks; it breaks first at the next big hit
//   crank           cannon reload: crank the breech (or hold R) to speed it up
//   jump handle     missions with the `handle` rule: someone pulls and holds it while the drive spools
//   treat pulse     treating someone: clicking on the heartbeat speeds it up
//   held shields    keep holding the button for +2 s of shield (1 more energy)
//   PIN pad         the airlock vent panel: type the admin password (it's on a sticky note right next to it)

const PING_CD = 2, SECTOR = Math.PI / 3;
const CRANK_K = 0.3, RELOAD_HOLD_RATE = 2.5, JUMP_PULL = 6, JUMP_PULL_TWO = 1.8;
const PATCH_BOARD = { x: 20.0, y: 23.0 };
const JUMP_HANDLE = { x: 20.6, y: -2.0 };
const BEAT = 0.8;
const PIN_MAX = 8, PIN_DENIED_T = 0.7, PIN_GRANTED_T = 0.8;

// Which way an event comes from, for the radar dish: 'front' | 'left' | 'right' | 'all' | null (not on radar).
function eventDir(ev) {
  if (!ev.radar) return null;
  if (ev.kind === 'swarm' || ev.kind === 'leviathan') return 'front';
  if (ev.kind === 'flare' || ev.kind === 'storm') return 'all';
  if (ev.side === 'port') return 'left';
  if (ev.side === 'star') return 'right';
  if (ev.kind === 'debris') return ev.gun === 'port' ? 'left' : ev.gun === 'star' ? 'right' : 'front';
  return 'front';
}
const DIR_ANGLE = { front: -Math.PI / 2, left: Math.PI, right: 0 };
const angleDir = (a) => Object.keys(DIR_ANGLE).find(k => Math.abs(wrapAngle(a - DIR_ANGLE[k])) <= SECTOR) || null;

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------
function openRadar() { ui.panel = 'mini'; ui.mini = { kind: 'radar', angle: -Math.PI / 2, cd: 0, blips: [], static: 0 }; }
function openScope() {
  const r = () => 1 + Math.floor(Math.random() * 7);
  const ref = [r(), r()]; let dial = [r(), r()]; while (dial[0] === ref[0] && dial[1] === ref[1]) dial = [r(), r()];
  ui.panel = 'diagnosis'; ui.mini = { kind: 'scope', ref, dial, ok: false };
}
function openPatch() { ui.panel = 'mini'; ui.mini = { kind: 'patch', pick: null }; }
// The airlock vent's PIN pad: a fresh random 4–6 digit admin password each time it opens.
function openPinPad(roomId) {
  const n = 4 + Math.floor(Math.random() * 3);
  ui.panel = 'mini'; ui.mini = { kind: 'pin', room: roomId, pin: Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join(''), typed: '', flash: null, flashT: 0 };
}
function openTape(sys) { ui.panel = 'mini'; ui.mini = { kind: 'tape', sys: SYSTEMS.indexOf(sys), done: [false, false, false] }; }

// ---------------------------------------------------------------------------
// Commands (run in the acting crew member's context)
// ---------------------------------------------------------------------------
function miniCommand(action, a, b) {
  const m = ui.mini;
  if (action === 'dish' && m?.kind === 'radar') m.angle = +a || 0;
  else if (action === 'ping' && m?.kind === 'radar') radarPing(m);
  else if (action === 'dial' && m?.kind === 'scope' && !m.ok) {
    m.dial[a] = clamp(m.dial[a] + Math.sign(b), 1, 7); sfx.clank();
    if (m.dial[0] === m.ref[0] && m.dial[1] === m.ref[1]) { m.ok = true; mission.diagRun = true; sfx.poi(); }
  } else if (action === 'patch' && m?.kind === 'patch') {
    if (a === 'out') m.pick = clamp(b | 0, 0, 2);
    else if (a === 'cap' && m.pick !== null) { power.patch[m.pick] = clamp(b | 0, 0, 2); m.pick = null; sfx.clank(); }
    else if (a === 'reset') { power.patch = [0, 1, 2]; sfx.clank(); }
  } else if (action === 'taped' && m?.kind === 'tape') {
    m.done[clamp(a | 0, 0, 2)] = true; sfx.clank();
    if (m.done.every(Boolean)) {
      const s = SYSTEMS[m.sys];
      if (s?.broken) { s.broken = false; s.taped = true; hz.stats.repairs++; combatBanner(`${s.name} taped up — it'll give first at the next big hit`); sfx.win(); }
      ui.panel = null; ui.mini = null;
    }
  } else if (action === 'pin' && m?.kind === 'pin' && !m.flash) {
    if (a === 'key' && m.typed.length < PIN_MAX && /^[0-9]$/.test(String(b))) { m.typed += String(b); sfx.clank(); }
    else if (a === 'back') m.typed = m.typed.slice(0, -1);
    else if (a === 'clr') m.typed = '';
    else if (a === 'ok') {
      const right = m.typed === m.pin;
      m.flash = right ? 'granted' : 'denied'; m.flashT = right ? PIN_GRANTED_T : PIN_DENIED_T;
      if (right) sfx.poi(); else sfx.hit(false);
    }
  } else if (action === 'crank' && player.mode === 'gun') {
    const g = player.gun;
    if (g.reload > 0) g.reload = Math.max(0.01, g.reload - Math.min(Math.abs(+a || 0), 3) * CRANK_K * (player.health === 'hurt' ? 0.6 : 1) * (perk(player, 'weapons') ? 1.5 : 1));
  }
}

// Radar dish: echoes from the sector it points at.
function radarPing(m) {
  if (m.cd > 0) return;
  m.cd = PING_CD; mission.scanT = mission.t; mission.lastScan = mission.t; sfx.poi();
  if (enc.storm) { m.static = 1.5; combatBanner('Radar: nothing but static — ion storm'); return; }
  if (!evs.antenna) {                                    // crooked antenna: junk echoes
    m.static = 1; m.blips = Array.from({ length: 4 }, () => ({ a: Math.random() * TAU, d: Math.random(), t: -Math.random(), junk: true }));
    combatBanner('Radar: garbled echoes — the antenna outside is knocked crooked'); return;
  }
  const dir = angleDir(m.angle);
  m.blips = m.blips.filter(b => b.t < 4);
  let n = 0;
  for (const ev of mission.events) {
    const d = eventDir(ev);
    if (!d || ev.done || ev.t - mission.t > RADAR_RANGE || (d !== 'all' && d !== dir)) continue;
    const k = (ev.t - mission.t) / RADAR_RANGE;
    m.blips.push({ a: (d === 'all' ? m.angle : DIR_ANGLE[d]) + (Math.random() - 0.5) * 0.6, d: k, t: -(0.2 + k * 1.2), kind: ev.kind });
    if (!mission.revealed.has(ev.id)) { mission.revealed.add(ev.id); n++; }
  }
  for (const e of combat.enemies) if (e.D.stealth && (e.side === 'port' ? 'left' : 'right') === dir) {
    e.reveal = 3; m.blips.push({ a: DIR_ANGLE[dir], d: 0.1, t: -0.1, kind: 'stealth' });
  }
  combatBanner(dir ? `Radar (${dir}): ${n ? `${n} new contact${n > 1 ? 's' : ''}` : 'nothing new'} in the next ${RADAR_RANGE} s` : 'Radar: point the dish front, left or right');
}

// ---------------------------------------------------------------------------
// Per tick
// ---------------------------------------------------------------------------
function updateMinigames(dt) {
  for (const c of crew) {
    const m = c.ui.mini;
    if (m?.kind === 'radar') { m.cd = Math.max(0, m.cd - dt); m.static = Math.max(0, m.static - dt); for (const b of m.blips) b.t += dt; }
    if (m?.kind === 'pin' && m.flash && c.ui.panel && (m.flashT -= dt) <= 0) {
      if (m.flash === 'denied') { m.flash = null; m.typed = ''; }
      else {                                             // ACCESS GRANTED: the operator closes their visor, both doors open
        c.ui.panel = null; c.ui.mini = null;
        if (hz.vent) continue;                           // (someone else got there first)
        if (plasmaIn(m.room)) startVent(m.room, c); else combatBanner('The plasma fire is already out — vent cancelled');
        continue;
      }
    }
    if (m && !c.ui.panel) c.ui.mini = null;              // panel closed: forget it
  }
  // the jump handle: everyone holding it pulls together; letting go resets the needle
  const J = mission.jump;
  if (J && mission.rules?.handle) {
    const n = crew.filter(c => c.hold?.id === 'jumpHandle').length;
    J.pull = n ? (J.pull || 0) + dt * (n > 1 ? JUMP_PULL_TWO : 1) : 0;
  }
}

// ---------------------------------------------------------------------------
// Clicking in the world: the patch board, the jump handle
// ---------------------------------------------------------------------------
function minigameClickTarget(mx, my) {
  const at = (p, r) => Math.hypot(mx - p.x, my - p.y) <= r;
  if (at(PATCH_BOARD, 0.5)) {
    const t = { x: PATCH_BOARD.x, y: PATCH_BOARD.y, r: 0.5 };
    if (!patchNeeded()) return { ...t, text: 'Patch board (only needed when a feed line arcs or a capacitor is broken)', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Patch board — get closer', ok: false };
    return { ...t, ok: true, text: 'Click: open the patch board (reroute the lever outputs)', run: openPatch };
  }
  if (mission.rules?.handle && at(JUMP_HANDLE, 0.45)) {
    const t = { x: JUMP_HANDLE.x, y: JUMP_HANDLE.y, r: 0.45 };
    if (!mission.jump) return { ...t, text: 'Jump handle (pull it when the jump drive spools up)', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Jump handle — get closer', ok: false };
    return { ...t, ok: true, text: `Hold click: pull the jump handle and keep holding (${JUMP_PULL} s; faster with two)`, hold: { id: 'jumpHandle', time: 1e9, done() {} } };
  }
  return null;
}
// The patch board only matters when a feed line arcs or a capacitor is broken (or it's already rerouted).
const patchNeeded = () => [0, 1, 2].some(i => surging('feed' + i) || capBroken(i)) || power.patch.some((c, i) => c !== i);
function minigameSpots() {
  return [...(patchNeeded() ? [{ x: PATCH_BOARD.x, y: PATCH_BOARD.y, r: 0.45 }] : []), ...(mission.rules?.handle ? [{ x: JUMP_HANDLE.x, y: JUMP_HANDLE.y, r: 0.4 }] : [])];
}

// ---------------------------------------------------------------------------
// Browser side: drags that turn into commands (dish, crank, tape), rate-limited
// ---------------------------------------------------------------------------
const miniDrag = { last: 0, prevA: null, tapeCov: null, tapeSys: -1 };
function miniClient(dt) {
  const m = me.ui.mini, mo = localInput.mouse;
  miniDrag.last += dt;
  if (m?.kind === 'radar' && me.ui.panel === 'mini') {
    const L0 = radarLayout(), d = Math.hypot(mo.x - L0.cx, mo.y - L0.cy);
    if (mo.down && d < L0.r && d > 12) {
      const a = Math.atan2(mo.y - L0.cy, mo.x - L0.cx);
      m.angle = a;                                         // show it right away
      if (miniDrag.last > 0.08) { miniDrag.last = 0; sendCommand(['mini', 'dish', a]); }
    }
  }
  if (m?.kind === 'tape' && me.ui.panel === 'mini') {
    if (miniDrag.tapeSys !== m.sys) { miniDrag.tapeSys = m.sys; miniDrag.tapeCov = TAPE_CRACKS.map(c => new Array(c.length).fill(false)); }
    if (mo.down) {
      const T0 = tapeLayout();
      TAPE_CRACKS.forEach((crack, i) => {
        if (m.done[i]) return;
        crack.forEach(([px, py], k) => { if (Math.hypot(mo.x - (T0.x + px * T0.s), mo.y - (T0.y + py * T0.s)) < 14) miniDrag.tapeCov[i][k] = true; });
        if (miniDrag.tapeCov[i].filter(Boolean).length >= crack.length * 0.8) { m.done[i] = true; sendCommand(['mini', 'taped', i]); }
      });
    }
  }
  // the PIN pad: number keys (top row and numpad) type; they don't reach the rest of the game meanwhile
  if (m?.kind === 'pin' && me.ui.panel === 'mini') {
    for (const code of [...localInput.pressed]) {
      const d = /^(?:Digit|Numpad)([0-9])$/.exec(code);
      const cmd = d ? ['mini', 'pin', 'key', +d[1]] : code === 'Backspace' ? ['mini', 'pin', 'back'] : code === 'Delete' ? ['mini', 'pin', 'clr']
                : code === 'Enter' || code === 'NumpadEnter' ? ['mini', 'pin', 'ok'] : null;
      if (cmd) { localInput.pressed.delete(code); sendCommand(cmd); }
    }
  }
  // the cannon's crank: circle the mouse around it while holding the button
  if (me.mode === 'gun' && me.gun?.reload > 0) {
    const c = crankLayout(), d = Math.hypot(mo.x - c.x, mo.y - c.y);
    if (mo.down && d < c.r * 1.6) {
      mo.suppress = true; mo.moved = 0;                  // cranking isn't aiming or firing
      const a = Math.atan2(mo.y - c.y, mo.x - c.x);
      if (miniDrag.prevA !== null) {
        miniDrag.acc = (miniDrag.acc || 0) + Math.abs(wrapAngle(a - miniDrag.prevA));
        if (miniDrag.last > 0.08 && miniDrag.acc > 0) { miniDrag.last = 0; sendCommand(['mini', 'crank', miniDrag.acc]); miniDrag.acc = 0; }
      }
      miniDrag.prevA = a; miniDrag.crankA = a;
    } else miniDrag.prevA = null;
  }
}

// ---------------------------------------------------------------------------
// Drawing (screen space)
// ---------------------------------------------------------------------------
const radarLayout = () => ({ cx: VW / 2, cy: VH / 2 + 10, r: Math.min(170, VH / 2 - 90) });
function drawMiniPanel(t) {
  const m = ui.mini;
  if (!m) return;
  if (m.kind === 'radar') drawRadarPanel(m, t);
  else if (m.kind === 'patch') drawPatchPanel(m, t);
  else if (m.kind === 'tape') drawTapePanel(m, t);
  else if (m.kind === 'pin') drawPinPanel(m, t);
}
function miniButton(x, y, w, h, label, cmd, active = true) {
  const hover = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
  rr(x, y, w, h, 8); ctx.fillStyle = !active ? '#2b303a' : hover ? '#2f8a5f' : '#1d4a36'; ctx.fill(); stroke(2, active ? '#5fd6a0' : '#4b5263');
  ctx.fillStyle = active ? '#fff' : '#6b7486'; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2); ctx.textAlign = 'left';
  if (active) ui.hits.push({ x: x + w / 2, y: y + h / 2, w, h, cmd });
}
function drawRadarPanel(m, t) {
  const L0 = radarLayout(), w = L0.r * 2 + 120, h = L0.r * 2 + 150;
  const [x, y] = panelFrame(w, h, 'RADAR — drag to turn the dish, then PING');
  const { cx, cy, r } = L0;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = '#06140e'; ctx.fill(); stroke(3, '#2f8a5f');
  ctx.strokeStyle = 'rgba(95,214,160,0.25)'; ctx.lineWidth = 1;
  for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke(); }
  for (const [d, a] of Object.entries(DIR_ANGLE)) {      // sector labels
    ctx.fillStyle = 'rgba(95,214,160,0.6)'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.toUpperCase(), cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22));
  }
  ctx.textAlign = 'left';
  // our ship in the middle, the dish wedge
  ctx.fillStyle = '#5fd6a0'; poly([[cx, cy - 8], [cx + 6, cy + 6], [cx - 6, cy + 6]]); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, m.angle - SECTOR, m.angle + SECTOR); ctx.closePath();
  ctx.fillStyle = `rgba(95,214,160,${0.1 + (m.cd > PING_CD - 0.5 ? 0.25 : 0)})`; ctx.fill();
  if (m.cd > 0) {                                        // the ping sweeping out
    const k = 1 - m.cd / PING_CD;
    ctx.beginPath(); ctx.arc(cx, cy, r * Math.min(1, k * 2), m.angle - SECTOR, m.angle + SECTOR); ctx.strokeStyle = 'rgba(160,255,200,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const b of m.blips) {                             // echoes (closer = arriving sooner)
    if (b.t < 0) continue;
    const a = Math.max(0, 1 - b.t / 6), px = cx + Math.cos(b.a) * r * (0.12 + 0.85 * b.d), py = cy + Math.sin(b.a) * r * (0.12 + 0.85 * b.d);
    ctx.beginPath(); ctx.arc(px, py, b.junk ? 3 : 6, 0, TAU); ctx.fillStyle = `rgba(${b.junk ? '160,200,160' : '255,220,120'},${a})`; ctx.fill();
    if (!b.junk && b.kind) { ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.font = '10px system-ui, sans-serif'; ctx.fillText(b.kind, px + 8, py + 3); }
  }
  if (m.static > 0) for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(200,230,210,${Math.random() * 0.4 * m.static})`; ctx.fillRect(cx - r + Math.random() * 2 * r, cy - r + Math.random() * 2 * r, 2, 2); }
  miniButton(x + w / 2 - 80, y + h - 56, 160, 40, m.cd > 0 ? `PING (${m.cd.toFixed(1)} s)` : 'PING', ['mini', 'ping'], m.cd <= 0);
}
function drawPatchPanel(m, t) {
  const w = 460, h = 320, [x, y] = panelFrame(w, h, 'PATCH BOARD — which capacitor each lever output feeds');
  const outX = x + 90, capX = x + w - 90, row = (i) => y + 90 + i * 64;
  for (let i = 0; i < 3; i++) {                          // cables
    const j = power.patch[i];
    ctx.beginPath(); ctx.moveTo(outX + 20, row(i)); ctx.bezierCurveTo(outX + 120, row(i), capX - 120, row(j), capX - 20, row(j));
    ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = ['#e2574c', '#e8c34f', '#3a8fc4'][i]; ctx.lineWidth = 5; ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const sel = m.pick === i, hot = surging('feed' + i);
    ctx.beginPath(); ctx.arc(outX, row(i), 18, 0, TAU); ctx.fillStyle = sel ? '#2f8a5f' : '#262b35'; ctx.fill(); stroke(2, '#5fd6a0');
    ctx.fillStyle = '#e8ecf4'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LEVER_NAMES[i], outX, row(i)); ctx.fillText('lever', outX - 48, row(i));
    ui.hits.push({ x: outX, y: row(i), r: 20, cmd: ['mini', 'patch', 'out', i] });
    ctx.beginPath(); ctx.arc(capX, row(i), 18, 0, TAU); ctx.fillStyle = '#262b35'; ctx.fill(); stroke(2, hot ? '#bfe8ff' : '#9cd8ff');
    ctx.fillStyle = '#e8ecf4'; ctx.fillText(['L', 'M', 'R'][i], capX, row(i)); ctx.fillText(`${['left', 'mid', 'right'][i]} cap${hot ? ' ⚡' : ''}`, capX + 58, row(i));
    ui.hits.push({ x: capX, y: row(i), r: 20, cmd: ['mini', 'patch', 'cap', i] });
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(m.pick === null ? 'Click a lever output, then the capacitor it should feed.' : 'Now click the capacitor it should feed.', x + 18, y + h - 22);
  miniButton(x + w - 120, y + h - 50, 100, 32, 'RESET', ['mini', 'patch', 'reset']);
}
// The airlock vent's PIN pad, and the sticky note with the admin password next to it.
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK'];
const PIN_HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Comic Neue', 'Marker Felt', 'Chalkboard SE', cursive";
function drawPinPanel(m, t) {
  const w = 560, h = 466, [x, y] = panelFrame(w, h, `AIRLOCK VENT — ${roomById(m.room)?.name || ''}`);
  // the keypad housing: a brushed metal plate with screws
  const px = x + 30, py = y + 52, pw = 284, ph = 392;
  rr(px, py, pw, ph, 12);
  const g = ctx.createLinearGradient(px, py, px + pw, py + ph); g.addColorStop(0, '#6b7486'); g.addColorStop(1, '#3f4757');
  ctx.fillStyle = g; ctx.fill(); stroke(3, '#14161b');
  for (const [sx, sy] of [[10, 10], [pw - 10, 10], [10, ph - 10], [pw - 10, ph - 10]]) { ctx.beginPath(); ctx.arc(px + sx, py + sy, 3.5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); }
  // the terminal display
  const dx = px + 18, dy = py + 22, dw = pw - 36, dh = 84;
  const flash = m.flash, red = flash === 'denied', green = flash === 'granted';
  rr(dx, dy, dw, dh, 6); ctx.fillStyle = red ? '#2a0806' : '#06140e'; ctx.fill(); stroke(3, '#14161b');
  ctx.save(); rr(dx, dy, dw, dh, 6); ctx.clip();
  ctx.fillStyle = 'rgba(95,214,160,0.05)'; for (let sy = dy; sy < dy + dh; sy += 3) ctx.fillRect(dx, sy, dw, 1);   // scanlines
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const col = red ? '#ff6a5a' : '#5fd6a0';
  ctx.shadowColor = col; ctx.shadowBlur = 6; ctx.fillStyle = col;
  ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('MANUAL OVERRIDE — OPEN AIRLOCK', dx + 10, dy + 16);
  if (flash) {
    ctx.font = '800 22px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center';
    if (green || Math.floor(t * 8) % 2 === 0) ctx.fillText(red ? 'ACCESS DENIED' : 'ACCESS GRANTED', dx + dw / 2, dy + 54);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText('ADMIN PASSWORD:', dx + 10, dy + 40);
    ctx.font = '800 22px ui-monospace, Menlo, Consolas, monospace';
    const stars = '*'.repeat(m.typed.length);
    ctx.fillText(stars, dx + 10, dy + 64);
    if (Math.floor(t * 2) % 2 === 0) ctx.fillRect(dx + 12 + ctx.measureText(stars).width, dy + 54, 11, 18);   // blinking cursor
  }
  ctx.restore();
  // the keys: 3 × 4 rubbery keycaps
  const kw = 66, kh = 50, gap = 14, kx0 = px + (pw - 3 * kw - 2 * gap) / 2, ky0 = dy + dh + 20;
  PIN_KEYS.forEach((k, i) => {
    const kx = kx0 + (i % 3) * (kw + gap), ky = ky0 + Math.floor(i / 3) * (kh + gap);
    const hover = !flash && mouse.x > kx && mouse.x < kx + kw && mouse.y > ky && mouse.y < ky + kh, down = hover && mouse.down;
    const face = k === 'OK' ? ['#1d4a36', '#2f8a5f'] : k === 'CLR' ? ['#5a2a22', '#8e2f22'] : ['#262b35', '#3a404d'];
    rr(kx, ky + 4, kw, kh, 8); ctx.fillStyle = '#14161b'; ctx.fill();                                  // key shadow
    rr(kx, ky + (down ? 3 : 0), kw, kh, 8); ctx.fillStyle = hover ? face[1] : face[0]; ctx.fill();
    stroke(2, k === 'OK' ? '#5fd6a0' : k === 'CLR' ? '#ff8a7a' : '#14161b');
    ctx.fillStyle = flash ? '#6b7486' : '#e8ecf4'; ctx.font = `800 ${k.length > 1 ? 15 : 20}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(k, kx + kw / 2, ky + kh / 2 + (down ? 3 : 0));
    if (!flash) ui.hits.push({ x: kx + kw / 2, y: ky + kh / 2, w: kw, h: kh, cmd: k === 'OK' ? ['mini', 'pin', 'ok'] : k === 'CLR' ? ['mini', 'pin', 'clr'] : ['mini', 'pin', 'key', +k] });
  });
  ctx.textAlign = 'left';
  // the sticky note, stuck on crooked next to the pad
  const nx = x + 436, ny = y + 176, ns = 168;
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(-0.09);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.moveTo(-ns / 2, -ns / 2); ctx.lineTo(ns / 2, -ns / 2); ctx.lineTo(ns / 2, ns / 2 - 14);
  ctx.quadraticCurveTo(ns / 2 - 6, ns / 2 - 2, ns / 2 - 20, ns / 2 + 2); ctx.lineTo(-ns / 2, ns / 2); ctx.closePath();   // the bottom corner curls up a bit
  const ng = ctx.createLinearGradient(0, -ns / 2, 0, ns / 2); ng.addColorStop(0, '#fff07a'); ng.addColorStop(0.2, '#ffe95c'); ng.addColorStop(1, '#f5d94a');
  ctx.fillStyle = ng; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(-ns / 2, -ns / 2, ns, 22);                           // the sticky strip
  ctx.fillStyle = '#26324f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  handText('admin password', 0, -32, `20px ${PIN_HAND}`, 1);
  ctx.save(); ctx.rotate(0.03); const pw2 = handText(m.pin, 0, 14, `700 34px ${PIN_HAND}`, 3);
  ctx.strokeStyle = '#26324f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-pw2 / 2 - 4, 36); ctx.quadraticCurveTo(0, 41, pw2 / 2 + 6, 34); ctx.stroke();   // underlined
  ctx.restore();
  ctx.font = `14px ${PIN_HAND}`; ctx.fillStyle = 'rgba(38,50,79,0.75)'; ctx.fillText('(don\'t tell anyone!)', 0, 58);
  ctx.restore(); ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Type it in: click the keys,', x + 436, y + h - 62);
  ctx.fillText('or 0–9 · Backspace · Enter', x + 436, y + h - 44); ctx.textAlign = 'left';
}
// Text that looks written by hand even without a handwriting font: every letter a little tilted and
// off the line (the same wobble every frame). Centred on (cx, cy); returns its width.
function handText(str, cx, cy, font, wob) {
  ctx.font = font; ctx.textAlign = 'left';
  const ws = [...str].map(ch => ctx.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0);
  let x0 = cx - total / 2;
  [...str].forEach((ch, i) => {
    const r = Math.sin(i * 12.9898 + str.length * 78.233) * 43758.5453 % 1;   // a fixed pseudo-random -1..1 per letter
    ctx.save(); ctx.translate(x0 + ws[i] / 2, cy + r * wob); ctx.rotate(r * 0.05 * wob);
    ctx.textAlign = 'center'; ctx.fillText(ch, 0, 0); ctx.restore();
    x0 += ws[i];
  });
  ctx.textAlign = 'center';
  return total;
}
// Three cracks on the broken part (panel coords 0..1), traced with the mouse.
const TAPE_CRACKS = [
  [[0.15, 0.2], [0.25, 0.3], [0.32, 0.42], [0.3, 0.55], [0.38, 0.68]],
  [[0.55, 0.15], [0.6, 0.28], [0.72, 0.34], [0.8, 0.48]],
  [[0.45, 0.62], [0.55, 0.7], [0.62, 0.82], [0.75, 0.86]],
];
const tapeLayout = () => ({ x: VW / 2 - 150, y: VH / 2 - 130, s: 300 });
function drawTapePanel(m, t) {
  const [x, y] = panelFrame(380, 400, `QUICK TAPE JOB — ${SYSTEMS[m.sys]?.name || ''}`);
  const T0 = tapeLayout();
  rr(T0.x, T0.y, T0.s, T0.s, 12); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(3);
  TAPE_CRACKS.forEach((c, i) => {
    ctx.beginPath(); c.forEach(([px, py], k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, T0.x + px * T0.s, T0.y + py * T0.s));
    if (m.done[i]) { ctx.strokeStyle = '#c9c2b0'; ctx.lineWidth = 22; ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.strokeStyle = '#14161b'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 16; ctx.stroke(); ctx.setLineDash([]); }
  });
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Hold the mouse and drag along every crack. Quick, but it gives first at the next big hit.', VW / 2, y + 384); ctx.textAlign = 'left';
}
// The oscilloscope on top of the helm diagnosis. Returns the height it used.
function drawScope(m, x, y, w) {
  const h = 150, sx = x + 20, sw = w - 200, sy = y + 10;
  rr(sx, sy, sw, h - 20, 8); ctx.fillStyle = '#06140e'; ctx.fill(); stroke(2, '#2f8a5f');
  const wave = (f, a, col, wob) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const u = i / 120, yy = sy + (h - 20) / 2 + Math.sin(u * TAU * f * 0.5 + time * 3) * a * 7 + (wob ? Math.sin(u * 40 + time * 9) * 3 : 0); (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx + u * sw, yy); }
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  };
  wave(m.ref[0], m.ref[1], 'rgba(255,224,138,0.8)');
  wave(m.dial[0], m.dial[1], m.ok ? '#5fd6a0' : 'rgba(95,214,160,0.9)');
  const bx = sx + sw + 20;
  ['FREQ', 'AMP'].forEach((name, k) => {
    const by = sy + k * 60;
    ctx.fillStyle = '#c9ced8'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(`${name} ${m.dial[k]}`, bx, by + 14);
    miniButton(bx + 70, by, 34, 28, '−', ['mini', 'dial', k, -1], !m.ok); miniButton(bx + 110, by, 34, 28, '+', ['mini', 'dial', k, 1], !m.ok);
  });
  ctx.fillStyle = m.ok ? '#5fd6a0' : '#ffe08a'; ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(m.ok ? 'Calibrated — readings below.' : 'Match the green wave to the yellow one to calibrate.', sx, sy + h - 2);
  return h + 10;
}
// The cannon's crank (next to the reload button).
const crankLayout = () => ({ x: VW - 220, y: VH - 42, r: 26 });
function drawCrank(g) {
  if (!(g.reload > 0)) return;
  const c = crankLayout(), a = miniDrag.crankA ?? time * 2;
  ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fill(); stroke(2, '#e8c34f');
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(0, -3, c.r - 4, 6); ctx.beginPath(); ctx.arc(c.r - 6, 0, 6, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.5);
  ctx.restore();
  ctx.fillStyle = '#ffe08a'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('CRANK! (or hold R)', c.x, c.y - c.r - 4); ctx.textAlign = 'left';
}
// World: the patch board box and the jump handle.
function drawMinigameProps(t) {
  const x = L(PATCH_BOARD.x), y = L(PATCH_BOARD.y);
  if (spr(patchNeeded() ? 'systems/patch_live' : 'systems/patch_idle', 0, PATCH_BOARD.x, PATCH_BOARD.y, 0, { emissive: 0.8 })) {   // sprites (js/decor.js spr)
    ctx.fillStyle = 'rgba(232,236,244,0.7)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('PATCH', x, y + 14);
    if (mission.rules?.handle) {
      const pull = mission.jump?.pull || 0;
      spr(mission.jump ? `systems/jump_p${clamp(Math.floor(Math.min(1, pull / JUMP_PULL) * 5), 0, 4)}` : 'systems/jump_off', 0, JUMP_HANDLE.x, JUMP_HANDLE.y, 0, { emissive: 0.8, pick: [0.3, 1.2] });
    }
    ctx.textAlign = 'left';
    return;
  }
  rr(x - 16, y - 12, 32, 24, 3); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(2);
  const live = patchNeeded();
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 9 + i * 9, y - 4, 2.5, 0, TAU); ctx.fillStyle = live ? ['#e2574c', '#e8c34f', '#3a8fc4'][i] : '#4a515e'; ctx.fill(); }
  ctx.fillStyle = 'rgba(232,236,244,0.7)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('PATCH', x, y + 3);
  if (mission.rules?.handle) {
    const hx = L(JUMP_HANDLE.x), hy = L(JUMP_HANDLE.y), pull = mission.jump?.pull || 0;
    rr(hx - 8, hy - 14, 16, 28, 4); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
    ctx.fillStyle = mission.jump ? '#7af0ff' : '#6b7486'; ctx.fillRect(hx - 3, hy + 10 - 22 * Math.min(1, pull / JUMP_PULL), 6, 4);
    ctx.fillStyle = 'rgba(122,240,255,0.8)'; ctx.fillText('JUMP', hx, hy + 16);
  }
  ctx.textAlign = 'left';
}
