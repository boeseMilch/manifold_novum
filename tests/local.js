// Local players (js/local.js, the host page's side of split screen): where the views go on the screen, how large a
// view's HUD is drawn, whose colour is whose, the host's own name against the local players', and what a broken
// localStorage entry does. js/local.js runs here in a sandbox of its own, with a page of just the elements it asks for.
// Run: node tests/local.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { loadGame, checks } = require('./harness');
const { check, done } = checks('local players');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'local.js'), 'utf8');

// a page: the lobby's elements js/local.js needs, a window of w × h, and what was stored in the browser
function page({ w = 1280, h = 720, stored = {}, name = 'Ripley' } = {}) {
  const ls = { ...stored }, made = [];
  const storage = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: (k) => { delete o[k]; } });
  const el = (tag) => {
    const on = {};
    const e = { tagName: tag.toUpperCase(), style: {}, dataset: {}, hidden: false, value: '', innerHTML: '', textContent: '', classList: { toggle() {}, add() {}, remove() {} },
      addEventListener: (type, f) => { (on[type] = on[type] || []).push(f); }, remove() {}, querySelector: () => null, querySelectorAll: () => [],
      // an event: every listener in the order they were added, until one stops it (as a browser does)
      fire(type) { let stopped = false; const ev = { type, target: e, stopImmediatePropagation() { stopped = true; }, preventDefault() {} }; for (const f of on[type] || []) { if (stopped) break; f(ev); } return !stopped; } };
    if (tag === 'iframe') e.contentWindow = {};
    made.push(e);
    return e;
  };
  const els = { 'local-box': el('div'), 'lobby-name': el('input'), 'local-add': el('button'), 'menu-msg': el('div') };
  els['lobby-name'].value = name;
  const window = { innerWidth: w, innerHeight: h, devicePixelRatio: 1, addEventListener() {} };
  window.parent = window;
  const sb = { window, console, Math, JSON, location: { search: '' }, navigator: {}, localStorage: storage(ls), sessionStorage: storage({}),
    document: { getElementById: (id) => els[id] || null, createElement: el, body: { appendChild() {} }, querySelectorAll: () => [] },
    setTimeout: () => 0, setInterval: () => 0, escapeHtml: (s) => String(s) };
  vm.createContext(sb);
  vm.runInContext(SRC + '\n;globalThis.__ui = localUI;', sb);
  const frames = () => made.filter(e => e.tagName === 'IFRAME'), px = (s) => ({ x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) });
  return { ui: sb.__ui, window, els, ls, add: () => els['local-add'].onclick(), frames, views: () => [window.localViewRect(), ...frames().map(f => px(f.style))],
    borders: () => made.filter(e => e.className === 'local-border') };
}

// --- the screen: equal views that fill it, beside the strip
{
  const P = page(); P.add(); P.ui.start();
  const [a, b] = P.views(), strip = a.x;
  check(a.w === b.w && a.h === 720 && b.h === 720, `two players at 1280 × 720: two views of the same size (${a.w} and ${b.w} px wide)`);
  check(strip > 0 && a.x + a.w + 2 === b.x && b.x + b.w === 1280, `…side by side from the strip (${strip} px) to the right edge, 2 px between them (${a.x}–${a.x + a.w}, ${b.x}–${b.x + b.w})`);
  const P3 = page(); P3.add(); P3.add(); P3.ui.start();
  const v3 = P3.views();
  check(v3.length === 3 && v3.every(v => v.w === v3[0].w && v.h === v3[0].h) && v3[0].x === 0 && v3[1].x + v3[1].w === 1280 && v3[2].y + v3[2].h === 720 && v3[0].w * 2 + 2 === 1280 && v3[0].h * 2 + 2 === 720,
    `three players: three equal quarters of the whole screen (${v3[0].w} × ${v3[0].h}), no strip: the plates go into the fourth`);
  const P4 = page(); P4.add(); P4.add(); P4.add(); P4.ui.start();
  const v4 = P4.views();
  check(v4.length === 4 && v4.every(v => v.w === v4[0].w && v.h === v4[0].h) && v4[0].x === strip && v4[1].x + v4[1].w === 1280 && v4[3].x + v4[3].w === 1280 && v4[3].y + v4[3].h === 720
    && new Set(v4.map(v => v.x + ',' + v.y)).size === 4, `four players: four equal quarters beside the strip (${v4[0].w} × ${v4[0].h})`);
  const P5 = page(); P5.add(); P5.add(); P5.add(); P5.add();
  check(P5.frames().length === 3, 'four players at most: a fifth isn\'t added');
  const big = page({ w: 1920, h: 1080 }); big.add(); big.ui.start();
  const [c, d] = big.views();
  check(c.w === d.w && d.x + d.w === 1920 && c.x + c.w + 2 === d.x, `1920 × 1080: the same (${c.w} px each)`);
}
// --- this page's own view is put in its place by the page's CSS: the canvas has to be positioned for left / top to
// count. (It was only when WebGL is on, js/gfx.js: in the classic view it stayed at 0 0, under the strip: a view
// 387 px wide with its left end hidden, and a 170 px black band beside it.)
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(/#c\s*\{[^}]*position:\s*fixed[^}]*left:\s*0[^}]*top:\s*0/.test(html), 'index.html positions the game\'s canvas (#c: fixed, at 0 0), so js/game.js resize() can move it to its view');
}
// --- a view's HUD: laid out for a split view (no plates column), not for a whole window
{
  const view = (w, h) => { const G = loadGame(['VIEW', 'VW', 'VH'], { localViewRect: () => ({ x: 168, y: 0, w, h }) }); return { s: G.VIEW.s, vw: G.VW, vh: G.VH }; };
  const half = view(555, 720), need = 14 + 262 + 16 + 184 * 2 + 14 + 14;     // the energy panel, then the two inventory slots (js/systems.js)
  check(half.s >= 0.7, `half of a 1280 × 720 screen (555 px): the HUD is drawn at ${half.s.toFixed(2)}, its 12 px text at ${(12 * half.s).toFixed(1)} px (it was 0.43: 5 px)`);
  check(half.vw >= need, `…and still wide enough for the bottom row: ${half.vw} px of layout for the ${need} it needs`);
  const full = view(833, 1080), quarter = view(555, 359);
  check(full.s === 1, 'half of a 1920 × 1080 screen: full size');
  check(quarter.s > 0.45 && quarter.vh >= 760, `a quarter (555 × 359): as tall a layout as before (${quarter.vh} px at ${quarter.s.toFixed(2)})`);
}
// --- colours go by the player's id in the game, not by name: a guest named like a local player has their own
{
  const P = page(); P.add();
  const local = P.frames()[0];
  P.window.netId = 1; local.contentWindow.netId = 2;       // (js/net.js: each page's id in the game)
  P.ui.room({ host: true, players: [{ id: 1, name: 'Ripley', color: '#111111' }, { id: 2, name: 'Player 2', color: '#222222' }, { id: 3, name: 'Player 2', color: '#333333' }] });
  P.ui.start();
  const [mine, theirs] = P.borders().map(b => b.style.borderColor);
  check(mine === '#111111' && theirs === '#222222', `the local player's border has their own colour (${theirs}), not the colour of a guest with the same name`);
}
// --- the host's own name can't become a local player's (their progress is kept by name)
{
  const P = page({ stored: { 'mn-name': 'Ripley' } }); P.add();
  const box = P.els['lobby-name'];
  let saved = 0; box.addEventListener('change', () => { saved++; });   // (js/net.js: saves the name, tells the server)
  box.fire('focus'); box.value = 'player 2';
  const went = box.fire('change');
  check(!went && saved === 0 && box.value === 'Ripley', `the host retypes their name to a local player's (in another case): refused, the box is back at "${box.value}", nothing saved or sent`);
  check(/Player 2/.test(P.els['menu-msg'].textContent), `…and the menu says why ("${P.els['menu-msg'].textContent}")`);
  box.fire('focus'); box.value = 'Zoe';
  check(box.fire('change') && saved === 1 && box.value === 'Zoe', 'any other name goes through as before');
}
// --- a broken entry in localStorage doesn't stop the script (the lobby needs localUI)
{
  const broken = [
    ['players not a list', { 'mn-local': '{"mine":"kbm","players":{"0":{"name":"Zoe"}}}' }],
    ['players a string, the device nonsense', { 'mn-local': '{"mine":7,"players":"Zoe"}' }],
    ['a list of rubbish', { 'mn-local': '{"players":[null,5,{"name":3},{"input":"pad0"}]}' }],
    ['not an object at all', { 'mn-local': '5' }],
    ['not JSON', { 'mn-local': '{"mine":' }],
    ['a roster of rubbish', { 'mn-local-roster': '[null,5,{"name":null},{"name":"Zoe","input":"teapot"}]' }],
    ['a roster that is no list', { 'mn-local-roster': '{"name":"Zoe"}' }],
  ];
  for (const [what, stored] of broken) {
    let P = null, err = null;
    try { P = page({ stored }); P.add(); P.ui.start(); } catch (e) { err = e; }
    check(!err && P && P.ui && P.frames().length === 1, `${what}: the lobby loads and a local player can be added${err ? ' (' + err.message + ')' : ''}`);
  }
  const P = page({ stored: { 'mn-local-roster': '[null,{"name":"Zoe","input":"teapot"},{"name":"A name that is far too long for anyone"}]' } }); P.add(); P.add();
  const src = P.frames().map(f => f.src);
  check(/name=Zoe&input=pad0/.test(src[0]), `what is sound in a broken roster is still used: Zoe comes back, on a free controller (${src[0]})`);
  check(decodeURIComponent(/name=([^&]*)/.exec(src[1])[1]).length === 20, 'a name is cut to the server\'s 20 characters');
}
done();
