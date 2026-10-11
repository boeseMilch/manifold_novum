// Intruder routine (adjacent room → sabotage a part for 10 s → next room), engaging when the
// crew comes close (strafes, no sabotage while fighting), plus luck from petting the cat and
// the front shield. Run: node tests/intruder.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'boarding', 'spawnInvader', 'SYSTEMS', 'roomAt', 'adjacentRooms', 'ROOMS', 'SABOTAGE_TIME',
  'luck', 'lucky', 'petCat', 'clickTarget', 'CAT', 'smallHit', 'fires', 'combat', 'pressShield', 'CAPACITORS', 'makeAsteroid',
  'shieldYFront', 'combatClear'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// routine: rooms visited are always adjacent, and parts get sabotaged after ~10 s of work
{
  const G = loadGame(NAMES); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  G.player.mode = 'eva'; G.player.x = -2.5; G.player.y = 10;   // outside the ship: nobody to fight
  let room = null, hops = 0, badHop = 0, firstBreak = null, workT = 0;
  for (let i = 0; i < 60 * 200; i++) {
    G.tick(DT);
    if (a.task?.kind === 'sabotage') workT = a.task.t;
    if (firstBreak === null && G.SYSTEMS.some(s => s.broken)) firstBreak = { t: i * DT, work: workT };
    const r = G.roomAt(a.x, a.y);
    if (r && r !== room) { if (room && !G.adjacentRooms(room).includes(r)) badHop++; if (room) hops++; room = r; }
    G.SYSTEMS.forEach(s => { s.broken = false; });                // keep giving it things to break
  }
  check(hops >= 4 && badHop === 0, `it moves room to room, always to an adjacent room (${hops} hops, ${badHop} non-adjacent)`);
  check(firstBreak && Math.abs(firstBreak.work - G.SABOTAGE_TIME) < 0.2, `it breaks a part after working on it for ${G.SABOTAGE_TIME} s (first break at T+${firstBreak?.t.toFixed(0)} s)`);
}
// engaging: come close and it fights (strafes, stops sabotaging)
{
  const G = loadGame(NAMES); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  G.player.x = 37; G.player.y = 7;
  for (let i = 0; i < 60 * 60 && a.task?.kind !== 'sabotage'; i++) G.tick(DT);
  check(a.task?.kind === 'sabotage', `it gets to work on a part (${a.task?.sys?.name})`);
  const target = a.task.sys;
  // walk up to it (closest free spot in view)
  G.player.x = a.x + 3; G.player.y = a.y;
  for (let k = 0; k < 16; k++) {
    const x = a.x + Math.cos(k / 16 * Math.PI * 2) * 3.5, y = a.y + Math.sin(k / 16 * Math.PI * 2) * 3.5;
    if (G.roomAt(x, y)) { G.player.x = x; G.player.y = y; break; }
  }
  for (let i = 0; i < 30; i++) G.tick(DT);
  check(a.state === 'fight' && !a.task, 'when you come close it engages and drops the sabotage');
  let side = 0; const x0 = a.x, y0 = a.y;
  for (let i = 0; i < 60 * 3; i++) { G.tick(DT); side += Math.abs((a.x - x0) * (G.player.y - a.y) - (a.y - y0) * (G.player.x - a.x)); }
  check(side > 0 && !target.broken, 'while fighting it moves around (strafing) and the part stays intact');
}
// telegraphed moves: spit windup, pounce hits, no dodging right after a lunge
{
  const G = loadGame([...NAMES, 'hurtInvader', 'SPIT_WINDUP']); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  for (let i = 0; i < 120; i++) G.tick(DT);
  a.x = 18.5; a.y = 9; a.path = []; a.task = null; G.player.x = 24.5; G.player.y = 9.5; G.player.mode = 'inside';
  G.hurtInvader(a, 0); a.hp = 100; a.spitT = 0;
  let windup = null, firedAt = null;
  for (let i = 0; i < 60 * 3 && firedAt === null; i++) {
    G.tick(DT);
    if (a.act?.kind === 'spit' && windup === null) windup = i;
    if (windup !== null && G.boarding.bolts.some(b => b.owner === 'alien')) firedAt = i;
  }
  check(windup !== null && firedAt !== null && Math.abs((firedAt - windup) * DT - G.SPIT_WINDUP) < 0.05, `the spit comes ${((firedAt - windup) * DT).toFixed(2)} s after the windup starts (head pulled back first)`);
  // pounce: stand close and wait
  G.boarding.bolts.length = 0; a.act = null; a.spitT = 0; a.x = 20; a.y = 9; G.player.x = 22; G.player.y = 9;
  const crew0 = G.combat.hits.crew; let pounced = false;
  for (let i = 0; i < 60 * 4 && G.combat.hits.crew === crew0; i++) { G.tick(DT); if (a.act?.kind === 'pounce') pounced = true; G.player.x = 22; G.player.y = 9; }
  check(pounced && G.combat.hits.crew > crew0, 'up close it coils and pounces, and the pounce hurts');
  // after a lunge it can't dodge again right away
  a.act = { kind: 'lunge', t: 0, dir: [0, 1] }; a.dodgeCd = 2.2;
  for (let i = 0; i < 20; i++) G.tick(DT);
  const dx = a.x - G.player.x, dy = a.y - G.player.y, d = Math.hypot(dx, dy);
  G.boarding.bolts.push({ x: G.player.x, y: G.player.y, vx: dx / d * 26, vy: dy / d * 26, life: 0.9, owner: 'crew' });
  const hp = a.hp; for (let i = 0; i < 30; i++) G.tick(DT);
  check(a.hp < hp, 'right after a lunge it is off balance: a quick follow-up shot hits');
}
// luck: petting the cat
{
  const G = loadGame(NAMES);
  G.player.x = G.CAT.x - 1; G.player.y = G.CAT.y + 0.8;
  const t = G.clickTarget(G.CAT.x, G.CAT.y);
  check(t?.ok && t.text === 'Click: pet the cat', `you can click the cat, with no hint about what it does ("${t?.text}")`);
  t.run();
  check(G.lucky() && Math.abs(G.luck.t - 60) < 0.1, 'petting it secretly makes you lucky for 60 s');
  let nothing = 0;
  for (let i = 0; i < 400; i++) { G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); G.smallHit('port', -0.2, 8); if (!G.fires.length && !G.SYSTEMS.some(s => s.broken)) nothing++; }
  check(nothing > 260, `while lucky, about 3 in 4 small hits do nothing (${nothing}/400)`);
  for (let i = 0; i < 60 * 61; i++) G.tick(DT);
  check(!G.lucky(), 'luck wears off after a minute');
}
// front shield: eats asteroids
{
  const G = loadGame(NAMES); G.combatClear(); G.CAPACITORS[1].charge = 1;
  const a = G.makeAsteroid(22.2, -9, true, 0, 4); a.vr = 0; G.combat.asteroids.push(a);
  for (let i = 0; i < 20; i++) G.tick(DT);
  check(G.pressShield('front') === true && G.CAPACITORS[1].charge === 0, 'the front shield button raises the front shield (1 energy, middle capacitor)');
  const hitsBefore = G.combat.hits.large;
  for (let i = 0; i < 60 * 2; i++) G.tick(DT);
  check(!G.combat.asteroids.includes(a) && G.combat.hits.large === hitsBefore, 'an asteroid running into the raised front shield is absorbed (no hit)');
}
process.exitCode = failed ? 1 : 0;
