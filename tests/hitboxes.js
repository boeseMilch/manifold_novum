// Hitboxes (the user, 2026-11-01: "increase the hitboxes for most stuff by like 10%"): what the crew shoots at is
// HIT_GROW (js/combat.js) bigger to hit than drawn: a shell just outside a weak spot's / an asteroid's old edge, or a
// laser bolt just past an intruder's old body, now hits; a little further out still misses. What enemies shoot at
// (the crew) keeps its exact size. Run: node tests/hitboxes.js
const { loadGame } = require('./harness');
const NAMES = ['HIT_GROW', 'PAD_HIT_GROW', 'GUNS', 'fireCannon', 'netServer', 'crew', 'POI_TOLERANCE', 'combat', 'boarding', 'player', 'makeEnemy', 'enemyToWorld', 'shapeDist', 'shellHitsEnemy',
  'makeAsteroid', 'updateCombat', 'updateBoarding', 'SHELL_SPEED', 'ALIEN_HIT', 'freeAt', 'ROOM_RECTS', 'canStand', 'walkRects'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

{
  const G = loadGame(NAMES);
  check(G.HIT_GROW > 1.05 && G.HIT_GROW < 1.15, `HIT_GROW is about 10% (${G.HIT_GROW})`);
}

// a weak spot: the interceptor's engine cooling (a box from x 2.02 to 2.3, local), a shell coming in from our side
{
  const tryAt = (lx) => {
    const G = loadGame(NAMES), e = G.makeEnemy('interceptor', 'port'), p = e.pois.find(p => p.id === 'cooling');
    e.rot = 0; e.x = e.ax; e.y = 10;
    const [x0, y0] = G.enemyToWorld(e, lx + 0.1, 0.8), [x1, y1] = G.enemyToWorld(e, lx, 0.8);
    const stopped = G.shellHitsEnemy(e, x0, y0, x1, y1);
    return { stopped, hit: p.hit, old: G.shapeDist(p.shape, lx, 0.8) <= G.POI_TOLERANCE };
  };
  const near = tryAt(2.3 + G0().POI_TOLERANCE + 0.012), far = tryAt(2.3 + 0.14 * (G0().HIT_GROW - 1) + G0().POI_TOLERANCE + 0.015);
  check(!near.old && near.hit && near.stopped, `a shell just past the engine cooling's old edge now knocks it out (was a miss: ${!near.old})`);
  check(!far.hit && !far.stopped, 'a little further out it still flies past');
}
function G0() { return G0.g ||= loadGame(NAMES); }

// an asteroid: a shell flying past a small rock between its old (1.05 r) and new reach hits it; further out it misses
{
  const pass = (k) => {
    const G = loadGame(NAMES), a = G.makeAsteroid(-25, 10, false, 0, 0);
    a.vr = 0; G.combat.asteroids.push(a);
    G.combat.shells.push({ x: a.x + a.r * k, y: 6, vx: 0, vy: G.SHELL_SPEED, life: 1 });
    for (let i = 0; i < 20; i++) G.updateCombat(DT);
    return a.dead;
  };
  check(pass(1.05 * 1.05), 'a shell just outside a small asteroid\'s old reach (1.05 r) now smashes it');
  check(!pass(1.05 * G0().HIT_GROW * 1.04), 'a little further out it still misses');
}

// an intruder: a laser bolt passing just below its feet (old reach ALIEN_HIT.r) now hits it; enemy spit at the crew doesn't grow
{
  const setup = () => {
    const G = loadGame(NAMES), rects = G.walkRects();
    let spot = null;                                  // somewhere with 4 units of open floor in a row
    for (const q of G.ROOM_RECTS) for (let x = q.x + 0.5; !spot && x < q.x + q.w - 4.5; x += 0.25) for (let y = q.y + 0.6; !spot && y < q.y + q.h - 0.8; y += 0.25) {
      let ok = true;
      for (let s = 0; ok && s <= 4; s += 0.05) for (const dy of [0, 0.5]) if (!G.freeAt(x + s, y + dy) || !G.canStand(x + s, y + dy, rects)) ok = false;
      if (ok) spot = { x, y };
    }
    return { G, spot };
  };
  const shoot = (d, pad = false) => {
    const { G, spot } = setup();
    G.boarding.invaders.push({ uid: 1, kind: 'alien', x: spot.x + 3, y: spot.y, vx: 0, vy: 0, face: Math.PI, walk: 0, mode: 'inside', state: 'fight', hp: 3, path: [],
      linger: 0, stuck: 0, spitT: 99, act: null, dodgeCd: 99, strafe: 1, stun: 99, seen: 0, flash: 0, touchCd: 0 });
    const a = G.boarding.invaders[0];
    G.boarding.bolts.push({ x: spot.x, y: spot.y + d, z: 0, ox: spot.x, oy: spot.y + d, vx: 26, vy: 0, life: 0.3, owner: 'crew', pad });
    for (let i = 0; i < 30 && G.boarding.bolts.length; i++) G.updateBoarding(DT);
    return a.hp < 3;
  };
  const r = G0().ALIEN_HIT.r, g = G0().HIT_GROW;
  check(shoot(r * (1 + (g - 1) / 2)), `a bolt passing ${(r * (1 + (g - 1) / 2)).toFixed(3)} from an intruder's feet (old reach ${r}) now hits it`);
  check(!shoot(r * g + 0.03), 'a little further out it misses');
  // a controller player's shot: another PAD_HIT_GROW (the user: "especially of pirates" — boltHitsBody covers pirates too)
  const pg = G0().PAD_HIT_GROW, between = r * g * (1 + (pg - 1) / 2);
  check(pg > 1.03 && pg < 1.07 && shoot(between, true) && !shoot(between, false), `a controller player's bolt ${between.toFixed(3)} from it hits, a mouse player's misses (PAD_HIT_GROW ${pg})`);
  check(!shoot(r * g * pg + 0.03, true), 'and a little further out a controller player misses too');

  const spit = (d) => {
    const { G, spot } = setup(), p = G.player;
    p.x = spot.x + 3; p.y = spot.y; p.mode = 'inside'; p.health = 'ok';
    const hits = G.combat.hits.crew;
    G.boarding.bolts.push({ x: spot.x, y: spot.y + d, vx: 11.5, vy: 0, life: 0.6, owner: 'alien' });
    for (let i = 0; i < 40 && G.boarding.bolts.length; i++) G.updateBoarding(DT);
    return G.combat.hits.crew > hits;
  };
  check(spit(0.34), 'an alien\'s spit 0.34 from you still hits (crew reach 0.35)');
  check(!spit(0.36), 'and 0.36 from you it still misses: the crew didn\'t get bigger');
}


// the flag: a cannon shot / a bolt carries its shooter's `pad` (input.pad: js/gamepad.js locally, the input message on the server)
{
  const G = loadGame(NAMES), g = G.GUNS[0];
  Object.assign(g, { shots: 3, reload: 0, cd: 0 });
  G.player.input.pad = true; G.fireCannon(g);
  const padShell = G.combat.shells.at(-1)?.pad;
  Object.assign(g, { shots: 3, reload: 0, cd: 0 }); G.player.input.pad = false; G.fireCannon(g);
  check(padShell === true && G.combat.shells.at(-1)?.pad === false, 'a cannon shell remembers whether a controller fired it');
  G.netServer.input(G.player.id, { keys: [], pressed: [], pad: true });
  check(G.player.input.pad === true, 'the server takes `pad` from a browser\'s input');
  G.netServer.input(G.player.id, { keys: [], pressed: [] });
  check(G.player.input.pad === false, '... and drops it when the browser stops sending it');
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
