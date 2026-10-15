// Mission script, radar, diagnosis + servicing, security locks + manual override,
// fires + extinguisher, and the jump / lose rules. Run: node tests/mission.js
const { loadGame } = require('./harness');
const NAMES = ['MISSIONS', 'MISSION_LENGTH', 'JUMP_DELAY', 'tick', 'player', 'combat', 'combatClear', 'mission', 'startMission', 'radarScan', 'radarList', 'diagState',
  'serviceTarget', 'updateRepair', 'clickTarget', 'inv', 'SYSTEMS', 'CAPACITORS', 'CAP_MAX', 'DOORWAYS', 'DECK_LOCKS',
  'HATCHES', 'walkRects', 'startOverride', 'overrideHit', 'ui', 'fires', 'spawnFire', 'spray', 'shipHit', 'boarding',
  'spawnInvader', 'power', 'MAX_DAMAGE', 'MAINT_WARNING', 'MAINT_YELLOW', 'jumpStall', 'PRESS_FIRST', 'PRESS_SHRINK', 'PRESS_FLOOR', 'STRAIN_FIRST',
  'STRAIN_FLOOR', 'STALL_CYCLE', 'simTick', 'startTutorial', 'netSerialize', 'netApply', 'jumpCharge', 'me', 'radarList'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
// the intro with all its written events (a small crew gets fewer: MISSIONS.intro.crew, see tests/scaling.js)
const fresh = () => { const G = loadGame(NAMES); G.MISSIONS.intro.crew = null; G.startMission(); G.power.reactor.fuel = 0; return G; };   // no surprise energy
const runTo = (G, t, each) => { while (G.mission.t < t && !G.mission.over) { each?.(); G.tick(DT); } };
// For timing checks: no stray enemy shots or fires breaking things (only scripted events count).
const calm = (G, keep) => () => { G.combat.shots.length = 0; G.fires.length = 0; G.SYSTEMS.forEach(s => { if (s !== keep) s.broken = false; }); };

// --- timeline: each encounter happens once, evenly spread over the mission (jump at MISSION_LENGTH)
{
  const G = fresh(), seen = [];
  const kinds = G.mission.events.map(e => e.kind);
  check(['interceptor', 'maintenance', 'frigate', 'swarm', 'intruder'].every(k => kinds.filter(x => x === k).length === 1),
        `mission has one of each: ${kinds.join(', ')}`);
  const gaps = G.mission.events.slice(1).map((e, i) => e.t - G.mission.events[i].t), want = (G.MISSION_LENGTH - G.JUMP_DELAY - 40) / 4;
  check(gaps.every(g => Math.abs(g - want) < 1e-6) && G.mission.jumpAt === G.MISSION_LENGTH, `events ${want.toFixed(0)} s apart, the jump at ${G.MISSION_LENGTH} s (gaps ${gaps.map(g => g.toFixed(0)).join(', ')} s)`);
  runTo(G, 45, calm(G));
  check(G.combat.enemies.some(e => e.kind === 'interceptor'), 'the interceptor shows up on schedule');
}

// --- difficulty: easy / very easy take one / two optional encounters out, the rest evenly spread, the reactor's pace unchanged
{
  const G = loadGame([...NAMES, 'paceFactor', 'luckCut', 'LUCK_CUT', 'COMBAT_KINDS']);
  for (const [id, full] of [['intro', false], ['c3', false], ['intro', true], ['c4', true], ['pirates', true]]) {
    if (!G.MISSIONS[id]) continue;
    if (full) G.MISSIONS[id].crew = null;              // (all written events; solo otherwise)
    G.startMission(id); const n0 = G.mission.events.length, pace = G.paceFactor(), jump = G.mission.jumpAt;
    const ess = new Set(['derelict', 'rock', 'brig', 'leviathan', ...(G.MISSIONS[id].essential || [])]);
    // never dropped: the essentials and the opener, plus a finale fight if none of those may be the finale
    const core = G.mission.events.filter(e => ess.has(e.kind) || e.opener), obj = new Set(G.MISSIONS[id].essential || []);
    const essN = core.length + ((obj.size || core.some(e => e.opener)) && core.filter(e => G.COMBAT_KINDS.has(e.kind)).every(e => obj.has(e.kind) || e.opener) && n0 > core.length ? 1 : 0);
    for (const easy of [1, 2]) {
      G.startMission(id, { easy }); const evs = G.mission.events, gaps = evs.slice(1).map((e, i) => e.t - evs[i].t);
      const ts = evs.map(e => e.t).sort((a, b) => a - b), even = ts.slice(1).every((t, i) => Math.abs(t - ts[i] - (ts[1] - ts[0])) < 1e-6);
      check(evs.length === Math.max(essN, 1, n0 - easy) && evs.filter(e => ess.has(e.kind) || e.opener).length === core.length && (evs.length < 2 || even)
            && Math.abs(G.paceFactor() - pace) < 1e-9 && G.mission.jumpAt === jump
            && G.mission.extraLuck === (easy - (n0 - evs.length)) / 2 && Math.abs(G.luckCut() - G.LUCK_CUT ** G.mission.extraLuck) < 1e-12,
            `${id}, difficulty ${easy}: ${evs.length} of ${n0} events (essentials kept), evenly spread (gaps ${gaps.map(g => g.toFixed(0)).join(', ')} s), same reactor pace and jump; ${G.mission.extraLuck * 2} step(s) with nothing to drop → ${G.mission.extraLuck} cat(s) of luck`);
    }
  }
}

// --- radar: reveals the next 45 s only; unscanned imminent threats show "????"
{
  const G = fresh();
  runTo(G, 20, calm(G));
  G.radarScan();
  const r1 = G.radarList();
  check(r1.known.length === 1 && r1.known[0].kind === 'interceptor', 'scan at T+20 reveals only the interceptor (T+40)');
  const fr = G.mission.events.find(e => e.kind === 'frigate').t;
  runTo(G, fr - 5, calm(G));               // the frigate, never scanned
  const r2 = G.radarList();
  check(r2.mocks.length === 1 && r2.mocks[0].kind === 'frigate', `an unscanned frigate 5 s out shows up as "???? T-???" (t=${G.mission.t.toFixed(1)}, over=${JSON.stringify(G.mission.over)}, mocks=${r2.mocks.map(e => e.kind)})`);
  G.radarScan();
  check(G.radarList().mocks.length === 0 && G.radarList().known.some(e => e.kind === 'frigate'), 'scanning replaces the "????" with the real contact');
}

// --- the stealth fighter only shows on the radar STEALTH_RADAR s before it arrives (an interceptor: RADAR_RANGE)
{
  const G = loadGame([...NAMES, 'STEALTH_RADAR', 'RADAR_RANGE']);
  G.MISSIONS.intro.crew = null; G.startMission(); G.power.reactor.fuel = 0;
  G.mission.events = [{ id: 0, t: 60, kind: 'stealth', side: 'port', radar: true, done: false }, { id: 1, t: 61, kind: 'interceptor', side: 'star', radar: true, done: false }];
  runTo(G, 60 - G.RADAR_RANGE + 5, calm(G)); G.radarScan();
  const far = G.radarList().known.map(e => e.kind);
  runTo(G, 60 - G.STEALTH_RADAR + 1, calm(G)); G.radarScan();
  const near = G.radarList().known.map(e => e.kind);
  check(G.STEALTH_RADAR < G.RADAR_RANGE && far.join() === 'interceptor' && near.includes('stealth'),
        `radar ${G.RADAR_RANGE - 5} s out: only the interceptor (${far.join(', ')}); the stealth fighter shows ${G.STEALTH_RADAR} s out (${near.join(', ')})`);
}

// --- the campaign's openers: a calm half minute, then something else before the mission's main encounter
{
  const G = loadGame(NAMES);
  const MAIN = { c3: 'derelict', c4: 'pirates', c6: 'rock' };   // (c5: being redesigned separately)
  for (const [id, main] of Object.entries(MAIN)) {
    let ok = true, msg = '';
    for (const easy of [0, 1, 2]) {
      G.startMission(id, { easy });
      const ev = [...G.mission.events].sort((a, b) => a.t - b.t), first = ev[0], m = ev.findIndex(e => e.kind === main), last = ev[ev.length - 1];
      const good = first.opener && first.kind !== main && first.t >= 25 && m > 0 && ev[m].t >= 45 && !last.opener && last.kind !== main;
      if (!good) { ok = false; msg += ` difficulty ${easy}: ${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', ')};`; }
      if (easy === 0) msg += ` ${ev.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', ')}`;
    }
    check(ok, `${id} solo, every difficulty: nothing for ${G.mission.events[0]?.t.toFixed(0)} s, the opener, then the ${main}, a fight as the finale:${msg}`);
  }
}

// --- diagnosis: a failure's pair shows yellow MAINT_YELLOW s ahead (the intro's comes before that: from the start);
// the failing one turns orange 20 s ahead, red when broken, and the decoy goes back to normal
const maintEv = (G) => G.mission.events.find(e => e.kind === 'maintenance');
{
  const G = fresh(), ev = maintEv(G), m = { target: ev.sys, decoy: ev.decoy };
  const yellow = G.SYSTEMS.filter(s => G.diagState(s)?.col === '#ffd84a');
  check(ev.t < G.MAINT_YELLOW && yellow.length === 2 && yellow.includes(m.target) && yellow.includes(m.decoy) && m.target !== m.decoy, 'diagnosis shows two yellow systems at the start, the failing one among them');
  runTo(G, ev.t - G.MAINT_WARNING + 1, calm(G, m.target));
  check(G.diagState(m.target)?.orange && /breaks in \d+ s/.test(G.diagState(m.target).text), `${G.MAINT_WARNING} s before, it turns orange with a countdown ("${G.diagState(m.target)?.text}")`);
  runTo(G, ev.t + 1, calm(G, m.target));
  check(m.target.broken && G.diagState(m.target).text === 'BROKEN', `then it breaks and shows red (${m.target.name})`);
  check(!m.decoy.broken && G.diagState(m.decoy) === null, `and the decoy goes back to normal (${m.decoy.name})`);
}
{
  const G = fresh(), ev = maintEv(G), m = { target: ev.sys };
  runTo(G, ev.t - 15, calm(G));
  G.inv.weapon = 'repair'; G.player.x = m.target.x + 0.6; G.player.y = m.target.y + 0.6;
  let t = 0;
  while (!ev.serviced && t < 6) { G.updateRepair(DT, G.clickTarget(m.target.x, m.target.y), true); t += DT; }
  runTo(G, ev.t + 2, calm(G, m.target));
  check(ev.serviced && !m.target.broken, `servicing it with the repair kit while orange stops the breakdown (took ${t.toFixed(1)} s)`);
}
// --- several maintenance failures in one mission: each has its own pair (four different parts), yellow only within
// MAINT_YELLOW s of its break, one part of each pair breaks (unless serviced); the pairs survive a network snapshot
{
  const G = loadGame(NAMES);
  G.MISSIONS.twoFail = { name: 'Two failures', rules: {}, build: () => [{ t: 40, kind: 'interceptor', side: 'port' }, { t: 100, kind: 'maintenance', radar: false },
    { t: 200, kind: 'maintenance', radar: false }, { t: 300, kind: 'frigate', side: 'star' }] };
  G.startMission('twoFail'); G.power.reactor.fuel = 0;
  const [a, b] = G.mission.events.filter(e => e.kind === 'maintenance').sort((x, y) => x.t - y.t);
  const parts = [a.sys, a.decoy, b.sys, b.decoy];
  check(a && b && new Set(parts).size === 4 && parts.every(s => s && !s.outside), `two failures, two pairs of four different parts: ${parts.map(s => s?.name).join(', ')}`);
  const yellowNow = () => G.SYSTEMS.filter(s => G.diagState(s)?.col === '#ffd84a');
  const keep = new Set(parts), calmM = () => { G.combat.shots.length = 0; G.fires.length = 0; G.SYSTEMS.forEach(s => { if (!keep.has(s)) s.broken = false; }); };
  runTo(G, 1, calmM);
  check(b.t - G.MAINT_YELLOW > 1 && !yellowNow().includes(b.sys) && !yellowNow().includes(b.decoy) && yellowNow().includes(a.sys) && yellowNow().includes(a.decoy),
        `at the start only the first pair is yellow (the second's break is ${b.t.toFixed(0)} s away, more than ${G.MAINT_YELLOW} s)`);
  runTo(G, b.t - G.MAINT_YELLOW - 2, calmM);
  check(!yellowNow().includes(b.sys), `still normal ${G.MAINT_YELLOW + 2} s before its break`);
  runTo(G, b.t - G.MAINT_YELLOW + 1, calmM);
  const y = yellowNow();
  check(y.length === 4 && parts.every(s => y.includes(s)) && / · pairs with the /.test(G.diagState(b.decoy).text),
        `${G.MAINT_YELLOW} s before, it turns yellow too: two pairs at once, each line names its partner ("${G.diagState(b.decoy)?.text}")`);
  // snapshot round trip (a browser's view)
  const C = loadGame(NAMES); C.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  const cm = C.mission.events.filter(e => e.kind === 'maintenance').sort((x, y) => x.t - y.t);
  check(cm.length === 2 && cm[0].sys === C.SYSTEMS[G.SYSTEMS.indexOf(a.sys)] && cm[1].decoy === C.SYSTEMS[G.SYSTEMS.indexOf(b.decoy)]
        && C.SYSTEMS.every((s, i) => C.diagState(s)?.text === G.diagState(G.SYSTEMS[i])?.text),
        'the pairs survive a network snapshot (a browser shows the same diagnosis)');
  // the first: let it break; only its target does, its decoy goes back to normal
  runTo(G, a.t + 1, calmM);
  check(a.sys.broken && !a.decoy.broken && G.diagState(a.decoy) === null && !b.sys.broken && G.diagState(b.sys)?.col === '#ffd84a',
        `the first pair: its failing part breaks, the decoy is fine again; the second pair is still yellow`);
  // the second: service it while orange
  runTo(G, b.t - 12, calmM);
  check(G.serviceTarget() === b.sys && G.diagState(b.sys)?.orange, 'the second turns orange: it can be serviced');
  G.inv.weapon = 'repair'; G.player.x = b.sys.x + 0.6; G.player.y = b.sys.y + 0.6;
  let t = 0;
  while (!b.serviced && t < 6) { G.updateRepair(DT, G.clickTarget(b.sys.x, b.sys.y), true); t += DT; }
  check(b.serviced && !a.serviced && G.diagState(b.sys) === null && G.diagState(b.decoy) === null, 'servicing it clears that pair (and only that one)');
  runTo(G, b.t + 2, calmM);
  check(!b.sys.broken && !b.decoy.broken && a.sys.broken, 'the serviced one never breaks: one part broke in all');
}
{
  // a part of a pair broken (a hit) before its warning starts: the pair takes a working part instead
  const G = loadGame(NAMES);
  G.MISSIONS.lateFail = { name: 'Late failure', rules: {}, build: () => [{ t: 40, kind: 'swarm' }, { t: 200, kind: 'maintenance', radar: false }, { t: 300, kind: 'interceptor', side: 'port' }] };
  G.startMission('lateFail'); G.power.reactor.fuel = 0;
  const ev = maintEv(G), old = ev.sys;
  runTo(G, 2, () => { G.combat.shots.length = 0; G.fires.length = 0; });
  old.broken = true;
  runTo(G, ev.t - G.MAINT_YELLOW + 1, () => { G.combat.shots.length = 0; G.fires.length = 0; G.SYSTEMS.forEach(s => { if (s !== old) s.broken = false; }); });
  check(ev.sys !== old && !ev.sys.broken && ev.sys !== ev.decoy && G.diagState(ev.sys)?.col === '#ffd84a', `a pair part broken before its warning is swapped for a working one (${old.name} → ${ev.sys.name})`);
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
    const G2 = loadGame(NAMES); const lk = G2.DECK_LOCKS[0];
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
  // --- fires: small hits = 24% fire, 6% a broken part, 70% nothing (never both);
  //     big hits: a broken part and a fire, always;
  //     fires sit on a part, burn it out or spread to another part nearby; spray puts them out
  {
    const G = loadGame(NAMES); let n = 0, broke = 0, both = 0;
    for (let i = 0; i < 1000; i++) {
      G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); G.shipHit('port', -0.2, 8, false);
      const f = G.fires.length > 0, b = G.SYSTEMS.some(s => s.broken); if (f) n++; if (b) broke++; if (f && b) both++;
    }
    check(n > 200 && n < 280 && broke > 35 && broke < 90 && both === 0, `a small hit starts a fire 24% of the time (${n}/1000), breaks a part 6% (${broke}/1000), never both`);
    let bigFire = 0, bigBroke = 0, bigTwo = 0;
    for (let i = 0; i < 50; i++) {
      G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); G.shipHit('port', -0.2, 8, true);
      if (G.fires.length) bigFire++; const nb = G.SYSTEMS.filter(s => s.broken).length; if (nb) bigBroke++; if (nb > 1) bigTwo++;
    }
    check(bigFire === 50 && bigBroke === 50 && bigTwo === 0, `a big hit always breaks exactly one part and starts a fire (${bigBroke}/50, ${bigFire}/50, two parts: ${bigTwo})`);
    G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; });
    G.spawnFire(5, 8);
    const burningPart = G.fires[0].sys;
    check(burningPart && Math.hypot(G.fires[0].x - burningPart.x, G.fires[0].y - burningPart.y) < 0.8, `a fire sits right on a ship part (${burningPart?.name})`);
    // left alone: after its time (~15 s) it spreads to a different part nearby (1/3), burns out exactly its
    // own part (1/3; half of those it goes out with it) or keeps burning (1/3)
    let burnedOwn = 0, spread = 0, kept = 0, wentOut = 0, other = 0;
    for (let k = 0; k < 120; k++) {
      G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; });
      G.spawnFire(5, 8); const f = G.fires[0], part = f.sys;
      const until = f.period + 0.2;                       // (each fire has its own, slightly random time)
      for (let i = 0; i < 60 * until; i++) { G.combat.shots.length = 0; G.tick(DT); }
      const brokenNow = G.SYSTEMS.filter(s => s.broken);
      if (brokenNow.length === 1 && brokenNow[0] === part && G.fires.length === 0) wentOut++;
      else if (brokenNow.length === 1 && brokenNow[0] === part) burnedOwn++;
      else if (brokenNow.length === 0 && G.fires.length === 2 && G.fires[1].sys !== part) spread++;
      else if (brokenNow.length === 0 && G.fires.length === 1) kept++;
      else other++;
    }
    check(spread > 25 && kept > 25 && burnedOwn > 8 && wentOut > 8 && other === 0, `an ignored fire spreads (${spread}×), keeps burning (${kept}×), burns out its own part (${burnedOwn}×) or burns it out and goes out (${wentOut}×), nothing else (${other})`);
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
    // after the jump nothing happens to the ship any more: fires don't spread or grow, nothing breaks
    G.spawnFire(22.2, 9.5); G.spawnFire(22.8, 9.5); const fires = JSON.stringify(G.fires), broken = G.SYSTEMS.filter(s => s.broken).length, t0 = G.mission.t;
    for (let i = 0; i < 60 * 60; i++) G.tick(DT);
    check(JSON.stringify(G.fires) === fires && G.SYSTEMS.filter(s => s.broken).length === broken && G.mission.t === t0 && G.mission.over.won,
          'after the jump the ship is frozen: a minute later the fires are as they were, nothing more broke');
  }
  // --- the end screen: any key or click goes back to the lobby (not during the jump-out, not in its first second)
  {
    const G = loadGame([...NAMES, 'localInput', 'endScreenReady', 'location']); let back = 0; G.location.reload = () => back++;
    G.MISSIONS.intro.crew = null; G.startMission(); G.mission.events.forEach(e => { e.done = true; }); G.CAPACITORS[1].charge = 1; G.mission.t = G.mission.jumpAt;
    const press = (k) => { if (k) G.localInput.pressed.add(k); else G.localInput.mouse.click = true; G.tick(DT); };
    G.tick(DT); press('KeyQ');
    const early = back;
    while (!G.endScreenReady()) G.tick(DT);
    press('KeyQ'); const grace = back;
    for (let i = 0; i < 70; i++) G.tick(DT);
    press('KeyM'); const mute = back; press(null);
    check(G.mission.over?.won && early === 0 && grace === 0 && mute === 0 && back === 1, 'end screen: keys during the jump-out and its first second do nothing, M only mutes, then a click goes back to the lobby');
  }
  // --- no energy at jump time: no time limit; the drive stalls in a loop and the hot zone gets worse
  const pressed = (G) => G.mission.events.filter(e => e.press);
  const clear = (G) => () => { calm(G)(); G.combat.enemies.length = 0; G.combat.asteroids.length = 0; G.combat.swarm = null; G.boarding.invaders.length = 0; G.CAPACITORS[1].charge = 0; };
  {
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 0; G.mission.t = G.mission.jumpAt - 0.5;
    const phases = new Set(); let maxK = 0;
    runTo(G, G.mission.jumpAt + 60, () => { clear(G)(); const s = G.jumpStall(); if (s) { phases.add(s.phase); maxK = Math.max(maxK, s.k); } });
    const want = Math.floor((60 - 2.6) / G.STALL_CYCLE) + 1;
    check(!G.mission.over && Math.abs(G.mission.jump.fails - want) <= 1 && phases.size === 3 && maxK > 0.6 && maxK < 0.85,
          `no energy at jump time: the drive stalls in a loop (charge to ${maxK.toFixed(2)}, sputter, dead; ${G.mission.jump.fails} failed attempts in 60 s), the mission goes on`);
    G.CAPACITORS[1].charge = 1; G.tick(DT); G.tick(DT);
    check(G.mission.over?.won === true && G.mission.over.survived && G.CAPACITORS[1].charge === 0, 'energy arriving in MID: the next try jumps (win)');
  }
  {
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 0; G.mission.t = G.mission.jumpAt - 0.5;
    const due = G.mission.jumpAt, ran = [], strains = [];
    let lastStrain = 0;
    runTo(G, due + 200, () => {
      for (const e of pressed(G)) if (e.done && !ran.includes(e)) ran.push(e);
      if (G.mission.press && G.mission.press.strain > lastStrain) { strains.push(G.mission.t); lastStrain = G.mission.press.strain; }
      clear(G)();
    });
    const at = ran.map(e => e.t), gaps = at.map((t, i) => t - (i ? at[i - 1] : due));
    const sgaps = strains.map((t, i) => t - (i ? strains[i - 1] : due));
    const shrinking = (g, first, floor) => Math.abs(g[0] - first) < 0.1 && g.every((x, i) => !i || (x <= g[i - 1] + 1e-6 && x >= floor - 0.1)) && Math.abs(g[g.length - 1] - floor) < 0.1;
    check(!G.mission.over && shrinking(gaps, G.PRESS_FIRST, G.PRESS_FLOOR) && Math.abs(gaps[1] - G.PRESS_FIRST * G.PRESS_SHRINK) < 0.1,
          `not jumping: extra encounters at shrinking gaps (${gaps.map(g => g.toFixed(0)).join(', ')} s)`);
    check(shrinking(sgaps, G.STRAIN_FIRST, G.STRAIN_FLOOR), `... and parts giving out at shrinking gaps (${sgaps.map(g => g.toFixed(0)).join(', ')} s)`);
    check(ran.every(e => e.radar !== false || ['debris'].includes(e.kind)) && pressed(G).some(e => !e.done) && ran.some(e => ['interceptor', 'frigate', 'swarm'].includes(e.kind)) && ran.some(e => ['intruder', 'saboteur', 'mines'].includes(e.kind)),
          `... a mix from the pool (${[...new Set(ran.map(e => e.kind))].join(', ')}), the next one already queued for the radar`);
  }
  {   // multiplayer: the browsers get the stall, the hot zone and its contacts in the snapshot
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 0; G.mission.t = G.mission.jumpAt - 0.5;
    runTo(G, G.mission.jumpAt + 45, clear(G));
    const B = loadGame(NAMES); B.mission.active = false;
    B.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
    const a = G.jumpStall(), b = B.jumpStall();
    check(b && a.phase === b.phase && Math.abs(a.k - b.k) < 1e-9 && B.mission.press?.n === G.mission.press.n && B.mission.events.filter(e => e.press).length === pressed(G).length,
          `multiplayer: the browsers see the same stall (${b?.phase}) and hot zone (${B.mission.press?.n} extra encounters)`);
  }
  {
    const G = fresh(); G.mission.events.forEach(e => { e.done = true; });
    G.CAPACITORS[1].charge = 0; G.mission.t = G.mission.jumpAt - 0.5; const due = G.mission.jumpAt;
    runTo(G, due + 300, () => { G.CAPACITORS[1].charge = 0; });
    const after = G.mission.over ? G.mission.over.t - due : Infinity;
    check(G.mission.over && !G.mission.over.survived && /fell apart/.test(G.mission.over.reason) && after > G.PRESS_FIRST && after < 180,
          `a crew that ignores the jump loses the ship (${after.toFixed(0)} s after the jump was due)`);
  }
  {
    const G = loadGame(NAMES); G.startMission('practice'); G.mission.t = 5000;
    for (let i = 0; i < 60 * 30; i++) G.tick(DT);
    const T = loadGame(NAMES); T.mission.active = false; T.startTutorial('mouse'); T.mission.t = 5000;
    for (let i = 0; i < 60 * 30; i++) T.simTick(DT);
    check(!G.mission.jump && !G.mission.press && !G.mission.events.some(e => e.press) && !T.mission.jump && !T.mission.press && !T.mission.events.some(e => e.press),
          'practice and the tutorial: no jump, no stall, no hot zone');
  }
  {
    const G = fresh();
    G.SYSTEMS.slice(0, G.MAX_DAMAGE).forEach(s => { s.broken = true; }); G.tick(DT);
    check(!G.mission.over, `${G.MAX_DAMAGE} broken systems at once: still flying`);
    G.SYSTEMS[G.MAX_DAMAGE].broken = true; G.tick(DT);
    check(G.mission.over?.won === false && /fell apart/.test(G.mission.over.reason), `more than ${G.MAX_DAMAGE} broken systems at once: mission lost`);
  }
  process.exitCode = failed ? 1 : 0;
}
