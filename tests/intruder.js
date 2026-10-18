// Intruder (the alien): hunts the crew room by room and fights whoever it finds; it no longer
// sabotages anything. Plus luck from petting the cat and the front shield. Run: node tests/intruder.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'boarding', 'spawnInvader', 'SYSTEMS', 'roomAt', 'adjacentRooms', 'ROOMS',
  'luck', 'lucky', 'petCat', 'clickTarget', 'CAT', 'smallHit', 'fires', 'combat', 'pressShield', 'CAPACITORS', 'makeAsteroid',
  'shieldYFront', 'combatClear'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// nobody aboard: it prowls from room to room (always to an adjacent room) and breaks nothing
{
  const G = loadGame(NAMES); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  G.player.mode = 'eva'; G.player.x = -2.5; G.player.y = 10;   // outside the ship: nobody to hunt
  let room = null, hops = 0, badHop = 0;
  for (let i = 0; i < 60 * 200; i++) {
    G.tick(DT);
    const r = G.roomAt(a.x, a.y);
    if (r && r !== room) { if (room && !G.adjacentRooms(room).includes(r)) badHop++; if (room) hops++; room = r; }
  }
  check(hops >= 4 && badHop === 0, `with nobody aboard it prowls room to room, always to an adjacent room (${hops} hops, ${badHop} non-adjacent)`);
  check(!G.SYSTEMS.some(s => s.broken), 'it never sabotages anything (that is the saboteur\'s job)');
}
// hunting: it finds you wherever you are and attacks
for (const [x, y, where] of [[37, 7, 'the right cannon room'], [22, 2, 'the bridge'], [37.5, 21, 'the right airlock room']]) {
  const G = loadGame(NAMES); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  G.player.x = x; G.player.y = y;
  let t = 0;
  for (; t < 60 && a.state !== 'fight'; t += DT) { G.tick(DT); G.player.x = x; G.player.y = y; }
  check(a.state === 'fight' && Math.hypot(a.x - x, a.y - y) < 9, `it hunts you down in ${where} and attacks (after ${t.toFixed(0)} s, from ${Math.hypot(a.x - x, a.y - y).toFixed(1)} away)`);
}
// it follows when you leave the room
{
  const G = loadGame(NAMES); G.spawnInvader('port'); const a = G.boarding.invaders[0];
  G.player.x = 7; G.player.y = 7;
  for (let i = 0; i < 60 * 40 && a.state !== 'fight'; i++) { G.tick(DT); G.player.x = 7; G.player.y = 7; }
  G.player.x = 37.5; G.player.y = 21;                          // gone: now in the far corner of the ship
  let t = 0;
  for (; t < 60 && !(a.state === 'fight' && G.roomAt(a.x, a.y)?.id === 'starLock'); t += DT) { G.tick(DT); G.player.x = 37.5; G.player.y = 21; }
  check(t < 60, `it loses you, then tracks you to the right airlock room (${t.toFixed(0)} s)`);
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
  let lit = 0, brk = 0;
  for (let i = 0; i < 2000; i++) { G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); G.smallHit('port', -0.2, 8); if (G.fires.length) lit++; else if (G.SYSTEMS.some(s => s.broken)) brk++; else nothing++; }
  check(lit > 380 && lit < 490 && brk > 70 && brk < 150, `while lucky, small hits start a fire 21.6% of the time instead of 24% (${lit}/2000) and break a part 5.4% instead of 6% (${brk}/2000)`);
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
// --- the alien's attacks: faster spit (still dodgeable), contact damage with a per-alien cooldown, 4 hp
{
  const N2 = [...NAMES, 'hurtInvader', 'SPIT_SPEED', 'SPIT_RANGE', 'SPIT_WINDUP', 'ALIEN_HP', 'ALIEN_TOUCH_COOLDOWN', 'POUNCE_WINDUP', 'mission'];
  const G = loadGame(N2); G.mission.active = false;
  check(G.ALIEN_HP === 4, `the alien has ${G.ALIEN_HP} hp`);
  check(G.SPIT_SPEED >= 11 && G.SPIT_SPEED <= 12, `its acid spit flies at ${G.SPIT_SPEED} units/s (was 9)`);
  // dodgeable: from its usual 4-6 units away, the windup plus the flight leave over a second to step aside
  check(G.SPIT_WINDUP + 4 / G.SPIT_SPEED > 1, `still dodgeable: ${(G.SPIT_WINDUP + 4 / G.SPIT_SPEED).toFixed(2)} s from the windup to the spit crossing 4 units`);
  G.spawnInvader('port'); const a = G.boarding.invaders[0];
  for (let i = 0; i < 120; i++) G.tick(DT);
  a.x = 18.5; a.y = 9; a.path = []; G.player.x = 24.5; G.player.y = 9.5; G.player.mode = 'inside';
  G.hurtInvader(a, 0); a.spitT = 0; a.hp = 100;
  let bolt = null;
  for (let i = 0; i < 60 * 3 && !bolt; i++) { G.tick(DT); bolt = G.boarding.bolts.find(b => b.owner === 'alien'); }
  check(bolt && Math.abs(Math.hypot(bolt.vx, bolt.vy) - G.SPIT_SPEED) < 1e-6, `the spit really flies at SPIT_SPEED (${bolt && Math.hypot(bolt.vx, bolt.vy).toFixed(1)})`);
  check(bolt && Math.abs(bolt.life * G.SPIT_SPEED - G.SPIT_RANGE) < 0.3, `and reaches as far as before (${G.SPIT_RANGE} units)`);
}
{
  const G = loadGame([...NAMES, 'hurtInvader', 'ALIEN_TOUCH_COOLDOWN', 'POUNCE_WINDUP', 'mission']); G.mission.active = false;
  G.spawnInvader('port'); const a = G.boarding.invaders[0];
  for (let i = 0; i < 120; i++) G.tick(DT);
  // touching it: one hit, then nothing from it for ALIEN_TOUCH_COOLDOWN, then the next
  Object.assign(a, { x: 20, y: 9, path: [], act: null, spitT: 1e9, state: 'wander', linger: 0 }); G.player.mode = 'inside';
  const stick = () => { G.player.x = a.x + 0.3; G.player.y = a.y; G.player.health = 'ok'; G.player.armor = 0; a.spitT = 1e9; a.act = null; };
  const h0 = G.combat.hits.crew; let firstAt = null, secondAt = null;
  for (let i = 0; i < 60 * 4 && secondAt === null; i++) {
    stick(); G.tick(DT);
    const n = G.combat.hits.crew - h0;
    if (n >= 1 && firstAt === null) firstAt = i * DT;
    if (n >= 2) secondAt = i * DT;
  }
  check(firstAt !== null && firstAt < 0.1, `bumping into the alien hurts at once (${firstAt?.toFixed(2)} s)`);
  check(secondAt !== null && Math.abs(secondAt - firstAt - G.ALIEN_TOUCH_COOLDOWN) < 0.05, `staying in contact: the next hit only after the ${G.ALIEN_TOUCH_COOLDOWN} s cooldown (${(secondAt - firstAt).toFixed(2)} s)`);
  // a pounce that lands right on you: one hit, not pounce + touch
  Object.assign(a, { x: 20, y: 9, touchCd: 0, state: 'fight', spitT: 1e9 }); G.player.x = 21.2; G.player.y = 9; G.player.health = 'ok';
  a.act = { kind: 'pounce', t: G.POUNCE_WINDUP, to: [21.2, 9] };
  const h1 = G.combat.hits.crew;
  for (let i = 0; i < 40; i++) { G.tick(DT); G.player.health = 'ok'; a.spitT = 1e9; }
  check(G.combat.hits.crew - h1 === 1, `a pounce that connects is one hit, not a pounce plus a touch (${G.combat.hits.crew - h1})`);
}
// --- chapter 2: the cargo pods. Two sealed pods in the reactor room hatch the two aliens (one per deck); the objective needs both dead
{
  const N3 = [...NAMES, 'hurtInvader', 'mission', 'startMission', 'runEvent', 'objectiveStatus', 'eventLabel', 'crew', 'MISSIONS', 'radarScan', 'SOLIDS', 'canStand',
              'walkRects', 'POD_STIR', 'POD_GAP', 'podHatchAt', 'CARGO_PODS', 'netSerialize', 'netApply', 'me', 'NAV_SPOTS', 'WALK_DESTS', 'syncPodSolids'];
  const G = loadGame(N3); G.startMission('c2');
  const ev = G.mission.events.find(e => e.kind === 'intruder');
  check(ev && ev.count === 2 && ev.pods && G.mission.objective.count === 2, 'chapter 2\'s intruder event hatches two aliens from the cargo pods, and the objective is to kill both');
  check(G.eventLabel(ev) === '2 intruders — the cargo pods', `it's called "${G.eventLabel(ev)}"`);
  check(ev.radar === false, 'the hatching is no radar contact (it happens inside the ship)');
  // the cargo: two sealed pods, solid, out of the way (every place the crew walks to is still reachable)
  const pods = G.boarding.pods;
  check(pods.length === 2 && pods.every(p => p.state === 'sealed') && G.SOLIDS.filter(S => S.pod).length === 2 && pods.every(p => !G.canStand(p.x, p.y, G.walkRects())),
    `two sealed cargo pods aboard, solid (${pods.map(p => `${p.x}, ${p.y}`).join(' / ')})`);
  {
    // floor cells in the reactor room you can stand on but not walk to from its middle (0.2 grid), with and without the pods
    const shutOff = () => {
      const rects = G.walkRects(), ok = (x, y) => G.canStand(x, y, rects), key = (x, y) => `${Math.round(x * 5)},${Math.round(y * 5)}`;
      const [sx, sy] = G.NAV_SPOTS.reactor, seen = new Set([key(sx, sy)]), q = [[sx, sy]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && ok(nx, ny)) { seen.add(k); q.push([nx, ny]); } } }
      const out = new Set();
      for (let x = 14.4; x < 30.1; x += 0.2) for (let y = 15.2; y < 25.4; y += 0.2) if (ok(x, y) && !seen.has(key(x, y))) out.add(key(x, y));
      return out;
    };
    const withPods = shutOff(), keep = G.boarding.pods; G.boarding.pods = []; G.syncPodSolids();
    const without = shutOff(); G.boarding.pods = keep; G.syncPodSolids();
    const extra = [...withPods].filter(k => !without.has(k)).length;
    check(extra === 0, `the pods shut off no floor in the reactor room (${extra} cells more unreachable than without them)`);
  }
  const H0 = loadGame(N3); H0.startMission('intro');
  check(!H0.boarding.pods.length && !H0.SOLIDS.some(S => S.pod), 'other missions have no cargo pods');
  // no spoiler: until they show up the objective is the cover story (lobby: MISSIONS.c2.objective.cover; HUD: objectiveStatus)
  const pre = G.objectiveStatus();
  check(!pre.done && pre.text === 'Deliver the cargo pods to the Xenobiology Institute' && !/intruder|alien|kill/i.test(pre.text), `before they appear the objective reads "${pre.text}"`);
  for (const t of [G.MISSIONS.c2.blurb, G.MISSIONS.c2.briefing]) check(!/intruder|alien|kill|legs|two somethings|hatch/i.test(t), `the chapter's blurb / briefing doesn't give them away: "${t.slice(0, 50)}…"`);
  G.mission.t = ev.t - 10; G.radarScan();
  check(!G.mission.revealed.has(ev.id) && G.objectiveStatus().text === pre.text, 'a radar scan just before doesn\'t see it coming (the cover story stays)');
  // the event: pod 1 stirs (banner), bursts POD_STIR s later; pod 2 POD_GAP s after pod 1
  G.mission.active = false; G.boarding.invaders.length = 0; G.runEvent(ev); G.tick(DT);
  check(G.objectiveStatus().text === 'Kill both intruders (0/2 dead)', `as soon as the first pod stirs it's explicit: "${G.objectiveStatus().text}"`);
  check(pods[0].state === 'stir' && !G.boarding.invaders.length && /moving in the cargo pod/.test(G.combat.banner?.text || ''), `first a warning: the pod stirs ("${G.combat.banner?.text}"), nothing is out yet`);
  let t1 = null, t2 = null;
  for (let i = 1; i < 60 * 30 && t2 === null; i++) { G.tick(DT); if (t1 === null && G.boarding.invaders.length === 1) t1 = (i + 1) * DT; if (G.boarding.invaders.length === 2) t2 = (i + 1) * DT; }
  check(Math.abs(t1 - G.podHatchAt(0)) < 0.05 && Math.abs(t2 - G.podHatchAt(1)) < 0.05, `the first alien is out after ${t1?.toFixed(2)} s, the second after ${t2?.toFixed(2)} s (pods burst at ${G.podHatchAt(0)} / ${G.podHatchAt(1)} s)`);
  const [p, q] = G.boarding.invaders;
  check(pods.every(o => o.state === 'open') && G.SOLIDS.filter(S => S.pod).length === 2, 'both pods burst open; their remains stay (still solid)');
  check(p.hatch == null && p.mode === 'inside' && p.pod === 0 && q.pod === 1 && p.zone !== q.zone, `they come out of the pods, not through the airlocks, and keep to different decks (${p.zone} / ${q.zone})`);
  // multiplayer: the pods are in the snapshot (and their footprints solid in every browser)
  {
    const B = loadGame(N3); B.startMission('intro'); B.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
    check(B.boarding.pods.length === 2 && B.boarding.pods.every(o => o.state === 'open') && B.SOLIDS.filter(S => S.pod).length === 2, 'the pods\' state reaches the other browsers (with their solid footprints)');
  }
  // more aliens than sealed pods (another such event with the pods already burst): the airlocks, as before
  {
    const H = loadGame(N3); H.startMission('c2'); H.boarding.pods.forEach(o => { o.state = 'open'; });
    H.mission.active = false; H.runEvent({ t: 0, kind: 'intruder', side: 'port', count: 2, pods: true });
    check(H.boarding.invaders.length === 2 && H.boarding.invaders.every(a => a.state === 'entering' && a.hatch), 'with no sealed pod left they come in through the airlocks');
  }
  // nobody aboard: each prowls its own deck, they don't clump
  G.player.mode = 'eva'; G.player.x = -2.5; G.player.y = 10;
  const deck = (a) => (a.y < 11.5 ? 'top' : 'bottom'); let off = 0, apart = 0, n = 0;
  for (let i = 0; i < 60 * 120; i++) {
    G.tick(DT); G.player.x = -2.5; G.player.y = 10;
    if (i > 60 * 40 && i % 30 === 0) { n++; for (const a of [p, q]) if (a.mode === 'inside' && G.roomAt(a.x, a.y) && deck(a) !== a.zone) off++; if (Math.hypot(p.x - q.x, p.y - q.y) > 8) apart++; }
  }
  check(off === 0, `after getting there, each stays on its own deck (${off} samples off it)`);
  check(apart / n > 0.9, `and they stay apart (more than 8 units ${Math.round(apart / n * 100)}% of the time)`);
  // you on the upper deck: the upper one comes for you, the lower one keeps to its deck ... until it's the last one
  G.player.mode = 'inside'; G.player.x = 22; G.player.y = 2;
  const top = p.zone === 'top' ? p : q, bot = top === p ? q : p;
  let botUp = 0;
  for (let i = 0; i < 60 * 40 && top.state !== 'fight'; i++) { G.tick(DT); G.player.x = 22; G.player.y = 2; G.player.health = 'ok'; if (G.roomAt(bot.x, bot.y)?.deck === 'top') botUp++; }
  check(top.state === 'fight' && botUp === 0, `the upper-deck alien hunts you down on the bridge, the lower-deck one stays below (${top.state}, ${botUp} frames up top)`);
  G.hurtInvader(top, 99); G.tick(DT);
  check(!G.objectiveStatus().done && G.objectiveStatus().text === 'Kill both intruders (1/2 dead)', `one down: "${G.objectiveStatus().text}"`);
  let t = 0;
  for (; t < 60 && bot.state !== 'fight'; t += DT) { G.tick(DT); G.player.x = 22; G.player.y = 2; G.player.health = 'ok'; }
  check(bot.state === 'fight', `the last one left comes up and hunts you (${t.toFixed(0)} s)`);
  G.hurtInvader(bot, 99); G.tick(DT);
  check(G.objectiveStatus().done, 'both down: objective done');
  // other missions' intruders stay single
  const H = loadGame(N3); H.startMission('intro'); H.mission.active = false; H.boarding.invaders.length = 0;
  H.runEvent({ t: 0, kind: 'intruder', side: 'port' });
  check(H.boarding.invaders.length === 1 && !H.boarding.invaders[0].zone, 'an intruder event without a count is one alien that hunts anywhere');
}
process.exitCode = failed ? 1 : 0;
