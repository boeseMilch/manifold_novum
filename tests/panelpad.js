// A controller (or the keys) on the canvas panels (js/mission.js panelKeys): WASD / the arrows / a stick jump between a
// panel's clickable spots (ui.hits), A / X / Start (E, Space, Enter) press the picked one like a click; E with nothing
// picked still closes the panel. The derelict lab's energy hookup (J1), the PIN pad, the patch board.
// Run: node tests/panelpad.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const NAMES = ['me', 'startMission', 'dockShip', 'withCrew', 'openJ1', 'openPinPad', 'openPatch', 'render', 'panelKeys', 'localInput', 'S7', 'J1_CIRCUITS', 'mission', 'power', 'simTick'];
const fresh = (id = 'c1') => { const G = loadGame(NAMES); G.startMission(id, {}); G.mission.active = true; return G; };
// one frame: draw (the panel lists its spots), then this browser's keys (as js/game.js clientUpdate), then the sim
const step = (G, k) => { G.render(0); if (k) G.localInput.pressed.add(k); G.panelKeys(G.localInput, G.me); G.simTick(1 / 60); G.localInput.pressed.clear(); };

// --- the derelict lab's energy hookup: source, then the freezer's circuit (C3), keys only
{
  const G = fresh('c6'); G.dockShip('derelict', 'port');
  G.withCrew(G.me, () => G.openJ1()); step(G);
  step(G, 'KeyD'); step(G, 'KeyE');
  check(G.me.ui.mini?.pick === true, 'J1: the first press picks the source, A takes it (not "close the panel")');
  step(G, 'KeyD'); const freezer = G.J1_CIRCUITS.findIndex(c => c[1] === 'freezer');
  for (let i = 0; i < 3; i++) step(G, 'KeyS');
  step(G, 'KeyE');
  check(G.S7()?.j1 === true && !G.me.ui.panel && freezer === 2, 'J1: over to the circuits, down to C3, A plugs it: patched, the panel closes');
}
// --- the PIN pad: type a code with the stick and A
{
  const G = fresh();
  G.withCrew(G.me, () => G.openPinPad('portLock')); step(G);
  step(G, 'KeyS'); step(G, 'KeyE');          // (the first press: key 1)
  const typed1 = G.me.ui.mini?.typed;
  step(G, 'KeyD'); step(G, 'KeyE');
  check(typed1 === '1' && G.me.ui.mini?.typed === '12' && G.me.ui.panel === 'mini', `PIN pad: key 1, then right to 2: typed "${G.me.ui.mini?.typed}"`);
}
// --- the patch board: an output to a capacitor
{
  const G = fresh();
  G.withCrew(G.me, () => G.openPatch()); step(G);
  step(G, 'KeyS'); step(G, 'KeyE');
  check(G.me.ui.mini?.pick === 0, 'patch board: the first output picked with A');
}
// --- nothing picked: E closes the panel as before (keyboard / mouse users see no change)
{
  const G = fresh();
  G.withCrew(G.me, () => G.openPatch()); step(G);
  step(G, 'KeyE');
  check(!G.me.ui.panel, 'nothing picked: E closes the panel, as always');
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
