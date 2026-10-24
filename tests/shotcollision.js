// Shots stop where walking stops: walls, closed doors and solid props (crates, consoles, furniture) stop every shot
// inside the ship, ours and the enemies' alike, with an impact where they hit; open doorways let them through; a fast
// shot can't skip through a thin solid. Run: node tests/shotcollision.js
const { loadGame } = require('./harness');
const NAMES = ['player', 'crew', 'boarding', 'attack', 'muzzleAt', 'combat', 'updateBoarding', 'freeAt', 'shotBlock', 'canStand',
  'walkRects', 'SOLIDS', 'CLUTTER', 'clutterRect', 'FURNITURE', 'DOORWAYS', 'SPINE_Y1', 'CREW_R', 'ROOM_RECTS', 'inRect'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const fly = (G, n = 40) => { for (let i = 0; i < n && G.boarding.bolts.length; i++) G.updateBoarding(DT); };
const sparks = (G) => G.combat.fx.length;

// the same geometry as walking: wherever you can stand, a shot flies; every solid's middle stops shots
{
  const G = loadGame(NAMES), rects = G.walkRects();
  check(G.SOLIDS.every(S => !G.freeAt(S.x + S.w / 2, S.y + S.h / 2)), `the middle of every solid (${G.SOLIDS.length}) stops shots`);
  let bad = 0, n = 0;
  for (const q of G.ROOM_RECTS) for (let x = q.x + 0.1; x < q.x + q.w; x += 0.37) for (let y = q.y + 0.1; y < q.y + q.h; y += 0.37)
    if (G.canStand(x, y, rects)) { n++; if (!G.freeAt(x, y)) bad++; }
  check(n > 500 && !bad, `every spot you can stand on (${n} tried) is free for shots (${bad} not)`);
}

// our laser at a crate: stops at its edge with sparks; the intruder behind it is safe
{
  const G = loadGame(NAMES), C = G.clutterRect(G.CLUTTER.fuel), y = G.CLUTTER.fuel.y;
  G.boarding.invaders.push({ uid: 1, kind: 'alien', x: C.x + C.w + 1.0, y, vx: 0, vy: 0, face: Math.PI, walk: 0, mode: 'inside', state: 'fight', hp: 3, path: [],
    linger: 0, stuck: 0, spitT: 99, act: null, dodgeCd: 99, strafe: 1, stun: 99, seen: 0, flash: 0, touchCd: 0 });
  const a = G.boarding.invaders[0], fx0 = sparks(G);
  G.boarding.bolts.push({ x: C.x - 1.5, y, z: 0.5, ox: C.x - 1.5, oy: y, vx: 26, vy: 0, life: 0.9, owner: 'crew' });
  let maxX = -1e9; for (let i = 0; i < 40 && G.boarding.bolts.length; i++) { G.updateBoarding(DT); for (const b of G.boarding.bolts) maxX = Math.max(maxX, b.x); }
  check(!G.boarding.bolts.length && a.hp === 3, `a laser bolt at the fuel crate stops there: the intruder behind it is unhurt (hp ${a.hp})`);
  check(maxX <= C.x + 1e-6 && sparks(G) > fx0, `it never got inside the crate (got to x ${maxX.toFixed(2)}, crate from ${C.x.toFixed(2)}), sparks where it hit`);
  // with the crate out of the way the same shot hits
  const G2 = loadGame(NAMES);
  G2.SOLIDS.splice(G2.SOLIDS.findIndex(S => G2.inRect(G.CLUTTER.fuel.x, y, S, 0)), 1);
  G2.boarding.invaders.push({ ...a, hp: 3 }); const a2 = G2.boarding.invaders[0];
  G2.boarding.bolts.push({ x: C.x - 1.5, y, z: 0.5, ox: C.x - 1.5, oy: y, vx: 26, vy: 0, life: 0.9, owner: 'crew' });
  fly(G2);
  check(a2.hp < 3, `without the crate the same shot hits the intruder (hp ${a2.hp})`);
}

// the enemies' shots too: an alien's spit at you behind a crate splashes on the crate
{
  const G = loadGame(NAMES), C = G.clutterRect(G.CLUTTER.fuel), y = G.CLUTTER.fuel.y, p = G.player;
  p.x = C.x + C.w + 0.6; p.y = y; p.health = 'ok'; p.mode = 'inside';
  const hits = G.combat.hits.crew;
  G.boarding.bolts.push({ x: C.x - 2, y, vx: 11.5, vy: 0, life: 1.2, owner: 'alien' });
  fly(G, 80);
  check(G.combat.hits.crew === hits && p.health === 'ok', `an alien's spit stops at the crate you hide behind (${p.health})`);
  G.boarding.bolts.push({ x: C.x - 2, y: y + 1.2, vx: 30, vy: 0, life: 0.5, owner: 'pirate', fast: true });
  p.y = y + 1.2; fly(G, 80);
  check(G.combat.hits.crew === hits + 1, 'beside the crate a pirate\'s shot gets you');
}

// doorways: open, a shot flies through; closed, it stops at the door
{
  for (const open of [1, 0]) {
    const G = loadGame(NAMES), d = G.DOORWAYS[0], y = d.y + d.h / 2;
    d.open = open;
    G.boarding.bolts.push({ x: d.x - 1.2, y, z: 0.5, ox: d.x - 1.2, oy: y, vx: 26, vy: 0, life: 0.9, owner: 'crew' });
    let maxX = -1e9; for (let i = 0; i < 10 && G.boarding.bolts.length; i++) { G.updateBoarding(DT); for (const b of G.boarding.bolts) maxX = Math.max(maxX, b.x); }
    if (open) check(maxX > d.x + d.w + 1, `an open doorway lets the shot through (on at x ${maxX.toFixed(2)})`);
    else check(!G.boarding.bolts.length && maxX <= d.x + 1e-6, `a closed door stops it (got to x ${maxX.toFixed(2)}, the door at ${d.x})`);
  }
}

// no tunnelling: a very fast shot doesn't skip over the toilet stall's thin wall (0.15 wide)
{
  const G = loadGame(NAMES), W = G.FURNITURE.stallWall, y = W.y + W.h / 2;
  check(G.shotBlock(W.x - 2, y, W.x + 2, y) >= 0, 'a 4 unit step across the stall wall is stopped');
  G.boarding.bolts.push({ x: W.x - 1, y, z: 0.5, vx: 600, vy: 0, life: 0.9, owner: 'crew' });
  G.updateBoarding(DT);
  check(!G.boarding.bolts.length, 'a shot crossing it in a single frame stops');
}

// firing with the muzzle poking into a crate (standing right at it): no shot flies through, it hits the crate
{
  const G = loadGame(NAMES), C = G.clutterRect(G.CLUTTER.fuel), p = G.player;
  p.x = C.x - G.CREW_R - 0.01; p.y = G.CLUTTER.fuel.y; p.mode = 'inside'; p.inv.weapon = 'laser'; p.inv.cd = 0;
  const fx0 = sparks(G);
  G.attack(0);
  check(!G.boarding.bolts.length && sparks(G) > fx0, 'point blank at a crate: the shot hits it at the muzzle, nothing comes out the other side');
  p.inv.cd = 0; G.attack(Math.PI);
  check(G.boarding.bolts.length === 1, 'turned away from it, the shot flies');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
