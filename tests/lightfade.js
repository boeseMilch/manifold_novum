// The power-out fade of the room lights (js/systems.js updateLightLevels, called by js/game.js render()): it runs
// in real time, the same at every refresh rate (2026-11-10: render() advanced it 1 / 60 s per drawn frame, so it
// was 2.4 times faster on a 144 Hz screen and half as fast at 30 fps). Run: node tests/lightfade.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
// The middle column's light level after its capacitor has been empty for `sec` s, drawn at `hz` frames a second.
const fade = (hz, sec) => {
  const G = loadGame(['render', 'startMission', 'CAPACITORS', 'lightLevel']);
  G.startMission('c1');
  let t = 100; G.render(t);                              // (a first frame, lights on)
  G.CAPACITORS[1].charge = 0;
  for (let i = 0; i < Math.round(hz * sec); i++) { t += 1 / hz; G.render(t); }
  return G.lightLevel[1];
};
const at = { 30: fade(30, 0.5), 60: fade(60, 0.5), 144: fade(144, 0.5) }, want = Math.exp(-3 * 0.5);
check(Math.abs(at[60] - want) < 0.01, `half a second without power at 60 fps: the lights are down to ${at[60].toFixed(3)} (e^-1.5 = ${want.toFixed(3)})`);
check(Math.abs(at[144] - at[60]) < 0.01 && Math.abs(at[30] - at[60]) < 0.01, `and to the same level at 144 fps and at 30 fps (${at[144].toFixed(3)}, ${at[30].toFixed(3)})`);
process.exitCode = failed ? 1 : 0;
