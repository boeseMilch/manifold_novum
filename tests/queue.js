// Two enemies on the same side (every pair of kinds, both sides): they queue up without overlapping; the front one is fully hittable;
// once it's defeated, the one behind moves up and becomes fully hittable too.
const { loadGame } = require('./harness');
const G = loadGame(['evs', 'tick','player','combat','combatClear','combatSpawn','teleportToGun','ENEMY_TYPES','enemyToWorld','SHELL_SPEED','fireCannon','CAPACITORS','CAP_MAX','SYSTEMS','mission','hitPoi']);
for (const k in G.ENEMY_TYPES) G.ENEMY_TYPES[k].wear = Infinity;
const DT = 1/60, KINDS = ['interceptor', 'frigate', 'grappler', 'mother', 'tractor'];
function aim(g, target, vel) { let [tx,ty]=target; for (let i=0;i<4;i++){ const tt=Math.hypot(tx-g.x,ty-g.y)/G.SHELL_SPEED; tx=target[0]+vel[0]*tt; ty=target[1]+vel[1]*tt; } g.aim=Math.atan2(ty-g.y,tx-g.x); }
const near = (p) => { const s = p.shape; if (s.circle) return [s.circle[0] + s.circle[2] * 0.6, s.circle[1]]; const pts = s.line || s.poly; return [Math.max(...pts.map(q => q[0])) - 0.06, p.c[1]]; };
const overlaps = () => { const [p, q] = G.combat.enemies.filter(e => e.phase === 'fighting' && !e.D.backdrop);   // (the spore mother is a backdrop: others fly in front of it)
  return q && Math.abs(p.x - q.x) < (p.D.size[0] + q.D.size[0]) * 0.85 && Math.abs(p.y - q.y) < (p.D.size[1] + q.D.size[1]) * 0.85; };
function shoot(e, part, limit) {
  G.player.health = 'ok'; G.teleportToGun(e.side); const g = G.player.gun; let prev = null;
  for (let t = 0; t < limit; t += DT) {
    for (const x of G.combat.enemies) { x.shieldT = 3; if (x.kind === 'mother') { x.open = 1; x.openSac = x === e ? x.pois.indexOf(part) : 0; } }
    const pt = G.enemyToWorld(e, ...near(part)), vel = prev ? [(pt[0]-prev[0])/DT, (pt[1]-prev[1])/DT] : [0,0]; prev = pt; aim(g, pt, vel);
    G.evs.spores.length = 0;                               // (spore clouds in the line of fire would eat the shots)
    G.player.health = 'ok'; G.tick(DT); if (overlaps()) return 'overlap'; if (G.player.mode !== 'gun') G.teleportToGun(e.side);
    if (g.cd <= 0) { G.CAPACITORS.forEach(c => { c.charge = G.CAP_MAX; }); G.SYSTEMS.forEach(s => { s.broken = false; }); g.shots = 3; g.reload = 0; G.fireCannon(g); }
    if (part.hit) { part.hit = false; return t; }
    for (const x of G.combat.enemies) for (const p of x.pois) if (p.hit) p.hit = false;
  }
  return null;
}
let bad = 0;
const MISSLOG = [];
for (const a of KINDS) for (const b of KINDS) for (const side of ['port', 'star']) {
  if (a === 'mother' && b === 'mother') continue;          // (only one giant per side: a second one goes to the other side)
  G.combatClear(); G.mission.active = false; G.combatSpawn(a, side); G.combatSpawn(b, side); G.teleportToGun(side);
  let [A, B] = G.combat.enemies;
  if (A.D.backdrop) [A, B] = [B, A];                     // a backdrop (the spore mother) is always behind the other one
  for (const p of A.pois) { const r = shoot(A, p, 10); if (typeof r !== 'number') { bad++; console.log(`FAIL  ${r || 'MISS'}  ${a} (front) + ${b}, ${side}: ${p.name}`); } }
  for (const p of A.pois) G.hitPoi(A, p, A.x, A.y);                          // the front one goes down…
  for (let i = 0; i < 60 * 20; i++) G.tick(DT);                              // …and the other moves up
  for (const p of B.pois) { const r = shoot(B, p, 10); if (typeof r !== 'number') { bad++; console.log(`FAIL  ${r || 'MISS'}  ${b} (moved up after ${a}), ${side}: ${p.name}`); } }
}
console.log(bad ? `FAIL  ${bad} problems with two enemies on one side` : 'ok    two enemies on one side: they queue without overlapping, the front one is hittable, the next one moves up and is hittable');
process.exitCode = bad ? 1 : 0;

// Run: node tests/queue.js
