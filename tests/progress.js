// Progression and practice: rewards, profile migration (old saves must keep loading), gear and
// professions, ship upgrades, campaign objectives, and every practice-panel button.
// Run: node tests/progress.js
const { loadGame } = require('./harness');
const NAMES = ['missionCrew', 'simTick', 'me', 'crew', 'mission', 'startMission', 'MISSIONS', 'CAMPAIGN', 'computeRewards', 'migrateProfile', 'defaultProfile', 'unlockedMissions',
  'applyKit', 'perk', 'hurtCrew', 'SHOTS_PER_ENERGY', 'CAP_MAX', 'power', 'ITEMS', 'dk', 'combat', 'combatSpawn', 'hitPoi', 'enemyToWorld', 'objectiveStatus',
  'PRACTICE', 'runCommand', 'withCrew', 'CAPACITORS', 'levelOf', 'treatInfo', 'netServer', 'SHIELD_UP_TIME', 'endMission', 'boarding', 'spawnInvader', 'hurtInvader',
  'gearSpeed', 'failGravity', 'ENERGY_TIME', 'REACTOR', 'clickTarget', 'fires', 'SYSTEMS', 'GEAR', 'BLASTER_CHARGE', 'inv', 'evs', 'repairSpeed'];
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
  check(p.xp === 120 && p.v === 3 && p.ship.cannons && p.gear && p.done && p.someFutureField === 7, 'an old save is migrated: numbers fixed, missing fields added, unknown ones kept');
  const v1 = G.migrateProfile({ v: 1, gear: { paint: true, boots: true }, paint: '#3a8fc4', ship: { kit2: true, autodoc: true, caps: true }, profession: 'security' });
  check(!v1.gear.paint && v1.gear.boots && v1.paint === '#3a8fc4' && !v1.ship.kit2 && !v1.ship.autodoc && v1.ship.caps && v1.profession === 'weapons',
    'v1 → v2: paint is free (color kept), auto-doc and second kit dropped, Security is now Weapons specialist');
  const v2a = G.migrateProfile({ v: 2, profession: 'gunner', gear: { trauma: true, stim: true } }), v2b = G.migrateProfile({ v: 2, profession: 'medic', gear: {} });
  check(v2a.profession === 'weapons' && !v2a.gear.trauma && v2a.gear.stim && v2b.profession === null && v2b.gear.firstAid && v2a.v === 3,
    'v2 → v3: Gunner becomes Weapons specialist, a medic gets the first aid course, trauma kit dropped, stim pack kept');
  check(G.migrateProfile(null).xp === 0 && G.migrateProfile('garbage').money === 0, 'a broken save gives a fresh profile instead of crashing');
  const u = G.unlockedMissions({ ...G.defaultProfile(), done: { c1: 1, c2: 1 } });
  check(u.has('c3') && !u.has('c4') && u.has('practice'), 'finishing a chapter unlocks the next one');
}
// --- gear, professions
{
  const G = loadGame(NAMES); const me = G.me;
  G.applyKit(me, { gear: { armor: true, boots: true }, profession: 'engineer' });
  check(!me.inv.weapon, 'an engineer alone doesn\'t start with a repair kit');
  G.applyKit(me, { gear: { armor: true, boots: true, ownKit: true }, profession: 'engineer' });
  check(me.inv.weapon === 'repair', '…the first track upgrade gives them their own');
  G.hurtCrew(me);
  check(me.health === 'ok' && me.armor === 0, 'the armor vest shrugs off the first hit');
  G.hurtCrew(me);
  check(me.health === 'hurt', '…but not the second');
  const x0 = me.x; me.health = 'ok'; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  const fast = me.x - x0;
  G.applyKit(me, {}); me.x = x0; me.vx = 0; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  check(fast > (me.x - x0) * 1.1, `gravity boots: faster walking (${fast.toFixed(2)} vs ${(me.x - x0).toFixed(2)})`);
  G.applyKit(me, { gear: { firstAid: true } }); me.health = 'down';
  check(G.withCrew(me, () => G.treatInfo(me)).time === 6, 'with the first aid course you patch yourself up in 6 s');
  G.applyKit(me, { profession: 'engineer', gear: { stim: true } });
  check(G.withCrew(me, () => G.treatInfo(me)).time === 3, '…in 3 s with a stim pack (anyone can use it)');
  me.inv.weapon = null; G.applyKit(me, { profession: 'engineer', gear: { ownLaser: true } });
  check(!me.inv.weapon, 'profession gear only works in its profession (an engineer gets no laser from it)');
  me.health = 'ok'; const other = G.crew[0] === me ? (G.netServer.addCrew(9, 'Bob'), G.crew.find(c => c.id === 9)) : G.crew[1]; other.health = 'down';
  const tt = (kit) => { G.applyKit(me, kit); return G.withCrew(me, () => G.treatInfo(other)).time; };
  check(tt({}) === 2 && tt({ gear: { firstAid: true } }) === 1.2, 'treating a crewmate: 2 s, with the first aid course 1.2 s');
  me.health = 'ok';
  check(G.repairSpeed(me) === 1, 'repairs: normal speed for a non-engineer');
  G.applyKit(me, { profession: 'engineer' }); const eng = G.repairSpeed(me);
  G.applyKit(me, { profession: 'engineer', gear: { toolbelt: true } });
  check(eng === 1.2 && Math.abs(G.repairSpeed(me) - 1.5) < 1e-9, 'repairs: an engineer 20% faster, with the toolbelt 50%');
  check(!G.GEAR.some(g => g.id === 'paint') && G.GEAR.filter(g => g.prof).every(g => ['engineer', 'weapons'].includes(g.prof)), 'suit paint is no gear any more; engineer and weapons tracks');
}
// --- gravity boots where the gravity failed
{
  const G = loadGame(NAMES); G.startMission('practice'); const me = G.me;
  me.x = 22.2; me.y = 4.5; G.failGravity('bridge');
  G.applyKit(me, { gear: { boots: true } });
  check(Math.abs(G.gearSpeed(me) - 0.8) < 1e-9, 'gravity boots: 80% walking speed where the gravity failed');
  G.applyKit(me, {});
  check(G.gearSpeed(me) === 1, '(without them you float instead)');
}
// --- weapons specialist: heavy blaster
{
  const G = loadGame(NAMES); G.startMission('practice'); const me = G.me;
  G.applyKit(me, { profession: 'weapons', gear: { heavy: true } });
  check(me.inv.weapon === 'heavy', 'a weapons specialist with the heavy blaster starts with it');
  me.inv.weapon = null; G.applyKit(me, { profession: 'weapons' });
  check(!me.inv.weapon, 'a weapons specialist alone starts empty-handed');
  G.applyKit(me, { profession: 'weapons', gear: { ownLaser: true } });
  check(me.inv.weapon === 'laser' && G.ITEMS.some(i => i.kind === 'laser'), '…with the first track upgrade, with their own laser gun (the ship\'s stays where it is)');
  me.inv.weapon = 'heavy'; me.x = 22.2; me.y = 4.5; me.face = 0;
  const walk = G.gearSpeed(me);
  const m = me.input.mouse; m.wx = me.x + 5; m.wy = me.y;
  m.right = true; m.rightClick = true; G.simTick(DT); tickN(G, 20);
  check(me.charge > 0 && G.gearSpeed(me) < walk * 0.5 && walk < 1, `carrying it slows you a bit (${walk}), charging a lot (${G.gearSpeed(me).toFixed(2)})`);
  m.right = false; G.simTick(DT);
  const shot = G.boarding.bolts.find(b => b.owner === 'crew');
  check(shot && (shot.dmg === 1 || shot.dmg === 2) && !shot.heavy && me.charge == null, `a quick click fires a normal shot (${shot?.dmg} damage)`);
  G.boarding.bolts.length = 0; me.inv.cd = 0;
  m.right = true; m.rightClick = true; G.simTick(DT); tickN(G, Math.ceil(G.BLASTER_CHARGE / DT) + 2); m.right = false; G.simTick(DT);
  const blast = G.boarding.bolts.find(b => b.owner === 'crew');
  check(blast?.heavy && blast.dmg === 3, 'held until charged: a 3-damage blast');
  // outside, the blast flies on as a cannon shell
  G.boarding.bolts.length = 0; me.inv.cd = 0; me.mode = 'eva'; me.x = -2; me.y = 12; m.wx = -10; m.wy = 12;
  const shells = G.combat.shells.length;
  m.right = true; m.rightClick = true; G.simTick(DT); tickN(G, Math.ceil(G.BLASTER_CHARGE / DT) + 2); m.right = false; G.simTick(DT);
  check(G.combat.shells.length === shells + 1, 'on a spacewalk the charged blast hits like a ship cannon (a shell)');
}
// --- engineer: reactor overcharge
{
  const G = loadGame(NAMES); G.startMission('practice'); const me = G.me;
  me.x = G.REACTOR.x - 2.5; me.y = G.REACTOR.y;
  G.applyKit(me, { profession: 'engineer' });
  check(!G.withCrew(me, () => G.clickTarget(G.REACTOR.x, G.REACTOR.y))?.run, 'only an engineer with the overcharge gear can overcharge the reactor');
  G.applyKit(me, { profession: 'engineer', gear: { overcharge: true } });
  G.withCrew(me, () => G.clickTarget(G.REACTOR.x, G.REACTOR.y).run());
  check(G.power.overcharge, 'clicking the reactor overcharges it');
  G.power.reactor.fuel = 5; G.power.reactor.t = 0; G.CAPACITORS.forEach(c => { c.charge = 0; });
  tickN(G, Math.ceil(G.ENERGY_TIME / 2 / DT) + 70);
  check(G.power.reactor.fuel === 4, 'overcharged, it makes energy twice as fast');
  let fires = 0, n = 0;
  for (let i = 0; i < 400; i++) { G.fires.length = 0; G.power.reactor.fuel = 5; G.power.reactor.t = G.ENERGY_TIME; G.simTick(DT); n++; if (G.fires.length) fires++; G.SYSTEMS.forEach(s => { s.broken = false; }); }
  check(fires > 15 && fires < 75, `…and catches fire about 1 in 10 energies (${fires}/${n})`);
  G.withCrew(me, () => G.clickTarget(G.REACTOR.x, G.REACTOR.y).run());
  check(!G.power.overcharge, 'clicking it again stops the overcharge');
}
// --- ship upgrades
{
  const G = loadGame(NAMES);
  G.startMission('c1', { ship: { cannons: true, caps: true, shields: true, inserter: true, spareCell: true } });
  check(G.SHOTS_PER_ENERGY === 4 && G.CAP_MAX === 4 && G.SHIELD_UP_TIME === 18, 'upgrades: 4 shots per energy, capacitors hold 4, shields last 18 s');
  const cells = G.missionCrew('c1', 1).cells;               // (the mission's fuel for one player, js/mission.js)
  check(G.power.reserve === cells - 1 + 1, `a spare fuel cell on top of the mission's ${cells}`);
  G.mission.active = false; G.power.reactor.fuel = 0; tickN(G, 60 * 2.2);
  check(G.power.reactor.fuel === 5 && G.power.reserve === cells - 1, 'the inserter loads the next fuel cell by itself');
  G.power.reactor.fuel = 1; G.power.reactor.t = 3; tickN(G, 60 * 2.2);
  check(G.power.reactor.fuel === 1 && G.power.reserve === cells - 1, 'the inserter leaves a part-full cell alone (it never swaps early)');
  const G2 = loadGame(NAMES); G2.startMission('c1');
  check(G2.SHOTS_PER_ENERGY === 3 && G2.CAP_MAX === 3, 'without upgrades everything is back to normal (capacitors hold 3)');
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
