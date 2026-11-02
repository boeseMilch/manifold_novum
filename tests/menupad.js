// Controller in the menus (js/menupad.js): which control a push lands on, and that only the pad's (synthetic) keys
// move or press anything. Run: node tests/menupad.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'menupad.js'), 'utf8');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// --- the pick (pure)
{
  const sb = { Math, console };
  vm.createContext(sb);
  vm.runInContext(SRC + '\n;globalThis.__m = { menuPick };', sb);
  const { menuPick } = sb.__m;
  const R = (x, y, w = 100, h = 40) => ({ x, y, w, h });
  // a 3×3 grid of buttons, 20 px apart
  const grid = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(R(c * 120, r * 60));
  check(menuPick(grid, grid[4], 'right') === 5 && menuPick(grid, grid[4], 'left') === 3, 'grid: left / right go to the neighbours in the row');
  check(menuPick(grid, grid[4], 'up') === 1 && menuPick(grid, grid[4], 'down') === 7, 'grid: up / down go to the neighbours in the column');
  check(menuPick(grid, grid[2], 'right') === -1 && menuPick(grid, grid[0], 'up') === -1, 'nothing that way: stay (no wrap)');
  // the main menu's shape: a wide button over two half-width ones, a text field to the left of the wide one
  const wide = R(820, 300, 490, 70), solo = R(820, 385, 230, 65), open = R(1070, 385, 235, 65), name = R(290, 330, 395, 50);
  const menu = [wide, solo, open, name];
  check(menuPick(menu, wide, 'left') === 3, 'left from a wide button: the field beside it, not the button below it that starts at the same edge');
  check(menuPick(menu, wide, 'down') === 1 || menuPick(menu, wide, 'down') === 2, 'down from a wide button: one of the two below');
  check(menuPick(menu, solo, 'up') === 0 && menuPick(menu, open, 'up') === 0, 'up from either half: the wide one');
  check(menuPick(menu, solo, 'right') === 2 && menuPick(menu, open, 'left') === 1, 'the two halves: left / right between them');
  // sideways distance counts more: from (0,0) down, a button straight below but far beats one close but well aside
  const col = [R(0, 0), R(0, 300), R(200, 60)];
  check(menuPick(col, col[0], 'down') === 1, 'down: far but straight below beats near but far aside (outside 60°)');
  const near = [R(0, 0), R(0, 200), R(60, 60)];
  check(menuPick(near, near[0], 'down') === 2, 'down: near and overlapping a little beats far straight below');
  // a long list: the next card, not one further down
  const list = [R(0, 0, 300, 50), R(0, 60, 300, 50), R(0, 120, 300, 50)];
  check(menuPick(list, list[0], 'down') === 1 && menuPick(list, list[2], 'up') === 1, 'a list: one card at a time');
}

// --- the keys: a fake page with the lobby's main menu open, two buttons side by side
function fakePage({ pad = 0 } = {}) {
  const listeners = {}, clicks = [];
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), has: (c) => s.has(c) }; };
  const el = (id, rect, extra = {}) => ({
    id, tagName: 'BUTTON', hidden: false, disabled: false, dataset: {}, classList: cls(), type: 'submit',
    getClientRects: () => [rect], getBoundingClientRect: () => ({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }),
    matches: (sel) => sel === '#' + id,
    focus() {}, scrollIntoView() {}, click() { clicks.push(id); }, dispatchEvent() {}, querySelector: () => null, querySelectorAll: () => [], ...extra,
  });
  const solo = el('menu-solo', { x: 0, y: 0, w: 100, h: 40 }), open = el('menu-open', { x: 120, y: 0, w: 100, h: 40 });
  const menu = el('menu', { x: 0, y: 0, w: 400, h: 400 }, { querySelectorAll: () => [solo, open], querySelector: () => null });
  const room = el('room', { x: 0, y: 0, w: 0, h: 0 }, { hidden: true, getClientRects: () => [] });
  const lobby = el('lobby', { x: 0, y: 0, w: 400, h: 400 });
  const gone = { hidden: true, getClientRects: () => [] };
  const byId = { menu, room, lobby, 'menu-solo': solo, 'menu-open': open, shop: gone, 'tut-choice': null };
  const timers = [];
  const sb = {
    Math, console, Event: class { constructor(t) { this.type = t; } },
    gamepad: { index: pad },
    document: { getElementById: (id) => byId[id] ?? null },
    window: { addEventListener: (n, f) => { (listeners[n] ||= []).push(f); } },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval() {},
  };
  sb.window.addEventListener = sb.window.addEventListener.bind(sb.window);
  sb.addEventListener = sb.window.addEventListener;
  vm.createContext(sb);
  vm.runInContext(SRC + '\n;globalThis.__m = { menuPad };', sb);
  let stopped = 0;
  const key = (code, trusted) => {
    const e = { type: 'keydown', code, isTrusted: trusted, repeat: false, stopImmediatePropagation() { stopped++; }, preventDefault() {} };
    for (const f of listeners.keydown || []) f(e);
    for (const f of listeners.keyup || []) f({ ...e, type: 'keyup' });
  };
  return { key, clicks, menuPad: sb.__m.menuPad, solo, open, stopped: () => stopped, flush: () => timers.splice(0) };
}
{
  const P = fakePage();
  P.key('KeyD', true); P.key('KeyE', true); P.key('Enter', true);
  check(!P.menuPad.cur && P.clicks.length === 0 && P.stopped() === 0, 'real keys (typing a name: W A S D, E, Enter) move and press nothing');
  P.key('KeyD', false);
  check(P.menuPad.cur === P.solo && P.solo.classList.has('pad-focus'), "the pad's first push shows where you are: the menu's PLAY SOLO, highlighted");
  P.key('KeyD', false);
  check(P.menuPad.cur === P.open && !P.solo.classList.has('pad-focus'), 'the next push right moves the highlight');
  P.key('KeyE', false);
  check(P.clicks.join() === 'menu-open', 'A presses the highlighted button');
  P.key('KeyS', true);
  check(!P.menuPad.cur && !P.open.classList.has('pad-focus'), 'a real key hides the highlight again');
}
{
  const P = fakePage({ pad: null });
  P.key('KeyD', false); P.key('KeyE', false);
  check(!P.menuPad.cur && P.clicks.length === 0, 'no controller on this page (keys passed on from another view, js/split.js): nothing');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
