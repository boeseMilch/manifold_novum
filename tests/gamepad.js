// Controller support (js/gamepad.js): pad buttons / sticks become key presses, and each tab
// plays its own pad (two tabs, two pads: split screen). Run: node tests/gamepad.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'gamepad.js'), 'utf8');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

const pad = (id, { buttons = [], axes = [0, 0, 0, 0] } = {}) => ({ id, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) });

// A fake browser tab: own window / document / sessionStorage, a shared BroadcastChannel bus and shared pads.
function makeTab(bus, pads, focused) {
  const keys = new Set(), frames = [], listeners = {};
  const el = () => ({ style: {}, dataset: {}, appendChild() {}, addEventListener() {}, blur() {}, set innerHTML(v) {} });
  class BC { constructor() { this.onmessage = null; bus.push(this); } postMessage(data) { for (const c of bus) if (c !== this) c.onmessage?.({ data }); } }
  const store = {};
  const sb = {
    navigator: { getGamepads: () => pads },
    document: { body: el(), createElement: el, hasFocus: () => tab.focused },
    window: {
      addEventListener: (n, f) => { (listeners[n] ||= []).push(f); },
      dispatchEvent: (e) => { if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); },
    },
    KeyboardEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o); } },
    BroadcastChannel: BC, sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    requestAnimationFrame: f => frames.push(f), Math, String, Set, Map, console,
  };
  const tab = { keys, focused, frame() { const f = frames.splice(0); f.forEach(fn => fn()); }, G: null };
  vm.createContext(sb);
  vm.runInContext(SRC + '\n;globalThis.__g = { gamepad, padCodes, padClaim, padSticks };', sb);
  tab.G = sb.__g;
  return tab;
}

// --- the mapping
{
  const G = makeTab([], [], true).G;
  const codes = (p) => [...G.padCodes(p)].sort().join(' ');
  check(codes(pad('x')) === '', 'a pad at rest holds no key');
  check(codes(pad('x', { buttons: [0] })) === 'KeyE', 'A → E (use)');
  check(codes(pad('x', { buttons: [7] })) === 'Space' && codes(pad('x', { buttons: [2] })) === 'Space', 'RT / X → Space (weapon, fire)');
  check(codes(pad('x', { buttons: [4, 5] })) === 'PadDropItem PadDropWeapon', 'LB / RB → drop the weapon / the item');
  check(codes(pad('x', { buttons: [6] })) === 'ShiftLeft', 'LT → Shift (cover)');
  check(codes(pad('x', { buttons: [1, 3, 9] })) === 'Enter Escape KeyR', 'B → Escape, Y → R, Start → Enter');
  check(codes(pad('x', { axes: [-0.9, 0.2, 0, 0] })) === 'KeyA', 'left stick left → A (small deflection on the other axis ignored)');
  check(codes(pad('x', { axes: [0, 0, 0.8, -0.8] })) === 'ArrowRight ArrowUp', 'right stick → the arrow keys (aim)');
  check(codes(pad('x', { buttons: [12, 15] })) === 'KeyD KeyW', 'd-pad → WASD');
  const st = G.padSticks(pad('x', { axes: [0.1, 0, -0.9, -0.3] }));
  check(st && !st.walk && st.aim[0] === -0.9 && st.aim[1] === -0.3, 'the right stick also gives its real direction (the cannon aims at any angle, not 8)');
  check(G.padSticks(pad('x', { axes: [0.2, 0.2, 0.1, -0.2] })) === null, 'sticks inside the dead zone: no direction');
}

// --- two tabs, two pads
{
  const bus = [], pads = [pad('Pad one'), pad('Pad two')];
  const t1 = makeTab(bus, pads, true), t2 = makeTab(bus, pads, false);
  const all = () => { t1.frame(); t2.frame(); };
  all();
  check(t1.G.gamepad.index == null && t2.G.gamepad.index == null, 'nobody holds a pad before a button is pressed');
  pads[0] = pad('Pad one', { buttons: [0] }); all();
  check(t1.G.gamepad.index === 0 && t2.G.gamepad.index == null, 'the focused tab takes the pad that was pressed');
  check(t1.keys.has('KeyE') && !t2.keys.has('KeyE'), 'its A press is E in that tab only');
  pads[0] = pad('Pad one'); all();
  check(!t1.keys.has('KeyE'), 'letting go of A lets go of E');
  t1.focused = false; t2.focused = true;
  pads[0] = pad('Pad one', { buttons: [0] }); all();
  check(t2.G.gamepad.index == null && !t2.keys.has('KeyE'), 'pad 1 is taken: pressing it with tab 2 focused does nothing there');
  check(t1.keys.has('KeyE'), '…and still drives tab 1 without focus');
  pads[0] = pad('Pad one');
  pads[1] = pad('Pad two', { axes: [0, 1, 0, 0] }); all();
  check(t2.G.gamepad.index === 1 && t2.keys.has('KeyS') && !t1.keys.has('KeyS'), 'tab 2 takes pad 2; its stick walks there only');
  pads[0] = pad('Pad one', { buttons: [0] }); all();
  t2.G.padClaim(0); all();   // tab 2 picks pad 1 by hand
  check(t2.G.gamepad.index === 0 && t1.G.gamepad.index == null, 'picking a pad another tab holds takes it over');
  check(!t1.keys.has('KeyE') && t2.keys.has('KeyE') && !t2.keys.has('KeyS'), '…the old tab lets go of its keys, the new one gets them');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
