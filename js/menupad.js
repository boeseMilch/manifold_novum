// Controller in the menus: the main menu, the game lobby (room, local players), the Locker / Shipyard (#shop) and the
// tutorial's "mouse, keyboard or controller?" question. js/gamepad.js turns the pad into synthetic key presses
// (isTrusted false); here those move a highlight from control to control and press it:
//   stick / d-pad (WASD, the right stick's arrows too): the nearest control that way (held: repeats)
//   A (E): press it (a dropdown: its next choice; a slider: left / right step it instead)
//   B (Escape): closes the Locker / Shipyard (the tutorial question goes back by itself; nowhere else: never leave a game)
//   Start (Enter): to PLAY SOLO / START MISSION, a second Start presses it
// Real keys and the mouse are never touched (typing a name with W A S D stays typing) and hide the highlight.
// Only while a menu is open: in a mission the same keys walk. Each local player's view (an iframe, js/local.js) has
// its own pad and its own copy of this.

const MENU_DIRS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const MENU_REPEAT = [350, 120];                      // ms: held, the first repeat, then every
const MENU_CONE = Math.tan(60 * Math.PI / 180);      // ahead: within 60° of the direction (or overlapping across it)

// Which rect a move from `from` in `dir` ('up' / 'down' / 'left' / 'right') lands on: an index into rects, -1 for none.
// Rects are { x, y, w, h }. Ahead only (its centre past ours, and not mostly level with us); the gap ahead counts, the sideways gap counts double.
function menuPick(rects, from, dir) {
  const hor = dir === 'left' || dir === 'right', sgn = dir === 'left' || dir === 'up' ? -1 : 1;
  const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
  let best = -1, bestScore = Infinity;
  rects.forEach((r, i) => {
    if (!r || r === from) return;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const along = sgn * (hor ? cx - fx : cy - fy), side = hor ? cy - fy : cx - fx;
    if (along <= 1) return;
    const [a0, a1] = hor ? [from.y, from.y + from.h] : [from.x, from.x + from.w];
    const [b0, b1] = hor ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
    const sideGap = Math.max(0, b0 - a1, a0 - b1);
    if (sideGap > 0 && Math.abs(side) > MENU_CONE * along) return;
    const gap = sgn > 0 ? (hor ? r.x - (from.x + from.w) : r.y - (from.y + from.h))
                        : (hor ? from.x - (r.x + r.w) : from.y - (r.y + r.h));
    if (gap < -0.5 * Math.min(hor ? from.w : from.h, hor ? r.w : r.h)) return;   // (mostly beside us, not past us)
    const score = Math.max(0, gap) + 0.05 * along + 2 * sideGap + 0.1 * Math.abs(side);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

// The controls a pad can reach (checkboxes through their labels: a bigger target; the Locker's owned and locked
// items too, to scroll to and read: A does nothing there).
const MENU_SEL = 'button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), label.sk-tick, .local-chip, .local-cell:empty';

const menuPad = { on: false, cur: null, layer: null, at: null, mem: new WeakMap(), rep: null };

// The menu on top: the Locker / Shipyard, the tutorial question, else the lobby's screen (null: in a mission).
function menuLayer() {
  const $ = (id) => document.getElementById(id), shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  if (shown($('shop'))) return $('shop');
  if (shown($('tut-choice'))) return $('tut-choice');
  if (!shown($('lobby'))) return null;
  for (const id of ['room', 'menu']) if (shown($(id))) return $(id);
  return null;
}
function menuCands(layer) {
  const picking = !!layer.querySelector('.local-chip.picked');   // (an empty spot on the map only takes a picked name)
  return [...layer.querySelectorAll(MENU_SEL)].filter(el => (!el.disabled || el.matches('#shop-body .item')) && el.getClientRects().length > 0
    && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true }))
    && (picking || !el.matches('.local-cell')));
}
// Where a pad starts on a layer: where it was last, else its main control.
function menuPrimary(layer, cands) {
  const pick = (sel) => cands.find(el => el.matches(sel));
  if (layer.id === 'shop' && layer.querySelector('#prof-confirm')) return pick('[data-prof-no]') || cands[0];
  const last = (layer.id === 'menu' || layer.id === 'room') && menuPad.mem.get(layer);   // (the Locker re-renders: its top again, not DONE; the question: its preselected answer)
  if (last && cands.includes(last)) return last;
  if (layer.id === 'shop') return pick('#shop-body button:not(:disabled)') || pick('#shop-body button') || pick('#shop-close') || cands[0];
  if (layer.id === 'tut-choice') return pick('.chosen') || cands[0];
  if (layer.id === 'menu') return pick('#menu-tutorial.fresh') || pick('#menu-solo') || cands[0];
  if (layer.id === 'room') return pick('#lobby-start') || pick('.mission.chosen') || cands[0];
  return cands[0];
}
const menuRect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

function menuShow(el) {
  if (menuPad.cur && menuPad.cur !== el) menuPad.cur.classList.remove('pad-focus');
  menuPad.cur = el || null;
  if (!el) return;
  el.classList.add('pad-focus');
  if (menuPad.layer) menuPad.mem.set(menuPad.layer, el);
  try { el.focus({ preventScroll: true, focusVisible: true }); } catch (e) { /* not focusable */ }
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const r = menuRect(el); menuPad.at = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  if (menuPad.layer?.id === 'tut-choice' && el.dataset.c)          // (js/tutorial.js: Start / A take the .chosen one)
    menuPad.layer.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('chosen', b === el));
}
function menuOff() { menuRepeatStop(); menuPad.on = false; menuShow(null); }

// The highlight still on a control of the menu on top? Re-rendered (bought, picked): the control nearest to where
// it was; another menu opened or back: that one's start. Returns the layer (null: no menu).
function menuSync() {
  const layer = menuLayer();
  if (!layer) { menuShow(null); menuPad.layer = null; menuPad.on = false; menuRepeatStop(); return null; }   // (a mission: the next menu waits for a push again)
  if (layer !== menuPad.layer) { menuPad.layer = layer; menuShow(null); }
  const cands = menuCands(layer);
  if (menuPad.cur && !cands.includes(menuPad.cur)) {
    const confirm = layer.id === 'shop' && layer.querySelector('#prof-confirm');
    let near = null, d = Infinity;
    if (!confirm && menuPad.at) for (const el of cands) {
      const r = menuRect(el), dd = Math.hypot(r.x + r.w / 2 - menuPad.at.x, r.y + r.h / 2 - menuPad.at.y);
      if (dd < d) { d = dd; near = el; }
    }
    menuShow(near || menuPrimary(layer, cands));
  }
  if (menuPad.on && !menuPad.cur && cands.length) menuShow(menuPrimary(layer, cands));
  return layer;
}

function menuStep(dir) {
  const layer = menuSync(); if (!layer) return menuRepeatStop();
  const cur = menuPad.cur; if (!cur) return;
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    const step = +cur.step || 1, v = Math.min(+cur.max, Math.max(+cur.min, +cur.value + (dir === 'right' ? step : -step)));
    if (v !== +cur.value) { cur.value = String(v); menuFire(cur); }
    return;
  }
  const cands = menuCands(layer), i = menuPick(cands.map(menuRect), menuRect(cur), dir);
  if (i >= 0) menuShow(cands[i]);
}
function menuFire(el) { for (const t of ['input', 'change']) el.dispatchEvent(new Event(t, { bubbles: true })); }
function menuPress(el) {
  if (el.tagName === 'SELECT') {                     // (a script can't open the dropdown: A steps through it)
    const opts = [...el.options], n = opts.length;
    // (your own device in the local-players panel: stepping it with the controller never lands on the keyboard + mouse,
    //  which would take this controller away from you mid-press: js/local.js)
    const skip = (o) => o.disabled || (el.matches('[data-me]') && o.value === 'kbm');
    for (let k = 1; k <= n; k++) { const o = opts[(el.selectedIndex + k) % n]; if (!skip(o)) { el.value = o.value; break; } }
    menuFire(el);
  } else if (el.tagName === 'INPUT') { /* text: focused already; slider: left / right */ }
  else el.click();
  const later = () => { if (menuPad.on) menuSync(); };   // (the press may re-render or open another menu)
  setTimeout(later, 0); setTimeout(later, 120);
}
function menuRepeatStop() { if (menuPad.rep) clearTimeout(menuPad.rep.t); menuPad.rep = null; }
function menuRepeat(code, dir) {
  menuRepeatStop();
  const rep = menuPad.rep = { code, t: 0 };
  const tick = () => { if (menuPad.rep !== rep) return; menuStep(dir); if (menuPad.rep === rep) rep.t = setTimeout(tick, MENU_REPEAT[1]); };
  rep.t = setTimeout(tick, MENU_REPEAT[0]);
}

// The pad's keys (only those: not the keyboard's, not keys passed on from another player's view without a controller).
function menuKeyDown(e) {
  if (e.isTrusted) { if (menuPad.on) menuOff(); return; }
  if (typeof gamepad !== 'undefined' && gamepad.index == null) return;   // (no pad here: keys passed on from another view, js/split.js)
  const dir = MENU_DIRS[e.code];
  if (!dir && !['KeyE', 'Escape', 'Enter'].includes(e.code)) return;
  if (!menuLayer()) { if (menuPad.cur || menuPad.on) menuOff(); return; }
  const fresh = !menuPad.on;
  menuPad.on = true;
  const layer = menuSync(), cur = menuPad.cur;
  const own = () => { e.stopImmediatePropagation(); e.preventDefault(); };
  if (dir) {
    if (e.repeat) return;
    if (!fresh) menuStep(dir);                       // (the first push only shows where you are)
    menuRepeat(e.code, dir);
    return;
  }
  if (e.repeat) return;
  if (layer.id === 'tut-choice') {                   // js/tutorial.js answers A / Start / B itself, except on "back"
    if (e.code === 'KeyE' && cur?.classList.contains('tut-cancel')) { own(); cur.click(); }
    return;
  }
  if (e.code === 'KeyE') { own(); if (cur && !fresh) menuPress(cur); }
  else if (e.code === 'Escape' && layer.id === 'shop') {
    own(); (layer.querySelector('[data-prof-no]') || layer.querySelector('#shop-close'))?.click();
    setTimeout(() => { if (menuPad.on) menuSync(); }, 0);
  } else if (e.code === 'Enter' && (layer.id === 'room' || layer.id === 'menu')) {
    const go = document.getElementById(layer.id === 'room' ? 'lobby-start' : 'menu-solo');
    if (!go || go.disabled || !go.getClientRects().length) return;
    own();
    if (cur === go) menuPress(go); else menuShow(go);
  }
}
function menuKeyUp(e) { if (menuPad.rep && menuPad.rep.code === e.code) menuRepeatStop(); }

// Tab in the menus: the next text field (the name in the main menu, the local players' names; Shift+Tab: the one
// before), skipping the buttons in between (2026-11-01, the user). Not during a mission (Tab isn't the menus' then).
const menuTextFields = () => [...document.querySelectorAll('input[type=text], input:not([type])')]
  .filter(el => !el.disabled && !el.readOnly && el.getClientRects().length && (el.closest('#lobby, #shop') && !el.closest('[hidden]')));
function menuTab(e) {
  if (e.code !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const lobby = document.getElementById('lobby');
  if (!lobby || lobby.hidden) return;
  const list = menuTextFields();
  if (!list.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const i = list.indexOf(document.activeElement), n = list.length;
  const next = list[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + n) % n];
  const k = list.indexOf(next);
  next.focus(); next.select?.();
  // (leaving a local player's name saves it, which rebuilds the panel: then the field at the same place again)
  setTimeout(() => { if (!document.contains(next)) { const again = menuTextFields()[k]; again?.focus(); again?.select?.(); } }, 0);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', menuTab, true);
  window.addEventListener('keydown', menuKeyDown, true);   // (capture: before the game's own key handlers)
  window.addEventListener('keyup', menuKeyUp, true);
  window.addEventListener('blur', menuRepeatStop);
  window.addEventListener('pointermove', (e) => { if (menuPad.on && e.isTrusted && (e.movementX || e.movementY)) menuOff(); }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (menuPad.on && e.isTrusted) menuOff(); }, { passive: true });
  setInterval(() => { if (menuPad.on || menuPad.cur) menuSync(); }, 250);   // (menus re-render, a mission starts)
}
