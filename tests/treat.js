// Treating adds up: the progress lives on the patient (c.heal), so patching yourself up while a crewmate
// treats you fills it at 1/self time + 1/their time (each with their own gear). Letting go briefly keeps
// it, everyone letting go starts it over, and every browser sees the same bar. Run: node tests/treat.js
const { loadGame } = require('./harness');
const NAMES = ['crew', 'hurtCrew', 'netServer', 'netSerialize', 'netApply', 'simTick', 'mission', 'me', 'workProgress', 'SELF_TREAT', 'TREAT_TIME'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const near = (a, b, tol = 0.1) => Math.abs(a - b) < tol;

// A (patient, down) and B next to them; kits: { A: {...}, B: {...} }
function setup(kits = {}) {
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'A', kits.A); G.netServer.addCrew(2, 'B', kits.B);
  const [A, B] = G.crew; B.x = A.x + 1; B.y = A.y;
  G.hurtCrew(A); G.hurtCrew(A);
  return { G, A, B };
}
const holdOn = (G, id, c, down = true) => G.netServer.input(id, { keys: [], pressed: [], mouse: { wx: c.x, wy: c.y, down } });
// ticks until A is up again (or max s), with self / other holding; returns the time
function run(G, A, B, { self, other, max = 15 }) {
  let t = 0;
  while (A.health === 'down' && t < max) {
    holdOn(G, 1, A, !!self); holdOn(G, 2, A, !!other);
    G.simTick(DT); t += DT;
  }
  return t;
}

{ const { G, A, B } = setup(); const t = run(G, A, B, { self: true });
  check(A.health === 'hurt' && near(t, G.SELF_TREAT), `patching yourself up alone: ${G.SELF_TREAT} s (${t.toFixed(2)} s)`); }
{ const { G, A, B } = setup(); const t = run(G, A, B, { other: true });
  check(A.health === 'hurt' && near(t, G.TREAT_TIME), `a crewmate treating you alone: ${G.TREAT_TIME} s (${t.toFixed(2)} s)`);
  check(A.heal == null && !B.treat, 'done: the shared progress and the hold are cleared'); }
{ const { G, A, B } = setup(); const t = run(G, A, B, { self: true, other: true }), want = 1 / (1 / G.SELF_TREAT + 1 / G.TREAT_TIME);
  check(A.health === 'hurt' && near(t, want), `both at once add up: 1/(1/${G.SELF_TREAT} + 1/${G.TREAT_TIME}) = ${want.toFixed(2)} s (${t.toFixed(2)} s)`);
  check(!A.treat && !B.treat, '…and both holds end together'); }
{ const { G, A, B } = setup({ A: { gear: { stim: true } }, B: { gear: { firstAid: true } } });
  const t = run(G, A, B, { self: true, other: true }), want = 1 / (1 / 3 + 1 / 1.2);
  check(A.health === 'hurt' && near(t, want), `each with their own gear (stim 3 s, first aid 1.2 s): ${want.toFixed(2)} s (${t.toFixed(2)} s)`); }
{ // B helps for 0.5 s, then stops: A keeps the progress B added and finishes the rest alone
  const { G, A, B } = setup();
  run(G, A, B, { self: true, other: true, max: 0.5 });
  const k = A.heal;
  check(near(k, 0.5 * (1 / G.SELF_TREAT + 1 / G.TREAT_TIME), 0.02), `half a second together: ${(k * 100).toFixed(0)} % done`);
  const t = run(G, A, B, { self: true });
  check(A.health === 'hurt' && near(t, (1 - k) * G.SELF_TREAT, 0.1), `B stops: A finishes the rest alone in ${t.toFixed(2)} s (${((1 - k) * G.SELF_TREAT).toFixed(2)} s left)`); }
{ // everyone lets go for longer than the heartbeat grace: it starts over (as a hold always did)
  const { G, A, B } = setup();
  run(G, A, B, { self: true, other: true, max: 1 });
  run(G, A, B, { max: 0.2 });
  check(A.heal > 0.5, `letting go for 0.2 s keeps the progress (${(A.heal * 100).toFixed(0)} %)`);
  run(G, A, B, { max: 1 });
  check(A.heal == null && !A.treat && !B.treat, 'letting go for a second: the treatment starts over');
  G.hurtCrew(B);
  const { G: G2, A: A2, B: B2 } = setup();
  run(G2, A2, B2, { other: true, max: 1 }); G2.hurtCrew(A2);
  check(A2.health === 'out' && A2.heal == null, 'hit again while being treated: it starts over'); }
{ // multiplayer: both browsers see the same shared bar
  const { G, A, B } = setup();
  run(G, A, B, { self: true, other: true, max: 0.6 });
  const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  const pa = loadGame(NAMES), pb = loadGame(NAMES);
  pa.netApply(snap, 1); pb.netApply(snap, 2);
  const wa = pa.workProgress(pa.me), wb = pb.workProgress(pb.me);
  check(snap.crew[0].heal > 0 && near(wa?.k, A.heal, 1e-6) && near(wb?.k, A.heal, 1e-6),
    `in multiplayer both bars show the patient's progress (server ${(A.heal * 100).toFixed(0)} %, A's bar ${(wa?.k * 100).toFixed(0)} % "${wa?.label}", B's ${(wb?.k * 100).toFixed(0)} % "${wb?.label}")`);
  run(G, A, B, { other: true, max: 0.3 });
  const snap2 = JSON.parse(JSON.stringify(G.netSerialize())); pa.netApply(snap2, 1); pb.netApply(snap2, 2);
  const wa2 = pa.workProgress(pa.me);
  check(near(wa2?.k, A.heal, 1e-6) && near(pb.workProgress(pb.me)?.k, A.heal, 1e-6), `A stops helping: A still sees B's progress over their head ("${wa2?.label}", ${(wa2?.k * 100).toFixed(0)} %)`);
}

// --- down: holding E alone gets you up, wherever the mouse is; clicking on yourself still works
const holdKeys = (G, id, keys, mouse) => G.netServer.input(id, { keys, pressed: [], mouse });   // (held, no fresh presses: no heartbeat bonus)
for (const [what, mouse] of [['E, mouse far away', 'far'], ['E, mouse held down far away', 'held'], ['E, mouse on yourself', 'on'], ['click on yourself', 'click']]) {
  const { G, A } = setup(); let t = 0;
  while (A.health === 'down' && t < 15) {
    const m = mouse === 'far' ? { wx: A.x + 6, wy: A.y - 5 } : mouse === 'held' ? { wx: A.x + 6, wy: A.y - 5, down: true } : { wx: A.x, wy: A.y, down: mouse === 'click' };
    holdKeys(G, 1, mouse === 'click' ? [] : ['KeyE'], m); G.simTick(DT); t += DT;
  }
  check(A.health === 'hurt' && near(t, G.SELF_TREAT), `down: ${what} patches you up in ${t.toFixed(2)} s`);
  if (mouse === 'far') check(/hold E/.test(A.prompt?.text || '') || A.health === 'hurt', 'the prompt says E is enough');
}
{ const { G, A } = setup(); G.simTick(DT);
  check(/^Down — hold E/.test(A.prompt?.text || ''), `the down prompt leads with E ("${A.prompt?.text}")`); }
{ // standing next to a downed crewmate, E treats them (not anything else)
  const { G, A, B } = setup(); let t = 0;
  while (A.health === 'down' && t < 5) { holdKeys(G, 2, ['KeyE'], { wx: B.x + 6, wy: B.y - 5 }); G.simTick(DT); t += DT; }
  check(A.health === 'hurt' && near(t, G.TREAT_TIME), `E next to a downed crewmate treats them (${t.toFixed(2)} s)`); }

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
