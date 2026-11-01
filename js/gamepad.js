// Controller support: a gamepad is mapped onto the keyboard. Every frame the chosen pad is read
// and its buttons / sticks become key presses (synthetic keydown / keyup on window), so the
// game, the tutorial and the menus see exactly what they'd see from the keyboard.
//
// Several pads, several tabs: each tab plays one pad. A tab without one takes the first pad
// whose button is pressed while that tab has focus (and no other tab holds it); the little
// "🎮" picker (bottom left in the menus, shown while a pad is connected) switches by hand. Tabs tell each
// other which pad they hold over a BroadcastChannel, so two tabs (two players on
// `node server.js`) side by side, or on two screens, each run off their own controller.
// The choice is per tab (sessionStorage), it survives a reload.

// Standard mapping (https://w3c.github.io/gamepad/#remapping) → key codes.
const PAD_BUTTONS = {
  0: 'KeyE',        // A: use
  1: 'Escape',      // B: back / close the panel
  2: 'Space',       // X: weapon / fire
  3: 'KeyR',        // Y: reload the cannon
  4: 'PadDropWeapon',   // LB: drop the weapon (the first inventory slot; no key of its own, js/game.js updatePlayer)
  5: 'PadDropItem',     // RB: drop the item (the second slot)
  6: 'ShiftLeft',   // LT: cover
  7: 'Space',       // RT: weapon / fire
  8: 'KeyM',        // Back / Select: mute
  9: 'Enter',       // Start: go on (tutorial, PIN pad)
  12: 'KeyW', 13: 'KeyS', 14: 'KeyA', 15: 'KeyD',   // d-pad: walk
};
const PAD_DEAD = 0.45;   // stick deflection that counts as a key held
const PAD_KEY = { Space: ' ', Escape: 'Escape', Enter: 'Enter', ShiftLeft: 'Shift' };

// The key codes a pad state holds (pure, for the tests).
function padCodes(pad) {
  const out = new Set();
  if (!pad) return out;
  (pad.buttons || []).forEach((b, i) => { if (PAD_BUTTONS[i] && (b.pressed || b.value > 0.5)) out.add(PAD_BUTTONS[i]); });
  const ax = pad.axes || [], stick = (x, y, l, r, u, d) => {
    if (x < -PAD_DEAD) out.add(l); if (x > PAD_DEAD) out.add(r);
    if (y < -PAD_DEAD) out.add(u); if (y > PAD_DEAD) out.add(d);
  };
  stick(ax[0] || 0, ax[1] || 0, 'KeyA', 'KeyD', 'KeyW', 'KeyS');                    // left stick: walk
  stick(ax[2] || 0, ax[3] || 0, 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'); // right stick: aim
  return out;
}
// The sticks as they really point ({ aim: right, walk: left }, [x, y], null when inside the dead zone; null for
// no pad): the keys only give 8 directions, which leaves a cannon's narrow arc just its two edges.
function padSticks(pad) {
  const ax = pad?.axes || [], v = (x, y) => (Math.hypot(x, y) > PAD_DEAD ? [x, y] : null);
  const s = { aim: v(ax[2] || 0, ax[3] || 0), walk: v(ax[0] || 0, ax[1] || 0) };
  return s.aim || s.walk ? s : null;
}
const padActive = (pad) => !!pad && ((pad.buttons || []).some(b => b.pressed) || (pad.axes || []).some(a => Math.abs(a) > PAD_DEAD));

const gamepad = {
  index: null,                     // the pad this tab plays (navigator.getGamepads() index), or null
  held: new Set(),                 // codes this module holds down right now
  others: new Map(),               // pad index → tab id, pads other tabs hold
  tab: Math.random().toString(36).slice(2),
  chan: null, picker: null,
};

function padSave() { try { sessionStorage.setItem('mn-pad', gamepad.index == null ? '' : String(gamepad.index)); } catch (e) {} }
function padClaim(i) {
  gamepad.index = i; padSave(); padRelease();
  gamepad.chan?.postMessage({ t: 'claim', tab: gamepad.tab, pad: i });
  padPickerRender();
}
function padKey(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: PAD_KEY[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code), bubbles: true, cancelable: true }));
}
function padRelease() { for (const c of gamepad.held) padKey('keyup', c); gamepad.held.clear(); }

function padPoll() {
  const pads = [...(navigator.getGamepads?.() || [])];
  if (gamepad.index != null && !pads[gamepad.index]) padRelease();   // (unplugged: let go, keep the choice for when it's back)
  if (gamepad.index == null && document.hasFocus()) {
    const free = pads.findIndex((p, i) => p && !gamepad.others.has(i) && padActive(p));
    if (free >= 0) padClaim(free);
  }
  const want = gamepad.index == null ? new Set() : padCodes(pads[gamepad.index]);
  for (const c of gamepad.held) if (!want.has(c)) { gamepad.held.delete(c); padKey('keyup', c); }
  for (const c of want) if (!gamepad.held.has(c)) { gamepad.held.add(c); padKey('keydown', c); }
  if (typeof localInput !== 'undefined') localInput.stick = gamepad.index == null ? null : padSticks(pads[gamepad.index]);   // (the cannon reads the real angle: js/game.js)
  const n = pads.filter(Boolean).length;
  if (gamepad.picker && (gamepad.picker.hidden !== !padPickerShown(n) || gamepad.picker.dataset.n !== String(n))) padPickerRender();
  requestAnimationFrame(padPoll);
}

// The picker: which pad this tab plays. Only in the menus (in a mission it would cover the HUD).
const padPickerShown = (n) => n > 0 && (typeof lobbyOpen !== 'function' || lobbyOpen());
function padPickerRender() {
  const sel = gamepad.picker; if (!sel) return;
  const pads = [...(navigator.getGamepads?.() || [])];
  sel.dataset.n = String(pads.filter(Boolean).length);
  sel.hidden = !padPickerShown(pads.filter(Boolean).length);
  const opts = [['', '🎮 no controller']];
  pads.forEach((p, i) => { if (p) opts.push([String(i), `🎮 ${i + 1}: ${p.id.replace(/\s*\(.*$/, '').slice(0, 28)}${gamepad.others.has(i) ? ' (other tab)' : ''}`]); });
  if (gamepad.index != null && !pads[gamepad.index]) opts.push([String(gamepad.index), `🎮 ${gamepad.index + 1}: unplugged`]);
  sel.innerHTML = '';
  for (const [v, label] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); }
  sel.value = gamepad.index == null ? '' : String(gamepad.index);
}

function padInit() {
  if (!navigator.getGamepads) return;
  try { const s = sessionStorage.getItem('mn-pad'); if (s) gamepad.index = +s; } catch (e) {}
  if (typeof BroadcastChannel === 'function') {
    gamepad.chan = new BroadcastChannel('mn-gamepad');
    gamepad.chan.onmessage = ({ data: m }) => {
      if (m.t === 'claim') {
        for (const [i, t] of gamepad.others) if (t === m.tab) gamepad.others.delete(i);
        if (m.pad != null) gamepad.others.set(m.pad, m.tab);
        if (m.pad != null && m.pad === gamepad.index) { padRelease(); gamepad.index = null; padSave(); }   // another tab took ours
      } else if (m.t === 'hello' && gamepad.index != null) gamepad.chan.postMessage({ t: 'claim', tab: gamepad.tab, pad: gamepad.index });
      else if (m.t === 'bye') { for (const [i, t] of gamepad.others) if (t === m.tab) gamepad.others.delete(i); }
      padPickerRender();
    };
    gamepad.chan.postMessage({ t: 'hello', tab: gamepad.tab });
    if (gamepad.index != null) gamepad.chan.postMessage({ t: 'claim', tab: gamepad.tab, pad: gamepad.index });
    window.addEventListener('pagehide', () => gamepad.chan.postMessage({ t: 'bye', tab: gamepad.tab }));
  }
  // game.js lets go of every key when the window loses focus: hold them again on the next frame
  window.addEventListener('blur', () => gamepad.held.clear());
  const sel = document.createElement('select');
  sel.id = 'pad-picker'; sel.hidden = true; sel.title = 'Which controller this tab plays';
  sel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px system-ui,sans-serif;background:#141a26;color:#c8cfdc;border:1px solid #3a4458;border-radius:4px;padding:2px 4px;opacity:.85';
  sel.addEventListener('change', () => { if (sel.value === '') { padRelease(); gamepad.index = null; padSave(); gamepad.chan?.postMessage({ t: 'claim', tab: gamepad.tab, pad: null }); padPickerRender(); } else padClaim(+sel.value); sel.blur(); });
  document.body.appendChild(sel); gamepad.picker = sel;
  window.addEventListener('gamepadconnected', padPickerRender);
  window.addEventListener('gamepaddisconnected', padPickerRender);
  requestAnimationFrame(padPoll);
}
if (typeof navigator !== 'undefined' && typeof document !== 'undefined' && document.body) padInit();
