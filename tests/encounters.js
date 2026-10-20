// Ship-wide encounters: solar flare, ion storm, coolant leak, AI glitch, stealth fighter, tractor tug.
// Run: node tests/encounters.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'enc', 'mission', 'startMission', 'startFlare', 'startStorm', 'startCoolantLeak', 'startGlitch', 'combat', 'combatSpawn',
  'CAPACITORS', 'CAP_MAX', 'GUNS', 'fireCannon', 'power', 'withCrew', 'inv', 'REACTOR', 'COOLANT_CRATE', 'lockables', 'rebootSwitch', 'radarScan', 'stealthAlpha',
  'hitPoi', 'enemyToWorld', 'ui', 'runCommand'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; G.combat.enemies.length = 0; return G; };

// --- solar flare
{
  const G = fresh(); const me = G.me; me.x = 22.2; me.y = 4.5;           // on the bridge (upper deck)
  G.startFlare(); tickN(G, 60 * 5);
  check(me.health === 'ok', 'the flare gives a 10 s warning first');
  me.x = 22.2; me.y = 16.5;                                               // shelter: reactor room
  tickN(G, 60 * 6);
  check(me.health === 'ok' && G.enc.flare?.phase === 'rad', 'on the lower deck you are sheltered from the radiation');
  const g = G.GUNS[0]; g.shots = 3; g.cd = 0; G.fireCannon(g);
  check(g.shots === 3, 'during the flare the cannons don\'t fire');
  const G2 = fresh(); const m2 = G2.me; m2.x = 22.2; m2.y = 4.5; G2.startFlare(); tickN(G2, 60 * 11);
  check(m2.health === 'hurt', 'on the upper deck the radiation hurts');
  G2.combatSpawn('interceptor', 'port'); const e = G2.combat.enemies[0]; const shots0 = G2.combat.shots.length; e.fireT = 0.1;
  tickN(G2, 60 * 2);
  check(G2.combat.shots.length === shots0, 'and the enemies can\'t fire either');
}
// --- ion storm
{
  const G = fresh(); G.CAPACITORS[0].charge = G.CAP_MAX; G.CAPACITORS[1].charge = 2;
  G.startStorm();
  check(G.CAPACITORS[0].charge === G.CAP_MAX - 1 && G.CAPACITORS[1].charge === 2, 'an ion storm arcs full capacitors (and leaves the others alone)');
  G.mission.active = true; G.radarScan();
  check(!G.mission.revealed.size, 'the radar shows only static');
  tickN(G, 60 * 31);
  check(!G.enc.storm, 'after 30 s it passes');
}
// --- coolant leak
{
  const G = fresh(); G.startCoolantLeak();
  tickN(G, 60 * 51);
  check(G.enc.scram > 0, 'a coolant leak left alone scrams the reactor');
  const t0 = G.power.reactor.t; tickN(G, 60 * 5);
  check(G.power.reactor.t === t0, 'while scrammed the reactor makes no energy');
  const me = G.me, c = G.COOLANT_CRATE; me.x = c.x; me.y = c.y - 1; const m = me.input.mouse; m.wx = c.x; m.wy = c.y; m.click = true; G.simTick(DT);
  check(me.inv.item === 'coolant', 'coolant canisters come from the crate in the left airlock room');
  me.x = G.REACTOR.x; me.y = G.REACTOR.y - 2; m.wx = G.REACTOR.x; m.wy = G.REACTOR.y; m.down = true; let t = 0;
  while (G.enc.coolant && t < 6) { G.simTick(DT); t += DT; }
  m.down = false;
  check(!G.enc.coolant && Math.abs(t - 3) < 0.3, `holding click on the reactor screws it in (${t.toFixed(1)} s) and the leak is fixed`);
}
// --- AI glitch
{
  const G = fresh(); G.startGlitch();
  // (random doors toggle: waiting a fixed 20 s sometimes saw the same door lock and unlock again, 0 locked: ~1 run in 30)
  for (let t = 0; t < 60 && !G.lockables().some(l => l.ref.locked); t += 1) tickN(G, 60);
  const locked = G.lockables().filter(l => l.ref.locked);
  check(locked.length > 0 && locked.every(l => l.kind !== 'hatch'), `doors lock themselves (${locked.length} locked; never the outer airlocks)`);
  const order = G.enc.glitch.order;
  G.withCrew(G.me, () => { G.rebootSwitch((order[0] + 1) % 3); });
  check(G.enc.glitch.step === 0, 'the wrong switch resets the reboot');
  G.withCrew(G.me, () => { for (const i of order) G.runCommand(['reboot', i]); });
  check(!G.enc.glitch && G.lockables().filter(l => l.ref.locked).length < locked.length, 'the right order (shown on the helm) reboots it and unlocks what it locked');
}
// --- stealth fighter and tractor tug
{
  const G = fresh(); G.combatSpawn('stealth', 'port'); const e = G.combat.enemies[0];
  tickN(G, 30);
  check(G.stealthAlpha(e) < 0.2, 'the stealth fighter is (nearly) invisible');
  G.mission.active = true; G.radarScan();
  check(G.stealthAlpha(e) === 1, 'a radar ping lights it up for a moment');
}
{
  const G = fresh(); G.startMission('intro'); G.combat.enemies.length = 0; G.combatSpawn('tractor', 'star'); const e = G.combat.enemies[0];
  const at0 = G.mission.jumpAt; tickN(G, 60 * 5);
  check(Math.abs(G.mission.jumpAt - at0 - 5) < 0.1, 'held in the tractor beam, the jump countdown doesn\'t move');
  const p = e.pois.find(p => p.id === 'emitter'); G.hitPoi(e, p, ...G.enemyToWorld(e, ...p.c));
  const at1 = G.mission.jumpAt; tickN(G, 60 * 2);
  check(G.mission.jumpAt === at1, 'shooting the emitter frees the ship');
}
process.exitCode = failed ? 1 : 0;
