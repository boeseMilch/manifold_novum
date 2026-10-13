// No softlocks: you can always get out. Each case traps the player the way it could happen
// in play and checks there's a way out. Run: node tests/softlock.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'me', 'player', 'DECK_LOCKS', 'HATCHES', 'SYSTEMS', 'ui', 'overrideHit', 'prompt', 'inv', 'ITEMS', 'grab',
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
  // 1. inside a deck airlock chamber when it breaks mid-cycle (both doors shut)
  {
    const G = loadGame(NAMES), L = G.DECK_LOCKS[1], cx = L.x + L.w / 2;
    G.player.x = cx; G.player.y = (G.SPINE_Y0 + G.SPINE_Y1) / 2;
    L.doors.top = 0; L.doors.bottom = 0; L.phase = 'cycling'; L.open = null; sysOf(G, L).broken = true;
    hold(G, 'KeyS', 2);
    const trapped = G.player.y < G.SPINE_Y1;
    G.tick(DT);
    check(trapped && /manual override/.test(G.me.prompt?.text || ''), `trapped in a broken airlock: the prompt offers a manual override ("${G.me.prompt?.text}")`);
    press(G, 'KeyE');
    check(G.ui.panel === 'override', 'E opens the override');
    await bonk3(G);
    hold(G, L.open === 'top' ? 'KeyW' : 'KeyS', 2.5);   // walk out through the door that was forced
    check(!(G.player.y > G.SPINE_Y0 && G.player.y < G.SPINE_Y1), `after three bonks you can walk out (now in ${G.roomAt(G.player.x, G.player.y)?.name})`);
  }
  // 2. on a spacewalk when the outer airlock breaks
  {
    const G = loadGame(NAMES), h = G.HATCHES[0];
    G.player.mode = 'eva'; G.player.x = h.outside[0]; G.player.y = h.outside[1]; sysOf(G, h).broken = true;
    G.tick(DT); press(G, 'KeyE');
    check(G.ui.panel === 'override', 'outside with a broken outer airlock: E opens the override');
    await bonk3(G);
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(G.player.mode === 'inside', 'after three bonks you get back inside');
  }
  // 3. security locks a deck airlock while you stand in its doorway
  {
    const G = loadGame(NAMES), L = G.DECK_LOCKS[0], s = L.open, r = L.doorRect[s];
    G.player.x = r.x + r.w / 2; G.player.y = r.y + r.h / 2; L.locked = true;
    for (let i = 0; i < 120; i++) G.tick(DT);
    check(L.doors[s] === 1, 'a locked airlock does not close the door you are standing in');
    hold(G, s === 'top' ? 'KeyW' : 'KeyS', 1.5);
    check(G.roomAt(G.player.x, G.player.y), 'you can step out into the room');
  }
  // 5. the intruder is shut inside a broken airlock: it bashes its way out
  {
    const G = loadGame(NAMES), L = G.DECK_LOCKS[1];
    G.spawnInvader('port'); const a = G.boarding.invaders[0];
    a.state = 'wander'; a.mode = 'inside'; a.x = L.x + L.w / 2; a.y = (G.SPINE_Y0 + G.SPINE_Y1) / 2; a.path = []; a.linger = 0;
    L.doors.top = 0; L.doors.bottom = 0; L.phase = 'idle'; L.open = null; G.SYSTEMS.find(s => s.ref === L).broken = true;
    G.player.x = 5; G.player.y = 7;
    let t = 0; while (a.y > G.SPINE_Y0 && a.y < G.SPINE_Y1 && t < 30) { G.tick(DT); t += DT; }
    check(t < 30, `an intruder shut in a broken airlock bashes a door open and gets out (${t.toFixed(1)} s)`);
  }
  // 6. the intruder is boxed in by security: locked doors delay it, but can't hold it forever
  {
    const G = loadGame(NAMES);
    G.spawnInvader('port'); const a = G.boarding.invaders[0];
    for (let i = 0; i < 60 * 3; i++) G.tick(DT);                     // let it in (port airlock room)
    a.x = 7.5; a.y = 19; a.path = []; a.linger = 4;                    // standing in the middle of the room
    G.DOORWAYS[2].locked = true; G.DECK_LOCKS[0].locked = true; G.HATCHES[0].locked = true;
    G.player.x = 37; G.player.y = 7;
    for (let i = 0; i < 60 * 3; i++) G.tick(DT);                     // doors finish shutting while it looks around
    let t = 0, sabotaged = 0;
    while (G.roomAt(a.x, a.y)?.id === 'portLock' && t < 90) { G.tick(DT); t += DT; }
    sabotaged = G.SYSTEMS.filter(s => s.broken).length;
    check(t >= 90, `locked in by security, the intruder stays contained (still in the left airlock room after ${t.toFixed(0)} s)`);
    check(sabotaged === 0, `…and paces the room it is locked in without wrecking anything (the alien hunts, it doesn't sabotage)`);
  }
  // 7. long runs with parts breaking and doors locking at random: it never sits in an airlock for long
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
          const d = [...G.DOORWAYS, ...G.DECK_LOCKS][Math.floor(Math.random() * 7)]; d.locked = !d.locked;
        }
        G.tick(DT);
        const Lk = G.DECK_LOCKS.find(L => a.x > L.x && a.x < L.x + L.w);
        inLock = a.y > G.SPINE_Y0 && a.y < G.SPINE_Y1 && a.mode === 'inside' && !(Lk && Lk.locked) ? inLock + DT : 0;   // locked in by security = contained, fine
        worst = Math.max(worst, inLock);
      }
      worstAll = Math.max(worstAll, worst);
    }
    check(worstAll < 20, `with random breakage and locks, the intruder never sits in an airlock for long (worst ${worstAll.toFixed(1)} s)`);
  }
  // 10. airlock: one player steps in and triggers the cycle while another stands in the doorway
  {
    const G = loadGame([...NAMES, 'netServer', 'simTick', 'crew']);
    G.netServer.init('intro');
    G.netServer.addCrew(11, 'A'); G.netServer.addCrew(12, 'B');
    const [A, B] = G.crew, L = G.DECK_LOCKS[0], s = L.open, r = L.doorRect[s], ch = L.chamber;
    B.x = r.x + r.w / 2; B.y = r.y + r.h / 2;                // standing in the open doorway
    A.x = ch.x + ch.w / 2; A.y = (s === 'top' ? r.y - 1 : r.y + r.h + 1);
    for (let i = 0; i < 90; i++) { G.netServer.input(11, { keys: [s === 'top' ? 'KeyS' : 'KeyW'], pressed: [], mouse: {} }); G.simTick(DT); }   // A walks fully in
    check(L.doors[s] > 0.95, `the airlock door does not close while someone stands in it (door ${L.doors[s].toFixed(2)})`);
    for (let i = 0; i < 60; i++) { G.netServer.input(12, { keys: [s === 'top' ? 'KeyW' : 'KeyS'], pressed: [], mouse: {} }); G.simTick(DT); }   // B steps back out
    check(G.roomAt(B.x, B.y), 'the person in the doorway can step out');
    for (let i = 0; i < 60 * 4; i++) G.simTick(DT);
    check(L.open === (s === 'top' ? 'bottom' : 'top'), 'once the doorway is clear, the cycle completes');
  }
  process.exitCode = failed ? 1 : 0;
})();
