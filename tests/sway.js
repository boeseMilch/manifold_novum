// Hitting an engine must not make an enemy jump: position and velocity stay continuous
// while the sway shrinks to its new pattern. Run: node tests/sway.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'combat', 'combatClear', 'combatSpawn', 'hitPoi', 'enemyToWorld']);
const DT = 1 / 60;
let failed = 0;
for (const [kind, part] of [['interceptor', 'cooling'], ['frigate', 'aux'], ['frigate', 'main']]) {
  G.combatClear(); G.combatSpawn(kind, 'port');
  const e = G.combat.enemies[0];
  let px = e.x, py = e.y, pvx = 0, pvy = 0, maxStep = 0, maxDv = 0, maxDvBefore = 0;
  for (let i = 0; i < 60 * 12; i++) {
    if (i === 60 * 5) G.hitPoi(e, e.pois.find(p => p.id === part), e.x, e.y);
    G.tick(DT);
    const vx = (e.x - px) / DT, vy = (e.y - py) / DT;
    const dv = Math.hypot(vx - pvx, vy - pvy);
    if (i > 2) { if (i < 60 * 5) maxDvBefore = Math.max(maxDvBefore, dv); else maxDv = Math.max(maxDv, dv); }
    if (i > 2) maxStep = Math.max(maxStep, Math.hypot(e.x - px, e.y - py));   // skip the spawn frame
    px = e.x; py = e.y; pvx = vx; pvy = vy;
  }
  // no position jump (a teleport would move units in one frame) and no velocity kink
  // (velocity may change at most 0.3 units/s per frame, i.e. a gentle acceleration)
  const ok = maxStep < 0.15 && maxDv < 0.3;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${kind} ${part}: max move/frame ${maxStep.toFixed(3)}, max Δv/frame after hit ${maxDv.toFixed(3)} (before: ${maxDvBefore.toFixed(3)})`);
}
process.exitCode = failed ? 1 : 0;
