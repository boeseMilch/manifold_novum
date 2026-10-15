// Progression: the campaign (story, briefings, objectives, rewards), ship upgrades bought with
// reputation, personal gear bought with money, professions (from level 2), and each player's saved
// profile (a cookie in their own browser).
//
//   Simulation side (browser and server): definitions, applyShipUpgrades(), applyKit(), perk(),
//   missionResults().
//   Browser side: the profile (load/save/migrate), rewards after a mission, the lobby UI, the
//   locker and the shipyard.
//
// PROFILES ARE SAVED IN PLAYERS' BROWSERS: keep loadProfile() able to read every older version
// (bump PROFILE_VERSION and add a migration step; never rename or drop fields without one).

const PROFILE_VERSION = 3;
const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const levelOf = (xp) => { let l = 1; while (l < XP_LEVELS.length && xp >= XP_LEVELS[l]) l++; return l; };

// ---------------------------------------------------------------------------
// Ship upgrades (reputation) — one for (nearly) every system
// ---------------------------------------------------------------------------
const SHIP_UPGRADES = [
  { id: 'spareCell', name: 'Spare fuel cell', rep: 2, desc: 'One more spare fuel cell in the crate.' },
  { id: 'coffee', name: 'Proper coffee machine', rep: 2, desc: 'The kitchen coffee mug refills in 20 s instead of a minute.' },
  { id: 'inserter', name: 'Reactor fuel inserter', rep: 3, desc: 'Loads a fresh fuel cell into an empty reactor by itself (switch it off at the crate\'s handle).' },
  { id: 'cannons', name: 'Efficient cannons', rep: 3, desc: '4 shots per energy instead of 3.' },
  { id: 'airlocks', name: 'Faster airlock pumps', rep: 3, desc: 'Deck airlocks cycle in 0.7 s instead of 1.3 s.' },
  { id: 'radar', name: 'Long-range radar', rep: 4, desc: 'The radar sees 60 s ahead instead of 45 s.' },
  { id: 'shields', name: 'Longer shields', rep: 4, desc: 'Shields stay up 18 s instead of 15 s.' },
  { id: 'caps', name: 'Bigger capacitors', rep: 5, desc: 'Capacitors hold 4 energy instead of 3.' },
  { id: 'hull', name: 'Reinforced hull', rep: 5, desc: 'The ship holds together with one more broken part (6 instead of 5).' },
  { id: 'sprinklers', name: 'Fire sprinklers', rep: 5, desc: 'Fires spread and burn parts out a third slower (22 s instead of 15 s).' },
];
// A mission's prerequisites (MISSIONS[id].needs: { ship: [upgrade ids], overcharge }), as warning lines for
// the lobby: without them the energy isn't enough (tools/balance.js --calibrate). Not a hard block.
function missionRequirements(id) {
  const N = MISSIONS[id]?.needs, out = [];
  if (!N) return out;
  const names = (N.ship || []).map(u => SHIP_UPGRADES.find(x => x.id === u)?.name).filter(Boolean);
  if (names.length) out.push(`Recommended: ${names.join(', ')}`);
  if (N.overcharge) out.push('Recommended: an engineer with reactor overcharge');
  return out;
}
// ---------------------------------------------------------------------------
// Personal gear (money): general gear for anyone, and a track of gear per profession (level 2+;
// only usable in that profession).
// ---------------------------------------------------------------------------
const GEAR = [
  { id: 'boots', name: 'Gravity boots', cost: 150, level: 1, desc: 'Walk 15% faster, and keep walking where gravity fails.' },
  { id: 'thrusters', name: 'Suit thrusters', cost: 180, level: 2, desc: 'Spacewalk 30% faster.' },
  { id: 'firstAid', name: 'First aid course', cost: 150, level: 2, desc: 'Treat crewmates in 1.2 s instead of 2 s. Down? Patch yourself up in 6 s instead of 10 s.' },
  { id: 'armor', name: 'Armor vest', cost: 220, level: 3, desc: 'Shrugs off the first hit you take each mission.' },
  { id: 'stim', name: 'Stim pack', cost: 250, level: 4, desc: 'Down? Patch yourself up in 3 s.' },
  { id: 'ownKit', prof: 'engineer', name: 'Own repair kit', cost: 100, level: 2, desc: 'Start every mission with your own repair kit (on top of the ship\'s).' },
  { id: 'toolbelt', prof: 'engineer', name: 'Toolbelt', cost: 200, level: 3, desc: 'Repairs go another 25% faster.' },
  { id: 'overcharge', prof: 'engineer', name: 'Reactor overcharge', cost: 300, level: 4, desc: 'Overcharge the reactor (at the reactor): double speed, 10% fire risk per energy.' },
  { id: 'ownLaser', prof: 'weapons', name: 'Own laser gun', cost: 120, level: 2, desc: 'Start every mission with your own laser gun (on top of the ship\'s).' },
  { id: 'heavy', prof: 'weapons', name: 'Heavy blaster', cost: 300, level: 3, desc: 'Start with a heavy blaster: harder hits, slower fire. Hold to charge a blast that hits like a cannon. Heavy: slows you down, a lot while charging.' },
];
const PROFESSIONS = [
  { id: 'engineer', name: 'Engineer', desc: 'Repairs 20% faster.' },
  { id: 'weapons', name: 'Weapons specialist', desc: 'Fires the laser gun and the heavy blaster 35% faster. Reloads cannons 50% faster.' },
];
const PAINTS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#e8e4dc', '#2b303a', '#ff7ab0'];

// ---------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------
const evAt = (kind, t, more = {}) => ({ t, kind, ...more });
const CAMPAIGN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
Object.assign(MISSIONS, {
  c1: {
    name: '1 · First Contract', tier: 1, campaign: 1, rewards: { money: 100, perPirate: 40, rep: 1, xp: 80 },
    crew: {events: [2, 5, 8, 11, 14, 14, 17, 20], cells: [3, 3, 7, 8, 12, 12, 15, 18], reactor: [0.5, 0.7, 0.7, 0.85, 0.6, 0.6, 0.5, 0.4]},   // --calibrate: 51% 66% 68% 70% 66% 72% 71% 70% idle for 1-8 players (aim 55.5% solo, 67.5% for 2-8)
    essential: ['pirates'],                   // never dropped for a small crew (objective / story)
    objective: { kind: 'pirates', count: 2 }, rules: {},
    blurb: 'Clear pirate raiders out of the trade lanes. $40 per pirate.',
    briefing: 'Congratulations on your new (used) ship! The Manifold Novum is held together by duct tape, optimism and one very large cat.\n\nFirst job, from the Tollgate Trade Guild: pirate raiders are robbing freighters in the Kessler lanes. The Guild pays $40 per pirate: raiders shot to scrap and boarders both count. If a raider docks, its crew comes over to steal. Make them regret it.\n\nTip: shoot the glowing blue bits.',
    build: () => [evAt('pirates', 30, { side: randSide() }), evAt('interceptor', 85, { side: randSide() }), evAt('pirates', 145, { side: randSide() }), evAt('swarm', 205), evAt('maintenance', 255, { radar: false })],
  },
  c2: {
    name: '2 · Strange Cargo', tier: 1, campaign: 2, rewards: { money: 150, rep: 1, xp: 100 },
    // events set by hand (the user's playtest: two aliens + opener + frigate, clearly harder than the model's aim); cells and
    // reactor fitted for them like --calibrate does (fewest cells / mildest reactor in spec): ~36% 61% 66% 74% idle for 1-4 players
    crew: {events: [3, 4, 7, 7, 12, 15, 17, 19], cells: [3, 5, 5, 5, 17, 15, 15, 15], reactor: [0.25, 0.3, 0.7, 0.7, 0.12, 0.25, 0.25, 0.25]},
    essential: ['intruder'],
    finaleLead: 70,                           // the frigate finale comes 70 s before the jump (not 22): time for its heavy shots to matter
    objective: { kind: 'intruder', count: 2 }, rules: {},
    blurb: 'Two somethings crawled out of the bonus salvage pod. Kill them both.',
    briefing: 'The Guild paid up — and threw in a sealed salvage pod as a bonus. Halfway through the next jump, the pod\'s seal hissed open.\n\nTwo somethings with too many legs are loose on the ship: one prowls the upper deck, the other the lower. They force their way around, room by room, hunting whoever they can find. Lock them in with the security console, get a weapon, and kill them both, one at a time if you can. The Xenobiology Institute will pay for the remains.',
    // solo: the opener (asteroids or an interceptor, at random), the two aliens (the objective), the frigate (the finale);
    // bigger crews add the mine drone, the maintenance failure, a jammed cannon and the antenna (DROP_ORDER), then repeats
    build: () => [Math.random() < 0.5 ? evAt('swarm', 50, { opener: true }) : evAt('interceptor', 50, { side: randSide(), opener: true }), evAt('intruder', 90, { side: randSide(), count: 2 }),
                  evAt('mines', 130, { side: randSide() }), evAt('debris', 160, { gun: ['port', 'front', 'star'][Math.floor(Math.random() * 3)] }),
                  evAt('maintenance', 190, { radar: false }), evAt('antenna', 220, { radar: false }), evAt('frigate', 250, { side: randSide() })],
  },
  c3: {
    name: '3 · The Empty Lab', tier: 2, campaign: 3, rewards: { money: 200, rep: 2, xp: 140 },
    crew: {events: [2, 4, 7, 10, 12, 15, 17, 19], cells: [2, 2, 6, 6, 9, 11, 11, 13], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 49% 71% 66% 69% 67% 65% 66% 66% idle for 1-8 players (aim 54.5% solo, 66.5% for 2-8); base ship: ×3: front cannon waits 17 s at 339 s; ×4: front cannon waits 16 s at 264 s
    needs: {ship: ['cannons'], overcharge: true},
    objective: { kind: 'blackbox' }, rules: { breach: true },
    blurb: 'Dr. Varga\'s lab went quiet. Bring back its black box.',
    briefing: 'The Institute wants to talk to the only expert on those things: Dr. Ilse Varga. Her research station went quiet a week ago.\n\nWhen you arrive, the lab module is drifting — dark, airless, its door jammed. We\'ll tether to it. Get inside, find the station\'s black box and carry it home (it\'s heavy). Watch the hull: big hits can tear holes in it now.\n\nAnd something is asleep in there. Don\'t wake it.',
    // a calm half minute, a scavenger at the station (the opener), then the lab, then trouble on the way out
    build: () => [evAt('interceptor', 30, { side: randSide(), opener: true }), evAt('derelict', 70, { side: randSide() }), evAt('mines', 110, { side: randSide() }), evAt('swarm', 150),
                  evAt('maintenance', 190, { radar: false }), evAt('flare', 230)],
  },
  c4: {
    name: '4 · Red Comet Cove', tier: 2, campaign: 4, rewards: { money: 200, perPirate: 50, rep: 2, xp: 160 },
    crew: {events: [3, 4, 7, 13, 17, 23, 23, 23], cells: [2, 2, 2, 11, 14, 17, 17, 17], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 34% 68% 68% 65% 65% 67% 72% 76% idle for 1-8 players (aim 54.0% solo, 66.0% for 2-8); base ship: ×4: front cannon waits 27 s at 280 s
    needs: {ship: ['cannons', 'inserter'], overcharge: true},
    essential: ['pirates'],
    objective: { kind: 'pirates', count: 3 }, rules: { breach: true, surge: true },
    blurb: 'Pirates took Dr. Varga. Hunt the Red Comet gang.',
    briefing: 'The black box recording is clear: pirates of the Red Comet gang boarded the lab and dragged Dr. Varga away.\n\nTheir raiders patrol the Cove. Take them on — defeat at least three pirates. If they dock, board them back: their loot crate is full, and jamming their reactor sends them running. Power lines can arc now; splice them with the repair kit.',
    // a calm half minute, a Red Comet scout (the opener), then the raiders; a part fails in between (bigger crews)
    build: () => [evAt('interceptor', 30, { side: 'star', opener: true }), evAt('pirates', 70, { side: 'port' }), evAt('maintenance', 110, { radar: false }), evAt('pirates', 150, { side: randSide() }),
                  evAt('mines', 190, { side: randSide() }), evAt('glitch', 230, { radar: false }), evAt('swarm', 270)],
  },
  c5: {
    name: '5 · Rescue Dr. Varga', tier: 3, campaign: 5, rewards: { money: 300, rep: 3, xp: 200 },
    // set by hand: the whole mission is the pirate base. A patrol interceptor (the opener), then we dock (once it's
    // gone: EVENT_RUNNERS.brig); the jump is due 240 s later (finaleLead), sooner once she's aboard and we've
    // detached (js/dock.js ESCAPE_SPOOL). A bigger crew gets more guards in the base, not more encounters
    // (stationGuards); easy / very easy take guards out (and give luck: nothing here to drop).
    crew: {events: [2, 2, 2, 2, 2, 2, 2, 2], cells: [3, 3, 4, 4, 5, 5, 6, 6], overcharge: [true, true, true, true, true, true, true, true]},
    needs: {ship: ['cannons', 'inserter'], overcharge: true},
    length: 300, finaleLead: 240,
    objective: { kind: 'rescue', npc: 'Dr. Varga' }, rules: { breach: true, surge: true, gravity: true },
    blurb: 'Storm the Red Comet\'s base, room by room, and get Dr. Varga out.',
    briefing: 'We found the Red Comet\'s hideout: a rusty base out in the Cove. Dr. Varga is locked up somewhere inside — hurt, by the sound of her distress ping.\n\nDeal with their patrol, then we dock. Grab a weapon first: they\'ll rush out the moment the tube opens (and drop their guns when they fall). Fight through the base room by room: a busted security terminal (repair it, then hack it) and a door code somebody surely wrote down.\n\nPatch her up (hold click or E on her) and she runs for our ship on her own. Cover her: if she\'s hit, she goes down again. The engine stays off while we\'re docked or anyone is still over there: once she\'s aboard, detach at our airlock and jump.',
    build: () => [evAt('interceptor', 25, { side: randSide(), opener: true }), evAt('brig', 60, { side: randSide() })],
  },
  c6: {
    name: '6 · Spore Season', tier: 3, campaign: 6, rewards: { money: 300, rep: 3, xp: 220 },
    crew: {events: [4, 5, 9, 11, 14, 18, 23, 24], cells: [3, 3, 9, 12, 17, 16, 24, 24], reactor: [1, 1, 0.7, 0.85, 0.7, 1, 0.7, 0.85], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 40% 68% 66% 67% 67% 65% 65% 69% idle for 1-8 players (aim 53.0% solo, 65.0% for 2-8); base ship: ×3: star cannon waits 20 s at 292 s; ×4: port cannon waits 4 s at 223 s
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    essential: ['spores', 'leeches'],
    objective: { kind: 'ore' }, rules: { breach: true, surge: true, plasma: true },
    blurb: 'Drill a sample of the living rock in the Mire Nebula.',
    briefing: 'Dr. Varga is grateful — and terrified. The intruders\' DNA matches the spore fields of the Mire Nebula, where those creatures nest.\n\nShe needs a sample of the living rock they grow on. One will drift right in front of us: take the mining drill (left airlock room), spacewalk out, drill a sample and bring it inside. The nebula will notice. Expect spores, barnacles and leeches.',
    // a calm half minute, an interceptor (the opener), then the rock drifts in
    build: () => [evAt('interceptor', 30, { side: randSide(), opener: true }), evAt('rock', 60), evAt('spores', 95, { side: randSide() }), evAt('leeches', 135, { side: randSide() }), evAt('mother', 175, { side: randSide() }),
                  evAt('swarm', 215), evAt('coolant', 255, { radar: false }), evAt('grappler', 290, { side: randSide() })],
  },
  c7: {
    name: '7 · The Deep', tier: 3, campaign: 7, rewards: { money: 350, rep: 3, xp: 260 },
    crew: {events: [1, 1, 2, 8, 11, 15, 18, 23], cells: [2, 2, 2, 4, 6, 7, 7, 10], reactor: [1, 1, 1, 1, 0.7, 1, 1, 1], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 63% 77% 57% 63% 66% 64% 64% 63% idle for 1-8 players (aim 52.5% solo, 64.5% for 2-8); OUT OF SPEC: ×3 port cannon waits 136 s at 44 s; ×4 star cannon waits 21 s at 84 s
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    blurb: 'Fly into the deep beyond the Mire and get out alive.',
    briefing: 'The sample proves it: the spores are being herded. Something big lives in the deep beyond the Mire.\n\nFly in and survive. Out there the jump drive is fussy: align the three jump coils on the hull (spacewalk), and when it spools up, someone holds the jump handle at the helm.',
    build: (target) => shuffledTimeline(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'mines', 'spores', 'antenna', 'flare', 'storm', 'stealth', 'tractor', 'grappler', 'leeches'], target, 30, 18),
  },
  c8: {
    name: '8 · The Mother of All', tier: 4, campaign: 8, rewards: { money: 500, rep: 5, xp: 400 },
    crew: {events: [2, 2, 3, 3, 4, 9, 9, 14], cells: [2, 2, 2, 2, 2, 4, 4, 5], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 52% 73% 70% 76% 61% 63% 62% 63% idle for 1-8 players (aim 52.0% solo, 64.0% for 2-8); OUT OF SPEC: ×3 port cannon waits 72 s at 194 s; ×4 port cannon waits 72 s at 194 s
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    blurb: 'Sit next to the leviathan for five minutes. Survive.',
    briefing: 'Varga\'s theory: the swarms answer to one creature. To prove it, someone has to sit right next to it for five minutes and survive.\n\nThat someone is you. Everything out there will come for the ship at once. Good luck — and bring the cat.',
    build: (target) => [...shuffledTimeline(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'maintenance', 'mines', 'spores', 'debris', 'flare', 'storm', 'coolant', 'glitch', 'stealth', 'tractor', 'grappler', 'leeches', 'mother', 'pirates'], target, 30, 13), evAt('leviathan', 150)],
  },
  practice: {
    name: 'Practice', tier: 0, practice: true, rules: {}, objective: null,
    blurb: 'Free play: start any encounter, damage or mini-game from the practice panel.',
    briefing: 'No timeline, no jump: the ship is yours. The PRACTICE panel (top right, or P) starts anything, toggles the harder rules and clears up after you.',
    build: () => [],
  },
});
const SKIRMISH = ['intro', 'rush', 'ore', 'pirates', 'salvage', 'rescue', 'deep', 'nightmare'];
EVENT_SIDES.brig = randSide;
// The pirate base (js/dock.js dockStation): we dock once the patrol is gone (checked again every 2 s).
EVENT_RUNNERS.brig = (ev) => {
  if (combat.enemies.some(e => e.phase !== 'gone' && e.phase !== 'burning') || dk.dock) {
    if (!ev.waiting) combatBanner('The pirate base is in sight — deal with their patrol, then we dock.');
    Object.assign(ev, { done: false, t: mission.t + 2, waiting: true });
    return;
  }
  dockShip('base', ev.side);
};
EVENT_LABELS.brig = (ev) => `Pirate base — ${SIDE_NAME[ev.side]}`;
const npcName = () => mission.objective?.npc || 'the engineer';

// ---------------------------------------------------------------------------
// Simulation side: upgrades, kits, perks, results
// ---------------------------------------------------------------------------
function applyShipUpgrades(ship = {}) {
  const has = (id) => !!ship[id];
  SHOTS_PER_ENERGY = has('cannons') ? 4 : 3;
  SHIELD_UP_TIME = has('shields') ? 18 : 15;
  CAP_MAX = has('caps') ? 4 : 3;
  FIRE_TIME = has('sprinklers') ? 22 : 15;
  RADAR_RANGE = has('radar') ? 60 : 45;
  LOCK_CYCLE = has('airlocks') ? 0.7 : 1.3;
  COFFEE_REFILL = has('coffee') ? 20 : 60;
  MAX_DAMAGE = has('hull') ? 6 : 5;
}
// At mission start: the ship's one-off extras.
function shipStartExtras(ship = {}) {
  if (ship.spareCell) power.reserve += 1;
  power.inserter = ship.inserter ? { on: true, t: 0 } : null;
}
// perk(c, id): a profession id, or a piece of gear (profession gear only counts in its profession).
const perk = (c, id) => {
  if (c?.kit?.profession === id) return true;
  if (!c?.kit?.gear?.[id]) return false;
  const g = GEAR.find(g => g.id === id);
  return !g?.prof || g.prof === c.kit.profession;
};
const isPaint = (p) => typeof p === 'string' && /^#[0-9a-f]{6}$/i.test(p);
// A player's kit (gear, profession, paint) on their crew member; starting items from the profession.
function applyKit(c, kit) {
  c.kit = kit ? { gear: { ...(kit.gear || {}) }, profession: kit.profession || null, paint: isPaint(kit.paint) ? kit.paint : null } : { gear: {}, profession: null };
  if (c.kit.paint) c.color = c.kit.paint;
  c.armor = c.kit.gear.armor ? 1 : 0;
  if (perk(c, 'ownKit') && !c.inv.weapon) c.inv.weapon = 'repair';                     // (on top of the ship's own items)
  if (perk(c, 'heavy') && (!c.inv.weapon || c.inv.weapon === 'laser')) c.inv.weapon = 'heavy';
  else if (perk(c, 'ownLaser') && !c.inv.weapon) c.inv.weapon = 'laser';
}
// Speed multiplier from gear and what you carry (used by updateCrew).
function gearSpeed(c) {
  const carry = c.inv?.weapon === 'heavy' ? (c.charge > BLASTER_SLOW_AFTER ? BLASTER_CHARGE_SPEED : BLASTER_CARRY_SPEED) : 1;
  if (c.mode === 'eva') return (perk(c, 'thrusters') ? 1.3 : 1) * carry;
  if (c.mode === 'inside' && noGravAt(c.x, c.y) && perk(c, 'boots')) return 0.8 * carry;   // boots: still walking, a bit slower
  return (perk(c, 'boots') ? 1.15 : 1) * carry;
}
// Repairs: speed multiplier for this crew member.
const repairSpeed = (c) => (perk(c, 'engineer') ? 1.2 : 1) * (perk(c, 'toolbelt') ? 1.25 : 1);
// The inserter: an empty reactor gets the next cell from the crate, unless the cells are scooched away.
function updateInserter(dt) {
  const I = power.inserter;
  if (!I) return;
  if (!I.on || power.reactor.fuel > 0 || power.reserve <= 0 || broken(REACTOR)) { I.t = 0; return; }
  if ((I.t += dt) >= 2) { I.t = 0; power.reserve--; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); }
}
// What happened, for the rewards (each browser credits its own player).
function missionResults(jumped) {
  const obj = objectiveStatus();
  return {
    jumped, objective: !!obj.done && !!mission.objective, pirates: dk.defeated, kills: mission.kills || 0,
    crew: crew.map(c => ({ id: c.id, survived: jumped && (c.mode === 'gun' || c.mode === 'inside' && !inDock(c.x, c.y)) && standing(c) })),
  };
}
// A mission counts as a success (finished, unlocks the next chapter, earns reputation) only if the ship
// jumped out with the objective done; missions without an objective just need the jump.
const missionSuccess = (id, results) => !!results?.jumped && (!!results.objective || !MISSIONS[id]?.objective);
// Rewards for one player from a mission's results. Jumped out = the crew gets paid (base + per pirate)
// and XP for whoever is aboard and on their feet, objective or not; reputation only for a success.
function computeRewards(id, results, survived, firstClear) {
  const M = MISSIONS[id] || {}, R = M.rewards || { money: 40, rep: 0, xp: 50 };
  if (!results.jumped) return { xp: 0, money: 0, rep: 0 };
  const money = (R.money || 0) + (R.perPirate || 0) * (results.pirates || 0);
  const rep = missionSuccess(id, results) ? (R.rep || 0) + (firstClear ? 1 : 0) : 0;
  const xp = survived ? (R.xp || 50) : 0;
  return { xp, money, rep };
}

// The inserter: an arm from the fuel crate to the reactor's slot (and a handle to scooch the cells).
function drawInserter(t) {
  const I = power.inserter;
  if (!I) return;
  if (sprReady('systems/inserter_arm', 'systems/inserter_handle')) {   // sprites (js/decor.js spr), both with their origin at FUEL_CRATE
    spr('systems/inserter_arm', I.t > 0 ? clamp(Math.floor(I.t / 2 * 6), 0, 5) : 0, FUEL_CRATE.x, FUEL_CRATE.y, 0, { sortY: FUEL_CRATE.y - 0.3 });
    spr('systems/inserter_handle', I.on ? 0 : 1, FUEL_CRATE.x, FUEL_CRATE.y, 0, { sortY: FUEL_CRATE.y, emissive: 0.6 });
    ctx.fillStyle = 'rgba(232,236,244,0.8)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(I.on ? 'AUTO' : 'OFF', L(FUEL_CRATE.x - 0.8), L(FUEL_CRATE.y) + 12); ctx.textAlign = 'left';
    return;
  }
  const x0 = L(FUEL_CRATE.x + 0.4), y0 = L(FUEL_CRATE.y - 0.4), x1 = L(REACTOR.x - REACTOR.w / 2 + 0.3), y1 = L(REACTOR.y + 0.2), k = I.t / 2;
  const ex = lerp(x0, x1, 0.5 + 0.5 * Math.sin(k * Math.PI)), ey = lerp(y0, y1, 0.5) - L(0.6);
  ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = '#e8c34f'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(ex, ey, 6, 0, TAU); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.5);
  const hx = L(FUEL_CRATE.x - 0.8), hy = L(FUEL_CRATE.y);          // the scooch handle
  rr(hx - 7, hy - 10, 14, 20, 4); ctx.fillStyle = I.on ? '#5fd6a0' : '#e2574c'; ctx.fill(); stroke(1.5);
  ctx.fillStyle = 'rgba(232,236,244,0.8)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(I.on ? 'AUTO' : 'OFF', hx, hy + 12); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser side: the profile
// ---------------------------------------------------------------------------
const PROFILE_KEY = 'mn-profile';
function defaultProfile() {
  return { v: PROFILE_VERSION, xp: 0, money: 0, rep: 0, done: {}, ship: {}, gear: {}, profession: null, paint: null, lastRun: null };
}
// Reads any older version; unknown fields are kept, missing ones get defaults.
function migrateProfile(p) {
  if (!p || typeof p !== 'object') return defaultProfile();
  const out = { ...defaultProfile(), ...p };
  for (const k of ['done', 'ship', 'gear']) out[k] = { ...(p[k] && typeof p[k] === 'object' ? p[k] : {}) };
  out.xp = +out.xp || 0; out.money = +out.money || 0; out.rep = +out.rep || 0;
  if (!(p.v >= 2)) {                       // v2: suit paint is free (lobby), auto-doc and second kit are gone, Security → Weapons specialist
    delete out.gear.paint; delete out.ship.autodoc; delete out.ship.kit2;
    if (out.profession === 'security') out.profession = 'weapons';
  }
  if (!(p.v >= 3)) {                       // v3: Gunner merged into Weapons specialist; the medic is gear now (first aid course)
    if (out.profession === 'gunner') out.profession = 'weapons';
    if (out.profession === 'medic') { out.profession = null; out.gear.firstAid = true; }
    delete out.gear.trauma; delete out.gear.painkillers;
  }
  out.v = PROFILE_VERSION;
  return out;
}
function readCookie(name) {
  try { const m = document.cookie.split('; ').find(s => s.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; } catch (e) { return null; }
}
function loadProfile() {
  let raw = readCookie(PROFILE_KEY);
  if (!raw) { try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) { /* none */ } }   // (file:// pages can't keep cookies)
  try { return migrateProfile(raw ? JSON.parse(raw) : null); } catch (e) { return defaultProfile(); }
}
function saveProfile(p) {
  const s = JSON.stringify(p);
  try { document.cookie = `${PROFILE_KEY}=${encodeURIComponent(s)}; max-age=${60 * 60 * 24 * 3650}; path=/; SameSite=Lax`; } catch (e) { /* none */ }
  try { localStorage.setItem(PROFILE_KEY, s); } catch (e) { /* none */ }
}
let profile = typeof document !== 'undefined' && document.cookie !== undefined ? loadProfile() : defaultProfile();
const profileKit = () => ({ gear: profile.gear, profession: profile.profession, paint: profile.paint });
const unlockedMissions = (p = profile) => {
  const out = new Set(['practice', 'intro', 'rush', 'c1']);
  CAMPAIGN.forEach((id, i) => { if (p.done[id]) { out.add(id); if (CAMPAIGN[i + 1]) out.add(CAMPAIGN[i + 1]); } });
  if (p.done.c3) ['salvage', 'ore'].forEach(id => out.add(id));
  if (p.done.c4) out.add('pirates');
  if (p.done.c5) out.add('rescue');
  if (p.done.c6) out.add('deep');
  if (p.done.c7) out.add('nightmare');
  return out;
};

// After a mission (once per run): credit this player.
let lastReward = null;
function creditMission() {
  const o = mission.over;
  if (!o || !o.results || !mission.runId || profile.lastRun === mission.runId || mission.id === 'practice') return;
  const mine = o.results.crew.find(c => c.id === me.id);
  const ok = missionSuccess(mission.id, o.results), first = ok && !profile.done[mission.id];
  const r = computeRewards(mission.id, o.results, !!mine?.survived, first);
  const lv0 = levelOf(profile.xp);
  profile.xp += r.xp; profile.money += r.money; profile.rep += r.rep;
  if (ok) profile.done[mission.id] = (profile.done[mission.id] || 0) + 1;     // done = completed (objective included)
  profile.lastRun = mission.runId;
  saveProfile(profile);
  const next = CAMPAIGN[CAMPAIGN.indexOf(mission.id) + 1], nextName = next && CAMPAIGN.includes(mission.id) ? MISSIONS[next].name : null;
  lastReward = { ...r, survived: !!mine?.survived, levelUp: levelOf(profile.xp) > lv0 ? levelOf(profile.xp) : 0, unlocked: first ? nextName : null,
    objFailed: !!o.results.jumped && !ok, locked: !ok && !profile.done[mission.id] && nextName && !unlockedMissions().has(next) ? nextName : null };
}
// The rewards block on the end screen.
function drawRewards(cx, y) {
  if (!lastReward || mission.id === 'practice') return;
  const r = lastReward;
  ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ffe08a';
  const xpText = `+${r.xp} XP${r.survived ? '' : ' (you didn\'t make it back aboard on your feet)'}`;
  ctx.fillText(r.objFailed ? `Paid $${r.money}  ·  ${xpText}  ·  no reputation` : `${xpText}  ·  +$${r.money}  ·  +${r.rep} reputation`, cx, y);
  let dy = 26;
  if (r.levelUp) { ctx.fillStyle = '#7af0b0'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText(`LEVEL UP — level ${r.levelUp}!${r.levelUp === 2 ? ' Pick a profession in the locker.' : ''}`, cx, y + dy); dy += 24; }
  if (r.unlocked) { ctx.fillStyle = '#9cd8ff'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(`Unlocked: ${r.unlocked}`, cx, y + dy); }
  else if (r.objFailed) { ctx.fillStyle = '#ffb0a0'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(r.locked ? `Not completed: ${r.locked} stays locked until you complete the objective.` : 'Objective failed: this run doesn\'t count as completed.', cx, y + dy); }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser side: lobby, locker, shipyard (DOM)
// ---------------------------------------------------------------------------
// One Locker / Shipyard choice, in one of three states that read at a glance: owned (latched in, green
// LED, "OWNED"), available (price on a bright tag) or locked (dark, padlock, and why: what unlocks it).
const shopItem = (data, name, desc, { own, ownTag = 'OWNED', price = '', why = '' }) => {
  const state = own ? 'chosen' : why ? 'locked' : 'avail';
  const tag = own ? `<em class="tag own">✔ ${ownTag}</em>` : price ? `<em class="tag price">${price}</em>` : '';
  return `<button class="item ${state}" ${data} ${own || why ? 'disabled' : ''}${why ? ` title="Locked: ${escapeHtml(why)}"` : ''}>`
    + `<b>${name}${tag}</b><span>${desc}</span>${why ? `<i class="why"><i class="padlock" aria-hidden="true"></i>${escapeHtml(why)}</i>` : ''}</button>`;
};
const lobbyUI = {
  union: null, onPick: null, onProfile: null,
  el: (id) => document.getElementById(id),
  init(onPick, onProfile) {
    this.onPick = onPick; this.onProfile = onProfile;
    this.el('lobby-locker').onclick = () => this.shop('locker');
    this.el('lobby-shipyard').onclick = () => this.shop('shipyard');
    this.el('shop-close').onclick = () => { this.el('shop').hidden = true; };
  },
  available() { const u = unlockedMissions(); if (this.union) for (const id of this.union) u.add(id); return u; },
  render(chosen) {
    if (chosen) this.chosen = chosen;
    const p = profile, lv = levelOf(p.xp), next = XP_LEVELS[lv] ?? null, prev = XP_LEVELS[lv - 1] || 0;
    this.el('lobby-profile').innerHTML = `<b>Level ${lv}</b>${p.profession ? ` · ${PROFESSIONS.find(x => x.id === p.profession)?.name}` : ''}
      <span class="bar"><i style="width:${next ? Math.round((p.xp - prev) / (next - prev) * 100) : 100}%"></i></span>
      <span>${p.xp} XP</span><span>$${p.money}</span><span>★ ${p.rep} reputation</span>`;
    const paint = this.el('lobby-paint');                    // suit color: free, saved in the profile
    if (paint) {
      paint.innerHTML = PAINTS.map(c => `<button class="paint${p.paint === c ? ' chosen' : ''}" data-paint="${c}" style="background:${c}; --c:${c}" title="Suit color"></button>`).join('');
      paint.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { p.paint = p.paint === b.dataset.paint ? null : b.dataset.paint; saveProfile(p); this.render(); this.onProfile?.(); });
    }
    // One list: only what's unlocked (for you or anyone in the game), so future chapters don't spoil the story.
    const avail = this.available(), list = this.el('lobby-missions'), scroll = list.scrollTop;
    list.innerHTML = '';
    for (const [title, ids] of [['Campaign', CAMPAIGN], ['Skirmish', SKIRMISH], ['Practice', ['practice']]]) {
      const open = ids.filter(id => MISSIONS[id] && avail.has(id));
      if (!open.length) continue;
      const h = document.createElement('div'); h.className = 'mission-group'; h.textContent = title; list.appendChild(h);
      for (const id of open) {
        const m = MISSIONS[id], b = document.createElement('button');
        b.className = 'mission' + (id === this.chosen ? ' chosen' : ''); b.dataset.id = id;
        b.innerHTML = `<b>${m.name}${m.tier ? ` <em>${'★'.repeat(m.tier)}</em>` : ''}${p.done[id] ? ' <em class="done">✔</em>' : ''}</b><span>${m.blurb}</span>`;
        b.onclick = () => { this.chosen = id; this.onPick(id); this.render(); };
        list.appendChild(b);
      }
      if (open.length < ids.length) { const n = document.createElement('div'); n.className = 'mission-more'; n.textContent = title === 'Campaign' ? 'More chapters unlock as you go.' : 'More unlock as you go.'; list.appendChild(n); }
    }
    list.scrollTop = scroll;
    list.querySelector('.mission.chosen')?.scrollIntoView?.({ block: 'nearest' });
    const m = MISSIONS[this.chosen];
    if (m) {
      const R = m.rewards, obj = m.objective;
      const objText = !obj ? 'Survive until the jump.' : obj.kind === 'pirates' ? `Defeat ${obj.count} pirates.` : obj.kind === 'intruder' ? (obj.count === 2 ? 'Kill both intruders.' : obj.count > 1 ? `Kill all ${obj.count} intruders.` : 'Kill the intruder.') : obj.kind === 'blackbox' ? 'Bring the black box aboard.' : obj.kind === 'rescue' ? `Rescue ${obj.npc || 'the engineer'}.` : obj.kind === 'ore' ? 'Drill an ore sample and bring it aboard.' : '';
      this.el('lobby-brief').innerHTML = `<h3>${m.name}</h3>${(m.briefing || m.blurb).split('\n\n').map(s => `<p>${escapeHtml(s)}</p>`).join('')}
        <p class="note">♪ ${music.songOf(this.chosen)}</p>
        ${missionRequirements(this.chosen).map(t => `<p class="obj">⚠ ${escapeHtml(t)}</p>`).join('')}
        ${m.practice ? '' : `<p class="obj"><b>Objective:</b> ${objText}${R ? ` <b>Pay:</b> $${R.money}${R.perPirate ? ` + $${R.perPirate} per pirate` : ''} · ★${R.rep}${obj ? ' (only with the objective)' : ''} · ${R.xp} XP (only if you're aboard and on your feet at the jump)` : ''}</p>`}`;
    }
  },
  shop(kind) {
    const p = profile, lv = levelOf(p.xp), box = this.el('shop-body');
    this.el('shop-title').textContent = kind === 'locker' ? `LOCKER — $${p.money} · level ${lv}` : `SHIPYARD — ★ ${p.rep} reputation`;
    let html = '';
    if (kind === 'locker') {
      html += `<h4>Profession${lv < 2 ? ' (from level 2)' : ''}</h4><div class="grid">` + PROFESSIONS.map(x => shopItem(`data-prof="${x.id}"`, x.name, x.desc,
        { own: p.profession === x.id, ownTag: 'YOURS', why: lv < 2 ? 'Unlocks at level 2' : '' })).join('') + '</div>';
      const gearButtons = (list) => '<div class="grid">' + list.map(g => {
        const pr = g.prof && PROFESSIONS.find(x => x.id === g.prof);
        const why = pr && p.profession !== g.prof ? `${pr.name}s only${lv < 2 ? ' · profession from level 2' : ' · pick the profession above'}`
          : lv < g.level ? `Unlocks at level ${g.level} (you: ${lv})` : p.money < g.cost ? `Need $${g.cost - p.money} more` : '';
        return shopItem(`data-gear="${g.id}"`, g.name, g.desc, { own: p.gear[g.id], price: `$${g.cost}`, why }); }).join('') + '</div>';
      html += '<h4>General</h4>' + gearButtons(GEAR.filter(g => !g.prof));
      for (const x of PROFESSIONS) {
        const track = GEAR.filter(g => g.prof === x.id);
        if (track.length) html += `<h4>${x.name} track${p.profession === x.id ? '' : ' (only as ' + x.name.toLowerCase() + ')'}</h4>` + gearButtons(track);
      }
    } else {
      html += '<div class="grid">' + SHIP_UPGRADES.map(u => shopItem(`data-ship="${u.id}"`, u.name, u.desc,
        { own: p.ship[u.id], price: `★${u.rep}`, why: p.rep < u.rep ? `Need ★${u.rep - p.rep} more reputation (missions)` : '' })).join('') + '</div>';
      html += '<p class="note">In multiplayer, the ship gets every upgrade anyone in the crew has bought.</p>';
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-prof]').forEach(b => b.onclick = () => { p.profession = b.dataset.prof; this.saved(kind); });
    box.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { const g = GEAR.find(x => x.id === b.dataset.gear); if (p.money >= g.cost) { p.money -= g.cost; p.gear[g.id] = true; this.saved(kind); } });
    box.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { const u = SHIP_UPGRADES.find(x => x.id === b.dataset.ship); if (p.rep >= u.rep) { p.rep -= u.rep; p.ship[u.id] = true; this.saved(kind); } });
    this.el('shop').hidden = false;
  },
  saved(kind) { saveProfile(profile); this.shop(kind); this.render(); this.onProfile?.(); },
};
