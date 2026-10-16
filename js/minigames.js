// Hands-on station mini-games. Each player's open mini-game lives in their ui.mini (sent to their
// browser); actions arrive as commands ['mini', action, ...args], so solo and multiplayer work the same.
//   patch board     next to the power lever: reroute which capacitor each lever output feeds
//   jump handle     missions with the `handle` rule: someone pulls and holds it while the drive spools
//   treat pulse     treating someone: clicking on the heartbeat speeds it up
//   held shields    keep holding the button for +2 s of shield (1 more energy)
//   PIN pad         the airlock vent panel: type the admin password (it's on a sticky note right next to it)
//   junction J1     the derelict lab's dead power junction: patch our tether line into its freezer circuit (js/culture.js)

const JUMP_PULL = 6, JUMP_PULL_TWO = 1.8;
const PATCH_BOARD = { x: 20.0, y: 23.0 };
const JUMP_HANDLE = { x: 20.6, y: -2.0 };
const BEAT = 0.8;
const PIN_MAX = 8, PIN_DENIED_T = 0.7, PIN_GRANTED_T = 0.8;

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------
// The helm diagnosis: just the readings (the oscilloscope calibration is gone).
function openDiagnosis() { ui.panel = 'diagnosis'; ui.mini = null; mission.diagRun = true; for (const w of maintWarnings()) w.ev.seen = true; }   // (seen: the sidebar lists that pair)
function openPatch() { ui.panel = 'mini'; ui.mini = { kind: 'patch', pick: null }; }
// The airlock vent's PIN pad: a fresh random 4–6 digit admin password each time it opens.
function openPinPad(roomId) {
  const n = 4 + Math.floor(Math.random() * 3);
  ui.panel = 'mini'; ui.mini = { kind: 'pin', room: roomId, pin: Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join(''), typed: '', flash: null, flashT: 0 };
}

// ---------------------------------------------------------------------------
// Commands (run in the acting crew member's context)
// ---------------------------------------------------------------------------
function miniCommand(action, a, b) {
  const m = ui.mini;
  if (action === 'patch' && m?.kind === 'patch') {
    if (a === 'out') m.pick = clamp(b | 0, 0, 2);
    else if (a === 'cap' && m.pick !== null) { power.patch[m.pick] = clamp(b | 0, 0, 2); m.pick = null; sfx.clank(); }
    else if (a === 'reset') { power.patch = [0, 1, 2]; sfx.clank(); }
  } else if (action === 'j1' && m?.kind === 'j1') s7J1Command(m, a, b);   // the derelict's junction J1 (js/culture.js)
  else if (action === 'pin' && m?.kind === 'pin' && !m.flash) {
    if (a === 'key' && m.typed.length < PIN_MAX && /^[0-9]$/.test(String(b))) { m.typed += String(b); sfx.clank(); }
    else if (a === 'back') m.typed = m.typed.slice(0, -1);
    else if (a === 'clr') m.typed = '';
    else if (a === 'ok') {
      const right = m.typed === m.pin;
      m.flash = right ? 'granted' : 'denied'; m.flashT = right ? PIN_GRANTED_T : PIN_DENIED_T;
      if (right) sfx.poi(); else sfx.hit(false);
    }
  }
}

// ---------------------------------------------------------------------------
// Per tick
// ---------------------------------------------------------------------------
function updateMinigames(dt) {
  for (const c of crew) {
    const m = c.ui.mini;
    if (m?.kind === 'pin' && m.flash && c.ui.panel && (m.flashT -= dt) <= 0) {
      if (m.flash === 'denied') { m.flash = null; m.typed = ''; }
      else {                                             // ACCESS GRANTED: the operator closes their visor, both doors open
        c.ui.panel = null; c.ui.mini = null;
        if (m.door) { baseCodeOk(); continue; }       // (the pirate base's brig door: js/dock.js)
        if (hz.vent) continue;                           // (someone else got there first)
        if (fireIn(m.room)) startVent(m.room, c); else combatBanner('The fire is already out — vent cancelled');
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
// Browser side: key input for the open mini-game
// ---------------------------------------------------------------------------
const miniDrag = { last: 0 };
function miniClient(dt) {
  const m = me.ui.mini, mo = localInput.mouse;
  miniDrag.last += dt;
  // the PIN pad: number keys (top row and numpad) type; they don't reach the rest of the game meanwhile
  if (m?.kind === 'pin' && me.ui.panel === 'mini') {
    for (const code of [...localInput.pressed]) {
      const d = /^(?:Digit|Numpad)([0-9])$/.exec(code);
      const cmd = d ? ['mini', 'pin', 'key', +d[1]] : code === 'Backspace' ? ['mini', 'pin', 'back'] : code === 'Delete' ? ['mini', 'pin', 'clr']
                : code === 'Enter' || code === 'NumpadEnter' ? ['mini', 'pin', 'ok'] : null;
      if (cmd) { localInput.pressed.delete(code); sendCommand(cmd); }
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing (screen space)
// ---------------------------------------------------------------------------
function drawMiniPanel(t) {
  const m = ui.mini;
  if (!m) return;
  if (m.kind === 'patch') drawPatchPanel(m, t);
  else if (m.kind === 'pin') drawPinPanel(m, t);
  else if (m.kind === 'j1') drawJ1Panel(m, t);
}
function miniButton(x, y, w, h, label, cmd, active = true) {
  const hover = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
  rr(x, y, w, h, 8); ctx.fillStyle = !active ? '#2b303a' : hover ? '#2f8a5f' : '#1d4a36'; ctx.fill(); stroke(2, active ? '#5fd6a0' : '#4b5263');
  ctx.fillStyle = active ? '#fff' : '#6b7486'; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2); ctx.textAlign = 'left';
  if (active) ui.hits.push({ x: x + w / 2, y: y + h / 2, w, h, cmd });
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
    ctx.beginPath(); ctx.arc(capX, row(i), 18, 0, TAU); ctx.fillStyle = '#262b35'; ctx.fill(); stroke(2, hot ? '#fff0b0' : POWER_COL);
    ctx.fillStyle = '#e8ecf4'; ctx.fillText(['L', 'M', 'R'][i], capX, row(i)); ctx.fillText(`${['left', 'mid', 'right'][i]} cap${hot ? ' ⚡' : ''}`, capX + 58, row(i));
    ui.hits.push({ x: capX, y: row(i), r: 20, cmd: ['mini', 'patch', 'cap', i] });
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(m.pick === null ? 'Click a lever output, then the capacitor it should feed.' : 'Now click the capacitor it should feed.', x + 18, y + h - 22);
  miniButton(x + w - 120, y + h - 50, 100, 32, 'RESET', ['mini', 'patch', 'reset']);
}
// The airlock vent's PIN pad, and the sticky note with the admin password next to it.
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK'];
const PIN_HAND = "'Patrick Hand', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Comic Neue', 'Marker Felt', 'Chalkboard SE', cursive";
function drawPinPanel(m, t) {
  const w = 560, h = 466, [x, y] = panelFrame(w, h, m.door ? 'BRIG DOOR — KEYPAD' : `AIRLOCK VENT — ${roomById(m.room)?.name || ''}`);
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
  ctx.fillText(m.door ? 'RED COMET SECURITY — BRIG' : 'EMERGENCY VENT — OPEN BOTH DOORS', dx + 10, dy + 16);
  if (flash) {
    ctx.font = '800 22px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center';
    if (green || Math.floor(t * 8) % 2 === 0) ctx.fillText(red ? 'ACCESS DENIED' : 'ACCESS GRANTED', dx + dw / 2, dy + 54);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText(m.door ? 'DOOR CODE:' : 'ADMIN PASSWORD:', dx + 10, dy + 40);
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
  handText(m.door ? 'brig code?' : 'admin password', 0, -32, `20px ${PIN_HAND}`, 1);
  ctx.save(); ctx.rotate(0.03); const pw2 = handText(m.door ? 'ask Rusty' : m.pin, 0, 14, `700 ${m.door ? 26 : 34}px ${PIN_HAND}`, 3);   // (the brig's: on the barracks wall)
  ctx.strokeStyle = '#26324f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-pw2 / 2 - 4, 36); ctx.quadraticCurveTo(0, 41, pw2 / 2 + 6, 34); ctx.stroke();   // underlined
  ctx.restore();
  ctx.font = `14px ${PIN_HAND}`; ctx.fillStyle = 'rgba(38,50,79,0.75)'; ctx.fillText(m.door ? '(he wrote it on a wall)' : '(don\'t tell anyone!)', 0, 58);
  ctx.restore(); ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Click the keys, or type 0–9 + Enter', x + 436, y + h - 53); ctx.textAlign = 'left';
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
