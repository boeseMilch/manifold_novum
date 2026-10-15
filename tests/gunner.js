// Going down in a cannon: the gunner slumps in the seat, below the rim (enemy shots fly over, no
// aiming or firing), can patch themselves up back into the seat, and a crewmate at the ladder pulls
// them out (next to the hatch, still down) to treat them or take the cannon. No softlocks: solo,
// out cold, multiplayer, disconnects. Run: node tests/gunner.js
const { loadGame } = require('./harness');
const NAMES = ['me', 'crew', 'GUNS', 'combat', 'hurtCrew', 'netServer', 'simTick', 'mission', 'standing', 'canStand', 'walkRects', 'REACH', 'pickEnemyTarget', 'SYSTEMS', 'enc'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.simTick(DT); };
const near = (c, x, y, r) => Math.hypot(c.x - x, c.y - y) <= r;
// a light enemy shot from far out on the gun's side, aimed at crew member c
const shootAt = (G, c, g) => {
  const dx = Math.cos(g.a), dy = Math.sin(g.a), x = c.x + dx * 12, y = c.y + dy * 12;
  G.combat.shots.push({ x, y, vx: -dx * 20, vy: -dy * 20, heavy: false, side: g.id === 'star' ? 'star' : 'port', atCrew: true, crewId: c.id, tx: c.x, ty: c.y, life: 2 });
};
const climbIn = (G, c, g, viaNet) => {
  c.mode = 'inside'; c.gun = null; c.x = g.hatch[0]; c.y = g.hatch[1] - 0.3; c.health = c.health || 'ok';
  if (viaNet) { G.netServer.input(c.id, { keys: [], pressed: [], mouse: { wx: g.hatch[0], wy: g.hatch[1], click: true } }); G.simTick(DT); G.netServer.input(c.id, { keys: [], pressed: [], mouse: {} }); }
  else { const m = c.input.mouse; m.wx = g.hatch[0]; m.wy = g.hatch[1]; m.click = true; G.simTick(DT); }
  G.simTick(DT);
};

// --- solo: shots fly over, no firing, patch yourself back into the seat
{
  const G = loadGame(NAMES); G.mission.active = false; const me = G.me, m = me.input.mouse, g = G.GUNS.find(g => g.id === 'port');
  climbIn(G, me, g);
  check(me.mode === 'gun' && me.gun === g, 'climbed into the left cannon');
  shootAt(G, me, g); tickN(G, 90);
  check(me.health === 'out' && me.mode === 'gun' && me.gun === g, 'a ship\'s shot in a standing gunner\'s body: out at once, slumped in the seat (not thrown off the cannon)');
  me.health = 'down';                                            // (from here on: down, to patch yourself up)
  check(me.health === 'down' && me.mode === 'gun' && me.gun === g, 'down: slumped in the seat');
  const x0 = me.x, y0 = me.y; shootAt(G, me, g); shootAt(G, me, g); tickN(G, 90);
  check(me.health === 'down', 'enemy shots aimed at the downed gunner fly over them (below the rim)');
  check(G.combat.shots.length === 0, '…and are gone afterwards (they hit the hull behind)');
  let targeted = false; for (let i = 0; i < 200; i++) if (G.pickEnemyTarget({ side: 'port' }).atCrew) targeted = true;
  check(!targeted, 'enemies no longer pick the downed gunner as a target');
  const aim0 = g.aim, shots = g.shots;
  m.wx = g.x - 3; m.wy = g.y + 4; m.moved = 1; m.down = true; me.input.keys.add('Space'); tickN(G, 30); me.input.keys.delete('Space');
  check(g.aim === aim0, 'down in the seat: the cannon doesn\'t aim');
  check(g.shots === shots, 'down in the seat: the cannon doesn\'t fire');
  check(me.x === x0 && me.y === y0 && me.mode === 'gun', 'down in the seat: you stay put (not pushed into the ship)');
  m.down = false; me.input.pressed.add('KeyE'); G.simTick(DT);
  check(me.mode === 'gun', 'E doesn\'t climb down while you\'re down');
  tickN(G, 30);                                                  // (let go long enough to lose the patching progress)
  check(/Down in the left cannon/.test(me.prompt?.text || ''), `the prompt says what's going on ("${me.prompt?.text}")`);
  let t = 0; m.down = true; m.wx = 30; m.wy = 30;                // holding click anywhere: patching yourself up
  while (me.health === 'down' && t < 15) { G.simTick(DT); t += DT; }
  check(me.health === 'hurt' && Math.abs(t - 10) < 0.3, `holding click patches you up in 10 s (${t.toFixed(1)} s)`);
  check(me.mode === 'gun' && me.gun === g, '…back in the seat');
  const s1 = g.shots; tickN(G, 20);
  check(g.shots === s1, 'the click you patched yourself up with doesn\'t fire');
  for (const sy of G.SYSTEMS) sy.broken = false; G.enc.flare = null;   // (no random breakdown in the way)
  m.down = false; G.simTick(DT); m.down = true; G.simTick(DT); m.down = false;
  check(g.shots === s1 - 1, 'a fresh click fires again');
}
// --- solo: out cold in a cannon is no softlock either
{
  const G = loadGame(NAMES); G.mission.active = false; const me = G.me, m = me.input.mouse, g = G.GUNS.find(g => g.id === 'front');
  climbIn(G, me, g); G.hurtCrew(me); G.hurtCrew(me); G.hurtCrew(me);
  check(me.health === 'out' && me.mode === 'gun', 'out cold in the front cannon');
  let t = 0; m.down = true;
  while (me.health === 'out' && t < 30) { G.simTick(DT); t += DT; }
  check(me.health === 'hurt' && me.mode === 'gun' && t < 25, `alone on the ship you still crawl back in the seat (${t.toFixed(0)} s)`);
}
// --- multiplayer: pulled out at the ladder, then treated, or the cannon taken
for (const id of ['port', 'front', 'star']) {
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob');
  const [A, B] = G.crew, g = G.GUNS.find(g => g.id === id), name = g.name.toLowerCase();
  climbIn(G, A, g, true);
  check(A.mode === 'gun' && A.gun === g, `${id}: Alice climbs into the ${name}`);
  B.x = g.hatch[0]; B.y = g.hatch[1] - 0.2; G.simTick(DT);
  check(new RegExp(`Alice is manning`).test(B.prompt?.text || ''), `${id}: the ladder says it's taken ("${B.prompt?.text}")`);
  G.netServer.input(2, { keys: [], pressed: [], mouse: { wx: g.hatch[0], wy: g.hatch[1], click: true } }); G.simTick(DT);
  check(B.mode === 'inside', `${id}: Bob can't climb into a manned cannon`);
  G.hurtCrew(A); G.hurtCrew(A); G.netServer.input(2, { keys: [], pressed: [], mouse: {} }); G.simTick(DT);
  check(A.health === 'down' && A.mode === 'gun', `${id}: Alice goes down in the seat`);
  check(/^Click: pull Alice out of the/.test(B.prompt?.text || ''), `${id}: the ladder prompt offers pulling her out ("${B.prompt?.text}")`);
  // Alice, down with a crewmate around, can still patch herself up (via her own input)
  G.netServer.input(2, { keys: ['KeyE'], pressed: ['KeyE'], mouse: { wx: B.x + 5, wy: B.y + 5 } }); G.simTick(DT); G.netServer.input(2, { keys: [], pressed: [], mouse: {} }); G.simTick(DT);
  check(A.mode === 'inside' && A.health === 'down' && B.mode === 'inside', `${id}: E at the ladder pulls her out, still down`);
  check(G.canStand(A.x, A.y, G.walkRects()) && near(A, g.hatch[0], g.hatch[1], 1) && !near(A, g.hatch[0], g.hatch[1], 0.5) && near(A, B.x, B.y, G.REACH),
        `${id}: she lies next to the hatch, inside, in reach (${A.x.toFixed(2)}, ${A.y.toFixed(2)})`);
  if (id !== 'front') {
    let t = 0; const how = id === 'port' ? 'holding click on her' : 'holding E (she lies right by the ladder: E treats her, not climbs in)';
    while (A.health === 'down' && t < 5) {
      G.netServer.input(2, id === 'port' ? { keys: [], pressed: [], mouse: { wx: A.x, wy: A.y, down: true } } : { keys: ['KeyE'], pressed: t ? [] : ['KeyE'], mouse: { wx: B.x + 6, wy: B.y + 6 } });
      G.simTick(DT); t += DT;
    }
    check(A.health === 'hurt' && t < 2.3 && B.mode === 'inside', `${id}: Bob treats her by ${how} (${t.toFixed(1)} s)`);
    const away = { wx: B.x + 6, wy: B.y + 6 };                        // (the mouse pointing at nothing)
    G.netServer.input(2, { keys: [], pressed: [], mouse: away }); G.simTick(DT);
    G.netServer.input(2, { keys: ['KeyE'], pressed: ['KeyE'], mouse: away }); G.simTick(DT); G.netServer.input(2, { keys: [], pressed: [], mouse: away }); G.simTick(DT);
    check(B.mode === 'gun' && B.gun === g, `${id}: once she's up, E climbs into the cannon again`);
  } else {
    G.netServer.input(2, { keys: [], pressed: [], mouse: {} }); G.simTick(DT);
    check(/^Click: climb into/.test(B.prompt?.text || ''), `${id}: the cannon is free again ("${B.prompt?.text}")`);
    G.netServer.input(2, { keys: [], pressed: [], mouse: { wx: g.hatch[0], wy: g.hatch[1], click: true } }); G.simTick(DT);
    check(B.mode === 'gun' && B.gun === g, `${id}: Bob climbs in himself`);
  }
}
// --- multiplayer: patching yourself up in the seat, out cold needs pulling out, disconnects free the cannon
{
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob');
  const [A, B] = G.crew, g = G.GUNS.find(g => g.id === 'star');
  climbIn(G, A, g, true); G.hurtCrew(A); G.hurtCrew(A);
  let t = 0;
  while (A.health === 'down' && t < 15) { G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: A.x, wy: A.y, down: true } }); G.simTick(DT); t += DT; }
  check(A.health === 'hurt' && A.mode === 'gun' && A.gun === g, `multiplayer: patching yourself up puts you back in the seat (${t.toFixed(1)} s)`);
  G.netServer.input(1, { keys: [], pressed: [], mouse: {} }); G.hurtCrew(A); G.hurtCrew(A);
  check(A.health === 'out' && A.mode === 'gun', 'multiplayer: out cold in the seat');
  t = 0; while (t < 5) { G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: A.x, wy: A.y, down: true } }); G.simTick(DT); t += DT; }
  check(A.health === 'out', 'out with a crewmate standing: you wait to be pulled out');
  G.netServer.command(1, ['climbDown']); G.netServer.command(1, ['reload']); G.simTick(DT);
  check(A.mode === 'gun', 'the CLIMB DOWN command does nothing while you\'re out');
  G.netServer.removeCrew(1); G.simTick(DT);
  B.x = g.hatch[0]; B.y = g.hatch[1] - 0.2; G.simTick(DT);
  check(/^Click: climb into/.test(B.prompt?.text || ''), `the downed gunner disconnects: the cannon is free ("${B.prompt?.text}")`);
}
process.exitCode = failed ? 1 : 0;
