// Hand weapons and getting shot: shots leave the held weapon's muzzle, a thrown wrench does 1 damage
// (and stuns), an enemy ship's shot in the body puts a crew member straight out. Run: node tests/handweapons.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'crew', 'boarding', 'spawnInvader', 'attack', 'muzzleAt', 'hurtInvader', 'combat', 'crewHit',
  'hurtCrew', 'standing', 'enemyFire', 'mission', 'boltDamage', 'boltStun', 'localInput', 'handSight'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// shots start at the muzzle of the gun in the right hand, at its height
for (const w of ['laser', 'heavy', 'repair']) {
  const G = loadGame(NAMES); const p = G.player;
  p.x = 22; p.y = 8; p.inv.weapon = w; p.inv.cd = 0;
  for (const a of [0, Math.PI / 2, -2.5]) {
    p.inv.cd = 0; G.boarding.bolts.length = 0;
    G.attack(a);
    const b = G.boarding.bolts[0], m = G.muzzleAt(p, a);
    const fwd = (b.x - p.x) * Math.cos(a) + (b.y - p.y) * Math.sin(a), right = -(b.x - p.x) * Math.sin(a) + (b.y - p.y) * Math.cos(a);
    check(b && Math.hypot(b.x - m.x, b.y - m.y) < 1e-9 && b.z > 0.1 && right > 0.15 && fwd > (w === 'repair' ? 0 : 0.35),
      `${w} at ${a.toFixed(1)}: the shot leaves the muzzle in the right hand (${fwd.toFixed(2)} ahead, ${right.toFixed(2)} right, z ${b.z.toFixed(2)})`);
  }
}
// a thrown wrench: 1 damage and a stun (was 3); laser 1, heavy shots their own
{
  const G = loadGame(NAMES), w = { owner: 'crew', wrench: true };
  check(G.boltDamage(w) === 1 && G.boltStun(w) > 0, `a thrown wrench does 1 damage and stuns (${G.boltDamage(w)}, stun ${G.boltStun(w)} s)`);
  check(G.boltDamage({ owner: 'crew' }) === 1 && G.boltDamage({ owner: 'crew', dmg: 3 }) === 3, 'a laser bolt 1, a charged blast 3');
}
// an enemy ship's shot in the body: straight out, whatever the health before (the vest still takes one step)
{
  const G = loadGame(NAMES); const c = G.player; G.mission.over = null;
  c.mode = 'eva'; c.health = 'ok'; c.armor = 0;
  G.crewHit('port', c);
  check(c.health === 'out', `a ship's shot in the body puts you out at once (${c.health})`);
  c.health = 'ok'; c.armor = 1;
  G.crewHit('port', c);
  check(c.health === 'down' && c.armor === 0, `with an armor vest: down, the vest used up (${c.health})`);
  c.health = 'ok'; G.hurtCrew(c);
  check(c.health === 'hurt', 'other hits still hurt one step');
}
// someone on a spacewalk in the way of a shot at the hull catches it
{
  const G = loadGame(NAMES); const c = G.player;
  c.mode = 'eva'; c.health = 'ok'; c.armor = 0; c.x = -1.5; c.y = 10;
  G.combat.shots.length = 0;
  G.combat.shots.push({ x: -12, y: 10, vx: 20, vy: 0, heavy: false, side: 'port', atCrew: false, tx: 0.2, ty: 10, life: 3 });
  for (let i = 0; i < 60 && G.combat.shots.length; i++) G.tick(DT);
  check(c.health === 'out', `a spacewalker in the line of fire takes the shot meant for the hull (${c.health})`);
}

// a controller's right stick aims: the laser sight (js/combat.js handSight) starts at the muzzle and points where the
// shot goes. Standing: the very same origin and angle; walking with the left stick and turning the right one every
// tick, firing now and then: every shot flies along the sight shown when it was pressed (the origin a step of
// walking along at most)
for (const w of ['laser', 'heavy', 'repair']) {
  const G = loadGame(NAMES), p = G.player, L = G.localInput, wd = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  p.x = 22; p.y = 8; p.inv.weapon = w;
  L.stick = { aim: [-0.4, 0.9], walk: null };
  G.tick(DT); p.inv.cd = 0; G.boarding.bolts.length = 0;
  const h0 = G.handSight(); L.pressed.add('Space'); G.tick(DT);
  const b0 = G.boarding.bolts.find(b => b.owner === 'crew'), o0 = b0 && [b0.x - b0.vx * DT, b0.y - b0.vy * DT];   // (it flew one step this tick)
  check(h0 && b0 && Math.hypot(o0[0] - h0.x, o0[1] - h0.y) < 1e-9 && wd(Math.atan2(b0.vy, b0.vx), h0.a) < 1e-12 && Math.abs(b0.z - h0.z) < 1e-12,
    `${w}, standing: the sight starts at the shot's muzzle, at its height, the shot's way (${h0 && b0 ? `z ${h0.z.toFixed(2)}, ${(h0.a * 180 / Math.PI).toFixed(1)}°` : 'no sight / no shot'})`);
  let shots = 0, worstA = 0, worstD = 0, worstO = 0, missing = 0;
  for (let i = 0; i < 300; i++) {
    const a = 2 * Math.sin(i * 0.05) + i * 0.013;
    L.stick = { aim: [Math.cos(a), Math.sin(a)], walk: [Math.cos(i * 0.02), Math.sin(i * 0.02)] };
    let h = null;
    if (i % 25 === 0) { p.inv.cd = 0; G.boarding.bolts.length = 0; h = G.handSight(); if (h) L.pressed.add('Space'); }
    const x0 = p.x, y0 = p.y;
    G.tick(DT);
    if (!h) continue;
    const b = G.boarding.bolts.find(b => b.owner === 'crew');
    if (!b) { if (!(h.wall && h.len < 1)) missing++; continue; }   // (a wall right ahead: it hit it within the tick)
    shots++;
    const ba = Math.atan2(b.vy, b.vx), ox = b.x - b.vx * DT, oy = b.y - b.vy * DT;   // (it flew one step this tick)
    worstA = Math.max(worstA, wd(ba, h.a));
    const m = G.muzzleAt(p, h.a);                       // (the muzzle where you stand after this tick's step: exactly there)
    worstO = Math.max(worstO, Math.hypot(ox - m.x, oy - m.y));
    worstD = Math.max(worstD, Math.abs(-(ox - h.x) * Math.sin(h.a) + (oy - h.y) * Math.cos(h.a)) - Math.hypot(p.x - x0, p.y - y0));   // (off the sight's line by more than that step)
  }
  check(shots >= 8 && !missing && worstA < 0.002 && worstD < 1e-9 && worstO < 1e-9, `${w}, walking and turning: ${shots} shots, each down the sight at its press (worst ${(worstA * 180 / Math.PI).toFixed(4)}°; off its line by no more than the step walked that tick${missing ? `, ${missing} sights without a shot` : ''})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
