// No softlocks: you can always get out. Each case traps the player the way it could happen
// in play and checks there's a way out. Run: node tests/softlock.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'me', 'player', 'DECK_DOORS', 'DOORS', 'HATCHES', 'SYSTEMS', 'ui', 'overrideHit', 'prompt', 'inv', 'ITEMS', 'grab',
  'ROOM_RECTS', 'inRect', 'roomAt', 'SPINE_Y0', 'SPINE_Y1', 'boarding', 'spawnInvader', 'DOORWAYS'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const press = (G, code) => { G.listeners.keydown({ code, preventDefault() {} }); G.tick(DT); G.listeners.keyup({ code }); };
const hold = (G, code, sec) => { G.listeners.keydown({ code, preventDefault() {} }); for (let i = 0; i < sec * 60; i++) G.tick(DT); G.listeners.keyup({ code }); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function bonk3(G) {                          // click MANUAL OVERRIDE three times, then let it play out
  for (let k = 0; k < 3; k++) { G.overrideHit(); for (let i = 0; i < 40 && G.ui.override; i++) G.tick(1 / 60); }
  for (let i = 0; i < 80; i++) G.tick(1 / 60);
}
const sysOf = (G, ref) => G.SYSTEMS.find(s => s.ref === ref);

(async () => {
  // 1. in front of a broken deck door (stuck shut): the manual override forces it open for good, you walk through
  {
    const G = loadGame(NAMES), L = G.DECK_DOORS[1], cx = L.x + L.w / 2;
    G.player.x = cx; G.player.y = G.SPINE_Y1 + 0.6; sysOf(G, L).broken = true;
    hold(G, 'KeyW', 1.5);
    const trapped = G.player.y > G.SPINE_Y1;
    G.tick(DT);
    check(trapped && L.open < 0.05 && /manual override/.test(G.me.prompt?.text || ''), `a broken deck door stays shut: the prompt offers a manual override ("${G.me.prompt?.text}")`);
    press(G, 'KeyE');
    check(G.ui.panel === 'override', 'E opens the override');
    await bonk3(G);
    hold(G, 'KeyW', 2.5);
    check(G.player.y < G.SPINE_Y0 && G.roomAt(G.player.x, G.player.y), `after three bonks you can walk through (now in ${G.roomAt(G.player.x, G.player.y)?.name})`);
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(L.open > 0.95, 'the forced broken door stays open (jammed) until it is repaired');
    sysOf(G, L).broken = false; for (let i = 0; i < 120; i++) G.tick(DT);
    check(L.open < 0.05, 'repaired, it shuts again');
  }
  // 2. on a spacewalk when the outer airlock breaks
  {
    const G = loadGame(NAMES), h = G.HATCHES[0];
    G.player.mode = 'eva'; G.player.x = h.outside[0]; G.player.y = h.outside[1]; sysOf(G, h).broken = true;
    G.tick(DT); press(G, 'KeyE');
    check(G.ui.panel === 'override', 'outside with a broken outer airlock: E opens the override');
    await bonk3(G);
    hold(G, 'KeyD', 2.5);                                              // both doors forced open: float in through the chamber
    check(G.player.mode === 'inside' && G.roomAt(G.player.x, G.player.y), 'after three bonks both doors stand open: you get back inside');
  }
  // 3. security locks a deck door while you stand in its passage
  {
    const G = loadGame(NAMES), L = G.DECK_DOORS[0];
    G.player.x = L.x + L.w / 2; G.player.y = G.SPINE_Y1 + 0.5;
    for (let i = 0; i < 30; i++) G.tick(DT);
    hold(G, 'KeyW', 0.35);                                              // into the passage
    L.locked = true;
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(G.inRect(G.player.x, G.player.y, L) && L.open === 1, 'a locked door does not close on you standing in its passage');
    hold(G, 'KeyS', 1.5);
    check(G.roomAt(G.player.x, G.player.y), 'you can step out into the room');
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(L.open === 0, '…then it shuts (and stays shut: locked)');
  }
  // 5. an intruder in a deck door's passage when the door breaks: it never shuts on it, the intruder walks on
  {
    const G = loadGame(NAMES), L = G.DECK_DOORS[1];
    G.spawnInvader('port'); const a = G.boarding.invaders[0];
    a.state = 'wander'; a.mode = 'inside'; a.x = L.x + L.w / 2; a.y = (G.SPINE_Y0 + G.SPINE_Y1) / 2; a.path = []; a.linger = 0;
    L.open = 1; G.SYSTEMS.find(s => s.ref === L).broken = true;
    G.player.x = 5; G.player.y = 7;
    let t = 0; while (a.y > G.SPINE_Y0 && a.y < G.SPINE_Y1 && t < 30) { G.tick(DT); t += DT; }
    check(t < 30, `an intruder in a broken deck door's passage gets out (${t.toFixed(1)} s)`);
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(L.open === 0, '…and the broken door shuts behind it');
  }
  // 6. the intruder is boxed in by security: locked doors delay it, but can't hold it forever
  {
    const G = loadGame(NAMES);
    G.spawnInvader('port'); const a = G.boarding.invaders[0];
    for (let i = 0; i < 60 * 3; i++) G.tick(DT);                     // let it in (port airlock room)
    a.x = 7.5; a.y = 19; a.path = []; a.linger = 4;                    // standing in the middle of the room
    G.DOORWAYS[2].locked = true; G.DECK_DOORS[0].locked = true; G.HATCHES[0].locked = true;
    G.player.x = 37; G.player.y = 7;
    for (let i = 0; i < 60 * 3; i++) G.tick(DT);                     // doors finish shutting while it looks around
    let t = 0, sabotaged = 0;
    while (G.roomAt(a.x, a.y)?.id === 'portLock' && t < 90) { G.tick(DT); t += DT; }
    sabotaged = G.SYSTEMS.filter(s => s.broken).length;
    check(t >= 90, `locked in by security, the intruder stays contained (still in the left airlock room after ${t.toFixed(0)} s)`);
    check(sabotaged === 0, `…and paces the room it is locked in without wrecking anything (the alien hunts, it doesn't sabotage)`);
  }
  // 7. long runs with parts breaking and doors locking at random: it never gets stuck in a deck door's passage
  {
    let worstAll = 0;
    for (let trial = 0; trial < 6; trial++) {
      const G = loadGame(NAMES);
      G.spawnInvader(trial % 2 ? 'port' : 'star'); const a = G.boarding.invaders[0];
      G.player.x = 5; G.player.y = 7;
      let inLock = 0, worst = 0;
      for (let i = 0; i < 60 * 240; i++) {
        if (i % 600 === 300) {                                         // chaos every 10 s
          const s = G.SYSTEMS[Math.floor(Math.random() * G.SYSTEMS.length)]; s.broken = !s.broken;
          const d = G.DOORS[Math.floor(Math.random() * 7)]; d.locked = !d.locked;
        }
        G.tick(DT);
        inLock = a.y > G.SPINE_Y0 && a.y < G.SPINE_Y1 && a.mode === 'inside' ? inLock + DT : 0;
        worst = Math.max(worst, inLock);
      }
      worstAll = Math.max(worstAll, worst);
    }
    check(worstAll < 20, `with random breakage and locks, the intruder never sits in a deck door's passage for long (worst ${worstAll.toFixed(1)} s)`);
  }
  // 10. two players: one walks through a deck door, the other stops in its passage: it stays open on them
  {
    const G = loadGame([...NAMES, 'netServer', 'simTick', 'crew']);
    G.netServer.init('intro');
    G.netServer.addCrew(11, 'A'); G.netServer.addCrew(12, 'B');
    const [A, B] = G.crew, L = G.DECK_DOORS[0], cx = L.x + L.w / 2;
    A.x = cx - 0.4; A.y = G.SPINE_Y1 + 0.6; B.x = cx + 0.4; B.y = G.SPINE_Y1 + 0.6;
    for (let i = 0; i < 64; i++) G.simTick(DT);       // (the door reacts after 0.4 s and slides open in 0.6 s)
    for (let i = 0; i < 60; i++) { G.netServer.input(11, { keys: ['KeyW'], pressed: [], mouse: {} }); G.netServer.input(12, { keys: i < 25 ? ['KeyW'] : [], pressed: [], mouse: {} }); G.simTick(DT); }
    check(A.y < G.SPINE_Y0 && G.inRect(B.x, B.y, L), `A walks through, B stops in the passage (A at ${A.y.toFixed(1)}, B at ${B.y.toFixed(1)})`);
    for (let i = 0; i < 60 * 3; i++) { G.netServer.input(11, { keys: ['KeyW'], pressed: [], mouse: {} }); G.netServer.input(12, { keys: [], pressed: [], mouse: {} }); G.simTick(DT); }
    check(L.open > 0.95, `the door does not close while someone stands in it (door ${L.open.toFixed(2)})`);
    for (let i = 0; i < 60; i++) { G.netServer.input(12, { keys: ['KeyS'], pressed: [], mouse: {} }); G.simTick(DT); }   // B steps back out
    for (let i = 0; i < 60 * 3; i++) { G.netServer.input(12, { keys: ['KeyD'], pressed: [], mouse: {} }); G.simTick(DT); }   // and walks off along the wall
    check(G.roomAt(B.x, B.y) && L.open === 0, `once the doorway is clear and nobody is near, it shuts (door ${L.open.toFixed(2)})`);
  }
  process.exitCode = failed ? 1 : 0;
})();
