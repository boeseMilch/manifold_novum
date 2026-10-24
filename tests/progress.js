// Progression and practice: rewards, profile migration (old saves must keep loading), gear and
// professions, ship upgrades, campaign objectives, and every practice-panel button.
// Run: node tests/progress.js
const { loadGame } = require('./harness');
const NAMES = ['SOLO_TREAT', 'treatInfo', 'missionCrew', 'GUNS', 'simTick', 'me', 'crew', 'mission', 'startMission', 'MISSIONS', 'CAMPAIGN', 'computeRewards', 'migrateProfile', 'defaultProfile', 'unlockedMissions',
  'applyKit', 'perk', 'hurtCrew', 'SHOTS_PER_ENERGY', 'CAP_MAX', 'power', 'ITEMS', 'dk', 'combat', 'combatSpawn', 'hitPoi', 'enemyToWorld', 'objectiveStatus',
  'PRACTICE', 'runCommand', 'withCrew', 'CAPACITORS', 'treatInfo', 'netServer', 'SHIELD_UP_TIME', 'endMission', 'boarding', 'spawnInvader', 'hurtInvader',
  'gearSpeed', 'creditMission', 'profile', 'lastReward', 'missionSuccess', 'MAX_DAMAGE', 'failGravity', 'ENERGY_TIME', 'REACTOR', 'clickTarget', 'fires', 'SYSTEMS', 'GEAR', 'BLASTER_CHARGE', 'inv', 'evs', 'repairSpeed'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.simTick(DT); };

// --- rewards
{
  const G = loadGame(NAMES);
  const won = { jumped: true, objective: true, pirates: 3 };
  const r = G.computeRewards('c1', won, true, true);
  check(r.money === 120 + 3 * 16 && r.rep === 2 && !('xp' in r), `First Contract: $120 + $16 per pirate, reputation (+1 first clear), no XP → $${r.money}, ★${r.rep}`);
  const two = G.computeRewards('c1', { jumped: true, objective: true, pirates: 2 }, true, true).money;
  const cheap = G.GEAR.filter(g => !g.prof && g.cost <= two);
  check(two >= 150 && two < 300 && cheap.length >= 2, `a first chapter 1 run ($${two}) buys one $150 item, with a choice (${cheap.map(g => g.id).join(', ')})`);
  const down = G.computeRewards('c1', won, false, false);
  check(down.money === 168, 'not back aboard on your feet: the crew still gets paid');
  check(G.GEAR.every(g => !('level' in g)) && Object.values(G.MISSIONS).every(m => !('xp' in (m.rewards || {}))), 'no levels on gear, no XP in the rewards: money is all the locker asks for');
  const old = { c2: 150, c3: 200, c4: 200, c5: 300, c6: 300, c7: 350, c8: 500 };   // (the pay before 2026-10-16: ×0.4 now, so you have to choose)
  check(Object.entries(old).every(([id, m]) => G.MISSIONS[id].rewards.money === m * 0.4) && G.MISSIONS.c4.rewards.perPirate === 20 && G.MISSIONS.c2.rewards.rep === 1 && G.MISSIONS.c8.rewards.rep === 5,
    'chapters 2-8 pay 40% of the old money (bounty too), reputation unchanged');
  check(G.computeRewards('rush', { jumped: true, objective: false, pirates: 0 }, true, false).money === 16, 'a skirmish pays $16 (was $40)');
  const clean = (damage, maxDamage = 5) => G.computeRewards('c1', { ...won, damage, maxDamage }, true, false);
  check(clean(0).money === 168 + 25 && clean(0).clean === 25 && clean(2).clean === 15 && clean(4).clean === 5 && clean(5).clean === 0 && clean(5, 6).clean === 4 && clean(0).rep === 1,
    `up to $25 for bringing the ship back in one piece: 0/5 damage $${clean(0).clean}, 2/5 $${clean(2).clean}, 4/5 $${clean(4).clean}, 5/5 $${clean(5).clean} (reinforced 5/6: $${clean(5, 6).clean})`);
  check(G.computeRewards('c1', { jumped: false, objective: false, pirates: 0, damage: 0, maxDamage: 5 }, false, false).money === 0, '…and nothing if the ship didn\'t jump');
  const lost = G.computeRewards('c1', { jumped: false, objective: false, pirates: 1 }, false, false);
  check(lost.money === 0 && lost.rep === 0, 'the ship didn\'t make it: nothing');
  const half = G.computeRewards('c3', { jumped: true, objective: false, pirates: 0 }, true, false);
  check(half.money === G.MISSIONS.c3.rewards.money && half.rep === 0, 'jumped without the objective: paid, but no reputation');
}
// --- success needs the objective: pay either way, reputation / finished / unlock only with it
{
  const credit = (id, results) => {           // one run of mission `id`, credited to this browser's profile
    const G = loadGame(NAMES); G.startMission(id);
    G.mission.over = { won: true, reason: 'test', t: 0, survived: true, results: { kills: 0, crew: [{ id: G.me.id, survived: true }], ...results } };
    G.creditMission();
    return G;
  };
  const R1 = credit('c1', { jumped: true, objective: true, pirates: 2 });
  check(R1.profile.money === 120 + 2 * 16 && R1.profile.rep === 2 && R1.profile.xp === 0 && R1.profile.done.c1 === 1 && R1.unlockedMissions(R1.profile).has('c2') && R1.lastReward.unlocked && !R1.lastReward.objFailed && R1.lastReward.profession,
    'success (jumped, objective done): paid, reputation (+1 first clear), finished, next chapter unlocked, professions open (no XP)');
  const R2 = credit('c1', { jumped: true, objective: false, pirates: 1 });
  check(R2.profile.money === 120 + 16 && R2.profile.rep === 0 && !R2.profile.done.c1 && !R2.unlockedMissions(R2.profile).has('c2') && !R2.lastReward.profession,
    'jumped without the objective: base pay + per pirate, but no reputation, not finished, next chapter stays locked');
  check(R2.lastReward.objFailed && R2.lastReward.locked === R2.MISSIONS.c2.name && !R2.lastReward.unlocked, '…and the end screen says so (objective failed, next chapter locked)');
  const R3 = credit('c7', { jumped: true, objective: false, pirates: 0 });
  check(R3.missionSuccess('c7', { jumped: true, objective: false }) && R3.profile.done.c7 === 1 && R3.profile.rep === R3.MISSIONS.c7.rewards.rep + 1 && R3.unlockedMissions(R3.profile).has('c8') && !R3.lastReward.objFailed,
    'a mission without an objective: surviving the jump is a success (finished, reputation, next chapter)');
  const R4 = credit('c1', { jumped: false, objective: true, pirates: 2 });
  check(R4.profile.money === 0 && R4.profile.rep === 0 && !R4.profile.done.c1, 'the ship didn\'t jump out: nothing, even with the objective');
  // multiplayer: the crew flies the host's ship (mission.shipOf from the server); only the host gets reputation
  const mp = (hostIsMe) => {
    const G = loadGame(NAMES); G.startMission('c1');
    G.mission.shipOf = { id: hostIsMe ? G.me.id : G.me.id + 100, name: 'Hosty' };
    G.mission.over = { won: true, reason: 'test', t: 0, survived: true, results: { kills: 0, crew: [{ id: G.me.id, survived: true }], jumped: true, objective: true, pirates: 2 } };
    G.creditMission();
    return G;
  };
  const H = mp(true), Gu = mp(false);
  check(H.profile.rep === 2 && H.profile.money === 120 + 2 * 16, 'multiplayer host: money and reputation, as solo');
  check(Gu.profile.rep === 2 && Gu.lastReward.rep === 2 && Gu.profile.money === 120 + 2 * 16 && Gu.profile.done.c1 === 1 && Gu.unlockedMissions(Gu.profile).has('c2') && Gu.lastReward.unlocked,
    'multiplayer guest: their own money, reputation and finished chapter (next one unlocked), like the host');
}
// --- profiles: old and odd saves still load
{
  const G = loadGame(NAMES);
  const p = G.migrateProfile({ xp: '120', money: 30, ship: { cannons: true }, someFutureField: 7 });
  check(p.xp === 120 && p.v === 4 && p.ship.cannons && p.gear && p.done && p.someFutureField === 7, 'an old save is migrated: numbers fixed, missing fields added, unknown ones kept');
  const v1 = G.migrateProfile({ v: 1, gear: { paint: true, boots: true }, paint: '#3a8fc4', ship: { kit2: true, autodoc: true, caps: true }, profession: 'security' });
  check(!v1.gear.paint && v1.gear.boots && v1.paint === '#3a8fc4' && !v1.ship.kit2 && !v1.ship.autodoc && v1.ship.caps && v1.profession === 'weapons',
    'v1 → v2: paint is free (color kept), auto-doc and second kit dropped, Security is now Weapons specialist');
  const v2a = G.migrateProfile({ v: 2, profession: 'gunner', gear: { trauma: true, stim: true } }), v2b = G.migrateProfile({ v: 2, profession: 'medic', gear: {} });
  check(v2a.profession === 'weapons' && !v2a.gear.trauma && v2a.gear.stim && v2b.profession === null && v2b.gear.firstAid && v2a.v === 4,
    'v2 → v3: Gunner becomes Weapons specialist, a medic gets the first aid course, trauma kit dropped, stim pack kept');
  const eng = G.migrateProfile({ v: 3, xp: 500, money: 40, profession: 'engineer', gear: { armor: true, boots: true, toolbelt: true }, done: { c1: 1 }, futureThing: 'x' });
  check(!eng.gear.armor && eng.money === 260 && eng.gear.boots && eng.gear.toolbelt && eng.profession === 'engineer' && eng.xp === 500 && eng.done.c1 === 1 && eng.futureThing === 'x' && eng.v === 4,
    'v3 → v4: an engineer with the armor vest (weapons gear now) gets its $220 back, everything else kept');
  const none = G.migrateProfile({ v: 3, money: 0, profession: null, gear: { armor: true } });
  check(!none.gear.armor && none.money === 220 && none.profession === null, '…so does a player without a profession');
  const wpn = G.migrateProfile({ v: 3, money: 10, profession: 'weapons', gear: { armor: true, ownLaser: true } });
  check(wpn.gear.armor && wpn.money === 10 && wpn.gear.ownLaser, '…a weapons specialist keeps the vest (no refund)');
  const gun = G.migrateProfile({ v: 2, money: 5, profession: 'gunner', gear: { armor: true } });
  check(gun.gear.armor && gun.money === 5 && gun.profession === 'weapons', '…as does a v2 gunner (a weapons specialist since v3)');
  const again = G.migrateProfile(eng);
  check(again.money === 260 && !again.gear.armor, 'migrating twice refunds nothing twice');
  check(G.migrateProfile(null).xp === 0 && G.migrateProfile('garbage').money === 0, 'a broken save gives a fresh profile instead of crashing');
  const u = G.unlockedMissions({ ...G.defaultProfile(), done: { c1: 1, c2: 1 } });
  check(u.has('c3') && !u.has('c4') && u.has('practice'), 'finishing a chapter unlocks the next one');
}
// --- gear, professions
{
  const G = loadGame(NAMES); const me = G.me;
  G.applyKit(me, { gear: { boots: true }, profession: 'engineer' });
  check(!me.inv.weapon, 'an engineer alone doesn\'t start with a repair kit');
  G.applyKit(me, { gear: { boots: true, ownKit: true }, profession: 'engineer' });
  check(me.inv.weapon === 'repair', '…the first track upgrade gives them their own');
  G.applyKit(me, { gear: { armor: true }, profession: 'engineer' });
  check(me.armor === 0 && G.GEAR.find(g => g.id === 'armor').prof === 'weapons', 'the armor vest is weapons-specialist gear: an engineer gets nothing from it');
  me.inv.weapon = null; G.applyKit(me, { gear: { armor: true, boots: true }, profession: 'weapons' });
  check(me.armor === 1, '…a weapons specialist wears it');
  check(G.GEAR.filter(g => g.prof === 'weapons').map(g => g.id).join() === 'ownLaser,armor,heavy' && !G.GEAR.find(g => g.id === 'firstAid').prof,
    'weapons track: own laser gun, armor vest, heavy blaster; the first aid course is general gear');
  G.hurtCrew(me);
  check(me.health === 'ok' && me.armor === 0, 'the armor vest shrugs off the first hit');
  G.hurtCrew(me);
  check(me.health === 'hurt', '…but not the second');
  const x0 = me.x; me.health = 'ok'; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  const fast = me.x - x0;
  G.applyKit(me, {}); me.x = x0; me.vx = 0; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  check(fast > (me.x - x0) * 1.1, `gravity boots: faster walking (${fast.toFixed(2)} vs ${(me.x - x0).toFixed(2)})`);
  G.applyKit(me, { gear: { firstAid: true } }); me.health = 'down';
  check(G.withCrew(me, () => G.treatInfo(me)).time === 8, 'with the first aid course you patch yourself up in 8 s (it\'s for treating others: only a bit faster on yourself)');
  G.applyKit(me, { gear: { firstAid: true, stim: true } });
  check(G.withCrew(me, () => G.treatInfo(me)).time === 3, 'first aid course and stim pack together: the stim pack wins (3 s)');
  G.applyKit(me, { profession: 'engineer', gear: { stim: true } });
  check(G.withCrew(me, () => G.treatInfo(me)).time === 3, '…in 3 s with a stim pack (anyone can use it)');
  me.health = 'out';                                    // out cold, alone (2026-10-20: the gear counts here too)
  const outT = (gear) => { G.applyKit(me, { gear }); return G.withCrew(me, () => G.treatInfo(me))?.time; };
  check(outT({ stim: true }) === 6 && outT({ firstAid: true }) === 16 && outT({ firstAid: true, stim: true }) === 6 && outT({}) === G.SOLO_TREAT,
    `out cold and alone: crawl back up in 6 s with a stim pack, 16 s with first aid (6 s with both), ${G.SOLO_TREAT} s without (${outT({ stim: true })} / ${outT({ firstAid: true })} / ${outT({})})`);
  me.health = 'down'; G.applyKit(me, { profession: 'engineer', gear: { stim: true } });
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
// --- one profession, for good (Start over gives a fresh profile, and a new choice)
{
  const G = loadGame(['pickProfession', 'professionWhy', 'PROFESSIONS', 'defaultProfile']);
  const [E, W] = ['engineer', 'weapons'].map(id => G.PROFESSIONS.find(x => x.id === id));
  const p = { ...G.defaultProfile() };
  check(!G.pickProfession(p, 'engineer') && p.profession === null && /after chapter 1/.test(G.professionWhy(p, E)), 'no profession before chapter 1 is finished');
  const old = { ...G.defaultProfile(), xp: 120 };
  check(G.professionWhy(old, E) === '', '…but a save that reached level 2 (100 XP) before XP went away keeps it open');
  p.done.c1 = 1;
  check(G.professionWhy(p, E) === '' && G.professionWhy(p, W) === '' && !G.pickProfession(p, 'pilot'), 'chapter 1 finished: both open (an unknown id is refused)');
  check(G.pickProfession(p, 'weapons') && p.profession === 'weapons', 'pick the weapons specialist');
  check(!G.pickProfession(p, 'engineer') && p.profession === 'weapons', '…and it sticks: no switching to engineer');
  check(G.professionWhy(p, W) === '' && /You're a Weapons specialist — Start over/.test(G.professionWhy(p, E)), '…the locker says why (Start over to choose again)');
  const fresh = { ...G.defaultProfile(), done: { c1: 1 } };
  check(G.pickProfession(fresh, 'engineer') && fresh.profession === 'engineer', 'a fresh profile (Start over) chooses again');
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
// --- reinforced hull: the ship survives one more broken part (6 instead of 5), and only in that mission
{
  const G = loadGame(NAMES);
  G.startMission('intro', { ship: { hull: true } }); G.combat.enemies.length = 0;
  check(G.MAX_DAMAGE === 6, 'reinforced hull: the ship takes 6 broken parts');
  G.SYSTEMS.slice(0, 6).forEach(s => { s.broken = true; }); G.simTick(DT);
  check(!G.mission.over, '…6 broken at once: still flying');
  G.SYSTEMS[6].broken = true; G.simTick(DT);
  check(G.mission.over?.won === false && /fell apart/.test(G.mission.over.reason), '…the 7th loses the ship');
  G.startMission('intro');
  check(G.MAX_DAMAGE === 5, 'the next mission without the upgrade: back to 5 (it doesn\'t leak between missions)');
}
// --- campaign objectives
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  check(!G.mission.events.some(e => e.kind === 'intruder'), 'chapter 1 has no intruder');
  G.combatSpawn('pirate', 'port'); const e = G.combat.enemies.find(e => e.kind === 'pirate');
  for (const p of e.pois) G.hitPoi(e, p, ...G.enemyToWorld(e, ...p.c));
  check(G.dk.defeated === 1, 'shooting a pirate raider to scrap counts as a pirate defeated');
  const G2 = loadGame(NAMES); G2.startMission('c2');
  check(G2.mission.events.some(e => e.kind === 'intruder' && e.count === 2) && G2.mission.objective.kind === 'intruder' && G2.mission.objective.count === 2, 'chapter 2 has two intruders (objective: kill both)');
  G2.mission.active = false; G2.spawnInvader('port'); G2.spawnInvader('star'); const [a, b] = G2.boarding.invaders; a.state = b.state = 'wander';
  G2.hurtInvader(a, 99); tickN(G2, 2);
  const half = G2.objectiveStatus();
  check(!half.done && /1\/2/.test(half.text) && /an intruder still alive/.test(half.fail), `one of two dead: not done yet ("${half.text}", "${half.fail}")`);
  G2.hurtInvader(b, 99); tickN(G2, 2);
  check(G2.objectiveStatus().done, 'killing both completes the objective');
  for (const id of G.CAMPAIGN) { const M = G.MISSIONS[id]; const G3 = loadGame(NAMES); G3.startMission(id); check(G3.mission.events.length > 0 && M.briefing.length > 80, `${M.name}: briefing and ${G3.mission.events.length} events`); }
}
// --- results per crew member
{
  const G = loadGame(NAMES); G.netServer.init('c1'); G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  G.netServer.addCrew(3, 'C');
  const [A, B, C] = G.crew; B.mode = 'eva'; C.mode = 'gun'; C.gun = G.GUNS[0];
  G.endMission(true, 'test');
  const r = G.mission.over.results;
  check(r.crew.find(c => c.id === 1).survived && !r.crew.find(c => c.id === 2).survived, 'at the end, only crew inside the ship and on their feet count as survived');
  check(r.crew.find(c => c.id === 3).survived, 'a gunner in a cannon counts as aboard (gets the XP)');
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
// --- skirmish twins of campaign chapters: hidden from the menu, still defined; old saves that finished them load fine
{
  const G = loadGame(['SKIRMISH', 'SKIRMISH_TWIN', 'MISSIONS', 'CAMPAIGN', 'migrateProfile', 'unlockedMissions']);
  const twins = Object.entries(G.SKIRMISH_TWIN);
  check(twins.every(([s, c]) => G.MISSIONS[s] && G.SKIRMISH.includes(s) && G.CAMPAIGN.includes(c) && G.MISSIONS[s].objective?.kind === G.MISSIONS[c].objective?.kind),
    'every hidden skirmish is still defined and has the same objective as its campaign twin');
  check(G.SKIRMISH.filter(id => !G.SKIRMISH_TWIN[id]).join() === 'intro,rush', 'the menu\'s skirmishes: Intro run and Rush hour');
  const old = G.migrateProfile({ v: 2, xp: 900, money: 50, rep: 3, done: { c1: 1, c2: 1, c3: 2, c4: 1, salvage: 3, pirates: 1, ore: 1 }, ship: {}, gear: {}, profession: null, paint: null });
  const u = G.unlockedMissions(old);
  check(old.done.salvage === 3 && old.done.pirates === 1 && old.done.c3 === 2, 'an old save with skirmish completions loads and keeps them');
  check(['c1', 'c2', 'c3', 'c4', 'c5'].every(id => u.has(id)), 'finished chapters stay playable (replay from the campaign) and the next one is open');
}
// --- Locker / Shipyard choices: owned, available or locked (with why) at a glance
{
  const G = loadGame(['shopItem']);
  const own = G.shopItem('data-gear="boots"', 'Gravity boots', 'd', { own: true, price: '$150' });
  const avail = G.shopItem('data-gear="boots"', 'Gravity boots', 'd', { price: '$150' });
  const locked = G.shopItem('data-ship="caps"', 'Bigger capacitors', 'd', { price: '★5', why: 'Need ★1 more reputation (missions)' });
  check(/class="item chosen"/.test(own) && /disabled/.test(own) && /OWNED/.test(own), 'owned: latched, not clickable, says OWNED');
  check(/class="item avail"/.test(avail) && !/disabled/.test(avail) && /tag price">\$150/.test(avail), 'available: clickable, with its price tag');
  check(/class="item locked"/.test(locked) && /disabled/.test(locked) && /padlock/.test(locked) && /Need ★1 more reputation/.test(locked), 'locked: not clickable, padlock and why');
}
// --- the skirmish builder (Skirmish tab): n encounters from the ticked kinds, round(n/5)..round(n/3) failing parts on ticked parts, no pay
{
  const G = loadGame([...NAMES, 'customConfig', 'CUSTOM_KINDS', 'CUSTOM_PARTS', 'maintPrev']);
  const def = G.customConfig(null);
  check(def.n === 8 && def.kinds.length === G.CUSTOM_KINDS.length && def.parts.length === G.CUSTOM_PARTS().length
    && !def.kinds.some(k => ['leviathan', 'leviathan_boss', 'brig', 'derelict', 'rock', 'maintenance'].includes(k)), 'default config: 8 encounters, every kind and part ticked, no boss / story kinds');
  const bad = G.customConfig({ n: 99, kinds: ['interceptor', 'leviathan', 'bogus', 'interceptor'], parts: ['Reactor', 'Nope'] });
  check(bad.n === 30 && bad.kinds.join() === 'interceptor' && bad.parts.join() === 'Reactor', 'a config is cleaned: n ≤ 30, only known kinds / parts, no doubles');
  let ok = true, fails = new Set(), tides = 0;
  for (let k = 0; k < 40; k++) {
    G.startMission('custom', { custom: { n: 15, kinds: ['interceptor', 'swarm', 'tide'], parts: ['Reactor', 'Power lever'] } });
    const ev = G.mission.events, m = ev.filter(e => e.kind === 'maintenance');
    fails.add(m.length);
    tides = Math.max(tides, ev.filter(e => e.kind === 'tide').length);
    if (ev.length !== 15 || !m.every(e => ['Reactor', 'Power lever'].includes(e.sys.name)) || !ev.every(e => ['interceptor', 'swarm', 'tide', 'maintenance'].includes(e.kind))
      || G.missionCrew('custom', 1).cells !== 10 || G.mission.jumpAt !== 300) ok = false;
  }
  check(ok && [...fails].every(n => n >= 3 && n <= 5) && tides <= 1, `15 encounters: 3-5 failing parts (seen ${[...fails].sort()}), only on the ticked parts, the rest of the ticked kinds, one tide at most, 10 fuel cells, the jump at 300 s`);
  G.startMission('custom', { custom: { n: 5, kinds: [], parts: ['Reactor'] } });
  check(G.mission.events.length === 5 && G.mission.events.every(e => e.kind === 'maintenance' && e.sys.name === 'Reactor'), 'no kinds ticked: every encounter a failing part (one ticked part: reused)');
  G.startMission('custom', { custom: { n: 6, kinds: ['flare'], parts: [] } });
  check(G.mission.events.length === 6 && G.mission.events.every(e => e.kind === 'flare'), 'no parts ticked: no failing parts');
  G.startMission('custom', { custom: { n: 4, kinds: ['interceptor'], parts: ['Reactor'] } });
  G.mission.over = { results: { jumped: true, crew: [{ id: G.me.id, survived: true }] } };
  const money = G.profile.money; G.creditMission();
  check(G.profile.money === money && !G.profile.done.custom, 'a custom skirmish pays nothing and counts as no completion');
  G.netServer.init('custom', {}, 0, null, { n: 3, kinds: ['frigate'], parts: [] });
  check(G.mission.events.length === 3 && G.mission.events.every(e => e.kind === 'frigate'), 'multiplayer: the host\'s config reaches the server\'s mission (netServer.init)');
  G.startMission('c1');
  check(!G.mission.custom, 'other missions carry no custom config');
}
process.exitCode = failed ? 1 : 0;
