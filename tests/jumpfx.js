// The jump animation: the drive's wind-up builds before the jump; jumping out plays JUMP_OUT s of
// animation before the end screen shows, without changing the mission's result; on a loss the ship breaks up
// (BREAKUP_T s, js/breakup.js) before the end screen;
// without energy the wind-up loops: charges, sputters out, tries again.
// Run: node tests/jumpfx.js
const { loadGame } = require('./harness');
const NAMES = ['power', 'mission', 'startMission', 'tick', 'CAPACITORS', 'combat', 'enemyFire', 'jumpCharge', 'jumpOutT', 'endScreenReady',
  'JUMP_OUT', 'SYSTEMS', 'jumpStall', 'MAX_DAMAGE', 'BREAKUP_T'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const calm = (G) => { G.combat.shots.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); };

// --- jumping out: wind-up, then the animation, then the end screen with the same result
{
  const G = loadGame(NAMES); G.startMission(); G.mission.objective = null;   // (no objective to fail)
  const m = G.mission;
  m.t = m.jumpAt - 12; G.CAPACITORS[1].charge = 0;
  G.tick(DT);
  const k0 = G.jumpCharge();
  while (m.t < m.jumpAt - 1) { calm(G); G.tick(DT); }
  const k1 = G.jumpCharge();
  check(k0 === 0 && k1 > 0.3, `the drive's wind-up builds in the last seconds before the jump (${k0.toFixed(2)} → ${k1.toFixed(2)})`);
  while (!m.jump) { calm(G); G.tick(DT); }
  for (let i = 0; i < 60; i++) { calm(G); G.tick(DT); }
  check(!m.over && G.jumpCharge() > k1, `spooling without energy, it keeps building (${G.jumpCharge().toFixed(2)})`);
  G.CAPACITORS[1].charge = 1;
  while (!m.over) { calm(G); G.tick(DT); }
  const result = JSON.stringify(m.over);
  check(m.over.survived && m.over.won && m.over.at != null, 'with energy in MID it jumps out (won)');
  check(!G.endScreenReady() && G.jumpOutT() < G.JUMP_OUT && G.jumpCharge() === 1, 'right after the jump: the animation plays, no end screen yet');
  const hits = JSON.stringify(G.combat.hits);
  G.enemyFire({ side: 'port', D: { shotSpeed: 20 } }, -20, 10, false, { atCrew: false, tx: 0, ty: 10 });
  check(G.combat.shots.length === 0, 'nobody shoots at the ship while it jumps away');
  let t = 0; while (!G.endScreenReady() && t < 5) { G.tick(DT); t += DT; }
  check(G.endScreenReady() && Math.abs(t - G.JUMP_OUT) < 0.1, `the end screen comes after the animation (${t.toFixed(2)} s)`);
  check(JSON.stringify(m.over) === result && JSON.stringify(G.combat.hits) === hits, 'the mission result is unchanged by the animation');
  check(G.jumpCharge() === 0, 'after the jump the drive is quiet again');
}

// --- stalled (no energy in MID): the wind-up loops (charge → sputter → dead → again), no jump-out animation
{
  const G = loadGame(NAMES); G.startMission(); G.mission.objective = null;   // (no objective to fail)
  const m = G.mission;
  G.power.reactor.fuel = 0; G.power.reserve = 0; G.power.bolts.length = 0;   // (no energy on its way either: a fast reactor would land one in MID)
  G.CAPACITORS[1].charge = 0; m.t = m.jumpAt - 0.5;
  const seq = []; let t = 0;
  while (t < 20) { calm(G); G.CAPACITORS[1].charge = 0; G.tick(DT); t += DT; const s = G.jumpStall(); if (s && seq[seq.length - 1]?.phase !== s.phase) seq.push({ phase: s.phase, k: s.k }); }
  const cycles = seq.filter(s => s.phase === 'sputter').length, order = seq.map(s => s.phase[0]).join('');
  check(!m.over && cycles >= 4 && /^(csd)+c?s?d?$/.test(order) && G.jumpOutT() === Infinity, `stalled: the wind-up loops (${order}, ${cycles} sputters in 20 s), no jump-out animation`);
  let lo = 1, hi = 0;
  for (let i = 0; i < 60 * 5; i++) { calm(G); G.CAPACITORS[1].charge = 0; G.tick(DT); const k = G.jumpCharge(); lo = Math.min(lo, k); hi = Math.max(hi, k); }
  check(hi > 0.7 && hi < 0.85 && lo < 0.2, `it charges to ${hi.toFixed(2)}, then dies down to ${lo.toFixed(2)}`);
  G.CAPACITORS[1].charge = 1; G.tick(DT);
  check(m.over?.survived && G.jumpOutT() < G.JUMP_OUT && G.jumpCharge() === 1, 'energy arrives: it jumps, with the jump-out animation');
}
// --- lost (the ship falls apart): no jump animation, the end screen straight away
{
  const G = loadGame(NAMES); G.startMission(); G.mission.objective = null;   // (no objective to fail)
  const m = G.mission;
  G.CAPACITORS[1].charge = 0; m.t = m.jumpAt + 5; G.tick(DT);
  G.SYSTEMS.slice(0, G.MAX_DAMAGE + 1).forEach(s => { s.broken = true; }); G.tick(DT);
  check(m.over && !m.over.survived && m.over.breakup && !G.endScreenReady() && G.jumpOutT() === Infinity && G.jumpCharge() === 0, 'lost: no jump animation; the ship breaks up first (no end screen yet)');
  let n = 0; while (!G.endScreenReady() && n < 60 * 10) { G.tick(DT); n++; }
  check(Math.abs(n * DT - G.BREAKUP_T) < 0.2 && !m.over.survived, `…then the end screen, after the break-up (${(n * DT).toFixed(2)} s)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exitCode = failed ? 1 : 0;
