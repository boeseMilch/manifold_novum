// The jump animation: the drive's wind-up builds before the jump; jumping out plays JUMP_OUT s of
// animation before the end screen shows, without changing the mission's result; no animation on a loss.
// Run: node tests/jumpfx.js
const { loadGame } = require('./harness');
const NAMES = ['mission', 'startMission', 'tick', 'CAPACITORS', 'combat', 'enemyFire', 'jumpCharge', 'jumpOutT', 'endScreenReady',
  'JUMP_OUT', 'JUMP_WINDOW', 'SYSTEMS'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const calm = (G) => { G.combat.shots.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); };

// --- jumping out: wind-up, then the animation, then the end screen with the same result
{
  const G = loadGame(NAMES); G.startMission();
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

// --- stranded (no energy in time): no jump animation, the end screen straight away
{
  const G = loadGame(NAMES); G.startMission();
  const m = G.mission;
  G.CAPACITORS[1].charge = 0; m.t = m.jumpAt - 0.5;
  let t = 0; while (!m.over && t < G.JUMP_WINDOW + 5) { calm(G); G.CAPACITORS[1].charge = 0; G.tick(DT); t += DT; }
  check(m.over && !m.over.survived && G.endScreenReady() && G.jumpOutT() === Infinity && G.jumpCharge() === 0, 'lost: no jump animation, the end screen right away');
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exitCode = failed ? 1 : 0;
