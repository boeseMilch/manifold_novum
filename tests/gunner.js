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
  const G = loadGame(NAMES); G.netServer.init('c1'); G.mission.active = false;
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
  const G = loadGame(NAMES); G.netServer.init('c1'); G.mission.active = false;
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
// --- the efficient cannons upgrade: 4 shots per energy, and every cannon starts the mission with 4 loaded
{
  const G = loadGame(['GUNS', 'startMission', 'SHOTS_PER_ENERGY']);
  G.startMission('c1', { ship: { cannons: true } });
  check(G.GUNS.every(g => g.shots === 4), `efficient cannons: every cannon starts with 4 shots (${G.GUNS.map(g => g.shots)})`);
  G.GUNS[0].shots = 1; G.startMission('c1', {});
  check(G.GUNS.every(g => g.shots === 3), `without the upgrade: 3 shots, a fresh load each mission (${G.GUNS.map(g => g.shots)})`);
}

// --- aiming with the keys: WASD / arrows steer the barrel towards that screen direction and keep it there
// (key mode: the resting mouse is ignored) until the mouse really moves again; the arc always holds.
{
  const deg = (a) => a * 180 / Math.PI, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const G = loadGame(NAMES); G.mission.active = false; const me = G.me, m = me.input.mouse, k = me.input.keys;
  const hold = (keys, n) => { for (const x of keys) k.add(x); tickN(G, n); for (const x of keys) k.delete(x); };
  const look = (g, wx, wy) => { m.wx = wx; m.wy = wy; m.moved = 1; m.look = 1; G.simTick(DT); };   // a real mouse move (mousemove sets both)
  for (const [id, up, down] of [['port', 'ArrowUp', 'ArrowDown'], ['star', 'KeyW', 'KeyS']]) {     // the side cannons: up / down turn it up / down the screen
    const g = G.GUNS.find(g => g.id === id), arc = g.arc ?? 1.3;
    climbIn(G, me, g);
    look(g, g.x + Math.cos(g.a) * 10, g.y + Math.sin(g.a) * 10);             // mouse straight out, then resting there
    check(Math.abs(wrap(g.aim - g.a)) < 1e-6, `${g.name}: the mouse aims it (straight out)`);
    hold([up], 20);
    const upAim = g.aim;
    check(Math.sin(g.aim) < -0.2 && !!me.gunKeys, `${g.name}: holding ${up} turns the barrel up the screen (${deg(wrap(g.aim - g.a)).toFixed(0)}° off centre) — key mode`);
    tickN(G, 60);                                                            // mouse resting all along (its world point still set)
    check(g.aim === upAim, `${g.name}: let go, the mouse resting: the barrel stays where the keys left it (no snap back)`);
    hold([down], 120);
    check(Math.sin(g.aim) > 0.5 && Math.abs(Math.abs(wrap(g.aim - g.a)) - arc) < 1e-6, `${g.name}: holding ${down} turns it down the screen, up to the arc's edge and no further (${deg(wrap(g.aim - g.a)).toFixed(1)}°)`);
    hold([g.id === 'port' ? 'ArrowLeft' : 'ArrowRight'], 120);
    check(Math.abs(wrap(g.aim - g.a)) < 1e-6, `${g.name}: the key pointing out of the ship brings it back to straight out`);
    m.wx += 0.001; tickN(G, 10);                                             // the camera sliding the world point under a resting mouse
    check(Math.abs(wrap(g.aim - g.a)) < 1e-6 && me.gunKeys, `${g.name}: the world point under a resting mouse changing doesn't take over`);
    look(g, g.x + Math.cos(g.a) * 10, g.y + 6);
    check(!me.gunKeys && Math.abs(g.aim - Math.atan2(6, Math.cos(g.a) * 10)) < 1e-6, `${g.name}: moving the mouse again: it follows the mouse (key mode off)`);
    me.input.pressed.add('KeyE'); G.simTick(DT);
    check(me.mode === 'inside', `${g.name}: E still climbs down`);
  }
  { const g = G.GUNS.find(g => g.id === 'front'), arc = g.arc;                // the front cannon (up the screen): left / right turn it, up centres it
    climbIn(G, me, g); look(g, g.x, g.y - 10);
    hold(['ArrowLeft'], 200);
    check(Math.abs(g.aim - Math.PI) < 1e-6 || Math.abs(g.aim + Math.PI) < 1e-6, `front cannon: left turns it to point left (${deg(wrap(g.aim - g.a)).toFixed(1)}° off centre)`);
    hold(['ArrowLeft', 'ArrowDown'], 200);
    check(Math.abs(wrap(g.aim - g.a) + arc) < 1e-6, `front cannon: down-left: on to the arc's edge and no further (${deg(wrap(g.aim - g.a)).toFixed(1)}°)`);
    tickN(G, 30); check(Math.abs(wrap(g.aim - g.a) + arc) < 1e-6, 'front cannon: stays there with the mouse resting');
    hold(['KeyD'], 30); check(Math.abs(wrap(g.aim - g.a) + arc - 30 * DT * 1.6) < 1e-6, 'front cannon: D turns it back right at the turn rate');
    hold(['ArrowDown'], 30); const a0 = g.aim; hold(['ArrowDown'], 30);
    check(g.aim === a0, 'front cannon: down (straight behind it) does nothing');
    hold(['ArrowUp'], 200); check(Math.abs(wrap(g.aim - g.a)) < 1e-6, 'front cannon: up centres it');
    // Space fires, R reloads, Shift covers — in key mode too
    g.shots = 3; g.cd = 0; hold(['Space'], 2); check(g.shots === 2, 'key mode: Space fires');
    g.shots = 0; g.reload = 0; me.input.pressed.add('KeyR'); G.simTick(DT); check(g.reload > 0, 'key mode: R reloads');
    k.add('ShiftLeft'); tickN(G, 20); check(me.cover > 0.9, 'key mode: Shift raises the cover'); k.delete('ShiftLeft'); tickN(G, 20);
  }
  // multiplayer: the server gets keys and mouse moves as inputs and runs the same rule
  { const S = loadGame(NAMES); S.netServer.init('c1'); S.mission.active = false; S.netServer.addCrew(1, 'A');
    const A = S.crew[0], g = S.GUNS.find(g => g.id === 'port'), far = [g.x - 10, g.y], send = (keys, mouse) => S.netServer.input(1, { keys, pressed: [], mouse });
    climbIn(S, A, g, true);
    send([], { wx: far[0], wy: far[1], moved: 1, look: 1 }); S.simTick(DT);
    check(A.mode === 'gun' && Math.abs(wrap(g.aim - g.a)) < 1e-6, 'multiplayer: the server aims the cannon at the mouse');
    send(['ArrowUp'], { wx: far[0], wy: far[1] }); tickN(S, 20);
    const upAim = g.aim;
    check(Math.sin(g.aim) < -0.2, 'multiplayer: holding up turns the barrel up the screen');
    for (let i = 0; i < 60; i++) { send([], { wx: far[0] + i * 0.01, wy: far[1] }); S.simTick(DT); }   // every frame's input: the mouse resting (its world point drifting)
    check(g.aim === upAim, 'multiplayer: let go, the mouse resting: the server keeps the key aim');
    send([], { wx: g.x - 10, wy: g.y + 5, moved: 1, look: 1 }); S.simTick(DT);
    check(Math.abs(g.aim - Math.atan2(5, -10)) < 1e-6, 'multiplayer: the mouse moving again takes over');
  }
}
process.exitCode = failed ? 1 : 0;
