// Mission script, radar, diagnosis + servicing, security locks + manual override,
// fires + extinguisher, and the jump / lose rules. Run: node tests/mission.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'player', 'combat', 'combatClear', 'mission', 'startMission', 'radarScan', 'radarList', 'diagState',
  'serviceTarget', 'updateRepair', 'clickTarget', 'inv', 'SYSTEMS', 'CAPACITORS', 'CAP_MAX', 'DOORWAYS', 'DECK_LOCKS', 'LIFTS',
  'HATCHES', 'walkRects', 'startOverride', 'overrideHit', 'ui', 'fires', 'spawnFire', 'spray', 'shipHit', 'boarding',
  'spawnInvader', 'sendLift', 'power', 'JUMP_WINDOW', 'MAINT_WARNING'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const fresh = () => { const G = loadGame(NAMES); G.startMission(); G.power.reactor.fuel = 0; return G; };   // no surprise energy
const runTo = (G, t, each) => { while (G.mission.t < t && !G.mission.over) { each?.(); G.tick(DT); } };
// For timing checks: no stray enemy shots or fires breaking things (only scripted events count).
const calm = (G, keep) => () => { G.combat.shots.length = 0; G.fires.length = 0; G.SYSTEMS.forEach(s => { if (s !== keep) s.broken = false; }); };

// --- timeline: each encounter happens once, about a minute apart
{
  const G = fresh(), seen = [];
  const kinds = G.mission.events.map(e => e.kind);
  check(['interceptor', 'maintenance', 'frigate', 'swarm', 'intruder'].every(k => kinds.filter(x => x === k).length === 1),
        `mission has one of each: ${kinds.join(', ')}`);
  const gaps = G.mission.events.slice(1).map((e, i) => e.t - G.mission.events[i].t);
  check(gaps.every(g => g >= 50 && g <= 70), `events about a minute apart (gaps ${gaps.join(', ')} s)`);
  runTo(G, 45, calm(G));
  check(G.combat.enemies.some(e => e.kind === 'interceptor'), 'the interceptor shows up on schedule');
}

// --- radar: reveals the next 45 s only; unscanned imminent threats show "????"
{
  const G = fresh();
  runTo(G, 20, calm(G));
  G.radarScan();
  const r1 = G.radarList();
  check(r1.known.length === 1 && r1.known[0].kind === 'interceptor', 'scan at T+20 reveals only the interceptor (T+40)');
  runTo(G, 155, calm(G));                  // frigate at T+160, never scanned
  const r2 = G.radarList();
  check(r2.mocks.length === 1 && r2.mocks[0].kind === 'frigate', `an unscanned frigate 5 s out shows up as "???? T-???" (t=${G.mission.t.toFixed(1)}, over=${JSON.stringify(G.mission.over)}, mocks=${r2.mocks.map(e => e.kind)})`);
  G.radarScan();
  check(G.radarList().mocks.length === 0 && G.radarList().known.some(e => e.kind === 'frigate'), 'scanning replaces the "????" with the real contact');
}

// --- diagnosis: two yellow from the start; the failing one turns orange 20 s ahead, red when broken
{
  const G = fresh(), m = G.mission.maint, ev = G.mission.events.find(e => e.kind === 'maintenance');
  const yellow = G.SYSTEMS.filter(s => G.diagState(s)?.col === '#ffd84a');
  check(yellow.length === 2 && yellow.includes(m.target) && yellow.includes(m.decoy), 'diagnosis shows two yellow systems at the start, the failing one among them');
  runTo(G, ev.t - G.MAINT_WARNING + 1, calm(G, m.target));
  check(G.diagState(m.target)?.orange && /breaks in \d+ s/.test(G.diagState(m.target).text), `${G.MAINT_WARNING} s before, it turns orange with a countdown ("${G.diagState(m.target)?.text}")`);
  runTo(G, ev.t + 1, calm(G, m.target));
  check(m.target.broken && G.diagState(m.target).text === 'BROKEN', `then it breaks and shows red (${m.target.name})`);
}
{
  const G = fresh(), m = G.mission.maint, ev = G.mission.events.find(e => e.kind === 'maintenance');
  runTo(G, ev.t - 15, calm(G));
  G.inv.weapon = 'repair'; G.player.x = m.target.x + 0.6; G.player.y = m.target.y + 0.6;
  let t = 0;
  while (!m.serviced && t < 6) { G.updateRepair(DT, G.clickTarget(m.target.x, m.target.y), true); t += DT; }
  runTo(G, ev.t + 2, calm(G, m.target));
  check(m.serviced && !m.target.broken, `servicing it with the repair kit while orange stops the breakdown (took ${t.toFixed(1)} s)`);
}

// --- security: locked door closes (not while occupied), manual override takes 3 bonks
{
  const G = loadGame(NAMES); const d = G.DOORWAYS[0];
  G.player.x = 5; G.player.y = 7; d.locked = true;
  for (let i = 0; i < 60; i++) G.tick(DT);
  check(d.open === 0 && !G.walkRects().includes(d), 'a locked door slides shut and blocks the way');
  // walking straight into the locked door: it stays shut and you don't get through
  G.player.x = d.x - 1.2; G.player.y = d.y + d.h / 2;
  G.listeners.keydown({ code: 'KeyD', preventDefault() {} });
  for (let i = 0; i < 60 * 3; i++) G.tick(DT);
  G.listeners.keyup({ code: 'KeyD' });
  check(d.open === 0 && G.player.x < d.x, `pushing against a locked door does not open it (door ${d.open}, you at x=${G.player.x.toFixed(2)})`);
  d.locked = false; for (let i = 0; i < 60; i++) G.tick(DT);
  G.player.x = d.x + d.w / 2; G.player.y = d.y + d.h / 2; d.locked = true;
  for (let i = 0; i < 60; i++) G.tick(DT);
  check(d.open === 1, 'a locked door does not close on someone standing in it');
  G.startOverride(d, 'Door');
  G.overrideHit(); for (let i = 0; i < 40; i++) G.ui.override.swing = 0;
  G.overrideHit(); for (let i = 0; i < 40; i++) G.ui.override.swing = 0;
  check(d.locked, 'two override bonks are not enough');
  G.overrideHit();
  for (let i = 0; i < 80; i++) G.tick(DT);          // the last swing plays out, then the door gives
  setTimeout(() => {
    check(!d.locked && G.ui.panel === null, 'the third bonk opens it (and closes the panel)');
    // locked lift and deck airlock
    const G2 = loadGame(NAMES); const lift = G2.LIFTS[0], lk = G2.DECK_LOCKS[0];
    lift.locked = true; const pos = lift.pos; G2.sendLift(lift); for (let i = 0; i < 120; i++) G2.tick(DT);
    check(lift.pos === pos && lift.phase === 'docked', 'a locked lift does not move');
    lk.locked = true; G2.player.x = lk.x + lk.w / 2; G2.player.y = 15.8; for (let i = 0; i < 300; i++) G2.tick(DT);
    check(lk.doors.top === 0 && lk.doors.bottom === 0, 'a locked deck airlock keeps both doors shut, even with someone waiting');
    // locked outer airlock: the intruder has to bash it for 8 s
    const G3 = loadGame(NAMES); G3.HATCHES[0].locked = true; G3.spawnInvader('port');
    const a = G3.boarding.invaders[0];
    for (let i = 0; i < 60 * 6; i++) G3.tick(DT);
    const stillOut = a.state === 'entering';
    for (let i = 0; i < 60 * 5; i++) G3.tick(DT);
    check(stillOut && a.state !== 'entering' && !G3.HATCHES[0].locked, 'a locked outer airlock holds the intruder for 8 s before it bashes through');
    fireAndJumpTests();
  }, 1100);
}

function fireAndJumpTests() {
  // --- fires: small hits = half nothing, half fire (or damage if that side already burns);
  //     fires sit on a part, burn it out or spread to another part nearby; spray puts them out
  {
    const G = loadGame(NAMES); let n = 0, broke = 0;
    for (let i = 0; i < 400; i++) { G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); G.shipHit('port', -0.2, 8, false); if (G.fires.length) n++; if (G.SYSTEMS.some(s => s.broken)) broke++; }
    check(n > 160 && n < 240 && broke === 0, `with no fire around, a small hit starts a fire about half the time and breaks nothing (${n}/400 fires)`);
    const f0 = G.fires[0] || (G.shipHit('port', -0.2, 8, false), G.fires[0]);
    G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; });
    G.spawnFire(5, 8);
    const burningPart = G.fires[0].sys;
    check(burningPart && Math.hypot(G.fires[0].x - burningPart.x, G.fires[0].y - burningPart.y) < 0.8, `a fire sits right on a ship part (${burningPart?.name})`);
    let dmg = 0, newFires = 0;
    for (let i = 0; i < 200; i++) {
      G.SYSTEMS.forEach(s => { s.broken = false; }); G.fires.length = 1;
      G.shipHit('port', -0.2, 8, false);
      if (G.SYSTEMS.some(s => s.broken)) dmg++; if (G.fires.length > 1) newFires++;
    }
    check(dmg > 70 && dmg < 130 && newFires === 0, `on a side that is already burning: half the small hits damage a part instead of a new fire (${dmg}/200)`);
    void f0;
    // left alone: after 15 s it burns out exactly its own part, or spreads to a different part nearby
    let burnedOwn = 0, spread = 0, kept = 0, other = 0;
    for (let k = 0; k < 40; k++) {
      G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; });
      G.spawnFire(5, 8); const f = G.fires[0], part = f.sys;
      for (let i = 0; i < 60 * 15.2; i++) { G.combat.shots.length = 0; G.tick(DT); }
      const brokenNow = G.SYSTEMS.filter(s => s.broken);
      if (brokenNow.length === 1 && brokenNow[0] === part) burnedOwn++;
      else if (brokenNow.length === 0 && G.fires.length === 2 && G.fires[1].sys !== part) spread++;
      else if (brokenNow.length === 0 && G.fires.length === 1) kept++;
      else other++;
    }
    check(burnedOwn > 6 && spread > 6 && kept > 1 && other === 0, `an ignored fire burns out its own part (${burnedOwn}×), spreads to another part (${spread}×) or just keeps burning (${kept}×), nothing else (${other})`);
    G.fires.length = 0; G.spawnFire(22.2, 9.5); const fx = G.fires[0];
    G.player.x = fx.x - 1.6; G.player.y = fx.y; G.inv.weapon = 'extinguisher';
    let t = 0; while (G.fires.length && t < 5) { G.spray(fx.x, fx.y, DT); G.tick(DT); t += DT; }
    check(G.fires.length === 0, `spraying the extinguisher puts a fire out (${t.toFixed(1)} s)`);
  }
  // --- jump / lose
  {
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 1; G.mission.t = G.mission.jumpAt - 0.5;
    runTo(G, G.mission.jumpAt + 1, calm(G));
    check(G.mission.over?.won === true, 'with energy in the middle capacitor at jump time, the ship jumps (win)');
  }
  {
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 0; G.mission.t = G.mission.jumpAt - 0.5;
    runTo(G, G.mission.jumpAt + G.JUMP_WINDOW + 1, calm(G));
    check(G.mission.over?.won === false && /energy/.test(G.mission.over.reason), 'no energy for 15 s at jump time: mission lost');
  }
  {
    const G = fresh();
    G.SYSTEMS.slice(0, 4).forEach(s => { s.broken = true; }); G.tick(DT);
    check(G.mission.over?.won === false && /fell apart/.test(G.mission.over.reason), 'more than 3 broken systems at once: mission lost');
  }
  process.exitCode = failed ? 1 : 0;
}
