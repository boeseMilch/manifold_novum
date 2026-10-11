// Progression and practice: rewards, profile migration (old saves must keep loading), gear and
// professions, ship upgrades, campaign objectives, and every practice-panel button.
// Run: node tests/progress.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'mission', 'startMission', 'MISSIONS', 'CAMPAIGN', 'computeRewards', 'migrateProfile', 'defaultProfile', 'unlockedMissions',
  'applyKit', 'perk', 'hurtCrew', 'SHOTS_PER_ENERGY', 'CAP_MAX', 'power', 'ITEMS', 'dk', 'combat', 'combatSpawn', 'hitPoi', 'enemyToWorld', 'objectiveStatus',
  'PRACTICE', 'runCommand', 'withCrew', 'CAPACITORS', 'levelOf', 'treatInfo', 'netServer', 'SHIELD_UP_TIME', 'endMission', 'boarding', 'spawnInvader', 'hurtInvader'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.simTick(DT); };

// --- rewards
{
  const G = loadGame(NAMES);
  const won = { jumped: true, objective: true, pirates: 3 };
  const r = G.computeRewards('c1', won, true, true);
  check(r.money === 100 + 3 * 40 && r.xp === 80 && r.rep === 2, `First Contract: $100 + $40 per pirate, 80 XP, reputation (+1 first clear) → $${r.money}, ${r.xp} XP, ★${r.rep}`);
  const down = G.computeRewards('c1', won, false, false);
  check(down.xp === 0 && down.money === 220, 'not back aboard on your feet: no XP (the crew still gets paid)');
  const lost = G.computeRewards('c1', { jumped: false, objective: false, pirates: 1 }, false, false);
  check(lost.money === 0 && lost.xp === 0, 'the ship didn\'t make it: nothing');
  const half = G.computeRewards('c3', { jumped: true, objective: false, pirates: 0 }, true, false);
  check(half.money === 0 && half.xp === 70 && half.rep === 0, 'jumped without the objective: half XP, no pay or reputation');
  check(G.levelOf(0) === 1 && G.levelOf(100) === 2 && G.levelOf(260) === 3, 'levels: 100 XP → level 2, 250 → level 3');
}
// --- profiles: old and odd saves still load
{
  const G = loadGame(NAMES);
  const p = G.migrateProfile({ xp: '120', money: 30, ship: { cannons: true }, someFutureField: 7 });
  check(p.xp === 120 && p.v === 1 && p.ship.cannons && p.gear && p.done && p.someFutureField === 7, 'an old save is migrated: numbers fixed, missing fields added, unknown ones kept');
  check(G.migrateProfile(null).xp === 0 && G.migrateProfile('garbage').money === 0, 'a broken save gives a fresh profile instead of crashing');
  const u = G.unlockedMissions({ ...G.defaultProfile(), done: { c1: 1, c2: 1 } });
  check(u.has('c3') && !u.has('c4') && u.has('practice'), 'finishing a chapter unlocks the next one');
}
// --- gear, professions
{
  const G = loadGame(NAMES); const me = G.me;
  G.applyKit(me, { gear: { armor: true, boots: true }, profession: 'engineer' });
  check(me.inv.weapon === 'repair', 'an engineer starts with a repair kit of their own');
  G.hurtCrew(me);
  check(me.health === 'ok' && me.armor === 0, 'the armor vest shrugs off the first hit');
  G.hurtCrew(me);
  check(me.health === 'hurt', '…but not the second');
  const x0 = me.x; me.health = 'ok'; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  const fast = me.x - x0;
  G.applyKit(me, {}); me.x = x0; me.vx = 0; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  check(fast > (me.x - x0) * 1.1, `gravity boots: faster walking (${fast.toFixed(2)} vs ${(me.x - x0).toFixed(2)})`);
  G.applyKit(me, { profession: 'medic' }); me.health = 'down';
  check(G.withCrew(me, () => G.treatInfo(me)).time === 6, 'a medic patches themselves up in 6 s');
}
// --- ship upgrades
{
  const G = loadGame(NAMES);
  G.startMission('c1', { ship: { cannons: true, caps: true, shields: true, inserter: true, spareCell: true, kit2: true } });
  check(G.SHOTS_PER_ENERGY === 4 && G.CAP_MAX === 5 && G.SHIELD_UP_TIME === 3, 'upgrades: 4 shots per energy, capacitors hold 5, shields last 3 s');
  check(G.power.reserve === 4 && G.ITEMS.filter(i => i.kind === 'repair').length === 2, 'a spare fuel cell and a second repair kit');
  G.mission.active = false; G.power.reactor.fuel = 0; tickN(G, 60 * 2.2);
  check(G.power.reactor.fuel === 5 && G.power.reserve === 3, 'the inserter loads the next fuel cell by itself');
  const G2 = loadGame(NAMES); G2.startMission('c1');
  check(G2.SHOTS_PER_ENERGY === 3 && G2.CAP_MAX === 4, 'without upgrades everything is back to normal');
}
// --- campaign objectives
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  check(!G.mission.events.some(e => e.kind === 'intruder'), 'chapter 1 has no intruder');
  G.combatSpawn('pirate', 'port'); const e = G.combat.enemies.find(e => e.kind === 'pirate');
  for (const p of e.pois) G.hitPoi(e, p, ...G.enemyToWorld(e, ...p.c));
  check(G.dk.defeated === 1, 'shooting a pirate raider to scrap counts as a pirate defeated');
  const G2 = loadGame(NAMES); G2.startMission('c2');
  check(G2.mission.events.some(e => e.kind === 'intruder') && G2.mission.objective.kind === 'intruder', 'chapter 2 has the intruder (objective: kill it)');
  G2.mission.active = false; G2.spawnInvader('port'); const a = G2.boarding.invaders[0]; a.state = 'wander';
  G2.hurtInvader(a, 99); tickN(G2, 2);
  check(G2.objectiveStatus().done, 'killing it completes the objective');
  for (const id of G.CAMPAIGN) { const M = G.MISSIONS[id]; const G3 = loadGame(NAMES); G3.startMission(id); check(G3.mission.events.length > 0 && M.briefing.length > 80, `${M.name}: briefing and ${G3.mission.events.length} events`); }
}
// --- results per crew member
{
  const G = loadGame(NAMES); G.netServer.init('c1'); G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  const [A, B] = G.crew; B.mode = 'eva';
  G.endMission(true, 'test');
  const r = G.mission.over.results;
  check(r.crew.find(c => c.id === 1).survived && !r.crew.find(c => c.id === 2).survived, 'at the end, only crew inside the ship and on their feet count as survived');
}
// --- practice: every button works
{
  const G = loadGame(NAMES); G.startMission('practice');
  check(G.mission.jumpAt === Infinity && !G.mission.events.length, 'practice mode: no timeline, no jump');
  let errors = [];
  G.PRACTICE.forEach(([group, label], i) => {
    try { G.withCrew(G.me, () => G.runCommand(['practice', i])); tickN(G, 30); G.withCrew(G.me, () => G.runCommand(['closePanel'])); }
    catch (e) { errors.push(`${label}: ${e.message}`); }
  });
  check(!errors.length, `all ${G.PRACTICE.length} practice buttons run without errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
  tickN(G, 60 * 20);
  check(true, 'and the ship keeps running with all of it going on at once');
  const G4 = loadGame(NAMES); G4.startMission('c1'); const before = G4.combat.enemies.length;
  G4.withCrew(G4.me, () => G4.runCommand(['practice', 0]));
  check(G4.combat.enemies.length === before, 'practice buttons do nothing outside practice mode');
}
process.exitCode = failed ? 1 : 0;
