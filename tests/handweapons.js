// Hand weapons and getting shot: shots leave the held weapon's muzzle, a thrown wrench does 1 damage
// (and stuns), an enemy ship's shot in the body puts a crew member straight out. Run: node tests/handweapons.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'crew', 'boarding', 'spawnInvader', 'attack', 'muzzleAt', 'hurtInvader', 'combat', 'crewHit',
  'hurtCrew', 'standing', 'enemyFire', 'mission', 'boltDamage', 'boltStun'];
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

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
